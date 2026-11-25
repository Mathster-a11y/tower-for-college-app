import { describe, expect, it } from 'vitest';
import { celdasDeCara, celdaReferencia, geometria3D, grillaBanda } from './geometria3d';
import { MedicionBanda } from './banda3d';

const rect = (b: number, l: number) => [{ x: -b / 2, y: -l / 2 }, { x: b / 2, y: -l / 2 }, { x: b / 2, y: l / 2 }, { x: -b / 2, y: l / 2 }];

describe('túnel 3D · banda de pisos', () => {
  it('sin suelo, la torre de borde a borde, sin cubierta; la escala la da la franja', () => {
    const niveles = [{ cota: 0, silueta: rect(20, 20) }, { cota: 100, silueta: rect(20, 20) }];
    const T = grillaBanda(60000, 20, 20, 8);
    expect(Math.abs((T.nx * T.ny * T.nz) / 60000 - 1)).toBeLessThan(0.1);
    const g = geometria3D({ niveles, dir: 'B', nx: T.nx, ny: T.ny, nz: T.nz, banda: { z0: 40, z1: 48 } });
    expect(g.banda).toEqual({ z0: 40, z1: 48 }); expect(g.H).toBe(8); expect(g.hC).toBe(T.nz);
    // ninguna celda del piso de abajo es suelo: solo la torre
    let abajo = 0; for (let k = 0; k < g.nx * g.ny; k++) abajo += g.solido[k];
    expect(abajo).toBeGreaterThan(0); expect(abajo).toBeLessThan(0.1 * g.nx * g.ny);
    // la torre está en todas las capas, igual
    const capa = (z: number) => { let s = 0; for (let k = 0; k < g.nx * g.ny; k++) s += g.solido[z * g.nx * g.ny + k]; return s; };
    for (let z = 0; z < g.nz; z++) expect(capa(z)).toBe(abajo);
    const caras = celdasDeCara(g);
    expect(caras.some(c => c.cara === 'cubierta')).toBe(false);
    expect(caras.some(c => c.z === 0)).toBe(true);
    // un quinto del ancho del túnel
    expect((g.B * g.escala) / g.ny).toBeLessThanOrEqual(0.2 + 1e-9);
  });
  it('con un retiro dentro de la franja: dos plantas y un plano de cambio', () => {
    const niveles = [{ cota: 0, silueta: rect(30, 30) }, { cota: 44, silueta: rect(20, 20) }, { cota: 100, silueta: rect(20, 20) }];
    const g = geometria3D({ niveles, dir: 'B', nx: 120, ny: 120, nz: 16, banda: { z0: 40, z1: 48 } });
    expect(g.tramos.length).toBe(2);
    expect(g.tramos[0].h1).toBeCloseTo(4, 6);
    expect(g.B).toBeCloseTo(30, 6);
  });
  it('Cd con un campo inventado: barlovento con Cp = +1 y sotavento con −1 dan Cd = 2', () => {
    const niveles = [{ cota: 0, silueta: rect(20, 20) }, { cota: 100, silueta: rect(20, 20) }];
    const g = geometria3D({ niveles, dir: 'B', nx: 100, ny: 100, nz: 10, banda: { z0: 40, z1: 50 } });
    const U = 0.08, caras = celdasDeCara(g), ref = celdaReferencia(g), m = new MedicionBanda(caras, g, U, ref);
    const campo = new Float32Array(g.nx * g.ny * g.nz * 4).fill(0);
    for (let k = 0; k < g.nx * g.ny * g.nz; k++) campo[k * 4 + 3] = 1;
    const q = 0.5 * U * U;
    caras.forEach(c => { if (c.cara === 'barlovento') campo[c.celda * 4 + 3] = 1 + 3 * q; if (c.cara === 'sotavento') campo[c.celda * 4 + 3] = 1 - 3 * q; });
    m.sumar(campo, 0);
    const r = m.resultado();
    // las celdas de cara de la red cubren el ancho entero: Cd = 2 con B en celdas
    const anchoCeldas = caras.filter(c => c.cara === 'barlovento').length / g.nz;
    expect(r.Cd).toBeCloseTo((2 * anchoCeldas) / (g.B * g.escala), 4);            // (el campo es Float32)
    expect(r.cp.barlovento).toBeCloseTo(1, 4); expect(r.cp.sotavento).toBeCloseTo(-1, 4); expect(Math.abs(r.Cl)).toBeLessThan(1e-6);
  });
});
