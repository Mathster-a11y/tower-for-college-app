/**
 * Salvaguardas del simulador de viento, para los lugares donde la velocidad «tiende a infinito» (las esquinas vivas:
 * en la teoría del flujo ideal la velocidad ahí es infinita; en el aire real y en la simulación, el aire se despega y
 * queda una capa delgada muy rápida, cuyo pico depende de la grilla):
 *  A · marcar los puntos de velocidad alta (máximos locales sobre un umbral);
 *  B · guardia de estabilidad: avisar cuando la velocidad en unidades de la red se acerca al límite del método y, si la
 *      simulación se rompe, pausar y decir dónde (en vez de una imagen negra);
 *  C · el pico de diseño promediado en un área de ~1 m² (no el de una celda, que crece al afinar la grilla);
 *  D · avisar cuando el pico está en una esquina viva.
 * Para desarrollo se apagan todas juntas (no hay botón para el usuario): con ?salvaguardas=no en la dirección, o con
 * localStorage['torre3d.dev.salvaguardas'] = 'no' (y se vuelven a prender borrándolo). Apagadas, la app se comporta
 * como antes: picos de una celda, sin marcas ni avisos.
 */
export const SALVAGUARDAS: boolean = (() => {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('salvaguardas') : null;
    if (q !== null) return q !== 'no';
    return typeof localStorage === 'undefined' || localStorage.getItem('torre3d.dev.salvaguardas') !== 'no';
  } catch { return true; }
})();

/** umbral de «velocidad alta» (veces la de referencia) para las marcas */
export const UMBRAL_ALTA = 1.8;
/**
 * velocidad en unidades de la red: el método (Lattice Boltzmann) es fiel mientras el aire va bastante más lento que el
 * «sonido» de la red (cs = 0,577). Arriba de AVISO conviene bajar la velocidad del túnel; arriba de CRITICO es probable
 * que se rompa
 */
export const AVISO_RED = 0.22, CRITICO_RED = 0.3;

export interface P { x: number; y: number }
export interface PuntoAlto { x: number; y: number; valor: number }

/**
 * los máximos locales del campo (uno por celda, ya en veces la referencia) sobre el umbral: cada uno es el mayor en un
 * radio de «separacion» celdas; los n más altos, de mayor a menor (dentro de «zona», si se da: el entorno de la torre)
 */
export function puntosAltos(nx: number, ny: number, campo: ArrayLike<number>, solido: Uint8Array | null, umbral = UMBRAL_ALTA, n = 5, separacion = 4,
  zona?: { x0: number; x1: number; y0: number; y1: number }): PuntoAlto[] {
  const cand: PuntoAlto[] = [];
  for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const c = y * nx + x, v = campo[c];
    if (!(v >= umbral) || (solido && solido[c])) continue;
    if (zona && (x < zona.x0 || x > zona.x1 || y < zona.y0 || y > zona.y1)) continue;
    let max = true;
    for (let j = -1; j <= 1 && max; j++) for (let i = -1; i <= 1; i++) if ((i || j) && campo[c + j * nx + i] > v) { max = false; break; }
    if (max) cand.push({ x: x + 0.5, y: y + 0.5, valor: v });
  }
  cand.sort((a, b) => b.valor - a.valor);
  const out: PuntoAlto[] = [];
  for (const p of cand) { if (out.every(q => Math.hypot(q.x - p.x, q.y - p.y) > separacion)) out.push(p); if (out.length >= n) break; }
  return out;
}

/** ¿hay una esquina viva (un quiebre saliente de más de «angulo» grados) a menos de «radio» del punto? */
export function esquinaVivaCerca(p: P, contornos: P[][], radio: number, angulo = 50): boolean {
  for (const pol of contornos) {
    let area = 0; pol.forEach((a, i) => { const b = pol[(i + 1) % pol.length]; area += a.x * b.y - b.x * a.y; });
    const s = Math.sign(area) || 1;
    for (let i = 0; i < pol.length; i++) {
      const a = pol[(i - 1 + pol.length) % pol.length], b = pol[i], c = pol[(i + 1) % pol.length];
      if (Math.hypot(b.x - p.x, b.y - p.y) > radio) continue;
      const u = Math.atan2(b.y - a.y, b.x - a.x), v = Math.atan2(c.y - b.y, c.x - b.x);
      let d = v - u; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      if (d * s > (angulo * Math.PI) / 180) return true;              // gira hacia el lado del sólido: saliente
    }
  }
  return false;
}

/**
 * el promedio de cada celda en un cuadrado de «lado» celdas (centrado), contando solo las celdas de «cuenta» (1); con
 * imagen integral, en O(n). Devuelve NaN donde no hay ninguna celda que cuente
 */
export function promedioArea(nx: number, ny: number, campo: ArrayLike<number>, cuenta: Uint8Array, lado: number): Float32Array {
  const out = new Float32Array(nx * ny), W = nx + 1, S = new Float64Array(W * (ny + 1)), C = new Float64Array(W * (ny + 1));
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const c = y * nx + x, k = (y + 1) * W + x + 1, v = cuenta[c] ? campo[c] : 0;
    S[k] = v + S[k - 1] + S[k - W] - S[k - W - 1]; C[k] = cuenta[c] + C[k - 1] + C[k - W] - C[k - W - 1];
  }
  const h0 = Math.floor((lado - 1) / 2), h1 = lado - 1 - h0;
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const x0 = Math.max(0, x - h0), x1 = Math.min(nx - 1, x + h1), y0 = Math.max(0, y - h0), y1 = Math.min(ny - 1, y + h1);
    const a = y0 * W + x0, b = y0 * W + x1 + 1, c = (y1 + 1) * W + x0, d = (y1 + 1) * W + x1 + 1;
    const n = C[d] - C[b] - C[c] + C[a];
    out[y * nx + x] = n > 0 ? (S[d] - S[b] - S[c] + S[a]) / n : NaN;
  }
  return out;
}

/** cuántas celdas tiene el lado de un cuadrado de ~1 m (al menos 1) */
export const ladoMetro = (metrosPorCelda: number) => Math.max(1, Math.round(1 / metrosPorCelda));

/** dónde está un punto respecto de la torre (para leerlo): barlovento, sotavento o costado, y a cuántos metros */
export function dondeRespectoTorre(p: P, caja: { x0: number; x1: number; y0: number; y1: number }, mPorCelda: number): string {
  const lado = p.x < caja.x0 ? 'a barlovento' : p.x > caja.x1 + 1 ? 'a sotavento' : 'al costado';
  // mirando hacia donde va el viento (+x), la izquierda es +y
  const cy = (caja.y0 + caja.y1 + 1) / 2, mano = Math.abs(p.y - cy) < (caja.y1 - caja.y0) / 6 ? '' : p.y > cy ? ' izquierdo' : ' derecho';
  const lado2 = lado === 'al costado' ? `al costado${mano}` : `${lado}${mano ? `, lado${mano}` : ''}`;
  const dx = Math.max(caja.x0 - p.x, 0, p.x - caja.x1 - 1), dy = Math.max(caja.y0 - p.y, 0, p.y - caja.y1 - 1), d = Math.hypot(dx, dy) * mPorCelda;
  return d < 1.5 ? `${lado2}, pegado a la torre` : `${lado2}, a ${d.toFixed(0).replace('.', ',')} m de la torre`;
}
