/**
 * El procedimiento de la guía «Edificio en torre» 2024, paso a paso, en la forma de la «Planilla de la guía»
 * (etapa 5a del plan): nivel por nivel y rectángulo por rectángulo, con las mismas cuentas que tienen sus celdas.
 *
 * Sirve para dos cosas:
 *  - el libro Excel se arma con los mismos datos (datosGuia) y sus fórmulas hacen estas cuentas: las pruebas comparan
 *    el libro recalculado (con el evaluador de la app y con LibreOffice) contra este motor;
 *  - las pruebas comparan este motor con el método Guía de la app, para que el Excel y la app den lo mismo.
 *
 * A diferencia de la planilla de la cátedra, no hay filas fijas: un renglón por nivel (de la azotea a la fundación) y
 * uno por rectángulo de muro. El J de cada pieza sale de sus rectángulos con Steiner, como en la guía.
 *
 * Unidades: m, t, t/m², kg/cm² (tensiones de salida), cm² (armaduras); presiones del viento en N/m² → t/m² (/10 000,
 * como la planilla).
 */
import { areaMuro, dInterior, entraEnCalculo, factorPesoEspesor, losasDeNivel, rectangulos, tipoDe, type Proyecto } from '../modelo';
import { propiedades } from '../perfil';
import { propsPoligonos, seccionDebil } from '../aberturas';
import { DIVISORES } from '../planilla';
import type { PiezaEquivalente } from '../mapping';
import { DIAMETROS, areaBarra } from './guia';
import { sigmaAdmDe } from '../fundaciones';

// ---------------------------------------------------------------------------------------------------- datos
export interface NivelG { nombre: string; cota: number; B: number; L: number; pisos: number }
export interface RectG {
  muro: string;
  /** piezas a las que pertenece en cada viento (null: no entra a ninguna pieza; igual cuenta en la rotación) */
  piezaA: string | null; piezaB: string | null;
  /** centro (m) y medidas en x e y (m) */
  x: number; y: number; ax: number; ay: number;
  /** tubo circular (entra en la rotación de los dos vientos) */
  tubo: boolean;
  /** valores propios cuando no es un rectángulo (tubo circular, perfil): área y J para cada viento */
  A: number | null; JA: number | null; JB: number | null;
  /** solo en el primer rectángulo de cada muro: área de influencia (m²) y cota hasta donde llega (m) */
  areaInf: number | null; zHasta: number | null;
  /** factor del peso propio por espesores que cambian en altura (1 = espesor constante) */
  factor: number | null;
}
export interface DatosGuia {
  nombre: string;
  hormigon: string;
  viento: { V: number; Kd: number; I: number; zg: number; alfa: number; Kzt: number; G: number; Cpb: number; Cps: number; parapeto: number };
  coef: { gH: number; qD: number; qC: number; sigE: number; cuantia: number };
  fund: { a1: number; b1: number; sigmaAdm: number };
  niveles: NivelG[];
  piezas: { nombre: string; dir: 'A' | 'B' }[];
  rects: RectG[];
  /** aberturas de los tabiques (para el corte en los dinteles): posición del centro desde el centro del muro, ancho, desde y alto (m) */
  aberturas: { muro: string; viento: 'A' | 'B'; L: number; e: number; s: number; ancho: number; desde: number; alto: number }[];
  avisos: string[];
}

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** los datos del libro, sacados del proyecto (lo que la app escribe en la hoja «Datos») */
export function datosGuia(p: Proyecto, piezas: PiezaEquivalente[]): DatosGuia {
  const avisos: string[] = [];
  let B = 0, L = 0;
  const niveles = p.niveles.map(n => { B = n.B ?? B; L = n.L ?? L; return { nombre: n.nombre, cota: n.cota, B, L, pisos: losasDeNivel(n) }; });
  const zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0, zTop = p.niveles[0]?.cota ?? 0;
  const conPieza = piezas.filter(pz => pz.filaHoja !== null);
  const piezaDe = (id: string, dir: 'A' | 'B') => conPieza.find(pz => pz.dir === dir && pz.muros.includes(id))?.nombre ?? null;
  const rects: RectG[] = [];
  for (const m of p.muros.filter(m => entraEnCalculo(m, zFund, zTop))) {
    const t = tipoDe(m);
    const base = { muro: m.id, piezaA: piezaDe(m.id, 'A'), piezaB: piezaDe(m.id, 'B'), tubo: false, A: null, JA: null, JB: null, areaInf: null, zHasta: null, factor: null };
    const zTopM = Math.min(m.zHasta ?? zTop, zTop);
    const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1), zPB = p.niveles[iPB]?.cota ?? 0;
    const f = factorPesoEspesor(m, zPB, zTopM);
    const primero = { areaInf: m.areaInf, zHasta: zTopM, factor: Math.abs(f - 1) > 1e-9 ? r6(f) : null };
    if (t === 'tubo-circ') {
      const D = m.largo, d = dInterior(m), J = (Math.PI * (D ** 4 - d ** 4)) / 64;
      rects.push({ ...base, ...primero, x: m.x, y: m.y, ax: D, ay: D, tubo: true, A: areaMuro(m), JA: J, JB: J });
      continue;
    }
    if (t === 'perfil') {
      const k = propiedades(m.perfil!);
      rects.push({ ...base, ...primero, x: m.x, y: m.y, ax: 2 * k.cB, ay: 2 * k.cA, A: k.A, JA: k.JA, JB: k.JB });
      continue;
    }
    // tabique calado: como la app, su sección más débil (los pedazos del corte por las aberturas), cada uno con su área,
    // su J propio y su baricentro; el dintel se verifica aparte
    const deb = t === 'tabique' && m.aberturas?.length ? (seccionDebil(m) ?? []).filter(pg => pg.length >= 3) : [];
    const rr = rectangulos(m);
    if (deb.length && rr.length === 1) {
      // un renglón: las medidas del muro entero (la frecuencia lo toma entero, como la app) y, para la sección, el área,
      // el J y el baricentro del corte débil
      const k = propsPoligonos(deb);
      rects.push({ ...base, ...primero, x: k.xg, y: k.yg, ax: rr[0].ax, ay: rr[0].ay, A: k.A, JA: k.Jx, JB: k.Jy });
      continue;
    }
    rr.forEach((r, i) => rects.push({ ...base, ...(i === 0 ? primero : {}), x: r.x, y: r.y, ax: r.ax, ay: r.ay }));
  }
  const piezasL = conPieza.map(pz => ({ nombre: pz.nombre, dir: pz.dir }));
  const s = p.sitio;
  return {
    nombre: p.nombre, hormigon: p.hormigon || 'H30',
    viento: { V: s.V, Kd: s.Kd, I: s.I, zg: s.zg, alfa: s.alfa, Kzt: s.Kzt, G: s.G, Cpb: s.Cpb, Cps: s.Cps, parapeto: Math.max(0, s.parapeto ?? 0) },
    coef: { gH: 2.4, qD: 0.7, qC: 0.9, sigE: 2400, cuantia: 0.008 },
    fund: { a1: p.fundacion.a1, b1: p.fundacion.b1, sigmaAdm: sigmaAdmDe(p) },
    niveles, piezas: piezasL, rects, avisos,
    aberturas: p.muros.filter(m => entraEnCalculo(m, zFund, zTop) && tipoDe(m) === 'tabique' && m.aberturas?.length).flatMap(m => m.aberturas!.map(a => ({ muro: m.id, viento: (m.dir === 'Y' ? 'A' : 'B') as 'A' | 'B', L: m.largo, e: m.espesor, s: a.s, ancho: a.ancho, desde: a.desde, alto: a.alto }))),
  };
}

// ---------------------------------------------------------------------------------------------------- cálculo
export interface NivelCalc extends NivelG {
  sobrePB: boolean;
  /** altura de influencia (m), Kz, qz (N/m²), presión neta (t/m²) */
  D: number; Kz: number; qz: number; p: number;
  /** fuerza del nivel (t), corte del entrepiso de arriba (t) y momento en el nivel (tm), viento A y B */
  WA: number; WB: number; QA: number; MA: number; QB: number; MB: number;
  /** área de la losa (m²), peso del nivel (t) y peso acumulado (t) */
  area: number; peso: number; N: number;
}
export interface ParteCalc {
  rect: number; muro: string; pieza: string; papel: 'alma' | 'ala' | 'tubo';
  A: number; b: number; h: number; s: number; t: number; Jp: number;
  /** distancia al baricentro de la pieza en el sentido del viento (m) y Steiner A·d² (m⁴) */
  d: number; Ad2: number;
}
export interface PiezaCalc {
  nombre: string; dir: 'A' | 'B';
  A: number; s: number; t: number; J: number;
  /** distancia al eje de inercia (m), J·a², traslación, rotación y total (t), fracción del corte y momento en PB (tm) */
  a: number; Ja2: number; tras: number; rot: number; Q: number; frac: number; M: number;
}
export interface PerpCalc { rect: number; muro: string; J: number; pos: number; a: number; Ja2: number }
export interface RotoCalc { dir: 'A' | 'B'; Q: number; SJ: number; Xr: number; Sr: number; e: number; Mt: number; SJa2: number; piezas: PiezaCalc[]; perp: PerpCalc[]; MPB: number }
export interface FlexoCalc {
  pieza: string; dir: 'A' | 'B'; muro: string; papel: 'alma' | 'ala' | 'tubo'; A: number; b: number; h: number; d: number;
  altura: number; losas: number; Pp: number; losaD: number; losaC: number; Nd: number; Nc: number;
  M: number; J: number; sigM: number; y1: number; y2: number; yc: number; yo: number;
  dc: number; doo: number; cc: number; co: number; sigT: number; sigC: number;
  x: number; T: number; As: number; AsMin: number; traccion: number; compresion: number; verifica: boolean;
  largo: number; porMetro: number; phiV: number; sV: number; nV: number; phiH: number; sH: number; nH: number;
}
export interface ResultadoGuia {
  niveles: NivelCalc[];
  iPB: number; zPB: number; zTop: number; zFund: number; h: number; hTotal: number;
  qh: number; BPB: number; LPB: number;
  esbeltez: { A: number; B: number };
  totales: {
    WA: number; WB: number; WPB: number; brazoPB: number; WAtot: number; MAfund: number; MBfund: number; G: number;
    Me: number; vuelco: number; e: number; b6: number; eB: number; a6: number;
    sD: number; sC: number; sM: number; sMax: number; sMin: number;
    presionesFueraA: number; presionesFueraB: number;
  };
  partes: { A: ParteCalc[]; B: ParteCalc[] };
  roto: { A: RotoCalc; B: RotoCalc };
  rigidez: { divisor: number; E: number; JminA: number; JminB: number; flechaA: { qvMax: number; qvMin: number; qv: number; f: number }; flechaB: { qvMax: number; qvMin: number; qv: number; f: number }; fAdm: number };
  flexo: FlexoCalc[];
  sigAdm: number;
}

export const nroHormigon = (h: string) => parseFloat(h.replace(/[^\d.]/g, '')) || 30;
/** fila de la tabla del J mínimo: la del hormigón más alto que no supera al del proyecto (H30, H47, H60, H80) */
export const filaDivisor = (h: string) => { const n = nroHormigon(h); return [...DIVISORES].reverse().find(f => nroHormigon(f[0]) <= n) ?? DIVISORES[0]; };

/** barras como guia.barras, en la forma que usa la planilla (el diámetro que alcanza con s ≥ 10 cm) */
export function barrasPlanilla(pedido: number, largo: number, phiMin: number, sMax: number): { phi: number; s: number; n: number } {
  if (!(pedido > 0)) return { phi: phiMin, s: sMax, n: Math.max(2, Math.round((largo * 100) / sMax)) };
  const need = Math.max(phiMin, Math.sqrt((40 * pedido) / Math.PI));
  const phi = DIAMETROS.find(d => d >= need - 1e-12) ?? DIAMETROS[DIAMETROS.length - 1];
  const s = Math.min(sMax, Math.floor(((areaBarra(phi) / pedido) * 100) * 2) / 2);
  return { phi, s, n: Math.max(2, Math.round((largo * 100) / s)) };
}

export function calcularGuiaPasos(d: DatosGuia): ResultadoGuia {
  const v = d.viento, nv = d.niveles;
  const iPB = nv.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const zPB = nv[iPB]?.cota ?? 0, zTop = nv[0]?.cota ?? 0, zFund = nv[nv.length - 1]?.cota ?? 0;
  const Kz = (z: number) => 2.01 * Math.pow(Math.max(z, 5) / v.zg, 2 / v.alfa);
  const qz = (z: number) => 0.613 * v.Kzt * v.Kd * v.V ** 2 * v.I * Kz(z);
  const qh = qz(zTop);
  const pres = (z: number) => (qz(z) * v.G * v.Cpb - qh * v.G * v.Cps) / 10000;
  // viento y cargas, nivel por nivel
  const niveles: NivelCalc[] = [];
  nv.forEach((n, j) => {
    const sobrePB = j < iPB;
    const D = !sobrePB ? 0 : j === 0 ? (nv.length > 1 ? (nv[0].cota - nv[1].cota) / 2 : 0) + v.parapeto : (nv[j - 1].cota - nv[j + 1].cota) / 2;
    const k = sobrePB ? Kz(n.cota) : 0, q = sobrePB ? qz(n.cota) : 0, pp = sobrePB ? pres(n.cota) : 0;
    const WA = D * n.B * pp, WB = D * n.L * pp;
    const a = niveles[j - 1];
    const dz = j > 0 ? nv[j - 1].cota - n.cota : 0;
    const QA = a ? a.QA + a.WA : 0, QB = a ? a.QB + a.WB : 0;
    const MA = a ? a.MA + QA * dz : 0, MB = a ? a.MB + QB * dz : 0;
    const area = n.B * n.L, peso = d.coef.qD * area, N = (a?.N ?? 0) + peso;
    niveles.push({ ...n, sobrePB, D, Kz: k, qz: q, p: pp, WA, WB, QA, MA, QB, MB, area, peso, N });
  });
  const ult = niveles[niveles.length - 1];
  const sum = (f: (x: NivelCalc) => number) => niveles.reduce((s, x) => s + f(x), 0);
  const WA = sum(x => x.WA), WB = sum(x => x.WB);
  const BPB = nv[iPB]?.B ?? 0, LPB = nv[iPB]?.L ?? 0;
  // viento en la franja de PB (criterio C): va a los totales de la fundación, no al corte de los tabiques
  const hPB = iPB > 0 ? (nv[iPB - 1].cota - zPB) / 2 : 0;
  const WPB = iPB > 0 ? Math.max(0, hPB * BPB * pres(zPB)) : 0, brazoPB = zPB - zFund;
  const WAtot = WA + WPB, MAfund = (ult?.MA ?? 0) + WPB * brazoPB, MBfund = ult?.MB ?? 0, G = ult?.N ?? 0;
  const { a1, b1 } = d.fund;
  const Me = (G * b1) / 2;
  const sD = -G / (a1 * b1) / 10, sC = (-G * (d.coef.qC / d.coef.qD)) / (a1 * b1) / 10, sM = (-6 * MAfund) / a1 / b1 ** 2 / 10;
  const fuera = (dir: 'A' | 'B') => niveles.filter((x, j) => j > 0 && x.N > 0 && Math.abs((dir === 'A' ? x.MA : x.MB) / x.N) > (dir === 'A' ? x.L : x.B) / 6 + 1e-9).length;
  const totales = {
    WA, WB, WPB, brazoPB, WAtot, MAfund, MBfund, G, Me, vuelco: Me / MAfund, e: MAfund / G, b6: b1 / 6, eB: MBfund / G, a6: a1 / 6,
    sD, sC, sM, sMax: sC + sM, sMin: sD - sM, presionesFueraA: fuera('A'), presionesFueraB: fuera('B'),
  };

  // secciones: cada rectángulo en las piezas de cada viento (Steiner)
  const partesDir = (dir: 'A' | 'B'): ParteCalc[] => {
    const lista = d.rects.map((r, i) => {
      const pieza = dir === 'A' ? r.piezaA : r.piezaB;
      if (!pieza) return null;
      const h = dir === 'A' ? r.ay : r.ax, A = r.A ?? r.ax * r.ay, b = r.A !== null ? A / h : dir === 'A' ? r.ax : r.ay;
      const Jp = (dir === 'A' ? r.JA : r.JB) ?? (b * h ** 3) / 12;
      return { rect: i, muro: r.muro, pieza, papel: (r.tubo ? 'tubo' : h >= b ? 'alma' : 'ala') as ParteCalc['papel'], A, b, h, s: dir === 'A' ? r.y : r.x, t: dir === 'A' ? r.x : r.y, Jp, d: 0, Ad2: 0 };
    }).filter((x): x is ParteCalc => x !== null);
    const sc = new Map<string, number>();
    for (const pz of new Set(lista.map(x => x.pieza))) {
      const ps = lista.filter(x => x.pieza === pz), At = ps.reduce((s, x) => s + x.A, 0);
      sc.set(pz, At > 0 ? ps.reduce((s, x) => s + x.A * x.s, 0) / At : 0);
    }
    lista.forEach(x => { x.d = x.s - sc.get(x.pieza)!; x.Ad2 = x.A * x.d ** 2; });
    return lista;
  };
  const partes = { A: partesDir('A'), B: partesDir('B') };
  const piezasDir = (dir: 'A' | 'B') => d.piezas.filter(pz => pz.dir === dir).map(pz => {
    const ps = partes[dir].filter(x => x.pieza === pz.nombre);
    const A = ps.reduce((s, x) => s + x.A, 0);
    return { nombre: pz.nombre, dir, A, s: A > 0 ? ps.reduce((s, x) => s + x.A * x.s, 0) / A : 0, t: A > 0 ? ps.reduce((s, x) => s + x.A * x.t, 0) / A : 0, J: ps.reduce((s, x) => s + x.Jp + x.Ad2, 0) };
  });
  const pzA = piezasDir('A'), pzB = piezasDir('B');
  const eje = (ps: { J: number; t: number }[]) => { const SJ = ps.reduce((s, x) => s + x.J, 0); return SJ > 0 ? ps.reduce((s, x) => s + x.J * x.t, 0) / SJ : 0; };
  const XrA = eje(pzA), XrB = eje(pzB);
  const roto = (dir: 'A' | 'B'): RotoCalc => {
    const ps = dir === 'A' ? pzA : pzB, Xr = dir === 'A' ? XrA : XrB, Sr = dir === 'A' ? XrB : XrA;
    const Q = dir === 'A' ? WA : WB, MPB = niveles[iPB] ? (dir === 'A' ? niveles[iPB].MA : niveles[iPB].MB) : 0;
    const SJ = ps.reduce((s, x) => s + x.J, 0);
    // perpendiculares: los rectángulos más rígidos en la otra dirección (y los tubos circulares), con su J propio
    const perp: PerpCalc[] = [];
    d.rects.forEach((r, i) => {
      const hO = dir === 'A' ? r.ax : r.ay, bO = dir === 'A' ? r.ay : r.ax;
      const Jo = (dir === 'A' ? r.JB : r.JA) ?? (bO * hO ** 3) / 12, Je = (dir === 'A' ? r.JA : r.JB) ?? (hO * bO ** 3) / 12;
      if (!(r.tubo || Jo > Je)) return;
      const pos = dir === 'A' ? r.y : r.x;
      perp.push({ rect: i, muro: r.muro, J: Jo, pos, a: pos - Sr, Ja2: Jo * (pos - Sr) ** 2 });
    });
    const SJa2 = ps.reduce((s, x) => s + x.J * (x.t - Xr) ** 2, 0) + perp.reduce((s, x) => s + x.Ja2, 0);
    const e = Xr, Mt = Q * e;
    const piezas = ps.map(x => {
      const a = x.t - Xr, tras = SJ > 0 ? (Q * x.J) / SJ : 0, rot = SJa2 > 0 ? (-Q * e * x.J * a) / SJa2 : 0;
      const Qp = tras + rot, frac = Q > 0 ? Qp / Q : 0;
      return { ...x, a, Ja2: x.J * a * a, tras, rot, Q: Qp, frac, M: MPB * frac };
    });
    return { dir, Q, SJ, Xr, Sr, e, Mt, SJa2, piezas, perp, MPB };
  };
  const rotoA = roto('A'), rotoB = roto('B');

  // rigidez: J mínimo (h/500) y flecha de la ménsula
  const [, , div500] = filaDivisor(d.hormigon);
  const E = (div500 * 500) / 8;
  const sobre = niveles.filter(x => x.cota > 0);
  const flecha = (dir: 'A' | 'B') => {
    const ancho = dir === 'A' ? BPB : LPB, J = dir === 'A' ? rotoA.SJ : rotoB.SJ;
    const qvMax = (sobre[0]?.p ?? 0) * ancho, qvMin = (sobre[sobre.length - 1]?.p ?? 0) * ancho, qv = (qvMax + qvMin) / 2;
    return { qvMax, qvMin, qv, f: (qv * (zTop - zFund) ** 4) / (8 * E * J) };
  };
  const rigidez = { divisor: div500, E, JminA: (WA * zTop ** 2) / div500, JminB: (WB * zTop ** 2) / div500, flechaA: flecha('A'), flechaB: flecha('B'), fAdm: (zTop - zFund) / 500 };

  // flexocompresión en PB, muro por muro (alma, ala o tubo), y armado
  const sigAdm = nroHormigon(d.hormigon) * 10;
  const porMuro = new Map<string, RectG>();
  d.rects.forEach(r => { if (!porMuro.has(r.muro)) porMuro.set(r.muro, r); });
  const losasHasta = (top: number) => nv.reduce((s, n) => s + (n.cota > zPB + 1e-9 && n.cota <= top + 1e-6 ? n.pisos : 0), 0);
  const flexo: FlexoCalc[] = [];
  for (const dir of ['A', 'B'] as const) {
    const ro = dir === 'A' ? rotoA : rotoB;
    for (const pz of ro.piezas) {
      const ps = partes[dir].filter(x => x.pieza === pz.nombre);
      for (const x of ps) {
        const r0 = porMuro.get(x.muro)!;
        const Amuro = partes[dir].filter(y => y.muro === x.muro).reduce((s, y) => s + y.A, 0);
        const top = r0.zHasta ?? zTop;
        const altura = Math.max(0, top - zPB) * (r0.factor ?? 1), losas = losasHasta(top);
        const Pp = x.A * altura * d.coef.gH, frac = x.A / Amuro;
        const losaD = d.coef.qD * (r0.areaInf ?? 0) * frac * losas, losaC = d.coef.qC * (r0.areaInf ?? 0) * frac * losas;
        const Nd = Pp + losaD, Nc = Pp + losaC;
        const M = Math.abs(pz.M), J = pz.J;
        const ala = x.papel === 'ala';
        const y1 = ala ? x.d : x.d - x.h / 2, y2 = ala ? x.d : x.d + x.h / 2;
        const sigM = J > 0 ? (M * (ala ? Math.abs(x.d) : Math.max(Math.abs(y1), Math.abs(y2)))) / J : 0;
        // empate (alma centrada): la fibra de abajo, con tolerancia para que Excel y LibreOffice elijan la misma
        const lejos1 = Math.abs(y1) >= Math.abs(y2) - 1e-9;
        const yc = lejos1 ? y1 : y2, yo = lejos1 ? y2 : y1;
        const sgn = Math.sign(yc) || 1;
        const f = (N: number, y: number) => -N / x.A + (J > 0 ? (M * sgn * y) / J : 0);
        const dc = ala ? -Nd / x.A + sigM : f(Nd, yc), doo = ala ? -Nd / x.A - sigM : f(Nd, yo);
        const cc = ala ? -Nc / x.A + sigM : f(Nc, yc), co = ala ? -Nc / x.A - sigM : f(Nc, yo);
        const sigT = Math.max(dc, doo), sigC = Math.min(cc, co, -Nc / x.A - sigM);
        let xx = 0, T = 0;
        if (sigT > 0) {
          if (ala) { xx = x.h; T = sigT * x.A; }
          else {
            const sO = dc === sigT ? doo : dc, bb = x.papel === 'tubo' ? x.A / x.h : x.b;
            if (sO >= 0) { xx = x.h; T = ((sigT + sO) / 2) * x.A; } else { xx = (x.h * sigT) / (sigT - sO); T = (sigT * bb * xx) / 2; }
          }
        }
        const As = (T * 1000) / d.coef.sigE, AsMin = d.coef.cuantia * x.A * 1e4;
        const compresion = sigC / 10, traccion = sigT / 10;
        const largo = Math.max(x.b, x.h), porMetro = largo > 0 ? Math.max(As, AsMin) / 2 / largo : 0;
        const bv = barrasPlanilla(porMetro, largo, 8, 20), bh = barrasPlanilla(porMetro / 5, largo, 6, 25);
        flexo.push({ pieza: pz.nombre, dir, muro: x.muro, papel: x.papel, A: x.A, b: x.b, h: x.h, d: x.d, altura, losas, Pp, losaD, losaC, Nd, Nc, M, J, sigM, y1, y2, yc, yo,
          dc, doo, cc, co, sigT, sigC, x: xx, T, As, AsMin, traccion, compresion, verifica: Math.abs(Math.min(0, compresion)) <= sigAdm,
          largo, porMetro, phiV: bv.phi, sV: bv.s, nV: bv.n, phiH: bh.phi, sH: bh.s, nH: bh.n });
      }
    }
  }
  return {
    niveles, iPB, zPB, zTop, zFund, h: zTop - zPB, hTotal: zTop - zFund, qh, BPB, LPB,
    esbeltez: { A: (zTop - zPB) / LPB, B: (zTop - zPB) / BPB }, totales, partes, roto: { A: rotoA, B: rotoB }, rigidez, flexo, sigAdm,
  };
}
