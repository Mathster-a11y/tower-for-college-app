/**
 * Túnel de viento 2D: la simulación corre en este worker para no trabar la página. Calcula sin parar mientras corre;
 * cuando la página avisa que terminó de dibujar («listo»), le manda el cuadro siguiente: los campos (velocidad y
 * densidad) y las fuerzas de cada paso desde el cuadro anterior.
 */
import { Lbm2D } from './lbm2d';

export type MensajeTunel =
  | { tipo: 'iniciar'; nx: number; ny: number; solido: Uint8Array; nu: number; u0: number; cs: number; q?: Float32Array; colision?: 'bgk' | 'trt' }
  | { tipo: 'correr'; si: boolean }
  | { tipo: 'listo' };

export interface CuadroTunel {
  tipo: 'cuadro'; pasos: number; hechos: number; roto: boolean;
  ux: Float32Array; uy: Float32Array; rho: Float32Array; Fx: Float32Array; Fy: Float32Array;
  /** el giro del aire ya calculado (solo en las reproducciones de una grabación) */
  w?: Float32Array;
}

let sim: Lbm2D | null = null, corriendo = false, listo = true, ultimo = 0;
let Fx: number[] = [], Fy: number[] = [];
const canal = new MessageChannel();
canal.port1.onmessage = () => ciclo();
const seguir = () => canal.port2.postMessage(0);

function mandar() {
  if (!sim) return;
  const r: CuadroTunel = { tipo: 'cuadro', pasos: sim.pasos, hechos: Fx.length, roto: sim.roto,
    ux: sim.ux.slice(), uy: sim.uy.slice(), rho: sim.rho.slice(), Fx: Float32Array.from(Fx), Fy: Float32Array.from(Fy) };
  Fx = []; Fy = []; listo = false; ultimo = performance.now();
  (self as unknown as Worker).postMessage(r, [r.ux.buffer, r.uy.buffer, r.rho.buffer, r.Fx.buffer, r.Fy.buffer]);
}

function ciclo() {
  if (!sim || !corriendo) return;
  const t0 = performance.now();
  while (!sim.roto && performance.now() - t0 < 10) { sim.paso(); Fx.push(sim.Fx); Fy.push(sim.Fy); }
  if (listo && performance.now() - ultimo > 30) mandar();
  if (sim.roto) { corriendo = false; if (listo) mandar(); return; }
  seguir();
}

self.onmessage = (e: MessageEvent<MensajeTunel>) => {
  const m = e.data;
  if (m.tipo === 'iniciar') { sim = new Lbm2D({ nx: m.nx, ny: m.ny, nu: m.nu, u0: m.u0, cs: m.cs, solido: m.solido, q: m.q, colision: m.colision }); Fx = []; Fy = []; listo = true; corriendo = true; seguir(); }
  else if (m.tipo === 'correr') { const antes = corriendo; corriendo = m.si; if (corriendo && !antes) seguir(); }
  else if (m.tipo === 'listo') { listo = true; if (!corriendo && Fx.length) mandar(); }
};
