import { describe, expect, it } from 'vitest';
import { ejemploGuia } from '../src/engine/modelo';
import { aPlanilla } from '../src/engine/mapping';
import { calcularPlanilla } from '../src/engine/planilla';

describe('del proyecto a la planilla (ejemplo de la guía 2024)', () => {
  const a = aPlanilla(ejemploGuia());
  const r = calcularPlanilla(a.datos);

  it('niveles: la azotea va en la fila del 21º y PB en la del 0º', () => {
    expect(a.datos.viento.Z[29]).toBe(64);
    expect(a.datos.viento.Z[50]).toBe(0);
    expect(a.datos.viento.Z[52]).toBe(-8);
    expect(a.datos.viento.Z[53]).toBe(-8); // tercer subsuelo inexistente: altura 0
    expect(a.datos.mnyq.D[29]).toBe(1.5);   // medio entrepiso en la azotea
    expect(a.datos.mnyq.D[28]).toBe(0);
    expect(a.datos.mnyq.E[29]).toBe(20);
    expect(a.datos.mnyq.E[51]).toBe(22);
  });

  it('piezas del viento A: tabiques simples y U simétrica, como la guía', () => {
    const t1 = a.piezas.find(p => p.nombre === 'T1')!;
    expect(t1.molde).toBe('simétrico');
    expect(t1.filaHoja).toBe(0);
    const t5 = a.piezas.find(p => p.nombre === 'T5')!;
    expect(t5.molde).toBe('simétrico');
    expect(t5.fila).toMatchObject({ B: 0.2, C: 3.6, F: 5, G: 0.2, J: 5, K: 0.2 });
    expect(r.jpar.filas[t5.filaHoja!].AY).toBeCloseTo(8.0043, 3);   // guía: 8,003 m⁴ (redondeado)
    expect(r.jpar.AY24).toBeCloseTo(4 * 1.51875 + 2 * 8.0043, 3);
    expect(t5.posicion).toBeCloseTo(-4.635, 3);
  });

  it('piezas del viento B: la U pasa a tener dos almas y un ala', () => {
    const t5b = a.piezas.find(p => p.nombre === 'T5B')!;
    expect(t5b.molde).toBe('asimétrico');
    expect(t5b.fila).toMatchObject({ W: 3.6, X: 0.2, Z: 0.2, AB: 5, AE: 0.2, AF: 5 });
    expect(a.papeles.M5.B).toBe('ala sup.');
    expect(a.papeles.M6.B).toBe('alma');
    const t1b = a.piezas.find(p => p.nombre === 'T1B')!;
    expect(r.jort.filas[t1b.filaHoja!].AY).toBeCloseTo(4.5 * 0.2 ** 3 / 12, 6);
  });

  it('planta simétrica: sin excentricidad', () => {
    expect(r.rotA.J7).toBeCloseTo(0, 9);
    expect(r.rotA.C25).toBeCloseTo(1, 9);
  });

  it('flexocompresión: altura, área de influencia y losas', () => {
    expect(a.datos.flex[0]).toEqual({ C: 64, F: 10.5, G: 21 });
  });
});
