/** Casos de comparación de los motores de elementos finitos (los usan exportar.ts y test/motorFem.test.ts). */
import { ejemploGuia, ejemploAsimetrico, type Proyecto } from '../../src/engine/modelo';
import { ejemploPlanta34 } from '../../src/engine/ejemplo34';

export const CASOS_FEM: [string, () => Proyecto][] = [
  ['guia', ejemploGuia],
  ['anexo', ejemploAsimetrico],
  ['planta34', ejemploPlanta34],
];
