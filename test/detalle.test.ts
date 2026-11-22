import { describe, expect, it } from 'vitest';
import { geometria2D } from '../src/viento/geometria2d';
import { Lbm2D } from '../src/viento/lbm2d';
import { ajustarVentana, Detalle, geometriaDetalle } from '../src/viento/detalle';

const cuadrado = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

describe('ventana de detalle (anidada en un sentido)', () => {
  it('en aire libre reproduce el viento del túnel grueso', () => {
    const g = geometria2D({ poligonos: [cuadrado], dir: 'B', D: 10, largo: 16, alto: 8, entrada: 4 });
    const gr = new Lbm2D({ nx: g.nx, ny: g.ny, nu: 0.01, u0: 0.1, solido: g.solido, perturbacion: 0 });
    const v = ajustarVentana(g, { x0: 4, y0: 4, w: 10, h: 10 }, 2);       // lejos de la torre, cerca de la entrada
    const d = new Detalle(geometriaDetalle(g, v, 2), g.nx, g.ny, 0.01, 0.1, 0, 'bgk');
    for (let k = 0; k < 200; k++) { gr.paso(); d.avanzar(gr); }
    const s = d.sim; let err = 0;
    for (let c = 0; c < s.N; c++) err = Math.max(err, Math.abs(s.ux[c] - 0.1));
    expect(err).toBeLessThan(0.01);
  });

  it('ajusta el recuadro adentro del túnel y sin pasarse de celdas', () => {
    const g = geometria2D({ poligonos: [cuadrado], dir: 'B', D: 20 });
    const v = ajustarVentana(g, { x0: -50, y0: -50, w: 400, h: 400 }, 4);
    expect(v.x0).toBeGreaterThanOrEqual(2); expect(v.y0).toBeGreaterThanOrEqual(1);
    expect(v.w * v.h * 16).toBeLessThanOrEqual(160_000);
  });

  it('en la esquina: estable, con la estancamiento y la succión en su lugar', () => {
    const g = geometria2D({ poligonos: [cuadrado], dir: 'B', D: 12, largo: 16, alto: 10, entrada: 4 });
    const u0 = 0.1, nu = (u0 * 12) / 150;
    const gr = new Lbm2D({ nx: g.nx, ny: g.ny, nu, u0, solido: g.solido, q: g.q, colision: 'trt' });
    // la ventana: toda la cara de barlovento y la esquina de arriba
    const v = ajustarVentana(g, { x0: g.caja.x0 - 6, y0: g.caja.y0 + 2, w: 12, h: 16 }, 4);
    const gd = geometriaDetalle(g, v, 4), d = new Detalle(gd, g.nx, g.ny, nu, u0, 0, 'trt');
    for (let k = 0; k < 1500; k++) { gr.paso(); d.avanzar(gr); }
    expect(d.sim.roto).toBe(false);
    // estancamiento: delante de la cara, a media altura de la torre, la presión sube como en el grueso
    const yc = (g.caja.y0 + g.caja.y1 + 1) / 2, xF = g.caja.x0 - 0.5;
    const cG = Math.floor(yc) * g.nx + Math.floor(xF), cpG = (gr.rho[cG] - gr.rho[Math.floor(g.ny * 0.05) * g.nx + 20]) / 3 / (0.5 * u0 * u0);
    const iF = Math.floor((xF - v.x0) * 4), jF = Math.floor((yc - v.y0) * 4), cF = jF * gd.nx + iF;
    const cpF = (d.sim.rho[cF] - gr.rho[Math.floor(g.ny * 0.05) * g.nx + 20]) / 3 / (0.5 * u0 * u0);
    expect(cpG).toBeGreaterThan(0.6); expect(cpF).toBeGreaterThan(0.6);
    expect(Math.abs(cpF - cpG)).toBeLessThan(0.35);
  }, 60_000);
});
