/**
 * Datos de los diagramas: viento y esfuerzos en altura, rototraslación en planta, rigidez y deformación.
 * Todo sale de los resultados de la planilla (o de los corregidos): no hay fórmulas nuevas salvo la deformada,
 * que integra M / (E·ΣJ) desde PB, con el E que usa la propia planilla para el J mínimo.
 */
import type { MNyQRes, PlanillaRes, RotoRes, VientoRes, JMinimo } from './planilla';
import type { Proyecto } from './modelo';
import type { PiezaEquivalente } from './mapping';
import { presenteEn } from './modelo';
import { partesDePieza } from './flexocompresion';

export interface PuntoAltura {
  nivel: string;
  z: number;
  /** presión sobre la cara de barlovento y succión de sotavento (kN/m²) */
  pBarlo: number; pSota: number;
  /** fuerza del viento en el nivel (t) */
  F: number;
  /** corte y momento flector en el nivel (t, tm) */
  V: number; M: number;
}

export function datosAltura(p: Proyecto, v: VientoRes, m: MNyQRes, filaNivel: number[], dir: 'A' | 'B'): PuntoAltura[] {
  const A = dir === 'A';
  return p.niveles.map((n, j) => {
    const k = filaNivel[j];
    if (k === undefined) return null;
    const F = A ? m.H[k] : m.D[k] * m.F[k] * m.G[k];
    return { nivel: n.nombre, z: n.cota, pBarlo: (v.P[k] ?? 0) / 1000, pSota: (v.Q[k] ?? 0) / 1000, F: F || 0, V: A ? m.I[k] : m.N[k], M: A ? m.J[k] : m.O[k] };
  }).filter((x): x is PuntoAltura => x !== null);
}

/** E (t/m²) que usa la planilla: J mín = W·h² / divisor y el divisor de h/500 vale 8·E/500 (ménsula con carga uniforme). */
export const E_DE_DIVISOR = (divisorH500: number) => (divisorH500 * 500) / 8;

export interface Deformada { puntos: { nivel: string; z: number; d: number; /** curvatura M / (E·J) */ k: number }[]; dTop: number; h: number; limite: number; E: number; J: number; dUniforme: number; }

/**
 * Deformada de la torre como ménsula empotrada en PB: θ = ∫ M / (E·J) dz, δ = ∫ θ dz (trapecios),
 * con el momento real de cada nivel. También la fórmula de la carga uniforme (δ = W·h³ / 8EJ), que es la que
 * usa la planilla para el J mínimo.
 */
export function deformada(alt: PuntoAltura[], W: number, E: number, J: number, Jz?: (z: number) => number): Deformada {
  const Jen = (z: number) => (Jz ? Jz(z) : J) || J;
  const sobre = alt.filter(x => x.z >= 0).sort((a, b) => a.z - b.z);
  const out: Deformada['puntos'] = [];
  let th = 0, d = 0;
  sobre.forEach((x, i) => {
    if (i > 0) {
      const a = sobre[i - 1], dz = x.z - a.z;
      const th1 = th + ((a.M / Jen(a.z) + x.M / Jen(x.z)) / 2) * dz / E;
      d += ((th + th1) / 2) * dz;
      th = th1;
    }
    out.push({ nivel: x.nivel, z: x.z, d, k: x.M / Jen(x.z) / E });
  });
  const h = sobre.length ? sobre[sobre.length - 1].z - sobre[0].z : 0;
  return { puntos: out, dTop: d, h, limite: h / 500, E, J, dUniforme: (W * h ** 3) / (8 * E * J) };
}

export interface PiezaReparto {
  nombre: string;
  /** posición transversal (m) */
  pos: number;
  J: number;
  /** fracción de la traslación (J / ΣJ) */
  frac: number;
  Qtras: number; Qrot: number; Qtot: number;
}
export interface Reparto { Q: number; Mv: number; d: number; Mt: number; piezas: PiezaReparto[]; }

/** Rototraslación de una dirección: cada pieza con su posición, su parte de J y las fuerzas de traslación y rotación. */
export function reparto(r: RotoRes, H: (number | null)[], piezas: PiezaEquivalente[], dir: 'A' | 'B'): Reparto {
  const out: PiezaReparto[] = [];
  for (let i = 0; i < 20; i++) {
    const J = r.B[i];
    if (!(J > 1e-9)) continue;
    const pz = piezas.find(x => x.dir === dir && x.filaHoja === i);
    if (!pz && piezas.length) continue;   // filas vacías: solo el relleno de 0,01
    const Qrot = isFinite(r.N[i]) ? r.N[i] : 0;
    out.push({ nombre: pz?.nombre ?? `fila ${i + 1}`, pos: H[i] ?? 0, J, frac: r.C[i], Qtras: r.E[i], Qrot, Qtot: r.E[i] + Qrot });
  }
  return { Q: r.D5, Mv: r.F5, d: r.J7, Mt: r.D5 * r.J7, piezas: out };
}

export interface Rigidez { dir: 'A' | 'B'; J: number; minimos: { h400: number; h500: number; h600: number }; hormigon: string; W: number; h: number; }

/** ΣJ de cada dirección contra el J mínimo de la planilla, en la fila del hormigón más cercano por debajo. */
export function rigidez(res: PlanillaRes, hormigon: string): Rigidez[] {
  const nro = parseFloat(hormigon.replace(/[^\d.]/g, '')) || 30;
  const fila = (t: JMinimo) => [...t.tabla].reverse().find(f => (parseFloat(f.hormigon.replace(/[^\d.]/g, '')) || 0) <= nro) ?? t.tabla[0];
  return (['A', 'B'] as const).map(dir => {
    const t = dir === 'A' ? res.jminA : res.jminB;
    const f = fila(t);
    return { dir, J: dir === 'A' ? res.jpar.AY24 : res.jort.AY24, minimos: { h400: f.h400, h500: f.h500, h600: f.h600 }, hormigon: f.hormigon, W: t.W, h: t.h };
  });
}

/**
 * ΣJ de cada nivel sobre PB, como fracción del de PB, con los muros de cada pieza que están en ese nivel
 * (plantas distintas por piso). Devuelve J(z) = ΣJ de la planilla · fracción.
 */
export function rigidezPorNivel(p: Proyecto, piezas: PiezaEquivalente[], dir: 'A' | 'B', Jplanilla: number): { z: number; nivel: string; J: number }[] {
  const zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0, zTop = p.niveles[0]?.cota ?? 0;
  const porId = new Map(p.muros.map(m => [m.id, m]));
  const JdeNivel = (z: number) => piezas.filter(pz => pz.dir === dir && pz.filaHoja !== null).reduce((s, pz) => {
    const ms = pz.muros.map(id => porId.get(id)!).filter(m => m && presenteEn(m, z, zFund, zTop));
    return s + (ms.length ? partesDePieza(ms, dir).J : 0);
  }, 0);
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const J0 = JdeNivel(p.niveles[iPB]?.cota ?? 0) || 1;
  return p.niveles.filter(n => n.cota >= (p.niveles[iPB]?.cota ?? 0)).map(n => ({ z: n.cota, nivel: n.nombre, J: (Jplanilla * JdeNivel(n.cota)) / J0 }));
}

/**
 * Rototraslación como la guía (Anexo «Caso particular con rototraslación»):
 *   Wj = W · Jj / ΣJ  ±  W · e · Jj · aj / Σ Jjt · aj²
 * ΣJ: piezas paralelas al viento. ΣJjt·aj²: paralelas (a = distancia al eje de inercia) y perpendiculares
 * (cada muro con su J propio, a = distancia al eje de inercia de la otra dirección).
 * Devuelve la fuerza de cada elemento para W dado; el signo de la rotación es + del lado en que la rotación
 * se suma a la traslación.
 */
export interface ElementoRot { nombre: string; J: number; pos: number; perpendicular?: boolean }
export interface RepartoGuia {
  Xr: number; e: number; SJ: number; SJa2: number;
  elementos: (ElementoRot & { a: number; tras: number; rot: number; total: number })[];
}
export function repartoGuia(paralelos: ElementoRot[], perpendiculares: ElementoRot[], W: number, opciones: { e?: number; Yr?: number; ejeSimetria?: number } = {}): RepartoGuia {
  const SJ = paralelos.reduce((s, x) => s + x.J, 0);
  const Xr = SJ > 0 ? paralelos.reduce((s, x) => s + x.J * x.pos, 0) / SJ : 0;
  const e = opciones.e ?? Xr - (opciones.ejeSimetria ?? 0);
  const Yr = opciones.Yr ?? (() => { const s = perpendiculares.reduce((t, x) => t + x.J, 0); return s > 0 ? perpendiculares.reduce((t, x) => t + x.J * x.pos, 0) / s : 0; })();
  const xr = (opciones.ejeSimetria ?? 0) + e;
  const conA = [...paralelos.map(x => ({ ...x, perpendicular: false, a: x.pos - xr })), ...perpendiculares.map(x => ({ ...x, perpendicular: true, a: x.pos - Yr }))];
  const SJa2 = conA.reduce((s, x) => s + x.J * x.a * x.a, 0);
  const Mt = W * e;
  return {
    Xr: xr, e, SJ, SJa2,
    elementos: conA.map(x => {
      const tras = x.perpendicular ? 0 : (W * x.J) / SJ;
      // la rotación carga a los del lado opuesto a la excentricidad (los que se suman a la traslación)
      const rot = SJa2 > 0 ? (-Mt * x.J * x.a) / SJa2 : 0;
      return { ...x, tras, rot, total: tras + rot };
    }),
  };
}

/**
 * Rototraslación en altura (para el 3D): cada nivel se traslada δ(z) en el sentido del viento y gira θ(z)
 * alrededor del centro de rigidez CR. Con el modelo de la clase 5, cada tabique es una ménsula que toma
 *   Wj = W·Jj/ΣJ − W·e·Jj·aj/ΣJt·a²   (aj = tj − Xr, e = Xr: distancia del eje de simetría al eje de inercia),
 * así que se corre δ(z)·(1 − e·ΣJ·aj/ΣJt·a²) = δ(z) + θ(z)·aj, con θ(z) = −δ(z)·e·ΣJ / ΣJt·a²
 * (θ antihorario positivo; con e > 0 la planta gira en sentido horario).
 * Todo en el «marco del viento»: t transversal, s en el sentido del viento.
 */
export interface Rototraslacion3D {
  dir: 'A' | 'B';
  /** cada nivel: traslación δ, giro θ y el CR de ese nivel (cambia si hay muros que no llegan arriba) */
  niveles: { nivel: string; z: number; d: number; th: number; cr: { x: number; y: number } }[];
  /** CR en planta (coordenadas x, y del proyecto) */
  cr: { x: number; y: number };
  /** sentido del viento en planta (vector unitario) */
  viento: { x: number; y: number };
  e: number; dTop: number; thTop: number;
}
/** Torsión de un nivel: CR en planta y k = e·ΣJ/ΣJt·a² en el marco del viento (si no cambia en altura, θ = −δ·k). */
export interface TorsionNivel { z: number; cr: { x: number; y: number }; k: number }

export function rototraslacion3D(def: Deformada, dir: 'A' | 'B', Xr: number, Yr: number, SJ: number, SJa2: number, porNivel?: TorsionNivel[]): Rototraslacion3D {
  const k0 = SJa2 > 1e-12 ? (Xr * SJ) / SJa2 : 0;
  // marco del viento → planta: A: t = x, s = y · B: t = −y, s = x (las dos conservan el sentido de giro)
  const cr = dir === 'A' ? { x: Xr, y: Yr } : { x: Yr, y: -Xr };
  const deNivel = (z: number) => porNivel?.find(q => Math.abs(q.z - z) < 1e-6);
  const varia = !!porNivel?.length && porNivel.some(q => Math.abs(q.k - k0) > 1e-12 * Math.max(1, Math.abs(k0)) || Math.hypot(q.cr.x - cr.x, q.cr.y - cr.y) > 1e-9);
  // El giro se integra como la deformada, con la curvatura de torsión κθ = κδ·k(z). Con k constante da θ = −δ·k
  // (el reparto de la guía); si un muro deja de existir arriba, cada nivel gira con su propio k y su propio CR.
  let gp = 0, g = 0;
  const niveles = def.puntos.map((p, i, a) => {
    const kz = varia ? deNivel(p.z)?.k ?? k0 : k0;
    if (i > 0) {
      const q = a[i - 1], kq = varia ? deNivel(q.z)?.k ?? k0 : k0, dz = p.z - q.z;
      const gp1 = gp + ((q.k * kq + p.k * kz) / 2) * dz;
      g += ((gp + gp1) / 2) * dz; gp = gp1;
    }
    return { nivel: p.nivel, z: p.z, d: p.d, th: varia ? -g : -p.d * k0, cr: (varia ? deNivel(p.z)?.cr : undefined) ?? cr };
  });
  const top = niveles[niveles.length - 1];
  return { dir, niveles, cr, viento: dir === 'A' ? { x: 0, y: 1 } : { x: 1, y: 0 }, e: Xr, dTop: top?.d ?? 0, thTop: top?.th ?? 0 };
}

/**
 * CR y k de cada nivel con los muros que existen a esa cota (los que no llegan arriba dejan de contar).
 * La geometría da la variación en altura; en PB vale lo de la fuente elegida (planilla o Guía/CIRSOC).
 */
export function torsionPorNivel(p: Proyecto, piezas: PiezaEquivalente[], dir: 'A' | 'B', base: { cr: { x: number; y: number }; k: number }): TorsionNivel[] {
  const zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0, zTop = p.niveles[0]?.cota ?? 0;
  const porId = new Map(p.muros.map(m => [m.id, m]));
  const geo = (z: number) => {
    const conJ = (d: 'A' | 'B') => piezas.filter(pz => pz.dir === d && pz.filaHoja !== null).map(pz => {
      const ms = pz.muros.map(id => porId.get(id)!).filter(m => m && presenteEn(m, z, zFund, zTop));
      return { J: ms.length ? partesDePieza(ms, d).J : 0, pos: pz.posicion };
    }).filter(x => x.J > 0);
    const a = conJ('A'), b = conJ('B');
    const SA = a.reduce((s, x) => s + x.J, 0), SB = b.reduce((s, x) => s + x.J, 0);
    if (!(SA > 0) || !(SB > 0)) return null;
    const cx = a.reduce((s, x) => s + x.J * x.pos, 0) / SA, cy = b.reduce((s, x) => s + x.J * x.pos, 0) / SB;
    const Sa2 = a.reduce((s, x) => s + x.J * (x.pos - cx) ** 2, 0) + b.reduce((s, x) => s + x.J * (x.pos - cy) ** 2, 0);
    return { cx, cy, k: Sa2 > 1e-12 ? (dir === 'A' ? cx * SA : -cy * SB) / Sa2 : 0 };
  };
  const zPB = p.niveles[p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1)]?.cota ?? 0;
  const g0 = geo(zPB);
  if (!g0) return [];
  let ant = { cr: base.cr, k: base.k };
  return p.niveles.filter(n => n.cota >= zPB).reverse().map(n => {
    const g = geo(n.cota);
    if (g) ant = { cr: { x: base.cr.x + g.cx - g0.cx, y: base.cr.y + g.cy - g0.cy }, k: Math.abs(g0.k) > 1e-12 ? (base.k * g.k) / g0.k : base.k + g.k - g0.k };
    return { z: n.cota, ...ant };
  }).reverse();
}
/** δ, θ y CR en una cota cualquiera (interpolados; debajo de PB no se mueve). */
export function movimientoEn(r: Rototraslacion3D, z: number): { d: number; th: number; cr: { x: number; y: number } } {
  const n = r.niveles;
  if (!n.length || z <= n[0].z) return { d: 0, th: 0, cr: n[0]?.cr ?? r.cr };
  for (let i = 1; i < n.length; i++) if (z <= n[i].z) {
    const u = (z - n[i - 1].z) / (n[i].z - n[i - 1].z || 1), a = n[i - 1], b = n[i];
    return { d: a.d + u * (b.d - a.d), th: a.th + u * (b.th - a.th), cr: { x: a.cr.x + u * (b.cr.x - a.cr.x), y: a.cr.y + u * (b.cr.y - a.cr.y) } };
  }
  const u = n[n.length - 1];
  return { d: u.d, th: u.th, cr: u.cr };
}
/** Posición en planta del punto (x, y) a la cota z, con la traslación multiplicada por f y el giro por fGiro (exageraciones). */
export function desplazar(r: Rototraslacion3D, x: number, y: number, z: number, f = 1, fGiro = f): { x: number; y: number } {
  const { d, th, cr } = movimientoEn(r, z);
  const a = th * fGiro, c = Math.cos(a), s = Math.sin(a);
  const dx = x - cr.x, dy = y - cr.y;
  return { x: cr.x + c * dx - s * dy + f * d * r.viento.x, y: cr.y + s * dx + c * dy + f * d * r.viento.y };
}
