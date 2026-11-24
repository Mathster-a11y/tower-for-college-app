/**
 * Dibujos de la guía: cómo funciona el túnel de viento numérico, en esquemas chicos (SVG). Colores de la app: la
 * presión que empuja en azul (comprime) y la succión en rojo (tracciona); la velocidad con el espectro térmico; las
 * partículas, las flechas y las celdas en tinta, sin rojo ni azul.
 */
const NS = 'http://www.w3.org/2000/svg';
type A = Record<string, string | number>;
function s(tag: string, a: A = {}, ...hijos: (SVGElement | string)[]): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v));
  hijos.forEach(x => e.append(typeof x === 'string' ? document.createTextNode(x) : x));
  return e;
}
const TINTA = '#2b3440', SUAVE = '#c9ced6', FONDO = '#f4f6f9', EMPUJA = '#378add', SUCCIONA = '#e24b4a';
const TERM = ['#2e1a52', '#5b3290', '#9a5aa8', '#d590b0', '#f3bf7a', '#fdf2b8'];
/** una flecha de (x1, y1) a (x2, y2) */
function flecha(x1: number, y1: number, x2: number, y2: number, color = TINTA, ancho = 1.6): SVGElement {
  const a = Math.atan2(y2 - y1, x2 - x1), c = 5;
  const p1 = `${x2 - c * Math.cos(a - 0.45)},${y2 - c * Math.sin(a - 0.45)}`, p2 = `${x2 - c * Math.cos(a + 0.45)},${y2 - c * Math.sin(a + 0.45)}`;
  return s('g', {}, s('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': ancho, 'stroke-linecap': 'round' }), s('polygon', { points: `${x2},${y2} ${p1} ${p2}`, fill: color }));
}
const texto = (x: number, y: number, t: string, a: A = {}) => s('text', { x, y, 'font-size': 10, fill: TINTA, 'font-family': 'system-ui, sans-serif', ...a }, t);
const lienzo = (w: number, h: number, titulo: string, ...hijos: SVGElement[]) =>
  s('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: 'img', 'aria-label': titulo, class: 'ilustracion' }, s('title', {}, titulo), ...hijos);

/** 1: el aire en cuadraditos alrededor de la torre */
function celdas(): SVGElement {
  const g: SVGElement[] = [s('rect', { x: 0, y: 0, width: 220, height: 130, fill: FONDO, rx: 6 })];
  for (let x = 10; x <= 210; x += 12) g.push(s('line', { x1: x, y1: 8, x2: x, y2: 122, stroke: SUAVE, 'stroke-width': 0.8 }));
  for (let y = 8; y <= 122; y += 12) g.push(s('line', { x1: 10, y1: y, x2: 210, y2: y, stroke: SUAVE, 'stroke-width': 0.8 }));
  g.push(s('rect', { x: 82, y: 44, width: 48, height: 36, fill: TINTA, rx: 1 }), texto(106, 66, 'torre', { 'text-anchor': 'middle', fill: '#fff', 'font-weight': 600 }));
  g.push(s('rect', { x: 10, y: 8, width: 12, height: 12, fill: 'none', stroke: '#ef9f27', 'stroke-width': 2 }), texto(26, 18, 'una celda', { 'font-size': 9 }));
  g.push(flecha(82, 100, 130, 100, '#8a6d00', 1.2), flecha(130, 100, 82, 100, '#8a6d00', 1.2), texto(106, 113, '4 celdas por ancho', { 'text-anchor': 'middle', 'font-size': 9 }));
  return lienzo(220, 130, 'El aire dividido en celdas alrededor de la torre', ...g);
}
/** 2: una celda con sus 9 direcciones */
function direcciones(): SVGElement {
  const g: SVGElement[] = [s('rect', { x: 50, y: 15, width: 100, height: 100, fill: FONDO, stroke: TINTA, 'stroke-width': 1.2, rx: 4 })];
  const c = { x: 100, y: 65 };
  [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].forEach(([dx, dy]) => {
    const L = dx && dy ? 38 : 42, n = Math.hypot(dx, dy);
    g.push(flecha(c.x, c.y, c.x + (dx / n) * L, c.y + (dy / n) * L, TINTA, 1.4));
  });
  g.push(s('circle', { cx: c.x, cy: c.y, r: 5, fill: '#ef9f27' }));
  g.push(texto(160, 40, '4 rectas', { 'font-size': 9 }), texto(160, 54, '4 diagonales', { 'font-size': 9 }), texto(160, 68, '1 quieta (●)', { 'font-size': 9 }), texto(160, 90, 'en 3D: 19', { 'font-size': 9, 'font-weight': 600 }));
  return lienzo(220, 130, 'Una celda con sus 9 direcciones', ...g);
}
/** 3: saltar y chocar */
function saltarChocar(): SVGElement {
  const g: SVGElement[] = [];
  const caja = (x: number, t: string) => { g.push(s('rect', { x, y: 30, width: 54, height: 54, fill: FONDO, stroke: TINTA, rx: 4 }), texto(x + 27, 102, t, { 'text-anchor': 'middle', 'font-size': 9 })); };
  caja(8, 'antes'); caja(84, 'salto'); caja(160, 'choque');
  g.push(flecha(22, 57, 50, 57), flecha(35, 70, 35, 42));
  g.push(flecha(70, 57, 92, 57, '#8a6d00'), s('circle', { cx: 111, cy: 57, r: 4, fill: TINTA }), flecha(111, 44, 111, 30, '#8a6d00'));
  [[1, 0], [0, -1], [1, -1], [-1, 0], [0, 1]].forEach(([dx, dy], k) => g.push(flecha(187, 57, 187 + dx * (14 - k), 57 + dy * (14 - k), TINTA, 1.1)));
  g.push(texto(110, 18, 'cada paso: saltar a la vecina y mezclarse', { 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 600 }));
  return lienzo(222, 112, 'Un paso de la simulación: saltar y chocar', ...g);
}
/** 4: el rebote en la pared (exacta y en escalera) */
function rebote(): SVGElement {
  const g: SVGElement[] = [s('rect', { x: 0, y: 0, width: 220, height: 120, fill: FONDO, rx: 6 })];
  for (let x = 10; x <= 210; x += 20) g.push(s('line', { x1: x, y1: 10, x2: x, y2: 110, stroke: SUAVE, 'stroke-width': 0.8 }));
  for (let y = 10; y <= 110; y += 20) g.push(s('line', { x1: 10, y1: y, x2: 210, y2: y, stroke: SUAVE, 'stroke-width': 0.8 }));
  // pared curva real (exacta) y su escalera
  g.push(s('path', { d: 'M150 10 Q120 60 150 110 L210 110 L210 10 Z', fill: '#d9dde3' }), s('path', { d: 'M150 10 Q120 60 150 110', fill: 'none', stroke: TINTA, 'stroke-width': 2 }));
  g.push(s('path', { d: 'M150 10 V30 H130 V90 H150 V110', fill: 'none', stroke: '#8f9198', 'stroke-width': 1.4, 'stroke-dasharray': '4 3' }));
  g.push(flecha(70, 50, 124, 50), flecha(124, 58, 70, 58, '#8a6d00'));
  g.push(texto(14, 24, 'llega', { 'font-size': 9 }), texto(14, 76, 'rebota por donde vino', { 'font-size': 9 }), texto(158, 62, 'pared', { 'font-size': 9, fill: TINTA, 'font-weight': 600 }));
  g.push(texto(14, 104, '─ exacta   - - en escalera', { 'font-size': 9 }));
  return lienzo(220, 120, 'El aire rebota en la pared', ...g);
}
/** 5: los bordes del túnel */
function tunel(): SVGElement {
  const g: SVGElement[] = [s('rect', { x: 30, y: 15, width: 170, height: 90, fill: FONDO, stroke: TINTA, rx: 3 })];
  [0.3, 0.5, 0.7, 0.85, 1].forEach((f, k) => g.push(flecha(6, 95 - k * 18, 6 + 22 * f, 95 - k * 18, TINTA, 1.3)));
  g.push(s('rect', { x: 92, y: 62, width: 20, height: 43, fill: TINTA }));
  g.push(texto(115, 11, 'techo: el aire desliza', { 'font-size': 9, 'text-anchor': 'middle' }), texto(203, 52, 'sale', { 'font-size': 9 }), texto(2, 116, 'entra (más fuerte arriba)', { 'font-size': 9 }));
  g.push(flecha(202, 60, 226, 60, TINTA, 1.3));
  return lienzo(232, 120, 'El túnel: el viento entra por la izquierda y sale por la derecha', ...g);
}
/** 7: la escala de velocidades: veces el viento que llega → km/h */
function escala(): SVGElement {
  const g: SVGElement[] = [];
  const grad = s('linearGradient', { id: 'ilu-term', x1: 0, x2: 1, y1: 0, y2: 0 });
  TERM.forEach((c, k) => grad.append(s('stop', { offset: `${(k / (TERM.length - 1)) * 100}%`, 'stop-color': c })));
  g.push(s('defs', {}, grad), s('rect', { x: 22, y: 30, width: 176, height: 16, fill: 'url(#ilu-term)', rx: 3 }));
  ([[0, '0 ×', 'quieto', 'start'], [0.625, '1 ×', 'el que llega', 'middle'], [1, '1,6 ×', '+60 %', 'end']] as const).forEach(([f, a, b, al]) => {
    const x = 22 + 176 * f, tx = al === 'start' ? x - 2 : al === 'end' ? x + 2 : x;
    g.push(s('line', { x1: x, y1: 26, x2: x, y2: 50, stroke: TINTA, 'stroke-width': 1 }), texto(tx, 22, a, { 'text-anchor': al, 'font-size': 9, 'font-weight': 600 }), texto(tx, 61, b, { 'text-anchor': al, 'font-size': 8.5 }));
  });
  g.push(texto(110, 80, '1,2 × = 20 % más rápido', { 'text-anchor': 'middle', 'font-size': 9.5 }), texto(110, 94, 'si llega a 40 km/h: 1,2 × = 48 km/h', { 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 600 }));
  return lienzo(220, 102, 'La simulación mide en veces el viento que llega', ...g);
}
/** 9: el Cp alrededor de la torre: empuja adelante (azul), succiona a los costados y atrás (rojo) */
function presion(): SVGElement {
  const g: SVGElement[] = [s('rect', { x: 80, y: 35, width: 60, height: 50, fill: '#d9dde3', stroke: TINTA })];
  for (let y = 40; y <= 80; y += 10) g.push(flecha(58, y, 78, y, EMPUJA, 1.6));
  for (let x = 88; x <= 132; x += 11) { g.push(flecha(x, 33, x, 18, SUCCIONA, 1.4), flecha(x, 87, x, 102, SUCCIONA, 1.4)); }
  for (let y = 42; y <= 78; y += 12) g.push(flecha(142, y, 156, y, SUCCIONA, 1.2));
  for (let y = 40; y <= 80; y += 20) g.push(flecha(10, y, 40, y, '#8a6d00', 1.3));
  g.push(texto(12, 104, 'viento', { 'font-size': 9 }), texto(4, 12, 'empuja (+)', { 'font-size': 9, fill: EMPUJA, 'font-weight': 600 }), texto(216, 12, 'succiona (−)', { 'font-size': 9, fill: SUCCIONA, 'font-weight': 600, 'text-anchor': 'end' }));
  return lienzo(220, 112, 'La presión alrededor de la torre', ...g);
}
/** el dibujo de cada paso de la simulación (por su número; no todos tienen) */
export const ILUSTRACION_PASO: Partial<Record<number, () => SVGElement>> = { 1: celdas, 2: direcciones, 3: saltarChocar, 4: rebote, 5: tunel, 7: escala, 9: presion };
