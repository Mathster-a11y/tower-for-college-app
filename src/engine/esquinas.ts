/**
 * Esquinas de la torre: redondeadas, en chaflán o sustraídas, en la losa y la carpintería de uno o de todos los
 * niveles de una vez. Cambian la forma que recibe el viento (presiones 3D y túneles); la planilla y el CIRSOC 102
 * siguen con B, L y los Cp de la norma.
 */
import type { Proyecto } from './modelo';
import { carpinteriaDeNivel, plantaDeNivel, type Vertice } from './silueta';
import { tratarEsquinas, type TipoEsquina } from './contorno';

export interface OpcionesEsquinas {
  tipo: TipoEsquina;
  /** radio, distancia del chaflán o lado de la sustracción sobre el primer lado (m) */
  a: number;
  /** lado de la sustracción sobre el segundo lado (m); si falta, igual a «a» */
  b?: number;
  que: 'losa' | 'carpinteria' | 'ambas';
  /** índices de los niveles (0 = el de más arriba) */
  niveles: number[];
}
export interface CambioEsquinas { i: number; que: 'losa' | 'carpinteria'; v: Vertice[] }

/**
 * Los contornos nuevos, sin tocar el proyecto. Un nivel sin contorno propio que hereda el mismo contorno que el nivel
 * de arriba (que también se trata) no recibe uno propio: lo sigue heredando, ya tratado.
 */
export function esquinasEnNiveles(p: Proyecto, o: OpcionesEsquinas): { cambios: CambioEsquinas[]; avisos: string[] } {
  const cambios: CambioEsquinas[] = [], avisos: string[] = [];
  const set = new Set(o.niveles);
  const orden = [...set].filter(i => i >= 0 && i < p.niveles.length).sort((x, y) => x - y);
  const cuales: ('losa' | 'carpinteria')[] = o.que === 'ambas' ? ['losa', 'carpinteria'] : [o.que];
  for (const que of cuales) {
    const efectivo = (i: number): Vertice[] | null => (que === 'losa' ? plantaDeNivel(p, i).silueta : carpinteriaDeNivel(p, i)?.v ?? null);
    const propio = (i: number) => { const n = p.niveles[i]; const v = que === 'losa' ? n.silueta : n.carpinteria; return !!(v && v.length >= 3); };
    let sinCarp = 0;
    for (const i of orden) {
      const v = efectivo(i);
      if (!v) { sinCarp++; continue; }
      // hereda lo mismo que el de arriba, que también se trata: no hace falta un contorno propio
      if (!propio(i) && set.has(i - 1) && JSON.stringify(efectivo(i - 1)) === JSON.stringify(v)) continue;
      const r = tratarEsquinas(v, o.tipo, o.a, o.b ?? o.a);
      if ('error' in r) { avisos.push(`${que === 'losa' ? 'Losa' : 'Carpintería'} de ${p.niveles[i].nombre}: ${r.error}`); continue; }
      cambios.push({ i, que, v: r.map(q => ({ x: q.x, y: q.y, ...(q.b ? { b: q.b } : {}) })) });
    }
    if (que === 'carpinteria' && sinCarp && !(o.que === 'ambas' && sinCarp === orden.length)) avisos.push(`${sinCarp === orden.length ? 'Ningún nivel elegido tiene' : `${sinCarp} de los niveles elegidos no tienen`} carpintería dibujada: ahí el viento usa la losa.`);
  }
  return { cambios, avisos };
}

/**
 * Referencia para el arrastre de una sección cuadrada con esquinas redondeadas: el factor ψr del Eurocódigo
 * (EN 1991-1-4, fig. 7.24), ψr = 1 − 2,5·r/b, nunca menos de 0,5. Solo informativo: el CIRSOC 102 no lo tiene.
 */
export const psiRedondeo = (r: number, b: number) => (b > 0 ? Math.max(0.5, Math.min(1, 1 - (2.5 * r) / b)) : 1);
