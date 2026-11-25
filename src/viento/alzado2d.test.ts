/**
 * Corte vertical del túnel 2D: la torre de costado sobre el suelo, con el viento que crece con la altura y un techo
 * deslizante. Se arma bien, no se rompe, y el aire hace lo que tiene que hacer: frena contra la cara de barlovento,
 * pasa por arriba y vuelve hacia atrás detrás de la torre (la recirculación de la estela).
 */
import { describe, expect, it } from 'vitest';
import { geometriaAlzado } from './geometria2d';
import { Lbm2D } from './lbm2d';

const cuadrado = (b: number) => [{ x: -b / 2, y: -b / 2 }, { x: b / 2, y: -b / 2 }, { x: b / 2, y: b / 2 }, { x: -b / 2, y: b / 2 }];

describe('corte vertical (alzado)', () => {
  const niveles = [0, 20, 40, 60].map(z => ({ z, pol: cuadrado(20) }));
  const geo = geometriaAlzado({ niveles, dir: 'B', celdasH: 30, perfil: z => Math.min(1.3, Math.max(0.5, Math.sqrt(Math.max(z, 5) / 60))) });

  it('el suelo es sólido, la torre arranca en el suelo y tiene la altura pedida', () => {
    expect(geo.solido.slice(0, geo.nx).every(v => v === 1)).toBe(true);
    expect(geo.caja.y0).toBe(1);
    expect(geo.caja.y1 - geo.caja.y0 + 1).toBeGreaterThanOrEqual(29);
    expect(geo.caja.y1 - geo.caja.y0 + 1).toBeLessThanOrEqual(31);
    expect(geo.alzado!.perfil[geo.ny - 1]).toBeGreaterThan(geo.alzado!.perfil[3]);
  });
  it('corre estable y la estela vuelve hacia la torre; arriba corre libre', () => {
    const u0 = 0.08, sim = new Lbm2D({ nx: geo.nx, ny: geo.ny, nu: (u0 * 30) / 400, u0, cs: 0.1, solido: geo.solido, q: geo.q, colision: 'trt', cuerpo: geo.cuerpo, perfil: geo.alzado!.perfil, techoLibre: true });
    const { nx, caja } = geo, media = new Float64Array(geo.nx * geo.ny);
    let n = 0;
    for (let k = 0; k < 7000; k++) { sim.paso(); if (k >= 3000) { for (let c = 0; c < media.length; c++) media[c] += sim.ux[c]; n++; } }
    expect(sim.roto).toBe(false);
    const en = (x: number, y: number) => media[y * nx + x] / n;
    // detrás de la torre, a media altura, el aire vuelve hacia ella en promedio (la burbuja de la estela)
    const atras = Math.round(caja.x1 + 0.5 * (caja.y1 - caja.y0)), medio = Math.round(caja.y0 + 0.8 * (caja.y1 - caja.y0));
    expect(en(atras, medio)).toBeLessThan(0);
    // contra la cara de barlovento, a media altura, el aire casi se frena
    expect(Math.abs(en(caja.x0 - 1, Math.round((caja.y0 + caja.y1) / 2)))).toBeLessThan(0.3 * u0);
    // arriba, lejos, el aire corre con su velocidad de entrada (el techo no lo frena)
    const yT = geo.ny - 1;
    expect(en(Math.round(nx * 0.8), yT)).toBeGreaterThan(0.9 * u0 * geo.alzado!.perfil[yT]);
    // el arrastre empuja la torre hacia +x
    expect(sim.Fx).toBeGreaterThan(0);
  }, 60000);
});
