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

describe('túnel 3D con contexto', () => {
  it('los vecinos son prismas; las caras y la caja son solo de la torre', async () => {
    const { celdasDeCara, geometria3D } = await import('../src/viento/geometria3d');
    const torre = [{ x: -20, y: -9 }, { x: 20, y: -9 }, { x: 20, y: 9 }, { x: -20, y: 9 }];
    const niveles = [0, 30, 60].map(c => ({ cota: c, silueta: torre }));
    const vec = armarEscenario('costados', cajaDe(torre), 60, 'A', 20, 1.2).map(e => ({ pol: e.v, altura: e.altura }));
    const sola = geometria3D({ niveles, dir: 'A', nx: 96, ny: 48, nz: 40 });
    const con = geometria3D({ niveles, dir: 'A', nx: 96, ny: 48, nz: 40, contexto: vec });
    expect(con.vecinos).toHaveLength(2); expect(con.cuerpo).toBeDefined();
    const nCuerpo = con.cuerpo!.reduce((s, v) => s + v, 0);
    expect(nCuerpo).toBe(con.celdas);
    const nSol = (g: typeof con) => g.solido.reduce((s, v) => s + v, 0) - g.nx * g.ny;
    expect(nSol(con)).toBeGreaterThan(2 * nCuerpo);
    // las caras: todas pegadas a la torre (ninguna a un vecino)
    for (const f of celdasDeCara(con)) {
      const vecina = (f.z * con.ny + f.y - f.ny) * con.nx + f.x - f.nx;
      if (f.nz === 0) expect(con.cuerpo![vecina]).toBe(1);
    }
    expect(sola.vecinos).toHaveLength(0);
  });
});

describe('contexto desde un DXF', () => {
  it('polilíneas cerradas y círculos son edificios; la altura sale de la capa; la torre se deja afuera', async () => {
    const { contextoDesdeCAD } = await import('../src/viento/contexto');
    const { leerDXFCompleto } = await import('../src/engine/cad');
    const poli = (capa: string, pts: number[][]) => ['0', 'LWPOLYLINE', '8', capa, '90', String(pts.length), '70', '1', ...pts.flatMap(([x, y]) => ['10', String(x), '20', String(y)])];
    const dxf = ['0', 'SECTION', '2', 'ENTITIES',
      ...poli('EDIF_45', [[-60, -10], [-40, -10], [-40, 10], [-60, 10]]),
      ...poli('torres 120 m', [[40, -10], [60, -10], [60, 10], [40, 10]]),
      ...poli('VECINOS', [[-10, 40], [10, 40], [10, 60], [-10, 60]]),
      ...poli('TORRE', [[-20, -9], [20, -9], [20, 9], [-20, 9]]),
      '0', 'CIRCLE', '8', 'TANQUE_30', '10', '0', '20', '-50', '40', '6',
      ...['0', 'LINE', '8', 'EJES', '10', '0', '20', '0', '11', '10', '21', '0'],
      '0', 'ENDSEC', '0', 'EOF'].join('\n');
    const d = leerDXFCompleto(dxf);
    const r = contextoDesdeCAD(d.entidades, 1, 0, 0, 25, { x0: -20, x1: 20, y0: -9, y1: 9 });
    expect(r.edificios.map(e => e.altura)).toEqual([45, 120, 25, 30]);
    expect(r.omitidos).toBe(1); expect(r.sinAltura).toBe(1);
    expect(r.edificios[3].v.length).toBe(24);
  });
});

describe('isolíneas', () => {
  it('un campo radial da un círculo del radio del nivel', async () => {
    const { isolineas } = await import('../src/ui/campoSuave');
    const nx = 41, ny = 41, f = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) f[j * nx + i] = Math.hypot(i + 0.5 - 20.5, j + 0.5 - 20.5);
    const t = isolineas(nx, ny, f, 10, null);
    expect(t.length).toBeGreaterThan(40);
    for (const [x0, y0] of t) expect(Math.hypot(x0 - 20.5, y0 - 20.5)).toBeCloseTo(10, 0);
  });
});
