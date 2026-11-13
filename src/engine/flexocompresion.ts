/**
 * Verificación a flexocompresión de tabiques, columnas y tubos en PB, muro por muro, como la guía
 * («Edificio en torre» 2024, sección 5):
 *
 *   σ = −N / F ± M / W
 *
 *  - N de cada muro = peso propio (sección × altura × 2,4 t/m³) + carga de losa × su área de influencia × n.º de losas,
 *    sin sobrecarga (0,7 t/m², «descargado») y con sobrecarga (0,9 t/m², «cargado»).
 *  - M = la parte del momento en PB que toma la pieza (traslación + rotación).
 *  - En una pieza de varios muros, cada muro se verifica con su propio N: las almas (paralelas al viento) a
 *    flexocompresión; las alas (perpendiculares) «hacen un par»: reciben la fuerza axial M·A·d / J (para una pieza
 *    simétrica es lo mismo que M_alas / z de la guía).
 *  - Tracción (edificio descargado): T = σ⁺·b·x / 2 (triángulo de tracción, x por semejanza de triángulos),
 *    As = T / σe (σe = 2400 kg/cm²); se compara con la cuantía mínima de 0,8 % de la sección.
 *  - Compresión (edificio cargado): |σ| ≤ σbk del hormigón (H30 → 300 kg/cm²), el límite que usa la guía.
 */
import type { PiezaEquivalente } from './mapping';
import type { ResultadoCorregido } from './correcciones';
import { areaMuro, dInterior, presenteEn, rectangulos, tipoDe, type Muro, type Proyecto } from './modelo';
import { propiedades } from './perfil';

export const PE_HORMIGON = 2.4;       // t/m³
export const Q_DESCARGADO = 0.7;      // t/m²
export const Q_CARGADO = 0.9;         // t/m²
export const SIGMA_E = 2400;          // kg/cm², acero
export const CUANTIA_MIN = 0.008;

export interface ParteMuro {
  /** muro al que pertenece */
  id: string;
  papel: 'alma' | 'ala' | 'tubo';
  /** área (m²), ancho transversal b (m), largo en el sentido del viento h (m) */
  A: number; b: number; h: number;
  /** posición de su baricentro en el sentido del viento, desde el de la pieza (m) */
  d: number;
}

export interface VerifMuro {
  id: string;
  papel: 'alma' | 'ala' | 'tubo';
  A: number; b: number; h: number; d: number;
  /** peso propio y carga de losas (t) */
  Pp: number; losaDesc: number; losaCarg: number;
  Ndesc: number; Ncarg: number;
  /** tensión por flexión en la fibra más alejada (alma) o axial del par (ala), t/m² */
  sigM: number;
  /** tensiones en las dos fibras extremas (t/m²; + tracción, − compresión), edificio descargado y cargado */
  desc: [number, number]; carg: [number, number];
  /** compresión con el viento al revés en la fibra más alejada (t/m²) */
  cargReves: number;
  /** máxima tracción (descargado) y máxima compresión (cargado, cualquier sentido del viento), kg/cm² */
  traccion: number; compresion: number;
  /** armadura por tracción (cm²) y mínima (cm²); x = largo traccionado (m); T = fuerza de tracción (t) */
  x: number; T: number; As: number; AsMin: number;
  verifica: boolean;
}

export interface VerifPieza {
  nombre: string;
  dir: 'A' | 'B';
  /** momento que toma la pieza en PB (tm), su J (m⁴) con la geometría de sus muros */
  M: number; J: number;
  muros: VerifMuro[];
  /** peor tracción y peor compresión de la pieza (kg/cm²) */
  traccion: number; compresion: number;
  verifica: boolean;
  avisos: string[];
}

export interface DatosAltura { zPB: number; zTop: number; zFund: number; cotasSobrePB: number[]; }

/** Partes de una pieza en el sentido del viento (s = y para el viento A, x para el B), con su baricentro y J. */
export function partesDePieza(muros: Muro[], dir: 'A' | 'B'): { partes: ParteMuro[]; J: number; circular: { D: number; d: number } | null } {
  const lista: { id: string; papel: ParteMuro['papel']; A: number; b: number; h: number; s: number; Jp?: number }[] = [];
  let circular: { D: number; d: number } | null = null;
  for (const m of muros) {
    const t = tipoDe(m);
    if (t === 'tubo-circ') {
      circular = { D: m.largo, d: dInterior(m) };
      lista.push({ id: m.id, papel: 'tubo', A: areaMuro(m), b: m.largo, h: m.largo, s: dir === 'A' ? m.y : m.x });
      continue;
    }
    if (t === 'perfil') {
      // perfil: una parte con su J exacto; h = 2·c (la fibra real más alejada) para las tensiones de borde
      const k = propiedades(m.perfil!), c = dir === 'A' ? k.cA : k.cB;
      lista.push({ id: m.id, papel: 'alma', A: k.A, b: k.A / (2 * c), h: 2 * c, s: dir === 'A' ? m.y : m.x, Jp: dir === 'A' ? k.JA : k.JB });
      continue;
    }
    for (const r of rectangulos(m)) {
      const h = dir === 'A' ? r.ay : r.ax, b = dir === 'A' ? r.ax : r.ay;
      lista.push({ id: m.id, papel: t === 'tubo-rect' ? (h >= b ? 'alma' : 'ala') : h >= b ? 'alma' : 'ala', A: r.ax * r.ay, b, h, s: dir === 'A' ? r.y : r.x });
    }
  }
  const At = lista.reduce((a, p) => a + p.A, 0);
  const sc = At > 0 ? lista.reduce((a, p) => a + p.A * p.s, 0) / At : 0;
  let J = 0;
  if (circular && lista.length === 1) J = (Math.PI * (circular.D ** 4 - circular.d ** 4)) / 64;
  else lista.forEach(p => { J += (p.Jp ?? (p.b * p.h ** 3) / 12) + p.A * (p.s - sc) ** 2; });
  return { partes: lista.map(p => ({ id: p.id, papel: p.papel, A: p.A, b: p.b, h: p.h, d: p.s - sc })), J, circular };
}

/** Altura sobre PB y número de losas que carga un muro (las de los niveles sobre PB donde está). */
export function alturaYLosas(m: Muro, alt: DatosAltura): { altura: number; losas: number } {
  const top = Math.min(m.zHasta ?? alt.zTop, alt.zTop);
  const altura = Math.max(0, top - alt.zPB);
  const losas = alt.cotasSobrePB.filter(z => z <= top + 1e-6 && presenteEnOLlega(m, z, alt)).length;
  return { altura, losas };
}
const presenteEnOLlega = (m: Muro, z: number, alt: DatosAltura) => presenteEn(m, z, alt.zFund, alt.zTop) || Math.abs((m.zHasta ?? alt.zTop) - z) < 1e-6;

/**
 * Verificación de una pieza.
 * @param M momento que toma la pieza en PB (tm), con su signo indistinto (el viento se invierte)
 * @param adm límite de compresión: σbk del hormigón (kg/cm²), como la guía
 */
export function verificarPieza(nombre: string, dir: 'A' | 'B', muros: Muro[], M: number, alt: DatosAltura, adm: number): VerifPieza {
  const { partes, J } = partesDePieza(muros, dir);
  const avisos: string[] = [];
  const Mabs = Math.abs(M);
  const porMuro = new Map(muros.map(m => [m.id, m]));
  const areaDe = new Map<string, number>();
  partes.forEach(p => areaDe.set(p.id, (areaDe.get(p.id) ?? 0) + p.A));
  const out: VerifMuro[] = partes.map(p => {
    const m = porMuro.get(p.id)!;
    const { altura, losas } = alturaYLosas(m, alt);
    const frac = p.A / (areaDe.get(p.id) || p.A);            // un tubo rectangular reparte su área de influencia entre sus 4 caras
    const Pp = p.A * altura * PE_HORMIGON;
    const losaDesc = Q_DESCARGADO * m.areaInf * frac * losas, losaCarg = Q_CARGADO * m.areaInf * frac * losas;
    const Ndesc = Pp + losaDesc, Ncarg = Pp + losaCarg;
    let sigM: number, y1: number, y2: number;               // fibras extremas en el sentido del viento
    if (p.papel === 'ala') { sigM = J > 0 ? (Mabs * Math.abs(p.d)) / J : 0; y1 = y2 = p.d; }
    else {
      y1 = p.d - p.h / 2; y2 = p.d + p.h / 2;
      sigM = J > 0 ? (Mabs * Math.max(Math.abs(y1), Math.abs(y2))) / J : 0;
    }
    // el viento puede venir de los dos lados: se toma el sentido que tracciona la fibra más alejada
    const yc = Math.abs(y1) >= Math.abs(y2) ? y1 : y2, yo = yc === y1 ? y2 : y1;
    const sgn = Math.sign(yc) || 1;
    const f = (N: number, y: number) => -N / p.A + (J > 0 ? (Mabs * sgn * y) / J : 0);
    const desc: [number, number] = p.papel === 'ala' ? [-Ndesc / p.A + sigM, -Ndesc / p.A - sigM] : [f(Ndesc, yc), f(Ndesc, yo)];
    const carg: [number, number] = p.papel === 'ala' ? [-Ncarg / p.A + sigM, -Ncarg / p.A - sigM] : [f(Ncarg, yc), f(Ncarg, yo)];
    // El viento cambia de sentido: la tracción máxima es la fibra más alejada con el edificio descargado y la
    // compresión máxima, la misma fibra con el viento al revés y el edificio cargado (en un alma corrida del
    // baricentro de la pieza las dos fibras quedan del mismo lado y el diagrama de un solo sentido no la muestra).
    const sigT = Math.max(...desc), sigC = Math.min(...carg, -Ncarg / p.A - sigM);
    // armadura por tracción (descargado)
    let x = 0, T = 0;
    if (sigT > 0) {
      if (p.papel === 'ala') { x = p.h; T = sigT * p.A; }
      else {
        const sO = desc[0] === sigT ? desc[1] : desc[0];
        const b = p.papel === 'tubo' ? p.A / p.h : p.b;      // tubo circular: ancho equivalente
        if (sO >= 0) { x = p.h; T = ((sigT + sO) / 2) * p.A; }
        else { x = (p.h * sigT) / (sigT - sO); T = (sigT * b * x) / 2; }
      }
    }
    const As = (T * 1000) / SIGMA_E;                         // t → kg; cm²
    const AsMin = CUANTIA_MIN * p.A * 1e4;                   // m² → cm²
    const compresion = sigC / 10, traccion = sigT / 10;      // t/m² → kg/cm²
    return { id: p.id, papel: p.papel, A: p.A, b: p.b, h: p.h, d: p.d, Pp, losaDesc, losaCarg, Ndesc, Ncarg, sigM, desc, carg, cargReves: -Ncarg / p.A - sigM, traccion, compresion, x, T, As, AsMin, verifica: Math.abs(Math.min(0, compresion)) <= adm };
  });
  if (!out.length) avisos.push('La pieza no tiene muros en PB.');
  const traccion = Math.max(...out.map(v => v.traccion), -Infinity), compresion = Math.min(...out.map(v => v.compresion), Infinity);
  return { nombre, dir, M, J, muros: out, traccion, compresion, verifica: out.every(v => v.verifica), avisos };
}

/** Altura de la torre para la verificación: PB, azotea, fundación y las cotas de las losas sobre PB. */
export function datosAlturaDe(p: Proyecto): DatosAltura {
  const niv = p.niveles;
  const iPB = niv.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const zPB = iPB >= 0 ? niv[iPB].cota : 0;
  return { zPB, zTop: niv[0]?.cota ?? 0, zFund: niv[niv.length - 1]?.cota ?? 0, cotasSobrePB: niv.filter(n => n.cota > zPB + 1e-6).map(n => n.cota) };
}

/**
 * Todas las piezas de una dirección. El momento de cada pieza en PB es el momento total en PB
 * (M,NyQ columna J para el viento A, O para el B; valores corregidos) por la fracción de la fuerza que toma la pieza
 * en la rototraslación (traslación + rotación).
 */
export function verificarDireccion(p: Proyecto, piezas: PiezaEquivalente[], corr: ResultadoCorregido, filaNivel: number[], dir: 'A' | 'B', adm: number): VerifPieza[] {
  const alt = datosAltura(p);
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const k = filaNivel[iPB];
  const mn = corr.guia.mnyq;
  const MPB = k === undefined ? 0 : dir === 'A' ? mn.J[k] : mn.O[k];
  const rot = dir === 'A' ? corr.guia.rotA : corr.guia.rotB, rep = dir === 'A' ? corr.rotA : corr.rotB;
  const porId = new Map(p.muros.map(m => [m.id, m]));
  return piezas.filter(pz => pz.dir === dir && pz.filaHoja !== null).map(pz => {
    const frac = rot.D5 ? rep[pz.filaHoja!].Qtot / rot.D5 : 0;
    return verificarPieza(pz.nombre, dir, pz.muros.map(id => porId.get(id)!).filter(Boolean), MPB * frac, alt, adm);
  });
}
const datosAltura = (p: Proyecto) => datosAlturaDe(p);

/**
 * Peso que baja por cada muro en PB (t): peso propio de su altura más las losas que carga (área de influencia por la
 * carga de servicio por cada losa sobre PB donde está), como en la flexocompresión.
 */
export function pesoMuro(p: Proyecto, m: Muro, alt = datosAlturaDe(p)): { Pp: number; losa: number; N: number; losas: number } {
  const { altura, losas } = alturaYLosas(m, alt);
  const Pp = areaMuro(m) * altura * PE_HORMIGON, losa = Q_CARGADO * m.areaInf * losas;
  return { Pp, losa, N: Pp + losa, losas };
}
