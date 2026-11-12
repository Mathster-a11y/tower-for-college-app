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
