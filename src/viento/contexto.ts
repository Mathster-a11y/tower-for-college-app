/**
 * Contexto urbano para los simuladores de viento: escenarios armados alrededor de la torre (en el sentido del viento
 * elegido y a la escala de la torre) y qué edificios entran en un corte a cierta altura.
 * Los edificios viven en el proyecto (Proyecto.contexto); solo los usan los túneles, nunca los métodos de cálculo.
 */
import type { EdificioVecino } from '../engine/modelo';
import { puntosSilueta } from '../engine/silueta';

export interface P { x: number; y: number }
export interface Caja { x0: number; x1: number; y0: number; y1: number }

export type Escenario = 'fila' | 'costados' | 'damero' | 'ejemplo';
export const ESCENARIOS: Record<Escenario, string> = {
  fila: 'fila de torres a barlovento (protección y estela)',
  costados: 'dos torres a los costados (calles: canal o Venturi)',
  damero: 'manzana en damero (ocho torres alrededor)',
  ejemplo: 'el ejemplo del documento (cinco torres y tres edificios bajos)',
};

/** el ejemplo de docs/contexto_urbano (para la torre de 40,1 × 18,5 m y 118,8 m, con el viento A hacia +y) */
const EJEMPLO = [
  ['V1', 'Torre a barlovento', -18, -62, 32, 20, 112], ['V2', 'Torre a barlovento', 40, -58, 24, 24, 96],
  ['V3', 'Torre lateral', -52, 4, 20, 36, 124], ['V4', 'Torre lateral', 51, -2, 22, 30, 104],
  ['V5', 'Torre a sotavento', 6, 56, 40, 22, 116], ['B1', 'Edificio bajo', -62, -56, 20, 18, 24],
  ['B2', 'Edificio bajo', 64, 56, 18, 18, 24], ['B3', 'Edificio bajo', -54, 54, 22, 16, 21],
] as const;

export const cajaDe = (pol: P[]): Caja => ({ x0: Math.min(...pol.map(q => q.x)), x1: Math.max(...pol.map(q => q.x)), y0: Math.min(...pol.map(q => q.y)), y1: Math.max(...pol.map(q => q.y)) });

/**
 * arma un escenario alrededor de la torre. Se trabaja en el marco del viento: u en el sentido del viento y w a lo
 * ancho (con el viento A, u = +y y w = +x; con el B, u = +x y w = −y). separacion: el ancho de las calles (m);
 * altoRel: la altura de los vecinos en veces la de la torre
 */
export function armarEscenario(tipo: Escenario, caja: Caja, H: number, dir: 'A' | 'B', separacion: number, altoRel: number): EdificioVecino[] {
  const cx = (caja.x0 + caja.x1) / 2, cy = (caja.y0 + caja.y1) / 2;
  const Lu = dir === 'A' ? caja.y1 - caja.y0 : caja.x1 - caja.x0, Lw = dir === 'A' ? caja.x1 - caja.x0 : caja.y1 - caja.y0;
  // del marco del viento a la planta
  const aPlanta = (u: number, w: number): P => (dir === 'A' ? { x: cx + w, y: cy + u } : { x: cx + u, y: cy - w });
  const rect = (id: string, nombre: string, u: number, w: number, lu: number, lw: number, altura: number): EdificioVecino => {
    const esq = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => aPlanta(u + (a * lu) / 2, w + (b * lw) / 2));
    return { id, nombre, v: esq.map(q => ({ x: +q.x.toFixed(3), y: +q.y.toFixed(3) })), altura: +(altura).toFixed(2) };
  };
  const h = H * altoRel, s = separacion, out: EdificioVecino[] = [];
  if (tipo === 'fila') {
    for (let k = -1; k <= 1; k++) out.push(rect(`F${k + 2}`, 'Torre a barlovento', -(Lu + s), k * (Lw + s), Lu, Lw, h));
  } else if (tipo === 'costados') {
    out.push(rect('C1', 'Torre al costado', 0, -(Lw + s), Lu, Lw, h), rect('C2', 'Torre al costado', 0, Lw + s, Lu, Lw, h));
  } else if (tipo === 'damero') {
    let n = 0;
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) if (a || b) out.push(rect(`D${++n}`, a < 0 ? 'Torre a barlovento' : a > 0 ? 'Torre a sotavento' : 'Torre al costado', a * (Lu + s), b * (Lw + s), Lu, Lw, h));
  } else {
    // el ejemplo, escalado al ancho de la torre (calles y edificios crecen o se achican con ella) y a su altura
    const k = Lw / 40.1, kh = H / 118.8;
    for (const [id, nombre, w, u, aw, au, alt] of EJEMPLO) out.push(rect(id, nombre, u * k, w * k, au * k, aw * k, alt * kh * (altoRel / 1)));
  }
  return out;
}

/** los contornos de los edificios que llegan al corte a la altura z (m sobre PB) */
export const vecinosEnCorte = (eds: EdificioVecino[], z: number): P[][] => eds.filter(e => e.altura > z && e.v.length >= 3).map(e => e.v);

/** ¿algún vecino se pisa con la torre? (para avisar antes de simular) */
export function pisaLaTorre(e: EdificioVecino, torre: Caja): boolean {
  const c = cajaDe(e.v);
  return c.x0 < torre.x1 && c.x1 > torre.x0 && c.y0 < torre.y1 && c.y1 > torre.y0;
}

/**
 * edificios vecinos desde un plano del sitio en DXF: cada polilínea cerrada (con sus arcos) o círculo es un edificio.
 * La altura sale del número que tenga el nombre de la capa («EDIF_45», «h=30», «torres 120 m»); si la capa no tiene
 * número, «alturaPorDefecto». Las medidas ya en metros («factor» del dibujo) y corridas «dx, dy» para que coincida con
 * la planta del proyecto. Lo que se pisa con la torre (el plano del sitio suele traerla dibujada) se deja afuera
 */
export function contextoDesdeCAD(ents: import('../engine/cad').Entidad[], factor: number, dx: number, dy: number, alturaPorDefecto: number, torre: Caja | null):
  { edificios: EdificioVecino[]; sinAltura: number; omitidos: number } {
  const out: EdificioVecino[] = []; let sinAltura = 0, omitidos = 0;
  const altura = (capa: string) => { const m = /(\d+(?:[.,]\d+)?)/.exec(capa); const h = m ? parseFloat(m[1].replace(',', '.')) : NaN; if (h > 0 && h < 1000) return h; sinAltura++; return alturaPorDefecto; };
  for (const e of ents) {
    let v: P[] | null = null;
    if (e.t === 'poli' && e.cerrada && e.v.length >= 3) v = puntosSilueta(e.v, 8).map(q => ({ x: q.x, y: q.y }));
    else if (e.t === 'circulo' && e.r > 0) v = Array.from({ length: 24 }, (_, k) => ({ x: e.c.x + e.r * Math.cos((2 * Math.PI * k) / 24), y: e.c.y + e.r * Math.sin((2 * Math.PI * k) / 24) }));
    if (!v) continue;
    const pts = v.map(q => ({ x: +(q.x * factor + dx).toFixed(3), y: +(q.y * factor + dy).toFixed(3) }));
    const c = cajaDe(pts);
    if (c.x1 - c.x0 < 0.5 || c.y1 - c.y0 < 0.5) continue;               // demasiado chico para ser un edificio
    // la torre misma (o algo que la pise mucho): afuera
    if (torre && c.x0 < torre.x1 && c.x1 > torre.x0 && c.y0 < torre.y1 && c.y1 > torre.y0) {
      const t = (Math.min(c.x1, torre.x1) - Math.max(c.x0, torre.x0)) * (Math.min(c.y1, torre.y1) - Math.max(c.y0, torre.y0));
      if (t > 0.3 * (torre.x1 - torre.x0) * (torre.y1 - torre.y0)) { omitidos++; continue; }
    }
    out.push({ id: `D${out.length + 1}`, nombre: e.capa, v: pts, altura: altura(e.capa) });
  }
  return { edificios: out, sinAltura, omitidos };
}
