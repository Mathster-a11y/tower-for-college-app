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
export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Sección redondeada con franja de título (color del rol de la etapa). */
export function seccion(titulo: string, ...hijos: (Node | string)[]): { el: H; cuerpo: H } {
  const cuerpo = h('div', { class: 'cuerpo' }, ...hijos);
  const el = h('section', { class: 'seccion' }, h('div', { class: 'cab' }, h('h3', {}, titulo)), cuerpo);
  return { el, cuerpo };
}

export type EstadoChip = 'verifica' | 'no verifica' | 'revisar' | 'completa' | 'pendiente' | 'informativo' | 'atención';
export const chip = (e: EstadoChip, texto: string = e) => h('span', { class: `chip-estado ${e.replace(' ', '-')}` }, texto);

/** Indicador: título en versalitas, valor grande en mono, nota; el color dice el estado. */
export function kpi(cap: string, valor: string, nota: string, color = 'var(--accent)'): H {
  const k = h('div', { class: 'kpi' }, h('div', { class: 'cap' }, cap), h('div', { class: 'val' }, valor), h('div', { class: 'not' }, nota));
  k.style.setProperty('--c', color);
  return k;
}
export const colorEstado = (ok: boolean | null) => (ok === null ? 'var(--accent)' : ok ? 'var(--ok)' : 'var(--mal)');

// ------------------------------------------------------------------ notación matemática
/** variable en itálica con subíndice opcional */
export const v = (x: string, sub?: string) => `<i>${esc(x)}</i>${sub ? `<sub>${esc(sub)}</sub>` : ''}`;
/** número reemplazado (mono, color de número) */
export const n = (x: number, d = 2) => `<span class="num">${fmt(x, d)}</span>`;
/** resultado con unidad */
export const r = (x: number, d = 2, u = '') => `<span class="res">${fmt(x, d)}</span>${u ? ` <span class="u">${esc(u)}</span>` : ''}`;
export const u = (t: string) => `<span class="u">${esc(t)}</span>`;
/** operadores con espacios finos */
export const op = (o: string) => ` ${o} `;

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
