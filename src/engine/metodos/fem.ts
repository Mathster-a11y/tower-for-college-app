/**
 * Método FEM (plan de trabajo, etapa 6): las reglas del CIRSOC (cargas 101-25 y 102-25, hormigón 201-2005) con el
 * reparto de un modelo de la torre en lugar de la rototraslación de la guía.
 *
 *  - Modelo pseudo-3D (engine/fem/pseudo3d.ts): losas rígidas con tres grados de libertad por piso (ux, uy, θ) y cada
 *    pieza como una ménsula (Euler o Timoshenko) que llega hasta su cota.
 *  - Análisis modal con la masa de las losas y de los tabiques: da la frecuencia n1 de cada dirección, que entra al
 *    viento del 102-25 (art. 1.9: G = 0,85 si n1 ≥ 1 Hz, si no Gf). Es lo que la fórmula aproximada no puede dar en
 *    torres esbeltas (h ≥ 4·Lef).
 *  - Los cuatro casos de carga de la Fig. 2.4-8 se resuelven con el modelo: cada pieza toma lo que su rigidez y su
 *    posición le dan, piso por piso (las que no llegan arriba, los cambios de planta y la torsión salen solos).
 *  - Deriva de servicio con los desplazamientos del modelo, en el borde más desfavorable de la planta.
 *
 * Unidades de la app: m, t, t/m², t·s²/m.
 */
import { losasDeNivel, type Proyecto } from '../modelo';
import { entradaFem, E_HORMIGON, G_HORMIGON } from '../femEntrada';
import { modal, resolverTorre, type CargasPiso, type ModeloTorre, type Modo, type ResultadoFem } from '../fem/pseudo3d';
import { viento102, type Viento102 } from '../cargas/cirsoc102';
import { datos101De } from '../cargas/cirsoc101';
import type { TeoriaFem } from './tipos';
import { nucleosCerrados } from '../torsionNucleos';

/** aceleración de la gravedad (m/s²) para pasar los pesos (t) a masas (t·s²/m) */
export const GRAVEDAD = 9.80665;
/** peso del hormigón armado de los tabiques (t/m³), como la guía */
const PESO_HORMIGON = 2.4;

export interface CasoFem {
  /** caso de la Fig. 2.4-8 (1 a 4) y signo de la torsión (+1, −1; 0 sin torsión) */
  caso: 1 | 2 | 3 | 4; signo: number; texto: string;
  cargas: CargasPiso; res: ResultadoFem;
}
export interface ResultadoMetodoFem {
  modelo: ModeloTorre;
  masas: number[]; inercias: number[];
  modos: Modo[];
  /** primera frecuencia con el movimiento dominante en cada dirección (Hz): A = en y, B = en x */
  n1: { A: number; B: number };
  viento: Viento102;
  casos: CasoFem[];
  /** esfuerzos en la base de cada pieza en cada caso (1 a 4): el peor de los dos signos de la torsión. Es una tabla
   *  (no una función) para que el cálculo se pueda copiar entre hilos; se lee con esfuerzosFem */
  esfuerzos: Record<'A' | 'B', Record<string, { M: number; V: number }[]>>;
  /** torsor en la base de cada núcleo cerrado en cada caso (1 a 4), el mayor de los que entran en esa dirección (tm) */
  torsion?: Record<'A' | 'B', Record<string, number[]>>;
  /** deformada de servicio de cada dirección (caso 1, borde más desfavorable): cotas sobre PB y desplazamientos (m) */
  deriva: Record<'A' | 'B', { z: number[]; d: number[]; h: number }>;
  /** % del corte del viento que toma cada pieza en el caso 1 (FEM) y el de la planilla, para comparar */
  reparto: { dir: 'A' | 'B'; nombre: string; fem: number; planilla: number }[];
}

/** ancho (B, en x) y largo (L, en y) de la planta en cada nivel; los que faltan son los del nivel de arriba */
function plantas(p: Proyecto) {
  let B = 0, L = 0;
  return p.niveles.map(n => { B = n.B ?? B; L = n.L ?? L; return { ...n, B, L }; });
}

/** el modelo de la torre, con las piezas de las dos direcciones (las mismas de la planilla) */
export function modeloDeProyecto(p: Proyecto, teoria: TeoriaFem = 'timoshenko'): ModeloTorre {
  const eA = entradaFem(p, 'A'), eB = entradaFem(p, 'B');
  const zPB = p.niveles.reduce((z, n) => (n.cota >= 0 ? n.cota : z), 0);
  const z = [...new Set(p.niveles.map(n => n.cota - zPB).filter(x => x > 1e-6))].sort((a, b) => a - b);
  const pieza = (dir: 'A' | 'B') => (x: (typeof eA.piezas)[number]) => ({
    nombre: x.nombre, dir, pos: x.x, J: x.J, Av: x.Av > 0 ? x.Av : x.A, zHasta: x.zHasta - zPB,
  });
  const torsores = nucleosCerrados(p).map(n => ({ nombre: n.nombre, GJt: G_HORMIGON * n.Jt, zHasta: n.h }));
  return { z, E: E_HORMIGON, G: G_HORMIGON, timo: teoria === 'timoshenko', piezas: [...eA.piezas.map(pieza('A')), ...eB.piezas.map(pieza('B'))], ...(torsores.length ? { torsores } : {}) };
}

/**
 * Masa de cada losa (t·s²/m) e inercia rotacional (J0 = m·(B² + L²)/12): la carga permanente D de la losa por el área
 * de la planta (por la cantidad de pisos que representa el nivel) más los tabiques de media altura arriba y abajo.
 */
export function masasDeProyecto(p: Proyecto, mo: ModeloTorre): { masas: number[]; inercias: number[] } {
  const D = datos101De(p).D;
  const pl = plantas(p);
  const zPB = p.niveles.reduce((z, n) => (n.cota >= 0 ? n.cota : z), 0);
  const masas: number[] = [], inercias: number[] = [];
  mo.z.forEach((z, k) => {
    const n = pl.find(x => Math.abs(x.cota - zPB - z) < 1e-6)!;
    const arriba = k + 1 < mo.z.length ? (mo.z[k + 1] - z) / 2 : 0, abajo = (z - (k > 0 ? mo.z[k - 1] : 0)) / 2;
    const cota = z + zPB;
    const tabiques = p.muros.reduce((s, m) => {
      const z0 = m.zDesde ?? -Infinity, z1 = m.zHasta ?? Infinity;
      const h = Math.max(0, Math.min(cota + arriba, z1) - Math.max(cota - abajo, z0));
      return s + m.largo * m.espesor * h * PESO_HORMIGON;
    }, 0);
    const peso = D * n.B * n.L * losasDeNivel(n) + tabiques;
    const m = peso / GRAVEDAD;
    masas.push(m); inercias.push((m * (n.B ** 2 + n.L ** 2)) / 12);
  });
  return { masas, inercias };
}

/** esfuerzos en la base de una pieza en los casos 1 a 4, o null si la pieza no está en el modelo */
export function esfuerzosFem(r: ResultadoMetodoFem, dir: 'A' | 'B', nombre: string): { M: number; V: number }[] | null {
  return Object.prototype.hasOwnProperty.call(r.esfuerzos[dir], nombre) ? r.esfuerzos[dir][nombre] : null;
}

/** torsor en la base de un núcleo cerrado en los casos 1 a 4, o null si el modelo no lo tiene */
export function torsorFem(r: ResultadoMetodoFem, dir: 'A' | 'B', nucleo: string): number[] | null {
  return r.torsion && Object.prototype.hasOwnProperty.call(r.torsion[dir], nucleo) ? r.torsion[dir][nucleo] : null;
}

/** todo el método FEM de un proyecto: modal → viento del 102-25 con esas frecuencias → casos de carga → esfuerzos */
export function calcularFem(p: Proyecto, teoria: TeoriaFem = 'timoshenko'): ResultadoMetodoFem {
  const mo = modeloDeProyecto(p, teoria);
  const { masas, inercias } = masasDeProyecto(p, mo);
  const modos = mo.z.length ? modal(mo, masas, inercias) : [];
  const primero = (d: 'x' | 'y') => modos.find(m => m.dominante === d && m.f > 1e-6)?.f ?? 0;
  const n1 = { A: primero('y'), B: primero('x') };
  // el modelo es de tabiques: no tiene la rigidez del exoesqueleto. Con exo (o si los tabiques casi no toman viento),
  // su frecuencia no es la de la torre y el viento usa la aproximada del 102-25 (art. 1.9.3)
  const w = viento102(p, p.exo ? undefined : n1);
  // fuerzas del viento en cada piso del modelo (t)
  const Wdir = (d: 'A' | 'B') => mo.z.map(z => w[d].niveles.find(x => Math.abs(x.z - z) < 1e-6)?.W ?? 0);
  const WA = Wdir('A'), WB = Wdir('B');
  const cero = mo.z.map(() => 0);
  const esc = (v: number[], f: number) => v.map(x => x * f);
  // torsión de cada piso: fracción · W · 0,15 · B (el ancho normal a cada viento)
  const MtA = esc(WA, 0.15 * w.A.B), MtB = esc(WB, 0.15 * w.B.B);
  const suma = (...v: number[][]) => mo.z.map((_, k) => v.reduce((s, x) => s + x[k], 0));
  const casos: CasoFem[] = [];
  const agregar = (caso: CasoFem['caso'], signo: number, texto: string, c: CargasPiso) => casos.push({ caso, signo, texto, cargas: c, res: resolverTorre(mo, c) });
  // los casos se guardan por dirección: «A» = viento A (con su torsión), «B» = viento B; los casos 3 y 4 llevan las dos
  agregar(1, 0, 'Caso 1, viento A', { Fx: cero, Fy: WA, Mz: cero });
  agregar(1, 0, 'Caso 1, viento B', { Fx: WB, Fy: cero, Mz: cero });
  for (const s of [1, -1]) {
    agregar(2, s, `Caso 2, viento A, torsión ${s > 0 ? '+' : '−'}`, { Fx: cero, Fy: esc(WA, 0.75), Mz: esc(MtA, 0.75 * s) });
    agregar(2, s, `Caso 2, viento B, torsión ${s > 0 ? '+' : '−'}`, { Fx: esc(WB, 0.75), Fy: cero, Mz: esc(MtB, 0.75 * s) });
  }
  agregar(3, 0, 'Caso 3, los dos vientos', { Fx: esc(WB, 0.75), Fy: esc(WA, 0.75), Mz: cero });
  for (const s of [1, -1]) agregar(4, s, `Caso 4, los dos vientos, torsión ${s > 0 ? '+' : '−'}`, { Fx: esc(WB, 0.563), Fy: esc(WA, 0.563), Mz: esc(suma(MtA, MtB), 0.563 * s) });

  const deDir = (c: CasoFem, d: 'A' | 'B') => c.caso >= 3 || (d === 'A' ? c.texto.includes('viento A') : c.texto.includes('viento B'));
  const esfuerzosDe = (d: 'A' | 'B', nombre: string) => {
    return ([1, 2, 3, 4] as const).map(k => {
      let M = 0, V = 0;
      for (const c of casos.filter(x => x.caso === k && deDir(x, d))) {
        const pz = c.res.piezas.find(x => x.dir === d && x.nombre === nombre);
        if (pz && Math.abs(pz.M) > Math.abs(M)) { M = pz.M; V = pz.V; }
      }
      return { M, V };
    });
  };
  const esfuerzos: ResultadoMetodoFem['esfuerzos'] = { A: {}, B: {} };
  for (const pz of mo.piezas) esfuerzos[pz.dir][pz.nombre] ??= esfuerzosDe(pz.dir, pz.nombre);
  const torsion: ResultadoMetodoFem['torsion'] = mo.torsores?.length ? { A: {}, B: {} } : undefined;
  if (torsion) for (const d of ['A', 'B'] as const) for (const t of mo.torsores!) {
    torsion[d][t.nombre] = ([1, 2, 3, 4] as const).map(k => casos.filter(x => x.caso === k && deDir(x, d))
      .reduce((m, c) => Math.max(m, Math.abs(c.res.torsores?.find(x => x.nombre === t.nombre)?.T ?? 0)), 0));
  }

  // deriva de servicio (caso 1): el borde de la planta que más se mueve, con la presión de servicio
  const pl = plantas(p), iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const B = pl[iPB]?.B ?? 0, L = pl[iPB]?.L ?? 0;
  const f = w.servicio.relacion;
  const deriva = {
    A: { z: [0, ...mo.z], d: [0, ...casos[0].res.uy.map((u, k) => f * Math.max(Math.abs(u + (B / 2) * casos[0].res.rz[k]), Math.abs(u - (B / 2) * casos[0].res.rz[k])))], h: mo.z[mo.z.length - 1] ?? 0 },
    B: { z: [0, ...mo.z], d: [0, ...casos[1].res.ux.map((u, k) => f * Math.max(Math.abs(u - (L / 2) * casos[1].res.rz[k]), Math.abs(u + (L / 2) * casos[1].res.rz[k])))], h: mo.z[mo.z.length - 1] ?? 0 },
  };

  const reparto: ResultadoMetodoFem['reparto'] = [];
  for (const d of ['A', 'B'] as const) {
    const c = casos[d === 'A' ? 0 : 1], Q = (d === 'A' ? WA : WB).reduce((s, x) => s + x, 0);
    const pla = new Map(entradaFem(p, d).planilla.reparto.map(x => [x.nombre, x.pct]));
    for (const pz of c.res.piezas.filter(x => x.dir === d)) reparto.push({ dir: d, nombre: pz.nombre, fem: Q > 0 ? (pz.V / Q) * 100 : 0, planilla: pla.get(pz.nombre) ?? 0 });
  }
  return { modelo: mo, masas, inercias, modos, n1, viento: w, casos, esfuerzos, ...(torsion ? { torsion } : {}), deriva, reparto };
}
