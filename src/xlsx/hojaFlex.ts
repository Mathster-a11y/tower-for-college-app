/**
 * Hoja «Flexocompresión PB»: la verificación de la guía «Edificio en torre» (sección 5) con el lenguaje y la estética
 * de las hojas de la cátedra, y que calcula sola dentro del Excel: no lleva ningún número calculado por la app.
 * Todo sale de otras celdas de la misma planilla:
 *
 *   superficie, altura de la pieza y eje neutro → «J Tabiques paralelos / ortogonales» (columnas O, P, S, X…, AK)
 *   J y % del viento que toma (traslación + rotación) → «Rototrasl. cara mayor / menor» (B, E, N y D5)
 *   altura, niveles y área de influencia (viento A) → «Flex comp PB paralelos» (C, G y F)
 *   momento volcador en PB → «M,NyQ» (J y O de la fila de PB)
 *
 * Lo único que escribe la app son los datos que la cátedra no tiene en otra hoja (como en sus celdas blancas): el tipo
 * de cada pieza (columna naranja, como «Piezas» de la Flex de la cátedra) y la carga de las piezas del viento B. Los
 * coeficientes (γ, losas, σadm, σe, cuantía) están en celdas amarillas abajo y todas las fórmulas los leen de ahí.
 *
 *   σ = −N / F ± M / W          (− compresión, + tracción; F = superficie, W = J / c)
 */
import type { Asignacion, PiezaEquivalente } from '../engine/mapping';
import type { Proyecto } from '../engine/modelo';
import type { Motor } from '../engine/config';
import { filaExcelJ } from '../engine/planilla';
import { FUENTE_EXCEL } from '../ui/tipografia';

export const HOJA_FLEX = 'Flexocompresión PB';

// ------------------------------------------------------------------ estilos (se agregan al final de styles.xml)
export type EstiloFlex = 'tit' | 'pb' | 'banda' | 'cab' | 'desc' | 'unid' | 'nro' | 'calc' | 'clave' | 'pct' | 'dato' | 'res'
  | 'simetrica' | 'asimetrica' | 'tubo' | 'portico' | 'nota' | 'formula' | 'lab' | 'coef';
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** agrega a styles.xml los estilos de la hoja (IBM Plex Sans, bordes finos, rellenos de la cátedra); devuelve sus índices y los de los formatos condicionales */
export function estilosFlex(st: string): { st: string; S: Record<EstiloFlex, number>; dxfOk: number; dxfNo: number } {
  if (!/<dxfs[\s>]/.test(st)) st = st.replace(/(<tableStyles|<colors|<extLst|<\/styleSheet>)/, '<dxfs count="0"></dxfs>$1');
  st = st.replace(/<dxfs count="(\d+)"\s*\/>/, '<dxfs count="$1"></dxfs>');
  const agregar = (tag: string, xml: string): number => {
    const m = new RegExp(`<${tag} count="(\\d+)"`).exec(st);
    if (!m) { st = st.replace(/(<styleSheet[^>]*>)/, `$1<${tag} count="1">${xml}</${tag}>`); return 0; }
    const n = +m[1], i = st.indexOf(`</${tag}>`, m.index);
    st = st.slice(0, i) + xml + st.slice(i);
    st = st.slice(0, m.index) + `<${tag} count="${n + 1}"` + st.slice(m.index + m[0].length);
    return n;
  };
  const fmt = (code: string) => {
    const id = Math.max(199, ...[...st.matchAll(/numFmtId="(\d+)"/g)].map(x => +x[1])) + 1;
    agregar('numFmts', `<numFmt numFmtId="${id}" formatCode="${esc(code)}"/>`);
    return id;
  };
  const font = (sz: number, b = false, color = '000000') => agregar('fonts', `<font>${b ? '<b/>' : ''}<sz val="${sz}"/><color rgb="FF${color}"/><name val="${FUENTE_EXCEL}"/><family val="2"/></font>`);
  const fill = (rgb: string) => agregar('fills', `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`);
  const fTit = font(14, true, '0000FF'), fPB = font(18, true), f8 = font(8), f10 = font(10), f10b = font(10, true);
  const amarilloClaro = fill('FFFF99'), amarillo = fill('FFFF00'), gris = fill('C0C0C0'), naranja = fill('FFCC00'), verde = fill('99CC00'), celeste = fill('00CCFF'), lila = fill('CC99FF');
  const fino = agregar('borders', '<border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border>');
  const medio = agregar('borders', '<border><left style="medium"/><right style="medium"/><top style="medium"/><bottom style="medium"/><diagonal/></border>');
  // el formato de la cátedra: dos decimales y los negativos en rojo
  const n2 = fmt('0.00_ ;[Red]\\-0.00\\ '), pc = fmt('0.0%'), n0 = fmt('0');
  const xf = (f: number, fl = 0, b = 0, num = 0, al: { h?: string; wrap?: boolean } = {}) => agregar('cellXfs',
    `<xf numFmtId="${num}" fontId="${f}" fillId="${fl}" borderId="${b}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"${al.h ? ` horizontal="${al.h}"` : ''}${al.wrap ? ' wrapText="1"' : ''}/></xf>`);
  const S: Record<EstiloFlex, number> = {
    tit: xf(fTit, 0, medio, 0, { h: 'center', wrap: true }), pb: xf(fPB, 0, medio, 0, { h: 'center' }),
    banda: xf(f10, gris, fino, 0, { h: 'center' }),
    cab: xf(f8, 0, fino, 0, { h: 'center', wrap: true }), desc: xf(f8, 0, fino, 0, { h: 'center', wrap: true }), unid: xf(f10, 0, fino, 0, { h: 'center' }),
    nro: xf(f10, amarilloClaro, fino, n0, { h: 'right' }), calc: xf(f10, amarilloClaro, fino, n2), clave: xf(f10, amarillo, fino, n2), pct: xf(f10, amarilloClaro, fino, pc),
    dato: xf(f10, 0, fino, n2), res: xf(f10b, amarillo, fino, 0, { h: 'center' }),
    simetrica: xf(f10, naranja, fino), asimetrica: xf(f10, verde, fino), tubo: xf(f10, celeste, fino), portico: xf(f10, lila, fino),
    nota: xf(f10), formula: xf(f10b, 0, 0, 0, { h: 'center' }), lab: xf(f10, 0, fino, 0, { wrap: true }), coef: xf(f10, amarillo, fino, 0, { h: 'right' }),
  };
  const dxfOk = agregar('dxfs', '<dxf><font><b/><color rgb="FF006100"/></font><fill><patternFill patternType="solid"><bgColor rgb="FFC6EFCE"/></patternFill></fill></dxf>');
  const dxfNo = agregar('dxfs', '<dxf><font><b/><color rgb="FF9C0006"/></font><fill><patternFill patternType="solid"><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf>');
  return { st, S, dxfOk, dxfNo };
}

// ------------------------------------------------------------------ armado de la hoja
type Valor = string | number | null;
const COL = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const colN = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

class Armador {
  celdas = new Map<string, [Valor, EstiloFlex]>();
  merges: string[] = [];
  altos = new Map<number, number>();
  cf: string[] = [];
  p(ref: string, v: Valor, e: EstiloFlex) { this.celdas.set(ref, [v, e]); }
  m(desde: string, hasta: string, v: Valor, e: EstiloFlex) {
    const [, c0, f0] = /^([A-Z]+)(\d+)$/.exec(desde)!, [, c1, f1] = /^([A-Z]+)(\d+)$/.exec(hasta)!;
    for (let f = +f0; f <= +f1; f++) for (let c = colN(c0); c <= colN(c1); c++) this.p(`${COL(c)}${f}`, null, e);
    this.p(desde, v, e);
    if (desde !== hasta) this.merges.push(`${desde}:${hasta}`);
  }
  xml(S: Record<EstiloFlex, number>, anchos: number[], dxfOk: number, dxfNo: number): string {
    const filas = new Map<number, [string, Valor, EstiloFlex][]>();
    for (const [r, [v, e]] of this.celdas) { const f = +/\d+$/.exec(r)![0]; if (!filas.has(f)) filas.set(f, []); filas.get(f)!.push([r, v, e]); }
    const out: string[] = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
      '<sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="5" topLeftCell="B6" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="12.75"/><cols>'];
    anchos.forEach((w, i) => out.push(`<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`));
    out.push('</cols><sheetData>');
    for (const f of [...filas.keys()].sort((a, b) => a - b)) {
      const ht = this.altos.get(f);
      out.push(`<row r="${f}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>`);
      for (const [r, v, e] of filas.get(f)!.sort((a, b) => colN(/^[A-Z]+/.exec(a[0])![0]) - colN(/^[A-Z]+/.exec(b[0])![0]))) {
        const s = S[e];
        if (v === null || v === '') out.push(`<c r="${r}" s="${s}"/>`);
        else if (typeof v === 'number') out.push(Number.isFinite(v) ? `<c r="${r}" s="${s}"><v>${v}</v></c>` : `<c r="${r}" s="${s}"/>`);
        else if (v.startsWith('=')) out.push(`<c r="${r}" s="${s}"><f>${esc(v.slice(1))}</f></c>`);
        else out.push(`<c r="${r}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
      }
      out.push('</row>');
    }
    out.push('</sheetData>');
    if (this.merges.length) out.push(`<mergeCells count="${this.merges.length}">${this.merges.map(r => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>`);
    let prio = 1;
    for (const rango of this.cf) {
      const c0 = rango.split(':')[0];
      out.push(`<conditionalFormatting sqref="${rango}">`
        + `<cfRule type="beginsWith" dxfId="${dxfNo}" priority="${prio++}" stopIfTrue="1" operator="beginsWith" text="NO"><formula>LEFT(${c0},2)="NO"</formula></cfRule>`
        + `<cfRule type="beginsWith" dxfId="${dxfOk}" priority="${prio++}" operator="beginsWith" text="VERIFICA"><formula>LEFT(${c0},8)="VERIFICA"</formula></cfRule>`
        + '</conditionalFormatting>');
    }
    out.push('<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" paperSize="9"/></worksheet>');
    return out.join('');
  }
}

/** tipo de pieza como lo escribe la columna naranja (el mismo vocabulario que «Piezas» en la Flex de la cátedra) */
export type TipoFlex = 'simetrica' | 'asimetrica' | 'tubo' | 'portico';
export const tipoFlexDe = (pz: PiezaEquivalente | undefined): TipoFlex =>
  !pz ? 'simetrica' : pz.molde === 'asimétrico' ? 'asimetrica' : pz.molde === 'tubo' ? 'tubo' : pz.molde === 'pórtico' ? 'portico' : 'simetrica';

/**
 * Columnas de la hoja J de cada dato de la sección. «J Tabiques ortogonales» de la planilla 2025 (49 columnas) tiene
 * las asimétricas y los pórticos dos columnas antes que las otras tres hojas J.
 */
function columnasJ(dir: 'A' | 'B', motor: Motor) {
  const corto = dir === 'B' && motor === 'nuevo';
  return {
    hoja: dir === 'A' ? 'J Tabiques paralelos' : 'J Tabiques ortogonales',
    /** asimétrica: alto del ala superior, largo del alma izquierda, alto del ala inferior, distancia al eje neutro, ancho del ala superior y del alma */
    h1: 'X', h2: corto ? 'AA' : 'AB', h4: corto ? 'AG' : 'AI', xn: corto ? 'AI' : 'AK', b1: 'W', b2: 'Z',
    /** pórtico: altura total, ancho del pie superior y superficie de los dos pies */
    Hp: corto ? 'AO' : 'AQ', Bp: corto ? 'AM' : 'AO',
    Ap: corto ? (r: number) => `AM${r}*AN${r}+AR${r}*AS${r}` : (r: number) => `AO${r}*AP${r}+AT${r}*AU${r}`,
  };
}

/** fila de «M,NyQ» de la planta baja */
export function filaPB(asig: Asignacion, p: Proyecto): number {
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  return (asig.filaNivel[iPB] ?? 50) + 4;
}

/** columnas de cada tabla */
const C = {
  nro: 'A', F: 'B', h: 'C', c: 'D', b: 'E', J: 'F', W: 'G', H: 'H', niv: 'I', Ainf: 'J', Pp: 'K', Ng: 'L', Nq: 'M',
  pct: 'N', M: 'O', e: 'P', k: 'Q', sc: 'R', st: 'S', vc: 'T', x: 'U', T: 'V', As: 'W', Asmin: 'X', Ascol: 'Y', res: 'Z', tipo: 'AA',
} as const;
const ULTIMA = C.tipo;
/** primera fila de la tabla del viento A (encabezado en la 3, descripción en la 4, unidades en la 5) */
export const FILA_A = 6;

/** XML de la hoja (null si no hay piezas) */
export function hojaFlexXml(asig: Asignacion, p: Proyecto, motor: Motor, adm: number, S: Record<EstiloFlex, number>, dxfOk: number, dxfNo: number): string | null {
  const nA = asig.datos.jpar.length, nB = asig.datos.jort.length;
  if (!nA && !nB) return null;
  const fPB = filaPB(asig, p);
  const pieza = (dir: 'A' | 'B', i: number) => asig.piezas.find(z => z.dir === dir && z.filaHoja === i);
  // carga de las piezas del viento B (la cátedra no tiene dónde ponerla): la misma altura y niveles que la Flex del viento A
  const flex0 = asig.datos.flex.find(f => f && f.C !== null) ?? { C: 0, G: 0 };
  const h = new Armador();
  const n20 = (n: number) => Math.max(20, n);
  // filas: título, viento A (banda, encabezados, piezas), viento B, coeficientes
  const filaB = FILA_A + n20(nA) + 1;
  const primeraB = filaB + 4;
  const filaCoef = primeraB + n20(nB) + 2;
  const K = { gamma: `$G$${filaCoef + 1}`, g: `$G$${filaCoef + 2}`, q: `$G$${filaCoef + 3}`, adm: `$G$${filaCoef + 4}`, se: `$G$${filaCoef + 5}`, cuantia: `$G$${filaCoef + 6}`, MA: `$G$${filaCoef + 7}`, MB: `$G$${filaCoef + 8}` };

  h.m('A1', 'Y1', 'VERIFICACIÓN A FLEXOCOMPRESIÓN DE TABIQUES O NÚCLEOS DE CONTRAVIENTO EN PLANTA BAJA', 'tit'); h.altos.set(1, 33.75);
  h.m('Z1', `${ULTIMA}1`, 'PB', 'pb');

  const encabezados = (f: number, dir: 'A' | 'B') => {
    const roto = dir === 'A' ? 'Rototrasl. cara mayor' : 'Rototrasl. cara menor', hj = dir === 'A' ? 'J Tabiques paralelos' : 'J Tabiques ortogonales';
    const cab: [string, string, string, string][] = [
      [C.nro, 'Nº DEL TABIQUE', '', ''],
      [C.F, 'SUPERFICIE DE LA PIEZA EN PLANTA', `F (de ${hj})`, 'm2'],
      [C.h, 'ALTURA TOTAL DE LA PIEZA (en el sentido del viento)', 'h', 'm'],
      [C.c, 'DISTANCIA DEL EJE NEUTRO A LA FIBRA MÁS ALEJADA', 'c = h/2 (asim.: al eje neutro)', 'm'],
      [C.b, 'ANCHO DE LA PIEZA EN EL BORDE', 'b (espesor o ala)', 'm'],
      [C.J, 'MOMENTO DE INERCIA DE LA PIEZA', `Jj (de ${roto})`, 'm4'],
      [C.W, 'W  RESISTENTE', 'W = J / c', 'm3'],
      [C.H, 'ALTURA DE TERRAZA A NIVEL CONSID.', dir === 'A' ? 'de Flex comp PB' : 'completar', 'm'],
      [C.niv, 'CANTIDAD DE NIVELES POR ENCIMA', dir === 'A' ? 'de Flex comp PB' : 'completar', ''],
      [C.Ainf, 'AREA DE INFLUENCIA', dir === 'A' ? 'de Flex comp PB' : 'completar', 'm2'],
      [C.Pp, 'PESO DEL TABIQUE O NÚCLEO', 'Pp = F · h · 2,4', 'ton'],
      [C.Ng, 'N  DESCARG. (Ng)', 'Pp + 0,7 · área · niveles', 'ton'],
      [C.Nq, 'N  CARGADO (Nq)', 'Pp + 0,9 · área · niveles', 'ton'],
      [C.pct, '% DEL VIENTO QUE TOMA LA PIEZA', `(E + N) / D5 de ${roto}`, '%'],
      [C.M, 'MOMENTO VOLCADOR QUE TOMA', 'M = % · M en PB', 'tm'],
      [C.e, 'EXCENTR. DEL TABIQUE DESCARG.', 'e = M / Ng', 'm'],
      [C.k, 'LIMITE DEL NUCLEO CENTRAL', 'k = W / F', 'm'],
      [C.sc, 'tensión de compresión cargado', 'σ = −Nq/F − M/W', 'kg / cm2'],
      [C.st, 'tensión en el borde traccionado descargado', 'σ = −Ng/F + M/W', 'kg / cm2'],
      [C.vc, 'COMPRESIÓN', '|σ| ≤ σ adm', ''],
      [C.x, 'LARGO TRACCIONADO', 'x (semejanza de triángulos)', 'm'],
      [C.T, 'FUERZA DE TRACCIÓN', 'T = σ · b · x / 2', 'ton'],
      [C.As, 'ARMADURA POR TRACCIÓN', 'As = T / σe', 'cm2'],
      [C.Asmin, 'ARMADURA MÍNIMA', '0,8 % de F', 'cm2'],
      [C.Ascol, 'ARMADURA A COLOCAR EN CADA BORDE', 'la mayor', 'cm2'],
      [C.res, 'RESULTADO', '', ''],
      [C.tipo, 'Piezas', 'simetrica · asimetrica · tubo · portico', ''],
    ];
    cab.forEach(([c, t, d, u]) => { h.p(`${c}${f}`, t, 'cab'); h.p(`${c}${f + 1}`, d, 'desc'); h.p(`${c}${f + 2}`, u, 'unid'); });
    h.altos.set(f, 45); h.altos.set(f + 1, 24);
  };

  const tabla = (dir: 'A' | 'B', f0: number, n: number) => {
    const { hoja: hj, h1, h2, h4, xn, b1, b2, Hp, Bp, Ap } = columnasJ(dir, motor);
    const roto = dir === 'A' ? 'Rototrasl. cara mayor' : 'Rototrasl. cara menor', MPB = dir === 'A' ? K.MA : K.MB;
    for (let i = 0; i < n20(n); i++) {
      const r = f0 + i, R = (c: string) => `${c}${r}`, fj = filaExcelJ(dir, i, motor), J = (c: string) => `'${hj}'!${c}${fj}`, Ro = (c: string) => `'${roto}'!${c}${5 + i}`;
      const tipo = `${R(C.tipo)}`, pz = i < n ? pieza(dir, i) : undefined, tf = tipoFlexDe(pz);
      const vacia = `${R(C.J)}<0.0001`;
      h.p(R(C.nro), dir === 'A' ? i + 1 : i + 21, 'nro');
      h.p(R(C.F), `=IF(${tipo}="portico",${Ap(fj).replace(/([A-Z]+\d+)/g, `'${hj}'!$1`)},${J('O')})`, 'calc');
      h.p(R(C.h), `=IF(${tipo}="tubo",${J('S')},IF(${tipo}="asimetrica",${J(h1)}+${J(h2)}+${J(h4)},IF(${tipo}="portico",${J(Hp)},${J('P')})))`, 'calc');
      h.p(R(C.c), `=IF(${tipo}="asimetrica",MAX(${J(xn)},${R(C.h)}-${J(xn)}),${R(C.h)}/2)`, 'calc');
      h.p(R(C.b), `=IF(${tipo}="tubo",${J('S')}-${J('T')},IF(${tipo}="asimetrica",IF(${J(h1)}>0.05,${J(b1)},${J(b2)}),IF(${tipo}="portico",${J(Bp)},IF(${J('G')}>0.05,${J('F')},${J('B')}))))`, 'calc');
      h.p(R(C.J), `=${Ro('B')}`, 'calc');
      h.p(R(C.W), `=IF(${R(C.c)}>0,${R(C.J)}/${R(C.c)},0)`, 'calc');
      if (dir === 'A') {
        h.p(R(C.H), `='Flex comp PB paralelos'!C${4 + i}`, 'calc');
        h.p(R(C.niv), `='Flex comp PB paralelos'!G${4 + i}`, 'calc');
        h.p(R(C.Ainf), `='Flex comp PB paralelos'!F${4 + i}`, 'calc');
      } else {
        h.p(R(C.H), pz ? flex0.C ?? 0 : null, 'dato');
        h.p(R(C.niv), pz ? flex0.G ?? 0 : null, 'dato');
        h.p(R(C.Ainf), pz ? Math.round(pz.areaInf * 1e4) / 1e4 : null, 'dato');
      }
      h.p(R(C.Pp), `=${R(C.F)}*${R(C.H)}*${K.gamma}`, 'calc');
      h.p(R(C.Ng), `=${R(C.Pp)}+${R(C.Ainf)}*${R(C.niv)}*${K.g}`, 'calc');
      h.p(R(C.Nq), `=${R(C.Pp)}+${R(C.Ainf)}*${R(C.niv)}*${K.q}`, 'calc');
      h.p(R(C.pct), `=IF('${roto}'!$D$5=0,0,ABS((${Ro('E')}+${Ro('N')})/'${roto}'!$D$5))`, 'pct');
      h.p(R(C.M), `=${R(C.pct)}*ABS(${MPB})`, 'calc');
      h.p(R(C.e), `=IF(${R(C.Ng)}>0,${R(C.M)}/${R(C.Ng)},0)`, 'calc');
      h.p(R(C.k), `=IF(${R(C.F)}>0,${R(C.W)}/${R(C.F)},0)`, 'calc');
      const ok = `${R(C.F)}*${R(C.W)}>0`;
      h.p(R(C.sc), `=IF(${ok},(-${R(C.Nq)}/${R(C.F)}-${R(C.M)}/${R(C.W)})*0.1,0)`, 'clave');
      h.p(R(C.st), `=IF(${ok},(-${R(C.Ng)}/${R(C.F)}+${R(C.M)}/${R(C.W)})*0.1,0)`, 'clave');
      h.p(R(C.vc), `=IF(${vacia},"",IF(ABS(${R(C.sc)})<=${K.adm},"VERIFICA","NO VERIFICA"))`, 'res');
      // tensión del otro borde con el edificio descargado: −Ng/F − M·(h − c)/J
      const otra = `(-${R(C.Ng)}/${R(C.F)}-${R(C.M)}*(${R(C.h)}-${R(C.c)})/${R(C.J)})*0.1`;
      h.p(R(C.x), `=IF(${R(C.st)}<=0,0,IF(${R(C.J)}<=0,0,MIN(${R(C.h)},${R(C.h)}*${R(C.st)}/(${R(C.st)}-${otra}))))`, 'calc');
      h.p(R(C.T), `=${R(C.st)}*10*${R(C.b)}*${R(C.x)}/2`, 'calc');
      h.p(R(C.As), `=${R(C.T)}*1000/${K.se}`, 'calc');
      h.p(R(C.Asmin), `=IF(${vacia},0,${K.cuantia}*${R(C.F)}*10000)`, 'calc');
      h.p(R(C.Ascol), `=MAX(${R(C.As)},${R(C.Asmin)})`, 'clave');
      h.p(R(C.res), `=IF(${vacia},"",IF(${R(C.vc)}="NO VERIFICA","NO VERIFICA",IF(${R(C.As)}>${R(C.Asmin)},"VERIFICA, armar por tracción","VERIFICA, armadura mínima")))`, 'res');
      h.p(R(C.tipo), tf, tf);
    }
    h.cf.push(`${C.vc}${f0}:${C.vc}${f0 + n20(n) - 1}`, `${C.res}${f0}:${C.res}${f0 + n20(n) - 1}`);
  };

  h.m('A2', `${ULTIMA}2`, 'VIENTO A (sobre la cara mayor) · PIEZAS PARALELAS AL VIENTO: J Tabiques paralelos y Rototrasl. cara mayor', 'banda');
  encabezados(3, 'A');
  tabla('A', FILA_A, nA);
  h.m(`A${filaB}`, `${ULTIMA}${filaB}`, 'VIENTO B (sobre la cara menor) · PIEZAS ORTOGONALES: J Tabiques ortogonales y Rototrasl. cara menor', 'banda');
  encabezados(filaB + 1, 'B');
  tabla('B', primeraB, nB);

  // coeficientes, fórmulas y criterio, como las notas al pie de la Flex de la cátedra
  const f = filaCoef;
  h.m(`A${f}`, `H${f}`, 'COEFICIENTES QUE USA LA HOJA (se pueden cambiar)', 'banda');
  const coef: [string, Valor, string][] = [
    ['Peso específico del hormigón armado', 2.4, 't/m3'],
    ['Carga de cada losa sin sobrecarga (descargado)', 0.7, 't/m2'],
    ['Carga de cada losa con sobrecarga (cargado)', 0.9, 't/m2'],
    [`Tensión admisible de compresión del hormigón (σbk del ${p.hormigon || 'H30'})`, adm, 'kg/cm2'],
    ['Tensión del acero', 2400, 'kg/cm2'],
    ['Cuantía mínima de armadura vertical', 0.008, ''],
    [`Momento volcador en PB, viento A (M,NyQ J${fPB})`, `='M,NyQ'!J${fPB}`, 'tm'],
    [`Momento volcador en PB, viento B (M,NyQ O${fPB})`, `='M,NyQ'!O${fPB}`, 'tm'],
  ];
  coef.forEach(([t, v, u], i) => { const r = f + 1 + i; h.m(`A${r}`, `F${r}`, t, 'lab'); h.p(`G${r}`, v, typeof v === 'string' ? 'calc' : 'coef'); h.p(`H${r}`, u, 'unid'); });
  h.p(`J${f + 1}`, 'T=-N/F-M/W', 'formula'); h.p(`L${f + 1}`, 'T=-N/F+M/W', 'formula');
  const notas = [
    'Se verifica en PB, donde el momento del viento y la carga vertical son máximos. Cada pieza es una ménsula empotrada en la fundación.',
    'Compresión: con el edificio CARGADO (Nq). VERIFICA si la tensión de compresión no supera la admisible del hormigón.',
    'Tracción: con el edificio DESCARGADO (Ng). Si la excentricidad e no pasa el límite del núcleo central k, toda la pieza queda comprimida.',
    'Si hay tracción se arma el triángulo traccionado (T = σ · b · x / 2; As = T / σe), en los dos bordes porque el viento cambia de sentido. Nunca menos que la mínima.',
    'Si NO VERIFICA: más superficie y más W (alargar la pieza en el sentido del viento, engrosarla o sumarle alas) o un hormigón de más resistencia.',
    'Completar el tipo de cada pieza en la columna «Piezas» y, en el viento B, la altura, los niveles y el área de influencia.',
  ];
  notas.forEach((t, i) => h.m(`J${f + 2 + i}`, `${ULTIMA}${f + 2 + i}`, t, 'nota'));

  const anchos = [9, 12, 12, 12, 11, 12, 12, 12, 11, 12, 11, 12, 12, 12, 12, 12, 12, 12, 13, 14, 12, 12, 12, 12, 12, 34, 18.29];
  return h.xml(S, anchos, dxfOk, dxfNo);
}
