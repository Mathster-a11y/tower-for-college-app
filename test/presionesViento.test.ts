/**
 * Simulador de viento, etapa V1: las presiones que se pintan sobre la torre salen de los mismos números que el método.
 * En cada nivel, (barlovento − sotavento) · ancho · h de influencia = W del nivel; integradas sobre una planta
 * rectangular, las caras dan la fuerza del caso (las laterales se anulan); y la torsión de los casos 2 y 4 es la del
 * 102-25.
 */
import { describe, expect, it } from 'vitest';
import { ejemploGuia, type Proyecto } from '../src/engine/modelo';
import { torresPrueba } from '../src/engine/torresPrueba';
import { viento102, KN_POR_T } from '../src/engine/cargas/cirsoc102';
import { calcularProyecto } from '../src/ui/estado';
import { factoresCaso, fuerzaFranja, mapaCirsoc, mapaPlanilla, rolDeCara, type Caso } from '../src/viento/presiones';

const torres = [ejemploGuia(), ...torresPrueba()];
const cerca = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

describe.each(torres.map(p => ({ p, nombre: p.nombre })))('presiones del 102-25 · $nombre', ({ p }) => {
  const w = viento102(p), m = mapaCirsoc(p, w);
  it('cada franja suma la fuerza del nivel', () => {
    for (const d of ['A', 'B'] as const) {
      const vd = m[d]!, nd = w[d];
      expect(vd.bandas.length).toBe(nd.niveles.length);
      vd.bandas.forEach((b, i) => {
        cerca(((b.barlovento - b.sotavento) * b.ancho * b.hInf) / 1000 / KN_POR_T, nd.niveles[i].W);
        expect(b.z0).toBeLessThan(b.z1);
        expect(b.barlovento).toBeGreaterThan(0); expect(b.sotavento).toBeLessThan(0); expect(b.lateral!).toBeLessThan(0);
      });
    }
  });
  it('integradas sobre una planta rectangular dan la fuerza de cada caso', () => {
    const bA = m.A!.bandas, bB = m.B!.bandas;
    bA.forEach((ba, i) => {
      const bb = bB[i], X = ba.ancho / 2, Y = bb.ancho / 2;
      const rect = [{ x: -X, y: -Y }, { x: X, y: -Y }, { x: X, y: Y }, { x: -X, y: Y }];
      for (const dir of ['A', 'B'] as const) for (const caso of [1, 2, 3, 4] as Caso[]) {
        const f = factoresCaso(caso, dir), F = fuerzaFranja(m, caso, dir, rect, dir === 'A' ? ba : bb);
        // la franja del otro viento tiene la misma h de influencia (mismo nivel): las dos fuerzas se pueden comparar
        cerca(F.Fy, f.A.f * ba.W, 1e-9); cerca(F.Fx, f.B.f * bb.W, 1e-9);
      }
    });
  });
  it('la torsión de los casos 2 y 4 es la del 102-25', () => {
    for (const dir of ['A', 'B'] as const) {
      const vd = m[dir]!, c2 = factoresCaso(2, dir)[dir], c4 = factoresCaso(4, dir)[dir];
      const Mt = (f: { f: number; e: number }) => vd.bandas.reduce((s, b) => s + f.f * b.W * f.e * vd.B, 0);
      cerca(Mt(c2), dir === 'A' ? w.casos[1].MtA : w.casos[1].MtB, 1e-9);
      cerca(Mt(c4), dir === 'A' ? w.casos[3].MtA : w.casos[3].MtB, 1e-9);
    }
  });
});

describe('presiones de la planilla y la guía (102-2005)', () => {
  it('barlovento y sotavento son los de la hoja del viento, nivel por nivel', () => {
    const p: Proyecto = { ...ejemploGuia(), calculo: { metodo: 'planilla', version: 'actual', armado: 'catedra' } };
    const c = calcularProyecto(p), R = c.valores;
    const m = mapaPlanilla(p, R, c.asig.filaNivel, 'planilla');
    expect(m.casos).toBe(false);
    const bandas = m.A!.bandas;
    expect(bandas.length).toBeGreaterThan(10);
    bandas.forEach(b => {
      const j = p.niveles.findIndex(n => n.nombre === b.nivel && n.cota === b.cota), k = c.asig.filaNivel[j];
      cerca(b.barlovento - b.sotavento, R.viento.R[k]);
      expect(b.lateral).toBeNull();
    });
  });
});

describe('papel de cada cara', () => {
  it('±45° alrededor del viento', () => {
    expect(rolDeCara(0, -1, 'A')).toBe('barlovento'); expect(rolDeCara(0, 1, 'A')).toBe('sotavento'); expect(rolDeCara(1, 0, 'A')).toBe('lateral');
    expect(rolDeCara(-1, 0, 'B')).toBe('barlovento'); expect(rolDeCara(1, 0, 'B')).toBe('sotavento'); expect(rolDeCara(0, 1, 'B')).toBe('lateral');
    expect(rolDeCara(-0.6, -0.8, 'A')).toBe('barlovento'); expect(rolDeCara(-0.8, -0.6, 'A')).toBe('lateral');
  });
});
