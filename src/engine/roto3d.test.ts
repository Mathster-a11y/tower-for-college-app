import { describe, expect, it } from 'vitest';
import { deformada, desplazar, movimientoEn, repartoGuia, rototraslacion3D, torsionPorNivel, type PuntoAltura } from './diagramas';
import { ejemploGuia } from './modelo';
import { aPlanilla } from './mapping';

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
  it('con el mismo CR y k en todos los niveles, el giro por nivel da lo mismo que θ = −δ·k', () => {
    const r0 = rototraslacion3D(def, 'A', g.Xr, 0, g.SJ, g.SJa2);
    const k0 = (g.Xr * g.SJ) / g.SJa2;
    const r1 = rototraslacion3D(def, 'A', g.Xr, 0, g.SJ, g.SJa2, def.puntos.map(p => ({ z: p.z, cr: { x: g.Xr, y: 0 }, k: k0 * (1 + 1e-15) })));
    r0.niveles.forEach((n, i) => expect(r1.niveles[i].th).toBeCloseTo(n.th, 12));
  });
  it('si arriba la planta queda simétrica (k = 0), el giro deja de crecer: los pisos de arriba arrastran el de abajo', () => {
    const k0 = (g.Xr * g.SJ) / g.SJa2;
    const porNivel = def.puntos.map(p => ({ z: p.z, cr: p.z <= 6 ? { x: g.Xr, y: 0 } : { x: 0, y: 0 }, k: p.z <= 6 ? k0 : 0 }));
    const r = rototraslacion3D(def, 'A', g.Xr, 0, g.SJ, g.SJa2, porNivel);
    const th = (z: number) => r.niveles.find(n => n.z === z)!.th;
    expect(Math.abs(th(6))).toBeGreaterThan(0);
    expect(Math.abs(th(12))).toBeLessThan(Math.abs(rototraslacion3D(def, 'A', g.Xr, 0, g.SJ, g.SJa2).thTop));
    expect(movimientoEn(r, 12).cr).toEqual({ x: 0, y: 0 });                      // arriba gira alrededor de su propio CR
  });
  it('torsión por nivel: un muro que llega hasta la mitad corre el CR solo abajo', () => {
    const p = ejemploGuia();
    const zs = p.niveles.map(n => n.cota).filter(z => z >= 0), zMid = zs[Math.floor(zs.length / 2)];
    p.muros.push({ id: 'Z1', dir: 'Y', x: -6, y: 0, largo: 6, espesor: 0.25, tipo: 'rect', llega: true, areaInf: 0, piezaA: 'Z1', pegadoA: '', piezaB: 'Z1B', pegadoB: '', zHasta: zMid } as never);
    const asig = aPlanilla(p);
    const t = torsionPorNivel(p, asig.piezas, 'A', { cr: { x: -1, y: 0 }, k: -0.01 });
    const pb = t.find(q => Math.abs(q.z) < 1e-6)!, arriba = t[0];
    expect(pb.cr.x).toBeCloseTo(-1, 9); expect(pb.k).toBeCloseTo(-0.01, 12);       // en PB: lo de la fuente elegida
    expect(arriba.cr.x).toBeGreaterThan(pb.cr.x);                                   // arriba el CR vuelve hacia el centro
    expect(Math.abs(arriba.k)).toBeLessThan(Math.abs(pb.k));
  });
});
