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
  it('pieza con alas en el medio: el alma va entera, las alas se pegan al alma que tocan y se avisa la diferencia de J', () => {
    const a = aPlanilla(piezaCatedra());
    const pz = a.piezas.find(x => x.dir === 'A')!;
    expect(pz.molde).toBe('asimétrico');
    expect(pz.fila.AB).toBeCloseTo(12.75, 6);                        // 13 m menos medio espesor de cada ala de los extremos
    expect(a.papeles.M5.A).toBe('alma der.');
    expect(a.papeles.M3.A).toBe('ala sup.');                           // la del medio se suma al ala superior
    expect(pz.avisos.some(x => x.includes('cambia el J'))).toBe(true);
    expect(pz.avisos.some(x => x.includes('no llega al ala superior'))).toBe(true);
  });
  it('más de dos almas (la pieza vista desde el viento B): se toman las dos de más área y el resto queda fuera', () => {
    const a = aPlanilla(piezaCatedra());
    const pz = a.piezas.find(x => x.dir === 'B')!;
    expect(pz.molde).toBe('asimétrico');
    expect(pz.avisos.some(x => x.includes('Más de dos almas'))).toBe(true);
    expect(Object.values(a.papeles).filter(x => x.B === 'fuera del cálculo')).toHaveLength(2);
  });
  it('marcar las alas del medio como «fuera» deja el molde cerca del J real (que las cuenta: se pierde su aporte)', () => {
    const p = piezaCatedra();
    p.muros[2].rolA = 'fuera'; p.muros[3].rolA = 'fuera';
    const pz = aPlanilla(p).piezas.find(x => x.dir === 'A')!;
    const dif = (pz.Jhoja! - pz.Jreal!) / pz.Jreal!;
    expect(dif).toBeLessThan(0);                                       // fuera: el molde queda por debajo
    expect(Math.abs(dif)).toBeLessThan(0.06);
  });
});
