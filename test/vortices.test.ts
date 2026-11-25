import { describe, expect, it } from 'vitest';
import { criterioQ, umbralQ, isosuperficie } from '../src/viento/vortices';

describe('vórtices (criterio Q)', () => {
  it('un giro rígido tiene Q > 0 y un estiramiento puro Q < 0', () => {
    const n = 8, N = n * n * n, sol = new Uint8Array(N);
    const giro = new Float32Array(4 * N), estira = new Float32Array(4 * N);
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const c = (z * n + y) * n + x;
      giro[4 * c] = -(y - 4) * 0.01; giro[4 * c + 1] = (x - 4) * 0.01;          // gira alrededor de z
      estira[4 * c] = (x - 4) * 0.01; estira[4 * c + 1] = -(y - 4) * 0.01;      // estira en x, aprieta en y
    }
    const c = (4 * n + 4) * n + 4;
    expect(criterioQ(giro, n, n, n, sol)[c]).toBeCloseTo(0.5 * (2 * 0.01 ** 2), 9);
    expect(criterioQ(estira, n, n, n, sol)[c]).toBeLessThan(0);
  });
  it('la isosuperficie de una esfera queda a su radio', () => {
    const n = 24, f = new Float32Array(n * n * n), r = 7, cx = 11.5;
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) f[(z * n + y) * n + x] = r - Math.hypot(x - cx, y - cx, z - cx);
    const t = isosuperficie(f, n, n, n, 0);
    expect(t.length % 9).toBe(0);
    expect(t.length / 9).toBeGreaterThan(500);
    for (let i = 0; i < t.length; i += 3) expect(Math.abs(Math.hypot(t[i] - cx, t[i + 1] - cx, t[i + 2] - cx) - r)).toBeLessThan(0.1);
    expect(umbralQ(new Float32Array([0, 1, 2, 3, -1, 5]), 0.5)).toBeGreaterThan(0);
  });
});
