/**
 * Ficha M, «Malla sobre la fachada»: el exoesqueleto dibujado sobre la fachada real de cada nivel, sea cual sea su forma
 * (cilindro, elipse, polígono, curvas, una torre que se angosta, se corre o cambia de planta). Es la herramienta para
 * los edificios donde las cuatro caras planas de las otras fichas no existen (30 St Mary Axe, torres cilíndricas).
 *
 * Geometría. En cada «anillo» (los bordes de los módulos y, en el diagrid, también la mitad de cada módulo) se reparten
 * N nudos a lo largo del contorno de la fachada de ese nivel (corrido «separación» m hacia afuera), por largo de arco.
 * Con «nudos en las esquinas», cada esquina de la planta es un nudo y los demás se reparten por los lados. Patrones:
 *  - diagrid: en cada anillo los nudos van corridos medio paso respecto del de abajo; cada nudo sube con dos diagonales
 *    a los dos nudos vecinos del anillo de arriba (rombos), como el de 30 St Mary Axe;
 *  - columnas y cruces: columnas que siguen la fachada de anillo en anillo y, en cada paño, una cruz de San Andrés.
 * Los anillos (vigas horizontales) se dibujan y se pesan; en el modelo la losa rígida de cada piso hace su trabajo, y
 * después se verifican con el empuje hacia afuera de las diagonales en sus nudos (fuerzasAnillos).
 * Con las losas atadas en cada piso (por defecto), cada barra tiene un nudo en cada piso que cruza y es continua ahí.
 *
 * Cálculo por proyección, exacto con las hipótesis de la app. Las losas son diafragmas rígidos: en cada piso todos los
 * nudos se corren u en el sentido del viento y nada de costado (sin giro de la planta, que la app calcula aparte). Con
 * el corrimiento de costado nulo, una barra articulada del espacio se comporta en el plano del viento (s, z) igual que
 * una barra plana entre las proyecciones de sus nudos si su área es A' = A·(L₂/L)³ (L: largo real; L₂: largo
 * proyectado): el estiramiento real es δ = (Δs·Δu + Δz·Δw)/L y la del plano δ' = δ·L/L₂, y las dos dan la misma
 * rigidez. La fuerza real de la barra es N = N'·L/L₂. Así la malla entera entra como una cara más a la cuenta de
 * siempre (tabiques + exo, condensada a los pisos) y a la verificación del CIRSOC 301 con su largo y su fuerza reales.
 * Las barras horizontales y perpendiculares al viento (L₂ = 0) no trabajan con ese viento. Las columnas pueden ser
 * continuas (rígidas): su flexión en el plano del viento es exacta si son verticales y aproximada si se inclinan.
 * El peso propio de las barras y las losas que apoyan en la malla entran como cargas en los nudos.
 */
import type { Proyecto } from './modelo';
import { contornoAlViento, plantaDeNivel, puntosSilueta, type Punto } from './silueta';
import type { Barra, Cara, ClaseBarra, ExoDef, Nudo, Seccion } from './exo';

export type PatronMalla = 'diagrid' | 'columnas' | 'hexagrid';
export interface MallaDef {
  patron: PatronMalla;
  /** nudos por anillo (en toda la vuelta) */
  nudos: number;
  /** cada esquina de la planta es un nudo (los demás se reparten por los lados); por defecto sí */
  esquinas?: boolean;
  /** la malla gira esta cantidad de grados por módulo (torres que se retuercen); por defecto 0 */
  giro?: number;
  /** la malla llega hasta esta cota; arriba, sin exo (una cúpula de vidrio, una corona) */
  hasta?: number | null;
  /**
   * las losas se atan a la malla en cada piso que cruza (como en el Gherkin y el Hearst): cada barra tiene un nudo en
   * cada piso, ahí recibe la losa y el viento de ese piso y pandea de piso a piso. Por defecto sí; sin esto, los pisos
   * entre anillos solo los sostienen los tabiques (y si arriba no hay, quedan sueltos)
   */
  arriostrada?: boolean;
  /**
   * nudos por anillo arriba (densidad variable): de «nudos» en la base a este número en el último anillo, en línea recta
   * con la altura; vacío = los mismos en toda la altura
   */
  nudosArriba?: number;
  /** barras sacadas a mano (su clave: claveBarra), por ejemplo para abrir una entrada en planta baja */
  sacadas?: string[];
}
/** tope de nudos por anillo: con más, el cálculo se vuelve lento y las barras más cortas que un piso */
export const NUDOS_MAX = 96;
/** separación mínima entre los nudos de un anillo (m): en una cúpula que se cierra, los de arriba llevan menos nudos */
export const SEPARACION_MIN = 1;
export const MALLA_POR_DEFECTO: MallaDef = { patron: 'diagrid', nudos: 16, esquinas: true };
export const PATRONES_MALLA: Record<PatronMalla, { nombre: string; texto: string }> = {
  diagrid: { nombre: 'Diagrid', texto: 'Rombos de diagonales sobre la fachada, sin columnas: cada anillo corrido medio paso respecto del de abajo (30 St Mary Axe).' },
  columnas: { nombre: 'Columnas y cruces', texto: 'Columnas que siguen la fachada de anillo en anillo y una cruz de San Andrés en cada paño.' },
  hexagrid: { nombre: 'Hexagrid', texto: 'Panal de hexágonos sobre la fachada: una capa de diagonales y una de montantes, alternadas. Más abierto y liviano a la vista que el diagrid, pero menos rígido: trabaja en parte por flexión de los nudos.' },
};

export interface NudoMalla {
  x: number; y: number; z: number;
  /** índice de la cota en zs (piso del modelo) y anillo (−1: un nudo de una barra en un piso entre anillos) */
  k: number; anillo: number;
  /** posición en la vuelta (0 a 1, desde el arranque) y metros de fachada que le tocan */
  t: number; trib: number;
}
export interface BarraMalla {
  clase: ClaseBarra | 'anillo'; a: number; b: number;
  /** la barra entera de anillo a anillo a la que pertenece (sus tramos entre pisos tienen la misma): para sacarla a mano */
  clave?: string;
}
export interface MallaGeo {
  nudos: NudoMalla[]; barras: BarraMalla[];
  /** índices de zs de los anillos, de abajo arriba */
  anillos: number[];
  /** perímetro del borde de la losa en cada cota de zs (m), para la franja de losa que apoya en la malla */
  perimetro: number[];
  /** centro de la planta de PB (las posiciones s del modelo se miden desde acá) */
  cx: number; cy: number;
  /** las barras sacadas a mano (entre nudos que siguen en la malla), para dibujarlas */
  quitadas?: BarraMalla[];
}

// ------------------------------------------------------------------ contorno: orientación, corrimiento y esquinas
const areaPol = (q: Punto[]) => q.reduce((s, a, i) => { const b = q[(i + 1) % q.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
const perimetroPol = (q: Punto[]) => q.reduce((s, a, i) => s + Math.hypot(q[(i + 1) % q.length].x - a.x, q[(i + 1) % q.length].y - a.y), 0);
/** el contorno sin puntos repetidos y en sentido antihorario */
function limpio(q0: Punto[]): Punto[] {
  const q = q0.filter((a, i) => { const b = q0[(i + 1) % q0.length]; return Math.hypot(b.x - a.x, b.y - a.y) > 1e-6; });
  return areaPol(q) < 0 ? q.reverse() : q;
}
/** el contorno corrido d m hacia afuera (esquinas en inglete, con tope) */
export function corrido(q: Punto[], d: number): Punto[] {
  if (Math.abs(d) < 1e-9) return q;
  const n = q.length;
  return q.map((p, i) => {
    const a = q[(i - 1 + n) % n], b = q[(i + 1) % n];
    const n1 = normal(a, p), n2 = normal(p, b);
    let mx = n1.x + n2.x, my = n1.y + n2.y; const lm = Math.hypot(mx, my) || 1; mx /= lm; my /= lm;
    const cos = Math.max(0.33, mx * n1.x + my * n1.y);
    return { x: p.x + (mx * d) / cos, y: p.y + (my * d) / cos };
  });
}
/** normal hacia afuera del lado a → b de un contorno antihorario */
function normal(a: Punto, b: Punto) { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return { x: dy / l, y: -dx / l }; }
/** índices de las esquinas: donde el contorno dobla más de 25° (en una curva muestreada cada 4° no hay ninguna) */
export function esquinas(q: Punto[], umbral = 25): number[] {
  const n = q.length, out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = q[(i - 1 + n) % n], p = q[i], b = q[(i + 1) % n];
    const t1 = Math.atan2(p.y - a.y, p.x - a.x), t2 = Math.atan2(b.y - p.y, b.x - p.x);
    let d = Math.abs(t2 - t1); if (d > Math.PI) d = 2 * Math.PI - d;
    if ((d * 180) / Math.PI > umbral) out.push(i);
  }
  return out;
}
/** posición a lo largo del contorno (m desde el punto 0) del corte con la semirrecta desde (cx, cy) en el ángulo ang */
function arranque(q: Punto[], cx: number, cy: number, ang: number): number {
  const ux = Math.cos(ang), uy = Math.sin(ang);
  let mejor = { r: Infinity, pos: 0 }, acum = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length], ex = b.x - a.x, ey = b.y - a.y, L = Math.hypot(ex, ey);
    const den = ux * ey - uy * ex;
    if (Math.abs(den) > 1e-12) {
      const r = ((a.x - cx) * ey - (a.y - cy) * ex) / den, s = ((a.x - cx) * uy - (a.y - cy) * ux) / den;
      if (r > 1e-9 && s >= -1e-9 && s <= 1 + 1e-9 && r < mejor.r) mejor = { r, pos: acum + s * L };
    }
    acum += L;
  }
  return mejor.pos;
}
/** el punto del contorno a «pos» m del punto 0 (da la vuelta) */
function enPosicion(q: Punto[], acum: number[], P: number, pos: number): Punto {
  let x = ((pos % P) + P) % P, i = 0;
  while (i < q.length - 1 && acum[i + 1] <= x) i++;
  const a = q[i], b = q[(i + 1) % q.length], L = (acum[i + 1] ?? P) - acum[i];
  const t = L > 1e-12 ? (x - acum[i]) / L : 0;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** los nudos de un anillo sobre el contorno q: posiciones (m) desde el arranque y su ancho de influencia */
export function nudosEnContorno(q: Punto[], N: number, conEsquinas: boolean, medio: boolean, origen: number): { pos: number; trib: number }[] {
  const acum = [0]; for (let i = 0; i < q.length; i++) acum.push(acum[i] + Math.hypot(q[(i + 1) % q.length].x - q[i].x, q[(i + 1) % q.length].y - q[i].y));
  const P = acum[q.length];
  const off = medio ? 0.5 : 0;
  const es = conEsquinas ? esquinas(q) : [];
  if (es.length < 2 || es.length > N) {
    return Array.from({ length: N }, (_, j) => ({ pos: origen + (P * (j + off)) / N, trib: P / N }));
  }
  // arranca en la esquina más cerca del arranque pedido; cada lado entre esquinas lleva nudos según su largo
  const pe = es.map(i => acum[i]);
  const dist = (a: number) => { const d = Math.abs((((a - origen) % P) + P) % P); return Math.min(d, P - d); };
  const i0 = pe.reduce((m, x, i) => (dist(x) < dist(pe[m]) ? i : m), 0);
  const lados = pe.map((_, i) => { const a = pe[(i0 + i) % pe.length], b = pe[(i0 + i + 1) % pe.length]; return { a, L: ((b - a + P) % P) || P }; });
  // reparto de los N nudos (al menos uno por lado), por el resto mayor
  const exacto = lados.map(l => (N * l.L) / P), cant = exacto.map(x => Math.max(1, Math.floor(x)));
  let sobra = N - cant.reduce((s, v) => s + v, 0);
  const orden = exacto.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((u, v) => v.r - u.r);
  for (let j = 0; sobra > 0 && j < orden.length; j++, sobra--) cant[orden[j].i]++;
  const out: { pos: number; trib: number }[] = [];
  lados.forEach((l, i) => { for (let j = 0; j < cant[i]; j++) out.push({ pos: l.a + (l.L * (j + off)) / cant[i], trib: l.L / cant[i] }); });
  return out;
}

// ------------------------------------------------------------------ la malla de un proyecto
/** índices de zs de los anillos: los bordes de los módulos (o los cortes) y, en el diagrid, la mitad de cada módulo */
export function anillosMalla(def: ExoDef, zs: number[]): number[] {
  const n = zs.length - 1, m = def.malla ?? MALLA_POR_DEFECTO;
  const tope = m.hasta ?? Infinity;
  let kTop = n; while (kTop > 1 && zs[kTop] > tope + 1e-6) kTop--;
  const mod = Math.max(1, Math.round(def.modulo));
  let bordes: number[];
  if (def.cortes?.length) {
    bordes = [0, ...def.cortes.map(z => zs.reduce((b, zz, k) => (Math.abs(zz - z) < Math.abs(zs[b] - z) ? k : b), 0))].filter(k => k <= kTop);
  } else { bordes = []; for (let k = 0; k <= kTop; k += mod) bordes.push(k); }
  if (bordes[bordes.length - 1] !== kTop) bordes.push(kTop);
  bordes = [...new Set(bordes)].sort((a, b) => a - b);
  if (m.patron === 'columnas') return bordes;
  const out: number[] = [];
  bordes.forEach((k, i) => { out.push(k); const s = bordes[i + 1]; if (s !== undefined && s - k >= 2) out.push(Math.round((k + s) / 2)); });
  return [...new Set(out)].sort((a, b) => a - b);
}

/** el contorno de la fachada en la cota z (absoluta), con el corrimiento del nivel (torre inclinada) */
function contornoEn(p: Proyecto, z: number): { fachada: Punto[]; losa: Punto[] } {
  const iPB = p.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1);
  let i = p.niveles.findIndex(nv => Math.abs(nv.cota - z) < 1e-6);
  if (i < 0) i = iPB;
  const dx = p.niveles[i]?.dx ?? 0, dy = p.niveles[i]?.dy ?? 0;
  const mover = (q: Punto[]) => limpio(q.map(a => ({ x: a.x + dx, y: a.y + dy })));
  return { fachada: mover(puntosSilueta(contornoAlViento(p, i).v, 4)), losa: mover(puntosSilueta(plantaDeNivel(p, i).silueta, 4)) };
}

/** la clave de una barra de anillo a anillo: su clase y la posición de sus dos nudos (anillo y lugar en la vuelta) */
export function claveBarra(A: NudoMalla, B: NudoMalla, clase: BarraMalla['clase']): string {
  const p = (q: NudoMalla) => `${q.anillo}:${Math.round((((q.t % 1) + 1) % 1) * 1e4)}`;
  const [x, y] = [p(A), p(B)].sort();
  return `${clase}|${x}|${y}`;
}

/**
 * La malla del exo de la ficha M para las cotas zs (absolutas, zs[0] = PB): nudos y barras en el espacio. No depende del
 * viento: cada viento la proyecta en su plano (proyectarMalla).
 */
export function mallaDe(p: Proyecto, def: ExoDef, zs: number[]): MallaGeo {
  const m = def.malla ?? MALLA_POR_DEFECTO, N = Math.min(NUDOS_MAX, Math.max(3, Math.round(m.nudos)));
  const contornos = zs.map(z => contornoEn(p, z));
  const base = contornos[0].fachada;
  const cx = base.reduce((s, q) => s + q.x, 0) / base.length, cy = base.reduce((s, q) => s + q.y, 0) / base.length;
  const anillos = anillosMalla(def, zs);
  const mod = Math.max(1, Math.round(def.modulo));
  const nudos: NudoMalla[] = [], porAnillo: number[][] = [];
  anillos.forEach((k, r) => {
    const q = corrido(contornos[k].fachada, def.separacion ?? 0);
    const acum = [0]; for (let i = 0; i < q.length; i++) acum.push(acum[i] + Math.hypot(q[(i + 1) % q.length].x - q[i].x, q[(i + 1) % q.length].y - q[i].y));
    const P = acum[q.length];
    // el centro del nivel (la torre puede correrse) y el arranque: el ángulo 0, girado lo que pida la torsión de la malla
    const ccx = q.reduce((s, a) => s + a.x, 0) / q.length, ccy = q.reduce((s, a) => s + a.y, 0) / q.length;
    // el alto de un módulo: hasta el primer corte (si la torre los tiene) o «módulo» pisos
    const z1 = def.cortes?.find(z => z > zs[0] + 1e-6) ?? zs[Math.min(mod, zs.length - 1)];
    const ang = (((m.giro ?? 0) * Math.PI) / 180) * ((zs[k] - zs[0]) / Math.max(1e-6, z1 - zs[0]));
    const origen = arranque(q, ccx, ccy, ang);
    // diagrid: cada anillo corrido medio paso; hexagrid: corrido después de cada capa de diagonales (0, ½, ½, 0, 0, ½…)
    const medio = m.patron === 'diagrid' ? r % 2 === 1 : m.patron === 'hexagrid' ? Math.floor((r + 1) / 2) % 2 === 1 : false;
    // densidad variable: de N en la base a «nudos arriba» en el último anillo
    const fz = anillos.length > 1 ? (zs[k] - zs[anillos[0]]) / Math.max(1e-6, zs[anillos[anillos.length - 1]] - zs[anillos[0]]) : 0;
    const Nd = m.nudosArriba ? Math.min(NUDOS_MAX, Math.max(3, Math.round(N + (m.nudosArriba - N) * fz))) : N;
    // un anillo muy chico (la lente de una cúpula): no más nudos que uno por metro de vuelta
    const Nr = Math.max(3, Math.min(Nd, Math.floor(P / SEPARACION_MIN)));
    const ids: number[] = [];
    nudosEnContorno(q, Nr, m.esquinas !== false, medio, origen).forEach(({ pos, trib }) => {
      const pt = enPosicion(q, acum, P, pos);
      ids.push(nudos.length);
      nudos.push({ x: pt.x, y: pt.y, z: zs[k], k, anillo: r, t: ((((pos - origen) % P) + P) % P) / P, trib });
    });
    porAnillo.push(ids);
  });
  const barras: BarraMalla[] = [];
  // el nudo del anillo de arriba más cerca de la posición t (en la vuelta), y los vecinos de antes y de después
  const dt = (a: number, b: number) => { const d = (((b - a) % 1) + 1) % 1; return d; };
  const cercano = (ids: number[], t: number) => ids.reduce((m2, id) => { const d = Math.min(dt(t, nudos[id].t), dt(nudos[id].t, t)); return d < m2.d ? { id, d } : m2; }, { id: ids[0], d: Infinity }).id;
  const despues = (ids: number[], t: number) => ids.reduce((m2, id) => { const d = dt(t, nudos[id].t); return d > 1e-9 && d < m2.d ? { id, d } : m2; }, { id: ids[0], d: Infinity }).id;
  const antes = (ids: number[], t: number) => ids.reduce((m2, id) => { const d = dt(nudos[id].t, t); return d > 1e-9 && d < m2.d ? { id, d } : m2; }, { id: ids[0], d: Infinity }).id;
  const vistos = new Set<string>();
  const sacadas = new Set(m.sacadas ?? []), quitadas: BarraMalla[] = [];
  const barra = (clase: BarraMalla['clase'], a: number, b: number) => {
    if (a === b) return;
    const k = `${clase}|${Math.min(a, b)}|${Math.max(a, b)}`;
    if (vistos.has(k)) return; vistos.add(k);
    const br: BarraMalla = { clase, a, b, clave: claveBarra(nudos[a], nudos[b], clase) };
    (sacadas.has(br.clave!) ? quitadas : barras).push(br);
  };
  porAnillo.forEach((ids, r) => {
    // el anillo (no en la base: ahí la malla apoya en la fundación)
    if (r > 0) { const orden = [...ids].sort((a, b) => nudos[a].t - nudos[b].t); orden.forEach((id, i) => barra('anillo', id, orden[(i + 1) % orden.length])); }
    const arriba = porAnillo[r + 1];
    if (!arriba) return;
    if (m.patron === 'diagrid' || (m.patron === 'hexagrid' && r % 2 === 0)) ids.forEach(id => { barra('diagonal', id, despues(arriba, nudos[id].t)); barra('diagonal', id, antes(arriba, nudos[id].t)); });
    else if (m.patron === 'hexagrid') ids.forEach(id => barra('columna', id, cercano(arriba, nudos[id].t)));
    else {
      const orden = [...ids].sort((a, b) => nudos[a].t - nudos[b].t);
      orden.forEach((id, i) => {
        const sig = orden[(i + 1) % orden.length], c0 = cercano(arriba, nudos[id].t), c1 = cercano(arriba, nudos[sig].t);
        barra('columna', id, c0);
        barra('diagonal', id, c1); barra('diagonal', sig, c0);
      });
    }
  });
  // los niveles sin losa (la cúpula de vidrio del Gherkin): no hay losa que atar ni franja de losa que cargar
  const conLosa = zs.map(z => !p.niveles.find(nv => Math.abs(nv.cota - z) < 1e-6)?.sinLosa);
  // las losas atadas en cada piso: cada barra que cruza pisos entre anillos se parte en ellos (el nudo, sobre la barra recta)
  const partidas = m.arriostrada === false ? barras : barras.flatMap(b => {
    const A = nudos[b.a], B = nudos[b.b];
    if (b.clase === 'anillo' || Math.abs(B.k - A.k) < 2) return [b];
    const [lo, hi] = A.k < B.k ? [b.a, b.b] : [b.b, b.a], L0 = nudos[lo], L1 = nudos[hi];
    const out: BarraMalla[] = []; let prev = lo;
    for (let k = L0.k + 1; k < L1.k; k++) {
      if (!conLosa[k]) continue;
      const f = (zs[k] - L0.z) / (L1.z - L0.z || 1);
      const id = nudos.length;
      nudos.push({ x: L0.x + (L1.x - L0.x) * f, y: L0.y + (L1.y - L0.y) * f, z: zs[k], k, anillo: -1, t: L0.t + ((((L1.t - L0.t + 0.5) % 1) + 1) % 1 - 0.5) * f, trib: 0 });
      out.push({ clase: b.clase, a: prev, b: id, clave: b.clave }); prev = id;
    }
    out.push({ clase: b.clase, a: prev, b: hi, clave: b.clave });
    return out;
  });
  // el ancho de influencia de los nudos de los pisos entre anillos: la fachada de ese piso repartida entre ellos
  const porPiso = new Map<number, number[]>();
  nudos.forEach((q, i) => { if (q.anillo < 0) porPiso.set(q.k, [...(porPiso.get(q.k) ?? []), i]); });
  porPiso.forEach((ids, k) => { const P = perimetroPol(corrido(contornos[k].fachada, def.separacion ?? 0)); ids.forEach(i => { nudos[i].trib = P / ids.length; }); });
  const perimetro = contornos.map((c, k) => (conLosa[k] ? perimetroPol(c.losa) : 0));
  return { nudos, barras: partidas, anillos, perimetro, cx, cy, ...(quitadas.length ? { quitadas } : {}) };
}

// ------------------------------------------------------------------ proyección en el plano del viento
/** datos de la barra real que guarda la barra proyectada (para devolver la fuerza y verificar con el largo real) */
export interface BarraReal { escala: number; L3: number; p3: { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } } }

/**
 * La malla vista por el viento dir (A: a lo largo de y; B: a lo largo de x), como una cara plana del modelo: nudos en
 * (s, z) con su piso y barras con A' = A·(L₂/L)³ e I' = I·(L₂/L)³. Los anillos y las barras perpendiculares al viento
 * (L₂ ≈ 0) no entran.
 */
export function proyectarMalla(g: MallaGeo, def: ExoDef, dir: 'A' | 'B', zs: number[], props: (s: Seccion) => { A: number; I: number }, secDe: (clase: ClaseBarra, zMin: number) => Seccion, nombre = 'malla'): Cara & { malla: { geo: MallaGeo; dir: 'A' | 'B' } } {
  const sDe = (q: NudoMalla) => (dir === 'A' ? q.y - g.cy : q.x - g.cx);
  const nudos: Nudo[] = g.nudos.map((q, id) => ({ id, s: sDe(q), z: zs[q.k], piso: q.k }));
  const colRigida = (def.uniones?.columna ?? 'rigida') === 'rigida';
  const barras: (Barra & BarraReal)[] = [];
  const cuenta: Record<string, number> = {};
  g.barras.forEach(b => {
    if (b.clase === 'anillo') return;
    const A = g.nudos[b.a], B = g.nudos[b.b];
    const L = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z), L2 = Math.hypot(sDe(B) - sDe(A), B.z - A.z);
    if (L < 1e-9 || L2 < 1e-6 * L) return;
    const f = (L2 / L) ** 3, sec = secDe(b.clase, Math.min(A.z, B.z)), pr = props(sec);
    // las diagonales, articuladas en los nudos de los anillos y continuas en los pisos que cruzan (losas atadas): ahí la
    // flexión de la diagonal es la que frena el piso (articulada, el nudo se deslizaría a lo largo de la barra)
    const relA = b.clase === 'columna' ? !colRigida : A.anillo >= 0, relB = b.clase === 'columna' ? !colRigida : B.anillo >= 0;
    const letra = b.clase === 'columna' ? 'C' : b.clase === 'diagonal' ? 'D' : 'V';
    cuenta[letra] = (cuenta[letra] ?? 0) + 1;
    barras.push({
      id: `${letra}${cuenta[letra]}`, clase: b.clase, a: b.a, b: b.b, A: pr.A * f, I: pr.I * f, sec, relA, relB, borde: false,
      escala: L / L2, L3: L, p3: { a: { x: A.x, y: A.y, z: A.z }, b: { x: B.x, y: B.y, z: B.z } },
    });
  });
  return { nombre, nudos, barras, baseArticulada: def.uniones?.base === 'articulada', malla: { geo: g, dir } };
}

/**
 * Cargas en los nudos de la malla (t, hacia abajo): el peso propio de cada barra real (anillos incluidos), la mitad en
 * cada extremo, y la franja de losa que apoya en la fachada. En cada piso la franja de ancho f del borde de la losa es
 * P·f − π·f² (P: perímetro; exacto en el círculo, en un rectángulo da 4 f² − π f² de más), repartida entre los nudos del
 * anillo por su ancho de influencia; los pisos sin anillo la pasan a los anillos de abajo y de arriba, por la distancia.
 */
export function cargasMalla(g: MallaGeo, zs: number[], op: { gamma: number; peso: boolean; area: (clase: ClaseBarra | 'anillo', zMin: number) => number; q?: number; franja?: number; extra?: { z: number }[] }): { nudo: number; P: number }[] {
  const P = new Map<number, number>();
  const sumar = (id: number, v: number) => P.set(id, (P.get(id) ?? 0) + v);
  if (op.peso) g.barras.forEach(b => {
    const A = g.nudos[b.a], B = g.nudos[b.b], L = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
    const w = op.gamma * op.area(b.clase, Math.min(A.z, B.z)) * L;
    sumar(b.a, w / 2); sumar(b.b, w / 2);
  });
  const f = op.franja ?? 0, q = op.q ?? 0;
  if (f > 0 && q > 0 && g.anillos.length) {
    const porK = new Map<number, number[]>();
    g.nudos.forEach((nd, id) => { if (nd.k > 0) porK.set(nd.k, [...(porK.get(nd.k) ?? []), id]); });
    // los pisos con nudos: los anillos y, con las losas atadas, todos los que cruza la malla
    const ks = [...porK.keys()].sort((a, b) => a - b);
    const repartir = (k: number, carga: number) => {
      const ids = porK.get(k) ?? [], tot = ids.reduce((s, id) => s + g.nudos[id].trib, 0) || 1;
      ids.forEach(id => sumar(id, (carga * g.nudos[id].trib) / tot));
    };
    const aAnillos = (z: number, carga: number) => {
      const ab = [...ks].reverse().find(k => zs[k] <= z + 1e-6), ar = ks.find(k => zs[k] > z + 1e-6);
      if (ab !== undefined && Math.abs(zs[ab] - z) < 1e-6) return repartir(ab, carga);
      if (ab === undefined || ar === undefined) return repartir((ab ?? ar)!, carga);
      const t = (z - zs[ab]) / (zs[ar] - zs[ab]);
      repartir(ab, carga * (1 - t)); repartir(ar, carga * t);
    };
    const franjaEn = (per: number) => q * Math.max(0, per * f - Math.PI * f * f);
    if (ks.length) {
      for (let k = 1; k < zs.length; k++) aAnillos(zs[k], franjaEn(g.perimetro[k]));
      for (const e of op.extra ?? []) { const k = zs.reduce((b, zz, i) => (Math.abs(zz - e.z) < Math.abs(zs[b] - e.z) ? i : b), 0); aAnillos(e.z, franjaEn(g.perimetro[k])); }
    }
  }
  return [...P.entries()].filter(([, v]) => v > 0).map(([nudo, v]) => ({ nudo, P: v }));
}

/** peso del acero de la malla (t), con los anillos: Σ γ·A·L de las barras reales */
export function pesoMalla(g: MallaGeo, gamma: number, area: (clase: ClaseBarra | 'anillo', zMin: number) => number): number {
  return g.barras.reduce((s, b) => { const A = g.nudos[b.a], B = g.nudos[b.b]; return s + gamma * area(b.clase, Math.min(A.z, B.z)) * Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z); }, 0);
}

/**
 * Los pisos que la malla frena mal con un viento: su deriva de piso pasa 3 veces la media de la torre. Pasa en los pisos
 * entre anillos cuando en ese sentido no hay tabiques (solo los frena la flexión de las barras que cruzan la losa: el nudo
 * tiende a deslizarse a lo largo de la barra) o arriba, donde la malla se cierra (una cúpula). u: corrimientos de los
 * pisos zs[1..]; vuelve la cota de cada piso flojo y cuántas veces la deriva media es la suya.
 */
export function pisosFlojos(g: MallaGeo, zs: number[], u: number[], veces = 3): { z: number; veces: number }[] {
  const H = zs[zs.length - 1] - zs[0], media = Math.abs(u[u.length - 1] ?? 0) / Math.max(1e-9, H);
  if (!(media > 0)) return [];
  const enAnillo = new Set(g.anillos);
  return u.flatMap((x, i) => {
    const k = i + 1, d = Math.abs(x - (i ? u[i - 1] : 0)) / Math.max(1e-9, zs[k] - zs[k - 1]);
    return !enAnillo.has(k) && d > veces * media ? [{ z: zs[k], veces: d / media }] : [];
  });
}

// ------------------------------------------------------------------ torsión: la malla como tubo
/**
 * Resuelve K·x = b con K simétrica definida positiva guardada en banda (fila i: columnas i..i+b). Factorización LDLᵀ
 * de banda: la malla ordenada piso por piso tiene una banda de unos dos anillos.
 */
function resolverBanda(n: number, ancho: number, K: Map<number, number>[], b: number[]): number[] {
  const D = new Float64Array(n), L: Float64Array[] = Array.from({ length: n }, () => new Float64Array(ancho + 1));
  // L[i][j-i] para j ≥ i: copia de K
  K.forEach((fila, i) => fila.forEach((v, j) => { if (j >= i) L[i][j - i] = v; }));
  for (let i = 0; i < n; i++) {
    const d = L[i][0];
    if (!(Math.abs(d) > 1e-12)) throw new Error('La malla no frena el giro de algún piso.');
    D[i] = d;
    const lim = Math.min(n - 1, i + ancho);
    for (let j = i + 1; j <= lim; j++) {
      const lij = L[i][j - i];
      if (lij === 0) continue;
      const f = lij / d;
      for (let k = j; k <= lim; k++) { const lik = L[i][k - i]; if (lik !== 0) L[j][k - j] -= f * lik; }
    }
  }
  const y = Float64Array.from(b);
  for (let i = 0; i < n; i++) { const lim = Math.min(n - 1, i + ancho), yi = y[i]; for (let j = i + 1; j <= lim; j++) if (L[i][j - i]) y[j] -= (L[i][j - i] / D[i]) * yi; }
  for (let i = 0; i < n; i++) y[i] /= D[i];
  for (let i = n - 1; i >= 0; i--) { const lim = Math.min(n - 1, i + ancho); let s = y[i]; for (let j = i + 1; j <= lim; j++) if (L[i][j - i]) s -= (L[i][j - i] / D[i]) * y[j]; y[i] = s; }
  return [...y];
}

/**
 * El giro de los pisos de la malla con un torsor T por piso (t·m): reticulado espacial de barras articuladas (E·A/L en
 * su dirección), con cada losa rígida que gira θ alrededor del eje vertical del centro de la base (el nudo se corre
 * θ·(−(y − cy), x − cx)) y cada nudo libre de subir o bajar. Los anillos no trabajan (la losa no se deforma). Los pisos
 * sin nudos (entre anillos, sin losas atadas) pasan su torsor con un tubo muy blando, como en el J equivalente. Usa la
 * malla sin partir: los nudos de las barras en los pisos se deslizarían a lo largo de la barra (sin rigidez al giro).
 */
export function giroMalla(g: MallaGeo, zs: number[], T: number[], E: number, area: (clase: ClaseBarra | 'anillo', zMin: number) => number, blando = 0): number[] {
  const n = zs.length - 1;
  // orden de las incógnitas: piso por piso, las w de sus nudos y después su θ
  const idW = new Map<number, number>(), idT: number[] = [];
  let m = 0;
  const porK = new Map<number, number[]>();
  g.nudos.forEach((q, i) => { if (q.k > 0) porK.set(q.k, [...(porK.get(q.k) ?? []), i]); });
  for (let k = 1; k <= n; k++) { for (const i of porK.get(k) ?? []) idW.set(i, m++); idT[k] = m++; }
  const K: Map<number, number>[] = Array.from({ length: m }, () => new Map());
  let ancho = 0;
  const sumar = (i: number, j: number, v: number) => { const [a, b] = i <= j ? [i, j] : [j, i]; K[a].set(b, (K[a].get(b) ?? 0) + v); ancho = Math.max(ancho, b - a); };
  g.barras.forEach(b => {
    if (b.clase === 'anillo') return;
    const A = g.nudos[b.a], B = g.nudos[b.b];
    const dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z, L = Math.hypot(dx, dy, dz);
    if (L < 1e-9) return;
    // δ = e · (dB − dA): con el giro, e·t es el mismo en los dos extremos (el brazo de la barra respecto del eje)
    const brazo = ((A.x - g.cx) * dy - (A.y - g.cy) * dx) / L, ez = dz / L;
    const coef: [number, number][] = [];
    if (B.k > 0) coef.push([idT[B.k], brazo], [idW.get(b.b)!, ez]);
    if (A.k > 0) coef.push([idT[A.k], -brazo], [idW.get(b.a)!, -ez]);
    const k = (E * area(b.clase, Math.min(A.z, B.z))) / L;
    for (const [i, ci] of coef) for (const [j, cj] of coef) if (i <= j && ci && cj) sumar(i, j, k * ci * cj);
  });
  // el tubo blando de los pisos (y un resto mínimo en las w, para los nudos que solo tocan barras horizontales)
  const kb = blando > 0 ? blando : 1e-9;
  for (let k = 1; k <= n; k++) {
    const h = zs[k] - zs[k - 1], c = (12 * kb) / h ** 3;
    sumar(idT[k], idT[k], c); if (k > 1) { sumar(idT[k - 1], idT[k - 1], c); sumar(idT[k - 1], idT[k], -c); }
  }
  idW.forEach(i => { if (!(K[i].get(i)! > 0)) sumar(i, i, 1e-9); });
  const bvec = new Array<number>(m).fill(0);
  for (let k = 1; k <= n; k++) bvec[idT[k]] = T[k - 1] ?? 0;
  const x = resolverBanda(m, ancho, K, bvec);
  return Array.from({ length: n }, (_, k) => x[idT[k + 1]]);
}

// ------------------------------------------------------------------ los anillos
/** clave de un punto del espacio (para encontrar el nudo de la malla de una barra del modelo por su posición real) */
const claveP = (q: { x: number; y: number; z: number }) => `${q.x.toFixed(4)}|${q.y.toFixed(4)}|${q.z.toFixed(3)}`;

/**
 * La fuerza de cada barra de anillo (t; + tracción), a partir de las fuerzas reales de las demás barras (con p3: sus
 * extremos en el espacio). En cada nudo de un anillo las barras que llegan dejan una fuerza horizontal (el empuje de las
 * diagonales que se abren o se cierran). El anillo toma la parte hacia afuera (o hacia adentro) con fuerzas axiales en
 * sus tramos, como un zuncho (en un círculo con un empuje parejo, T = p·R); la parte a lo largo de la fachada (el corte
 * del viento que pasa de la losa a la malla) la toma la losa, como en el diseño habitual de los diagrid. Vuelve un mapa índice de barra de g.barras → fuerza.
 */
export function fuerzasAnillos(g: MallaGeo, barras: { N: number; p3?: { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } } }[]): Map<number, number> {
  const idDe = new Map(g.nudos.map((q, i) => [claveP(q), i]));
  const H = new Map<number, { x: number; y: number }>();
  for (const e of barras) {
    if (!e.p3 || !e.N) continue;
    const ia = idDe.get(claveP(e.p3.a)), ib = idDe.get(claveP(e.p3.b));
    const { a, b } = e.p3, L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (L < 1e-9) continue;
    // una barra traccionada tira de cada nudo hacia el otro extremo
    const fx = (e.N * (b.x - a.x)) / L, fy = (e.N * (b.y - a.y)) / L;
    if (ia !== undefined) { const v = H.get(ia) ?? { x: 0, y: 0 }; v.x += fx; v.y += fy; H.set(ia, v); }
    if (ib !== undefined) { const v = H.get(ib) ?? { x: 0, y: 0 }; v.x -= fx; v.y -= fy; H.set(ib, v); }
  }
  const out = new Map<number, number>();
  // cada anillo por separado: sus tramos en orden, y las dos ecuaciones (x, y) de cada nudo
  const porAnillo = new Map<number, number[]>();
  g.barras.forEach((b, i) => { if (b.clase === 'anillo') { const r = g.nudos[b.a].anillo; porAnillo.set(r, [...(porAnillo.get(r) ?? []), i]); } });
  porAnillo.forEach(ids => {
    const m = ids.length, nudos = [...new Set(ids.flatMap(i => [g.barras[i].a, g.barras[i].b]))], fila = new Map(nudos.map((n, j) => [n, j]));
    // la normal hacia afuera de cada nudo: la bisectriz de los dos tramos que llegan (anillo antihorario)
    const vecinos = new Map<number, number[]>();
    ids.forEach(i => { const b = g.barras[i]; vecinos.set(b.a, [...(vecinos.get(b.a) ?? []), b.b]); vecinos.set(b.b, [...(vecinos.get(b.b) ?? []), b.a]); });
    const normal = (n: number) => {
      const [p, q] = vecinos.get(n)!.map(k => g.nudos[k]), o = g.nudos[n];
      // el que viene antes en la vuelta (t menor, dando la vuelta) y el que viene después
      const [ant, sig] = ((q.t - o.t + 1) % 1) < ((p.t - o.t + 1) % 1) ? [p, q] : [q, p];
      const tx = sig.x - ant.x, ty = sig.y - ant.y, l = Math.hypot(tx, ty) || 1;
      return { x: ty / l, y: -tx / l };
    };
    // una ecuación por nudo, la del empuje hacia afuera: Σ T·(u·n) = −H·n. En un lado recto u·n = 0: ese empuje lo toma
    // la flexión de la viga y la losa, no el anillo
    const A: number[][] = Array.from({ length: nudos.length }, () => new Array<number>(m).fill(0)), rhs = new Array<number>(nudos.length).fill(0);
    const ns = nudos.map(normal);
    ids.forEach((i, j) => {
      const b = g.barras[i], P = g.nudos[b.a], Q = g.nudos[b.b], L = Math.hypot(Q.x - P.x, Q.y - P.y) || 1, ux = (Q.x - P.x) / L, uy = (Q.y - P.y) / L;
      const ra = fila.get(b.a)!, rb = fila.get(b.b)!;
      A[ra][j] += ux * ns[ra].x + uy * ns[ra].y; A[rb][j] -= ux * ns[rb].x + uy * ns[rb].y;
    });
    nudos.forEach((n, j) => { const v = H.get(n); if (v) rhs[j] = -(v.x * ns[j].x + v.y * ns[j].y); });
    // ecuaciones normales (mínimos cuadrados: en un rectángulo los nudos de los lados no dan ecuación)
    const M = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, k) => A.reduce((s, f) => s + f[i] * f[k], 0)));
    const c = Array.from({ length: m }, (_, i) => A.reduce((s, f, r) => s + f[i] * rhs[r], 0));
    const tr = M.reduce((s, f, i) => s + f[i], 0) / Math.max(1, m);
    for (let i = 0; i < m; i++) M[i][i] += 1e-9 * tr;
    const T = gauss(M, c);
    ids.forEach((i, j) => out.set(i, T[j]));
  });
  return out;
}
function gauss(M: number[][], b: number[]): number[] {
  const n = b.length, A = M.map((f, i) => [...f, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-14) continue;
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; if (f) for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = Math.abs(A[r][r]) < 1e-14 ? 0 : s / A[r][r]; }
  return x;
}

// ------------------------------------------------------------------ nombres fijos de las barras (para tablas y Excel)
/**
 * El nombre de cada barra de la malla, el mismo con los dos vientos: C (columnas), D (diagonales) y R (anillos), en el
 * orden de g.barras. (Las barras del modelo de cada viento se numeran aparte, porque las que no ven el viento no entran.)
 */
export function nombresMalla(g: MallaGeo): string[] {
  const n: Record<string, number> = {};
  return g.barras.map(b => { const l = b.clase === 'columna' ? 'C' : b.clase === 'diagonal' ? 'D' : b.clase === 'anillo' ? 'R' : 'V'; n[l] = (n[l] ?? 0) + 1; return `${l}${n[l]}`; });
}
/** índice en g.barras de una barra del modelo, por la posición real de sus extremos (p3) */
export function indiceBarraMalla(g: MallaGeo): (p3: { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } }) => number | undefined {
  const idDe = new Map(g.nudos.map((q, i) => [claveP(q), i]));
  const porPar = new Map<string, number>();
  g.barras.forEach((b, i) => porPar.set(`${Math.min(b.a, b.b)}|${Math.max(b.a, b.b)}`, i));
  return p3 => { const a = idDe.get(claveP(p3.a)), b = idDe.get(claveP(p3.b)); return a === undefined || b === undefined ? undefined : porPar.get(`${Math.min(a, b)}|${Math.max(a, b)}`); };
}

// ------------------------------------------------------------------ secciones por altura
/**
 * Tramos de sección parejos en altura para la malla: n tramos (el primero es la sección de la clase), cortados en los
 * anillos más cerca de cada n-ésimo de la altura. Cada clase de la malla (las diagonales, las columnas si hay, y las
 * vigas de los anillos) arranca cada tramo con la sección que tiene hoy a esa cota; después «Dimensionar» los ajusta.
 */
export function tramosParejos(g: MallaGeo, zs: number[], n: number, patron: PatronMalla, secDe: (clase: ClaseBarra, z: number) => { b: number; e: number }): { clase: ClaseBarra; desde: number; sec: { b: number; e: number } }[] {
  const zr = g.anillos.map(k => zs[k]), z0 = zr[0], z1 = zr[zr.length - 1];
  const cortes = [...new Set(Array.from({ length: Math.max(0, Math.round(n) - 1) }, (_, i) => {
    const meta = z0 + ((i + 1) * (z1 - z0)) / Math.round(n);
    return zr.reduce((b, z) => (Math.abs(z - meta) < Math.abs(b - meta) ? z : b), zr[0]);
  }))].filter(z => z > z0 + 1e-6 && z < z1 - 1e-6).sort((a, b) => a - b);
  const clases: ClaseBarra[] = patron === 'columnas' ? ['columna', 'diagonal', 'viga'] : ['diagonal', 'viga'];
  return clases.flatMap(clase => cortes.map(desde => ({ clase, desde, sec: { ...secDe(clase, desde) } })));
}

/**
 * El viento de los niveles donde la malla no tiene nudos ni hay tabiques (un nivel sin losa entre dos anillos, como la
 * cúpula de vidrio del Gherkin): no hay losa que lo lleve a un solo punto, así que la piel lo pasa a los niveles con
 * nudos de abajo y de arriba, por la distancia. W[i] es el viento del nivel zs[i + 1].
 */
export function vientoANudos(g: MallaGeo, zs: number[], W: number[], conTabiques: (z: number) => boolean): number[] {
  const conNudos = new Set(g.nudos.map(q => q.k));
  const firme = (k: number) => k === 0 || conNudos.has(k) || conTabiques(zs[k]);
  const out = [...W];
  for (let k = 1; k < zs.length; k++) {
    if (firme(k) || !out[k - 1]) continue;
    let ab = k - 1; while (ab > 0 && !firme(ab)) ab--;
    let ar = k + 1; while (ar < zs.length && !firme(ar)) ar++;
    const w = out[k - 1]; out[k - 1] = 0;
    if (ar >= zs.length) { if (ab > 0) out[ab - 1] += w; continue; }
    const t = (zs[k] - zs[ab]) / (zs[ar] - zs[ab]);
    if (ab > 0) out[ab - 1] += w * (1 - t);
    out[ar - 1] += w * t;
  }
  return out;
}
