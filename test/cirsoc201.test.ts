/**
 * Etapa 4 del plan: verificación de tabiques según CIRSOC 201-2005, contra cuentas a mano.
 */
import { describe, expect, it } from 'vitest';
import { axialEmpirico, beta1, corteTabique, cuantiasMinimas, diagrama, FY, momentoResistente, N_POR_T, phiFlexo, verificarMuro201 } from '../src/engine/verificacion/cirsoc201';
import { calcularProyecto } from '../src/ui/estado';
import { ejemploGuia } from '../src/engine/modelo';
import { viento102 } from '../src/engine/cargas/cirsoc102';

describe('CIRSOC 201-2005', () => {
  it('β1 (10.2.7.3): 0,85 hasta 30 MPa, 0,05 menos cada 7 MPa, no menos de 0,65', () => {
    expect(beta1(30)).toBe(0.85);
    expect(beta1(37)).toBeCloseTo(0.8, 9);
    expect(beta1(80)).toBe(0.65);
  });
  it('φ (9.3.2): 0,65 controlada por compresión, 0,90 por tracción, lineal entre medio', () => {
    expect(phiFlexo(0.001)).toBe(0.65);
    expect(phiFlexo(0.002)).toBe(0.65);
    expect(phiFlexo(0.0035)).toBeCloseTo(0.775, 9);
    expect(phiFlexo(0.006)).toBe(0.9);
  });
  it('diagrama: carga axial máxima (10-2) y tracción pura', () => {
    const s = { lw: 4.5, h: 0.2, rho: 0.0025, rec: 0.03, fc: 30 };
    const dg = diagrama(s);
    const Ag = 4500 * 200, As = 0.0025 * Ag;
    expect(dg.phiPnMax).toBeCloseTo(0.8 * 0.65 * (0.85 * 30 * (Ag - As) + FY * As), 3);
    expect(dg.phiPnMin).toBeCloseTo(-0.9 * FY * As, 3);
    expect(momentoResistente(dg, dg.phiPnMax * 1.01)).toBe(0);
  });
  it('flexión pura de un tabique con armadura repartida: parecido a la fórmula aproximada de Cardenas y Magura', () => {
    // As = 0,0025 · 4500 · 200 = 2250 mm²; ω = ρ fy / f'c = 0,035; c/lw = ω / (2ω + 0,85 β1) = 0,0442
    // Mn ≈ 0,5 As fy lw (1 − c/lw) = 2,03·10⁹ N·mm ≈ 207 tm; con φ = 0,9 (controlada por tracción)
    const dg = diagrama({ lw: 4.5, h: 0.2, rho: 0.0025, rec: 0.03, fc: 30 });
    const phiMn = momentoResistente(dg, 0) / N_POR_T / 1000;
    const aprox = (0.5 * 2250 * FY * 4500 * (1 - 0.035 / (0.07 + 0.85 * 0.85))) / N_POR_T / 1000;
    expect(phiMn / (0.9 * aprox)).toBeCloseTo(1, 1);
  });
  it('la compresión aumenta el momento resistente (rama de tracción del diagrama)', () => {
    const dg = diagrama({ lw: 4.5, h: 0.2, rho: 0.0025, rec: 0.03, fc: 30 });
    expect(momentoResistente(dg, 300 * N_POR_T)).toBeGreaterThan(momentoResistente(dg, 0));
  });
  it('corte (11.10): Vc = ¼ √f\'c h d con d = 0,8 lw, y el límite 5/6 √f\'c h d', () => {
    const c = corteTabique(10, 0, 0, 4.5, 0.2, 0, 30);
    expect(c.d).toBeCloseTo(3.6, 9);
    expect(c.Vc).toBeCloseTo((0.25 * Math.sqrt(30) * 200 * 3600) / N_POR_T, 6);
    expect(c.VnMax).toBeCloseTo(((5 / 6) * Math.sqrt(30) * 200 * 3600) / N_POR_T, 6);
    expect(c.verifica).toBe(true);
    const conVs = corteTabique(10, 0, 0, 4.5, 0.2, 0.0025, 30);
    expect(conVs.Vs).toBeCloseTo((0.0025 * 200 * 3600 * FY) / N_POR_T, 6);
  });
  it('cuantías mínimas (14.3 y 11.10.9)', () => {
    expect(cuantiasMinimas(false, 64, 4.5)).toEqual({ rhoV: 0.0012, rhoH: 0.002 });
    expect(cuantiasMinimas(true, 64, 4.5)).toEqual({ rhoV: 0.0025, rhoH: 0.0025 });
  });
  it('método empírico (14-1)', () => {
    const t = axialEmpirico(4.5, 0.2, 3, 30, 0.8);
    expect(t).toBeCloseTo((0.55 * 0.65 * 30 * 4500 * 200 * (1 - ((0.8 * 3) / (32 * 0.2)) ** 2)) / N_POR_T, 6);
  });
  it('verificar un muro: con más momento hace falta más armadura vertical', () => {
    const base = [{ combinacion: '0,9 D + 1,0 W', Nu: 200, Mu: 100, Vu: 10 }];
    const poco = verificarMuro201('M1', 'alma', 4.5, 0.2, base, 30, 0.03, 64, 3);
    expect(poco.rhoNecesaria).toBe(poco.rhoMin);
    expect(poco.verifica).toBe(true);
    const mucho = verificarMuro201('M1', 'alma', 4.5, 0.2, [{ ...base[0], Mu: 900, Nu: 100 }], 30, 0.03, 64, 3);
    expect(mucho.rhoNecesaria).toBeGreaterThan(mucho.rhoMin);
    expect(mucho.relacion).toBeGreaterThan(1);       // con la mínima no alcanza
  });
});


describe('método CIRSOC en la app', () => {
  const conCirsoc = (n1?: number) => { const p = ejemploGuia(); p.calculo = { metodo: 'cirsoc', version: 'actual', armado: 'app', verificacion: 'completa' }; if (n1) p.cirsoc102 = { frecuencia: 'manual', n1manual: n1 }; return p; };
  it('las vistas usan el viento del 102-25 (la planilla con sus parámetros) y coinciden con el cálculo directo', () => {
    const p = conCirsoc(1.2), c = calcularProyecto(p), w = viento102(p);
    expect(c.cirsoc).toBeDefined();
    // corte en PB: el de la planilla con el viento del 102-25 contra el del 102-25 directo (diferencia por la azotea y la franja de PB)
    expect(c.valores.mnyq.H61 / w.A.QPB).toBeCloseTo(1, 1);
    expect(c.controles.some(x => x.grupo === 'CIRSOC 201, viento A')).toBe(true);
    expect(c.controles.some(x => x.nombre === 'Vuelco con 0,9 D + 1,0 W')).toBe(true);
    expect(c.controles.some(x => /^Flexocompresión/.test(x.grupo))).toBe(false);   // los de la guía no van
  });
  it('rígido (n1 = 1,2 Hz, G = 0,85): la torre de la guía verifica el hormigón con poca armadura', () => {
    const c = calcularProyecto(conCirsoc(1.2));
    const t1 = c.cirsoc!.verif.find(x => x.nombre === 'T1' && x.dir === 'A')!;
    expect(t1.muros[0].rhoNecesaria).toBeLessThan(0.01);
    expect(t1.muros[0].corte.verifica).toBe(true);
  });
  it('flexible (la frecuencia aproximada, n1 ≈ 0,17 Hz): las cargas suben y hace falta más armadura', () => {
    const rig = calcularProyecto(conCirsoc(1.2)).cirsoc!.verif.find(x => x.nombre === 'T1')!;
    const flex = calcularProyecto(conCirsoc()).cirsoc!.verif.find(x => x.nombre === 'T1')!;
    expect(flex.M).toBeGreaterThan(rig.M);
    expect(flex.muros[0].rhoNecesaria).toBeGreaterThan(rig.muros[0].rhoNecesaria);
  });
});

import { CLASES_EXPOSICION, datos201De, recubrimientoMm } from '../src/engine/metodos/cirsoc';
import { leerProyecto } from '../src/engine/lector';
describe('CIRSOC 200-24: recubrimiento y clase de exposición', () => {
  it('Rnom = Ref (Tabla 8.3, tabiques in situ) + Δr (5 mm con control, 10 sin)', () => {
    expect(recubrimientoMm({})).toBe(25);                                                  // interior, 50 años, con control
    expect(recubrimientoMm({ recubrimiento: 'exterior' })).toBe(35);
    expect(recubrimientoMm({ recubrimiento: 'exterior', vidaUtil: 100, control: 'sin' })).toBe(45);
    expect(recubrimientoMm({ vidaUtil: 100 })).toBe(30);
    expect(recubrimientoMm({ recManual: 40 })).toBe(40);
  });
  it('f\'c mínimo de la Tabla 2.5 (hormigón armado) y las clases viejas se migran', () => {
    expect(CLASES_EXPOSICION.A3.fcMin).toBe(25);
    expect(CLASES_EXPOSICION.M3.fcMin).toBe(40);
    expect(datos201De({ cirsoc201: { exposicion: 'marina-agresiva' as never } }).exposicion).toBe('M1');
    const p = { ...ejemploGuia(), cirsoc201: { exposicion: 'A3-Q1-C1' as never } };
    expect(leerProyecto(JSON.parse(JSON.stringify(p))).ok).toBe(true);
  });
  it('el control de durabilidad aparece en el método CIRSOC', () => {
    const p = { ...ejemploGuia(), calculo: { metodo: 'cirsoc' as const }, cirsoc201: { exposicion: 'M3' as const } };
    const c = calcularProyecto(p).controles.find(x => x.nombre.startsWith("f'c mínimo"))!;
    expect(c.estado).toBe('no verifica');                                                   // H30 < 40 MPa
  });
});
