/**
 * Calados (aberturas) en elementos continuos: tabiques, tubos rectangulares (núcleos) y tubos circulares.
 *
 * El elemento NO se parte: sigue siendo uno solo (se dibuja entero en la planta) y en cada piso tiene sus aberturas,
 * puertas (desde el piso) o ventanas (con antepecho), de un ancho y un alto. Entre una abertura y la del piso de arriba
 * queda el dintel (y abajo el antepecho), que ata los dos lados: el elemento trabaja entero.
 *
 * Para el cálculo vale la sección más débil: el corte horizontal que pasa por más aberturas a la vez. Ahí la sección son
 * los pedazos que quedan (con su Steiner respecto del baricentro de todo el elemento): ese J es el que se usa en la hoja J
 * (con el rectángulo equivalente), en la sección real, en la rigidez y en la flexocompresión.
 */
import type { Muro } from './modelo';
import { tipoDe, dInterior } from './modelo';

export type P = { x: number; y: number };
/** cara de un tubo rectangular (la del lado +x, −x, +y o −y) */
export type CaraTubo = 'x+' | 'x-' | 'y+' | 'y-';
export interface Abertura {
  /**
   * dónde está el centro de la abertura: tabique, a lo largo de su eje desde su centro (m); tubo rectangular, a lo
   * largo de la cara desde el medio de la cara (m); tubo circular, ángulo del centro de la abertura (grados, 0 = +x,
   * antihorario)
   */
  s: number;
  /** ancho (m; en el tubo circular, medido sobre el círculo medio de la pared) */
  ancho: number;
  /** altura del borde de abajo sobre el piso (0 = puerta) y alto de la abertura (m) */
  desde: number; alto: number;
  /** tubo rectangular: en qué cara está */
  cara?: CaraTubo;
}

const EPS = 1e-9;

/** las aberturas que corta un plano horizontal a la altura h sobre el piso */
const activasEn = (ab: Abertura[], h: number) => ab.filter(a => a.desde <= h + EPS && h < a.desde + a.alto - EPS);

/** altura sobre el piso del corte más débil: la que pasa por más ancho de aberturas a la vez */
export function alturaCorteDebil(m: Muro): number | null {
  const ab = m.aberturas ?? [];
  if (!ab.length) return null;
  const cand = [...new Set(ab.flatMap(a => [a.desde + 1e-4, a.desde + a.alto / 2]))];
  let mejor = cand[0], ancho = -1;
  cand.forEach(h => { const w = activasEn(ab, h).reduce((s, a) => s + a.ancho, 0); if (w > ancho + 1e-9) { ancho = w; mejor = h; } });
  return mejor;
}

/** intervalos sólidos de [a, b] quitando los huecos (cada hueco [c − w/2, c + w/2]) */
function restar(a: number, b: number, huecos: { c: number; w: number }[]): [number, number][] {
  const hs = huecos.map(hh => [Math.max(a, hh.c - hh.w / 2), Math.min(b, hh.c + hh.w / 2)] as [number, number]).filter(([u, v]) => v > u + EPS).sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  let x = a;
  hs.forEach(([u, v]) => { if (u > x + EPS) out.push([x, u]); x = Math.max(x, v); });
  if (b > x + EPS) out.push([x, b]);
  return out;
}
const rect = (cx: number, cy: number, ax: number, ay: number): P[] => [{ x: cx - ax / 2, y: cy - ay / 2 }, { x: cx + ax / 2, y: cy - ay / 2 }, { x: cx + ax / 2, y: cy + ay / 2 }, { x: cx - ax / 2, y: cy + ay / 2 }];

/** caras de un tubo rectangular: rectángulo de cada cara y su eje (a lo largo de x o de y) */
function carasTubo(m: Muro): { cara: CaraTubo; cx: number; cy: number; L: number; e: number; enX: boolean }[] {
  const B = m.largo, H = m.ladoY ?? m.largo, e = Math.min(m.espesor, B / 2, H / 2);
  return [
    { cara: 'y+', cx: m.x, cy: m.y + H / 2 - e / 2, L: B, e, enX: true }, { cara: 'y-', cx: m.x, cy: m.y - H / 2 + e / 2, L: B, e, enX: true },
    { cara: 'x-', cx: m.x - B / 2 + e / 2, cy: m.y, L: H - 2 * e, e, enX: false }, { cara: 'x+', cx: m.x + B / 2 - e / 2, cy: m.y, L: H - 2 * e, e, enX: false },
  ];
}

/** anillo (o sector de anillo) del tubo circular entre los ángulos t0 y t1 (radianes, antihorario), como polígono */
function sectorAnillo(cx: number, cy: number, R: number, r: number, t0: number, t1: number): P[] {
  const n = Math.max(4, Math.ceil(((t1 - t0) / (2 * Math.PI)) * 64));
  const ext = Array.from({ length: n + 1 }, (_, i) => { const t = t0 + ((t1 - t0) * i) / n; return { x: cx + R * Math.cos(t), y: cy + R * Math.sin(t) }; });
  const int = r > 1e-6 ? Array.from({ length: n + 1 }, (_, i) => { const t = t1 - ((t1 - t0) * i) / n; return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) }; }) : [{ x: cx, y: cy }];
  return [...ext, ...int];
}

/**
 * Pedazos sólidos del elemento en un corte horizontal a la altura h sobre el piso (polígonos en planta). Sin aberturas
 * cortadas, el elemento entero.
 */
export function solidosEnAltura(m: Muro, h: number): P[][] {
  const t = tipoDe(m), ab = activasEn(m.aberturas ?? [], h);
  if (t === 'tabique') {
    const L = m.largo, e = m.espesor;
    return restar(-L / 2, L / 2, ab.map(a => ({ c: a.s, w: a.ancho }))).map(([u, v]) =>
      m.dir === 'X' ? rect(m.x + (u + v) / 2, m.y, v - u, e) : rect(m.x, m.y + (u + v) / 2, e, v - u));
  }
  if (t === 'tubo-rect') {
    return carasTubo(m).flatMap(c => restar(-c.L / 2, c.L / 2, ab.filter(a => (a.cara ?? 'y-') === c.cara).map(a => ({ c: a.s, w: a.ancho }))).map(([u, v]) =>
      c.enX ? rect(c.cx + (u + v) / 2, c.cy, v - u, c.e) : rect(c.cx, c.cy + (u + v) / 2, c.e, v - u)));
  }
  if (t === 'tubo-circ') {
    const R = m.largo / 2, r = dInterior(m) / 2, rm = (R + r) / 2 || R / 2;
    if (!ab.length) return [sectorAnillo(m.x, m.y, R, r, 0, 2 * Math.PI)];
    // huecos en ángulo: el ancho medido sobre el círculo medio de la pared
    const hs = ab.map(a => { const c = (a.s * Math.PI) / 180, w = Math.min(2 * Math.PI - 1e-3, a.ancho / rm); return [c - w / 2, c + w / 2] as [number, number]; })
      .map(([u, v]) => { const k = Math.floor(u / (2 * Math.PI)); return [u - 2 * Math.PI * k, v - 2 * Math.PI * k] as [number, number]; }).sort((p, q) => p[0] - q[0]);
    // recorrer el círculo desde el final del primer hueco
    const out: P[][] = [];
    for (let i = 0; i < hs.length; i++) {
      const fin = hs[i][1], sig = i + 1 < hs.length ? hs[i + 1][0] : hs[0][0] + 2 * Math.PI;
      if (sig > fin + 1e-6) out.push(sectorAnillo(m.x, m.y, R, r, fin, sig));
    }
    return out;
  }
  return [];
}

/** pedazos sólidos en la sección más débil (o null si el elemento no tiene aberturas) */
export function seccionDebil(m: Muro): P[][] | null {
  const h = alturaCorteDebil(m);
  return h === null ? null : solidosEnAltura(m, h);
}

/** área, baricentro y momentos de inercia (respecto de ejes por su baricentro, paralelos a x e y) de polígonos */
export function propsPoligonos(pgs: P[][]): { A: number; xg: number; yg: number; Jx: number; Jy: number } {
  // los polígonos pueden venir en cualquier sentido: se usa el valor absoluto por polígono
  let Aa = 0, sx = 0, sy = 0, ix = 0, iy = 0;
  pgs.forEach(pg => {
    let a = 0, Sx1 = 0, Sy1 = 0, Ix1 = 0, Iy1 = 0;
    for (let i = 0; i < pg.length; i++) {
      const p = pg[i], q = pg[(i + 1) % pg.length], c = p.x * q.y - q.x * p.y;
      a += c / 2; Sx1 += ((p.x + q.x) * c) / 6; Sy1 += ((p.y + q.y) * c) / 6;
      Ix1 += ((p.y * p.y + p.y * q.y + q.y * q.y) * c) / 12; Iy1 += ((p.x * p.x + p.x * q.x + q.x * q.x) * c) / 12;
    }
    const sg = Math.sign(a) || 1;
    Aa += a * sg; sx += Sx1 * sg; sy += Sy1 * sg; ix += Ix1 * sg; iy += Iy1 * sg;
  });
  if (!(Aa > 0)) return { A: 0, xg: 0, yg: 0, Jx: 0, Jy: 0 };
  const xg = sx / Aa, yg = sy / Aa;
  return { A: Aa, xg, yg, Jx: ix - Aa * yg * yg, Jy: iy - Aa * xg * xg };
}

/**
 * Prismas del elemento en un piso (de z0 a z1) para el 3D: el elemento con sus aberturas, el antepecho debajo y el
 * dintel arriba de cada una. Cada prisma: su planta y sus cotas.
 */
export function prismasCalados(m: Muro, z0: number, z1: number): { pol: P[]; za: number; zb: number }[] {
  const ab = (m.aberturas ?? []).filter(a => a.ancho > 0 && a.alto > 0);
  if (!ab.length) return [];
  const hPiso = z1 - z0;
  // cortes en altura: los bordes de las aberturas; entre dos cortes, la planta es constante
  const cortes = [...new Set([0, hPiso, ...ab.flatMap(a => [Math.min(hPiso, a.desde), Math.min(hPiso, a.desde + a.alto)])])].filter(h => h >= -EPS && h <= hPiso + EPS).sort((a, b) => a - b);
  const out: { pol: P[]; za: number; zb: number }[] = [];
  for (let i = 0; i + 1 < cortes.length; i++) {
    const ha = cortes[i], hb = cortes[i + 1];
    if (hb - ha < 1e-6) continue;
    solidosEnAltura(m, (ha + hb) / 2).forEach(pol => out.push({ pol, za: z0 + ha, zb: z0 + hb }));
  }
  return out;
}

/** dónde va una abertura tocando el elemento en el punto q de la planta: posición, cara (tubo) o ángulo (circular) */
export function ubicarAbertura(m: Muro, q: P): { s: number; cara?: CaraTubo } | null {
  const t = tipoDe(m);
  if (t === 'tabique') return { s: m.dir === 'X' ? q.x - m.x : q.y - m.y };
  if (t === 'tubo-circ') return { s: (((Math.atan2(q.y - m.y, q.x - m.x) * 180) / Math.PI) + 360) % 360 };
  if (t === 'tubo-rect') {
    const cs = carasTubo(m);
    const d = (c: (typeof cs)[number]) => (c.enX ? Math.abs(q.y - c.cy) : Math.abs(q.x - c.cx));
    const c = [...cs].sort((a, b) => d(a) - d(b))[0];
    return { s: c.enX ? q.x - c.cx : q.y - c.cy, cara: c.cara };
  }
  return null;
}

/** ¿entra la abertura? (no sale del elemento ni se pisa con otra en la misma cara y altura) */
export function problemaAbertura(m: Muro, a: Abertura, hPiso: number): string | null {
  const t = tipoDe(m);
  if (!(a.ancho > 0) || !(a.alto > 0)) return 'el ancho y el alto tienen que ser mayores que cero';
  if (a.desde < 0 || a.desde + a.alto > hPiso + 1e-6) return `la abertura sale del piso (entrepiso de ${hPiso.toFixed(2).replace('.', ',')} m): bajá el alto o el antepecho`;
  if (a.desde + a.alto >= hPiso - 1e-6) return 'sin dintel la abertura corta el elemento en toda la altura: usá «hueco de toda la altura» (el muro queda en dos)';
  const borde = 0.1;
  if (t === 'tabique' && (Math.abs(a.s) + a.ancho / 2 > m.largo / 2 - borde)) return `no entra: el muro mide ${m.largo.toFixed(2).replace('.', ',')} m y tiene que quedar al menos ${borde} m de cada lado`;
  if (t === 'tubo-rect') {
    const c = carasTubo(m).find(x => x.cara === (a.cara ?? 'y-'))!;
    if (Math.abs(a.s) + a.ancho / 2 > c.L / 2 - borde) return `no entra en la cara: mide ${c.L.toFixed(2).replace('.', ',')} m`;
  }
  if (t === 'tubo-circ') {
    const R = m.largo / 2, r = dInterior(m) / 2, rm = (R + r) / 2 || R / 2;
    if (a.ancho > Math.PI * rm) return 'la abertura no puede pasar media vuelta del tubo';
  }
  const otras = (m.aberturas ?? []).filter(o => o !== a && (o.cara ?? '') === (a.cara ?? ''));
  const pisa = otras.some(o => Math.abs(o.s - a.s) < (o.ancho + a.ancho) / 2 && o.desde < a.desde + a.alto && a.desde < o.desde + o.alto);
  return pisa ? 'se pisa con otra abertura' : null;
}
