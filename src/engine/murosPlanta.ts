/** Los muros de un nivel en planta, como los ve el viento en un piso abierto (túnel 2D «solo los muros» y túnel 3D). */
import { muroEn, presenteEn, rectangulos, tipoDe, type Proyecto } from './modelo';

/**
 * los muros de un nivel como polígonos en planta (m, con el corrimiento del nivel): un rectángulo por cada rectángulo de
 * muro (tabiques, tubos, perfiles) y un polígono de 24 lados por cada tubo circular. Es lo que ve el viento en un piso
 * abierto (una PB libre sobre columnas, una estructura en obra). emin: el espesor mínimo (los tabiques más finos que eso
 * se engrosan para que el túnel los vea); engrosados dice si hubo que hacerlo
 */
export function poligonosMuros(p: Proyecto, i: number, emin = 0): { pols: { x: number; y: number }[][]; engrosados: boolean } {
  const zTop = p.niveles[0]?.cota ?? 0, zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0, z = p.niveles[i].cota;
  const dx = p.niveles[i]?.dx ?? 0, dy = p.niveles[i]?.dy ?? 0;
  const ms = p.muros.filter(m => presenteEn(m, z, zFund, zTop)).map(m => muroEn(m, z));
  const rs = ms.filter(m => tipoDe(m) !== 'tubo-circ').flatMap(m => rectangulos(m)).filter(r => r.ax > 1e-3 && r.ay > 1e-3);
  const circ = ms.filter(m => tipoDe(m) === 'tubo-circ');
  const engrosados = rs.some(r => Math.min(r.ax, r.ay) < emin);
  return {
    engrosados,
    pols: [
      ...rs.map(r => { const ax = Math.max(r.ax, emin), ay = Math.max(r.ay, emin); return [{ x: r.x - ax / 2 + dx, y: r.y - ay / 2 + dy }, { x: r.x + ax / 2 + dx, y: r.y - ay / 2 + dy }, { x: r.x + ax / 2 + dx, y: r.y + ay / 2 + dy }, { x: r.x - ax / 2 + dx, y: r.y + ay / 2 + dy }]; }),
      ...circ.map(m => Array.from({ length: 24 }, (_, k) => ({ x: m.x + dx + (m.largo / 2) * Math.cos((2 * Math.PI * k) / 24), y: m.y + dy + (m.largo / 2) * Math.sin((2 * Math.PI * k) / 24) }))),
    ],
  };
}
