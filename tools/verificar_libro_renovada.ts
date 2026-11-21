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
// y el ejemplo de la guía con aberturas en T1 y T2 (los dinteles y el corte débil)
const calado = ejemploGuia();
calado.muros.find(m => m.id === 'M1')!.aberturas = [{ s: 0, ancho: 0.6, desde: 0, alto: 2.1 }];
calado.muros.find(m => m.id === 'M2')!.aberturas = [{ s: -0.5, ancho: 0.8, desde: 0, alto: 2.2 }, { s: 0.6, ancho: 0.5, desde: 0.9, alto: 1.2 }];
const torres = [ejemploGuia(), ...torresPrueba(), calado];
for (const [i, p0] of torres.entries()) for (const nivel of ['simple', 'completa'] as const) {
  if (nivel === 'completa' && ![0, 2, 6, 10, torres.length - 1].includes(i)) continue;
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
