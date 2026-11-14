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
