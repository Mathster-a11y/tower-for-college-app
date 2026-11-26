/**
 * Túnel piso por piso: cada planta se simula en su propio worker, sin dibujar, hasta las pasadas pedidas. Avisa el
 * avance y, al final, las mediciones (Cd, Cl eficaz, Strouhal) de la parte estable de la corrida.
 */
import { Lbm2D } from './lbm2d';
import { medir, type Mediciones } from './mediciones';

export interface PedidoMedicion {
  nx: number; ny: number; solido: Uint8Array; nu: number; u0: number; cs: number; D: number;
  q?: Float32Array; colision?: 'bgk' | 'trt';
  /** con contexto urbano: las celdas de la torre (la fuerza se mide solo sobre ella) */
  cuerpo?: Uint8Array;
  /** zonas de amortiguación junto a la entrada y la salida (las mismas del túnel que se ve) */
  esponja?: { entrada: number; salida: number };
  /** pasos totales y desde cuál se mide (se descarta el arranque) */
  pasos: number; desde: number;
}
export type RespuestaMedicion =
  | { tipo: 'avance'; hechos: number; pasos: number }
  | { tipo: 'fin'; med: Mediciones; roto: boolean };

self.onmessage = (e: MessageEvent<PedidoMedicion>) => {
  const o = e.data;
  const sim = new Lbm2D({ nx: o.nx, ny: o.ny, nu: o.nu, u0: o.u0, cs: o.cs, solido: o.solido, q: o.q, colision: o.colision, cuerpo: o.cuerpo, esponja: o.esponja });
  const Fx: number[] = [], Fy: number[] = [];
  let ultimo = 0;
  for (let k = 0; k < o.pasos && !sim.roto; k++) {
    sim.paso();
    if (k >= o.desde) { Fx.push(sim.Fx); Fy.push(sim.Fy); }
    if (k - ultimo >= 500) { ultimo = k; (self as unknown as Worker).postMessage({ tipo: 'avance', hechos: k, pasos: o.pasos } satisfies RespuestaMedicion); }
  }
  (self as unknown as Worker).postMessage({ tipo: 'fin', med: medir(Fx, Fy, o.u0, o.D), roto: sim.roto } satisfies RespuestaMedicion);
};
