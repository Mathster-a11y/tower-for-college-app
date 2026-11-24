import { describe, expect, it } from 'vitest';
import { contornoEnvolvente, envolventeDesdeLosas } from './envolvente';
import { aplicarCarpinteriaTramos } from './carpinteria';
import { avisosDiseno } from './avisos';
import { ejemploGuia } from './modelo';
import { cajaSilueta, rectangulo } from './silueta';

const torre = () => { const p = ejemploGuia(); p.niveles.forEach(n => { n.silueta = rectangulo(20, 16); }); p.carpinteriaTramos = [{ desde: 0, modo: 'continua', retiro: 0.3 }]; return p; };

describe('envolvente', () => {
  it('creada desde las losas: da lo mismo que la piel que sigue a las losas', () => {
    const p = torre();
    aplicarCarpinteriaTramos(p);
    const antes = p.niveles.filter(n => n.cota >= 0).map(n => cajaSilueta(n.carpinteria!));
    p.envolvente = envolventeDesdeLosas(p, 0.3);
    aplicarCarpinteriaTramos(p);
    p.niveles.filter(n => n.cota >= 0).forEach((n, k) => { const c = cajaSilueta(n.carpinteria!); expect(c.B).toBeCloseTo(antes[k].B, 6); expect(c.L).toBeCloseTo(antes[k].L, 6); });
  });
  it('las losas se editan sin tocar la piel; si una sale, hay aviso (y no el de carpintería fuera de la losa)', () => {
    const p = torre();
    p.envolvente = envolventeDesdeLosas(p, 0.3);
    aplicarCarpinteriaTramos(p);
    const antes = JSON.stringify(p.niveles.map(n => n.carpinteria));
    p.niveles.forEach(n => { n.silueta = rectangulo(14, 12); });          // losas más chicas: adentro de la piel
    aplicarCarpinteriaTramos(p);
    expect(JSON.stringify(p.niveles.map(n => n.carpinteria))).toBe(antes);
    let av = avisosDiseno(p);
    expect(av.some(a => a.tipo === 'losa-fuera-envolvente' || a.tipo === 'carpinteria-fuera')).toBe(false);
    p.niveles[2].silueta = rectangulo(24, 16);                             // un piso más ancho que la piel
    av = avisosDiseno(p);
    expect(av.find(a => a.tipo === 'losa-fuera-envolvente')?.cotas).toEqual([p.niveles[2].cota]);
  });
  it('la piel tiene su propio perfil y sus propios planos de corte', () => {
    const p = torre();
    p.envolvente = { planta: rectangulo(20, 16), perfil: { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 0.5 }] } };
    const iPB = p.niveles.findIndex(n => n.nombre === 'PB');
    expect(cajaSilueta(contornoEnvolvente(p, 0)!).B).toBeCloseTo(10, 6);        // en la azotea, la mitad
    expect(cajaSilueta(contornoEnvolvente(p, iPB)!).B).toBeCloseTo(20, 6);
    // un plano vertical en x = 5 saca lo de la derecha en toda la altura
    p.envolvente.perfil = { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 1 }] };
    p.envolvente.planos = [{ id: 'P1', eje: 'x', a: { w: 5, z: 0 }, b: { w: 5, z: 100 }, saca: 'abajo' }];
    const c = cajaSilueta(contornoEnvolvente(p, 3)!);
    expect(c.B).toBeCloseTo(15, 6);
  });
});
