/**
 * Banda de pisos del túnel 3D (ver geometria3d, OpcionesGeo3.banda): lo que se mide en una franja de la torre, con el
 * viento parejo de esa altura. Con la presión de cada celda de cara (p = (ρ − ρref)/3, celda de área 1):
 *  - fuerza sobre la torre F = −Σ p·n (n: la normal de la cara, hacia afuera de la torre);
 *  - coeficientes de arrastre y lateral Cd = Fx / (½ U² · B · hb) y Cl = Fy / (½ U² · B · hb), por unidad de alto;
 *  - el número de Strouhal St = f·B / U con la frecuencia del pico del espectro de Cl (la del desprendimiento);
 *  - el Cp medio de cada cara.
 * Todo en unidades de la red (B y hb en celdas, U la velocidad de entrada).
 */
import type { Cara, Geometria3D, celdasDeCara } from './geometria3d';
import { espectro, frecuenciaPico, remuestrear } from './dinamica3d';

type CeldasCara = ReturnType<typeof celdasDeCara>;
export interface ResultadoBanda {
  muestras: number;
  Cd: number; Cl: number; clRms: number; cdRms: number;
  /** número de Strouhal (NaN si todavía no hay serie suficiente) */
  St: number;
  /** Cp medio de cada cara (null si no hay celdas) */
  cp: Record<Cara, number | null>;
}

export class MedicionBanda {
  readonly cd: number[] = []; readonly cl: number[] = []; readonly t: number[] = [];
  private readonly ref: number; private readonly Bc: number; private readonly hb: number;
  private readonly cpSuma: Record<Cara, number> = { barlovento: 0, sotavento: 0, lateral: 0, cubierta: 0 };
  private readonly cpN: Record<Cara, number> = { barlovento: 0, sotavento: 0, lateral: 0, cubierta: 0 };
  constructor(readonly caras: CeldasCara, geo: Geometria3D, readonly U: number, celdaRef: number) {
    this.ref = celdaRef; this.Bc = geo.B * geo.escala; this.hb = geo.nz;
    caras.forEach(c => { this.cpN[c.cara]++; });
  }
  /** una muestra del campo (4 valores por celda: u, v, w, ρ) en el paso «paso» de la red */
  sumar(campo: Float32Array, paso: number) {
    const r0 = campo[this.ref * 4 + 3], q = 0.5 * this.U * this.U;
    let fx = 0, fy = 0;
    for (const c of this.caras) {
      const p = (campo[c.celda * 4 + 3] - r0) / 3;
      fx -= p * c.nx; fy -= p * c.ny;
      this.cpSuma[c.cara] += p / q;
    }
    const a = q * this.Bc * this.hb;
    this.cd.push(fx / a); this.cl.push(fy / a); this.t.push(paso);
  }
  resultado(): ResultadoBanda {
    const n = this.cd.length, media = (x: number[]) => x.reduce((s, v) => s + v, 0) / (x.length || 1);
    const rms = (x: number[]) => { const m = media(x); return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length || 1)); };
    let St = NaN;
    // la serie se remuestrea a pasos parejos (las lecturas del ciclo no caen siempre cada la misma cantidad de pasos)
    if (n >= 64) {
      const dt = (this.t[n - 1] - this.t[0]) / (n - 1), e = espectro(remuestrear(this.t, this.cl, dt), dt);
      // St entre 0,05 y 0,3 (prismas y torres: 0,1 a 0,15): f = St·U/B en ciclos por paso
      if (e) St = (frecuenciaPico(e, (0.05 * this.U) / this.Bc, (0.3 * this.U) / this.Bc) * this.Bc) / this.U;
    }
    const cp = {} as Record<Cara, number | null>;
    (['barlovento', 'sotavento', 'lateral', 'cubierta'] as Cara[]).forEach(k => { cp[k] = this.cpN[k] && n ? this.cpSuma[k] / (this.cpN[k] * n) : null; });
    return { muestras: n, Cd: media(this.cd), Cl: media(this.cl), clRms: rms(this.cl), cdRms: rms(this.cd), St, cp };
  }
}
