import { describe, expect, it } from 'vitest';
import { contornoAlViento, puntosSilueta } from '../src/engine/silueta';
import type { Proyecto } from '../src/engine/modelo';

const proyecto = (carp: unknown): Proyecto => ({
  niveles: [
    { nombre: 'Azotea', cota: 30, B: 20, L: 16, carpinteria: carp },
    { nombre: 'PB', cota: 0, B: 20, L: 16 },
  ],
} as unknown as Proyecto);

describe('contorno que recibe el viento', () => {
  it('sin carpintería usa la losa', () => {
    expect(contornoAlViento(proyecto(null), 1).de).toBe('losa');
  });
  it('con carpintería curva usa la carpintería y expande el arco', () => {
    const c = [{ x: -10, y: -8 }, { x: 10, y: -8 }, { x: 10, y: 8, b: 0.3033 }, { x: -10, y: 8 }];
    const r = contornoAlViento(proyecto(c), 1);
    expect(r.de).toBe('carpintería');
    const pts = puntosSilueta(r.v, 12);
    expect(pts.length).toBeGreaterThan(4);
    expect(Math.max(...pts.map(q => q.y))).toBeGreaterThan(8 + 2.5);   // la flecha del arco: 10·0,3033 ≈ 3 m
  });
});
