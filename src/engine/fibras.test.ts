import { describe, expect, it } from 'vitest';
import { torresPrueba } from './torresPrueba';
import { aPlanilla } from './mapping';
import { calcularCorregido } from './correcciones';
import { verificarDireccion } from './flexocompresion';
import { fibrasDireccion, peorFibraPorMuro } from './fibras';
import { ejemploGuia, type Proyecto } from './modelo';

function base(p: Proyecto) {
  const asig = aPlanilla(p);
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const corr = calcularCorregido(asig.datos, asig.filaNivel[iPB] ?? 50, { proyecto: p, piezas: asig.piezas });
  return { asig, corr };
}

describe('fibras de los tabiques en altura', () => {
  const casos = [ejemploGuia(), ...torresPrueba()];
  casos.forEach(p => it(`${p.nombre}: en PB da lo mismo que la flexocompresión`, () => {
    const { asig, corr } = base(p);
    (['A', 'B'] as const).forEach(dir => {
      const fs = fibrasDireccion(p, asig.piezas, corr, asig.filaNivel, dir, 300);
      const vs = verificarDireccion(p, asig.piezas, corr, asig.filaNivel, dir, 300);
      expect(fs.map(f => f.nombre)).toEqual(vs.map(v => v.nombre));
      fs.forEach((f, i) => {
        const pb = f.niveles[0];
        expect(pb.z).toBeCloseTo(0, 6);
        expect(pb.v.M).toBeCloseTo(vs[i].M, 6);
        pb.v.muros.forEach((m, j) => {
          expect(m.traccion).toBeCloseTo(vs[i].muros[j].traccion, 6);
          expect(m.compresion).toBeCloseTo(vs[i].muros[j].compresion, 6);
        });
      });
    });
  }));

  it('en altura: N y M bajan hacia arriba, y la compresión por peso también', () => {
    const p = ejemploGuia();
    const { asig, corr } = base(p);
    const fs = fibrasDireccion(p, asig.piezas, corr, asig.filaNivel, 'A', 300);
    fs.forEach(f => {
      for (let i = 1; i < f.niveles.length; i++) {
        const a = f.niveles[i - 1], b = f.niveles[i];
        expect(b.z).toBeGreaterThan(a.z);
        expect(Math.abs(b.v.M)).toBeLessThanOrEqual(Math.abs(a.v.M) + 1e-9);
        b.v.muros.forEach((m, j) => expect(m.Ndesc).toBeLessThan(a.v.muros[j].Ndesc));
      }
      // el último piso: una losa arriba (la azotea) y el peso de un piso de muro
      const ult = f.niveles[f.niveles.length - 1];
      expect(ult.v.muros[0].losaDesc).toBeCloseTo(0.7 * p.muros.find(m => m.id === ult.v.muros[0].id)!.areaInf * (ult.v.muros[0].A / ult.v.muros.filter(x => x.id === ult.v.muros[0].id).reduce((s, x) => s + x.A, 0)), 6);
    });
  });

  it('un muro que se afina arriba: sección y peso del tramo delgado', () => {
    const p = ejemploGuia();
    const m = p.muros[0];
    const zs = p.niveles.map(n => n.cota).filter(z => z > 0).sort((a, b) => a - b);
    const zc = zs[Math.floor(zs.length / 2)];
    m.espesores = [{ desde: zc, e: m.espesor / 2 }];
    const { asig, corr } = base(p);
    const dir = (['A', 'B'] as const).find(d => asig.piezas.some(pz => pz.dir === d && pz.muros.includes(m.id)))!;
    const fs = fibrasDireccion(p, asig.piezas, corr, asig.filaNivel, dir, 300);
    const f = fs.find(x => x.niveles[0].v.muros.some(y => y.id === m.id))!;
    const arriba = f.niveles.find(n => n.z >= zc - 1e-6)!, abajo = [...f.niveles].reverse().find(n => n.z < zc - 1e-6)!;
    const Aa = arriba.v.muros.filter(x => x.id === m.id).reduce((s, x) => s + x.A, 0), Ab = abajo.v.muros.filter(x => x.id === m.id).reduce((s, x) => s + x.A, 0);
    expect(Aa).toBeLessThan(Ab);
    // peso propio en el corte del cambio = A_arriba · (altura restante) · 2,4
    const top = p.niveles[0].cota;
    const Pp = arriba.v.muros.filter(x => x.id === m.id).reduce((s, x) => s + x.Pp, 0);
    expect(Pp).toBeCloseTo(Aa * (top - arriba.z) * 2.4, 6);
    const mapa = peorFibraPorMuro(fs);
    expect(mapa.get(m.id)!.length).toBe(f.niveles.length);
  });
});

describe('fibras con exoesqueleto', () => {
  it('con el momento que les queda a los tabiques: cada pieza toma su misma fracción de ese momento', () => {
    const p = ejemploGuia();
    const { asig, corr } = base(p);
    const sin = fibrasDireccion(p, asig.piezas, corr, asig.filaNivel, 'A', 300);
    const mitad = (z: number) => { const j = p.niveles.findIndex(n => Math.abs(n.cota - z) < 1e-6); return 0.4 * corr.guia.mnyq.J[asig.filaNivel[j]]; };
    const con = fibrasDireccion(p, asig.piezas, corr, asig.filaNivel, 'A', 300, mitad);
    con.forEach((f, i) => f.niveles.forEach((nv, k) => {
      expect(nv.v.M).toBeCloseTo(0.4 * sin[i].niveles[k].v.M, 6);
      // el peso no cambia: la compresión pura −N/A es la misma
      nv.v.muros.forEach((m, j) => expect(m.Ndesc).toBeCloseTo(sin[i].niveles[k].v.muros[j].Ndesc, 9));
    }));
  });
});
