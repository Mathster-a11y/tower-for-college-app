// Escribe la planilla de la cátedra con la hoja «G · Malla» del Gherkin con la ficha M y guarda lo que la app espera
// de sus fórmulas (largos, áreas y peso). tools/comparar_malla.py lo compara con el libro recalculado por LibreOffice.
// Uso: npx vite-node tools/verificar_malla_excel.ts carpeta
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ejemploGherkin } from '../src/engine/ejemplosExo';
import { aPlanilla } from '../src/engine/mapping';
import { calcularPlanilla } from '../src/engine/planilla';
import { calcularProyecto } from '../src/engine/calculoProyecto';
import { ExoDeCalculo } from '../src/engine/exoDeCalculo';
import { opcionesG } from '../src/xlsx/opcionesG';
import { escribirPlanilla } from '../src/xlsx/planilla';
import { propsSeccion } from '../src/engine/exo';

const dir = process.argv[2] ?? 'malla';
mkdirSync(dir, { recursive: true });
const p = ejemploGherkin();
p.exo = { ...p.exo!, tipo: 'M', circular: undefined, malla: { patron: 'diagrid', nudos: 16 } };
p.calculo = { ...(p.calculo ?? {}), metodo: 'cirsoc' } as typeof p.calculo;
const ex = new ExoDeCalculo(p, calcularProyecto(p), 'cirsoc');
const m = ex.hojaMalla(p.exo)!;
const a = aPlanilla(p), r = calcularPlanilla(a.datos), g = opcionesG(p);
g.malla = m;
const bytes = await escribirPlanilla(readFileSync('src/assets/planilla_virgen.xlsx'), a.datos, r, p, g);
writeFileSync(`${dir}/malla.xlsx`, bytes);
writeFileSync(`${dir}/malla.json`, JSON.stringify({
  r0: 6, L: m.barras.map(b => b.L), A: m.barras.map(b => propsSeccion({ b: b.sec.b, e: b.sec.e }).A), peso: m.peso, malas: m.barras.filter(b => (b.ratio ?? 0) > 1).length,
}));
console.log('escrito', `${dir}/malla.xlsx`, m.nudos.length, 'nudos', m.barras.length, 'barras');
