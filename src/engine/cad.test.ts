import { describe, expect, it } from 'vitest';
import { aMetros, contornoDesdeCAD, factorUnidad, imanCAD, leerDXFCompleto, murosDesdeCAD, nodosCAD } from './cad';
import { cajaSilueta } from './silueta';

/** DXF de prueba en mm: planta de 20 × 16 m con capas */
function dxf(): string {
  const g: string[] = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  const linea = (capa: string, x1: number, y1: number, x2: number, y2: number) => g.push('0', 'LINE', '8', capa, '10', String(x1), '20', String(y1), '11', String(x2), '21', String(y2));
  const poli = (capa: string, pts: number[][], cerrada = true) => { g.push('0', 'LWPOLYLINE', '8', capa, '90', String(pts.length), '70', cerrada ? '1' : '0'); pts.forEach(([x, y]) => g.push('10', String(x), '20', String(y))); };
  // tabique vertical en doble línea: 200 mm de espesor, 4500 de largo, en x = 0..200
  linea('A-MUROS', 0, 0, 0, 4500); linea('A-MUROS', 200, 0, 200, 4500);
  // tabique horizontal como rectángulo cerrado: 5000 × 250
  poli('A-MUROS', [[6000, 8000], [11000, 8000], [11000, 8250], [6000, 8250]]);
  g.push('0', 'CIRCLE', '8', 'A-COLUMNAS', '10', '15000', '20', '5000', '40', '300');
  poli('A-CARPINTERIA', [[0, 0], [20000, 0], [20000, 16000], [0, 16000]]);
  linea('A-EJES', 10000, -1000, 10000, 17000); linea('A-EJES', -1000, 8000, 21000, 8000);
  g.push('0', 'INSERT', '8', 'A-MOBILIARIO', '0', 'ENDSEC', '0', 'EOF');
  return g.join('\n');
}

describe('importar CAD (DXF)', () => {
  const d = leerDXFCompleto(dxf());
  it('lee las entidades, las capas y la unidad del archivo', () => {
    expect(d.capas).toEqual(['A-CARPINTERIA', 'A-COLUMNAS', 'A-EJES', 'A-MUROS']);
    expect(d.entidades).toHaveLength(7);
    expect(d.omitidas).toBe(1);
    expect(factorUnidad(d)).toEqual({ factor: 0.001, unidad: 'mm' });
  });
  it('pasa a metros centrado en la planta', () => {
    const m = aMetros(d.entidades.filter(e => e.capa === 'A-CARPINTERIA'), 0.001);
    const c = cajaSilueta(contornoDesdeCAD(m)!);
    expect(c.B).toBeCloseTo(20, 6); expect(c.L).toBeCloseTo(16, 6); expect(c.cx).toBeCloseTo(0, 6);
  });
  it('convierte la capa de muros: dobles líneas y rectángulos en tabiques, círculos en columnas', () => {
    const m = aMetros(d.entidades, 0.001, { x: 0, y: 0 });
    const ms = murosDesdeCAD(m.filter(e => e.capa === 'A-MUROS' || e.capa === 'A-COLUMNAS'), new Set());
    const v = ms.find(w => w.dir === 'Y' && !w.tipo)!;
    expect(v).toMatchObject({ x: 0.1, y: 2.25, largo: 4.5, espesor: 0.2 });
    expect(ms.find(w => w.dir === 'X')).toMatchObject({ x: 8.5, y: 8.125, largo: 5, espesor: 0.25 });
    expect(ms.find(w => w.tipo === 'tubo-circ')).toMatchObject({ x: 15, y: 5, largo: 0.6 });
  });
  it('nodos para el imán: extremos, medios, centros e intersecciones (los ejes se cruzan)', () => {
    const m = aMetros(d.entidades, 0.001, { x: 0, y: 0 });
    const ns = nodosCAD(m);
    expect(imanCAD({ x: 10.05, y: 7.97 }, ns, 0.2)).toMatchObject({ t: 'intersección', p: { x: 10, y: 8 } });
    expect(imanCAD({ x: 14.9, y: 5.1 }, ns, 0.3)).toMatchObject({ t: 'centro' });
  });
});

import { cotasDesdeCorte, nombrarNiveles } from './cad';
describe('niveles desde un corte', () => {
  it('toma las losas (líneas horizontales largas, cara de arriba) y nombra los niveles con PB', () => {
    const g: string[] = ['0', 'SECTION', '2', 'ENTITIES'];
    const linea = (x1: number, y1: number, x2: number, y2: number) => g.push('0', 'LINE', '8', 'CORTE', '10', String(x1), '20', String(y1), '11', String(x2), '21', String(y2));
    // subsuelo a −3000, PB 0, pisos cada 3000 hasta 9000, losas de 200 de espesor; una ventana corta que no cuenta
    for (const y of [-3000, 0, 3000, 6000, 9000]) { linea(0, y, 20000, y); linea(0, y - 200, 20000, y - 200); }
    linea(2000, 1500, 3500, 1500);
    linea(0, -3200, 0, 9000);
    g.push('0', 'ENDSEC', '0', 'EOF');
    const d = leerDXFCompleto(g.join('\n'));
    const cotas = cotasDesdeCorte(d.entidades, 0.001);
    expect(cotas).toEqual([9, 6, 3, 0, -3]);
    expect(nombrarNiveles(cotas, 3)).toEqual([{ nombre: 'Azotea', cota: 9 }, { nombre: '2º', cota: 6 }, { nombre: '1º', cota: 3 }, { nombre: 'PB', cota: 0 }, { nombre: '1º SS', cota: -3 }]);
  });
});
