/**
 * Exageración automática de la deformada (traslación y giro) para dibujarla: cuentas sin three.js, así las usan los
 * deslizadores sin cargar el 3D.
 */
import type { Rototraslacion3D } from '../engine/diagramas';

/** Corrimiento real máximo de un punto de la planta (traslación + giro alrededor del CR de cada nivel). */
export function movMaximo(r: Rototraslacion3D, B: number, L: number): number {
  return Math.max(0, ...r.niveles.map(n => Math.abs(n.d) + Math.abs(n.th) * Math.hypot(B / 2 + Math.abs(n.cr.x), L / 2 + Math.abs(n.cr.y))));
}

/** Exageración «redonda» (1, 2, 5 × 10ⁿ) para que la azotea se corra cerca de un sexto del ancho de la planta. */
/** últimas exageraciones usadas (para los deslizadores de la axonometría) */
export const ultimaDeformada = { auto: 0, giroAuto: 1, f: 0, k: 1 };
export function exageracionAuto(r: Rototraslacion3D, B: number, L: number): number {
  const mov = Math.max(movMaximo(r, B, L), 1e-12);
  const f = (0.16 * Math.max(B, L)) / mov;
  const p = 10 ** Math.floor(Math.log10(f));
  return [5, 2, 1].map(k => k * p).find(v => v <= f) ?? p;
}

/**
 * Extra del giro: la rotación es mucho más chica que la traslación, así que se multiplica aparte para que el
 * revirado se vea (la azotea gira unos 20° en el dibujo). Es solo para dibujar: los números son los reales.
 */
export function giroExtraAuto(r: Rototraslacion3D, f: number): number {
  const th = Math.abs(r.thTop) * f;
  if (th < 1e-12) return 1;
  const x = 0.35 / th;
  if (x <= 1.5) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  return [1, 2, 5, 10].map(k => k * p).reduce((a, b) => (Math.abs(Math.log(b / x)) < Math.abs(Math.log(a / x)) ? b : a));
}
