/** Lo que necesitan los edificios reales: módulos por cotas, secciones por altura, diagrid de varios vanos, caras inclinadas y hormigón. */
import { describe, expect, it } from 'vitest';
import { armarCara, calcularExo, EXO_POR_DEFECTO, gammaExo, cargarCara, type ExoDef } from './exo';

const pisos = (n: number, h = 3) => Array.from({ length: n + 1 }, (_, i) => i * h);
const equilibrio = (r: ReturnType<typeof calcularExo>, W: number[]) => {
  r.Ftab.forEach((f, i) => expect(f + r.Fexo[i]).toBeCloseTo(W[i], 6));
  const Hcaras = r.caras.reduce((s, c) => s + c.reacciones.reduce((q, x) => q + x.H, 0), 0);
  expect(-Hcaras).toBeCloseTo(r.Vexo0, 4);
  r.u.forEach(x => expect(isFinite(x)).toBe(true));
};

describe('exoesqueleto · lo que piden los edificios reales', () => {
  it('módulos por cotas: los chevrones van donde dicen las cotas y arriba del último no hay ninguno', () => {
    // 2 pisos juntados abajo (el primer módulo tiene un nivel menos) y una corona de un nivel arriba
    const zs = [0, 10, 16, 18, 20, 22, 24, 26, 28, 30, 40];
    const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'E', modulo: 4, pesoPropio: false, cortes: [10, 20, 28, 30] };
    const c = armarCara(def, 18, zs);
    const zV = c.barras.filter(b => b.clase === 'viga').map(b => c.nudos[b.a].z);
    expect([...new Set(zV)].sort((a, b) => a - b)).toEqual([20, 28, 30]);
    const zD = c.barras.filter(b => b.clase === 'diagonal').map(b => Math.max(c.nudos[b.a].z, c.nudos[b.b].z));
    expect(Math.max(...zD)).toBe(30);
    const W = zs.slice(1).map(() => 5);
    equilibrio(calcularExo(def, zs, W, () => 3e6 * 30, 18, [-10, 10], 3e6), W);
  });

  it('secciones por tramos: el mástil se afina arriba de la cota pedida (también la mitad que va de ala)', () => {
    const zs = pisos(12);
    const fino = { b: 0.8, e: 0.04 }, grueso = { b: 1.6, e: 0.08 };
    const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'E', modulo: 4, pisoInicio: 0, mastil: grueso, tramos: [{ clase: 'mastil', desde: 18, sec: fino }, { clase: 'diagonal', desde: 24, sec: fino }] };
    const c = armarCara(def, 18, zs);
    const mast = c.barras.filter(b => b.clase === 'columna' && c.nudos[b.a].s === 0);
    mast.forEach(b => expect(b.sec).toEqual(Math.min(c.nudos[b.a].z, c.nudos[b.b].z) >= 18 ? fino : grueso));
    c.barras.filter(b => (b.fraccion ?? 1) < 1).forEach(b => expect(b.sec).toEqual(Math.min(c.nudos[b.a].z, c.nudos[b.b].z) >= 18 ? fino : grueso));
    c.barras.filter(b => b.clase === 'diagonal').forEach(b => expect(b.sec).toEqual(Math.min(c.nudos[b.a].z, c.nudos[b.b].z) >= 24 ? fino : def.diagonal));
  });

  it('diagrid de varios vanos: 3 rombos por cara y por módulo, en equilibrio, y más rígido que uno solo con las mismas barras', () => {
    const zs = pisos(16, 4), W = zs.slice(1).map(() => 6);
    const uno: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'A', modulo: 8, pesoPropio: false, diagonal: { b: 0.5, e: 0.03 } };
    const tres: ExoDef = { ...uno, vanos: 3 };
    const c1 = armarCara(uno, 36, zs), c3 = armarCara(tres, 36, zs);
    expect(c3.barras.filter(b => b.clase === 'diagonal').length).toBe(2 * (4 * 3 + 4));
    expect(c1.barras.filter(b => b.clase === 'diagonal').length).toBe(2 * (4 * 1 + 4));
    // los nudos de cada borde de módulo están en el centro de cada vano
    expect(c3.nudos.filter(q => q.piso === 8).map(q => q.s).sort((a, b) => a - b)).toEqual([-18, -12, 0, 12, 18]);
    const r1 = calcularExo(uno, zs, W, () => 3e6 * 40, 36, [-15, 15], 3e6), r3 = calcularExo(tres, zs, W, () => 3e6 * 40, 36, [-15, 15], 3e6);
    equilibrio(r3, W);
    expect(r3.fraccionExo).toBeGreaterThan(r1.fraccionExo);
  });

  it('caras de ancho variable: las esquinas siguen la planta de cada nivel y las columnas quedan inclinadas', () => {
    const zs = pisos(20, 4), W = zs.slice(1).map(() => 5);
    const anchos = zs.map(z => 50 - (20 * z) / 80);          // de 50 m abajo a 30 m arriba
    const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'D', modulo: 5, pesoPropio: false };
    const c = armarCara(def, 50, zs, 'cara', anchos);
    const esq = c.nudos.filter(q => q.piso >= 0 && Math.abs(q.s) > 1e-9).map(q => [q.z, Math.abs(q.s)]);
    esq.forEach(([z, s]) => expect(s).toBeCloseTo((50 - (20 * z) / 80) / 2, 9));
    // las cruces se cruzan en el eje y sus nudos de borde son de la planta de ese nivel
    const r = calcularExo(def, zs, W, () => 3e6 * 40, 50, [-20, 20], 3e6, anchos);
    equilibrio(r, W);
    // las columnas inclinadas también toman corte (por eso la forma del Hancock rinde): la cara toma una parte y la flecha baja
    expect(r.fraccionExo).toBeGreaterThan(0.3);
    expect(r.u[19]).toBeLessThan(r.uSin[19]);
  });

  it('hormigón: peso propio con 2,4 t/m³ en lugar de 7,85', () => {
    const zs = pisos(6);
    const ac: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'D', modulo: 3 }, ho: ExoDef = { ...ac, material: 'hormigon' };
    expect(gammaExo(ac)).toBe(7.85); expect(gammaExo(ho)).toBe(2.4);
    const q = (d: ExoDef) => { const c = cargarCara(armarCara(d, 10, zs), d, zs, zs.slice(1).map(() => 1)); const b = c.barras.find(x => x.clase === 'columna')!; return b.carga!.za / b.A; };
    expect(q(ac)).toBeCloseTo(-7.85, 9); expect(q(ho)).toBeCloseTo(-2.4, 9);
  });

  it('sin tabiques arriba (núcleo solo de gravedad): el exo toma todo y «sin exo» queda sin número', () => {
    const zs = pisos(10), W = zs.slice(1).map(() => 4);
    const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'D', modulo: 2, pesoPropio: false };
    const r = calcularExo(def, zs, W, z => (z < 6 ? 3e6 * 50 : 0), 18, [-10, 10], 3e6);
    r.u.forEach(x => expect(isFinite(x)).toBe(true));
    expect(r.uSin.every(x => Number.isNaN(x))).toBe(true);
    equilibrio(r, W);
  });
});
