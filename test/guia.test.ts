/**
 * Etapa 2 del plan: lo que la guía «Edificio en torre» 2024 hace y la planilla no, con los números de la guía.
 */
import { describe, expect, it } from 'vitest';
import { calcularProyecto } from '../src/ui/estado';
import { ejemploGuia } from '../src/engine/modelo';
import { armarTabique, corteDintel, esbeltez, estaticoCorte, flechaGuia, TAU_ADM, textoBarras } from '../src/engine/metodos/guia';

describe('método Guía', () => {
  it('esbeltez (guía 1): λ = 64 / 16 = 4', () => {
    const e = esbeltez(64, 16);
    expect(e.lambda).toBe(4);
    expect(e.clase).toBe('viento');
    expect(esbeltez(30, 16).clase).toBe('baja');
    expect(esbeltez(96, 16).clase).toBe('vuelco');
    expect(esbeltez(200, 16).clase).toBe('muy alta');
  });

  it('flecha (guía 4.2): con h = 70 m, f = 0,077 m ≤ 0,14 m', () => {
    // qv máx = 0,1214 · 20 = 2,428 t/m; qv mín = 0,0736 · 20 = 1,472 t/m; E = 3.400.000 t/m²; ΣJ = 22,16 m⁴
    const f = flechaGuia(2.428, 1.472, 70, 3_400_000, 22.16);
    expect(f.qv).toBeCloseTo(1.95, 6);
    expect(f.f).toBeCloseTo(0.0777, 4);                // guía: 0,077 m (truncado)
    expect(f.fAdm).toBeCloseTo(0.14, 6);
    expect(f.verifica).toBe(true);
  });

  it('armado de T1 (guía 5): 72 cm² mínimos → Ø12 c/14, 32 por capa; horizontal Ø6 c/17,5', () => {
    const a = armarTabique(4.47, 72, 4.5);
    expect(a.manda).toBe('mínima');
    expect(a.vertical.pedido).toBeCloseTo(8, 6);
    expect(a.vertical).toMatchObject({ phi: 12, s: 14, n: 32 });
    expect(a.horizontal.pedido).toBeCloseTo(1.6, 6);
    expect(a.horizontal).toMatchObject({ phi: 6, s: 17.5 });
    expect(textoBarras(a.vertical)).toBe('Ø12 c/14 (32 por capa)');
  });

  it('armado del alma y de las alas de T5 (guía 5): 26 y 36 Ø12 por capa', () => {
    expect(armarTabique(0, 0.008 * 20 * 360, 3.6).vertical).toMatchObject({ phi: 12, s: 14, n: 26 });
    expect(armarTabique(0, 0.008 * 20 * 500, 5).vertical).toMatchObject({ phi: 12, s: 14, n: 36 });
  });

  it('una armadura de cálculo grande sube el diámetro y respeta los mínimos', () => {
    const a = armarTabique(200, 72, 4.5);
    expect(a.manda).toBe('cálculo');
    expect(a.vertical.colocado).toBeGreaterThanOrEqual(a.vertical.pedido - 1e-9);
    expect(a.vertical.s).toBeGreaterThanOrEqual(10);
    const chico = armarTabique(0, 1, 4.5);
    expect(chico.vertical).toMatchObject({ phi: 8, s: 20 });     // mínimo Ø8 c/20
    expect(chico.horizontal).toMatchObject({ phi: 6, s: 25 });   // mínimo Ø6 c/25
  });

  it('corte en el dintel de T1 (guía 5): τ = 4,89 kg/cm² ≤ 24 kg/cm²', () => {
    const S = estaticoCorte(0.2, 4.5, 0);
    expect(S).toBeCloseTo(0.50625, 6);                 // guía: 0,5062 m³
    const c = corteDintel(126 * 0.07, S, 1.52, 3, 0.9, 0.2, TAU_ADM('H30'));
    expect(c.t).toBeCloseTo(2.938, 3);                 // guía: 2,93 t/m (truncado)
    expect(c.T).toBeCloseTo(8.81, 1);                  // guía: 8,81 t
    expect(c.tau).toBeCloseTo(4.89, 1);                // guía: 4,89 kg/cm²
    expect(c.tauAdm).toBe(24);
    expect(c.verifica).toBe(true);
  });

  it('en la app, con el ejemplo de la guía: esbeltez, flecha, armado y dintel en los controles', () => {
    const p = ejemploGuia();
    p.calculo = { metodo: 'guia', version: 'actual', armado: 'app' };
    const sin = calcularProyecto(p).controles;
    expect(sin.find(x => x.nombre === 'Esbeltez λ = h / L, viento A')!.guia).toBeCloseTo(4, 9);
    const fl = sin.find(x => x.nombre === 'Flecha de la ménsula, viento A')!;
    // la guía usa h = 70 m (f = 0,077 m); la torre mide 72 m desde la fundación: f = 0,087 m (errata anotada)
    expect(fl.guia).toBeCloseTo(0.0873, 3);
    expect(fl.estado).toBe('verifica');
    expect(sin.find(x => x.nombre === 'T1: compresión (cargado)')!.nota).toMatch(/M1: Ø12 c\/14 \(32 por capa\), horizontal Ø6 c\/17,5/);
    expect(sin.some(x => /dintel/.test(x.nombre))).toBe(false);
    // con la abertura de la guía en T1 a T4 (0,60 × 2,10 m): el dintel de PB (4 m) mide 1,90 m
    ['M1', 'M2', 'M3', 'M4'].forEach(id => { p.muros.find(m => m.id === id)!.aberturas = [{ s: 0, ancho: 0.6, desde: 0, alto: 2.1 }]; });
    const di = calcularProyecto(p).controles.filter(x => /dintel/.test(x.nombre));
    expect(di.map(x => x.nombre)).toEqual(['M1: dintel en PB', 'M2: dintel en PB', 'M3: dintel en PB', 'M4: dintel en PB']);
    const t1 = di[0];
    // Qj = Q en PB · parte de T1 (≈ 125,8 t · 6,88 %) → τ = Qj · S / J · 4 m / (1,90 m · 0,20 m)
    expect(t1.guia).toBeCloseTo((8.66 * 0.50625 / 1.51875 * 4 * 1000) / (190 * 20), 1);
    expect(t1.estado).toBe('verifica');
  });
});
