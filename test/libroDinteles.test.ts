/**
 * Hoja de dinteles en las dos planillas: con aberturas en los tabiques, el libro recalculado con el evaluador de fórmulas
 * da lo mismo que los controles de la app (guía: τ ≤ τ adm; CIRSOC: Vu ≤ φVn,máx del 201-2005 y los estribos).
 */
import { describe, expect, it } from 'vitest';
import { ejemploGuia, type Proyecto } from '../src/engine/modelo';
import { aPlanilla } from '../src/engine/mapping';
import { datosGuia } from '../src/engine/metodos/guiaPasos';
import { calcularProyecto } from '../src/ui/estado';
import { libroGuia } from '../src/xlsx/libros/libroGuia';
import { datosRenovada, libroRenovada } from '../src/xlsx/libros/libroRenovada';
import { Evaluador, esError } from '../src/xlsx/formulas';
import type { LibroK } from '../src/xlsx/kit/libro';

function conAberturas(): Proyecto {
  const p = ejemploGuia();
  p.muros.find(m => m.id === 'M1')!.aberturas = [{ s: 0, ancho: 0.6, desde: 0, alto: 2.1 }];
  p.muros.find(m => m.id === 'M2')!.aberturas = [{ s: -0.5, ancho: 0.8, desde: 0, alto: 2.2 }, { s: 0.6, ancho: 0.5, desde: 0.9, alto: 1.2 }];
  return p;
}

function evaluar(libro: LibroK, claves: Record<string, { hoja: string; ref: string }>) {
  const { libro: lb, nombres } = libro.aLibroEvaluable();
  const ev = new Evaluador(lb, nombres);
  const errores: string[] = [];
  for (const [hoja, celdas] of lb) for (const [ref, c] of celdas) if (c.f !== undefined && esError(ev.celda(hoja, ref))) errores.push(`${hoja}!${ref}: ${c.f}`);
  return { errores, val: (k: string) => { const c = claves[k]; if (!c) throw new Error(`falta la clave ${k}`); return ev.celda(c.hoja, c.ref) as number; } };
}
const nombreDe = (id: string, k: number, n: number) => `${id}${n > 1 ? ` · abertura ${k + 1}` : ''}: dintel en PB`;

describe('hoja de dinteles', () => {
  it('planilla de la guía: τ de cada dintel igual que la app', () => {
    const p = conAberturas();
    p.calculo = { metodo: 'guia', version: 'actual', armado: 'app' };
    const ctrl = calcularProyecto(p).controles.filter(x => /dintel/.test(x.nombre));
    const { libro, claves } = libroGuia(datosGuia(p, aPlanilla(p).piezas), p);
    const { errores, val } = evaluar(libro, claves);
    expect(errores.slice(0, 5)).toEqual([]);
    let n = 0;
    for (const m of p.muros) (m.aberturas ?? []).forEach((_, k) => {
      const c = ctrl.find(x => x.nombre === nombreDe(m.id, k, m.aberturas!.length))!;
      expect(c, m.id).toBeTruthy();
      expect(Math.abs(val(`tau_${m.id}_${k}`) - c.guia!)).toBeLessThan(1e-9 * Math.max(1, c.guia!)); n++;
    });
    expect(n).toBe(3);
  });

  it.each(['simple', 'completa'] as const)('planilla renovada (%s): Vu/φVn,máx igual que la app', nivel => {
    const p: Proyecto = { ...conAberturas(), calculo: { metodo: 'cirsoc', verificacion: nivel } };
    const c = calcularProyecto(p);
    const ctrl = c.controles.filter(x => /dintel/.test(x.nombre));
    const { libro, claves } = libroRenovada(datosRenovada(p, c.asig.piezas, c.cirsoc!.verif, nivel), p);
    const { errores, val } = evaluar(libro, claves);
    expect(errores.slice(0, 5)).toEqual([]);
    let n = 0;
    for (const m of p.muros) (m.aberturas ?? []).forEach((_, k) => {
      const x = ctrl.find(y => y.nombre === nombreDe(m.id, k, m.aberturas!.length))!;
      expect(x, m.id).toBeTruthy();
      expect(Math.abs(val(`dint_${m.id}_${k}`) - x.guia!)).toBeLessThan(1e-9 * Math.max(1, x.guia!));
      const avs = /estribos ([\d,]+) cm²\/m/.exec(x.nota ?? '');
      expect(val(`dintAvs_${m.id}_${k}`).toFixed(2).replace('.', ',')).toBe(avs ? avs[1] : '0,00'); n++;
    });
    expect(n).toBe(3);
    // el tabique calado entra con su corte débil al reparto y entero a la frecuencia, como la app
    for (const dir of ['A', 'B'] as const) expect(Math.abs(val(`QPB_${dir}`) - c.cirsoc!.viento[dir].QPB)).toBeLessThan(1e-9 * c.cirsoc!.viento[dir].QPB);
    for (const v of c.cirsoc!.verif) v.partes.forEach((f, k) => expect(Math.abs(val(`f${k + 1}_${v.dir}_${v.nombre}`) - f), `${v.nombre} caso ${k + 1}`).toBeLessThan(1e-9));
  });

  it('sin aberturas, la hoja lo dice y no rompe nada', () => {
    const p = ejemploGuia();
    const { libro, claves } = libroGuia(datosGuia(p, aPlanilla(p).piezas), p);
    expect(evaluar(libro, claves).errores).toEqual([]);
  });
});
