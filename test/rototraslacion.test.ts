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
