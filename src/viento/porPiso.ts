/**
 * Túnel piso por piso (propuesta 3 del diagnóstico de viento, «2,5D» o teoría de franjas): cada planta distinta de la
 * torre (la carpintería del piso o, si no hay, su losa) se simula con el túnel 2D, y su coeficiente de arrastre se
 * aplica a la franja del piso con la presión del viento a esa altura (qz del CIRSOC 102-25). Así se ve, piso por
 * piso, cómo cambia el comportamiento con la silueta, y la fuerza de cada nivel al lado de la del reglamento.
 *
 * Limitación (dicha en pantalla): una sección 2D es un prisma infinito; no ve el aire que pasa por arriba de la
 * azotea ni el del pie, por eso su Cd es mayor que el de una torre real de altura finita. Sirve para comparar plantas
 * y pisos entre sí, no como carga de diseño.
 */
import { contornoEdificioEn } from './contexto';
import type { EdificioVecino, Proyecto } from '../engine/modelo';
import { contornoAlViento, puntosSilueta } from '../engine/silueta';
import { KN_POR_T, type Direccion102 } from '../engine/cargas/cirsoc102';
import type { P } from './geometria2d';

export interface GrupoPlanta {
  /** clave del contorno (para no simular dos veces la misma planta) */
  clave: string;
  /** el contorno en planta (m) y de dónde sale */
  pol: P[]; de: 'carpintería' | 'losa';
  /** los niveles (de arriba hacia abajo) que tienen esta planta */
  niveles: { i: number; nombre: string; cota: number }[];
  /** contexto urbano: los contornos de los vecinos que llegan a esos niveles (vacío: la torre aislada) */
  vecinos: P[][];
}

/**
 * las plantas distintas de los niveles sobre PB (los iguales se juntan: se simulan una sola vez). Con contexto urbano,
 * dos niveles con la misma planta pero distintos vecinos (un edificio bajo llega a uno y no al otro) van separados
 */
export function plantasDistintas(p: Proyecto, vecinos: EdificioVecino[] = []): GrupoPlanta[] {
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const zPB = p.niveles[iPB]?.cota ?? 0;
  const grupos = new Map<string, GrupoPlanta>();
  p.niveles.forEach((n, i) => {
    if (n.cota <= zPB) return;                                       // como el 102-25: los niveles sobre PB
    const c = contornoAlViento(p, i);
    const pol = puntosSilueta(c.v, 12).map(q => ({ x: +q.x.toFixed(4), y: +q.y.toFixed(4) }));
    if (pol.length < 3) return;
    // los vecinos que llegan a este nivel, con el contorno de su tramo (un retiro cambia la planta del vecino)
    const llegan = vecinos.flatMap(e => { const t = contornoEdificioEn(e, n.cota - zPB); return t ? [{ id: `${e.id}#${t.k}`, v: t.v }] : []; });
    const clave = JSON.stringify(pol) + (llegan.length ? '|' + llegan.map(e => e.id).join(',') : '');
    const g = grupos.get(clave) ?? { clave, pol, de: c.de, niveles: [], vecinos: llegan.map(e => e.v) };
    g.niveles.push({ i, nombre: n.nombre, cota: n.cota - zPB });
    grupos.set(clave, g);
  });
  return [...grupos.values()];
}

export interface ResultadoPlanta { Cd: number; ClRms: number; St: number | null; anchoM: number; roto: boolean }

export interface FilaPiso {
  nivel: string; z: number;
  /** coeficientes de la simulación de su planta */
  Cd: number; ClRms: number; St: number | null;
  /** el coeficiente equivalente del reglamento: (p barlovento − p sotavento) / qz */
  Creg: number;
  /** fuerzas del nivel (t): con el Cd simulado y la del CIRSOC 102-25 */
  Fsim: number; Freg: number;
  /** ancho transversal de la planta (m) y altura de influencia (m) */
  ancho: number; hInf: number;
}

/**
 * fila por nivel: F = Cd · qz · ancho · h de influencia, con el Cd de la planta del nivel; al lado, lo del 102-25.
 * Los niveles sin simulación (todavía corriendo) quedan afuera.
 */
export function fuerzasPorPiso(v: Direccion102, grupos: GrupoPlanta[], res: Map<string, ResultadoPlanta>): FilaPiso[] {
  const dePiso = new Map<string, ResultadoPlanta>();
  grupos.forEach(g => { const r = res.get(g.clave); if (r) g.niveles.forEach(n => dePiso.set(n.nombre, r)); });
  return v.niveles.flatMap(n => {
    const r = dePiso.get(n.nivel);
    if (!r || !isFinite(r.Cd)) return [];
    // el ancho de la simulación es el de la planta del nivel; el reglamento usa el ancho B de la planilla
    const Fsim = (r.Cd * n.qz * r.anchoM * n.hInf) / 1000 / KN_POR_T;
    return [{ nivel: n.nivel, z: n.z, Cd: r.Cd, ClRms: r.ClRms, St: r.St, Creg: n.qz > 0 ? n.pNeta / n.qz : NaN, Fsim, Freg: n.W, ancho: r.anchoM, hInf: n.hInf }];
  });
}

/** corte y momento en PB de una lista de fuerzas por nivel (z sobre PB) */
export function corteYMomento(f: { z: number; F: number }[]): { Q: number; M: number } {
  return f.reduce((a, x) => ({ Q: a.Q + x.F, M: a.M + x.F * x.z }), { Q: 0, M: 0 });
}

/**
 * Las plantas aisladas que hacen falta para el factor de interferencia: las de los niveles que tienen vecinos, sin
 * los vecinos (la clave lleva «aislada:» adelante para no pisarse con las de contexto). Sin vecinos, ninguna.
 */
export function plantasAisladas(p: Proyecto, conContexto: GrupoPlanta[]): GrupoPlanta[] {
  const conVecinos = new Set(conContexto.filter(g => g.vecinos.length).flatMap(g => g.niveles.map(n => n.nombre)));
  if (!conVecinos.size) return [];
  return plantasDistintas(p, [])
    .filter(g => g.niveles.some(n => conVecinos.has(n.nombre)))
    .map(g => ({ ...g, clave: `aislada:${g.clave}` }));
}

export interface FilaInterferencia {
  nivel: string; z: number;
  /** Cd de la planta del nivel con los vecinos y sola */
  CdCon: number; CdSin: number;
  /** factor de interferencia = Cd con vecinos / Cd sola (< 1: los vecinos la protegen; > 1: la cargan más) */
  factor: number;
  /** fuerzas del nivel (t) */
  FCon: number; FSin: number;
}

/** el factor de interferencia por nivel, con las fuerzas con y sin vecinos (solo los niveles que tienen las dos) */
export function interferencia(con: FilaPiso[], sin: FilaPiso[]): FilaInterferencia[] {
  const s = new Map(sin.map(f => [f.nivel, f]));
  return con.flatMap(c => {
    const a = s.get(c.nivel);
    if (!a || !(a.Cd > 0)) return [];
    return [{ nivel: c.nivel, z: c.z, CdCon: c.Cd, CdSin: a.Cd, factor: c.Cd / a.Cd, FCon: c.Fsim, FSin: a.Fsim }];
  });
}
