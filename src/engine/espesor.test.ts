import { describe, expect, it } from 'vitest';
import { ejemploGuia, espesorEn, factorPesoEspesor, muroEn } from './modelo';
import { aPlanilla } from './mapping';
import { rigidezPorNivel } from './diagramas';
import { pesoMuro } from './flexocompresion';

describe('espesor de los muros por tramos de altura', () => {
  it('espesorEn: el de PB abajo, el del tramo desde su cota hacia arriba', () => {
    const m = { ...ejemploGuia().muros[0], espesor: 0.3, espesores: [{ desde: 30, e: 0.2 }, { desde: 12, e: 0.25 }] };
    expect(espesorEn(m, 5)).toBe(0.3); expect(espesorEn(m, 12)).toBe(0.3); expect(espesorEn(m, 12.5)).toBe(0.25);
    expect(espesorEn(m, 31)).toBe(0.2); expect(muroEn(m, 40).espesor).toBe(0.2);
  });
  it('peso propio: Σ A·Δz con cada espesor (tabique: proporcional al espesor)', () => {
    const m = { ...ejemploGuia().muros[0], espesor: 0.4, espesores: [{ desde: 20, e: 0.2 }] };
    // de 0 a 40: 20 m con 0,4 y 20 m con 0,2 → 0,75 del de sección constante
    expect(factorPesoEspesor(m, 0, 40)).toBeCloseTo(0.75, 12);
    const p = ejemploGuia(); const sin = pesoMuro(p, p.muros[0]).Pp;
    p.muros[0].espesores = [{ desde: p.niveles[10].cota, e: p.muros[0].espesor / 2 }];
    expect(pesoMuro(p, p.muros[0]).Pp).toBeLessThan(sin);
  });
  it('J por nivel: baja arriba del cambio de espesor y la planilla (PB) no cambia', () => {
    const p = ejemploGuia(), asig = aPlanilla(p);
    const antes = rigidezPorNivel(p, asig.piezas, 'A', 10);
    const zc = p.niveles[10].cota;
    p.muros.forEach(m => { m.espesores = [{ desde: zc, e: m.espesor / 2 }]; });
    const despues = rigidezPorNivel(p, aPlanilla(p).piezas, 'A', 10);
    const pb = (r: typeof antes) => r.reduce((a, b) => (a.z < b.z ? a : b));
    expect(pb(despues).J).toBeCloseTo(pb(antes).J, 9);
    despues.forEach((q, i) => {
      if (q.z > zc + 0.02) expect(q.J).toBeLessThan(antes[i].J * 0.99);
      else expect(q.J).toBeCloseTo(antes[i].J, 9);
    });
  });
});
