import { describe, expect, it } from 'vitest';
import { armarPiezas, imanar, muroDesdeTramo, seTocan } from './dibujo';
import { ejemploGuia } from './modelo';

describe('dibujar muros y armar piezas', () => {
  const p = ejemploGuia();
  it('el imán pega al extremo de un muro y si no a la grilla', () => {
    expect(imanar({ x: -9.8, y: 8.1 }, p.muros)).toMatchObject({ a: 'extremo', p: { x: -9.9, y: 8 } });
    expect(imanar({ x: 1.23, y: 1.27 }, p.muros)).toMatchObject({ a: 'grilla', p: { x: 1.25, y: 1.25 } });
    expect(imanar({ x: -6.3, y: 0.52 }, p.muros)).toMatchObject({ a: 'eje', p: { x: -6.4, y: 0.5 } });
  });
  it('dos clics hacen un tabique horizontal o vertical', () => {
    expect(muroDesdeTramo({ x: 0, y: 0 }, { x: 4, y: 0.3 })).toEqual({ dir: 'X', x: 2, y: 0, largo: 4, espesor: 0.2 });
    expect(muroDesdeTramo({ x: 1, y: -2 }, { x: 1.2, y: 3 })).toEqual({ dir: 'Y', x: 1, y: 0.5, largo: 5, espesor: 0.2 });
    expect(muroDesdeTramo({ x: 0, y: 0 }, { x: 0.05, y: 0 })).toBeNull();
  });
  it('arma las piezas del ejemplo de la guía como están cargadas', () => {
    const sin = p.muros.map(m => ({ ...m, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '' }));
    const out = armarPiezas(sin);
    const grupo = (id: string) => out.find(m => m.id === id)!;
    // M5, M6 y M7 se tocan: una pieza; M6 y M7 son alas de M5 en el viento A; en B, M5 es ala de M6
    expect(seTocan(grupo('M5'), grupo('M6'))).toBe(true);
    expect(grupo('M6').piezaA).toBe(grupo('M5').piezaA);
    expect(grupo('M6').pegadoA).toBe('M5');
    expect(grupo('M5').pegadoB).toBe('M6');
    expect(grupo('M5').piezaB).toBe(`${grupo('M5').piezaA}B`);
    // M1 queda sola y distinta de M2
    expect(grupo('M1').piezaA).not.toBe(grupo('M2').piezaA);
    expect(new Set(out.map(m => m.piezaA)).size).toBe(6);
  });
  it('respeta los nombres que ya tenía cada pieza', () => {
    const out = armarPiezas(p.muros);
    out.forEach((m, i) => { expect(m.piezaA).toBe(p.muros[i].piezaA); expect(m.piezaB).toBe(p.muros[i].piezaB); });
  });
});

import { agrupar, desagrupar, espejarGrupo, girarGrupo, moverGrupo } from './dibujo';
describe('grupos de muros', () => {
  const p = ejemploGuia();
  it('agrupar T5 (M5, M6, M7): misma pieza en los dos vientos y las alas pegadas a su alma', () => {
    const { muros, grupo } = agrupar(p.muros, ['M5', 'M6', 'M7']);
    expect(grupo).toBe('T5');
    const g = muros.filter(m => m.grupo === 'T5');
    expect(g).toHaveLength(3);
    expect(g.every(m => m.piezaA === 'T5' && m.piezaB === 'T5B')).toBe(true);
    expect(g.find(m => m.id === 'M6')!.pegadoA).toBe('M5');
    expect(g.find(m => m.id === 'M5')!.pegadoB).toBe('M6');
  });
  it('mover, girar 90° y espejar mueven el grupo entero; desagrupar lo deja suelto', () => {
    let ms = agrupar(p.muros, ['M5', 'M6', 'M7']).muros;
    ms = moverGrupo(ms, 'T5', 1, 0.5);
    expect(ms.find(m => m.id === 'M5')).toMatchObject({ x: -5.4, y: 0.5 });
    expect(ms.find(m => m.id === 'M1')).toMatchObject({ x: -9.9 });         // los de afuera no se mueven
    const g = girarGrupo(ms, 'T5');
    expect(g.find(m => m.id === 'M5')!.dir).toBe('X');
    expect(g.find(m => m.id === 'M6')!.pegadoB).toBe('M5');                 // ahora M5 es alma en el viento B
    const e = espejarGrupo(ms, 'T5', 'x');
    const c5 = ms.find(m => m.id === 'M5')!.x, c6 = ms.find(m => m.id === 'M6')!.x;
    expect(e.find(m => m.id === 'M5')!.x - e.find(m => m.id === 'M6')!.x).toBeCloseTo(-(c5 - c6), 6);
    expect(desagrupar(ms, 'T5').some(m => m.grupo)).toBe(false);
  });
});
