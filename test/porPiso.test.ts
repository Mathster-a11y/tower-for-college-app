import { describe, expect, it } from 'vitest';
import { ejemploGuia } from '../src/engine/modelo';
import { viento102, KN_POR_T } from '../src/engine/cargas/cirsoc102';
import { corteYMomento, fuerzasPorPiso, plantasDistintas, type ResultadoPlanta } from '../src/viento/porPiso';

describe('túnel piso por piso', () => {
  it('la torre de la guía: una sola planta para todos los niveles sobre PB', () => {
    const p = ejemploGuia(), g = plantasDistintas(p);
    expect(g.length).toBe(1);
    expect(g[0].de).toBe('losa');
    expect(g[0].niveles.length).toBe(viento102(p).A.niveles.length);
  });
  it('carpintería en un solo nivel: vale para toda la torre (también hacia arriba); con otra arriba, dos plantas', () => {
    const p = ejemploGuia(), k = 5;
    p.niveles[k].carpinteria = [{ x: -9, y: -7 }, { x: 9, y: -7 }, { x: 9, y: 7 }, { x: -9, y: 7 }];
    let g = plantasDistintas(p);
    expect(g.length).toBe(1); expect(g[0].de).toBe('carpintería');
    // otra carpintería en la azotea: de la azotea al nivel k − 1 la de arriba; del k hasta PB la del nivel k
    p.niveles[0].carpinteria = [{ x: -8, y: -6 }, { x: 8, y: -6 }, { x: 8, y: 6 }, { x: -8, y: 6 }];
    g = plantasDistintas(p);
    expect(g.length).toBe(2);
    expect(g[1].niveles[0].nombre).toBe(p.niveles[k].nombre);
  });
  it('fuerza por nivel = Cd · qz · ancho · h de influencia; corte y momento suman', () => {
    const p = ejemploGuia(), v = viento102(p).A, g = plantasDistintas(p);
    const res = new Map<string, ResultadoPlanta>([[g[0].clave, { Cd: 1.3, ClRms: 0.5, St: 0.12, anchoM: 20, roto: false }]]);
    const f = fuerzasPorPiso(v, g, res);
    expect(f.length).toBe(v.niveles.length);
    const n = v.niveles[3];
    expect(f[3].Fsim).toBeCloseTo((1.3 * n.qz * 20 * n.hInf) / 1000 / KN_POR_T, 9);
    expect(f[3].Freg).toBeCloseTo(n.W, 9);
    const qm = corteYMomento(f.map(x => ({ z: x.z, F: x.Fsim })));
    expect(qm.Q).toBeCloseTo(f.reduce((s, x) => s + x.Fsim, 0), 9);
    expect(qm.M).toBeGreaterThan(0);
  });
});
