/**
 * Los controles del cálculo, con su criterio y su fuente, a partir de los resultados de la planilla
 * (valor «planilla») y de los corregidos (valor «guía / CIRSOC»).
 */
import { TIPO_FILA_PARALELOS, type PlanillaDatos, type PlanillaRes } from './planilla';
import type { ResultadoCorregido } from './correcciones';
import type { Proyecto } from './modelo';
import type { PiezaEquivalente } from './mapping';
import { calcFunicular } from './funicular';

export type Estado = 'verifica' | 'no verifica' | 'atención' | 'informativo';
export interface Control {
  grupo: string; nombre: string; criterio: string; fuente: string;
  planilla: number | null; guia: number | null; unidad: string; estado: Estado; nota?: string;
}

export const TENSION_ADM = (hormigon: string) => (parseFloat(hormigon.replace(/[^\d.]/g, '')) || 30) * 10; // H30 → 300 kg/cm²

export function controles(p: Proyecto, d: PlanillaDatos, r: PlanillaRes, c: ResultadoCorregido, hormigon: string, piezas: PiezaEquivalente[] = [], filaNivel: number[] = []): Control[] {
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
  // verificación funicular (guía 2.2): la resultante de W y G corta la base en el tercio medio; y la línea de presiones
  if (filaNivel.length) {
    for (const dir of ['A', 'B'] as const) {
      const fp = calcFunicular(p, m, filaNivel, dir), fg = calcFunicular(p, g, filaNivel, dir);
      out.push({ grupo: 'Funicular', nombre: `Resultante W + G en el tercio medio, viento ${dir}`, criterio: `|e| ≤ b/6 = ${fg.tercio.toFixed(2)} m`, fuente: 'guía 2.2',
        planilla: fp.e, guia: fg.e, unidad: 'm', estado: est(fp.verifica && fg.verifica), nota: dir === 'B' ? 'La planilla no verifica el viento B; la app lo calcula con la cara menor (M,NyQ N y O) y a1.' : undefined });
      const fuera = fg.puntos.filter(x => !x.dentro);
      out.push({ grupo: 'Funicular', nombre: `Línea de presiones dentro del núcleo central, viento ${dir}`, criterio: 'en cada nivel |e| ≤ lado / 6', fuente: 'referencia (planta no maciza)',
        planilla: null, guia: fuera.length, unidad: 'niveles fuera', estado: fuera.length ? 'atención' : 'verifica', nota: fuera.length ? `Fuera: ${fuera.map(x => x.nivel).join(', ')}.` : undefined });
    }
  }
  const k500 = r.jminA.tabla[0].h500;
  out.push({ grupo: 'Rigidez', nombre: 'ΣJ viento A ≥ J mínimo (h/500, H30)', criterio: 'ΣJ ≥ J mín', fuente: 'guía 4.2 · J paralelos M37', planilla: r.jpar.AY24, guia: c.guia.jpar.AY24, unidad: 'm⁴', estado: est(r.jpar.AY24 >= k500), nota: `J mín = ${k500.toFixed(1)} m⁴` });
  const k500b = r.jminB.tabla[0].h500;
  out.push({ grupo: 'Rigidez', nombre: 'ΣJ viento B ≥ J mínimo (h/500, H30)', criterio: 'ΣJ ≥ J mín', fuente: 'J ortogonales M37', planilla: r.jort.AY24, guia: c.guia.jort.AY24, unidad: 'm⁴', estado: est(r.jort.AY24 >= k500b), nota: `J mín = ${k500b.toFixed(1)} m⁴` });
  out.push({ grupo: 'Reparto', nombre: 'Control Σ J·a = 0 (cara mayor)', criterio: '= 0', fuente: 'Rototrasl. L25', planilla: r.rotA.L25, guia: null, unidad: '', estado: est(Math.abs(r.rotA.L25) < 1e-6 || !isFinite(r.rotA.L25)) });
  out.push({ grupo: 'Reparto', nombre: 'Torsión de la Figura 9, caso 2 (cara mayor)', criterio: 'h > 20 m: el CIRSOC pide considerarla', fuente: 'CIRSOC 102, art. 5.12.3', planilla: null, guia: r.rotA.D5 * BPB / 32, unidad: 'tm', estado: h > 20 ? 'atención' : 'informativo', nota: 'La planilla y la guía no la usan. Pregunta abierta para la cátedra.' });
  const adm = TENSION_ADM(hormigon);
  // flexocompresión: la planilla usa el módulo que fija cada fila, el área O (0 en las filas 18–20) y no suma el peso
  // propio de las piezas 10–17 (D13:D20 = 0,01). La columna «Guía/CIRSOC» usa el módulo del molde de cada pieza,
  // su área real y su peso propio.
  r.jpar.filas.forEach((_f, i) => {
    const df = d.flex[i];
    if (df?.C == null) return;
    const fl = r.flex;
    const pz = piezas.find(x => x.dir === 'A' && x.filaHoja === i);
    if (piezas.length && !pz) return;
    const jg = c.guia.jpar.filas[i];
    const W = !pz ? fl.W[i] : pz.molde === 'asimétrico' ? jg.AN : pz.molde === 'tubo' ? jg.V : jg.Q;
    const A = pz ? pz.area : fl.B[i];
    const peso = A * (df.C ?? 0) * 2.4;
    const Hn = peso + (df.F ?? 0) * (df.G ?? 0) * 0.7, In = peso + (df.F ?? 0) * (df.G ?? 0) * 0.9;
    const Mcorr = Math.abs(c.rotA[i].Mtot);
    const trac = (-Hn / A + Mcorr / W) * 0.1, comp = (-In / A - Mcorr / W) * 0.1;
    const quien = pz ? `${pz.nombre} (fila ${i + 1}, ${pz.molde})` : `Pieza ${i + 1}`;
    const difiere = pz && TIPO_FILA_PARALELOS[i] !== (pz.molde === 'asimétrico' ? 'asimétrica' : pz.molde === 'tubo' ? 'circular' : 'simétrica');
    const notaFila = difiere ? 'La planilla lee otro módulo en esta fila: su valor no vale para esta pieza.' : undefined;
    out.push({ grupo: 'Flexocompresión', nombre: `${quien}: tracción`, criterio: 'σ ≤ 0; si no, lleva armadura', fuente: 'guía 5', planilla: fl.P[i], guia: trac, unidad: 'kg/cm²', estado: trac > 0 ? 'atención' : 'verifica', nota: [trac > 0 ? 'Lleva armadura.' : '', notaFila ?? ''].filter(Boolean).join(' ') || undefined });
    out.push({ grupo: 'Flexocompresión', nombre: `${quien}: compresión máxima`, criterio: `|σ| ≤ ${adm} kg/cm² (${hormigon})`, fuente: 'guía 5', planilla: fl.O[i], guia: comp, unidad: 'kg/cm²', estado: est(Math.abs(comp) <= adm) });
  });
  return out;
}
