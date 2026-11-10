import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { calcularPlanilla, type PlanillaDatos } from '../src/engine/planilla';

// Datos y resultados guardados por Excel en la planilla del ejemplo (20-10-26), extraídos con tools/extraer_fixture.py
const fx = JSON.parse(readFileSync(new URL('./fixtures/ejemplo_20-10-26.json', import.meta.url), 'utf8'));
const res = calcularPlanilla(fx.inputs as PlanillaDatos);

function cerca(nombre: string, calc: number, esperado: number | null) {
  if (esperado === null) return; // celda vacía o con error en Excel
  const tol = 1e-6 * Math.max(1, Math.abs(esperado));
  if (!(Math.abs(calc - esperado) <= tol)) throw new Error(`${nombre}: calculado ${calc}, Excel ${esperado}`);
}
function columnas(hoja: string, calc: Record<string, number[]>, esperado: Record<string, (number | null)[]>, filas?: number[]) {
  for (const [col, vals] of Object.entries(esperado)) {
    vals.forEach((e, i) => {
      if (filas && !filas.includes(i)) return;
      cerca(`${hoja}!${col}[${i}]`, calc[col][i], e);
    });
  }
}

describe('réplica de la planilla original (ejemplo 20-10-26)', () => {
  it('viento', () => {
    const v = res.viento;
    columnas('viento', { H: v.Kz, M: v.qz, P: v.P, Q: v.Q, R: v.R, S: v.S }, fx.expected.viento);
  });
  it('M,NyQ por nivel', () => {
    columnas('M,NyQ', res.mnyq as unknown as Record<string, number[]>, fx.expected.mnyq);
  });
  it('M,NyQ totales, suelo y verificación', () => {
    for (const [k, e] of Object.entries(fx.expected.mnyqTot)) cerca(`M,NyQ!${k}`, (res.mnyq as unknown as Record<string, number>)[k], e as number);
  });
  it('J paralelos y ortogonales', () => {
    const cols = (h: typeof res.jpar) => Object.fromEntries(['N', 'O', 'Q', 'U', 'V', 'AK', 'AL', 'AM', 'AN', 'AX', 'AY'].map(c => [c, h.filas.map(f => (f as unknown as Record<string, number>)[c])]));
    columnas('J par', cols(res.jpar), fx.expected.jpar);
    columnas('J ort', cols(res.jort), fx.expected.jort);
    cerca('J par AY24', res.jpar.AY24, fx.expected.jparTot.AY24);
    cerca('J ort AY24', res.jort.AY24, fx.expected.jortTot.AY24);
    cerca('J par K37', res.jminA.tabla[0].h400, fx.expected.jparTot.K37);
    cerca('J par M37', res.jminA.tabla[0].h500, fx.expected.jparTot.M37);
    cerca('J ort I37', res.jminB.W, fx.expected.jortTot.I37);
    cerca('J ort K37', res.jminB.tabla[0].h400, fx.expected.jortTot.K37);
  });
  it('rototraslación cara mayor y cara menor', () => {
    const filas = [...Array(20).keys(), 23, 24, ...Array.from({ length: 20 }, (_, j) => 26 + j)];
    const map = (r: typeof res.rotA) => ({ B: r.B, C: r.C, E: r.E, G: r.G, I: r.I, K: r.K, L: r.L, M: r.Mm, N: r.N, O: r.O });
    columnas('Rot A', map(res.rotA), fx.expected.rotA, filas.filter(i => i < 20 || i >= 26));
    columnas('Rot B', map(res.rotB), fx.expected.rotB, filas.filter(i => i < 20 || i >= 26));
    for (const [k, e] of Object.entries(fx.expected.rotATot)) cerca(`Rot A ${k}`, (res.rotA as unknown as Record<string, number>)[k], e as number);
    for (const [k, e] of Object.entries(fx.expected.rotBTot)) cerca(`Rot B ${k}`, (res.rotB as unknown as Record<string, number>)[k], e as number);
  });
  it('flexocompresión', () => {
    const f = res.flex;
    columnas('Flex', { B: f.B, D: f.D, E: f.E, H: f.H, I: f.I, J: f.J, K: f.K, L: f.L, M: f.M, N: f.Nn, O: f.O, P: f.P }, fx.expected.flex);
  });
  it('los errores de Excel coinciden con NaN', () => {
    // flexocompresión de las filas 12 y 13 (núcleos en filas «simétricas») da #DIV/0! en Excel
    expect(fx.expected.flex.M[11]).toBeNull();
    expect(Number.isNaN(res.flex.M[11])).toBe(true);
  });
});
