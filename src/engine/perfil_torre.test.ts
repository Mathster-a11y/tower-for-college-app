import { describe, expect, it } from 'vitest';
import { aplicarCarpinteria, aplicarPerfil, PERFILES, transformarPlanta, valorPerfil } from './perfil_torre';
import { ejemploGuia } from './modelo';
import { areaSilueta, cajaSilueta, rectangulo } from './silueta';
import { avisosDiseno } from './avisos';

describe('perfil de la torre', () => {
  it('recto: interpola en línea recta; suave: pasa por los puntos y no se pasa de ellos', () => {
    const pf = { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 0.6 }] };
    expect(valorPerfil(pf, 0.5).fx).toBeCloseTo(0.8, 9);
    const b = { suave: true, puntos: [{ h: 0, fx: 1 }, { h: 0.5, fx: 1.15 }, { h: 1, fx: 0.9 }] };
    expect(valorPerfil(b, 0.5).fx).toBeCloseTo(1.15, 9);
    for (let h = 0; h <= 1; h += 0.01) expect(valorPerfil(b, h).fx).toBeLessThanOrEqual(1.15 + 1e-9);
    // escalonada: entre 0,34 y 0,66 queda en 0,85 (recto, sin panzas)
    const e = PERFILES.find(x => x.id === 'escalonada')!.p;
    expect(valorPerfil(e, 0.5).fx).toBeCloseTo(0.85, 9);
  });
  it('transformar: escala desde el centro, gira y corre; los arcos se conservan con la misma escala en x e y', () => {
    const c = [{ x: 5, y: 0, b: Math.tan(Math.PI / 8) }, { x: 0, y: 5, b: Math.tan(Math.PI / 8) }, { x: -5, y: 0, b: Math.tan(Math.PI / 8) }, { x: 0, y: -5, b: Math.tan(Math.PI / 8) }];
    const t = transformarPlanta(c, 0.5, 0.5, 2, 0, 0);
    expect(t).toHaveLength(4);
    expect(areaSilueta(t)).toBeCloseTo(Math.PI * 6.25, 1);
    expect(cajaSilueta(t).cx).toBeCloseTo(2, 6);
    const r = transformarPlanta(rectangulo(20, 10), 1, 1, 0, 0, 90);
    expect(cajaSilueta(r).B).toBeCloseTo(10, 6);
    const el = transformarPlanta(c, 1, 0.5, 0, 0, 0);
    expect(cajaSilueta(el).L).toBeCloseTo(5, 2);
  });
  it('en el proyecto: ahusada de PB a la azotea, B y L de cada losa; la carpintería sigue a la losa y no hay avisos', () => {
    const p = ejemploGuia();
    p.perfilTorre = { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 0.9 }] };
    expect(aplicarPerfil(p)).toBeGreaterThan(10);
    expect(p.niveles[0].B).toBeCloseTo(18, 2);
    expect(p.niveles[0].L).toBeCloseTo(14.4, 2);
    // aplicar dos veces da lo mismo (la base no se toca)
    const antes = JSON.stringify(p.niveles); aplicarPerfil(p); expect(JSON.stringify(p.niveles)).toBe(antes);
    p.carpinteriaRetiro = 0.3;
    aplicarCarpinteria(p);
    expect(cajaSilueta(p.niveles[0].carpinteria!).B).toBeCloseTo(17.4, 6);
    expect(avisosDiseno(p).filter(a => a.tipo === 'carpinteria-fuera' || a.tipo === 'bl-caja')).toEqual([]);
  });
});
