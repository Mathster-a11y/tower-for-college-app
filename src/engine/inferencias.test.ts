import { describe, expect, it } from 'vitest';
import { inferir, puntosDeMuros } from './dibujo';
import type { Muro } from './modelo';

const muro = (id: string, dir: 'X' | 'Y', x: number, y: number, largo: number): Muro => ({ id, dir, x, y, largo, espesor: 0.2, llega: true, areaInf: 1, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '' });
const ms = [muro('M1', 'X', 0, 0, 6), muro('M2', 'Y', 10, 5, 4)];

describe('inferencias al dibujar', () => {
  it('extremos y medios de los muros, con su nombre', () => {
    expect(puntosDeMuros(ms).map(r => r.rotulo)).toContain('medio de M1');
    expect(inferir({ x: 3.1, y: 0.1 }, ms, 0.3)).toMatchObject({ a: 'extremo', rotulo: 'extremo de M1', p: { x: 3, y: 0 } });
    expect(inferir({ x: 0.1, y: -0.1 }, ms, 0.3)).toMatchObject({ a: 'medio', rotulo: 'medio de M1', p: { x: 0, y: 0 } });
    expect(inferir({ x: 1.6, y: 0.2 }, ms, 0.3)).toMatchObject({ a: 'eje', rotulo: 'sobre M1' });
  });
  it('alineado en x o en y con un punto, y al cruce de las dos alineaciones', () => {
    const a = inferir({ x: 3.1, y: 4.37 }, ms, 0.3);
    expect(a).toMatchObject({ a: 'alineado', rotulo: '↕ alineado con extremo de M1', p: { x: 3 } });
    expect(a.guias).toHaveLength(1);
    // x como el extremo derecho de M1 (3) e y como el extremo de arriba de M2 (7)
    const c = inferir({ x: 2.9, y: 7.2 }, ms, 0.3);
    expect(c.p).toEqual({ x: 3, y: 7 });
    expect(c.rotulo).toBe('↕ extremo de M1 · ↔ extremo de M2');
    expect(c.guias).toHaveLength(2);
  });
  it('a 90°: solo se ajusta la coordenada libre; los puntos extra (vértices dibujados) también cuentan', () => {
    const r = inferir({ x: 7.04, y: 2 }, ms, 0.3, [{ p: { x: 7, y: -3 }, rotulo: 'vértice 1' }], 'x');
    expect(r.p).toEqual({ x: 7, y: 2 });
    expect(r.rotulo).toBe('↕ alineado con vértice 1');
    expect(inferir({ x: 20, y: 20 }, ms, 0.3).a).toBe('grilla');
  });
});
