/**
 * Verificación de tabiques según CIRSOC 201-2005 (Reglamento Argentino de Estructuras de Hormigón), por resistencia.
 * Capa «verificación» de los métodos CIRSOC y FEM (plan de trabajo, etapa 4).
 *
 *  - Materiales: f'c del hormigón (H-30 → 30 MPa), acero ADN 420 (fy = 420 MPa, Es = 200.000 MPa), εcu = 0,003.
 *  - Bloque de tensiones (10.2.7): 0,85 f'c en a = β1·c; β1 = 0,85 hasta 30 MPa y 0,05 menos cada 7 MPa (≥ 0,65).
 *  - φ (9.3.2): 0,65 controlada por compresión (εt ≤ 0,002), 0,90 por tracción (εt ≥ 0,005), lineal entre medio;
 *    corte 0,75. Carga axial máxima (10-2): φPn,máx = 0,80 φ [0,85 f'c (Ag − Ast) + fy Ast].
 *  - Corte en el plano del tabique (11.10): d = 0,8 lw; Vc el menor de (11-29) y (11-30); Vn ≤ 5/6 √f'c h d; Vs = Av fy d / s.
 *  - Cuantías mínimas (14.3 y 11.10.9): vertical 0,0012 y horizontal 0,0020 (barras ≤ Ø16, fy ≥ 420); si Vu > φVc/2,
 *    horizontal ≥ 0,0025 y vertical según (11-32).
 *  - Método empírico (14.5, verificación simple): φPn = 0,55 φ f'c Ag [1 − (k lc / 32 h)²], con φ = 0,65.
 *
 * Unidades de entrada y salida: m, t, tm (como el resto de la app). Adentro: N y mm.
 */

export const FY = 420, ES = 200_000, ECU = 0.003, EY = FY / ES;
export const N_POR_T = 9806.65;
export const fcDe = (hormigon: string) => parseFloat(hormigon.replace(/[^\d.]/g, '')) || 30;
/** 10.2.7.3 */
export const beta1 = (fc: number) => (fc <= 30 ? 0.85 : Math.max(0.65, 0.85 - (0.05 * (fc - 30)) / 7));
/** 9.3.2: φ según la deformación neta de tracción del acero más traccionado */
/** el límite de compresión que da el reglamento para fy = 420 MPa es 0,002 (9.3.2) */
export const ET_COMPRESION = 0.002;
export const phiFlexo = (et: number) => (et <= ET_COMPRESION ? 0.65 : et >= 0.005 ? 0.9 : 0.65 + ((et - ET_COMPRESION) / (0.005 - ET_COMPRESION)) * 0.25);
export const PHI_CORTE = 0.75;

export interface Seccion {
  /** largo del tabique (m), espesor (m), cuantía vertical total (As / Ag), recubrimiento al eje de las barras (m) */
  lw: number; h: number; rho: number; rec: number; fc: number;
}
export interface PuntoNM { c: number; Pn: number; Mn: number; phi: number; phiPn: number; phiMn: number; et: number }

/** punto del diagrama para una profundidad del eje neutro c (mm); armadura repartida en «nb» barras a lo largo de lw */
function punto(s: Seccion, c: number, nb = 40): PuntoNM {
  const L = s.lw * 1000, h = s.h * 1000, d1 = s.rec * 1000, fc = s.fc, b1 = beta1(fc);
  const As = s.rho * L * h, Asi = As / nb;
  const a = Math.min(b1 * c, L);
  let Pn = 0.85 * fc * a * h, Mn = 0.85 * fc * a * h * (L / 2 - a / 2), et = 0;
  for (let k = 0; k < nb; k++) {
    const y = d1 + ((L - 2 * d1) * k) / (nb - 1);                       // desde la fibra más comprimida
    const es = c > 0 ? (ECU * (c - y)) / c : -1;                          // + compresión
    let fs = Math.max(-FY, Math.min(FY, es * ES));
    if (y < a && fs > 0) fs -= 0.85 * fc;                                  // la barra ocupa hormigón comprimido
    Pn += fs * Asi; Mn += fs * Asi * (L / 2 - y);
    if (k === nb - 1) et = -es;                                            // deformación de tracción del acero extremo
  }
  const phi = phiFlexo(et);
  return { c, Pn, Mn, phi, phiPn: phi * Pn, phiMn: phi * Mn, et };
}

export interface Diagrama { puntos: PuntoNM[]; phiPnMax: number; phiPnMin: number; P0: number }
/** diagrama de interacción φPn–φMn en el plano del tabique (sección rectangular simétrica: se da la rama Mn ≥ 0) */
export function diagrama(s: Seccion): Diagrama {
  const L = s.lw * 1000, h = s.h * 1000, Ag = L * h, As = s.rho * Ag;
  const P0 = 0.85 * s.fc * (Ag - As) + FY * As;
  const phiPnMax = 0.8 * 0.65 * P0;                                          // (10-2)
  const phiPnMin = -0.9 * FY * As;                                           // tracción pura
  const puntos: PuntoNM[] = [];
  for (let i = 1; i <= 120; i++) puntos.push(punto(s, (L * 1.6 * i) / 120));
  puntos.forEach(q => { if (q.phiPn > phiPnMax) { q.phiPn = phiPnMax; } });
  puntos.push({ c: 0, Pn: -FY * As, Mn: 0, phi: 0.9, phiPn: phiPnMin, phiMn: 0, et: Infinity });
  puntos.sort((x, y) => x.phiPn - y.phiPn);
  return { puntos, phiPnMax, phiPnMin, P0 };
}
/** φMn (N·mm) que resiste la sección con la carga axial φPn = Pu (N); 0 si Pu está fuera del diagrama */
export function momentoResistente(dg: Diagrama, Pu: number): number {
  if (Pu > dg.phiPnMax + 1e-6 || Pu < dg.phiPnMin - 1e-6) return 0;
  let mejor = 0;
  for (let i = 0; i + 1 < dg.puntos.length; i++) {
    const p = dg.puntos[i], q = dg.puntos[i + 1];
    if ((p.phiPn - Pu) * (q.phiPn - Pu) > 0 || p.phiPn === q.phiPn) continue;
    const t = (Pu - p.phiPn) / (q.phiPn - p.phiPn);
    mejor = Math.max(mejor, p.phiMn + t * (q.phiMn - p.phiMn));
  }
  return mejor;
}

// ---------------------------------------------------------------------------------------------------- corte
export interface Corte { Vu: number; d: number; Vc: number; VnMax: number; phiVc: number; rhoT: number; Vs: number; phiVn: number; verifica: boolean; necesitaArmaduraCorte: boolean }
/**
 * 11.10: Vu y Nu en t (Nu + compresión), Mu en tm, lw, h, hw en m, ρt cuantía horizontal colocada.
 */
export function corteTabique(Vu: number, Nu: number, Mu: number, lw: number, h: number, rhoT: number, fc: number): Corte {
  const L = lw * 1000, hh = h * 1000, d = 0.8 * L, sq = Math.sqrt(fc);
  const V = Math.abs(Vu) * N_POR_T, N = Nu * N_POR_T, M = Math.abs(Mu) * N_POR_T * 1000;
  const v1 = (sq / 4) * hh * d + (N * d) / (4 * L);                                              // (11-29)
  const brazo = V > 0 ? M / V - L / 2 : -1;
  // (11-30): [ ½ √f'c + lw (√f'c + 2 Nu / (lw h)) / (Mu/Vu − lw/2) ] · h d / 10; no se aplica si Mu/Vu − lw/2 < 0
  const v2 = brazo > 0 ? (sq / 2 + (L * (sq + (2 * N) / (L * hh))) / brazo) * ((hh * d) / 10) : Infinity;
  const Vc = Math.max(0, Math.min(v1, v2));
  const VnMax = (5 / 6) * sq * hh * d;                                                             // (11-28)
  const Vs = rhoT * hh * d * FY;                                                                    // (11-31) con Av/s = ρt h
  const phiVn = PHI_CORTE * Math.min(Vc + Vs, VnMax);
  return { Vu: Math.abs(Vu), d: d / 1000, Vc: Vc / N_POR_T, VnMax: VnMax / N_POR_T, phiVc: (PHI_CORTE * Vc) / N_POR_T, rhoT, Vs: Vs / N_POR_T, phiVn: phiVn / N_POR_T, verifica: V <= phiVn, necesitaArmaduraCorte: V > (PHI_CORTE * Vc) / 2 };
}

// ---------------------------------------------------------------------------------------------------- cuantías
/** 14.3 y 11.10.9: cuantías mínimas vertical (ρl) y horizontal (ρt) */
export function cuantiasMinimas(corteAlto: boolean, hw: number, lw: number): { rhoV: number; rhoH: number } {
  if (!corteAlto) return { rhoV: 0.0012, rhoH: 0.002 };
  const rhoH = 0.0025;
  return { rhoV: Math.max(0.0025, 0.0025 + 0.5 * (2.5 - hw / lw) * (rhoH - 0.0025)), rhoH };
}

// ---------------------------------------------------------------------------------------------------- empírico
/** 14.5 (14-1): resistencia axial de diseño (t) de un tabique macizo; lc altura libre (m), k factor de longitud efectiva */
export function axialEmpirico(lw: number, h: number, lc: number, fc: number, k = 0.8): number {
  const Ag = lw * 1000 * h * 1000;
  return (0.55 * 0.65 * fc * Ag * (1 - ((k * lc) / (32 * h)) ** 2)) / N_POR_T;
}

// ---------------------------------------------------------------------------------------------------- verificación de un muro
export interface Solicitacion { combinacion: string; Nu: number; Mu: number; Vu: number }
export interface VerifMuro201 {
  id: string; papel: string; lw: number; h: number;
  /** la peor solicitación para flexocompresión y su relación Mu / φMn (≤ 1 verifica) */
  peor: Solicitacion; phiMn: number; relacion: number;
  /** cuantía vertical: la mínima y la necesaria (completa) */
  rhoMin: number; rhoNecesaria: number;
  corte: Corte; rhoH: number;
  /** simple: compresión con el método empírico y cordones de borde */
  axialEmp: number; NuMax: number; cordon: { T: number; AsBorde: number; C: number; Cadm: number };
  verifica: boolean; diagrama: Diagrama;
  /** todas las solicitaciones (combinaciones × casos de viento × sentido) */
  solicitaciones: Solicitacion[];
}
/**
 * Verifica un muro (rectángulo lw × h) con sus solicitaciones mayoradas.
 *  - Completa: busca la cuantía vertical mínima (desde la de 14.3, de a 0,0005) con la que todas las combinaciones
 *    quedan dentro del diagrama de interacción.
 *  - Simple (para hacer a mano): compresión con el método empírico (14.5) y flexión con dos cordones de borde de
 *    0,15 lw separados z = 0,85 lw: T = Mu/z − Nu/2 (acero: As = T / 0,9 fy) y C = Mu/z + Nu/2 ≤ 0,65·0,85 f'c·área del cordón.
 *    No es un artículo del reglamento: es el modelo de bielas más simple del tabique, y se compara con la completa.
 */
export function verificarMuro201(id: string, papel: string, lw: number, h: number, sol: Solicitacion[], fc: number, rec: number, hw: number, lc: number): VerifMuro201 {
  const Vmax = Math.max(0, ...sol.map(s => Math.abs(s.Vu)));
  const NuCorte = Math.min(...sol.map(s => s.Nu));
  const c0 = corteTabique(Vmax, NuCorte, Math.max(...sol.map(s => Math.abs(s.Mu))), lw, h, 0, fc);
  const min = cuantiasMinimas(c0.necesitaArmaduraCorte, hw, lw);
  // horizontal: la mínima o la que pide el corte
  let rhoH = min.rhoH;
  const conVs = (rh: number) => corteTabique(Vmax, NuCorte, Math.max(...sol.map(s => Math.abs(s.Mu))), lw, h, rh, fc);
  while (!conVs(rhoH).verifica && rhoH < 0.02) rhoH += 0.0005;
  const corte = conVs(rhoH);
  // vertical: la menor cuantía que deja todas las combinaciones adentro del diagrama
  const relacionCon = (rho: number) => {
    const dg = diagrama({ lw, h, rho, rec, fc });
    let peor = sol[0], rel = 0, mR = 0;
    for (const s of sol) {
      const mr = momentoResistente(dg, s.Nu * N_POR_T) / N_POR_T / 1000;
      // sin momento (alas, gravitatorias): la relación es la de la carga axial con la máxima de compresión o de tracción
      const r = Math.abs(s.Mu) < 1e-9 ? (s.Nu >= 0 ? (s.Nu * N_POR_T) / dg.phiPnMax : (s.Nu * N_POR_T) / dg.phiPnMin)
        : mr > 0 ? Math.abs(s.Mu) / mr : Infinity;
      if (r > rel) { rel = r; peor = s; mR = mr; }
    }
    return { dg, peor, rel, mR };
  };
  let rho = min.rhoV, res = relacionCon(rho);
  while (res.rel > 1 && rho < 0.04) { rho = Math.round((rho + 0.0005) * 1e5) / 1e5; res = relacionCon(rho); }
  const conMin = relacionCon(min.rhoV);
  // simple
  const NuMax = Math.max(...sol.map(s => s.Nu));
  const axialEmp = axialEmpirico(lw, h, lc, fc);
  const z = 0.85 * lw, Acord = 0.15 * lw * h;
  const peorT = sol.reduce((a, s) => Math.max(a, Math.abs(s.Mu) / z - s.Nu / 2), -Infinity);
  const peorC = sol.reduce((a, s) => Math.max(a, Math.abs(s.Mu) / z + s.Nu / 2), -Infinity);
  const cordon = { T: peorT, AsBorde: Math.max(0, (peorT * N_POR_T) / (0.9 * FY)) / 100, C: peorC, Cadm: (0.65 * 0.85 * fc * Acord * 1e6) / N_POR_T };
  return {
    id, papel, lw, h, peor: conMin.peor, phiMn: conMin.mR, relacion: conMin.rel, rhoMin: min.rhoV, rhoNecesaria: rho,
    corte, rhoH, axialEmp, NuMax, cordon, verifica: res.rel <= 1 && corte.verifica, diagrama: res.dg, solicitaciones: sol,
  };
}
