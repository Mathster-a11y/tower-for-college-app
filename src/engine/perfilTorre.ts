/**
 * Perfil de la torre (docs/propuesta_exoesqueleto.pdf, págs. 12 a 14): la forma de la torre vista en dos alzados,
 * uno por viento. Cada alzado tiene un borde izquierdo y uno derecho, dibujados con puntos (z, x):
 *  - alzado A (lo que ve el viento A, que sopla en +y): x es la coordenada x de la planta → da B(z) y el corrimiento dx(z);
 *  - alzado B (lo que ve el viento B, que sopla en +x): x es la coordenada y de la planta → da L(z) y dy(z).
 * Los bordes se dibujan como polilínea, Bézier (con manijas de tangente) o spline de Kochanek–Bartels (pasa por los
 * puntos; la tensión y el sesgo la ajustan). Al aplicarlo, la app corta las curvas en la cota de cada nivel y escribe B,
 * L, dx y dy: B y L son los que la planilla ya usa (retranqueos); dx y dy dicen cuánto se corre cada nivel respecto de
 * PB (torre inclinada), y los usa el protocolo de perfil variable (perfilVariable.ts). La planta de cada nivel (muros y
 * contornos) sigue en sus coordenadas: el nivel entero se corre.
 */
import type { Nivel, Proyecto } from './modelo';
import { presenteEn, rectangulos } from './modelo';

export type ModoCurva = 'polilinea' | 'bezier' | 'spline';
/** un punto del borde: altura sobre PB (m) y posición (m); en Bézier, su manija de tangente (si falta, automática) */
export interface PuntoPerfil { z: number; x: number; t?: { dz: number; dx: number } | null }
export interface VistaPerfil { izq: PuntoPerfil[]; der: PuntoPerfil[] }
export interface PerfilTorre {
  modo: ModoCurva;
  /** spline: tensión t (−1 a 1; 0 = Catmull-Rom) y sesgo b (−1 a 1: corre la curva hacia un lado) */
  tension: number; sesgo: number;
  A: VistaPerfil; B: VistaPerfil;
  /** la forma de partida (ficha), para mostrarla elegida */
  forma?: FormaPerfil | null;
}
export type FormaPerfil = 'prisma' | 'ahusada' | 'panza' | 'reloj' | 'escalonada' | 'inclinada';
export const FORMAS_PERFIL: Record<FormaPerfil, string> = {
  prisma: 'Prisma', ahusada: 'Ahusada', panza: 'Panza', reloj: 'Reloj de arena', escalonada: 'Escalonada', inclinada: 'Inclinada',
};

type P = { z: number; x: number };

// ---------------------------------------------------------------------------------------------------- curvas
/** la tangente automática de Bézier en el punto i (la de Catmull-Rom, un tercio del tramo) */
function tangenteAuto(ps: PuntoPerfil[], i: number): { dz: number; dx: number } {
  const a = ps[Math.max(0, i - 1)], b = ps[Math.min(ps.length - 1, i + 1)];
  return { dz: (b.z - a.z) / 6, dx: (b.x - a.x) / 6 };
}
/** Kochanek–Bartels: las tangentes de salida (Ts) y de llegada (Tl) en el punto i, con tensión t y sesgo b (continuidad 0) */
function tangentesKB(ps: PuntoPerfil[], i: number, t: number, b: number): { dz: number; dx: number } {
  const p0 = ps[Math.max(0, i - 1)], p1 = ps[i], p2 = ps[Math.min(ps.length - 1, i + 1)];
  const k1 = ((1 - t) * (1 + b)) / 2, k2 = ((1 - t) * (1 - b)) / 2;
  return { dz: k1 * (p1.z - p0.z) + k2 * (p2.z - p1.z), dx: k1 * (p1.x - p0.x) + k2 * (p2.x - p1.x) };
}
/** el borde como una polilínea fina (puntos de la curva, de abajo hacia arriba) */
export function muestrear(ps0: PuntoPerfil[], modo: ModoCurva, tension = 0, sesgo = 0, n = 24): P[] {
  const ps = ps0.slice().sort((a, b) => a.z - b.z);
  if (ps.length < 2 || modo === 'polilinea') return ps.map(q => ({ z: q.z, x: q.x }));
  const out: P[] = [{ z: ps[0].z, x: ps[0].x }];
  for (let i = 0; i < ps.length - 1; i++) {
    const a = ps[i], b = ps[i + 1];
    if (b.z - a.z < 1e-9) { out.push({ z: b.z, x: b.x }); continue; }                // escalón: tramo horizontal
    let c1: P, c2: P;
    if (modo === 'bezier') {
      const ta = a.t ?? tangenteAuto(ps, i), tb = b.t ?? tangenteAuto(ps, i + 1);
      c1 = { z: a.z + ta.dz, x: a.x + ta.dx }; c2 = { z: b.z - tb.dz, x: b.x - tb.dx };
    } else {
      const ta = tangentesKB(ps, i, tension, sesgo), tb = tangentesKB(ps, i + 1, tension, sesgo);
      c1 = { z: a.z + ta.dz / 3, x: a.x + ta.dx / 3 }; c2 = { z: b.z - tb.dz / 3, x: b.x - tb.dx / 3 };
    }
    for (let k = 1; k <= n; k++) {
      const u = k / n, v = 1 - u;
      out.push({ z: v * v * v * a.z + 3 * v * v * u * c1.z + 3 * v * u * u * c2.z + u * u * u * b.z, x: v * v * v * a.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * b.x });
    }
  }
  return out;
}
/** la posición del borde a la altura z (la primera que corta la horizontal desde abajo; con un escalón, la de arriba) */
export function xEnZ(densa: P[], z: number): number {
  if (!densa.length) return 0;
  if (z <= densa[0].z) return densa[0].x;
  let r = densa[densa.length - 1].x;
  for (let i = 0; i < densa.length - 1; i++) {
    const a = densa[i], b = densa[i + 1];
    if (z >= Math.min(a.z, b.z) && z < Math.max(a.z, b.z)) { const f = (z - a.z) / (b.z - a.z); return a.x + f * (b.x - a.x); }
    if (z >= Math.max(a.z, b.z)) r = b.x;
  }
  return r;
}

// ---------------------------------------------------------------------------------------------------- niveles
const zPBde = (p: Proyecto) => { const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1); return p.niveles[iPB]?.cota ?? 0; };
/** B, L, dx y dy efectivos de cada nivel (los vacíos heredan los de arriba, como en la planilla) */
export function medidasNiveles(p: Proyecto): { n: Nivel; z: number; B: number; L: number; dx: number; dy: number }[] {
  let B = 20, L = 16;
  const sinB = p.niveles.find(n => n.B)?.B, sinL = p.niveles.find(n => n.L)?.L;
  B = sinB ?? B; L = sinL ?? L;
  const zPB = zPBde(p);
  return p.niveles.map(n => { B = n.B ?? B; L = n.L ?? L; return { n, z: n.cota - zPB, B, L, dx: n.dx ?? 0, dy: n.dy ?? 0 }; });
}
/** el perfil que corresponde a los niveles como están (polilínea, un punto por cada cambio) */
export function perfilDesdeNiveles(p: Proyecto): PerfilTorre {
  const ms = medidasNiveles(p).filter(m => m.z >= -1e-9).sort((a, b) => a.z - b.z);
  const vista = (ancho: (m: typeof ms[number]) => number, corr: (m: typeof ms[number]) => number): VistaPerfil => {
    const izq: PuntoPerfil[] = [], der: PuntoPerfil[] = [];
    ms.forEach((m, k) => {
      const prev = ms[k - 1], a = ancho(m), c = corr(m);
      // un cambio de medida en un nivel: escalón (el punto de abajo con la medida vieja)
      if (prev && (Math.abs(ancho(prev) - a) > 1e-6 || Math.abs(corr(prev) - c) > 1e-6)) { izq.push({ z: m.z, x: corr(prev) - ancho(prev) / 2 }); der.push({ z: m.z, x: corr(prev) + ancho(prev) / 2 }); }
      if (k === 0 || k === ms.length - 1 || (prev && (Math.abs(ancho(prev) - a) > 1e-6 || Math.abs(corr(prev) - c) > 1e-6))) { izq.push({ z: m.z, x: c - a / 2 }); der.push({ z: m.z, x: c + a / 2 }); }
    });
    return { izq, der };
  };
  return { modo: 'polilinea', tension: 0, sesgo: 0, A: vista(m => m.B, m => m.dx), B: vista(m => m.L, m => m.dy) };
}

/** una forma tipo, con las medidas de la base (B, L) y la altura H */
export function formaPerfil(f: FormaPerfil, B: number, L: number, H: number): PerfilTorre {
  const vista = (a: number, xs: [number, number][], corrida = 0): VistaPerfil => ({
    izq: xs.map(([z, k]) => ({ z, x: -(a * k) / 2 + corrida * (z / H) })),
    der: xs.map(([z, k]) => ({ z, x: (a * k) / 2 + corrida * (z / H) })),
  });
  const dos = (xs: [number, number][], modo: ModoCurva): PerfilTorre => ({ modo, tension: 0, sesgo: 0, A: vista(B, xs), B: vista(L, xs), forma: f });
  switch (f) {
    case 'ahusada': return dos([[0, 1], [H, 0.6]], 'polilinea');
    case 'panza': return dos([[0, 1], [H / 2, 1.2], [H, 0.85]], 'spline');
    case 'reloj': return dos([[0, 1], [H / 2, 0.7], [H, 1]], 'spline');
    case 'escalonada': return dos([[0, 1], [H / 3, 1], [H / 3, 0.8], [(2 * H) / 3, 0.8], [(2 * H) / 3, 0.6], [H, 0.6]], 'polilinea');
    case 'inclinada':
      // se inclina hacia donde sopla el viento A (+y): el alzado B se corre; la cima, un cuarto del largo L
      return { modo: 'polilinea', tension: 0, sesgo: 0, A: vista(B, [[0, 1], [H, 1]]), B: vista(L, [[0, 1], [H, 1]], L / 4), forma: f };
    default: return dos([[0, 1], [H, 1]], 'polilinea');
  }
}

export interface Aplicado { niveles: Nivel[]; avisos: string[]; afuera: string[] }
/**
 * corta el perfil en la cota de cada nivel (sobre PB) y escribe B, L, dx y dy; con «plantas», además escala las
 * siluetas y carpinterías dibujadas para que sigan a B y L. Avisa qué muros quedan afuera de la planta de algún nivel.
 */
export function aplicarPerfil(p: Proyecto, pf: PerfilTorre, plantas = false): Aplicado {
  const zPB = zPBde(p), ms = medidasNiveles(p);
  const d = (v: PuntoPerfil[]) => muestrear(v, pf.modo, pf.tension, pf.sesgo);
  const A = { i: d(pf.A.izq), d: d(pf.A.der) }, Bv = { i: d(pf.B.izq), d: d(pf.B.der) };
  const mid0x = (xEnZ(A.i, 0) + xEnZ(A.d, 0)) / 2, mid0y = (xEnZ(Bv.i, 0) + xEnZ(Bv.d, 0)) / 2;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const avisos: string[] = [], afuera = new Map<string, string>();
  const niveles = p.niveles.map((n, k) => {
    if (n.cota < zPB - 1e-9) return { ...n };                                // subsuelos: como estaban
    const z = n.cota - zPB + 1e-6;                                             // la planta de arriba de la cota
    const xi = xEnZ(A.i, z), xd = xEnZ(A.d, z), yi = xEnZ(Bv.i, z), yd = xEnZ(Bv.d, z);
    const B = r3(xd - xi), L = r3(yd - yi), dx = r3((xi + xd) / 2 - mid0x), dy = r3((yi + yd) / 2 - mid0y);
    const out: Nivel = { ...n, B: B > 0.1 ? B : 0.1, L: L > 0.1 ? L : 0.1, dx: Math.abs(dx) > 1e-3 ? dx : null, dy: Math.abs(dy) > 1e-3 ? dy : null };
    // las plantas dibujadas siguen a B y L (se escalan alrededor del centro de su caja)
    if (plantas) {
      const viejo = ms[k];
      for (const campo of ['silueta', 'carpinteria'] as const) {
        const c = efectivo(p.niveles, k, campo);
        if (!c || c.length < 3) continue;
        const xs = c.map(q => q.x), ys = c.map(q => q.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const sx = viejo.B > 0 ? out.B! / (Math.max(...xs) - Math.min(...xs) || viejo.B) : 1, sy = viejo.L > 0 ? out.L! / (Math.max(...ys) - Math.min(...ys) || viejo.L) : 1;
        out[campo] = c.map(q => ({ ...q, x: r3(cx + (q.x - cx) * sx), y: r3(cy + (q.y - cy) * sy) }));
      }
    }
    // muros que quedan afuera de esta planta (en sus coordenadas: la caja B × L centrada en el centro de la base)
    const zTop = p.niveles[0]?.cota ?? 0, zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0;
    for (const m of p.muros) {
      if (afuera.has(m.id) || !presenteEn(m, n.cota, zFund, zTop)) continue;
      const fuera = rectangulos(m).some(r => r.x + r.ax / 2 > out.B! / 2 + 0.05 || r.x - r.ax / 2 < -out.B! / 2 - 0.05 || r.y + r.ay / 2 > out.L! / 2 + 0.05 || r.y - r.ay / 2 < -out.L! / 2 - 0.05);
      if (fuera) afuera.set(m.id, n.nombre);
    }
    return out;
  });
  if (afuera.size) {
    const porNivel = new Map<string, string[]>();
    afuera.forEach((niv, id) => porNivel.set(niv, [...(porNivel.get(niv) ?? []), id]));
    porNivel.forEach((ids, niv) => avisos.push(`${ids.join(', ')} ${ids.length > 1 ? 'quedan' : 'queda'} afuera de la planta desde ${niv}: cortal${ids.length > 1 ? 'os' : 'o'} con «Hasta» en Diseño → Niveles (o movel${ids.length > 1 ? 'os' : 'o'}).`));
  }
  return { niveles, avisos, afuera: [...afuera.keys()] };
}
/** el contorno de un nivel con la herencia (vacío = el del nivel de arriba) */
function efectivo(ns: Nivel[], k: number, campo: 'silueta' | 'carpinteria') {
  for (let i = k; i >= 0; i--) { const c = ns[i][campo]; if (c && c.length >= 3) return c; }
  return null;
}
/** ¿el perfil tiene algo más que un prisma? (para mostrar el protocolo) */
export function esPerfilVariable(p: Proyecto): boolean {
  const ms = medidasNiveles(p).filter(m => m.z >= 0);
  return ms.some(m => Math.abs(m.dx) > 1e-3 || Math.abs(m.dy) > 1e-3 || Math.abs(m.B - ms[0].B) > 1e-3 || Math.abs(m.L - ms[0].L) > 1e-3);
}
