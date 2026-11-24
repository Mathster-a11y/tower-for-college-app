/**
 * Prototipo de V3: el D3Q19 de referencia (el mismo cálculo que corre en la placa de video).
 */
import { describe, expect, it } from 'vitest';
import { canalConPrisma, ESP3, EX3, EY3, EZ3, Lbm3D, OPP3, perfilPotencia, W19 } from '../src/viento/lbm3d';

describe('D3Q19 de referencia', () => {
  it('las 19 direcciones: pesos que suman 1, opuestas bien emparejadas e isotropía de segundo orden', () => {
    expect(W19.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    for (let i = 0; i < 19; i++) { expect(EX3[OPP3[i]] + EX3[i]).toBe(0); expect(EY3[OPP3[i]] + EY3[i]).toBe(0); expect(EZ3[OPP3[i]] + EZ3[i]).toBe(0); expect(ESP3[i]).toBeGreaterThanOrEqual(0); expect(EZ3[ESP3[i]] + EZ3[i]).toBe(0); }
    const m = (a: number[], b: number[]) => a.reduce((s, x, i) => s + W19[i] * x * b[i], 0);
    expect(m(EX3, EX3)).toBeCloseTo(1 / 3, 12); expect(m(EY3, EZ3)).toBeCloseTo(0, 12);
  });

  it('sin obstáculos ni suelo, el flujo uniforme queda uniforme', () => {
    const nx = 12, ny = 6, nz = 6, u0 = 0.05;
    const uIn = new Float32Array(nz).fill(u0);
    const m = new Lbm3D({ nx, ny, nz, nu: 0.05, uIn, solido: new Uint8Array(nx * ny * nz), perturbacion: 0 });
    for (let k = 0; k < 40; k++) m.paso();
    for (let c = 0; c < m.N; c++) { const q = m.macro(c); expect(Math.abs(q.u - u0)).toBeLessThan(1e-6); expect(Math.abs(q.v) + Math.abs(q.w)).toBeLessThan(1e-6); }
  });

  it('prisma en el canal: simétrico respecto de su eje, con recirculación detrás', () => {
    const nx = 48, ny = 21, nz = 16, a = 5, hT = 9, x0 = 12;
    const solido = canalConPrisma(nx, ny, nz, a, hT, x0);
    const m = new Lbm3D({ nx, ny, nz, nu: 0.02, cs: 0.12, uIn: perfilPotencia(nz, 0.08, 10, 0.2), solido });
    for (let k = 0; k < 500; k++) m.paso();
    const y0 = Math.floor((ny - a) / 2), yc = y0 + (a - 1) / 2;
    // simetría en y (el prisma está centrado: y ↔ 2·yc − y)
    let peor = 0;
    for (let z = 1; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const ys = 2 * yc - y; if (ys < 0 || ys >= ny || !Number.isInteger(ys)) continue;
      const p = m.macro((z * ny + y) * nx + x), q = m.macro((z * ny + ys) * nx + x);
      peor = Math.max(peor, Math.abs(p.u - q.u), Math.abs(p.v + q.v), Math.abs(p.w - q.w));
    }
    expect(peor).toBeLessThan(1e-5);
    // detrás del prisma, a media altura, el aire vuelve (u < 0)
    const atras = m.macro((Math.round(hT / 2) * ny + Math.round(yc)) * nx + x0 + a + 1);
    expect(atras.u).toBeLessThan(0);
    // y no se rompe
    for (let c = 0; c < m.N; c++) if (!solido[c]) { const q = m.macro(c); expect(q.r).toBeGreaterThan(0.8); expect(q.r).toBeLessThan(1.2); }
  }, 60000);

  it('perfil de entrada: crece con la altura y se corta arriba', () => {
    const u = perfilPotencia(40, 0.08, 20, 0.25);
    expect(u[0]).toBe(0);
    for (let z = 2; z < 40; z++) expect(u[z]).toBeGreaterThanOrEqual(u[z - 1]);
    expect(Math.max(...u)).toBeLessThanOrEqual(0.1 + 1e-9);
  });
});
