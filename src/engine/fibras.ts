/**
 * Fibras de los tabiques en altura: la misma cuenta de la flexocompresión de PB (σ = −N/F ± M/W), hecha en la base de
 * cada piso. En el nivel z se corta la torre justo encima de la losa:
 *
 *  - N de cada muro = su peso propio de z a su coronamiento (con el espesor de cada tramo) + las losas que carga por
 *    encima de z (sin sobrecarga 0,7 t/m², con sobrecarga 0,9 t/m²).
 *  - M = el momento de M,NyQ en ese nivel (columna J para el viento A, O para el B; valores corregidos) por la misma
 *    fracción de la rototraslación que toma la pieza en PB (la planilla reparte con un único J por pieza).
 *  - La sección es la que tiene cada muro justo encima de z (si se afina en altura, la más delgada de arriba).
 *
 * En PB el resultado es exactamente el de `verificarDireccion`.
 */
import type { PiezaEquivalente } from './mapping';
import type { ResultadoCorregido } from './correcciones';
import { muroEn, presenteEn, type Proyecto } from './modelo';
import { datosAlturaDe, verificarPieza, type DatosAltura, type VerifPieza } from './flexocompresion';

export interface FibraNivel {
  nivel: string;
  z: number;
  /** momento del nivel que toman todos los tabiques (tm; sin exo, el de M,NyQ) */
  Mtotal: number;
  v: VerifPieza;
}

export interface FibrasPieza {
  nombre: string;
  dir: 'A' | 'B';
  /** fracción de la fuerza que toma la pieza (rototraslación) */
  frac: number;
  /** de PB hacia arriba */
  niveles: FibraNivel[];
  /** envolvente: la peor tracción (descargado) y compresión (cargado) de todos los niveles, kg/cm² */
  traccion: { valor: number; nivel: string; muro: string };
  compresion: { valor: number; nivel: string; muro: string };
  verifica: boolean;
}

/** datos de altura como si la «PB» fuera el nivel z (para reutilizar la cuenta de PB) */
export function alturaDesde(alt: DatosAltura, z: number): DatosAltura {
  const keep = alt.cotasSobrePB.map(c => c > z + 1e-6);
  return { ...alt, zPB: z, cotasSobrePB: alt.cotasSobrePB.filter((_, i) => keep[i]), pisosSobrePB: alt.pisosSobrePB?.filter((_, i) => keep[i]) };
}

/**
 * @param Mtabiques con exoesqueleto: el momento que les queda a los tabiques en la cota z (tm, del motor del exo); si no
 *   está, el momento total de M,NyQ (sin exo, como la planilla del curso)
 */
export function fibrasDireccion(p: Proyecto, piezas: PiezaEquivalente[], corr: ResultadoCorregido, filaNivel: number[], dir: 'A' | 'B', adm: number, Mtabiques?: (z: number) => number): FibrasPieza[] {
  const alt = datosAlturaDe(p);
  const mn = corr.guia.mnyq;
  const rot = dir === 'A' ? corr.guia.rotA : corr.guia.rotB, rep = dir === 'A' ? corr.rotA : corr.rotB;
  const porId = new Map(p.muros.map(m => [m.id, m]));
  // niveles desde PB hasta el último con piso encima (la azotea no tiene muro arriba)
  const niveles = p.niveles.map((n, j) => ({ n, j })).filter(({ n }) => n.cota >= alt.zPB - 1e-6 && n.cota < alt.zTop - 1e-6).sort((a, b) => a.n.cota - b.n.cota);
  return piezas.filter(pz => pz.dir === dir && pz.filaHoja !== null).map(pz => {
    const frac = rot.D5 ? rep[pz.filaHoja!].Qtot / rot.D5 : 0;
    const muros = pz.muros.map(id => porId.get(id)!).filter(Boolean);
    const out: FibraNivel[] = [];
    niveles.forEach(({ n, j }) => {
      const k = filaNivel[j];
      if (k === undefined) return;
      const z = n.cota;
      const ms = muros.filter(m => presenteEn(m, z, alt.zFund, alt.zTop) && (m.zHasta ?? alt.zTop) > z + 1e-6).map(m => muroEn(m, z + 0.01));
      if (!ms.length) return;
      const Mtotal = Mtabiques ? Mtabiques(z) : (dir === 'A' ? mn.J[k] : mn.O[k]) || 0;
      const v = verificarPieza(pz.nombre, dir, ms, Mtotal * frac, alturaDesde(alt, z), adm);
      out.push({ nivel: n.nombre, z, Mtotal, v });
    });
    let tr = { valor: -Infinity, nivel: '', muro: '' }, co = { valor: Infinity, nivel: '', muro: '' };
    out.forEach(f => f.v.muros.forEach(m => {
      if (m.traccion > tr.valor) tr = { valor: m.traccion, nivel: f.nivel, muro: m.id };
      if (m.compresion < co.valor) co = { valor: m.compresion, nivel: f.nivel, muro: m.id };
    }));
    return { nombre: pz.nombre, dir, frac, niveles: out, traccion: tr, compresion: co, verifica: out.every(f => f.v.verifica) };
  });
}

/**
 * Peor fibra de cada muro en cada piso (para pintar el 3D): σ > 0 la mayor tracción sin sobrecarga, si no la
 * mayor compresión con sobrecarga (kg/cm²). Clave: id del muro → lista por nivel (z del piso, de abajo arriba).
 */
export function peorFibraPorMuro(fs: FibrasPieza[]): Map<string, { z: number; sigma: number }[]> {
  const out = new Map<string, { z: number; sigma: number }[]>();
  fs.forEach(f => f.niveles.forEach(nv => {
    // un muro puede tener varias partes (tubo): se toma la peor
    const por = new Map<string, { t: number; c: number }>();
    nv.v.muros.forEach(m => {
      const a = por.get(m.id) ?? { t: -Infinity, c: Infinity };
      por.set(m.id, { t: Math.max(a.t, m.traccion), c: Math.min(a.c, m.compresion) });
    });
    por.forEach((x, id) => {
      const l = out.get(id) ?? [];
      l.push({ z: nv.z, sigma: x.t > 0 ? x.t : x.c });
      out.set(id, l);
    });
  }));
  return out;
}
