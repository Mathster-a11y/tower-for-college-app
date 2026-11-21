/**
 * Corte: desde dónde hasta dónde llega cada muro. Los niveles son líneas horizontales y cada muro es una barra vertical,
 * ordenada por su posición en la planta (en x con el viento A, en y con el viento B). Los extremos de cada barra se
 * arrastran (mouse o dedo) y se pegan al nivel más cercano: es lo mismo que «Desde» y «Hasta» de la tabla de muros
 * (vacío = fundación o azotea). Un muro que no arranca en la fundación no entra al cálculo de la planilla: se ve punteado.
 */
import { estado, fmt } from './estado';
import { h, type H } from './comp';
import { entraEnCalculo, type Muro } from '../engine/modelo';
import type { Tam } from './diagramas';

const NS = 'http://www.w3.org/2000/svg';
type Attrs = Record<string, string | number>;
const el = <K extends keyof SVGElementTagNameMap>(tag: K, a: Attrs = {}, txt?: string) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v)));
  if (txt !== undefined) e.textContent = txt;
  return e;
};

export function centroCorte(c: H, tam: Tam) {
  const p = estado.proyecto;
  const niveles = [...p.niveles].sort((a, b) => b.cota - a.cota);
  if (!niveles.length || !p.muros.length) { c.append(h('p', { class: 'nota' }, 'Cargá los niveles y los muros para ver el corte.')); return; }
  const zTop = niveles[0].cota, zFund = niveles[niveles.length - 1].cota;
  const A = estado.dir === 'A';
  const muros = [...p.muros].sort((a, b) => (A ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x) || a.id.localeCompare(b.id));
  c.append(h('p', { class: 'nota' }, `Cada barra es un muro, de izquierda a derecha según su ${A ? 'x' : 'y'} en la planta (cambiá el viento arriba para ordenarlos por ${A ? 'y' : 'x'}). Arrastrá la punta de arriba o la de abajo hasta otro nivel; tocá una barra para elegir el muro en la planta. Punteado: no arranca en la fundación y no entra al cálculo de la planilla.`));

  // medidas del dibujo
  const izq = 150, der = 16, arriba = 24, abajo = 56;
  const ancho = Math.max(tam.ancho ?? 640, izq + der + muros.length * 26);
  const alto = Math.max(380, Math.min(900, (tam.alto ?? 600) - 90));
  const col = (ancho - izq - der) / muros.length, wb = Math.max(8, Math.min(26, col * 0.62));
  const Y = (z: number) => arriba + ((zTop - z) / (zTop - zFund || 1)) * (alto - arriba - abajo);
  const X = (i: number) => izq + col * (i + 0.5);
  const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, width: ancho, height: alto, class: 'grafico corte-muros', role: 'img', 'aria-label': 'Corte: altura de cada muro' }) as SVGSVGElement;

  // niveles
  const zPB = niveles.reduce((z, n) => (n.cota >= 0 && n.cota < z ? n.cota : z), Infinity);
  niveles.forEach(n => {
    const y = Y(n.cota), pb = Math.abs(n.cota - zPB) < 1e-6;
    svg.append(el('line', { x1: izq - 8, x2: ancho - der, y1: y, y2: y, class: `corte-nivel${pb ? ' pb' : ''}${n.cota === zFund ? ' fund' : ''}` }));
    svg.append(el('text', { x: izq - 12, y: y + 4, class: 'd-eje', 'text-anchor': 'end' }, `${n.nombre} · ${fmt(n.cota, 2)} m`));
  });
  // cotas a las que se puede pegar una punta
  const cotas = niveles.map(n => n.cota);
  const cercana = (z: number) => cotas.reduce((m, c2) => (Math.abs(c2 - z) < Math.abs(m - z) ? c2 : m), cotas[0]);
  const zDe = (py: number) => zTop - ((py - arriba) / (alto - arriba - abajo)) * (zTop - zFund);

  muros.forEach((m, i) => {
    const desde = m.zDesde ?? zFund, hasta = m.zHasta ?? zTop;
    const entra = entraEnCalculo(m, zFund, zTop);
    const g = el('g', { class: `corte-muro${entra ? '' : ' fuera'}${estado.seleccion === m.id ? ' sel' : ''}`, 'data-muro': m.id });
    const barra = el('rect', { x: X(i) - wb / 2, y: Y(hasta), width: wb, height: Math.max(2, Y(desde) - Y(hasta)), rx: 2, class: 'barra' });
    barra.append(el('title', {}, `${m.id}: de ${nombreDe(desde)} a ${nombreDe(hasta)}${entra ? '' : ' · no llega a la fundación: no entra al cálculo de la planilla'}`));
    const mangoA = el('rect', { x: X(i) - wb / 2 - 3, y: Y(hasta) - 5, width: wb + 6, height: 10, rx: 3, class: 'mango' });
    const mangoB = el('rect', { x: X(i) - wb / 2 - 3, y: Y(desde) - 5, width: wb + 6, height: 10, rx: 3, class: 'mango' });
    mangoA.append(el('title', {}, `Arrastrá: hasta dónde llega ${m.id}`));
    mangoB.append(el('title', {}, `Arrastrá: desde dónde arranca ${m.id}`));
    const rot = el('text', { x: X(i), y: alto - abajo + 16, class: 'd-eje corte-id', 'text-anchor': 'end', transform: `rotate(-60 ${X(i)} ${alto - abajo + 16})` }, m.id);
    g.append(barra, mangoA, mangoB, rot);
    svg.append(g);
    barra.addEventListener('click', () => { estado.seleccion = m.id; estado.avisarSeleccion(); svg.querySelectorAll('.corte-muro').forEach(x => x.classList.toggle('sel', (x as SVGGElement).dataset.muro === m.id)); });
    arrastrar(mangoA, 'hasta', m, barra, mangoA, mangoB);
    arrastrar(mangoB, 'desde', m, barra, mangoA, mangoB);
  });

  function nombreDe(z: number) { return niveles.find(n => Math.abs(n.cota - z) < 1e-6)?.nombre ?? `${fmt(z, 2)} m`; }

  /** arrastre de una punta: la barra sigue al puntero pegada a los niveles; al soltar se guarda (se puede deshacer) */
  function arrastrar(mango: SVGRectElement, cual: 'desde' | 'hasta', m: Muro, barra: SVGRectElement, mA: SVGRectElement, mB: SVGRectElement) {
    let id = -1, z = 0;
    const local = (e: PointerEvent) => { const r = svg.getBoundingClientRect(); return ((e.clientY - r.top) / r.height) * alto; };
    mango.addEventListener('pointerdown', e => { id = e.pointerId; mango.setPointerCapture(id); mango.classList.add('activo'); e.preventDefault(); });
    mango.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const otro = cual === 'hasta' ? m.zDesde ?? zFund : m.zHasta ?? zTop;
      z = cercana(zDe(local(e)));
      // las dos puntas no se cruzan: queda al menos un nivel entre ellas
      const validas = cotas.filter(c2 => (cual === 'hasta' ? c2 > otro + 1e-6 : c2 < otro - 1e-6));
      if (!validas.length) return;
      z = validas.reduce((mm, c2) => (Math.abs(c2 - z) < Math.abs(mm - z) ? c2 : mm), validas[0]);
      const a = cual === 'hasta' ? z : otro, b = cual === 'desde' ? z : otro;
      barra.setAttribute('y', String(Y(a))); barra.setAttribute('height', String(Math.max(2, Y(b) - Y(a))));
      (cual === 'hasta' ? mA : mB).setAttribute('y', String(Y(z) - 5));
    });
    const fin = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1; mango.classList.remove('activo');
      const actual = cual === 'hasta' ? m.zHasta ?? zTop : m.zDesde ?? zFund;
      if (Math.abs(z - actual) < 1e-6 || !isFinite(z)) return;
      // en la azotea o en la fundación queda vacío (como en la tabla: «toda la altura»)
      const valor = cual === 'hasta' ? (Math.abs(z - zTop) < 1e-6 ? null : z) : (Math.abs(z - zFund) < 1e-6 ? null : z);
      estado.cambiar(pp => { const mm = pp.muros.find(x => x.id === m.id); if (mm) { if (cual === 'hasta') mm.zHasta = valor; else mm.zDesde = valor; } });
    };
    mango.addEventListener('pointerup', fin);
    mango.addEventListener('pointercancel', fin);
  }

  c.append(h('div', { class: 'scroll' }, svg));
  const fuera = muros.filter(m => !entraEnCalculo(m, zFund, zTop));
  if (fuera.length) c.append(h('p', { class: 'aviso-linea' }, `${fuera.map(m => m.id).join(', ')}: no ${fuera.length > 1 ? 'arrancan' : 'arranca'} en la fundación y no ${fuera.length > 1 ? 'entran' : 'entra'} al cálculo de la planilla (la carga tiene que bajar hasta la fundación por otro elemento).`));
}
