/**
 * Líneas guía y grilla de ejes para ubicar los elementos de la planta. Son geometría de construcción: no entran al
 * cálculo. Rectas (horizontales, verticales o con ángulo, cada una puede ser un eje con nombre: A, B, C… o 1, 2, 3…)
 * y círculos (compás, tangente a dos rectas con un radio, por tres puntos). El imán toma sus cruces, sus centros,
 * sus cuadrantes y cualquier punto sobre ellas.
 */
import type { Punto } from './silueta';

export type Guia =
  | { id: string; t: 'recta'; p: Punto; ang: number; eje?: string; deEjes?: boolean }
  | { id: string; t: 'circulo'; c: Punto; r: number };
export type GuiaRecta = Extract<Guia, { t: 'recta' }>;
export type GuiaCirculo = Extract<Guia, { t: 'circulo' }>;

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const dir = (g: GuiaRecta) => { const a = (g.ang * Math.PI) / 180; return { x: Math.cos(a), y: Math.sin(a) }; };
export const idGuia = (gs: Guia[]) => { const u = new Set(gs.map(g => g.id)); for (let k = 1; ; k++) if (!u.has(`L${k}`)) return `L${k}`; };

/**
 * Separaciones escritas como en un plano: «4 × 7,20», «3,60; 7,20; 3,60», «2x5 + 3,6». Devuelve los tramos en m.
 */
export function leerSeparaciones(txt: string): number[] | null {
  const t = txt.trim().replace(/\s*([x×*])\s*/gi, '$1');
  if (!t) return [];
  const out: number[] = [];
  for (const parte of t.split(/[;+\s]+/).filter(Boolean)) {
    const m = parte.match(/^(\d+)\s*[x×*]\s*([\d.,]+)$/i) ?? parte.match(/^(\d+)[x×*]([\d.,]+)$/i);
    if (m) { const n = Number(m[1]), d = Number(m[2].replace(',', '.')); if (!(n > 0 && n <= 200 && d > 0)) return null; for (let k = 0; k < n; k++) out.push(d); continue; }
    const d = Number(parte.replace(',', '.'));
    if (!(d > 0)) return null;
    out.push(d);
  }
  return out;
}
/** nombre del eje número k (0, 1, 2…): A…Z, AA, AB… o 1, 2, 3… */
export const nombreEje = (k: number, tipo: 'letras' | 'numeros') => {
  if (tipo === 'numeros') return String(k + 1);
  let s = '', n = k + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

export interface Grilla { sepX: number[]; sepY: number[]; x0: number; y0: number; nombresX: 'letras' | 'numeros'; nombresY: 'letras' | 'numeros'; centrar: boolean }
/** ejes de la grilla: verticales (en x) y horizontales (en y), con nombre */
export function ejesGrilla(g: Grilla, existentes: Guia[]): GuiaRecta[] {
  const tot = (s: number[]) => s.reduce((a, b) => a + b, 0);
  const x0 = g.centrar ? -tot(g.sepX) / 2 : g.x0, y0 = g.centrar ? -tot(g.sepY) / 2 : g.y0;
  const out: GuiaRecta[] = [];
  const todos = [...existentes];
  const pon = (p: Punto, ang: number, eje: string) => { const id = idGuia(todos); const r: GuiaRecta = { id, t: 'recta', p, ang, eje, deEjes: true }; todos.push(r); out.push(r); };
  let x = x0; [0, ...g.sepX].forEach((d, k) => { x += d; pon({ x: r4(x), y: 0 }, 90, nombreEje(k, g.nombresX)); });
  // los horizontales se nombran de abajo hacia arriba
  let y = y0; [0, ...g.sepY].forEach((d, k) => { y += d; pon({ x: 0, y: r4(y) }, 0, nombreEje(k, g.nombresY)); });
  return out;
}

// ------------------------------------------------------------------ intersecciones
export function cruceRectas(a: GuiaRecta, b: GuiaRecta): Punto | null {
  const u = dir(a), v = dir(b), den = u.x * v.y - u.y * v.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b.p.x - a.p.x) * v.y - (b.p.y - a.p.y) * v.x) / den;
  return { x: a.p.x + t * u.x, y: a.p.y + t * u.y };
}
export function cruceRectaCirculo(a: GuiaRecta, c: GuiaCirculo): Punto[] {
  const u = dir(a), fx = a.p.x - c.c.x, fy = a.p.y - c.c.y;
  const B = fx * u.x + fy * u.y, C = fx * fx + fy * fy - c.r * c.r, D = B * B - C;
  if (D < -1e-12) return [];
  const s = Math.sqrt(Math.max(0, D));
  return (s < 1e-9 ? [-B] : [-B - s, -B + s]).map(t => ({ x: a.p.x + t * u.x, y: a.p.y + t * u.y }));
}
export function cruceCirculos(a: GuiaCirculo, b: GuiaCirculo): Punto[] {
  const dx = b.c.x - a.c.x, dy = b.c.y - a.c.y, d = Math.hypot(dx, dy);
  if (d < 1e-9 || d > a.r + b.r + 1e-9 || d < Math.abs(a.r - b.r) - 1e-9) return [];
  const l = (a.r * a.r - b.r * b.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a.r * a.r - l * l));
  const mx = a.c.x + (dx * l) / d, my = a.c.y + (dy * l) / d;
  return h < 1e-9 ? [{ x: mx, y: my }] : [{ x: mx + (dy * h) / d, y: my - (dx * h) / d }, { x: mx - (dy * h) / d, y: my + (dx * h) / d }];
}
/** puntos notables: cruces de todas las guías, centros y cuadrantes de los círculos */
export function puntosNotables(gs: Guia[]): { p: Punto; t: string }[] {
  const out: { p: Punto; t: string }[] = [];
  for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
    const a = gs[i], b = gs[j];
    const ps = a.t === 'recta' && b.t === 'recta' ? [cruceRectas(a, b)].filter(Boolean) as Punto[] : a.t === 'recta' && b.t === 'circulo' ? cruceRectaCirculo(a, b) : a.t === 'circulo' && b.t === 'recta' ? cruceRectaCirculo(b, a) : cruceCirculos(a as GuiaCirculo, b as GuiaCirculo);
    const t = a.t === 'recta' && b.t === 'recta' && a.eje && b.eje ? `cruce de ejes ${a.ang === 90 ? a.eje + '-' + b.eje : b.eje + '-' + a.eje}` : 'intersección';
    ps.forEach(p => out.push({ p, t }));
  }
  gs.forEach(g => { if (g.t === 'circulo') { out.push({ p: g.c, t: 'centro' }); [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([u, v]) => out.push({ p: { x: g.c.x + u * g.r, y: g.c.y + v * g.r }, t: 'cuadrante' })); } });
  return out;
}
/** punto más cercano de la guía */
export function proyectar(q: Punto, g: Guia): Punto {
  if (g.t === 'recta') { const u = dir(g), t = (q.x - g.p.x) * u.x + (q.y - g.p.y) * u.y; return { x: g.p.x + t * u.x, y: g.p.y + t * u.y }; }
  const dx = q.x - g.c.x, dy = q.y - g.c.y, d = Math.hypot(dx, dy) || 1;
  return { x: g.c.x + (dx / d) * g.r, y: g.c.y + (dy / d) * g.r };
}
export const distGuia = (q: Punto, g: Guia) => { const p = proyectar(q, g); return Math.hypot(p.x - q.x, p.y - q.y); };

/** imán de las guías: primero los puntos notables, después cualquier punto sobre la guía más cercana */
export function imanGuias(q: Punto, gs: Guia[], tol: number): { p: Punto; t: string; punto: boolean } | null {
  if (!gs.length) return null;
  const pn = puntosNotables(gs).map(x => ({ ...x, d: Math.hypot(x.p.x - q.x, x.p.y - q.y) })).filter(x => x.d <= tol * 1.4).sort((a, b) => a.d - b.d)[0];
  if (pn) return { p: { x: r4(pn.p.x), y: r4(pn.p.y) }, t: pn.t, punto: true };
  const g = gs.map(g => ({ g, d: distGuia(q, g) })).filter(x => x.d <= tol).sort((a, b) => a.d - b.d)[0];
  if (!g) return null;
  const p = proyectar(q, g.g);
  return { p: { x: r4(p.x), y: r4(p.y) }, t: g.g.t === 'recta' && g.g.eje ? `sobre el eje ${g.g.eje}` : 'sobre la guía', punto: false };
}

// ------------------------------------------------------------------ construcciones
export const rectaPorDosPuntos = (a: Punto, b: Punto): { p: Punto; ang: number } => ({ p: { x: r4(a.x), y: r4(a.y) }, ang: r4(((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 180) % 180) });
/** paralela a una recta (o círculo concéntrico) a la distancia d, del lado del punto «lado» */
export function paralela(g: Guia, d: number, lado: Punto): Guia {
  if (g.t === 'circulo') { const fuera = Math.hypot(lado.x - g.c.x, lado.y - g.c.y) > g.r; return { ...g, r: r4(Math.max(1e-3, g.r + (fuera ? d : -d))) }; }
  const u = dir(g), n = { x: -u.y, y: u.x }, s = Math.sign((lado.x - g.p.x) * n.x + (lado.y - g.p.y) * n.y) || 1;
  const { deEjes: _d, eje: _e, ...resto } = g; void _d; void _e;
  return { ...resto, p: { x: r4(g.p.x + s * d * n.x), y: r4(g.p.y + s * d * n.y) } };
}
/** círculo de radio r tangente a dos rectas, en el ángulo del lado del punto «cerca» */
export function circuloTTR(a: GuiaRecta, b: GuiaRecta, r: number, cerca: Punto): { c: Punto; r: number } | null {
  const cands: Punto[] = [];
  for (const sa of [1, -1]) for (const sb of [1, -1]) {
    const A = paralela(a, r, { x: a.p.x - dir(a).y * sa, y: a.p.y + dir(a).x * sa }) as GuiaRecta, B = paralela(b, r, { x: b.p.x - dir(b).y * sb, y: b.p.y + dir(b).x * sb }) as GuiaRecta;
    const c = cruceRectas(A, B); if (c) cands.push(c);
  }
  if (!cands.length) return null;
  const c = cands.sort((u, v) => Math.hypot(u.x - cerca.x, u.y - cerca.y) - Math.hypot(v.x - cerca.x, v.y - cerca.y))[0];
  return { c: { x: r4(c.x), y: r4(c.y) }, r };
}
/** círculo por tres puntos */
export function circulo3p(a: Punto, b: Punto, c: Punto): { c: Punto; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const s = (q: Punto) => q.x * q.x + q.y * q.y;
  const ux = (s(a) * (b.y - c.y) + s(b) * (c.y - a.y) + s(c) * (a.y - b.y)) / d, uy = (s(a) * (c.x - b.x) + s(b) * (a.x - c.x) + s(c) * (b.x - a.x)) / d;
  return { c: { x: r4(ux), y: r4(uy) }, r: r4(Math.hypot(a.x - ux, a.y - uy)) };
}
