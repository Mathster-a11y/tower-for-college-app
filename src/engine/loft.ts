/**
 * Loft de losas (como el Loft de Rhino): se eligen dos o más losas «sección» y la silueta de todas las losas que quedan
 * entre ellas sale de interpolar esas secciones en altura.
 *
 *  1. Cada sección se recorre en sentido antihorario y se mide por largo de arco (0 a 1 desde su «costura»).
 *  2. Las costuras se alinean: la de cada sección se corre hasta la que mejor calza con la sección anterior (como el
 *     «Align curves» de Rhino; así el loft no se retuerce solo).
 *  3. Se toman puntos en los mismos parámetros en todas las secciones: una grilla pareja más los vértices (esquinas) de
 *     cada sección, para que las esquinas no se redondeen.
 *  4. En la cota z de cada losa intermedia cada punto se interpola: «recto» (tramos rectos entre secciones, como
 *     «Straight sections» de Rhino) o «suave» (curva de Hermite en z; en las secciones de los extremos las caras llegan
 *     verticales). Opcionalmente se gira la planta (giro total en grados, repartido con la altura).
 *
 * Las losas generadas quedan escritas en el proyecto (silueta, B y L de la caja), así la planilla, el Excel, el 3D y
 * las áreas usan lo mismo. Cuando cambia una sección, el loft se vuelve a aplicar solo (estado.cambiar).
 */
import type { Nivel, Proyecto } from './modelo';
import { cajaSilueta, plantaDeNivel, puntosSilueta, type Punto, type Vertice } from './silueta';

export interface Loft {
  id: string;
  /** cotas de las losas sección (al menos dos); las del medio también mandan (loft por varias curvas) */
  cotas: number[];
  /** recto: tramos rectos entre secciones · suave: curva suave en altura (vacío = recto) */
  tipo?: 'recto' | 'suave' | null;
  /** giro total de la planta de la sección más baja a la más alta (grados, antihorario; vacío = 0) */
  giro?: number | null;
  /** escribir en las losas intermedias B y L de la caja de su silueta (lo que lee la planilla; vacío = sí) */
  bl?: boolean | null;
}

const UNIFORMES = 96;

const areaConSigno = (p: Punto[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
const centroide = (p: Punto[]) => {
  let A = 0, cx = 0, cy = 0;
  p.forEach((a, i) => { const b = p[(i + 1) % p.length], c = a.x * b.y - b.x * a.y; A += c; cx += (a.x + b.x) * c; cy += (a.y + b.y) * c; });
  if (Math.abs(A) < 1e-12) return { x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length };
  return { x: cx / (3 * A), y: cy / (3 * A) };
};

/** contorno discretizado, antihorario, con el largo de arco acumulado (0..1) de cada punto y qué puntos son vértices */
interface Curva { p: Punto[]; s: number[]; esquina: boolean[]; c: Punto }
function curvaDe(v: Vertice[]): Curva {
  // se marca qué puntos discretizados son vértices del contorno (las esquinas)
  const pts: Punto[] = [], esq: boolean[] = [];
  v.forEach((a, i) => {
    const sig = v[(i + 1) % v.length];
    // el tramo de «a» al siguiente (recto, arco o Bézier): [a, intermedios…, siguiente]; el siguiente se saca
    const tramo = puntosSilueta([a, { x: sig.x, y: sig.y }], 4);
    const hasta = tramo.findIndex((q, k) => k > 0 && Math.abs(q.x - sig.x) < 1e-12 && Math.abs(q.y - sig.y) < 1e-12);
    tramo.slice(0, hasta > 0 ? hasta : 1).forEach((q, k) => { pts.push(q); esq.push(k === 0); });
  });
  let p = pts, e = esq;
  if (areaConSigno(p) < 0) {
    // al revés: se invierte dejando el primer punto en su lugar
    p = [p[0], ...p.slice(1).reverse()];
    e = [e[0], ...e.slice(1).reverse()];
  }
  return { ...largos(p), esquina: e, c: centroide(p) };
}
function largos(p: Punto[]): { p: Punto[]; s: number[] } {
  const s = [0];
  for (let i = 1; i <= p.length; i++) { const a = p[i - 1], b = p[i % p.length]; s.push(s[i - 1] + Math.hypot(b.x - a.x, b.y - a.y)); }
  const tot = s[p.length] || 1;
  return { p, s: s.slice(0, p.length).map(x => x / tot) };
}
/** punto de la curva en el parámetro u (0..1, desde su costura) */
function enParametro(c: Curva, u: number): Punto {
  u = ((u % 1) + 1) % 1;
  const n = c.p.length;
  // búsqueda binaria del tramo
  let lo = 0, hi = n - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c.s[m] <= u) lo = m; else hi = m - 1; }
  const a = c.p[lo], b = c.p[(lo + 1) % n], s0 = c.s[lo], s1 = lo + 1 < n ? c.s[lo + 1] : 1;
  const t = s1 - s0 > 1e-12 ? (u - s0) / (s1 - s0) : 0;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
/** corre la costura de la curva al parámetro u0 */
function correr(c: Curva, u0: number): Curva {
  const pts: { q: Punto; s: number; e: boolean }[] = c.p.map((q, i) => ({ q, s: (((c.s[i] - u0) % 1) + 1) % 1, e: c.esquina[i] }));
  pts.sort((a, b) => a.s - b.s);
  if (pts[0].s > 1e-9) pts.unshift({ q: enParametro(c, u0), s: 0, e: false });
  return { p: pts.map(x => x.q), s: pts.map(x => x.s), esquina: pts.map(x => x.e), c: c.c };
}
/** el corrimiento de la costura de «b» que mejor calza con «a» (centradas) */
function mejorCostura(a: Curva, b: Curva): number {
  const M = 128;
  const A = Array.from({ length: M }, (_, i) => { const q = enParametro(a, i / M); return { x: q.x - a.c.x, y: q.y - a.c.y }; });
  const Bq = Array.from({ length: M }, (_, i) => { const q = enParametro(b, i / M); return { x: q.x - b.c.x, y: q.y - b.c.y }; });
  let mejor = 0, dmin = Infinity;
  for (let k = 0; k < M; k++) {
    let d = 0;
    for (let i = 0; i < M; i++) { const p = A[i], q = Bq[(i + k) % M]; d += (p.x - q.x) ** 2 + (p.y - q.y) ** 2; }
    if (d < dmin - 1e-9) { dmin = d; mejor = k; }
  }
  // afinado entre las muestras vecinas (el mínimo no tiene por qué caer justo en una)
  let u = mejor / M, paso = 1 / M;
  const costo = (u0: number) => { let d = 0; for (let i = 0; i < M; i++) { const q = enParametro(b, i / M + u0); d += (A[i].x - q.x + b.c.x) ** 2 + (A[i].y - q.y + b.c.y) ** 2; } return d; };
  for (let it = 0; it < 12; it++) { paso /= 2; const c0 = costo(u), cm = costo(u - paso), cp = costo(u + paso); if (cm < c0 && cm <= cp) u -= paso; else if (cp < c0) u += paso; }
  return ((u % 1) + 1) % 1;
}

/** secciones listas para interpolar: mismas cantidades de puntos, en los mismos parámetros */
/** @param maxPuntos si las esquinas de todas las secciones juntas pasan este número, se usa solo la grilla pareja (para no armar mallas enormes) */
export function prepararSecciones(siluetas: Vertice[][], maxPuntos = Infinity): Punto[][] {
  const cs = siluetas.map(curvaDe);
  // costura de la primera: su primer vértice; las demás, alineadas una con la anterior
  for (let k = 1; k < cs.length; k++) cs[k] = correr(cs[k], mejorCostura(cs[k - 1], cs[k]));
  // parámetros comunes: grilla pareja + esquinas de todas (sin repetir los muy cercanos)
  const us = new Set<number>();
  for (let i = 0; i < UNIFORMES; i++) us.add(i / UNIFORMES);
  cs.forEach(c => c.s.forEach((s, i) => { if (c.esquina[i]) us.add(s); }));
  const lista = [...us].sort((a, b) => a - b).filter((u, i, a) => i === 0 || u - a[i - 1] > 1e-6);
  if (lista.length && 1 - lista[lista.length - 1] < 1e-6) lista.pop();
  if (lista.length > maxPuntos) return cs.map(c => Array.from({ length: UNIFORMES }, (_, i) => enParametro(c, i / UNIFORMES)));
  return cs.map(c => lista.map(u => enParametro(c, u)));
}

/** saca los puntos alineados (la silueta queda con pocos vértices: las esquinas y lo que dibuja las curvas) */
function simplificar(p: Punto[], tol = 1e-4): Punto[] {
  let q = p;
  for (let it = 0; it < 4; it++) {
    const out: Punto[] = [];
    q.forEach((b, i) => {
      const a = q[(i - 1 + q.length) % q.length], c = q[(i + 1) % q.length];
      const l = Math.hypot(c.x - a.x, c.y - a.y);
      const d = l > 1e-12 ? Math.abs((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / l : Math.hypot(b.x - a.x, b.y - a.y);
      if (d > tol) out.push(b);
    });
    if (out.length === q.length || out.length < 3) break;
    q = out;
  }
  return q;
}

/** silueta interpolada en la cota z entre las secciones (zs creciente) */
export function interpolarSilueta(secs: Punto[][], zs: number[], z: number, tipo: 'recto' | 'suave' = 'recto', giro = 0): Vertice[] {
  const n = zs.length, m = secs[0].length;
  let k = 0;
  while (k < n - 2 && z > zs[k + 1]) k++;
  const h = zs[k + 1] - zs[k], t = h > 1e-12 ? Math.min(1, Math.max(0, (z - zs[k]) / h)) : 0;
  const out: Punto[] = [];
  // derivada en z de cada punto en la sección j (Hermite): 0 en los extremos, diferencia centrada en el medio
  const der = (j: number, i: number): Punto => (j <= 0 || j >= n - 1 ? { x: 0, y: 0 }
    : { x: (secs[j + 1][i].x - secs[j - 1][i].x) / (zs[j + 1] - zs[j - 1]), y: (secs[j + 1][i].y - secs[j - 1][i].y) / (zs[j + 1] - zs[j - 1]) });
  const h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2;
  for (let i = 0; i < m; i++) {
    const a = secs[k][i], b = secs[k + 1][i];
    if (tipo === 'suave') {
      const da = der(k, i), db = der(k + 1, i);
      out.push({ x: h00 * a.x + h10 * h * da.x + h01 * b.x + h11 * h * db.x, y: h00 * a.y + h10 * h * da.y + h01 * b.y + h11 * h * db.y });
    } else out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  let res = out;
  if (giro) {
    const f = zs[n - 1] - zs[0] > 1e-12 ? (z - zs[0]) / (zs[n - 1] - zs[0]) : 0, ang = (giro * f * Math.PI) / 180;
    const c = centroide(out), co = Math.cos(ang), si = Math.sin(ang);
    res = out.map(q => ({ x: c.x + (q.x - c.x) * co - (q.y - c.y) * si, y: c.y + (q.x - c.x) * si + (q.y - c.y) * co }));
  }
  return simplificar(res).map(q => ({ x: +q.x.toFixed(4), y: +q.y.toFixed(4) }));
}

const igual = (a: number, b: number) => Math.abs(a - b) < 1e-6;
/** índices de los niveles sección y de los intermedios de un loft (los intermedios, de arriba hacia abajo) */
export function nivelesDeLoft(p: Proyecto, l: Loft): { secciones: number[]; intermedios: number[] } {
  const cs = [...l.cotas].sort((a, b) => a - b);
  const secciones = cs.map(c => p.niveles.findIndex(n => igual(n.cota, c))).filter(i => i >= 0);
  const z0 = cs[0], z1 = cs[cs.length - 1];
  const intermedios = p.niveles.map((n, i) => ({ n, i })).filter(({ n }) => n.cota > z0 + 1e-6 && n.cota < z1 - 1e-6 && !cs.some(c => igual(c, n.cota))).map(x => x.i);
  return { secciones, intermedios };
}
/** el loft que genera la losa del nivel i (si la genera alguno) */
export function loftDeNivel(p: Proyecto, i: number): Loft | null {
  return (p.lofts ?? []).find(l => nivelesDeLoft(p, l).intermedios.includes(i)) ?? null;
}
/** el loft del que el nivel i es sección */
export function loftsConSeccion(p: Proyecto, i: number): Loft[] {
  return (p.lofts ?? []).filter(l => nivelesDeLoft(p, l).secciones.includes(i));
}
/** qué le falta a un loft para poder aplicarse (vacío = nada) */
export function problemaLoft(p: Proyecto, l: Loft): string {
  const { secciones, intermedios } = nivelesDeLoft(p, l);
  if (new Set(l.cotas.map(c => c.toFixed(4))).size < 2) return 'Hacen falta dos losas distintas.';
  if (secciones.length < l.cotas.length) return 'Una de las losas elegidas ya no existe (se borró o cambió su cota).';
  if (!intermedios.length) return 'Entre las losas elegidas no hay ninguna otra losa: no hay nada que generar.';
  return '';
}

/** escribe en las losas intermedias la silueta (y B y L) de cada loft; devuelve cuántas losas generó */
export function aplicarLofts(p: Proyecto): number {
  let total = 0;
  // de abajo hacia arriba no importa: las secciones se leen antes de escribir cada loft y son siluetas propias
  (p.lofts ?? []).forEach(l => {
    if (problemaLoft(p, l)) return;
    const { secciones, intermedios } = nivelesDeLoft(p, l);
    const orden = secciones.map(i => ({ i, z: p.niveles[i].cota })).sort((a, b) => a.z - b.z);
    // cada sección queda con silueta propia (si la heredaba, se copia: así el loft no se lee a sí mismo)
    orden.forEach(({ i }) => { const n = p.niveles[i]; if (!n.silueta || n.silueta.length < 3) n.silueta = plantaDeNivel(p, i).silueta.map(v => ({ ...v })); });
    const secs = prepararSecciones(orden.map(({ i }) => p.niveles[i].silueta as Vertice[]));
    const zs = orden.map(o => o.z);
    intermedios.forEach(i => {
      const n: Nivel = p.niveles[i];
      const s = interpolarSilueta(secs, zs, n.cota, l.tipo ?? 'recto', l.giro ?? 0);
      n.silueta = s;
      if (l.bl ?? true) { const c = cajaSilueta(s); n.B = +c.B.toFixed(2); n.L = +c.L.toFixed(2); }
      total++;
    });
  });
  return total;
}

let cuenta = 0;
export const nuevoIdLoft = (p: Proyecto) => { let id: string; do id = `LF${++cuenta}`; while ((p.lofts ?? []).some(l => l.id === id)); return id; };
