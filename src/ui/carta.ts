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
  /** controles principales para el pie de la carta */
  controles: { nombre: string; valor: string; estado: string }[];
}
export type Variante = 'A' | 'B' | 'C';

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
  const vertical = Math.abs(uy) > 0.9;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  if (vertical) txt(g, mx + lado * 6, my, t, 'd-valor', lado > 0 ? 'start' : 'end', { 'dominant-baseline': 'middle' });
  else txt(g, mx, my + (lado < 0 ? -5 : 13), t, 'd-valor', 'middle');
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
  const alto = variante === 'C' ? 760 : 720;
  const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: `grafico carta carta-${variante}`, role: 'img',
    'aria-label': `Carta de la torre (${variante}), viento ${d.dir}: W = ${fmt(d.W, 1)} t, M en PB = ${fmt(d.Mv, 0)} tm` }) as SVGSVGElement;
  svg.append(el('rect', { x: 0, y: 0, width: ancho, height: alto, class: 'ct-fondo' }));
  // rótulo (como el de un plano): proyecto, viento, fuente
  const g = el('g');
  svg.append(g);
  const titulos: Record<Variante, string> = { A: 'Lámina M, N y Q', B: 'Ficha de la torre', C: 'Axonometría de la ménsula' };
  txt(g, 16, 26, `${titulos[variante]} · viento ${d.dir}`, 'ct-titulo');
  txt(g, ancho - 16, 26, `${d.proyecto} · ${d.fuente}`, 'd-eje', 'end');
  linea(g, 12, 36, ancho - 12, 36, 'ct-regla');
  if (variante === 'A') laminaA(g, d, ancho, alto);
  else if (variante === 'B') fichaB(g, d, ancho, alto);
  else axonometriaC(g, d, ancho, alto);
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
    const yw = Y(d.hw);
    flecha(g, xa - 56, yw, xa - 2, yw, 'resultante', 3);
    txt(g, xa - 56, yw - 7, `W = ${fmt(d.W, 1)} t`, 'd-valor', 'start');
    linea(g, xa - 2, yw, xb + 2, yw, 'ct-hw');
    cota(g, xa + 12, Y(0), xa + 12, yw, `hw = ${fmt(d.hw)} m`, 1);
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
    ['M en PB', `${fmt(d.Mv, 0)} tm`, 'M = W · hw'],
    ['N en PB', `${fmt(PB?.N ?? NaN, 0)} t`, 'peso descargado'],
    ['M / N', `${fmt(d.Mv / (PB?.N || NaN), 2)} m`, 'excentricidad de la carga'],
  ];
  const wd = (ancho - 32 - 6 * 8) / 7;
  datos.forEach(([t, v2, nt], i) => dato(g, 16 + i * (wd + 8), yP, wd, t, v2, nt));
}

// ------------------------------------------------------------------ B · Ficha de la torre
function plantaFicha(g: SVGElement, d: DatosCarta, x0: number, y0: number, w: number, hh: number) {
  const pl = d.plano;
  const tExt = Math.max(pl.T / 2, ...pl.paralelos.map(p => Math.abs(p.pos))) + 1.5;
  const k = Math.min(w / (2 * tExt), (hh - 60) / (pl.S + 3));
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
  txt(g, X(pl.Xr) + 6, Yp(pl.Yr) + 18, 'CR · punto de giro', 'ct-cr-txt');
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
  plantaFicha(g, d, 16, 44, xAl - 50, alto - 60);
  // alzado con la deformada y W
  const y0 = 92, y1 = alto - 56;
  const Y = escalaZ(d, y0, y1);
  txt(g, xAl, 54, 'Alzado · el viento de izquierda a derecha', 'ct-col-tit');
  const rot = nivelesRotulados(d, Y, 15);
  d.niveles.forEach(n => { if (rot.has(n)) txt(g, xAl, Y(n.z) + 3.5, `${n.nombre} ${n.z > 0 ? '+' : ''}${fmt(n.z)}`, n === d.PB ? 'd-valor' : 'ct-num'); });
  const { xb, yTop, yPB } = alzado(g, d, xAl + 75, xVal - 50, Y, { presiones: true, deformada: true });
  cota(g, xb + 60, yPB, xb + 60, yTop, `h = ${fmt(d.zTop)} m`, 1);
  // datos
  const x0 = xVal, w = ancho - x0 - 16;
  txt(g, x0, 54, 'Valores', 'ct-col-tit');
  const PB = d.PB, roto = d.roto;
  const filas: [string, string, string, string?][] = [
    ['W = Σ Wi', `${fmt(d.W, 1)} t`, `a hw = ${fmt(d.hw)} m`],
    ['M en PB', `${fmt(d.Mv, 0)} tm`, 'M,NyQ · col. J'],
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
  if (isFinite(d.hw)) {
    const a = P(0, -S / 2 - 18, d.hw), b = P(0, -S / 2 - 0.3, d.hw);
    flecha(g, a.x, a.y, b.x, b.y, 'resultante', 3.2);
    txt(g, a.x - 6, a.y + 4, `W = ${fmt(d.W, 1)} t a hw = ${fmt(d.hw)} m`, 'd-valor', 'end');
  }
  // eje de la torre por el CR y deformada exagerada (se traslada en el sentido del viento)
  const cr = { t: d.plano.Xr, s: d.plano.Yr };
  const c0 = P(cr.t, cr.s, 0), c1 = P(cr.t, cr.s, H + 3);
  linea(g, c0.x, c0.y, c1.x, c1.y, 'ct-eje');
  if (d.roto) {
    const dMax = Math.max(...d.roto.niveles.map(n => Math.abs(n.d)), 1e-12), kd = (S * 0.35) / dMax;
    g.append(el('polyline', { points: pts(d.roto.niveles.map(n => P(cr.t, cr.s + n.d * kd, n.z))), class: 'ct-deformada' }));
    const t = d.roto.niveles[d.roto.niveles.length - 1], q = P(cr.t, cr.s + t.d * kd, t.z);
    txt(g, q.x + 6, q.y - 4, `δ = ${fmt(d.roto.dTop * 1000, 1)} mm (exagerada)`, 'd-valor ct-verde');
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
  const mPB = P(T / 2, s0 + Math.abs(d.Mv) * km, 0);
  txt(g, mPB.x + 6, mPB.y + 4, `M PB = ${fmt(d.Mv, 0)} tm`, 'd-valor');
  txt(g, e0.x - 4, e0.y - 6, `diagrama de M (col. ${d.dir === 'A' ? 'J' : 'O'})`, 'd-eje', 'middle');
  // en la base, debajo del suelo: Q contra el viento y N hacia arriba
  const b0 = P(cr.t, cr.s, 0);
  const q0 = P(cr.t, cr.s + 10, 0);
  linea(g, b0.x, b0.y, b0.x, b0.y + 66, 'ct-hw');
  flecha(g, q0.x, q0.y + 66, b0.x, b0.y + 66, 'reaccion', 2.4);
  txt(g, q0.x + 6, q0.y + 70, `Q = ${fmt(d.PB?.Q ?? NaN, 1)} t`, 'd-valor');
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
  d.niveles.forEach(n => { if (rot.has(n) && n.z >= 0) { const q = P(-T / 2, -S / 2, n.z); linea(g, q.x - 2, q.y, q.x - 8, q.y, 'ct-cota'); txt(g, q.x - 11, q.y + 3.5, `${n.nombre} ${n.z > 0 ? '+' : ''}${fmt(n.z)}`, n === d.PB ? 'd-valor' : 'ct-num', 'end'); } });
  // leyenda de lectura
  const xl = ancho - 290;
  [['carga', 'viento de cada piso Wi y resultante W'], ['momento', 'diagrama de momentos M(z)'], ['reaccion', 'reacciones en PB: Q y N'], ['deformada', 'deformada exagerada del eje (por el CR)']].forEach(([c, t], i) => {
    g.append(el('rect', { x: xl, y: 60 + i * 18, width: 14, height: 4, rx: 2, class: `ct-ley ${c}` }));
    txt(g, xl + 20, 65 + i * 18, t, 'd-eje');
  });
}
