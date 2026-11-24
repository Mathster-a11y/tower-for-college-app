import { describe, expect, it } from 'vitest';
import { aBase64, deBase64, empaquetar, desempaquetar, huella } from '../src/viento/archivo3d';
import { geometria3D, celdasDeCara, PromedioCp } from '../src/viento/geometria3d';
import { Fuerzas3D } from '../src/viento/fuerzas3d';

describe('archivo de la corrida 3D', () => {
  it('el campo va y vuelve por base64 sin perder nada', () => {
    const a = new Float32Array(100000).map((_, i) => Math.sin(i) * 0.1);
    expect([...deBase64(aBase64(a))].every((v, i) => v === a[i])).toBe(true);
  });
  it('empaquetar y desempaquetar (con gzip si hay)', async () => {
    const o = { formato: 'x', n: [1, 2, 3], t: 'ñandú' };
    expect(await desempaquetar(await empaquetar(o))).toEqual(o);
    expect(huella({ a: 1 })).not.toBe(huella({ a: 2 }));
  });
  it('el promedio de Cp y las fuerzas se exportan e importan igual (pasando por JSON)', () => {
    const r = [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }];
    const g = geometria3D({ niveles: [0, 10, 20].map(c => ({ cota: c, silueta: r })), dir: 'A', nx: 64, ny: 32, nz: 24 });
    const caras = celdasDeCara(g), N = g.nx * g.ny * g.nz, campo = new Float32Array(4 * N).fill(1);
    const p = new PromedioCp(caras, 0.08, -1), f = new Fuerzas3D(caras, g, [{ nombre: 'PB', z: 0 }, { nombre: '1', z: 10 }, { nombre: '2', z: 20 }], 0.08, 0.1);
    for (let k = 0; k < 3; k++) { caras.forEach((c, i) => { campo[4 * c.celda + 3] = 1 + 0.001 * (i % 7) * (k + 1); }); p.sumar(campo, 4, 3); f.sumar(campo, 1, k); }
    const p2 = new PromedioCp(caras, 0.08, -1), f2 = new Fuerzas3D(caras, g, [{ nombre: 'PB', z: 0 }, { nombre: '1', z: 10 }, { nombre: '2', z: 20 }], 0.08, 0.1);
    p2.importar(JSON.parse(JSON.stringify(p.exportar()))); f2.importar(JSON.parse(JSON.stringify(f.exportar())));
    expect(p2.cp(5)).toBeCloseTo(p.cp(5), 12); expect(p2.rms(5)).toBeCloseTo(p.rms(5), 12); expect(p2.cpMin(5)).toBeCloseTo(p.cpMin(5), 12);
    expect(f2.resumen().base.Vx.media).toBeCloseTo(f.resumen().base.Vx.media, 12);
    expect(f2.resumen().pisos[1].Fx.max).toBeCloseTo(f.resumen().pisos[1].Fx.max, 12);
  });
});
