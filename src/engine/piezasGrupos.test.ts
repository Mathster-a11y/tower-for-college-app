import { describe, expect, it } from 'vitest';
import type { Muro, Proyecto } from './modelo';
import { proyectoVacio } from './modelo';
import { gruposPorPieza, jMuros, sacarDePieza, separarPieza } from './piezasGrupos';
import { agruparNodos, nodoAlTocar } from './grupos';
import { aportes, datosSeccion } from './datosPieza';

const t = (id: string, dir: 'X' | 'Y', x: number, y: number, largo: number, espesor: number, pieza: string, llega = true): Muro =>
  ({ id, dir, x, y, largo, espesor, llega, areaInf: 10, piezaA: pieza, pegadoA: '', piezaB: pieza ? `${pieza}B` : '', pegadoB: '' });

/** una caja como la T1 de la torre de 34 pisos (dos almas en y, dos alas en x), un tabique interior que no llega y dos columnas */
function proyecto(): Proyecto {
  const p = proyectoVacio();
  p.muros = [
    t('M53', 'X', -5.4, 9, 7.56, 0.35, 'T1'), t('M55', 'X', -5.4, -1.79, 7.56, 0.35, 'T1'),
    t('M54', 'Y', -1.8, 3.605, 10.43, 0.35, 'T1'), t('M56', 'Y', -9, 3.605, 10.43, 0.35, 'T1'),
    t('M57', 'X', -7.6, 3.6, 2.3, 0.25, 'T1', false),
    t('M31', 'Y', -16.2, -9, 0.3, 0.3, 'T7'), t('M32', 'Y', -16.2, 9, 0.3, 0.3, 'T8'),
  ];
  // las columnas, cada una en un grupo de un solo muro (como quedaban las piezas insertadas)
  agruparNodos(p, ['M31'], [], null, 'Pieza T7');
  agruparNodos(p, ['M32'], [], null, 'Pieza T8');
  return p;
}

describe('piezas y grupos', () => {
  it('una vez por proyecto: la pieza de varios muros es un grupo y las de un muro no', () => {
    const p = proyecto();
    expect(p.grupos!.length).toBe(2);
    expect(gruposPorPieza(p)).toEqual({ envueltas: 1, sueltas: 2 });
    expect(p.grupos!.map(g => g.nombre)).toEqual(['Pieza T1']);
    const m53 = p.muros.find(m => m.id === 'M53')!, m31 = p.muros.find(m => m.id === 'M31')!;
    expect(nodoAlTocar(p, m53, null)?.t).toBe('g');                 // un clic elige la pieza entera
    expect(nodoAlTocar(p, m31, null)).toEqual({ t: 'm', id: 'M31' }); // la columna, directo
    expect(p.muros.find(m => m.id === 'M57')!.gd).toBe(m53.gd);       // el que no llega va con su pieza
    expect(gruposPorPieza(p)).toEqual({ envueltas: 0, sueltas: 0 });  // no se repite: se respeta lo que haga el usuario
  });

  it('separar la pieza: cada muro que llega es una pieza; el más rígido conserva el nombre; J y grupo', () => {
    const p = proyecto(); gruposPorPieza(p);
    const antes = jMuros(p.muros.filter(m => m.piezaA === 'T1'), 'A');
    const r = separarPieza(p, 'T1');
    expect('texto' in r).toBe(true);
    const nom = (id: string) => p.muros.find(m => m.id === id)!.piezaA;
    expect(['M54', 'M56']).toContain(p.muros.find(m => m.piezaA === 'T1')!.id);   // un alma (la más rígida en A)
    expect(new Set(['M53', 'M54', 'M55', 'M56'].map(nom)).size).toBe(4);
    expect(nom('M57')).toBe('');                                                     // no llega: sin pieza
    expect(p.muros.find(m => m.id === 'M53')!.piezaB).toBe(`${nom('M53')}B`);
    expect(p.grupos!.length).toBe(0);
    const despues = ['M53', 'M54', 'M55', 'M56'].reduce((s, id) => s + jMuros([p.muros.find(m => m.id === id)!], 'A'), 0);
    expect(despues).toBeLessThan(antes * 0.4);
  });

  it('sacar un muro de la pieza: pieza propia, fuera del grupo; la pieza sigue con el resto', () => {
    const p = proyecto(); gruposPorPieza(p);
    const gd = p.muros.find(m => m.id === 'M54')!.gd;
    const r = sacarDePieza(p, 'M53');
    expect('texto' in r).toBe(true);
    const m53 = p.muros.find(m => m.id === 'M53')!;
    expect(m53.piezaA).not.toBe('T1');
    expect(m53.gd).toBeUndefined();
    expect(p.muros.filter(m => m.piezaA === 'T1' && m.llega).map(m => m.id).sort()).toEqual(['M54', 'M55', 'M56']);
    expect(p.muros.find(m => m.id === 'M54')!.gd).toBe(gd);
    expect('error' in sacarDePieza(p, 'M31')).toBe(true);                         // ya es de un muro
  });
});

describe('burbuja: J, W y aportes', () => {
  it('un tabique: J = b·h³/12 y W = J/(h/2)', () => {
    const d = datosSeccion([t('X', 'Y', 0, 0, 4.5, 0.2, 'T')])!;
    expect(d.filas[0].J).toBeCloseTo((0.2 * 4.5 ** 3) / 12, 9);
    expect(d.filas[0].W).toBeCloseTo((0.2 * 4.5 ** 2) / 6, 9);
    expect(d.filas[1].J).toBeCloseTo((4.5 * 0.2 ** 3) / 12, 9);
  });
  it('la caja: los aportes con Steiner suman el J de la pieza (sin las esquinas repetidas, casi)', () => {
    const ms = proyecto().muros.filter(m => m.piezaA === 'T1' && m.llega);
    const a = aportes(ms, Math.PI / 2), J = jMuros(ms, 'A');
    const ala = a.find(x => x.id === 'M53')!;
    expect(ala.J).toBeCloseTo(ala.Jpropio + ala.A * ala.d * ala.d, 9);
    expect(ala.parte).toBeGreaterThan(0.3);
    expect(a.reduce((s, x) => s + x.J, 0) / J).toBeGreaterThan(0.97);
    expect(a.reduce((s, x) => s + x.J, 0) / J).toBeLessThan(1.03);
  });
});
