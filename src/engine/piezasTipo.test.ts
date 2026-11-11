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

import { rehacerPieza, centroCaja } from './piezasTipo';
import { girarGrupo, espejarGrupo } from './dibujo';
describe('medidas por parte y rehacer una pieza ubicada', () => {
  const armar = (tipo: Parameters<typeof piezaTipo>[0], med: Parameters<typeof piezaTipo>[1]) => {
    const ms = piezaTipo(tipo, med, 3, 2, new Set(['M1']));
    return agrupar([{ id: 'M1', dir: 'Y', x: -9, y: 0, largo: 4, espesor: 0.2, llega: true, areaInf: 10, piezaA: 'T1', pegadoA: '', piezaB: 'T1B', pegadoB: '' }, ...ms], ms.map(m => m.id)).muros;
  };
  const pos = (ms: { id: string; x: number; y: number; dir: string; largo: number; espesor: number }[]) => ms.map(m => `${m.id} ${m.dir} ${m.x.toFixed(3)} ${m.y.toFixed(3)} ${m.largo.toFixed(3)} ${m.espesor.toFixed(3)}`).sort();
  it('una C con alas distintas: cada parte con su ancho y su espesor', () => {
    const ms = piezaTipo('C', { h: 5, b: 2, e: 0.2, giro: 0, bS: 3, eS: 0.3, bI: 1.5 }, 0, 0, new Set());
    expect(ms.map(m => [m.dir, m.largo, m.espesor])).toEqual([['Y', 4.5, 0.2], ['X', 3, 0.3], ['X', 1.5, 0.2]]);
    expect(ms.every(m => m.pieza?.tipo === 'C')).toBe(true);
  });
  it('rehacer con otras medidas conserva ids, grupo y centro', () => {
    const ms = armar('L', { h: 4, b: 2, e: 0.2, giro: 0 });
    const g = ms.find(m => m.pieza)!.grupo!;
    const c0 = centroCaja(ms.filter(m => m.grupo === g));
    const r = rehacerPieza(ms, g, { h: 6, b: 3, e: 0.25, giro: 0 });
    const nuevos = r.filter(m => m.grupo === g);
    expect(nuevos.map(m => m.id)).toEqual(ms.filter(m => m.grupo === g).map(m => m.id));
    expect(centroCaja(nuevos)).toEqual(c0);
    expect(nuevos.find(m => m.dir === 'X')!.largo).toBe(3);
    expect(r.find(m => m.id === 'M1')!.x).toBe(-9);
  });
  it('después de girar o espejar el grupo, rehacer con las mismas medidas no cambia nada', () => {
    for (const paso of ['giro', 'x', 'y', 'giro+x'] as const) {
      let ms = armar('C', { h: 5, b: 2, e: 0.2, giro: 0, bS: 3, bI: 1.5 });
      const g = ms.find(m => m.pieza)!.grupo!;
      if (paso.startsWith('giro')) ms = girarGrupo(ms, g);
      if (paso.endsWith('x')) ms = espejarGrupo(ms, g, 'x');
      if (paso === 'y') ms = espejarGrupo(ms, g, 'y');
      const med = ms.find(m => m.grupo === g)!.pieza!.med;
      const r = rehacerPieza(ms, g, med);
      expect(pos(r.filter(m => m.grupo === g))).toEqual(pos(ms.filter(m => m.grupo === g)));
    }
  });
});
import { problemaMedidas } from './piezasTipo';
describe('medidas que no arman la pieza', () => {
  it('rechaza un alma más gruesa que el ala o alas que no entran', () => {
    expect(problemaMedidas('C', { h: 4, b: 2, e: 0.2, giro: 0 })).toBeNull();
    expect(problemaMedidas('C', { h: 4, b: 2, e: 0.2, giro: 0, eA: 3 })).toMatch(/más ancha/);
    expect(problemaMedidas('doble T', { h: 1, b: 2, e: 0.2, giro: 0, eS: 0.5, eI: 0.6 })).toMatch(/no entran/);
    expect(problemaMedidas('columna', { h: 0.6, b: 0, e: 0.4, giro: 0 })).toMatch(/mitad/);
  });
});
