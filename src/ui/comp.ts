/**
 * Componentes de la interfaz (sistema «Structural Simulator»): sección con franja, indicador (KPI), chip de estado,
 * tarjeta de fórmula con números y celda de la planilla, y globo de explicación.
 */
import { fmt } from './estado';

export type H = HTMLElement;
export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...hijos: (Node | string)[]) => {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => (k === 'class' ? (e.className = v) : e.setAttribute(k, v)));
  hijos.forEach(c => e.append(c));
  return e;
};
/** escapa un texto para meterlo en HTML (contenido o atributo entre comillas): los datos del proyecto nunca van como HTML */
export const esc = (t: string) => t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Secciones plegables: las del panel izquierdo empiezan todas plegadas (así cada etapa se ve como una lista de títulos,
 * fácil de recorrer en un tutorial, y se abre lo que se va a usar); el avance y la axonometría, abiertos. Cada sección
 * que se abre o se cierra a mano se recuerda entre sesiones (los paneles se rearman con cada cambio).
 */
const CLAVE_PLEGADAS = 'torre3d.plegadas.v3';
let elegidas: Record<string, boolean> | null = null;
function estadoPlegado(): Record<string, boolean> {
  if (!elegidas) { try { elegidas = JSON.parse(localStorage.getItem(CLAVE_PLEGADAS) ?? '{}') as Record<string, boolean>; } catch { elegidas = {}; } }
  return elegidas;
}
/** ¿está plegada? (lo que eligió el usuario o, si nunca la tocó, lo que viene por defecto) */
export const estaPlegada = (clave: string, porDefecto = true) => estadoPlegado()[clave] ?? porDefecto;
export function plegarSeccion(clave: string, plegar: boolean) {
  estadoPlegado()[clave] = plegar;
  try { localStorage.setItem(CLAVE_PLEGADAS, JSON.stringify(estadoPlegado())); } catch { /* sin almacenamiento */ }
}
/** convierte una cabecera en plegable: tocarla muestra u oculta el cuerpo (con teclado: Enter o espacio) */
export function hacerPlegable(caja: HTMLElement, cab: HTMLElement, clave: string, porDefecto = true) {
  caja.classList.add('plegable');
  caja.dataset.clave = clave;
  cab.setAttribute('role', 'button'); cab.tabIndex = 0;
  const poner = (p: boolean) => { caja.classList.toggle('plegada', p); cab.setAttribute('aria-expanded', String(!p)); };
  poner(estaPlegada(clave, porDefecto));
  const cambiar = () => { const p = !caja.classList.contains('plegada'); poner(p); plegarSeccion(clave, p); };
  cab.addEventListener('click', ev => { if ((ev.target as HTMLElement).closest('button, a, input, select') && ev.target !== cab) return; cambiar(); });
  cab.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); cambiar(); } });
}
/** abre o pliega todas las secciones de un panel (y lo recuerda) */
export function plegarTodas(raiz: HTMLElement, plegar: boolean) {
  raiz.querySelectorAll<HTMLElement>('section.seccion.plegable').forEach(s => {
    s.classList.toggle('plegada', plegar); s.querySelector(':scope > .cab')?.setAttribute('aria-expanded', String(!plegar));
    if (s.dataset.clave) plegarSeccion(s.dataset.clave, plegar);
  });
}

/** Sección redondeada con franja de título (color del rol de la etapa). Se pliega tocando el título. */
export function seccion(titulo: string, ...hijos: (Node | string)[]): { el: H; cuerpo: H } {
  const cuerpo = h('div', { class: 'cuerpo' }, ...hijos);
  const cab = h('div', { class: 'cab' }, h('h3', {}, titulo), h('span', { class: 'plegar', 'aria-hidden': 'true' }, '▾'));
  const el = h('section', { class: 'seccion' }, cab, cuerpo);
  hacerPlegable(el, cab, titulo);
  return { el, cuerpo };
}

export type EstadoChip = 'verifica' | 'no verifica' | 'revisar' | 'completa' | 'pendiente' | 'informativo' | 'atención';
export const chip = (e: EstadoChip, texto: string = e) => h('span', { class: `chip-estado ${e.replace(' ', '-')}` }, texto);

/** Indicador: título en versalitas, valor grande en mono, nota; el color dice el estado. */
export function kpi(cap: string, valor: string, nota: string, color = 'var(--accent)', origen?: string): H {
  // origen: de qué etapa llega el número («← Viento»); sin origen, se calcula en esta etapa
  const k = h('div', { class: 'kpi' }, h('div', { class: 'cap' }, cap, ...(origen ? [h('span', { class: 'kpi-origen', title: `Este número llega de la etapa ${origen.replace('← ', '')}` }, origen)] : [])), h('div', { class: 'val' }, valor), h('div', { class: 'not' }, nota));
  k.style.setProperty('--c', color);
  return k;
}
export const colorEstado = (ok: boolean | null) => (ok === null ? 'var(--accent)' : ok ? 'var(--ok)' : 'var(--mal)');

// ------------------------------------------------------------------ notación matemática
/**
 * Letras en cursiva matemática de IBM Plex Math (U+1D434…): así se ven las variables de la guía y del CIRSOC,
 * sin depender de una cursiva sintética. Σ y las mayúsculas griegas de operador quedan derechas.
 */
export function mi(t: string): string {
  let o = '';
  for (const ch of t) {
    const c = ch.codePointAt(0)!;
    if (c >= 65 && c <= 90) o += String.fromCodePoint(0x1d434 + c - 65);
    else if (c === 104) o += '\u210e';
    else if (c >= 97 && c <= 122) o += String.fromCodePoint(0x1d44e + c - 97);
    else if (c >= 0x3b1 && c <= 0x3c9) o += String.fromCodePoint(0x1d6fc + c - 0x3b1);
    else if (c >= 0x391 && c <= 0x3a9 && c !== 0x3a3) o += String.fromCodePoint(0x1d6e2 + c - 0x391);
    else o += ch;
  }
  return o;
}
/** variable en cursiva matemática con subíndice opcional (una letra: cursiva; una palabra: derecha) */
export const v = (x: string, sub?: string) => `<span class="mv">${esc(mi(x))}</span>${sub ? `<sub>${esc(sub.length === 1 ? mi(sub) : sub)}</sub>` : ''}`;

const CON_SUB: Record<string, [string, string]> = {
  Mtras: ['M', 'tras'], Mrot: ['M', 'rot'], Qrot: ['Q', 'rot'], Qtras: ['Q', 'tras'], Mv: ['M', 'v'], Me: ['M', 'e'], Mt: ['M', 't'],
  Kzt: ['K', 'zt'], Kz: ['K', 'z'], Kd: ['K', 'd'], Cp: ['C', 'p'], qz: ['q', 'z'], qh: ['q', 'h'], hW: ['h', 'W'], Xr: ['X', 'r'],
  Pi: ['P', 'i'], Wi: ['W', 'i'], Ji: ['J', 'i'], xi: ['x', 'i'], yG: ['y', 'G'], zg: ['z', 'g'], 'σG': ['σ', 'G'], 'σV': ['σ', 'V'], 'σP': ['σ', 'P'],
  'σmáx': ['σ', 'máx'], 'σmín': ['σ', 'mín'], 'Jmín': ['J', 'mín'], hw: ['h', 'w'], Qi: ['Q', 'i'], Mi: ['M', 'i'], Jt: ['J', 't'],
};
const UNIDADES = new Set(['m', 't', 'tm', 'kg', 'cm', 'N', 'kN', 's', 'Hz', 'MPa']);
/** Fórmula escrita como texto («Mv = Σ Q · h») a HTML con las variables en cursiva matemática y los subíndices. */
export function mat(s: string): string {
  const partes = s.split(/([A-Za-zÁÉÍÓÚáéíóúñα-ωΑ-Ω]+)/);
  let o = '';
  for (let i = 0; i < partes.length; i++) {
    const t = partes[i];
    if (i % 2 === 0) { o += esc(t); continue; }
    const antes = partes[i - 1] ?? '', despues = partes[i + 1] ?? '';
    const esUnidad = UNIDADES.has(t) && (/\d\s*$/.test(antes) || /^\s*\/$/.test(antes) && i > 1 && UNIDADES.has(partes[i - 2]) || /^[²³⁴]/.test(despues) && /\d\s*$/.test(antes)
      || (/[(/·]\s*$/.test(antes) && /^[²³⁴⁵⁶]?\s*[)/·]/.test(despues)));
    // «viento A», «cara B»: letras que nombran, no variables; T1, M12: nombres de piezas y muros
    const nombra = t.length === 1 && ((/^\s+$/.test(antes) && /^(viento|cara|dirección)$/i.test(partes[i - 2] ?? '')) || (/[A-Z]/.test(t) && /^\d/.test(despues)));
    if (esUnidad) o += `<span class="u">${esc(t)}</span>`;
    else if (nombra || t === 'π' || (t === 'N' && /^\.º/.test(despues))) o += esc(t);
    else if (t.length === 1 && /[a-z]/.test(t) && /^\d\b/.test(despues)) { o += v(t, despues[0]); partes[i + 1] = despues.slice(1); }
    else if (t === 'GCpi') o += v('G') + v('C', 'pi');
    else if (t[0] === 'Σ' && t.length > 1) o += 'Σ' + mat(t.slice(1));
    else if (CON_SUB[t]) o += v(...CON_SUB[t]);
    else if (t.length === 1 && t !== 'Σ') o += v(t);
    else o += esc(t);
  }
  return o;
}
/** número reemplazado (mono, color de número) */
export const n = (x: number, d = 2) => `<span class="num">${fmt(x, d)}</span>`;
/** resultado con unidad */
export const r = (x: number, d = 2, u = '') => `<span class="res">${fmt(x, d)}</span>${u ? ` <span class="u">${esc(u)}</span>` : ''}`;
export const u = (t: string) => `<span class="u">${esc(t)}</span>`;
/** operadores con espacios finos */
export const op = (o: string) => `\u2009${o}\u2009`;

/** Tarjeta de fórmula: qué calcula, la ecuación con los números y la celda de la planilla. */
export function formula(que: string, ecuacion: string, ref?: string, estado?: 'verifica' | 'no verifica' | 'revisar'): H {
  const ec = h('div', { class: 'ec' });
  ec.innerHTML = ecuacion;
  const f = h('div', { class: `formula ${estado ? estado.replace(' ', '-') : ''}` }, h('div', { class: 'que' }, que), ec);
  if (ref) f.append(h('div', { class: 'ref' }, ref));
  return f;
}

// ------------------------------------------------------------------ globos de explicación
/**
 * Globo: al dejar el mouse 2 s sobre un elemento con data-globo="Título|Texto" aparece una explicación
 * (afirmaciones, no preguntas). Se cierra al mover el mouse a otra parte.
 */
export function activarGlobos() {
  let timer: number | undefined, globo: H | null = null, sobre: Element | null = null;
  const cerrar = () => { if (timer) clearTimeout(timer); timer = undefined; globo?.remove(); globo = null; };
  document.addEventListener('pointermove', ev => {
    const t = (ev.target as Element | null)?.closest?.('[data-globo]') ?? null;
    if (t === sobre) {
      if (globo) { globo.style.left = `${Math.min(ev.clientX + 14, innerWidth - 316)}px`; globo.style.top = `${Math.min(ev.clientY + 16, innerHeight - 120)}px`; }
      return;
    }
    cerrar();
    sobre = t;
    if (!t) return;
    const x = ev.clientX, y = ev.clientY;
    timer = window.setTimeout(() => {
      const [tit, ...resto] = (t.getAttribute('data-globo') ?? '').split('|');
      globo = h('div', { class: 'globo', role: 'tooltip' }, h('b', {}, tit), resto.join('|'));
      globo.style.left = `${Math.min(x + 14, innerWidth - 316)}px`;
      globo.style.top = `${Math.min(y + 16, innerHeight - 120)}px`;
      document.body.append(globo);
    }, 2000);
  });
  document.addEventListener('pointerdown', cerrar);
  document.addEventListener('keydown', cerrar);
}

/**
 * Notación matemática en toda la interfaz: los rótulos de campos, indicadores, encabezados de tablas, títulos de
 * figuras y fórmulas escritas como texto pasan por mat() (variables en cursiva matemática de IBM Plex Math).
 */
export const SELECTOR_MAT = '.kpi .cap, .formulario > label, .tabla-valores th, .panel th, .centro th, figcaption, .dg-f';
export function aplicarMat(raiz: ParentNode) {
  raiz.querySelectorAll<HTMLElement>(SELECTOR_MAT).forEach(e => {
    if (e.dataset.mat || e.children.length) return;
    const t = e.textContent ?? '';
    if (!/[A-Za-zα-ω]/.test(t)) return;
    e.innerHTML = mat(t); e.dataset.mat = '1';
  });
}

// ------------------------------------------------------------------ flecha curva de momento (SVG)
const NS_SVG = 'http://www.w3.org/2000/svg';
/**
 * Geometría de la flecha curva de un momento alrededor de (cx, cy): arco de radio r desde el ángulo a0 hasta a1
 * (radianes, antihorario positivo, con el eje y hacia arriba en la pantalla) y punta triangular tangente al final.
 * Sin DOM, para poder probarla; la usan la carta, la rototraslación y los dibujos del Excel (tools/figuras, en Python).
 */
export function geometriaArcoMomento(cx: number, cy: number, r: number, a0: number, a1: number, ancho = 3): { d: string; punta: string } {
  const p = (a: number) => ({ x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) });
  const s = a1 >= a0 ? 1 : -1;                                   // s = 1: antihorario en pantalla
  const L = Math.max(8, ancho * 3.2), W = Math.max(5, ancho * 2.2);
  const aFin = a1 - s * Math.min(Math.abs(a1 - a0) * 0.6, L / r);   // el arco termina donde empieza la punta
  const A = p(a0), B = p(aFin), T = p(a1);
  const grande = Math.abs(aFin - a0) > Math.PI ? 1 : 0, barrido = s > 0 ? 0 : 1;
  const d = `M${A.x.toFixed(1)},${A.y.toFixed(1)} A${r},${r} 0 ${grande} ${barrido} ${B.x.toFixed(1)},${B.y.toFixed(1)}`;
  const t = { x: T.x - B.x, y: T.y - B.y }, Lt = Math.hypot(t.x, t.y) || 1; t.x /= Lt; t.y /= Lt;
  const n = { x: -t.y, y: t.x };
  const punta = `${T.x.toFixed(1)},${T.y.toFixed(1)} ${(B.x + n.x * W / 2).toFixed(1)},${(B.y + n.y * W / 2).toFixed(1)} ${(B.x - n.x * W / 2).toFixed(1)},${(B.y - n.y * W / 2).toFixed(1)}`;
  return { d, punta };
}
/** la flecha curva como grupo SVG: <path class="arco-trazo"> y <polygon class="arco-punta"> */
export function arcoMomento(cx: number, cy: number, r: number, a0: number, a1: number, clase: string, ancho = 3): SVGGElement {
  const { d, punta } = geometriaArcoMomento(cx, cy, r, a0, a1, ancho);
  const g = document.createElementNS(NS_SVG, 'g');
  g.setAttribute('class', `arco-momento ${clase}`);
  const arco = document.createElementNS(NS_SVG, 'path');
  arco.setAttribute('d', d); arco.setAttribute('fill', 'none'); arco.setAttribute('stroke-width', String(ancho)); arco.setAttribute('class', 'arco-trazo');
  const pol = document.createElementNS(NS_SVG, 'polygon');
  pol.setAttribute('points', punta); pol.setAttribute('stroke', 'none'); pol.setAttribute('class', 'arco-punta');
  g.append(arco, pol);
  return g;
}

/**
 * Explicaciones del área central (dibujos y gráficos) detrás de un botón «?»: cada párrafo explicativo largo (p.nota) se
 * pliega; los que están seguidos van juntos en el mismo botón. Las llaves para leer los diagramas quedan siempre a la
 * vista junto a ellos: las leyendas, los «Cómo leer este gráfico», lo marcado como .llave y, dentro de cada párrafo, las
 * oraciones que dicen qué es cada color o trazo. Lo abierto se recuerda mientras la página está abierta. No toca las
 * fórmulas ni el panel de la izquierda (sus notas siguen siempre a la vista).
 */
const abiertas = new Set<string>();
/** una oración que explica cómo leer el dibujo (colores, trazos, franjas): no se esconde */
export const esLlave = (t: string) => t.length <= 170 && /\b(colou?r(es)?|rojo|roja|azul|verde|violeta|naranja|gris|amarill[oa]|punteada?s?|punteados?|llena|en trazos|sombreada|franja (rosada|sombreada|gris|verde)|banda|grosor)\b/i.test(t);
export function plegarExplicaciones(raiz: HTMLElement) {
  const notas = [...raiz.querySelectorAll<HTMLElement>('p.nota')]
    .filter(e => !e.classList.contains('llave') && !e.closest('.formula, table, figcaption, .gr-zoom, .gr-acomodos, .ayuda-plegable, .kpis, .fila-acciones, .seg, svg, details') && (e.textContent ?? '').trim().length > 70);
  notas.forEach(e => {
    // las oraciones que son llave se separan y quedan a la vista (solo en párrafos de texto puro)
    let llave: HTMLElement | null = null;
    if (!e.children.length) {
      const oraciones = (e.textContent ?? '').split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ«(¿])/);
      const si = oraciones.filter(esLlave), no = oraciones.filter(o => !esLlave(o));
      if (!no.join(' ').trim()) return;                                  // todo es llave: queda como está
      if (si.length) {
        llave = document.createElement('p'); llave.className = 'nota llave'; llave.textContent = si.join(' ');
        e.textContent = no.join(' ');
        if (e.textContent.trim().length <= 70) { e.after(llave); return; }     // lo que queda es corto: no hace falta el «?»
      }
    }
    const clave = (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const anterior = e.previousElementSibling as HTMLElement | null;
    let cuerpo: HTMLElement, caja: HTMLElement;
    if (anterior?.classList.contains('ayuda-plegable')) { caja = anterior; cuerpo = anterior.querySelector<HTMLElement>(':scope > .ayuda-texto')!; }
    else {
      caja = document.createElement('div'); caja.className = 'ayuda-plegable';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ayuda-boton';
      cuerpo = document.createElement('div'); cuerpo.className = 'ayuda-texto';
      const abierta = abiertas.has(clave);
      cuerpo.hidden = !abierta; b.setAttribute('aria-expanded', String(abierta));
      b.textContent = abierta ? 'Ocultar la explicación' : 'Ver la explicación';
      b.dataset.clave = clave;
      b.addEventListener('click', () => {
        cuerpo.hidden = !cuerpo.hidden;
        const k = b.dataset.clave!; if (cuerpo.hidden) abiertas.delete(k); else abiertas.add(k);
        b.setAttribute('aria-expanded', String(!cuerpo.hidden));
        b.textContent = cuerpo.hidden ? 'Ver la explicación' : 'Ocultar la explicación';
      });
      e.before(caja); caja.append(b, cuerpo);
    }
    cuerpo.append(e);
    // la oración llave a la vista, con «▸ Ver la explicación» al final de la misma línea (no suelto en un renglón
    // aparte); el resto se despliega debajo
    if (llave) { caja.before(llave); const b = caja.querySelector(':scope > .ayuda-boton'); if (b) { llave.append(' ', b); caja.classList.add('con-llave'); } }
  });
}
