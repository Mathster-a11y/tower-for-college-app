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
