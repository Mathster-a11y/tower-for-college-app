import { describe, expect, it } from 'vitest';
import { seccionReal } from './seccionPieza';
import { Jreal } from './mapping';
import type { Muro } from './modelo';

const tab = (id: string, dir: 'X' | 'Y', x: number, y: number, largo: number, e = 0.25): Muro => ({ id, dir, x, y, largo, espesor: e, llega: true, areaInf: 1, piezaA: 'P', pegadoA: '', piezaB: 'PB', pegadoB: '' });
describe('sección real: los muros que se pisan no se cuentan dos veces', () => {
  it('dos muros que no se tocan: null (la suma ya es exacta)', () => {
    expect(seccionReal([tab('a', 'X', 0, 0, 4), tab('b', 'X', 0, 3, 4)])).toBeNull();
  });
  it('dos muros en cruz: el cuadradito del medio una sola vez, y el J de la cruz', () => {
    const ms = [tab('a', 'X', 0, 0, 4), tab('b', 'Y', 0, 0, 4)];
    const s = seccionReal(ms)!;
    expect(s.Asuma).toBeCloseTo(2, 9);
    expect(s.superpuesta).toBeCloseTo(0.0625, 9);
    expect(s.A).toBeCloseTo(2 - 0.0625, 9);
    // J respecto de x de la cruz: el muro en y entero (0,25·4³/12) más el muro en x sin el cuadrado del medio
    const J = (0.25 * 4 ** 3) / 12 + 2 * ((1.875 * 0.25 ** 3) / 12);
    expect(s.Jx).toBeCloseTo(J, 6);
    expect(Jreal(ms, 'A')).toBeCloseTo(J, 6);
  });
  it('dos muros en L con las puntas superpuestas: el área de la L', () => {
    const s = seccionReal([tab('a', 'X', 2, 0, 4.25), tab('b', 'Y', 0, 2, 4.25)])!;
    expect(s.A).toBeCloseTo(2 * 4.25 * 0.25 - 0.25 * 0.25, 6);
  });
});
