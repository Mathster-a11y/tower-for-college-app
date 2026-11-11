import { describe, expect, it } from 'vitest';
import { deformada, desplazar, repartoGuia, rototraslacion3D, type PuntoAltura } from './diagramas';

const alt: PuntoAltura[] = [0, 3, 6, 9, 12].map((z, i, a) => {
  const F = 2;
  const V = F * (a.length - 1 - i);
  return { nivel: `N${i}`, z, pBarlo: 0, pSota: 0, F, V, M: (F * (12 - z) ** 2) / 6 };
});

describe('rototraslación en 3D', () => {
  const par = [{ nombre: 'T1', J: 2, pos: -8 }, { nombre: 'T2', J: 2, pos: 8 }, { nombre: 'T6', J: 8, pos: 3 }];
  const perp = [{ nombre: 'M1', J: 0.5, pos: 6, perpendicular: true }, { nombre: 'M2', J: 0.5, pos: -6, perpendicular: true }];
  const W = 10;
  const g = repartoGuia(par, perp, W, { Yr: 0 });
  const def = deformada(alt, W, 3.4e6, g.SJ);

  it('lo que se corre cada tabique, por su J, da el reparto de la guía (traslación ± rotación)', () => {
    for (const dir of ['A', 'B'] as const) {
      const r = rototraslacion3D(def, dir, g.Xr, 0, g.SJ, g.SJa2);
      const top = r.niveles[r.niveles.length - 1];
      g.elementos.filter(x => !x.perpendicular).forEach(x => {
        // punto del tabique en planta: marco del viento (t = pos, s = 0) → planta
        const p = dir === 'A' ? { x: x.pos, y: 0 } : { x: 0, y: -x.pos };
        const q = desplazar(r, p.x, p.y, top.z, 1);
        const u = dir === 'A' ? q.y - p.y : q.x - p.x;              // corrimiento en el sentido del viento
        expect((x.J * u) / top.d * (W / g.SJ)).toBeCloseTo(x.total, 6);
      });
    }
  });
  it('con e > 0 la planta gira en sentido horario y el CR solo se traslada', () => {
    const r = rototraslacion3D(def, 'A', g.Xr, 0, g.SJ, g.SJa2);
    expect(g.Xr).toBeGreaterThan(0);
    expect(r.thTop).toBeLessThan(0);
    const c = desplazar(r, r.cr.x, r.cr.y, 12, 100);
    expect(c.x).toBeCloseTo(r.cr.x, 9);
    expect(c.y - r.cr.y).toBeCloseTo(100 * r.dTop, 9);
  });
  it('planta simétrica: solo traslación', () => {
    const s = repartoGuia([{ nombre: 'a', J: 2, pos: -5 }, { nombre: 'b', J: 2, pos: 5 }], [], W);
    const r = rototraslacion3D(def, 'A', s.Xr, 0, s.SJ, s.SJa2);
    expect(r.niveles.every(n => n.th === 0 || Object.is(n.th, -0))).toBe(true);
    expect(desplazar(r, 5, 5, 0, 1000)).toEqual({ x: 5, y: 5 });
  });
});
