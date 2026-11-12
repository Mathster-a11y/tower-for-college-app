import { describe, it, expect } from 'vitest';
import { ejemploGuia } from './modelo';
import { piezaTipo } from './piezasTipo';
import { aPlanilla } from './mapping';
import { calcularPlanilla, calcFilaJ } from './planilla';

describe('pórtico', () => {
  it('dos columnas en el plano del viento A van a la acción de pórtico de la hoja J', () => {
    const p = ejemploGuia();
    const cols = piezaTipo('pórtico', { h: 6, b: 0.6, e: 0.4, giro: 0 }, 0, 6, new Set(p.muros.map(m => m.id)));
    cols.forEach(m => { m.piezaA = 'P1'; m.piezaB = 'P1B'; });
    p.muros.push(...cols);
    const asig = aPlanilla(p);
    const pa = asig.piezas.find(z => z.nombre === 'P1')!;
    expect(pa.molde).toBe('pórtico');
    expect(pa.fila).toMatchObject({ AO: 0.4, AP: 0.6, AQ: 6, AT: 0.4, AU: 0.6 });
    // J = 2 · (0,4·0,6³/12 + 0,24·(3 − 0,3)²)
    const J = 2 * (0.4 * 0.6 ** 3 / 12 + 0.24 * 2.7 ** 2);
    expect(calcFilaJ(pa.fila, false, false).AX).toBeCloseTo(J, 6);
    expect(pa.Jreal).toBeCloseTo(J, 6);
    const pb = asig.piezas.find(z => z.nombre === 'P1B')!;
    expect(asig.papeles[cols[0].id].B).toBe('fuera del cálculo');
    expect(pb.avisos.join(' ')).toMatch(/en su plano/);
    expect(() => calcularPlanilla(asig.datos)).not.toThrow();
  });
});
