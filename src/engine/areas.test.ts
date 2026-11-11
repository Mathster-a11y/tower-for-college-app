import { describe, expect, it } from 'vitest';
import { areasInfluencia } from './areas';
import { proyectoVacio, type Muro } from './modelo';

const muro = (id: string, x: number, y: number, dir: 'X' | 'Y' = 'Y', largo = 2): Muro => ({ id, dir, x, y, largo, espesor: 0.2, llega: true, areaInf: 0, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '' });
describe('áreas de influencia de la losa', () => {
  it('dos muros simétricos se reparten la losa a mitades y la suma da el área total', () => {
    const p = proyectoVacio();
    p.niveles = [{ nombre: 'Azotea', cota: 3, B: 20, L: 10 }, { nombre: 'PB', cota: 0 }];
    p.muros = [muro('M1', -5, 0), muro('M2', 5, 0)];
    const a = areasInfluencia(p, 0);
    expect(a.total).toBeCloseTo(200, 6);
    expect(a.area.M1).toBeCloseTo(100, 6);
    expect(a.area.M2).toBeCloseTo(100, 6);
    expect(a.centro.M1.x).toBeCloseTo(-5, 6);
  });
  it('cuatro columnas en las esquinas de un cuadrado: un cuarto cada una', () => {
    const p = proyectoVacio();
    p.niveles = [{ nombre: 'Azotea', cota: 3, B: 12, L: 12 }, { nombre: 'PB', cota: 0 }];
    p.muros = [[-4, -4], [4, -4], [4, 4], [-4, 4]].map(([x, y], i) => ({ ...muro(`C${i + 1}`, x, y), tipo: 'tubo-circ' as const, largo: 0.5, espesor: 0.25 }));
    const a = areasInfluencia(p, 0);
    Object.values(a.area).forEach(v => expect(v).toBeCloseTo(36, 6));
  });
});
