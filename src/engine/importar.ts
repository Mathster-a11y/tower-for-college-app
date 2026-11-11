/**
 * Interpreta tablas importadas (de un .xlsx o .csv) como partes de un proyecto:
 *  - «tabla»: la tabla de la app (hojas Niveles y Muros, una fila por muro), o cualquier tabla con esos encabezados;
 *  - «lineas»: líneas con coordenadas de inicio y fin (extracción de datos de AutoCAD): cada línea es el eje de un muro;
 *  - «planilla»: la planilla del curso ya llena: viento, niveles, fundación y muros aproximados desde las hojas J.
 */
import type { Hoja, Valor } from '../xlsx/tablas';
import type { Muro, Nivel, Sitio } from './modelo';

export interface Linea { x1: number; y1: number; x2: number; y2: number; capa?: string; espesor?: number; id?: string }
export interface Importacion {
  tipo: 'tabla' | 'lineas' | 'planilla';
  niveles: Nivel[] | null;
  muros: Muro[];
  lineas: Linea[];
  sitio: Partial<Sitio> | null;
  fundacion: { b1: number; a1: number } | null;
  avisos: string[];
}

const norm = (v: Valor) => String(v ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const numero = (v: Valor): number | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const t = v.trim().replace(/\s/g, '');
  const x = Number(t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t.replace(/,(?=\d{3}\b)/g, ''));
  return isFinite(x) ? x : null;
};
const texto = (v: Valor) => (v === null || v === undefined ? '' : String(v).trim());

const CLAVES_MURO: Record<string, string[]> = {
  id: ['muro', 'id', 'nombre', 'name', 'tabique'],
  dir: ['dir', 'direccion', 'direction', 'orientacion'],
  x: ['x', 'xm', 'xcentro', 'centrox', 'centerx', 'posx'],
  y: ['y', 'ym', 'ycentro', 'centroy', 'centery', 'posy'],
  largo: ['largo', 'largom', 'longitud', 'longitudm', 'length', 'long'],
  espesor: ['espesor', 'espesorm', 'esp', 'espm', 'thickness', 'grosor'],
  llega: ['llega', 'llegaalafundacion', 'llegaafundacion'],
  areaInf: ['areainf', 'areainfm2', 'areadeinfluencia', 'areadeinfluenciam2', 'areainfluencia'],
  piezaA: ['piezaa', 'piezavientoa', 'pieza'],
  pegadoA: ['pegadoaa', 'pegadoa', 'pegadoavientoa'],
  piezaB: ['piezab', 'piezavientob'],
  pegadoB: ['pegadoab', 'pegadob', 'pegadoavientob'],
  tipo: ['tipo', 'elemento'],
  ladoY: ['ladoy', 'ladoym', 'ladoeny'],
  desde: ['desde', 'nivelinicio', 'arranca'],
  hasta: ['hasta', 'nivelfin', 'termina'],
  D: ['dcol', 'dext', 'diametro', 'diametroexterior', 'dcolumna'],
  d: ['dint', 'diametrointerior'],
  x1: ['x1', 'startx', 'iniciox', 'xinicio', 'puntoinicialx', 'xi', 'inicioxm'],
  y1: ['y1', 'starty', 'inicioy', 'yinicio', 'puntoinicialy', 'yi', 'inicioym'],
  x2: ['x2', 'endx', 'finx', 'xfin', 'puntofinalx', 'xf', 'finxm'],
  y2: ['y2', 'endy', 'finy', 'yfin', 'puntofinaly', 'yf', 'finym'],
  capa: ['layer', 'capa'],
};
const CLAVES_NIVEL: Record<string, string[]> = {
  nombre: ['nivel', 'nombre', 'piso'],
  cota: ['cota', 'cotam', 'z', 'npt', 'cotanpt'],
  B: ['b', 'bm'],
  L: ['l', 'lm'],
};

/** Busca en las primeras filas la fila de encabezados con más coincidencias; devuelve columna de cada campo. */
function encabezados(h: Hoja, claves: Record<string, string[]>): { fila: number; col: Record<string, number> } | null {
  let mejor: { fila: number; col: Record<string, number> } | null = null;
  for (let r = 0; r < Math.min(15, h.filas.length); r++) {
    const col: Record<string, number> = {};
    (h.filas[r] ?? []).forEach((v, c) => {
      const n = norm(v);
      if (!n) return;
      for (const [campo, alias] of Object.entries(claves)) if (!(campo in col) && alias.includes(n)) { col[campo] = c; break; }
    });
    if (!mejor || Object.keys(col).length > Object.keys(mejor.col).length) mejor = { fila: r, col };
  }
  return mejor && Object.keys(mejor.col).length >= 2 ? mejor : null;
}

function filasDatos(h: Hoja, e: { fila: number; col: Record<string, number> }) {
  return h.filas.slice(e.fila + 1).map(f => (campo: string) => (e.col[campo] === undefined ? null : f?.[e.col[campo]] ?? null))
    .filter((_g, i) => (h.filas[e.fila + 1 + i] ?? []).some(v => v !== null && v !== ''));
}

const esPlanillaCurso = (hojas: Hoja[]) => ['viento', 'M,NyQ', 'J Tabiques paralelos', 'J Tabiques ortogonales'].every(n => hojas.some(h => h.nombre === n));

export function interpretar(hojas: Hoja[]): Importacion {
  if (esPlanillaCurso(hojas)) return desdePlanilla(hojas);
  const avisos: string[] = [];
  let niveles: Nivel[] | null = null;
  const muros: Muro[] = [];
  const lineas: Linea[] = [];
  const pendientes: { m: Muro; campo: 'zDesde' | 'zHasta'; v: number | string }[] = [];
  for (const h of hojas) {
    const eN = encabezados(h, CLAVES_NIVEL);
    const eM = encabezados(h, CLAVES_MURO);
    const esNiveles = eN && 'cota' in eN.col && (!eM || norm(h.nombre).startsWith('nivel') || Object.keys(eN.col).length >= Object.keys(eM.col).length);
    if (esNiveles && !niveles) {
      niveles = [];
      for (const g of filasDatos(h, eN!)) {
        const cota = numero(g('cota'));
        if (cota === null) continue;
        const n: Nivel = { nombre: texto(g('nombre')) || `${cota} m`, cota };
        const B = numero(g('B')), L = numero(g('L'));
        if (B !== null) n.B = B;
        if (L !== null) n.L = L;
        niveles.push(n);
      }
      niveles.sort((a, b) => b.cota - a.cota);
      continue;
    }
    if (!eM) continue;
    const c = eM.col;
    const conLineas = ['x1', 'y1', 'x2', 'y2'].every(k => k in c);
    const conCentro = ['x', 'y', 'largo'].every(k => k in c);
    if (!conLineas && !conCentro) continue;
    let n = 0;
    for (const g of filasDatos(h, eM)) {
      n++;
      if (conLineas && !conCentro) {
        const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(k => numero(g(k)));
        if ([x1, y1, x2, y2].some(v => v === null)) continue;
        const esp = numero(g('espesor'));
        lineas.push({ x1: x1!, y1: y1!, x2: x2!, y2: y2!, capa: texto(g('capa')) || undefined, espesor: esp && esp > 0 ? esp : undefined, id: texto(g('id')) || undefined });
        continue;
      }
      const x = numero(g('x')), y = numero(g('y')), largo = numero(g('largo'));
      if (x === null || y === null || largo === null) { avisos.push(`${h.nombre}, fila ${eM.fila + 1 + n}: falta x, y o largo; se saltó.`); continue; }
      const d = texto(g('dir')).toUpperCase();
      const D = numero(g('D'));
      const ll = norm(g('llega'));
      const tn = norm(g('tipo'));
      const tipo = tn.includes('rect') ? 'tubo-rect' : tn.includes('circ') || (D && D > 0) ? 'tubo-circ' : 'tabique';
      const nivel = (v: Valor) => { const t = texto(v); if (!t) return null; const x = numero(v); return x !== null ? x : t; };
      const m: Muro = {
        id: texto(g('id')) || `M${muros.length + 1}`, dir: d === 'X' ? 'X' : 'Y', x, y, largo,
        espesor: numero(g('espesor')) ?? 0.2, llega: !['no', 'n', '0', 'false'].includes(ll), areaInf: numero(g('areaInf')) ?? 0,
        piezaA: texto(g('piezaA')), pegadoA: texto(g('pegadoA')), piezaB: texto(g('piezaB')), pegadoB: texto(g('pegadoB')),
      };
      if (tipo !== 'tabique') m.tipo = tipo;
      if (tipo === 'tubo-rect') m.ladoY = numero(g('ladoY')) ?? largo;
      if (D && D > 0) { const dI = numero(g('d')) ?? 0; m.largo = D; m.espesor = dI > 0 ? (D - dI) / 2 : D / 2; }
      const de = nivel(g('desde')), ha = nivel(g('hasta'));
      if (de !== null) pendientes.push({ m, campo: 'zDesde', v: de });
      if (ha !== null) pendientes.push({ m, campo: 'zHasta', v: ha });
      muros.push(m);
      if (d && d !== 'X' && d !== 'Y') avisos.push(`Muro ${muros[muros.length - 1].id}: dirección «${d}» no es X ni Y; se tomó Y.`);
    }
  }
  // «Desde» / «Hasta»: cota o nombre de un nivel (de esta misma tabla)
  pendientes.forEach(({ m, campo, v }) => {
    if (typeof v === 'number') { m[campo] = v; return; }
    const n = niveles?.find(x => norm(x.nombre) === norm(v));
    if (n) m[campo] = n.cota; else avisos.push(`Muro ${m.id}: el nivel «${v}» no está en la tabla de niveles; se dejó vacío.`);
  });
  // ids repetidos
  const vistos = new Set<string>();
  muros.forEach(m => { let id = m.id, k = 2; while (vistos.has(id)) id = `${m.id}_${k++}`; if (id !== m.id) avisos.push(`Muro ${m.id} repetido: el segundo se llama ${id}.`); m.id = id; vistos.add(id); });
  if (!niveles && !muros.length && !lineas.length) throw new Error('No se encontró una tabla de niveles ni de muros. La primera fila de la tabla tiene que tener los encabezados (por ejemplo: Muro, Dir., x, y, Largo, Espesor… o x1, y1, x2, y2).');
  return { tipo: lineas.length && !muros.length ? 'lineas' : 'tabla', niveles, muros, lineas, sitio: null, fundacion: null, avisos };
}

/** Unidad probable de un dibujo según el tamaño de las coordenadas. */
export function unidadProbable(lineas: Linea[]): 'm' | 'cm' | 'mm' {
  const largos = lineas.map(l => Math.hypot(l.x2 - l.x1, l.y2 - l.y1)).sort((a, b) => a - b);
  const med = largos[Math.floor(largos.length / 2)] ?? 1;
  return med > 500 ? 'mm' : med > 50 ? 'cm' : 'm';
}

/** Cada línea es el eje de un muro. Las líneas inclinadas se toman en la dirección más cercana (con aviso). */
export function murosDeLineas(lineas: Linea[], op: { escala: number; centrar: boolean; espesor: number; minimo?: number }, avisos: string[] = []): Muro[] {
  const s = op.escala;
  let cx = 0, cy = 0;
  if (op.centrar && lineas.length) {
    const xs = lineas.flatMap(l => [l.x1, l.x2]), ys = lineas.flatMap(l => [l.y1, l.y2]);
    cx = (Math.min(...xs) + Math.max(...xs)) / 2; cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  }
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const out: Muro[] = [];
  let inclinadas = 0, cortas = 0;
  lineas.forEach((l, i) => {
    const dx = (l.x2 - l.x1) * s, dy = (l.y2 - l.y1) * s;
    const largo = Math.hypot(dx, dy);
    if (largo < (op.minimo ?? 0.1)) { cortas++; return; }
    const ang = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
    if (ang > 2 && ang < 88) inclinadas++;
    const dir: 'X' | 'Y' = Math.abs(dx) >= Math.abs(dy) ? 'X' : 'Y';
    out.push({
      id: l.id || `M${i + 1}`, dir, x: r(((l.x1 + l.x2) / 2 - cx) * s), y: r(((l.y1 + l.y2) / 2 - cy) * s),
      largo: r(dir === 'X' ? Math.abs(dx) : Math.abs(dy)), espesor: r(l.espesor ? l.espesor * s : op.espesor),
      llega: true, areaInf: 0, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '',
    });
  });
  if (inclinadas) avisos.push(`${inclinadas} línea${inclinadas > 1 ? 's' : ''} inclinada${inclinadas > 1 ? 's' : ''}: se ${inclinadas > 1 ? 'tomaron' : 'tomó'} en la dirección X o Y más cercana.`);
  if (cortas) avisos.push(`${cortas} línea${cortas > 1 ? 's' : ''} de menos de ${op.minimo ?? 0.1} m: no se importaron.`);
  return out;
}

// ------------------------------------------------------------------ planilla del curso llena
const COLS_J = ['B', 'C', 'F', 'G', 'J', 'K', 'S', 'T', 'W', 'X', 'Z', 'AB', 'AE', 'AF', 'AH', 'AI', 'AO', 'AP', 'AQ', 'AT', 'AU'] as const;

function desdePlanilla(hojas: Hoja[]): Importacion {
  const avisos: string[] = [];
  const H = (n: string) => hojas.find(h => h.nombre === n)!;
  const vi = H('viento'), mn = H('M,NyQ');
  const g = (h: Hoja, ref: string) => numero(h.celda(ref));
  const sitio: Partial<Sitio> = {};
  for (const [k, ref] of Object.entries({ V: 'C4', Kd: 'D4', I: 'E4', zg: 'F4', alfa: 'G4', Kzt: 'I4', G: 'J4', Cpb: 'K4', Cps: 'L4', GCpi: 'O4' }))
    { const x = g(vi, ref); if (x !== null) (sitio as Record<string, number>)[k] = x; }
  // niveles: B5:B58 de viento (fila k = 0..53); PB en la fila 55 (k = 50); anchos en M,NyQ E/F (fila k + 4)
  const Z = Array.from({ length: 54 }, (_, k) => g(vi, `B${5 + k}`) ?? 0);
  let ancho = { B: g(mn, 'E4') ?? 0, L: g(mn, 'F4') ?? 0 };
  const anchos = Array.from({ length: 54 }, (_, k) => {
    if (k === 0) return { ...ancho };
    const B = g(mn, `E${k + 4}`), L = g(mn, `F${k + 4}`);
    ancho = { B: B ?? ancho.B, L: L ?? ancho.L };
    return { ...ancho };
  });
  const kTop = Z.findIndex((z, k) => k >= 1 && k <= 50 && z > 0);
  const niveles: Nivel[] = [];
  let ultimo: { B: number; L: number } | null = null;
  const agregar = (k: number, nombre: string) => {
    const n: Nivel = { nombre, cota: Z[k] };
    const a = anchos[k];
    if (!ultimo || a.B !== ultimo.B) n.B = a.B;
    if (!ultimo || a.L !== ultimo.L) n.L = a.L;
    ultimo = a;
    niveles.push(n);
  };
  if (kTop >= 1) for (let k = kTop; k <= 50; k++) agregar(k, k === kTop ? 'Azotea' : k === 50 ? 'PB' : `${50 - k}º`);
  else { avisos.push('La planilla no tiene cotas en la hoja «viento» (B5:B55).'); agregar(50, 'PB'); }
  for (let k = 51; k <= 53; k++) if (Z[k] < Z[k - 1]) agregar(k, `${k - 50}º SS`);
  if (kTop >= 1) {
    const C = g(mn, `C${kTop + 4}`), D = g(mn, `D${kTop + 4}`);
    if (C !== null && D !== null && Math.abs(D - C / 2) > 0.005)
      avisos.push(`En la planilla, la azotea (M,NyQ fila ${kTop + 4}) tiene D = ${D} m; la guía pide medio entrepiso (${+(C / 2).toFixed(3)} m), que es lo que usa la app. Por eso el viento W puede dar un poco distinto.`);
  }
  const fundacion = { b1: g(mn, 'N80') ?? 0, a1: g(mn, 'N81') ?? 0 };

  // muros aproximados: cada pieza de cada hoja J, en su posición de la rototraslación
  const muros: Muro[] = [];
  const flex = hojas.find(h => h.nombre === 'Flex comp PB paralelos');
  for (const [hojaJ, hojaRot, dir] of [['J Tabiques paralelos', 'Rototrasl. cara mayor', 'A'], ['J Tabiques ortogonales', 'Rototrasl. cara menor', 'B']] as const) {
    const J = H(hojaJ), R = hojas.find(h => h.nombre === hojaRot);
    for (let i = 0; i < 20; i++) {
      const v: Record<string, number> = {};
      COLS_J.forEach(c => { const x = g(J, `${c}${4 + i}`); v[c] = x !== null && x > 0.0101 ? x : 0; });
      const pos = (R && g(R, `H${5 + i}`)) ?? 0;
      const area = dir === 'A' && flex ? g(flex, `F${4 + i}`) ?? 0 : 0;
      const nombre = `${dir === 'A' ? 'P' : 'O'}${i + 1}`;
      const nuevos = piezaAMuros(v, nombre, dir, pos, avisos);
      if (nuevos.length) nuevos[0].areaInf = area;
      muros.push(...nuevos);
    }
  }
  if (muros.length) avisos.push('Los muros salen de las hojas J: cada pieza se dibujó en su posición transversal (rototraslación) y centrada en el otro sentido. Las piezas del viento A (P1, P2…) y las del viento B (O1, O2…) se importan por separado, porque la planilla no dice cuáles son el mismo muro: el J de cada dirección coincide con la planilla, pero hay que acomodar la planta.');
  return { tipo: 'planilla', niveles, muros, lineas: [], sitio, fundacion, avisos };
}

/**
 * Los rectángulos de una fila J como muros. Marco local: t = transversal al viento, s = en el sentido del viento
 * (positivo «arriba», hacia barlovento). Viento A: t = x, s = y. Viento B: t = y, s = x.
 */
function piezaAMuros(v: Record<string, number>, nombre: string, dir: 'A' | 'B', pos: number, avisos: string[]): Muro[] {
  interface Rect { t: number; s: number; at: number; as: number; papel: 'alma' | 'ala' }
  const rects: Rect[] = [];
  let tubo: { D: number; d: number } | null = null;
  // molde simétrico: alma B (transversal) × C (en el viento); alas F×G arriba y J×K abajo, centradas
  if (v.B && v.C) {
    rects.push({ t: 0, s: 0, at: v.B, as: v.C, papel: 'alma' });
    if (v.F && v.G) rects.push({ t: 0, s: v.C / 2 + v.G / 2, at: v.F, as: v.G, papel: 'ala' });
    if (v.J && v.K) rects.push({ t: 0, s: -(v.C / 2 + v.K / 2), at: v.J, as: v.K, papel: 'ala' });
  }
  if (v.S) tubo = { D: v.S, d: v.T || 0 };
  // molde asimétrico: u desde la izquierda, w desde arriba hacia abajo
  const asim: { u: number; w: number; au: number; aw: number; papel: 'alma' | 'ala' }[] = [];
  if (v.W && v.X) asim.push({ u: v.W / 2, w: v.X / 2, au: v.W, aw: v.X, papel: 'ala' });
  if (v.Z && v.AB) asim.push({ u: v.Z / 2, w: v.X + v.AB / 2, au: v.Z, aw: v.AB, papel: 'alma' });
  if (v.AE && v.AF) asim.push({ u: v.W - v.AE / 2, w: v.X + v.AF / 2, au: v.AE, aw: v.AF, papel: 'alma' });
  if (v.AH && v.AI) asim.push({ u: v.AH / 2, w: v.X + v.AB + v.AI / 2, au: v.AH, aw: v.AI, papel: 'ala' });
  if (asim.length) {
    const A = asim.reduce((a, r) => a + r.au * r.aw, 0);
    const uc = asim.reduce((a, r) => a + r.au * r.aw * r.u, 0) / A, wc = asim.reduce((a, r) => a + r.au * r.aw * r.w, 0) / A;
    // si además hay molde simétrico en la misma fila, el asimétrico va al lado
    const corrimiento = rects.length ? Math.max(...rects.map(r => r.at)) / 2 + 0.5 + (v.W || 0) / 2 : 0;
    asim.forEach(r => rects.push({ t: r.u - uc + corrimiento, s: -(r.w - wc), at: r.au, as: r.aw, papel: r.papel }));
  }
  if (v.AO || v.AT) avisos.push(`Pieza ${nombre}: las columnas AO a AU de la hoja J no se importan.`);
  if (!rects.length && !tubo) return [];
  const muros: Muro[] = [];
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const pieza = (m: Muro) => (dir === 'A' ? { ...m, piezaA: nombre } : { ...m, piezaB: nombre });
  // en el viento A el alma va en Y (paralela al viento); en el B, en X
  rects.forEach((r, k) => {
    const largoEnViento = r.as >= r.at;
    const dirMuro: 'X' | 'Y' = dir === 'A' ? (largoEnViento ? 'Y' : 'X') : (largoEnViento ? 'X' : 'Y');
    const t = pos + r.t, s = r.s;
    muros.push(pieza({ id: `${nombre}-${k + 1}`, dir: dirMuro, x: r3(dir === 'A' ? t : s), y: r3(dir === 'A' ? s : t), largo: r3(Math.max(r.at, r.as)), espesor: r3(Math.min(r.at, r.as)), llega: true, areaInf: 0, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '' }));
  });
  // las alas se pegan a la primera alma (así la app arma el mismo molde)
  const alma = muros.find((_m, k) => rects[k].papel === 'alma');
  if (alma) muros.forEach((m, k) => { if (rects[k].papel === 'ala') { if (dir === 'A') m.pegadoA = alma.id; else m.pegadoB = alma.id; } });
  if (tubo) muros.push(pieza({ id: `${nombre}-c`, dir: 'Y', x: r3(dir === 'A' ? pos : 0), y: r3(dir === 'A' ? 0 : pos), largo: tubo.D, espesor: tubo.D, llega: true, areaInf: 0, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '', circular: tubo }));
  return muros;
}

/** La tabla de la app: hojas «Niveles» y «Muros», con los datos del proyecto (sirve también de plantilla). */
export function tablaDelProyecto(niveles: Nivel[], muros: Muro[]): { nombre: string; filas: Valor[][]; anchos: number[] }[] {
  return [
    { nombre: 'Niveles', anchos: [14, 10, 10, 10], filas: [['Nivel', 'Cota (m)', 'B (m)', 'L (m)'], ...niveles.map(n => [n.nombre, n.cota, n.B ?? null, n.L ?? null])] },
    { nombre: 'Muros', anchos: [10, 6, 9, 9, 9, 9, 7, 13, 10, 12, 10, 12, 11, 8, 10, 10],
      filas: [['Muro', 'Dir.', 'x (m)', 'y (m)', 'Largo (m)', 'Espesor (m)', 'Llega', 'Área inf. (m²)', 'Pieza A', 'Pegado a (A)', 'Pieza B', 'Pegado a (B)', 'Tipo', 'Lado y', 'Desde', 'Hasta'],
        ...muros.map(m => {
          const t = m.tipo ?? 'tabique';
          const nombreNivel = (z: number | null | undefined) => (z == null ? null : niveles.find(n => Math.abs(n.cota - z) < 1e-6)?.nombre ?? z);
          return [m.id, m.dir, m.x, m.y, m.largo, m.espesor, m.llega ? 'sí' : 'no', m.areaInf, m.piezaA || null, m.pegadoA || null, m.piezaB || null, m.pegadoB || null,
            t === 'tabique' ? null : t === 'tubo-rect' ? 'tubo rect.' : 'tubo circ.', t === 'tubo-rect' ? m.ladoY ?? m.largo : null, nombreNivel(m.zDesde), nombreNivel(m.zHasta)];
        })] },
    { nombre: 'Cómo llenar', anchos: [110], filas: [['Cómo llenar esta tabla'],
      ['Niveles: de la azotea al último subsuelo. B (perpendicular al viento A) y L (paralelo al viento A) en la primera fila y donde la planta cambia; vacío = igual al de arriba.'],
      ['Muros: una fila por muro. Origen (0, 0) en el centro de la planta de PB; x hacia la derecha, y hacia arriba. x, y = centro del muro.'],
      ['Dir.: Y si el muro es paralelo al viento A (vertical en la planta); X si es paralelo al viento B (horizontal).'],
      ['Llega: «no» si el muro no llega a la fundación (apeado). Área inf.: área de losa que carga el muro.'],
      ['Pieza A / Pieza B: nombre de la pieza a la que pertenece el muro en cada dirección. Pegado a: para un ala, el alma a la que se une.'],
      ['Tipo: vacío o «tabique» (también columnas rectangulares); «tubo rect.» (Largo = lado en x, Lado y = lado en y, Espesor = espesor de pared); «tubo circ.» (Largo = diámetro exterior, Espesor = espesor de pared; macizo si es la mitad del diámetro).'],
      ['Desde / Hasta: nivel donde arranca y donde termina el muro (nombre del nivel o cota); vacío = de la fundación a la azotea.'],
      ['También se pueden importar líneas exportadas de AutoCAD: una tabla con x1, y1, x2, y2 (o Start X, Start Y, End X, End Y).']] },
  ];
}
