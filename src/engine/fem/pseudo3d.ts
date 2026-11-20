/**
 * Motor FEM «pseudo-3D» (plan de trabajo, etapa 6; docs/motor-fem/CONTEXTO.md, motor A).
 *
 * La torre como la arman ETABS y los programas de edificios en su versión más simple: cada pieza es una ménsula
 * vertical empotrada en PB que flexiona en su dirección (Euler, o Timoshenko con la deformación por corte de sus
 * almas), y cada losa es un diafragma rígido con tres grados de libertad: ux, uy y el giro θ alrededor del eje z.
 *
 *  - Una pieza paralela al viento A (muros «Y») está en la posición x y se mueve uy + θ·x; una del viento B (muros
 *    «X») está en y y se mueve ux − θ·y (la cinemática de la losa rígida, igual que rigidDiaphragm de OpenSees).
 *  - Cada pieza existe hasta su cota más alta (las piezas que no llegan arriba, que la planilla no ve).
 *  - La matriz de cada ménsula se condensa a los desplazamientos de sus pisos (los giros se eliminan) y se ensambla.
 *
 * Hipótesis que comparte con la planilla: losa rígida, piezas empotradas en PB, sin interacción entre piezas (sin
 * dinteles ni vigas de acople). Lo que agrega: la deformación por corte, las piezas de altura parcial, el reparto que
 * cambia piso a piso y la frecuencia (análisis modal). Se verifica contra OpenSees y Pynite (test/motorFem.test.ts).
 *
 * Unidades: m, t, t/m² (E y G), t·s²/m (masas).
 */

export interface PiezaModelo {
  nombre: string;
  /** dirección en que flexiona: «A» = en y (muros paralelos al viento A), «B» = en x */
  dir: 'A' | 'B';
  /** posición perpendicular a su dirección: x para las «A», y para las «B» (m) */
  pos: number;
  /** momento de inercia (m⁴) y área de corte de sus almas (m²) */
  J: number; Av: number;
  /** cota más alta a la que llega (m, sobre PB) */
  zHasta: number;
}
export interface ModeloTorre {
  /** cotas de los pisos sobre PB, de abajo hacia arriba (m) */
  z: number[];
  piezas: PiezaModelo[];
  E: number; G: number;
  /** con deformación por corte (Timoshenko) */
  timo: boolean;
}
/** cargas en cada piso, en el centro de la losa (0, 0): fuerzas en x e y (t) y momento torsor (tm) */
export interface CargasPiso { Fx: number[]; Fy: number[]; Mz: number[] }
export interface ResultadoFem {
  ux: number[]; uy: number[]; rz: number[];
  /** corte y momento en la base de cada pieza (t, tm), y la fuerza que toma en cada piso (t) */
  piezas: { nombre: string; dir: 'A' | 'B'; V: number; M: number; f: number[] }[];
}

// ---------------------------------------------------------------------------------------------------- álgebra
type Mat = number[][];
const ceros = (n: number, m = n): Mat => Array.from({ length: n }, () => new Array(m).fill(0));
/** resuelve A·x = b (Gauss con pivoteo parcial); A y b no se modifican */
export function resolver(A: Mat, b: number[]): number[] {
  const n = b.length, M = A.map((f, i) => [...f, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    if (Math.abs(d) < 1e-300) throw new Error('El modelo no tiene rigidez en alguna dirección (falta una pieza que lo sostenga).');
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / d; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

// ---------------------------------------------------------------------------------------------------- una ménsula
/** matriz de rigidez de una viga 2D (desplazamiento lateral w y giro φ en cada punta), Euler o Timoshenko */
function vigaTimoshenko(EI: number, GAv: number | null, L: number): Mat {
  const fi = GAv ? (12 * EI) / (GAv * L * L) : 0;
  const k = EI / ((1 + fi) * L ** 3);
  return [
    [12 * k, 6 * L * k, -12 * k, 6 * L * k],
    [6 * L * k, (4 + fi) * L * L * k, -6 * L * k, (2 - fi) * L * L * k],
    [-12 * k, -6 * L * k, 12 * k, -6 * L * k],
    [6 * L * k, (2 - fi) * L * L * k, -6 * L * k, (4 + fi) * L * L * k],
  ];
}
/**
 * Rigidez lateral de una ménsula empotrada en z = 0 con nudos en las cotas «zs» (de abajo hacia arriba), condensada a
 * los desplazamientos laterales: K = Kww − Kwφ · Kφφ⁻¹ · Kφw.
 */
export function rigidezMensula(zs: number[], EI: number, GAv: number | null): Mat {
  const m = zs.length, n = 2 * m;              // gdl libres: (w, φ) de cada nudo sobre la base
  const K = ceros(n);
  let z0 = 0;
  zs.forEach((z, e) => {
    const ke = vigaTimoshenko(EI, GAv, z - z0);
    const gdl = [e === 0 ? -1 : 2 * (e - 1), e === 0 ? -1 : 2 * (e - 1) + 1, 2 * e, 2 * e + 1];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (gdl[a] >= 0 && gdl[b] >= 0) K[gdl[a]][gdl[b]] += ke[a][b];
    z0 = z;
  });
  const w = Array.from({ length: m }, (_, i) => 2 * i), f = Array.from({ length: m }, (_, i) => 2 * i + 1);
  const Kff = f.map(i => f.map(j => K[i][j]));
  const out = ceros(m);
  // columnas de Kφφ⁻¹ · Kφw
  const X = w.map(j => resolver(Kff, f.map(i => K[i][j])));
  for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) {
    let s = K[w[a]][w[b]];
    for (let k = 0; k < m; k++) s -= K[w[a]][f[k]] * X[b][k];
    out[a][b] = s;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- la torre
interface Ensamble { K: Mat; partes: { p: PiezaModelo; pisos: number[]; Kp: Mat }[] }
function ensamblar(mo: ModeloTorre): Ensamble {
  const n = mo.z.length, K = ceros(3 * n);
  const partes = mo.piezas.filter(p => p.J > 0).map(p => {
    const pisos = mo.z.map((z, k) => (z <= p.zHasta + 1e-6 ? k : -1)).filter(k => k >= 0);
    const Kp = pisos.length ? rigidezMensula(pisos.map(k => mo.z[k]), mo.E * p.J, mo.timo ? mo.G * Math.max(p.Av, 1e-9) : null) : [];
    // desplazamiento de la pieza en el piso k: A → uy + pos·θ ; B → ux − pos·θ
    const t = (k: number): [number, number][] => (p.dir === 'A' ? [[3 * k + 1, 1], [3 * k + 2, p.pos]] : [[3 * k, 1], [3 * k + 2, -p.pos]]);
    pisos.forEach((ka, a) => pisos.forEach((kb, b) => t(ka).forEach(([i, ci]) => t(kb).forEach(([j, cj]) => { K[i][j] += ci * cj * Kp[a][b]; }))));
    return { p, pisos, Kp };
  });
  // una dirección sin piezas (o sin giro) haría singular la matriz: un resorte despreciable la sostiene
  const maxD = Math.max(1, ...K.map((f, i) => Math.abs(f[i])));
  K.forEach((f, i) => { if (Math.abs(f[i]) < 1e-12 * maxD) f[i] += 1e-12 * maxD; });
  return { K, partes };
}

/** desplazamientos de la torre y fuerzas de cada pieza con las cargas dadas */
export function resolverTorre(mo: ModeloTorre, c: CargasPiso): ResultadoFem {
  const { K, partes } = ensamblar(mo);
  const n = mo.z.length, F = new Array(3 * n).fill(0);
  for (let k = 0; k < n; k++) { F[3 * k] = c.Fx[k] ?? 0; F[3 * k + 1] = c.Fy[k] ?? 0; F[3 * k + 2] = c.Mz[k] ?? 0; }
  const u = resolver(K, F);
  const ux = mo.z.map((_, k) => u[3 * k]), uy = mo.z.map((_, k) => u[3 * k + 1]), rz = mo.z.map((_, k) => u[3 * k + 2]);
  const piezas = partes.map(({ p, pisos, Kp }) => {
    const d = pisos.map(k => (p.dir === 'A' ? uy[k] + p.pos * rz[k] : ux[k] - p.pos * rz[k]));
    const fz = Kp.map(fila => fila.reduce((s, kij, j) => s + kij * d[j], 0));
    const f = mo.z.map(() => 0); pisos.forEach((k, a) => { f[k] = fz[a]; });
    return { nombre: p.nombre, dir: p.dir, V: fz.reduce((s, x) => s + x, 0), M: fz.reduce((s, x, a) => s + x * mo.z[pisos[a]], 0), f };
  });
  return { ux, uy, rz, piezas };
}

// ---------------------------------------------------------------------------------------------------- modal
export interface Modo { omega: number; f: number; T: number; forma: number[]; dominante: 'x' | 'y' | 'giro'; participacion: { x: number; y: number; giro: number } }
/**
 * Análisis modal: K·φ = ω²·M·φ, con la masa de cada losa (m) y su inercia rotacional (J0 = m·(B² + L²)/12).
 * Se resuelve con Jacobi sobre M^−½·K·M^−½ (matrices chicas: 3 × pisos).
 */
export function modal(mo: ModeloTorre, masas: number[], inercias: number[]): Modo[] {
  const { K } = ensamblar(mo);
  const n = K.length, m = mo.z.flatMap((_, k) => [masas[k], masas[k], inercias[k]]);
  const s = m.map(x => 1 / Math.sqrt(Math.max(x, 1e-12)));
  const A = K.map((f, i) => f.map((v, j) => v * s[i] * s[j]));
  const V = ceros(n).map((f, i) => { f[i] = 1; return f; });
  for (let barrido = 0; barrido < 100; barrido++) {
    let fuera = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) fuera += A[p][q] ** 2;
    if (fuera < 1e-22 * A.reduce((t, f, i) => t + f[i] ** 2, 0)) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let k = 0; k < n; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - sn * b; A[k][q] = sn * a + c * b; }
      for (let k = 0; k < n; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - sn * b; A[q][k] = sn * a + c * b; }
      for (let k = 0; k < n; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - sn * b; V[k][q] = sn * a + c * b; }
    }
  }
  return Array.from({ length: n }, (_, j) => j).map(j => {
    const w2 = Math.max(A[j][j], 0), omega = Math.sqrt(w2);
    const forma = V.map((f, i) => f[j] * s[i]);
    // masa efectiva en cada dirección (participación)
    const r = (d: number) => { let num = 0, den = 0; for (let k = 0; k < mo.z.length; k++) { num += m[3 * k + d] * forma[3 * k + d]; } for (let i = 0; i < n; i++) den += m[i] * forma[i] ** 2; return den > 0 ? num ** 2 / den : 0; };
    const tot = (d: number) => mo.z.reduce((t, _, k) => t + m[3 * k + d], 0);
    const participacion = { x: r(0) / tot(0), y: r(1) / tot(1), giro: r(2) / tot(2) };
    const dominante = participacion.y >= participacion.x && participacion.y >= participacion.giro ? 'y' : participacion.x >= participacion.giro ? 'x' : 'giro';
    return { omega, f: omega / (2 * Math.PI), T: omega > 0 ? (2 * Math.PI) / omega : Infinity, forma, dominante, participacion } as Modo;
  }).sort((a, b) => a.omega - b.omega);
}
