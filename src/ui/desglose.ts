/**
 * Desglose por hoja de la planilla, en PDF (diálogo de impresión, como el informe) y en PowerPoint (.pptx):
 * los temas de cada hoja y el cálculo analítico paso por paso al lado del resultado de la planilla (Excel),
 * con los controles verificados con los dos. La última hoja (flexocompresión) queda afuera: se revisa aparte.
 */
import { estado } from './estado';
import { AUTOR, AVISO } from '../autoria';
import { h, mat } from './comp';
import { dibujosPorHoja, type Dibujo } from './dibujosDesglose';
import { desglosar, num, resumenHoja, textoDiferencia, type EntradaDesglose, type HojaDesglose } from '../engine/desglose';

export function entradaDesglose(): EntradaDesglose {
  const p = estado.proyecto, c = estado.calculo;
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  return {
    d: c.asig.datos, r: c.res, filaNivel: c.asig.filaNivel, nombresNivel: p.niveles.map(n => n.nombre),
    piezas: c.asig.piezas.map(z => ({ nombre: z.nombre, dir: z.dir, fila: z.filaHoja })), hormigon: p.hormigon || 'H30',
    BPB: p.niveles.slice(0, iPB + 1).reduce<number | null>((v, n) => n.B ?? v, null) ?? 0,
  };
}

/** lo que se sabe de la última hoja (queda fuera del desglose) */
export const PENDIENTE_FLEX = [
  'D13:D20 tienen 0,01 fijo en lugar de B · C: las piezas 10 a 17 no suman su peso propio.',
  'El módulo resistente de cada fila está fijo (simétrica, asimétrica o circular según la fila), no según la pieza.',
  'Combina el peso con la compresión y la sobrecarga con la tracción; el caso más desfavorable es al revés.',
  'Verifica la pieza entera (N / área total); la guía separa almas y alas, cada una con su N.',
  'Lee el momento de la columna O de la rototraslación, que suma momento (tm) con corte (t).',
];

const cumple = (b: boolean | null) => (b === null ? '—' : b ? '✓ verifica' : '✗ no verifica');
const fecha = () => new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

// ------------------------------------------------------------------ PDF (documento para imprimir)
export function armarDesglose(hojas: HojaDesglose[], dibujos: Dibujo[][] = []): HTMLElement {
  const p = estado.proyecto;
  const doc = h('div', { class: 'informe desglose' });
  doc.append(h('header', { class: 'inf-portada' },
    h('div', { class: 'inf-marca' }, `TORRE 3D · Edificios en torre (FAUD-UNMDP) · ${AVISO}`),
    h('h1', {}, 'Desglose analítico de la planilla'),
    h('p', {}, `${p.nombre || 'Proyecto'} · ${fecha()} · hormigón ${p.hormigon || 'H30'} · ${AUTOR}`)));
  const intro = h('section', { class: 'inf-hoja dg-resumen' }, h('h2', {}, 'Cómo leer este desglose'));
  intro.append(h('p', {}, 'Cada hoja del Excel se vuelve a calcular a mano, paso por paso, con las fórmulas del CIRSOC 102 y de la guía de la cátedra. Al lado va el resultado de la planilla (el que da Excel con estos mismos datos) y la celda donde está. Al lado va la diferencia: Δ = Excel − analítico y su porcentaje sobre el analítico, con un semáforo: verde menos de 0,5 % (coincide), amarillo de 0,5 % a 5 % (revisar), rojo más de 5 % (preocupa). Cada hoja explica por qué difiere.'));
  intro.append(h('p', {}, 'Cada hoja usa como datos los mismos valores que recibe en la planilla, así cada diferencia aparece en la hoja donde nace. Los controles se verifican con los dos resultados.'));
  const t = h('table', { class: 'dg-tabla' });
  t.append(h('tr', {}, ...['Hoja', 'Valores comparados', 'Verde', 'Amarillo', 'Rojo', 'Analítico', 'Excel'].map(x => h('th', {}, x))));
  hojas.forEach((hj, i) => {
    const r = resumenHoja(hj);
    t.append(h('tr', {}, h('td', {}, `${i + 1} · ${hj.hoja}`), h('td', { class: 'n' }, String(r.total)), h('td', { class: 'n sem-verde' }, String(r.coinciden)), h('td', { class: `n ${r.amarillos ? 'sem-amarillo' : ''}` }, String(r.amarillos)), h('td', { class: `n ${r.rojos ? 'sem-rojo' : ''}` }, String(r.rojos)),
      h('td', {}, cumple(r.verificaAnalitico)), h('td', {}, cumple(r.verificaExcel))));
  });
  t.append(h('tr', {}, h('td', {}, '7 · Flex comp PB paralelos'), h('td', { colspan: '6' }, 'Fuera del desglose: su matemática se revisa aparte (ver la última página).')));
  intro.append(t);
  doc.append(intro);
  hojas.forEach((hj, i) => {
    const sec = seccionHoja(hj, i + 1);
    const dib = dibujos[i] ?? [];
    if (dib.length) {
      sec.append(h('h3', {}, 'Dibujos'));
      const g = h('div', { class: 'dg-dibujos' });
      dib.forEach(d => g.append(h('figure', {}, h('img', { src: d.png, alt: d.titulo }), h('figcaption', {}, d.titulo))));
      sec.append(g);
    }
    doc.append(sec);
  });
  const s7 = h('section', { class: 'inf-hoja' }, h('h2', {}, '7 · Flex comp PB paralelos — pendiente de revisión'));
  s7.append(h('p', {}, 'Esta hoja no entra en el desglose: la matemática no está terminada. Lo que se sabe hasta ahora:'));
  s7.append(h('ul', {}, ...PENDIENTE_FLEX.map(x => h('li', {}, x))));
  s7.append(h('p', { class: 'inf-pie' }, `Desglose generado con Torre 3D (${AVISO}). Valores de la planilla: los de Excel con estos datos (la app usa sus mismas fórmulas, comprobadas celda por celda contra LibreOffice).`));
  doc.append(s7);
  return doc;
}

function seccionHoja(hj: HojaDesglose, n: number): HTMLElement {
  const s = h('section', { class: 'inf-hoja dg-hoja' }, h('h2', {}, `${n} · Hoja «${hj.hoja}»`));
  const r = resumenHoja(hj);
  s.append(h('p', { class: 'dg-veredicto' }, `${r.coinciden} de ${r.total} valores en verde · ${r.amarillos} en amarillo · ${r.rojos} en rojo · analítico: ${cumple(r.verificaAnalitico)} · Excel: ${cumple(r.verificaExcel)}`));
  s.append(h('h3', {}, 'Temas de la hoja'));
  s.append(h('ul', { class: 'dg-temas' }, ...hj.temas.map(x => h('li', {}, h('b', {}, `${x.titulo}. `), x.texto, h('span', { class: 'dg-fuente' }, ` (${x.fuente})`)))));
  s.append(h('p', { class: 'dg-datos' }, h('b', {}, 'Datos: '), hj.datos.map(x => `${x.nombre} = ${x.valor}`).join(' · ')));
  s.append(h('h3', {}, 'Paso por paso'));
  const t = h('table', { class: 'dg-tabla dg-pasos' });
  t.append(h('tr', {}, ...['#', 'Paso', 'Fórmula y sustitución', 'Analítico', 'Excel', ''].map(x => h('th', {}, x))));
  hj.pasos.forEach((p, i) => {
    const u = p.unidad ? ` ${p.unidad}` : '';
    const df = textoDiferencia(p.analitico, p.excel, p.unidad, p.dec);
    t.append(h('tr', { class: df.nivel && df.nivel !== 'verde' ? `dg-dif dg-${df.nivel}` : '' },
      h('td', { class: 'n' }, String(i + 1)), h('td', {}, p.titulo),
      h('td', {}, (() => { const f = h('div', { class: 'dg-f' }); f.innerHTML = mat(p.formula); return f; })(), h('div', { class: 'dg-s' }, p.sustitucion), ...(p.nota ? [h('div', { class: 'dg-nota' }, p.nota)] : [])),
      h('td', { class: 'n' }, `${num(p.analitico, p.dec)}${u}`),
      h('td', { class: 'n' }, p.excel === null ? '—' : `${num(p.excel, p.dec)}${u}`, h('div', { class: 'dg-celda' }, p.celda)),
      h('td', { class: df.nivel ? `sem-${df.nivel}` : '' }, df.texto)));
  });
  s.append(t);
  hj.tablas.forEach(tb => {
    s.append(h('h3', {}, tb.titulo));
    const tt = h('table', { class: `dg-tabla dg-niveles${tb.columnas.length > 3 ? ' dg-ancha' : ''}` });
    tt.append(h('tr', {}, h('th', {}, ''), ...tb.columnas.flatMap(c => [h('th', { class: 'n' }, `${c.nombre}${c.unidad ? ` (${c.unidad})` : ''}`), h('th', { class: 'n' }, 'Excel'), h('th', {}, 'Δ')])));
    tb.filas.forEach(f => tt.append(h('tr', {}, h('td', {}, f.etiqueta), ...f.valores.flatMap(([a, e], k) => {
      const df = textoDiferencia(a, e, tb.columnas[k].unidad, tb.columnas[k].dec);
      return [h('td', { class: 'n' }, num(a, tb.columnas[k].dec)), h('td', { class: 'n' }, e === null ? '—' : num(e, tb.columnas[k].dec)), h('td', { class: `n ${df.nivel ? `sem-${df.nivel}` : ''}` }, df.corto)];
    }))));
    s.append(tt);
  });
  s.append(h('h3', {}, 'Controles'));
  const tc = h('table', { class: 'dg-tabla' });
  tc.append(h('tr', {}, ...['Control', 'Criterio', 'Analítico', '', 'Excel', ''].map(x => h('th', {}, x))));
  hj.controles.forEach(c => tc.append(h('tr', {}, h('td', {}, c.nombre), h('td', {}, c.criterio, ...(c.nota ? [h('div', { class: 'dg-nota' }, c.nota)] : [])),
    h('td', { class: 'n' }, `${num(c.analitico, c.dec)} ${c.unidad}`), h('td', {}, cumple(c.cumpleAnalitico)),
    h('td', { class: 'n' }, c.excel === null ? '—' : `${num(c.excel, c.dec)} ${c.unidad}`), h('td', {}, cumple(c.cumpleExcel)))));
  s.append(tc);
  if (hj.diferencias.length) { s.append(h('h3', {}, 'Por qué difieren')); s.append(h('ul', { class: 'dg-difs' }, ...hj.diferencias.map(x => h('li', {}, x)))); }
  return s;
}

export async function imprimirDesglose() {
  document.querySelector('.informe')?.remove();
  const dib = await dibujosPorHoja();
  const raiz = document.documentElement, temaAntes = raiz.getAttribute('data-theme');
  raiz.setAttribute('data-theme', 'light');
  const doc = armarDesglose(desglosar(entradaDesglose()), dib);
  document.body.append(doc);
  document.body.classList.add('imprimiendo');
  const fin = () => {
    document.body.classList.remove('imprimiendo'); doc.remove(); window.removeEventListener('afterprint', fin);
    if (temaAntes === null) raiz.removeAttribute('data-theme'); else raiz.setAttribute('data-theme', temaAntes);
  };
  window.addEventListener('afterprint', fin);
  await Promise.all([...doc.querySelectorAll('img')].map(i => (i as HTMLImageElement).decode().catch(() => undefined)));
  setTimeout(() => window.print(), 60);
}

// ------------------------------------------------------------------ PowerPoint
const AZUL = '1A6BBD', TINTA = '1F2328', GRIS = '5F6B76', OK = '1A7A3A', MAL = 'C62828', AMARILLO = 'FBF1DC', FONDO_OK = 'EAF6EC';
/** semáforo: color del texto y del fondo */
const SEM: Record<string, { c: string; f: string }> = { verde: { c: '1A7A3A', f: 'EAF6EC' }, amarillo: { c: '8A5F00', f: 'FBF1DC' }, rojo: { c: 'C62828', f: 'FBE9E9' } };
const FUENTE = 'Calibri';

/** cada hoja de la planilla en la presentación: color y etapa de la app, la pregunta que responde y qué recibe y entrega */
const META = [
  { corto: 'Viento', color: 'B8401A', etapa: '02 Viento', pregunta: '¿Cuánta presión hace el viento a cada altura?', recibe: 'datos del sitio y cotas de los niveles', entrega: 'la presión neta de cada nivel → M,NyQ' },
  { corto: 'M, N y Q', color: '3F51B5', etapa: '03 Fuerzas · 04 Estabilidad', pregunta: '¿Qué fuerza, corte, momento y peso tiene cada nivel? ¿La torre vuelca?', recibe: 'la presión neta (hoja viento)', entrega: 'W y h → J mínimo · Q y Mv → rototraslación' },
  { corto: 'J paralelos', color: '8A5F00', etapa: '05 Rigidez · viento A', pregunta: '¿Cuánta rigidez (J) aporta cada pieza paralela al viento A?', recibe: 'las piezas del proyecto y W, h (M,NyQ)', entrega: 'el J de cada pieza → rototraslación cara mayor' },
  { corto: 'J ortogonales', color: '8A5F00', etapa: '05 Rigidez · viento B', pregunta: '¿Cuánta rigidez aporta cada pieza paralela al viento B?', recibe: 'las piezas del proyecto y W, h (M,NyQ)', entrega: 'el J de cada pieza → rototraslación cara menor' },
  { corto: 'Roto. mayor', color: '6A3D9A', etapa: '06 Rototrasl. · viento A', pregunta: '¿Cómo se reparte el corte del viento A entre las piezas?', recibe: 'Q y Mv (M,NyQ) y los J (hojas J)', entrega: 'el momento de cada pieza → flexocompresión' },
  { corto: 'Roto. menor', color: '6A3D9A', etapa: '06 Rototrasl. · viento B', pregunta: '¿Cómo se reparte el corte del viento B entre las piezas?', recibe: 'Q y Mv (M,NyQ, columnas N y O) y los J', entrega: 'el momento de cada pieza (viento B)' },
  { corto: 'Flexocomp.', color: 'AD1457', etapa: '07 Flexión', pregunta: '¿Cada muro resiste la compresión y la tracción?', recibe: 'el momento de cada pieza y su peso', entrega: '— (pendiente de revisión)' },
];

/** arma el .pptx (pptxgenjs se carga recién al usarlo) y devuelve el archivo */
export async function armarPPTX(hojas: HojaDesglose[], nombreProyecto: string, dibujos: Dibujo[][] = []): Promise<{ escribir: (nombre: string) => Promise<unknown>; diapositivas: number }> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';                                   // 13,33 × 7,5 in
  pptx.author = AUTOR; pptx.title = `Desglose analítico · ${nombreProyecto}`;
  let n = 0;
  type Diapo = ReturnType<typeof pptx.addSlide>;
  const txt = (s: Diapo, t: string | unknown[], o: Record<string, unknown>) => s.addText(t as never, { fontFace: FUENTE, color: TINTA, margin: 0, ...o });
  /** barra de avance por las hojas (abajo): la actual llena, las anteriores claras */
  const avance = (s: Diapo, i: number) => {
    const w = 1.25, x0 = 0.4;
    META.forEach((m, k) => {
      const x = x0 + k * (w + 0.06), act = k === i, hecho = i >= 0 && k < i;
      s.addShape('rect', { x, y: 7.02, w, h: 0.26, fill: { color: act ? m.color : hecho ? 'E3E8ED' : 'FFFFFF' }, line: { color: act ? m.color : 'C9D1D9', width: 0.75 } });
      txt(s, `${k + 1} ${m.corto}`, { x, y: 7.02, w, h: 0.26, fontSize: 8.5, bold: act, color: act ? 'FFFFFF' : hecho ? GRIS : '8A949E', align: 'center', valign: 'middle' });
    });
  };
  const semaforo = (s: Diapo) => {
    [['1A7A3A', 'EAF6EC', '✓ < 0,5 %'], ['8A5F00', 'FBF1DC', '0,5 % a 5 %'], ['C62828', 'FBE9E9', '> 5 %']].forEach(([c, f], k) => {
      s.addShape('rect', { x: 9.75 + k * 1.2, y: 7.06, w: 0.18, h: 0.18, fill: { color: f }, line: { color: c, width: 1 } });
      txt(s, ['✓ < 0,5 %', '0,5–5 %', '> 5 %'][k], { x: 9.97 + k * 1.2, y: 7.02, w: 0.95, h: 0.26, fontSize: 8.5, color: c, valign: 'middle' });
    });
  };
  /** diapositiva con el marco común: banda de la hoja, título, avance y número */
  const nueva = (i: number, seccion: string, titulo: string, sub = '', conSem = false) => {
    const s = pptx.addSlide(); n++;
    const m = META[i] ?? { color: AZUL, corto: '', etapa: '' };
    s.background = { color: 'FFFFFF' };
    s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.42, fill: { color: m.color } });
    txt(s, i >= 0 ? `HOJA ${i + 1} DE 7 · ${(hojas[i]?.hoja ?? META[i].corto).toUpperCase()} · ${seccion.toUpperCase()}` : seccion.toUpperCase(), { x: 0.4, y: 0, w: 9, h: 0.42, fontSize: 11, bold: true, color: 'FFFFFF', valign: 'middle', charSpacing: 1 });
    if (i >= 0) txt(s, `en la app: ${m.etapa}`, { x: 8.9, y: 0, w: 4.03, h: 0.42, fontSize: 10, color: 'FFFFFF', align: 'right', valign: 'middle' });
    txt(s, titulo, { x: 0.4, y: 0.55, w: 12.5, h: 0.55, fontSize: 24, bold: true });
    if (sub) txt(s, sub, { x: 0.4, y: 1.08, w: 12.5, h: 0.35, fontSize: 12.5, color: GRIS });
    s.addShape('line', { x: 0.4, y: 6.9, w: 12.53, h: 0, line: { color: 'D0D7DE', width: 0.75 } });
    avance(s, i);
    if (conSem) semaforo(s); else txt(s, `${nombreProyecto} · ${n}`, { x: 9.6, y: 7.02, w: 3.33, h: 0.26, fontSize: 8.5, color: GRIS, align: 'right', valign: 'middle' });
    if (conSem) txt(s, String(n), { x: 12.95, y: 7.02, w: 0.3, h: 0.26, fontSize: 8.5, color: GRIS, align: 'right', valign: 'middle' });
    return s;
  };
  const celda = (t: string, o: Record<string, unknown> = {}) => ({ text: t, options: { fontFace: FUENTE, fontSize: 12, color: TINTA, valign: 'middle', ...o } });
  const cab = (t: string) => celda(t, { bold: true, fill: { color: 'EEF2F6' }, color: GRIS, fontSize: 11 });
  const estadoCelda = (a: number, e: number | null, unidad = '', dec = 2) => { const d = textoDiferencia(a, e, unidad, dec); return celda(d.texto, { color: d.nivel ? SEM[d.nivel].c : GRIS, fill: d.nivel && d.nivel !== 'verde' ? { color: SEM[d.nivel].f } : undefined, bold: true, fontSize: 10 }); };
  const verifica = (b: boolean | null) => celda(b === null ? '—' : b ? '✓ verifica' : '✗ no verifica', { color: b === null ? GRIS : b ? OK : MAL, bold: true });
  const paso = (i: number, inicio: string) => hojas[i]?.pasos.find(p => p.titulo.startsWith(inicio));
  const val = (i: number, inicio: string, dec?: number) => { const p = paso(i, inicio); return p ? `${num(p.analitico, dec ?? p.dec)} ${p.unidad}`.trim() : '—'; };
  /** chips verde / amarillo / rojo de una hoja */
  const chips = (s: Diapo, i: number, x: number, y: number, esc = 1) => {
    const r = resumenHoja(hojas[i]);
    [[r.coinciden, SEM.verde], [r.amarillos, SEM.amarillo], [r.rojos, SEM.rojo]].forEach(([v, c], k) => {
      const cc = c as { c: string; f: string };
      s.addShape('roundRect', { x: x + k * 0.62 * esc, y, w: 0.56 * esc, h: 0.3 * esc, fill: { color: cc.f }, line: { color: cc.c, width: 0.75 }, rectRadius: 0.08 });
      txt(s, String(v), { x: x + k * 0.62 * esc, y, w: 0.56 * esc, h: 0.3 * esc, fontSize: 11 * esc, bold: true, color: cc.c, align: 'center', valign: 'middle' });
    });
  };

  // ---------------------------------------------------------------- portada
  const s0 = pptx.addSlide(); n++;
  s0.background = { color: '14202B' };
  META.forEach((m, k) => s0.addShape('rect', { x: k * (13.33 / 7), y: 0, w: 13.33 / 7, h: 0.18, fill: { color: m.color } }));
  txt(s0, 'TORRE 3D · EDIFICIOS EN TORRE · FAUD-UNMDP', { x: 0.7, y: 1.6, w: 12, h: 0.4, fontSize: 13, bold: true, color: '9FB3C6', charSpacing: 2 });
  txt(s0, 'Desglose analítico de la planilla', { x: 0.7, y: 2.1, w: 12, h: 1, fontSize: 40, bold: true, color: 'FFFFFF' });
  txt(s0, nombreProyecto, { x: 0.7, y: 3.1, w: 12, h: 0.6, fontSize: 22, color: 'DCE4EC' });
  txt(s0, 'Cada hoja del Excel, en el mismo orden que la planilla, calculada a mano paso por paso y comparada con el resultado de Excel.', { x: 0.7, y: 4.0, w: 11.5, h: 0.8, fontSize: 16, color: 'B9C5D1' });
  txt(s0, `${fecha()} · ${AUTOR} · ${AVISO}`, { x: 0.7, y: 6.6, w: 12, h: 0.4, fontSize: 11, color: '8A9AAB' });

  // ---------------------------------------------------------------- recorrido: cómo pasan los datos de una hoja a la siguiente
  const sf = nueva(-1, 'Recorrido', 'El recorrido de la planilla', 'Cada hoja recibe datos de la anterior y entrega resultados a la siguiente. La presentación sigue este orden.');
  const caja = (k: number, x: number, y: number, w = 2.25, h = 1.55) => {
    const m = META[k];
    sf.addShape('rect', { x, y, w, h, fill: { color: 'FFFFFF' }, line: { color: m.color, width: 1.5 } });
    sf.addShape('rect', { x, y, w, h: 0.36, fill: { color: m.color } });
    txt(sf, `${k + 1} · ${hojas[k]?.hoja ?? 'Flex comp PB paralelos'}`, { x: x + 0.08, y, w: w - 0.1, h: 0.36, fontSize: 10.5, bold: true, color: 'FFFFFF', valign: 'middle' });
    txt(sf, m.pregunta, { x: x + 0.08, y: y + 0.42, w: w - 0.16, h: 0.7, fontSize: 9.5, color: TINTA, valign: 'top' });
    if (k < hojas.length) chips(sf, k, x + 0.08, y + h - 0.38, 0.8); else txt(sf, 'pendiente de revisión', { x: x + 0.08, y: y + h - 0.38, w: w - 0.16, h: 0.3, fontSize: 9, italic: true, color: GRIS });
  };
  const flecha = (x1: number, y1: number, x2: number, y2: number, etiqueta: string, ly: number, lx = (x1 + x2) / 2) => {
    sf.addShape('line', { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001, flipV: y2 < y1, line: { color: '5F6B76', width: 1.25, endArrowType: 'triangle' } });
    txt(sf, etiqueta, { x: lx - 1.1, y: ly, w: 2.2, h: 0.45, fontSize: 9, color: GRIS, align: 'center', valign: 'middle' });
  };
  caja(0, 0.4, 3.2); caja(1, 3.15, 3.2); caja(2, 5.9, 1.75); caja(3, 5.9, 4.65); caja(4, 8.65, 1.75); caja(5, 8.65, 4.65); caja(6, 11.0, 3.2, 1.95);
  flecha(2.65, 3.97, 3.15, 3.97, `p neta\n(azotea ${val(0, 'Presión neta', 3)})`, 2.65, 2.9);
  flecha(5.4, 3.6, 5.9, 2.5, 'W y h', 2.75, 5.65);
  flecha(5.4, 4.35, 5.9, 5.4, 'W y h', 4.85, 5.65);
  flecha(8.15, 2.5, 8.65, 2.5, `ΣJ = ${val(2, 'Suma de los J', 2)}`, 1.25, 8.4);
  flecha(8.15, 5.4, 8.65, 5.4, `ΣJ = ${val(3, 'Suma de los J', 2)}`, 6.25, 8.4);
  flecha(10.9, 2.5, 11.0, 3.6, 'M de cada pieza', 2.95, 11.6);
  txt(sf, `Q = ${val(4, 'Corte en la base', 1)} y Mv = ${val(1, 'Momento de vuelco', 0)} de M,NyQ también entran en las dos rototraslaciones`, { x: 3.15, y: 6.35, w: 9.8, h: 0.35, fontSize: 9.5, italic: true, color: GRIS });

  // ---------------------------------------------------------------- resumen
  const sr = nueva(-1, 'Resumen', 'Resultado por hoja', 'Valores comparados entre el cálculo analítico y Excel, y si los controles verifican con cada uno.', true);
  const filas = [[cab('Hoja'), cab('En la app'), cab('Comparados'), cab('Verde'), cab('Amarillo'), cab('Rojo'), cab('Analítico'), cab('Excel')]];
  hojas.forEach((hj, i) => { const r = resumenHoja(hj); filas.push([celda(`${i + 1} · ${hj.hoja}`, { bold: true, color: META[i].color }), celda(META[i].etapa, { fontSize: 10, color: GRIS }), celda(String(r.total), { align: 'right' }), celda(String(r.coinciden), { align: 'right', color: SEM.verde.c, fill: { color: SEM.verde.f } }), celda(String(r.amarillos), { align: 'right', color: r.amarillos ? SEM.amarillo.c : GRIS, fill: r.amarillos ? { color: SEM.amarillo.f } : undefined }), celda(String(r.rojos), { align: 'right', color: r.rojos ? SEM.rojo.c : GRIS, fill: r.rojos ? { color: SEM.rojo.f } : undefined }), verifica(r.verificaAnalitico), verifica(r.verificaExcel)]); });
  filas.push([celda('7 · Flex comp PB paralelos', { bold: true, color: META[6].color }), celda(META[6].etapa, { fontSize: 10, color: GRIS }), celda('pendiente: la matemática se revisa aparte', { colspan: 6, color: GRIS, italic: true })] as never);
  sr.addTable(filas as never, { x: 0.4, y: 1.6, w: 12.5, colW: [3.1, 2.3, 1.15, 1.0, 1.0, 1.0, 1.5, 1.45], border: { type: 'solid', pt: 0.5, color: 'D0D7DE' }, rowH: 0.44 });

  hojas.forEach((hj, i) => {
    const r = resumenHoja(hj), m = META[i];
    // ---- apertura de la hoja: qué pregunta responde, qué recibe y qué entrega, temas, datos y veredicto
    const sa = nueva(i, 'Apertura', `${i + 1} · ${hj.hoja}`, m.pregunta);
    sa.addShape('rect', { x: 0.4, y: 1.6, w: 3.9, h: 0.75, fill: { color: 'F4F6F8' }, line: { color: 'D0D7DE' } });
    txt(sa, [{ text: 'RECIBE\n', options: { fontSize: 8.5, bold: true, color: GRIS, charSpacing: 1 } }, { text: m.recibe, options: { fontSize: 11 } }], { x: 0.55, y: 1.65, w: 3.6, h: 0.65, valign: 'middle' });
    sa.addShape('rightArrow', { x: 4.4, y: 1.82, w: 0.45, h: 0.32, fill: { color: m.color }, line: { color: m.color } });
    sa.addShape('rect', { x: 4.95, y: 1.6, w: 3.4, h: 0.75, fill: { color: m.color }, line: { color: m.color } });
    txt(sa, hj.hoja, { x: 5.05, y: 1.6, w: 3.2, h: 0.75, fontSize: 15, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    sa.addShape('rightArrow', { x: 8.45, y: 1.82, w: 0.45, h: 0.32, fill: { color: m.color }, line: { color: m.color } });
    sa.addShape('rect', { x: 9.0, y: 1.6, w: 3.93, h: 0.75, fill: { color: 'F4F6F8' }, line: { color: 'D0D7DE' } });
    txt(sa, [{ text: 'ENTREGA\n', options: { fontSize: 8.5, bold: true, color: GRIS, charSpacing: 1 } }, { text: m.entrega, options: { fontSize: 11 } }], { x: 9.15, y: 1.65, w: 3.65, h: 0.65, valign: 'middle' });
    txt(sa, 'Temas de la hoja', { x: 0.4, y: 2.6, w: 7.7, h: 0.35, fontSize: 13, bold: true, color: m.color });
    txt(sa, hj.temas.flatMap((t, k) => [{ text: `${k + 1}  ${t.titulo}. `, options: { bold: true } }, { text: `${t.texto} `, options: {} }, { text: `(${t.fuente})`, options: { color: GRIS, fontSize: 10, breakLine: true } }]), { x: 0.4, y: 3.0, w: 7.7, h: 3.75, fontSize: 12.5, valign: 'top', paraSpaceAfter: 6 });
    sa.addShape('rect', { x: 8.45, y: 2.6, w: 4.48, h: 2.45, fill: { color: 'F4F6F8' }, line: { color: 'D0D7DE' } });
    txt(sa, [{ text: 'Datos de la hoja\n', options: { bold: true, fontSize: 12, color: m.color } }, ...hj.datos.map(d => ({ text: `${d.nombre} = ${d.valor}\n`, options: { fontSize: 11 } }))], { x: 8.6, y: 2.7, w: 4.2, h: 2.3, valign: 'top' });
    sa.addShape('rect', { x: 8.45, y: 5.2, w: 4.48, h: 1.55, fill: { color: 'FFFFFF' }, line: { color: m.color, width: 1.25 } });
    txt(sa, 'Analítico contra Excel', { x: 8.6, y: 5.27, w: 4.2, h: 0.3, fontSize: 11, bold: true, color: m.color });
    chips(sa, i, 8.6, 5.65);
    txt(sa, `de ${r.total} valores`, { x: 10.55, y: 5.65, w: 2.2, h: 0.3, fontSize: 10, color: GRIS, valign: 'middle' });
    txt(sa, `controles: analítico ${r.verificaAnalitico ? '✓' : '✗'} · Excel ${r.verificaExcel ? '✓' : '✗'}`, { x: 8.6, y: 6.1, w: 4.2, h: 0.3, fontSize: 10.5, bold: true, color: r.verificaAnalitico && r.verificaExcel ? OK : MAL });
    txt(sa, `orden: paso por paso → dibujos → tablas → controles`, { x: 8.6, y: 6.42, w: 4.2, h: 0.28, fontSize: 9, color: GRIS });
    // ---- paso por paso (6 por diapositiva)
    const tot = Math.ceil(hj.pasos.length / 6);
    for (let k = 0; k < hj.pasos.length; k += 6) {
      const sp = nueva(i, 'Paso por paso', `Paso por paso${tot > 1 ? ` (${k / 6 + 1} de ${tot})` : ''}`, 'Fórmula, la misma fórmula con los números, resultado analítico y resultado de Excel con su celda', true);
      const f = [[cab('#'), cab('Paso'), cab('Fórmula y sustitución'), cab('Analítico'), cab('Excel · celda'), cab('Diferencia')]];
      hj.pasos.slice(k, k + 6).forEach((p, j) => {
        const u = p.unidad ? ` ${p.unidad}` : '';
        f.push([celda(String(k + j + 1), { align: 'center', color: 'FFFFFF', bold: true, fill: { color: m.color } }), celda(p.titulo, { fontSize: 10.5, bold: true }),
          { text: [{ text: p.formula, options: { bold: true, breakLine: true } }, { text: p.sustitucion, options: { color: GRIS, fontSize: 9.5, breakLine: !!p.nota } }, ...(p.nota ? [{ text: p.nota, options: { color: '8A5F00', fontSize: 8.5, italic: true } }] : [])], options: { fontFace: FUENTE, fontSize: 10.5, color: TINTA, valign: 'middle' } } as never,
          celda(`${num(p.analitico, p.dec)}${u}`, { align: 'right', bold: true }),
          { text: [{ text: p.excel === null ? '—' : `${num(p.excel, p.dec)}${u}`, options: { breakLine: true } }, { text: p.celda, options: { color: GRIS, fontSize: 8 } }], options: { fontFace: FUENTE, fontSize: 11, color: TINTA, align: 'right', valign: 'middle' } } as never,
          estadoCelda(p.analitico, p.excel, p.unidad, p.dec)]);
      });
      sp.addTable(f as never, { x: 0.4, y: 1.55, w: 12.53, colW: [0.42, 2.3, 4.85, 1.45, 1.66, 1.85], border: { type: 'solid', pt: 0.5, color: 'D0D7DE' }, autoPage: false });
    }
    // ---- dibujos de la app (dos por diapositiva; los anchos, solos)
    const dib = dibujos[i] ?? [];
    const solo = (d: Dibujo) => d.ancho / d.alto > 1.6 || d.ancho > 900;
    for (let k = 0; k < dib.length;) {
      const a = dib[k];
      const par = solo(a) ? [a] : dib.slice(k, k + 2).filter(d => !solo(d));
      k += par.length || 1;
      const quita = (t: string) => t.replace(/^(Viento|Fuerzas|Estabilidad|Rigidez|Rototraslación|Carta)(\s·\s(viento|paso)\s[AB1-4])*\s·\s/, '').replace(/^\d\s·\s/, '').replace(/^viento [AB] · /, '');
      const sd = nueva(i, 'Dibujos', par.length > 1 ? `${quita(par[0].titulo)} · ${quita(par[1].titulo)}` : quita(par[0].titulo), `Los mismos dibujos de la app (${m.etapa}), con los valores de este proyecto`);
      const cj = { x: 0.4, y: 1.5, w: 12.53, h: 5.3 };
      const wCol = (cj.w - 0.3 * (par.length - 1)) / par.length;
      par.forEach((d, j) => {
        const esc = Math.min(wCol / d.ancho, (cj.h - 0.3) / d.alto);
        const w = d.ancho * esc, hh = d.alto * esc, x = cj.x + j * (wCol + 0.3);
        sd.addShape('rect', { x, y: cj.y, w: wCol, h: cj.h, fill: { color: 'FFFFFF' }, line: { color: 'E1E6EB' } });
        sd.addImage({ data: d.png, x: x + (wCol - w) / 2, y: cj.y + 0.05 + (cj.h - 0.3 - hh) / 2, w, h: hh });
        txt(sd, quita(d.titulo), { x: x + 0.1, y: cj.y + cj.h - 0.28, w: wCol - 0.2, h: 0.24, fontSize: 9, color: GRIS, italic: true });
      });
    }
    // ---- tablas completas (12 filas por diapositiva), con gráfico cuando hay una o dos columnas
    hj.tablas.forEach(tb => {
      const tt = Math.ceil(tb.filas.length / 12);
      for (let k = 0; k < tb.filas.length; k += 12) {
        const sl = nueva(i, 'Tablas', `${tb.titulo}${tt > 1 ? ` (${k / 12 + 1} de ${tt})` : ''}`, 'Cada valor: analítico | Excel | diferencia', true);
        const f = [[cab(''), ...tb.columnas.flatMap(c => [cab(`${c.nombre}${c.unidad ? ` (${c.unidad})` : ''}`), cab('Excel'), cab('Δ')])]];
        tb.filas.slice(k, k + 12).forEach(fl => f.push([celda(fl.etiqueta, { fontSize: 10, bold: true }), ...fl.valores.flatMap(([a, e], c) => {
          const dd = textoDiferencia(a, e, tb.columnas[c].unidad, tb.columnas[c].dec);
          const sm = dd.nivel ? SEM[dd.nivel] : null;
          return [celda(num(a, tb.columnas[c].dec), { align: 'right', fontSize: 10 }), celda(e === null ? '—' : num(e, tb.columnas[c].dec), { align: 'right', fontSize: 10, fill: sm && dd.nivel !== 'verde' ? { color: sm.f } : undefined }), celda(dd.corto, { color: sm ? sm.c : GRIS, bold: true, fontSize: 9, align: 'center', fill: sm && dd.nivel !== 'verde' ? { color: sm.f } : undefined })];
        })]));
        const ancho = tb.columnas.length > 2 ? 12.53 : 8;
        const resto = ancho - 2.6;
        sl.addTable(f as never, { x: 0.4, y: 1.55, w: ancho, colW: [2.6, ...tb.columnas.flatMap(() => [resto / tb.columnas.length * 0.42, resto / tb.columnas.length * 0.42, resto / tb.columnas.length * 0.16])], border: { type: 'solid', pt: 0.5, color: 'D0D7DE' }, rowH: 0.36, autoPage: false });
        if (tb.columnas.length <= 2 && k === 0) {
          const c = tb.columnas.length - 1;
          const etiquetas = tb.filas.map(x => x.etiqueta.split(' · ')[0]);
          sl.addChart('bar', [
            { name: 'analítico', labels: etiquetas, values: tb.filas.map(x => x.valores[c][0]) },
            { name: 'Excel', labels: etiquetas, values: tb.filas.map(x => x.valores[c][1] ?? 0) },
          ], { x: 8.7, y: 1.55, w: 4.23, h: 5.2, barDir: 'bar', chartColors: [m.color, 'B9C5D1'], showLegend: true, legendPos: 'b', catAxisLabelFontSize: 8, valAxisLabelFontSize: 8, catAxisOrientation: 'maxMin', showTitle: true, title: `${tb.columnas[c].nombre} (${tb.columnas[c].unidad})`, titleFontSize: 11 } as never);
        }
      }
    });
    // ---- controles, diferencias y qué pasa a la hoja siguiente
    const sc = nueva(i, 'Controles', 'Controles y conclusión', 'Cada control se verifica con el resultado analítico y con el de Excel');
    const fc = [[cab('Control'), cab('Criterio'), cab('Analítico'), cab(''), cab('Excel'), cab('')]];
    hj.controles.forEach(c => fc.push([celda(c.nombre, { bold: true }), celda(c.criterio + (c.nota ? `\n${c.nota}` : ''), { fontSize: 10 }), celda(`${num(c.analitico, c.dec)} ${c.unidad}`, { align: 'right' }), verifica(c.cumpleAnalitico), celda(c.excel === null ? '—' : `${num(c.excel, c.dec)} ${c.unidad}`, { align: 'right' }), verifica(c.cumpleExcel)]));
    sc.addTable(fc as never, { x: 0.4, y: 1.55, w: 12.53, colW: [2.4, 4.13, 1.6, 1.6, 1.6, 1.2], border: { type: 'solid', pt: 0.5, color: 'D0D7DE' }, autoPage: false });
    const yD = 2.0 + 0.5 * (hj.controles.length + 1);
    const hD = Math.max(0.5, 5.75 - yD);
    if (hj.diferencias.length) {
      sc.addShape('rect', { x: 0.4, y: yD, w: 12.53, h: hD, fill: { color: AMARILLO }, line: { color: 'E8D9B0' } });
      txt(sc, [{ text: 'Por qué difieren\n', options: { bold: true, fontSize: 12.5 } }, ...hj.diferencias.map(x => ({ text: `• ${x}\n`, options: { fontSize: 10.5 } }))], { x: 0.55, y: yD + 0.08, w: 12.2, h: hD - 0.12, valign: 'top' });
    } else {
      sc.addShape('rect', { x: 0.4, y: yD, w: 12.53, h: 0.5, fill: { color: FONDO_OK }, line: { color: 'C9E6CF' } });
      txt(sc, 'Todos los valores coinciden con la planilla.', { x: 0.55, y: yD, w: 12, h: 0.5, fontSize: 13, color: OK, valign: 'middle' });
    }
    sc.addShape('rect', { x: 0.4, y: 5.95, w: 12.53, h: 0.75, fill: { color: m.color }, line: { color: m.color } });
    txt(sc, [{ text: 'PASA A LA HOJA SIGUIENTE   ', options: { bold: true, fontSize: 9.5, charSpacing: 1 } }, { text: m.entrega, options: { fontSize: 13, bold: true } }], { x: 0.6, y: 5.95, w: 12.2, h: 0.75, color: 'FFFFFF', valign: 'middle' });
  });
  // ---------------------------------------------------------------- hoja 7 y cierre
  const s7 = nueva(6, 'Pendiente', '7 · Flex comp PB paralelos', 'Fuera del desglose: la matemática de esta hoja no está terminada y se revisa aparte');
  txt(s7, 'Lo que se sabe hasta ahora', { x: 0.4, y: 1.6, w: 12, h: 0.35, fontSize: 13, bold: true, color: META[6].color });
  txt(s7, PENDIENTE_FLEX.map(x => ({ text: x, options: { bullet: true, breakLine: true } })), { x: 0.4, y: 2.05, w: 12.5, h: 4.6, fontSize: 15, valign: 'top', paraSpaceAfter: 10 });
  const sx = nueva(-1, 'Cierre', 'Conclusiones', 'Qué dice cada hoja y dónde hay que mirar');
  hojas.forEach((hj, i) => {
    const r = resumenHoja(hj), y = 1.6 + i * 0.78;
    sx.addShape('rect', { x: 0.4, y, w: 0.12, h: 0.62, fill: { color: META[i].color }, line: { color: META[i].color } });
    txt(sx, `${i + 1} · ${hj.hoja}`, { x: 0.65, y, w: 3.2, h: 0.32, fontSize: 12, bold: true, color: META[i].color });
    chips(sx, i, 0.65, y + 0.33, 0.8);
    txt(sx, hj.diferencias.length ? hj.diferencias[0].split(':')[0] + (hj.diferencias.length > 1 ? ` (y ${hj.diferencias.length - 1} más)` : '') : 'coincide con la planilla', { x: 3.9, y, w: 7.4, h: 0.62, fontSize: 10.5, color: TINTA, valign: 'middle' });
    txt(sx, r.verificaAnalitico && r.verificaExcel ? '✓ verifica' : '✗ revisar', { x: 11.4, y, w: 1.5, h: 0.62, fontSize: 11, bold: true, color: r.verificaAnalitico && r.verificaExcel ? OK : MAL, align: 'right', valign: 'middle' });
  });
  return { escribir: (nombre: string) => pptx.writeFile({ fileName: nombre }), diapositivas: n };
}

export async function descargarPPTX() {
  const p = estado.proyecto;
  const a = await armarPPTX(desglosar(entradaDesglose()), p.nombre || 'Proyecto', await dibujosPorHoja());
  const nombre = `${(p.nombre || 'proyecto').replace(/[^\wáéíóúñÁÉÍÓÚÑ-]+/g, '_').slice(0, 60)}_desglose.pptx`;
  await a.escribir(nombre);
  return a.diapositivas;
}
