/**
 * Túnel 3D (V3 completa): la torre del proyecto en celdas, el perfil del 102-25, las caras y el Cp promediado.
 */
import { describe, expect, it } from 'vitest';
import { ejemploGuia } from '../src/engine/modelo';
import { plantaDeNivel, puntosSilueta } from '../src/engine/silueta';
import { Kz } from '../src/engine/cargas/cirsoc102';
import { celdaReferencia, celdasDeCara, cpReglamento, geometria3D, perfil102, PromedioCp, type NivelPlanta } from '../src/viento/geometria3d';
import { Lbm3D } from '../src/viento/lbm3d';

const rect = (B: number, L: number) => [{ x: -B / 2, y: -L / 2 }, { x: B / 2, y: -L / 2 }, { x: B / 2, y: L / 2 }, { x: -B / 2, y: L / 2 }];

describe('la torre en celdas', () => {
  it('ejemplo de la guía: el volumen en celdas da el de la torre (± 6 %)', () => {
    const p = ejemploGuia();
    const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1), zPB = p.niveles[iPB].cota;
    const niveles: NivelPlanta[] = p.niveles.slice(0, iPB).map((n, i) => ({ cota: n.cota - zPB, silueta: puntosSilueta(plantaDeNivel(p, i).silueta, 12) }));
    const g = geometria3D({ niveles, dir: 'A', nx: 160, ny: 80, nz: 64 });
    const vol = niveles.slice().sort((a, b) => a.cota - b.cota).reduce((s, n, k, arr) => s + 20 * 16 * (n.cota - (k ? arr[k - 1].cota : 0)), 0);
    expect(Math.abs(g.celdas / g.escala ** 3 - vol) / vol).toBeLessThan(0.06);
    expect(g.B).toBeCloseTo(20, 6); expect(g.L).toBeCloseTo(16, 6);               // viento A: ancho en x
    expect(g.hC).toBeLessThanOrEqual(Math.ceil(63 / 1.5));
  });
  it('un retiro arriba: la planta de arriba es más chica', () => {
    const niveles: NivelPlanta[] = [{ cota: 30, silueta: rect(20, 20) }, { cota: 60, silueta: rect(10, 10) }];
    const g = geometria3D({ niveles, dir: 'B', nx: 120, ny: 60, nz: 60 });
    const area = (z: number) => { let n = 0; for (let y = 0; y < g.ny; y++) for (let x = 0; x < g.nx; x++) n += g.solido[(z * g.ny + y) * g.nx + x]; return n / g.escala ** 2; };
    // con unas 13 celdas por lado, el error de pasar a celdas es de una fila
    expect(Math.abs(area(Math.round(15 * g.escala)) - 400) / 400).toBeLessThan(0.12);
    expect(Math.abs(area(Math.round(45 * g.escala)) - 100) / 100).toBeLessThan(0.25);
    expect(area(Math.round(45 * g.escala))).toBeLessThan(area(Math.round(15 * g.escala)) / 2.5);
  });
});

describe('perfil de entrada del 102-25', () => {
  it('u ∝ √Kz, constante debajo de 5 m, uH en la altura de la torre', () => {
    const esc = 0.5, H = 60, u = perfil102(50, esc, H, 'B', 0.08);
    const zH = Math.round(H * esc + 0.5);
    expect(u[zH]).toBeCloseTo(0.08 * Math.sqrt(Kz((zH - 0.5) / esc, 'B') / Kz(H, 'B')), 7);   // f32
    expect(u[1]).toBeCloseTo(u[2], 7);                                             // 1 y 3 m: los dos con Kz de 5 m
    for (let z = 3; z < 50; z++) expect(u[z]).toBeGreaterThanOrEqual(u[z - 1]);
  });
});

describe('caras y Cp promediado', () => {
  it('prisma: las celdas de cada cara y el Cp con el signo del reglamento', () => {
    const g = geometria3D({ niveles: [{ cota: 30, silueta: rect(10, 10) }], dir: 'B', nx: 60, ny: 28, nz: 24, altoRel: 1.6 });
    const caras = celdasDeCara(g);
    const n = (c: string) => caras.filter(x => x.cara === c).length;
    const a = g.caja.y1 - g.caja.y0 + 1, b = g.caja.x1 - g.caja.x0 + 1;
    let capas = 0; for (let z = 1; z < g.nz; z++) if (g.solido[(z * g.ny + g.caja.y0) * g.nx + g.caja.x0]) capas++;
    expect(n('barlovento')).toBe(a * capas); expect(n('sotavento')).toBe(a * capas); expect(n('lateral')).toBe(2 * b * capas); expect(Math.abs(capas - g.hC)).toBeLessThanOrEqual(1); expect(n('cubierta')).toBe(a * b);
    const uH = 0.08, uIn = perfil102(g.nz, g.escala, g.H, 'C', uH);
    const m = new Lbm3D({ nx: g.nx, ny: g.ny, nz: g.nz, nu: 0.02, cs: 0.15, uIn, solido: g.solido });
    const pr = new PromedioCp(caras, uH, celdaReferencia(g)), N = g.nx * g.ny * g.nz, rho = new Float32Array(N);
    for (let k = 0; k < 600; k++) {
      m.paso();
      if (k >= 300 && k % 20 === 0) { for (let c = 0; c < N; c++) rho[c] = g.solido[c] ? 0 : m.macro(c).r; pr.sumar(rho); }
    }
    const cp = pr.porCara();
    expect(cp.barlovento).toBeGreaterThan(0.3);
    expect(cp.lateral).toBeLessThan(0); expect(cp.sotavento).toBeLessThan(0); expect(cp.cubierta).toBeLessThan(0);
    expect(cpReglamento(g).sotavento).toBe(-0.5);
  }, 120000);
});
