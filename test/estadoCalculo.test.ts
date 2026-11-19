/**
 * Hallazgo 2 del informe técnico: un proyecto inválido no puede reemplazar al abierto, y si un cálculo falla, los
 * resultados que quedan en pantalla se marcan como no vigentes (no se exportan).
 */
import { describe, expect, it } from 'vitest';
import { estado } from '../src/ui/estado';
import { ejemploAsimetrico, ejemploGuia } from '../src/engine/modelo';

describe('estado: proyecto válido y resultados vigentes', () => {
  it('un proyecto dañado no reemplaza al abierto', () => {
    estado.reemplazar(ejemploGuia());
    const antes = JSON.stringify(estado.proyecto), rev = estado.revision;
    const malo = { ...ejemploGuia(), niveles: [null] };
    expect(() => estado.reemplazar(malo)).toThrow(/Nivel 1/);
    expect(JSON.stringify(estado.proyecto)).toBe(antes);
    expect(estado.revision).toBe(rev);
    expect(estado.vigente).toBe(true);
  });
  it('al abrir otro proyecto sube la revisión y el cálculo es del nuevo', () => {
    const rev = estado.revision;
    estado.reemplazar(ejemploAsimetrico());
    expect(estado.revision).toBeGreaterThan(rev);
    expect(estado.calculo.revision).toBe(estado.revision);
    expect(estado.vigente).toBe(true);
  });
  it('si el cálculo falla, quedan los resultados anteriores pero no son vigentes', () => {
    estado.reemplazar(ejemploGuia());
    const sumaAntes = estado.calculo.res.mnyq.H61;
    estado.cambiar(p => { p.niveles[2] = null as never; });   // un nivel roto: el cálculo tira un error
    expect(estado.calculo.error).toBeTruthy();
    expect(estado.calculo.res.mnyq.H61).toBe(sumaAntes);
    expect(estado.calculo.revision).toBeLessThan(estado.revision);
    expect(estado.vigente).toBe(false);
    estado.deshacer();
    expect(estado.vigente).toBe(true);
  });
  it('cambiar de método es un cambio del proyecto: se guarda con él y se deshace', () => {
    estado.reemplazar(ejemploGuia());
    expect(estado.proyecto.calculo).toMatchObject({ metodo: 'planilla', version: 'actual', armado: 'app' });
    expect(estado.fuente).toBe('planilla');
    const rev = estado.revision;
    estado.cambiarCalculo({ metodo: 'guia' });
    expect(estado.proyecto.calculo?.metodo).toBe('guia');
    expect(estado.fuente).toBe('guia');
    expect(estado.revision).toBeGreaterThan(rev);
    expect(estado.vigente).toBe(true);
    estado.deshacer();
    expect(estado.fuente).toBe('planilla');
  });
  it('en el modo con botón, un cambio deja los resultados pendientes (no vigentes) hasta calcular', () => {
    estado.cambiarModo('boton');
    try {
      estado.cambiar(p => { p.muros[0].largo += 1; });
      expect(estado.vigente).toBe(false);
      estado.asegurarCalculo();
      expect(estado.vigente).toBe(true);
    } finally { estado.cambiarModo('vivo'); }
  });
});
