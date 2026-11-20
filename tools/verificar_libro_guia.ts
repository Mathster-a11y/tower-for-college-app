// Escribe la planilla de la guía de cada torre de prueba y, junto, todos los valores de sus fórmulas calculados con el
// evaluador de la app. tools/comparar_libro.py los compara con el libro recalculado por LibreOffice.
// Uso: npx vite-node tools/verificar_libro_guia.ts carpeta
import { mkdirSync, writeFileSync } from 'node:fs';
import { ejemploGuia } from '../src/engine/modelo';
import { torresPrueba } from '../src/engine/torresPrueba';
import { aPlanilla } from '../src/engine/mapping';
import { datosGuia } from '../src/engine/metodos/guiaPasos';
import { libroGuia } from '../src/xlsx/libros/libroGuia';
import { Evaluador } from '../src/xlsx/formulas';

const dir = process.argv[2] ?? 'libros';
mkdirSync(dir, { recursive: true });
// y el ejemplo de la guía con aberturas en T1 y T2 (los dinteles y el corte débil)
const calado = ejemploGuia();
calado.muros.find(m => m.id === 'M1')!.aberturas = [{ s: 0, ancho: 0.6, desde: 0, alto: 2.1 }];
calado.muros.find(m => m.id === 'M2')!.aberturas = [{ s: -0.5, ancho: 0.8, desde: 0, alto: 2.2 }, { s: 0.6, ancho: 0.5, desde: 0.9, alto: 1.2 }];
const torres = [ejemploGuia(), ...torresPrueba(), calado];
for (const [i, p] of torres.entries()) {
  const { libro } = libroGuia(datosGuia(p, aPlanilla(p).piezas), p);
  writeFileSync(`${dir}/guia_${i}.xlsx`, await libro.xlsx());
  const { libro: lb, nombres } = libro.aLibroEvaluable();
  const ev = new Evaluador(lb, nombres);
  const valores: [string, string, number | string | boolean][] = [];
  for (const [hoja, celdas] of lb) for (const [ref, c] of celdas) {
    if (c.f === undefined) continue;
    const v = ev.celda(hoja, ref);
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') valores.push([hoja, ref, v]);
  }
  writeFileSync(`${dir}/guia_${i}.json`, JSON.stringify(valores));
  console.log(i, p.nombre, valores.length, 'fórmulas');
}
