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

/**
 * Construcción gráfica del polígono funicular de las fuerzas del viento (todas horizontales):
 *  - polígono de fuerzas: las fuerzas una a continuación de otra sobre una línea; un polo O a la distancia H;
 *    rayos de O a cada punto (0, F1, F1+F2, … W);
 *  - polígono funicular en el alzado: entre la recta de acción de la fuerza k y la de la k+1, un lado paralelo
 *    al rayo k; los lados extremos (rayos 0 y n) se cortan en un punto de la recta de acción de la resultante.
 * Se prueba que la altura del corte es Σ F·z / W (la hw de la planilla).
 */
export interface Construccion {
  /** fuerzas de arriba hacia abajo */
  fuerzas: { z: number; F: number; nivel: string }[];
  W: number;
  /** puntos del polígono de fuerzas (sumas acumuladas, desde 0) y polo (x, H) */
  S: number[]; polo: { x: number; H: number };
  /** pendiente de cada lado: corrimiento horizontal por metro que se baja (lado k paralelo al rayo k) */
  m: number[];
  /** vértices del funicular sobre cada recta de acción */
  vertices: { x: number; z: number }[];
  /** corte de los lados extremos: altura de la resultante (z) y su x en el dibujo */
  zR: number; xR: number;
}

export function poligonoFunicular(fuerzasIn: { z: number; F: number; nivel: string }[], x0 = 0, Hpolo?: number): Construccion {
  const fuerzas = fuerzasIn.filter(f => f.F > 1e-9).sort((a, b) => b.z - a.z);
  const W = fuerzas.reduce((s, f) => s + f.F, 0);
  const S = [0];
  fuerzas.forEach(f => S.push(S[S.length - 1] + f.F));
  const polo = { x: W / 2, H: Hpolo ?? (W * 0.9 || 1) };
  const m = S.map(Sk => (Sk - polo.x) / polo.H);
  const vertices: { x: number; z: number }[] = [];
  fuerzas.forEach((f, k) => {
    if (k === 0) vertices.push({ x: x0, z: f.z });
    else { const a = vertices[k - 1]; vertices.push({ x: a.x + m[k] * (fuerzas[k - 1].z - f.z), z: f.z }); }
  });
  const n = fuerzas.length;
  let zR = NaN, xR = NaN;
  if (n) {
    const v1 = vertices[0], vn = vertices[n - 1];
    // lado 0: x = v1.x + m0·(v1.z − z); lado n: x = vn.x + mn·(vn.z − z)
    zR = (vn.x + m[n] * vn.z - v1.x - m[0] * v1.z) / (m[n] - m[0]);
    xR = v1.x + m[0] * (v1.z - zR);
  }
  return { fuerzas, W, S, polo, m, vertices, zR, xR };
}
