import { describe, expect, it } from 'vitest';
import { armarEscenario, cajaDe, pisaLaTorre, vecinosEnCorte } from '../src/viento/contexto';
import { leerProyecto } from '../src/engine/lector';
import { ejemploGuia } from '../src/engine/modelo';

const caja = { x0: -20, x1: 20, y0: -9, y1: 9 };
describe('contexto urbano', () => {
  it('fila a barlovento: con el viento A queda en −y; con el B, en −x; nunca pisa la torre', () => {
    const a = armarEscenario('fila', caja, 100, 'A', 20, 1), b = armarEscenario('fila', caja, 100, 'B', 20, 1);
    expect(a).toHaveLength(3); expect(a.every(e => cajaDe(e.v).y1 < caja.y0)).toBe(true);
    expect(b.every(e => cajaDe(e.v).x1 < caja.x0)).toBe(true);
    for (const t of ['fila', 'costados', 'damero', 'ejemplo'] as const) for (const d of ['A', 'B'] as const) expect(armarEscenario(t, caja, 100, d, 20, 1).some(e => pisaLaTorre(e, caja))).toBe(false);
  });
  it('costados: la calle mide la separación', () => {
    const c = armarEscenario('costados', caja, 100, 'A', 22, 1).map(e => cajaDe(e.v));
    expect(caja.x0 - c[0].x1).toBeCloseTo(22, 6); expect(c[1].x0 - caja.x1).toBeCloseTo(22, 6);
  });
  it('en cada corte entran los que llegan a esa altura', () => {
    const e = armarEscenario('ejemplo', { x0: -20.05, x1: 20.05, y0: -9.25, y1: 9.25 }, 118.8, 'A', 20, 1);
    expect(vecinosEnCorte(e, 12)).toHaveLength(8); expect(vecinosEnCorte(e, 60)).toHaveLength(5); expect(vecinosEnCorte(e, 105)).toHaveLength(3);
  });
  it('el lector guarda el contexto y saca lo que no sirve, con aviso', () => {
    const p = ejemploGuia() as unknown as Record<string, unknown>;
    p.contexto = { edificios: [...armarEscenario('costados', caja, 60, 'A', 20, 1), { id: 'X', nombre: '', v: [{ x: 0, y: 0 }], altura: 10 }] };
    const r = leerProyecto(JSON.parse(JSON.stringify(p)));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.proyecto.contexto?.edificios).toHaveLength(2); expect(r.avisos.some(a => /contexto urbano/.test(a))).toBe(true); }
  });
});

describe('túnel 2D con contexto', () => {
  it('la escala es la de la torre, el canal se agranda y la fuerza se mide solo sobre la torre', async () => {
    const { geometria2D } = await import('../src/viento/geometria2d');
    const torre = [{ x: -20, y: -9 }, { x: 20, y: -9 }, { x: 20, y: 9 }, { x: -20, y: 9 }];
    const sola = geometria2D({ poligonos: [torre], dir: 'A', D: 14, largo: 16, alto: 12, entrada: 4 });
    const vecinos = armarEscenario('damero', cajaDe(torre), 100, 'A', 20, 1).map(e => e.v);
    const con = geometria2D({ poligonos: [torre], dir: 'A', D: 14, largo: 16, alto: 12, entrada: 4, contexto: vecinos });
    expect(con.escala).toBeCloseTo(sola.escala, 9);
    expect(con.nTorre).toBe(1); expect(con.contornos).toHaveLength(1 + vecinos.length);
    expect(con.nx * con.ny).toBeGreaterThan(sola.nx * sola.ny);
    expect(con.cuerpo).toBeDefined();
    const nCuerpo = con.cuerpo!.reduce((s, v) => s + v, 0), nSolido = con.solido.reduce((s, v) => s + v, 0);
    expect(nCuerpo).toBe(con.celdasTorre); expect(nSolido).toBeGreaterThan(4 * nCuerpo);
    // todo el grupo adentro del canal, con lugar a la entrada
    for (const p of con.contornos) for (const q of p) { expect(q.x).toBeGreaterThan(3 * con.D); expect(q.y).toBeGreaterThan(0); expect(q.y).toBeLessThan(con.ny); }
  });
});
