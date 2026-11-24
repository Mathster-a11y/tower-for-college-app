/** ¿verifican todos los ejemplos con los métodos CIRSOC y FEM? DUDAS=1 npx vitest run tools/dudas/verif.test.ts */
import { it } from 'vitest';
import { ejemploGuia, ejemploAsimetrico, ejemploCiticorp } from '../../src/engine/modelo';
import { ejemploPlanta34 } from '../../src/engine/ejemplo34';
import * as EX from '../../src/engine/ejemplosExo';
import { estado } from '../../src/ui/estado';
import '../../src/ui/exo';
it.skipIf(!process.env.DUDAS)('verifican', () => {
  const ej: Record<string, () => import('../../src/engine/modelo').Proyecto> = { guia: ejemploGuia, asim: ejemploAsimetrico, citicorp: ejemploCiticorp, p34: ejemploPlanta34, chica: EX.ejemploBasicoExo, hancock: EX.ejemploHancock, hearst: EX.ejemploHearst, onterie: EX.ejemploOnterie, shanghai: EX.ejemploShanghai, ...((EX as Record<string, unknown>).ejemploGherkin ? { gherkin: (EX as unknown as Record<string, () => import('../../src/engine/modelo').Proyecto>).ejemploGherkin } : {}) };
  const solo = process.env.SOLO?.split(',');
  for (const [k, f] of Object.entries(ej)) for (const m of (process.env.MET?.split(',') ?? ['cirsoc', 'fem']) as ('cirsoc' | 'fem')[]) {
    if (solo && !solo.includes(k)) continue;
    const p = f(); estado.proyecto = { ...p, calculo: { ...(p.calculo ?? {}), metodo: m } }; estado.recalcular();
    const cs = estado.calculo.controles;
    const mal = cs.filter(x => x.estado === 'no verifica'), at = cs.filter(x => x.estado === 'atención');
    console.log(`${k} ${m}: ${cs.length} controles · no verifican ${mal.length} · atención ${at.length}${estado.calculo.error ? ' ERROR ' + estado.calculo.error : ''}`);
    mal.slice(0, 10).forEach(x => console.log('   ✗', x.grupo, '|', x.nombre, '|', typeof x.guia === 'number' ? x.guia.toFixed(3) : x.guia, '|', (x.nota ?? '').slice(0, 140)));
  }
});
