/**
 * Propuesta 1 del diagnóstico de viento: paredes exactas (rebote interpolado de Bouzidi) y colisión TRT.
 * La geometría da dónde corta la pared cada enlace; el canal con paredes que caen a mitad de celda recupera el perfil
 * de Poiseuille de la pared real; y el cilindro circular depende menos de la resolución que con la pared en escalera.
 */
import { describe, expect, it } from 'vitest';
import { Lbm2D } from '../src/viento/lbm2d';
import { distanciasPared, geometria2D } from '../src/viento/geometria2d';
import { medir } from '../src/viento/mediciones';

describe('dónde corta la pared cada enlace', () => {
  it('pared recta a 0,3 de la celda: q = 0,2 hacia el sólido de al lado y en diagonal también', () => {
    // sólido: x < 3,3 (las celdas 0, 1 y 2 tienen el centro adentro); la celda de aire 3 tiene el centro en 3,5
    const nx = 8, ny = 4, solido = new Uint8Array(nx * ny);
    for (let y = 0; y < ny; y++) for (let x = 0; x < 3; x++) solido[y * nx + x] = 1;
    const pol = [{ x: -1, y: -1 }, { x: 3.3, y: -1 }, { x: 3.3, y: 5 }, { x: -1, y: 5 }];
    const q = distanciasPared(nx, ny, solido, [pol]), N = nx * ny, c = 1 * nx + 3;
    expect(q[1 * N + c]).toBeCloseTo(0.2, 5);          // dirección 1 (+x) llega desde la celda 2
    expect(q[5 * N + c]).toBeCloseTo(0.2, 5);          // diagonal: mismo corte en fracción del enlace
    expect(q[3 * N + c]).toBe(0);                       // desde la derecha no hay sólido
  });
  it('un círculo: todos los enlaces con 0 < q ≤ 1', () => {
    const pts = Array.from({ length: 64 }, (_, k) => ({ x: Math.cos((k / 64) * 2 * Math.PI), y: Math.sin((k / 64) * 2 * Math.PI) }));
    const g = geometria2D({ poligonos: [pts], dir: 'B', D: 16 });
    let n = 0;
    for (let k = 0; k < g.q.length; k++) if (g.q[k] > 0) { n++; expect(g.q[k]).toBeLessThanOrEqual(1); }
    expect(n).toBeGreaterThan(50);
  });
});

/** canal de Poiseuille con las paredes en y0 y y1 (no caen en el borde de las celdas) */
function canal(exactas: boolean, colision: 'bgk' | 'trt') {
  const nx = 4, ny = 22, nu = 0.1, gx = 1e-6, y0 = 1.8, y1 = 19.4, H = y1 - y0;
  const solido = new Uint8Array(nx * ny);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (y + 0.5 < y0 || y + 0.5 > y1) solido[y * nx + x] = 1;
  const pols = [[{ x: -2, y: -2 }, { x: nx + 2, y: -2 }, { x: nx + 2, y: y0 }, { x: -2, y: y0 }], [{ x: -2, y: y1 }, { x: nx + 2, y: y1 }, { x: nx + 2, y: ny + 2 }, { x: -2, y: ny + 2 }]];
  const q = exactas ? distanciasPared(nx, ny, solido, pols, { x: true }) : undefined;
  const m = new Lbm2D({ nx, ny, nu, periodicoX: true, fuerza: [gx, 0], solido, q, colision });
  for (let k = 0; k < 20000; k++) m.paso();
  const umax = (gx * H * H) / (8 * nu);
  let peor = 0;
  for (let y = 0; y < ny; y++) {
    if (solido[y * nx + 1]) continue;
    const yy = y + 0.5 - y0, teo = (gx / (2 * nu)) * yy * (H - yy);
    peor = Math.max(peor, Math.abs(m.ux[y * nx + 1] - teo) / umax);
  }
  return peor;
}

describe('paredes exactas en un canal', () => {
  it('paredes entre celdas: en escalera el perfil se corre; exactas, error < 2 %', () => {
    const escalera = canal(false, 'trt'), exactas = canal(true, 'trt'), exactasBgk = canal(true, 'bgk');
    expect(exactasBgk).toBeLessThan(0.02);
    expect(exactas).toBeLessThan(0.02);
    expect(escalera).toBeGreaterThan(10 * exactas);
  });
});

/** cilindro circular a Re = 20 (flujo estacionario): Cd con D celdas por diámetro */
function cilindro(D: number, exactas: boolean) {
  const pts = Array.from({ length: 96 }, (_, k) => ({ x: Math.cos((k / 96) * 2 * Math.PI), y: Math.sin((k / 96) * 2 * Math.PI) }));
  const g = geometria2D({ poligonos: [pts], dir: 'B', D, largo: 10, alto: 6, entrada: 3 });
  const u0 = 0.08, nu = (u0 * g.D) / 20;
  const m = new Lbm2D({ nx: g.nx, ny: g.ny, nu, u0, solido: g.solido, q: exactas ? g.q : undefined, colision: 'trt', perturbacion: 0 });
  const pasos = Math.round((25 * g.D) / u0), Fx: number[] = [], Fy: number[] = [];
  for (let k = 0; k < pasos; k++) { m.paso(); if (k > pasos * 0.7) { Fx.push(m.Fx); Fy.push(m.Fy); } }
  return medir(Fx, Fy, u0, g.D).Cd;
}

describe('cilindro circular (Re = 20)', () => {
  it('con paredes exactas el arrastre cambia menos al cambiar la resolución', () => {
    const e10 = cilindro(10, false), e20 = cilindro(20, false), x10 = cilindro(10, true), x20 = cilindro(20, true);
    // el valor sin bloqueo es ≈ 2,0–2,1; el canal de 6 diámetros (periódico) lo sube un poco
    expect(x20).toBeGreaterThan(1.9); expect(x20).toBeLessThan(2.9);
    expect(Math.abs(x20 - x10)).toBeLessThan(Math.abs(e20 - e10));
  }, 120_000);
});

describe('paredes exactas en 3D', () => {
  it('prisma de planta corrida 0,3 de celda: q exacto en las caras; suelo y azotea donde corresponden', async () => {
    const { geometria3D } = await import('../src/viento/geometria3d');
    const { Lbm3D, perfilPotencia, EX3, EY3, EZ3 } = await import('../src/viento/lbm3d');
    const g = geometria3D({ niveles: [{ cota: 0, silueta: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }, { cota: 20, silueta: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }], dir: 'B', nx: 60, ny: 28, nz: 30 });
    const { celdas, q } = g.paredes;
    expect(celdas.length).toBeGreaterThan(50);
    // todo q entre 1 y 255 donde hay sólido; y los enlaces verticales que bajan a la azotea, con la azotea en su cota
    let vistos = 0;
    celdas.forEach((c, k) => {
      const z = Math.floor(c / (g.nx * g.ny));
      for (let i = 1; i < 19; i++) {
        const b = q[k * 19 + i];
        if (!b) continue;
        vistos++;
        expect(b).toBeGreaterThan(0); expect(b).toBeLessThanOrEqual(255);
        if (EX3[i] === 0 && EY3[i] === 0 && EZ3[i] === 1 && z > 1) {
          const plano = 20 * g.escala + 1;                                      // la azotea en coordenadas de la red
          expect(b / 255).toBeCloseTo(z + 0.5 - plano, 1);
        }
      }
    });
    expect(vistos).toBeGreaterThan(celdas.length);
    // y la simulación con paredes exactas y TRT es estable
    const m = new Lbm3D({ nx: g.nx, ny: g.ny, nz: g.nz, nu: 0.02, cs: 0.12, uIn: perfilPotencia(g.nz, 0.08, g.hC, 0.2), solido: g.solido, paredes: g.paredes, colision: 'trt' });
    for (let k = 0; k < 150; k++) m.paso();
    let finito = true; for (let k = 0; k < m.f.length; k++) if (!Number.isFinite(m.f[k])) { finito = false; break; }
    expect(finito).toBe(true);
  }, 60_000);
});
