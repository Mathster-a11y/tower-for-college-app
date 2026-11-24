/**
 * El D3Q19 del procesador en WebAssembly (wasm/lbm3d.c): el mismo paso que Lbm3D (lbm3d.ts), unas 4 a 6 veces más
 * rápido que en JavaScript. Misma interfaz que usa el worker (paso, macro, f, pasos). Si el navegador no tiene
 * WebAssembly, el worker sigue con Lbm3D.
 */
import { EX3, EY3, EZ3, inicial3, OMEGA_MENOS_MIN, origen3, type OpcionesLbm3 } from './lbm3d';
import { LBM3D_WASM } from './wasm/lbm3dWasm.b64';

interface Exportes { memory: WebAssembly.Memory; base(): number; configurar(...a: number[]): void; actual(): number; pasos(n: number): void }

let modulo: WebAssembly.Module | null = null;
function compilado(): WebAssembly.Module {
  if (!modulo) { const b = atob(LBM3D_WASM), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); modulo = new WebAssembly.Module(u); }
  return modulo;
}
export const hayWasm = () => { try { compilado(); return true; } catch { return false; } };

export class Lbm3DWasm {
  readonly nx: number; readonly ny: number; readonly nz: number; readonly N: number; readonly solido: Uint8Array;
  pasos = 0;
  private x: Exportes;
  constructor(o: OpcionesLbm3) {
    this.nx = o.nx; this.ny = o.ny; this.nz = o.nz; this.N = o.nx * o.ny * o.nz; this.solido = o.solido;
    this.x = new WebAssembly.Instance(compilado(), {}).exports as unknown as Exportes;
    const N = this.N, nPar = o.paredes ? o.paredes.celdas.length : 0;
    // la memoria: f, g (19 N float), origen (19 N int), fila (N int), uIn, sólido, q de las paredes; alineado a 8
    let p = (this.x.base() + 7) & ~7;
    const reservar = (bytes: number) => { const a = p; p = (p + bytes + 7) & ~7; return a; };
    const pf = reservar(76 * N), pg = reservar(76 * N), po = reservar(76 * N), pfila = nPar ? reservar(4 * N) : 0;
    const pu = reservar(4 * o.nz), ps = reservar(N), pq = nPar ? reservar(19 * nPar) : 0;
    const falta = p - this.x.memory.buffer.byteLength;
    if (falta > 0) this.x.memory.grow(Math.ceil(falta / 65536));
    const b = this.x.memory.buffer;
    const f = new Float32Array(b, pf, 19 * N);
    inicial3(f, o.nx, o.ny, o.nz, o.uIn, o.solido);
    new Float32Array(b, pg, 19 * N).set(f);
    new Int32Array(b, po, 19 * N).set(origen3(o.nx, o.ny, o.nz, o.solido));
    new Float32Array(b, pu, o.nz).set(o.uIn);
    new Uint8Array(b, ps, N).set(o.solido);
    if (nPar) { const fl = new Int32Array(b, pfila, N).fill(-1); o.paredes!.celdas.forEach((c, k) => { fl[c] = k; }); new Uint8Array(b, pq, 19 * nPar).set(o.paredes!.q); }
    this.x.configurar(o.nx, o.ny, o.nz, 3 * o.nu + 0.5, (o.cs ?? 0) ** 2, o.colision === 'trt' ? 1 : 0, o.omegaMenosMin ?? OMEGA_MENOS_MIN, (o.paredesLineales ?? true) ? 1 : 0,
      pf, pg, ps, po, pu, pfila, pq);
  }
  /** las poblaciones actuales (una vista sobre la memoria del módulo) */
  get f(): Float32Array { return new Float32Array(this.x.memory.buffer, this.x.actual(), 19 * this.N); }
  paso() { this.x.pasos(1); this.pasos++; }
  avanzar(n: number) { this.x.pasos(n); this.pasos += n; }
  macro(c: number): { r: number; u: number; v: number; w: number } {
    const f = this.f, N = this.N;
    let r = 0, jx = 0, jy = 0, jz = 0;
    for (let i = 0; i < 19; i++) { const q = f[i * N + c]; r += q; jx += q * EX3[i]; jy += q * EY3[i]; jz += q * EZ3[i]; }
    return { r, u: jx / r, v: jy / r, w: jz / r };
  }
}
