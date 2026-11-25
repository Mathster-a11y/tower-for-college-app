import { describe, expect, it } from 'vitest';
import { ejemploGuia } from '../src/engine/modelo';
import { viento102 } from '../src/engine/cargas/cirsoc102';
import { corteYMomento, fuerzasPorPiso, plantasDistintas, type ResultadoPlanta } from '../src/viento/porPiso';
import { libroTunel } from '../src/xlsx/libros/libroTunel';
import { Evaluador } from '../src/xlsx/formulas';

describe('libro del túnel 2D', () => {
  it('piso por piso: la fuerza de cada nivel y el corte en PB del libro son los de la app', async () => {
    const p = ejemploGuia(), v = viento102(p).A, g = plantasDistintas(p);
    const res = new Map<string, ResultadoPlanta>([[g[0].clave, { Cd: 1.7, ClRms: 0.6, St: 0.13, anchoM: 20, roto: false }]]);
    const f = fuerzasPorPiso(v, g, res);
    const qz = new Map(v.niveles.map(n => [n.nivel, n.qz]));
    const L = libroTunel({ proyecto: 'guía', dir: 'A', pisos: f.map(x => ({ ...x, qz: qz.get(x.nivel)! })), interferencia: [{ nivel: f[0].nivel, z: f[0].z, CdCon: 0.8, CdSin: 1.6, factor: 0.5, FCon: 1, FSin: 2 }], cp: { nivel: 'PB', puntos: [{ s: 0, cp: 0.8 }, { s: 10, cp: -1.2 }] }, config: 'prueba' });
    expect(L.hojas.map(h => h.nombre)).toEqual(['Léame', 'Piso por piso', 'Interferencia', 'Cp del perímetro']);
    const { libro, nombres } = L.aLibroEvaluable(), ev = new Evaluador(libro, nombres);
    f.forEach((x, i) => expect(ev.celda('Piso por piso', `J${6 + i}`) as number).toBeCloseTo(x.Fsim, 6));
    const Q = corteYMomento(f.map(x => ({ z: x.z, F: x.Fsim })));
    const rT = 5 + f.length + 2;
    expect(ev.celda('Piso por piso', `J${rT}`) as number).toBeCloseTo(Q.Q, 6);
    expect(ev.celda('Piso por piso', `J${rT + 1}`) as number).toBeCloseTo(Q.M, 3);
    expect(ev.celda('Interferencia', 'E6')).toBeCloseTo(0.5, 9);
    expect((await L.xlsx()).length).toBeGreaterThan(3000);
  });
});
