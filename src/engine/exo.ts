/**
 * Exoesqueleto: estructura de acero por fuera de la fachada que trabaja junto con los tabiques.
 *
 * Modelo (docs/plan_entrega, inciso 9):
 *  - Las losas son diafragmas rígidos: en cada piso i hay un solo corrimiento u_i en el sentido del viento.
 *  - Tabiques: ménsula empotrada en PB con E·J(z) (vigas de Euler por piso); se condensa a los u_i → K_tab.
 *  - Exoesqueleto: pórticos planos en las caras paralelas al viento (método directo de la rigidez, 3 gdl por nudo:
 *    u, w, φ), con columnas (viga-columna), diagonales (bielas, solo EA) y vigas o cinturones (viga). Los nudos de un
 *    mismo piso comparten u (diafragma) y se condensan w y φ → K_exo = Σ caras (Kuu − Kur·Krr⁻¹·Kru).
 *  - Sistema combinado: (K_tab + K_exo)·u = W → F_tab = K_tab·u, F_exo = K_exo·u, F_tab + F_exo = W.
 *  - Esfuerzos de cada barra: con u se recuperan w y φ de cada cara y, barra por barra, f = k_local · T · d.
 *    Cargas solo en los nudos: N y Q constantes en cada barra, M lineal entre sus extremos.
 * Unidades: t, m (E en t/m², A en m², I en m⁴).
 */

export type TipoExo = 'A' | 'B' | 'C' | 'D';
export const TIPOS_EXO: Record<TipoExo, { nombre: string; texto: string }> = {
  A: { nombre: 'Diagrid', texto: 'Diagonales en rombo en las caras, sin columnas intermedias: toman corte y flexión con las mismas barras.' },
  B: { nombre: 'Mega-marcos', texto: 'Columnas en las esquinas y vigas cada «módulo» pisos: trabajan como pórticos (rigidez por flexión).' },
  C: { nombre: 'Mega-columnas y cinturones', texto: 'Columnas en las esquinas atadas por reticulados cinturón (muy rígidos) en dos niveles.' },
  D: { nombre: 'Tubo arriostrado en X', texto: 'Columnas en las esquinas y cruces de San Andrés por módulos de pisos.' },
};

/** sección de una barra: tubo cuadrado b × e (m) */
export interface Seccion { b: number; e: number }
export const propsSeccion = (s: Seccion) => {
  const bi = Math.max(0, s.b - 2 * s.e);
  const A = s.b * s.b - bi * bi, I = (s.b ** 4 - bi ** 4) / 12;
  return { A, I, i: Math.sqrt(I / (A || 1)), c: s.b / 2, W: I / (s.b / 2 || 1) };
};

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
}
export const EXO_POR_DEFECTO: ExoDef = {
  tipo: 'D', separacion: 1, modulo: 4,
  columna: { b: 0.5, e: 0.03 }, diagonal: { b: 0.3, e: 0.0125 }, viga: { b: 0.4, e: 0.02 },
  E: 2.1e7, sigmaAdm: 14000,
};

export type ClaseBarra = 'columna' | 'diagonal' | 'viga';
export interface Nudo { id: number; s: number; z: number; piso: number }
export interface Barra { id: string; clase: ClaseBarra; a: number; b: number; A: number; I: number; sec: Seccion }
export interface Cara { nombre: string; nudos: Nudo[]; barras: Barra[] }

/**
 * Arma una cara (pórtico plano en s, z) del tipo pedido.
 * @param ancho distancia entre las columnas de esquina, en el sentido del viento (m)
 * @param zs cotas de los pisos sobre PB, de abajo hacia arriba; zs[0] = PB (base, empotrada)
 */
export function armarCara(def: ExoDef, ancho: number, zs: number[], nombre = 'cara'): Cara {
  const n = zs.length - 1, m = Math.max(1, Math.round(def.modulo));
  const nudos: Nudo[] = [], barras: Barra[] = [];
  const nudo = (s: number, k: number) => {
    let q = nudos.find(x => x.piso === k && Math.abs(x.s - s) < 1e-9);
    if (!q) { q = { id: nudos.length, s, z: zs[k], piso: k }; nudos.push(q); }
    return q.id;
  };
  const pc = propsSeccion(def.columna), pd = propsSeccion(def.diagonal), pv = propsSeccion(def.viga);
  const barra = (clase: ClaseBarra, a: number, b: number) => {
    if (a === b) return;                                       // barra de largo cero (módulos muy cortos)
    const p = clase === 'columna' ? pc : clase === 'diagonal' ? pd : pv, sec = clase === 'columna' ? def.columna : clase === 'diagonal' ? def.diagonal : def.viga;
    barras.push({ id: `${clase[0].toUpperCase()}${barras.filter(x => x.clase === clase).length + 1}`, clase, a, b, A: p.A, I: clase === 'diagonal' ? 0 : p.I, sec });
  };
  const s0 = -ancho / 2, s1 = ancho / 2;
  // niveles con nudos del exo: cada piso en las columnas (A: solo en los bordes de los diamantes)
  const mods: number[] = [];
  for (let k = 0; k <= n; k += m) mods.push(k);
  if (mods[mods.length - 1] !== n) mods.push(n);
  // un último módulo de un solo piso se junta con el anterior (en el diagrid el diamante necesita al menos 2 pisos)
  if (mods.length > 2 && mods[mods.length - 1] - mods[mods.length - 2] < 2) mods.splice(mods.length - 2, 1);
  if (def.tipo === 'A') {
    // diagrid: nudos en los bordes y en el centro; diamantes de «módulo» pisos de alto
    for (let j = 0; j + 1 < mods.length; j++) {
      const k0 = mods[j], k1 = mods[j + 1], km = Math.round((k0 + k1) / 2);
      const L0 = nudo(s0, k0), R0 = nudo(s1, k0), C0 = nudo(0, k0), Lm = nudo(s0, km), Rm = nudo(s1, km), L1 = nudo(s0, k1), R1 = nudo(s1, k1), C1 = nudo(0, k1);
      barra('diagonal', C0, Lm); barra('diagonal', C0, Rm); barra('diagonal', Lm, C1); barra('diagonal', Rm, C1);
      barra('diagonal', L0, Lm); barra('diagonal', Lm, L1); barra('diagonal', R0, Rm); barra('diagonal', Rm, R1);
      void L0; void R0; void L1; void R1;
    }
    // anillo (viga de borde) arriba y en la base del último módulo, para cerrar los diamantes
    barra('viga', nudo(s0, n), nudo(0, n)); barra('viga', nudo(0, n), nudo(s1, n));
    return { nombre, nudos, barras };
  }
  // columnas de esquina, de piso a piso
  for (const s of [s0, s1]) for (let k = 0; k < n; k++) barra('columna', nudo(s, k), nudo(s, k + 1));
  for (let j = 0; j + 1 < mods.length; j++) {
    const k0 = mods[j], k1 = mods[j + 1];
    if (def.tipo === 'D') {                          // cruz de San Andrés en el módulo
      barra('diagonal', nudo(s0, k0), nudo(s1, k1)); barra('diagonal', nudo(s1, k0), nudo(s0, k1));
    }
    if (def.tipo === 'B' || def.tipo === 'D') barra('viga', nudo(s0, k1), nudo(s1, k1));
  }
  if (def.tipo === 'C') {
    // dos cinturones: a la mitad y arriba, cada uno un reticulado de un módulo de alto (vigas arriba y abajo + X)
    const cint = [Math.max(m, Math.round(n / 2)), n];
    cint.forEach(kt => {
      const kb = Math.max(0, kt - Math.min(m, kt));
      barra('viga', nudo(s0, kt), nudo(s1, kt)); barra('viga', nudo(s0, kb), nudo(s1, kb));
      barra('diagonal', nudo(s0, kb), nudo(s1, kt)); barra('diagonal', nudo(s1, kb), nudo(s0, kt));
    });
  }
  return { nombre, nudos, barras };
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

/** rigidez de una barra de pórtico plano en coordenadas globales (u, w, φ en cada extremo) */
function rigidezBarra(E: number, A: number, I: number, x1: number, z1: number, x2: number, z2: number): { K: Mat; T: Mat; k: Mat; L: number } {
  const L = Math.hypot(x2 - x1, z2 - z1), c = (x2 - x1) / L, s = (z2 - z1) / L;
  const a = (E * A) / L, b = (12 * E * I) / L ** 3, d = (6 * E * I) / L ** 2, e4 = (4 * E * I) / L, e2 = (2 * E * I) / L;
  const k: Mat = [
    [a, 0, 0, -a, 0, 0], [0, b, d, 0, -b, d], [0, d, e4, 0, -d, e2],
    [-a, 0, 0, a, 0, 0], [0, -b, -d, 0, b, -d], [0, d, e2, 0, -d, e4],
  ];
  const T: Mat = ceros(6, 6);
  for (const o of [0, 3]) { T[o][o] = c; T[o][o + 1] = s; T[o + 1][o] = -s; T[o + 1][o + 1] = c; T[o + 2][o + 2] = 1; }
  const K = ceros(6, 6);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { let v = 0; for (let p = 0; p < 6; p++) for (let q = 0; q < 6; q++) v += T[p][i] * k[p][q] * T[q][j]; K[i][j] = v; }
  return { K, T, k, L };
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

/** cara armada y condensada a los pisos 1..n (el piso 0 es la base empotrada) */
export interface CaraCondensada { cara: Cara; K: Mat; recuperar: (u: number[]) => EsfuerzoBarra[]; reacciones: (u: number[]) => { s: number; V: number; H: number }[] }
export interface EsfuerzoBarra { id: string; clase: ClaseBarra; a: { s: number; z: number }; b: { s: number; z: number }; L: number; N: number; Q: number; Ma: number; Mb: number }

export function condensarCara(cara: Cara, E: number, nPisos: number): CaraCondensada {
  // numeración: gdl 0..n-1 = u de los pisos 1..n (master); después w y φ de cada nudo que no está en la base
  const master = Array.from({ length: nPisos }, (_, i) => i);
  const mapa = new Map<number, [number, number, number]>();   // nudo → índices globales (u, w, φ); −1 = fijo
  let k = nPisos;
  cara.nudos.forEach(q => {
    if (q.piso === 0) mapa.set(q.id, [-1, -1, -1]);
    else { mapa.set(q.id, [q.piso - 1, k, k + 1]); k += 2; }
  });
  const N = k, Kg = ceros(N, N);
  const datos = cara.barras.map(b => {
    const A = cara.nudos[b.a], B = cara.nudos[b.b];
    const r = rigidezBarra(E, b.A, b.I, A.s, A.z, B.s, B.z);
    const g = [...mapa.get(b.a)!, ...mapa.get(b.b)!];
    // biela: sin giro propio (los φ de sus nudos los dan las columnas; si un nudo solo tiene bielas, su φ queda suelto)
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if (g[i] >= 0 && g[j] >= 0) Kg[g[i]][g[j]] += r.K[i][j];
    return { b, A, B, r, g };
  });
  // gdl φ sin rigidez (nudos con solo bielas): se fijan para que Kss no sea singular (no cambia nada)
  for (let i = nPisos; i < N; i++) if (Math.abs(Kg[i][i]) < 1e-12) Kg[i][i] = 1;
  const esc = Array.from({ length: N - nPisos }, (_, i) => nPisos + i);
  const c = condensar(Kg, master, esc);
  const desplaz = (u: number[]) => {
    const d = new Array<number>(N).fill(0);
    u.forEach((v, i) => (d[i] = v));
    if (c.nEsc) {
      const rhs = c.Ksm.map(f => [-f.reduce((s, kv, j) => s + kv * u[j], 0)]);
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
      const f = r.k.map(fl => fl.reduce((s, v, j) => s + v * dl[j], 0));
      return { b, A, B, r, f, dg };
    });
  };
  return {
    cara, K: c.K,
    recuperar: u => fuerzasLocales(u).map(({ b, A, B, r, f }) => ({
      // convención: N > 0 tracción; Q y M de extremo con la convención de la viga (M en a y en b, horario +)
      id: b.id, clase: b.clase, a: { s: A.s, z: A.z }, b: { s: B.s, z: B.z }, L: r.L, N: -f[0], Q: f[1], Ma: -f[2], Mb: f[5],
    })),
    reacciones: u => {
      const out = new Map<number, { s: number; V: number; H: number }>();
      fuerzasLocales(u).forEach(({ A, B, r, f }) => {
        const c2 = (B.s - A.s) / r.L, s2 = (B.z - A.z) / r.L;
        // fuerzas de extremo en globales: F = Tᵀ f
        const glob = (o: number) => ({ H: c2 * f[o] - s2 * f[o + 1], V: s2 * f[o] + c2 * f[o + 1] });
        for (const [q, o] of [[A, 0], [B, 3]] as const) if (q.piso === 0) {
          const g = glob(o), x = out.get(q.id) ?? { s: q.s, V: 0, H: 0 };
          x.V += g.V; x.H += g.H; out.set(q.id, x);
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
  const caras = tCaras.map((t, i) => ({ t, c: condensarCara(armarCara(def, anchoCara, zs, `cara ${i + 1}`), def.E, n) }));
  const K = Kt.map((f, i) => f.map((v, j) => v + caras.reduce((s, c) => s + c.c.K[i][j], 0)));
  const u = resolver(K, W.map(w => [w])).map(f => f[0]);
  const uSin = resolver(Kt, W.map(w => [w])).map(f => f[0]);
  const mult = (A: Mat, x: number[]) => A.map(f => f.reduce((s, v, j) => s + v * x[j], 0));
  const Ftab = mult(Kt, u), Fexo = W.map((w, i) => w - Ftab[i]);
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
    const sec = e.clase === 'columna' ? def.columna : e.clase === 'diagonal' ? def.diagonal : def.viga, p = propsSeccion(sec);
    const M = Math.max(Math.abs(e.Ma), Math.abs(e.Mb));
    const sigma = Math.abs(e.N) / p.A + (e.clase === 'diagonal' ? 0 : M / p.W);
    const lambda = e.L / p.i, Ncr = (Math.PI ** 2 * def.E * p.I) / e.L ** 2;
    const pandeo = e.N < 0 && (-e.N > Ncr / 1.7 || lambda > 200);
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
    return s + en.tCaras.length * c.barras.reduce((q, b) => { if (i > 0 && esquina(b)) return q; const A = c.nudos[b.a], B = c.nudos[b.b]; return q + propsSeccion(b.sec).A * Math.hypot(B.s - A.s, B.z - A.z) * 7.85; }, 0);
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
