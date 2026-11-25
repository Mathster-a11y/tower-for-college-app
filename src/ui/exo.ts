/**
 * Etapa 08 · Exoesqueleto: ficha y perfiles en el panel; en el centro, el alzado de una cara con el flujo de fuerzas
 * (barras en tracción en rojo y en compresión en azul, el grosor según |N|), los diagramas de M de columnas y vigas,
 * el reparto del viento entre tabiques y exoesqueleto piso por piso y la deformada con y sin exoesqueleto.
 */
import { estado, fmt, registrarControles } from './estado';
import type { Control } from '../engine/verificaciones';
import { h, seccion, kpi, chip, colorEstado, type H, type EstadoChip } from './comp';
import { campo } from './paneles';
import { tablaValores, type Tam } from './diagramas';
import { armarCara, paraViento, anguloDiagonal, barridoModulo, torsionConExo, type FilaModulo, calcularExo, vientoDeCuarto, cirsoc301, COMBOS_101_25, COMBOS_CURSO, COMBOS_OBLICUOS_101_25, COMBOS_OBLICUOS_CURSO, FY_F24, CATALOGO_TUBOS, propsBarra, dimensionarExo, esfuerzosEn, cerosDeM, UNIONES_POR_DEFECTO, EXO_POR_DEFECTO, pesoExo, TIPOS_EXO, propsSeccion, idBarra, nivelesOutrigger, columnasEfectivas, LOSA_QD, LOSA_QL, losaPorPiso, type EntradaExo, type EsfuerzoBarra, type ExoDef, type ResultadoExo, type TipoExo } from '../engine/exo';
import { datosAltura, moduloHormigon, rigidez, rigidezPorNivel } from '../engine/diagramas';
import { plantaDeNivel } from '../engine/silueta';
import type { PlanillaRes } from '../engine/planilla';
import type { Viento102 } from '../engine/cargas/cirsoc102';
import { datos201De } from '../engine/metodos/cirsoc';
import { disenadorExo3D } from './exo3d';

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, a: Record<string, string | number> = {}, txt?: string) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v)));
  if (txt !== undefined) e.textContent = txt;
  return e;
};

// ------------------------------------------------------------------ qué se ve en el alzado y barra elegida
type ModoExo = 'N' | 'M' | 'Q' | 'sigma';
let modo: ModoExo = 'N';
let barraSel: string | null = null;
/** qué se ve en el centro: el alzado de una cara o el diseñador 3D */
let vistaExo: 'alzado' | '3d' = 'alzado';
/** agregar barras: la clase elegida y el primer nudo tocado */
let agregando: 'diagonal' | 'viga' | 'columna' | null = null;
let nudoA: [number, number] | null = null;
const MODOS: [ModoExo, string, string][] = [
  ['N', 'Flujo de fuerzas (N)', 'Tracción en rojo, compresión en azul; el grosor según |N|.'],
  ['M', 'Momentos (M)', 'Diagrama de momento flector de columnas y vigas, del lado traccionado.'],
  ['Q', 'Cortes (Q)', 'Diagrama de corte de columnas y vigas.'],
  ['sigma', 'Tensión en las fibras (σ)', 'Las dos caras de cada barra pintadas con su tensión σ = N/A ± M/W, comparada con la admisible.'],
];
type Plano = { X: (s: number) => number; Y: (z: number) => number; k: number };
/** normal de la barra (en pantalla) hacia el lado +y local (a la izquierda de a→b, con z hacia arriba) */
const normal = (e: EsfuerzoBarra, P: Plano) => {
  const ax = P.X(e.a.s), ay = P.Y(e.a.z), bx = P.X(e.b.s), by = P.Y(e.b.z), L = Math.hypot(bx - ax, by - ay) || 1;
  // y local = x local girado 90° antihorario en (s, z); en pantalla z va hacia abajo
  return { ax, ay, bx, by, L, nx: (by - ay) / L, ny: -(bx - ax) / L };
};
/** puntos del diagrama de una función f(t) a lo largo de la barra, corridos en perpendicular (−y: lado traccionado de M) */
function curvaBarra(e: EsfuerzoBarra, P: Plano, f: (t: number) => number, k: number, signo: 1 | -1, n = 24) {
  const { ax, ay, bx, by, nx, ny } = normal(e, P);
  const pts: string[] = [`${ax.toFixed(1)},${ay.toFixed(1)}`];
  for (let i = 0; i <= n; i++) { const t = i / n, v = f(t) * k * signo; pts.push(`${(ax + (bx - ax) * t + nx * v).toFixed(1)},${(ay + (by - ay) * t + ny * v).toFixed(1)}`); }
  pts.push(`${bx.toFixed(1)},${by.toFixed(1)}`);
  return pts.join(' ');
}
/** máximo de |f| a lo largo de la barra y dónde está */
function maxBarra(f: (t: number) => number, n = 40) {
  let t0 = 0, v0 = f(0);
  for (let i = 1; i <= n; i++) { const v = f(i / n); if (Math.abs(v) > Math.abs(v0)) { v0 = v; t0 = i / n; } }
  return { t: t0, v: v0 };
}
/** M(x) de cada barra (con la carga repartida es una curva): del lado traccionado, cruza el eje donde cambia de signo */
function capaMomentos(svg: SVGSVGElement, es: EsfuerzoBarra[], P: Plano) {
  const M = (e: EsfuerzoBarra) => (t: number) => esfuerzosEn(e, t).M;
  const Mmax = Math.max(...es.map(e => Math.abs(maxBarra(M(e)).v)), 1e-9), kM = 26 / Mmax;
  es.forEach(e => svg.append(el('polygon', { points: curvaBarra(e, P, M(e), kM, -1), class: 'ex-momento' })));
  if (Mmax < 0.05) { svg.append(el('text', { x: P.X(0), y: P.Y(Math.min(...es.map(e => Math.min(e.a.z, e.b.z)))) + 42, class: 'ex-nota', 'text-anchor': 'middle' }, 'M ≈ 0: en esta ficha las barras trabajan casi solo a esfuerzo normal')); return; }
  // rótulos: los cinco máximos de |M|
  es.map(e => ({ e, ...maxBarra(M(e)) })).filter(x => Math.abs(x.v) >= 0.05).sort((u, v) => Math.abs(v.v) - Math.abs(u.v)).slice(0, 5).forEach(({ e, t, v }) => {
    const { ax, ay, bx, by, nx, ny } = normal(e, P);
    const x0 = ax + (bx - ax) * t, y0 = ay + (by - ay) * t, x = x0 - nx * v * kM, y = y0 - ny * v * kM;
    svg.append(el('text', { x: x + (x >= x0 ? 4 : -4), y: y + 4, class: 'ex-valor momento', 'text-anchor': x >= x0 ? 'start' : 'end' }, `${fmt(Math.abs(v), 1)}`));
  });
}
/** V(x) de cada barra (lineal si hay carga repartida, constante si no) */
function capaCortes(svg: SVGSVGElement, es: EsfuerzoBarra[], P: Plano) {
  const V = (e: EsfuerzoBarra) => (t: number) => esfuerzosEn(e, t).V;
  const Qmax = Math.max(...es.map(e => Math.abs(maxBarra(V(e)).v)), 1e-9), kQ = 16 / Qmax;
  es.forEach(e => svg.append(el('polygon', { points: curvaBarra(e, P, V(e), kQ, 1, 8), class: `ex-corte ${esfuerzosEn(e, 0.5).V >= 0 ? 'pos' : 'neg'}` })));
  es.map(e => ({ e, ...maxBarra(V(e)) })).filter(x => Math.abs(x.v) >= 0.01).sort((u, v) => Math.abs(v.v) - Math.abs(u.v)).slice(0, 4).forEach(({ e, t, v }) => {
    const { ax, ay, bx, by, nx, ny } = normal(e, P);
    const x = ax + (bx - ax) * t + nx * v * kQ, y = ay + (by - ay) * t + ny * v * kQ;
    svg.append(el('text', { x: x + (nx * v >= 0 ? 4 : -4), y: y + 4, class: 'ex-valor corte', 'text-anchor': nx * v >= 0 ? 'start' : 'end' }, fmt(Math.abs(v), 2)));
  });
}
/** tensión en las fibras extremas: σ(±c) = N/A ∓ M/W (M > 0 comprime la cara +y) */
export function sigmaFibras(e: EsfuerzoBarra, p: { A: number; W: number }, t: number) {
  const f = esfuerzosEn(e, t);
  return { sup: f.N / p.A - f.M / p.W, inf: f.N / p.A + f.M / p.W };
}
/** color de una tensión en la escala ±escala (la máxima de la cara, o la admisible si es menor) */
const colorSigma = (sig: number, escala: number) => {
  const u = Math.min(1, Math.abs(sig) / escala), pc = Math.round(10 + 90 * u);
  return `color-mix(in srgb, ${sig >= 0 ? 'var(--ex-trac)' : 'var(--ex-comp)'} ${pc}%, var(--ex-neutro))`;
};
let idGrad = 0;
/**
 * Listón continuo de la barra (el ancho representa la sección): por tramos a lo largo, cada uno con un degradado de una
 * cara a la otra (σ lineal en la altura de la sección, con el blanco del eje neutro donde σ = 0). Los tramos se
 * solapan medio píxel para que no queden costuras.
 */
function capaFibras(g: SVGGElement, e: EsfuerzoBarra, p: { A: number; W: number }, adm: number, escala: number, P: Plano, defs: SVGDefsElement) {
  const { ax, ay, bx, by, nx, ny, L } = normal(e, P), w = 3.4, n = 12, ux = (bx - ax) / L, uy = (by - ay) / L;
  let pasa = false;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, s = sigmaFibras(e, p, (t0 + t1) / 2);
    pasa = pasa || Math.abs(s.sup) > adm || Math.abs(s.inf) > adm;
    const x0 = ax + (bx - ax) * t0 - ux * 0.5, y0 = ay + (by - ay) * t0 - uy * 0.5, x1 = ax + (bx - ax) * t1 + ux * 0.5, y1 = ay + (by - ay) * t1 + uy * 0.5;
    const id = `exg${++idGrad}`, gr = el('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: (x0 + nx * w).toFixed(2), y1: (y0 + ny * w).toFixed(2), x2: (x0 - nx * w).toFixed(2), y2: (y0 - ny * w).toFixed(2) });
    const paradas: [number, number][] = [[0, s.sup]];
    if (s.sup * s.inf < 0) paradas.push([s.sup / (s.sup - s.inf), 0]);
    paradas.push([1, s.inf]);
    paradas.forEach(([o, sg]) => gr.append(el('stop', { offset: o.toFixed(3), style: `stop-color: ${colorSigma(sg, escala)}` })));
    defs.append(gr);
    g.append(el('polygon', { points: `${(x0 + nx * w).toFixed(1)},${(y0 + ny * w).toFixed(1)} ${(x1 + nx * w).toFixed(1)},${(y1 + ny * w).toFixed(1)} ${(x1 - nx * w).toFixed(1)},${(y1 - ny * w).toFixed(1)} ${(x0 - nx * w).toFixed(1)},${(y0 - ny * w).toFixed(1)}`, fill: `url(#${id})`, class: 'ex-liston' }));
  }
  // contorno fino del listón (rojo si en algún punto pasa la admisible)
  g.append(el('polygon', { points: `${ax + nx * w},${ay + ny * w} ${bx + nx * w},${by + ny * w} ${bx - nx * w},${by - ny * w} ${ax - nx * w},${ay - ny * w}`, class: `ex-liston-borde${pasa ? ' pasada' : ''}` }));
}
/** articulaciones: un círculo hueco en el extremo liberado */
function pines(svg: SVGSVGElement, e: EsfuerzoBarra, P: Plano, yaEnNudo: (q: { s: number; z: number }) => boolean) {
  const { ax, ay, bx, by, L } = normal(e, P), ux = (bx - ax) / L, uy = (by - ay) / L, r = 3.2, o = 6;
  if (e.relA && !yaEnNudo(e.a)) svg.append(el('circle', { cx: ax + ux * o, cy: ay + uy * o, r, class: 'ex-pin' }));
  if (e.relB && !yaEnNudo(e.b)) svg.append(el('circle', { cx: bx - ux * o, cy: by - uy * o, r, class: 'ex-pin' }));
}
function leyendaModo(svg: SVGSVGElement, x: number, y: number, escala: number) {
  if (modo === 'sigma') {
    // barra de color de −escala (compresión) a +escala (tracción), con 0 en el medio
    const w = 300, n = 30;
    for (let i = 0; i < n; i++) { const sg = -escala + (2 * escala * (i + 0.5)) / n; svg.append(el('rect', { x: x + (i * w) / n, y: y - 9, width: w / n + 0.5, height: 9, style: `fill: ${colorSigma(sg, escala)}` })); }
    svg.append(el('text', { x, y: y + 12, class: 'ex-nota' }, `−${fmt(escala / 10, 0)} compresión`));
    svg.append(el('text', { x: x + w / 2, y: y + 12, class: 'ex-nota', 'text-anchor': 'middle' }, '0'));
    svg.append(el('text', { x: x + w, y: y + 12, class: 'ex-nota', 'text-anchor': 'end' }, `tracción +${fmt(escala / 10, 0)} kg/cm²`));
    return;
  }
  const items: [string, string][] = modo === 'N' ? [['traccion', 'tracción'], ['compresion', 'compresión']] : modo === 'M' ? [['momento', 'momento flector M (tm)']] : [['corte pos', 'Q > 0'], ['corte neg', 'Q < 0 (t)']];
  items.forEach(([c, t], i) => {
    const xx = x + i * 150;
    svg.append(c.startsWith('traccion') || c.startsWith('compresion') ? el('line', { x1: xx, y1: y - 3, x2: xx + 18, y2: y - 3, class: `ex-barra ${c}`, 'stroke-width': 4 }) : el('rect', { x: xx, y: y - 7, width: 16, height: 9, class: c === 'momento' ? 'ex-momento' : `ex-corte ${c.split(' ')[1]}` }));
    svg.append(el('text', { x: xx + 24, y: y + 1, class: 'ex-nota' }, t));
  });
}

export interface DatosExo { r: ResultadoExo; def: ExoDef; dir: 'A' | 'B'; ancho: number; tCaras: number[]; niveles: string[]; h: number; Eh: number;
  /** caras que siguen la planta: ancho y posición (|t|) de la cara en cada cota de zs */
  anchos?: number[]; ts?: number[];
  /** torre inclinada o corrida (Diseño → Perfil): corrimiento del centro de la torre en cada cota de zs, a lo largo de la cara (corr) y de costado (tc) */
  corr?: number[]; tc?: number[] }

/** el cálculo del exoesqueleto para el viento elegido (null si el proyecto no tiene exo o faltan datos) */
/** lo que necesita el motor para un viento: pisos, viento de cada piso, rigidez de los tabiques y dónde van las caras */
export function entradaExo(dir: 'A' | 'B', def: ExoDef): EntradaExo | null {
  const d = datosExo(dir, def);
  if (!d) return null;
  return d.entrada;
}

/**
 * Memoria de los resultados del exo: la etapa 08, el riel, el avance, los controles y el informe piden lo mismo varias
 * veces por cálculo, y con el CIRSOC 301 cada pedido resuelve todas las caras otra vez (en una torre con muchas barras,
 * decenas de segundos). Se guarda por cálculo (los valores de la planilla de ese cálculo), revisión del proyecto, viento
 * y la ficha tal como está (texto): cualquier cambio de la ficha, aunque sea en el mismo objeto, se calcula de nuevo.
 */
const memoExo = new WeakMap<object, Map<string, { v: unknown; error: string }>>();
function recordar<T>(clave: string, def: ExoDef, f: () => T): T {
  const base = estado.calculo?.valores as object | undefined;
  if (!base) return f();
  let m = memoExo.get(base);
  if (!m) { m = new Map(); memoExo.set(base, m); }
  const k = `${estado.revision}|${estado.config.metodo}|${clave}|${JSON.stringify(def)}`;
  const x = m.get(k);
  if (x) { ultimoError = x.error; return x.v as T; }
  const v = f();
  m.set(k, { v, error: ultimoError });
  return v;
}
export function datosExo(dir: 'A' | 'B' = estado.dir, def: ExoDef | null | undefined = estado.proyecto.exo): (DatosExo & { entrada: EntradaExo }) | null {
  if (!def) return null;
  return recordar(`datos ${dir}`, def, () => datosExoSinMemoria(dir, def));
}
function datosExoSinMemoria(dir: 'A' | 'B', def: ExoDef): (DatosExo & { entrada: EntradaExo }) | null {
  ultimoError = '';
  try {
    const { asig } = estado.calculo, p = estado.proyecto;
    const R: PlanillaRes = estado.calculo.valores;
    const alt = datosAltura(p, R.viento, R.mnyq, asig.filaNivel, dir);
    const iPB = p.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1);
    const zPB = p.niveles[iPB]?.cota ?? 0;
    const sobre = alt.filter(x => x.z > zPB + 1e-6).sort((a, b) => a.z - b.z);
    if (sobre.length < 2) return null;
    // métodos CIRSOC y FEM: el viento de resistencia del 102-25 (en FEM, con la frecuencia del modelo) y el ΣJ de la sección real
    const w102 = vientoReglamento();
    const zs = [zPB, ...sobre.map(x => x.z)];
    const W = w102 ? sobre.map(x => w102[dir].niveles.find((n: { z: number }) => Math.abs(n.z - (x.z - zPB)) < 1e-6)?.W ?? 0) : sobre.map(x => x.F);
    const rg0 = rigidez(R, p.hormigon || 'H30').find(x => x.dir === dir)!;
    const roto = estado.calculo.cirsoc?.corr[dir === 'A' ? 'rotoA' : 'rotoB'];
    const rg = w102 && roto ? { ...rg0, J: roto.SJ } : rg0;
    const E = moduloHormigon(p.hormigon || 'H30');
    const Jniv = rigidezPorNivel(p, asig.piezas, dir, rg.J).sort((a, b) => a.z - b.z);
    // J de los tabiques que toman viento en cada piso; si arriba no hay ninguno (núcleo solo de gravedad), es 0: el exo toma todo
    const EJ = (z: number) => E * (Jniv.find(q => q.z >= z - 1e-6)?.J ?? rg.J);
    const { ancho, t, anchos, ts, corr, tc, anchosPerp } = anchosCara(dir, def, zs);
    const r = calcularExo(paraViento(def, dir), zs, W, EJ, ancho, [-t, t], E, anchos, corr, { anchosPerp });
    const h0 = zs[zs.length - 1] - zPB;
    return { r, def, dir, ancho, tCaras: [-t, t], niveles: sobre.map(x => x.nivel), h: h0, Eh: E, anchos, ts, corr, tc, entrada: { dir, zs, W, EJ, ancho, tCaras: [-t, t], Eh: E, h: h0, anchos, corr, anchosPerp } };
  } catch (err) { ultimoError = err instanceof Error ? err.message : String(err); return null; }
}
let ultimoError = '';
/** ancho de la cara (y su posición t) del viento dir, fijo o en cada cota si la cara sigue la planta */
function anchosCara(dir: 'A' | 'B', def: ExoDef, zs: number[]) {
  const p = estado.proyecto, iPB = p.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1);
  const pl = plantaDeNivel(p, iPB), A = dir === 'A';
  // ficha F: los planos de los brazos pasan por las caras del núcleo (a ± medio núcleo), no por las fachadas
  const ancho = (A ? pl.L : pl.B) + 2 * def.separacion, t = def.tipo === 'F' ? Math.max(0.5, (def.nucleo ?? ancho / 3) / 2) : (A ? pl.B : pl.L) / 2 + def.separacion;
  // caras que siguen la planta de cada nivel (Hancock): ancho y posición de la cara en cada cota
  let anchos: number[] | undefined, ts: number[] | undefined;
  if (def.anchoVariable) {
    const plz = zs.map(z => { const i = p.niveles.findIndex(nv => Math.abs(nv.cota - z) < 1e-6); return plantaDeNivel(p, i >= 0 ? i : iPB); });
    anchos = plz.map(q => (A ? q.L : q.B) + 2 * def.separacion);
    ts = plz.map(q => (A ? q.B : q.L) / 2 + def.separacion);
  }
  // torre inclinada o corrida: cada nivel corrido (dx, dy) respecto de PB; las caras lo siguen
  const nivEn = (z: number) => p.niveles.find(nv => Math.abs(nv.cota - z) < 1e-6);
  const corrido = (f: (nv: typeof p.niveles[number]) => number | null | undefined) => { const v = zs.map(z => { const nv = nivEn(z); return (nv && f(nv)) || 0; }); return v.some(x => Math.abs(x) > 1e-9) ? v : undefined; };
  const corr = corrido(nv => (A ? nv.dy : nv.dx)), tc = corrido(nv => (A ? nv.dx : nv.dy));
  // la cara perpendicular: la del cinturón en la ficha F (sus planos pasan por el núcleo)
  const anchosPerp = def.tipo === 'F' ? zs.map(() => (A ? pl.B : pl.L) + 2 * def.separacion) : ts?.map(x => 2 * x);
  return { ancho, t, anchos, ts, corr, tc, anchosPerp };
}
/**
 * la geometría de la cara sin calcularla (sirve aunque todavía sea un mecanismo, mientras se arma barra por barra):
 * cotas sobre PB, ancho, posición de las caras y la cara armada
 */
export function geometriaExo(dir: 'A' | 'B', def: ExoDef | null | undefined = estado.proyecto.exo) {
  if (!def) return null;
  try {
    const p = estado.proyecto, { asig } = estado.calculo, R: PlanillaRes = estado.calculo.valores;
    const alt = datosAltura(p, R.viento, R.mnyq, asig.filaNivel, dir);
    const iPB = p.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1), zPB = p.niveles[iPB]?.cota ?? 0;
    const zs = [zPB, ...alt.filter(x => x.z > zPB + 1e-6).sort((a, b) => a.z - b.z).map(x => x.z)];
    if (zs.length < 3) return null;
    const g = anchosCara(dir, def, zs);
    return { zs, ...g, tCaras: [-g.t, g.t], cara: armarCara(paraViento(def, dir), g.ancho, zs, 'cara', g.anchos, g.corr, { anchoPerp: g.anchosPerp?.[0] }) };
  } catch { return null; }
}

/** el viento del 102-25 si el método sigue las reglas del CIRSOC (CIRSOC o FEM); si no, null (el de la planilla o la guía) */
export function vientoReglamento(): Viento102 | null {
  const m = estado.config.metodo;
  return m === 'cirsoc' || m === 'fem' ? estado.calculo.fem?.viento ?? estado.calculo.cirsoc?.viento ?? null : null;
}
/** CIRSOC 301/302 de las barras de acero: con las combinaciones del 101-25 (métodos CIRSOC y FEM) o la del curso */
export function verif301(d: DatosExo & { entrada: EntradaExo }) {
  return recordar(`301 ${d.dir} ${d.ancho} ${d.tCaras.join(' ')}`, d.def, () => verif301SinMemoria(d));
}
function verif301SinMemoria(d: DatosExo & { entrada: EntradaExo }) {
  const en = d.entrada, reglamento = !!vientoReglamento();
  // vientos oblicuos (quartering): las columnas de esquina con los dos vientos a la vez
  const otro = datosExo(d.dir === 'A' ? 'B' : 'A', d.def)?.entrada;
  const combos = reglamento ? [...COMBOS_101_25, ...COMBOS_OBLICUOS_101_25] : [...COMBOS_CURSO, ...COMBOS_OBLICUOS_CURSO];
  return cirsoc301(d.def, en.zs, en.W, en.EJ, en.ancho, en.tCaras, en.Eh, en.anchos, FY_F24, { combos, costura: d.def.sinCostura ? false : true, otro, dir: d.dir, corr: en.corr, anchosPerp: en.anchosPerp });
}
/** desplazamiento de la azotea que se controla y su límite: con el viento de servicio y h/límite de deriva (CIRSOC) o h/500 (curso) */
export function flechaExo(d: DatosExo): { u: number; lim: number; texto: string } {
  const n = d.r.u.length - 1, w = vientoReglamento();
  if (w) { const limD = datos201De(estado.proyecto).limiteDeriva; return { u: d.r.u[n] * w.servicio.relacion, lim: d.h / limD, texto: `deriva de servicio (${fmt(w.servicio.relacion * 100, 0)} % del viento de cálculo) ≤ h/${limD}` }; }
  return { u: d.r.u[n], lim: d.h / (d.def.limiteH ?? 500), texto: `flecha ≤ h/${d.def.limiteH ?? 500}` };
}
/**
 * Los controles del exoesqueleto en la lista general (Resumen, informe, lámina): el desplazamiento de la azotea con el
 * exo y las barras (CIRSOC 301/302 con el método CIRSOC o FEM; tensión y pandeo con los del curso), en cada viento.
 */
export function controlesExo(): Control[] {
  const def = estado.proyecto.exo;
  if (!def || !exoEnElCalculo()) return [];
  const out: Control[] = [];
  const reglamento = !!vientoReglamento() && def.material !== 'hormigon';
  for (const dir of ['A', 'B'] as const) {
    const d = datosExo(dir, def);
    if (!d) { out.push({ grupo: 'Exoesqueleto', nombre: `Exoesqueleto, viento ${dir}`, criterio: 'que se pueda calcular', fuente: 'etapa 08', planilla: null, guia: null, unidad: '', estado: 'atención', nota: 'Faltan datos para calcular el exoesqueleto (niveles, piezas o viento).' }); continue; }
    const fl = flechaExo(d);
    // con el viento del reglamento, la deriva de servicio de la torre con el exo ya está en «Rigidez» (método CIRSOC)
    if (!vientoReglamento()) out.push({ grupo: 'Exoesqueleto', nombre: `Desplazamiento de la azotea con el exo, viento ${dir}`, criterio: fl.texto, fuente: 'etapa 08 · ménsula + exo', planilla: null, guia: fl.u * 1000, unidad: 'mm',
      estado: fl.u <= fl.lim ? 'verifica' : 'no verifica', nota: `límite ${fmt(fl.lim * 1000, 0)} mm; el exo toma el ${fmt(d.r.fraccionExo * 100, 0)} % del momento` });
    if (reglamento) {
      const v = verif301(d), peor = v.reduce((m, x) => (x.ratio > m.ratio ? x : m), v[0]), malos = v.filter(x => !x.verifica).length;
      out.push({ grupo: 'Exoesqueleto', nombre: `Barras del exo (CIRSOC 301/302), viento ${dir}`, criterio: 'interacción ≤ 1 y pared no esbelta en todas', fuente: 'CIRSOC 301, cap. H; 302, tabla 2.2.1', planilla: null, guia: peor?.ratio ?? null, unidad: '',
        estado: malos ? 'no verifica' : 'verifica', nota: peor ? `la más cargada: ${peor.id} (${peor.clase}, ${peor.combinacion})${malos ? `; ${malos} de ${v.length} no verifican` : ''}` : undefined });
    } else {
      const cs = d.r.controles, malos = cs.filter(c => c.estado !== 'verifica').length, peor = cs.reduce((m, c) => (c.sigma > m.sigma ? c : m), cs[0]);
      out.push({ grupo: 'Exoesqueleto', nombre: `Barras del exo (tensión y pandeo), viento ${dir}`, criterio: `σ ≤ σadm = ${fmt(def.sigmaAdm / 10, 0)} kg/cm² y sin pandeo`, fuente: 'etapa 08', planilla: null, guia: peor ? peor.sigma / 10 : null, unidad: 'kg/cm²',
        estado: malos ? 'no verifica' : 'verifica', nota: peor ? `la más cargada: ${peor.id} (${peor.clase})${malos ? `; ${malos} de ${cs.length} no verifican` : ''}` : undefined });
    }
  }
  return out;
}
registrarControles(controlesExo);

export function estadoExo(): EstadoChip {
  if (!estado.proyecto.exo) return 'pendiente';
  const ds = (['A', 'B'] as const).map(d => datosExo(d));
  if (ds.some(d => !d)) return 'revisar';
  const reglamento = !!vientoReglamento() && estado.proyecto.exo.material !== 'hormigon';
  return ds.every(d => (reglamento ? verif301(d!).every(x => x.verifica) : d!.r.controles.every(c => c.estado === 'verifica')) && flechaExo(d!).u <= flechaExo(d!).lim) ? 'verifica' : 'no verifica';
}

// ------------------------------------------------------------------ torsión con el exo
/** la rototraslación del viento elegido con las caras del exo como dos piezas más en cada sentido */
function seccionTorsion(def: ExoDef): HTMLElement | null {
  if (def.tipo === 'F') {
    // los brazos frenan la flexión del núcleo, no su giro: no hay una cuenta de torsión que valga la pena mostrar
    const s0 = seccion('Torsión con el exo');
    s0.cuerpo.append(h('p', { class: 'nota' }, 'Los brazos frenan la flexión del núcleo, no su giro: los planos de los brazos pasan por el núcleo, cerca del centro. A la torsión la siguen tomando los tabiques (la rototraslación de la planilla). Con el cinturón, las columnas del perímetro algo ayudan, pero el modelo plano no lo cuenta (del lado seguro).'));
    return s0.el;
  }
  const dir = estado.dir, otra = dir === 'A' ? 'B' : 'A', dp = datosExo(dir, def), dq = datosExo(otra, def);
  const r = dir === 'A' ? estado.calculo.valores.rotA : estado.calculo.valores.rotB;
  if (!dp || !dq || !r) return null;
  const t = torsionConExo(r, dp.r.caras[0]?.Jeq ?? 0, dp.tCaras[1], dq.r.caras[0]?.Jeq ?? 0, dq.tCaras[1]);
  if (!(t.kSin > 0)) return null;
  const simetrica = !isFinite(t.giro) || Math.abs(t.mtSin) < 1e-6;
  // con un mismo torsor (el viento corrido de los casos 2 y 4 del CIRSOC, o uno oblicuo) el giro baja como la rigidez
  const giroMismo = t.kSin / t.kCon;
  const s = seccion('Torsión con el exo');
  s.cuerpo.append(
    h('p', { class: 'nota' }, `Las caras del exo están lejos del centro: aunque tengan menos J que los tabiques, a la torsión ayudan mucho (Σ J · d², con d grande). Con el método de la rototraslación de la planilla, entran como dos piezas más en cada sentido, a ±${fmt(dp.tCaras[1], 2)} m, con su J equivalente de ${fmt(dp.r.caras[0]?.Jeq ?? 0, 1)} m⁴ por cara.`),
    h('div', { class: 'kpis' },
      kpi('Centro de rigidez', `${fmt(t.crSin, 2)} → ${fmt(t.crCon, 2)} m`, 'desde el eje de la torre: el exo lo acerca al medio'),
      kpi('Torsor Q · e', `${fmt(t.mtSin, 0)} → ${fmt(t.mtCon, 0)} tm`, 'baja porque el centro de rigidez se acerca a donde actúa el viento'),
      simetrica ? kpi('Giro con un mismo torsor', `${fmt(giroMismo * 100, 0)} %`, 'del que tiene sin el exo: la torre es simétrica y con el viento de frente no hay torsor, pero con el viento corrido (casos 2 y 4 del CIRSOC) o de cuarto sí', colorEstado(true))
        : kpi('Giro de la planta', `${fmt(t.giro * 100, 0)} %`, `del que tiene sin el exo (torsor / rigidez a la torsión); con un mismo torsor, ${fmt(giroMismo * 100, 0)} %`, colorEstado(t.giro < 1)),
      kpi('Torsión que toma el exo', `${fmt(t.parteExo * 100, 0)} %`, `rigidez a la torsión: ${fmt(t.kSin, 0)} → ${fmt(t.kCon, 0)} m⁶`)),
    h('p', { class: 'nota chica' }, 'Es una cuenta aparte: la planilla de la cátedra sigue con los tabiques solos. Si el giro baja mucho, la corrección por torsión de cada tabique (columna N de la rototraslación) baja en la misma proporción.'));
  return s.el;
}

// ------------------------------------------------------------------ qué módulo conviene
let barrido: { clave: string; filas: FilaModulo[] } | null = null;
/** el último barrido vale mientras no cambie el exo ni el proyecto (sin contar el módulo, que es lo que se barre) */
const claveBarrido = (def: ExoDef, ens: EntradaExo[]) => JSON.stringify([{ ...def, modulo: 0, columna: 0, diagonal: 0, viga: 0, barras: 0, nuevas: 0, cortes: 0 }, ens.map(en => [en.zs, en.W, en.ancho, en.anchos, en.corr, en.zs.map(z => en.EJ(z))])]);
function seccionModulo(def: ExoDef, ens: EntradaExo[], corr?: number[]): HTMLElement {
  const diagrid = def.tipo === 'A';
  const hp = (ens[0].zs[ens[0].zs.length - 1] - ens[0].zs[0]) / (ens[0].zs.length - 1);
  const ang = ens.map(en => anguloDiagonal(def, en.ancho, def.modulo * hp));
  const cuerpo = h('div', {});
  cuerpo.append(
    h('p', { class: 'nota' }, `Con un módulo de ${def.modulo} pisos las diagonales van a ${fmt(ang[0], 0)}° con el viento A y a ${fmt(ang[1], 0)}° con el B. ${diagrid ? 'Acostadas (unos 35°), el reticulado es muy rígido al corte; paradas (cerca de 90°, como columnas), a la flexión. En las torres altas y esbeltas el óptimo del diagrid suele quedar entre 60° y 70° y sube con la esbeltez (Moon, Connor y Fernández, 2007).' : 'Las cruces acostadas toman bien el corte pero son largas y pandean; las paradas, al revés.'} El barrido dimensiona el exo con cada módulo y compara el peso de acero: el más liviano que verifica es el que conviene para esta torre.`),
    ...(corr ? [h('p', { class: 'nota chica' }, 'La torre está inclinada o corrida (Diseño → Perfil): las caras del exo siguen a cada nivel y las columnas de esquina quedan inclinadas.')] : []));
  const boton = h('button', { type: 'button', class: 'boton' }, 'Probar módulos de 2 a 20 pisos');
  const res = h('div', {});
  const mostrar = (filas: FilaModulo[]) => {
    res.replaceChildren();
    const ok = filas.filter(f => f.verifica);
    const mejor = ok.length ? ok.reduce((a, b) => (b.peso < a.peso ? b : a)) : null;
    res.append(graficoModulo(filas, mejor, def.modulo));
    if (mejor && mejor.modulo === def.modulo && JSON.stringify([def.columna, def.diagonal, def.viga]) === JSON.stringify([mejor.def.columna, mejor.def.diagonal, mejor.def.viga]))
      res.append(h('p', { class: 'nota estado verifica' }, `Ya usás el módulo más liviano: ${mejor.modulo} pisos (${fmt(mejor.angulos[0], 0)}°, ${fmt(mejor.peso, 0)} t).`));
    else if (mejor) {
      const usar = h('button', { type: 'button', class: 'primario' }, `Usar el módulo de ${mejor.modulo} pisos (${fmt(mejor.angulos[0], 0)}°, ${fmt(mejor.peso, 0)} t)`);
      usar.addEventListener('click', () => estado.cambiar(() => { const x = estado.proyecto.exo; if (!x) return; x.modulo = mejor.modulo; x.columna = mejor.def.columna; x.diagonal = mejor.def.diagonal; x.viga = mejor.def.viga; delete x.barras; delete x.nuevas; delete x.cortes; }));
      res.append(h('div', { class: 'fila-acciones' }, usar));
    } else res.append(h('p', { class: 'aviso-linea' }, 'Ningún módulo verifica con los tubos del catálogo: probá más separación, otra ficha o más vanos.'));
    const t = tablaValores(['Módulo (pisos)', 'Ángulo A (°)', 'Ángulo B (°)', 'Acero (t)', 'δ / límite', ''], filas.map(f => [f.modulo, f.angulos[0], f.angulos[1], f.peso, f.flecha, f.verifica ? (f === mejor ? 'el más liviano' : 'verifica') : 'no verifica']), [0, 0, 0, 0, 2, 0]);
    res.append(t);
  };
  boton.addEventListener('click', () => {
    boton.setAttribute('disabled', ''); document.body.style.cursor = 'progress';
    const msg = document.getElementById('mensaje'); if (msg) msg.textContent = 'Dimensionando el exo con cada módulo…';
    setTimeout(() => {
      try { const filas = barridoModulo(def, ens); barrido = { clave: claveBarrido(def, ens), filas }; mostrar(filas); if (msg) msg.textContent = `Listo: ${filas.length} módulos probados.`; }
      finally { boton.removeAttribute('disabled'); document.body.style.cursor = ''; }
    }, 30);
  });
  cuerpo.append(h('div', { class: 'fila-acciones' }, boton), res);
  if (barrido && barrido.clave === claveBarrido(def, ens)) mostrar(barrido.filas);
  return seccion(diagrid ? '¿Qué módulo conviene? El ángulo del diagrid' : '¿Qué módulo conviene? El ángulo de las cruces', cuerpo).el;
}
/** acero (t) contra el ángulo de las diagonales: un punto por módulo, el más liviano marcado y la franja de 60° a 70° */
function graficoModulo(filas: FilaModulo[], mejor: FilaModulo | null, actual: number): SVGSVGElement {
  const W = 420, H = 230, m = { l: 48, r: 14, t: 14, b: 38 };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'grafico-modulo', role: 'img', 'aria-label': 'Peso de acero según el ángulo de las diagonales' }) as SVGSVGElement;
  const pts = filas.filter(f => isFinite(f.angulos[0]) && f.peso > 0);
  if (!pts.length) return svg;
  const pMax = Math.max(...pts.map(f => f.peso)) * 1.1;
  const X = (a: number) => m.l + (a / 90) * (W - m.l - m.r), Y = (q: number) => H - m.b - (q / pMax) * (H - m.t - m.b);
  svg.append(el('rect', { x: X(60), y: m.t, width: X(70) - X(60), height: H - m.t - m.b, class: 'gm-franja' }));
  svg.append(el('text', { x: (X(60) + X(70)) / 2, y: m.t + 11, class: 'gm-nota', 'text-anchor': 'middle' }, '60–70°'));
  svg.append(el('line', { x1: m.l, y1: H - m.b, x2: W - m.r, y2: H - m.b, class: 'gm-eje' }), el('line', { x1: m.l, y1: m.t, x2: m.l, y2: H - m.b, class: 'gm-eje' }));
  for (const a of [0, 15, 30, 45, 60, 75, 90]) svg.append(el('text', { x: X(a), y: H - m.b + 14, class: 'gm-nota', 'text-anchor': 'middle' }, `${a}°`));
  for (const k of [0, 0.5, 1]) svg.append(el('text', { x: m.l - 6, y: Y(pMax * k / 1.1) + 3, class: 'gm-nota', 'text-anchor': 'end' }, fmt((pMax * k) / 1.1, 0)));
  svg.append(el('text', { x: (W + m.l) / 2, y: H - 6, class: 'gm-tit', 'text-anchor': 'middle' }, 'ángulo de las diagonales con la horizontal (viento A)'));
  svg.append(el('text', { x: 12, y: (H - m.b + m.t) / 2, class: 'gm-tit', 'text-anchor': 'middle', transform: `rotate(-90 12 ${(H - m.b + m.t) / 2})` }, 'acero (t)'));
  svg.append(el('polyline', { points: pts.map(f => `${X(f.angulos[0]).toFixed(1)},${Y(f.peso).toFixed(1)}`).join(' '), class: 'gm-linea' }));
  pts.forEach(f => {
    const c = el('circle', { cx: X(f.angulos[0]), cy: Y(f.peso), r: f === mejor ? 6 : 4, class: `gm-punto${f.verifica ? '' : ' no'}${f === mejor ? ' mejor' : ''}${f.modulo === actual ? ' actual' : ''}` });
    c.append(el('title', {}, `${f.modulo} pisos · ${fmt(f.angulos[0], 0)}° · ${fmt(f.peso, 0)} t${f.verifica ? '' : ' · no verifica'}`));
    svg.append(c);
  });
  if (mejor) svg.append(el('text', { x: X(mejor.angulos[0]), y: Y(mejor.peso) - 10, class: 'gm-tit', 'text-anchor': 'middle' }, `${mejor.modulo} pisos`));
  return svg;
}

// ------------------------------------------------------------------ panel
export function panelExo(c: H) {
  const p = estado.proyecto, def = p.exo;
  const set = (f: (d: ExoDef) => void) => estado.cambiar(() => { if (p.exo) f(p.exo); });
  const sw = h('label', { class: 'campo-linea' });
  const cb = h('input', { type: 'checkbox' }) as HTMLInputElement; cb.checked = !!def;
  cb.addEventListener('change', () => estado.cambiar(() => { p.exo = cb.checked ? structuredClone(EXO_POR_DEFECTO) : null; }));
  sw.append(cb, ' Agregar un exoesqueleto de acero en el perímetro de la torre');
  // dónde va: por fuera de la fachada (separación ≥ 0) o detrás de la piel (separación < 0, como los chevrones del Citicorp)
  const adentro = !!def && def.separacion < 0;
  c.append(h('p', { class: 'nota' }, `Una estructura de acero ${adentro ? `por dentro de la piel (${fmt(-def!.separacion, 2)} m detrás de la fachada)` : 'por fuera de la fachada'} que trabaja junto con los tabiques: las losas las atan y cada una toma el viento según su rigidez, como dos resortes en paralelo.`), sw);
  if (!def) return;
  if (!exoEnElCalculo()) c.append(h('p', { class: 'nota' }, `Método ${estado.config.metodo === 'guia' ? 'Guía' : estado.config.metodo === 'combinado' ? 'comparación' : 'Planilla'}: el método de la cátedra no tiene en cuenta el exoesqueleto. Acá es un estudio aparte: no cambia ningún resultado del método (tabiques, flexocompresión, resumen, desglose ni el Excel). Para que entre en el cálculo, elegí el método CIRSOC o FEM.`));
  if (def.notas?.length) {
    const ul = h('ul', { class: 'notas-fuentes' }, ...def.notas.map(t => h('li', {}, t)));
    c.append(seccion('De dónde sale cada número', ul, h('p', { class: 'nota chica' }, 'Lo que dice «supuesto» no está publicado: se puede cambiar o dimensionar.')).el);
  }
  const d = datosExo();
  if (d) {
    const n = d.r.u.length - 1, fl = flechaExo(d), relS = fl.u / (d.r.u[n] || 1);
    const reglamento = !!vientoReglamento() && def.material !== 'hormigon';
    const malos = reglamento ? verif301(d).filter(x => !x.verifica).length : d.r.controles.filter(x => x.estado !== 'verifica').length;
    if (vientoReglamento()) c.append(h('p', { class: 'nota' }, `Método ${estado.config.metodo === 'fem' ? 'FEM' : 'CIRSOC'}: el viento de cada piso es el del CIRSOC 102-25 (de resistencia${estado.config.metodo === 'fem' ? ', con la frecuencia del modelo' : ''}), el ΣJ de los tabiques es el de la sección real, las barras se verifican con el CIRSOC 301/302 y las combinaciones del 101-25, y el desplazamiento se controla como deriva con el viento de servicio.`));
    c.append(h('div', { class: 'kpis' },
      kpi(vientoReglamento() ? 'Deriva de servicio' : 'Flecha azotea', `${fmt(fl.u * 1000, 1)} mm`, `${isFinite(d.r.uSin[n]) ? `sin exo ${fmt(d.r.uSin[n] * relS * 1000, 1)} mm` : 'sin exo no hay tabiques que tomen el viento arriba'} · ${fl.texto} = ${fmt(fl.lim * 1000, 0)}`, colorEstado(fl.u <= fl.lim)),
      kpi('Momento que toma el exo', `${fmt(d.r.fraccionExo * 100, 0)} %`, `los tabiques: ${fmt((1 - d.r.fraccionExo) * 100, 0)} %`),
      kpi(def.tipo === 'F' ? 'J equivalente de cada plano de brazos' : 'J equivalente de cada cara', `${fmt(d.r.caras[0]?.Jeq ?? 0, 1)} m⁴`, 'para la rototraslación'),
      kpi('Barras', `${d.r.controles.length - malos} de ${d.r.controles.length}`, malos ? `${malos} no verifican (${reglamento ? 'CIRSOC 301/302' : 'tensión o pandeo'})` : `todas verifican${reglamento ? ' (CIRSOC 301/302)' : ''}`, colorEstado(!malos))));
    const ens = (['A', 'B'] as const).map(x => entradaExo(x, def)).filter(Boolean) as EntradaExo[];
    const peso = ens.length === 2 ? pesoExo(def, ens) : NaN;
    const bDim = h('button', { type: 'button', class: 'primario', title: 'Prueba los tubos del catálogo de menor a mayor y agranda solo la clase de barra que falla, con los dos vientos' }, 'Dimensionar: el más liviano que verifica');
    bDim.addEventListener('click', () => {
      if (ens.length < 2) return;
      const msg0 = document.getElementById('mensaje');
      if (msg0) msg0.textContent = 'Dimensionando: probando tubos del catálogo con los dos vientos…';
      bDim.disabled = true; document.body.style.cursor = 'progress';
      // se deja pintar el aviso antes de la cuenta (en torres grandes tarda unos segundos)
      setTimeout(() => { try { dimensionar(); } finally { bDim.disabled = false; document.body.style.cursor = ''; } }, 30);
    });
    const dimensionar = () => {
      const r = dimensionarExo(def, ens);
      const t = (x: { b: number; e: number }) => `${fmt(x.b * 1000, 0)}×${fmt(x.e * 1000, 1)}`;
      estado.cambiar(() => { const x = estado.proyecto.exo; if (x) { x.columna = r.def.columna; x.diagonal = r.def.diagonal; x.viga = r.def.viga; if (x.tipo === 'E') { x.mastil = r.def.mastil; x.tramos = r.def.tramos; } } });
      const msg = document.getElementById('mensaje');
      if (msg) msg.textContent = r.verifica ? `Listo: columnas ${t(r.def.columna)}, diagonales ${t(r.def.diagonal)}, vigas ${t(r.def.viga)}${r.def.tipo === 'E' && r.def.mastil ? `, mástil ${t(r.def.mastil)}` : ''} mm · ${fmt(r.peso, 0)} t de ${def.material === 'hormigon' ? 'hormigón' : 'acero'} (antes ${fmt(peso, 0)} t). Ctrl+Z vuelve atrás.` : `No verifica: ${r.motivo}.`;
    };
    c.append(h('div', { class: 'fila-acciones' }, bDim, h('span', { class: 'nota chica' }, `${def.material === 'hormigon' ? 'Hormigón' : 'Acero'} ${def.tipo === 'F' ? 'de los brazos y las columnas' : 'de las cuatro caras'}: ${fmt(peso, 0)} t (${fmt(peso / Math.max(1, ens[0]?.h ?? 1), 1)} t por metro de altura)`)));
    if ((def.tipo === 'A' || def.tipo === 'D') && ens.length === 2) c.append(seccionModulo(def, ens, d.corr));
    const st = seccionTorsion(def); if (st) c.append(st);
  }
  const fo = h('div', { class: 'formulario' });
  campo(fo, 'Ficha', 'exo-tipo', def.tipo, v => set(x => { x.tipo = v as TipoExo; delete x.barras; delete x.nuevas; delete x.zonas; }), { lista: Object.keys(TIPOS_EXO), ayuda: `${TIPOS_EXO[def.tipo].nombre}: ${TIPOS_EXO[def.tipo].texto}` });
  const nu = (f: (x: ExoDef, v: number) => void) => (v: string) => { const x = parseFloat(v.replace(',', '.')); if (isFinite(x) && x > 0) set(e => f(e, x)); };
  campo(fo, 'Separación', 'exo-sep', def.separacion, nu((x, v) => (x.separacion = v)), { tipo: 'number', unidad: 'm', ayuda: 'distancia de la fachada al eje de las columnas del exo' });
  if (def.tipo !== 'F') campo(fo, 'Módulo', 'exo-mod', def.modulo, nu((x, v) => { x.modulo = Math.round(v); delete x.barras; delete x.nuevas; }), { tipo: 'number', unidad: 'pisos', ayuda: 'alto de cada cruz, marco o diamante' });
  if (def.zonas?.length) fo.append(h('p', { class: 'nota aviso-loft nota-ancha' }, `Hay ${def.zonas.length} zonas en altura: cada una tiene su ficha y su módulo (se editan en «Diseño 3D», en el centro). La ficha y el módulo de acá valen para lo que no diga cada zona.`));
  campo(fo, 'Flecha objetivo: h /', 'exo-lim', def.limiteH ?? 500, nu((x, v) => (x.limiteH = Math.max(100, Math.round(v)))), { tipo: 'number', ayuda: 'el curso pide h/500; con un número más grande (h/1000, h/1500) el dimensionado busca un exo que deje la torre más rígida' });
  const sec = (nombre: string, k: 'columna' | 'diagonal' | 'viga') => {
    const s = def[k], pr = propsSeccion(s);
    campo(fo, `${nombre}: lado`, `exo-${k}-b`, s.b * 1000, nu((x, v) => (x[k].b = v / 1000)), { tipo: 'number', unidad: 'mm', ayuda: `tubo cuadrado · A = ${fmt(pr.A * 1e4, 0)} cm² · i = ${fmt(pr.i * 100, 1)} cm` });
    campo(fo, `${nombre}: espesor`, `exo-${k}-e`, s.e * 1000, nu((x, v) => (x[k].e = v / 1000)), { tipo: 'number', unidad: 'mm' });
  };
  if (def.tipo === 'F') {
    // núcleo con outriggers: dónde van los brazos, el núcleo y el cinturón
    const zsF = datosExo()?.r.zs ?? [];
    const kOut = zsF.length ? nivelesOutrigger(def, zsF) : [];
    campo(fo, 'Ancho del núcleo', 'exo-nucleo', def.nucleo ?? '', nu((x, v) => (x.nucleo = v)), { tipo: 'number', unidad: 'm', ayuda: 'en el sentido del viento; los brazos arrancan en sus caras. Vacío: un tercio de la planta' });
    campo(fo, 'Cotas de los brazos', 'exo-outr', (def.outriggers ?? kOut.map(k => zsF[k])).map(z => fmt(z, 2)).join('; '), v => {
      const zz = v.split(';').map(t => parseFloat(t.trim().replace(',', '.'))).filter(z => isFinite(z) && z > 0);
      set(x => { x.outriggers = zz.length ? zz : undefined; delete x.barras; });
    }, { ayuda: `cota del cordón de arriba de cada brazo (m), separadas por «;»; cada brazo es un reticulado de un piso de alto y va al piso más cercano. Con uno solo, conviene cerca de media altura; con dos, a un tercio y dos tercios (Smith y Coull). Hoy: ${kOut.map(k => `${fmt(zsF[k], 1)} m`).join(', ') || '—'}` });
    const ci = h('label', { class: 'campo-linea', title: 'El cinturón es un reticulado en el perímetro, a la altura de cada brazo: ata todas las columnas de la cara perpendicular al viento para que trabajen juntas, no solo la que toca el brazo' });
    const cbc = h('input', { type: 'checkbox' }) as HTMLInputElement; cbc.checked = def.cinturon !== false;
    cbc.addEventListener('change', () => set(x => { x.cinturon = cbc.checked ? undefined : false; }));
    ci.append(cbc, ' Cinturón a la altura de cada brazo (trabajan todas las columnas de la cara)');
    fo.append(ci);
    const bp = h('label', { class: 'campo-linea', title: 'En las torres reales los brazos se conectan al terminar la obra gruesa: así el peso (de la estructura y de las losas) baja por las columnas y el núcleo sin forzar los brazos. Si se conectan desde el principio, las columnas cargadas se acortan más que el núcleo y los brazos toman parte del peso.' });
    const cbp2 = h('input', { type: 'checkbox' }) as HTMLInputElement; cbp2.checked = !def.brazosDesdeElPrincipio;
    cbp2.addEventListener('change', () => set(x => { x.brazosDesdeElPrincipio = cbp2.checked ? undefined : true; }));
    bp.append(cbp2, ' Brazos conectados al terminar la obra gruesa (el peso no pasa por ellos; la sobrecarga y el viento, sí)');
    fo.append(bp);
    if (def.cinturon !== false) {
      campo(fo, 'Columnas en cada cara perpendicular', 'exo-colcara', def.columnasCara ?? 4, nu((x, v) => (x.columnasCara = Math.max(1, Math.round(v)))), { tipo: 'number', ayuda: 'columnas del perímetro en cada cara perpendicular al viento, repartidas a lo ancho; el cinturón las hace trabajar según su rigidez (shear lag)' });
      const dF = datosExo();
      if (dF && zsF.length) {
        const c0 = Math.max(0.5, (def.nucleo ?? dF.ancho / 3) / 2), ce = columnasEfectivas(def, dF.entrada.anchosPerp?.[0] ?? dF.ancho, c0, kOut, zsF);
        const nc = Math.max(1, Math.round(def.columnasCara ?? 4)), mitad = ce.psi.filter(q => q.y >= -1e-6);
        fo.append(h('p', { class: 'nota chica' }, `Con el cinturón de cordones ${fmt(def.viga.b * 1000, 0)}×${fmt(def.viga.e * 1000, 1)} trabajan ${fmt(ce.porPlano, 2)} columnas por plano de brazos (de ${fmt(nc / 2, 1)}): ${mitad.map(q => `${fmt(q.psi * 100, 0)} %`).join(', ')}, de la más cerca del centro a la de la esquina. Un cinturón más rígido (cordones más grandes) las hace trabajar a todas; uno flojo, casi solo a la que toca el brazo.`));
      }
    }
  }
  sec(def.tipo === 'F' ? 'Columna del perímetro' : 'Columna', 'columna'); sec(def.tipo === 'F' ? 'Diagonal del brazo' : 'Diagonal', 'diagonal'); sec(def.tipo === 'F' ? 'Cordón del brazo' : 'Viga / cinturón', 'viga');
  if (def.tipo === 'E') {
    campo(fo, 'Chevrones desde el piso', 'exo-ini', def.pisoInicio ?? 0, nu((x, v) => { x.pisoInicio = Math.round(v); delete x.barras; }), { tipo: 'number', ayuda: 'número de piso sobre PB (0 = desde la base): abajo queda solo el mástil, como las supercolumnas del Citicorp' });
    const m = def.mastil ?? def.columna, pm = propsSeccion(m);
    campo(fo, 'Mástil: lado', 'exo-mast-b', m.b * 1000, nu((x, v) => { x.mastil = { ...(x.mastil ?? x.columna), b: v / 1000 }; }), { tipo: 'number', unidad: 'mm', ayuda: `columna central de cada cara · A = ${fmt(pm.A * 1e4, 0)} cm²` });
    campo(fo, 'Mástil: espesor', 'exo-mast-e', m.e * 1000, nu((x, v) => { x.mastil = { ...(x.mastil ?? x.columna), e: v / 1000 }; }), { tipo: 'number', unidad: 'mm' });
  }
  c.append(seccion('Ficha y perfiles', fo).el);
  // uniones y cargas
  const fu = h('div', { class: 'formulario' });
  const un = { ...UNIONES_POR_DEFECTO, ...(def.uniones ?? {}) };
  const UN = ['rígida', 'articulada'], aUn = (v: string) => (v === 'articulada' ? 'articulada' : 'rigida') as 'rigida' | 'articulada';
  (['columna', 'diagonal', 'viga'] as const).forEach(k => campo(fu, `Uniones de ${k === 'viga' ? 'vigas' : k === 'columna' ? 'columnas' : 'diagonales'}`, `exo-un-${k}`, un[k] === 'articulada' ? 'articulada' : 'rígida', v => set(x => { x.uniones = { ...(x.uniones ?? {}), [k]: aUn(v) }; }),
    { lista: UN, ayuda: k === 'columna' ? 'rígida: la columna sigue de un piso al otro; articulada: cada tramo con pernos (empalmes que no pasan momento)' : k === 'diagonal' ? 'articulada: biela, solo N (lo habitual); rígida: soldada, también toma M' : 'rígida: pórtico (la viga pasa momento a la columna); articulada: apoyada' }));
  campo(fu, 'Base de las columnas', 'exo-un-base', un.base, v => set(x => { x.uniones = { ...(x.uniones ?? {}), base: v === 'articulada' ? 'articulada' : 'empotrada' }; }), { lista: ['empotrada', 'articulada'] });
  campo(fu, 'El viento llega al exo', 'exo-viento', def.viento === 'fachada' ? 'repartido por la fachada' : 'por las losas, en cada piso', v => set(x => { x.viento = v.startsWith('repartido') ? 'fachada' : 'losas'; }),
    { lista: ['por las losas, en cada piso', 'repartido por la fachada'], ayuda: 'por las losas: la fachada apoya en las losas y el viento entra al exo en los nudos de cada piso (como el Wi de la planilla); repartido: la fachada cuelga del exo y el viento carga las barras de borde a lo largo, repartido piso por piso' });
  const pp = h('label', { class: 'campo-linea' }); const cbp = h('input', { type: 'checkbox' }) as HTMLInputElement; cbp.checked = def.pesoPropio !== false;
  cbp.addEventListener('change', () => set(x => { x.pesoPropio = cbp.checked; })); pp.append(cbp, ' Peso propio del acero (carga repartida en cada barra)');
  fu.append(pp);
  // las losas apoyan en el exo (lo usual en los exos reales: Hearst, Hancock, Citicorp); si no, solo lo atan
  const pl = plantaDeNivel(p, Math.max(0, p.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1)));
  const lo = h('label', { class: 'campo-linea', title: 'Una franja de losa a lo largo de cada fachada apoya en el exo: le baja su peso y su sobrecarga en cada piso. El resto de la losa va al núcleo y a los tabiques.' });
  const cbl = h('input', { type: 'checkbox' }) as HTMLInputElement; cbl.checked = !!def.losas;
  cbl.addEventListener('change', () => set(x => { x.losas = cbl.checked ? { franja: Math.max(1, Math.round((Math.min(pl.B, pl.L) / 8) * 2) / 2) } : undefined; }));
  lo.append(cbl, ' Las losas apoyan en el exo (peso y sobrecarga de una franja junto a cada fachada)');
  fu.append(lo);
  if (def.losas) {
    const L0 = def.losas;
    campo(fu, 'Franja de losa que toma el exo', 'exo-franja', L0.franja, nu((x, v) => { if (x.losas) x.losas.franja = v; }), { tipo: 'number', unidad: 'm', ayuda: 'desde la fachada hacia adentro; lo usual es la mitad de la luz entre la fachada y el núcleo (la otra mitad apoya en el núcleo). Arranca en un octavo del lado menor de la planta' });
    campo(fu, 'Peso de la losa (D)', 'exo-qd', L0.qD ?? LOSA_QD, nu((x, v) => { if (x.losas) x.losas.qD = v; }), { tipo: 'number', unidad: 't/m²', ayuda: 'el de la planilla: 0,7 t/m² (descargado)' });
    campo(fu, 'Sobrecarga (L)', 'exo-ql', L0.qL ?? LOSA_QL, v => { const y = parseFloat(v.replace(',', '.')); if (isFinite(y) && y >= 0) set(x => { if (x.losas) x.losas.qL = y; }); }, { tipo: 'number', unidad: 't/m²', ayuda: 'la planilla usa 0,9 t/m² cargado: 0,2 t/m² más que el peso' });
    const B = pl.L + 2 * def.separacion, Lp = pl.B + 2 * def.separacion, q = (L0.qD ?? LOSA_QD) + (L0.qL ?? LOSA_QL);
    const porPiso = losaPorPiso(q, L0.franja, B, Lp), planta = pl.B * pl.L * q;
    fu.append(h('p', { class: 'nota chica' }, `Cada piso le baja al exo hasta ${fmt(porPiso, 0)} t (${fmt(planta > 0 ? (porPiso / planta) * 100 : 0, 0)} % de la planta, con ${fmt(q, 1)} t/m²). Las columnas lo llevan a la base: con 1,2 D + 1,6 L y con el viento (1,2 D + 0,5 L + W) en el CIRSOC 301; el peso, además, le resta tracción a las columnas de barlovento. La planilla de la cátedra sigue cargando toda la losa en los tabiques: para su compresión queda del lado seguro, para su tracción no.`));
  }
  const ar = h('label', { class: 'campo-linea', title: 'Cada diagonal se ata a la losa en cada piso que cruza entre sus nudos (como en el Hearst): ahí comparte el corrimiento de la losa, recibe su carga y pandea de piso a piso en lugar de nudo a nudo. Sirve sobre todo en el diagrid, donde las diagonales cruzan varios pisos.' });
  const cba = h('input', { type: 'checkbox' }) as HTMLInputElement; cba.checked = !!def.arriostradas;
  cba.addEventListener('change', () => set(x => { x.arriostradas = cba.checked || undefined; }));
  ar.append(cba, ' Las losas arriostran las diagonales en cada piso (pandean de piso a piso)');
  fu.append(ar);
  if (def.material !== 'hormigon') {
    const sc = h('label', { class: 'campo-linea', title: 'CIRSOC 302, Tabla 2.2.1: los tubos sin costura admiten paredes un poco más esbeltas (1,12 y 1,40 √(E/Fy) en lugar de 1,05 y 1,30)' });
    const cbs = h('input', { type: 'checkbox' }) as HTMLInputElement; cbs.checked = !!def.sinCostura;
    cbs.addEventListener('change', () => set(x => { x.sinCostura = cbs.checked || undefined; })); sc.append(cbs, ' Tubos sin costura (CIRSOC 302)');
    fu.append(sc);
  }
  // ficha E como el Citicorp: columnas a los cuartos y columna de esquina que no llega al tope de cada módulo
  if (def.tipo === 'E') {
    const tilde = (txt: string, titulo: string, on: boolean, f: (x: ExoDef, v: boolean) => void) => { const l = h('label', { class: 'campo-linea', title: titulo }); const cb = h('input', { type: 'checkbox' }) as HTMLInputElement; cb.checked = on; cb.addEventListener('change', () => set(x => { f(x, cb.checked); delete x.barras; })); l.append(cb, ' ', txt); return l; };
    fu.append(tilde('Columnas a los cuartos de la cara', 'Bajan a las diagonales a medio módulo (ahí la diagonal tiene un nudo), con una viga a medio módulo de cuarto a cuarto (Citicorp)', !!def.cuartos, (x, v) => { x.cuartos = v || undefined; }),
      tilde('La columna de esquina no llega al tope de cada módulo', 'Termina un piso abajo del nudo del chevron, como en el Citicorp (en el primer módulo cuelga del nudo de arriba)', !!def.esquinaCortada, (x, v) => { x.esquinaCortada = v || undefined; }));
  }
  const nCamb = Object.keys(def.barras ?? {}).length;
  if (nCamb) { const bl = h('button', { type: 'button' }, `Borrar los cambios de ${nCamb} barra${nCamb > 1 ? 's' : ''}`); bl.addEventListener('click', () => set(x => { delete x.barras; })); fu.append(bl); }
  c.append(seccion('Uniones y cargas', fu).el);
  if (d) {
    const peores = [...d.r.controles].sort((a, b) => b.sigma / (def.sigmaAdm) - a.sigma / def.sigmaAdm).slice(0, 12);
    c.append(seccion('Barras más cargadas', tablaValores(['Barra', 'clase', 'N (t)', 'M (tm)', 'σ (kg/cm²)', 'λ', ''],
      peores.map(x => [`${x.cara} · ${x.id}`, x.clase, x.N, x.M, x.sigma / 10, x.lambda, x.estado === 'verifica' ? '✓' : '✗']), [0, 0, 1, 2, 0, 0, 0])).el);
    c.append(h('p', { class: 'nota chica' }, `${def.material === 'hormigon' ? 'Hormigón' : 'Acero'}: E = ${fmt(def.E / 10, 0)} kg/cm², σ adm = ${fmt(def.sigmaAdm / 10, 0)} kg/cm². Pandeo: N ≤ π²·E·I / (1,7·L²) y λ = L / i ≤ 200. Los valores con el viento ${d.dir}.`));
    // CIRSOC 301/302 (estados límite): en los métodos CIRSOC y FEM, con las combinaciones del 101-25 y el viento de
    // resistencia del 102-25; en planilla y guía, de referencia, con 1,2·D + 1,6·W y el viento de la planilla
    if (def.material !== 'hormigon') {
      const reglamento = !!vientoReglamento();
      const v = verif301(d);
      const malas = v.filter(x => !x.verifica);
      const peores = [...v].sort((a, b) => b.ratio - a.ratio).slice(0, 10);
      const paredes = v.filter(x => x.pared !== 'compacta');
      const sec = seccion(`CIRSOC 301/302 · ${v.length - malas.length} de ${v.length} barras verifican${reglamento ? '' : ' (referencia)'}`,
        h('p', { class: 'nota' }, `Estados límite (LRFD), acero F-24 (Fy = 2400 kg/cm²). ${reglamento ? 'Combinaciones del CIRSOC 101-25 con el viento de resistencia del 102-25: 1,4 D; 1,2 D + 1,0 W; 0,9 D + 1,0 W' : 'Con el viento de la planilla (de servicio): 1,2·D + 1,6·W'}, con el viento de los dos lados. Tracción φ·Pn = 0,9·Fy·A; compresión φ·Pn = 0,85·Fcr·A con λc = L/(r·π)·√(Fy/E); flexión φ·Mn = 0,9·Mn (CIRSOC 302: Mp = Z·Fy si la pared es compacta, entre Mp y Fy·S si no); interacción H1-1a (Pu/φPn ≥ 0,2: Pu/φPn + 8/9·Mu/φMn ≤ 1) o H1-1b. Pared del tubo (302, Tabla 2.2.1, ${def.sinCostura ? 'sin' : 'con'} costura): compacta hasta ${def.sinCostura ? '1,12' : '1,05'}·√(E/Fy), esbelta (no verifica) desde ${def.sinCostura ? '1,40' : '1,30'}·√(E/Fy).${reglamento ? '' : ' El control de arriba (σ adm) es el simple del curso; este es el del reglamento.'}`),
        tablaValores(['Barra', 'combinación', 'Pu (t)', 'Mu (tm)', 'φPn (t)', 'φMn (tm)', 'λc', 'b/t', 'pared', 'interacción', ''],
          peores.map(x => [`${x.cara} · ${x.id}`, x.combinacion, x.Pu, x.Mu, x.Pu < 0 ? x.phiPc : x.phiPt, x.phiMn, x.lambdaC, x.bt, x.pared, x.ratio, `${x.ecuacion} ${x.verifica ? '✓' : '✗'}`]), [0, 0, 1, 1, 0, 0, 2, 1, 0, 2, 0]),
        ...(paredes.length ? [h('p', { class: 'nota chica' }, `${paredes.length} barra${paredes.length > 1 ? 's' : ''} con la pared no compacta o esbelta: conviene un tubo de pared más gruesa.`)] : []));
      c.append(sec.el);
    }
    // viento de cuarto: 0,71·A + 0,71·B en las columnas de las esquinas (lo que se descubrió en el Citicorp en 1978)
    const dA = datosExo('A', def), dB = datosExo('B', def);
    if (dA && dB) {
      const reg = !!vientoReglamento(), fOb = reg ? 0.75 : Math.SQRT1_2;
      const filas = vientoDeCuarto(dA.r, dB.r, fOb).filter(x => x.NA + x.NB > 1e-6);
      if (filas.length) {
        const peor = filas.reduce((m, x) => (x.N45 > m.N45 ? x : m), filas[0]);
        const sec = seccion('Vientos oblicuos (de cuarto, «quartering»)',
          h('p', { class: 'nota' }, reg
            ? 'CIRSOC 102-25, Fig. 2.4-8: caso 3, el 75 % de los dos vientos a la vez (0,75·A + 0,75·B); caso 4, el 56,3 % de los dos con sus torsiones. Las columnas de las esquinas son de dos caras: suman las dos partes. Las combinaciones oblicuas ya están en la verificación del CIRSOC 301 de arriba (columna «combinación»). La tabla muestra el caso 3.'
            : 'Viento a 45°: cada cara recibe 0,71 (cos 45°) del viento de frente y las dos direcciones actúan a la vez: 0,71·A + 0,71·B. Las columnas de las esquinas son de dos caras: suman las dos partes. Así se revisó el Citicorp en 1978. Ya está en la verificación de arriba (1,2 D + 1,6 W · a 45°).'),
          tablaValores(['desde z (m)', 'N esquina, viento A (t)', 'N esquina, viento B (t)', reg ? 'N caso 3 (t)' : 'N a 45° (t)', 'oblicuo / frente'], filas.slice().reverse().map(x => [x.z, x.NA, x.NB, x.N45, x.razon]), [2, 0, 0, 0, 2]),
          h('p', { class: 'nota chica' }, `Peor tramo: desde ${fmt(peor.z, 2)} m, ${fmt(peor.N45, 0)} t ${reg ? 'en el caso 3' : 'a 45°'} contra ${fmt(Math.max(peor.NA, peor.NB), 0)} t de frente (× ${fmt(peor.razon, 2)}). Peor esquina, con los dos vientos en el sentido que suma; las diagonales de cada cara toman ${reg ? '0,75' : '0,71'} de lo de frente.`));
        c.append(sec.el);
      }
    }
  }
}

// ------------------------------------------------------------------ dibujo
export function dibujoExo(d: DatosExo, tam: Tam): SVGSVGElement {
  const W = Math.max(860, Math.min(1300, tam.ancho ?? 1000)), H = 680;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'grafico exo-dibujo', role: 'img', 'aria-label': `Exoesqueleto, viento ${d.dir}` }) as SVGSVGElement;
  svg.append(el('rect', { x: 0, y: 0, width: W, height: H, class: 'ex-fondo' }));
  const r = d.r, cara = r.caras[0], zs = r.zs, z0 = zs[0], zT = zs[zs.length - 1];
  // ---- alzado de la cara (izquierda)
  const x0 = 70, y0 = 70, alto = H - 170, anchoAl = Math.min(W * 0.42, 460);
  const k = Math.min(alto / (zT - z0), (anchoAl - 60) / d.ancho);
  const X = (s: number) => x0 + anchoAl / 2 + s * k, Y = (z: number) => y0 + alto - (z - z0) * k;
  svg.append(el('text', { x: 16, y: 28, class: 'ex-titulo' }, `${d.def.tipo === 'F' ? 'Plano de los brazos (por el núcleo)' : 'Cara paralela al viento'} ${d.dir} · flujo de fuerzas (${TIPOS_EXO[d.def.tipo].nombre})`));
  // fachada de la torre (gris) detrás
  const sTorre = d.ancho / 2 - d.def.separacion;
  svg.append(el('rect', { x: X(-sTorre), y: Y(zT), width: 2 * sTorre * k, height: (zT - z0) * k, class: 'ex-torre' }));
  zs.forEach(z => svg.append(el('line', { x1: X(-sTorre), x2: X(sTorre), y1: Y(z), y2: Y(z), class: 'ex-losa' })));
  const Nmax = Math.max(...cara.esfuerzos.map(e => Math.abs(e.N)), 1e-9);
  const P = { X, Y, k };
  const propsDe = (e: EsfuerzoBarra) => propsBarra(e);
  // escala de las tensiones: la máxima de la cara (en las dos fibras, a lo largo de cada barra), sin pasar la admisible
  const sMax = Math.max(...cara.esfuerzos.flatMap(e => [0, 0.25, 0.5, 0.75, 1].flatMap(t => { const f = sigmaFibras(e, propsDe(e), t); return [Math.abs(f.sup), Math.abs(f.inf)]; })), 1e-9);
  const escalaS = Math.min(sMax, d.def.sigmaAdm);
  if (modo === 'M') capaMomentos(svg, cara.esfuerzos, P);
  else if (modo === 'Q') capaCortes(svg, cara.esfuerzos, P);
  // barras: en «N» el color es tracción o compresión y el grosor según |N|; en «σ», las dos fibras extremas con su tensión
  const defsF = el('defs'); svg.append(defsF);
  cara.esfuerzos.forEach(e => {
    const props = propsDe(e);
    const mMax = maxBarra(t => esfuerzosEn(e, t).M).v;
    const tit = e.nucleo ? `${e.id} · núcleo de tabiques (no es del exo) · M = ${fmt(Math.max(Math.abs(e.Ma), Math.abs(e.Mb)), 0)} tm en este plano` : `${e.id} · ${e.clase} · N = ${fmt(e.N, 1)} t (${e.N >= 0 ? 'tracción' : 'compresión'}) · M máx = ${fmt(mMax, 2)} tm · uniones ${e.relA ? 'articulada' : 'rígida'} / ${e.relB ? 'articulada' : 'rígida'} · L = ${fmt(e.L)} m · tocá para ver el detalle`;
    const g = el('g', { class: `ex-g-barra${barraSel === e.id ? ' elegida' : ''}${(e.fraccion ?? 1) !== 1 ? ' ala' : ''}`, 'data-id': e.id });
    if (modo === 'sigma' && !e.nucleo) capaFibras(g, e, props, d.def.sigmaAdm, escalaS, P, defsF);
    else {
      const w = modo === 'N' ? 1.2 + 6 * Math.abs(e.N) / Nmax : 1.6;
      g.append(el('line', { x1: X(e.a.s), y1: Y(e.a.z), x2: X(e.b.s), y2: Y(e.b.z), class: e.nucleo ? 'ex-barra nucleo' : modo === 'N' ? `ex-barra ${e.N >= 0 ? 'traccion' : 'compresion'} ${e.clase}` : 'ex-barra neutra', 'stroke-width': w.toFixed(1) }));
    }
    // zona de toque más ancha que la barra
    g.append(el('line', { x1: X(e.a.s), y1: Y(e.a.z), x2: X(e.b.s), y2: Y(e.b.z), class: 'ex-toque' }));
    g.append(el('title', {}, tit));
    if (!e.nucleo) g.addEventListener('click', () => { barraSel = barraSel === e.id ? null : e.id; estado.avisarPanel(); });
    svg.append(g);
  });
  // articulaciones: si en un nudo todas las barras llegan articuladas, un solo círculo en el nudo; si no, uno por barra
  const enNudo = new Map<string, { x: number; y: number; total: number; libres: number }>();
  cara.esfuerzos.forEach(e => (['a', 'b'] as const).forEach(k => { const q = e[k], key = `${q.s.toFixed(3)},${q.z.toFixed(3)}`, x = enNudo.get(key) ?? { x: X(q.s), y: Y(q.z), total: 0, libres: 0 }; x.total++; if (k === 'a' ? e.relA : e.relB) x.libres++; enNudo.set(key, x); }));
  enNudo.forEach(v => { if (v.libres >= 2 && v.libres === v.total) svg.append(el('circle', { cx: v.x, cy: v.y, r: 3.6, class: 'ex-pin' })); });
  cara.esfuerzos.forEach(e => pines(svg, e, P, q => { const v = enNudo.get(`${q.s.toFixed(3)},${q.z.toFixed(3)}`)!; return v.libres >= 2 && v.libres === v.total; }));
  // agregar barras: se tocan dos nudos
  if (agregando) {
    const vistos = new Set<string>();
    cara.esfuerzos.forEach(e => [e.a, e.b].forEach(q => {
      const key = `${q.s.toFixed(3)},${q.z.toFixed(3)}`; if (vistos.has(key)) return; vistos.add(key);
      const elegido = nudoA && Math.abs(nudoA[0] - q.s) < 1e-3 && Math.abs(nudoA[1] - q.z) < 1e-3;
      const c = el('circle', { cx: X(q.s), cy: Y(q.z), r: 7, class: `ex-nudo-toque${elegido ? ' elegido' : ''}` });
      c.append(el('title', {}, `nudo (${fmt(q.s, 2)}; ${fmt(q.z, 2)})`));
      c.addEventListener('click', ev => {
        ev.stopPropagation();
        const pt: [number, number] = [+q.s.toFixed(4), +q.z.toFixed(4)];
        if (!nudoA) { nudoA = pt; estado.avisarPanel(); return; }
        if (Math.abs(nudoA[0] - pt[0]) < 1e-3 && Math.abs(nudoA[1] - pt[1]) < 1e-3) { nudoA = null; estado.avisarPanel(); return; }
        const a = nudoA, clase = agregando!; nudoA = null;
        estado.cambiar(() => { const x = estado.proyecto.exo; if (x) x.nuevas = [...(x.nuevas ?? []), { clase, a, b: pt }]; });
        const m = document.getElementById('mensaje'); if (m) m.textContent = `Barra nueva (${clase}) de (${fmt(a[0], 2)}; ${fmt(a[1], 2)}) a (${fmt(pt[0], 2)}; ${fmt(pt[1], 2)}). Tocá otro par de nudos, o otra vez «+ ${clase}» para terminar.`;
      });
      svg.append(c);
    }));
  }
  // base: empotramientos y reacciones verticales
  const xsR = cara.reacciones.map(q => X(q.s)).sort((u, v) => u - v);
  cara.reacciones.forEach(q => {
    const x = X(q.s), y = Y(z0), dy = xsR.indexOf(x) % 2 && xsR.some(o => o !== x && Math.abs(o - x) < 70) ? 14 : 0;
    if ((d.def.uniones?.base ?? 'empotrada') === 'articulada') { svg.append(el('path', { d: `M${x - 9},${y + 11} h18 l-9,-10 z`, class: 'ex-apoyo' })); svg.append(el('circle', { cx: x, cy: y, r: 3, class: 'ex-pin' })); }
    else svg.append(el('rect', { x: x - 11, y: y + 1, width: 22, height: 6, class: 'ex-apoyo' }));
    svg.append(el('text', { x, y: y + 24 + dy, class: `ex-valor ${q.V >= 0 ? 'compresion' : 'traccion'}`, 'text-anchor': 'middle' }, `${q.V >= 0 ? '↑' : '↓'} ${fmt(Math.abs(q.V), 0)} t`));
  });
  // viento de cada piso que va al exo (flechas a la izquierda, sobre la losa)
  const Fm = Math.max(...r.Fexo.map(Math.abs), ...r.Ftab.map(Math.abs), 1e-9);
  r.Fexo.forEach((f, i) => {
    const y = Y(zs[i + 1]), L = (Math.abs(f) / Fm) * 38, xi = X(-d.ancho / 2) - 6;
    if (L < 1) return;
    svg.append(el('line', { x1: f >= 0 ? xi - L : xi, y1: y, x2: f >= 0 ? xi : xi - L, y2: y, class: 'ex-viento', 'marker-end': 'url(#ex-pv)' }));
  });
  const defs = el('defs'); const mk = el('marker', { id: 'ex-pv', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' });
  mk.append(el('path', { d: 'M0,1 L10,5 L0,9 z', class: 'ex-viento-punta' })); defs.append(mk); svg.prepend(defs);
  svg.append(el('text', { x: X(-d.ancho / 2) - 50, y: Y(zT) - 10, class: 'ex-nota', 'text-anchor': 'middle' }, 'viento que toma el exo'));
  // leyenda
  const ly = H - 44;
  leyendaModo(svg, 16, ly, escalaS);
  const pie = modo === 'N' ? `Grosor ∝ |N| (máx. ${fmt(Nmax, 0)} t).` : modo === 'M' ? 'M del lado de la fibra traccionada; cruza el eje donde cambia de signo.' : modo === 'Q' ? 'Q constante en cada tramo (cargas solo en los nudos).' : `σ = N/A ± M/W en las dos caras de cada barra. Escala: la tensión máxima de la cara (${fmt(escalaS / d.def.sigmaAdm * 100, 0)} % de σ adm = ${fmt(d.def.sigmaAdm / 10, 0)} kg/cm²); trazo grueso: pasa la admisible.`;
  svg.append(el('text', { x: 16, y: H - 20, class: 'ex-nota' }, `${pie}${modo === 'sigma' ? '' : ` Ancho de la cara ${fmt(d.ancho)} m, módulo ${d.def.modulo} pisos. Reacciones de la base en t.`}`));
  // ---- gráficos a la derecha: reparto del viento y deformada
  const gx = x0 + anchoAl + 60, gw = (W - gx - 40) / 2 - 24;
  const graf = (xg: number, titulo: string, series: { v: number[]; clase: string; nombre: string }[], unidad: string, barras = false) => {
    titulo.split('\n').forEach((t, i) => svg.append(el('text', { x: xg, y: 48 + i * 15, class: 'ex-subtitulo' }, t)));
    const vmax = Math.max(...series.flatMap(s => s.v.map(Math.abs)), 1e-9), vmin = Math.min(0, ...series.flatMap(s => s.v));
    const Xg = (v: number) => xg + ((v - vmin) / (vmax - vmin || 1)) * gw;
    svg.append(el('line', { x1: Xg(0), x2: Xg(0), y1: Y(z0), y2: Y(zT), class: 'ex-eje' }));
    svg.append(el('line', { x1: xg, x2: xg + gw, y1: Y(z0), y2: Y(z0), class: 'ex-eje' }));
    series.forEach((s, si) => {
      if (barras) s.v.forEach((v, i) => svg.append(el('rect', { x: Math.min(Xg(0), Xg(v)), y: Y(zs[i + 1]) - 3 + si * 3, width: Math.abs(Xg(v) - Xg(0)), height: 3, class: `ex-serie ${s.clase}` })));
      else svg.append(el('polyline', { points: [[0, z0], ...s.v.map((v, i) => [v, zs[i + 1]])].map(([v, z]) => `${Xg(v).toFixed(1)},${Y(z).toFixed(1)}`).join(' '), class: `ex-linea ${s.clase}` }));
      svg.append(el('rect', { x: xg, y: Y(z0) + 30 + si * 16, width: 12, height: 6, class: `ex-serie ${s.clase}` }));
      svg.append(el('text', { x: xg + 16, y: Y(z0) + 36 + si * 16, class: 'ex-nota' }, s.nombre));
    });
    svg.append(el('text', { x: xg + gw, y: Y(z0) + 16, class: 'ex-nota', 'text-anchor': 'end' }, `${fmt(vmax, unidad === 'mm' ? 1 : 1)} ${unidad}`));
  };
  graf(gx, 'Viento de cada piso:\nquién lo toma', [{ v: r.Ftab, clase: 'tab', nombre: 'tabiques' }, { v: r.Fexo, clase: 'exo', nombre: 'exoesqueleto' }], 't', true);
  const conSin = r.uSin.every(x => isFinite(x));
  // métodos CIRSOC y FEM: el corrimiento con el viento de servicio contra h/límite de deriva (lo que controla el panel)
  const wR = vientoReglamento(), rel = wR ? wR.servicio.relacion : 1;
  graf(gx + gw + 48, wR ? 'Corrimiento de servicio\nde cada piso' : 'Corrimiento\nde cada piso', [...(conSin ? [{ v: r.uSin.map(x => x * rel * 1000), clase: 'sin', nombre: 'sin exo' }] : []), { v: r.u.map(x => x * rel * 1000), clase: 'con', nombre: conSin ? 'con exo' : 'con exo (sin exo no hay tabiques arriba)' }], 'mm');
  const nLim = wR ? datos201De(estado.proyecto).limiteDeriva : d.def.limiteH ?? 500, lim = (d.h / nLim) * 1000, xs0 = gx + gw + 48, vmx = Math.max(...(conSin ? r.uSin : r.u).map(x => x * rel * 1000), lim);
  const xl = xs0 + (lim / vmx) * gw;
  svg.append(el('line', { x1: xl, x2: xl, y1: Y(z0), y2: Y(zT), class: 'ex-limite' }));
  svg.append(el('text', { x: xl - 3, y: Y(zT) + 14, class: 'ex-nota', 'text-anchor': 'end' }, `h/${nLim} = ${fmt(lim, 0)} mm`));
  return svg;
}

export function centroExo(c: H, tam: Tam) {
  if (!estado.proyecto.exo) {
    c.append(h('div', { class: 'tarjeta-vacia' }, h('h3', {}, 'Sin exoesqueleto'), h('p', { class: 'nota' }, 'Tildá «Agregar un exoesqueleto» en el panel de la izquierda para ver cómo cambia la torre: la flecha, el reparto del viento y los esfuerzos de cada barra.'),
      h('div', { class: 'fila-acciones' }, ...(['D', 'B', 'C', 'A', 'E', 'F', 'L'] as TipoExo[]).map(t => { const b = h('button', { type: 'button' }, `${t} · ${TIPOS_EXO[t].nombre}`); b.addEventListener('click', () => estado.cambiar(() => { estado.proyecto.exo = { ...structuredClone(EXO_POR_DEFECTO), tipo: t }; })); return b; }))));
    return;
  }
  // vista: el alzado de una cara (con los diagramas) o el diseñador 3D de las cuatro caras
  const segV = h('div', { class: 'seg', role: 'group', 'aria-label': 'Vista del exoesqueleto' });
  ([['alzado', 'Alzado de una cara', 'El flujo de fuerzas, los diagramas y el detalle de cada barra'], ['3d', 'Diseño 3D', 'Las cuatro caras alrededor de las losas: zonas en altura, plantillas, pintar secciones y agregar barras tocando la torre']] as const).forEach(([v, t, ti]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(vistaExo === v), title: ti }, t);
    b.addEventListener('click', () => { vistaExo = v; estado.avisarPanel(); });
    segV.append(b);
  });
  c.append(h('div', { class: 'fila-acciones' }, segV));
  if (vistaExo === '3d') { c.append(disenadorExo3D()); return; }
  const d = datosExo();
  if (!d) { c.append(h('p', { class: 'error' }, ultimoError ? `No se pudo calcular: ${ultimoError} Revisá las uniones o las barras sacadas (Ctrl+Z vuelve atrás).` : 'No se pudo calcular el exoesqueleto con estos datos (¿faltan niveles sobre PB?).')); return; }
  c.append(h('p', { class: 'nota' }, `${TIPOS_EXO[d.def.tipo].nombre}: ${TIPOS_EXO[d.def.tipo].texto} Tocá una barra para ver sus diagramas de N, Q y M y la tensión en su sección.`));
  const seg = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Qué se ve en el alzado' });
  MODOS.forEach(([m, t, ayuda]) => { const b = h('button', { type: 'button', 'aria-pressed': String(modo === m), title: ayuda }, t); b.addEventListener('click', () => { modo = m; estado.avisarPanel(); }); seg.append(b); });
  const segAg = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Agregar barras' });
  (['diagonal', 'viga', 'columna'] as const).forEach(k => {
    const b = h('button', { type: 'button', 'aria-pressed': String(agregando === k), title: `Agregar una ${k}: tocá dos nudos del alzado` }, `+ ${k}`);
    b.addEventListener('click', () => { agregando = agregando === k ? null : k; nudoA = null; estado.avisarPanel(); });
    segAg.append(b);
  });
  const nNuevas = d.def.nuevas?.length ?? 0;
  const bBorrarN = h('button', { type: 'button' }, `Sacar las ${nNuevas} barras agregadas`);
  bBorrarN.addEventListener('click', () => { estado.cambiar(() => { if (estado.proyecto.exo) delete estado.proyecto.exo.nuevas; }); });
  c.append(h('div', { class: 'fila-acciones' }, seg, segAg, ...(nNuevas ? [bBorrarN] : [])),
    h('p', { class: 'nota chica' }, agregando ? (nudoA ? `Tocá el segundo nudo de la ${agregando} (o el mismo para soltarlo).` : `Agregar ${agregando}: tocá el primer nudo (los círculos). Vale para las dos caras; tocá de nuevo el botón para terminar.`) : MODOS.find(x => x[0] === modo)![2]));
  c.append(dibujoExo(d, tam));
  const cara = d.r.caras[0], e = cara?.esfuerzos.find(x => x.id === barraSel);
  if (barraSel && !e) barraSel = null;
  if (e) {
    const sec = e.sec;
    const ctl = d.r.controles.find(x => x.cara === cara.nombre && x.id === e.id);
    const cerrar = h('button', { type: 'button' }, 'Cerrar');
    cerrar.addEventListener('click', () => { barraSel = null; estado.avisarPanel(); });
    c.append(h('section', { class: 'tarjeta exo-detalle' }, h('div', { class: 'fila-acciones' }, h('b', {}, `Barra ${e.id} · ${e.clase} · ${cara.nombre}`), ctl ? chip(ctl.estado === 'verifica' ? 'verifica' : 'no verifica') : '', cerrar),
      editorBarra(e), detalleBarra(e, propsBarra(e), sec, d.def)));
  }
  const n = d.r.u.length;
  c.append(seccion('Piso por piso', tablaValores(['Nivel', 'viento (t)', 'tabiques (t)', 'exo (t)', 'M tabiques (tm)', 'M sin exo (tm)', 'δ con exo (mm)', 'δ sin exo (mm)'],
    d.niveles.map((nv, i) => [nv, d.r.Ftab[i] + d.r.Fexo[i], d.r.Ftab[i], d.r.Fexo[i], d.r.Mtab[i + 1] ?? 0, d.r.Msin[i + 1] ?? 0, d.r.u[i] * 1000, d.r.uSin[i] * 1000]).reverse(), [0, 2, 2, 2, 0, 0, 1, 1])).el);
  void n; void chip;
}

// ------------------------------------------------------------------ detalle de una barra
/**
 * La barra estirada en horizontal (de a a b) con sus diagramas de N, Q y M, y a la derecha su sección en el extremo
 * más cargado con la tensión de las fibras: σ = N/A ± M/W, lineal de una cara a la otra (eje neutro donde σ = 0).
 */
export function detalleBarra(e: EsfuerzoBarra, p: { A: number; I: number; W: number; i: number }, sec: { b: number; e: number }, def: ExoDef): SVGSVGElement {
  const W = 940, H = 370;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'grafico exo-dibujo exo-barra-detalle', role: 'img', 'aria-label': `Barra ${e.id}: N, Q, M y tensión en las fibras` }) as SVGSVGElement;
  svg.append(el('rect', { x: 0, y: 0, width: W, height: H, class: 'ex-fondo' }));
  const x0 = 140, x1 = 520, Xb = (t: number) => x0 + (x1 - x0) * t;
  const fila = (y: number, nombre: string, unidad: string, v: (t: number) => number, clase: string, kmax: number, dec: number) => {
    svg.append(el('text', { x: 16, y: y + 4, class: 'ex-subtitulo' }, nombre));
    svg.append(el('text', { x: 16, y: y + 18, class: 'ex-nota' }, unidad));
    svg.append(el('line', { x1: x0, y1: y, x2: x1, y2: y, class: 'ex-eje' }));
    const k = 26 / Math.max(kmax, 1e-9), n = 40, pts: string[] = [`${x0},${y}`];
    for (let i = 0; i <= n; i++) pts.push(`${Xb(i / n).toFixed(1)},${(y - v(i / n) * k).toFixed(1)}`);
    pts.push(`${x1},${y}`);
    svg.append(el('polygon', { points: pts.join(' '), class: clase }));
    const va = v(0), vb = v(1);
    svg.append(el('text', { x: x0 - 6, y: y - va * k + 4, class: 'ex-valor', 'text-anchor': 'end' }, fmt(va, dec)));
    svg.append(el('text', { x: x1 + 6, y: y - vb * k + 4, class: 'ex-valor' }, fmt(vb, dec)));
    // un máximo adentro de la barra (con carga repartida): se rotula
    const mx = maxBarra(v);
    if (mx.t > 0.02 && mx.t < 0.98 && Math.abs(mx.v) > 1.02 * Math.max(Math.abs(va), Math.abs(vb))) svg.append(el('text', { x: Xb(mx.t), y: y - mx.v * k + (mx.v >= 0 ? -6 : 14), class: 'ex-valor', 'text-anchor': 'middle' }, fmt(mx.v, dec)));
  };
  const M = (t: number) => esfuerzosEn(e, t).M;
  // nombre de cada cara de la barra en el alzado: la +y local es la de la izquierda de a→b (con z hacia arriba)
  const L0 = Math.hypot(e.b.s - e.a.s, e.b.z - e.a.z) || 1, ns = -(e.b.z - e.a.z) / L0, nz = (e.b.s - e.a.s) / L0;
  const cara = (lado: 1 | -1) => { const a = ns * lado, b = nz * lado; return Math.abs(b) >= Math.abs(a) ? (b > 0 ? 'la cara de arriba' : 'la cara de abajo') : (a < 0 ? 'la cara izquierda' : 'la cara derecha'); };
  svg.append(el('text', { x: x0, y: 22, class: 'ex-nota' }, `extremo a (${fmt(e.a.s, 2)}; ${fmt(e.a.z, 2)})`));
  svg.append(el('text', { x: x1, y: 22, class: 'ex-nota', 'text-anchor': 'end' }, `extremo b (${fmt(e.b.s, 2)}; ${fmt(e.b.z, 2)}) · L = ${fmt(e.L, 2)} m`));
  svg.append(el('line', { x1: x0, y1: 36, x2: x1, y2: 36, class: `ex-barra ${e.N >= 0 ? 'traccion' : 'compresion'}`, 'stroke-width': 5 }));
  const Nf = (t: number) => esfuerzosEn(e, t).N, Vf = (t: number) => esfuerzosEn(e, t).V;
  fila(92, 'N', 't (+ tracción)', Nf, `ex-area-n ${e.N >= 0 ? 'traccion' : 'compresion'}`, Math.abs(maxBarra(Nf).v), 1);
  fila(170, 'Q', 't', Vf, 'ex-corte pos', Math.abs(maxBarra(Vf).v), 2);
  fila(258, 'M', `tm (+: tracciona ${cara(-1)})`, M, 'ex-momento', Math.abs(maxBarra(M).v), 2);
  cerosDeM(e).forEach(t => { svg.append(el('circle', { cx: Xb(t), cy: 258, r: 3, class: 'ex-cero' })); svg.append(el('text', { x: Xb(t), y: 274, class: 'ex-nota', 'text-anchor': 'middle' }, `M = 0 a ${fmt(t * e.L, 2)} m`)); });
  if (e.qa || e.qb || e.pa || e.pb) svg.append(el('text', { x: x0, y: 54, class: 'ex-nota' }, `carga repartida: q⊥ ${fmt(e.qa, 3)} → ${fmt(e.qb, 3)} t/m · p∥ ${fmt(e.pa, 3)} → ${fmt(e.pb, 3)} t/m (peso propio${e.qa !== e.qb ? ' y viento' : ''})`));
  [['a', e.relA, x0], ['b', e.relB, x1]].forEach(([, rel, x]) => { if (rel) svg.append(el('circle', { cx: x as number, cy: 36, r: 5, class: 'ex-pin' })); });
  // sección donde la tensión es máxima (a lo largo de la barra): tensión lineal entre la cara +y y la −y
  const tCrit = maxBarra(t => { const f = esfuerzosEn(e, t); return Math.abs(f.N) / p.A + Math.abs(f.M) / p.W; }).t, fc = esfuerzosEn(e, tCrit), Mc = fc.M;
  const sSup = fc.N / p.A - Mc / p.W, sInf = fc.N / p.A + Mc / p.W, adm = def.sigmaAdm;
  const cx = 640, cy = 70, hS = 200, bS = 40;
  svg.append(el('text', { x: cx - 30, y: 22, class: 'ex-subtitulo' }, `Sección más cargada (a ${fmt(tCrit * e.L, 2)} m de a)`));
  svg.append(el('text', { x: cx - 30, y: 38, class: 'ex-nota' }, `tubo ${fmt(sec.b * 1000, 0)} × ${fmt(sec.e * 1000, 1)} mm · A = ${fmt(p.A * 1e4, 0)} cm² · W = ${fmt(p.W * 1e6, 0)} cm³`));
  // tubo en corte (hueco) a escala de la altura
  svg.append(el('rect', { x: cx - 30, y: cy, width: bS, height: hS, class: 'ex-seccion' }));
  const ee = Math.max(2, (sec.e / sec.b) * hS);
  svg.append(el('rect', { x: cx - 30 + ee, y: cy + ee, width: bS - 2 * ee, height: hS - 2 * ee, class: 'ex-fondo' }));
  // diagrama de tensiones al costado
  // escala: la mayor de las dos fibras; la admisible se marca solo si entra en el dibujo
  const sM = Math.max(Math.abs(sSup), Math.abs(sInf), 1e-9), xs = cx + 150, ks = 80 / sM, Xs = (s: number) => xs + s * ks;
  svg.append(el('line', { x1: xs, y1: cy - 6, x2: xs, y2: cy + hS + 6, class: 'ex-eje' }));
  svg.append(el('text', { x: xs, y: cy - 10, class: 'ex-nota', 'text-anchor': 'middle' }, 'σ = 0'));
  if (adm <= sM * 1.25) for (const sg of [-adm, adm]) { svg.append(el('line', { x1: Xs(sg), y1: cy - 6, x2: Xs(sg), y2: cy + hS + 6, class: 'ex-limite' })); svg.append(el('text', { x: Xs(sg), y: cy + hS + 20, class: 'ex-nota', 'text-anchor': 'middle' }, `${sg < 0 ? '−' : '+'}${fmt(adm / 10, 0)}`)); }
  svg.append(el('text', { x: cx - 30, y: cy - 6, class: 'ex-nota' }, cara(1)));
  svg.append(el('text', { x: cx - 30, y: cy + hS + 16, class: 'ex-nota' }, cara(-1)));
  const n = 16;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, sm = sSup + (sInf - sSup) * (t0 + t1) / 2;
    svg.append(el('rect', { x: Math.min(xs, Xs(sm)), y: cy + t0 * hS, width: Math.abs(Xs(sm) - xs), height: hS / n + 0.3, style: `fill: ${colorSigma(sm, Math.max(Math.abs(sSup), Math.abs(sInf), 1e-9))}` }));
  }
  svg.append(el('line', { x1: Xs(sSup), y1: cy, x2: Xs(sInf), y2: cy + hS, class: 'ex-linea-sigma' }));
  svg.append(el('text', { x: Xs(sSup) + (sSup >= 0 ? 5 : -5), y: cy + 4, class: 'ex-valor', 'text-anchor': sSup >= 0 ? 'start' : 'end' }, `${fmt(sSup / 10, 0)} kg/cm²`));
  svg.append(el('text', { x: Xs(sInf) + (sInf >= 0 ? 5 : -5), y: cy + hS, class: 'ex-valor', 'text-anchor': sInf >= 0 ? 'start' : 'end' }, `${fmt(sInf / 10, 0)} kg/cm²`));
  if (sSup * sInf < 0) { const yn = cy + hS * (sSup / (sSup - sInf)); svg.append(el('line', { x1: cx - 36, y1: yn, x2: xs + 4, y2: yn, class: 'ex-neutro' })); svg.append(el('text', { x: cx - 38, y: yn + 4, class: 'ex-nota', 'text-anchor': 'end' }, 'eje neutro')); }
  svg.append(el('text', { x: cx - 30, y: H - 34, class: 'ex-nota' }, `σ = N/A ± M/W = ${fmt(fc.N / p.A / 10, 0)} ± ${fmt(Math.abs(Mc) / p.W / 10, 0)} kg/cm²`));
  svg.append(el('text', { x: cx - 30, y: H - 18, class: 'ex-nota' }, `máx |σ| = ${fmt(Math.max(Math.abs(sSup), Math.abs(sInf)) / 10, 0)} de ${fmt(adm / 10, 0)} kg/cm² (${fmt(Math.max(Math.abs(sSup), Math.abs(sInf)) / adm * 100, 0)} %)`));
  return svg;
}

/**
 * Editor barra por barra: uniones de cada extremo, sección (del catálogo) o sacarla. El cambio vale para la misma
 * barra en las dos caras y en los dos vientos (la ficha es una sola); se borra si cambia la ficha o el módulo.
 */
function editorBarra(e: EsfuerzoBarra) {
  const p = estado.proyecto, def = p.exo!;
  // con las diagonales arriostradas por las losas, el cambio vale para la diagonal entera (todos sus tramos)
  const idB = idBarra(e.id);
  const cam = def.barras?.[idB] ?? {};
  const poner = (f: (c: NonNullable<ExoDef['barras']>[string]) => void) => estado.cambiar(() => {
    const x = p.exo!; x.barras = { ...(x.barras ?? {}) }; const c = { ...(x.barras[idB] ?? {}) }; f(c);
    if (Object.keys(c).length) x.barras[idB] = c; else delete x.barras[idB];
    if (!Object.keys(x.barras).length) delete x.barras;
  });
  const sel = (etq: string, val: string, opciones: [string, string][], f: (v: string) => void) => {
    const s = h('select', {}) as HTMLSelectElement;
    opciones.forEach(([v, t]) => s.append(h('option', { value: v }, t)));
    s.value = val; s.addEventListener('change', () => f(s.value));
    return h('label', { class: 'campo-linea' }, etq, ' ', s);
  };
  const un: [string, string][] = [['rig', 'rígida'], ['art', 'articulada']];
  const tubos: [string, string][] = [['', `como su clase (${fmt(e.sec.b * 1000, 0)}×${fmt(e.sec.e * 1000, 1)})`], ...CATALOGO_TUBOS.map((t, i) => [String(i), `${fmt(t.b * 1000, 0)} × ${fmt(t.e * 1000, 1)} mm`] as [string, string])];
  const iSec = cam.sec ? CATALOGO_TUBOS.findIndex(t => t.b === cam.sec!.b && t.e === cam.sec!.e) : -1;
  const quitar = h('button', { type: 'button', class: 'peligro' }, 'Sacar la barra');
  quitar.addEventListener('click', () => { poner(c => { c.quitar = true; }); barraSel = null; });
  const volver = h('button', { type: 'button' }, 'Como estaba');
  volver.addEventListener('click', () => poner(c => { delete c.relA; delete c.relB; delete c.sec; delete c.quitar; }));
  // repetir en cada módulo y simétrica: las barras equivalentes (corridas un número entero de módulos en altura, o
  // reflejadas respecto del medio de la cara) reciben lo mismo; si la barra es agregada a mano, se agregan copias
  const d = datosExo(), cara = d?.r.caras[0], zs = d?.r.zs ?? [], m = Math.max(1, Math.round(def.modulo));
  const iz = (z: number) => zs.findIndex(q => Math.abs(q - z) < 1e-3);
  const centro = (z: number) => { const ns = (cara?.esfuerzos ?? []).flatMap(x => [x.a, x.b]).filter(q => Math.abs(q.z - z) < 1e-3).map(q => q.s); return ns.length ? (Math.min(...ns) + Math.max(...ns)) / 2 : 0; };
  const mismo = (a: { s: number; z: number }, b: { s: number; z: number }) => Math.abs(a.s - b.s) < 1e-3 && Math.abs(a.z - b.z) < 1e-3;
  const corridas = (): { a: [number, number]; b: [number, number] }[] => {
    // la barra entera se corre la altura de j módulos, medida desde el extremo que cae en un piso (el otro puede ser un
    // nudo a media altura, como el cruce de una X); si ninguno cae en un piso, con la altura media de los pisos
    const out: { a: [number, number]; b: [number, number] }[] = [], k0 = iz(e.a.z) >= 0 ? iz(e.a.z) : iz(e.b.z);
    const hp = zs.length > 1 ? (zs[zs.length - 1] - zs[0]) / (zs.length - 1) : 3, zMax = zs[zs.length - 1] ?? 0, zMin = zs[0] ?? 0;
    for (let j = -Math.ceil(zs.length / m); j <= Math.ceil(zs.length / m); j++) {
      if (!j) continue;
      const k = k0 + j * m;
      const dz = k0 >= 0 ? (k >= 0 && k < zs.length ? zs[k] - zs[k0] : NaN) : j * m * hp;
      if (!isFinite(dz)) continue;
      const za = e.a.z + dz, zb = e.b.z + dz;
      if (Math.min(za, zb) < zMin - 1e-6 || Math.max(za, zb) > zMax + 1e-6) continue;
      out.push({ a: [e.a.s, za], b: [e.b.s, zb] });
    }
    return out;
  };
  const espejo = (): { a: [number, number]; b: [number, number] } => ({ a: [2 * centro(e.a.z) - e.a.s, e.a.z], b: [2 * centro(e.b.z) - e.b.s, e.b.z] });
  const aplicar = (destinos: { a: [number, number]; b: [number, number] }[], texto: string) => {
    const nueva = idB.startsWith('N');
    let n = 0;
    estado.cambiar(() => {
      const x = p.exo!;
      if (nueva) {
        const ya = (q: { a: [number, number]; b: [number, number] }) => (x.nuevas ?? []).some(nb => (mismo({ s: nb.a[0], z: nb.a[1] }, { s: q.a[0], z: q.a[1] }) && mismo({ s: nb.b[0], z: nb.b[1] }, { s: q.b[0], z: q.b[1] })) || (mismo({ s: nb.a[0], z: nb.a[1] }, { s: q.b[0], z: q.b[1] }) && mismo({ s: nb.b[0], z: nb.b[1] }, { s: q.a[0], z: q.a[1] })));
        const orig = (x.nuevas ?? [])[+idB.slice(1) - 1];
        const nuevos = destinos.filter(q => !ya(q)).map(q => ({ ...orig, clase: e.clase, a: q.a, b: q.b }));
        n = nuevos.length; x.nuevas = [...(x.nuevas ?? []), ...nuevos];
      } else {
        // las barras de la ficha que caen en los destinos reciben el mismo cambio
        const c0 = x.barras?.[idB];
        if (!c0) return;
        x.barras = { ...(x.barras ?? {}) };
        // con pisos de distinta altura el nudo a media altura (el cruce de una X) no cae justo: se busca la barra de la
        // misma clase más cercana a los dos extremos, a menos de media altura de piso en z y casi en el mismo s
        const hp = zs.length > 1 ? (zs[zs.length - 1] - zs[0]) / (zs.length - 1) : 3;
        const dist = (y: EsfuerzoBarra, q: { a: [number, number]; b: [number, number] }) => {
          const dd = (u: { s: number; z: number }, v: [number, number]) => (Math.abs(u.s - v[0]) < 0.05 && Math.abs(u.z - v[1]) < 0.6 * hp ? Math.abs(u.z - v[1]) : Infinity);
          return Math.min(dd(y.a, q.a) + dd(y.b, q.b), dd(y.a, q.b) + dd(y.b, q.a));
        };
        for (const q of destinos) {
          let f: EsfuerzoBarra | undefined, dMin = Infinity;
          for (const y of cara?.esfuerzos ?? []) { if (y.clase !== e.clase || idBarra(y.id) === idB) continue; const dv = dist(y, q); if (dv < dMin) { dMin = dv; f = y; } }
          if (f && isFinite(dMin) && !x.barras[idBarra(f.id)]) { x.barras[idBarra(f.id)] = { ...c0 }; n++; }
        }
      }
    });
    const msg = document.getElementById('mensaje'); if (msg) msg.textContent = n ? `${texto}: ${n} barra${n === 1 ? '' : 's'}. Ctrl+Z deshace.` : `${texto}: no hay barras equivalentes${nueva ? ' nuevas' : ' (cambiá primero la sección, las uniones o sacala)'}.`;
  };
  const rep = h('button', { type: 'button', title: 'Lo mismo en esta posición de todos los módulos, de abajo arriba' }, '↕ Repetir en cada módulo');
  rep.addEventListener('click', () => aplicar(corridas(), 'Repetida en cada módulo'));
  const sim = h('button', { type: 'button', title: 'Lo mismo en la barra reflejada respecto del medio de la cara' }, '⇆ Simétrica');
  sim.addEventListener('click', () => aplicar([espejo()], 'Simétrica'));
  return h('div', { class: 'fila-acciones exo-editor' },
    rep, sim,
    sel('Unión en a', e.relA ? 'art' : 'rig', un, v => poner(c => { c.relA = v === 'art'; })),
    sel('Unión en b', e.relB ? 'art' : 'rig', un, v => poner(c => { c.relB = v === 'art'; })),
    sel('Sección', iSec >= 0 ? String(iSec) : '', tubos, v => poner(c => { if (v === '') delete c.sec; else c.sec = CATALOGO_TUBOS[+v]; })),
    quitar, ...(Object.keys(cam).length ? [volver] : []),
    h('span', { class: 'nota chica' }, idB !== e.id ? `Es un tramo de ${idB} entre dos losas: el cambio vale para la diagonal entera, en las dos caras y con los dos vientos. Si queda un mecanismo, la app avisa.` : 'Vale para esta barra en las dos caras y con los dos vientos. Si queda un mecanismo, la app avisa.'));
}

/**
 * Momento que les queda a los tabiques en cada cota con el exoesqueleto (para las fibras de la etapa 07 y la capa σ),
 * o undefined si no hay exo o se eligió ver los tabiques solos (como la planilla del curso).
 */
/**
 * ¿el exo entra en el cálculo? Solo con los métodos CIRSOC y FEM. Los de la cátedra (Planilla, Guía y la comparación,
 * que parte de la planilla) no tienen en cuenta estas estructuras: ahí el exo es un estudio aparte, que no cambia
 * ningún resultado (tabiques, flexocompresión, resumen, desglose ni el Excel).
 */
export function exoEnElCalculo(): boolean {
  const m = estado.config.metodo;
  return !!estado.proyecto.exo && (m === 'cirsoc' || m === 'fem');
}
export function momentoTabiques(dir: 'A' | 'B'): ((z: number) => number) | undefined {
  if (!exoEnElCalculo() || !estado.flexConExo) return undefined;
  const d = datosExo(dir);
  if (!d) return undefined;
  const zs = d.r.zs, M = d.r.Mtab;
  return (z: number) => { const k = zs.findIndex(q => Math.abs(q - z) < 1e-6); return k >= 0 ? M[k] : 0; };
}
