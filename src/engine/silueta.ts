/**
 * Silueta de cada piso: contorno cerrado con tramos rectos y arcos de círculo (bulge de AutoCAD).
 * La planilla solo lee B y L; la silueta sirve para dibujar la planta y las losas, y para informar el área y la caja.
 */
import type { Nivel, Proyecto } from './modelo';

export type Vertice = { x: number; y: number; b?: number };
export type Punto = { x: number; y: number };

/** puntos del contorno, con cada arco partido en tramos de a lo sumo «grados» */
export function puntosSilueta(v: Vertice[], grados = 10): Punto[] {
  const out: Punto[] = [];
  v.forEach((a, i) => {
    const b = v[(i + 1) % v.length];
    out.push({ x: a.x, y: a.y });
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
  const m = v.map(q => ({ x: q.x * factor, y: q.y * factor, ...(q.b ? { b: q.b } : {}) }));
  if (!centrar) return m;
  const c = cajaSilueta(m);
  return m.map(q => ({ ...q, x: +(q.x - c.cx).toFixed(4), y: +(q.y - c.cy).toFixed(4) }));
}

/** contorno de la carpintería que rige en el nivel i (heredado del nivel de arriba) y su caja (a máx, b máx) */
export function carpinteriaDeNivel(p: Proyecto, i: number): { v: Vertice[]; a: number; b: number; propia: boolean } | null {
  const arriba = p.niveles.slice(0, i + 1);
  const v = arriba.reduce<Nivel['carpinteria']>((x, n) => (n.carpinteria && n.carpinteria.length >= 3 ? n.carpinteria : x), null);
  if (!v) return null;
  const c = cajaSilueta(v);
  return { v, a: c.B, b: c.L, propia: !!(p.niveles[i]?.carpinteria && p.niveles[i].carpinteria!.length >= 3) };
}
