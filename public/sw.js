// Service worker: shows commute alerts sent by the server, and opens the journey when one is tapped.

self.addEventListener("push", (event) => {
  const alert = event.data ? event.data.json() : { title: "Commute update", body: "", url: "/" };
  event.waitUntil(
    self.registration.showNotification(alert.title, {
      body: alert.body,
      icon: "/icons/192",
      badge: "/icons/192",
      data: { url: alert.url },
      tag: "commute",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.navigate(url).then((w) => w?.focus());
      return self.clients.openWindow(url);
    }),
  );
});
