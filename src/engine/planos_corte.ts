/**
 * Planos de corte de la torre: un plano inclinado (o vertical) que recorta las losas, como el techo a 45° de la corona
 * del Citicorp. Se dibuja en el corte de la torre con dos puntos (a y b, en coordenadas del corte: w a lo ancho, z la
 * altura); el plano contiene esa recta y sigue derecho en la otra dirección horizontal. Se saca lo que queda arriba de
 * la recta (o abajo, si se pide).
 *
 * En cada nivel de cota z el plano es una recta de la planta (w = constante): la losa se recorta por ese semiplano,
 * exacto para los lados rectos (los arcos que el plano corta pasan a puntos). Se vuelve a aplicar en cada cambio,
 * después del perfil y los lofts: recortar dos veces da lo mismo.
 */
import type { Proyecto } from './modelo';
import type { EjeCorte } from './corte';
import { cajaSilueta, plantaDeNivel, puntosSilueta, type Vertice } from './silueta';

export interface PlanoCorte {
  id: string;
  eje: EjeCorte;
  a: { w: number; z: number };
  b: { w: number; z: number };
  /** qué se saca: lo de arriba de la recta (vacío) o lo de abajo */
  saca?: 'arriba' | 'abajo' | null;
  /** las losas antes del primer recorte (para quitar el plano y volver a como estaban); no va al Excel */
  antes?: { cota: number; silueta: Vertice[] | null; B: number | null; L: number | null }[];
}

/** ángulo de la recta del plano con la horizontal (grados, 0 a 90) */
export const anguloPlano = (pc: PlanoCorte) => (Math.atan2(Math.abs(pc.b.z - pc.a.z), Math.abs(pc.b.w - pc.a.w)) * 180) / Math.PI;

/**
 * El semiplano que queda en la planta de cota z: los puntos con coordenada w tales que (w − w0)·s ≥ 0. null si a esa
 * altura el plano no saca nada (la recta es horizontal y la losa queda entera) o lo saca todo (todo: true).
 */
export function semiplano(pc: PlanoCorte, z: number): { w0: number; s: 1 | -1 } | { todo: boolean } {
  const { a, b } = pc, dw = b.w - a.w, dz = b.z - a.z;
  // g(w, z) = −dz·(w − a.w) + dw·(z − a.z): del lado de «arriba» (un punto justo encima de la recta) g tiene el signo
  // de dw. Se saca el lado de arriba (σ = signo de dw) o el de abajo (σ = −signo de dw); se queda g·σ ≤ 0. Con la recta
  // vertical (dw = 0) «arriba» es el lado de las w menores.
  const sg = dw < -1e-12 ? -1 : 1, sigma = (pc.saca ?? 'arriba') === 'arriba' ? sg : -sg;
  if (Math.abs(dz) < 1e-9) return { todo: dw * (z - a.z) * sigma > 1e-9 };
  const w0 = a.w + (dw * (z - a.z)) / dz;
  // g = −dz·(w − w0): se queda (w − w0)·dz·σ ≥ 0
  return { w0, s: dz * sigma > 0 ? 1 : -1 };
}

/** recorta el contorno por el semiplano (w − w0)·s ≥ 0 de la planta (w = x en el eje 'x', y en el eje 'y') */
export function recortarContorno(v: Vertice[], eje: EjeCorte, w0: number, s: 1 | -1): Vertice[] | null {
  const W = (q: { x: number; y: number }) => ((eje === 'x' ? q.x : q.y) - w0) * s;
  const pts = puntosSilueta(v, 6);
  if (pts.every(q => W(q) >= -1e-9)) return v;                          // no lo toca
  if (pts.every(q => W(q) <= 1e-9)) return null;                        // lo saca entero
  // los lados con arcos o Bézier que el plano corta pasan a puntos; los rectos quedan exactos
  const base: Vertice[] = v.some(q => q.b || (q.c1 && q.c2)) ? pts.map(q => ({ x: q.x, y: q.y })) : v.map(q => ({ x: q.x, y: q.y }));
  const out: Vertice[] = [];
  for (let i = 0; i < base.length; i++) {
    const p = base[i], q = base[(i + 1) % base.length], fp = W(p), fq = W(q);
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push({ x: +(p.x + (q.x - p.x) * t).toFixed(4), y: +(p.y + (q.y - p.y) * t).toFixed(4) }); }
  }
  // sin vértices repetidos
  return out.filter((q, i) => { const r = out[(i + 1) % out.length]; return Math.hypot(q.x - r.x, q.y - r.y) > 1e-4; });
}

/** recorta las losas de todos los niveles con los planos de corte; devuelve cuántas cambiaron */
export function aplicarPlanosCorte(p: Proyecto): number {
  const planos = p.planosCorte ?? [];
  if (!planos.length) return 0;
  // la silueta de cada nivel antes de cortar (los que heredan la de arriba, también): si un nivel de arriba queda
  // recortado, los de abajo no tienen que heredar el recorte
  const efectivas = p.niveles.map((_, i) => plantaDeNivel(p, i).silueta);
  const nuevas = p.niveles.map((nv, i) => {
    if (nv.cota < -1e-6) return null;
    let v: Vertice[] | null = efectivas[i];
    for (const pc of planos) {
      const sp = semiplano(pc, nv.cota);
      if ('todo' in sp) { if (sp.todo) { v = null; break; } continue; }
      v = recortarContorno(v!, pc.eje, sp.w0, sp.s);
      if (!v) break;
    }
    // una losa que el plano saca entera queda como estaba (la corona no se borra sola)
    return !v || v.length < 3 || v === efectivas[i] ? null : v;
  });
  if (!nuevas.some(Boolean)) return 0;
  let n = 0;
  p.niveles.forEach((nv, i) => {
    const v = nuevas[i];
    if (v) { nv.silueta = v; const c = cajaSilueta(v); nv.B = +c.B.toFixed(2); nv.L = +c.L.toFixed(2); n++; }
    else if (nv.cota >= -1e-6 && (!nv.silueta || nv.silueta.length < 3)) nv.silueta = efectivas[i].map(q => ({ ...q }));
  });
  return n;
}
