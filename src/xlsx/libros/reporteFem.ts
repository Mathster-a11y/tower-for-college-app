/**
 * «Reporte FEM» (plan de trabajo, etapa 6b): el Excel del método FEM. No es una calculadora (el modelo pseudo-3D y el
 * análisis modal no se pueden hacer con fórmulas): es un reporte de datos, con todos los números del modelo y los
 * diagramas para entender la torre completa.
 *
 *   Léame · Torre · Modelo · Modos · Viento · Desplazamientos · Esfuerzos en altura · Reparto · Deriva · Hormigón 201 ·
 *   Controles   (+ las tablas «T3D» ocultas, para volver a abrir el proyecto en la app)
 */
import { hojaRef, LibroK, rc, type HojaK } from '../kit/libro';
import type { ResultadoMetodoFem } from '../../engine/metodos/fem';
import type { VerifPieza201 } from '../../engine/metodos/cirsoc';
import type { Control } from '../../engine/verificaciones';
import type { RectG } from '../../engine/metodos/guiaPasos';
import { tablasProyecto } from '../proyectoTablas';
import type { Proyecto } from '../../engine/modelo';
import { num, res } from './comun';

export const HF = {
  leame: 'Léame', torre: 'Torre', modelo: 'Modelo', modos: 'Modos', viento: 'Viento', desp: 'Desplazamientos', esf: 'Esfuerzos en altura',
  reparto: 'Reparto', deriva: 'Deriva', h201: 'Hormigón 201', controles: 'Controles',
};
const COLORES = ['1F4E79', 'C55A11', '548235', '7030A0', 'BF9000', '2E75B6', 'A6A6A6', 'C00000', '00B0F0', '70AD47', 'FF6699', '808000'];
const sentido = { x: 'en x (viento B)', y: 'en y (viento A)', giro: 'giro' };

export interface DatosReporteFem {
  p: Proyecto; fem: ResultadoMetodoFem; verif: VerifPieza201[]; controles: Control[]; rects: RectG[];
  teoria: 'timoshenko' | 'euler'; limiteDeriva: number;
}

export function reporteFem(D: DatosReporteFem): LibroK {
  const { p, fem, verif, controles } = D;
  const L = new LibroK();
  L.titulo = `Reporte FEM · ${p.nombre}`;
  const mo = fem.modelo, nz = mo.z.length;
  const zPB = p.niveles.reduce((z, n) => (n.cota >= 0 ? n.cota : z), 0);
  const nivelDe = (z: number) => p.niveles.find(n => Math.abs(n.cota - zPB - z) < 1e-6)?.nombre ?? 'PB';
  const tabla = (h: HojaK, r0: number, c0: number, cab: string[], filas: (string | number | null)[][], fmts: (string | undefined)[] = []) => {
    h.cabecera(r0, c0, cab);
    filas.forEach((f, i) => f.forEach((v, j) => h.put(c0 + j, r0 + 1 + i, v, typeof v === 'number' ? num((fmts[j] ?? '0.000') as never) : { papel: 'calc' })));
    return { f0: r0 + 1, f1: r0 + Math.max(filas.length, 1) };
  };
  const rango = (h: HojaK, c: number, a: number, b: number) => `${hojaRef(h.nombre)}$${rc(c, 1).replace(/\d+/, '')}$${a}:$${rc(c, 1).replace(/\d+/, '')}$${b}`;

  // ============================================================================================ Léame
  const le = L.hoja(HF.leame, [3, 112]);
  le.put(1, 1, 'Reporte FEM: la torre como un modelo', 'titulo');
  const lineas = [
    `Proyecto: ${p.nombre}. Hecho con Torre 3D, método «FEM» (reglas del CIRSOC con el reparto del modelo).`,
    `Modelo pseudo-3D: cada losa es rígida en su plano y se mueve en x, en y y gira (3 grados de libertad por piso, ${nz} pisos sobre PB). Cada pieza es una ménsula ${D.teoria === 'timoshenko' ? 'de Timoshenko (flexión y corte de las almas)' : 'de Euler-Bernoulli (solo flexión)'} empotrada en PB que llega hasta su cota.`,
    'Análisis modal con la masa de las losas y de los tabiques: la primera frecuencia de cada dirección entra al viento del CIRSOC 102-25 (G = 0,85 si n1 ≥ 1 Hz; si no, Gf).',
    'Los cuatro casos de carga de la Fig. 2.4-8 se resuelven con el modelo (con la torsión en los dos sentidos): cada pieza toma lo que su rigidez y su posición le dan, piso por piso.',
    'Este libro es un reporte: los números vienen del modelo de la app (no son fórmulas). Para cambiar algo, cambialo en la app y volvé a exportar.',
    'Hojas: Torre (niveles, masas y planta) · Modelo (las piezas) · Modos (frecuencias, períodos, formas) · Viento (102-25 con la frecuencia del modelo) · Desplazamientos (cada piso, cada caso) · Esfuerzos en altura (corte de cada pieza piso por piso) · Reparto (planilla contra modelo) · Deriva (servicio) · Hormigón 201 (cada muro) · Controles.',
    'Unidades: m, t, tm, t/m² (E), t·s²/m (masas); desplazamientos en m y giros en rad.',
  ];
  lineas.forEach((x, i) => { le.put(2, 3 + i, x, { papel: 'texto', ajustar: true }); le.altos.set(3 + i, x.length > 120 ? 27 : 15); });

  // ============================================================================================ Torre
  const to = L.hoja(HF.torre, [26, 12, 10, 10, 10, 12, 14, 3, 10, 10]);
  to.encabezado('La torre: niveles, masas y planta', 'Masa de cada losa = (D · área de la planta · pisos + tabiques de media altura arriba y abajo) / g; inercia rotacional J0 = m · (B² + L²) / 12.', 10);
  const datos: [string, string | number, string][] = [
    ['Hormigón', p.hormigon || 'H30', ''], ['E (t/m²)', mo.E, ''], ['G = E / 2,4 (t/m²)', mo.G, ''], ['Piezas', D.teoria === 'timoshenko' ? 'Timoshenko' : 'Euler-Bernoulli', ''],
    ['Pisos del modelo (sobre PB)', nz, ''], ['Masa total (t·s²/m)', fem.masas.reduce((s, m) => s + m, 0), ''], ['Peso total (t)', fem.masas.reduce((s, m) => s + m, 0) * 9.80665, ''],
  ];
  datos.forEach(([a, b], i) => { to.put(1, 4 + i, a, 'textoB'); to.put(2, 4 + i, b, typeof b === 'number' ? res('0.00') : { papel: 'calc' }); });
  const filasN = mo.z.map((z, k) => [nivelDe(z), z + zPB, z, fem.masas[k], fem.inercias[k], fem.masas[k] * 9.80665]).reverse();
  const tN = tabla(to, 13, 1, ['Nivel', 'Cota (m)', 'z sobre PB (m)', 'Masa (t·s²/m)', 'J0 (t·s²·m)', 'Peso (t)'], filasN, [undefined, '0.00', '0.00', '0.000', '0.0', '0.0']);
  // planta: contornos de los rectángulos (valores)
  let rr = 4;
  to.put(9, 3, 'Planta (para el gráfico)', 'subtitulo'); to.cabecera(rr - 1 + 0, 9, ['x (m)', 'y (m)']);
  const p0 = rr;
  for (const r of D.rects) {
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]) { to.put(9, rr, r.x + (sx * r.ax) / 2, num('0.00')); to.put(10, rr, r.y + (sy * r.ay) / 2, num('0.00')); rr++; }
    rr++;
  }
  to.graficos.push({ tipo: 'dispersion', titulo: 'Planta de PB', ejeX: 'x (m)', ejeY: 'y (m)', sinLeyenda: true,
    series: [{ nombre: 'muros', x: rango(to, 9, p0, rr - 1), y: rango(to, 10, p0, rr - 1), color: '1F4E79', sinMarcas: true, ancho: 19050 }], desde: [12, 3], hasta: [21, 25] });
  to.graficos.push({ tipo: 'dispersion', titulo: 'Masa de cada losa', ejeX: 'masa (t·s²/m)', ejeY: 'z (m)', sinLeyenda: true,
    series: [{ nombre: 'masa', x: rango(to, 4, tN.f0, tN.f1), y: rango(to, 3, tN.f0, tN.f1), color: 'C55A11' }], desde: [12, 26], hasta: [21, 45] });

  // ============================================================================================ Modelo
  const ml = L.hoja(HF.modelo, [14, 8, 12, 12, 12, 12]);
  ml.encabezado('Las piezas del modelo', 'Cada pieza flexiona en su dirección (A: en y, B: en x), a la distancia «pos» del origen (x para las A, y para las B). Av: área de corte de sus almas (Timoshenko).', 6);
  tabla(ml, 4, 1, ['Pieza', 'Dirección', 'pos (m)', 'J (m⁴)', 'Av (m²)', 'Llega a z (m)'], mo.piezas.map(x => [x.nombre, x.dir, x.pos, x.J, x.Av, x.zHasta]), [undefined, undefined, '0.000', '0.0000', '0.000', '0.00']);

  // ============================================================================================ Modos
  const md = L.hoja(HF.modos, [8, 10, 10, 16, 10, 10, 10, 3, 8, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
  md.encabezado('Análisis modal', `K·φ = ω²·M·φ. La primera frecuencia con movimiento dominante en y entra al viento A (n1 = ${fem.n1.A.toFixed(3).replace('.', ',')} Hz) y la de x al viento B (n1 = ${fem.n1.B.toFixed(3).replace('.', ',')} Hz). Participación: la parte de la masa que mueve cada modo.`, 18);
  const modos = fem.modos.slice(0, Math.min(12, fem.modos.length));
  tabla(md, 4, 1, ['Modo', 'f (Hz)', 'T (s)', 'Movimiento', '% masa x', '% masa y', '% giro'],
    modos.map((m, i) => [i + 1, m.f, m.T, sentido[m.dominante], m.participacion.x * 100, m.participacion.y * 100, m.participacion.giro * 100]), ['0', '0.0000', '0.000', undefined, '0.0', '0.0', '0.0']);
  // formas de los tres primeros modos: la componente dominante de cada piso, normalizada a 1 arriba
  const nf = Math.min(3, modos.length);
  const formas = mo.z.map((z, k) => [z, ...modos.slice(0, nf).map(m => { const d = m.dominante === 'x' ? 0 : m.dominante === 'y' ? 1 : 2; const top = m.forma[3 * (nz - 1) + d] || 1; return m.forma[3 * k + d] / top; })]);
  formas.unshift([0, ...modos.slice(0, nf).map(() => 0)]);
  const tF = tabla(md, 4, 9, ['z (m)', ...modos.slice(0, nf).map((m, i) => `Modo ${i + 1} (${sentido[m.dominante]})`)], formas, ['0.00', '0.0000', '0.0000', '0.0000']);
  md.graficos.push({ tipo: 'dispersion', titulo: 'Formas de los primeros modos', ejeX: 'desplazamiento (normalizado)', ejeY: 'z (m)',
    series: modos.slice(0, nf).map((m, i) => ({ nombre: `modo ${i + 1}: ${m.f.toFixed(2).replace('.', ',')} Hz`, x: rango(md, 10 + i, tF.f0, tF.f1), y: rango(md, 9, tF.f0, tF.f1), color: COLORES[i] })), desde: [14, 4], hasta: [22, 26] });

  // ============================================================================================ Viento
  const w = fem.viento;
  const vi = L.hoja(HF.viento, [14, 9, 10, 10, 10, 10, 10, 10, 3, 34, 12, 12]);
  vi.encabezado('Viento del CIRSOC 102-25 con la frecuencia del modelo', 'Las fuerzas de cada nivel (t), el corte debajo del nivel y el momento en el nivel, con G = 0,85 o Gf según la frecuencia del análisis modal.', 12);
  const filasV = w.A.niveles.map((n, i) => [n.nivel, n.z, n.W, n.Q, n.M, w.B.niveles[i]?.W ?? 0, w.B.niveles[i]?.Q ?? 0, w.B.niveles[i]?.M ?? 0]);
  const tV = tabla(vi, 4, 1, ['Nivel', 'z (m)', 'W A (t)', 'Q A (t)', 'M A (tm)', 'W B (t)', 'Q B (t)', 'M B (tm)'], filasV, [undefined, '0.00', '0.000', '0.00', '0.0', '0.000', '0.00', '0.0']);
  const resV: [string, number, number][] = [['n1 del modelo (Hz)', w.A.n1, w.B.n1], ['G usado', w.A.Gusado, w.B.Gusado], ['Cp de sotavento', w.A.Cps, w.B.Cps], ['W total (t)', w.A.W, w.B.W], ['Q en PB (t)', w.A.QPB, w.B.QPB], ['M en PB (tm)', w.A.MPB, w.B.MPB], ['Relación de servicio (Va/V)²', w.servicio.relacion, w.servicio.relacion]];
  vi.cabecera(4, 10, ['', 'Viento A', 'Viento B']);
  resV.forEach(([t, a, b], i) => { vi.put(10, 5 + i, t, 'textoB'); vi.put(11, 5 + i, a, res('0.000')); vi.put(12, 5 + i, b, res('0.000')); });
  vi.graficos.push({ tipo: 'dispersion', titulo: 'Fuerza de cada nivel', ejeX: 'W (t)', ejeY: 'z (m)', series: [{ nombre: 'viento A', x: rango(vi, 3, tV.f0, tV.f1), y: rango(vi, 2, tV.f0, tV.f1), color: 'C55A11' }, { nombre: 'viento B', x: rango(vi, 6, tV.f0, tV.f1), y: rango(vi, 2, tV.f0, tV.f1), color: '548235', punteada: true }], desde: [10, 14], hasta: [18, 34] });
  vi.graficos.push({ tipo: 'dispersion', titulo: 'Momento en altura', ejeX: 'M (tm)', ejeY: 'z (m)', series: [{ nombre: 'viento A', x: rango(vi, 5, tV.f0, tV.f1), y: rango(vi, 2, tV.f0, tV.f1), color: 'C55A11' }, { nombre: 'viento B', x: rango(vi, 8, tV.f0, tV.f1), y: rango(vi, 2, tV.f0, tV.f1), color: '548235', punteada: true }], desde: [10, 35], hasta: [18, 55] });

  // ============================================================================================ Desplazamientos
  const de = L.hoja(HF.desp, [10, ...Array(3 * fem.casos.length).fill(11)]);
  de.encabezado('Desplazamientos de cada piso en cada caso de carga', 'ux, uy: corrimiento del centro de la losa (m); θ: giro de la losa (rad). Casos de la Fig. 2.4-8, con la torsión en los dos sentidos.', 3 * fem.casos.length + 1);
  const cabD = ['z (m)', ...fem.casos.flatMap(c => [`${c.texto}: ux`, 'uy', 'θ'])];
  const filasD = [[0, ...fem.casos.flatMap(() => [0, 0, 0])], ...mo.z.map((z, k) => [z, ...fem.casos.flatMap(c => [c.res.ux[k], c.res.uy[k], c.res.rz[k]])])];
  const tD = tabla(de, 4, 1, cabD, filasD, ['0.00', ...fem.casos.flatMap(() => ['0.00000', '0.00000', '0.000000'])]);
  de.graficos.push({ tipo: 'dispersion', titulo: 'Deformada, caso 1 (centro de la losa)', ejeX: 'desplazamiento (m)', ejeY: 'z (m)',
    series: [{ nombre: 'viento A: uy', x: rango(de, 3, tD.f0, tD.f1), y: rango(de, 1, tD.f0, tD.f1), color: 'C55A11' }, { nombre: 'viento B: ux', x: rango(de, 5, tD.f0, tD.f1), y: rango(de, 1, tD.f0, tD.f1), color: '548235' }], desde: [2, tD.f1 + 3], hasta: [10, tD.f1 + 24] });

  // ============================================================================================ Esfuerzos en altura (caso 1)
  const es = L.hoja(HF.esf, [10, ...Array(mo.piezas.length * 2).fill(10)]);
  es.encabezado('Corte de cada pieza en altura (caso 1)', 'La fuerza que toma la pieza en cada piso (de la rigidez del modelo) y el corte acumulado desde arriba. En la planilla la parte de cada pieza es la misma en toda la altura; en el modelo cambia piso a piso.', 2 * mo.piezas.length + 1);
  for (const [k, dir] of [[0, 'A'], [1, 'B']] as const) {
    const caso = fem.casos[k];
    const ps = caso.res.piezas.filter(x => x.dir === dir);
    const r0 = 4 + k * (nz + 8);
    es.seccion(r0 - 1, `Viento ${dir}`, 2 * ps.length + 1);
    const corte = ps.map(x => { let s = 0; return x.f.map(() => 0).map((_, i) => { s = x.f.slice(i).reduce((a, b) => a + b, 0); return s; }); });
    const filas = mo.z.map((z, i) => [z, ...ps.flatMap((x, j) => [x.f[i], corte[j][i]])]);
    const t = tabla(es, r0, 1, ['z (m)', ...ps.flatMap(x => [`${x.nombre}: fuerza (t)`, 'corte (t)'])], filas, ['0.00', ...ps.flatMap(() => ['0.000', '0.00'])]);
    es.graficos.push({ tipo: 'dispersion', titulo: `Corte de cada pieza en altura, viento ${dir}`, ejeX: 'corte (t)', ejeY: 'z (m)',
      series: ps.map((x, j) => ({ nombre: x.nombre, x: rango(es, 3 + 2 * j, t.f0, t.f1), y: rango(es, 1, t.f0, t.f1), color: COLORES[j % COLORES.length] })), desde: [2 * ps.length + 3, r0], hasta: [2 * ps.length + 12, r0 + 20] });
  }

  // ============================================================================================ Reparto
  const rp = L.hoja(HF.reparto, [14, 8, 12, 12, 12]);
  rp.encabezado('Reparto del viento: planilla contra modelo (caso 1)', 'El % del corte del viento que toma cada pieza en PB. Con Euler y piezas de toda la altura, el modelo da lo mismo que la rototraslación de la planilla.', 5);
  const filasR = fem.reparto.map(x => [x.nombre, x.dir, x.planilla, x.fem, x.fem - x.planilla]);
  const tR = tabla(rp, 4, 1, ['Pieza', 'Viento', 'Planilla %', 'FEM %', 'Diferencia'], filasR, [undefined, undefined, '0.00', '0.00', '0.00']);
  rp.graficos.push({ tipo: 'barras', titulo: 'Parte del viento de cada pieza (%)', ejeX: 'pieza', ejeY: '%',
    series: [{ nombre: 'planilla', x: rango(rp, 1, tR.f0, tR.f1), y: rango(rp, 3, tR.f0, tR.f1), color: 'A6A6A6' }, { nombre: 'FEM', x: rango(rp, 1, tR.f0, tR.f1), y: rango(rp, 4, tR.f0, tR.f1), color: '1F4E79' }], desde: [7, 3], hasta: [17, 25] });

  // ============================================================================================ Deriva
  const dv = L.hoja(HF.deriva, [10, 13, 13, 13, 13, 3, 30, 12, 12]);
  dv.encabezado('Deriva con el viento de servicio (caso 1, borde más desfavorable)', `Desplazamiento del borde de la planta que más se mueve, con la presión de servicio (${(w.servicio.relacion * 100).toFixed(0)} % de la de cálculo). Límite: h / ${D.limiteDeriva} en la azotea y altura del piso / ${D.limiteDeriva} en cada piso.`, 9);
  const dA = fem.deriva.A, dB = fem.deriva.B;
  const filasDv = dA.z.map((z, i) => [z, dA.d[i], i ? (dA.d[i] - dA.d[i - 1]) / (z - dA.z[i - 1]) : 0, dB.d[i], i ? (dB.d[i] - dB.d[i - 1]) / (z - dB.z[i - 1]) : 0]);
  const tDv = tabla(dv, 4, 1, ['z (m)', 'δ viento A (m)', 'Δδ/Δz A', 'δ viento B (m)', 'Δδ/Δz B'], filasDv, ['0.00', '0.00000', '0.000000', '0.00000', '0.000000']);
  const resD: [string, number, number][] = [['Azotea (m)', dA.d[dA.d.length - 1], dB.d[dB.d.length - 1]], [`h / ${D.limiteDeriva} (m)`, dA.h / D.limiteDeriva, dB.h / D.limiteDeriva],
    ['Peor piso Δδ/Δz', Math.max(...filasDv.map(f => f[2] as number)), Math.max(...filasDv.map(f => f[4] as number))], [`1 / ${D.limiteDeriva}`, 1 / D.limiteDeriva, 1 / D.limiteDeriva]];
  dv.cabecera(4, 7, ['', 'Viento A', 'Viento B']);
  resD.forEach(([t, a, b], i) => { dv.put(7, 5 + i, t, 'textoB'); dv.put(8, 5 + i, a, res('0.00000')); dv.put(9, 5 + i, b, res('0.00000')); });
  dv.graficos.push({ tipo: 'dispersion', titulo: 'Deformada de servicio', ejeX: 'δ (m)', ejeY: 'z (m)',
    series: [{ nombre: 'viento A', x: rango(dv, 2, tDv.f0, tDv.f1), y: rango(dv, 1, tDv.f0, tDv.f1), color: 'C55A11' }, { nombre: 'viento B', x: rango(dv, 4, tDv.f0, tDv.f1), y: rango(dv, 1, tDv.f0, tDv.f1), color: '548235' }], desde: [7, 11], hasta: [15, 32] });

  // ============================================================================================ Hormigón 201
  const hh = L.hoja(HF.h201, [10, 8, 7, 8, 8, ...Array(12).fill(11)]);
  hh.encabezado('CIRSOC 201 con los esfuerzos del modelo, muro por muro en PB', 'M y V de cada pieza en los cuatro casos salen del modelo (el peor sentido de la torsión). Cuantía vertical: la mínima y la necesaria para que todas las combinaciones queden dentro del diagrama de interacción.', 17);
  const filasH: (string | number | null)[][] = [];
  for (const v of verif) for (const m of v.muros) filasH.push([v.nombre, m.id, v.dir, m.papel, m.lw, m.h, m.rhoMin, m.rhoNecesaria, m.relacion, m.rhoH, m.corte.Vu, m.corte.phiVn, m.corte.phiVn > 0 ? m.corte.Vu / m.corte.phiVn : null, m.NuMax, m.axialEmp, m.armado]);
  tabla(hh, 4, 1, ['Pieza', 'Muro', 'Viento', 'Papel', 'lw (m)', 't (m)', 'ρ vertical mín', 'ρ vertical necesaria', 'Uso con ρ mín', 'ρ horizontal', 'Vu (t)', 'φVn (t)', 'Vu / φVn', 'Nu máx (t)', 'φPn empírico (t)', 'Armado'],
    filasH, [undefined, undefined, undefined, undefined, '0.00', '0.00', '0.0000', '0.0000', '0.000', '0.0000', '0.00', '0.00', '0.000', '0.0', '0.0']);

  // ============================================================================================ Controles
  const co = L.hoja(HF.controles, [24, 52, 13, 12, 16, 70]);
  co.encabezado('Controles del método FEM', 'Los mismos de la app, con su estado.', 6);
  const estadoTxt = (e: Control['estado']) => (e === 'verifica' ? 'VERIFICA' : e === 'no verifica' ? 'NO VERIFICA' : e === 'atención' ? 'ATENCIÓN' : 'INFORMATIVO');
  co.cabecera(4, 1, ['Grupo', 'Control', 'Valor', 'Unidad', 'Estado', 'Nota']);
  controles.forEach((c, i) => {
    const r = 5 + i;
    co.put(1, r, c.grupo, 'texto'); co.put(2, r, c.nombre, 'textoB'); co.put(3, r, c.guia ?? c.planilla ?? null, res('0.000')); co.put(4, r, c.unidad, 'unidad');
    co.put(5, r, estadoTxt(c.estado), { papel: 'calc', centrar: true }); co.put(6, r, c.nota ?? c.criterio, 'nota');
  });
  co.verificaciones.push(`E5:E${4 + controles.length}`);

  for (const t of tablasProyecto(p)) {
    const h = L.hoja(t.nombre, t.anchos); h.oculta = true;
    t.filas.forEach((f, i) => f.forEach((x, j) => { if (x !== null && x !== '') h.put(j + 1, i + 1, x, 'vacio'); }));
  }
  return L;
}
