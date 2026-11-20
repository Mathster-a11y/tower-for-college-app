/**
 * Métodos de cálculo de Torre 3D (plan de trabajo, docs/plan_metodos.html, etapa 1).
 *
 * Cada método sigue sus propias reglas:
 *  - «planilla»: la planilla de la cátedra tal cual (versión anterior o 2025), con sus simplificaciones;
 *  - «guia»: el procedimiento analítico de la guía «Edificio en torre» 2024 (hoy, los valores «Guía/CIRSOC» de la app);
 *  - «cirsoc»: CIRSOC 101-25, 102-25 y 201 (etapas 3 y 4, todavía no disponible);
 *  - «fem»: las reglas del CIRSOC con el reparto de un modelo de la torre (etapa 6, todavía no disponible);
 *  - «combinado»: corre todos y los compara (etapa 7).
 *
 * El método elegido se guarda DENTRO del proyecto (campo «calculo»): el mismo archivo da los mismos resultados en
 * cualquier computadora (hallazgo 5 del informe técnico, docs/informes/analisis-tecnico-torre-3d.html).
 */
import type { Metodo as ArmadoMotor, Motor } from '../config';

export type IdMetodo = 'planilla' | 'guia' | 'cirsoc' | 'fem' | 'combinado';
/** versión de la planilla de la cátedra que se replica: «actual» = la anterior, «nuevo» = EDIFICIO_TORRE_1 (2025) */
export type VersionPlanilla = Motor;
/** armado de las piezas: «catedra» = método simplificado de la cátedra (especificación, sección 7); «app» = el de la app */
export type Armado = 'catedra' | 'app';

/** verificación del hormigón en los métodos CIRSOC y FEM: «simple» (a mano) o «completa» (diagrama de interacción) */
export type NivelVerificacion = 'simple' | 'completa';
/** método FEM: las piezas como vigas de Euler-Bernoulli (solo flexión) o de Timoshenko (con la deformación por corte) */
export type TeoriaFem = 'timoshenko' | 'euler';
export interface ConfigCalculo { metodo: IdMetodo; version: VersionPlanilla; armado: Armado; verificacion: NivelVerificacion; teoria: TeoriaFem }

/** lo que se usa cuando el proyecto no dice nada: lo que la app calculaba hasta noviembre de 2026 (no cambia números) */
export const CONFIG_POR_DEFECTO: Readonly<ConfigCalculo> = { metodo: 'planilla', version: 'actual', armado: 'app', verificacion: 'completa', teoria: 'timoshenko' };

/** versión de las fórmulas: sube cuando cambia algún resultado, para saber con qué cálculo se hizo una entrega */
export const VERSION_FORMULAS = '2026.11';

export interface InfoMetodo { nombre: string; corto: string; disponible: boolean; reglas: string; etapa?: string }
export const METODOS: Record<IdMetodo, InfoMetodo> = {
  planilla: { nombre: 'Planilla virgen', corto: 'Planilla', disponible: true, reglas: 'La planilla de la cátedra tal cual, con sus simplificaciones (G = 0,85, rototraslación de la planilla, pieza entera).' },
  guia: { nombre: 'Guía', corto: 'Guía', disponible: true, reglas: 'El procedimiento analítico de la guía «Edificio en torre» 2024: Kz constante por debajo de 5 m, sin viento en PB ni en los subsuelos, J completo, rotación muro por muro y momento de rotación con las unidades bien.' },
  cirsoc: { nombre: 'CIRSOC', corto: 'CIRSOC', disponible: true, reglas: 'Cargas del CIRSOC 101-25 y 102-25 (viento por categoría de riesgo, frecuencia, G o Gf, cuatro casos de carga con torsión, combinaciones con 1,0 W), reparto de la guía y verificación por resistencia del CIRSOC 201-2005 (simple o completa).' },
  fem: { nombre: 'FEM', corto: 'FEM', disponible: true, reglas: 'Las reglas del CIRSOC con el reparto de un modelo de la torre: pseudo-3D con losas rígidas (Euler o Timoshenko), análisis modal para la frecuencia del viento y los cuatro casos de carga resueltos con el modelo.' },
  combinado: { nombre: 'Combinado', corto: 'Combinado', disponible: true, reglas: 'Corre los cuatro métodos con la misma torre y los compara en una tabla (Resumen), con la diferencia contra la planilla y la capa de la que sale. Las etapas muestran la Planilla virgen.' },
};
export const IDS_METODO = Object.keys(METODOS) as IdMetodo[];

/** la configuración del proyecto, con lo que falte completado por defecto */
export function configDe(p: { calculo?: (Partial<ConfigCalculo> & { formulas?: string }) | null }): ConfigCalculo {
  const c = p.calculo ?? {};
  return {
    metodo: c.metodo && METODOS[c.metodo]?.disponible ? c.metodo : CONFIG_POR_DEFECTO.metodo,
    version: c.version === 'nuevo' || c.version === 'actual' ? c.version : CONFIG_POR_DEFECTO.version,
    armado: c.armado === 'catedra' || c.armado === 'app' ? c.armado : CONFIG_POR_DEFECTO.armado,
    verificacion: c.verificacion === 'simple' ? 'simple' : 'completa',
    teoria: c.teoria === 'euler' ? 'euler' : 'timoshenko',
  };
}

/** la configuración que lee el motor de la planilla (config.ts) */
export const configMotor = (c: ConfigCalculo): { motor: Motor; metodo: ArmadoMotor } => ({ motor: c.version, metodo: c.armado === 'catedra' ? 'planilla' : 'app' });

/** texto para informes, láminas y el resumen: «Planilla virgen · versión anterior · armado de la app» */
export function describirConfig(c: ConfigCalculo): string {
  const partes = [METODOS[c.metodo].nombre];
  if (c.metodo === 'combinado') return 'Combinado: Planilla virgen, Guía, CIRSOC y FEM';
  if (c.metodo === 'planilla') partes.push(c.version === 'nuevo' ? 'planilla 2025' : 'planilla anterior');
  if (c.metodo === 'planilla' || c.metodo === 'guia') partes.push(c.armado === 'catedra' ? 'armado de la cátedra' : 'armado de la app');
  if (c.metodo === 'cirsoc' || c.metodo === 'fem') partes.push(`verificación ${c.verificacion}`);
  if (c.metodo === 'fem') partes.push(c.teoria === 'euler' ? 'Euler-Bernoulli' : 'Timoshenko');
  return partes.join(' · ');
}
