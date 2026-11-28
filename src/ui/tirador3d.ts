/**
 * Tirador debajo de la axonometría del panel derecho: se arrastra para agrandar o achicar el 3D en vertical (con el
 * mouse, el lápiz o el dedo, y con las flechas del teclado). El alto se recuerda en este navegador; doble clic vuelve
 * al de siempre. El 3D se acomoda solo (tiene un ResizeObserver).
 */
const CLAVE = 'torre3d.alto3d';

export function montarTirador3D() {
  const v = document.getElementById('vista-3d');
  if (!v || v.nextElementSibling?.classList.contains('tirador-3d')) return;
  const t = document.createElement('div');
  t.className = 'tirador-3d';
  t.setAttribute('role', 'separator');
  t.setAttribute('aria-orientation', 'horizontal');
  t.setAttribute('aria-label', 'Alto del 3D');
  t.tabIndex = 0;
  t.title = 'Arrastrá para agrandar o achicar el 3D (flechas ↑ ↓ con el teclado; doble clic: el alto de siempre)';
  v.after(t);
  const guardar = (px: number | null) => { try { if (px === null) localStorage.removeItem(CLAVE); else localStorage.setItem(CLAVE, String(Math.round(px))); } catch { /* sin almacenamiento */ } };
  const poner = (px: number | null) => {
    if (px === null) { v.style.height = ''; return null; }
    const alto = Math.round(Math.max(200, Math.min(window.innerHeight - 110, px)));
    v.style.height = `${alto}px`;
    return alto;
  };
  try { const g = Number(localStorage.getItem(CLAVE)); if (g > 0) poner(g); } catch { /* sin almacenamiento */ }
  t.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    t.setPointerCapture(ev.pointerId);
    t.classList.add('arrastrando');
    const y0 = ev.clientY, h0 = v.getBoundingClientRect().height;
    let ultimo: number | null = h0;
    const mover = (e: PointerEvent) => { ultimo = poner(h0 + e.clientY - y0); };
    const fin = () => {
      t.removeEventListener('pointermove', mover); t.removeEventListener('pointerup', fin); t.removeEventListener('pointercancel', fin);
      t.classList.remove('arrastrando');
      guardar(ultimo);
    };
    t.addEventListener('pointermove', mover); t.addEventListener('pointerup', fin); t.addEventListener('pointercancel', fin);
  });
  t.addEventListener('dblclick', () => { poner(null); guardar(null); });
  t.addEventListener('keydown', ev => {
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
    ev.preventDefault();
    guardar(poner(v.getBoundingClientRect().height + (ev.key === 'ArrowDown' ? 24 : -24)));
  });
}
