/**
 * Cuadros flotantes movibles (planta): cada cuadro o barra lleva un asa (⠿) para arrastrarlo con el mouse, el dedo o
 * el lápiz adonde no tape lo que se está dibujando ni otra barra. No sale del área de la planta. La posición se
 * recuerda en este navegador; doble clic (o doble toque) en el asa lo devuelve a su lugar.
 */
const CLAVE = 'torre3d.flotantes.v1';
type Pos = [number, number];
let memoria: Record<string, Pos> | null = null;
function leer(): Record<string, Pos> {
  if (memoria) return memoria;
  try { memoria = JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Record<string, Pos>; } catch { memoria = {}; }
  return memoria!;
}
function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify(memoria ?? {})); } catch { /* sin almacenamiento */ } }

const desplazamiento = (el: HTMLElement): Pos => {
  const t = (el.style.translate || '').split(/\s+/).map(parseFloat);
  return [isFinite(t[0]) ? t[0] : 0, isFinite(t[1]) ? t[1] : 0];
};

/** corre el cuadro para que entre entero en el área (si es más grande, queda pegado arriba a la izquierda) */
function acotar(el: HTMLElement, area: HTMLElement, p: Pos): Pos {
  const r = el.getBoundingClientRect(), a = area.getBoundingClientRect();
  if (!(r.width > 0) || !(a.width > 0)) return p;
  const [tx, ty] = desplazamiento(el);
  const x0 = r.left - tx, y0 = r.top - ty;                       // dónde estaría sin moverlo
  const m = 4;
  const x = Math.max(a.left + m - x0, Math.min(a.right - m - (x0 + r.width), p[0]));
  const y = Math.max(a.top + m - y0, Math.min(a.bottom - m - (y0 + r.height), p[1]));
  return [Math.round(r.width > a.width ? a.left + m - x0 : x), Math.round(r.height > a.height ? a.top + m - y0 : y)];
}

function poner(el: HTMLElement, p: Pos) {
  el.style.translate = p[0] || p[1] ? `${p[0]}px ${p[1]}px` : '';
  el.classList.toggle('movido', !!(p[0] || p[1]));
}

/**
 * Agrega el asa al cuadro y lo hace movible dentro de «area». «clave» identifica el cuadro para recordar dónde quedó.
 * en línea: el asa va como primer elemento de una barra horizontal; si no, arriba al centro del cuadro.
 */
export function hacerMovible(el: HTMLElement, area: HTMLElement, clave: string, o: { enLinea?: boolean } = {}) {
  if (el.querySelector(':scope > .asa-mover')) return;
  el.classList.add('movible');
  const asa = document.createElement('button');
  asa.type = 'button';
  asa.className = `asa-mover${o.enLinea ? ' en-linea' : ''}`;
  asa.textContent = o.enLinea ? '⠿' : '';
  asa.title = 'Arrastrá para mover este cuadro (doble clic: vuelve a su lugar)';
  asa.setAttribute('aria-label', 'Mover este cuadro');
  el.prepend(asa);
  const guardado = leer()[clave];
  if (guardado) poner(el, guardado);

  let arr: { id: number; x: number; y: number; p: Pos } | null = null;
  asa.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    ev.preventDefault(); ev.stopPropagation();
    arr = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, p: desplazamiento(el) };
    asa.setPointerCapture(ev.pointerId);
    el.classList.add('moviendose');
  });
  asa.addEventListener('pointermove', ev => {
    if (!arr || ev.pointerId !== arr.id) return;
    poner(el, acotar(el, area, [arr.p[0] + ev.clientX - arr.x, arr.p[1] + ev.clientY - arr.y]));
  });
  const fin = (ev: PointerEvent) => {
    if (!arr || ev.pointerId !== arr.id) return;
    arr = null; el.classList.remove('moviendose');
    const p = desplazamiento(el);
    const mem = leer();
    if (p[0] || p[1]) mem[clave] = p; else delete mem[clave];
    guardar();
  };
  asa.addEventListener('pointerup', fin);
  asa.addEventListener('pointercancel', fin);
  asa.addEventListener('click', ev => ev.stopPropagation());
  asa.addEventListener('dblclick', ev => { ev.stopPropagation(); poner(el, [0, 0]); delete leer()[clave]; guardar(); });
  asa.addEventListener('keydown', ev => {
    const d: Record<string, Pos> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
    if (!d[ev.key]) return;
    ev.preventDefault(); ev.stopPropagation();
    const p0 = desplazamiento(el), p = acotar(el, area, [p0[0] + d[ev.key][0], p0[1] + d[ev.key][1]]);
    poner(el, p); leer()[clave] = p; guardar();
  });
  // los cuadros que se rearman (replaceChildren) pierden el asa: se vuelve a poner primera
  new MutationObserver(() => { if (el.firstElementChild !== asa) el.prepend(asa); }).observe(el, { childList: true });
  // si la ventana o el panel cambian de tamaño, el cuadro vuelve a entrar en la planta
  new ResizeObserver(() => { const p = desplazamiento(el); if (p[0] || p[1]) poner(el, acotar(el, area, p)); }).observe(area);
}
