/**
 * Diagrama ΣJ(z) en la vista 3D (botón «J» arriba a la derecha): el momento de inercia de las piezas que toman el
 * viento elegido, piso por piso, en escalones (cada escalón es el entrepiso de abajo de cada nivel, con los muros que
 * hay ahí y el espesor que tienen). Como los diagramas de corte y de momento: valor en cada cambio, la línea del J
 * mínimo (h/500) y, si hay exoesqueleto, su J equivalente sumado en otro color.
 */
import { estado, fmt } from './estado';
import { rigidez, rigidezPorNivel } from '../engine/diagramas';
import { datosExo } from './exo';
import type { PlanillaRes } from '../engine/planilla';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag: string, a: Record<string, string | number> = {}, txt?: string) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v)));
  if (txt !== undefined) e.textContent = txt;
  return e as SVGElement;
};

/** los datos del diagrama (también para las pruebas): niveles de abajo arriba con su ΣJ y el J del exo */
export function datosDiagramaJ(dir: 'A' | 'B' = estado.dir) {
  const { asig, res, corr } = estado.calculo, p = estado.proyecto;
  if (!asig || !res) return null;
  const R: PlanillaRes = estado.fuente === 'guia' ? corr.guia : res;
  const rg = rigidez(R, p.hormigon || 'H30').find(x => x.dir === dir);
  if (!rg) return null;
  const niv = rigidezPorNivel(p, asig.piezas, dir, rg.J).sort((a, b) => a.z - b.z);
  let Jexo = 0;
  if (p.exo) { const d = datosExo(dir); if (d) Jexo = d.r.caras.reduce((s, c) => s + (c.Jeq || 0), 0); }
  return { niv, Jmin: rg.minimos.h500, Jexo, J: rg.J };
}

export function montarDiagramaJ(cont: HTMLElement, boton: HTMLButtonElement) {
  let visible = false;
  try { visible = localStorage.getItem('torre3d.diagramaJ') === '1'; } catch { /* sin almacenamiento */ }
  const caja = document.createElement('div');
  caja.className = 'diagrama-j';
  cont.appendChild(caja);
  const dibujar = () => {
    boton.setAttribute('aria-pressed', String(visible));
    caja.hidden = !visible;
    if (!visible) return;
    caja.replaceChildren();
    const d = (() => { try { return datosDiagramaJ(); } catch { return null; } })();
    if (!d || d.niv.length < 2) { caja.textContent = 'Sin datos para el diagrama de J.'; return; }
    const W = 150, H = Math.max(180, Math.min(320, cont.clientHeight - 24)), x0 = 30, x1 = W - 8, y0 = 24, y1 = H - 18;
    const z0 = d.niv[0].z, zT = d.niv[d.niv.length - 1].z;
    const Jmax = Math.max(...d.niv.map(q => q.J + d.Jexo), d.Jmin, 1e-9) * 1.08;
    const X = (j: number) => x0 + (j / Jmax) * (x1 - x0), Y = (z: number) => y1 - ((z - z0) / (zT - z0 || 1)) * (y1 - y0);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `ΣJ por piso, viento ${estado.dir}` });
    svg.append(el('text', { x: 6, y: 13, class: 'dj-tit' }, `ΣJ(z) · viento ${estado.dir}`));
    svg.append(el('text', { x: W - 6, y: 13, class: 'dj-u', 'text-anchor': 'end' }, 'm⁴'));
    // escalones: tabiques (y exo encima)
    for (let i = 1; i < d.niv.length; i++) {
      const za = d.niv[i - 1].z, zb = d.niv[i].z, J = d.niv[i].J;
      svg.append(el('rect', { x: x0, y: Y(zb), width: Math.max(0.5, X(J) - x0), height: Math.max(0.5, Y(za) - Y(zb)), class: 'dj-tab' }));
      if (d.Jexo > 0) svg.append(el('rect', { x: X(J), y: Y(zb), width: X(J + d.Jexo) - X(J), height: Math.max(0.5, Y(za) - Y(zb)), class: 'dj-exo' }));
    }
    // contorno escalonado
    let path = `M${x0},${Y(z0)}`;
    for (let i = 1; i < d.niv.length; i++) { const J = d.niv[i].J + d.Jexo; path += ` L${X(J).toFixed(1)},${Y(d.niv[i - 1].z).toFixed(1)} L${X(J).toFixed(1)},${Y(d.niv[i].z).toFixed(1)}`; }
    path += ` L${x0},${Y(zT)}`;
    svg.append(el('path', { d: path, class: 'dj-linea' }));
    svg.append(el('line', { x1: x0, x2: x0, y1: y0 - 4, y2: y1, class: 'dj-eje' }));
    svg.append(el('line', { x1: x0, x2: x1, y1: y1, y2: y1, class: 'dj-eje' }));
    // J mínimo
    svg.append(el('line', { x1: X(d.Jmin), x2: X(d.Jmin), y1: y0, y2: y1, class: 'dj-min' }));
    svg.append(el('text', { x: X(d.Jmin), y: y1 + 12, class: 'dj-u', 'text-anchor': 'middle' }, `mín ${fmt(d.Jmin, 1)}`));
    // rótulos donde cambia
    let ult = -1, yUlt = Infinity;
    for (let i = 1; i < d.niv.length; i++) {
      const J = d.niv[i].J + d.Jexo, y = (Y(d.niv[i - 1].z) + Y(d.niv[i].z)) / 2;
      if (Math.abs(J - ult) > 1e-6 * Math.max(1, J) && Math.abs(yUlt - y) > 11) { svg.append(el('text', { x: Math.min(X(J) + 3, W - 2), y: y + 3, class: 'dj-val', 'text-anchor': X(J) + 30 > W ? 'end' : 'start' }, fmt(J, 1))); yUlt = y; }
      ult = J;
    }
    svg.append(el('text', { x: x0 - 3, y: Y(z0) + 3, class: 'dj-u', 'text-anchor': 'end' }, 'PB'));
    svg.append(el('text', { x: x0 - 3, y: Y(zT) + 3, class: 'dj-u', 'text-anchor': 'end' }, fmt(zT, 0)));
    caja.append(svg);
    const ley = document.createElement('div'); ley.className = 'dj-ley';
    ley.innerHTML = `<span><i class="tab"></i>tabiques</span>${d.Jexo > 0 ? '<span><i class="exo"></i>exo (J eq.)</span>' : ''}<span><i class="min"></i>J mín h/500</span>`;
    caja.append(ley);
  };
  boton.addEventListener('click', () => { visible = !visible; try { localStorage.setItem('torre3d.diagramaJ', visible ? '1' : '0'); } catch { /* */ } dibujar(); });
  estado.suscribir(dibujar);
  dibujar();
  return { dibujar };
}
