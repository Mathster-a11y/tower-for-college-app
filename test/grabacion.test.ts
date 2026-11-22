import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { abrirGrabacion, achicarSolido, cuadroDe, empaquetar, Grabadora } from '../src/viento/grabacion';

describe('grabación del túnel 2D (.torreviento)', () => {
  it('graba, empaqueta, abre y devuelve los mismos campos (con la cuantización de 8 bits)', async () => {
    const nx = 40, ny = 20, N = nx * ny, sol = new Uint8Array(N);
    for (let y = 8; y < 12; y++) for (let x = 10; x < 14; x++) sol[y * nx + x] = 1;
    const g = new Grabadora(nx, ny, sol, 2, 0.2, 0.05, 4);
    const campos = (k: number) => ({ ux: Float32Array.from({ length: N }, (_, c) => 0.1 * Math.sin(c / 7 + k)), uy: Float32Array.from({ length: N }, (_, c) => 0.02 * Math.cos(c / 5 + k)), rho: Float32Array.from({ length: N }, (_, c) => 1 + 0.01 * Math.sin(c / 9 + k)) });
    for (let k = 0; k < 10; k++) { const c = campos(k); g.agregar(100 * k, c.ux, c.uy, c.rho, [k], [-k]); }
    // con máximo 4 cuadros: se fue quedando con uno de cada dos
    expect(g.cuadros.length).toBeLessThanOrEqual(5);
    expect(g.Fx.length).toBe(10);
    const blob = await empaquetar(JSZip, g, { titulo: 'prueba', nivel: '10º', cota: 31, dir: 'A', config: { re: 'medio' }, D: 10, anchoM: 20, escala: 0.5, contornos: [[{ x: 5, y: 4 }, { x: 7, y: 4 }, { x: 7, y: 6 }, { x: 5, y: 6 }]], caja: { x0: 5, x1: 6, y0: 4, y1: 5 }, u0: 0.1, med: null });
    const ab = await abrirGrabacion(JSZip, await blob.arrayBuffer());
    expect(ab.meta.nx).toBe(20); expect(ab.meta.ny).toBe(10);
    expect(ab.solido).toEqual(achicarSolido(nx, ny, 2, sol));
    expect(Array.from(ab.Fx)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const c0 = cuadroDe(ab, 0);
    expect(Math.max(...Array.from(c0.ux).map(Math.abs))).toBeLessThan(0.2 + 1e-6);
    expect(c0.rho.every(r => r > 0.95 && r < 1.05)).toBe(true);
  });
  it('rechaza un archivo que no es una grabación', async () => {
    const z = new JSZip(); z.file('hola.txt', 'x');
    await expect(abrirGrabacion(JSZip, await z.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow(/no es una grabación/);
  });
});
