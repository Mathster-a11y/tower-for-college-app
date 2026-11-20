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
