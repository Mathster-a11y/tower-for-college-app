import { describe, expect, it } from 'vitest';
import { FIDELIDAD, nivelDe2D, nivelDe3D, ORDEN_FIDELIDAD } from '../src/ui/fidelidad';

describe('niveles de fidelidad', () => {
  it('cada nivel se reconoce por sus opciones; otra combinación es «a medida»', () => {
    for (const f of ORDEN_FIDELIDAD) {
      expect(nivelDe3D(FIDELIDAD[f].d3)).toBe(f);
      expect(nivelDe2D(FIDELIDAD[f].d2, f === 'maxima')).toBe(f);
    }
    expect(nivelDe2D({ res: 'fina', paredes: 'escalera', canal: 'ancho' }, false)).toBeNull();
    expect(nivelDe3D({ motor: 'placa', tam: 'fino', paredes: 'escalera' })).toBeNull();
  });
  it('de básica a máxima, la grilla nunca se achica', () => {
    const celdas2D: Record<string, number> = { rapida: 14, normal: 20, fina: 30 }, celdas3D: Record<string, number> = { rapida: 1, liviano: 2, fino: 3 };
    const d2 = ORDEN_FIDELIDAD.map(f => celdas2D[FIDELIDAD[f].d2.res]), d3 = ORDEN_FIDELIDAD.slice(1).map(f => celdas3D[FIDELIDAD[f].d3.tam]);
    expect(d2).toEqual([...d2].sort((a, b) => a - b)); expect(d3).toEqual([...d3].sort((a, b) => a - b));
  });
});
