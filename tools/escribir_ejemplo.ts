// Escribe el ejemplo de la guía en la planilla virgen y guarda los resultados del motor, para compararlos con LibreOffice.
import { readFileSync, writeFileSync } from 'node:fs';
import { ejemploGuia } from '../src/engine/modelo';
import { aPlanilla } from '../src/engine/mapping';
import { calcularPlanilla } from '../src/engine/planilla';
import { escribirPlanilla } from '../src/xlsx/planilla';

const salida = process.argv[2] ?? 'ejemplo.xlsx';
const p = ejemploGuia();
const a = aPlanilla(p);
const r = calcularPlanilla(a.datos);
const bytes = await escribirPlanilla(readFileSync('src/assets/planilla_virgen.xlsx'), a.datos, r, p);
writeFileSync(salida, bytes);
writeFileSync(salida.replace(/\.xlsx$/, '.json'), JSON.stringify({
  H61: r.mnyq.H61, J61: r.mnyq.J61, M61: r.mnyq.M61, O61: r.mnyq.O61, L99: r.mnyq.L99, N89: r.mnyq.N89, N90: r.mnyq.N90,
  AYpar: r.jpar.filas.map(f => f.AY), AYort: r.jort.filas.map(f => f.AY), AY24p: r.jpar.AY24, AY24o: r.jort.AY24,
  rotA_O: r.rotA.O.slice(0, 20), rotA_J7: r.rotA.J7, rotB_O: r.rotB.O.slice(0, 20), rotB_J7: r.rotB.J7,
  flex_O: r.flex.O, flex_P: r.flex.P, K37p: r.jminA.tabla[0].h400, I37o: r.jminB.W,
}, null, 1));
console.log('escrito', salida, 'avisos:', a.avisos);
