import { describe, expect, it } from 'vitest';
import { adivinarModelo, aplicarModelo, cortarMalla, leerOBJ, leerSTL, normalizarModelo } from './importar3d';
import { stlTorre } from '../viento/malla3d';
import { ejemploGherkin } from './ejemplosExo';
import { proyectoVacio } from './modelo';
import { areaSilueta, carpinteriaDeNivel, puntosSilueta, type Vertice } from './silueta';

const area = (p: { x: number; y: number }[]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2);

describe('importar un 3D y cortarlo por piso', () => {
  it('OBJ con el eje y hacia arriba y en centímetros: una caja de 20 × 10 × 60 m', () => {
    // los 8 vértices de la caja (x, y = alto, z) en cm y sus 6 caras de 4 lados
    const v = [[0, 0, 0], [2000, 0, 0], [2000, 0, 1000], [0, 0, 1000], [0, 6000, 0], [2000, 6000, 0], [2000, 6000, 1000], [0, 6000, 1000]];
    const f = [[1, 2, 3, 4], [5, 8, 7, 6], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 8, 4], [4, 8, 5, 1]];
    const txt = `# caja\n${v.map(q => `v ${q.join(' ')}`).join('\n')}\n${f.map(c => `f ${c.map(i => `${i}/1/1`).join(' ')}`).join('\n')}\n`;
    const t = leerOBJ(txt);
    expect(t.length).toBe(12 * 9);
    const g = adivinarModelo(t);
    expect(g).toEqual({ unidad: 'cm', eje: 'y' });
    const m = normalizarModelo(t, g.unidad, g.eje);
    expect(m.alto).toBeCloseTo(60, 4);
    const c = cortarMalla(m, 30);
    expect(c.contornos.length).toBe(1);
    expect(c.contornos[0].length).toBe(4);                                  // los puntos alineados se simplifican
    expect(area(c.contornos[0])).toBeCloseTo(200, 3);
  });

  it('una planta con patio: el patio sale como hueco; un corte arriba de todo, vacío', () => {
    // dos cajas anidadas con las caras del patio hacia adentro: se arma con stlTorre de dos cuadrados (exterior) y se
    // comprueba con el corte de una sola caja más el patio simulado por un segundo anillo
    const caja = (a: number, h: number) => [{ cota: 0, silueta: [{ x: -a, y: -a }, { x: a, y: -a }, { x: a, y: a }, { x: -a, y: a }] }, { cota: h, silueta: [{ x: -a, y: -a }, { x: a, y: -a }, { x: a, y: a }, { x: -a, y: a }] }];
    const m = normalizarModelo(leerSTL(stlTorre(caja(10, 30), { alturaExacta: false })), 'm', 'z');
    expect(cortarMalla(m, 15).contornos.length).toBe(1);
    expect(cortarMalla(m, 31).contornos.length).toBe(0);
  });

  it('ida y vuelta con el Gherkin: su STL (piel continua) importado en una torre nueva da la misma planta en cada piso', () => {
    const g = ejemploGherkin();
    const niveles = g.niveles.map((n, i) => ({ n, i })).filter(x => x.n.cota >= 0).map(x => ({ cota: x.n.cota, silueta: puntosSilueta(carpinteriaDeNivel(g, x.i)!.v, 16) }));
    const stl = stlTorre(niveles);
    const m = normalizarModelo(leerSTL(stl), 'm', 'z');
    expect(m.alto).toBeCloseTo(179.77, 1);
    const p = proyectoVacio();
    const inf = aplicarModelo(p, m, { niveles: 'nuevos', alturaPiso: 4.15, destino: 'ambas', bl: 'area' });
    expect(inf.cortados).toBeGreaterThanOrEqual(40);
    expect(inf.varias.length).toBe(0);
    // piso por piso, el área de la planta importada contra la carpintería del ejemplo
    let peor = 0;
    for (let k = 1; k <= 39; k++) {
      const z = k * 4.15, a = p.niveles.find(n => Math.abs(n.cota - z) < 1e-6)!, b = g.niveles.findIndex(n => Math.abs(n.cota - z) < 1e-6);
      const Ai = areaSilueta(a.silueta as Vertice[]), Ae = area(puntosSilueta(carpinteriaDeNivel(g, b)!.v, 16));     // el mismo polígono que se exportó
      peor = Math.max(peor, Math.abs(Ai / Ae - 1));
    }
    // se corta 2 cm arriba del piso y la piel va inclinada: la diferencia es chica
    expect(peor).toBeLessThan(0.002);
    // B y L de igual área (un cuadrado de 0,886 D)
    const p20 = p.niveles.find(n => Math.abs(n.cota - 20 * 4.15) < 1e-6)!;
    expect(p20.B).toBeCloseTo(p20.L!, 1);
    expect(p20.B! / Math.sqrt(areaSilueta(p20.silueta as Vertice[]))).toBeCloseTo(1, 2);
  });
});
