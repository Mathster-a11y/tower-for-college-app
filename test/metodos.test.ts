/**
 * Etapa 1 del plan (docs/plan_metodos.html) y hallazgo 5 del informe técnico: el método va DENTRO del proyecto.
 * El mismo archivo da los mismos resultados aunque el navegador tenga otra configuración.
 */
import { describe, expect, it } from 'vitest';
import { calcularProyecto } from '../src/ui/estado';
import { config, usarConfig } from '../src/engine/config';
import { ejemploAsimetrico, ejemploGuia } from '../src/engine/modelo';
import { CONFIG_POR_DEFECTO, configDe, describirConfig } from '../src/engine/metodos/tipos';
import { leerProyecto } from '../src/engine/lector';
import { proyectoDesdeTablas, tablasProyecto } from '../src/xlsx/proyectoTablas';
import { escribirLibro, leerLibro } from '../src/xlsx/tablas';

const conCalculo = (c: Parameters<typeof configDe>[0]['calculo']) => { const p = ejemploAsimetrico(); p.calculo = c; return p; };

describe('el método va dentro del proyecto', () => {
  it('sin configuración: la de siempre (no cambia ningún número)', () => {
    expect(configDe(ejemploGuia())).toEqual(CONFIG_POR_DEFECTO);
    expect(CONFIG_POR_DEFECTO).toEqual({ metodo: 'planilla', version: 'actual', armado: 'app', verificacion: 'completa' });
  });

  it('el caso del informe: la carga total del viento A depende de la versión guardada en el proyecto, no del navegador', () => {
    const anterior = conCalculo({ version: 'actual' }), v2025 = conCalculo({ version: 'nuevo' });
    // el navegador tiene cualquier cosa: no importa
    for (const motor of ['actual', 'nuevo'] as const) {
      usarConfig({ motor, metodo: 'planilla' }, () => {
        expect(calcularProyecto(anterior).res.mnyq.H61).toBeCloseTo(129.55, 2);   // informe: 129,55 t
        expect(calcularProyecto(v2025).res.mnyq.H61).toBeCloseTo(125.81, 2);      // informe: 125,81 t
      });
    }
  });

  it('el armado también sale del proyecto', () => {
    const app = calcularProyecto(conCalculo({ armado: 'app' })), cat = calcularProyecto(conCalculo({ armado: 'catedra' }));
    expect(app.res.jort.AY24).not.toBeCloseTo(cat.res.jort.AY24, 3);
    usarConfig({ metodo: 'planilla' }, () => expect(calcularProyecto(conCalculo({ armado: 'app' })).res.jort.AY24).toBe(app.res.jort.AY24));
  });

  it('calcular un proyecto no cambia la configuración global', () => {
    const antes = { ...config };
    calcularProyecto(conCalculo({ version: 'nuevo', armado: 'catedra' }));
    expect({ ...config }).toEqual(antes);
  });

  it('el lector valida la configuración y un método que todavía no existe se abre con «Planilla virgen» y aviso', () => {
    const r = leerProyecto(conCalculo({ metodo: 'guia', version: 'nuevo', armado: 'catedra', formulas: '2026.11' }));
    expect(r.ok && r.proyecto.calculo).toEqual({ metodo: 'guia', version: 'nuevo', armado: 'catedra', formulas: '2026.11' });
    const malo = leerProyecto(conCalculo({ metodo: 'magia' as never }));
    expect(malo.ok ? [] : malo.errores).toEqual(['Método de cálculo desconocido («magia»).']);
    const futuro = leerProyecto(conCalculo({ metodo: 'fem' }));
    expect(futuro.ok && futuro.proyecto.calculo?.metodo).toBe('planilla');
    expect(futuro.ok && futuro.avisos[0]).toMatch(/todavía no está/);
  });

  it('viaja en las tablas «T3D» del Excel', async () => {
    const p = conCalculo({ metodo: 'guia', version: 'nuevo', armado: 'catedra', formulas: '2026.11' });
    const r = proyectoDesdeTablas(await leerLibro(await escribirLibro(tablasProyecto(p))), ejemploGuia());
    expect(r!.proyecto.calculo).toEqual(p.calculo);
  });

  it('se describe en informes y láminas', () => {
    expect(describirConfig({ metodo: 'planilla', version: 'nuevo', armado: 'catedra', verificacion: 'completa' })).toBe('Planilla virgen · planilla 2025 · armado de la cátedra');
    expect(describirConfig({ metodo: 'guia', version: 'actual', armado: 'app', verificacion: 'completa' })).toBe('Guía · armado de la app');
  });
});
