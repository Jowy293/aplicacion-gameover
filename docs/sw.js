// Service worker: caché básica de la app + notificaciones push.
// Las notificaciones las muestra SIEMPRE este archivo (con la app abierta o cerrada, en Android y en iPhone),
// sin depender de la librería de Firebase en segundo plano.

const CACHE = "gofc-v18";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./firebase-config.js",
  "./manifest.json", "./icons/logo.png?v=3", "./icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE && k !== "gofc-fonts").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Fuentes de Google: caché primero (cargan al instante y no hacen saltar el texto)
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === "GET" && /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open("gofc-fonts").then((c) => c.match(e.request).then((hit) => hit ||
      fetch(e.request).then((r) => { c.put(e.request, r.clone()); return r; }))));
  }
});
// Red primero, caché si no hay conexión (solo archivos propios)
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});

function parsePush(e) {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (_) { try { p = { notification: { body: e.data.text() } }; } catch (__) {} }
  const d = p.data || {};
  const n = p.notification || {};
  return {
    title: d.title || n.title || "Game Over FC",
    body: d.body || n.body || "",
    link: d.link || (p.fcmOptions && p.fcmOptions.link) || n.click_action || self.registration.scope,
    tag: d.tag || p.fcmMessageId || String(Date.now()),
  };
}
self.addEventListener("push", (e) => {
  const m = parsePush(e);
  const icon = new URL("icons/icon-192.png", self.registration.scope).href;
  e.waitUntil(self.registration.showNotification(m.title, {
    body: m.body, icon, badge: new URL("icons/icon-96.png", self.registration.scope).href,
    tag: m.tag, renotify: true, vibrate: [120, 60, 120], data: { link: m.link },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || self.registration.scope;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope) && "focus" in c) {
        if ("navigate" in c && link !== self.registration.scope) c.navigate(link).catch(() => {});
        return c.focus();
      }
    }
    return clients.openWindow(link);
  }));
});
