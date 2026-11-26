/**
 * Método «CIRSOC» (plan de trabajo, etapa 4): cargas del CIRSOC 101-25 y 102-25, reparto de la guía (rototraslación
 * muro por muro) y verificación del CIRSOC 201-2005.
 *
 * Para que todas las etapas (viento, fuerzas, estabilidad, rigidez, rototraslación) muestren el método CIRSOC con los
 * mismos dibujos y fórmulas, se usa el motor de la planilla con los parámetros del 102-25 traducidos a su hoja de viento:
 *  - zg y α de la exposición del 102-25 (Tabla 1.9-1) y Kz con z ≥ 5 m;
 *  - el 2,41 del 102-25 en lugar del 2,01 del 2005, el Ke y el paso de N a t exacto (9,80665 en vez de 10) van en «I»;
 *  - G (o Gf) y Cp de sotavento del 102-25.
 * La planilla tiene una sola hoja de viento: el viento B usa el G y el Cp de sotavento del viento A. La verificación del
 * 201 toma las fuerzas de cada dirección directamente del cálculo del 102-25 (cargas/cirsoc102.ts).
 */
import type { PlanillaDatos } from '../planilla';
import { EXPOSICIONES, KN_POR_T, type Viento102 } from '../cargas/cirsoc102';
import { losasDeNivel, tipoDe, type Proyecto, type Muro } from '../modelo';
import { sueloCirsoc } from '../fundaciones';
import type { PiezaEquivalente } from '../mapping';
import type { RotoGuia } from '../correcciones';
import { datosAlturaDe, partesDePieza, verificarPieza } from '../flexocompresion';
import { corteDintel201, fcDe, verificarMuro201, type Solicitacion, type VerifMuro201 } from '../verificacion/cirsoc201';
import { armarTabique, estaticoCorte, textoBarras } from './guia';
import { combinaciones, datos101De, sobrecarga } from '../cargas/cirsoc101';
import type { Control } from '../verificaciones';
import type { PlanillaRes } from '../planilla';
import { deformada, moduloHormigon, rigidez, type PuntoAltura } from '../diagramas';
import type { NivelVerificacion } from './tipos';

/** los datos de la planilla con la hoja de viento traducida al 102-25 */
export function datosCirsoc(d: PlanillaDatos, w: Viento102): PlanillaDatos {
  const e = EXPOSICIONES[w.exposicion];
  const I = w.Ke * (2.41 / 2.01) * (10 / KN_POR_T);
  return { ...d, viento: { ...d.viento, V: w.V, Kd: w.Kd, I, zg: e.zg, alfa: e.alfa, Kzt: w.Kzt, G: w.A.Gusado, Cpb: 0.8, Cps: w.A.Cps, GCpi: w.GCpi } };
}

// ---------------------------------------------------------------------------------------------------- verificación 201

export type Recubrimiento = 'interior' | 'exterior';
/** CIRSOC 200-24, Tablas 2.1 y 2.2: clases de exposición (generales que corroen la armadura y específicas) */
export type ExposicionHormigon = 'A1' | 'A2' | 'A3' | 'CL1' | 'CL2' | 'M1' | 'M2' | 'M3' | 'C1' | 'C2' | 'Q1' | 'Q2' | 'Q3';
export const CLASES_EXPOSICION: Record<ExposicionHormigon, { texto: string; fcMin: number; acMax: number }> = {
  // Tabla 2.5: f'c mínimo y razón a/c máxima del hormigón armado
  A1: { texto: 'A1: seco (interiores con HR < 65 %, revestidos, enterrados en suelo húmedo)', fcMin: 20, acMax: 0.6 },
  A2: { texto: 'A2: húmedo (interiores con HR ≥ 65 %, exteriores protegidos de la lluvia)', fcMin: 20, acMax: 0.6 },
  A3: { texto: 'A3: mojado y secado (exteriores expuestos a la lluvia)', fcMin: 25, acMax: 0.5 },
  CL1: { texto: 'CL1: cloruros de origen no marino', fcMin: 30, acMax: 0.5 },
  CL2: { texto: 'CL2: emanaciones de cloro', fcMin: 35, acMax: 0.45 },
  M1: { texto: 'M1: ambiente marino a más de 1 km de la costa', fcMin: 30, acMax: 0.5 },
  M2: { texto: 'M2: ambiente marino a menos de 1 km', fcMin: 35, acMax: 0.45 },
  M3: { texto: 'M3: en contacto con el agua de mar', fcMin: 40, acMax: 0.4 },
  C1: { texto: 'C1: congelación y deshielo sin sales', fcMin: 30, acMax: 0.45 },
  C2: { texto: 'C2: congelación y deshielo con sales', fcMin: 35, acMax: 0.4 },
  Q1: { texto: 'Q1: ataque químico moderado', fcMin: 30, acMax: 0.5 },
  Q2: { texto: 'Q2: ataque químico fuerte', fcMin: 35, acMax: 0.45 },
  Q3: { texto: 'Q3: ataque químico muy fuerte', fcMin: 40, acMax: 0.4 },
};
/** las clases que usaba la app antes del 200-24 */
const CLASE_VIEJA: Record<string, ExposicionHormigon> = { 'A1-A2': 'A2', 'A3-Q1-C1': 'A3', 'marina-agresiva': 'M1' };
export interface DatosCirsoc201 {
  /** tabique no expuesto al aire libre ni en contacto con el suelo (interior) o sí (exterior) */
  recubrimiento?: Recubrimiento;
  /** clase de exposición (CIRSOC 200-24, Tablas 2.1 y 2.2): fija el f'c mínimo (Tabla 2.5) */
  exposicion?: ExposicionHormigon;
  /** vida útil prevista (años): 50 o 100 (Tabla 8.3) */
  vidaUtil?: 50 | 100;
  /** control de ejecución (8.3.4): con control Δr = 5 mm; sin control, 10 mm */
  control?: 'con' | 'sin';
  /** recubrimiento escrito a mano (mm), en lugar de la tabla */
  recManual?: number | null;
  /** límite de deriva de servicio: 400, 500 (como la guía) o 600 → h/límite */
  limiteDeriva?: 400 | 500 | 600;
}
export const DATOS_201_POR_DEFECTO: Required<DatosCirsoc201> = { recubrimiento: 'interior', exposicion: 'A2', vidaUtil: 50, control: 'con', recManual: null, limiteDeriva: 500 };
export const datos201De = (p: { cirsoc201?: DatosCirsoc201 | null }): Required<DatosCirsoc201> => {
  const d = { ...DATOS_201_POR_DEFECTO, ...(p.cirsoc201 ?? {}) };
  const ex = d.exposicion as string;
  return { ...d, exposicion: CLASE_VIEJA[ex] ?? (ex in CLASES_EXPOSICION ? (ex as ExposicionHormigon) : 'A2') };
};
/**
 * recubrimiento nominal en mm (CIRSOC 200-24, 8.3): Rnom = Ref + Δr. Ref de la Tabla 8.3 para tabiques hormigonados
 * in situ con barras de hasta Ø16: no expuesto 20 mm (50 años) o 25 (100); al aire libre o contra el suelo 30 o 35.
 * Δr = 5 mm con control de ejecución y 10 sin control. O el escrito a mano.
 */
export function recubrimientoMm(d: DatosCirsoc201): number {
  const x = { ...DATOS_201_POR_DEFECTO, ...d };
  if (x.recManual && x.recManual > 0) return x.recManual;
  const ref = x.recubrimiento === 'exterior' ? (x.vidaUtil === 100 ? 35 : 30) : (x.vidaUtil === 100 ? 25 : 20);
  return ref + (x.control === 'sin' ? 10 : 5);
}

export interface VerifPieza201 {
  nombre: string; dir: 'A' | 'B';
  /** parte del viento de la dirección que toma la pieza en cada caso de carga (1 = todo) */
  partes: number[];
  M: number; V: number;
  /** corte de la pieza en PB en cada caso de carga (t) */
  Vcasos: number[];
  muros: (VerifMuro201 & { armado: string })[];
  verifica: boolean;
}

/**
 * Parte del viento (corte y momento en PB) que toma cada pieza en los cuatro casos de carga (Fig. 2.4-8), con la
 * rototraslación de la guía: parte(e) = J/ΣJ − e·J·a / ΣJt·a². Caso 1: e propia; caso 2: 75 % con e ± 0,15 B;
 * caso 3: 75 %; caso 4: 56,3 % con e ± 0,15 B y la torsión del otro viento (0,563 · Q_otro · 0,15 B_otro, con el
 * signo que suma).
 */
export function partesPorCaso(rg: RotoGuia, nombre: string, B: number, Qdir: number, QotroTorsion: number): number[] {
  const el = rg.paralelos.find(x => x.nombre === nombre);
  if (!el || !(rg.SJ > 0)) return [0, 0, 0, 0];
  const parte = (e: number) => el.J / rg.SJ - (rg.SJa2 > 0 ? (e * el.J * el.a) / rg.SJa2 : 0);
  const peor = (e: number) => Math.max(parte(e + 0.15 * B), parte(e - 0.15 * B));
  const cruz = rg.SJa2 > 0 && Qdir > 0 ? (QotroTorsion / Qdir) * Math.abs(el.J * el.a) / rg.SJa2 : 0;
  return [parte(rg.e), 0.75 * peor(rg.e), 0.75 * parte(rg.e), 0.563 * peor(rg.e) + 0.563 * cruz];
}

/**
 * Verificación CIRSOC 201 de todas las piezas de una dirección, en PB, muro por muro como la guía (almas a
 * flexocompresión con su parte del momento, alas con la fuerza del par), con todas las combinaciones del 101-25 y los
 * cuatro casos de carga del viento.
 */
export function verificarDireccion201(p: Proyecto, piezas: PiezaEquivalente[], rg: RotoGuia | undefined, dir: 'A' | 'B',
  QPB: number, MPB: number, Botro: number, QotroPB: number,
  /** método FEM: el corte y el momento en la base de cada pieza en los cuatro casos (manda sobre la rototraslación) */
  esfuerzosFem?: (nombre: string) => { M: number; V: number }[] | null): VerifPieza201[] {
  if (!rg && !esfuerzosFem) return [];
  const alt = datosAlturaDe(p), d1 = datos101De(p), L = sobrecarga(d1), fc = fcDe(p.hormigon || 'H30');
  const rec = (recubrimientoMm(datos201De(p)) + 12) / 1000;                     // al eje de las barras: + Ø6 horizontal + Ø12/2
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const lc = iPB > 0 ? p.niveles[iPB - 1].cota - p.niveles[iPB].cota : 3;
  const porId = new Map(p.muros.map(m => [m.id, m]));
  const Bdir = (() => { let B = 0, Lp = 0; p.niveles.slice(0, iPB + 1).forEach(n => { B = n.B ?? B; Lp = n.L ?? Lp; }); return dir === 'A' ? B : Lp; })();
  const torsionOtro = 0.15 * Botro * QotroPB;
  const combos = combinaciones();
  return piezas.filter(pz => pz.dir === dir && pz.filaHoja !== null).map(pz => {
    const muros = pz.muros.map(id => porId.get(id)).filter((m): m is Muro => !!m);
    const { partes, J } = partesDePieza(muros, dir);
    const base = verificarPieza(pz.nombre, dir, muros, 1, alt, 300).muros;      // pesos de cada parte (D y L)
    const fem = esfuerzosFem?.(pz.nombre) ?? null;
    const frac = fem ? fem.map(x => (MPB > 0 ? Math.abs(x.M) / MPB : 0)) : partesPorCaso(rg!, pz.nombre, Bdir, QPB, torsionOtro);
    const areaAlmas = partes.filter(x => x.h >= x.b).reduce((s, x) => s + x.A, 0) || 1;
    const out = partes.map((pt, k) => {
      const b0 = base[k];
      const D = b0.Pp + d1.D * (b0.losaDesc / 0.7), Lm = L * (b0.losaDesc / 0.7);
      const esAlma = pt.h >= pt.b;
      const lw = Math.max(pt.b, pt.h), t = Math.min(pt.b, pt.h);
      const sol: Solicitacion[] = [];
      for (const c of combos) {
        if (c.W === 0) { sol.push({ combinacion: c.nombre, Nu: c.D * D + c.L * Lm, Mu: 0, Vu: 0 }); continue; }
        frac.forEach((f, ci) => {
          const M = fem ? Math.abs(fem[ci].M) : f * MPB, V = fem ? Math.abs(fem[ci].V) : f * QPB;
          const Nw = J > 0 ? (M * pt.A * pt.d) / J : 0, Mw = esAlma && J > 0 ? (M * (pt.b * pt.h ** 3) / 12) / J : 0;
          const Vw = esAlma ? (V * pt.A) / areaAlmas : 0;
          for (const sg of [1, -1]) sol.push({ combinacion: `${c.nombre} · caso ${ci + 1}${sg > 0 ? '' : ' (viento al revés)'}`, Nu: c.D * D + c.L * Lm + sg * c.W * Nw, Mu: c.W * Mw, Vu: c.W * Vw });
        });
      }
      const v = verificarMuro201(pt.id, esAlma ? 'alma' : 'ala', lw, t, sol, fc, rec, Math.max(0.1, (Math.min(porId.get(pt.id)!.zHasta ?? alt.zTop, alt.zTop) - alt.zPB)), lc);
      const As = v.rhoNecesaria * lw * t * 1e4;                                // cm²
      const arm = armarTabique(As, 0, lw);
      return { ...v, armado: `${textoBarras(arm.vertical)}, horizontal ρ = ${(v.rhoH * 100).toFixed(2).replace('.', ',')} %` };
    });
    const Vcasos = frac.map((f, ci) => (fem ? Math.abs(fem[ci].V) : Math.abs(f * QPB)));
    return { nombre: pz.nombre, dir, partes: frac, M: frac[0] * MPB, V: frac[0] * QPB, Vcasos, muros: out, verifica: out.every(x => x.verifica) };
  });
}

// ---------------------------------------------------------------------------------------------------- controles

/** vuelco con las fuerzas del 102-25 (viento A): Mv en la fundación y Me = G · b1/2 con el peso D de las losas */
export function vuelco102(p: Proyecto, w: Viento102): { Mv: number; Me: number; G: number; brazo: number } {
  const D = datos101De(p).D;
  let B = 0, L = 0, G = 0;
  // cada nivel carga como los pisos reales que junta (como en FEM y la Guía)
  p.niveles.forEach(n => { B = n.B ?? B; L = n.L ?? L; G += D * B * L * losasDeNivel(n); });
  const zPB = p.niveles.reduce((z, n) => (n.cota >= 0 ? n.cota : z), 0), zFund = p.niveles[p.niveles.length - 1]?.cota ?? zPB;
  const brazo = zPB - zFund;
  const Mv = w.A.MPB + (w.A.QPB + Math.max(0, w.A.WPB)) * brazo;
  return { Mv, Me: (G * p.fundacion.b1) / 2, G, brazo };
}

const nf = (x: number, d: number) => x.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pc = (x: number) => `${nf(x * 100, 2)} %`;

/**
 * Los controles del método CIRSOC: reemplazan a los de la guía donde el reglamento dice otra cosa (vuelco con
 * 0,9 D + 1,0 W, frecuencia y carga mínima del 102-25, deriva de servicio, hormigón por resistencia del 201).
 */
export function controlesCirsoc(p: Proyecto, base: Control[], valores: PlanillaRes, w: Viento102, verif: VerifPieza201[], _filaNivel: number[], nivel: NivelVerificacion,
  /** ΣJ de cada dirección (la rototraslación de la guía, con el J de la sección real) */
  SJ: { A: number; B: number } | undefined,
  /** método FEM: la deformada de servicio del modelo (ya escalada al viento de servicio), en lugar de la ménsula equivalente */
  derivaFem?: Record<'A' | 'B', { z: number[]; d: number[]; h: number }>,
  /** con exoesqueleto: la torre con el exo (manda sobre la ménsula de tabiques y el FEM) */
  exo?: Record<'A' | 'B', { r: { u: number[] }; z: number[]; h: number }>): Control[] {
  // fuera los de la guía que el reglamento hace distinto (y los del suelo y la resultante, que acá salen del 102-25)
  const fuera = (c: Control) => /^Flexocompresión|^Corte en dinteles/.test(c.grupo) || /^Frecuencia|^Carga mínima|^Vuelco|^Flecha de la ménsula|^Excentricidad|^Tensión máxima en el suelo|^Tensión mínima en el suelo|^Resultante W \+ G/.test(c.nombre);
  // el J mínimo de la cátedra (h/500 con el viento de cálculo) queda como referencia: lo que manda es la deriva de servicio
  const out = base.filter(c => !fuera(c)).map(c => (/≥ J mínimo \(h\/500\)/.test(c.nombre)
    ? { ...c, estado: 'informativo' as Control['estado'], nota: `${c.estado === 'verifica' ? 'Cumple' : 'No cumple'} el criterio de la cátedra (h/500 con el viento de cálculo). En el CIRSOC manda la deriva de servicio (más abajo).${c.nota ? ` ${c.nota}` : ''}` }
    : c));
  const est = (ok: boolean) => (ok ? 'verifica' : 'no verifica') as Control['estado'];
  for (const d of [w.A, w.B]) {
    out.push({ grupo: 'Viento', nombre: `Frecuencia n1, viento ${d.dir}`, criterio: 'n1 ≥ 1 Hz: rígido (G = 0,85); si no, Gf', fuente: 'CIRSOC 102-25, art. 1.9',
      planilla: null, guia: d.n1, unidad: 'Hz', estado: d.rigido ? 'verifica' : 'atención',
      nota: `${d.metodoFrecuencia}; ${d.rigido ? 'rígido' : `flexible: Gf = ${nf(d.Gusado, 3)}`}.${d.aproximadaValida ? '' : ' La fórmula aproximada no vale para esta torre (h ≥ 4·Lef): hace falta n1 de un análisis.'}` });
    out.push({ grupo: 'Viento', nombre: `Carga mínima, viento ${d.dir}`, criterio: 'W ≥ 0,75 kN/m² · área de la pared', fuente: 'CIRSOC 102-25, art. 2.1.5',
      planilla: null, guia: d.W, unidad: 't', estado: 'verifica', nota: d.mandaMinimo ? 'Manda la mínima: las fuerzas se escalaron.' : `mínima ${nf(d.Wmin, 1)} t` });
  }
  // vuelco: la resistencia (0,9 D) iguala o supera al efecto (1,0 W): 0,9 · Me ≥ Mv ⇔ Me / Mv ≥ 1,11, con las fuerzas
  // del 102-25 (viento A) llevadas a la fundación y el peso D de las losas del 101-25
  const vu = vuelco102(p, w);
  out.push({ grupo: 'Estabilidad', nombre: 'Vuelco con 0,9 D + 1,0 W', criterio: '0,9 · Me ≥ 1,0 · Mv (Me / Mv ≥ 1,11)', fuente: 'CIRSOC 101-25, art. 1.3.5 y 2.3.2',
    planilla: null, guia: vu.Me / vu.Mv, unidad: '', estado: est(0.9 * vu.Me >= vu.Mv),
    nota: `Mv = ${nf(vu.Mv, 0)} tm (M en PB + (Q en PB + franja de PB) · ${nf(vu.brazo, 2)} m) · Me = G · b1/2 = ${nf(vu.G, 0)} t · ${nf(p.fundacion.b1 / 2, 2)} m` });
  // suelo (sección D del plan): platea rígida, combinaciones de servicio del 102-25 (Apéndice B.4.2) contra σt adm
  const su = sueloCirsoc(p, w);
  for (const d of su.dirs) {
    const x = d.peor, ok = !x.vuelca && x.sMax <= su.sigmaAdm;
    const parcial = d.combos.some(c => c.parcial && !c.vuelca);
    out.push({ grupo: 'Estabilidad', nombre: `Presión en el suelo, viento ${d.dir}`, criterio: `σmáx ≤ σt adm = ${nf(su.sigmaAdm, 2)} kg/cm²; resultante en el núcleo central (si no, contacto parcial)`, fuente: 'CIRSOC 401, art. 7.4 · 101-25, C 2.2 · 102-25, B.4.2',
      planilla: null, guia: x.sMax, unidad: 'kg/cm²', estado: !ok ? 'no verifica' : parcial ? 'atención' : 'verifica',
      nota: d.combos.map(c => `${c.nombre}: ${c.vuelca ? 'la resultante sale de la platea' : `σ ${nf(c.sMax, 2)} / ${nf(c.sMin, 2)} kg/cm², e = ${nf(c.e, 2)} m${c.parcial ? ` > b/6 = ${nf(c.nucleo, 2)} m (contacto parcial en ${nf(c.contacto, 2)} m)` : ''}`}`).join(' · ') + `. G = ${nf(su.G, 0)} t, L = ${nf(su.Lt, 0)} t, M del viento en la fundación = ${nf(d.Mw, 0)} tm.` });
  }
  // deriva de servicio: la deformada con el viento de servicio (Wa), contra h/límite y entrepiso/límite
  const lim = datos201De(p).limiteDeriva;
  const zPB = p.niveles.reduce((z, n) => (n.cota >= 0 ? n.cota : z), 0);
  const E = moduloHormigon(p.hormigon || 'H30');
  for (const dir of ['A', 'B'] as const) {
    // la torre como ménsula empotrada en PB con el momento del 102-25 en cada nivel y el ΣJ de la dirección
    const d102 = w[dir];
    const alt = [{ nivel: 'PB', z: 0, M: d102.MPB }, ...d102.niveles.map(n => ({ nivel: n.nivel, z: n.z, M: n.M }))] as unknown as PuntoAltura[];
    const J = SJ?.[dir] ?? rigidez(valores, p.hormigon || 'H30').find(x => x.dir === dir)!.J;
    const W = d102.QPB;
    const fem = derivaFem?.[dir], ex = exo?.[dir];
    const def = ex
      ? { puntos: ex.z.map((z, i) => ({ z, d: i === 0 ? 0 : ex.r.u[i - 1], nivel: p.niveles.find(n => Math.abs(n.cota - zPB - z) < 1e-6)?.nombre ?? 'PB' })), dTop: ex.r.u[ex.r.u.length - 1], h: ex.h }
      : fem
      ? { puntos: fem.z.map((z, i) => ({ z, d: fem.d[i] / w.servicio.relacion, nivel: p.niveles.find(n => Math.abs(n.cota - zPB - z) < 1e-6)?.nombre ?? 'PB' })), dTop: fem.d[fem.d.length - 1] / w.servicio.relacion, h: fem.h }
      : deformada(alt, W, E, J);
    const f = w.servicio.relacion;
    const pts = [...def.puntos].sort((a, b) => a.z - b.z);
    let peorPiso = 0, dondePiso = '';
    for (let i = 1; i < pts.length; i++) { const dz = pts[i].z - pts[i - 1].z; if (dz > 0) { const r = ((pts[i].d - pts[i - 1].d) * f) / dz; if (r > peorPiso) { peorPiso = r; dondePiso = pts[i].nivel; } } }
    const top = def.dTop * f;
    out.push({ grupo: 'Rigidez', nombre: `Deriva de servicio, viento ${dir}`, criterio: `azotea ≤ h/${lim} y cada piso ≤ entrepiso/${lim}`, fuente: `CIRSOC 102-25, comentario C B.4.2 (orientativo: 1/600 a 1/400)${exo ? '; torre con el exoesqueleto' : fem ? '; desplazamientos del modelo FEM, borde más desfavorable' : ''}`,
      planilla: null, guia: top, unidad: 'm', estado: est(top <= def.h / lim && peorPiso <= 1 / lim),
      nota: `Viento de servicio de ${w.servicio.recurrencia} años (${nf(f * 100, 0)} % de la presión de cálculo). Azotea ${nf(top * 1000, 1)} mm (límite ${nf((def.h / lim) * 1000, 1)} mm); peor piso ${dondePiso}: 1/${peorPiso > 0 ? Math.round(1 / peorPiso) : '∞'}.` });
  }
  // dinteles por resistencia (201-2005, cap. 11): el resbalamiento de la guía, t = Qj·S/J, por la altura del piso, con el
  // corte de la pieza en el peor caso de carga y 1,0 W
  const iPBd = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const hPiso = iPBd > 0 ? p.niveles[iPBd - 1].cota - p.niveles[iPBd].cota : 0;
  const fcD = fcDe(p.hormigon || 'H30');
  for (const v of verif) {
    const ids = new Set(v.muros.map(x => x.id));
    const ms = p.muros.filter(m => ids.has(m.id));
    const conAb = ms.filter(m => tipoDe(m) === 'tabique' && m.aberturas?.length && (m.dir === 'Y') === (v.dir === 'A'));
    if (!conAb.length || !(hPiso > 0)) continue;
    const Vp = Math.max(0, ...v.Vcasos);
    const Jp = ms.filter(m => (m.dir === 'Y') === (v.dir === 'A')).reduce((x, m) => x + (m.espesor * m.largo ** 3) / 12, 0) || 1;
    conAb.forEach(m => m.aberturas!.forEach((ab, k) => {
      const Jm = (m.espesor * m.largo ** 3) / 12;
      const t = (Vp * (Jm / Jp) * estaticoCorte(m.espesor, m.largo, ab.s)) / Jm;          // t/m
      const hd = hPiso - (ab.desde + ab.alto);
      const cd = corteDintel201(t * hPiso, m.espesor, hd, ab.ancho, fcD);
      out.push({ grupo: `CIRSOC 201, viento ${v.dir}`, nombre: `${m.id}${m.aberturas!.length > 1 ? ` · abertura ${k + 1}` : ''}: dintel en PB`, criterio: "Vu ≤ φ·Vn, con Vn ≤ ⅚ √f'c b d (estribos para lo que no toma el hormigón)", fuente: 'CIRSOC 201-2005, 11.1, 11.3 y 11.5',
        planilla: null, guia: cd.phiVnMax > 0 ? cd.Vu / cd.phiVnMax : Infinity, unidad: 'Vu/φVn,máx', estado: est(cd.verifica),
        nota: `${hd > 0 ? `Vu = ${nf(cd.Vu, 2)} t (t = ${nf(t, 2)} t/m × ${nf(hPiso, 2)} m) · dintel ${nf(hd, 2)} × ${nf(m.espesor, 2)} m, d = ${nf(cd.d, 2)} m · φVc = ${nf(cd.phiVc, 2)} t · estribos ${cd.Avs > 0 ? `${nf(cd.Avs, 2)} cm²/m${cd.AvsNec > cd.AvsMin ? ' (por corte)' : ' (mínimos, 11-13)'}` : 'no hacen falta por corte'}${cd.granAltura ? ` · luz/alto = ${nf(ab.ancho / hd, 2)} < 4: viga de gran altura (11.8), con armadura en las dos direcciones` : ''}.` : 'La abertura llega al piso de arriba: no hay dintel.'}` });
    }));
  }
  // durabilidad: el f'c mínimo de la clase de exposición (CIRSOC 200-24, Tabla 2.5)
  const d2 = datos201De(p), cl = CLASES_EXPOSICION[d2.exposicion], fcP = fcDe(p.hormigon || 'H30');
  out.push({ grupo: 'Hormigón', nombre: `f'c mínimo de la clase de exposición ${d2.exposicion}`, criterio: `f'c ≥ ${cl.fcMin} MPa (y a/c ≤ ${String(cl.acMax).replace('.', ',')})`, fuente: 'CIRSOC 200-24, Tabla 2.5',
    planilla: null, guia: fcP, unidad: 'MPa', estado: est(fcP >= cl.fcMin), nota: `${cl.texto}. Recubrimiento nominal ${recubrimientoMm(d2)} mm (Tabla 8.3 + Δr).` });
  // hormigón: CIRSOC 201, pieza por pieza
  for (const v of verif) {
    const grupo = `CIRSOC 201, viento ${v.dir}`;
    if (nivel === 'completa') {
      const peor = v.muros.reduce((a, x) => (x.relacion > a.relacion ? x : a), v.muros[0]);
      if (!peor) continue;
      out.push({ grupo, nombre: `${v.nombre}: flexocompresión (diagrama de interacción)`, criterio: 'Mu ≤ φMn con la cuantía mínima; si no, la necesaria', fuente: 'CIRSOC 201, 10.2, 10.3, 14.3',
        planilla: null, guia: peor.relacion, unidad: 'uso con ρ mín', estado: v.muros.every(x => x.rhoNecesaria < 0.04) ? (peor.relacion <= 1 ? 'verifica' : 'atención') : 'no verifica',
        nota: v.muros.map(x => `${x.id} (${x.papel}): ρ ${x.rhoNecesaria > x.rhoMin ? `necesaria ${pc(x.rhoNecesaria)} (mínima ${pc(x.rhoMin)})` : `mínima ${pc(x.rhoMin)} alcanza`} → ${x.armado}; peor: ${x.peor.combinacion}`).join(' · ') });
    } else {
      const ok = v.muros.every(x => x.NuMax <= x.axialEmp && x.cordon.C <= x.cordon.Cadm);
      out.push({ grupo, nombre: `${v.nombre}: compresión y cordones (simple)`, criterio: 'Nu ≤ φPn (14.5) y C ≤ 0,65·0,85 f\'c·A cordón', fuente: 'CIRSOC 201, 14.5; cordones de borde',
        planilla: null, guia: Math.max(...v.muros.map(x => Math.max(x.NuMax / x.axialEmp, x.cordon.C / x.cordon.Cadm))), unidad: 'uso', estado: est(ok),
        nota: v.muros.map(x => `${x.id}: Nu ${nf(x.NuMax, 0)} ≤ ${nf(x.axialEmp, 0)} t; T borde ${nf(Math.max(0, x.cordon.T), 1)} t → As ${nf(x.cordon.AsBorde, 1)} cm² por borde`).join(' · ') });
    }
    const pc2 = v.muros.filter(x => x.papel === 'alma');
    if (pc2.length) out.push({ grupo, nombre: `${v.nombre}: corte en el plano`, criterio: 'Vu ≤ φVn = 0,75 (Vc + Vs) ≤ 0,75 · 5/6 √f\'c h d', fuente: 'CIRSOC 201, 11.10',
      planilla: null, guia: Math.max(...pc2.map(x => (x.corte.phiVn > 0 ? x.corte.Vu / x.corte.phiVn : Infinity))), unidad: 'Vu/φVn', estado: est(pc2.every(x => x.corte.verifica)),
      nota: pc2.map(x => `${x.id}: Vu ${nf(x.corte.Vu, 1)} t, φVn ${nf(x.corte.phiVn, 1)} t (φVc ${nf(x.corte.phiVc, 1)} t), horizontal ρ = ${pc(x.rhoH)}${x.corte.necesitaArmaduraCorte ? ' (Vu > φVc/2: ρ ≥ 0,25 %)' : ''}`).join(' · ') });
  }
  return out;
}
