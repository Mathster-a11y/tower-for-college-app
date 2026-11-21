/**
 * Vista previa de la planilla que se exporta: la plantilla de la cátedra con los datos de la torre (el mismo primer
 * paso que la exportación) y cada fórmula calculada con el evaluador de formulas.ts, como la mostraría Excel al abrirla.
 * Devuelve las hojas listas para dibujar: celdas con su texto, su estilo (relleno, letra, alineación), anchos de
 * columna y celdas combinadas.
 */
import type { PlanillaDatos, PlanillaRes } from '../engine/planilla';
import type { Motor } from '../engine/config';
import type { Asignacion } from '../engine/mapping';
import type { Proyecto } from '../engine/modelo';
import { prepararPlanilla } from './planilla';
import { expandirTodas, leerCompartidos, desescaparXml } from './xml';
import { Evaluador, esError, partirRef, type CeldaLibro, type Libro, type Valor } from './formulas';

export interface EstiloVista { fondo?: string; color?: string; negrita?: boolean; cursiva?: boolean; alinear?: string; envolver?: boolean; tam?: number }
export interface CeldaVista {
  texto: string;
  /** dato: lo escribe la app · formula: resultado de una fórmula · texto: fijo de la plantilla */
  tipo: 'dato' | 'formula' | 'texto';
  error?: boolean;
  f?: string;
  estilo: EstiloVista;
}
export interface HojaVista {
  nombre: string;
  filas: number; cols: number;
  /** ancho de cada columna (px, desde la A) y alto de las filas que lo cambian */
  anchos: number[]; altos: Record<number, number>;
  celdas: Map<string, CeldaVista>;
  /** celdas combinadas: la de arriba a la izquierda y cuántas filas y columnas abarca */
  combinadas: Map<string, { filas: number; cols: number }>;
  /** celdas tapadas por una combinada (no se dibujan) */
  tapadas: Set<string>;
}

// ------------------------------------------------------------------ estilos
interface Xf { fondo?: string; fuente: number; formato: number; alinear?: string; envolver?: boolean }
function leerTema(xml: string | null): string[] {
  if (!xml) return [];
  const esquema = /<a:clrScheme[\s\S]*?<\/a:clrScheme>/.exec(xml)?.[0] ?? '';
  const color = (n: string) => { const m = new RegExp(`<a:${n}>([\\s\\S]*?)</a:${n}>`).exec(esquema)?.[1] ?? ''; return '#' + (/srgbClr val="([0-9A-Fa-f]{6})"/.exec(m)?.[1] ?? /lastClr="([0-9A-Fa-f]{6})"/.exec(m)?.[1] ?? '000000'); };
  // orden de Excel: lt1, dk1, lt2, dk2, accent1…6, hlink, folHlink
  return ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map(color);
}
function conTinte(hex: string, tinte: number) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).map(v => Math.round(tinte < 0 ? v * (1 + tinte) : v + (255 - v) * tinte));
  return '#' + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
function colorDe(attrs: string, tema: string[]): string | undefined {
  const rgb = /rgb="([0-9A-Fa-f]{8})"/.exec(attrs)?.[1];
  const tinte = Number(/tint="([-\d.Ee]+)"/.exec(attrs)?.[1] ?? 0);
  if (rgb) return conTinte('#' + rgb.slice(2), tinte);
  const th = /theme="(\d+)"/.exec(attrs)?.[1];
  if (th !== undefined && tema[+th]) return conTinte(tema[+th], tinte);
  const ix = /indexed="(\d+)"/.exec(attrs)?.[1];
  if (ix !== undefined) { const t = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']; return t[+ix % 8]; }
  return undefined;
}
function leerEstilos(xml: string, tema: string[]) {
  const bloque = (n: string) => new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`).exec(xml)?.[1] ?? '';
  const fills = [...bloque('fills').matchAll(/<fill>([\s\S]*?)<\/fill>|<fill\/>/g)].map(m => {
    const p = m[1] ?? '';
    if (!/patternType="solid"/.test(p)) return undefined;
    const fg = /<fgColor([^>]*)\/?>/.exec(p)?.[1] ?? '';
    return colorDe(fg, tema);
  });
  const fonts = [...bloque('fonts').matchAll(/<font>([\s\S]*?)<\/font>|<font\/>/g)].map(m => {
    const f = m[1] ?? '';
    return { negrita: /<b\/>|<b val="(?:1|true)"\/>/.test(f), cursiva: /<i\/>/.test(f), color: colorDe(/<color([^>]*)\/>/.exec(f)?.[1] ?? '', tema), tam: Number(/<sz val="([\d.]+)"/.exec(f)?.[1] ?? 10) };
  });
  const formatos = new Map<number, string>([...bloque('numFmts').matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/g)].map(m => [Number(m[1]), desescaparXml(m[2])]));
  const xfs: Xf[] = [...bloque('cellXfs').matchAll(/<xf ([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g)].map(m => {
    const a = m[1], al = /<alignment([^>]*)\/>/.exec(m[2] ?? '')?.[1] ?? '';
    return { fondo: fills[Number(/fillId="(\d+)"/.exec(a)?.[1] ?? 0)], fuente: Number(/fontId="(\d+)"/.exec(a)?.[1] ?? 0), formato: Number(/numFmtId="(\d+)"/.exec(a)?.[1] ?? 0),
      alinear: /horizontal="(\w+)"/.exec(al)?.[1], envolver: /wrapText="(?:1|true)"/.test(al) };
  });
  // formatos condicionales: relleno y letra de cada dxf
  const dxfs = [...bloque('dxfs').matchAll(/<dxf>([\s\S]*?)<\/dxf>|<dxf\/>/g)].map(m => {
    const d = m[1] ?? '';
    return { fondo: colorDe(/<bgColor([^>]*)\/>/.exec(d)?.[1] ?? '', tema), color: colorDe(/<font>[\s\S]*?<color([^>]*)\/>/.exec(d)?.[1] ?? '', tema), negrita: /<b\/>/.test(d) };
  });
  return { xfs, fonts, formatos, dxfs };
}

// ------------------------------------------------------------------ números
const BASICOS: Record<number, string> = { 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00' };
export function formatear(v: Valor, codigo: string | undefined): string {
  if (v === null) return '';
  if (esError(v)) return v.error;
  if (typeof v === 'boolean') return v ? 'VERDADERO' : 'FALSO';
  if (typeof v === 'string') return v;
  const c = (codigo ?? 'General').split(';')[v < 0 ? 1 : 0] ?? codigo ?? 'General';
  // con sección negativa propia, el signo es el que ella escriba (\- o -), como en Excel
  const usarSigno = !(v < 0 && (codigo ?? '').includes(';')) || /^(?:\[[^\]]*\])*(?:\\-|-)/.test(c);
  if (!c || /^general$/i.test(c.trim()) || !/[0#]/.test(c)) {
    if (Math.abs(v) >= 1e11 || (Math.abs(v) < 1e-9 && v !== 0)) return v.toExponential(4).replace('.', ',');
    return String(Number(v.toPrecision(10))).replace('.', ',');
  }
  const pct = c.includes('%'), exp = /E\+/i.test(c);
  const dec = (/\.([0#]+)/.exec(c)?.[1] ?? '').length;
  const x = pct ? v * 100 : v;
  if (exp) return x.toExponential(dec).replace('.', ',').replace('e', 'E');
  const miles = /#,#|0,0/.test(c);
  let s = Math.abs(x).toFixed(dec);
  let [ent, fr] = s.split('.');
  if (miles) ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  s = ent + (fr ? ',' + fr : '');
  return (x < 0 && usarSigno && Number(s.replace(/\./g, '').replace(',', '.')) !== 0 ? '−' : '') + s + (pct ? ' %' : '');
}

// ------------------------------------------------------------------ hojas
interface Cruda { ref: string; s: number; v?: Valor; f?: string }
function leerHoja(xml: string, compartidos: string[]) {
  const celdas: Cruda[] = [];
  for (const m of xml.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const a = m[1], cuerpo = m[2] ?? '';
    const ref = /r="([A-Z]+\d+)"/.exec(a)?.[1]; if (!ref) continue;
    const s = Number(/\ss="(\d+)"/.exec(' ' + a)?.[1] ?? 0), t = /\st="([^"]+)"/.exec(' ' + a)?.[1];
    const f = /<f[^>]*>([\s\S]*?)<\/f>/.exec(cuerpo)?.[1];
    if (f !== undefined && f !== '') { celdas.push({ ref, s, f: desescaparXml(f) }); continue; }
    let v: Valor = null;
    if (t === 'inlineStr') v = desescaparXml([...cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
    else {
      const raw = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
      if (raw !== undefined) v = t === 's' ? compartidos[+raw] ?? '' : t === 'str' ? desescaparXml(raw) : t === 'b' ? raw === '1' : t === 'e' ? { error: raw } : Number(raw);
    }
    celdas.push({ ref, s, v });
  }
  const anchos: { min: number; max: number; w: number; oculta: boolean }[] = [...xml.matchAll(/<col ([^>]*?)\/>/g)].map(m => ({
    min: Number(/min="(\d+)"/.exec(m[1])?.[1]), max: Number(/max="(\d+)"/.exec(m[1])?.[1]), w: Number(/width="([\d.]+)"/.exec(m[1])?.[1] ?? 9), oculta: /hidden="(?:1|true)"/.test(m[1]) }));
  const anchoBase = Number(/defaultColWidth="([\d.]+)"/.exec(xml)?.[1] ?? /baseColWidth="([\d.]+)"/.exec(xml)?.[1] ?? 9);
  const altos: Record<number, number> = {};
  for (const m of xml.matchAll(/<row ([^>]*?)>/g)) { const r = Number(/r="(\d+)"/.exec(m[1])?.[1]); const ht = /ht="([\d.]+)"/.exec(m[1])?.[1]; if (r && ht && /customHeight="(?:1|true)"/.test(m[1])) altos[r] = Math.round(Number(ht) * 4 / 3); }
  const combinadas = [...xml.matchAll(/<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"\/>/g)].map(m => [m[1], m[2]] as const);
  // formato condicional «empieza con» (el que usan las hojas de la app), en el orden de prioridad
  const condicionales = [...xml.matchAll(/<conditionalFormatting sqref="([^"]+)">([\s\S]*?)<\/conditionalFormatting>/g)].flatMap(m =>
    [...m[2].matchAll(/<cfRule ([^>]*)>/g)].map(r => ({ rangos: m[1].split(/\s+/), tipo: /type="(\w+)"/.exec(r[1])?.[1], texto: desescaparXml(/text="([^"]*)"/.exec(r[1])?.[1] ?? ''), dxf: Number(/dxfId="(\d+)"/.exec(r[1])?.[1] ?? -1), prio: Number(/priority="(\d+)"/.exec(r[1])?.[1] ?? 0) })))
    .filter(r => r.tipo === 'beginsWith' && r.dxf >= 0).sort((a, b) => a.prio - b.prio);
  return { celdas, anchos, anchoBase, altos, combinadas, condicionales };
}

/** la planilla que se exportaría, calculada: las 7 hojas de la cátedra (o las que se pidan) */
export async function vistaPrevia(plantilla: ArrayBuffer | Uint8Array, d: PlanillaDatos, r: PlanillaRes, motor: Motor, extra?: { asig: Asignacion; p: Proyecto }): Promise<HojaVista[]> {
  const { zip, rutas, celdas: escritas } = await prepararPlanilla(plantilla, d, r, motor, extra);
  const compartidos = leerCompartidos(await zip.file('xl/sharedStrings.xml')?.async('string') ?? null);
  const tema = leerTema(await zip.file('xl/theme/theme1.xml')?.async('string') ?? null);
  const est = leerEstilos(await zip.file('xl/styles.xml')!.async('string'), tema);
  const libro: Libro = new Map();
  const crudas = new Map<string, ReturnType<typeof leerHoja>>();
  for (const [nombre, ruta] of Object.entries(rutas)) {
    const f = zip.file(ruta); if (!f) continue;
    const h = leerHoja(expandirTodas(await f.async('string')), compartidos);
    crudas.set(nombre, h);
    libro.set(nombre, new Map(h.celdas.map(c => [c.ref, (c.f !== undefined ? { f: c.f } : { v: c.v ?? null }) as CeldaLibro])));
  }
  const ev = new Evaluador(libro);
  const out: HojaVista[] = [];
  for (const [nombre, h] of crudas) {
    const datos = escritas[nombre] ?? {};
    const celdas = new Map<string, CeldaVista>();
    let filas = 1, cols = 1;
    for (const c of h.celdas) {
      const xf = est.xfs[c.s] ?? est.xfs[0];
      const fu = est.fonts[xf?.fuente ?? 0];
      const estilo: EstiloVista = { fondo: xf?.fondo, color: fu?.color, negrita: fu?.negrita, cursiva: fu?.cursiva, alinear: xf?.alinear, envolver: xf?.envolver, tam: fu?.tam };
      const v = c.f !== undefined ? ev.celda(nombre, c.ref) : c.v ?? null;
      const codigo = est.formatos.get(xf?.formato ?? 0) ?? BASICOS[xf?.formato ?? 0];
      const texto = formatear(v, codigo);
      if (typeof v === 'number' && v < 0 && /;\s*\[(?:Red|Rojo)\]/i.test(codigo ?? '')) estilo.color = '#ff0000';
      const p = partirRef(c.ref);
      const cf = typeof v === 'string' ? h.condicionales.find(r => v.startsWith(r.texto) && r.rangos.some(g => dentro(g, p))) : undefined;
      const dx = cf ? est.dxfs[cf.dxf] : undefined;
      if (dx) Object.assign(estilo, { ...(dx.fondo ? { fondo: dx.fondo } : {}), ...(dx.color ? { color: dx.color } : {}), ...(dx.negrita ? { negrita: true } : {}) });
      if (texto === '' && !estilo.fondo) continue;
      filas = Math.max(filas, p.r); cols = Math.max(cols, p.c);
      celdas.set(c.ref, { texto, tipo: c.ref in datos ? 'dato' : c.f !== undefined ? 'formula' : 'texto', error: esError(v), ...(c.f !== undefined ? { f: c.f } : {}), estilo });
    }
    const anchos = Array.from({ length: cols }, (_, i) => {
      const col = h.anchos.find(a => i + 1 >= a.min && i + 1 <= a.max);
      return col?.oculta ? 0 : Math.round((col?.w ?? h.anchoBase) * 7 + 5);
    });
    const combinadas = new Map<string, { filas: number; cols: number }>(), tapadas = new Set<string>();
    for (const [a, b] of h.combinadas) {
      const p = partirRef(a), q = partirRef(b);
      combinadas.set(a, { filas: q.r - p.r + 1, cols: q.c - p.c + 1 });
      for (let rr = p.r; rr <= q.r; rr++) for (let cc = p.c; cc <= q.c; cc++) if (rr !== p.r || cc !== p.c) tapadas.add(`${colNombre(cc)}${rr}`);
    }
    out.push({ nombre, filas, cols, anchos, altos: h.altos, celdas, combinadas, tapadas });
  }
  return out;
}
/** la celda está en el rango (A1 o A1:B9) */
function dentro(rango: string, p: { r: number; c: number }): boolean {
  const [a, b = a] = rango.split(':'), x = partirRef(a), y = partirRef(b);
  return p.r >= x.r && p.r <= y.r && p.c >= x.c && p.c <= y.c;
}
const colNombre = (n: number) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

/** valores numéricos de todas las fórmulas (para compararlos con LibreOffice): hoja → celda → valor */
export async function valoresFormulas(plantilla: ArrayBuffer | Uint8Array, d: PlanillaDatos, r: PlanillaRes, motor: Motor, extra?: { asig: Asignacion; p: Proyecto }): Promise<Record<string, Record<string, Valor>>> {
  const { zip, rutas } = await prepararPlanilla(plantilla, d, r, motor, extra);
  const compartidos = leerCompartidos(await zip.file('xl/sharedStrings.xml')?.async('string') ?? null);
  const libro: Libro = new Map();
  for (const [nombre, ruta] of Object.entries(rutas)) {
    const f = zip.file(ruta); if (!f) continue;
    const h = leerHoja(expandirTodas(await f.async('string')), compartidos);
    libro.set(nombre, new Map(h.celdas.map(c => [c.ref, (c.f !== undefined ? { f: c.f } : { v: c.v ?? null }) as CeldaLibro])));
  }
  const ev = new Evaluador(libro), out: Record<string, Record<string, Valor>> = {};
  for (const [nombre, h] of libro) { out[nombre] = {}; for (const [ref, c] of h) if (c.f !== undefined) out[nombre][ref] = ev.celda(nombre, ref); }
  return out;
}
