import { describe, expect, it } from 'vitest';
import { ejemploGuia, type Muro } from '../src/engine/modelo';
import { datosAlturaDe, partesDePieza, verificarPieza } from '../src/engine/flexocompresion';

describe('flexocompresión muro por muro, como la guía (sección 5)', () => {
  const p = ejemploGuia();
  const alt = datosAlturaDe(p);
  const M = (id: string) => p.muros.find(m => m.id === id)!;

  it('altura y losas del ejemplo: 64 m y 21 losas sobre PB', () => {
    expect(alt.zTop - alt.zPB).toBe(64);
    expect(alt.cotasSobrePB.length).toBe(21);
  });

  it('T1 (tabique suelto): los números de la guía', () => {
    const v = verificarPieza('T1', 'A', [M('M1')], 312.46, alt, 300);
    const t = v.muros[0];
    expect(t.Pp).toBeCloseTo(138.24, 2);          // guía 138,25
    expect(t.losaDesc).toBeCloseTo(154.35, 2);
    expect(t.losaCarg).toBeCloseTo(198.45, 2);
    expect(t.Ndesc).toBeCloseTo(292.59, 1);       // guía 292,61
    expect(t.A).toBeCloseTo(0.9, 9);
    expect(v.J).toBeCloseTo(1.51875, 9);           // W = J / (h/2) = 0,675
    expect(t.sigM).toBeCloseTo(462.90, 1);
    expect(t.desc[0]).toBeCloseTo(137.78, 0);      // σ desc = +137,78 / −788 t/m²
    expect(t.desc[1]).toBeCloseTo(-788.0, 0);
    expect(t.carg[0]).toBeCloseTo(88.78, 0);       // σ carg = +88,78 / −837
    expect(t.carg[1]).toBeCloseTo(-837.0, 0);
    expect(t.traccion).toBeCloseTo(13.78, 1);      // 13,77 kg/cm²
    expect(t.AsMin).toBeCloseTo(72, 6);            // 0,8 % · 20 · 450 = 72 cm²
    expect(t.As).toBeLessThan(t.AsMin);            // se arma con la cuantía mínima
    expect(t.compresion).toBeCloseTo(-83.7, 0);    // verifica para H30
    expect(v.verifica).toBe(true);
  });

  it('T5 (U): el alma a flexocompresión y las alas con el par M·A·d / J (= M_alas / z)', () => {
    const muros = ['M5', 'M6', 'M7'].map(M);
    const { partes, J } = partesDePieza(muros, 'A');
    expect(J).toBeCloseTo(8.0043, 3);
    const v = verificarPieza('T5', 'A', muros, 1606.96, alt, 300);
    const ala = v.muros.find(x => x.id === 'M6')!, alma = v.muros.find(x => x.id === 'M5')!;
    expect(alma.Pp).toBeCloseTo(110.59, 1);        // guía 110,60
    expect(ala.Pp).toBeCloseTo(153.6, 6);
    expect(ala.losaCarg).toBeCloseTo(574.56, 2);
    const par = ala.sigM * ala.A;                   // fuerza del par sobre el ala (t)
    expect(par).toBeCloseTo((1606.96 * 1.0 * 1.9) / J, 6);
    expect(par / 384).toBeGreaterThan(0.98);        // guía: 1462,34 / 3,80 = 384 t
    expect(-ala.compresion).toBeCloseTo(111.1, -0.5); // guía: 1111 t / 1 m² = 111 kg/cm²
    expect(partes.filter(x => x.papel === 'ala').length).toBe(2);
  });

  it('tubo rectangular: las 4 caras, J de la caja y el área de influencia repartida', () => {
    const caja: Muro = { id: 'N', dir: 'Y', tipo: 'tubo-rect', x: 0, y: 0, largo: 4, ladoY: 6, espesor: 0.25, llega: true, areaInf: 40, piezaA: 'N', pegadoA: '', piezaB: 'NB', pegadoB: '' };
    const { partes, J } = partesDePieza([caja], 'A');
    expect(partes.length).toBe(4);
    expect(J).toBeCloseTo((4 * 6 ** 3 - 3.5 * 5.5 ** 3) / 12, 6);
    const v = verificarPieza('N', 'A', [caja], 1000, alt, 300);
    const losas = v.muros.reduce((s, x) => s + x.losaDesc, 0);
    expect(losas).toBeCloseTo(0.7 * 40 * 21, 6);
  });

  it('tubo circular: W = J / (D/2)', () => {
    const c: Muro = { id: 'C', dir: 'Y', tipo: 'tubo-circ', x: 0, y: 0, largo: 1, espesor: 0.5, llega: true, areaInf: 20, piezaA: 'C', pegadoA: '', piezaB: '', pegadoB: '' };
    const v = verificarPieza('C', 'A', [c], 10, alt, 300);
    expect(v.J).toBeCloseTo(Math.PI / 64, 9);
    expect(v.muros[0].sigM).toBeCloseTo(10 / (Math.PI / 64 / 0.5), 6);
  });
});

describe('flexocompresión: el viento cambia de sentido', () => {
  it('alma corrida del baricentro (pieza en L): la compresión máxima es la fibra más alejada con el viento al revés', () => {
    const p = ejemploGuia();
    const alt = datosAlturaDe(p);
    const alma: Muro = { id: 'a', dir: 'Y', x: 0, y: 0, largo: 4, espesor: 0.2, llega: true, areaInf: 10, piezaA: 'L', pegadoA: '', piezaB: '', pegadoB: '' };
    const ala: Muro = { id: 's', dir: 'X', x: 2.4, y: 2.1, largo: 5, espesor: 0.2, llega: true, areaInf: 10, piezaA: 'L', pegadoA: 'a', piezaB: '', pegadoB: '' };
    const v = verificarPieza('L', 'A', [alma, ala], 400, alt, 300);
    const a = v.muros.find(x => x.id === 'a')!;
    const ymax = Math.max(Math.abs(a.d - a.h / 2), Math.abs(a.d + a.h / 2));
    expect(a.compresion * 10).toBeCloseTo(-a.Ncarg / a.A - (400 * ymax) / v.J, 6);
    expect(a.compresion * 10).toBeLessThan(Math.min(...a.carg));   // más que lo que muestra el diagrama de un sentido
  });
});
