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
import { datosAltura, moduloHormigon, rigidez } from './diagramas';
import { armarTabique, corteDintel, esbeltez, estaticoCorte, flechaGuia, TAU_ADM, textoBarras } from './metodos/guia';
import { tipoDe } from './modelo';

export type Estado = 'verifica' | 'no verifica' | 'atención' | 'informativo';
export interface Control {
  grupo: string; nombre: string; criterio: string; fuente: string;
  planilla: number | null; guia: number | null; unidad: string; estado: Estado; nota?: string;
}

/** número en castellano (coma decimal, punto de miles) para las notas */
const nf = (x: number, d: number) => x.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });

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
  // método Guía (etapa 2): esbeltez (guía 1) y flecha de la ménsula (guía 4.2)
  const zFund = niv[niv.length - 1]?.cota ?? 0, zTop = niv[0]?.cota ?? 0;
  for (const [dir, Lv, ancho] of [['A', LPB, BPB], ['B', BPB, LPB]] as const) {
    const es = esbeltez(h, Lv);
    out.push({ grupo: 'Diseño', nombre: `Esbeltez λ = h / L, viento ${dir}`, criterio: '> 3 el viento importa; 5 a 10 puede haber vuelco; ≥ 10 muy difícil', fuente: 'guía 1',
      planilla: null, guia: es.lambda, unidad: '', estado: es.clase === 'vuelco' || es.clase === 'muy alta' ? 'atención' : 'informativo', nota: es.texto });
    if (!filaNivel.length) continue;
    const pts = datosAltura(p, c.guia.viento, c.guia.mnyq, filaNivel, dir).filter(x => x.z > 0).sort((a, b) => b.z - a.z);
    if (pts.length < 1) continue;
    const q = (x: typeof pts[number]) => ((x.pBarlo - x.pSota) / 10) * ancho;   // kN/m² → t/m², por el ancho que recibe el viento
    const fl = flechaGuia(q(pts[0]), q(pts[pts.length - 1]), zTop - zFund, moduloHormigon(hormigon), rg.find(x => x.dir === dir)!.J);
    out.push({ grupo: 'Rigidez', nombre: `Flecha de la ménsula, viento ${dir}`, criterio: `f = qv·h⁴ / (8·E·J) ≤ h/500 = ${fl.fAdm.toFixed(3)} m`, fuente: 'guía 4.2',
      planilla: null, guia: fl.f, unidad: 'm', estado: est(fl.verifica),
      nota: `qv = (${nf(fl.qvMax, 3)} + ${nf(fl.qvMin, 3)}) / 2 = ${nf(fl.qv, 3)} t/m · h = ${nf(fl.h, 1)} m hasta la fundación · E = ${nf(fl.E, 0)} t/m² · ΣJ = ${nf(fl.J, 2)} m⁴` });
  }
  // Σ J·a = 0 siempre (Xr es el baricentro de los J); la celda L25 de la planilla suma solo las filas 5 a 19
  for (const [dir, rr, gg] of [['A', r.rotA, c.guia.rotA], ['B', r.rotB, c.guia.rotB]] as const) {
    const total = gg.L.slice(0, gg.nP).reduce((x, y) => x + (isFinite(y) ? y : 0), 0);
    const escala = Math.max(1e-9, gg.L.slice(0, gg.nP).reduce((x, y) => x + Math.abs(isFinite(y) ? y : 0), 0));
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
        const difiere = enPlanilla && i < 20 && TIPO_FILA_PARALELOS[i] !== (pz.molde === 'asimétrico' ? 'asimétrica' : pz.molde === 'tubo' ? 'circular' : 'simétrica');
        const peor = v.muros.reduce((m2, x) => (x.traccion > m2.traccion ? x : m2), v.muros[0]);
        const comp = v.muros.reduce((m2, x) => (x.compresion < m2.compresion ? x : m2), v.muros[0]);
        if (!peor) return;
        const As = Math.max(...v.muros.map(x => Math.max(x.As, x.AsMin)));
        // armado como la guía (5): cada muro en dos capas, vertical y horizontal (1/5)
        const repetido = (id: string) => v.muros.filter(x => x.id === id).length > 1;   // un tabique con abertura se verifica en partes
        const armado = v.muros.map((x, k) => { const a = armarTabique(x.As, x.AsMin, Math.max(x.b, x.h)); const nom = repetido(x.id) ? `${x.id} (parte ${v.muros.slice(0, k + 1).filter(y => y.id === x.id).length})` : x.id; return `${nom}: ${textoBarras(a.vertical)}, horizontal ${textoBarras(a.horizontal)}`; }).join(' · ');
        out.push({ grupo: `Flexocompresión, viento ${dir}`, nombre: `${v.nombre}: tracción (descargado)`, criterio: 'σ ≤ 0; si no, armadura (T = σ·b·x/2)', fuente: 'guía 5',
          planilla: enPlanilla ? r.flex.P[i] : null, guia: peor.traccion, unidad: 'kg/cm²', estado: peor.traccion > 0 ? 'atención' : 'verifica',
          nota: [peor.traccion > 0 ? `Lleva armadura: muro ${peor.id}, As = ${peor.As.toFixed(1)} cm² (mínima ${peor.AsMin.toFixed(1)} cm²).` : '', difiere ? 'La planilla lee otro módulo en esta fila: su valor no vale para esta pieza.' : '', v.muros.length > 1 ? `Peor muro: ${peor.id}.` : ''].filter(Boolean).join(' ') || undefined });
        out.push({ grupo: `Flexocompresión, viento ${dir}`, nombre: `${v.nombre}: compresión (cargado)`, criterio: `|σ| ≤ ${adm} kg/cm² (${hormigon})`, fuente: 'guía 5',
          planilla: enPlanilla ? r.flex.O[i] : null, guia: comp.compresion, unidad: 'kg/cm²', estado: est(v.verifica), nota: `${v.muros.length > 1 ? `Peor muro: ${comp.id}. Armadura mínima de la pieza: ${As.toFixed(1)} cm². ` : ''}Armado (guía): ${armado}.` || undefined });
      });
    }
  }
  // método Guía (etapa 2): corte en los dinteles de los tabiques con aberturas, en PB (guía 5, «Esfuerzo de corte»)
  if (piezas.length && filaNivel.length) {
    const iPBn = niv.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
    const hPiso = iPBn > 0 ? niv[iPBn - 1].cota - niv[iPBn].cota : 0;
    const filaPB = filaNivel[iPBn] ?? -1;
    const tauAdm = TAU_ADM(hormigon);
    for (const dir of ['A', 'B'] as const) {
      const rg2 = dir === 'A' ? c.rotoA : c.rotoB;
      const QPB = filaPB >= 0 ? (dir === 'A' ? g.I[filaPB] : g.N[filaPB]) : NaN;
      if (!rg2 || !(QPB > 0) || !(hPiso > 0)) continue;
      piezas.filter(pz => pz.dir === dir && pz.filaHoja !== null).forEach(pz => {
        const ms = pz.muros.map(id => p.muros.find(m => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
        const conAb = ms.filter(m => tipoDe(m) === 'tabique' && m.aberturas?.length && (m.dir === 'Y') === (dir === 'A'));
        const el = rg2.paralelos.find(x => x.nombre === pz.nombre);
        if (!conAb.length || !el || !rg2.Q) return;
        const Qpieza = (QPB * (el.tras + el.rot)) / rg2.Q;
        const Jpieza = ms.filter(m => (m.dir === 'Y') === (dir === 'A')).reduce((x, m) => x + (m.espesor * m.largo ** 3) / 12, 0) || 1;
        conAb.forEach(m => m.aberturas!.forEach((ab, k) => {
          const Jm = (m.espesor * m.largo ** 3) / 12;
          const cd = corteDintel(Qpieza * (Jm / Jpieza), estaticoCorte(m.espesor, m.largo, ab.s), Jm, hPiso, hPiso - (ab.desde + ab.alto), m.espesor, tauAdm);
          out.push({ grupo: `Corte en dinteles, viento ${dir}`, nombre: `${m.id}${m.aberturas!.length > 1 ? ` · abertura ${k + 1}` : ''}: dintel en PB`, criterio: `τ = T / (h dintel · b) ≤ ${tauAdm.toFixed(0)} kg/cm² (${hormigon})`, fuente: 'guía 5',
            planilla: null, guia: cd.tau, unidad: 'kg/cm²', estado: est(cd.verifica),
            nota: `Qj = ${nf(cd.Qj, 2)} t · S = ${nf(cd.S, 4)} m³ · J = ${nf(cd.J, 3)} m⁴ → t = ${nf(cd.t, 2)} t/m; T = t · ${nf(cd.hPiso, 2)} m = ${nf(cd.T, 2)} t; dintel de ${nf(cd.hDintel, 2)} m.${hormigon.replace(/\s/g, '').toUpperCase() !== 'H30' ? ' τ adm proporcional a la de la guía para H30 (24 kg/cm²): confirmar con la cátedra.' : ''}` });
        }));
      });
    }
  }
  return out;
}
