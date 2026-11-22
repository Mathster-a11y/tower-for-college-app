import { describe, expect, it } from 'vitest';
import { geometria2D } from '../src/viento/geometria2d';
import { perimetro, PromedioPerimetro } from '../src/viento/perimetro';
import { Lbm2D } from '../src/viento/lbm2d';

describe('Cp a lo largo del perímetro', () => {
  it('cuadrado: el perímetro mide 4 lados, 4 esquinas y arranca en la cara de barlovento', () => {
    const g = geometria2D({ poligonos: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]], dir: 'B', D: 16 });
    const p = perimetro(g);
    expect(p.largo).toBeCloseTo(40, 6);
    expect(p.esquinas.length).toBe(4);
    expect(p.celdas.length).toBeGreaterThan(50);
    // el primer tramo es la cara de barlovento (x mínima)
    expect(p.px[0]).toBeCloseTo(Math.min(...Array.from(p.px)), 3);
    expect(Math.abs(p.py[0] - 65)).toBeLessThan(1.5);                   // cerca del medio de la cara (y = 65)
  });
  it('en la cara de barlovento empuja (Cp > 0) y en los costados succiona (Cp < 0)', () => {
    const g = geometria2D({ poligonos: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]], dir: 'B', D: 12 });
    const u0 = 0.08, m = new Lbm2D({ nx: g.nx, ny: g.ny, nu: (u0 * 12) / 100, u0, solido: g.solido, q: g.q, colision: 'trt' });
    const p = perimetro(g), pr = new PromedioPerimetro(p, u0);
    for (let k = 0; k < 4000; k++) { m.paso(); if (k > 2000 && k % 10 === 0) pr.sumar(m.rho); }
    const t = pr.tramos(40), L = p.largo;
    // desde el medio de la cara de barlovento, en sentido antihorario: barlovento s < L/8 y s > 7L/8; costado de L/8 a 3L/8
    const barlo = t.filter(x => x.s < 0.08 * L || x.s > 0.92 * L), costado = t.filter(x => x.s > 0.16 * L && x.s < 0.34 * L);
    const mediaB = barlo.reduce((a, b) => a + b.cp, 0) / barlo.length;
    const mediaC = costado.reduce((a, b) => a + b.cp, 0) / costado.length;
    expect(mediaB).toBeGreaterThan(0.3);
    expect(mediaC).toBeLessThan(-0.3);
    expect(pr.extremos(40).min!.cp).toBeLessThan(mediaC + 1e-9);
  }, 60_000);
});
