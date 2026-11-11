/**
 * Lee cualquier libro .xlsx o archivo .csv / .tsv / .txt como tablas de valores (sin fórmulas), y escribe
 * libros .xlsx simples (la tabla de niveles y muros que el alumno puede llenar en Excel).
 */
import JSZip from 'jszip';
import { leerCompartidos, partes } from './xml';

export type Valor = string | number | null;
export interface Hoja {
  nombre: string;
  /** filas[fila][columna], desde A1 (índices 0) */
  filas: Valor[][];
  /** valor por referencia («B5») */
  celda: (ref: string) => Valor;
}

const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function hoja(nombre: string, filas: Valor[][]): Hoja {
  return {
    nombre, filas,
    celda: ref => { const p = partes(ref); return filas[p.fila - 1]?.[p.col - 1] ?? null; },
  };
}

export async function leerLibro(buf: ArrayBuffer | Uint8Array): Promise<Hoja[]> {
  const zip = await JSZip.loadAsync(buf);
  const wb = await zip.file('xl/workbook.xml')?.async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!wb || !rels) throw new Error('El archivo no es un libro de Excel (.xlsx) válido.');
  const comp = leerCompartidos(await zip.file('xl/sharedStrings.xml')?.async('string') ?? null);
  const out: Hoja[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*?>/g)) {
    const nombre = unesc(/name="([^"]+)"/.exec(m[0])?.[1] ?? '');
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    if (!rid) continue;
    const t = new RegExp(`<Relationship\\b[^>]*?Id="${rid}"[^>]*?>`).exec(rels)?.[0];
    const target = /Target="([^"]+)"/.exec(t ?? '')?.[1];
    if (!target) continue;
    const ruta = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const xml = await zip.file(ruta)?.async('string');
    if (!xml) continue;
    const filas: Valor[][] = [];
    for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const { fila, col } = partes(c[1]);
      const tipo = /\st="([^"]+)"/.exec(c[2])?.[1];
      const cuerpo = c[3] ?? '';
      let v: Valor = null;
      if (tipo === 'inlineStr') v = unesc([...cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
      else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
        if (raw !== undefined) {
          if (tipo === 's') v = comp[+raw] ?? null;
          else if (tipo === 'str' || tipo === 'e') v = unesc(raw);
          else if (tipo === 'b') v = raw === '1' ? 1 : 0;
          else { const x = Number(raw); v = isFinite(x) ? x : unesc(raw); }
        }
      }
      if (v === null || v === '') continue;
      (filas[fila - 1] ??= [])[col - 1] = v;
    }
    for (let i = 0; i < filas.length; i++) filas[i] ??= [];
    out.push(hoja(nombre, filas));
  }
  return out;
}

/** CSV con «,» «;» o tabulador (lo que más aparezca en la primera línea); respeta comillas. */
export function leerTexto(texto: string, nombre = 'tabla'): Hoja[] {
  const lineas = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const primera = lineas.find(l => l.trim()) ?? '';
  const cuenta = (ch: string) => primera.split(ch).length - 1;
  const sep = ['\t', ';', ','].sort((a, b) => cuenta(b) - cuenta(a))[0];
  const filas: Valor[][] = [];
  for (const l of lineas) {
    if (!l.trim()) { filas.push([]); continue; }
    const celdas: string[] = [];
    let actual = '', comillas = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (comillas) { if (ch === '"' && l[i + 1] === '"') { actual += '"'; i++; } else if (ch === '"') comillas = false; else actual += ch; }
      else if (ch === '"') comillas = true;
      else if (ch === sep) { celdas.push(actual); actual = ''; }
      else actual += ch;
    }
    celdas.push(actual);
    filas.push(celdas.map(c => { const t = c.trim(); if (!t) return null; const x = Number(sep !== ',' ? t.replace(',', '.') : t); return isFinite(x) && /^[-+]?[\d.,]+(e[-+]?\d+)?$/i.test(t) ? x : t; }));
  }
  while (filas.length && !filas[filas.length - 1].length) filas.pop();
  return [hoja(nombre, filas)];
}

const COLSTR = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

/** Libro .xlsx mínimo con varias hojas de valores; la primera fila de cada hoja va en negrita y fija. */
export async function escribirLibro(hojas: { nombre: string; filas: Valor[][]; anchos?: number[] }[]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF0"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`);
  hojas.forEach((h, i) => {
    const cols = h.anchos ? `<cols>${h.anchos.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const filas = h.filas.map((f, r) => `<row r="${r + 1}">${f.map((v, c) => {
      if (v === null || v === '') return '';
      const ref = `${COLSTR(c + 1)}${r + 1}`;
      const s = r === 0 ? ' s="1"' : '';
      return typeof v === 'number' ? `<c r="${ref}"${s}><v>${v}</v></c>` : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${filas}</sheetData></worksheet>`);
  });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
