/**
 * Cargas gravitatorias y combinaciones según CIRSOC 101-25 (Reglamento Argentino de Cargas Permanentes y Sobrecargas
 * Mínimas de Diseño para Edificios y otras Estructuras, edición julio 2025) y el Apéndice B del CIRSOC 102-25.
 * Capa «cargas» de los métodos CIRSOC y FEM (plan de trabajo, etapa 3).
 *
 *  - D: carga permanente de la losa (t/m²): peso propio, contrapiso, solado, cielorraso, tabiquería. La guía usa
 *    0,7 t/m² («sin sobrecarga»); el peso propio de los tabiques se suma aparte (2,4 t/m³).
 *  - L: sobrecarga de uso (Tabla 4.1). Viviendas y habitaciones privadas: 2 kN/m²; oficinas: 2,5 kN/m². La guía usa
 *    0,9 − 0,7 = 0,2 t/m² ≈ 2 kN/m².
 *  - Combinaciones por resistencia (101-25 art. 2.3.2; 102-25 B.3.2), con el viento de resistencia del 102-25 (1,0 W).
 *  - Servicio (102-25, comentario C B.4.2): D + 0,5 L + Wa, con el viento de servicio Wa.
 */
import { KN_POR_T } from './cirsoc102';

export type Destino = 'vivienda' | 'oficinas' | 'otro';
/** Tabla 4.1 (kN/m²) */
export const SOBRECARGA_DESTINO: Record<Exclude<Destino, 'otro'>, number> = { vivienda: 2, oficinas: 2.5 };

export interface DatosCirsoc101 {
  /** carga permanente de la losa (t/m²) */
  D?: number;
  /** destino (Tabla 4.1) o «otro» con la sobrecarga escrita a mano (Lmanual, kN/m²) */
  destino?: Destino; Lmanual?: number | null;
}
export const DATOS_101_POR_DEFECTO = { D: 0.7, destino: 'vivienda' as Destino, Lmanual: null as number | null };
export const datos101De = (p: { cirsoc101?: DatosCirsoc101 | null }) => ({ ...DATOS_101_POR_DEFECTO, ...(p.cirsoc101 ?? {}) });

/** sobrecarga de uso en t/m² */
export function sobrecarga(d: DatosCirsoc101): number {
  const x = { ...DATOS_101_POR_DEFECTO, ...d };
  const kN = x.destino === 'otro' ? (x.Lmanual ?? 0) : SOBRECARGA_DESTINO[x.destino];
  return kN / KN_POR_T;
}

export interface Combinacion { nombre: string; D: number; L: number; W: number; Lr?: number; nota: string }
/**
 * Combinaciones por resistencia de CIRSOC 101-25, art. 2.3.2 (las que llevan viento son las del Apéndice B del
 * 102-25). Sin nieve, lluvia ni sismo (la sobrecarga de cubierta Lr de una azotea va como L). La excepción 1 permite
 * L con 0,5 en las combinaciones 3, 4 y 5 cuando la sobrecarga es ≤ 5 kN/m² (no en garajes ni lugares de reunión).
 */
export function combinaciones(Lreducida = true): Combinacion[] {
  const fL = Lreducida ? 0.5 : 1;
  return [
    { nombre: '1,4 D', D: 1.4, L: 0, W: 0, nota: 'comb. 1' },
    { nombre: '1,2 D + 1,6 L', D: 1.2, L: 1.6, W: 0, nota: 'comb. 2' },
    { nombre: '1,2 D + 0,5 W', D: 1.2, L: 0, W: 0.5, nota: 'comb. 3, con «0,5 W» en lugar de «L» (sin sobrecarga de cubierta)' },
    { nombre: `1,2 D + 1,0 W + ${fL === 1 ? '' : '0,5 '}L`, D: 1.2, L: fL, W: 1.0, nota: 'comb. 4: la que más comprime con viento' },
    { nombre: '0,9 D + 1,0 W', D: 0.9, L: 0, W: 1.0, nota: 'comb. 6: la que más tracciona y la del vuelco' },
  ];
}
/** servicio (102-25, C B.4.2): D + 0,5 L + Wa */
export const SERVICIO: Combinacion = { nombre: 'D + 0,5 L + Wa', D: 1, L: 0.5, W: 1, nota: 'servicio (deriva), con el viento de servicio' };
