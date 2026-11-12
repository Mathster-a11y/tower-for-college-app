/**
 * Desglose analítico de la planilla, hoja por hoja (salvo «Flex comp PB paralelos», que se revisa aparte).
 *
 * Cada hoja se vuelve a calcular «a mano», con las fórmulas del reglamento y de la guía de la cátedra, en un código
 * independiente de la réplica de la planilla (planilla.ts). Para cada paso se guarda: la fórmula, la sustitución con
 * los números, el resultado analítico, el resultado de la planilla (Excel) y la celda donde está.
 *
 * Para que cada diferencia aparezca en la hoja donde nace, cada hoja usa como datos los mismos valores que recibe en
 * la planilla (por ejemplo, la rototraslación parte de los J y del corte que da la planilla).
 *
 * Criterios analíticos (donde la planilla hace otra cosa, la diferencia se marca y se explica):
 *  - viento: Kz con z ≥ 5 m (CIRSOC 102, Tabla 5, nota 2);
 *  - M, N y Q: sin viento en PB ni en los subsuelos (guía de la cátedra);
 *  - hojas J: el J de cada pieza respecto de su propio baricentro (Steiner);
 *  - rototraslación: todas las piezas en las sumas y Q total = Q traslación + Q rotación.
 */
import type { PlanillaDatos, PlanillaRes, FilaJ } from './planilla';

export type Resultado = 'coincide' | 'difiere' | 'solo analítico';
export interface Paso {
  titulo: string;
  /** fórmula con la notación del CIRSOC / la guía */
  formula: string;
  /** la fórmula con los números puestos */
  sustitucion: string;
  analitico: number;
  excel: number | null;
  celda: string;
  unidad: string;
  dec: number;
  nota?: string;
}
export interface Tabla {
  titulo: string;
  /** columnas comparadas: nombre, unidad y decimales */
  columnas: { nombre: string; unidad: string; dec: number }[];
  filas: { etiqueta: string; valores: [number, number | null][] }[];
  nota?: string;
}
export interface Comprobacion {
  nombre: string; criterio: string; unidad: string; dec: number;
  analitico: number; excel: number | null;
  cumpleAnalitico: boolean; cumpleExcel: boolean | null;
  nota?: string;
}
export interface HojaDesglose {
  hoja: string;
  /** qué temas cubre la hoja, en pocas palabras */
  temas: { titulo: string; texto: string; fuente: string }[];
  datos: { nombre: string; valor: string }[];
  pasos: Paso[];
  tablas: Tabla[];
  controles: Comprobacion[];
  /** por qué difieren (si difieren) */
  diferencias: string[];
}

/** tolerancia: 0,5 % del mayor o 1e-4 en absoluto */
export function comparar(a: number, e: number | null): Resultado {
  if (e === null) return 'solo analítico';
  if (!isFinite(a) && !isFinite(e)) return 'coincide';
  if (!isFinite(a) || !isFinite(e)) return 'difiere';
  return Math.abs(a - e) <= Math.max(1e-4, 0.005 * Math.max(Math.abs(a), Math.abs(e))) ? 'coincide' : 'difiere';
}
export const num = (x: number, d = 2) => (!isFinite(x) ? '—' : x.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−'));
const n0 = (x: number | null | undefined) => (x == null || !isFinite(x) ? 0 : x);
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

/** Datos de entrada para el desglose. */
export interface EntradaDesglose {
  d: PlanillaDatos;
  r: PlanillaRes;
  /** fila de viento / M,NyQ de cada nivel del proyecto (de arriba hacia abajo) */
  filaNivel: number[];
  /** nombres de los niveles (mismo orden que filaNivel) */
  nombresNivel: string[];
  /** piezas: nombre y fila en su hoja J (A = paralelos, B = ortogonales) */
  piezas: { nombre: string; dir: 'A' | 'B'; fila: number | null }[];
  hormigon: string;
  /** ancho B y largo L en PB (para la carga mínima) */
  BPB: number;
}

// ------------------------------------------------------------------ 1 · viento
function hojaViento(x: EntradaDesglose): HojaDesglose {
  const v = x.d.viento, rv = x.r.viento;
  const filas = x.filaNivel.map((k, j) => ({ k, nombre: x.nombresNivel[j], z: n0(v.Z[k]) })).filter(f => f.k <= 50 && f.z > 0);
  const Kz = (z: number) => 2.01 * Math.pow(Math.max(z, 5) / v.zg, 2 / v.alfa);
  const qz = (z: number) => 0.613 * v.Kzt * v.Kd * v.V ** 2 * v.I * Kz(z);
  const zh = Math.max(...filas.map(f => f.z), 0);
  const qh = qz(zh);
  const pb = (z: number) => qz(z) * v.G * v.Cpb, ps = qh * v.G * v.Cps;
  const pn = (z: number) => (pb(z) - ps) / 10000;
  const pasos: Paso[] = [];
  const top = filas[0], mid = filas[Math.floor(filas.length / 2)], bot = filas[filas.length - 1];
  const muestra = [top, mid, bot].filter((f, i, a) => f && a.indexOf(f) === i);
  muestra.forEach(f => {
    const zc = Math.max(f.z, 5);
    pasos.push({ titulo: `Coeficiente de exposición Kz · ${f.nombre} (z = ${num(f.z)} m)`, formula: 'Kz = 2,01 · (z / zg)^(2/α)',
      sustitucion: `Kz = 2,01 · (${num(zc)} / ${num(v.zg, 0)})^(2/${num(v.alfa, 1)})${f.z < 5 ? '  (z < 5 m: se toma z = 5 m)' : ''}`,
      analitico: Kz(f.z), excel: rv.Kz[f.k], celda: `viento!C${f.k + 5}`, unidad: '', dec: 3,
      nota: f.z < 5 ? 'CIRSOC 102, Tabla 5, nota 2: debajo de 5 m se usa Kz de z = 5 m. La planilla usa la altura real.' : undefined });
    pasos.push({ titulo: `Presión dinámica qz · ${f.nombre}`, formula: 'qz = 0,613 · Kzt · Kd · V² · I · Kz',
      sustitucion: `qz = 0,613 · ${num(v.Kzt)} · ${num(v.Kd)} · ${num(v.V, 0)}² · ${num(v.I)} · ${num(Kz(f.z), 3)}`,
      analitico: qz(f.z), excel: rv.qz[f.k], celda: `viento!D${f.k + 5}`, unidad: 'N/m²', dec: 1 });
  });
  pasos.push({ titulo: 'Presión dinámica en la altura media de la cubierta qh', formula: 'qh = qz (z = h)', sustitucion: `qh = qz(${num(zh)} m)`,
    analitico: qh, excel: rv.qh, celda: 'viento!máx(D)', unidad: 'N/m²', dec: 1 });
  pasos.push({ titulo: `Presión a barlovento · ${top?.nombre ?? ''}`, formula: 'p = qz · G · Cp', sustitucion: `p = ${num(top ? qz(top.z) : 0, 1)} · ${num(v.G)} · ${num(v.Cpb)}`,
    analitico: top ? pb(top.z) : 0, excel: top ? rv.P[top.k] : null, celda: top ? `viento!P${top.k + 5}` : '', unidad: 'N/m²', dec: 1 });
  pasos.push({ titulo: 'Succión a sotavento (igual en toda la altura)', formula: 'p = qh · G · Cp', sustitucion: `p = ${num(qh, 1)} · ${num(v.G)} · (${num(v.Cps)})`,
    analitico: ps, excel: top ? rv.Q[top.k] : null, celda: top ? `viento!Q${top.k + 5}` : '', unidad: 'N/m²', dec: 1 });
  muestra.forEach(f => pasos.push({ titulo: `Presión neta de diseño · ${f.nombre}`, formula: 'p neta = (p barlovento − p sotavento) / 10 000',
    sustitucion: `p = (${num(pb(f.z), 1)} − (${num(ps, 1)})) / 10 000`, analitico: pn(f.z), excel: rv.S[f.k], celda: `viento!S${f.k + 5}`, unidad: 't/m²', dec: 4,
    nota: f === muestra[0] ? '1 t ≈ 10 kN: se divide por 10 000 para pasar de N/m² a t/m², como la planilla.' : undefined }));
  const pmin = Math.min(...filas.map(f => pn(f.z))), pminE = Math.min(...filas.map(f => rv.S[f.k]));
  const dif: string[] = [];
  if (filas.some(f => f.z < 5)) dif.push('Kz debajo de 5 m: el CIRSOC usa z = 5 m; la planilla, la altura real (da un Kz menor en el 1º piso).');
  return {
    hoja: 'viento',
    temas: [
      { titulo: 'Datos del viento', texto: 'Velocidad básica V del lugar, factor de direccionalidad Kd, importancia I, categoría de exposición (α y zg) y factor topográfico Kzt.', fuente: 'CIRSOC 102, art. 5.4 a 5.7' },
      { titulo: 'Exposición en altura', texto: 'Kz crece con la altura: el viento pega más fuerte arriba.', fuente: 'CIRSOC 102, Tabla 5' },
      { titulo: 'Presión dinámica', texto: 'qz en cada nivel y qh en la cubierta.', fuente: 'CIRSOC 102, art. 5.10' },
      { titulo: 'Presiones de diseño', texto: 'Barlovento (empuje, cambia con la altura) y sotavento (succión, constante con qh), con G y Cp. La suma es la presión neta sobre la torre.', fuente: 'CIRSOC 102, art. 5.12; guía 1' },
    ],
    datos: [
      { nombre: 'V', valor: `${num(v.V, 0)} m/s` }, { nombre: 'Kd', valor: num(v.Kd) }, { nombre: 'I', valor: num(v.I) }, { nombre: 'α', valor: num(v.alfa, 1) },
      { nombre: 'zg', valor: `${num(v.zg, 0)} m` }, { nombre: 'Kzt', valor: num(v.Kzt) }, { nombre: 'G', valor: num(v.G) }, { nombre: 'Cp barlovento', valor: num(v.Cpb) }, { nombre: 'Cp sotavento', valor: num(v.Cps) },
    ],
    pasos,
    tablas: [{
      titulo: 'Todos los niveles', columnas: [{ nombre: 'Kz', unidad: '', dec: 3 }, { nombre: 'qz', unidad: 'N/m²', dec: 1 }, { nombre: 'p neta', unidad: 't/m²', dec: 4 }],
      filas: filas.map(f => ({ etiqueta: `${f.nombre} · z = ${num(f.z)} m`, valores: [[Kz(f.z), rv.Kz[f.k]], [qz(f.z), rv.qz[f.k]], [pn(f.z), rv.S[f.k]]] })),
    }],
    controles: [{ nombre: 'Presión mínima de diseño', criterio: 'p neta ≥ 0,50 kN/m² = 0,05 t/m² en todos los niveles (CIRSOC 102, art. 1.4.1)', unidad: 't/m²', dec: 4,
      analitico: pmin, excel: pminE, cumpleAnalitico: pmin >= 0.05 - 1e-9, cumpleExcel: pminE >= 0.05 - 1e-9 }],
    diferencias: dif,
  };
}

// ------------------------------------------------------------------ 2 · M, N y Q
function hojaMNyQ(x: EntradaDesglose): HojaDesglose {
  const d = x.d, m = x.r.mnyq, Z = d.viento.Z;
  const ks = x.filaNivel;                                            // filas de los niveles, de arriba hacia abajo
  const iPB = ks.findIndex((k, j) => n0(Z[k]) <= 0 && (j === 0 || n0(Z[ks[j - 1]]) > 0));
  const zs = ks.map(k => n0(Z[k]));
  // ancho y largo de cada nivel (se arrastran hacia abajo, como en la hoja)
  const Bv: number[] = [], Lv: number[] = [];
  ks.forEach((k, j) => { Bv[j] = d.mnyq.E[k] ?? (j ? Bv[j - 1] : 0); Lv[j] = d.mnyq.F[k] ?? (j ? Lv[j - 1] : 0); });
  const p = ks.map(k => (k <= 50 ? x.r.viento.S[k] : 0));            // presión neta de la hoja viento (dato de esta hoja)
  // altura de influencia: mitad del entrepiso de arriba y mitad del de abajo; en la azotea, medio entrepiso; sin viento en PB y abajo
  const hInf = zs.map((z, j) => (iPB >= 0 && j >= iPB ? 0 : j === 0 ? (zs.length > 1 ? (z - zs[1]) / 2 : 0) : (zs[j - 1] - (zs[j + 1] ?? z)) / 2));
  const WA = hInf.map((h, j) => h * Bv[j] * p[j]), WB = hInf.map((h, j) => h * Lv[j] * p[j]);
  const QA: number[] = [], MA: number[] = [], QB: number[] = [], MB: number[] = [];
  ks.forEach((_, j) => {
    QA[j] = j ? QA[j - 1] + WA[j - 1] : 0; QB[j] = j ? QB[j - 1] + WB[j - 1] : 0;
    const hE = j ? zs[j - 1] - zs[j] : 0;
    MA[j] = j ? MA[j - 1] + QA[j] * hE : 0; MB[j] = j ? MB[j - 1] + QB[j] * hE : 0;
  });
  const pesoPiso = ks.map((_, j) => Bv[j] * Lv[j] * 0.7);
  const Pacum: number[] = []; ks.forEach((_, j) => { Pacum[j] = (j ? Pacum[j - 1] : 0) + pesoPiso[j]; });
  const last = ks.length - 1;
  const W = sum(WA), Mv = MA[last], P = Pacum[last], hw = W ? Mv / W : NaN;
  const b1 = n0(d.mnyq.b1), a1 = n0(d.mnyq.a1);
  const Me = P * b1 / 2, coef = Mv ? Me / Mv : NaN, e = P ? Mv / P : NaN;
  const S = a1 * b1, G = P * 9 / 7;
  const sP = -P / S / 10, sG = -G / S / 10, sV = (6 * Mv) / (a1 * b1 ** 2) / 10;
  const smax = sG - sV, smin = sP + sV;
  const minimo = 0.051 * x.BPB * (zs[0] - (iPB >= 0 ? zs[iPB] : 0));
  const jPB = iPB >= 0 ? iPB : last, kPB = ks[jPB];
  const jm = Math.max(1, Math.floor((iPB >= 0 ? iPB : last) / 2));
  const pasos: Paso[] = [
    { titulo: `Fuerza de viento en un nivel · ${x.nombresNivel[jm]}`, formula: 'W = h influencia · B · p neta', sustitucion: `W = ${num(hInf[jm])} · ${num(Bv[jm])} · ${num(p[jm], 4)}`,
      analitico: WA[jm], excel: m.H[ks[jm]], celda: `M,NyQ!H${ks[jm] + 4}`, unidad: 't', dec: 3 },
    { titulo: 'Fuerza total del viento A', formula: 'W = Σ Wi', sustitucion: `W = ${WA.filter(w => w).map(w => num(w, 2)).slice(0, 6).join(' + ')}${WA.filter(w => w).length > 6 ? ' + …' : ''}`,
      analitico: W, excel: m.G65, celda: 'M,NyQ!G65', unidad: 't', dec: 2,
      nota: 'La guía no carga viento en PB ni en los subsuelos (lo toma el terreno); la planilla sí suma la fila de PB.' },
    { titulo: `Corte en PB (${x.nombresNivel[jPB] ?? 'PB'})`, formula: 'Q = Σ W de los niveles de arriba', sustitucion: `Q = Σ W(azotea … ${x.nombresNivel[jPB - 1] ?? ''})`,
      analitico: QA[jPB], excel: m.I[kPB], celda: `M,NyQ!I${kPB + 4}`, unidad: 't', dec: 2 },
    { titulo: `Momento flector en PB`, formula: 'M = M de arriba + Q · h entrepiso', sustitucion: `M = ${num(MA[jPB - 1] ?? 0, 1)} + ${num(QA[jPB], 2)} · ${num((zs[jPB - 1] ?? 0) - zs[jPB])}`,
      analitico: MA[jPB], excel: m.J[kPB], celda: `M,NyQ!J${kPB + 4}`, unidad: 'tm', dec: 1 },
    { titulo: 'Momento de vuelco en la fundación', formula: 'Mv = Σ Q · h (hasta la fundación)', sustitucion: `Mv = ${num(MA[last - 1] ?? 0, 1)} + ${num(QA[last], 2)} · ${num((zs[last - 1] ?? 0) - zs[last])}`,
      analitico: Mv, excel: m.J61, celda: 'M,NyQ!J61', unidad: 'tm', dec: 1 },
    { titulo: 'Altura de la resultante del viento', formula: 'hW = Mv / W', sustitucion: `hW = ${num(Mv, 1)} / ${num(W, 2)}`, analitico: hw, excel: m.G66, celda: 'M,NyQ!G66', unidad: 'm', dec: 2 },
    { titulo: 'Peso de un piso', formula: 'Pi = B · L · 0,7 t/m²', sustitucion: `Pi = ${num(Bv[jm])} · ${num(Lv[jm])} · 0,7`, analitico: pesoPiso[jm], excel: m.L[ks[jm]], celda: `M,NyQ!L${ks[jm] + 4}`, unidad: 't', dec: 1 },
    { titulo: 'Peso total del edificio', formula: 'P = Σ Pi', sustitucion: `P = ${ks.length - 1} niveles · …`, analitico: P, excel: m.G67, celda: 'M,NyQ!G67', unidad: 't', dec: 1 },
    { titulo: 'Momento estabilizante', formula: "Me = P · b' / 2", sustitucion: `Me = ${num(P, 1)} · ${num(b1)} / 2`, analitico: Me, excel: m.K99, celda: 'M,NyQ!K99', unidad: 'tm', dec: 1 },
    { titulo: 'Coeficiente de seguridad al vuelco', formula: 'ν = Me / Mv', sustitucion: `ν = ${num(Me, 1)} / ${num(Mv, 1)}`, analitico: coef, excel: m.L99, celda: 'M,NyQ!L99', unidad: '', dec: 2 },
    { titulo: 'Excentricidad de la carga en la base', formula: 'e = Mv / P', sustitucion: `e = ${num(Mv, 1)} / ${num(P, 1)}`, analitico: e, excel: m.M99, celda: 'M,NyQ!M99', unidad: 'm', dec: 3 },
    { titulo: 'Tensión por el peso (con la fundación)', formula: 'σG = −(P · 9/7) / (a · b) / 10', sustitucion: `σG = −${num(G, 1)} / (${num(a1)} · ${num(b1)}) / 10`, analitico: sG, excel: m.N86, celda: 'M,NyQ!N86', unidad: 'kg/cm²', dec: 3 },
    { titulo: 'Tensión por el viento', formula: 'σV = 6 · Mv / (a · b²) / 10', sustitucion: `σV = 6 · ${num(Mv, 1)} / (${num(a1)} · ${num(b1)}²) / 10`, analitico: sV, excel: -m.N87, celda: 'M,NyQ!N87 (con el signo cambiado)', unidad: 'kg/cm²', dec: 3 },
    { titulo: 'Tensión máxima en el suelo', formula: 'σmáx = σG − σV', sustitucion: `σmáx = ${num(sG, 3)} − ${num(sV, 3)}`, analitico: smax, excel: m.N89, celda: 'M,NyQ!N89', unidad: 'kg/cm²', dec: 3 },
    { titulo: 'Tensión mínima en el suelo', formula: 'σmín = σP + σV  (σP = −P / (a · b) / 10)', sustitucion: `σmín = ${num(sP, 3)} + ${num(sV, 3)}`, analitico: smin, excel: m.N90, celda: 'M,NyQ!N90', unidad: 'kg/cm²', dec: 3 },
  ];
  const vis = ks.map((k, j) => ({ k, j })).filter(o => o.j <= (iPB >= 0 ? iPB : last));
  const dif: string[] = [];
  if (comparar(W, m.G65) === 'difiere') dif.push('Viento en PB: la planilla suma la fuerza de la fila de PB (altura de influencia hacia abajo); la guía no, porque esa franja descarga directo en el terreno. Por eso W, Q, M y el vuelco dan algo distintos.');
  return {
    hoja: 'M,NyQ',
    temas: [
      { titulo: 'Fuerzas por nivel', texto: 'La presión neta por el área de fachada que le toca a cada nivel (mitad del entrepiso de arriba y de abajo) da la fuerza W de cada piso.', fuente: 'guía 1.3' },
      { titulo: 'Corte y momento en altura', texto: 'La torre trabaja como una ménsula: el corte Q es la suma de las fuerzas de arriba y el momento M suma Q · h piso a piso.', fuente: 'guía 1.4' },
      { titulo: 'Peso propio', texto: 'Cada planta pesa B · L · 0,7 t/m²; P es la suma.', fuente: 'guía 2.1' },
      { titulo: 'Vuelco', texto: 'El peso estabiliza (Me = P · b/2) y el viento vuelca (Mv). Coeficiente ν ≥ 1,5 y excentricidad e = Mv / P dentro del tercio central.', fuente: 'guía 2.2' },
      { titulo: 'Tensiones en el suelo', texto: 'σ = N / A ± M / W bajo la fundación: la máxima comprime el suelo y la mínima no debe traccionar.', fuente: 'guía 2.3' },
    ],
    datos: [
      { nombre: 'Niveles', valor: `${ks.length} (${x.nombresNivel[0]} a ${x.nombresNivel[last]})` }, { nombre: "b' (paralelo al viento)", valor: `${num(b1)} m` }, { nombre: 'a (perpendicular)', valor: `${num(a1)} m` },
      { nombre: 'carga por m²', valor: '0,7 t/m²' },
    ],
    pasos,
    tablas: [{
      titulo: 'Fuerza, corte y momento por nivel (viento A)', columnas: [{ nombre: 'W', unidad: 't', dec: 2 }, { nombre: 'Q', unidad: 't', dec: 2 }, { nombre: 'M', unidad: 'tm', dec: 1 }, { nombre: 'P acum.', unidad: 't', dec: 1 }],
      filas: vis.map(({ k, j }) => ({ etiqueta: x.nombresNivel[j], valores: [[WA[j], m.H[k]], [QA[j], m.I[k]], [MA[j], m.J[k]], [Pacum[j], m.M[k]]] })),
    }, {
      titulo: 'Corte y momento por nivel (viento B, con el largo L)', columnas: [{ nombre: 'Q', unidad: 't', dec: 2 }, { nombre: 'M', unidad: 'tm', dec: 1 }],
      filas: vis.map(({ k, j }) => ({ etiqueta: x.nombresNivel[j], valores: [[QB[j], m.N[k]], [MB[j], m.O[k]]] })),
    }],
    controles: [
      { nombre: 'Carga mínima', criterio: `W ≥ 0,50 kN/m² · B · h = ${num(minimo, 1)} t (CIRSOC 102, art. 1.4.1)`, unidad: 't', dec: 1, analitico: W, excel: m.G65, cumpleAnalitico: W >= minimo, cumpleExcel: m.G65 >= minimo },
      { nombre: 'Vuelco', criterio: 'ν = Me / Mv ≥ 1,5', unidad: '', dec: 2, analitico: coef, excel: m.L99, cumpleAnalitico: coef >= 1.5, cumpleExcel: m.L99 >= 1.5 },
      { nombre: 'Excentricidad en la base', criterio: `e ≤ b'/6 = ${num(b1 / 6, 2)} m`, unidad: 'm', dec: 3, analitico: e, excel: m.M99, cumpleAnalitico: e <= b1 / 6, cumpleExcel: m.M99 <= m.N99 },
      { nombre: 'Suelo sin tracción', criterio: 'σmín ≤ 0', unidad: 'kg/cm²', dec: 3, analitico: smin, excel: m.N90, cumpleAnalitico: smin <= 0, cumpleExcel: m.N90 <= 0 },
    ],
    diferencias: dif,
  };
}

// ------------------------------------------------------------------ 3 y 4 · hojas J
/** J de un conjunto de rectángulos respecto de su baricentro (eje paralelo al ancho b) */
function jRect(rs: { b: number; h: number; y: number }[]): { A: number; y: number; J: number } {
  const A = sum(rs.map(r => r.b * r.h));
  if (!(A > 0)) return { A: 0, y: 0, J: 0 };
  const y = sum(rs.map(r => r.b * r.h * r.y)) / A;
  return { A, y, J: sum(rs.map(r => (r.b * r.h ** 3) / 12 + r.b * r.h * (r.y - y) ** 2)) };
}
function jFila(f: FilaJ): { sim: number; circ: number; asim: number; port: number; total: number; formaSim: string } {
  const g = (k: keyof FilaJ) => n0(f[k] as number | undefined);
  // pieza simétrica: alma B × C (C en la dirección del viento), ala superior F × G arriba y ala inferior J × K abajo
  const C = g('C');
  const sim = jRect([{ b: g('B'), h: C, y: 0 }, { b: g('F'), h: g('G'), y: C / 2 + g('G') / 2 }, { b: g('J'), h: g('K'), y: -(C / 2 + g('K') / 2) }]);
  const circ = (Math.PI * (g('S') ** 4 - g('T') ** 4)) / 64;
  // pieza asimétrica (molde de la planilla): alma W × X desde y = 0, ala sup. Z × AB, alma der. AE × AF y ala inf. AH × AI apiladas
  const X = g('X');
  const asim = jRect([{ b: g('W'), h: X, y: X / 2 }, { b: g('Z'), h: g('AB'), y: X + g('AB') / 2 }, { b: g('AE'), h: g('AF'), y: X + g('AF') / 2 }, { b: g('AH'), h: g('AI'), y: X + g('AB') + g('AI') / 2 }]);
  // acción de pórtico: dos columnas de AO × AP y AT × AU separadas AQ (cada una a AQ/2 del eje, menos su medio ancho)
  const port = (g('AO') * g('AP') ** 3) / 12 + g('AO') * g('AP') * (g('AQ') / 2 - g('AP') / 2) ** 2 + (g('AT') * g('AU') ** 3) / 12 + g('AT') * g('AU') * (g('AQ') / 2 - g('AU') / 2) ** 2;
  return { sim: sim.J, circ, asim: asim.J, port, total: sim.J + circ + asim.J + port, formaSim: `${num(g('B'))}×${num(C)} + ${num(g('F'))}×${num(g('G'))} + ${num(g('J'))}×${num(g('K'))}` };
}
const DIV: Record<string, number> = { H30: 68000, H47: 78000, H60: 81200, H80: 90200 };
function hojaJ(x: EntradaDesglose, orto: boolean): HojaDesglose {
  const filasD = orto ? x.d.jort : x.d.jpar, res = orto ? x.r.jort : x.r.jpar, jmin = orto ? x.r.jminB : x.r.jminA;
  const dir = orto ? 'B' : 'A';
  const nombres = new Map(x.piezas.filter(p => p.dir === dir && p.fila !== null).map(p => [p.fila!, p.nombre]));
  const usadas = filasD.map((f, i) => ({ f, i, a: jFila(f) })).filter(o => o.a.total > 1e-6 || res.filas[o.i].AY > 1e-6);
  const total = sum(filasD.map(f => jFila(f).total));
  const pasos: Paso[] = [];
  usadas.slice(0, 4).forEach(({ f, i, a }) => {
    const nom = `${nombres.get(i) ?? `pieza ${i + 1}`} (fila ${i + 4})`;
    const r = res.filas[i];
    if (a.sim > 1e-6 || r.N > 1e-6) pasos.push({ titulo: `J de la pieza simétrica · ${nom}`, formula: 'J = Σ (b · h³ / 12 + A · d²)  (Steiner, respecto del baricentro)',
      sustitucion: `alma + ala sup. + ala inf. = ${a.formaSim} m`, analitico: a.sim, excel: r.N - (orto && i === 19 ? r.U : 0), celda: `${orto ? 'J ortog.' : 'J paral.'}!N${i + 4}`, unidad: 'm⁴', dec: 4,
      nota: n0(f.F) * n0(f.G) !== n0(f.J) * n0(f.K) ? 'Alas distintas: el baricentro se corre del medio del alma. La planilla toma el eje en el medio del alma.' : undefined });
    if (a.asim > 1e-6 || r.AM > 1e-6) pasos.push({ titulo: `J de la pieza asimétrica · ${nom}`, formula: 'yG = Σ A·y / Σ A ;  J = Σ (b·h³/12 + A·(y − yG)²)',
      sustitucion: `molde: alma ${num(n0(f.W))}×${num(n0(f.X))}, ala sup. ${num(n0(f.Z))}×${num(n0(f.AB))}, alma der. ${num(n0(f.AE))}×${num(n0(f.AF))}, ala inf. ${num(n0(f.AH))}×${num(n0(f.AI))}`,
      analitico: a.asim, excel: r.AM, celda: `${orto ? 'J ortog.' : 'J paral.'}!AM${i + 4}`, unidad: 'm⁴', dec: 4,
      nota: f.sinYAC ? 'En esta fila la planilla virgen no tiene las fórmulas del alma y del ala superior (Y y AC): no las suma. El cálculo analítico las incluye.' : undefined });
    if (a.circ > 1e-6) pasos.push({ titulo: `J del tubo circular · ${nom}`, formula: 'J = π · (D⁴ − d⁴) / 64', sustitucion: `J = π · (${num(n0(f.S))}⁴ − ${num(n0(f.T))}⁴) / 64`,
      analitico: a.circ, excel: r.U, celda: `${orto ? 'J ortog.' : 'J paral.'}!U${i + 4}`, unidad: 'm⁴', dec: 4 });
    if (a.port > 1e-6) pasos.push({ titulo: `J de la acción de pórtico · ${nom}`, formula: 'J = Σ (b·h³/12 + A·d²) de las dos columnas', sustitucion: `columnas ${num(n0(f.AO))}×${num(n0(f.AP))} y ${num(n0(f.AT))}×${num(n0(f.AU))}, separación ${num(n0(f.AQ))} m`,
      analitico: a.port, excel: r.AX, celda: `${orto ? 'J ortog.' : 'J paral.'}!AX${i + 4}`, unidad: 'm⁴', dec: 4 });
  });
  pasos.push({ titulo: `Suma de los J (viento ${dir})`, formula: 'ΣJ = Σ J de cada pieza', sustitucion: usadas.map(o => num(o.a.total, 3)).slice(0, 8).join(' + ') + (usadas.length > 8 ? ' + …' : ''),
    analitico: total, excel: res.AY24, celda: `${orto ? 'J ortog.' : 'J paral.'}!AY24`, unidad: 'm⁴', dec: 3 });
  // J mínimo por deformación: δ = W·h³ / (8·E·J) ≤ h / k  →  J ≥ k · W · h² / (8 · E)
  const m = x.r.mnyq;
  const W = jmin.W, hT = Math.max(...m.B.filter(isFinite));
  const E = (DIV[x.hormigon] ?? DIV.H30) * 400 / 8;
  const Jmin = (500 * W * hT ** 2) / (8 * E);
  const JminE = jmin.tabla.find(t => t.hormigon === x.hormigon)?.h500 ?? jmin.tabla[0].h500;
  pasos.push({ titulo: `Altura total de la torre`, formula: 'h = cota de la azotea', sustitucion: `h = ${num(hT)} m`, analitico: hT, excel: jmin.h, celda: orto ? 'M,NyQ!G69' : 'máx(M,NyQ!B4:B43)', unidad: 'm', dec: 2,
    nota: !orto && comparar(hT, jmin.h) === 'difiere' ? 'La hoja de paralelos toma la altura de las primeras 40 filas solamente.' : undefined });
  pasos.push({ titulo: `J mínimo para h/500 (${x.hormigon})`, formula: 'δ = W·h³ / (8·E·J) ≤ h/500  →  J ≥ 500 · W · h² / (8 · E)',
    sustitucion: `J ≥ 500 · ${num(W, 2)} · ${num(hT)}² / (8 · ${num(E, 0)})`, analitico: Jmin, excel: JminE, celda: `${orto ? 'J ortog.' : 'J paral.'}!M37`, unidad: 'm⁴', dec: 2,
    nota: `E = ${num(E / 1e5, 1)}·10⁵ t/m², el que resulta de los divisores de la planilla (${num(DIV[x.hormigon] ?? DIV.H30, 0)} para h/400).` });
  const dif: string[] = [];
  if (usadas.some(o => comparar(o.a.sim, res.filas[o.i].N - (orto && o.i === 19 ? res.filas[o.i].U : 0)) === 'difiere')) dif.push('Piezas simétricas con alas distintas: la planilla calcula el J respecto del medio del alma; el baricentro real se corre hacia el ala más grande y el J verdadero es menor.');
  if (orto && usadas.some(o => o.i === 19 && o.a.circ > 0)) dif.push('Fila 23 de «ortogonales»: N ya suma el tubo circular (U) y AY lo vuelve a sumar: el tubo cuenta dos veces.');
  if (usadas.some(o => o.f.sinYAC)) dif.push('Filas 11 y 12 de «paralelos»: faltan las fórmulas Y y AC en la planilla virgen; el alma y el ala superior de esas piezas no se suman.');
  return {
    hoja: orto ? 'J Tabiques ortogonales' : 'J Tabiques paralelos',
    temas: [
      { titulo: 'Piezas del contraviento', texto: `Cada pieza (tabique, T, C, doble T, tubo) con los muros que trabajan en la dirección del viento ${dir}.`, fuente: 'guía 3' },
      { titulo: 'Momento de inercia J', texto: 'Rectángulos con b·h³/12 más el término de Steiner (A·d²) para llevarlos al eje de la pieza; tubo circular π(D⁴−d⁴)/64; acción de pórtico.', fuente: 'guía 3.1' },
      { titulo: 'Rigidez mínima', texto: 'La flecha de la ménsula δ = W·h³/(8EJ) tiene que quedar debajo de h/400 a h/600: da el ΣJ mínimo.', fuente: 'guía 4.2' },
    ],
    datos: [{ nombre: 'Piezas cargadas', valor: String(usadas.length) }, { nombre: 'Hormigón', valor: x.hormigon }, { nombre: 'W (corte en la base)', valor: `${num(W, 2)} t` }],
    pasos,
    tablas: [{ titulo: 'J de cada pieza', columnas: [{ nombre: 'J', unidad: 'm⁴', dec: 4 }],
      filas: usadas.map(o => ({ etiqueta: `${nombres.get(o.i) ?? `pieza ${o.i + 1}`} · fila ${o.i + 4}`, valores: [[o.a.total, res.filas[o.i].AY]] })) }],
    controles: [{ nombre: `Rigidez viento ${dir}`, criterio: `ΣJ ≥ J mínimo (h/500, ${x.hormigon})`, unidad: 'm⁴', dec: 3, analitico: total, excel: res.AY24,
      cumpleAnalitico: total >= Jmin, cumpleExcel: res.AY24 >= JminE, nota: `J mín analítico ${num(Jmin, 2)} m⁴ · planilla ${num(JminE, 2)} m⁴` }],
    diferencias: dif,
  };
}

// ------------------------------------------------------------------ 5 y 6 · rototraslación
function hojaRoto(x: EntradaDesglose, menor: boolean): HojaDesglose {
  const rr = menor ? x.r.rotB : x.r.rotA, H = (menor ? x.d.rotB : x.d.rotA).H;
  const dir = menor ? 'B' : 'A';
  const nombres = new Map(x.piezas.filter(p => p.dir === dir && p.fila !== null).map(p => [p.fila!, p.nombre]));
  const Q = rr.D5, Mv = rr.F5;
  const par = Array.from({ length: 20 }, (_, i) => ({ i, J: n0(rr.B[i]), x: n0(H[i]) })).filter(o => o.J > 1e-6);
  const perp = [23, 24, ...Array.from({ length: 20 }, (_, j) => 26 + j)].map(i => ({ i, J: n0(rr.B[i]), x: n0(H[i]) })).filter(o => o.J > 1e-6);
  const SJ = sum(par.map(o => o.J)), xr = SJ ? sum(par.map(o => o.J * o.x)) / SJ : NaN;
  const SJp = sum(perp.map(o => o.J)), yr = SJp ? sum(perp.map(o => o.J * o.x)) / SJp : 0;
  const Mt = Q * xr;
  const SJa2 = sum(par.map(o => o.J * (o.x - xr) ** 2)) + sum(perp.map(o => o.J * (o.x - yr) ** 2));
  const tras = (J: number) => (SJ ? (Q * J) / SJ : 0);
  const rot = (J: number, a: number) => (SJa2 ? (-Mt * J * a) / SJa2 : 0);
  const SJa = sum(par.map(o => o.J * (o.x - xr)));
  const ej = par.slice().sort((a, b) => Math.abs(b.x - xr) - Math.abs(a.x - xr))[0];
  const nom = (i: number) => nombres.get(i) ?? `fila ${i + 5}`;
  const hoja = menor ? 'Rototrasl. cara menor' : 'Rototrasl. cara mayor';
  const pasos: Paso[] = [
    { titulo: 'Corte en la base (dato de M,NyQ)', formula: 'Q', sustitucion: `Q = ${num(Q, 2)} t`, analitico: Q, excel: rr.D5, celda: `${hoja}!D5`, unidad: 't', dec: 2 },
    { titulo: 'Suma de los J de las piezas paralelas', formula: 'ΣJ = Σ Ji', sustitucion: par.map(o => num(o.J, 3)).slice(0, 8).join(' + ') + (par.length > 8 ? ' + …' : ''), analitico: SJ, excel: rr.B25, celda: `${hoja}!B25`, unidad: 'm⁴', dec: 3 },
    { titulo: 'Posición del eje de inercia (centro de rigidez)', formula: 'Xr = Σ Ji · xi / Σ Ji', sustitucion: `Xr = ${num(sum(par.map(o => o.J * o.x)), 3)} / ${num(SJ, 3)}`, analitico: xr, excel: rr.J7, celda: `${hoja}!J7`, unidad: 'm', dec: 3 },
    { titulo: 'Momento torsor (el viento actúa en el eje de simetría, x = 0)', formula: 'Mt = Q · e ,  e = Xr', sustitucion: `Mt = ${num(Q, 2)} · ${num(xr, 3)}`, analitico: Mt, excel: rr.J15, celda: `${hoja}!J15`, unidad: 'tm', dec: 2 },
    { titulo: 'Rigidez a la torsión', formula: 'Σ J · a²  (paralelas a Xr y perpendiculares a su eje)', sustitucion: `Σ = ${num(sum(par.map(o => o.J * (o.x - xr) ** 2)), 2)} + ${num(sum(perp.map(o => o.J * (o.x - yr) ** 2)), 2)}`, analitico: SJa2, excel: rr.M51, celda: `${hoja}!M51`, unidad: 'm⁶', dec: 2 },
  ];
  if (ej) {
    const a = ej.x - xr;
    pasos.push({ titulo: `Traslación · ${nom(ej.i)}`, formula: 'Qtras = Q · J / ΣJ', sustitucion: `Qtras = ${num(Q, 2)} · ${num(ej.J, 3)} / ${num(SJ, 3)}`, analitico: tras(ej.J), excel: rr.E[ej.i], celda: `${hoja}!E${ej.i + 5}`, unidad: 't', dec: 3 });
    pasos.push({ titulo: `Rotación · ${nom(ej.i)} (a = ${num(a, 2)} m)`, formula: 'Qrot = − Mt · J · a / Σ J·a²', sustitucion: `Qrot = − ${num(Mt, 2)} · ${num(ej.J, 3)} · ${num(a, 2)} / ${num(SJa2, 2)}`, analitico: rot(ej.J, a), excel: rr.N[ej.i], celda: `${hoja}!N${ej.i + 5}`, unidad: 't', dec: 3 });
    pasos.push({ titulo: `Corte total · ${nom(ej.i)}`, formula: 'Q = Qtras + Qrot', sustitucion: `Q = ${num(tras(ej.J), 3)} + (${num(rot(ej.J, a), 3)})`, analitico: tras(ej.J) + rot(ej.J, a), excel: rr.O[ej.i], celda: `${hoja}!O${ej.i + 5}`, unidad: 't', dec: 3,
      nota: 'La planilla suma en O la columna G (la parte del momento, en tm) con N (corte de rotación, en t): mezcla unidades.' });
    pasos.push({ titulo: `Momento de traslación · ${nom(ej.i)}`, formula: 'Mtras = Mv · J / ΣJ', sustitucion: `M = ${num(Mv, 1)} · ${num(ej.J, 3)} / ${num(SJ, 3)}`, analitico: SJ ? (Mv * ej.J) / SJ : 0, excel: rr.G[ej.i], celda: `${hoja}!G${ej.i + 5}`, unidad: 'tm', dec: 1 });
  }
  const dif: string[] = [];
  if (par.some(o => comparar(tras(o.J) + rot(o.J, o.x - xr), rr.O[o.i]) === 'difiere')) dif.push('Columna O (total): la planilla suma G + N, es decir el momento de traslación (tm) más el corte de rotación (t). El total correcto de cada pieza es Q tras + Q rot (en t) y su momento M tras + Q rot · hW (en tm).');
  if (menor && perp.some(o => o.i >= 34)) dif.push('Cara menor: B51 e I51 suman solo las filas 28 a 38; las piezas perpendiculares de las filas 39 a 50 quedan afuera del eje de la otra dirección.');
  if (!menor && par.some(o => o.i >= 15)) dif.push('L25 (control Σ J·a) suma solo las filas 5 a 19: con piezas en las filas 20 a 24 no da cero aunque el cálculo esté bien.');
  if (comparar(SJa2, rr.M51) === 'difiere' && perp.some(o => o.i === 23 || o.i === 24)) dif.push('Filas 28–29 (atajo): la planilla las refiere a su propio promedio en vez del eje de las perpendiculares.');
  return {
    hoja,
    temas: [
      { titulo: 'Reparto por traslación', texto: 'El corte se reparte entre las piezas paralelas al viento en proporción a su J.', fuente: 'guía 4.3; clase 5' },
      { titulo: 'Centro de rigidez', texto: 'El eje de inercia Xr = ΣJ·x/ΣJ. Si no coincide con el eje del viento hay excentricidad e y momento torsor Mt = Q · e.', fuente: 'guía, Anexo' },
      { titulo: 'Reparto por rotación', texto: 'Mt lo toman todas las piezas (también las perpendiculares) según J · a / Σ J · a².', fuente: 'guía, Anexo' },
      { titulo: 'Rototraslación', texto: 'Cada pieza recibe traslación ± rotación: la que queda del lado del giro suma, la del otro lado resta.', fuente: 'guía, Anexo' },
    ],
    datos: [{ nombre: 'Q (corte)', valor: `${num(Q, 2)} t` }, { nombre: 'Mv (momento)', valor: `${num(Mv, 1)} tm` }, { nombre: 'Piezas paralelas', valor: String(par.length) }, { nombre: 'Piezas perpendiculares', valor: String(perp.length) }],
    pasos,
    tablas: [{
      titulo: 'Reparto en cada pieza paralela', columnas: [{ nombre: 'J / ΣJ', unidad: '', dec: 4 }, { nombre: 'Q tras', unidad: 't', dec: 3 }, { nombre: 'Q rot', unidad: 't', dec: 3 }, { nombre: 'Q total', unidad: 't', dec: 3 }],
      filas: par.map(o => ({ etiqueta: `${nom(o.i)} · x = ${num(o.x)} m`, valores: [[SJ ? o.J / SJ : 0, rr.C[o.i]], [tras(o.J), rr.E[o.i]], [rot(o.J, o.x - xr), rr.N[o.i]], [tras(o.J) + rot(o.J, o.x - xr), rr.O[o.i]]] })),
    }],
    controles: [
      { nombre: 'Equilibrio de la traslación', criterio: 'Σ Q tras = Q', unidad: 't', dec: 3, analitico: sum(par.map(o => tras(o.J))), excel: rr.E25, cumpleAnalitico: comparar(sum(par.map(o => tras(o.J))), Q) === 'coincide', cumpleExcel: comparar(rr.E25, Q) === 'coincide' },
      { nombre: 'Eje de inercia bien ubicado', criterio: 'Σ J · a = 0', unidad: 'm⁵', dec: 4, analitico: SJa, excel: rr.L25, cumpleAnalitico: Math.abs(SJa) <= 1e-6 * Math.max(1, SJ), cumpleExcel: Math.abs(rr.L25) <= 1e-6 * Math.max(1, SJ) },
    ],
    diferencias: dif,
  };
}

/** el desglose de las seis primeras hojas */
export function desglosar(x: EntradaDesglose): HojaDesglose[] {
  return [hojaViento(x), hojaMNyQ(x), hojaJ(x, false), hojaJ(x, true), hojaRoto(x, false), hojaRoto(x, true)];
}

/** resumen de una hoja: cuántos pasos coinciden y si los controles verifican con los dos cálculos */
export function resumenHoja(h: HojaDesglose) {
  const todos = [...h.pasos.map(p => comparar(p.analitico, p.excel)), ...h.tablas.flatMap(t => t.filas.flatMap(f => f.valores.map(([a, e]) => comparar(a, e))))];
  return {
    coinciden: todos.filter(t => t === 'coincide').length, difieren: todos.filter(t => t === 'difiere').length, total: todos.length,
    verificaAnalitico: h.controles.every(c => c.cumpleAnalitico), verificaExcel: h.controles.every(c => c.cumpleExcel !== false),
  };
}
