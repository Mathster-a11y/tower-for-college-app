/**
 * Operaciones entre polígonos (unión, diferencia, intersección) con la biblioteca polygon-clipping, a prueba de sus
 * fallas: con bordes casi alineados a veces no puede cerrar un anillo y tira un error. Entonces se reintenta con las
 * coordenadas redondeadas (al décimo de milímetro y, si hace falta, al milímetro); si igual falla, devuelve null y el
 * que llama sigue sin esa operación (nunca rompe el dibujo ni el cálculo).
 */
import polygonClipping from 'polygon-clipping';

type Anillo = [number, number][];
/** un polígono (anillos) o varios (polígonos) */
type Geom = Anillo[] | Anillo[][];
type Multi = Anillo[][];
const redondear = (g: unknown, k: number): unknown => (Array.isArray(g) && typeof g[0] === 'number' ? [Math.round((g[0] as number) * k) / k, Math.round((g[1] as number) * k) / k] : Array.isArray(g) ? g.map(x => redondear(x, k)) : g);

function seguro(op: 'union' | 'difference' | 'intersection', a: Geom, b: Geom[]): Multi | null {
  for (const k of [0, 1e4, 1e3]) {
    try {
      const A = k ? redondear(a, k) : a, B = k ? b.map(x => redondear(x, k)) : b;
      return polygonClipping[op](A as never, ...(B as never[])) as unknown as Multi;
    } catch { /* reintento con las coordenadas redondeadas */ }
  }
  return null;
}
export const union = (a: Geom, ...b: Geom[]) => seguro('union', a, b);
export const diferencia = (a: Geom, ...b: Geom[]) => seguro('difference', a, b);
export const interseccion = (a: Geom, ...b: Geom[]) => seguro('intersection', a, b);
