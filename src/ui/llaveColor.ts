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

/**
 * Símbolos del dibujo: qué quiere decir cada marca que no es un color de fondo (flechas, líneas, anillos, humo,
 * anemómetros). Un renglón por símbolo, con el dibujito a la izquierda y, si hace falta, una aclaración más chica abajo
 */
export type FormaSimbolo = 'flecha' | 'flechaCorta' | 'linea' | 'lineaGruesa' | 'anillo' | 'humo' | 'sonda';
export interface Simbolo { forma: FormaSimbolo; texto: string; nota?: string; color?: string }

/** el dibujito de un símbolo en un lugar de 22 × 12 px (x, y: esquina de arriba a la izquierda) */
function glifo(g: CanvasRenderingContext2D, s: Simbolo, x: number, y: number, tinta: string, fondo: string) {
  const col = s.color ?? tinta, cy = y + 6;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  const raya = (ancho: number, color: string, a: number, b: number) => { g.strokeStyle = color; g.lineWidth = ancho; g.beginPath(); g.moveTo(x + a, cy); g.lineTo(x + b, cy); g.stroke(); };
  if (s.forma === 'flecha' || s.forma === 'flechaCorta') {
    const b = s.forma === 'flecha' ? 20 : 11;
    for (const [c, w] of [[fondo, 3.4], [col, 1.6]] as const) { raya(w, c, 2, b); g.beginPath(); g.moveTo(x + b - 4, cy - 3); g.lineTo(x + b, cy); g.lineTo(x + b - 4, cy + 3); g.stroke(); }
  } else if (s.forma === 'linea' || s.forma === 'lineaGruesa') {
    const w = s.forma === 'linea' ? 0.9 : 1.9;
    raya(w + 1.7, fondo, 1, 21); raya(w, col, 1, 21);
  } else if (s.forma === 'anillo') {
    for (const [c, w] of [[fondo, 3.4], [col, 1.4]] as const) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.arc(x + 11, cy, 5, 0, 2 * Math.PI); g.stroke(); }
  } else if (s.forma === 'humo') {
    g.fillStyle = col; g.globalAlpha = 0.7;
    for (const [dx, dy] of [[3, 2], [8, -2], [12, 1], [16, -1], [19, 3], [6, 4]]) g.fillRect(x + dx, cy + dy - 1, 2, 2);
  } else if (s.forma === 'sonda') {
    g.fillStyle = col; g.fillRect(x + 5, y, 12, 12);
    g.fillStyle = '#ffffff'; g.font = '700 9px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('A', x + 11, cy + 0.5);
  }
  g.restore();
}

/** los símbolos en el lienzo, abajo a la derecha (xDerecha, yAbajo: esquina de abajo a la derecha) */
export function simbolosEnLienzo(g: CanvasRenderingContext2D, titulo: string, items: Simbolo[], xDerecha: number, yAbajo: number, fondo = '#ffffff', tinta = '#223344') {
  if (!items.length) return { ancho: 0, alto: 0 };
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  const fs = 11, fn = 10, pad = 6, glAncho = 26;
  g.font = `600 ${fs}px system-ui, sans-serif`;
  let W = g.measureText(titulo).width;
  for (const s of items) {
    g.font = `${fs}px system-ui, sans-serif`; W = Math.max(W, glAncho + g.measureText(s.texto).width);
    if (s.nota) { g.font = `${fn}px system-ui, sans-serif`; W = Math.max(W, glAncho + g.measureText(s.nota).width); }
  }
  W += 2 * pad;
  const H = pad + fs + 5 + items.reduce((a, s) => a + fs + 4 + (s.nota ? fn + 2 : 0), 0) + pad - 2;
  const x0 = xDerecha - W, y0 = yAbajo - H;
  g.globalAlpha = 0.88; g.fillStyle = fondo; g.beginPath(); g.roundRect(x0, y0, W, H, 6); g.fill(); g.globalAlpha = 1;
  g.textBaseline = 'top'; g.textAlign = 'left'; g.fillStyle = tinta; g.font = `600 ${fs}px system-ui, sans-serif`;
  g.fillText(titulo, x0 + pad, y0 + pad);
  let y = y0 + pad + fs + 5;
  for (const s of items) {
    glifo(g, s, x0 + pad, y, tinta, fondo);
    g.fillStyle = tinta; g.font = `${fs}px system-ui, sans-serif`; g.fillText(s.texto, x0 + pad + glAncho, y);
    y += fs + 4;
    if (s.nota) { g.globalAlpha = 0.75; g.font = `${fn}px system-ui, sans-serif`; g.fillText(s.nota, x0 + pad + glAncho, y - 2); g.globalAlpha = 1; y += fn + 2; }
  }
  g.restore();
  return { ancho: W, alto: H };
}

/** los símbolos como HTML (encima de la vista 3D): el dibujito va en un lienzo chico */
export function simbolosHtml(titulo: string, items: Simbolo[], tinta = '#223344', fondo = '#ffffff'): HTMLElement {
  const d = document.createElement('div'); d.className = 'llave-sim llave-simbolos';
  const t = document.createElement('b'); t.textContent = titulo; d.append(t);
  for (const s of items) {
    const fila = document.createElement('div'); fila.className = 'simbolo';
    const cv = document.createElement('canvas'); const k = 2; cv.width = 22 * k; cv.height = 12 * k; cv.style.width = '22px'; cv.style.height = '12px';
    const g = cv.getContext('2d'); if (g) { g.scale(k, k); glifo(g, s, 0, 0, tinta, fondo); }
    const tx = document.createElement('span'); tx.textContent = s.texto;
    if (s.nota) { const n = document.createElement('small'); n.textContent = s.nota; tx.append(n); }
    fila.append(cv, tx); d.append(fila);
  }
  return d;
}
