import { describe, expect, it } from 'vitest';
import { esquinasSalientes, sustraerEsquina, tratarEsquinas, areaConSigno } from '../src/engine/contorno';
import { esquinasEnNiveles, psiRedondeo } from '../src/engine/esquinas';
import { areaSilueta, cajaSilueta, rectangulo } from '../src/engine/silueta';
import type { Proyecto } from '../src/engine/modelo';

const cuadro = rectangulo(20, 16);

describe('esquinas de la torre', () => {
  it('encuentra las cuatro esquinas salientes de un rectángulo y ninguna entrante', () => {
    expect(esquinasSalientes(cuadro)).toEqual([0, 1, 2, 3]);
    const enL = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 }];
    expect(esquinasSalientes(enL)).toEqual([0, 1, 2, 4, 5]);   // el 3 es entrante
  });
  it('redondeadas: área = B·L − (4 − π)·r² y la caja no cambia', () => {
    const r = tratarEsquinas(cuadro, 'redondeada', 3);
    if ('error' in r) throw new Error(r.error);
    expect(r.length).toBe(8);
    expect(areaSilueta(r)).toBeCloseTo(320 - (4 - Math.PI) * 9, 2);
    expect(cajaSilueta(r).B).toBeCloseTo(20, 6);
  });
  it('chaflán: área = B·L − 4·d²/2', () => {
    const r = tratarEsquinas(cuadro, 'chaflan', 2);
    if ('error' in r) throw new Error(r.error);
    expect(r.length).toBe(8);
    expect(Math.abs(areaConSigno(r))).toBeCloseTo(320 - 8, 6);
  });
  it('sustraídas: área = B·L − 4·a·b, con doce vértices', () => {
    const r = tratarEsquinas(cuadro, 'sustraida', 2, 3);
    if ('error' in r) throw new Error(r.error);
    expect(r.length).toBe(12);
    expect(Math.abs(areaConSigno(r))).toBeCloseTo(320 - 24, 6);
    expect(esquinasSalientes(r).length).toBe(8);
  });
  it('avisa si la medida no entra', () => {
    expect('error' in tratarEsquinas(cuadro, 'redondeada', 9)).toBe(true);
    expect('error' in sustraerEsquina(cuadro, 0, 25)).toBe(true);
  });
  it('todos los niveles: el que hereda el mismo contorno no recibe uno propio', () => {
    const p = { niveles: [
      { nombre: 'N3', cota: 30, B: 20, L: 16, silueta: null, carpinteria: null },
      { nombre: 'N2', cota: 20, B: null, L: null, silueta: null, carpinteria: null },
      { nombre: 'N1', cota: 10, B: 24, L: 16, silueta: null, carpinteria: null },
      { nombre: 'PB', cota: 0, B: null, L: null, silueta: null, carpinteria: null },
    ] } as unknown as Proyecto;
    const { cambios, avisos } = esquinasEnNiveles(p, { tipo: 'chaflan', a: 2, que: 'ambas', niveles: [0, 1, 2, 3] });
    expect(cambios.map(c => `${c.i}${c.que}`)).toEqual(['0losa', '2losa']);
    expect(avisos).toEqual([]);   // «ambas» sin carpintería en ningún nivel: no hace falta avisar
  });
  it('ψr del Eurocódigo como referencia', () => {
    expect(psiRedondeo(0, 20)).toBe(1);
    expect(psiRedondeo(2, 20)).toBeCloseTo(0.75, 9);
    expect(psiRedondeo(6, 20)).toBe(0.5);
  });
});
