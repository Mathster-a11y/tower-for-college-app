import { describe, expect, it } from 'vitest';
import { ejemploCiticorpFachada } from './ejemploCiticorpFachada';
import { aplicarCarpinteriaTramos, bandasFachada, calcularPaneleria } from './carpinteria';
import { aplicarPlanosCorte } from './planos_corte';
import { avisosDiseno } from './avisos';
import { leerProyecto } from './lector';
import { cajaSilueta, carpinteriaDeNivel } from './silueta';

describe('Citicorp Center: forma y fachada', () => {
  const armar = () => { const p = ejemploCiticorpFachada(); aplicarPlanosCorte(p); aplicarCarpinteriaTramos(p); return p; };
  it('se lee como proyecto válido', () => { expect(leerProyecto(JSON.parse(JSON.stringify(ejemploCiticorpFachada()))).ok).toBe(true); });
  it('la corona a 45°: la losa de arriba es una franja al norte; el piso 56 queda entero', () => {
    const p = armar();
    const c = cajaSilueta(p.niveles[0].silueta!);
    expect(c.L).toBeCloseTo(1, 1); expect(c.cy).toBeGreaterThan(22);
    const i56 = p.niveles.findIndex(n => n.nombre.startsWith('56º'));
    expect(cajaSilueta(p.niveles[i56].silueta ?? [{ x: -23.925, y: -23.925 }, { x: 23.925, y: 23.925 }]).L).toBeCloseTo(47.85, 1);
  });
  it('plaza sin carpintería, oficinas por piso, corona envolvente con la cara inclinada opaca', () => {
    const p = armar();
    const iPB = p.niveles.findIndex(n => n.cota === 0);
    expect(carpinteriaDeNivel(p, iPB)).toBeNull();
    const r = calcularPaneleria(bandasFachada(p), p.paneleria!);
    expect(r.alabeados).toBe(0);
    const inc = r.carasInfo.filter(c => c.inclinacion >= 30 && c.inclinacion <= 60);
    expect(inc.length).toBeGreaterThan(0);
    expect(r.paneles.filter(x => inc.some(c => c.id === x.cara)).every(x => x.opaco)).toBe(true);
    // sin avisos de carpintería sobre un vacío ni fuera de la losa
    expect(avisosDiseno(p).filter(a => a.tipo.startsWith('carpinteria') || a.tipo === 'losa-fuera-envolvente' || a.tipo === 'fuera-losa' || a.tipo === 'bl-caja')).toEqual([]);
    // la planilla: el piso 56 y los de abajo con 47,85 × 47,85 m (no heredan la franja de la corona)
    const i56 = p.niveles.findIndex(n => n.nombre.startsWith('56º'));
    expect([p.niveles[i56].B, p.niveles[i56].L]).toEqual([47.85, 47.85]);
  });
});
