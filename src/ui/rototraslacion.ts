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
import { poligonoFunicular } from '../engine/funicular';
import { fmt } from './estado';
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

export function dibujoRototraslacion(d: DatosRotoPlano, paso: Paso, tam: Tam = {}): SVGSVGElement {
  const id = `rt${nId++}`;
  const ancho = Math.max(420, tam.ancho ?? 640), alto = Math.max(420, tam.alto ?? 560);
  const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'grafico rototrasl', role: 'img',
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
  const abajo = conPoligono ? altoFuni + 36 : 150;                           // lugar para las flechas que entran por barlovento
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
  g.append(el('text', { x: xr + (coinciden ? 0 : derecha ? 4 : -4), y: Y(sTop) - 4, class: 'd-valor', 'text-anchor': coinciden ? 'middle' : derecha ? 'start' : 'end' }, coinciden ? 'eje de inercia = eje de simetría: solo traslación' : `eje de inercia · e = ${fmt(Math.abs(d.Xr))} m`));
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
  const grosor = (J: number) => 2 + 9 * Math.sqrt(J / Jmax);
  const sCentro = (p: ElementoPlano) => {
    const A = p.muros.reduce((s, m) => s + (m.largo * m.espesor), 0) || 1;
    return p.muros.reduce((s, m) => s + m.largo * m.espesor * ts(m).s, 0) / A;
  };
  const tip = (p: ElementoPlano, perp = false) => perp
    ? `${p.nombre} (perpendicular al viento: no toma traslación)\nJ = ${fmt(p.J, 3)} m⁴ · a = ${fmt(p.a)} m al eje de inercia de la otra dirección\nrotación: ${fmt(Math.abs(p.rot), 2)} t`
    : `${p.nombre}\nJ = ${fmt(p.J, 3)} m⁴ (${fmt(p.frac * 100, 1)} % de ΣJ)\na = ${fmt(p.a)} m del eje de inercia\ntraslación: ${fmt(p.tras, 2)} t\nrotación: ${fmt(p.rot, 2)} t\ntotal: ${fmt(p.total, 2)} t`;
  // rótulos sin superponerse: se corren hacia arriba si chocan
  const ocupados: { x: number; y: number }[] = [];
  const rotulo = (x: number, y: number, texto: string, clase = 'd-valor', ancla = 'middle') => {
    let yy = y;
    while (ocupados.some(o => Math.abs(o.x - x) < 46 && Math.abs(o.y - yy) < 12)) yy -= 12;
    ocupados.push({ x, y: yy });
    g.append(el('text', { x, y: yy, class: clase, 'text-anchor': ancla }, texto));
  };

  if (paso === 1) {
    // vectores J sobre cada tabique (largo ∝ J), recta de acción hasta el funicular
    const Lmax = 0.7 * d.S * k;
    d.paralelos.forEach(p => {
      const x = X(p.pos), yc = Y(sCentro(p)), L = Math.max(10, (p.J / Jmax) * Lmax);
      g.append(el('line', { x1: x, x2: x, y1: Y(-d.S / 2), y2: Y(sBot), class: 'rt-accion' }));
      const v = el('line', { x1: x, x2: x, y1: yc - L / 2, y2: yc + L / 2, class: 'rt-J', 'stroke-width': grosor(p.J), 'marker-end': `url(#${id}-J)` });
      v.append(el('title', {}, tip(p)));
      g.append(v);
      rotulo(x, yc - L / 2 - 6, `${p.nombre} · ${fmt(p.J, 2)}`);
    });
    // polígono de los J (vertical), polo y rayos; funicular debajo de la planta, a la escala de la planta, con los
    // lados paralelos a los rayos: la distancia al polo se elige para que el funicular entre en su franja
    const W0 = d.paralelos.reduce((s2, p) => s2 + p.J, 0) || 1;
    const pos = d.paralelos.map(p => p.pos);
    const span = Math.max(1, Math.max(...pos) - Math.min(...pos));
    const altoM = Math.max(1, (altoFuni - 34) / k);                          // metros de dibujo disponibles
    const Hp = (W0 * span) / (2 * altoM) * 1.05;
    const cons = poligonoFunicular(d.paralelos.map(p => ({ z: p.pos, F: p.J, nivel: p.nombre })), 0, Hp);
    const px = ancho - md + 44, pTop = ms + 22;
    const kf = Math.min((alto * 0.5) / cons.W, (md - 64) / Hp);              // escala del polígono de fuerzas (px por m⁴)
    const PY = (sAc: number) => pTop + sAc * kf;
    const O = { x: px + Hp * kf, y: pTop + (cons.W / 2) * kf };
    g.append(el('text', { x: px - 10, y: pTop - 12, class: 'd-eje' }, 'polígono de los J'));
    cons.fuerzas.forEach((f, i) => {
      const v = el('line', { x1: px, x2: px, y1: PY(cons.S[i]), y2: PY(cons.S[i + 1]), class: 'rt-J', 'stroke-width': 2.5, 'marker-end': `url(#${id}-J)` });
      v.append(el('title', {}, `${f.nivel}: J = ${fmt(f.F, 3)} m⁴`));
      g.append(v);
      if ((cons.S[i + 1] - cons.S[i]) * kf > 9) g.append(el('text', { x: px - 6, y: (PY(cons.S[i]) + PY(cons.S[i + 1])) / 2 + 4, class: 'd-eje', 'text-anchor': 'end' }, f.nivel));
    });
    cons.S.forEach((sAc, i) => g.append(el('line', { x1: px, y1: PY(sAc), x2: O.x, y2: O.y, class: i === 0 || i === cons.S.length - 1 ? 'rt-rayo extremo' : 'rt-rayo' })));
    g.append(el('circle', { cx: O.x, cy: O.y, r: 3.5, class: 'rt-cr' }));
    g.append(el('text', { x: O.x + 6, y: O.y + 4, class: 'd-eje' }, 'O'));
    // funicular: corrimiento hacia abajo, misma escala que la planta (k)
    const y0 = Y(-d.S / 2) + 30;
    const offs = cons.vertices.map(v => v.x).concat(cons.xR);
    const oMin = Math.min(...offs);
    const FY = (off: number) => y0 + (off - oMin) * k;
    const verts = cons.vertices.map(v => ({ x: X(v.z), y: FY(v.x) }));
    g.append(el('polyline', { points: verts.map(v => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' '), class: 'rt-funicular' }));
    const R = { x: X(cons.zR), y: FY(cons.xR) };
    g.append(el('line', { x1: verts[0].x, y1: verts[0].y, x2: R.x, y2: R.y, class: 'rt-funicular extremo' }));
    g.append(el('line', { x1: verts[verts.length - 1].x, y1: verts[verts.length - 1].y, x2: R.x, y2: R.y, class: 'rt-funicular extremo' }));
    g.append(el('circle', { cx: R.x, cy: R.y, r: 4, class: 'rt-cr' }));
    g.append(el('text', { x: R.x + 6, y: R.y + 14, class: 'd-valor' }, `resultante de los J: ΣJ = ${fmt(cons.W, 2)} m⁴, a ${fmt(Math.abs(cons.zR))} m del eje de simetría`));
  }

  if (paso >= 2) {
    // fuerzas: flechas debajo de la planta, sobre la recta de acción de cada tabique, entrando por barlovento
    // escala de fuerzas propia de cada paso (la rotación es chica al lado de la traslación)
    const Fmax = Math.max(1e-9, ...(paso === 2 ? d.paralelos.map(p => Math.abs(p.tras))
      : paso === 3 ? [...d.paralelos, ...d.perpendiculares].map(p => Math.abs(p.rot))
        : d.paralelos.map(p => Math.max(Math.abs(p.tras), Math.abs(p.total)))));
    const Lmax = abajo - 62;
    const base = Y(-d.S / 2) + 4;
    // piezas en la misma recta de acción: flechas una al lado de la otra
    const grupos = new Map<string, ElementoPlano[]>();
    d.paralelos.forEach(p => { const kk = p.pos.toFixed(2); grupos.set(kk, [...(grupos.get(kk) ?? []), p]); });
    const corr = new Map<ElementoPlano, number>();
    grupos.forEach(ps => { const ws = ps.map(p => grosor(p.J) + 3); const tot = ws.reduce((a, b) => a + b, 0); let acc = -tot / 2; ps.forEach((p, i) => { corr.set(p, acc + ws[i] / 2); acc += ws[i]; }); });
    d.paralelos.forEach(p => {
      const x = X(p.pos) + (corr.get(p) ?? 0), w = grosor(p.J);
      const L = (f: number) => (Math.abs(f) / Fmax) * Lmax;
      const g2 = el('g', { class: 'rt-flecha', 'data-pieza': p.nombre });
      g2.append(el('title', {}, tip(p)));
      g2.append(el('line', { x1: x, x2: x, y1: Y(-d.S / 2), y2: Y(d.S / 2), class: 'rt-accion' }));
      if (paso === 2) g2.append(el('line', { x1: x, x2: x, y1: base + L(p.tras) + 2, y2: base, class: 'rt-tras', 'stroke-width': w, 'marker-end': `url(#${id}-tras)` }));
      if (paso === 3 && Math.abs(p.rot) > Fmax * 1e-3) g2.append(el('line', { x1: x, x2: x, y1: p.rot > 0 ? base + L(p.rot) + 2 : base, y2: p.rot > 0 ? base : base + L(p.rot) + 2, class: 'rt-rot', 'stroke-width': w, 'marker-end': `url(#${id}-rot)` }));
      if (paso === 4) {
        // la flecha llena es el total; la punteada, lo que tomaría solo por traslación; el tramo violeta es la rotación
        const lt = L(p.tras), lT = L(p.total);
        g2.append(el('line', { x1: x, x2: x, y1: base + lt, y2: base, class: 'rt-fantasma', 'stroke-width': w }));
        if (p.total >= 0) g2.append(el('line', { x1: x, x2: x, y1: base + lT + 2, y2: base, class: 'rt-tras', 'stroke-width': w, 'marker-end': `url(#${id}-tras)` }));
        else g2.append(el('line', { x1: x, x2: x, y1: base, y2: base + lT + 2, class: 'rt-tras', 'stroke-width': w, 'marker-end': `url(#${id}-tras)` }));
        if (Math.abs(p.rot) > Fmax * 1e-3) {
          const y1 = base + Math.min(lt, Math.max(0, p.total >= 0 ? lT : 0)), y2 = base + Math.max(lt, p.total >= 0 ? lT : 0);
          g2.append(el('line', { x1: x + w / 2 + 3, x2: x + w / 2 + 3, y1, y2, class: `rt-rot${p.rot < 0 ? ' resta' : ''}`, 'stroke-width': 3 }));
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
      const L = Math.max(14, (Math.abs(p.rot) / Fmax) * Lmax), w = Math.min(7, grosor(p.J));
      const yc = Y(p.pos) - (w / 2 + 5);                                      // apenas por encima del muro, sin taparlo
      const x1 = X(tc) - (sentido * L) / 2, x2 = X(tc) + (sentido * L) / 2;
      const l = el('line', { x1, x2, y1: yc, y2: yc, class: 'rt-rot', 'stroke-width': w, 'marker-end': `url(#${id}-rot)` });
      l.append(el('title', {}, tip(p, true) + `\nel giro lo empuja hacia la ${sentido > 0 ? 'derecha' : 'izquierda'}`));
      g.append(l);
      rotulo(X(tc), yc - 8, `${p.nombre} ${fmt(Math.abs(p.rot), 1)} t`, 'd-eje');
    });
    // viento y momento de rotación
    // W en el eje de simetría, en la franja de las flechas (es la fuerza que las piezas se reparten)
    const yW = base + Lmax;
    g.append(el('line', { x1: X(0), x2: X(0), y1: yW, y2: yW - Math.min(Lmax, 46), class: 'rt-W', 'marker-end': `url(#${id}-W)` }));
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
  return svg;
}
