/**
 * Carta de la torre: la hoja «M,NyQ» de la planilla dibujada, con el edificio, sus cotas de análisis y lo que marca
 * la planilla (piezas, ejes, centro de rigidez). Tres propuestas:
 *  A · Lámina M, N y Q: alzado de la torre y, a la misma altura, Wi, Q, M y N de cada nivel (como los dos gráficos
 *      de la hoja, pero con una sola escala de alturas y los números a la vista).
 *  B · Ficha de la torre: planta (piezas, ejes, CR, e), alzado (W en hw, δ) y los valores clave en una hoja.
 *  C · Axonometría de la ménsula: la torre en axonometría con el viento de cada piso, la resultante, el diagrama de
 *      momentos en un plano al costado y las reacciones en PB, como en los esquemas de la clase.
 */
import { fmt } from './estado';
import type { DatosRotoPlano } from './rototraslacion';
import type { Rototraslacion3D } from '../engine/diagramas';
import { rectangulos, tipoDe, type Muro } from '../engine/modelo';

export interface NivelCarta {
  nombre: string;
  /** cota del nivel (m) */
  z: number;
  /** h del piso al piso superior y h de influencia (m), columnas C y D */
  h: number; D: number;
  /** presión de diseño (t/m², columna G), barlovento y sotavento (kN/m²) */
  p: number; pB: number; pS: number;
  /** Wi (t), Q (t), M (tm), N (t): columnas H, I, J y M (o N y O en la cara b) */
  Wi: number; Q: number; M: number; N: number;
}
export interface DatosCarta {
  dir: 'A' | 'B';
  proyecto: string;
  fuente: string;
  niveles: NivelCarta[];
  /** ancho transversal al viento y profundidad (m), en el marco del viento */
  T: number; S: number;
  zTop: number; zFondo: number;
  W: number; Mv: number; hw: number;
  PB: NivelCarta | null;
  plano: DatosRotoPlano & { SJ: number; SJa2: number };
  roto: Rototraslacion3D | null;
  /** vuelco y tensiones en el suelo (abajo de las tablas de «M,NyQ»: filas 65 a 99) */
  vuelco: Vuelco;
  /** controles principales para el pie de la carta */
  controles: { nombre: string; valor: string; estado: string }[];
}
export interface Vuelco {
  /** lado de la base paralelo al viento (b') y perpendicular (a1), superficie (m, m²) */
  bB: number; aB: number; Sb: number;
  /** momento volcador en la fundación (tm), peso descargado y cargado (t) */
  Mv: number; P: number; G: number;
  /** momento equilibrante P · b'/2 (tm) y coeficiente de seguridad Me / Mv */
  Me: number; coef: number;
  /** excentricidad de la resultante e = Mv / P y núcleo central b'/6 (m) */
  e: number; nucleo: number;
  /** tensiones en el suelo (kg/cm², compresión negativa): descargado, cargado, viento, máxima y mínima */
  Tp: number; Tg: number; Tv: number; Tmax: number; Tmin: number;
  /** la planilla hace esta verificación solo con la cara a (viento A) */
  enPlanilla: boolean;
}
export type Variante = 'A' | 'B' | 'C' | 'D';

const NS = 'http://www.w3.org/2000/svg';
type Attrs = Record<string, string | number>;
const el = <K extends keyof SVGElementTagNameMap>(tag: K, a: Attrs = {}, txt?: string) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v)));
  if (txt !== undefined) e.textContent = txt;
  return e;
};
const txt = (g: SVGElement, x: number, y: number, t: string, clase = 'd-eje', ancla = 'start', extra: Attrs = {}) =>
  g.append(el('text', { x: x.toFixed(1), y: y.toFixed(1), class: clase, 'text-anchor': ancla, ...extra }, t));
const linea = (g: SVGElement, x1: number, y1: number, x2: number, y2: number, clase: string) =>
  g.append(el('line', { x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1), class: clase }));
const pts = (p: { x: number; y: number }[]) => p.map(q => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');

/** flecha: tronco + punta triangular (misma forma que en la rototraslación) */
function flecha(g: SVGElement, x1: number, y1: number, x2: number, y2: number, clase: string, w = 1.6) {
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 0.5) return;
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
  const lp = Math.min(Math.max(7, w * 3), L * 0.7), ap = Math.max(6, w * 3.2);
  const bx = x2 - ux * lp, by = y2 - uy * lp;
  const gg = el('g', { class: `ct-flecha ${clase}` });
  gg.append(el('line', { x1, y1, x2: bx, y2: by, 'stroke-width': w }));
  gg.append(el('polygon', { points: `${x2},${y2} ${bx - uy * ap / 2},${by + ux * ap / 2} ${bx + uy * ap / 2},${by - ux * ap / 2}` }));
  g.append(gg);
}
/** cota con topes oblicuos y el texto en el medio */
function cota(g: SVGElement, x1: number, y1: number, x2: number, y2: number, t: string, lado: 1 | -1 = -1) {
  const L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L;
  linea(g, x1, y1, x2, y2, 'ct-cota');
  for (const [x, y] of [[x1, y1], [x2, y2]]) linea(g, x - 4 * (ux - uy), y - 4 * (uy + ux), x + 4 * (ux - uy), y + 4 * (uy + ux), 'ct-cota');
  const vertical = Math.abs(uy) > 0.9, horizontal = Math.abs(uy) < 0.1;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  if (vertical) txt(g, mx + lado * 6, my, t, 'd-valor', lado > 0 ? 'start' : 'end', { 'dominant-baseline': 'middle' });
  else if (horizontal) txt(g, mx, my + (lado < 0 ? -5 : 13), t, 'd-valor', 'middle');
  else {
    // cota oblicua: el texto se corre en perpendicular a la línea, del lado pedido, para que la línea no lo cruce
    const nx = -uy, ny = ux, s2 = (ny > 0 ? 1 : -1) * (lado > 0 ? 1 : -1);
    const ox = nx * s2 * 10, oy = ny * s2 * 10;
    txt(g, mx + ox, my + oy + (oy > 0 ? 9 : -2), t, 'd-valor', ox > 2 ? 'start' : ox < -2 ? 'end' : 'middle');
  }
}
/** recuadro de dato: título chico y valor grande */
function dato(g: SVGElement, x: number, y: number, w: number, tit: string, val: string, nota = '', clase = '') {
  g.append(el('rect', { x, y, width: w, height: 46, rx: 6, class: `ct-dato ${clase}` }));
  txt(g, x + 8, y + 14, tit, 'ct-dato-tit');
  txt(g, x + 8, y + 32, val, 'ct-dato-val');
  if (nota) txt(g, x + 8, y + 42, nota, 'ct-dato-nota');
}
/** marcas «redondas» para un eje de 0 a max */
function marcas(max: number, n = 3): number[] {
  if (!(max > 0)) return [0];
  const paso0 = max / n, p = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map(k => k * p).find(v => v >= paso0) ?? p * 10;
  const out: number[] = [];
  for (let v = 0; v < max + paso * 0.999; v += paso) out.push(v);
  return out;
}

export function carta(d: DatosCarta, variante: Variante, ancho = 1100): SVGSVGElement {
  const alto = variante === 'C' || variante === 'D' ? 760 : 720;
  const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: `grafico carta carta-${variante}`, role: 'img',
    'aria-label': `Carta de la torre (${variante}), viento ${d.dir}: W = ${fmt(d.W, 1)} t, M en PB = ${fmt(d.Mv, 0)} tm` }) as SVGSVGElement;
  svg.append(el('rect', { x: 0, y: 0, width: ancho, height: alto, class: 'ct-fondo' }));
  // rótulo (como el de un plano): proyecto, viento, fuente
  const g = el('g');
  svg.append(g);
  const titulos: Record<Variante, string> = { A: 'Lámina M, N y Q', B: 'Ficha de la torre', C: 'Axonometría de la ménsula', D: 'Vuelco y tensiones en el suelo' };
  txt(g, 16, 26, `${titulos[variante]} · viento ${d.dir}`, 'ct-titulo');
  txt(g, ancho - 16, 26, `${d.proyecto} · ${d.fuente}`, 'd-eje', 'end');
  linea(g, 12, 36, ancho - 12, 36, 'ct-regla');
  if (variante === 'A') laminaA(g, d, ancho, alto);
  else if (variante === 'B') fichaB(g, d, ancho, alto);
  else if (variante === 'C') axonometriaC(g, d, ancho, alto);
  else vuelcoD(g, d, ancho, alto);
  return svg;
}

// ------------------------------------------------------------------ elementos compartidos
/** escala de alturas: cota → y */
function escalaZ(d: DatosCarta, y0: number, y1: number) {
  const zMin = Math.min(d.zFondo, 0), zMax = d.zTop;
  return (z: number) => y0 + ((zMax - z) / (zMax - zMin || 1)) * (y1 - y0);
}
/** niveles a rotular sin que se pisen (cada ≥ 13 px), siempre azotea y PB */
function nivelesRotulados(d: DatosCarta, Y: (z: number) => number, sep = 13): Set<NivelCarta> {
  const out = new Set<NivelCarta>();
  let ult = -Infinity;
  const orden = [...d.niveles].sort((a, b) => b.z - a.z);
  orden.forEach((n, i) => {
    const y = Y(n.z);
    const obligado = i === 0 || n === d.PB;
    if (obligado || y - ult >= sep) { out.add(n); ult = y; }
  });
  return out;
}

/** alzado de la torre en el plano del viento: losas, subsuelos, presiones y la resultante W en hw */
function alzado(g: SVGElement, d: DatosCarta, x0: number, x1: number, Y: (z: number) => number, opc: { presiones?: boolean; deformada?: boolean } = {}) {
  const cx = (x0 + x1) / 2;
  const kS = Math.min((x1 - x0 - 150) / d.S, 8);
  const xa = cx - (d.S / 2) * kS, xb = cx + (d.S / 2) * kS;
  const yTop = Y(d.zTop), yPB = Y(0), yFondo = Y(Math.min(0, d.zFondo));
  // suelo y subsuelos
  if (yFondo > yPB + 1) g.append(el('rect', { x: xa, y: yPB, width: xb - xa, height: yFondo - yPB, class: 'ct-subsuelo' }));
  g.append(el('rect', { x: xa, y: yTop, width: xb - xa, height: yPB - yTop, class: 'ct-torre' }));
  d.niveles.forEach(n => linea(g, xa, Y(n.z), xb, Y(n.z), n === d.PB ? 'ct-losa pb' : 'ct-losa'));
  linea(g, x0 + 4, yPB, x1 - 4, yPB, 'ct-suelo');
  for (let x = x0 + 8; x < x1 - 6; x += 9) linea(g, x, yPB + 1, x - 6, yPB + 7, 'ct-rayado');
  // presiones: barlovento empuja, sotavento succiona (las dos en el sentido del viento)
  const sobre = d.niveles.filter(n => n.z > 0);
  if (opc.presiones !== false && sobre.length) {
    const pMax = Math.max(...sobre.map(n => Math.max(Math.abs(n.pB), Math.abs(n.pS))), 1e-9);
    const kp = 40 / pMax;
    const izq = sobre.map(n => ({ x: xa - 6 - Math.abs(n.pB) * kp, y: Y(n.z) }));
    g.append(el('polygon', { points: pts([{ x: xa - 6, y: Y(sobre[0].z) }, ...izq, { x: xa - 6, y: Y(sobre[sobre.length - 1].z) }]), class: 'ct-presion' }));
    sobre.forEach((n, i) => { if (i % 2 === 0) flecha(g, xa - 6 - Math.abs(n.pB) * kp, Y(n.z), xa - 7, Y(n.z), 'carga', 1.1); });
    const der = sobre.map(n => ({ x: xb + 6 + Math.abs(n.pS) * kp, y: Y(n.z) }));
    g.append(el('polygon', { points: pts([{ x: xb + 6, y: Y(sobre[0].z) }, ...der, { x: xb + 6, y: Y(sobre[sobre.length - 1].z) }]), class: 'ct-presion succion' }));
    sobre.forEach((n, i) => { if (i % 2 === 0) flecha(g, xb + 7, Y(n.z), xb + 6 + Math.abs(n.pS) * kp, Y(n.z), 'carga', 1.1); });
    txt(g, xa - 8, yTop - 8, 'barlovento', 'd-eje', 'end');
    txt(g, xb + 8, yTop - 8, 'sotavento', 'd-eje', 'start');
  }
  // resultante W a la altura hw
  if (isFinite(d.hw)) {
    const yw = Y(d.zFondo + d.hw);                                  // hW se mide desde la fundación (M,NyQ!G66 = J61 / W)
    flecha(g, xa - 56, yw, xa - 2, yw, 'resultante', 3);
    txt(g, xa - 56, yw - 7, `W = ${fmt(d.W, 1)} t`, 'd-valor', 'start');
    linea(g, xa - 2, yw, xb + 2, yw, 'ct-hw');
    cota(g, xa + 12, Y(d.zFondo), xa + 12, yw, `hW = ${fmt(d.hw)} m`, 1);
  }
  // deformada exagerada del eje
  if (opc.deformada && d.roto) {
    const dMax = Math.max(...d.roto.niveles.map(n => Math.abs(n.d)), 1e-12);
    const k = ((xb - xa) * 0.45) / dMax;
    linea(g, cx, yPB, cx, yTop, 'ct-eje');
    g.append(el('polyline', { points: pts(d.roto.niveles.map(n => ({ x: cx + n.d * k, y: Y(n.z) }))), class: 'ct-deformada' }));
    const t = d.roto.niveles[d.roto.niveles.length - 1];
    txt(g, cx + t.d * k - 4, Y(t.z) + 16, `δ = ${fmt(d.roto.dTop * 1000, 1)} mm`, 'd-valor ct-verde', 'end');
  }
  return { xa, xb, kS, yTop, yPB };
}

/** diagrama por nivel en una columna: barras (Wi) o curva (Q, M, N) con su eje y sus marcas */
function columna(g: SVGElement, d: DatosCarta, x0: number, x1: number, Y: (z: number) => number, yEje: number, tit: string, unidad: string,
  val: (n: NivelCarta) => number, forma: 'barras' | 'escalones' | 'curva', clase: string, dec: number, rot: Set<NivelCarta>) {
  const ns = [...d.niveles].sort((a, b) => b.z - a.z);
  const max = Math.max(...ns.map(n => Math.abs(val(n))), 1e-9);
  const ms = marcas(max, 2);
  const k = (x1 - x0 - 34) / (ms[ms.length - 1] || max);
  const X = (v: number) => x0 + Math.abs(v) * k;
  txt(g, x0, 52, tit, 'ct-col-tit');
  txt(g, x0, 64, unidad, 'd-eje');
  // marcas del eje (abajo)
  const decM = ms.some(m => Math.abs(m - Math.round(m)) > 1e-9) ? 1 : 0;
  ms.forEach(m => { linea(g, X(m), 70, X(m), yEje, 'ct-grilla'); txt(g, X(m), yEje + 13, fmt(m, decM), 'd-eje', 'middle'); });
  linea(g, x0, 70, x0, yEje, 'ct-eje-col');
  if (forma === 'barras') ns.forEach(n => { if (Math.abs(val(n)) > 1e-9) g.append(el('rect', { x: x0, y: Y(n.z) - 2.5, width: Math.abs(val(n)) * k, height: 5, rx: 1.5, class: `ct-barra ${clase}` })); });
  else {
    const p: { x: number; y: number }[] = [];
    ns.forEach((n, i) => {
      if (forma === 'escalones' && i > 0) p.push({ x: X(val(n)), y: Y(ns[i - 1].z) });
      p.push({ x: X(val(n)), y: Y(n.z) });
    });
    g.append(el('polygon', { points: pts([{ x: x0, y: p[0].y }, ...p, { x: x0, y: p[p.length - 1].y }]), class: `ct-area ${clase}` }));
    g.append(el('polyline', { points: pts(p), class: `ct-linea ${clase}` }));
  }
  // valores en los niveles rotulados
  ns.forEach(n => { if (rot.has(n) && Math.abs(val(n)) > 1e-9) txt(g, X(val(n)) + 4, Y(n.z) + 3.5, fmt(val(n), dec), n === d.PB ? 'd-valor' : 'ct-num', 'start'); });
}

// ------------------------------------------------------------------ A · Lámina M, N y Q
function laminaA(g: SVGElement, d: DatosCarta, ancho: number, alto: number) {
  const y0 = 84, y1 = alto - 130;
  const Y = escalaZ(d, y0, y1);
  const rot = nivelesRotulados(d, Y);
  // grilla de niveles a todo lo ancho
  d.niveles.forEach(n => linea(g, 12, Y(n.z), ancho - 12, Y(n.z), n === d.PB ? 'ct-nivel pb' : 'ct-nivel'));
  // tabla de niveles: nivel, cota, h, D (columnas B, C, D de la hoja)
  const xs = [16, 70, 116, 154];
  ['nivel', 'cota', 'h', 'D'].forEach((t, i) => txt(g, xs[i] + (i ? 30 : 0), 64, t, 'ct-col-tit', i ? 'end' : 'start'));
  d.niveles.forEach(n => {
    if (!rot.has(n)) return;
    const y = Y(n.z) - 3;
    txt(g, xs[0], y, n.nombre, n === d.PB ? 'd-valor' : 'ct-num');
    txt(g, xs[1] + 30, y, `${n.z > 0 ? '+' : ''}${fmt(n.z)}`, 'ct-num', 'end');
    txt(g, xs[2] + 30, y, fmt(n.h), 'ct-num', 'end');
    txt(g, xs[3] + 30, y, fmt(n.D), 'ct-num', 'end');
  });

  // alzado
  const { xa, xb, yTop, yPB } = alzado(g, d, 205, 490, Y);
  cota(g, xa, yTop - 24, xb, yTop - 24, `${d.dir === 'A' ? 'L' : 'B'} = ${fmt(d.S)} m`);
  cota(g, xb + 58, yPB, xb + 58, yTop, `h = ${fmt(d.zTop)} m`, 1);
  txt(g, xb + 8, yPB + 14, 'PB · empotramiento', 'ct-pb');
  // columnas Wi, Q, M, N
  const yEje = y1 + 6;
  const c0 = 520, wc = (ancho - c0 - 16) / 4;
  const cB = d.dir === 'B';
  columna(g, d, c0, c0 + wc - 14, Y, yEje, 'Wi · viento por piso', `t (col. ${cB ? 'D·F·G' : 'H'})`, n => n.Wi, 'barras', 'carga', 2, rot);
  columna(g, d, c0 + wc, c0 + 2 * wc - 14, Y, yEje, 'Q · corte', `t (col. ${cB ? 'N' : 'I'})`, n => n.Q, 'escalones', 'corte', 1, rot);
  columna(g, d, c0 + 2 * wc, c0 + 3 * wc - 14, Y, yEje, 'M · momento', `tm (col. ${cB ? 'O' : 'J'})`, n => n.M, 'curva', 'momento', 0, rot);
  columna(g, d, c0 + 3 * wc, c0 + 4 * wc - 14, Y, yEje, 'N · peso', 't (col. M)', n => n.N, 'curva', 'peso', 0, rot);
  // pie: datos de la torre
  const yP = alto - 66, PB = d.PB;
  const datos: [string, string, string][] = [
    ['B × L', `${fmt(d.dir === 'A' ? d.T : d.S, 1)} × ${fmt(d.dir === 'A' ? d.S : d.T, 1)} m`, 'planta (col. E y F)'],
    ['h / B', fmt(d.zTop / Math.min(d.T, d.S), 2), 'esbeltez'],
    ['W = Σ Wi', `${fmt(d.W, 1)} t`, `a hw = ${fmt(d.hw)} m`],
    ['Q en PB', `${fmt(PB?.Q ?? NaN, 1)} t`, 'corte en la base'],
    ['M en PB', `${fmt(PB?.M ?? NaN, 0)} tm`, `fundación: ${fmt(d.Mv, 0)} tm`],
    ['N en PB', `${fmt(PB?.N ?? NaN, 0)} t`, 'peso descargado'],
    ['e = Mv / P', `${fmt(d.vuelco.e, 2)} m`, `b'/6 = ${fmt(d.vuelco.nucleo, 2)} m`],
  ];
  const wd = (ancho - 32 - 6 * 8) / 7;
  datos.forEach(([t, v2, nt], i) => dato(g, 16 + i * (wd + 8), yP, wd, t, v2, nt));
}

// ------------------------------------------------------------------ B · Ficha de la torre
function plantaFicha(g: SVGElement, d: DatosCarta, x0: number, y0: number, w: number, hh: number) {
  const pl = d.plano;
  const tExt = Math.max(pl.T / 2, ...pl.paralelos.map(p => Math.abs(p.pos))) + 1.5;
  const k = Math.min(w / (2 * tExt), (hh - 100) / (pl.S + 3));   // deja lugar abajo para W y la cota e
  const cx = x0 + w / 2, cy = y0 + 22 + ((pl.S + 3) / 2) * k;
  const X = (t: number) => cx + t * k, Yp = (s: number) => cy - s * k;
  const ts = (m: { x: number; y: number }) => (pl.dir === 'A' ? { t: m.x, s: m.y } : { t: -m.y, s: m.x });
  g.append(el('rect', { x: X(-pl.T / 2), y: Yp(pl.S / 2), width: pl.T * k, height: pl.S * k, class: 'ct-planta' }));
  const enPieza = new Map<string, string>();
  pl.paralelos.forEach(p => p.muros.forEach(m => enPieza.set(m.id, p.nombre)));
  pl.muros.forEach((m: Muro) => {
    const par = enPieza.has(m.id);
    if (tipoDe(m) === 'tubo-circ') { const c = ts(m); g.append(el('circle', { cx: X(c.t), cy: Yp(c.s), r: (m.largo / 2) * k, class: par ? 'ct-muro par' : 'ct-muro' })); return; }
    rectangulos(m).forEach(r => {
      const c = ts(r), at = pl.dir === 'A' ? r.ax : r.ay, as = pl.dir === 'A' ? r.ay : r.ax;
      g.append(el('rect', { x: X(c.t - at / 2), y: Yp(c.s + as / 2), width: Math.max(1.5, at * k), height: Math.max(1.5, as * k), class: par ? 'ct-muro par' : 'ct-muro' }));
    });
  });
  // piezas: nombre y J
  const usados: { x: number; y: number }[] = [];
  pl.paralelos.forEach(p => {
    const A = p.muros.reduce((s, m) => s + m.largo * m.espesor, 0) || 1;
    const sc = p.muros.reduce((s, m) => s + m.largo * m.espesor * ts(m).s, 0) / A;
    const derecha = X(p.pos) > cx + w * 0.25;
    const x = X(p.pos) + (derecha ? -6 : 6);
    let y = Yp(sc) + 4;
    while (usados.some(u => Math.abs(u.x - x) < 40 && Math.abs(u.y - y) < 12)) y += 12;
    usados.push({ x, y });
    txt(g, x, y, `${p.nombre} · J ${fmt(p.J, 2)}`, 'ct-pieza', derecha ? 'end' : 'start');
  });
  // ejes y CR
  linea(g, X(0), Yp(pl.S / 2 + 1.2), X(0), Yp(-pl.S / 2 - 1.2), 'ct-simetria');
  const e = Math.abs(pl.Xr);
  if (e > 0.005) linea(g, X(pl.Xr), Yp(pl.S / 2 + 1.2), X(pl.Xr), Yp(-pl.S / 2 - 1.2), 'ct-inercia');
  g.append(el('circle', { cx: X(pl.Xr), cy: Yp(pl.Yr), r: 5, class: 'ct-cr' }));
  txt(g, X(pl.Xr) + 6, Yp(pl.Yr) + 18, 'CR · centro de rotación', 'ct-cr-txt');
  // viento
  flecha(g, X(0), Yp(-pl.S / 2) + 46, X(0), Yp(-pl.S / 2) + 14, 'resultante', 3);
  txt(g, X(0) + 6, Yp(-pl.S / 2) + 44, `W = ${fmt(d.W, 1)} t`, 'd-valor');
  // cotas: T arriba, S a la derecha, e abajo
  cota(g, X(-pl.T / 2), Yp(pl.S / 2) - 14, X(pl.T / 2), Yp(pl.S / 2) - 14, `${pl.dir === 'A' ? 'B' : 'L'} = ${fmt(pl.T)} m`);
  cota(g, X(pl.T / 2) + 22, Yp(pl.S / 2), X(pl.T / 2) + 22, Yp(-pl.S / 2), `${pl.dir === 'A' ? 'L' : 'B'} = ${fmt(pl.S)} m`, 1);
  if (e > 0.005) cota(g, X(0), Yp(-pl.S / 2) + 62, X(pl.Xr), Yp(-pl.S / 2) + 62, `e = ${fmt(e)} m`, 1);
  txt(g, x0, y0 + 10, 'Planta tipo (PB) · viento hacia arriba', 'ct-col-tit');
}
function fichaB(g: SVGElement, d: DatosCarta, ancho: number, alto: number) {
  const xAl = ancho * 0.4, xVal = ancho - 240;
  plantaFicha(g, d, 16, 44, xAl - 100, alto - 60);
  // alzado con la deformada y W
  const y0 = 92, y1 = alto - 56;
  const Y = escalaZ(d, y0, y1);
  txt(g, xAl, 54, 'Alzado · el viento de izquierda a derecha', 'ct-col-tit');
  const rot = nivelesRotulados(d, Y, 15);
  d.niveles.forEach(n => { if (rot.has(n)) txt(g, xAl, Y(n.z) + 3.5, `${n.nombre} ${n.z > 0 ? '+' : ''}${fmt(n.z)}`, n === d.PB ? 'd-valor' : 'ct-num'); });
  const { xb, yTop, yPB } = alzado(g, d, xAl + 75, xVal - 110, Y, { presiones: true, deformada: true });
  cota(g, xb + 52, yPB, xb + 52, yTop, `h = ${fmt(d.zTop)} m`, 1);
  // datos
  const x0 = xVal, w = ancho - x0 - 16;
  txt(g, x0, 54, 'Valores', 'ct-col-tit');
  const PB = d.PB, roto = d.roto;
  const filas: [string, string, string, string?][] = [
    ['W = Σ Wi', `${fmt(d.W, 1)} t`, `a hw = ${fmt(d.hw)} m`],
    ['M en PB · fundación', `${fmt(d.PB?.M ?? NaN, 0)} · ${fmt(d.Mv, 0)} tm`, 'M,NyQ · col. J'],
    ['N en PB', `${fmt(PB?.N ?? NaN, 0)} t`, 'peso descargado'],
    ['Σ J paralelos', `${fmt(d.plano.SJ, 2)} m⁴`, 'traslación'],
    ['e · Mt', `${fmt(Math.abs(d.plano.Xr), 2)} m · ${fmt(Math.abs(d.plano.Mt), 0)} tm`, 'rotación'],
    ['δ azotea', roto ? `${fmt(roto.dTop * 1000, 1)} mm` : '—', roto ? `h/500 = ${fmt(d.zTop / 500 * 1000, 0)} mm` : '', roto && roto.dTop > d.zTop / 500 ? 'mal' : 'ok'],
  ];
  filas.forEach(([t, v2, nt, c], i) => dato(g, x0, 66 + i * 54, w, t, v2, nt, c ?? ''));
  const yc = 66 + filas.length * 54 + 6;
  txt(g, x0, yc + 6, 'Controles', 'ct-col-tit');
  d.controles.slice(0, 8).forEach((c, i) => {
    const y = yc + 24 + i * 17;
    g.append(el('circle', { cx: x0 + 5, cy: y - 4, r: 4, class: `ct-estado ${c.estado.replace(' ', '-')}` }));
    const nom = c.nombre.length > 24 ? `${c.nombre.slice(0, 23)}…` : c.nombre;
    const t = el('text', { x: x0 + 14, y, class: 'ct-num' }, nom);
    t.append(el('title', {}, `${c.nombre}: ${c.valor} (${c.estado})`));
    g.append(t);
  });
}

// ------------------------------------------------------------------ C · Axonometría de la ménsula
function axonometriaC(g: SVGElement, d: DatosCarta, ancho: number, alto: number) {
  // marco del viento: t transversal, s en el sentido del viento (se aleja hacia la derecha y arriba), z altura
  const T = d.T, S = d.S, H = d.zTop, zF = Math.min(0, d.zFondo);
  // t se acerca hacia la derecha y abajo; s (el viento) se aleja hacia la derecha y arriba
  const ut = { x: 0.78, y: 0.42 }, us = { x: 0.58, y: -0.4 };
  void zF;
  const k = Math.min((alto - 190) / (H + T * ut.y + S * Math.abs(us.y)), (ancho - 560) / (T * ut.x + S * us.x * 1.9 + 14), 9);
  const cx = 360 - (T / 2) * ut.x * k * 0.2, cy = alto - 120 - ((T / 2) * ut.y + (S / 2) * Math.abs(us.y)) * k;
  const P = (t: number, s: number, z: number) => ({ x: cx + (t * ut.x + s * us.x) * k, y: cy + (t * ut.y + s * us.y) * k - z * k });
  // subsuelos y suelo
  const esq = (z: number) => [P(T / 2, -S / 2, z), P(T / 2, S / 2, z), P(-T / 2, S / 2, z), P(-T / 2, -S / 2, z)];
  const piso = [P(T / 2 + 6, -S / 2 - 6, 0), P(T / 2 + 6, S / 2 + 6, 0), P(-T / 2 - 6, S / 2 + 6, 0), P(-T / 2 - 6, -S / 2 - 6, 0)];
  g.append(el('polygon', { points: pts(piso), class: 'ct-terreno' }));
  // caras de la torre (de atrás hacia adelante): sotavento, lado lejano, barlovento, lado cercano, techo
  const cara = (a: { x: number; y: number }[], clase: string) => g.append(el('polygon', { points: pts(a), class: clase }));
  cara([P(-T / 2, S / 2, 0), P(T / 2, S / 2, 0), P(T / 2, S / 2, H), P(-T / 2, S / 2, H)], 'ct-cara lejos');
  cara([P(-T / 2, -S / 2, 0), P(-T / 2, S / 2, 0), P(-T / 2, S / 2, H), P(-T / 2, -S / 2, H)], 'ct-cara lejos');
  cara([P(-T / 2, -S / 2, 0), P(T / 2, -S / 2, 0), P(T / 2, -S / 2, H), P(-T / 2, -S / 2, H)], 'ct-cara barlo');
  cara([P(T / 2, -S / 2, 0), P(T / 2, S / 2, 0), P(T / 2, S / 2, H), P(T / 2, -S / 2, H)], 'ct-cara cerca');
  cara(esq(H), 'ct-cara techo');
  // losas: líneas en las caras visibles
  d.niveles.filter(n => n.z > 0 && n.z < H).forEach(n => {
    g.append(el('polyline', { points: pts([P(-T / 2, -S / 2, n.z), P(T / 2, -S / 2, n.z), P(T / 2, S / 2, n.z)]), class: 'ct-losa' }));
  });
  // viento de cada piso sobre la cara de barlovento (en el medio de la cara), largo ∝ Wi
  const sobre = d.niveles.filter(n => n.z > 0);
  const wMax = Math.max(...sobre.map(n => n.Wi), 1e-9);
  sobre.forEach((n, i) => {
    if (sobre.length > 14 && i % 2) return;
    const a = P(0, -S / 2 - 2 - (n.Wi / wMax) * 9, n.z), b = P(0, -S / 2 - 0.3, n.z);
    flecha(g, a.x, a.y, b.x, b.y, 'carga', 1.3);
  });
  // resultante W en hw
  let yW = NaN;
  if (isFinite(d.hw)) {
    const zw = d.zFondo + d.hw;
    const a = P(0, -S / 2 - 18, zw), b = P(0, -S / 2 - 0.3, zw);
    flecha(g, a.x, a.y, b.x, b.y, 'resultante', 3.2);
    txt(g, a.x - 6, a.y - 4, `W = ${fmt(d.W, 1)} t`, 'd-valor', 'end');
    // si no entra a la izquierda de la flecha, va en dos renglones
    const tHw = `hW = ${fmt(d.hw)} m (desde la fundación)`;
    if (a.x - 6 - tHw.length * 6.8 > 2) txt(g, a.x - 6, a.y + 10, tHw, 'd-eje', 'end');
    else { txt(g, a.x - 6, a.y + 10, `hW = ${fmt(d.hw)} m`, 'd-eje', 'end'); txt(g, a.x - 6, a.y + 22, 'desde la fundación', 'd-eje', 'end'); }
    yW = a.y;
  }
  // eje de la torre por el CR y deformada exagerada (se traslada en el sentido del viento)
  const cr = { t: d.plano.Xr, s: d.plano.Yr };
  const c0 = P(cr.t, cr.s, 0), c1 = P(cr.t, cr.s, H + 3);
  linea(g, c0.x, c0.y, c1.x, c1.y, 'ct-eje');
  if (d.roto) {
    const dMax = Math.max(...d.roto.niveles.map(n => Math.abs(n.d)), 1e-12), kd = (S * 0.35) / dMax;
    g.append(el('polyline', { points: pts(d.roto.niveles.map(n => P(cr.t, cr.s + n.d * kd, n.z))), class: 'ct-deformada' }));
    const t = d.roto.niveles[d.roto.niveles.length - 1], q = P(cr.t, cr.s + t.d * kd, t.z);
    void q;
  }
  txt(g, c1.x + 5, c1.y, 'CR', 'ct-cr-txt');
  // diagrama de momentos en el plano del costado cercano (t = T/2), detrás de la torre en el sentido del viento:
  // el eje vertical está a s = S/2 + 8 m y M crece en el sentido del viento
  const s0 = S / 2 + 8;
  const mMax = Math.max(...d.niveles.map(n => Math.abs(n.M)), 1e-9), km = (S * 1.1) / mMax;
  const ns = [...d.niveles].filter(n => n.z >= 0).sort((a, b) => b.z - a.z);
  const curva = ns.map(n => P(T / 2, s0 + Math.abs(n.M) * km, n.z));
  g.append(el('polygon', { points: pts([P(T / 2, s0, H), ...curva, P(T / 2, s0, 0)]), class: 'ct-area momento' }));
  g.append(el('polyline', { points: pts(curva), class: 'ct-linea momento' }));
  ns.forEach((n, i) => { if (i % 3 === 0 && n.z > 0) { const a = P(T / 2, s0, n.z), b = P(T / 2, s0 + Math.abs(n.M) * km, n.z); linea(g, a.x, a.y, b.x, b.y, 'ct-ordenada'); } });
  const e0 = P(T / 2, s0, H + 2), e1 = P(T / 2, s0, 0);
  linea(g, e0.x, e0.y, e1.x, e1.y, 'ct-eje-col');
  const mPBv = Math.abs(d.PB?.M ?? d.Mv);
  const mPB = P(T / 2, s0 + mPBv * km, 0);
  txt(g, mPB.x + 6, mPB.y + 4, `M PB = ${fmt(mPBv, 0)} tm`, 'd-valor');
  txt(g, e0.x - 4, e0.y - 6, `diagrama de M (col. ${d.dir === 'A' ? 'J' : 'O'})`, 'd-eje', 'middle');
  // en la base, debajo del suelo: Q contra el viento y N hacia arriba
  const b0 = P(cr.t, cr.s, 0);
  const q0 = P(cr.t, cr.s + 10, 0);
  linea(g, b0.x, b0.y, b0.x, b0.y + 66, 'ct-hw');
  flecha(g, q0.x, q0.y + 66, b0.x, b0.y + 66, 'reaccion', 2.4);
  txt(g, b0.x - 10, b0.y + 84, `Q = ${fmt(d.PB?.Q ?? NaN, 1)} t`, 'd-valor', 'end');
  flecha(g, b0.x, b0.y + 126, b0.x, b0.y + 72, 'reaccion', 2.4);
  txt(g, b0.x - 6, b0.y + 122, `N = ${fmt(d.PB?.N ?? NaN, 0)} t`, 'd-valor', 'end');
  txt(g, b0.x - 6, b0.y + 136, 'reacciones en PB', 'd-eje', 'end');
  // cotas T, S y h
  // cotas en las aristas visibles: T al pie de barlovento, S al pie del costado cercano, h en la arista de atrás
  const a1 = P(-T / 2, -S / 2 - 4, 0), a2 = P(T / 2, -S / 2 - 4, 0);
  cota(g, a1.x, a1.y, a2.x, a2.y, `${d.dir === 'A' ? 'B' : 'L'} = ${fmt(T)} m`, 1);
  const b1 = P(T / 2 + 3, -S / 2, 0), b2 = P(T / 2 + 3, S / 2, 0);
  cota(g, b1.x, b1.y, b2.x, b2.y, `${d.dir === 'A' ? 'L' : 'B'} = ${fmt(S)} m`, -1);
  // h: la regla de los niveles hace de cota; la altura total va arriba
  const h2 = P(-T / 2, -S / 2, H);
  txt(g, h2.x - 11, h2.y - 16, `h = ${fmt(H)} m sobre PB`, 'd-valor', 'end');
  // niveles rotulados a la izquierda de la arista de barlovento
  const Yfake = (z: number) => P(-T / 2, -S / 2, z).y;
  const rot = nivelesRotulados(d, Yfake, 14);
  d.niveles.forEach(n => { if (rot.has(n) && n.z >= 0 && !(Math.abs(Yfake(n.z) - yW) < 22)) { const q = P(-T / 2, -S / 2, n.z); linea(g, q.x - 2, q.y, q.x - 8, q.y, 'ct-cota'); txt(g, q.x - 11, q.y + 3.5, `${n.nombre} ${n.z > 0 ? '+' : ''}${fmt(n.z)}`, n === d.PB ? 'd-valor' : 'ct-num', 'end'); } });
  // leyenda de lectura
  const xl = ancho - 300;
  [['carga', 'viento de cada piso Wi y resultante W'], ['momento', 'diagrama de momentos M(z)'], ['reaccion', 'reacciones en PB: Q y N'], ['deformada', 'deformada exagerada del eje (por el CR)']].forEach(([c, t], i) => {
    g.append(el('rect', { x: xl, y: 60 + i * 18, width: 14, height: 4, rx: 2, class: `ct-ley ${c}` }));
    txt(g, xl + 20, 65 + i * 18, t, 'd-eje');
  });
  if (d.roto) txt(g, xl + 20, 65 + 4 * 18, `δ azotea = ${fmt(d.roto.dTop * 1000, 1)} mm`, 'd-eje');
}

// ------------------------------------------------------------------ D · Vuelco y tensiones en el suelo
/** flecha curva (arco de círculo) con punta, para los momentos */
function arco(g: SVGElement, cx: number, cy: number, r: number, a0: number, a1: number, clase: string) {
  const p = (a: number) => ({ x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) });
  const A = p(a0), B = p(a1), grande = Math.abs(a1 - a0) > Math.PI ? 1 : 0, horario = a1 < a0 ? 1 : 0;
  g.append(el('path', { d: `M${A.x.toFixed(1)},${A.y.toFixed(1)} A${r},${r} 0 ${grande} ${horario} ${B.x.toFixed(1)},${B.y.toFixed(1)}`, class: `ct-arco ${clase}` }));
  // punta tangente al final del arco
  const t = { x: -Math.sin(a1) * (a1 > a0 ? 1 : -1), y: -Math.cos(a1) * (a1 > a0 ? 1 : -1) };
  const n = { x: -t.y, y: t.x }, L = 10, W = 5;
  g.append(el('polygon', { points: `${B.x + t.x * 4},${B.y + t.y * 4} ${B.x - t.x * L + n.x * W},${B.y - t.y * L + n.y * W} ${B.x - t.x * L - n.x * W},${B.y - t.y * L - n.y * W}`, class: `ct-arco-punta ${clase}` }));
}

function vuelcoD(g: SVGElement, d: DatosCarta, ancho: number, alto: number) {
  const v = d.vuelco, S = d.S, zF = d.zFondo, H = d.zTop;
  // ---- alzado a escala (misma escala en las dos direcciones), el viento de izquierda a derecha
  const xL = 40, xR = Math.min(640, ancho * 0.56), yT = 96, yF = alto - 190;
  const k = Math.min((yF - yT) / (H - zF), (xR - xL - 300) / Math.max(v.bB, S));
  const cx = xL + 190 + (v.bB / 2) * k;
  const X = (s: number) => cx + s * k, Y = (z: number) => yF - (z - zF) * k;
  txt(g, xL, 54, 'Alzado a escala · el viento de izquierda a derecha', 'ct-col-tit');
  // suelo, subsuelos y base
  linea(g, xL, Y(0), xR, Y(0), 'ct-calle');
  txt(g, xR, Y(0) - 5, 'nivel calle ±0,00', 'd-eje', 'end');
  if (zF < 0) g.append(el('rect', { x: X(-v.bB / 2), y: Y(0), width: v.bB * k, height: (0 - zF) * k, class: 'ct-subsuelo' }));
  g.append(el('rect', { x: X(-v.bB / 2), y: Y(zF), width: v.bB * k, height: 5, class: 'ct-base' }));
  linea(g, xL, Y(zF), X(-v.bB / 2) - 4, Y(zF), 'ct-fundacion');
  txt(g, xL, Y(zF) - 5, `fundación ${fmt(zF)}`, 'd-eje');
  // torre
  g.append(el('rect', { x: X(-S / 2), y: Y(H), width: S * k, height: H * k, class: 'ct-torre' }));
  d.niveles.filter(n => n.z > 0 && n.z < H).forEach(n => linea(g, X(-S / 2), Y(n.z), X(S / 2), Y(n.z), 'ct-losa'));
  txt(g, X(S / 2) + 6, Y(H) + 4, 'nivel azotea', 'd-eje');
  // viento de cada piso
  const sobre = d.niveles.filter(n => n.z > 0);
  const wMax = Math.max(...sobre.map(n => n.Wi), 1e-9);
  sobre.forEach(n => flecha(g, X(-S / 2) - 8 - (n.Wi / wMax) * 46, Y(n.z), X(-S / 2) - 3, Y(n.z), 'carga', 1.1));
  if (sobre[0]) txt(g, xL, Y(H) - 12, 'Wi · viento en cada piso', 'd-eje');
  // W en hW (desde la fundación) y su recta de acción hasta el eje
  const zw = zF + d.hw, I = { x: X(0), y: Y(zw) };
  flecha(g, X(-S / 2) - 96, I.y, X(-S / 2) - 60, I.y, 'resultante', 3.2);
  txt(g, X(-S / 2) - 98, I.y - 7, `W = ${fmt(d.W, 1)} t`, 'd-valor', 'start');
  linea(g, X(-S / 2) - 60, I.y, I.x, I.y, 'ct-hw');
  cota(g, X(-S / 2) - 112, Y(zF), X(-S / 2) - 112, I.y, `hW = ${fmt(d.hw)} m`, -1);
  cota(g, X(S / 2) + 110, Y(0), X(S / 2) + 110, Y(H), `h = ${fmt(H)} m`, 1);
  cota(g, X(-S / 2), Y(H) - 16, X(S / 2), Y(H) - 16, `b = ${fmt(S)} m`);
  // peso P en el eje y resultante R = W + P: corta la base a e = Mv / P del centro
  flecha(g, I.x, I.y, I.x, I.y + Math.min(70, (yF - I.y) * 0.45), 'peso', 3);
  txt(g, I.x - 7, I.y + 40, `P = ${fmt(v.P, 0)} t`, 'd-valor', 'end');
  const Bp = { x: X(v.e), y: Y(zF) };
  flecha(g, I.x, I.y, Bp.x, Bp.y, 'resultante-r', 2);
  linea(g, Bp.x, Bp.y, Bp.x + (Bp.x - I.x) * 0.02, Bp.y + 14, 'ct-r-punteada');
  txt(g, (I.x + Bp.x) / 2 + 6, (I.y + Bp.y) / 2, 'R = W + P', 'd-valor ct-rojo');
  // base: centro, núcleo central ±b'/6, e, b'/2 y el punto de giro
  const ok = Math.abs(v.e) <= v.nucleo;
  g.append(el('rect', { x: X(-v.nucleo), y: Y(zF) - 2, width: 2 * v.nucleo * k, height: 9, class: `ct-nucleo ${ok ? 'ok' : 'mal'}` }));
  linea(g, X(0), Y(zF) - 10, X(0), Y(zF) + 12, 'ct-eje');
  const giro = { x: X(v.bB / 2), y: Y(zF) + 2.5 };
  g.append(el('circle', { cx: giro.x, cy: giro.y, r: 6, class: 'ct-giro' }));
  txt(g, giro.x + 10, giro.y + 14, 'punto de giro', 'd-valor');
  cota(g, X(0), Y(zF) + 22, Bp.x, Y(zF) + 22, `e = ${fmt(v.e, 2)}`, 1);
  cota(g, X(0), Y(zF) + 46, X(v.bB / 2), Y(zF) + 46, `b'/2 = ${fmt(v.bB / 2, 2)}`, 1);
  cota(g, X(-v.bB / 2), Y(zF) + 70, X(v.bB / 2), Y(zF) + 70, `b' = ${fmt(v.bB, 2)} m`, 1);
  txt(g, X(-v.bB / 2) - 6, Y(zF) + 16, `núcleo central ±b'/6 = ±${fmt(v.nucleo, 2)}`, ok ? 'd-eje' : 'd-valor ct-rojo', 'end');
  // momentos alrededor del punto de giro: volcador (horario) y equilibrante (antihorario)
  arco(g, giro.x, giro.y, 40, Math.PI * 0.95, Math.PI * 0.45, 'volcador');
  arco(g, giro.x, giro.y, 62, Math.PI * 0.5, Math.PI * 0.92, 'equilibrante');
  txt(g, X(S / 2) + 8, Y(0) - 34, `Mv = ${fmt(v.Mv, 0)} tm volcador`, 'd-valor ct-rojo');
  txt(g, X(S / 2) + 8, Y(0) - 20, `Me = ${fmt(v.Me, 0)} tm equilibrante`, 'd-valor ct-amarillo');
  // tensiones en el suelo (compresión hacia abajo): barlovento Tmín, sotavento Tmáx
  const y0 = Y(zF) + 104, Tm = Math.max(Math.abs(v.Tmax), Math.abs(v.Tmin), 1e-9), kt = 44 / Tm;
  const pa = { x: X(-v.bB / 2), y: y0 - v.Tmin * kt }, pb = { x: X(v.bB / 2), y: y0 - v.Tmax * kt };
  g.append(el('polygon', { points: pts([{ x: X(-v.bB / 2), y: y0 }, pa, pb, { x: X(v.bB / 2), y: y0 }]), class: `ct-suelo-t ${v.Tmin > 0 ? 'traccion' : ''}` }));
  linea(g, X(-v.bB / 2), y0, X(v.bB / 2), y0, 'ct-eje-col');
  txt(g, pa.x - 6, pa.y + 4, `Tmín ${fmt(v.Tmin, 2)}`, v.Tmin > 0 ? 'd-valor ct-rojo' : 'd-valor', 'end');
  txt(g, pb.x + 6, pb.y + 4, `Tmáx ${fmt(v.Tmax, 2)} kg/cm²`, 'd-valor');
  txt(g, X(0), y0 - 6, 'tensiones en el suelo', 'd-eje', 'middle');
  // ---- derecha: planta tipo dentro de la base y las dos tablas de la hoja
  const x0 = xR + 30, w = ancho - x0 - 16;
  txt(g, x0, 54, 'Planta tipo y base', 'ct-col-tit');
  const kp = Math.min((w - 160) / Math.max(v.bB, S), 150 / Math.max(v.aB, d.T));   // deja lugar a la derecha para la cota a1
  const pcx = x0 + 60 + (Math.max(v.bB, S) / 2) * kp, pcy = 100 + (Math.max(v.aB, d.T) / 2) * kp;
  g.append(el('rect', { x: pcx - (v.bB / 2) * kp, y: pcy - (v.aB / 2) * kp, width: v.bB * kp, height: v.aB * kp, class: 'ct-base-planta' }));
  g.append(el('rect', { x: pcx - (S / 2) * kp, y: pcy - (d.T / 2) * kp, width: S * kp, height: d.T * kp, class: 'ct-planta' }));
  txt(g, pcx, pcy + 4, 'planta tipo', 'd-eje', 'middle');
  flecha(g, pcx - (v.bB / 2) * kp - 40, pcy, pcx - (v.bB / 2) * kp - 8, pcy, 'resultante', 2.4);
  txt(g, pcx - (v.bB / 2) * kp - 42, pcy - 6, 'W', 'd-valor');
  cota(g, pcx - (S / 2) * kp, pcy - (v.aB / 2) * kp - 12, pcx + (S / 2) * kp, pcy - (v.aB / 2) * kp - 12, `b = ${fmt(S)}`);
  cota(g, pcx - (v.bB / 2) * kp, pcy + (v.aB / 2) * kp + 12, pcx + (v.bB / 2) * kp, pcy + (v.aB / 2) * kp + 12, `b' = ${fmt(v.bB)}`, 1);
  cota(g, pcx + (v.bB / 2) * kp + 12, pcy - (v.aB / 2) * kp, pcx + (v.bB / 2) * kp + 12, pcy + (v.aB / 2) * kp, `a1 = ${fmt(v.aB)}`, 1);
  // tabla de vuelco (M,NyQ filas 97 a 99) y de tensiones (filas 80 a 90)
  const col = (w - 3 * 6) / 4;
  const fila = (y: number, ds: [string, string, string, string?][]) => ds.forEach(([t, val, nt, c], i) => dato(g, x0 + i * (col + 6), y, col, t, val, nt, c ?? ''));
  const yV = pcy + (Math.max(v.aB, d.T) / 2) * kp + 56;
  txt(g, x0, yV - 8, 'Vuelco (M,NyQ fila 99)', 'ct-col-tit');
  fila(yV, [['Mto volcador', `${fmt(v.Mv, 0)} tm`, 'H99'], ['Peso P', `${fmt(v.P, 0)} t`, 'I99'], ["b'/2", `${fmt(v.bB / 2, 2)} m`, 'J99'], ['Mto equilibr.', `${fmt(v.Me, 0)} tm`, 'K99']]);
  fila(yV + 52, [['coef. seguridad', fmt(v.coef, 2), 'Me / Mv ≥ 1,5', v.coef >= 1.5 ? 'ok' : 'mal'], ['e = Mv / P', `${fmt(v.e, 2)} m`, 'M99'], ["b'/6", `${fmt(v.nucleo, 2)} m`, 'N99'], ["e ≤ b'/6", ok ? 'verifica' : 'no verifica', 'sin tracción en la base', ok ? 'ok' : 'mal']]);
  const yT2 = yV + 52 * 2 + 30;
  txt(g, x0, yT2 - 8, 'Tensiones en la base (kg/cm², filas 80 a 90)', 'ct-col-tit');
  fila(yT2, [['Sb = b1·a1', `${fmt(v.Sb, 0)} m²`, 'N82'], ['N descargado', `${fmt(v.P, 0)} t`, 'N83'], ['G cargado', `${fmt(v.G, 0)} t`, 'N84 = N·9/7'], ['Tv viento', `±${fmt(v.Tv, 2)}`, '6·Mv / a1·b1²']]);
  fila(yT2 + 52, [['Tp descargado', fmt(v.Tp, 2), 'N85'], ['Tg cargado', fmt(v.Tg, 2), 'N86'], ['Tmáx sotavento', fmt(v.Tmax, 2), 'N89 = Tg − Tv'], ['Tmín barlovento', fmt(v.Tmin, 2), 'N90 ≤ 0: sin tracción', v.Tmin <= 0 ? 'ok' : 'mal']]);
  if (!v.enPlanilla) txt(g, xL, alto - 14, 'La planilla hace esta verificación solo con la cara a; acá, la misma cuenta con la cara b.', 'd-eje');
}
