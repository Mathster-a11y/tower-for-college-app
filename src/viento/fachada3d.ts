/**
 * Túnel 3D, etapa 2 de la propuesta de resultados (docs/propuesta_resultados_3d): presiones de fachada.
 *
 * Con el Cp de cada celda en el tiempo (medio, desvío, mínimo, máximo; ver PromedioCp) se estima el pico de diseño con
 * un factor de pico (la simulación es corta para «ver» la ráfaga de 50 años): Cp pico = Cp medio ± g · desvío. La presión
 * neta sobre el revestimiento suma la presión interior del reglamento (edificio cerrado: ±0,18): el peor empuje es
 * qh · (Cp pico+ + GCpi) y la peor succión qh · (Cp pico− − GCpi).
 *
 * La fachada se «despliega»: las cuatro caras una al lado de la otra, recorriendo la planta en sentido antihorario desde
 * barlovento (barlovento, costado, sotavento, el otro costado), cada celda con su distancia a la esquina más cercana para
 * separar la zona de esquina (zona 5 del CIRSOC, ancho a) del centro de la cara (zona 4).
 */
import type { celdasDeCara, Geometria3D, PromedioCp } from './geometria3d';

export type Estadistica = 'media' | 'rms' | 'picoMas' | 'picoMenos';
export const NOMBRE_ESTADISTICA: Record<Estadistica, string> = { media: 'Cp medio', rms: 'desvío (cuánto tiembla)', picoMas: 'pico de empuje', picoMenos: 'pico de succión' };
/** factor de pico: cuántos desvíos por encima o debajo de la media llega una ráfaga de diseño */
export const G_PICO = 3.5;
/** presión interior de un edificio cerrado (CIRSOC 102: GCpi = ±0,18) */
export const GCPI_CERRADO = 0.18;

export function valorCelda(p: PromedioCp, k: number, est: Estadistica, g = G_PICO): number {
  switch (est) {
    case 'media': return p.cp(k);
    case 'rms': return p.rms(k);
    case 'picoMas': return p.cp(k) + g * p.rms(k);
    case 'picoMenos': return p.cp(k) - g * p.rms(k);
  }
}

// ------------------------------------------------------------------------------------------------ componentes y revestimientos
/**
 * GCp de paredes para componentes y revestimientos de edificios de más de 18 m (CIRSOC 102, figura de componentes y
 * revestimientos para h > 18 m; la misma del ASCE 7): zona 4 (centro de la cara) y zona 5 (esquinas, ancho a). Bajan con
 * el área de influencia del elemento (un vidrio chico recibe picos más fuertes que un paño grande), lineal en log(A)
 * entre 1,86 m² y 46,5 m².
 */
const GCP_PARED = { 4: { mas: [0.9, 0.6], menos: [-0.9, -0.7] }, 5: { mas: [0.9, 0.6], menos: [-1.8, -1.0] } } as const;
export function gcpComponentes(zona: 4 | 5, area: number): { mas: number; menos: number } {
  const t = Math.max(0, Math.min(1, (Math.log10(Math.max(area, 1e-6)) - Math.log10(1.86)) / (Math.log10(46.5) - Math.log10(1.86))));
  const z = GCP_PARED[zona], i = (v: readonly [number, number]) => v[0] + (v[1] - v[0]) * t;
  return { mas: i(z.mas), menos: i(z.menos) };
}
/** ancho de la zona de esquina: el 10 % de la menor dimensión en planta, no menos de 0,9 m */
export const anchoZonaEsquina = (menorDimension: number) => Math.max(0.1 * menorDimension, 0.9);

// ------------------------------------------------------------------------------------------------ fachada desplegada
export interface CeldaDesplegada { k: number; s: number; z: number; dEsquina: number }
export interface Panel { nombre: string; s0: number; ancho: number; celdas: CeldaDesplegada[] }
export interface Desplegada { paneles: Panel[]; alto: number; ancho: number; escala: number }

/**
 * Despliega las caras verticales de la torre: cada celda de cara con normal horizontal va al panel de su normal, en la
 * columna s (en celdas, a lo largo de la cara, en sentido antihorario mirando desde arriba) y la fila z. Los paneles van
 * uno al lado del otro con un hueco de 2 celdas. La cubierta no entra (es horizontal).
 */
export function desplegar(caras: ReturnType<typeof celdasDeCara>, g: Geometria3D): Desplegada {
  // normal (hacia el aire) → tangente antihoraria (la normal girada +90°) y nombre
  const lados: { nx: number; ny: number; nombre: string }[] = [
    { nx: -1, ny: 0, nombre: 'Barlovento' }, { nx: 0, ny: -1, nombre: 'Costado' }, { nx: 1, ny: 0, nombre: 'Sotavento' }, { nx: 0, ny: 1, nombre: 'Otro costado' }];
  const paneles: Panel[] = [];
  let s0 = 0, alto = 0;
  for (const l of lados) {
    const tx = -l.ny, ty = l.nx;                               // tangente antihoraria
    const sel = caras.map((c, k) => ({ c, k })).filter(({ c }) => c.nx === l.nx && c.ny === l.ny && c.nz === 0);
    if (!sel.length) continue;
    const ss = sel.map(({ c }) => c.x * tx + c.y * ty), smin = Math.min(...ss), smax = Math.max(...ss);
    const celdas = sel.map(({ c, k }, i) => {
      const s = ss[i] - smin;
      return { k, s, z: c.z - 1, dEsquina: (Math.min(s, smax - smin - s) + 0.5) / g.escala };
    });
    alto = Math.max(alto, ...celdas.map(q => q.z + 1));
    const ancho = smax - smin + 1;
    paneles.push({ nombre: l.nombre, s0, ancho, celdas });
    s0 += ancho + 2;
  }
  return { paneles, alto, ancho: Math.max(0, s0 - 2), escala: g.escala };
}

// ------------------------------------------------------------------------------------------------ zonas
export interface FilaZona {
  zona: 4 | 5; nombre: string;
  /** el peor Cp pico de la simulación en la zona (empuje > 0 y succión < 0) */
  cpMas: number; cpMenos: number;
  /** presión neta de diseño (kN/m²), con la presión interior: simulación y CIRSOC */
  pMas: number; pMenos: number; pMasRegl: number; pMenosRegl: number;
}
/**
 * El peor valor de cada zona de las caras verticales, contra el de componentes y revestimientos del CIRSOC.
 * @param qh presión dinámica a la altura de la torre (N/m²); area: área de influencia del elemento (m²)
 */
export function zonasFachada(p: PromedioCp, d: Desplegada, a: number, qh: number, area: number, g = G_PICO): FilaZona[] {
  return zonasDe(k => valorCelda(p, k, 'picoMas', g), k => valorCelda(p, k, 'picoMenos', g), d, a, qh, area);
}
/** lo mismo con el pico de cada celda dado (por ejemplo, la envolvente de varias direcciones) */
export function zonasDe(mas: (k: number) => number, menos: (k: number) => number, d: Desplegada, a: number, qh: number, area: number): FilaZona[] {
  // la franja de esquina tiene por lo menos una celda de ancho: con una grilla gruesa (el procesador) la celda mide más
  // que la franja del reglamento y la zona 5 quedaba vacía («—» en la tabla)
  const dMin = Math.min(...d.paneles.flatMap(pn => pn.celdas.map(q => q.dEsquina)));
  const aEf = Math.max(a, isFinite(dMin) ? dMin + 1e-9 : a);
  return ([4, 5] as const).map(zona => {
    let cpMas = -Infinity, cpMenos = Infinity;
    for (const pn of d.paneles) for (const q of pn.celdas) {
      if ((q.dEsquina < aEf) !== (zona === 5)) continue;
      const ma = mas(q.k), me = menos(q.k);
      if (isFinite(ma)) cpMas = Math.max(cpMas, ma);
      if (isFinite(me)) cpMenos = Math.min(cpMenos, me);
    }
    const gc = gcpComponentes(zona, area), kN = qh / 1000;
    return { zona, nombre: zona === 4 ? 'Centro de las caras (zona 4)' : 'Esquinas (zona 5)', cpMas, cpMenos,
      pMas: kN * (cpMas + GCPI_CERRADO), pMenos: kN * (cpMenos - GCPI_CERRADO), pMasRegl: kN * (gc.mas + GCPI_CERRADO), pMenosRegl: kN * (gc.menos - GCPI_CERRADO) };
  });
}

/** valores redondos para las bandas de un mapa (8 a 10 escalones) */
export function bandas(min: number, max: number, n = 9): number[] {
  const span = Math.max(1e-9, max - min), paso0 = span / n, e = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map(f => f * e).find(x => x >= paso0) ?? 10 * e;
  const out: number[] = [];
  for (let v = Math.floor(min / paso) * paso; v <= max + 1e-9; v += paso) out.push(+v.toFixed(10));
  return out;
}
