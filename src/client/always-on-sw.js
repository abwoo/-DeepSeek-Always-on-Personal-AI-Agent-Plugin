self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification('DeepSeek Always-on', {
      body: 'A task has an update. Open your inbox.',
      tag: 'always-on-update',
      data: { url: '/?alwaysOnInbox=1' },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.navigate('/?alwaysOnInbox=1');
          return client.focus();
        }
      }
      return clients.openWindow('/?alwaysOnInbox=1');
    })(),
  );
});
