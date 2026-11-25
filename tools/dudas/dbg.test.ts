import { it } from 'vitest';
import { ejemploHearst } from '../../src/engine/ejemplosExo';
import { ejemploCiticorp } from '../../src/engine/modelo';
import { estado } from '../../src/ui/estado';
import { datosExo } from '../../src/ui/exo';
import { pesoExo } from '../../src/engine/exo';
it.skipIf(!process.env.DUDAS)('dbg', () => {
  for (const f of [ejemploHearst, ejemploCiticorp]) {
    const p = f(); estado.proyecto = { ...p, calculo: { metodo: 'cirsoc' } }; estado.recalcular();
    const a = datosExo('A')!, b = datosExo('B')!;
    console.log(p.nombre, 'peso', pesoExo(a.def, [a.entrada, b.entrada]).toFixed(0), estado.calculo.controles.filter(x => /Deriva/.test(x.nombre)).map(x => x.nota?.slice(60, 140)).join(' | '));
  }
});
