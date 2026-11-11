// Prueba de punta a punta: una torre con piezas agrupadas (una C de la biblioteca y una pieza con alas
// intermedias, como la del ejemplo de la cátedra) escrita en la planilla virgen, con los resultados del motor
// para compararlos con LibreOffice.
import { readFileSync, writeFileSync } from 'node:fs';
import { ejemploGuia, type Muro } from '../src/engine/modelo';
import { aPlanilla } from '../src/engine/mapping';
import { calcularPlanilla } from '../src/engine/planilla';
import { escribirPlanilla } from '../src/xlsx/planilla';
import { piezaTipo } from '../src/engine/piezasTipo';
import { agrupar } from '../src/engine/dibujo';

const salida = process.argv[2] ?? 'prueba.xlsx';
const p = ejemploGuia();
// se reemplaza T5 (M5, M6, M7) por una C de la biblioteca y T6 (M8, M9, M10) por la pieza de la cátedra
p.muros = p.muros.filter(m => !['M5', 'M6', 'M7', 'M8', 'M9', 'M10'].includes(m.id));
const usados = new Set(p.muros.map(m => m.id));
const c = piezaTipo('C', { h: 4, b: 2.5, e: 0.25, giro: 0 }, -5.5, 0, usados);
p.muros = agrupar([...p.muros, ...c], c.map(m => m.id)).muros;
const m = (dir: 'X' | 'Y', x: number, y: number, largo: number): Muro => ({ id: '', dir, x, y, largo, espesor: 0.25, llega: true, areaInf: 12, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '' });
const k0 = Math.max(...[...usados].map(id => Number(id.slice(1)) || 0)) + 1;
const cat = [m('Y', 4, 0, 7), m('X', 5.1, 3.5, 2.2), m('X', 4.95, 1, 1.9), m('X', 4.95, -1.5, 1.9), m('Y', 5.95, -2.7, 1.1), m('X', 4.95, -3.5, 1.9)]
  .map((w, i) => ({ ...w, id: `M${k0 + i}` }));
cat[2].rolA = 'fuera'; cat[3].rolA = 'fuera';                       // alas del medio fuera en el viento A
p.muros = agrupar([...p.muros, ...cat], cat.map(w => w.id)).muros;
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
console.log('escrito', salida);
a.piezas.forEach(pz => console.log(pz.dir, pz.nombre, pz.molde, 'fila', pz.filaHoja, 'J hoja', pz.Jhoja?.toFixed(3), 'real', pz.Jreal?.toFixed(3), pz.avisos.filter(x => !x.startsWith('Nota')).join(' | ')));
