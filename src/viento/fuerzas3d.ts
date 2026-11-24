/**
 * Túnel 3D, etapa 1 de la propuesta de resultados (docs/propuesta_resultados_3d): las fuerzas del viento sobre la torre,
 * piso por piso y en la base, a lo largo del tiempo.
 *
 * Cada celda de aire pegada a la torre tiene su presión (la densidad de la red: p = (ρ − ρ_ref) / 3) y la normal de la
 * pared. Con el Cp de la celda, Cp = p / (½ u_H²), la presión real es Cp · q_h (la q del CIRSOC 102 a la altura de la
 * torre, la misma con la que se normaliza) y la fuerza sobre la pared es −Cp · q_h · G · ΔA · n (empuja hacia adentro
 * de la torre si la celda empuja, tira hacia afuera si succiona). G es el factor de ráfaga del reglamento: así la
 * simulación y el CIRSOC se comparan con la misma ráfaga y lo que cambia es solo la forma (los Cp).
 *
 * Ejes de la red: x es el sentido del viento (arrastre), y el costado (lateral), z la altura. Unidades: t, m, tm, s.
 */
import type { Geometria3D } from './geometria3d';
import type { celdasDeCara } from './geometria3d';

export interface NivelFuerza { nombre: string; z: number }
export interface Estad { media: number; sigma: number; min: number; max: number }
export interface FilaPiso { nombre: string; z: number; Fx: Estad; Fy: Estad; Mz: Estad }
export interface ResumenFuerzas {
  muestras: number; tiempo: number;
  pisos: FilaPiso[];
  /** en la base: arrastre Vx, lateral Vy, torsor Mz, vuelco por el arrastre Mx = Σ Fx·z y por el lateral My = Σ Fy·z */
  base: { Vx: Estad; Vy: Estad; Mz: Estad; Mx: Estad; My: Estad };
  /** en el instante del máximo de cada una, cuánto valen las otras dos (fracción de su propio máximo en valor absoluto) */
  simultaneidad: { conVx: { Vy: number; Mz: number }; conVy: { Vx: number; Mz: number }; conMz: { Vx: number; Vy: number } };
}
/** una muestra en el tiempo de las fuerzas de la base */
export interface MuestraBase { t: number; Vx: number; Vy: number; Mz: number; Mx: number; My: number }

const vacia = () => ({ s: 0, s2: 0, min: Infinity, max: -Infinity });
type Acum = ReturnType<typeof vacia>;
const sumarA = (a: Acum, v: number) => { a.s += v; a.s2 += v * v; if (v < a.min) a.min = v; if (v > a.max) a.max = v; };
const estad = (a: Acum, n: number): Estad => {
  if (!n) return { media: NaN, sigma: NaN, min: NaN, max: NaN };
  const m = a.s / n;
  return { media: m, sigma: Math.sqrt(Math.max(0, a.s2 / n - m * m)), min: a.min, max: a.max };
};

/** el factor de pico para estimar el pico de diseño con la media y el desvío (ráfagas gaussianas, ~1 hora) */
export const FACTOR_PICO = 3.5;
/** pico estimado en valor absoluto del lado de la media: |media| + g · σ */
export const picoEstimado = (e: Estad, g = FACTOR_PICO) => Math.abs(e.media) + g * e.sigma;

export class Fuerzas3D {
  readonly serie: MuestraBase[] = [];
  private readonly piso: Int32Array;
  private readonly px: Float64Array; private readonly py: Float64Array; private readonly pz: Float64Array;
  private readonly acPiso: { Fx: Acum; Fy: Acum; Mz: Acum }[];
  private readonly acBase = { Vx: vacia(), Vy: vacia(), Mz: vacia(), Mx: vacia(), My: vacia() };
  muestras = 0;
  /**
   * @param caras celdas de cara de la torre (con su normal hacia el aire)
   * @param niveles los niveles sobre PB (z en m sobre PB, sin PB), de abajo hacia arriba: cada uno toma la fachada
   *   desde la mitad del piso de abajo hasta la mitad del de arriba (el primero desde PB, el último hasta la azotea)
   * @param uH velocidad de la red a la altura de la torre (con la que se normaliza el Cp)
   * @param qhG q_h · G en t/m²
   */
  constructor(readonly caras: ReturnType<typeof celdasDeCara>, readonly g: Geometria3D, readonly niveles: NivelFuerza[], readonly uH: number, readonly qhG: number) {
    const n = caras.length, e = g.escala;
    this.piso = new Int32Array(n); this.px = new Float64Array(n); this.py = new Float64Array(n); this.pz = new Float64Array(n);
    const xc = (g.caja.x0 + g.caja.x1) / 2, yc = (g.caja.y0 + g.caja.y1) / 2;
    const bordes = niveles.map((nv, k) => (k + 1 < niveles.length ? (nv.z + niveles[k + 1].z) / 2 : Infinity));
    caras.forEach((c, k) => {
      // la pared está a media celda de la celda de aire, del lado contrario a la normal
      this.px[k] = (c.x - 0.5 * c.nx - xc) / e; this.py[k] = (c.y - 0.5 * c.ny - yc) / e; this.pz[k] = (c.z - 0.5 - 0.5 * c.nz) / e;
      const i = bordes.findIndex(b => this.pz[k] <= b + 1e-9);
      this.piso[k] = i < 0 ? niveles.length - 1 : i;
    });
    this.acPiso = niveles.map(() => ({ Fx: vacia(), Fy: vacia(), Mz: vacia() }));
  }
  /** suma una muestra del campo (ρ en el lugar «desplaz» de cada grupo de «paso» valores) en el tiempo t (s) */
  sumar(campo: ArrayLike<number>, rhoRef: number, t: number, paso = 4, desplaz = 3) {
    const nP = this.niveles.length, Fx = new Float64Array(nP), Fy = new Float64Array(nP), Mz = new Float64Array(nP);
    const A = 1 / (this.g.escala * this.g.escala), k0 = this.qhG * A / (3 * 0.5 * this.uH * this.uH);
    let Mx = 0, My = 0;
    this.caras.forEach((c, k) => {
      // fuerza sobre la torre: −p · n (la normal mira al aire)
      const p = (campo[c.celda * paso + desplaz] - rhoRef) * k0, fx = -p * c.nx, fy = -p * c.ny, i = this.piso[k];
      Fx[i] += fx; Fy[i] += fy; Mz[i] += this.px[k] * fy - this.py[k] * fx;
      Mx += fx * this.pz[k]; My += fy * this.pz[k];
    });
    let Vx = 0, Vy = 0, Mzb = 0;
    for (let i = 0; i < nP; i++) { sumarA(this.acPiso[i].Fx, Fx[i]); sumarA(this.acPiso[i].Fy, Fy[i]); sumarA(this.acPiso[i].Mz, Mz[i]); Vx += Fx[i]; Vy += Fy[i]; Mzb += Mz[i]; }
    const b = this.acBase;
    sumarA(b.Vx, Vx); sumarA(b.Vy, Vy); sumarA(b.Mz, Mzb); sumarA(b.Mx, Mx); sumarA(b.My, My);
    this.serie.push({ t, Vx, Vy, Mz: Mzb, Mx, My });
    this.muestras++;
  }
  resumen(): ResumenFuerzas {
    const n = this.muestras, b = this.acBase, s = this.serie;
    const enMax = (k: 'Vx' | 'Vy' | 'Mz') => s.reduce<MuestraBase | null>((m, x) => (!m || Math.abs(x[k]) > Math.abs(m[k]) ? x : m), null);
    const maxAbs = (k: 'Vx' | 'Vy' | 'Mz') => Math.max(1e-12, ...s.map(x => Math.abs(x[k])));
    const frac = (m: MuestraBase | null, k: 'Vx' | 'Vy' | 'Mz') => (m ? Math.abs(m[k]) / maxAbs(k) : NaN);
    const mx = enMax('Vx'), my = enMax('Vy'), mz = enMax('Mz');
    return {
      muestras: n, tiempo: s.length ? s[s.length - 1].t - s[0].t : 0,
      pisos: this.niveles.map((nv, i) => ({ nombre: nv.nombre, z: nv.z, Fx: estad(this.acPiso[i].Fx, n), Fy: estad(this.acPiso[i].Fy, n), Mz: estad(this.acPiso[i].Mz, n) })),
      base: { Vx: estad(b.Vx, n), Vy: estad(b.Vy, n), Mz: estad(b.Mz, n), Mx: estad(b.Mx, n), My: estad(b.My, n) },
      simultaneidad: { conVx: { Vy: frac(mx, 'Vy'), Mz: frac(mx, 'Mz') }, conVy: { Vx: frac(my, 'Vx'), Mz: frac(my, 'Mz') }, conMz: { Vx: frac(mz, 'Vx'), Vy: frac(mz, 'Vy') } },
    };
  }
}

/** segundos reales que dura un paso de la red: la celda mide 1/escala m y u_H de la red equivale a V_H m/s */
export const segundosPorPaso = (g: Geometria3D, uH: number, VH: number) => (VH > 0 ? uH / (g.escala * VH) : NaN);

