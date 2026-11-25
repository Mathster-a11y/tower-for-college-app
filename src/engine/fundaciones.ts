/**
 * Fundaciones (plan de trabajo, sección D): lo mínimo necesario, con el alcance de la guía «Edificio en torre».
 *
 *  - Platea rígida de a1 × b1 apoyada en un suelo del que solo se conoce la tensión admisible σt adm (dato del estudio
 *    geotécnico: CIRSOC 401, art. 7.4). No se calcula capacidad de carga, asentamientos ni pilotes (eso es el CIRSOC 402,
 *    en preparación, y la Parte 1 del Eurocódigo 7).
 *  - Presión de contacto lineal: con la resultante dentro del núcleo central (e ≤ b/6), σ = N/(a·b)·(1 ± 6e/b); si sale
 *    (e > b/6), contacto parcial en 3·(b/2 − e) con σmáx = 2N / (3·a·(b/2 − e)); con e ≥ b/2, vuelca.
 *  - Métodos CIRSOC y FEM: las fundaciones se diseñan por tensiones admisibles (CIRSOC 101-25, comentario 2.2), con
 *    las combinaciones de servicio del 102-25 (Apéndice B.4.2): D + 0,6 W, D + 0,75 L + 0,45 W y 0,6 D + 0,6 W.
 *  - Estudio de suelos (CIRSOC 401, art. 3.5.6.2): profundidad mínima de investigación = máx(6 m; Df + 2·ancho).
 *
 * Unidades: t, m; tensiones en kg/cm² (como la guía; 1 kg/cm² = 10 t/m²).
 */
import type { Proyecto } from './modelo';
import type { Viento102 } from './cargas/cirsoc102';
import { datos101De, sobrecarga } from './cargas/cirsoc101';

/** la guía usa 2,5 kg/cm² */
export const SIGMA_ADM_POR_DEFECTO = 2.5;
export const sigmaAdmDe = (p: Proyecto) => (p.fundacion.sigmaAdm && p.fundacion.sigmaAdm > 0 ? p.fundacion.sigmaAdm : SIGMA_ADM_POR_DEFECTO);

export interface Presion {
  N: number; M: number; e: number; nucleo: number;
  /** tensiones en los bordes (kg/cm², compresión positiva) y largo en contacto (m) */
  sMax: number; sMin: number; contacto: number;
  parcial: boolean; vuelca: boolean;
}
/** presión de una platea rígida de largo b (en el sentido del momento) y ancho a, con N (t) y M (tm) */
export function presionPlatea(N: number, M: number, b: number, a: number): Presion {
  const e = N > 0 ? Math.abs(M) / N : Infinity, nucleo = b / 6;
  if (!(N > 0) || e >= b / 2) return { N, M, e, nucleo, sMax: Infinity, sMin: 0, contacto: 0, parcial: true, vuelca: true };
  if (e <= nucleo + 1e-12) {
    const s = N / (a * b) / 10;
    return { N, M, e, nucleo, sMax: s * (1 + (6 * e) / b), sMin: s * (1 - (6 * e) / b), contacto: b, parcial: false, vuelca: false };
  }
  const c = 3 * (b / 2 - e);
  return { N, M, e, nucleo, sMax: (2 * N) / (3 * a * (b / 2 - e)) / 10, sMin: 0, contacto: c, parcial: true, vuelca: false };
}

/** CIRSOC 401, art. 3.5.6.2: profundidad mínima de investigación desde el nivel de fundación hacia abajo y desde el terreno */
export function profundidadEstudio(p: Proyecto): { Df: number; ancho: number; desdeTerreno: number } {
  const zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0;
  const Df = Math.max(0, -zFund), ancho = Math.min(p.fundacion.a1, p.fundacion.b1);
  return { Df, ancho, desdeTerreno: Math.max(6, Df + 2 * ancho) };
}

export interface CombinacionSuelo { nombre: string; D: number; L: number; W: number }
/** 102-25, Apéndice B.4.2 (las combinaciones de servicio, que son las de tensiones admisibles del ASCE 7) */
export const COMBOS_SUELO: CombinacionSuelo[] = [
  { nombre: 'D + 0,6 W', D: 1, L: 0, W: 0.6 },
  { nombre: 'D + 0,75 L + 0,45 W', D: 1, L: 0.75, W: 0.45 },
  { nombre: '0,6 D + 0,6 W', D: 0.6, L: 0, W: 0.6 },
];
export interface SueloDir { dir: 'A' | 'B'; Mw: number; combos: (Presion & { nombre: string })[]; peor: Presion & { nombre: string } }
export interface SueloCirsoc { G: number; Lt: number; sigmaAdm: number; dirs: SueloDir[]; verifica: boolean }
/**
 * La presión en el suelo con las cargas del 101-25 y el viento del 102-25 (de resistencia; la combinación lo lleva a
 * servicio). G: peso de las losas (D · Σ B·L); L total: sobrecarga · Σ B·L; momento del viento en la fundación:
 * M en PB + (Q en PB + franja de PB) · (zPB − zFund).
 */
export function sueloCirsoc(p: Proyecto, w: Viento102): SueloCirsoc {
  const d1 = datos101De(p), Lq = sobrecarga(d1);
  let B = 0, Lp = 0, area = 0;
  p.niveles.forEach(n => { B = n.B ?? B; Lp = n.L ?? Lp; area += B * Lp * Math.max(1, Math.round(n.pisos ?? 1)); });
  const G = d1.D * area, Lt = Lq * area;
  const zPB = p.niveles.reduce((z, n) => (n.cota >= 0 ? n.cota : z), 0), zFund = p.niveles[p.niveles.length - 1]?.cota ?? zPB;
  const brazo = zPB - zFund, sigmaAdm = sigmaAdmDe(p);
  const dirs = (['A', 'B'] as const).map(dir => {
    const x = w[dir], Mw = x.MPB + (x.QPB + Math.max(0, x.WPB)) * brazo;
    // viento A: vuelca alrededor del lado b1 (paralelo al viento A); viento B: alrededor de a1
    const b = dir === 'A' ? p.fundacion.b1 : p.fundacion.a1, a = dir === 'A' ? p.fundacion.a1 : p.fundacion.b1;
    const combos = COMBOS_SUELO.map(c => ({ nombre: c.nombre, ...presionPlatea(c.D * G + c.L * Lt, c.W * Mw, b, a) }));
    const peor = combos.reduce((m, c) => (c.sMax > m.sMax ? c : m), combos[0]);
    return { dir, Mw, combos, peor };
  });
  return { G, Lt, sigmaAdm, dirs, verifica: dirs.every(d => d.combos.every(c => !c.vuelca && c.sMax <= sigmaAdm)) };
}
