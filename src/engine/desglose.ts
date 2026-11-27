/**
 * Desglose analítico de la planilla, hoja por hoja (siete hojas, de «viento» a «Flex comp PB paralelos»).
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
import { flexFilaNuevo, ranuraFilaNuevo, FLEX_D_FIJO, TIPO_FILA_PARALELOS, type PlanillaDatos, type PlanillaRes, type FilaJ } from './planilla';

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

export type Semaforo = 'verde' | 'amarillo' | 'rojo';
/**
 * Diferencia entre la planilla y el analítico: Δ = Excel − analítico y el % sobre el analítico.
 * Semáforo: verde < 0,5 % (o |Δ| ≤ 0,0001), amarillo de 0,5 % a 5 %, rojo > 5 %.
 * Si el analítico da 0 y la planilla no, el % no existe: se marca rojo y se muestra solo Δ.
 */
export function diferencia(a: number, e: number | null): { delta: number; pct: number | null; nivel: Semaforo } | null {
  if (e === null) return null;
  if (!isFinite(a) || !isFinite(e)) return { delta: NaN, pct: null, nivel: !isFinite(a) && !isFinite(e) ? 'verde' : 'rojo' };
  const delta = e - a;
  if (Math.abs(delta) <= 1e-4) return { delta, pct: Math.abs(a) > 1e-12 ? (Math.abs(delta) / Math.abs(a)) * 100 : 0, nivel: 'verde' };
  if (Math.abs(a) <= 1e-12) return { delta, pct: null, nivel: 'rojo' };
  const pct = (Math.abs(delta) / Math.abs(a)) * 100;
  return { delta, pct, nivel: pct < 0.5 ? 'verde' : pct <= 5 ? 'amarillo' : 'rojo' };
}
export function comparar(a: number, e: number | null): Resultado {
  const d = diferencia(a, e);
  return d === null ? 'solo analítico' : d.nivel === 'verde' ? 'coincide' : 'difiere';
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
  /**
   * el exoesqueleto (hoja 8), viento A: lo que necesita el cálculo a mano de la propuesta y lo que dio el pórtico plano
   * de la app (en la columna «Excel», que acá es la app: la planilla de la cátedra no tiene exo)
   */
  exo?: {
    tipo: string; nombreTipo: string; E: number; Eh: number; h: number; W: number; ancho: number; Ac: number; Ad: number; hMod: number; Jtab: number;
    app: { u: number; fraccion: number; Jeq: number };
  } | null;
}

// ------------------------------------------------------------------ 1 · viento
function hojaViento(x: EntradaDesglose): HojaDesglose {
  const v = x.d.viento, rv = x.r.viento;
  const filas = x.filaNivel.map((k, j) => ({ k, nombre: x.nombresNivel[j], z: n0(v.Z[k]) })).filter(f => f.k <= Math.max(50, v.Z.length - 4) && f.z > 0);
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
      analitico: Kz(f.z), excel: rv.Kz[f.k], celda: `viento!H${f.k + 5}`, unidad: '', dec: 3,
      nota: f.z < 5 ? 'CIRSOC 102, Tabla 5, nota 2: debajo de 5 m se usa Kz de z = 5 m. La planilla usa la altura real.' : undefined });
    pasos.push({ titulo: `Presión dinámica qz · ${f.nombre}`, formula: 'qz = 0,613 · Kzt · Kd · V² · I · Kz',
      sustitucion: `qz = 0,613 · ${num(v.Kzt)} · ${num(v.Kd)} · ${num(v.V, 0)}² · ${num(v.I)} · ${num(Kz(f.z), 3)}`,
      analitico: qz(f.z), excel: rv.qz[f.k], celda: `viento!M${f.k + 5}`, unidad: 'N/m²', dec: 1 });
  });
  pasos.push({ titulo: 'Presión dinámica en la altura media de la cubierta qh', formula: 'qh = qz (z = h)', sustitucion: `qh = qz(${num(zh)} m)`,
    analitico: qh, excel: rv.qh, celda: 'viento!N4', unidad: 'N/m²', dec: 1 });
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
/** fuerzas de viento por nivel según la guía (sin viento en PB ni subsuelos), en las dos direcciones */
function fuerzasAnaliticas(x: EntradaDesglose) {
  const d = x.d, Z = d.viento.Z;
  const ks = x.filaNivel;                                            // filas de los niveles, de arriba hacia abajo
  const iPB = ks.findIndex((k, j) => n0(Z[k]) <= 0 && (j === 0 || n0(Z[ks[j - 1]]) > 0));
  const zs = ks.map(k => n0(Z[k]));
  // ancho y largo de cada nivel (se arrastran hacia abajo, como en la hoja)
  const Bv: number[] = [], Lv: number[] = [];
  ks.forEach((k, j) => { Bv[j] = d.mnyq.E[k] ?? (j ? Bv[j - 1] : 0); Lv[j] = d.mnyq.F[k] ?? (j ? Lv[j - 1] : 0); });
  const p = ks.map(k => (k <= Math.max(50, x.r.viento.S.length - 4) ? x.r.viento.S[k] : 0));            // presión neta de la hoja viento (dato de esta hoja)
  // altura de influencia: mitad del entrepiso de arriba y mitad del de abajo; en la azotea, medio entrepiso; sin viento en PB y abajo
  const hInf = zs.map((z, j) => (iPB >= 0 && j >= iPB ? 0 : j === 0 ? (zs.length > 1 ? (z - zs[1]) / 2 : 0) : (zs[j - 1] - (zs[j + 1] ?? z)) / 2));
  const WA = hInf.map((h, j) => h * Bv[j] * p[j]), WB = hInf.map((h, j) => h * Lv[j] * p[j]);
  return { d, ks, iPB, zs, Bv, Lv, p, hInf, WA, WB };
}

function hojaMNyQ(x: EntradaDesglose): HojaDesglose {
  const m = x.r.mnyq;
  const { d, ks, iPB, zs, Bv, Lv, p, hInf, WA, WB } = fuerzasAnaliticas(x);
  const QA: number[] = [], MA: number[] = [], QB: number[] = [], MB: number[] = [];
  ks.forEach((_, j) => {
    QA[j] = j ? QA[j - 1] + WA[j - 1] : 0; QB[j] = j ? QB[j - 1] + WB[j - 1] : 0;
    const hE = j ? zs[j - 1] - zs[j] : 0;
    MA[j] = j ? MA[j - 1] + QA[j] * hE : 0; MB[j] = j ? MB[j - 1] + QB[j] * hE : 0;
  });
  const pesoPiso = ks.map((_, j) => Bv[j] * Lv[j] * 0.7);
  const Pacum: number[] = []; ks.forEach((_, j) => { Pacum[j] = (j ? Pacum[j - 1] : 0) + pesoPiso[j]; });
  const last = ks.length - 1;
  // criterio C (mixto): la parte expuesta de PB (de 0 a medio entrepiso) recibe viento con Kz de z = 5 m; lo lleva la
  // losa de PB al terreno: no entra en el corte de los tabiques, sí en la carga total, el vuelco y el suelo
  const v = d.viento;
  const KzA = (z: number) => 2.01 * Math.pow(Math.max(z, 5) / v.zg, 2 / v.alfa);
  const qzA = (z: number) => 0.613 * v.Kzt * v.Kd * v.V ** 2 * v.I * KzA(z);
  const qhA = qzA(zs[0]);
  const hPB = iPB > 0 ? (zs[iPB - 1] - zs[iPB]) / 2 : 0;
  const pPB = (qzA(iPB >= 0 ? zs[iPB] : 0) * v.G * v.Cpb - qhA * v.G * v.Cps) / 10000;
  const WPB = iPB > 0 ? hPB * Bv[iPB] * pPB : 0, brazoPB = iPB >= 0 ? zs[iPB] - zs[last] : 0;
  const W = sum(WA) + WPB, Mv = MA[last] + WPB * brazoPB, P = Pacum[last], hw = W ? Mv / W : NaN;
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
    { titulo: 'Fuerza en la parte expuesta de PB', formula: 'W PB = (h entrepiso / 2) · B · p neta(z = 5 m)', sustitucion: `W PB = ${num(hPB)} · ${num(Bv[iPB] ?? 0)} · ${num(pPB, 4)}`,
      analitico: WPB, excel: iPB >= 0 ? m.H[ks[iPB]] : null, celda: iPB >= 0 ? `M,NyQ!H${ks[iPB] + 4}` : '', unidad: 't', dec: 3,
      nota: 'Criterio C: solo la fachada expuesta de PB, con empuje y succión (Kz de 5 m). La lleva la losa de PB al terreno: no entra en el corte de los tabiques, sí en el vuelco y el suelo. La planilla usa una franja de 4 m que incluye la parte enterrada y solo la succión.' },
    { titulo: 'Fuerza total del viento A', formula: 'W = Σ Wi + W PB', sustitucion: `W = ${num(sum(WA), 2)} + ${num(WPB, 2)}`,
      analitico: W, excel: m.G65, celda: 'M,NyQ!G65', unidad: 't', dec: 2 },
    { titulo: `Corte en PB (${x.nombresNivel[jPB] ?? 'PB'})`, formula: 'Q = Σ W de los niveles de arriba', sustitucion: `Q = Σ W(azotea … ${x.nombresNivel[jPB - 1] ?? ''})`,
      analitico: QA[jPB], excel: m.I[kPB], celda: `M,NyQ!I${kPB + 4}`, unidad: 't', dec: 2 },
    { titulo: `Momento flector en PB`, formula: 'M = M de arriba + Q · h entrepiso', sustitucion: `M = ${num(MA[jPB - 1] ?? 0, 1)} + ${num(QA[jPB], 2)} · ${num((zs[jPB - 1] ?? 0) - zs[jPB])}`,
      analitico: MA[jPB], excel: m.J[kPB], celda: `M,NyQ!J${kPB + 4}`, unidad: 'tm', dec: 1 },
    { titulo: 'Momento de vuelco en la fundación', formula: 'Mv = Σ Q · h (hasta la fundación) + W PB · profundidad', sustitucion: `Mv = ${num(MA[last], 1)} + ${num(WPB, 2)} · ${num(brazoPB)}`,
      analitico: Mv, excel: m.J61, celda: 'M,NyQ!J61', unidad: 'tm', dec: 1 },
    { titulo: 'Altura de la resultante del viento', formula: 'hW = Mv / W', sustitucion: `hW = ${num(Mv, 1)} / ${num(W, 2)}`, analitico: hw, excel: m.G66, celda: 'M,NyQ!G66', unidad: 'm', dec: 2 },
    { titulo: 'Peso de un piso', formula: 'Pi = B · L · 0,7 t/m²', sustitucion: `Pi = ${num(Bv[jm])} · ${num(Lv[jm])} · 0,7`, analitico: pesoPiso[jm], excel: m.L[ks[jm]], celda: `M,NyQ!L${ks[jm] + 4}`, unidad: 't', dec: 1 },
    { titulo: 'Peso total del edificio', formula: 'P = Σ Pi', sustitucion: `P = ${ks.length - 1} niveles · …`, analitico: P, excel: m.G67, celda: 'M,NyQ!G67', unidad: 't', dec: 1 },
    { titulo: 'Momento estabilizante', formula: "Me = P · b' / 2", sustitucion: `Me = ${num(P, 1)} · ${num(b1)} / 2`, analitico: Me, excel: m.K99, celda: 'M,NyQ!K99', unidad: 'tm', dec: 1 },
    { titulo: 'Coeficiente de seguridad al vuelco', formula: 'ν = Me / Mv', sustitucion: `ν = ${num(Me, 1)} / ${num(Mv, 1)}`, analitico: coef, excel: m.L99, celda: 'M,NyQ!L99', unidad: '', dec: 2 },
    { titulo: 'Excentricidad de la carga en la base', formula: 'e = Mv / P', sustitucion: `e = ${num(Mv, 1)} / ${num(P, 1)}`, analitico: e, excel: m.M99, celda: 'M,NyQ!M99', unidad: 'm', dec: 3 },
    { titulo: 'Tensión por el peso (edificio cargado: 0,9 / 0,7 = 9/7)', formula: 'σG = −(P · 9/7) / (a · b) / 10', sustitucion: `σG = −${num(G, 1)} / (${num(a1)} · ${num(b1)}) / 10`, analitico: sG, excel: m.N86, celda: 'M,NyQ!N86', unidad: 'kg/cm²', dec: 3 },
    { titulo: 'Tensión por el viento', formula: 'σV = 6 · Mv / (a · b²) / 10', sustitucion: `σV = 6 · ${num(Mv, 1)} / (${num(a1)} · ${num(b1)}²) / 10`, analitico: sV, excel: -m.N87, celda: 'M,NyQ!N87 (con el signo cambiado)', unidad: 'kg/cm²', dec: 3 },
    { titulo: 'Tensión máxima en el suelo', formula: 'σmáx = σG − σV', sustitucion: `σmáx = ${num(sG, 3)} − ${num(sV, 3)}`, analitico: smax, excel: m.N89, celda: 'M,NyQ!N89', unidad: 'kg/cm²', dec: 3 },
    { titulo: 'Tensión mínima en el suelo', formula: 'σmín = σP + σV  (σP = −P / (a · b) / 10)', sustitucion: `σmín = ${num(sP, 3)} + ${num(sV, 3)}`, analitico: smin, excel: m.N90, celda: 'M,NyQ!N90', unidad: 'kg/cm²', dec: 3 },
  ];
  const vis = ks.map((k, j) => ({ k, j })).filter(o => o.j <= (iPB >= 0 ? iPB : last));
  const dif: string[] = [];
  if (ks[0] === 0) dif.push('Más de 49 niveles sobre PB: el nivel más alto cae en la fila 4 de M,NyQ, que la planilla deja siempre en 0 (B4 = 0). El primer entrepiso sale con altura negativa y el corte, el momento y el vuelco de la planilla no sirven. Error de la planilla (límite de 49 niveles).');
  if (comparar(W, m.G65) === 'difiere') dif.push(`Viento en PB (criterio C, elegido): la fachada expuesta de PB (${num(hPB)} m) recibe ${num(WPB, 2)} t con Kz de z = 5 m; lo lleva la losa de PB al terreno, así que entra en el vuelco y el suelo pero no en el corte de los tabiques. La planilla toma una franja de 4 m que incluye la parte enterrada, solo con la succión, y la suma al corte que reparte entre los tabiques (rototraslación).`);
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
      filas: vis.map(({ k, j }) => ({ etiqueta: x.nombresNivel[j], valores: [[j === iPB ? WPB : WA[j], m.H[k]], [QA[j], m.I[k]], [MA[j], m.J[k]], [Pacum[j], m.M[k]]] })),
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
  const fz = fuerzasAnaliticas(x);
  const W = sum(orto ? fz.WB : fz.WA);                                // corte en la base de la dirección, calculado acá
  const hT = fz.zs[0] - (fz.iPB >= 0 ? fz.zs[fz.iPB] : 0);           // altura total de la torre sobre PB
  const E = (DIV[x.hormigon] ?? DIV.H30) * 400 / 8;
  const Jmin = (500 * W * hT ** 2) / (8 * E);
  const JminE = jmin.tabla.find(t => t.hormigon === x.hormigon)?.h500 ?? jmin.tabla[0].h500;
  pasos.push({ titulo: `Fuerza del viento ${dir} en la base`, formula: `W = Σ h influencia · ${orto ? 'L' : 'B'} · p neta`, sustitucion: `W = ${num(W, 2)} t`, analitico: W, excel: jmin.W, celda: orto ? 'M,NyQ!G65·F49/E49' : 'M,NyQ!G65', unidad: 't', dec: 2,
    nota: orto ? 'La planilla no calcula el viento B: escala el W del viento A con los anchos de una fila (L/B de la fila 49).' : undefined });
  pasos.push({ titulo: `Altura total de la torre`, formula: 'h = cota de la azotea − cota de PB', sustitucion: `h = ${num(hT)} m`, analitico: hT, excel: jmin.h, celda: orto ? 'M,NyQ!G69' : 'máx(M,NyQ!B4:B43)', unidad: 'm', dec: 2,
    nota: !orto && comparar(hT, jmin.h) === 'difiere' ? (jmin.h === 0 ? 'Error de la planilla: con 10 niveles o menos, las filas 4 a 43 de M,NyQ están vacías y h da 0; el J mínimo da 0 y el control de rigidez verifica siempre.' : 'La hoja de paralelos toma la altura de las filas 4 a 43 solamente.') : undefined });
  pasos.push({ titulo: `J mínimo para h/500 (${x.hormigon})`, formula: 'δ = W·h³ / (8·E·J) ≤ h/500  →  J ≥ 500 · W · h² / (8 · E)',
    sustitucion: `J ≥ 500 · ${num(W, 2)} · ${num(hT)}² / (8 · ${num(E, 0)})`, analitico: Jmin, excel: JminE, celda: `${orto ? 'J ortog.' : 'J paral.'}!M37`, unidad: 'm⁴', dec: 2,
    nota: `E = ${num(E / 1e5, 1)}·10⁵ t/m², el que resulta de los divisores de la planilla (${num(DIV[x.hormigon] ?? DIV.H30, 0)} para h/400).` });
  const dif: string[] = [];
  if (usadas.some(o => comparar(o.a.sim, res.filas[o.i].N - (orto && o.i === 19 ? res.filas[o.i].U : 0)) === 'difiere')) dif.push('Piezas simétricas con alas distintas: la planilla calcula el J respecto del medio del alma; el baricentro real se corre hacia el ala más grande y el J verdadero es menor.');
  if (orto && usadas.some(o => o.i === 19 && o.a.circ > 0)) dif.push('Fila 23 de «ortogonales»: N ya suma el tubo circular (U) y AY lo vuelve a sumar: el tubo cuenta dos veces.');
  if (!orto && jmin.h === 0 && hT > 0) dif.push('J mínimo: la hoja de paralelos toma h = MAX(M,NyQ!B4:B43). Los niveles se cargan desde abajo, así que con 10 niveles o menos esas filas están vacías: h = 0, J mínimo = 0 y el control verifica siempre. Error de la planilla; el método Guía de la app usa la altura total.');
  if (comparar(W, jmin.W) === 'difiere') dif.push(`W de la J mínima: la planilla usa ${orto ? 'el W del viento A escalado por L/B de la fila 49, con el viento en PB' : 'el W total de M,NyQ, con el viento en PB'}; el analítico suma las fuerzas de la dirección ${dir} sin PB (criterio de la guía, pendiente de decidir).`);
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
  const par = Array.from({ length: rr.nP }, (_, i) => ({ i, J: n0(rr.B[i]), x: n0(H[i]) })).filter(o => o.J > 1e-6);
  const perp = [rr.nP + 3, rr.nP + 4, ...Array.from({ length: rr.B.length - rr.oO }, (_, j) => rr.oO + j)].map(i => ({ i, J: n0(rr.B[i]), x: n0(H[i]) })).filter(o => o.J > 1e-6);
  const SJ = sum(par.map(o => o.J)), xr = SJ ? sum(par.map(o => o.J * o.x)) / SJ : NaN;
  const SJp = sum(perp.map(o => o.J)), yr = SJp ? sum(perp.map(o => o.J * o.x)) / SJp : 0;
  const Mt = Q * xr;
  const hW = Q ? Mv / Q : 0;                                          // altura de la resultante: M rot = Q rot · hW
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
    pasos.push({ titulo: `Corte total · ${nom(ej.i)}`, formula: 'Q = Qtras + Qrot', sustitucion: `Q = ${num(tras(ej.J), 3)} + (${num(rot(ej.J, a), 3)})`, analitico: tras(ej.J) + rot(ej.J, a), excel: rr.E[ej.i] + rr.N[ej.i], celda: `${hoja}!E${ej.i + 5} + N${ej.i + 5}`, unidad: 't', dec: 3,
      nota: 'La planilla no tiene una columna con el corte total: se suman E y N.' });
    pasos.push({ titulo: `Momento de traslación · ${nom(ej.i)}`, formula: 'Mtras = Mv · J / ΣJ', sustitucion: `M = ${num(Mv, 1)} · ${num(ej.J, 3)} / ${num(SJ, 3)}`, analitico: SJ ? (Mv * ej.J) / SJ : 0, excel: rr.G[ej.i], celda: `${hoja}!G${ej.i + 5}`, unidad: 'tm', dec: 1 });
    pasos.push({ titulo: `Momento total · ${nom(ej.i)}`, formula: 'M = Mtras + Qrot · hW   (hW = Mv / Q)', sustitucion: `M = ${num(SJ ? (Mv * ej.J) / SJ : 0, 1)} + (${num(rot(ej.J, a), 3)}) · ${num(hW, 2)}`,
      analitico: (SJ ? (Mv * ej.J) / SJ : 0) + rot(ej.J, a) * hW, excel: rr.O[ej.i], celda: `${hoja}!O${ej.i + 5}`, unidad: 'tm', dec: 1,
      nota: 'La planilla calcula O = G + N: suma el corte de rotación (t) sin multiplicarlo por hW. Da bien solo cuando no hay rotación.' });
  }
  const dif: string[] = [];
  if (par.some(o => comparar((SJ ? (Mv * o.J) / SJ : 0) + rot(o.J, o.x - xr) * hW, rr.O[o.i]) === 'difiere')) dif.push(`Columna O (momento total): la planilla calcula O = G + N, es decir el momento de traslación (tm) más el corte de rotación (t) sin multiplicarlo por hW = ${num(hW, 2)} m. El momento correcto es M tras + Q rot · hW. «Flex comp PB paralelos» lee O como momento y arrastra el error. El método Guía de la app usa el momento correcto.`);
  if (menor && perp.some(o => o.i >= 34)) dif.push('Cara menor: B51 e I51 suman solo las filas 28 a 38, es decir las piezas de las filas 1 a 8 de «J paralelos». Las de las filas 9 a 20, entre ellas las asimétricas (L, C, T), que la app ubica primero en las filas 13 y 14, quedan afuera: el eje de las perpendiculares se corre y todas las rotaciones cambian en el mismo porcentaje. Error de la planilla; el método Guía de la app usa todas las piezas.');
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
      titulo: 'Reparto en cada pieza paralela', columnas: [{ nombre: 'J / ΣJ', unidad: '', dec: 4 }, { nombre: 'Q tras', unidad: 't', dec: 3 }, { nombre: 'Q rot', unidad: 't', dec: 3 }, { nombre: 'Q total (E+N)', unidad: 't', dec: 3 }, { nombre: 'M total (O)', unidad: 'tm', dec: 1 }],
      filas: par.map(o => ({ etiqueta: `${nom(o.i)} · x = ${num(o.x)} m`, valores: [[SJ ? o.J / SJ : 0, rr.C[o.i]], [tras(o.J), rr.E[o.i]], [rot(o.J, o.x - xr), rr.N[o.i]], [tras(o.J) + rot(o.J, o.x - xr), rr.E[o.i] + rr.N[o.i]], [(SJ ? (Mv * o.J) / SJ : 0) + rot(o.J, o.x - xr) * hW, rr.O[o.i]]] })),
    }],
    controles: [
      { nombre: 'Equilibrio de la traslación', criterio: 'Σ Q tras = Q', unidad: 't', dec: 3, analitico: sum(par.map(o => tras(o.J))), excel: rr.E25, cumpleAnalitico: comparar(sum(par.map(o => tras(o.J))), Q) === 'coincide', cumpleExcel: comparar(rr.E25, Q) === 'coincide' },
      { nombre: 'Eje de inercia bien ubicado', criterio: 'Σ J · a = 0', unidad: 'm⁵', dec: 4, analitico: SJa, excel: rr.L25, cumpleAnalitico: Math.abs(SJa) <= 1e-6 * Math.max(1, SJ), cumpleExcel: Math.abs(rr.L25) <= 1e-6 * Math.max(1, SJ) },
    ],
    diferencias: dif,
  };
}

/**
 * «Flex comp PB paralelos»: σ = −N/F ± M/W en la base de cada pieza del viento A. El analítico usa, para cada pieza,
 * su propia fila de la hoja J, su forma (simétrica, asimétrica o tubo), el peso propio de todas las filas, el momento
 * M = Mtras + Qrot · hW y las combinaciones que deciden: compresión con el edificio cargado (Nq) y tracción con el
 * descargado (Ng). Las diferencias con la hoja se explican abajo (docs/flexocompresion_planilla).
 */
function hojaFlex(x: EntradaDesglose): HojaDesglose {
  const hoja = 'Flex comp PB paralelos', rr = x.r.rotA, f = x.r.flex, nuevo = !!x.r.jpar.filas28;
  const nombres = new Map(x.piezas.filter(p => p.dir === 'A' && p.fila !== null).map(p => [p.fila!, p.nombre]));
  const hW = rr.D5 ? rr.F5 / rr.D5 : 0;
  const adm = (parseFloat(x.hormigon.replace(/[^\d.]/g, '')) || 30) * 10;
  type Pz = { i: number; nom: string; forma: 'simétrica' | 'asimétrica' | 'circular'; F: number; C: number; Pp: number; Ng: number; Nq: number; M: number; W: number; Wfila: string; comp: number; trac: number; e: number; k: number };
  const pzs: Pz[] = [];
  for (const [i, nom] of nombres) {
    const fl = x.d.flex[i];
    if (!fl || fl.C == null || i >= f.B.length) continue;
    const jr = x.r.jpar.filas[i], jd: FilaJ = x.d.jpar[i] ?? {};
    const g = (k: keyof FilaJ) => n0(jd[k] as number | undefined);
    const forma = jr.U > 1e-9 ? 'circular' : jr.AM > 1e-9 ? 'asimétrica' : 'simétrica';
    // área: la de la hoja J más el ala inferior de las asimétricas (AH · AI), que la hoja no suma
    const F = jr.O + (forma === 'asimétrica' ? g('AH') * g('AI') : 0);
    let W: number, Wfila: string;
    if (forma === 'circular') { W = g('S') > 0 ? jr.U / (g('S') / 2) : 0; Wfila = 'W = J / (D/2)'; }
    else if (forma === 'asimétrica') { const h = g('X') + g('AB') + g('AI'), y = Math.max(jr.AK, h - jr.AK); W = y > 0 ? jr.AM / y : 0; Wfila = 'W = J / y máx (fibra más alejada)'; }
    else { W = jr.Q; Wfila = 'W = J / (h/2)'; }
    const C = n0(fl.C), Pp = F * C * 2.4, Ng = Pp + n0(fl.F) * n0(fl.G) * 0.7, Nq = Pp + n0(fl.F) * n0(fl.G) * 0.9;
    const M = n0(rr.G[i]) + n0(rr.N[i]) * hW, Ma = Math.abs(M);
    const comp = F > 0 && W > 0 ? (-Nq / F - Ma / W) * 0.1 : NaN, trac = F > 0 && W > 0 ? (-Ng / F + Ma / W) * 0.1 : NaN;
    pzs.push({ i, nom, forma, F, C, Pp, Ng, Nq, M, W, Wfila, comp, trac, e: Ng ? Ma / Ng : NaN, k: F ? W / F : NaN });
  }
  const pasos: Paso[] = [];
  // la pieza del ejemplo: la de más momento entre las que la hoja calcula (sin #DIV/0!)
  const ej = pzs.slice().sort((a, b) => Number(Number.isFinite(f.O[b.i])) - Number(Number.isFinite(f.O[a.i])) || Math.abs(b.M) - Math.abs(a.M))[0];
  if (ej) {
    const i = ej.i, fila = i + 4, n = ej.nom;
    pasos.push(
      { titulo: `Área de la pieza · ${n}`, formula: 'F = Σ b · h de sus muros', sustitucion: `F = ${num(ej.F, 3)} m²${ej.forma === 'asimétrica' ? ' (con el ala inferior)' : ''}`, analitico: ej.F, excel: f.B[i], celda: `${hoja}!B${fila}`, unidad: 'm²', dec: 3 },
      { titulo: `Peso propio · ${n}`, formula: 'Pp = F · altura · 2,4 t/m³', sustitucion: `Pp = ${num(ej.F, 3)} · ${num(ej.C, 1)} · 2,4`, analitico: ej.Pp, excel: f.E[i], celda: `${hoja}!E${fila}`, unidad: 't', dec: 1 },
      { titulo: `N descargado · ${n}`, formula: 'Ng = Pp + área de influencia · losas · 0,7 t/m²', sustitucion: `Ng = ${num(ej.Pp, 1)} + ${num(n0(x.d.flex[i]?.F), 1)} · ${num(n0(x.d.flex[i]?.G), 0)} · 0,7`, analitico: ej.Ng, excel: f.H[i], celda: `${hoja}!H${fila}`, unidad: 't', dec: 1 },
      { titulo: `N cargado · ${n}`, formula: 'Nq = Pp + área de influencia · losas · 0,9 t/m²', sustitucion: `Nq = ${num(ej.Pp, 1)} + ${num(n0(x.d.flex[i]?.F), 1)} · ${num(n0(x.d.flex[i]?.G), 0)} · 0,9`, analitico: ej.Nq, excel: f.I[i], celda: `${hoja}!I${fila}`, unidad: 't', dec: 1 },
      { titulo: `Momento en PB · ${n}`, formula: 'M = Mtras + Qrot · hW   (hW = Mv / Q)', sustitucion: `M = ${num(n0(rr.G[i]), 1)} + (${num(n0(rr.N[i]), 3)}) · ${num(hW, 2)}`, analitico: ej.M, excel: f.J[i], celda: `${hoja}!J${fila}`, unidad: 'tm', dec: 1,
        nota: 'La hoja lee O de «Rototrasl. cara mayor» = G + N (momento más corte); coincide solo si la pieza no tiene rotación.' },
      { titulo: `Módulo resistente · ${n} (${ej.forma})`, formula: ej.Wfila, sustitucion: `W = ${num(ej.W, 3)} m³`, analitico: ej.W, excel: f.W[i], celda: `${hoja}!M${fila} · F (fila de la hoja J)`, unidad: 'm³', dec: 3 },
      { titulo: `Excentricidad (descargado) · ${n}`, formula: 'e = M / Ng', sustitucion: `e = ${num(Math.abs(ej.M), 1)} / ${num(ej.Ng, 1)}`, analitico: ej.e, excel: f.K[i], celda: `${hoja}!K${fila}`, unidad: 'm', dec: 3 },
      { titulo: `Límite del núcleo central · ${n}`, formula: 'k = W / F  (si e > k, la sección tiene tracción)', sustitucion: `k = ${num(ej.W, 3)} / ${num(ej.F, 3)}`, analitico: ej.k, excel: f.M[i], celda: `${hoja}!M${fila}`, unidad: 'm', dec: 3 },
      { titulo: `Compresión máxima (cargado) · ${n}`, formula: 'σ = (−Nq / F − M / W) · 0,1', sustitucion: `σ = (−${num(ej.Nq, 1)} / ${num(ej.F, 3)} − ${num(Math.abs(ej.M), 1)} / ${num(ej.W, 3)}) · 0,1`, analitico: ej.comp, excel: f.O[i], celda: `${hoja}!O${fila}`, unidad: 'kg/cm²', dec: 1,
        nota: 'La columna O usa Ng (descargado): la compresión que decide es con el edificio cargado.' },
      { titulo: `Tracción máxima (descargado) · ${n}`, formula: 'σ = (−Ng / F + M / W) · 0,1', sustitucion: `σ = (−${num(ej.Ng, 1)} / ${num(ej.F, 3)} + ${num(Math.abs(ej.M), 1)} / ${num(ej.W, 3)}) · 0,1`, analitico: ej.trac, excel: f.P[i], celda: `${hoja}!P${fila}`, unidad: 'kg/cm²', dec: 1,
        nota: 'La columna P usa Nq (cargado): la tracción que decide es con el edificio descargado.' });
  }
  const dif: string[] = [];
  const d = (a: number, e: number) => comparar(a, e) === 'difiere';
  if (pzs.some(o => d(o.M, f.J[o.i]))) dif.push(`Momento (columna J): la hoja lee O de «Rototrasl. cara mayor» = G + N, el momento de traslación (tm) más el corte de rotación (t). El momento de la pieza es Mtras + Qrot · hW, con hW = ${num(hW, 2)} m. El error nace en «Rototrasl.» y esta hoja lo arrastra.`);
  if (pzs.some(o => o.Nq !== o.Ng)) dif.push('Combinaciones (columnas O y P): la hoja pone Ng (descargado) con la fibra comprimida y Nq (cargado) con la traccionada. Las que deciden son al revés: compresión máxima con Nq y tracción máxima con Ng. La diferencia es (Nq − Ng) / F en las dos, del lado inseguro.');
  const sinPp = pzs.filter(o => FLEX_D_FIJO.includes(o.i));
  if (sinPp.length) dif.push(`Peso propio: D13:D20 tienen 0,01 m³ fijo en lugar de F · altura, así que ${sinPp.map(o => o.nom).join(', ')} no ${sinPp.length > 1 ? 'suman' : 'suma'} su peso (Ng y Nq más chicos).`);
  const otraForma = pzs.filter(o => o.i < 20 && TIPO_FILA_PARALELOS[o.i] !== o.forma);
  if (otraForma.length) dif.push(`Tipo de fila: el W lo elige la fila (filas 4–10 simétricas, 11–14 asimétricas, 21–23 tubos), no la pieza. ${otraForma.map(o => `${o.nom} (${o.forma}) está en la fila ${o.i + 4}, que es para piezas ${TIPO_FILA_PARALELOS[o.i] === 'circular' ? 'circulares' : TIPO_FILA_PARALELOS[o.i] === 'asimétrica' ? 'asimétricas' : 'simétricas'}`).join('; ')}: la hoja lee el W de un molde que la pieza no usa${otraForma.some(o => !Number.isFinite(f.O[o.i])) ? ' y da #DIV/0!' : ''}. La hoja lo avisa en J25: hay que cambiar el vínculo a mano.`);
  if (!nuevo && pzs.some(o => o.forma === 'circular')) dif.push('Tubos (planilla virgen): V = U/S/2 da J / (2D), la cuarta parte del W de un tubo (J / (D/2)): la tensión de flexión sale 4 veces más grande. La planilla 2025 ya lo corrigió.');
  if (pzs.some(o => o.forma === 'asimétrica')) dif.push('Piezas asimétricas: la hoja divide el J por la mitad de la altura (AN) y su área (O de la hoja J) no suma el ala inferior AH · AI. El analítico usa la distancia a la fibra más alejada y el área completa.');
  if (nuevo && pzs.some(o => o.i < 20 && flexFilaNuevo(o.i) !== ranuraFilaNuevo(o.i))) dif.push('Planilla 2025: desde la fila 10, el área y el W salen de una fila de la hoja J y el momento de otra (B10 = O14, pero J10 lee la pieza de AY10): son piezas distintas.');
  const peorC = pzs.reduce<Pz | null>((m, o) => (!m || o.comp < m.comp ? o : m), null), peorT = pzs.reduce<Pz | null>((m, o) => (!m || o.trac > m.trac ? o : m), null);
  // lo peor de la hoja, entre las piezas que calcula (sin #DIV/0!)
  const finitos = (c: 'O' | 'P') => pzs.map(o => f[c][o.i]).filter(Number.isFinite);
  const exC = finitos('O').length ? Math.min(...finitos('O')) : null, exT = finitos('P').length ? Math.max(...finitos('P')) : null;
  return {
    hoja,
    temas: [
      { titulo: 'Flexión compuesta', texto: 'En la base de cada pieza: σ = −N/F ± M/W (compresión negativa). Si la excentricidad e = M/N supera el núcleo central k = W/F, una fibra queda traccionada y lleva armadura.', fuente: 'guía 5' },
      { titulo: 'Cargas', texto: 'N = peso propio + área de influencia × losas × 0,7 t/m² (descargado) o 0,9 t/m² (cargado).', fuente: 'guía 5' },
      { titulo: 'Las dos que deciden', texto: 'Compresión máxima con el edificio cargado; tracción máxima con el edificio descargado.', fuente: 'guía 5' },
    ],
    datos: [{ nombre: 'Mv en PB', valor: `${num(rr.F5, 1)} tm` }, { nombre: 'Q en PB', valor: `${num(rr.D5, 2)} t` }, { nombre: 'hW = Mv / Q', valor: `${num(hW, 2)} m` }, { nombre: 'Piezas del viento A', valor: String(pzs.length) }],
    pasos,
    tablas: pzs.length ? [{
      titulo: 'Cada pieza del viento A (PB)', columnas: [{ nombre: 'Ng', unidad: 't', dec: 1 }, { nombre: 'M', unidad: 'tm', dec: 1 }, { nombre: 'σ compresión', unidad: 'kg/cm²', dec: 1 }, { nombre: 'σ tracción', unidad: 'kg/cm²', dec: 1 }],
      filas: pzs.map(o => ({ etiqueta: `${o.nom} · fila ${o.i + 4} · ${o.forma}`, valores: [[o.Ng, f.H[o.i]], [o.M, f.J[o.i]], [o.comp, f.O[o.i]], [o.trac, f.P[o.i]]] })),
      nota: 'Excel: columnas H, J, O y P. La hoja llama O a la «compresión descargado» y P a la «compresión o tracción cargado». El área, Nq y W de cada pieza están en el paso por paso.',
    }] : [],
    controles: peorC && peorT ? [
      { nombre: `Compresión del hormigón (peor pieza: ${peorC.nom})`, criterio: `|σ| ≤ ${adm} kg/cm² (${x.hormigon})`, unidad: 'kg/cm²', dec: 1, analitico: peorC.comp, excel: exC, cumpleAnalitico: Math.abs(peorC.comp) <= adm, cumpleExcel: exC === null ? null : Math.abs(exC) <= adm,
        nota: 'Excel: la compresión más grande de la columna O, entre las piezas que la hoja calcula.' },
      { nombre: `Tracción (peor pieza: ${peorT.nom})`, criterio: 'σ ≤ 0; si no, armadura (guía 5)', unidad: 'kg/cm²', dec: 1, analitico: peorT.trac, excel: exT, cumpleAnalitico: peorT.trac <= 0, cumpleExcel: exT === null ? null : exT <= 0,
        nota: 'Con tracción la pieza no «falla»: lleva armadura (T = σ · b · x / 2). La app la calcula en Controles, muro por muro.' },
    ] : [],
    diferencias: dif,
  };
}

/** el desglose de las siete hojas */
export function desglosar(x: EntradaDesglose): HojaDesglose[] {
  return [hojaViento(x), hojaMNyQ(x), hojaJ(x, false), hojaJ(x, true), hojaRoto(x, false), hojaRoto(x, true), hojaFlex(x), ...(x.exo ? [hojaExo(x)] : [])];
}

/**
 * Hoja 8 · Exoesqueleto (viento A): el cálculo a mano de la propuesta (las columnas de esquina como un tubo, con la
 * relación de módulos; las cruces como rigidez al corte; la torre y el exo como dos resortes en paralelo) contra el
 * pórtico plano de la app (barras, nudos y la ménsula de los tabiques resueltos juntos). La mano supone la carga pareja
 * en altura (8EJ) y un exo de tubo arriostrado en X; las diferencias con el pórtico son esperables y se explican.
 */
function hojaExo(x: EntradaDesglose): HojaDesglose {
  const e = x.exo!, hoja = 'Exoesqueleto';
  const n = e.E / e.Eh, d = e.ancho / 2, Jexo = n * 4 * e.Ac * d * d;
  const th = Math.atan2(e.hMod, e.ancho), S = 4 * e.E * e.Ad * Math.cos(th) ** 2 * Math.sin(th);
  const dF = (e.W * e.h ** 3) / (8 * e.Eh * Jexo), dC = (e.W * e.h) / (2 * S), dExo = dF + dC;
  const Kexo = e.W / dExo, dTab = (e.W * e.h ** 3) / (8 * e.Eh * e.Jtab), Ktab = e.W / dTab;
  const dJunto = e.W / (Ktab + Kexo), frac = Kexo / (Ktab + Kexo), Jeq = (e.W * e.h ** 3) / (8 * e.Eh * dExo);
  const app = 'etapa 08 (pórtico)', deg = (th * 180) / Math.PI;
  const pasos: Paso[] = [
    { titulo: 'Relación de módulos', formula: 'n = E acero / E hormigón', sustitucion: `n = ${num(e.E, 0)} / ${num(e.Eh, 0)}`, analitico: n, excel: null, celda: '—', unidad: '', dec: 2, nota: 'El acero se pasa a hormigón multiplicando su J por n, como en las secciones mixtas.' },
    { titulo: 'J de las columnas de esquina (en hormigón)', formula: 'J exo = n · Σ Ac · d²  (4 columnas a d = ancho / 2)', sustitucion: `J = ${num(n, 2)} · 4 · ${num(e.Ac, 4)} · ${num(d, 2)}²`, analitico: Jexo, excel: null, celda: '—', unidad: 'm⁴', dec: 1 },
    { titulo: 'Ángulo de las diagonales', formula: 'θ = atan(h módulo / ancho)', sustitucion: `θ = atan(${num(e.hMod, 2)} / ${num(e.ancho, 2)})`, analitico: deg, excel: null, celda: '—', unidad: '°', dec: 1 },
    { titulo: 'Rigidez al corte de las cruces', formula: 'S = Σ E · Ad · cos²θ · sen θ  (2 caras × 2 diagonales)', sustitucion: `S = 4 · ${num(e.E, 0)} · ${num(e.Ad, 4)} · ${num(Math.cos(th) ** 2, 3)} · ${num(Math.sin(th), 3)}`, analitico: S, excel: null, celda: '—', unidad: 't', dec: 0 },
    { titulo: 'Flecha del exo solo: flexión + corte', formula: 'δ exo = W h³ / (8 E J exo) + W h / (2 S)', sustitucion: `δ = ${num(dF * 1000, 1)} + ${num(dC * 1000, 1)} mm`, analitico: dExo * 1000, excel: null, celda: '—', unidad: 'mm', dec: 1, nota: 'Un reticulado se deforma también por corte (los tabiques llenos casi no): por eso su J equivalente es menor que el de las columnas solas.' },
    { titulo: 'Flecha de los tabiques solos', formula: 'δ tab = W h³ / (8 E ΣJ)', sustitucion: `δ = ${num(e.W, 1)} · ${num(e.h, 2)}³ / (8 · ${num(e.Eh, 0)} · ${num(e.Jtab, 2)})`, analitico: dTab * 1000, excel: null, celda: '—', unidad: 'mm', dec: 1 },
    { titulo: 'Flecha de la torre con el exo (dos resortes en paralelo)', formula: 'δ = W / (K tab + K exo), K = W / δ', sustitucion: `δ = ${num(e.W, 1)} / (${num(Ktab, 0)} + ${num(Kexo, 0)})`, analitico: dJunto * 1000, excel: e.app.u * 1000, celda: app, unidad: 'mm', dec: 1, nota: 'El pórtico de la app usa el viento real de cada piso (no parejo) y las barras con sus uniones: la diferencia mide cuánto simplifica la cuenta a mano.' },
    { titulo: 'Parte del viento que toma el exo', formula: 'K exo / (K tab + K exo)', sustitucion: `${num(Kexo, 0)} / (${num(Ktab, 0)} + ${num(Kexo, 0)})`, analitico: frac * 100, excel: e.app.fraccion * 100, celda: app, unidad: '%', dec: 0 },
    { titulo: 'J equivalente del exo (el que va a la hoja J)', formula: 'J eq = W h³ / (8 E δ exo)', sustitucion: `J eq = ${num(e.W, 1)} · ${num(e.h, 2)}³ / (8 · ${num(e.Eh, 0)} · ${num(dExo, 4)})`, analitico: Jeq, excel: e.app.Jeq, celda: app, unidad: 'm⁴', dec: 1, nota: 'La app da el J equivalente de una cara; la cuenta a mano, el de las dos caras juntas.' },
  ];
  const lim = e.h / 500;
  return {
    hoja,
    temas: [{ titulo: 'El exoesqueleto como otra ménsula', texto: 'El exo es una ménsula más ancha puesta por fuera: las losas lo atan a los tabiques, se deforman juntos y cada uno toma el viento según su rigidez, como dos resortes en paralelo.', fuente: 'propuesta del exoesqueleto, pág. 3' }],
    datos: [
      { nombre: 'Ficha', valor: e.nombreTipo }, { nombre: 'Ancho de la cara', valor: `${num(e.ancho, 2)} m` }, { nombre: 'Altura', valor: `${num(e.h, 2)} m` },
      { nombre: 'Viento total (A)', valor: `${num(e.W, 1)} t` }, { nombre: 'Columna / diagonal', valor: `${num(e.Ac * 1e4, 0)} / ${num(e.Ad * 1e4, 0)} cm²` }, { nombre: 'ΣJ de los tabiques', valor: `${num(e.Jtab, 2)} m⁴` },
    ],
    pasos, tablas: [],
    controles: [{ nombre: 'Flecha de la azotea con el exo', criterio: `δ ≤ h/500 = ${num(lim * 1000, 0)} mm`, unidad: 'mm', dec: 1, analitico: dJunto * 1000, excel: e.app.u * 1000, cumpleAnalitico: dJunto <= lim, cumpleExcel: e.app.u <= lim }],
    diferencias: [
      ...(e.tipo !== 'D' ? [`La cuenta a mano es la de un tubo arriostrado en X (ficha D); con la ficha ${e.nombreTipo} solo sirve de orden de magnitud.`] : []),
      'En la columna «Excel» va el resultado del pórtico plano de la app: la planilla de la cátedra no tiene exoesqueleto.',
    ],
  };
}

/** resumen de una hoja: cuántos pasos coinciden y si los controles verifican con los dos cálculos */
export function resumenHoja(h: HojaDesglose) {
  const todos = [...h.pasos.map(p => comparar(p.analitico, p.excel)), ...h.tablas.flatMap(t => t.filas.flatMap(f => f.valores.map(([a, e]) => comparar(a, e))))];
  const niveles = [...h.pasos.map(p => diferencia(p.analitico, p.excel)?.nivel), ...h.tablas.flatMap(t => t.filas.flatMap(f => f.valores.map(([a, e]) => diferencia(a, e)?.nivel)))];
  return {
    amarillos: niveles.filter(n => n === 'amarillo').length, rojos: niveles.filter(n => n === 'rojo').length,
    coinciden: todos.filter(t => t === 'coincide').length, difieren: todos.filter(t => t === 'difiere').length, total: todos.length,
    verificaAnalitico: h.controles.every(c => c.cumpleAnalitico), verificaExcel: h.controles.every(c => c.cumpleExcel !== false),
  };
}

/** texto corto de la diferencia: «✓ coincide», «≠ 3,2 % · Δ +0,41 t» o «≠ Δ +3,74 t (analítico 0)» */
export function textoDiferencia(a: number, e: number | null, unidad = '', dec = 2): { texto: string; corto: string; nivel: Semaforo | null } {
  const d = diferencia(a, e);
  if (!d) return { texto: '—', corto: '', nivel: null };
  const u = unidad ? ` ${unidad}` : '';
  const delta = isFinite(d.delta) ? `${d.delta >= 0 ? '+' : '−'}${num(Math.abs(d.delta), dec)}${u}` : '';
  const pct = d.pct === null ? '' : `${num(d.pct, d.pct < 10 ? 1 : 0)} %`;
  if (d.nivel === 'verde') return { texto: '✓ coincide', corto: '✓', nivel: 'verde' };
  return { texto: d.pct === null ? `≠ Δ ${delta} (analítico 0)` : `≠ ${pct} · Δ ${delta}`, corto: d.pct === null ? `Δ ${delta}` : pct, nivel: d.nivel };
}
