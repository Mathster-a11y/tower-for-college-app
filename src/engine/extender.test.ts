import { describe, expect, it } from 'vitest';
import { extenderHasta } from './extender';
import { ejeDeMuro } from './juntas';
import { ponerPerfil } from './perfil';
import type { Muro, Proyecto } from './modelo';

const tab = (id: string, dir: 'X' | 'Y', x: number, y: number, largo: number): Muro => ({ id, dir, x, y, largo, espesor: 0.25, llega: true, areaInf: 1, piezaA: 'P', pegadoA: '', piezaB: '', pegadoB: '' });
const proy = (muros: Muro[]) => ({ muros } as unknown as Proyecto);
describe('extender o recortar hasta', () => {
  it('un tabique corto se alarga hasta el eje del otro: T', () => {
    const p = proy([tab('A', 'X', 0, 0, 6), tab('B', 'Y', 2, 2, 3)]);   // B va de y 0,5 a 3,5
    const r = extenderHasta(p, 'B', 'A');
    expect('texto' in r && r.texto).toMatch(/alargado 50 cm.*T/);
    const B = p.muros.find(m => m.id === 'B')!;
    expect(B.y - B.largo / 2).toBeCloseTo(0, 6); expect(B.y + B.largo / 2).toBeCloseTo(3.5, 6);
  });
  it('uno que se pasa se recorta', () => {
    const p = proy([tab('A', 'X', 0, 0, 6), tab('B', 'Y', 2, 1, 3)]);   // de −0,5 a 2,5
    extenderHasta(p, 'B', 'A');
    const B = p.muros.find(m => m.id === 'B')!;
    expect(B.y - B.largo / 2).toBeCloseTo(0, 6);
  });
  it('si el cruce cae fuera del otro, se cierra la esquina (L) alargando los dos', () => {
    const p = proy([tab('A', 'X', 0, 0, 4), tab('B', 'Y', 2.4, 2, 3)]);  // A llega a x 2; B empieza en y 0,5
    const r = extenderHasta(p, 'B', 'A');
    expect('texto' in r && r.texto).toMatch(/esquina/);
    const A = p.muros.find(m => m.id === 'A')!, B = p.muros.find(m => m.id === 'B')!;
    expect(A.x + A.largo / 2).toBeCloseTo(2.4, 6); expect(B.y - B.largo / 2).toBeCloseTo(0, 6);
  });
  it('muros en diagonal (perfiles rectangulares)', () => {
    const base = tab('D', 'Y', 0, 0, 1);
    const L = 4, c = Math.SQRT1_2, e = 0.25;
    const ax = { x: 1, y: 1 }, bx = { x: 1 + L * c, y: 1 + L * c }, n = { x: -c * e / 2, y: c * e / 2 };
    const D = ponerPerfil(base, { v: [{ x: ax.x - n.x, y: ax.y - n.y }, { x: bx.x - n.x, y: bx.y - n.y }, { x: bx.x + n.x, y: bx.y + n.y }, { x: ax.x + n.x, y: ax.y + n.y }] });
    const p = proy([tab('A', 'X', 0, 0, 8), D]);
    extenderHasta(p, 'D', 'A');
    const E = ejeDeMuro(p.muros.find(m => m.id === 'D')!)!;
    expect(Math.min(E.a.y, E.b.y)).toBeCloseTo(0, 4);
    expect(E.L).toBeCloseTo(L + Math.SQRT2, 4);
  });
  it('paralelos o curvos: error', () => {
    expect('error' in extenderHasta(proy([tab('A', 'X', 0, 0, 4), tab('B', 'X', 0, 2, 4)]), 'A', 'B')).toBe(true);
  });
});
