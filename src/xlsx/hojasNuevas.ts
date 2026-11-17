/**
 * Hojas que la app agrega a la planilla, después de las 7 de la cátedra (no cambian ninguna de ellas):
 *  - «Elementos especiales»: oblicuos, curvos, calados con corte y cualquier pieza clasificada a mano como especial.
 *    La hoja J de la cátedra lleva su rectángulo equivalente (mismo J y misma área); acá va su sección real, su
 *    geometría, el W real (fibra extrema) y el control de que el J que lee la planilla es el de la sección.
 */
import type { Asignacion, PiezaEquivalente } from '../engine/mapping';
import type { PlanillaRes } from '../engine/planilla';
import { filaExcelJ } from '../engine/planilla';
import { alturaYLosas, datosAlturaDe, partesDePieza } from '../engine/flexocompresion';
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
    ['La hoja J de la cátedra lleva el rectángulo equivalente de cada uno (mismo J y misma área que la sección real). Acá va la sección real: su J, su baricentro, sus fibras extremas y el W real que usa la hoja de flexocompresión. La columna «J en la hoja J» lee el J de la planilla y «Diferencia» lo controla.'],
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

// ------------------------------------------------------------------ flexocompresión (guía / CIRSOC)
/**
 * Hoja «Flexocompresión (guía)»: la verificación de la guía (sección 5) muro por muro, en PB y para los dos vientos, con
 * fórmulas vivas. Cada pieza toma del momento en PB (M,NyQ) la misma fracción que toma de la fuerza en la rototraslación:
 * (traslación E + rotación N) / W (columnas de la hoja «Rototrasl.»). La «Flex comp PB paralelos» de la cátedra suma en
 * O = G + N un momento (G, tm) y una fuerza (N, t): por eso esta hoja no la usa.
 * Las almas, a flexocompresión con su fibra más alejada; las alas hacen un par (fuerza axial M·A·d / J).
 */
export function hojaFlexGuia(asig: Asignacion, r: PlanillaRes, p: Proyecto, motor: Motor, adm: number): HojaNueva | null {
  const piezas = asig.piezas.filter(z => z.filaHoja !== null);
  if (!piezas.length) return null;
  const porId = new Map(p.muros.map(m => [m.id, m]));
  const alt = datosAlturaDe(p);
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const filaPB = (asig.filaNivel[iPB] ?? 50) + 4;
  const filas: CeldaN[][] = [
    ['FLEXOCOMPRESIÓN EN PB · GUÍA «EDIFICIO EN TORRE» (SECCIÓN 5) Y CIRSOC'],
    [`σ = −N / A ± M · y / J. N = peso propio (área × altura × 2,4 t/m³) + losas (0,7 t/m² descargado, 0,9 t/m² cargado, × área de influencia × losas). M de cada pieza en PB = M,NyQ (fila ${filaPB}) × su fracción de la fuerza en la rototraslación, (E + N) / D5. Las alas hacen un par. Tracción con el edificio descargado; compresión con el edificio cargado, contra σbk del hormigón (${adm} kg/cm²). As = T / 2400 kg/cm²; mínima 0,8 % de la sección. La «Flex comp PB paralelos» de la cátedra queda como estaba.`],
    [],
    ['Pieza', 'Viento', 'Muro', 'Papel', 'A (m²)', 'b (m)', 'h (m)', 'd (m)', 'J pieza (m⁴)', 'Altura (m)', 'Losas', 'Área inf. (m²)', 'Pp (t)', 'N descargado (t)', 'N cargado (t)', 'M pieza en PB (tm)', 'y máx (m)', 'σ por M (t/m²)', 'Tracción (kg/cm²)', 'Compresión (kg/cm²)', 'σbk (kg/cm²)', 'Verifica', 'x traccionado (m)', 'T (t)', 'As (cm²)', 'As mín (cm²)', 'Armadura', 'y1 (m)', 'y2 (m)', 'σ otra fibra, descargado (t/m²)'],
  ];
  for (const dir of ['A', 'B'] as const) {
    const hojaR = dir === 'A' ? 'Rototrasl. cara mayor' : 'Rototrasl. cara menor', colM = dir === 'A' ? 'J' : 'O';
    piezas.filter(z => z.dir === dir).forEach(pz => {
      const muros = pz.muros.map(id => porId.get(id)).filter((m): m is Muro => !!m);
      const { partes, J } = partesDePieza(muros, dir);
      const areaDe = new Map<string, number>();
      partes.forEach(q => areaDe.set(q.id, (areaDe.get(q.id) ?? 0) + q.A));
      const rr = 5 + pz.filaHoja!;
      partes.forEach(q => {
        const m = porId.get(q.id)!, { altura, losas } = alturaYLosas(m, alt), f = filas.length + 1;
        const frac = q.A / (areaDe.get(q.id) || q.A);
        filas.push([pz.nombre, dir, q.id, q.papel, q.A, q.b, q.h, q.d, J, altura, losas, m.areaInf * frac,
          { f: `E${f}*J${f}*2.4` }, { f: `M${f}+0.7*L${f}*K${f}` }, { f: `M${f}+0.9*L${f}*K${f}` },
          { f: `ABS(('${hojaR}'!E${rr}+'${hojaR}'!N${rr})/'${hojaR}'!D5*'M,NyQ'!${colM}${filaPB})` },
          { f: `IF(D${f}="ala",ABS(H${f}),MAX(ABS(AB${f}),ABS(AC${f})))` },
          { f: `IF(I${f}>0,P${f}*Q${f}/I${f},0)` },
          { f: `(-N${f}/E${f}+R${f})/10` }, { f: `(-O${f}/E${f}-R${f})/10` }, adm,
          { f: `IF(ABS(MIN(0,T${f}))<=U${f},"VERIFICA","NO VERIFICA")` },
          { f: `IF(S${f}<=0,0,IF(D${f}="ala",G${f},IF(AD${f}>=0,G${f},G${f}*S${f}*10/(S${f}*10-AD${f}))))` },
          { f: `IF(S${f}<=0,0,IF(D${f}="ala",S${f}*10*E${f},IF(AD${f}>=0,(S${f}*10+AD${f})/2*E${f},S${f}*10*IF(D${f}="tubo",E${f}/G${f},F${f})*W${f}/2)))` },
          { f: `X${f}*1000/2400` }, { f: `0.008*E${f}*10000` }, { f: `IF(Y${f}>Z${f},"por tracción","mínima")` },
          { f: `H${f}-G${f}/2` }, { f: `H${f}+G${f}/2` },
          { f: `IF(I${f}>0,-N${f}/E${f}+P${f}*SIGN(IF(ABS(AB${f})>=ABS(AC${f}),AB${f},AC${f}))*IF(ABS(AB${f})>=ABS(AC${f}),AC${f},AB${f})/I${f},-N${f}/E${f})` }]);
      });
    });
  }
  void r; void motor;
  return { nombre: 'Flexocompresión (guía)', filas, anchos: [9, 7, 8, 7, 9, 8, 8, 8, 11, 9, 7, 10, 10, 12, 12, 13, 9, 11, 12, 12, 10, 12, 11, 10, 10, 10, 12, 8, 8, 13] };
}
