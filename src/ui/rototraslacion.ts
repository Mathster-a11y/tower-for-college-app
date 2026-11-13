/**
 * Rototraslación en planta, paso a paso, como en las clases de Rigidez (clase 5) y la guía:
 *  1 · Eje de inercia: el J de cada tabique es un vector dibujado sobre el tabique; con el polígono de los J, un polo,
 *      los rayos y el polígono funicular debajo de la planta se encuentra la recta de la resultante: el eje de
 *      inercia. El centro de rigidez (CR) es su cruce con el eje de inercia de la otra dirección.
 *  2 · Traslación: cada tabique toma W · Jj / ΣJ (flecha sobre su recta de acción).
 *  3 · Rotación: Mt = W · e hace girar la planta; cada tabique toma ± W · e · Jj · aj / ΣJt·a²; también los
 *      perpendiculares.
 *  4 · Rototraslación: la suma, con el signo (+) donde la rotación se suma y (−) donde se resta.
 * En todos los pasos la flecha está sobre su tabique: su grosor es proporcional a J y su largo a la fuerza.
 * El dibujo va en el «marco del viento»: el viento siempre sube en el dibujo (en el viento B la planta se gira 90°).
 */
import type { Muro } from '../engine/modelo';
import { rectangulos, tipoDe } from '../engine/modelo';
import { fmt } from './estado';
import { activarResaltado, colorPar, letra } from './bow';
import type { Tam } from './diagramas';

const NS = 'http://www.w3.org/2000/svg';
type Attrs = Record<string, string | number>;
const el = <K extends keyof SVGElementTagNameMap>(tag: K, a: Attrs = {}, txt?: string) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v)));
  if (txt !== undefined) e.textContent = txt;
  return e;
};
let nId = 0;

/**
 * Flecha dibujada en dos partes: el tronco (línea) termina donde empieza la punta (triángulo), así no se tapan.
 * La punta es siempre bastante más ancha y larga que el tronco y lleva un borde fino del color del fondo, para que
 * se distinga del tronco aunque el tronco sea grueso.
 */
function flecha(x1: number, y1: number, x2: number, y2: number, w: number, clase: string, titulo?: string): SVGGElement {
  const g = el('g', { class: `rt-flecha-dib ${clase}` });
  const L = Math.hypot(x2 - x1, y2 - y1);
  const largoP = Math.max(9, w * 2.6), anchoP = Math.max(9, w * 3);
  const ux = L > 0 ? (x2 - x1) / L : 0, uy = L > 0 ? (y2 - y1) / L : -1;
  const lp = Math.min(largoP, L * 0.6 + 4);                                   // flechas cortas: punta proporcionada
  const bx = x2 - ux * lp, by = y2 - uy * lp;                                 // base de la punta
  // halo del color del fondo: la flecha se separa del muro o de la línea que tenga abajo
  if (L > lp) g.append(el('line', { x1, y1, x2: bx, y2: by, class: 'halo', 'stroke-width': w + 3 }));
  if (L > lp) g.append(el('line', { x1, y1, x2: bx + ux * 0.5, y2: by + uy * 0.5, class: 'tronco', 'stroke-width': w }));
  const nx = -uy * (anchoP / 2), ny = ux * (anchoP / 2);
  g.append(el('polygon', { points: `${x2},${y2} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`, class: 'punta' }));
  if (titulo) g.append(el('title', {}, titulo));
  return g;
}

export interface ElementoPlano {
  nombre: string;
  /** posición transversal al viento (paralelos) o en el sentido del viento (perpendiculares), en metros reales */
  pos: number;
  J: number;
  /** fracción de la traslación (paralelos) */
  frac: number;
  tras: number; rot: number; total: number;
  /** distancia al eje de inercia correspondiente */
  a: number;
  muros: Muro[];
  /** perpendiculares: posición transversal del centro (marco del viento) */
  tc?: number;
}
export interface DatosRotoPlano {
  dir: 'A' | 'B';
  /** ancho de la planta transversal al viento y profundidad en el sentido del viento (m) */
  T: number; S: number;
  Xr: number; Yr: number; Q: number; Mt: number;
  paralelos: ElementoPlano[];
  perpendiculares: ElementoPlano[];
  muros: Muro[];
  papeles: Record<string, { A: string; B: string }>;
}
export type Paso = 1 | 2 | 3 | 4;

export function dibujoRototraslacion(d: DatosRotoPlano, paso: Paso, tam: Tam = {}, opc: { hasta?: number } = {}): SVGSVGElement {
  const id = `rt${nId++}`;
  const ancho = Math.max(420, tam.ancho ?? 640), alto = Math.max(420, tam.alto ?? 560);
  const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: `grafico rototrasl paso-${paso}`, role: 'img',
    'aria-label': `Rototraslación, viento ${d.dir}, paso ${paso}: eje de inercia a ${fmt(d.Xr)} m del eje de simetría; Mt = ${fmt(d.Mt, 1)} tm` }) as SVGSVGElement;
  // marcadores de flecha
  const defs = el('defs');
  ([['tras', '--accent'], ['rot', '--corte'], ['J', '--accent'], ['W', '--carga'], ['tinta', '--ink']] as const).forEach(([k, c]) => {
    const m = el('marker', { id: `${id}-${k}`, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 14, markerHeight: 14, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' });
    m.append(el('path', { d: 'M0,0 L10,5 L0,10 z', style: `fill: var(${c})` }));
    defs.append(m);
  });
  svg.append(defs);

  // ---------------------------------------------------------------- zonas del dibujo
  const conPoligono = paso === 1;
  const mi = 34, md = conPoligono ? Math.min(220, ancho * 0.3) : 30, ms = 30;
  const altoFuni = conPoligono ? alto * 0.36 : 0;
  const abajo = conPoligono ? altoFuni + 36 : 196;                           // lugar para las flechas que entran por barlovento
  const tExt = Math.max(d.T / 2, ...d.paralelos.map(p => Math.abs(p.pos))) + 1;
  const k = Math.min((ancho - mi - md) / (2 * tExt), (alto - ms - abajo) / (d.S + 2));
  const cx = mi + (ancho - mi - md) / 2;
  const cy = ms + (d.S / 2 + 1) * k;
  // marco del viento: t transversal (a la derecha), s en el sentido del viento (hacia arriba)
  const X = (t: number) => cx + t * k, Y = (s: number) => cy - s * k;
  const ts = (m: { x: number; y: number }) => (d.dir === 'A' ? { t: m.x, s: m.y } : { t: -m.y, s: m.x });

  // ---------------------------------------------------------------- planta
  const g = el('g');
  svg.append(g);
  // Sentido de giro (marco del viento): W actúa en el eje de simetría (t = 0) y el CR está en t = Xr.
  // Si Xr > 0 el viento queda a la izquierda del CR y la planta gira en sentido horario (en pantalla, rotate > 0).
  const horario = d.Xr > 0;
  const gira = Math.abs(d.Xr) > 1e-3 && Math.abs(d.Mt) > 1e-9;
  // planta girada por la rotación (exagerada) en los pasos 3 y 4
  if (paso >= 3 && gira) {
    const ang = horario ? 4 : -4;
    g.append(el('rect', { x: X(-d.T / 2), y: Y(d.S / 2), width: d.T * k, height: d.S * k, class: 'rt-girada', transform: `rotate(${ang} ${X(d.Xr)} ${Y(d.Yr)})` }));
  }
  g.append(el('rect', { x: X(-d.T / 2), y: Y(d.S / 2), width: d.T * k, height: d.S * k, class: 'rt-planta' }));
  const enPieza = new Map<string, string>();
  [...d.paralelos, ...d.perpendiculares].forEach(p => p.muros.forEach(m => enPieza.set(m.id, p.nombre)));
  d.muros.forEach(m => {
    const papel = d.papeles[m.id]?.[d.dir] ?? '';
    const cl = papel === 'alma' || papel === 'tubo' || papel === 'columna' ? 'rt-muro paralelo' : 'rt-muro';
    if (tipoDe(m) === 'tubo-circ') { const c = ts(m); g.append(el('circle', { cx: X(c.t), cy: Y(c.s), r: (m.largo / 2) * k, class: cl })); return; }
    rectangulos(m).forEach(r => {
      const c = ts(r);
      const at = d.dir === 'A' ? r.ax : r.ay, as = d.dir === 'A' ? r.ay : r.ax;
      const rr = el('rect', { x: X(c.t - at / 2), y: Y(c.s + as / 2), width: Math.max(1.5, at * k), height: Math.max(1.5, as * k), class: cl, 'data-pieza': enPieza.get(m.id) ?? '' });
      rr.append(el('title', {}, `${m.id}${enPieza.get(m.id) ? ` · pieza ${enPieza.get(m.id)}` : ''} · ${papel}`));
      g.append(rr);
    });
  });
  // eje de simetría (recta del viento) y eje de inercia
  const sTop = d.S / 2 + 0.8, sBot = -d.S / 2 - (conPoligono ? altoFuni / k + 0.6 : 0.8);
  g.append(el('line', { x1: X(0), x2: X(0), y1: Y(sTop), y2: Y(-d.S / 2 - 0.8), class: 'rt-simetria' }));
  const xr = X(d.Xr);
  const coinciden = Math.abs(d.Xr) < 0.005;
  // cada rótulo del lado opuesto al otro eje, para que no se pisen
  const derecha = d.Xr >= 0;
  if (!coinciden) g.append(el('text', { x: X(0) + (derecha ? -4 : 4), y: Y(sTop) - 4, class: 'd-eje', 'text-anchor': derecha ? 'end' : 'start' }, 'eje de simetría (W)'));
  g.append(el('line', { x1: xr, x2: xr, y1: Y(sTop), y2: Y(sBot), class: 'rt-inercia' }));
  // con los dos ejes juntos, el rótulo va debajo de la planta (arriba están los nombres de las piezas)
  // (en el paso 1 va debajo de R, más abajo)
  if (coinciden && paso !== 1) g.append(el('text', { x: xr + 6, y: Y(-d.S / 2) + 16, class: 'd-valor', 'text-anchor': 'start' }, 'los dos ejes coinciden: solo traslación'));
  else if (!coinciden) g.append(el('text', { x: xr + (derecha ? 4 : -4), y: Y(sTop) - 4, class: 'd-valor', 'text-anchor': derecha ? 'start' : 'end' }, `eje de inercia · e = ${fmt(Math.abs(d.Xr))} m`));
  // centro de rigidez
  g.append(el('circle', { cx: xr, cy: Y(d.Yr), r: 5, class: 'rt-cr' }));
  g.append(el('text', { x: xr + (d.Xr >= 0 ? -30 : 30), y: Y(d.Yr) + 4, class: 'd-valor', 'text-anchor': d.Xr >= 0 ? 'end' : 'start' }, 'CR'));
  // excentricidad
  if (Math.abs(d.Xr) > 1e-3) {
    const ye = Y(-d.S / 2) + 18;
    g.append(el('line', { x1: X(0), x2: xr, y1: ye, y2: ye, class: 'rt-cota' }));
    g.append(el('text', { x: (X(0) + xr) / 2, y: ye - 4, class: 'd-valor', 'text-anchor': 'middle' }, `e = ${fmt(Math.abs(d.Xr))} m`));
  }

  // ---------------------------------------------------------------- flechas por tabique
  const Jmax = Math.max(...d.paralelos.map(p => p.J), ...d.perpendiculares.map(p => p.J), 1e-9);
  const grosor = (J: number) => 1.5 + 3.5 * Math.sqrt(J / Jmax);           // tronco de 1,5 a 5 px según J
  const sCentro = (p: ElementoPlano) => {
    const A = p.muros.reduce((s, m) => s + (m.largo * m.espesor), 0) || 1;
    return p.muros.reduce((s, m) => s + m.largo * m.espesor * ts(m).s, 0) / A;
  };
  const tip = (p: ElementoPlano, perp = false) => perp
    ? `${p.nombre} (perpendicular al viento: no toma traslación)\nJ = ${fmt(p.J, 3)} m⁴ · a = ${fmt(p.a)} m al eje de inercia de la otra dirección\nrotación: ${fmt(Math.abs(p.rot), 2)} t`
    : `${p.nombre}\nJ = ${fmt(p.J, 3)} m⁴ (${fmt(p.frac * 100, 1)} % de ΣJ)\na = ${fmt(p.a)} m del eje de inercia\ntraslación: ${fmt(p.tras, 2)} t\nrotación: ${fmt(p.rot, 2)} t\ntotal: ${fmt(p.total, 2)} t`;
  // rótulos sin superponerse: se corren hacia arriba si chocan
  const ocupados: { x: number; y: number }[] = [];
  const rotulo = (x0: number, y: number, texto: string, clase = 'd-valor', ancla = 'middle') => {
    // que no se salga del dibujo por los costados (ancho aproximado del texto: 6 px por letra)
    const medio = ancla === 'middle' ? texto.length * 3.7 : 0;
    const x = ancla === 'middle' ? Math.min(ancho - 4 - medio, Math.max(4 + medio, x0)) : x0;
    const choca = (q: number) => ocupados.some(o => Math.abs(o.x - x) < 46 && Math.abs(o.y - q) < 12);
    let yy = Math.max(14, y);
    while (choca(yy) && yy - 12 >= 14) yy -= 12;               // primero hacia arriba, sin salir del dibujo
    if (choca(yy)) { yy = Math.max(14, y); while (choca(yy) && yy + 12 < alto - 4) yy += 12; }   // si no hay lugar, hacia abajo
    ocupados.push({ x, y: yy });
    g.append(el('text', { x, y: yy, class: clase, 'text-anchor': ancla }, texto));
  };

  if (paso === 1) {
    // vectores J sobre cada tabique (largo ∝ J), recta de acción hasta el funicular
    const Lmax = 0.7 * d.S * k;
    d.paralelos.forEach(p => {
      const x = X(p.pos), yc = Y(sCentro(p)), L = Math.max(10, (p.J / Jmax) * Lmax);
      g.append(el('line', { x1: x, x2: x, y1: Y(-d.S / 2), y2: Y(sBot), class: 'rt-accion' }));
      g.append(flecha(x, yc - L / 2, x, yc + L / 2, grosor(p.J), 'rt-J', tip(p)));
      rotulo(x, yc - L / 2 - 6, `${p.nombre} · ${fmt(p.J, p.J < 0.1 ? 3 : 2)}`);
    });
    // Determinación gráfica como en la clase 5: los J se ordenan de izquierda a derecha y se ponen uno a
    // continuación del otro (polígono de los J). Los tabiques sobre la misma recta de acción (T1 y T3) van seguidos,
    // sin rayo entre ellos. Rayos 1…m+1 desde el polo O; el lado i del funicular es paralelo al rayo i y va de una
    // recta de acción a la siguiente. El primer y el último lado se prolongan hasta cortarse en R, debajo del
    // funicular: por R pasa la resultante ΣJ (el eje de inercia), que sube hasta el CR.
    const orden = [...d.paralelos].sort((a, b) => a.pos - b.pos);
    const gruposJ: { pos: number; J: number; ps: ElementoPlano[] }[] = [];
    orden.forEach(p => {
      const u = gruposJ[gruposJ.length - 1];
      if (u && Math.abs(u.pos - p.pos) < 0.01) { u.ps.push(p); u.J += p.J; } else gruposJ.push({ pos: p.pos, J: p.J, ps: [p] });
    });
    const m = gruposJ.length;
    const W0 = gruposJ.reduce((s2, x) => s2 + x.J, 0) || 1;
    const Sg = [0];
    gruposJ.forEach(x => Sg.push(Sg[Sg.length - 1] + x.J));
    // funicular con distancia polar 1 (en m): t horizontal, v hacia abajo; el lado i baja (W0/2 − Sg[i]) / H por metro
    const pend = Sg.map(sv => W0 / 2 - sv);
    const vs = [0];
    for (let i = 1; i < m; i++) vs.push(vs[i - 1] + pend[i] * (gruposJ[i].pos - gruposJ[i - 1].pos));
    const t0 = gruposJ[0].pos, tm = gruposJ[m - 1].pos;
    const tR = m > 1 ? (vs[m - 1] - vs[0] + pend[0] * t0 - pend[m] * tm) / (pend[0] - pend[m]) : t0;
    const vR1 = vs[0] + pend[0] * (tR - t0);
    const ext = 30 / k;                                                         // prolongación hacia afuera (m)
    const vE0 = vs[0] - pend[0] * ext, vEm = vs[m - 1] + pend[m] * ext;
    const vMin1 = Math.min(...vs, vE0, vEm);
    const disp = Math.max(1, (altoFuni - 70) / k);
    const Hp = Math.max(1e-9, (vR1 - vMin1) / disp);                              // distancia polar que llena la franja
    const FY = (v1: number) => Y(-d.S / 2) + 40 + ((v1 - vMin1) / Hp) * k;
    const verts = gruposJ.map((x, i) => ({ x: X(x.pos), y: FY(vs[i]) }));
    const R = { x: X(tR), y: FY(vR1) };
    const E0 = { x: X(t0 - ext), y: FY(vE0) }, Em = { x: X(tm + ext), y: FY(vEm) };

    // ---- notación de Bow: letras en los espacios entre rectas de acción (dentro de la planta, abajo)
    const visible = (i: number) => opc.hasta === undefined || i < opc.hasta;
    const bordesX = [verts[0].x - 26, ...verts.map(v => v.x), verts[m - 1].x + 26];
    // debajo de la planta si no hay cota de e; si no, adentro; si dos letras quedan muy juntas, una baja un renglón
    const yLetra = Math.abs(d.Xr) < 1e-3 ? Y(-d.S / 2) + 14 : Y(-d.S / 2) - 8;
    let xPrev = -Infinity, alterna = false;
    for (let i = 0; i <= m; i++) {
      const xm = i === 0 ? verts[0].x - 14 : i === m ? verts[m - 1].x + 14 : (bordesX[i] + bordesX[i + 1]) / 2;
      alterna = xm - xPrev < 18 ? !alterna : false;
      xPrev = xm;
      g.append(el('text', { x: xm, y: yLetra + (alterna ? 16 : 0), class: 'rt-letra', 'text-anchor': 'middle', 'data-par': i, style: `fill:${colorPar(i)}` }, letra(i)));
    }
    // ---- polígono de los J, a la derecha: cada fuerza (grupo sobre una recta) se nombra por sus dos espacios
    const px = ancho - md + 44, pTop = ms + 22;
    const kf = Math.min((alto * 0.5) / W0, (md - 64) / Hp);
    const PY = (sAc: number) => pTop + sAc * kf;
    const O = { x: px + Hp * kf, y: pTop + (W0 / 2) * kf };
    g.append(el('text', { x: px - 10, y: pTop - 12, class: 'd-eje' }, 'polígono de los J'));
    let acc = 0;
    orden.forEach(p => { g.append(flecha(px, PY(acc), px, PY(acc + p.J), 1.8, 'rt-J', `${p.nombre}: J = ${fmt(p.J, 3)} m⁴`)); acc += p.J; });
    const rotIzq: number[] = [];
    gruposJ.forEach((x, i) => {
      let y = PY(Sg[i] + x.J / 2) + 4;
      while (rotIzq.some(q => Math.abs(q - y) < 12)) y += 12;
      rotIzq.push(y);
      const tx = el('text', { x: px - 6, y, class: 'rt-letra chica neutra', 'text-anchor': 'end' }, `${letra(i)}${letra(i + 1)}`);
      tx.append(el('title', {}, `Fuerza ${letra(i)}${letra(i + 1)}: J de ${x.ps.map(p => p.nombre).join(' + ')} = ${fmt(x.J, 3)} m⁴ (separa los espacios ${letra(i)} y ${letra(i + 1)})`));
      g.append(tx);
    });
    // rayos O·a, O·b…: cada uno con el color y la letra del lado del funicular paralelo a él
    const letrasP: { x: number; y: number }[] = [];
    Sg.forEach((sAc, i) => {
      if (!visible(i)) return;
      const separa = i === 0 ? `antes de ${gruposJ[0].ps.map(p => p.nombre).join('+')}` : i === m ? `después de ${gruposJ[m - 1].ps.map(p => p.nombre).join('+')}` : `entre ${gruposJ[i - 1].ps.map(p => p.nombre).join('+')} y ${gruposJ[i].ps.map(p => p.nombre).join('+')}`;
      const ray = el('line', { x1: px, y1: PY(sAc), x2: O.x, y2: O.y, class: 'rt-rayo-c', 'data-par': i, style: `stroke:${colorPar(i)}` });
      ray.append(el('title', {}, `Rayo O${letra(i)} ∥ lado ${letra(i)} del funicular (espacio ${letra(i)}, ${separa})`));
      g.append(ray);
      // letra en el punto del polígono (corrida si choca con la anterior)
      let lx = px + 8;
      const ly = PY(sAc) + 4;
      while (letrasP.some(q => Math.abs(q.y - ly) < 11 && Math.abs(q.x - lx) < 10)) lx += 11;      // se corre a la derecha
      letrasP.push({ x: lx, y: ly });
      g.append(el('text', { x: lx, y: ly, class: 'rt-letra chica', 'data-par': i, style: `fill:${colorPar(i)}` }, letra(i)));
    });
    g.append(el('circle', { cx: O.x, cy: O.y, r: 3.5, class: 'rt-cr' }));
    g.append(el('text', { x: O.x + 6, y: O.y + 4, class: 'd-eje' }, 'O'));
    g.append(el('text', { x: px - 10, y: PY(W0) + 22, class: 'd-eje' }, 'rayo Oa ∥ lado a'));

    // ---- funicular: el lado i está en el espacio i, paralelo al rayo Oi; el primero y el último van punteados
    const lados: [{ x: number; y: number }, { x: number; y: number }][] = [[E0, R]];
    for (let i = 1; i < m; i++) lados.push([verts[i - 1], verts[i]]);
    lados.push([Em, R]);
    lados.forEach(([a2, b2], i) => {
      if (!visible(i)) return;
      const extremo = i === 0 || i === m;
      const ln = el('line', { x1: a2.x, y1: a2.y, x2: b2.x, y2: b2.y, class: `rt-lado${extremo ? ' extremo' : ''}`, 'data-par': i, style: `stroke:${colorPar(i)}` });
      ln.append(el('title', {}, `Lado ${letra(i)} ∥ rayo O${letra(i)}${extremo ? ' · lado extremo: se prolonga hasta cortarse en R' : ''}`));
      g.append(ln);
      // letra en el tramo (en los extremos, en la parte de afuera, antes del vértice)
      const q = extremo ? { x: (a2.x + (i === 0 ? verts[0].x : verts[m - 1].x)) / 2, y: (a2.y + (i === 0 ? verts[0].y : verts[m - 1].y)) / 2 } : { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
      if (extremo || Math.hypot(b2.x - a2.x, b2.y - a2.y) > 22) g.append(el('text', { x: Math.abs(q.x - R.x) < 12 ? R.x + 14 : q.x, y: q.y - 7, class: 'rt-letra', 'text-anchor': 'middle', 'data-par': i, style: `fill:${colorPar(i)}` }, letra(i)));
    });
    verts.forEach(v => g.append(el('circle', { cx: v.x, cy: v.y, r: 2.6, class: 'rt-vertice' })));
    const todo = visible(m);
    if (todo) {
      // resultante: de R sube por el eje de inercia hasta el CR (como la recta azul de la clase)
      g.append(el('line', { x1: R.x, x2: R.x, y1: R.y, y2: Y(d.Yr), class: 'rt-resultante' }));
      g.append(flecha(R.x, R.y - 34, R.x, R.y - 3, 3, 'rt-J', `ΣJ = ${fmt(W0, 3)} m⁴`));
      g.append(el('circle', { cx: R.x, cy: R.y, r: 4, class: 'rt-cr' }));
      g.append(el('text', { x: R.x, y: R.y + 18, class: 'd-valor', 'text-anchor': 'middle' }, `R: ΣJ = ${fmt(W0, 2)} m⁴`));
      g.append(el('text', { x: R.x, y: R.y + 31, class: 'd-eje', 'text-anchor': 'middle' }, Math.abs(tR) < 1e-3 ? 'sobre el eje de simetría: los dos ejes coinciden, solo traslación' : `a ${fmt(Math.abs(tR))} m del eje de simetría`));
    }
  }

  if (paso >= 2) {
    // fuerzas: flechas debajo de la planta, sobre la recta de acción de cada tabique, entrando por barlovento
    // escala de fuerzas propia de cada paso (la rotación es chica al lado de la traslación)
    const Fmax = Math.max(1e-9, ...(paso === 2 ? d.paralelos.map(p => Math.abs(p.tras))
      : paso === 3 ? [...d.paralelos, ...d.perpendiculares].map(p => Math.abs(p.rot))
        : d.paralelos.map(p => Math.max(Math.abs(p.tras), Math.abs(p.total)))));
    const Lmax = abajo - 76;
    const base = Y(-d.S / 2) + 4;
    // piezas en la misma recta de acción: flechas una al lado de la otra
    const grupos = new Map<string, ElementoPlano[]>();
    d.paralelos.forEach(p => { const kk = p.pos.toFixed(2); grupos.set(kk, [...(grupos.get(kk) ?? []), p]); });
    const corr = new Map<ElementoPlano, number>();
    grupos.forEach(ps => { const ws = ps.map(p => Math.max(9, grosor(p.J) * 3) + 4); const tot = ws.reduce((a, b) => a + b, 0); let acc = -tot / 2; ps.forEach((p, i) => { corr.set(p, acc + ws[i] / 2); acc += ws[i]; }); });
    d.paralelos.forEach(p => {
      const x = X(p.pos) + (corr.get(p) ?? 0), w = grosor(p.J);
      const L = (f: number) => (Math.abs(f) / Fmax) * Lmax;
      const g2 = el('g', { class: 'rt-flecha', 'data-pieza': p.nombre });
      g2.append(el('title', {}, tip(p)));
      g2.append(el('line', { x1: x, x2: x, y1: Y(-d.S / 2), y2: Y(d.S / 2), class: 'rt-accion' }));
      if (paso === 2) g2.append(flecha(x, base + L(p.tras) + 2, x, base, w, 'rt-tras'));
      if (paso === 3 && Math.abs(p.rot) > Fmax * 1e-3) g2.append(p.rot > 0 ? flecha(x, base + L(p.rot) + 2, x, base, w, 'rt-rot') : flecha(x, base, x, base + L(p.rot) + 2, w, 'rt-rot'));
      if (paso === 4) {
        // la flecha es el total; al costado (solo si la diferencia se ve), una línea fina punteada con lo que tomaría
        // solo por traslación y, del otro lado, el tramo violeta que la rotación suma o resta
        const lt = L(p.tras), lT = L(p.total);
        g2.append(p.total >= 0 ? flecha(x, base + lT + 2, x, base, w, 'rt-tras') : flecha(x, base, x, base + lT + 2, w, 'rt-tras'));
        if (Math.abs(lt - (p.total >= 0 ? lT : -lT)) > 5) {
          const xa = x - Math.max(9, w * 3) / 2 - 3, xb = x + Math.max(9, w * 3) / 2 + 3;
          g2.append(el('line', { x1: xa, x2: xa, y1: base + lt + 2, y2: base, class: 'rt-fantasma' }));
          g2.append(el('line', { x1: xb, x2: xb, y1: base + Math.min(lt, Math.max(lT, 0)) + 2, y2: base + Math.max(lt, lT) + 2, class: `rt-rot-tramo${p.rot < 0 ? ' resta' : ''}` }));
        }
      }
      g.append(g2);
    });
    ocupados.push({ x: X(0), y: base + Lmax + 14 });
    // rótulos por recta de acción: nombres juntos y el valor (igual para todos o uno por pieza)
    const valor = (p: ElementoPlano) => (paso === 2 ? `${fmt(p.frac * 100, 1)} %` : paso === 3 ? `${p.rot >= 0 ? '(+)' : '(−)'} ${fmt(Math.abs(p.rot), 1)} t` : `${p.rot >= 0 ? '(+)' : '(−)'} ${fmt(p.total, 1)} t`);
    [...grupos.values()].sort((a, b) => a[0].pos - b[0].pos).forEach((ps, gi) => {
      const x = X(ps[0].pos);
      const vals = [...new Set(ps.map(valor))];
      const y1 = base + Lmax + 18 + (gi % 2) * 26;                           // alternados para que no se toquen
      rotulo(x, y1, ps.map(p => p.nombre).join(' · '), 'd-eje');
      rotulo(x, y1 + 12, vals.length === 1 ? vals[0] : ps.map(valor).join(' / '), 'd-valor');
    });
    // perpendiculares: solo rotación. La flecha va sobre el muro, a lo largo del muro, con el sentido en que el giro
    // lo empuja: con giro horario, los que están por encima del CR van hacia la derecha y los de abajo, a la izquierda.
    if (paso >= 3) d.perpendiculares.forEach(p => {
      if (Math.abs(p.rot) < Fmax * 1e-3) return;
      const tc = p.tc ?? (p.muros.length ? p.muros.reduce((x, m) => x + ts(m).t * m.largo * m.espesor, 0) / p.muros.reduce((x, m) => x + m.largo * m.espesor, 0) : 0);
      const sentido = Math.sign(p.pos - d.Yr) * (horario ? 1 : -1) || 1;
      const L = Math.max(16, (Math.abs(p.rot) / Fmax) * Lmax), w = grosor(p.J);
      const yc = Y(p.pos) - 9;                                                // apenas por encima del muro, sin taparlo
      const x1 = X(tc) - (sentido * L) / 2, x2 = X(tc) + (sentido * L) / 2;
      g.append(flecha(x1, yc, x2, yc, w, 'rt-rot', tip(p, true) + `\nel giro lo empuja hacia la ${sentido > 0 ? 'derecha' : 'izquierda'}`));
      rotulo(X(tc), yc - 8, `${p.nombre} ${fmt(Math.abs(p.rot), 1)} t`, 'd-eje');
    });
    // viento y momento de rotación
    // W en el eje de simetría, en la franja de las flechas (es la fuerza que las piezas se reparten)
    const yW = base + Lmax;
    g.append(flecha(X(0), yW, X(0), yW - Math.min(Lmax, 46), 2.5, 'rt-W'));
    rotulo(X(0), yW + 14, `W = ${fmt(d.Q, 1)} t`, 'd-valor');
    if (paso >= 3 && gira) {
      // arco de 270° desde abajo: horario pasa por la izquierda y termina a la derecha bajando; antihorario, al revés
      const r = 24, c = { x: xr, y: Y(d.Yr) };
      const fin = horario ? { x: c.x + r, y: c.y } : { x: c.x - r, y: c.y };
      const arco = el('path', { d: `M ${c.x} ${c.y + r} A ${r} ${r} 0 1 ${horario ? 1 : 0} ${fin.x} ${fin.y}`, class: 'rt-Mt', 'marker-end': `url(#${id}-tinta)` });
      arco.append(el('title', {}, `Mt = W · e = ${fmt(d.Q, 1)} · ${fmt(Math.abs(d.Xr))} = ${fmt(Math.abs(d.Mt), 1)} tm, sentido ${horario ? 'horario' : 'antihorario'}`));
      g.append(arco);
      g.append(el('text', { x: c.x + (horario ? -r - 6 : r + 6), y: c.y - r - 4, class: 'd-valor', 'text-anchor': horario ? 'end' : 'start' }, `Mt = ${fmt(Math.abs(d.Mt), 0)} tm`));
    }
  }
  activarResaltado(svg);
  // paso a paso: el último par agregado queda marcado
  if (opc.hasta !== undefined) svg.querySelectorAll(`[data-par="${opc.hasta - 1}"]`).forEach(e => e.classList.add('ultimo'));
  return svg;
}
