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
