import { describe, expect, it } from 'vitest';
import { celdasDeCara, geometria3D } from '../src/viento/geometria3d';
import { mallaTorre, stlTorre } from '../src/viento/malla3d';

const cuadro = (a: number) => [{ x: 0, y: 0 }, { x: a, y: 0 }, { x: a, y: a }, { x: 0, y: a }];
/** volumen con signo de un STL binario (teorema de la divergencia): positivo si las normales miran hacia afuera */
function volumen(buf: ArrayBuffer): { n: number; v: number } {
  const dv = new DataView(buf), n = dv.getUint32(80, true); let v = 0;
  for (let k = 0; k < n; k++) {
    const p = Array.from({ length: 9 }, (_, j) => dv.getFloat32(84 + 50 * k + 12 + 4 * j, true));
    v += (p[0] * (p[4] * p[8] - p[5] * p[7]) - p[1] * (p[3] * p[8] - p[5] * p[6]) + p[2] * (p[3] * p[7] - p[4] * p[6])) / 6;
  }
  return { n, v };
}

describe('torre como superficie y en STL', () => {
  it('STL: un prisma cerrado por piso, con las normales hacia afuera', () => {
    const r = volumen(stlTorre([{ cota: 0, silueta: cuadro(10) }, { cota: 3, silueta: cuadro(10) }, { cota: 6, silueta: [...cuadro(6)].reverse() }]));
    expect(r.n).toBe(24);                                              // 2 pisos × (8 laterales + 2 + 2 tapas)
    expect(r.v).toBeCloseTo(10 * 10 * 3 + 10 * 10 * 3, 3);            // el último nivel es la azotea: no suma volumen
  });
  it('STL de una planta curva: volumen = área × alto', () => {
    const circ = Array.from({ length: 48 }, (_, i) => ({ x: 5 * Math.cos((2 * Math.PI * i) / 48), y: 5 * Math.sin((2 * Math.PI * i) / 48) }));
    const area = 0.5 * 48 * 25 * Math.sin((2 * Math.PI) / 48);
    expect(volumen(stlTorre([{ cota: 0, silueta: circ }, { cota: 4, silueta: circ }])).v).toBeCloseTo(area * 4, 2);
  });
  it('la malla: casi todas las fachadas encuentran su celda de cara', () => {
    const g = geometria3D({ niveles: [{ cota: 0, silueta: cuadro(20) }, { cota: 30, silueta: cuadro(12) }, { cota: 60, silueta: cuadro(12) }], dir: 'B', nx: 96, ny: 48, nz: 40 });
    const cs = celdasDeCara(g), m = mallaTorre(g, cs);
    const esTapa = (t: { desde: number; n: number }) => { const z = m.pos[3 * t.desde + 2]; return Array.from({ length: t.n }, (_, i) => m.pos[3 * (t.desde + i) + 2]).every(v => v === z); };
    const lat = m.trozos.filter(t => !esTapa(t));
    expect(lat.filter(t => t.caras.length).length / lat.length).toBeGreaterThan(0.95);
    expect(m.pos.length).toBe(3 * m.trozos.reduce((s, t) => s + t.n, 0));
    // la azotea y el retiro tienen celdas de cubierta
    expect(m.trozos.filter(t => esTapa(t) && t.caras.length && t.caras.every(k => cs[k].nz === 1)).length).toBe(2);
  });
});
