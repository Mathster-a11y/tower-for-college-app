/**
 * Método «Guía» (plan de trabajo, etapa 2): lo que la guía «Edificio en torre» 2024 hace y la planilla no.
 *
 *  1. Esbeltez del edificio (guía 1): λ = h / L, con L la planta en el sentido del viento.
 *  2. Flecha de la ménsula (guía 4.2): f = qv · h⁴ / (8 · E · J) ≤ h / 500, con qv el promedio de la carga del viento
 *     arriba y abajo (t/m) y h hasta la fundación («empotrada en la fundación»).
 *  3. Armado de los tabiques (guía 5 y «Armadura mínima en tabiques»): la armadura vertical (la de cálculo o la mínima
 *     de 0,8 %, la mayor) en dos capas, pasada a barras de un diámetro con su separación; la horizontal = 1/5 de la
 *     vertical. Mínimos: Ø8 c/20 cm vertical y Ø6 c/25 cm horizontal.
 *  4. Corte en los dinteles (guía 5, «Esfuerzo de corte»): con una abertura en el tabique, el dintel toma el
 *     resbalamiento t = Qj · S / Jj por metro de altura; en un piso, T = t · h piso, y τ = T / (h dintel · b) ≤ τ adm.
 *
 * El resto del método Guía (Kz constante por debajo de 5 m, sin viento en PB, J completo, rotación muro por muro,
 * almas y alas por separado) ya estaba: correcciones.ts y flexocompresion.ts.
 *
 * Unidades: m, t, t/m, t/m²; las tensiones de salida en kg/cm² y la armadura en cm², como la guía.
 */

// ---------------------------------------------------------------------------------------------------- 1. esbeltez
export type ClaseEsbeltez = 'baja' | 'viento' | 'vuelco' | 'muy alta';
export interface Esbeltez { lambda: number; clase: ClaseEsbeltez; texto: string }
/** guía 1: «para una esbeltez mayor a 3 se toman en cuenta las cargas de viento… entre 5 y 10… mayor o igual a 10» */
export function esbeltez(h: number, L: number): Esbeltez {
  const lambda = L > 0 ? h / L : NaN;
  if (!(lambda > 3)) return { lambda, clase: 'baja', texto: 'λ ≤ 3: torre baja; el viento no suele mandar.' };
  if (lambda < 5) return { lambda, clase: 'viento', texto: '3 < λ < 5: se toman en cuenta las cargas de viento; el vuelco no suele ser de gran relevancia.' };
  if (lambda < 10) return { lambda, clase: 'vuelco', texto: '5 ≤ λ < 10: los efectos de las cargas laterales son más complejos y puede haber problemas de vuelco.' };
  return { lambda, clase: 'muy alta', texto: 'λ ≥ 10: muy difícil de materializar, tecnológica y económicamente.' };
}

// ---------------------------------------------------------------------------------------------------- 2. flecha
export interface FlechaGuia { qvMax: number; qvMin: number; qv: number; h: number; E: number; J: number; f: number; fAdm: number; verifica: boolean }
/**
 * guía 4.2: la torre como ménsula empotrada con la carga uniforme promedio.
 * @param qvMax carga del viento arriba (t/m) · @param qvMin abajo (t/m) · @param h altura de la ménsula (m)
 * @param E módulo del hormigón (t/m²) · @param J ΣJ de la dirección (m⁴)
 */
export function flechaGuia(qvMax: number, qvMin: number, h: number, E: number, J: number): FlechaGuia {
  const qv = (qvMax + qvMin) / 2;
  const f = E > 0 && J > 0 ? (qv * h ** 4) / (8 * E * J) : NaN;
  const fAdm = h / 500;
  return { qvMax, qvMin, qv, h, E, J, f, fAdm, verifica: f <= fAdm };
}

// ---------------------------------------------------------------------------------------------------- 3. armado
/** diámetros comerciales (mm) y su sección (cm²) */
export const DIAMETROS = [6, 8, 10, 12, 16, 20, 25, 32];
export const areaBarra = (phi: number) => (Math.PI * (phi / 10) ** 2) / 4;
export interface Barras {
  /** diámetro (mm), separación (cm), barras por capa, sección por metro que se pide y la que se coloca (cm²/m) */
  phi: number; s: number; n: number; pedido: number; colocado: number;
}
export interface ArmadoTabique {
  /** armadura vertical total que manda (cm²): la de cálculo o la mínima (0,8 %), la mayor */
  AsTotal: number; manda: 'cálculo' | 'mínima';
  /** por capa y por metro (cm²/m), en dos capas */
  vertical: Barras; horizontal: Barras;
}
/**
 * Pasa una sección por metro a barras: el menor diámetro que, con separación de al menos 10 cm, da la sección
 * pedida. La separación se redondea hacia abajo de a 0,5 cm y no pasa del máximo (20 cm vertical, 25 cm horizontal);
 * nunca menos que el diámetro mínimo. Barras por capa = largo / separación, redondeado (como la guía).
 */
export function barras(pedido: number, largo: number, phiMin: number, sMax: number): Barras {
  for (const phi of DIAMETROS.filter(d => d >= phiMin)) {
    const sCalc = pedido > 0 ? (areaBarra(phi) / pedido) * 100 : Infinity;   // cm
    if (sCalc < 10 && phi !== DIAMETROS[DIAMETROS.length - 1]) continue;
    const s = Math.min(sMax, Math.floor(sCalc * 2) / 2);
    return { phi, s, n: Math.max(2, Math.round((largo * 100) / s)), pedido, colocado: (areaBarra(phi) * 100) / s };
  }
  return { phi: phiMin, s: sMax, n: 0, pedido, colocado: 0 };   // no se llega: no pasa con los diámetros de la tabla
}
/**
 * guía 5: armado de un tabique de largo «largo» (m) con la armadura de cálculo «AsCalc» y la mínima «AsMin» (cm²).
 * Ejemplo de la guía, T1: As mín = 72 cm² → 36 cm² por capa en 4,50 m = 8 cm²/m → Ø12 c/14 (32 Ø12 por capa);
 * horizontal 8 / 5 = 1,6 cm²/m → Ø6 c/17,5.
 */
export function armarTabique(AsCalc: number, AsMin: number, largo: number): ArmadoTabique {
  const AsTotal = Math.max(AsCalc, AsMin);
  const porMetro = largo > 0 ? AsTotal / 2 / largo : 0;
  const vertical = barras(porMetro, largo, 8, 20);
  const horizontal = barras(porMetro / 5, largo, 6, 25);
  return { AsTotal, manda: AsCalc > AsMin ? 'cálculo' : 'mínima', vertical, horizontal };
}
export const textoBarras = (b: Barras) => `Ø${b.phi} c/${String(b.s).replace('.', ',')} (${b.n} por capa)`;

// ---------------------------------------------------------------------------------------------------- 4. dinteles
/** τ admisible del hormigón al corte (kg/cm²): la guía da 24 kg/cm² para H30; para los demás, proporcional (0,08·σbk) */
export const TAU_ADM = (hormigon: string) => 0.08 * (parseFloat(hormigon.replace(/[^\d.]/g, '')) || 30) * 10;
/**
 * Momento estático (m³) respecto del baricentro de la parte del tabique que está de un lado de un corte vertical a la
 * distancia «s» del centro (tabique de largo L y espesor b): S = b · (L²/4 − s²) / 2. Con el corte al medio,
 * S = b · L/2 · L/4, como la guía.
 */
export const estaticoCorte = (b: number, L: number, s: number) => (b * (L ** 2 / 4 - s ** 2)) / 2;
export interface CorteDintel { Qj: number; S: number; J: number; t: number; hPiso: number; T: number; hDintel: number; b: number; tau: number; tauAdm: number; verifica: boolean }
/**
 * @param Qj corte que toma el tabique (t) · @param S momento estático (m³) · @param J del tabique (m⁴)
 * @param hPiso altura del piso (m) · @param hDintel alto del dintel (m) · @param b espesor (m)
 */
export function corteDintel(Qj: number, S: number, J: number, hPiso: number, hDintel: number, b: number, tauAdm: number): CorteDintel {
  const t = J > 0 ? (Qj * S) / J : NaN;                // t/m
  const T = t * hPiso;                                  // t
  const tau = hDintel > 0 && b > 0 ? (T * 1000) / (hDintel * 100 * b * 100) : NaN;   // kg/cm²
  return { Qj, S, J, t, hPiso, T, hDintel, b, tau, tauAdm, verifica: tau <= tauAdm };
}

// ---------------------------------------------------------------------------------------------------- erratas
/**
 * Números del texto de la guía que no cierran con su propio procedimiento. El método Guía sigue el procedimiento (da
 * los números bien) y estas diferencias se muestran (decisión del 18/11/2026).
 */
export const ERRATAS_GUIA: { donde: string; texto: string; calculado: string }[] = [
  { donde: '2.1.9 · tabla de qz', texto: 'qz a 7 m = 453,42 N/m² en una tabla y 426,17 N/m² en la de la carga de diseño', calculado: '453,42 N/m² (1200,49 · 0,377)' },
  { donde: '3 · planilla de características', texto: 'Q en PB = 126 t en la tabla y 204,8 t en el diagrama', calculado: 'el de la tabla (suma de Wi)' },
  { donde: '5 · momento en PB', texto: 'M en PB = 4463,8 tm en la tabla y 6025,2 tm en el texto', calculado: '4463,8 tm (el de la planilla de características)' },
  { donde: '5 · T1, triángulo de tracción', texto: 'x = 78 cm en la cuenta y 1,05 m en el esquema', calculado: 'x = 4,50 · 137,78 / (137,78 + 788) = 0,67 m' },
  { donde: '4.2 · flecha', texto: 'h = 70 m, con la torre de 64 m sobre PB y dos subsuelos de 4 m', calculado: 'h hasta la fundación = 72 m' },
  { donde: '5 · corte en el dintel', texto: 'Q(0.00) = 173 t en el texto; la cuenta usa 126 t, y h piso = 3 m en la PB de 4 m', calculado: 'Q en PB de la planilla de características y la altura real del piso' },
];
