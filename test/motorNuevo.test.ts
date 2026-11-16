// Motor «nuevo» (planilla de la cátedra 2025) y método de la planilla (especificación, sección 7).
// La comparación celda por celda con LibreOffice está en tools/verificar_motor_nuevo.ts + tools/comparar_motor_nuevo.py.
import { describe, expect, it } from 'vitest';
import { calcFilaJ, calcParalelosNuevo, calcularPlanilla, FILA_RELLENO, RANURA_FILA_NUEVO, filaExcelJ } from '../src/engine/planilla';
import { aPlanilla, perfilPlanilla } from '../src/engine/mapping';
import { ejemploGuia, type Muro } from '../src/engine/modelo';
import { config, usarConfig } from '../src/engine/config';

const muro = (id: string, dir: 'X' | 'Y', x: number, y: number, largo: number, espesor = 0.2): Muro =>
  ({ id, dir, x, y, largo, espesor, llega: true, areaInf: 10, piezaA: 'P', pegadoA: '', piezaB: 'PB', pegadoB: '' });

describe('motor nuevo (planilla 2025)', () => {
  it('por defecto la app sigue con el motor actual y el método de la app', () => {
    expect(config).toEqual({ motor: 'actual', metodo: 'app' });
  });
  it('valores de control de la especificación (6.5): asimétrica W 2,70 · X 0,75 · Z 0,25 · AB 2,25 · AE 0,35 · AF 10,75', () => {
    for (const nuevo of [false, true]) {
      const r = calcFilaJ({ ...FILA_RELLENO, W: 2.7, X: 0.75, Z: 0.25, AB: 2.25, AE: 0.35, AF: 10.75 }, false, false, nuevo);
      expect(r.AM).toBeCloseTo(82.66, 2); expect(r.AK).toBeCloseTo(3.915, 3); expect(r.AL).toBeCloseTo(1.938, 3);
    }
    expect(calcFilaJ({ B: 0.3, C: 1.97 }, false, false, true).D).toBeCloseTo(0.1911, 4);
  });
  it('W del tubo: la planilla 2025 da J/(D/2), cuatro veces la anterior', () => {
    const a = calcFilaJ({ S: 2, T: 1 }, false, false, false), b = calcFilaJ({ S: 2, T: 1 }, false, false, true);
    expect(b.V).toBeCloseTo(a.U / 1, 9); expect(b.V / a.V).toBeCloseTo(4, 9);
  });
  it('28 filas en «J Tabiques paralelos»: cada ranura en la fila que lee Rototrasl. y el resto con relleno', () => {
    const ranuras = Array.from({ length: 20 }, (_, i) => ({ B: 0.2, C: 1 + i / 10 }));
    const r = calcParalelosNuevo(ranuras);
    expect(r.filas28).toHaveLength(28);
    expect(RANURA_FILA_NUEVO.map(k => k + 4)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]);
    r.filas.forEach((f, i) => expect(f.D).toBeCloseTo((0.2 * (1 + i / 10) ** 3) / 12, 12));
    for (const k of [8, 9, 10, 23, 24, 25, 26, 27]) expect(r.filas28![k].AY).toBeLessThan(1e-8);
    expect(filaExcelJ('A', 8, 'nuevo')).toBe(15); expect(filaExcelJ('A', 8, 'actual')).toBe(12); expect(filaExcelJ('B', 8, 'nuevo')).toBe(12);
  });
  it('sotavento: con qz = 0 (PB a cota 0) la planilla 2025 da p = 0; la anterior deja la succión', () => {
    const a = aPlanilla(ejemploGuia());
    const k = a.filaNivel[ejemploGuia().niveles.findIndex(n => n.nombre === 'PB')];
    const viejo = calcularPlanilla(a.datos, { motor: 'actual' }), nuevo = calcularPlanilla(a.datos, { motor: 'nuevo' });
    expect(viejo.viento.R[k]).not.toBe(0);
    expect(nuevo.viento.R[k]).toBe(0);
    expect(nuevo.viento.R[k - 1]).toBeCloseTo(viejo.viento.R[k - 1], 9);
  });
  it('el ejemplo de la guía da el mismo ΣJ y el mismo reparto con los dos motores (sin tubos ni filas especiales)', () => {
    const p = ejemploGuia();
    const a = usarConfig({ motor: 'actual' }, () => aPlanilla(p)), b = usarConfig({ motor: 'nuevo' }, () => aPlanilla(p));
    const ra = calcularPlanilla(a.datos, { motor: 'actual' }), rb = calcularPlanilla(b.datos, { motor: 'nuevo' });
    expect(rb.jpar.AY24).toBeCloseTo(ra.jpar.AY24, 6);
    // las 8 filas de relleno de la planilla 2025 suman ~1e-9 a ΣJ: el reparto coincide hasta el 8º decimal
    rb.rotA.C.slice(0, 6).forEach((c, i) => expect(c).toBeCloseTo(ra.rotA.C[i], 8));
  });
});

describe('método planilla (sección 7)', () => {
  it('la U de la guía (T5): asimétrica, alas de 5,00 × 0,20 y alma de 3,60 → J = 8,0043 m⁴ (la guía redondea a 8,003)', () => {
    const p = ejemploGuia();
    const ms = p.muros.filter(m => m.piezaA === 'T5');
    const pz = perfilPlanilla('T5', 'A', ms, {});
    expect(pz.molde).toBe('asimétrico');
    expect(pz.fila).toMatchObject({ W: 5, X: 0.2, Z: 0.2, AB: 3.6, AH: 5, AI: 0.2 });
    expect(calcFilaJ({ S: 0.01, ...pz.fila }, false, false).AY).toBeCloseTo(8.00427, 4);   // 2·(5·0,2³/12 + 1·1,9²) + 0,2·3,6³/12
  });
  it('tabique suelto: solo en la hoja de su dirección fuerte', () => {
    const m = muro('T', 'Y', 3, 0, 4.5);
    expect(perfilPlanilla('T', 'A', [m], {}).fila).toEqual({ B: 0.2, C: 4.5 });
    expect(perfilPlanilla('T', 'B', [m], {}).fila).toEqual({});
    expect(perfilPlanilla('T', 'A', [m], {}).posicion).toBe(3);
  });
  it('alas apiladas: ancho = el muro más corto, alto = suma de espesores (no conserva el área)', () => {
    // alma vertical de 4 m y dos alas arriba (3,00 × 0,20 y 2,00 × 0,25): ala sup. 2,00 × 0,45
    const ms = [muro('a', 'Y', 0, 0, 4), muro('s1', 'X', 1.4, 2.1, 3), muro('s2', 'X', 0.9, 2.425, 2, 0.25)];
    const pz = perfilPlanilla('P', 'A', ms, {});
    expect(pz.fila.W).toBe(2); expect(pz.fila.X).toBe(0.45);
    expect(pz.fila.Z).toBe(0.2); expect(pz.fila.AB).toBe(4);
  });
  it('almas de un mismo lado: se unen extremo con extremo (suma de largos) con el espesor más fino', () => {
    const ms = [muro('s', 'X', 2, 3, 4), muro('a1', 'Y', 0.1, 1.5, 3, 0.25), muro('a2', 'Y', 0.1, -1, 2, 0.2), muro('d', 'Y', 3.9, 2, 2, 0.3)];
    const pz = perfilPlanilla('P', 'A', ms, {});
    expect(pz.molde).toBe('asimétrico');
    expect(pz.fila).toMatchObject({ Z: 0.2, AB: 5, AE: 0.3, AF: 2 });
  });
  it('doble T con el baricentro en el alma: simétrica, un solo grupo de almas', () => {
    const ms = [muro('a', 'Y', 0, 0, 3), muro('s', 'X', 0, 1.6, 2), muro('i', 'X', 0, -1.6, 2)];
    const pz = perfilPlanilla('P', 'A', ms, {});
    expect(pz.molde).toBe('simétrico');
    expect(pz.fila).toEqual({ B: 0.2, C: 3, F: 2, G: 0.2, J: 2, K: 0.2 });
    expect(pz.posicion).toBe(0);
  });
  it('viento B: arriba = +x, izquierda = +y (supuesto 14.1)', () => {
    // la misma U girada: alma en X (paralela al viento B) y alas en Y
    const ms = [muro('a', 'X', 0, 2, 3.6), muro('s', 'Y', 1.9, 0, 4), muro('i', 'Y', -1.9, 0, 4)];
    const pz = perfilPlanilla('P', 'B', ms, {});
    expect(pz.molde).toBe('asimétrico');
    expect(pz.fila).toMatchObject({ W: 4, Z: 0.2, AB: 3.6, AH: 4 });
    // el alma está a +y (izquierda en el viento B): la sección se apoya en el borde de +y
    const k = calcFilaJ({ S: 0.01, ...pz.fila }, true, false);
    expect(pz.posicion).toBeCloseTo(2.1 - k.AL, 4);
  });
});
