// Torre 3D: copia para usar sin internet. Archivo generado por scripts/sw.mjs en el build: no editar a mano.
const VERSION = "73844b05c0b7";
const ARCHIVOS = ["./","assets/OrbitControls-CGJ5OEkm.js","assets/asimetrica-rx_a-xGn.png","assets/cartaPdf-CknNmg1y.js","assets/comun-CU8oWVw4.js","assets/desglose-BhcjmI3d.js","assets/dibujosDesglose-TzhXhV2X.js","assets/figuras-DtaD525l.js","assets/ibm-plex-sans-greek-400-italic-BEZwmy7D.woff2","assets/ibm-plex-sans-greek-400-normal-_efipK4i.woff2","assets/ibm-plex-sans-latin-400-italic-CZTNEAuW.woff2","assets/ibm-plex-sans-latin-400-normal-CDDApCn2.woff2","assets/ibm-plex-sans-latin-600-normal-CuJfVYMP.woff2","assets/ibm-plex-sans-latin-700-normal-Bxkt5Cjx.woff2","assets/index-C4oNA7Y3.css","assets/index-Kwy8levh.js","assets/informe-DvixtMRQ.js","assets/jetbrains-mono-latin-400-normal-V6pRDFza.woff2","assets/jetbrains-mono-latin-600-normal-C8RAYTDA.woff2","assets/jszip.min-B0YeuiBz.js","assets/lamina-CKp7Pck3.js","assets/lbm3dCpu-DiyxSeWx.js","assets/lbm3dGpu-D0o4yqCM.js","assets/libro-BsmmbQ9_.js","assets/libroCombinado-Ca5jte64.js","assets/libroGuia-DaC103r5.js","assets/libroRenovada-DTn6_Nm7.js","assets/libroTunel-yy4j7wwt.js","assets/libroTunel3d-D9L7l4OE.js","assets/npt-Cl6SorGx.png","assets/opcionesG-iOcveU3z.js","assets/openfoam-B-hB7LmH.js","assets/pdf-Din1Qm5d.js","assets/planilla-CyAoSRID.js","assets/planilla_catedra_2025-BeWPFwXt.xlsx","assets/planilla_virgen-DuILTy8U.xlsx","assets/plex-math-sub-DhUBrtdG.woff2","assets/portico-J_UEEqEv.png","assets/pptxgen.es-BIskIp09.js","assets/reporteFem-r1nuVN7g.js","assets/simetrica-BdS7mJXi.png","assets/tablas-DYNl4jLO.js","assets/torre-CqXhfWto.png","assets/tubo-B5KLi52i.png","assets/tunel3d-B27BVi8S.js","assets/vista3d-Bi7IkAJV.js","assets/vistaPlanilla-CvhRX8tq.js","icono-192.png","icono-512.png","manifest.webmanifest"];
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
