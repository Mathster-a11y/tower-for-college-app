/**
 * Entrada común de los motores de elementos finitos (rama motor-fem, docs/motor-fem/CONTEXTO.md).
 *
 * Arma, para un viento, lo que necesitan los motores nuevos y los verificadores externos de tools/motor_fem/:
 *  - las fuerzas de cada piso, las mismas de la planilla (Wi de M,NyQ: columna H para el viento A, D·F·G para el B);
 *  - las piezas paralelas al viento con el J de su hoja, su posición, su área y el área de corte de sus almas;
 *  - las piezas perpendiculares con su J (dan la rigidez a torsión de la planta);
 *  - el reparto de la planilla (traslación + rotación) para comparar.
 *
 * Ejes locales, iguales para los dos vientos: «x» es la coordenada perpendicular al viento (la posición de la
 * planilla) e «y» la dirección del viento. Las fuerzas van en +y. Unidades de la app: m, t, m⁴, t/m².
 */
import type { Proyecto } from './modelo';
import { aPlanilla, type Direccion } from './mapping';
import { calcularPlanilla } from './planilla';

/** E del hormigón que usan los motores nuevos (t/m²); el reparto no depende de E, la flecha sí */
export const E_HORMIGON = 3.4e6;
/** G = E / (2·(1 + ν)) con ν = 0,2 */
export const G_HORMIGON = E_HORMIGON / 2.4;

export interface NivelFem { nombre: string; z: number; W: number }
export interface PiezaFem {
  nombre: string;
  /** posición perpendicular al viento (la de la planilla) y baricentro en la dirección del viento (m) */
  x: number; y: number;
  /** J de la hoja (m⁴), área (m²) y área de corte de las almas, los muros paralelos al viento (m²) */
  J: number; A: number; Av: number;
  /** cotas donde empieza y termina la pieza (m); la planilla supone que todas van de la fundación a la azotea */
  zDesde: number; zHasta: number;
}
export interface PerpFem { nombre: string; y: number; J: number }
export interface RepartoPlanilla {
  nombre: string;
  /** fracción del J, corte por traslación y corte por rotación (t) */
  frac: number; Qtras: number; N: number;
  /** % del corte total que toma la pieza (traslación + rotación) */
  pct: number;
}
export interface EntradaFem {
  caso: string; dir: Direccion;
  E: number; G: number;
  /** de la azotea a PB, como la planilla */
  niveles: NivelFem[];
  piezas: PiezaFem[];
  perp: PerpFem[];
  planilla: { Q: number; Xr: number; reparto: RepartoPlanilla[] };
  /** todas las piezas van de PB a la azotea: la hipótesis de la planilla (vale la prueba de oro) */
  alturaCompleta: boolean;
}

const r = (v: number) => (isFinite(v) ? v : 0);

export function entradaFem(p: Proyecto, dir: Direccion = 'A', caso = p.nombre ?? 'proyecto'): EntradaFem {
  const a = aPlanilla(p), res = calcularPlanilla(a.datos);
  const otra: Direccion = dir === 'A' ? 'B' : 'A';
  const rot = dir === 'A' ? res.rotA : res.rotB, rotO = dir === 'A' ? res.rotB : res.rotA;
  const m = res.mnyq;
  const W = (k: number) => (dir === 'A' ? m.H[k] : m.D[k] * m.F[k] * m.G[k]) ?? 0;
  const niveles = p.niveles.map((n, j) => ({ nombre: n.nombre, z: n.cota, W: W(a.filaNivel[j]) })).filter(n => n.z >= 0);
  const zTop = Math.max(...niveles.map(n => n.z));
  // muros paralelos al viento: el viento A corre en y (muros «Y»), el B en x (muros «X»)
  const dirMuro = dir === 'A' ? 'Y' : 'X';
  const enViento = (mu: { x: number; y: number }) => (dir === 'A' ? mu.y : mu.x);
  const piezas: PiezaFem[] = a.piezas.filter(pz => pz.dir === dir && pz.filaHoja !== null).map(pz => {
    const ms = p.muros.filter(mu => pz.muros.includes(mu.id));
    const area = (mu: { largo: number; espesor: number }) => mu.largo * mu.espesor;
    const sA = ms.reduce((s, mu) => s + area(mu), 0);
    return {
      nombre: pz.nombre, x: pz.posicion,
      y: sA > 0 ? ms.reduce((s, mu) => s + area(mu) * enViento(mu), 0) / sA : 0,
      J: rot.B[pz.filaHoja!], A: pz.area,
      Av: ms.filter(mu => mu.dir === dirMuro).reduce((s, mu) => s + area(mu), 0),
      zDesde: Math.max(0, Math.min(...ms.map(mu => mu.zDesde ?? 0))),
      zHasta: Math.min(zTop, Math.max(...ms.map(mu => mu.zHasta ?? zTop))),
    };
  });
  const perp = a.piezas.filter(pz => pz.dir === otra && pz.filaHoja !== null)
    .map(pz => ({ nombre: `${pz.nombre} (${otra})`, y: pz.posicion, J: rotO.B[pz.filaHoja!] }));
  const filaDe = new Map(a.piezas.filter(pz => pz.dir === dir).map(pz => [pz.nombre, pz.filaHoja!]));
  const reparto = piezas.map(pz => {
    const f = filaDe.get(pz.nombre)!;
    const Qtras = r(rot.E[f]), N = r(rot.N[f]);
    return { nombre: pz.nombre, frac: r(rot.C[f]), Qtras, N, pct: ((Qtras + N) / rot.D5) * 100 };
  });
  return {
    caso, dir, E: E_HORMIGON, G: G_HORMIGON, niveles, piezas, perp,
    planilla: { Q: rot.D5, Xr: rot.J7, reparto },
    alturaCompleta: piezas.every(pz => pz.zDesde <= 1e-6 && pz.zHasta >= zTop - 1e-6),
  };
}
