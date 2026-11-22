/**
 * Simulador de viento, etapa V2 (docs/plan_viento.html): túnel de viento 2D con el método de Lattice Boltzmann
 * (D2Q9, colisión BGK con Smagorinsky para Reynolds altos). Didáctico: un corte en planta de la torre dentro de un
 * canal. No dimensiona ni entra en ningún método.
 *
 * Unidades de la red: paso de tiempo 1, celda 1, densidad ~1. El viento entra por la izquierda (x = 0) a u0 y sale
 * por la derecha (gradiente nulo); arriba y abajo el dominio es periódico (una fila infinita de torres, separadas por
 * el alto del canal). Paredes sólidas con rebote a mitad de camino; la fuerza sobre los sólidos sale del intercambio
 * de cantidad de movimiento.
 */

// direcciones: 0 reposo, 1 E, 2 N, 3 O, 4 S, 5 NE, 6 NO, 7 SO, 8 SE
export const EX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
export const EY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
export const W9 = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
export const OPUESTA = [0, 3, 4, 1, 2, 7, 8, 5, 6];

export interface OpcionesLbm {
  nx: number; ny: number;
  /** viscosidad cinemática de la red (τ = 3ν + 0,5) */
  nu: number;
  /** velocidad de entrada (red); 0 sin entrada: con periodicoX, una caja o un canal con fuerza */
  u0?: number;
  /** constante de Smagorinsky (0 = sin modelo de turbulencia) */
  cs?: number;
  /** periódico también en x (sin entrada ni salida) */
  periodicoX?: boolean;
  /** fuerza por unidad de masa (gx, gy), para canales */
  fuerza?: [number, number];
  /** celdas sólidas (1) */
  solido?: Uint8Array;
  /** perturbación inicial transversal (fracción de u0, 0,02 por defecto) y su semilla */
  perturbacion?: number; semilla?: number;
  /**
   * paredes exactas (rebote interpolado de Bouzidi, Firdaouss y Lallemand, 2001): q de cada enlace aire → sólido
   * (ver geometria2d, Geometria2D.q). Sin q, la pared queda a mitad de camino entre celdas (en escalera).
   */
  q?: Float32Array;
  /**
   * colisión: «bgk» (un tiempo de relajación) o «trt» (dos tiempos, Ginzburg: con Λ = 3/16 la pared del rebote queda
   * donde corresponde sea cual sea la viscosidad, y es más estable con grillas gruesas)
   */
  colision?: 'bgk' | 'trt';
}
/** Λ de la colisión TRT: (τ+ − ½)(τ− − ½); 3/16 deja la pared del rebote en su lugar */
export const LAMBDA_TRT = 3 / 16;

export class Lbm2D {
  readonly nx: number; readonly ny: number; readonly N: number;
  readonly tau0: number; readonly u0: number; readonly cs: number; readonly periodicoX: boolean;
  readonly gx: number; readonly gy: number;
  readonly solido: Uint8Array;
  f: Float32Array; private g: Float32Array;
  readonly rho: Float32Array; readonly ux: Float32Array; readonly uy: Float32Array;
  /** fuerza sobre todos los sólidos en el último paso (red) */
  Fx = 0; Fy = 0;
  pasos = 0;
  /** ¿se volvió inestable? (densidad fuera de rango o NaN) */
  roto = false;
  /** enlaces fluido → sólido: celda, dirección (la que llega desde el sólido) */
  private enlaces: Int32Array;
  /** por enlace: q (dónde está la pared, 0,5 = mitad de camino) y la celda de aire del otro lado (−1 si no hay) */
  private qEnl: Float32Array; private otra: Int32Array; private otra2: Int32Array;
  readonly trt: boolean;
  readonly exactas: boolean;

  constructor(o: OpcionesLbm) {
    this.nx = o.nx; this.ny = o.ny; this.N = o.nx * o.ny;
    this.tau0 = 3 * o.nu + 0.5; this.u0 = o.u0 ?? 0; this.cs = o.cs ?? 0; this.periodicoX = !!o.periodicoX;
    [this.gx, this.gy] = o.fuerza ?? [0, 0];
    this.solido = o.solido ?? new Uint8Array(this.N);
    this.f = new Float32Array(9 * this.N); this.g = new Float32Array(9 * this.N);
    this.rho = new Float32Array(this.N).fill(1); this.ux = new Float32Array(this.N); this.uy = new Float32Array(this.N);
    // arranca con el flujo uniforme (fuera de los sólidos), con una perturbación chica transversal: en un canal
    // periódico el flujo alrededor de una forma simétrica no tiene otra cosa que lo saque de la simetría (en un túnel
    // real siempre hay algo de turbulencia)
    let semilla = o.semilla ?? 12345;
    const azar = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296 - 0.5; };
    const amp = (o.perturbacion ?? 0.02) * this.u0;
    for (let c = 0; c < this.N; c++) {
      const u = this.solido[c] ? 0 : this.u0, v = this.solido[c] ? 0 : amp * azar();
      this.ux[c] = u; this.uy[c] = v;
      for (let i = 0; i < 9; i++) this.f[i * this.N + c] = feq(i, 1, u, v);
    }
    // enlaces con los sólidos (para el rebote y la fuerza)
    const enl: number[] = [];
    for (let y = 0; y < this.ny; y++) for (let x = 0; x < this.nx; x++) {
      const c = y * this.nx + x;
      if (this.solido[c]) continue;
      for (let i = 1; i < 9; i++) {
        let xs = x - EX[i], ys = y - EY[i];
        if (ys < 0) ys += this.ny; else if (ys >= this.ny) ys -= this.ny;
        if (xs < 0 || xs >= this.nx) { if (!this.periodicoX) continue; xs = (xs + this.nx) % this.nx; }
        if (this.solido[ys * this.nx + xs]) enl.push(c, i);
      }
    }
    this.enlaces = Int32Array.from(enl);
    this.trt = o.colision === 'trt';
    this.exactas = !!o.q;
    const nE = this.enlaces.length / 2;
    this.qEnl = new Float32Array(nE).fill(0.5); this.otra = new Int32Array(nE).fill(-1); this.otra2 = new Int32Array(nE).fill(-1);
    for (let k = 0; k < nE; k++) {
      const c = this.enlaces[2 * k], i = this.enlaces[2 * k + 1];
      if (o.q && o.q[i * this.N + c] > 0) this.qEnl[k] = o.q[i * this.N + c];
      // la celda de aire del otro lado (c + e_i): la usa el rebote interpolado cuando la pared está cerca (q < ½)
      const x = c % this.nx, y = (c - x) / this.nx;
      let x2 = x + EX[i], y2 = y + EY[i];
      if (y2 < 0) y2 += this.ny; else if (y2 >= this.ny) y2 -= this.ny;
      if (x2 < 0 || x2 >= this.nx) { if (!this.periodicoX) continue; x2 = (x2 + this.nx) % this.nx; }
      const c2 = y2 * this.nx + x2;
      if (this.solido[c2]) continue;
      this.otra[k] = c2;
      // y la siguiente (c + 2·e_i), para la interpolación cuadrática
      let x3 = x2 + EX[i], y3 = y2 + EY[i];
      if (y3 < 0) y3 += this.ny; else if (y3 >= this.ny) y3 -= this.ny;
      if (x3 < 0 || x3 >= this.nx) { if (!this.periodicoX) continue; x3 = (x3 + this.nx) % this.nx; }
      if (!this.solido[y3 * this.nx + x3]) this.otra2[k] = y3 * this.nx + x3;
    }
  }

  /** un paso: colisión, propagación con rebote en los sólidos, entrada y salida */
  paso() {
    const { nx, ny, N, f, g, solido, rho, ux, uy } = this;
    const tau0 = this.tau0, cs2 = this.cs * this.cs, gx = this.gx, gy = this.gy, conFuerza = gx !== 0 || gy !== 0;
    // --- colisión (en el lugar, sobre f)
    let roto = false;
    for (let c = 0; c < N; c++) {
      if (solido[c]) continue;
      const f0 = f[c], f1 = f[N + c], f2 = f[2 * N + c], f3 = f[3 * N + c], f4 = f[4 * N + c], f5 = f[5 * N + c], f6 = f[6 * N + c], f7 = f[7 * N + c], f8 = f[8 * N + c];
      const r = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8;
      if (!(r > 0.2 && r < 5)) { roto = true; continue; }
      const jx = f1 - f3 + f5 - f6 - f7 + f8, jy = f2 - f4 + f5 + f6 - f7 - f8;
      let u = jx / r, v = jy / r;
      // velocidad física (con media fuerza) para mostrar
      ux[c] = u + gx / (2 * r); uy[c] = v + gy / (2 * r); rho[c] = r;
      // tensor de no equilibrio (para Smagorinsky): Π = Σ e e (f − feq)
      const usq = 1.5 * (u * u + v * v);
      const e0 = (4 / 9) * r * (1 - usq);
      const e1 = (1 / 9) * r * (1 + 3 * u + 4.5 * u * u - usq), e3 = (1 / 9) * r * (1 - 3 * u + 4.5 * u * u - usq);
      const e2 = (1 / 9) * r * (1 + 3 * v + 4.5 * v * v - usq), e4 = (1 / 9) * r * (1 - 3 * v + 4.5 * v * v - usq);
      const a5 = u + v, a6 = -u + v;
      const e5 = (1 / 36) * r * (1 + 3 * a5 + 4.5 * a5 * a5 - usq), e7 = (1 / 36) * r * (1 - 3 * a5 + 4.5 * a5 * a5 - usq);
      const e6 = (1 / 36) * r * (1 + 3 * a6 + 4.5 * a6 * a6 - usq), e8 = (1 / 36) * r * (1 - 3 * a6 + 4.5 * a6 * a6 - usq);
      let tau = tau0;
      if (cs2 > 0) {
        const d1 = f1 - e1, d2 = f2 - e2, d3 = f3 - e3, d4 = f4 - e4, d5 = f5 - e5, d6 = f6 - e6, d7 = f7 - e7, d8 = f8 - e8;
        const pxx = d1 + d3 + d5 + d6 + d7 + d8, pyy = d2 + d4 + d5 + d6 + d7 + d8, pxy = d5 - d6 + d7 - d8;
        const Q = Math.sqrt(2 * (pxx * pxx + pyy * pyy + 2 * pxy * pxy));
        tau = 0.5 * (tau0 + Math.sqrt(tau0 * tau0 + (18 * cs2 * Q) / r));
      }
      const om = 1 / tau;
      if (this.trt && !conFuerza) {
        // TRT: la parte simétrica de cada par de direcciones relaja con ω+ (la viscosidad) y la antisimétrica con ω−
        const omm = 1 / (LAMBDA_TRT / (tau - 0.5) + 0.5);
        f[c] = f0 + om * (e0 - f0);
        const par = (a: number, b: number, fa: number, fb: number, ea: number, eb: number) => {
          const sp = om * ((fa + fb) - (ea + eb)) * 0.5, sm = omm * ((fa - fb) - (ea - eb)) * 0.5;
          f[a * N + c] = fa - sp - sm; f[b * N + c] = fb - sp + sm;
        };
        par(1, 3, f1, f3, e1, e3); par(2, 4, f2, f4, e2, e4); par(5, 7, f5, f7, e5, e7); par(6, 8, f6, f8, e6, e8);
        continue;
      }
      if (conFuerza && this.trt) {
        // TRT con fuerza (al estilo Guo): equilibrio con u = (j + g/2)/ρ y la fuerza como fuente en la parte
        // antisimétrica, con su factor (1 − ω−/2)
        const omm = 1 / (LAMBDA_TRT / (tau - 0.5) + 0.5), uu = u + gx / (2 * r), vv = v + gy / (2 * r);
        const fi = [f0, f1, f2, f3, f4, f5, f6, f7, f8], ei = fi.map((_, i) => feq(i, r, uu, vv));
        f[c] = f0 + om * (ei[0] - f0);
        for (const [a, b] of [[1, 3], [2, 4], [5, 7], [6, 8]]) {
          const sp = om * ((fi[a] + fi[b]) - (ei[a] + ei[b])) * 0.5, sm = omm * ((fi[a] - fi[b]) - (ei[a] - ei[b])) * 0.5;
          const fu = (1 - omm / 2) * 3 * W9[a] * r * (EX[a] * gx + EY[a] * gy);       // fuente: impar (la de b es −fu)
          f[a * N + c] = fi[a] - sp - sm + fu; f[b * N + c] = fi[b] - sp + sm - fu;
        }
        continue;
      }
      if (conFuerza) {
        // fuerza por corrimiento de la velocidad de equilibrio (Shan-Chen): u_eq = u + τ·g/ρ... con ρ ≈ 1
        u += (tau * gx) / r; v += (tau * gy) / r;
        for (let i = 0; i < 9; i++) f[i * N + c] += om * (feq(i, r, u, v) - f[i * N + c]);
        continue;
      }
      f[c] = f0 + om * (e0 - f0);
      f[N + c] = f1 + om * (e1 - f1); f[2 * N + c] = f2 + om * (e2 - f2); f[3 * N + c] = f3 + om * (e3 - f3); f[4 * N + c] = f4 + om * (e4 - f4);
      f[5 * N + c] = f5 + om * (e5 - f5); f[6 * N + c] = f6 + om * (e6 - f6); f[7 * N + c] = f7 + om * (e7 - f7); f[8 * N + c] = f8 + om * (e8 - f8);
    }
    // --- propagación (tirando del vecino de atrás), fila por fila como copias de memoria
    const perX = this.periodicoX;
    g.set(f.subarray(0, N), 0);
    for (let i = 1; i < 9; i++) {
      const ex = EX[i], ey = EY[i], ii = i * N;
      for (let y = 0; y < ny; y++) {
        let ys = y - ey; if (ys < 0) ys += ny; else if (ys >= ny) ys -= ny;
        const fila = ii + y * nx, filaS = ii + ys * nx;
        if (ex === 0) g.set(f.subarray(filaS, filaS + nx), fila);
        else if (ex === 1) {
          g.set(f.subarray(filaS, filaS + nx - 1), fila + 1);
          g[fila] = perX ? f[filaS + nx - 1] : f[fila];                     // borde de entrada: se pisa después
        } else {
          g.set(f.subarray(filaS + 1, filaS + nx), fila);
          g[fila + nx - 1] = perX ? f[filaS] : f[fila + nx - 1];
        }
      }
    }
    // rebote en los sólidos: la población opuesta salió hacia el sólido con −e y vuelve. A mitad de camino (en
    // escalera) vuelve igual; con paredes exactas se interpola según dónde está la pared (Bouzidi): con q < ½ entre esta
    // celda y la de atrás, con q ≥ ½ entre lo que salió y lo que llegaba. El sólido recibe (fo + lo que vuelve)·(−e).
    let Fx = 0, Fy = 0;
    const en = this.enlaces, qE = this.qEnl, otra = this.otra, otra2 = this.otra2, exactas = this.exactas;
    for (let k = 0, n = 0; k < en.length; k += 2, n++) {
      const c = en[k], i = en[k + 1], io = OPUESTA[i], fo = f[io * N + c];
      let vuelve = fo;
      if (exactas) {
        // interpolación cuadrática de Bouzidi (exacta para un perfil parabólico); lineal si no hay dos celdas de aire
        // detrás; y el rebote simple si no hay ninguna
        const q = qE[n], c2 = otra[n], c3 = otra2[n];
        if (c2 >= 0 && c3 >= 0) {
          vuelve = q < 0.5
            ? q * (1 + 2 * q) * fo + (1 - 4 * q * q) * f[io * N + c2] - q * (1 - 2 * q) * f[io * N + c3]
            : fo / (q * (2 * q + 1)) + ((2 * q - 1) / q) * f[i * N + c] + ((1 - 2 * q) / (1 + 2 * q)) * f[i * N + c2];
        } else if (q < 0.5) { if (c2 >= 0) vuelve = 2 * q * fo + (1 - 2 * q) * f[io * N + c2]; }
        else vuelve = fo / (2 * q) + ((2 * q - 1) / (2 * q)) * f[i * N + c];
      }
      g[i * N + c] = vuelve;
      Fx -= (fo + vuelve) * EX[i]; Fy -= (fo + vuelve) * EY[i];
    }
    // --- entrada (equilibrio a u0) y salida (gradiente nulo)
    if (!perX) {
      for (let y = 0; y < ny; y++) {
        const c0 = y * nx, cN = c0 + nx - 1;
        if (!solido[c0]) for (let i = 0; i < 9; i++) g[i * N + c0] = feq(i, 1, this.u0, 0);
        if (!solido[cN]) for (let i = 0; i < 9; i++) g[i * N + cN] = g[i * N + cN - 1];
      }
    }
    // sólidos: quedan en reposo
    this.f = g; this.g = f;
    this.Fx = Fx; this.Fy = Fy;
    this.pasos++;
    if (roto) this.roto = true;
  }

  /** la vorticidad ∂v/∂x − ∂u/∂y (diferencias centradas; 0 en los sólidos y en los bordes) */
  vorticidad(out = new Float32Array(this.N)): Float32Array {
    const { nx, ny, ux, uy, solido } = this;
    out.fill(0);
    for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
      const c = y * nx + x;
      if (solido[c]) continue;
      out[c] = (uy[c + 1] - uy[c - 1]) * 0.5 - (ux[c + nx] - ux[c - nx]) * 0.5;
    }
    return out;
  }
  /** masa total (para la conservación) */
  masa(): number { let m = 0; for (let k = 0; k < 9 * this.N; k++) m += this.f[k]; return m; }
}

/** distribución de equilibrio de la dirección i */
export function feq(i: number, r: number, u: number, v: number): number {
  const eu = EX[i] * u + EY[i] * v;
  return W9[i] * r * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * (u * u + v * v));
}
