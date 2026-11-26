/**
 * El cálculo en segundo plano da lo mismo que en el momento: el mismo cálculo, los mismos controles del exo (que en el
 * momento suma la interfaz), y todo se puede copiar entre hilos. Lo que el worker ya hizo del exo, la interfaz lo usa
 * sin repetirlo y con los mismos números.
 */
import { describe, expect, it } from 'vitest';
import { calcularPedido } from './calculoEnFondo';
import { calcularProyecto } from './calculoProyecto';
import { ExoDeCalculo } from './exoDeCalculo';
import { ejemploCiticorpFachada } from './ejemploCiticorpFachada';
import { ejemploHancock, ejemploGherkin } from './ejemplosExo';
import { esfuerzosFem } from './metodos/fem';
import * as exo from './exo';
import type { Proyecto } from './modelo';
import { vi } from 'vitest';

const con = (p: Proyecto, metodo: string) => { p.calculo = { ...(p.calculo ?? {}), metodo } as Proyecto['calculo']; return p; };

describe('cálculo en segundo plano', () => {
  for (const [nombre, f] of [['Citicorp', ejemploCiticorpFachada], ['Hancock', ejemploHancock], ['Gherkin', ejemploGherkin]] as const) {
    for (const metodo of ['planilla', 'cirsoc', 'fem']) {
      it(`${nombre} con ${metodo}: lo mismo que en el momento, y se copia entre hilos`, () => {
        const p = con(f(), metodo);
        const r = calcularPedido({ revision: 7, proyecto: JSON.stringify(p) });
        if ('error' in r) throw new Error(r.error);
        // se puede mandar por postMessage (sin funciones) y llega igual
        const copia = structuredClone(r);
        expect(copia.revision).toBe(7);
        const c = copia.calculo;
        // en el momento: el cálculo y, después, los controles del exo (los que suma la interfaz)
        const q = con(f(), metodo), m = calcularProyecto(q);
        const extra = new ExoDeCalculo(q, m, metodo).controles();
        expect(c.controles).toEqual([...m.controles, ...extra]);
        expect(c.valores).toEqual(m.valores);
        if (metodo !== 'planilla') expect(c.cirsoc?.verif).toEqual(m.cirsoc?.verif);
        if (metodo === 'fem') {
          for (const pz of m.fem!.modelo.piezas) expect(esfuerzosFem(c.fem!, pz.dir, pz.nombre)).toEqual(esfuerzosFem(m.fem!, pz.dir, pz.nombre));
          expect(esfuerzosFem(c.fem!, 'A', 'no existe')).toBeNull();
          expect(esfuerzosFem(c.fem!, 'A', 'constructor')).toBeNull();
        }
        // con exo en CIRSOC: el worker manda la torre con el exo y las barras ya verificadas
        if (p.exo && metodo !== 'planilla') {
          expect(Object.keys(c.exoHecho!.torre).length).toBe(2);
          expect(Object.keys(c.exoHecho!.barras).length).toBeGreaterThan(0);
        }
      }, 60000);
    }
  }

  it('la interfaz usa lo que hizo el worker sin repetir las cuentas, con los mismos números', () => {
    const p = con(ejemploCiticorpFachada(), 'cirsoc');
    const r = calcularPedido({ revision: 1, proyecto: JSON.stringify(p) });
    if ('error' in r) throw new Error(r.error);
    const c = structuredClone(r.calculo);
    const solo = new ExoDeCalculo(p, c, 'cirsoc');
    const sembrado = new ExoDeCalculo(p, c, 'cirsoc');
    sembrado.sembrar(c.exoHecho!);
    const espia = vi.spyOn(exo, 'cirsoc301');
    const dA = sembrado.datos('A', p.exo!)!, dB = sembrado.datos('B', p.exo!)!;
    const vA = sembrado.verif301(dA), vB = sembrado.verif301(dB);
    expect(espia).not.toHaveBeenCalled();
    espia.mockRestore();
    expect(dA.r).toEqual(solo.datos('A', p.exo!)!.r);
    expect(vA).toEqual(solo.verif301(solo.datos('A', p.exo!)!));
    expect(vB).toEqual(solo.verif301(solo.datos('B', p.exo!)!));
    expect(sembrado.controles()).toEqual(solo.controles());
    // con otra ficha, lo sembrado no sirve: se calcula de nuevo
    const otra = { ...p.exo!, separacion: p.exo!.separacion + 0.5 };
    expect(sembrado.datos('A', otra)!.ancho).toBeCloseTo(dA.ancho + 1, 6);
  }, 60000);

  it('un proyecto que no se puede calcular devuelve el error (no tira)', () => {
    const r = calcularPedido({ revision: 3, proyecto: '{ no es json' });
    expect('error' in r && r.revision === 3).toBe(true);
  });
});
