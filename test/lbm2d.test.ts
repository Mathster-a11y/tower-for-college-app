/**
 * Simulador de viento, etapa V2: validación del núcleo Lattice Boltzmann 2D (docs/plan_viento.html).
 * Canal de Poiseuille (perfil parabólico), conservación de la masa, el cuadrado en el canal (Strouhal y arrastre
 * contra la literatura, con tolerancias amplias) y la geometría pasada a celdas.
 */
import { describe, expect, it } from 'vitest';
import { Lbm2D } from '../src/viento/lbm2d';
import { areaPoligono, chaflanar, geometria2D } from '../src/viento/geometria2d';
import { frecuenciaCruces, medir, velocidadCritica } from '../src/viento/mediciones';

describe('núcleo Lattice Boltzmann D2Q9', () => {
  it('canal entre dos paredes con fuerza: perfil de Poiseuille (error < 2 %)', () => {
    const nx = 4, ny = 22, H = ny - 2, nu = 0.1, gx = 1e-6;
    const solido = new Uint8Array(nx * ny);
    for (let x = 0; x < nx; x++) { solido[x] = 1; solido[(ny - 1) * nx + x] = 1; }
    const m = new Lbm2D({ nx, ny, nu, periodicoX: true, fuerza: [gx, 0], solido });
    for (let k = 0; k < 20000; k++) m.paso();
    const umax = (gx * H * H) / (8 * nu);
    let peor = 0;
    for (let y = 1; y < ny - 1; y++) {
      const yy = y - 0.5, teo = (gx / (2 * nu)) * yy * (H - yy);           // las paredes, a mitad de camino
      peor = Math.max(peor, Math.abs(m.ux[y * nx + 1] - teo) / umax);
    }
    expect(peor).toBeLessThan(0.02);
  });

  it('una caja periódica conserva la masa', () => {
    const m = new Lbm2D({ nx: 40, ny: 30, nu: 0.05, periodicoX: true });
    for (let c = 0; c < m.N; c++) m.f[1 * m.N + c] += 0.01 * Math.sin((c % 40) / 6);   // una perturbación
    const m0 = m.masa();
    for (let k = 0; k < 500; k++) m.paso();
    expect(Math.abs(m.masa() - m0) / m0).toBeLessThan(1e-5);
    expect(m.roto).toBe(false);
  });

  it('cuadrado en el canal (Re = 100): se desprenden remolinos con St ≈ 0,13 a 0,17 y Cd ≈ 1,4 a 2,4', () => {
    const geo = geometria2D({ poligonos: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]], dir: 'B', D: 12 });
    const u0 = 0.08, Re = 100, nu = (u0 * geo.D) / Re;
    const m = new Lbm2D({ nx: geo.nx, ny: geo.ny, nu, u0, solido: geo.solido });
    const Fx: number[] = [], Fy: number[] = [];
    for (let k = 0; k < 26000; k++) { m.paso(); if (k >= 12000) { Fx.push(m.Fx); Fy.push(m.Fy); } }
    expect(m.roto).toBe(false);
    const r = medir(Fx, Fy, u0, geo.D);
    expect(r.St).not.toBeNull();
    expect(r.St!).toBeGreaterThan(0.13); expect(r.St!).toBeLessThan(0.17);
    expect(r.Cd).toBeGreaterThan(1.4); expect(r.Cd).toBeLessThan(2.4);
    expect(Math.abs(r.Cl)).toBeLessThan(0.15);                              // la fuerza lateral oscila alrededor de 0
  }, 60000);

  it('con Smagorinsky aguanta un Reynolds alto sin romperse', () => {
    const geo = geometria2D({ poligonos: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]], dir: 'B', D: 10 });
    const u0 = 0.1, nu = (u0 * geo.D) / 20000;
    const m = new Lbm2D({ nx: geo.nx, ny: geo.ny, nu, u0, cs: 0.17, solido: geo.solido });
    for (let k = 0; k < 4000; k++) m.paso();
    expect(m.roto).toBe(false);
  }, 30000);
});

describe('la planta en celdas', () => {
  const L = [{ x: -6, y: -4 }, { x: 6, y: -4 }, { x: 6, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 4 }, { x: -6, y: 4 }];   // una L de 72 m²
  it('el área de celdas da el área de la planta (± 2 %)', () => {
    for (const dir of ['A', 'B'] as const) for (const angulo of [0, 30]) {
      const g = geometria2D({ poligonos: [L], dir, angulo, D: 40 });
      expect(Math.abs(g.celdasTorre / g.escala ** 2 - 72) / 72).toBeLessThan(0.02);
    }
  });
  it('el viento A mira el ancho en x; el B, en y', () => {
    expect(geometria2D({ poligonos: [L], dir: 'A', D: 20 }).anchoM).toBeCloseTo(12, 9);
    expect(geometria2D({ poligonos: [L], dir: 'B', D: 20 }).anchoM).toBeCloseTo(8, 9);
  });
  it('ochavas: cortan solo las esquinas convexas', () => {
    const c = chaflanar(L, 1);
    expect(c.length).toBe(L.length + 5);                                    // 5 convexas, 1 cóncava
    expect(areaPoligono(c)).toBeCloseTo(72 - 5 * 0.5, 9);
  });
  it('segunda torre detrás o al lado', () => {
    const una = geometria2D({ poligonos: [L], dir: 'B', D: 16 });
    const det = geometria2D({ poligonos: [L], dir: 'B', D: 16, segunda: { donde: 'detras', distancia: 2 } });
    const lad = geometria2D({ poligonos: [L], dir: 'B', D: 16, segunda: { donde: 'lado', distancia: 1 } });
    const n = (s: Uint8Array) => s.reduce((a, b) => a + b, 0);
    expect(n(det.solido)).toBe(2 * una.celdasTorre); expect(n(lad.solido)).toBe(2 * una.celdasTorre);
    expect(lad.ny).toBeGreaterThan(una.ny);
  });
});

describe('mediciones', () => {
  it('frecuencia de una senoidal', () => {
    const s = Array.from({ length: 5000 }, (_, i) => Math.sin(2 * Math.PI * 0.0123 * i) + 0.3);
    expect(frecuenciaCruces(s)!).toBeCloseTo(0.0123, 5);
  });
  it('frecuencia de una senoidal con ruido de alta frecuencia', () => {
    let z = 7; const azar = () => { z = (z * 1664525 + 1013904223) >>> 0; return z / 4294967296 - 0.5; };
    const s = Array.from({ length: 20000 }, (_, i) => Math.sin(2 * Math.PI * 0.004 * i) + 0.5 * azar() + 0.2 * Math.sin(2 * Math.PI * 0.11 * i));
    expect(frecuenciaCruces(s)!).toBeCloseTo(0.004, 4);
  });
  it('V crítica = n1 · B / St', () => {
    expect(velocidadCritica(0.2, 20, 0.13)).toBeCloseTo(30.769, 3);
  });
});

describe('mediciones al arrancar', () => {
  it('sin remolinos formados (fuerza lateral chica) no da Strouhal', () => {
    let z = 3; const azar = () => { z = (z * 1664525 + 1013904223) >>> 0; return z / 4294967296 - 0.5; };
    const n = 4000, u0 = 0.1, D = 20, q = 0.5 * u0 * u0 * D;
    const Fx = Array.from({ length: n }, () => 2 * q), Fy = Array.from({ length: n }, (_, i) => q * (0.05 * Math.sin(i / 40) + 0.05 * azar()));
    expect(medir(Fx, Fy, u0, D).St).toBeNull();
  });
});
