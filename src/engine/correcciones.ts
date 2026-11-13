/**
 * Lo que daría la planilla con las correcciones acordadas, sin cambiar la planilla:
 * la app muestra siempre los dos valores lado a lado.
 */
import { calcularPlanilla, DIVISORES, type JMinimo, type PlanillaDatos, type PlanillaRes, type RotoRes } from './planilla';
import { entraEnCalculo, rectangulos, tipoDe, dInterior, type Proyecto } from './modelo';
import { propiedades } from './perfil';
import type { PiezaEquivalente } from './mapping';

export interface ResultadoCorregido {
  /** viento con Kz mínimo 5 m (CIRSOC), J completo en todas las filas y viento en PB con el criterio C: fuera del corte de los tabiques, dentro del vuelco y del suelo */
  guia: PlanillaRes;
  /** fuerza y momento de cada pieza con unidades correctas (M rot = Q rot · Mi/Qi) */
  rotA: PiezaRot[];
  rotB: PiezaRot[];
  /** rototraslación como la guía, con los perpendiculares muro por muro (si se pasó el proyecto) */
  rotoA?: RotoGuia;
  rotoB?: RotoGuia;
}

/** Elemento de la rototraslación: pieza paralela al viento o muro perpendicular. Posiciones en coordenadas de planta. */
export interface ElementoRotoGuia { nombre: string; fila: number | null; pos: number; J: number; a: number; frac: number; tras: number; rot: number; muros: string[]; /** perpendiculares: posición del centro del muro en la otra coordenada */ posT?: number }
export interface RotoGuia {
  dir: 'A' | 'B';
  /** corte en el nivel −1º (t), momento (tm), altura de la resultante (m) */
  Q: number; Mv: number; hW: number;
  /** eje de inercia de esta dirección (Xr, coordenada transversal) y de la otra (Sr, en el sentido del viento) */
  Xr: number; Sr: number;
  /** e = Xr (el viento actúa en el eje de simetría) y Mt = Q · e */
  e: number; Mt: number;
  SJ: number; SJa2: number;
  paralelos: ElementoRotoGuia[];
  perpendiculares: ElementoRotoGuia[];
}
export interface PiezaRot { Qtras: number; Qrot: number; Qtot: number; Mtras: number; Mrot: number; Mtot: number; Mplanilla: number; }

export function datosSegunGuia(d: PlanillaDatos, filaPB: number): PlanillaDatos {
  const D = [...d.mnyq.D];
  for (let k = filaPB; k < D.length; k++) D[k] = 0;
  // J completo: las fórmulas que le faltan a la planilla virgen (filas 8–9 de «paralelos») y el área de las filas 18–20
  const jpar = d.jpar.map(f => ({ ...f, sinYAC: false, O0: false }));
  return { ...d, mnyq: { ...d.mnyq, D }, jpar };
}

export function repartoCorregido(r: RotoRes): PiezaRot[] {
  const hW = r.D5 === 0 ? 0 : r.F5 / r.D5;
  return Array.from({ length: 20 }, (_, i) => {
    const Qtras = r.E[i], Qrot = isFinite(r.N[i]) ? r.N[i] : 0, Mtras = r.G[i];
    return { Qtras, Qrot, Qtot: Qtras + Qrot, Mtras, Mrot: Qrot * hW, Mtot: Mtras + Qrot * hW, Mplanilla: r.O[i] };
  });
}

/**
 * Rototraslación como la guía (Anexo) y la clase 5:  Wj = W · Jj / ΣJ  ±  W · e · Jj · aj / Σ Jjt · aj²
 *  - paralelos: las piezas de la dirección, con su J (hoja J) y su posición (rototraslación, columna H);
 *  - perpendiculares: cada muro perpendicular al viento con su J propio (espesor · largo³ / 12), a la distancia
 *    del eje de inercia de la otra dirección; también las alas de las piezas (la guía suma las alas de T6);
 *  - la rotación tiene el signo de la planilla: + donde se suma a la traslación.
 */
export function rototraslacionGuia(p: Proyecto, piezas: PiezaEquivalente[], g: PlanillaRes, H: (number | null)[], dir: 'A' | 'B'): RotoGuia {
  const A = dir === 'A';
  const rot = A ? g.rotA : g.rotB, otra = A ? g.rotB : g.rotA;
  const Q = rot.D5, Mv = rot.F5, hW = Q === 0 ? 0 : Mv / Q;
  const par = piezas.filter(pz => pz.dir === dir && pz.filaHoja !== null).map(pz => ({ nombre: pz.nombre, fila: pz.filaHoja!, pos: H[pz.filaHoja!] ?? 0, J: rot.B[pz.filaHoja!], muros: pz.muros }));
  const SJ = par.reduce((x, e) => x + e.J, 0);
  const Xr = SJ > 0 ? par.reduce((x, e) => x + e.J * e.pos, 0) / SJ : 0;
  const Sr = isFinite(otra.J7) ? otra.J7 : 0;
  const zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0, zTop = p.niveles[0]?.cota ?? 0;
  const perp: { nombre: string; pos: number; posT: number; J: number; muros: string[] }[] = [];
  p.muros.filter(m => entraEnCalculo(m, zFund, zTop)).forEach(m => {
    if (tipoDe(m) === 'tubo-circ') { perp.push({ nombre: m.id, pos: A ? m.y : m.x, posT: A ? m.x : m.y, J: (Math.PI * (m.largo ** 4 - dInterior(m) ** 4)) / 64, muros: [m.id] }); return; }
    if (tipoDe(m) === 'perfil') {
      // perfil: entra como perpendicular si es más rígido en la otra dirección (como un tabique más largo en la transversal)
      const k = propiedades(m.perfil!), Jesta = A ? k.JA : k.JB, Jotra = A ? k.JB : k.JA;
      if (Jotra > Jesta) perp.push({ nombre: m.id, pos: A ? m.y : m.x, posT: A ? m.x : m.y, J: Jotra, muros: [m.id] });
      return;
    }
    rectangulos(m).forEach((r, k, todos) => {
      const largoT = A ? r.ax : r.ay, largoS = A ? r.ay : r.ax;              // transversal y en el sentido del viento
      if (largoT <= largoS) return;                                            // no es perpendicular al viento
      perp.push({ nombre: todos.length > 1 ? `${m.id}·${k + 1}` : m.id, pos: A ? r.y : r.x, posT: A ? r.x : r.y, J: (largoS * largoT ** 3) / 12, muros: [m.id] });
    });
  });
  const SJa2 = par.reduce((x, e) => x + e.J * (e.pos - Xr) ** 2, 0) + perp.reduce((x, e) => x + e.J * (e.pos - Sr) ** 2, 0);
  const e = Xr, Mt = Q * e;
  const rotDe = (J: number, a: number) => (SJa2 > 0 ? (-Q * e * J * a) / SJa2 : 0);
  return {
    dir, Q, Mv, hW, Xr, Sr, e, Mt, SJ, SJa2,
    paralelos: par.map(x => { const a = x.pos - Xr; return { ...x, a, frac: SJ > 0 ? x.J / SJ : 0, tras: SJ > 0 ? (Q * x.J) / SJ : 0, rot: rotDe(x.J, a) }; }),
    perpendiculares: perp.map(x => { const a = x.pos - Sr; return { ...x, fila: null, a, frac: 0, tras: 0, rot: rotDe(x.J, a) }; }),
  };
}

/** Fuerzas y momentos de cada fila con la rototraslación de la guía (M rot = Q rot · hW). */
export function repartoGuiaPorFila(r: RotoRes, rg: RotoGuia): PiezaRot[] {
  return Array.from({ length: 20 }, (_, i) => {
    const el = rg.paralelos.find(x => x.fila === i);
    const Qtras = r.E[i], Mtras = r.G[i];
    const Qrot = el ? el.rot : 0;
    return { Qtras, Qrot, Qtot: Qtras + Qrot, Mtras, Mrot: Qrot * rg.hW, Mtot: Mtras + Qrot * rg.hW, Mplanilla: r.O[i] };
  });
}

/**
 * J mínimo con la altura total de la torre. La hoja de paralelos toma h = MAX(M,NyQ!B4:B43): con 10 niveles o menos
 * esas filas están vacías, h = 0 y el J mínimo da 0 (el control verifica siempre). Ortogonales usa G69 (bien).
 */
export function jMinimoConAlturaTotal(j: JMinimo, h: number): JMinimo {
  return { W: j.W, h, tabla: DIVISORES.map(([hormigon, a, b, c]) => ({ hormigon, h400: (j.W * h * h) / a, h500: (j.W * h * h) / b, h600: (j.W * h * h) / c })) };
}

/** fuerza del viento sobre la parte expuesta de PB (criterio C, mixto) y su altura sobre la fundación */
export function fuerzaPB(d: PlanillaDatos, filaPB: number): { W: number; brazo: number; altura: number; p: number } {
  const v = d.viento, Z = d.viento.Z;
  if (filaPB < 1 || filaPB > 50) return { W: 0, brazo: 0, altura: 0, p: 0 };
  const zPB = Z[filaPB] ?? 0, zArriba = Z[filaPB - 1] ?? zPB;
  const altura = Math.max(0, (zArriba - zPB) / 2);                          // de PB a la mitad del entrepiso
  const Kz = (z: number) => 2.01 * Math.pow(Math.max(z, 5) / v.zg, 2 / v.alfa);
  const qz = (z: number) => 0.613 * v.Kzt * v.Kd * v.V ** 2 * v.I * Kz(z);
  const zs = Z.slice(0, 51).filter(z => z > 0);
  const qh = zs.length ? qz(Math.max(...zs)) : 0;
  const p = (qz(zPB) * v.G * v.Cpb - qh * v.G * v.Cps) / 10000;             // t/m², con Kz de z = 5 m
  let B = 0; for (let k = 0; k <= filaPB; k++) if (d.mnyq.E[k] != null) B = d.mnyq.E[k]!;
  const zFund = Math.min(...Z.slice(filaPB, 54));
  return { W: altura * B * p, brazo: zPB - zFund, altura, p };
}
/**
 * Criterio C (mixto) para el viento en PB: la franja expuesta de PB (de 0 a medio entrepiso) recibe viento con Kz de
 * z = 5 m, pero lo lleva la losa de PB al terreno y a los muros del subsuelo: no entra en el corte de los tabiques
 * (rototraslación y flexocompresión siguen como la guía). Sí entra en la carga total, el vuelco y las tensiones en el
 * suelo, con su brazo hasta la fundación. Se ajustan solo los totales de M,NyQ (filas 61 a 99).
 */
export function vientoEnPB(m: PlanillaRes['mnyq'], d: PlanillaDatos, filaPB: number) {
  const f = fuerzaPB(d, filaPB);
  if (!(f.W > 0)) return;
  m.H61 += f.W; m.G65 = m.H61;
  m.J61 += f.W * f.brazo; m.H99 = m.J61;
  m.G66 = m.G65 ? m.J61 / m.G65 : NaN;
  m.L99 = m.H99 ? m.K99 / m.H99 : NaN;
  m.M99 = m.G67 ? (m.G65 * m.G66) / m.G67 : NaN;
  const a1 = d.mnyq.a1 ?? 0, b1 = d.mnyq.b1 ?? 0;
  m.N87 = a1 && b1 ? (-6 * m.J61) / a1 / b1 ** 2 / 10 : NaN;
  m.N89 = m.N86 + m.N87; m.N90 = m.N85 - m.N87;
}

export function calcularCorregido(d: PlanillaDatos, filaPB: number, extra?: { proyecto: Proyecto; piezas: PiezaEquivalente[] }): ResultadoCorregido {
  const guia = calcularPlanilla(datosSegunGuia(d, filaPB), { kzMin5: true });
  guia.jminA = jMinimoConAlturaTotal(guia.jminA, guia.mnyq.G69);
  vientoEnPB(guia.mnyq, d, filaPB);
  if (!extra) return { guia, rotA: repartoCorregido(guia.rotA), rotB: repartoCorregido(guia.rotB) };
  const rotoA = rototraslacionGuia(extra.proyecto, extra.piezas, guia, d.rotA.H, 'A');
  const rotoB = rototraslacionGuia(extra.proyecto, extra.piezas, guia, d.rotB.H, 'B');
  return { guia, rotA: repartoGuiaPorFila(guia.rotA, rotoA), rotB: repartoGuiaPorFila(guia.rotB, rotoB), rotoA, rotoB };
}
