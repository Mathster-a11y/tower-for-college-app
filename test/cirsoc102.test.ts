/**
 * Etapa 3 del plan: viento según CIRSOC 102-25 y cargas según CIRSOC 101-25, contra las tablas y el ejemplo resuelto
 * del propio reglamento.
 */
import { describe, expect, it } from 'vitest';
import { CIUDADES, cpSotavento, FACTOR_SERVICIO, Kz, naTabiques, qz, rafaga, viento102 } from '../src/engine/cargas/cirsoc102';
import { combinaciones, sobrecarga } from '../src/engine/cargas/cirsoc101';
import { ejemploGuia } from '../src/engine/modelo';
import { leerProyecto } from '../src/engine/lector';
import { proyectoDesdeTablas, tablasProyecto } from '../src/xlsx/proyectoTablas';
import { escribirLibro, leerLibro } from '../src/xlsx/tablas';

describe('CIRSOC 102-25', () => {
  it('velocidad de Mar del Plata (Fig. 1.5-1D) y la del 102-2005 (C 1.5-6.1: V = √1,5 · V50)', () => {
    expect(CIUDADES['Mar del Plata']).toEqual([58.3, 62.5, 67.0]);
    expect(Object.keys(CIUDADES)).toHaveLength(29);
    expect(62.5 / Math.sqrt(1.5)).toBeCloseTo(51.0, 1);
  });
  it('Kz de la Tabla 1.13-1 (fórmula de la nota 1)', () => {
    const tabla: [number, 'B' | 'C' | 'D', number][] = [[0, 'B', 0.59], [10, 'B', 0.71], [30, 'B', 0.95], [60, 'B', 1.14], [150, 'B', 1.45],
      [0, 'C', 0.87], [10, 'C', 1.0], [50, 'C', 1.39], [0, 'D', 1.05], [10, 'D', 1.19], [100, 'D', 1.77]];
    tabla.forEach(([z, e, k]) => expect(Kz(z, e)).toBeCloseTo(k, 2));
  });
  it('qz = 0,613 Kz Kzt Kd Ke V² (1.13-1)', () => {
    expect(qz(1, 1, 0.85, 1, 62.5)).toBeCloseTo(0.613 * 0.85 * 62.5 ** 2, 9);
  });
  it('Cp de sotavento según L/B (Fig. 2.4-1)', () => {
    expect(cpSotavento(0.8)).toBe(-0.5);
    expect(cpSotavento(2)).toBeCloseTo(-0.3, 9);
    expect(cpSotavento(4)).toBeCloseTo(-0.2, 9);
    expect(cpSotavento(3)).toBeCloseTo(-0.25, 9);
  });
  it('factor de ráfaga: el ejemplo resuelto de la Tabla C 1.9-1', () => {
    const r = rafaga(183, 30, 30, 'B', 51, 0.2, 0.01);
    expect(r.zBar).toBeCloseTo(109.8, 1);
    expect(r.Iz).toBeCloseTo(0.201, 3);
    expect(r.Lz).toBeCloseTo(217.8, 0);
    expect(r.Q ** 2).toBeCloseTo(0.616, 2);
    expect(r.G).toBeCloseTo(0.818, 3);
    // la tabla da V̄z = 41,15 m/s y Gf = 1,162; con la expresión 1.9-16 en m/s da 40,8 m/s (diferencia de redondeo del ejemplo)
    expect(r.Vz! / 41.15).toBeCloseTo(1, 1);
    expect(r.Gf!).toBeCloseTo(1.162, 1);
    expect(r.R! ** 2).toBeCloseTo(1.261, 0);
  });
  it('frecuencia de tabiques (1.9-5): un tabique de toda la altura', () => {
    // un muro de 10 m × 0,2 m, de 30 m de alto, en una base de 400 m²: Cw = 100/400 · 2 / (1 + 0,83 · 9) = 0,0590
    const { Cw, na } = naTabiques(30, 400, [{ A: 2, D: 10, h: 30 }]);
    expect(Cw).toBeCloseTo((100 / 400) * (2 / (1 + 0.83 * 9)), 9);
    expect(na).toBeCloseTo((117.3 * Math.sqrt(Cw)) / 30, 9);
  });
  it('viento de servicio: factores de la Fig. C AB.4.2-1', () => {
    expect(FACTOR_SERVICIO[10]).toBe(0.84);
    expect(FACTOR_SERVICIO[50]).toBe(1);
  });
  it('sin elegir ciudad, sale de la V del 102-2005 del proyecto: la guía (48 m/s) es Neuquén; su exposición A pasa a B', () => {
    const v = viento102(ejemploGuia());
    expect(v.ciudad).toBe('Neuquén');
    expect(v.V).toBe(58.8);
    expect(v.exposicion).toBe('B');
  });
  it('la torre de la guía en Mar del Plata, categoría II, exposición B', () => {
    const p = ejemploGuia();
    p.cirsoc102 = { ciudad: 'Mar del Plata' };
    const v = viento102(p);
    expect(v.V).toBe(62.5);
    expect(v.h).toBe(64);
    expect(v.A.B).toBe(20);
    expect(v.A.L).toBe(16);
    expect(v.A.Cps).toBe(-0.5);
    // la suma de las fuerzas de los niveles es el corte en PB, y el momento sale de las fuerzas por sus alturas
    const sumW = v.A.niveles.reduce((s, x) => s + x.W, 0);
    expect(v.A.QPB).toBeCloseTo(sumW, 9);
    expect(v.A.MPB).toBeCloseTo(v.A.niveles.reduce((s, x) => s + x.W * x.z, 0), 6);
    expect(v.A.W).toBeGreaterThanOrEqual(v.A.Wmin);
    // casos de carga: 2 = 75 % con torsión 0,15 B; 4 = 56,3 % de las dos
    const c2 = v.casos[1], c4 = v.casos[3];
    expect(c2.QA).toBeCloseTo(0.75 * v.A.QPB, 9);
    expect(c2.MtA).toBeCloseTo(0.75 * v.A.QPB * 0.15 * 20, 9);
    expect(c4.Mt).toBeCloseTo(0.563 * (v.A.QPB * 0.15 * 20 + v.B.QPB * 0.15 * 16), 9);
    expect(v.servicio.Va).toBeCloseTo(0.84 * 62.5 / Math.sqrt(1.5), 9);
  });
});

describe('CIRSOC 101-25', () => {
  it('sobrecarga de vivienda 2 kN/m² ≈ 0,2 t/m² (la guía: 0,9 − 0,7)', () => {
    expect(sobrecarga({ destino: 'vivienda' })).toBeCloseTo(0.204, 3);
    expect(sobrecarga({ destino: 'oficinas' })).toBeCloseTo(0.255, 3);
  });
  it('combinaciones con viento de resistencia: 1,2 D + 1,0 W + 0,5 L y 0,9 D + 1,0 W', () => {
    const c = combinaciones();
    expect(c.map(x => x.nombre)).toEqual(['1,4 D', '1,2 D + 1,6 L', '1,2 D + 0,5 W', '1,2 D + 1,0 W + 0,5 L', '0,9 D + 1,0 W']);
    expect(c.every(x => x.W <= 1)).toBe(true);
  });
});

describe('los datos CIRSOC van con el proyecto', () => {
  it('el lector los valida y viajan en las tablas «T3D» del Excel', async () => {
    const p = ejemploGuia();
    p.cirsoc102 = { ciudad: 'Salta', categoria: 'III-IV', exposicion: 'C', Kzt: 1.2, altitud: 1150, cerramiento: 'parcialmente cerrado', frecuencia: 'manual', n1manual: 0.6, beta: 0.015, recurrenciaServicio: 25 };
    p.cirsoc101 = { D: 0.75, destino: 'oficinas' };
    expect(leerProyecto(p).ok).toBe(true);
    const r = proyectoDesdeTablas(await leerLibro(await escribirLibro(tablasProyecto(p))), ejemploGuia());
    expect(r!.proyecto.cirsoc102).toEqual(p.cirsoc102);
    expect(r!.proyecto.cirsoc101).toEqual(p.cirsoc101);
    const malo = leerProyecto({ ...p, cirsoc102: { ciudad: 'Atlántida' } });
    expect(malo.ok ? [] : malo.errores).toEqual(['CIRSOC 102-25: ciudad desconocida («Atlántida»).']);
  });
});
