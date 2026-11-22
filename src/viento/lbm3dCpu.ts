/**
 * El túnel 3D con el procesador (sin WebGPU): la misma interfaz que lbm3dGpu, con el D3Q19 de referencia en un worker.
 * Da lo mismo que la placa (las pruebas comparan las dos), pero unas 20 a 100 veces más lento.
 */
import type { OpcionesLbm3 } from './lbm3d';
import type { Lbm3dGpu } from './lbm3dGpu';
import type { Mensaje3d, Respuesta3d } from './lbm3d.worker';
import Lbm3dWorker from './lbm3d.worker?worker&inline';

export function crearLbm3dCpu(o: OpcionesLbm3): Lbm3dGpu {
  const w = new Lbm3dWorker();
  const esperando = new Map<number, (r: Respuesta3d) => void>();
  let id = 0, pasos = 0, pendiente: Promise<void> = Promise.resolve();
  w.onmessage = (e: MessageEvent<Respuesta3d>) => { const r = e.data; if (r.tipo === 'hecho') pasos = r.pasos; esperando.get(r.id)?.(r); esperando.delete(r.id); };
  const pedir = (m: Mensaje3d) => new Promise<Respuesta3d>(res => { esperando.set((m as { id: number }).id, res); w.postMessage(m); });
  w.postMessage({ tipo: 'iniciar', o } satisfies Mensaje3d);
  const N = o.nx * o.ny * o.nz;
  return {
    nx: o.nx, ny: o.ny, nz: o.nz, N,
    get pasos() { return pasos; },
    avanzar(n: number) { pendiente = pedir({ tipo: 'avanzar', n, id: ++id }).then(() => undefined); },
    esperar: () => pendiente,
    leer: () => Promise.reject(new Error('El túnel con el procesador no expone las poblaciones.')),
    async corte(z: number) {
      const c = await this.campo(), out = new Float32Array(4 * o.nx * o.ny), zz = Math.max(0, Math.min(o.nz - 1, Math.round(z)));
      out.set(c.subarray(4 * zz * o.nx * o.ny, 4 * (zz + 1) * o.nx * o.ny));
      return out;
    },
    async campo() { const r = await pedir({ tipo: 'campo', id: ++id }); return (r as Extract<Respuesta3d, { tipo: 'campo' }>).datos; },
    mlups: 0,
    destruir() { w.terminate(); esperando.clear(); },
    adaptador: 'procesador',
  };
}
