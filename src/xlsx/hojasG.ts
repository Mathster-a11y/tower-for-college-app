/**
 * Hojas «G ·» de la planilla: los motores de la app escritos con fórmulas vivas (leen las hojas originales y las
 * tablas «T3D …»; no escriben en ninguna hoja original), con gráficos que se actualizan con los datos, la carta de la
 * torre y los dibujos de la app. Van intercaladas al lado de la hoja con la que trabajan.
 *
 * Las 7 hojas originales no se tocan: solo se agregan hojas, estilos (al final de styles.xml) y gráficos.
 */
import type JSZip from 'jszip';
import type { Proyecto } from '../engine/modelo';
import { T } from './proyectoTablas';

export interface ImagenG { titulo: string; png: Uint8Array; ancho: number; alto: number }
export interface OpcionesG {
  /** filas de «M,NyQ» (0 = fila 4) que ocupa cada nivel, de arriba abajo (aPlanilla().filaNivel) */
  filaNivel: number[];
  /** nombre de la pieza de cada fila de la hoja J (0 = fila 4), viento A y B */
  piezasA: (string | null)[]; piezasB: (string | null)[];
  /** muros perpendiculares de la rototraslación de la guía que no son tabiques simples (tubos, perfiles): valores de la app */
  perpendiculares?: { A: PerpApp[]; B: PerpApp[] };
  /** perfiles irregulares y áreas de influencia (valores de la app) */
  perfiles?: (string | number | null)[][];
  areas?: (string | number | null)[][];
  /** carta de la torre y dibujos de la app (PNG) */
  imagenes?: ImagenG[];
}
export interface PerpApp { nombre: string; pos: number; J: number; muro?: string }

const N_MUROS = 200, N_NIV = 60, N_PIEZAS = 80;
const M = `'${T.muros}'`, NV = `'${T.niveles}'`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const col = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const colN = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const ref = (hoja: string, c: string, r0: number, r1: number) => `'${hoja}'!$${c}$${r0}:$${c}$${r1}`;

// ------------------------------------------------------------------ estilos (se agregan al final; los existentes no cambian)
type Estilo = 'h' | 'sub' | 'tit' | 'nota' | 't' | 'n3' | 'n4' | 'pc' | 'r3' | 'r4' | 'txt';
function agregarEstilos(st: string): { st: string; S: Record<Estilo, number> } {
  const agregar = (tag: string, xml: string): number => {
    const m = new RegExp(`<${tag} count="(\\d+)"`).exec(st);
    if (!m) {
      // la sección no existe (numFmts en libros simples): se crea al principio
      st = st.replace(/(<styleSheet[^>]*>)/, `$1<${tag} count="1">${xml}</${tag}>`);
      return tag === 'numFmts' ? -1 : 0;
    }
    const n = +m[1];
    const i = st.indexOf(`</${tag}>`, m.index);
    st = st.slice(0, i) + xml + st.slice(i);
    st = st.slice(0, m.index) + `<${tag} count="${n + 1}"` + st.slice(m.index + m[0].length);
    return n;
  };
  const fmt = (code: string) => {
    const ids = [...st.matchAll(/numFmtId="(\d+)"/g)].map(x => +x[1]);
    const id = Math.max(199, ...ids) + 1;
    agregar('numFmts', `<numFmt numFmtId="${id}" formatCode="${esc(code)}"/>`);
    return id;
  };
  const fBold = agregar('fonts', '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>');
  const fTit = agregar('fonts', '<font><b/><sz val="14"/><color rgb="FF1F4E79"/><name val="Arial"/><family val="2"/></font>');
  const fNota = agregar('fonts', '<font><i/><sz val="9"/><color rgb="FF595959"/><name val="Arial"/><family val="2"/></font>');
  const fNorm = agregar('fonts', '<font><sz val="10"/><color rgb="FF000000"/><name val="Arial"/><family val="2"/></font>');
  const fB2 = agregar('fonts', '<font><b/><sz val="10"/><color rgb="FF000000"/><name val="Arial"/><family val="2"/></font>');
  const fillH = agregar('fills', '<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill>');
  const fillS = agregar('fills', '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>');
  const fillR = agregar('fills', '<fill><patternFill patternType="solid"><fgColor rgb="FFE2EFDA"/><bgColor indexed="64"/></patternFill></fill>');
  const bord = agregar('borders', '<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>');
  const n3 = fmt('0.000'), n4 = fmt('0.0000'), pc = fmt('0.0%');
  const xf = (font: number, fill = 0, border = 0, num = 0, wrap = false) => agregar('cellXfs', `<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"${wrap ? ' wrapText="1"' : ''}/></xf>`);
  const S: Record<Estilo, number> = {
    h: xf(fBold, fillH, bord, 0, true), sub: xf(fB2, fillS, bord), tit: xf(fTit), nota: xf(fNota), t: xf(fNorm, 0, bord),
    n3: xf(fNorm, 0, bord, n3), n4: xf(fNorm, 0, bord, n4), pc: xf(fNorm, 0, bord, pc), r3: xf(fB2, fillR, bord, n3), r4: xf(fB2, fillR, bord, n4), txt: xf(fNorm),
  };
  return { st, S };
}

// ------------------------------------------------------------------ hojas y gráficos
type ValorG = string | number | null;
interface Grafico { tipo: 'dispersion' | 'barras'; titulo: string; ejeX: string; ejeY: string; series: { nombre: string; x: string; y: string; color: string; sinMarcas?: boolean; ancho?: number }[]; desde: [number, number]; hasta: [number, number]; invertirY?: boolean }
interface Imagen { png: Uint8Array; col: number; fila: number; ancho: number; alto: number }
class Hoja {
  celdas = new Map<string, [ValorG, Estilo]>();
  graficos: Grafico[] = [];
  imagenes: Imagen[] = [];
  constructor(readonly nombre: string, readonly anchos: number[]) {}
  p(r: string, v: ValorG, e: Estilo = 't') { this.celdas.set(r, [v, e]); }
  xml(S: Record<Estilo, number>, conDibujo: boolean): string {
    const filas = new Map<number, [string, ValorG, Estilo][]>();
    for (const [r, [v, e]] of this.celdas) { const m = /^([A-Z]+)(\d+)$/.exec(r)!; const f = +m[2]; if (!filas.has(f)) filas.set(f, []); filas.get(f)!.push([r, v, e]); }
    const out = [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="13.5"/><cols>`];
    this.anchos.forEach((w, i) => out.push(`<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`));
    out.push('</cols><sheetData>');
    for (const f of [...filas.keys()].sort((a, b) => a - b)) {
      out.push(`<row r="${f}">`);
      for (const [r, v, e] of filas.get(f)!.sort((a, b) => colN(/^[A-Z]+/.exec(a[0])![0]) - colN(/^[A-Z]+/.exec(b[0])![0]))) {
        const s = S[e];
        if (v === null || v === '') out.push(`<c r="${r}" s="${s}"/>`);
        else if (typeof v === 'number') out.push(isFinite(v) ? `<c r="${r}" s="${s}"><v>${v}</v></c>` : `<c r="${r}" s="${s}"/>`);
        else if (v.startsWith('=')) out.push(`<c r="${r}" s="${s}"><f>${esc(v.slice(1))}</f></c>`);
        else out.push(`<c r="${r}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
      }
      out.push('</row>');
    }
    out.push('</sheetData><pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>');
    if (conDibujo) out.push('<drawing r:id="rIdDibujoG"/>');
    out.push('</worksheet>');
    return out.join('');
  }
}

const A_ = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const txPr = (sz = 900) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}"><a:solidFill><a:srgbClr val="1F2328"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:pPr><a:endParaRPr lang="es-AR"/></a:p></c:txPr>`;
const tituloXml = (t: string, sz = 1100) => `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="1"/></a:pPr><a:r><a:rPr lang="es-AR" sz="${sz}" b="1"><a:solidFill><a:srgbClr val="1F2328"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${esc(t)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
const ejeXml = (id: number, cruza: number, pos: 'b' | 'l', titulo: string, extra = '') =>
  `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${pos}"/>${pos === 'l' || extra.includes('grid') ? '<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E1E5EA"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' : ''}${tituloXml(titulo, 900)}<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="8A949E"/></a:solidFill></a:ln></c:spPr>${txPr()}<c:crossAx val="${cruza}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`;
function graficoXml(g: Grafico): string {
  const cab = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ${A_} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>${tituloXml(g.titulo)}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>`;
  const pie = `</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/>${txPr()}</c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="C3CAD1"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`;
  if (g.tipo === 'barras') {
    const series = g.series.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.nombre)}</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/><c:cat><c:strRef><c:f>${esc(s.x)}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${esc(s.y)}</c:f></c:numRef></c:val></c:ser>`).join('');
    return cab + `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="60"/><c:axId val="10"/><c:axId val="20"/></c:barChart>`
      + `<c:catAx><c:axId val="10"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>${tituloXml(g.ejeX, 900)}<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>${txPr(800)}<c:crossAx val="20"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
      + ejeXml(20, 10, 'l', g.ejeY).replace('<c:crossBetween val="midCat"/>', '<c:crossBetween val="between"/>') + pie;
  }
  const series = g.series.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.nombre)}</c:v></c:tx><c:spPr><a:ln w="${s.ancho ?? 25400}" cap="rnd"><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:round/></a:ln></c:spPr>`
    + (s.sinMarcas ? '<c:marker><c:symbol val="none"/></c:marker>' : `<c:marker><c:symbol val="circle"/><c:size val="4"/><c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker>`)
    + `<c:xVal><c:numRef><c:f>${esc(s.x)}</c:f></c:numRef></c:xVal><c:yVal><c:numRef><c:f>${esc(s.y)}</c:f></c:numRef></c:yVal><c:smooth val="0"/></c:ser>`).join('');
  return cab + `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${series}<c:axId val="10"/><c:axId val="20"/></c:scatterChart>` + ejeXml(10, 20, 'b', g.ejeX, 'grid') + ejeXml(20, 10, 'l', g.ejeY) + pie;
}

// ------------------------------------------------------------------ las hojas
function armarHojas(p: Proyecto, o: OpcionesG): Hoja[] {
  const hojas: Hoja[] = [];
  const nivRows = o.filaNivel.map(k => 4 + k);                 // filas de «M,NyQ» (y de «viento» + 1)
  const n = nivRows.length;

  // --- Léame
  const le = new Hoja('Léame', [120]);
  [
    'Torre 3D · planilla «Edificios en torre» con los motores de la app', '',
    'Las 7 hojas originales (viento, M,NyQ, J Tabiques paralelos, J Tabiques ortogonales, Rototrasl. cara mayor, Rototrasl. cara menor, Flex comp PB paralelos) no se cambiaron: la app solo escribe en sus celdas de datos, como siempre.',
    'Las hojas nuevas empiezan con «G ·» y están al lado de la hoja con la que trabajan. Leen las hojas originales y las tablas «T3D …»; no escriben en ninguna hoja original. Los gráficos se actualizan solos con los datos.', '',
    'G · Viento corregido: Kz con z′ = máx(z; 5 m) (CIRSOC 102, Tabla 5, nota 2) y la presión neta que resulta, al lado de la de la planilla.',
    'G · Carta de la torre: Wi, Q, M y N de cada nivel (de «M,NyQ»), en gráficos con la altura de la torre, y la carta de la app.',
    'G · Sección real: área, baricentro y J de cada pieza con todos sus muros y su Steiner (lo que la hoja J aproxima con el molde).',
    'G · Rotación muro por muro: eje de inercia, e, Mt y Σ J·a² con las piezas y los muros perpendiculares (criterio de la guía).',
    'G · Peso por muro: peso propio y losas que bajan por cada muro en PB.',
    'G · Planta: los muros de «T3D Muros» dibujados (se actualiza al cambiar la tabla).',
    'G · Perfiles y áreas (app): perfiles irregulares y áreas de influencia, calculados por la app.',
    'G · Dibujos de la app: la carta de la torre y los dibujos de cada etapa, como imágenes.',
    'T3D …: la torre completa (proyecto, niveles, muros, contornos, grupos, losa, caminos, cotas y guías). Con estas hojas la app vuelve a armar la torre; se pueden editar.',
    'Dibujos explicativos de las hojas originales (viento, M,NyQ y las hojas J): rediseñados como tarjetas con «paso a paso». Son imágenes puestas sobre la hoja; los dibujos originales siguen en el archivo, ocultos (Excel: Inicio → Buscar y seleccionar → Panel de selección).', '',
    'Google Sheets: subí este archivo a Drive y abrilo con Google Sheets. Las fórmulas y los gráficos siguen andando.',
  ].forEach((t, i) => le.p(`A${i + 1}`, t, i === 0 ? 'tit' : 'txt'));
  hojas.push(le);

  // --- G · Viento corregido
  const vc = new Hoja('G · Viento corregido', [10, 9, 9, 10, 11, 12, 12, 13, 13, 9]);
  vc.p('A1', 'Viento con Kz de 5 m por debajo de 5 m (CIRSOC 102, Tabla 5, nota 2)', 'tit');
  vc.p('A2', 'Lee la hoja «viento» sin cambiarla. qz en N/m²; presión neta en t/m², como la columna S de «viento».', 'nota');
  ['Nivel', 'z (m)', 'z′ (m)', 'Kz planilla', 'Kz corregido', 'qz corregido', 'qh corregido', 'p neta corregida', 'p neta planilla', 'Δ'].forEach((t, j) => vc.p(`${col(j + 1)}4`, t, 'h'));
  const r0v = 5, r1v = r0v + n - 1;
  nivRows.forEach((fm, i) => {
    const r = r0v + i, fv = fm + 1, v = (c: string) => `viento!${c}${fv}`;
    vc.p(`A${r}`, `=${v('A')}&""`);
    vc.p(`B${r}`, `=${v('B')}`, 'n3');
    vc.p(`C${r}`, `=IF(B${r}>0,MAX(B${r},5),B${r})`, 'n3');
    vc.p(`D${r}`, `=${v('H')}`, 'n4');
    vc.p(`E${r}`, `=IFERROR(2.01*POWER(C${r}/${v('F')},2/${v('G')}),0)`, 'r4');
    vc.p(`F${r}`, `=0.613*${v('I')}*${v('D')}*POWER(${v('C')},2)*${v('E')}*E${r}`, 'n3');
    vc.p(`G${r}`, `=MAX($F$${r0v}:$F$${r1v})`, 'n3');
    vc.p(`H${r}`, `=(F${r}*${v('J')}*${v('K')}-G${r}*${v('J')}*${v('L')})/10000`, 'r4');
    vc.p(`I${r}`, `=${v('S')}`, 'n4');
    vc.p(`J${r}`, `=IF(OR(I${r}="",I${r}=0),"",H${r}/I${r}-1)`, 'pc');
  });
  const VC = vc.nombre;
  vc.graficos.push({ tipo: 'dispersion', titulo: 'Kz según la altura', ejeX: 'Kz', ejeY: 'z (m)', desde: [11, 3], hasta: [18, 24], series: [
    { nombre: 'planilla', x: ref(VC, 'D', r0v, r1v), y: ref(VC, 'B', r0v, r1v), color: '9AA3AD' },
    { nombre: 'corregido (z ≥ 5 m)', x: ref(VC, 'E', r0v, r1v), y: ref(VC, 'B', r0v, r1v), color: '1A6BBD' }] });
  vc.graficos.push({ tipo: 'dispersion', titulo: 'Presión neta de diseño (t/m²)', ejeX: 'p (t/m²)', ejeY: 'z (m)', desde: [11, 25], hasta: [18, 46], series: [
    { nombre: 'planilla', x: ref(VC, 'I', r0v, r1v), y: ref(VC, 'B', r0v, r1v), color: '9AA3AD' },
    { nombre: 'corregida', x: ref(VC, 'H', r0v, r1v), y: ref(VC, 'B', r0v, r1v), color: 'B8401A' }] });
  hojas.push(vc);

  // --- G · Carta de la torre (de «M,NyQ»)
  const ca = new Hoja('G · Carta de la torre', [12, 9, 10, 10, 11, 10, 10, 11, 10]);
  ca.p('A1', 'Carta de la torre: Wi, Q, M y N de cada nivel', 'tit');
  ca.p('A2', 'Lee «M,NyQ» (columnas B, H, I, J, M, N y O). Los gráficos usan la altura de la torre en el eje vertical, como la carta de la app.', 'nota');
  ['Nivel', 'z (m)', 'Wi A (t)', 'Q A (t)', 'M A (tm)', 'Wi B (t)', 'Q B (t)', 'M B (tm)', 'N (t)'].forEach((t, j) => ca.p(`${col(j + 1)}4`, t, 'h'));
  const r0c = 5, r1c = r0c + n - 1;
  nivRows.forEach((fm, i) => {
    const r = r0c + i, m = (c: string, f = fm) => `'M,NyQ'!${c}${f}`;
    ca.p(`A${r}`, `=${m('A')}&""`); ca.p(`B${r}`, `=${m('B')}`, 'n3');
    ca.p(`C${r}`, `=${m('H')}`, 'n3'); ca.p(`D${r}`, `=${m('I')}`, 'n3'); ca.p(`E${r}`, `=${m('J')}`, 'r3');
    // Wi del viento B: lo que suma Q en la cara b (columna N) entre este nivel y el de arriba
    ca.p(`F${r}`, `=${m('D')}*${m('F')}*${m('G')}`, 'n3'); ca.p(`G${r}`, `=${m('N')}`, 'n3'); ca.p(`H${r}`, `=${m('O')}`, 'r3');
    ca.p(`I${r}`, `=${m('M')}`, 'n3');
  });
  const CA = ca.nombre;
  const zc = ref(CA, 'B', r0c, r1c);
  ca.graficos.push({ tipo: 'dispersion', titulo: 'Wi · viento en cada piso (t)', ejeX: 't', ejeY: 'z (m)', desde: [10, 3], hasta: [15, 30], series: [{ nombre: 'viento A', x: ref(CA, 'C', r0c, r1c), y: zc, color: 'B8401A' }, { nombre: 'viento B', x: ref(CA, 'F', r0c, r1c), y: zc, color: '1A6BBD' }] });
  ca.graficos.push({ tipo: 'dispersion', titulo: 'Q · corte (t)', ejeX: 't', ejeY: 'z (m)', desde: [15, 3], hasta: [20, 30], series: [{ nombre: 'viento A', x: ref(CA, 'D', r0c, r1c), y: zc, color: 'B8401A' }, { nombre: 'viento B', x: ref(CA, 'G', r0c, r1c), y: zc, color: '1A6BBD' }] });
  ca.graficos.push({ tipo: 'dispersion', titulo: 'M · momento volcador (tm)', ejeX: 'tm', ejeY: 'z (m)', desde: [20, 3], hasta: [25, 30], series: [{ nombre: 'viento A', x: ref(CA, 'E', r0c, r1c), y: zc, color: 'B8401A' }, { nombre: 'viento B', x: ref(CA, 'H', r0c, r1c), y: zc, color: '1A6BBD' }] });
  ca.graficos.push({ tipo: 'dispersion', titulo: 'N · peso acumulado (t)', ejeX: 't', ejeY: 'z (m)', desde: [25, 3], hasta: [30, 30], series: [{ nombre: 'N', x: ref(CA, 'I', r0c, r1c), y: zc, color: '6A3D9A' }] });
  hojas.push(ca);

  // --- G · Sección real (de «T3D Muros»)
  const sr = new Hoja('G · Sección real', [8, 5, 7, 7, 7, 8, 9, 9, 7, 7, 5, 8, 8, 5, 5, 9, 9, 10, 10, 2, 2, 2, 9, 8, 8, 8, 10, 2, 9, 8, 8, 8, 10]);
  const SR = sr.nombre;
  const zF = p.niveles[p.niveles.length - 1]?.cota ?? 0, zT = p.niveles[0]?.cota ?? 0;
  const entranG = p.muros.filter(m => m.llega && (m.zDesde ?? zF) <= zF + 1e-6 && (m.zHasta ?? zT) > 1e-6 && m.tipo !== 'perfil');
  const nPzA = Math.max(1, Math.min(N_PIEZAS, new Set(entranG.map(m => m.piezaA).filter(Boolean)).size));
  const nPzB = Math.max(1, Math.min(N_PIEZAS, new Set(entranG.map(m => m.piezaB).filter(Boolean)).size));
  sr.p('A1', 'Sección real de cada pieza: área, baricentro y J con Steiner de todos sus muros', 'tit');
  sr.p('A2', `Lee «${T.muros}». Tabique: largo × espesor según Dir.; tubo rect.: caja con pared; tubo circ.: corona. Solo los muros que llegan a la fundación (los perfiles irregulares, en «G · Perfiles y áreas»).`, 'nota');
  ['Muro', 'Tipo', 'ax (m)', 'ay (m)', 'e (m)', 'A (m²)', 'I propio x (m⁴)', 'I propio y (m⁴)', 'x (m)', 'y (m)', 'Entra', 'Pieza A', 'Pieza B', 'nº A', 'nº B', 'A·x', 'A·y', 'Ix + A·y²', 'Iy + A·x²'].forEach((t, j) => sr.p(`${col(j + 1)}4`, t, 'h'));
  const r0 = 5, r1 = r0 + N_MUROS - 1;
  for (let i = 0; i < N_MUROS; i++) {
    const r = r0 + i, q = 2 + i, m = (c: string) => `${M}!${c}${q}`, vacio = `A${r}=""`;
    sr.p(`A${r}`, `=IF(${m('A')}="","",${m('A')}&"")`);
    sr.p(`B${r}`, `=IF(${vacio},"",IF(${m('M')}="tubo rect.","rect",IF(${m('M')}="tubo circ.","circ",IF(${m('M')}="perfil","perfil","tab"))))`);
    sr.p(`C${r}`, `=IF(${vacio},"",IF(B${r}="tab",IF(${m('B')}="Y",${m('F')},${m('E')}),${m('E')}))`, 'n3');
    sr.p(`D${r}`, `=IF(${vacio},"",IF(B${r}="tab",IF(${m('B')}="Y",${m('E')},${m('F')}),IF(B${r}="rect",IF(${m('N')}="",${m('E')},${m('N')}),${m('E')})))`, 'n3');
    sr.p(`E${r}`, `=IF(${vacio},"",${m('F')})`, 'n3');
    const ci = `MAX(0,C${r}-2*E${r})`, cj = `MAX(0,D${r}-2*E${r})`;
    sr.p(`F${r}`, `=IF(OR(${vacio},B${r}="perfil"),"",IF(B${r}="circ",PI()/4*(C${r}^2-${ci}^2),IF(B${r}="rect",C${r}*D${r}-${ci}*${cj},C${r}*D${r})))`, 'n4');
    sr.p(`G${r}`, `=IF(F${r}="","",IF(B${r}="circ",PI()/64*(C${r}^4-${ci}^4),IF(B${r}="rect",(C${r}*D${r}^3-${ci}*${cj}^3)/12,C${r}*D${r}^3/12)))`, 'n4');
    sr.p(`H${r}`, `=IF(F${r}="","",IF(B${r}="circ",PI()/64*(C${r}^4-${ci}^4),IF(B${r}="rect",(D${r}*C${r}^3-${cj}*${ci}^3)/12,D${r}*C${r}^3/12)))`, 'n4');
    sr.p(`I${r}`, `=IF(${vacio},"",${m('C')})`, 'n3');
    sr.p(`J${r}`, `=IF(${vacio},"",${m('D')})`, 'n3');
    // entra si llega a la fundación y pasa por PB (como entraEnCalculo): arranca en la fundación y termina arriba de 0
    const niv2 = (c: string) => `${NV}!$${c}$2:$${c}$${N_NIV + 1}`;
    const cotaDe = (c: string, def: string) => `IF(${m(c)}="",${def},IF(ISNUMBER(${m(c)}),${m(c)},IFERROR(INDEX(${niv2('B')},MATCH(${m(c)},${niv2('A')},0)),${def})))`;
    sr.p(`AI${r}`, `=IF(${vacio},"",${cotaDe('O', '$AL$5')})`, 'n3');
    sr.p(`AJ${r}`, `=IF(${vacio},"",${cotaDe('P', '$AM$5')})`, 'n3');
    sr.p(`K${r}`, `=IF(OR(${vacio},F${r}=""),"",IF(OR(LOWER(${m('G')})="no",AI${r}>$AL$5+0.000001,AJ${r}<=0.000001),0,1))`);
    sr.p(`L${r}`, `=IF(${vacio},"",${m('I')}&"")`);
    sr.p(`M${r}`, `=IF(${vacio},"",${m('K')}&"")`);
    sr.p(`N${r}`, `=IF(OR(${vacio},L${r}="",K${r}<>1),"",IF(COUNTIFS(L$${r0}:L${r},L${r},K$${r0}:K${r},1)=1,MAX(N$${r0 - 1}:N${r - 1})+1,""))`);
    sr.p(`O${r}`, `=IF(OR(${vacio},M${r}="",K${r}<>1),"",IF(COUNTIFS(M$${r0}:M${r},M${r},K$${r0}:K${r},1)=1,MAX(O$${r0 - 1}:O${r - 1})+1,""))`);
    sr.p(`P${r}`, `=IF(F${r}="","",F${r}*I${r})`, 'n4'); sr.p(`Q${r}`, `=IF(F${r}="","",F${r}*J${r})`, 'n4');
    sr.p(`R${r}`, `=IF(F${r}="","",G${r}+F${r}*J${r}^2)`, 'n4'); sr.p(`S${r}`, `=IF(F${r}="","",H${r}+F${r}*I${r}^2)`, 'n4');
  }
  sr.p('N4', 'nº A', 'h'); sr.p('O4', 'nº B', 'h');
  sr.p('AI4', 'arranca (m)', 'h'); sr.p('AJ4', 'termina (m)', 'h');
  sr.p('AL4', 'zFund (m)', 'h'); sr.p('AL5', `=MIN(${NV}!$B$2:$B$${N_NIV + 1})`, 'r3');
  sr.p('AM4', 'zTop (m)', 'h'); sr.p('AM5', `=MAX(${NV}!$B$2:$B$${N_NIV + 1})`, 'r3');
  const rg = (c: string) => `$${c}$${r0}:$${c}$${r1}`;
  // viento A (sube en +y): J = Σ(Ix + A·y²) − A·ȳ², como Jreal; viento B: Σ(Iy + A·x²) − A·x̄²
  for (const [base, dirn, pz, idx, numC, Jc] of [['W', 'A', 'L', 'N', 'R', 'Q'], ['AC', 'B', 'M', 'O', 'S', 'P']] as const) {
    const c0 = colN(base), cols = [0, 1, 2, 3, 4].map(k => col(c0 + k));
    sr.p(`${cols[0]}3`, `Piezas · viento ${dirn}`, 'sub');
    [`Pieza ${dirn}`, 'A (m²)', 'x̄ (m)', 'ȳ (m)', `J ${dirn} real (m⁴)`].forEach((t, j) => sr.p(`${cols[j]}4`, t, 'h'));
    for (let k = 1; k <= N_PIEZAS; k++) {
      const r = r0 + k - 1, P = `${cols[0]}${r}`, cond = `${rg(pz)},${P},$K$${r0}:$K$${r1},1`;
      sr.p(P, `=IFERROR(INDEX(${rg(pz)},MATCH(${k},${rg(idx)},0)),"")`, 'sub');
      sr.p(`${cols[1]}${r}`, `=IF(${P}="","",SUMIFS(${rg('F')},${cond}))`, 'n4');
      sr.p(`${cols[2]}${r}`, `=IF(${P}="","",SUMIFS(${rg('P')},${cond})/${cols[1]}${r})`, 'n3');
      sr.p(`${cols[3]}${r}`, `=IF(${P}="","",SUMIFS(${rg('Q')},${cond})/${cols[1]}${r})`, 'n3');
      sr.p(`${cols[4]}${r}`, `=IF(${P}="","",SUMIFS(${rg(numC)},${cond})-SUMIFS(${rg(Jc)},${cond})^2/${cols[1]}${r})`, 'r4');
    }
    sr.p(`${cols[3]}${r0 + N_PIEZAS + 1}`, `Σ J ${dirn}`, 'sub'); sr.p(`${cols[4]}${r0 + N_PIEZAS + 1}`, `=SUM(${cols[4]}${r0}:${cols[4]}${r0 + N_PIEZAS - 1})`, 'r4');
  }
  sr.graficos.push({ tipo: 'barras', titulo: 'J real de cada pieza · viento A (m⁴)', ejeX: 'pieza', ejeY: 'm⁴', desde: [39, 3], hasta: [50, 22], series: [{ nombre: 'J A', x: ref(SR, 'W', r0, r0 + nPzA - 1), y: ref(SR, 'AA', r0, r0 + nPzA - 1), color: 'B8401A' }] });
  sr.graficos.push({ tipo: 'barras', titulo: 'J real de cada pieza · viento B (m⁴)', ejeX: 'pieza', ejeY: 'm⁴', desde: [39, 23], hasta: [50, 42], series: [{ nombre: 'J B', x: ref(SR, 'AC', r0, r0 + nPzB - 1), y: ref(SR, 'AG', r0, r0 + nPzB - 1), color: '1A6BBD' }] });
  hojas.push(sr);

  // --- G · Rotación muro por muro (como la guía: piezas de la rototraslación y muros perpendiculares)
  const ro = new Hoja('G · Rotación muro por muro', [14, 10, 10, 11, 10, 10, 10, 11, 2, 14, 10, 10, 11, 10, 10, 10, 11]);
  ro.p('A1', 'Rototraslación muro por muro (guía): eje de inercia, excentricidad, Mt y reparto', 'tit');
  ro.p('A2', 'Paralelas: J y posición de cada pieza de las hojas de rototraslación (columnas B y H). Perpendiculares: J propio de cada muro (espesor · largo³ / 12) a la distancia del eje de la otra dirección. La rotación lleva el signo de la planilla.', 'nota');
  const perpTab = (dir: 'A' | 'B') => {
    const A = dir === 'A';
    // tabiques más largos en la transversal (los tubos y perfiles los pasa la app con sus valores)
    return p.muros.filter(m => (m.tipo ?? 'tabique') === 'tabique' && (A ? m.dir === 'X' : m.dir === 'Y') && m.largo > m.espesor);
  };
  const filasMuro = new Map(p.muros.map((m, i) => [m.id, 2 + i]));
  for (const [dirn, c0, hoja, otra, nombres] of [['A', 1, 'Rototrasl. cara mayor', 'Rototrasl. cara menor', o.piezasA], ['B', 10, 'Rototrasl. cara menor', 'Rototrasl. cara mayor', o.piezasB]] as const) {
    const C = [0, 1, 2, 3, 4, 5, 6, 7].map(k => col(c0 + k)), h = (c: string, f: number) => `'${hoja}'!${c}${f}`;
    ro.p(`${C[0]}4`, `Viento ${dirn}`, 'sub');
    const datos: [string, string][] = [['Q (t)', `=${h('D', 5)}`], ['Mv (tm)', `=${h('F', 5)}`], ['hW = Mv / Q (m)', `=IFERROR(${C[1]}6/${C[1]}5,0)`],
      ['Σ J (m⁴)', `=SUM(${C[2]}20:${C[2]}39)`], ['Xr = Σ J·x / Σ J (m)', `=IFERROR(SUMPRODUCT(${C[2]}20:${C[2]}39,${C[1]}20:${C[1]}39)/${C[1]}8,0)`],
      ['Sr, eje de la otra dirección (m)', `=IFERROR('${otra}'!J7*1,0)`], ['e = Xr (m)', `=${C[1]}9`], ['Mt = Q · e (tm)', `=${C[1]}5*${C[1]}11`],
      ['Σ J·a² (m⁶)', `=SUMPRODUCT(${C[2]}20:${C[2]}39,${C[3]}20:${C[3]}39,${C[3]}20:${C[3]}39)+SUMPRODUCT(${C[2]}45:${C[2]}${44 + N_MUROS},${C[3]}45:${C[3]}${44 + N_MUROS},${C[3]}45:${C[3]}${44 + N_MUROS})`]];
    datos.forEach(([t, f], k) => { ro.p(`${C[0]}${5 + k}`, t, 't'); ro.p(`${C[1]}${5 + k}`, f, 'r3'); });
    ro.p(`${C[0]}18`, 'Piezas paralelas', 'sub');
    ['Pieza', 'pos. x (m)', 'J (m⁴)', 'a = x − Xr (m)', 'Q tras (t)', 'Q rot (t)', 'Q total (t)', 'M total (tm)'].forEach((t, j) => ro.p(`${C[j]}19`, t, 'h'));
    for (let k = 0; k < 20; k++) {
      const r = 20 + k, f = 5 + k;
      ro.p(`${C[0]}${r}`, nombres[k] ?? `fila ${k + 1}`);
      ro.p(`${C[1]}${r}`, `=N(${h('H', f)})`, 'n3');
      ro.p(`${C[2]}${r}`, `=N(${h('B', f)})`, 'n4');
      ro.p(`${C[3]}${r}`, `=${C[1]}${r}-${C[1]}$9`, 'n3');
      ro.p(`${C[4]}${r}`, `=IFERROR(${C[1]}$5*${C[2]}${r}/${C[1]}$8,0)`, 'n3');
      ro.p(`${C[5]}${r}`, `=IFERROR(-${C[1]}$5*${C[1]}$11*${C[2]}${r}*${C[3]}${r}/${C[1]}$13,0)`, 'n3');
      ro.p(`${C[6]}${r}`, `=${C[4]}${r}+${C[5]}${r}`, 'r3');
      ro.p(`${C[7]}${r}`, `=${C[6]}${r}*${C[1]}$7`, 'r3');
    }
    ro.p(`${C[0]}43`, 'Muros perpendiculares (giran, no trasladan)', 'sub');
    ['Muro', 'pos. (m)', 'J propio (m⁴)', 'a = pos − Sr (m)', '', 'Q rot (t)'].forEach((t, j) => { if (t) ro.p(`${C[j]}44`, t, 'h'); });
    const A = dirn === 'A';
    const filas: { nombre: string; pos: string | number; J: string | number }[] = perpTab(dirn).map(m => {
      const q = filasMuro.get(m.id)!, mm = (c: string) => `${M}!${c}${q}`;
      // fila de «T3D Muros» de este muro (por nombre, por si se reordena la tabla)
      const fm = (c: string) => `INDEX(${M}!$${c}$2:$${c}$${N_MUROS + 1},MATCH("${m.id}",${M}!$A$2:$A$${N_MUROS + 1},0))`;
      void mm;
      const entra = `INDEX('${SR}'!$K$5:$K$${4 + N_MUROS},MATCH("${m.id}",'${SR}'!$A$5:$A$${4 + N_MUROS},0))`;
      return { nombre: m.id, pos: `=IFERROR(${fm(A ? 'D' : 'C')},0)`, J: `=IFERROR(IF(${entra}=1,${fm('F')}*${fm('E')}^3/12,0),0)` };
    });
    (o.perpendiculares?.[dirn] ?? []).forEach(x => filas.push({ nombre: `${x.nombre} (app)`, pos: x.pos, J: x.J }));
    filas.slice(0, N_MUROS).forEach((x, i) => {
      const r = 45 + i;
      ro.p(`${C[0]}${r}`, x.nombre); ro.p(`${C[1]}${r}`, x.pos, 'n3'); ro.p(`${C[2]}${r}`, x.J, 'n4');
      ro.p(`${C[3]}${r}`, `=${C[1]}${r}-${C[1]}$10`, 'n3');
      ro.p(`${C[5]}${r}`, `=IFERROR(-${C[1]}$5*${C[1]}$11*${C[2]}${r}*${C[3]}${r}/${C[1]}$13,0)`, 'n3');
    });
  }
  const RO = ro.nombre;
  const ultA = 19 + Math.max(1, o.piezasA.reduce((k, x, i) => (x ? i + 1 : k), 0)), ultB = 19 + Math.max(1, o.piezasB.reduce((k, x, i) => (x ? i + 1 : k), 0));
  ro.graficos.push({ tipo: 'barras', titulo: 'Corte que toma cada pieza · viento A (t)', ejeX: 'pieza', ejeY: 't', desde: [18, 3], hasta: [28, 22], series: [
    { nombre: 'traslación', x: ref(RO, 'A', 20, ultA), y: ref(RO, 'E', 20, ultA), color: '9AA3AD' }, { nombre: 'total (tras + rot)', x: ref(RO, 'A', 20, ultA), y: ref(RO, 'G', 20, ultA), color: 'B8401A' }] });
  ro.graficos.push({ tipo: 'barras', titulo: 'Corte que toma cada pieza · viento B (t)', ejeX: 'pieza', ejeY: 't', desde: [18, 23], hasta: [28, 42], series: [
    { nombre: 'traslación', x: ref(RO, 'J', 20, ultB), y: ref(RO, 'N', 20, ultB), color: '9AA3AD' }, { nombre: 'total (tras + rot)', x: ref(RO, 'J', 20, ultB), y: ref(RO, 'P', 20, ultB), color: '1A6BBD' }] });
  hojas.push(ro);

  // --- G · Peso por muro
  const pm = new Hoja('G · Peso por muro', [9, 9, 10, 9, 9, 10, 11, 11, 12]);
  pm.p('A1', 'Peso que baja por cada muro en PB: peso propio + losas', 'tit');
  pm.p('A2', `Peso propio = A · altura sobre PB · 2,4 t/m³. Losas = área de influencia × losas sobre PB que tiene arriba × 0,9 t/m² (servicio) o 0,7 t/m² (descargada). Niveles de «${T.niveles}».`, 'nota');
  ['Muro', 'A (m²)', 'Altura (m)', 'Losas', 'Área inf. (m²)', 'Peso propio (t)', 'Losas 0,9 (t)', 'N servicio (t)', 'N descargado (t)'].forEach((t, j) => pm.p(`${col(j + 1)}4`, t, 'h'));
  const niv = (c: string) => `${NV}!$${c}$2:$${c}$${N_NIV + 1}`;
  pm.p('K4', 'zPB (m)', 'h'); pm.p('K5', `=SUMPRODUCT(MIN(${niv('B')}+(${niv('B')}<0)*1E9+(${niv('B')}="")*1E9))`, 'r3');
  pm.p('L4', 'zTop (m)', 'h'); pm.p('L5', `=MAX(${niv('B')})`, 'r3');
  for (let i = 0; i < N_MUROS; i++) {
    const r = 5 + i, s = 5 + i, q = 2 + i, vacio = `A${r}=""`;
    pm.p(`A${r}`, `=IF('${SR}'!A${s}="","",'${SR}'!A${s})`);
    pm.p(`B${r}`, `=IF(${vacio},"",'${SR}'!F${s})`, 'n4');
    const nivel = (c: string, def: string) => `IF(${M}!${c}${q}="",${def},IF(ISNUMBER(${M}!${c}${q}),${M}!${c}${q},IFERROR(INDEX(${niv('B')},MATCH(${M}!${c}${q},${niv('A')},0)),${def})))`;
    pm.p(`M${r}`, `=IF(${vacio},"",MIN(${nivel('P', '$L$5')},$L$5))`, 'n3');
    pm.p(`N${r}`, `=IF(${vacio},"",${nivel('O', '-1E9')})`, 'n3');
    pm.p(`C${r}`, `=IF(OR(${vacio},B${r}=""),"",MAX(0,M${r}-$K$5))`, 'n3');
    pm.p(`D${r}`, `=IF(OR(${vacio},B${r}=""),"",COUNTIFS(${niv('B')},">"&($K$5+0.000001),${niv('B')},"<="&(M${r}+0.000001),${niv('B')},">="&(N${r}-0.000001)))`);
    pm.p(`E${r}`, `=IF(${vacio},"",${M}!H${q})`, 'n3');
    pm.p(`F${r}`, `=IF(OR(${vacio},B${r}=""),"",B${r}*C${r}*2.4)`, 'n3');
    pm.p(`G${r}`, `=IF(OR(${vacio},B${r}=""),"",0.9*E${r}*D${r})`, 'n3');
    pm.p(`H${r}`, `=IF(OR(${vacio},B${r}=""),"",F${r}+G${r})`, 'r3');
    pm.p(`I${r}`, `=IF(OR(${vacio},B${r}=""),"",F${r}+0.7*E${r}*D${r})`, 'n3');
  }
  pm.p('M4', 'tope (m)', 'h'); pm.p('N4', 'arranque (m)', 'h');
  const PM = pm.nombre;
  pm.graficos.push({ tipo: 'barras', titulo: 'N servicio de cada muro en PB (t)', ejeX: 'muro', ejeY: 't', desde: [15, 3], hasta: [27, 24], series: [
    { nombre: 'peso propio', x: ref(PM, 'A', 5, 4 + Math.max(1, Math.min(N_MUROS, p.muros.length))), y: ref(PM, 'F', 5, 4 + Math.max(1, Math.min(N_MUROS, p.muros.length))), color: '9AA3AD' },
    { nombre: 'N servicio', x: ref(PM, 'A', 5, 4 + Math.max(1, Math.min(N_MUROS, p.muros.length))), y: ref(PM, 'H', 5, 4 + Math.max(1, Math.min(N_MUROS, p.muros.length))), color: '6A3D9A' }] });
  hojas.push(pm);

  // --- G · Planta (los muros de «T3D Muros» como segmentos de su eje)
  const pl = new Hoja('G · Planta', [9, 10, 10, 2, 10, 10]);
  pl.p('A1', 'Planta de PB: los muros de la tabla dibujados', 'tit');
  pl.p('A2', 'Cada muro es el segmento de su eje (centro ± largo / 2 en su dirección). Cambiá «T3D Muros» y el dibujo se actualiza.', 'nota');
  ['Muro', 'x (m)', 'y (m)'].forEach((t, j) => pl.p(`${col(j + 1)}4`, t, 'h'));
  for (let i = 0; i < N_MUROS; i++) {
    const q = 2 + i, m = (c: string) => `${M}!${c}${q}`, r = 5 + 3 * i;
    const hay = `${m('A')}<>""`, esY = `${m('B')}="Y"`;
    pl.p(`A${r}`, `=IF(${hay},${m('A')}&"","")`);
    pl.p(`B${r}`, `=IF(${hay},IF(${esY},${m('C')},${m('C')}-${m('E')}/2),NA())`, 'n3');
    pl.p(`C${r}`, `=IF(${hay},IF(${esY},${m('D')}-${m('E')}/2,${m('D')}),NA())`, 'n3');
    pl.p(`B${r + 1}`, `=IF(${hay},IF(${esY},${m('C')},${m('C')}+${m('E')}/2),NA())`, 'n3');
    pl.p(`C${r + 1}`, `=IF(${hay},IF(${esY},${m('D')}+${m('E')}/2,${m('D')}),NA())`, 'n3');
  }
  const PL = pl.nombre, rP = 4 + 3 * N_MUROS;
  pl.graficos.push({ tipo: 'dispersion', titulo: 'Planta de PB (ejes de los muros)', ejeX: 'x (m)', ejeY: 'y (m)', desde: [7, 3], hasta: [19, 34], series: [{ nombre: 'muros', x: ref(PL, 'B', 5, rP), y: ref(PL, 'C', 5, rP), color: '1F4E79', sinMarcas: true, ancho: 50800 }] });
  hojas.push(pl);

  // --- G · Perfiles y áreas (app)
  const pa = new Hoja('G · Perfiles y áreas (app)', [10, 12, 9, 9, 9, 11, 11, 11, 16, 16, 30]);
  pa.p('A1', 'Perfiles irregulares y áreas de influencia (valores de la app)', 'tit');
  pa.p('A2', 'Necesitan la geometría de la planta (contornos con curvas, la losa con sus huecos): la app los calcula y los escribe acá. En la hoja J van con el rectángulo equivalente.', 'nota');
  ['Elemento', 'Tipo', 'A (m²)', 'x̄ (m)', 'ȳ (m)', 'J A (m⁴)', 'J B (m⁴)', 'J xy (m⁴)', 'Rect. eq. A (b × h)', 'Rect. eq. B (b × h)', 'Nota'].forEach((t, j) => pa.p(`${col(j + 1)}4`, t, 'h'));
  (o.perfiles ?? []).forEach((f, i) => f.forEach((v, j) => pa.p(`${col(j + 1)}${5 + i}`, v, typeof v === 'number' ? 'n4' : 't')));
  const ra = 8 + Math.max(1, o.perfiles?.length ?? 0);
  pa.p(`A${ra}`, 'Áreas de influencia', 'sub');
  ['Muro', 'Área calculada (m²)', 'Área cargada (m²)', 'Color (4 colores)'].forEach((t, j) => pa.p(`${col(j + 1)}${ra + 1}`, t, 'h'));
  (o.areas ?? []).forEach((f, i) => f.forEach((v, j) => pa.p(`${col(j + 1)}${ra + 2 + i}`, v, typeof v === 'number' ? 'n3' : 't')));
  hojas.push(pa);

  // --- G · Dibujos de la app (carta y dibujos de cada etapa, como imágenes)
  if (o.imagenes?.length) {
    const di = new Hoja('G · Dibujos de la app', [100]);
    di.p('A1', 'Dibujos de la app: la carta de la torre y los dibujos de cada etapa', 'tit');
    di.p('A2', 'Son imágenes del momento en que se escribió la planilla; los gráficos de las otras hojas «G ·» sí se actualizan solos.', 'nota');
    let fila = 3;
    for (const im of o.imagenes) {
      di.p(`A${fila + 1}`, im.titulo, 'sub');
      const ancho = Math.min(1100, im.ancho), alto = Math.round(im.alto * (ancho / im.ancho));
      di.imagenes.push({ png: im.png, col: 0, fila: fila + 1, ancho, alto });
      fila += 2 + Math.ceil(alto / 18);
    }
    hojas.push(di);
  }
  return hojas;
}

/** orden final: cada hoja «G ·» al lado de la original con la que trabaja; las «T3D …» al final */
const ORDEN = ['Léame', 'viento', 'G · Viento corregido', 'M,NyQ', 'G · Carta de la torre', 'J Tabiques paralelos', 'J Tabiques ortogonales', 'G · Sección real',
  'G · Planta', 'G · Perfiles y áreas (app)', 'Rototrasl. cara mayor', 'Rototrasl. cara menor', 'G · Rotación muro por muro', 'Flex comp PB paralelos', 'G · Peso por muro',
  'G · Dibujos de la app', ...Object.values(T), 'T3D'];

/** agrega las hojas «G ·» (o las reemplaza si la planilla ya las tenía) con sus gráficos e imágenes, y ordena el libro */
export async function agregarHojasG(zip: JSZip, p: Proyecto, o: OpcionesG, agregarHoja: (nombre: string, xml: string) => Promise<string>): Promise<void> {
  const stF = zip.file('xl/styles.xml')!;
  const { st, S } = agregarEstilos(await stF.async('string'));
  zip.file('xl/styles.xml', st);
  let ct = await zip.file('[Content_Types].xml')!.async('string');
  if (!/Extension="png"/i.test(ct)) ct = ct.replace('<Default ', '<Default Extension="png" ContentType="image/png"/><Default ');
  for (const h of armarHojas(p, o)) {
    const conDibujo = h.graficos.length + h.imagenes.length > 0;
    const ruta = await agregarHoja(h.nombre, h.xml(S, conDibujo));     // xl/worksheets/sheetN.xml
    const base = ruta.replace(/^.*\//, '').replace('.xml', '');
    const relsHoja = `xl/worksheets/_rels/${base}.xml.rels`;
    if (!conDibujo) { zip.remove(relsHoja); continue; }
    const dib = `drawingG_${base}.xml`;
    zip.file(relsHoja, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDibujoG" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/${dib}"/></Relationships>`);
    const anclas: string[] = [], rels: string[] = [];
    h.graficos.forEach((g, i) => {
      const nombre = `chartG_${base}_${i + 1}.xml`;
      zip.file(`xl/charts/${nombre}`, graficoXml(g));
      if (!ct.includes(`/xl/charts/${nombre}`)) ct = ct.replace('</Types>', `<Override PartName="/xl/charts/${nombre}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
      rels.push(`<Relationship Id="rIdG${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/${nombre}"/>`);
      anclas.push(`<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${g.desde[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.desde[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${g.hasta[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.hasta[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`
        + `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${100 + i}" name="${esc(g.titulo)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rIdG${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`);
    });
    h.imagenes.forEach((im, i) => {
      const nombre = `imgG_${base}_${i + 1}.png`;
      zip.file(`xl/media/${nombre}`, im.png);
      rels.push(`<Relationship Id="rIdI${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${nombre}"/>`);
      const E = 9525;
      anclas.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>${im.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${im.fila}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${im.ancho * E}" cy="${im.alto * E}"/>`
        + `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${500 + i}" name="Dibujo ${i + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdI${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>`
        + `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${im.ancho * E}" cy="${im.alto * E}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`);
    });
    zip.file(`xl/drawings/${dib}`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ${A_} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anclas.join('')}</xdr:wsDr>`);
    zip.file(`xl/drawings/_rels/${dib}.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
    if (!ct.includes(`/xl/drawings/${dib}`)) ct = ct.replace('</Types>', `<Override PartName="/xl/drawings/${dib}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  }
  zip.file('[Content_Types].xml', ct);
  // orden de las hojas y hoja activa («viento», la primera del curso)
  let wb = await zip.file('xl/workbook.xml')!.async('string');
  const tags = [...wb.matchAll(/<sheet\b[^>]*\/>/g)].map(m => m[0]);
  const nombre = (t: string) => (/name="([^"]+)"/.exec(t)?.[1] ?? '').replace(/&amp;/g, '&');
  const pos = (t: string) => { const k = ORDEN.indexOf(nombre(t)); return k < 0 ? ORDEN.length : k; };
  const ordenadas = [...tags].sort((a, b) => pos(a) - pos(b) || tags.indexOf(a) - tags.indexOf(b));
  wb = wb.replace(/<sheets>[\s\S]*?<\/sheets>/, `<sheets>${ordenadas.join('')}</sheets>`);
  const iv = ordenadas.findIndex(t => nombre(t) === 'viento');
  wb = /activeTab="\d+"/.test(wb) ? wb.replace(/activeTab="\d+"/, `activeTab="${Math.max(0, iv)}"`) : wb;
  zip.file('xl/workbook.xml', wb);
}
