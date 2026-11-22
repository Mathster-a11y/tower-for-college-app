import { describe, expect, it } from 'vitest';
import { categoriaLawson, factorPeaton, velocidad5 } from '../src/viento/confort';

describe('confort del peatón (Lawson LDDC)', () => {
  it('Rayleigh: con 4 m/s de media, el 5 % del tiempo se superan ≈ 7,8 m/s', () => {
    expect(velocidad5(4)).toBeCloseTo((4 / 0.886227) * Math.sqrt(-Math.log(0.05)), 9);
    expect(velocidad5(4)).toBeGreaterThan(7.7); expect(velocidad5(4)).toBeLessThan(7.9);
  });
  it('categorías en los umbrales 2,5 · 4 · 6 · 8 m/s', () => {
    expect(categoriaLawson(2).codigo).toBe('A'); expect(categoriaLawson(3).codigo).toBe('B');
    expect(categoriaLawson(5).codigo).toBe('C'); expect(categoriaLawson(7).codigo).toBe('D'); expect(categoriaLawson(9).codigo).toBe('E');
  });
  it('a 1,5 m el viento del campo abierto es menor que a 10 m', () => {
    expect(factorPeaton('B')).toBeLessThan(1); expect(factorPeaton('B')).toBeGreaterThan(0.7);
  });
});
