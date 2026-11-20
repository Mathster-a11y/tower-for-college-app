/**
 * Túnel de viento 2D: lo que se mide sobre la torre. Coeficientes de arrastre y de fuerza lateral, frecuencia del
 * desprendimiento de remolinos (de la fuerza lateral, que oscila con ellos), número de Strouhal y la velocidad del
 * viento real a la que la torre entraría en resonancia: V crítica = n1 · B / St.
 */

/** frecuencia de una señal (ciclos por paso) por sus cruces por la media; null si no hay al menos 3 cruces */
export function frecuenciaCruces(s: ArrayLike<number>): number | null {
  const n = s.length;
  if (n < 8) return null;
  let m = 0; for (let i = 0; i < n; i++) m += s[i]; m /= n;
  const cruces: number[] = [];
  for (let i = 1; i < n; i++) {
    const a = s[i - 1] - m, b = s[i] - m;
    if (a < 0 && b >= 0) cruces.push(i - 1 + a / (a - b));              // subidas, interpoladas
  }
  if (cruces.length < 3) return null;
  return (cruces.length - 1) / (cruces[cruces.length - 1] - cruces[0]);
}

export interface Mediciones {
  /** arrastre medio y fuerza lateral (media y desvío) adimensionales: F / (½ ρ u0² D) */
  Cd: number; Cl: number; ClRms: number;
  /** frecuencia (ciclos por paso) y Strouhal = f·D/u0; null si todavía no hay oscilación clara */
  f: number | null; St: number | null;
}

/** sobre las últimas fuerzas guardadas (Fx, Fy por paso, en unidades de la red) */
export function medir(Fx: ArrayLike<number>, Fy: ArrayLike<number>, u0: number, D: number): Mediciones {
  const q = 0.5 * u0 * u0 * D, n = Fx.length;
  if (!n || !(q > 0)) return { Cd: NaN, Cl: NaN, ClRms: NaN, f: null, St: null };
  let sx = 0, sy = 0; for (let i = 0; i < n; i++) { sx += Fx[i]; sy += Fy[i]; }
  const mx = sx / n, my = sy / n;
  let v = 0; for (let i = 0; i < n; i++) v += (Fy[i] - my) ** 2;
  const ClRms = Math.sqrt(v / n) / q;
  // si la fuerza lateral casi no oscila, no hay desprendimiento claro
  const f = ClRms > 0.02 ? frecuenciaCruces(Fy) : null;
  return { Cd: mx / q, Cl: my / q, ClRms, f, St: f === null ? null : (f * D) / u0 };
}

/** velocidad del viento real a la que los remolinos se desprenden a la frecuencia propia de la torre (m/s) */
export function velocidadCritica(n1: number, anchoM: number, St: number): number {
  return St > 0 ? (n1 * anchoM) / St : NaN;
}
