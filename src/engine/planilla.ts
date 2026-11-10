/**
 * Réplica de las fórmulas de la planilla original «Edificios en torre» (versión 2025, 50 pisos).
 *
 * Cada función reproduce una hoja tal como la calcula Excel, incluidas sus particularidades
 * (rangos de suma, celdas con valor fijo, fórmulas que faltan). Un error de Excel (#DIV/0!, #NUM!)
 * se representa con NaN. Las correcciones propuestas NO van acá: están en `correcciones.ts`,
 * para poder mostrar siempre lado a lado «lo que da la planilla» y «lo que daría corregido».
 *
 * Convención de índices: los arreglos van de arriba hacia abajo, como las filas de la planilla.
 *  - viento: filas 5 a 58 → índice 0 a 53 (50º … 1º, 0º = PB, −1º, −2º, −3º)
 *  - M,NyQ: filas 4 a 57 → índice 0 a 53 (la fila r de M,NyQ lee la fila r+1 de viento)
 *  - hojas J y flexocompresión: filas 4 a 23 → piezas 1 a 20
 *  - rototraslación: filas 5 a 50 → índice 0 a 45 (5–24 paralelas, 28–29 atajo, 31–50 perpendiculares)
 */

export const N_FILAS = 54;
export const N_PIEZAS = 20;

export interface Viento {
  V: number; Kd: number; I: number; zg: number; alfa: number; Kzt: number; G: number;
  Cpb: number; Cps: number; GCpi: number | null;
  /** cota de cada nivel (viento!B5:B58) */
  Z: number[];
}

/** Valores escritos a mano en M,NyQ (null = la celda conserva su fórmula). */
export interface MNyQDatos {
  C: (number | null)[]; D: (number | null)[]; E: (number | null)[]; F: (number | null)[];
  /** N80: lado de la fundación paralelo al viento (b1) · N81: lado perpendicular (a1) */
  b1: number | null; a1: number | null;
}

/** Una fila de las hojas J: solo las columnas de datos. */
export interface FilaJ {
  B?: number; C?: number; F?: number; G?: number; J?: number; K?: number;
  S?: number; T?: number;
  W?: number; X?: number; Z?: number; AB?: number; AE?: number; AF?: number; AH?: number; AI?: number;
  AO?: number; AP?: number; AQ?: number; AT?: number; AU?: number;
  /** la fila no tiene las fórmulas Y y AC (filas 11–12 de «paralelos» en la planilla virgen) */
  sinYAC?: boolean;
  /** la celda O tiene un 0 fijo en lugar de la fórmula (filas 21–23 de «paralelos») */
  O0?: boolean;
}

export interface FilaFlex { C: number | null; F: number | null; G: number | null; }

export interface PlanillaDatos {
  viento: Viento;
  mnyq: MNyQDatos;
  jpar: FilaJ[];
  jort: FilaJ[];
  /** distancias H de cada hoja de rototraslación, filas 5 a 50 */
  rotA: { H: (number | null)[] };
  rotB: { H: (number | null)[] };
  flex: FilaFlex[];
}

// ------------------------------------------------------------------ utilidades
const div = (a: number, b: number) => (b === 0 || !isFinite(b) || !isFinite(a) ? NaN : a / b);
const n0 = (x: number | null | undefined) => (x === null || x === undefined ? 0 : x);
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
/** potencia como Excel: base negativa con exponente no entero da #NUM! */
const pow = (b: number, e: number) => (b < 0 && !Number.isInteger(e) ? NaN : Math.pow(b, e));
const maxOf = (a: number[]) => (a.some(Number.isNaN) ? NaN : Math.max(...a));

// ------------------------------------------------------------------ hoja «viento»
export interface VientoRes { Kz: number[]; qz: number[]; qh: number; P: number[]; Q: number[]; R: number[]; S: number[]; }

export interface Opciones {
  /** CIRSOC 102, Tabla 5, nota 2: debajo de 5 m, Kz con z = 5 m (la planilla usa la altura real) */
  kzMin5?: boolean;
}

export function calcViento(v: Viento, op: Opciones = {}): VientoRes {
  const Kz: number[] = [], qz: number[] = [], P: number[] = [], Q: number[] = [], R: number[] = [], S: number[] = [];
  // las fórmulas completas llegan hasta la fila 55 (PB); 56–58 (subsuelos) solo tienen la cota
  for (let i = 0; i < N_FILAS; i++) {
    if (i <= 50) {
      const z0 = n0(v.Z[i]);
      const z = op.kzMin5 && z0 > 0 ? Math.max(z0, 5) : z0;
      Kz[i] = 2.01 * pow(z / v.zg, 2 / v.alfa);
      qz[i] = 0.613 * v.Kzt * v.Kd * v.V ** 2 * v.I * Kz[i];
    } else {
      Kz[i] = 0;
      qz[i] = 0;
    }
  }
  const qh = maxOf(qz.slice(0, 51));
  for (let i = 0; i < N_FILAS; i++) {
    if (i <= 50) {
      P[i] = qz[i] * v.G * v.Cpb;
      Q[i] = qh * v.G * v.Cps;
      R[i] = P[i] - Q[i];
      S[i] = R[i] / 10000;
    } else {
      P[i] = 0; Q[i] = 0; R[i] = 0; S[i] = 0;
    }
  }
  return { Kz, qz, qh, P, Q, R, S };
}

// ------------------------------------------------------------------ hoja «M,NyQ»
export interface MNyQRes {
  B: number[]; C: number[]; D: number[]; E: number[]; F: number[]; G: number[]; H: number[]; I: number[]; J: number[];
  K: number[]; L: number[]; M: number[]; N: number[]; O: number[];
  H61: number; J61: number; M61: number; O61: number; F62: number;
  G65: number; G66: number; G67: number; G68: number; G69: number; G70: number;
  N82: number; N83: number; N84: number; N85: number; N86: number; N87: number; N89: number; N90: number;
  H99: number; I99: number; J99: number; K99: number; L99: number; M99: number; N99: number;
}

export function calcMNyQ(v: Viento, vr: VientoRes, d: MNyQDatos): MNyQRes {
  const B: number[] = [], C: number[] = [], D: number[] = [], E: number[] = [], F: number[] = [], G: number[] = [];
  const H: number[] = [], I: number[] = [], J: number[] = [], K: number[] = [], L: number[] = [], M: number[] = [];
  const N: number[] = [], O: number[] = [];
  for (let k = 0; k < N_FILAS; k++) B[k] = k === 0 ? 0 : n0(v.Z[k]);
  const Bnext = (k: number) => (k + 1 < N_FILAS ? B[k + 1] : 0); // M,NyQ!B58 está vacía
  for (let k = 0; k < N_FILAS; k++) {
    C[k] = d.C[k] ?? (k === 0 ? 0 : B[k - 1] - B[k]);
    D[k] = d.D[k] ?? (k === 0 ? 0 : (B[k - 1] - Bnext(k)) / 2);
    E[k] = d.E[k] ?? (k === 0 ? 0 : E[k - 1]);
    F[k] = d.F[k] ?? (k === 0 ? 0 : F[k - 1]);
    G[k] = k <= 50 ? vr.S[k] : 0; // G55:G57 apuntan a un libro externo: dan 0
    H[k] = D[k] * E[k] * G[k];
    I[k] = k === 0 ? 0 : H[k - 1] + I[k - 1];
    J[k] = k === 0 ? 0 : J[k - 1] + I[k] * C[k];
    K[k] = E[k] * F[k];
    L[k] = K[k] * 0.7;
    M[k] = k === 0 ? 0 : M[k - 1] + L[k];
    N[k] = k === 0 ? 0 : D[k - 1] * F[k - 1] * G[k - 1] + N[k - 1];
    O[k] = k === 0 ? 0 : O[k - 1] + N[k] * C[k];
  }
  const H61 = sum(H), J61 = J[53], M61 = M[53], O61 = O[53];
  const F62 = div(maxOf(B.slice(0, 52)), F[51]);
  const G65 = H61, G66 = div(J61, G65), G67 = M61, G68 = F[53] / 2, G69 = maxOf(B), G70 = F[48];
  const b1 = n0(d.b1), a1 = n0(d.a1);
  const N82 = b1 * a1, N83 = M61, N84 = (N83 / 7) * 9;
  const N85 = div(-N83, N82) / 10, N86 = div(-N84, N82) / 10;
  const N87 = div(div(-6 * J61, a1), b1 ** 2) / 10;
  const N89 = N86 + N87, N90 = N85 - N87;
  const H99 = J61, I99 = M61, J99 = b1 / 2, K99 = I99 * J99, L99 = div(K99, H99), M99 = div(G65 * G66, G67), N99 = J99 / 3;
  return { B, C, D, E, F, G, H, I, J, K, L, M, N, O, H61, J61, M61, O61, F62, G65, G66, G67, G68, G69, G70,
    N82, N83, N84, N85, N86, N87, N89, N90, H99, I99, J99, K99, L99, M99, N99 };
}

// ------------------------------------------------------------------ hojas J
export interface FilaJRes {
  D: number; I: number; M: number; N: number; O: number; P: number; Q: number; R: number; U: number; V: number;
  Y: number; AC: number; AG: number; AJ: number; AK: number; AL: number; AM: number; AN: number;
  AS: number; AW: number; AX: number; AY: number;
}
export interface HojaJRes { filas: FilaJRes[]; AY24: number; N24: number; AM24: number; }

export function calcFilaJ(f: FilaJ, ortogonales: boolean, ultimaFila: boolean): FilaJRes {
  const g = (k: keyof FilaJ) => n0(f[k] as number | undefined);
  const B = g('B'), C = g('C'), F = g('F'), G = g('G'), J = g('J'), K = g('K'), S = g('S'), T = g('T');
  const W = g('W'), X = g('X'), Z = g('Z'), AB = g('AB'), AE = g('AE'), AF = g('AF'), AH = g('AH'), AI = g('AI');
  const AO = g('AO'), AP = g('AP'), AQ = g('AQ'), AT = g('AT'), AU = g('AU');
  const D = (B * C ** 3) / 12;
  const Hh = C / 2 + G / 2;
  const I = (F * G ** 3) / 12 + F * G * Hh * Hh;
  const Ll = C / 2 + K / 2;
  const M = (J * K ** 3) / 12 + J * K * Ll * Ll;
  const U = (3.14159 * (S ** 4 - T ** 4)) / 64;
  const N = D + I + M + (ortogonales && ultimaFila ? U : 0); // N23 de «ortogonales» suma también U
  const O = f.O0 ? 0 : B * C + F * G + J * K + Math.PI * (S / 2) ** 2 - Math.PI * (T / 2) ** 2 + W * X + Z * AB + AE * AF;
  const P = C + G + K;
  const Q = div(N, C / 2 + G / 2 + K / 2);
  const R = ortogonales ? ((B * C) / 2) * (C / 4) ** 2 + F * G * (C / 2 + G / 2) ** 2 : ((B * C) / 2) * (C / 4) + F * G * (C / 2 + G / 2);
  const V = div(div(U, S), 2);
  const area = W * X + Z * AB + AE * AF + AH * AI;
  const AK = div(W * X * X / 2 + Z * AB * (X + AB / 2) + AE * AF * (X + AF / 2) + AH * AI * (X + AB + AI / 2), area);
  const AL = div(W * X * W / 2 + Z * AB * Z / 2 + AE * AF * (W - AE / 2) + AH * AI * AH / 2, area);
  const Y = f.sinYAC ? 0 : (W * X ** 3) / 12 + W * X * (AK - X / 2) ** 2;
  const AC = f.sinYAC ? 0 : (Z * AB ** 3) / 12 + Z * AB * (AB / 2 + X - AK) ** 2;
  const AG = (AE * AF ** 3) / 12 + AE * AF * (AF / 2 + X - AK) ** 2;
  const AJ = (AH * AI ** 3) / 12 + AH * AI * (X + AB + AI / 2 - AK) ** 2;
  const AM = Y + AC + AG + AJ;
  const AN = div(AM, X / 2 + AB / 2 + AI / 2);
  const AR = AQ / 2 - AP / 2;
  const AS = (AO * AP ** 3) / 12 + AO * AP * AR ** 2;
  const AV = AQ / 2 - AU / 2;
  const AW = (AT * AU ** 3) / 12 + AT * AU * AV ** 2;
  const AX = AS + AW;
  const AY = N + U + AM + AX;
  return { D, I, M, N, O, P, Q, R, U, V, Y, AC, AG, AJ, AK, AL, AM, AN, AS, AW, AX, AY };
}

export function calcHojaJ(filas: FilaJ[], ortogonales: boolean): HojaJRes {
  const res = filas.map((f, i) => calcFilaJ(f, ortogonales, i === N_PIEZAS - 1));
  return { filas: res, AY24: sum(res.map(r => r.AY)), N24: sum(res.map(r => r.N)), AM24: sum(res.map(r => r.AM)) };
}

export interface JMinimo { W: number; h: number; tabla: { hormigon: string; h400: number; h500: number; h600: number }[]; }
const DIVISORES: [string, number, number, number][] = [
  ['H30', 68000, 54400, 45333], ['H47', 78000, 62400, 52000], ['H60', 81200, 64960, 54134], ['H80', 90200, 72160, 60134]];

export function calcJMinimo(m: MNyQRes, ortogonales: boolean): JMinimo {
  const W = ortogonales ? div(m.G65 * m.F[45], m.E[45]) : m.H61;          // ortogonales: G65·F49/E49
  const h = ortogonales ? m.G69 : maxOf(m.B.slice(0, 40));                  // paralelos: MAX(B4:B43)
  return { W, h, tabla: DIVISORES.map(([hormigon, a, b, c]) => ({ hormigon, h400: (W * h * h) / a, h500: (W * h * h) / b, h600: (W * h * h) / c })) };
}

// ------------------------------------------------------------------ rototraslación
export interface RotoRes {
  B: number[]; C: number[]; E: number[]; G: number[]; I: number[]; K: number[]; L: number[]; Mm: number[]; N: number[]; O: number[];
  D5: number; F5: number; B25: number; I25: number; J7: number; J15: number; J28: number; J38: number;
  B51: number; I51: number; M51: number; L25: number; C25: number; E25: number; G25: number;
}

/**
 * @param par J total de las piezas paralelas (AY de su hoja J)
 * @param per J total de las piezas perpendiculares (AY de la otra hoja J)
 * @param caraMenor la hoja «cara menor» tiene rangos de suma distintos (B51, I51, L25)
 */
export function calcRoto(par: number[], per: number[], H: (number | null)[], Q: number, Mv: number, caraMenor: boolean): RotoRes {
  const NR = 46;
  const B = new Array<number>(NR).fill(0), C = new Array<number>(NR).fill(NaN), E = new Array<number>(NR).fill(NaN);
  const G = new Array<number>(NR).fill(NaN), I = new Array<number>(NR).fill(0), K = new Array<number>(NR).fill(NaN);
  const L = new Array<number>(NR).fill(0), Mm = new Array<number>(NR).fill(0), N = new Array<number>(NR).fill(NaN);
  const O = new Array<number>(NR).fill(NaN);
  const h = (i: number) => n0(H[i]);
  for (let i = 0; i < 20; i++) B[i] = par[i];
  for (let j = 0; j < 20; j++) B[26 + j] = per[j];               // filas 31–50
  const B25 = sum(B.slice(0, 20));
  for (let i = 0; i < 20; i++) { C[i] = div(B[i], B25); E[i] = C[i] * Q; G[i] = C[i] * Mv; I[i] = B[i] * h(i); }
  for (let i = 23; i < NR; i++) I[i] = B[i] * h(i);                // filas 28–50
  const I25 = sum(I.slice(0, 20));
  const J7 = div(I25, B25);
  const J15 = Q * J7;
  const J28 = (h(23) + h(24)) / 2;
  const B51 = sum(B.slice(23, caraMenor ? 34 : NR));              // menor: SUM(B28:B38)
  const I51 = sum(I.slice(23, caraMenor ? 34 : NR));
  const J38 = div(I51, B51);
  for (const i of [23, 24, ...Array.from({ length: 20 }, (_, j) => 26 + j)]) C[i] = div(B[i], B51); // C28:C50 = B/B51
  for (let i = 0; i < 20; i++) { K[i] = h(i) - J7; L[i] = B[i] * K[i]; Mm[i] = B[i] * K[i] * K[i]; }
  for (let i = 23; i <= 24; i++) { K[i] = h(i) - J28; L[i] = B[i] * K[i]; Mm[i] = B[i] * K[i] * K[i]; }
  for (let i = 26; i < NR; i++) { K[i] = h(i) - J38; L[i] = B[i] * K[i]; Mm[i] = B[i] * K[i] * K[i]; }
  const M51 = sum(Mm);
  for (const i of [...Array(20).keys(), 23, 24, ...Array.from({ length: 20 }, (_, j) => 26 + j)]) {
    N[i] = -(J15 * L[i]) / M51;
    if (!isFinite(N[i])) N[i] = NaN;
  }
  for (let i = 0; i < 20; i++) O[i] = G[i] + N[i];
  for (const i of [23, 24, ...Array.from({ length: 20 }, (_, j) => 26 + j)]) O[i] = N[i];
  const L25 = sum(L.slice(0, caraMenor ? 20 : 15));                // mayor: SUM(L5:L19)
  return { B, C, E, G, I, K, L, Mm, N, O, D5: Q, F5: Mv, B25, I25, J7, J15, J28, J38, B51, I51, M51, L25,
    C25: sum(C.slice(0, 20)), E25: sum(E.slice(0, 20)), G25: sum(G.slice(0, 20)) };
}

// ------------------------------------------------------------------ flexocompresión
export type TipoFila = 'simétrica' | 'asimétrica' | 'circular';
/** Qué módulo resistente lee «Flex comp PB paralelos» en cada fila (lo fijan sus fórmulas). */
export const TIPO_FILA_PARALELOS: TipoFila[] = Array.from({ length: 20 }, (_, i) =>
  i >= 7 && i <= 10 ? 'asimétrica' : i >= 17 ? 'circular' : 'simétrica');

/** En la planilla original, D13:D20 de flexocompresión tienen 0,01 fijo en lugar de B·C: las piezas 10 a 17 no suman peso propio. */
export const FLEX_D_FIJO = [9, 10, 11, 12, 13, 14, 15, 16];

export interface FlexRes { B: number[]; D: number[]; E: number[]; H: number[]; I: number[]; J: number[]; K: number[]; L: number[]; M: number[]; Nn: number[]; O: number[]; P: number[]; W: number[]; }

export function calcFlex(jpar: HojaJRes, rot: RotoRes, d: FilaFlex[]): FlexRes {
  const r: FlexRes = { B: [], D: [], E: [], H: [], I: [], J: [], K: [], L: [], M: [], Nn: [], O: [], P: [], W: [] };
  for (let i = 0; i < 20; i++) {
    const j = jpar.filas[i];
    const tipo = TIPO_FILA_PARALELOS[i];
    const W = tipo === 'asimétrica' ? j.AN : tipo === 'circular' ? j.V : j.Q;
    const B = j.O, C = n0(d[i]?.C), F = n0(d[i]?.F), G = n0(d[i]?.G);
    const D = FLEX_D_FIJO.includes(i) ? 0.01 : B * C, E = D * 2.4, H = E + F * G * 0.7, I = E + F * G * 0.9, J = rot.O[i];
    r.B.push(B); r.D.push(D); r.E.push(E); r.H.push(H); r.I.push(I); r.J.push(J); r.W.push(W);
    r.K.push(div(J, H)); r.L.push(div(J, I));
    const M = div(W, B);
    r.M.push(M); r.Nn.push(M - div(J, H));
    r.O.push((div(-H, B) - div(J, W)) * 0.1);
    r.P.push((div(-I, B) + div(J, W)) * 0.1);
  }
  return r;
}

// ------------------------------------------------------------------ todo junto
export interface PlanillaRes {
  viento: VientoRes; mnyq: MNyQRes; jpar: HojaJRes; jort: HojaJRes; jminA: JMinimo; jminB: JMinimo;
  rotA: RotoRes; rotB: RotoRes; flex: FlexRes;
}

export function calcularPlanilla(d: PlanillaDatos, op: Opciones = {}): PlanillaRes {
  const viento = calcViento(d.viento, op);
  const mnyq = calcMNyQ(d.viento, viento, d.mnyq);
  const jpar = calcHojaJ(d.jpar, false);
  const jort = calcHojaJ(d.jort, true);
  const AYp = jpar.filas.map(f => f.AY), AYo = jort.filas.map(f => f.AY);
  // cara mayor: D5 = M,NyQ!I55, F5 = M,NyQ!J55 (fila del 1º subsuelo); cara menor: N55 y O55
  const rotA = calcRoto(AYp, AYo, d.rotA.H, mnyq.I[51], mnyq.J[51], false);
  const rotB = calcRoto(AYo, AYp, d.rotB.H, mnyq.N[51], mnyq.O[51], true);
  const flex = calcFlex(jpar, rotA, d.flex);
  return { viento, mnyq, jpar, jort, jminA: calcJMinimo(mnyq, false), jminB: calcJMinimo(mnyq, true), rotA, rotB, flex };
}
