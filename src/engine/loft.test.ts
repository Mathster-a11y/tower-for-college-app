import { describe, expect, it } from 'vitest';
import { aplicarLofts, interpolarSilueta, loftDeNivel, nivelesDeLoft, prepararSecciones, problemaLoft } from './loft';
import { areaSilueta, cajaSilueta, plantaDeNivel, rectangulo } from './silueta';
import { ejemploGuia } from './modelo';
import { aPlanilla } from './mapping';

const bb = Math.tan(Math.PI / 8);
const circulo = (r: number) => [{ x: r, y: 0, b: bb }, { x: 0, y: r, b: bb }, { x: -r, y: 0, b: bb }, { x: 0, y: -r, b: bb }];

describe('loft de losas', () => {
  it('entre dos rectángulos iguales, todas las losas del medio son ese rectángulo (con sus 4 esquinas)', () => {
    const secs = prepararSecciones([rectangulo(20, 16), rectangulo(20, 16)]);
    const s = interpolarSilueta(secs, [0, 30], 12);
    expect(s).toHaveLength(4);
    expect(cajaSilueta(s)).toMatchObject({ B: 20, L: 16 });
  });
  it('de un rectángulo 20 × 16 a otro 10 × 8: en el medio la caja es 15 × 12 (recto)', () => {
    const secs = prepararSecciones([rectangulo(20, 16), rectangulo(10, 8)]);
    const s = interpolarSilueta(secs, [0, 30], 15);
    const c = cajaSilueta(s);
    expect(c.B).toBeCloseTo(15, 6);
    expect(c.L).toBeCloseTo(12, 6);
    expect(s).toHaveLength(4);                                   // las esquinas no se redondean
  });
  it('suave con dos losas: frena en los extremos (en ¼ de altura avanza menos que recto)', () => {
    const secs = prepararSecciones([rectangulo(20, 16), rectangulo(10, 8)]);
    const r = cajaSilueta(interpolarSilueta(secs, [0, 40], 10, 'recto')).B, su = cajaSilueta(interpolarSilueta(secs, [0, 40], 10, 'suave')).B;
    expect(r).toBeCloseTo(17.5, 6);
    expect(su).toBeGreaterThan(r);
    expect(cajaSilueta(interpolarSilueta(secs, [0, 40], 20, 'suave')).B).toBeCloseTo(15, 6);   // en el medio, igual
  });
  it('de un cuadrado a un círculo: el área queda entre las dos y el contorno no se cruza', () => {
    const secs = prepararSecciones([rectangulo(20, 20), circulo(10)]);
    const s = interpolarSilueta(secs, [0, 10], 5);
    const a = areaSilueta(s);
    expect(a).toBeLessThan(400);
    expect(a).toBeGreaterThan(Math.PI * 100);
  });
  it('la costura se alinea: un cuadrado con los vértices en otro orden no se retuerce', () => {
    const q = rectangulo(20, 20), q2 = [q[2], q[3], q[0], q[1]];
    const secs = prepararSecciones([q, q2]);
    expect(areaSilueta(interpolarSilueta(secs, [0, 10], 5))).toBeCloseTo(400, 3);
    // y al revés (horario)
    const secs2 = prepararSecciones([q, [...q].reverse()]);
    expect(areaSilueta(interpolarSilueta(secs2, [0, 10], 5))).toBeCloseTo(400, 3);
  });
  it('giro: a mitad de altura, la mitad del giro (un cuadrado girado 45° tiene la caja de su diagonal)', () => {
    const secs = prepararSecciones([rectangulo(20, 20), rectangulo(20, 20)]);
    const c = cajaSilueta(interpolarSilueta(secs, [0, 10], 5, 'recto', 90));
    expect(c.B).toBeCloseTo(20 * Math.SQRT2, 3);
  });
  it('en el proyecto: escribe silueta, B y L en las losas del medio, y la planilla lee esas B y L', () => {
    const p = ejemploGuia();
    const top = 0, iPB = p.niveles.findIndex(n => n.nombre === 'PB');
    p.niveles[top].silueta = rectangulo(10, 8);
    p.niveles[iPB].silueta = rectangulo(20, 16);
    p.lofts = [{ id: 'LF1', cotas: [p.niveles[iPB].cota, p.niveles[top].cota] }];
    expect(problemaLoft(p, p.lofts[0])).toBe('');
    const { intermedios } = nivelesDeLoft(p, p.lofts[0]);
    expect(intermedios.length).toBe(iPB - 1);
    const n = aplicarLofts(p);
    expect(n).toBe(iPB - 1);
    // los anchos bajan parejo con la altura
    const zPB = p.niveles[iPB].cota, zT = p.niveles[top].cota;
    intermedios.forEach(i => {
      const t = (p.niveles[i].cota - zPB) / (zT - zPB);
      expect(p.niveles[i].B).toBeCloseTo(20 - 10 * t, 1);
      expect(plantaDeNivel(p, i).L).toBeCloseTo(16 - 8 * t, 1);
      expect(loftDeNivel(p, i)?.id).toBe('LF1');
    });
    // la planilla (columna E de los anchos) toma la B de cada losa generada
    const a = aPlanilla(p);
    intermedios.forEach(i => { const k = a.filaNivel[i]; if (k !== undefined) expect(a.datos.mnyq.E[k]).toBe(p.niveles[i].B); });
    // aplicar dos veces da lo mismo
    const antes = JSON.stringify(p.niveles);
    aplicarLofts(p);
    expect(JSON.stringify(p.niveles)).toBe(antes);
  });
  it('avisa si entre las losas elegidas no hay nada', () => {
    const p = ejemploGuia();
    p.lofts = [{ id: 'LF1', cotas: [p.niveles[0].cota, p.niveles[1].cota] }];
    expect(problemaLoft(p, p.lofts[0])).toMatch(/no hay ninguna otra losa/);
    p.lofts = [{ id: 'LF1', cotas: [p.niveles[0].cota, 999] }];
    expect(problemaLoft(p, p.lofts[0])).toMatch(/ya no existe/);
  });
});
