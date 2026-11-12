/**
 * Desglose por hoja de la planilla, en PDF (diálogo de impresión, como el informe) y en PowerPoint (.pptx):
 * los temas de cada hoja y el cálculo analítico paso por paso al lado del resultado de la planilla (Excel),
 * con los controles verificados con los dos. La última hoja (flexocompresión) queda afuera: se revisa aparte.
 */
import { estado } from './estado';
import { AUTOR, AVISO } from '../autoria';
import { h } from './comp';
import { comparar, desglosar, num, resumenHoja, type EntradaDesglose, type HojaDesglose } from '../engine/desglose';

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

const marca = (a: number, e: number | null) => { const r = comparar(a, e); return r === 'coincide' ? '✓ coincide' : r === 'difiere' ? '≠ difiere' : '—'; };
const cumple = (b: boolean | null) => (b === null ? '—' : b ? '✓ verifica' : '✗ no verifica');
const fecha = () => new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

// ------------------------------------------------------------------ PDF (documento para imprimir)
export function armarDesglose(hojas: HojaDesglose[]): HTMLElement {
  const p = estado.proyecto;
  const doc = h('div', { class: 'informe desglose' });
  doc.append(h('header', { class: 'inf-portada' },
    h('div', { class: 'inf-marca' }, `TORRE 3D · Edificios en torre (FAUD-UNMDP) · ${AVISO}`),
    h('h1', {}, 'Desglose analítico de la planilla'),
    h('p', {}, `${p.nombre || 'Proyecto'} · ${fecha()} · hormigón ${p.hormigon || 'H30'} · ${AUTOR}`)));
  const intro = h('section', { class: 'inf-hoja dg-resumen' }, h('h2', {}, 'Cómo leer este desglose'));
  intro.append(h('p', {}, 'Cada hoja del Excel se vuelve a calcular a mano, paso por paso, con las fórmulas del CIRSOC 102 y de la guía de la cátedra. Al lado va el resultado de la planilla (el que da Excel con estos mismos datos) y la celda donde está. «✓ coincide» = la diferencia es menor que 0,5 %; «≠ difiere» = hay una diferencia, y la hoja explica por qué.'));
  intro.append(h('p', {}, 'Cada hoja usa como datos los mismos valores que recibe en la planilla, así cada diferencia aparece en la hoja donde nace. Los controles se verifican con los dos resultados.'));
  const t = h('table', { class: 'dg-tabla' });
  t.append(h('tr', {}, ...['Hoja', 'Valores comparados', 'Coinciden', 'Difieren', 'Analítico', 'Excel'].map(x => h('th', {}, x))));
  hojas.forEach((hj, i) => {
    const r = resumenHoja(hj);
    t.append(h('tr', {}, h('td', {}, `${i + 1} · ${hj.hoja}`), h('td', { class: 'n' }, String(r.total)), h('td', { class: 'n' }, String(r.coinciden)), h('td', { class: 'n' }, String(r.difieren)),
      h('td', {}, cumple(r.verificaAnalitico)), h('td', {}, cumple(r.verificaExcel))));
  });
  t.append(h('tr', {}, h('td', {}, '7 · Flex comp PB paralelos'), h('td', { colspan: '5' }, 'Fuera del desglose: su matemática se revisa aparte (ver la última página).')));
  intro.append(t);
  doc.append(intro);
  hojas.forEach((hj, i) => doc.append(seccionHoja(hj, i + 1)));
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
  s.append(h('p', { class: 'dg-veredicto' }, `${r.coinciden} de ${r.total} valores coinciden · analítico: ${cumple(r.verificaAnalitico)} · Excel: ${cumple(r.verificaExcel)}`));
  s.append(h('h3', {}, 'Temas de la hoja'));
  s.append(h('ul', { class: 'dg-temas' }, ...hj.temas.map(x => h('li', {}, h('b', {}, `${x.titulo}. `), x.texto, h('span', { class: 'dg-fuente' }, ` (${x.fuente})`)))));
  s.append(h('p', { class: 'dg-datos' }, h('b', {}, 'Datos: '), hj.datos.map(x => `${x.nombre} = ${x.valor}`).join(' · ')));
  s.append(h('h3', {}, 'Paso por paso'));
  const t = h('table', { class: 'dg-tabla dg-pasos' });
  t.append(h('tr', {}, ...['#', 'Paso', 'Fórmula y sustitución', 'Analítico', 'Excel', ''].map(x => h('th', {}, x))));
  hj.pasos.forEach((p, i) => {
    const u = p.unidad ? ` ${p.unidad}` : '';
    t.append(h('tr', { class: comparar(p.analitico, p.excel) === 'difiere' ? 'dg-dif' : '' },
      h('td', { class: 'n' }, String(i + 1)), h('td', {}, p.titulo),
      h('td', {}, h('div', { class: 'dg-f' }, p.formula), h('div', { class: 'dg-s' }, p.sustitucion), ...(p.nota ? [h('div', { class: 'dg-nota' }, p.nota)] : [])),
      h('td', { class: 'n' }, `${num(p.analitico, p.dec)}${u}`),
      h('td', { class: 'n' }, p.excel === null ? '—' : `${num(p.excel, p.dec)}${u}`, h('div', { class: 'dg-celda' }, p.celda)),
      h('td', {}, marca(p.analitico, p.excel))));
  });
  s.append(t);
  hj.tablas.forEach(tb => {
    s.append(h('h3', {}, tb.titulo));
    const tt = h('table', { class: 'dg-tabla dg-niveles' });
    tt.append(h('tr', {}, h('th', {}, ''), ...tb.columnas.flatMap(c => [h('th', { class: 'n' }, `${c.nombre}${c.unidad ? ` (${c.unidad})` : ''} analítico`), h('th', { class: 'n' }, 'Excel'), h('th', {}, '')])));
    tb.filas.forEach(f => tt.append(h('tr', {}, h('td', {}, f.etiqueta), ...f.valores.flatMap(([a, e], k) => [h('td', { class: 'n' }, num(a, tb.columnas[k].dec)), h('td', { class: 'n' }, e === null ? '—' : num(e, tb.columnas[k].dec)), h('td', {}, comparar(a, e) === 'coincide' ? '✓' : comparar(a, e) === 'difiere' ? '≠' : '')]))));
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

export function imprimirDesglose() {
  document.querySelector('.informe')?.remove();
  const raiz = document.documentElement, temaAntes = raiz.getAttribute('data-theme');
  raiz.setAttribute('data-theme', 'light');
  const doc = armarDesglose(desglosar(entradaDesglose()));
  document.body.append(doc);
  document.body.classList.add('imprimiendo');
  const fin = () => {
    document.body.classList.remove('imprimiendo'); doc.remove(); window.removeEventListener('afterprint', fin);
    if (temaAntes === null) raiz.removeAttribute('data-theme'); else raiz.setAttribute('data-theme', temaAntes);
  };
  window.addEventListener('afterprint', fin);
  setTimeout(() => window.print(), 60);
}

// ------------------------------------------------------------------ PowerPoint
const AZUL = '1A6BBD', TINTA = '1F2328', GRIS = '5F6B76', OK = '1A7A3A', MAL = 'C62828', AMARILLO = 'FBF1DC', FONDO_OK = 'EAF6EC';
const FUENTE = 'Calibri';

/** arma el .pptx (pptxgenjs se carga recién al usarlo) y devuelve el archivo */
export async function armarPPTX(hojas: HojaDesglose[], nombreProyecto: string): Promise<{ escribir: (nombre: string) => Promise<unknown>; diapositivas: number }> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';                                   // 13,33 × 7,5 in
  pptx.author = AUTOR; pptx.title = `Desglose analítico · ${nombreProyecto}`;
  let n = 0;
  const nueva = (titulo: string, sub = '') => {
    const s = pptx.addSlide(); n++;
    s.background = { color: 'FFFFFF' };
    s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: AZUL } });
    s.addText(titulo, { x: 0.5, y: 0.3, w: 12.3, h: 0.6, fontFace: FUENTE, fontSize: 26, bold: true, color: TINTA });
    if (sub) s.addText(sub, { x: 0.5, y: 0.88, w: 12.3, h: 0.4, fontFace: FUENTE, fontSize: 14, color: GRIS });
    s.addText(`Torre 3D · ${nombreProyecto} · ${n}`, { x: 0.5, y: 7.05, w: 12.3, h: 0.3, fontFace: FUENTE, fontSize: 10, color: GRIS, align: 'right' });
    return s;
  };
  const celda = (t: string, o: Record<string, unknown> = {}) => ({ text: t, options: { fontFace: FUENTE, fontSize: 12, color: TINTA, valign: 'middle', ...o } });
  const cab = (t: string) => celda(t, { bold: true, fill: { color: 'EEF2F6' }, color: GRIS, fontSize: 11 });
  const estadoCelda = (a: number, e: number | null) => { const r = comparar(a, e); return celda(r === 'coincide' ? '✓ coincide' : r === 'difiere' ? '≠ difiere' : '—', { color: r === 'coincide' ? OK : r === 'difiere' ? MAL : GRIS, bold: true }); };
  const verifica = (b: boolean | null) => celda(b === null ? '—' : b ? '✓ verifica' : '✗ no verifica', { color: b === null ? GRIS : b ? OK : MAL, bold: true });

  // portada
  const s0 = pptx.addSlide(); n++;
  s0.background = { color: '14202B' };
  s0.addText('Desglose analítico de la planilla', { x: 0.7, y: 2.3, w: 12, h: 1, fontFace: FUENTE, fontSize: 40, bold: true, color: 'FFFFFF' });
  s0.addText(`${nombreProyecto} · Edificios en torre · FAUD-UNMDP`, { x: 0.7, y: 3.3, w: 12, h: 0.6, fontFace: FUENTE, fontSize: 20, color: '9AA8B6' });
  s0.addText(`Cada hoja del Excel calculada a mano, paso por paso, y comparada con el resultado de la planilla.\n${fecha()} · ${AUTOR}`, { x: 0.7, y: 4.3, w: 12, h: 1, fontFace: FUENTE, fontSize: 16, color: 'DCE4EC' });
  // resumen
  const sr = nueva('Resumen por hoja', '✓ coincide = diferencia menor que 0,5 % · los controles se verifican con los dos resultados');
  const filas = [[cab('Hoja'), cab('Comparados'), cab('Coinciden'), cab('Difieren'), cab('Analítico'), cab('Excel')]];
  hojas.forEach((hj, i) => { const r = resumenHoja(hj); filas.push([celda(`${i + 1} · ${hj.hoja}`), celda(String(r.total), { align: 'right' }), celda(String(r.coinciden), { align: 'right', color: OK }), celda(String(r.difieren), { align: 'right', color: r.difieren ? MAL : GRIS }), verifica(r.verificaAnalitico), verifica(r.verificaExcel)]); });
  filas.push([celda('7 · Flex comp PB paralelos'), celda('pendiente: la matemática se revisa aparte', { colspan: 5, color: GRIS, italic: true })] as never);
  sr.addTable(filas as never, { x: 0.5, y: 1.5, w: 12.3, colW: [4.3, 1.4, 1.4, 1.4, 1.9, 1.9], border: { type: 'solid', pt: 0.5, color: 'D0D7DE' }, rowH: 0.45 });

  hojas.forEach((hj, i) => {
    const r = resumenHoja(hj);
    // temas
    const st = nueva(`${i + 1} · Hoja «${hj.hoja}»`, `${r.coinciden} de ${r.total} valores coinciden · analítico ${r.verificaAnalitico ? 'verifica' : 'no verifica'} · Excel ${r.verificaExcel ? 'verifica' : 'no verifica'}`);
    st.addText(hj.temas.map(t => ({ text: `${t.titulo}: `, options: { bold: true, breakLine: false } as never })).flatMap((x, k) => [x, { text: `${hj.temas[k].texto}  `, options: {} }, { text: `(${hj.temas[k].fuente})`, options: { color: GRIS, fontSize: 12, breakLine: true } }]) as never,
      { x: 0.5, y: 1.45, w: 7.6, h: 5.3, fontFace: FUENTE, fontSize: 15, color: TINTA, valign: 'top', paraSpaceAfter: 8, bullet: false });
    st.addShape('rect', { x: 8.4, y: 1.45, w: 4.4, h: 5.3, fill: { color: 'F4F6F8' }, line: { color: 'D0D7DE' } });
    st.addText([{ text: 'Datos\n', options: { bold: true, fontSize: 15 } }, ...hj.datos.map(d => ({ text: `${d.nombre} = ${d.valor}\n`, options: { fontSize: 13 } }))] as never,
      { x: 8.6, y: 1.6, w: 4.0, h: 5.0, fontFace: FUENTE, color: TINTA, valign: 'top' });
    // pasos (6 por diapositiva)
    for (let k = 0; k < hj.pasos.length; k += 6) {
      const sp = nueva(`${i + 1} · ${hj.hoja}: paso por paso${hj.pasos.length > 6 ? ` (${k / 6 + 1}/${Math.ceil(hj.pasos.length / 6)})` : ''}`, 'Fórmula, sustitución con los números, resultado analítico y resultado de la planilla');
      const f = [[cab('#'), cab('Paso'), cab('Fórmula y sustitución'), cab('Analítico'), cab('Excel'), cab('')]];
      hj.pasos.slice(k, k + 6).forEach((p, j) => {
        const u = p.unidad ? ` ${p.unidad}` : '';
        f.push([celda(String(k + j + 1), { align: 'right', color: GRIS }), celda(p.titulo, { fontSize: 11 }),
          { text: [{ text: p.formula, options: { bold: true, breakLine: true } }, { text: p.sustitucion, options: { color: GRIS, fontSize: 10, breakLine: !!p.nota } }, ...(p.nota ? [{ text: p.nota, options: { color: '8A5F00', fontSize: 9, italic: true } }] : [])], options: { fontFace: FUENTE, fontSize: 11, color: TINTA, valign: 'middle' } } as never,
          celda(`${num(p.analitico, p.dec)}${u}`, { align: 'right' }),
          { text: [{ text: p.excel === null ? '—' : `${num(p.excel, p.dec)}${u}`, options: { breakLine: true } }, { text: p.celda, options: { color: GRIS, fontSize: 8 } }], options: { fontFace: FUENTE, fontSize: 12, color: TINTA, align: 'right', valign: 'middle' } } as never,
          estadoCelda(p.analitico, p.excel)]);
      });
      sp.addTable(f as never, { x: 0.4, y: 1.4, w: 12.5, colW: [0.45, 2.6, 5.2, 1.5, 1.6, 1.15], border: { type: 'solid', pt: 0.5, color: 'D0D7DE' }, autoPage: false });
    }
    // tablas por nivel / pieza (12 filas por diapositiva), con gráfico en viento y M,NyQ
    hj.tablas.forEach(tb => {
      for (let k = 0; k < tb.filas.length; k += 12) {
        const sl = nueva(`${i + 1} · ${hj.hoja}: ${tb.titulo.charAt(0).toLowerCase() + tb.titulo.slice(1)}${tb.filas.length > 12 ? ` (${k / 12 + 1}/${Math.ceil(tb.filas.length / 12)})` : ''}`, 'Analítico | Excel | ✓ coincide · ≠ difiere');
        const f = [[cab(''), ...tb.columnas.flatMap(c => [cab(`${c.nombre}${c.unidad ? ` (${c.unidad})` : ''}`), cab('Excel'), cab('')])]];
        tb.filas.slice(k, k + 12).forEach(fl => f.push([celda(fl.etiqueta, { fontSize: 10 }), ...fl.valores.flatMap(([a, e], c) => {
          const rr = comparar(a, e);
          return [celda(num(a, tb.columnas[c].dec), { align: 'right', fontSize: 10 }), celda(e === null ? '—' : num(e, tb.columnas[c].dec), { align: 'right', fontSize: 10, fill: rr === 'difiere' ? { color: AMARILLO } : undefined }), celda(rr === 'coincide' ? '✓' : rr === 'difiere' ? '≠' : '', { color: rr === 'coincide' ? OK : MAL, bold: true, fontSize: 10, align: 'center' })];
        })]));
        const ancho = tb.columnas.length > 2 ? 12.5 : 8;
        const resto = ancho - 2.6;
        sl.addTable(f as never, { x: 0.4, y: 1.4, w: ancho, colW: [2.6, ...tb.columnas.flatMap(() => [resto / tb.columnas.length * 0.42, resto / tb.columnas.length * 0.42, resto / tb.columnas.length * 0.16])], border: { type: 'solid', pt: 0.5, color: 'D0D7DE' }, rowH: 0.36, autoPage: false });
        if (tb.columnas.length <= 2 && k === 0) {
          const c = tb.columnas.length - 1;
          const etiquetas = tb.filas.map(x => x.etiqueta.split(' · ')[0]);
          sl.addChart('bar', [
            { name: 'analítico', labels: etiquetas, values: tb.filas.map(x => x.valores[c][0]) },
            { name: 'Excel', labels: etiquetas, values: tb.filas.map(x => x.valores[c][1] ?? 0) },
          ], { x: 8.7, y: 1.4, w: 4.3, h: 5.4, barDir: 'bar', chartColors: ['1A6BBD', 'EB6834'], showLegend: true, legendPos: 'b', catAxisLabelFontSize: 8, valAxisLabelFontSize: 8, catAxisOrientation: 'maxMin', showTitle: true, title: `${tb.columnas[c].nombre} (${tb.columnas[c].unidad})`, titleFontSize: 11 } as never);
        }
      }
    });
    // controles y diferencias
    const sc = nueva(`${i + 1} · ${hj.hoja}: controles`, 'Cada control se verifica con el resultado analítico y con el de la planilla');
    const fc = [[cab('Control'), cab('Criterio'), cab('Analítico'), cab(''), cab('Excel'), cab('')]];
    hj.controles.forEach(c => fc.push([celda(c.nombre), celda(c.criterio + (c.nota ? `\n${c.nota}` : ''), { fontSize: 10 }), celda(`${num(c.analitico, c.dec)} ${c.unidad}`, { align: 'right' }), verifica(c.cumpleAnalitico), celda(c.excel === null ? '—' : `${num(c.excel, c.dec)} ${c.unidad}`, { align: 'right' }), verifica(c.cumpleExcel)]));
    sc.addTable(fc as never, { x: 0.4, y: 1.4, w: 12.5, colW: [2.4, 4.1, 1.6, 1.6, 1.6, 1.2], border: { type: 'solid', pt: 0.5, color: 'D0D7DE' }, autoPage: false });
    const yD = 1.9 + 0.5 * (hj.controles.length + 1);
    if (hj.diferencias.length) {
      sc.addShape('rect', { x: 0.4, y: yD, w: 12.5, h: Math.min(6.9 - yD, 0.5 + 0.55 * hj.diferencias.length), fill: { color: AMARILLO }, line: { color: 'E8D9B0' } });
      sc.addText([{ text: 'Por qué difieren\n', options: { bold: true } }, ...hj.diferencias.map(x => ({ text: `• ${x}\n`, options: { fontSize: 12 } }))] as never,
        { x: 0.6, y: yD + 0.05, w: 12.1, h: Math.min(6.8 - yD, 0.45 + 0.55 * hj.diferencias.length), fontFace: FUENTE, fontSize: 14, color: TINTA, valign: 'top' });
    } else sc.addShape('rect', { x: 0.4, y: yD, w: 12.5, h: 0.5, fill: { color: FONDO_OK }, line: { color: 'C9E6CF' } }), sc.addText('Todos los valores coinciden con la planilla.', { x: 0.6, y: yD, w: 12, h: 0.5, fontFace: FUENTE, fontSize: 14, color: OK });
  });
  const s7 = nueva('7 · Flex comp PB paralelos — pendiente', 'Fuera del desglose: la matemática de esta hoja se revisa aparte');
  s7.addText(PENDIENTE_FLEX.map(x => ({ text: x, options: { bullet: true, breakLine: true } })) as never, { x: 0.6, y: 1.5, w: 12, h: 5, fontFace: FUENTE, fontSize: 16, color: TINTA, valign: 'top', paraSpaceAfter: 10 });
  return { escribir: (nombre: string) => pptx.writeFile({ fileName: nombre }), diapositivas: n };
}

export async function descargarPPTX() {
  const p = estado.proyecto;
  const a = await armarPPTX(desglosar(entradaDesglose()), p.nombre || 'Proyecto');
  const nombre = `${(p.nombre || 'proyecto').replace(/[^\wáéíóúñÁÉÍÓÚÑ-]+/g, '_').slice(0, 60)}_desglose.pptx`;
  await a.escribir(nombre);
  return a.diapositivas;
}
