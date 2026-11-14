import { describe, expect, it } from 'vitest';
import { geometriaArcoMomento } from './comp';

const pts = (s: string) => s.trim().split(/\s+/).map(q => q.split(',').map(Number));
describe('flecha curva de momento', () => {
  it('la punta termina en el extremo del arco y apunta en el sentido del giro', () => {
    for (const [a0, a1] of [[Math.PI * 0.95, Math.PI * 0.45], [Math.PI * 0.5, Math.PI * 0.92], [0, 1.5 * Math.PI], [1.5 * Math.PI, 0]]) {
      const g = geometriaArcoMomento(100, 100, 40, a0, a1, 3);
      const [tip, b1, b2] = pts(g.punta);
      // la punta está sobre la circunferencia, en el ángulo final
      expect(Math.hypot(tip[0] - 100, tip[1] - 100)).toBeCloseTo(40, 0);
      expect(tip[0]).toBeCloseTo(100 + 40 * Math.cos(a1), 0); expect(tip[1]).toBeCloseTo(100 - 40 * Math.sin(a1), 0);
      // la base también sobre la circunferencia (su punto medio), detrás de la punta en el sentido del giro
      const m = [(b1[0] + b2[0]) / 2, (b1[1] + b2[1]) / 2];
      expect(Math.hypot(m[0] - 100, m[1] - 100)).toBeCloseTo(40, 0);
      const angM = Math.atan2(-(m[1] - 100), m[0] - 100), angT = Math.atan2(-(tip[1] - 100), tip[0] - 100);
      const d = ((angT - angM + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      expect(Math.sign(d)).toBe(Math.sign(a1 - a0));
      // el arco arranca en a0
      const d0 = g.d;
      const [x0, y0] = d0.slice(1).split(' ')[0].split(',').map(Number);
      expect(x0).toBeCloseTo(100 + 40 * Math.cos(a0), 0); expect(y0).toBeCloseTo(100 - 40 * Math.sin(a0), 0);
    }
  });
});
