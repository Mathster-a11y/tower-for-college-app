import { describe, expect, it } from 'vitest';
import { canalConPrisma, Lbm3D, perfilPotencia } from '../src/viento/lbm3d';
import { Lbm3DWasm } from '../src/viento/lbm3dWasm';
import { geometria3D } from '../src/viento/geometria3d';

describe('D3Q19 en WebAssembly', () => {
  it('da lo mismo que el de JavaScript (prisma, BGK con Smagorinsky)', () => {
    const nx = 40, ny = 20, nz = 16, solido = canalConPrisma(nx, ny, nz, 6, 8, 10), uIn = perfilPotencia(nz, 0.08, 8, 0.15);
    const o = { nx, ny, nz, nu: 0.005, cs: 0.16, uIn, solido };
    const a = new Lbm3D(o), b = new Lbm3DWasm(o);
    for (let k = 0; k < 60; k++) { a.paso(); b.paso(); }
    let d = 0; const fa = a.f, fb = b.f; for (let i = 0; i < fa.length; i++) d = Math.max(d, Math.abs(fa[i] - fb[i]));
    expect(d).toBeLessThan(1e-6);
  });
  it('da lo mismo con la torre real: paredes exactas y TRT', () => {
    const torre = [{ x: -10, y: -8 }, { x: 10, y: -8 }, { x: 12, y: 0 }, { x: 10, y: 8 }, { x: -10, y: 8 }];
    const g = geometria3D({ niveles: [0, 20, 40].map(c => ({ cota: c, silueta: torre })), dir: 'A', nx: 48, ny: 24, nz: 20 });
    const o = { nx: g.nx, ny: g.ny, nz: g.nz, nu: 0.002, cs: 0.16, uIn: perfilPotencia(g.nz, 0.08, g.hC, 0.15), solido: g.solido, paredes: g.paredes, colision: 'trt' as const };
    const a = new Lbm3D(o), b = new Lbm3DWasm(o);
    for (let k = 0; k < 60; k++) { a.paso(); b.paso(); }
    let d = 0; const fa = a.f, fb = b.f; for (let i = 0; i < fa.length; i++) d = Math.max(d, Math.abs(fa[i] - fb[i]));
    expect(d).toBeLessThan(1e-6);
    // y más rápido
    const t0 = performance.now(); for (let k = 0; k < 20; k++) a.paso(); const tJS = performance.now() - t0;
    const t1 = performance.now(); b.avanzar(20); const tW = performance.now() - t1;
    console.log(`MLUPS: JavaScript ${(20 * a.N / tJS / 1000).toFixed(2)} · WebAssembly ${(20 * b.N / tW / 1000).toFixed(2)}`);
  });
});
