/**
 * Lámina de entrega A3 apaisada (420 × 297 mm), una por viento: arriba la ficha de la torre y el vuelco con el
 * suelo; abajo la lámina M, N y Q, las verificaciones y el rótulo (proyecto, alumno, curso, fecha, hoja).
 * Se dibuja en un SVG con unidades de 0,1 mm y cada carta va anidada a su escala.
 */
import { estado, fmt } from './estado';
import { carta } from './carta';
import { datosCarta } from './etapas';
import { AVISO } from '../autoria';

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, a: Record<string, string | number> = {}, txt?: string) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v)));
  if (txt !== undefined) e.textContent = txt;
  return e;
};
const W = 4200, H = 2970, M = 100;          // 0,1 mm: hoja A3 y margen de 10 mm

/** pone una carta (SVG con su propio viewBox) dentro de la lámina, en el rectángulo pedido */
function anidar(s: SVGSVGElement, x: number, y: number, w: number, h: number): SVGSVGElement {
  s.setAttribute('x', String(x)); s.setAttribute('y', String(y));
  s.setAttribute('width', String(w)); s.setAttribute('height', String(h));
  s.style.width = `${w}px`; s.style.height = `${h}px`; s.style.maxWidth = 'none';
  s.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return s;
}

export function laminaA3(dir: 'A' | 'B', hoja: number, hojas: number): SVGSVGElement | null {
  const antes = estado.dir;
  estado.dir = dir;
  try {
    const dc = datosCarta();
    if (!dc) return null;
    const p = estado.proyecto;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'lamina', role: 'img', 'aria-label': `Lámina A3, viento ${dir}` }) as SVGSVGElement;
    svg.append(el('rect', { x: 0, y: 0, width: W, height: H, class: 'lm-fondo' }));
    svg.append(el('rect', { x: M, y: M, width: W - 2 * M, height: H - 2 * M, class: 'lm-marco' }));
    // fila de arriba: ficha y vuelco
    const x0 = M + 20, wCol = (W - 2 * M - 60) / 2, yA = M + 20, hA = 1340;
    svg.append(anidar(carta(dc, 'B', 1100), x0, yA, wCol, hA));
    svg.append(anidar(carta(dc, 'D', 1100), x0 + wCol + 20, yA, wCol, hA));
    svg.append(el('line', { x1: M, x2: W - M, y1: yA + hA + 10, y2: yA + hA + 10, class: 'lm-linea' }));
    // fila de abajo: lámina M, N y Q a la izquierda
    const yB = yA + hA + 30, hB = H - M - 20 - yB, wB = Math.min(2160, (hB * 1100) / 720);
    svg.append(anidar(carta(dc, 'A', 1100), x0, yB, wB, hB));
    // a la derecha: verificaciones y rótulo
    const xR = x0 + wB + 40, wR = W - M - 20 - xR;
    svg.append(el('line', { x1: xR - 20, x2: xR - 20, y1: yB, y2: H - M - 10, class: 'lm-linea' }));
    const hRot = 470, yRot = H - M - 20 - hRot;
    verificaciones(svg, xR, yB + 10, wR, yRot - yB - 40);
    rotulo(svg, xR, yRot, wR, hRot, {
      proyecto: p.nombre || 'Proyecto', alumno: p.alumno || '—', dir, fuente: estado.fuente === 'guia' ? 'valores Guía/CIRSOC' : 'valores de la planilla',
      hoja: `${hoja} / ${hojas}`, fecha: new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }), hormigon: p.hormigon || 'H30',
    });
    return svg;
  } finally { estado.dir = antes; }
}

/** las verificaciones de la app (primero las que no verifican o hay que revisar) */
function verificaciones(svg: SVGSVGElement, x: number, y: number, w: number, h: number) {
  const cs = (estado.calculo.controles ?? []).filter(c => c.estado !== 'informativo');
  const orden = { 'no verifica': 0, 'atención': 1, verifica: 2 } as Record<string, number>;
  const lista = [...cs].sort((a, b) => (orden[a.estado] ?? 3) - (orden[b.estado] ?? 3));
  svg.append(el('text', { x, y: y + 30, class: 'lm-tit' }, 'Verificaciones'));
  const fila = 50, entran = Math.max(1, Math.floor((h - 110) / fila));
  const cols = [x, x + w - 520, x + w - 330, x + w - 150];
  ['Control', 'Planilla', 'Guía', ''].forEach((t, i) => svg.append(el('text', { x: cols[i] + (i === 1 || i === 2 ? 150 : 0), y: y + 80, class: 'lm-cab', 'text-anchor': i === 1 || i === 2 ? 'end' : 'start' }, t)));
  lista.slice(0, entran).forEach((c, i) => {
    const yy = y + 130 + i * fila;
    if (i % 2 === 0) svg.append(el('rect', { x: x - 8, y: yy - 34, width: w + 8, height: fila, class: 'lm-cebra' }));
    const nom = c.nombre.length > 46 ? `${c.nombre.slice(0, 45)}…` : c.nombre;
    svg.append(el('text', { x: cols[0], y: yy, class: 'lm-txt' }, nom));
    svg.append(el('text', { x: cols[1] + 150, y: yy, class: 'lm-num', 'text-anchor': 'end' }, fmt(c.planilla)));
    svg.append(el('text', { x: cols[2] + 150, y: yy, class: 'lm-num', 'text-anchor': 'end' }, fmt(c.guia)));
    const e = c.estado === 'atención' ? 'revisar' : c.estado;
    svg.append(el('rect', { x: cols[3], y: yy - 28, width: 150, height: 36, rx: 18, class: `lm-chip ${e.replace(' ', '-')}` }));
    svg.append(el('text', { x: cols[3] + 75, y: yy - 3, class: `lm-chip-txt ${e.replace(' ', '-')}`, 'text-anchor': 'middle' }, e));
  });
  if (lista.length > entran) svg.append(el('text', { x, y: y + 130 + entran * fila, class: 'lm-nota' }, `y ${lista.length - entran} controles más: ver el informe completo.`));
}

/** rótulo (cajetín) de la lámina */
function rotulo(svg: SVGSVGElement, x: number, y: number, w: number, h: number, d: { proyecto: string; alumno: string; dir: string; fuente: string; hoja: string; fecha: string; hormigon: string }) {
  svg.append(el('rect', { x, y, width: w, height: h, class: 'lm-rotulo' }));
  const fila = (yy: number) => svg.append(el('line', { x1: x, x2: x + w, y1: yy, y2: yy, class: 'lm-linea fina' }));
  svg.append(el('text', { x: x + 24, y: y + 70, class: 'lm-marca' }, 'TORRE 3D'));
  svg.append(el('text', { x: x + w - 24, y: y + 70, class: 'lm-cab', 'text-anchor': 'end' }, 'Electiva Edificios en Torre · FAUD-UNMDP'));
  fila(y + 100);
  const celda = (cx: number, cy: number, tit: string, val: string, ancho: number) => {
    svg.append(el('text', { x: cx + 24, y: cy + 40, class: 'lm-cab' }, tit));
    const v = val.length > Math.floor(ancho / 24) ? `${val.slice(0, Math.floor(ancho / 24) - 1)}…` : val;
    svg.append(el('text', { x: cx + 24, y: cy + 88, class: 'lm-val' }, v));
  };
  celda(x, y + 100, 'Proyecto', d.proyecto, w);
  fila(y + 210);
  const w3 = w / 3;
  celda(x, y + 210, 'Alumno', d.alumno, 2 * w3);
  celda(x + 2 * w3, y + 210, 'Fecha', d.fecha, w3);
  svg.append(el('line', { x1: x + 2 * w3, x2: x + 2 * w3, y1: y + 210, y2: y + 320, class: 'lm-linea fina' }));
  fila(y + 320);
  celda(x, y + 320, 'Contenido', `Viento ${d.dir} · ${d.hormigon} · ${d.fuente}`, 2 * w3);
  celda(x + 2 * w3, y + 320, 'Hoja', d.hoja, w3);
  svg.append(el('line', { x1: x + 2 * w3, x2: x + 2 * w3, y1: y + 320, y2: y + 430, class: 'lm-linea fina' }));
  fila(y + 430);
  svg.append(el('text', { x: x + 24, y: y + h - 12, class: 'lm-nota' }, `Hecho con Torre 3D · ${AVISO}`));
}

/** arma las dos láminas (viento A y B), abre el diálogo de impresión y las quita al terminar */
export function imprimirLaminas() {
  document.querySelector('.lamina-doc')?.remove();
  const raiz = document.documentElement, temaAntes = raiz.getAttribute('data-theme');
  raiz.setAttribute('data-theme', 'light');
  const doc = document.createElement('div');
  doc.className = 'lamina-doc';
  (['A', 'B'] as const).forEach((d, i) => { const s = laminaA3(d, i + 1, 2); if (s) { const h = document.createElement('div'); h.className = 'lamina-hoja'; h.append(s); doc.append(h); } });
  document.body.append(doc);
  // mientras se imprime, la hoja de todo el documento es A3 apaisada (si no, Chrome arma la página en A4 y achica)
  const pagina = document.createElement('style');
  pagina.textContent = '@page { size: 420mm 297mm; margin: 0; }';
  document.head.append(pagina);
  document.body.classList.add('imprimiendo');
  const fin = () => {
    document.body.classList.remove('imprimiendo'); doc.remove(); pagina.remove(); window.removeEventListener('afterprint', fin);
    if (temaAntes === null) raiz.removeAttribute('data-theme'); else raiz.setAttribute('data-theme', temaAntes);
  };
  window.addEventListener('afterprint', fin);
  setTimeout(() => window.print(), 60);
}
