import { describe, expect, it } from 'vitest';
import { dentroPol, sacarAfuera } from './tunel3dVista';

describe('túnel 3D · las líneas de corriente no entran en la torre', () => {
  const pol = [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 18 }, { x: 10, y: 18 }];
  const cuerpos = [{ pol, h0: 0, h1: 40 }], escala = 1, margen = 0.5;
  it('un punto adentro, cerca de una esquina, sale por el borde más cercano con el margen', () => {
    const p = [10.2, 10.6, 20];
    expect(sacarAfuera(p, cuerpos, escala, margen)).toBe(true);
    expect(dentroPol(pol, p[0], p[1])).toBe(false);
    expect(p[0]).toBeCloseTo(9.5, 6); expect(p[1]).toBeCloseTo(10.6, 6);
  });
  it('un punto afuera pero a menos del margen se aleja; uno lejos no se toca', () => {
    const p = [20.2, 14, 5]; sacarAfuera(p, cuerpos, escala, margen); expect(p[0]).toBeCloseTo(20.5, 6);
    const lejos = [25, 14, 5]; expect(sacarAfuera(lejos, cuerpos, escala, margen)).toBe(false); expect(lejos).toEqual([25, 14, 5]);
  });
  it('en la esquina, afuera en diagonal, queda a «margen» del vértice', () => {
    const p = [9.9, 9.9, 10]; sacarAfuera(p, cuerpos, escala, margen);
    expect(Math.hypot(p[0] - 10, p[1] - 10)).toBeCloseTo(0.5, 6);
  });
  it('adentro y cerca de la azotea: sale por arriba', () => {
    const p = [15, 14, 39.8]; sacarAfuera(p, cuerpos, escala, margen);
    expect(p[2]).toBeCloseTo(40.5, 6); expect(p[0]).toBe(15);
  });
  it('arriba de la azotea, fuera del margen, no se toca', () => {
    const p = [15, 14, 41]; expect(sacarAfuera(p, cuerpos, escala, margen)).toBe(false);
  });
});
