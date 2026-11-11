import { describe, expect, it } from 'vitest';
import { continuar, aNumero } from '../src/ui/grilla';

describe('llenado como Excel', () => {
  it('un valor solo se repite', () => expect(continuar(['3'], 3)).toEqual(['3', '3', '3']));
  it('dos números siguen la serie (cotas que bajan de a 3 m)', () => expect(continuar(['61', '58'], 3)).toEqual(['55', '52', '49']));
  it('decimales con coma', () => expect(continuar(['0,5', '1'], 2)).toEqual(['1,5', '2']));
  it('números que no son serie: se repite el patrón', () => expect(continuar(['1', '2', '4'], 4)).toEqual(['1', '2', '4', '1']));
  it('texto con número: M1, M2 → M3, M4; 3º, 4º → 5º', () => {
    expect(continuar(['M1', 'M2'], 2)).toEqual(['M3', 'M4']);
    expect(continuar(['20º', '19º'], 2)).toEqual(['18º', '17º']);
  });
  it('texto sin serie se repite', () => expect(continuar(['T1', 'T1B'], 3)).toEqual(['T1', 'T1B', 'T1']));
  it('hacia arriba continúa la serie al revés', () => expect(continuar(['10', '7'], 2, true)).toEqual(['13', '16']));
  it('números con coma decimal o punto', () => {
    expect(aNumero('3,25')).toBe(3.25);
    expect(aNumero('3.25')).toBe(3.25);
    expect(aNumero('')).toBe(null);
    expect(Number.isNaN(aNumero('abc'))).toBe(true);
  });
});
