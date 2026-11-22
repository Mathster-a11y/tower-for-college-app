/**
 * Ventana de detalle del túnel 2D: un recuadro de la planta (una esquina, un balcón) simulado con una grilla 2 o 4
 * veces más fina, anidado en el túnel grueso en un solo sentido: las orillas de la ventana toman el viento del túnel
 * grueso (interpolado en el espacio y en el tiempo) y lo fino no le devuelve nada al grueso.
 * Con la misma velocidad de red en las dos grillas (escala acústica), la celda fina es r veces más chica, el paso de
 * tiempo también, y la viscosidad de red se multiplica por r: por cada paso grueso se dan r pasos finos.
 */
import { distanciasPared, dentro, type Geometria2D, type P } from './geometria2d';
import { EX, EY, feq, Lbm2D } from './lbm2d';

/** el recuadro, en celdas del túnel grueso */
export interface Ventana { x0: number; y0: number; w: number; h: number }

export interface GeometriaDetalle {
  nx: number; ny: number; r: number; v: Ventana;
  solido: Uint8Array; q: Float32Array; contornos: P[][];
}

/** celdas finas como máximo (para que la ventana no tarde más que el túnel entero) */
export const MAX_CELDAS_DETALLE = 160_000;

/**
 * trabajo por paso grueso de la ventana (celdas finas × pasos finos = w·h·r³): con la definición automática, cuanto más
 * chico el recuadro, más fina la grilla, y el costo queda parecido (como mucho, unas dos veces el del túnel con resolución normal)
 */
export const TRABAJO_DETALLE = 160_000;
export const FINURA_MAX = 16;
/** la definición automática para un recuadro de w × h celdas gruesas */
export const finuraAuto = (w: number, h: number) => Math.max(2, Math.min(FINURA_MAX, Math.floor(Math.cbrt(TRABAJO_DETALLE / Math.max(1, w * h)))));
/** el recuadro más chico, en celdas gruesas */
export const VENTANA_MIN = 4;

/**
 * encuadra el recuadro y elige la definición: «auto» según el tamaño (más chico, más fino), o una fija; con una fija,
 * el recuadro se achica si se pasa del trabajo máximo
 */
export function encuadrar(geo: Geometria2D, v: Ventana, fino: number | 'auto'): { v: Ventana; r: number } {
  if (fino === 'auto') {
    // primero el tamaño (adentro del túnel), después la definición que le corresponde
    const v0 = ajustarVentana(geo, v, 2), r = finuraAuto(v0.w, v0.h);
    // tan grande que ni ×2 entra en el trabajo: se achica como con una definición fija
    return r === 2 && v0.w * v0.h * 8 > TRABAJO_DETALLE ? encuadrar(geo, v0, 2) : { v: v0, r };
  }
  let w = Math.max(VENTANA_MIN, v.w), hh = Math.max(VENTANA_MIN, v.h);
  const lim = Math.sqrt(TRABAJO_DETALLE / (fino ** 3 * w * hh));
  if (lim < 1) { w *= lim; hh *= lim; }
  return { v: ajustarVentana(geo, { x0: v.x0 + (v.w - w) / 2, y0: v.y0 + (v.h - hh) / 2, w, h: hh }, fino), r: fino };
}

/** ajusta el recuadro: adentro del túnel, al menos 4 × 4 celdas gruesas y sin pasarse de las celdas finas máximas */
export function ajustarVentana(geo: Geometria2D, v: Ventana, r: number): Ventana {
  let w = Math.max(VENTANA_MIN, Math.round(v.w)), hh = Math.max(VENTANA_MIN, Math.round(v.h));
  const lim = Math.sqrt(MAX_CELDAS_DETALLE / (r * r * w * hh));
  if (lim < 1) { w = Math.max(VENTANA_MIN, Math.floor(w * lim)); hh = Math.max(VENTANA_MIN, Math.floor(hh * lim)); }
  w = Math.min(w, geo.nx - 4); hh = Math.min(hh, geo.ny - 2);
  // el centro del recuadro queda donde se marcó
  const cx = v.x0 + v.w / 2, cy = v.y0 + v.h / 2;
  const x0 = Math.max(2, Math.min(geo.nx - 2 - w, Math.round(cx - w / 2))), y0 = Math.max(1, Math.min(geo.ny - 1 - hh, Math.round(cy - hh / 2)));
  return { x0, y0, w, h: hh };
}

/** la planta dentro de la ventana, en la grilla fina, con sus paredes exactas */
export function geometriaDetalle(geo: Geometria2D, v: Ventana, r: number): GeometriaDetalle {
  const nx = v.w * r, ny = v.h * r, solido = new Uint8Array(nx * ny);
  const contornos = geo.contornos.map(p => p.map(q => ({ x: (q.x - v.x0) * r, y: (q.y - v.y0) * r })));
  for (const p of contornos) {
    const bx0 = Math.max(0, Math.floor(Math.min(...p.map(q => q.x)))), bx1 = Math.min(nx - 1, Math.ceil(Math.max(...p.map(q => q.x))));
    const by0 = Math.max(0, Math.floor(Math.min(...p.map(q => q.y)))), by1 = Math.min(ny - 1, Math.ceil(Math.max(...p.map(q => q.y))));
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (dentro(p, x + 0.5, y + 0.5)) solido[y * nx + x] = 1;
  }
  return { nx, ny, r, v, solido, q: distanciasPared(nx, ny, solido, contornos, {}), contornos };
}

/** la simulación fina y cómo lee el viento del túnel grueso en sus orillas */
/** opciones de la ventana: la banda de transición (ancho en celdas finas, 0 = sin banda; y cuánto relaja en la orilla) */
export interface OpcionesDetalle { banda?: number; fuerza?: number }

/**
 * ancho de la banda de transición (celdas finas): dos celdas gruesas, entre 6 y 12 finas, sin pasar de un sexto del
 * recuadro. Cerca de la torre no relaja (ahí está lo que se quiere ver con detalle). Medido contra el túnel grueso en una esquina a Re ≈ 1 000: sin banda, la orilla tenía un escalón de
 * velocidad de 1,9 % y ΔCp de 0,13; con la banda, 0,3 % y 0,07 (test/detalle.test.ts)
 */
export const anchoBanda = (g: GeometriaDetalle) => Math.max(0, Math.min(Math.max(6, Math.min(2 * g.r, 12)), Math.floor(Math.min(g.nx, g.ny) / 6)));

/**
 * cuánto relaja cada celda de la ventana hacia el viento del túnel grueso en cada paso fino: 1 en la orilla (se
 * impone), y en la banda de transición, de «fuerza» junto a la orilla a 0 hacia adentro; nada pegado a la torre (en las
 * celdas sólidas, 0)
 */
export function sigmaBanda(g: GeometriaDetalle, banda = anchoBanda(g), fuerza = 0.3): Float32Array {
  const { nx, ny, r } = g, out = new Float32Array(nx * ny);
  // distancia (en celdas finas, hasta «lejos») de cada celda a la torre: la banda se apaga cerca de las paredes
  const lejos = Math.max(3, Math.min(r, 8)), dSol = new Uint8Array(nx * ny).fill(lejos);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!g.solido[j * nx + i]) continue;
    for (let b = -lejos; b <= lejos; b++) for (let a = -lejos; a <= lejos; a++) {
      const x = i + a, y = j + b; if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
      const q = y * nx + x, dd = Math.max(Math.abs(a), Math.abs(b)); if (dd < dSol[q]) dSol[q] = dd;
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const d = Math.min(i, j, nx - 1 - i, ny - 1 - j), c = j * nx + i;
    if (d === 0) out[c] = 1;
    else if (d < banda && !g.solido[c]) out[c] = fuerza * (1 - d / banda) ** 2 * (dSol[c] / lejos);
  }
  return out;
}

export class Detalle {
  readonly sim: Lbm2D;
  /** ancho de la banda de transición (celdas finas): ahí lo fino se relaja de a poco hacia el viento del túnel */
  readonly banda: number;
  /**
   * las celdas de la orilla y de la banda: la celda fina, cuánto se relaja (σ: 1 en la orilla, que se impone; baja a 0
   * hacia adentro) y las 4 gruesas con sus pesos (interpolación bilineal)
   */
  private celdas: Int32Array; private sigma: Float32Array; private gruesas: Int32Array; private pesos: Float32Array;
  private antes: Float32Array | null = null; private ahora: Float32Array;
  private readonly fuerza: number;
  constructor(readonly g: GeometriaDetalle, readonly nxG: number, readonly nyG: number, nu: number, u0: number, cs: number, colision: 'bgk' | 'trt', q = true, o: OpcionesDetalle = {}) {
    const { nx, ny, r, v } = g;
    this.sim = new Lbm2D({ nx, ny, nu: nu * r, u0, cs, solido: g.solido, q: q ? g.q : undefined, colision, marco: true, perturbacion: 0 });
    this.banda = o.banda ?? anchoBanda(g);
    this.fuerza = o.fuerza ?? 0.3;
    const sb = sigmaBanda(g, this.banda, this.fuerza), cel: number[] = [], sig: number[] = [];
    for (let c = 0; c < nx * ny; c++) if (sb[c] > 1e-4) { cel.push(c); sig.push(sb[c]); }
    this.celdas = Int32Array.from(cel); this.sigma = Float32Array.from(sig);
    this.gruesas = new Int32Array(4 * cel.length); this.pesos = new Float32Array(4 * cel.length);
    cel.forEach((c, k) => {
      const i = c % nx, j = (c - i) / nx;
      const X = Math.max(0, Math.min(nxG - 1.001, v.x0 + (i + 0.5) / r - 0.5)), Y = Math.max(0, Math.min(nyG - 1.001, v.y0 + (j + 0.5) / r - 0.5));
      const a = Math.floor(X), b = Math.floor(Y), fx = X - a, fy = Y - b, c0 = b * nxG + a;
      this.gruesas.set([c0, c0 + 1, c0 + nxG, c0 + nxG + 1], 4 * k);
      this.pesos.set([(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy], 4 * k);
    });
    this.ahora = new Float32Array(3 * cel.length);
  }
  /** arranca la ventana con el viento que ya tiene el túnel grueso (sin esto, tarda en olvidarse del arranque) */
  arrancarDesde(gr: { rho: ArrayLike<number>; ux: ArrayLike<number>; uy: ArrayLike<number>; solido: Uint8Array }) {
    const { nx, ny, r, v } = this.g, s = this.sim, N = s.N;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      if (s.solido[c]) continue;
      const X = Math.max(0, Math.min(this.nxG - 1.001, v.x0 + (i + 0.5) / r - 0.5)), Y = Math.max(0, Math.min(this.nyG - 1.001, v.y0 + (j + 0.5) / r - 0.5));
      const a = Math.floor(X), b = Math.floor(Y), fx = X - a, fy = Y - b, c0 = b * this.nxG + a;
      let rr = 0, u = 0, w = 0, p = 0;
      ([[c0, (1 - fx) * (1 - fy)], [c0 + 1, fx * (1 - fy)], [c0 + this.nxG, (1 - fx) * fy], [c0 + this.nxG + 1, fx * fy]] as const).forEach(([q, pe]) => {
        if (gr.solido[q] || pe === 0) return; rr += pe * gr.rho[q]; u += pe * gr.ux[q]; w += pe * gr.uy[q]; p += pe;
      });
      if (!p) continue;
      rr /= p; u /= p; w /= p;
      s.rho[c] = rr; s.ux[c] = u; s.uy[c] = w;
      for (let k = 0; k < 9; k++) s.f[k * N + c] = feq(k, rr, u, w);
    }
  }
  /** el viento del túnel grueso en las celdas de la orilla y la banda (ρ, u, v); los sólidos gruesos no cuentan */
  private leer(gr: { rho: ArrayLike<number>; ux: ArrayLike<number>; uy: ArrayLike<number>; solido: Uint8Array }, out: Float32Array) {
    const n = this.celdas.length;
    for (let k = 0; k < n; k++) {
      let r = 0, u = 0, w = 0, p = 0;
      for (let m = 0; m < 4; m++) {
        const c = this.gruesas[4 * k + m], pe = this.pesos[4 * k + m];
        if (gr.solido[c] || pe === 0) continue;
        r += pe * gr.rho[c]; u += pe * gr.ux[c]; w += pe * gr.uy[c]; p += pe;
      }
      out[3 * k] = p ? r / p : 1; out[3 * k + 1] = p ? u / p : 0; out[3 * k + 2] = p ? w / p : 0;
    }
  }
  /**
   * después de cada paso grueso: r pasos finos, con el viento del túnel grueso interpolado en el tiempo entre el paso
   * anterior y este (la ventana va de uno al otro). En la orilla se impone; en la banda, cada paso fino acerca un poco (σ) el equilibrio de lo fino al del
   * túnel: absorbe las ondas que rebotarían en la orilla y suaviza el escalón entre las dos grillas.
   */
  avanzar(gr: { rho: ArrayLike<number>; ux: ArrayLike<number>; uy: ArrayLike<number>; solido: Uint8Array }) {
    if (this.sim.roto) return;
    if (!this.antes) { this.antes = new Float32Array(this.ahora.length); this.leer(gr, this.antes); }
    else this.antes.set(this.ahora);
    this.leer(gr, this.ahora);
    const sim = this.sim, b = sim.borde!, n = this.celdas.length, r = this.g.r, N = sim.N, A = this.antes, H = this.ahora;
    for (let s = 1; s <= r; s++) {
      const t = s / r;
      for (let k = 0; k < n; k++) {
        if (this.sigma[k] < 1) continue;
        const c = this.celdas[k];
        b.rho[c] = A[3 * k] + (H[3 * k] - A[3 * k]) * t;
        b.ux[c] = A[3 * k + 1] + (H[3 * k + 1] - A[3 * k + 1]) * t;
        b.uy[c] = A[3 * k + 2] + (H[3 * k + 2] - A[3 * k + 2]) * t;
      }
      sim.paso();
      if (this.banda <= 1) continue;
      const f = sim.f;
      for (let k = 0; k < n; k++) {
        const sg = this.sigma[k];
        if (sg >= 1) continue;
        const c = this.celdas[k];
        const rc = A[3 * k] + (H[3 * k] - A[3 * k]) * t, uc = A[3 * k + 1] + (H[3 * k + 1] - A[3 * k + 1]) * t, vc = A[3 * k + 2] + (H[3 * k + 2] - A[3 * k + 2]) * t;
        let rf = 0, jx = 0, jy = 0;
        for (let i = 0; i < 9; i++) { const q = f[i * N + c]; rf += q; jx += EX[i] * q; jy += EY[i] * q; }
        const uf = jx / rf, vf = jy / rf;
        for (let i = 0; i < 9; i++) f[i * N + c] += sg * (feq(i, rc, uc, vc) - feq(i, rf, uf, vf));
      }
    }
  }
}
