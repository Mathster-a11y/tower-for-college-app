import { describe, expect, it } from 'vitest';
import { alturaCorteDebil, prismasCalados, problemaAbertura, propsPoligonos, seccionDebil, solidosEnAltura, ubicarAbertura } from './aberturas';
import { Jreal } from './mapping';
import { aPlanilla } from './mapping';
import { ejemploGuia, type Muro } from './modelo';
import { partesDePieza } from './flexocompresion';

const tab = (extra: Partial<Muro> = {}): Muro => ({ id: 'T', dir: 'Y', x: 0, y: 0, largo: 6, espesor: 0.2, llega: true, areaInf: 10, piezaA: 'T', pegadoA: '', piezaB: '', pegadoB: '', ...extra });

describe('calados que no parten el elemento', () => {
  it('tabique con una puerta: la sección más débil son los dos pedazos y su J (con Steiner) es el de la cuenta a mano', () => {
    const m = tab({ aberturas: [{ s: 1, ancho: 1, desde: 0, alto: 2.1 }] });
    const pg = seccionDebil(m)!;
    expect(pg.length).toBe(2);
    // pedazos: de −3 a 0,5 (3,5 m) y de 1,5 a 3 (1,5 m), espesor 0,2
    const A1 = 0.2 * 3.5, A2 = 0.2 * 1.5, s1 = -1.25, s2 = 2.25, sg = (A1 * s1 + A2 * s2) / (A1 + A2);
    const J = (0.2 * 3.5 ** 3) / 12 + A1 * (s1 - sg) ** 2 + (0.2 * 1.5 ** 3) / 12 + A2 * (s2 - sg) ** 2;
    expect(Jreal([m], 'A')).toBeCloseTo(J, 9);
    expect(Jreal([m], 'A')).toBeLessThan(Jreal([tab()], 'A'));
    // la flexocompresión usa los mismos pedazos
    expect(partesDePieza([m], 'A').J).toBeCloseTo(J, 9);
  });
  it('el corte más débil es el que pasa por más aberturas a la vez', () => {
    const m = tab({ aberturas: [{ s: -1.5, ancho: 1, desde: 0, alto: 2.1 }, { s: 1.5, ancho: 1.2, desde: 0.9, alto: 1.2 }] });
    const h = alturaCorteDebil(m)!;
    expect(h).toBeGreaterThanOrEqual(0.9); expect(h).toBeLessThan(2.1);
    expect(solidosEnAltura(m, h).length).toBe(3);
    expect(solidosEnAltura(m, 2.5).length).toBe(1);        // arriba del dintel: entero
  });
  it('tubo rectangular con una puerta en una cara y tubo circular con una abertura', () => {
    const nuc: Muro = { ...tab(), id: 'N', tipo: 'tubo-rect', largo: 6, ladoY: 4, espesor: 0.25, aberturas: [{ s: 0, ancho: 1.2, desde: 0, alto: 2.2, cara: 'y-' }] };
    expect(seccionDebil(nuc)!.length).toBe(5);              // 4 caras, una partida en dos
    const sinA = propsPoligonos(solidosEnAltura({ ...nuc, aberturas: null }, 1));
    const con = propsPoligonos(seccionDebil(nuc)!);
    expect(con.A).toBeCloseTo(sinA.A - 1.2 * 0.25, 9);
    expect(con.Jx).toBeLessThan(sinA.Jx);
    const circ: Muro = { ...tab(), id: 'C', tipo: 'tubo-circ', largo: 2, espesor: 0.3, aberturas: [{ s: 90, ancho: 0.8, desde: 0, alto: 2 }] };
    const pc = propsPoligonos(seccionDebil(circ)!), anillo = Math.PI * (1 - 0.7 ** 2);
    expect(pc.A).toBeCloseTo(anillo - 0.8 * 0.3, 2);
    expect(pc.yg).toBeLessThan(0);                          // sin la parte de arriba, el baricentro baja
    expect(ubicarAbertura(circ, { x: 0, y: 1 })!.s).toBeCloseTo(90, 9);
  });
  it('3D: antepecho y dintel, y el elemento entero fuera de la abertura', () => {
    const m = tab({ aberturas: [{ s: 0, ancho: 1, desde: 0.9, alto: 1.2 }] });
    const pr = prismasCalados(m, 3, 6);
    // tres franjas en altura (0–0,9 entero, 0,9–2,1 con hueco: 2 pedazos, 2,1–3 entero) = 4 prismas
    expect(pr.length).toBe(4);
    const vol = pr.reduce((s, p) => s + propsPoligonos([p.pol]).A * (p.zb - p.za), 0);
    expect(vol).toBeCloseTo(0.2 * 6 * 3 - 0.2 * 1 * 1.2, 9);
  });
  it('controles: no sale del muro, no se pisa con otra y tiene que quedar dintel', () => {
    const m = tab({ aberturas: [{ s: 0, ancho: 1, desde: 0, alto: 2 }] });
    expect(problemaAbertura(m, { s: 2.8, ancho: 1, desde: 0, alto: 2 }, 3)).toMatch(/no entra/);
    expect(problemaAbertura(m, { s: 0.3, ancho: 1, desde: 0, alto: 2 }, 3)).toMatch(/pisa/);
    expect(problemaAbertura(m, { s: 2, ancho: 0.8, desde: 0, alto: 3 }, 3)).toMatch(/toda la altura/);
    expect(problemaAbertura(m, { s: 2, ancho: 0.8, desde: 0, alto: 2.1 }, 3)).toBeNull();
  });
  it('en la planilla: la pieza calada va con el rectángulo equivalente de su sección más débil', () => {
    const p = ejemploGuia();
    const m1 = p.muros.find(m => m.id === 'M1')!;
    m1.aberturas = [{ s: 0.5, ancho: 0.9, desde: 0, alto: 2.1 }];
    const pz = aPlanilla(p).piezas.find(x => x.dir === 'A' && x.muros.includes('M1'))!;
    expect(pz.Jreal).toBeCloseTo(Jreal([m1], 'A'), 9);
    expect(pz.avisos.join(' ')).toMatch(/sección más débil/);
    const { B, C } = pz.fila as { B: number; C: number };
    expect((B * C ** 3) / 12 / pz.Jreal!).toBeCloseTo(1, 3);     // b y h redondeados al mm
  });
});
