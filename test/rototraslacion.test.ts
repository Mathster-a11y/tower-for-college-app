/** La rototraslación de la guía (Anexo): T5 aislado de 4,00 × 0,20 m. */
import { describe, expect, it } from 'vitest';
import { repartoGuia } from '../src/engine/diagramas';

const paralelos = [
  { nombre: 'T1', J: 1.52, pos: -10 }, { nombre: 'T3', J: 1.52, pos: -10 },
  { nombre: 'T2', J: 1.52, pos: 10 }, { nombre: 'T4', J: 1.52, pos: 10 },
  { nombre: 'T5', J: 1.06, pos: -6 }, { nombre: 'T6', J: 8.003, pos: 4.14 },
];
const perpendiculares = [{ nombre: 'ala sup. T6', J: 2.083, pos: 1.9 }, { nombre: 'ala inf. T6', J: 2.083, pos: -1.9 }];

describe('rototraslación como la guía (Anexo)', () => {
  it('con la e = 0,37 m de la guía se obtienen sus porcentajes', () => {
    const r = repartoGuia(paralelos, perpendiculares, 1000, { e: 0.37 });
    const pc = (n: string) => r.elementos.find(x => x.nombre === n)!.total / 10;
    expect(r.SJ).toBeCloseTo(15.15, 1);                 // guía: 15,15 m⁴
    expect(r.SJa2).toBeCloseTo(780.59, -1);              // guía: 780,59 m⁶ (con sus distancias redondeadas)
    expect(pc('T1')).toBeCloseTo(10.77, 1);
    expect(pc('T2')).toBeCloseTo(9.34, 1);
    expect(pc('T5')).toBeCloseTo(7.32, 1);
    expect(pc('T6')).toBeCloseTo(51.37, 1);
    expect(Math.abs(r.elementos.find(x => x.nombre === 'ala sup. T6')!.total)).toBeCloseTo(1.87, 1);   // 1,87 kg de 1000
    // con esa e, la rotación no se anula entre los tabiques: entre todos toman 990 de 1000
    expect(r.elementos.reduce((s, x) => s + (x.perpendicular ? 0 : x.total), 0)).toBeCloseTo(989.97, 1);
  });
  it('pero con las posiciones que da la misma guía, el eje de inercia está a 1,77 m (no a 0,37 m)', () => {
    const r = repartoGuia(paralelos, perpendiculares, 1000);
    expect(r.Xr).toBeCloseTo(1.767, 2);
    expect(r.e).toBeCloseTo(1.767, 2);
    // con el eje de inercia verdadero la rotación sí se anula: el total vuelve a ser 1000
    expect(r.elementos.reduce((s, x) => s + (x.perpendicular ? 0 : x.total), 0)).toBeCloseTo(1000, 6);
    const pc = (n: string) => r.elementos.find(x => x.nombre === n)!.total / 10;
    expect(pc('T1')).toBeCloseTo(14.25, 1);  // en lugar de 10,77 %
    expect(pc('T6')).toBeCloseTo(48.38, 1);  // en lugar de 51,37 %
  });
});

import { ejemploGuia, ejemploAsimetrico } from '../src/engine/modelo';
import { aPlanilla } from '../src/engine/mapping';
import { calcularCorregido } from '../src/engine/correcciones';

describe('rototraslación «Guía/CIRSOC» en la app: perpendiculares muro por muro', () => {
  const corr = (p: ReturnType<typeof ejemploGuia>) => {
    const a = aPlanilla(p);
    const iPB = p.niveles.findIndex(n => n.nombre === 'PB');
    return { a, c: calcularCorregido(a.datos, a.filaNivel[iPB], { proyecto: p, piezas: a.piezas }) };
  };
  it('Anexo (T5 aislado): equilibrio de la rotación y las alas de T6 como en la guía', () => {
    const { c } = corr(ejemploAsimetrico());
    const r = c.rotoA!;
    expect(r.e).toBeGreaterThan(1.5);                                         // el eje de inercia se corre hacia T6
    const todos = [...r.paralelos, ...r.perpendiculares];
    expect(todos.reduce((s, x) => s + x.rot * x.a, 0)).toBeCloseTo(-r.Mt, 6); // Σ Fj·aj = −Mt
    expect(r.paralelos.reduce((s, x) => s + x.tras + x.rot, 0)).toBeCloseTo(r.Q, 6);   // los paralelos toman todo W
    const alas = r.perpendiculares.filter(x => x.nombre === 'M9' || x.nombre === 'M10');
    expect(alas.map(x => x.J)).toEqual([0.2 * 5 ** 3 / 12, 0.2 * 5 ** 3 / 12].map(v => expect.closeTo(v, 9)));
    expect(alas.map(x => Math.abs(x.a))).toEqual([1.9, 1.9].map(v => expect.closeTo(v, 9)));
    // los de la izquierda del eje de inercia suman (+); los de la derecha restan (−)
    r.paralelos.forEach(x => expect(Math.sign(x.rot)).toBe(x.pos < r.Xr ? 1 : -1));
    // y el momento de cada pieza en PB la usa
    const t1 = r.paralelos.find(x => x.nombre === 'T1')!;
    expect(c.rotA[t1.fila!].Qrot).toBeCloseTo(t1.rot, 9);
  });
  it('planta simétrica: no hay rotación', () => {
    const { c } = corr(ejemploGuia());
    [...c.rotoA!.paralelos, ...c.rotoA!.perpendiculares].forEach(x => expect(Math.abs(x.rot)).toBeLessThan(1e-9));
  });
});
