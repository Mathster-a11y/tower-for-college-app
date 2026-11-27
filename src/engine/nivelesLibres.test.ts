/**
 * CIRSOC y FEM con más de 49 niveles sobre PB: la tabla de los niveles crece con la torre (con Planilla y Guía sigue
 * la de la planilla, que llega a 49, para que la app dé lo mismo que el Excel).
 */
import { describe, expect, it } from 'vitest';
import { ejemploGuia, type Nivel, type Proyecto } from './modelo';
import { calcularProyecto } from './calculoProyecto';

/** la torre de la guía con n niveles sobre PB (pisos de 3 m; la azotea, el último) */
function torre(n: number, metodo: 'planilla' | 'cirsoc' | 'fem'): Proyecto {
  const p = ejemploGuia();
  const niveles: Nivel[] = [{ nombre: 'Azotea', cota: 4 + 3 * (n - 1), B: 20, L: 16 }];
  for (let k = n - 1; k >= 1; k--) niveles.push({ nombre: `${k}º`, cota: 4 + 3 * (k - 1) });
  p.niveles = [...niveles, ...p.niveles.filter(x => x.cota <= 0)];
  p.calculo = { ...(p.calculo ?? {}), metodo } as Proyecto['calculo'];
  return p;
}

describe('CIRSOC y FEM con más de 49 niveles sobre PB', () => {
  it('60 niveles con CIRSOC: el nivel más alto entra (no cae en la fila que la planilla deja en 0); corte y momento cierran', () => {
    const c = calcularProyecto(torre(60, 'cirsoc'));
    expect(c.asig.avisos.some(a => /admite hasta 49/.test(a))).toBe(false);
    expect(c.asig.avisos.some(a => /la app los calcula todos/.test(a))).toBe(true);
    const m = c.valores.mnyq, f = c.asig.filaNivel;
    expect(f[0]).toBeGreaterThanOrEqual(1);                       // la azotea, debajo de la fila 4 (que es siempre 0)
    expect(m.H[f[0]]).toBeGreaterThan(0);
    const fPB = f[60], zPB = m.B[fPB];
    // el corte en la base es la suma del viento de los 60 niveles; el momento en PB, Σ W·(z − zPB)
    const W = f.slice(0, 60).map(k => m.H[k]);
    expect(m.I[fPB + 1]).toBeCloseTo(W.reduce((s, x) => s + x, 0), 6);
    expect(m.J[fPB]).toBeCloseTo(f.slice(0, 60).reduce((s, k) => s + m.H[k] * (m.B[k] - zPB), 0), 4);
    expect(c.controles.length).toBeGreaterThan(0);
    expect(c.controles.every(x => x.estado !== undefined)).toBe(true);
    expect(c.cirsoc!.verif.every(v => Object.values(v).every(x => typeof x !== 'number' || !Number.isNaN(x)))).toBe(true);
  });

  it('con 49 niveles o menos, CIRSOC da exactamente lo mismo que con la tabla de la planilla', () => {
    const a = calcularProyecto(torre(49, 'cirsoc'));
    expect(a.asig.filaNivel[0]).toBe(1);
    expect(a.valores.mnyq.B.length).toBe(54);
  });

  it('60 niveles con FEM: el modelo y la deriva salen con todos los pisos', () => {
    const c = calcularProyecto(torre(60, 'fem'));
    expect(c.fem).toBeDefined();
    expect(c.controles.some(x => /deriva/i.test(x.nombre))).toBe(true);
    const n = c.controles.filter(x => typeof x.guia === 'number' && Number.isNaN(x.guia as number));
    expect(n.map(x => x.nombre)).toEqual([]);
  });

  it('con la Planilla, la torre de 60 niveles sigue avisando que la planilla llega a 49 (el Excel no la admite)', () => {
    const c = calcularProyecto(torre(60, 'planilla'));
    expect(c.asig.avisos.some(a => /admite hasta 49/.test(a))).toBe(true);
    expect(c.valores.mnyq.B.length).toBe(54);
  });
});
