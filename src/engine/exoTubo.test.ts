import { describe, expect, it } from 'vitest';
import { armarCara, calcularExo, condensarCara, EXO_POR_DEFECTO, pesoExo, propsSeccion, type EntradaExo, type ExoDef } from './exo';

const resolver1 = (K: number[][], W: number[]) => {
  const n = K.length, A = K.map((f, i) => [...f, W[i]]);
  for (let c = 0; c < n; c++) for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c]; x[r] = s / A[r][r]; }
  return x;
};
const pisos = (n: number, h = 3) => Array.from({ length: n + 1 }, (_, i) => i * h);

describe('ficha T · tubo en tubo (tubo enmarcado alrededor del núcleo)', () => {
  const zs = pisos(20), ancho = 30;
  const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'T', pasoCol: 3, columna: { b: 0.6, e: 0.03 }, viga: { b: 0.8, e: 0.03 } };
  it('la cara paralela: columnas cada 3 m de piso a piso y una viga de fachada en cada piso; las alas en las esquinas', () => {
    const c = armarCara(def, ancho, zs);
    const nb = 10;
    const cols = c.barras.filter(b => b.clase === 'columna' && !b.fraccion), vigas = c.barras.filter(b => b.clase === 'viga');
    expect(cols.length).toBe((nb + 1) * 20);
    expect(vigas.length).toBe(nb * 20);
    // las alas: 9 columnas intermedias de cada cara perpendicular × 0,6 (shear lag), la mitad en cada cara paralela
    const alas = c.barras.filter(b => b.fraccion);
    expect(alas.length).toBe(2 * 20);
    alas.forEach(b => { expect(b.fraccion).toBeCloseTo((9 * 0.6) / 2, 12); expect(b.sinPeso).toBe(true); });
    // todo rígido: la cara es un pórtico de muchos vanos
    expect(c.barras.every(b => !b.relA && !b.relB)).toBe(true);
  });
  it('el peso cuenta cada columna del perímetro una vez (4 caras de 10 vanos: 40 columnas) y 40 vigas por piso', () => {
    const en: EntradaExo[] = [{ zs, W: zs.slice(1).map(() => 5), EJ: () => 3e6 * 50, ancho, tCaras: [-15, 15], Eh: 3e6, h: 60 }, { zs, W: zs.slice(1).map(() => 5), EJ: () => 3e6 * 50, ancho, tCaras: [-15, 15], Eh: 3e6, h: 60, dir: 'B' }];
    const Ac = propsSeccion(def.columna).A, Av = propsSeccion(def.viga).A;
    expect(pesoExo(def, en)).toBeCloseTo(7.85 * (40 * 60 * Ac + 40 * 20 * 3 * Av), 3);
  });
  it('con vigas muy rígidas: flexión de ménsula (J = Σ A·s² + Σ I) más el corte de cada piso (V·h³ / 12·E·Σ I)', () => {
    const rigido: ExoDef = { ...def, alaTubo: 0, viga: { b: 3, e: 1.5 }, pesoPropio: false };
    const c = condensarCara(armarCara(rigido, ancho, zs), def.E, 20);
    const P = new Array(20).fill(0); P[19] = 100;
    const u = resolver1(c.K, P)[19];
    const pc = propsSeccion(def.columna), xs = Array.from({ length: 11 }, (_, i) => -15 + 3 * i);
    const J = xs.reduce((s, x) => s + pc.A * x * x + pc.I, 0), H = 60;
    const flexion = (100 * H ** 3) / (3 * def.E * J), corte = (20 * 100 * 3 ** 3) / (12 * def.E * 11 * pc.I);
    // el corte de los pisos (racking) es del orden de la flexión: por eso un tubo enmarcado pide columnas cercanas y vigas altas
    expect(corte / flexion).toBeGreaterThan(0.5);
    expect(Math.abs(u / (flexion + corte) - 1)).toBeLessThan(0.05);
  });
  it('más columnas (paso más chico) y alas que trabajan más dan una torre más rígida', () => {
    const W = zs.slice(1).map(() => 5);
    const u = (d: ExoDef) => calcularExo(d, zs, W, () => 3e6 * 20, ancho, [-15, 15], 3e6).u.at(-1)!;
    expect(u({ ...def, pasoCol: 2 })).toBeLessThan(u({ ...def, pasoCol: 5 }));
    expect(u({ ...def, alaTubo: 1 })).toBeLessThan(u({ ...def, alaTubo: 0.3 }));
  });
});
