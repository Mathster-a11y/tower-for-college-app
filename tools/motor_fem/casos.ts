/** Casos de comparación de los motores de elementos finitos (los usan exportar.ts y test/motorFem.test.ts). */
import { ejemploGuia, ejemploAsimetrico, type Proyecto } from '../../src/engine/modelo';
import { ejemploPlanta34 } from '../../src/engine/ejemplo34';
import { torresPrueba } from '../../src/engine/torresPrueba';

export const CASOS_FEM: [string, () => Proyecto][] = [
  ['guia', ejemploGuia],
  ['anexo', ejemploAsimetrico],
  ['planta34', ejemploPlanta34],
  // torres de prueba que suman lo que los ejemplos no tienen: rotación fuerte (P4), muros que terminan antes de la
  // azotea (P5: ahí la planilla no vale, la comparación es entre la app, OpenSees y Pynite), columnas circulares (P6) y
  // subsuelos (P8)
  ['p4', () => torresPrueba()[3]],
  ['p5', () => torresPrueba()[4]],
  ['p6', () => torresPrueba()[5]],
  ['p8', () => torresPrueba()[7]],
];
