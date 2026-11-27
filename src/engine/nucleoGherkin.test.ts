/** El núcleo del Gherkin relevado en las plantas de Foster (docs/gherkin-nucleo) y cargado en el ejemplo. */
import { describe, expect, it } from 'vitest';
import { ejemploGherkin } from './ejemplosExo';
import { propiedades, perfilDeMuro } from './perfil';
import { calcularProyecto } from '../ui/estado';
import { ExoDeCalculo } from './exoDeCalculo';

describe('núcleo del Gherkin', () => {
  const p = ejemploGherkin();
  const col = p.muros.filter(m => /^(R\d+|D|S|P)-/.test(m.id)), mur = p.muros.filter(m => !col.includes(m) && m.llega);
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
  it('la escalera, el ascensor chico, W, D, S y P llegan al 40º (W y B_sup, recortados en el último piso); el resto, al 38º', () => {
    const z38 = 38 * 4.15, z39 = 39 * 4.15, al40 = /^(D|S|P|B_inf|C_ext|C_inf)-/, recortados = /^(W|B_sup)-/;
    p.muros.filter(m => !m.id.includes('·40')).forEach(m => expect(m.zHasta).toBeCloseTo(al40.test(m.id) ? 166 : recortados.test(m.id) ? z39 : z38, 2));
    const tramos40 = p.muros.filter(m => m.id.includes('·40'));
    expect(tramos40.map(m => m.id).sort()).toEqual(['B_sup-E·40', 'B_sup-O·40', 'W-E·40', 'W-O·40']);
    tramos40.forEach(m => {
      expect(m.zDesde).toBeCloseTo(z39, 2); expect(m.zHasta).toBe(166); expect(m.llega).toBe(false);
      perfilDeMuro(m).v.forEach(q => expect(Math.hypot(q.x, q.y)).toBeLessThan(11.43));
    });
    // nada más en el 40º: ni pozos ni ascensores agregados
    expect(p.muros.filter(m => (m.zHasta ?? 0) > z39 + 0.01).length).toBe(6 * 2 + 4);
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
