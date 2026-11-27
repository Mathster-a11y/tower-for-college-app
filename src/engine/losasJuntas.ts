/**
 * Las losas de los pisos que junta un nivel. El cálculo tiene lugar para 49 niveles sobre PB (la tabla de la planilla),
 * así que una torre más alta junta pisos en un nivel («pisos: n»): el 11º–12º del Citicorp, los pisos de su corona, los
 * niveles del Hancock. Esas losas existen: el 3D las dibuja y el exo las carga.
 *
 * Van repartidas en el tramo del nivel (del nivel de abajo a su cota) cuando el tramo mide esos pisos a la altura de piso
 * de la torre (la mediana, ±25 %). Si no (un cajón alto con «pisos: 2», como el 8º–9º del Citicorp sobre la plaza, cuyas
 * losas no están repartidas en el tramo), no se arman. Cada una toma la planta del nivel de abajo y, en un tramo de
 * carpintería «Envolvente», la recortan los planos de la envolvente: la losa queda dentro de la piel (la corona a 45°).
 */
import type { Proyecto } from './modelo';
import type { ExoDef } from './exo';
import { tramoEn } from './carpinteria';
import { recortarConPlanosEnvolvente } from './envolvente';
import { cajaSilueta, plantaDeNivel, type Vertice } from './silueta';

export interface LosaJunta { /** índice del nivel que la junta */ i: number; z: number; v: Vertice[] }

export function losasJuntas(p: Proyecto): LosaJunta[] {
  const porCota = p.niveles.map((n, i) => ({ n, i })).sort((a, b) => a.n.cota - b.n.cota);
  const alturas = porCota.map((x, k) => (k > 0 && x.n.cota > 0 ? (x.n.cota - porCota[k - 1].n.cota) / Math.max(1, x.n.pisos ?? 1) : NaN)).filter(v => v > 0.5);
  const hPiso = alturas.length ? [...alturas].sort((a, b) => a - b)[Math.floor(alturas.length / 2)] : 0;
  const out: LosaJunta[] = [];
  porCota.forEach((x, k) => {
    const np = Math.round(x.n.pisos ?? 1), abajo = porCota[k - 1];
    if (np < 2 || x.n.sinLosa || !abajo || x.n.cota <= 0 || !(hPiso > 0)) return;
    const h = (x.n.cota - abajo.n.cota) / np;
    if (Math.abs(h - hPiso) > 0.25 * hPiso) return;
    const base = plantaDeNivel(p, abajo.i).silueta;
    for (let j = np - 1; j >= 1; j--) {
      const z = x.n.cota - j * h;
      const v = tramoEn(p, z)?.modo === 'continua' ? recortarConPlanosEnvolvente(p, z, base) : base.map(q => ({ ...q }));
      if (v && v.length >= 3) out.push({ i: x.i, z, v });
    }
  });
  return out;
}

/**
 * El exo con las losas que juntan los niveles, para el viento dir: el ancho de cada una en las caras de ese viento (a) y
 * en las perpendiculares (ap), con la separación del exo. Si no hay losas juntas (o las losas no apoyan en el exo), el
 * mismo exo.
 */
export function exoConLosasJuntas(p: Proyecto, def: ExoDef, dir: 'A' | 'B'): ExoDef {
  if (!def.losas) return def;
  const js = losasJuntas(p);
  if (!js.length) return def;
  const A = dir === 'A', s2 = 2 * def.separacion;
  const extra = js.map(j => { const c = cajaSilueta(j.v); return { z: j.z, a: (A ? c.L : c.B) + s2, ap: (A ? c.B : c.L) + s2 }; });
  return { ...def, losas: { ...def.losas, extra } };
}
