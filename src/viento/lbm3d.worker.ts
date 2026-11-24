/**
 * Túnel 3D sin placa de video: el mismo D3Q19 (lbm3d.ts, la referencia de la placa) corriendo en el procesador, en este
 * worker para no trabar la página, en WebAssembly (wasm/lbm3d.c) si se puede. Más lento: se usa con la grilla gruesa.
 */
import { Lbm3D, type OpcionesLbm3 } from './lbm3d';
import { hayWasm, Lbm3DWasm } from './lbm3dWasm';

export type Mensaje3d =
  | { tipo: 'iniciar'; o: OpcionesLbm3 }
  | { tipo: 'avanzar'; n: number; id: number }
  | { tipo: 'campo'; id: number };
export type Respuesta3d = { tipo: 'hecho'; id: number; pasos: number } | { tipo: 'campo'; id: number; datos: Float32Array };

// WebAssembly si el navegador lo tiene (unas 2 veces más rápido); si no, el de JavaScript
let sim: Lbm3D | Lbm3DWasm | null = null;
self.onmessage = (e: MessageEvent<Mensaje3d>) => {
  const m = e.data, yo = self as unknown as Worker;
  if (m.tipo === 'iniciar') { sim = hayWasm() ? new Lbm3DWasm(m.o) : new Lbm3D(m.o); return; }
  if (!sim) return;
  if (m.tipo === 'avanzar') {
    if (sim instanceof Lbm3DWasm) sim.avanzar(m.n); else for (let k = 0; k < m.n; k++) sim.paso();
    yo.postMessage({ tipo: 'hecho', id: m.id, pasos: sim.pasos } satisfies Respuesta3d);
  } else {
    const N = sim.N, out = new Float32Array(4 * N);
    for (let c = 0; c < N; c++) {
      if (sim.solido[c]) continue;
      const q = sim.macro(c);
      out[4 * c] = q.u; out[4 * c + 1] = q.v; out[4 * c + 2] = q.w; out[4 * c + 3] = q.r;
    }
    yo.postMessage({ tipo: 'campo', id: m.id, datos: out } satisfies Respuesta3d, [out.buffer]);
  }
};
