/**
 * Contraste del motor de elementos finitos de la app con otros programas (Pynite, OpenSees): la misma torre (la entrada
 * de femEntrada.ts, con el viento de la planilla) resuelta con el motor pseudo-3D de la app, con ménsulas de Euler y
 * de Timoshenko. Lo usan las pruebas de oro (test/motorFem.test.ts) y el archivo «Contraste con Pynite» que baja la app.
 */
import { entradaFem, type EntradaFem } from './femEntrada';
import { resolverTorre, type ModeloTorre } from './fem/pseudo3d';
import type { Proyecto } from './modelo';

/** el modelo del motor de la app con los datos de una entrada: piezas del viento y perpendiculares (Av = 1, como OpenSees) */
export function modeloDeEntrada(e: EntradaFem, timo: boolean): ModeloTorre {
  const zTop = Math.max(...e.niveles.map(n => n.z));
  return {
    z: e.niveles.filter(n => n.z > 0).map(n => n.z).sort((a, b) => a - b), E: e.E, G: e.G, timo,
    piezas: [...e.piezas.map(p => ({ nombre: p.nombre, dir: 'A' as const, pos: p.x, J: p.J, Av: p.Av, zHasta: p.zHasta })),
      ...e.perp.map(p => ({ nombre: p.nombre, dir: 'B' as const, pos: p.y, J: p.J, Av: 1, zHasta: zTop }))],
  };
}
/** el viento de cada piso de la entrada, en el centro de la losa */
export function cargasDeEntrada(e: EntradaFem, mo: ModeloTorre) {
  const W = mo.z.map(z => e.niveles.find(n => Math.abs(n.z - z) < 1e-9)?.W ?? 0);
  return { Fx: W.map(() => 0), Fy: W, Mz: W.map(() => 0) };
}

export interface ResultadoContraste {
  motor: string;
  /** corte en la base de cada pieza (t) */
  corte: Record<string, number>;
  /** corrimiento de cada piso en el sentido del viento (m), de PB a la azotea, y su cota */
  uy: number[]; z: number[];
}
/** la entrada resuelta con el motor de la app, Euler y Timoshenko */
export function resolverConLaApp(e: EntradaFem): ResultadoContraste[] {
  return ([['App · Euler', false], ['App · Timoshenko', true]] as const).map(([motor, timo]) => {
    const mo = modeloDeEntrada(e, timo), r = resolverTorre(mo, cargasDeEntrada(e, mo));
    return { motor, corte: Object.fromEntries(e.piezas.map(p => [p.nombre, r.piezas.find(x => x.nombre === p.nombre)?.V ?? 0])), uy: [0, ...r.uy], z: [0, ...mo.z] };
  });
}

/** lo que lleva el archivo de contraste: por viento, la entrada y los resultados de la app (planilla y motor FEM) */
export function datosContraste(p: Proyecto): { proyecto: string; vientos: { entrada: EntradaFem; app: ResultadoContraste[] }[] } {
  const vientos = (['A', 'B'] as const).map(d => { const entrada = entradaFem(p, d, `${p.nombre ?? 'proyecto'} · viento ${d}`); return { entrada, app: resolverConLaApp(entrada) }; })
    .filter(v => v.entrada.piezas.length && v.entrada.niveles.some(n => n.W > 0));
  return { proyecto: p.nombre ?? 'proyecto', vientos };
}
