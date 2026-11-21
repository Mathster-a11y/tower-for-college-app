/**
 * Vientos oblicuos («quartering») en el exoesqueleto: las columnas de esquina son de dos caras y con el viento en
 * diagonal suman las dos partes (102-25, Fig. 2.4-8, casos 3 y 4; en el curso, 45° con cos 45°). Las demás barras
 * quedan como con el viento de frente.
 */
import { describe, expect, it } from 'vitest';
import { calcularExo, cirsoc301, COMBOS_101_25, COMBOS_CURSO, COMBOS_OBLICUOS_101_25, COMBOS_OBLICUOS_CURSO, esquinasPorAltura, EXO_POR_DEFECTO, vientoDeCuarto, type EntradaExo, type ExoDef } from '../src/engine/exo';

const zs = Array.from({ length: 13 }, (_, i) => i * 3), W = zs.slice(1).map(() => 5);
const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'D', modulo: 4 };
const ent: EntradaExo = { zs, W, EJ: () => 3e6 * 20, ancho: 20, tCaras: [-10, 10], Eh: 3e6, h: 36 };
const c301 = (combos: typeof COMBOS_101_25, otro?: EntradaExo) => cirsoc301(def, zs, W, ent.EJ, 20, [-10, 10], 3e6, undefined, undefined, { combos, otro });

describe('vientos oblicuos en el exoesqueleto', () => {
  it('reglamento: las columnas de esquina empeoran (caso 3 manda) y las demás barras no cambian', () => {
    const frente = c301(COMBOS_101_25), oblicuo = c301([...COMBOS_101_25, ...COMBOS_OBLICUOS_101_25], ent);
    const r = calcularExo({ ...def, pesoPropio: false }, zs, W, ent.EJ, 20, [-10, 10], 3e6), esq = esquinasPorAltura(r);
    expect(esq.size).toBeGreaterThan(3);
    let esquinas = 0, mandaOblicuo = 0;
    oblicuo.forEach((b, k) => {
      const f = frente[k];
      expect(b.id).toBe(f.id);
      if (b.ratio > f.ratio + 1e-9) { esquinas++; expect(b.clase).toBe('columna'); expect(b.combinacion).toMatch(/caso 3/); mandaOblicuo++; }
      else expect(b.ratio).toBeCloseTo(f.ratio, 9);
    });
    expect(esquinas).toBeGreaterThan(0); expect(mandaOblicuo).toBe(esquinas);
  });
  it('curso: 45° con 0,71 de cada viento, 1,41 veces el N de frente en una torre simétrica', () => {
    const def0 = { ...def, pesoPropio: false };
    const r = calcularExo(def0, zs, W, ent.EJ, 20, [-10, 10], 3e6);
    vientoDeCuarto(r, r).filter(x => x.NA > 1e-6).forEach(x => expect(x.razon).toBeCloseTo(Math.SQRT2, 9));
    vientoDeCuarto(r, r, 0.75).filter(x => x.NA > 1e-6).forEach(x => expect(x.razon).toBeCloseTo(1.5, 9));
    const frente = c301(COMBOS_CURSO), oblicuo = c301([...COMBOS_CURSO, ...COMBOS_OBLICUOS_CURSO], ent);
    expect(oblicuo.some((b, k) => b.ratio > frente[k].ratio && /45°/.test(b.combinacion))).toBe(true);
  });
  it('sin el viento perpendicular, los combos oblicuos no se usan', () => {
    const a = c301(COMBOS_101_25), b = c301([...COMBOS_101_25, ...COMBOS_OBLICUOS_101_25]);
    b.forEach((x, k) => expect(x.ratio).toBeCloseTo(a[k].ratio, 12));
  });
});
