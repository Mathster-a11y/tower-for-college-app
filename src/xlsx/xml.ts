/**
 * Edición mínima del XML de una hoja de cálculo (SpreadsheetML), sin DOM, para que funcione igual
 * en el navegador y en Node. Solo cambia las celdas pedidas; el resto del archivo (estilos, dibujos,
 * gráficos, validaciones) queda intacto.
 */

export type ValorCelda =
  | { num: number }
  | { str: string }
  | { formula: string }
  | { vacia: true };

const COL = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const COLSTR = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
export const partes = (ref: string) => { const m = /^([A-Z]+)(\d+)$/.exec(ref)!; return { col: COL(m[1]), fila: +m[2] }; };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Corre las referencias relativas de una fórmula (para expandir fórmulas compartidas). */
export function correrFormula(f: string, df: number, dc: number): string {
  let out = '';
  let i = 0;
  while (i < f.length) {
    const ch = f[i];
    if (ch === '"') { const j = f.indexOf('"', i + 1); out += f.slice(i, j + 1); i = j + 1; continue; }
    if (ch === "'") { const j = f.indexOf("'", i + 1); out += f.slice(i, j + 1); i = j + 1; continue; }
    const m = /^(\$?)([A-Z]{1,3})(\$?)(\d+)/.exec(f.slice(i));
    const prev = i > 0 ? f[i - 1] : '';
    if (m && !/[A-Za-z0-9_.]/.test(prev) && f[i + m[0].length] !== '(') {
      const [, ac, c, af, r] = m;
      const nc = ac ? c : COLSTR(COL(c) + dc);
      const nr = af ? r : String(+r + df);
      out += `${ac}${nc}${af}${nr}`;
      i += m[0].length;
      continue;
    }
    // nombres de función o de hoja: copiar la palabra entera
    const w = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(f.slice(i));
    if (w && !m) { out += w[0]; i += w[0].length; continue; }
    out += ch; i++;
  }
  return out;
}

const RE_CELDA = (ref: string) => new RegExp(`<c r="${ref}"(?=[\\s/>])[^>]*?(?:/>|>[\\s\\S]*?</c>)`);

/** Convierte un grupo de fórmula compartida en fórmulas explícitas (necesario antes de pisar la celda madre). */
function expandirCompartida(xml: string, si: string): string {
  const madreRe = new RegExp(`<c r="([A-Z]+\\d+)"[^>]*?><f t="shared" ref="[^"]*" si="${si}">([\\s\\S]*?)</f>`);
  const m = madreRe.exec(xml);
  if (!m) return xml;
  const madre = partes(m[1]);
  const fMadre = unesc(m[2]);
  // madre: f explícita
  xml = xml.replace(new RegExp(`<f t="shared" ref="[^"]*" si="${si}">`), '<f>');
  // hijas
  return xml.replace(new RegExp(`<c r="([A-Z]+\\d+)"([^>]*?)><f t="shared" si="${si}"/>`, 'g'), (_s, ref: string, attrs: string) => {
    const p = partes(ref);
    return `<c r="${ref}"${attrs}><f>${esc(correrFormula(fMadre, p.fila - madre.fila, p.col - madre.col))}</f>`;
  });
}

function nuevaCelda(ref: string, estilo: string, v: ValorCelda): string {
  const s = estilo ? ` s="${estilo}"` : '';
  if ('num' in v) return isFinite(v.num) ? `<c r="${ref}"${s}><v>${v.num}</v></c>` : `<c r="${ref}"${s}/>`;
  if ('str' in v) return `<c r="${ref}"${s} t="inlineStr"><is><t>${esc(v.str)}</t></is></c>`;
  if ('formula' in v) return `<c r="${ref}"${s}><f>${esc(v.formula)}</f></c>`;
  return `<c r="${ref}"${s}/>`;
}

/** Escribe una celda (la crea si no existe). */
export function escribirCelda(xml: string, ref: string, v: ValorCelda): string {
  let m = RE_CELDA(ref).exec(xml);
  if (m) {
    const madre = /<f t="shared" ref="[^"]*" si="(\d+)">/.exec(m[0]);
    if (madre) { xml = expandirCompartida(xml, madre[1]); m = RE_CELDA(ref).exec(xml)!; }
    const estilo = /\ss="(\d+)"/.exec(m[0].slice(0, m[0].indexOf('>') + 1))?.[1] ?? '';
    return xml.slice(0, m.index) + nuevaCelda(ref, estilo, v) + xml.slice(m.index + m[0].length);
  }
  // la celda no existe: buscar o crear la fila y ubicarla en orden
  const { fila, col } = partes(ref);
  const filaRe = new RegExp(`<row r="${fila}"[^>]*?(?:/>|>([\\s\\S]*?)</row>)`);
  const fm = filaRe.exec(xml);
  const celda = nuevaCelda(ref, '', v);
  if (fm) {
    if (fm[0].endsWith('/>')) {
      const abre = fm[0].slice(0, -2) + '>';
      return xml.slice(0, fm.index) + abre + celda + '</row>' + xml.slice(fm.index + fm[0].length);
    }
    const cuerpo = fm[1];
    const celdas = [...cuerpo.matchAll(/<c r="([A-Z]+)\d+"/g)];
    const sig = celdas.find(c => COL(c[1]) > col);
    const inicioCuerpo = fm.index + fm[0].indexOf('>') + 1;
    const pos = sig ? inicioCuerpo + (sig.index ?? 0) : fm.index + fm[0].length - '</row>'.length;
    return xml.slice(0, pos) + celda + xml.slice(pos);
  }
  const filas = [...xml.matchAll(/<row r="(\d+)"/g)];
  const sig = filas.find(f => +f[1] > fila);
  const nueva = `<row r="${fila}">${celda}</row>`;
  if (sig) return xml.slice(0, sig.index) + nueva + xml.slice(sig.index);
  return xml.replace('</sheetData>', nueva + '</sheetData>');
}

/** Lee el valor guardado de una celda (número, texto en línea o texto compartido). */
export function leerCelda(xml: string, ref: string, compartidos: string[]): number | string | null {
  const m = RE_CELDA(ref).exec(xml);
  if (!m) return null;
  const t = /\st="([^"]+)"/.exec(m[0].slice(0, m[0].indexOf('>') + 1))?.[1];
  if (t === 'inlineStr') return unesc(/<t[^>]*>([\s\S]*?)<\/t>/.exec(m[0])?.[1] ?? '');
  const v = /<v>([\s\S]*?)<\/v>/.exec(m[0])?.[1];
  if (v === undefined) return null;
  if (t === 's') return compartidos[+v] ?? null;
  if (t === 'str' || t === 'e') return unesc(v);
  return Number(v);
}

export function leerCompartidos(xml: string | null): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => unesc(t[1])).join(''));
}

/** Borra los resultados guardados de todas las fórmulas de una hoja, para que el programa que abra el archivo
 *  las calcule de nuevo. (La planilla virgen viene de Google Sheets y guarda muchos resultados como texto.) */
export function borrarResultadosGuardados(xml: string): string {
  return xml.replace(/<c ([^>]*?)>(<f[^>]*?(?:\/>|>[\s\S]*?<\/f>))<v>[\s\S]*?<\/v><\/c>/g, (_s, attrs: string, f: string) =>
    `<c ${attrs.replace(/\st="(?:str|e|n|b)"/, '')}>${f}</c>`);
}
