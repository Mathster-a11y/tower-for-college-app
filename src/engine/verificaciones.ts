/**
 * Los controles del cálculo, con su criterio y su fuente, a partir de los resultados de la planilla
 * (valor «planilla») y de los corregidos (valor «guía / CIRSOC»).
 */
import { TIPO_FILA_PARALELOS, type PlanillaDatos, type PlanillaRes } from './planilla';
import type { ResultadoCorregido } from './correcciones';
import type { Proyecto } from './modelo';
import type { PiezaEquivalente } from './mapping';
import { calcFunicular } from './funicular';
import { verificarDireccion } from './flexocompresion';
import { rigidez } from './diagramas';

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
  // J mínimo: la planilla compara con la fila H30 (M37); la guía, con la fila del hormigón del proyecto (h/500)
  const rg = rigidez(c.guia, hormigon);
  for (const dir of ['A', 'B'] as const) {
    const kPl = (dir === 'A' ? r.jminA : r.jminB).tabla[0].h500;
    const g2 = rg.find(x => x.dir === dir)!;
    out.push({ grupo: 'Rigidez', nombre: `ΣJ viento ${dir} ≥ J mínimo (h/500)`, criterio: 'ΣJ ≥ W·h² / (E/k)', fuente: `guía 4.2 · J ${dir === 'A' ? 'paralelos' : 'ortogonales'} M37`,
      planilla: dir === 'A' ? r.jpar.AY24 : r.jort.AY24, guia: g2.J, unidad: 'm⁴', estado: est(g2.J >= g2.minimos.h500),
      nota: `J mín = ${g2.minimos.h500.toFixed(1)} m⁴ (fila ${g2.hormigon})${g2.hormigon !== 'H30' ? `; la planilla compara con la fila H30: ${kPl.toFixed(1)} m⁴` : ''}` });
  }
  // Σ J·a = 0 siempre (Xr es el baricentro de los J); la celda L25 de la planilla suma solo las filas 5 a 19
  for (const [dir, rr, gg] of [['A', r.rotA, c.guia.rotA], ['B', r.rotB, c.guia.rotB]] as const) {
    const total = gg.L.slice(0, 20).reduce((x, y) => x + (isFinite(y) ? y : 0), 0);
    const escala = Math.max(1e-9, gg.L.slice(0, 20).reduce((x, y) => x + Math.abs(isFinite(y) ? y : 0), 0));
    const parcial = Math.abs(rr.L25 - total) > 1e-6 * escala;
    out.push({ grupo: 'Reparto', nombre: `Control Σ J·a = 0 (cara ${dir === 'A' ? 'mayor' : 'menor'})`, criterio: '= 0: el eje de inercia está bien calculado', fuente: `Rototrasl. cara ${dir === 'A' ? 'mayor' : 'menor'} L25`,
      planilla: rr.L25, guia: total, unidad: 'm⁵', estado: est(Math.abs(total) <= 1e-6 * escala), nota: parcial ? 'La celda L25 de la planilla suma solo las piezas 1 a 15: con piezas en las filas 16 a 20 no da 0, aunque el cálculo esté bien.' : undefined });
  }
  out.push({ grupo: 'Reparto', nombre: 'Torsión de la Figura 9, caso 2 (cara mayor)', criterio: 'h > 20 m: el CIRSOC pide considerarla', fuente: 'CIRSOC 102, art. 5.12.3', planilla: null, guia: r.rotA.D5 * BPB / 32, unidad: 'tm', estado: h > 20 ? 'atención' : 'informativo', nota: 'La planilla y la guía no la usan. Pregunta abierta para la cátedra.' });
  const adm = TENSION_ADM(hormigon);
  // flexocompresión (columna «Planilla»: la hoja Flex comp PB paralelos, una tensión por pieza).
  // Columna «Guía/CIRSOC»: muro por muro como la guía (sección 5), con el momento de cada pieza en PB.
  if (piezas.length && filaNivel.length) {
    for (const dir of ['A', 'B'] as const) {
      verificarDireccion(p, piezas, c, filaNivel, dir, adm).forEach(v => {
        const pz = piezas.find(x => x.nombre === v.nombre && x.dir === dir)!;
        const i = pz.filaHoja!;
        const enPlanilla = dir === 'A' && d.flex[i]?.C != null;
        const difiere = enPlanilla && TIPO_FILA_PARALELOS[i] !== (pz.molde === 'asimétrico' ? 'asimétrica' : pz.molde === 'tubo' ? 'circular' : 'simétrica');
        const peor = v.muros.reduce((m2, x) => (x.traccion > m2.traccion ? x : m2), v.muros[0]);
        const comp = v.muros.reduce((m2, x) => (x.compresion < m2.compresion ? x : m2), v.muros[0]);
        if (!peor) return;
        const As = Math.max(...v.muros.map(x => Math.max(x.As, x.AsMin)));
        out.push({ grupo: `Flexocompresión, viento ${dir}`, nombre: `${v.nombre}: tracción (descargado)`, criterio: 'σ ≤ 0; si no, armadura (T = σ·b·x/2)', fuente: 'guía 5',
          planilla: enPlanilla ? r.flex.P[i] : null, guia: peor.traccion, unidad: 'kg/cm²', estado: peor.traccion > 0 ? 'atención' : 'verifica',
          nota: [peor.traccion > 0 ? `Lleva armadura: muro ${peor.id}, As = ${peor.As.toFixed(1)} cm² (mínima ${peor.AsMin.toFixed(1)} cm²).` : '', difiere ? 'La planilla lee otro módulo en esta fila: su valor no vale para esta pieza.' : '', v.muros.length > 1 ? `Peor muro: ${peor.id}.` : ''].filter(Boolean).join(' ') || undefined });
        out.push({ grupo: `Flexocompresión, viento ${dir}`, nombre: `${v.nombre}: compresión (cargado)`, criterio: `|σ| ≤ ${adm} kg/cm² (${hormigon})`, fuente: 'guía 5',
          planilla: enPlanilla ? r.flex.O[i] : null, guia: comp.compresion, unidad: 'kg/cm²', estado: est(v.verifica), nota: v.muros.length > 1 ? `Peor muro: ${comp.id}. Armadura mínima de la pieza: ${As.toFixed(1)} cm².` : undefined });
      });
    }
  }
  return out;
}
