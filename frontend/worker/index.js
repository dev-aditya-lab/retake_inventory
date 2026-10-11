// Custom service-worker code. next-pwa compiles this folder and merges it into
// the generated sw.js, so it runs alongside the offline caching, not instead of it.
//
// The server (backend/src/services/push.service.ts) sends a JSON payload:
//   { title, body, url, tag }

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Retake";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    // Same tag = one notification per chat; a new message replaces the previous one.
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    data: { url: payload.url || "/whatsapp" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      // Reuse an open window of the app (this is what keeps it from piling up tabs).
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch {
              // Some browsers refuse to navigate a window we don't control; fall through to focus.
            }
          }
          return client.focus();
        }
      }

      return self.clients.openWindow(target);
    })(),
  );
});
