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
import type { Proyecto, Muro } from '../modelo';
import type { PiezaEquivalente } from '../mapping';
import type { RotoGuia } from '../correcciones';
import { datosAlturaDe, partesDePieza, verificarPieza } from '../flexocompresion';
import { fcDe, verificarMuro201, type Solicitacion, type VerifMuro201 } from '../verificacion/cirsoc201';
import { armarTabique, textoBarras } from './guia';
import { combinaciones, datos101De, sobrecarga } from '../cargas/cirsoc101';
import type { Control } from '../verificaciones';
import type { PlanillaRes } from '../planilla';
import { datosAltura, deformada, moduloHormigon, rigidez } from '../diagramas';
import type { NivelVerificacion } from './tipos';

/** los datos de la planilla con la hoja de viento traducida al 102-25 */
export function datosCirsoc(d: PlanillaDatos, w: Viento102): PlanillaDatos {
  const e = EXPOSICIONES[w.exposicion];
  const I = w.Ke * (2.41 / 2.01) * (10 / KN_POR_T);
  return { ...d, viento: { ...d.viento, V: w.V, Kd: w.Kd, I, zg: e.zg, alfa: e.alfa, Kzt: w.Kzt, G: w.A.Gusado, Cpb: 0.8, Cps: w.A.Cps, GCpi: w.GCpi } };
}

// ---------------------------------------------------------------------------------------------------- verificación 201

export type Recubrimiento = 'interior' | 'exterior';
export type ExposicionHormigon = 'A1-A2' | 'A3-Q1-C1' | 'marina-agresiva';
export interface DatosCirsoc201 {
  /** Tabla 7.7.1: tabique no expuesto (20 mm) o en contacto con el aire libre o el suelo (30 mm) */
  recubrimiento?: Recubrimiento;
  /** clase de exposición (Tabla 2.1): A1/A2 sin aumento, A3/Q1/C1 +30 %, CL/M/C2/Q2/Q3 +50 % (costa, agresivos) */
  exposicion?: ExposicionHormigon;
  /** recubrimiento escrito a mano (mm), en lugar de la tabla */
  recManual?: number | null;
  /** límite de deriva de servicio: 400, 500 (como la guía) o 600 → h/límite */
  limiteDeriva?: 400 | 500 | 600;
}
export const DATOS_201_POR_DEFECTO: Required<DatosCirsoc201> = { recubrimiento: 'interior', exposicion: 'A1-A2', recManual: null, limiteDeriva: 500 };
export const datos201De = (p: { cirsoc201?: DatosCirsoc201 | null }): Required<DatosCirsoc201> => ({ ...DATOS_201_POR_DEFECTO, ...(p.cirsoc201 ?? {}) });
/** recubrimiento en mm (Tabla 7.7.1 con el aumento por exposición, o el escrito a mano) */
export function recubrimientoMm(d: DatosCirsoc201): number {
  const x = { ...DATOS_201_POR_DEFECTO, ...d };
  if (x.recManual && x.recManual > 0) return x.recManual;
  const base = x.recubrimiento === 'exterior' ? 30 : 20;
  return Math.round(base * (x.exposicion === 'A3-Q1-C1' ? 1.3 : x.exposicion === 'marina-agresiva' ? 1.5 : 1));
}

export interface VerifPieza201 {
  nombre: string; dir: 'A' | 'B';
  /** parte del viento de la dirección que toma la pieza en cada caso de carga (1 = todo) */
  partes: number[];
  M: number; V: number;
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
    return { nombre: pz.nombre, dir, partes: frac, M: frac[0] * MPB, V: frac[0] * QPB, muros: out, verifica: out.every(x => x.verifica) };
  });
}

// ---------------------------------------------------------------------------------------------------- controles

const nf = (x: number, d: number) => x.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pc = (x: number) => `${nf(x * 100, 2)} %`;

/**
 * Los controles del método CIRSOC: reemplazan a los de la guía donde el reglamento dice otra cosa (vuelco con
 * 0,9 D + 1,0 W, frecuencia y carga mínima del 102-25, deriva de servicio, hormigón por resistencia del 201).
 */
export function controlesCirsoc(p: Proyecto, base: Control[], valores: PlanillaRes, w: Viento102, verif: VerifPieza201[], filaNivel: number[], nivel: NivelVerificacion,
  /** método FEM: la deformada de servicio del modelo (ya escalada al viento de servicio), en lugar de la ménsula equivalente */
  derivaFem?: Record<'A' | 'B', { z: number[]; d: number[]; h: number }>): Control[] {
  const fuera = (c: Control) => /^Flexocompresión|^Corte en dinteles/.test(c.grupo) || /^Frecuencia|^Carga mínima|^Vuelco|^Flecha de la ménsula/.test(c.nombre);
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
  // vuelco: la resistencia (0,9 D) iguala o supera al efecto (1,0 W): 0,9 · Me ≥ Mv ⇔ Me / Mv ≥ 1,11
  const m = valores.mnyq;
  out.push({ grupo: 'Estabilidad', nombre: 'Vuelco con 0,9 D + 1,0 W', criterio: '0,9 · Me ≥ 1,0 · Mv (Me / Mv ≥ 1,11)', fuente: 'CIRSOC 101-25, art. 1.3.5 y 2.3.2',
    planilla: null, guia: m.L99, unidad: '', estado: est(0.9 * m.L99 >= 1) });
  // deriva de servicio: la deformada con el viento de servicio (Wa), contra h/límite y entrepiso/límite
  const lim = datos201De(p).limiteDeriva;
  const zPB = p.niveles.reduce((z, n) => (n.cota >= 0 ? n.cota : z), 0);
  const E = moduloHormigon(p.hormigon || 'H30');
  for (const dir of ['A', 'B'] as const) {
    const alt = datosAltura(p, valores.viento, valores.mnyq, filaNivel, dir);
    const J = rigidez(valores, p.hormigon || 'H30').find(x => x.dir === dir)!.J;
    const W = alt.reduce((s, x) => s + x.F, 0);
    const fem = derivaFem?.[dir];
    const def = fem
      ? { puntos: fem.z.map((z, i) => ({ z, d: fem.d[i] / w.servicio.relacion, nivel: p.niveles.find(n => Math.abs(n.cota - zPB - z) < 1e-6)?.nombre ?? 'PB' })), dTop: fem.d[fem.d.length - 1] / w.servicio.relacion, h: fem.h }
      : deformada(alt, W, E, J);
    const f = w.servicio.relacion;
    const pts = [...def.puntos].sort((a, b) => a.z - b.z);
    let peorPiso = 0, dondePiso = '';
    for (let i = 1; i < pts.length; i++) { const dz = pts[i].z - pts[i - 1].z; if (dz > 0) { const r = ((pts[i].d - pts[i - 1].d) * f) / dz; if (r > peorPiso) { peorPiso = r; dondePiso = pts[i].nivel; } } }
    const top = def.dTop * f;
    out.push({ grupo: 'Rigidez', nombre: `Deriva de servicio, viento ${dir}`, criterio: `azotea ≤ h/${lim} y cada piso ≤ entrepiso/${lim}`, fuente: `CIRSOC 102-25, comentario C B.4.2 (orientativo: 1/600 a 1/400)${fem ? '; desplazamientos del modelo FEM, borde más desfavorable' : ''}`,
      planilla: null, guia: top, unidad: 'm', estado: est(top <= def.h / lim && peorPiso <= 1 / lim),
      nota: `Viento de servicio de ${w.servicio.recurrencia} años (${nf(f * 100, 0)} % de la presión de cálculo). Azotea ${nf(top * 1000, 1)} mm (límite ${nf((def.h / lim) * 1000, 1)} mm); peor piso ${dondePiso}: 1/${peorPiso > 0 ? Math.round(1 / peorPiso) : '∞'}.` });
  }
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
