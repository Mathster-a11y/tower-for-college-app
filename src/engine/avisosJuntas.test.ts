/** Juntas abiertas y muros que no entran en un viento por un nombre de pieza distinto (la caja M53–M56 del usuario). */
import { describe, expect, it } from 'vitest';
import { ejemploGuia, type Muro } from './modelo';
import { avisosDiseno } from './avisos';
import { calcularProyecto } from './calculoProyecto';

const caja = (hueco: number, piezaA: (id: string) => string): Muro[] => {
  const m = (id: string, dir: 'X' | 'Y', x: number, y: number, largo: number): Muro => ({ id, dir, x, y, largo, espesor: 0.35, llega: true, areaInf: 10, piezaA: piezaA(id), pegadoA: '', piezaB: 'K1B', pegadoB: '', gd: 'G9' });
  // M53 arriba y M55 abajo (dir X); M54 y M56 entre sus caras, cortos «hueco» en cada punta
  return [m('C53', 'X', -5.4, 9, 7.56), m('C55', 'X', -5.4, -1.79, 7.56), m('C54', 'Y', -1.8, 3.605, 10.44 - 2 * hueco), m('C56', 'Y', -9, 3.605, 10.44 - 2 * hueco)];
};

describe('avisos de juntas y de piezas partidas entre vientos', () => {
  it('una caja con juntas de 4 cm y piezas sueltas en el viento A: los dos avisos', () => {
    const p = ejemploGuia();
    p.calculo = { ...(p.calculo ?? {}), metodo: 'planilla', armado: 'catedra' } as typeof p.calculo;
    p.muros.push(...caja(0.04, id => `K${id}`));
    const c = calcularProyecto(p), av = avisosDiseno(p, c.asig.papeles);
    expect(av.filter(a => a.tipo === 'junta-abierta').length).toBe(4);
    const uv = av.filter(a => a.tipo === 'sin-pieza-un-viento');
    expect(uv.map(a => a.muro).sort()).toEqual(['C53', 'C55']);
    expect(uv[0].texto).toMatch(/no entra en el viento A/);
  });
  it('la caja cerrada y en una sola pieza en los dos vientos: sin avisos', () => {
    const p = ejemploGuia();
    p.calculo = { ...(p.calculo ?? {}), metodo: 'planilla', armado: 'catedra' } as typeof p.calculo;
    p.muros.push(...caja(0, () => 'K1'));
    const c = calcularProyecto(p), av = avisosDiseno(p, c.asig.papeles);
    expect(av.filter(a => a.tipo === 'junta-abierta' || a.tipo === 'sin-pieza-un-viento')).toEqual([]);
    ['C53', 'C55'].forEach(id => expect(c.asig.papeles[id].A).not.toBe('sin pieza'));
  });
});
