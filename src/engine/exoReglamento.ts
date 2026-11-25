/**
 * El exoesqueleto dentro de los métodos CIRSOC y FEM: con el viento de resistencia del 102-25, la torre de tabiques +
 * exo se resuelve como en la etapa 08 (ui/exo.ts, datosExo) y de ahí salen
 *  - la parte del momento y del corte en la base que les queda a los tabiques (para su verificación con el 201);
 *  - el corrimiento de cada piso de la torre con el exo (para la deriva de servicio).
 * Los métodos de la cátedra (Planilla y Guía) no lo usan: ahí el exo es un estudio aparte.
 */
import type { Proyecto } from './modelo';
import type { PlanillaRes } from './planilla';
import type { PiezaEquivalente } from './mapping';
import type { Viento102 } from './cargas/cirsoc102';
import { datosAltura, moduloHormigon, rigidezPorNivel } from './diagramas';
import { plantaDeNivel } from './silueta';
import { calcularExo, type ResultadoExo } from './exo';

export interface ExoDireccion {
  r: ResultadoExo;
  /** cotas de los pisos desde PB (m) y altura de la torre sobre PB */
  z: number[]; h: number;
  /** parte del momento y del corte en la base que les queda a los tabiques (1 = sin exo) */
  fM: number; fV: number;
}

export function exoConViento(p: Proyecto, valores: PlanillaRes, piezas: PiezaEquivalente[], filaNivel: number[], w: Viento102,
  SJ: Record<'A' | 'B', number>): Record<'A' | 'B', ExoDireccion> | null {
  const def = p.exo;
  if (!def) return null;
  const iPB = p.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1);
  const zPB = p.niveles[iPB]?.cota ?? 0;
  const E = moduloHormigon(p.hormigon || 'H30');
  const pl = plantaDeNivel(p, iPB);
  const nivEn = (z: number) => p.niveles.find(nv => Math.abs(nv.cota - z) < 1e-6);
  const uno = (dir: 'A' | 'B'): ExoDireccion | null => {
    const alt = datosAltura(p, valores.viento, valores.mnyq, filaNivel, dir);
    const sobre = alt.filter(x => x.z > zPB + 1e-6).sort((a, b) => a.z - b.z);
    if (sobre.length < 2) return null;
    const zs = [zPB, ...sobre.map(x => x.z)];
    const W = sobre.map(x => w[dir].niveles.find(n => Math.abs(n.z - (x.z - zPB)) < 1e-6)?.W ?? 0);
    const Jniv = rigidezPorNivel(p, piezas, dir, SJ[dir]).sort((a, b) => a.z - b.z);
    const EJ = (z: number) => E * (Jniv.find(q => q.z >= z - 1e-6)?.J ?? SJ[dir]);
    const A = dir === 'A';
    const ancho = (A ? pl.L : pl.B) + 2 * def.separacion, t = def.tipo === 'F' ? Math.max(0.5, (def.nucleo ?? ancho / 3) / 2) : (A ? pl.B : pl.L) / 2 + def.separacion;
    let anchos: number[] | undefined, ts: number[] | undefined;
    if (def.anchoVariable) {
      const plz = zs.map(z => { const i = p.niveles.findIndex(nv => Math.abs(nv.cota - z) < 1e-6); return plantaDeNivel(p, i >= 0 ? i : iPB); });
      anchos = plz.map(q => (A ? q.L : q.B) + 2 * def.separacion);
      ts = plz.map(q => (A ? q.B : q.L) / 2 + def.separacion);
    }
    const c = zs.map(z => { const nv = nivEn(z); return (nv && (A ? nv.dy : nv.dx)) || 0; });
    const corr = c.some(x => Math.abs(x) > 1e-9) ? c : undefined;
    const anchosPerp = def.tipo === 'F' ? zs.map(() => (A ? pl.B : pl.L) + 2 * def.separacion) : ts?.map(x => 2 * x);
    const r = calcularExo(def, zs, W, EJ, ancho, [-t, t], E, anchos, corr, { anchosPerp });
    // la base de los tabiques: con interacción tabique-exo el corte puede repartirse distinto que el momento
    const fM = Math.abs(r.Msin[0]) > 1e-9 ? Math.abs(r.Mtab[0] / r.Msin[0]) : 1;
    const fV = Math.abs(r.Vsin[0]) > 1e-9 ? Math.abs(r.Vtab[0] / r.Vsin[0]) : 1;
    // los corrimientos van con las cotas del resultado (calcularExo puede agregar nudos, como el arranque del mástil)
    return { r, z: r.zs.map(z => z - zPB), h: r.zs[r.zs.length - 1] - zPB, fM, fV };
  };
  try {
    const a = uno('A'), b = uno('B');
    return a && b ? { A: a, B: b } : null;
  } catch { return null; }
}
