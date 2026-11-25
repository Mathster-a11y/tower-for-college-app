import { describe, expect, it } from 'vitest';
import { interseccion } from './interseccion';

const A = (q: { x: number; y: number }[]) => Math.abs(q.reduce((s, a, i) => { const b = q[(i + 1) % q.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2);
const P = (xs: number[][]) => xs.map(([x, y]) => ({ x, y }));
const U = P([[0, 0], [24, 0], [24, 24], [16, 24], [16, 8], [8, 8], [8, 24], [0, 24]]);

describe('intersección exacta de polígonos', () => {
  it('U abajo y L arriba: dos piezas separadas, ninguna sobre el hueco de la U', () => {
    const L = P([[2, 10], [22, 10], [22, 22], [18, 22], [18, 16], [2, 16]]);
    const r = interseccion(U, L);
    expect(r.length).toBe(2);
    expect(A(r[0])).toBeCloseTo(60, 6);
    expect(A(r[1])).toBeCloseTo(36, 6);
    r.flat().forEach(q => expect(q.x <= 8 + 1e-9 || q.x >= 16 - 1e-9).toBe(true));
  });
  it('lados que coinciden: dos rectángulos iguales dan el mismo rectángulo (4 vértices)', () => {
    const R = P([[-10, -8], [10, -8], [10, 8], [-10, 8]]);
    const r = interseccion(R, R);
    expect(r.length).toBe(1); expect(r[0].length).toBe(4); expect(A(r[0])).toBeCloseTo(320, 6);
  });
  it('rectángulos corridos, en T y separados', () => {
    expect(A(interseccion(P([[0, 0], [20, 0], [20, 16], [0, 16]]), P([[5, 0], [25, 0], [25, 16], [5, 16]]))[0])).toBeCloseTo(15 * 16, 6);
    const T = P([[0, 10], [20, 10], [20, 16], [13, 16], [13, 30], [7, 30], [7, 16], [0, 16]]);
    const r = interseccion(U, T);                       // la T sobre la U: el palo de la T cae en el hueco
    expect(r.length).toBe(2); expect(r.reduce((s, q) => s + A(q), 0)).toBeCloseTo(8 * 6 + 4 * 6 + 1 * 8, 6);    // con el pedacito del palo sobre el brazo izquierdo
    expect(interseccion(P([[0, 0], [1, 0], [1, 1], [0, 1]]), P([[5, 5], [6, 5], [6, 6], [5, 6]]))).toEqual([]);
  });
  it('círculo (en puntos) y cuadrado: área del cuadrado dentro del círculo', () => {
    const c = Array.from({ length: 180 }, (_, i) => ({ x: 10 * Math.cos(i * Math.PI / 90), y: 10 * Math.sin(i * Math.PI / 90) }));
    const r = interseccion(c, P([[-5, -5], [5, -5], [5, 5], [-5, 5]]));
    expect(r.length).toBe(1); expect(A(r[0])).toBeCloseTo(100, 4);
  });
});
