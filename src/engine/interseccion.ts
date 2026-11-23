/**
 * Intersección exacta de dos polígonos simples (cóncavos o convexos), con el resultado en piezas: lo que está en los
 * dos a la vez. Se usa para la carpintería losa por losa (lo común a la losa de abajo y la de arriba), que puede
 * partirse en dos o más piezas separadas.
 *
 * Método (robusto con lados que coinciden, que entre losas apiladas es lo normal):
 *  1. cada polígono se parte en triángulos (orejas);
 *  2. cada par de triángulos se corta (dos convexos: Sutherland–Hodgman, exacto);
 *  3. las piezas convexas cubren lo común sin pisarse: el borde son los lados que no comparten dos piezas
 *     (se parten antes los lados en los vértices que caen sobre ellos);
 *  4. esos lados se encadenan en anillos. Los anillos antihorarios son las piezas; los horarios serían agujeros dentro
 *     de una pieza (no afectan a la carpintería exterior) y se descartan.
 */
import type { Punto } from './silueta';

const EPS = 1e-7;
const area = (q: Punto[]) => q.reduce((s, a, i) => { const b = q[(i + 1) % q.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
const cruz = (o: Punto, a: Punto, b: Punto) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** sin puntos repetidos ni alineados, antihorario */
export function limpiar(q0: Punto[], tol = 1e-9): Punto[] {
  let q = q0.filter((p, i) => { const r = q0[(i + 1) % q0.length]; return Math.hypot(p.x - r.x, p.y - r.y) > 1e-9; });
  for (let it = 0; it < 3 && q.length > 3; it++) {
    const out = q.filter((b, i) => { const a = q[(i - 1 + q.length) % q.length], c = q[(i + 1) % q.length], l = Math.hypot(c.x - a.x, c.y - a.y); return l < 1e-12 || Math.abs(cruz(a, b, c)) / l > tol; });
    if (out.length === q.length || out.length < 3) break;
    q = out;
  }
  return area(q) < 0 ? [...q].reverse() : q;
}

/** triangulación por orejas de un polígono simple antihorario */
export function triangular(q0: Punto[]): Punto[][] {
  const q = [...q0], tris: Punto[][] = [];
  let guarda = 0;
  while (q.length > 3 && guarda++ < 10000) {
    let hecho = false;
    for (let i = 0; i < q.length; i++) {
      const a = q[(i - 1 + q.length) % q.length], b = q[i], c = q[(i + 1) % q.length];
      if (cruz(a, b, c) <= 1e-12) continue;                                  // reflejo o alineado: no es oreja
      const adentro = q.some(p => p !== a && p !== b && p !== c && cruz(a, b, p) >= -1e-12 && cruz(b, c, p) >= -1e-12 && cruz(c, a, p) >= -1e-12
        && !(Math.hypot(p.x - a.x, p.y - a.y) < 1e-9 || Math.hypot(p.x - b.x, p.y - b.y) < 1e-9 || Math.hypot(p.x - c.x, p.y - c.y) < 1e-9));
      if (adentro) continue;
      tris.push([a, b, c]); q.splice(i, 1); hecho = true; break;
    }
    if (!hecho) {
      // sin oreja (polígono casi degenerado): se saca el vértice más alineado y se sigue
      let k = 0, m = Infinity;
      q.forEach((b, i) => { const v = Math.abs(cruz(q[(i - 1 + q.length) % q.length], b, q[(i + 1) % q.length])); if (v < m) { m = v; k = i; } });
      q.splice(k, 1);
    }
  }
  if (q.length === 3 && area(q) > 1e-12) tris.push(q);
  return tris;
}

/** recorte de un convexo por otro convexo (los dos antihorarios) */
function recortarConvexos(suj: Punto[], rec: Punto[]): Punto[] {
  let out = suj;
  for (let i = 0; i < rec.length && out.length; i++) {
    const a = rec[i], b = rec[(i + 1) % rec.length], f = (q: Punto) => cruz(a, b, q);
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length], fp = f(p), fq = f(q);
      if (fp >= -1e-12) out.push(p);
      if ((fp >= -1e-12) !== (fq >= -1e-12)) { const t = fp / (fp - fq); out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }); }
    }
  }
  return out;
}

const caja = (q: Punto[]) => q.reduce((c, p) => ({ x0: Math.min(c.x0, p.x), y0: Math.min(c.y0, p.y), x1: Math.max(c.x1, p.x), y1: Math.max(c.y1, p.y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });

/** une piezas que no se pisan (cubren una región sin superponerse): los anillos del borde, antihorarios */
export function unirPiezas(piezas: Punto[][]): Punto[][] {
  const R = 1e6, k = (p: Punto) => `${Math.round(p.x * R)},${Math.round(p.y * R)}`;
  // vértices de todas las piezas, para partir los lados donde cae uno (uniones en T)
  const vert = new Map<string, Punto>();
  piezas.forEach(q => q.forEach(p => vert.set(k(p), { x: Math.round(p.x * R) / R, y: Math.round(p.y * R) / R })));
  const vs = [...vert.values()];
  const cuenta = new Map<string, { a: Punto; b: Punto; n: number }>();
  const agregar = (a: Punto, b: Punto) => {
    const ka = k(a), kb = k(b); if (ka === kb) return;
    const inv = cuenta.get(kb + '>' + ka);
    if (inv && inv.n > 0) { inv.n--; return; }                               // lado compartido: se anula
    const e = cuenta.get(ka + '>' + kb); if (e) e.n++; else cuenta.set(ka + '>' + kb, { a, b, n: 1 });
  };
  piezas.forEach(q0 => {
    const q = q0.map(p => vert.get(k(p))!);
    q.forEach((a, i) => {
      const b = q[(i + 1) % q.length], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      if (l2 < 1e-18) return;
      const x0 = Math.min(a.x, b.x) - EPS, x1 = Math.max(a.x, b.x) + EPS, y0 = Math.min(a.y, b.y) - EPS, y1 = Math.max(a.y, b.y) + EPS;
      const sobre = vs.filter(p => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)
        .map(p => ({ p, t: ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, d: Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / Math.sqrt(l2) }))
        .filter(o => o.t > 1e-9 && o.t < 1 - 1e-9 && o.d < 1e-6).sort((u, w) => u.t - w.t);
      let prev = a;
      for (const o of sobre) { agregar(prev, o.p); prev = o.p; }
      agregar(prev, b);
    });
  });
  // lados del borde: salida por vértice
  const sal = new Map<string, Punto[]>();
  cuenta.forEach(e => { for (let i = 0; i < e.n; i++) { const ka = k(e.a); (sal.get(ka) ?? sal.set(ka, []).get(ka)!).push(e.b); } });
  const anillos: Punto[][] = [];
  for (const [ka0, lista] of sal) {
    while (lista.length) {
      const ini = vert.get(ka0)!, anillo: Punto[] = [ini];
      let prev = ini, cur = lista.pop()!, guarda = 0;
      while (k(cur) !== ka0 && guarda++ < 100000) {
        anillo.push(cur);
        const opciones = sal.get(k(cur));
        if (!opciones || !opciones.length) break;
        // en un vértice de pellizco, el giro más a la derecha (cierra la pieza más chica)
        let j = 0;
        if (opciones.length > 1) {
          const ang = (p: Punto) => { const a1 = Math.atan2(prev.y - cur.y, prev.x - cur.x), a2 = Math.atan2(p.y - cur.y, p.x - cur.x); let d = a2 - a1; while (d <= 0) d += 2 * Math.PI; return d; };
          let m = Infinity; opciones.forEach((p, i) => { const v = ang(p); if (v < m) { m = v; j = i; } });
        }
        prev = cur; cur = opciones.splice(j, 1)[0];
      }
      if (anillo.length >= 3) anillos.push(anillo);
    }
  }
  return anillos.map(q => limpiar(q.map(p => ({ x: p.x, y: p.y })), 1e-7)).filter((q, i) => area(anillos[i]) > 1e-6 && q.length >= 3);
}

/** lo que está en los dos polígonos, en piezas (antihorarias), de la más grande a la más chica */
export function interseccion(a0: Punto[], b0: Punto[]): Punto[][] {
  const a = limpiar(a0), b = limpiar(b0);
  if (a.length < 3 || b.length < 3) return [];
  const ta = triangular(a), tb = triangular(b), cb = tb.map(caja);
  const piezas: Punto[][] = [];
  ta.forEach(t => {
    const c = caja(t);
    tb.forEach((u, j) => {
      const d = cb[j];
      if (d.x0 > c.x1 + EPS || d.x1 < c.x0 - EPS || d.y0 > c.y1 + EPS || d.y1 < c.y0 - EPS) return;
      const r = recortarConvexos(t, u);
      if (r.length >= 3 && Math.abs(area(r)) > 1e-9) piezas.push(r);
    });
  });
  return unirPiezas(piezas).sort((x, y) => area(y) - area(x));
}
