// Verificación de la vista previa de la planilla: exporta varias torres (virgen, con las dos planillas) y guarda el
// valor que da el evaluador de fórmulas de la app en cada celda con fórmula. tools/comparar_vista_previa.py recalcula
// con LibreOffice y compara todas las celdas con fórmula de las hojas de la cátedra.
// Uso: npx vite-node tools/verificar_vista_previa.ts <carpeta de salida>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ejemploGuia, ejemploAsimetrico, type Proyecto } from '../src/engine/modelo';
import { ejemploPlanta34 } from '../src/engine/ejemplo34';
import { TORRES_PRUEBA, armarTorre } from '../src/engine/torresPrueba';
import { aPlanilla } from '../src/engine/mapping';
import { calcularPlanilla } from '../src/engine/planilla';
import { escribirPlanilla, HOJAS } from '../src/xlsx/planilla';
import { valoresFormulas } from '../src/xlsx/vistaPrevia';
import { config, type Motor } from '../src/engine/config';

const dir = process.argv[2] ?? 'verif-vista';
mkdirSync(dir, { recursive: true });
const plantillas: Record<Motor, Buffer> = { actual: readFileSync('src/assets/planilla_virgen.xlsx'), nuevo: readFileSync('src/assets/planilla_catedra_2025.xlsx') };
/** más de 20 piezas por viento: la planilla 2025 agrega filas */
const muchas = (): Proyecto => {
  const p = ejemploGuia();
  for (let q = 0; q < 20; q++) p.muros.push({ id: `X${q}`, dir: 'Y', x: -9 + q * 0.9, y: q % 2 ? 7 : -7, largo: 1 + (q % 3) * 0.2, espesor: 0.2, llega: true, areaInf: 10, piezaA: `PA${q}`, pegadoA: '', piezaB: `PB${q}`, pegadoB: '' });
  return p;
};
const casos: [string, () => Proyecto][] = [['muchas', muchas], ['guia', ejemploGuia], ['anexo', ejemploAsimetrico], ['p34', ejemploPlanta34], ...TORRES_PRUEBA.slice(0, 6).map((t, i) => [`P${i + 1}`, () => armarTorre(t)] as [string, () => Proyecto])];
const catedra = new Set(Object.values(HOJAS));
for (const motor of ['actual', 'nuevo'] as Motor[]) for (const [nombre, f] of casos) {
  config.motor = motor;
  const p = f();
  const a = aPlanilla(p);
  if (motor === 'actual' && (a.datos.jpar.length > 20 || a.datos.jort.length > 20)) continue;
  const r = calcularPlanilla(a.datos);
  writeFileSync(`${dir}/${motor}_${nombre}.xlsx`, await escribirPlanilla(plantillas[motor], a.datos, r, p, undefined, undefined, { motor, virgen: true }));
  const vals = await valoresFormulas(plantillas[motor], a.datos, r, motor);
  const lista: [string, string, unknown][] = [];
  for (const [h, cs] of Object.entries(vals)) if (catedra.has(h)) for (const [ref, v] of Object.entries(cs)) lista.push([h, ref, typeof v === 'object' && v !== null ? { error: (v as { error: string }).error } : v]);
  writeFileSync(`${dir}/${motor}_${nombre}.json`, JSON.stringify(lista));
  console.log(motor, nombre, lista.length, 'fórmulas');
}
