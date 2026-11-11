/**
 * Consistencia entre módulos: cada cruce compara dos caminos de cálculo independientes que tienen que dar lo mismo.
 */
import { describe, expect, it } from 'vitest';
import { ejemploGuia } from '../src/engine/modelo';
import { aPlanilla } from '../src/engine/mapping';
import { calcularPlanilla } from '../src/engine/planilla';
import { calcularCorregido } from '../src/engine/correcciones';
import { datosAlturaDe, partesDePieza, verificarDireccion, verificarPieza } from '../src/engine/flexocompresion';
import { calcFunicular, poligonoFunicular } from '../src/engine/funicular';
import { datosAltura, reparto } from '../src/engine/diagramas';

const p = ejemploGuia();
const a = aPlanilla(p);
const r = calcularPlanilla(a.datos);
const iPB = p.niveles.findIndex(n => n.nombre === 'PB');
const c = calcularCorregido(a.datos, a.filaNivel[iPB]);
const muro = (id: string) => p.muros.find(m => m.id === id)!;

describe('consistencia entre módulos', () => {
  it('J de cada pieza: geometría de sus muros = hoja J de la planilla (las dos direcciones)', () => {
    for (const pz of a.piezas) {
      const Jgeo = partesDePieza(pz.muros.map(muro), pz.dir).J;
      const Jhoja = (pz.dir === 'A' ? r.jpar : r.jort).filas[pz.filaHoja!].AY;
      expect(Jgeo, pz.nombre).toBeCloseTo(Jhoja, 6);
    }
  });

  it('flexocompresión: el método muro por muro con los datos de la planilla da los mismos σ que «Flex comp PB paralelos»', () => {
    // T1 a T4 son tabiques sueltos con peso propio en la planilla: con la misma N, el mismo M (fila O de la
    // rototraslación) y el mismo W, las tensiones tienen que coincidir.
    for (const nombre of ['T1', 'T2', 'T3', 'T4']) {
      const pz = a.piezas.find(x => x.nombre === nombre)!;
      const i = pz.filaHoja!;
      const v = verificarPieza(nombre, 'A', pz.muros.map(muro), r.rotA.O[i], datosAlturaDe(p), 300);
      const t = v.muros[0];
      // la planilla suma al área los rellenos de 0,01 (S, W, X): +0,0002 m²; se compara con tolerancia relativa 2·10⁻⁴
      const cerca = (x: number, y: number, que: string) => expect(Math.abs(x - y) / Math.abs(y), `${nombre} ${que}`).toBeLessThan(2e-4);
      cerca(t.Ndesc, r.flex.H[i], 'Ng');
      cerca(t.Ncarg, r.flex.I[i], 'Nq');
      // planilla O = (−Ng/A − M/W)·0,1 ; P = (−Nq/A + M/W)·0,1
      expect((-t.Ndesc / t.A - t.sigM) / 10, `${nombre} O`).toBeCloseTo(r.flex.O[i], 2);   // kg/cm², ±0,005
      expect((-t.Ncarg / t.A + t.sigM) / 10, `${nombre} P`).toBeCloseTo(r.flex.P[i], 2);
    }
  });

  it('rototraslación: las piezas toman entre todas el corte total y el momento total en PB', () => {
    for (const dir of ['A', 'B'] as const) {
      const rep = reparto(dir === 'A' ? c.guia.rotA : c.guia.rotB, dir === 'A' ? a.datos.rotA.H : a.datos.rotB.H, a.piezas, dir);
      expect(rep.piezas.reduce((s, x) => s + x.Qtot, 0)).toBeCloseTo(rep.Q, 6);
      expect(rep.piezas.reduce((s, x) => s + x.frac, 0)).toBeCloseTo(1, 6);   // las filas vacías (relleno 0,01) se llevan ~10⁻⁹
      const vs = verificarDireccion(p, a.piezas, c, a.filaNivel, dir, 300);
      const MPB = dir === 'A' ? c.guia.mnyq.J[a.filaNivel[iPB]] : c.guia.mnyq.O[a.filaNivel[iPB]];
      expect(vs.reduce((s, v) => s + v.M, 0) / MPB).toBeCloseTo(1, 6);
    }
  });

  it('funicular: excentricidad, hw y tercio medio iguales a M,NyQ; el polígono funicular da la misma hw', () => {
    const f = calcFunicular(p, r.mnyq, a.filaNivel, 'A');
    expect(f.e).toBeCloseTo(r.mnyq.M99, 9);
    expect(f.tercio).toBeCloseTo(r.mnyq.N99, 9);
    expect(f.verifica).toBe(r.mnyq.M99 <= r.mnyq.N99);
    const alt = datosAltura(p, r.viento, r.mnyq, a.filaNivel, 'A');
    expect(poligonoFunicular(alt.map(x => ({ z: x.z, F: x.F, nivel: x.nivel }))).zR - f.zBase).toBeCloseTo(f.hw, 6);
    expect(alt.reduce((s, x) => s + x.F, 0)).toBeCloseTo(f.W, 6);
  });

  it('el momento en la base (M,NyQ J61) es la suma de las fuerzas por su altura sobre la base', () => {
    const alt = datosAltura(p, r.viento, r.mnyq, a.filaNivel, 'A');
    const zb = alt[alt.length - 1].z;
    expect(alt.reduce((s, x) => s + x.F * (x.z - zb), 0)).toBeCloseTo(r.mnyq.J61, 4);
  });
});

describe('piezas al azar: el J de la hoja J es el de la geometría dibujada', () => {
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const entre = (a: number, b: number) => +(a + azar() * (b - a)).toFixed(2);
  it('200 piezas: tabique, T, L, C, doble T y caja, con alas que tocan o cubren el extremo del alma', () => {
    for (let k = 0; k < 200; k++) {
      const L = entre(1.5, 8), ea = entre(0.15, 0.4), b = entre(1, 6), e = entre(0.15, 0.4);
      const forma = ['tabique', 'T', 'L', 'C', 'dobleT', 'caja'][k % 6];
      const cubre = azar() > 0.5;                 // el alma llega a la cara exterior del ala
      const yAla = (lado: 1 | -1) => lado * (cubre ? L / 2 - e / 2 : L / 2 + e / 2);
      const xAla = (centrada: boolean) => (centrada ? 0 : b / 2 - ea / 2);
      const m = (id: string, dir: 'X' | 'Y', x: number, y: number, largo: number, esp: number, peg = '') =>
        ({ id, dir, x, y, largo, espesor: esp, llega: true, areaInf: 1, piezaA: 'P', pegadoA: peg, piezaB: '', pegadoB: '' });
      const muros = [m('a', 'Y', 0, 0, L, ea)];
      if (forma === 'T') muros.push(m('s', 'X', xAla(true), yAla(1), b, e, 'a'));
      if (forma === 'L') muros.push(m('s', 'X', xAla(false), yAla(1), b, e, 'a'));
      if (forma === 'C') muros.push(m('s', 'X', xAla(false), yAla(1), b, e, 'a'), m('i', 'X', xAla(false), yAla(-1), b * 0.7, e, 'a'));
      if (forma === 'dobleT') muros.push(m('s', 'X', 0, yAla(1), b, e, 'a'), m('i', 'X', 0, yAla(-1), b, e, 'a'));
      const proyecto = { ...p, muros: forma === 'caja'
        ? [{ id: 'a', dir: 'Y' as const, tipo: 'tubo-rect' as const, x: 0, y: 0, largo: b + 2 * e, ladoY: L, espesor: e, llega: true, areaInf: 1, piezaA: 'P', pegadoA: '', piezaB: '', pegadoB: '' }]
        : muros };
      const aa = aPlanilla(proyecto);
      const rr = calcularPlanilla(aa.datos);
      const pz = aa.piezas.find(x => x.nombre === 'P')!;
      const Jgeo = partesDePieza(proyecto.muros, 'A').J, Jhoja = rr.jpar.filas[pz.filaHoja!].AY;
      expect(Math.abs(Jhoja - Jgeo) / Jgeo, `${k} ${forma} ${cubre ? 'cubre' : 'toca'}: hoja ${Jhoja} geometría ${Jgeo}`).toBeLessThan(5e-4);
    }
  });
});
