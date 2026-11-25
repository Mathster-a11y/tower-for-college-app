import { describe, expect, it } from 'vitest';
import { resumenControles } from './presentacion';
import type { Control } from '../engine/verificaciones';

const c = (estado: Control['estado'], nombre = 'x'): Control => ({ grupo: 'g', nombre, criterio: '', fuente: '', planilla: null, guia: 1, unidad: '', estado });
describe('presentación del trabajo · el resumen de los controles', () => {
  it('cuenta los que verifican, los que no y los de revisar; los informativos no cuentan', () => {
    const r = resumenControles([c('verifica'), c('verifica'), c('no verifica', 'Vuelco'), c('atención'), c('informativo' as Control['estado'])]);
    expect(r.total).toBe(4); expect(r.verifican).toBe(2);
    expect(r.noVerifican.map(x => x.nombre)).toEqual(['Vuelco']); expect(r.atencion).toHaveLength(1);
  });
});
