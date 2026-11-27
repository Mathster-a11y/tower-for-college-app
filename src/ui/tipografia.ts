/**
 * Las familias de letra de la app, nombradas en un solo lugar (como pide la guía de tipografía):
 *   · IBM Plex Sans para la interfaz,
 *   · JetBrains Mono para números y tablas,
 *   · IBM Plex Math para los símbolos que Plex Sans no tiene y para las variables de las fórmulas.
 * Las tres distinguen siempre I, l y 1 (y 0 de O), en derecha, cursiva y negrita; system-ui, Arial o Calibri no:
 * en ellas la I mayúscula y la l minúscula son el mismo palo.
 *
 * Las hojas de estilo usan las variables --fuente, --mono y --math (estilo.css), que repiten estas listas. Lo que se
 * dibuja a mano (canvas, SVG armado en código, PowerPoint) usa estas constantes.
 */
export const FAMILIA_UI = '"IBM Plex Sans", "IBM Plex Math", sans-serif';
export const FAMILIA_MONO = '"JetBrains Mono", "IBM Plex Math", monospace';
export const FAMILIA_MATH = '"IBM Plex Math", "IBM Plex Sans", serif';
/** el nombre para PowerPoint y Excel (no admiten una lista: si falta en la computadora que lo abre, ponen otra) */
export const FUENTE_PPTX = 'IBM Plex Sans';
export const FUENTE_EXCEL = 'IBM Plex Sans';
/** la nota de los «Léame» y del mensaje al bajar un PowerPoint: dónde conseguir las letras */
export const NOTA_LETRAS = 'Letra: IBM Plex Sans, elegida porque distingue siempre I, l y 1 (y 0 de O). Si la computadora no la tiene, el programa muestra otra en su lugar; se baja gratis (licencia libre OFL) de fonts.google.com/specimen/IBM+Plex+Sans e IBM Plex Math de fonts.google.com/specimen/IBM+Plex+Math.';

/** el aviso corto al bajar un PowerPoint */
export const AVISO_LETRA_PPTX = 'Usa IBM Plex Sans: si PowerPoint muestra otra letra, instalala gratis desde fonts.google.com.';

/** la letra de un canvas: `letraLienzo(11, 600)` → «600 11px "IBM Plex Sans", …» */
export const letraLienzo = (px: number, peso: 400 | 600 | 700 = 400, mono = false) => `${peso === 400 ? '' : `${peso} `}${px}px ${mono ? FAMILIA_MONO : FAMILIA_UI}`;

/**
 * El navegador baja una letra recién cuando un texto de la página la usa; un canvas que dibuja antes ve la de reserva
 * (y mide mal los anchos). Al abrir la app se piden de antemano las que usan los canvas.
 */
export function precargarLetras(): Promise<unknown> {
  if (typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve();
  return Promise.allSettled([letraLienzo(12), letraLienzo(12, 600), letraLienzo(12, 700), `12px ${FAMILIA_MATH}`, letraLienzo(12, 400, true)]
    .map(f => document.fonts.load(f, 'Il1 0O ΣJ·²')));
}
