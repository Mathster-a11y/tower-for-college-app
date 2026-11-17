import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ejemploGuia } from '../src/engine/modelo';
import { aPlanilla } from '../src/engine/mapping';
import { calcularPlanilla } from '../src/engine/planilla';
import { interpretar, murosDeLineas, tablaDelProyecto, unidadProbable } from '../src/engine/importar';
import { escribirLibro, leerLibro, leerTexto } from '../src/xlsx/tablas';
import { escribirPlanilla } from '../src/xlsx/planilla';

describe('importar', () => {
  const p = ejemploGuia();

  it('la tabla de la app (Niveles y Muros) ida y vuelta', async () => {
    const bytes = await escribirLibro(tablaDelProyecto(p.niveles, p.muros));
    const imp = interpretar(await leerLibro(bytes));
    expect(imp.tipo).toBe('tabla');
    expect(imp.niveles).toEqual(p.niveles.map(n => ({ ...n })));
    expect(imp.muros).toEqual(p.muros);
  });

  it('tubos, columnas y muros que arrancan o terminan en otro nivel, ida y vuelta', async () => {
    const muros = [
      ...p.muros.slice(0, 2),
      { ...p.muros[2], zHasta: 31 },                                      // termina en el 10º
      { id: 'N1', dir: 'Y' as const, tipo: 'tubo-rect' as const, ladoY: 6, x: 0, y: 0, largo: 4, espesor: 0.25, llega: true, areaInf: 40, piezaA: 'N1', pegadoA: '', piezaB: 'N1B', pegadoB: '' },
      { id: 'C1', dir: 'Y' as const, tipo: 'tubo-circ' as const, x: 5, y: 5, largo: 0.8, espesor: 0.4, llega: true, areaInf: 12, piezaA: 'C1', pegadoA: '', piezaB: 'C1B', pegadoB: '', zDesde: 4 },
    ];
    const bytes = await escribirLibro(tablaDelProyecto(p.niveles, muros));
    const imp = interpretar(await leerLibro(bytes));
    expect(imp.muros).toEqual(muros);
  });

  it('tabla vieja con «D col.» y «d int.»: se lee como tubo circular', () => {
    const imp = interpretar(leerTexto('Muro;Dir.;x;y;Largo;Esp.;D col.;d int.\nC1;Y;0;0;1;0,2;1;0,6\n'));
    expect(imp.muros[0]).toMatchObject({ tipo: 'tubo-circ', largo: 1, espesor: 0.2 });
  });

  it('CSV con encabezados en castellano, coma decimal y punto y coma', () => {
    const imp = interpretar(leerTexto('Muro;Dirección;X;Y;Largo;Espesor;Pieza A\nA1;Y;-5,5;0;4;0,2;P1\nA2;x;5,5;0;4;0,25;P2\n'));
    expect(imp.muros.map(m => [m.id, m.dir, m.x, m.espesor, m.piezaA])).toEqual([['A1', 'Y', -5.5, 0.2, 'P1'], ['A2', 'X', 5.5, 0.25, 'P2']]);
  });

  it('líneas de AutoCAD (Start/End X/Y, en cm): dirección, centro, largo y centrado', () => {
    const imp = interpretar(leerTexto('Count,Name,Layer,Length,Start X,Start Y,End X,End Y\n1,Line,MUROS,450,0,0,0,450\n1,Line,MUROS,500,0,450,500,450\n1,Line,MUROS,3,0,0,1,1\n'));
    expect(imp.tipo).toBe('lineas');
    expect(unidadProbable(imp.lineas)).toBe('cm');
    const av: string[] = [];
    const ms = murosDeLineas(imp.lineas, { escala: 0.01, centrar: true, espesor: 0.2 }, av);
    expect(ms.length).toBe(2);   // la de 1,4 cm no entra
    expect(ms[0]).toMatchObject({ dir: 'Y', x: -2.5, y: 0, largo: 4.5, espesor: 0.2 });
    expect(ms[1]).toMatchObject({ dir: 'X', x: 0, y: 2.25, largo: 5 });
    expect(av.join(' ')).toMatch(/menos de/);
  });

  it('la planilla del curso llena: niveles, viento, fundación y el mismo ΣJ en cada dirección', async () => {
    const a = aPlanilla(p);
    const r = calcularPlanilla(a.datos);
    const xlsx = await escribirPlanilla(readFileSync(new URL('../src/assets/planilla_virgen.xlsx', import.meta.url)), a.datos, r, p);
    const imp = interpretar(await leerLibro(xlsx));
    expect(imp.tipo).toBe('planilla');
    expect(imp.sitio).toMatchObject({ V: 48, Kd: 0.85, zg: 457 });
    expect(imp.fundacion).toEqual({ b1: 18, a1: 22 });
    expect(imp.niveles!.map(n => n.cota)).toEqual(p.niveles.map(n => n.cota));
    expect(imp.niveles![0]).toMatchObject({ nombre: 'Azotea', B: 20, L: 16 });
    expect(imp.niveles!.find(n => n.nombre === '1º SS')).toMatchObject({ B: 22, L: 18 });
    const q = { ...p, niveles: imp.niveles!, muros: imp.muros };
    const r2 = calcularPlanilla(aPlanilla(q).datos);
    expect(r2.jpar.AY24).toBeCloseTo(r.jpar.AY24, 6);
    expect(r2.jort.AY24).toBeCloseTo(r.jort.AY24, 6);
    expect(r2.mnyq.H61).toBeCloseTo(r.mnyq.H61, 6);
  });
});

describe('importar la planilla de la cátedra 2025', () => {
  const p = ejemploGuia();
  it('EDIFICIO_TORRE_1 (el ejemplo de la cátedra): cada pieza sale de la fila que lee la rototraslación (ΣJ y eje de inercia como Excel)', async () => {
    const { usarConfig } = await import('../src/engine/config');
    const libro = await leerLibro(readFileSync(new URL('../src/assets/planilla_catedra_2025.xlsx', import.meta.url)));
    const imp = interpretar(libro);
    expect(imp.tipo).toBe('planilla');
    const q = { ...p, niveles: imp.niveles!, muros: imp.muros, sitio: { ...p.sitio, ...imp.sitio }, fundacion: imp.fundacion! };
    const r = usarConfig({ motor: 'nuevo' }, () => calcularPlanilla(aPlanilla(q).datos));
    // la plantilla es la versión de 49 columnas (J ortogonales con el total en AW), con el ejemplo de la torre de 34 pisos;
    // valores guardados por Excel en «Rototrasl. cara mayor»: B25 = 862,0769 m⁴ · J7 = 2,3621 m
    expect(r.rotA.B25).toBeCloseTo(862.076897, 4);
    expect(r.rotA.J7).toBeCloseTo(2.362054, 4);
    // cara menor (lee AW de ortogonales): B25 = 278,9634 m⁴ · J7 = 1,36 m
    expect(r.rotB.B25).toBeCloseTo(278.963386, 4);
    expect(r.rotB.J7).toBeCloseTo(1.36, 3);
  });
  it('una torre de 26 piezas escrita en la planilla 2025 vuelve con las mismas piezas', async () => {
    const { usarConfig } = await import('../src/engine/config');
    const q0 = { ...p, muros: [...p.muros] };
    for (let k = 0; k < 20; k++) q0.muros.push({ id: `X${k}`, dir: 'Y', x: -9 + k * 0.9, y: k % 2 ? 7 : -7, largo: 1 + (k % 3) * 0.2, espesor: 0.2, llega: true, areaInf: 5, piezaA: `PA${k}`, pegadoA: '', piezaB: '', pegadoB: '' });
    const { a, r } = usarConfig({ motor: 'nuevo' }, () => { const a = aPlanilla(q0); return { a, r: calcularPlanilla(a.datos) }; });
    const xlsx = await escribirPlanilla(readFileSync(new URL('../src/assets/planilla_catedra_2025.xlsx', import.meta.url)), a.datos, r, q0, undefined, undefined, { motor: 'nuevo', virgen: true });
    const imp = interpretar(await leerLibro(xlsx));
    const q = { ...q0, niveles: imp.niveles!, muros: imp.muros };
    const r2 = usarConfig({ motor: 'nuevo' }, () => calcularPlanilla(aPlanilla(q).datos));
    expect(r2.jpar.filas.length).toBe(26);
    expect(r2.rotA.B25).toBeCloseTo(r.rotA.B25, 6);
    expect(r2.rotA.J7).toBeCloseTo(r.rotA.J7, 3);   // las posiciones se importan redondeadas al mm
    expect(r2.rotB.B25).toBeCloseTo(r.rotB.B25, 6);
  });
});
