// Service worker: caché básica de la app + notificaciones push (Firebase Cloud Messaging)
importScripts("./firebase-config.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

const CACHE = "gofc-v13";
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

try {
  firebase.initializeApp(self.FIREBASE_CONFIG);
  firebase.messaging(); // muestra automáticamente las notificaciones en segundo plano
} catch (err) { /* config sin rellenar */ }
// Al pulsar la notificación, Firebase abre la app (enlace fcm_options.link enviado por el servidor).
