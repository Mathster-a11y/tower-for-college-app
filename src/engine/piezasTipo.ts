/**
 * Biblioteca de piezas tipo: tabique, L, T, C, U, doble T, núcleo (tubo rectangular) y columna circular.
 * Cada pieza se arma en su marco local con el alma vertical (paralela al viento A cuando el giro es 0°):
 * h = largo del alma (medida total, hasta la cara de afuera de las alas), b = ancho de las alas, e = espesor.
 * Después se gira (0, 90, 180 o 270°) y se lleva al punto de inserción (centro de la caja de la pieza).
 */
import { huella, type Muro } from './modelo';

export type TipoPieza = 'tabique' | 'L' | 'T' | 'C' | 'U' | 'doble T' | 'núcleo' | 'columna';
export interface MedidasPieza {
  h: number; b: number; e: number; giro: 0 | 90 | 180 | 270;
  /** espejada (antes de girar): la L o la C miran al otro lado */
  espejo?: boolean;
  /** medidas por parte (vacío = las generales b y e): espesor del alma; ancho y espesor del ala superior e inferior */
  eA?: number; bS?: number; eS?: number; bI?: number; eI?: number;
}
/** qué medidas por parte tiene cada tipo */
export const PARTES: Record<TipoPieza, ('eA' | 'bS' | 'eS' | 'bI' | 'eI')[]> = {
  tabique: [], L: ['eA', 'bS', 'eS'], T: ['eA', 'bS', 'eS'], C: ['eA', 'bS', 'eS', 'bI', 'eI'], U: ['eA', 'bI', 'eI'],
  'doble T': ['eA', 'bS', 'eS', 'bI', 'eI'], núcleo: [], columna: [],
};
/** medidas efectivas de cada parte */
export function partes(m: MedidasPieza) {
  return { eA: m.eA ?? m.e, bS: m.bS ?? m.b, eS: m.eS ?? m.e, bI: m.bI ?? m.b, eI: m.eI ?? m.e };
}
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
type Rect = { cx: number; cy: number; dir: 'X' | 'Y'; largo: number; e: number };

/** muros de la pieza en el marco local (alma vertical), sin girar ni mover */
function local(tipo: TipoPieza, m: MedidasPieza): Rect[] {
  const { h } = m, { eA, bS, eS, bI, eI } = partes(m);
  const arriba = h / 2 - eS / 2, abajo = -h / 2 + eI / 2;
  // el alma va entre las alas (sin pisarlas): así la sección no cuenta dos veces las esquinas
  switch (tipo) {
    case 'tabique': return [{ cx: 0, cy: 0, dir: 'Y', largo: h, e: m.e }];
    case 'L': return [{ cx: 0, cy: -eS / 2, dir: 'Y', largo: h - eS, e: eA }, { cx: bS / 2 - eA / 2, cy: arriba, dir: 'X', largo: bS, e: eS }];
    case 'T': return [{ cx: 0, cy: -eS / 2, dir: 'Y', largo: h - eS, e: eA }, { cx: 0, cy: arriba, dir: 'X', largo: bS, e: eS }];
    case 'C': return [{ cx: 0, cy: (eI - eS) / 2, dir: 'Y', largo: h - eS - eI, e: eA }, { cx: bS / 2 - eA / 2, cy: arriba, dir: 'X', largo: bS, e: eS }, { cx: bI / 2 - eA / 2, cy: abajo, dir: 'X', largo: bI, e: eI }];
    case 'U': return [{ cx: 0, cy: 0, dir: 'Y', largo: h, e: eA }, { cx: bI - eA, cy: 0, dir: 'Y', largo: h, e: eA }, { cx: (bI - eA) / 2, cy: abajo, dir: 'X', largo: bI - 2 * eA, e: eI }];
    case 'doble T': return [{ cx: 0, cy: (eI - eS) / 2, dir: 'Y', largo: h - eS - eI, e: eA }, { cx: 0, cy: arriba, dir: 'X', largo: bS, e: eS }, { cx: 0, cy: abajo, dir: 'X', largo: bI, e: eI }];
    default: return [];
  }
}

/**
 * Muros de una pieza tipo, girada y con el centro de su caja en (x, y). Los ids siguen la numeración libre
 * del proyecto (M1, M2…).
 */
export function piezaTipo(tipo: TipoPieza, m: MedidasPieza, x: number, y: number, idsUsados: Set<string>): Muro[] {
  const nuevoId = () => { let k = 1; while (idsUsados.has(`M${k}`)) k++; idsUsados.add(`M${k}`); return `M${k}`; };
  const base = (id: string): Muro => ({ id, dir: 'Y', x, y, largo: m.h, espesor: m.e, llega: true, areaInf: 10, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '', pieza: { tipo, med: { ...m } } });
  if (tipo === 'núcleo') {
    const giro90 = m.giro === 90 || m.giro === 270;
    return [{ ...base(nuevoId()), tipo: 'tubo-rect', largo: r2(giro90 ? m.h : m.b), ladoY: r2(giro90 ? m.b : m.h), espesor: m.e }];
  }
  if (tipo === 'columna') return [{ ...base(nuevoId()), tipo: 'tubo-circ', largo: m.h, espesor: Math.min(m.e, m.h / 2) }];
  const rs = local(tipo, m);
  // caja de la pieza (con los espesores) para centrarla en el punto de inserción
  const xs = rs.flatMap(r => (r.dir === 'X' ? [r.cx - r.largo / 2, r.cx + r.largo / 2] : [r.cx - r.e / 2, r.cx + r.e / 2]));
  const ys = rs.flatMap(r => (r.dir === 'Y' ? [r.cy - r.largo / 2, r.cy + r.largo / 2] : [r.cy - r.e / 2, r.cy + r.e / 2]));
  const ox = (Math.min(...xs) + Math.max(...xs)) / 2, oy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const rad = (m.giro * Math.PI) / 180, c = Math.round(Math.cos(rad)), s = Math.round(Math.sin(rad));
  return rs.map(r => {
    const u = (m.espejo ? -1 : 1) * (r.cx - ox), v = r.cy - oy;
    const gx = c * u - s * v, gy = s * u + c * v;
    const dir: 'X' | 'Y' = m.giro === 90 || m.giro === 270 ? (r.dir === 'X' ? 'Y' : 'X') : r.dir;
    return { ...base(nuevoId()), dir, x: r2(x + gx), y: r2(y + gy), largo: r2(r.largo), espesor: r2(r.e) };
  });
}

/** centro de la caja de unos muros (con sus espesores) */
export function centroCaja(ms: Muro[]): { x: number; y: number } {
  const xs = ms.flatMap(m => { const { ax } = huella(m); return [m.x - ax / 2, m.x + ax / 2]; });
  const ys = ms.flatMap(m => { const { ay } = huella(m); return [m.y - ay / 2, m.y + ay / 2]; });
  return { x: r2((Math.min(...xs) + Math.max(...xs)) / 2), y: r2((Math.min(...ys) + Math.max(...ys)) / 2) };
}
/**
 * Rehace una pieza tipo ya ubicada con medidas nuevas: sigue en su categoría (L, C, …), con el centro de su caja
 * donde estaba, los mismos ids, el mismo grupo y lo que se cargó en cada muro (área de influencia, niveles, papeles).
 */
export function rehacerPieza(muros: Muro[], g: string, med: MedidasPieza): Muro[] {
  const viejos = muros.filter(m => m.grupo === g), info = viejos[0]?.pieza;
  if (!info) return muros;
  const c = centroCaja(viejos);
  const usados = new Set(muros.map(m => m.id));
  const nuevos = piezaTipo(info.tipo, med, c.x, c.y, new Set(usados)).map((n, i) => {
    const v = viejos[i];
    if (!v) return n;
    return { ...n, id: v.id, llega: v.llega, areaInf: v.areaInf, zDesde: v.zDesde, zHasta: v.zHasta, rolA: v.rolA, rolB: v.rolB, grupo: g };
  });
  // si la pieza tiene menos muros que antes (no pasa dentro de una categoría), los que sobran se van
  const resto = muros.filter(m => m.grupo !== g);
  const primero = muros.findIndex(m => m.grupo === g);
  const out = [...resto.slice(0, primero), ...nuevos, ...resto.slice(primero)];
  return out;
}
/** la pieza tipo del grupo sigue al giro y al espejado del grupo (para poder rehacerla después) */
export function marcoTrasGiro(med: MedidasPieza): MedidasPieza { return { ...med, giro: (((med.giro + 90) % 360) as MedidasPieza['giro']) }; }
export function marcoTrasEspejo(med: MedidasPieza, eje: 'x' | 'y'): MedidasPieza {
  const g = eje === 'x' ? (360 - med.giro) % 360 : (540 - med.giro) % 360;
  return { ...med, giro: g as MedidasPieza['giro'], espejo: !med.espejo };
}

/** controla que las medidas armen la pieza (espesores menores que los largos); devuelve el problema o null */
export function problemaMedidas(tipo: TipoPieza, m: MedidasPieza): string | null {
  const { eA, bS, eS, bI, eI } = partes(m);
  const usaB = TIPOS.find(t => t.tipo === tipo)?.usaB ?? false;
  if ([m.h, m.e, ...(usaB ? [m.b] : []), ...PARTES[tipo].map(k => partes(m)[k])].some(v => !(v > 0))) return 'todas las medidas tienen que ser mayores que cero';
  if (tipo === 'columna') return m.e > m.h / 2 + 1e-9 ? 'el espesor de pared no puede pasar la mitad del diámetro' : null;
  if (tipo === 'núcleo') return 2 * m.e >= Math.min(m.h, m.b) ? 'el espesor de pared es demasiado grande para el tubo' : null;
  if (tipo === 'tabique') return m.e >= m.h ? 'el espesor tiene que ser menor que el largo' : null;
  const usa = PARTES[tipo];
  const eAlas = (usa.includes('eS') ? eS : 0) + (usa.includes('eI') ? eI : 0);
  if (eAlas >= m.h) return 'los espesores de las alas no entran en el largo del alma';
  if (usa.includes('bS') && eA >= bS) return 'el ala superior tiene que ser más ancha que el espesor del alma';
  if (usa.includes('bI') && (tipo === 'U' ? 2 * eA >= bI : eA >= bI)) return 'el ala inferior tiene que ser más ancha que el espesor del alma';
  return null;
}
