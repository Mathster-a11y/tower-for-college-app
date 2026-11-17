import { describe, expect, it } from 'vitest';
import { perfilSobreCamino } from './colocar';
import { propiedades, type Perfil } from './perfil';

const ok = (r: Perfil | { error: string }): Perfil => { if ('error' in r) throw new Error(r.error); return r; };

describe('muro sobre un camino (muro curvo)', () => {
  it('semicírculo por el eje: arco exacto, área y J de la media corona', () => {
    // de (5,0) a (−5,0) con centro en el origen, por arriba (antihorario): bulge 1
    const pf = ok(perfilSobreCamino({ v: [{ x: 5, y: 0, b: 1 }, { x: -5, y: 0 }], cerrado: false }, 0.3, 'eje'));
    expect(pf.v.filter(q => q.b).length).toBe(2);           // las dos caras siguen siendo arcos
    const pr = propiedades(pf), Ro = 5.15, Ri = 4.85;
    expect(pr.A).toBeCloseTo((Math.PI / 2) * (Ro * Ro - Ri * Ri), 3);
    // J respecto de y (viento B): π/8 (Ro⁴ − Ri⁴)
    expect(pr.JB / ((Math.PI / 8) * (Ro ** 4 - Ri ** 4))).toBeCloseTo(1, 3);
  });
  it('justificación: el camino es la cara izquierda o derecha', () => {
    const c = { v: [{ x: 0, y: 0 }, { x: 4, y: 0 }], cerrado: false };
    const iz = propiedades(ok(perfilSobreCamino(c, 0.2, 'izq'))), de = propiedades(ok(perfilSobreCamino(c, 0.2, 'der'))), ej = propiedades(ok(perfilSobreCamino(c, 0.2, 'eje')));
    expect(iz.yg).toBeCloseTo(0.1, 6); expect(de.yg).toBeCloseTo(-0.1, 6); expect(ej.yg).toBeCloseTo(0, 6);
    expect(iz.A).toBeCloseTo(0.8, 6);
  });
  it('esquina recta en inglete (L): área exacta', () => {
    const pf = ok(perfilSobreCamino({ v: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }], cerrado: false }, 0.2, 'izq'));
    // a la izquierda de la L: 4 × 0,2 + 3 × 0,2 − 0,2 × 0,2 (la esquina se cuenta una vez)
    expect(propiedades(pf).A).toBeCloseTo(4 * 0.2 + 3 * 0.2 - 0.04, 6);
  });
  it('recta + arco tangente + recta: el arco queda exacto', () => {
    // de (0,0) a (4,0), cuarto de círculo de radio 2 hasta (6,2), sube hasta (6,5)
    const b = Math.tan(Math.PI / 8);
    const pf = ok(perfilSobreCamino({ v: [{ x: 0, y: 0 }, { x: 4, y: 0, b }, { x: 6, y: 2 }, { x: 6, y: 5 }], cerrado: false }, 0.2, 'eje'));
    expect(pf.v.filter(q => q.b).length).toBe(2);
    expect(propiedades(pf).A).toBeCloseTo(0.2 * (4 + Math.PI + 3), 4);
  });
  it('camino cerrado: anillo con hueco', () => {
    const pf = ok(perfilSobreCamino({ v: [{ x: 3, y: 0, b: 1 }, { x: -3, y: 0, b: 1 }], cerrado: true }, 0.25, 'eje'));
    expect(pf.huecos?.length).toBe(1);
    expect(propiedades(pf).A).toBeCloseTo(Math.PI * (3.125 ** 2 - 2.875 ** 2), 3);
  });
  it('espesor más grande que el radio: error', () => {
    const r = perfilSobreCamino({ v: [{ x: 1, y: 0, b: 1 }, { x: -1, y: 0 }], cerrado: false }, 3, 'eje');
    expect('error' in r).toBe(true);
  });
});

import { bulgeTangente, tangenteFinal } from './colocar';
describe('arco tangente', () => {
  it('sale tangente a la recta anterior y es un cuarto de círculo', () => {
    const v = [{ x: 0, y: 0 }, { x: 4, y: 0 }];
    const t = tangenteFinal(v)!;
    const b = bulgeTangente(t, v[1], { x: 6, y: 2 });
    expect(b).toBeCloseTo(Math.tan(Math.PI / 8), 9);
    // y la tangente al final del arco apunta hacia +y
    const t2 = tangenteFinal([{ x: 4, y: 0, b }, { x: 6, y: 2 }])!;
    expect(t2.x).toBeCloseTo(0, 9); expect(t2.y).toBeCloseTo(1, 9);
  });
});
