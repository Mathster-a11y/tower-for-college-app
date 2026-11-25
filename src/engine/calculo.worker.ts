/**
 * El cálculo del proyecto en segundo plano: recibe el proyecto (como texto) y devuelve el cálculo entero, o el error.
 * Así la interfaz no se congela mientras calcula una torre grande. Lo que hace está en calculoEnFondo.ts.
 */
import { calcularPedido, type PedidoCalculo, type RespuestaCalculo } from './calculoEnFondo';

export type { PedidoCalculo, RespuestaCalculo };
self.onmessage = (e: MessageEvent<PedidoCalculo>) => {
  (self as unknown as Worker).postMessage(calcularPedido(e.data) satisfies RespuestaCalculo);
};
