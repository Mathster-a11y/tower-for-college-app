/**
 * Perfil irregular: un elemento de forma libre en planta (recto en altura). Su contorno cerrado tiene tramos rectos,
 * arcos (bulge, como en AutoCAD) y curvas Bézier cúbicas, y puede tener huecos. Área, baricentro y J salen exactos de
 * los vértices (teorema de Green); las curvas se pasan antes a una polilínea fina.
 *
 * Los vértices se guardan respecto del baricentro (m.x, m.y): mover el elemento es cambiar x e y.
 * En la hoja J entra con el rectángulo equivalente de cada viento (mismo J y misma área), como propone el documento
 * «Perfiles irregulares y elementos diagonales» (opción 1).
 */
import type { Muro } from './modelo';
import type { Punto } from './silueta';

/** vértice de un contorno: el tramo que sale de él es Bézier si tiene c1 y c2, arco si tiene b, recto si no */
export interface VerticePerfil { x: number; y: number; b?: number; c1?: Punto; c2?: Punto }
export interface Perfil { v: VerticePerfil[]; huecos?: VerticePerfil[][] }

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** contorno pasado a polilínea: arcos de a lo sumo «grados» y Bézier en «nBz» tramos */
export function polilinea(v: VerticePerfil[], grados = 4, nBz = 24): Punto[] {
  const out: Punto[] = [];
  v.forEach((a, i) => {
    const b = v[(i + 1) % v.length];
    out.push({ x: a.x, y: a.y });
    if (a.c1 && a.c2) {
      for (let k = 1; k < nBz; k++) {
        const t = k / nBz, u = 1 - t;
        out.push({ x: u * u * u * a.x + 3 * u * u * t * a.c1.x + 3 * u * t * t * a.c2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * a.c1.y + 3 * u * t * t * a.c2.y + t * t * t * b.y });
      }
      return;
    }
    const bu = a.b ?? 0;
    if (Math.abs(bu) < 1e-9) return;
    const th = 4 * Math.atan(bu);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, c = Math.hypot(dx, dy);
    if (c < 1e-12) return;
    const dist = c / 2 / Math.tan(th / 2);
    const ox = cx - (dy / c) * dist, oy = cy + (dx / c) * dist;
    const r = Math.hypot(a.x - ox, a.y - oy), a0 = Math.atan2(a.y - oy, a.x - ox);
    const n = Math.max(2, Math.ceil(Math.abs(th) / ((grados * Math.PI) / 180)));
    for (let k = 1; k < n; k++) { const t = a0 + (th * k) / n; out.push({ x: ox + r * Math.cos(t), y: oy + r * Math.sin(t) }); }
  });
  return out;
}

/** integrales de un polígono simple (con signo según el sentido) */
function integrales(pol: Punto[]) {
  let A = 0, Sx = 0, Sy = 0, Ixx = 0, Iyy = 0, Ixy = 0;
  for (let i = 0; i < pol.length; i++) {
    const { x: x0, y: y0 } = pol[i], { x: x1, y: y1 } = pol[(i + 1) % pol.length];
    const c = x0 * y1 - x1 * y0;
    A += c / 2; Sx += ((x0 + x1) * c) / 6; Sy += ((y0 + y1) * c) / 6;
    Ixx += ((y0 * y0 + y0 * y1 + y1 * y1) * c) / 12;
    Iyy += ((x0 * x0 + x0 * x1 + x1 * x1) * c) / 12;
    Ixy += ((x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c) / 24;
  }
  return { A, Sx, Sy, Ixx, Iyy, Ixy };
}
export interface PropsPerfil {
  A: number; xg: number; yg: number;
  /** J respecto del baricentro: viento A (↑, alrededor de x), viento B (→, alrededor de y) y el producto J xy */
  JA: number; JB: number; Jxy: number;
  /** fibra más alejada del baricentro en el sentido de cada viento (m) */
  cA: number; cB: number;
  /** caja */ x0: number; x1: number; y0: number; y1: number;
}
/** propiedades de un perfil con sus huecos (coordenadas en las que estén los vértices) */
export function propiedades(p: Perfil): PropsPerfil {
  const ext = polilinea(p.v, 1, 48), hs = (p.huecos ?? []).map(h => polilinea(h, 1, 48));
  const ie = integrales(ext), sgn = Math.sign(ie.A) || 1;
  const t = { A: ie.A * sgn, Sx: ie.Sx * sgn, Sy: ie.Sy * sgn, Ixx: ie.Ixx * sgn, Iyy: ie.Iyy * sgn, Ixy: ie.Ixy * sgn };
  hs.forEach(h => { const ih = integrales(h), s = Math.sign(ih.A) || 1; t.A -= ih.A * s; t.Sx -= ih.Sx * s; t.Sy -= ih.Sy * s; t.Ixx -= ih.Ixx * s; t.Iyy -= ih.Iyy * s; t.Ixy -= ih.Ixy * s; });
  const A = t.A || 1e-12, xg = t.Sx / A, yg = t.Sy / A;
  const xs = ext.map(q => q.x), ys = ext.map(q => q.y);
  return {
    A: t.A, xg, yg, JA: t.Ixx - A * yg * yg, JB: t.Iyy - A * xg * xg, Jxy: t.Ixy - A * xg * yg,
    cA: Math.max(...ys.map(y => Math.abs(y - yg))), cB: Math.max(...xs.map(x => Math.abs(x - xg))),
    x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys),
  };
}
/** J principales y ángulo del eje fuerte respecto de x (grados) */
export function principales(pr: PropsPerfil): { J1: number; J2: number; ang: number } {
  const m = (pr.JA + pr.JB) / 2, r = Math.hypot((pr.JA - pr.JB) / 2, pr.Jxy);
  return { J1: m + r, J2: m - r, ang: (0.5 * Math.atan2(-2 * pr.Jxy, pr.JA - pr.JB) * 180) / Math.PI };
}
/** cuánto pesa J xy: |J xy| / √(J A · J B) (más de 0,10: la flexión se tuerce hacia el otro lado) */
export const acople = (pr: PropsPerfil) => (pr.JA > 0 && pr.JB > 0 ? Math.abs(pr.Jxy) / Math.sqrt(pr.JA * pr.JB) : 0);

/** rectángulo equivalente para el viento: mismo J y misma área (b transversal, h en el sentido del viento) */
export function rectanguloEquivalente(J: number, A: number): { b: number; h: number } {
  const h = Math.sqrt((12 * J) / A);
  return { b: r4(A / h), h: r4(h) };
}

// ------------------------------------------------------------------ transformaciones (vértices y puntos de control)
const mapa = (p: Perfil, f: (q: Punto) => Punto, invertir = false): Perfil => {
  const conv = (vs: VerticePerfil[]) => {
    const n = vs.map(q => ({ ...f(q), ...(q.b ? { b: invertir ? -q.b : q.b } : {}), ...(q.c1 && q.c2 ? { c1: f(q.c1), c2: f(q.c2) } : {}) }));
    return n.map(q => ({ ...q, x: r4(q.x), y: r4(q.y), ...(q.c1 ? { c1: { x: r4(q.c1.x), y: r4(q.c1.y) }, c2: { x: r4(q.c2!.x), y: r4(q.c2!.y) } } : {}) }));
  };
  return { v: conv(p.v), ...(p.huecos?.length ? { huecos: p.huecos.map(conv) } : {}) };
};
export const trasladar = (p: Perfil, dx: number, dy: number) => mapa(p, q => ({ x: q.x + dx, y: q.y + dy }));
/** giro antihorario de «grados» alrededor del origen */
export function girar(p: Perfil, grados: number): Perfil {
  const a = (grados * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const exacto = Math.abs(grados % 90) < 1e-9;
  const k = ((Math.round(grados / 90) % 4) + 4) % 4, cs = [[1, 0], [0, 1], [-1, 0], [0, -1]][k];
  return mapa(p, q => (exacto ? { x: q.x * cs[0] - q.y * cs[1], y: q.x * cs[1] + q.y * cs[0] } : { x: q.x * c - q.y * s, y: q.x * s + q.y * c }));
}
/** espejo respecto del eje vertical (x → −x) u horizontal (y → −y) por el origen; los arcos cambian de sentido */
export const espejar = (p: Perfil, eje: 'x' | 'y') => mapa(p, q => (eje === 'x' ? { x: -q.x, y: q.y } : { x: q.x, y: -q.y }), true);
export const escalar = (p: Perfil, f: number) => mapa(p, q => ({ x: q.x * f, y: q.y * f }));

/** el perfil con el baricentro en el origen; devuelve también dónde estaba */
export function centrar(p: Perfil): { perfil: Perfil; xg: number; yg: number } {
  const pr = propiedades(p);
  return { perfil: trasladar(p, -pr.xg, -pr.yg), xg: pr.xg, yg: pr.yg };
}

/** perfil en coordenadas de la planta (los vértices del muro más su posición) */
export const enPlanta = (m: Muro): Perfil => trasladar(m.perfil!, m.x, m.y);

/**
 * Pasa un perfil en coordenadas de la planta al muro: lo centra en su baricentro y completa largo, espesor y dirección
 * con la caja (para las tablas y los rótulos).
 */
export function ponerPerfil(m: Muro, p: Perfil): Muro {
  const { perfil, xg, yg } = centrar(p);
  const pr = propiedades(perfil);
  const ax = pr.x1 - pr.x0, ay = pr.y1 - pr.y0;
  const n: Muro = { ...m, tipo: 'perfil', perfil, x: r4(xg), y: r4(yg), dir: ay >= ax ? 'Y' : 'X', largo: r4(Math.max(ax, ay)), espesor: r4(Math.min(ax, ay)) };
  delete n.ladoY;
  return n;
}

/** contorno de un tabique o un tubo rectangular, en la planta (sentido antihorario) */
export function perfilDeMuro(m: Muro): Perfil {
  if (m.perfil) return enPlanta(m);
  const t = m.tipo ?? 'tabique';
  const ax = t === 'tubo-rect' ? m.largo : t === 'tubo-circ' ? m.largo : m.dir === 'Y' ? m.espesor : m.largo;
  const ay = t === 'tubo-rect' ? m.ladoY ?? m.largo : t === 'tubo-circ' ? m.largo : m.dir === 'Y' ? m.largo : m.espesor;
  const rect = (cx: number, cy: number, a: number, b: number, horario = false): VerticePerfil[] => {
    const v = [{ x: cx - a / 2, y: cy - b / 2 }, { x: cx + a / 2, y: cy - b / 2 }, { x: cx + a / 2, y: cy + b / 2 }, { x: cx - a / 2, y: cy + b / 2 }].map(q => ({ x: r4(q.x), y: r4(q.y) }));
    return horario ? v.reverse() : v;
  };
  if (t === 'tubo-circ') {
    const r = m.largo / 2, ri = Math.max(0, r - m.espesor);
    const circ = (rr: number): VerticePerfil[] => [{ x: r4(m.x + rr), y: m.y, b: 1 }, { x: r4(m.x - rr), y: m.y, b: 1 }];
    return { v: circ(r), ...(ri > 1e-4 ? { huecos: [circ(ri)] } : {}) };
  }
  if (t === 'tubo-rect' && m.espesor < Math.min(ax, ay) / 2) return { v: rect(m.x, m.y, ax, ay), huecos: [rect(m.x, m.y, ax - 2 * m.espesor, ay - 2 * m.espesor)] };
  return { v: rect(m.x, m.y, ax, ay) };
}

/** el perfil es un rectángulo con los lados en x e y, sin curvas ni huecos: devuelve su caja */
export function esRectanguloOrtogonal(p: Perfil): { cx: number; cy: number; ax: number; ay: number } | null {
  if (p.huecos?.length || p.v.length !== 4 || p.v.some(q => q.b || q.c1)) return null;
  const xs = [...new Set(p.v.map(q => r4(q.x)))], ys = [...new Set(p.v.map(q => r4(q.y)))];
  if (xs.length !== 2 || ys.length !== 2) return null;
  for (let i = 0; i < 4; i++) { const a = p.v[i], b = p.v[(i + 1) % 4]; if (Math.abs(a.x - b.x) > 1e-4 && Math.abs(a.y - b.y) > 1e-4) return null; }
  return { cx: r4((xs[0] + xs[1]) / 2), cy: r4((ys[0] + ys[1]) / 2), ax: r4(Math.abs(xs[1] - xs[0])), ay: r4(Math.abs(ys[1] - ys[0])) };
}
/** todos los tramos van en x o en y, sin curvas */
export const esOrtogonal = (p: Perfil) => [p.v, ...(p.huecos ?? [])].every(vs => vs.every((a, i) => { const b = vs[(i + 1) % vs.length]; return !a.b && !a.c1 && (Math.abs(a.x - b.x) < 1e-4 || Math.abs(a.y - b.y) < 1e-4); }));

/**
 * Tiras horizontales que aproximan el perfil (para lo que trabaja con rectángulos: áreas de influencia, dibujos
 * esquemáticos). El cálculo usa las propiedades exactas.
 */
export function tiras(p: Perfil, n = 24): { x: number; y: number; ax: number; ay: number }[] {
  const pols = [polilinea(p.v, 6, 12), ...(p.huecos ?? []).map(h => polilinea(h, 6, 12))];
  const ys = pols[0].map(q => q.y), y0 = Math.min(...ys), y1 = Math.max(...ys), dy = (y1 - y0) / n;
  const out: { x: number; y: number; ax: number; ay: number }[] = [];
  for (let k = 0; k < n; k++) {
    const y = y0 + (k + 0.5) * dy, xs: number[] = [];
    pols.forEach(pol => pol.forEach((a, i) => { const b = pol[(i + 1) % pol.length]; if ((a.y > y) !== (b.y > y)) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)); }));
    xs.sort((u, v) => u - v);
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 1e-6) out.push({ x: (xs[i] + xs[i + 1]) / 2, y, ax: xs[i + 1] - xs[i], ay: dy });
  }
  return out;
}

/**
 * Muro curvo (o de cualquier forma) a partir de un eje: la polilínea del eje se corre e/2 a cada lado y se cierra.
 * El eje viene ya pasado a puntos (los arcos en tramos cortos).
 */
export function desdeEje(eje: Punto[], e: number): Perfil | null {
  if (eje.length < 2 || !(e > 0)) return null;
  const n = eje.length, izq: Punto[] = [], der: Punto[] = [];
  const normal = (a: Punto, b: Punto) => { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; return { x: -dy / L, y: dx / L }; };
  for (let i = 0; i < n; i++) {
    const nA = i > 0 ? normal(eje[i - 1], eje[i]) : null, nB = i < n - 1 ? normal(eje[i], eje[i + 1]) : null;
    let nx: number, ny: number, f = 1;
    if (nA && nB) { nx = nA.x + nB.x; ny = nA.y + nB.y; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L; const cos = nx * nA.x + ny * nA.y; f = 1 / Math.max(0.3, cos); }   // inglete
    else { const q = (nA ?? nB)!; nx = q.x; ny = q.y; }
    izq.push({ x: eje[i].x + (nx * e * f) / 2, y: eje[i].y + (ny * e * f) / 2 });
    der.push({ x: eje[i].x - (nx * e * f) / 2, y: eje[i].y - (ny * e * f) / 2 });
  }
  const v = [...der, ...izq.reverse()].map(q => ({ x: r4(q.x), y: r4(q.y) }));
  // sin vértices repetidos
  return { v: v.filter((q, i) => { const s = v[(i + 1) % v.length]; return Math.hypot(q.x - s.x, q.y - s.y) > 1e-5; }) };
}
