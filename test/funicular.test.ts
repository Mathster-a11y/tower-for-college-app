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
