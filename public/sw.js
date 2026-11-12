// Torre 3D: guarda la app en la tablet o la compu para que abra sin internet.
// La página: primero la red (para traer la última versión) y, si no hay conexión, la copia guardada.
// Los archivos con nombre de versión (assets/…): primero la copia guardada.
const CACHE = 'torre3d-v1';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './manifest.webmanifest', './icono-192.png', './icono-512.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (r.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('.html')) {
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); return res; })
      .catch(() => caches.match(r).then(x => x || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(r).then(x => x || fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); } return res; })));
});
