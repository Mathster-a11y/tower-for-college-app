import { describe, expect, it } from 'vitest';
import { areaConSigno, arcoConRadio, chaflan, circulo, desfasarAnillo, dividirLado, elipse, empalme, escalarAnillo, espejarAnillo, girarAnillo, ladoCon, medidaLado, poligonoRegular, polar15, rectangulo } from './contorno';
import { propiedades, type VerticePerfil } from './perfil';

const ok = (r: VerticePerfil[] | { error: string }) => { if ('error' in r) throw new Error(r.error); return r; };
const A = (vs: VerticePerfil[]) => propiedades({ v: vs }).A;

describe('formas', () => {
  it('rectángulo, círculo, polígono y elipse', () => {
    expect(A(rectangulo(0, 0, 4, 0.3))).toBeCloseTo(1.2, 9);
    expect(A(circulo(1, 2, 0.5))).toBeCloseTo(Math.PI * 0.25, 4);
    expect(A(poligonoRegular(0, 0, 1, 6))).toBeCloseTo((3 * Math.sqrt(3)) / 2, 3);
    expect(A(poligonoRegular(0, 0, 1, 4, 45, 'inscrito'))).toBeCloseTo(4, 4);     // cuadrado de lado 2
    expect(A(elipse(0, 0, 2, 1)) / (Math.PI * 2)).toBeCloseTo(1, 3);
    expect(areaConSigno(rectangulo(0, 0, 2, 2))).toBeGreaterThan(0);
  });
});
describe('esquinas', () => {
  it('empalme de radio r en una esquina de un cuadrado: área exacta', () => {
    const vs = ok(empalme(rectangulo(0, 0, 2, 2), 2, 0.5));
    expect(vs.length).toBe(5);
    expect(A(vs)).toBeCloseTo(4 - (1 - Math.PI / 4) * 0.25, 4);
    expect(propiedades({ v: vs }).x1).toBeCloseTo(1, 6);
  });
  it('empalme en sentido horario también', () => {
    const cw = rectangulo(0, 0, 2, 2).reverse();
    expect(A(ok(empalme(cw, 1, 0.5)))).toBeCloseTo(4 - (1 - Math.PI / 4) * 0.25, 4);
  });
  it('empalme que no entra', () => { expect('error' in empalme(rectangulo(0, 0, 2, 0.2), 0, 0.5)).toBe(true); });
  it('chaflán', () => { expect(A(ok(chaflan(rectangulo(0, 0, 2, 2), 0, 0.4)))).toBeCloseTo(4 - 0.08, 9); });
});
describe('lados', () => {
  it('dividir, largo y ángulo, arco con radio', () => {
    expect(ok(dividirLado(rectangulo(0, 0, 3, 1), 0, 3)).length).toBe(6);
    const l = ok(ladoCon(rectangulo(0, 0, 2, 2), 0, 3));
    expect(medidaLado(l, 0).largo).toBeCloseTo(3, 9);
    const a = ok(arcoConRadio(rectangulo(0, 0, 2, 2), 0, 1));       // semicírculo hacia afuera (abajo)
    expect(A(a)).toBeCloseTo(4 + Math.PI / 2, 3);
    expect(medidaLado(a, 0).radio).toBeCloseTo(1, 6);
  });
});
describe('todo el contorno', () => {
  it('desfase hacia afuera y hacia adentro', () => {
    expect(A(ok(desfasarAnillo(rectangulo(0, 0, 2, 2), 0.5)))).toBeCloseTo(9, 9);
    expect(A(ok(desfasarAnillo(rectangulo(0, 0, 2, 2), -0.5)))).toBeCloseTo(1, 9);
    expect(A(ok(desfasarAnillo(circulo(0, 0, 1), 0.5)))).toBeCloseTo(Math.PI * 2.25, 3);
    expect('error' in desfasarAnillo(rectangulo(0, 0, 2, 2), -1.5)).toBe(true);
  });
  it('simetría, giro y escala conservan o escalan el área', () => {
    const vs = ok(empalme(rectangulo(0, 0, 2, 2), 1, 0.5));
    expect(A(espejarAnillo(vs, 'x', { x: 3, y: 0 }))).toBeCloseTo(A(vs), 6);
    expect(A(girarAnillo(vs, 37, { x: 0, y: 0 }))).toBeCloseTo(A(vs), 3);
    expect(A(escalarAnillo(vs, 2, { x: 0, y: 0 }))).toBeCloseTo(4 * A(vs), 3);
  });
  it('rastreo polar de a 15°', () => {
    const q = polar15({ x: 0, y: 0 }, { x: 1, y: 0.27 });
    expect(Math.atan2(q.y, q.x) * 180 / Math.PI).toBeCloseTo(15, 2);
  });
});
