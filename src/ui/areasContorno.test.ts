import { describe, expect, it } from 'vitest';
import { areasInfluencia } from '../engine/areas';
import { ejemploGuia } from '../engine/modelo';
import { ejemploGherkin } from '../engine/ejemplosExo';
import { dibujoAreas } from './areasContorno';

describe('áreas de influencia lisas', () => {
  it('el borde entre dos muros paralelos cae en el medio exacto, no en un escalón de la cuadrícula', () => {
    const p = ejemploGuia();
    const a = areasInfluencia(p, p.niveles.length - 2);
    const i1 = a.ids.indexOf('M1'), i2 = a.ids.indexOf('M2');
    const m1 = p.muros.find(m => m.id === 'M1')!, m2 = p.muros.find(m => m.id === 'M2')!;
    // sobre la recta y = m1.y, entre las caras de M1 y M2, el borde queda a igual distancia de los dos
    const xc = (m1.x + m2.x) / 2;
    const t = a.corte!(i1, { x: xc - 0.13, y: m1.y }, i2, { x: xc + 0.12, y: m1.y });
    expect(xc - 0.13 + t * 0.25).toBeCloseTo(xc, 6);
  });
  it('dibuja una región por grupo, con el recorte de la losa, en una planta grande', () => {
    const p = ejemploGherkin();
    const a = areasInfluencia(p, p.niveles.length - 2);
    const claves = a.ids.map(id => id);
    const d = dibujoAreas(a, claves, x => x * 10, y => -y * 10);
    expect(d.regiones.size).toBe(new Set(claves.filter((_, i) => a.duenio.includes(i))).size);
    expect(d.recorte.startsWith('M')).toBe(true);
    expect(d.bordes.length).toBeGreaterThan(100);
  });
});
