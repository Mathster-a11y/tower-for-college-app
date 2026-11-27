/**
 * Diagrid sobre una planta circular (solo dibujo: ver ExoDef.circular). Anillos de nudos en los bordes y en la mitad de
 * cada módulo; en cada anillo, n nudos repartidos en la vuelta, girados media separación respecto del anillo de abajo.
 * Cada nudo se une con los dos más cercanos del anillo de arriba (diagonales en las dos espirales) y con sus vecinos del
 * mismo anillo (el anillo horizontal que trabaja a tracción, el «hoop»). El radio es el de la silueta de cada nivel
 * (la fachada), interpolado entre niveles.
 */
import type { Proyecto } from './modelo';
import { plantaDeNivel } from './silueta';

export interface P3 { x: number; y: number; z: number }
export interface BarraCircular { a: P3; b: P3; clase: 'diagonal' | 'anillo'; anillo: number; th: number }
export interface DiagridCircular { anillos: { z: number; R: number; th: number[] }[]; barras: BarraCircular[]; n: number }

/** radio de la fachada en la altura z (m), de la silueta de los niveles (el mayor alcance desde el centro) */
export function radioEn(p: Proyecto, z: number): number { return radiosFachada(p)(z); }
/**
 * el radio de la fachada en función de z, con la tabla de los niveles armada una sola vez: para muchas consultas sobre
 * el mismo proyecto (cada anillo y cada barra del diagrid) en lugar de recorrer todos los niveles en cada una
 */
export function radiosFachada(p: Proyecto): (z: number) => number {
  const niv = p.niveles.map((n, i) => ({ z: n.cota, r: Math.max(...plantaDeNivel(p, i).silueta.map(q => Math.hypot(q.x, q.y))) }))
    .filter(q => q.z >= 0).sort((a, b) => a.z - b.z);
  return (z: number) => {
    if (!niv.length) return 0;
    if (z <= niv[0].z) return niv[0].r;
    for (let k = 1; k < niv.length; k++) if (z <= niv[k].z) { const a = niv[k - 1], b = niv[k]; return a.r + ((b.r - a.r) * (z - a.z)) / (b.z - a.z || 1); }
    return niv[niv.length - 1].r;
  };
}

export function diagridCircular(p: Proyecto): DiagridCircular | null {
  const def = p.exo;
  if (!def?.circular || !(def.cortes?.length && def.cortes.length >= 2)) return null;
  const n = Math.max(3, Math.round(def.circular.nudos));
  const tope = def.circular.hasta ?? Infinity;
  const cortes = [...def.cortes].filter(z => z <= tope + 1e-6).sort((a, b) => a - b);
  const zs: number[] = [];
  cortes.forEach((z, k) => { zs.push(z); if (k + 1 < cortes.length) zs.push((z + cortes[k + 1]) / 2); });
  const paso = (2 * Math.PI) / n;
  const radio = radiosFachada(p);
  const anillos = zs.map((z, r) => ({ z, R: radio(z) + (def.separacion ?? 0), th: Array.from({ length: n }, (_, i) => (i + (r % 2) * 0.5) * paso) }));
  const punto = (r: number, th: number): P3 => ({ x: anillos[r].R * Math.cos(th), y: anillos[r].R * Math.sin(th), z: anillos[r].z });
  const barras: BarraCircular[] = [];
  anillos.forEach((an, r) => an.th.forEach((th, i) => {
    // el anillo horizontal (no en la base: ahí apoyan las «A» sobre la fundación)
    if (r > 0) barras.push({ a: punto(r, th), b: punto(r, an.th[(i + 1) % n]), clase: 'anillo', anillo: r, th: th + paso / 2 });
    if (r + 1 < anillos.length) for (const s of [-1, 1]) barras.push({ a: punto(r, th), b: punto(r + 1, th + (s * paso) / 2), clase: 'diagonal', anillo: r, th: th + (s * paso) / 4 });
  }));
  return { anillos, barras, n };
}
