/**
 * Cotas de medición de la planta. Cada punto puede estar pegado a un nodo de un muro (esquina, medio o centro): si
 * el muro se mueve o cambia de medida, la cota lo sigue. Horizontal, vertical o alineada.
 */
import type { Cota, Muro, Proyecto, PuntoCota } from './modelo';
import { nodosMuro } from './dibujo';
import type { Punto } from './silueta';

/** posición actual de un punto de cota (si el muro ya no existe, queda donde estaba) */
export function resolverPunto(p: Proyecto, q: PuntoCota): Punto {
  if (q.ref) {
    const m = p.muros.find(x => x.id === q.ref!.id);
    const n = m ? nodosMuro(m)[q.ref.k] : undefined;
    if (n) return { x: n.x, y: n.y };
  }
  return { x: q.x, y: q.y };
}
/** punto de cota pegado al nodo del muro que está en «q» (si hay uno ahí) */
export function puntoCota(q: Punto, muros: Muro[], id?: string): PuntoCota {
  const m = id ? muros.find(x => x.id === id) : undefined;
  if (m) {
    const k = nodosMuro(m).findIndex(n => Math.hypot(n.x - q.x, n.y - q.y) < 1e-6);
    if (k >= 0) return { x: q.x, y: q.y, ref: { id: m.id, k } };
  }
  return { x: +q.x.toFixed(4), y: +q.y.toFixed(4) };
}

export interface GeoCota {
  /** puntos medidos */ a: Punto; b: Punto;
  /** extremos de la línea de cota */ c1: Punto; c2: Punto;
  /** valor (m) */ valor: number;
  /** centro y ángulo del texto (grados, legible) */ t: Punto; ang: number;
}
/** geometría de una cota: la línea de cota corrida «d» m, perpendicular a la medida */
export function geometria(p: Proyecto, c: Cota): GeoCota {
  const a = resolverPunto(p, c.a), b = resolverPunto(p, c.b);
  let c1: Punto, c2: Punto, valor: number;
  if (c.tipo === 'h') { const y = (a.y + b.y) / 2 + c.d; c1 = { x: a.x, y }; c2 = { x: b.x, y }; valor = Math.abs(b.x - a.x); }
  else if (c.tipo === 'v') { const x = (a.x + b.x) / 2 + c.d; c1 = { x, y: a.y }; c2 = { x, y: b.y }; valor = Math.abs(b.y - a.y); }
  else {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
    c1 = { x: a.x + nx * c.d, y: a.y + ny * c.d }; c2 = { x: b.x + nx * c.d, y: b.y + ny * c.d }; valor = L;
  }
  let ang = (Math.atan2(c2.y - c1.y, c2.x - c1.x) * 180) / Math.PI;
  if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
  return { a, b, c1, c2, valor, t: { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 }, ang };
}
/** tipo y corrimiento de una cota según dónde se suelta el tercer punto (automática: horizontal o vertical) */
export function cotaDesdeCursor(a: Punto, b: Punto, q: Punto, alineada: boolean): { tipo: Cota['tipo']; d: number } {
  if (alineada) {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
    return { tipo: 'alineada', d: +((q.x - a.x) * nx + (q.y - a.y) * ny).toFixed(3) };
  }
  // fuera de la caja de a-b en y (arriba o abajo): horizontal; a los costados: vertical
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const fueraY = q.y > y1 || q.y < y0, fueraX = q.x > x1 || q.x < x0;
  const horizontal = fueraY && !fueraX ? true : fueraX && !fueraY ? false : Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  return horizontal ? { tipo: 'h', d: +(q.y - (a.y + b.y) / 2).toFixed(3) } : { tipo: 'v', d: +(q.x - (a.x + b.x) / 2).toFixed(3) };
}
export function idCota(p: Proyecto) { const u = new Set((p.cotas ?? []).map(c => c.id)); for (let k = 1; ; k++) if (!u.has(`D${k}`)) return `D${k}`; }
