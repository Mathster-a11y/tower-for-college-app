/** Dónde se va el tiempo del método FEM con la torre grande */
import { it } from 'vitest';
import { torreGrande } from './torreGrande';
import { modeloDeProyecto, masasDeProyecto, calcularFem } from '../../src/engine/metodos/fem';
import { modal, resolverTorre } from '../../src/engine/fem/pseudo3d';
import { viento102 } from '../../src/engine/cargas/cirsoc102';
import { calcularProyecto } from '../../src/ui/estado';

const t = (n: string, f: () => unknown) => { const a = performance.now(); f(); console.log(`${n}: ${(performance.now() - a).toFixed(0)} ms`); };
it.skipIf(!process.env.MEDIR)('desglose', () => {
  const p = torreGrande();
  const mo = modeloDeProyecto(p);
  console.log(`pisos ${mo.z.length}, piezas ${mo.piezas.length}, matriz ${3 * mo.z.length}`);
  const { masas, inercias } = masasDeProyecto(p, mo);
  t('modal', () => modal(mo, masas, inercias));
  t('viento102', () => viento102(p));
  const c = { Fx: mo.z.map(() => 1), Fy: mo.z.map(() => 1), Mz: mo.z.map(() => 0) };
  t('resolverTorre (1 caso)', () => resolverTorre(mo, c));
  t('calcularFem entero', () => calcularFem(p));
  t('calcularProyecto fem', () => calcularProyecto({ ...p, calculo: { metodo: 'fem' } }));
  t('calcularProyecto cirsoc', () => calcularProyecto({ ...p, calculo: { metodo: 'cirsoc' } }));
});
