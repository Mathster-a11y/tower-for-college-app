/**
 * Guía de cálculo: cada ecuación dibujada tiene que ser la cuenta del motor. Con los valores de lo que usa, su
 * función tiene que dar el valor que muestra la tarjeta (que sale del motor), en todos los capítulos, para los dos
 * vientos y cada pieza.
 */
import { describe, expect, it } from 'vitest';
import { ejemploGuia, type Proyecto } from '../../engine/modelo';
import { calcularProyecto } from '../estado';
import { referencias, type Grafo } from '../grafo';
import { grafoGuia } from './guia';
import { grafoPlanilla } from './planilla';
import { grafoCirsoc } from './cirsoc';
import { grafoFlujo } from './flujo';
import { grafoFem } from './fem';

export function comprobar<D, R>(g: Grafo<D, R>): string[] {
  const fallas: string[] = [];
  const d = g.datos(), r = g.calcular(d);
  for (const cap of g.capitulos) {
    const val = (id: string): number | null => {
      const p = cap.params.find(x => x.id === id);
      if (p) return p.get(d);
      const n = cap.nodos.find(x => x.id === id);
      const v = n?.valor(r);
      return v === undefined || v === null ? null : v;
    };
    for (const n of cap.nodos) {
      for (const ref of [...referencias(n.ec), ...(n.control ? referencias(n.control.cond) : [])])
        if (!cap.params.some(x => x.id === ref) && !cap.nodos.some(x => x.id === ref)) fallas.push(`${cap.id}.${n.id}: usa ${ref}, que no existe`);
      if (!n.f) continue;
      const x: Record<string, number> = {};
      let falta = false;
      for (const ref of referencias(n.ec)) { const v = val(ref); if (v === null || !isFinite(v)) falta = true; else x[ref] = v; }
      const v = n.valor(r);
      if (falta || v === null || v === undefined || !isFinite(v)) continue;
      const c = n.f(x);
      if (!(Math.abs(c - v) <= 1e-6 * Math.max(1, Math.abs(v)))) fallas.push(`${cap.id}.${n.id}: ecuación ${c} ≠ motor ${v}`);
    }
  }
  return fallas;
}

const conMetodo = (p: Proyecto, metodo: 'guia'): Proyecto => ({ ...p, calculo: { metodo, version: 'actual', armado: 'app' } });

describe('guía de cálculo: método de la guía', () => {
  const p = conMetodo(ejemploGuia(), 'guia'), c = calcularProyecto(p);
  for (const dir of ['A', 'B'] as const) {
    const piezas = c.asig.piezas.filter(x => x.dir === dir && x.filaHoja !== null);
    it.each(piezas.map(x => x.nombre))(`viento ${dir}, %s: cada ecuación da lo del motor`, pieza => {
      expect(comprobar(grafoGuia(p, c.asig.piezas, { dir, pieza, muro: '' }))).toEqual([]);
    });
  }
  it('números de la guía: Q en PB, ΣJ, T1', () => {
    const g = grafoGuia(p, c.asig.piezas, { dir: 'A', pieza: 'T1', muro: '' }), r = g.calcular(g.datos());
    const v = (cap: string, id: string) => g.capitulos.find(x => x.id === cap)!.nodos.find(x => x.id === id)!.valor(r)!;
    console.log('Q', v('viento', 'Q'), 'SJ', v('rigidez', 'SJ'), 'f', v('rigidez', 'fl'), 'vuelco', v('estabilidad', 'FS'), 'st', v('flexo', 'st'), 'sc', v('flexo', 'sc'), 'Cps', r.d.viento.Cps, 'p', v('viento', 'p'));
    expect(v('rigidez', 'SJ')).toBeCloseTo(22.08, 2);
  });
});

describe('guía de cálculo: planilla de la cátedra', () => {
  for (const version of ['actual', 'nuevo'] as const) {
    const p: Proyecto = { ...ejemploGuia(), calculo: { metodo: 'planilla', version, armado: 'app' } }, c = calcularProyecto(p);
    const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
    for (const dir of ['A', 'B'] as const) {
      const piezas = c.asig.piezas.filter(x => x.dir === dir && x.filaHoja !== null);
      it.each(piezas.map(x => x.nombre))(`${version}, viento ${dir}, %s`, pieza => {
        const g = grafoPlanilla(c.asig.datos, c.asig.piezas, c.asig.filaNivel[iPB], p.hormigon || 'H30', version, { dir, pieza });
        expect(comprobar(g)).toEqual([]);
        // los mismos números que la planilla de la app
        const r = g.calcular(g.datos());
        expect(r.res.mnyq.L99).toBeCloseTo(c.res.mnyq.L99, 9);
        expect(r.res.flex.O).toEqual(c.res.flex.O);
      });
    }
  }
  it('números de la planilla: T1', () => {
    const p: Proyecto = { ...ejemploGuia(), calculo: { metodo: 'planilla', version: 'actual', armado: 'app' } }, c = calcularProyecto(p);
    const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
    const g = grafoPlanilla(c.asig.datos, c.asig.piezas, c.asig.filaNivel[iPB], 'H30', 'actual', { dir: 'A', pieza: 'T1' }), r = g.calcular(g.datos());
    const v = (cap: string, id: string) => g.capitulos.find(x => x.id === cap)!.nodos.find(x => x.id === id)!.valor(r)!;
    console.log('Q', v('viento', 'Q'), 'Mv', v('viento', 'Mv'), 'SJ', v('rigidez', 'SJ'), 'sc', v('flexo', 'O'), 'st', v('flexo', 'P'), 'Cps', r.d.viento.Cps);
    expect(v('viento', 'Q')).toBeCloseTo(125.8, 1);
  });
});

describe('guía de cálculo: CIRSOC y FEM', () => {
  for (const metodo of ['cirsoc', 'fem'] as const) {
    const p: Proyecto = { ...ejemploGuia(), calculo: { metodo, verificacion: 'completa' } }, c = calcularProyecto(p);
    for (const dir of ['A', 'B'] as const) {
      const piezas = c.asig.piezas.filter(x => x.dir === dir && x.filaHoja !== null).slice(0, dir === 'A' ? 6 : 2);
      it.each(piezas.map(x => x.nombre))(`${metodo}, viento ${dir}, %s`, pieza => {
        const g = grafoCirsoc(p, metodo, { dir, pieza, muro: '' });
        expect(comprobar(g)).toEqual([]);
      });
    }
  }
  it('números del CIRSOC: Q en PB, n1, Gf', () => {
    const p: Proyecto = { ...ejemploGuia(), calculo: { metodo: 'cirsoc', verificacion: 'completa' } };
    const g = grafoCirsoc(p, 'cirsoc', { dir: 'A', pieza: 'T1', muro: '' }), r = g.calcular(g.datos());
    const v = (cap: string, id: string) => g.capitulos.find(x => x.id === cap)!.nodos.find(x => x.id === id)!.valor(r)!;
    console.log('Q', v('viento', 'Q'), 'n1', v('viento', 'n1'), 'G', v('viento', 'G'), 'FS', v('estabilidad', 'FS'), 'rho', v('flexo', 'rho'), 'p1', v('roto', 'p1'));
    expect(v('viento', 'Q')).toBeCloseTo(422.1, 0);
  });
});

describe('guía de cálculo: flujo de viento', () => {
  it('cada ecuación da lo mismo; con St = 0,168 y n1 = 0,36 Hz, Vcr ≈ 43 m/s < 58,8', () => {
    const g = grafoFlujo({ U0: 0.1, D: 40, Re: 1000, cs: 0.16, St: 0.168, V: 58.8, B: 20, n1: 0.36, nuAire: 1.5e-5 });
    expect(comprobar(g)).toEqual([]);
    const r = g.calcular(g.datos());
    expect(r.Vcr).toBeCloseTo(42.86, 1);
    expect(g.capitulos[1].nodos.find(x => x.id === 'Vcr')!.control!.ok(r)).toBe(false);
  });
});

describe('guía de cálculo: FEM (matrices)', () => {
  for (const teoria of ['timoshenko', 'euler'] as const) {
    const p: Proyecto = { ...ejemploGuia(), calculo: { metodo: 'fem', teoria } };
    for (const [dir, pieza] of [['A', 'T1'], ['A', 'T5'], ['B', 'T1B']] as const) {
      it(`${teoria}, viento ${dir}, ${pieza}: cada ecuación da lo del motor`, () => {
        const g = grafoFem(p, teoria, { dir, pieza });
        expect(comprobar(g)).toEqual([]);
      });
    }
  }
  it('números del FEM: n1 y parte de T1', () => {
    const p: Proyecto = { ...ejemploGuia(), calculo: { metodo: 'fem', teoria: 'timoshenko' } };
    const g = grafoFem(p, 'timoshenko', { dir: 'A', pieza: 'T1' }), r = g.calcular(g.datos());
    const v = (cap: string, id: string) => g.capitulos.find(x => x.id === cap)!.nodos.find(x => x.id === id)!.valor(r)!;
    console.log('n1', v('modal', 'n1'), 'parte', v('fuerzas', 'parte'), 'prot', v('fuerzas', 'prot'), 'Phi', v('pieza', 'Phi'), 'der', v('solucion', 'der'));
    expect(v('modal', 'n1')).toBeCloseTo(0.36, 1);
  });
});
