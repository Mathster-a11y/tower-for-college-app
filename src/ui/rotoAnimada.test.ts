/**
 * Rototraslación animada: la losa se corre δ = W/ΣJ y gira φ = Mt/ΣJt·a² alrededor del CR; lo que se mueve cada
 * tabique, por su J, tiene que dar lo que toma en el cálculo (traslación ± rotación).
 */
import { describe, expect, it } from 'vitest';
import { repartoGuia } from '../engine/diagramas';
import { fasesRoto, movimientoLosa } from './rotoAnimada';

describe('rototraslación animada', () => {
  it.each([3, -3, 0])('Fj = Jj · (δ + φ·(Xr − tj)) reproduce el reparto (T6 en %d)', pos6 => {
    const par = [{ nombre: 'T1', J: 2, pos: -8 }, { nombre: 'T2', J: 2, pos: 8 }, { nombre: 'T6', J: 8, pos: pos6 }];
    const perp = [{ nombre: 'M1', J: 0.5, pos: 6 }, { nombre: 'M2', J: 0.5, pos: -6 }];
    const W = 10, g = repartoGuia(par, perp, W, { Yr: 0 });
    const { delta, phi } = movimientoLosa({ Q: W, Mt: W * g.e, Xr: g.Xr, SJ: g.SJ, SJa2: g.SJa2 });
    g.elementos.filter(x => !x.perpendicular).forEach(x => {
      expect(x.J * (delta + phi * (g.Xr - x.pos))).toBeCloseTo(x.total, 9);
    });
    if (pos6 === 0) expect(phi).toBe(0);
  });

  it('las fases: primero traslación, después rotación, se mantiene y vuelve', () => {
    expect(fasesRoto(0)).toMatchObject({ f1: 0, f2: 0, fase: 0 });
    const a = fasesRoto(2.5); expect(a.f1).toBe(1); expect(a.f2).toBe(0); expect(a.fase).toBe(1);
    const b = fasesRoto(5); expect(b.f1).toBe(1); expect(b.f2).toBe(1); expect(b.fase).toBe(3);
    expect(fasesRoto(7.6)).toMatchObject({ f1: 0, f2: 0, fase: 0 });
  });
});
