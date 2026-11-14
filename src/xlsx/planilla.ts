/**
 * Escribe y lee la planilla original «Edificios en torre».
 *
 * - Escribe solo celdas de datos de las hojas existentes (viento, M,NyQ, hojas J, rototraslación,
 *   flexocompresión) y la celda «VERIFICA / NO VERIFICA» de M,NyQ. Donde la plantilla tenía a mano los
 *   datos del último piso, vuelve a poner la fórmula original si el último piso cambió.
 * - Agrega una hoja nueva «T3D» con el proyecto de la app (niveles y muros), para poder volver a abrirlo.
 * - Marca el libro para que Excel/LibreOffice recalculen todo al abrirlo.
 */
import { AVISO } from '../autoria';
import JSZip from 'jszip';
import type { PlanillaDatos, PlanillaRes } from '../engine/planilla';
import type { Proyecto } from '../engine/modelo';
import { borrarResultadosGuardados, escribirCelda, leerCelda, leerCompartidos, type ValorCelda } from './xml';
import { ejemploGuia } from '../engine/modelo';
import { proyectoDesdeTablas, tablasProyecto, type Tabla } from './proyectoTablas';
import { leerLibro } from './tablas';

export const HOJAS = {
  viento: 'viento', mnyq: 'M,NyQ', jpar: 'J Tabiques paralelos', jort: 'J Tabiques ortogonales',
  rotA: 'Rototrasl. cara mayor', rotB: 'Rototrasl. cara menor', flex: 'Flex comp PB paralelos', t3d: 'T3D',
};
const COLS_J = ['B', 'C', 'F', 'G', 'J', 'K', 'S', 'T', 'W', 'X', 'Z', 'AB', 'AE', 'AF', 'AH', 'AI', 'AO', 'AP', 'AQ', 'AT', 'AU'] as const;

async function rutasHojas(zip: JSZip): Promise<Record<string, string>> {
  const wb = await zip.file('xl/workbook.xml')!.async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const out: Record<string, string> = {};
  for (const m of wb.matchAll(/<sheet [^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"[^>]*\/>/g)) {
    const t = new RegExp(`Id="${m[2]}"[^>]*?Target="([^"]+)"|Target="([^"]+)"[^>]*?Id="${m[2]}"`).exec(rels);
    const target = (t?.[1] ?? t?.[2] ?? '').replace(/^\/?xl\//, '');
    out[m[1].replace(/&amp;/g, '&')] = 'xl/' + target;
  }
  return out;
}

const num = (x: number | null | undefined): ValorCelda => (x === null || x === undefined ? { vacia: true } : { num: x });

/** Celdas que cambia la app, hoja por hoja (lo que se muestra al alumno antes de confirmar). */
export function celdasAEscribir(d: PlanillaDatos, r: PlanillaRes): Record<string, Record<string, ValorCelda>> {
  const c: Record<string, Record<string, ValorCelda>> = {};
  const v = (c[HOJAS.viento] = {} as Record<string, ValorCelda>);
  const s = d.viento;
  Object.entries({ C4: s.V, D4: s.Kd, E4: s.I, F4: s.zg, G4: s.alfa, I4: s.Kzt, J4: s.G, K4: s.Cpb, L4: s.Cps, O4: s.GCpi })
    .forEach(([ref, x]) => (v[ref] = num(x)));
  s.Z.forEach((z, i) => (v[`B${5 + i}`] = { num: z }));

  const m = (c[HOJAS.mnyq] = {} as Record<string, ValorCelda>);
  for (let k = 1; k < 54; k++) {
    const r = k + 4;
    m[`C${r}`] = d.mnyq.C[k] !== null ? { num: d.mnyq.C[k]! } : { formula: `+B${r - 1}-B${r}` };
    m[`D${r}`] = d.mnyq.D[k] !== null ? { num: d.mnyq.D[k]! } : { formula: `(B${r - 1}-B${r + 1})/2` };
    m[`E${r}`] = d.mnyq.E[k] !== null ? { num: d.mnyq.E[k]! } : { formula: `+E${r - 1}` };
    m[`F${r}`] = d.mnyq.F[k] !== null ? { num: d.mnyq.F[k]! } : { formula: `+F${r - 1}` };
  }
  m.E4 = { num: d.mnyq.E[0] ?? 0 };
  m.F4 = { num: d.mnyq.F[0] ?? 0 };
  m.N80 = num(d.mnyq.b1);
  m.N81 = num(d.mnyq.a1);
  const mn = r.mnyq;
  m.O99 = { str: mn.L99 >= 1.5 && mn.M99 <= mn.N99 ? 'VERIFICA' : 'NO VERIFICA' };

  for (const [hoja, filas] of [[HOJAS.jpar, d.jpar], [HOJAS.jort, d.jort]] as const) {
    const h = (c[hoja] = {} as Record<string, ValorCelda>);
    filas.forEach((f, i) => COLS_J.forEach(col => (h[`${col}${4 + i}`] = num(f[col]))));
  }
  for (const [hoja, H] of [[HOJAS.rotA, d.rotA.H], [HOJAS.rotB, d.rotB.H]] as const) {
    const h = (c[hoja] = {} as Record<string, ValorCelda>);
    H.forEach((x, i) => { if (i < 20 || i >= 26) h[`H${5 + i}`] = num(x); });
  }
  const f = (c[HOJAS.flex] = {} as Record<string, ValorCelda>);
  d.flex.forEach((x, i) => { f[`C${4 + i}`] = num(x.C); f[`F${4 + i}`] = num(x.F); f[`G${4 + i}`] = num(x.G); });
  return c;
}

/** Hoja «T3D»: el proyecto en JSON (en trozos, por el límite de caracteres por celda) y una tabla legible de muros. */
function hojaT3D(p: Proyecto): string {
  const json = JSON.stringify(p);
  const trozos: string[] = [];
  for (let i = 0; i < json.length; i += 30000) trozos.push(json.slice(i, i + 30000));
  const filas: string[] = [];
  const cel = (ref: string, v: string | number) => (typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></is></c>`);
  filas.push(`<row r="1">${cel('A1', `Hoja creada por la app Torre 3D (${AVISO}). No la modifiques a mano: guarda el proyecto (niveles y muros) para volver a abrirlo.`)}</row>`);
  filas.push(`<row r="2">${cel('A2', 'T3D-JSON')}${cel('B2', trozos.length)}</row>`);
  trozos.forEach((t, i) => filas.push(`<row r="${3 + i}">${cel(`A${3 + i}`, t)}</row>`));
  const r0 = 5 + trozos.length;
  const cab = ['Muro', 'Dirección', 'x (m)', 'y (m)', 'Largo (m)', 'Espesor (m)', 'Llega a la fundación', 'Área de influencia (m²)', 'Pieza viento A', 'Pegado a A', 'Pieza viento B', 'Pegado a B'];
  const L = 'ABCDEFGHIJKL';
  filas.push(`<row r="${r0}">${cab.map((h, j) => cel(`${L[j]}${r0}`, h)).join('')}</row>`);
  p.muros.forEach((m, i) => {
    const r = r0 + 1 + i;
    const vals: (string | number)[] = [m.id, m.dir, m.x, m.y, m.largo, m.espesor, m.llega ? 'sí' : 'no', m.areaInf, m.piezaA, m.pegadoA, m.piezaB, m.pegadoB];
    filas.push(`<row r="${r}">${vals.map((v, j) => cel(`${L[j]}${r}`, v)).join('')}</row>`);
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${filas.join('')}</sheetData></worksheet>`;
}

const COLS = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
/** hoja simple con una tabla (encabezados en la fila 1, fija) */
function tablaXml(t: Tabla): string {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cols = `<cols>${t.anchos.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
  const filas = t.filas.map((f, r) => `<row r="${r + 1}">${f.map((v, c) => {
    if (v === null || v === '') return '';
    const ref = `${COLS(c + 1)}${r + 1}`;
    return typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${filas}</sheetData></worksheet>`;
}

async function agregarHoja(zip: JSZip, nombre: string, xml: string, rutas: Record<string, string>) {
  if (rutas[nombre]) { zip.file(rutas[nombre], xml); return; }
  let n = 1;
  while (zip.file(`xl/worksheets/sheet${n}.xml`)) n++;
  const path = `xl/worksheets/sheet${n}.xml`;
  zip.file(path, xml);
  let rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  let id = 1;
  while (rels.includes(`Id="rIdT3D${id}"`)) id++;
  const rid = `rIdT3D${id}`;
  rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/></Relationships>`);
  zip.file('xl/_rels/workbook.xml.rels', rels);
  let wb = await zip.file('xl/workbook.xml')!.async('string');
  const ids = [...wb.matchAll(/sheetId="(\d+)"/g)].map(m => +m[1]);
  wb = wb.replace('</sheets>', `<sheet name="${nombre}" sheetId="${Math.max(0, ...ids) + 1}" r:id="${rid}"/></sheets>`);
  zip.file('xl/workbook.xml', wb);
  let ct = await zip.file('[Content_Types].xml')!.async('string');
  ct = ct.replace('</Types>', `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  zip.file('[Content_Types].xml', ct);
}

export async function escribirPlanilla(plantilla: ArrayBuffer | Uint8Array, d: PlanillaDatos, r: PlanillaRes, p: Proyecto): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(plantilla);
  const rutas = await rutasHojas(zip);
  const celdas = celdasAEscribir(d, r);
  for (const [hoja, cs] of Object.entries(celdas)) {
    const ruta = rutas[hoja];
    if (!ruta) throw new Error(`La planilla no tiene la hoja «${hoja}».`);
    let xml = await zip.file(ruta)!.async('string');
    for (const [ref, v] of Object.entries(cs)) xml = escribirCelda(xml, ref, v);
    zip.file(ruta, xml);
  }
  for (const ruta of Object.values(rutas)) {
    const f = zip.file(ruta);
    if (f) zip.file(ruta, borrarResultadosGuardados(await f.async('string')));
  }
  // la torre completa en tablas legibles (con ellas alcanza para volver a armarla) y el JSON de respaldo
  for (const t of tablasProyecto(p)) await agregarHoja(zip, t.nombre, tablaXml(t), rutas);
  await agregarHoja(zip, HOJAS.t3d, hojaT3D(p), rutas);
  // recalcular todo al abrir y descartar la cadena de cálculo vieja
  let wb = await zip.file('xl/workbook.xml')!.async('string');
  wb = /<calcPr[^>]*\/>/.test(wb) ? wb.replace(/<calcPr([^>]*)\/>/, (_s, a: string) => `<calcPr${a.replace(/\sfullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"/>`) : wb.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  zip.file('xl/workbook.xml', wb);
  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml');
    zip.file('[Content_Types].xml', (await zip.file('[Content_Types].xml')!.async('string')).replace(/<Override PartName="\/xl\/calcChain.xml"[^>]*\/>/, ''));
    zip.file('xl/_rels/workbook.xml.rels', (await zip.file('xl/_rels/workbook.xml.rels')!.async('string')).replace(/<Relationship [^>]*calcChain[^>]*\/>/, ''));
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/**
 * Abre una planilla: si tiene las tablas «T3D …» arma el proyecto con ellas (mandan sobre el JSON, por si se
 * editaron a mano); si solo tiene la hoja «T3D», usa el JSON; si no, devuelve los datos del sitio y los niveles.
 */
export async function leerPlanilla(archivo: ArrayBuffer | Uint8Array): Promise<{ proyecto: Proyecto | null; sitio: Partial<Proyecto['sitio']>; cotas: number[]; avisos: string[] }> {
  const avisos: string[] = [];
  const zip = await JSZip.loadAsync(archivo);
  const rutas = await rutasHojas(zip);
  const comp = leerCompartidos(await zip.file('xl/sharedStrings.xml')?.async('string') ?? null);
  let proyecto: Proyecto | null = null;
  if (rutas[HOJAS.t3d]) {
    const xml = await zip.file(rutas[HOJAS.t3d])!.async('string');
    const n = Number(leerCelda(xml, 'B2', comp)) || 0;
    let json = '';
    for (let i = 0; i < n; i++) json += String(leerCelda(xml, `A${3 + i}`, comp) ?? '');
    try { proyecto = JSON.parse(json) as Proyecto; } catch { proyecto = null; }
  }
  const desdeTablas = proyectoDesdeTablas(await leerLibro(archivo), proyecto ?? ejemploGuia());
  if (desdeTablas) { proyecto = desdeTablas.proyecto; avisos.push(...desdeTablas.avisos); }
  const sitio: Partial<Proyecto['sitio']> = {};
  const cotas: number[] = [];
  if (rutas[HOJAS.viento]) {
    const xml = await zip.file(rutas[HOJAS.viento])!.async('string');
    const g = (ref: string) => { const x = leerCelda(xml, ref, comp); return typeof x === 'number' ? x : Number(String(x ?? '').replace(',', '.')) || undefined; };
    Object.assign(sitio, { V: g('C4'), Kd: g('D4'), I: g('E4'), zg: g('F4'), alfa: g('G4'), Kzt: g('I4'), G: g('J4'), Cpb: g('K4'), Cps: g('L4'), GCpi: g('O4') });
    for (let r = 5; r <= 58; r++) cotas.push(g(`B${r}`) ?? 0);
  }
  return { proyecto, sitio, cotas, avisos };
}
