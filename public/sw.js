// AuraBook · Service worker de avisos push. Solo muestra notificaciones: no guarda en caché ni intercepta peticiones.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "AuraBook";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "Tienes una novedad en tu agenda.",
    icon: "/brand/aurabook-icono-192.png",
    badge: "/brand/aurabook-icono-192.png",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/dashboard" },
  }));
});

// Al tocar el aviso: enfoca una pestaña de AuraBook abierta o abre el panel.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && "focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
