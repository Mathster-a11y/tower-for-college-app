import { describe, expect, it } from 'vitest';
import { acople, desdeEje, esOrtogonal, esRectanguloOrtogonal, girar, perfilDeMuro, ponerPerfil, propiedades, rectanguloEquivalente, type Perfil } from './perfil';
import { ejemploGuia, areaMuro, type Muro } from './modelo';
import { aPlanilla, Jreal } from './mapping';
import { calcularPlanilla } from './planilla';
import { girarMuro } from './grupos';

const muro = (p: Perfil, id = 'P1'): Muro => ponerPerfil({ id, dir: 'Y', x: 0, y: 0, largo: 1, espesor: 1, llega: true, areaInf: 10, piezaA: 'TP', pegadoA: '', piezaB: 'TPB', pegadoB: '' }, p);

describe('perfil irregular', () => {
  it('un rectángulo como perfil da lo mismo que el tabique', () => {
    const t = ejemploGuia().muros.find(m => m.id === 'M1')!;
    const pr = propiedades(perfilDeMuro(t));
    expect(pr.A).toBeCloseTo(0.9, 9);
    expect(pr.JA).toBeCloseTo((0.2 * 4.5 ** 3) / 12, 9);
    expect(pr.JB).toBeCloseTo((4.5 * 0.2 ** 3) / 12, 9);
    expect(esRectanguloOrtogonal(perfilDeMuro(t))).toEqual({ cx: -9.9, cy: 5.75, ax: 0.2, ay: 4.5 });
  });
  it('la L como polígono da lo mismo que con rectángulos y Steiner', () => {
    const L: Perfil = { v: [{ x: 0, y: 0 }, { x: 0.25, y: 0 }, { x: 0.25, y: 3.75 }, { x: 2, y: 3.75 }, { x: 2, y: 4 }, { x: 0, y: 4 }] };
    const pr = propiedades(L);
    expect(pr.JA).toBeCloseTo(2.4055848, 6);
    expect(pr.JB).toBeCloseTo(0.4212098, 6);
    expect(pr.Jxy).toBeCloseTo(0.5706522, 6);
    expect(acople(pr)).toBeGreaterThan(0.5);
    expect(esOrtogonal(L)).toBe(true);
  });
  it('círculo con arcos y anillo con hueco', () => {
    const circ = (r: number) => [{ x: r, y: 0, b: 1 }, { x: -r, y: 0, b: 1 }];
    expect(propiedades({ v: circ(1) }).JA).toBeCloseTo(Math.PI / 4, 3);
    const an = propiedades({ v: circ(1), huecos: [circ(0.8)] });
    expect(an.A).toBeCloseTo(Math.PI * (1 - 0.64), 3);
    expect(an.JA).toBeCloseTo((Math.PI / 4) * (1 - 0.8 ** 4), 3);
  });
  it('muro curvo desde un eje y rectángulo equivalente', () => {
    const eje = Array.from({ length: 65 }, (_, k) => ({ x: 4 * Math.cos((k / 64) * Math.PI / 2), y: 4 * Math.sin((k / 64) * Math.PI / 2) }));
    const p = desdeEje(eje, 0.25)!;
    const pr = propiedades(p);
    expect(pr.A).toBeCloseTo(0.25 * 4 * Math.PI / 2, 2);
    expect(pr.JA).toBeCloseTo(2.3856, 2);
    const { b, h } = rectanguloEquivalente(pr.JA, pr.A);
    expect((b * h ** 3) / 12).toBeCloseTo(pr.JA, 3);
    expect(b * h).toBeCloseTo(pr.A, 3);
  });
  it('girar 90° cambia J A por J B; a 45° los iguala', () => {
    const m = muro({ v: [{ x: -2, y: -0.1 }, { x: 2, y: -0.1 }, { x: 2, y: 0.1 }, { x: -2, y: 0.1 }] });
    const a = propiedades(m.perfil!), g = girarMuro(m, 0, 0), b = propiedades(g.perfil!);
    expect(b.JA).toBeCloseTo(a.JB, 9); expect(b.JB).toBeCloseTo(a.JA, 9);
    const d = propiedades(girar(m.perfil!, 45));
    expect(d.JA).toBeCloseTo(d.JB, 3);
    expect(Math.abs(d.Jxy)).toBeCloseTo(Math.abs(a.JA - a.JB) / 2, 3);
  });
  it('en la planilla: un perfil igual a un tabique da el mismo J y el mismo cálculo', () => {
    const p = ejemploGuia();
    const i = p.muros.findIndex(m => m.id === 'M1');
    const base = aPlanilla(p), jBase = base.piezas.find(x => x.dir === 'A' && x.muros.includes('M1'))!.Jhoja!;
    p.muros[i] = ponerPerfil({ ...p.muros[i] }, perfilDeMuro(p.muros[i]));
    expect(areaMuro(p.muros[i])).toBeCloseTo(0.9, 9);
    const a = aPlanilla(p), pz = a.piezas.find(x => x.dir === 'A' && x.muros.includes('M1'))!;
    expect(pz.molde).toBe('simétrico');
    expect(pz.Jhoja!).toBeCloseTo(jBase, 6);
    expect(Jreal(p.muros.filter(m => m.id === 'M1'), 'A')).toBeCloseTo(jBase, 6);
    const r0 = calcularPlanilla(base.datos), r1 = calcularPlanilla(a.datos);
    expect(r1.rotA.J7).toBeCloseTo(r0.rotA.J7, 6);
  });
});

describe('pórtico en diagonal', () => {
  it('reparte su J con sen²θ y cos²θ; a 90° da lo mismo que el pórtico de siempre', () => {
    const p = ejemploGuia();
    const col = (id: string, x: number, y: number): Muro => ({ id, dir: 'Y', x, y, largo: 0.5, espesor: 0.5, llega: true, areaInf: 5, piezaA: 'PX', pegadoA: '', piezaB: 'PXB', pegadoB: '', portico: true });
    p.muros = [...p.muros, col('C1', 0, 0), col('C2', 3, 3)];
    const a = aPlanilla(p);
    const pA = a.piezas.find(x => x.dir === 'A' && x.muros.includes('C1'))!, pB = a.piezas.find(x => x.dir === 'B' && x.muros.includes('C1'))!;
    expect(pA.avisos[0]).toMatch(/diagonal \(45°\)/);
    expect(pA.Jhoja!).toBeCloseTo(pB.Jhoja!, 3);
    // J en el plano: 2·(b⁴/12) + 2·A·d², d = la mitad de la distancia entre columnas
    const Jplano = 2 * (0.5 ** 4 / 12) + 2 * 0.25 * (Math.hypot(3, 3) / 2) ** 2;
    expect(pA.Jhoja!).toBeCloseTo(Jplano / 2, 3);
  });
});
