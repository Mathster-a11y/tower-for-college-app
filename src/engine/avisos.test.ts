import { describe, expect, it } from 'vitest';
import { avisosDiseno } from './avisos';
import { ejemploGuia } from './modelo';
import { aPlanilla } from './mapping';
import { rectangulo } from './silueta';

describe('avisos de diseño', () => {
  it('el ejemplo de la guía no tiene avisos', () => {
    const p = ejemploGuia();
    expect(avisosDiseno(p, aPlanilla(p).papeles)).toEqual([]);
  });
  it('un tabique que sale de la losa achicada en los pisos de arriba, con los niveles agrupados', () => {
    const p = ejemploGuia();
    // del 15º para arriba la losa es de 16 × 16: los tabiques de los bordes (x = ±9,9) quedan afuera
    const i15 = p.niveles.findIndex(n => n.nombre === '15º');
    p.niveles[0].silueta = rectangulo(16, 16); p.niveles[0].B = 16; p.niveles[0].L = 16;
    p.niveles[i15].silueta = rectangulo(16, 16); p.niveles[i15].B = 16; p.niveles[i15].L = 16;
    p.niveles[i15 + 1].silueta = rectangulo(20, 16); p.niveles[i15 + 1].B = 20; p.niveles[i15 + 1].L = 16;
    const a = avisosDiseno(p).filter(x => x.tipo === 'fuera-losa');
    expect(a.length).toBeGreaterThan(0);
    const m1 = a.find(x => x.muro === 'M1')!;
    expect(m1.cotas.length).toBe(i15 + 1);
    expect(m1.texto).toMatch(/del 15º al Azotea/);
  });
  it('tabique en un hueco, carpintería afuera, B × L distinto de la caja y muro sin pieza', () => {
    const p = ejemploGuia();
    const m = p.muros.find(x => x.id === 'M5')!;
    p.huecosLosa = [{ id: 'H1', nombre: 'Escalera', v: [{ x: m.x - 1, y: m.y - 1 }, { x: m.x + 1, y: m.y - 1 }, { x: m.x + 1, y: m.y + 1 }, { x: m.x - 1, y: m.y + 1 }] }];
    const iPB = p.niveles.findIndex(n => n.nombre === 'PB');
    p.niveles[iPB].carpinteria = rectangulo(22, 16);
    p.niveles[iPB].silueta = rectangulo(20, 18);
    p.muros.push({ id: 'M99', dir: 'X', x: 0, y: 6, largo: 2, espesor: 0.2, llega: true, areaInf: 1, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '' });
    const a = avisosDiseno(p, aPlanilla(p).papeles);
    expect(a.find(x => x.tipo === 'sobre-hueco')?.muro).toBe('M5');
    expect(a.find(x => x.tipo === 'carpinteria-fuera')?.texto).toMatch(/1,00 m/);
    expect(a.find(x => x.tipo === 'bl-caja')?.texto).toMatch(/20,00 × 18,00 m/);
    expect(a.find(x => x.tipo === 'sin-pieza')?.muro).toBe('M99');
  });
});
