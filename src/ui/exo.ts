/**
 * Etapa 08 · Exoesqueleto: ficha y perfiles en el panel; en el centro, el alzado de una cara con el flujo de fuerzas
 * (barras en tracción en rojo y en compresión en azul, el grosor según |N|), los diagramas de M de columnas y vigas,
 * el reparto del viento entre tabiques y exoesqueleto piso por piso y la deformada con y sin exoesqueleto.
 */
import { estado, fmt } from './estado';
import { h, seccion, kpi, chip, colorEstado, type H, type EstadoChip } from './comp';
import { campo } from './paneles';
import { tablaValores, type Tam } from './diagramas';
import { calcularExo, vientoDeCuarto, cirsoc301, COMBOS_101_25, COMBOS_CURSO, COMBOS_OBLICUOS_101_25, COMBOS_OBLICUOS_CURSO, FY_F24, CATALOGO_TUBOS, propsBarra, dimensionarExo, esfuerzosEn, cerosDeM, UNIONES_POR_DEFECTO, EXO_POR_DEFECTO, pesoExo, TIPOS_EXO, propsSeccion, type EntradaExo, type EsfuerzoBarra, type ExoDef, type ResultadoExo, type TipoExo } from '../engine/exo';
import { datosAltura, moduloHormigon, rigidez, rigidezPorNivel } from '../engine/diagramas';
import { plantaDeNivel } from '../engine/silueta';
import type { PlanillaRes } from '../engine/planilla';
import type { Viento102 } from '../engine/cargas/cirsoc102';
import { datos201De } from '../engine/metodos/cirsoc';

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
  anchos?: number[]; ts?: number[] }

/** el cálculo del exoesqueleto para el viento elegido (null si el proyecto no tiene exo o faltan datos) */
/** lo que necesita el motor para un viento: pisos, viento de cada piso, rigidez de los tabiques y dónde van las caras */
export function entradaExo(dir: 'A' | 'B', def: ExoDef): EntradaExo | null {
  const d = datosExo(dir, def);
  if (!d) return null;
  return d.entrada;
}

export function datosExo(dir: 'A' | 'B' = estado.dir, def: ExoDef | null | undefined = estado.proyecto.exo): (DatosExo & { entrada: EntradaExo }) | null {
  if (!def) return null;
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
    const pl = plantaDeNivel(p, iPB);
    const A = dir === 'A';
    const ancho = (A ? pl.L : pl.B) + 2 * def.separacion, t = (A ? pl.B : pl.L) / 2 + def.separacion;
    // caras que siguen la planta de cada nivel (Hancock): ancho y posición de la cara en cada cota
    let anchos: number[] | undefined, ts: number[] | undefined;
    if (def.anchoVariable) {
      const plz = zs.map(z => { const i = p.niveles.findIndex(nv => Math.abs(nv.cota - z) < 1e-6); return plantaDeNivel(p, i >= 0 ? i : iPB); });
      anchos = plz.map(q => (A ? q.L : q.B) + 2 * def.separacion);
      ts = plz.map(q => (A ? q.B : q.L) / 2 + def.separacion);
    }
    const r = calcularExo(def, zs, W, EJ, ancho, [-t, t], E, anchos);
    const h0 = zs[zs.length - 1] - zPB;
    return { r, def, dir, ancho, tCaras: [-t, t], niveles: sobre.map(x => x.nivel), h: h0, Eh: E, anchos, ts, entrada: { zs, W, EJ, ancho, tCaras: [-t, t], Eh: E, h: h0, anchos } };
  } catch (err) { ultimoError = err instanceof Error ? err.message : String(err); return null; }
}
let ultimoError = '';

/** el viento del 102-25 si el método sigue las reglas del CIRSOC (CIRSOC o FEM); si no, null (el de la planilla o la guía) */
export function vientoReglamento(): Viento102 | null {
  const m = estado.config.metodo;
  return m === 'cirsoc' || m === 'fem' ? estado.calculo.fem?.viento ?? estado.calculo.cirsoc?.viento ?? null : null;
}
/** CIRSOC 301/302 de las barras de acero: con las combinaciones del 101-25 (métodos CIRSOC y FEM) o la del curso */
export function verif301(d: DatosExo & { entrada: EntradaExo }) {
  const en = d.entrada, reglamento = !!vientoReglamento();
  // vientos oblicuos (quartering): las columnas de esquina con los dos vientos a la vez
  const otro = datosExo(d.dir === 'A' ? 'B' : 'A', d.def)?.entrada;
  const combos = reglamento ? [...COMBOS_101_25, ...COMBOS_OBLICUOS_101_25] : [...COMBOS_CURSO, ...COMBOS_OBLICUOS_CURSO];
  return cirsoc301(d.def, en.zs, en.W, en.EJ, en.ancho, en.tCaras, en.Eh, en.anchos, FY_F24, { combos, costura: d.def.sinCostura ? false : true, otro });
}
/** desplazamiento de la azotea que se controla y su límite: con el viento de servicio y h/límite de deriva (CIRSOC) o h/500 (curso) */
export function flechaExo(d: DatosExo): { u: number; lim: number; texto: string } {
  const n = d.r.u.length - 1, w = vientoReglamento();
  if (w) { const limD = datos201De(estado.proyecto).limiteDeriva; return { u: d.r.u[n] * w.servicio.relacion, lim: d.h / limD, texto: `deriva de servicio (${fmt(w.servicio.relacion * 100, 0)} % del viento de cálculo) ≤ h/${limD}` }; }
  return { u: d.r.u[n], lim: d.h / (d.def.limiteH ?? 500), texto: `flecha ≤ h/${d.def.limiteH ?? 500}` };
}
export function estadoExo(): EstadoChip {
  if (!estado.proyecto.exo) return 'pendiente';
  const ds = (['A', 'B'] as const).map(d => datosExo(d));
  if (ds.some(d => !d)) return 'revisar';
  const reglamento = !!vientoReglamento() && estado.proyecto.exo.material !== 'hormigon';
  return ds.every(d => (reglamento ? verif301(d!).every(x => x.verifica) : d!.r.controles.every(c => c.estado === 'verifica')) && flechaExo(d!).u <= flechaExo(d!).lim) ? 'verifica' : 'no verifica';
}

// ------------------------------------------------------------------ panel
export function panelExo(c: H) {
  const p = estado.proyecto, def = p.exo;
  const set = (f: (d: ExoDef) => void) => estado.cambiar(() => { if (p.exo) f(p.exo); });
  const sw = h('label', { class: 'campo-linea' });
  const cb = h('input', { type: 'checkbox' }) as HTMLInputElement; cb.checked = !!def;
  cb.addEventListener('change', () => estado.cambiar(() => { p.exo = cb.checked ? structuredClone(EXO_POR_DEFECTO) : null; }));
  sw.append(cb, ' Agregar un exoesqueleto de acero por fuera de la fachada');
  c.append(h('p', { class: 'nota' }, 'Una estructura de acero por fuera que trabaja junto con los tabiques: las losas las atan y cada una toma el viento según su rigidez, como dos resortes en paralelo.'), sw);
  if (!def) return;
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
      kpi('J equivalente de cada cara', `${fmt(d.r.caras[0]?.Jeq ?? 0, 1)} m⁴`, 'para la rototraslación'),
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
    c.append(h('div', { class: 'fila-acciones' }, bDim, h('span', { class: 'nota chica' }, `${def.material === 'hormigon' ? 'Hormigón' : 'Acero'} de las cuatro caras: ${fmt(peso, 0)} t (${fmt(peso / Math.max(1, ens[0]?.h ?? 1), 1)} t por metro de altura)`)));
  }
  const fo = h('div', { class: 'formulario' });
  campo(fo, 'Ficha', 'exo-tipo', def.tipo, v => set(x => { x.tipo = v as TipoExo; delete x.barras; delete x.nuevas; }), { lista: Object.keys(TIPOS_EXO), ayuda: `${TIPOS_EXO[def.tipo].nombre}: ${TIPOS_EXO[def.tipo].texto}` });
  const nu = (f: (x: ExoDef, v: number) => void) => (v: string) => { const x = parseFloat(v.replace(',', '.')); if (isFinite(x) && x > 0) set(e => f(e, x)); };
  campo(fo, 'Separación', 'exo-sep', def.separacion, nu((x, v) => (x.separacion = v)), { tipo: 'number', unidad: 'm', ayuda: 'distancia de la fachada al eje de las columnas del exo' });
  campo(fo, 'Módulo', 'exo-mod', def.modulo, nu((x, v) => { x.modulo = Math.round(v); delete x.barras; delete x.nuevas; }), { tipo: 'number', unidad: 'pisos', ayuda: 'alto de cada cruz, marco o diamante' });
  campo(fo, 'Flecha objetivo: h /', 'exo-lim', def.limiteH ?? 500, nu((x, v) => (x.limiteH = Math.max(100, Math.round(v)))), { tipo: 'number', ayuda: 'el curso pide h/500; con un número más grande (h/1000, h/1500) el dimensionado busca un exo que deje la torre más rígida' });
  const sec = (nombre: string, k: 'columna' | 'diagonal' | 'viga') => {
    const s = def[k], pr = propsSeccion(s);
    campo(fo, `${nombre}: lado`, `exo-${k}-b`, s.b * 1000, nu((x, v) => (x[k].b = v / 1000)), { tipo: 'number', unidad: 'mm', ayuda: `tubo cuadrado · A = ${fmt(pr.A * 1e4, 0)} cm² · i = ${fmt(pr.i * 100, 1)} cm` });
    campo(fo, `${nombre}: espesor`, `exo-${k}-e`, s.e * 1000, nu((x, v) => (x[k].e = v / 1000)), { tipo: 'number', unidad: 'mm' });
  };
  sec('Columna', 'columna'); sec('Diagonal', 'diagonal'); sec('Viga / cinturón', 'viga');
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
  svg.append(el('text', { x: 16, y: 28, class: 'ex-titulo' }, `Cara paralela al viento ${d.dir} · flujo de fuerzas (${TIPOS_EXO[d.def.tipo].nombre})`));
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
    const tit = `${e.id} · ${e.clase} · N = ${fmt(e.N, 1)} t (${e.N >= 0 ? 'tracción' : 'compresión'}) · M máx = ${fmt(mMax, 2)} tm · uniones ${e.relA ? 'articulada' : 'rígida'} / ${e.relB ? 'articulada' : 'rígida'} · L = ${fmt(e.L)} m · tocá para ver el detalle`;
    const g = el('g', { class: `ex-g-barra${barraSel === e.id ? ' elegida' : ''}${(e.fraccion ?? 1) !== 1 ? ' ala' : ''}`, 'data-id': e.id });
    if (modo === 'sigma') capaFibras(g, e, props, d.def.sigmaAdm, escalaS, P, defsF);
    else {
      const w = modo === 'N' ? 1.2 + 6 * Math.abs(e.N) / Nmax : 1.6;
      g.append(el('line', { x1: X(e.a.s), y1: Y(e.a.z), x2: X(e.b.s), y2: Y(e.b.z), class: modo === 'N' ? `ex-barra ${e.N >= 0 ? 'traccion' : 'compresion'} ${e.clase}` : 'ex-barra neutra', 'stroke-width': w.toFixed(1) }));
    }
    // zona de toque más ancha que la barra
    g.append(el('line', { x1: X(e.a.s), y1: Y(e.a.z), x2: X(e.b.s), y2: Y(e.b.z), class: 'ex-toque' }));
    g.append(el('title', {}, tit));
    g.addEventListener('click', () => { barraSel = barraSel === e.id ? null : e.id; estado.avisarPanel(); });
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
      h('div', { class: 'fila-acciones' }, ...(['D', 'B', 'C', 'A', 'E'] as TipoExo[]).map(t => { const b = h('button', { type: 'button' }, `${t} · ${TIPOS_EXO[t].nombre}`); b.addEventListener('click', () => estado.cambiar(() => { estado.proyecto.exo = { ...structuredClone(EXO_POR_DEFECTO), tipo: t }; })); return b; }))));
    return;
  }
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
  const cam = def.barras?.[e.id] ?? {};
  const poner = (f: (c: NonNullable<ExoDef['barras']>[string]) => void) => estado.cambiar(() => {
    const x = p.exo!; x.barras = { ...(x.barras ?? {}) }; const c = { ...(x.barras[e.id] ?? {}) }; f(c);
    if (Object.keys(c).length) x.barras[e.id] = c; else delete x.barras[e.id];
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
  return h('div', { class: 'fila-acciones exo-editor' },
    sel('Unión en a', e.relA ? 'art' : 'rig', un, v => poner(c => { c.relA = v === 'art'; })),
    sel('Unión en b', e.relB ? 'art' : 'rig', un, v => poner(c => { c.relB = v === 'art'; })),
    sel('Sección', iSec >= 0 ? String(iSec) : '', tubos, v => poner(c => { if (v === '') delete c.sec; else c.sec = CATALOGO_TUBOS[+v]; })),
    quitar, ...(Object.keys(cam).length ? [volver] : []),
    h('span', { class: 'nota chica' }, 'Vale para esta barra en las dos caras y con los dos vientos. Si queda un mecanismo, la app avisa.'));
}

/**
 * Momento que les queda a los tabiques en cada cota con el exoesqueleto (para las fibras de la etapa 07 y la capa σ),
 * o undefined si no hay exo o se eligió ver los tabiques solos (como la planilla del curso).
 */
export function momentoTabiques(dir: 'A' | 'B'): ((z: number) => number) | undefined {
  if (!estado.proyecto.exo || !estado.flexConExo) return undefined;
  const d = datosExo(dir);
  if (!d) return undefined;
  const zs = d.r.zs, M = d.r.Mtab;
  return (z: number) => { const k = zs.findIndex(q => Math.abs(q - z) < 1e-6); return k >= 0 ? M[k] : 0; };
}
