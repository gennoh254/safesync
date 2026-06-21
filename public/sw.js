/* SafeSync Emergency Alert Service Worker */

const CACHE_NAME = 'safesync-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming push notifications
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Emergency Alert', body: 'You have an incoming emergency alert.' };
  }

  const title = data.title || 'EMERGENCY ALERT';
  const options = {
    body: data.body || 'Tap to respond to the emergency.',
    icon: data.emergencyType === 'FIRE' ? 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23f97316"><path d="M12 23c-3.866 0-7-3.134-7-7 0-2.857 1.667-5.333 4-6.536V7c0-2.76 2.24-5 5-5s5 2.24 5 5v2.464c2.333 1.203 4 3.679 4 6.536 0 3.866-3.134 7-7 7z"/></svg>' : data.emergencyType === 'MEDICAL' ? 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ef4444"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>' : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23a855f7"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23dc2626"><circle cx="12" cy="12" r="10"/></svg>',
    tag: `alert-${data.alertId || 'unknown'}`,
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 150, 300, 150, 600, 150, 300],
    data: {
      alertId: data.alertId,
      emergencyType: data.emergencyType,
      location: data.location,
      latitude: data.latitude,
      longitude: data.longitude,
      clientId: data.clientId,
      createdAt: data.createdAt,
      url: self.location.origin,
    },
    actions: [
      { action: 'accept', title: 'Accept & Respond' },
      { action: 'decline', title: 'Decline' },
    ],
  };

  event.waitUntil(
    Promise.all([
      // Show system notification (works even when tab is closed)
      self.registration.showNotification(title, options),

      // Post message to ALL open tabs so the overlay fires immediately
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        const msg = {
          type: 'INCOMING_ALERT',
          alertId: data.alertId,
          emergencyType: data.emergencyType,
          location: data.location,
          latitude: data.latitude,
          longitude: data.longitude,
          clientId: data.clientId,
          createdAt: data.createdAt,
        };
        clients.forEach((client) => client.postMessage(msg));
      }),
    ])
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const alertData = event.notification.data || {};
  const targetUrl = alertData.url || self.location.origin;

  if (event.action === 'decline') {
    // Post decline message to any open tab
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        if (clients.length > 0) {
          clients[0].postMessage({ type: 'DECLINE_ALERT', alertId: alertData.alertId });
          clients[0].focus();
        } else {
          self.clients.openWindow(targetUrl);
        }
      })
    );
    return;
  }

  // Accept action or plain tap — focus/open the app
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Re-post the incoming alert so the open tab can show the overlay
      const msg = {
        type: 'INCOMING_ALERT',
        alertId: alertData.alertId,
        emergencyType: alertData.emergencyType,
        location: alertData.location,
        latitude: alertData.latitude,
        longitude: alertData.longitude,
        clientId: alertData.clientId,
        createdAt: alertData.createdAt,
      };

      if (clients.length > 0) {
        clients[0].postMessage(msg);
        return clients[0].focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
