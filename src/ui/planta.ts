/** Editor de la planta de PB en SVG: grilla, contorno, ejes, muros coloreados por su papel; arrastrar para mover. */
import { estado, COLORES } from './estado';
import type { Muro } from '../engine/modelo';

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, txt?: string) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));
  if (txt !== undefined) e.textContent = txt;
  return e;
};

export function montarPlanta(cont: HTMLElement) {
  const svg = el('svg', { class: 'planta', role: 'img', 'aria-label': 'Planta de PB con los muros del contraviento' });
  cont.appendChild(svg);
  let arrastre: { id: string; x0: number; y0: number; mx: number; my: number } | null = null;
  let escala = 20, ox = 0, oy = 0;

  const aMundo = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left - ox) / escala, y: -(ev.clientY - r.top - oy) / escala };
  };

  function dibujar() {
    const p = estado.proyecto;
    const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
    const B = p.niveles.slice(0, iPB + 1).reduce<number | null>((v, n) => n.B ?? v, null) ?? 20;
    const L = p.niveles.slice(0, iPB + 1).reduce<number | null>((v, n) => n.L ?? v, null) ?? 16;
    const w = svg.clientWidth || 600, h = svg.clientHeight || 500;
    const ext = Math.max(B, L, ...p.muros.map(m => 2 * (Math.abs(m.x) + m.largo / 2)), ...p.muros.map(m => 2 * (Math.abs(m.y) + m.largo / 2))) + 6;
    escala = Math.min(w, h) / ext;
    ox = w / 2; oy = h / 2;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.replaceChildren();
    const X = (x: number) => ox + x * escala, Y = (y: number) => oy - y * escala;
    // grilla de 1 m
    const g = el('g', { class: 'grilla' });
    const n = Math.ceil(ext / 2);
    for (let i = -n; i <= n; i++) {
      g.appendChild(el('line', { x1: X(i), y1: Y(-n), x2: X(i), y2: Y(n), class: i % 5 ? 'g1' : 'g5' }));
      g.appendChild(el('line', { x1: X(-n), y1: Y(i), x2: X(n), y2: Y(i), class: i % 5 ? 'g1' : 'g5' }));
    }
    svg.appendChild(g);
    svg.appendChild(el('rect', { x: X(-B / 2), y: Y(L / 2), width: B * escala, height: L * escala, class: 'contorno' }));
    svg.appendChild(el('line', { x1: X(0), y1: Y(-n), x2: X(0), y2: Y(n), class: 'eje' }));
    svg.appendChild(el('line', { x1: X(-n), y1: Y(0), x2: X(n), y2: Y(0), class: 'eje' }));
    // eje de inercia de la dirección elegida
    const r = estado.calculo.res;
    const d = estado.dir === 'A' ? r?.rotA.J7 : r?.rotB.J7;
    if (d !== undefined && isFinite(d)) {
      if (estado.dir === 'A') svg.appendChild(el('line', { x1: X(d), y1: Y(-n), x2: X(d), y2: Y(n), class: 'inercia' }));
      else svg.appendChild(el('line', { x1: X(-n), y1: Y(d), x2: X(n), y2: Y(d), class: 'inercia' }));
    }
    // viento
    const fl = el('g', { class: 'viento' });
    if (estado.dir === 'A') { fl.appendChild(el('line', { x1: X(0), y1: Y(-L / 2 - 4.5), x2: X(0), y2: Y(-L / 2 - 1.2), 'marker-end': 'url(#punta)' })); fl.appendChild(el('text', { x: X(0.6), y: Y(-L / 2 - 3.5) }, 'viento A')); }
    else { fl.appendChild(el('line', { x1: X(-B / 2 - 4.5), y1: Y(0), x2: X(-B / 2 - 1.2), y2: Y(0), 'marker-end': 'url(#punta)' })); fl.appendChild(el('text', { x: X(-B / 2 - 4.5), y: Y(0.6) }, 'viento B')); }
    const defs = el('defs');
    const mk = el('marker', { id: 'punta', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
    mk.appendChild(el('path', { d: 'M0,0 L10,5 L0,10 z', class: 'punta' }));
    defs.appendChild(mk);
    svg.appendChild(defs);
    svg.appendChild(fl);
    // muros
    const papeles = estado.calculo.asig?.papeles ?? {};
    p.muros.forEach(m => {
      const papel = papeles[m.id]?.[estado.dir] ?? 'sin pieza';
      const [dx, dy] = m.circular ? [m.circular.D, m.circular.D] : m.dir === 'Y' ? [m.espesor, m.largo] : [m.largo, m.espesor];
      const grupo = el('g', { class: 'muro' + (estado.seleccion === m.id ? ' sel' : '') + (m.llega ? '' : ' fuera'), 'data-id': m.id, tabindex: 0 });
      const forma = m.circular
        ? el('circle', { cx: X(m.x), cy: Y(m.y), r: (m.circular.D / 2) * escala, fill: COLORES[papel] })
        : el('rect', { x: X(m.x - dx / 2), y: Y(m.y + dy / 2), width: Math.max(2, dx * escala), height: Math.max(2, dy * escala), fill: COLORES[papel] });
      grupo.appendChild(forma);
      const pieza = estado.dir === 'A' ? m.piezaA : m.piezaB;
      const lx = m.dir === 'Y' ? X(m.x + dx / 2) + 4 : X(m.x);
      const ly = m.dir === 'Y' ? Y(m.y) + 4 : Y(m.y + dy / 2) - 5;
      grupo.appendChild(el('text', { x: lx, y: ly, class: 'etiqueta', 'text-anchor': m.dir === 'Y' ? 'start' : 'middle' }, `${m.id}${pieza ? ' · ' + pieza : ''}`));
      grupo.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        estado.seleccion = m.id;
        const q = aMundo(ev);
        arrastre = { id: m.id, x0: m.x, y0: m.y, mx: q.x, my: q.y };
        svg.setPointerCapture(ev.pointerId);
        estado.cambiar();
      });
      svg.appendChild(grupo);
    });
  }

  svg.addEventListener('pointermove', ev => {
    if (!arrastre) return;
    const q = aMundo(ev);
    const snap = (v: number) => Math.round(v / 0.05) * 0.05;
    const m = estado.proyecto.muros.find(x => x.id === arrastre!.id);
    if (!m) return;
    m.x = +snap(arrastre.x0 + q.x - arrastre.mx).toFixed(2);
    m.y = +snap(arrastre.y0 + q.y - arrastre.my).toFixed(2);
    dibujar();
  });
  const soltar = () => { if (arrastre) { arrastre = null; estado.cambiar(); } };
  svg.addEventListener('pointerup', soltar);
  svg.addEventListener('pointercancel', soltar);
  svg.addEventListener('keydown', ev => {
    const m = estado.proyecto.muros.find((x: Muro) => x.id === estado.seleccion);
    if (!m) return;
    const paso = ev.shiftKey ? 1 : 0.05;
    const mov: Record<string, [number, number]> = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, paso], ArrowDown: [0, -paso] };
    if (mov[ev.key]) { ev.preventDefault(); estado.cambiar(() => { m.x = +(m.x + mov[ev.key][0]).toFixed(2); m.y = +(m.y + mov[ev.key][1]).toFixed(2); }); }
  });
  new ResizeObserver(dibujar).observe(svg);
  estado.suscribir(dibujar);
  dibujar();
}
