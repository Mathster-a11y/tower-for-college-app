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

import { conSeccion, seccionesEnvolvente } from './envolvente';
describe('envolvente por secciones (loft propio)', () => {
  it('pasar a secciones no cambia la piel en las secciones; entre dos, pasa recto de una a otra', () => {
    const p = torre();
    p.envolvente = { planta: rectangulo(20, 16), perfil: { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 1 }] } };
    const iPB = p.niveles.findIndex(n => n.nombre === 'PB'), zPB = p.niveles[iPB].cota, zTop = p.niveles[0].cota;
    const i10 = p.niveles.findIndex(n => n.nombre === '10º'), z10 = p.niveles[i10].cota;
    p.envolvente.secciones = conSeccion(p, z10);
    expect(seccionesEnvolvente(p.envolvente)!.map(s => s.cota)).toEqual([zPB, z10, zTop]);
    // en el 10º la piel se agranda a 30 × 16: los pisos de en medio pasan recto de 20 a 30 m
    p.envolvente.secciones.find(s => s.cota === z10)!.v = rectangulo(30, 16);
    expect(cajaSilueta(contornoEnvolvente(p, i10)!).B).toBeCloseTo(30, 6);
    const i5 = p.niveles.findIndex(n => n.nombre === '5º'), z5 = p.niveles[i5].cota;
    expect(cajaSilueta(contornoEnvolvente(p, i5)!).B).toBeCloseTo(20 + 10 * (z5 - zPB) / (z10 - zPB), 3);
    // la carpintería de los pisos sigue a la piel; las losas no se tocan
    aplicarCarpinteriaTramos(p);
    expect(cajaSilueta(p.niveles[i10].carpinteria!).B).toBeCloseTo(30, 6);
    expect(cajaSilueta(p.niveles[i10].silueta!).B).toBeCloseTo(20, 6);
  });
});

import { bandasFachada, calcularPaneleria } from './carpinteria';
describe('la piel se corta solo donde la losa la toca', () => {
  it('un piso con la losa lejos de la piel (doble altura): sin antepecho ni travesaño en esa losa', () => {
    const p = torre();
    p.envolvente = envolventeDesdeLosas(p, 0.3);
    const i10 = p.niveles.findIndex(n => n.nombre === '10º'), z10 = p.niveles[i10].cota;
    p.niveles[i10].silueta = rectangulo(10, 8);                          // la losa del 10º no llega a la piel
    p.paneleria = { modulo: 1.5, antepecho: 0.9 };
    aplicarCarpinteriaTramos(p);
    const r = calcularPaneleria(bandasFachada(p), p.paneleria);
    expect(r.paneles.filter(x => x.opaco && Math.min(...x.p.map(q => q.z)) === z10).length).toBe(0);
    expect(r.travesanos.filter(([a, b]) => Math.abs(a.z - z10) < 1e-6 && Math.abs(b.z - z10) < 1e-6).length).toBe(0);
    // el piso de abajo, con su losa entera, sí tiene antepecho
    const z9 = p.niveles[i10 + 1].cota;
    expect(r.paneles.filter(x => x.opaco && Math.abs(Math.min(...x.p.map(q => q.z)) - z9) < 1e-6).length).toBeGreaterThan(0);
  });
});
