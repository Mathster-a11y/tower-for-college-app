import { describe, expect, it } from 'vitest';
import { remuestrear, espectro, frecuenciaPico, densidadEn, aceleracion, masaGeneralizada, derivas, factorPicoResonante } from '../src/viento/dinamica3d';

describe('dinámica del túnel 3D', () => {
  it('el espectro encuentra la frecuencia de una oscilación y conserva la varianza', () => {
    const dt = 0.05, t = Array.from({ length: 1200 }, (_, i) => i * dt + 0.01 * Math.sin(i));   // muestreo irregular
    const v = t.map(x => 10 + 3 * Math.sin(2 * Math.PI * 0.4 * x));
    const x = remuestrear(t, v, dt), e = espectro(x, dt)!;
    expect(frecuenciaPico(e, 0.05)).toBeCloseTo(0.4, 1);
    const area = e.S.reduce((s, q) => s + q * e.df, 0);
    expect(area / 4.5).toBeGreaterThan(0.85); expect(area / 4.5).toBeLessThan(1.15);   // varianza de 3·sen = 4,5
  });
  it('aceleración: crece con menos amortiguamiento, baja con más masa y con menos viento', () => {
    const e = { f: [0, 0.5, 1, 1.5], S: [0, 4, 4, 4], df: 0.5, tramos: 1 };
    const a1 = aceleracion(e, 1, 1000, 0.02), a2 = aceleracion(e, 1, 1000, 0.01), a3 = aceleracion(e, 1, 2000, 0.02);
    expect(a2.pico / a1.pico).toBeCloseTo(Math.SQRT2, 6);
    expect(a3.pico / a1.pico).toBeCloseTo(0.5, 6);
    expect(aceleracion(e, 1, 1000, 0.02, 0.8).pico).toBeLessThan(a1.pico);
    // σ = g/M · √(π n S / 4ζ) → en mili-g
    expect(a1.sigma).toBeCloseTo((1 / 1000) * Math.sqrt((Math.PI * 1 * 4) / 0.08) * 1000, 6);
    expect(factorPicoResonante(0.2)).toBeGreaterThan(3.3); expect(densidadEn(e, 0.75)).toBeCloseTo(4, 6);
  });
  it('masa generalizada y deriva de una ménsula con carga en la punta', () => {
    expect(masaGeneralizada([{ z: 10, m: 100 }, { z: 20, m: 100 }], 20)).toBeCloseTo(125, 6);
    // ménsula de 30 m con P = 10 t en la punta: δ = P L³ / 3EJ
    const EJ = 1e6, ns = Array.from({ length: 31 }, (_, i) => ({ z: i, F: i === 30 ? 10 : 0 }));
    const r = derivas(ns, () => EJ);
    expect(r[30].d).toBeCloseTo((10 * 30 ** 3) / (3 * EJ), 3);
    expect(r[30].deriva).toBeGreaterThan(r[1].deriva);
  });
});

describe('pico dentro de una banda', () => {
  it('ignora un pico de ruido afuera de la banda', () => {
    const e = { f: [0, 0.5, 1, 1.5, 2, 2.5], S: [0, 1, 3, 1, 9, 0.5], df: 0.5, tramos: 1 };
    expect(frecuenciaPico(e, 0.4, 1.6)).toBeCloseTo(1, 1);
    expect(frecuenciaPico(e, 0.4)).toBeGreaterThan(1.8);
  });
});

describe('barrido de velocidades', () => {
  it('encuentra la resonancia con un viento más flojo que el de 10 años', async () => {
    const { peorAceleracion, aceleracion } = await import('../src/viento/dinamica3d');
    // la fuerza tiene su pico en 1 Hz con el viento de la simulación; la torre vibra a 0,5 Hz: resuena con la mitad del viento
    const f = Array.from({ length: 41 }, (_, i) => i * 0.05), e = { f, S: f.map(x => Math.exp(-((x - 1) ** 2) / 0.01)), df: 0.05, tramos: 1 };
    const p = peorAceleracion(e, 0.5, 1000, 0.02, 0.8);
    expect(p.f).toBeCloseTo(0.5, 1);
    expect(p.pico).toBeGreaterThan(aceleracion(e, 0.5, 1000, 0.02, 0.8).pico);
  });
});
