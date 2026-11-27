/**
 * Perfil de la torre (alzado): cómo cambia la planta con la altura, a partir de la losa de un nivel base.
 *
 *  - Una curva de puntos (h, fx, fy, dx, dy) con h de 0 (la losa base) a 1 (la azotea): fx y fy escalan la planta en
 *    x y en y desde su centro, dx y dy la corren (torre inclinada). Entre puntos: tramos rectos o una curva suave que
 *    pasa por todos (spline cúbica monótona: no se pasa de los valores de los puntos, sin «panzas» de más).
 *  - Un giro total (grados) que se reparte con la altura: torre retorcida.
 *
 * Cada losa de arriba de la base queda escrita (silueta, y B y L de su caja), como los lofts: la planilla, el Excel,
 * el 3D y los avisos leen lo mismo. Se vuelve a aplicar en cada cambio (estado.cambiar), antes que los lofts: un loft
 * manda sobre los niveles que genera.
 *
 * La carpintería que sigue a la losa: en todos los niveles, el contorno de la losa desfasado hacia adentro.
 */
import type { Proyecto } from './modelo';
import { desfasarAnillo, escalarAnillo, girarAnillo } from './contorno';
import { cajaSilueta, medidasAlViento, plantaDeNivel, puntosSilueta, type Vertice } from './silueta';

export interface PuntoPerfil { h: number; fx: number; fy?: number | null; dx?: number | null; dy?: number | null }
export interface PerfilTorre {
  /** cota de la losa base (la que da la forma; vacío = PB) */
  base?: number | null;
  puntos: PuntoPerfil[];
  /** curva suave entre los puntos (vacío = tramos rectos) */
  suave?: boolean | null;
  /** giro total de la base a la azotea (grados, antihorario) */
  giro?: number | null;
  /** escribir B y L de la caja en cada losa (vacío = sí) */
  bl?: boolean | null;
  /** con qué se escriben B y L: la caja de la losa (vacío) o un rectángulo de igual área (plantas curvas) */
  blCriterio?: 'caja' | 'area' | null;
  /**
   * formas por tramos: desde la cota «desde» hacia arriba (hasta la forma siguiente), el perfil escala, gira y corre esta
   * planta en vez de la losa base. La silueta está como queda en su cota (el perfil la sigue cambiando de ahí para arriba
   * en la misma proporción). Sirve para un cambio de planta en altura (los pozos de luz del Gherkin del 2º al 30º y el
   * círculo entero arriba) y, con dos formas seguidas, para la excepción de un solo piso
   */
  formas?: FormaTramo[] | null;
}
export interface FormaTramo { desde: number; silueta: Vertice[] }

export const PERFILES: { id: string; nombre: string; texto: string; p: Omit<PerfilTorre, 'base'> }[] = [
  { id: 'recta', nombre: 'Recta', texto: 'La misma planta en toda la altura.', p: { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 1 }] } },
  { id: 'ahusada', nombre: 'Ahusada', texto: 'Se afina hacia arriba: arriba, el 60 % del ancho de la base.', p: { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 0.6 }] } },
  { id: 'aguja', nombre: 'Aguja', texto: 'Curva que se cierra arriba, como un obelisco suave.', p: { suave: true, puntos: [{ h: 0, fx: 1 }, { h: 0.6, fx: 0.85 }, { h: 1, fx: 0.4 }] } },
  { id: 'barril', nombre: 'Barril', texto: 'Más ancha en el medio (115 %).', p: { suave: true, puntos: [{ h: 0, fx: 1 }, { h: 0.5, fx: 1.15 }, { h: 1, fx: 0.9 }] } },
  { id: 'reloj', nombre: 'Reloj de arena', texto: 'Se angosta en el medio (75 %) y se abre arriba.', p: { suave: true, puntos: [{ h: 0, fx: 1 }, { h: 0.5, fx: 0.75 }, { h: 1, fx: 1 }] } },
  { id: 'escalonada', nombre: 'Escalonada', texto: 'Tres escalones con terrazas: 100 %, 85 % y 70 %.', p: { puntos: [{ h: 0, fx: 1 }, { h: 0.33, fx: 1 }, { h: 0.34, fx: 0.85 }, { h: 0.66, fx: 0.85 }, { h: 0.67, fx: 0.7 }, { h: 1, fx: 0.7 }] } },
  { id: 'retorcida', nombre: 'Retorcida', texto: 'La misma planta girada 90° de la base a la azotea.', p: { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 1 }], giro: 90 } },
  { id: 'inclinada', nombre: 'Inclinada', texto: 'Se corre 4 m en x hacia arriba, sin cambiar de tamaño.', p: { puntos: [{ h: 0, fx: 1, dx: 0 }, { h: 1, fx: 1, dx: 4 }] } },
];

/** pendientes de la spline cúbica monótona (Fritsch y Carlson) para los valores ys en xs */
function pendientes(xs: number[], ys: number[]): number[] {
  const n = xs.length, d = xs.slice(0, -1).map((x, i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - x || 1e-12));
  const m = xs.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(d[i]) < 1e-12) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return m;
}
/** valor de la curva en h: recta entre puntos o spline monótona */
function curva(xs: number[], ys: number[], h: number, suave: boolean): number {
  const n = xs.length;
  if (n === 1) return ys[0];
  if (h <= xs[0]) return ys[0];
  if (h >= xs[n - 1]) return ys[n - 1];
  let k = 0; while (k < n - 2 && h > xs[k + 1]) k++;
  const dx = xs[k + 1] - xs[k], t = dx > 0 ? (h - xs[k]) / dx : 0;
  if (!suave) return ys[k] + (ys[k + 1] - ys[k]) * t;
  const m = pendientes(xs, ys), t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * dx * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * dx * m[k + 1];
}
/** factores y corrimientos del perfil a la altura relativa h (0 = base, 1 = azotea) */
export function valorPerfil(pf: PerfilTorre, h: number): { fx: number; fy: number; dx: number; dy: number; giro: number } {
  const ps = [...pf.puntos].sort((a, b) => a.h - b.h), xs = ps.map(q => q.h), s = !!pf.suave;
  return {
    fx: curva(xs, ps.map(q => q.fx), h, s),
    fy: curva(xs, ps.map(q => q.fy ?? q.fx), h, s),
    dx: curva(xs, ps.map(q => q.dx ?? 0), h, s),
    dy: curva(xs, ps.map(q => q.dy ?? 0), h, s),
    giro: (pf.giro ?? 0) * Math.max(0, Math.min(1, h)),
  };
}

/** la planta base transformada: escala (x e y) desde su centro, giro y corrimiento */
export function transformarPlanta(v: Vertice[], fx: number, fy: number, dx: number, dy: number, giro: number): Vertice[] {
  const c = cajaSilueta(v), cen = { x: c.cx, y: c.cy };
  let w: Vertice[];
  if (Math.abs(fx - fy) < 1e-9) w = escalarAnillo(v, fx, cen) as Vertice[];
  else {
    // escala distinta en x y en y: los arcos dejan de ser arcos (pasan a elipse), así que se toman como puntos
    const pts = v.some(q => q.b) ? puntosSilueta(v, 6).map(q => ({ x: q.x, y: q.y })) as Vertice[] : v;
    const f = (q: { x: number; y: number }) => ({ x: cen.x + (q.x - cen.x) * fx, y: cen.y + (q.y - cen.y) * fy });
    w = pts.map(q => ({ ...f(q), ...(q.c1 && q.c2 ? { c1: f(q.c1), c2: f(q.c2) } : {}) }));
  }
  if (Math.abs(giro) > 1e-9) w = girarAnillo(w, giro, cen) as Vertice[];
  if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) w = w.map(q => ({ ...q, x: q.x + dx, y: q.y + dy, ...(q.c1 && q.c2 ? { c1: { x: q.c1.x + dx, y: q.c1.y + dy }, c2: { x: q.c2.x + dx, y: q.c2.y + dy } } : {}) }));
  return w.map(q => ({ ...q, x: +q.x.toFixed(4), y: +q.y.toFixed(4) }));
}

/** índice del nivel base del perfil (vacío = PB) */
export function nivelBase(p: Proyecto, pf: PerfilTorre): number {
  const iPB = p.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1);
  if (pf.base === null || pf.base === undefined) return iPB;
  const i = p.niveles.findIndex(n => Math.abs(n.cota - pf.base!) < 1e-6);
  return i >= 0 ? i : iPB;
}

/** escribe en las losas de arriba de la base la planta del perfil; devuelve cuántas */
export function aplicarPerfil(p: Proyecto): number {
  const pf = p.perfilTorre;
  if (!pf || pf.puntos.length < 1) return 0;
  const ib = nivelBase(p, pf);
  if (ib < 0) return 0;
  const nb = p.niveles[ib];
  // la base queda con silueta propia (si heredaba la de arriba, se copia antes de tocar los niveles de arriba)
  if (!nb.silueta || nb.silueta.length < 3) nb.silueta = plantaDeNivel(p, ib).silueta.map(q => ({ ...q }));
  const base = nb.silueta as Vertice[], z0 = nb.cota, z1 = p.niveles[0].cota;
  if (z1 <= z0 + 1e-6) return 0;
  let n = 0;
  // formas por tramos (las de arriba de la base), de abajo hacia arriba
  const formas = [...(pf.formas ?? [])].filter(f => f.desde > z0 + 1e-6 && f.silueta?.length >= 3).sort((a, b) => a.desde - b.desde);
  p.niveles.forEach((nv, i) => {
    if (i >= ib || nv.manual) return;                          // solo los de arriba de la base, y no los editados a mano
    const h = (nv.cota - z0) / (z1 - z0), v = valorPerfil(pf, h);
    if (!(v.fx > 0.02 && v.fy > 0.02)) return;
    // la forma que rige en esta cota: la última que empieza en ella o más abajo; el perfil la cambia desde su cota
    const fo = [...formas].reverse().find(f => f.desde <= nv.cota + 1e-6);
    let s: Vertice[];
    if (fo) {
      const v0 = valorPerfil(pf, (fo.desde - z0) / (z1 - z0));
      s = transformarPlanta(fo.silueta, v.fx / v0.fx, v.fy / v0.fy, v.dx - v0.dx, v.dy - v0.dy, v.giro - v0.giro);
    } else s = transformarPlanta(base, v.fx, v.fy, v.dx, v.dy, v.giro);
    nv.silueta = s;
    if (pf.bl ?? true) { const c = medidasAlViento(s, pf.blCriterio ?? 'caja'); nv.B = +c.B.toFixed(2); nv.L = +c.L.toFixed(2); }
    n++;
  });
  return n;
}

/** carpintería de cada nivel = su losa desfasada hacia adentro p.carpinteriaRetiro metros (0 = el borde de la losa) */
export function aplicarCarpinteria(p: Proyecto): number {
  const d = p.carpinteriaRetiro;
  if (d === null || d === undefined || !(d >= 0)) return 0;
  let n = 0;
  p.niveles.forEach((nv, i) => {
    if (nv.cota < -1e-6) return;                              // subsuelos: sin fachada
    const s = plantaDeNivel(p, i).silueta;
    const c = d > 0 ? desfasarAnillo(s, -d) : s.map(q => ({ ...q }));
    if ('error' in c) return;
    nv.carpinteria = (c as Vertice[]).map(q => ({ ...q }));
    n++;
  });
  return n;
}

/**
 * Perfil desde una tabla de alturas (pegada de Excel o de un texto): cada fila, la cota (m sobre PB) y el ancho (o el
 * diámetro) a esa altura; con tres columnas, el ancho en x y en y; con cinco, además el corrimiento x e y (m, torre
 * inclinada). Separadas por tabulador, punto y coma o espacios; la coma decimal vale. Las filas que no son números (los
 * títulos) se saltean. Los anchos se toman en proporción al de la cota de la losa base (interpolado en la tabla), así que
 * la losa base da el tamaño y la tabla, la forma. Tramos rectos entre filas (con muchas filas sigue la curva tal cual).
 */
export function perfilDesdeTabla(texto: string, zBase: number, zTop: number): { puntos: PuntoPerfil[]; filas: number; fuera: number; error?: string; avisos: string[] } {
  const filas: number[][] = [], avisos: string[] = [];
  let primeraUtil = true;
  texto.split(/\r?\n/).forEach((linea, k) => {
    const t = linea.trim();
    if (!t) return;
    const celdas = (t.includes('\t') ? t.split('\t') : t.includes(';') ? t.split(';') : t.split(/\s+/)).map(c => c.trim()).filter(c => c !== '');
    const nums = celdas.map(c => Number(c.replace(/\s/g, '').replace(',', '.')));
    if (nums.length < 2 || nums.some(x => !Number.isFinite(x))) {
      // la primera fila con texto es el título; las demás que no se pueden leer, se avisan con su número
      if (!(primeraUtil && !filas.length)) avisos.push(`Fila ${k + 1} («${t.length > 30 ? t.slice(0, 29) + '…' : t}»): no son números, se saltea.`);
      primeraUtil = false;
      return;
    }
    primeraUtil = false;
    filas.push(nums);
  });
  if (filas.length < 2) return { puntos: [], filas: filas.length, fuera: 0, avisos, error: 'Hacen falta por lo menos dos filas con cota y ancho.' };
  if (!(zTop > zBase)) return { puntos: [], filas: filas.length, fuera: 0, avisos, error: 'La losa base tiene que estar debajo de la azotea.' };
  // filas con la misma cota: queda la última (la tabla no puede tener dos anchos a la misma altura)
  const porCota = new Map<number, number[]>();
  filas.forEach(f => { const c = Math.round(f[0] * 1e4) / 1e4; if (porCota.has(c)) avisos.push(`La cota ${String(c).replace('.', ',')} m está dos veces: queda la última fila.`); porCota.set(c, f); });
  filas.length = 0; filas.push(...porCota.values());
  if (filas.length < 2) return { puntos: [], filas: filas.length, fuera: 0, avisos, error: 'Hacen falta por lo menos dos cotas distintas.' };
  filas.sort((a, b) => a[0] - b[0]);
  if (filas.some(f => !(f[1] > 0) || (f.length >= 3 && !(f[2] > 0)))) return { puntos: [], filas: filas.length, fuera: 0, avisos, error: 'Los anchos tienen que ser mayores que cero.' };
  // el valor de una columna a la cota z (interpolado; fuera de la tabla, el del extremo)
  const en = (col: number, z: number) => {
    const v = (f: number[]) => (col < f.length ? f[col] : col === 2 ? f[1] : 0);
    if (z <= filas[0][0]) return v(filas[0]);
    if (z >= filas[filas.length - 1][0]) return v(filas[filas.length - 1]);
    const k = filas.findIndex(f => f[0] >= z), a = filas[k - 1], b = filas[k], t = (z - a[0]) / (b[0] - a[0]);
    return v(a) + (v(b) - v(a)) * t;
  };
  const ax0 = en(1, zBase), ay0 = en(2, zBase), dx0 = en(3, zBase), dy0 = en(4, zBase);
  const dentro = filas.filter(f => f[0] >= zBase - 1e-6 && f[0] <= zTop + 1e-6);
  const fuera = filas.length - dentro.length;
  if (fuera) avisos.push(`${fuera} ${fuera === 1 ? 'fila queda' : 'filas quedan'} fuera de la torre (de ${String(+zBase.toFixed(2)).replace('.', ',')} a ${String(+zTop.toFixed(2)).replace('.', ',')} m): no se usan.`);
  if (filas[0][0] > zBase + 1e-6) avisos.push('La tabla empieza más arriba que la losa base: hasta su primera fila, el ancho es el de esa fila.');
  if (filas[filas.length - 1][0] < zTop - 1e-6) avisos.push('La tabla termina más abajo que la azotea: arriba de su última fila, el ancho es el de esa fila.');
  // la base y la azotea siempre (interpoladas si la tabla no tiene esas cotas justas)
  const cotas = [...new Set([zBase, ...dentro.map(f => f[0]), zTop])].sort((a, b) => a - b);
  const r4 = (x: number) => +x.toFixed(4);
  const puntos: PuntoPerfil[] = cotas.map(z => {
    const fx = en(1, z) / ax0, fy = en(2, z) / ay0, dx = en(3, z) - dx0, dy = en(4, z) - dy0;
    return { h: r4((z - zBase) / (zTop - zBase)), fx: r4(fx), ...(Math.abs(fy - fx) > 1e-6 ? { fy: r4(fy) } : {}), ...(Math.abs(dx) > 1e-6 ? { dx: r4(dx) } : {}), ...(Math.abs(dy) > 1e-6 ? { dy: r4(dy) } : {}) };
  });
  return { puntos, filas: filas.length, fuera, avisos };
}

/**
 * El camino inverso: el perfil como tabla (cota, ancho en x, ancho en y, corrimiento x, corrimiento y), una fila por losa
 * de la base a la azotea, separada por tabuladores para pegar en Excel. Los anchos son los de la caja de la losa base
 * por el factor del perfil; leída con perfilDesdeTabla da el mismo perfil (en tramos rectos, en esas cotas).
 */
export function tablaDesdePerfil(p: Proyecto, pf: PerfilTorre): string {
  const ib = nivelBase(p, pf), zb = p.niveles[ib]?.cota ?? 0, zt = p.niveles[0]?.cota ?? 0;
  const base = cajaSilueta(plantaDeNivel(p, ib).silueta);
  const n = (x: number, d = 3) => String(+x.toFixed(d)).replace('.', ',');
  const filas = p.niveles.slice(0, ib + 1).map(nv => nv.cota).filter(z => z >= zb - 1e-6).sort((a, b) => a - b).map(z => {
    const v = valorPerfil(pf, zt > zb ? (z - zb) / (zt - zb) : 0);
    return [n(z, 2), n(base.B * v.fx), n(base.L * v.fy), n(v.dx), n(v.dy)].join('\t');
  });
  return ['cota (m)\tancho en x (m)\tancho en y (m)\tcorrimiento x (m)\tcorrimiento y (m)', ...filas].join('\n');
}
