/**
 * Zoom y desplazamiento en los dibujos (funiculares, polígono de los J, rototraslación): se cambia el viewBox, así el
 * dibujo sigue nítido. Rueda del mouse o pellizco para acercar en el punto señalado; arrastrar para desplazar cuando
 * está acercado; doble clic o doble toque para volver a verlo entero. También botones + − ⤢ en la barra del dibujo.
 * Con el lápiz o el mouse, un toque sin arrastrar sigue sirviendo para resaltar rayos y lados.
 */
const ZMAX = 16;

/**
 * Detalle al acercar: los trazos, los puntos, las flechas y los textos conservan su tamaño en la pantalla (en el dibujo
 * se achican 1/z), así los vectores chicos se separan y se pueden leer; los rótulos que quedan encimados se corren hacia
 * abajo hasta que no se tocan. Con zoom 1 todo vuelve a como estaba.
 */
interface Original { sw?: number; fs?: number; r?: number; x?: string | null; y?: string | null; mw?: string | null; mh?: string | null; ancla?: [number, number] }
const originales = new WeakMap<SVGSVGElement, Map<Element, Original>>();
function tomarOriginales(svg: SVGSVGElement): Map<Element, Original> {
  let o = originales.get(svg);
  if (o) return o;
  o = new Map();
  for (const e of svg.querySelectorAll('*')) {
    const cs = getComputedStyle(e), x: Original = {};
    const tag = e.tagName.toLowerCase();
    if (tag === 'marker') {
      if ((e.getAttribute('markerUnits') ?? '') === 'userSpaceOnUse') { x.mw = e.getAttribute('markerWidth'); x.mh = e.getAttribute('markerHeight'); o.set(e, x); }
      continue;
    }
    if (e.closest('marker')) continue;                                     // la punta de la flecha sigue a su marcador
    if (tag === 'text') {
      if (cs.stroke && cs.stroke !== 'none') x.sw = parseFloat(cs.strokeWidth) || undefined;    // halo del rótulo
      x.fs = parseFloat(cs.fontSize) || undefined; x.x = e.getAttribute('x'); x.y = e.getAttribute('y');
      // data-ancla="x y": punto al que se refiere el rótulo; al acercar, el rótulo queda a la misma distancia en la pantalla
      const a = (e as SVGElement).dataset.ancla?.split(/[ ,]/).map(Number);
      if (a?.length === 2 && a.every(Number.isFinite)) x.ancla = [a[0], a[1]];
    }
    else if (tag !== 'tspan' && cs.stroke && cs.stroke !== 'none') x.sw = parseFloat(cs.strokeWidth) || undefined;
    if (tag === 'circle') { const r = parseFloat(e.getAttribute('r') ?? ''); if (r > 0 && r <= 8) x.r = r; }
    if (x.sw || x.fs || x.r) o.set(e, x);
  }
  originales.set(svg, o);
  return o;
}
function detalle(svg: SVGSVGElement, z: number) {
  const o = tomarOriginales(svg);
  const k = z <= 1.0001 ? 1 : 1 / z;
  o.forEach((x, e) => {
    const st = (e as SVGElement).style;
    if (x.mw !== undefined) { if (x.mw) e.setAttribute('markerWidth', String(+x.mw * k)); if (x.mh) e.setAttribute('markerHeight', String(+x.mh * k)); return; }
    if (x.sw) st.strokeWidth = k === 1 ? '' : String(x.sw * k);
    if (x.fs) st.fontSize = k === 1 ? '' : `${x.fs * k}px`;
    if (x.r) e.setAttribute('r', String(x.r * k));
    if (x.y !== undefined) { if (x.y === null) e.removeAttribute('y'); else e.setAttribute('y', x.y); }
    if (x.ancla && x.x && x.y) { e.setAttribute('x', String(x.ancla[0] + (+x.x - x.ancla[0]) * k)); e.setAttribute('y', String(x.ancla[1] + (+x.y - x.ancla[1]) * k)); }
  });
  // flechas dibujadas (data-punta en el grupo): la punta se achica hacia el vértice y el tronco llega hasta ella
  svg.querySelectorAll<SVGGElement>('g[data-punta]').forEach(g => {
    const [px, py] = (g.dataset.punta ?? '').split(' ').map(Number);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    g.querySelectorAll('polygon').forEach(pg => { if (k === 1) pg.removeAttribute('transform'); else pg.setAttribute('transform', `translate(${px} ${py}) scale(${k}) translate(${-px} ${-py})`); });
    g.querySelectorAll('line').forEach(ln => {
      const d = ln as SVGLineElement;
      if (d.dataset.x2 === undefined) { d.dataset.x2 = ln.getAttribute('x2') ?? ''; d.dataset.y2 = ln.getAttribute('y2') ?? ''; }
      ln.setAttribute('x2', String(px + (+d.dataset.x2! - px) * k)); ln.setAttribute('y2', String(py + (+d.dataset.y2! - py) * k));
    });
  });
  // rótulos que solo entran acercando (data-zoom-min: zoom desde el que hay lugar)
  svg.querySelectorAll<SVGElement>('[data-zoom-min]').forEach(e => { e.style.display = z >= +(e.dataset.zoomMin ?? 1) ? 'inline' : ''; });
  if (k === 1) return;
  // rótulos encimados: se corren hacia abajo (solo los que no están girados)
  const textos = [...o.entries()].filter(([e, x]) => x.fs && x.y !== null && x.y !== undefined && !e.getAttribute('transform') && !e.closest('[transform*="rotate"]')) as [SVGTextElement, Original][];
  const puestos: DOMRect[] = [];
  const toca = (a: DOMRect, b: DOMRect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const [t, x] of textos) {
    let bb: DOMRect;
    try { bb = t.getBBox(); } catch { continue; }
    if (!bb.width) continue;
    let dy = 0;
    for (let intento = 0; intento < 6 && puestos.some(p => toca(p, new DOMRect(bb.x, bb.y + dy, bb.width, bb.height))); intento++) dy += bb.height * 1.05;
    if (dy) t.setAttribute('y', String(+(t.getAttribute('y') ?? x.y ?? 0) + dy));
    puestos.push(new DOMRect(bb.x, bb.y + dy, bb.width, bb.height));
  }
}
/** zoom de cada dibujo (por su nombre): se conserva cuando el centro se vuelve a dibujar */
const recordado = new Map<string, { base: string; v: { x: number; y: number; w: number; h: number } }>();

export function hacerZoomable(svg: SVGSVGElement, barra?: HTMLElement, clave = '') {
  if (svg.dataset.zoom) return;
  const vb0 = svg.viewBox.baseVal;
  if (!vb0 || !vb0.width) return;
  svg.dataset.zoom = '1';
  svg.dataset.vb0 = `${vb0.x} ${vb0.y} ${vb0.width} ${vb0.height}`;
  const base = { x: vb0.x, y: vb0.y, w: vb0.width, h: vb0.height };
  const firma = `${base.x} ${base.y} ${base.w} ${base.h}`;
  let v = { ...base };
  let zDetalle = 1, cuadro = 0;
  const previo = clave ? recordado.get(clave) : undefined;
  if (previo && previo.base === firma) v = { ...previo.v };
  svg.classList.add('zoomable');
  const poner = () => {
    // no se sale del dibujo: siempre queda algo a la vista
    const z = base.w / v.w;
    if (z <= 1.0001) v = { ...base };
    else { v.x = Math.min(base.x + base.w - v.w, Math.max(base.x, v.x)); v.y = Math.min(base.y + base.h - v.h, Math.max(base.y, v.y)); }
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    if (clave) recordado.set(clave, { base: firma, v: { ...v } });
    svg.classList.toggle('acercado', z > 1.0001);
    // el detalle (grosores, textos, rótulos) se ajusta una vez por cuadro, no en cada evento de la rueda
    if (Math.abs(z - zDetalle) > 1e-3) { zDetalle = z; if (!cuadro) cuadro = requestAnimationFrame(() => { cuadro = 0; detalle(svg, zDetalle); }); }
    if (indicador) indicador.textContent = `${Math.round(z * 100)} %`;
  };
  /** punto del dibujo bajo un punto de la pantalla */
  const aDibujo = (cx: number, cy: number) => { const r = svg.getBoundingClientRect(); return { x: v.x + ((cx - r.left) / r.width) * v.w, y: v.y + ((cy - r.top) / r.height) * v.h }; };
  const acercar = (f: number, cx?: number, cy?: number) => {
    const r = svg.getBoundingClientRect();
    const px = cx ?? r.left + r.width / 2, py = cy ?? r.top + r.height / 2;
    const q = aDibujo(px, py);
    const z2 = Math.min(ZMAX, Math.max(1, (base.w / v.w) * f));
    const w = base.w / z2, h = base.h / z2;
    v = { x: q.x - ((px - r.left) / r.width) * w, y: q.y - ((py - r.top) / r.height) * h, w, h };
    poner();
  };
  const encuadrar = () => { v = { ...base }; poner(); };

  svg.addEventListener('wheel', ev => {
    // sin zoom, la rueda desplaza la página como siempre; con Ctrl o con el dibujo ya acercado, hace zoom
    if (!ev.ctrlKey && base.w / v.w <= 1.0001) return;
    ev.preventDefault();
    acercar(Math.exp(-Math.max(-150, Math.min(150, ev.deltaY)) * 0.0028), ev.clientX, ev.clientY);   // ≈ ×1,3 por paso de rueda
  }, { passive: false });

  const punteros = new Map<number, { x: number; y: number }>();
  let pan: { x: number; y: number; v: typeof v; movio: boolean } | null = null;
  let pell: { d: number; z: number; mx: number; my: number; q: { x: number; y: number } } | null = null;
  let toque = 0;
  svg.addEventListener('pointerdown', ev => {
    punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      pell = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: base.w / v.w, mx, my, q: aDibujo(mx, my) };
      pan = null; ev.preventDefault();
      return;
    }
    const ahora = performance.now();
    if (ahora - toque < 320) { toque = 0; encuadrar(); return; }        // doble clic o doble toque: entero
    toque = ahora;
    if (base.w / v.w > 1.0001 || ev.pointerType !== 'mouse') pan = { x: ev.clientX, y: ev.clientY, v: { ...v }, movio: false };
  });
  svg.addEventListener('pointermove', ev => {
    if (!punteros.has(ev.pointerId)) return;
    punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pell && punteros.size >= 2) {
      const [a, b] = [...punteros.values()];
      const r = svg.getBoundingClientRect();
      const z2 = Math.min(ZMAX, Math.max(1, pell.z * Math.hypot(a.x - b.x, a.y - b.y) / pell.d));
      const w = base.w / z2, h = base.h / z2, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      v = { x: pell.q.x - ((mx - r.left) / r.width) * w, y: pell.q.y - ((my - r.top) / r.height) * h, w, h };
      poner(); ev.preventDefault();
      return;
    }
    if (!pan || base.w / v.w <= 1.0001) return;
    const r = svg.getBoundingClientRect();
    const dx = ev.clientX - pan.x, dy = ev.clientY - pan.y;
    if (!pan.movio && Math.hypot(dx, dy) < (ev.pointerType === 'mouse' ? 3 : 7)) return;
    if (!pan.movio) { pan.movio = true; try { svg.setPointerCapture(ev.pointerId); } catch { /* sintético */ } }
    v = { ...pan.v, x: pan.v.x - (dx / r.width) * pan.v.w, y: pan.v.y - (dy / r.height) * pan.v.h };
    poner(); ev.preventDefault();
  });
  const fin = (ev: PointerEvent) => { punteros.delete(ev.pointerId); if (punteros.size < 2) pell = null; if (!punteros.size) pan = null; };
  svg.addEventListener('pointerup', fin);
  svg.addEventListener('pointercancel', fin);

  let indicador: HTMLElement | null = null;
  if (barra) {
    const b = (t: string, titulo: string, f: () => void) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = t; x.title = titulo; x.setAttribute('aria-label', titulo); x.addEventListener('click', f); return x; };
    const grupo = document.createElement('span'); grupo.className = 'zoom-dibujo';
    indicador = document.createElement('span'); indicador.className = 'zoom-nivel'; indicador.textContent = '100 %';
    grupo.append(b('−', 'Alejar', () => acercar(1 / 1.5)), indicador, b('+', 'Acercar (también: rueda del mouse con Ctrl o pellizcar)', () => acercar(1.5)), b('⤢', 'Ver el dibujo entero (también: doble clic o doble toque)', encuadrar));
    barra.prepend(grupo);
  }
  poner();
}
