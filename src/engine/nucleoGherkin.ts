/**
 * Núcleo del Gherkin (30 St Mary Axe) relevado en las plantas de Foster + Partners: las piezas que se repiten en las
 * plantas de oficinas (bajas, medias y altas), superpuestas y alineadas por sus columnas. Datos, método e imágenes en
 * docs/gherkin-nucleo/ (relevamiento.json es la fuente de estos números).
 *
 * Metros, origen en el centro de la torre, +y hacia los bancos de ascensores. Solo la mitad izquierda (x < 0); la derecha
 * es su espejo. Muros: eje de punta a punta, 25 cm; los vanos (puertas de ascensores) parten el muro en tramos.
 * Columnas: 0,70 × 0,70 m, «giro» antihorario en grados (en la mitad derecha, con el signo cambiado).
 */
import type { Muro } from './modelo';
import { ponerPerfil, type VerticePerfil } from './perfil';

type P2 = [number, number];
/** id, x, y, giro, sigue hasta el 39º (D, S y el poste P del ascensor chico) */
const COLUMNAS: [string, number, number, number, boolean][] = [
  ['R12', -2.46, 12.05, 11.6, false],
  ['R25', -5.14, 11.13, 25.0, false],
  ['R51', -9.56, 7.68, 51.2, false],
  ['R68', -11.41, 4.63, 67.9, false],
  ['R95', -12.22, -1.1, 95.2, false],
  ['R109', -11.67, -3.93, 108.6, false],
  ['R135', -8.69, -8.72, 135.1, false],
  ['R165', -3.17, -11.85, 165.0, false],
  ['S', -3.56, -4.44, 38.0, true],
  ['D', -4.56, 2.64, -35.0, true],
  ['P', -9.32, 3.39, 56.0, true]
];
/** muros que siguen hasta el 39º: la escalera, el ascensor chico y W (están en la planta del restaurante) */
const AL_39 = new Set(['B_sup', 'B_inf', 'C_ext', 'C_inf', 'W']);
const MUROS: { id: string; de: P2; a: P2; vanos?: P2[]; eje?: 'x' | 'y' }[] = [
  { id: 'A_ext', de: [-4.95, 11.13], a: [-4.56, 2.74] },
  { id: 'A_sup', de: [-5.13, 11.04], a: [-2.01, 11.24] },
  { id: 'A_int', de: [-2.04, 11.15], a: [-1.53, 2.67], vanos: [[10.33, 9.17], [7.67, 6.33], [4.83, 3.67]], eje: 'y' },
  { id: 'A_inf', de: [-4.6, 2.66], a: [-1.55, 2.68] },
  { id: 'A2_ext', de: [-7.68, 9.65], a: [-7.45, 5.95] },
  { id: 'A2_sup', de: [-7.74, 9.54], a: [-4.95, 9.72], vanos: [[-7.2, -5.87]], eje: 'x' },
  { id: 'B_sup', de: [-9.36, 7.08], a: [-4.54, 4.31] },
  { id: 'B_ext', de: [-9.1, 7.16], a: [-10.91, 4.02] },
  { id: 'B_inf', de: [-9.32, 3.66], a: [-6.06, 1.78] },
  { id: 'C_ext', de: [-9.42, 3.47], a: [-10.2, 1.7] },
  { id: 'C_inf', de: [-10.22, 1.69], a: [-8.48, 0.67] },
  { id: 'W', de: [-12.2, -1.28], a: [-4.65, 2.52] },
  { id: 'W2', de: [-12.26, -0.81], a: [-10.77, -4.04] },
  { id: 'A2_inf', de: [-6.67, 5.63], a: [-4.7, 5.63] }
];

/** contorno antihorario de un rectángulo dado por su centro, sus lados y su giro */
function rect(cx: number, cy: number, a: number, b: number, giro: number): VerticePerfil[] {
  const t = (giro * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return ([[-a / 2, -b / 2], [a / 2, -b / 2], [a / 2, b / 2], [-a / 2, b / 2]] as P2[]).map(([u, v]) => ({ x: cx + u * c - v * s, y: cy + u * s + v * c }));
}
/** tramos de un muro: el eje entero, o partido por sus vanos (en y o en x) */
function tramos(m: (typeof MUROS)[number]): [P2, P2][] {
  if (!m.vanos) return [[m.de, m.a]];
  const k = m.eje === 'x' ? 0 : 1, pt = (v: number): P2 => { const t = (v - m.de[k]) / (m.a[k] - m.de[k]); return [m.de[0] + t * (m.a[0] - m.de[0]), m.de[1] + t * (m.a[1] - m.de[1])]; };
  const out: [P2, P2][] = [];
  let ini = m.de;
  for (const [v0, v1] of m.vanos) { out.push([ini, pt(v0)]); ini = pt(v1); }
  out.push([ini, m.a]);
  return out;
}

export interface OpcionesNucleo {
  /** cota de la losa donde termina casi todo (el 38º) y donde terminan la escalera, el ascensor chico, W, D, S y P (el 39º) */
  z38: number; z39: number;
  /** si se da, D y S siguen hasta esta losa (el entrepiso del 40º apoya en ellas) */
  z40?: number;
  espesor?: number; lado?: number;
  /** espesor de algún muro en particular (por su id de la mitad izquierda, p. ej. «W2») */
  espesorDe?: Record<string, number>;
}

/**
 * Muros y columnas del núcleo, como perfiles. Los muros de cada mitad forman una pieza por viento («Núcleo O» y
 * «Núcleo E»); las columnas llevan solo carga vertical (soloGravedad).
 */
export function nucleoGherkin(o: OpcionesNucleo): Muro[] {
  const e = o.espesor ?? 0.25, lado = o.lado ?? 0.7, out: Muro[] = [];
  const base = (id: string, zHasta: number, areaInf: number, pieza: string): Muro => ({
    id, dir: 'Y', x: 0, y: 0, largo: 1, espesor: 1, llega: true, areaInf, piezaA: pieza, pegadoA: '', piezaB: pieza ? `${pieza} B` : '', pegadoB: '', zHasta,
    ...(pieza ? {} : { soloGravedad: true }),
  });
  for (const [lado_, s] of [['O', 1], ['E', -1]] as const) {
    const sx = (v: VerticePerfil[]) => (s === 1 ? v : v.map(q => ({ x: -q.x, y: q.y })).reverse());
    for (const m of MUROS) {
      const ts = tramos(m);
      ts.forEach(([a, b], i) => {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]), g = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
        const id = `${m.id}${ts.length > 1 ? String.fromCharCode(97 + i) : ''}-${lado_}`;
        // área de losa que carga: 1 m² por metro de muro (supuesto; el resto lo llevan las columnas y el diagrid)
        out.push(ponerPerfil(base(id, AL_39.has(m.id) ? o.z39 : o.z38, Math.round(L * 10) / 10, `Núcleo ${lado_}`), { v: sx(rect((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L, o.espesorDe?.[m.id] ?? e, g)) }));
      });
    }
    for (const [id, x, y, giro, al39] of COLUMNAS) {
      // anillo: unos 18 m² de losa cada una; D y S, 15 m²; P (poste chico), 3 m²
      const area = id.startsWith('R') ? 18 : id === 'P' ? 3 : 15;
      const zH = (id === 'D' || id === 'S') && o.z40 ? o.z40 : al39 ? o.z39 : o.z38;
      out.push(ponerPerfil(base(`${id}-${lado_}`, zH, area, ''), { v: sx(rect(x, y, lado, lado, giro)) }));
    }
  }
  return out;
}

export interface OpcionesRemate {
  /** losa donde arrancan los pozos de los ascensores altos (la transferencia del 21º) */
  z21: number;
  /** losas del 38º, 39º y 40º */
  z38: number; z39: number; z40: number;
}
/**
 * Lo que lleva el entrepiso del 40º (el bar bajo la cúpula), medido en las plantas del 39º y del 40º:
 * - dos pozos de ascensor junto a S (de la transferencia del 21º al 40º; no están en las oficinas bajas);
 * - el ascensor expreso al restaurante (del 38º al 40º);
 * - dos columnas redondas de 0,55 m al norte, bajo el borde del entrepiso (del 39º al 40º);
 * - la escalera caracol que sube al bar: muro curvo de 2,86 m de radio, su cierre norte y el tambor del centro.
 * Arrancan arriba de la fundación, así que quedan fuera del cálculo de viento (llega = false): son cargas de gravedad.
 */
export function remate40(o: OpcionesRemate): Muro[] {
  const out: Muro[] = [];
  const base = (id: string, zDesde: number, zHasta: number, areaInf: number): Muro => ({
    id, dir: 'Y', x: 0, y: 0, largo: 1, espesor: 1, llega: false, areaInf, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '', zDesde, zHasta, soloGravedad: true,
  });
  const muro = (id: string, a: P2, b: P2, e: number, zD: number, zH: number) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), g = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    out.push(ponerPerfil(base(id, zD, zH, Math.round(L * 10) / 10), { v: rect((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L, e, g) }));
  };
  // pozos junto a S (esquinas del eje de los muros, mitad izquierda; la derecha es su espejo)
  const pozo: P2[] = [[-4.43, -1.57], [-2.21, -0.83], [-1.0, -3.86], [-3.36, -4.64]];
  for (const [lado, s] of [['O', 1], ['E', -1]] as const)
    pozo.forEach((q, i) => { const r = pozo[(i + 1) % 4]; muro(`PZ${i + 1}-${lado}`, [s * q[0], q[1]], [s * r[0], r[1]], 0.25, o.z21, o.z40); });
  // ascensor expreso al restaurante
  const asc: P2[] = [[-2.64, 5.07], [-1.14, 5.07], [-1.14, 6.86], [-2.64, 6.86]];
  asc.forEach((q, i) => muro(`AX${i + 1}`, q, asc[(i + 1) % 4], 0.2, o.z38, o.z40));
  // columnas redondas bajo el borde norte del entrepiso
  for (const [lado, s] of [['O', -1], ['E', 1]] as const)
    out.push({ ...base(`CR-${lado}`, o.z39, o.z40, 8), tipo: 'tubo-circ', x: s * 1.0, y: 9.43, largo: 0.55, espesor: 0.275 });
  // escalera caracol: tambor del centro y muro curvo (de 79° a −68°, por el este) con su cierre norte
  const c: P2 = [0.07, 6.21], R = 2.86, e = 0.25, n = 24;
  out.push({ ...base('TC', o.z39, o.z40, 6), tipo: 'tubo-circ', x: c[0], y: c[1], largo: 1.3, espesor: 0.15 });
  const arco = (r: number) => Array.from({ length: n + 1 }, (_, k) => { const t = ((79 - (147 * k) / n) * Math.PI) / 180; return { x: c[0] + r * Math.cos(t), y: c[1] + r * Math.sin(t) }; });
  out.push(ponerPerfil(base('EC1', o.z39, o.z40, 7), { v: [...arco(R - e / 2).reverse(), ...arco(R + e / 2)].reverse() }));
  const cierre: P2[] = [[0.64, 9.07], [0.36, 7.57], [-1.2, 7.3], [-2.64, 6.93]];
  for (let i = 0; i < cierre.length - 1; i++) muro(`EC${i + 2}`, cierre[i], cierre[i + 1], 0.2, o.z39, o.z40);
  return out;
}
