import { describe, expect, it } from 'vitest';
import type { Muro } from './modelo';
import { ponerPerfil } from './perfil';
import { areaPoligono, detectarJuntas, huellasLimpias, propiedadesPoligonos, type P } from './juntas';

const tab = (id: string, dir: 'X' | 'Y', x: number, y: number, largo: number, e = 0.2): Muro =>
  ({ id, dir, x, y, largo, espesor: e, llega: true, areaInf: 1, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '' });
/** muro recto en diagonal de a a b (perfil rectangular), como lo dibuja la app con «Libre» */
const diag = (id: string, a: P, b: P, e = 0.2): Muro => {
  const L = Math.hypot(b.x - a.x, b.y - a.y), nx = (-(b.y - a.y) / L) * e / 2, ny = ((b.x - a.x) / L) * e / 2;
  return ponerPerfil(tab(id, 'Y', 0, 0, 1, e), { v: [{ x: a.x + nx, y: a.y + ny }, { x: a.x - nx, y: a.y - ny }, { x: b.x - nx, y: b.y - ny }, { x: b.x + nx, y: b.y + ny }] });
};
const area = (pgs: P[][]) => pgs.reduce((s, pg) => s + Math.abs(areaPoligono(pg)), 0);
const dentro = (q: P, pg: P[]) => { let c = false; for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) { const a = pg[i], b = pg[j]; if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
/** fracción de puntos de una grilla que caen en más de un polígono (superposición) */
function superpuestos(pgs: P[][], caja: [number, number, number, number], n = 160) {
  let dos = 0;
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
    const q = { x: caja[0] + ((i + 0.5) / n) * (caja[2] - caja[0]), y: caja[1] + ((k + 0.5) / n) * (caja[3] - caja[1]) };
    if (pgs.filter(pg => dentro(q, pg)).length > 1) dos++;
  }
  return dos;
}

describe('juntas entre muros', () => {
  it('L a 90°: se detecta; con inglete la huella es la L exacta (sin hueco en la esquina ni doble conteo)', () => {
    const ms = [tab('A', 'X', 2, 0, 4), tab('B', 'Y', 0, 1.5, 3)];
    const j = detectarJuntas(ms);
    expect(j.map(x => x.tipo)).toEqual(['L']);
    const h = huellasLimpias(ms, j);
    const todos = [...h.get('A')!, ...h.get('B')!];
    // L exacta: [−0,1; 4] × [−0,1; 0,1] más [−0,1; 0,1] × [0,1; 3]
    expect(area(todos)).toBeCloseTo(4.1 * 0.2 + 0.2 * 2.9, 9);
    expect(superpuestos(todos, [-0.2, -0.2, 4.1, 3.1])).toBe(0);
    // y la esquina de afuera queda cubierta
    expect(todos.some(pg => dentro({ x: -0.09, y: -0.09 }, pg))).toBe(true);
  });
  it('L: si pasa uno, llega a la cara de afuera del otro y el otro se corta contra su cara de adentro (mismo total)', () => {
    const ms = [tab('A', 'X', 2, 0, 4), tab('B', 'Y', 0, 1.5, 3)];
    const h = huellasLimpias(ms, detectarJuntas(ms), { 'A|B': 'pasaA' });
    expect(area(h.get('A')!)).toBeCloseTo(4.1 * 0.2, 9);
    expect(area(h.get('B')!)).toBeCloseTo(2.9 * 0.2, 9);
  });
  it('T: el alma se corta contra la cara del que pasa; X: el más fino se corta en dos', () => {
    const ms = [tab('A', 'X', 0, 0, 6, 0.3), tab('B', 'Y', 0, 1.5, 3)];
    const j = detectarJuntas(ms);
    expect(j[0].tipo).toBe('T'); expect(j[0].a).toBe('B');
    const h = huellasLimpias(ms, j);
    expect(h.has('A')).toBe(false);
    expect(area(h.get('B')!)).toBeCloseTo((3 - 0.15) * 0.2, 9);
    const mx = [tab('A', 'X', 0, 0, 6, 0.3), tab('B', 'Y', 0, 0, 4)];
    const hx = huellasLimpias(mx, detectarJuntas(mx));
    expect(hx.get('B')!.length).toBe(2);
    expect(area(hx.get('B')!)).toBeCloseTo((4 - 0.3) * 0.2, 9);
  });
  it('ángulo de 60°: L en inglete y T con corte oblicuo, sin superposición', () => {
    const c = Math.cos(Math.PI / 3), s = Math.sin(Math.PI / 3);
    const ms = [tab('A', 'X', 2, 0, 4), diag('B', { x: 0, y: 0 }, { x: 3 * c, y: 3 * s })];
    const j = detectarJuntas(ms);
    expect(j.map(x => x.tipo)).toEqual(['L']);
    expect(j[0].angulo).toBeCloseTo(60, 2);
    const h = huellasLimpias(ms, j);
    const todos = [...h.get('A')!, ...h.get('B')!];
    expect(superpuestos(todos, [-0.5, -0.5, 4.2, 3])).toBe(0);
    // T inclinada: diagonal que llega al medio de un muro horizontal
    const mt = [tab('A', 'X', 0, 0, 6, 0.3), diag('B', { x: 0, y: 0 }, { x: 3 * c, y: 3 * s })];
    const jt = detectarJuntas(mt);
    expect(jt[0].tipo).toBe('T');
    const ht = huellasLimpias(mt, jt);
    const pB = ht.get('B')![0];
    // el corte de la diagonal queda sobre la cara de arriba del horizontal (y = 0,15)
    expect(Math.min(...pB.map(q => q.y))).toBeCloseTo(0.15, 9);
    expect(superpuestos([...ht.get('B')!, [{ x: -3, y: -0.15 }, { x: 3, y: -0.15 }, { x: 3, y: 0.15 }, { x: -3, y: 0.15 }]], [-3, -0.3, 3, 3])).toBe(0);
  });
  it('propiedades de los polígonos: un rectángulo da b·h³/12', () => {
    const r = propiedadesPoligonos([[{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 0.5 }, { x: 0, y: 0.5 }]]);
    expect(r.A).toBeCloseTo(1, 12); expect(r.Jx).toBeCloseTo((2 * 0.5 ** 3) / 12, 12); expect(r.Jy).toBeCloseTo((0.5 * 2 ** 3) / 12, 12);
  });
});

import { quienPasa, ejeDeMuro } from './juntas';
describe('quién pasa, como las hojas J', () => {
  const t = (id: string, dir: 'X' | 'Y', x: number, y: number, largo: number, espesor = 0.2) => ({ id, dir, x, y, largo, espesor, llega: true, areaInf: 0, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '' });
  it('L a 90°: con el viento A pasa el muro en x (el ala); con el B, el muro en y', () => {
    const ms = [t('A', 'X', 0, 0, 4), t('B', 'Y', -2, -2, 4)];
    const js = detectarJuntas(ms as never);
    expect(js[0].tipo).toBe('L');
    const largo = (h: Map<string, { x: number; y: number }[][]>, id: string) => { const pg = h.get(id)![0]; return Math.max(...pg.map(p => p.x)) - Math.min(...pg.map(p => p.x)) + Math.max(...pg.map(p => p.y)) - Math.min(...pg.map(p => p.y)); };
    const hA = huellasLimpias(ms as never, js, {}, 'A'), hB = huellasLimpias(ms as never, js, {}, 'B');
    // el que pasa llega a la cara de afuera del otro: 4 + 0,1 (+ su espesor 0,2 en la otra medida)
    expect(largo(hA, 'A')).toBeCloseTo(4.1 + 0.2, 6); expect(largo(hA, 'B')).toBeCloseTo(3.9 + 0.2, 6);
    expect(largo(hB, 'B')).toBeCloseTo(4.1 + 0.2, 6); expect(largo(hB, 'A')).toBeCloseTo(3.9 + 0.2, 6);
  });
  it('en otro ángulo pasa el más grueso; iguales, la L queda a inglete', () => {
    const e = (id: string, ang: number, e2: number) => ({ id, a: { x: 0, y: 0 }, b: { x: Math.cos(ang), y: Math.sin(ang) }, e: e2, u: { x: Math.cos(ang), y: Math.sin(ang) }, n: { x: -Math.sin(ang), y: Math.cos(ang) }, L: 1, ra: { x: 0, y: 0 }, rb: { x: Math.cos(ang), y: Math.sin(ang) } });
    const A = e('A', Math.PI / 6, 0.3), B = e('B', (2 * Math.PI) / 3, 0.2);
    expect(quienPasa(A, B, 'A')!.id).toBe('A');
    expect(quienPasa(A, e('C', (2 * Math.PI) / 3, 0.3), 'A', true)).toBeNull();
    expect(ejeDeMuro(t('Z', 'X', 0, 0, 2) as never)).not.toBeNull();
  });
});

import { conEspesor, lineaReferencia } from './juntas';
describe('línea de referencia (como ArchiCAD)', () => {
  const t = (id: string, dir: 'X' | 'Y', x: number, y: number, largo: number, refLado?: 1 | -1) => ({ id, dir, x, y, largo, espesor: 0.2, llega: true, areaInf: 0, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '', ...(refLado ? { refLado } : {}) });
  it('dos muros dibujados por su cara de afuera se enlazan en la esquina de afuera aunque sus ejes no se toquen', () => {
    // A: cara de abajo en y = 0 (cuerpo arriba: centro y = 0,1); B: cara izquierda en x = 0 (centro x = 0,1)
    const A = t('A', 'X', 2, 0.1, 4, -1), B = t('B', 'Y', 0.1, 2, 4, 1);
    expect(lineaReferencia(A as never)![0]).toEqual({ x: 0, y: 0 });
    expect(lineaReferencia(B as never)![0]).toEqual({ x: 0, y: 0 });
    const js = detectarJuntas([A, B] as never);
    expect(js.map(j => j.tipo)).toEqual(['L']);
    const h = huellasLimpias([A, B] as never, js, { 'A|B': 'inglete' });
    const area = [...h.values()].flat().reduce((s, pg) => s + Math.abs(pg.reduce((q, p, i) => q + p.x * pg[(i + 1) % pg.length].y - pg[(i + 1) % pg.length].x * p.y, 0)) / 2, 0);
    expect(area).toBeCloseTo(4 * 0.2 + (4 - 0.2) * 0.2, 9);       // la L sin doble conteo
  });
  it('al cambiar el espesor, la cara de referencia queda quieta', () => {
    const A = t('A', 'X', 2, 0.1, 4, -1);
    const B = conEspesor(A as never, 0.5);
    expect(lineaReferencia(B)![0].y).toBeCloseTo(0, 9);
    expect(B.y).toBeCloseTo(0.25, 9);
    expect(conEspesor(t('C', 'Y', 0, 0, 3) as never, 0.4).x).toBe(0);  // centrado: no se mueve
  });
});
