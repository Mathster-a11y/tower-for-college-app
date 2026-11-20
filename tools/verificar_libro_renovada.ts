// Escribe la planilla renovada (simple y completa) de las torres de prueba y los valores de todas sus fórmulas
// calculados por la app; tools/comparar_libro.py los compara con el libro recalculado por LibreOffice.
// Uso: npx vite-node tools/verificar_libro_renovada.ts carpeta
import { mkdirSync, writeFileSync } from 'node:fs';
import { ejemploGuia, type Proyecto } from '../src/engine/modelo';
import { torresPrueba } from '../src/engine/torresPrueba';
import { calcularProyecto } from '../src/ui/estado';
import { datosRenovada, libroRenovada } from '../src/xlsx/libros/libroRenovada';
import { Evaluador } from '../src/xlsx/formulas';

const dir = process.argv[2] ?? 'libros';
mkdirSync(dir, { recursive: true });
const torres = [ejemploGuia(), ...torresPrueba()];
for (const [i, p0] of torres.entries()) for (const nivel of ['simple', 'completa'] as const) {
  if (nivel === 'completa' && ![0, 2, 6, 10].includes(i)) continue;
  const p: Proyecto = { ...p0, calculo: { metodo: 'cirsoc', verificacion: nivel } };
  const c = calcularProyecto(p);
  const { libro } = libroRenovada(datosRenovada(p, c.asig.piezas, c.cirsoc!.verif, nivel), p);
  const base = `${dir}/renovada_${nivel}_${i}`;
  writeFileSync(`${base}.xlsx`, await libro.xlsx());
  const { libro: lb, nombres } = libro.aLibroEvaluable();
  const ev = new Evaluador(lb, nombres);
  const valores: [string, string, number | string | boolean][] = [];
  for (const [hoja, celdas] of lb) for (const [ref, x] of celdas) {
    if (x.f === undefined) continue;
    const v = ev.celda(hoja, ref);
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') valores.push([hoja, ref, v]);
  }
  writeFileSync(`${base}.json`, JSON.stringify(valores));
  console.log(base, valores.length, 'fórmulas');
}
