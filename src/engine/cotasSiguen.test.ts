import { describe, expect, it } from 'vitest';
import { ejemploGuia } from './modelo';
import { aplicar, girarLibre } from './colocar';
import { puntoCota, resolverPunto } from './cotas';
import { nodosMuro } from './dibujo';

describe('las cotas siguen al muro (plan de entrega, inciso 8)', () => {
  const armar = () => {
    const p = ejemploGuia(), m = p.muros[0], ns = nodosMuro(m);
    p.cotas = ns.map((n, k) => ({ id: `c${k}`, a: puntoCota(n, p.muros, m.id), b: { x: 30, y: 30 }, tipo: 'alineada' as const, d: 1 }));
    return { p, m, ns };
  };
  const c = { x: 10, y: 3 };
  const ops: [string, (x: { x: number; y: number }) => { x: number; y: number }, Parameters<typeof aplicar>[2]][] = [
    ['girar 90°', q => ({ x: c.x - (q.y - c.y), y: c.y + (q.x - c.x) }), { t: 'girar', c, q: 1 }],
    ['girar 180°', q => ({ x: 2 * c.x - q.x, y: 2 * c.y - q.y }), { t: 'girar', c, q: 2 }],
    ['espejar en x', q => ({ x: 2 * c.x - q.x, y: q.y }), { t: 'espejar', eje: 'x', c }],
    ['mover', q => ({ x: q.x + 2, y: q.y - 1 }), { t: 'mover', dx: 2, dy: -1 }],
    ['escalar ×2', q => ({ x: c.x + (q.x - c.x) * 2, y: c.y + (q.y - c.y) * 2 }), { t: 'escalar', c, f: 2, espesor: true }],
  ];
  for (const [nombre, f, op] of ops) it(`${nombre}: cada punto de cota queda en el nodo transformado y sigue pegado`, () => {
    const { p, m, ns } = armar();
    expect(aplicar(p, { m: [m.id], g: [] }, op)).toBeNull();
    p.cotas!.forEach((ct, k) => {
      const r = resolverPunto(p, ct.a), e = f(ns[k]);
      expect(Math.hypot(r.x - e.x, r.y - e.y)).toBeLessThan(1e-6);
      expect(ct.a.ref?.id).toBe(m.id);
    });
  });
  it('girar en un ángulo cualquiera (el muro pasa a perfil): la cota va al punto girado', () => {
    const { p, m, ns } = armar();
    girarLibre(p, { m: [m.id], g: [] }, c, 30);
    const a = Math.PI / 6;
    p.cotas!.forEach((ct, k) => {
      const r = resolverPunto(p, ct.a), q = ns[k];
      const e = { x: c.x + (q.x - c.x) * Math.cos(a) - (q.y - c.y) * Math.sin(a), y: c.y + (q.x - c.x) * Math.sin(a) + (q.y - c.y) * Math.cos(a) };
      expect(Math.hypot(r.x - e.x, r.y - e.y)).toBeLessThan(1e-3);
    });
  });
});
