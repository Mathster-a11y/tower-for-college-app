/**
 * Túnel 3D, etapa 4 de la propuesta de resultados (docs/propuesta_resultados_3d): la torre como algo que se mueve.
 *
 *  · Espectro de la fuerza: de la serie de tiempo de la base sale cuánta energía tiene la fuerza en cada frecuencia
 *    (Welch: tramos con ventana de Hann, promediados). El pico de la fuerza lateral es el desprendimiento de remolinos:
 *    St = f · B / V, y la velocidad crítica (la que hace que los remolinos vayan al ritmo de la torre) V = n1 · B / St.
 *  · Aceleración en la azotea: la torre como un oscilador de un grado de libertad en su primer modo (φ = z / H). La
 *    fuerza generalizada es F*(t) = Σ F_i(t) · z_i / H = M_base(t) / H (¡el vuelco de la base dividido la altura!) y la
 *    parte resonante de la respuesta es σ_a = (g / M*) · √(π · n1 · S_F*(n1) / (4 ζ)), con M* = Σ m_i · φ_i² y ζ el
 *    amortiguamiento. Para otra recurrencia (1, 5 o 10 años) la fuerza escala con V² y las frecuencias con V:
 *    S(n; f·V) = f³ · S(n / f; V).
 *  · Deriva entre pisos: la ménsula de la etapa Rigidez cargada con las fuerzas de cada nivel.
 *
 * Unidades: t (fuerza), t (masa: el peso en t es la masa en toneladas), m, s, Hz. Aceleraciones en mili-g.
 */

export const GRAVEDAD = 9.80665;

// ------------------------------------------------------------------------------------------------ espectro
/** la serie en pasos de tiempo parejos (interpolación lineal): los tiempos de muestreo de la app no son regulares */
export function remuestrear(t: number[], v: number[], dt: number): number[] {
  if (t.length < 2 || !(dt > 0)) return [];
  const out: number[] = [];
  let k = 0;
  for (let x = t[0]; x <= t[t.length - 1] + 1e-12; x += dt) {
    while (k < t.length - 2 && t[k + 1] < x) k++;
    const f = (x - t[k]) / (t[k + 1] - t[k] || 1);
    out.push(v[k] + (v[k + 1] - v[k]) * Math.max(0, Math.min(1, f)));
  }
  return out;
}
export interface Espectro { f: number[]; S: number[]; df: number; tramos: number }
/**
 * Densidad espectral de un lado (unidades² / Hz) por el método de Welch: tramos de largo L (la potencia de 2 que entra
 * dos veces en la serie, 16 como mínimo), solapados a la mitad, con ventana de Hann. ∫ S df ≈ la varianza.
 */
export function espectro(x: number[], dt: number): Espectro | null {
  const n = x.length;
  if (n < 32 || !(dt > 0)) return null;
  const media = x.reduce((a, b) => a + b, 0) / n, y = x.map(v => v - media);
  const L = Math.min(512, 2 ** Math.floor(Math.log2(n / 2))), paso = L / 2;
  const w = Array.from({ length: L }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (L - 1))), U = w.reduce((a, b) => a + b * b, 0) / L;
  const nf = L / 2 + 1, S = new Array<number>(nf).fill(0);
  let tramos = 0;
  for (let s = 0; s + L <= n; s += paso) {
    for (let k = 0; k < nf; k++) {
      let re = 0, im = 0;
      for (let i = 0; i < L; i++) { const a = (-2 * Math.PI * k * i) / L, v = y[s + i] * w[i]; re += v * Math.cos(a); im += v * Math.sin(a); }
      S[k] += ((k === 0 || k === L / 2 ? 1 : 2) * (re * re + im * im) * dt) / (U * L);
    }
    tramos++;
  }
  return { f: S.map((_, k) => k / (L * dt)), S: S.map(v => v / tramos), df: 1 / (L * dt), tramos };
}
/** la frecuencia del pico más alto por encima de fMin (Hz), con interpolación parabólica entre las tres barras */
export function frecuenciaPico(e: Espectro, fMin = 0, fMax = Infinity): number {
  let k = -1;
  for (let i = 1; i < e.S.length - 1; i++) if (e.f[i] >= fMin && e.f[i] <= fMax && (k < 0 || e.S[i] > e.S[k])) k = i;
  if (k < 1) return NaN;
  const a = e.S[k - 1], b = e.S[k], c = e.S[k + 1], d = a - 2 * b + c;
  return e.f[k] + (d < 0 ? (0.5 * (a - c)) / d : 0) * e.df;
}
/** la densidad espectral en la frecuencia n (lineal entre barras; 0 fuera del rango) */
export function densidadEn(e: Espectro, n: number): number {
  if (!(n >= 0) || n > e.f[e.f.length - 1]) return 0;
  const k = Math.min(e.f.length - 2, Math.floor(n / e.df)), t = (n - e.f[k]) / e.df;
  return e.S[k] + (e.S[k + 1] - e.S[k]) * t;
}

// ------------------------------------------------------------------------------------------------ aceleración
/** factor de pico de una respuesta resonante en una hora (Davenport): √(2 ln(3600 n)) + 0,5772 / √(2 ln(3600 n)) */
export const factorPicoResonante = (n1: number) => { const r = Math.sqrt(2 * Math.log(3600 * Math.max(n1, 0.01))); return r + 0.5772 / r; };
/**
 * Aceleración en la azotea (mili-g): parte resonante del primer modo, con φ = z / H.
 * @param e espectro de la fuerza generalizada F* = M_base / H (t² / Hz), con la velocidad de la simulación
 * @param n1 frecuencia propia (Hz) en el sentido de la fuerza; Mstar masa generalizada (t); zeta amortiguamiento (0,02 = 2 %)
 * @param f velocidad de la recurrencia buscada / velocidad de la simulación (1 = la misma)
 */
export function aceleracion(e: Espectro, n1: number, Mstar: number, zeta: number, f = 1): { sigma: number; pico: number; g: number } {
  // a menor velocidad, la misma física pasa a frecuencias más bajas: lo que la torre «ve» en n1 es lo que la simulación tiene en n1 / f
  const S = f ** 3 * densidadEn(e, n1 / f);
  const sigma = (GRAVEDAD / Mstar) * Math.sqrt((Math.PI * n1 * S) / (4 * zeta));
  const g = factorPicoResonante(n1);
  return { sigma: (sigma / GRAVEDAD) * 1000, pico: ((g * sigma) / GRAVEDAD) * 1000, g };
}
/**
 * La peor aceleración con vientos desde un 25 % del de la simulación hasta f · V: si la velocidad crítica de los
 * remolinos es más baja que la del viento de f, la resonancia aparece con vientos más frecuentes y más flojos.
 */
export function peorAceleracion(e: Espectro, n1: number, Mstar: number, zeta: number, fMax: number, pasos = 60): { pico: number; f: number } {
  let mejor = { pico: 0, f: fMax };
  for (let i = 0; i <= pasos; i++) {
    const f = 0.25 * fMax + ((fMax - 0.25 * fMax) * i) / pasos, a = aceleracion(e, n1, Mstar, zeta, f).pico;
    if (a > mejor.pico) mejor = { pico: a, f };
  }
  return mejor;
}
/** masa generalizada del primer modo con φ = z / H: Σ m_i · (z_i / H)² (t) */
export const masaGeneralizada = (niveles: { z: number; m: number }[], H: number) => niveles.reduce((s, x) => s + x.m * (x.z / H) ** 2, 0);

// ------------------------------------------------------------------------------------------------ deriva
export interface FilaDeriva { z: number; d: number; deriva: number }
/**
 * Corrimiento de cada nivel y deriva entre pisos (corrimiento relativo / altura del piso) de la ménsula empotrada en PB
 * con fuerzas en los niveles, integrando la curvatura M / EJ dos veces (trapecios, como la etapa Rigidez).
 * @param niveles z (m sobre PB, PB incluido con z = 0) y fuerza F (t), de abajo hacia arriba; EJ(z) en t·m²
 */
export function derivas(niveles: { z: number; F: number }[], EJ: (z: number) => number): FilaDeriva[] {
  const ns = [...niveles].sort((a, b) => a.z - b.z);
  const M = ns.map(n => ns.reduce((s, q) => s + (q.z > n.z ? q.F * (q.z - n.z) : 0), 0));
  const out: FilaDeriva[] = [];
  let th = 0, d = 0;
  ns.forEach((n, i) => {
    if (i > 0) {
      const a = ns[i - 1], dz = n.z - a.z, th1 = th + ((M[i - 1] / EJ(a.z) + M[i] / EJ(n.z)) / 2) * dz;
      d += ((th + th1) / 2) * dz; th = th1;
    }
    // dos niveles en la misma cota no son un piso: deriva 0
    out.push({ z: n.z, d, deriva: i > 0 && n.z - ns[i - 1].z > 1e-9 ? (d - out[i - 1].d) / (n.z - ns[i - 1].z) : 0 });
  });
  return out;
}
