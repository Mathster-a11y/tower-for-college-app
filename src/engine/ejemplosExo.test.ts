/** Los cuatro edificios reales: entran en la planilla, los módulos caen en niveles y el exo dimensionado verifica. */
import { describe, expect, it } from 'vitest';
import { ejemploCiticorp, type Proyecto } from './modelo';
import { ejemploHancock, ejemploHearst, ejemploOnterie } from './ejemplosExo';
import { aPlanilla } from './mapping';
import { calcularPlanilla } from './planilla';
import { datosAltura, E_DE_DIVISOR, rigidez, rigidezPorNivel } from './diagramas';
import { plantaDeNivel } from './silueta';
import { calcularExo } from './exo';

function exo(p: Proyecto, dir: 'A' | 'B') {
  const asig = aPlanilla(p), R = calcularPlanilla(asig.datos), def = p.exo!;
  const alt = datosAltura(p, R.viento, R.mnyq, asig.filaNivel, dir);
  const sobre = alt.filter(x => x.z > 1e-6).sort((a, b) => a.z - b.z);
  const zs = [0, ...sobre.map(x => x.z)], W = sobre.map(x => x.F);
  const rg = rigidez(R, p.hormigon || 'H30').find(x => x.dir === dir)!;
  const E = E_DE_DIVISOR((rg.W * rg.h * rg.h) / rg.minimos.h500);
  const Jniv = rigidezPorNivel(p, asig.piezas, dir, rg.J).sort((a, b) => a.z - b.z);
  const EJ = (z: number) => E * (Jniv.find(q => q.z >= z - 1e-6)?.J ?? rg.J);
  const iPB = p.niveles.findIndex(n => n.cota === 0), pl = plantaDeNivel(p, iPB), A = dir === 'A';
  const ancho = (A ? pl.L : pl.B) + 2 * def.separacion, t = (A ? pl.B : pl.L) / 2 + def.separacion;
  const anchos = def.anchoVariable ? zs.map(z => { const q = plantaDeNivel(p, p.niveles.findIndex(n => Math.abs(n.cota - z) < 1e-6)); return (A ? q.L : q.B) + 2 * def.separacion; }) : undefined;
  return { r: calcularExo(def, zs, W, EJ, ancho, [-t, t], E, anchos), zs, asig };
}

describe('edificios reales con exoesqueleto', () => {
  [ejemploCiticorp(), ejemploHancock(), ejemploHearst(), ejemploOnterie()].forEach(p => describe(p.nombre, () => {
    it('entra en la planilla (≤ 49 niveles sobre PB) y cada módulo cae en un nivel', () => {
      const asig = aPlanilla(p);
      expect(p.niveles.filter(n => n.cota > 0).length).toBeLessThanOrEqual(49);
      expect(asig.avisos.some(a => a.includes('49 niveles'))).toBe(false);
      (p.exo!.cortes ?? []).forEach(z => expect(p.niveles.some(n => Math.abs(n.cota - z) < 1e-3)).toBe(true));
      expect(p.exo!.notas!.length).toBeGreaterThan(3);
    });
    it('con las secciones del ejemplo: equilibrio, flecha ≤ h/500 y todas las barras verifican, con los dos vientos', () => {
      (['A', 'B'] as const).forEach(dir => {
        const { r, zs } = exo(p, dir);
        r.u.forEach(x => expect(isFinite(x)).toBe(true));
        expect(r.u[r.u.length - 1]).toBeLessThanOrEqual(zs[zs.length - 1] / 500);
        expect(r.controles.filter(c => c.estado !== 'verifica').map(c => c.id)).toEqual([]);
      });
    });
  }));
  it('Citicorp y Hancock: el núcleo no toma viento y el exo se lleva todo el momento', () => {
    [ejemploCiticorp(), ejemploHancock()].forEach(p => {
      expect(p.muros.find(m => m.id === 'N1')!.piezaA).toBe('');
      expect(exo(p, 'A').r.fraccionExo).toBeCloseTo(1, 3);
    });
  });
});
