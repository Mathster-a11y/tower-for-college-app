/**
 * Rigidez a la torsión de los núcleos cerrados (Saint-Venant, pared delgada: fórmula de Bredt).
 *
 * La rototraslación de la guía frena el giro de la planta solo con la flexión de cada tabique (Σ J·a²): un núcleo
 * cerrado, en cambio, resiste el giro por sí mismo con el flujo de corte que da vuelta por sus paredes,
 *
 *     Jt = 4 · Am² / ∮ ds/t        (Am: área encerrada por la línea media; ∮ ds/t: cada pared, su largo / su espesor)
 *
 * también para un tubo circular (Am = π·rm², ∮ds/t = 2·π·rm/e: Jt = 2·π·rm³·e, el polar exacto menos π·rm·e³/2, que
 * es poco con paredes delgadas). Así la planilla renovada lo arma con una sola fórmula. Eso lo usan solo los métodos CIRSOC y FEM; la
 * Planilla y la Guía siguen como la cátedra (sin esta rigidez, del lado seguro para los tabiques alejados del centro).
 *
 * Qué cuenta como núcleo cerrado:
 *  - un tubo rectangular o circular hueco (un elemento de la app);
 *  - cuatro tabiques de una misma pieza (dos en x y dos en y) que se tocan en las cuatro esquinas: cada uno llega por
 *    lo menos hasta la cara interior de los otros dos. Si la pieza tiene más paredes (un tabique en el medio, alas que
 *    sobresalen), se toma la caja más grande que cierran.
 *  - no cuenta si alguno de los cuatro tiene aberturas (una puerta abre la celda: el flujo de corte no da la vuelta; los
 *    dinteles devuelven una parte que acá no se considera, del lado seguro) ni si es «solo de gravedad».
 *  La caja vale hasta la cota más baja a la que llegan sus cuatro paredes, con el espesor de PB.
 *
 * Para la rototraslación de la guía (ménsulas que se deforman igual), el núcleo entra como un término más de Σ J·a²:
 * con un torsor repartido parejo en la altura, la ménsula da δ = q·h⁴/(8·E·J) y el núcleo gira θ = m·h²/(2·G·Jt), así
 * que su equivalente es  Jeq = G·Jt·h² / (4·E)  (con un torsor triangular sería 0,275 en lugar de 0,25). El FEM no
 * necesita equivalente: pone el núcleo como un resorte a la torsión entre cada par de losas (G·Jt / Δz).
 */
import { entraEnCalculo, rectangulos, tipoDe, dInterior, type Muro, type Proyecto } from './modelo';
import { G_HORMIGON, E_HORMIGON } from './femEntrada';

export interface NucleoCerrado {
  /** nombre para mostrar: la pieza (o el elemento) */
  nombre: string;
  muros: string[];
  /** rigidez de Saint-Venant (m⁴), área encerrada por la línea media (m²) y ∮ ds/t */
  Jt: number; Am: number; dsT: number;
  /** cota más alta a la que llega la caja, sobre PB (m) */
  h: number;
  /** equivalente para Σ J·a² de la guía (m⁶): G·Jt·h²/(4·E) */
  Jeq: number;
  /**
   * cada pared: el muro, su largo entre ejes y su dirección (las paredes en «Y» trabajan con el viento A); «veces»: cuántas
   * paredes así da la vuelta (2 en un tubo rectangular, π/2 en uno circular), para ∮ ds/t = Σ veces·largo/espesor
   */
  paredes: { id: string; largo: number; espesor: number; dir: 'X' | 'Y'; veces: number }[];
  /** cómo se reconoció */
  tipo: 'caja' | 'tubo-rect' | 'tubo-circ';
}

const TOL = 0.05;
/** razón G/E del hormigón (ν = 0,2) */
export const G_SOBRE_E = G_HORMIGON / E_HORMIGON;
/** coeficiente del equivalente con el torsor repartido parejo en la altura */
export const COEF_JEQ = 0.25;

export const jeqDe = (Jt: number, h: number) => COEF_JEQ * G_SOBRE_E * Jt * h * h;

/** Jt de una caja de línea media bx × by con el espesor de cada lado (x abajo, x arriba, y izquierda, y derecha) */
export function jtCaja(bx: number, by: number, tx1: number, tx2: number, ty1: number, ty2: number): { Jt: number; Am: number; dsT: number } {
  const Am = bx * by, dsT = bx / tx1 + bx / tx2 + by / ty1 + by / ty2;
  return { Am, dsT, Jt: dsT > 0 ? (4 * Am * Am) / dsT : 0 };
}

/** los núcleos cerrados de un proyecto (los que entran al cálculo) */
export function nucleosCerrados(p: Proyecto): NucleoCerrado[] {
  const zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0, zTop = p.niveles[0]?.cota ?? 0;
  const zPB = p.niveles.reduce((z, n) => (n.cota >= 0 ? n.cota : z), 0);
  const alto = (ms: Muro[]) => Math.max(0, Math.min(...ms.map(m => m.zHasta ?? zTop), zTop) - zPB);
  const vale = (m: Muro) => entraEnCalculo(m, zFund, zTop) && !m.soloGravedad;
  const out: NucleoCerrado[] = [];
  const nuevo = (n: Omit<NucleoCerrado, 'Jeq'>) => { if (n.Jt > 0 && n.h > 0) out.push({ ...n, Jeq: jeqDe(n.Jt, n.h) }); };

  // elementos tubo huecos
  for (const m of p.muros.filter(vale)) {
    const t = tipoDe(m);
    if (t === 'tubo-rect') {
      const B = m.largo, H = m.ladoY ?? m.largo, e = m.espesor;
      if (!(e > 0) || e >= B / 2 || e >= H / 2) continue;                  // macizo: no es un núcleo
      const k = jtCaja(B - e, H - e, e, e, e, e);
      nuevo({ nombre: m.piezaA || m.piezaB || m.id, muros: [m.id], ...k, h: alto([m]), tipo: 'tubo-rect',
        paredes: [{ id: m.id, largo: B - e, espesor: e, dir: 'X', veces: 2 }, { id: m.id, largo: H - e, espesor: e, dir: 'Y', veces: 2 }] });
    } else if (t === 'tubo-circ') {
      const D = m.largo, d = dInterior(m);
      if (!(d > 0)) continue;
      const rm = (D + d) / 4, e = (D - d) / 2, Am = Math.PI * rm * rm, dsT = (2 * Math.PI * rm) / e;
      // para el flujo de corte: la mitad de la circunferencia media «trabaja» con cada viento
      nuevo({ nombre: m.piezaA || m.piezaB || m.id, muros: [m.id], Jt: (4 * Am * Am) / dsT, Am, dsT, h: alto([m]), tipo: 'tubo-circ',
        paredes: [{ id: m.id, largo: 2 * rm, espesor: e, dir: 'X', veces: Math.PI / 2 }, { id: m.id, largo: 2 * rm, espesor: e, dir: 'Y', veces: Math.PI / 2 }] });
    }
  }

  // cajas de cuatro tabiques de una misma pieza
  const vistos = new Set<string>();
  const piezas = new Map<string, Muro[]>();
  for (const m of p.muros.filter(vale)) {
    if (tipoDe(m) !== 'tabique' || m.aberturas?.length) continue;
    for (const nom of new Set([m.piezaA, m.piezaB].filter(Boolean))) { if (!piezas.has(nom)) piezas.set(nom, []); piezas.get(nom)!.push(m); }
  }
  for (const [nom, ms] of piezas) {
    const r = ms.map(m => ({ m, q: rectangulos(m)[0] })).filter(x => x.q);
    const xs = r.filter(x => x.q.ax > x.q.ay), ys = r.filter(x => x.q.ay > x.q.ax);
    let mejor: (Omit<NucleoCerrado, 'Jeq'>) | null = null;
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
      const [a, b] = xs[i].q.y < xs[j].q.y ? [xs[i], xs[j]] : [xs[j], xs[i]];
      const y1 = a.q.y, y2 = b.q.y, ta = a.q.ay, tb = b.q.ay;
      if (y2 - y1 < (ta + tb) / 2 + TOL) continue;
      for (let k = 0; k < ys.length; k++) for (let l = k + 1; l < ys.length; l++) {
        const [c, d] = ys[k].q.x < ys[l].q.x ? [ys[k], ys[l]] : [ys[l], ys[k]];
        const x1 = c.q.x, x2 = d.q.x, tc = c.q.ax, td = d.q.ax;
        if (x2 - x1 < (tc + td) / 2 + TOL) continue;
        // cada pared y llega de una pared x a la otra (por lo menos hasta su cara interior), y al revés
        const llegaY = (w: typeof c) => w.q.y - w.q.ay / 2 <= y1 + ta / 2 + TOL && w.q.y + w.q.ay / 2 >= y2 - tb / 2 - TOL;
        const llegaX = (w: typeof a) => w.q.x - w.q.ax / 2 <= x1 + tc / 2 + TOL && w.q.x + w.q.ax / 2 >= x2 - td / 2 - TOL;
        if (!llegaY(c) || !llegaY(d) || !llegaX(a) || !llegaX(b)) continue;
        const k2 = jtCaja(x2 - x1, y2 - y1, ta, tb, tc, td);
        if (mejor && mejor.Jt >= k2.Jt) continue;
        const cuatro = [a.m, b.m, c.m, d.m];
        mejor = { nombre: nom, muros: cuatro.map(m => m.id), ...k2, h: alto(cuatro), tipo: 'caja',
          paredes: [{ id: a.m.id, largo: x2 - x1, espesor: ta, dir: 'X', veces: 1 }, { id: b.m.id, largo: x2 - x1, espesor: tb, dir: 'X', veces: 1 },
            { id: c.m.id, largo: y2 - y1, espesor: tc, dir: 'Y', veces: 1 }, { id: d.m.id, largo: y2 - y1, espesor: td, dir: 'Y', veces: 1 }] };
      }
    }
    if (!mejor) continue;
    const clave = [...mejor.muros].sort().join('|');
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    nuevo(mejor);
  }
  return out;
}

/**
 * corte que el torsor T (tm) le agrega a cada pared del núcleo que trabaja con el viento «dir» (t): el flujo de corte
 * q = T / (2·Am) por el largo de la pared. Para un muro que no es del núcleo, 0.
 */
export function cortePorTorsion(n: NucleoCerrado, idMuro: string, dir: 'A' | 'B', T: number): number {
  if (!(n.Am > 0)) return 0;
  const q = Math.abs(T) / (2 * n.Am);
  const pared = n.paredes.find(w => w.id === idMuro && w.dir === (dir === 'A' ? 'Y' : 'X'));
  return pared ? q * pared.largo : 0;
}
