/**
 * Cp a lo largo del perímetro de la planta (propuesta 5 del diagnóstico de viento): las celdas de aire pegadas a la
 * torre, cada una ubicada sobre el contorno (posición s a lo largo del perímetro, desde el punto más a barlovento y en
 * sentido antihorario), con la presión promediada en el tiempo. Sirve para la carpintería: dónde empuja el viento y
 * dónde están los picos de succión (las esquinas, el arranque de las curvas).
 * Cp = (ρ − ρref) / 3 / (½ u0²), con ρref de una celda lejos, al costado de la entrada (como la toma de un túnel).
 */
import type { Geometria2D, P } from './geometria2d';

export interface Perimetro {
  /** celdas de aire pegadas a la torre (4 vecinas) */
  celdas: Int32Array;
  /** su posición a lo largo del perímetro (m) y el punto del contorno más cercano (red) */
  s: Float32Array; px: Float32Array; py: Float32Array;
  /** largo del perímetro (m) y dónde están los vértices con quiebre (esquinas), en m */
  largo: number; esquinas: number[];
  /** celda de referencia de la presión */
  ref: number;
}

/**
 * la celda de referencia de la presión en el túnel 2D: al costado (5 % del alto) y a mitad de camino entre la entrada
 * y la torre; cerca de la entrada la presión todavía está perturbada por la condición de entrada
 */
export const celdaRef2D = (geo: Geometria2D) => Math.floor(geo.ny * 0.05) * geo.nx + Math.max(4, Math.round(geo.caja.x0 / 2));

/** punto más cercano de un segmento a un punto, y su fracción */
function cercano(a: P, b: P, q: P): { t: number; d2: number; x: number; y: number } {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0;
  const x = a.x + t * dx, y = a.y + t * dy;
  return { t, d2: (x - q.x) ** 2 + (y - q.y) ** 2, x, y };
}

/** el perímetro de la primera torre del túnel (geo.contornos[0]) */
export function perimetro(geo: Geometria2D): Perimetro {
  const { nx, ny, solido, escala } = geo, pol0 = geo.contornos[0];
  // sentido antihorario (área positiva) y arranque en el punto más a barlovento (x mínima, el más cerca del centro en y)
  let area = 0; pol0.forEach((a, i) => { const b = pol0[(i + 1) % pol0.length]; area += a.x * b.y - b.x * a.y; });
  const pol = area >= 0 ? pol0 : [...pol0].reverse();
  // el arranque: el punto del contorno más cercano a uno lejano aguas arriba, a la altura del centro (en un cuadrado, el
  // medio de la cara de barlovento: el punto de estancamiento)
  const yc = pol.reduce((s, q) => s + q.y, 0) / pol.length, lejos = { x: Math.min(...pol.map(q => q.x)) - 1e4, y: yc };
  let e0 = { i: 0, t: 0, d2: Infinity, x: 0, y: 0 };
  for (let i = 0; i < pol.length; i++) { const r = cercano(pol[i], pol[(i + 1) % pol.length], lejos); if (r.d2 < e0.d2 - 1e-9) e0 = { i, ...r }; }
  const ini = { x: e0.x, y: e0.y }, sig = (e0.i + 1) % pol.length;
  const resto = [...pol.slice(sig), ...pol.slice(0, sig)];
  const P2 = (Math.hypot(resto[resto.length - 1].x - ini.x, resto[resto.length - 1].y - ini.y) < 1e-9 ? resto.slice(0, -1) : [...resto]);
  if (Math.hypot(P2[0].x - ini.x, P2[0].y - ini.y) > 1e-9) P2.unshift(ini);
  const acum: number[] = [0];
  for (let i = 0; i < P2.length; i++) { const a = P2[i], b = P2[(i + 1) % P2.length]; acum.push(acum[i] + Math.hypot(b.x - a.x, b.y - a.y)); }
  const largoRed = acum[P2.length];
  // esquinas: vértices donde el contorno quiebra más de 20°
  const esquinas: number[] = [];
  P2.forEach((b, i) => {
    const a = P2[(i - 1 + P2.length) % P2.length], c = P2[(i + 1) % P2.length];
    const u = Math.atan2(b.y - a.y, b.x - a.x), v = Math.atan2(c.y - b.y, c.x - b.x);
    let d = Math.abs(v - u); if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > (20 * Math.PI) / 180) esquinas.push(acum[i] / escala);
  });
  // la torre: las celdas sólidas dentro de la caja del contorno (la segunda torre, si hay, queda afuera)
  const xs = P2.map(q => q.x), ys = P2.map(q => q.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 1), x1 = Math.min(nx - 1, Math.ceil(Math.max(...xs)) + 1);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 1), y1 = Math.min(ny - 1, Math.ceil(Math.max(...ys)) + 1);
  const celdas: number[] = [], s: number[] = [], px: number[] = [], py: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = y * nx + x;
    if (solido[c]) continue;
    const toca = (x > 0 && solido[c - 1]) || (x < nx - 1 && solido[c + 1]) || (y > 0 && solido[c - nx]) || (y < ny - 1 && solido[c + nx]);
    if (!toca) continue;
    const q = { x: x + 0.5, y: y + 0.5 };
    let mejor = { i: 0, t: 0, d2: Infinity, x: 0, y: 0 };
    for (let i = 0; i < P2.length; i++) { const r = cercano(P2[i], P2[(i + 1) % P2.length], q); if (r.d2 < mejor.d2) mejor = { i, ...r }; }
    if (mejor.d2 > 4) continue;                                       // lejos del contorno: es de la otra torre
    const a = P2[mejor.i], b = P2[(mejor.i + 1) % P2.length];
    celdas.push(c); s.push((acum[mejor.i] + mejor.t * Math.hypot(b.x - a.x, b.y - a.y)) / escala); px.push(mejor.x); py.push(mejor.y);
  }
  // orden a lo largo del perímetro
  const ord = s.map((_, i) => i).sort((i, j) => s[i] - s[j]);
  return {
    celdas: Int32Array.from(ord.map(i => celdas[i])), s: Float32Array.from(ord.map(i => s[i])), px: Float32Array.from(ord.map(i => px[i])), py: Float32Array.from(ord.map(i => py[i])),
    largo: largoRed / escala, esquinas, ref: celdaRef2D(geo),
  };
}

/** promedio en el tiempo del Cp de cada celda del perímetro */
export class PromedioPerimetro {
  readonly suma: Float64Array; muestras = 0; private sumaRef = 0;
  constructor(readonly p: Perimetro, readonly u0: number) { this.suma = new Float64Array(p.celdas.length); }
  sumar(rho: ArrayLike<number>) {
    for (let k = 0; k < this.p.celdas.length; k++) this.suma[k] += rho[this.p.celdas[k]];
    this.sumaRef += rho[this.p.ref];
    this.muestras++;
  }
  cp(k: number): number { return this.muestras ? (this.suma[k] - this.sumaRef) / this.muestras / 3 / (0.5 * this.u0 * this.u0) : NaN; }
  /** el Cp promedio en tramos iguales del perímetro (para el gráfico) */
  tramos(n = 120): { s: number; cp: number }[] {
    const out: { s: number; cp: number }[] = [], suma = new Float64Array(n), cant = new Float64Array(n);
    for (let k = 0; k < this.p.celdas.length; k++) { const b = Math.min(n - 1, Math.floor((this.p.s[k] / this.p.largo) * n)); suma[b] += this.cp(k); cant[b]++; }
    for (let b = 0; b < n; b++) if (cant[b]) out.push({ s: ((b + 0.5) / n) * this.p.largo, cp: suma[b] / cant[b] });
    return out;
  }
  /** el pico de succión (Cp mínimo de los tramos) y el máximo empuje */
  extremos(n = 120): { min: { s: number; cp: number } | null; max: { s: number; cp: number } | null } {
    const t = this.tramos(n);
    if (!t.length) return { min: null, max: null };
    return { min: t.reduce((a, b) => (b.cp < a.cp ? b : a)), max: t.reduce((a, b) => (b.cp > a.cp ? b : a)) };
  }
}
