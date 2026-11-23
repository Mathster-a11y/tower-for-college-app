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

export type TipoExo = 'A' | 'B' | 'C' | 'D' | 'E' | 'L';
export const TIPOS_EXO: Record<TipoExo, { nombre: string; texto: string }> = {
  A: { nombre: 'Diagrid', texto: 'Diagonales en rombo en las caras, sin columnas intermedias: toman corte y flexión con las mismas barras.' },
  B: { nombre: 'Mega-marcos', texto: 'Columnas en las esquinas y vigas cada «módulo» pisos: trabajan como pórticos (rigidez por flexión).' },
  C: { nombre: 'Mega-columnas y cinturones', texto: 'Columnas en las esquinas atadas por reticulados cinturón (muy rígidos) en dos niveles.' },
  D: { nombre: 'Tubo arriostrado en X', texto: 'Columnas en las esquinas y cruces de San Andrés por módulos de pisos.' },
  E: { nombre: 'Chevrones a la columna central', texto: 'Una columna (mástil) en el medio de cada cara y, por módulo, diagonales en V que bajan de las esquinas al mástil: las esquinas cuelgan (como el Citicorp Center).' },
  L: { nombre: 'Libre (barra por barra)', texto: 'Sin dibujo armado: cada columna, diagonal y viga se dibuja a mano entre nudos de la cara (en «Diseño 3D»). Sirve sola o como una zona entre otras.' },
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
  /** ficha E: debajo del primer módulo el mástil es otra pieza (Citicorp: la supercolumna de 7,3 m), hasta la cota «hasta» */
  mastilBase?: { hasta: number; sec: Seccion };
  /**
   * ficha E, como el Citicorp: columnas a los cuartos de la cara que bajan a las diagonales a medio módulo (ahí la
   * diagonal tiene un nudo) y una viga a medio módulo de cuarto a cuarto pasando por el mástil
   */
  cuartos?: boolean;
  /** ficha E: la columna de esquina termina un piso abajo del nudo del tope de cada módulo (no llega a la esquina) */
  esquinaCortada?: boolean;
  /** tubos sin costura (CIRSOC 302, Tabla 2.2.1: límites de la pared un poco más amplios); por defecto, con costura */
  sinCostura?: boolean;
  /** cambios barra por barra, por el id de la barra (se borran si cambia la ficha o el módulo) */
  barras?: Record<string, CambioBarra>;
  /** barras agregadas a mano entre dos nudos de la cara (s, z en m); su id es N1, N2… */
  nuevas?: BarraNueva[];
  /**
   * cotas de los bordes de los módulos (m), de abajo arriba. Si están, mandan sobre «módulo» y «pisoInicio»: sirve
   * cuando los módulos no tienen todos la misma cantidad de niveles (pisos juntados) o terminan antes de la azotea
   * (una corona sin chevrones arriba del último módulo).
   */
  cortes?: number[];
  /** secciones por tramos de altura: desde la cota «desde», las barras de esa clase (o el mástil) cambian de sección */
  tramos?: TramoSeccion[];
  /** diagrid (ficha A): rombos por cara (1 = un rombo de esquina a esquina; más = nudos cada ancho / vanos) */
  vanos?: number;
  /**
   * tubo (fichas B, C y D): columnas intermedias de cada cara perpendicular al viento (las «alas» del tubo). Con las X o
   * las vigas que las atan, trabajan con las columnas de las esquinas: se suman a cada esquina (la mitad, porque cada
   * cara perpendicular la comparten las dos caras paralelas). Es el tubo sin «shear lag» (cota superior). Hancock: 5.
   */
  alas?: number;
  /** diagrid: separación horizontal de los nudos (m); si está, los vanos de cada cara salen de su ancho (Hearst: 40 ft) */
  pasoH?: number;
  /** las caras siguen la planta de cada nivel (B y L por nivel): columnas de esquina inclinadas, como el John Hancock */
  anchoVariable?: boolean;
  /** material de las barras: acero (por defecto) u hormigón; peso específico en t/m³ (7,85 el acero, 2,4 el hormigón) */
  material?: 'acero' | 'hormigon';
  gamma?: number;
  /** de dónde sale cada número del ejemplo (fuentes y supuestos), para mostrar en la etapa 08 */
  notas?: string[];
  /**
   * zonas en altura: desde la cota «desde» (m) hacia arriba, otra tipología (y su módulo y vanos). Vacío = toda la
   * torre con «tipo». La primera zona arranca en PB aunque su «desde» sea más alto. Entre zonas va una viga de
   * transición que ata los dos dibujos.
   */
  zonas?: ZonaExo[];
}
export interface ZonaExo { desde: number; tipo: TipoExo; modulo?: number | null; vanos?: number | null }
/** las zonas de la torre con sus niveles (índices de zs): sin zonas, una sola con la ficha */
export function zonasDe(def: ExoDef, zs: number[]): { tipo: TipoExo; kI: number; kF: number; modulo: number; vanos?: number; desde: number }[] {
  const n = zs.length - 1, m = Math.max(1, Math.round(def.modulo));
  if (!def.zonas?.length) return [{ tipo: def.tipo, kI: 0, kF: n, modulo: m, vanos: def.vanos, desde: zs[0] }];
  // cada zona arranca en el nivel más cercano a su cota; las que caen en el mismo nivel o arriba de todo se descartan
  const lista = [...def.zonas].sort((a, b) => a.desde - b.desde).map(z => {
    let k = 0; zs.forEach((zz, i) => { if (Math.abs(zz - z.desde) < Math.abs(zs[k] - z.desde)) k = i; });
    return { z, k };
  });
  lista[0].k = 0;
  const ok = lista.filter((x, i) => x.k < n && (i === 0 || x.k > lista[i - 1].k)).filter((x, i, a) => i === a.length - 1 || a[i + 1].k > x.k);
  return ok.map((x, i) => ({ tipo: x.z.tipo, kI: x.k, kF: i + 1 < ok.length ? ok[i + 1].k : n, modulo: Math.max(1, Math.round(x.z.modulo ?? m)), vanos: x.z.vanos ?? def.vanos, desde: zs[x.k] }));
}
export interface TramoSeccion { clase: ClaseBarra | 'mastil'; desde: number; sec: Seccion }
export interface BarraNueva {
  clase: ClaseBarra; a: [number, number]; b: [number, number]; sec?: Seccion; relA?: boolean; relB?: boolean;
  /** s de a y b como fracción del medio ancho de la cara en su cota (−1 = un borde, 0 = el medio, 1 = el otro): la barra cae en el mismo lugar en las caras de los dos vientos aunque tengan distinto ancho */
  enFraccion?: boolean;
}
export const EXO_POR_DEFECTO: ExoDef = {
  tipo: 'D', separacion: 1, modulo: 4,
  columna: { b: 0.5, e: 0.03 }, diagonal: { b: 0.3, e: 0.0125 }, viga: { b: 0.4, e: 0.02 },
  E: 2.1e7, sigmaAdm: 14000,
};
export const UNIONES_POR_DEFECTO = { columna: 'rigida', diagonal: 'articulada', viga: 'rigida', base: 'empotrada' } as const;
const GAMMA_ACERO = 7.85;
/** peso específico de las barras (t/m³) */
export const gammaExo = (def: ExoDef) => def.gamma ?? (def.material === 'hormigon' ? 2.4 : GAMMA_ACERO);

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
  /** ala de la ficha E: la mitad del mástil de una cara perpendicular (su acero se cuenta con esa cara) */
  deMastil?: boolean;
  /** parte de la sección que representa (ala: la mitad del mástil de una cara perpendicular, compartido por dos caras) */
  fraccion?: number;
}
export interface Cara { nombre: string; nudos: Nudo[]; barras: Barra[]; baseArticulada?: boolean }

/**
 * Arma una cara (pórtico plano en s, z) del tipo pedido, con sus uniones y los cambios barra por barra.
 * @param ancho distancia entre las columnas de esquina, en el sentido del viento (m)
 * @param zs cotas de los pisos sobre PB, de abajo hacia arriba; zs[0] = PB (base)
 */
export function armarCara(def: ExoDef, ancho: number, zs: number[], nombre = 'cara', anchos?: number[]): Cara {
  /** ancho de la cara en el nivel k (las caras de ancho variable siguen la planta de cada nivel) */
  const anchoK = (k: number) => (anchos && anchos[k] > 0 ? anchos[k] : ancho);
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
  // bordes de la cara en cada nivel (s0(k) y s1(k)); con ancho fijo son siempre ∓ancho/2
  const S0 = (k: number) => -anchoK(k) / 2, S1 = (k: number) => anchoK(k) / 2;
  /** cruz de San Andrés con las dos diagonales unidas en el cruce (así cada una tiene la mitad de luz) */
  const cruz = (a0: number, a1: number) => {
    const zc = (zs[a0] + zs[a1]) / 2, c = nudoEn(0, zc);
    barra('diagonal', nudo(S0(a0), a0), c); barra('diagonal', c, nudo(S1(a1), a1));
    barra('diagonal', nudo(S1(a0), a0), c); barra('diagonal', c, nudo(S0(a1), a1));
  };
  const anchoEnZ = (z: number) => {
    const k = zs.findIndex(zz => zz >= z - 1e-9);
    if (k <= 0) return anchoK(Math.max(0, k));
    const t = (z - zs[k - 1]) / (zs[k] - zs[k - 1] || 1);
    return anchoK(k - 1) + (anchoK(k) - anchoK(k - 1)) * t;
  };
  const enBorde = (k: number) => Math.abs(Math.abs(nudos[k].s) - anchoEnZ(nudos[k].z) / 2) < 1e-6;
  /** sección por tramos de altura: la del tramo más alto que empieza debajo del pie de la barra */
  const tramo = (clave: ClaseBarra | 'mastil', a: number, b: number, s: Seccion) => {
    const zb = Math.min(nudos[a].z, nudos[b].z);
    if (clave === 'mastil' && def.mastilBase && Math.max(nudos[a].z, nudos[b].z) <= def.mastilBase.hasta + 1e-6) return def.mastilBase.sec;
    const t = (def.tramos ?? []).filter(x => x.clase === clave && x.desde <= zb + 1e-6).sort((x, y) => y.desde - x.desde)[0];
    return t ? t.sec : s;
  };
  const barra = (clase: ClaseBarra, a: number, b: number, sec?: Seccion, clave?: 'mastil') => {
    if (a === b) return;                                       // barra de largo cero (módulos muy cortos)
    const s = tramo(clave ?? clase, a, b, sec ?? (clase === 'columna' ? def.columna : clase === 'diagonal' ? def.diagonal : def.viga)), p = propsSeccion(s);
    const rel = un[clase] === 'articulada';
    barras.push({ id: `${clase[0].toUpperCase()}${barras.filter(x => x.clase === clase).length + 1}`, clase, a, b, A: p.A, I: p.I, sec: s, relA: rel, relB: rel, borde: enBorde(a) && enBorde(b) });
  };
  /**
   * el dibujo de una tipología entre los niveles kI y kF (toda la torre o una zona). Las zonas comparten los nudos de
   * sus bordes: así una zona de diagrid arriba de una de cruces arranca de las mismas esquinas.
   */
  let nF = 0;
  /** nudos propios de las alas (mástil de la cara perpendicular), que no se comparten con las barras dibujadas */
  const nudosAla = new Set<number>();
  const zonal = !!def.zonas?.length;
  const patron = (tipo: TipoExo, kI: number, kF: number, m: number, vanos: number | undefined, pisoIni: number, cortes: number[]) => {
    if (tipo === 'L') return;                           // libre: solo las barras dibujadas a mano
    // niveles con nudos del exo (los bordes de cada módulo)
    const k0 = tipo === 'E' ? Math.min(kF - 1, Math.max(kI, kI + Math.round(pisoIni))) : kI;
    const mods: number[] = [];
    const porCortes = cortes.map(z => zs.findIndex(zz => Math.abs(zz - z) < 1e-3)).filter((k, i, a) => k >= kI && k <= kF && a.indexOf(k) === i).sort((a, b) => a - b);
    if (porCortes.length && zonal) { if (porCortes[0] !== kI) porCortes.unshift(kI); if (porCortes[porCortes.length - 1] !== kF) porCortes.push(kF); }
    if (porCortes.length >= 2) mods.push(...porCortes);
    else {
      for (let k = k0; k <= kF; k += m) mods.push(k);
      if (mods[mods.length - 1] !== kF) mods.push(kF);
      // un último módulo de un solo piso se junta con el anterior (en el diagrid el diamante necesita al menos 2 pisos)
      if (mods.length > 2 && mods[mods.length - 1] - mods[mods.length - 2] < 2) mods.splice(mods.length - 2, 1);
    }
    const kTope = mods[mods.length - 1];
    if (tipo === 'A') {
      // diagrid: nudos en los bordes y en el centro; diamantes de «módulo» pisos de alto
      // con varios vanos: en cada borde de módulo, nudos en el centro de cada vano; a media altura, en los límites de los vanos
      const nb = Math.max(1, Math.round(def.pasoH ? anchoK(mods[0]) / def.pasoH : (vanos ?? 1)));
      const centro = (i: number, k: number) => S0(k) + ((i + 0.5) * anchoK(k)) / nb, limite = (i: number, k: number) => S0(k) + (i * anchoK(k)) / nb;
      for (let j = 0; j + 1 < mods.length; j++) {
        const a0 = mods[j], a1 = mods[j + 1], km = Math.round((a0 + a1) / 2);
        for (let i = 0; i < nb; i++) {
          const C0 = nudo(centro(i, a0), a0), Lm = nudo(limite(i, km), km), Rm = nudo(limite(i + 1, km), km), C1 = nudo(centro(i, a1), a1);
          barra('diagonal', C0, Lm); barra('diagonal', C0, Rm); barra('diagonal', Lm, C1); barra('diagonal', Rm, C1);
        }
        const L0 = nudo(S0(a0), a0), R0 = nudo(S1(a0), a0), L1 = nudo(S0(a1), a1), R1 = nudo(S1(a1), a1), Lm = nudo(S0(km), km), Rm = nudo(S1(km), km);
        barra('diagonal', L0, Lm); barra('diagonal', Lm, L1); barra('diagonal', R0, Rm); barra('diagonal', Rm, R1);
      }
      // anillo (viga de borde) arriba, para cerrar los diamantes
      const anillo = [S0(kTope), ...Array.from({ length: nb }, (_, i) => centro(i, kTope)), S1(kTope)];
      for (let i = 0; i + 1 < anillo.length; i++) barra('viga', nudo(anillo[i], kTope), nudo(anillo[i + 1], kTope));
    } else if (tipo === 'E') {
      // mástil central de la base a la azotea; esquinas desde el primer módulo (abajo vuelan); V por módulo y viga en cada borde
      for (let k = kI; k < kF; k++) barra('columna', nudo(0, k), nudo(0, k + 1), def.mastil ?? def.columna, 'mastil');
      // esquinas desde el primer piso del exo (el primer tramo cuelga del chevron de arriba)
      // columna de esquina cortada: no llega al nudo del tope de cada módulo (el último piso de cada módulo no la tiene);
      // cada tramo se apoya abajo en el nudo del tope del módulo de abajo. En el primer módulo no hay nudo abajo (ahí está
      // la transición sobre las supercolumnas): su columna sigue hasta el nudo de arriba y cuelga de él.
      const topes = new Set(mods.slice(2));
      for (const lado of [S0, S1]) for (let k = mods[0]; k < kF; k++) {
        if (def.esquinaCortada && topes.has(k + 1)) continue;
        barra('columna', nudo(lado(k), k), nudo(lado(k + 1), k + 1));
      }
      const kMedio = (a0: number, a1: number) => { const zm = (zs[a0] + zs[a1]) / 2; let mejor = a0; zs.forEach((z, k) => { if (k > a0 && k < a1 && Math.abs(z - zm) < Math.abs(zs[mejor] - zm)) mejor = k; }); return mejor; };
      for (let j = 0; j + 1 < mods.length; j++) {
        const a0 = mods[j], a1 = mods[j + 1];
        if (def.cuartos && a1 - a0 >= 2) {
          // la diagonal pasa por el cuarto de la cara a medio módulo: ahí tiene un nudo (en un piso, si cae en uno)
          const km = kMedio(a0, a1), zm = zs[km], t = (zm - zs[a0]) / (zs[a1] - zs[a0]);
          for (const lado of [S0, S1]) {
            const sq = lado(a1) * t, q = nudo(sq, km);
            barra('diagonal', nudo(lado(a1), a1), q); barra('diagonal', q, nudo(0, a0));
          }
          // viga a medio módulo de cuarto a cuarto, pasando por el mástil
          barra('viga', nudo(S0(a1) * t, km), nudo(0, km)); barra('viga', nudo(0, km), nudo(S1(a1) * t, km));
        } else {
          barra('diagonal', nudo(S0(a1), a1), nudo(0, a0)); barra('diagonal', nudo(S1(a1), a1), nudo(0, a0));
        }
        barra('viga', nudo(S0(a1), a1), nudo(0, a1)); barra('viga', nudo(0, a1), nudo(S1(a1), a1));
      }
      // columnas a los cuartos: del nudo a medio módulo del primer módulo hasta arriba, piso por piso (llevan las losas a
      // las diagonales); se cruzan con las vigas del tope de cada módulo
      if (def.cuartos && mods.length >= 2 && mods[1] - mods[0] >= 2) {
        const k1 = kMedio(mods[0], mods[1]), t = (zs[k1] - zs[mods[0]]) / (zs[mods[1]] - zs[mods[0]]);
        for (const lado of [S0, S1]) {
          const s = lado(mods[1]) * t;
          for (let k = k1; k < kTope; k++) {
            // en el tope de cada módulo la columna toca la viga de borde en el cuarto: nudo propio sobre la viga
            barra('columna', nudo(s, k), nudo(s, k + 1));
          }
        }
        // las vigas del tope de cada módulo pasan por los nudos de los cuartos (se parten ahí)
        for (let i = barras.length - 1; i >= 0; i--) {
          const b = barras[i];
          if (b.clase !== 'viga') continue;
          const A = nudos[b.a], B = nudos[b.b];
          if (A.piso < 0 || A.piso !== B.piso) continue;
          const enCuarto = nudos.find(q => q.piso === A.piso && q.id !== A.id && q.id !== B.id && Math.min(A.s, B.s) < q.s - 1e-9 && q.s < Math.max(A.s, B.s) - 1e-9 && barras.some(c => c.clase === 'columna' && (c.a === q.id || c.b === q.id)));
          if (!enCuarto) continue;
          barras.splice(i, 1, { ...b, id: b.id, b: enCuarto.id }, { ...b, id: `${b.id}b`, a: enCuarto.id });
        }
      }
      // alas del tubo: los mástiles de las dos caras perpendiculares quedan en s = ±ancho/2 (en el sentido del viento) y
      // reciben de sus chevrones lo que bajan las esquinas; cada uno lo comparten dos caras paralelas → la mitad acá
      // (el ala se ata a la esquina solo en los niveles de los chevrones: por ahí le llega la carga; en los otros pisos
      //  tiene sus propios nudos, que comparten con la losa solo el corrimiento horizontal)
      const sm = def.mastil ?? def.columna, pm = propsSeccion(sm), atadas = new Set(kI > 0 ? mods : mods.slice(1));   // en una zona de arriba, el mástil de la cara perpendicular arranca de la esquina
      const nudoAla = (s: number, k: number) => {
        if (atadas.has(k)) return nudo(s, k);
        const sa = s * (1 + 1e-7);
        let q = nudos.find(x => x.piso === k && Math.abs(x.s - sa) < 1e-12);
        if (!q) { q = { id: nudos.length, s: sa, z: zs[k], piso: k }; nudos.push(q); nudosAla.add(q.id); }
        return q.id;
      };
      for (const lado of [S0, S1]) for (let k = kI; k < kF; k++) {
        const a = nudoAla(lado(k), k), b = nudoAla(lado(k + 1), k + 1), rel = un.columna === 'articulada';
        const sk = tramo('mastil', a, b, sm), pk = sk === sm ? pm : propsSeccion(sk);
        barras.push({ id: `F${++nF}`, clase: 'columna', a, b, A: pk.A / 2, I: pk.I / 2, sec: sk, relA: rel, relB: rel, borde: false, fraccion: 0.5, deMastil: true });
      }
    } else {
      // columnas de esquina, de piso a piso
      for (const lado of [S0, S1]) for (let k = kI; k < kF; k++) barra('columna', nudo(lado(k), k), nudo(lado(k + 1), k + 1));
      // alas: las columnas intermedias de las caras perpendiculares, sumadas a las esquinas (la mitad en cada cara)
      const na = Math.max(0, Math.round(def.alas ?? 0));
      if (na > 0) {
        const rel = un.columna === 'articulada';
        for (const lado of [S0, S1]) for (let k = kI; k < kF; k++) {
          const a = nudo(lado(k), k), b = nudo(lado(k + 1), k + 1), sk = tramo('columna', a, b, def.columna), pk = propsSeccion(sk);
          barras.push({ id: `F${++nF}`, clase: 'columna', a, b, A: (na * pk.A) / 2, I: (na * pk.I) / 2, sec: sk, relA: rel, relB: rel, borde: false, fraccion: na / 2 });
        }
      }
      for (let j = 0; j + 1 < mods.length; j++) {
        const a0 = mods[j], a1 = mods[j + 1];
        if (tipo === 'D') cruz(a0, a1);
        if (tipo === 'B' || tipo === 'D') barra('viga', nudo(S0(a1), a1), nudo(S1(a1), a1));
      }
      if (tipo === 'C') {
        // dos cinturones: a la mitad y arriba, cada uno un reticulado de un módulo de alto (vigas arriba y abajo + X)
        const cint = [kI + Math.max(m, Math.round((kF - kI) / 2)), kF].filter((k, i, a) => k <= kF && a.indexOf(k) === i);
        cint.forEach(kt => {
          const kb = Math.max(kI, kt - Math.min(m, kt - kI));
          barra('viga', nudo(S0(kt), kt), nudo(S1(kt), kt)); barra('viga', nudo(S0(kb), kb), nudo(S1(kb), kb));
          cruz(kb, kt);
        });
      }
    }
  };
  const zonas = zonasDe(def, zs);
  zonas.forEach(zn => patron(zn.tipo, zn.kI, zn.kF, zn.modulo, zn.vanos, zn.kI === 0 ? def.pisoInicio ?? 0 : 0, def.cortes ?? []));
  // entre zonas: una viga de transición de borde a borde que pasa por todos los nudos de ese nivel (ata los dos dibujos)
  zonas.slice(1).forEach(zn => {
    const k = zn.kI, enNivel = nudos.filter(q => q.piso === k).sort((x, y) => x.s - y.s);
    for (let i = 0; i + 1 < enNivel.length; i++) {
      const a = enNivel[i].id, b = enNivel[i + 1].id;
      if (!barras.some(x => (x.a === a && x.b === b) || (x.a === b && x.b === a))) barra('viga', a, b);
    }
  });
  // barras agregadas a mano (entre nudos que ya existen o en un piso)
  (def.nuevas ?? []).forEach((nb, i) => {
    // en fracción del ancho: se lleva a metros y se pega al nudo que ya esté ahí (a menos de 0,1 mm), así una barra
    // dibujada sobre un nudo de la ficha se une a él aunque la fracción esté redondeada
    const sDe = (q: [number, number]) => {
      if (!nb.enFraccion) return q[0];
      const sv = (q[0] * anchoEnZ(q[1])) / 2;
      const cerca = nudos.filter(x => !nudosAla.has(x.id) && Math.abs(x.z - q[1]) < 1e-6 && Math.abs(x.s - sv) < 1e-4).sort((x, y) => Math.abs(x.s - sv) - Math.abs(y.s - sv))[0];
      return cerca ? cerca.s : +sv.toFixed(9);
    };
    const a = nudoEn(sDe(nb.a), nb.a[1]), b = nudoEn(sDe(nb.b), nb.b[1]);
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
    if (peso) { c.za = c.zb = -gammaExo(def) * b.A; }
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
  // pivote nulo respecto de la escala de la matriz (un mecanismo deja un resto de redondeo, no un cero exacto)
  const escala = A0.reduce((mx, f, i) => Math.max(mx, Math.abs(f[i])), 0), cero = Math.max(1e-14, escala * 1e-13);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < cero) throw new Error('El exoesqueleto es un mecanismo (falta una barra para que sea estable).');
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
  // (con las articulaciones condensadas, ese giro puede quedar con un resto de redondeo: se compara con la rigidez típica)
  const maxDiag = Kg.reduce((m, f, i) => (i >= nPisos ? Math.max(m, Math.abs(f[i])) : m), 0);
  const umbral = Math.max(1e-12, maxDiag * 1e-11);
  for (let i = nPisos; i < N; i++) if (Math.abs(Kg[i][i]) < umbral && Kg[i].every((v, j) => j === i || Math.abs(v) < umbral)) { Kg[i].fill(0); Kg.forEach(f => { f[i] = 0; }); Kg[i][i] = 1; Fg[i] = 0; }
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
  // un piso sin tabiques que tomen viento (EJ = 0) queda con una rigidez despreciable, para que el sistema siga armado
  const eis = Array.from({ length: n }, (_, i) => Math.max(0, EJ((zs[i] + zs[i + 1]) / 2) || 0));
  const piso = Math.max(...eis, 1) * 1e-9;
  for (let i = 0; i < n; i++) {
    const L = zs[i + 1] - zs[i], ei = Math.max(eis[i], piso);
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
export function calcularExo(def: ExoDef, zs: number[], W: number[], EJ: (z: number) => number, anchoCara: number, tCaras: number[], Eh: number, anchos?: number[]): ResultadoExo {
  const n = zs.length - 1;
  const Kt = rigidezTabiques(zs, EJ);
  const caras = tCaras.map((t, i) => ({ t, c: condensarCara(cargarCara(armarCara(def, anchoCara, zs, `cara ${i + 1}`, anchos), def, zs, W), def.E, n) }));
  // viento por las losas (en los pisos) o, si la fachada cuelga del exo, ya puesto como carga de las barras de borde
  const Wl = def.viento === 'fachada' ? W.map(() => 0) : W;
  const P = Wl.map((w, i) => w + caras.reduce((s, c) => s + c.c.F[i], 0));
  const K = Kt.map((f, i) => f.map((v, j) => v + caras.reduce((s, c) => s + c.c.K[i][j], 0)));
  const u = resolver(K, P.map(w => [w])).map(f => f[0]);
  // sin exo: si arriba no hay tabiques que tomen viento (núcleo solo de gravedad) la ménsula no existe → sin número
  let uSin: number[];
  const sinTabiques = zs.slice(1).some((z, i) => !(EJ((zs[i] + z) / 2) > 0));
  try { uSin = resolver(Kt, W.map(w => [w])).map(f => f[0]); if (sinTabiques || uSin.some(x => !isFinite(x))) throw new Error('singular'); } catch { uSin = W.map(() => NaN); }
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
    // los pisos sin nudos en la cara (diagrid: solo hay nudos cada medio módulo) pasan su viento a los de al lado con una
    // ménsula muy blanda (J = 10⁻⁴ m⁴), como lo hacen la fachada y las losas; no cambia la rigidez de la cara
    const Kpuente = rigidezTabiques(zs, () => Eh * 1e-4);
    try { const uc = resolver(c.K.map((f, i) => f.map((v, j) => v + Kpuente[i][j])), W.map(w => [w])).map(f => f[0]); Jeq = uRef[n - 1] / uc[n - 1]; } catch { Jeq = 0; }
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
  // megacolumnas y megadiagonales (torres muy altas: Hancock, Citicorp)
  [1.2, 0.06], [1.4, 0.06], [1.4, 0.08], [1.6, 0.08], [1.8, 0.08], [1.8, 0.1], [2.0, 0.1], [2.0, 0.125],
] as [number, number][]).map(([b, e]) => ({ b, e })).sort((u, v) => propsSeccion(u).A - propsSeccion(v).A);

/** hormigón: barras macizas cuadradas de 30 a 200 cm (e = b/2) */
export const CATALOGO_HORMIGON: Seccion[] = Array.from({ length: 18 }, (_, i) => { const b = +(0.3 + 0.1 * i).toFixed(2); return { b, e: b / 2 }; });
const catalogo = (def: ExoDef) => (def.material === 'hormigon' ? CATALOGO_HORMIGON : CATALOGO_TUBOS);

/** lo que necesita calcularExo para un viento */
export interface EntradaExo { zs: number[]; W: number[]; EJ: (z: number) => number; ancho: number; tCaras: number[]; Eh: number; h: number; /** ancho de la cara en cada cota de zs (caras que siguen la planta) */ anchos?: number[] }

/** peso del acero de las cuatro caras (t): Σ A·L·7,85 t/m³, con las caras de los dos vientos */
export function pesoExo(def: ExoDef, entradas: EntradaExo[]): number {
  // las columnas de las esquinas son de las dos caras que se cruzan: se cuentan una sola vez (con el primer viento)
  return entradas.reduce((s, en, i) => {
    const c = armarCara(def, en.ancho, en.zs, 'cara', en.anchos);
    const anchoEn = (k: number) => (c.nudos[k].piso >= 0 ? en.anchos?.[c.nudos[k].piso] ?? en.ancho : en.ancho);
    const esquina = (b: Barra) => b.clase === 'columna' && (b.fraccion ?? 1) === 1 && [b.a, b.b].every(k => Math.abs(Math.abs(c.nudos[k].s) - anchoEn(k) / 2) < 1e-6);
    // las alas del mástil (ficha E) son de otra cara: no se cuentan; las alas del tubo (columnas intermedias de las caras
    // perpendiculares) sí, con su cantidad (cada cara perpendicular aparece una vez en cada viento como ala)
    const factor = (b: Barra) => (b.fraccion === undefined || b.fraccion === 1 ? 1 : b.deMastil ? 0 : b.fraccion);
    return s + en.tCaras.length * c.barras.reduce((q, b) => { if ((i > 0 && esquina(b)) || !factor(b)) return q; const A = c.nudos[b.a], B = c.nudos[b.b]; return q + factor(b) * propsSeccion(b.sec).A * Math.hypot(B.s - A.s, B.z - A.z) * gammaExo(def); }, 0);
  }, 0);
}

export interface Dimensionado { def: ExoDef; verifica: boolean; peso: number; pasos: number; motivo: string }

/**
 * Busca el exo más liviano que verifica con los dos vientos: arranca con el tubo más chico del catálogo en las tres
 * clases y agranda, de a un paso, la clase de barra que falla (tensión, pandeo o esbeltez); si falla la flecha
 * (δ azotea > h / limiteH, h/500 si no se pide otra), agranda columnas y diagonales, que son las que dan la rigidez de la cara.
 */
export function dimensionarExo(base: ExoDef, entradas: EntradaExo[], maxPasos = 80): Dimensionado {
  const CAT = catalogo(base);
  const idx = { columna: 0, diagonal: 0, viga: 0, mastil: 0 };
  const conMastil = base.tipo === 'E' || !!base.zonas?.some(z => z.tipo === 'E');
  // ficha E: el mástil también se dimensiona; si se afina en altura (tramos), arriba va tres tamaños más chico
  const armar = (): ExoDef => ({
    ...base, columna: CAT[idx.columna], diagonal: CAT[idx.diagonal], viga: CAT[idx.viga],
    ...(conMastil ? { mastil: CAT[idx.mastil], tramos: (base.tramos ?? []).map(t => (t.clase === 'mastil' ? { ...t, sec: CAT[Math.max(0, idx.mastil - 3)] } : t)) } : {}),
  });
  const ult = CAT.length - 1;
  for (let paso = 1; paso <= maxPasos; paso++) {
    const def = armar();
    const falla = { columna: false, diagonal: false, viga: false };
    let flecha = false;
    entradas.forEach(en => {
      const r = calcularExo(def, en.zs, en.W, en.EJ, en.ancho, en.tCaras, en.Eh, en.anchos);
      r.controles.forEach(c => { if (c.estado !== 'verifica') falla[c.clase] = true; });
      if (r.u[r.u.length - 1] > en.h / (base.limiteH ?? 500)) flecha = true;
    });
    // acero: además, el CIRSOC 301 (estados límite) con 1,2·D + 1,6·W (se mira cuando ya pasa lo del curso: es más lento)
    if (!falla.columna && !falla.diagonal && !falla.viga && !flecha && base.material !== 'hormigon')
      entradas.forEach(en => cirsoc301(def, en.zs, en.W, en.EJ, en.ancho, en.tCaras, en.Eh, en.anchos).forEach(c => { if (!c.verifica) falla[c.clase] = true; }));
    if (!falla.columna && !falla.diagonal && !falla.viga && !flecha) return { def, verifica: true, peso: pesoExo(def, entradas), pasos: paso, motivo: 'verifica' };
    let movio = false;
    (['columna', 'diagonal', 'viga'] as const).forEach(k => { if (falla[k] && idx[k] < ult) { idx[k]++; movio = true; } });
    // en la ficha E las columnas que fallan pueden ser el mástil (es una columna): crece con ellas
    if (conMastil && (falla.columna || flecha) && idx.mastil < ult) { idx.mastil++; movio = true; }
    if (flecha && !falla.columna && !falla.diagonal) (['columna', 'diagonal'] as const).forEach(k => { if (idx[k] < ult) { idx[k]++; movio = true; } });
    // la clase que falla ya está en el tubo más grande: se agrandan las otras (las diagonales y las vigas le sacan carga)
    if (!movio && (falla.columna || falla.diagonal || falla.viga || flecha)) (['diagonal', 'viga', 'columna'] as const).forEach(k => { if (!movio && idx[k] < ult) { idx[k]++; movio = true; } });
    if (!movio) return { def, verifica: false, peso: pesoExo(def, entradas), pasos: paso, motivo: 'ni el tubo más grande del catálogo alcanza: probá otra ficha, otro módulo o más separación' };
  }
  const def = armar();
  return { def, verifica: false, peso: pesoExo(def, entradas), pasos: maxPasos, motivo: 'no se encontró en los pasos previstos' };
}

// ------------------------------------------------------------------ viento de cuarto (45°)
export interface FilaCuarto { z: number; NA: number; NB: number; N45: number; razon: number }
/**
 * Viento a 45°: cada cara recibe 0,71 (= cos 45°) del viento de frente y las dos direcciones actúan juntas
 * (superposición lineal: 0,71·A + 0,71·B). Las columnas de las esquinas son de dos caras a la vez: suman las dos
 * partes. Se toma la peor esquina (los dos vientos con el signo que suma) y |N| de la columna de esquina más cargada
 * de cada tramo. razon = N45 / máx(NA, NB): 1,41 si las dos caras tiran igual.
 */
export function vientoDeCuarto(rA: ResultadoExo, rB: ResultadoExo, factor = Math.SQRT1_2): FilaCuarto[] {
  const esquinas = (r: ResultadoExo) => {
    const m = new Map<number, number>();
    r.caras.forEach(c => {
      const cols = c.esfuerzos.filter(e => e.clase === 'columna' && (e.fraccion ?? 1) === 1 && Math.abs(e.a.s) > 1e-6);
      cols.forEach(e => {
        const zb = Math.min(e.a.z, e.b.z), sMax = Math.max(...cols.filter(x => Math.abs(Math.min(x.a.z, x.b.z) - zb) < 1e-6).map(x => Math.abs(x.a.s)));
        if (Math.abs(Math.abs(e.a.s) - sMax) > 1e-6) return;
        const k = Math.round(zb * 1000) / 1000;
        m.set(k, Math.max(m.get(k) ?? 0, Math.abs(e.N)));
      });
    });
    return m;
  };
  const a = esquinas(rA), b = esquinas(rB), c45 = factor;
  return [...a.keys()].filter(z => b.has(z)).sort((x, y) => x - y).map(z => {
    const NA = a.get(z)!, NB = b.get(z)!, N45 = c45 * (NA + NB);
    return { z, NA, NB, N45, razon: Math.max(NA, NB) > 1e-9 ? N45 / Math.max(NA, NB) : 0 };
  });
}

// ------------------------------------------------------------------ CIRSOC 301 (estados límite, barras de acero)
/** acero F-24 del CIRSOC 301: Fy = 235 MPa ≈ 24 000 t/m² (la tensión admisible de la app, 14 000 t/m², es ≈ 0,6·Fy) */
export const FY_F24 = 24000;
export interface Cirsoc301Barra {
  cara: string; id: string; clase: ClaseBarra;
  /** esfuerzos mayorados (t, tm): 1,2·D + 1,6·W con el viento en los dos sentidos (el peor) */
  Pu: number; Mu: number;
  /** resistencias de diseño: φc·Pn (compresión), φt·Pn (tracción), φb·Mn */
  phiPc: number; phiPt: number; phiMn: number;
  /** esbeltez reducida λc = (k·L / r π)·√(Fy/E) y relación ancho-espesor de la pared */
  lambdaC: number; bt: number;
  /** interacción (H1-1a o H1-1b): ≤ 1 verifica */
  ratio: number; ecuacion: 'H1-1a' | 'H1-1b';
  /** combinación que manda */
  combinacion: string;
  /** pared del tubo (CIRSOC 302, Tabla 2.2.1): compacta, no compacta o esbelta (en flexión y en compresión) */
  pared: 'compacta' | 'no compacta' | 'esbelta';
  verifica: boolean;
}
/**
 * combinación de cargas para las barras del exo: D = peso propio, W = viento. Con «otro», un viento oblicuo
 * (quartering): la cara toma la fracción W de su viento de frente y las columnas de esquina, además, «otro» del
 * viento perpendicular (son de las dos caras).
 */
export interface CombExo { nombre: string; D: number; W: number; otro?: number }
/** la del curso (viento de servicio del 102-2005): 1,2·D + 1,6·W */
export const COMBOS_CURSO: CombExo[] = [{ nombre: '1,2 D + 1,6 W', D: 1.2, W: 1.6 }];
/** CIRSOC 101-25 con el viento de resistencia del 102-25 (1,0 W): 1,4 D; 1,2 D + 1,0 W; 0,9 D + 1,0 W */
export const COMBOS_101_25: CombExo[] = [{ nombre: '1,4 D', D: 1.4, W: 0 }, { nombre: '1,2 D + 1,0 W', D: 1.2, W: 1 }, { nombre: '0,9 D + 1,0 W', D: 0.9, W: 1 }];
/**
 * vientos oblicuos del 102-25 (Fig. 2.4-8): caso 3, 75 % de los dos vientos a la vez; caso 4, 56,3 % de los dos (con
 * sus torsiones, que el modelo plano de las caras no toma)
 */
export const COMBOS_OBLICUOS_101_25: CombExo[] = [
  { nombre: '1,2 D + 1,0 W · caso 3 (0,75 A + 0,75 B)', D: 1.2, W: 0.75, otro: 0.75 }, { nombre: '0,9 D + 1,0 W · caso 3 (0,75 A + 0,75 B)', D: 0.9, W: 0.75, otro: 0.75 },
  { nombre: '1,2 D + 1,0 W · caso 4 (0,563 A + 0,563 B)', D: 1.2, W: 0.563, otro: 0.563 },
];
/** el del curso: viento a 45°, cada cara con cos 45° de su viento de frente (como se revisó el Citicorp en 1978) */
export const COMBOS_OBLICUOS_CURSO: CombExo[] = [{ nombre: '1,2 D + 1,6 W · a 45° (0,71 A + 0,71 B)', D: 1.2, W: 1.6 * Math.SQRT1_2, otro: 1.6 * Math.SQRT1_2 }];

/**
 * esfuerzos de las columnas de esquina con el viento perpendicular, por altura: el mayor |N| y |M| de las columnas de
 * esquina de cada tramo (la peor esquina, con el viento en el sentido que suma)
 */
export function esquinasPorAltura(r: ResultadoExo): Map<number, { N: number; M: number }> {
  const m = new Map<number, { N: number; M: number }>();
  r.caras.forEach(c => {
    const cols = c.esfuerzos.filter(e => e.clase === 'columna' && (e.fraccion ?? 1) === 1 && Math.abs(e.a.s) > 1e-6);
    cols.forEach(e => {
      const zb = Math.min(e.a.z, e.b.z), sMax = Math.max(...cols.filter(x => Math.abs(Math.min(x.a.z, x.b.z) - zb) < 1e-6).map(x => Math.abs(x.a.s)));
      if (Math.abs(Math.abs(e.a.s) - sMax) > 1e-6) return;
      const k = Math.round(zb * 1000) / 1000, prev = m.get(k) ?? { N: 0, M: 0 };
      let Mmax = 0; for (let i = 0; i <= 20; i++) Mmax = Math.max(Mmax, Math.abs(esfuerzosEn(e, i / 20).M));
      m.set(k, { N: Math.max(prev.N, Math.abs(e.N)), M: Math.max(prev.M, Mmax) });
    });
  });
  return m;
}
/** ¿es columna de esquina? (la misma regla que esquinasPorAltura) */
function esColumnaEsquina(c: { esfuerzos: EsfuerzoBarra[] }, e: EsfuerzoBarra): boolean {
  if (e.clase !== 'columna' || (e.fraccion ?? 1) !== 1 || Math.abs(e.a.s) <= 1e-6) return false;
  const zb = Math.min(e.a.z, e.b.z);
  const sMax = Math.max(...c.esfuerzos.filter(x => x.clase === 'columna' && (x.fraccion ?? 1) === 1 && Math.abs(Math.min(x.a.z, x.b.z) - zb) < 1e-6).map(x => Math.abs(x.a.s)));
  return Math.abs(Math.abs(e.a.s) - sMax) <= 1e-6;
}
/**
 * CIRSOC 302 (Tabla 2.2.1): límites de la relación ancho-espesor de la pared de un tubo rectangular. Con costura
 * (los tubos estructurales soldados, lo común): λp = 1,05 √(E/Fy) en flexión, λr = 1,30 √(E/Fy); sin costura:
 * 1,12 y 1,40.
 */
export const limitesPared = (E: number, Fy: number, costura = true) => { const k = Math.sqrt(E / Fy); return costura ? { lp: 1.05 * k, lr: 1.3 * k } : { lp: 1.12 * k, lr: 1.4 * k }; };
/**
 * Verificación de las barras de acero con el CIRSOC 301 (2005, método LRFD, el de la AISC):
 *  - combinación 1,2·D + 1,6·W (D: peso propio del exo; W: el viento de la planilla). Se calculan aparte, con el mismo
 *    modelo, y se superponen barra por barra con el viento en los dos sentidos.
 *  - tracción: φt·Pn = 0,9·Fy·Ag;  compresión: λc = k·L/(r·π)·√(Fy/E), Fcr = 0,658^(λc²)·Fy si λc ≤ 1,5 y
 *    0,877/λc²·Fy si no; φc·Pn = 0,85·Fcr·Ag (k = 1: las barras van de nudo a nudo);
 *  - flexión: tubo compacto, φb·Mn = 0,9·Z·Fy (Z = (b³ − bi³)/4);
 *  - interacción (capítulo H): Pu/φPn ≥ 0,2 → Pu/φPn + 8/9·Mu/φbMn ≤ 1; si no, Pu/(2φPn) + Mu/φbMn ≤ 1.
 *  - pared del tubo: b/t ≤ 1,40·√(E/Fy) (si no, la pared abolla antes: se avisa como que no verifica).
 */
export function cirsoc301(def: ExoDef, zs: number[], W: number[], EJ: (z: number) => number, ancho: number, tCaras: number[], Eh: number, anchos?: number[], Fy = FY_F24,
  op: { combos?: CombExo[]; costura?: boolean; /** el viento perpendicular, para los vientos oblicuos (combos con «otro») */ otro?: EntradaExo } = {}): Cirsoc301Barra[] {
  const combos = (op.combos ?? COMBOS_CURSO).filter(c => !c.otro || op.otro);
  const rW = calcularExo({ ...def, pesoPropio: false }, zs, W, EJ, ancho, tCaras, Eh, anchos);
  const esqOtro = op.otro ? esquinasPorAltura(calcularExo({ ...def, pesoPropio: false }, op.otro.zs, op.otro.W, op.otro.EJ, op.otro.ancho, op.otro.tCaras, op.otro.Eh, op.otro.anchos)) : null;
  const rD = calcularExo({ ...def, pesoPropio: true }, zs, W.map(() => 0), EJ, ancho, tCaras, Eh, anchos);
  const out: Cirsoc301Barra[] = [];
  rW.caras.forEach((c, ic) => c.esfuerzos.forEach(eW => {
    const eD = rD.caras[ic].esfuerzos.find(x => x.id === eW.id);
    if (!eD) return;
    // a lo largo de la barra: N y M de cada carga en 21 puntos; el viento puede venir del otro lado (signo ±)
    const f = eW.fraccion ?? 1, s = eW.sec, bi = Math.max(0, s.b - 2 * s.e);
    const p = propsSeccion(s), A = p.A * f, r = p.i, Z = ((s.b ** 3 - bi ** 3) / 4) * f, S = p.W * f;
    const lambdaC = (eW.L / (r * Math.PI)) * Math.sqrt(Fy / def.E);
    const Fcr = lambdaC <= 1.5 ? 0.658 ** (lambdaC ** 2) * Fy : (0.877 / lambdaC ** 2) * Fy;
    // pared del tubo (CIRSOC 302, Tabla 2.2.1). La pieza equivalente de la base (Citicorp: la supercolumna son cuatro
    // barras en las esquinas de un cuadrado de 7,3 m) y las barras macizas no son tubos de pared delgada.
    const equivalente = (!!def.mastilBase && s === def.mastilBase.sec) || s.e >= s.b / 2 - 1e-9;
    const bt = s.e > 0 ? bi / s.e : Infinity, lim = limitesPared(def.E, Fy, op.costura ?? true);
    const pared: Cirsoc301Barra['pared'] = equivalente || bt <= lim.lp ? 'compacta' : bt <= lim.lr ? 'no compacta' : 'esbelta';
    // flexión: compacta Mn = Mp = Z·Fy; no compacta, entre Mp y Mr = Fy·S según λ (302, cap. 3)
    const Mp = Z * Fy, Mr = S * Fy;
    const Mn = pared === 'compacta' ? Mp : pared === 'no compacta' ? Mp - (Mp - Mr) * ((bt - lim.lp) / (lim.lr - lim.lp)) : Mr;
    const phiPc = 0.85 * Fcr * A, phiPt = 0.9 * Fy * A, phiMn = 0.9 * Mn;
    const inter = (P: number, phiP: number, M: number) => { const q = phiP > 0 ? P / phiP : Infinity; return q >= 0.2 ? { v: q + (8 / 9) * (M / phiMn), e: 'H1-1a' as const } : { v: q / 2 + M / phiMn, e: 'H1-1b' as const }; };
    // cada combinación, con el viento de los dos lados, en 21 puntos de la barra
    let peor = { v: -1, e: 'H1-1b' as 'H1-1a' | 'H1-1b', comb: '' }, PuPeor = 0, MuMax = 0;
    // viento oblicuo: solo cambia las columnas de esquina (las demás barras toman una fracción de su viento de frente)
    const esquina = esqOtro && esColumnaEsquina(c, eW);
    const otro = esquina ? esqOtro!.get(Math.round(Math.min(eW.a.z, eW.b.z) * 1000) / 1000) ?? null : null;
    for (const cb of combos) for (const sg of cb.W ? [1, -1] : [1]) {
      if (cb.otro && !otro) continue;
      let Pc = 0, Pt = 0, Mu = 0, MuC = 0, MuT = 0;
      for (let i = 0; i <= 20; i++) {
        const fw = esfuerzosEn(eW, i / 20), fd = esfuerzosEn(eD, i / 20);
        // la parte del viento perpendicular suma con el mismo signo (la peor esquina); la flexión de la otra cara se suma
        // (flexión en los dos planos de un tubo cuadrado, del lado seguro)
        const Nw = sg * fw.N, extraN = cb.otro && otro ? cb.otro * otro.N * (Nw >= 0 ? 1 : -1) : 0;
        const N = cb.D * fd.N + cb.W * Nw + extraN, M = Math.abs(cb.D * fd.M + cb.W * sg * fw.M) + (cb.otro && otro ? cb.otro * otro.M : 0);
        if (-N > Pc) { Pc = -N; MuC = M; } else if (-N === Pc) MuC = Math.max(MuC, M);
        if (N > Pt) { Pt = N; MuT = M; } else if (N === Pt) MuT = Math.max(MuT, M);
        Mu = Math.max(Mu, M);
      }
      MuMax = Math.max(MuMax, Mu);
      for (const x of [inter(Pc, phiPc, MuC), inter(Pt, phiPt, MuT), { v: Mu / phiMn, e: 'H1-1b' as const }]) if (x.v > peor.v) { peor = { ...x, comb: cb.nombre }; PuPeor = Pc >= Pt ? -Pc : Pt; }
    }
    // una pared esbelta abolla antes de llegar a la resistencia: no verifica (habría que reducir el área, 302 apéndice)
    out.push({ cara: c.nombre, id: eW.id, clase: eW.clase, Pu: PuPeor, Mu: MuMax, phiPc, phiPt, phiMn, lambdaC, bt, ratio: peor.v, ecuacion: peor.e, combinacion: peor.comb, pared, verifica: peor.v <= 1 && pared !== 'esbelta' });
  }));
  return out;
}
