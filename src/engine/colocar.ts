/**
 * Colocación de muros y grupos en la planta: mover, girar (de a 90°), simetría (ejes horizontal, vertical y a 45°),
 * escalar, matrices (rectangular, polar y sobre un camino), alinear y distribuir. También los caminos: dibujarlos
 * con rectas y arcos, unir tramos que se tocan en un solo camino y recorrerlos para la matriz.
 *
 * Los muros de la app van en x o en y; los giros libres (diagonales) llegan con los elementos diagonales. Por eso los
 * giros son de 90°, 180° o 270°, y en las matrices polares o sobre un camino con otros ángulos las copias no giran
 * (o giran al múltiplo de 90° más cercano a la tangente).
 */
import type { Camino, Muro, Proyecto, Ubicacion } from './modelo';
import { cajaMuro, tipoDe } from './modelo';
import { agruparNodos, copiarNodo, espejarMuro, girarMuro, grupoPorId, muroBloqueado, murosDe, rehacerPiezas, subgrupos } from './grupos';
import type { Punto } from './silueta';
import { polilinea, desdeEje, escalar as escalarPerfil, girar as girarPerfil, perfilDeMuro, ponerPerfil, trasladar } from './perfil';

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
export type Seleccion = { m: string[]; g: string[] };
export type EjeSimetria = 'x' | 'y' | 'd1' | 'd2';   // x: recta vertical · y: horizontal · d1: a 45° (y = x) · d2: a −45°

/** muros y grupos (con sus subgrupos) de una selección */
export function resolver(p: Proyecto, sel: Seleccion): { ids: Set<string>; grupos: Set<string> } {
  const ids = new Set(sel.m);
  const grupos = new Set<string>();
  sel.g.forEach(g => { murosDe(p, g).forEach(m => ids.add(m.id)); subgrupos(p, g).forEach(s => grupos.add(s)); });
  return { ids, grupos };
}
export const vacia = (sel: Seleccion) => !sel.m.length && !sel.g.length;

/** caja de un conjunto de muros */
export function caja(ms: Muro[]): { x0: number; x1: number; y0: number; y1: number; cx: number; cy: number } {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  ms.forEach(m => { const k = cajaMuro(m); x0 = Math.min(x0, k.x0); x1 = Math.max(x1, k.x1); y0 = Math.min(y0, k.y0); y1 = Math.max(y1, k.y1); });
  if (!isFinite(x0)) return { x0: 0, x1: 0, y0: 0, y1: 0, cx: 0, cy: 0 };
  return { x0, x1, y0, y1, cx: r4((x0 + x1) / 2), cy: r4((y0 + y1) / 2) };
}
export const cajaSel = (p: Proyecto, sel: Seleccion) => { const { ids } = resolver(p, sel); return caja(p.muros.filter(m => ids.has(m.id))); };

// ------------------------------------------------------------------ transformaciones de la ubicación de una copia
const tMover = (T: Ubicacion, dx: number, dy: number): Ubicacion => ({ ...T, x: r4(T.x + dx), y: r4(T.y + dy) });
const tGirar = (T: Ubicacion, c: Punto): Ubicacion => ({ x: r4(c.x - (T.y - c.y)), y: r4(c.y + (T.x - c.x)), g: ((T.g + 1) % 4) as Ubicacion['g'], e: T.e });
const tEspejar = (T: Ubicacion, eje: 'x' | 'y', c: Punto): Ubicacion => ({
  x: eje === 'x' ? r4(2 * c.x - T.x) : T.x, y: eje === 'y' ? r4(2 * c.y - T.y) : T.y,
  g: (eje === 'x' ? (4 - T.g) % 4 : (6 - T.g) % 4) as Ubicacion['g'], e: !T.e,
});

export type Operacion =
  | { t: 'mover'; dx: number; dy: number }
  | { t: 'girar'; c: Punto; q: 1 | 2 | 3 }
  | { t: 'espejar'; eje: EjeSimetria; c: Punto }
  | { t: 'escalar'; c: Punto; f: number; espesor: boolean };

/** aplica una operación a los muros y grupos de la selección. Devuelve un error si algo está bloqueado. */
export function aplicar(p: Proyecto, sel: Seleccion, op: Operacion): string | null {
  const { ids, grupos } = resolver(p, sel);
  if (!ids.size) return 'No hay nada elegido.';
  if (p.muros.some(m => ids.has(m.id) && muroBloqueado(p, m))) return 'Lo elegido tiene muros bloqueados 🔒: desbloquealos primero.';
  const T = (f: (t: Ubicacion) => Ubicacion) => grupos.forEach(s => { const g = grupoPorId(p, s); if (g?.T) g.T = f(g.T); });
  const cada = (f: (m: Muro) => Muro) => { p.muros = p.muros.map(m => (ids.has(m.id) ? f(m) : m)); };
  if (op.t === 'mover') { cada(m => ({ ...m, x: r4(m.x + op.dx), y: r4(m.y + op.dy) })); T(t => tMover(t, op.dx, op.dy)); return null; }
  if (op.t === 'girar') {
    for (let k = 0; k < op.q; k++) { cada(m => girarMuro(m, op.c.x, op.c.y)); T(t => tGirar(t, op.c)); }
    p.muros = rehacerPiezas(p.muros, ids);
    return null;
  }
  if (op.t === 'espejar') {
    // a 45°: espejo horizontal (o vertical) y un cuarto de vuelta
    const base: 'x' | 'y' = op.eje === 'x' || op.eje === 'd2' ? 'x' : 'y';
    cada(m => espejarMuro(m, base, base === 'x' ? op.c.x : op.c.y)); T(t => tEspejar(t, base, op.c));
    if (op.eje === 'd1' || op.eje === 'd2') { cada(m => girarMuro(m, op.c.x, op.c.y)); T(t => tGirar(t, op.c)); p.muros = rehacerPiezas(p.muros, ids); }
    return null;
  }
  // escalar: posiciones y largos; el espesor solo si se pide
  if (!(op.f > 0)) return 'El factor tiene que ser mayor que cero.';
  cada(m => {
    if (tipoDe(m) === 'perfil') return ponerPerfil(m, trasladar(escalarPerfil(m.perfil!, op.f), r4(op.c.x + (m.x - op.c.x) * op.f), r4(op.c.y + (m.y - op.c.y) * op.f)));
    const n: Muro = { ...m, x: r4(op.c.x + (m.x - op.c.x) * op.f), y: r4(op.c.y + (m.y - op.c.y) * op.f), largo: r4(m.largo * op.f) };
    if (tipoDe(m) === 'tubo-rect' && m.ladoY) n.ladoY = r4(m.ladoY * op.f);
    if (op.espesor) n.espesor = r4(m.espesor * op.f);
    if (n.pieza) n.pieza = { ...n.pieza, med: { ...n.pieza.med, h: r4(n.pieza.med.h * op.f), b: r4((n.pieza.med.b ?? 0) * op.f), ...(op.espesor ? { e: r4(n.pieza.med.e * op.f) } : {}) } };
    return n;
  });
  T(t => ({ ...t, x: r4(op.c.x + (t.x - op.c.x) * op.f), y: r4(op.c.y + (t.y - op.c.y) * op.f) }));
  return null;
}

/**
 * La selección como un solo grupo (para copiarla): si ya es un grupo, ese; si no, se agrupa en un grupo nuevo dentro
 * del grupo que se está editando.
 */
export function comoGrupo(p: Proyecto, sel: Seleccion, contexto: string | null, nombre = 'Elemento'): { id: string } | { error: string } {
  if (sel.g.length === 1 && !sel.m.length) return { id: sel.g[0] };
  const k = (p.grupos ?? []).filter(g => g.nombre.startsWith(nombre)).length + 1;
  return agruparNodos(p, sel.m, sel.g, contexto, `${nombre} ${k}`);
}

/** copia la selección y le aplica una operación (copiar desplazado, girado, espejado…). Devuelve el grupo de la copia. */
export function copiarCon(p: Proyecto, sel: Seleccion, contexto: string | null, op: Operacion, vinculada: boolean): { id: string; original: string } | { error: string } {
  const g = comoGrupo(p, sel, contexto);
  if ('error' in g) return g;
  const c = copiarNodo(p, g.id, 0, 0, vinculada);
  if ('error' in c) return c;
  const e = aplicar(p, { m: [], g: [c.id] }, op);
  return e ? { error: e } : { id: c.id, original: g.id };
}

/** junta el original y sus copias en un grupo «Matriz n» */
function juntar(p: Proyecto, original: string, copias: string[], nombre: string): string {
  const padre = grupoPorId(p, original)?.padre ?? null;
  const k = (p.grupos ?? []).filter(g => g.nombre.startsWith(nombre)).length + 1;
  const r = agruparNodos(p, [], [original, ...copias], padre, `${nombre} ${k}`);
  return 'error' in r ? original : r.id;
}

export interface ResultadoMatriz { grupo: string; copias: number; aviso?: string }

/** matriz rectangular: filas × columnas con paso dx, dy (el original es la de abajo a la izquierda) */
export function matrizRect(p: Proyecto, sel: Seleccion, contexto: string | null, filas: number, cols: number, dx: number, dy: number, vinculada: boolean): ResultadoMatriz | { error: string } {
  filas = Math.max(1, Math.round(filas)); cols = Math.max(1, Math.round(cols));
  if (filas * cols < 2) return { error: 'Con 1 × 1 no hay copias.' };
  if (filas * cols > 400) return { error: 'Son demasiadas copias (máximo 400).' };
  const g = comoGrupo(p, sel, contexto);
  if ('error' in g) return g;
  const copias: string[] = [];
  for (let i = 0; i < filas; i++) for (let j = 0; j < cols; j++) {
    if (!i && !j) continue;
    const c = copiarNodo(p, g.id, 0, 0, vinculada);
    if ('error' in c) return c;
    aplicar(p, { m: [], g: [c.id] }, { t: 'mover', dx: j * dx, dy: i * dy });
    copias.push(c.id);
  }
  return { grupo: juntar(p, g.id, copias, 'Matriz'), copias: copias.length };
}

/** matriz polar: n elementos alrededor de c en un ángulo total (360° = vuelta entera). «girar»: las copias giran con el ángulo */
export function matrizPolar(p: Proyecto, sel: Seleccion, contexto: string | null, c: Punto, n: number, total: number, girar: boolean, vinculada: boolean): ResultadoMatriz | { error: string } {
  n = Math.round(n);
  if (n < 2) return { error: 'Hacen falta al menos 2 elementos.' };
  if (n > 400) return { error: 'Son demasiadas copias (máximo 400).' };
  const g = comoGrupo(p, sel, contexto);
  if ('error' in g) return g;
  const paso = Math.abs(Math.abs(total) - 360) < 1e-9 ? total / n : total / (n - 1);
  const q90 = (a: number) => Math.abs(a / 90 - Math.round(a / 90)) < 1e-9;
  const puedeGirar = girar && q90(paso);
  const k0 = caja(murosDe(p, g.id));
  const copias: string[] = [];
  for (let k = 1; k < n; k++) {
    const a = paso * k, cp = copiarNodo(p, g.id, 0, 0, vinculada);
    if ('error' in cp) return cp;
    if (puedeGirar) {
      const q = ((Math.round(a / 90) % 4) + 4) % 4;
      if (q) aplicar(p, { m: [], g: [cp.id] }, { t: 'girar', c, q: q as 1 | 2 | 3 });
    } else {
      const t = (a * Math.PI) / 180, vx = k0.cx - c.x, vy = k0.cy - c.y;
      aplicar(p, { m: [], g: [cp.id] }, { t: 'mover', dx: r4(c.x + vx * Math.cos(t) - vy * Math.sin(t) - k0.cx), dy: r4(c.y + vx * Math.sin(t) + vy * Math.cos(t) - k0.cy) });
    }
    copias.push(cp.id);
  }
  return { grupo: juntar(p, g.id, copias, 'Matriz polar'), copias: copias.length, aviso: girar && !puedeGirar ? 'Las copias no giran: con este ángulo quedarían en diagonal (los giros libres llegan con los elementos diagonales).' : undefined };
}

// ------------------------------------------------------------------ caminos
/** puntos del camino (los arcos partidos en tramos cortos) */
export function puntosCamino(c: Camino, grados = 3): Punto[] {
  if (c.v.length < 2) return c.v.map(q => ({ x: q.x, y: q.y }));
  if (c.cerrado) { const pts = polilinea(c.v, grados); return [...pts, pts[0]]; }
  // abierto: el último vértice no tiene tramo de salida (el tramo de vuelta es recto y no agrega puntos)
  return polilinea(c.v.map((q, i) => (i === c.v.length - 1 ? { x: q.x, y: q.y } : q)), grados);
}
export function largoCamino(c: Camino): number {
  const pts = puntosCamino(c, 1);
  let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}
/** punto y dirección (en grados) a la distancia s desde el inicio */
export function puntoEn(c: Camino, s: number): { p: Punto; ang: number } {
  const pts = puntosCamino(c, 1);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + d >= s - 1e-9 || i === pts.length - 1) {
      const f = d ? Math.min(1, Math.max(0, (s - acc) / d)) : 0;
      return { p: { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) }, ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
    }
    acc += d;
  }
  return { p: pts[0] ?? { x: 0, y: 0 }, ang: 0 };
}
/** el mismo camino recorrido al revés (los arcos cambian de signo y pasan al vértice anterior) */
export function invertirCamino(c: Camino): Camino {
  const n = c.v.length;
  // el tramo que sale del vértice nuevo i es el viejo que llegaba a él, recorrido al revés (arco con el signo
  // cambiado, Bézier con los puntos de control intercambiados)
  const tramo = (j: number) => { const o = c.v[((j % n) + n) % n]; return { ...(o.b ? { b: -o.b } : {}), ...(o.c1 && o.c2 ? { c1: { ...o.c2 }, c2: { ...o.c1 } } : {}) }; };
  if (c.cerrado) return { ...c, v: c.v.map((_q, i) => { const q = c.v[(n - i) % n]; return { x: q.x, y: q.y, ...tramo(n - i - 1) }; }) };
  return { ...c, v: c.v.map((_q, i) => { const q = c.v[n - 1 - i]; return { x: q.x, y: q.y, ...(i < n - 1 ? tramo(n - 2 - i) : {}) }; }) };
}

/**
 * Une caminos que se tocan por sus puntas (a menos de «tol» m) en un solo camino. Los da vuelta si hace falta.
 * Si las puntas de inicio y fin coinciden, queda cerrado.
 */
export function unirCaminos(cs: Camino[], tol = 0.01): { v: Camino['v']; cerrado: boolean } | { error: string } {
  const abiertos = cs.filter(c => c.v.length >= 2);
  if (abiertos.length < 2) return { error: 'Elegí al menos dos tramos para unir.' };
  if (abiertos.some(c => c.cerrado)) return { error: 'Un camino cerrado no se puede unir con otros.' };
  const cerca = (a: Punto, b: Punto) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;
  let v = abiertos[0].v.map(q => ({ ...q }));
  const resto = abiertos.slice(1);
  while (resto.length) {
    const ini = v[0], fin = v[v.length - 1];
    const i = resto.findIndex(c => cerca(c.v[0], fin) || cerca(c.v[c.v.length - 1], fin) || cerca(c.v[0], ini) || cerca(c.v[c.v.length - 1], ini));
    if (i < 0) {
      const d = Math.min(...resto.flatMap(c => [c.v[0], c.v[c.v.length - 1]].flatMap(q => [Math.hypot(q.x - fin.x, q.y - fin.y), Math.hypot(q.x - ini.x, q.y - ini.y)])));
      return { error: `Quedan ${resto.length} tramo${resto.length > 1 ? 's' : ''} sin tocar al resto (la separación más chica es de ${(d * 100).toFixed(1).replace('.', ',')} cm; se unen a menos de ${(tol * 100).toFixed(0)} cm).` };
    }
    let c = resto.splice(i, 1)[0];
    if (cerca(c.v[0], fin)) { v[v.length - 1] = { x: v[v.length - 1].x, y: v[v.length - 1].y, ...(c.v[0].b ? { b: c.v[0].b } : {}), ...(c.v[0].c1 ? { c1: c.v[0].c1, c2: c.v[0].c2 } : {}) }; v = [...v, ...c.v.slice(1).map(q => ({ ...q }))]; }
    else if (cerca(c.v[c.v.length - 1], fin)) { c = invertirCamino(c); v[v.length - 1] = { x: v[v.length - 1].x, y: v[v.length - 1].y, ...(c.v[0].b ? { b: c.v[0].b } : {}), ...(c.v[0].c1 ? { c1: c.v[0].c1, c2: c.v[0].c2 } : {}) }; v = [...v, ...c.v.slice(1).map(q => ({ ...q }))]; }
    else if (cerca(c.v[c.v.length - 1], ini)) v = [...c.v.slice(0, -1).map(q => ({ ...q })), ...v];
    else { c = invertirCamino(c); v = [...c.v.slice(0, -1).map(q => ({ ...q })), ...v]; }
  }
  // limpia los «b» vacíos; si cierra, el último vértice se funde con el primero
  let cerrado = false;
  if (v.length > 2 && cerca(v[0], v[v.length - 1])) { v.pop(); cerrado = true; }
  return { v: v.map(q => ({ x: r4(q.x), y: r4(q.y), ...(q.b ? { b: q.b } : {}), ...(q.c1 ? { c1: q.c1, c2: q.c2 } : {}) })), cerrado };
}

/** bulge del arco que va de a a b pasando por m (b = tan(θ/4), θ con signo) */
export function bulgeTresPuntos(a: Punto, m: Punto, b: Punto): number {
  const ax = a.x - m.x, ay = a.y - m.y, bx = b.x - m.x, by = b.y - m.y;
  const cr = ax * by - ay * bx;
  if (Math.abs(cr) < 1e-12) return 0;
  // ángulo inscripto en m: el arco (del lado opuesto a m) mide 2·(π − ángulo en m)
  const ang = Math.atan2(Math.abs(cr), ax * bx + ay * by);
  const th = 2 * (Math.PI - ang) * (cr > 0 ? -1 : 1);
  return Math.tan(th / 4);
}

/** camino desde una entidad del dibujo de CAD (línea, polilínea, arco o círculo; ángulos de los arcos en grados) */
export function caminoDesdeCAD(e: import('./cad').Entidad, id: string, nombre: string): Camino {
  if (e.t === 'linea') return { id, nombre, v: [{ ...e.a }, { ...e.b }], cerrado: false };
  if (e.t === 'poli') return { id, nombre, v: e.v.map(q => ({ ...q })), cerrado: e.cerrada };
  if (e.t === 'circulo') return { id, nombre, v: [{ x: e.c.x + e.r, y: e.c.y, b: 1 }, { x: e.c.x - e.r, y: e.c.y, b: 1 }], cerrado: true };
  const a0 = (e.a0 * Math.PI) / 180; let a1 = (e.a1 * Math.PI) / 180;
  if (a1 <= a0) a1 += 2 * Math.PI;
  const th = a1 - a0;
  return { id, nombre, v: [{ x: e.c.x + e.r * Math.cos(a0), y: e.c.y + e.r * Math.sin(a0), b: Math.tan(th / 4) }, { x: e.c.x + e.r * Math.cos(a1), y: e.c.y + e.r * Math.sin(a1) }], cerrado: false };
}

/**
 * Matriz sobre un camino: copias repartidas a lo largo del camino, por cantidad o por paso, con desfase al inicio y
 * al final. El centro de la caja del elemento va sobre el camino. «tangente»: cada copia gira al múltiplo de 90° más
 * cercano a la dirección del camino; si no, todas quedan como el original.
 */
export function matrizCamino(p: Proyecto, sel: Seleccion, contexto: string | null, cam: Camino, o: { n?: number; paso?: number; d0?: number; d1?: number; tangente?: boolean; vinculada: boolean }): ResultadoMatriz | { error: string } {
  const L = largoCamino(cam), d0 = Math.max(0, o.d0 ?? 0), d1 = Math.max(0, o.d1 ?? 0), util = L - d0 - d1;
  if (util < 0) return { error: 'Los desfases son más largos que el camino.' };
  const n = o.paso && o.paso > 0 ? Math.floor(util / o.paso + 1e-9) + 1 : Math.round(o.n ?? 0);
  if (n < 2) return { error: 'Entran menos de 2 copias: bajá el paso o subí la cantidad.' };
  if (n > 400) return { error: 'Son demasiadas copias (máximo 400).' };
  const paso = o.paso && o.paso > 0 ? o.paso : cam.cerrado && !d0 && !d1 ? util / n : util / (n - 1);
  const g = comoGrupo(p, sel, contexto);
  if ('error' in g) return g;
  const k0 = caja(murosDe(p, g.id));
  const q4 = (ang: number) => ((Math.round(ang / 90) % 4) + 4) % 4;
  const lugar = (s: number) => puntoEn(cam, s);
  const ang0 = lugar(d0).ang;
  // el original también va al primer lugar del camino
  const ub = (id: string, k: number, primero: boolean) => {
    const { p: q, ang } = lugar(d0 + k * paso);
    const kk = primero ? k0 : caja(murosDe(p, id));
    aplicar(p, { m: [], g: [id] }, { t: 'mover', dx: r4(q.x - kk.cx), dy: r4(q.y - kk.cy) });
    if (o.tangente) { const qq = q4(ang - ang0); if (qq) aplicar(p, { m: [], g: [id] }, { t: 'girar', c: q, q: qq as 1 | 2 | 3 }); }
  };
  const copias: string[] = [];
  for (let k = 1; k < n; k++) { const cp = copiarNodo(p, g.id, 0, 0, o.vinculada); if ('error' in cp) return cp; copias.push(cp.id); }
  ub(g.id, 0, true);
  copias.forEach((id, i) => ub(id, i + 1, false));
  return { grupo: juntar(p, g.id, copias, 'Matriz sobre camino'), copias: copias.length };
}

// ------------------------------------------------------------------ alinear y distribuir
export type Alineacion = 'izq' | 'cx' | 'der' | 'abajo' | 'cy' | 'arriba';
/** cada elemento elegido (muro suelto o grupo) con su caja */
function elementos(p: Proyecto, sel: Seleccion) {
  return [...sel.m.map(id => ({ s: { m: [id], g: [] } as Seleccion })), ...sel.g.map(id => ({ s: { m: [], g: [id] } as Seleccion }))].map(e => ({ ...e, k: cajaSel(p, e.s) }));
}
export function alinear(p: Proyecto, sel: Seleccion, a: Alineacion): string | null {
  const es = elementos(p, sel);
  if (es.length < 2) return 'Elegí al menos dos elementos para alinear.';
  const ref = a === 'izq' ? Math.min(...es.map(e => e.k.x0)) : a === 'der' ? Math.max(...es.map(e => e.k.x1)) : a === 'abajo' ? Math.min(...es.map(e => e.k.y0)) : a === 'arriba' ? Math.max(...es.map(e => e.k.y1))
    : a === 'cx' ? (Math.min(...es.map(e => e.k.x0)) + Math.max(...es.map(e => e.k.x1))) / 2 : (Math.min(...es.map(e => e.k.y0)) + Math.max(...es.map(e => e.k.y1))) / 2;
  for (const e of es) {
    const d = a === 'izq' ? ref - e.k.x0 : a === 'der' ? ref - e.k.x1 : a === 'cx' ? ref - e.k.cx : a === 'abajo' ? ref - e.k.y0 : a === 'arriba' ? ref - e.k.y1 : ref - e.k.cy;
    const horiz = a === 'izq' || a === 'der' || a === 'cx';
    const err = aplicar(p, e.s, { t: 'mover', dx: horiz ? r4(d) : 0, dy: horiz ? 0 : r4(d) });
    if (err) return err;
  }
  return null;
}
/** reparte con la misma separación libre entre cajas; quedan fijos el primero y el último */
export function distribuir(p: Proyecto, sel: Seleccion, sentido: 'h' | 'v'): string | null {
  const es = elementos(p, sel);
  if (es.length < 3) return 'Elegí al menos tres elementos para distribuir.';
  const h = sentido === 'h';
  es.sort((a, b) => (h ? a.k.cx - b.k.cx : a.k.cy - b.k.cy));
  const tam = (e: (typeof es)[number]) => (h ? e.k.x1 - e.k.x0 : e.k.y1 - e.k.y0);
  const ini = h ? es[0].k.x0 : es[0].k.y0, fin = h ? es[es.length - 1].k.x1 : es[es.length - 1].k.y1;
  const libre = (fin - ini - es.reduce((s, e) => s + tam(e), 0)) / (es.length - 1);
  let pos = ini;
  for (const e of es) {
    const actual = h ? e.k.x0 : e.k.y0, d = r4(pos - actual);
    if (d) { const err = aplicar(p, e.s, { t: 'mover', dx: h ? d : 0, dy: h ? 0 : d }); if (err) return err; }
    pos += tam(e) + libre;
  }
  return null;
}

// ------------------------------------------------------------------ perfiles desde caminos y giros libres
const idMuroLibre = (p: Proyecto) => { for (let k = 1; ; k++) if (!p.muros.some(m => m.id === `M${k}`)) return `M${k}`; };
const piezaLibre = (p: Proyecto) => { const u = new Set(p.muros.flatMap(m => [m.piezaA, m.piezaB, m.grupo ?? ''])); for (let k = 1; ; k++) if (!u.has(`T${k}`)) return `T${k}`; };
function muroPerfil(p: Proyecto, perfil: import('./perfil').Perfil, gd?: string): Muro {
  const id = idMuroLibre(p), t = piezaLibre(p);
  const base: Muro = { id, dir: 'Y', x: 0, y: 0, largo: 1, espesor: 1, llega: true, areaInf: 10, piezaA: t, pegadoA: '', piezaB: `${t}B`, pegadoB: '', ...(gd ? { gd } : {}) };
  return ponerPerfil(base, perfil);
}
/** perfil irregular con el contorno de un camino cerrado */
export function perfilDesdeCamino(p: Proyecto, c: Camino, gd?: string): { id: string } | { error: string } {
  if (!c.cerrado) return { error: 'El camino tiene que estar cerrado (unilo o cerralo) para ser el contorno de un perfil.' };
  if (c.v.length < 3 && !c.v.some(q => q.b)) return { error: 'El camino necesita al menos tres puntos.' };
  const m = muroPerfil(p, { v: c.v.map(q => ({ ...q })) }, gd);
  p.muros.push(m);
  return { id: m.id };
}
/** muro (perfil) de espesor e a lo largo de un camino abierto: el eje es el camino */
export function muroSobreCamino(p: Proyecto, c: Camino, e: number, gd?: string): { id: string } | { error: string } {
  if (c.cerrado) return { error: 'Para un muro sobre el camino, el camino tiene que estar abierto.' };
  const pf = desdeEje(puntosCamino(c, 3), e);
  if (!pf) return { error: 'No se pudo armar el muro (espesor o camino inválidos).' };
  const m = muroPerfil(p, pf, gd);
  p.muros.push(m);
  return { id: m.id };
}
/**
 * Giro con cualquier ángulo alrededor de c: los perfiles giran; los tabiques y tubos se convierten antes en perfiles
 * (quedan en diagonal). Devuelve cuántos se convirtieron.
 */
export function girarLibre(p: Proyecto, sel: Seleccion, c: Punto, grados: number): { convertidos: number } | { error: string } {
  const { ids } = resolver(p, sel);
  if (!ids.size) return { error: 'No hay nada elegido.' };
  if (p.muros.some(m => ids.has(m.id) && muroBloqueado(p, m))) return { error: 'Lo elegido tiene muros bloqueados 🔒.' };
  const a = (grados * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  let convertidos = 0;
  p.muros = p.muros.map(m => {
    if (!ids.has(m.id)) return m;
    if (tipoDe(m) !== 'perfil') convertidos++;
    const pl = perfilDeMuro(m);                                  // en la planta
    const local = trasladar(pl, -c.x, -c.y), g = girarPerfil(local, grados);
    void cs; void sn;
    const { pegadoA: _a, pegadoB: _b, rolA: _ra, rolB: _rb, ...resto } = m; void _a; void _b; void _ra; void _rb;
    return ponerPerfil({ ...resto, pegadoA: '', pegadoB: '' } as Muro, trasladar(g, c.x, c.y));
  });
  return { convertidos };
}
