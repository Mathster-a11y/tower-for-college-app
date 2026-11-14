/**
 * Exoesqueleto: estructura de acero por fuera de la fachada que trabaja junto con los tabiques.
 *
 * Modelo (docs/plan_entrega, inciso 9):
 *  - Las losas son diafragmas rígidos: en cada piso i hay un solo corrimiento u_i en el sentido del viento.
 *  - Tabiques: ménsula empotrada en PB con E·J(z) (vigas de Euler por piso); se condensa a los u_i → K_tab.
 *  - Exoesqueleto: pórticos planos en las caras paralelas al viento (método directo de la rigidez, 3 gdl por nudo:
 *    u, w, φ). Cada extremo de barra es una unión rígida o una articulación (el giro se libera y se condensa en la
 *    barra: k' = k_cc − k_cr·k_rr⁻¹·k_rc). Las bases de las columnas, empotradas o articuladas.
 *  - Cargas en las barras, repartidas y lineales (trapecio) en globales: el peso propio del acero (γ·A, siempre) y,
 *    si la fachada cuelga del exo, el viento de cada piso repartido en las barras de borde. Entran como cargas
 *    nodales equivalentes P (empotramiento perfecto, con las articulaciones condensadas como k').
 *  - Los nudos de un mismo piso comparten u (diafragma) y se condensan w y φ:
 *      K_c = Kmm − Kms·Kss⁻¹·Ksm,   F_c = Fm − Kms·Kss⁻¹·Fs   (la carga propia de la cara, llevada a los pisos)
 *  - Sistema combinado: (K_tab + Σ K_c)·u = W_losas + Σ F_c → F_tab = K_tab·u; el exo toma el resto.
 *  - Esfuerzos de cada barra: f = k'·T·d − P' en los extremos y, a lo largo, con la carga repartida:
 *      N(x) = Na − ∫p,  V(x) = Va + ∫q,  M(x) = Ma + Va·x + ∫∫q   (M parabólica o cúbica si hay carga en la barra)
 * Unidades: t, m (E en t/m², A en m², I en m⁴).
 */

export type TipoExo = 'A' | 'B' | 'C' | 'D' | 'E';
export const TIPOS_EXO: Record<TipoExo, { nombre: string; texto: string }> = {
  A: { nombre: 'Diagrid', texto: 'Diagonales en rombo en las caras, sin columnas intermedias: toman corte y flexión con las mismas barras.' },
  B: { nombre: 'Mega-marcos', texto: 'Columnas en las esquinas y vigas cada «módulo» pisos: trabajan como pórticos (rigidez por flexión).' },
  C: { nombre: 'Mega-columnas y cinturones', texto: 'Columnas en las esquinas atadas por reticulados cinturón (muy rígidos) en dos niveles.' },
  D: { nombre: 'Tubo arriostrado en X', texto: 'Columnas en las esquinas y cruces de San Andrés por módulos de pisos.' },
  E: { nombre: 'Chevrones a la columna central', texto: 'Una columna (mástil) en el medio de cada cara y, por módulo, diagonales en V que bajan de las esquinas al mástil: las esquinas cuelgan (como el Citicorp Center).' },
};

/** sección de una barra: tubo cuadrado b × e (m) */
export interface Seccion { b: number; e: number }
export const propsSeccion = (s: Seccion) => {
  const bi = Math.max(0, s.b - 2 * s.e);
  const A = s.b * s.b - bi * bi, I = (s.b ** 4 - bi ** 4) / 12;
  return { A, I, i: Math.sqrt(I / (A || 1)), c: s.b / 2, W: I / (s.b / 2 || 1) };
};
export type Union = 'rigida' | 'articulada';
/** cambios de una barra sola (editor barra por barra): sus uniones, su sección, o sacarla */
export interface CambioBarra { relA?: boolean; relB?: boolean; sec?: Seccion; quitar?: boolean }

/** el exoesqueleto del proyecto (lo que el alumno elige) */
export interface ExoDef {
  tipo: TipoExo;
  /** separación de la fachada (m): el exo va a esa distancia afuera de la planta de PB */
  separacion: number;
  /** pisos por módulo (cruces, vigas o diamantes) */
  modulo: number;
  columna: Seccion; diagonal: Seccion; viga: Seccion;
  /** acero: módulo de elasticidad (t/m²) y tensión admisible (t/m²) */
  E: number; sigmaAdm: number;
  /** flecha objetivo en la azotea: δ ≤ h / limiteH (por defecto 500, el límite del curso; se puede pedir más) */
  limiteH?: number;
  /** uniones de cada clase de barra en sus dos extremos y de la base de las columnas */
  uniones?: { columna?: Union; diagonal?: Union; viga?: Union; base?: 'empotrada' | 'articulada' };
  /** cómo llega el viento: por las losas a los nudos de cada piso (lo de la planilla) o repartido por la fachada colgada del exo */
  viento?: 'losas' | 'fachada';
  /** peso propio del acero (γ = 7,85 t/m³) como carga repartida en cada barra; por defecto sí */
  pesoPropio?: boolean;
  /** ficha E: piso donde empiezan los chevrones (abajo, solo el mástil) y la sección del mástil */
  pisoInicio?: number; mastil?: Seccion;
  /** cambios barra por barra, por el id de la barra (se borran si cambia la ficha o el módulo) */
  barras?: Record<string, CambioBarra>;
  /** barras agregadas a mano entre dos nudos de la cara (s, z en m); su id es N1, N2… */
  nuevas?: BarraNueva[];
}
export interface BarraNueva { clase: ClaseBarra; a: [number, number]; b: [number, number]; sec?: Seccion; relA?: boolean; relB?: boolean }
export const EXO_POR_DEFECTO: ExoDef = {
  tipo: 'D', separacion: 1, modulo: 4,
  columna: { b: 0.5, e: 0.03 }, diagonal: { b: 0.3, e: 0.0125 }, viga: { b: 0.4, e: 0.02 },
  E: 2.1e7, sigmaAdm: 14000,
};
export const UNIONES_POR_DEFECTO = { columna: 'rigida', diagonal: 'articulada', viga: 'rigida', base: 'empotrada' } as const;
const GAMMA_ACERO = 7.85;

export type ClaseBarra = 'columna' | 'diagonal' | 'viga';
export interface Nudo { id: number; s: number; z: number; piso: number }
/** carga repartida lineal en globales (t/m de barra): x horizontal (s), z vertical; en el extremo a y en el b */
export interface CargaBarra { xa: number; za: number; xb: number; zb: number }
export interface Barra {
  id: string; clase: ClaseBarra; a: number; b: number; A: number; I: number; sec: Seccion;
  /** articulación en el extremo a / b (el giro queda libre: M = 0 ahí) */
  relA: boolean; relB: boolean;
  /** barra de borde (sus dos nudos en las esquinas): ahí se cuelga la fachada */
  borde: boolean;
  carga?: CargaBarra;
  /** parte de la sección que representa (ala: la mitad del mástil de una cara perpendicular, compartido por dos caras) */
  fraccion?: number;
}
export interface Cara { nombre: string; nudos: Nudo[]; barras: Barra[]; baseArticulada?: boolean }

/**
 * Arma una cara (pórtico plano en s, z) del tipo pedido, con sus uniones y los cambios barra por barra.
 * @param ancho distancia entre las columnas de esquina, en el sentido del viento (m)
 * @param zs cotas de los pisos sobre PB, de abajo hacia arriba; zs[0] = PB (base)
 */
export function armarCara(def: ExoDef, ancho: number, zs: number[], nombre = 'cara'): Cara {
  const n = zs.length - 1, m = Math.max(1, Math.round(def.modulo));
  const un = { ...UNIONES_POR_DEFECTO, ...(def.uniones ?? {}) };
  const nudos: Nudo[] = [], barras: Barra[] = [];
  const nudo = (s: number, k: number) => {
    let q = nudos.find(x => x.piso === k && Math.abs(x.s - s) < 1e-9);
    if (!q) { q = { id: nudos.length, s, z: zs[k], piso: k }; nudos.push(q); }
    return q.id;
  };
  /** nudo en (s, z) cualquiera: si cae en un piso es un nudo de ese piso; si no, queda entre pisos (piso −1, u libre) */
  const nudoEn = (s: number, z: number) => {
    const k = zs.findIndex(zz => Math.abs(zz - z) < 1e-6);
    if (k >= 0) return nudo(s, k);
    let q = nudos.find(x => x.piso < 0 && Math.abs(x.s - s) < 1e-9 && Math.abs(x.z - z) < 1e-9);
    if (!q) { q = { id: nudos.length, s, z, piso: -1 }; nudos.push(q); }
    return q.id;
  };
  const s0 = -ancho / 2, s1 = ancho / 2;
  /** cruz de San Andrés con las dos diagonales unidas en el cruce (así cada una tiene la mitad de luz) */
  const cruz = (a0: number, a1: number) => {
    const zc = (zs[a0] + zs[a1]) / 2, c = nudoEn(0, zc);
    barra('diagonal', nudo(s0, a0), c); barra('diagonal', c, nudo(s1, a1));
    barra('diagonal', nudo(s1, a0), c); barra('diagonal', c, nudo(s0, a1));
  };
  const enBorde = (k: number) => Math.abs(Math.abs(nudos[k].s) - ancho / 2) < 1e-9;
  const barra = (clase: ClaseBarra, a: number, b: number, sec?: Seccion) => {
    if (a === b) return;                                       // barra de largo cero (módulos muy cortos)
    const s = sec ?? (clase === 'columna' ? def.columna : clase === 'diagonal' ? def.diagonal : def.viga), p = propsSeccion(s);
    const rel = un[clase] === 'articulada';
    barras.push({ id: `${clase[0].toUpperCase()}${barras.filter(x => x.clase === clase).length + 1}`, clase, a, b, A: p.A, I: p.I, sec: s, relA: rel, relB: rel, borde: enBorde(a) && enBorde(b) });
  };
  // niveles con nudos del exo (los bordes de cada módulo)
  const k0 = def.tipo === 'E' ? Math.min(n - 1, Math.max(0, Math.round(def.pisoInicio ?? 0))) : 0;
  const mods: number[] = [];
  for (let k = k0; k <= n; k += m) mods.push(k);
  if (mods[mods.length - 1] !== n) mods.push(n);
  // un último módulo de un solo piso se junta con el anterior (en el diagrid el diamante necesita al menos 2 pisos)
  if (mods.length > 2 && mods[mods.length - 1] - mods[mods.length - 2] < 2) mods.splice(mods.length - 2, 1);
  if (def.tipo === 'A') {
    // diagrid: nudos en los bordes y en el centro; diamantes de «módulo» pisos de alto
    for (let j = 0; j + 1 < mods.length; j++) {
      const a0 = mods[j], a1 = mods[j + 1], km = Math.round((a0 + a1) / 2);
      const C0 = nudo(0, a0), Lm = nudo(s0, km), Rm = nudo(s1, km), C1 = nudo(0, a1);
      const L0 = nudo(s0, a0), R0 = nudo(s1, a0), L1 = nudo(s0, a1), R1 = nudo(s1, a1);
      barra('diagonal', C0, Lm); barra('diagonal', C0, Rm); barra('diagonal', Lm, C1); barra('diagonal', Rm, C1);
      barra('diagonal', L0, Lm); barra('diagonal', Lm, L1); barra('diagonal', R0, Rm); barra('diagonal', Rm, R1);
    }
    // anillo (viga de borde) arriba, para cerrar los diamantes
    barra('viga', nudo(s0, n), nudo(0, n)); barra('viga', nudo(0, n), nudo(s1, n));
  } else if (def.tipo === 'E') {
    // mástil central de la base a la azotea; esquinas desde el primer módulo (abajo vuelan); V por módulo y viga en cada borde
    for (let k = 0; k < n; k++) barra('columna', nudo(0, k), nudo(0, k + 1), def.mastil ?? def.columna);
    // esquinas desde el primer piso del exo (el primer tramo cuelga del chevron de arriba)
    for (const s of [s0, s1]) for (let k = mods[0]; k < n; k++) barra('columna', nudo(s, k), nudo(s, k + 1));
    for (let j = 0; j + 1 < mods.length; j++) {
      const a0 = mods[j], a1 = mods[j + 1];
      barra('diagonal', nudo(s0, a1), nudo(0, a0)); barra('diagonal', nudo(s1, a1), nudo(0, a0));
      barra('viga', nudo(s0, a1), nudo(0, a1)); barra('viga', nudo(0, a1), nudo(s1, a1));
    }
    // alas del tubo: los mástiles de las dos caras perpendiculares quedan en s = ±ancho/2 (en el sentido del viento) y
    // reciben de sus chevrones lo que bajan las esquinas; cada uno lo comparten dos caras paralelas → la mitad acá
    // (el ala se ata a la esquina solo en los niveles de los chevrones: por ahí le llega la carga; en los otros pisos
    //  tiene sus propios nudos, que comparten con la losa solo el corrimiento horizontal)
    const sm = def.mastil ?? def.columna, pm = propsSeccion(sm), atadas = new Set(mods.slice(1));
    const nudoAla = (s: number, k: number) => {
      if (atadas.has(k)) return nudo(s, k);
      const sa = s * (1 + 1e-7);
      let q = nudos.find(x => x.piso === k && Math.abs(x.s - sa) < 1e-12);
      if (!q) { q = { id: nudos.length, s: sa, z: zs[k], piso: k }; nudos.push(q); }
      return q.id;
    };
    let nf = 0;
    for (const s of [s0, s1]) for (let k = 0; k < n; k++) {
      const a = nudoAla(s, k), b = nudoAla(s, k + 1), rel = un.columna === 'articulada';
      barras.push({ id: `F${++nf}`, clase: 'columna', a, b, A: pm.A / 2, I: pm.I / 2, sec: sm, relA: rel, relB: rel, borde: false, fraccion: 0.5 });
    }
  } else {
    // columnas de esquina, de piso a piso
    for (const s of [s0, s1]) for (let k = 0; k < n; k++) barra('columna', nudo(s, k), nudo(s, k + 1));
    for (let j = 0; j + 1 < mods.length; j++) {
      const a0 = mods[j], a1 = mods[j + 1];
      if (def.tipo === 'D') cruz(a0, a1);
      if (def.tipo === 'B' || def.tipo === 'D') barra('viga', nudo(s0, a1), nudo(s1, a1));
    }
    if (def.tipo === 'C') {
      // dos cinturones: a la mitad y arriba, cada uno un reticulado de un módulo de alto (vigas arriba y abajo + X)
      const cint = [Math.max(m, Math.round(n / 2)), n];
      cint.forEach(kt => {
        const kb = Math.max(0, kt - Math.min(m, kt));
        barra('viga', nudo(s0, kt), nudo(s1, kt)); barra('viga', nudo(s0, kb), nudo(s1, kb));
        cruz(kb, kt);
      });
    }
  }
  // barras agregadas a mano (entre nudos que ya existen o en un piso)
  (def.nuevas ?? []).forEach((nb, i) => {
    const a = nudoEn(nb.a[0], nb.a[1]), b = nudoEn(nb.b[0], nb.b[1]);
    if (a === b) return;
    const sec = nb.sec ?? (nb.clase === 'columna' ? def.columna : nb.clase === 'diagonal' ? def.diagonal : def.viga), p = propsSeccion(sec);
    const rel = un[nb.clase] === 'articulada';
    barras.push({ id: `N${i + 1}`, clase: nb.clase, a, b, A: p.A, I: p.I, sec, relA: nb.relA ?? rel, relB: nb.relB ?? rel, borde: enBorde(a) && enBorde(b) });
  });
  // cambios barra por barra
  const cambios = def.barras ?? {};
  const fin = barras.filter(b => !cambios[b.id]?.quitar).map(b => {
    const c = cambios[b.id];
    if (!c) return b;
    const sec = c.sec ?? b.sec, p = propsSeccion(sec);
    return { ...b, sec, A: p.A, I: p.I, relA: c.relA ?? b.relA, relB: c.relB ?? b.relB };
  });
  return { nombre, nudos, barras: fin, baseArticulada: un.base === 'articulada' };
}

/**
 * Cargas repartidas de una cara: el peso propio (vertical, γ·A) y, si la fachada cuelga del exo, el viento de cada
 * piso repartido en altura en las barras de borde (lineal entre pisos; cada cara toma la mitad y cada borde otra mitad:
 * un cuarto del viento total por borde). Se escala para que el viento sobre la fachada sume exactamente ΣW (la parte
 * del primer tramo que queda por debajo del primer piso baja directo a la base).
 */
export function cargarCara(cara: Cara, def: ExoDef, zs: number[], W: number[]): Cara {
  const n = zs.length - 1, peso = def.pesoPropio !== false;
  // viento por metro de altura en cada piso (t/m, de toda la torre): W_k / D_k
  const D = (k: number) => ((k < n ? zs[k + 1] : zs[k]) - zs[k - 1]) / (k < n ? 2 : 2);
  const w = zs.map((_, k) => (k === 0 ? 0 : W[k - 1] / Math.max(D(k), 1e-9)));
  w[0] = w[1] ?? 0;
  const wz = (z: number) => { let k = 1; while (k < n && zs[k] < z - 1e-9) k++; const za = zs[k - 1], zb = zs[k]; const t = zb > za ? (z - za) / (zb - za) : 0; return w[k - 1] + (w[k] - w[k - 1]) * t; };
  const bordes = cara.barras.filter(b => b.borde);
  // factor para que el viento sobre las barras de borde de las dos caras sume ΣW
  let f = 1;
  if (def.viento === 'fachada' && bordes.length) {
    const sumW = W.reduce((s, v) => s + v, 0);
    let tot = 0;
    bordes.forEach(b => { const A = cara.nudos[b.a], B = cara.nudos[b.b]; const za = Math.min(A.z, B.z), zb = Math.max(A.z, B.z); tot += ((wz(za) + wz(zb)) / 2) * (zb - za) / 4; });
    // cada cara tiene dos bordes; con las dos caras, cada borde lleva 1/4: tot es lo de una cara → por 2
    f = tot > 0 ? sumW / (2 * tot) : 1;
  }
  return { ...cara, barras: cara.barras.map(b => {
    const A = cara.nudos[b.a], B = cara.nudos[b.b], L = Math.hypot(B.s - A.s, B.z - A.z) || 1;
    const c: CargaBarra = { xa: 0, za: 0, xb: 0, zb: 0 };
    if (peso) { c.za = c.zb = -GAMMA_ACERO * b.A; }
    if (def.viento === 'fachada' && b.borde) {
      // t/m de altura → t/m de barra (por la proyección vertical)
      const k = (Math.abs(B.z - A.z) / L) * f / 4;
      c.xa = wz(A.z) * k; c.xb = wz(B.z) * k;
    }
    return c.xa || c.xb || c.za || c.zb ? { ...b, carga: c } : b;
  }) };
}

// ------------------------------------------------------------------ álgebra densa
type Mat = number[][];
const ceros = (r: number, c: number): Mat => Array.from({ length: r }, () => new Array<number>(c).fill(0));
/** resuelve A·X = B (B con varias columnas) por eliminación de Gauss con pivoteo parcial; A y B se copian */
function resolver(A0: Mat, B0: Mat): Mat {
  const n = A0.length, A = A0.map(f => [...f]), B = B0.map(f => [...f]), m = B[0]?.length ?? 0;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-14) throw new Error('El exoesqueleto es un mecanismo (falta una barra para que sea estable).');
    [A[c], A[p]] = [A[p], A[c]]; [B[c], B[p]] = [B[p], B[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      if (f === 0) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      for (let k = 0; k < m; k++) B[r][k] -= f * B[c][k];
    }
  }
  const X = ceros(n, m);
  for (let r = n - 1; r >= 0; r--) for (let k = 0; k < m; k++) {
    let s = B[r][k];
    for (let c = r + 1; c < n; c++) s -= A[r][c] * X[c][k];
    X[r][k] = s / A[r][r];
  }
  return X;
}

/** barra en locales con sus articulaciones condensadas y sus cargas como fuerzas nodales equivalentes */
interface BarraLocal { K: Mat; T: Mat; k: Mat; P: number[]; L: number; c: number; s: number; qa: number; qb: number; pa: number; pb: number }
function barraLocal(E: number, br: Barra, x1: number, z1: number, x2: number, z2: number): BarraLocal {
  const L = Math.hypot(x2 - x1, z2 - z1), c = (x2 - x1) / L, s = (z2 - z1) / L;
  const a = (E * br.A) / L, I = br.I, b = (12 * E * I) / L ** 3, d = (6 * E * I) / L ** 2, e4 = (4 * E * I) / L, e2 = (2 * E * I) / L;
  let k: Mat = [
    [a, 0, 0, -a, 0, 0], [0, b, d, 0, -b, d], [0, d, e4, 0, -d, e2],
    [-a, 0, 0, a, 0, 0], [0, -b, -d, 0, b, -d], [0, d, e2, 0, -d, e4],
  ];
  // cargas en locales: p a lo largo (de a hacia b), q perpendicular (+y local = x girado 90° antihorario)
  const g = br.carga ?? { xa: 0, za: 0, xb: 0, zb: 0 };
  const pa = g.xa * c + g.za * s, pb = g.xb * c + g.zb * s, qa = -g.xa * s + g.za * c, qb = -g.xb * s + g.zb * c;
  let P = [L * (2 * pa + pb) / 6, L * (7 * qa + 3 * qb) / 20, L * L * (3 * qa + 2 * qb) / 60,
    L * (pa + 2 * pb) / 6, L * (3 * qa + 7 * qb) / 20, -L * L * (2 * qa + 3 * qb) / 60];
  // articulaciones: se condensan los giros liberados (k' = k_cc − k_cr·k_rr⁻¹·k_rc, P' = P_c − k_cr·k_rr⁻¹·P_r)
  const r = [...(br.relA ? [2] : []), ...(br.relB ? [5] : [])];
  if (r.length && I > 0) {
    const cc = [0, 1, 2, 3, 4, 5].filter(i => !r.includes(i));
    const krr = r.map(i => r.map(j => k[i][j])), krc = r.map(i => cc.map(j => k[i][j]));
    const X = resolver(krr, [...krc.map((f, i) => [...f, P[r[i]]])].map(f => f));   // k_rr⁻¹·[k_rc | P_r]
    const k2 = ceros(6, 6), P2 = [...P];
    cc.forEach(i => {
      cc.forEach((j, jj) => { k2[i][j] = k[i][j] - r.reduce((sm, rr, p) => sm + k[i][rr] * X[p][jj], 0); });
      P2[i] = P[i] - r.reduce((sm, rr, p) => sm + k[i][rr] * X[p][cc.length], 0);
    });
    r.forEach(i => (P2[i] = 0));
    k = k2; P = P2;
  }
  const T: Mat = ceros(6, 6);
  for (const o of [0, 3]) { T[o][o] = c; T[o][o + 1] = s; T[o + 1][o] = -s; T[o + 1][o + 1] = c; T[o + 2][o + 2] = 1; }
  const K = ceros(6, 6);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { let v = 0; for (let p = 0; p < 6; p++) for (let q = 0; q < 6; q++) v += T[p][i] * k[p][q] * T[q][j]; K[i][j] = v; }
  return { K, T, k, P, L, c, s, qa, qb, pa, pb };
}

/**
 * Condensación de una estructura a los corrimientos de los pisos. «gdl» dice, para cada gdl local de cada nudo, si
 * es un piso (master) o un gdl propio (esclavo), o si está fijo. Devuelve K condensada (n × n) y lo necesario para
 * recuperar los esclavos.
 */
interface Condensada { K: Mat; Kss: Mat; Ksm: Mat; nEsc: number }
function condensar(Kg: Mat, master: number[], esclavos: number[]): Condensada {
  const Kmm = master.map(i => master.map(j => Kg[i][j])), Kms = master.map(i => esclavos.map(j => Kg[i][j]));
  const Ksm = esclavos.map(i => master.map(j => Kg[i][j])), Kss = esclavos.map(i => esclavos.map(j => Kg[i][j]));
  if (!esclavos.length) return { K: Kmm, Kss, Ksm, nEsc: 0 };
  const X = resolver(Kss, Ksm);                        // Kss⁻¹·Ksm
  const K = Kmm.map((f, i) => f.map((v, j) => v - Kms[i].reduce((s, kv, p) => s + kv * X[p][j], 0)));
  return { K, Kss, Ksm, nEsc: esclavos.length };
}

/** cara armada y condensada a los pisos 1..n (el piso 0 es la base) */
export interface CaraCondensada {
  cara: Cara; K: Mat;
  /** cargas propias de la cara (peso, viento por la fachada) llevadas a los pisos: F_c = Fm − Kms·Kss⁻¹·Fs */
  F: number[];
  recuperar: (u: number[]) => EsfuerzoBarra[]; reacciones: (u: number[]) => { s: number; V: number; H: number }[];
}
/**
 * Esfuerzos de una barra. Convenio: N > 0 tracción; V y M de viga (dM/dx = V; M > 0 tracciona la cara −y local, la de
 * la derecha de a→b). Con carga repartida lineal p (axial) y q (perpendicular) de a a b, entre los extremos:
 *   N(x) = Na − pa·x − (pb − pa)·x²/2L,  V(x) = Va + qa·x + (qb − qa)·x²/2L,  M(x) = Ma + Va·x + qa·x²/2 + (qb − qa)·x³/6L
 */
/** propiedades de la sección de una barra (las alas valen una fracción de su sección) */
export const propsBarra = (e: { sec: Seccion; fraccion?: number }) => {
  const p = propsSeccion(e.sec), f = e.fraccion ?? 1;
  return { ...p, A: p.A * f, I: p.I * f, W: p.W * f };
};
export interface EsfuerzoBarra {
  id: string; clase: ClaseBarra; fraccion?: number; a: { s: number; z: number }; b: { s: number; z: number }; L: number;
  /** en el extremo a (Q = V(0)) y en el b */
  N: number; Q: number; Ma: number; Mb: number; Nb: number; Qb: number;
  relA: boolean; relB: boolean; sec: Seccion;
  /** cargas repartidas en locales (t/m): p axial, q perpendicular, en a y en b */
  pa: number; pb: number; qa: number; qb: number;
}
/** N, V y M de la barra a la fracción t de su largo (0 = extremo a, 1 = extremo b) */
export function esfuerzosEn(e: EsfuerzoBarra, t: number) {
  const x = t * e.L, L = e.L || 1;
  return {
    N: e.N - e.pa * x - (e.pb - e.pa) * x * x / (2 * L),
    V: e.Q + e.qa * x + (e.qb - e.qa) * x * x / (2 * L),
    M: e.Ma + e.Q * x + e.qa * x * x / 2 + (e.qb - e.qa) * x ** 3 / (6 * L),
  };
}
/** fracciones donde M cambia de signo (pueden ser 0, 1 o 2 con carga repartida) */
export function cerosDeM(e: EsfuerzoBarra, n = 60): number[] {
  const out: number[] = [];
  let prev = esfuerzosEn(e, 0).M;
  for (let i = 1; i <= n; i++) {
    const t = i / n, m = esfuerzosEn(e, t).M;
    if (prev * m < 0) { let lo = (i - 1) / n, hi = t; for (let k = 0; k < 30; k++) { const md = (lo + hi) / 2; if (esfuerzosEn(e, lo).M * esfuerzosEn(e, md).M <= 0) hi = md; else lo = md; } out.push((lo + hi) / 2); }
    prev = m;
  }
  return out;
}

export function condensarCara(cara: Cara, E: number, nPisos: number): CaraCondensada {
  // numeración: gdl 0..n-1 = u de los pisos 1..n (master); después w y φ de cada nudo que no está en la base
  // (con la base articulada, el giro de los nudos de la base también queda libre)
  const master = Array.from({ length: nPisos }, (_, i) => i);
  const mapa = new Map<number, [number, number, number]>();   // nudo → índices globales (u, w, φ); −1 = fijo
  let k = nPisos;
  cara.nudos.forEach(q => {
    if (q.piso === 0) { if (cara.baseArticulada) { mapa.set(q.id, [-1, -1, k]); k += 1; } else mapa.set(q.id, [-1, -1, -1]); }
    else if (q.piso < 0) { mapa.set(q.id, [k, k + 1, k + 2]); k += 3; }      // entre pisos: u propio (no lo toca la losa)
    else { mapa.set(q.id, [q.piso - 1, k, k + 1]); k += 2; }
  });
  const N = k, Kg = ceros(N, N), Fg = new Array<number>(N).fill(0);
  const datos = cara.barras.map(b => {
    const A = cara.nudos[b.a], B = cara.nudos[b.b];
    const r = barraLocal(E, b, A.s, A.z, B.s, B.z);
    const g = [...mapa.get(b.a)!, ...mapa.get(b.b)!];
    for (let i = 0; i < 6; i++) {
      if (g[i] < 0) continue;
      for (let j = 0; j < 6; j++) if (g[j] >= 0) Kg[g[i]][g[j]] += r.K[i][j];
      Fg[g[i]] += r.T.reduce((sm, f, p) => sm + f[i] * r.P[p], 0);     // Tᵀ·P
    }
    return { b, A, B, r, g };
  });
  // giros sin rigidez (nudos donde todas las barras llegan articuladas): se fijan (no cambia nada)
  for (let i = nPisos; i < N; i++) if (Math.abs(Kg[i][i]) < 1e-12) { Kg[i][i] = 1; Fg[i] = 0; }
  const esc = Array.from({ length: N - nPisos }, (_, i) => nPisos + i);
  const c = condensar(Kg, master, esc);
  const Fs = esc.map(i => [Fg[i]]);
  const KssFs = c.nEsc ? resolver(c.Kss, Fs).map(f => f[0]) : [];
  const Fc = master.map(i => Fg[i] - esc.reduce((sm, j, p) => sm + Kg[i][j] * KssFs[p], 0));
  const desplaz = (u: number[]) => {
    const d = new Array<number>(N).fill(0);
    u.forEach((v, i) => (d[i] = v));
    if (c.nEsc) {
      const rhs = c.Ksm.map((f, i) => [Fg[esc[i]] - f.reduce((s, kv, j) => s + kv * u[j], 0)]);
      const x = resolver(c.Kss, rhs);
      x.forEach((f, i) => (d[nPisos + i] = f[0]));
    }
    return d;
  };
  const fuerzasLocales = (u: number[]) => {
    const d = desplaz(u);
    return datos.map(({ b, A, B, r, g }) => {
      const dg = g.map(i => (i >= 0 ? d[i] : 0));
      const dl = r.T.map(f => f.reduce((s, v, j) => s + v * dg[j], 0));
      const f = r.k.map((fl, i) => fl.reduce((s, v, j) => s + v * dl[j], 0) - r.P[i]);
      return { b, A, B, r, f };
    });
  };
  return {
    cara, K: c.K, F: Fc,
    recuperar: u => fuerzasLocales(u).map(({ b, A, B, r, f }) => ({
      id: b.id, clase: b.clase, a: { s: A.s, z: A.z }, b: { s: B.s, z: B.z }, L: r.L,
      N: -f[0], Q: f[1], Ma: -f[2], Mb: f[5], Nb: f[3], Qb: -f[4],
      relA: b.relA, relB: b.relB, sec: b.sec, fraccion: b.fraccion, pa: r.pa, pb: r.pb, qa: r.qa, qb: r.qb,
    })),
    reacciones: u => {
      const out = new Map<number, { s: number; V: number; H: number }>();
      fuerzasLocales(u).forEach(({ A, B, r, f }) => {
        const c2 = r.c, s2 = r.s;
        // fuerzas de extremo sobre la barra en globales: F = Tᵀ f; la reacción del apoyo es esa misma fuerza
        const glob = (o: number) => ({ H: c2 * f[o] - s2 * f[o + 1], V: s2 * f[o] + c2 * f[o + 1] });
        for (const [q, o] of [[A, 0], [B, 3]] as const) if (q.piso === 0) {
          const gg = glob(o), x = out.get(q.id) ?? { s: q.s, V: 0, H: 0 };
          x.V += gg.V; x.H += gg.H; out.set(q.id, x);
        }
      });
      return [...out.values()];
    },
  };
}

/** ménsula de tabiques (Euler, un tramo por piso) condensada a los corrimientos de los pisos */
export function rigidezTabiques(zs: number[], EJ: (zMedio: number) => number): Mat {
  const n = zs.length - 1, N = 2 * n, Kg = ceros(N, N);
  // gdl: u_i = i − 1, φ_i = n + i − 1 (i = 1..n); la base (i = 0) está empotrada
  const gu = (i: number) => (i === 0 ? -1 : i - 1), gf = (i: number) => (i === 0 ? -1 : n + i - 1);
  for (let i = 0; i < n; i++) {
    const L = zs[i + 1] - zs[i], ei = EJ((zs[i] + zs[i + 1]) / 2);
    const b = (12 * ei) / L ** 3, d = (6 * ei) / L ** 2, e4 = (4 * ei) / L, e2 = (2 * ei) / L;
    const k = [[b, d, -b, d], [d, e4, -d, e2], [-b, -d, b, -d], [d, e2, -d, e4]];
    const g = [gu(i), gf(i), gu(i + 1), gf(i + 1)];
    for (let p = 0; p < 4; p++) for (let q = 0; q < 4; q++) if (g[p] >= 0 && g[q] >= 0) Kg[g[p]][g[q]] += k[p][q];
  }
  return condensar(Kg, Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => n + i)).K;
}

export interface ResultadoExo {
  zs: number[];
  /** corrimiento de cada piso con y sin exoesqueleto (m) */
  u: number[]; uSin: number[];
  /** viento de cada piso que toman los tabiques y el exo (t), y corte y momento de los tabiques en altura */
  Ftab: number[]; Fexo: number[]; Vtab: number[]; Mtab: number[]; Vsin: number[]; Msin: number[];
  /** fracción del momento volcador en la base que toma el exo (el corte puede repartirse distinto: interacción tabique-pórtico) */
  fraccionExo: number;
  /** corte en la base que toma el exo (t) */
  Vexo0: number;
  caras: { nombre: string; t: number; esfuerzos: EsfuerzoBarra[]; reacciones: { s: number; V: number; H: number }[]; Jeq: number; ancho: number }[];
  controles: ControlBarra[];
}
export interface ControlBarra { cara: string; id: string; clase: ClaseBarra; N: number; M: number; sigma: number; lambda: number; Ncr: number; estado: 'verifica' | 'no verifica' }

/**
 * Torre de tabiques + exoesqueleto bajo el viento de una dirección.
 * @param zs cotas de PB y de los pisos de arriba (de abajo hacia arriba)
 * @param W viento de cada piso 1..n (t), mismo orden que zs.slice(1)
 * @param EJ rigidez de los tabiques en cada tramo (t·m²), por la cota del medio del tramo
 * @param anchoCara distancia entre columnas de esquina en el sentido del viento (m); tCaras: posición transversal de cada cara
 * @param Eh módulo del hormigón (t/m²), para el J equivalente de cada cara
 */
export function calcularExo(def: ExoDef, zs: number[], W: number[], EJ: (z: number) => number, anchoCara: number, tCaras: number[], Eh: number): ResultadoExo {
  const n = zs.length - 1;
  const Kt = rigidezTabiques(zs, EJ);
  const caras = tCaras.map((t, i) => ({ t, c: condensarCara(cargarCara(armarCara(def, anchoCara, zs, `cara ${i + 1}`), def, zs, W), def.E, n) }));
  // viento por las losas (en los pisos) o, si la fachada cuelga del exo, ya puesto como carga de las barras de borde
  const Wl = def.viento === 'fachada' ? W.map(() => 0) : W;
  const P = Wl.map((w, i) => w + caras.reduce((s, c) => s + c.c.F[i], 0));
  const K = Kt.map((f, i) => f.map((v, j) => v + caras.reduce((s, c) => s + c.c.K[i][j], 0)));
  const u = resolver(K, P.map(w => [w])).map(f => f[0]);
  const uSin = resolver(Kt, W.map(w => [w])).map(f => f[0]);
  const mult = (A: Mat, x: number[]) => A.map(f => f.reduce((s, v, j) => s + v * x[j], 0));
  const Ftab = mult(Kt, u), Fexo = P.map((w, i) => w - Ftab[i]);
  const acumula = (F: number[]) => {
    const V = new Array<number>(n + 1).fill(0), M = new Array<number>(n + 1).fill(0);
    for (let i = n - 1; i >= 0; i--) V[i] = V[i + 1] + F[i];                      // V[i]: corte en el tramo de i a i+1 (y en el nivel i)
    for (let i = n - 1; i >= 0; i--) M[i] = M[i + 1] + V[i] * (zs[i + 1] - zs[i]);
    return { V, M };
  };
  const ct = acumula(Ftab), cs = acumula(W);
  // J equivalente de cada cara: el J de una ménsula de hormigón que se corre lo mismo que la cara sola bajo W
  const uRef = resolver(rigidezTabiques(zs, () => Eh * 1), W.map(w => [w])).map(f => f[0]);   // ménsula con J = 1 m⁴
  const res: ResultadoExo['caras'] = caras.map(({ t, c }) => {
    let Jeq = 0;
    try { const uc = resolver(c.K, W.map(w => [w])).map(f => f[0]); Jeq = uRef[n - 1] / uc[n - 1]; } catch { Jeq = 0; }
    return { nombre: c.cara.nombre, t, esfuerzos: c.recuperar(u), reacciones: c.reacciones(u), Jeq, ancho: anchoCara };
  });
  const controles: ControlBarra[] = [];
  res.forEach(c => c.esfuerzos.forEach(e => {
    const p = propsBarra(e);
    // a lo largo de la barra (con carga repartida, el máximo puede estar adentro)
    let sigma = 0, M = 0, Nc = 0;
    for (let i = 0; i <= 20; i++) { const f = esfuerzosEn(e, i / 20); sigma = Math.max(sigma, Math.abs(f.N) / p.A + Math.abs(f.M) / p.W); M = Math.max(M, Math.abs(f.M)); Nc = Math.min(Nc, f.N); }
    const lambda = e.L / p.i, Ncr = (Math.PI ** 2 * def.E * p.I) / e.L ** 2;
    const pandeo = Nc < 0 && (-Nc > Ncr / 1.7 || lambda > 200);
    controles.push({ cara: c.nombre, id: e.id, clase: e.clase, N: e.N, M, sigma, lambda, Ncr, estado: sigma <= def.sigmaAdm && !pandeo ? 'verifica' : 'no verifica' });
  }));
  return { zs, u, uSin, Ftab, Fexo, Vtab: ct.V, Mtab: ct.M, Vsin: cs.V, Msin: cs.M, fraccionExo: cs.M[0] ? 1 - ct.M[0] / cs.M[0] : 0, Vexo0: cs.V[0] - ct.V[0], caras: res, controles };
}

// ------------------------------------------------------------------ dimensionado: el exo más liviano que verifica
/** catálogo de tubos cuadrados (b × e, m), ordenado por área */
export const CATALOGO_TUBOS: Seccion[] = ([
  [0.15, 0.008], [0.2, 0.008], [0.2, 0.0125], [0.25, 0.0125], [0.3, 0.0125], [0.3, 0.016], [0.35, 0.016], [0.4, 0.016],
  [0.4, 0.02], [0.45, 0.02], [0.5, 0.02], [0.5, 0.025], [0.55, 0.025], [0.6, 0.025], [0.6, 0.03], [0.7, 0.03], [0.8, 0.03],
  [0.8, 0.04], [0.9, 0.04], [1.0, 0.04], [1.0, 0.05], [1.2, 0.05],
] as [number, number][]).map(([b, e]) => ({ b, e })).sort((u, v) => propsSeccion(u).A - propsSeccion(v).A);

/** lo que necesita calcularExo para un viento */
export interface EntradaExo { zs: number[]; W: number[]; EJ: (z: number) => number; ancho: number; tCaras: number[]; Eh: number; h: number }

/** peso del acero de las cuatro caras (t): Σ A·L·7,85 t/m³, con las caras de los dos vientos */
export function pesoExo(def: ExoDef, entradas: EntradaExo[]): number {
  // las columnas de las esquinas son de las dos caras que se cruzan: se cuentan una sola vez (con el primer viento)
  return entradas.reduce((s, en, i) => {
    const c = armarCara(def, en.ancho, en.zs);
    const esquina = (b: Barra) => b.clase === 'columna' && [b.a, b.b].every(k => Math.abs(Math.abs(c.nudos[k].s) - en.ancho / 2) < 1e-6);
    return s + en.tCaras.length * c.barras.reduce((q, b) => { if ((i > 0 && esquina(b)) || (b.fraccion ?? 1) < 1) return q; const A = c.nudos[b.a], B = c.nudos[b.b]; return q + propsSeccion(b.sec).A * Math.hypot(B.s - A.s, B.z - A.z) * 7.85; }, 0);
  }, 0);
}

export interface Dimensionado { def: ExoDef; verifica: boolean; peso: number; pasos: number; motivo: string }

/**
 * Busca el exo más liviano que verifica con los dos vientos: arranca con el tubo más chico del catálogo en las tres
 * clases y agranda, de a un paso, la clase de barra que falla (tensión, pandeo o esbeltez); si falla la flecha
 * (δ azotea > h / limiteH, h/500 si no se pide otra), agranda columnas y diagonales, que son las que dan la rigidez de la cara.
 */
export function dimensionarExo(base: ExoDef, entradas: EntradaExo[], maxPasos = 80): Dimensionado {
  const idx = { columna: 0, diagonal: 0, viga: 0 };
  const armar = (): ExoDef => ({ ...base, columna: CATALOGO_TUBOS[idx.columna], diagonal: CATALOGO_TUBOS[idx.diagonal], viga: CATALOGO_TUBOS[idx.viga] });
  const ult = CATALOGO_TUBOS.length - 1;
  for (let paso = 1; paso <= maxPasos; paso++) {
    const def = armar();
    const falla = { columna: false, diagonal: false, viga: false };
    let flecha = false;
    entradas.forEach(en => {
      const r = calcularExo(def, en.zs, en.W, en.EJ, en.ancho, en.tCaras, en.Eh);
      r.controles.forEach(c => { if (c.estado !== 'verifica') falla[c.clase] = true; });
      if (r.u[r.u.length - 1] > en.h / (base.limiteH ?? 500)) flecha = true;
    });
    if (!falla.columna && !falla.diagonal && !falla.viga && !flecha) return { def, verifica: true, peso: pesoExo(def, entradas), pasos: paso, motivo: 'verifica' };
    let movio = false;
    (['columna', 'diagonal', 'viga'] as const).forEach(k => { if (falla[k] && idx[k] < ult) { idx[k]++; movio = true; } });
    if (flecha && !falla.columna && !falla.diagonal) (['columna', 'diagonal'] as const).forEach(k => { if (idx[k] < ult) { idx[k]++; movio = true; } });
    if (!movio) return { def, verifica: false, peso: pesoExo(def, entradas), pasos: paso, motivo: 'ni el tubo más grande del catálogo alcanza: probá otra ficha, otro módulo o más separación' };
  }
  const def = armar();
  return { def, verifica: false, peso: pesoExo(def, entradas), pasos: maxPasos, motivo: 'no se encontró en los pasos previstos' };
}
