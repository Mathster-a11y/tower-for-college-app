// Escribe la malla de la ficha M (Gherkin, nudos por anillo a elección) para tools/motor_fem/pynite_malla.py.
// Uso: npx vite-node tools/verificar_malla_pynite.ts salida.json [nudos] [arriostrada: si|no]
import { writeFileSync } from 'node:fs';
import { ejemploGherkin } from '../src/engine/ejemplosExo';
import { calcularProyecto } from '../src/engine/calculoProyecto';
import { ExoDeCalculo } from '../src/engine/exoDeCalculo';

const salida = process.argv[2] ?? 'malla_pynite.json', nudos = Number(process.argv[3] ?? 12), arr = process.argv[4] !== 'no';
const p = ejemploGherkin();
p.exo = { ...p.exo!, tipo: 'M', circular: undefined, malla: { patron: 'diagrid', nudos, arriostrada: arr } };
p.calculo = { ...(p.calculo ?? {}), metodo: 'cirsoc' } as typeof p.calculo;
const d = new ExoDeCalculo(p, calcularProyecto(p), 'cirsoc').datosPyniteMalla(p.exo)!;
writeFileSync(salida, JSON.stringify(d));
console.log('escrito', salida, d.nudos.length, 'nudos', d.barras.length, 'barras');
