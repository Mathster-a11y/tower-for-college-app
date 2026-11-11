/**
 * Rótulos de los polígonos funiculares (notación de Bow, como en estática gráfica): los espacios entre rectas de
 * acción llevan letras a, b, c…; cada fuerza se nombra por los dos espacios que separa (ab, bc…); el rayo O·c y el
 * lado c del funicular comparten letra y color (son paralelos). Al pasar el mouse por un rayo o un lado se resaltan
 * los dos; el primer y el último lado del funicular van punteados.
 */
export const letra = (i: number) => 'abcdefghijklmnopqrstuvwxyz'[i] ?? `z${i - 25}`;
/** color del par rayo–lado i: paleta categórica validada de 8; con más, la letra los distingue */
export const colorPar = (i: number) => `var(--serie-${(i % 8) + 1})`;

/** resalta todos los elementos del mismo par (data-par) al pasar el mouse; el resto se atenúa */
export function activarResaltado(svg: SVGElement) {
  const limpiar = () => { svg.classList.remove('resaltando'); svg.querySelectorAll('.activo').forEach(e => e.classList.remove('activo')); };
  svg.querySelectorAll<SVGElement>('[data-par]').forEach(e => {
    e.addEventListener('mouseenter', () => {
      limpiar();
      svg.classList.add('resaltando');
      svg.querySelectorAll(`[data-par="${e.getAttribute('data-par')}"]`).forEach(x => x.classList.add('activo'));
    });
    e.addEventListener('mouseleave', limpiar);
  });
}
