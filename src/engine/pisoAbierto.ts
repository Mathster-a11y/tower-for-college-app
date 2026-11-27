/**
 * Pisos abiertos en los túneles de viento: un nivel con carpintería «sin» (el tramo de carpintería que rige en su cota)
 * y sin carpintería propia no tiene fachada (una planta baja libre sobre columnas, como la plaza del Citicorp). El
 * viento no ve la losa: ve sus muros y columnas, con el aire entre ellos. La misma regla en el túnel 2D (en planta y
 * en el corte vertical) y en el 3D.
 */
import type { Proyecto } from './modelo';
import { tramoEn } from './carpinteria';
import { poligonosMuros } from './murosPlanta';

export const TEXTO_PISO_ABIERTO = 'Piso abierto (carpintería «sin»): el viento ve sus muros y columnas, no la losa.';

/** el nivel i no tiene fachada: rige un tramo de carpintería «sin» y no tiene carpintería propia */
export function esPisoAbierto(p: Proyecto, i: number): boolean {
  const n = p.niveles[i];
  return !!n && tramoEn(p, n.cota)?.modo === 'sin' && !(n.carpinteria?.length);
}

/**
 * lo que ve el viento en el nivel i si es un piso abierto: los polígonos de sus muros y columnas (emin: espesor mínimo,
 * ver poligonosMuros). null si el nivel tiene fachada o si no tiene muros (entonces se sigue con la silueta)
 */
export function piezasPisoAbierto(p: Proyecto, i: number, emin = 0): { pols: { x: number; y: number }[][]; engrosados: boolean } | null {
  if (!esPisoAbierto(p, i)) return null;
  const r = poligonosMuros(p, i, emin);
  return r.pols.length ? r : null;
}
