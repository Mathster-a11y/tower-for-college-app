/**
 * Lo que daría la planilla con las correcciones acordadas, sin cambiar la planilla:
 * la app muestra siempre los dos valores lado a lado.
 */
import { calcularPlanilla, type PlanillaDatos, type PlanillaRes, type RotoRes } from './planilla';

export interface ResultadoCorregido {
  /** viento con Kz mínimo 5 m (CIRSOC) y sin viento en PB ni subsuelos (guía) */
  guia: PlanillaRes;
  /** fuerza y momento de cada pieza con unidades correctas (M rot = Q rot · Mi/Qi) */
  rotA: PiezaRot[];
  rotB: PiezaRot[];
}
export interface PiezaRot { Qtras: number; Qrot: number; Qtot: number; Mtras: number; Mrot: number; Mtot: number; Mplanilla: number; }

export function datosSegunGuia(d: PlanillaDatos, filaPB: number): PlanillaDatos {
  const D = [...d.mnyq.D];
  for (let k = filaPB; k < D.length; k++) D[k] = 0;
  return { ...d, mnyq: { ...d.mnyq, D } };
}

export function repartoCorregido(r: RotoRes): PiezaRot[] {
  const hW = r.D5 === 0 ? 0 : r.F5 / r.D5;
  return Array.from({ length: 20 }, (_, i) => {
    const Qtras = r.E[i], Qrot = isFinite(r.N[i]) ? r.N[i] : 0, Mtras = r.G[i];
    return { Qtras, Qrot, Qtot: Qtras + Qrot, Mtras, Mrot: Qrot * hW, Mtot: Mtras + Qrot * hW, Mplanilla: r.O[i] };
  });
}

export function calcularCorregido(d: PlanillaDatos, filaPB: number): ResultadoCorregido {
  const guia = calcularPlanilla(datosSegunGuia(d, filaPB), { kzMin5: true });
  return { guia, rotA: repartoCorregido(guia.rotA), rotB: repartoCorregido(guia.rotB) };
}
