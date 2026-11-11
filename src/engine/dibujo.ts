/**
 * Dibujar muros con el mouse y armar las piezas solas.
 *  - imanar: un punto se pega al extremo (o al eje) de un muro cercano y, si no, a la grilla de 5 cm;
 *  - muroDesdeTramo: dos clics → un tabique horizontal o vertical (el eje que más se mueve manda);
 *  - armarPiezas: los muros que se tocan forman una pieza; en cada viento el ala sabe a qué alma está pegada.
 */
import type { Muro } from './modelo';
import { rectangulos, tipoDe } from './modelo';

export type Punto = { x: number; y: number };
const r2 = (v: number) => Math.round(v * 100) / 100;
const grilla = (v: number, paso = 0.05) => r2(Math.round(v / paso) * paso);

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
