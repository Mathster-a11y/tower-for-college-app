/**
 * Agregar filas de piezas a la planilla de la cátedra 2025 (más de 20 piezas por viento) sin cambiar sus relaciones.
 *
 * Insertar k filas en la fila r de una hoja hace lo mismo que «Insertar filas» de Excel:
 *  - corre hacia abajo las filas ≥ r y todo lo que apunta a ellas: fórmulas de todas las hojas, celdas combinadas,
 *    formato condicional, comentarios, dibujos y objetos anclados, gráficos y nombres definidos;
 *  - los rangos de las fórmulas que terminan justo en la fila r − 1 (las sumas de cada bloque: SUM(AY4:AY31),
 *    SUM(B5:B24), SUM(M5:M50)…) se estiran para incluir las filas nuevas.
 * Después cada fila nueva recibe las fórmulas del bloque (las mismas que la fila de arriba) y su vínculo con la fila
 * nueva de la otra hoja (la pieza 21 de «Rototrasl. cara mayor» lee la fila 32 de «J Tabiques paralelos», etc.).
 * Ninguna fórmula existente cambia de sentido: solo se corren las referencias, como haría Excel.
 */
import JSZip from 'jszip';
import { correrFormula, desescaparXml, escaparXml, expandirTodas, nuevaCelda, type ValorCelda } from './xml';
import type { TipoFila } from '../engine/planilla';

export interface Insercion { hoja: string; r: number; k: number }

const COLN = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const RE_REF = /^(?:('(?:[^']|'')+'|\[\d+\][A-Za-z_][A-Za-z0-9_.]*|[A-Za-z_][A-Za-z0-9_.]*)!)?(\$?)([A-Z]{1,3})(\$?)(\d+)(?::(\$?)([A-Z]{1,3})(\$?)(\d+))?/;

/** Corre las referencias de una fórmula que apuntan a la hoja de la inserción (propia = hoja donde está la fórmula). */
export function ajustarFormula(f: string, propia: string, ins: Insercion, estirar = true): string {
  let out = '', i = 0;
  while (i < f.length) {
    const ch = f[i];
    if (ch === '"') { const j = f.indexOf('"', i + 1); const fin = j < 0 ? f.length : j + 1; out += f.slice(i, fin); i = fin; continue; }
    const prev = i > 0 ? f[i - 1] : '';
    const m = /[A-Za-z0-9_.$']/.test(prev) ? null : RE_REF.exec(f.slice(i));
    if (m && f[i + m[0].length] !== '(' && !(m[1] === undefined && /[A-Za-z0-9_]/.test(f[i + m[0].length] ?? ''))) {
      const pref = m[1];
      const hoja = pref === undefined ? propia : pref.startsWith("'") ? pref.slice(1, -1).replace(/''/g, "'") : pref;
      if (hoja === ins.hoja) {
        const a = +m[5], b = m[9] !== undefined ? +m[9] : null;
        const a1 = a >= ins.r ? a + ins.k : a;
        const sheet = pref === undefined ? '' : `${pref}!`;
        if (b === null) out += `${sheet}${m[2]}${m[3]}${m[4]}${a1}`;
        else {
          const b1 = b >= ins.r ? b + ins.k : estirar && b === ins.r - 1 && a < ins.r ? b + ins.k : b;
          out += `${sheet}${m[2]}${m[3]}${m[4]}${a1}:${m[6]}${m[7]}${m[8]}${b1}`;
        }
      } else out += m[0];
      i += m[0].length;
      continue;
    }
    const w = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(f.slice(i));
    if (w) { out += w[0]; i += w[0].length; continue; }
    out += ch; i++;
  }
  return out;
}

/** Corre una lista de rangos «A1:B2 C3» (celdas combinadas, formato condicional…), sin estirar. */
function ajustarRangos(v: string, ins: Insercion): string {
  return v.replace(/(\$?[A-Z]{1,3}\$?)(\d+)/g, (_s, c: string, r: string) => `${c}${+r >= ins.r ? +r + ins.k : +r}`);
}
const fila0 = (n: number, ins: Insercion) => (n + 1 >= ins.r ? n + ins.k : n);          // filas que empiezan en 0 (dibujos)

/** fórmulas de todas las etiquetas <f> de una hoja */
const enFormulas = (xml: string, f: (x: string) => string) =>
  xml.replace(/<f([^>]*)>([\s\S]*?)<\/f>/g, (_s, at: string, cuerpo: string) => `<f${at}>${escaparXml(f(desescaparXml(cuerpo)))}</f>`);

async function relaciones(zip: JSZip, ruta: string): Promise<string[]> {
  const dir = ruta.replace(/[^/]+$/, ''), nombre = ruta.slice(dir.length);
  const rels = await zip.file(`${dir}_rels/${nombre}.rels`)?.async('string');
  if (!rels) return [];
  return [...rels.matchAll(/Target="([^"]+)"/g)].map(m => {
    const partes = (dir + m[1]).split('/'), r: string[] = [];
    partes.forEach(p => { if (p === '..') r.pop(); else if (p !== '.') r.push(p); });
    return r.join('/');
  });
}

/** Inserta k filas vacías en la fila r de la hoja, corriendo todo lo que está debajo y todo lo que apunta allí. */
export async function insertarFilas(zip: JSZip, rutas: Record<string, string>, ins: Insercion): Promise<void> {
  if (ins.k <= 0) return;
  const ruta = rutas[ins.hoja];
  if (!ruta) throw new Error(`La planilla no tiene la hoja «${ins.hoja}».`);
  // fórmulas de todas las hojas que apuntan a la hoja
  for (const [nombre, r] of Object.entries(rutas)) {
    const f = zip.file(r);
    if (!f) continue;
    let xml = expandirTodas(await f.async('string'));
    xml = enFormulas(xml, x => ajustarFormula(x, nombre, ins));
    if (r === ruta) {
      xml = xml.replace(/<row r="(\d+)"/g, (_s, n: string) => `<row r="${+n >= ins.r ? +n + ins.k : n}"`);
      xml = xml.replace(/<c r="([A-Z]+)(\d+)"/g, (_s, c: string, n: string) => `<c r="${c}${+n >= ins.r ? +n + ins.k : n}"`);
      xml = xml.replace(/(\s(?:ref|sqref|activeCell|topLeftCell)=")([^"]*)(")/g, (_s, a: string, v: string, b: string) => a + ajustarRangos(v, ins) + b);
      xml = xml.replace(/<xdr:row>(\d+)<\/xdr:row>/g, (_s, n: string) => `<xdr:row>${fila0(+n, ins)}</xdr:row>`);
    }
    zip.file(r, xml);
  }
  // dibujos, comentarios y gráficos de la hoja
  for (const r of await relaciones(zip, ruta)) {
    const f = zip.file(r);
    if (!f || !/\.(xml|vml)$/.test(r)) continue;
    let xml = await f.async('string');
    if (/comments\d*\.xml$/.test(r)) xml = xml.replace(/(<comment ref=")([^"]+)(")/g, (_s, a: string, v: string, b: string) => a + ajustarRangos(v, ins) + b);
    else if (r.endsWith('.vml')) {
      xml = xml.replace(/<x:Row>(\d+)<\/x:Row>/g, (_s, n: string) => `<x:Row>${fila0(+n, ins)}</x:Row>`);
      xml = xml.replace(/<x:Anchor>([^<]*)<\/x:Anchor>/g, (_s, v: string) => {
        const p = v.split(',').map(x => x.trim());
        if (p.length === 8) { p[2] = String(fila0(+p[2], ins)); p[6] = String(fila0(+p[6], ins)); }
        return `<x:Anchor>${p.join(', ')}</x:Anchor>`;
      });
    } else xml = xml.replace(/<xdr:row>(\d+)<\/xdr:row>/g, (_s, n: string) => `<xdr:row>${fila0(+n, ins)}</xdr:row>`);
    zip.file(r, xml);
  }
  // gráficos (de cualquier hoja) y nombres definidos que apuntan a la hoja
  for (const r of Object.keys(zip.files).filter(x => /^xl\/charts\/chart\d+\.xml$/.test(x))) {
    const xml = await zip.file(r)!.async('string');
    zip.file(r, xml.replace(/<c:f>([\s\S]*?)<\/c:f>/g, (_s, v: string) => `<c:f>${escaparXml(ajustarFormula(desescaparXml(v), '', ins))}</c:f>`));
  }
  const wb = await zip.file('xl/workbook.xml')!.async('string');
  zip.file('xl/workbook.xml', wb.replace(/(<definedName[^>]*>)([\s\S]*?)(<\/definedName>)/g, (_s, a: string, v: string, b: string) => a + escaparXml(ajustarFormula(desescaparXml(v), '', ins)) + b));
}

/**
 * Crea la fila «hasta» copiando la fila «desde» (estilos, fórmulas corridas y valores) y pisando las celdas de «cambiar».
 * La columna A (número de pieza) sigue la numeración.
 */
export function crearFila(xml: string, desde: number, hasta: number, cambiar: Record<string, ValorCelda> = {}): string {
  const fm = new RegExp(`<row r="${desde}"([^>]*?)(?:/>|>([\\s\\S]*?)</row>)`).exec(xml);
  const atributos = (fm?.[1] ?? '').replace(/\sspans="[^"]*"/, '');
  const celdas = new Map<string, string>();
  for (const c of (fm?.[2] ?? '').matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, col, at, cuerpo = ''] = c;
    const ref = `${col}${hasta}`;
    const estilo = /\ss="(\d+)"/.exec(at)?.[1] ?? '';
    if (col in cambiar) continue;
    const f = /<f[^>]*>([\s\S]*?)<\/f>/.exec(cuerpo);
    if (f) { celdas.set(col, nuevaCelda(ref, estilo, { formula: correrFormula(desescaparXml(f[1]), hasta - desde, 0) })); continue; }
    const v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
    if (col === 'A' && v !== undefined && !/\st="/.test(at) && isFinite(+v)) { celdas.set(col, nuevaCelda(ref, estilo, { num: +v + hasta - desde })); continue; }
    celdas.set(col, `<c r="${ref}"${at}>${cuerpo}</c>`.replace(/<c r="[^"]*"([^>]*?)><\/c>/, `<c r="${ref}"$1/>`));
  }
  for (const [col, v] of Object.entries(cambiar)) {
    const est = new RegExp(`<c r="${col}${desde}"[^>]*?\\ss="(\\d+)"`).exec(fm?.[2] ?? '')?.[1] ?? '';
    celdas.set(col, nuevaCelda(`${col}${hasta}`, est, v));
  }
  const fila = `<row r="${hasta}"${atributos}>${[...celdas.entries()].sort((a, b) => COLN(a[0]) - COLN(b[0])).map(x => x[1]).join('')}</row>`;
  const sig = [...xml.matchAll(/<row r="(\d+)"/g)].find(m => +m[1] > hasta);
  return sig ? xml.slice(0, sig.index) + fila + xml.slice(sig.index) : xml.replace('</sheetData>', fila + '</sheetData>');
}

const JP = 'J Tabiques paralelos', JO = 'J Tabiques ortogonales', RA = 'Rototrasl. cara mayor', RB = 'Rototrasl. cara menor', FX = 'Flex comp PB paralelos';
const q = (h: string) => `'${h}'`;

/**
 * Agrega a la planilla 2025 las filas de las piezas 21 en adelante.
 * @param eA piezas de más en el viento A («J Tabiques paralelos», bloque de paralelas de cara mayor, bloque de
 *           perpendiculares de cara menor y «Flex comp PB paralelos»)
 * @param eB piezas de más en el viento B («J Tabiques ortogonales» y los otros dos bloques)
 * @param tiposFlex módulo que lee cada fila nueva de Flex (según el tipo de la pieza)
 */
export async function agregarFilasPiezas(zip: JSZip, rutas: Record<string, string>, eA: number, eB: number, tiposFlex: TipoFila[] = []): Promise<void> {
  if (eA <= 0 && eB <= 0) return;
  // 1. huecos (como «Insertar filas» de Excel)
  await insertarFilas(zip, rutas, { hoja: JP, r: 32, k: eA });
  await insertarFilas(zip, rutas, { hoja: JO, r: 24, k: eB });
  await insertarFilas(zip, rutas, { hoja: RA, r: 25, k: eA });
  await insertarFilas(zip, rutas, { hoja: RA, r: 51 + eA, k: eB });
  await insertarFilas(zip, rutas, { hoja: RB, r: 25, k: eB });
  await insertarFilas(zip, rutas, { hoja: RB, r: 51 + eB, k: eA });
  await insertarFilas(zip, rutas, { hoja: FX, r: 24, k: eA });
  // 2. fórmulas de las filas nuevas
  const editar = async (hoja: string, f: (xml: string) => string) => { const r = rutas[hoja]; zip.file(r, f(await zip.file(r)!.async('string'))); };
  const filaJP = (i: number) => 12 + i, filaJO = (j: number) => 4 + j;          // pieza i (desde 0) → fila de la hoja J
  await editar(JP, x => { for (let k = 0; k < eA; k++) x = crearFila(x, 31, 32 + k); return x; });
  await editar(JO, x => { for (let k = 0; k < eB; k++) x = crearFila(x, 22, 24 + k); return x; });   // la 23 suma U: se copia la 22
  // rototraslación: nP paralelas (filas 5…), sumas en 5 + nP, perpendiculares desde 31 + (nP − 20), sumas abajo
  const roto = (hoja: string, nP: number, nO: number, linkP: (i: number) => string, linkO: (j: number) => string) => editar(hoja, x => {
    const sP = 5 + nP, sO = 31 + (nP - 20) + nO, j38 = 38 + (nP - 20);
    for (let i = 20; i < nP; i++) {
      const f = 5 + i;
      x = crearFila(x, 24, f, { B: { formula: linkP(i) }, C: { formula: `B${f}/B${sP}` }, E: { formula: `C${f}*D5` }, G: { formula: `C${f}*F5` }, I: { formula: `B${f}*H${f}` },
        K: { formula: `H${f}-J7` }, L: { formula: `B${f}*K${f}` }, M: { formula: `B${f}*K${f}*K${f}` }, N: { formula: `-J15/M${sO}*L${f}` }, O: { formula: `G${f}+N${f}` } });
    }
    const f50 = 50 + (nP - 20);
    for (let j = 20; j < nO; j++) {
      const f = 31 + (nP - 20) + j;
      x = crearFila(x, f50, f, { B: { formula: linkO(j) }, C: { formula: `B${f}/B${sO}` }, I: { formula: `B${f}*H${f}` }, K: { formula: `H${f}-J${j38}` },
        L: { formula: `B${f}*K${f}` }, M: { formula: `B${f}*K${f}*K${f}` }, N: { formula: `-J15/M${sO}*L${f}` }, O: { formula: `N${f}` } });
    }
    return x;
  });
  await roto(RA, 20 + eA, 20 + eB, i => `${q(JP)}!AY${filaJP(i)}`, j => `${q(JO)}!AY${filaJO(j)}`);
  await roto(RB, 20 + eB, 20 + eA, i => `${q(JO)}!AY${filaJO(i)}`, j => `${q(JP)}!AY${filaJP(j)}`);
  // flexocompresión: área y módulo de la fila de su pieza, momento de su fila de rototraslación
  await editar(FX, x => {
    for (let i = 20; i < 20 + eA; i++) {
      const f = 4 + i, jr = filaJP(i), tipo = tiposFlex[i - 20] ?? 'simétrica';
      const W = `${q(JP)}!${tipo === 'asimétrica' ? 'AN' : tipo === 'circular' ? 'V' : 'Q'}${jr}`;
      x = crearFila(x, 23, f, {
        B: { formula: `${q(JP)}!O${jr}` }, D: { formula: `B${f}*C${f}` }, E: { formula: `D${f}*2.4` }, H: { formula: `E${f}+F${f}*G${f}*0.7` }, I: { formula: `E${f}+F${f}*G${f}*0.9` },
        J: { formula: `${q(RA)}!O${5 + i}` }, K: { formula: `J${f}/H${f}` }, L: { formula: `J${f}/I${f}` }, M: { formula: `${W}/${q(JP)}!O${jr}` }, N: { formula: `M${f}-K${f}` },
        O: { formula: `(-H${f}/B${f}-J${f}/${W})*0.1` }, P: { formula: `(-I${f}/B${f}+J${f}/${W})*0.1` },
        Q: { str: tipo === 'asimétrica' ? 'asimetrica' : tipo === 'circular' ? 'columnas circulares' : 'simetrica' },
      });
    }
    return x;
  });
}
