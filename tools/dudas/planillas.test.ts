/**
 * Planillas llenas para las capturas del documento de dudas (docs/dudas_planilla): los tres ejemplos escritos en la
 * planilla anterior y en la 2025, como los exporta la app (solo datos, sin hojas «G ·»). Solo corre con DUDAS=1.
 * Después: python3 tools/dudas/capturas.py (LibreOffice recalcula, resalta y exporta cada recorte).
 */
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ejemploGuia, ejemploAsimetrico } from '../../src/engine/modelo';
import { ejemploPlanta34 } from '../../src/engine/ejemplo34';
import { aPlanilla } from '../../src/engine/mapping';
import { calcularPlanilla } from '../../src/engine/planilla';
import { escribirPlanilla } from '../../src/xlsx/planilla';
import { config } from '../../src/engine/config';

const DIR = 'docs/dudas_planilla/planillas';
it.skipIf(!process.env.DUDAS)('planillas llenas de los tres ejemplos', async () => {
  mkdirSync(DIR, { recursive: true });
  const ejemplos = [['guia', ejemploGuia()], ['asim', ejemploAsimetrico()], ['p34', ejemploPlanta34()]] as const;
  for (const motor of ['actual', 'nuevo'] as const) {
    const plantilla = readFileSync(motor === 'actual' ? 'src/assets/planilla_virgen.xlsx' : 'src/assets/planilla_catedra_2025.xlsx');
    const antes = config.motor;
    config.motor = motor;
    try {
      for (const [k, p0] of ejemplos) {
        const p = { ...p0, calculo: { ...(p0.calculo ?? {}), metodo: 'planilla' as const } };
        const a = aPlanilla(p);
        const r = calcularPlanilla(a.datos);
        const bytes = await escribirPlanilla(plantilla, a.datos, r, p, undefined, undefined, { motor, virgen: true, asig: a });
        writeFileSync(`${DIR}/${k}_${motor === 'actual' ? 'anterior' : '2025'}.xlsx`, bytes);
        // qué fila de cada hoja ocupa cada pieza (para elegir los recortes)
        writeFileSync(`${DIR}/${k}_${motor === 'actual' ? 'anterior' : '2025'}.json`, JSON.stringify({
          piezas: a.piezas.map(z => ({ nombre: z.nombre, dir: z.dir, fila: z.filaHoja, molde: z.molde, tipoFila: z.fila })),
          avisos: a.avisos,
        }, null, 1));
      }
    } finally { config.motor = antes; }
  }
}, 120000);
