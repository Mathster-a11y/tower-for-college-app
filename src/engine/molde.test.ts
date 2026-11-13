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
  it('pieza con alas en el medio: el alma va entera y las alas del medio quedan fuera si así el J se acerca al real', () => {
    const a = aPlanilla(piezaCatedra());
    const pz = a.piezas.find(x => x.dir === 'A')!;
    expect(pz.molde).toBe('asimétrico');
    expect(pz.fila.AB).toBeCloseTo(12.75, 6);                        // 13 m menos medio espesor de cada ala de los extremos
    expect(a.papeles.M5.A).toBe('alma der.');
    // la del medio: sumarla al ala superior inflaba el J; la app la deja fuera del molde (J más cerca del real) y avisa
    expect(a.papeles.M3.A).toBe('fuera del cálculo');
    expect(pz.avisos.some(x => x.includes('más cerca del real'))).toBe(true);
    expect(Math.abs(pz.Jhoja! - pz.Jreal!) / pz.Jreal!).toBeLessThan(0.06);
  });
  it('más de dos almas (la pieza vista desde el viento B): la app elige las dos que dan el J más cercano al real', () => {
    const a = aPlanilla(piezaCatedra());
    const pz = a.piezas.find(x => x.dir === 'B')!;
    expect(pz.molde).toBe('asimétrico');
    // la app prueba qué dos almas usar y se queda con el J más cercano al real (y lo avisa)
    expect(pz.avisos.some(x => x.startsWith('La app armó el molde') && x.includes('más cerca del real'))).toBe(true);
    expect(Object.values(a.papeles).filter(x => x.B === 'fuera del cálculo').length).toBeGreaterThanOrEqual(2);
    const conDosDeMasArea = Math.abs(pz.Jhoja! - pz.Jreal!);
    expect(conDosDeMasArea).toBeLessThanOrEqual(Math.abs(pz.Jreal!) * 0.6);
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
