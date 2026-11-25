/**
 * Lo que hace el worker del cálculo (calculo.worker.ts), aparte para poder probarlo sin navegador: el cálculo del
 * proyecto y, como la interfaz cuando calcula en el momento, los controles del exoesqueleto. El resultado es solo
 * datos (se copia entre hilos) y trae lo que ya calculó del exo, para que la interfaz no lo repita.
 */
import { calcularProyecto, type Calculo } from './calculoProyecto';
import { ExoDeCalculo } from './exoDeCalculo';
import type { Proyecto } from './modelo';

export interface PedidoCalculo { revision: number; proyecto: string }
export type RespuestaCalculo = { revision: number; calculo: Calculo } | { revision: number; error: string };

export function calcularPedido({ revision, proyecto }: PedidoCalculo): RespuestaCalculo {
  try {
    const p = JSON.parse(proyecto) as Proyecto;
    const c: Calculo = { ...calcularProyecto(p), revision };
    // los controles del exoesqueleto (los mismos que suma la interfaz cuando calcula en el momento) y sus barras
    const exo = new ExoDeCalculo(p, c, c.config.metodo);
    const extra = exo.controles();
    if (extra.length) c.controles = [...c.controles, ...extra];
    c.exoHecho = exo.semilla();
    return { revision, calculo: c };
  } catch (err) { return { revision, error: err instanceof Error ? err.message : String(err) }; }
}
