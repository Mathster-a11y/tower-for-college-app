/**
 * Viento según CIRSOC 102-25 (Reglamento Argentino de Acción del Viento sobre las Construcciones, edición julio 2025),
 * procedimiento direccional para el sistema principal resistente a la fuerza del viento (SPRFV), capítulo 2, parte 1.
 * Es la capa «cargas» de los métodos CIRSOC y FEM (plan de trabajo, etapa 3).
 *
 * Diferencias con el 102-2005 que usan la planilla y la guía (ver docs/plan_metodos.html, sección B):
 *  - V depende de la categoría de riesgo (Fig. 1.5-1D) y es de «resistencia»: en las combinaciones el viento va con 1,0;
 *  - Kz = 2,41 · (z/zg)^(2/α) (Tabla 1.13-1), con z ≥ 5 m; exposiciones B, C y D (Tabla 1.9-1);
 *  - qz = 0,613 · Kz · Kzt · Kd · Ke · V² (1.13-1), sin factor de importancia;
 *  - G = 0,85 si n1 ≥ 1 Hz (rígido, art. 1.9.4); si no, Gf (art. 1.9.5);
 *  - frecuencia aproximada para tabiques de hormigón: na = 117,3 · √Cw / h (1.9-5);
 *  - carga mínima 0,75 kN/m² sobre la pared (art. 2.1.5);
 *  - cuatro casos de carga, dos con torsión (art. 2.4.6, Fig. 2.4-8).
 *
 * Unidades: m, N/m² para las presiones (como el reglamento) y t para las fuerzas (1 t = 9,80665 kN, exacto: no se
 * redondea a 10 como la planilla).
 */
import { entraEnCalculo, rectangulos, tipoDe, type Proyecto } from '../modelo';
import { propiedades } from '../perfil';

export const KN_POR_T = 9.80665;

// ------------------------------------------------------------------------------------------------- tablas del reglamento
export type CategoriaRiesgo = 'I' | 'II' | 'III-IV';
/** Fig. 1.5-1D: velocidad básica V (m/s) por ciudad y categoría de riesgo (I, II, III y IV) */
export const CIUDADES: Record<string, [number, number, number]> = {
  'Bahía Blanca': [62.8, 67.4, 72.2], 'Bariloche': [52.5, 56.3, 60.4], 'Buenos Aires': [51.4, 55.1, 59.1], 'Catamarca': [49.1, 52.7, 56.5],
  'Comodoro Rivadavia': [77.1, 82.7, 88.7], 'Córdoba': [51.4, 55.1, 59.1], 'Corrientes': [52.5, 56.3, 60.4], 'Formosa': [51.4, 55.1, 59.1],
  'La Plata': [52.5, 56.3, 60.4], 'La Rioja': [50.3, 53.9, 57.8], 'Mar del Plata': [58.3, 62.5, 67.0], 'Mendoza': [44.6, 47.8, 51.2],
  'Neuquén': [54.8, 58.8, 63.0], 'Paraná': [59.4, 63.7, 68.3], 'Posadas': [51.4, 55.1, 59.1], 'Rawson': [68.5, 73.5, 78.8],
  'Resistencia': [51.4, 55.1, 59.1], 'Río Gallegos': [68.5, 73.5, 78.8], 'Rosario': [57.1, 61.2, 65.7], 'Salta': [40.0, 42.9, 46.0],
  'San Juan': [45.7, 49.0, 52.5], 'San Luis': [51.4, 55.1, 59.1], 'San Miguel de Tucumán': [45.7, 49.0, 52.5], 'San Salvador de Jujuy': [38.8, 41.6, 44.7],
  'Santa Fe': [58.3, 62.5, 67.0], 'Santa Rosa': [57.1, 61.2, 65.7], 'Santiago del Estero': [49.1, 52.7, 56.5], 'Ushuaia': [68.5, 73.5, 78.8],
  'Viedma': [68.5, 73.5, 78.8],
};
export const INDICE_CATEGORIA: Record<CategoriaRiesgo, 0 | 1 | 2> = { I: 0, II: 1, 'III-IV': 2 };

export type Exposicion = 'B' | 'C' | 'D';
/** Tabla 1.9-1: constantes de exposición del terreno */
export const EXPOSICIONES: Record<Exposicion, { alfa: number; zg: number; aHat: number; bHat: number; aBar: number; bBar: number; c: number; l: number; eBar: number; zmin: number }> = {
  B: { alfa: 7.5, zg: 1000, aHat: 1 / 7.5, bHat: 0.84, aBar: 1 / 4.5, bBar: 0.47, c: 0.30, l: 98, eBar: 1 / 3.0, zmin: 9.2 },
  C: { alfa: 9.8, zg: 750, aHat: 1 / 9.8, bHat: 1.00, aBar: 1 / 6.4, bBar: 0.66, c: 0.20, l: 152, eBar: 1 / 5.0, zmin: 4.6 },
  D: { alfa: 11.5, zg: 590, aHat: 1 / 11.5, bHat: 1.09, aBar: 1 / 8.0, bBar: 0.78, c: 0.15, l: 198, eBar: 1 / 8.0, zmin: 2.1 },
};
export type Cerramiento = 'cerrado' | 'parcialmente cerrado' | 'parcialmente abierto' | 'abierto';
/** Tabla 1.11-1: coeficiente de presión interna (±) */
export const GCPI: Record<Cerramiento, number> = { cerrado: 0.18, 'parcialmente cerrado': 0.55, 'parcialmente abierto': 0.18, abierto: 0 };
/** Tabla 1.6-1: edificios, SPRFV */
export const KD_EDIFICIOS = 0.85;
/** Fig. C AB.4.2-1: velocidad de servicio = factor · V50 (V50: la del CIRSOC 102-2005 = V de categoría II / √1,5, C 1.5-6.1) */
export const FACTOR_SERVICIO: Record<number, number> = { 5: 0.78, 10: 0.84, 25: 0.93, 50: 1.0, 100: 1.07, 200: 1.14, 500: 1.23 };

// ------------------------------------------------------------------------------------------------- fórmulas sueltas
/** Tabla 1.13-1, nota 1: Kz = 2,41 · (z / zg)^(2/α), con z ≥ 5 m (y ≤ zg) */
export const Kz = (z: number, e: Exposicion) => { const x = EXPOSICIONES[e]; return 2.41 * (Math.min(Math.max(z, 5), x.zg) / x.zg) ** (2 / x.alfa); };
/** Tabla 1.12-1, nota 2: Ke = e^(−0,000119 · altitud) */
export const Ke = (altitud: number) => Math.exp(-0.000119 * Math.max(0, altitud));
/** 1.13-1: presión dinámica (N/m²) */
export const qz = (Kz_: number, Kzt: number, Kd: number, Ke_: number, V: number) => 0.613 * Kz_ * Kzt * Kd * Ke_ * V * V;
/** Fig. 2.4-1: Cp de la pared a sotavento según L/B (interpolado entre 0–1: −0,5, 2: −0,3, ≥ 4: −0,2) */
export function cpSotavento(LsobreB: number): number {
  if (LsobreB <= 1) return -0.5;
  if (LsobreB <= 2) return -0.5 + (LsobreB - 1) * 0.2;
  if (LsobreB <= 4) return -0.3 + ((LsobreB - 2) / 2) * 0.1;
  return -0.2;
}
export const CP_BARLOVENTO = 0.8, CP_LATERAL = -0.7;

export interface Rafaga { zBar: number; Iz: number; Lz: number; Q: number; G: number; Gf?: number; Vz?: number; N1?: number; Rn?: number; Rh?: number; RB?: number; RL?: number; R?: number; gR?: number }
/**
 * Factor de efecto de ráfaga (art. 1.9.4 y 1.9.5): G calculado (rígido, 1.9-6) y, si se da n1, Gf (flexible, 1.9-10).
 * h, B, L en m; V en m/s; n1 en Hz; beta = relación de amortiguamiento (0,02 = 2 %).
 */
export function rafaga(h: number, B: number, L: number, e: Exposicion, V: number, n1?: number, beta = 0.02): Rafaga {
  const x = EXPOSICIONES[e], gQ = 3.4, gv = 3.4;
  const zBar = Math.max(0.6 * h, x.zmin);
  const Iz = x.c * (10 / zBar) ** (1 / 6);                         // 1.9-7
  const Lz = x.l * (zBar / 10) ** x.eBar;                          // 1.9-9
  const Q = Math.sqrt(1 / (1 + 0.63 * ((B + h) / Lz) ** 0.63));    // 1.9-8
  const G = 0.925 * ((1 + 1.7 * gQ * Iz * Q) / (1 + 1.7 * gv * Iz));
  const out: Rafaga = { zBar, Iz, Lz, Q, G };
  if (!(n1 && n1 > 0)) return out;
  const Vz = x.bBar * (zBar / 10) ** x.aBar * V;                  // 1.9-16
  const N1 = (n1 * Lz) / Vz;                                       // 1.9-14
  const Rn = (7.47 * N1) / (1 + 10.3 * N1) ** (5 / 3);             // 1.9-13
  const Rl = (eta: number) => (eta > 0 ? 1 / eta - (1 - Math.exp(-2 * eta)) / (2 * eta * eta) : 1);   // 1.9-15a
  const Rh = Rl((4.6 * n1 * h) / Vz), RB = Rl((4.6 * n1 * B) / Vz), RL = Rl((15.4 * n1 * L) / Vz);
  const R = Math.sqrt((1 / beta) * Rn * Rh * RB * (0.53 + 0.47 * RL));          // 1.9-12
  const ln = Math.sqrt(2 * Math.log(3600 * n1));
  const gR = ln + 0.577 / ln;                                                    // 1.9-11
  const Gf = 0.925 * ((1 + 1.7 * Iz * Math.sqrt(gQ * gQ * Q * Q + gR * gR * R * R)) / (1 + 1.7 * gv * Iz));   // 1.9-10
  return { ...out, Gf, Vz, N1, Rn, Rh, RB, RL, R, gR };
}

/** Frecuencias aproximadas (art. 1.9.3) */
export const naPorticoAcero = (h: number) => 8.58 / h ** 0.8;      // 1.9-2
export const naPorticoHormigon = (h: number) => 14.93 / h ** 0.9;  // 1.9-3
export const naOtros = (h: number) => 22.86 / h;                    // 1.9-4
/** 1.9-5: tabiques de hormigón o mampostería; muros: área en planta Ai (m²), largo Di (m) y alto hi (m); AB = área de la base */
export function naTabiques(h: number, AB: number, muros: { A: number; D: number; h: number }[]): { na: number; Cw: number } {
  const Cw = AB > 0 ? (100 / AB) * muros.reduce((s, m) => s + ((h / m.h) ** 2 * m.A) / (1 + 0.83 * (m.h / m.D) ** 2), 0) : 0;
  return { na: h > 0 ? (117.3 * Math.sqrt(Cw)) / h : NaN, Cw };
}

// ------------------------------------------------------------------------------------------------- datos del proyecto
export interface DatosCirsoc102 {
  /** ciudad de la Fig. 1.5-1D, o vacío para escribir V a mano (Vmanual) */
  ciudad?: string | null; Vmanual?: number | null;
  categoria?: CategoriaRiesgo; exposicion?: Exposicion;
  /** factor topográfico (art. 1.8; 1 = terreno llano) y altitud del terreno sobre el nivel del mar (m; Ke) */
  Kzt?: number; altitud?: number;
  cerramiento?: Cerramiento;
  /** frecuencia: «tabiques» (1.9-5), «otros» (1.9-4) o «manual» (n1 de un análisis, por ejemplo el FEM) */
  frecuencia?: 'tabiques' | 'otros' | 'manual'; n1manual?: number | null;
  /** relación de amortiguamiento (0,02 = 2 %, hormigón) */
  beta?: number;
  /** recurrencia del viento de servicio (años): 5, 10, 25, 50, 100, 200 o 500 */
  recurrenciaServicio?: number;
}
export const DATOS_102_POR_DEFECTO: Required<DatosCirsoc102> = {
  ciudad: 'Mar del Plata', Vmanual: null, categoria: 'II', exposicion: 'B', Kzt: 1, altitud: 0, cerramiento: 'cerrado',
  frecuencia: 'tabiques', n1manual: null, beta: 0.02, recurrenciaServicio: 10,
};
/**
 * La ciudad y la exposición que no se eligieron salen de los datos del 102-2005 que ya tiene el proyecto: la ciudad cuya
 * V de categoría II / √1,5 (la V50 del 102-2005, C 1.5-6.1) da la V del proyecto (48 m/s → Neuquén; 51 → Mar del Plata),
 * y la exposición según α (la A del 102-2005, centro de grandes ciudades, no existe en el 102-25 y pasa a B).
 */
export function datos102De(p: Proyecto): Required<DatosCirsoc102> {
  const d: Required<DatosCirsoc102> = { ...DATOS_102_POR_DEFECTO, ...(p.cirsoc102 ?? {}) } as Required<DatosCirsoc102>;
  if (!p.cirsoc102?.ciudad && !p.cirsoc102?.Vmanual && p.sitio?.V > 0) {
    const cerca = Object.entries(CIUDADES).map(([c, v]) => [c, Math.abs(v[1] / Math.sqrt(1.5) - p.sitio.V)] as const).sort((a, b) => a[1] - b[1])[0];
    if (cerca && cerca[1] < 0.3) d.ciudad = cerca[0];
  }
  if (!p.cirsoc102?.exposicion && p.sitio?.alfa > 0) d.exposicion = p.sitio.alfa >= 11 ? 'D' : p.sitio.alfa >= 9 ? 'C' : 'B';
  return d;
}
/** período del 102-2005 que usa la guía (2.1.5, tabiques): T = 0,08 · h/√L · √(h / (L + h)); solo para comparar */
export const periodoGuia2005 = (h: number, L: number) => 0.08 * (h / Math.sqrt(L)) * Math.sqrt(h / (L + h));

// ------------------------------------------------------------------------------------------------- cálculo completo
export interface NivelViento102 {
  nivel: string; z: number; Kz: number; qz: number;
  /** presión de diseño en barlovento y sotavento (N/m², con su signo) y la neta del conjunto (N/m²) */
  pBarlo: number; pSota: number; pNeta: number;
  /** ancho que recibe el viento (m), altura de influencia (m) y fuerza del nivel (t) */
  ancho: number; hInf: number; W: number;
  /** corte y momento acumulados desde arriba, sobre este nivel (t, tm) */
  Q: number; M: number;
}
export interface Direccion102 {
  dir: 'A' | 'B';
  /** B: ancho normal al viento; L: dimensión paralela (planta de PB) */
  B: number; L: number;
  Cps: number; Kh: number; qh: number;
  n1: number; metodoFrecuencia: string; Cw?: number; Lef: number; aproximadaValida: boolean;
  /** otras estimaciones de la frecuencia, para comparar (Hz): 1.9-4 y la del 102-2005 que usa la guía */
  n1Otros: number; n1Guia2005: number;
  rigido: boolean; rafaga: Rafaga; Gusado: number;
  niveles: NivelViento102[];
  /** fuerza total sobre PB, mínima del art. 2.1.5 (t) y si mandó la mínima */
  W: number; Wmin: number; mandaMinimo: boolean;
  /** corte y momento en PB (t, tm) */
  QPB: number; MPB: number;
  /** franja expuesta de PB (de 0 a medio entrepiso): va al terreno, no a los tabiques (t) */
  WPB: number;
}
export interface Viento102 {
  V: number; V50: number; ciudad: string | null; categoria: CategoriaRiesgo; exposicion: Exposicion;
  Kd: number; Ke: number; Kzt: number; GCpi: number; h: number;
  A: Direccion102; B: Direccion102;
  /** casos de carga de la Fig. 2.4-8, en PB: fuerzas (t) y momento torsor (tm) por dirección */
  casos: CasoCarga[];
  servicio: { recurrencia: number; factor: number; Va: number; relacion: number };
}
export interface CasoCarga { caso: 1 | 2 | 3 | 4; texto: string; QA: number; QB: number; MtA: number; MtB: number; Mt: number }

/** el ancho y el largo de la planta de cada nivel (los que faltan son los del nivel de arriba) */
function plantas(p: Proyecto) {
  let B = 0, L = 0;
  return p.niveles.map(n => { B = n.B ?? B; L = n.L ?? L; return { ...n, B, L }; });
}

/** @param n1 frecuencias de un análisis (el modal del FEM), por dirección: mandan sobre los datos */
export function viento102(p: Proyecto, n1?: { A: number; B: number }): Viento102 {
  const n1Fem = n1;
  const d = datos102De(p);
  const cat = d.categoria, exp = d.exposicion;
  const fila = d.ciudad ? CIUDADES[d.ciudad] : undefined;
  const V = d.Vmanual && d.Vmanual > 0 ? d.Vmanual : fila ? fila[INDICE_CATEGORIA[cat]] : CIUDADES['Mar del Plata'][1];
  const V50 = (fila ? fila[1] : V) / Math.sqrt(1.5);
  const Kd = KD_EDIFICIOS, Ke_ = Ke(d.altitud), Kzt = d.Kzt > 0 ? d.Kzt : 1, GCpi = GCPI[d.cerramiento];
  const pl = plantas(p);
  const iPB = pl.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const zPB = pl[iPB]?.cota ?? 0;
  const sobre = pl.slice(0, iPB + 1);                         // de arriba hacia PB
  const h = (sobre[0]?.cota ?? 0) - zPB;                      // altura media de cubierta (cubierta plana)
  const BPB = pl[iPB]?.B ?? 0, LPB = pl[iPB]?.L ?? 0;
  const zFund = pl[pl.length - 1]?.cota ?? zPB, zTop = pl[0]?.cota ?? zPB;

  const direccion = (dir: 'A' | 'B'): Direccion102 => {
    const A = dir === 'A';
    const B = A ? BPB : LPB, L = A ? LPB : BPB;
    const Cps = cpSotavento(B > 0 ? L / B : 1);
    const Kh = Kz(h, exp), qh = qz(Kh, Kzt, Kd, Ke_, V);
    // frecuencia (art. 1.9.2 y 1.9.3); Lef = Σ hi·Li / Σ hi (1.9-1)
    const hs = sobre.map((n, k) => ({ h: n.cota - zPB, L: A ? n.L : n.B, dz: k === 0 ? 0 : sobre[k - 1].cota - n.cota })).filter(x => x.h > 0);
    const Lef = hs.reduce((s, x) => s + x.h * x.L, 0) / (hs.reduce((s, x) => s + x.h, 0) || 1);
    const aproximadaValida = h < 90 && h < 4 * Lef;
    let n1: number, metodo: string, Cw: number | undefined;
    if (n1Fem && n1Fem[dir] > 0) { n1 = n1Fem[dir]; metodo = 'n1 del análisis modal (FEM)'; }
    else if (d.frecuencia === 'manual' && d.n1manual && d.n1manual > 0) { n1 = d.n1manual; metodo = 'n1 de un análisis (dato)'; }
    else if (d.frecuencia === 'otros') { n1 = naOtros(h); metodo = 'na = 22,86 / h (1.9-4)'; }
    else {
      // los tabiques paralelos al viento: los rectángulos de cada muro (un perfil, su caja con su área; los tubos
      // circulares no son tabiques), como la hoja «Datos» de la planilla renovada
      const muros = p.muros.filter(m => entraEnCalculo(m, zFund, zTop) && tipoDe(m) !== 'tubo-circ').flatMap(m => {
        const hi = Math.max(0.01, Math.min(m.zHasta ?? zTop, zTop) - Math.max(m.zDesde ?? zPB, zPB));
        if (tipoDe(m) === 'perfil') { const k = propiedades(m.perfil!); return [{ ax: 2 * k.cB, ay: 2 * k.cA, A: k.A, hi }]; }
        return rectangulos(m).map(r => ({ ax: r.ax, ay: r.ay, A: r.ax * r.ay, hi }));
      }).filter(r => (A ? r.ay > r.ax : r.ax > r.ay))   // paralelos al viento
        .map(r => ({ A: r.A, D: A ? r.ay : r.ax, h: r.hi }));
      const t = naTabiques(h, BPB * LPB, muros);
      n1 = t.na; Cw = t.Cw; metodo = 'na = 117,3 · √Cw / h (1.9-5, tabiques)';
    }
    const raf = rafaga(h, B, L, exp, V, n1, d.beta);
    const rigido = n1 >= 1;
    const G = rigido ? 0.85 : raf.Gf ?? raf.G;
    // presiones y fuerzas por nivel (barlovento con qz, sotavento con qh; la presión interna se anula en el conjunto)
    const niveles: NivelViento102[] = [];
    let Q = 0, M = 0, zAnt = 0;
    sobre.forEach((n, k) => {
      const z = n.cota - zPB;
      if (z <= 0) return;
      const arriba = k === 0 ? 0 : (sobre[k - 1].cota - n.cota) / 2, abajo = (n.cota - sobre[k + 1 < sobre.length ? k + 1 : k].cota) / 2;
      const hInf = arriba + abajo + (k === 0 ? (p.sitio.parapeto ?? 0) : 0);
      const kz = Kz(z, exp), q = qz(kz, Kzt, Kd, Ke_, V);
      const pB = q * G * CP_BARLOVENTO - qh * GCpi, pS = qh * G * Cps - qh * GCpi;
      const ancho = A ? n.B : n.L;
      const W = ((pB - pS) * ancho * hInf) / 1000 / KN_POR_T;
      M += Q * (zAnt - z); Q += W; zAnt = z;
      niveles.push({ nivel: n.nombre, z, Kz: kz, qz: q, pBarlo: pB, pSota: pS, pNeta: pB - pS, ancho, hInf, W, Q, M });
    });
    const W = niveles.reduce((s, x) => s + x.W, 0);
    // carga mínima (art. 2.1.5): 0,75 kN/m² por el área de pared proyectada (sobre PB)
    const area = niveles.reduce((s, x) => s + x.ancho * x.hInf, 0);
    const Wmin = (0.75 * area) / KN_POR_T;
    const mandaMinimo = W < Wmin;
    if (mandaMinimo && W > 0) { const f = Wmin / W; let q2 = 0, m2 = 0, za = niveles[0]?.z ?? 0; niveles.forEach(x => { x.W *= f; m2 += q2 * (za - x.z); q2 += x.W; za = x.z; x.Q = q2; x.M = m2; }); }
    const ult = niveles[niveles.length - 1];
    const MPB = ult ? ult.M + ult.Q * ult.z : 0;
    const QPB = ult?.Q ?? 0;
    // franja de PB (0 a medio entrepiso): presión de z = 5 m (Kz mínimo)
    const hPB = ult ? ult.z / 2 : 0;
    const q5 = qz(Kz(0, exp), Kzt, Kd, Ke_, V);
    const WPB = (((q5 * G * CP_BARLOVENTO) - (qh * G * Cps)) * B * hPB) / 1000 / KN_POR_T;
    return { dir, B, L, Cps, Kh, qh, n1, metodoFrecuencia: metodo, Cw, Lef, aproximadaValida, n1Otros: naOtros(h), n1Guia2005: 1 / periodoGuia2005(h, L), rigido, rafaga: raf, Gusado: G, niveles, W: Math.max(W, Wmin), Wmin, mandaMinimo, QPB, MPB, WPB };
  };
  const dA = direccion('A'), dB = direccion('B');
  // casos de carga (Fig. 2.4-8): 1 = cada dirección sola; 2 = 75 % con torsión e = ±0,15 B; 3 = 75 % de las dos;
  // 4 = 56,3 % de las dos con las dos torsiones. MT = fracción · (PW + PL) · B · e por unidad de altura → en PB, Q · 0,15 B
  const t = (x: Direccion102) => x.QPB * 0.15 * x.B;
  const casos: CasoCarga[] = [
    { caso: 1, texto: 'Presión total en cada dirección, por separado', QA: dA.QPB, QB: dB.QPB, MtA: 0, MtB: 0, Mt: 0 },
    { caso: 2, texto: '75 % en cada dirección, por separado, con momento torsor (e = ±0,15 B)', QA: 0.75 * dA.QPB, QB: 0.75 * dB.QPB, MtA: 0.75 * t(dA), MtB: 0.75 * t(dB), Mt: Math.max(0.75 * t(dA), 0.75 * t(dB)) },
    { caso: 3, texto: '75 % en las dos direcciones a la vez', QA: 0.75 * dA.QPB, QB: 0.75 * dB.QPB, MtA: 0, MtB: 0, Mt: 0 },
    { caso: 4, texto: '56,3 % en las dos direcciones a la vez, con los dos momentos torsores', QA: 0.563 * dA.QPB, QB: 0.563 * dB.QPB, MtA: 0.563 * t(dA), MtB: 0.563 * t(dB), Mt: 0.563 * (t(dA) + t(dB)) },
  ];
  const rec = d.recurrenciaServicio in FACTOR_SERVICIO ? d.recurrenciaServicio : 10;
  const factor = FACTOR_SERVICIO[rec], Va = factor * V50;
  return {
    V, V50, ciudad: fila ? d.ciudad! : null, categoria: cat, exposicion: exp, Kd, Ke: Ke_, Kzt, GCpi, h, A: dA, B: dB, casos,
    servicio: { recurrencia: rec, factor, Va, relacion: (Va / V) ** 2 },
  };
}
