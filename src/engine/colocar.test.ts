import { describe, expect, it } from 'vitest';
import { ejemploGuia, type Camino, type Proyecto } from './modelo';
import { alinear, aplicar, bulgeTresPuntos, cajaSel, copiarCon, distribuir, invertirCamino, largoCamino, matrizCamino, matrizPolar, matrizRect, puntoEn, unirCaminos, caminoDesdeCAD } from './colocar';
import { agruparNodos, grupoPorId, murosDe, sincronizarComponentes } from './grupos';
import { cotaDesdeCursor, geometria, puntoCota } from './cotas';
import { nodosMuro } from './dibujo';
import { aPlanilla } from './mapping';

const clon = (p: Proyecto) => JSON.parse(JSON.stringify(p)) as Proyecto;
const nucleo = { m: ['M5', 'M6', 'M7'], g: [] as string[] };

describe('transformaciones', () => {
  it('mover y girar 4 veces vuelve al lugar; girar cambia la dirección', () => {
    const p = ejemploGuia(), antes = clon(p).muros;
    expect(aplicar(p, nucleo, { t: 'girar', c: { x: 0, y: 0 }, q: 1 })).toBeNull();
    const m5 = p.muros.find(m => m.id === 'M5')!;
    expect([m5.dir, m5.x, m5.y]).toEqual(['X', 0, -6.4]);
    aplicar(p, nucleo, { t: 'girar', c: { x: 0, y: 0 }, q: 3 });
    expect(p.muros.map(m => [m.x, m.y, m.dir])).toEqual(antes.map(m => [m.x, m.y, m.dir]));
  });
  it('simetría respecto del eje del edificio: el núcleo izquierdo cae sobre el derecho, con el mismo J', () => {
    const p = ejemploGuia();
    p.muros = p.muros.filter(m => !['M8', 'M9', 'M10'].includes(m.id));
    const r = copiarCon(p, nucleo, null, { t: 'espejar', eje: 'x', c: { x: 0, y: 0 } }, true);
    expect('error' in r).toBe(false);
    const xs = murosDe(p, (r as { id: string }).id).map(m => [m.dir, m.x, m.y]).sort();
    expect(xs).toEqual([['X', 4, -1.9], ['X', 4, 1.9], ['Y', 6.4, 0]]);
    const jg = aPlanilla(ejemploGuia()).piezas.filter(x => x.dir === 'A').map(x => x.Jhoja).sort();
    expect(aPlanilla(p).piezas.filter(x => x.dir === 'A').map(x => x.Jhoja).sort()).toEqual(jg);
  });
  it('simetría a 45°: un muro en x pasa a y', () => {
    const p = ejemploGuia();
    aplicar(p, { m: ['M6'], g: [] }, { t: 'espejar', eje: 'd1', c: { x: 0, y: 0 } });
    const m = p.muros.find(x => x.id === 'M6')!;
    expect([m.dir, m.x, m.y]).toEqual(['Y', 1.9, -4]);
  });
  it('escalar: posiciones y largos; el espesor solo si se pide', () => {
    const p = ejemploGuia();
    aplicar(p, { m: ['M1'], g: [] }, { t: 'escalar', c: { x: 0, y: 0 }, f: 2, espesor: false });
    const m = p.muros.find(x => x.id === 'M1')!;
    expect([m.x, m.y, m.largo, m.espesor]).toEqual([-19.8, 11.5, 9, 0.2]);
  });
  it('lo bloqueado no se transforma', () => {
    const p = ejemploGuia();
    const g = agruparNodos(p, ['M1'], [], null) as { id: string };
    grupoPorId(p, g.id)!.bloq = true;
    expect(aplicar(p, { m: [], g: [g.id] }, { t: 'mover', dx: 1, dy: 0 })).toMatch(/bloqueados/);
  });
});

describe('matrices', () => {
  it('rectangular de columnas: 3 × 4 con copias vinculadas', () => {
    const p = ejemploGuia();
    p.muros.push({ id: 'C1', dir: 'Y', x: 0, y: 0, largo: 0.4, espesor: 0.4, llega: true, areaInf: 10, piezaA: 'K1', pegadoA: '', piezaB: 'K1B', pegadoB: '' });
    const r = matrizRect(p, { m: ['C1'], g: [] }, null, 3, 4, 5, 6, true);
    if ('error' in r) throw new Error(r.error);
    expect(r.copias).toBe(11);
    const ms = murosDe(p, r.grupo);
    expect(ms.length).toBe(12);
    expect(new Set(ms.map(m => `${m.x},${m.y}`)).size).toBe(12);
    expect(Math.max(...ms.map(m => m.x))).toBe(15);
    expect(Math.max(...ms.map(m => m.y))).toBe(12);
    // cada columna es su propia pieza
    expect(new Set(ms.map(m => m.piezaA)).size).toBe(12);
    // vinculadas: agrandar una agranda todas
    const previo = clon(p);
    p.muros.find(m => m.id === 'C1')!.largo = 0.6;
    sincronizarComponentes(previo, p);
    expect(murosDe(p, r.grupo).every(m => m.largo === 0.6)).toBe(true);
  });
  it('polar de 4 tabiques a 90°, girando: quedan en cruz', () => {
    const p = ejemploGuia();
    p.muros = [{ id: 'T', dir: 'X', x: 3, y: 0, largo: 2, espesor: 0.2, llega: true, areaInf: 1, piezaA: 'Z', pegadoA: '', piezaB: 'ZB', pegadoB: '' }];
    const r = matrizPolar(p, { m: ['T'], g: [] }, null, { x: 0, y: 0 }, 4, 360, true, false);
    if ('error' in r) throw new Error(r.error);
    const ms = murosDe(p, r.grupo).map(m => [m.dir, m.x, m.y]).sort();
    expect(ms).toEqual([['X', -3, 0], ['X', 3, 0], ['Y', 0, -3], ['Y', 0, 3]]);
  });
  it('polar de 6 columnas: no giran (60° quedaría en diagonal) y avisa', () => {
    const p = ejemploGuia();
    p.muros = [{ id: 'C', dir: 'Y', x: 5, y: 0, largo: 0.5, espesor: 0.5, llega: true, areaInf: 1, piezaA: 'Z', pegadoA: '', piezaB: 'ZB', pegadoB: '' }];
    const r = matrizPolar(p, { m: ['C'], g: [] }, null, { x: 0, y: 0 }, 6, 360, true, false);
    if ('error' in r) throw new Error(r.error);
    expect(r.aviso).toMatch(/no giran/);
    const ms = murosDe(p, r.grupo);
    ms.forEach(m => expect(Math.hypot(m.x, m.y)).toBeCloseTo(5, 3));
  });
});

describe('caminos', () => {
  const recta = (id: string, a: [number, number], b: [number, number]): Camino => ({ id, nombre: id, v: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], cerrado: false });
  it('une rectas y un arco en desorden, dando vuelta las que hace falta', () => {
    const arco = caminoDesdeCAD({ t: 'arco', capa: '0', c: { x: 10, y: 5 }, r: 5, a0: 270, a1: 90 }, 'a', 'a');   // de (10,0) a (10,10) por la derecha
    const r = unirCaminos([recta('r1', [0, 0], [10, 0]), recta('r2', [0, 10], [10, 10]), arco]);
    if ('error' in r) throw new Error(r.error);
    expect(r.cerrado).toBe(false);
    const c: Camino = { id: 'x', nombre: 'x', ...r };
    expect(largoCamino(c)).toBeCloseTo(20 + Math.PI * 5, 2);
    expect(r.v[0]).toEqual({ x: 0, y: 0 });
    expect(r.v[r.v.length - 1]).toEqual({ x: 0, y: 10 });
  });
  it('cierra si las puntas coinciden y avisa la separación si no tocan', () => {
    const r = unirCaminos([recta('a', [0, 0], [4, 0]), recta('b', [4, 0], [4, 3]), recta('c', [4, 3], [0, 0])]);
    expect('error' in r ? r.error : r.cerrado).toBe(true);
    const e = unirCaminos([recta('a', [0, 0], [4, 0]), recta('b', [4.05, 0], [8, 0])]);
    expect('error' in e && e.error).toMatch(/5,0 cm/);
  });
  it('invertir dos veces da lo mismo y el arco por tres puntos es una semicircunferencia', () => {
    const b = bulgeTresPuntos({ x: 0, y: 0 }, { x: 1, y: -1 }, { x: 2, y: 0 });
    expect(Math.abs(b)).toBeCloseTo(1, 6);
    const c: Camino = { id: 'c', nombre: 'c', v: [{ x: 0, y: 0, b }, { x: 2, y: 0 }], cerrado: false };
    expect(largoCamino(c)).toBeCloseTo(Math.PI, 3);
    expect(puntoEn(c, Math.PI / 2).p.y).toBeCloseTo(-1, 2);
    expect(invertirCamino(invertirCamino(c)).v).toEqual(c.v);
  });
  it('matriz sobre un camino: 5 columnas repartidas en una L', () => {
    const p = ejemploGuia();
    p.muros = [{ id: 'C', dir: 'Y', x: 0, y: 0, largo: 0.4, espesor: 0.4, llega: true, areaInf: 1, piezaA: 'Z', pegadoA: '', piezaB: 'ZB', pegadoB: '' }];
    const cam: Camino = { id: 'L', nombre: 'L', v: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }], cerrado: false };
    const r = matrizCamino(p, { m: ['C'], g: [] }, null, cam, { n: 5, vinculada: false });
    if ('error' in r) throw new Error(r.error);
    expect(murosDe(p, r.grupo).map(m => [m.x, m.y]).sort((a, b) => a[0] - b[0] || a[1] - b[1])).toEqual([[0, 0], [4, 0], [8, 0], [8, 4], [8, 8]]);
    // por paso, con tangente: un tabique sobre la L gira en el tramo vertical
    const q = ejemploGuia();
    q.muros = [{ id: 'T', dir: 'X', x: 0, y: 0, largo: 1, espesor: 0.2, llega: true, areaInf: 1, piezaA: 'Z', pegadoA: '', piezaB: 'ZB', pegadoB: '' }];
    const r2 = matrizCamino(q, { m: ['T'], g: [] }, null, cam, { paso: 4, tangente: true, vinculada: false });
    if ('error' in r2) throw new Error(r2.error);
    const dirs = murosDe(q, r2.grupo).map(m => `${m.dir}@${m.x},${m.y}`).sort();
    expect(dirs).toEqual(['X@0,0', 'X@4,0', 'Y@8,4', 'Y@8,8', 'Y@8,0'].sort().map(x => x.replace('Y@8,0', 'X@8,0')).sort());
  });
});

describe('alinear y distribuir', () => {
  it('alinea a la izquierda y reparte con la misma separación', () => {
    const p = ejemploGuia();
    expect(alinear(p, { m: ['M1', 'M5'], g: [] }, 'izq')).toBeNull();
    const k1 = cajaSel(p, { m: ['M1'], g: [] }), k5 = cajaSel(p, { m: ['M5'], g: [] });
    expect(k1.x0).toBeCloseTo(k5.x0, 6);
    const q = ejemploGuia();
    q.muros.find(m => m.id === 'M5')!.x = -3;
    expect(distribuir(q, { m: ['M1', 'M5', 'M2'], g: [] }, 'h')).toBeNull();
    const [a, b, c] = ['M1', 'M5', 'M2'].map(id => cajaSel(q, { m: [id], g: [] }));
    expect(b.x0 - a.x1).toBeCloseTo(c.x0 - b.x1, 6);
  });
});

describe('cotas', () => {
  it('cota pegada a una esquina sigue al muro', () => {
    const p = ejemploGuia();
    const m = p.muros.find(x => x.id === 'M1')!, n = nodosMuro(m);
    const a = puntoCota(n[0], p.muros, 'M1');
    expect(a.ref?.id).toBe('M1');
    const ct = { id: 'D1', a, b: { x: 0, y: n[0].y }, tipo: 'h' as const, d: 1 };
    const v0 = geometria(p, ct).valor;
    m.x -= 1;
    expect(geometria(p, ct).valor).toBeCloseTo(v0 + 1, 6);
  });
  it('automática: arriba o abajo es horizontal; a los costados, vertical; alineada mide la distancia', () => {
    expect(cotaDesdeCursor({ x: 0, y: 0 }, { x: 4, y: 3 }, { x: 2, y: 5 }, false).tipo).toBe('h');
    expect(cotaDesdeCursor({ x: 0, y: 0 }, { x: 4, y: 3 }, { x: 6, y: 1 }, false).tipo).toBe('v');
    const c = cotaDesdeCursor({ x: 0, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 1 }, true);
    expect(geometria(ejemploGuia(), { id: 'x', a: { x: 0, y: 0 }, b: { x: 4, y: 3 }, ...c }).valor).toBeCloseTo(5, 9);
  });
});
