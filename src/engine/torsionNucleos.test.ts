/**
 * Núcleos cerrados: Bredt, reconocimiento de la caja, el equivalente de la guía contra el FEM y que la Planilla y la
 * Guía no cambien.
 */
import { describe, expect, it } from 'vitest';
import { ejemploGuia, type Muro, type Proyecto } from './modelo';
import { cortePorTorsion, jeqDe, jtCaja, nucleosCerrados } from './torsionNucleos';
import { resolverTorre, type ModeloTorre } from './fem/pseudo3d';
import { calcularProyecto } from './calculoProyecto';

/** ejemplo de la guía con una caja de 6 × 4 m (ejes) y paredes de 0,25 m en el centro, de la pieza «NC» */
function conCaja(aberturas = false): Proyecto {
  const p = ejemploGuia();
  const base = p.muros[0];
  const muro = (id: string, dir: 'X' | 'Y', x: number, y: number, largo: number): Muro => ({
    ...structuredClone(base), id, dir, x, y, largo, espesor: 0.25, piezaA: 'NC', piezaB: 'NC', pegadoA: '', pegadoB: '',
    tipo: undefined, ladoY: null, zDesde: null, zHasta: null, aberturas: null, grupo: undefined, rolA: '', rolB: '', soloGravedad: null,
  } as Muro);
  const cx = 0, cy = 0;
  // las paredes x de punta a punta (6,25 m); las y entre las caras interiores (4 − 0,25 = 3,75 m)
  p.muros.push(muro('C1', 'X', cx, cy - 2, 6.25), muro('C2', 'X', cx, cy + 2, 6.25), muro('C3', 'Y', cx - 3, cy, 3.75), muro('C4', 'Y', cx + 3, cy, 3.75));
  if (aberturas) p.muros.find(m => m.id === 'C3')!.aberturas = [{ desde: 0, hasta: 1, base: 0, alto: 2.2 }] as unknown as Muro['aberturas'];
  return p;
}

describe('núcleos cerrados (Bredt)', () => {
  it('Jt de una caja: 4·Am² / ∮ ds/t', () => {
    // 10 × 10 m de ejes y 0,30 m de pared: 4 · 100² / (40 / 0,3) = 300 m⁴
    expect(jtCaja(10, 10, 0.3, 0.3, 0.3, 0.3).Jt).toBeCloseTo(300, 9);
    // paredes distintas: ∮ = 6/0,2 + 6/0,4 + 4/0,3 + 4/0,3
    const k = jtCaja(6, 4, 0.2, 0.4, 0.3, 0.3);
    expect(k.Jt).toBeCloseTo((4 * 24 * 24) / (30 + 15 + 40 / 3 * 2), 9);
  });

  it('reconoce la caja de cuatro tabiques de una pieza, y no la abierta ni las C del ejemplo', () => {
    expect(nucleosCerrados(ejemploGuia())).toEqual([]);
    const ns = nucleosCerrados(conCaja());
    expect(ns).toHaveLength(1);
    expect(ns[0].tipo).toBe('caja');
    expect(ns[0].Am).toBeCloseTo(24, 9);
    expect([...ns[0].muros].sort()).toEqual(['C1', 'C2', 'C3', 'C4']);
    expect(ns[0].Jt).toBeCloseTo(jtCaja(6, 4, 0.25, 0.25, 0.25, 0.25).Jt, 9);
    // con una puerta en una pared, el flujo de corte no da la vuelta
    expect(nucleosCerrados(conCaja(true))).toEqual([]);
  });

  it('el corte que el torsor agrega a cada pared: q = T / 2·Am por su largo, solo en las que trabajan con ese viento', () => {
    const n = nucleosCerrados(conCaja())[0];
    expect(cortePorTorsion(n, 'C3', 'A', 48)).toBeCloseTo((48 / 48) * 4, 9);   // pared y con el viento A
    expect(cortePorTorsion(n, 'C1', 'A', 48)).toBe(0);
    expect(cortePorTorsion(n, 'C1', 'B', 48)).toBeCloseTo(6, 9);
  });

  it('FEM: el núcleo solo es un resorte G·Jt/Δz por piso; con torsor parejo el giro arriba es m·h²/(2·G·Jt)', () => {
    const z = Array.from({ length: 40 }, (_, k) => 3 * (k + 1)), h = 120, GJt = 1e7, m = 2;    // m en tm por metro de altura
    const mo: ModeloTorre = { z, E: 3.4e6, G: 3.4e6 / 2.4, timo: false, piezas: [], torsores: [{ nombre: 'N', GJt, zHasta: h }] };
    const cero = z.map(() => 0), Mz = z.map((_, k) => (k === z.length - 1 ? m * 1.5 : m * 3));
    const r = resolverTorre(mo, { Fx: cero, Fy: cero, Mz });
    // exacto: cada tramo gira lo que le llega de arriba por Δz / G·Jt; el torsor de la base es la suma
    let giro = 0;
    z.forEach((zk, k) => { const T = Mz.slice(k).reduce((s, x) => s + x, 0); giro += (T * (zk - (k ? z[k - 1] : 0))) / GJt; });
    expect(r.rz[z.length - 1]).toBeCloseTo(giro, 12);
    expect(r.torsores![0].T).toBeCloseTo(Mz.reduce((s, x) => s + x, 0), 9);
    // y al continuo m·h²/(2·G·Jt) le falta solo el medio piso de abajo
    expect(Math.abs(r.rz[z.length - 1] / ((m * h * h) / (2 * GJt)) - 1)).toBeLessThan(0.03);
  });

  it('el equivalente de la guía da el mismo giro arriba que el FEM (ménsula y núcleo con torsor parejo)', () => {
    const E = 3.4e6, G = E / 2.4, Jt = 50, h = 90;
    // Σ J·a² equivalente: con ménsulas, θ = m·h⁴ / (8·E·ΣJa²)
    const thetaGuia = (1 * h ** 4) / (8 * E * jeqDe(Jt, h));
    expect(thetaGuia).toBeCloseTo((1 * h * h) / (2 * G * Jt), 12);
  });

  it('Planilla y Guía no cambian con un núcleo; CIRSOC y FEM lo cuentan', () => {
    const sin = ejemploGuia(), con = conCaja();
    for (const metodo of ['planilla', 'guia'] as const) {
      const a = calcularProyecto({ ...sin, calculo: { ...(sin.calculo ?? {}), metodo } });
      const b = calcularProyecto({ ...con, calculo: { ...(con.calculo ?? {}), metodo } });
      expect(b.corr.rotoA?.nucleos).toBeUndefined();
      expect(b.cirsoc).toBeUndefined();
      expect(a.cirsoc).toBeUndefined();
    }
    const c = calcularProyecto({ ...con, calculo: { ...(con.calculo ?? {}), metodo: 'cirsoc' } });
    const ro = c.cirsoc!.corr.rotoA!;
    expect(ro.nucleos).toHaveLength(1);
    expect(ro.SJa2Nucleos).toBeCloseTo(ro.nucleos![0].Jeq, 9);
    const f = calcularProyecto({ ...con, calculo: { ...(con.calculo ?? {}), metodo: 'fem' } });
    expect(f.fem!.modelo.torsores).toHaveLength(1);
    expect(f.fem!.torsion!.A[ro.nucleos![0].nombre].some(T => T > 0)).toBe(true);
  });
});
