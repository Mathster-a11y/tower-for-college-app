/**
 * Exporta los casos de comparación de los motores de elementos finitos a test/fixtures/motor_fem/<caso>.entrada.json
 * (la entrada de src/engine/femEntrada.ts). Después, tools/motor_fem/verificar.py los resuelve con OpenSees y Pynite.
 *
 *   npx vite-node tools/motor_fem/exportar.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { entradaFem } from '../../src/engine/femEntrada';
import { CASOS_FEM } from './casos';

const dir = 'test/fixtures/motor_fem';
mkdirSync(dir, { recursive: true });
for (const [nombre, f] of CASOS_FEM) for (const v of ['A', 'B'] as const) {
  const e = entradaFem(f(), v, `${nombre}_${v}`);
  writeFileSync(`${dir}/${e.caso}.entrada.json`, JSON.stringify(e, null, 1) + '\n');
  console.log(e.caso.padEnd(12), 'niveles', e.niveles.length, 'ΣW', e.niveles.reduce((s, n) => s + n.W, 0).toFixed(2),
    'piezas', e.piezas.length, 'perp', e.perp.length, e.alturaCompleta ? '' : '(piezas que no llegan arriba)');
}
