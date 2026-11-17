/**
 * Rama motor-fem, paso 1 (docs/motor-fem/CONTEXTO.md, sección 8): la prueba de oro de los motores nuevos.
 *
 * Los casos de tools/motor_fem/casos.ts se exportaron con tools/motor_fem/exportar.ts y se resolvieron con OpenSees
 * (Euler y Timoshenko) y Pynite (Euler) con tools/motor_fem/verificar.py. Los resultados quedan guardados en
 * test/fixtures/motor_fem/, así esta prueba no necesita Python.
 *
 * Prueba de oro: con ménsulas de flexión pura (Euler), todas de altura completa y losa rígida, la rototraslación de
 * la planilla es exacta. Un motor de elementos finitos con esas hipótesis tiene que dar el mismo reparto.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { entradaFem, type EntradaFem } from '../src/engine/femEntrada';
import { CASOS_FEM } from '../tools/motor_fem/casos';

interface ResMotor { motor: string; corte: Record<string, number>; momento: Record<string, number>; uy: number[]; rz: number[]; z: number[] }
const DIR = 'test/fixtures/motor_fem';
const leer = <T>(f: string): T => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));

/**
 * Diferencias conocidas de la planilla. En la hoja «cara menor» (viento B) la planilla original suma B51 e I51 solo
 * hasta la fila 38: con más de 8 perpendiculares el centro de las perpendiculares (J38) sale corrido. En planta34
 * da 0 m en lugar de 1,74 m, y la rigidez a torsión queda un poco mal. La app replica la planilla tal cual.
 */
const TOLERANCIA: Record<string, number> = { planta34_B: 0.03 };

const pct = (corte: Record<string, number>, nombres: string[]) => {
  const tot = nombres.reduce((s, n) => s + corte[n], 0);
  return Object.fromEntries(nombres.map(n => [n, (corte[n] / tot) * 100]));
};

const casos = CASOS_FEM.flatMap(([nombre, f]) => (['A', 'B'] as const).map(v => ({ caso: `${nombre}_${v}`, f, v })));

describe.each(casos)('motor FEM · $caso', ({ caso, f, v }) => {
  const guardada = leer<EntradaFem>(`${caso}.entrada.json`);
  const { motores } = leer<{ motores: ResMotor[] }>(`${caso}.resultados.json`);
  const [euler, pynite, timo] = motores;
  const nombres = guardada.piezas.map(p => p.nombre);
  const zTop = Math.max(...guardada.niveles.map(n => n.z));
  const sumW = guardada.niveles.filter(n => n.z > 0).reduce((s, n) => s + n.W, 0);

  it('la entrada guardada es la que arma hoy la app (si no, correr exportar.ts y verificar.py)', () => {
    const e = entradaFem(f(), v, caso);
    expect(e.piezas.map(p => p.nombre)).toEqual(nombres);
    expect(e.niveles.length).toBe(guardada.niveles.length);
    e.niveles.forEach((n, i) => { expect(n.z).toBeCloseTo(guardada.niveles[i].z, 9); expect(n.W).toBeCloseTo(guardada.niveles[i].W, 9); });
    e.piezas.forEach((p, i) => {
      const g = guardada.piezas[i];
      for (const k of ['x', 'J', 'A', 'Av', 'zDesde', 'zHasta'] as const) expect(p[k]).toBeCloseTo(g[k], 9);
    });
    e.perp.forEach((p, i) => { expect(p.y).toBeCloseTo(guardada.perp[i].y, 9); expect(p.J).toBeCloseTo(guardada.perp[i].J, 9); });
    e.planilla.reparto.forEach((r, i) => expect(r.pct).toBeCloseTo(guardada.planilla.reparto[i].pct, 9));
  });

  it('prueba de oro: la planilla reparte el corte igual que OpenSees con ménsulas de Euler', () => {
    expect(guardada.alturaCompleta).toBe(true);
    const os = pct(euler.corte, nombres), tol = TOLERANCIA[caso] ?? 0.001;
    for (const r of guardada.planilla.reparto) expect(Math.abs(os[r.nombre] - r.pct)).toBeLessThan(tol);
  });

  it('los tres modelos están en equilibrio: el corte de las piezas en la base suma el viento', () => {
    for (const m of motores) {
      // las perpendiculares toman una parte despreciable (flexionan en la otra dirección)
      const s = nombres.reduce((a, n) => a + m.corte[n], 0);
      expect(Math.abs(s - sumW) / sumW).toBeLessThan(1e-3);
    }
  });

  it('Pynite (otro programa, otra forma de armar la losa) da la misma flecha y casi el mismo reparto', () => {
    const fe = euler.uy[euler.uy.length - 1], fp = pynite.uy[pynite.uy.length - 1];
    expect(Math.abs(fp - fe) / fe).toBeLessThan(1e-4);
    const a = pct(euler.corte, nombres), b = pct(pynite.corte, nombres);
    // los brazos de Pynite no son infinitamente rígidos: hasta medio punto en las piezas que más toman
    for (const n of nombres) expect(Math.abs(a[n] - b[n])).toBeLessThan(0.6);
  });

  it('con Timoshenko (deformación por corte) la torre es un poco más flexible, y el reparto cambia', () => {
    const fe = euler.uy[euler.uy.length - 1], ft = timo.uy[timo.uy.length - 1];
    expect(ft).toBeGreaterThan(fe);
    expect(ft / fe).toBeLessThan(1.05);
    expect(timo.z[timo.z.length - 1]).toBeCloseTo(zTop, 9);
  });
});

describe('motor pseudo-3D (paso 2)', () => {
  it.todo('en modo Euler y con piezas de altura completa da el mismo reparto que la planilla y que OpenSees');
  it.todo('en modo Timoshenko da el reparto de OpenSees · Timoshenko');
});
