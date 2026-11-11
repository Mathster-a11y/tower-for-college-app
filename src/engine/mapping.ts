/**
 * Del proyecto del alumno a los datos de la planilla original: cotas, anchos, perfiles equivalentes
 * en las hojas J, distancias de la rototraslación y datos de flexocompresión.
 *
 * Reglas del curso (acordadas con la cátedra / el alumno):
 *  - Un muro paralelo al viento es alma; uno perpendicular es ala y va al extremo del alma
 *    a la que se pega que tenga más cerca (si está justo en la mitad, arriba).
 *  - Cada muro va en una sola pieza por dirección, pero se carga en las dos direcciones.
 *  - Varias alas en un mismo extremo se juntan en una sola: espesores sumados y ancho que conserva el área
 *    (criterio provisorio: la medida del ala equivalente es una pregunta abierta para la cátedra).
 *  - La posición de cada pieza es el baricentro de sus muros, pesado por área, medido desde el eje de simetría de PB.
 *  - Plantilla simétrica: solo el muro suelto y la doble T con alas iguales y centradas en el alma.
 *    Todo lo demás (C, U, L, T, E, alas distintas) va en las columnas asimétricas, un muro por columna.
 *  - El tipo de fila es libre en las dos hojas. En «paralelos» se prefieren las filas en las que la hoja de
 *    flexocompresión lee el módulo que corresponde; si no alcanzan, se usa otra fila y la app calcula la
 *    flexocompresión con el módulo correcto (columna «Guía/CIRSOC») y avisa.
 */
import { N_FILAS, TIPO_FILA_PARALELOS, type FilaJ, type PlanillaDatos } from './planilla';
import { areaMuro, dInterior, entraEnCalculo, tipoDe, type Muro, type Proyecto } from './modelo';

export type Direccion = 'A' | 'B';
export type Papel = 'alma' | 'ala sup.' | 'ala inf.' | 'columna' | 'tubo' | 'fuera del cálculo' | 'sin pieza';
export type Molde = 'simétrico' | 'asimétrico' | 'tubo';

export interface PiezaEquivalente {
  nombre: string;
  dir: Direccion;
  muros: string[];
  molde: Molde;
  fila: FilaJ;
  /** posición en planta perpendicular al viento (m), desde el eje de simetría de PB */
  posicion: number;
  area: number;
  areaInf: number;
  /** fila asignada en la hoja J (0 a 19) o null si no entró */
  filaHoja: number | null;
  avisos: string[];
}

export interface Asignacion {
  datos: PlanillaDatos;
  piezas: PiezaEquivalente[];
  /** papel de cada muro en cada dirección */
  papeles: Record<string, { A: Papel; B: Papel }>;
  avisos: string[];
  /** índice de la fila de viento/M,NyQ de cada nivel del proyecto */
  filaNivel: number[];
}

/** Filas de «paralelos» a las que les faltan las fórmulas Y y AC en la planilla virgen (piezas 8 y 9). */
export const FILAS_SIN_YAC = [7, 8];
/** Filas de «paralelos» con O = 0 fijo (piezas 18 a 20). */
export const FILAS_O0 = [17, 18, 19];

const r4 = (x: number) => Math.round(x * 10000) / 10000;

// ------------------------------------------------------------------ perfil equivalente
interface Grupo { b: number; t: number; area: number; }
function juntar(ms: Muro[]): Grupo | null {
  if (!ms.length) return null;
  const t = ms.reduce((s, m) => s + m.espesor, 0);
  const area = ms.reduce((s, m) => s + m.espesor * m.largo, 0);
  return { b: r4(area / t), t: r4(t), area };
}

export function perfilEquivalente(nombre: string, dir: Direccion, muros: Muro[], papeles: Asignacion['papeles']): PiezaEquivalente {
  const dirAlma = dir === 'A' ? 'Y' : 'X';
  const s = (m: Muro) => (dir === 'A' ? m.y : m.x);            // coordenada en la dirección del viento
  const t = (m: Muro) => (dir === 'A' ? m.x : m.y);            // coordenada transversal
  const avisos: string[] = [];
  const area = muros.reduce((a, m) => a + areaMuro(m), 0);
  const posicion = r4(muros.reduce((a, m) => a + areaMuro(m) * t(m), 0) / area);
  const areaInf = muros.reduce((a, m) => a + m.areaInf, 0);
  const base = { nombre, dir, muros: muros.map(m => m.id), posicion, area, areaInf, filaHoja: null, avisos };
  const set = (m: Muro, p: Papel) => { papeles[m.id] = { ...(papeles[m.id] ?? { A: 'sin pieza', B: 'sin pieza' }), [dir]: p }; };

  const circ = muros.filter(m => tipoDe(m) === 'tubo-circ');
  if (circ.length) {
    if (muros.length > 1) avisos.push('Un tubo circular tiene que ser una pieza sola; se usa solo el primero.');
    set(circ[0], 'columna');
    return { ...base, molde: 'tubo', fila: { S: circ[0].largo, T: dInterior(circ[0]) || undefined } };
  }
  // tubo rectangular: caja en las columnas asimétricas (ala sup., dos almas, ala inf.); el J sale exacto
  const caja = muros.filter(m => tipoDe(m) === 'tubo-rect');
  if (caja.length) {
    if (muros.length > 1) avisos.push('Un tubo rectangular tiene que ser una pieza sola; se usa solo el primero.');
    const m = caja[0];
    const enViento = dir === 'A' ? (m.ladoY ?? m.largo) : m.largo, trans = dir === 'A' ? m.largo : (m.ladoY ?? m.largo);
    const e = Math.min(m.espesor, enViento / 2, trans / 2);
    set(m, 'tubo');
    if (e >= enViento / 2 || e >= trans / 2) return { ...base, molde: 'simétrico', fila: { B: trans, C: enViento } };   // macizo
    return { ...base, molde: 'asimétrico', fila: { W: trans, X: e, Z: e, AB: enViento - 2 * e, AE: e, AF: enViento - 2 * e, AH: trans, AI: e } };
  }
  const almas = muros.filter(m => m.dir === dirAlma);
  const alas = muros.filter(m => m.dir !== dirAlma);

  if (almas.length === 0) {
    if (alas.length > 1) avisos.push('Pieza sin alma: solo se toma el primer muro (trabaja por su eje débil).');
    const m = alas[0];
    set(m, 'alma');
    return { ...base, molde: 'simétrico', fila: { B: m.largo, C: m.espesor } };
  }
  if (almas.length > 2) {
    avisos.push('Más de dos almas: el molde de la planilla no lo admite. Dividir la pieza en piezas de una o dos almas.');
    muros.forEach(m => set(m, 'sin pieza'));
    return { ...base, molde: 'simétrico', fila: {} };
  }
  // cada ala se pega a un alma (la indicada o la más cercana) y va a su extremo más cercano
  const pegado = (m: Muro) => (dir === 'A' ? m.pegadoA : m.pegadoB);
  const extremos = alas.map(a => {
    let w = almas.find(x => x.id === pegado(a));
    if (!w) {
      w = almas.reduce((best, x) => (Math.abs(t(x) - t(a)) < Math.abs(t(best) - t(a)) ? x : best), almas[0]);
      if (almas.length > 1) avisos.push(`El ala ${a.id} no dice a qué alma se pega: se tomó ${w.id}, la más cercana.`);
    }
    const arriba = s(a) >= s(w);
    return { a, w, arriba };
  });
  almas.forEach(w => set(w, 'alma'));
  // Almas que llegan hasta la cara exterior de un ala (se solapan en el sentido del viento): en el molde el ala va
  // «arriba» del alma, así que el tramo de alma que está a la altura del ala pasa al ala (el ala se ensancha con la
  // misma área) y el alma queda con su largo libre. Así el J de la hoja es el del dibujo.
  const banda = (g: Muro[]) => (g.length ? [Math.min(...g.map(a => s(a) - a.espesor / 2)), Math.max(...g.map(a => s(a) + a.espesor / 2))] : null);
  const solape = (w: Muro, g: Muro[]) => {
    const b = banda(g);
    if (!b) return 0;
    return Math.max(0, Math.min(s(w) + w.largo / 2, b[1]) - Math.max(s(w) - w.largo / 2, b[0]));
  };
  const libre = (w: Muro, ...grupos: Muro[][]) => {
    const sol = grupos.reduce((x, g) => x + solape(w, g), 0);
    if (sol > 1e-9) avisos.push(`El alma ${w.id} llega hasta la cara exterior del ala (${r4(sol)} m): en la hoja J va con su largo libre, ${r4(w.largo - sol)} m, y ese tramo se suma al ala.`);
    return r4(Math.max(0.01, w.largo - sol));
  };
  /** ancho del ala equivalente con los tramos de alma que caen en su banda */
  const conSolapes = (grupo: Grupo, g: Muro[], ws: Muro[]) => r4((grupo.area + ws.reduce((x, w) => x + solape(w, g) * w.espesor, 0)) / grupo.t);

  if (almas.length === 1) {
    const w = almas[0];
    const gSup = extremos.filter(e => e.arriba).map(e => e.a), gInf = extremos.filter(e => !e.arriba).map(e => e.a);
    const sup = juntar(gSup);
    const inf = juntar(gInf);
    if (!sup && !inf) return { ...base, molde: 'simétrico', fila: { B: w.espesor, C: w.largo } };
    // doble T: alas iguales (2 %) y centradas en el alma (baricentro del ala sobre el eje del alma)
    const centrada = (g: Muro[], b: number) => {
      const A = g.reduce((x, m) => x + m.largo * m.espesor, 0);
      const c = g.reduce((x, m) => x + m.largo * m.espesor * t(m), 0) / A;
      return Math.abs(c - t(w)) <= Math.max(0.05, 0.02 * b);
    };
    const iguales = (a: number, b: number) => Math.abs(a - b) <= 0.02 * Math.max(a, b);
    const dobleT = sup && inf && iguales(sup.area, inf.area) && iguales(sup.t, inf.t) && centrada(gSup, sup.b) && centrada(gInf, inf.b);
    if (dobleT) {
      extremos.forEach(e => set(e.a, e.arriba ? 'ala sup.' : 'ala inf.'));
      return { ...base, molde: 'simétrico', fila: { B: w.espesor, C: libre(w, gSup, gInf), F: conSolapes(sup!, gSup, [w]), G: sup!.t, J: conSolapes(inf!, gInf, [w]), K: inf!.t } };
    }
    // asimétrica: el grupo más grande va arriba (el J no cambia al dar vuelta la pieza)
    const supEsArriba = (sup?.area ?? 0) >= (inf?.area ?? 0);
    const top = supEsArriba ? sup! : inf!;
    const bot = supEsArriba ? inf : sup;
    extremos.forEach(e => set(e.a, e.arriba === supEsArriba ? 'ala sup.' : 'ala inf.'));
    const gTop = supEsArriba ? gSup : gInf, gBot = supEsArriba ? gInf : gSup;
    const fila: FilaJ = { W: conSolapes(top, gTop, [w]), X: top.t, Z: w.espesor, AB: libre(w, gSup, gInf) };
    if (bot) { fila.AH = conSolapes(bot, gBot, [w]); fila.AI = bot.t; }
    return { ...base, molde: 'asimétrico', fila };
  }

  // dos almas: el lado con más ala es «arriba»; el ala de arriba une las dos almas
  const areaLado = (arriba: boolean) => extremos.filter(e => e.arriba === arriba).reduce((x, e) => x + e.a.largo * e.a.espesor, 0);
  const arribaEsMas = areaLado(true) >= areaLado(false);
  const top = juntar(extremos.filter(e => e.arriba === arribaEsMas).map(e => e.a));
  const abajo = extremos.filter(e => e.arriba !== arribaEsMas);
  const abajoDe = (w: Muro) => abajo.filter(e => e.w.id === w.id);
  let [izq, der] = almas;
  if (abajoDe(der).length > abajoDe(izq).length) [izq, der] = [der, izq];
  if (abajoDe(izq).length && abajoDe(der).length) {
    avisos.push('Las dos almas tienen alas abajo; el molde solo admite una ala inferior, bajo el alma izquierda: se juntaron todas ahí.');
  }
  const bot = juntar(abajo.map(e => e.a));
  extremos.forEach(e => set(e.a, e.arriba === arribaEsMas ? 'ala sup.' : 'ala inf.'));
  if (!top) avisos.push('Las dos almas no tienen un ala que las una: conviene cargarlas como piezas separadas.');
  const gTop = extremos.filter(e => e.arriba === arribaEsMas).map(e => e.a), gBot = abajo.map(e => e.a);
  const fila: FilaJ = { W: top ? conSolapes(top, gTop, [izq, der]) : 0.01, X: top?.t ?? 0.01, Z: izq.espesor, AB: libre(izq, gTop, gBot), AE: der.espesor, AF: libre(der, gTop) };
  if (bot) { fila.AH = conSolapes(bot, gBot, [izq]); fila.AI = bot.t; }
  return { ...base, molde: 'asimétrico', fila };
}

// ------------------------------------------------------------------ asignación de filas
/**
 * Orden de preferencia de filas (índices 0 a 19) para cada tipo de pieza.
 * «paralelos»: la hoja de flexocompresión lee Q (simétrico) en las filas 1–7 y 12–17, AN (asimétrico) en 8–11
 * y V (circular) en 18–20; a las filas 8 y 9 les faltan fórmulas del molde asimétrico (último recurso para él).
 * «ortogonales»: cualquier fila; la 20 queda al final porque su N suma también U.
 */
function ordenFilas(tipo: 'simétrica' | 'asimétrica' | 'circular', paralelos: boolean): number[] {
  const r = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
  if (!paralelos) return tipo === 'circular' ? r(0, 18) : r(0, 19);
  if (tipo === 'asimétrica') return [9, 10, ...r(11, 16), ...r(0, 6), 17, 18, 19, 7, 8];
  if (tipo === 'circular') return [17, 18, 19, ...r(0, 6), ...r(11, 16), 7, 8, 9, 10];
  return [...r(0, 6), ...r(11, 16), 7, 8, 9, 10, 17, 18, 19];
}

function asignarFilas(piezas: PiezaEquivalente[], paralelos: boolean, avisos: string[]): FilaJ[] {
  const filas: (FilaJ | null)[] = new Array(20).fill(null);
  const tipoDe = (p: PiezaEquivalente) => (p.molde === 'asimétrico' ? 'asimétrica' : p.molde === 'tubo' ? 'circular' : 'simétrica') as 'simétrica' | 'asimétrica' | 'circular';
  // primero los tipos con menos filas propias
  const prioridad = { asimétrica: 0, circular: 1, simétrica: 2 };
  const orden = [...piezas].sort((a, b) => prioridad[tipoDe(a)] - prioridad[tipoDe(b)]);
  for (const p of orden) {
    if (!Object.keys(p.fila).length) continue;
    const tipo = tipoDe(p);
    const i = ordenFilas(tipo, paralelos).find(k => filas[k] === null);
    if (i === undefined) {
      avisos.push(`No queda fila libre en «J Tabiques ${paralelos ? 'paralelos' : 'ortogonales'}» para la pieza ${p.nombre} (máximo 20 piezas).`);
      continue;
    }
    if (paralelos && tipo === 'asimétrica' && FILAS_SIN_YAC.includes(i)) {
      p.avisos.push(`Fila de la pieza ${i + 1}: en la planilla virgen le faltan las fórmulas del ala superior y del alma izquierda; su J queda incompleto en la planilla.`);
    }
    if (paralelos && TIPO_FILA_PARALELOS[i] !== tipo) {
      const mod = { 'simétrica': 'simétrico (Q)', 'asimétrica': 'asimétrico (AN)', circular: 'circular (V)' };
      p.avisos.push(`Va en la fila de la pieza ${i + 1}, donde «Flex comp PB paralelos» lee el módulo ${mod[TIPO_FILA_PARALELOS[i]]}: la flexocompresión de la planilla no vale para esta pieza; la app la calcula con el módulo ${mod[tipo]} (columna «Guía/CIRSOC»).`);
    }
    if (paralelos && FILAS_O0.includes(i)) {
      p.avisos.push(`Fila de la pieza ${i + 1}: la planilla tiene el área en 0 fijo; la app usa el área real en la flexocompresión.`);
    }
    filas[i] = p.fila;
    p.filaHoja = i;
  }
  // rellenos de 0,01 como en la planilla (evitan #DIV/0!)
  return filas.map((f, i) => {
    const r: FilaJ = { S: 0.01, W: 0.01, X: 0.01, ...(f ?? {}) };
    if (paralelos && FILAS_SIN_YAC.includes(i)) r.sinYAC = true;
    if (paralelos && FILAS_O0.includes(i)) r.O0 = true;
    return r;
  });
}

// ------------------------------------------------------------------ todo
export function aPlanilla(p: Proyecto): Asignacion {
  const avisos: string[] = [];
  const niveles = p.niveles;
  const iPB = (() => { let k = -1; niveles.forEach((n, i) => { if (n.cota >= 0) k = i; }); return k; })();
  if (iPB < 0) avisos.push('No hay ningún nivel con cota ≥ 0 (PB).');
  const arriba = niveles.slice(0, iPB + 1);
  const subs = niveles.slice(iPB + 1);
  if (arriba.length - 1 > 50) avisos.push('La planilla admite hasta 50 pisos sobre PB.');
  if (subs.length > 3) avisos.push('La planilla admite hasta 3 subsuelos.');
  if (subs.length < 3) avisos.push(`La planilla tiene 3 subsuelos fijos; ${3 - subs.length === 1 ? 'el que falta se carga' : `los ${3 - subs.length} que faltan se cargan`} con altura 0 y sin superficie.`);

  const Z = new Array<number>(N_FILAS).fill(0);
  const C = new Array<number | null>(N_FILAS).fill(null), D = new Array<number | null>(N_FILAS).fill(null);
  const E = new Array<number | null>(N_FILAS).fill(null), F = new Array<number | null>(N_FILAS).fill(null);
  E[0] = 0; F[0] = 0; C[0] = 0;
  const filaNivel: number[] = [];
  const kTop = 50 - (arriba.length - 1);
  arriba.forEach((n, j) => { const k = kTop + j; Z[k] = n.cota; filaNivel.push(k); });
  for (let j = 0; j < 3; j++) {
    const k = 51 + j;
    if (j < subs.length) { Z[k] = subs[j].cota; filaNivel.push(k); }
    else { Z[k] = j > 0 ? Z[k - 1] : Z[50]; E[k] = 0; F[k] = 0; }
  }
  // último piso: C y D escritos a mano (medio entrepiso), y D = 0 en la fila de arriba
  if (kTop >= 1 && kTop <= 50) {
    const ent = arriba.length > 1 ? arriba[0].cota - arriba[1].cota : 0;
    C[kTop] = ent; D[kTop] = ent / 2; D[kTop - 1] = 0;
  }
  // anchos: en el último piso y donde cambian
  let Bant: number | null = null, Lant: number | null = null;
  niveles.forEach((n, j) => {
    const k = filaNivel[j];
    if (k === undefined) return;
    const b = n.B ?? null, l = n.L ?? null;
    if (j === 0 || (b !== null && b !== Bant)) { E[k] = b ?? Bant ?? 0; Bant = E[k]; }
    if (j === 0 || (l !== null && l !== Lant)) { F[k] = l ?? Lant ?? 0; Lant = F[k]; }
  });

  // piezas
  const papeles: Asignacion['papeles'] = {};
  const zFund = niveles.length ? niveles[niveles.length - 1].cota : 0, zTop = niveles[0]?.cota ?? 0;
  const entra = (m: Muro) => entraEnCalculo(m, zFund, zTop);
  p.muros.forEach(m => { papeles[m.id] = { A: entra(m) ? 'sin pieza' : 'fuera del cálculo', B: entra(m) ? 'sin pieza' : 'fuera del cálculo' }; });
  const activos = p.muros.filter(entra);
  const grupos = (dir: Direccion) => {
    const g = new Map<string, Muro[]>();
    activos.forEach(m => { const k = dir === 'A' ? m.piezaA : m.piezaB; if (k) g.set(k, [...(g.get(k) ?? []), m]); });
    return [...g.entries()].map(([nombre, ms]) => perfilEquivalente(nombre, dir, ms, papeles));
  };
  const piezasA = grupos('A'), piezasB = grupos('B');
  const jpar = asignarFilas(piezasA, true, avisos);
  const jort = asignarFilas(piezasB, false, avisos);

  const Hpos = (par: PiezaEquivalente[], per: PiezaEquivalente[]) => {
    const H = new Array<number | null>(46).fill(null);
    par.forEach(pz => { if (pz.filaHoja !== null) H[pz.filaHoja] = pz.posicion; });
    per.forEach(pz => { if (pz.filaHoja !== null) H[26 + pz.filaHoja] = pz.posicion; });
    return H;
  };
  const alturaTotal = arriba.length ? arriba[0].cota - (arriba[arriba.length - 1]?.cota ?? 0) : 0;
  const pisosArriba = Math.max(0, arriba.length - 1);
  const flex = new Array(20).fill(null).map(() => ({ C: null as number | null, F: null as number | null, G: null as number | null }));
  piezasA.forEach(pz => { if (pz.filaHoja !== null) flex[pz.filaHoja] = { C: alturaTotal, F: r4(pz.areaInf), G: pisosArriba }; });

  const datos: PlanillaDatos = {
    viento: { ...p.sitio, Z },
    mnyq: { C, D, E, F, b1: p.fundacion.b1, a1: p.fundacion.a1 },
    jpar, jort,
    rotA: { H: Hpos(piezasA, piezasB) },
    rotB: { H: Hpos(piezasB, piezasA) },
    flex,
  };
  [...piezasA, ...piezasB].forEach(pz => pz.avisos.forEach(a => avisos.push(`${pz.nombre}: ${a}`)));
  return { datos, piezas: [...piezasA, ...piezasB], papeles, avisos, filaNivel };
}
