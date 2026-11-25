import { describe, expect, it } from 'vitest';
import { armarCara, calcularExo, EXO_POR_DEFECTO, pesoExo, zonasDe, type ExoDef, type TipoExo } from './exo';

const pisos = (n: number, h = 3) => Array.from({ length: n + 1 }, (_, i) => i * h);
const zs = pisos(30), W = zs.slice(1).map((_z, i) => 4 + i * 0.1);
const calc = (def: ExoDef) => calcularExo({ ...def, pesoPropio: false }, zs, W, () => 3.4e6 * 20, 18, [-10, 10], 3.4e6);

describe('exoesqueleto por zonas en altura', () => {
  it('sin zonas es la ficha de siempre (misma cara, barra por barra)', () => {
    const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'D' };
    const a = armarCara(def, 18, zs), b = armarCara({ ...def, zonas: [{ desde: 0, tipo: 'D' }] }, 18, zs);
    expect(b.barras.map(x => x.id)).toEqual(a.barras.map(x => x.id));
  });
  it('las zonas toman el nivel más cercano a su cota, la primera arranca en PB', () => {
    const z = zonasDe({ ...EXO_POR_DEFECTO, zonas: [{ desde: 31, tipo: 'A', modulo: 6 }, { desde: 5, tipo: 'D' }] }, zs);
    expect(z.map(x => [x.tipo, x.kI, x.kF, x.modulo])).toEqual([['D', 0, 10, 4], ['A', 10, 30, 6]]);
  });
  const combos: TipoExo[][] = [['D', 'A'], ['B', 'D'], ['D', 'E'], ['C', 'B'], ['A', 'D', 'A'], ['E', 'D']];
  for (const tipos of combos) {
    it(`${tipos.join(' abajo, ')} arriba: equilibrio piso por piso y la cara no es un mecanismo`, () => {
      const zonas = tipos.map((tipo, i) => ({ desde: (i * 90) / tipos.length, tipo }));
      const r = calc({ ...EXO_POR_DEFECTO, zonas });
      r.Ftab.forEach((f, i) => expect(f + r.Fexo[i]).toBeCloseTo(W[i], 5));
      r.u.forEach(u => expect(isFinite(u)).toBe(true));
      // el exo ayuda: la azotea se corre menos que sin exo
      expect(r.u[r.u.length - 1]).toBeLessThan(r.uSin[r.uSin.length - 1]);
      expect(Math.max(...r.caras[0].esfuerzos.map(e => Math.abs(e.N)))).toBeLessThan(1e5);
    });
  }
  it('entre zonas hay una viga de transición y el peso cuenta las dos zonas', () => {
    const def: ExoDef = { ...EXO_POR_DEFECTO, zonas: [{ desde: 0, tipo: 'D' }, { desde: 45, tipo: 'A', modulo: 6 }] };
    const c = armarCara(def, 18, zs);
    const k = 15;
    expect(c.barras.some(b => b.clase === 'viga' && c.nudos[b.a].piso === k && c.nudos[b.b].piso === k)).toBe(true);
    const en = { zs, W, EJ: () => 1, ancho: 18, tCaras: [-10, 10], Eh: 1, h: 90 };
    expect(pesoExo(def, [en])).toBeGreaterThan(0);
  });
  it('una barra agregada en fracción del ancho cae en el mismo lugar en caras de distinto ancho', () => {
    const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'D', nuevas: [{ clase: 'viga', a: [-1, 15], b: [1, 15], enFraccion: true }] };
    for (const ancho of [18, 22]) {
      const c = armarCara(def, ancho, zs), n = c.barras.find(b => b.id === 'N1')!;
      expect([c.nudos[n.a].s, c.nudos[n.b].s]).toEqual([-ancho / 2, ancho / 2]);
      expect(() => calcularExo({ ...def, pesoPropio: false }, zs, W, () => 3.4e6 * 20, ancho, [-10, 10], 3.4e6)).not.toThrow();
    }
  });
  it('libre: vacía, todo a los tabiques; armada barra por barra (columnas, vigas y diagonales) toma viento', () => {
    const vacia = calc({ ...EXO_POR_DEFECTO, tipo: 'L' });
    expect(vacia.fraccionExo).toBeCloseTo(0, 6);
    const nuevas: NonNullable<ExoDef['nuevas']> = [];
    zs.slice(0, -1).forEach((z, k) => {
      [-1, 1].forEach(s => nuevas.push({ clase: 'columna', a: [s, z], b: [s, zs[k + 1]], enFraccion: true }));
      nuevas.push({ clase: 'viga', a: [-1, zs[k + 1]], b: [1, zs[k + 1]], enFraccion: true });
      nuevas.push({ clase: 'diagonal', a: [-1, z], b: [1, zs[k + 1]], enFraccion: true });
    });
    const r = calc({ ...EXO_POR_DEFECTO, tipo: 'L', nuevas });
    expect(r.fraccionExo).toBeGreaterThan(0.1);
    r.Ftab.forEach((f, i) => expect(f + r.Fexo[i]).toBeCloseTo(W[i], 5));
  });
  it('una barra dibujada en una fracción redondeada se pega al nudo de la ficha que está ahí', () => {
    // diagrid de 3 vanos: nudos en s = ±3 a media altura del módulo (z = 6); −3/9 redondeado a 6 decimales
    const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'A', modulo: 4, vanos: 3, nuevas: [{ clase: 'viga', a: [-0.333333, 6], b: [0.333333, 6], enFraccion: true }] };
    const c = armarCara(def, 18, zs), n = c.barras.find(b => b.id === 'N1')!;
    expect(c.nudos[n.a].s).toBe(-3);
    expect(c.barras.filter(b => b.a === n.a || b.b === n.a).length).toBeGreaterThan(1);
  });
});
