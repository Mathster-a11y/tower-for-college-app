import { describe, expect, it } from 'vitest';
import { consejo, valorDe, vientoDe } from './avisosCalculo';
import type { Control } from '../engine/verificaciones';

const c = (grupo: string, nombre: string, extra: Partial<Control> = {}): Control => ({ grupo, nombre, criterio: '', fuente: '', planilla: null, guia: null, unidad: '', estado: 'no verifica', ...extra });

describe('avisos de lo que no verifica', () => {
  it('cada control lleva a su etapa, con su viento', () => {
    expect(consejo(c('Rigidez', 'ΣJ viento B ≥ J mínimo (h/500)')).etapa).toBe('rigidez');
    expect(vientoDe(c('Rigidez', 'ΣJ viento B ≥ J mínimo (h/500)'))).toBe('B');
    expect(consejo(c('Flexocompresión, viento A', 'T1: tracción (descargado)')).etapa).toBe('flexion');
    expect(vientoDe(c('Flexocompresión, viento A', 'T1: tracción (descargado)'))).toBe('A');
    expect(consejo(c('Estabilidad', 'Vuelco Me / Mv')).etapa).toBe('estabilidad');
    expect(consejo(c('Exoesqueleto', 'Barras del exo (CIRSOC 301/302), viento A')).etapa).toBe('exo');
    expect(consejo(c('Otro', 'algo')).etapa).toBe('resumen');
  });
  it('el valor con su unidad', () => {
    expect(valorDe(c('Estabilidad', 'Vuelco Me / Mv', { guia: 1.234 }))).toBe('1,23');
    expect(valorDe(c('Rigidez', 'x', { planilla: 1234.5, unidad: 'm⁴' }))).toMatch(/m⁴$/);
  });
});
