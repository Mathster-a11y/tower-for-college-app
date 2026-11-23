import { describe, expect, it } from 'vitest';
import { esquinaVivaCerca, ladoMetro, promedioArea, puntosAltos, SALVAGUARDAS } from '../src/viento/salvaguardas';

describe('salvaguardas del simulador', () => {
  it('prendidas por defecto', () => { expect(SALVAGUARDAS).toBe(true); });
  it('puntos altos: máximos locales separados, de mayor a menor', () => {
    const nx = 40, ny = 20, f = new Float32Array(nx * ny).fill(1);
    f[10 * nx + 10] = 2.5; f[10 * nx + 11] = 2.4; f[5 * nx + 30] = 2.0; f[15 * nx + 20] = 1.5;
    const p = puntosAltos(nx, ny, f, null, 1.8);
    expect(p.map(q => q.valor)).toEqual([2.5, 2]);
  });
  it('esquina viva: sí en un cuadrado, no en un círculo de muchos lados', () => {
    const cuadro = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(esquinaVivaCerca({ x: 10.5, y: 10.5 }, [cuadro], 2)).toBe(true);
    expect(esquinaVivaCerca({ x: 5, y: 10.5 }, [cuadro], 2)).toBe(false);
    const circ = Array.from({ length: 48 }, (_, i) => ({ x: 5 * Math.cos((2 * Math.PI * i) / 48), y: 5 * Math.sin((2 * Math.PI * i) / 48) }));
    expect(esquinaVivaCerca({ x: 5.3, y: 0 }, [circ], 2)).toBe(false);
  });
  it('promedio en área: una celda alta pesa 1/9 en un cuadrado de 3', () => {
    const nx = 10, ny = 10, f = new Float32Array(100).fill(1), cuenta = new Uint8Array(100).fill(1);
    f[55] = 10;
    const m = promedioArea(nx, ny, f, cuenta, 3);
    expect(m[55]).toBeCloseTo(2, 6);
    expect(Math.max(...m)).toBeCloseTo(2, 6);
    expect(ladoMetro(0.25)).toBe(4); expect(ladoMetro(2)).toBe(1);
  });
});
