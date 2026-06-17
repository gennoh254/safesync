import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

export type PushPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [loading, setLoading] = useState(true);

  const isSupported = typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  useEffect(() => {
    if (!isSupported) {
      setPermission('unsupported');
      setLoading(false);
      return;
    }

    const init = async () => {
      try {
        // Register service worker
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        setSwRegistration(reg);

        // Check existing permission
        setPermission(Notification.permission as PushPermissionState);

        // Check if already subscribed
        const existingSub = await reg.pushManager.getSubscription();
        setIsSubscribed(!!existingSub);
      } catch (err) {
        console.error('SW registration failed:', err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !swRegistration) return false;
    if (!VAPID_PUBLIC_KEY) {
      console.error('VITE_VAPID_PUBLIC_KEY not set');
      return false;
    }

    try {
      // Request notification permission
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermissionState);
      if (perm !== 'granted') return false;

      // Subscribe to push
      const reg = swRegistration;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      // Save subscription to Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const subJson = sub.toJSON();
      const p256dh = subJson.keys?.p256dh;
      const auth = subJson.keys?.auth;

      if (!p256dh || !auth) {
        console.error('Push subscription missing keys');
        return false;
      }

      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint: sub.endpoint,
          p256dh,
          auth,
        }, { onConflict: 'user_id,endpoint' });

      if (error) {
        console.error('Failed to save push subscription:', error);
        return false;
      }

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('Failed to subscribe to push:', err);
      return false;
    }
  }, [isSupported, swRegistration]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !swRegistration) return false;
    try {
      const sub = await swRegistration.pushManager.getSubscription();
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
      console.error('Failed to unsubscribe:', err);
      return false;
    }
  }, [isSupported, swRegistration]);

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    swRegistration,
    subscribe,
    unsubscribe,
  };
}
