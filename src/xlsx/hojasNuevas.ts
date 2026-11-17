/**
 * Hojas que la app agrega a la planilla, después de las 7 de la cátedra (no cambian ninguna de ellas):
 *  - «Elementos especiales»: oblicuos, curvos, calados con corte y cualquier pieza clasificada a mano como especial.
 *    La hoja J de la cátedra lleva su rectángulo equivalente (mismo J y misma área); acá va su sección real, su
 *    geometría, el W real (fibra extrema) y el control de que el J que lee la planilla es el de la sección.
 */
import type { Asignacion, PiezaEquivalente } from '../engine/mapping';
import type { PlanillaRes } from '../engine/planilla';
import { filaExcelJ } from '../engine/planilla';
import { partesDePieza } from '../engine/flexocompresion';
import { tipoDe, type Muro, type Proyecto } from '../engine/modelo';
import type { Motor } from '../engine/config';

export type CeldaN = string | number | null | { f: string };
export interface HojaNueva { nombre: string; filas: CeldaN[][]; anchos: number[] }

const COL = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** XML de una hoja con textos, números y fórmulas (sin estilos propios) */
export function hojaXml(h: HojaNueva): string {
  const cols = `<cols>${h.anchos.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
  const filas = h.filas.map((f, r) => `<row r="${r + 1}">${f.map((v, c) => {
    if (v === null || v === '') return '';
    const ref = `${COL(c + 1)}${r + 1}`;
    if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : '';
    if (typeof v === 'object') return `<c r="${ref}"><f>${esc(v.f)}</f></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${filas}</sheetData></worksheet>`;
}

/** celda del J total de una pieza en su hoja J (AY; en ortogonales de la planilla 2025 de 49 columnas, AW) */
export function refJ(pz: PiezaEquivalente, motor: Motor): string {
  const hoja = pz.dir === 'A' ? 'J Tabiques paralelos' : 'J Tabiques ortogonales';
  const col = pz.dir === 'B' && motor === 'nuevo' ? 'AW' : 'AY';
  return `'${hoja}'!${col}${filaExcelJ(pz.dir, pz.filaHoja!, motor)}`;
}

/** fibras extremas de la sección en el sentido del viento, desde su baricentro (m): arriba y abajo */
export function fibrasExtremas(muros: Muro[], dir: 'A' | 'B'): { cSup: number; cInf: number } {
  const { partes } = partesDePieza(muros, dir);
  if (!partes.length) return { cSup: 0, cInf: 0 };
  return { cSup: Math.max(...partes.map(q => q.d + q.h / 2)), cInf: Math.max(...partes.map(q => -(q.d - q.h / 2))) };
}

const TIPO: Record<string, string> = { tabique: 'tabique', 'tubo-rect': 'tubo rectangular', 'tubo-circ': 'tubo circular', perfil: 'perfil (oblicuo o curvo)' };

/** hoja «Elementos especiales» (null si no hay ninguno) */
export function hojaEspeciales(asig: Asignacion, _r: PlanillaRes, p: Proyecto, motor: Motor): HojaNueva | null {
  const esp = asig.piezas.filter(z => z.especial && z.filaHoja !== null);
  if (!esp.length) return null;
  const porId = new Map(p.muros.map(m => [m.id, m]));
  const filas: CeldaN[][] = [
    ['ELEMENTOS ESPECIALES (oblicuos, curvos, calados y piezas clasificadas a mano como especiales)'],
    ['La hoja J de la cátedra lleva el rectángulo equivalente de cada uno (mismo J y misma área que la sección real). Acá va la sección real: su J, su baricentro, sus fibras extremas y su W real. La columna «J en la hoja J» lee el J de la planilla y «Diferencia» lo controla.'],
    [],
    ['Pieza', 'Viento', 'Fila hoja J', 'Muros', 'Tipo', 'Área real (m²)', 'J real (m⁴)', 'x baricentro (m)', 'y baricentro (m)', 'Posición H (m)', 'c arriba (m)', 'c abajo (m)', 'W real = J / c máx (m³)', 'b equivalente (m)', 'h equivalente (m)', 'J equivalente = b·h³/12 (m⁴)', 'Área equivalente = b·h (m²)', 'J en la hoja J (m⁴)', 'Diferencia (m⁴)'],
  ];
  esp.forEach(pz => {
    const r = filas.length + 1, e = pz.especial!;
    const muros = pz.muros.map(id => porId.get(id)).filter((m): m is Muro => !!m);
    const { cSup, cInf } = fibrasExtremas(muros, pz.dir);
    filas.push([pz.nombre, pz.dir, filaExcelJ(pz.dir, pz.filaHoja!, motor), pz.muros.join(' '), e.tipos.join(', '),
      r4(e.A), e.J, e.xg, e.yg, pz.posicion, r4(cSup), r4(cInf), { f: `G${r}/MAX(K${r},L${r})` },
      e.b, e.h, { f: `N${r}*POWER(O${r},3)/12` }, { f: `N${r}*O${r}` }, { f: refJ(pz, motor) }, { f: `R${r}-G${r}` }]);
  });
  // geometría de cada elemento
  filas.push([], ['GEOMETRÍA'], ['Pieza', 'Muro', 'Tipo', 'Dir.', 'x (m)', 'y (m)', 'Largo (m)', 'Espesor (m)', 'Aberturas', 'Calado (J)', 'Contorno (vértices x;y, desde el baricentro del muro)']);
  esp.forEach(pz => pz.muros.forEach(id => {
    const m = porId.get(id); if (!m) return;
    const ab = m.aberturas?.length ? m.aberturas.map(a => `${a.ancho}×${a.alto} desde ${a.desde}`).join('; ') : '';
    const cont = m.perfil ? m.perfil.v.map(v => `${r4(v.x)};${r4(v.y)}${v.b ? ` (arco ${r4(v.b)})` : ''}${v.c1 ? ' (Bézier)' : ''}`).join(' · ') : '';
    filas.push([pz.nombre, m.id, TIPO[tipoDe(m)] ?? tipoDe(m), m.dir, m.x, m.y, m.largo, m.espesor, ab, m.aberturas?.length ? m.caladoJ ?? 'entero' : '', cont]);
  }));
  return { nombre: 'Elementos especiales', filas, anchos: [10, 7, 9, 22, 20, 11, 11, 11, 11, 11, 10, 10, 14, 11, 11, 14, 14, 13, 12] };
}
