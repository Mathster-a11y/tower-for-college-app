import { describe, expect, it } from 'vitest';
import { ajustarContorno, areaSilueta, cajaSilueta, puntosSilueta, rectangulo, type Vertice } from '../src/engine/silueta';
import { enderezarAnillo, suavizarAnillo, areaConSigno } from '../src/engine/contorno';

describe('Bézier en la losa y la carpintería', () => {
  // cuadrado de 20 con el lado de arriba (de (10,10) a (-10,10)) como Bézier que sube 4 m en el medio
  const v: Vertice[] = [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10, c1: { x: 5, y: 15.333 }, c2: { x: -5, y: 15.333 } }, { x: -10, y: 10 }];
  it('puntosSilueta recorre la curva (pasa por el punto medio y por los extremos)', () => {
    const p = puntosSilueta(v, 10);
    expect(p.length).toBeGreaterThan(8);
    expect(Math.max(...p.map(q => q.y))).toBeCloseTo(10 + 0.75 * 5.333, 1);   // B(½) = ⅛P0 + ⅜C1 + ⅜C2 + ⅛P3
    expect(cajaSilueta(v).L).toBeCloseTo(24, 1);
  });
  it('el área suma la panza de la curva', () => {
    // área bajo una Bézier simétrica con controles a h: 2·(3/5)·h·... se compara con el polígono muy fino
    const a = areaSilueta(v);
    expect(a).toBeGreaterThan(400);
    expect(a).toBeLessThan(400 + 20 * 4);
  });
  it('ajustarContorno escala y centra también los puntos de control', () => {
    const m = ajustarContorno(v.map(q => ({ ...q, x: q.x * 100, y: q.y * 100, ...(q.c1 ? { c1: { x: q.c1.x * 100, y: q.c1.y * 100 }, c2: { x: q.c2!.x * 100, y: q.c2!.y * 100 } } : {}) })), 0.01, true);
    const c = cajaSilueta(m);
    expect(Math.abs(c.cx) + Math.abs(c.cy)).toBeLessThan(1e-3);
    expect(m[2].c1).toBeDefined();
  });
  it('suavizar: Bézier por todos los vértices, tangentes continuas; enderezar vuelve a los lados rectos', () => {
    const s = suavizarAnillo(rectangulo(20, 16));
    expect(s.every(q => q.c1 && q.c2)).toBe(true);
    // en cada vértice, el control que llega y el que sale están alineados con el vértice (sin quiebre)
    s.forEach((q, i) => {
      const prev = s[(i - 1 + s.length) % s.length];
      const ax = q.x - prev.c2!.x, ay = q.y - prev.c2!.y, bx = q.c1!.x - q.x, by = q.c1!.y - q.y;
      expect(Math.abs(ax * by - ay * bx)).toBeLessThan(1e-6);
    });
    expect(Math.abs(areaConSigno(s))).toBeGreaterThan(320);   // pasa por las esquinas: la curva queda por fuera del rectángulo
    expect(enderezarAnillo(s).every(q => !q.c1 && !q.b)).toBe(true);
  });
});
