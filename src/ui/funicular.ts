/**
 * Dibujos de la verificación funicular:
 *  1. Como en la guía (2.2): alzado a escala con W en hw y G en el eje, polígono de fuerzas y la resultante
 *     que corta la base de la fundación; el tercio medio marcado.
 *  2. Línea de presiones piso a piso: e = M / N en cada nivel contra el núcleo central de su planta
 *     (escala horizontal ampliada).
 */
import type { Funicular } from '../engine/funicular';
import { fmt } from './estado';

const NS = 'http://www.w3.org/2000/svg';
type Attrs = Record<string, string | number>;
const el = <K extends keyof SVGElementTagNameMap>(tag: K, a: Attrs = {}, txt?: string) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v)));
  if (txt !== undefined) e.textContent = txt;
  return e;
};
const flecha = (svg: SVGSVGElement, id: string, clase: string) => {
  const defs = el('defs');
  const m = el('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  m.appendChild(el('path', { d: 'M0,0 L10,5 L0,10 z', class: clase }));
  defs.appendChild(m);
  svg.appendChild(defs);
};
let nId = 0;

/** Nivel: cota y lado paralelo al viento, de la azotea hacia abajo. */
export interface PerfilTorre { z: number; lado: number; }

export function dibujoGuia(f: Funicular, perfil: PerfilTorre[]): SVGSVGElement {
  const id = `fu${nId++}`;
  const ancho = 400, alto = 440, m = 28;
  const ladoMax = Math.max(f.b, ...perfil.map(p => p.lado), 1);
  const H = f.zTop - f.zBase;
  // escala única (es una construcción gráfica: largos verdaderos); el polígono de fuerzas va a la derecha
  const anchoTorre = ancho * 0.55;
  const esc = Math.min((anchoTorre - 2 * m) / ladoMax, (alto - 2 * m - 30) / Math.max(H, 1));
  const cx = m + (anchoTorre - 2 * m) / 2 + 6;
  const X = (x: number) => cx + x * esc, Z = (z: number) => alto - m - 22 - (z - f.zBase) * esc;
  const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'funicular', role: 'img', 'aria-label': `Verificación funicular, viento ${f.dir}: la resultante corta la base a ${fmt(f.e)} m del eje; el tercio medio llega a ${fmt(f.tercio)} m` }) as SVGSVGElement;
  flecha(svg, `${id}-p`, 'punta-f');
  flecha(svg, `${id}-r`, 'punta-r');
  // torre escalonada
  const pts: string[] = [];
  const der: [number, number][] = [], izq: [number, number][] = [];
  perfil.forEach((p, i) => {
    const zSup = p.z, zInf = perfil[i + 1]?.z ?? f.zBase;
    der.push([X(p.lado / 2), Z(zSup)], [X(p.lado / 2), Z(zInf)]);
    izq.unshift([X(-p.lado / 2), Z(zInf)], [X(-p.lado / 2), Z(zSup)]);
  });
  [...der, ...izq].forEach(([a, b]) => pts.push(`${a.toFixed(1)},${b.toFixed(1)}`));
  if (pts.length) svg.appendChild(el('polygon', { points: pts.join(' '), class: 'f-torre' }));
  perfil.forEach(p => svg.appendChild(el('line', { x1: X(-p.lado / 2), x2: X(p.lado / 2), y1: Z(p.z), y2: Z(p.z), class: 'f-losa' })));
  // fundación y tercio medio
  const yb = Z(f.zBase);
  svg.appendChild(el('rect', { x: X(-f.b / 2), y: yb, width: f.b * esc, height: 8, class: 'f-fund' }));
  svg.appendChild(el('rect', { x: X(-f.tercio), y: yb, width: 2 * f.tercio * esc, height: 8, class: 'f-tercio' }));
  svg.appendChild(el('text', { x: X(0), y: yb + 22, class: 'f-txt', 'text-anchor': 'middle' }, `tercio medio ±${fmt(f.tercio)} m · base ${fmt(f.b, 1)} m`));
  svg.appendChild(el('line', { x1: X(0), x2: X(0), y1: Z(f.zTop) - 10, y2: yb + 10, class: 'f-eje' }));
  if (!(f.W > 0 && f.G > 0 && isFinite(f.hw))) return svg;
  // W en hw, G en el eje: se cortan en O
  const zO = f.zBase + f.hw;
  const xIzq = X(-ladoMax / 2) - 10;
  svg.appendChild(el('line', { x1: Math.max(4, xIzq - 30), y1: Z(zO), x2: X(0), y2: Z(zO), class: 'f-w', 'marker-end': `url(#${id}-p)` }));
  svg.appendChild(el('text', { x: Math.max(4, xIzq - 30), y: Z(zO) - 6, class: 'f-txt f-fuerza' }, `W = ${fmt(f.W, 1)} t`));
  svg.appendChild(el('text', { x: X(0) + 4, y: Z(zO) + 14, class: 'f-txt' }, `hw = ${fmt(f.hw)} m`));
  const largoG = Math.min(70, (Z(f.zBase) - Z(zO)) * 0.6);
  svg.appendChild(el('line', { x1: X(0), y1: Z(zO), x2: X(0), y2: Z(zO) + largoG, class: 'f-g', 'marker-end': `url(#${id}-p)` }));
  svg.appendChild(el('text', { x: X(0) - 4, y: Z(zO) + largoG + 12, class: 'f-txt f-fuerza', 'text-anchor': 'end' }, `G = ${fmt(f.G, 0)} t`));
  // resultante: de O hasta la base, con la pendiente W / G (largos verdaderos)
  const xe = X(f.e);
  svg.appendChild(el('line', { x1: X(0), y1: Z(zO), x2: xe, y2: yb, class: `f-r ${f.verifica ? 'ok' : 'mal'}`, 'marker-end': `url(#${id}-r)` }));
  svg.appendChild(el('circle', { cx: xe, cy: yb, r: 4, class: `f-punto ${f.verifica ? 'ok' : 'mal'}` }));
  svg.appendChild(el('text', { x: Math.max(xe, X(0)) + 12, y: yb - 8, class: 'f-txt f-fuerza' }, `e = ${fmt(f.e)} m`));
  // polígono de fuerzas (escala de fuerzas propia)
  const px = anchoTorre + 30, py = 40, hPol = alto - 140;
  const escF = hPol / f.G;
  const wLen = f.W * escF;
  const g = el('g', { class: 'f-poligono' });
  g.appendChild(el('text', { x: px, y: py - 14, class: 'f-txt' }, 'Polígono de fuerzas'));
  g.appendChild(el('line', { x1: px, y1: py, x2: px, y2: py + hPol, class: 'f-g', 'marker-end': `url(#${id}-p)` }));
  g.appendChild(el('line', { x1: px, y1: py + hPol, x2: px + Math.max(wLen, 2), y2: py + hPol, class: 'f-w', 'marker-end': `url(#${id}-p)` }));
  g.appendChild(el('line', { x1: px, y1: py, x2: px + Math.max(wLen, 2), y2: py + hPol, class: `f-r ${f.verifica ? 'ok' : 'mal'}`, 'marker-end': `url(#${id}-r)` }));
  g.appendChild(el('text', { x: px - 6, y: py + hPol / 2, class: 'f-txt', 'text-anchor': 'end' }, 'G'));
  g.appendChild(el('text', { x: px + Math.max(wLen, 2) / 2, y: py + hPol + 16, class: 'f-txt', 'text-anchor': 'middle' }, 'W'));
  g.appendChild(el('text', { x: px + Math.max(wLen, 2) + 6, y: py + hPol / 2, class: 'f-txt' }, 'R'));
  g.appendChild(el('text', { x: px, y: py + hPol + 34, class: 'f-txt f-nota' }, `escala: ${fmt(1 / escF, 0)} t por px`));
  g.appendChild(el('text', { x: px, y: py + hPol + 48, class: 'f-txt f-nota' }, `R = ${fmt(Math.hypot(f.W, f.G), 0)} t`));
  svg.appendChild(g);
  return svg;
}

export function dibujoPresiones(f: Funicular): SVGSVGElement {
  const ancho = 400, alto = 360, mi = 54, md = 14, ms = 18, mb = 34;
  const puntos = f.puntos;
  const eMax = Math.max(f.tercio, ...puntos.map(p => Math.max(p.nucleo, Math.abs(p.e))), Math.abs(f.e) || 0, 0.1) * 1.1;
  const X = (x: number) => mi + ((x + eMax) / (2 * eMax)) * (ancho - mi - md);
  const zMin = f.zBase, zMax = f.zTop;
  const Z = (z: number) => ms + ((zMax - z) / Math.max(zMax - zMin, 1)) * (alto - ms - mb);
  const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'funicular', role: 'img', 'aria-label': `Línea de presiones, viento ${f.dir}: ${puntos.filter(p => !p.dentro).length} niveles fuera del núcleo central` }) as SVGSVGElement;
  // núcleo central de cada nivel (banda) y tercio medio de la fundación
  const banda: string[] = [];
  const der = puntos.map(p => `${X(p.nucleo).toFixed(1)},${Z(p.z).toFixed(1)}`);
  const izq = puntos.map(p => `${X(-p.nucleo).toFixed(1)},${Z(p.z).toFixed(1)}`).reverse();
  banda.push(...der, `${X(f.tercio).toFixed(1)},${Z(f.zBase).toFixed(1)}`, `${X(-f.tercio).toFixed(1)},${Z(f.zBase).toFixed(1)}`, ...izq);
  if (puntos.length) svg.appendChild(el('polygon', { points: banda.join(' '), class: 'f-banda' }));
  svg.appendChild(el('line', { x1: X(0), x2: X(0), y1: ms - 6, y2: alto - mb + 4, class: 'f-eje' }));
  // ejes y rótulos
  [-eMax, 0, eMax].forEach(v => svg.appendChild(el('text', { x: X(v), y: alto - mb + 18, class: 'f-txt f-nota', 'text-anchor': v < 0 ? 'start' : v > 0 ? 'end' : 'middle' }, `${fmt(v, 1)} m`)));
  svg.appendChild(el('text', { x: X(0), y: alto - 4, class: 'f-txt f-nota', 'text-anchor': 'middle' }, 'distancia al eje (escala horizontal ampliada)'));
  const cada = Math.max(1, Math.ceil(puntos.length / 12));
  puntos.forEach((p, i) => { if ((i % cada === 0 || i === puntos.length - 1) && Math.abs(Z(p.z) - Z(f.zBase)) > 10) svg.appendChild(el('text', { x: mi - 6, y: Z(p.z) + 4, class: 'f-txt f-nota', 'text-anchor': 'end' }, p.nivel)); });
  svg.appendChild(el('text', { x: mi - 6, y: Z(f.zBase) + 4, class: 'f-txt f-nota', 'text-anchor': 'end' }, 'base'));
  // línea de presiones
  const linea = [...puntos.map(p => [X(p.e), Z(p.z)]), [X(f.e), Z(f.zBase)]].filter(([a, b]) => isFinite(a) && isFinite(b));
  svg.appendChild(el('polyline', { points: linea.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' '), class: 'f-linea' }));
  puntos.forEach(p => { if (isFinite(p.e)) svg.appendChild(el('circle', { cx: X(p.e), cy: Z(p.z), r: 2.5, class: `f-punto ${p.dentro ? 'ok' : 'mal'}` })); });
  if (isFinite(f.e)) svg.appendChild(el('circle', { cx: X(f.e), cy: Z(f.zBase), r: 4, class: `f-punto ${f.verifica ? 'ok' : 'mal'}` }));
  return svg;
}
