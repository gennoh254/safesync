import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

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

  // Single SW registration shared across all consumers
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);
  // Promise that resolves once SW is ready — lets subscribe() await it
  const swReadyRef = useRef<Promise<ServiceWorkerRegistration> | null>(null);

  useEffect(() => {
    if (!isSupported) return;

    const swPromise = (async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
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

  // Listen for permission changes (Firefox fires this; Chrome requires explicit check)
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
    if (!VAPID_PUBLIC_KEY) {
      setErrorMessage('Push configuration error (VAPID key missing). Contact support.');
      console.error('[Push] VITE_VAPID_PUBLIC_KEY is not set');
      return false;
    }

    setSubscribing(true);
    setErrorMessage(null);

    try {
      // Wait for SW to be ready (handles the case where user clicks before async init finishes)
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

      // Request notification permission
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

      // Subscribe to Web Push
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      // Persist subscription to Supabase
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
      // DOMException from pushManager.subscribe when user dismissed the prompt
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
