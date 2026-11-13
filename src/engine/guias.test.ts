import { describe, expect, it } from 'vitest';
import { circulo3p, circuloTTR, cruceCirculos, ejesGrilla, imanGuias, leerSeparaciones, nombreEje, paralela, puntosNotables, rectaPorDosPuntos, type GuiaRecta } from './guias';
import { alargar, desfasar, esquina, partir, unir } from './editar';
import { ejemploGuia } from './modelo';

describe('guías y grilla de ejes', () => {
  it('lee separaciones como en un plano', () => {
    expect(leerSeparaciones('4 × 7,20')).toEqual([7.2, 7.2, 7.2, 7.2]);
    expect(leerSeparaciones('3,6; 7,2 + 2x5')).toEqual([3.6, 7.2, 5, 5]);
    expect(leerSeparaciones('abc')).toBeNull();
    expect([nombreEje(0, 'letras'), nombreEje(25, 'letras'), nombreEje(26, 'letras'), nombreEje(2, 'numeros')]).toEqual(['A', 'Z', 'AA', '3']);
  });
  it('arma la grilla centrada y el imán toma el cruce de ejes', () => {
    const ej = ejesGrilla({ sepX: [7.2, 7.2], sepY: [6], x0: 0, y0: 0, nombresX: 'letras', nombresY: 'numeros', centrar: true }, []);
    expect(ej.map(e => `${e.eje}@${e.ang === 90 ? e.p.x : e.p.y}`)).toEqual(['A@-7.2', 'B@0', 'C@7.2', '1@-3', '2@3']);
    const im = imanGuias({ x: 7.1, y: 2.95 }, ej, 0.3);
    expect(im).toMatchObject({ p: { x: 7.2, y: 3 }, punto: true });
    expect(im!.t).toBe('cruce de ejes C-2');
    expect(imanGuias({ x: 1, y: 2.9 }, ej, 0.3)).toMatchObject({ p: { x: 1, y: 3 }, punto: false });
    expect(puntosNotables(ej).length).toBe(6);
  });
  it('paralela, recta por dos puntos y círculos', () => {
    const h: GuiaRecta = { id: 'a', t: 'recta', p: { x: 0, y: 0 }, ang: 0 }, v: GuiaRecta = { id: 'b', t: 'recta', p: { x: 0, y: 0 }, ang: 90 };
    expect((paralela(h, 2.5, { x: 3, y: -1 }) as GuiaRecta).p).toEqual({ x: 0, y: -2.5 });
    expect(rectaPorDosPuntos({ x: 0, y: 0 }, { x: -1, y: -1 }).ang).toBe(45);
    const t = circuloTTR(h, v, 2, { x: 3, y: 3 })!;
    expect(t.c).toEqual({ x: 2, y: 2 });
    const c = circulo3p({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 })!;
    expect(c).toEqual({ c: { x: 0, y: 0 }, r: 1 });
    expect(cruceCirculos({ id: 'x', t: 'circulo', c: { x: 0, y: 0 }, r: 5 }, { id: 'y', t: 'circulo', c: { x: 8, y: 0 }, r: 5 }).map(q => [q.x, Math.abs(q.y)])).toEqual([[4, 3], [4, 3]]);
  });
});

describe('edición de muros', () => {
  it('desfase, alargar, partir, unir y esquina', () => {
    const p = ejemploGuia();
    const d = desfasar(p, 'M1', 1.5, { x: 0, y: 0 });
    if ('error' in d) throw new Error(d.error);
    expect(p.muros.find(m => m.id === d.id)!.x).toBe(-8.4);
    // M1: Y en x = −9,9, de y = 3,5 a 8: se alarga la punta de abajo hasta y = 0
    expect(alargar(p, 'M1', { x: -9.9, y: 3.6 }, { x: 5, y: 0 })).toBeNull();
    const m1 = p.muros.find(m => m.id === 'M1')!;
    expect([m1.y, m1.largo]).toEqual([4, 8]);
    const pt = partir(p, 'M1', { x: -9.9, y: 2 });
    if ('error' in pt) throw new Error(pt.error);
    expect([p.muros.find(m => m.id === 'M1')!.largo, p.muros.find(m => m.id === pt.id)!.largo]).toEqual([2, 6]);
    expect(unir(p, 'M1', pt.id)).toBeNull();
    expect(p.muros.find(m => m.id === 'M1')!.largo).toBe(8);
    // esquina entre M1 (Y) y un muro en X arriba
    p.muros.push({ id: 'Z', dir: 'X', x: -6, y: 9, largo: 4, espesor: 0.2, llega: true, areaInf: 1, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '' });
    expect(esquina(p, 'M1', 'Z')).toBeNull();
    const a = p.muros.find(m => m.id === 'M1')!, z = p.muros.find(m => m.id === 'Z')!;
    expect(a.y + a.largo / 2).toBeCloseTo(9.1, 6);         // M1 llega a la cara de arriba de Z
    expect(z.x - z.largo / 2).toBeCloseTo(-9.8, 6);       // Z topa con la cara de adentro de M1
  });
});
