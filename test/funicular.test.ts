import { describe, expect, it } from 'vitest';
import { ejemploGuia } from '../src/engine/modelo';
import { aPlanilla } from '../src/engine/mapping';
import { calcularPlanilla } from '../src/engine/planilla';
import { calcFunicular } from '../src/engine/funicular';

describe('verificación funicular (ejemplo de la guía 2024)', () => {
  const p = ejemploGuia();
  const a = aPlanilla(p);
  const r = calcularPlanilla(a.datos);
  const f = calcFunicular(p, r.mnyq, a.filaNivel, 'A');

  it('la resultante corta la base donde dice M,NyQ (e = Mv / P) y cae en el tercio medio', () => {
    expect(f.e).toBeCloseTo(r.mnyq.M99, 9);
    expect(f.hw).toBeCloseTo(r.mnyq.G66, 9);
    expect(f.W).toBeCloseTo(r.mnyq.H61, 9);
    expect(f.tercio).toBeCloseTo(r.mnyq.N99, 9);      // b1 / 6 = 3 m
    expect(f.verifica).toBe(true);                       // guía: e = 0,95 m, dentro del núcleo central
    expect(f.zBase).toBe(-8);
  });
  it('línea de presiones: un punto por nivel debajo de la azotea, creciendo hacia abajo', () => {
    expect(f.puntos.length).toBe(p.niveles.length - 1);
    const pb = f.puntos.find(x => x.nivel === 'PB')!;
    expect(pb.nucleo).toBeCloseTo(16 / 6, 9);
    expect(pb.e).toBeGreaterThan(f.puntos[0].e);
    f.puntos.forEach(x => expect(x.dentro).toBe(true));
  });
  it('viento B: usa el lado a1 de la fundación', () => {
    const g = calcFunicular(p, r.mnyq, a.filaNivel, 'B');
    expect(g.b).toBe(22);
    expect(g.e).toBeCloseTo(r.mnyq.O61 / r.mnyq.M61, 9);
  });
});

import { poligonoFunicular } from '../src/engine/funicular';
import { datosAltura } from '../src/engine/diagramas';
describe('polígono funicular (construcción gráfica)', () => {
  it('fuerzas cualesquiera: los lados extremos se cortan a la altura Σ F·z / W', () => {
    const f = [{ z: 10, F: 2, nivel: 'a' }, { z: 7, F: 5, nivel: 'b' }, { z: 3, F: 1.5, nivel: 'c' }, { z: 1, F: 4, nivel: 'd' }];
    const c = poligonoFunicular(f, 3);
    const esperado = f.reduce((s, x) => s + x.F * x.z, 0) / f.reduce((s, x) => s + x.F, 0);
    expect(c.zR).toBeCloseTo(esperado, 9);
    expect(c.W).toBe(12.5);
  });
  it('ejemplo de la guía: el funicular da la misma hw que M,NyQ', () => {
    const p = ejemploGuia(); const a = aPlanilla(p); const r = calcularPlanilla(a.datos);
    const alt = datosAltura(p, r.viento, r.mnyq, a.filaNivel, 'A');
    const c = poligonoFunicular(alt.map(x => ({ z: x.z, F: x.F, nivel: x.nivel })));
    const zBase = alt[alt.length - 1].z;
    expect(c.zR - zBase).toBeCloseTo(r.mnyq.G66, 6);
  });
});
