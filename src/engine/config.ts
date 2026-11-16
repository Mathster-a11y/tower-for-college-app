/**
 * Configuración del cálculo que elige el usuario con los botones de la app (rama «nuevo-motor»).
 *
 *  - motor «actual»: replica la planilla virgen del repositorio (20 filas en «J Tabiques paralelos», qh máximo sin IF).
 *  - motor «nuevo»: replica la planilla de la cátedra 2025 (EDIFICIO_TORRE_1.xlsx): 28 filas en «J Tabiques
 *    paralelos» con los vínculos propios de Rototrasl. y Flex comp, qh = IF(qz = 0; 0; máx), W del tubo = J/(D/2),
 *    rangos completos en las sumas de Rototrasl.
 *  - método «app»: armado de piezas de la app (alas que conservan el área, posición por área, etc.).
 *  - método «planilla»: método simplificado de la cátedra (especificación, sección 7).
 *
 * Es un estado global a propósito: así aPlanilla() y calcularPlanilla() lo usan por defecto en toda la app sin pasar
 * parámetros por cada función. Las pruebas existentes no lo tocan y siguen con el motor «actual» y el método «app».
 */
export type Motor = 'actual' | 'nuevo';
export type Metodo = 'app' | 'planilla';

export const config: { motor: Motor; metodo: Metodo } = { motor: 'actual', metodo: 'app' };

export function usarConfig<T>(c: Partial<typeof config>, f: () => T): T {
  const antes = { ...config };
  Object.assign(config, c);
  try { return f(); } finally { Object.assign(config, antes); }
}
