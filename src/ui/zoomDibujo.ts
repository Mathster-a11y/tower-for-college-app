/**
 * Zoom y desplazamiento en los dibujos (funiculares, polígono de los J, rototraslación): se cambia el viewBox, así el
 * dibujo sigue nítido. Rueda del mouse o pellizco para acercar en el punto señalado; arrastrar para desplazar cuando
 * está acercado; doble clic o doble toque para volver a verlo entero. También botones + − ⤢ en la barra del dibujo.
 * Con el lápiz o el mouse, un toque sin arrastrar sigue sirviendo para resaltar rayos y lados.
 */
const ZMAX = 8;
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
