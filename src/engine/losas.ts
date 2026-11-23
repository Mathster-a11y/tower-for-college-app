/**
 * Losas desde cero: formas de arranque con sus medidas (rectángulo, esquinas redondeadas, círculo, elipse, polígono,
 * L, T, U, cruz, trapecio, estadio), salientes y entrantes en un lado (balcones, voladizos, retiros) y el control de
 * que un contorno dibujado a mano no se cruce.
 *
 * Los contornos van en sentido antihorario, centrados en el origen (el centro de la planta), con los arcos exactos
 * (bulge: positivo = la panza hacia afuera en un contorno antihorario).
 */
import { circulo, elipse, poligonoRegular, rectangulo, tratarEsquinas } from './contorno';
import { puntosSilueta, type Vertice } from './silueta';

export type FormaLosa = 'rect' | 'redondeado' | 'circulo' | 'elipse' | 'poligono' | 'L' | 'T' | 'U' | 'cruz' | 'trapecio' | 'estadio';
/** B: ancho en x · L: largo en y · a: ancho de las alas (L, T, U, cruz) · r: radio de las esquinas · n: lados · Bs: ancho de arriba (trapecio) */
export interface MedidasLosa { B: number; L: number; a?: number; r?: number; n?: number; Bs?: number }

export const FORMAS_LOSA: Record<FormaLosa, { nombre: string; texto: string; medidas: (keyof MedidasLosa)[]; def: MedidasLosa }> = {
  rect: { nombre: 'Rectángulo', texto: 'B de ancho (x) por L de largo (y).', medidas: ['B', 'L'], def: { B: 20, L: 16 } },
  redondeado: { nombre: 'Esquinas redondeadas', texto: 'Rectángulo con las cuatro esquinas en arco de radio r.', medidas: ['B', 'L', 'r'], def: { B: 20, L: 16, r: 3 } },
  circulo: { nombre: 'Círculo', texto: 'Diámetro B.', medidas: ['B'], def: { B: 18, L: 18 } },
  elipse: { nombre: 'Elipse', texto: 'Ejes B (x) y L (y).', medidas: ['B', 'L'], def: { B: 24, L: 16 } },
  poligono: { nombre: 'Polígono regular', texto: 'n lados, inscripto en un círculo de diámetro B.', medidas: ['B', 'n'], def: { B: 20, L: 20, n: 6 } },
  L: { nombre: 'En L', texto: 'Caja B × L con dos alas de ancho a (abajo y a la izquierda).', medidas: ['B', 'L', 'a'], def: { B: 24, L: 20, a: 10 } },
  T: { nombre: 'En T', texto: 'Ala de arriba de ancho total B y alto a; alma central de ancho a.', medidas: ['B', 'L', 'a'], def: { B: 24, L: 20, a: 9 } },
  U: { nombre: 'En U', texto: 'Base abajo de alto a y dos alas de ancho a, abierta arriba (un patio).', medidas: ['B', 'L', 'a'], def: { B: 26, L: 20, a: 8 } },
  cruz: { nombre: 'En cruz', texto: 'Dos brazos de ancho a que se cruzan en el medio.', medidas: ['B', 'L', 'a'], def: { B: 26, L: 26, a: 10 } },
  trapecio: { nombre: 'Trapecio', texto: 'Ancho B abajo, Bs arriba y largo L.', medidas: ['B', 'Bs', 'L'], def: { B: 24, L: 16, Bs: 14 } },
  estadio: { nombre: 'Estadio', texto: 'Rectángulo con los dos lados cortos en semicírculo: largo total B, ancho L.', medidas: ['B', 'L'], def: { B: 30, L: 14 } },
};

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const pt = (x: number, y: number): Vertice => ({ x: r4(x), y: r4(y) });

/** la forma de arranque, centrada en la caja (o un error si las medidas no alcanzan) */
export function formaLosa(f: FormaLosa, m: MedidasLosa): Vertice[] | { error: string } {
  const B = m.B, L = m.L, a = m.a ?? 0, hB = B / 2, hL = L / 2;
  if (!(B > 0) || (FORMAS_LOSA[f].medidas.includes('L') && !(L > 0))) return { error: 'Las medidas tienen que ser mayores que cero.' };
  if (['L', 'T', 'U', 'cruz'].includes(f) && !(a > 0 && a < Math.min(B, L))) return { error: 'El ancho de las alas (a) tiene que ser mayor que cero y menor que B y que L.' };
  switch (f) {
    case 'rect': return rectangulo(0, 0, B, L);
    case 'redondeado': {
      const r = m.r ?? 0;
      if (!(r > 0) || r > Math.min(B, L) / 2) return { error: `El radio tiene que estar entre 0 y ${(Math.min(B, L) / 2).toFixed(2).replace('.', ',')} m (la mitad del lado corto).` };
      const out = tratarEsquinas(rectangulo(0, 0, B, L), 'redondeada', r);
      return 'error' in out ? out : out;
    }
    case 'circulo': return circulo(0, 0, B / 2);
    case 'elipse': return elipse(0, 0, B / 2, L / 2);
    case 'poligono': {
      const n = Math.round(m.n ?? 6);
      if (n < 3 || n > 64) return { error: 'El polígono tiene que tener entre 3 y 64 lados.' };
      return poligonoRegular(0, 0, B / 2, n);
    }
    case 'L': return [pt(-hB, -hL), pt(hB, -hL), pt(hB, -hL + a), pt(-hB + a, -hL + a), pt(-hB + a, hL), pt(-hB, hL)];
    case 'T': return [pt(-a / 2, -hL), pt(a / 2, -hL), pt(a / 2, hL - a), pt(hB, hL - a), pt(hB, hL), pt(-hB, hL), pt(-hB, hL - a), pt(-a / 2, hL - a)];
    case 'U': return [pt(-hB, -hL), pt(hB, -hL), pt(hB, hL), pt(hB - a, hL), pt(hB - a, -hL + a), pt(-hB + a, -hL + a), pt(-hB + a, hL), pt(-hB, hL)];
    case 'cruz': {
      const h = a / 2;
      return [pt(-h, -hL), pt(h, -hL), pt(h, -h), pt(hB, -h), pt(hB, h), pt(h, h), pt(h, hL), pt(-h, hL), pt(-h, h), pt(-hB, h), pt(-hB, -h), pt(-h, -h)];
    }
    case 'trapecio': {
      const s = (m.Bs ?? B) / 2;
      if (!(s > 0)) return { error: 'El ancho de arriba tiene que ser mayor que cero.' };
      return [pt(-hB, -hL), pt(hB, -hL), pt(s, hL), pt(-s, hL)];
    }
    case 'estadio': {
      if (!(B > L)) return { error: 'En el estadio, el largo B tiene que ser mayor que el ancho L (los extremos son semicírculos de diámetro L).' };
      const c = (B - L) / 2;
      return [{ ...pt(-c, -hL) }, { ...pt(c, -hL), b: 1 }, { ...pt(c, hL) }, { ...pt(-c, hL), b: 1 }];
    }
  }
}

/** área con signo del contorno (positiva = antihorario), con los arcos */
function areaConSigno(v: Vertice[]): number {
  const p = puntosSilueta(v, 4);
  return p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
}
/** el contorno en sentido antihorario (si venía al revés, se da vuelta con los arcos) */
export function antihorario(v: Vertice[]): Vertice[] {
  if (areaConSigno(v) >= 0) return v.map(q => ({ ...q }));
  const n = v.length;
  // al revés: el tramo que salía de i hacia i+1 ahora sale de i+1 hacia i, con el bulge cambiado de signo
  return Array.from({ length: n }, (_, k) => {
    const i = (n - k) % n, prev = v[(i - 1 + n) % n];
    const q: Vertice = { x: v[i].x, y: v[i].y };
    if (prev.b) q.b = -prev.b;
    if (prev.c1 && prev.c2) { q.c1 = { ...prev.c2 }; q.c2 = { ...prev.c1 }; }
    return q;
  });
}

/** ¿el contorno se cruza a sí mismo? (con los arcos y las Bézier discretizados) */
export function seCruza(v: Vertice[]): boolean {
  const p = puntosSilueta(v, 6), n = p.length;
  const corta = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) => {
    const o = (p1: typeof a, p2: typeof a, p3: typeof a) => (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
    const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
    return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
  };
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;                       // vecinos por el cierre
    if (corta(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true;
  }
  return false;
}

/** descripción de un lado recto: largo, hacia dónde mira (afuera) y si se puede usar para un saliente */
export function ladosLosa(v: Vertice[]): { i: number; largo: number; mira: string; recto: boolean }[] {
  const w = antihorario(v);
  return w.map((a, i) => {
    const b = w[(i + 1) % w.length], dx = b.x - a.x, dy = b.y - a.y, largo = Math.hypot(dx, dy);
    // afuera, en un contorno antihorario, es a la derecha del avance
    const nx = dy, ny = -dx, ang = (Math.atan2(ny, nx) * 180) / Math.PI;
    const mira = ang > -45 && ang <= 45 ? 'a la derecha (+x)' : ang > 45 && ang <= 135 ? 'arriba (+y)' : ang > -135 && ang <= -45 ? 'abajo (−y)' : 'a la izquierda (−x)';
    return { i, largo, mira, recto: !a.b && !(a.c1 && a.c2) };
  });
}

/**
 * Saliente (prof > 0: balcón, voladizo) o entrante (prof < 0: retiro, patio abierto) rectangular en el lado recto i,
 * de ancho «ancho», con su centro a «centro» metros del primer vértice del lado (vacío = en el medio). El contorno
 * se toma antihorario. Devuelve el contorno nuevo o un error si no entra o si se cruza.
 */
export function salienteEnLado(v: Vertice[], i: number, ancho: number, prof: number, centro?: number | null): Vertice[] | { error: string } {
  const w = antihorario(v), n = w.length, a = w[i], b = w[(i + 1) % n];
  if (!a || a.b || (a.c1 && a.c2)) return { error: 'Elegí un lado recto (los arcos y las curvas no llevan salientes).' };
  const dx = b.x - a.x, dy = b.y - a.y, Ll = Math.hypot(dx, dy);
  if (!(ancho > 0) || Math.abs(prof) < 1e-6) return { error: 'El ancho y la profundidad no pueden ser cero.' };
  const c = centro ?? Ll / 2, s0 = c - ancho / 2, s1 = c + ancho / 2;
  if (s0 < -1e-6 || s1 > Ll + 1e-6) return { error: `No entra: el lado mide ${Ll.toFixed(2).replace('.', ',')} m y el saliente va de ${s0.toFixed(2).replace('.', ',')} a ${s1.toFixed(2).replace('.', ',')} m.` };
  const ux = dx / Ll, uy = dy / Ll, nx = uy, ny = -ux;                  // afuera: a la derecha del avance
  const P = (s: number, d: number): Vertice => pt(a.x + ux * s + nx * d, a.y + uy * s + ny * d);
  const nuevos: Vertice[] = [];
  if (s0 > 1e-6) nuevos.push(P(s0, 0));
  nuevos.push(P(s0, prof), P(s1, prof));
  if (s1 < Ll - 1e-6) nuevos.push(P(s1, 0));
  const out = [...w.slice(0, i + 1).map(q => ({ ...q })), ...nuevos, ...w.slice(i + 1).map(q => ({ ...q }))];
  // un saliente que toma todo el lado deja los vértices del lado de más (alineados): se sacan
  const limpio = out.filter((q, k) => { const p0 = out[(k - 1 + out.length) % out.length], p1 = out[(k + 1) % out.length]; if (p0.b || q.b) return true; return Math.abs((q.x - p0.x) * (p1.y - p0.y) - (q.y - p0.y) * (p1.x - p0.x)) > 1e-8; });
  if (seCruza(limpio)) return { error: 'Así el contorno se cruza consigo mismo: probá con menos profundidad o en otro lugar del lado.' };
  if (areaConSigno(limpio) <= 0) return { error: 'El entrante es más profundo que la losa.' };
  return limpio;
}
