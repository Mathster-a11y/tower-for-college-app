import { describe, expect, it } from 'vitest';
import { ajustarContorno, areaSilueta, cajaSilueta, leerDXF, plantaDeNivel, puntosSilueta } from './silueta';
import { ejemploGuia } from './modelo';

describe('silueta de cada piso', () => {
  it('un cuadrado de 10 m con un lado en semicírculo', () => {
    // de (5,−5) a (5,5) con bulge 1 (semicírculo hacia afuera, a la derecha)
    const v = [{ x: -5, y: -5 }, { x: 5, y: -5, b: 1 }, { x: 5, y: 5 }, { x: -5, y: 5 }];
    expect(areaSilueta(v)).toBeCloseTo(100 + (Math.PI * 25) / 2, 2);
    const c = cajaSilueta(v);
    expect(c.B).toBeCloseTo(15, 3);
    expect(c.L).toBeCloseTo(10, 6);
    expect(Math.max(...puntosSilueta(v).map(p => p.x))).toBeCloseTo(10, 3);
  });
  it('lee una polilínea cerrada de AutoCAD con un arco y la pasa a metros, centrada', () => {
    const dxf = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '8', 'SILUETA', '90', '4', '70', '1',
      '10', '0', '20', '0', '10', '2000', '20', '0', '42', '0.41421356', '10', '2000', '20', '1600', '10', '0', '20', '1600', '0', 'ENDSEC', '0', 'EOF'].join('\n');
    const cs = leerDXF(dxf);
    expect(cs).toHaveLength(1);
    expect(cs[0][1].b).toBeCloseTo(0.4142, 4);
    const m = ajustarContorno(cs[0], 0.01, true);                  // cm → m
    const c = cajaSilueta(m);
    expect(c.L).toBeCloseTo(16, 6);
    expect(c.cx).toBeCloseTo(0, 3);
  });
  it('sin silueta propia, cada nivel hereda la de arriba o el rectángulo B × L', () => {
    const p = ejemploGuia();
    const iPB = p.niveles.findIndex(n => n.nombre === 'PB');
    expect(plantaDeNivel(p, iPB)).toMatchObject({ B: 20, L: 16, propia: false });
    p.niveles[3].silueta = [{ x: -8, y: -8 }, { x: 8, y: -8 }, { x: 0, y: 8 }];
    expect(plantaDeNivel(p, iPB).silueta).toHaveLength(3);
    expect(plantaDeNivel(p, 1).silueta).toHaveLength(4);
  });
});
