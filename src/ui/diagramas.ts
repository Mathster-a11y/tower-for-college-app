/**
 * Diagramas en SVG: en altura (presión, fuerza por piso, corte, momento, deformada), rototraslación en planta y
 * rigidez. Una sola escala por gráfico; a lo sumo dos series, con leyenda y rótulos directos; al pasar el mouse
 * por un nivel aparece su valor (y la tabla de valores va debajo de cada diagrama).
 */
import { fmt } from './estado';
import type { Reparto, Rigidez } from '../engine/diagramas';
import type { Muro } from '../engine/modelo';

const NS = 'http://www.w3.org/2000/svg';
type Attrs = Record<string, string | number>;
const el = <K extends keyof SVGElementTagNameMap>(tag: K, a: Attrs = {}, txt?: string) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v)));
  if (txt !== undefined) e.textContent = txt;
  return e;
};

/** marcas «lindas» del eje: 1, 2 o 5 × 10ⁿ */
export function marcas(min: number, max: number, n = 4): number[] {
  if (!(max > min)) { max = min + 1; }
  const paso0 = (max - min) / n;
  const p10 = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 5, 10].map(k => k * p10).find(k => k >= paso0) ?? 10 * p10;
  const out: number[] = [];
  for (let v = Math.ceil(min / paso - 1e-9) * paso; v <= max + 1e-9; v += paso) out.push(Math.abs(v) < paso * 1e-9 ? 0 : v);
  return out;
}
const decimales = (v: number[]) => { const p = v.length > 1 ? Math.abs(v[1] - v[0]) : 1; return p >= 1 ? 0 : p >= 0.1 ? 1 : p >= 0.01 ? 2 : 3; };

export type Color = 'carga' | 'corte' | 'deformada' | 'traccion' | 'compresion' | 'acento' | 'tinta';
/** tamaño del dibujo en píxeles (el SVG se dibuja a tamaño real: el texto no se agranda) */
export interface Tam { ancho?: number; alto?: number; }
const VAR: Record<Color, string> = { carga: '--carga', corte: '--corte', deformada: '--deformada', traccion: '--traccion', compresion: '--compresion', acento: '--accent', tinta: '--ink' };
/** muestra de leyenda (línea con su color, punteada si corresponde) */
export function muestra(color: Color, texto: string, punteada = false): HTMLElement {
  const sp = document.createElement('span');
  const i = document.createElement('i');
  i.style.setProperty('--c', `var(${VAR[color]})`);
  if (punteada) i.className = 'punteada';
  sp.append(i, texto);
  return sp;
}

export interface SerieAltura {
  nombre: string;
  /** clase de color: s1 (azul), s2 (naranja), tinta (texto) */
  /** color por significado: carga (viento), corte, deformada, tracción, compresión, acento, tinta */
  color: Color;
  /** línea punteada (segunda codificación además del color) */
  punteada?: boolean;
  tipo: 'linea' | 'barras';
  puntos: { z: number; x: number; nivel: string }[];
}
export interface GraficoAltura {
  titulo: string;
  eje: string;
  unidad: string;
  series: SerieAltura[];
  /** líneas verticales de referencia (por ejemplo, el límite h/500) */
  referencias?: { x: number; texto: string }[];
  /** marcas horizontales (por ejemplo, la altura hw de la resultante) */
  alturas?: { z: number; texto: string }[];
  decimales?: number;
  /** el eje vertical son categorías (piezas), no cotas: sin línea de PB ni cota en el rótulo */
  categorias?: boolean;
}

export function graficoAltura(g: GraficoAltura, tam: Tam = {}): HTMLElement {
  // margen izquierdo según el nombre de nivel más largo (los muy largos se acortan con «…»; el nombre entero va en el título)
  const corto = (n: string) => (n.length > 14 ? n.slice(0, 13).trimEnd() + '…' : n);
  const largoNom = Math.max(4, ...g.series.flatMap(s => s.puntos.map(p => corto(String(p.nivel ?? '')).length)));
  const ancho = Math.max(300, tam.ancho ?? 400), alto = Math.max(240, tam.alto ?? 340), mi = Math.min(120, Math.max(56, 14 + largoNom * 6.7)), md = 18, ms = 14, mb = 42;
  const fig = document.createElement('figure');
  fig.className = 'diagrama';
  const cap = document.createElement('figcaption');
  cap.textContent = g.titulo;
  fig.append(cap);
  if (g.series.length > 1) {
    const ley = document.createElement('div');
    ley.className = 'leyenda';
    g.series.forEach(s => ley.append(muestra(s.color, s.nombre, s.punteada)));
    fig.append(ley);
  }
  const todos = g.series.flatMap(s => s.puntos);
  if (!todos.length) { fig.append(Object.assign(document.createElement('p'), { className: 'nota', textContent: 'Sin datos.' })); return fig; }
  const xs = [...todos.map(p => p.x), ...(g.referencias ?? []).map(r => r.x), 0];
  const zs = todos.map(p => p.z);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const pad = (xMax - xMin) * 0.06 || 1;
  const tx = marcas(xMin < 0 ? xMin - pad : 0, xMax + (xMax > 0 ? pad : 0));
  const x0 = Math.min(tx[0], xMin), x1 = Math.max(tx[tx.length - 1], xMax);
  const zMin = Math.min(...zs), zMax = Math.max(...zs);
  const X = (x: number) => mi + ((x - x0) / (x1 - x0 || 1)) * (ancho - mi - md);
  const Z = (z: number) => ms + ((zMax - z) / (zMax - zMin || 1)) * (alto - ms - mb);
  const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'grafico', role: 'img', 'aria-label': g.titulo });
  // grilla y ejes (recesivos)
  tx.forEach(v => {
    svg.append(el('line', { x1: X(v), x2: X(v), y1: ms, y2: alto - mb, class: v === 0 ? 'd-cero' : 'd-grilla' }));
    // la última marca se apoya hacia adentro para que su número no se salga del dibujo
    const ancla = X(v) > ancho - md - 24 ? 'end' : 'middle';
    svg.append(el('text', { x: ancla === 'end' ? Math.min(X(v) + 4, ancho - 2) : X(v), y: alto - mb + 15, class: 'd-eje', 'text-anchor': ancla }, fmt(v, decimales(tx))));
  });
  svg.append(el('text', { x: (mi + ancho - md) / 2, y: alto - 6, class: 'd-eje', 'text-anchor': 'middle' }, `${g.eje} (${g.unidad})`));
  // niveles: rótulos en el eje vertical (no más de ~10)
  const niveles = [...new Map(todos.map(p => [p.z, p.nivel])).entries()].sort((a, b) => b[0] - a[0]);
  const cada = Math.max(1, Math.ceil(niveles.length / 10));
  niveles.forEach(([z, n], i) => { if (i % cada === 0 || i === niveles.length - 1) { const t = el('text', { x: mi - 6, y: Math.min(Z(z) + 4, alto - mb - 2), class: 'd-eje', 'text-anchor': 'end' }, corto(n)); if (corto(n) !== n) t.append(el('title', {}, n)); svg.append(t); } });   // el más bajo no baja hasta las marcas del eje
  if (!g.categorias && zMin < 0) svg.append(el('line', { x1: mi, x2: ancho - md, y1: Z(0), y2: Z(0), class: 'd-pb' }));
  // series
  const dec = g.decimales ?? 2;
  const nb = g.series.filter(s => s.tipo === 'barras').length;
  let ib = 0;
  g.series.forEach(s => {
    if (s.tipo === 'barras') {
      const alturaBarra = Math.max(2, Math.min(8, ((alto - ms - mb) / Math.max(niveles.length, 1)) * 0.6 / nb));
      s.puntos.forEach(p => {
        const xa = X(Math.min(0, p.x)), xb = X(Math.max(0, p.x));
        svg.append(el('rect', { x: xa, y: Z(p.z) - (alturaBarra * nb) / 2 + ib * alturaBarra, width: Math.max(1, xb - xa), height: alturaBarra - (nb > 1 ? 1 : 0), rx: Math.min(2, alturaBarra / 2), class: `d-c-${s.color}` }));
      });
      ib++;
    } else {
      const pts = s.puntos.filter(p => isFinite(p.x)).sort((a, b) => b.z - a.z).map(p => `${X(p.x).toFixed(1)},${Z(p.z).toFixed(1)}`);
      svg.append(el('polyline', { points: pts.join(' '), class: `d-linea d-c-${s.color}-l${s.punteada ? ' punteada' : ''}` }));
      if (s.puntos.length <= 60) s.puntos.forEach(p => { if (isFinite(p.x)) svg.append(el('circle', { cx: X(p.x), cy: Z(p.z), r: 2.4, class: `d-c-${s.color}` })); });
    }
    // rótulo directo en el extremo de mayor |x|
    const ext = s.puntos.reduce((m, p) => (Math.abs(p.x) > Math.abs(m.x) ? p : m), s.puntos[0]);
    if (ext && g.series.length <= 4) {
      const derecha = X(ext.x) > ancho - 70, izquierda = X(ext.x) < mi + 40;
      // al costado del punto (la curva sigue para arriba o para abajo, no para el costado)
      const yv = Z(ext.z) + 4;
      const texto = fmt(ext.x, dec), anchoT = texto.length * 7;
      // a la izquierda solo si entra sin meterse en el margen de los rótulos de los niveles
      const aIzq = !izquierda && (derecha || ext.x < 0) && X(ext.x) - 6 - anchoT > mi;
      // posiciones posibles alrededor del punto: la primera que no cruza ninguna curva del gráfico
      const curvas = g.series.filter(q => q.tipo !== 'barras').map(q => q.puntos.filter(p => isFinite(p.x)).sort((a, b) => b.z - a.z).map(p => ({ x: X(p.x), y: Z(p.z) })));
      const cruza = (x0: number, y0: number, x1: number, y1: number) => curvas.some(c => c.some((a, i) => {
        const b = c[i + 1]; if (!b) return false;
        for (let t = 0; t <= 1; t += 0.05) { const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t; if (x > x0 && x < x1 && y > y0 && y < y1) return true; }
        return false;
      }));
      const X0 = X(ext.x), Y0 = Z(ext.z);
      const cand: [number, number, 'start' | 'end'][] = [[X0 + 8, yv, 'start'], [X0 + 8, Y0 - 8, 'start'], [X0 + 8, Y0 + 16, 'start'], [X0 - 8, Y0 - 8, 'end'], [X0 - 8, Y0 + 16, 'end'], [X0 - 4, Y0 - 22, 'end'], [X0 - 4, Y0 - 34, 'end'], [X0 + 4, Y0 - 22, 'start']];
      if (aIzq) cand.unshift([X0 - 8, yv, 'end']);
      const [xv, yv2, ancla] = cand.find(([x, y, a]) => { const x0 = a === 'start' ? x : x - anchoT; return x0 > mi && x0 + anchoT < ancho - 2 && y < alto - mb && y - 11 > 0 && !cruza(x0, y - 11, x0 + anchoT, y + 2); }) ?? cand[0];   // sin bajar a la fila de las marcas del eje
      svg.append(el('text', { x: xv, y: yv2, class: 'd-valor', 'text-anchor': ancla }, texto));
    }
  });
  // referencias
  (g.referencias ?? []).forEach(r => {
    svg.append(el('line', { x1: X(r.x), x2: X(r.x), y1: ms, y2: alto - mb, class: 'd-ref' }));
    svg.append(el('text', { x: X(r.x) + (X(r.x) > ancho - 90 ? -4 : 4), y: ms + 10, class: 'd-eje d-ref-txt', 'text-anchor': X(r.x) > ancho - 90 ? 'end' : 'start' }, r.texto));
  });
  (g.alturas ?? []).forEach(a => {
    svg.append(el('line', { x1: mi, x2: ancho - md, y1: Z(a.z), y2: Z(a.z), class: 'd-ref' }));
    svg.append(el('text', { x: ancho - md - 2, y: Z(a.z) - 5, class: 'd-eje d-ref-txt', 'text-anchor': 'end' }, a.texto));
  });
  // capa de lectura: una banda por nivel con todos los valores
  niveles.forEach(([z, n], i) => {
    const arriba = i === 0 ? ms : (Z(niveles[i - 1][0]) + Z(z)) / 2, abajo = i === niveles.length - 1 ? alto - mb : (Z(z) + Z(niveles[i + 1][0])) / 2;
    const b = el('rect', { x: mi, y: arriba, width: ancho - mi - md, height: Math.max(1, abajo - arriba), class: 'd-banda' });
    const valores = g.series.map(s => { const p = s.puntos.find(q => q.z === z); return p ? `${s.nombre}: ${fmt(p.x, dec)} ${g.unidad}` : null; }).filter(Boolean);
    b.append(el('title', {}, `${g.categorias ? n : `${n} (cota ${fmt(z, 2)} m)`}\n${valores.join('\n')}`));
    svg.append(b);
  });
  // los rótulos van encima de barras y líneas (sistema de diseño, 7: los rótulos nunca quedan tapados)
  const primeraBanda = svg.querySelector('.d-banda');
  svg.querySelectorAll('text.d-valor, text.d-ref-txt').forEach(t => {
    // fondo redondeado del color del lienzo (ancho estimado: la letra mono mide ~0,6 de su cuerpo)
    const x = +(t.getAttribute('x') ?? 0), y = +(t.getAttribute('y') ?? 0), w = (t.textContent ?? '').length * 6.9 + 6;
    const anc = t.getAttribute('text-anchor'), x0 = anc === 'end' ? x - w + 3 : anc === 'middle' ? x - w / 2 : x - 3;
    svg.insertBefore(el('rect', { x: x0, y: y - 12, width: w, height: 16, rx: 3, class: 'd-fondo' }), primeraBanda);
    svg.insertBefore(t, primeraBanda);
  });
  fig.append(svg);
  return fig;
}

/** Tabla de valores de un diagrama (vista accesible). */
export function tablaValores(cols: string[], filas: (string | number)[][], dec: number[] = []): HTMLElement {
  const det = document.createElement('details');
  det.className = 'tabla-valores';
  const sum = document.createElement('summary');
  sum.textContent = 'Ver la tabla de valores';
  det.append(sum);
  const t = document.createElement('table');
  t.className = 'tabla compacta';
  t.innerHTML = `<thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>`;
  const tb = document.createElement('tbody');
  filas.forEach(f => { const tr = document.createElement('tr'); f.forEach((v, j) => { const td = document.createElement('td'); if (typeof v === 'number') { td.className = 'n'; td.textContent = fmt(v, dec[j] ?? 2); } else td.textContent = v; tr.append(td); }); tb.append(tr); });
  t.append(tb);
  const s = document.createElement('div'); s.className = 'scroll'; s.append(t);
  det.append(s);
  return det;
}

/**
 * Rototraslación en planta: el contorno, los muros, la resultante del viento (en el eje), el eje de inercia (centro
 * de rigidez) y, en cada pieza, la fuerza de traslación y la de rotación (barras con un mismo eje de fuerzas).
 */
export function graficoReparto(rep: Reparto, dir: 'A' | 'B', B: number, L: number, muros: Muro[], papeles: Record<string, { A: string; B: string }>, tam: Tam = {}): HTMLElement {
  const ancho = Math.max(320, tam.ancho ?? 400), alto = Math.max(340, tam.alto ?? 380), m = 18;
  const fig = document.createElement('figure');
  fig.className = 'diagrama';
  const cap = document.createElement('figcaption');
  cap.textContent = `Rototraslación, viento ${dir}: fuerza que toma cada pieza`;
  fig.append(cap);
  const ley = document.createElement('div');
  ley.className = 'leyenda';
  ley.append(muestra('acento', 'traslación (J / ΣJ · Q)'), muestra('corte', 'rotación (por Mt = Q · e)'));
  fig.append(ley);
  // planta: t = transversal al viento (eje horizontal del dibujo), s = sentido del viento (hacia arriba)
  const T = dir === 'A' ? B : L, S = dir === 'A' ? L : B;
  const tMax = Math.max(T / 2, ...rep.piezas.map(p => Math.abs(p.pos)), 1) + 1;
  const escPl = Math.min((ancho - 2 * m) / (2 * tMax), (alto * 0.42) / Math.max(S, 1));
  const arribaPl = 34, yPl = arribaPl + (S * escPl) / 2;   // la planta arriba; las fuerzas en una franja abajo
  const cx = ancho / 2;
  const Xp = (t: number) => cx + t * escPl, Yp = (s: number) => yPl - s * escPl;
  const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'grafico', role: 'img', 'aria-label': `Rototraslación del viento ${dir}: el eje de inercia está a ${fmt(rep.d)} m de la resultante del viento` });
  svg.append(el('rect', { x: Xp(-T / 2), y: Yp(S / 2), width: T * escPl, height: S * escPl, class: 'd-contorno' }));
  muros.forEach(mu => {
    const t = dir === 'A' ? mu.x : mu.y, s = dir === 'A' ? mu.y : mu.x;
    const largoT = (dir === 'A') === (mu.dir === 'X') ? mu.largo : mu.espesor, largoS = (dir === 'A') === (mu.dir === 'X') ? mu.espesor : mu.largo;
    const r = el('rect', { x: Xp(t - largoT / 2), y: Yp(s + largoS / 2), width: Math.max(1.5, largoT * escPl), height: Math.max(1.5, largoS * escPl), class: papeles[mu.id]?.[dir] === 'alma' ? 'd-muro-alma' : 'd-muro' });
    r.append(el('title', {}, `${mu.id} · ${papeles[mu.id]?.[dir] ?? ''}`));
    svg.append(r);
  });
  // resultante del viento (en el eje de la cara) y eje de inercia
  svg.append(el('line', { x1: Xp(0), x2: Xp(0), y1: Yp(S / 2) - 10, y2: Yp(-S / 2) + 10, class: 'd-viento' }));
  svg.append(el('text', { x: Xp(0) + 4, y: Yp(-S / 2) + 22, class: 'd-eje d-ref-txt' }, `resultante del viento Q = ${fmt(rep.Q, 1)} t`));
  if (isFinite(rep.d)) {
    svg.append(el('line', { x1: Xp(rep.d), x2: Xp(rep.d), y1: Yp(S / 2) - 10, y2: Yp(-S / 2) + 10, class: 'd-inercia' }));
    const izq = Xp(rep.d) > ancho - 150;
    svg.append(el('text', { x: Xp(rep.d) + (izq ? -4 : 4), y: Yp(S / 2) - 14, class: 'd-eje d-ref-txt', 'text-anchor': izq ? 'end' : 'start' }, `eje de inercia (d = ${fmt(rep.d)} m)`));
  }
  // fuerzas por pieza: barras desde la línea de base, en la posición de cada pieza
  const base = alto - 52, hMax = Math.max(60, base - (Yp(-S / 2) + 44));
  const qMax = Math.max(...rep.piezas.flatMap(p => [Math.abs(p.Qtras), Math.abs(p.Qrot)]), 1e-9);
  const Y = (q: number) => base - (q / qMax) * hMax;
  svg.append(el('line', { x1: m, x2: ancho - m, y1: base, y2: base, class: 'd-cero' }));
  svg.append(el('text', { x: m, y: alto - 30, class: 'd-eje' }, `escala de fuerzas: barra más alta = ${fmt(qMax, 1)} t`));
  svg.append(el('text', { x: m, y: alto - 14, class: 'd-eje' }, `e = ${fmt(rep.d)} m · Mt = Q · e = ${fmt(rep.Mt, 1)} tm`));
  const anchoB = Math.max(5, Math.min(9, ancho / 80));
  rep.piezas.forEach(p => {
    const x = Xp(p.pos);
    svg.append(el('line', { x1: x, x2: x, y1: Yp(-S / 2), y2: Y(Math.max(p.Qtras, p.Qrot, 0)) - 14, class: 'd-guia' }));
    const r1 = el('rect', { x: x - anchoB - 1, y: Math.min(Y(p.Qtras), base), width: anchoB, height: Math.max(1, Math.abs(Y(p.Qtras) - base)), rx: 1.5, class: 'd-c-acento' });
    const r2 = el('rect', { x: x + 1, y: Math.min(Y(p.Qrot), base), width: anchoB, height: Math.max(1, Math.abs(Y(p.Qrot) - base)), rx: 1.5, class: 'd-c-corte' });
    [r1, r2].forEach(r => r.append(el('title', {}, `${p.nombre} (posición ${fmt(p.pos)} m)\nJ = ${fmt(p.J, 3)} m⁴ (${fmt(p.frac * 100, 1)} %)\ntraslación ${fmt(p.Qtras, 2)} t\nrotación ${fmt(p.Qrot, 2)} t\ntotal ${fmt(p.Qtot, 2)} t`)));
    svg.append(r1, r2);
  });
  // rótulo de las piezas que más toman (sin amontonar)
  const usados: number[] = [];
  [...rep.piezas].sort((a, b) => Math.abs(b.Qtot) - Math.abs(a.Qtot)).forEach(p => {
    const x = Xp(p.pos);
    if (usados.some(u => Math.abs(u - x) < 34)) return;
    usados.push(x);
    svg.append(el('text', { x, y: Math.min(Y(Math.max(p.Qtras, p.Qrot, 0)), base) - 4, class: 'd-valor', 'text-anchor': 'middle' }, p.nombre));
  });
  fig.append(svg);
  return fig;
}

/** ΣJ de cada dirección contra el J mínimo (h/400, h/500, h/600): barras con una misma escala. */
export function graficoRigidez(rs: Rigidez[], tam: Tam = {}): HTMLElement {
  const ancho = Math.max(320, tam.ancho ?? 400), fila = ancho < 560 ? 86 : 64, mi = 70, md = 20, ms = 20;   // angosto: lugar para los rótulos en renglones
  const alto = ms + fila * rs.length + 24;
  const fig = document.createElement('figure');
  fig.className = 'diagrama';
  const cap = document.createElement('figcaption');
  cap.textContent = 'Rigidez: ΣJ de cada dirección contra el J mínimo';
  fig.append(cap);
  const xMax = Math.max(...rs.flatMap(r => [r.J, r.minimos.h600])) * 1.3;
  const tx = marcas(0, xMax);
  const X = (x: number) => mi + (x / Math.max(tx[tx.length - 1], xMax)) * (ancho - mi - md);
  const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'grafico', role: 'img', 'aria-label': rs.map(r => `viento ${r.dir}: ΣJ ${fmt(r.J, 2)} m⁴, J mínimo h/500 ${fmt(r.minimos.h500, 2)} m⁴`).join('; ') });
  tx.forEach(v => { svg.append(el('line', { x1: X(v), x2: X(v), y1: ms - 6, y2: alto - 24, class: v === 0 ? 'd-cero' : 'd-grilla' })); svg.append(el('text', { x: X(v), y: alto - 8, class: 'd-eje', 'text-anchor': 'middle' }, fmt(v, decimales(tx)))); });
  rs.forEach((r, i) => {
    const y = ms + i * fila;
    const ok = r.J >= r.minimos.h500;
    svg.append(el('text', { x: mi - 8, y: y + 20, class: 'd-eje', 'text-anchor': 'end' }, `Viento ${r.dir}`));
    const barra = el('rect', { x: X(0), y: y + 10, width: Math.max(1, X(r.J) - X(0)), height: 14, rx: 3, class: r.J >= r.minimos.h500 ? 'd-c-acento' : 'd-c-traccion' });
    barra.append(el('title', {}, `Viento ${r.dir}: ΣJ = ${fmt(r.J, 3)} m⁴\nJ mín h/400 = ${fmt(r.minimos.h400, 3)}\nJ mín h/500 = ${fmt(r.minimos.h500, 3)}\nJ mín h/600 = ${fmt(r.minimos.h600, 3)} m⁴`));
    svg.append(barra);
    svg.append(el('text', { x: X(r.J) + 4, y: y + 21, class: 'd-valor' }, `${fmt(r.J, 2)} m⁴ ${ok ? '✓' : '✗'}`));
    // rótulos de los J mínimos: si quedan muy juntos (pantallas chicas), cada uno baja un renglón
    let xAnt = -Infinity, renglon = 0;
    ([['h400', 'h/400'], ['h500', 'h/500'], ['h600', 'h/600']] as const).forEach(([k, t]) => {
      const x = X(r.minimos[k]);
      renglon = Math.abs(x - xAnt) < 38 ? renglon + 1 : 0;
      xAnt = x;
      svg.append(el('line', { x1: x, x2: x, y1: y + 4, y2: y + 30 + renglon * 12, class: k === 'h500' ? 'd-ref fuerte' : 'd-ref' }));
      svg.append(el('text', { x, y: y + 42 + renglon * 12, class: 'd-eje', 'text-anchor': 'middle' }, t));
    });
  });
  fig.append(svg);
  return fig;
}

/**
 * Tensiones de una pieza a lo largo del sentido del viento (desde el baricentro de la pieza): cada alma como un
 * segmento (σ lineal entre sus dos fibras extremas), cada ala como un punto (axial). Descargado y cargado;
 * referencias en 0 y en la compresión límite (σbk, como la guía).
 */
export function graficoTensiones(v: import('../engine/flexocompresion').VerifPieza, adm: number, tam: Tam = {}): HTMLElement {
  const ancho = Math.max(320, tam.ancho ?? 400), alto = Math.max(220, tam.alto ?? 240), mi = 50, md = 16, ms = 16, mb = 36;
  const fig = document.createElement('figure');
  fig.className = 'diagrama';
  const ley = document.createElement('div');
  ley.className = 'leyenda';
  ley.append(muestra('traccion', 'descargado, 0,7 t/m² (verifica la tracción)', true), muestra('compresion', 'cargado, 0,9 t/m² (verifica la compresión)'));
  fig.append(ley);
  const tramos = v.muros.map(m => {
    const [y1, y2] = m.papel === 'ala' ? [m.d, m.d] : [m.d - m.h / 2, m.d + m.h / 2];
    // desc[0]/carg[0] corresponden a la fibra más alejada del baricentro
    const lejos = Math.abs(y1) >= Math.abs(y2) ? y1 : y2, cerca = lejos === y1 ? y2 : y1;
    return { m, lejos, cerca };
  });
  const ys = tramos.flatMap(t => [t.lejos, t.cerca]);
  const sig = [...v.muros.flatMap(m => [...m.desc, ...m.carg, m.cargReves].map(x => x / 10)), 0, -adm * 0.25];
  const yMin = Math.min(...ys) - 0.3, yMax = Math.max(...ys) + 0.3;
  const sMin = Math.min(...sig), sMax = Math.max(...sig, 1);
  const ts = marcas(sMin, sMax);
  const s0 = Math.min(ts[0], sMin), s1 = Math.max(ts[ts.length - 1], sMax);
  const X = (y: number) => mi + ((y - yMin) / (yMax - yMin || 1)) * (ancho - mi - md);
  const Y = (s: number) => ms + ((s1 - s) / (s1 - s0 || 1)) * (alto - ms - mb);
  const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'grafico', role: 'img', 'aria-label': `Tensiones de ${v.nombre}: tracción máxima ${fmt(v.traccion, 1)} kg/cm², compresión máxima ${fmt(v.compresion, 1)} kg/cm²` });
  ts.forEach(t => { svg.append(el('line', { x1: mi, x2: ancho - md, y1: Y(t), y2: Y(t), class: t === 0 ? 'd-cero' : 'd-grilla' })); svg.append(el('text', { x: mi - 6, y: Y(t) + 4, class: 'd-eje', 'text-anchor': 'end' }, fmt(t, 0))); });
  if (-adm >= s0) { svg.append(el('line', { x1: mi, x2: ancho - md, y1: Y(-adm), y2: Y(-adm), class: 'd-ref fuerte' })); svg.append(el('text', { x: ancho - md - 2, y: Y(-adm) - 4, class: 'd-eje d-ref-txt', 'text-anchor': 'end' }, `límite σbk −${adm}`)); }
  if (s1 > 0) svg.append(el('rect', { x: mi, y: Y(s1), width: ancho - mi - md, height: Y(0) - Y(s1), class: 'd-traccion' }));
  svg.append(el('text', { x: mi, y: ms - 2, class: 'd-eje' }, 'σ (kg/cm²) · arriba de 0: tracción'));
  svg.append(el('text', { x: (mi + ancho - md) / 2, y: alto - 6, class: 'd-eje', 'text-anchor': 'middle' }, 'posición en el sentido del viento, desde el baricentro de la pieza (m)'));
  marcas(yMin, yMax, 5).forEach(t => svg.append(el('text', { x: X(t), y: alto - mb + 14, class: 'd-eje', 'text-anchor': 'middle' }, fmt(t, 1))));
  tramos.forEach(({ m, lejos, cerca }) => {
    ([['desc', 'traccion'], ['carg', 'compresion']] as const).forEach(([k, c]) => {
      const [a, b] = m[k].map(x => x / 10);
      const tip = `${m.id} (${m.papel})\n${k === 'desc' ? 'descargado' : 'cargado'}: ${fmt(a, 1)} / ${fmt(b, 1)} kg/cm²`;
      if (m.papel === 'ala') {
        const l = el('line', { x1: X(lejos), x2: X(lejos), y1: Y(a), y2: Y(b), class: `d-linea d-c-${c}-l${k === 'desc' ? ' punteada' : ''}` });
        l.append(el('title', {}, tip));
        svg.append(l);
        [a, b].forEach(s => svg.append(el('circle', { cx: X(lejos), cy: Y(s), r: 3, class: `d-c-${c}` })));
      } else {
        const l = el('line', { x1: X(lejos), y1: Y(a), x2: X(cerca), y2: Y(b), class: `d-linea d-c-${c}-l${k === 'desc' ? ' punteada' : ''}` });
        l.append(el('title', {}, tip));
        svg.append(l);
        [[lejos, a], [cerca, b]].forEach(([yy, ss]) => svg.append(el('circle', { cx: X(yy), cy: Y(ss), r: 2.5, class: `d-c-${c}` })));
      }
    });
    // compresión con el viento al revés, si es mayor que la del diagrama de un sentido (alma corrida del baricentro)
    if (m.papel !== 'ala' && m.cargReves < Math.min(...m.carg) - 1e-6) {
      const c = el('circle', { cx: X(lejos), cy: Y(m.cargReves / 10), r: 4.5, class: 'd-reves' });
      c.append(el('title', {}, `${m.id}: con el viento al revés, esta fibra queda a ${fmt(m.cargReves / 10, 1)} kg/cm² (compresión máxima)`));
      svg.append(c);
      // a la derecha del punto; si no entra, a la izquierda
      const anchoT = 'viento al revés'.length * 6.7, xp = X(lejos);
      const lado = xp + 7 + anchoT < ancho - 2 ? 'start' : xp - 7 - anchoT > 2 ? 'end' : 'middle';
      const tx = lado === 'start' ? xp + 7 : lado === 'end' ? xp - 7 : Math.min(ancho - 2 - anchoT / 2, Math.max(2 + anchoT / 2, xp));
      svg.append(el('text', { x: tx, y: Y(m.cargReves / 10) + (lado === 'middle' ? -9 : 4), class: 'd-eje', 'text-anchor': lado }, 'viento al revés'));
    }
    svg.append(el('text', { x: X((lejos + cerca) / 2), y: Y(s0) - 4, class: 'd-eje', 'text-anchor': 'middle' }, m.id));
  });
  fig.append(svg);
  return fig;
}
