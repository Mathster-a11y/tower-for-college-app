/**
 * Biblioteca de piezas tipo: tabique, L, T, C, U, doble T, núcleo (tubo rectangular) y columna circular.
 * Cada pieza se arma en su marco local con el alma vertical (paralela al viento A cuando el giro es 0°):
 * h = largo del alma (medida total, hasta la cara de afuera de las alas), b = ancho de las alas, e = espesor.
 * Después se gira (0, 90, 180 o 270°) y se lleva al punto de inserción (centro de la caja de la pieza).
 */
import type { Muro } from './modelo';

export type TipoPieza = 'tabique' | 'L' | 'T' | 'C' | 'U' | 'doble T' | 'núcleo' | 'columna';
export interface MedidasPieza { h: number; b: number; e: number; giro: 0 | 90 | 180 | 270 }
export const TIPOS: { tipo: TipoPieza; nombre: string; ayuda: string; usaB: boolean }[] = [
  { tipo: 'tabique', nombre: 'Tabique', ayuda: 'Un muro suelto: h = largo, e = espesor.', usaB: false },
  { tipo: 'L', nombre: 'L', ayuda: 'Alma de largo h y un ala de ancho b en un extremo, hacia un lado.', usaB: true },
  { tipo: 'T', nombre: 'T', ayuda: 'Alma de largo h y un ala de ancho b centrada en un extremo.', usaB: true },
  { tipo: 'C', nombre: 'C', ayuda: 'Alma de largo h y dos alas de ancho b, hacia el mismo lado.', usaB: true },
  { tipo: 'U', nombre: 'U', ayuda: 'Dos almas de largo h unidas abajo por un ala de ancho b.', usaB: true },
  { tipo: 'doble T', nombre: 'Doble T', ayuda: 'Alma de largo h y dos alas de ancho b centradas (pieza simétrica).', usaB: true },
  { tipo: 'núcleo', nombre: 'Núcleo', ayuda: 'Tubo rectangular (caja): h × b exteriores, e = espesor de pared.', usaB: true },
  { tipo: 'columna', nombre: 'Columna circular', ayuda: 'h = diámetro; e = espesor de pared (la mitad de h: maciza).', usaB: false },
];

const r2 = (v: number) => Math.round(v * 1000) / 1000;
type Rect = { cx: number; cy: number; dir: 'X' | 'Y'; largo: number };

/** muros de la pieza en el marco local (alma vertical), sin girar ni mover */
function local(tipo: TipoPieza, { h, b, e }: MedidasPieza): Rect[] {
  const arriba = h / 2 - e / 2, abajo = -h / 2 + e / 2;
  // el alma va entre las alas (sin pisarlas): así la sección no cuenta dos veces las esquinas
  switch (tipo) {
    case 'tabique': return [{ cx: 0, cy: 0, dir: 'Y', largo: h }];
    case 'L': return [{ cx: 0, cy: -e / 2, dir: 'Y', largo: h - e }, { cx: b / 2 - e / 2, cy: arriba, dir: 'X', largo: b }];
    case 'T': return [{ cx: 0, cy: -e / 2, dir: 'Y', largo: h - e }, { cx: 0, cy: arriba, dir: 'X', largo: b }];
    case 'C': return [{ cx: 0, cy: 0, dir: 'Y', largo: h - 2 * e }, { cx: b / 2 - e / 2, cy: arriba, dir: 'X', largo: b }, { cx: b / 2 - e / 2, cy: abajo, dir: 'X', largo: b }];
    case 'U': return [{ cx: 0, cy: 0, dir: 'Y', largo: h }, { cx: b - e, cy: 0, dir: 'Y', largo: h }, { cx: (b - e) / 2, cy: abajo, dir: 'X', largo: b - 2 * e }];
    case 'doble T': return [{ cx: 0, cy: 0, dir: 'Y', largo: h - 2 * e }, { cx: 0, cy: arriba, dir: 'X', largo: b }, { cx: 0, cy: abajo, dir: 'X', largo: b }];
    default: return [];
  }
}

/**
 * Muros de una pieza tipo, girada y con el centro de su caja en (x, y). Los ids siguen la numeración libre
 * del proyecto (M1, M2…).
 */
export function piezaTipo(tipo: TipoPieza, m: MedidasPieza, x: number, y: number, idsUsados: Set<string>): Muro[] {
  const nuevoId = () => { let k = 1; while (idsUsados.has(`M${k}`)) k++; idsUsados.add(`M${k}`); return `M${k}`; };
  const base = (id: string): Muro => ({ id, dir: 'Y', x, y, largo: m.h, espesor: m.e, llega: true, areaInf: 10, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '' });
  if (tipo === 'núcleo') {
    const giro90 = m.giro === 90 || m.giro === 270;
    return [{ ...base(nuevoId()), tipo: 'tubo-rect', largo: r2(giro90 ? m.h : m.b), ladoY: r2(giro90 ? m.b : m.h), espesor: m.e }];
  }
  if (tipo === 'columna') return [{ ...base(nuevoId()), tipo: 'tubo-circ', largo: m.h, espesor: Math.min(m.e, m.h / 2) }];
  const rs = local(tipo, m);
  // caja de la pieza (con los espesores) para centrarla en el punto de inserción
  const xs = rs.flatMap(r => (r.dir === 'X' ? [r.cx - r.largo / 2, r.cx + r.largo / 2] : [r.cx - m.e / 2, r.cx + m.e / 2]));
  const ys = rs.flatMap(r => (r.dir === 'Y' ? [r.cy - r.largo / 2, r.cy + r.largo / 2] : [r.cy - m.e / 2, r.cy + m.e / 2]));
  const ox = (Math.min(...xs) + Math.max(...xs)) / 2, oy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const rad = (m.giro * Math.PI) / 180, c = Math.round(Math.cos(rad)), s = Math.round(Math.sin(rad));
  return rs.map(r => {
    const u = r.cx - ox, v = r.cy - oy;
    const gx = c * u - s * v, gy = s * u + c * v;
    const dir: 'X' | 'Y' = m.giro === 90 || m.giro === 270 ? (r.dir === 'X' ? 'Y' : 'X') : r.dir;
    return { ...base(nuevoId()), dir, x: r2(x + gx), y: r2(y + gy), largo: r2(r.largo) };
  });
}
