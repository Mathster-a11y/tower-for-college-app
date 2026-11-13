/**
 * Divisores de los paneles de los costados: se arrastran (mouse, dedo o lápiz) para achicar o agrandar el panel
 * de la etapa (izquierda) y el de la axonometría y el avance (derecha). Si se achican del todo, el panel se pliega y
 * queda una franja con una flecha para volver a abrirlo. Doble toque o el botón de la flecha: plegar o abrir.
 * Con el teclado: flechas para mover el divisor, Enter para plegar o abrir. Los anchos se recuerdan en el navegador.
 */
type Lado = 'lat' | 'der';
interface Conf { lado: Lado; panel: string; min: number; def: number; max: () => number; signo: 1 | -1; nombre: string }

const CLAVE = 'torre3d.paneles';
const MIN_PLEGAR = 150;

export function montarDivisores() {
  const app = document.querySelector<HTMLElement>('main.app');
  if (!app) return;
  let guardado: Record<string, { w: number; plegado: boolean }> = {};
  try { guardado = JSON.parse(localStorage.getItem(CLAVE) ?? '{}'); } catch { /* sin almacenamiento */ }
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(guardado)); } catch { /* sin almacenamiento */ } };
  const confs: Conf[] = [
    { lado: 'lat', panel: '#lateral', min: 240, def: 360, max: () => Math.max(260, window.innerWidth * 0.55), signo: 1, nombre: 'el panel de la etapa' },
    { lado: 'der', panel: '.derecha', min: 220, def: 300, max: () => Math.max(240, window.innerWidth * 0.45), signo: -1, nombre: 'la axonometría y el avance' },
  ];
  const avisarCambio = () => requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));

  for (const c of confs) {
    const panel = app.querySelector<HTMLElement>(c.panel);
    if (!panel) continue;
    const st = guardado[c.lado] ?? { w: c.def, plegado: false };
    guardado[c.lado] = st;
    const div = document.createElement('div');
    div.className = `divisor divisor-${c.lado}`;
    div.setAttribute('role', 'separator'); div.setAttribute('aria-orientation', 'vertical'); div.tabIndex = 0;
    const flecha = document.createElement('button');
    flecha.type = 'button'; flecha.className = 'divisor-flecha';
    div.append(document.createElement('i'), flecha);
    // el divisor va entre el panel y el centro
    if (c.signo === 1) panel.after(div); else panel.before(div);

    const aplicar = () => {
      app.style.setProperty(`--w-${c.lado}`, `${st.plegado ? 0 : Math.round(st.w)}px`);
      app.classList.toggle(`sin-${c.lado}`, st.plegado);
      const abre = c.signo === 1 ? (st.plegado ? '›' : '‹') : (st.plegado ? '‹' : '›');
      flecha.textContent = abre;
      const t = st.plegado ? `Abrir ${c.nombre}` : `Plegar ${c.nombre}`;
      flecha.title = t; flecha.setAttribute('aria-label', t);
      div.title = `Arrastrar para cambiar el ancho de ${c.nombre} (doble toque: ${st.plegado ? 'abrir' : 'plegar'})`;
      div.setAttribute('aria-valuenow', String(st.plegado ? 0 : Math.round(st.w)));
    };
    const alternar = () => { st.plegado = !st.plegado; if (!st.plegado && st.w < c.min) st.w = c.def; aplicar(); guardar(); avisarCambio(); };
    flecha.addEventListener('click', ev => { ev.stopPropagation(); alternar(); });
    flecha.addEventListener('pointerdown', ev => ev.stopPropagation());

    let arr: { x: number; w: number; id: number } | null = null;
    let ultimo = 0;
    div.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      const ahora = performance.now();
      if (ahora - ultimo < 350) { ultimo = 0; alternar(); return; }            // doble toque
      ultimo = ahora;
      arr = { x: ev.clientX, w: st.plegado ? 0 : st.w, id: ev.pointerId };
      try { div.setPointerCapture(ev.pointerId); } catch { /* sintético */ }
      div.classList.add('arrastrando'); document.body.classList.add('arrastrando-divisor');
    });
    let cuadro = 0;
    div.addEventListener('pointermove', ev => {
      if (!arr || ev.pointerId !== arr.id) return;
      const w = arr.w + c.signo * (ev.clientX - arr.x);
      if (w < MIN_PLEGAR * 0.6) { st.plegado = true; }
      else { st.plegado = false; st.w = Math.min(c.max(), Math.max(c.min, w)); }
      if (!cuadro) cuadro = requestAnimationFrame(() => { cuadro = 0; aplicar(); });
    });
    const soltar = () => {
      if (!arr) return;
      arr = null; div.classList.remove('arrastrando'); document.body.classList.remove('arrastrando-divisor');
      aplicar(); guardar(); avisarCambio();
    };
    div.addEventListener('pointerup', soltar);
    div.addEventListener('pointercancel', soltar);
    div.addEventListener('keydown', ev => {
      const paso = ev.shiftKey ? 64 : 16;
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alternar(); return; }
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault();
      st.plegado = false;
      st.w = Math.min(c.max(), Math.max(c.min, st.w + (ev.key === 'ArrowRight' ? 1 : -1) * c.signo * paso));
      aplicar(); guardar(); avisarCambio();
    });
    aplicar();
  }
}
