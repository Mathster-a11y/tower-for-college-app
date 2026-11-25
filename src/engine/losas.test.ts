import { describe, expect, it } from 'vitest';
import { antihorario, FORMAS_LOSA, formaLosa, ladosLosa, salienteEnLado, seCruza, type FormaLosa } from './losas';
import { areaSilueta, cajaSilueta, type Vertice } from './silueta';

const ok = (x: Vertice[] | { error: string }) => { if ('error' in x) throw new Error(x.error); return x; };

describe('losas desde cero', () => {
  it('cada forma con sus medidas de siempre: caja, área esperada y sin cruces', () => {
    const esperada: Partial<Record<FormaLosa, number>> = { rect: 320, circulo: Math.PI * 81, elipse: Math.PI * 12 * 8, L: 24 * 10 + 10 * 10, T: 24 * 9 + 9 * 11, U: 26 * 8 + 2 * 8 * 12, cruz: 26 * 10 * 2 - 100, trapecio: (24 + 14) / 2 * 16, estadio: 16 * 14 + Math.PI * 49 };
    (Object.keys(FORMAS_LOSA) as FormaLosa[]).forEach(f => {
      const v = ok(formaLosa(f, FORMAS_LOSA[f].def));
      expect(seCruza(v), f).toBe(false);
      const c = cajaSilueta(v), d = FORMAS_LOSA[f].def;
      if (f !== 'poligono') expect(c.B, f).toBeCloseTo(d.B, 1);
      if (f !== 'poligono') expect(c.cx, f).toBeCloseTo(0, 6);
      if (esperada[f] !== undefined) expect(areaSilueta(v), f).toBeCloseTo(esperada[f]!, 0);
    });
  });
  it('avisa las medidas que no alcanzan', () => {
    expect(formaLosa('L', { B: 10, L: 10, a: 12 })).toHaveProperty('error');
    expect(formaLosa('redondeado', { B: 10, L: 8, r: 5 })).toHaveProperty('error');
    expect(formaLosa('estadio', { B: 10, L: 12 })).toHaveProperty('error');
  });
  it('saliente (balcón) y entrante (retiro) en el lado de abajo de un rectángulo', () => {
    const r = ok(formaLosa('rect', { B: 20, L: 16 }));
    const abajo = ladosLosa(r).find(l => l.mira.startsWith('abajo'))!;
    const bal = ok(salienteEnLado(r, abajo.i, 6, 2));
    expect(areaSilueta(bal)).toBeCloseTo(320 + 12, 6);
    expect(cajaSilueta(bal).L).toBeCloseTo(18, 6);
    const ret = ok(salienteEnLado(r, abajo.i, 6, -3, 3));
    expect(areaSilueta(ret)).toBeCloseTo(320 - 18, 6);
    // a todo lo ancho: no quedan vértices alineados de más
    const todo = ok(salienteEnLado(r, abajo.i, 20, 2));
    expect(todo).toHaveLength(4);
    expect(areaSilueta(todo)).toBeCloseTo(360, 6);
    expect(salienteEnLado(r, abajo.i, 30, 2)).toHaveProperty('error');
    expect(salienteEnLado(r, abajo.i, 6, -20)).toHaveProperty('error');
  });
  it('un contorno dibujado al revés (horario) se da vuelta; uno cruzado se detecta', () => {
    const h: Vertice[] = [{ x: 0, y: 0 }, { x: 0, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 0 }];
    expect(areaSilueta(antihorario(h))).toBeCloseTo(25, 9);
    expect(seCruza([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 5, y: 0 }, { x: 0, y: 5 }])).toBe(true);
  });
});
