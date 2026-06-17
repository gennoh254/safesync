/* SafeSync Emergency Alert Service Worker */

self.addEventListener('install', () => {
  self.skipWaiting();
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
    icon: '/icon-192.png',
    badge: '/icon-192.png',
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
