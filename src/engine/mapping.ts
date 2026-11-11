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
import { N_FILAS, TIPO_FILA_PARALELOS, calcFilaJ, type FilaJ, type PlanillaDatos } from './planilla';
import { areaMuro, dInterior, entraEnCalculo, rectangulos, tipoDe, type Muro, type Proyecto } from './modelo';

export type Direccion = 'A' | 'B';
export type Papel = 'alma' | 'alma der.' | 'ala sup.' | 'ala inf.' | 'columna' | 'tubo' | 'fuera del cálculo' | 'sin pieza';
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
  /** J de la sección real (cada muro con su Steiner, respecto del baricentro) y J del molde de la hoja (m⁴) */
  Jreal?: number;
  Jhoja?: number;
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
  // papel elegido a mano para este viento (vacío = el que propone la app)
  const rol = (m: Muro) => (dir === 'A' ? m.rolA : m.rolB) || '';
  const fuera = muros.filter(m => rol(m) === 'fuera');
  fuera.forEach(m => set(m, 'fuera del cálculo'));
  if (fuera.length) avisos.push(`Fuera del molde (elegido a mano): ${fuera.map(m => m.id).join(', ')}; no suman al J de la hoja.`);
  const activos = muros.filter(m => rol(m) !== 'fuera');
  let almas = activos.filter(m => m.dir === dirAlma);
  const alas = activos.filter(m => m.dir !== dirAlma);
  // más de dos almas: el molde admite dos; se toman las de más área (o las elegidas a mano) y el resto queda fuera
  if (almas.length > 2) {
    const elegidas = almas.filter(m => rol(m) === 'alma' || rol(m) === 'alma der.');
    const orden = [...elegidas, ...[...almas].filter(m => !elegidas.includes(m)).sort((x, y) => y.largo * y.espesor - x.largo * x.espesor)];
    const quedan = orden.slice(0, 2), sobran = orden.slice(2);
    sobran.forEach(m => set(m, 'fuera del cálculo'));
    avisos.push(`Más de dos almas: el molde de la hoja admite dos. Se tomaron ${quedan.map(m => m.id).join(' y ')} (las de más área) y quedan fuera ${sobran.map(m => m.id).join(', ')}; se puede elegir otras en el grupo. Mirá la diferencia de J.`);
    almas = quedan;
  }

  if (almas.length === 0) {
    if (alas.length > 1) avisos.push('Pieza sin alma: solo se toma el primer muro (trabaja por su eje débil).');
    const m = alas[0];
    if (!m) return { ...base, molde: 'simétrico', fila: {} };
    set(m, 'alma');
    return { ...base, molde: 'simétrico', fila: { B: m.largo, C: m.espesor } };
  }
  // alma izquierda (la principal: la de más área, salvo que se elija a mano la derecha) y alma derecha
  let [izq, der] = [...almas].sort((x, y) => y.largo * y.espesor - x.largo * x.espesor) as [Muro, Muro | undefined];
  const forzDer = almas.find(m => rol(m) === 'alma der.');
  if (forzDer && almas.length === 2) { der = forzDer; izq = almas.find(m => m !== forzDer)!; }
  // cada ala se pega a un alma (la indicada o la más cercana) y queda en un extremo de esa alma o en el medio
  const pegado = (m: Muro) => (dir === 'A' ? m.pegadoA : m.pegadoB);
  type PosAla = 'arriba' | 'abajo' | 'medio';
  const info = alas.map(a => {
    // el alma indicada; si no, la que toca (y entre las que tocan, aquella de la que el ala está en un extremo);
    // si no toca ninguna, la más cercana
    const toca = (x: Muro) => Math.abs(t(x) - t(a)) <= a.largo / 2 + x.espesor / 2 + 0.02 && s(a) >= s(x) - x.largo / 2 - a.espesor && s(a) <= s(x) + x.largo / 2 + a.espesor;
    const enExtremo = (x: Muro) => Math.abs(s(a) - (s(x) + x.largo / 2)) <= a.espesor + 0.05 || Math.abs(s(a) - (s(x) - x.largo / 2)) <= a.espesor + 0.05;
    let w = almas.find(x => x.id === pegado(a));
    if (!w) {
      const tocan = almas.filter(toca);
      w = tocan.find(x => x === izq && enExtremo(x)) ?? tocan.find(enExtremo) ?? tocan[0]
        ?? almas.reduce((best, x) => (Math.abs(t(x) - t(a)) < Math.abs(t(best) - t(a)) ? x : best), almas[0]);
      if (almas.length > 1 && tocan.length !== 1) avisos.push(`Nota: el ala ${a.id} no dice a qué alma se pega: se tomó ${w.id}.`);
    }
    const top = s(w) + w.largo / 2, bot = s(w) - w.largo / 2, tol = a.espesor + 0.05;
    const pos: PosAla = s(a) >= top - tol ? 'arriba' : s(a) <= bot + tol ? 'abajo' : 'medio';
    return { a, w, pos };
  });
  // el extremo con más ala es la «ala superior» del molde (dar vuelta la pieza no cambia el J)
  const areaExt = (p: PosAla) => info.filter(x => x.pos === p).reduce((q, x) => q + x.a.largo * x.a.espesor, 0);
  const arriba: PosAla = areaExt('arriba') >= areaExt('abajo') ? 'arriba' : 'abajo';
  const abajo: PosAla = arriba === 'arriba' ? 'abajo' : 'arriba';
  // papel final de cada ala: el elegido a mano o el propuesto (las del medio se suman al ala superior)
  const papelAla = (x: typeof info[number]): 'ala sup.' | 'ala inf.' => {
    const r = rol(x.a);
    if (r === 'ala sup.' || r === 'ala inf.') return r;
    return x.pos === abajo ? 'ala inf.' : 'ala sup.';
  };
  const medio = info.filter(x => x.pos === 'medio' && !rol(x.a));
  if (medio.length) avisos.push(`Nota: ${medio.map(x => x.a.id).join(', ')} ${medio.length > 1 ? 'están' : 'está'} en el medio del alma; ${medio.length > 1 ? 'se suman' : 'se suma'} al ala superior del molde (se puede cambiar a «fuera» o «ala inf.»). Mirá la diferencia de J.`);
  const sup = info.filter(x => papelAla(x) === 'ala sup.'), inf = info.filter(x => papelAla(x) === 'ala inf.');
  // solo las alas de los extremos recortan el alma (las del medio no)
  const extSup = sup.filter(x => x.pos === arriba).map(x => x.a), extInf = inf.filter(x => x.pos === abajo).map(x => x.a);
  const banda = (g: Muro[]) => (g.length ? [Math.min(...g.map(a => s(a) - a.espesor / 2)), Math.max(...g.map(a => s(a) + a.espesor / 2))] : null);
  const solape = (w: Muro, g: Muro[]) => {
    const bb = banda(g.filter(a => info.find(x => x.a === a)?.w === w || almas.length === 1 || Math.abs(t(a) - t(w)) <= a.largo / 2 + w.espesor));
    if (!bb) return 0;
    return Math.max(0, Math.min(s(w) + w.largo / 2, bb[1]) - Math.max(s(w) - w.largo / 2, bb[0]));
  };
  const libre = (w: Muro, ...grupos: Muro[][]) => {
    const sol = grupos.reduce((x, g) => x + solape(w, g), 0);
    if (sol > 1e-9) avisos.push(`Nota: el alma ${w.id} llega hasta la cara exterior del ala (${String(r4(sol)).replace('.', ',')} m); en la hoja J va con su largo libre, ${String(r4(w.largo - sol)).replace('.', ',')} m, y ese tramo se suma al ala, para que el J sea el del dibujo.`);
    return r4(Math.max(0.01, w.largo - sol));
  };
  /** ala equivalente: espesor del ala del extremo (o la mayor) y ancho que conserva el área (con los tramos de alma que caen en su banda) */
  const ala = (g: typeof info, ext: Muro[], ws: Muro[]) => {
    if (!g.length) return null;
    const tt = Math.max(...(ext.length ? ext : g.map(x => x.a)).map(m => m.espesor));
    const area = g.reduce((q, x) => q + x.a.largo * x.a.espesor, 0) + ws.reduce((q, w) => q + solape(w, ext) * w.espesor, 0);
    return { b: r4(area / tt), t: r4(tt), area };
  };
  set(izq, 'alma');
  if (der) set(der, 'alma der.');
  info.forEach(x => set(x.a, papelAla(x)));
  const A = ala(sup, extSup, almas), B = ala(inf, extInf, [izq]);

  if (!der) {
    if (!A && !B) return { ...base, molde: 'simétrico', fila: { B: izq.espesor, C: izq.largo } };
    // doble T: alas solo en los extremos, iguales (2 %) y centradas en el alma
    const centrada = (g: Muro[], b: number) => {
      const Ar = g.reduce((x, m) => x + m.largo * m.espesor, 0);
      const c = g.reduce((x, m) => x + m.largo * m.espesor * t(m), 0) / Ar;
      return Math.abs(c - t(izq)) <= Math.max(0.05, 0.02 * b);
    };
    const iguales = (a: number, b: number) => Math.abs(a - b) <= 0.02 * Math.max(a, b);
    const sinMedio = sup.every(x => x.pos !== 'medio') && inf.every(x => x.pos !== 'medio');
    if (A && B && sinMedio && iguales(A.area, B.area) && iguales(A.t, B.t) && centrada(sup.map(x => x.a), A.b) && centrada(inf.map(x => x.a), B.b)) {
      return { ...base, molde: 'simétrico', fila: { B: izq.espesor, C: libre(izq, extSup, extInf), F: A.b, G: A.t, J: B.b, K: B.t } };
    }
    const top = A ?? B!, bot = A ? B : null;
    if (!A) inf.forEach(x => set(x.a, 'ala sup.'));
    const fila: FilaJ = { W: top.b, X: top.t, Z: izq.espesor, AB: libre(izq, extSup, extInf) };
    if (bot) { fila.AH = bot.b; fila.AI = bot.t; }
    return { ...base, molde: 'asimétrico', fila };
  }
  // dos almas: el ala superior une las dos; la inferior va solo bajo el alma izquierda
  if (inf.some(x => x.w === der)) avisos.push(`Nota: el molde solo admite el ala inferior bajo el alma izquierda; ${inf.filter(x => x.w === der).map(x => x.a.id).join(', ')} se juntó ahí.`);
  if (!A) avisos.push('Las dos almas no tienen un ala que las una: conviene cargarlas como piezas separadas.');
  // el alma derecha del molde cuelga del ala superior; si en la realidad no llega a ella, se acepta y se avisa
  const derArriba = arriba === 'arriba' ? s(der) + der.largo / 2 : s(der) - der.largo / 2;
  const supArriba = arriba === 'arriba' ? s(izq) + izq.largo / 2 : s(izq) - izq.largo / 2;
  if (Math.abs(derArriba - supArriba) > 0.3) avisos.push(`El alma derecha ${der.id} no llega al ala superior: en el molde de la hoja va colgada de ella (es la simplificación de la hoja). Mirá la diferencia de J.`);
  const fila: FilaJ = { W: A ? A.b : 0.01, X: A ? A.t : 0.01, Z: izq.espesor, AB: libre(izq, extSup, extInf), AE: der.espesor, AF: libre(der, extSup) };
  if (B) { fila.AH = B.b; fila.AI = B.t; }
  return { ...base, molde: 'asimétrico', fila };
}

/** J de la sección real respecto de su baricentro, para el viento dado: cada rectángulo con su Steiner (m⁴) */
export function Jreal(muros: Muro[], dir: Direccion): number {
  const rs = muros.filter(m => tipoDe(m) !== 'tubo-circ').flatMap(m => rectangulos(m).map(r => ({ b: dir === 'A' ? r.ax : r.ay, h: dir === 'A' ? r.ay : r.ax, s: dir === 'A' ? r.y : r.x })));
  const circ = muros.filter(m => tipoDe(m) === 'tubo-circ').map(m => ({ A: (Math.PI / 4) * (m.largo ** 2 - dInterior(m) ** 2), I: (Math.PI / 64) * (m.largo ** 4 - dInterior(m) ** 4), s: dir === 'A' ? m.y : m.x }));
  const A = rs.reduce((q, r) => q + r.b * r.h, 0) + circ.reduce((q, c) => q + c.A, 0);
  if (!(A > 0)) return 0;
  const sg = (rs.reduce((q, r) => q + r.b * r.h * r.s, 0) + circ.reduce((q, c) => q + c.A * c.s, 0)) / A;
  return rs.reduce((q, r) => q + (r.b * r.h ** 3) / 12 + r.b * r.h * (r.s - sg) ** 2, 0) + circ.reduce((q, c) => q + c.I + c.A * (c.s - sg) ** 2, 0);
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
  // J de la hoja (molde) contra J de la sección real: la simplificación puede cambiarlo mucho
  const porId = new Map(p.muros.map(m => [m.id, m]));
  [...piezasA, ...piezasB].forEach(pz => {
    if (!Object.keys(pz.fila).length || pz.molde === 'tubo') return;
    // el J real es el de todos los muros de la pieza (también los que se dejan fuera del molde)
    const ms = pz.muros.map(id => porId.get(id)!).filter(Boolean);
    pz.Jhoja = calcFilaJ({ S: 0.01, W: 0.01, X: 0.01, ...pz.fila }, pz.dir === 'B', false).AY;
    pz.Jreal = Jreal(ms, pz.dir);
    const dif = pz.Jreal > 0 ? (pz.Jhoja - pz.Jreal) / pz.Jreal : 0;
    if (Math.abs(dif) > 0.05) pz.avisos.push(`La simplificación al molde cambia el J: hoja ${String(r4(pz.Jhoja)).replace('.', ',')} m⁴ contra ${String(r4(pz.Jreal)).replace('.', ',')} m⁴ de la sección real (${dif > 0 ? '+' : '−'}${Math.abs(Math.round(dif * 100))} %).`);
  });
  if (activos.length && activos.every(m => !(m.areaInf > 0))) avisos.push('Ningún muro tiene área de influencia: la flexocompresión no suma la carga de las losas (N queda solo con el peso propio). Cargala en «Muros», columna «Área inf.».');
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
