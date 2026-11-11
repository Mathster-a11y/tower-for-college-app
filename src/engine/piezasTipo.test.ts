import { describe, expect, it } from 'vitest';
import { piezaTipo } from './piezasTipo';
import { Jreal } from './mapping';
import { proyectoVacio } from './modelo';
import { agrupar } from './dibujo';
import { aPlanilla } from './mapping';

const med = { h: 6, b: 3, e: 0.2, giro: 0 as const };

describe('biblioteca de piezas tipo', () => {
  it('tabique: J = e·h³/12 en el viento A y h·e³/12 en el B', () => {
    const ms = piezaTipo('tabique', med, 0, 0, new Set());
    expect(Jreal(ms, 'A')).toBeCloseTo((0.2 * 6 ** 3) / 12, 6);
    expect(Jreal(ms, 'B')).toBeCloseTo((6 * 0.2 ** 3) / 12, 6);
  });
  it('doble T: J de manual (alma libre + dos alas con Steiner) y el molde de la hoja da lo mismo', () => {
    const ms = piezaTipo('doble T', med, 2, 3, new Set());
    const hw = 6 - 2 * 0.2, d = 3 - 0.1;
    const J = (0.2 * hw ** 3) / 12 + 2 * ((3 * 0.2 ** 3) / 12 + 3 * 0.2 * d ** 2);
    expect(Jreal(ms, 'A')).toBeCloseTo(J, 6);
    const p = proyectoVacio();
    p.muros = agrupar(ms, ms.map(m => m.id)).muros;
    const pz = aPlanilla(p).piezas.find(x => x.dir === 'A')!;
    expect(pz.molde).toBe('simétrico');
    expect(pz.Jhoja!).toBeCloseTo(pz.Jreal!, 6);
  });
  it('C, L, T y U: la hoja da el J real (molde asimétrico) en el viento A', () => {
    for (const t of ['C', 'L', 'T', 'U'] as const) {
      const ms = piezaTipo(t, med, 0, 0, new Set());
      const p = proyectoVacio();
      p.muros = agrupar(ms, ms.map(m => m.id)).muros;
      const pz = aPlanilla(p).piezas.find(x => x.dir === 'A')!;
      expect(pz.Jhoja!, t).toBeCloseTo(pz.Jreal!, 4);
    }
  });
  it('girar 90° intercambia los vientos', () => {
    const a = piezaTipo('C', med, 0, 0, new Set()), b = piezaTipo('C', { ...med, giro: 90 }, 0, 0, new Set());
    expect(Jreal(b, 'B')).toBeCloseTo(Jreal(a, 'A'), 6);
    expect(Jreal(b, 'A')).toBeCloseTo(Jreal(a, 'B'), 6);
  });
  it('el centro de la caja queda en el punto de inserción y los ids no se repiten', () => {
    const usados = new Set(['M1', 'M2']);
    const ms = piezaTipo('L', med, 5, -2, usados);
    expect(ms.map(m => m.id)).toEqual(['M3', 'M4']);
    const xs = ms.flatMap(m => (m.dir === 'X' ? [m.x - m.largo / 2, m.x + m.largo / 2] : [m.x - m.espesor / 2, m.x + m.espesor / 2]));
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(5, 6);
  });
});
