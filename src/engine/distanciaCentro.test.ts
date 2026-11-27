import { describe, expect, it } from 'vitest';
import { ejemploPlanta34 } from './ejemplo34';
import { baricentroPieza, centroLosa, distanciaAlCentro } from './distanciaCentro';
import type { Proyecto } from './modelo';

describe('distancia de una pieza al centro de la losa', () => {
  const p = ejemploPlanta34(), iPB = p.niveles.findIndex(n => n.cota === 0);
  it('la losa del ejemplo de 34 pisos está centrada en el origen', () => {
    const O = centroLosa(p, iPB);
    expect(O.x).toBeCloseTo(0, 6); expect(O.y).toBeCloseTo(0, 6);
  });
  it('T1 (M1 a M6): Δx, Δy, r y θ antihorario desde +x', () => {
    const d = distanciaAlCentro(p, 'M1', 'A', iPB)!;
    expect(d.pieza).toBe('T1'); expect(d.muros).toEqual(['M1', 'M2', 'M3', 'M4', 'M5', 'M6']);
    expect(d.dx).toBeCloseTo(-7.89, 2); expect(d.dy).toBeCloseTo(5.86, 2);
    expect(d.r).toBeCloseTo(Math.hypot(d.dx, d.dy), 9);
    expect(d.theta).toBeGreaterThan(90); expect(d.theta).toBeLessThan(180);
    expect(d.theta).toBeCloseTo((Math.atan2(d.dy, d.dx) * 180) / Math.PI, 6);
  });
  it('cualquier muro de la pieza da el mismo baricentro; con el viento B, la pieza B', () => {
    const a = baricentroPieza(p, 'M1', 'A')!, b = baricentroPieza(p, 'M4', 'A')!, c = baricentroPieza(p, 'M1', 'B')!;
    expect(b.G).toEqual(a.G); expect(c.pieza).toBe('T1B');
  });
  it('θ entre 0° y 360° (abajo a la derecha, cerca de 360°)', () => {
    const q: Proyecto = { ...p, muros: [{ ...p.muros[0], id: 'X', piezaA: '', x: 4, y: -0.5, dir: 'Y' }] };
    const d = distanciaAlCentro(q, 'X', 'A', iPB)!;
    expect(d.sinPieza).toBe(true); expect(d.theta).toBeGreaterThan(270); expect(d.theta).toBeLessThan(360);
  });
  it('el centro es el de la losa, no el origen: una losa corrida corre O', () => {
    const q: Proyecto = { ...p, niveles: p.niveles.map(n => ({ ...n, silueta: [{ x: 10, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 10, y: 10 }] })) };
    const O = centroLosa(q, iPB);
    expect(O.x).toBeCloseTo(20, 6); expect(O.y).toBeCloseTo(5, 6);
  });
});
