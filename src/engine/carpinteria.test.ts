import { describe, expect, it } from 'vitest';
import { aplicarCarpinteriaTramos, comunLosas, tramoEn } from './carpinteria';
import { ejemploGuia } from './modelo';
import { cajaSilueta, carpinteriaDeNivel, rectangulo } from './silueta';
import { avisosDiseno } from './avisos';

describe('carpintería por tramos', () => {
  it('lo común a dos losas: la de adentro si una contiene a la otra; recorte exacto con una convexa', () => {
    expect(comunLosas(rectangulo(20, 16), rectangulo(10, 8))).toEqual({ v: rectangulo(10, 8), exacto: true });
    const corrida = rectangulo(20, 16).map(q => ({ x: q.x + 5, y: q.y }));
    const c = comunLosas(rectangulo(20, 16), corrida);
    expect(c.exacto).toBe(true);
    expect(cajaSilueta(c.v)).toMatchObject({ B: 15, L: 16 });
  });
  it('por losa: cada piso entre su losa y la de arriba (retranqueo y voladizo), sin tapas; sin: no hay fachada', () => {
    const p = ejemploGuia();
    const i15 = p.niveles.findIndex(n => n.nombre === '15º'), i14 = i15 + 1, iPB = p.niveles.findIndex(n => n.nombre === 'PB');
    // del 15º para arriba la losa es de 16 × 16 (retranqueo)
    for (let i = 0; i <= i15; i++) p.niveles[i].silueta = rectangulo(16, 16);
    p.niveles[i14].silueta = rectangulo(20, 16);                     // del 14º para abajo, 20 × 16
    p.carpinteriaTramos = [{ desde: 0, modo: 'sin' }, { desde: 3, modo: 'losa', retiro: 0.2 }];
    aplicarCarpinteriaTramos(p);
    // el piso del 14º (entre la losa de 20 × 16 y la de 16 × 16 de arriba): la carpintería cabe debajo de la de arriba
    expect(cajaSilueta(p.niveles[i14].carpinteria!)).toMatchObject({ B: 15.6, L: 15.6 });
    expect(cajaSilueta(p.niveles[i14 + 1].carpinteria!).B).toBeCloseTo(19.6, 6);
    expect(carpinteriaDeNivel(p, iPB)).toBeNull();
    expect(tramoEn(p, 20)?.modo).toBe('losa');
    expect(avisosDiseno(p).filter(a => a.tipo === 'carpinteria-fuera')).toEqual([]);
  });
});

import { bandasFachada, calcularPaneleria } from './carpinteria';
import { prepararSecciones } from './loft';
import { puntosSilueta } from './silueta';
describe('panelería', () => {
  it('rectángulo 20 × 16, piso de 3 m, montantes cada 1,5 m con antepecho de 0,9 m', () => {
    const r = puntosSilueta(rectangulo(20, 16), 8);
    const res = calcularPaneleria([{ z0: 0, z1: 3, modo: 'losa', a: r, b: r }], { modulo: 1.5, antepecho: 0.9 });
    expect(res.montantes.length).toBe(2 * (14 + 11));               // ceil(20/1,5) = 14 y ceil(16/1,5) = 11 por cara
    expect(res.opacos.n).toBe(50);
    expect(res.opacos.area).toBeCloseTo(0.9 * 72, 6);
    expect(res.vidrio.area).toBeCloseTo(2.1 * 72, 6);
    expect(res.largoMontantes).toBeCloseTo(50 * 3, 6);
    // dos travesaños intermedios: el vidrio en tres
    expect(calcularPaneleria([{ z0: 0, z1: 3, modo: 'losa', a: r, b: r }], { modulo: 1.5, antepecho: 0.9, intermedios: 2 }).vidrio.n).toBe(150);
  });
  it('bandas: «sin» no tiene, «por losa» vertical y «continua» con los anillos alineados', () => {
    const p = ejemploGuia();
    const z = (nom: string) => p.niveles.find(n => n.nombre === nom)!.cota;
    p.carpinteriaTramos = [{ desde: 0, modo: 'sin' }, { desde: z('3º'), modo: 'losa' }, { desde: z('15º'), modo: 'continua' }];
    const b = bandasFachada(p, prepararSecciones);
    expect(b[0].z0).toBe(z('3º'));
    expect(b.filter(x => x.modo === 'losa').length).toBe(12);
    expect(b.filter(x => x.modo === 'continua').length).toBe(6);
    b.forEach(x => expect(x.a.length).toBe(x.b.length));
  });
});

import { facetar, facetasDe } from './carpinteria';
import { aplicarPerfil } from './perfil_torre';
describe('carpintería plana (facetas)', () => {
  // círculo de 10 m de radio con cuatro cuartos de círculo (bulge tan 22,5°)
  const k = Math.tan(Math.PI / 8), circulo = () => [{ x: 10, y: 0, b: k }, { x: 0, y: 10, b: k }, { x: -10, y: 0, b: k }, { x: 0, y: -10, b: k }];
  it('los lados curvos pasan a facetas rectas de a lo sumo el módulo, con los vértices sobre la curva', () => {
    const n = facetasDe(circulo(), 1.5);
    expect(n).toEqual([11, 11, 11, 11]);                             // π·10/2 / 1,5 = 10,5 → 11 por cuarto
    const f = facetar(circulo(), 1.5);
    expect(f.length).toBe(44);
    f.forEach(q => { expect(Math.hypot(q.x, q.y)).toBeCloseTo(10, 3); expect(q.b).toBeUndefined(); });
    f.forEach((q, i) => { const r = f[(i + 1) % f.length]; expect(Math.hypot(r.x - q.x, r.y - q.y)).toBeLessThanOrEqual(1.5 + 1e-6); });
  });
  it('por losa plana: la carpintería es un polígono y todos los paños son planos', () => {
    const p = ejemploGuia();
    p.niveles.forEach(n => { n.silueta = circulo(); });
    p.carpinteriaTramos = [{ desde: 0, modo: 'losa', retiro: 0.3, forma: 'plana' }];
    p.paneleria = { modulo: 1.5, antepecho: 0.9 };
    aplicarCarpinteriaTramos(p);
    p.niveles.filter(n => n.cota >= 0).forEach(n => expect(n.carpinteria!.some(q => q.b || q.c1)).toBe(false));
    const r = calcularPaneleria(bandasFachada(p, prepararSecciones), p.paneleria);
    expect(r.alabeados).toBe(0);
    expect(r.montantes.length).toBe(44 * bandasFachada(p, prepararSecciones).length);   // un montante en cada faceta
  });
  it('continua plana en una torre ahusada: las facetas de un piso y las del de arriba son paralelas (paños planos)', () => {
    const p = ejemploGuia();
    p.niveles.forEach(n => { n.silueta = null; });
    const iPB = p.niveles.findIndex(n => n.nombre === 'PB');
    p.niveles[iPB].silueta = [{ x: -10, y: -6 }, { x: 10, y: -6, b: 0.4 }, { x: 10, y: 6 }, { x: -10, y: 6 }];
    p.perfilTorre = { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 0.6 }] };
    aplicarPerfil(p);
    p.carpinteriaTramos = [{ desde: 0, modo: 'continua', forma: 'plana' }];
    p.paneleria = { modulo: 1.5 };
    aplicarCarpinteriaTramos(p);
    const b = bandasFachada(p, prepararSecciones);
    expect(b.every(x => x.plana)).toBe(true);
    expect(calcularPaneleria(b, p.paneleria).alabeados).toBe(0);
    // la curva, en cambio, no queda en facetas
    p.carpinteriaTramos = [{ desde: 0, modo: 'continua' }];
    aplicarCarpinteriaTramos(p);
    expect(p.niveles[iPB].carpinteria!.some(q => q.b)).toBe(true);
  });
});
