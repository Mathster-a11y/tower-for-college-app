/**
 * Pintar un campo de la simulación sin pixelado: cada píxel de la pantalla toma el valor interpolado (bilineal) entre
 * los centros de las cuatro celdas que lo rodean, y recién ahí se le da color. Así se ve suave a cualquier zoom; el
 * contorno exacto de la torre se dibuja encima.
 * Y el espectro térmico de la velocidad: de violeta muy oscuro (quieto) a amarillo claro (lo más rápido), pasando por
 * violeta, magenta apagado, naranja y ámbar, sin rojo ni azul (que en la app son tracción y compresión).
 */

/** las paradas del espectro térmico (0 = quieto, 1 = lo más rápido de la escala) */
export const TERMICO: [number, string][] = [
  // de violeta a durazno pasando por orquídea y rosado pálido: la mezcla directa violeta → naranja pasa por el rojo
  [0, '#120b1f'], [0.2, '#2e1a52'], [0.4, '#5b3290'], [0.56, '#9a5aa8'], [0.7, '#d590b0'], [0.84, '#f3bf7a'], [1, '#fdf2b8'],
];
const hexARgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** tabla de 256 colores del espectro térmico (r, g, b seguidos) */
export const LUT_TERMICO = (() => {
  const t = new Uint8ClampedArray(256 * 3), st = TERMICO.map(([p, c]) => [p, ...hexARgb(c)] as number[]);
  for (let i = 0; i < 256; i++) {
    const x = i / 255; let k = 0;
    while (k < st.length - 2 && x > st[k + 1][0]) k++;
    const [p0, r0, g0, b0] = st[k], [p1, r1, g1, b1] = st[k + 1], f = (x - p0) / (p1 - p0 || 1);
    t[3 * i] = r0 + (r1 - r0) * f; t[3 * i + 1] = g0 + (g1 - g0) * f; t[3 * i + 2] = b0 + (b1 - b0) * f;
  }
  return t;
})();
/** los colores del espectro, para la llave */
export const coloresTermico = () => TERMICO.map(([, c]) => c);

export interface Vista {
  /** píxeles del destino */
  W: number; H: number;
  /** de píxel a red (continua, en celdas: la celda i va de i a i + 1): X = x0 + p · dx; Y = y0 − fila · dy (y hacia arriba) */
  x0: number; dx: number; y0: number; dy: number;
}

/**
 * pinta el campo S (uno por celda) en px (RGBA, W × H). peso: 1 la celda cuenta, 0 no (sólidos que no tienen valor);
 * si las cuatro no cuentan, el píxel va con «vacio». color(v, px, k) pone el color del valor v en px[k..k+2].
 * velo (opcional, 0..1 por celda): mezcla hacia «fondo» (la banda de transición de la ventana de detalle)
 */
export function pintarSuave(px: Uint8ClampedArray, v: Vista, nx: number, ny: number, S: Float32Array, peso: Uint8Array | null,
  color: (val: number, px: Uint8ClampedArray, k: number) => void, vacio: number[], velo?: { m: Uint8Array; fondo: number[]; f: number }) {
  for (let fila = 0; fila < v.H; fila++) {
    const Y = v.y0 - (fila + 0.5) * v.dy - 0.5;
    let j = Math.floor(Y), fy = Y - j;
    if (j < 0) { j = 0; fy = 0; } else if (j >= ny - 1) { j = ny - 2; fy = 1; }
    for (let p = 0; p < v.W; p++) {
      const X = v.x0 + (p + 0.5) * v.dx - 0.5;
      let i = Math.floor(X), fx = X - i;
      if (i < 0) { i = 0; fx = 0; } else if (i >= nx - 1) { i = nx - 2; fx = 1; }
      const c = j * nx + i, k = 4 * (fila * v.W + p);
      let w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      if (peso) { w00 *= peso[c]; w10 *= peso[c + 1]; w01 *= peso[c + nx]; w11 *= peso[c + nx + 1]; }
      const sw = w00 + w10 + w01 + w11;
      if (sw < 1e-6) { px[k] = vacio[0]; px[k + 1] = vacio[1]; px[k + 2] = vacio[2]; px[k + 3] = 255; continue; }
      color((w00 * S[c] + w10 * S[c + 1] + w01 * S[c + nx] + w11 * S[c + nx + 1]) / sw, px, k);
      px[k + 3] = 255;
      if (velo) {
        const m = (1 - fx) * (1 - fy) * velo.m[c] + fx * (1 - fy) * velo.m[c + 1] + (1 - fx) * fy * velo.m[c + nx] + fx * fy * velo.m[c + nx + 1];
        if (m > 0) { const a = m * velo.f; px[k] += (velo.fondo[0] - px[k]) * a; px[k + 1] += (velo.fondo[1] - px[k + 1]) * a; px[k + 2] += (velo.fondo[2] - px[k + 2]) * a; }
      }
    }
  }
}

/** colores de cada vista (los mismos en el túnel y en la ventana de detalle) */
export function colorTermico(t: number, px: Uint8ClampedArray, k: number) {
  const i = 3 * Math.max(0, Math.min(255, Math.round(t * 255)));
  px[k] = LUT_TERMICO[i]; px[k + 1] = LUT_TERMICO[i + 1]; px[k + 2] = LUT_TERMICO[i + 2];
}
/** de «fondo» a a (valor negativo) o a b (positivo), con |v| = 1 en el extremo */
export const divergente = (fondo: number[], neg: number[], pos: number[]) => (v: number, px: Uint8ClampedArray, k: number) => {
  const c = v >= 0 ? pos : neg, t = Math.min(1, Math.abs(v));
  px[k] = fondo[0] + (c[0] - fondo[0]) * t; px[k + 1] = fondo[1] + (c[1] - fondo[1]) * t; px[k + 2] = fondo[2] + (c[2] - fondo[2]) * t;
};

/** cómo se dibujan las flechas de la velocidad: largo fijo con el color de la velocidad, o largo proporcional */
export type ModoFlechas = 'no' | 'fijas' | 'proporcionales';

/**
 * flechas de la velocidad en una grilla pareja de la pantalla (cada «paso» píxeles, así no se amontonan con el zoom).
 * muestra(X, Y): la velocidad en ese punto de la red (u, v, con v hacia arriba) normalizada por la de referencia, o
 * null si ahí no hay aire. «fijas»: todas del mismo largo, con el color del espectro térmico; «proporcionales»: el
 * largo dice la velocidad (1,6 veces la de referencia = un paso entero), en el color de la tinta.
 * Siempre con un borde del color del fondo, para que se lean sobre cualquier mapa de colores. Con colorear = false (el
 * fondo ya es la velocidad), las fijas van en tinta: solo dicen la dirección.
 */
export function dibujarFlechas(g: CanvasRenderingContext2D, v: Vista, modo: ModoFlechas, muestra: (X: number, Y: number) => [number, number] | null, paso: number, tinta: string, borde: string, colorear = true) {
  if (modo === 'no') return;
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  const px = new Uint8ClampedArray(4);
  for (let fy = paso / 2; fy < v.H; fy += paso) for (let fx = paso / 2; fx < v.W; fx += paso) {
    const m = muestra(v.x0 + fx * v.dx, v.y0 - fy * v.dy);
    if (!m) continue;
    const s = Math.hypot(m[0], m[1]);
    if (s < 1e-4) continue;
    const L = modo === 'fijas' ? paso * 0.72 : Math.min(paso * 1.25, (paso * s) / 1.6);
    if (L < 2) continue;
    const ux = m[0] / s, uy = -m[1] / s;                               // en pantalla, y hacia abajo
    const x0 = fx - (ux * L) / 2, y0 = fy - (uy * L) / 2, x1 = fx + (ux * L) / 2, y1 = fy + (uy * L) / 2;
    const cab = Math.min(6, Math.max(3, L * 0.32)), ax = -ux * cab, ay = -uy * cab, nx = -uy * cab * 0.6, ny = ux * cab * 0.6;
    let color = tinta;
    if (modo === 'fijas' && colorear) { colorTermico(Math.min(1, s / 1.6), px, 0); color = `rgb(${px[0]},${px[1]},${px[2]})`; }
    const trazo = () => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.moveTo(x1 + ax + nx, y1 + ay + ny); g.lineTo(x1, y1); g.lineTo(x1 + ax - nx, y1 + ay - ny); g.stroke(); };
    g.strokeStyle = borde; g.lineWidth = 3.4; g.globalAlpha = 0.75; trazo();
    g.strokeStyle = color; g.lineWidth = 1.6; g.globalAlpha = 1; trazo();
  }
  g.restore();
}

/** la velocidad interpolada (bilineal entre centros de celda) en un punto de la red, dividida por «ref»; null en la torre */
export const muestraVelocidad = (ux: ArrayLike<number>, uy: ArrayLike<number>, solido: Uint8Array, nx: number, ny: number, ref: number) => (X: number, Y: number): [number, number] | null => {
  const ci = Math.floor(X), cj = Math.floor(Y);
  if (ci < 0 || cj < 0 || ci >= nx || cj >= ny || solido[cj * nx + ci]) return null;
  let x = X - 0.5, y = Y - 0.5, i = Math.floor(x), j = Math.floor(y);
  if (i < 0) { i = 0; x = 0; } else if (i >= nx - 1) { i = nx - 2; x = nx - 1; }
  if (j < 0) { j = 0; y = 0; } else if (j >= ny - 1) { j = ny - 2; y = ny - 1; }
  const fx = x - i, fy = y - j, c = j * nx + i;
  const w = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy], cs = [c, c + 1, c + nx, c + nx + 1];
  let u = 0, v = 0;
  for (let k = 0; k < 4; k++) { u += w[k] * ux[cs[k]]; v += w[k] * uy[cs[k]]; }
  return [u / ref, v / ref];
};
