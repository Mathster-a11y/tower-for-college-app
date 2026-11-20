/**
 * Simulador de viento, etapa V1 (docs/plan_viento.html): las presiones del viento del método elegido, listas para
 * pintarlas sobre las fachadas de la torre. No calcula nada nuevo: toma las presiones y las fuerzas que ya calcula
 * el método (102-25 en CIRSOC y FEM; 102-2005 de la planilla o de la guía) y las ordena por franja de altura y por
 * cara. No entra en los controles ni en los Excel.
 *
 * Convenciones de la planta: el viento A sopla hacia +y (su barlovento es la cara de y mínima) y el viento B hacia +x.
 * Presiones en N/m², con signo: + empuja contra la cara, − la succiona. Solo presiones exteriores (q·G·Cp): la
 * interior se anula entre las caras.
 */
import { KN_POR_T, type Direccion102, type Viento102 } from '../engine/cargas/cirsoc102';
import type { Proyecto } from '../engine/modelo';
import type { PlanillaRes } from '../engine/planilla';

/** Cp de las paredes laterales (Tabla 2.4-1): solo para mostrar; no entra en la fuerza de la estructura principal */
export const CP_LATERAL = -0.7;
export const CP_BARLOVENTO = 0.8;

export interface BandaViento {
  nivel: string;
  /** cota del nivel y la franja que carga (cotas absolutas, m) */
  cota: number; z0: number; z1: number;
  /** ancho expuesto y altura de influencia que usa el método (m) */
  ancho: number; hInf: number;
  /** presiones exteriores (N/m²): barlovento con qz, sotavento y laterales con qh; laterales null si el método no las da */
  barlovento: number; sotavento: number; lateral: number | null;
  /** fuerza del nivel según el método (t) */
  W: number;
}
export interface VientoDir { dir: 'A' | 'B'; B: number; bandas: BandaViento[] }
export interface MapaPresiones {
  /** de dónde salen los números */
  fuente: string;
  /** ¿tiene los cuatro casos de carga del 102-25? (la planilla y la guía, solo el caso 1) */
  casos: boolean;
  A: VientoDir | null; B: VientoDir | null;
}
export type Rol = 'barlovento' | 'sotavento' | 'lateral';
export type Caso = 1 | 2 | 3 | 4;

/** las cotas de los niveles sobre PB, de arriba hacia abajo, y la de PB */
function sobrePB(p: Proyecto) {
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const zPB = p.niveles[iPB]?.cota ?? 0;
  const sobre = p.niveles.slice(0, iPB + 1).filter(n => n.cota - zPB > 0);
  return { zPB, sobre };
}
/** franja de cada nivel: de la mitad del entrepiso de abajo a la mitad del de arriba (la azotea, hasta su cota) */
function franjas(p: Proyecto): { nombre: string; cota: number; z0: number; z1: number }[] {
  const { zPB, sobre } = sobrePB(p);
  return sobre.map((n, k) => {
    const arriba = k === 0 ? n.cota : (sobre[k - 1].cota + n.cota) / 2;
    const abajo = k + 1 < sobre.length ? (n.cota + sobre[k + 1].cota) / 2 : (n.cota + zPB) / 2;
    return { nombre: n.nombre, cota: n.cota, z0: abajo, z1: arriba };
  });
}

/** CIRSOC 102-25 (métodos CIRSOC y FEM): qz·G·0,8 en barlovento, qh·G·Cp en sotavento y laterales */
export function mapaCirsoc(p: Proyecto, w: Viento102): MapaPresiones {
  const fr = franjas(p);
  const dir = (d: Direccion102): VientoDir => {
    const G = d.Gusado;
    const bandas = d.niveles.map((x, i) => {
      // si manda la carga mínima (art. 2.1.5) las fuerzas se escalan: las presiones también, para que sumen lo mismo
      const sinEscala = (x.pNeta * x.ancho * x.hInf) / 1000 / KN_POR_T;
      const f = sinEscala > 0 ? x.W / sinEscala : 1;
      const z = fr[i] ?? { nombre: x.nivel, cota: x.z, z0: x.z - x.hInf / 2, z1: x.z + x.hInf / 2 };
      return { nivel: x.nivel, cota: z.cota, z0: z.z0, z1: z.z1, ancho: x.ancho, hInf: x.hInf,
        barlovento: f * x.qz * G * CP_BARLOVENTO, sotavento: f * d.qh * G * d.Cps, lateral: f * d.qh * G * CP_LATERAL, W: x.W };
    });
    return { dir: d.dir, B: d.B, bandas };
  };
  return { fuente: `CIRSOC 102-25 · ${w.A.rigido && w.B.rigido ? 'G = 0,85' : 'con el factor de ráfaga de cada viento'}`, casos: true, A: dir(w.A), B: dir(w.B) };
}

/**
 * Planilla y guía (102-2005): P (barlovento) y Q (sotavento) de la hoja del viento en cada nivel. La planilla calcula
 * un solo juego de presiones; el ancho de cada viento es el de su cara (B para el A, L para el B).
 */
export function mapaPlanilla(p: Proyecto, R: PlanillaRes, filaNivel: number[], fuente: string): MapaPresiones {
  const fr = franjas(p);
  const anchos = (() => { let B = 0, L = 0; return p.niveles.map(n => { B = n.B ?? B; L = n.L ?? L; return { B, L }; }); })();
  const dir = (d: 'A' | 'B'): VientoDir | null => {
    const bandas: BandaViento[] = [];
    fr.forEach(f => {
      const j = p.niveles.findIndex(n => n.cota === f.cota && n.nombre === f.nombre);
      const k = j >= 0 ? filaNivel[j] : undefined;
      if (k === undefined || k < 0) return;
      const P = R.viento.P[k], Q = R.viento.Q[k];
      if (!isFinite(P) || !isFinite(Q)) return;
      const ancho = d === 'A' ? anchos[j].B : anchos[j].L, hInf = f.z1 - f.z0;
      bandas.push({ nivel: f.nombre, cota: f.cota, z0: f.z0, z1: f.z1, ancho, hInf, barlovento: P, sotavento: Q, lateral: null, W: ((P - Q) * ancho * hInf) / 1000 / KN_POR_T });
    });
    return bandas.length ? { dir: d, B: bandas[bandas.length - 1].ancho, bandas } : null;
  };
  return { fuente, casos: false, A: dir('A'), B: dir('B') };
}

/**
 * Casos de carga (Fig. 2.4-8): qué fracción de cada viento actúa y con qué excentricidad (en múltiplos de su B).
 * 1: el viento elegido solo · 2: 75 % con e = 0,15 B · 3: 75 % de los dos · 4: 56,3 % de los dos con sus torsiones.
 */
export function factoresCaso(caso: Caso, dir: 'A' | 'B'): Record<'A' | 'B', { f: number; e: number }> {
  const otro = dir === 'A' ? 'B' : 'A';
  const r = { A: { f: 0, e: 0 }, B: { f: 0, e: 0 } };
  if (caso === 1) r[dir] = { f: 1, e: 0 };
  else if (caso === 2) r[dir] = { f: 0.75, e: 0.15 };
  else if (caso === 3) { r[dir] = { f: 0.75, e: 0 }; r[otro] = { f: 0.75, e: 0 }; }
  else { r[dir] = { f: 0.563, e: 0.15 }; r[otro] = { f: 0.563, e: 0.15 }; }
  return r;
}

/** el papel de una cara para un viento, según su normal exterior (nx, ny unitaria): ±45° alrededor de cada dirección */
export function rolDeCara(nx: number, ny: number, dir: 'A' | 'B'): Rol {
  const c = dir === 'A' ? ny : nx;                            // coseno entre la normal y el sentido del viento
  if (c < -Math.SQRT1_2 + 1e-9) return 'barlovento';
  if (c > Math.SQRT1_2 - 1e-9) return 'sotavento';
  return 'lateral';
}

/** la presión en una cara de la franja i, sumando los vientos que actúan en el caso (los laterales, solo con uno) */
export function presionCara(m: MapaPresiones, caso: Caso, dir: 'A' | 'B', nx: number, ny: number, cota: number): number {
  const fc = factoresCaso(m.casos ? caso : 1, dir);
  const activos = (['A', 'B'] as const).filter(d => fc[d].f > 0);
  let p = 0;
  for (const d of activos) {
    const vd = m[d];
    const b = vd?.bandas.find(x => cota >= x.z0 - 1e-9 && cota <= x.z1 + 1e-9);
    if (!b) continue;
    const rol = rolDeCara(nx, ny, d);
    const q = rol === 'barlovento' ? b.barlovento : rol === 'sotavento' ? b.sotavento : activos.length === 1 ? b.lateral ?? 0 : 0;
    p += fc[d].f * q;
  }
  return p;
}

/** el polígono en sentido antihorario y la normal exterior de cada lado */
export function ladosConNormal(pol: { x: number; y: number }[]): { a: { x: number; y: number }; b: { x: number; y: number }; nx: number; ny: number; largo: number }[] {
  let A2 = 0;
  for (let i = 0; i < pol.length; i++) { const a = pol[i], b = pol[(i + 1) % pol.length]; A2 += a.x * b.y - b.x * a.y; }
  const ccw = A2 > 0 ? pol : [...pol].reverse();
  return ccw.map((a, i) => {
    const b = ccw[(i + 1) % ccw.length], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
    return { a, b, nx: l > 0 ? dy / l : 0, ny: l > 0 ? -dx / l : 0, largo: l };
  }).filter(x => x.largo > 1e-9);
}

/** fuerza del viento sobre la silueta de una franja, integrando las presiones de las caras (t, en x y en y) */
export function fuerzaFranja(m: MapaPresiones, caso: Caso, dir: 'A' | 'B', pol: { x: number; y: number }[], banda: BandaViento): { Fx: number; Fy: number } {
  let Fx = 0, Fy = 0;
  const zc = (banda.z0 + banda.z1) / 2, h = banda.hInf;       // la altura de influencia del método (con el parapeto)
  for (const l of ladosConNormal(pol)) {
    const p = presionCara(m, caso, dir, l.nx, l.ny, zc);
    // la presión (+) empuja hacia adentro: F = −p·n·área
    Fx += (-p * l.nx * l.largo * h) / 1000 / KN_POR_T; Fy += (-p * l.ny * l.largo * h) / 1000 / KN_POR_T;
  }
  return { Fx, Fy };
}
