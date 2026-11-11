/**
 * Dibujos de CAD (DXF) como fondo de la planta: entidades con su capa, unidades, nodos para el imán y
 * conversión de capas en muros, columnas o contornos (losa, carpintería).
 * Lee LINE, LWPOLYLINE (con arcos), POLYLINE/VERTEX, CIRCLE y ARC de la sección ENTITIES.
 */
import type { Muro } from './modelo';
import { puntosSilueta, type Vertice } from './silueta';

export type Punto = { x: number; y: number };
export type Entidad =
  | { t: 'linea'; capa: string; a: Punto; b: Punto }
  | { t: 'poli'; capa: string; v: Vertice[]; cerrada: boolean }
  | { t: 'circulo'; capa: string; c: Punto; r: number }
  | { t: 'arco'; capa: string; c: Punto; r: number; a0: number; a1: number };
export interface DibujoCAD { entidades: Entidad[]; capas: string[]; unidad: 'mm' | 'cm' | 'm' | 'desconocida'; omitidas: number }

/** lee las entidades de un DXF (texto) */
export function leerDXFCompleto(texto: string): DibujoCAD {
  const l = texto.split(/\r?\n/).map(x => x.trim());
  const ents: Entidad[] = [];
  let omitidas = 0, insunits = 0;
  const hi = l.findIndex((x, i) => x === '$INSUNITS' && l[i - 1] === '9');
  if (hi >= 0) insunits = Number(l[hi + 2]) || 0;
  // solo la sección ENTITIES
  let i = l.findIndex((x, k) => x === 'ENTITIES' && l[k - 1] === '2');
  if (i < 0) i = 0;
  const leerGrupos = (desde: number) => {
    const g: [string, string][] = [];
    let j = desde;
    for (; j + 1 < l.length && l[j] !== '0'; j += 2) g.push([l[j], l[j + 1]]);
    return { g, fin: j };
  };
  const num = (g: [string, string][], c: string, def = 0) => { const x = g.find(p => p[0] === c); return x ? Number(x[1]) : def; };
  const capa = (g: [string, string][]) => g.find(p => p[0] === '8')?.[1] ?? '0';
  for (; i + 1 < l.length; i++) {
    if (l[i] !== '0') continue;
    const tipo = l[i + 1];
    if (tipo === 'ENDSEC') break;
    const { g, fin } = leerGrupos(i + 2);
    if (tipo === 'LINE') ents.push({ t: 'linea', capa: capa(g), a: { x: num(g, '10'), y: num(g, '20') }, b: { x: num(g, '11'), y: num(g, '21') } });
    else if (tipo === 'CIRCLE') ents.push({ t: 'circulo', capa: capa(g), c: { x: num(g, '10'), y: num(g, '20') }, r: num(g, '40') });
    else if (tipo === 'ARC') ents.push({ t: 'arco', capa: capa(g), c: { x: num(g, '10'), y: num(g, '20') }, r: num(g, '40'), a0: num(g, '50'), a1: num(g, '51') });
    else if (tipo === 'LWPOLYLINE') {
      const v: Vertice[] = [];
      let cerrada = false;
      g.forEach(([c, x]) => {
        if (c === '70') cerrada = (Number(x) & 1) === 1;
        else if (c === '10') v.push({ x: Number(x), y: 0 });
        else if (c === '20' && v.length) v[v.length - 1].y = Number(x);
        else if (c === '42' && v.length) v[v.length - 1].b = Number(x);
      });
      if (v.length > 1) ents.push({ t: 'poli', capa: capa(g), v, cerrada });
    } else if (tipo === 'POLYLINE') {
      // POLYLINE vieja: VERTEX… hasta SEQEND
      const cerrada = (num(g, '70') & 1) === 1, cp = capa(g);
      const v: Vertice[] = [];
      let j = fin;
      while (j + 1 < l.length && !(l[j] === '0' && l[j + 1] === 'SEQEND')) {
        if (l[j] === '0' && l[j + 1] === 'VERTEX') { const r = leerGrupos(j + 2); v.push({ x: num(r.g, '10'), y: num(r.g, '20'), ...(num(r.g, '42') ? { b: num(r.g, '42') } : {}) }); j = r.fin; } else j += 2;
      }
      if (v.length > 1) ents.push({ t: 'poli', capa: cp, v, cerrada });
      i = j;
      continue;
    } else if (['INSERT', 'SPLINE', 'ELLIPSE', 'HATCH', 'DIMENSION', 'TEXT', 'MTEXT', 'SOLID', '3DFACE'].includes(tipo)) omitidas++;
    i = fin - 1;
  }
  const capas = [...new Set(ents.map(e => e.capa))].sort();
  const unidad = insunits === 4 ? 'mm' : insunits === 5 ? 'cm' : insunits === 6 ? 'm' : 'desconocida';
  return { entidades: ents, capas, unidad, omitidas };
}

/** caja del dibujo */
export function cajaCAD(ents: Entidad[]): { x0: number; x1: number; y0: number; y1: number } {
  const xs: number[] = [], ys: number[] = [];
  ents.forEach(e => {
    if (e.t === 'linea') { xs.push(e.a.x, e.b.x); ys.push(e.a.y, e.b.y); }
    else if (e.t === 'poli') puntosSilueta(e.v, 15).forEach(p => { xs.push(p.x); ys.push(p.y); });
    else { xs.push(e.c.x - e.r, e.c.x + e.r); ys.push(e.c.y - e.r, e.c.y + e.r); }
  });
  return xs.length ? { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } : { x0: 0, x1: 0, y0: 0, y1: 0 };
}

/** unidad: la del archivo o, si no la dice, la que hace que el dibujo mida entre 5 y 300 m */
export function factorUnidad(d: DibujoCAD): { factor: number; unidad: 'mm' | 'cm' | 'm' } {
  if (d.unidad !== 'desconocida') return { factor: { mm: 0.001, cm: 0.01, m: 1 }[d.unidad], unidad: d.unidad };
  const c = cajaCAD(d.entidades), ext = Math.max(c.x1 - c.x0, c.y1 - c.y0);
  if (ext > 3000) return { factor: 0.001, unidad: 'mm' };
  if (ext > 300) return { factor: 0.01, unidad: 'cm' };
  return { factor: 1, unidad: 'm' };
}

/** pasa a metros y lleva el centro de la caja (o el punto dado) al origen de la planta */
export function aMetros(ents: Entidad[], factor: number, origen?: Punto): Entidad[] {
  const c = cajaCAD(ents), o = origen ?? { x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2 };
  const P = (p: Punto) => ({ x: (p.x - o.x) * factor, y: (p.y - o.y) * factor });
  return ents.map(e => e.t === 'linea' ? { ...e, a: P(e.a), b: P(e.b) }
    : e.t === 'poli' ? { ...e, v: e.v.map(q => ({ ...P(q), ...(q.b ? { b: q.b } : {}) })) }
      : { ...e, c: P(e.c), r: e.r * factor });
}

/** segmentos rectos del dibujo (los arcos de las polilíneas, partidos) */
export function segmentos(ents: Entidad[]): [Punto, Punto, string][] {
  const out: [Punto, Punto, string][] = [];
  ents.forEach(e => {
    if (e.t === 'linea') out.push([e.a, e.b, e.capa]);
    else if (e.t === 'poli') { const p = puntosSilueta(e.v, 10); const n = e.cerrada ? p.length : p.length - 1; for (let k = 0; k < n; k++) out.push([p[k], p[(k + 1) % p.length], e.capa]); }
  });
  return out;
}

export type TipoNodo = 'extremo' | 'medio' | 'centro' | 'intersección';
/** nodos para el imán: extremos y medios de cada tramo, centros de círculos y arcos, intersecciones */
export function nodosCAD(ents: Entidad[], maxInter = 1500): { p: Punto; t: TipoNodo }[] {
  const out: { p: Punto; t: TipoNodo }[] = [];
  const segs = segmentos(ents);
  segs.forEach(([a, b]) => { out.push({ p: a, t: 'extremo' }, { p: b, t: 'extremo' }, { p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, t: 'medio' }); });
  ents.forEach(e => { if (e.t === 'circulo' || e.t === 'arco') out.push({ p: e.c, t: 'centro' }); });
  if (segs.length <= maxInter) for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const [p, p2] = segs[i], [q, q2] = segs[j];
    const r = { x: p2.x - p.x, y: p2.y - p.y }, s = { x: q2.x - q.x, y: q2.y - q.y };
    const den = r.x * s.y - r.y * s.x;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((q.x - p.x) * s.y - (q.y - p.y) * s.x) / den, u = ((q.x - p.x) * r.y - (q.y - p.y) * r.x) / den;
    if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) out.push({ p: { x: p.x + t * r.x, y: p.y + t * r.y }, t: 'intersección' });
  }
  return out;
}

/** el nodo de CAD más cercano a p, dentro de tol (m) */
export function imanCAD(p: Punto, nodos: { p: Punto; t: TipoNodo }[], tol: number): { p: Punto; t: TipoNodo } | null {
  let mejor: { p: Punto; t: TipoNodo } | null = null, dMin = tol;
  for (const n of nodos) { const d = Math.hypot(n.p.x - p.x, n.p.y - p.y); if (d <= dMin) { dMin = d; mejor = n; } }
  return mejor;
}

/**
 * Muros a partir de una capa: pares de líneas paralelas (horizontales o verticales) a 8–60 cm que se superponen
 * forman un tabique (eje en el medio, espesor = separación); los rectángulos cerrados, también; los círculos son
 * columnas circulares.
 */
export function murosDesdeCAD(ents: Entidad[], idsUsados: Set<string>, eMin = 0.08, eMax = 0.6): Muro[] {
  const nuevoId = () => { let k = 1; while (idsUsados.has(`M${k}`)) k++; idsUsados.add(`M${k}`); return `M${k}`; };
  const base = (): Muro => ({ id: nuevoId(), dir: 'Y', x: 0, y: 0, largo: 1, espesor: 0.2, llega: true, areaInf: 10, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '' });
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const out: Muro[] = [];
  // rectángulos cerrados (4 vértices, lados a 0° y 90°)
  const lineas: [Punto, Punto][] = [];
  ents.forEach(e => {
    if (e.t === 'circulo') { out.push({ ...base(), tipo: 'tubo-circ', x: r3(e.c.x), y: r3(e.c.y), largo: r3(2 * e.r), espesor: r3(e.r) }); return; }
    if (e.t === 'poli' && e.cerrada && e.v.length === 4 && e.v.every(q => !q.b)) {
      const xs = e.v.map(q => q.x), ys = e.v.map(q => q.y);
      const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
      const ejes = e.v.every((q, k) => { const n = e.v[(k + 1) % 4]; return Math.abs(q.x - n.x) < 1e-6 || Math.abs(q.y - n.y) < 1e-6; });
      if (ejes && Math.min(w, h) > 0.02) {
        const vertical = h >= w;
        out.push({ ...base(), dir: vertical ? 'Y' : 'X', x: r3((Math.min(...xs) + Math.max(...xs)) / 2), y: r3((Math.min(...ys) + Math.max(...ys)) / 2), largo: r3(vertical ? h : w), espesor: r3(vertical ? w : h) });
        return;
      }
    }
    if (e.t === 'linea') lineas.push([e.a, e.b]);
    if (e.t === 'poli') { const p = puntosSilueta(e.v, 10); const n = e.cerrada ? p.length : p.length - 1; for (let k = 0; k < n; k++) lineas.push([p[k], p[(k + 1) % p.length]]); }
  });
  // pares de líneas paralelas
  const hor = lineas.filter(([a, b]) => Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 0.05).map(([a, b]) => ({ c: a.y, s0: Math.min(a.x, b.x), s1: Math.max(a.x, b.x), usada: false }));
  const ver = lineas.filter(([a, b]) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 0.05).map(([a, b]) => ({ c: a.x, s0: Math.min(a.y, b.y), s1: Math.max(a.y, b.y), usada: false }));
  const pares = (ls: typeof hor, dir: 'X' | 'Y') => {
    ls.sort((p, q) => p.c - q.c);
    ls.forEach((p, i) => {
      if (p.usada) return;
      for (let j = i + 1; j < ls.length; j++) {
        const q = ls[j];
        const e = q.c - p.c;
        if (e > eMax) break;
        if (q.usada || e < eMin) continue;
        const s0 = Math.max(p.s0, q.s0), s1 = Math.min(p.s1, q.s1);
        if (s1 - s0 < Math.max(0.3, 0.6 * Math.min(p.s1 - p.s0, q.s1 - q.s0))) continue;
        p.usada = q.usada = true;
        const cm = (p.c + q.c) / 2, sm = (s0 + s1) / 2;
        out.push({ ...base(), dir, x: r3(dir === 'X' ? sm : cm), y: r3(dir === 'X' ? cm : sm), largo: r3(s1 - s0), espesor: r3(e) });
        break;
      }
    });
  };
  pares(hor, 'X'); pares(ver, 'Y');
  return out;
}

/** el contorno cerrado más grande de las entidades (para losa o carpintería) */
export function contornoDesdeCAD(ents: Entidad[]): Vertice[] | null {
  const cand = ents.filter((e): e is Extract<Entidad, { t: 'poli' }> => e.t === 'poli' && (e.cerrada || Math.hypot(e.v[0].x - e.v[e.v.length - 1].x, e.v[0].y - e.v[e.v.length - 1].y) < 1e-6));
  if (!cand.length) return null;
  const area = (v: Vertice[]) => { const p = puntosSilueta(v, 5); return Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0)) / 2; };
  return cand.map(e => e.v).sort((a, b) => area(b) - area(a))[0];
}

/**
 * Niveles a partir de un corte: las líneas horizontales largas (al menos el 30 % del ancho del dibujo) son losas.
 * Se juntan las que están a menos de 60 cm (cara superior e inferior de una losa: se toma la de arriba) y se
 * devuelven las cotas en metros, de arriba hacia abajo, con PB en la cota indicada (o en la más baja que sobra
 * de la planta baja: la que el usuario elija después).
 */
export function cotasDesdeCorte(ents: Entidad[], factor: number): number[] {
  const segs = segmentos(ents).filter(([a, b]) => Math.abs(a.y - b.y) < 1e-6);
  if (!segs.length) return [];
  const ancho = Math.max(...segs.map(([a, b]) => Math.abs(b.x - a.x)));
  const ys = segs.filter(([a, b]) => Math.abs(b.x - a.x) >= 0.3 * ancho).map(([a]) => a.y * factor).sort((p, q) => q - p);
  const out: number[] = [];
  ys.forEach(y => { if (!out.length || out[out.length - 1] - y > 0.6) out.push(y); });   // losas (hasta 60 cm de espesor): la cara de arriba
  return out;
}
/** nombres de niveles para cotas (de arriba hacia abajo) con PB en la posición iPB */
export function nombrarNiveles(cotas: number[], iPB: number): { nombre: string; cota: number }[] {
  const zPB = cotas[iPB];
  return cotas.map((c, i) => ({
    nombre: i === 0 ? 'Azotea' : i < iPB ? `${iPB - i}º` : i === iPB ? 'PB' : `${i - iPB}º SS`,
    cota: Math.round((c - zPB) * 100) / 100,
  }));
}
