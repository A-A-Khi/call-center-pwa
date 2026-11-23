/* Extra notification handlers for the PWA service worker */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(
    (event.notification.data && event.notification.data.url) || "./doctor.html",
    self.registration.scope
  ).href;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        if ("focus" in client) {
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // ignore navigate failures and still focus
            }
          }
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })()
  );
});
