/**
 * «¿Qué pasa si…?»: el mismo proyecto con un muro cambiado (largo, espesor o posición), calculado con el mismo
 * método, y lo que cambia: la rigidez del viento, la parte que toma su pieza, el eje de rigidez, el desplazamiento de
 * la azotea, la verificación de su pieza y cuántos controles no verifican. No toca el proyecto: trabaja sobre una copia.
 */
import type { Calculo } from '../ui/estado';
import { tipoDe, type Proyecto } from './modelo';
import { configDe } from './metodos/tipos';
import type { Estado } from './verificaciones';

export interface CambioMuro { largo?: number; espesor?: number; dx?: number; dy?: number }

/** una copia del proyecto con el muro cambiado (las demás cosas, iguales) */
export function aplicarCambio(p: Proyecto, id: string, k: CambioMuro): Proyecto {
  const q = JSON.parse(JSON.stringify(p)) as Proyecto;
  const m = q.muros.find(x => x.id === id);
  if (!m) return q;
  if (k.largo !== undefined && k.largo > 0) m.largo = +k.largo.toFixed(4);
  if (k.espesor !== undefined && k.espesor > 0) m.espesor = +k.espesor.toFixed(4);
  if (k.dx) m.x = +(m.x + k.dx).toFixed(4);
  if (k.dy) m.y = +(m.y + k.dy).toFixed(4);
  return q;
}

/** ¿se le pueden cambiar largo y espesor? (los perfiles irregulares se editan con su forma) */
export const muroAjustable = (p: Proyecto, id: string) => { const m = p.muros.find(x => x.id === id); return !!m && tipoDe(m) !== 'perfil'; };

export interface Medida {
  nombre: string; unidad: string; decimales: number;
  antes: number | null; ahora: number | null;
  estadoAntes?: Estado | null; estadoAhora?: Estado | null;
  /** qué es mejor: que suba, que baje (en valor absoluto) o ninguna de las dos */
  mejor: 'sube' | 'baja' | null;
  nota?: string;
}

/** las medidas antes y después, para el viento en el que trabaja el muro (Y: viento A; X: viento B) */
export function medirEscenario(p: Proyecto, c0: Calculo, c1: Calculo, id: string): Medida[] {
  const m = p.muros.find(x => x.id === id);
  if (!m) return [];
  const dir: 'A' | 'B' = m.dir === 'Y' ? 'A' : 'B';
  const met = configDe(p).metodo;
  const reglamento = met === 'cirsoc' || met === 'fem';
  const ctrl = (c: Calculo, inicio: string) => c.controles.find(x => x.nombre.startsWith(inicio));
  const roto = (c: Calculo) => (dir === 'A' ? (c.cirsoc?.corr.rotoA ?? c.corr.rotoA) : (c.cirsoc?.corr.rotoB ?? c.corr.rotoB));
  const pieza = (c: Calculo) => c.asig.piezas.find(x => x.dir === dir && x.filaHoja !== null && x.muros.includes(id))?.nombre ?? null;
  const parte = (c: Calculo): number | null => {
    const pz = pieza(c); if (!pz) return null;
    if (met === 'fem') return c.fem?.reparto.find(x => x.dir === dir && x.nombre === pz)?.fem ?? null;
    if (met === 'planilla' || met === 'combinado') { const r = dir === 'A' ? c.res.rotA : c.res.rotB; const i = c.asig.piezas.find(x => x.dir === dir && x.nombre === pz)?.filaHoja; return i == null || !r.D5 ? null : ((r.E[i] + (isFinite(r.N[i]) ? r.N[i] : 0)) / r.D5) * 100; }
    const rg = roto(c), el = rg?.paralelos.find(x => x.nombre === pz);
    return el && rg!.Q ? ((el.tras + el.rot) / rg!.Q) * 100 : null;
  };
  const SJ = (c: Calculo) => (met === 'planilla' || met === 'combinado' ? (dir === 'A' ? c.res.jpar.AY24 : c.res.jort.AY24) : roto(c)?.SJ ?? null);
  const desplaz = (c: Calculo) => ctrl(c, reglamento ? `Deriva de servicio, viento ${dir}` : `Flecha de la ménsula, viento ${dir}`);
  const out: Medida[] = [
    { nombre: `ΣJ del viento ${dir}`, unidad: 'm⁴', decimales: 2, antes: SJ(c0), ahora: SJ(c1), mejor: 'sube' },
    { nombre: `Parte del viento ${dir} que toma su pieza (${pieza(c1) ?? pieza(c0) ?? 'sin pieza'})`, unidad: '%', decimales: 1, antes: parte(c0), ahora: parte(c1), mejor: null,
      nota: 'Más largo o más grueso, más rigidez: la pieza se lleva más viento (y más esfuerzo).' },
    { nombre: `Eje de rigidez: excentricidad del viento ${dir}`, unidad: 'm', decimales: 2, antes: roto(c0)?.e ?? null, ahora: roto(c1)?.e ?? null, mejor: 'baja',
      nota: 'Distancia entre el eje de rigidez y el del viento: cuanto más chica, menos gira la planta.' },
    { nombre: reglamento ? `Deriva de servicio en la azotea, viento ${dir}` : `Flecha de la azotea, viento ${dir}`, unidad: 'mm', decimales: 1,
      antes: desplaz(c0)?.guia != null ? desplaz(c0)!.guia! * 1000 : null, ahora: desplaz(c1)?.guia != null ? desplaz(c1)!.guia! * 1000 : null,
      estadoAntes: desplaz(c0)?.estado ?? null, estadoAhora: desplaz(c1)?.estado ?? null, mejor: 'baja' },
  ];
  // la verificación de su pieza: compresión (tensiones admisibles) o armadura necesaria (201)
  if (reglamento) {
    const rho = (c: Calculo) => { const pz = pieza(c); const v = c.cirsoc?.verif.find(x => x.dir === dir && x.nombre === pz); return v?.muros.length ? Math.max(...v.muros.map(x => x.rhoNecesaria)) * 100 : null; };
    out.push({ nombre: 'Armadura vertical necesaria de su pieza (CIRSOC 201)', unidad: '%', decimales: 2, antes: rho(c0), ahora: rho(c1), mejor: 'baja', nota: 'La del peor muro de la pieza; máximo 4 %.' });
  } else {
    const comp = (c: Calculo) => { const pz = pieza(c); return pz ? ctrl(c, `${pz}: compresión (cargado)`) : undefined; };
    out.push({ nombre: 'Compresión de su pieza (cargado)', unidad: 'kg/cm²', decimales: 1, antes: comp(c0)?.guia ?? null, ahora: comp(c1)?.guia ?? null,
      estadoAntes: comp(c0)?.estado ?? null, estadoAhora: comp(c1)?.estado ?? null, mejor: 'baja' });
  }
  const malos = (c: Calculo) => c.controles.filter(x => x.estado === 'no verifica').length;
  out.push({ nombre: 'Controles que no verifican (toda la torre)', unidad: '', decimales: 0, antes: malos(c0), ahora: malos(c1), mejor: 'baja' });
  return out;
}

/** el color del cambio: mejor, peor o igual (con una tolerancia relativa) */
export function sentido(x: Medida): 'mejor' | 'peor' | 'igual' {
  if (x.antes === null || x.ahora === null || x.mejor === null) return 'igual';
  const a = x.mejor === 'baja' ? Math.abs(x.antes) : x.antes, b = x.mejor === 'baja' ? Math.abs(x.ahora) : x.ahora;
  if (Math.abs(b - a) <= 1e-6 * Math.max(1, Math.abs(a))) return 'igual';
  return (x.mejor === 'sube') === (b > a) ? 'mejor' : 'peor';
}
