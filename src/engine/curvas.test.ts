import { describe, expect, it } from 'vitest';
import { circuloFino, discretizarCurva, tramosArco } from './curvas';
import { polilinea } from './perfil';

const flecha = (pts: { x: number; y: number }[], cx: number, cy: number, r: number) => {
  // el mayor apartamiento entre una cuerda y el círculo: r − distancia del centro al medio de la cuerda
  let m = 0; pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length]; m = Math.max(m, r - Math.hypot((a.x + b.x) / 2 - cx, (a.y + b.y) / 2 - cy)); }); return m;
};
describe('curvas para dibujar con error máximo', () => {
  const r = 28, b = Math.tan(Math.PI / 8);
  const circ = [{ x: r, y: 0, b }, { x: 0, y: r, b }, { x: -r, y: 0, b }, { x: 0, y: -r, b }];
  it('un círculo de 28 m no se aparta más de 5 mm (con 10° se apartaba 11 cm)', () => {
    const p = discretizarCurva(circ, 0.005);
    expect(flecha(p, 0, 0, r)).toBeLessThanOrEqual(0.005 + 1e-9);
    expect(flecha(polilinea(circ, 10, 24), 0, 0, r)).toBeGreaterThan(0.1);
    p.forEach(q => expect(Math.hypot(q.x, q.y)).toBeCloseTo(r, 9));
  });
  it('uno chico lleva pocos puntos; uno grande, más', () => {
    expect(tramosArco(0.3, 2 * Math.PI)).toBeLessThan(tramosArco(28, 2 * Math.PI));
    expect(circuloFino(0, 0, 0.3).length).toBe(24);
  });
  it('las rectas quedan como están y una Bézier pasa por sus extremos', () => {
    const cuadrado = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect(discretizarCurva(cuadrado)).toEqual(cuadrado);
    const bz = discretizarCurva([{ x: 0, y: 0, c1: { x: 0, y: 10 }, c2: { x: 10, y: 10 } }, { x: 10, y: 0 }], 0.005, false);
    expect(bz[0]).toEqual({ x: 0, y: 0 }); expect(bz[bz.length - 1]).toEqual({ x: 10, y: 0 });
    expect(bz.length).toBeGreaterThan(20);
  });
});
