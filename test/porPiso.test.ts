import { describe, expect, it } from 'vitest';
import { ejemploGuia } from '../src/engine/modelo';
import { viento102, KN_POR_T } from '../src/engine/cargas/cirsoc102';
import { corteYMomento, fuerzasPorPiso, interferencia, plantasAisladas, plantasDistintas, type ResultadoPlanta } from '../src/viento/porPiso';

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
  it('factor de interferencia: un vecino bajo; las plantas aisladas solo para los niveles a los que llega', () => {
    const p = ejemploGuia(), v = viento102(p).A;
    const alto = 20;
    const vec = [{ id: 'v1', nombre: 'bajo', altura: alto, v: [{ x: -40, y: -10 }, { x: -30, y: -10 }, { x: -30, y: 10 }, { x: -40, y: 10 }] }];
    const con = plantasDistintas(p, vec);
    expect(con.length).toBe(2);                                       // los niveles hasta 20 m con el vecino y los de arriba sin
    const ais = plantasAisladas(p, con);
    expect(ais.length).toBe(1);
    expect(ais[0].clave.startsWith('aislada:')).toBe(true);
    expect(plantasAisladas(p, plantasDistintas(p))).toEqual([]);      // sin vecinos: nada que comparar
    const res = new Map<string, ResultadoPlanta>();
    for (const g of con) res.set(g.clave, { Cd: g.vecinos.length ? 0.8 : 1.6, ClRms: 0, St: null, anchoM: 20, roto: false });
    res.set(ais[0].clave, { Cd: 1.6, ClRms: 0, St: null, anchoM: 20, roto: false });
    const fi = interferencia(fuerzasPorPiso(v, con, res), fuerzasPorPiso(v, ais, res));
    const bajos = v.niveles.filter(n => n.z < alto).length;
    expect(fi.length).toBe(ais[0].niveles.length);
    expect(fi.filter(f => Math.abs(f.factor - 0.5) < 1e-9).length).toBe(bajos);
    expect(fi.every(f => Math.abs(f.FCon / f.FSin - f.factor) < 1e-9)).toBe(true);
  });
});
