import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ejemploGuia, ejemploAsimetrico } from '../src/engine/modelo';
import { aPlanilla } from '../src/engine/mapping';
import { calcularPlanilla } from '../src/engine/planilla';
import { calcularCorregido } from '../src/engine/correcciones';
import { verificarDireccion } from '../src/engine/flexocompresion';
import { valoresFormulas } from '../src/xlsx/vistaPrevia';
import { HOJA_FLEX, FILA_A } from '../src/xlsx/hojaFlex';
import { config, type Motor } from '../src/engine/config';

const plantillas: Record<Motor, Buffer> = { actual: readFileSync('src/assets/planilla_virgen.xlsx'), nuevo: readFileSync('src/assets/planilla_catedra_2025.xlsx') };

describe('hoja «Flexocompresión PB»', () => {
  for (const motor of ['actual', 'nuevo'] as Motor[]) for (const f of [ejemploGuia, ejemploAsimetrico]) {
    it(`${motor} · ${f().nombre}: sin errores y, en los tabiques sueltos, igual que la app`, async () => {
      const antes = config.motor; config.motor = motor;
      try {
        const p = f(), a = aPlanilla(p), r = calcularPlanilla(a.datos);
        const v = (await valoresFormulas(plantillas[motor], a.datos, r, motor, { asig: a, p }))[HOJA_FLEX];
        expect(Object.keys(v).length).toBeGreaterThan(100);
        expect(Object.entries(v).filter(([, x]) => typeof x === 'object' && x !== null)).toEqual([]);
        // no lee nada que no sea de la planilla: cada fórmula usa celdas de esta hoja o de las de la cátedra
        // en el ejemplo de la guía (simétrico: la planilla no gira) los tabiques sueltos dan lo mismo que el motor de la app
        // (al 0,1 %: la hoja lee el momento de la planilla y la app el corregido)
        if (f !== ejemploGuia) return;
        const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
        const corr = calcularCorregido(a.datos, a.filaNivel[iPB] ?? 50, { proyecto: p, piezas: a.piezas });
        const app = verificarDireccion(p, a.piezas, corr, a.filaNivel, 'A', 300);
        let vistos = 0;
        a.piezas.filter(z => z.dir === 'A' && z.filaHoja !== null).forEach(z => {
          const vp = app.find(x => x.nombre === z.nombre)!;
          if (vp.muros.length !== 1) return;
          const fila = FILA_A + z.filaHoja!;
          expect(v[`S${fila}`] as number).toBeCloseTo(vp.traccion, 1);
          expect(v[`R${fila}`] as number).toBeCloseTo(vp.compresion, 1);
          expect(v[`W${fila}`] as number).toBeCloseTo(vp.muros[0].As, 1);
          vistos++;
        });
        expect(vistos).toBe(4);
      } finally { config.motor = antes; }
    });
  }
});
