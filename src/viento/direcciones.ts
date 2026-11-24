/**
 * Túnel 3D, etapa 5 de la propuesta de resultados (docs/propuesta_resultados_3d): varias direcciones de viento.
 *
 *  · La rosa de vientos de una estación meteorológica dice, para cada rumbo de donde viene el viento (N, NE, …), qué
 *    parte del tiempo sopla y con qué velocidad media. Con el norte del proyecto, cada rumbo es un giro del túnel.
 *  · Vereda: en cada corrida se promedia la velocidad del aire a la altura de evaluación y se pasa a la planta del
 *    proyecto (todas las corridas en la misma grilla). En cada punto, la probabilidad de superar un umbral suma la de
 *    cada rumbo: P(u > u_c) = Σ p_d · exp(−(u_c / (f_d · c_d))²), con f_d el factor del lugar (la velocidad ahí sobre la
 *    del campo abierto a esa altura) y c_d la escala de Rayleigh del viento de ese rumbo llevado a esa altura.
 *  · Fachada: la envolvente (el peor empuje y la peor succión de todas las direcciones) en las celdas de la primera
 *    corrida, buscando en cada corrida la celda de fachada más cercana en la planta del proyecto y a la misma altura.
 */
import { aPlantaProyecto, type Geometria3D, type P, type celdasDeCara } from './geometria3d';
import { Kz, type Exposicion } from '../engine/cargas/cirsoc102';

// ------------------------------------------------------------------------------------------------ rosa de vientos
export const RUMBOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;
export type Rumbo = (typeof RUMBOS)[number];
export interface SectorRosa { rumbo: Rumbo; frecuencia: number; media: number }
/** una rosa pareja: cada rumbo el 12,5 % del tiempo, con la misma velocidad media */
export const rosaPareja = (media: number): SectorRosa[] => RUMBOS.map(r => ({ rumbo: r, frecuencia: 12.5, media }));
/** el rumbo de donde viene el viento, en grados desde el norte (horario) */
export const gradosRumbo = (r: Rumbo) => RUMBOS.indexOf(r) * 45;
/**
 * El giro del túnel para un viento que viene del rumbo ψ, si el eje +y del proyecto apunta al rumbo β (grados desde el
 * norte, horario). El túnel sopla siempre hacia +x de la red; el viento A sopla hacia +y del proyecto y el B hacia +x,
 * y el giro extra a corre el viento a, en sentido antihorario, en la planta (ver geometria3D).
 */
export function giroParaRumbo(psi: number, beta: number, dir: 'A' | 'B'): number {
  const haciaPlanta = 90 - (psi + 180 - beta);              // ángulo antihorario desde +x del proyecto hacia donde sopla
  const base = dir === 'A' ? 90 : 0;
  return ((((haciaPlanta - base) % 360) + 360) % 360);
}

// ------------------------------------------------------------------------------------------------ velocidad media en un plano
/** promedio en el tiempo de la velocidad del aire (y su desvío) en el plano z de la red */
export class MediaPlano {
  readonly suma: Float64Array; readonly suma2: Float64Array; muestras = 0;
  constructor(readonly g: Geometria3D, readonly z: number) { this.suma = new Float64Array(g.nx * g.ny); this.suma2 = new Float64Array(g.nx * g.ny); }
  sumar(campo: ArrayLike<number>) {
    const { nx, ny } = this.g, o = this.z * nx * ny;
    for (let k = 0; k < nx * ny; k++) { const c = 4 * (o + k), v = Math.hypot(campo[c], campo[c + 1], campo[c + 2]); this.suma[k] += v; this.suma2[k] += v * v; }
    this.muestras++;
  }
  media(k: number) { return this.muestras ? this.suma[k] / this.muestras : NaN; }
  sigma(k: number) { if (!this.muestras) return NaN; const m = this.suma[k] / this.muestras; return Math.sqrt(Math.max(0, this.suma2[k] / this.muestras - m * m)); }
}

/** una grilla en la planta del proyecto (m): origen, paso y tamaño */
export interface GrillaPlanta { x0: number; y0: number; paso: number; nx: number; ny: number }
/** la grilla de la vereda: la torre en el medio y dos veces su lado mayor alrededor */
export function grillaAlrededor(pol: P[], paso = 1.5): GrillaPlanta {
  const xs = pol.map(q => q.x), ys = pol.map(q => q.y), D = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const x0 = Math.min(...xs) - 2 * D, y0 = Math.min(...ys) - 2 * D, x1 = Math.max(...xs) + 2 * D, y1 = Math.max(...ys) + 2 * D;
  return { x0, y0, paso, nx: Math.ceil((x1 - x0) / paso), ny: Math.ceil((y1 - y0) / paso) };
}
/**
 * El factor del lugar (velocidad media / la del campo abierto a esa altura) y el de la ráfaga (GEM: la mayor entre la media y
 * (media + 3 desvíos) / 1,85) en cada
 * punto de la grilla; NaN donde cae adentro de un edificio o afuera del túnel.
 */
export function veredaEnPlanta(g: Geometria3D, m: MediaPlano, uRef: number, gr: GrillaPlanta): { f: Float32Array; fRafaga: Float32Array } {
  const f = new Float32Array(gr.nx * gr.ny).fill(NaN), fr = new Float32Array(gr.nx * gr.ny).fill(NaN);
  const { co, si, ox, oy } = g.giro;
  for (let j = 0; j < gr.ny; j++) for (let i = 0; i < gr.nx; i++) {
    const px = gr.x0 + (i + 0.5) * gr.paso, py = gr.y0 + (j + 0.5) * gr.paso;
    const x = Math.floor(ox + (px * co - py * si) * g.escala), y = Math.floor(oy + (px * si + py * co) * g.escala);
    if (x < 2 || x >= g.nx - 2 || y < 0 || y >= g.ny) continue;
    const k = y * g.nx + x, cel = m.z * g.nx * g.ny + k;
    if (g.solido[cel]) continue;
    const me = m.media(k), sg = m.sigma(k);
    // Lawson compara la seguridad con la «media equivalente a la ráfaga» (GEM): la mayor entre la media y la ráfaga / 1,85
    f[j * gr.nx + i] = me / uRef; fr[j * gr.nx + i] = Math.max(me, (me + 3 * sg) / 1.85) / uRef;
  }
  return { f, fRafaga: fr };
}

// ------------------------------------------------------------------------------------------------ criterios de confort
export interface Criterio { nombre: string; umbrales: { codigo: string; hasta: number; texto: string }[]; excedencia: number; seguridad: { u: number; excedencia: number } }
/** Lawson LDDC (5 % del tiempo) y Lawson 2001 (5 %); la ráfaga peligrosa: 15 m/s más del 0,022 % del tiempo (LDDC) */
export const CRITERIOS: Record<'lddc' | 'lawson2001', Criterio> = {
  lddc: { nombre: 'Lawson LDDC', excedencia: 0.05, seguridad: { u: 15, excedencia: 0.00022 },
    umbrales: [{ codigo: 'A', hasta: 2.5, texto: 'sentarse seguido' }, { codigo: 'B', hasta: 4, texto: 'sentarse un rato' }, { codigo: 'C', hasta: 6, texto: 'estar parado' }, { codigo: 'D', hasta: 8, texto: 'caminar' }, { codigo: 'E', hasta: Infinity, texto: 'incómodo' }] },
  lawson2001: { nombre: 'Lawson 2001', excedencia: 0.05, seguridad: { u: 15, excedencia: 0.00022 },
    umbrales: [{ codigo: 'A', hasta: 4, texto: 'sentarse' }, { codigo: 'B', hasta: 6, texto: 'estar parado' }, { codigo: 'C', hasta: 8, texto: 'pasear' }, { codigo: 'D', hasta: 10, texto: 'caminar apurado' }, { codigo: 'E', hasta: Infinity, texto: 'incómodo' }] },
};
/** el viento del campo abierto a la altura z (m) sobre el de 10 m, con el perfil del CIRSOC 102-25 (Kz constante debajo de 5 m) */
export const factorAltura = (exp: Exposicion, z: number) => Math.sqrt(Kz(z, exp) / Kz(10, exp));
/**
 * Probabilidad de que el viento en el lugar supere u_c (m/s), sumando los rumbos: cada uno con su parte del tiempo y una
 * distribución de Rayleigh con su velocidad media (a 10 m) llevada a la altura de evaluación.
 * @param fs el factor del lugar con el viento de cada rumbo (NaN: sin dato)
 */
export function probabilidadExcede(fs: number[], sectores: SectorRosa[], uc: number, fAltura: number): number {
  let p = 0, tot = 0;
  sectores.forEach((s, d) => {
    tot += s.frecuencia;
    const f = fs[d];
    if (!(f > 0) || !(s.media > 0)) return;
    const c = (s.media / 0.886227) * fAltura * f;            // escala de Rayleigh: media / Γ(1,5)
    p += s.frecuencia * Math.exp(-((uc / c) ** 2));
  });
  return tot > 0 ? p / tot : NaN;
}
/** la categoría (el primer umbral que no se supera más del tiempo permitido) y si es peligroso */
export function categoriaRosa(fs: number[], fRaf: number[], sectores: SectorRosa[], fAltura: number, cr: Criterio): { codigo: string; peligro: boolean } {
  const u = cr.umbrales.find(x => !isFinite(x.hasta) || probabilidadExcede(fs, sectores, x.hasta, fAltura) <= cr.excedencia) ?? cr.umbrales[cr.umbrales.length - 1];
  const peligro = probabilidadExcede(fRaf, sectores, cr.seguridad.u, fAltura) > cr.seguridad.excedencia;
  return { codigo: u.codigo, peligro };
}

// ------------------------------------------------------------------------------------------------ envolvente de fachada
export interface PuntoFachada { x: number; y: number; z: number }
/** dónde está cada celda de fachada en la planta del proyecto (la pared, a media celda del aire) y a qué altura (m) */
export function puntosFachada(g: Geometria3D, caras: ReturnType<typeof celdasDeCara>): PuntoFachada[] {
  return caras.map(c => { const p = aPlantaProyecto(g, c.x + 0.5 - 0.5 * c.nx, c.y + 0.5 - 0.5 * c.ny); return { x: p.x, y: p.y, z: (c.z - 0.5) / g.escala }; });
}
/**
 * El peor empuje y la peor succión (Cp pico) de todas las direcciones en las celdas de referencia (las de la primera
 * corrida), con el giro que lo dio.
 */
export class Envolvente {
  readonly mas: Float64Array; readonly menos: Float64Array; readonly giroMas: Float64Array; readonly giroMenos: Float64Array;
  direcciones = 0;
  constructor(readonly ref: PuntoFachada[]) {
    const n = ref.length;
    this.mas = new Float64Array(n).fill(-Infinity); this.menos = new Float64Array(n).fill(Infinity);
    this.giroMas = new Float64Array(n).fill(NaN); this.giroMenos = new Float64Array(n).fill(NaN);
  }
  /**
   * suma una dirección: para cada celda de referencia, la celda de esta corrida más cercana (a menos de «tol» m en planta
   * y en la misma fila de altura) da su pico
   */
  sumar(pts: PuntoFachada[], picoMas: (k: number) => number, picoMenos: (k: number) => number, giro: number, tol: number) {
    // índice por casillas de la planta
    const casilla = (x: number, y: number) => `${Math.floor(x / tol)},${Math.floor(y / tol)}`, idx = new Map<string, number[]>();
    pts.forEach((p, k) => { const c = casilla(p.x, p.y); const l = idx.get(c); if (l) l.push(k); else idx.set(c, [k]); });
    this.ref.forEach((r, i) => {
      const cx = Math.floor(r.x / tol), cy = Math.floor(r.y / tol);
      let mejor = -1, dMin = Infinity;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const k of idx.get(`${cx + a},${cy + b}`) ?? []) {
        const p = pts[k];
        if (Math.abs(p.z - r.z) > tol / 2) continue;
        const d = Math.hypot(p.x - r.x, p.y - r.y);
        if (d < dMin && d <= tol) { dMin = d; mejor = k; }
      }
      if (mejor < 0) return;
      const ma = picoMas(mejor), me = picoMenos(mejor);
      if (ma > this.mas[i]) { this.mas[i] = ma; this.giroMas[i] = giro; }
      if (me < this.menos[i]) { this.menos[i] = me; this.giroMenos[i] = giro; }
    });
    this.direcciones++;
  }
}
