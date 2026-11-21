/**
 * Simulador de viento, prototipo de la etapa V3 (docs/plan_viento.html): Lattice Boltzmann D3Q19 en JavaScript.
 * Es la referencia del núcleo en la placa de video (lbm3dGpu.ts): hace exactamente lo mismo, en el mismo orden, para
 * poder compararlos celda por celda. Solo sirve para grillas chicas (pruebas); la grande corre en la GPU.
 *
 * Un paso, en cada celda de fluido: junta las 19 poblaciones de los vecinos de atrás (tirando), rebota en los sólidos
 * (a mitad de camino) y choca (BGK con Smagorinsky). Bordes: entrada en x = 0 con el perfil de velocidad uIn(z);
 * salida en x = nx − 1 (la población que vendría de afuera se copia de la celda de atrás); tapa de arriba deslizante
 * (reflexión especular, conserva la masa); y periódico.
 * El suelo es una fila de sólidos en z = 0 (la arma la geometría).
 */

// 0 reposo · 1..6 ejes (+x −x +y −y +z −z) · 7..18 diagonales, de a pares opuestos
export const EX3 = [0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0];
export const EY3 = [0, 0, 0, 1, -1, 0, 0, 1, -1, -1, 1, 0, 0, 0, 0, 1, -1, 1, -1];
export const EZ3 = [0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1, -1, -1, 1, 1, -1, -1, 1];
export const W19 = [1 / 3, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
export const OPP3 = [0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15, 18, 17];
/** la misma dirección con ez cambiado de signo (reflexión en la tapa de arriba) */
export const ESP3 = EX3.map((_, i) => EX3.findIndex((_, k) => EX3[k] === EX3[i] && EY3[k] === EY3[i] && EZ3[k] === -EZ3[i]));

export interface OpcionesLbm3 {
  nx: number; ny: number; nz: number;
  /** viscosidad de la red (τ = 3ν + ½) y constante de Smagorinsky (0 = sin modelo) */
  nu: number; cs?: number;
  /** velocidad de entrada en cada altura z (red) */
  uIn: Float32Array;
  solido: Uint8Array;
}

export function feq3(i: number, r: number, u: number, v: number, w: number): number {
  const eu = EX3[i] * u + EY3[i] * v + EZ3[i] * w;
  return W19[i] * r * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * (u * u + v * v + w * w));
}

export class Lbm3D {
  readonly nx: number; readonly ny: number; readonly nz: number; readonly N: number;
  readonly tau0: number; readonly cs: number; readonly uIn: Float32Array; readonly solido: Uint8Array;
  f: Float32Array; private g: Float32Array;
  pasos = 0;

  constructor(o: OpcionesLbm3) {
    this.nx = o.nx; this.ny = o.ny; this.nz = o.nz; this.N = o.nx * o.ny * o.nz;
    this.tau0 = 3 * o.nu + 0.5; this.cs = o.cs ?? 0; this.uIn = o.uIn; this.solido = o.solido;
    this.f = new Float32Array(19 * this.N); this.g = new Float32Array(19 * this.N);
    inicial3(this.f, this.nx, this.ny, this.nz, this.uIn, this.solido);
    this.g.set(this.f);
  }

  paso() {
    const { nx, ny, nz, N, f, g, solido, uIn } = this;
    const tau0 = this.tau0, cs2 = this.cs * this.cs;
    const v = new Float64Array(19);
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const c = (z * ny + y) * nx + x;
      if (solido[c]) continue;
      if (x === 0) { for (let i = 0; i < 19; i++) g[i * N + c] = feq3(i, 1, uIn[z], 0, 0); continue; }
      for (let i = 0; i < 19; i++) {
        const sx = x - EX3[i], sz = z - EZ3[i];
        let sy = y - EY3[i]; if (sy < 0) sy += ny; else if (sy >= ny) sy -= ny;
        if (sz >= nz || sz < 0) { v[i] = f[ESP3[i] * N + c]; continue; }    // tapa (y fondo sin suelo): refleja
        const s = (sz * ny + sy) * nx + (sx >= nx ? nx - 2 : sx);            // salida: la de atrás
        v[i] = solido[s] ? f[OPP3[i] * N + c] : f[i * N + s];
      }
      chocar3(v, tau0, cs2);
      for (let i = 0; i < 19; i++) g[i * N + c] = v[i];
    }
    this.f = g; this.g = f; this.pasos++;
  }

  /** velocidad (ux, uy, uz) y densidad de una celda */
  macro(c: number): { r: number; u: number; v: number; w: number } {
    let r = 0, jx = 0, jy = 0, jz = 0;
    for (let i = 0; i < 19; i++) { const q = this.f[i * this.N + c]; r += q; jx += q * EX3[i]; jy += q * EY3[i]; jz += q * EZ3[i]; }
    return { r, u: jx / r, v: jy / r, w: jz / r };
  }
  masa(): number { let m = 0; for (let c = 0; c < this.N; c++) if (!this.solido[c]) for (let i = 0; i < 19; i++) m += this.f[i * this.N + c]; return m; }
}

/** el estado inicial: el perfil de entrada en todo el fluido (lo usa también la GPU) */
export function inicial3(f: Float32Array, nx: number, ny: number, nz: number, uIn: Float32Array, solido: Uint8Array) {
  const N = nx * ny * nz;
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const c = (z * ny + y) * nx + x, u = solido[c] ? 0 : uIn[z];
    for (let i = 0; i < 19; i++) f[i * N + c] = feq3(i, 1, u, 0, 0);
  }
}

/** colisión BGK con Smagorinsky sobre las 19 poblaciones (en el lugar) */
export function chocar3(v: Float64Array, tau0: number, cs2: number) {
  let r = 0, jx = 0, jy = 0, jz = 0;
  for (let i = 0; i < 19; i++) { r += v[i]; jx += v[i] * EX3[i]; jy += v[i] * EY3[i]; jz += v[i] * EZ3[i]; }
  const u = jx / r, w2 = jy / r, w = jz / r;
  let tau = tau0;
  const eq = new Float64Array(19);
  for (let i = 0; i < 19; i++) eq[i] = feq3(i, r, u, w2, w);
  if (cs2 > 0) {
    let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
    for (let i = 1; i < 19; i++) {
      const d = v[i] - eq[i], ex = EX3[i], ey = EY3[i], ez = EZ3[i];
      xx += ex * ex * d; yy += ey * ey * d; zz += ez * ez * d; xy += ex * ey * d; xz += ex * ez * d; yz += ey * ez * d;
    }
    const Q = Math.sqrt(2 * (xx * xx + yy * yy + zz * zz + 2 * (xy * xy + xz * xz + yz * yz)));
    tau = 0.5 * (tau0 + Math.sqrt(tau0 * tau0 + (18 * cs2 * Q) / r));
  }
  const om = 1 / tau;
  for (let i = 0; i < 19; i++) v[i] += om * (eq[i] - v[i]);
}

/**
 * geometría de prueba (y del prototipo): un prisma de base a × a y alto hT celdas, apoyado en el suelo, a «x0» de la
 * entrada y centrado en y; el suelo es la fila z = 0.
 */
export function canalConPrisma(nx: number, ny: number, nz: number, a: number, hT: number, x0: number): Uint8Array {
  const s = new Uint8Array(nx * ny * nz), y0 = Math.floor((ny - a) / 2);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) s[y * nx + x] = 1;
  for (let z = 1; z <= hT && z < nz; z++) for (let y = y0; y < y0 + a; y++) for (let x = x0; x < x0 + a; x++) s[(z * ny + y) * nx + x] = 1;
  return s;
}

/** perfil de entrada de la ley potencial: u(z) = u0 · (altura / zRef)^α, con el suelo en z = 0 (102-25: α según exposición) */
export function perfilPotencia(nz: number, u0: number, zRef: number, alfa: number): Float32Array {
  const u = new Float32Array(nz);
  for (let z = 1; z < nz; z++) u[z] = Math.min(1.25 * u0, u0 * Math.pow((z - 0.5) / zRef, alfa));
  return u;
}
