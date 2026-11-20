/**
 * Kit común de los libros nuevos (plan de trabajo, etapa 5): arma un .xlsx desde cero, sin plantilla.
 *
 *  - Hojas con celdas de dato (blancas, las únicas que se escriben a mano), coeficientes (amarillas), fórmulas (grises)
 *    y resultados (verdes); textos, títulos y notas con la estética de la cátedra.
 *  - Nombres definidos (V, Kd, zg…) para que las fórmulas se lean como en la guía.
 *  - Gráficos de Excel (dispersión y barras) que leen las celdas: cambian solos si el alumno cambia un dato.
 *  - «VERIFICA / NO VERIFICA» en verde o rojo con formato condicional; listas desplegables en los datos.
 *  - El libro se recalcula al abrirse (Excel, LibreOffice y Google Sheets): no se guarda ningún resultado.
 *
 * Lo usan la «Planilla de la guía» y la «Planilla renovada». El mismo libro se puede recalcular dentro de la app con
 * el evaluador de fórmulas (formulas.ts) para las pruebas: `aLibroEvaluable`.
 */
import JSZip from 'jszip';
import type { Libro as LibroEval, Valor } from '../formulas';

// ---------------------------------------------------------------------------------------------------- referencias
export const col = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
export const colN = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
/** «C5» a partir de columna (1 = A) y fila */
export const rc = (c: number, r: number) => `${col(c)}${r}`;
/** referencia absoluta «$C$5» */
export const abs = (c: number, r: number) => `$${col(c)}$${r}`;
/** nombre de hoja para una fórmula: 'Hoja con espacios'! */
export const hojaRef = (h: string) => `'${h.replace(/'/g, "''")}'!`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------------------------------- estilos
/** papel de la celda: define el color de fondo y la letra */
export type Papel = 'titulo' | 'subtitulo' | 'seccion' | 'cab' | 'texto' | 'textoB' | 'nota' | 'unidad' | 'dato' | 'coef' | 'calc' | 'res' | 'clave' | 'vacio';
/** formato de número */
export type Fmt = 'g' | '0' | '0.0' | '0.00' | '0.000' | '0.0000' | '0.00000' | '%' | 'e';
export interface Estilo { papel: Papel; fmt?: Fmt; centrar?: boolean; ajustar?: boolean }
const CODIGOS: Record<Exclude<Fmt, 'g'>, string> = { '0': '0', '0.0': '0.0', '0.00': '0.00', '0.000': '0.000', '0.0000': '0.0000', '0.00000': '0.00000', '%': '0.0%', e: '0.00E+00' };
const FMT_ID: Record<Fmt, number> = { g: 0, '0': 164, '0.0': 165, '0.00': 166, '0.000': 167, '0.0000': 168, '0.00000': 169, '%': 170, e: 171 };
/** colores de la cátedra (azul de los encabezados, amarillo de los coeficientes) */
const AZUL = '1F4E79', CELESTE = 'DDEBF7', AMARILLO = 'FFF2CC', GRIS = 'F2F2F2', VERDE = 'E2EFDA', BORDE = 'BFBFBF';
const FUENTES = [
  '<font><sz val="10"/><color rgb="FF000000"/><name val="Arial"/><family val="2"/></font>',                 // 0 normal
  '<font><b/><sz val="10"/><color rgb="FF000000"/><name val="Arial"/><family val="2"/></font>',             // 1 negrita
  `<font><b/><sz val="14"/><color rgb="FF${AZUL}"/><name val="Arial"/><family val="2"/></font>`,           // 2 título
  `<font><b/><sz val="11"/><color rgb="FF${AZUL}"/><name val="Arial"/><family val="2"/></font>`,           // 3 subtítulo
  '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>',             // 4 blanca
  '<font><i/><sz val="9"/><color rgb="FF595959"/><name val="Arial"/><family val="2"/></font>',              // 5 nota
  '<font><sz val="9"/><color rgb="FF595959"/><name val="Arial"/><family val="2"/></font>',                  // 6 unidad
  `<font><b/><sz val="10"/><color rgb="FF${AZUL}"/><name val="Arial"/><family val="2"/></font>`,           // 7 dato
];
const relleno = (c: string) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`;
const RELLENOS = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>', relleno(AZUL), relleno(CELESTE), relleno(AMARILLO), relleno(GRIS), relleno(VERDE), relleno('FFFFFF')];
const BORDES = ['<border><left/><right/><top/><bottom/><diagonal/></border>',
  `<border><left style="thin"><color rgb="FF${BORDE}"/></left><right style="thin"><color rgb="FF${BORDE}"/></right><top style="thin"><color rgb="FF${BORDE}"/></top><bottom style="thin"><color rgb="FF${BORDE}"/></bottom><diagonal/></border>`,
  `<border><left style="medium"><color rgb="FF${AZUL}"/></left><right style="medium"><color rgb="FF${AZUL}"/></right><top style="medium"><color rgb="FF${AZUL}"/></top><bottom style="medium"><color rgb="FF${AZUL}"/></bottom><diagonal/></border>`];
/** fuente, relleno y borde de cada papel */
const PAPEL: Record<Papel, [number, number, number]> = {
  titulo: [2, 0, 0], subtitulo: [3, 0, 0], seccion: [4, 2, 1], cab: [1, 3, 1], texto: [0, 0, 1], textoB: [1, 0, 1], nota: [5, 0, 0],
  unidad: [6, 0, 1], dato: [7, 7, 2], coef: [0, 4, 1], calc: [0, 5, 1], res: [1, 6, 1], clave: [1, 6, 2], vacio: [0, 0, 0],
};

class Estilos {
  private xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private idx = new Map<string, number>();
  id(e: Estilo): number {
    const k = `${e.papel}|${e.fmt ?? 'g'}|${e.centrar ? 1 : 0}|${e.ajustar ? 1 : 0}`;
    let i = this.idx.get(k);
    if (i === undefined) {
      const [f, r, b] = PAPEL[e.papel];
      const al = `<alignment vertical="center"${e.centrar ? ' horizontal="center"' : ''}${e.ajustar || e.papel === 'cab' || e.papel === 'nota' ? ' wrapText="1"' : ''}/>`;
      i = this.xfs.length;
      this.xfs.push(`<xf numFmtId="${FMT_ID[e.fmt ?? 'g']}" fontId="${f}" fillId="${r}" borderId="${b}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1">${al}</xf>`);
      this.idx.set(k, i);
    }
    return i;
  }
  xml(): string {
    const nf = Object.entries(CODIGOS).map(([k, c]) => `<numFmt numFmtId="${FMT_ID[k as Fmt]}" formatCode="${esc(c)}"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
      + `<numFmts count="${Object.keys(CODIGOS).length}">${nf}</numFmts>`
      + `<fonts count="${FUENTES.length}">${FUENTES.join('')}</fonts><fills count="${RELLENOS.length}">${RELLENOS.join('')}</fills><borders count="${BORDES.length}">${BORDES.join('')}</borders>`
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>`
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      // formato condicional: 0 = verifica (verde), 1 = no verifica (rojo), 2 = atención (naranja)
      + '<dxfs count="3"><dxf><font><b/><color rgb="FF1E6B34"/></font><fill><patternFill><bgColor rgb="FFC6EFCE"/></patternFill></fill></dxf>'
      + '<dxf><font><b/><color rgb="FF9C0006"/></font><fill><patternFill><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf>'
      + '<dxf><font><b/><color rgb="FF8A5300"/></font><fill><patternFill><bgColor rgb="FFFFEB9C"/></patternFill></fill></dxf></dxfs>'
      + '<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>';
  }
}

// ---------------------------------------------------------------------------------------------------- gráficos
export interface Serie { nombre: string; x: string; y: string; color: string; sinMarcas?: boolean; ancho?: number; punteada?: boolean }
export interface Grafico {
  tipo: 'dispersion' | 'barras';
  titulo: string; ejeX: string; ejeY: string; series: Serie[];
  /** esquinas (columna y fila, desde 1) donde va el gráfico */
  desde: [number, number]; hasta: [number, number];
  /** sin leyenda (una sola serie) */
  sinLeyenda?: boolean;
}
const A_ = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const txPr = (sz = 900) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}"><a:solidFill><a:srgbClr val="1F2328"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:pPr><a:endParaRPr lang="es-AR"/></a:p></c:txPr>`;
const tituloXml = (t: string, sz = 1100) => `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="1"/></a:pPr><a:r><a:rPr lang="es-AR" sz="${sz}" b="1"><a:solidFill><a:srgbClr val="1F2328"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${esc(t)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
const ejeXml = (id: number, cruza: number, pos: 'b' | 'l', titulo: string, grilla: boolean) =>
  `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${pos}"/>${grilla ? '<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E1E5EA"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' : ''}${tituloXml(titulo, 900)}<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="8A949E"/></a:solidFill></a:ln></c:spPr>${txPr()}<c:crossAx val="${cruza}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`;
export function graficoXml(g: Grafico): string {
  const cab = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ${A_} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>${tituloXml(g.titulo)}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>`;
  const leyenda = g.sinLeyenda ? '' : `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${txPr()}</c:legend>`;
  const pie = `</c:plotArea>${leyenda}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="C3CAD1"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`;
  if (g.tipo === 'barras') {
    const series = g.series.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.nombre)}</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/><c:cat><c:strRef><c:f>${esc(s.x)}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${esc(s.y)}</c:f></c:numRef></c:val></c:ser>`).join('');
    return cab + `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="60"/><c:axId val="10"/><c:axId val="20"/></c:barChart>`
      + `<c:catAx><c:axId val="10"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>${tituloXml(g.ejeX, 900)}<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>${txPr(800)}<c:crossAx val="20"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
      + ejeXml(20, 10, 'l', g.ejeY, true).replace('<c:crossBetween val="midCat"/>', '<c:crossBetween val="between"/>') + pie;
  }
  const series = g.series.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.nombre)}</c:v></c:tx><c:spPr><a:ln w="${s.ancho ?? 25400}" cap="rnd"><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill>${s.punteada ? '<a:prstDash val="dash"/>' : ''}<a:round/></a:ln></c:spPr>`
    + (s.sinMarcas ? '<c:marker><c:symbol val="none"/></c:marker>' : `<c:marker><c:symbol val="circle"/><c:size val="4"/><c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker>`)
    + `<c:xVal><c:numRef><c:f>${esc(s.x)}</c:f></c:numRef></c:xVal><c:yVal><c:numRef><c:f>${esc(s.y)}</c:f></c:numRef></c:yVal><c:smooth val="0"/></c:ser>`).join('');
  return cab + `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${series}<c:axId val="10"/><c:axId val="20"/></c:scatterChart>` + ejeXml(10, 20, 'b', g.ejeX, true) + ejeXml(20, 10, 'l', g.ejeY, true) + pie;
}

// ---------------------------------------------------------------------------------------------------- hojas
export type ValorCeldaK = string | number | null | { f: string };
interface CeldaK { v: ValorCeldaK; e: Estilo }
export class HojaK {
  celdas = new Map<string, CeldaK>();
  combinadas: string[] = [];
  graficos: Grafico[] = [];
  /** formato condicional VERIFICA / NO VERIFICA / ATENCIÓN sobre estos rangos */
  verificaciones: string[] = [];
  /** listas desplegables: rango y opciones */
  listas: { rango: string; opciones: string[] }[] = [];
  /** filas y columnas fijas al desplazarse */
  fijar: { fila: number; col: number } | null = null;
  oculta = false;
  altos = new Map<number, number>();
  constructor(readonly nombre: string, public anchos: number[] = []) {}
  /** escribe una celda (columna desde 1) */
  put(c: number, r: number, v: ValorCeldaK, e: Estilo | Papel = 'texto'): string {
    const ref = rc(c, r);
    this.celdas.set(ref, { v, e: typeof e === 'string' ? { papel: e } : e });
    return ref;
  }
  /** fórmula (sin el «=») */
  f(c: number, r: number, formula: string, e: Estilo | Papel = { papel: 'calc', fmt: '0.000' }): string {
    return this.put(c, r, { f: formula.replace(/^=/, '') }, e);
  }
  combinar(c0: number, r0: number, c1: number, r1: number) { this.combinadas.push(`${rc(c0, r0)}:${rc(c1, r1)}`); }
  /** título de la hoja (fila 1) y explicación (fila 2, combinada) */
  encabezado(titulo: string, explicacion: string, ancho = 10) {
    this.put(1, 1, titulo, 'titulo');
    this.put(1, 2, explicacion, { papel: 'nota', ajustar: true });
    this.combinar(1, 2, ancho, 2);
    this.altos.set(2, Math.max(30, Math.ceil(explicacion.length / (ancho * 11)) * 13));
  }
  /** banda de sección en la fila r */
  seccion(r: number, texto: string, ancho = 10) { this.put(1, r, texto, 'seccion'); for (let c = 2; c <= ancho; c++) this.put(c, r, null, 'seccion'); }
  /** fila de encabezados de una tabla */
  cabecera(r: number, c0: number, textos: string[]) { textos.forEach((t, i) => this.put(c0 + i, r, t, { papel: 'cab', centrar: true })); this.altos.set(r, 40); }

  xml(st: Estilos, dibujo: boolean): string {
    const filas = new Map<number, [number, string, CeldaK][]>();
    for (const [ref, c] of this.celdas) { const m = /^([A-Z]+)(\d+)$/.exec(ref)!; const f = +m[2]; if (!filas.has(f)) filas.set(f, []); filas.get(f)!.push([colN(m[1]), ref, c]); }
    const out = [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`];
    out.push('<sheetViews><sheetView workbookViewId="0" zoomScale="100">');
    if (this.fijar) out.push(`<pane${this.fijar.col > 1 ? ` xSplit="${this.fijar.col - 1}"` : ''} ySplit="${this.fijar.fila - 1}" topLeftCell="${rc(this.fijar.col, this.fijar.fila)}" activePane="bottomRight" state="frozen"/>`);
    out.push('</sheetView></sheetViews><sheetFormatPr defaultRowHeight="13.5"/>');
    if (this.anchos.length) out.push(`<cols>${this.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`);
    out.push('<sheetData>');
    for (const f of [...new Set([...filas.keys(), ...this.altos.keys()])].sort((a, b) => a - b)) {
      const alto = this.altos.get(f);
      out.push(`<row r="${f}"${alto ? ` ht="${alto}" customHeight="1"` : ''}>`);
      for (const [, ref, c] of (filas.get(f) ?? []).sort((a, b) => a[0] - b[0])) {
        const s = st.id(c.e), v = c.v;
        if (v === null || v === '') out.push(`<c r="${ref}" s="${s}"/>`);
        else if (typeof v === 'number') out.push(isFinite(v) ? `<c r="${ref}" s="${s}"><v>${v}</v></c>` : `<c r="${ref}" s="${s}"/>`);
        else if (typeof v === 'object') out.push(`<c r="${ref}" s="${s}"><f>${esc(v.f)}</f></c>`);
        else out.push(`<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
      }
      out.push('</row>');
    }
    out.push('</sheetData>');
    if (this.combinadas.length) out.push(`<mergeCells count="${this.combinadas.length}">${this.combinadas.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`);
    let pr = 1;
    for (const rg of this.verificaciones) {
      const primera = rg.split(':')[0];
      out.push(`<conditionalFormatting sqref="${rg}">`
        + `<cfRule type="containsText" dxfId="1" priority="${pr++}" operator="containsText" text="NO VERIFICA"><formula>NOT(ISERROR(SEARCH("NO VERIFICA",${primera})))</formula></cfRule>`
        + `<cfRule type="containsText" dxfId="2" priority="${pr++}" operator="containsText" text="ATENCIÓN"><formula>NOT(ISERROR(SEARCH("ATENCIÓN",${primera})))</formula></cfRule>`
        + `<cfRule type="containsText" dxfId="0" priority="${pr++}" operator="containsText" text="VERIFICA"><formula>NOT(ISERROR(SEARCH("VERIFICA",${primera})))</formula></cfRule></conditionalFormatting>`);
    }
    if (this.listas.length) out.push(`<dataValidations count="${this.listas.length}">${this.listas.map(l => `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="0" sqref="${l.rango}"><formula1>"${esc(l.opciones.join(','))}"</formula1></dataValidation>`).join('')}</dataValidations>`);
    out.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/>');
    if (dibujo) out.push('<drawing r:id="rIdDibujo"/>');
    out.push('</worksheet>');
    return out.join('');
  }
}

// ---------------------------------------------------------------------------------------------------- libro
export class LibroK {
  hojas: HojaK[] = [];
  /** nombres definidos: nombre → 'Hoja'!$C$5 (o un rango) */
  nombres = new Map<string, { hoja: string; ref: string }>();
  titulo = '';
  hoja(nombre: string, anchos: number[] = []): HojaK { const h = new HojaK(nombre, anchos); this.hojas.push(h); return h; }
  nombrar(nombre: string, hoja: string, ref: string) {
    // un nombre que se parece a una celda (b6, H1, XFD10) o a R1C1 Excel y LibreOffice lo leen como la celda
    if (/^[A-Za-z]{1,3}\d+$/.test(nombre) || /^[RrCc]\d*$/.test(nombre) || /^[RrCc]\d*[RrCc]\d*$/.test(nombre) || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(nombre)) throw new Error(`Nombre definido inválido (se confunde con una celda): ${nombre}`);
    if (this.nombres.has(nombre)) throw new Error(`Nombre definido repetido: ${nombre}`);
    this.nombres.set(nombre, { hoja, ref });
  }

  async xlsx(): Promise<Uint8Array> {
    const zip = new JSZip(), st = new Estilos();
    const hojasXml = this.hojas.map(h => h.xml(st, h.graficos.length > 0));
    let nGraf = 0;
    const ct: string[] = [];
    this.hojas.forEach((h, i) => {
      zip.file(`xl/worksheets/sheet${i + 1}.xml`, hojasXml[i]);
      ct.push(`<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
      if (!h.graficos.length) return;
      zip.file(`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDibujo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${i + 1}.xml"/></Relationships>`);
      const rels: string[] = [], anclas: string[] = [];
      h.graficos.forEach((g, k) => {
        nGraf++;
        zip.file(`xl/charts/chart${nGraf}.xml`, graficoXml(g));
        ct.push(`<Override PartName="/xl/charts/chart${nGraf}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
        rels.push(`<Relationship Id="rIdG${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${nGraf}.xml"/>`);
        anclas.push(`<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${g.desde[0] - 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.desde[1] - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${g.hasta[0] - 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.hasta[1] - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`
          + `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${k + 2}" name="${esc(g.titulo)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rIdG${k + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`);
      });
      zip.file(`xl/drawings/drawing${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ${A_} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anclas.join('')}</xdr:wsDr>`);
      zip.file(`xl/drawings/_rels/drawing${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
      ct.push(`<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
    });
    const nombres = [...this.nombres.entries()].map(([n, d]) => `<definedName name="${esc(n)}">${esc(hojaRef(d.hoja) + d.ref.split(':').map(x => x.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2')).join(':'))}</definedName>`).join('');
    zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>`
      + this.hojas.map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}"${h.oculta ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')
      + `</sheets>${nombres ? `<definedNames>${nombres}</definedNames>` : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + this.hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rIdEstilos" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file('xl/styles.xml', st.xml());
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
    zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(this.titulo)}</dc:title><dc:creator>Torre 3D</dc:creator></cp:coreProperties>`);
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>`
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + ct.join('') + '</Types>');
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  /** el libro en la forma del evaluador de fórmulas (para recalcularlo dentro de la app o en las pruebas) */
  aLibroEvaluable(): { libro: LibroEval; nombres: Map<string, { hoja: string; ref: string }> } {
    const libro: LibroEval = new Map();
    for (const h of this.hojas) {
      const m = new Map<string, { v?: Valor; f?: string }>();
      for (const [ref, c] of h.celdas) {
        const v = c.v;
        if (v !== null && typeof v === 'object') m.set(ref, { f: v.f });
        else m.set(ref, { v: v === '' ? null : v });
      }
      libro.set(h.nombre, m);
    }
    return { libro, nombres: this.nombres };
  }
}
