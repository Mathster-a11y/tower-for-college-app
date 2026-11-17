/**
 * Hoja «Flexocompresión PB»: la verificación de la guía «Edificio en torre» (sección 5), pensada para que el alumno la
 * lea y la use en la planilla de la cátedra sin la app. Una fila por pieza, en el orden de las hojas J, y en cada
 * columna un solo paso, con su fórmula escrita arriba:
 *
 *   N = Pp + losa · área de influencia · n.º de losas     (Pp = A · H · γ)
 *   M = % del viento que toma la pieza (hoja Rototrasl.) · M en PB (hoja M,NyQ)
 *   W = J / c                                             (c = h/2 en un tabique)
 *   σ = −N / A ± M / W                                    (− compresión, + tracción)
 *
 * Compresión con el edificio cargado (Nq) contra σadm; tracción con el edificio descargado (Ng): triángulo traccionado,
 * T = σt · b · x / 2 y As = T / σe, con la cuantía mínima de 0,8 %. Los coeficientes están en celdas amarillas
 * arriba y todas las fórmulas los leen de ahí. Las celdas amarillas de cada pieza son los datos que el alumno completa
 * (la app las llena con su torre); el J y el % se leen de las hojas de la cátedra.
 */
import type { Asignacion, PiezaEquivalente } from '../engine/mapping';
import type { Muro, Proyecto } from '../engine/modelo';
import type { Motor } from '../engine/config';
import { alturaYLosas, datosAlturaDe, partesDePieza } from '../engine/flexocompresion';

export const HOJA_FLEX = 'Flexocompresión PB';

// ------------------------------------------------------------------ estilos (se agregan al final de styles.xml)
export type EstiloFlex = 'tit' | 'sub' | 'secc' | 'grupo' | 'cab' | 'form' | 'lab' | 'paso' | 'nro' | 'dato' | 'datoTxt' | 'datoPct'
  | 'n2' | 'n3' | 'pct' | 'txtC' | 'res' | 'nota';
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** agrega a styles.xml las letras, rellenos, bordes, formatos y estilos de la hoja; devuelve el índice de cada estilo y de los dos formatos condicionales */
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
  const font = (b: boolean, sz: number, color: string, i = false) => agregar('fonts', `<font>${b ? '<b/>' : ''}${i ? '<i/>' : ''}<sz val="${sz}"/><color rgb="FF${color}"/><name val="Arial"/><family val="2"/></font>`);
  const fill = (rgb: string) => agregar('fills', `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`);
  const fTit = font(true, 14, '1F4E79'), fSub = font(false, 10, '404040', true), fBlanca = font(true, 10, 'FFFFFF'), fNeg = font(true, 9, '1F2328'),
    fForm = font(false, 8, '595959', true), fNorm = font(false, 10, '1F2328'), fRes = font(true, 10, '1F2328'), fPaso = font(false, 9, '1F2328');
  const flAzul = fill('1F4E79'), flCeleste = fill('DDEBF7'), flGris = fill('F2F2F2'), flAmarillo = fill('FFFF99'), flVerdoso = fill('F7FBF2');
  const borde = agregar('borders', '<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>');
  const n2 = fmt('0.00'), n3 = fmt('0.000'), pc = fmt('0.0%'), n0 = fmt('0');
  const xf = (f: number, fl = 0, b = 0, num = 0, al: { h?: string; wrap?: boolean } = {}) => agregar('cellXfs',
    `<xf numFmtId="${num}" fontId="${f}" fillId="${fl}" borderId="${b}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"${al.h ? ` horizontal="${al.h}"` : ''}${al.wrap ? ' wrapText="1"' : ''}/></xf>`);
  const S: Record<EstiloFlex, number> = {
    tit: xf(fTit), sub: xf(fSub, 0, 0, 0, { wrap: true }),
    secc: xf(fBlanca, flAzul, borde, 0, { wrap: true }), grupo: xf(fNeg, flCeleste, borde, 0, { h: 'center', wrap: true }),
    cab: xf(fNeg, flGris, borde, 0, { h: 'center', wrap: true }), form: xf(fForm, flGris, borde, 0, { h: 'center', wrap: true }),
    lab: xf(fNorm, 0, borde, 0, { wrap: true }), paso: xf(fPaso, flVerdoso, borde, 0, { wrap: true }),
    nro: xf(fNorm, 0, borde, n0, { h: 'center' }),
    dato: xf(fNorm, flAmarillo, borde, n2), datoTxt: xf(fRes, flAmarillo, borde, 0, { h: 'center' }), datoPct: xf(fNorm, flAmarillo, borde, pc),
    n2: xf(fNorm, 0, borde, n2), n3: xf(fNorm, 0, borde, n3), pct: xf(fNorm, 0, borde, pc), txtC: xf(fNorm, 0, borde, 0, { h: 'center' }),
    res: xf(fRes, 0, borde, 0, { h: 'center', wrap: true }), nota: xf(fPaso, 0, 0, 0, { wrap: true }),
  };
  const dxfOk = agregar('dxfs', '<dxf><font><b/><color rgb="FF006100"/></font><fill><patternFill patternType="solid"><bgColor rgb="FFC6EFCE"/></patternFill></fill></dxf>');
  const dxfNo = agregar('dxfs', '<dxf><font><b/><color rgb="FF9C0006"/></font><fill><patternFill patternType="solid"><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf>');
  return { st, S, dxfOk, dxfNo };
}

// ------------------------------------------------------------------ la hoja
type Valor = string | number | null;
const COL = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const colN = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** columnas de la tabla de piezas (letra → qué es) */
const C = {
  nro: 'A', pieza: 'B', A: 'C', h: 'D', c: 'E', b: 'F', J: 'G', W: 'H', H: 'I', losas: 'J', Ainf: 'K',
  Pp: 'L', Ng: 'M', Nq: 'N', pct: 'O', M: 'P', e: 'Q', k: 'R', trac: 'S', sc: 'T', st: 'U', vc: 'V',
  x: 'W', T: 'X', As: 'Y', Asmin: 'Z', Ascol: 'AA', res: 'AB',
} as const;
const ULTIMA = C.res;
/** celdas de los datos generales */
const G = { gamma: '$G$5', g: '$G$6', q: '$G$7', adm: '$G$8', se: '$G$9', cuantia: '$G$10', MA: '$G$11', MB: '$G$12' } as const;

class Armador {
  celdas = new Map<string, [Valor, EstiloFlex]>();
  merges: string[] = [];
  altos = new Map<number, number>();
  cf: { rango: string; ok: boolean }[] = [];
  p(ref: string, v: Valor, e: EstiloFlex) { this.celdas.set(ref, [v, e]); }
  /** combina un rango y pone el valor en su primera celda (las demás con el mismo estilo, para los bordes) */
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
      '<sheetViews><sheetView workbookViewId="0" zoomScale="90"><pane xSplit="2" topLeftCell="C1" activePane="topRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="14"/><cols>'];
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
    for (const { rango } of this.cf) {
      const c0 = rango.split(':')[0];
      out.push(`<conditionalFormatting sqref="${rango}">`
        + `<cfRule type="beginsWith" dxfId="${dxfNo}" priority="${prio++}" stopIfTrue="1" operator="beginsWith" text="NO"><formula>LEFT(${c0},2)="NO"</formula></cfRule>`
        + `<cfRule type="beginsWith" dxfId="${dxfOk}" priority="${prio++}" operator="beginsWith" text="VERIFICA"><formula>LEFT(${c0},8)="VERIFICA"</formula></cfRule>`
        + '</conditionalFormatting>');
    }
    out.push('<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" paperSize="9" fitToHeight="0"/></worksheet>');
    return out.join('');
  }
}

export interface DatosPiezaFlex {
  nro: number; nombre: string; filaRoto: number;
  A: number; h: number; c: number | null; b: number; H: number; losas: number; Ainf: number;
}

/** datos de cada pieza que van en las celdas amarillas (los mismos que completaría el alumno) */
export function datosFlex(asig: Asignacion, p: Proyecto): { A: DatosPiezaFlex[]; B: DatosPiezaFlex[] } {
  const porId = new Map(p.muros.map(m => [m.id, m]));
  const alt = datosAlturaDe(p);
  const de = (pz: PiezaEquivalente): DatosPiezaFlex => {
    const muros = pz.muros.map(id => porId.get(id)).filter((m): m is Muro => !!m);
    const { partes } = partesDePieza(muros, pz.dir);
    const A = partes.reduce((s, q) => s + q.A, 0);
    const sup = partes.length ? Math.max(...partes.map(q => q.d + q.h / 2)) : 0;
    const inf = partes.length ? Math.max(...partes.map(q => -(q.d - q.h / 2))) : 0;
    const h = sup + inf, cMax = Math.max(sup, inf);
    // ancho de la sección en el borde más alejado (el que se tracciona primero)
    const borde = partes.filter(q => Math.abs((cMax === sup ? q.d + q.h / 2 : -(q.d - q.h / 2)) - cMax) < 1e-6);
    const b = borde.length ? Math.max(...borde.map(q => q.b)) : 0;
    let H = 0, losas = 0;
    for (const m of muros) { const x = alturaYLosas(m, alt); if (x.altura > H) { H = x.altura; losas = x.losas; } }
    return { nro: pz.filaHoja! + 1, nombre: pz.nombre, filaRoto: 5 + pz.filaHoja!, A: r4(A), h: r4(h), c: Math.abs(sup - inf) < 1e-4 ? null : r4(cMax), b: r4(b), H: r4(H), losas, Ainf: r4(pz.areaInf) };
  };
  const lista = (dir: 'A' | 'B') => asig.piezas.filter(z => z.dir === dir && z.filaHoja !== null).sort((a, b) => a.filaHoja! - b.filaHoja!).map(de);
  return { A: lista('A'), B: lista('B') };
}

/** fila de «M,NyQ» de la planta baja */
export function filaPB(asig: Asignacion, p: Proyecto): number {
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  return (asig.filaNivel[iPB] ?? 50) + 4;
}

/** XML de la hoja (null si no hay piezas) */
export function hojaFlexXml(asig: Asignacion, p: Proyecto, _motor: Motor, adm: number, S: Record<EstiloFlex, number>, dxfOk: number, dxfNo: number): string | null {
  const d = datosFlex(asig, p);
  if (!d.A.length && !d.B.length) return null;
  const fPB = filaPB(asig, p);
  const h = new Armador();
  const fin = ULTIMA;

  h.m('A1', `${fin}1`, 'FLEXOCOMPRESIÓN EN PLANTA BAJA · verificación de cada pieza', 'tit'); h.altos.set(1, 24);
  h.m('A2', `${fin}2`, 'Cada pieza trabaja como una ménsula empotrada en la fundación: en PB recibe el mayor momento del viento y la mayor carga vertical. Se verifica con la fórmula de Resistencia de Materiales σ = −N / A ± M / W (guía «Edificio en torre», sección 5). Cada fila es una pieza de las hojas J, en el mismo orden; cada columna es un paso, con su fórmula escrita en la fila gris.', 'sub');
  h.altos.set(2, 42);

  // 1 · datos generales
  h.m('A4', 'H4', '1 · COEFICIENTES (los usa toda la hoja; en amarillo, se pueden cambiar)', 'secc');
  const coef: [string, Valor, string, EstiloFlex][] = [
    ['Peso específico del hormigón armado  γ', 2.4, 't/m³', 'dato'],
    ['Carga de cada losa SIN sobrecarga  g  (edificio descargado)', 0.7, 't/m²', 'dato'],
    ['Carga de cada losa CON sobrecarga  q  (edificio cargado)', 0.9, 't/m²', 'dato'],
    [`Tensión admisible de compresión del hormigón  σadm  (la guía usa σbk: ${p.hormigon || 'H30'} → ${adm})`, adm, 'kg/cm²', 'dato'],
    ['Tensión del acero  σe  (para pasar de fuerza a armadura)', 2400, 'kg/cm²', 'dato'],
    ['Cuantía mínima de armadura vertical (CIRSOC)', 0.008, 'de A', 'datoPct'],
    [`Momento volcador en PB, viento A  (hoja M,NyQ, celda J${fPB})`, `='M,NyQ'!J${fPB}`, 'tm', 'n2'],
    [`Momento volcador en PB, viento B  (hoja M,NyQ, celda O${fPB})`, `='M,NyQ'!O${fPB}`, 'tm', 'n2'],
  ];
  coef.forEach(([t, v, u, e], i) => { const f = 5 + i; h.m(`A${f}`, `F${f}`, t, 'lab'); h.p(`G${f}`, v, e); h.p(`H${f}`, u, 'txtC'); h.altos.set(f, 26); });

  // 2 · pasos
  h.m('J4', `${fin}4`, '2 · CÓMO SE LEE (un paso por grupo de columnas)', 'secc');
  const pasos = [
    '① Cargas verticales. Pp = A · H · γ (peso propio). N = Pp + losa · área de influencia · n.º de losas: sin sobrecarga Ng (con g) y con sobrecarga Nq (con q).',
    '② Momento de la pieza. M = % · M en PB. El % es la parte del viento que toma la pieza en la hoja Rototrasl. (traslación + rotación): (E + N) / D5 de su fila.',
    '③ Módulo resistente. W = J / c, con c = distancia del baricentro a la fibra más alejada (en un tabique rectangular, c = h / 2). El J es el de la hoja J.',
    '④ Tensiones en los bordes. σ = −N / A ± M / W, pasadas a kg/cm² (÷ 10). Negativo = compresión, positivo = tracción.',
    '⑤ Compresión: con el edificio CARGADO (Nq) en el borde comprimido. Verifica si |σ comp| ≤ σadm.',
    '⑥ Tracción: con el edificio DESCARGADO (Ng), cuando el peso menos la frena. Si e = M / Ng ≤ k = W / A (núcleo central), toda la sección queda comprimida y no hay tracción.',
    '⑦ Armadura. Si hay tracción: x = largo traccionado (semejanza de triángulos), T = σt · b · x / 2 y As = T / σe. Se coloca la mayor entre As y la mínima (0,8 % de A), en los dos bordes porque el viento cambia de sentido.',
    'Colores: amarillo = dato de la pieza (completalo o revisalo) · blanco = fórmula · verde / rojo = resultado.',
  ];
  pasos.forEach((t, i) => h.m(`J${5 + i}`, `${fin}${5 + i}`, t, 'paso'));

  // 3 · tablas de piezas
  let f = 14;
  const tabla = (dir: 'A' | 'B', piezas: DatosPiezaFlex[]) => {
    const hojaR = dir === 'A' ? 'Rototrasl. cara mayor' : 'Rototrasl. cara menor', MPB = dir === 'A' ? G.MA : G.MB;
    h.m(`A${f}`, `${fin}${f}`, dir === 'A' ? '3 · VIENTO A (sobre la cara mayor) · piezas de «J Tabiques paralelos» y «Rototrasl. cara mayor»' : '4 · VIENTO B (sobre la cara menor) · piezas de «J Tabiques ortogonales» y «Rototrasl. cara menor»', 'secc');
    h.altos.set(f, 20); f++;
    const grupos: [string, string, string][] = [
      [C.nro, C.pieza, 'Pieza'], [C.A, C.W, '③ Sección'], [C.H, C.Ainf, 'Datos de carga'], [C.Pp, C.Nq, '① Cargas verticales'],
      [C.pct, C.M, '② Momento'], [C.e, C.trac, '⑥ Núcleo central'], [C.sc, C.st, '④ Tensiones en los bordes'],
      [C.vc, C.vc, '⑤ Compresión'], [C.x, C.Ascol, '⑦ Tracción y armadura'], [C.res, C.res, 'Resultado'],
    ];
    grupos.forEach(([a, b, t]) => h.m(`${a}${f}`, `${b}${f}`, t, 'grupo'));
    f++;
    const cab: [string, string, string][] = [
      [C.nro, 'N.º', 'fila en la hoja J'], [C.pieza, 'Pieza', ''],
      [C.A, 'A (m²)', 'área en planta'], [C.h, 'h (m)', 'largo en el sentido del viento'], [C.c, 'c (m)', 'baricentro → fibra más alejada; tabique: h/2'],
      [C.b, 'b (m)', 'ancho en el borde (espesor del tabique)'], [C.J, 'J (m⁴)', `hoja ${hojaR}, col. B`], [C.W, 'W (m³)', 'W = J / c'],
      [C.H, 'H (m)', 'altura sobre PB'], [C.losas, 'Losas', 'n.º de losas que carga'], [C.Ainf, 'Área inf. (m²)', 'área de influencia'],
      [C.Pp, 'Pp (t)', 'Pp = A·H·γ'], [C.Ng, 'Ng (t)', 'Ng = Pp + g·Área·Losas'], [C.Nq, 'Nq (t)', 'Nq = Pp + q·Área·Losas'],
      [C.pct, '% del viento', `(E + N) / D5 en ${hojaR}`], [C.M, 'M (tm)', 'M = % · M en PB'],
      [C.e, 'e (m)', 'e = M / Ng'], [C.k, 'k (m)', 'k = W / A'], [C.trac, '¿Hay tracción?', 'sí, si e > k'],
      [C.sc, 'σ compresión (kg/cm²)', 'cargado: (−Nq/A − M/W) / 10'], [C.st, 'σ tracción (kg/cm²)', 'descargado: (−Ng/A + M/W) / 10'],
      [C.vc, '|σ comp| ≤ σadm', ''],
      [C.x, 'x (m)', 'largo traccionado'], [C.T, 'T (t)', 'T = σt·b·x / 2'], [C.As, 'As (cm²)', 'As = T / σe'],
      [C.Asmin, 'As mín (cm²)', '0,8 % de A'], [C.Ascol, 'As a colocar (cm²)', 'la mayor; en cada borde'], [C.res, '', ''],
    ];
    cab.forEach(([c, t]) => h.p(`${c}${f}`, t, 'cab')); h.altos.set(f, 30); f++;
    cab.forEach(([c, , fo]) => h.p(`${c}${f}`, fo, 'form')); h.altos.set(f, 34); f++;
    const desde = f;
    if (!piezas.length) { h.m(`A${f}`, `${fin}${f}`, 'No hay piezas en este viento.', 'lab'); f++; return; }
    for (const z of piezas) {
      const r = f, R = (c: string) => `${c}${r}`, roto = (c: string) => `'${hojaR}'!${c}${z.filaRoto}`;
      h.p(R(C.nro), z.nro, 'nro'); h.p(R(C.pieza), z.nombre, 'datoTxt');
      h.p(R(C.A), z.A, 'dato'); h.p(R(C.h), z.h, 'dato'); h.p(R(C.c), z.c ?? `=${R(C.h)}/2`, z.c === null ? 'n2' : 'dato'); h.p(R(C.b), z.b, 'dato');
      h.p(R(C.J), `=${roto('B')}`, 'n3'); h.p(R(C.W), `=IF(${R(C.c)}>0,${R(C.J)}/${R(C.c)},0)`, 'n3');
      h.p(R(C.H), z.H, 'dato'); h.p(R(C.losas), z.losas, 'dato'); h.p(R(C.Ainf), z.Ainf, 'dato');
      h.p(R(C.Pp), `=${R(C.A)}*${R(C.H)}*${G.gamma}`, 'n2');
      h.p(R(C.Ng), `=${R(C.Pp)}+${G.g}*${R(C.Ainf)}*${R(C.losas)}`, 'n2');
      h.p(R(C.Nq), `=${R(C.Pp)}+${G.q}*${R(C.Ainf)}*${R(C.losas)}`, 'n2');
      h.p(R(C.pct), `=IF('${hojaR}'!$D$5=0,0,ABS((${roto('E')}+${roto('N')})/'${hojaR}'!$D$5))`, 'pct');
      h.p(R(C.M), `=${R(C.pct)}*ABS(${MPB})`, 'n2');
      h.p(R(C.e), `=IF(${R(C.Ng)}>0,${R(C.M)}/${R(C.Ng)},0)`, 'n3');
      h.p(R(C.k), `=IF(${R(C.A)}>0,${R(C.W)}/${R(C.A)},0)`, 'n3');
      h.p(R(C.trac), `=IF(${R(C.e)}<=${R(C.k)},"no","sí")`, 'txtC');
      const ok = `${R(C.A)}*${R(C.W)}>0`;
      h.p(R(C.sc), `=IF(${ok},(-${R(C.Nq)}/${R(C.A)}-${R(C.M)}/${R(C.W)})/10,0)`, 'n2');
      h.p(R(C.st), `=IF(${ok},(-${R(C.Ng)}/${R(C.A)}+${R(C.M)}/${R(C.W)})/10,0)`, 'n2');
      h.p(R(C.vc), `=IF(ABS(${R(C.sc)})<=${G.adm},"VERIFICA","NO VERIFICA")`, 'res');
      // tensión del otro borde con el edificio descargado (comprimido): −Ng/A − M·(h − c)/J
      const otra = `(-${R(C.Ng)}/${R(C.A)}-${R(C.M)}*(${R(C.h)}-${R(C.c)})/${R(C.J)})/10`;
      h.p(R(C.x), `=IF(${R(C.st)}<=0,0,IF(${R(C.J)}<=0,0,MIN(${R(C.h)},${R(C.h)}*${R(C.st)}/(${R(C.st)}-${otra}))))`, 'n3');
      h.p(R(C.T), `=${R(C.st)}*10*${R(C.b)}*${R(C.x)}/2`, 'n2');
      h.p(R(C.As), `=${R(C.T)}*1000/${G.se}`, 'n2');
      h.p(R(C.Asmin), `=${G.cuantia}*${R(C.A)}*10000`, 'n2');
      h.p(R(C.Ascol), `=MAX(${R(C.As)},${R(C.Asmin)})`, 'n2');
      h.p(R(C.res), `=IF(${R(C.vc)}="NO VERIFICA","NO VERIFICA: mucha compresión",IF(${R(C.As)}>${R(C.Asmin)},"VERIFICA · armar por tracción","VERIFICA · armadura mínima"))`, 'res');
      f++;
    }
    h.cf.push({ rango: `${C.vc}${desde}:${C.vc}${f - 1}`, ok: true }, { rango: `${C.res}${desde}:${C.res}${f - 1}`, ok: true });
    f++;
  };
  tabla('A', d.A);
  tabla('B', d.B);

  h.m(`A${f}`, `${fin}${f}`, '5 · SI NO VERIFICA', 'secc'); f++;
  const notas = [
    'Compresión excesiva (σ comp > σadm): la pieza es chica para la carga. Más área y más W: alargar el tabique en el sentido del viento (W crece con h²), engrosarlo o sumarle alas; o un hormigón de más resistencia.',
    'Mucha tracción (As > mínima): conviene que la pieza cargue más losa (más área de influencia → más N, que comprime) o que sea más larga en el sentido del viento. La guía busca que la tracción sea nula o muy chica.',
    'Para revisar a mano: con e ≤ k la sección queda toda comprimida (no hay tracción) y alcanza la armadura mínima. Compará siempre σ comp con σadm y As con As mín.',
  ];
  notas.forEach(t => { h.m(`A${f}`, `${fin}${f}`, t, 'nota'); h.altos.set(f, 28); f++; });

  const anchos = [6, 10, 8, 8, 9, 8, 9, 9, 8, 7, 9, 9, 9, 9, 10, 10, 8, 8, 9, 12, 12, 13, 8, 8, 9, 9, 11, 42];
  return h.xml(S, anchos, dxfOk, dxfNo);
}
