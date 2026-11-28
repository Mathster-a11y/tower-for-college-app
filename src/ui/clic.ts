/**
 * Clics con el mouse que no se pierden. Con el mouse, al apretar un botón el campo que se estaba editando pierde el
 * foco y aplica su valor; si eso rearma la carta en ese momento, el botón apretado se reemplaza por uno nuevo y el
 * navegador no cuenta el clic (se apretó en uno y se soltó en otro): el «Listo» de las medidas de una pieza o del
 * contorno de una losa no respondía y la carta volvía arriba. Con el dedo pasa menos (el foco se mueve al soltar).
 *
 *  - Mientras el botón del mouse está apretado sobre un control, las vistas que se rearman con cada cambio del
 *    proyecto esperan a que termine el clic (alTerminarClic, lo usa el estado).
 *  - Si igual el botón apretado desaparece (una carta que se rearma sola), al soltar se busca el mismo botón en la
 *    carta nueva (mismo texto, título y nombre, en el mismo contenedor) y se le hace el clic.
 */
const CONTROLES = 'button, [role="button"], summary, a[href]';
const clic = { apretando: false, pendientes: [] as (() => void)[], reloj: 0, objetivo: null as Element | null, huella: '', raices: [] as Element[], x: 0, y: 0 };

/** hay un clic a medio hacer sobre un control */
export const clicEnCurso = () => clic.apretando;
/** corre f ahora o, si hay un clic a medio hacer, cuando termina (la última vez que se pidió, una sola) */
export function alTerminarClic(clave: object, f: () => void): boolean {
  if (!clic.apretando) return false;
  const k = clave as { __clic?: () => void };
  if (!k.__clic) { k.__clic = () => { k.__clic = undefined; f(); }; clic.pendientes.push(() => k.__clic?.()); }
  else k.__clic = () => { k.__clic = undefined; f(); };
  return true;
}

const huellaDe = (e: Element) => [e.tagName, (e.textContent ?? '').trim().replace(/\s+/g, ' '), e.getAttribute('title') ?? '', e.getAttribute('aria-label') ?? '', e.getAttribute('data-accion') ?? ''].join('|');

export function instalarClics() {
  if (typeof document === 'undefined') return;
  const terminar = () => {
    clic.apretando = false; clearTimeout(clic.reloj);
    // después del clic, que el navegador manda enseguida después de soltar
    setTimeout(() => { const ps = clic.pendientes; clic.pendientes = []; ps.forEach(f => f()); }, 0);
  };
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !(e.target instanceof Element)) return;
    const c = e.target.closest(CONTROLES);
    if (!c) return;
    clic.apretando = true; clic.objetivo = c; clic.huella = huellaDe(c); clic.x = e.clientX; clic.y = e.clientY;
    // los contenedores del botón, de adentro hacia afuera (si la carta se rearma, uno de ellos sigue en la página)
    clic.raices = []; for (let p = c.parentElement; p; p = p.parentElement) clic.raices.push(p);
    clearTimeout(clic.reloj);
    clic.reloj = window.setTimeout(terminar, 1500);          // por las dudas: si nunca llega el «soltar», no se traba
  }, true);
  document.addEventListener('pointerup', e => {
    if (!clic.apretando) return;
    const o = clic.objetivo;
    clic.objetivo = null;
    if (o && !o.isConnected && e.pointerType === 'mouse') {
      // el botón apretado se fue con la carta: el mismo en la carta nueva
      const raiz = clic.raices.find(r => r.isConnected) ?? document.body;
      const cands = [...raiz.querySelectorAll(CONTROLES)].filter(x => huellaDe(x) === clic.huella && !(x as HTMLButtonElement).disabled);
      const dist = (x: Element) => { const r = x.getBoundingClientRect(); return Math.hypot(r.left + r.width / 2 - clic.x, r.top + r.height / 2 - clic.y); };
      const nuevo = cands.sort((a, b) => dist(a) - dist(b))[0] as HTMLElement | undefined;
      if (nuevo) setTimeout(() => nuevo.click(), 0);
    }
    terminar();
  }, true);
  document.addEventListener('pointercancel', () => { if (clic.apretando) { clic.objetivo = null; terminar(); } }, true);
}
