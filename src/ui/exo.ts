/**
 * Etapa 08 · Exoesqueleto: ficha y perfiles en el panel; en el centro, el alzado de una cara con el flujo de fuerzas
 * (barras en tracción en azul y en compresión en rojo, el grosor según |N|), los diagramas de M de columnas y vigas,
 * el reparto del viento entre tabiques y exoesqueleto piso por piso y la deformada con y sin exoesqueleto.
 */
import { estado, fmt } from './estado';
import { h, seccion, kpi, chip, colorEstado, type H, type EstadoChip } from './comp';
import { campo } from './paneles';
import { tablaValores, type Tam } from './diagramas';
import { calcularExo, dimensionarExo, EXO_POR_DEFECTO, pesoExo, TIPOS_EXO, propsSeccion, type EntradaExo, type EsfuerzoBarra, type ExoDef, type ResultadoExo, type TipoExo } from '../engine/exo';
import { datosAltura, E_DE_DIVISOR, rigidez, rigidezPorNivel } from '../engine/diagramas';
import { plantaDeNivel } from '../engine/silueta';
import type { PlanillaRes } from '../engine/planilla';

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
const MODOS: [ModoExo, string, string][] = [
  ['N', 'Flujo de fuerzas (N)', 'Tracción en azul, compresión en rojo; el grosor según |N|.'],
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
/** M(x) = Ma + (Mb − Ma)·x/L: se dibuja del lado traccionado (M > 0 tracciona la cara −y), cruzando el eje una sola vez */
function capaMomentos(svg: SVGSVGElement, es: EsfuerzoBarra[], P: Plano) {
  const flex = es.filter(e => e.clase !== 'diagonal');
  const Mmax = Math.max(...flex.map(e => Math.max(Math.abs(e.Ma), Math.abs(e.Mb))), 1e-9), kM = 26 / Mmax;
  flex.forEach(e => {
    const { ax, ay, bx, by, nx, ny } = normal(e, P);
    const off = (x: number, y: number, M: number) => `${(x - nx * M * kM).toFixed(1)},${(y - ny * M * kM).toFixed(1)}`;
    if (e.Ma * e.Mb < 0) {
      const t = e.Ma / (e.Ma - e.Mb), zx = ax + (bx - ax) * t, zy = ay + (by - ay) * t;
      svg.append(el('polygon', { points: `${ax},${ay} ${off(ax, ay, e.Ma)} ${zx.toFixed(1)},${zy.toFixed(1)}`, class: 'ex-momento' }));
      svg.append(el('polygon', { points: `${zx.toFixed(1)},${zy.toFixed(1)} ${off(bx, by, e.Mb)} ${bx},${by}`, class: 'ex-momento' }));
    } else svg.append(el('polygon', { points: `${ax},${ay} ${off(ax, ay, e.Ma)} ${off(bx, by, e.Mb)} ${bx},${by}`, class: 'ex-momento' }));
  });
  // rótulos: los cinco extremos con más momento
  if (Mmax < 0.05) { svg.append(el('text', { x: P.X(0), y: P.Y(Math.min(...es.map(e => Math.min(e.a.z, e.b.z)))) + 42, class: 'ex-nota', 'text-anchor': 'middle' }, 'M ≈ 0: en esta ficha las barras trabajan casi solo a esfuerzo normal')); return; }
  flex.flatMap(e => [{ e, M: e.Ma, a: true }, { e, M: e.Mb, a: false }]).filter(x => Math.abs(x.M) >= 0.05).sort((u, v) => Math.abs(v.M) - Math.abs(u.M)).slice(0, 5).forEach(({ e, M, a }) => {
    const { ax, ay, bx, by, nx, ny } = normal(e, P);
    const x = (a ? ax : bx) - nx * M * kM, y = (a ? ay : by) - ny * M * kM;
    svg.append(el('text', { x: x + (x >= (a ? ax : bx) ? 4 : -4), y: y + 4, class: 'ex-valor momento', 'text-anchor': x >= (a ? ax : bx) ? 'start' : 'end' }, `${fmt(Math.abs(M), 1)}`));
  });
}
/** Q constante en cada tramo: un rectángulo del lado +y si Q > 0 */
function capaCortes(svg: SVGSVGElement, es: EsfuerzoBarra[], P: Plano) {
  const flex = es.filter(e => e.clase !== 'diagonal');
  const Qmax = Math.max(...flex.map(e => Math.abs(e.Q)), 1e-9), kQ = 16 / Qmax;
  flex.forEach(e => {
    const { ax, ay, bx, by, nx, ny } = normal(e, P);
    const dx = nx * e.Q * kQ, dy = ny * e.Q * kQ;
    svg.append(el('polygon', { points: `${ax},${ay} ${ax + dx},${ay + dy} ${bx + dx},${by + dy} ${bx},${by}`, class: `ex-corte ${e.Q >= 0 ? 'pos' : 'neg'}` }));
  });
  flex.filter(e => Math.abs(e.Q) >= 0.01).sort((u, v) => Math.abs(v.Q) - Math.abs(u.Q)).slice(0, 4).forEach(e => {
    const { ax, ay, bx, by, nx, ny } = normal(e, P);
    const x = (ax + bx) / 2 + nx * e.Q * kQ, y = (ay + by) / 2 + ny * e.Q * kQ;
    svg.append(el('text', { x: x + (nx * e.Q >= 0 ? 4 : -4), y: y + 4, class: 'ex-valor corte', 'text-anchor': nx * e.Q >= 0 ? 'start' : 'end' }, fmt(Math.abs(e.Q), 2)));
  });
}
/** tensión en las fibras extremas: σ(±c) = N/A ∓ M/W (M > 0 comprime la cara +y); se pinta cada cara por tramos */
export function sigmaFibras(e: EsfuerzoBarra, p: { A: number; W: number }, t: number) {
  const M = e.clase === 'diagonal' ? 0 : e.Ma + (e.Mb - e.Ma) * t;
  return { sup: e.N / p.A - M / p.W, inf: e.N / p.A + M / p.W };
}
/** color de una tensión en la escala ±escala (la máxima de la cara, o la admisible si es menor) */
const colorSigma = (sig: number, escala: number) => {
  const u = Math.min(1, Math.abs(sig) / escala), pc = Math.round(10 + 90 * u);
  return `color-mix(in srgb, ${sig >= 0 ? 'var(--ex-trac)' : 'var(--ex-comp)'} ${pc}%, var(--ex-neutro))`;
};
function capaFibras(g: SVGGElement, e: EsfuerzoBarra, p: { A: number; W: number }, adm: number, escala: number, P: Plano) {
  const { ax, ay, bx, by, nx, ny } = normal(e, P), sep = 2.6, n = e.clase === 'diagonal' ? 1 : 8;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, s = sigmaFibras(e, p, (t0 + t1) / 2);
    const x0 = ax + (bx - ax) * t0, y0 = ay + (by - ay) * t0, x1 = ax + (bx - ax) * t1, y1 = ay + (by - ay) * t1;
    for (const [lado, sg] of [[1, s.sup], [-1, s.inf]] as const) {
      const ox = nx * sep * lado, oy = ny * sep * lado;
      g.append(el('line', { x1: x0 + ox, y1: y0 + oy, x2: x1 + ox, y2: y1 + oy, class: `ex-fibra${Math.abs(sg) > adm ? ' pasada' : ''}`, style: `stroke: ${colorSigma(sg, escala)}` }));
    }
  }
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

export interface DatosExo { r: ResultadoExo; def: ExoDef; dir: 'A' | 'B'; ancho: number; tCaras: number[]; niveles: string[]; h: number; Eh: number }

/** el cálculo del exoesqueleto para el viento elegido (null si el proyecto no tiene exo o faltan datos) */
/** lo que necesita el motor para un viento: pisos, viento de cada piso, rigidez de los tabiques y dónde van las caras */
export function entradaExo(dir: 'A' | 'B', def: ExoDef): EntradaExo | null {
  const d = datosExo(dir, def);
  if (!d) return null;
  return d.entrada;
}

export function datosExo(dir: 'A' | 'B' = estado.dir, def: ExoDef | null | undefined = estado.proyecto.exo): (DatosExo & { entrada: EntradaExo }) | null {
  if (!def) return null;
  try {
    const { asig, res, corr } = estado.calculo, p = estado.proyecto;
    const R: PlanillaRes = estado.fuente === 'guia' ? corr.guia : res;
    const alt = datosAltura(p, R.viento, R.mnyq, asig.filaNivel, dir);
    const iPB = p.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1);
    const zPB = p.niveles[iPB]?.cota ?? 0;
    const sobre = alt.filter(x => x.z > zPB + 1e-6).sort((a, b) => a.z - b.z);
    if (sobre.length < 2) return null;
    const zs = [zPB, ...sobre.map(x => x.z)], W = sobre.map(x => x.F);
    const rg = rigidez(R, p.hormigon || 'H30').find(x => x.dir === dir)!;
    const E = E_DE_DIVISOR((rg.W * rg.h * rg.h) / rg.minimos.h500);
    const Jniv = rigidezPorNivel(p, asig.piezas, dir, rg.J).sort((a, b) => a.z - b.z);
    const EJ = (z: number) => E * ((Jniv.find(q => q.z >= z - 1e-6)?.J ?? rg.J) || rg.J);
    const pl = plantaDeNivel(p, iPB);
    const A = dir === 'A';
    const ancho = (A ? pl.L : pl.B) + 2 * def.separacion, t = (A ? pl.B : pl.L) / 2 + def.separacion;
    const r = calcularExo(def, zs, W, EJ, ancho, [-t, t], E);
    const h0 = zs[zs.length - 1] - zPB;
    return { r, def, dir, ancho, tCaras: [-t, t], niveles: sobre.map(x => x.nivel), h: h0, Eh: E, entrada: { zs, W, EJ, ancho, tCaras: [-t, t], Eh: E, h: h0 } };
  } catch { return null; }
}

export function estadoExo(): EstadoChip {
  if (!estado.proyecto.exo) return 'pendiente';
  const ds = (['A', 'B'] as const).map(d => datosExo(d));
  if (ds.some(d => !d)) return 'revisar';
  return ds.every(d => d!.r.controles.every(c => c.estado === 'verifica') && d!.r.u[d!.r.u.length - 1] <= d!.h / (d!.def.limiteH ?? 500)) ? 'verifica' : 'no verifica';
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
  const d = datosExo();
  if (d) {
    const n = d.r.u.length - 1, lim = d.h / (def.limiteH ?? 500);
    const malos = d.r.controles.filter(x => x.estado !== 'verifica').length;
    c.append(h('div', { class: 'kpis' },
      kpi('Flecha azotea', `${fmt(d.r.u[n] * 1000, 1)} mm`, `sin exo ${fmt(d.r.uSin[n] * 1000, 1)} mm · límite ${fmt(lim * 1000, 0)}`, colorEstado(d.r.u[n] <= lim)),
      kpi('Momento que toma el exo', `${fmt(d.r.fraccionExo * 100, 0)} %`, `los tabiques: ${fmt((1 - d.r.fraccionExo) * 100, 0)} %`),
      kpi('J equivalente de cada cara', `${fmt(d.r.caras[0]?.Jeq ?? 0, 1)} m⁴`, 'para la rototraslación'),
      kpi('Barras', `${d.r.controles.length - malos} de ${d.r.controles.length}`, malos ? `${malos} no verifican (tensión o pandeo)` : 'todas verifican', colorEstado(!malos))));
    const ens = (['A', 'B'] as const).map(x => entradaExo(x, def)).filter(Boolean) as EntradaExo[];
    const peso = ens.length === 2 ? pesoExo(def, ens) : NaN;
    const bDim = h('button', { type: 'button', class: 'primario', title: 'Prueba los tubos del catálogo de menor a mayor y agranda solo la clase de barra que falla, con los dos vientos' }, 'Dimensionar: el más liviano que verifica');
    bDim.addEventListener('click', () => {
      if (ens.length < 2) return;
      const r = dimensionarExo(def, ens);
      const t = (x: { b: number; e: number }) => `${fmt(x.b * 1000, 0)}×${fmt(x.e * 1000, 1)}`;
      estado.cambiar(() => { if (estado.proyecto.exo) { estado.proyecto.exo.columna = r.def.columna; estado.proyecto.exo.diagonal = r.def.diagonal; estado.proyecto.exo.viga = r.def.viga; } });
      const msg = document.getElementById('mensaje');
      if (msg) msg.textContent = r.verifica ? `Listo: columnas ${t(r.def.columna)}, diagonales ${t(r.def.diagonal)}, vigas ${t(r.def.viga)} mm · ${fmt(r.peso, 0)} t de acero (antes ${fmt(peso, 0)} t). Ctrl+Z vuelve atrás.` : `No verifica: ${r.motivo}.`;
    });
    c.append(h('div', { class: 'fila-acciones' }, bDim, h('span', { class: 'nota chica' }, `Acero de las cuatro caras: ${fmt(peso, 0)} t (${fmt(peso / Math.max(1, ens[0]?.h ?? 1), 1)} t por metro de altura)`)));
  }
  const fo = h('div', { class: 'formulario' });
  campo(fo, 'Ficha', 'exo-tipo', def.tipo, v => set(x => { x.tipo = v as TipoExo; }), { lista: Object.keys(TIPOS_EXO), ayuda: `${TIPOS_EXO[def.tipo].nombre}: ${TIPOS_EXO[def.tipo].texto}` });
  const nu = (f: (x: ExoDef, v: number) => void) => (v: string) => { const x = parseFloat(v.replace(',', '.')); if (isFinite(x) && x > 0) set(e => f(e, x)); };
  campo(fo, 'Separación', 'exo-sep', def.separacion, nu((x, v) => (x.separacion = v)), { tipo: 'number', unidad: 'm', ayuda: 'distancia de la fachada al eje de las columnas del exo' });
  campo(fo, 'Módulo', 'exo-mod', def.modulo, nu((x, v) => (x.modulo = Math.round(v))), { tipo: 'number', unidad: 'pisos', ayuda: 'alto de cada cruz, marco o diamante' });
  campo(fo, 'Flecha objetivo: h /', 'exo-lim', def.limiteH ?? 500, nu((x, v) => (x.limiteH = Math.max(100, Math.round(v)))), { tipo: 'number', ayuda: 'el curso pide h/500; con un número más grande (h/1000, h/1500) el dimensionado busca un exo que deje la torre más rígida' });
  const sec = (nombre: string, k: 'columna' | 'diagonal' | 'viga') => {
    const s = def[k], pr = propsSeccion(s);
    campo(fo, `${nombre}: lado`, `exo-${k}-b`, s.b * 1000, nu((x, v) => (x[k].b = v / 1000)), { tipo: 'number', unidad: 'mm', ayuda: `tubo cuadrado · A = ${fmt(pr.A * 1e4, 0)} cm² · i = ${fmt(pr.i * 100, 1)} cm` });
    campo(fo, `${nombre}: espesor`, `exo-${k}-e`, s.e * 1000, nu((x, v) => (x[k].e = v / 1000)), { tipo: 'number', unidad: 'mm' });
  };
  sec('Columna', 'columna'); sec('Diagonal', 'diagonal'); sec('Viga / cinturón', 'viga');
  c.append(seccion('Ficha y perfiles', fo).el);
  if (d) {
    const peores = [...d.r.controles].sort((a, b) => b.sigma / (def.sigmaAdm) - a.sigma / def.sigmaAdm).slice(0, 12);
    c.append(seccion('Barras más cargadas', tablaValores(['Barra', 'clase', 'N (t)', 'M (tm)', 'σ (kg/cm²)', 'λ', ''],
      peores.map(x => [`${x.cara} · ${x.id}`, x.clase, x.N, x.M, x.sigma / 10, x.lambda, x.estado === 'verifica' ? '✓' : '✗']), [0, 0, 1, 2, 0, 0, 0])).el);
    c.append(h('p', { class: 'nota chica' }, `Acero: E = 2,1·10⁶ kg/cm², σ adm = ${fmt(def.sigmaAdm / 10, 0)} kg/cm². Pandeo: N ≤ π²·E·I / (1,7·L²) y λ = L / i ≤ 200. Los valores con el viento ${d.dir}.`));
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
  const propsDe = (e: EsfuerzoBarra) => propsSeccion(e.clase === 'columna' ? d.def.columna : e.clase === 'diagonal' ? d.def.diagonal : d.def.viga);
  // escala de las tensiones: la máxima de la cara (en las dos fibras, a lo largo de cada barra), sin pasar la admisible
  const sMax = Math.max(...cara.esfuerzos.flatMap(e => [0, 0.5, 1].flatMap(t => { const f = sigmaFibras(e, propsDe(e), t); return [Math.abs(f.sup), Math.abs(f.inf)]; })), 1e-9);
  const escalaS = Math.min(sMax, d.def.sigmaAdm);
  if (modo === 'M') capaMomentos(svg, cara.esfuerzos, P);
  else if (modo === 'Q') capaCortes(svg, cara.esfuerzos, P);
  // barras: en «N» el color es tracción o compresión y el grosor según |N|; en «σ», las dos fibras extremas con su tensión
  cara.esfuerzos.forEach(e => {
    const props = propsSeccion(e.clase === 'columna' ? d.def.columna : e.clase === 'diagonal' ? d.def.diagonal : d.def.viga);
    const tit = `${e.id} · ${e.clase} · N = ${fmt(e.N, 1)} t (${e.N >= 0 ? 'tracción' : 'compresión'}) · Q = ${fmt(e.Q, 2)} t · M = ${fmt(e.Ma, 2)} / ${fmt(e.Mb, 2)} tm · L = ${fmt(e.L)} m · tocá para ver el detalle`;
    const g = el('g', { class: `ex-g-barra${barraSel === e.id ? ' elegida' : ''}`, 'data-id': e.id });
    if (modo === 'sigma') capaFibras(g, e, props, d.def.sigmaAdm, escalaS, P);
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
  // base: empotramientos y reacciones verticales
  cara.reacciones.forEach(q => {
    const x = X(q.s), y = Y(z0);
    svg.append(el('path', { d: `M${x - 10},${y + 1} h20 l-10,-9 z`, class: 'ex-apoyo' }));
    svg.append(el('text', { x, y: y + 24, class: `ex-valor ${q.V >= 0 ? 'compresion' : 'traccion'}`, 'text-anchor': 'middle' }, `${q.V >= 0 ? '↑' : '↓'} ${fmt(Math.abs(q.V), 0)} t`));
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
  graf(gx + gw + 48, 'Corrimiento\nde cada piso', [{ v: r.uSin.map(x => x * 1000), clase: 'sin', nombre: 'sin exo' }, { v: r.u.map(x => x * 1000), clase: 'con', nombre: 'con exo' }], 'mm');
  const nLim = d.def.limiteH ?? 500, lim = (d.h / nLim) * 1000, xs0 = gx + gw + 48, vmx = Math.max(...r.uSin.map(x => x * 1000), lim);
  const xl = xs0 + (lim / vmx) * gw;
  svg.append(el('line', { x1: xl, x2: xl, y1: Y(z0), y2: Y(zT), class: 'ex-limite' }));
  svg.append(el('text', { x: xl - 3, y: Y(zT) + 14, class: 'ex-nota', 'text-anchor': 'end' }, `h/${nLim} = ${fmt(lim, 0)} mm`));
  return svg;
}

export function centroExo(c: H, tam: Tam) {
  if (!estado.proyecto.exo) {
    c.append(h('div', { class: 'tarjeta-vacia' }, h('h3', {}, 'Sin exoesqueleto'), h('p', { class: 'nota' }, 'Tildá «Agregar un exoesqueleto» en el panel de la izquierda para ver cómo cambia la torre: la flecha, el reparto del viento y los esfuerzos de cada barra.'),
      h('div', { class: 'fila-acciones' }, ...(['D', 'B', 'C', 'A'] as TipoExo[]).map(t => { const b = h('button', { type: 'button' }, `${t} · ${TIPOS_EXO[t].nombre}`); b.addEventListener('click', () => estado.cambiar(() => { estado.proyecto.exo = { ...structuredClone(EXO_POR_DEFECTO), tipo: t }; })); return b; }))));
    return;
  }
  const d = datosExo();
  if (!d) { c.append(h('p', { class: 'error' }, 'No se pudo calcular el exoesqueleto con estos datos (¿faltan niveles sobre PB?).')); return; }
  c.append(h('p', { class: 'nota' }, `${TIPOS_EXO[d.def.tipo].nombre}: ${TIPOS_EXO[d.def.tipo].texto} Tocá una barra para ver sus diagramas de N, Q y M y la tensión en su sección.`));
  const seg = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Qué se ve en el alzado' });
  MODOS.forEach(([m, t, ayuda]) => { const b = h('button', { type: 'button', 'aria-pressed': String(modo === m), title: ayuda }, t); b.addEventListener('click', () => { modo = m; estado.avisarPanel(); }); seg.append(b); });
  c.append(h('div', { class: 'fila-acciones' }, seg), h('p', { class: 'nota chica' }, MODOS.find(x => x[0] === modo)![2]));
  c.append(dibujoExo(d, tam));
  const cara = d.r.caras[0], e = cara?.esfuerzos.find(x => x.id === barraSel);
  if (barraSel && !e) barraSel = null;
  if (e) {
    const sec = e.clase === 'columna' ? d.def.columna : e.clase === 'diagonal' ? d.def.diagonal : d.def.viga;
    const ctl = d.r.controles.find(x => x.cara === cara.nombre && x.id === e.id);
    const cerrar = h('button', { type: 'button' }, 'Cerrar');
    cerrar.addEventListener('click', () => { barraSel = null; estado.avisarPanel(); });
    c.append(h('section', { class: 'tarjeta exo-detalle' }, h('div', { class: 'fila-acciones' }, h('b', {}, `Barra ${e.id} · ${e.clase} · ${cara.nombre}`), ctl ? chip(ctl.estado === 'verifica' ? 'verifica' : 'no verifica') : '', cerrar),
      detalleBarra(e, propsSeccion(sec), sec, d.def)));
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
    if (va * vb < 0) { const t = va / (va - vb); svg.append(el('circle', { cx: Xb(t), cy: y, r: 3, class: 'ex-cero' })); svg.append(el('text', { x: Xb(t), y: y + 16, class: 'ex-nota', 'text-anchor': 'middle' }, `M = 0 a ${fmt(t * e.L, 2)} m`)); }
  };
  const M = (t: number) => (e.clase === 'diagonal' ? 0 : e.Ma + (e.Mb - e.Ma) * t);
  // nombre de cada cara de la barra en el alzado: la +y local es la de la izquierda de a→b (con z hacia arriba)
  const L0 = Math.hypot(e.b.s - e.a.s, e.b.z - e.a.z) || 1, ns = -(e.b.z - e.a.z) / L0, nz = (e.b.s - e.a.s) / L0;
  const cara = (lado: 1 | -1) => { const a = ns * lado, b = nz * lado; return Math.abs(b) >= Math.abs(a) ? (b > 0 ? 'la cara de arriba' : 'la cara de abajo') : (a < 0 ? 'la cara izquierda' : 'la cara derecha'); };
  svg.append(el('text', { x: x0, y: 22, class: 'ex-nota' }, `extremo a (${fmt(e.a.s, 2)}; ${fmt(e.a.z, 2)})`));
  svg.append(el('text', { x: x1, y: 22, class: 'ex-nota', 'text-anchor': 'end' }, `extremo b (${fmt(e.b.s, 2)}; ${fmt(e.b.z, 2)}) · L = ${fmt(e.L, 2)} m`));
  svg.append(el('line', { x1: x0, y1: 36, x2: x1, y2: 36, class: `ex-barra ${e.N >= 0 ? 'traccion' : 'compresion'}`, 'stroke-width': 5 }));
  fila(92, 'N', 't (+ tracción)', () => e.N, `ex-area-n ${e.N >= 0 ? 'traccion' : 'compresion'}`, Math.abs(e.N), 1);
  fila(170, 'Q', 't', () => (e.clase === 'diagonal' ? 0 : e.Q), 'ex-corte pos', Math.abs(e.Q), 2);
  fila(258, 'M', `tm (+: tracciona ${cara(-1)})`, M, 'ex-momento', Math.max(Math.abs(e.Ma), Math.abs(e.Mb)), 2);
  // sección en el extremo con más momento: tensión lineal entre la cara superior (+y) y la inferior
  const tCrit = Math.abs(M(0)) >= Math.abs(M(1)) ? 0 : 1, Mc = M(tCrit);
  const sSup = e.N / p.A - Mc / p.W, sInf = e.N / p.A + Mc / p.W, adm = def.sigmaAdm;
  const cx = 640, cy = 70, hS = 200, bS = 40;
  svg.append(el('text', { x: cx - 30, y: 22, class: 'ex-subtitulo' }, `Sección en el extremo ${tCrit ? 'b' : 'a'}`));
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
  svg.append(el('text', { x: cx - 30, y: H - 34, class: 'ex-nota' }, `σ = N/A ± M/W = ${fmt(e.N / p.A / 10, 0)} ± ${fmt(Math.abs(Mc) / p.W / 10, 0)} kg/cm²`));
  svg.append(el('text', { x: cx - 30, y: H - 18, class: 'ex-nota' }, `máx |σ| = ${fmt(Math.max(Math.abs(sSup), Math.abs(sInf)) / 10, 0)} de ${fmt(adm / 10, 0)} kg/cm² (${fmt(Math.max(Math.abs(sSup), Math.abs(sInf)) / adm * 100, 0)} %)`));
  return svg;
}
