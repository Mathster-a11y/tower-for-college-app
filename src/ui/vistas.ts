/**
 * Vistas del modelo para el informe: plantas (cortadas a 1,20 m, con puertas y ventanas), cortes verticales (los
 * elementos cortados piso por piso, con sus huecos, dinteles y antepechos, y las losas) y alzados (la silueta de la torre
 * en cada nivel y el exoesqueleto de la cara que se mira). Todo en SVG (líneas nítidas al imprimir), a escala, sacado
 * del mismo modelo que el 3D. Además, capturas del 3D que se guardan con el botón 📷 del visor.
 */
import { estado, fmt } from './estado';
import { presenteEn, tipoDe, type Proyecto } from '../engine/modelo';
import { plantaDeNivel, puntosSilueta } from '../engine/silueta';
import { prismasCalados, solidosEnAltura, type P } from '../engine/aberturas';
import { datosExo } from './exo';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag: string, a: Record<string, string | number> = {}, txt?: string) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v)));
  if (txt !== undefined) e.textContent = txt;
  return e as SVGElement;
};

/** capturas del 3D guardadas para el informe (en esta sesión) */
export const vistas3D: { titulo: string; png: string }[] = [];

/** marco de un dibujo a escala: ventana del mundo (x0..x1, y0..y1) en un SVG de ancho px, con su escala gráfica */
function lienzo(x0: number, x1: number, y0: number, y1: number, ancho: number, alto: number, titulo: string) {
  const m = 34, k = Math.min((ancho - 2 * m) / (x1 - x0 || 1), (alto - 2 * m - 18) / (y1 - y0 || 1));
  const X = (x: number) => m + (x - x0) * k, Y = (y: number) => alto - m - (y - y0) * k;
  const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'vista-dib', role: 'img', 'aria-label': titulo }) as SVGSVGElement;
  svg.append(el('rect', { x: 0, y: 0, width: ancho, height: alto, fill: '#fff' }));
  // escala gráfica de 5 o 10 m
  const L = (x1 - x0) > 60 ? 20 : (x1 - x0) > 25 ? 10 : 5, xs = m, ys = alto - 12;
  svg.append(el('line', { x1: xs, y1: ys, x2: xs + L * k, y2: ys, stroke: '#111', 'stroke-width': 1.5 }));
  [0, L / 2, L].forEach(t => svg.append(el('line', { x1: xs + t * k, y1: ys - 4, x2: xs + t * k, y2: ys + 1, stroke: '#111' })));
  svg.append(el('text', { x: xs + L * k + 6, y: ys + 3, 'font-size': 10, 'font-family': 'monospace', fill: '#333' }, `${L} m`));
  return { svg, X, Y, k };
}
const poly = (pts: P[], X: (x: number) => number, Y: (y: number) => number) => pts.map(q => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' ');

/** planta del nivel i, cortada a 1,20 m sobre el piso: los elementos con sus puertas y ventanas, la losa y los ejes */
export function plantaSVG(p: Proyecto, i: number, ancho = 900, alto = 620): SVGSVGElement {
  const n = p.niveles[i], z = n.cota, zF = p.niveles.at(-1)?.cota ?? 0, zT = p.niveles[0]?.cota ?? 0;
  const sil = puntosSilueta(plantaDeNivel(p, i).silueta, 12);
  const xs = sil.map(q => q.x), ys = sil.map(q => q.y);
  const { svg, X, Y } = lienzo(Math.min(...xs) - 2, Math.max(...xs) + 2, Math.min(...ys) - 2, Math.max(...ys) + 2, ancho, alto, `Planta ${n.nombre}`);
  svg.append(el('polygon', { points: poly(sil, X, Y), fill: '#f4f6f8', stroke: '#555', 'stroke-width': 1.2 }));
  // ejes centrales
  svg.append(el('line', { x1: X(0), y1: Y(Math.min(...ys) - 1.5), x2: X(0), y2: Y(Math.max(...ys) + 1.5), stroke: '#999', 'stroke-dasharray': '10 3 2 3', 'stroke-width': 0.8 }));
  svg.append(el('line', { x1: X(Math.min(...xs) - 1.5), y1: Y(0), x2: X(Math.max(...xs) + 1.5), y2: Y(0), stroke: '#999', 'stroke-dasharray': '10 3 2 3', 'stroke-width': 0.8 }));
  const zCorte = z + 1.2;
  p.muros.filter(m => presenteEn(m, zCorte, zF, zT)).forEach(m => {
    const t = tipoDe(m);
    const pgs = t === 'perfil' ? [] : solidosEnAltura(m, 1.2);
    pgs.forEach(pg => svg.append(el('polygon', { points: poly(pg, X, Y), fill: '#222', stroke: '#111', 'stroke-width': 0.6 })));
    if (t === 'perfil' && m.perfil) svg.append(el('polygon', { points: poly(m.perfil.v.map(q => ({ x: m.x + q.x, y: m.y + q.y })), X, Y), fill: '#222' }));
    // puertas: arco de abrir; ventanas: doble línea (en los tabiques)
    (m.aberturas ?? []).forEach(a => {
      if (t !== 'tabique') return;
      const ux = m.dir === 'X' ? 1 : 0, uy = 1 - ux, cx = m.x + ux * a.s, cy = m.y + uy * a.s;
      if (a.desde <= 1e-6) {
        const r = a.ancho, ax = cx - ux * a.ancho / 2, ay = cy - uy * a.ancho / 2;
        svg.append(el('path', { d: `M${X(ax)},${Y(ay)} L${X(ax + uy * r)},${Y(ay + ux * r)} A${r * (X(1) - X(0))},${r * (X(1) - X(0))} 0 0 1 ${X(cx + ux * a.ancho / 2)},${Y(cy + uy * a.ancho / 2)}`, fill: 'none', stroke: '#777', 'stroke-width': 0.7 }));
      } else {
        const e = m.espesor / 4;
        [-e, e].forEach(d => svg.append(el('line', { x1: X(cx - ux * a.ancho / 2 + uy * d), y1: Y(cy - uy * a.ancho / 2 + ux * d), x2: X(cx + ux * a.ancho / 2 + uy * d), y2: Y(cy + uy * a.ancho / 2 + ux * d), stroke: '#555', 'stroke-width': 0.7 })));
      }
    });
    svg.append(el('text', { x: X(m.x) + 4, y: Y(m.y) - 4, 'font-size': 9, 'font-family': 'monospace', fill: '#1a6bbd' }, m.id));
  });
  // cotas generales
  const B = Math.max(...xs) - Math.min(...xs), L = Math.max(...ys) - Math.min(...ys);
  svg.append(el('text', { x: X((Math.min(...xs) + Math.max(...xs)) / 2), y: Y(Math.max(...ys)) - 8, 'text-anchor': 'middle', 'font-size': 11, 'font-family': 'monospace', fill: '#333' }, `${fmt(B, 2)} m`));
  svg.append(el('text', { x: X(Math.max(...xs)) + 6, y: Y((Math.min(...ys) + Math.max(...ys)) / 2), 'font-size': 11, 'font-family': 'monospace', fill: '#333' }, `${fmt(L, 2)} m`));
  svg.append(el('text', { x: 34, y: 18, 'font-size': 12, 'font-weight': 700, fill: '#111' }, `Planta ${n.nombre} (corte a 1,20 m sobre el piso, cota ${fmt(z, 2)} m)`));
  return svg;
}

/** intervalo de un polígono (convexo) cortado por la recta x = c (eje 'x') o y = c (eje 'y'), sobre la otra coordenada */
function cortePol(pg: P[], eje: 'x' | 'y', c: number): [number, number] | null {
  const vals: number[] = [];
  for (let i = 0; i < pg.length; i++) {
    const a = pg[i], b = pg[(i + 1) % pg.length];
    const ua = eje === 'x' ? a.x : a.y, ub = eje === 'x' ? b.x : b.y, va = eje === 'x' ? a.y : a.x, vb = eje === 'x' ? b.y : b.x;
    if ((ua - c) * (ub - c) <= 0 && Math.abs(ub - ua) > 1e-12) vals.push(va + ((c - ua) / (ub - ua)) * (vb - va));
    else if (Math.abs(ua - c) < 1e-12) vals.push(va);
  }
  return vals.length >= 2 ? [Math.min(...vals), Math.max(...vals)] : null;
}

/**
 * Corte vertical por el plano x = c (eje 'x': se mira a lo largo de x, en el dibujo va y) o y = c (eje 'y': va x). Los
 * elementos cortados se rellenan piso por piso (con los huecos de sus puertas y ventanas); las losas son una faja.
 */
export function corteSVG(p: Proyecto, eje: 'x' | 'y', c: number, ancho = 900, altoMax = 1180): SVGSVGElement {
  const zs = p.niveles.map(n => n.cota).sort((a, b) => a - b), zF = zs[0], zT = zs[zs.length - 1];
  const sil0 = puntosSilueta(plantaDeNivel(p, p.niveles.findIndex(n => n.cota >= 0)).silueta, 12);
  const otra = sil0.map(q => (eje === 'x' ? q.y : q.x));
  const h0 = Math.min(...otra) - 3, h1 = Math.max(...otra) + 6;
  // el dibujo toma la proporción de la torre (alta y angosta: vertical), sin pasar el alto de una hoja
  const alto = Math.round(Math.min(altoMax, Math.max(420, (ancho - 68) * ((zT + 2 - zF) / (h1 - h0)) + 86)));
  const { svg, X, Y } = lienzo(h0, h1, zF, zT + 2, ancho, alto, `Corte ${eje} = ${c}`);
  const rect = (u0: number, u1: number, z0: number, z1: number, fill: string) => svg.append(el('rect', { x: X(u0), y: Y(z1), width: Math.max(0.6, X(u1) - X(u0)), height: Math.max(0.6, Y(z0) - Y(z1)), fill }));
  // terreno
  svg.append(el('line', { x1: X(h0), y1: Y(0), x2: X(h1), y2: Y(0), stroke: '#6b4f2a', 'stroke-width': 1.4 }));
  // losas: faja de 0,20 m bajo cada nivel donde la silueta corta el plano
  p.niveles.forEach((n, i) => {
    const sil = puntosSilueta(plantaDeNivel(p, i).silueta, 12), iv = cortePol(sil, eje, c);
    if (iv) rect(iv[0], iv[1], n.cota - 0.2, n.cota, '#8a949e');
    svg.append(el('text', { x: X(h1) + 2, y: Y(n.cota) + 3, 'font-size': 8, 'font-family': 'monospace', fill: '#555' }, `${n.nombre} ${fmt(n.cota, 2)}`));
  });
  // elementos cortados, piso por piso
  p.muros.forEach(m => {
    if (tipoDe(m) === 'perfil') return;
    const a = Math.max(zF, m.zDesde ?? zF), b = Math.min(zT, m.zHasta ?? zT);
    const pisos = [a, ...zs.filter(z => z > a + 1e-6 && z < b - 1e-6), b];
    for (let k = 0; k + 1 < pisos.length; k++) {
      const za = pisos[k], zb = pisos[k + 1];
      const trozos = za >= 0 && m.aberturas?.length ? prismasCalados(m, za, zb) : solidosEnAltura({ ...m, aberturas: null }, 0).map(pol => ({ pol, za, zb }));
      trozos.forEach(t => { const iv = cortePol(t.pol, eje, c); if (iv) rect(iv[0], iv[1], t.za, t.zb - 0.2 > t.za ? t.zb - 0.2 : t.zb, '#222'); });
    }
  });
  svg.append(el('text', { x: 34, y: 18, 'font-size': 12, 'font-weight': 700, fill: '#111' }, `Corte por ${eje} = ${fmt(c, 2)} m (se mira a lo largo de ${eje}; en el dibujo va ${eje === 'x' ? 'y' : 'x'})`));
  return svg;
}

/**
 * Alzado de la torre mirando el viento dir de frente (A: se ve la cara de ancho B, en x; B: la de ancho L, en y): la
 * silueta de cada nivel, las losas y, si hay exoesqueleto, las barras de la cara que se mira.
 */
export function alzadoSVG(p: Proyecto, dir: 'A' | 'B', ancho = 900, altoMax = 1180): SVGSVGElement {
  const zs = p.niveles.map(n => n.cota), zF = Math.min(...zs), zT = Math.max(...zs);
  const anchoEn = (i: number) => { const q = plantaDeNivel(p, i); return dir === 'A' ? q.B : q.L; };
  const W = Math.max(...p.niveles.map((_, i) => anchoEn(i)));
  const alto = Math.round(Math.min(altoMax, Math.max(420, (ancho - 68) * ((zT + 2 - Math.min(0, zF)) / (W + 6)) + 86)));
  const { svg, X, Y } = lienzo(-W / 2 - 3, W / 2 + 3, Math.min(0, zF), zT + 2, ancho, alto, `Alzado viento ${dir}`);
  svg.append(el('line', { x1: X(-W / 2 - 3), y1: Y(0), x2: X(W / 2 + 3), y2: Y(0), stroke: '#6b4f2a', 'stroke-width': 1.4 }));
  // silueta: cada entrepiso con el ancho del nivel de arriba
  const orden = p.niveles.map((n, i) => ({ z: n.cota, w: anchoEn(i), n: n.nombre })).sort((a, b) => a.z - b.z).filter(q => q.z >= 0);
  for (let k = 0; k + 1 < orden.length; k++) {
    const a = orden[k], b = orden[k + 1];
    svg.append(el('polygon', { points: `${X(-a.w / 2)},${Y(a.z)} ${X(a.w / 2)},${Y(a.z)} ${X(b.w / 2)},${Y(b.z)} ${X(-b.w / 2)},${Y(b.z)}`, fill: '#eef2f6', stroke: '#888', 'stroke-width': 0.5 }));
  }
  orden.forEach(q => svg.append(el('line', { x1: X(-q.w / 2), y1: Y(q.z), x2: X(q.w / 2), y2: Y(q.z), stroke: '#aab', 'stroke-width': 0.6 })));
  // exoesqueleto de la cara que se mira (la del otro viento: sus barras corren a lo ancho de esta cara)
  if (p.exo) {
    const d = datosExo(dir === 'A' ? 'B' : 'A');
    d?.r.caras[0]?.esfuerzos.forEach(e => {
      if ((e.fraccion ?? 1) !== 1 || e.nucleo) return;
      svg.append(el('line', { x1: X(e.a.s), y1: Y(e.a.z), x2: X(e.b.s), y2: Y(e.b.z), stroke: e.clase === 'diagonal' ? '#1d7f5f' : '#333', 'stroke-width': e.clase === 'columna' ? 2 : 1.4 }));
    });
  }
  svg.append(el('text', { x: 34, y: 18, 'font-size': 12, 'font-weight': 700, fill: '#111' }, `Alzado: la cara que recibe el viento ${dir} (${fmt(W, 2)} m de ancho, ${fmt(zT, 2)} m de alto)`));
  return svg;
}

/** el lienzo del 3D, como imagen (el renderer guarda el último cuadro) */
export function capturar3D(titulo: string): string | null {
  const cv = document.querySelector<HTMLCanvasElement>('#vista-3d canvas');
  if (!cv) return null;
  try { const png = cv.toDataURL('image/png'); vistas3D.push({ titulo, png }); return png; } catch { return null; }
}

/** las vistas del proyecto que van al informe (para que el informe las arme sin conocer los detalles) */
export function vistasParaInforme(p: Proyecto = estado.proyecto): { titulo: string; nodo: Element }[] {
  const out: { titulo: string; nodo: Element }[] = [];
  const iPB = p.niveles.findIndex(n => Math.abs(n.cota) < 1e-6) >= 0 ? p.niveles.findIndex(n => Math.abs(n.cota) < 1e-6) : p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), 0);
  const iTipo = Math.max(0, Math.floor(iPB / 2));
  out.push({ titulo: `Planta de PB`, nodo: plantaSVG(p, iPB) });
  if (iTipo !== iPB) out.push({ titulo: `Planta tipo (${p.niveles[iTipo].nombre})`, nodo: plantaSVG(p, iTipo) });
  // los cortes pasan por un elemento calado (para que se vean sus puertas y ventanas) o por el muro más largo
  const enY = (m: (typeof p.muros)[number]) => tipoDe(m) === 'tabique' && m.dir === 'Y', enX = (m: (typeof p.muros)[number]) => tipoDe(m) === 'tabique' && m.dir === 'X';
  const elegir = (f: (m: (typeof p.muros)[number]) => boolean) => p.muros.filter(m => f(m) && m.aberturas?.length)[0] ?? [...p.muros.filter(f)].sort((a, b) => b.largo - a.largo)[0];
  const mY = elegir(enY), mX = elegir(enX);
  const cx = mY ? mY.x : 0, cy = mX ? mX.y : 0;
  out.push({ titulo: `Corte longitudinal por x = ${fmt(cx, 2)} m${mY ? ` (por ${mY.id})` : ''}`, nodo: corteSVG(p, 'x', cx) });
  out.push({ titulo: `Corte transversal por y = ${fmt(cy, 2)} m${mX ? ` (por ${mX.id})` : ''}`, nodo: corteSVG(p, 'y', cy) });
  out.push({ titulo: 'Alzado: cara que recibe el viento A', nodo: alzadoSVG(p, 'A') });
  out.push({ titulo: 'Alzado: cara que recibe el viento B', nodo: alzadoSVG(p, 'B') });
  vistas3D.forEach(v => { const img = document.createElement('img'); img.src = v.png; img.alt = v.titulo; img.className = 'vista-3d-img'; out.push({ titulo: v.titulo, nodo: img }); });
  return out;
}

