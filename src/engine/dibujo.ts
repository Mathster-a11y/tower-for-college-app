/**
 * Dibujar muros con el mouse y armar las piezas solas.
 *  - imanar: un punto se pega al extremo (o al eje) de un muro cercano y, si no, a la grilla de 5 cm;
 *  - muroDesdeTramo: dos clics → un tabique horizontal o vertical (el eje que más se mueve manda);
 *  - armarPiezas: los muros que se tocan forman una pieza; en cada viento el ala sabe a qué alma está pegada.
 */
import type { Muro } from './modelo';
import { rectangulos, tipoDe } from './modelo';
import { marcoTrasEspejo, marcoTrasGiro } from './piezasTipo';

export type Punto = { x: number; y: number };
const r2 = (v: number) => Math.round(v * 100) / 100;
/** paso del imán a la grilla (m): 0,05 con la grilla de discretización encendida; 0,01 apagada */
let pasoGrilla = 0.05;
export function fijarPasoGrilla(paso: number) { pasoGrilla = paso > 0 ? paso : 0.05; }
const grilla = (v: number, paso = pasoGrilla) => r2(Math.round(v / paso) * paso);

/** extremos del eje de un tabique */
export function extremos(m: Muro): [Punto, Punto] {
  const h = m.largo / 2;
  return m.dir === 'X' ? [{ x: m.x - h, y: m.y }, { x: m.x + h, y: m.y }] : [{ x: m.x, y: m.y - h }, { x: m.x, y: m.y + h }];
}

/**
 * Pega el punto a lo más cercano dentro de «tol» (m): primero un extremo de un tabique, después el eje de un tabique
 * (para arrancar un ala desde el medio de un alma); si no hay nada cerca, a la grilla.
 */
export function imanar(p: Punto, muros: Muro[], tol = 0.4): { p: Punto; a: 'extremo' | 'eje' | 'grilla'; id?: string } {
  let mejor: { p: Punto; d: number; id: string } | null = null;
  muros.filter(m => tipoDe(m) === 'tabique').forEach(m => extremos(m).forEach(e => {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d <= tol && (!mejor || d < mejor.d)) mejor = { p: e, d, id: m.id };
  }));
  if (mejor) return { p: { x: r2((mejor as { p: Punto }).p.x), y: r2((mejor as { p: Punto }).p.y) }, a: 'extremo', id: (mejor as { id: string }).id };
  for (const m of muros.filter(x => tipoDe(x) === 'tabique')) {
    const [a, b] = extremos(m);
    if (m.dir === 'X' && Math.abs(p.y - m.y) <= tol && p.x >= a.x - 1e-9 && p.x <= b.x + 1e-9) return { p: { x: grilla(p.x), y: r2(m.y) }, a: 'eje', id: m.id };
    if (m.dir === 'Y' && Math.abs(p.x - m.x) <= tol && p.y >= a.y - 1e-9 && p.y <= b.y + 1e-9) return { p: { x: r2(m.x), y: grilla(p.y) }, a: 'eje', id: m.id };
  }
  return { p: { x: grilla(p.x), y: grilla(p.y) }, a: 'grilla' };
}

/** Tabique entre dos puntos: horizontal (dir X) o vertical (dir Y) según el eje que más cambia. null si es muy corto. */
export function muroDesdeTramo(a: Punto, b: Punto, espesor = 0.2): Pick<Muro, 'dir' | 'x' | 'y' | 'largo' | 'espesor'> | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const largo = r2(Math.abs(horizontal ? dx : dy));
  if (largo < 0.1) return null;
  return horizontal ? { dir: 'X', x: r2((a.x + b.x) / 2), y: r2(a.y), largo, espesor } : { dir: 'Y', x: r2(a.x), y: r2((a.y + b.y) / 2), largo, espesor };
}

/** ¿se tocan (o se pisan) dos muros? con una tolerancia de 1 cm */
export function seTocan(a: Muro, b: Muro, tol = 0.01): boolean {
  return rectangulos(a).some(r => rectangulos(b).some(s =>
    Math.abs(r.x - s.x) <= (r.ax + s.ax) / 2 + tol && Math.abs(r.y - s.y) <= (r.ay + s.ay) / 2 + tol));
}

/**
 * Agrupa los muros que se tocan y les pone pieza en los dos vientos («T1» en A y «T1B» en B, como el ejemplo de la
 * guía). Si todos los muros de un grupo ya tenían el mismo nombre, se respeta. En cada viento, los muros paralelos
 * al viento son almas (A: dir Y · B: dir X); los otros llevan «pegado» = el alma que tocan (o vacío). Los tubos
 * forman su propia pieza. Devuelve muros nuevos (no modifica los de entrada).
 */
export function armarPiezas(muros: Muro[]): Muro[] {
  const n = muros.length;
  const padre = muros.map((_, i) => i);
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (tipoDe(muros[i]) !== 'tabique' || tipoDe(muros[j]) !== 'tabique') continue;
    if (seTocan(muros[i], muros[j])) padre[raiz(i)] = raiz(j);
  }
  const grupos = new Map<number, number[]>();
  muros.forEach((_, i) => grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), i]));
  // orden de lectura: de arriba hacia abajo y de izquierda a derecha (por el baricentro del grupo)
  const centro = (ix: number[]) => {
    const A = ix.reduce((s, i) => s + muros[i].largo * muros[i].espesor, 0) || 1;
    return { x: ix.reduce((s, i) => s + muros[i].x * muros[i].largo * muros[i].espesor, 0) / A, y: ix.reduce((s, i) => s + muros[i].y * muros[i].largo * muros[i].espesor, 0) / A };
  };
  const lista = [...grupos.values()].map(ix => ({ ix, c: centro(ix) })).sort((a, b) => (Math.abs(a.c.y - b.c.y) > 0.5 ? b.c.y - a.c.y : a.c.x - b.c.x));
  const out = muros.map(m => ({ ...m }));
  const usados = new Set<string>();
  // nombres que se conservan
  const propio = lista.map(({ ix }) => {
    const nA = new Set(ix.map(i => muros[i].piezaA)), nB = new Set(ix.map(i => muros[i].piezaB));
    const a = nA.size === 1 ? [...nA][0] : '', b = nB.size === 1 ? [...nB][0] : '';
    return { a: a && !usados.has(a) ? (usados.add(a), a) : '', b };
  });
  let k = 1;
  lista.forEach(({ ix }, gi) => {
    let nombre = propio[gi].a;
    if (!nombre) { while (usados.has(`T${k}`)) k++; nombre = `T${k}`; usados.add(nombre); }
    const nombreB = propio[gi].b || `${nombre}B`;
    ix.forEach(i => {
      const m = out[i];
      m.piezaA = nombre; m.piezaB = nombreB;
      if (tipoDe(m) !== 'tabique') { m.pegadoA = ''; m.pegadoB = ''; return; }
      const alma = (dirAlma: 'X' | 'Y') => ix.map(j => muros[j]).find(o => o.id !== m.id && tipoDe(o) === 'tabique' && o.dir === dirAlma && seTocan(o, m))?.id ?? '';
      m.pegadoA = m.dir === 'Y' ? '' : alma('Y');
      m.pegadoB = m.dir === 'X' ? '' : alma('X');
    });
  });
  return out;
}

// ------------------------------------------------------------------ grupos (una pieza como un elemento)
/** muros de un grupo */
export const delGrupo = (muros: Muro[], g: string) => muros.filter(m => m.grupo === g);
const centroDe = (ms: Muro[]) => {
  const A = ms.reduce((s, m) => s + m.largo * m.espesor, 0) || 1;
  return { x: r2(ms.reduce((s, m) => s + m.x * m.largo * m.espesor, 0) / A), y: r2(ms.reduce((s, m) => s + m.y * m.largo * m.espesor, 0) / A) };
};

/**
 * Agrupa los muros indicados en un elemento: comparten la pieza en los dos vientos (nombre «T…» y «T…B») y cada
 * ala queda pegada al alma que toca. Devuelve los muros nuevos y el nombre del grupo.
 */
export function agrupar(muros: Muro[], ids: string[], nombre?: string): { muros: Muro[]; grupo: string } {
  const usados = new Set(muros.filter(m => !ids.includes(m.id)).map(m => m.grupo).filter(Boolean) as string[]);   // el nombre propio se puede conservar
  const piezas = new Set(muros.filter(m => !ids.includes(m.id)).map(m => m.piezaA));
  let g = nombre && !usados.has(nombre) ? nombre : '';
  if (!g) { const previo = muros.find(m => ids.includes(m.id) && m.piezaA)?.piezaA; g = previo && !usados.has(previo) ? previo : ''; }
  for (let k = 1; !g; k++) if (!usados.has(`T${k}`) && !piezas.has(`T${k}`)) g = `T${k}`;
  const dentro = muros.filter(m => ids.includes(m.id));
  const out = muros.map(m => {
    if (!ids.includes(m.id)) return m;
    const alma = (dirAlma: 'X' | 'Y') => dentro.find(o => o.id !== m.id && tipoDe(o) === 'tabique' && o.dir === dirAlma && seTocan(o, m))?.id ?? '';
    return { ...m, grupo: g, piezaA: g, piezaB: `${g}B`, pegadoA: m.dir === 'Y' ? '' : alma('Y'), pegadoB: m.dir === 'X' ? '' : alma('X') };
  });
  return { muros: out, grupo: g };
}
/** deshace el grupo: los muros quedan sueltos pero en la misma pieza */
export function desagrupar(muros: Muro[], g: string): Muro[] {
  return muros.map(m => { if (m.grupo !== g) return m; const { grupo: _g, pieza: _p, ...resto } = m; void _g; void _p; return resto; });
}
/** mueve el grupo entero */
export function moverGrupo(muros: Muro[], g: string, dx: number, dy: number): Muro[] {
  return muros.map(m => (m.grupo === g ? { ...m, x: r2(m.x + dx), y: r2(m.y + dy) } : m));
}
/**
 * Gira el grupo 90° (antihorario) alrededor de su baricentro. Los muros cambian de dirección, así que los papeles
 * elegidos a mano se borran (un alma pasa a ser ala) y los «pegado a» se rehacen.
 */
export function girarGrupo(muros: Muro[], g: string): Muro[] {
  const c = centroDe(delGrupo(muros, g));
  const girados = muros.map(m => {
    if (m.grupo !== g) return m;
    const x = r2(c.x - (m.y - c.y)), y = r2(c.y + (m.x - c.x));
    const n: Muro = { ...m, x, y, dir: m.dir === 'X' ? 'Y' : 'X', rolA: '', rolB: '' };
    if (m.pieza) n.pieza = { ...m.pieza, med: marcoTrasGiro(m.pieza.med) };
    if (tipoDe(m) === 'tubo-rect') { n.largo = m.ladoY ?? m.largo; n.ladoY = m.largo; n.dir = m.dir; }
    return n;
  });
  return agrupar(girados, delGrupo(girados, g).map(m => m.id), g).muros;
}
/** espeja el grupo respecto de un eje vertical (x) u horizontal (y) por su baricentro; los papeles se conservan */
export function espejarGrupo(muros: Muro[], g: string, eje: 'x' | 'y'): Muro[] {
  const c = centroDe(delGrupo(muros, g));
  return muros.map(m => {
    if (m.grupo !== g) return m;
    const n: Muro = eje === 'x' ? { ...m, x: r2(2 * c.x - m.x) } : { ...m, y: r2(2 * c.y - m.y) };
    if (m.pieza) n.pieza = { ...m.pieza, med: marcoTrasEspejo(m.pieza.med, eje) };
    return n;
  });
}

export type TipoNodoMuro = 'esquina' | 'medio' | 'centro';
/** nodos de un elemento: esquinas, medios de los lados y centro (columnas circulares: centro y cuadrantes) */
export function nodosMuro(m: Muro): (Punto & { t: TipoNodoMuro })[] {
  if (tipoDe(m) === 'perfil') return [{ x: m.x, y: m.y, t: 'centro' as const }, ...m.perfil!.v.map(q => ({ x: +(m.x + q.x).toFixed(4), y: +(m.y + q.y).toFixed(4), t: 'esquina' as const }))];
  if (tipoDe(m) === 'tubo-circ') { const r = m.largo / 2; return [{ x: m.x, y: m.y, t: 'centro' }, { x: m.x + r, y: m.y, t: 'medio' }, { x: m.x - r, y: m.y, t: 'medio' }, { x: m.x, y: m.y + r, t: 'medio' }, { x: m.x, y: m.y - r, t: 'medio' }]; }
  const ax = tipoDe(m) === 'tubo-rect' ? m.largo : m.dir === 'Y' ? m.espesor : m.largo, ay = tipoDe(m) === 'tubo-rect' ? m.ladoY ?? m.largo : m.dir === 'Y' ? m.largo : m.espesor;
  const x0 = m.x - ax / 2, x1 = m.x + ax / 2, y0 = m.y - ay / 2, y1 = m.y + ay / 2;
  return [{ x: x0, y: y0, t: 'esquina' }, { x: x1, y: y0, t: 'esquina' }, { x: x1, y: y1, t: 'esquina' }, { x: x0, y: y1, t: 'esquina' },
    { x: m.x, y: y0, t: 'medio' }, { x: x1, y: m.y, t: 'medio' }, { x: m.x, y: y1, t: 'medio' }, { x: x0, y: m.y, t: 'medio' }, { x: m.x, y: m.y, t: 'centro' }];
}
/**
 * Imán para arrastrar desde un nodo: primero un nodo de otro elemento (esquina, medio o centro), después un punto
 * sobre una cara de otro elemento (para apoyarlo contra un muro); si no hay nada cerca, la grilla de 5 cm.
 */
export function imanarNodo(p: Punto, muros: Muro[], tol: number): { p: Punto; a: TipoNodoMuro | 'cara' | 'grilla'; id?: string } {
  let mejor: { p: Punto; d: number; id: string; t: TipoNodoMuro } | null = null;
  for (const m of muros) for (const n of nodosMuro(m)) {
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d <= tol && (!mejor || d < mejor.d - 1e-9 || (Math.abs(d - mejor.d) < 1e-9 && n.t === 'esquina'))) mejor = { p: n, d, id: m.id, t: n.t };
  }
  if (mejor) return { p: { x: r2(mejor.p.x), y: r2(mejor.p.y) }, a: mejor.t, id: mejor.id };
  let cara: { p: Punto; d: number; id: string } | null = null;
  for (const m of muros) {
    if (tipoDe(m) === 'tubo-circ') continue;
    for (const r of rectangulos(m)) {
      const x0 = r.x - r.ax / 2, x1 = r.x + r.ax / 2, y0 = r.y - r.ay / 2, y1 = r.y + r.ay / 2;
      const cand: Punto[] = [{ x: Math.min(x1, Math.max(x0, p.x)), y: y0 }, { x: Math.min(x1, Math.max(x0, p.x)), y: y1 }, { x: x0, y: Math.min(y1, Math.max(y0, p.y)) }, { x: x1, y: Math.min(y1, Math.max(y0, p.y)) }];
      for (const c of cand) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d <= tol && (!cara || d < cara.d)) cara = { p: c, d, id: m.id }; }
    }
  }
  if (cara) {
    // sobre la cara, el otro sentido va a la grilla
    const c = cara.p, enX = Math.abs(c.y - p.y) > Math.abs(c.x - p.x);
    return { p: enX ? { x: grilla(c.x), y: r2(c.y) } : { x: r2(c.x), y: grilla(c.y) }, a: 'cara', id: cara.id };
  }
  return { p: { x: grilla(p.x), y: grilla(p.y) }, a: 'grilla' };
}

// ------------------------------------------------------------------ calar (vanos en tabiques y tubos)
export type TipoVano = 'dintel' | 'hueco';
/**
 * Los cuatro tabiques de un tubo rectangular (núcleo), en la misma pieza y el mismo grupo: así se puede calar una cara.
 * Las caras de arriba y de abajo van enteras (de esquina a esquina); las de los costados, entre ellas.
 */
export function tuboEnTabiques(m: Muro, nuevoId: () => string): Muro[] {
  const Lx = m.largo, Ly = m.ladoY ?? m.largo, e = Math.min(m.espesor, Lx / 2, Ly / 2);
  const per = 2 * Lx + 2 * (Ly - 2 * e);
  const base = { ...m, tipo: undefined, ladoY: undefined, grupo: m.grupo ?? m.piezaA ?? undefined } as Muro;
  delete base.tipo; delete base.ladoY; delete base.pieza;
  const t = (id: string, dir: 'X' | 'Y', x: number, y: number, largo: number): Muro => ({ ...base, id, dir, x: r2(x), y: r2(y), largo: r2(largo), espesor: e, areaInf: r2((m.areaInf * largo) / per) });
  return [
    t(m.id, 'X', m.x, m.y + Ly / 2 - e / 2, Lx),
    t(nuevoId(), 'X', m.x, m.y - Ly / 2 + e / 2, Lx),
    t(nuevoId(), 'Y', m.x - Lx / 2 + e / 2, m.y, Ly - 2 * e),
    t(nuevoId(), 'Y', m.x + Lx / 2 - e / 2, m.y, Ly - 2 * e),
  ];
}

/**
 * Cala un vano de «ancho» m en el muro «id», centrado en el punto (proyectado sobre el eje del muro). El muro queda en
 * dos tramos; el área de influencia se reparte por largo. Un tubo rectangular primero se pasa a sus cuatro tabiques y se
 * cala la cara más cercana al punto. Con «hueco», un tabique suelto queda en dos piezas (trabajan por separado); con
 * «dintel», o si la pieza tiene otros muros, los dos tramos siguen en la misma pieza.
 * Devuelve los muros nuevos o un error si el vano no entra (cada tramo tiene que quedar de 0,10 m o más).
 */
export function calarMuro(muros: Muro[], id: string, punto: Punto, ancho: number, tipo: TipoVano): { muros: Muro[] } | { error: string } {
  const usados = new Set(muros.map(m => m.id));
  const nuevoId = () => { let k = 1; while (usados.has(`M${k}`)) k++; usados.add(`M${k}`); return `M${k}`; };
  let lista = [...muros];
  let m = lista.find(x => x.id === id);
  if (!m) return { error: 'no se encontró el muro' };
  if (tipoDe(m) === 'tubo-circ') return { error: 'las columnas y tubos circulares no se calan en esta versión' };
  if (tipoDe(m) === 'tubo-rect') {
    const caras = tuboEnTabiques(m, nuevoId);
    lista = lista.flatMap(x => (x.id === id ? caras : [x]));
    const dist = (c: Muro) => (c.dir === 'X' ? Math.abs(punto.y - c.y) + Math.max(0, Math.abs(punto.x - c.x) - c.largo / 2) : Math.abs(punto.x - c.x) + Math.max(0, Math.abs(punto.y - c.y) - c.largo / 2));
    m = [...caras].sort((a, b) => dist(a) - dist(b))[0];
  }
  if (!(ancho > 0)) return { error: 'el ancho del vano tiene que ser mayor que cero' };
  const L = m.largo, s0 = m.dir === 'X' ? m.x - L / 2 : m.y - L / 2;
  const s = m.dir === 'X' ? punto.x : punto.y;
  const minimo = 0.1;
  if (ancho > L - 2 * minimo) return { error: `el vano de ${ancho} m no entra: el muro mide ${r2(L)} m (cada tramo tiene que quedar de ${minimo} m o más)` };
  const centro = Math.min(s0 + L - minimo - ancho / 2, Math.max(s0 + minimo + ancho / 2, s));
  const a1 = r2(centro - ancho / 2 - s0), a2 = r2(s0 + L - (centro + ancho / 2));
  const enPieza = lista.filter(x => x.piezaA === m!.piezaA && m!.piezaA).length;
  const solo = enPieza <= 1 && !m.grupo;
  const id2 = nuevoId();
  const tramo = (nid: string, ini: number, largo: number): Muro => {
    const c = ini + largo / 2;
    return { ...m!, id: nid, x: m!.dir === 'X' ? r2(c) : m!.x, y: m!.dir === 'Y' ? r2(c) : m!.y, largo: largo, areaInf: r2((m!.areaInf * largo) / (L - ancho)) };
  };
  const t1 = { ...tramo(m.id, s0, a1), vano: { con: id2, ancho: r2(ancho), tipo } };
  const t2 = tramo(id2, s0 + a1 + ancho, a2);
  if (tipo === 'hueco' && solo) {
    // tabique suelto con un hueco de toda la altura: dos piezas
    const nombres = new Set(lista.map(x => x.piezaA));
    let k = 1; while (nombres.has(`T${k}`)) k++;
    t2.piezaA = `T${k}`; t2.piezaB = `T${k}B`; t2.pegadoA = ''; t2.pegadoB = '';
  }
  lista = lista.flatMap(x => (x.id === m!.id ? [t1, t2] : [x]));
  // si es parte de un grupo, se rehacen los «pegado a» (un ala puede quedar tocando el tramo nuevo)
  const g = t1.grupo;
  if (g) lista = agrupar(lista, lista.filter(x => x.grupo === g).map(x => x.id), g).muros;
  return { muros: lista };
}
