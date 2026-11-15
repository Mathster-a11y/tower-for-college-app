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

import { vientoDeCuarto } from './exo';
describe('viento de cuarto', () => {
  it('torre cuadrada y simétrica: las esquinas toman 0,71·(A + B) = 1,41 veces lo de frente', () => {
    const zs = Array.from({ length: 13 }, (_, i) => i * 3), W = zs.slice(1).map(() => 5);
    const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'D', modulo: 4, pesoPropio: false };
    const r = calcularExo(def, zs, W, () => 3e6 * 20, 20, [-10, 10], 3e6);
    const f = vientoDeCuarto(r, r);
    expect(f.length).toBeGreaterThan(5);
    f.filter(x => x.NA > 1e-6).forEach(x => expect(x.razon).toBeCloseTo(Math.SQRT2, 9));
  });
});

import { cirsoc301, FY_F24, propsSeccion } from './exo';
describe('CIRSOC 301 (LRFD)', () => {
  it('columna corta en compresión pura: φc·Pn = 0,85·0,658^λc²·Fy·A y la interacción es Pu/φPn', () => {
    const zs = Array.from({ length: 9 }, (_, i) => i * 3), W = zs.slice(1).map(() => 2);
    const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'D', modulo: 4 };
    const v = cirsoc301(def, zs, W, () => 3e6 * 20, 18, [-10, 10], 3e6);
    expect(v.length).toBeGreaterThan(10);
    const c = v.find(x => x.clase === 'columna')!;
    const p = propsSeccion(def.columna), lc = (3 / (p.i * Math.PI)) * Math.sqrt(FY_F24 / def.E);
    expect(c.lambdaC).toBeCloseTo(lc, 9);
    expect(c.phiPc).toBeCloseTo(0.85 * 0.658 ** (lc ** 2) * FY_F24 * p.A, 6);
    expect(c.phiPt).toBeCloseTo(0.9 * FY_F24 * p.A, 6);
    v.forEach(x => { expect(x.ratio).toBeGreaterThanOrEqual(0); expect(isFinite(x.ratio)).toBe(true); });
  });
  it('1,2·D + 1,6·W: sin viento queda solo 1,2 del peso propio', () => {
    const zs = Array.from({ length: 7 }, (_, i) => i * 3);
    const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'D', modulo: 3 };
    const v0 = cirsoc301(def, zs, zs.slice(1).map(() => 0), () => 3e6 * 20, 18, [-10, 10], 3e6);
    const r = calcularExo({ ...def, pesoPropio: true }, zs, zs.slice(1).map(() => 0), () => 3e6 * 20, 18, [-10, 10], 3e6);
    const c = r.caras[0].esfuerzos.find(e => e.clase === 'columna')!;
    const x = v0.find(y => y.id === c.id && y.cara === r.caras[0].nombre)!;
    // la columna de abajo: compresión máxima (en el pie)
    expect(Math.abs(x.Pu)).toBeGreaterThanOrEqual(1.2 * Math.abs(c.N) - 1e-9);
  });
});

import { deformada, type PuntoAltura } from './diagramas';
describe('controles cruzados entre motores', () => {
  it('la flecha «sin exo» del motor del exo es la deformada de la etapa 05 (mismo E·J; trapecios contra vigas exactas)', () => {
    const n = 40, h = 2, zs = Array.from({ length: n + 1 }, (_, i) => i * h), W = zs.slice(1).map((_, i) => (i === n - 1 ? 1 : 2));
    const E = 2.5e6, J = 30;
    const r = calcularExo({ ...EXO_POR_DEFECTO, tipo: 'D', modulo: 4, pesoPropio: false }, zs, W, () => E * J, 18, [-10, 10], E);
    // momentos de la ménsula en cada nivel con las mismas fuerzas (como M,NyQ)
    const alt: PuntoAltura[] = zs.map((z, k) => {
      let M = 0; for (let i = k + 1; i <= n; i++) M += W[i - 1] * (zs[i] - z);
      return { nivel: String(k), z, pBarlo: 0, pSota: 0, F: k ? W[k - 1] : 0, V: 0, M };
    });
    const dfm = deformada(alt, W.reduce((a, b) => a + b, 0), E, J);
    expect(Math.abs(r.uSin[n - 1] / dfm.dTop - 1)).toBeLessThan(0.005);
  });
});

describe('ficha E como el Citicorp', () => {
  it('columnas a los cuartos, viga a medio módulo y esquina cortada: estable, en equilibrio y con la geometría del plano', () => {
    const zs = Array.from({ length: 25 }, (_, i) => i * 4), W = zs.slice(1).map(() => 6);
    const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'E', modulo: 8, pisoInicio: 0, pesoPropio: false, cuartos: true, esquinaCortada: true, mastil: { b: 2, e: 0.1 }, columna: { b: 1, e: 0.05 }, diagonal: { b: 0.8, e: 0.04 }, viga: { b: 0.9, e: 0.04 } };
    const c = armarCara(def, 48, zs);
    // en el tope de cada módulo (pisos 8, 16 y 24) no llega la columna de esquina
    const esq = c.barras.filter(b => b.clase === 'columna' && (b.fraccion ?? 1) === 1 && Math.abs(Math.abs(c.nudos[b.a].s) - 24) < 1e-6);
    [16, 24].forEach(k => expect(esq.some(b => c.nudos[b.b].piso === k)).toBe(false));
    expect(esq.some(b => c.nudos[b.b].piso === 8)).toBe(true);      // el primer módulo cuelga del nudo de arriba
    // columnas a los cuartos (s = ±12) desde el medio del primer módulo
    const cu = c.barras.filter(b => b.clase === 'columna' && Math.abs(Math.abs(c.nudos[b.a].s) - 12) < 1e-6);
    expect(cu.length).toBe(2 * (24 - 4));
    // la diagonal tiene nudo en el cuarto a medio módulo
    expect(c.barras.filter(b => b.clase === 'diagonal').length).toBe(3 * 4);
    const r = calcularExo(def, zs, W, () => 3e6 * 40, 48, [-24, 24], 3e6);
    r.Ftab.forEach((f, i) => expect(f + r.Fexo[i]).toBeCloseTo(W[i], 6));
    r.u.forEach(x => expect(isFinite(x)).toBe(true));
  });
});
