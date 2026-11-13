import { describe, expect, it } from 'vitest';
import { calarMuro, tuboEnTabiques } from './dibujo';
import { aPlanilla, Jreal } from './mapping';
import { proyectoVacio, type Muro } from './modelo';

const tab = (id: string, x: number, y: number, largo: number, extra: Partial<Muro> = {}): Muro => ({ id, dir: 'Y', x, y, largo, espesor: 0.25, llega: true, areaInf: 12, piezaA: 'T1', pegadoA: '', piezaB: 'T1B', pegadoB: '', ...extra });

describe('calar tabiques y tubos', () => {
  it('un tabique con un hueco de toda la altura queda en dos piezas, con el área repartida por largo', () => {
    const r = calarMuro([tab('M1', 0, 0, 6)], 'M1', { x: 0, y: 1 }, 1, 'hueco');
    if ('error' in r) throw new Error(r.error);
    expect(r.muros).toHaveLength(2);
    const [a, b] = r.muros;
    expect(a.largo + b.largo).toBeCloseTo(5, 9);
    expect(a.areaInf + b.areaInf).toBeCloseTo(12, 6);
    expect(a.piezaA).not.toBe(b.piezaA);
    expect(a.vano).toEqual({ con: b.id, ancho: 1, tipo: 'hueco' });
    // el vano queda centrado donde se tocó: entre y = 0,5 y 1,5
    expect(a.y + a.largo / 2).toBeCloseTo(0.5, 9); expect(b.y - b.largo / 2).toBeCloseTo(1.5, 9);
  });
  it('con dintel los dos tramos siguen en la misma pieza y la hoja lleva su J (con Steiner)', () => {
    const p = proyectoVacio();
    const r = calarMuro([tab('M1', 0, 0, 6)], 'M1', { x: 0, y: 0 }, 0.9, 'dintel');
    if ('error' in r) throw new Error(r.error);
    p.muros = r.muros;
    expect(new Set(p.muros.map(m => m.piezaA)).size).toBe(1);
    const pz = aPlanilla(p).piezas.find(z => z.dir === 'A')!;
    expect(pz.Jreal!).toBeCloseTo(Jreal(r.muros, 'A'), 9);
    expect(pz.Jreal!).toBeLessThan((0.25 * 6 ** 3) / 12);            // menos que el muro entero
    expect(Math.abs(pz.Jhoja! - pz.Jreal!) / pz.Jreal!).toBeLessThan(0.05);
  });
  it('un vano que no entra devuelve un error', () => {
    expect('error' in calarMuro([tab('M1', 0, 0, 1)], 'M1', { x: 0, y: 0 }, 0.9, 'dintel')).toBe(true);
  });
  it('un tubo se pasa a sus cuatro tabiques (mismo J) y se cala la cara más cercana', () => {
    const tubo: Muro = { ...tab('M1', 0, 0, 6), tipo: 'tubo-rect', ladoY: 4, espesor: 0.3, areaInf: 40 };
    let k = 1; const caras = tuboEnTabiques(tubo, () => `N${k++}`);
    expect(caras).toHaveLength(4);
    expect(Jreal(caras, 'A')).toBeCloseTo(Jreal([tubo], 'A'), 6);
    expect(Jreal(caras, 'B')).toBeCloseTo(Jreal([tubo], 'B'), 6);
    expect(caras.reduce((s, c) => s + c.areaInf, 0)).toBeCloseTo(40, 1);
    const r = calarMuro([tubo], 'M1', { x: 1, y: 2 }, 1.2, 'dintel');            // cara de arriba
    if ('error' in r) throw new Error(r.error);
    expect(r.muros).toHaveLength(5);
    expect(new Set(r.muros.map(m => m.piezaA)).size).toBe(1);
    expect(r.muros.some(m => m.vano && m.dir === 'X' && m.y > 1.8)).toBe(true);
  });
});

describe('torre de 34 pisos (planta del PDF)', () => {
  it('se arma completa: 34 niveles sobre PB, 4 núcleos que toman viento y 32 columnas fuera del molde', async () => {
    const { ejemploPlanta34 } = await import('./ejemplo34');
    const { calcularPlanilla } = await import('./planilla');
    const p = ejemploPlanta34();
    expect(p.niveles.filter(n => n.cota > 0)).toHaveLength(34);
    expect(p.niveles[0].cota).toBeCloseTo(122.4, 6);
    const asig = aPlanilla(p);
    expect(asig.piezas.filter(z => z.dir === 'A' && z.filaHoja !== null)).toHaveLength(6);
    expect(asig.avisos.some(a => a.includes('32 piezas quedan fuera del molde'))).toBe(true);
    const r = calcularPlanilla(asig.datos);
    [r.mnyq.H61, r.mnyq.L99, r.jpar.AY24, r.jort.AY24].forEach(v => expect(Number.isFinite(v)).toBe(true));
    // las áreas de influencia cubren la losa (39,6 + 0,5) × (18 + 0,5) m, con las columnas
    expect(p.muros.reduce((s, m) => s + m.areaInf, 0)).toBeGreaterThan(0.95 * 40.1 * 18.5);
  });
});
