/**
 * Confort del peatón en la vereda (propuesta 5 del diagnóstico de viento), con el criterio de Lawson en su versión
 * LDDC: cada actividad tiene una velocidad que no debería superarse más del 5 % del tiempo (2,5 m/s sentarse seguido,
 * 4 sentarse un rato, 6 estar parado, 8 caminar; más, incómodo). Las velocidades del lugar salen del viento medio anual
 * a 10 m (dato de una estación meteorológica) con una distribución de Rayleigh (Weibull k = 2), llevado a 1,5 m con el
 * perfil del CIRSOC 102-25 (Kz constante debajo de 5 m) y multiplicado por el factor de la simulación (la velocidad en
 * la vereda sobre la del campo abierto a la misma altura).
 */
import { Kz, type Exposicion } from '../engine/cargas/cirsoc102';

/** las categorías LDDC (5 % del tiempo) */
export const LAWSON_LDDC = [
  { codigo: 'A', hasta: 2.5, texto: 'sentarse seguido' },
  { codigo: 'B', hasta: 4, texto: 'sentarse un rato' },
  { codigo: 'C', hasta: 6, texto: 'estar parado' },
  { codigo: 'D', hasta: 8, texto: 'caminar' },
  { codigo: 'E', hasta: Infinity, texto: 'incómodo' },
] as const;
export type CodigoLawson = (typeof LAWSON_LDDC)[number]['codigo'];

/** la velocidad superada el 5 % del tiempo, con viento medio «media» y distribución de Rayleigh: c·√(−ln 0,05), c = media / Γ(1,5) */
export const velocidad5 = (media: number) => (media / 0.886227) * Math.sqrt(-Math.log(0.05));

/** el campo abierto a 1,5 m respecto de 10 m, con el perfil del 102-25 (u ∝ √Kz; Kz constante debajo de 5 m) */
export const factorPeaton = (exp: Exposicion) => Math.sqrt(Kz(5, exp) / Kz(10, exp));

/** la categoría Lawson LDDC de una velocidad superada el 5 % del tiempo */
export function categoriaLawson(u5: number): (typeof LAWSON_LDDC)[number] {
  return LAWSON_LDDC.find(c => u5 <= c.hasta) ?? LAWSON_LDDC[LAWSON_LDDC.length - 1];
}
