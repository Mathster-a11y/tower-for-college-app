import { describe, expect, it } from 'vitest';
import { ejemploAsimetrico, ejemploGuia, type Proyecto } from '../engine/modelo';
import { ejemploPlanta34 } from '../engine/ejemplo34';
import { torresPrueba } from '../engine/torresPrueba';
import { agruparNodos, copiarNodo, hacerComponente } from '../engine/grupos';
import { piezaTipo } from '../engine/piezasTipo';
import { ponerPerfil } from '../engine/perfil';
import { proyectoDesdeTablas, tablasProyecto } from './proyectoTablas';
import { escribirLibro, leerLibro } from './tablas';

/** el proyecto sin claves vacías (undefined, null) ni marcas falsas opcionales, para comparar */
const canon = (p: Proyecto) => JSON.parse(JSON.stringify(p, (k, v) => (v === null || v === undefined || (v === false && ['bloq', 'oculto', 'portico', 'espejo'].includes(k)) ? undefined : v)));

async function idaYVuelta(p: Proyecto) {
  const tablas = tablasProyecto(p);
  const hojas = await leerLibro(await escribirLibro(tablas));
  // la base es otro proyecto: todo tiene que salir de las tablas
  const r = proyectoDesdeTablas(hojas, ejemploAsimetrico());
  expect(r).not.toBeNull();
  expect(r!.avisos).toEqual([]);
  return r!.proyecto;
}

/** proyecto con todo lo que se puede dibujar: grupos, componentes, piezas tipo, perfil, vanos, contornos, cotas y guías */
function completo(): Proyecto {
  const p = ejemploGuia();
  const a = agruparNodos(p, ['M5', 'M6', 'M7'], [], null, 'Núcleo');
  if ('error' in a) throw new Error(a.error);
  hacerComponente(p, a.id);
  const c = copiarNodo(p, a.id, 0, 6, true);
  if ('error' in c) throw new Error(c.error);
  p.grupos!.find(g => g.id === a.id)!.bloq = true;
  p.muros.push(...piezaTipo('C', { h: 3, b: 1.5, e: 0.2, giro: 90, espejo: true, bS: 1.2 }, 5, -5, new Set(p.muros.map(m => m.id))));
  const base = { id: 'P1', dir: 'Y' as const, x: -6, y: 6, largo: 1, espesor: 1, llega: true, areaInf: 4, piezaA: 'P1', pegadoA: '', piezaB: 'P1B', pegadoB: '' };
  p.muros.push(ponerPerfil(base, { v: [{ x: 0, y: 0 }, { x: 2, y: 0, b: 0.4 }, { x: 2, y: 1, c1: { x: 2.5, y: 1.2 }, c2: { x: 1.5, y: 1.4 } }, { x: 0, y: 1.5 }], huecos: [[{ x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }, { x: 1, y: 0.8 }]] }));
  p.muros[0].vano = { con: 'M2', ancho: 1.2, tipo: 'dintel' };
  p.muros[1].rolA = 'ala sup.'; p.muros[1].portico = true; p.muros[1].zDesde = p.niveles[2].cota; p.muros[1].zHasta = 17.3;
  p.muros[2].tipo = 'tubo-rect'; p.muros[2].ladoY = 2.5;
  p.niveles[0].silueta = [{ x: -10, y: -6 }, { x: 10, y: -6, b: 0.2 }, { x: 10, y: 6 }, { x: -10, y: 6 }];
  p.niveles[1].carpinteria = [{ x: -9, y: -5 }, { x: 9, y: -5 }, { x: 9, y: 5 }, { x: -9, y: 5 }];
  p.huecosLosa = [{ id: 'H1', nombre: 'Ascensor', v: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }], zDesde: 0.2 }];
  p.caminos = [{ id: 'C1', nombre: 'Arco', cerrado: false, v: [{ x: 0, y: 0, b: 0.5 }, { x: 4, y: 0 }] }];
  p.cotas = [{ id: 'K1', tipo: 'h', d: 1.5, a: { x: -4, y: 2, ref: { id: 'M5', k: 1 } }, b: { x: 4, y: 2 } }];
  p.guias = [{ id: 'L1', t: 'recta', p: { x: 0, y: 0 }, ang: 90, eje: 'A', deEjes: true }, { id: 'L2', t: 'circulo', c: { x: 1, y: 1 }, r: 3 }];
  p.areasAuto = p.niveles[3].cota;
  p.exo = { tipo: 'E', separacion: 1.5, modulo: 5, columna: { b: 0.6, e: 0.04 }, diagonal: { b: 0.35, e: 0.016 }, viga: { b: 0.45, e: 0.025 }, E: 2.1e7, sigmaAdm: 14000, limiteH: 1000,
    uniones: { columna: 'articulada', base: 'articulada' }, viento: 'fachada', pesoPropio: false, pisoInicio: 2, mastil: { b: 1.2, e: 0.05 }, barras: { C3: { relA: true, sec: { b: 0.3, e: 0.0125 } }, D2: { quitar: true } } };
  p.nombre = 'Torre «completa» & cía'; p.alumno = 'Ana';
  return p;
}

describe('la planilla alcanza sola para rearmar la torre', () => {
  it('proyecto con grupos, componentes, piezas tipo, perfil, vanos, contornos, cotas y guías', async () => {
    const p = completo();
    expect(p.grupos!.length).toBeGreaterThanOrEqual(2);
    expect(p.muros.some(m => m.perfil?.huecos?.length && m.pieza === undefined)).toBe(true);
    expect(p.muros.some(m => m.pieza?.med.espejo)).toBe(true);
    expect(canon(await idaYVuelta(p))).toEqual(canon(p));
  });
  it('ejemplos y torres de prueba', async () => {
    for (const p of [ejemploGuia(), ejemploAsimetrico(), ejemploPlanta34(), ...torresPrueba()]) expect(canon(await idaYVuelta(p))).toEqual(canon(p));
  });
  it('se puede editar a mano: cambiar un largo y el nombre del nivel en «Hasta»', async () => {
    const p = ejemploGuia();
    const tablas = tablasProyecto(p);
    const muros = tablas.find(t => t.nombre === 'T3D Muros')!;
    muros.filas[1][4] = 7.5;
    muros.filas[1][15] = p.niveles[2].nombre;
    const r = proyectoDesdeTablas(await leerLibro(await escribirLibro(tablas)), ejemploGuia())!;
    expect(r.proyecto.muros[0].largo).toBe(7.5);
    expect(r.proyecto.muros[0].zHasta).toBe(p.niveles[2].cota);
  });
});

describe('escribir la planilla del curso y volver a abrirla', () => {
  it('la torre sale igual de las hojas «T3D …» (sin usar el JSON)', async () => {
    const { readFileSync } = await import('node:fs');
    const { escribirPlanilla, leerPlanilla } = await import('./planilla');
    const { aPlanilla } = await import('../engine/mapping');
    const { calcularPlanilla } = await import('../engine/planilla');
    const JSZip = (await import('jszip')).default;
    const p = completo();
    const d = aPlanilla(p).datos;
    const libro = await escribirPlanilla(readFileSync('src/assets/planilla_virgen.xlsx'), d, calcularPlanilla(d), p);
    // se borra el JSON de respaldo: tiene que alcanzar con las tablas
    const zip = await JSZip.loadAsync(libro);
    const wb = await zip.file('xl/workbook.xml')!.async('string');
    expect(wb).toContain('T3D Contornos');
    const sinJson = await zip.generateAsync({ type: 'uint8array' });
    for (const f of Object.keys(zip.files)) {
      const s = f.endsWith('.xml') && f.includes('worksheets/sheet') ? await zip.file(f)!.async('string') : '';
      if (s.includes('T3D-JSON')) zip.file(f, s.replace(/<sheetData>[\s\S]*<\/sheetData>/, '<sheetData/>'));
    }
    const r = await leerPlanilla(await zip.generateAsync({ type: 'uint8array' }));
    expect(r.avisos).toEqual([]);
    expect(canon(r.proyecto!)).toEqual(canon(p));
    void sinJson;
  });
});
