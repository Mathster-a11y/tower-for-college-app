/**
 * Perfil equivalente de una pieza, tal como queda escrito en la hoja J, al lado de sus muros en planta, para
 * controlar que el molde (simétrico, asimétrico o tubo) represente bien la pieza.
 * En los dos dibujos el viento va hacia arriba: el largo de las almas (h) queda vertical.
 *  - simétrico: alma b × h (B, C), ala superior bm × d (F, G) y ala inferior bn × d' (J, K), centradas;
 *  - tubo circular: D y d (S, T);
 *  - asimétrico: ala sup. b1 × h1 (W, X) arriba a la izquierda, alma izq. b2 × h2 (Z, AB), alma der. b3 × h3
 *    (AE, AF) y ala inf. (AH, AI); el eje de inercia está a AK del borde superior.
 */
import { fmt, COLORES } from './estado';
import type { FilaJ, FilaJRes } from '../engine/planilla';
import type { PiezaEquivalente } from '../engine/mapping';
import { rectangulos, tipoDe, type Muro } from '../engine/modelo';

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, a: Record<string, string | number> = {}, txt?: string) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v)));
  if (txt !== undefined) e.textContent = txt;
  return e;
};
type Rect = { u: number; v: number; w: number; h: number; col: string; rol: string };

/** rectángulos del perfil en coordenadas (u a la derecha, v hacia abajo desde el borde superior), en metros */
export function rectangulosPerfil(f: FilaJ): { rects: Rect[]; circ: { D: number; d: number } | null; ejeV: number | null } {
  const n = (x?: number) => (x && x > 0.011 ? x : 0);            // 0,01 es el relleno de la planilla
  const rects: Rect[] = [];
  const B = n(f.B), C = n(f.C), F = n(f.F), G = n(f.G), J = n(f.J), K = n(f.K);
  if (B && C) {
    const top = G;
    rects.push({ u: -B / 2, v: top, w: B, h: C, col: 'B · C', rol: 'alma' });
    if (F && G) rects.push({ u: -F / 2, v: 0, w: F, h: G, col: 'F · G', rol: 'ala sup.' });
    if (J && K) rects.push({ u: -J / 2, v: top + C, w: J, h: K, col: 'J · K', rol: 'ala inf.' });
    return { rects, circ: null, ejeV: top + C / 2 };
  }
  const S = n(f.S);
  if (S) return { rects, circ: { D: S, d: n(f.T) }, ejeV: null };
  const W = n(f.W), X = n(f.X), Z = n(f.Z), AB = n(f.AB), AE = n(f.AE), AF = n(f.AF), AH = n(f.AH), AI = n(f.AI);
  if (W && X) rects.push({ u: 0, v: 0, w: W, h: X, col: 'W · X', rol: 'ala sup.' });
  if (Z && AB) rects.push({ u: 0, v: X, w: Z, h: AB, col: 'Z · AB', rol: 'alma izq.' });
  if (AE && AF) rects.push({ u: (W || AE) - AE, v: X, w: AE, h: AF, col: 'AE · AF', rol: 'alma der.' });
  if (AH && AI) rects.push({ u: 0, v: X + AB, w: AH, h: AI, col: 'AH · AI', rol: 'ala inf.' });
  return { rects, circ: null, ejeV: null };
}

export function dibujoPerfil(pz: PiezaEquivalente, f: FilaJ, r: FilaJRes, muros: Muro[], ancho = 400, papeles: Record<string, { A: string; B: string }> = {}): SVGSVGElement {
  // colores de la hoja J (los de los dibujos debajo de las tablas de tabiques)
  const color = (papel: string) => COLORES[papel === 'alma izq.' ? 'alma' : papel] ?? '';
  const altoB = 250, alto = 2 * altoB + 10;
  const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'grafico perfil', role: 'img', 'aria-label': `Perfil equivalente de ${pz.nombre}` }) as SVGSVGElement;
  // ---- arriba: los muros en planta (marco del viento: el viento sube)
  const ts = (m: { x: number; y: number }) => (pz.dir === 'A' ? { t: m.x, s: m.y } : { t: -m.y, s: m.x });
  const rs = muros.flatMap(m => (tipoDe(m) === 'tubo-circ' ? [] : rectangulos(m).map(q => {
    const c = ts(q), at = pz.dir === 'A' ? q.ax : q.ay, as = pz.dir === 'A' ? q.ay : q.ax;
    return { t0: c.t - at / 2, t1: c.t + at / 2, s0: c.s - as / 2, s1: c.s + as / 2, id: m.id };
  })));
  const circs = muros.filter(m => tipoDe(m) === 'tubo-circ').map(m => ({ ...ts(m), r: m.largo / 2, ri: Math.max(0, m.largo / 2 - m.espesor) }));
  const tMin = Math.min(...rs.map(q => q.t0), ...circs.map(c => c.t - c.r)), tMax = Math.max(...rs.map(q => q.t1), ...circs.map(c => c.t + c.r));
  const sMin = Math.min(...rs.map(q => q.s0), ...circs.map(c => c.s - c.r)), sMax = Math.max(...rs.map(q => q.s1), ...circs.map(c => c.s + c.r));
  const kP = Math.min((ancho - 120) / Math.max(tMax - tMin, 0.5), (altoB - 70) / Math.max(sMax - sMin, 0.5));
  const oxP = 40 + (ancho - 120 - (tMax - tMin) * kP) / 2, oyP = 50 + (altoB - 70 - (sMax - sMin) * kP) / 2;
  const XP = (t: number) => oxP + (t - tMin) * kP, YP = (s: number) => oyP + (sMax - s) * kP;
  svg.append(el('text', { x: 10, y: 18, class: 'd-valor' }, `${pz.nombre} · muros en planta`));
  svg.append(el('text', { x: 10, y: 32, class: 'd-eje' }, `viento ${pz.dir} hacia arriba ↑ · ${pz.muros.join(', ')}`));
  rs.forEach(q => {
    svg.append(el('rect', { x: XP(q.t0), y: YP(q.s1), width: Math.max(1.5, (q.t1 - q.t0) * kP), height: Math.max(1.5, (q.s1 - q.s0) * kP), class: 'pf-muro', ...(color(papeles[q.id]?.[pz.dir] ?? '') ? { style: `fill:${color(papeles[q.id][pz.dir])}` } : {}) }));
    const vertical = q.s1 - q.s0 > q.t1 - q.t0;
    svg.append(el('text', { x: vertical ? XP(q.t0) - 4 : (XP(q.t0) + XP(q.t1)) / 2, y: vertical ? (YP(q.s0) + YP(q.s1)) / 2 + 4 : YP(q.s1) - 4, class: 'd-eje', 'text-anchor': vertical ? 'end' : 'middle' }, q.id));
  });
  circs.forEach(c => { svg.append(el('circle', { cx: XP(c.t), cy: YP(c.s), r: c.r * kP, class: 'pf-muro' })); if (c.ri > 0) svg.append(el('circle', { cx: XP(c.t), cy: YP(c.s), r: c.ri * kP, class: 'pf-hueco' })); });
  svg.append(el('line', { x1: 8, x2: ancho - 8, y1: altoB + 4, y2: altoB + 4, class: 'pf-separa' }));
  // ---- abajo: el perfil de la hoja J
  const y0 = altoB + 10;
  const { rects, circ, ejeV } = rectangulosPerfil(f);
  svg.append(el('text', { x: 10, y: y0 + 18, class: 'd-valor' }, `en la hoja J · molde ${pz.molde}`));
  svg.append(el('text', { x: 10, y: y0 + 32, class: 'd-eje' }, `fila ${pz.filaHoja === null ? '—' : pz.filaHoja + 4} de «${pz.dir === 'A' ? 'J Tabiques paralelos' : 'J Tabiques ortogonales'}»`));
  svg.append(el('text', { x: 10, y: alto - 22, class: 'd-valor' }, `J hoja = ${fmt(r.AY, 4)} m⁴ (col. AY)${pz.Jreal !== undefined ? ` · J real = ${fmt(pz.Jreal, 4)} m⁴` : ''}`));
  if (pz.Jreal) { const dif = (100 * (r.AY - pz.Jreal)) / pz.Jreal; if (Math.abs(dif) > 0.5) svg.append(el('text', { x: ancho - 10, y: alto - 8, class: Math.abs(dif) > 5 ? 'd-valor pf-mal' : 'd-eje', 'text-anchor': 'end' }, `la simplificación cambia el J ${dif > 0 ? '+' : '−'}${fmt(Math.abs(dif), 0)} %`)); }
  svg.append(el('text', { x: 10, y: alto - 8, class: 'd-eje' }, `área = ${fmt(r.O, 3)} m² (col. O)`));
  if (circ) {
    const k = Math.min((ancho - 140) / circ.D, (altoB - 90) / circ.D), cx = ancho / 2, cy = y0 + 50 + (altoB - 90) / 2;
    svg.append(el('circle', { cx, cy, r: (circ.D / 2) * k, class: 'pf-perfil' }));
    if (circ.d) svg.append(el('circle', { cx, cy, r: (circ.d / 2) * k, class: 'pf-hueco' }));
    svg.append(el('text', { x: cx + (circ.D / 2) * k + 6, y: cy + 4, class: 'd-eje' }, `D = ${fmt(circ.D)} (S) · d = ${fmt(circ.d)} (T)`));
    return svg;
  }
  if (!rects.length) { svg.append(el('text', { x: 10, y: y0 + 60, class: 'd-eje' }, 'La pieza no entró en la hoja.')); return svg; }
  const u0 = Math.min(...rects.map(q => q.u)), u1 = Math.max(...rects.map(q => q.u + q.w));
  const v1 = Math.max(...rects.map(q => q.v + q.h));
  const anchoDib = ancho * 0.26;
  const k = Math.min(anchoDib / Math.max(u1 - u0, 0.3), (altoB - 100) / Math.max(v1, 0.3));
  const ox = 62, oy = y0 + 44 + (altoB - 100 - v1 * k) / 2;
  const U = (u: number) => ox + (u - u0) * k, V = (v: number) => oy + v * k;
  const xr = U(u1) + 14;
  const usados: number[] = [];
  rects.forEach(q => {
    svg.append(el('rect', { x: U(q.u), y: V(q.v), width: Math.max(1.5, q.w * k), height: Math.max(1.5, q.h * k), class: 'pf-perfil', ...(color(q.rol) ? { style: `fill:${color(q.rol)}` } : {}) }));
    // medida de cada rectángulo con su columna de la hoja, en una columna de rótulos a la derecha
    let y = V(q.v + q.h / 2) + 4;
    while (usados.some(u => Math.abs(u - y) < 12)) y += 12;
    usados.push(y);
    svg.append(el('line', { x1: U(q.u + q.w) + 2, x2: xr - 3, y1: V(q.v + q.h / 2), y2: y - 4, class: 'pf-guia' }));
    svg.append(el('text', { x: xr, y, class: 'd-eje' }, `${q.rol} ${fmt(q.w, 2)}×${fmt(q.h, 2)} · ${q.col}`));
  });
  // eje de inercia (perpendicular al viento): en el medio del alma (simétrico) o a AK del borde superior
  const ev = ejeV ?? (isFinite(r.AK) ? r.AK : null);
  if (ev !== null) {
    svg.append(el('line', { x1: U(u0) - 14, x2: U(u1) + 8, y1: V(ev), y2: V(ev), class: 'pf-eje' }));
    svg.append(el('text', { x: U(u0) - 16, y: V(ev) + 4, class: 'd-valor', 'text-anchor': 'end' }, 'eje'));
    if (ejeV === null) svg.append(el('text', { x: U(u0) - 16, y: V(ev) + 16, class: 'd-eje', 'text-anchor': 'end' }, `AK ${fmt(ev, 2)}`));
  }
  return svg;
}
