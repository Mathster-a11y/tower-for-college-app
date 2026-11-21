/** Dónde se va el tiempo del método CIRSOC con la torre grande */
import { it } from 'vitest';
import { torreGrande } from './torreGrande';
import { aPlanilla } from '../../src/engine/mapping';
import { calcularPlanilla } from '../../src/engine/planilla';
import { viento102 } from '../../src/engine/cargas/cirsoc102';
import { datosCirsoc, verificarDireccion201 } from '../../src/engine/metodos/cirsoc';
import { calcularCorregido } from '../../src/engine/correcciones';

const t = <T>(n: string, f: () => T): T => { const a = performance.now(); const r = f(); console.log(`${n}: ${(performance.now() - a).toFixed(0)} ms`); return r; };
it.skipIf(!process.env.MEDIR)('desglose', () => {
  const p = { ...torreGrande(), calculo: { metodo: 'cirsoc' as const } };
  const asig = t('aPlanilla', () => aPlanilla(p));
  t('calcularPlanilla', () => calcularPlanilla(asig.datos));
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1), filaPB = asig.filaNivel[iPB] ?? 50;
  t('calcularCorregido', () => calcularCorregido(asig.datos, filaPB, { proyecto: p, piezas: asig.piezas }));
  const w = t('viento102', () => viento102(p));
  const corrC = t('calcularCorregido (102-25)', () => calcularCorregido(datosCirsoc(asig.datos, w), filaPB, { proyecto: p, piezas: asig.piezas }));
  t('verificar 201 (A)', () => verificarDireccion201(p, asig.piezas, corrC.rotoA, 'A', w.A.QPB, w.A.MPB, w.B.B, w.B.QPB));
  t('verificar 201 (B)', () => verificarDireccion201(p, asig.piezas, corrC.rotoB, 'B', w.B.QPB, w.B.MPB, w.A.B, w.A.QPB));
});
