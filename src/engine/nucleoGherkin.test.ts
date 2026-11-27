/** El núcleo del Gherkin relevado en las plantas de Foster (docs/gherkin-nucleo) y cargado en el ejemplo. */
import { describe, expect, it } from 'vitest';
import { ejemploGherkin } from './ejemplosExo';
import { propiedades, perfilDeMuro } from './perfil';
import { calcularProyecto } from '../ui/estado';
import { ExoDeCalculo } from './exoDeCalculo';

describe('núcleo del Gherkin', () => {
  const p = ejemploGherkin();
  const col = p.muros.filter(m => /^(R\d+|D|S|P)-/.test(m.id)), mur = p.muros.filter(m => !col.includes(m));
  it('22 columnas de 0,70 × 0,70 (11 por lado, en espejo) que llevan solo carga vertical', () => {
    expect(col.length).toBe(22);
    col.forEach(m => { expect(Math.abs(propiedades(perfilDeMuro(m)).A)).toBeCloseTo(0.49, 3); expect(m.soloGravedad).toBe(true); });
    col.filter(m => m.id.endsWith('-O')).forEach(m => {
      const e = col.find(q => q.id === m.id.replace(/-O$/, '-E'))!;
      expect(e.x).toBeCloseTo(-m.x, 3); expect(e.y).toBeCloseTo(m.y, 3);
    });
    // el anillo: 16 columnas a 12,3 m del centro
    expect(col.filter(m => m.id.startsWith('R')).map(m => Math.hypot(m.x, m.y)).every(r => Math.abs(r - 12.3) < 0.05)).toBe(true);
  });
  it('todo llega a la losa del 38º; solo D y S siguen a la del 39º; nada al 40º', () => {
    const z38 = 38 * 4.15, z39 = 39 * 4.15;
    p.muros.forEach(m => expect(m.zHasta).toBeCloseTo(/^(D|S)-/.test(m.id) ? z39 : z38, 2));
    expect(p.muros.filter(m => /^(D|S)-/.test(m.id)).length).toBe(4);
  });
  it('los muros forman una pieza por mitad y por viento, y quedan dentro de la losa del 38º', () => {
    expect(new Set(mur.map(m => m.piezaA))).toEqual(new Set(['Núcleo O', 'Núcleo E']));
    expect(new Set(mur.map(m => m.piezaB))).toEqual(new Set(['Núcleo O B', 'Núcleo E B']));
    const r38 = 30.1 / 2; // diámetro de la piel en el 38º (perfil del ejemplo)
    p.muros.forEach(m => perfilDeMuro(m).v.forEach(q => expect(Math.hypot(q.x, q.y)).toBeLessThan(Math.min(r38, 13.25))));
  });
  it('con el método CIRSOC no hay nada que no verifique', () => {
    const c = calcularProyecto(p), ex = new ExoDeCalculo(p, c, 'cirsoc');
    expect([...c.controles, ...ex.controles()].filter(x => x.estado === 'no verifica').map(x => x.nombre)).toEqual([]);
  });
});
