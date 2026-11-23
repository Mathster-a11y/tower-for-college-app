/**
 * Perfil de la torre (alzado): cómo cambia la planta con la altura, a partir de la losa de un nivel base.
 *
 *  - Una curva de puntos (h, fx, fy, dx, dy) con h de 0 (la losa base) a 1 (la azotea): fx y fy escalan la planta en
 *    x y en y desde su centro, dx y dy la corren (torre inclinada). Entre puntos: tramos rectos o una curva suave que
 *    pasa por todos (spline cúbica monótona: no se pasa de los valores de los puntos, sin «panzas» de más).
 *  - Un giro total (grados) que se reparte con la altura: torre retorcida.
 *
 * Cada losa de arriba de la base queda escrita (silueta, y B y L de su caja), como los lofts: la planilla, el Excel,
 * el 3D y los avisos leen lo mismo. Se vuelve a aplicar en cada cambio (estado.cambiar), antes que los lofts: un loft
 * manda sobre los niveles que genera.
 *
 * La carpintería que sigue a la losa: en todos los niveles, el contorno de la losa desfasado hacia adentro.
 */
import type { Proyecto } from './modelo';
import { desfasarAnillo, escalarAnillo, girarAnillo } from './contorno';
import { cajaSilueta, plantaDeNivel, puntosSilueta, type Vertice } from './silueta';

export interface PuntoPerfil { h: number; fx: number; fy?: number | null; dx?: number | null; dy?: number | null }
export interface PerfilTorre {
  /** cota de la losa base (la que da la forma; vacío = PB) */
  base?: number | null;
  puntos: PuntoPerfil[];
  /** curva suave entre los puntos (vacío = tramos rectos) */
  suave?: boolean | null;
  /** giro total de la base a la azotea (grados, antihorario) */
  giro?: number | null;
  /** escribir B y L de la caja en cada losa (vacío = sí) */
  bl?: boolean | null;
}

export const PERFILES: { id: string; nombre: string; texto: string; p: Omit<PerfilTorre, 'base'> }[] = [
  { id: 'recta', nombre: 'Recta', texto: 'La misma planta en toda la altura.', p: { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 1 }] } },
  { id: 'ahusada', nombre: 'Ahusada', texto: 'Se afina hacia arriba: arriba, el 60 % del ancho de la base.', p: { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 0.6 }] } },
  { id: 'aguja', nombre: 'Aguja', texto: 'Curva que se cierra arriba, como un obelisco suave.', p: { suave: true, puntos: [{ h: 0, fx: 1 }, { h: 0.6, fx: 0.85 }, { h: 1, fx: 0.4 }] } },
  { id: 'barril', nombre: 'Barril', texto: 'Más ancha en el medio (115 %).', p: { suave: true, puntos: [{ h: 0, fx: 1 }, { h: 0.5, fx: 1.15 }, { h: 1, fx: 0.9 }] } },
  { id: 'reloj', nombre: 'Reloj de arena', texto: 'Se angosta en el medio (75 %) y se abre arriba.', p: { suave: true, puntos: [{ h: 0, fx: 1 }, { h: 0.5, fx: 0.75 }, { h: 1, fx: 1 }] } },
  { id: 'escalonada', nombre: 'Escalonada', texto: 'Tres escalones con terrazas: 100 %, 85 % y 70 %.', p: { puntos: [{ h: 0, fx: 1 }, { h: 0.33, fx: 1 }, { h: 0.34, fx: 0.85 }, { h: 0.66, fx: 0.85 }, { h: 0.67, fx: 0.7 }, { h: 1, fx: 0.7 }] } },
  { id: 'retorcida', nombre: 'Retorcida', texto: 'La misma planta girada 90° de la base a la azotea.', p: { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 1 }], giro: 90 } },
  { id: 'inclinada', nombre: 'Inclinada', texto: 'Se corre 4 m en x hacia arriba, sin cambiar de tamaño.', p: { puntos: [{ h: 0, fx: 1, dx: 0 }, { h: 1, fx: 1, dx: 4 }] } },
];

/** pendientes de la spline cúbica monótona (Fritsch y Carlson) para los valores ys en xs */
function pendientes(xs: number[], ys: number[]): number[] {
  const n = xs.length, d = xs.slice(0, -1).map((x, i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - x || 1e-12));
  const m = xs.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(d[i]) < 1e-12) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return m;
}
/** valor de la curva en h: recta entre puntos o spline monótona */
function curva(xs: number[], ys: number[], h: number, suave: boolean): number {
  const n = xs.length;
  if (n === 1) return ys[0];
  if (h <= xs[0]) return ys[0];
  if (h >= xs[n - 1]) return ys[n - 1];
  let k = 0; while (k < n - 2 && h > xs[k + 1]) k++;
  const dx = xs[k + 1] - xs[k], t = dx > 0 ? (h - xs[k]) / dx : 0;
  if (!suave) return ys[k] + (ys[k + 1] - ys[k]) * t;
  const m = pendientes(xs, ys), t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * dx * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * dx * m[k + 1];
}
/** factores y corrimientos del perfil a la altura relativa h (0 = base, 1 = azotea) */
export function valorPerfil(pf: PerfilTorre, h: number): { fx: number; fy: number; dx: number; dy: number; giro: number } {
  const ps = [...pf.puntos].sort((a, b) => a.h - b.h), xs = ps.map(q => q.h), s = !!pf.suave;
  return {
    fx: curva(xs, ps.map(q => q.fx), h, s),
    fy: curva(xs, ps.map(q => q.fy ?? q.fx), h, s),
    dx: curva(xs, ps.map(q => q.dx ?? 0), h, s),
    dy: curva(xs, ps.map(q => q.dy ?? 0), h, s),
    giro: (pf.giro ?? 0) * Math.max(0, Math.min(1, h)),
  };
}

/** la planta base transformada: escala (x e y) desde su centro, giro y corrimiento */
export function transformarPlanta(v: Vertice[], fx: number, fy: number, dx: number, dy: number, giro: number): Vertice[] {
  const c = cajaSilueta(v), cen = { x: c.cx, y: c.cy };
  let w: Vertice[];
  if (Math.abs(fx - fy) < 1e-9) w = escalarAnillo(v, fx, cen) as Vertice[];
  else {
    // escala distinta en x y en y: los arcos dejan de ser arcos (pasan a elipse), así que se toman como puntos
    const pts = v.some(q => q.b) ? puntosSilueta(v, 6).map(q => ({ x: q.x, y: q.y })) as Vertice[] : v;
    const f = (q: { x: number; y: number }) => ({ x: cen.x + (q.x - cen.x) * fx, y: cen.y + (q.y - cen.y) * fy });
    w = pts.map(q => ({ ...f(q), ...(q.c1 && q.c2 ? { c1: f(q.c1), c2: f(q.c2) } : {}) }));
  }
  if (Math.abs(giro) > 1e-9) w = girarAnillo(w, giro, cen) as Vertice[];
  if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) w = w.map(q => ({ ...q, x: q.x + dx, y: q.y + dy, ...(q.c1 && q.c2 ? { c1: { x: q.c1.x + dx, y: q.c1.y + dy }, c2: { x: q.c2.x + dx, y: q.c2.y + dy } } : {}) }));
  return w.map(q => ({ ...q, x: +q.x.toFixed(4), y: +q.y.toFixed(4) }));
}

/** índice del nivel base del perfil (vacío = PB) */
export function nivelBase(p: Proyecto, pf: PerfilTorre): number {
  const iPB = p.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1);
  if (pf.base === null || pf.base === undefined) return iPB;
  const i = p.niveles.findIndex(n => Math.abs(n.cota - pf.base!) < 1e-6);
  return i >= 0 ? i : iPB;
}

/** escribe en las losas de arriba de la base la planta del perfil; devuelve cuántas */
export function aplicarPerfil(p: Proyecto): number {
  const pf = p.perfilTorre;
  if (!pf || pf.puntos.length < 1) return 0;
  const ib = nivelBase(p, pf);
  if (ib < 0) return 0;
  const nb = p.niveles[ib];
  // la base queda con silueta propia (si heredaba la de arriba, se copia antes de tocar los niveles de arriba)
  if (!nb.silueta || nb.silueta.length < 3) nb.silueta = plantaDeNivel(p, ib).silueta.map(q => ({ ...q }));
  const base = nb.silueta as Vertice[], z0 = nb.cota, z1 = p.niveles[0].cota;
  if (z1 <= z0 + 1e-6) return 0;
  let n = 0;
  p.niveles.forEach((nv, i) => {
    if (i >= ib) return;                                       // solo los de arriba de la base
    const h = (nv.cota - z0) / (z1 - z0), v = valorPerfil(pf, h);
    if (!(v.fx > 0.02 && v.fy > 0.02)) return;
    const s = transformarPlanta(base, v.fx, v.fy, v.dx, v.dy, v.giro);
    nv.silueta = s;
    if (pf.bl ?? true) { const c = cajaSilueta(s); nv.B = +c.B.toFixed(2); nv.L = +c.L.toFixed(2); }
    n++;
  });
  return n;
}

/** carpintería de cada nivel = su losa desfasada hacia adentro p.carpinteriaRetiro metros (0 = el borde de la losa) */
export function aplicarCarpinteria(p: Proyecto): number {
  const d = p.carpinteriaRetiro;
  if (d === null || d === undefined || !(d >= 0)) return 0;
  let n = 0;
  p.niveles.forEach((nv, i) => {
    if (nv.cota < -1e-6) return;                              // subsuelos: sin fachada
    const s = plantaDeNivel(p, i).silueta;
    const c = d > 0 ? desfasarAnillo(s, -d) : s.map(q => ({ ...q }));
    if ('error' in c) return;
    nv.carpinteria = (c as Vertice[]).map(q => ({ ...q }));
    n++;
  });
  return n;
}
