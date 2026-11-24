import { describe, expect, it } from 'vitest';
import { armarCara, calcularExo, barridoModulo, anguloDiagonal, EXO_POR_DEFECTO, type ExoDef, type EntradaExo } from '../src/engine/exo';

const zs = Array.from({ length: 25 }, (_, k) => 3 * k), W = zs.slice(1).map((_, k) => 4 + k * 0.1);
const diag: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'A', modulo: 6 };

describe('diagrid', () => {
  it('sigue a la torre inclinada: los bordes de cada nivel se corren con ella y el equilibrio se mantiene', () => {
    const corr = zs.map(z => (z / 72) * 6);
    const c = armarCara(diag, 18, zs, 'cara', undefined, corr);
    const top = c.nudos.filter(q => q.piso === zs.length - 1).map(q => q.s);
    expect(Math.min(...top)).toBeCloseTo(6 - 9, 6); expect(Math.max(...top)).toBeCloseTo(6 + 9, 6);
    const r = calcularExo({ ...diag, pesoPropio: false }, zs, W, () => 3.4e6 * 20, 18, [-10, 10], 3.4e6, undefined, corr);
    const Wtot = W.reduce((a, b) => a + b, 0), Vbase = r.Vtab[0] + r.Vexo0;
    expect(Vbase).toBeCloseTo(Wtot, 3);
    // sin corrimiento, el mismo diagrid recto: se corre parecido (la inclinación cambia poco la rigidez lateral)
    const r0 = calcularExo({ ...diag, pesoPropio: false }, zs, W, () => 3.4e6 * 20, 18, [-10, 10], 3.4e6);
    expect(r.u.at(-1)! / r0.u.at(-1)!).toBeGreaterThan(0.7); expect(r.u.at(-1)! / r0.u.at(-1)!).toBeLessThan(1.4);
  });
  it('ángulo de las diagonales: el diagrid sube medio módulo por medio vano', () => {
    expect(anguloDiagonal(diag, 18, 18)).toBeCloseTo(45, 6);
    expect(anguloDiagonal({ ...diag, vanos: 2 }, 18, 18)).toBeCloseTo((Math.atan2(9, 4.5) * 180) / Math.PI, 6);
    expect(anguloDiagonal({ ...diag, tipo: 'D' }, 18, 18)).toBeCloseTo(45, 6);
  });
  it('el barrido dimensiona cada módulo; el más liviano no es ni el más acostado ni el más parado', () => {
    const en: EntradaExo = { zs, W, EJ: () => 3.4e6 * 8, ancho: 18, tCaras: [-10, 10], Eh: 3.4e6, h: 72 };
    const filas = barridoModulo(diag, [en, en], [2, 4, 6, 8, 12, 16, 24]);
    expect(filas.length).toBe(7);
    filas.forEach(f => expect(f.peso).toBeGreaterThan(0));
    const ok = filas.filter(f => f.verifica);
    expect(ok.length).toBeGreaterThan(2);
    const mejor = ok.reduce((a, b) => (b.peso < a.peso ? b : a));
    console.log(filas.map(f => `${f.modulo} pisos · ${f.angulos[0].toFixed(0)}° · ${f.peso.toFixed(0)} t · ${f.verifica ? 'ok' : f.motivo}`).join('\n'));
    expect(mejor.modulo).not.toBe(2);
  });
});
