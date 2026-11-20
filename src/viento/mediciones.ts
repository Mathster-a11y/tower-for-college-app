/**
 * Túnel de viento 2D: lo que se mide sobre la torre. Coeficientes de arrastre y de fuerza lateral, frecuencia del
 * desprendimiento de remolinos (de la fuerza lateral, que oscila con ellos), número de Strouhal y la velocidad del
 * viento real a la que la torre entraría en resonancia: V crítica = n1 · B / St.
 */

/**
 * frecuencia dominante de una señal (ciclos por paso): se promedia en bloques (filtra el ruido rápido) y se busca el
 * pico del espectro hasta 0,02 ciclos por paso, afinado con una parábola. null si entran menos de 3 ciclos.
 */
export function frecuenciaCruces(s: ArrayLike<number>, fMax = 0.02): number | null {
  const n = s.length;
  if (n < 16) return null;
  const b = Math.max(1, Math.floor(n / 2000)), m = Math.floor(n / b);
  const x = new Float64Array(m);
  for (let i = 0; i < m; i++) { let a = 0; for (let k = 0; k < b; k++) a += s[i * b + k]; x[i] = a / b; }
  let media = 0; for (let i = 0; i < m; i++) media += x[i]; media /= m;
  for (let i = 0; i < m; i++) x[i] -= media;
  // potencia en las frecuencias k/m (por bloque) → k/(m·b) por paso
  const kMax = Math.min(Math.floor(m / 2), Math.ceil(fMax * b * m) + 1);
  const pot = new Float64Array(kMax + 2);
  for (let k = 1; k <= kMax + 1 && k < m / 2; k++) {
    let re = 0, im = 0; const w = (2 * Math.PI * k) / m;
    for (let i = 0; i < m; i++) { re += x[i] * Math.cos(w * i); im -= x[i] * Math.sin(w * i); }
    pot[k] = re * re + im * im;
  }
  let kp = 0; for (let k = 3; k <= kMax; k++) if (pot[k] > pot[kp] || kp === 0) kp = k;   // al menos 3 ciclos
  if (kp < 3 || !(pot[kp] > 0)) return null;
  // parábola sobre el logaritmo de los tres valores (pico de una ventana rectangular)
  const a = Math.log(pot[kp - 1] || 1e-300), c0 = Math.log(pot[kp]), d = Math.log(pot[kp + 1] || 1e-300);
  const den = a - 2 * c0 + d, delta = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - d)) / den)) : 0;
  return (kp + delta) / (m * b);
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
