/**
 * El 3D (three.js) se carga aparte, después de la primera pantalla: la app se ve antes y el 3D aparece enseguida.
 */
import type { Opciones3D } from './vista3d';

export function montar3D(cont: HTMLElement, op: Opciones3D) {
  void import('./vista3d').then(m => { if (cont.isConnected || cont.id === 'vista-3d') m.montar3D(cont, op); });
}
