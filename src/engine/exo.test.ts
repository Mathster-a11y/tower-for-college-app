import { describe, expect, it } from 'vitest';
import { armarCara, calcularExo, condensarCara, EXO_POR_DEFECTO, propsSeccion, rigidezTabiques, type ExoDef } from './exo';

const pisos = (n: number, h = 3) => Array.from({ length: n + 1 }, (_, i) => i * h);
const resolver1 = (K: number[][], W: number[]) => {        // Gauss simple para las pruebas
  const n = K.length, A = K.map((f, i) => [...f, W[i]]);
  for (let c = 0; c < n; c++) { for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c]; x[r] = s / A[r][r]; }
  return x;
};

describe('exoesqueleto · motor', () => {
  it('ménsula de tabiques: carga en la punta δ = P·H³ / 3EI y carga repartida δ = W·H³ / 8EI (exacto en los nudos)', () => {
    const zs = pisos(10), EI = 2e6, H = 30;
    const K = rigidezTabiques(zs, () => EI);
    const P = new Array(10).fill(0); P[9] = 10;
    expect(resolver1(K, P)[9]).toBeCloseTo((10 * H ** 3) / (3 * EI), 9);
    // carga repartida como fuerzas en los nudos (media en la punta): se acerca a W·H³/8EI al afinar
    const z40 = pisos(40, 0.75), W = 40 * 1;
    const q = new Array(40).fill(W / 40); q[39] = W / 80;
    const d = resolver1(rigidezTabiques(z40, () => EI), q)[39];
    expect(Math.abs(d / ((W * H ** 3) / (8 * EI)) - 1)).toBeLessThan(0.02);
  });

  it('dos columnas atadas por diagonales muy rígidas = ménsula con J = Σ A·d² (más la flexión propia)', () => {
    const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'D', modulo: 1, diagonal: { b: 3, e: 1.5 }, viga: { b: 3, e: 1.5 } };
    const zs = pisos(12), ancho = 10, n = 12;
    const c = condensarCara(armarCara(def, ancho, zs), def.E, n);
    const P = new Array(n).fill(0); P[n - 1] = 50;
    const dCara = resolver1(c.K, P)[n - 1];
    const pc = propsSeccion(def.columna), J = 2 * pc.A * (ancho / 2) ** 2 + 2 * pc.I, H = 36;
    expect(Math.abs(dCara / ((50 * H ** 3) / (3 * def.E * J)) - 1)).toBeLessThan(0.03);
  });

  it('equilibrio: lo que toman los tabiques más el exo es el viento de cada piso; sin exo, todo a los tabiques', () => {
    const zs = pisos(20), W = zs.slice(1).map((_z, i) => 4 + i * 0.2);
    for (const tipo of ['A', 'B', 'C', 'D'] as const) {
      const r = calcularExo({ ...EXO_POR_DEFECTO, tipo }, zs, W, () => 3.4e6 * 20, 18, [-10, 10], 3.4e6);
      r.Ftab.forEach((f, i) => expect(f + r.Fexo[i]).toBeCloseTo(W[i], 6));
      expect(r.u[19]).toBeLessThan(r.uSin[19]);
      expect(r.fraccionExo).toBeGreaterThan(0); expect(r.fraccionExo).toBeLessThan(1);
      // el corte de cada cara en la base (suma de las reacciones horizontales) es la mitad de lo que toma el exo
      const Hcaras = r.caras.reduce((s, c) => s + c.reacciones.reduce((q, x) => q + x.H, 0), 0);
      expect(-Hcaras).toBeCloseTo(r.Vexo0, 4);
      // las reacciones verticales se equilibran (par de columnas: tracción a barlovento, compresión a sotavento)
      r.caras.forEach(c => expect(Math.abs(c.reacciones.reduce((q, x) => q + x.V, 0))).toBeLessThan(1e-6 * Math.max(1, r.Vsin[0])));
    }
  });

  it('exo muy flexible: los tabiques toman casi todo y el resultado es el de siempre', () => {
    const zs = pisos(15), W = new Array(15).fill(5);
    const r = calcularExo({ ...EXO_POR_DEFECTO, columna: { b: 0.05, e: 0.002 }, diagonal: { b: 0.02, e: 0.001 }, viga: { b: 0.05, e: 0.002 } }, zs, W, () => 3.4e6 * 30, 18, [-10, 10], 3.4e6);
    expect(r.fraccionExo).toBeLessThan(0.01);
    expect(r.Mtab[0] / r.Msin[0]).toBeGreaterThan(0.99);
  });

  it('torre de la guía con el tubo en X: el exo toma la mayor parte y la flecha baja (orden de la propuesta)', () => {
    // 21 pisos de 3 m (64 m), ΣJ = 22,08 m⁴ en hormigón E = 3,4·10⁶ t/m², W ≈ 129 t
    const zs = [0, ...Array.from({ length: 21 }, (_, i) => 1 + i * 3)], W = zs.slice(1).map(z => 4 + 2.6 * (z / 64) ** 0.3);
    const r = calcularExo(EXO_POR_DEFECTO, zs, W, () => 3.4e6 * 22.08, 18, [-11, 11], 3.4e6);
    expect(r.uSin[20] * 1000).toBeGreaterThan(40);
    expect(r.u[20] / r.uSin[20]).toBeLessThan(0.5);
    expect(r.fraccionExo).toBeGreaterThan(0.5);
    r.caras.forEach(c => expect(c.Jeq).toBeGreaterThan(5));
  });
});

describe('exoesqueleto · pisos que no son múltiplo del módulo', () => {
  it('21 pisos con módulo 4: las cuatro fichas dan números finitos y en equilibrio', () => {
    const zs = pisos(21), W = new Array(21).fill(6);
    for (const tipo of ['A', 'B', 'C', 'D'] as const) {
      const r = calcularExo({ ...EXO_POR_DEFECTO, tipo }, zs, W, () => 3.4e6 * 20, 18, [-10, 10], 3.4e6);
      expect(r.u.every(Number.isFinite)).toBe(true);
      expect(r.caras[0].esfuerzos.every(e => Number.isFinite(e.N) && e.L > 0)).toBe(true);
      r.Ftab.forEach((f, i) => expect(f + r.Fexo[i]).toBeCloseTo(6, 6));
    }
  });
});

describe('exoesqueleto · números de la torre de la guía (para el informe)', () => {
  it('muestra el reparto', () => {
    const zs = [0, ...Array.from({ length: 21 }, (_, i) => 1 + i * 3)], W = zs.slice(1).map(z => 4 + 2.6 * (z / 64) ** 0.3);
    const r = calcularExo(EXO_POR_DEFECTO, zs, W, () => 3.4e6 * 22.08, 18, [-11, 11], 3.4e6);
    console.log(`δ sin exo ${(r.uSin[20] * 1000).toFixed(1)} mm · con exo ${(r.u[20] * 1000).toFixed(1)} mm · exo toma ${(r.fraccionExo * 100).toFixed(0)} % del momento · Jeq cara ${r.caras[0].Jeq.toFixed(1)} m⁴ · barras ${r.controles.length}, no verifican ${r.controles.filter(c => c.estado !== 'verifica').length}`);
    const peor = [...r.controles].sort((a, b) => b.sigma - a.sigma)[0];
    console.log(`peor barra ${peor.cara} ${peor.id} ${peor.clase} N=${peor.N.toFixed(1)} t σ=${(peor.sigma / 10).toFixed(0)} kg/cm² λ=${peor.lambda.toFixed(0)}`);
  });
});
