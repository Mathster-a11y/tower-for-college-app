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
import { modal, resolverTorre, type ModeloTorre } from '../src/engine/fem/pseudo3d';
import { cargasDeEntrada, modeloDeEntrada } from '../src/engine/contrasteFem';
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
      for (const k of ['x', 'J', 'A', 'Av', 'zDesde', 'zHasta'] as const) expect(p[k]).toBeCloseTo(g[k], 6);   // 1e-6: redondeos de la geometría
    });
    e.perp.forEach((p, i) => { expect(p.y).toBeCloseTo(guardada.perp[i].y, 6); expect(p.J).toBeCloseTo(guardada.perp[i].J, 6); });
    e.planilla.reparto.forEach((r, i) => expect(r.pct).toBeCloseTo(guardada.planilla.reparto[i].pct, 9));
  });

  // la planilla supone que todas las piezas llegan a la azotea: con muros que terminan antes (P5) no hay prueba de oro
  it.runIf(guardada.alturaCompleta)('prueba de oro: la planilla reparte el corte igual que OpenSees con ménsulas de Euler', () => {
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
    // con piezas que terminan antes de la azotea, los brazos de Pynite (no infinitamente rígidos) pesan más
    expect(Math.abs(fp - fe) / fe).toBeLessThan(guardada.alturaCompleta ? 1e-4 : 0.02);
    const a = pct(euler.corte, nombres), b = pct(pynite.corte, nombres);
    // los brazos de Pynite no son infinitamente rígidos: medio punto más un 2 % de lo que toma la pieza (un núcleo que
    // toma el 65 %, como en P8, difiere un punto); con piezas que terminan antes, hasta un punto y medio más
    for (const n of nombres) expect(Math.abs(a[n] - b[n])).toBeLessThan((guardada.alturaCompleta ? 0.6 : 1.5) + 0.02 * a[n]);
  });

  it('con Timoshenko (deformación por corte) la torre es un poco más flexible, y el reparto cambia', () => {
    const fe = euler.uy[euler.uy.length - 1], ft = timo.uy[timo.uy.length - 1];
    expect(ft).toBeGreaterThan(fe);
    expect(ft / fe).toBeLessThan(1.05);
    expect(timo.z[timo.z.length - 1]).toBeCloseTo(zTop, 9);
  });
});

const modeloDe = modeloDeEntrada, cargasDe = cargasDeEntrada;

describe.each(casos)('motor pseudo-3D de la app · $caso', ({ caso }) => {
  const e = leer<EntradaFem>(`${caso}.entrada.json`);
  const { motores } = leer<{ motores: ResMotor[] }>(`${caso}.resultados.json`);
  const [euler, , timo] = motores;
  for (const [nombre, ref, conCorte] of [['Euler', euler, false], ['Timoshenko', timo, true]] as const) {
    it(`${nombre}: el mismo corte en cada pieza, la misma flecha y el mismo giro que OpenSees`, () => {
      const mo = modeloDe(e, conCorte), r = resolverTorre(mo, cargasDe(e, mo));
      // Euler: la misma matriz que OpenSees (diferencias de 1e-6, la precisión de los números guardados).
      // Timoshenko: diferencias de 1e-4 entre la viga de la app y ElasticTimoshenkoBeam de OpenSees.
      const tol = conCorte ? 1e-3 : 1e-5;
      for (const p of e.piezas) {
        const v = r.piezas.find(x => x.nombre === p.nombre)!.V, o = ref.corte[p.nombre];
        expect(Math.abs(v - o)).toBeLessThan(tol * Math.max(1, Math.abs(o)));
      }
      const top = r.uy[r.uy.length - 1], oTop = ref.uy[ref.uy.length - 1];
      expect(Math.abs(top - oTop) / oTop).toBeLessThan(tol);
      expect(Math.abs(r.rz[r.rz.length - 1] - ref.rz[ref.rz.length - 1])).toBeLessThan(1e-7 + tol * Math.abs(ref.rz[ref.rz.length - 1]));
    });
  }
  it('la suma de los cortes es el viento (equilibrio)', () => {
    const mo = modeloDe(e, false), r = resolverTorre(mo, cargasDe(e, mo));
    const W = mo.z.reduce((s, z) => s + e.niveles.find(n => Math.abs(n.z - z) < 1e-9)!.W, 0);
    expect(Math.abs(r.piezas.filter(p => p.dir === 'A').reduce((s, p) => s + p.V, 0) - W) / W).toBeLessThan(1e-6);
  });
});

describe('análisis modal', () => {
  it('una ménsula sola: la primera frecuencia de una barra con masas concentradas tiende a la continua (1,875²)', () => {
    // 40 pisos de 1 m, EI = 1, masa 1 por piso: f1 ≈ 1,875² / (2π) · √(EI / (m·L⁴)) con L = 40
    const z = Array.from({ length: 40 }, (_, i) => i + 1);
    const mo: ModeloTorre = { z, E: 1, G: 1, timo: false, piezas: [{ nombre: 'P', dir: 'A', pos: 0, J: 1, Av: 1, zHasta: 40 }, { nombre: 'Q', dir: 'B', pos: 0, J: 1, Av: 1, zHasta: 40 }, { nombre: 'R', dir: 'A', pos: 5, J: 1e-3, Av: 1, zHasta: 40 }] };
    const modos = modal(mo, z.map(() => 1), z.map(() => 1));
    const fy = modos.find(m => m.dominante === 'y')!.f;
    const teo = (1.8751 ** 2 / (2 * Math.PI)) * Math.sqrt(1 / 40 ** 4);
    expect(fy / teo).toBeCloseTo(1, 1);
  });
});
