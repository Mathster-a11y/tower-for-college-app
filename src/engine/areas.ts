/**
 * Áreas de influencia de la losa: cada punto de la losa descarga en el elemento vertical más cercano (el criterio de
 * «mitad de la luz»: el borde entre dos áreas queda a igual distancia de los dos elementos). Se cuadricula la losa
 * del nivel y cada cuadradito se suma al muro o columna más cercano.
 */
import { presenteEn, rectangulos, tipoDe, type Muro, type Proyecto } from './modelo';
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
  /** centro de cada área (para el rótulo) */
  centro: Record<string, Punto>;
}

/** áreas de influencia en la losa del nivel i (los elementos que están en esa planta) */
export function areasInfluencia(p: Proyecto, i: number, paso = 0.25): AreasInfluencia {
  const zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0, zTop = p.niveles[0]?.cota ?? 0;
  const z = p.niveles[i]?.cota ?? 0;
  const ms = p.muros.filter(m => presenteEn(m, z, zFund, zTop));
  const pol = puntosSilueta(plantaDeNivel(p, i).silueta, 6);
  const xs = pol.map(q => q.x), ys = pol.map(q => q.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const nx = Math.max(1, Math.ceil((Math.max(...xs) - x0) / paso)), ny = Math.max(1, Math.ceil((Math.max(...ys) - y0) / paso));
  const duenio = new Int16Array(nx * ny).fill(-1);
  const area: Record<string, number> = Object.fromEntries(ms.map(m => [m.id, 0]));
  const sx: number[] = ms.map(() => 0), sy: number[] = ms.map(() => 0);
  let total = 0;
  for (let j = 0; j < ny; j++) for (let k = 0; k < nx; k++) {
    const q = { x: x0 + (k + 0.5) * paso, y: y0 + (j + 0.5) * paso };
    if (!dentro(q, pol)) continue;
    total += paso * paso;
    if (!ms.length) continue;
    let mejor = 0, dMin = Infinity;
    ms.forEach((m, n) => { const d = distancia(q, m); if (d < dMin - 1e-9) { dMin = d; mejor = n; } });
    duenio[j * nx + k] = mejor;
    area[ms[mejor].id] += paso * paso;
    sx[mejor] += q.x; sy[mejor] += q.y;
  }
  const centro: Record<string, Punto> = {};
  ms.forEach((m, n) => { const c = area[m.id] / (paso * paso); centro[m.id] = c ? { x: sx[n] / c, y: sy[n] / c } : { x: m.x, y: m.y }; area[m.id] = Math.round(area[m.id] * 100) / 100; });
  return { area, total: Math.round(total * 100) / 100, paso, x0, y0, nx, ny, duenio, ids: ms.map(m => m.id), centro };
}
