import { describe, expect, it } from 'vitest';
import { Evaluador, type Libro } from './formulas';

const libro = (h: Record<string, Record<string, string | number | null>>): Libro =>
  new Map(Object.entries(h).map(([n, cs]) => [n, new Map(Object.entries(cs).map(([r, v]) => [r, typeof v === 'string' && v.startsWith('=') ? { f: v.slice(1) } : { v }]))]));

describe('evaluador de fórmulas (vista previa de la planilla)', () => {
  it('cuentas, precedencia como Excel, referencias entre hojas y rangos', () => {
    const e = new Evaluador(libro({
      viento: { A1: 2, A2: 3, A3: '=A1+A2*2^2', A4: '=-A1^2', A5: "='Rototrasl. cara mayor'!B2/2", A6: '=SUM(A1:A2,10)', A7: '=MAX(B1:B3)', B1: 'texto', B2: 7, A8: '=2.01*POWER(A2/A1,2/7)' },
      'Rototrasl. cara mayor': { B2: '=viento!A2*4' },
    }));
    expect(e.celda('viento', 'A3')).toBe(14);
    expect(e.celda('viento', 'A4')).toBe(4);                     // el signo antes que ^
    expect(e.celda('viento', 'A5')).toBe(6);
    expect(e.celda('viento', 'A6')).toBe(15);
    expect(e.celda('viento', 'A7')).toBe(7);                     // el texto del rango no cuenta
    expect(e.celda('viento', 'A8')).toBeCloseTo(2.01 * Math.pow(1.5, 2 / 7), 12);
  });
  it('IF, vacíos y errores de Excel', () => {
    const e = new Evaluador(libro({ h: { A1: 0, A2: '=IF(A1=0,0,5)', A3: '=IF(Z9=0,"vacío","no")', A4: '=1/A1', A5: '=POWER(-2,0.5)', A6: '=A4+1', A7: '=SUM(A4:A5)', A8: '=PI()*POWER(A9/2,2)', A9: 2, A10: '=FOO(1)', A11: '=A12', A12: '=A11' } }));
    expect(e.celda('h', 'A2')).toBe(0);
    expect(e.celda('h', 'A3')).toBe('vacío');
    expect(e.celda('h', 'A4')).toEqual({ error: '#DIV/0!' });
    expect(e.celda('h', 'A5')).toEqual({ error: '#NUM!' });
    expect(e.celda('h', 'A6')).toEqual({ error: '#DIV/0!' });
    expect(e.celda('h', 'A7')).toEqual({ error: '#DIV/0!' });
    expect(e.celda('h', 'A8')).toBeCloseTo(Math.PI, 12);
    expect(e.celda('h', 'A10')).toEqual({ error: '#NAME?' });
    expect(e.celda('h', 'A11')).toEqual({ error: '#CICLO' });
  });
});

describe('evaluador: detalles de Excel', () => {
  it('referencia a un libro externo (copia vacía) da 0 y =celda vacía muestra 0', () => {
    const e = new Evaluador(libro({ h: { A1: '=[1]viento!S56', A2: "='[1]viento'!S56+1", A3: '=Z99' } }));
    expect(e.celda('h', 'A1')).toBe(0);
    expect(e.celda('h', 'A2')).toBe(1);
    expect(e.celda('h', 'A3')).toBe(0);
  });
});
