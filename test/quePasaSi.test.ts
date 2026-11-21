/**
 * «¿Qué pasa si…?»: el proyecto con un muro cambiado, calculado con el mismo método, sin tocar el original.
 */
import { describe, expect, it } from 'vitest';
import { ejemploGuia, type Proyecto } from '../src/engine/modelo';
import { calcularProyecto } from '../src/ui/estado';
import { aplicarCambio, medirEscenario, sentido } from '../src/engine/quePasaSi';

const con = (metodo: 'guia' | 'cirsoc'): Proyecto => ({ ...ejemploGuia(), calculo: metodo === 'guia' ? { metodo, version: 'actual', armado: 'app' } : { metodo, verificacion: 'simple' } });

describe('qué pasa si…', () => {
  it('la copia cambia solo ese muro y no toca el proyecto', () => {
    const p = con('guia'), q = aplicarCambio(p, 'M1', { largo: 6, dx: 0.5 });
    expect(p.muros.find(m => m.id === 'M1')!.largo).toBe(4.5);
    const m = q.muros.find(x => x.id === 'M1')!, m0 = p.muros.find(x => x.id === 'M1')!;
    expect(m.largo).toBe(6); expect(m.x).toBeCloseTo(m0.x + 0.5, 9); expect(m.y).toBe(m0.y);
    expect(q.muros.filter(x => x.id !== 'M1')).toEqual(p.muros.filter(x => x.id !== 'M1'));
  });

  it.each(['guia', 'cirsoc'] as const)('%s: alargar M1 sube la rigidez y la parte de T1; las medidas tienen sentido', metodo => {
    const p = con(metodo), c0 = calcularProyecto(p), c1 = calcularProyecto(aplicarCambio(p, 'M1', { largo: 6 }));
    const ms = medirEscenario(p, c0, c1, 'M1');
    const J = ms.find(x => x.nombre.startsWith('ΣJ'))!, parte = ms.find(x => x.nombre.startsWith('Parte'))!;
    expect(J.ahora!).toBeGreaterThan(J.antes!); expect(sentido(J)).toBe('mejor');
    expect(parte.nombre).toMatch(/T1/);
    expect(parte.ahora!).toBeGreaterThan(parte.antes!);
    // T1 y T2 son simétricos: alargar uno solo corre el eje de rigidez (la excentricidad crece)
    const e = ms.find(x => x.nombre.startsWith('Eje'))!;
    expect(Math.abs(e.ahora!)).toBeGreaterThan(Math.abs(e.antes!)); expect(sentido(e)).toBe('peor');
    const d = ms.find(x => /azotea/.test(x.nombre))!;
    expect(d.ahora!).toBeLessThan(d.antes!);                                  // más rígida: se mueve menos
    expect(ms.at(-1)!.nombre).toMatch(/no verifican/);
  });

  it('sin cambios, todo queda igual', () => {
    const p = con('guia'), c0 = calcularProyecto(p);
    medirEscenario(p, c0, calcularProyecto(aplicarCambio(p, 'M1', {})), 'M1').forEach(x => expect(sentido(x)).toBe('igual'));
  });
});
