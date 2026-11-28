import { describe, expect, it } from 'vitest';
import { calcularExo, cirsoc301, compuesta301, dimensionarExo, ecMPa, ES_MPA, EXO_POR_DEFECTO, FY_F24, MPA_T, pesoExo, propsSeccion, type EntradaExo, type ExoDef } from './exo';

describe('columnas compuestas (tubo relleno de hormigón, CIRSOC 301 cap. I)', () => {
  const tubo = { b: 0.6, e: 0.025 }, lleno = { ...tubo, relleno: 40 };
  it('sección transformada: A = As + Ac/n e I = Is + Ic/n, con n = Es/Ec; el peso suma el hormigón', () => {
    const h = propsSeccion(tubo), p = propsSeccion(lleno);
    const bi = 0.55, As = 0.36 - bi * bi, Ac = bi * bi, n = ES_MPA / (4700 * Math.sqrt(40));
    expect(h.A).toBeCloseTo(As, 12);
    expect(p.As).toBeCloseTo(As, 12);
    expect(p.A).toBeCloseTo(As + Ac / n, 12);
    expect(p.I).toBeCloseTo(h.I + bi ** 4 / 12 / n, 12);
    // 7,85·Ap = 7,85·As + 2,4·Ac
    expect(7.85 * p.Ap).toBeCloseTo(7.85 * As + 2.4 * Ac, 9);
    // una barra maciza (hormigón) o sin relleno no cambia
    expect(propsSeccion({ b: 0.5, e: 0.25, relleno: 30 }).A).toBeCloseTo(0.25, 12);
  });
  it('valores modificados a mano: Fmy = Fy + 0,85·f\'c·Ac/As y Em = E + 0,4·Ec·Ac/As', () => {
    const E = 2.1e7, c = compuesta301(lleno, E, FY_F24)!;
    const r = 0.55 ** 2 / (0.36 - 0.55 ** 2);
    expect(c.Fmy).toBeCloseTo(FY_F24 + 0.85 * 40 * MPA_T * r, 6);
    expect(c.Em).toBeCloseTo(E + 0.4 * ecMPa(40) * MPA_T * r, 3);
    expect(c.cuantia).toBeCloseTo((0.36 - 0.55 ** 2) / 0.36, 12);
    expect(c.btMax).toBeCloseTo(Math.sqrt((3 * E) / FY_F24), 12);
    expect(compuesta301(tubo, E, FY_F24)).toBeNull();
  });

  // una torre de 20 pisos con mega-marcos (ficha B) cargada con su peso y el de las losas
  const zs = Array.from({ length: 21 }, (_, i) => i * 3), W = zs.slice(1).map(() => 5);
  const base: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'B', columna: tubo, losas: { franja: 5 } };
  const compuesto: ExoDef = { ...base, columna: lleno };
  it('CIRSOC 301: la columna rellena resiste más a compresión que el tubo solo, con su acero', () => {
    const a = cirsoc301(base, zs, W, () => 3e6 * 50, 30, [-10, 10], 3e6), b = cirsoc301(compuesto, zs, W, () => 3e6 * 50, 30, [-10, 10], 3e6);
    const col = (v: typeof a) => v.find(x => x.clase === 'columna' && x.z === 0)!;
    const ca = col(a), cb = col(b);
    expect(cb.compuesta).toBeDefined();
    expect(cb.phiPc).toBeGreaterThan(ca.phiPc * 1.3);
    // la tracción y la flexión, con el acero solo (iguales)
    expect(cb.phiPt).toBeCloseTo(ca.phiPt, 6);
    expect(cb.phiMn).toBeCloseTo(ca.phiMn, 6);
    // φc·Pn = 0,85·As·Fcr con λc de los valores modificados
    const c = cb.compuesta!, p = propsSeccion(lleno), r = Math.sqrt(p.Is / p.As), lc = (3 / (r * Math.PI)) * Math.sqrt(c.Fmy / c.Em);
    expect(cb.lambdaC).toBeCloseTo(lc, 9);
    expect(cb.phiPc).toBeCloseTo(0.85 * p.As * 0.658 ** (lc ** 2) * c.Fmy, 6);
  });
  it('rigidez: la torre con columnas rellenas se mueve menos; el peso suma el hormigón', () => {
    const ua = calcularExo(base, zs, W, () => 3e6 * 50, 30, [-10, 10], 3e6).u.at(-1)!, ub = calcularExo(compuesto, zs, W, () => 3e6 * 50, 30, [-10, 10], 3e6).u.at(-1)!;
    expect(ub).toBeLessThan(ua);
    const en: EntradaExo[] = [{ zs, W, EJ: () => 3e6 * 50, ancho: 30, tCaras: [-10, 10], Eh: 3e6, h: 60 }];
    const pa = pesoExo(base, en), pb = pesoExo(compuesto, en);
    // las columnas: 2 por cara × 2 caras × 60 m, cada una con 2,4 t/m³ × Ac de hormigón
    expect(pb - pa).toBeCloseTo(4 * 60 * 2.4 * 0.55 ** 2, 3);
  });
  it('el dimensionado conserva el relleno al cambiar de tubo', () => {
    const en: EntradaExo[] = [{ zs, W, EJ: () => 3e6 * 50, ancho: 30, tCaras: [-10, 10], Eh: 3e6, h: 60 }];
    const r = dimensionarExo({ ...compuesto, losas: undefined }, en);
    expect(r.def.columna.relleno).toBe(40);
  });
});
