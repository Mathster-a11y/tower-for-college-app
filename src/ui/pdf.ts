/**
 * PDF → imagen de fondo: la primera página del PDF se dibuja en alta resolución con pdf.js (incluido en la app,
 * funciona sin internet) y se usa como el calco de una imagen. Un PDF no trae capas ni coordenadas reales:
 * la escala se ajusta con dos puntos.
 */
import * as pdfjs from 'pdfjs-dist';
import codigoTrabajador from 'pdfjs-dist/build/pdf.worker.min.mjs?raw';

let listo = false;
function preparar() {
  if (listo) return;
  // el trabajador de pdf.js va dentro de la app (como texto) y se arranca desde un blob: no hace falta internet
  pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([codigoTrabajador], { type: 'text/javascript' }));
  listo = true;
}

export async function pdfAImagen(f: File, ancho = 3000): Promise<{ url: string; aspecto: number }> {
  preparar();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  const pag = await doc.getPage(1);
  const v0 = pag.getViewport({ scale: 1 });
  const v = pag.getViewport({ scale: ancho / v0.width });
  const c = document.createElement('canvas');
  c.width = Math.round(v.width); c.height = Math.round(v.height);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  await pag.render({ canvasContext: ctx, viewport: v }).promise;
  const blob: Blob = await new Promise((ok, mal) => c.toBlob(b => (b ? ok(b) : mal(new Error('no se pudo crear la imagen'))), 'image/png'));
  return { url: URL.createObjectURL(blob), aspecto: c.height / c.width };
}
