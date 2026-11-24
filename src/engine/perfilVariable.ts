/**
 * Protocolo de cálculo para torres de perfil variable (docs/propuesta_exoesqueleto.pdf, pág. 14): los pasos que
 * cambian cuando la torre no es un prisma. Los pasos 1, 3, 6 y 8 (viento con el B de cada nivel, peso con el área de
 * cada planta, rigidez con el J de cada nivel y controles por nivel) ya los hace la planilla; acá van los otros:
 *
 *  2 · Fachada inclinada: la presión es normal a la fachada; si la de barlovento se inclina un ángulo β respecto de la
 *      vertical, el viento del nivel se descompone en Wh = W · cos β (horizontal) y Wv = W · sin β (vertical).
 *  4 · Baricentros corridos: si el nivel i está corrido e_i respecto de PB en el sentido del viento, su peso P_i hace
 *      un momento en la base M_G = Σ P_i · e_i (se suma al vuelco si la torre se inclina hacia donde va el viento).
 *  5 · Excentricidad del viento: la resultante del viento de cada nivel pasa por el medio de su fachada, corrido c_i
 *      respecto de PB a lo ancho: suma un torsor Mt = Σ W_i · c_i al de la planilla (Q · e).
 *  7 · Efecto P-Δ: la torre corrida δ_i por el viento suma un momento con su propio peso, M_PΔ = Σ P_i · δ_i; ese
 *      momento la corre más, así que se amplifica con 1 / (1 − θ), θ = M_PΔ / Mv (el índice de estabilidad). Con
 *      θ ≤ 0,10 se puede despreciar; con θ ≥ 0,25 la torre es demasiado flexible.
 *
 * No cambia ningún número de las planillas: es la columna «Guía/CIRSOC» del protocolo, con sus propios controles.
 * Unidades: t, m, tm.
 */
import type { Proyecto } from './modelo';
import { medidasNiveles } from './perfilTorre';
import type { PlanillaRes } from './planilla';
import type { PiezaEquivalente } from './mapping';
import { datosAltura, deformada, moduloHormigon, rigidez, rigidezPorNivel } from './diagramas';

export interface NivelProtocolo {
  nivel: string; z: number;
  /** ancho que enfrenta el viento, largo en su sentido (m), corrimientos (m): «e» en el sentido del viento y «c» a lo ancho */
  ancho: number; largo: number; e: number; c: number;
  /** peso del nivel (t) y viento del nivel (t) */
  P: number; W: number;
  /** inclinación de la fachada de barlovento (rad; > 0: se va hacia sotavento al subir) y las dos partes del viento */
  beta: number; Wh: number; Wv: number;
  /** corrimiento por el viento (m) */
  delta: number;
}
export interface Protocolo {
  dir: 'A' | 'B';
  niveles: NivelProtocolo[];
  /** momento de vuelco del viento en PB (tm), del peso corrido (tm), torsor extra (tm), P-Δ de primer orden y amplificado (tm) */
  Mv: number; MG: number; MtExtra: number; MPD1: number; MPD: number;
  /** índice de estabilidad θ y amplificación 1 / (1 − θ) */
  theta: number; amp: number;
  /** viento horizontal y vertical totales (t): con fachadas inclinadas, Wh < W */
  W: number; Wh: number; Wv: number;
  /** momento total en PB en el peor sentido: Mv + |M_G| + M_PΔ (tm) y cuánto sube respecto de Mv */
  Mtotal: number; aumento: number;
}

/** q = carga de losa del nivel (t/m², la de la planilla: 0,7 descargado) */
export function protocoloPerfil(p: Proyecto, dir: 'A' | 'B', alt: { z: number; F: number }[], defl: { z: number; d: number }[], q = 0.7): Protocolo {
  const A = dir === 'A';
  const ms = medidasNiveles(p).filter(m => m.z > 1e-9).sort((a, b) => a.z - b.z);
  const zPB = p.niveles.reduce((v, n) => (n.cota >= 0 ? n.cota : v), 0);
  const cerca = <T extends { z: number }>(xs: T[], z: number) => xs.find(x => Math.abs(x.z - zPB - z) < 1e-6 || Math.abs(x.z - z) < 1e-6);
  // la fachada de barlovento: con el viento A (+y) es la cara y = dy − L/2; con el B (+x), x = dx − B/2
  const frente = (m: typeof ms[number]) => (A ? m.dy - m.L / 2 : m.dx - m.B / 2);
  const niveles: NivelProtocolo[] = ms.map((m, k) => {
    const ab = ms[Math.max(0, k - 1)], ar = ms[Math.min(ms.length - 1, k + 1)];
    const dz = ar.z - ab.z, beta = dz > 1e-9 ? Math.atan((frente(ar) - frente(ab)) / dz) : 0;
    const W = cerca(alt, m.z)?.F ?? 0, delta = cerca(defl, m.z)?.d ?? 0;
    const pisos = m.n.pisos && m.n.pisos > 0 ? m.n.pisos : 1;
    return { nivel: m.n.nombre, z: m.z, ancho: A ? m.B : m.L, largo: A ? m.L : m.B, e: A ? m.dy : m.dx, c: A ? m.dx : m.dy,
      P: q * m.B * m.L * pisos, W, beta, Wh: W * Math.cos(beta), Wv: W * Math.sin(beta), delta };
  });
  const sum = (f: (x: NivelProtocolo) => number) => niveles.reduce((s, x) => s + f(x), 0);
  const Mv = sum(x => x.Wh * x.z), MG = sum(x => x.P * x.e), MtExtra = sum(x => x.Wh * x.c), MPD1 = sum(x => x.P * x.delta);
  const theta = Mv > 0 ? MPD1 / Mv : 0, amp = theta < 0.99 ? 1 / (1 - theta) : Infinity;
  const MPD = MPD1 * amp, Mtotal = Mv + Math.abs(MG) + MPD;
  return { dir, niveles, Mv, MG, MtExtra, MPD1, MPD, theta, amp, W: sum(x => x.W), Wh: sum(x => x.Wh), Wv: sum(x => x.Wv), Mtotal, aumento: Mv > 0 ? Mtotal / Mv - 1 : 0 };
}

/**
 * El protocolo con los datos del cálculo: el viento de cada nivel (datosAltura) y la deformada de la etapa Rigidez
 * (con el J de cada nivel), como los muestra la app. R = los valores con los que se calcula (los de la guía).
 */
export function protocoloDelCalculo(p: Proyecto, R: PlanillaRes, piezas: PiezaEquivalente[], filaNivel: number[], hormigon: string, dir: 'A' | 'B'): Protocolo {
  const alt = datosAltura(p, R.viento, R.mnyq, filaNivel, dir);
  const W = dir === 'A' ? R.mnyq.H61 : alt.reduce((s, x) => s + x.F, 0);
  const rg = rigidez(R, hormigon).find(x => x.dir === dir)!;
  const Jniv = rigidezPorNivel(p, piezas, dir, rg.J);
  const def = deformada(alt, W, moduloHormigon(hormigon), rg.J, z => Jniv.find(q => Math.abs(q.z - z) < 1e-6)?.J || rg.J);
  return protocoloPerfil(p, dir, alt.map(x => ({ z: x.z, F: x.F })), def.puntos.map(x => ({ z: x.z, d: x.d })));
}
