import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { ejemploGuia } from '../engine/modelo';
import { aPlanilla } from '../engine/mapping';
import { calcularPlanilla } from '../engine/planilla';
import { escribirPlanilla, leerPlanilla } from './planilla';
import { figurasDesdeMeta, type MetaFigura } from './figuras';

const virgen = readFileSync('src/assets/planilla_virgen.xlsx');
const meta = JSON.parse(readFileSync('src/assets/figuras/figuras.json', 'utf8')) as Record<string, MetaFigura>;
const figuras = figurasDesdeMeta(meta, n => new Uint8Array(readFileSync(`src/assets/figuras/${n}.png`)));
const p = ejemploGuia(), d = aPlanilla(p).datos, r = calcularPlanilla(d);
const texto = async (libro: Uint8Array, ruta: string) => (await JSZip.loadAsync(libro)).file(ruta)!.async('string');
const cuenta = (s: string, que: string) => s.split(que).length - 1;

describe('dibujos rediseñados sobre las hojas originales', () => {
  it('cada figura va a su hoja: 4 en cada hoja J, 3 en M,NyQ y 1 en viento', () => {
    const por = (h: string) => figuras.filter(f => f.hoja === h).map(f => f.nombre).sort();
    expect(por('J Tabiques paralelos')).toEqual(['asimetrica', 'portico', 'simetrica', 'tubo']);
    expect(por('J Tabiques ortogonales')).toEqual(['asimetrica', 'portico', 'simetrica', 'tubo']);
    expect(por('M,NyQ')).toEqual(['flecha1', 'flecha2', 'torre']);
    expect(por('viento')).toEqual(['npt']);
    // ancla «A26» → columna 0, fila 25
    expect(figuras.find(f => f.nombre === 'simetrica')).toMatchObject({ col: 0, fila: 25, dx: 0, dy: 0, ancho: 384 });
  });

  it('no cambia ninguna celda: las hojas salen iguales con y sin dibujos', async () => {
    const sin = await escribirPlanilla(virgen, d, r, p), con = await escribirPlanilla(virgen, d, r, p, undefined, figuras);
    for (let n = 1; n <= 7; n++) expect(await texto(con, `xl/worksheets/sheet${n}.xml`)).toBe(await texto(sin, `xl/worksheets/sheet${n}.xml`));
    // las imágenes están y las formas originales quedaron ocultas (los gráficos de M,NyQ no)
    const d3 = await texto(con, 'xl/drawings/drawing3.xml'), d2 = await texto(con, 'xl/drawings/drawing2.xml');
    expect(cuenta(d3, 'name="T3D figura')).toBe(4);
    expect(cuenta(d2, 'name="T3D figura')).toBe(3);
    expect(cuenta(d2, '<xdr:graphicFrame')).toBe(2);
    const formas = (s: string) => [...s.matchAll(/<xdr:(oneCellAnchor|twoCellAnchor)\b[\s\S]*?<\/xdr:\1>/g)].map(m => m[0]).filter(a => /<xdr:(sp|cxnSp)[\s>]/.test(a));
    expect(formas(d3).length).toBeGreaterThan(40);
    expect(formas(d3).every(a => /<xdr:cNvPr\b[^>]*hidden="1"/.test(a))).toBe(true);
    expect(formas(d2).every(a => /<xdr:cNvPr\b[^>]*hidden="1"/.test(a))).toBe(true);
    expect((await JSZip.loadAsync(con)).file('xl/media/t3d_fig_torre.png')).not.toBeNull();
    // y la planilla se sigue abriendo
    expect((await leerPlanilla(con)).proyecto?.muros.length).toBe(p.muros.length);
  });

  it('volver a escribir no duplica, y sin dibujos deja los originales como estaban', async () => {
    const una = await escribirPlanilla(virgen, d, r, p, undefined, figuras);
    const dos = await escribirPlanilla(una, d, r, p, undefined, figuras);
    expect(cuenta(await texto(dos, 'xl/drawings/drawing3.xml'), 'name="T3D figura')).toBe(4);
    expect(await texto(dos, 'xl/drawings/drawing3.xml')).toBe(await texto(una, 'xl/drawings/drawing3.xml'));
    const vuelta = await escribirPlanilla(dos, d, r, p, undefined, []);
    for (const n of [1, 2, 3, 4]) expect(await texto(vuelta, `xl/drawings/drawing${n}.xml`)).toBe(await texto(virgen, `xl/drawings/drawing${n}.xml`));
  });
});
