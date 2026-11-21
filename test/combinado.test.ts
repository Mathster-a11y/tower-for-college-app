/** Método Combinado (etapa 7): los cuatro métodos con la misma torre, comparados. */
import { describe, expect, it } from 'vitest';
import { ejemploGuia } from '../src/engine/modelo';
import { calcularProyecto } from '../src/ui/estado';
import { diferencia } from '../src/engine/metodos/combinado';

describe('método Combinado', () => {
  const c = calcularProyecto({ ...ejemploGuia(), calculo: { metodo: 'combinado' } });
  const cmp = c.combinado!;
  const fila = (n: string) => cmp.filas.find(f => f.nombre === n)!;
  it('corre los cuatro métodos y cada uno da lo mismo que calculado solo', () => {
    for (const m of ['planilla', 'guia', 'cirsoc', 'fem'] as const) {
      const solo = calcularProyecto({ ...ejemploGuia(), calculo: { metodo: m } });
      expect(cmp.resumen[m].noVerifican).toBe(solo.controles.filter(x => x.estado === 'no verifica').length);
    }
    const sinPB = calcularProyecto({ ...ejemploGuia(), calculo: { metodo: 'cirsoc' } }).cirsoc!.viento.A.QPB;
    expect(fila('Corte del viento en PB, viento A').valores.cirsoc).toBe(sinPB);
    expect(fila('Frecuencia n1, viento A').valores.fem).toBe(calcularProyecto({ ...ejemploGuia(), calculo: { metodo: 'fem' } }).fem!.n1.A);
  });
  it('la planilla y la guía comparten el viento del 102-2005; el ΣJ es el mismo con piezas de tabiques', () => {
    const q = fila('Corte del viento en PB, viento A');
    expect(Math.abs(diferencia(q, 'guia')!)).toBeLessThan(1);
    expect(Math.abs(diferencia(fila('ΣJ, viento A'), 'fem')!)).toBeLessThan(1e-6);
  });
  it('las etapas muestran la Planilla virgen', () => {
    const pl = calcularProyecto({ ...ejemploGuia(), calculo: { metodo: 'planilla' } });
    expect(c.valores.mnyq.H61).toBe(pl.valores.mnyq.H61);
  });
});

describe('Excel de la comparación', () => {
  it('lleva la tabla, las diferencias como fórmulas que dan bien y los gráficos', async () => {
    const { libroCombinado } = await import('../src/xlsx/libros/libroCombinado');
    const { Evaluador, esError } = await import('../src/xlsx/formulas');
    const JSZip = (await import('jszip')).default;
    const p = { ...ejemploGuia(), calculo: { metodo: 'combinado' as const } };
    const cmp = calcularProyecto(p).combinado!;
    const L = libroCombinado(cmp, p);
    const { libro, nombres } = L.aLibroEvaluable();
    const ev = new Evaluador(libro, nombres);
    const h = L.hojas.find(x => x.nombre === 'Comparación')!;
    const ref = [...h.celdas.entries()].find(([, x]) => x.v === 'Corte del viento en PB, viento A')![0];
    const fila = Number(ref.slice(1));
    const d = ev.celda('Comparación', `H${fila}`) as number;
    const f = cmp.filas.find(x => x.nombre === 'Corte del viento en PB, viento A')!;
    expect(d).toBeCloseTo(diferencia(f, 'cirsoc')! / 100, 12);
    for (const [r, x] of h.celdas) if (x.v && typeof x.v === 'object') expect(esError(ev.celda('Comparación', r))).toBe(false);
    const zip = await JSZip.loadAsync(await L.xlsx());
    expect(Object.keys(zip.files).filter(x => /^xl\/charts\/chart\d+\.xml$/.test(x)).length).toBe(3);
  });
});

describe('verificación comparable entre métodos', () => {
  it('compresión del hormigón solo y armadura vertical necesaria, con el mismo significado en los cuatro', () => {
    const p = { ...ejemploGuia(), calculo: { metodo: 'combinado' as const } };
    const cmp = calcularProyecto(p).combinado!;
    const f = (n: string) => cmp.filas.find(x => x.nombre === n)!;
    expect(cmp.filas.some(x => /uso del hormigón/.test(x.nombre))).toBe(false);
    const c1 = f('T1 (viento A): compresión del hormigón solo'), a1 = f('T1 (viento A): armadura vertical necesaria');
    // planilla y guía: |σ| / σbk (≈ 83 / 300); CIRSOC y FEM: el cordón comprimido sin armadura (> 1: lleva armadura)
    expect(c1.valores.guia!).toBeCloseTo(82.92 / 300, 3);
    expect(c1.valores.cirsoc!).toBeGreaterThan(1); expect(c1.estados!.cirsoc).toBe('atención');
    // armadura: la guía por la tracción (chica: 3,5 cm² en 0,9 m²), CIRSOC 1,50 %, FEM 1,05 %
    expect(a1.valores.planilla).toBeNull();
    expect(a1.valores.guia!).toBeGreaterThan(0); expect(a1.valores.guia!).toBeLessThan(0.1);
    expect(a1.valores.cirsoc!).toBeCloseTo(1.5, 6); expect(a1.valores.fem!).toBeCloseTo(1.05, 6);
    expect(f('T5 (viento A): armadura vertical necesaria').valores.cirsoc!).toBeCloseTo(3.37, 6);
    expect(a1.estados!.cirsoc).toBe('verifica');
  });
});
