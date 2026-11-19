/* Service worker · Mesa de Ayuda SENA v2.0
   - Cascarón de la app: precaché + stale-while-revalidate (RF-PWA-02/03)
   - Lecturas de casos: network-first con respaldo en caché; nunca autenticación ni datos sensibles
   - Push y Background Sync (RF-PWA-04/05) */
const VERSION = "v2.0.9";
const SHELL = `mesa-shell-${VERSION}`;
const API = `mesa-api-${VERSION}`;
const PRECACHE = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/css/styles.css",
  "/js/main.js",
  "/js/api.js",
  "/js/ui.js",
  "/js/theme.js",
  "/js/theme-init.js",
  "/js/pwa.js",
  "/js/illustrations.js",
  "/js/bot.js",
  "/js/views/login.js",
  "/js/views/inicio.js",
  "/js/views/casos.js",
  "/js/views/caso-detalle.js",
  "/js/views/caso-nuevo.js",
  "/js/views/admin.js",
  "/js/views/cuenta.js",
  "/js/views/activar.js",
  "/js/views/dashboard.js",
  "/js/graficas.js",
  "/js/centros-ui.js",
  "/js/views/centros.js",
  "/js/views/legal.js",
  "/js/views/seguridad.js",
  "/js/captcha.js",
  "/js/captcha-worker.js",
  "/js/views/ayuda.js",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];
// Únicas lecturas de API que se guardan para uso sin conexión (se borran al cerrar sesión).
const API_CACHEABLE = [/^\/api\/casos\/mis-casos/, /^\/api\/casos\/asignados/, /^\/api\/casos\/\d+$/];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (![SHELL, API].includes(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (e) => {
  if (e.data?.tipo === "SKIP_WAITING") self.skipWaiting();
  if (e.data?.tipo === "LIMPIAR_CACHE_API") e.waitUntil(caches.delete(API));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    if (!API_CACHEABLE.some((re) => re.test(url.pathname))) return; // todo lo demás va directo a la red
    e.respondWith(
      (async () => {
        try {
          const r = await fetch(req);
          if (r.ok) (await caches.open(API)).put(url.pathname + url.search, r.clone());
          return r;
        } catch {
          const c = await (await caches.open(API)).match(url.pathname + url.search);
          return (
            c ??
            new Response(JSON.stringify({ success: false, message: "Sin conexión" }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
      })(),
    );
    return;
  }

  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          return (await caches.match("/index.html")) ?? (await caches.match("/offline.html"));
        }
      })(),
    );
    return;
  }

  // Estáticos: stale-while-revalidate
  e.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(req);
      const red = fetch(req)
        .then((r) => {
          if (r.ok) cache.put(req, r.clone());
          return r;
        })
        .catch(() => null);
      return hit ?? (await red) ?? (await caches.match("/offline.html"));
    })(),
  );
});

self.addEventListener("sync", (e) => {
  if (e.tag === "enviar-cola") {
    // El envío necesita el token de la sesión, que vive en la página: se le pide que vacíe la cola.
    e.waitUntil(
      self.clients.matchAll({ type: "window" }).then((cs) => {
        for (const c of cs) c.postMessage({ tipo: "VACIAR_COLA" });
      }),
    );
  }
});

self.addEventListener("push", (e) => {
  let d = { titulo: "Mesa de Ayuda", mensaje: "Tienes una novedad", url: "/#/notificaciones" };
  try {
    d = { ...d, ...e.data.json() };
  } catch {
    /* payload no JSON */
  }
  e.waitUntil(
    self.registration.showNotification(d.titulo, {
      body: d.mensaje,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: d.url },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url ?? "/", self.location.origin).href;
  e.waitUntil(
    (async () => {
      const cs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const abierta = cs.find((c) => c.url.startsWith(self.location.origin));
      if (abierta) {
        await abierta.focus();
        abierta.navigate?.(destino);
      } else await self.clients.openWindow(destino);
    })(),
  );
});
