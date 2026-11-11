/**
 * Autoría y licencia de la app (se muestran en la pantalla, la ayuda, el informe y la hoja T3D).
 * Licencia propia por un año: uso, copia y adaptación no comerciales citando al autor, del 11/11/2026 al
 * 11/11/2027. Después, todos los derechos reservados salvo que el autor la renueve (ver LICENSE).
 */
export const AUTOR = 'Augusto Andrés Marsella';
export const ANIO = 2026;
export const DESDE = '11/11/2026';
export const HASTA = '11/11/2027';
/** fin de la licencia (inclusive), en hora de Argentina */
export const VENCE = new Date('2027-11-11T23:59:59-03:00');
export const LICENCIA = `uso no comercial hasta el ${HASTA}`;
export const LICENCIA_NOMBRE = `Licencia de uso no comercial por un año (del ${DESDE} al ${HASTA})`;
export const LICENCIA_URL = 'https://github.com/Mathster-a11y/tower-for-college-app/blob/main/LICENSE';
/** ¿la licencia sigue vigente hoy? */
export const vigente = (hoy = new Date()) => hoy.getTime() <= VENCE.getTime();
export const AVISO = `© ${ANIO} ${AUTOR} · Licencia de ${LICENCIA}`;
/** aviso que muestra la pantalla: cambia solo cuando la licencia vence */
export const avisoActual = (hoy = new Date()) => (vigente(hoy) ? AVISO : `© ${ANIO} ${AUTOR} · Todos los derechos reservados (la licencia de uso venció el ${HASTA}; consultá al autor)`);
