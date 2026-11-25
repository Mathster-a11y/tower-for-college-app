/**
 * Grabación de una corrida del túnel 2D (propuesta 4 del diagnóstico de viento): los cuadros de la simulación
 * (velocidad y densidad, en 8 bits y, si la grilla es grande, a la mitad de resolución) y las fuerzas de cada paso, en
 * un archivo .torreviento (un ZIP). La app lo vuelve a abrir y lo reproduce sin simular: una computadora calcula y
 * cualquiera mira.
 */
import type JSZip from 'jszip';

export const VERSION_GRABACION = 1;

export interface MetaGrabacion {
  version: number;
  /** qué se grabó (para el rótulo) */
  titulo: string; nivel: string; cota: number; dir: 'A' | 'B';
  config: Record<string, string | number | boolean>;
  /** grilla grabada (puede ser más chica que la simulada) y cuánto se achicó */
  nx: number; ny: number; factor: number;
  /** de la geometría simulada (en celdas de la grilla grabada) */
  D: number; anchoM: number; escala: number; contornos: { x: number; y: number }[][];
  /** cuántos contornos son de la torre (los demás, vecinos del contexto urbano) */
  nTorre?: number;
  caja: { x0: number; x1: number; y0: number; y1: number };
  u0: number;
  /** cuadros: cantidad y el paso de la simulación de cada uno */
  cuadros: number; pasos: number[];
  /** escalas de la cuantización: u = b / 127 · escU; ρ = 1 + b / 127 · escR; el giro del aire, normalizado por 3·u0/D,
   * es b / 127 · 1,5 (se graba ya calculado y suavizado: derivarlo de velocidades de 8 bits haría ruido) */
  escU: number; escR: number;
  /** mediciones al cerrar */
  med?: { Cd: number; ClRms: number; St: number | null } | null;
}

/** la grilla de la simulación achicada «f» veces (promedio de cada bloque; sólido si cualquiera lo es) */
export function achicar(nx: number, ny: number, f: number, campo: ArrayLike<number>, solido?: Uint8Array, vacio = 0): Float32Array {
  const mx = Math.floor(nx / f), my = Math.floor(ny / f), out = new Float32Array(mx * my);
  for (let y = 0; y < my; y++) for (let x = 0; x < mx; x++) {
    let s = 0, n = 0;
    for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) { const c = (y * f + j) * nx + x * f + i; if (!solido || !solido[c]) { s += campo[c]; n++; } }
    out[y * mx + x] = n ? s / n : vacio;
  }
  return out;
}
export function achicarSolido(nx: number, ny: number, f: number, solido: Uint8Array): Uint8Array {
  const mx = Math.floor(nx / f), my = Math.floor(ny / f), out = new Uint8Array(mx * my);
  for (let y = 0; y < my; y++) for (let x = 0; x < mx; x++) {
    let n = 0;
    for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) n += solido[(y * f + j) * nx + x * f + i];
    out[y * mx + x] = n * 2 >= f * f ? 1 : 0;                         // sólido si es la mitad o más del bloque
  }
  return out;
}

/** cuantiza un campo a 8 bits con signo */
export function cuantizar(v: ArrayLike<number>, centro: number, escala: number, out: Int8Array, desde = 0) {
  for (let k = 0; k < v.length; k++) out[desde + k] = Math.max(-127, Math.min(127, Math.round(((v[k] - centro) / escala) * 127)));
}
export function decuantizar(b: Int8Array, desde: number, n: number, centro: number, escala: number, out: Float32Array) {
  for (let k = 0; k < n; k++) out[k] = centro + (b[desde + k] / 127) * escala;
}

/** la grabación en memoria, mientras se graba */
export class Grabadora {
  readonly cuadros: Int8Array[] = []; readonly pasos: number[] = [];
  Fx: number[] = []; Fy: number[] = [];
  readonly solidoChico: Uint8Array; readonly mx: number; readonly my: number;
  /** guarda uno de cada «cada» cuadros que llegan (sube si se pasa del máximo) */
  private cada = 1; private vistos = 0;
  /** escV: la escala del giro del aire (3·u0/D de la grilla simulada) */
  constructor(readonly nx: number, readonly ny: number, readonly solido: Uint8Array, readonly factor: number, readonly escU: number, readonly escR: number, readonly maxCuadros = 360, readonly escV = 1) {
    this.solidoChico = achicarSolido(nx, ny, factor, solido);
    this.mx = Math.floor(nx / factor); this.my = Math.floor(ny / factor);
  }
  agregar(paso: number, ux: ArrayLike<number>, uy: ArrayLike<number>, rho: ArrayLike<number>, Fx: ArrayLike<number>, Fy: ArrayLike<number>) {
    for (let k = 0; k < Fx.length; k++) { this.Fx.push(Fx[k]); this.Fy.push(Fy[k]); }
    if (this.vistos++ % this.cada) return;
    const n = this.mx * this.my, b = new Int8Array(4 * n);
    const f = this.factor, a = (v: ArrayLike<number>, vacio: number) => (f > 1 ? achicar(this.nx, this.ny, f, v, this.solido, vacio) : v);
    cuantizar(a(ux, 0), 0, this.escU, b, 0); cuantizar(a(uy, 0), 0, this.escU, b, n); cuantizar(a(rho, 1), 1, this.escR, b, 2 * n);
    cuantizar(a(giroNormalizado(this.nx, this.ny, ux, uy, this.solido, this.escV), 0), 0, 1.5, b, 3 * n);
    this.cuadros.push(b); this.pasos.push(paso);
    // si se pasa del máximo, se queda con uno de cada dos (y desde ahora guarda la mitad)
    if (this.cuadros.length > this.maxCuadros) {
      const quedan = this.cuadros.filter((_, i) => i % 2 === 0), pasos = this.pasos.filter((_, i) => i % 2 === 0);
      this.cuadros.splice(0, this.cuadros.length, ...quedan); this.pasos.splice(0, this.pasos.length, ...pasos);
      this.cada *= 2;
    }
  }
  bytes(): number { return this.cuadros.reduce((s, c) => s + c.length, 0) + 8 * this.Fx.length; }
}

/** arma el archivo .torreviento (ZIP) */
export async function empaquetar(Z: typeof JSZip, g: Grabadora, meta: Omit<MetaGrabacion, 'version' | 'nx' | 'ny' | 'cuadros' | 'pasos' | 'escU' | 'escR' | 'factor'>): Promise<Blob> {
  const zip = new Z();
  const m: MetaGrabacion = { ...meta, version: VERSION_GRABACION, nx: g.mx, ny: g.my, factor: g.factor, cuadros: g.cuadros.length, pasos: g.pasos, escU: g.escU, escR: g.escR };
  zip.file('meta.json', JSON.stringify(m));
  zip.file('solido.bin', g.solidoChico);
  const todo = new Int8Array(g.cuadros.reduce((s, c) => s + c.length, 0));
  let o = 0; g.cuadros.forEach(c => { todo.set(c, o); o += c.length; });
  zip.file('cuadros.bin', new Uint8Array(todo.buffer));
  zip.file('fuerzas.bin', new Uint8Array(Float32Array.from([...g.Fx, ...g.Fy]).buffer));
  zip.file('LEAME.txt', 'Grabación del túnel de viento 2D de Torre 3D. Se abre con la app: Viento → Túnel 2D → «Abrir grabación…».\n');
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export interface GrabacionAbierta { meta: MetaGrabacion; solido: Uint8Array; cuadros: Int8Array; Fx: Float32Array; Fy: Float32Array }

/** abre un .torreviento; rechaza lo que no sea una grabación válida */
export async function abrirGrabacion(Z: typeof JSZip, datos: ArrayBuffer | Blob): Promise<GrabacionAbierta> {
  const zip = await Z.loadAsync(datos);
  const mf = zip.file('meta.json'), sf = zip.file('solido.bin'), cf = zip.file('cuadros.bin'), ff = zip.file('fuerzas.bin');
  if (!mf || !sf || !cf || !ff) throw new Error('El archivo no es una grabación del túnel de viento.');
  const meta = JSON.parse(await mf.async('string')) as MetaGrabacion;
  const n = meta.nx * meta.ny;
  if (meta.version !== VERSION_GRABACION || !(n > 0) || !(meta.cuadros > 0) || !Array.isArray(meta.pasos)) throw new Error('La grabación es de otra versión o está dañada.');
  const solido = await sf.async('uint8array'), cu = await cf.async('uint8array'), fu = await ff.async('uint8array');
  if (solido.length !== n || cu.length !== 4 * n * meta.cuadros) throw new Error('La grabación está incompleta.');
  const f32 = new Float32Array(fu.buffer.slice(fu.byteOffset, fu.byteOffset + fu.byteLength)), mitad = f32.length / 2;
  return { meta, solido, cuadros: new Int8Array(cu.buffer, cu.byteOffset, cu.byteLength), Fx: f32.subarray(0, mitad), Fy: f32.subarray(mitad) };
}

/** un cuadro de la grabación como campos (ux, uy, ρ) */
export function cuadroDe(g: GrabacionAbierta, k: number): { ux: Float32Array; uy: Float32Array; rho: Float32Array; wn: Float32Array } {
  const n = g.meta.nx * g.meta.ny, ux = new Float32Array(n), uy = new Float32Array(n), rho = new Float32Array(n), wn = new Float32Array(n);
  const o = 4 * n * Math.max(0, Math.min(g.meta.cuadros - 1, k));
  decuantizar(g.cuadros, o, n, 0, g.meta.escU, ux); decuantizar(g.cuadros, o + n, n, 0, g.meta.escU, uy); decuantizar(g.cuadros, o + 2 * n, n, 1, g.meta.escR, rho);
  decuantizar(g.cuadros, o + 3 * n, n, 0, 1.5, wn);
  return { ux, uy, rho, wn };
}

/** el giro del aire ∂v/∂x − ∂u/∂y, suavizado en 3 × 3 celdas y dividido por la escala de color (3·u0/D) */
export function giroNormalizado(nx: number, ny: number, ux: ArrayLike<number>, uy: ArrayLike<number>, solido: Uint8Array, escV: number): Float32Array {
  const w = new Float32Array(nx * ny), out = new Float32Array(nx * ny);
  for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) { const q = y * nx + x; if (!solido[q]) w[q] = (uy[q + 1] - uy[q - 1]) * 0.5 - (ux[q + nx] - ux[q - nx]) * 0.5; }
  for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const q = y * nx + x;
    out[q] = (w[q - nx - 1] + w[q - nx] + w[q - nx + 1] + w[q - 1] + w[q] + w[q + 1] + w[q + nx - 1] + w[q + nx] + w[q + nx + 1]) / 9 / escV;
  }
  return out;
}
