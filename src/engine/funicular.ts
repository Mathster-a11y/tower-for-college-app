/**
 * Verificación funicular (guía «Edificio en torre», 2.2): la resultante del viento W y del peso G
 * tiene que cortar la base de la fundación dentro del tercio medio (núcleo central).
 *
 * Además, piso a piso, la línea de presiones: en cada nivel, el punto donde la resultante de todo lo que
 * está arriba (viento acumulado y peso acumulado) corta ese nivel. Su distancia al eje es e = M / N
 * (momento del viento sobre el nivel / peso de lo que está arriba). Se compara con el núcleo central de
 * la planta de ese nivel (lado paralelo al viento / 6). Es una referencia: la planta no es maciza.
 *
 * Los valores salen de la hoja M,NyQ (los de la planilla o los corregidos): fuerzas en t, momentos en tm.
 */
import type { MNyQRes } from './planilla';
import type { Proyecto } from './modelo';

export interface PuntoPresion {
  nivel: string;
  /** cota del nivel (m) */
  z: number;
  /** corte: viento acumulado sobre el nivel (t) */
  V: number;
  /** peso de lo que está arriba del nivel (t) */
  N: number;
  /** momento del viento sobre el nivel (tm) */
  M: number;
  /** distancia de la línea de presiones al eje (m) */
  e: number;
  /** semiancho del núcleo central de la planta del nivel (m): lado paralelo al viento / 6 */
  nucleo: number;
  dentro: boolean;
}

export interface Funicular {
  dir: 'A' | 'B';
  /** resultante del viento (t) y su altura sobre la base de la fundación (m) */
  W: number; hw: number;
  /** peso sin sobrecarga (t), aplicado en el eje */
  G: number;
  /** momento de vuelco en la base (tm) */
  Mv: number;
  /** distancia desde el eje hasta donde la resultante corta la base (m) */
  e: number;
  /** lado de la fundación paralelo al viento (m) y semiancho del tercio medio (m) */
  b: number; tercio: number;
  verifica: boolean;
  /** cota de la base de la fundación (m) y de la azotea (m) */
  zBase: number; zTop: number;
  puntos: PuntoPresion[];
}

export function calcFunicular(p: Proyecto, m: MNyQRes, filaNivel: number[], dir: 'A' | 'B'): Funicular {
  const A = dir === 'A';
  const ultima = m.B.length - 1;
  const zBase = m.B[ultima];
  const zTop = p.niveles[0]?.cota ?? 0;
  // viento A: corte I, momento J; viento B (cara menor): corte N, momento O
  const W = A ? m.H61 : m.N[ultima] + (m.D[ultima] * m.F[ultima] * m.G[ultima] || 0);
  const Mv = A ? m.J61 : m.O61;
  const G = m.M61;
  const b = A ? p.fundacion.b1 : p.fundacion.a1;
  const e = G > 0 ? Mv / G : NaN;
  const tercio = b / 6;
  const puntos: PuntoPresion[] = [];
  p.niveles.forEach((n, j) => {
    const k = filaNivel[j];
    if (k === undefined || j === 0) return;            // en la azotea no hay nada arriba
    const V = A ? m.I[k] : m.N[k], M = A ? m.J[k] : m.O[k], N = m.M[k];
    if (!(N > 0)) return;
    const lado = A ? m.F[k] : m.E[k];
    const ep = M / N;
    puntos.push({ nivel: n.nombre, z: n.cota, V, N, M, e: ep, nucleo: lado / 6, dentro: Math.abs(ep) <= lado / 6 + 1e-9 });
  });
  return { dir, W, hw: W > 0 ? Mv / W : NaN, G, Mv, e, b, tercio, verifica: isFinite(e) && Math.abs(e) <= tercio + 1e-9, zBase, zTop, puntos };
}
