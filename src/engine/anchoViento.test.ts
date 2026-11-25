import { describe, expect, it } from 'vitest';
import { medidasAlViento, type Vertice } from './silueta';
import { ejemploGherkin } from './ejemplosExo';
import { avisosDiseno } from './avisos';
import { aplicarPerfil } from './perfil_torre';
import { ejemploGuia } from './modelo';

const circulo = (d: number): Vertice[] => { const r = d / 2, b = Math.tan(Math.PI / 8); return [{ x: r, y: 0, b }, { x: 0, y: r, b }, { x: -r, y: 0, b }, { x: 0, y: -r, b }]; };

describe('planta curva: B y L para el viento (caja o igual área)', () => {
  it('círculo: la caja es el diámetro; igual área, un cuadrado de 0,886 D', () => {
    expect(medidasAlViento(circulo(50), 'caja').B).toBeCloseTo(50, 6);
    expect(medidasAlViento(circulo(50), 'area').B).toBeCloseTo(50 * Math.sqrt(Math.PI / 4), 2);
    // un rectángulo: las dos dan lo mismo
    const r: Vertice[] = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }];
    expect(medidasAlViento(r, 'area')).toEqual(medidasAlViento(r, 'caja'));
  });
  it('el Gherkin (igual área, carpintería circular) ya no tiene avisos de B × L', () => {
    const av = avisosDiseno(ejemploGherkin());
    expect(av.filter(a => a.tipo === 'bl-caja').length).toBe(0);
  });
  it('una losa curva con B y L de otra cosa sí avisa; el perfil escribe con el criterio elegido', () => {
    const p = ejemploGuia();
    const pb = p.niveles.find(n => n.cota === 0)!;
    pb.silueta = circulo(30); pb.B = 10; pb.L = 10;
    expect(avisosDiseno(p).some(a => a.tipo === 'bl-caja')).toBe(true);
    p.perfilTorre = { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 1 }], blCriterio: 'area' };
    aplicarPerfil(p);
    const arriba = p.niveles[1];
    expect(arriba.B).toBeCloseTo(30 * Math.sqrt(Math.PI / 4), 1);
  });
});
