import { describe, expect, it } from 'vitest';
import { moverBordeEnCorte, tramoCorte } from './corte';
import { cajaSilueta, rectangulo } from './silueta';

describe('corte de la torre', () => {
  it('el tramo que corta el plano, en x y en y', () => {
    const r = rectangulo(20, 16);
    expect(tramoCorte(r, 'x', 0)).toEqual([-10, 10]);
    expect(tramoCorte(r, 'y', 3)).toEqual([-8, 8]);
    expect(tramoCorte(r, 'x', 9)).toBeNull();
  });
  it('arrastrar el borde derecho en el corte corre ese lado (el rectángulo se agranda en x)', () => {
    const r = rectangulo(20, 16);
    const v = moverBordeEnCorte(r, 'x', 0, 'max', 12)!;
    expect(cajaSilueta(v)).toMatchObject({ B: 22, L: 16 });
    const w = moverBordeEnCorte(r, 'y', 0, 'min', -6)!;
    expect(cajaSilueta(w).L).toBeCloseTo(14, 9);
  });
  it('en un lado inclinado, el cruce queda donde se soltó', () => {
    const t = [{ x: -10, y: -8 }, { x: 10, y: -8 }, { x: 6, y: 8 }, { x: -6, y: 8 }];
    const v = moverBordeEnCorte(t, 'x', 0, 'max', 10)!;
    expect(tramoCorte(v, 'x', 0)![1]).toBeCloseTo(10, 3);   // las coordenadas se guardan con 0,1 mm
  });
});
