/**
 * Distancia de una pieza al centro de la planta (herramienta «Distancia al centro» de Ayudas): el baricentro G de la
 * pieza (la sección de todos sus muros juntos, ponderada por área), el centro O de la losa del nivel (su baricentro), las
 * componentes Δx y Δy de O a G y la distancia polar r con el ángulo θ, desde el eje +x y antihorario (0° a 360°).
 * La pieza es la del viento elegido (piezaA o piezaB del muro); un muro sin pieza se mide solo.
 */
import type { Proyecto } from './modelo';
import { perfilDeMuro, polilinea, propiedades } from './perfil';
import { plantaDeNivel } from './silueta';

export interface Punto { x: number; y: number }
export interface DistanciaCentro {
  /** nombre de la pieza (o el id del muro, si no tiene pieza en ese viento) */
  pieza: string; sinPieza: boolean; muros: string[];
  G: Punto; O: Punto; dx: number; dy: number; r: number;
  /** ángulo de O→G desde +x, antihorario, en grados de 0 a 360 */
  theta: number;
}

/** baricentro de la losa del nivel i (con sus arcos); si no tiene superficie, el origen */
export function centroLosa(p: Proyecto, i: number): Punto {
  const sil = plantaDeNivel(p, i).silueta;
  const pts = polilinea(sil.map(v => ({ x: v.x, y: v.y, ...(v.b ? { b: v.b } : {}) })), 2, 24);
  let A = 0, cx = 0, cy = 0;
  pts.forEach((a, k) => { const b = pts[(k + 1) % pts.length], c = a.x * b.y - b.x * a.y; A += c / 2; cx += ((a.x + b.x) * c) / 6; cy += ((a.y + b.y) * c) / 6; });
  return Math.abs(A) < 1e-9 ? { x: 0, y: 0 } : { x: cx / A, y: cy / A };
}

/** la pieza del muro en el viento dir y su baricentro (área de la sección de cada muro) */
export function baricentroPieza(p: Proyecto, muroId: string, dir: 'A' | 'B'): { pieza: string; sinPieza: boolean; muros: string[]; G: Punto } | null {
  const m0 = p.muros.find(m => m.id === muroId);
  if (!m0) return null;
  const nombre = dir === 'A' ? m0.piezaA : m0.piezaB;
  const ms = nombre ? p.muros.filter(m => (dir === 'A' ? m.piezaA : m.piezaB) === nombre) : [m0];
  let A = 0, Sx = 0, Sy = 0;
  ms.forEach(m => { const pr = propiedades(perfilDeMuro(m)), a = Math.abs(pr.A); A += a; Sx += a * pr.xg; Sy += a * pr.yg; });
  if (A < 1e-12) return null;
  return { pieza: nombre || m0.id, sinPieza: !nombre, muros: ms.map(m => m.id), G: { x: Sx / A, y: Sy / A } };
}

export function distanciaAlCentro(p: Proyecto, muroId: string, dir: 'A' | 'B', iNivel: number): DistanciaCentro | null {
  const b = baricentroPieza(p, muroId, dir);
  if (!b) return null;
  const O = centroLosa(p, iNivel), dx = b.G.x - O.x, dy = b.G.y - O.y, r = Math.hypot(dx, dy);
  const th = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { ...b, O, dx, dy, r, theta: r < 1e-9 ? 0 : (th + 360) % 360 };
}
