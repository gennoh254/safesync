import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

// VAPID public key is safe to embed in client code; it is sent to the browser anyway.
const VAPID_PUBLIC_KEY = 'BK3jmyOoQ_4QYamsN3QouCGJUFmNFYCoqAolV-suSEoDE1SMGX3AoEUg3u6PwRokbVXT8MeYSCKS7bUJvvzsgWI';

export type PushPermission = 'unsupported' | 'default' | 'granted' | 'denied' | 'loading';

interface PushNotificationContextValue {
  isSupported: boolean;
  permission: PushPermission;
  isSubscribed: boolean;
  subscribing: boolean;
  errorMessage: string | null;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
}

const PushNotificationContext = createContext<PushNotificationContextValue>({
  isSupported: false,
  permission: 'loading',
  isSubscribed: false,
  subscribing: false,
  errorMessage: null,
  subscribe: async () => false,
  unsubscribe: async () => false,
});

export function usePushNotifications() {
  return useContext(PushNotificationContext);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

export function PushNotificationProvider({ children }: { children: ReactNode }) {
  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const [permission, setPermission] = useState<PushPermission>(isSupported ? 'loading' : 'unsupported');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);
  const swReadyRef = useRef<Promise<ServiceWorkerRegistration> | null>(null);

  useEffect(() => {
    if (!isSupported) return;

    const swPromise = (async () => {
      try {
        // Check if there's already a registration
        let reg = await navigator.serviceWorker.getRegistration('/');

        if (!reg) {
          // Register the service worker
          reg = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            type: 'classic'
          });
          console.log('[Push] Service worker registered:', reg.scope);
        } else {
          console.log('[Push] Service worker already registered:', reg.scope);
        }

        // Wait for the service worker to be ready
        await navigator.serviceWorker.ready;

        swRegRef.current = reg;
        setPermission(Notification.permission as PushPermission);
        const existing = await reg.pushManager.getSubscription();
        setIsSubscribed(!!existing);
        return reg;
      } catch (err) {
        console.error('[Push] SW registration failed:', err);
        setPermission('unsupported');
        throw err;
      }
    })();

    swReadyRef.current = swPromise;
  }, [isSupported]);

  useEffect(() => {
    if (!isSupported || !('permissions' in navigator)) return;
    navigator.permissions.query({ name: 'notifications' as PermissionName }).then((status) => {
      const update = () => setPermission(status.state as PushPermission);
      status.addEventListener('change', update);
      return () => status.removeEventListener('change', update);
    }).catch(() => {});
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setErrorMessage('Push notifications are not supported in this browser.');
      return false;
    }
    if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY === 'undefined') {
      setErrorMessage('Push configuration error (VAPID key missing). Please reload the page.');
      console.error('[Push] VAPID_PUBLIC_KEY is not available');
      return false;
    }

    setSubscribing(true);
    setErrorMessage(null);

    try {
      let reg = swRegRef.current;
      if (!reg && swReadyRef.current) {
        try {
          reg = await swReadyRef.current;
        } catch {
          setErrorMessage('Service worker failed to load. Try reloading the page.');
          return false;
        }
      }
      if (!reg) {
        setErrorMessage('Service worker not ready. Please reload the page and try again.');
        return false;
      }

      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);

      if (perm === 'denied') {
        setErrorMessage('Notifications were blocked. Open browser settings → Notifications → allow this site.');
        return false;
      }
      if (perm !== 'granted') {
        setErrorMessage('Notification permission not granted.');
        return false;
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setErrorMessage('You must be logged in to enable notifications.');
        return false;
      }

      const subJson = sub.toJSON();
      const p256dh = subJson.keys?.p256dh;
      const auth = subJson.keys?.auth;

      if (!p256dh || !auth) {
        setErrorMessage('Browser returned an incomplete push subscription. Try a different browser.');
        return false;
      }

      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          { user_id: user.id, endpoint: sub.endpoint, p256dh, auth },
          { onConflict: 'user_id,endpoint' }
        );

      if (error) {
        console.error('[Push] DB upsert error:', error);
        setErrorMessage('Failed to save notification settings. Please try again.');
        return false;
      }

      setIsSubscribed(true);
      setErrorMessage(null);
      return true;
    } catch (err: any) {
      console.error('[Push] subscribe error:', err);
      if (err?.name === 'NotAllowedError') {
        setErrorMessage('Notifications were dismissed. Please try again and tap "Allow".');
      } else {
        setErrorMessage('Failed to enable notifications: ' + (err?.message || String(err)));
      }
      return false;
    } finally {
      setSubscribing(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setSubscribing(true);
    try {
      const reg = swRegRef.current ?? await swReadyRef.current;
      if (!reg) return false;

      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', user.id)
            .eq('endpoint', endpoint);
        }
      }
      setIsSubscribed(false);
      return true;
    } catch (err) {
      console.error('[Push] unsubscribe error:', err);
      return false;
    } finally {
      setSubscribing(false);
    }
  }, [isSupported]);

  return (
    <PushNotificationContext.Provider value={{
      isSupported,
      permission,
      isSubscribed,
      subscribing,
      errorMessage,
      subscribe,
      unsubscribe,
    }}>
      {children}
    </PushNotificationContext.Provider>
  );
}
