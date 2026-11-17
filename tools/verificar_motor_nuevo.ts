// Verificación del motor «nuevo» contra la planilla de la cátedra 2025 (EDIFICIO_TORRE_1.xlsx):
// escribe varias torres en la planilla (solo datos, como la exportación «virgen») y guarda, celda por celda, lo que
// calcula el motor. tools/comparar_motor_nuevo.py recalcula con LibreOffice y compara todas las celdas con fórmula.
// Uso: npx vite-node tools/verificar_motor_nuevo.ts <carpeta de salida>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ejemploGuia, ejemploAsimetrico, type Muro, type Proyecto } from '../src/engine/modelo';
import { aPlanilla } from '../src/engine/mapping';
import { calcularPlanilla, type PlanillaRes } from '../src/engine/planilla';
import { escribirPlanilla } from '../src/xlsx/planilla';
import { piezaTipo } from '../src/engine/piezasTipo';
import { agrupar } from '../src/engine/dibujo';
import { config, type Metodo } from '../src/engine/config';

const dir = process.argv[2] ?? 'verif';
mkdirSync(dir, { recursive: true });
const plantilla = readFileSync('src/assets/planilla_catedra_2025.xlsx');

/** torre con muchas piezas (llena ranuras de la fila 15 en adelante), asimétrica en planta, con tubos y alas */
function torreRica(): Proyecto {
  const p = ejemploAsimetrico();
  p.nombre = 'Torre rica';
  p.niveles = p.niveles.map((n, i) => (i === 3 ? { ...n, cota: n.cota + 0.35 } : n));
  const usados = new Set(p.muros.map(m => m.id));
  let k = 100;
  const t = (dirM: 'X' | 'Y', x: number, y: number, largo: number, e = 0.25, area = 8): Muro =>
    ({ id: `M${k++}`, dir: dirM, x, y, largo, espesor: e, llega: true, areaInf: area, piezaA: `P${k}`, pegadoA: '', piezaB: `Q${k}`, pegadoB: '' });
  const sueltos = [t('Y', -2, 7, 2.2), t('Y', 2.5, 7, 1.8, 0.3), t('Y', -1, -7, 2.5), t('X', 1.5, -7.2, 3), t('X', -7, 7.5, 2.4, 0.2), t('Y', 7, 3, 1.6)];
  p.muros.push(...sueltos);
  const c1 = piezaTipo('C', { h: 4, b: 2.5, e: 0.25, giro: 0 }, -1.5, 2.5, usados);
  p.muros = agrupar([...p.muros, ...c1], c1.map(m => m.id)).muros;
  const c2 = piezaTipo('C', { h: 3, b: 2, e: 0.2, giro: 1 }, 2.5, -2.5, usados);
  p.muros = agrupar([...p.muros, ...c2], c2.map(m => m.id)).muros;
  const l1 = piezaTipo('L', { h: 3, b: 2, e: 0.25, giro: 2 }, -3, -4.5, usados);
  p.muros = agrupar([...p.muros, ...l1], l1.map(m => m.id)).muros;
  p.muros.push({ id: 'TC1', dir: 'Y', x: 0.5, y: 5, largo: 1.2, espesor: 0.2, tipo: 'tubo-circ', llega: true, areaInf: 10, piezaA: 'TC1', pegadoA: '', piezaB: 'TC1B', pegadoB: '' });
  p.muros.forEach(m => { if (!(m.areaInf > 0)) m.areaInf = 9; });
  return p;
}

/** torre con más de 20 piezas por viento: hace agregar filas a la planilla */
function torreGrande(): Proyecto {
  const p = torreRica();
  p.nombre = 'Torre grande';
  let k = 300;
  const t = (dirM: 'X' | 'Y', x: number, y: number, largo: number, e = 0.2): Muro =>
    ({ id: `G${k++}`, dir: dirM, x, y, largo, espesor: e, llega: true, areaInf: 6 + (k % 5), piezaA: `GA${k}`, pegadoA: '', piezaB: `GB${k}`, pegadoB: '' });
  for (let q = 0; q < 14; q++) p.muros.push(t('Y', -9.5 + q * 1.4, q % 2 ? 6.5 : -6.5, 1 + (q % 4) * 0.3, 0.2 + (q % 3) * 0.05));
  for (let q = 0; q < 12; q++) p.muros.push(t('X', q % 2 ? 8.6 : -8.6, -5 + q * 0.9, 0.9 + (q % 3) * 0.4));
  const usados = new Set(p.muros.map(m => m.id));
  const c3 = piezaTipo('C', { h: 2.5, b: 1.5, e: 0.2, giro: 3 }, 6, 6, usados);
  p.muros = agrupar([...p.muros, ...c3], c3.map(m => m.id)).muros;
  p.muros.push({ id: 'TC2', dir: 'Y', x: -6, y: -2, largo: 0.9, espesor: 0.45, tipo: 'tubo-circ', llega: true, areaInf: 7, piezaA: 'TC2', pegadoA: '', piezaB: 'TC2B', pegadoB: '' });
  return p;
}

const casos: [string, () => Proyecto, Metodo][] = [
  ['grande_app', torreGrande, 'app'], ['grande_planilla', torreGrande, 'planilla'],
  ['guia_app', ejemploGuia, 'app'], ['guia_planilla', ejemploGuia, 'planilla'],
  ['anexo_planilla', ejemploAsimetrico, 'planilla'], ['rica_app', torreRica, 'app'], ['rica_planilla', torreRica, 'planilla'],
];

type Celdas = [string, string, number | null][];
function celdas(r: PlanillaRes): Celdas {
  const out: Celdas = [];
  const put = (h: string, c: string, v: number) => out.push([h, c, Number.isFinite(v) ? v : null]);
  const V = 'viento', M = 'M,NyQ', JP = 'J Tabiques paralelos', JO = 'J Tabiques ortogonales', FX = 'Flex comp PB paralelos';
  put(V, 'N4', r.viento.qh);
  for (let i = 0; i <= 50; i++) { const f = 5 + i; put(V, `H${f}`, r.viento.Kz[i]); put(V, `M${f}`, r.viento.qz[i]); put(V, `P${f}`, r.viento.P[i]); put(V, `Q${f}`, r.viento.Q[i]); put(V, `R${f}`, r.viento.R[i]); put(V, `S${f}`, r.viento.S[i]); }
  const m = r.mnyq;
  for (let k = 0; k < 54; k++) { const f = 4 + k; for (const c of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'] as const) put(M, `${c}${f}`, m[c][k]); }
  for (const c of ['H61', 'J61', 'M61', 'O61', 'F62', 'G65', 'G66', 'G67', 'G68', 'G69', 'G70', 'N82', 'N83', 'N84', 'N85', 'N86', 'N87', 'N89', 'N90', 'H99', 'I99', 'J99', 'K99', 'L99', 'M99', 'N99'] as const) put(M, c, m[c]);
  const colsJ = ['D', 'I', 'M', 'N', 'O', 'P', 'Q', 'R', 'U', 'V', 'Y', 'AC', 'AG', 'AJ', 'AK', 'AL', 'AM', 'AN', 'AS', 'AW', 'AX', 'AY'] as const;
  r.jpar.filas28!.forEach((f, i) => colsJ.forEach(c => put(JP, `${c}${4 + i}`, f[c])));
  // planilla 2025 de 49 columnas: en ortogonales se borraron AA y AD (desde AB se corre una letra; desde AE, dos)
  const num = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const letra = (n: number) => { let s = ''; while (n > 0) { const q = (n - 1) % 26; s = String.fromCharCode(65 + q) + s; n = Math.floor((n - 1) / 26); } return s; };
  const o49 = (c: string) => { const n = num(c); return n >= num('AE') ? letra(n - 2) : n >= num('AB') ? letra(n - 1) : c; };
  r.jort.filas.forEach((f, i) => colsJ.forEach(c => put(JO, `${o49(c)}${4 + i}`, f[c])));
  const eA = r.jpar.filas.length - 20, eB = r.jort.filas.length - 20;
  put(JP, `AY${32 + eA}`, r.jpar.AY24); put(JO, `AW${24 + eB}`, r.jort.AY24);
  const jmin = (h: string, j: PlanillaRes['jminA'], f0: number) => { put(h, `I${f0}`, j.W); put(h, `J${f0}`, j.h); j.tabla.forEach((t, q) => { put(h, `K${f0 + 2 * q}`, t.h400); put(h, `M${f0 + 2 * q}`, t.h500); put(h, `O${f0 + 2 * q}`, t.h600); }); };
  jmin(JP, r.jminA, 45 + eA); jmin(JO, r.jminB, 37 + eB);
  for (const [h, ro] of [['Rototrasl. cara mayor', r.rotA], ['Rototrasl. cara menor', r.rotB]] as const) {
    const nP = ro.nP, NR = ro.B.length, sP = 5 + nP, sO = 5 + NR;
    for (let i = 0; i < NR; i++) {
      const f = 5 + i;
      if (i >= nP && i < nP + 3) continue;
      if (i === nP + 5) continue;
      for (const c of ['B', 'C', 'E', 'G', 'I', 'K', 'L', 'N', 'O'] as const) put(h, `${c}${f}`, ro[c][i]);
      put(h, `M${f}`, ro.Mm[i]);
    }
    const dir: Record<string, string> = { B25: `B${sP}`, I25: `I${sP}`, L25: `L${sP}`, C25: `C${sP}`, E25: `E${sP}`, G25: `G${sP}`, J7: 'J7', J15: 'J15',
      J28: `J${28 + nP - 20}`, J38: `J${38 + nP - 20}`, B51: `B${sO}`, I51: `I${sO}`, M51: `M${sO}` };
    for (const c of ['B25', 'I25', 'J7', 'J15', 'J28', 'J38', 'B51', 'I51', 'M51', 'L25', 'C25', 'E25', 'G25'] as const) put(h, dir[c], ro[c]);
    put(h, 'D5', ro.D5); put(h, 'F5', ro.F5);
  }
  const fx = r.flex;
  for (let i = 0; i < fx.B.length; i++) { const f = 4 + i; for (const [c, a] of [['B', fx.B], ['D', fx.D], ['E', fx.E], ['H', fx.H], ['I', fx.I], ['J', fx.J], ['K', fx.K], ['L', fx.L], ['M', fx.M], ['N', fx.Nn], ['O', fx.O], ['P', fx.P]] as const) put(FX, `${c}${f}`, a[i]); }
  return out;
}

config.motor = 'nuevo';
for (const [nombre, f, metodo] of casos) {
  config.metodo = metodo;
  const p = f();
  const a = aPlanilla(p);
  const r = calcularPlanilla(a.datos);
  writeFileSync(`${dir}/${nombre}.xlsx`, await escribirPlanilla(plantilla, a.datos, r, p, undefined, undefined, { motor: 'nuevo', virgen: true }));
  writeFileSync(`${dir}/${nombre}.json`, JSON.stringify(celdas(r)));
  console.log(nombre, '· piezas A', a.piezas.filter(x => x.dir === 'A' && x.filaHoja !== null).length, '· B', a.piezas.filter(x => x.dir === 'B' && x.filaHoja !== null).length,
    '· W', r.mnyq.H61.toFixed(2), '· ΣJ A', r.jpar.AY24.toFixed(3), '· e A', r.rotA.J7.toFixed(3));
}
