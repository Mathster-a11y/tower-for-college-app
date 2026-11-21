/**
 * Reporte FEM (etapa 6b): un libro de datos con los números del modelo de la app y sus gráficos.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { ejemploGuia, type Proyecto } from '../src/engine/modelo';
import { torresPrueba } from '../src/engine/torresPrueba';
import { calcularProyecto } from '../src/ui/estado';
import { datosGuia } from '../src/engine/metodos/guiaPasos';
import { reporteFem, HF } from '../src/xlsx/libros/reporteFem';

const armar = (p0: Proyecto) => {
  const p: Proyecto = { ...p0, calculo: { metodo: 'fem' } };
  const c = calcularProyecto(p);
  const libro = reporteFem({ p, fem: c.fem!, verif: c.cirsoc!.verif, controles: c.controles, rects: datosGuia(p, c.asig.piezas).rects, teoria: 'timoshenko', limiteDeriva: 500 });
  return { p, c, libro };
};
const buscar = (libro: ReturnType<typeof armar>['libro'], hoja: string, texto: string, col: number) => {
  const h = libro.hojas.find(x => x.nombre === hoja)!;
  for (const [ref, x] of h.celdas) if (x.v === texto) { const m = /^([A-Z]+)(\d+)$/.exec(ref)!; return [...h.celdas.entries()].find(([r]) => r === `${String.fromCharCode(64 + col)}${m[2]}`)?.[1].v; }
  return undefined;
};

describe.each([ejemploGuia(), ...torresPrueba().slice(0, 4)].map(p => ({ p, nombre: p.nombre })))('reporte FEM · $nombre', ({ p: p0 }) => {
  const { c, libro } = armar(p0);
  it('lleva los números del modelo de la app', () => {
    const f = c.fem!;
    expect(buscar(libro, HF.viento, 'n1 del modelo (Hz)', 11)).toBe(f.viento.A.n1);
    expect(buscar(libro, HF.viento, 'n1 del modelo (Hz)', 12)).toBe(f.viento.B.n1);
    expect(buscar(libro, HF.viento, 'M en PB (tm)', 11)).toBe(f.viento.A.MPB);
    expect(buscar(libro, HF.deriva, 'Azotea (m)', 8)).toBe(f.deriva.A.d[f.deriva.A.d.length - 1]);
    const mo = libro.hojas.find(x => x.nombre === HF.modos)!;
    expect(mo.celdas.get('B5')!.v).toBe(f.modos[0].f);
    const co = libro.hojas.find(x => x.nombre === HF.controles)!;
    expect([...co.celdas.values()].filter(x => x.v === 'NO VERIFICA').length).toBe(c.controles.filter(x => x.estado === 'no verifica').length);
  });
  it('se escribe como .xlsx con sus hojas y gráficos', async () => {
    const zip = await JSZip.loadAsync(await libro.xlsx());
    const wb = await zip.file('xl/workbook.xml')!.async('string');
    for (const h of Object.values(HF)) expect(wb).toContain(`name="${h}"`);
    expect(Object.keys(zip.files).filter(x => x.startsWith('xl/charts/')).length).toBeGreaterThanOrEqual(10);
  });
});
