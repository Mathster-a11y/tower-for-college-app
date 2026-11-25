import { describe, expect, it } from 'vitest';
import { geometria3D, celdasDeCara } from '../src/viento/geometria3d';
import { Fuerzas3D, picoEstimado, segundosPorPaso } from '../src/viento/fuerzas3d';

const cuadrado = (b: number, l: number) => [{ x: -b / 2, y: -l / 2 }, { x: b / 2, y: -l / 2 }, { x: b / 2, y: l / 2 }, { x: -b / 2, y: l / 2 }];
const niveles = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30].map(c => ({ cota: c, silueta: cuadrado(10, 10) }));
const g = geometria3D({ niveles: [{ cota: 0, silueta: cuadrado(10, 10) }, ...niveles], dir: 'A', nx: 96, ny: 48, nz: 40 });
const caras = celdasDeCara(g);
const pisos = niveles.map(n => ({ nombre: `${n.cota}`, z: n.cota }));
const uH = 0.08, qhG = 0.1;

/** un campo donde cada cara tiene el Cp pedido (con ρ_ref = 1) */
function campo(cp: (c: typeof caras[number]) => number) {
  const F = new Float32Array(g.nx * g.ny * g.nz * 4).fill(1);
  caras.forEach(c => { F[c.celda * 4 + 3] = 1 + cp(c) * 3 * 0.5 * uH * uH; });
  return F;
}

describe('fuerzas del túnel 3D', () => {
  it('Cp parejo: barlovento +0,8 y sotavento −0,5 dan Cd = 1,3 sobre el área de fachada, sin lateral ni torsor', () => {
    const f = new Fuerzas3D(caras, g, pisos, uH, qhG);
    f.sumar(campo(c => (c.cara === 'barlovento' ? 0.8 : c.cara === 'sotavento' ? -0.5 : 0)), 1, 0);
    const r = f.resumen();
    const areaFrente = caras.filter(c => c.cara === 'barlovento').length / (g.escala * g.escala);
    expect(r.base.Vx.media).toBeCloseTo(1.3 * qhG * areaFrente, 2);
    expect(Math.abs(r.base.Vy.media)).toBeLessThan(1e-6);
    expect(Math.abs(r.base.Mz.media)).toBeLessThan(1e-6);
    // los pisos suman la base y el vuelco queda con el brazo a media altura (≈ 15 m)
    expect(r.pisos.reduce((s, p) => s + p.Fx.media, 0)).toBeCloseTo(r.base.Vx.media, 6);
    expect(r.base.Mx.media / r.base.Vx.media).toBeGreaterThan(13); expect(r.base.Mx.media / r.base.Vx.media).toBeLessThan(17);
  });
  it('succión de un solo lado: fuerza lateral hacia ese lado y torsor si está corrida', () => {
    const f = new Fuerzas3D(caras, g, pisos, uH, qhG);
    // succión en la cara lateral cuya normal mira a +y: la tira hacia +y
    f.sumar(campo(c => (c.cara === 'lateral' && c.ny > 0 ? -1 : 0)), 1, 0);
    const r = f.resumen();
    expect(r.base.Vy.media).toBeGreaterThan(0);
    expect(Math.abs(r.base.Vx.media)).toBeLessThan(1e-6);
  });
  it('estadística en el tiempo: media, desvío, pico estimado y simultaneidad', () => {
    const f = new Fuerzas3D(caras, g, pisos, uH, qhG);
    for (let k = 0; k < 40; k++) f.sumar(campo(c => (c.cara === 'barlovento' ? 0.8 + 0.2 * Math.sin(k) : c.cara === 'lateral' && c.ny > 0 ? -0.5 * Math.cos(k) : 0)), 1, k);
    const r = f.resumen();
    expect(r.muestras).toBe(40); expect(r.tiempo).toBe(39);
    expect(r.base.Vx.sigma).toBeGreaterThan(0);
    expect(picoEstimado(r.base.Vx)).toBeGreaterThan(r.base.Vx.media);
    expect(r.simultaneidad.conVx.Vy).toBeGreaterThanOrEqual(0); expect(r.simultaneidad.conVx.Vy).toBeLessThanOrEqual(1);
    expect(segundosPorPaso(g, 0.08, 40)).toBeCloseTo(0.08 / (g.escala * 40), 12);
  });
});

describe('Excel del túnel 3D', () => {
  it('arma el libro con cargas por piso, base y serie', async () => {
    const { libroTunel3d } = await import('../src/xlsx/libros/libroTunel3d');
    const f = new Fuerzas3D(caras, g, pisos, uH, qhG);
    for (let k = 0; k < 5; k++) f.sumar(campo(c => (c.cara === 'barlovento' ? 0.8 + 0.1 * k : 0)), 1, k);
    const L = libroTunel3d({ proyecto: 'prueba', dir: 'A', resumen: f.resumen(), serie: f.serie, regl: pisos.map(() => 1), qh: 1000, G: 0.85, config: 'prueba', fachada: { zonas: [{ zona: 4, nombre: 'centro', cpMas: 1, cpMenos: -1, pMas: 1.2, pMenos: -1.2, pMasRegl: 1, pMenosRegl: -1 }], area: 4.5, a: 1.2, qh: 1000 } });
    const bytes = await L.xlsx();
    expect(bytes.length).toBeGreaterThan(5000);
  });
});
