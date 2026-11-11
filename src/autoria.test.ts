import { describe, expect, it } from 'vitest';
import { avisoActual, vigente } from './autoria';

describe('licencia por un año', () => {
  it('vale del 11/11/2026 al 11/11/2027 inclusive', () => {
    expect(vigente(new Date('2026-11-11T12:00:00-03:00'))).toBe(true);
    expect(vigente(new Date('2027-11-11T23:00:00-03:00'))).toBe(true);
    expect(vigente(new Date('2027-11-12T00:30:00-03:00'))).toBe(false);
  });
  it('después del plazo, el aviso dice que todos los derechos quedan reservados', () => {
    expect(avisoActual(new Date('2026-12-01'))).toContain('hasta el 11/11/2027');
    expect(avisoActual(new Date('2028-01-01'))).toContain('Todos los derechos reservados');
  });
});
