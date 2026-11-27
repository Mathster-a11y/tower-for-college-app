/**
 * Criterio D de los encuentros en el cálculo: «muros a escuadra, sin tocarse». El diseño se dibuja con los encuentros
 * resueltos (A: el que llega termina contra la cara del que pasa; B: inglete), pero para el cálculo cada muro es un
 * rectángulo que termina a escuadra justo antes de tocar a otro elemento: las columnas pasan enteras, después los muros
 * del más largo al más corto; un muro que se cruza con otro queda partido en dos. Nada se superpone (ni entre piezas ni
 * con las columnas) y la cuña que queda entre la punta a escuadra y la cara del otro es espacio muerto: se dibuja pero
 * no se calcula. Es más conservador que la unión del diseño (da menos área y menos J).
 */
import type { Muro } from './modelo';
import { tipoDe } from './modelo';
import { detectarJuntas, ejeDeMuro, huellasLimpias, type EleccionJunta, type Eje, type P } from './juntas';
import { diferencia } from './poligonos';
import { perfilDeMuro, polilinea } from './perfil';

const dot = (p: P, q: P) => p.x * q.x + p.y * q.y;
const sub = (p: P, q: P): P => ({ x: p.x - q.x, y: p.y - q.y });
const add = (p: P, q: P): P => ({ x: p.x + q.x, y: p.y + q.y });
const mul = (p: P, k: number): P => ({ x: p.x * k, y: p.y * k });

/** un elemento es columna si no es un muro recto alargado (tubos, columnas cuadradas, perfiles cortos o curvos) */
export function esColumna(m: Muro): boolean {
  const t = tipoDe(m);
  if (t === 'tubo-circ' || t === 'tubo-rect') return true;
  const E = ejeDeMuro(m);
  // (un tramo corto de muro, como el que queda entre una esquina y una puerta, sigue siendo muro: columna, casi cuadrada)
  return !E || E.L < 1.5 * E.e;
}
/** el polígono de un elemento en planta (sin huecos: para bloquear alcanza el contorno) */
const contorno = (m: Muro): P[] => polilinea(perfilDeMuro(m).v, 4, 16);
/** rectángulo de un muro entre los parámetros t0 y t1 de su eje */
export function rectEje(E: Eje, t0: number, t1: number): P[] {
  const a = add(E.a, mul(E.u, t0)), b = add(E.a, mul(E.u, t1)), h = mul(E.n, E.e / 2);
  return [add(a, h), add(b, h), sub(b, h), sub(a, h)];
}
/** recorta un polígono con el semiplano dot(q − p0, d) ≥ 0 (Sutherland–Hodgman) */
function semiplano(pol: P[], p0: P, d: P): P[] {
  const out: P[] = [], f = (q: P) => dot(sub(q, p0), d);
  pol.forEach((a, i) => {
    const b = pol[(i + 1) % pol.length], fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push(add(a, mul(sub(b, a), t))); }
  });
  return out;
}
const area = (pg: P[]) => Math.abs(pg.reduce((s, p, i) => { const q = pg[(i + 1) % pg.length]; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;

/** tramos del eje de E (parámetros) que tapa un polígono: su parte dentro de la franja del muro, proyectada al eje */
function tapado(E: Eje, pol: P[]): [number, number] | null {
  const m = 1e-6;
  let r = semiplano(pol, add(E.a, mul(E.n, -E.e / 2 + m)), E.n);
  r = semiplano(r, add(E.a, mul(E.n, E.e / 2 - m)), mul(E.n, -1));
  if (r.length < 3 || area(r) < 1e-8) return null;
  const ts = r.map(q => dot(sub(q, E.a), E.u));
  return [Math.min(...ts), Math.max(...ts)];
}

export interface Escuadra {
  /** los rectángulos de cálculo de cada muro (uno, varios si queda partido, o ninguno si queda tapado) */
  rects: Map<string, P[][]>;
  /** firma de cada muro (para no usar el resultado con otra geometría) */
  firma: Map<string, string>;
}
export const firmaMuro = (m: Muro) => JSON.stringify([m.x, m.y, m.dir, m.largo, m.espesor, m.ladoY, m.tipo, m.perfil, m.refLado]);

/** el criterio D para todos los elementos: las columnas enteras y los muros a escuadra, del más largo al más corto */
export function aEscuadra(muros: Muro[], largoMin = 0.05): Escuadra {
  const rects = new Map<string, P[][]>(), firma = new Map(muros.map(m => [m.id, firmaMuro(m)]));
  const bloquean: P[][] = [];
  muros.filter(esColumna).forEach(m => { const c = contorno(m); bloquean.push(c); rects.set(m.id, [c]); });
  const ejes = muros.filter(m => !esColumna(m)).map(m => ({ m, E: ejeDeMuro(m)! })).sort((a, b) => b.E.L - a.E.L);
  for (const { m, E } of ejes) {
    const tapas = bloquean.map(pol => tapado(E, pol)).filter(Boolean) as [number, number][];
    tapas.sort((a, b) => a[0] - b[0]);
    // tramos libres del eje
    const libres: [number, number][] = [];
    let t = 0;
    for (const [t0, t1] of tapas) { if (t0 > t) libres.push([t, Math.min(t0, E.L)]); t = Math.max(t, t1); if (t >= E.L) break; }
    if (t < E.L) libres.push([t, E.L]);
    const rs = libres.filter(([a, b]) => b - a >= largoMin).map(([a, b]) => rectEje(E, Math.max(0, a), Math.min(E.L, b)));
    rects.set(m.id, rs);
    bloquean.push(...rs);
  }
  return { rects, firma };
}

/**
 * Criterio A (el del dibujo): los encuentros exactos se resuelven como siempre (a tope, o a inglete si se eligió), y lo
 * que todavía se pisa (muros con las puntas corridas, muros que atraviesan columnas) se resuelve por prioridad: las
 * columnas pasan enteras; después los muros del más largo al más corto, cada uno sin lo que ya ocupan los anteriores
 * (el que llega termina contra la cara del que pasa, con su inclinación). Un pedazo que asoma del otro lado, más corto que
 * el espesor, se descarta. Nada queda superpuesto.
 */
type Anillo = [number, number][];
const aAnillos = (pg: P[]): Anillo[] => [pg.map(q => [q.x, q.y] as [number, number])];
const deAnillos = (mp: Anillo[][]): P[][] => mp.map(pg => pg[0].slice(0, -1).map(([x, y]) => ({ x, y })));
export function aTope(muros: Muro[], elecciones: Record<string, EleccionJunta> = {}, viento: 'A' | 'B' = 'A'): Escuadra {
  const paredes = muros.filter(m => !esColumna(m));
  const limpias = huellasLimpias(paredes, detectarJuntas(paredes), elecciones, viento);
  const base = (m: Muro): P[][] => limpias.get(m.id) ?? [contorno(m)];
  const rects = new Map<string, P[][]>(), firma = new Map(muros.map(m => [m.id, firmaMuro(m)]));
  const ocupado: Anillo[][] = [];
  const caja = (pgs: P[][]) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; pgs.forEach(pg => pg.forEach(q => { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); })); return { x0, y0, x1, y1 }; };
  const cajas: ReturnType<typeof caja>[] = [];
  muros.filter(esColumna).forEach(m => { const b = base(m); rects.set(m.id, b); b.forEach(pg => { ocupado.push(aAnillos(pg)); cajas.push(caja([pg])); }); });
  const ws = muros.filter(m => !esColumna(m)).map(m => ({ m, E: ejeDeMuro(m)! })).sort((a, b) => b.E.L - a.E.L);
  for (const { m, E } of ws) {
    const b = base(m), cb = caja(b);
    const tocan = ocupado.filter((_, i) => { const c = cajas[i]; return c.x0 < cb.x1 && cb.x0 < c.x1 && c.y0 < cb.y1 && cb.y0 < c.y1; });
    let res = b;
    if (tocan.length) {
      const d = diferencia(b.map(aAnillos), ...tocan) ?? b.map(aAnillos);
      // pedazos: se descartan los que miden a lo largo del muro menos que su espesor (lo que asoma del otro lado)
      const largo = (pg: Anillo[]) => { const ts = pg[0].map(([x, y]) => (x - E.a.x) * E.u.x + (y - E.a.y) * E.u.y); return Math.max(...ts) - Math.min(...ts); };
      const quedan = d.filter(pg => largo(pg) >= Math.min(E.e, 0.5 * E.L));
      res = deAnillos(quedan.length ? quedan : d);
    }
    rects.set(m.id, res);
    res.forEach(pg => { ocupado.push(aAnillos(pg)); cajas.push(caja([pg])); });
  }
  return { rects, firma };
}

/** la geometría de cálculo activa (A o D; la pone el cálculo con el proyecto que se está calculando) */
let activo: Escuadra | null = null;
let activoD = false;
export function usarEscuadra(e: Escuadra | null, d = false) { activo = e; activoD = d; }
/** está activo el criterio D (muros a escuadra) */
export const conEscuadra = () => activoD && !!activo;
/** los polígonos de cálculo de un muro (A o D), si hay geometría activa y el muro no cambió */
export function rectsEscuadra(m: Muro): P[][] | null {
  if (!activo || activo.firma.get(m.id) !== firmaMuro(m)) return null;
  return activo.rects.get(m.id) ?? null;
}

/** pone el criterio del proyecto (D o el diseño), sin rehacerlo si los muros no cambiaron */
let firmaActiva = '';
export function criterioDelProyecto(p: { encuentrosCalculo?: 'escuadra' | null; muros: Muro[]; juntas?: Record<string, EleccionJunta> }) {
  const D = p.encuentrosCalculo === 'escuadra';
  const ms = p.muros.filter(m => m.llega && !(m.zDesde && m.zDesde > 0));
  const f = JSON.stringify([D, p.juntas ?? {}, ms.map(m => [m.id, firmaMuro(m)])]);
  if (activo && f === firmaActiva) return;
  // A (el diseño): el dibujo resuelve los encuentros con aTope; el cálculo usa la sección de cada pieza sin repetir lo que
  // se pisa (seccionReal), sin cortar contra otras piezas, como la planilla (App = Excel). D: todo a escuadra
  activo = D ? aEscuadra(ms) : null; activoD = D; firmaActiva = f;
}
