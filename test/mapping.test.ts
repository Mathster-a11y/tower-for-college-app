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

  it('piezas del viento A: tabiques simples simétricos y la U en las columnas asimétricas', () => {
    const t1 = a.piezas.find(p => p.nombre === 'T1')!;
    expect(t1.molde).toBe('simétrico');
    expect(t1.filaHoja).toBe(0);
    const t5 = a.piezas.find(p => p.nombre === 'T5')!;
    expect(t5.molde).toBe('asimétrico');                             // U: alas hacia un solo lado
    expect(t5.fila).toMatchObject({ W: 5, X: 0.2, Z: 0.2, AB: 3.6, AH: 5, AI: 0.2 });
    expect([9, 10]).toContain(t5.filaHoja);                          // filas donde flex lee el módulo asimétrico
    expect(r.jpar.filas[t5.filaHoja!].AY).toBeCloseTo(8.0043, 3);   // mismo J que la guía: 8,003 m⁴ (redondeado)
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

describe('regla de las piezas: simétrica solo el muro suelto y la doble T', () => {
  const base = ejemploGuia();
  const muro = (id: string, dir: 'X' | 'Y', x: number, y: number, largo: number, piezaA: string, pegadoA = '') =>
    ({ id, dir, x, y, largo, espesor: 0.2, llega: true, areaInf: 10, piezaA, pegadoA, piezaB: '', pegadoB: '' });
  const molde = (muros: ReturnType<typeof muro>[]) => aPlanilla({ ...base, muros }).piezas.find(p => p.nombre === 'P')!;

  it('doble T con alas iguales y centradas: simétrica', () => {
    const p = molde([muro('a', 'Y', 0, 0, 4, 'P'), muro('s', 'X', 0, 2.1, 3, 'P', 'a'), muro('i', 'X', 0, -2.1, 3, 'P', 'a')]);
    expect(p.molde).toBe('simétrico');
    expect(p.fila).toMatchObject({ B: 0.2, C: 4, F: 3, G: 0.2, J: 3, K: 0.2 });
  });
  it('C (alas iguales hacia un lado): asimétrica, con el mismo J que la doble T', () => {
    const c = molde([muro('a', 'Y', 0, 0, 4, 'P'), muro('s', 'X', 1.5, 2.1, 3, 'P', 'a'), muro('i', 'X', 1.5, -2.1, 3, 'P', 'a')]);
    const dt = molde([muro('a', 'Y', 0, 0, 4, 'P'), muro('s', 'X', 0, 2.1, 3, 'P', 'a'), muro('i', 'X', 0, -2.1, 3, 'P', 'a')]);
    expect(c.molde).toBe('asimétrico');
    const Jc = calcularPlanilla(aPlanilla({ ...base, muros: [muro('a', 'Y', 0, 0, 4, 'P'), muro('s', 'X', 1.5, 2.1, 3, 'P', 'a'), muro('i', 'X', 1.5, -2.1, 3, 'P', 'a')] }).datos).jpar.filas[c.filaHoja!].AY;
    const Jd = calcularPlanilla(aPlanilla({ ...base, muros: [muro('a', 'Y', 0, 0, 4, 'P'), muro('s', 'X', 0, 2.1, 3, 'P', 'a'), muro('i', 'X', 0, -2.1, 3, 'P', 'a')] }).datos).jpar.filas[dt.filaHoja!].AY;
    expect(Jc).toBeCloseTo(Jd, 6);
  });
  it('doble T con alas distintas, T y L: asimétricas', () => {
    expect(molde([muro('a', 'Y', 0, 0, 4, 'P'), muro('s', 'X', 0, 2.1, 3, 'P', 'a'), muro('i', 'X', 0, -2.1, 2, 'P', 'a')]).molde).toBe('asimétrico');
    expect(molde([muro('a', 'Y', 0, 0, 4, 'P'), muro('s', 'X', 0, 2.1, 3, 'P', 'a')]).molde).toBe('asimétrico');
    expect(molde([muro('a', 'Y', 0, 0, 4, 'P'), muro('s', 'X', 1.5, 2.1, 3, 'P', 'a')]).molde).toBe('asimétrico');
  });
  it('muro suelto: simétrico', () => {
    expect(molde([muro('a', 'Y', 0, 0, 4, 'P')]).molde).toBe('simétrico');
  });
  it('más de 4 piezas asimétricas en el viento A: usan otras filas y avisan por la flexocompresión', () => {
    const muros = Array.from({ length: 6 }, (_, k) => [muro(`a${k}`, 'Y', k * 3 - 8, 0, 4, `P${k}`), muro(`s${k}`, 'X', k * 3 - 7, 2.1, 2, `P${k}`, `a${k}`)]).flat();
    const a = aPlanilla({ ...base, muros });
    const filas = a.piezas.filter(p => p.dir === 'A').map(p => p.filaHoja);
    expect(filas.slice().sort((x, y) => x! - y!)).toEqual([9, 10, 11, 12, 13, 14]);
    expect(a.piezas.find(p => p.filaHoja === 11)!.avisos.join(' ')).toMatch(/módulo simétrico/);
  });
});
