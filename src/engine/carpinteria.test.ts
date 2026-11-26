import { describe, expect, it } from 'vitest';
import { aplicarCarpinteriaTramos, comunLosas, tramoEn } from './carpinteria';
import { ejemploGuia } from './modelo';
import { cajaSilueta, carpinteriaDeNivel, rectangulo } from './silueta';
import { avisosDiseno } from './avisos';

describe('carpintería por tramos', () => {
  it('por piso con lo común partido en dos: la carpintería va por la pieza más grande y se avisa', () => {
    const p = ejemploGuia();
    const U = [[0, 0], [24, 0], [24, 24], [16, 24], [16, 8], [8, 8], [8, 24], [0, 24]].map(([x, y]) => ({ x: x - 12, y: y - 12 }));
    const L = [[2, 10], [22, 10], [22, 22], [18, 22], [18, 16], [2, 16]].map(([x, y]) => ({ x: x - 12, y: y - 12 }));
    const i15 = p.niveles.findIndex(n => n.nombre === '15º');
    p.niveles.forEach((n, i) => { n.silueta = i <= i15 ? L : U; });
    p.carpinteriaTramos = [{ desde: 0, modo: 'losa', retiro: 0.2 }];
    aplicarCarpinteriaTramos(p);
    const n14 = p.niveles[i15 + 1];                                   // entre la U (abajo) y la L (arriba)
    // la pieza más grande (la de la derecha, 60 m²): ningún punto sobre el hueco de la U
    n14.carpinteria!.forEach(q => expect(q.x).toBeGreaterThanOrEqual(4 - 1e-6));
    expect(n14.carpinteriaPartida).toEqual({ piezas: 2, area: +(5.6 * 5.6).toFixed(2) });
    expect(avisosDiseno(p).find(a => a.tipo === 'carpinteria-partida')?.texto).toMatch(/pieza más grande/);
    // el piso de abajo (U sobre U): una sola pieza, sin aviso para él
    expect(p.niveles[i15 + 2].carpinteriaPartida).toBeUndefined();
    expect(bandasFachada(p).filter(b => b.z0 === n14.cota).length).toBe(1);
    // a mano: los tramos no la tocan
    n14.carpManual = true; n14.carpinteria = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    aplicarCarpinteriaTramos(p);
    expect(n14.carpinteria.length).toBe(3); expect(n14.carpinteriaPartida).toBeUndefined();
    // a mano con la L entera (pasa sobre el hueco de la U): aviso; marcada como voladizo a propósito: sin aviso
    n14.carpinteria = L.map(q => ({ ...q }));
    expect(avisosDiseno(p).find(a => a.tipo === 'carpinteria-vacio')?.texto).toMatch(/vacío en (el )?14º/);
    n14.carpVoladizo = true;
    expect(avisosDiseno(p).filter(a => a.tipo === 'carpinteria-vacio')).toEqual([]);
  });
  it('carpintería fija: las losas se editan (a mano, perfil, loft, planos) sin tocarla', () => {
    const p = ejemploGuia();
    p.niveles.forEach(n => { n.silueta = rectangulo(20, 16); });
    p.carpinteriaTramos = [{ desde: 0, modo: 'losa', retiro: 0.3 }];
    aplicarCarpinteriaTramos(p);
    const antes = JSON.stringify(p.niveles.map(n => n.carpinteria));
    p.carpinteriaFija = true;
    p.niveles.forEach(n => { n.silueta = rectangulo(12, 10); });          // todas las losas más chicas
    aplicarCarpinteriaTramos(p);
    expect(JSON.stringify(p.niveles.map(n => n.carpinteria))).toBe(antes);
    // queda fuera de las losas: se avisa
    expect(avisosDiseno(p).some(a => a.tipo === 'carpinteria-fuera')).toBe(true);
    // que siga a las losas: vuelve a ser lo común metido 0,30 m
    delete p.carpinteriaFija; aplicarCarpinteriaTramos(p);
    expect(cajaSilueta(p.niveles[3].carpinteria!)).toMatchObject({ B: 11.4, L: 9.4 });
  });
  it('lo común a dos losas: la de adentro si una contiene a la otra; recorte exacto con una convexa', () => {
    expect(comunLosas(rectangulo(20, 16), rectangulo(10, 8))).toEqual({ v: rectangulo(10, 8), piezas: [rectangulo(10, 8)], exacto: true });
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

import { aplicarPlanosCorte } from './planos_corte';
describe('grilla a plomo en la corona recortada a 45° (como el Citicorp)', () => {
  const armar = (forma: 'plana' | 'curva') => {
    const p = ejemploGuia(); const z = (nom: string) => p.niveles.find(n => n.nombre === nom)!.cota;
    p.niveles.forEach(n => { n.silueta = null; }); p.niveles.find(n => n.nombre === 'PB')!.silueta = rectangulo(20, 16);
    p.planosCorte = [{ id: 'P1', eje: 'x', a: { w: -10, z: z('15º') }, b: { w: 10, z: z('15º') + 20 } }];
    aplicarPlanosCorte(p);
    p.carpinteriaTramos = [{ desde: 0, modo: 'continua', forma }];
    p.paneleria = { modulo: 1.5, antepecho: 0.9 };
    aplicarCarpinteriaTramos(p);
    return { p, r: calcularPaneleria(bandasFachada(p), p.paneleria) };
  };
  for (const forma of ['plana', 'curva'] as const) {
    it(`${forma}: los montantes no se tuercen (suben a plomo o por la pendiente del plano, nunca en diagonal)`, () => {
      const { r } = armar(forma);
      r.montantes.forEach(([a, b]) => { const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y); expect(Math.min(dx, dy)).toBeLessThan(1e-3); });
      if (forma === 'plana') expect(r.alabeados).toBe(0);
    });
  }
  it('plana: la corona inclinada es una sola cara con una sola grilla (los montantes de un piso siguen en el de arriba)', () => {
    const { r } = armar('plana');
    // montantes de la cara inclinada (los que suben corriéndose en x): sus y forman una sola serie pareja
    const ys = [...new Set(r.montantes.filter(([a, b]) => Math.abs(b.x - a.x) > 1e-3).map(([a]) => a.y.toFixed(3)))].map(Number).sort((a, b) => a - b);
    expect(ys.length).toBe(Math.ceil(16 / 1.5) + 1);
    ys.forEach((y, i) => i && expect(y - ys[i - 1]).toBeCloseTo(16 / Math.ceil(16 / 1.5), 2));
  });
});

import { divisiones } from './carpinteria';
describe('grilla por reglas (reparto de montantes)', () => {
  const anchos = (xs: number[]) => xs.slice(1).map((x, i) => +(x - xs[i]).toFixed(6));
  it('parejo: partes iguales sin pasar del módulo', () => {
    expect(anchos(divisiones(14, { modulo: 1.5 }))).toEqual(Array(10).fill(1.4));
  });
  it('fijo desde el inicio, centrado y desde el final', () => {
    expect(anchos(divisiones(14, { modulo: 1.5, regla: 'fijo', origen: 'inicio' }))).toEqual([...Array(9).fill(1.5), 0.5]);
    expect(anchos(divisiones(14, { modulo: 1.5, regla: 'fijo', origen: 'fin' }))).toEqual([0.5, ...Array(9).fill(1.5)]);
    expect(anchos(divisiones(14, { modulo: 1.5, regla: 'fijo', origen: 'centro' }))).toEqual([0.25, ...Array(9).fill(1.5), 0.25]);
  });
  it('fijo con desfase: la modulación se corre', () => {
    expect(anchos(divisiones(6, { modulo: 1.5, regla: 'fijo', origen: 'inicio', desfase: 0.5 }))).toEqual([0.5, 1.5, 1.5, 1.5, 1]);
  });
  it('en la panelería: una cara de 20 m con módulo fijo centrado de 1,5 m', () => {
    const r = puntosSilueta(rectangulo(20, 16), 8);
    const res = calcularPaneleria([{ z0: 0, z1: 3, modo: 'losa', a: r, b: r }], { modulo: 1.5, regla: 'fijo', origen: 'centro' });
    // 20 = 13 × 1,5 + 0,5 → 15 paños por cara de 20 m; 16 = 10 × 1,5 + 1 → 12 por cara de 16 m
    expect(res.paneles.length).toBe(2 * (15 + 12));
  });
});

describe('tolerancia de alabeo', () => {
  it('una torre retorcida: con «plano» los paños se parten; con «libre» ninguno pasa la tolerancia', () => {
    const p = ejemploGuia();
    p.niveles.forEach(n => { n.silueta = null; });
    p.niveles.find(n => n.nombre === 'PB')!.silueta = rectangulo(20, 16);
    p.perfilTorre = { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 1 }], giro: 1 };
    aplicarPerfil(p);
    p.carpinteriaTramos = [{ desde: 0, modo: 'continua', forma: 'plana' }];
    aplicarCarpinteriaTramos(p);
    const b = bandasFachada(p);
    const plano = calcularPaneleria(b, { modulo: 1.5 }), frio = calcularPaneleria(b, { modulo: 1.5, alabeoMax: 0.015 }), libre = calcularPaneleria(b, { modulo: 1.5, alabeoMax: -1 });
    expect(plano.alabeados).toBeGreaterThan(0);
    expect(frio.alabeados).toBeLessThan(plano.alabeados);
    expect(frio.curvados).toBeGreaterThan(0);
    expect(libre.alabeados).toBe(0);
  });
});

describe('caras de la fachada', () => {
  it('cada cara plana tiene nombre e id; se puede hacer opaca, abierta o con módulo propio', () => {
    const r0 = puntosSilueta(rectangulo(20, 16), 8);
    const b = [{ z0: 0, z1: 3, modo: 'losa' as const, a: r0, b: r0, plana: true }, { z0: 3, z1: 6, modo: 'losa' as const, a: r0, b: r0, plana: true }];
    const base = calcularPaneleria(b, { modulo: 1.5 });
    expect(base.carasInfo.map(c => c.nombre)).toEqual(['C1', 'C2', 'C3', 'C4']);
    const c = base.carasInfo.find(x => x.mira === 'y−')!;                 // la cara de 20 m que mira a y−
    expect(c.ancho).toBeCloseTo(20, 6); expect(c.z1).toBe(6);
    const enC = (r: ReturnType<typeof calcularPaneleria>) => r.paneles.filter(x => x.cara === c.id);
    expect(enC(base).length).toBe(2 * 14);
    expect(enC(calcularPaneleria(b, { modulo: 1.5, caras: [{ id: c.id, tipo: 'opaca' }] })).every(x => x.opaco)).toBe(true);
    expect(enC(calcularPaneleria(b, { modulo: 1.5, caras: [{ id: c.id, tipo: 'abierta' }] })).length).toBe(0);
    expect(enC(calcularPaneleria(b, { modulo: 1.5, caras: [{ id: c.id, modulo: 2.5 }] })).length).toBe(2 * 8);
  });
});

describe('carpintería por el borde exterior', () => {
  it('cierra un pozo angosto y sigue el brazo ancho de una L', async () => {
    const { cerrarEntrantes } = await import('./carpinteria');
    // cuadrado de 20 con un pozo de 3 m de boca y 4 de fondo en el lado de abajo
    const pozo = [{ x: -10, y: -10 }, { x: -1.5, y: -10 }, { x: -1.5, y: -6 }, { x: 1.5, y: -6 }, { x: 1.5, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }];
    const c = cerrarEntrantes(pozo, 4);
    const ar = (q: { x: number; y: number }[]) => Math.abs(q.reduce((s, a, i) => { const b = q[(i + 1) % q.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2);
    expect(ar(c)).toBeCloseTo(400, 6);
    expect(cerrarEntrantes(pozo, 2)).toBe(pozo);                 // boca de 3 m > 2: lo sigue
    // L de 20 × 20 sin el cuarto de 10 × 10: la boca del entrante mide 14,1 m
    const L = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 20 }, { x: 0, y: 20 }];
    expect(cerrarEntrantes(L, 6)).toBe(L);
  });
});
