/**
 * Corte vertical de la torre para dar forma mirando los planos: dónde corta cada losa el plano del corte y cómo se
 * corre el borde que se arrastra en el corte.
 *
 * El corte «en x» es el plano y = c (en el dibujo va x a lo ancho y z para arriba); el corte «en y», el plano x = c
 * (va y a lo ancho). Al arrastrar el extremo izquierdo o derecho de una losa en el corte, se corre en paralelo el lado
 * de la losa que cruza el plano ahí (empujar/tirar de ese lado): sus dos vértices se mueven sobre la normal del lado,
 * lo justo para que el cruce quede donde se soltó. Los lados vecinos acompañan (siguen unidos a esos vértices).
 */
import { puntosSilueta, type Punto, type Vertice } from './silueta';

export type EjeCorte = 'x' | 'y';

/** cruces del contorno (ya discretizado) con el plano del corte, ordenados por la coordenada del dibujo */
export function crucesCorte(pol: Punto[], eje: EjeCorte, c: number): number[] {
  const u = (q: Punto) => (eje === 'x' ? q.y : q.x), w = (q: Punto) => (eje === 'x' ? q.x : q.y);
  const out: number[] = [];
  for (let i = 0; i < pol.length; i++) {
    const a = pol[i], b = pol[(i + 1) % pol.length], ua = u(a) - c, ub = u(b) - c;
    if ((ua < 0 && ub >= 0) || (ua >= 0 && ub < 0)) out.push(w(a) + (w(b) - w(a)) * (ua / (ua - ub)));
  }
  return out.sort((p, q) => p - q);
}
/** el tramo de losa que corta el plano: del primer cruce al último (null si el plano no la toca) */
export function tramoCorte(v: Vertice[], eje: EjeCorte, c: number): [number, number] | null {
  const xs = crucesCorte(puntosSilueta(v, 6), eje, c);
  return xs.length >= 2 ? [xs[0], xs[xs.length - 1]] : null;
}

/**
 * Corre el borde de la losa que cruza el plano del corte en su extremo «lado» (min: el de la izquierda del dibujo, max:
 * el de la derecha) para que el cruce quede en «nuevo». Devuelve el contorno nuevo, o null si no se puede (el plano no
 * corta la losa o el lado es paralelo al plano).
 */
export function moverBordeEnCorte(v: Vertice[], eje: EjeCorte, c: number, lado: 'min' | 'max', nuevo: number): Vertice[] | null {
  const u = (q: Punto) => (eje === 'x' ? q.y : q.x), w = (q: Punto) => (eje === 'x' ? q.x : q.y);
  const n = v.length;
  // el lado del contorno (entre vértices) que da el cruce extremo; los lados curvos se toman por su cuerda
  let mejor: { i: number; t: number } | null = null;
  for (let i = 0; i < n; i++) {
    const a = v[i], b = v[(i + 1) % n], ua = u(a) - c, ub = u(b) - c;
    if (!((ua < 0 && ub >= 0) || (ua >= 0 && ub < 0))) continue;
    const t = w(a) + (w(b) - w(a)) * (ua / (ua - ub));
    if (!mejor || (lado === 'min' ? t < mejor.t : t > mejor.t)) mejor = { i, t };
  }
  if (!mejor) return null;
  const a = v[mejor.i], b = v[(mejor.i + 1) % n], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
  if (L < 1e-9) return null;
  // normal del lado; corrimiento d sobre la normal que lleva el cruce de t a «nuevo»
  const nx = -dy / L, ny = dx / L, nw = eje === 'x' ? nx : ny;
  if (Math.abs(nw) < 1e-6) return null;
  // el lado es n·p = k; correrlo d sobre su normal corre el cruce con el plano d / n_w: d = Δ · n_w
  const d = (nuevo - mejor.t) * nw;
  const mov = (q: Vertice): Vertice => ({ ...q, x: +(q.x + nx * d).toFixed(4), y: +(q.y + ny * d).toFixed(4), ...(q.c1 && q.c2 ? { c1: { x: q.c1.x + nx * d, y: q.c1.y + ny * d }, c2: { x: q.c2.x + nx * d, y: q.c2.y + ny * d } } : {}) });
  const out = v.map(q => ({ ...q }));
  out[mejor.i] = mov(out[mejor.i]);
  out[(mejor.i + 1) % n] = mov(out[(mejor.i + 1) % n]);
  // los puntos de control de la Bézier que llega al primer vértice también acompañan
  const ant = out[(mejor.i - 1 + n) % n];
  if (ant.c2) ant.c2 = { x: ant.c2.x + nx * d, y: ant.c2.y + ny * d };
  return out;
}
