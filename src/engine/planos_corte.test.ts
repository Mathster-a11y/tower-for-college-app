import { describe, expect, it } from 'vitest';
import { aplicarPlanosCorte, anguloPlano, recortarContorno, semiplano, type PlanoCorte } from './planos_corte';
import { ejemploGuia } from './modelo';
import { areaSilueta, cajaSilueta, rectangulo } from './silueta';

// corona a 45°: la recta sube de (−10, 40) a (10, 60); se saca lo de arriba (a la izquierda arriba)
const pc: PlanoCorte = { id: 'P1', eje: 'x', a: { w: -10, z: 40 }, b: { w: 10, z: 60 } };

describe('planos de corte', () => {
  it('a cada altura el semiplano que queda', () => {
    expect(anguloPlano(pc)).toBeCloseTo(45, 9);
    expect(semiplano(pc, 50)).toEqual({ w0: 0, s: 1 });               // a 50 m queda x ≥ 0
    expect(semiplano({ ...pc, saca: 'abajo' }, 50)).toEqual({ w0: 0, s: -1 });
    expect(semiplano({ ...pc, b: { w: 10, z: 40 } }, 41)).toEqual({ todo: true });
  });
  it('recorta exacto un rectángulo; no toca lo que no corta', () => {
    const r = recortarContorno(rectangulo(20, 16), 'x', 0, 1)!;
    expect(cajaSilueta(r)).toMatchObject({ B: 10, L: 16 });
    expect(recortarContorno(rectangulo(20, 16), 'x', -15, 1)).toEqual(rectangulo(20, 16));
    expect(recortarContorno(rectangulo(20, 16), 'x', 15, 1)).toBeNull();
  });
  it('en el proyecto: la corona a 45° achica de un lado las losas de arriba y aplicar dos veces da lo mismo', () => {
    const p = ejemploGuia();
    p.planosCorte = [{ id: 'P1', eje: 'x', a: { w: -10, z: 40 }, b: { w: 10, z: 60 } }];
    expect(aplicarPlanosCorte(p)).toBeGreaterThan(3);
    const n52 = p.niveles.find(n => Math.abs(n.cota - 51) < 1e-6) ?? p.niveles.find(n => n.cota > 45 && n.cota < 58)!;
    const c = cajaSilueta(n52.silueta!);
    expect(c.B).toBeCloseTo(10 - (n52.cota - 50), 6);
    expect(c.cx).toBeGreaterThan(0);                                   // se sacó la izquierda
    const antes = JSON.stringify(p.niveles); aplicarPlanosCorte(p); expect(JSON.stringify(p.niveles)).toBe(antes);
    expect(areaSilueta(p.niveles.find(n => n.nombre === 'PB')!.silueta!)).toBeCloseTo(320, 6);
  });
});
