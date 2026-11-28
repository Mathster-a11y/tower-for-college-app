import { describe, expect, it } from 'vitest';
import { ejemploAsimetrico, ejemploGuia, proyectoVacio, type Muro } from './modelo';
import { aPlanilla } from './mapping';

/** pieza de la cátedra: alma larga, ala arriba, dos alas en el medio, alma derecha abajo y ala inferior */
function piezaCatedra() {
  const p = proyectoVacio();
  const m = (id: string, dir: 'X' | 'Y', x: number, y: number, largo: number): Muro => ({ id, dir, x, y, largo, espesor: 0.25, llega: true, areaInf: 10, piezaA: 'T1', pegadoA: '', piezaB: 'T1B', pegadoB: '' });
  p.muros = [m('M1', 'Y', 0, 6.5, 13), m('M2', 'X', 2.1, 13, 4.2), m('M3', 'X', 1.65, 7.6, 3.3), m('M4', 'X', 1.65, 4.6, 3.3), m('M5', 'Y', 3.2, 1.15, 2.3), m('M6', 'X', 1.6, 0, 3.2)];
  return p;
}

describe('molde de la hoja J: J del molde contra J de la sección real', () => {
  it('en los ejemplos de la guía el molde da exactamente el J real', () => {
    for (const p of [ejemploGuia(), ejemploAsimetrico()]) aPlanilla(p).piezas.forEach(pz => expect(pz.Jhoja!).toBeCloseTo(pz.Jreal!, 6));
  });
  it('pieza con alas en el medio: el alma va entera y ningún muro queda fuera sin que lo pida el usuario', () => {
    const a = aPlanilla(piezaCatedra());
    const pz = a.piezas.find(x => x.dir === 'A')!;
    expect(pz.molde).toBe('asimétrico');
    expect(pz.fila.AB).toBeCloseTo(12.75, 6);                        // 13 m menos medio espesor de cada ala de los extremos
    expect(a.papeles.M5.A).toBe('alma der.');
    // la del medio se suma al ala superior (no se descarta) y la app avisa de la diferencia de J
    expect(a.papeles.M3.A).toBe('ala sup.');
    expect(Object.values(a.papeles).some(x => x.A === 'fuera del cálculo')).toBe(false);
    expect(pz.avisos.some(x => x.includes('en el medio del alma'))).toBe(true);
    expect(pz.avisos.some(x => x.includes('La simplificación al molde cambia el J'))).toBe(true);
  });
  it('más de dos almas (la pieza vista desde el viento B): las que sobran se suman a la más cercana, ninguna queda fuera', () => {
    const a = aPlanilla(piezaCatedra());
    const pz = a.piezas.find(x => x.dir === 'B')!;
    expect(pz.molde).toBe('asimétrico');
    expect(pz.avisos.some(x => x.startsWith('Más de dos almas') && x.includes('se sumó a'))).toBe(true);
    expect(Object.values(a.papeles).filter(x => x.B === 'fuera del cálculo').length).toBe(0);
    expect(Object.values(a.papeles).filter(x => x.B === 'alma' || x.B === 'alma der.').length).toBeGreaterThanOrEqual(3);
  });
  it('más de dos almas iguales y en el mismo tramo: sumarlas da el J exacto de la sección', () => {
    const m = (id: string, x: number): import('./modelo').Muro => ({ id, dir: 'Y', x, y: 0, largo: 4, espesor: 0.2, llega: true, areaInf: 5, piezaA: 'P', pegadoA: '', piezaB: '', pegadoB: '' });
    const p = { ...piezaCatedra(), muros: [m('a', -2), m('b', 0), m('c', 2)] };
    const pz = aPlanilla(p).piezas.find(x => x.dir === 'A')!;
    expect(Math.abs(pz.Jhoja! - pz.Jreal!) / pz.Jreal!).toBeLessThan(1e-3);   // el relleno de 0,01 del ala superior del molde
  });
  it('marcar las alas del medio como «fuera» deja el molde cerca del J real (que las cuenta: se pierde su aporte)', () => {
    const p = piezaCatedra();
    p.muros[2].rolA = 'fuera'; p.muros[3].rolA = 'fuera';
    const pz = aPlanilla(p).piezas.find(x => x.dir === 'A')!;
    const dif = (pz.Jhoja! - pz.Jreal!) / pz.Jreal!;
    expect(dif).toBeLessThan(0);                                       // fuera: el molde queda por debajo
    expect(Math.abs(dif)).toBeLessThan(0.065);                         // (el aporte de las alas del medio, ≈ 6 %)
  });
});
