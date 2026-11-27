/**
 * Comparar dos versiones, lado a lado y en dibujo: la planta de PB de cada una (las piezas que toman el viento,
 * oscuras) y debajo, pieza por pieza, qué parte del corte del viento toma en cada versión, en la misma escala, con lo
 * que cambió resaltado. Arriba de la tabla de números de «Mis proyectos → ⇄».
 */
import type { Proyecto } from '../engine/modelo';
import { presenteEn, rectangulos } from '../engine/modelo';
import { plantaDeNivel, puntosSilueta } from '../engine/silueta';
import { calcularProyecto, fmt } from './estado';
import { h } from './comp';

const NS = 'http://www.w3.org/2000/svg';
const sv = (tag: string, a: Record<string, string | number>, txt?: string) => { const e = document.createElementNS(NS, tag); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v))); if (txt !== undefined) e.textContent = txt; return e; };

interface Lado { p: Proyecto; nombre: string; roto: ReturnType<typeof calcularProyecto>['corr']['rotoA'] }

/** la planta de PB: la losa, los muros (oscuros los que toman este viento) y el nombre de cada pieza */
function planta(l: Lado, dir: 'A' | 'B', k: number, caja: { x0: number; x1: number; y0: number; y1: number }): SVGSVGElement {
  const p = l.p, iPB = p.niveles.reduce((j, n, i) => (n.cota >= 0 ? i : j), 0), zF = p.niveles.at(-1)?.cota ?? 0, zT = p.niveles[0]?.cota ?? 0;
  const W = (caja.x1 - caja.x0) * k + 20, H = (caja.y1 - caja.y0) * k + 20;
  const X = (x: number) => 10 + (x - caja.x0) * k, Y = (y: number) => 10 + (caja.y1 - y) * k;
  const svg = sv('svg', { viewBox: `0 0 ${W.toFixed(0)} ${H.toFixed(0)}`, class: 'cmp-planta', role: 'img', 'aria-label': `Planta de PB de ${l.nombre}` }) as SVGSVGElement;
  const losa = puntosSilueta(plantaDeNivel(p, iPB).silueta, 8);
  svg.append(sv('polygon', { points: losa.map(q => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' '), class: 'losa' }));
  const toman = new Set((l.roto?.paralelos ?? []).flatMap(e => e.muros));
  p.muros.filter(m => presenteEn(m, p.niveles[iPB]?.cota ?? 0, zF, zT)).forEach(m => rectangulos(m).forEach(r =>
    svg.append(sv('rect', { x: X(r.x - r.ax / 2), y: Y(r.y + r.ay / 2), width: Math.max(1, r.ax * k), height: Math.max(1, r.ay * k), class: toman.has(m.id) ? 'muro toma' : 'muro' }))));
  // el viento: una flecha del lado de donde llega
  const cx = (caja.x0 + caja.x1) / 2, cy = (caja.y0 + caja.y1) / 2;
  if (dir === 'A') svg.append(sv('path', { d: `M${X(cx)},${H - 2} v-12 m-4,4 l4,-4 l4,4`, class: 'viento' }));
  else svg.append(sv('path', { d: `M2,${Y(cy)} h12 m-4,-4 l4,4 l-4,4`, class: 'viento' }));
  return svg;
}

/** la parte del corte del viento que toma cada pieza (traslación + rotación), en % */
const reparto = (l: Lado) => {
  const r = l.roto; if (!r || !(r.Q > 0)) return new Map<string, number>();
  return new Map(r.paralelos.map(e => [e.nombre, ((e.tras + e.rot) / r.Q) * 100]));
};

export function vistaComparacion(pa: Proyecto, pb: Proyecto, nombreA: string, nombreB: string): HTMLElement {
  const ca = calcularProyecto(pa), cb = calcularProyecto(pb);
  const caja = h('div', { class: 'cmp-vista' });
  let dir: 'A' | 'B' = 'A';
  const seg = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Viento' });
  const bA = h('button', { type: 'button' }, 'Viento A'), bB = h('button', { type: 'button' }, 'Viento B');
  bA.addEventListener('click', () => { dir = 'A'; armar(); }); bB.addEventListener('click', () => { dir = 'B'; armar(); });
  seg.append(bA, bB);
  const cuerpo = h('div', {});
  caja.append(h('div', { class: 'fila-acciones' }, seg, h('span', { class: 'nota chica' }, 'Oscuros, los muros de las piezas que toman este viento. Las barras: qué parte del corte del viento toma cada pieza, en la misma escala en las dos versiones.')), cuerpo);
  function armar() {
    bA.setAttribute('aria-pressed', String(dir === 'A')); bB.setAttribute('aria-pressed', String(dir === 'B'));
    const lados: Lado[] = [{ p: pa, nombre: nombreA, roto: dir === 'A' ? ca.corr.rotoA : ca.corr.rotoB }, { p: pb, nombre: nombreB, roto: dir === 'A' ? cb.corr.rotoA : cb.corr.rotoB }];
    // la misma escala para las dos plantas: la caja que las contiene a las dos
    const pts = lados.flatMap(l => { const i = l.p.niveles.reduce((j, n, k) => (n.cota >= 0 ? k : j), 0); return puntosSilueta(plantaDeNivel(l.p, i).silueta, 8); });
    const c = { x0: Math.min(...pts.map(q => q.x)), x1: Math.max(...pts.map(q => q.x)), y0: Math.min(...pts.map(q => q.y)), y1: Math.max(...pts.map(q => q.y)) };
    const k = 260 / Math.max(c.x1 - c.x0, c.y1 - c.y0, 1);
    const rep = lados.map(reparto), nombres = [...new Set([...rep[0].keys(), ...rep[1].keys()])];
    const max = Math.max(1, ...rep.flatMap(r => [...r.values()]));
    const col = (l: Lado, i: number) => {
      const r = l.roto, otro = rep[1 - i];
      const barras = h('div', { class: 'cmp-barras' }, ...nombres.map(n => {
        const v = rep[i].get(n), o = otro.get(n), cambia = v !== undefined && o !== undefined ? Math.abs(v - o) >= 1 : true;
        const fila = h('div', { class: `cmp-barra${cambia ? ' cambia' : ''}` }, h('span', { class: 'n' }, n),
          h('span', { class: 'b' }, (() => { const b = h('i', {}); b.style.width = `${v === undefined ? 0 : (v / max) * 100}%`; return b; })()),
          h('span', { class: 'v' }, v === undefined ? 'no está' : `${fmt(v, 1)} %`));
        if (i === 1 && v !== undefined && o !== undefined && Math.abs(v - o) >= 0.05) fila.title = `${v > o ? '+' : '−'}${fmt(Math.abs(v - o), 1)} puntos respecto de «${nombreA}»`;
        return fila;
      }));
      return h('div', { class: 'cmp-col' }, h('b', {}, l.nombre), planta(l, dir, k, c),
        h('p', { class: 'nota chica' }, r ? `ΣJ ${fmt(r.SJ, 2)} m⁴ · e ${fmt(Math.abs(r.e), 2)} m · Mt ${fmt(Math.abs(r.Mt), 1)} tm` : 'Sin piezas en este viento.'), barras);
    };
    cuerpo.replaceChildren(h('div', { class: 'cmp-lados' }, ...lados.map(col)),
      h('p', { class: 'nota chica' }, 'Resaltadas, las piezas que cambian un punto de % o más (o que están en una sola versión). Pasá el mouse por una barra de la derecha para ver la diferencia.'));
  }
  armar();
  return caja;
}
