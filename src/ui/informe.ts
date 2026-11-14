/**
 * Informe para imprimir (o guardar como PDF): pensado para estudiantes de arquitectura. Una página por pregunta,
 * cada una con «En una frase» arriba y un solo dibujo grande; los números completos van al final, en un anexo.
 *   1 · ¿Qué torre es?            portada con los números principales
 *   2 · ¿Verifica?                semáforo de los controles, agrupados, con una frase cada uno
 *   3 · ¿Cuánto viento recibe?    carta A de cada viento
 *   4 · ¿Se vuelca? ¿Y el suelo?  carta D de cada viento
 *   5 · ¿Es rígida? ¿Gira?        carta C (torre deformada) y rototraslación (paso 4) de cada viento
 *   6 · ¿Los tabiques resisten?   semáforo por pieza
 *   Anexo                         niveles, muros, reparto por pieza y todos los controles con sus celdas
 */
import { estado, fmt } from './estado';
import { AVISO } from '../autoria';
import { h } from './comp';
import { carta, type DatosCarta } from './carta';
import { datosCarta, datosRotoPlanoActual, tablaControles } from './etapas';
import { dibujoRototraslacion } from './rototraslacion';
import { tablaValores } from './diagramas';
import type { Control } from '../engine/verificaciones';

const ICONO: Record<string, string> = { verifica: '✓', 'no verifica': '✗', atención: '!', informativo: 'i' };
const sem = (e: string) => h('span', { class: `inf-sem ${e.replace(' ', '-')}` }, ICONO[e] ?? '·');
const frase = (t: string) => h('p', { class: 'inf-frase' }, h('b', {}, 'En una frase. '), t);
const hoja = (n: string, titulo: string, ...hijos: (Node | string)[]) => h('section', { class: 'inf-hoja' }, h('h2', { class: 'banda' }, h('span', { class: 'chip' }, n), titulo), ...hijos);
const dato = (t: string, v: string, nota = '') => h('div', { class: 'inf-dato' }, h('span', {}, t), h('b', {}, v), nota ? h('small', {}, nota) : '');

/** qué pregunta responde cada grupo de controles, en palabras del taller */
const PREGUNTA: Record<string, string> = {
  Viento: '¿El viento está bien calculado?',
  Estabilidad: '¿La torre se vuelca? ¿El suelo aguanta?',
  Funicular: '¿La resultante cae dentro de la base?',
  Rigidez: '¿La torre es suficientemente rígida?',
  Reparto: '¿El reparto entre los tabiques está bien hecho?',
};

function porDireccion<T>(f: (dc: DatosCarta, dir: 'A' | 'B') => T): T[] {
  const antes = estado.dir, out: T[] = [];
  try {
    for (const dir of ['A', 'B'] as const) { estado.dir = dir; const dc = datosCarta(); if (dc) out.push(f(dc, dir)); }
  } finally { estado.dir = antes; }
  return out;
}

export function armarInforme(): HTMLElement {
  const p = estado.proyecto, cs: Control[] = estado.calculo.controles ?? [];
  const doc = h('div', { class: 'informe' });
  const hoy = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  const malos = cs.filter(c => c.estado === 'no verifica'), atencion = cs.filter(c => c.estado === 'atención');
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const pb = p.niveles.slice(0, iPB + 1);
  const B = pb.reduce<number | null>((v, n) => n.B ?? v, null), L = pb.reduce<number | null>((v, n) => n.L ?? v, null);
  const cartas = porDireccion((dc, dir) => ({ dc, dir }));

  // ---- 1 · portada
  const p1 = h('section', { class: 'inf-hoja inf-portada' },
    h('div', { class: 'inf-marca' }, `TORRE 3D · Edificios en torre (FAUD-UNMDP) · ${AVISO}`),
    h('h1', {}, p.nombre || 'Proyecto'),
    h('p', { class: 'inf-sub' }, `${p.alumno ? p.alumno + ' · ' : ''}${hoy} · hormigón ${p.hormigon || 'H30'} · ${estado.fuente === 'guia' ? 'valores Guía/CIRSOC' : 'valores de la planilla'}`));
  p1.append(frase(malos.length ? `La torre no verifica ${malos.length} control${malos.length > 1 ? 'es' : ''}: ${malos.slice(0, 3).map(c => c.nombre).join('; ')}${malos.length > 3 ? '…' : ''}. La página 2 dice cuáles y por qué.`
    : `La torre verifica todos los controles${atencion.length ? ` (hay ${atencion.length} para revisar con la cátedra)` : ''}.`));
  const zTop = p.niveles[0]?.cota ?? 0;
  const datos = h('div', { class: 'inf-datos' },
    dato('Altura sobre PB', `${fmt(zTop)} m`, `${pb.length - 1} pisos`),
    dato('Planta en PB', B !== null && L !== null ? `${fmt(B)} × ${fmt(L)} m` : '—', 'B × L'),
    ...cartas.map(({ dc, dir }) => dato(`Viento ${dir}: W`, `${fmt(dc.W, 1)} t`, `a ${fmt(dc.hw)} m de la fundación`)),
    ...cartas.map(({ dc, dir }) => dato(`Flecha azotea ${dir}`, dc.roto ? `${fmt(dc.roto.dTop * 1000, 1)} mm` : '—', `límite h/500 = ${fmt((zTop / 500) * 1000, 0)} mm`)),
    ...cartas.map(({ dc, dir }) => dato(`Vuelco ${dir}: Me / Mv`, fmt(dc.vuelco.coef, 2), 'tiene que ser ≥ 1,5')));
  p1.append(datos);
  if (cartas[0]) p1.append(carta(cartas[0].dc, 'B', 1100));
  doc.append(p1);

  // ---- 2 · ¿Verifica?
  const p2 = hoja('2', '¿Verifica?');
  p2.append(frase('Cada control es una pregunta. Verde: verifica. Rojo: no verifica, hay que cambiar el diseño. Amarillo: para revisar con la cátedra.'));
  const grupos = new Map<string, Control[]>();
  cs.forEach(c => { const g = c.grupo.startsWith('Flexocompresión') ? 'Flexocompresión' : c.grupo; if (!grupos.has(g)) grupos.set(g, []); grupos.get(g)!.push(c); });
  for (const [g, lista] of grupos) {
    if (g === 'Flexocompresión') continue;                    // va en su página
    const caja = h('div', { class: 'inf-grupo' }, h('h3', {}, PREGUNTA[g] ?? g));
    lista.forEach(c => caja.append(h('div', { class: 'inf-ctrl' }, sem(c.estado), h('span', {}, h('b', {}, c.nombre), h('small', {}, ` · ${c.criterio}`)), h('span', { class: 'n' }, c.guia !== null ? `${fmt(c.guia, 2)} ${c.unidad}` : c.planilla !== null ? `${fmt(c.planilla, 2)} ${c.unidad}` : ''))));
    p2.append(caja);
  }
  const flex = grupos.get('Flexocompresión') ?? [];
  if (flex.length) p2.append(h('div', { class: 'inf-grupo' }, h('h3', {}, '¿Los tabiques resisten?'), h('div', { class: 'inf-ctrl' }, sem(flex.some(c => c.estado === 'no verifica') ? 'no verifica' : flex.some(c => c.estado === 'atención') ? 'atención' : 'verifica'), h('span', {}, h('b', {}, `${flex.filter(c => c.estado === 'verifica').length} de ${flex.length} verificaciones de tabiques en verde`), h('small', {}, ' · detalle en la página 6')))));
  doc.append(p2);

  // ---- 3 · ¿Cuánto viento?
  cartas.forEach(({ dc, dir }, i) => {
    const s = hoja(`3${'ab'[i]}`, `¿Cuánto viento recibe? · viento ${dir}`);
    s.append(frase(`El viento ${dir} empuja la torre con W = ${fmt(dc.W, 1)} t en total; es como una sola fuerza a ${fmt(dc.hw)} m de la fundación, que en la base hace un momento de ${fmt(dc.Mv, 0)} tm. Más arriba sopla más fuerte (Kz crece con la altura).`));
    s.append(carta(dc, 'A', 1100));
    doc.append(s);
  });
  // ---- 4 · ¿Se vuelca?
  cartas.forEach(({ dc, dir }, i) => {
    const v = dc.vuelco, ok = v.coef >= 1.5, nucleo = Math.abs(v.e) <= v.nucleo;
    const s = hoja(`4${'ab'[i]}`, `¿Se vuelca? ¿El suelo aguanta? · viento ${dir}`);
    s.append(frase(`El peso sostiene ${fmt(v.coef, 2)} veces lo que el viento intenta volcar (${ok ? 'más' : 'menos'} que 1,5: ${ok ? 'no se vuelca' : 'no alcanza'}). La resultante cae a ${fmt(v.e, 2)} m del centro, ${nucleo ? 'dentro' : 'fuera'} del núcleo central (${fmt(v.nucleo, 2)} m): ${nucleo ? 'toda la base apoya comprimida' : 'una parte de la base se levanta'}.`));
    s.append(carta(dc, 'D', 1100));
    doc.append(s);
  });
  // ---- 5 · ¿Es rígida? ¿Gira?
  const antes = estado.dir;
  try {
    cartas.forEach(({ dc, dir }, i) => {
      estado.dir = dir;
      const dp = datosRotoPlanoActual();
      const lim = (dc.zTop / 500) * 1000, dTop = dc.roto ? dc.roto.dTop * 1000 : NaN;
      const s = hoja(`5${'ab'[i]}`, `¿Es rígida? ¿Gira? · viento ${dir}`);
      s.append(frase(`La azotea se corre ${fmt(dTop, 1)} mm (el límite es ${fmt(lim, 0)} mm, h/500): ${dTop <= lim ? 'la torre es suficientemente rígida' : 'hay que agregar rigidez'}. ${Math.abs(dp.Mt) > 1e-6 ? `Como el centro de rigidez está a ${fmt(Math.abs(dp.Xr))} m del eje, la planta además gira (Mt = ${fmt(Math.abs(dp.Mt), 0)} tm) y los tabiques del lado alejado trabajan más.` : 'El centro de rigidez está en el eje: la planta no gira, cada pieza toma viento según su J.'}`));
      s.append(carta(dc, 'C', 1100));
      s.append(dibujoRototraslacion(dp, 4, { ancho: 900, alto: 560 }));
      doc.append(s);
    });
  } finally { estado.dir = antes; }
  // ---- 6 · ¿Los tabiques resisten?
  const p6 = hoja('6', '¿Los tabiques resisten?');
  const mal = flex.filter(c => c.estado === 'no verifica');
  p6.append(frase(mal.length ? `${mal.length} verificaci${mal.length > 1 ? 'ones' : 'ón'} de tabiques no ${mal.length > 1 ? 'dan' : 'da'}: o hay tracción que necesita armadura, o la compresión supera la del hormigón. La lista dice cuáles.` : 'Todos los tabiques resisten: la compresión está por debajo de la del hormigón y, donde hay tracción, se calcula la armadura.'));
  const tf = h('div', { class: 'inf-grupo' });
  flex.forEach(c => tf.append(h('div', { class: 'inf-ctrl' }, sem(c.estado), h('span', {}, h('b', {}, c.nombre), h('small', {}, ` · ${c.grupo.replace('Flexocompresión, ', '')} · ${c.criterio}`)), h('span', { class: 'n' }, c.guia !== null ? `${fmt(c.guia, 1)} ${c.unidad}` : ''))));
  p6.append(tf);
  doc.append(p6);

  // ---- Anexo
  const an = hoja('A', 'Anexo · los números');
  an.append(h('p', { class: 'inf-nota' }, 'Para el que quiera seguir la cuenta: los datos del proyecto, el reparto entre piezas y todos los controles con la celda de la planilla de donde salen.'));
  an.append(h('h3', {}, 'Niveles'), tablaValores(['Nivel', 'cota (m)', 'B (m)', 'L (m)'], p.niveles.map(n => [n.nombre, n.cota, n.B ?? '', n.L ?? '']), [0, 2, 2, 2]));
  an.append(h('h3', {}, 'Muros'), tablaValores(['Muro', 'tipo', 'x (m)', 'y (m)', 'largo (m)', 'espesor (m)', 'pieza A', 'pieza B'],
    p.muros.map(m => [m.id, m.tipo ?? 'tabique', m.x, m.y, m.largo, m.espesor, m.piezaA, m.piezaB]), [0, 0, 2, 2, 2, 2, 0, 0]));
  try {
    (['A', 'B'] as const).forEach(dir => {
      estado.dir = dir;
      const dp = datosRotoPlanoActual();
      an.append(h('h3', {}, `Reparto entre piezas · viento ${dir} (ΣJ = ${fmt(dp.SJ, 3)} m⁴ · e = ${fmt(Math.abs(dp.Xr))} m · Mt = ${fmt(Math.abs(dp.Mt), 1)} tm)`),
        tablaValores(['Pieza', 'J (m⁴)', '% ΣJ', 'a (m)', 'traslación (t)', 'rotación (t)', 'total (t)'], dp.paralelos.map(x => [x.nombre, x.J, x.frac * 100, x.a, x.tras, x.rot, x.total]), [0, 3, 1, 2, 2, 2, 2]));
    });
  } finally { estado.dir = antes; }
  an.append(h('h3', {}, 'Controles con sus celdas'), tablaControles(cs));
  an.append(h('p', { class: 'inf-pie' }, `Informe generado con Torre 3D (${AVISO}). La planilla .xlsx escrita por la app recalcula estos valores en Excel.`));
  doc.append(an);
  doc.querySelectorAll('details').forEach(x => { (x as HTMLDetailsElement).open = true; });
  return doc;
}

/** Arma el informe, abre el diálogo de impresión y lo quita al terminar. */
export function imprimirInforme() {
  document.querySelector('.informe')?.remove();
  const raiz = document.documentElement, temaAntes = raiz.getAttribute('data-theme');
  raiz.setAttribute('data-theme', 'light');
  const doc = armarInforme();
  document.body.append(doc);
  document.body.classList.add('imprimiendo');
  const fin = () => {
    document.body.classList.remove('imprimiendo'); doc.remove(); window.removeEventListener('afterprint', fin);
    if (temaAntes === null) raiz.removeAttribute('data-theme'); else raiz.setAttribute('data-theme', temaAntes);
  };
  window.addEventListener('afterprint', fin);
  setTimeout(() => window.print(), 60);
}
