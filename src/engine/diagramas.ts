/**
 * Datos de los diagramas: viento y esfuerzos en altura, rototraslación en planta, rigidez y deformación.
 * Todo sale de los resultados de la planilla (o de los corregidos): no hay fórmulas nuevas salvo la deformada,
 * que integra M / (E·ΣJ) desde PB, con el E que usa la propia planilla para el J mínimo.
 */
import type { MNyQRes, PlanillaRes, RotoRes, VientoRes, JMinimo } from './planilla';
import type { Proyecto } from './modelo';
import type { PiezaEquivalente } from './mapping';

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

export interface Deformada { puntos: { nivel: string; z: number; d: number }[]; dTop: number; h: number; limite: number; E: number; J: number; dUniforme: number; }

/**
 * Deformada de la torre como ménsula empotrada en PB: θ = ∫ M / (E·J) dz, δ = ∫ θ dz (trapecios),
 * con el momento real de cada nivel. También la fórmula de la carga uniforme (δ = W·h³ / 8EJ), que es la que
 * usa la planilla para el J mínimo.
 */
export function deformada(alt: PuntoAltura[], W: number, E: number, J: number): Deformada {
  const sobre = alt.filter(x => x.z >= 0).sort((a, b) => a.z - b.z);
  const out: Deformada['puntos'] = [];
  let th = 0, d = 0;
  sobre.forEach((x, i) => {
    if (i > 0) {
      const a = sobre[i - 1], dz = x.z - a.z;
      const th1 = th + ((a.M + x.M) / 2) * dz / (E * J);
      d += ((th + th1) / 2) * dz;
      th = th1;
    }
    out.push({ nivel: x.nivel, z: x.z, d });
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
