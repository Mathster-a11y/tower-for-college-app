/**
 * Áreas de influencia de la losa: cada punto de la losa descarga en el elemento vertical más cercano (el criterio de
 * «mitad de la luz»: el borde entre dos áreas queda a igual distancia de los dos elementos). Se cuadricula la losa
 * del nivel y cada cuadradito se suma al muro o columna más cercano.
 */
import { huecoEn, presenteEn, rectangulos, tipoDe, type Muro, type Proyecto } from './modelo';
import { plantaDeNivel, puntosSilueta } from './silueta';

type Punto = { x: number; y: number };

/** punto dentro de un polígono (regla par-impar) */
export function dentro(q: Punto, pol: Punto[]): boolean {
  let c = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const a = pol[i], b = pol[j];
    if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
/** distancia de un punto al elemento (0 si cae adentro) */
export function distancia(q: Punto, m: Muro): number {
  if (tipoDe(m) === 'tubo-circ') return Math.max(0, Math.hypot(q.x - m.x, q.y - m.y) - m.largo / 2);
  return Math.min(...rectangulos(m).map(r => Math.hypot(Math.max(0, Math.abs(q.x - r.x) - r.ax / 2), Math.max(0, Math.abs(q.y - r.y) - r.ay / 2))));
}

export interface AreasInfluencia {
  /** área (m²) por id de muro */
  area: Record<string, number>;
  /** área total de la losa (m²) */
  total: number;
  /** cuadrícula: lado (m), origen y dueño de cada celda (índice en «ids», −1 = fuera de la losa) */
  paso: number; x0: number; y0: number; nx: number; ny: number; duenio: Int16Array; ids: string[];
  /** área de los huecos de la losa (m²) */
  huecos?: number;
  /** centro de cada área (para el rótulo) */
  centro: Record<string, Punto>;
}

/** id del exoesqueleto en las áreas de influencia (no es un muro: lleva la franja de losa junto a la fachada) */
export const ID_EXO = 'exo';
/** franja de losa que apoya en el exo en la cota z (0 si el proyecto no tiene exo, sus losas no apoyan en él o no llega a esa altura) */
export function franjaExo(p: Proyecto, z: number): number {
  const x = p.exo;
  if (!x || !x.losas || !(x.losas.franja > 0)) return 0;
  const tope = x.circular?.hasta ?? x.cortes?.[x.cortes.length - 1] ?? Infinity;
  return z <= tope + 1e-6 ? x.losas.franja : 0;
}
/** envolvente convexa (cadena monótona): el exo envuelve el contorno de afuera, no entra en las muescas de la losa */
function envolvente(pts: Punto[]): Punto[] {
  const q = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (q.length < 3) return q;
  const cruz = (o: Punto, a: Punto, b: Punto) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const abajo: Punto[] = [], arriba: Punto[] = [];
  for (const r of q) { while (abajo.length >= 2 && cruz(abajo[abajo.length - 2], abajo[abajo.length - 1], r) <= 0) abajo.pop(); abajo.push(r); }
  for (let i = q.length - 1; i >= 0; i--) { const r = q[i]; while (arriba.length >= 2 && cruz(arriba[arriba.length - 2], arriba[arriba.length - 1], r) <= 0) arriba.pop(); arriba.push(r); }
  return [...abajo.slice(0, -1), ...arriba.slice(0, -1)];
}
/** distancia de un punto al borde de un polígono */
function aBorde(q: Punto, pol: Punto[]): number {
  let d = Infinity;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const a = pol[j], b = pol[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2)) : 0;
    d = Math.min(d, Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy));
  }
  return d;
}

/**
 * áreas de influencia en la losa del nivel i (los elementos que están en esa planta). Si las losas apoyan en el
 * exoesqueleto (exo.losas), la franja de ese ancho junto a la fachada va al exo (id «exo»), como en su cálculo
 * (etapa 08); el resto, al muro más cercano. La franja se mide desde el contorno de afuera (la envolvente convexa de
 * la losa, por donde pasa el exo): las muescas de la losa (los atrios del Gherkin) no la corren hacia adentro.
 */
export function areasInfluencia(p: Proyecto, i: number, paso = 0.25): AreasInfluencia {
  const zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0, zTop = p.niveles[0]?.cota ?? 0;
  const z = p.niveles[i]?.cota ?? 0;
  const ms = p.muros.filter(m => presenteEn(m, z, zFund, zTop));
  const pol = puntosSilueta(plantaDeNivel(p, i).silueta, 6);
  // huecos de la losa de este nivel (ascensores, escaleras): ahí no hay losa que cargar
  const huecos = (p.huecosLosa ?? []).filter(h => huecoEn(h, z) && h.v.length >= 3).map(h => h.v);
  const xs = pol.map(q => q.x), ys = pol.map(q => q.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const nx = Math.max(1, Math.ceil((Math.max(...xs) - x0) / paso)), ny = Math.max(1, Math.ceil((Math.max(...ys) - y0) / paso));
  const duenio = new Int16Array(nx * ny).fill(-1);
  const fr = franjaExo(p, z);
  const contornoExo = fr > 0 ? envolvente(pol) : [];
  const ids = [...ms.map(m => m.id), ...(fr > 0 ? [ID_EXO] : [])], iExo = fr > 0 ? ms.length : -1;
  const area: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]));
  const sx: number[] = ids.map(() => 0), sy: number[] = ids.map(() => 0);
  // el rótulo del exo va sobre la franja, arriba (su centro de gravedad cae en el medio de la planta, sobre el núcleo)
  const xMed = (Math.min(...xs) + Math.max(...xs)) / 2, yRot = Math.max(...ys) - fr / 2;
  let rotExo: Punto | null = null, dRot = Infinity;
  let total = 0, enHuecos = 0;
  for (let j = 0; j < ny; j++) for (let k = 0; k < nx; k++) {
    const q = { x: x0 + (k + 0.5) * paso, y: y0 + (j + 0.5) * paso };
    if (!dentro(q, pol)) continue;
    if (huecos.some(h => dentro(q, h))) { enHuecos += paso * paso; continue; }
    total += paso * paso;
    let mejor = -1;
    if (iExo >= 0 && aBorde(q, contornoExo) < fr) {
      mejor = iExo;
      const dr = Math.hypot(q.x - xMed, q.y - yRot);
      if (dr < dRot) { dRot = dr; rotExo = q; }
    } else if (ms.length) {
      let dMin = Infinity;
      ms.forEach((m, n) => { const d = distancia(q, m); if (d < dMin - 1e-9) { dMin = d; mejor = n; } });
    } else if (iExo >= 0) mejor = iExo;   // arriba del núcleo, toda la losa cuelga del exo
    if (mejor < 0) continue;
    duenio[j * nx + k] = mejor;
    area[ids[mejor]] += paso * paso;
    sx[mejor] += q.x; sy[mejor] += q.y;
  }
  const centro: Record<string, Punto> = {};
  ids.forEach((id, n) => {
    const c = area[id] / (paso * paso), m = ms[n];
    centro[id] = n === iExo ? (rotExo ?? { x: xMed, y: yRot }) : c ? { x: sx[n] / c, y: sy[n] / c } : { x: m.x, y: m.y };
    area[id] = Math.round(area[id] * 100) / 100;
  });
  return { area, total: Math.round(total * 100) / 100, huecos: Math.round(enHuecos * 100) / 100, paso, x0, y0, nx, ny, duenio, ids, centro };
}

// ------------------------------------------------------------------ colores del mapa de áreas (cuatro colores)
/**
 * Vecindades entre regiones: dos claves son vecinas si alguna celda de una toca (por un lado) a una celda de la otra.
 * «clave» da la región de cada dueño (por ejemplo, el grupo del muro).
 */
export function vecindades(a: AreasInfluencia, clave: (indiceDuenio: number) => string): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const k = (o: number) => (o < 0 ? null : clave(o));
  const unir = (x: string, y: string) => { if (x === y) return; adj.get(x)!.add(y); adj.get(y)!.add(x); };
  for (let j = 0; j < a.ny; j++) for (let i = 0; i < a.nx; i++) {
    const c = k(a.duenio[j * a.nx + i]);
    if (c === null) continue;
    if (!adj.has(c)) adj.set(c, new Set());
    if (i + 1 < a.nx) { const d = k(a.duenio[j * a.nx + i + 1]); if (d !== null) { if (!adj.has(d)) adj.set(d, new Set()); unir(c, d); } }
    if (j + 1 < a.ny) { const d = k(a.duenio[(j + 1) * a.nx + i]); if (d !== null) { if (!adj.has(d)) adj.set(d, new Set()); unir(c, d); } }
  }
  return adj;
}

/**
 * Colorea un mapa para que dos regiones vecinas nunca tengan el mismo color. Por el teorema de los cuatro colores,
 * a un mapa plano le alcanzan 4: se busca con vuelta atrás (eligiendo primero la región más restringida, DSATUR).
 * Si la búsqueda no termina a tiempo (no debería pasar en una planta), se usa un color más.
 */
export function cuatroColores(adj: Map<string, Set<string>>, colores = 4): Map<string, number> {
  const nodos = [...adj.keys()].sort();
  const col = new Map<string, number>();
  let pasos = 0;
  const saturacion = (n: string) => new Set([...adj.get(n)!].map(v => col.get(v)).filter(c => c !== undefined)).size;
  const resolver = (): boolean => {
    if (col.size === nodos.length) return true;
    if (++pasos > 200000) return false;
    // la región sin color con más colores distintos alrededor (y, si empatan, con más vecinas)
    let mejor = '', ms = -1, mg = -1;
    for (const n of nodos) { if (col.has(n)) continue; const s = saturacion(n), g = adj.get(n)!.size; if (s > ms || (s === ms && g > mg)) { mejor = n; ms = s; mg = g; } }
    const usados = new Set([...adj.get(mejor)!].map(v => col.get(v)));
    for (let c = 0; c < colores; c++) {
      if (usados.has(c)) continue;
      col.set(mejor, c);
      if (resolver()) return true;
      col.delete(mejor);
    }
    return false;
  };
  if (resolver()) return col;
  return cuatroColores(adj, colores + 1);
}
