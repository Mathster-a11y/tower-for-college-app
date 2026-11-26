import { describe, expect, it } from 'vitest';
import { circulo, patronPolar, rectangulo, areaConSigno } from './contorno';
import { ejemploGherkin } from './ejemplosExo';
import { areaSilueta, puntosSilueta, type Vertice } from './silueta';

describe('patrón polar (pozos de luz, muescas, balcones repetidos)', () => {
  it('los pozos del Gherkin en un círculo: 6 triángulos de nudo a nudo, punta al 63 % del radio, arcos exactos entre ellos', () => {
    const R = 27;
    const r = patronPolar(circulo(0, 0, R), { n: 6, ancho: 2 * R * Math.sin((10 * Math.PI) / 180), prof: 0.37 * R, forma: 'triangulo', tipo: 'entrante', angulo0: 10 });
    if ('error' in r) throw new Error(r.error);
    expect(r.length).toBe(18);                                         // 3 vértices por pozo
    expect(r.filter(v => v.b).length).toBe(6);                         // los 6 arcos entre pozos
    const apice = r[1];
    expect(Math.hypot(apice.x, apice.y)).toBeCloseTo(0.63 * R, 3);
    expect((Math.atan2(apice.y, apice.x) * 180) / Math.PI).toBeCloseTo(10, 3);
    // el mismo contorno que el ejemplo hecho a mano (la losa del piso 0 rotada: el ejemplo gira 5° por piso)
    const ej = ejemploGherkin().niveles.find(n => Math.abs(n.cota - 2 * 4.15) < 1e-6)!;     // piso 2: centro de los pozos en 20°
    const r2 = patronPolar(circulo(0, 0, Math.hypot((ej.silueta as Vertice[])[0].x, (ej.silueta as Vertice[])[0].y)), { n: 6, ancho: 2 * Math.hypot((ej.silueta as Vertice[])[0].x, (ej.silueta as Vertice[])[0].y) * Math.sin((10 * Math.PI) / 180), prof: 0.37 * Math.hypot((ej.silueta as Vertice[])[0].x, (ej.silueta as Vertice[])[0].y), forma: 'triangulo', tipo: 'entrante', angulo0: 20 });
    if ('error' in r2) throw new Error(r2.error);
    const Aej = areaSilueta(ej.silueta as Vertice[]), Ap = areaSilueta(r2 as Vertice[]);
    expect(Math.abs(Ap / Aej - 1)).toBeLessThan(0.002);
  });

  it('balcones rectangulares en un cuadrado: suma el área de los balcones; muescas: la resta', () => {
    const base = rectangulo(0, 0, 30, 30), A0 = areaConSigno(base);
    const bal = patronPolar(base, { n: 4, ancho: 6, prof: 2, forma: 'rectangulo', tipo: 'saliente', angulo0: 0 });
    if ('error' in bal) throw new Error(bal.error);
    expect(areaConSigno(bal)).toBeCloseTo(A0 + 4 * 6 * 2, 1);
    const mu = patronPolar(base, { n: 4, ancho: 4, prof: 3, forma: 'rectangulo', tipo: 'entrante', angulo0: 45 });
    if ('error' in mu) throw new Error(mu.error);
    // en las esquinas (45°) el entrante va en diagonal: resta un poco más de 4 × 3 por la forma del borde; menos que el doble
    expect(A0 - areaConSigno(mu)).toBeGreaterThan(4 * 12 * 0.9);
    expect(A0 - areaConSigno(mu)).toBeLessThan(4 * 12 * 2);
    // un contorno de puntos sin arcos
    expect(puntosSilueta(mu as Vertice[], 8).length).toBeGreaterThan(12);
  });

  it('avisa cuando no se puede', () => {
    const c = circulo(0, 0, 10);
    expect('error' in patronPolar(c, { n: 6, ancho: 12, prof: 2, forma: 'triangulo', tipo: 'entrante', angulo0: 0 })).toBe(true);    // se pisan
    expect('error' in patronPolar(c, { n: 3, ancho: 2, prof: 12, forma: 'triangulo', tipo: 'entrante', angulo0: 0 })).toBe(true);    // llega al centro
    // una planta en U (no se ve entera desde el centro)
    const U = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 20, y: 30 }, { x: 20, y: 5 }, { x: 10, y: 5 }, { x: 10, y: 30 }, { x: 0, y: 30 }];
    expect('error' in patronPolar(U, { n: 4, ancho: 2, prof: 1, forma: 'triangulo', tipo: 'entrante', angulo0: 0 })).toBe(true);
  });
});
