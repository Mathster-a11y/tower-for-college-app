import { describe, expect, it } from 'vitest';
import { veredictoGpu } from './pruebaGpu';

describe('prueba de la placa: qué fidelidad del túnel 3D alcanza', () => {
  it('una Intel Gen-12LP de notebook (9,9 cuadros por segundo con la grilla liviana): anda con la intermedia', () => {
    const v = veredictoGpu(9.9);
    expect(v).toMatch(/intermedia/);
    expect(v).toMatch(/unos 44 cuadros/);
    expect(v).not.toMatch(/No alcanza/);
  });
  it('10 o más: la alta; muy poco (menos de 2,3): la básica en el procesador', () => {
    expect(veredictoGpu(12)).toMatch(/fidelidad alta/);
    expect(veredictoGpu(1.5)).toMatch(/básica/);
  });
});
