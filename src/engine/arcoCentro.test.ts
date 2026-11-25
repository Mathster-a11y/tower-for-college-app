import { describe, expect, it } from 'vitest';
import { arcoComplementario, arcoConCentro, arcoConRadioMismoLado, geometriaArco, invertirArco } from './contorno';
import { polilinea } from './perfil';

// cuadrado de 10 m con el lado de abajo (de (−5,−5) a (5,−5)) como arco
const base = (b: number) => [{ x: -5, y: -5, b }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }];
const enArco = (vs: ReturnType<typeof base>, cx: number, cy: number, r: number) => polilinea([vs[0], vs[1]], 3, 24).forEach(q => expect(Math.hypot(q.x - cx, q.y - cy)).toBeCloseTo(r, 6));

describe('arco: centro y radio con los extremos fijos', () => {
  it('geometría: semicírculo de cuerda 10 → radio 5, centro en el medio de la cuerda', () => {
    const g = geometriaArco(base(1), 0)!;
    expect(g.r).toBeCloseTo(5, 9); expect(g.cx).toBeCloseTo(0, 9); expect(g.cy).toBeCloseTo(-5, 9);
    expect(g.flecha).toBeCloseTo(5, 9);
  });
  it('mover el centro sobre la mediatriz: los extremos quedan y todos los puntos del arco están a r del centro', () => {
    for (const b0 of [0.3, -0.3]) for (const d of [-8, -2, 0, 3, 12]) {
      const vs = arcoConCentro(base(b0), 0, d);
      expect([vs[0].x, vs[0].y, vs[1].x, vs[1].y]).toEqual([-5, -5, 5, -5]);
      const g = geometriaArco(vs, 0)!;
      expect(g.d).toBeCloseTo(d, 6);
      expect(g.r).toBeCloseTo(Math.hypot(5, d), 6);
      expect(Math.sign(vs[0].b!)).toBe(Math.sign(b0));              // la panza sigue del mismo lado
      enArco(vs, g.cx, g.cy, g.r);
    }
  });
  it('cambiar el radio no cambia si el arco es menor o mayor, ni los extremos', () => {
    const menor = arcoConRadioMismoLado(base(0.3), 0, 8) as ReturnType<typeof base>;
    expect(geometriaArco(menor, 0)!.r).toBeCloseTo(8, 9);
    expect(geometriaArco(menor, 0)!.mayor).toBe(false);
    const mayor = arcoConRadioMismoLado(arcoComplementario(base(0.3), 0), 0, 8) as ReturnType<typeof base>;
    expect(geometriaArco(mayor, 0)!.mayor).toBe(true);
    expect(geometriaArco(mayor, 0)!.r).toBeCloseTo(8, 9);
    expect(arcoConRadioMismoLado(base(0.3), 0, 4)).toHaveProperty('error');
  });
  it('invertir: la panza del otro lado, mismo radio', () => {
    const a = geometriaArco(base(0.3), 0)!, b = geometriaArco(invertirArco(base(0.3), 0), 0)!;
    expect(b.r).toBeCloseTo(a.r, 9); expect(b.cy).toBeCloseTo(-5 - (a.cy + 5), 9);
  });
});
