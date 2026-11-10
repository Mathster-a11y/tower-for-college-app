/**
 * Los controles del cálculo, con su criterio y su fuente, a partir de los resultados de la planilla
 * (valor «planilla») y de los corregidos (valor «guía / CIRSOC»).
 */
import { TIPO_FILA_PARALELOS, type PlanillaDatos, type PlanillaRes } from './planilla';
import type { ResultadoCorregido } from './correcciones';
import type { Proyecto } from './modelo';

export type Estado = 'verifica' | 'no verifica' | 'atención' | 'informativo';
export interface Control {
  grupo: string; nombre: string; criterio: string; fuente: string;
  planilla: number | null; guia: number | null; unidad: string; estado: Estado; nota?: string;
}

export const TENSION_ADM = (hormigon: string) => (parseFloat(hormigon.replace(/[^\d.]/g, '')) || 30) * 10; // H30 → 300 kg/cm²

export function controles(p: Proyecto, d: PlanillaDatos, r: PlanillaRes, c: ResultadoCorregido, hormigon: string): Control[] {
  const out: Control[] = [];
  const m = r.mnyq, g = c.guia.mnyq;
  const est = (ok: boolean) => (ok ? 'verifica' : 'no verifica') as Estado;
  // período (CIRSOC Anexo III, guía 2.1.5)
  const niv = p.niveles;
  const iPB = niv.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const h = iPB >= 0 ? niv[0].cota - niv[iPB].cota : 0;
  const BPB = niv.slice(0, iPB + 1).reduce<number | null>((v, n) => n.B ?? v, null) ?? 0;
  const LPB = niv.slice(0, iPB + 1).reduce<number | null>((v, n) => n.L ?? v, null) ?? 0;
  for (const [dir, L] of [['A', LPB], ['B', BPB]] as const) {
    const T = L > 0 && h > 0 ? 0.08 * (h / Math.sqrt(L)) * Math.sqrt(h / (L + h)) : NaN;
    out.push({ grupo: 'Viento', nombre: `Frecuencia F = 1/T, viento ${dir}`, criterio: 'F ≥ 1 Hz: edificio rígido (G = 0,85)', fuente: 'CIRSOC 102, art. 5.8 y Anexo III',
      planilla: 1 / T, guia: 1 / T, unidad: 'Hz', estado: 1 / T >= 1 ? 'verifica' : 'atención', nota: 1 / T >= 1 ? undefined : 'Flexible: el CIRSOC pide Gf (art. 5.8.2); la guía sigue con 0,85. Pregunta abierta para la cátedra.' });
  }
  const minimo = 0.051 * BPB * h;
  out.push({ grupo: 'Viento', nombre: 'Carga mínima', criterio: 'W ≥ 0,50 kN/m² · B · h', fuente: 'CIRSOC 102, art. 1.4.1', planilla: m.H61, guia: g.H61, unidad: 't', estado: est(g.H61 >= minimo), nota: `mínimo ${minimo.toFixed(1)} t` });
  out.push({ grupo: 'Estabilidad', nombre: 'Vuelco Me / Mv', criterio: '≥ 1,5', fuente: 'guía 2.2 · M,NyQ L99', planilla: m.L99, guia: g.L99, unidad: '', estado: est(m.L99 >= 1.5 && g.L99 >= 1.5) });
  out.push({ grupo: 'Estabilidad', nombre: 'Excentricidad e = Mv / P', criterio: "e ≤ b'/6", fuente: 'guía 2.2 · M,NyQ M99', planilla: m.M99, guia: g.M99, unidad: 'm', estado: est(m.M99 <= m.N99 && g.M99 <= g.N99), nota: `b'/6 = ${m.N99.toFixed(2)} m` });
  out.push({ grupo: 'Estabilidad', nombre: 'Tensión máxima en el suelo', criterio: '|σ| ≤ σ adm (dato del estudio de suelos)', fuente: 'guía 2.3 · M,NyQ N89', planilla: m.N89, guia: g.N89, unidad: 'kg/cm²', estado: 'informativo' });
  out.push({ grupo: 'Estabilidad', nombre: 'Tensión mínima en el suelo', criterio: '≤ 0 (sin tracción)', fuente: 'M,NyQ N90', planilla: m.N90, guia: g.N90, unidad: 'kg/cm²', estado: est(m.N90 <= 0 && g.N90 <= 0) });
  const k500 = r.jminA.tabla[0].h500;
  out.push({ grupo: 'Rigidez', nombre: 'ΣJ viento A ≥ J mínimo (h/500, H30)', criterio: 'ΣJ ≥ J mín', fuente: 'guía 4.2 · J paralelos M37', planilla: r.jpar.AY24, guia: c.guia.jpar.AY24, unidad: 'm⁴', estado: est(r.jpar.AY24 >= k500), nota: `J mín = ${k500.toFixed(1)} m⁴` });
  const k500b = r.jminB.tabla[0].h500;
  out.push({ grupo: 'Rigidez', nombre: 'ΣJ viento B ≥ J mínimo (h/500, H30)', criterio: 'ΣJ ≥ J mín', fuente: 'J ortogonales M37', planilla: r.jort.AY24, guia: c.guia.jort.AY24, unidad: 'm⁴', estado: est(r.jort.AY24 >= k500b), nota: `J mín = ${k500b.toFixed(1)} m⁴` });
  out.push({ grupo: 'Reparto', nombre: 'Control Σ J·a = 0 (cara mayor)', criterio: '= 0', fuente: 'Rototrasl. L25', planilla: r.rotA.L25, guia: null, unidad: '', estado: est(Math.abs(r.rotA.L25) < 1e-6 || !isFinite(r.rotA.L25)) });
  out.push({ grupo: 'Reparto', nombre: 'Torsión de la Figura 9, caso 2 (cara mayor)', criterio: 'h > 20 m: el CIRSOC pide considerarla', fuente: 'CIRSOC 102, art. 5.12.3', planilla: null, guia: r.rotA.D5 * BPB / 32, unidad: 'tm', estado: h > 20 ? 'atención' : 'informativo', nota: 'La planilla y la guía no la usan. Pregunta abierta para la cátedra.' });
  const adm = TENSION_ADM(hormigon);
  r.jpar.filas.forEach((_f, i) => {
    if (d.flex[i]?.C == null) return;
    const fl = r.flex;
    const W = fl.W[i], A = fl.B[i];
    const Mcorr = Math.abs(c.rotA[i].Mtot);
    const trac = ((-fl.H[i] / A + Mcorr / W) * 0.1), comp = ((-fl.I[i] / A - Mcorr / W) * 0.1);
    out.push({ grupo: 'Flexocompresión', nombre: `Pieza ${i + 1} (${TIPO_FILA_PARALELOS[i]}): tracción`, criterio: 'σ ≤ 0; si no, lleva armadura', fuente: 'guía 5', planilla: fl.P[i], guia: trac, unidad: 'kg/cm²', estado: trac > 0 ? 'atención' : 'verifica', nota: trac > 0 ? 'lleva armadura' : undefined });
    out.push({ grupo: 'Flexocompresión', nombre: `Pieza ${i + 1}: compresión máxima`, criterio: `|σ| ≤ ${adm} kg/cm² (${hormigon})`, fuente: 'guía 5', planilla: fl.O[i], guia: comp, unidad: 'kg/cm²', estado: est(Math.abs(comp) <= adm && (!isFinite(fl.O[i]) || Math.abs(fl.O[i]) <= adm)) });
  });
  return out;
}
