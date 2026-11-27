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
import type { RotoRes } from './planilla';
import { cargasMalla, fuerzasAnillos, proyectarMalla, pesoMalla, type BarraReal, type MallaDef, type MallaGeo } from './exoMalla';

export type TipoExo = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'L' | 'M';
export const TIPOS_EXO: Record<TipoExo, { nombre: string; texto: string }> = {
  A: { nombre: 'Diagrid', texto: 'Diagonales en rombo en las caras, sin columnas intermedias: toman corte y flexión con las mismas barras.' },
  B: { nombre: 'Mega-marcos', texto: 'Columnas en las esquinas y vigas cada «módulo» pisos: trabajan como pórticos (rigidez por flexión).' },
  C: { nombre: 'Mega-columnas y cinturones', texto: 'Columnas en las esquinas atadas por reticulados cinturón (muy rígidos) en dos niveles.' },
  D: { nombre: 'Tubo arriostrado en X', texto: 'Columnas en las esquinas y cruces de San Andrés por módulos de pisos.' },
  F: { nombre: 'Núcleo con outriggers', texto: 'Brazos reticulados de un piso de alto que salen del núcleo de tabiques hacia las columnas del perímetro (con un cinturón, todas las de la cara): cuando el núcleo se flexiona, las columnas lo frenan con un par de fuerzas (Taipei 101, Shanghai Tower).' },
  E: { nombre: 'Chevrones a la columna central', texto: 'Una columna (mástil) en el medio de cada cara y, por módulo, diagonales en V que bajan de las esquinas al mástil: las esquinas cuelgan (como el Citicorp Center).' },
  M: { nombre: 'Malla sobre la fachada', texto: 'La malla sigue la fachada real de cada nivel (cilindro, elipse, polígono, torre que se angosta o se corre): diagrid o columnas con cruces, calculada entera con el viento de cada lado.' },
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
  /**
   * las losas apoyan en el exo: una franja de «franja» m a lo largo de cada fachada baja al exo en cada piso (el resto
   * va al núcleo y a los tabiques). qD: peso (0,7 t/m², el de la planilla); qL: sobrecarga (0,2 t/m²: 0,9 − 0,7).
   */
  losas?: LosasExo;
  /**
   * las losas arriostran las diagonales en cada piso que cruzan (Hearst: las diagonales del diagrid se atan a la losa
   * entre nudos): cada diagonal se parte en los pisos, el punto queda atado al corrimiento de la losa, recibe ahí lo
   * que baja la losa y pandea de piso a piso, no de nudo a nudo
   */
  arriostradas?: boolean;
  /** ficha F: ancho del núcleo en el sentido del viento (m); por defecto, un tercio de la cara */
  nucleo?: number;
  /** ficha F: cotas de los brazos (el cordón de arriba; el reticulado tiene un piso de alto); por defecto, a media altura */
  outriggers?: number[];
  /** ficha F: cinturón en cada brazo (ata todas las columnas de la cara perpendicular); por defecto sí */
  cinturon?: boolean;
  /** ficha F: columnas del perímetro en cada cara perpendicular al viento que toma el cinturón; por defecto 4 */
  columnasCara?: number;
  /**
   * ficha F: los brazos se conectan desde el principio de la obra (false). Por defecto se conectan al terminar la obra
   * gruesa, como se hace en las torres reales: el peso propio y el de las losas (D) bajan por las columnas y el núcleo
   * sin pasar por los brazos; la sobrecarga (L) y el viento, sí. Conectados desde el principio, el acortamiento de las
   * columnas cargadas (el núcleo casi no se acorta) fuerza los brazos con el peso.
   */
  brazosDesdeElPrincipio?: boolean;
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
  /**
   * solo para el dibujo (3D y planta): el diagrid sobre una planta circular, como el de 30 St Mary Axe: «nudos» nudos
   * por anillo, anillos en los bordes y en la mitad de cada módulo (cortes), cada uno girado media separación respecto
   * del de abajo, sobre la fachada (el radio sale de la silueta de cada nivel). El cálculo sigue con las caras planas
   * equivalentes (las de las fichas): esto no cambia ningún número.
   */
  circular?: { nudos: number; /** el diagrid se dibuja hasta esta cota; arriba, la carpintería (una cúpula de vidrio) */ hasta?: number };
  /** ficha M: la malla sobre la fachada (patrón, nudos por anillo, esquinas, giro y tope) */
  malla?: MallaDef;
  /** (lo arma el cálculo, no se guarda) ficha M: la malla en el espacio y el viento con que se proyecta */
  mallaGeo?: MallaGeo; mallaDir?: 'A' | 'B';
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
export interface LosasExo { franja: number; qD?: number; qL?: number;
  /** (lo arma el cálculo, no se guarda) las losas de los pisos que junta un nivel, con su cota y su ancho en las caras de
   *  este viento (a) y en las perpendiculares (ap): ver exoConLosasJuntas */
  extra?: { z: number; a: number; ap: number }[] }
/** peso de las losas y sobrecarga por m² (t/m²): los mismos de la planilla (0,7 descargado, 0,9 cargado) */
export const LOSA_QD = 0.7, LOSA_QL = 0.2;
export interface TramoSeccion { clase: ClaseBarra | 'mastil'; desde: number; sec: Seccion }
export interface BarraNueva {
  clase: ClaseBarra; a: [number, number]; b: [number, number]; sec?: Seccion; relA?: boolean; relB?: boolean;
  /** s de a y b como fracción del medio ancho de la cara en su cota (−1 = un borde, 0 = el medio, 1 = el otro): la barra cae en el mismo lugar en las caras de los dos vientos aunque tengan distinto ancho */
  enFraccion?: boolean;
  /** solo en las caras de un viento: A (las caras que ve el viento A) o B; vacío = en las de los dos */
  dir?: 'A' | 'B' | null;
  /** solo en una de las dos caras del viento: la de +t (1: norte o este) o la de −t (−1: sur u oeste); vacío = en las dos */
  lado?: 1 | -1 | null;
  /**
   * ala: el mástil (supercolumna) de la cara perpendicular, puesto en el borde de esta cara (media sección, como en la
   * ficha E): trabaja con la cara pero se dibuja y se pesa con la otra
   */
  ala?: boolean;
  /** (interno) en las caras de este viento no va: se saltea sin cambiar la numeración N1, N2… */
  fuera?: boolean;
}
/** el exo para la cara de posición t (lado +1 o −1): las barras a mano del otro lado quedan afuera (con su número) */
export function paraLado(def: ExoDef, t: number): ExoDef {
  if (!def.nuevas?.some(n => n.lado)) return def;
  const sg = t >= 0 ? 1 : -1;
  return { ...def, nuevas: def.nuevas.map(n => (n.lado && n.lado !== sg ? { ...n, fuera: true } : n)) };
}
/** el exo para las caras del viento dir: las barras a mano de solo el otro viento quedan afuera (con su número) */
export function paraViento(def: ExoDef, dir?: 'A' | 'B' | null): ExoDef {
  if (dir && def.mallaGeo && def.mallaDir !== dir) def = { ...def, mallaDir: dir };
  if (!dir || !def.nuevas?.some(n => n.dir)) return def;
  return { ...def, nuevas: def.nuevas.map(n => (n.dir && n.dir !== dir ? { ...n, fuera: true } : n)) };
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
export interface Nudo { id: number; s: number; z: number; piso: number; /** ficha F: nudo del núcleo (no recibe la losa del exo) */ nucleo?: boolean }
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
  /** ficha F: el núcleo de tabiques (y sus brazos rígidos hasta el borde): no es del exo, no se verifica ni se pesa */
  nucleo?: boolean;
  /** ficha F: barra de un brazo (reticulado del outrigger) */
  brazo?: boolean;
  /** ficha M: la barra real de la malla (largo, posición y factor de la fuerza: N = N'·escala) */
  escala?: number; L3?: number; p3?: BarraReal['p3'];
}
export interface Cara {
  nombre: string; nudos: Nudo[]; barras: Barra[]; baseArticulada?: boolean;
  /** cargas verticales en los nudos (t, hacia abajo): lo que bajan las losas en cada piso */
  cargasNudo?: { nudo: number; P: number }[];
  /** ficha M: la cara es la malla entera proyectada en el plano del viento */
  malla?: { geo: MallaGeo; dir: 'A' | 'B' };
}

/**
 * Arma una cara (pórtico plano en s, z) del tipo pedido, con sus uniones y los cambios barra por barra.
 * @param ancho distancia entre las columnas de esquina, en el sentido del viento (m)
 * @param zs cotas de los pisos sobre PB, de abajo hacia arriba; zs[0] = PB (base)
 */
/**
 * ficha F, cinturón con «shear lag»: cuántas columnas de la cara perpendicular trabajan con cada brazo. Las columnas van
 * repartidas a lo ancho de la cara (a⊥); cada plano de brazos (a ± c, en las caras del núcleo) toma las de su mitad. El
 * cinturón es un reticulado de un piso de alto con los cordones del brazo (EI = E·A·h²/2) y lleva la fuerza desde el brazo
 * hasta cada columna como una ménsula: k_b = 3·EI/x³ (x: distancia de la columna al brazo). La columna resiste con su
 * rigidez axial de la base al brazo, k_c = E·A/z. Cada una trabaja ψ = k_b / (k_b + k_c) (1 si está en el brazo). Es una
 * aproximación: con un cinturón muy rígido trabajan todas (la cota de antes), con uno flojo solo la del brazo.
 */
export function columnasEfectivas(def: ExoDef, anchoPerp: number, c: number, kOut: number[], zs: number[]): { porPlano: number; psi: { y: number; psi: number }[] } {
  const nc = Math.max(1, Math.round(def.columnasCara ?? 4));
  const ys = nc === 1 ? [0] : Array.from({ length: nc }, (_, i) => -anchoPerp / 2 + (i * anchoPerp) / (nc - 1));
  const pc = propsSeccion(def.columna), pv = propsSeccion(def.viga);
  // promedio sobre los brazos (cada uno con su alto de piso y su altura sobre la base)
  const niveles = kOut.length ? kOut : [Math.max(1, Math.round((zs.length - 1) / 2))];
  const psiDe = (y: number) => niveles.reduce((sm, k) => {
    const x = Math.abs(y - c), h = zs[k] - zs[k - 1], z = Math.max(zs[k] - zs[0], 1e-6);
    if (x < 1e-6) return sm + 1;
    const kb = (3 * def.E * pv.A * h * h / 2) / x ** 3, kc = (def.E * pc.A) / z;
    return sm + kb / (kb + kc);
  }, 0) / niveles.length;
  // las columnas de la mitad de este plano (la del medio, si cae en 0, se reparte entre los dos)
  const psi = ys.map(y => ({ y, psi: psiDe(y) }));
  const porPlano = Math.max(1, psi.reduce((sm, q) => sm + (Math.abs(q.y) < 1e-6 ? 0.5 : q.y > 0 ? 1 : 0) * q.psi, 0));
  return { porPlano, psi };
}
/** ficha F: niveles (índices de zs, ≥ 1) del cordón de arriba de cada brazo; sin cotas, el piso más cerca de media altura */
export function nivelesOutrigger(def: ExoDef, zs: number[]): number[] {
  const n = zs.length - 1;
  const cerca = (z: number) => zs.reduce((m, zz, k) => (k >= 1 && Math.abs(zz - z) < Math.abs(zs[m] - z) ? k : m), 1);
  const pedidos = def.outriggers?.length ? def.outriggers.map(cerca) : [cerca((zs[0] + zs[n]) / 2)];
  return [...new Set(pedidos.filter(k => k >= 1 && k <= n))].sort((a, b) => a - b);
}
export function armarCara(def: ExoDef, ancho: number, zs: number[], nombre = 'cara', anchos?: number[], corr?: number[], op: { /** ficha F: sin los brazos (todavía no conectados) */ sinBrazos?: boolean; /** ficha F: ancho de la cara perpendicular (la del cinturón) */ anchoPerp?: number } = {}): Cara {
  // ficha M: la malla entera, proyectada en el plano del viento (sin la malla en el espacio, una cara vacía)
  if (def.tipo === 'M') return def.mallaGeo ? proyectarMalla(def.mallaGeo, def, def.mallaDir ?? 'A', zs, propsSeccion, (clase, z) => seccionEn(def, clase, z), nombre) : { nombre, nudos: [], barras: [] };
  const n = zs.length - 1;
  /**
   * centro de la cara en el nivel k: en una torre inclinada o corrida (Diseño → Perfil) cada nivel se corre respecto
   * de PB y las columnas de esquina lo siguen (quedan inclinadas). La ficha E (mástil central) no lo usa.
   */
  const cK = (k: number) => (def.tipo !== 'E' && corr ? corr[k] ?? 0 : 0);
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
  const S0 = (k: number) => cK(k) - anchoK(k) / 2, S1 = (k: number) => cK(k) + anchoK(k) / 2;
  /** cruz de San Andrés con las dos diagonales unidas en el cruce (así cada una tiene la mitad de luz) */
  const cruz = (a0: number, a1: number) => {
    const zc = (zs[a0] + zs[a1]) / 2, c = nudoEn((cK(a0) + cK(a1)) / 2, zc);
    barra('diagonal', nudo(S0(a0), a0), c); barra('diagonal', c, nudo(S1(a1), a1));
    barra('diagonal', nudo(S1(a0), a0), c); barra('diagonal', c, nudo(S0(a1), a1));
  };
  const enZ = (f: (k: number) => number, z: number) => {
    const k = zs.findIndex(zz => zz >= z - 1e-9);
    if (k <= 0) return f(Math.max(0, k));
    const t = (z - zs[k - 1]) / (zs[k] - zs[k - 1] || 1);
    return f(k - 1) + (f(k) - f(k - 1)) * t;
  };
  const enBorde = (k: number) => Math.abs(Math.abs(nudos[k].s - enZ(cK, nudos[k].z)) - enZ(anchoK, nudos[k].z) / 2) < 1e-6;
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
    if (tipo === 'L' || tipo === 'F') return;          // libre: solo las barras dibujadas a mano (la F, núcleo con outriggers, va aparte: toda la torre)
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
      // (si la zona arranca más arriba, abajo está el nudo de la zona de abajo: se cortan todos los módulos)
      const topes = new Set(mods.slice(kI > 0 ? 1 : 2));
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
  if (def.tipo === 'F') {
    // núcleo con outriggers: el plano vertical que pasa por el núcleo. El núcleo es una barra por piso en s = 0 (su EI
    // se pone en calcularExo con el de los tabiques); en cada brazo, un reticulado de un piso de alto desde el borde del
    // núcleo (atado al eje con barras rígidas) hasta la columna del perímetro, que va de la base a la azotea
    const c = Math.min(anchoK(0) / 2 - 0.5, Math.max(0.5, (def.nucleo ?? anchoK(0) / 3) / 2));
    const kOut = op.sinBrazos ? [] : nivelesOutrigger(def, zs);
    const nucleoNudo = (s: number, k: number) => { const id = nudo(s, k); nudos[id].nucleo = true; return id; };
    for (let k = 0; k < n; k++) barras.push({ id: `K${k + 1}`, clase: 'columna', a: nucleoNudo(0, k), b: nucleoNudo(0, k + 1), A: 100, I: 1, sec: { b: 1, e: 0.5 }, relA: false, relB: false, borde: false, nucleo: true });
    // con cinturón, las columnas de la cara perpendicular que toma cada brazo, cada una según cuánto la carga el cinturón
    // (shear lag): sin cinturón, solo la columna que toca el brazo
    const sinCint = def.cinturon === false;
    const fr = sinCint ? 1 : columnasEfectivas(def, op.anchoPerp ?? anchoK(0), c, kOut.length ? kOut : nivelesOutrigger(def, zs), zs).porPlano;
    const rel = un.columna === 'articulada';
    for (const lado of [S0, S1]) for (let k = 0; k < n; k++) {
      const s0 = tramo('columna', nudo(lado(k), k), nudo(lado(k + 1), k + 1), def.columna), pk = propsSeccion(s0);
      barras.push({ id: `C${barras.filter(x => x.clase === 'columna' && !x.nucleo).length + 1}`, clase: 'columna', a: nudo(lado(k), k), b: nudo(lado(k + 1), k + 1), A: pk.A * fr, I: pk.I * fr, sec: s0, relA: rel, relB: rel, borde: true, ...(fr !== 1 ? { fraccion: fr } : {}) });
    }
    let nr = 0;
    const i0 = barras.length;
    for (const k of kOut) {
      for (const sg of [-1, 1]) {
        // barras rígidas del eje del núcleo al borde, arriba y abajo del brazo
        for (const kk of [k - 1, k]) barras.push({ id: `R${++nr}`, clase: 'viga', a: nucleoNudo(0, kk), b: nucleoNudo(sg * c, kk), A: 100, I: 100, sec: { b: 1, e: 0.5 }, relA: false, relB: false, borde: false, nucleo: true });
        const sF = sg > 0 ? S1 : S0, L0 = sF(k) - sg * c, h0 = zs[k] - zs[k - 1];
        const nb = Math.max(1, Math.round(Math.abs(L0) / Math.max(h0, 1)));
        const x = (i: number, kk: number) => sg * c + ((sF(kk) - sg * c) * i) / nb;
        for (let i = 0; i < nb; i++) {
          barra('viga', nudo(x(i, k), k), nudo(x(i + 1, k), k)); barra('viga', nudo(x(i, k - 1), k - 1), nudo(x(i + 1, k - 1), k - 1));
          // montantes y diagonales (Warren con montantes)
          if (i > 0) barra('columna', nudo(x(i, k - 1), k - 1), nudo(x(i, k), k));
          if (i % 2 === 0) barra('diagonal', nudo(x(i, k - 1), k - 1), nudo(x(i + 1, k), k)); else barra('diagonal', nudo(x(i, k), k), nudo(x(i + 1, k - 1), k - 1));
        }
      }
    }
    for (let i = i0; i < barras.length; i++) if (!barras[i].nucleo) barras[i].brazo = true;
  }
  // barras agregadas a mano (entre nudos que ya existen o en un piso)
  (def.nuevas ?? []).forEach((nb, i) => {
    if (nb.fuera) return;                                     // de las caras del otro viento
    // en fracción del ancho: se lleva a metros y se pega al nudo que ya esté ahí (a menos de 0,1 mm), así una barra
    // dibujada sobre un nudo de la ficha se une a él aunque la fracción esté redondeada
    const sDe = (q: [number, number]) => {
      if (!nb.enFraccion) return q[0];
      const sv = enZ(cK, q[1]) + (q[0] * enZ(anchoK, q[1])) / 2;
      const cerca = nudos.filter(x => !nudosAla.has(x.id) && Math.abs(x.z - q[1]) < 1e-6 && Math.abs(x.s - sv) < 1e-4).sort((x, y) => Math.abs(x.s - sv) - Math.abs(y.s - sv))[0];
      return cerca ? cerca.s : +sv.toFixed(9);
    };
    const a = nudoEn(sDe(nb.a), nb.a[1]), b = nudoEn(sDe(nb.b), nb.b[1]);
    if (a === b) return;
    const sec = nb.sec ?? (nb.clase === 'columna' ? def.columna : nb.clase === 'diagonal' ? def.diagonal : def.viga), p = propsSeccion(sec);
    const rel = un[nb.clase] === 'articulada';
    if (nb.ala) { barras.push({ id: `N${i + 1}`, clase: 'columna', a, b, A: p.A / 2, I: p.I / 2, sec, relA: nb.relA ?? rel, relB: nb.relB ?? rel, borde: false, fraccion: 0.5, deMastil: true }); return; }
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
  return { nombre, nudos, barras: def.arriostradas ? arriostrar(fin, nudos, zs, nudoEn) : fin, baseArticulada: un.base === 'articulada' };
}

/** separador del id de los tramos de una diagonal arriostrada por las losas: «D5·2» es el segundo tramo de D5 */
export const TRAMO_SEP = '·';
/** el id de la barra de la ficha (sin el tramo): los cambios barra por barra van con este id */
export const idBarra = (id: string) => id.split(TRAMO_SEP)[0];
/**
 * Diagonales arriostradas por las losas: cada diagonal que cruza pisos entre sus nudos se parte en esos pisos. El punto
 * de cruce es un nudo del piso (comparte el corrimiento de la losa); entre tramos la barra sigue entera (unión rígida,
 * sin cambiar su rigidez); las articulaciones de los extremos quedan en el primero y el último tramo.
 */
function arriostrar(barras: Barra[], nudos: Nudo[], zs: number[], nudoEn: (s: number, z: number) => number): Barra[] {
  const out: Barra[] = [];
  for (const b of barras) {
    const A = nudos[b.a], B = nudos[b.b];
    const z0 = Math.min(A.z, B.z), z1 = Math.max(A.z, B.z);
    const cruces = b.clase === 'diagonal' ? zs.filter(z => z > z0 + 1e-6 && z < z1 - 1e-6) : [];
    if (!cruces.length) { out.push(b); continue; }
    const sube = B.z > A.z, orden = sube ? cruces : [...cruces].reverse();
    const pts = [b.a, ...orden.map(z => nudoEn(A.s + ((B.s - A.s) * (z - A.z)) / (B.z - A.z), z)), b.b];
    for (let j = 0; j + 1 < pts.length; j++) {
      out.push({ ...b, id: `${b.id}${TRAMO_SEP}${j + 1}`, a: pts[j], b: pts[j + 1], relA: j === 0 ? b.relA : false, relB: j + 2 === pts.length ? b.relB : false });
    }
  }
  return out;
}

/**
 * Cargas repartidas de una cara: el peso propio (vertical, γ·A) y, si la fachada cuelga del exo, el viento de cada
 * piso repartido en altura en las barras de borde (lineal entre pisos; cada cara toma la mitad y cada borde otra mitad:
 * un cuarto del viento total por borde). Se escala para que el viento sobre la fachada sume exactamente ΣW (la parte
 * del primer tramo que queda por debajo del primer piso baja directo a la base).
 */
export function cargarCara(cara: Cara, def: ExoDef, zs: number[], W: number[], losa?: CargaLosa, pesoSoloBrazos = false): Cara {
  const n = zs.length - 1, peso = def.pesoPropio !== false;
  // ficha M: el peso de las barras reales y la franja de losa, como cargas en los nudos (el viento llega por las losas)
  if (cara.malla) return { ...cara, cargasNudo: cargasMalla(cara.malla.geo, zs, { gamma: gammaExo(def), peso: peso && !pesoSoloBrazos, area: (c, z) => propsSeccion(seccionEn(def, c, z)).A, q: losa?.q, franja: losa?.franja, extra: losa?.extra }) };
  const cargasNudo = losa && losa.q > 0 && losa.franja > 0 ? cargasDeLosa(cara, zs, losa) : undefined;
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
  return { ...cara, cargasNudo, barras: cara.barras.map(b => {
    const A = cara.nudos[b.a], B = cara.nudos[b.b], L = Math.hypot(B.s - A.s, B.z - A.z) || 1;
    const c: CargaBarra = { xa: 0, za: 0, xb: 0, zb: 0 };
    // el núcleo de la ficha F no es acero del exo: su peso lo cuenta la planilla
    if (peso && !b.nucleo && (!pesoSoloBrazos || b.brazo)) { c.za = c.zb = -gammaExo(def) * b.A; }
    if (def.viento === 'fachada' && b.borde) {
      // t/m de altura → t/m de barra (por la proyección vertical)
      const k = (Math.abs(B.z - A.z) / L) * f / 4;
      c.xa = wz(A.z) * k; c.xb = wz(B.z) * k;
    }
    return c.xa || c.xb || c.za || c.zb ? { ...b, carga: c } : b;
  }) };
}

/** lo que bajan las losas a una cara: q (t/m²), la franja (m), el ancho de la cara y el de la cara perpendicular en cada cota */
export interface CargaLosa { q: number; franja: number; ancho: (k: number) => number; centro: (k: number) => number; anchoPerp: (k: number) => number;
  /** losas entre pisos (las que junta un nivel): su cota y sus anchos */ extra?: { z: number; a: number; ap: number }[] }
/**
 * Cargas de las losas en los nudos de una cara. En cada piso k (no la base) la franja de la cara baja
 * P = q · f · (a − f) (a: ancho de la cara; las esquinas f × f se reparten entre las dos caras que se cruzan), repartida
 * entre los nudos del piso por su ancho de influencia a lo largo de la cara. Las columnas de esquina reciben además lo que
 * les baja la cara perpendicular (la que no se modela con este viento), con la misma proporción que la esquina de esta
 * cara: q · f · (a⊥ − f) · (ancho de influencia de la esquina / a). Los pisos que no tienen nudos en la cara (el diagrid
 * entre diamantes, los pisos colgados) pasan su carga a los pisos con nudos de abajo y de arriba, por la distancia
 * (como una viga simplemente apoyada: se pierde la flexión local de la barra, no el equilibrio).
 */
export function cargasDeLosa(cara: Cara, zs: number[], l: CargaLosa): { nudo: number; P: number }[] {
  const n = zs.length - 1, f = l.franja;
  const porPiso = new Map<number, Nudo[]>();
  // ficha F: la losa va a las columnas del perímetro (ni al núcleo ni a los nudos de los brazos, que se conectan al final)
  const conBrazos = cara.barras.some(b => b.brazo);
  const deColumna = new Set(cara.barras.filter(b => !b.brazo && !b.nucleo).flatMap(b => [b.a, b.b]));
  cara.nudos.forEach(q => { if (q.piso > 0 && !q.nucleo && (!conBrazos || deColumna.has(q.id))) porPiso.set(q.piso, [...(porPiso.get(q.piso) ?? []), q]); });
  const conNudos = [...porPiso.keys()].sort((a, b) => a - b);
  if (!conNudos.length) return [];
  // carga de cada piso que va a la cara (en el piso con nudos que la recibe)
  const carga = new Map<number, number>(), perp = new Map<number, number>();
  const sumar = (m: Map<number, number>, k: number, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (let k = 1; k <= n; k++) {
    const a = l.ancho(k), P = l.q * f * Math.max(0, a - f), Pp = l.q * f * Math.max(0, l.anchoPerp(k) - f);
    if (porPiso.has(k)) { sumar(carga, k, P); sumar(perp, k, Pp); continue; }
    const abajo = [...conNudos].reverse().find(j => j < k), arriba = conNudos.find(j => j > k);
    if (abajo === undefined || arriba === undefined) { const j = (abajo ?? arriba)!; sumar(carga, j, P); sumar(perp, j, Pp); continue; }
    const t = (zs[k] - zs[abajo]) / (zs[arriba] - zs[abajo]);
    sumar(carga, abajo, P * (1 - t)); sumar(carga, arriba, P * t); sumar(perp, abajo, Pp * (1 - t)); sumar(perp, arriba, Pp * t);
  }
  // las losas de los pisos que junta un nivel: a los pisos con nudos de abajo y de arriba, por la distancia
  for (const e of l.extra ?? []) {
    const P = l.q * f * Math.max(0, e.a - f), Pp = l.q * f * Math.max(0, e.ap - f);
    const abajo = [...conNudos].reverse().find(j => zs[j] <= e.z + 1e-6), arriba = conNudos.find(j => zs[j] > e.z + 1e-6);
    if (abajo === undefined || arriba === undefined) { const j = (abajo ?? arriba)!; sumar(carga, j, P); sumar(perp, j, Pp); continue; }
    const t = (e.z - zs[abajo]) / (zs[arriba] - zs[abajo]);
    sumar(carga, abajo, P * (1 - t)); sumar(carga, arriba, P * t); sumar(perp, abajo, Pp * (1 - t)); sumar(perp, arriba, Pp * t);
  }
  const out: { nudo: number; P: number }[] = [];
  for (const k of conNudos) {
    const P = carga.get(k) ?? 0, Pp = perp.get(k) ?? 0;
    const qs = [...porPiso.get(k)!].sort((a, b) => a.s - b.s), a = l.ancho(k), c = l.centro(k), s0 = c - a / 2, s1 = c + a / 2;
    const lim = qs.map((q, i) => [i === 0 ? s0 : (qs[i - 1].s + q.s) / 2, i === qs.length - 1 ? s1 : (q.s + qs[i + 1].s) / 2]);
    const anchoInf = lim.map(([x0, x1]) => Math.max(0, x1 - x0)), tot = anchoInf.reduce((s, v) => s + v, 0) || 1;
    qs.forEach((q, i) => {
      let v = (P * anchoInf[i]) / tot;
      // esquinas: el nudo más cerca de cada borde, si está sobre el borde
      if ((i === 0 && Math.abs(q.s - s0) < 1e-6) || (i === qs.length - 1 && Math.abs(q.s - s1) < 1e-6)) v += (Pp * anchoInf[i]) / tot;
      if (v > 0) out.push({ nudo: q.id, P: v });
    });
  }
  return out;
}
/** carga total de las losas sobre el exo en un piso (t, las cuatro caras): q · (2 f (B + L) − 4 f²) */
export const losaPorPiso = (q: number, f: number, B: number, L: number) => q * Math.max(0, 2 * f * (B + L) - 4 * f * f);

// ------------------------------------------------------------------ álgebra densa
type Mat = number[][];
const ceros = (r: number, c: number): Mat => Array.from({ length: r }, () => new Array<number>(c).fill(0));
/**
 * Factorización LU con pivoteo parcial (PA = LU), una sola vez por matriz: después se resuelve con cualquier B sin volver
 * a eliminar. La matriz de un exo es rala (cada nudo toca a sus vecinos): la eliminación solo recorre los términos no nulos
 * de la fila pivote, y las sustituciones, los de cada columna de L y cada fila de U.
 */
interface LU { A: Mat; perm: number[]; colL: number[][]; filaU: number[][]; n: number }
function factorizar(A0: Mat): LU {
  const n = A0.length, A = A0.map(f => [...f]), perm = Array.from({ length: n }, (_, i) => i);
  // pivote nulo respecto de la escala de la matriz (un mecanismo deja un resto de redondeo, no un cero exacto)
  const escala = A0.reduce((mx, f, i) => Math.max(mx, Math.abs(f[i])), 0), cero = Math.max(1e-14, escala * 1e-13);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < cero) throw new Error('El exoesqueleto es un mecanismo (falta una barra para que sea estable).');
    if (p !== c) { [A[c], A[p]] = [A[p], A[c]]; [perm[c], perm[p]] = [perm[p], perm[c]]; }
    const fc = A[c], piv = fc[c], nz: number[] = [];
    for (let k = c + 1; k < n; k++) if (fc[k] !== 0) nz.push(k);
    for (let r = c + 1; r < n; r++) {
      const fr = A[r], v = fr[c];
      if (v === 0) continue;
      const f = v / piv;
      fr[c] = f;                                          // multiplicador (parte L)
      for (const k of nz) fr[k] -= f * fc[k];
    }
  }
  const colL: number[][] = Array.from({ length: n }, () => []), filaU: number[][] = Array.from({ length: n }, () => []);
  for (let r = 0; r < n; r++) { const fr = A[r]; for (let c = 0; c < n; c++) if (fr[c] !== 0) (c < r ? colL[c] : c > r ? filaU[r] : null)?.push(c < r ? r : c); }
  return { A, perm, colL, filaU, n };
}
/** resuelve A·X = B con la factorización de A (B con varias columnas; no se modifica) */
function resolverLU(lu: LU, B0: Mat): Mat {
  const { A, perm, colL, filaU, n } = lu, m = B0[0]?.length ?? 0;
  const X = perm.map(i => [...B0[i]]);
  for (let c = 0; c < n; c++) { const xc = X[c]; for (const r of colL[c]) { const f = A[r][c], xr = X[r]; for (let k = 0; k < m; k++) xr[k] -= f * xc[k]; } }
  for (let r = n - 1; r >= 0; r--) {
    const xr = X[r], fr = A[r];
    for (const c of filaU[r]) { const f = fr[c], xc = X[c]; for (let k = 0; k < m; k++) xr[k] -= f * xc[k]; }
    const d = fr[r]; for (let k = 0; k < m; k++) xr[k] /= d;
  }
  return X;
}
/** resuelve A·X = B (B con varias columnas) por eliminación de Gauss con pivoteo parcial; A y B se copian */
function resolver(A0: Mat, B0: Mat): Mat { return resolverLU(factorizar(A0), B0); }

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
interface Condensada { K: Mat; Kss: Mat; Ksm: Mat; nEsc: number; /** Kss⁻¹·B (factorizada una vez) */ resolverSs: (B: Mat) => Mat }
/**
 * Factoriza una matriz de rigidez (simétrica, cada nudo unido solo a sus vecinos) para resolver A·X = B con varios B:
 * se renumeran las incógnitas para que las unidas queden cerca (Cuthill-McKee inverso) y se elimina solo dentro de la
 * banda que queda, sin pivotear (la rigidez es simétrica y no negativa). Da lo mismo que «resolver» y, en una cara con
 * muchos nudos, es decenas de veces más rápido. Si un pivote se anula (un mecanismo) o la banda no achica la matriz, se
 * resuelve con «resolver», que da su mensaje.
 */
function factorizarRigidez(A: Mat): (B: Mat) => Mat {
  // respaldo: la LU con pivoteo (rala), factorizada una sola vez y reusada para cada B
  let lu: LU | null = null;
  const n = A.length, denso = (B: Mat) => resolverLU(lu ??= factorizar(A), B);
  if (n < 60) return denso;
  // vecinos de cada incógnita
  const vec: number[][] = A.map((f, i) => { const v: number[] = []; for (let j = 0; j < n; j++) if (j !== i && f[j] !== 0) v.push(j); return v; });
  // Cuthill-McKee: por componentes, desde la de menos vecinos; cada una suma sus vecinos de menos a más vecinos
  const orden: number[] = [], visto = new Uint8Array(n);
  const porGrado = [...Array(n).keys()].sort((a, b) => vec[a].length - vec[b].length);
  for (const ini of porGrado) {
    if (visto[ini]) continue;
    visto[ini] = 1; orden.push(ini);
    for (let h = orden.length - 1; h < orden.length; h++) {
      const nuevos = vec[orden[h]].filter(j => !visto[j]).sort((a, b) => vec[a].length - vec[b].length);
      for (const j of nuevos) { visto[j] = 1; orden.push(j); }
    }
  }
  orden.reverse();
  const pos = new Int32Array(n); orden.forEach((i, k) => { pos[i] = k; });
  let bw = 0;
  vec.forEach((v, i) => v.forEach(j => { bw = Math.max(bw, Math.abs(pos[i] - pos[j])); }));
  if (bw > n / 3) return denso;
  // eliminación en la banda: arriba queda U; abajo de la diagonal, los multiplicadores (L)
  const P = orden.map(i => orden.map(j => A[i][j]));
  const escala = P.reduce((mx, f, i) => Math.max(mx, Math.abs(f[i])), 0), cero = Math.max(1e-14, escala * 1e-13);
  for (let c = 0; c < n; c++) {
    const piv = P[c][c], fc = P[c];
    if (!(Math.abs(piv) >= cero)) return denso;
    const hasta = Math.min(n - 1, c + bw);
    for (let r = c + 1; r <= hasta; r++) {
      const fr = P[r], f = fr[c] / piv;
      if (f === 0) continue;
      for (let k = c + 1; k <= hasta; k++) fr[k] -= f * fc[k];
      fr[c] = f;
    }
  }
  return (B: Mat) => {
    const m = B[0]?.length ?? 0, Q = orden.map(i => [...B[i]]);
    for (let c = 0; c < n; c++) {
      const hasta = Math.min(n - 1, c + bw), qc = Q[c];
      for (let r = c + 1; r <= hasta; r++) { const f = P[r][c]; if (f === 0) continue; const qr = Q[r]; for (let k = 0; k < m; k++) qr[k] -= f * qc[k]; }
    }
    for (let r = n - 1; r >= 0; r--) {
      const hasta = Math.min(n - 1, r + bw), fr = P[r], qr = Q[r];
      for (let k = 0; k < m; k++) { let s = qr[k]; for (let j = r + 1; j <= hasta; j++) s -= fr[j] * Q[j][k]; qr[k] = s / fr[r]; }
    }
    const X = ceros(n, m);
    orden.forEach((i, k) => { X[i] = Q[k]; });
    return X.some(f => f.some(v => !Number.isFinite(v))) ? denso(B) : X;
  };
}
function condensar(Kg: Mat, master: number[], esclavos: number[]): Condensada {
  const Kmm = master.map(i => master.map(j => Kg[i][j])), Kms = master.map(i => esclavos.map(j => Kg[i][j]));
  const Ksm = esclavos.map(i => master.map(j => Kg[i][j])), Kss = esclavos.map(i => esclavos.map(j => Kg[i][j]));
  if (!esclavos.length) return { K: Kmm, Kss, Ksm, nEsc: 0, resolverSs: B => B };
  const resolverSs = factorizarRigidez(Kss);
  const X = resolverSs(Ksm);                           // Kss⁻¹·Ksm
  const K = Kmm.map((f, i) => f.map((v, j) => { let s = v; const km = Kms[i]; for (let p = 0; p < km.length; p++) if (km[p] !== 0) s -= km[p] * X[p][j]; return s; }));
  return { K, Kss, Ksm, nEsc: esclavos.length, resolverSs };
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
  /** ficha F: barra del núcleo (no es del exo) */
  nucleo?: boolean;
  /** ficha M: la barra en el espacio (x, y, z), para dibujarla sobre la fachada */
  p3?: BarraReal['p3'];
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

/**
 * La rigidez de una cara condensada a los pisos depende solo de su geometría (nudos, barras, secciones, apoyos), no de
 * sus cargas: la verificación pide la misma cara con varias combinaciones (peso, sobrecarga, viento de cada lado), así
 * que se arma y se condensa una sola vez. Guarda las últimas; nadie modifica lo guardado (se lee y se copia).
 */
interface RigidezCara { mapa: Map<number, [number, number, number]>; N: number; Kg: Mat; fijos: number[]; esc: number[]; c: Condensada }
const memoRigidez = new Map<string, RigidezCara>();
function rigidezCara(cara: Cara, E: number, nPisos: number, locales: BarraLocal[]): RigidezCara {
  let clave: string | null = null;
  try {
    clave = JSON.stringify([E, nPisos, !!cara.baseArticulada, cara.nudos.map(q => [q.id, q.s, q.z, q.piso, q.nucleo ? 1 : 0]),
      cara.barras.map(b => [b.a, b.b, b.A, b.I, b.relA ? 1 : 0, b.relB ? 1 : 0])]);
  } catch { clave = null; }
  const hay = clave ? memoRigidez.get(clave) : undefined;
  if (hay && clave) { memoRigidez.delete(clave); memoRigidez.set(clave, hay); return hay; }
  // numeración: gdl 0..n-1 = u de los pisos 1..n (master); después w y φ de cada nudo que no está en la base
  // (con la base articulada, el giro de los nudos de la base también queda libre)
  const master = Array.from({ length: nPisos }, (_, i) => i);
  const mapa = new Map<number, [number, number, number]>();   // nudo → índices globales (u, w, φ); −1 = fijo
  let k = nPisos;
  cara.nudos.forEach(q => {
    if (q.piso === 0) { if (cara.baseArticulada && !q.nucleo) { mapa.set(q.id, [-1, -1, k]); k += 1; } else mapa.set(q.id, [-1, -1, -1]); }
    else if (q.piso < 0) { mapa.set(q.id, [k, k + 1, k + 2]); k += 3; }      // entre pisos: u propio (no lo toca la losa)
    else { mapa.set(q.id, [q.piso - 1, k, k + 1]); k += 2; }
  });
  const N = k, Kg = ceros(N, N);
  cara.barras.forEach((b, ib) => {
    const r = locales[ib], g = [...mapa.get(b.a)!, ...mapa.get(b.b)!];
    for (let i = 0; i < 6; i++) { if (g[i] < 0) continue; for (let j = 0; j < 6; j++) if (g[j] >= 0) Kg[g[i]][g[j]] += r.K[i][j]; }
  });
  // giros sin rigidez (nudos donde todas las barras llegan articuladas): se fijan (no cambia nada)
  // (con las articulaciones condensadas, ese giro puede quedar con un resto de redondeo: se compara con la rigidez típica)
  const maxDiag = Kg.reduce((m, f, i) => (i >= nPisos ? Math.max(m, Math.abs(f[i])) : m), 0);
  const umbral = Math.max(1e-12, maxDiag * 1e-11), fijos: number[] = [];
  for (let i = nPisos; i < N; i++) if (Math.abs(Kg[i][i]) < umbral && Kg[i].every((v, j) => j === i || Math.abs(v) < umbral)) { Kg[i].fill(0); Kg.forEach(f => { f[i] = 0; }); Kg[i][i] = 1; fijos.push(i); }
  const esc = Array.from({ length: N - nPisos }, (_, i) => nPisos + i);
  const r: RigidezCara = { mapa, N, Kg, fijos, esc, c: condensar(Kg, master, esc) };
  if (clave) { memoRigidez.set(clave, r); if (memoRigidez.size > 8) memoRigidez.delete(memoRigidez.keys().next().value!); }
  return r;
}

export function condensarCara(cara: Cara, E: number, nPisos: number): CaraCondensada {
  const master = Array.from({ length: nPisos }, (_, i) => i);
  // cada barra en locales (su rigidez y sus cargas); la rigidez de la cara entera sale de la memoria si ya se armó
  const locales = cara.barras.map(b => { const A = cara.nudos[b.a], B = cara.nudos[b.b]; return barraLocal(E, b, A.s, A.z, B.s, B.z); });
  const { mapa, N, Kg, fijos, esc, c } = rigidezCara(cara, E, nPisos, locales);
  const Fg = new Array<number>(N).fill(0);
  const datos = cara.barras.map((b, ib) => {
    const A = cara.nudos[b.a], B = cara.nudos[b.b], r = locales[ib];
    const g = [...mapa.get(b.a)!, ...mapa.get(b.b)!];
    for (let i = 0; i < 6; i++) if (g[i] >= 0) Fg[g[i]] += r.T.reduce((sm, f, p) => sm + f[i] * r.P[p], 0);     // Tᵀ·P
    return { b, A, B, r, g };
  });
  // lo que bajan las losas: fuerza vertical hacia abajo en el gdl w del nudo
  (cara.cargasNudo ?? []).forEach(cg => { const g = mapa.get(cg.nudo); if (g && g[1] >= 0) Fg[g[1]] -= cg.P; });
  fijos.forEach(i => { Fg[i] = 0; });
  const Fs = esc.map(i => [Fg[i]]);
  const KssFs = c.nEsc ? c.resolverSs(Fs).map(f => f[0]) : [];
  const Fc = master.map(i => Fg[i] - esc.reduce((sm, j, p) => sm + Kg[i][j] * KssFs[p], 0));
  const desplaz = (u: number[]) => {
    const d = new Array<number>(N).fill(0);
    u.forEach((v, i) => (d[i] = v));
    if (c.nEsc) {
      const rhs = c.Ksm.map((f, i) => [Fg[esc[i]] - f.reduce((s, kv, j) => s + kv * u[j], 0)]);
      const x = c.resolverSs(rhs);
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
    // (ficha M: la fuerza de la barra real es N'·L/L₂ y se verifica con su largo real)
    recuperar: u => fuerzasLocales(u).map(({ b, A, B, r, f }) => ({
      id: b.id, clase: b.clase, a: { s: A.s, z: A.z }, b: { s: B.s, z: B.z }, L: b.L3 ?? r.L,
      N: -f[0] * (b.escala ?? 1), Q: f[1], Ma: -f[2], Mb: f[5], Nb: f[3] * (b.escala ?? 1), Qb: -f[4],
      relA: b.relA, relB: b.relB, sec: b.sec, fraccion: b.fraccion, pa: r.pa, pb: r.pb, qa: r.qa, qb: r.qb, ...(b.nucleo ? { nucleo: true } : {}), ...(b.p3 ? { p3: b.p3 } : {}),
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
/**
 * Memoria de calcularExo: con las mismas entradas da el mismo resultado, y la app lo pide varias veces por cálculo
 * (la torre con el exo para los tabiques, el panel, la verificación 301 de cada viento y el viento perpendicular de los
 * oblicuos). La rigidez EJ entra con sus valores en las cotas. Guarda los últimos resultados; nadie los modifica.
 */
const memoExo = new Map<string, ResultadoExo>();
export function calcularExo(def: ExoDef, zs: number[], W: number[], EJ: (z: number) => number, anchoCara: number, tCaras: number[], Eh: number, anchos?: number[], corr?: number[],
  op: { /** carga de las losas (t/m²); por defecto, si apoyan en el exo, peso más sobrecarga (0,9 t/m², el «cargado» de la planilla) */ qLosa?: number; /** ficha F: sin los brazos (las cargas que llegan antes de conectarlos) */ sinBrazos?: boolean; /** ficha F: el peso propio, solo el de los brazos */ pesoSoloBrazos?: boolean; /** qLosa es carga permanente (D): con los brazos conectados al final, va sin ellos */ casoD?: boolean; /** ancho de la cara perpendicular en cada cota (si no, la distancia entre las caras) */ anchosPerp?: number[] } = {}): ResultadoExo {
  let clave: string | null = null;
  try { clave = JSON.stringify([def, zs, W, zs.map(z => EJ(z)), zs.map(z => EJ(z - 1e-3)), anchoCara, tCaras, Eh, anchos, corr, op]); } catch { clave = null; }
  if (clave) {
    const hay = memoExo.get(clave);
    if (hay) { memoExo.delete(clave); memoExo.set(clave, hay); return hay; }
  }
  const r = calcularExoSinMemoria(def, zs, W, EJ, anchoCara, tCaras, Eh, anchos, corr, op);
  if (clave) { memoExo.set(clave, r); if (memoExo.size > 24) memoExo.delete(memoExo.keys().next().value!); }
  return r;
}
function calcularExoSinMemoria(def: ExoDef, zs: number[], W: number[], EJ: (z: number) => number, anchoCara: number, tCaras: number[], Eh: number, anchos?: number[], corr?: number[],
  op: { /** carga de las losas (t/m²); por defecto, si apoyan en el exo, peso más sobrecarga (0,9 t/m², el «cargado» de la planilla) */ qLosa?: number; /** ficha F: sin los brazos (las cargas que llegan antes de conectarlos) */ sinBrazos?: boolean; /** ficha F: el peso propio, solo el de los brazos */ pesoSoloBrazos?: boolean; /** qLosa es carga permanente (D): con los brazos conectados al final, va sin ellos */ casoD?: boolean; /** ancho de la cara perpendicular en cada cota (si no, la distancia entre las caras) */ anchosPerp?: number[] } = {}): ResultadoExo {
  const n = zs.length - 1;
  // ficha F con los brazos conectados al final: el peso (D) se resuelve sin brazos y se le suma la sobrecarga y el viento
  // con brazos (superposición: es lineal)
  if (def.tipo === 'F' && !def.brazosDesdeElPrincipio && !op.sinBrazos && !op.pesoSoloBrazos && (op.qLosa === undefined || op.casoD) && (def.pesoPropio !== false || def.losas)) {
    const qG = op.casoD ? op.qLosa ?? 0 : def.losas ? def.losas.qD ?? LOSA_QD : 0, qW = op.casoD ? 0 : def.losas ? def.losas.qL ?? LOSA_QL : 0;
    const g = calcularExo(def, zs, W.map(() => 0), EJ, anchoCara, tCaras, Eh, anchos, corr, { ...op, casoD: false, qLosa: qG, sinBrazos: true });
    // con los brazos: la sobrecarga, el viento y el peso de los propios brazos (se montan apoyados en lo que ya está)
    const w = calcularExo(def, zs, W, EJ, anchoCara, tCaras, Eh, anchos, corr, { ...op, casoD: false, qLosa: qW, pesoSoloBrazos: true });
    const caras = w.caras.map((c, i) => {
      const gE = new Map(g.caras[i].esfuerzos.map(e => [e.id, e]));
      const esfuerzos = c.esfuerzos.map(e => { const x = gE.get(e.id); return x ? { ...e, N: e.N + x.N, Q: e.Q + x.Q, Ma: e.Ma + x.Ma, Mb: e.Mb + x.Mb, Nb: e.Nb + x.Nb, Qb: e.Qb + x.Qb, pa: e.pa + x.pa, pb: e.pb + x.pb, qa: e.qa + x.qa, qb: e.qb + x.qb } : e; });
      const reac = new Map<string, { s: number; V: number; H: number }>();
      [...c.reacciones, ...g.caras[i].reacciones].forEach(r => { const k = r.s.toFixed(6), y = reac.get(k) ?? { s: r.s, V: 0, H: 0 }; y.V += r.V; y.H += r.H; reac.set(k, y); });
      return { ...c, esfuerzos, reacciones: [...reac.values()] };
    });
    return { ...w, u: w.u.map((x, i) => x + g.u[i]), caras, controles: controlesExo(caras, def) };
  }
  const Kt = rigidezTabiques(zs, EJ);
  const qLosa = op.qLosa ?? (def.losas ? (def.losas.qD ?? LOSA_QD) + (def.losas.qL ?? LOSA_QL) : 0);
  // (ficha F: los planos pasan por el núcleo; la cara perpendicular es la del perímetro: si no viene, cuadrada)
  const dPerp = def.tipo === 'F' ? op.anchosPerp?.[0] ?? anchoCara : tCaras.length > 1 ? Math.max(...tCaras) - Math.min(...tCaras) : anchoCara;
  const losa: CargaLosa | undefined = def.losas && qLosa > 0 ? {
    q: qLosa, franja: def.losas.franja, ancho: k => (anchos && anchos[k] > 0 ? anchos[k] : anchoCara),
    centro: k => (def.tipo !== 'E' && corr ? corr[k] ?? 0 : 0), anchoPerp: k => op.anchosPerp?.[k] ?? dPerp,
    extra: def.losas.extra,
  } : undefined;
  const F = def.tipo === 'F';
  // ficha F: el núcleo está dentro de cada plano (cada uno con su parte del EJ de los tabiques); la ménsula sola no se suma
  const conNucleo = (c: Cara): Cara => (F ? { ...c, barras: c.barras.map(b => (b.nucleo && b.clase === 'columna' ? { ...b, I: Math.max(EJ((c.nudos[b.a].z + c.nudos[b.b].z) / 2) || 0, 1e-6) / (def.E * tCaras.length) } : b)) } : c);
  const caras = tCaras.map((t, i) => ({ t, c: condensarCara(cargarCara(conNucleo(armarCara(paraLado(def, t), anchoCara, zs, F ? `plano ${i + 1}` : `cara ${i + 1}`, anchos, corr, { sinBrazos: op.sinBrazos, anchoPerp: op.anchosPerp?.[0] })), def, zs, W, losa, op.pesoSoloBrazos), def.E, n) }));
  // viento por las losas (en los pisos) o, si la fachada cuelga del exo, ya puesto como carga de las barras de borde
  const Wl = def.viento === 'fachada' ? W.map(() => 0) : W;
  const P = Wl.map((w, i) => w + caras.reduce((s, c) => s + c.c.F[i], 0));
  const K = Kt.map((f, i) => f.map((v, j) => (F ? 0 : v) + caras.reduce((s, c) => s + c.c.K[i][j], 0)));
  const u = resolver(K, P.map(w => [w])).map(f => f[0]);
  // sin exo: si arriba no hay tabiques que tomen viento (núcleo solo de gravedad) la ménsula no existe → sin número
  let uSin: number[];
  const sinTabiques = zs.slice(1).some((z, i) => !(EJ((zs[i] + z) / 2) > 0));
  try { uSin = resolver(Kt, W.map(w => [w])).map(f => f[0]); if (sinTabiques || uSin.some(x => !isFinite(x))) throw new Error('singular'); } catch { uSin = W.map(() => NaN); }
  const mult = (A: Mat, x: number[]) => A.map(f => f.reduce((s, v, j) => s + v * x[j], 0));
  let Ftab = mult(Kt, u), Fexo = P.map((w, i) => w - Ftab[i]);
  // ficha F: lo que toma el núcleo sale de sus barras (corte y momento de cada piso), no de la ménsula sola
  const nucleoF = F ? caras.map(c => c.c.recuperar(u).filter(e => e.nucleo && e.clase === 'columna').sort((a, b) => a.a.z - b.a.z)) : null;
  // corte y momento del núcleo en la base de cada tramo (convenio de la planilla: positivos con el viento)
  const VK = nucleoF ? zs.slice(0, n).map((_, k) => nucleoF.reduce((s, bs) => s + (bs[k] ? bs[k].Q : 0), 0)) : null;
  const MK = nucleoF ? zs.slice(0, n).map((_, k) => nucleoF.reduce((s, bs) => s + (bs[k] ? -bs[k].Ma : 0), 0)) : null;
  if (VK) { Ftab = VK.map((v, k) => v - (VK[k + 1] ?? 0)); Fexo = P.map((w, i) => w - Ftab[i]); }
  const acumula = (F: number[]) => {
    const V = new Array<number>(n + 1).fill(0), M = new Array<number>(n + 1).fill(0);
    for (let i = n - 1; i >= 0; i--) V[i] = V[i + 1] + F[i];                      // V[i]: corte en el tramo de i a i+1 (y en el nivel i)
    for (let i = n - 1; i >= 0; i--) M[i] = M[i + 1] + V[i] * (zs[i + 1] - zs[i]);
    return { V, M };
  };
  const ct = acumula(Ftab), cs = acumula(W);
  if (MK) MK.forEach((m, k) => { ct.M[k] = m; });
  // J equivalente de cada cara: el J de una ménsula de hormigón que se corre lo mismo que la cara sola bajo W
  const uRef = resolver(rigidezTabiques(zs, () => Eh * 1), W.map(w => [w])).map(f => f[0]);   // ménsula con J = 1 m⁴
  const res: ResultadoExo['caras'] = caras.map(({ t, c }) => {
    let Jeq = 0;
    // los pisos sin nudos en la cara (diagrid: solo hay nudos cada medio módulo) pasan su viento a los de al lado con una
    // ménsula muy blanda (J = 10⁻⁴ m⁴), como lo hacen la fachada y las losas; no cambia la rigidez de la cara
    const Kpuente = rigidezTabiques(zs, () => Eh * 1e-4);
    try { const uc = resolver(c.K.map((f, i) => f.map((v, j) => v + Kpuente[i][j])), W.map(w => [w])).map(f => f[0]); Jeq = uRef[n - 1] / uc[n - 1]; } catch { Jeq = 0; }
    // ficha F: el plano trae su parte del núcleo; el J equivalente del exo es lo que agregan los brazos y las columnas
    if (F) { const ut = resolver(Kt.map(f => f.map(v => v / tCaras.length)), W.map(w => [w])).map(f => f[0]); Jeq = Math.max(0, Jeq - uRef[n - 1] / ut[n - 1]); }
    return { nombre: c.cara.nombre, t, esfuerzos: c.recuperar(u), reacciones: c.reacciones(u), Jeq, ancho: anchoCara };
  });
  return conControles({ zs, u, uSin, Ftab, Fexo, Vtab: ct.V, Mtab: ct.M, Vsin: cs.V, Msin: cs.M, fraccionExo: cs.M[0] ? 1 - ct.M[0] / cs.M[0] : 0, Vexo0: cs.V[0] - ct.V[0], caras: res }, def);
}
/**
 * los controles del curso (σ ≤ σadm y pandeo, 21 puntos por barra) se calculan la primera vez que alguien los pide:
 * con el método CIRSOC se verifica con el 301 y estos no se usan en cada combinación de cargas
 */
function conControles(r: Omit<ResultadoExo, 'controles'>, def: ExoDef): ResultadoExo {
  let ctl: ControlBarra[] | null = null;
  return Object.defineProperty(r, 'controles', { get: () => (ctl ??= controlesExo(r.caras, def)), enumerable: true, configurable: true }) as ResultadoExo;
}

/** control del curso de cada barra: σ = |N|/A + |M|/W ≤ σadm a lo largo de la barra y pandeo (N < Ncr/1,7, λ ≤ 200) */
function controlesExo(caras: { nombre: string; esfuerzos: EsfuerzoBarra[] }[], def: ExoDef): ControlBarra[] {
  const controles: ControlBarra[] = [];
  caras.forEach(c => c.esfuerzos.forEach(e => {
    if (e.nucleo) return;
    const p = propsBarra(e);
    // a lo largo de la barra (con carga repartida, el máximo puede estar adentro)
    let sigma = 0, M = 0, Nc = 0;
    for (let i = 0; i <= 20; i++) { const f = esfuerzosEn(e, i / 20); sigma = Math.max(sigma, Math.abs(f.N) / p.A + Math.abs(f.M) / p.W); M = Math.max(M, Math.abs(f.M)); Nc = Math.min(Nc, f.N); }
    const lambda = e.L / p.i, Ncr = (Math.PI ** 2 * def.E * p.I) / e.L ** 2;
    const pandeo = Nc < 0 && (-Nc > Ncr / 1.7 || lambda > 200);
    controles.push({ cara: c.nombre, id: e.id, clase: e.clase, N: e.N, M, sigma, lambda, Ncr, estado: sigma <= def.sigmaAdm && !pandeo ? 'verifica' : 'no verifica' });
  }));
  return controles;
}

// ------------------------------------------------------------------ dimensionado: el exo más liviano que verifica
/** catálogo de tubos cuadrados (b × e, m), ordenado por área */
export const CATALOGO_TUBOS: Seccion[] = ([
  [0.15, 0.008], [0.2, 0.008], [0.2, 0.0125], [0.25, 0.0125], [0.3, 0.0125], [0.3, 0.016], [0.35, 0.016], [0.4, 0.016],
  [0.4, 0.02], [0.45, 0.02], [0.5, 0.02], [0.5, 0.025], [0.55, 0.025], [0.6, 0.025], [0.6, 0.03], [0.7, 0.03], [0.8, 0.03],
  [0.8, 0.04], [0.9, 0.04], [1.0, 0.04], [1.0, 0.05], [1.2, 0.05],
  // megacolumnas y megadiagonales (torres muy altas: Hancock, Citicorp)
  [1.2, 0.06], [1.4, 0.06], [1.4, 0.08], [1.6, 0.08], [1.8, 0.08], [1.8, 0.1], [2.0, 0.1], [2.0, 0.125],
  // cajones armados con chapa gruesa (el mástil del Citicorp sobre el cajón de transición)
  [2.2, 0.15], [2.5, 0.15],
] as [number, number][]).map(([b, e]) => ({ b, e })).sort((u, v) => propsSeccion(u).A - propsSeccion(v).A);

/** hormigón: barras macizas cuadradas de 30 a 200 cm (e = b/2) */
export const CATALOGO_HORMIGON: Seccion[] = Array.from({ length: 18 }, (_, i) => { const b = +(0.3 + 0.1 * i).toFixed(2); return { b, e: b / 2 }; });
const catalogo = (def: ExoDef) => (def.material === 'hormigon' ? CATALOGO_HORMIGON : CATALOGO_TUBOS);

/** lo que necesita calcularExo para un viento */
export interface EntradaExo { /** viento de estas caras (para las barras de un solo viento) */ dir?: 'A' | 'B'; zs: number[]; W: number[]; EJ: (z: number) => number; ancho: number; tCaras: number[]; Eh: number; h: number; /** ancho de la cara en cada cota de zs (caras que siguen la planta) */ anchos?: number[]; /** corrimiento del centro de la cara en cada cota (torre inclinada) */ corr?: number[]; /** ancho de la cara perpendicular en cada cota (ficha F: la del cinturón) */ anchosPerp?: number[]; /** ficha M: la malla en el espacio */ malla?: MallaGeo }

/** peso del acero de las cuatro caras (t): Σ A·L·7,85 t/m³, con las caras de los dos vientos */
/**
 * ficha F: el acero de los cinturones (no son barras del modelo plano): en cada brazo, un reticulado de un piso de alto
 * que da la vuelta al perímetro, con dos cordones (la sección de los cordones del brazo) y una diagonal por paño de
 * alto × alto (la de las diagonales del brazo). Se cuenta una vez (los dos vientos comparten el cinturón).
 */
export function pesoCinturon(def: ExoDef, en: EntradaExo): number {
  if (def.tipo !== 'F' || def.cinturon === false) return 0;
  const P = 2 * (en.ancho + (en.anchosPerp?.[0] ?? en.ancho)), Av = propsSeccion(def.viga).A, Ad = propsSeccion(def.diagonal).A;
  return nivelesOutrigger(def, en.zs).reduce((s, k) => {
    const h = en.zs[k] - en.zs[k - 1], np = Math.max(4, Math.round(P / Math.max(h, 1)));
    return s + (2 * P * Av + np * Math.hypot(h, P / np) * Ad) * gammaExo(def);
  }, 0);
}
/** el exo con la malla de la entrada (ficha M) y el viento de la entrada */
export const conMalla = (def: ExoDef, en: { malla?: MallaGeo; dir?: 'A' | 'B' }): ExoDef => (def.tipo === 'M' && en.malla ? { ...def, mallaGeo: en.malla, mallaDir: en.dir ?? def.mallaDir } : def);
/** sección de una clase de barra al pie z (las secciones por tramos de altura); los anillos de la malla son vigas */
export function seccionEn(def: ExoDef, clase: ClaseBarra | 'anillo', z: number): Seccion {
  const c: ClaseBarra = clase === 'anillo' ? 'viga' : clase;
  const t = (def.tramos ?? []).filter(x => x.clase === c && x.desde <= z + 1e-6).sort((x, y) => y.desde - x.desde)[0];
  return t ? t.sec : c === 'columna' ? def.columna : c === 'diagonal' ? def.diagonal : def.viga;
}
export function pesoExo(def: ExoDef, entradas: EntradaExo[]): number {
  // ficha M: la malla es una sola para los dos vientos (con sus anillos)
  if (def.tipo === 'M') { const g = entradas.find(e => e.malla)?.malla; return g ? pesoMalla(g, gammaExo(def), (c, z) => propsSeccion(seccionEn(def, c, z)).A) : 0; }
  // las columnas de las esquinas son de las dos caras que se cruzan: se cuentan una sola vez (con el primer viento)
  return entradas.reduce((s, en, i) => s + (i === 0 ? pesoCinturon(def, en) : 0) + en.tCaras.reduce((s2, t) => {
    const c = armarCara(paraLado(paraViento(def, en.dir), t), en.ancho, en.zs, 'cara', en.anchos, en.corr, { anchoPerp: en.anchosPerp?.[0] });
    const anchoEn = (k: number) => (c.nudos[k].piso >= 0 ? en.anchos?.[c.nudos[k].piso] ?? en.ancho : en.ancho);
    const centroEn = (k: number) => (c.nudos[k].piso >= 0 && def.tipo !== 'E' ? en.corr?.[c.nudos[k].piso] ?? 0 : 0);
    const esquina = (b: Barra) => b.clase === 'columna' && (b.fraccion ?? 1) === 1 && [b.a, b.b].every(k => Math.abs(Math.abs(c.nudos[k].s - centroEn(k)) - anchoEn(k) / 2) < 1e-6);
    // las alas del mástil (ficha E) son de otra cara: no se cuentan; las alas del tubo (columnas intermedias de las caras
    // perpendiculares) sí, con su cantidad (cada cara perpendicular aparece una vez en cada viento como ala)
    // ficha F: las columnas de la cara se pesan todas (las que el cinturón hace trabajar en parte también son de acero entero)
    const colsF = def.tipo === 'F' && def.cinturon !== false ? Math.max(1, Math.round(def.columnasCara ?? 4)) / 2 : 1;
    const factor = (b: Barra) => (b.nucleo ? 0 : def.tipo === 'F' && b.clase === 'columna' && b.borde ? colsF : b.fraccion === undefined || b.fraccion === 1 ? 1 : b.deMastil ? 0 : b.fraccion);
    return s2 + c.barras.reduce((q, b) => { if ((i > 0 && def.tipo !== 'F' && esquina(b)) || !factor(b)) return q; const A = c.nudos[b.a], B = c.nudos[b.b]; return q + factor(b) * propsSeccion(b.sec).A * Math.hypot(B.s - A.s, B.z - A.z) * gammaExo(def); }, 0);
  }, 0), 0);
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
      const r = calcularExo(paraViento(conMalla(def, en), en.dir), en.zs, en.W, en.EJ, en.ancho, en.tCaras, en.Eh, en.anchos, en.corr, { anchosPerp: en.anchosPerp });
      r.controles.forEach(c => { if (c.estado !== 'verifica') falla[c.clase] = true; });
      if (r.u[r.u.length - 1] > en.h / (base.limiteH ?? 500)) flecha = true;
    });
    // acero: además, el CIRSOC 301 (estados límite) con 1,2·D + 1,6·W (se mira cuando ya pasa lo del curso: es más lento)
    if (!falla.columna && !falla.diagonal && !falla.viga && !flecha && base.material !== 'hormigon')
      entradas.forEach(en => cirsoc301(conMalla(def, en), en.zs, en.W, en.EJ, en.ancho, en.tCaras, en.Eh, en.anchos, FY_F24, { dir: en.dir, corr: en.corr, anchosPerp: en.anchosPerp }).forEach(c => { if (!c.verifica) falla[c.clase] = true; }));
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

// ------------------------------------------------------------------ qué módulo conviene (ángulo de las diagonales)
/**
 * Ángulo de las diagonales con la horizontal (grados) para un módulo de m pisos de altura hp: en el diagrid cada
 * diagonal sube medio módulo mientras recorre medio vano (ancho / 2·vanos); en la cruz (ficha D), sube el módulo
 * entero cruzando todo el ancho. Las otras fichas no tienen diagonales que dependan del módulo: NaN.
 */
export function anguloDiagonal(def: ExoDef, ancho: number, hModulo: number): number {
  if (def.tipo === 'A') { const nb = Math.max(1, Math.round(def.pasoH ? ancho / def.pasoH : def.vanos ?? 1)); return (Math.atan2(hModulo / 2, ancho / (2 * nb)) * 180) / Math.PI; }
  if (def.tipo === 'D') return (Math.atan2(hModulo, ancho) * 180) / Math.PI;
  return NaN;
}
export interface FilaModulo { modulo: number; angulos: number[]; peso: number; verifica: boolean; motivo: string; def: ExoDef; flecha: number }
/**
 * Barrido del módulo: para cada alto de módulo (en pisos) dimensiona el exo más liviano que verifica con los dos vientos
 * y anota su peso y el ángulo de las diagonales. Muestra la idea de Moon, Connor y Fernández (2007): con diagonales
 * acostadas (≈ 35°) el reticulado es muy rígido al corte, con verticales (90°) a la flexión; el óptimo del diagrid queda
 * en el medio (60° a 70° en torres de 40 a 60 pisos) y sube con la esbeltez. Los cortes, barras cambiadas y nuevas se
 * ignoran (dependen del módulo).
 */
export function barridoModulo(base: ExoDef, entradas: EntradaExo[], modulos?: number[]): FilaModulo[] {
  const en0 = entradas[0];
  if (!en0) return [];
  const n = en0.zs.length - 1, hp = (en0.zs[n] - en0.zs[0]) / n;
  const ms = modulos ?? Array.from({ length: Math.max(0, Math.min(n, 20) - 1) }, (_, i) => i + 2);
  return ms.map(m => {
    const def: ExoDef = { ...base, modulo: m, cortes: undefined, barras: undefined, nuevas: undefined };
    const r = dimensionarExo(def, entradas);
    const flecha = Math.max(...entradas.map(en => { const c = calcularExo(paraViento(conMalla(r.def, en), en.dir), en.zs, en.W, en.EJ, en.ancho, en.tCaras, en.Eh, en.anchos, en.corr, { anchosPerp: en.anchosPerp }); return c.u[c.u.length - 1] / (en.h / (base.limiteH ?? 500)); }));
    return { modulo: m, angulos: entradas.map(en => anguloDiagonal(def, en.ancho, m * hp)), peso: r.peso, verifica: r.verifica, motivo: r.motivo, def: r.def, flecha };
  });
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
export interface CombExo { nombre: string; D: number; W: number; otro?: number; /** sobrecarga de las losas (solo si apoyan en el exo) */ L?: number }
/**
 * con las losas en el exo entra la sobrecarga: f1 = 0,5 con el viento (oficinas y viviendas, CIRSOC 101) y la
 * combinación de gravedad 1,2 D + 1,6 L
 */
export function combosConLosas(combos: CombExo[]): CombExo[] {
  const conL = combos.map(c => (c.D >= 1.2 - 1e-9 && c.W > 0 ? { ...c, L: 0.5, nombre: c.nombre.replace(/ D \+ /, ' D + 0,5 L + ') } : c));
  return [{ nombre: '1,2 D + 1,6 L', D: 1.2, W: 0, L: 1.6 }, ...conL];
}
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
  op: { combos?: CombExo[]; costura?: boolean; /** el viento perpendicular, para los vientos oblicuos (combos con «otro») */ otro?: EntradaExo; /** viento de estas caras */ dir?: 'A' | 'B'; /** torre inclinada: corrimiento de la cara en cada cota */ corr?: number[]; /** ancho de la cara perpendicular en cada cota */ anchosPerp?: number[] } = {}): Cirsoc301Barra[] {
  const def0 = def; def = paraViento(def0, op.dir);
  const losas = !!def.losas && def.losas.franja > 0;
  const combos = (losas ? combosConLosas(op.combos ?? COMBOS_CURSO) : op.combos ?? COMBOS_CURSO).filter(c => !c.otro || op.otro);
  const anchosPerp = op.anchosPerp ?? (op.otro ? op.otro.zs.map((_, k) => op.otro!.anchos?.[k] ?? op.otro!.ancho) : undefined);
  const rW = calcularExo({ ...def, pesoPropio: false }, zs, W, EJ, ancho, tCaras, Eh, anchos, op.corr, { qLosa: 0, anchosPerp });
  const esqOtro = op.otro ? esquinasPorAltura(calcularExo({ ...paraViento(def0, op.otro.dir), pesoPropio: false }, op.otro.zs, op.otro.W, op.otro.EJ, op.otro.ancho, op.otro.tCaras, op.otro.Eh, op.otro.anchos, op.otro.corr, { qLosa: 0, anchosPerp: op.otro.anchosPerp ?? zs.map((_, k) => anchos?.[k] ?? ancho) })) : null;
  // D: el peso propio y el peso de las losas; L: la sobrecarga de las losas (si apoyan en el exo)
  // ficha F con los brazos conectados al final: D baja sin pasar por ellos (salvo el peso de los propios brazos)
  const rD = calcularExo({ ...def, pesoPropio: true }, zs, W.map(() => 0), EJ, ancho, tCaras, Eh, anchos, op.corr, { qLosa: def.losas?.qD ?? LOSA_QD, anchosPerp, casoD: true });
  const qL = def.losas?.qL ?? LOSA_QL;
  const rL = losas && qL > 0 ? calcularExo({ ...def, pesoPropio: false }, zs, W.map(() => 0), EJ, ancho, tCaras, Eh, anchos, op.corr, { qLosa: qL, anchosPerp }) : null;
  const out: Cirsoc301Barra[] = [];
  // las barras de D y de L de cada cara, por id (buscarlas una por una en la lista era cuadrático)
  const porId = (r: ResultadoExo | null) => r?.caras.map(c => new Map(c.esfuerzos.map(e => [e.id, e]))) ?? [];
  const mD = porId(rD), mL = porId(rL);
  // N y M de una barra en los 21 puntos (cada combinación y cada signo del viento los reusa)
  const muestras = (e: EsfuerzoBarra) => Array.from({ length: 21 }, (_, i) => esfuerzosEn(e, i / 20));
  const cero21 = Array.from({ length: 21 }, () => ({ N: 0, M: 0 }));
  rW.caras.forEach((c, ic) => c.esfuerzos.forEach(eW => {
    if (eW.nucleo) return;
    // (una barra que no está en el caso D, como los brazos que se conectan al final, no tiene esfuerzos de D)
    const eD = mD[ic]?.get(eW.id) ?? { ...eW, N: 0, Q: 0, Ma: 0, Mb: 0, Nb: 0, Qb: 0, pa: 0, pb: 0, qa: 0, qb: 0 }, eL = mL[ic]?.get(eW.id);
    const sW = muestras(eW), sD = muestras(eD), sL = eL ? muestras(eL) : cero21;
    // a lo largo de la barra: N y M de cada carga en 21 puntos; el viento puede venir del otro lado (signo ±)
    const f = eW.fraccion ?? 1, s = eW.sec, bi = Math.max(0, s.b - 2 * s.e);
    const p = propsSeccion(s), A = p.A * f, r = p.i, Z = ((s.b ** 3 - bi ** 3) / 4) * f, S = p.W * f;
    const lambdaC = (eW.L / (r * Math.PI)) * Math.sqrt(Fy / def.E);
    const Fcr = lambdaC <= 1.5 ? 0.658 ** (lambdaC ** 2) * Fy : (0.877 / lambdaC ** 2) * Fy;
    // pared del tubo (CIRSOC 302, Tabla 2.2.1). La pieza equivalente de la base (Citicorp: la supercolumna son cuatro
    // barras en las esquinas de un cuadrado de 7,3 m) y las barras macizas no son tubos de pared delgada.
    // (por valor, no por identidad: el resultado puede venir de la memoria, armado con otra copia de la definición)
    const mb = def.mastilBase?.sec, equivalente = (!!mb && s.b === mb.b && s.e === mb.e) || s.e >= s.b / 2 - 1e-9;
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
        const fw = sW[i], fd = sD[i], fl = eL && cb.L ? sL[i] : cero21[i], cL = cb.L ?? 0;
        // la parte del viento perpendicular suma con el mismo signo (la peor esquina); la flexión de la otra cara se suma
        // (flexión en los dos planos de un tubo cuadrado, del lado seguro)
        const Nw = sg * fw.N, extraN = cb.otro && otro ? cb.otro * otro.N * (Nw >= 0 ? 1 : -1) : 0;
        const N = cb.D * fd.N + cL * fl.N + cb.W * Nw + extraN, M = Math.abs(cb.D * fd.M + cL * fl.M + cb.W * sg * fw.M) + (cb.otro && otro ? cb.otro * otro.M : 0);
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
  // ficha M: los anillos (a tracción o compresión, con el empuje de las diagonales en sus nudos)
  if (def.tipo === 'M' && def.mallaGeo) out.push(...anillos301(def, def.mallaGeo, rW, rD, rL, combos.filter(c => !c.otro), Fy, op.costura ?? true));
  return out;
}

/**
 * Ficha M: los anillos con el CIRSOC 301. Cada caso (viento, D y L) da las fuerzas reales de las barras; su empuje hacia
 * afuera en los nudos lo toma el anillo (fuerzasAnillos), y se combina como las demás barras, con el viento de los dos
 * lados. Barra solo axial: tracción φ·Pn = 0,9·Fy·A y compresión φ·Pn = 0,85·Fcr·A con el largo del tramo (la losa
 * lo arriostra en los nudos). Van con la clase «viga» (su sección es la de las vigas) y la letra R.
 */
function anillos301(def: ExoDef, g: MallaGeo, rW: ResultadoExo, rD: ResultadoExo, rL: ResultadoExo | null, combos: CombExo[], Fy: number, costura: boolean): Cirsoc301Barra[] {
  const fW = fuerzasAnillos(g, rW.caras[0]?.esfuerzos ?? []), fD = fuerzasAnillos(g, rD.caras[0]?.esfuerzos ?? []), fL = rL ? fuerzasAnillos(g, rL.caras[0]?.esfuerzos ?? []) : null;
  const out: Cirsoc301Barra[] = [];
  let n = 0;
  g.barras.forEach((b, i) => {
    if (b.clase !== 'anillo') return;
    n++;
    const P = g.nudos[b.a], Q = g.nudos[b.b], L = Math.hypot(Q.x - P.x, Q.y - P.y, Q.z - P.z);
    const s = seccionEn(def, 'anillo', Math.min(P.z, Q.z)), p = propsSeccion(s), bi = Math.max(0, s.b - 2 * s.e);
    const lambdaC = (L / (p.i * Math.PI)) * Math.sqrt(Fy / def.E);
    const Fcr = lambdaC <= 1.5 ? 0.658 ** (lambdaC ** 2) * Fy : (0.877 / lambdaC ** 2) * Fy;
    const bt = s.e > 0 ? bi / s.e : Infinity, lim = limitesPared(def.E, Fy, costura);
    const pared: Cirsoc301Barra['pared'] = s.e >= s.b / 2 - 1e-9 || bt <= lim.lp ? 'compacta' : bt <= lim.lr ? 'no compacta' : 'esbelta';
    const phiPc = 0.85 * Fcr * p.A, phiPt = 0.9 * Fy * p.A;
    const w = fW.get(i) ?? 0, d = fD.get(i) ?? 0, l = fL?.get(i) ?? 0;
    let peor = { v: -1, Pu: 0, comb: '' };
    for (const cb of combos) for (const sg of cb.W ? [1, -1] : [1]) {
      const N = cb.D * d + (cb.L ?? 0) * l + cb.W * sg * w, v = N >= 0 ? N / phiPt : -N / phiPc;
      if (v > peor.v) peor = { v, Pu: N, comb: cb.nombre };
    }
    out.push({ cara: 'anillos', id: `R${n}`, clase: 'viga', Pu: peor.Pu, Mu: 0, phiPc, phiPt, phiMn: 0.9 * Fy * p.W, lambdaC, bt, ratio: peor.v >= 0.2 ? peor.v : peor.v / 2, ecuacion: peor.v >= 0.2 ? 'H1-1a' : 'H1-1b', combinacion: peor.comb, pared, verifica: peor.v <= 1 && pared !== 'esbelta' });
  });
  return out;
}

/**
 * Ficha M: la malla es una sola pieza en cada sentido, centrada (su J equivalente en el medio de la planta), y además un
 * tubo que frena el giro por sí mismo: Jgiro (m⁶), el Σ J·d² equivalente que sale del reticulado espacial (giroMalla).
 * Alrededor del centro de rigidez nuevo se suma el traslado: Jeq · cr².
 */
function torsionConTubo(r: RotoRes, JeqPar: number, JeqPer: number, Jgiro: number): TorsionExo {
  const par: { J: number; h: number }[] = [], per: { J: number; h: number }[] = [];
  r.B.forEach((J, i) => {
    if (!(J > 0) || !isFinite(r.K[i])) return;
    if (i < r.nP) par.push({ J, h: r.K[i] + r.J7 });
    else if (i >= r.oO) per.push({ J, h: r.K[i] + r.J38 });
    else per.push({ J, h: r.K[i] + r.J28 });
  });
  const sumJ = (xs: { J: number }[]) => xs.reduce((s, x) => s + x.J, 0), sumJh = (xs: { J: number; h: number }[]) => xs.reduce((s, x) => s + x.J * x.h, 0);
  const crCon = sumJh(par) / (sumJ(par) + JeqPar), crPerCon = per.length || JeqPer > 0 ? sumJh(per) / (sumJ(per) + JeqPer) : 0;
  const polar = (xs: { J: number; h: number }[], c: number) => xs.reduce((s, x) => s + x.J * (x.h - c) ** 2, 0);
  const kTabCon = polar(par, crCon) + polar(per, crPerCon);
  const kCon = kTabCon + Jgiro + JeqPar * crCon ** 2 + JeqPer * crPerCon ** 2;
  const mtSin = r.J15, mtCon = r.D5 * crCon, kSin = r.M51;
  const giro = mtSin && kSin ? (mtCon / kCon) / (mtSin / kSin) : NaN;
  return { crSin: r.J7, crCon, mtSin, mtCon, kSin, kCon, kTabCon, giro, parteExo: kCon > 0 ? 1 - kTabCon / kCon : 0 };
}

// ------------------------------------------------------------------ torsión con el exoesqueleto
export interface TorsionExo {
  /** centro de rigidez (posición, m) y torsor Q · e (tm), sin y con el exo */
  crSin: number; crCon: number; mtSin: number; mtCon: number;
  /** rigidez a la torsión Σ J · d² (m⁶), sin y con el exo, y la parte de los tabiques con el exo */
  kSin: number; kCon: number; kTabCon: number;
  /** el giro de la planta con el exo sobre el giro sin él, y la parte del torsor que toma el exo */
  giro: number; parteExo: number;
}
/**
 * Torsión con el exoesqueleto, con el método de la rototraslación de la planilla: las caras del exo entran como dos
 * piezas más en cada sentido, a ±t del centro, con su J equivalente (el de la etapa 08, en hormigón). El centro de
 * rigidez se acerca al medio, el torsor Q · e baja y la rigidez a la torsión Σ J · d² sube mucho (las caras están lejos).
 * No cambia la planilla: es la cuenta aparte que muestra cuánto ayuda el exo a la torsión.
 * @param r la rototraslación de la planilla del viento elegido; JeqPar y tPar: las caras paralelas a ese viento (J de una
 *   cara, m⁴, y su distancia al centro, m); JeqPer y tPer: las del otro viento
 */
export function torsionConExo(r: RotoRes, JeqPar: number, tPar: number, JeqPer: number, tPer: number, malla?: { Jgiro: number }): TorsionExo {
  if (malla) return torsionConTubo(r, JeqPar, JeqPer, malla.Jgiro);
  const par: { J: number; h: number }[] = [], per: { J: number; h: number }[] = [];
  r.B.forEach((J, i) => {
    if (!(J > 0) || !isFinite(r.K[i])) return;
    if (i < r.nP) par.push({ J, h: r.K[i] + r.J7 });
    else if (i >= r.oO) per.push({ J, h: r.K[i] + r.J38 });
    else per.push({ J, h: r.K[i] + r.J28 });
  });
  const sumJ = (xs: { J: number }[]) => xs.reduce((s, x) => s + x.J, 0), sumJh = (xs: { J: number; h: number }[]) => xs.reduce((s, x) => s + x.J * x.h, 0);
  const crCon = (sumJh(par) + JeqPar * (tPar - tPar)) / (sumJ(par) + 2 * JeqPar);
  const crPerCon = per.length || JeqPer > 0 ? sumJh(per) / (sumJ(per) + 2 * JeqPer) : 0;
  const polar = (xs: { J: number; h: number }[], c: number) => xs.reduce((s, x) => s + x.J * (x.h - c) ** 2, 0);
  const kTabCon = polar(par, crCon) + polar(per, crPerCon);
  const kCon = kTabCon + JeqPar * ((tPar - crCon) ** 2 + (-tPar - crCon) ** 2) + JeqPer * ((tPer - crPerCon) ** 2 + (-tPer - crPerCon) ** 2);
  const mtSin = r.J15, mtCon = r.D5 * crCon, kSin = r.M51;
  const giro = mtSin && kSin ? (mtCon / kCon) / (mtSin / kSin) : NaN;
  return { crSin: r.J7, crCon, mtSin, mtCon, kSin, kCon, kTabCon, giro, parteExo: kCon > 0 ? 1 - kTabCon / kCon : 0 };
}
