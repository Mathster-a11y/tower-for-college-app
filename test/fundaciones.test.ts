/** Fundaciones (sección D del plan): platea rígida, σt adm del estudio de suelos, contacto parcial y CIRSOC 401. */
import { describe, expect, it } from 'vitest';
import { presionPlatea, profundidadEstudio, sueloCirsoc, COMBOS_SUELO } from '../src/engine/fundaciones';
import { ejemploGuia } from '../src/engine/modelo';
import { calcularProyecto } from '../src/ui/estado';

describe('presión de una platea rígida', () => {
  it('dentro del núcleo central: σ = N/(a·b)·(1 ± 6e/b)', () => {
    const x = presionPlatea(4000, 6000, 18, 22);            // e = 1,5 m < 18/6 = 3 m
    expect(x.parcial).toBe(false);
    expect(x.sMax).toBeCloseTo((4000 / (22 * 18) / 10) * (1 + (6 * 1.5) / 18), 12);
    expect(x.sMin).toBeCloseTo((4000 / (22 * 18) / 10) * (1 - (6 * 1.5) / 18), 12);
  });
  it('fuera del núcleo: contacto parcial en 3·(b/2 − e) con σmáx = 2N / (3·a·(b/2 − e)); fuera de la platea, vuelca', () => {
    const x = presionPlatea(4000, 20000, 18, 22);           // e = 5 m > 3 m
    expect(x.parcial).toBe(true);
    expect(x.contacto).toBeCloseTo(3 * (9 - 5), 12);
    expect(x.sMax).toBeCloseTo((2 * 4000) / (3 * 22 * 4) / 10, 12);
    expect(x.sMin).toBe(0);
    // en el borde del núcleo las dos fórmulas dan lo mismo
    expect(presionPlatea(4000, 12000, 18, 22).sMax).toBeCloseTo((2 * 4000) / (3 * 22 * 6) / 10, 9);
    expect(presionPlatea(4000, 40000, 18, 22).vuelca).toBe(true);
  });
  it('CIRSOC 401: profundidad del estudio = máx(6 m; Df + 2·ancho)', () => {
    const p = ejemploGuia();
    const e = profundidadEstudio(p);
    expect(e.desdeTerreno).toBeCloseTo(Math.max(6, e.Df + 2 * Math.min(p.fundacion.a1, p.fundacion.b1)), 12);
  });
});

describe('suelo en los métodos', () => {
  it('guía: la tensión máxima se compara con σt adm (dato; 2,5 kg/cm² por defecto)', () => {
    const p = ejemploGuia();
    const c = calcularProyecto({ ...p, calculo: { metodo: 'guia' } }).controles.find(x => x.nombre === 'Tensión máxima en el suelo')!;
    expect(c.estado).toBe(Math.abs(c.guia!) <= 2.5 ? 'verifica' : 'no verifica');
    const d = calcularProyecto({ ...p, calculo: { metodo: 'guia' }, fundacion: { ...p.fundacion, sigmaAdm: 0.5 } }).controles.find(x => x.nombre === 'Tensión máxima en el suelo')!;
    expect(d.estado).toBe('no verifica');
  });
  it('CIRSOC: combinaciones de servicio del 102-25 y el peor caso contra σt adm', () => {
    const p = { ...ejemploGuia(), calculo: { metodo: 'cirsoc' as const } };
    const c = calcularProyecto(p), su = sueloCirsoc(p, c.cirsoc!.viento);
    expect(su.dirs[0].combos.map(x => x.nombre)).toEqual(COMBOS_SUELO.map(x => x.nombre));
    const k = c.controles.find(x => x.nombre === 'Presión en el suelo, viento A')!;
    expect(k.guia).toBe(su.dirs[0].peor.sMax);
    expect(c.controles.some(x => x.nombre === 'Tensión máxima en el suelo')).toBe(false);   // la de la guía no va
  });
});
