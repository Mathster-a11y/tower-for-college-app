/**
 * Método «Combinado» (plan de trabajo, etapa 7): no tiene reglas propias. Corre los cuatro métodos con la misma torre
 * (Planilla virgen, Guía, CIRSOC y FEM, cada uno con sus reglas) y los compara en una tabla, con la diferencia de cada
 * uno contra la planilla de la cátedra y la «capa» de la que sale la diferencia:
 *  - cargas: el viento (102-2005 de la planilla y la guía contra 102-25, con la frecuencia aproximada o la del modelo);
 *  - estabilidad: vuelco y excentricidad (con 1,5 de la guía o con 0,9 D + 1,0 W del 101-25);
 *  - rigidez: ΣJ y desplazamiento de la azotea;
 *  - reparto: la parte del viento que toma cada pieza (rototraslación de la planilla, muro por muro de la guía, modelo);
 *  - verificación: el uso del hormigón de cada pieza (tensiones admisibles o resistencia del 201).
 */
import type { Calculo } from '../../ui/estado';
import type { Proyecto } from '../modelo';
import type { Estado } from '../verificaciones';
import { configDe, type ConfigCalculo } from './tipos';
import { vuelco102 } from './cirsoc';
import { TENSION_ADM } from '../verificaciones';

export type MetodoComparado = 'planilla' | 'guia' | 'cirsoc' | 'fem';
export const METODOS_COMPARADOS: MetodoComparado[] = ['planilla', 'guia', 'cirsoc', 'fem'];
export type Capa = 'cargas' | 'estabilidad' | 'rigidez' | 'reparto' | 'verificación';
export const CAPAS: Record<Capa, string> = {
  cargas: 'Viento: 102-2005 (planilla y guía; la guía con Kz ≥ 5 m y sin viento en PB) contra 102-25 (V por categoría, Kz con 2,41, G o Gf según la frecuencia: aproximada en CIRSOC, del modelo en FEM)',
  estabilidad: 'Vuelco con Me/Mv ≥ 1,5 (planilla y guía) o con 0,9 D + 1,0 W (CIRSOC y FEM), con las fuerzas de cada viento',
  rigidez: 'ΣJ del molde de la hoja (planilla) o de la sección real (guía, CIRSOC, FEM); flecha con el viento de cálculo (guía) o deriva con el de servicio (CIRSOC, FEM)',
  reparto: 'Rototraslación de la planilla (piezas perpendiculares enteras), de la guía (muro por muro) o del modelo (piso por piso, con el corte de las almas en Timoshenko)',
  'verificación': 'Tensiones σ = −N/F ± M/W contra σbk (planilla y guía) o resistencia del 201 con las combinaciones del 101-25 (CIRSOC y FEM)',
};
export interface FilaComparacion {
  capa: Capa; nombre: string; unidad: string;
  valores: Record<MetodoComparado, number | null>;
  estados?: Record<MetodoComparado, Estado | null>;
  nota?: string;
}
export interface Comparacion {
  configs: Record<MetodoComparado, ConfigCalculo>;
  filas: FilaComparacion[];
  /** controles de cada método: cuántos se calcularon, cuántos no verifican y cuántos piden atención */
  resumen: Record<MetodoComparado, { calculados: number; noVerifican: number; atencion: number }>;
}

/** diferencia en % contra la planilla (null si no se puede) */
export const diferencia = (f: FilaComparacion, m: MetodoComparado): number | null => {
  const a = f.valores.planilla, b = f.valores[m];
  return a === null || b === null || !isFinite(a) || !isFinite(b) || Math.abs(a) < 1e-12 ? null : ((b - a) / Math.abs(a)) * 100;
};

export function compararMetodos(p: Proyecto, calcular: (p: Proyecto) => Calculo): Comparacion {
  const base = configDe(p);
  const configs = Object.fromEntries(METODOS_COMPARADOS.map(m => [m, { ...base, metodo: m }])) as Record<MetodoComparado, ConfigCalculo>;
  const calc = Object.fromEntries(METODOS_COMPARADOS.map(m => [m, calcular({ ...p, calculo: { ...(p.calculo ?? {}), ...configs[m] } })])) as Record<MetodoComparado, Calculo>;
  const filas: FilaComparacion[] = [];
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const fila = (capa: Capa, nombre: string, unidad: string, f: (m: MetodoComparado, c: Calculo) => number | null | undefined, estado?: (m: MetodoComparado, c: Calculo) => Estado | null | undefined, nota?: string) => {
    const valores = Object.fromEntries(METODOS_COMPARADOS.map(m => { const v = f(m, calc[m]); return [m, v === undefined || v === null || !isFinite(v) ? null : v]; })) as Record<MetodoComparado, number | null>;
    const estados = estado ? Object.fromEntries(METODOS_COMPARADOS.map(m => [m, estado(m, calc[m]) ?? null])) as Record<MetodoComparado, Estado | null> : undefined;
    filas.push({ capa, nombre, unidad, valores, estados, nota });
  };
  const ctrl = (c: Calculo, inicio: string) => c.controles.find(x => x.nombre.startsWith(inicio));
  const fPB = (c: Calculo) => c.asig.filaNivel[iPB];
  const w = (m: MetodoComparado, c: Calculo) => (m === 'fem' ? c.fem?.viento : m === 'cirsoc' ? c.cirsoc?.viento : undefined);

  // ---------------------------------------------------------------- cargas
  for (const dir of ['A', 'B'] as const) {
    fila('cargas', `Frecuencia n1, viento ${dir}`, 'Hz', (m, c) => w(m, c)?.[dir].n1 ?? ctrl(c, `Frecuencia F = 1/T, viento ${dir}`)?.guia,
      (m, c) => ctrl(c, m === 'planilla' || m === 'guia' ? `Frecuencia F = 1/T, viento ${dir}` : `Frecuencia n1, viento ${dir}`)?.estado,
      'Planilla y guía: período del 102-2005 (la guía sigue con G = 0,85 igual); CIRSOC: 1.9-5; FEM: análisis modal.');
    fila('cargas', `G (factor de ráfaga), viento ${dir}`, '', (m, c) => w(m, c)?.[dir].Gusado ?? p.sitio.G);
    fila('cargas', `Corte del viento en PB, viento ${dir}`, 't', (m, c) => w(m, c)?.[dir].QPB ?? (dir === 'A' ? c.valores.mnyq.I[fPB(c)] : c.valores.mnyq.N[fPB(c)]));
    fila('cargas', `Momento del viento en PB, viento ${dir}`, 'tm', (m, c) => w(m, c)?.[dir].MPB ?? (dir === 'A' ? c.valores.mnyq.J[fPB(c)] : c.valores.mnyq.O[fPB(c)]));
  }
  // ---------------------------------------------------------------- estabilidad
  fila('estabilidad', 'Vuelco Me / Mv (viento A)', '', (m, c) => { const x = w(m, c); if (!x) return c.valores.mnyq.L99; const v = vuelco102(p, x); return v.Me / v.Mv; },
    (m, c) => ctrl(c, m === 'planilla' || m === 'guia' ? 'Vuelco Me / Mv' : 'Vuelco con 0,9 D + 1,0 W')?.estado, 'Planilla y guía: ≥ 1,5. CIRSOC y FEM: ≥ 1,11 (0,9 · Me ≥ Mv).');
  fila('estabilidad', 'Excentricidad e = Mv / P (viento A)', 'm', (_m, c) => c.valores.mnyq.M99, (_m, c) => ctrl(c, 'Excentricidad')?.estado);
  // ---------------------------------------------------------------- rigidez
  for (const dir of ['A', 'B'] as const) {
    fila('rigidez', `ΣJ, viento ${dir}`, 'm⁴', (m, c) => (m === 'planilla' ? (dir === 'A' ? c.res.jpar.AY24 : c.res.jort.AY24) : (dir === 'A' ? (c.cirsoc?.corr.rotoA ?? c.corr.rotoA) : (c.cirsoc?.corr.rotoB ?? c.corr.rotoB))?.SJ));
    fila('rigidez', `Flecha con el viento de cálculo (guía 4.2), viento ${dir}`, 'm', (m, c) => (m === 'guia' ? ctrl(c, `Flecha de la ménsula, viento ${dir}`)?.guia : null), (m, c) => (m === 'guia' ? ctrl(c, `Flecha de la ménsula, viento ${dir}`)?.estado : null));
    fila('rigidez', `Deriva de servicio en la azotea, viento ${dir}`, 'm', (m, c) => (m === 'cirsoc' || m === 'fem' ? ctrl(c, `Deriva de servicio, viento ${dir}`)?.guia : null), (m, c) => (m === 'cirsoc' || m === 'fem' ? ctrl(c, `Deriva de servicio, viento ${dir}`)?.estado : null));
  }
  // ---------------------------------------------------------------- reparto (caso 1)
  const piezas = calc.guia.asig.piezas.filter(pz => pz.filaHoja !== null);
  for (const pz of piezas) {
    fila('reparto', `${pz.nombre}: parte del viento ${pz.dir} (caso 1)`, '%', (m, c) => {
      if (m === 'fem') return c.fem?.reparto.find(x => x.dir === pz.dir && x.nombre === pz.nombre)?.fem;
      if (m === 'planilla') { const r = pz.dir === 'A' ? c.res.rotA : c.res.rotB; const i = c.asig.piezas.find(x => x.dir === pz.dir && x.nombre === pz.nombre)?.filaHoja; return i == null || !r.D5 ? null : ((r.E[i] + (isFinite(r.N[i]) ? r.N[i] : 0)) / r.D5) * 100; }
      const rg = pz.dir === 'A' ? (c.cirsoc?.corr.rotoA ?? c.corr.rotoA) : (c.cirsoc?.corr.rotoB ?? c.corr.rotoB);
      const el = rg?.paralelos.find(x => x.nombre === pz.nombre);
      return el && rg!.Q ? ((el.tras + el.rot) / rg!.Q) * 100 : null;
    });
  }
  // ---------------------------------------------------------------- verificación: uso del hormigón (≤ 1 verifica)
  for (const pz of piezas) {
    fila('verificación', `${pz.nombre} (viento ${pz.dir}): uso del hormigón`, '', (m, c) => {
      const adm = TENSION_ADM(p.hormigon || 'H30');
      if (m === 'planilla') {
        if (pz.dir !== 'A') return null;                                  // la planilla solo verifica el viento A
        const i = c.asig.piezas.find(x => x.dir === 'A' && x.nombre === pz.nombre)?.filaHoja;
        return i == null || !isFinite(c.res.flex.O[i]) ? null : Math.abs(Math.min(0, c.res.flex.O[i])) / adm;
      }
      if (m === 'guia') { const x = ctrl(c, `${pz.nombre}: compresión (cargado)`); return x?.guia == null ? null : Math.abs(Math.min(0, x.guia)) / adm; }
      const v = c.cirsoc?.verif.find(x => x.dir === pz.dir && x.nombre === pz.nombre);
      if (!v?.muros.length) return null;
      return configs[m].verificacion === 'completa' ? Math.max(...v.muros.map(x => x.relacion)) : Math.max(...v.muros.map(x => Math.max(x.NuMax / x.axialEmp, x.cordon.C / x.cordon.Cadm)));
    }, (m, c) => {
      if (m === 'planilla') return null;
      const g = m === 'guia' ? `Flexocompresión, viento ${pz.dir}` : `CIRSOC 201, viento ${pz.dir}`;
      const cs = c.controles.filter(x => x.grupo === g && x.nombre.startsWith(`${pz.nombre}:`) && !/corte/.test(x.nombre) && !/tracción/.test(x.nombre));
      return cs.some(x => x.estado === 'no verifica') ? 'no verifica' : cs.some(x => x.estado === 'atención') ? 'atención' : cs.length ? 'verifica' : null;
    }, 'Planilla y guía: |σ| de compresión / σbk. CIRSOC y FEM: la relación de uso del 201 (completa: con la cuantía mínima; simple: empírico y cordones).');
  }
  const resumen = Object.fromEntries(METODOS_COMPARADOS.map(m => {
    const cs = calc[m].controles;
    return [m, { calculados: cs.filter(x => x.estado !== 'informativo').length, noVerifican: cs.filter(x => x.estado === 'no verifica').length, atencion: cs.filter(x => x.estado === 'atención').length }];
  })) as Comparacion['resumen'];
  return { configs, filas, resumen };
}
