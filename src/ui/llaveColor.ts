/**
 * Llaves de colores de las simulaciones: una barra con el degradé y sus valores, dibujada sobre el lienzo (así queda
 * también en el video y en las capturas) o como HTML encima de la vista 3D.
 */
export interface Llave {
  titulo: string;
  /** colores del degradé, de izquierda a derecha (CSS) */
  colores: string[];
  /** rótulos debajo de la barra: [posición 0..1, texto] */
  marcas: [number, string][];
  /** muestras sueltas al lado (por ejemplo, «■ torre») */
  extras?: { color: string; texto: string; forma?: 'caja' | 'punto' }[];
}

/** la llave en el lienzo, abajo a la izquierda (x, y: esquina de abajo a la izquierda) */
export function llaveEnLienzo(g: CanvasRenderingContext2D, ll: Llave, x: number, yAbajo: number, ancho = 170, fondo = '#ffffff', tinta = '#223344') {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  const fs = 11, barra = 9, pad = 6, filaExtras = ll.extras?.length ? fs + 6 : 0;
  g.font = `600 ${fs}px system-ui, sans-serif`;
  const anchoExtras = (ll.extras ?? []).reduce((s, e) => s + g.measureText(e.texto).width + 22, 0);
  const W = Math.max(ancho, g.measureText(ll.titulo).width, anchoExtras) + 2 * pad, H = pad + fs + 4 + barra + 3 + fs + filaExtras + pad;
  const x0 = x, y0 = yAbajo - H;
  g.globalAlpha = 0.86; g.fillStyle = fondo; g.beginPath(); g.roundRect(x0, y0, W, H, 6); g.fill(); g.globalAlpha = 1;
  g.fillStyle = tinta; g.textBaseline = 'top'; g.textAlign = 'left';
  g.fillText(ll.titulo, x0 + pad, y0 + pad);
  const by = y0 + pad + fs + 4, bw = W - 2 * pad;
  const gr = g.createLinearGradient(x0 + pad, 0, x0 + pad + bw, 0);
  ll.colores.forEach((c, i) => gr.addColorStop(ll.colores.length === 1 ? 0 : i / (ll.colores.length - 1), c));
  g.fillStyle = gr; g.fillRect(x0 + pad, by, bw, barra);
  g.strokeStyle = tinta; g.globalAlpha = 0.35; g.lineWidth = 1; g.strokeRect(x0 + pad + 0.5, by + 0.5, bw - 1, barra - 1); g.globalAlpha = 1;
  g.font = `${fs}px system-ui, sans-serif`; g.fillStyle = tinta;
  for (const [t, txt] of ll.marcas) {
    g.textAlign = t <= 0.02 ? 'left' : t >= 0.98 ? 'right' : 'center';
    g.fillText(txt, x0 + pad + t * bw, by + barra + 3);
  }
  if (ll.extras?.length) {
    let ex = x0 + pad; const ey = by + barra + 3 + fs + 4;
    g.textAlign = 'left';
    for (const e of ll.extras) {
      g.fillStyle = e.color;
      if (e.forma === 'punto') { g.beginPath(); g.arc(ex + 5, ey + fs / 2, 4, 0, 2 * Math.PI); g.fill(); } else g.fillRect(ex, ey + 1, 10, fs - 2);
      g.fillStyle = tinta; g.fillText(e.texto, ex + 14, ey); ex += g.measureText(e.texto).width + 22;
    }
  }
  g.restore();
  return { ancho: W, alto: H };
}

/** la llave como HTML (para poner encima de la vista 3D) */
export function llaveHtml(ll: Llave): HTMLElement {
  const d = document.createElement('div'); d.className = 'llave-sim';
  const t = document.createElement('b'); t.textContent = ll.titulo; d.append(t);
  const b = document.createElement('div'); b.className = 'llave-sim-barra'; b.style.background = `linear-gradient(90deg, ${ll.colores.join(', ')})`; d.append(b);
  const m = document.createElement('div'); m.className = 'llave-sim-marcas';
  for (const [p, txt] of ll.marcas) { const s = document.createElement('span'); s.textContent = txt; s.style.left = `${p * 100}%`; s.style.transform = p <= 0.02 ? 'none' : p >= 0.98 ? 'translateX(-100%)' : 'translateX(-50%)'; m.append(s); }
  d.append(m);
  if (ll.extras?.length) {
    const e = document.createElement('div'); e.className = 'llave-sim-extras';
    for (const x of ll.extras) { const s = document.createElement('span'); const i = document.createElement('i'); i.style.background = x.color; if (x.forma === 'punto') i.style.borderRadius = '50%'; s.append(i, x.texto); e.append(s); }
    d.append(e);
  }
  return d;
}
