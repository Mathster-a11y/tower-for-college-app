/**
 * Los números de la burbuja de la planta: J y W de una pieza (o de un muro solo) en cuatro direcciones del viento, y
 * cuánto aporta cada muro al J de su pieza (Steiner respecto del baricentro de la pieza).
 *
 * Para un viento en la dirección w = (cos θ, sin θ): J = ∫ (w·r)² dA (r desde el baricentro) y W = J / c, con c la
 * distancia de la fibra más alejada medida en esa dirección (el W menor: el borde que manda).
 */
import type { Muro } from './modelo';
import { huellaMuro, jEnDireccion, propiedadesSeccion, type PropiedadesSeccion } from './seccionPieza';

export const DIRECCIONES: [string, number][] = [['viento A ↑', Math.PI / 2], ['viento B →', 0], ['oblicuo ↗ 45°', Math.PI / 4], ['oblicuo ↖ 135°', (3 * Math.PI) / 4]];

export interface FilaDireccion { nombre: string; ang: number; J: number; W: number; c: number }
export interface DatosSeccion { A: number; s: PropiedadesSeccion; filas: FilaDireccion[] }

/** distancia de la fibra más alejada del baricentro, medida en la dirección θ */
function fibra(ms: Muro[], s: PropiedadesSeccion, ang: number): number {
  const wx = Math.cos(ang), wy = Math.sin(ang);
  let c = 0;
  ms.forEach(m => huellaMuro(m).forEach(r => r.forEach(([x, y]) => { c = Math.max(c, Math.abs(wx * (x - s.xg) + wy * (y - s.yg))); })));
  return c;
}

export function datosSeccion(ms: Muro[]): DatosSeccion | null {
  const s = propiedadesSeccion(ms);
  if (!s) return null;
  return {
    A: s.A, s,
    filas: DIRECCIONES.map(([nombre, ang]) => { const J = jEnDireccion(s, ang), c = fibra(ms, s, ang); return { nombre, ang, J, c, W: c > 1e-9 ? J / c : 0 }; }),
  };
}

export interface Aporte { id: string; Jpropio: number; A: number; d: number; J: number; parte: number }

/** cuánto aporta cada muro al J de la pieza en la dirección θ: J propio + A·d² (d: de su baricentro al de la pieza) */
export function aportes(ms: Muro[], ang: number): Aporte[] {
  const s = propiedadesSeccion(ms);
  if (!s) return [];
  const Jp = jEnDireccion(s, ang), wx = Math.cos(ang), wy = Math.sin(ang);
  return ms.flatMap(m => {
    const sm = propiedadesSeccion([m]);
    if (!sm) return [];
    const d = wx * (sm.xg - s.xg) + wy * (sm.yg - s.yg), Jpropio = jEnDireccion(sm, ang), J = Jpropio + sm.A * d * d;
    return [{ id: m.id, Jpropio, A: sm.A, d, J, parte: Jp > 0 ? J / Jp : 0 }];
  });
}
