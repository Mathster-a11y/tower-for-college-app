// Torre 3D: copia para usar sin internet. Archivo generado por scripts/sw.mjs en el build: no editar a mano.
const VERSION = "30448cef557b";
const ARCHIVOS = ["./","assets/OrbitControls-CGJ5OEkm.js","assets/asimetrica-rx_a-xGn.png","assets/cartaPdf-CYroozHh.js","assets/comun-CU8oWVw4.js","assets/desglose-B1KrOeWO.js","assets/dibujosDesglose-ZnpVeRyd.js","assets/figuras-DtaD525l.js","assets/ibm-plex-sans-greek-400-italic-BEZwmy7D.woff2","assets/ibm-plex-sans-greek-400-normal-_efipK4i.woff2","assets/ibm-plex-sans-latin-400-italic-CZTNEAuW.woff2","assets/ibm-plex-sans-latin-400-normal-CDDApCn2.woff2","assets/ibm-plex-sans-latin-600-normal-CuJfVYMP.woff2","assets/ibm-plex-sans-latin-700-normal-Bxkt5Cjx.woff2","assets/index-C91HiFOA.css","assets/index-CfyNGxNW.js","assets/informe-Qt354Vwl.js","assets/jetbrains-mono-latin-400-normal-V6pRDFza.woff2","assets/jetbrains-mono-latin-600-normal-C8RAYTDA.woff2","assets/jszip.min-B0YeuiBz.js","assets/lamina-BdHuDOf8.js","assets/lbm3dCpu-DiyxSeWx.js","assets/lbm3dGpu-HGDco5D_.js","assets/libro-BsmmbQ9_.js","assets/libroCombinado-D8LjBtY3.js","assets/libroGuia-Wu1tEFL9.js","assets/libroRenovada-BirFIHLF.js","assets/libroTunel-yy4j7wwt.js","assets/libroTunel3d-CeT-XWiU.js","assets/npt-Cl6SorGx.png","assets/opcionesG-CVDChDhL.js","assets/openfoam-DmvkGhQK.js","assets/pdf-Din1Qm5d.js","assets/planilla-DZrReu_J.js","assets/planilla_catedra_2025-BeWPFwXt.xlsx","assets/planilla_virgen-DuILTy8U.xlsx","assets/plex-math-sub-DhUBrtdG.woff2","assets/portico-J_UEEqEv.png","assets/pptxgen.es-BIskIp09.js","assets/presentacion-Cjfi2_KJ.js","assets/reporteFem-Cmdi2rH-.js","assets/simetrica-BdS7mJXi.png","assets/tablas-DYNl4jLO.js","assets/torre-CqXhfWto.png","assets/tubo-B5KLi52i.png","assets/tunel3d-ss_bATnM.js","assets/vista3d-Bh8TOVAo.js","assets/vistaPlanilla-KUEy5Vvp.js","icono-192.png","icono-512.png","manifest.webmanifest"];
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
    e.respondWith(fetch(r).catch(() => caches.open(CACHE).then(c => c.match('./').then(x => x || c.match(r, { ignoreSearch: true })))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(c => c.match(r, { ignoreSearch: true }).then(x => x || fetch(r).then(res => {
    if (res.ok && res.type === 'basic') c.put(r, res.clone());
    return res;
  }))));
});
