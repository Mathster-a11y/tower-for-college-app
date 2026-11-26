/**
 * Silueta de cada piso: contorno cerrado con tramos rectos y arcos de círculo (bulge de AutoCAD).
 * La planilla solo lee B y L; la silueta sirve para dibujar la planta y las losas, y para informar el área y la caja.
 */
import type { Nivel, Proyecto } from './modelo';

export type Vertice = { x: number; y: number; b?: number; c1?: { x: number; y: number }; c2?: { x: number; y: number } };
export type Punto = { x: number; y: number };

/** puntos del contorno, con cada arco partido en tramos de a lo sumo «grados» */
export function puntosSilueta(v: Vertice[], grados = 10): Punto[] {
  const out: Punto[] = [];
  v.forEach((a, i) => {
    const b = v[(i + 1) % v.length];
    out.push({ x: a.x, y: a.y });
    // Bézier cúbica: tramos de igual parámetro, tantos como pida su giro (al menos 8)
    if (a.c1 && a.c2) {
      const c1 = a.c1, c2 = a.c2;
      const giro = Math.abs(Math.atan2(c1.y - a.y, c1.x - a.x) - Math.atan2(b.y - c2.y, b.x - c2.x));
      const n = Math.max(8, Math.ceil(Math.min(giro, 2 * Math.PI - giro) / ((grados * Math.PI) / 180)) * 2);
      for (let k = 1; k < n; k++) {
        const t = k / n, u = 1 - t;
        out.push({ x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y });
      }
      return;
    }
    const bu = a.b ?? 0;
    if (Math.abs(bu) < 1e-9) return;
    // arco: ángulo incluido θ = 4·atan(b); centro sobre la mediatriz de la cuerda
    const th = 4 * Math.atan(bu);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, c = Math.hypot(dx, dy);
    if (c < 1e-12) return;
    const dist = c / 2 / Math.tan(th / 2);                     // del medio de la cuerda al centro (con signo)
    const ox = cx - (dy / c) * dist, oy = cy + (dx / c) * dist;
    const r = Math.hypot(a.x - ox, a.y - oy), a0 = Math.atan2(a.y - oy, a.x - ox);
    const n = Math.max(2, Math.ceil(Math.abs(th) / ((grados * Math.PI) / 180)));
    for (let k = 1; k < n; k++) { const t = a0 + (th * k) / n; out.push({ x: ox + r * Math.cos(t), y: oy + r * Math.sin(t) }); }
  });
  return out;
}
/** área (m²) y caja (ancho en x, alto en y, centro) del contorno */
export function areaSilueta(v: Vertice[]): number {
  const p = puntosSilueta(v, 1);
  return Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0)) / 2;
}
export function cajaSilueta(v: Vertice[]): { B: number; L: number; cx: number; cy: number } {
  const p = puntosSilueta(v, 2);
  const xs = p.map(q => q.x), ys = p.map(q => q.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { B: x1 - x0, L: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
/** rectángulo B × L centrado */
export const rectangulo = (B: number, L: number): Vertice[] => [{ x: -B / 2, y: -L / 2 }, { x: B / 2, y: -L / 2 }, { x: B / 2, y: L / 2 }, { x: -B / 2, y: L / 2 }];

/** B, L y silueta que rigen en el nivel i (lo vacío se hereda del nivel de arriba) */
export function plantaDeNivel(p: Proyecto, i: number): { B: number; L: number; silueta: Vertice[]; propia: boolean } {
  const arriba = p.niveles.slice(0, i + 1);
  const B = arriba.reduce<number | null>((v, n) => n.B ?? v, null) ?? 20;
  const L = arriba.reduce<number | null>((v, n) => n.L ?? v, null) ?? 16;
  const sil = arriba.reduce<Nivel['silueta']>((v, n) => (n.silueta && n.silueta.length >= 3 ? n.silueta : v), null);
  return { B, L, silueta: sil ?? rectangulo(B, L), propia: !!(p.niveles[i]?.silueta && p.niveles[i].silueta!.length >= 3) };
}

/**
 * Lee las polilíneas cerradas (LWPOLYLINE) de un DXF de AutoCAD, con sus arcos (código 42). Devuelve cada contorno
 * en las unidades del dibujo.
 */
export function leerDXF(texto: string): Vertice[][] {
  const l = texto.split(/\r?\n/).map(x => x.trim());
  const out: Vertice[][] = [];
  for (let i = 0; i + 1 < l.length; i += 2) {
    if (l[i] !== '0' || l[i + 1] !== 'LWPOLYLINE') continue;
    const v: Vertice[] = [];
    let cerrada = false, j = i + 2;
    for (; j + 1 < l.length && l[j] !== '0'; j += 2) {
      const cod = l[j], val = Number(l[j + 1]);
      if (cod === '70') cerrada = (val & 1) === 1;
      else if (cod === '10') v.push({ x: val, y: 0 });
      else if (cod === '20' && v.length) v[v.length - 1].y = val;
      else if (cod === '42' && v.length) v[v.length - 1].b = val;
    }
    // una polilínea abierta cuyo último punto coincide con el primero también vale
    if (!cerrada && v.length > 2 && Math.hypot(v[0].x - v[v.length - 1].x, v[0].y - v[v.length - 1].y) < 1e-6) { v.pop(); cerrada = true; }
    if (cerrada && v.length >= 3) out.push(v);
    i = j - 2;
  }
  return out;
}
/** pasa un contorno a metros (factor) y, si se pide, lo centra en el origen (el centro de la planta) */
export function ajustarContorno(v: Vertice[], factor: number, centrar: boolean): Vertice[] {
  const m = v.map(q => ({ x: q.x * factor, y: q.y * factor, ...(q.b ? { b: q.b } : {}), ...(q.c1 && q.c2 ? { c1: { x: q.c1.x * factor, y: q.c1.y * factor }, c2: { x: q.c2.x * factor, y: q.c2.y * factor } } : {}) }));
  if (!centrar) return m;
  const c = cajaSilueta(m);
  const mover = (u: { x: number; y: number }) => ({ x: +(u.x - c.cx).toFixed(4), y: +(u.y - c.cy).toFixed(4) });
  return m.map(q => ({ ...q, ...mover(q), ...(q.c1 && q.c2 ? { c1: mover(q.c1), c2: mover(q.c2) } : {}) }));
}

/** contorno de la carpintería que rige en el nivel i (heredado del nivel de arriba) y su caja (a máx, b máx) */
export function carpinteriaDeNivel(p: Proyecto, i: number): { v: Vertice[]; a: number; b: number; propia: boolean } | null {
  // en un tramo «sin carpintería» no hay fachada (no se hereda la de arriba)
  const z = p.niveles[i]?.cota, ts = p.carpinteriaTramos;
  if (z !== undefined && ts?.length) { const t = [...ts].filter(x => x.desde <= z + 1e-6).sort((a, b) => b.desde - a.desde)[0]; if (t?.modo === 'sin') return null; }
  const arriba = p.niveles.slice(0, i + 1);
  const tiene = (n: Nivel | undefined) => !!(n?.carpinteria && n.carpinteria.length >= 3);
  // la del nivel o la del de arriba más cercano; si arriba no hay ninguna, la del de abajo más cercano (dibujada solo en
  // PB, por ejemplo, vale para toda la torre)
  let v = arriba.reduce<Nivel['carpinteria']>((x, n) => (tiene(n) ? n.carpinteria! : x), null);
  if (!v) v = p.niveles.slice(i + 1).find(tiene)?.carpinteria ?? null;
  if (!v) return null;
  const c = cajaSilueta(v);
  return { v, a: c.B, b: c.L, propia: !!(p.niveles[i]?.carpinteria && p.niveles[i].carpinteria!.length >= 3) };
}

/**
 * el contorno que recibe el viento en el nivel i: la carpintería (la fachada, el cerramiento) si está dibujada en ese
 * nivel o en uno de arriba; si no, el contorno de la losa. Lo usan las presiones del 3D y los túneles de viento.
 */
export function contornoAlViento(p: Proyecto, i: number): { v: Vertice[]; de: 'carpintería' | 'losa' } {
  const c = carpinteriaDeNivel(p, i);
  return c ? { v: c.v, de: 'carpintería' } : { v: plantaDeNivel(p, i).silueta, de: 'losa' };
}
/**
 * los puntos del contorno al viento del nivel i en el terreno: en una torre inclinada (Diseño → Perfil) el nivel se
 * corre entero (dx, dy) y el viento (y los vecinos del contexto, que están en el terreno) lo ven corrido
 */
export function puntosAlViento(p: Proyecto, i: number, porArco = 12): { x: number; y: number }[] {
  const dx = p.niveles[i]?.dx ?? 0, dy = p.niveles[i]?.dy ?? 0;
  return puntosSilueta(contornoAlViento(p, i).v, porArco).map(q => ({ x: q.x + dx, y: q.y + dy }));
}

/**
 * B y L para el viento de una planta (lo que lee la planilla): «caja», el rectángulo que la encierra (en una planta
 * redonda, el diámetro: el ancho que enfrenta el viento); «area», un rectángulo con las mismas proporciones que la caja
 * y la misma área que la planta (en un círculo, un cuadrado de lado 0,886 D: conserva el área y el peso de la losa)
 */
export type CriterioAncho = 'caja' | 'area';
export function medidasAlViento(v: Vertice[], criterio: CriterioAncho): { B: number; L: number } {
  const c = cajaSilueta(v);
  if (criterio === 'caja' || !(c.B > 0 && c.L > 0)) return { B: c.B, L: c.L };
  const k = Math.sqrt(areaSilueta(v) / (c.B * c.L));
  return { B: c.B * k, L: c.L * k };
}

/**
 * De una curva cerrada muestreada (muchos puntos) a un contorno con arcos: cada tramo que cabe en un arco de círculo (o
 * en una recta) con menos de «tol» metros de error se vuelve un solo vértice con su comba (b = tan(θ/4)). Las esquinas
 * (donde la curva quiebra más de 25°) quedan como vértices. Lo usa el loft: las losas del medio salen con curvas de
 * verdad, no con un polígono de cien lados.
 */
export function ajustarArcos(p: Punto[], tol = 0.005): Vertice[] {
  const n = p.length;
  if (n < 4) return p.map(q => ({ x: q.x, y: q.y }));
  const ang = (i: number) => {
    const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
    const u = Math.atan2(b.y - a.y, b.x - a.x), v = Math.atan2(c.y - b.y, c.x - b.x);
    let d = Math.abs(v - u); if (d > Math.PI) d = 2 * Math.PI - d;
    return d;
  };
  const esq = p.map((_, i) => i).filter(i => ang(i) > (25 * Math.PI) / 180);
  const ini = esq.length ? esq[0] : 0;
  const q = [...p.slice(ini), ...p.slice(0, ini), p[ini]];            // cerrada: el último es el primero
  const esqueina = new Set(esq.map(i => (i - ini + n) % n));
  // ¿los puntos i..j entran en una recta o en un arco (de menos de 170°)? devuelve la comba, o null
  const ajuste = (i: number, j: number): number | null => {
    const a = q[i], b = q[j], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    if (L < 1e-9) return null;
    let recta = true;
    for (let k = i + 1; k < j && recta; k++) if (Math.abs((q[k].x - a.x) * dy - (q[k].y - a.y) * dx) / L > tol) recta = false;
    if (recta) return 0;
    const m = q[(i + j) >> 1];
    // el círculo por a, m y b
    const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y));
    if (Math.abs(d) < 1e-12) return null;
    const a2 = a.x * a.x + a.y * a.y, m2 = m.x * m.x + m.y * m.y, b2 = b.x * b.x + b.y * b.y;
    const ox = (a2 * (m.y - b.y) + m2 * (b.y - a.y) + b2 * (a.y - m.y)) / d, oy = (a2 * (b.x - m.x) + m2 * (a.x - b.x) + b2 * (m.x - a.x)) / d;
    const r = Math.hypot(a.x - ox, a.y - oy);
    for (let k = i + 1; k < j; k++) if (Math.abs(Math.hypot(q[k].x - ox, q[k].y - oy) - r) > tol) return null;
    // el ángulo del arco: θ = 2·(π − el ángulo en m), con el signo del giro a → m → b
    const u1x = a.x - m.x, u1y = a.y - m.y, u2x = b.x - m.x, u2y = b.y - m.y;
    const phi = Math.acos(Math.max(-1, Math.min(1, (u1x * u2x + u1y * u2y) / (Math.hypot(u1x, u1y) * Math.hypot(u2x, u2y)))));
    const th = 2 * (Math.PI - phi);
    if (th > (170 * Math.PI) / 180) return null;
    const giro = (m.x - a.x) * (b.y - m.y) - (m.y - a.y) * (b.x - m.x);
    return Math.sign(giro) * Math.tan(th / 4);
  };
  const out: Vertice[] = [];
  let i = 0;
  while (i < n) {
    let j = i + 1, b = 0;
    for (let k = i + 2; k <= n; k++) {
      if (esqueina.has(k - 1)) break;                                 // un arco no pasa por encima de una esquina
      const r = ajuste(i, k);
      if (r === null) break;
      j = k; b = r;
    }
    out.push(Math.abs(b) > 1e-9 ? { x: q[i].x, y: q[i].y, b } : { x: q[i].x, y: q[i].y });
    i = j;
  }
  return out;
}

/**
 * El contorno como camino de SVG con arcos y Béziers de verdad (no tramos de 10°): se ve suave a cualquier zoom.
 * X e Y pasan de metros a la pantalla (misma escala en los dos ejes; la y de la pantalla, hacia abajo).
 */
export function caminoSilueta(v: Vertice[], X: (x: number) => number, Y: (y: number) => number): string {
  if (v.length < 2) return '';
  const k = Math.abs(X(1) - X(0)) || 1, f = (n: number) => n.toFixed(2);
  const yAbajo = Y(1) < Y(0);                                            // la pantalla da vuelta la y
  let d = `M${f(X(v[0].x))},${f(Y(v[0].y))}`;
  v.forEach((a, i) => {
    const b = v[(i + 1) % v.length];
    if (a.c1 && a.c2) { d += `C${f(X(a.c1.x))},${f(Y(a.c1.y))} ${f(X(a.c2.x))},${f(Y(a.c2.y))} ${f(X(b.x))},${f(Y(b.y))}`; return; }
    const bu = a.b ?? 0, c = Math.hypot(b.x - a.x, b.y - a.y);
    if (Math.abs(bu) < 1e-9 || c < 1e-12) { d += `L${f(X(b.x))},${f(Y(b.y))}`; return; }
    const th = 4 * Math.atan(bu), r = (c / (2 * Math.sin(Math.abs(th) / 2))) * k;
    // antihorario en el mundo (th > 0) con la y de la pantalla hacia abajo se ve horario: en SVG eso es sweep = 0
    // (el sweep 1 de SVG gira en el sentido de los ángulos de la pantalla, que con la y hacia abajo es el horario visto
    // en el mundo… pero visto en la pantalla es antihorario). Comprobado contra puntosSilueta en la prueba de la planta
    const sweep = (th > 0) === yAbajo ? 0 : 1, grande = Math.abs(th) > Math.PI ? 1 : 0;
    d += `A${f(r)},${f(r)} 0 ${grande} ${sweep} ${f(X(b.x))},${f(Y(b.y))}`;
  });
  return d + 'Z';
}
