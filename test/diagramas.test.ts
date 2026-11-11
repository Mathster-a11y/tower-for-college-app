import { describe, expect, it } from 'vitest';
import { ejemploGuia } from '../src/engine/modelo';
import { aPlanilla } from '../src/engine/mapping';
import { calcularPlanilla } from '../src/engine/planilla';
import { datosAltura, deformada, E_DE_DIVISOR, reparto, rigidez, type PuntoAltura } from '../src/engine/diagramas';

describe('diagramas', () => {
  const p = ejemploGuia();
  const a = aPlanilla(p);
  const r = calcularPlanilla(a.datos);

  it('viento en altura: la suma de las fuerzas es W y el corte en PB y el momento en la base son los de M,NyQ', () => {
    const alt = datosAltura(p, r.viento, r.mnyq, a.filaNivel, 'A');
    expect(alt.length).toBe(p.niveles.length);
    expect(alt[0].pBarlo).toBeCloseTo(r.viento.P[a.filaNivel[0]] / 1000, 9);
    expect(alt[alt.length - 1].M).toBeCloseTo(r.mnyq.J61, 6);
    const suma = alt.reduce((s, x) => s + x.F, 0);
    expect(suma).toBeCloseTo(r.mnyq.H61, 6);
  });

  it('E de la planilla para H30: 3.400.000 t/m²', () => expect(E_DE_DIVISOR(54400)).toBe(3_400_000));

  it('deformada: con carga uniforme reproduce δ = w·h⁴ / 8EJ', () => {
    const h = 60, w = 2, E = 3.4e6, J = 20;
    const alt: PuntoAltura[] = Array.from({ length: 121 }, (_, i) => { const z = i * 0.5; return { nivel: String(z), z, pBarlo: 0, pSota: 0, F: 0, V: 0, M: (w * (h - z) ** 2) / 2 }; });
    const d = deformada(alt, w * h, E, J);
    expect(d.dTop).toBeCloseTo((w * h ** 4) / (8 * E * J), 4);
    expect(d.dUniforme).toBeCloseTo(d.dTop, 4);
    expect(d.limite).toBeCloseTo(h / 500, 9);
  });

  it('rototraslación: la suma de las fuerzas de las piezas es el corte total; planta simétrica sin rotación', () => {
    const rep = reparto(r.rotA, a.datos.rotA.H, a.piezas, 'A');
    expect(rep.piezas.map(x => x.nombre).sort()).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6']);
    expect(rep.piezas.reduce((s, x) => s + x.Qtot, 0)).toBeCloseTo(rep.Q, 6);
    rep.piezas.forEach(x => expect(Math.abs(x.Qrot)).toBeLessThan(1e-6));
  });

  it('rigidez: ΣJ contra el J mínimo de la fila del hormigón', () => {
    const [A] = rigidez(r, 'H30');
    expect(A.hormigon).toBe('H30');
    expect(A.J).toBeCloseTo(22.084, 3);
    expect(A.minimos.h500).toBeCloseTo(r.jminA.tabla[0].h500, 9);
    expect(rigidez(r, 'H50')[0].hormigon).toBe('H47');
  });
});
