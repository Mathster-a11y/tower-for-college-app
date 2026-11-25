/**
 * La torre con el exo cargada con otras fuerzas (las del túnel de viento): con las mismas del cálculo da el mismo
 * corrimiento, y la deriva de un diagrid queda en valores de una torre real (no los miles de millones de ‰ de la
 * ménsula de los tabiques solos, que no ve el exo).
 */
import { describe, expect, it } from 'vitest';
import { calcularProyecto } from './calculoProyecto';
import { ExoDeCalculo } from './exoDeCalculo';
import { ejemploGherkin } from './ejemplosExo';

describe('corrimientos de la torre con el exo', () => {
  const p = ejemploGherkin(); p.calculo = { ...(p.calculo ?? {}), metodo: 'cirsoc' } as typeof p.calculo;
  const c = calcularProyecto(p), ex = new ExoDeCalculo(p, c, 'cirsoc');
  const d = ex.datos('A', p.exo!)!, zPB = d.entrada.zs[0];
  const fuerzas = d.entrada.zs.slice(1).map((z, i) => ({ z: z - zPB, F: d.entrada.W[i] }));

  it('con las fuerzas del cálculo, el mismo corrimiento que el exo del cálculo', () => {
    const u = ex.corrimientos('A', p.exo!, fuerzas)!;
    expect(u[0]).toEqual({ z: 0, d: 0 });
    expect(u[u.length - 1].d).toBeCloseTo(d.r.u[d.r.u.length - 1], 9);
  });
  it('el doble de fuerza, el doble de corrimiento; la deriva del Gherkin es de una torre real', () => {
    const u1 = ex.corrimientos('A', p.exo!, fuerzas)!, u2 = ex.corrimientos('A', p.exo!, fuerzas.map(q => ({ ...q, F: 2 * q.F })))!;
    expect(u2[u2.length - 1].d).toBeCloseTo(2 * u1[u1.length - 1].d, 9);
    const peor = Math.max(...u1.slice(1).map((q, i) => Math.abs(q.d - u1[i].d) / (q.z - u1[i].z)));
    expect(peor).toBeGreaterThan(1e-5);
    expect(peor).toBeLessThan(1 / 100);
  });
});
