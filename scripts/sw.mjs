/**
 * Service worker de Torre 3D, armado en cada build (hallazgo 4 del informe técnico, docs/informes/analisis-tecnico-torre-3d.html).
 *
 *  - Precaché completo: al instalarse guarda TODOS los archivos que la app necesita (HTML, JS, CSS, fuentes, imágenes,
 *    planillas, los módulos que se cargan después como el PDF y el PowerPoint). Si falta uno, la instalación falla
 *    entera y se reintenta en la próxima visita: nunca queda una copia a medias.
 *  - Caché con nombre propio: «torre3d:<carpeta del sitio>:<versión>». En GitHub Pages todos los proyectos de un mismo
 *    usuario comparten el origen (usuario.github.io) y el almacenamiento; al actualizarse, solo se borran las versiones
 *    anteriores de ESTA app en ESTA carpeta. Las cachés de otros sitios no se tocan.
 *  - La página: primero la red (para traer la última versión) y, sin conexión, la copia guardada.
 *  - El resto: primero la copia guardada (los nombres llevan la versión), si no la red.
 */
export function armarSW(version, archivos) {
  return `// Torre 3D: copia para usar sin internet. Archivo generado por scripts/sw.mjs en el build: no editar a mano.
const VERSION = ${JSON.stringify(version)};
const ARCHIVOS = ${JSON.stringify(archivos)};
const ALCANCE = new URL(self.registration.scope).pathname;
const PREFIJO = 'torre3d:' + ALCANCE + ':';
const CACHE = PREFIJO + VERSION;
// nombre que usaba la versión anterior del service worker de esta app (sin carpeta): se borra al actualizar
const VIEJAS = ['torre3d-v1'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(ARCHIVOS.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => (k.startsWith(PREFIJO) && k !== CACHE) || VIEJAS.includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', e => {
  if (e.data === 'version?' && e.source) e.source.postMessage({ torre3d: VERSION, archivos: ARCHIVOS.length });
});

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith(ALCANCE)) return;
  if (r.mode === 'navigate') {
    // (siempre se pregunta al servidor: GitHub Pages deja la página 10 minutos en la caché del navegador y la versión
    // nueva tardaría en verse)
    e.respondWith(fetch(r.url, { cache: 'no-cache', credentials: 'same-origin' }).catch(() => caches.open(CACHE).then(c => c.match('./').then(x => x || c.match(r, { ignoreSearch: true })))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(c => c.match(r, { ignoreSearch: true }).then(x => x || fetch(r).then(res => {
    if (res.ok && res.type === 'basic') c.put(r, res.clone());
    return res;
  }))));
});
`;
}
