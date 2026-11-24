import { describe, expect, it } from 'vitest';
import { geometria3D, celdasDeCara, aPlantaProyecto, aRed } from '../src/viento/geometria3d';
import { giroParaRumbo, probabilidadExcede, categoriaRosa, CRITERIOS, rosaPareja, MediaPlano, grillaAlrededor, veredaEnPlanta, puntosFachada, Envolvente } from '../src/viento/direcciones';

const rect = [{ x: -10, y: -6 }, { x: 10, y: -6 }, { x: 10, y: 6 }, { x: -10, y: 6 }];
const geo = (ang: number) => geometria3D({ niveles: [0, 15, 30].map(c => ({ cota: c, silueta: rect })), dir: 'A', angulo: ang, nx: 96, ny: 48, nz: 40 });

describe('varias direcciones', () => {
  it('rumbos: con +y al norte, el viento del sur es el A sin giro y el del oeste es el B', () => {
    expect(giroParaRumbo(180, 0, 'A')).toBeCloseTo(0, 6);
    expect(giroParaRumbo(270, 0, 'A')).toBeCloseTo(270, 6);
    expect(giroParaRumbo(270, 0, 'B')).toBeCloseTo(0, 6);
    // si +y apunta al este, el viento del oeste sopla hacia +y: es el A
    expect(giroParaRumbo(270, 90, 'A')).toBeCloseTo(0, 6);
  });
  it('de la planta a la red y de vuelta, con cualquier giro', () => {
    for (const a of [0, 30, 135, 270]) {
      const g = geo(a), p = { x: 3.2, y: -4.1 }, r = aRed(g, p), q = aPlantaProyecto(g, r.x, r.y);
      expect(q.x).toBeCloseTo(p.x, 6); expect(q.y).toBeCloseTo(p.y, 6);
    }
  });
  it('probabilidad de superar: un rumbo solo es la de Rayleigh; la categoría baja con más viento', () => {
    const s = rosaPareja(4), c = (4 / 0.886227) * 1;
    expect(probabilidadExcede(s.map(() => 1), s, 6, 1)).toBeCloseTo(Math.exp(-((6 / c) ** 2)), 6);
    const tranquilo = categoriaRosa(s.map(() => 0.5), s.map(() => 0.8), s, 0.8, CRITERIOS.lddc);
    const ventoso = categoriaRosa(s.map(() => 1.6), s.map(() => 2.5), s, 0.8, CRITERIOS.lddc);
    expect(tranquilo.codigo < ventoso.codigo).toBe(true);
  });
  it('vereda en la planta: el aire parejo da factor 1 afuera de la torre y nada adentro', () => {
    const g = geo(45), m = new MediaPlano(g, 1), N = g.nx * g.ny * g.nz, campo = new Float32Array(4 * N);
    for (let k = 0; k < N; k++) campo[4 * k] = 0.08;
    m.sumar(campo); m.sumar(campo);
    const gr = grillaAlrededor(rect, 2), v = veredaEnPlanta(g, m, 0.08, gr);
    const centro = Math.floor(gr.ny / 2) * gr.nx + Math.floor(gr.nx / 2);
    expect(Number.isNaN(v.f[centro])).toBe(true);
    const al = (x: number, y: number) => Math.floor((y - gr.y0) / gr.paso) * gr.nx + Math.floor((x - gr.x0) / gr.paso);
    expect(v.f[al(16, 0)]).toBeCloseTo(1, 6);
  });
  it('envolvente: cada celda de referencia toma el peor pico de las dos direcciones', () => {
    const g0 = geo(0), g1 = geo(90);
    const p0 = puntosFachada(g0, celdasDeCara(g0)), p1 = puntosFachada(g1, celdasDeCara(g1));
    const env = new Envolvente(p0);
    env.sumar(p0, () => 0.8, () => -0.5, 0, 2.5);
    env.sumar(p1, () => 0.6, () => -1.4, 90, 2.5);
    const conDato = [...env.menos].filter(isFinite);
    expect(conDato.length / p0.length).toBeGreaterThan(0.6);
    expect(Math.min(...conDato)).toBeCloseTo(-1.4, 6);
    expect(Math.max(...[...env.mas].filter(isFinite))).toBeCloseTo(0.8, 6);
  });
});
