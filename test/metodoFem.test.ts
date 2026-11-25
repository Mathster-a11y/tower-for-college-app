import { describe, expect, it } from 'vitest';
import { ejemploGuia } from '../src/engine/modelo';
import { calcularFem, esfuerzosFem, masasDeProyecto, modeloDeProyecto } from '../src/engine/metodos/fem';
import { entradaFem } from '../src/engine/femEntrada';
import { calcularProyecto } from '../src/ui/estado';

describe('método FEM con la torre de la guía', () => {
  const p = ejemploGuia();
  const r = calcularFem(p, 'euler');
  it('arma el modelo con las piezas de las dos direcciones y masas razonables', () => {
    const mo = modeloDeProyecto(p);
    expect(mo.piezas.some(x => x.dir === 'A')).toBe(true);
    expect(mo.piezas.some(x => x.dir === 'B')).toBe(true);
    const { masas } = masasDeProyecto(p, mo);
    // ~1 t/m² de peso por piso (losa 0,7 + tabiques): masa > 0 en todos los pisos
    expect(masas.every(m => m > 0)).toBe(true);
  });
  it('la frecuencia del modal entra al viento', () => {
    expect(r.n1.A).toBeGreaterThan(0.05); expect(r.n1.A).toBeLessThan(10);
    expect(r.viento.A.n1).toBeCloseTo(r.n1.A, 9);
    expect(r.viento.A.metodoFrecuencia).toMatch(/modal/);
    // la torre de la guía es flexible: el modal da lo mismo que la fórmula del 102-25 (≈ 0,36 Hz), lejos del 1 Hz
    expect(r.n1.A).toBeLessThan(1);
  });
  it('caso 1: equilibrio y, con Euler y todas las piezas enteras, el reparto de la planilla', () => {
    const c = r.casos[0], W = c.cargas.Fy.reduce((s, x) => s + x, 0);
    expect(Math.abs(c.res.piezas.filter(x => x.dir === 'A').reduce((s, x) => s + x.V, 0) - W) / W).toBeLessThan(1e-6);
    if (entradaFem(p, 'A').alturaCompleta) for (const x of r.reparto.filter(x => x.dir === 'A')) expect(Math.abs(x.fem - x.planilla)).toBeLessThan(0.05);
  });
  it('los cuatro casos dan esfuerzos para cada pieza', () => {
    const nombre = r.modelo.piezas.find(x => x.dir === 'A')!.nombre;
    const e = esfuerzosFem(r, 'A', nombre)!;
    expect(e).toHaveLength(4);
    // caso 2: 75 % con la torsión del signo que suma (puede pasar al caso 1 en las piezas de borde); caso 3 sin torsión propia
    expect(Math.abs(e[1].M)).toBeGreaterThan(0.75 * Math.abs(e[0].M) - 1e-6);
    expect(Math.abs(e[3].M)).toBeLessThan(Math.abs(e[1].M) + Math.abs(e[0].M));
  });
  it('el método FEM calcula de punta a punta con los controles del CIRSOC', () => {
    const q = { ...p, calculo: { metodo: 'fem' as const } };
    const c = calcularProyecto(q);
    expect(c.config.metodo).toBe('fem');
    expect(c.fem).toBeDefined();
    expect(c.controles.some(x => /Deriva de servicio/.test(x.nombre) && /FEM/.test(x.fuente))).toBe(true);
    expect(c.cirsoc!.verif.length).toBeGreaterThan(0);
  });
});
