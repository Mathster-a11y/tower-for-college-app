import { propiedades, tiras } from './perfil';
/**
 * El proyecto tal como lo dibuja el alumno: datos del sitio, niveles y muros de la planta de PB.
 *
 * Ejes: origen en el cruce de los ejes de simetría de la planta de PB; x hacia la derecha, y hacia arriba.
 * El viento A llega por la cara mayor y sube en la planta (+y); el viento B va hacia +x.
 * Un muro de dirección «Y» es paralelo al viento A; uno «X», paralelo al viento B.
 */

export interface Sitio {
  V: number; Kd: number; I: number; zg: number; alfa: number; Kzt: number; G: number;
  Cpb: number; Cps: number; GCpi: number;
  /**
   * parapeto o baranda por encima de la última losa (m; vacío = 0). En M,NyQ la fila de la azotea lleva como altura
   * de influencia medio entrepiso más el parapeto (la planilla dice «corregir primer valor según corresponda»).
   */
  parapeto?: number | null;
}

/**
 * vértice de un contorno (losa o carpintería): el lado que sale de este vértice es recto, un arco (b: bulge de AutoCAD)
 * o una Bézier cúbica (c1 y c2: puntos de control)
 */
export type VerticeContorno = { x: number; y: number; b?: number; c1?: { x: number; y: number }; c2?: { x: number; y: number } };
/** losas reales que carga un nivel: las de los pisos que junta (1 si no dice), o ninguna si es un nivel sin losa */
export const losasDeNivel = (n: { pisos?: number | null; sinLosa?: boolean | null }) => (n.sinLosa ? 0 : Math.max(1, Math.round(n.pisos ?? 1)));

export interface Nivel {
  nombre: string;
  /** cota del NPT (m) */
  cota: number;
  /**
   * pisos reales que junta este nivel (vacío = 1). La planilla admite 49 niveles sobre PB: en una torre más alta cada
   * nivel puede representar varios pisos (su losa carga como esos pisos; el viento es el de su faja, igual que siempre)
   */
  pisos?: number | null;
  /** medida de la planta perpendicular al viento A (m); vacío = igual a la del nivel de arriba */
  B?: number | null;
  /** medida de la planta paralela al viento A (m); vacío = igual a la del nivel de arriba */
  L?: number | null;
  /**
   * silueta de la planta (contorno cerrado, en m, desde el centro de PB); vacío = la del nivel de arriba o el
   * rectángulo B × L. Cada vértice puede llevar «b» (bulge, como en AutoCAD): el tramo que sale de ese vértice es un
   * arco de círculo con b = tan(ángulo / 4); b = 0 es recto.
   */
  silueta?: VerticeContorno[] | null;
  /**
   * contorno de la carpintería (cerramiento) del nivel; vacío = el del nivel de arriba. Su caja da el a máx
   * (ancho) y el b máx (largo) del perfil al que se le aplica el viento; B y L se cargan a mano.
   */
  carpinteria?: VerticeContorno[] | null;
  /** la silueta de este nivel se editó a mano: el perfil, los lofts y el plano de corte no la tocan (vacío = no) */
  manual?: boolean | null;
  /**
   * nivel sin losa (cúpula, corona, remate, mástil): solo carpintería. No se dibuja la losa y no suma peso de losa (cuenta
   * 0 losas en CIRSOC, FEM, la Guía y los libros); el viento sigue con su B y L y su carpintería. La planilla de la
   * cátedra no cambia (vacío = con losa)
   */
  sinLosa?: boolean | null;
  /**
   * lo común a la losa de abajo y la de arriba se partió en varias piezas: la carpintería es la más grande y el resto
   * queda sin carpintería (se avisa). Lo calculan los tramos «por piso»; no va al Excel
   */
  carpinteriaPartida?: { piezas: number; area: number } | null;
  /** la carpintería de este piso se editó a mano: los tramos no la recalculan (vacío = no) */
  carpManual?: boolean | null;
  /** la carpintería a mano sale de lo común a propósito (un vidrio en voladizo, un atrio): no se avisa (vacío = no) */
  carpVoladizo?: boolean | null;
  /**
   * torre de perfil variable (editor del perfil): cuánto se corre el nivel entero respecto de PB, en x y en y (m).
   * La planta (muros y contornos) sigue en sus coordenadas; el nivel se corre como un todo (torre inclinada). Vacío = 0
   */
  dx?: number | null; dy?: number | null;
}

/** un tramo de espesor: desde la cota «desde» (m) hacia arriba, espesor «e» (m) */
export interface TramoEspesor { desde: number; e: number }

export interface Muro {
  id: string;
  dir: 'X' | 'Y';
  /** centro del muro (m) */
  x: number; y: number;
  largo: number; espesor: number;
  /** false: nace sobre un apeo o arranca más arriba; queda fuera del cálculo */
  llega: boolean;
  /** área de losa que carga el muro (m²) */
  areaInf: number;
  piezaA: string; pegadoA: string;
  piezaB: string; pegadoB: string;
  /**
   * tipo de elemento (vacío = tabique):
   *  - «tabique»: rectángulo de largo × espesor en la dirección «dir» (una columna rectangular es un tabique corto);
   *  - «tubo-rect»: tubo rectangular (caja, núcleo): largo = lado en x, ladoY = lado en y, espesor = espesor de pared;
   *  - «tubo-circ»: tubo circular: largo = diámetro exterior, espesor = espesor de pared (≥ D/2: columna maciza).
   */
  tipo?: TipoElemento;
  /** tubo rectangular: lado en y (m) */
  ladoY?: number | null;
  /**
   * espesor que cambia con la altura, por tramos: desde la cota «desde» hacia arriba el muro tiene espesor «e»
   * (por debajo del primer tramo vale «espesor», que es el de PB y el que va a la hoja J de la planilla)
   */
  espesores?: TramoEspesor[] | null;
  /**
   * línea de referencia (como en ArchiCAD): la línea con la que se dibujó el muro. Vacío = el eje (centrado); +1 / −1 =
   * una de las caras: el eje del muro corrido e/2 hacia su normal izquierda (+1) o derecha (−1), con el eje orientado de
   * la punta de menor x (o menor y) a la otra. Los muros se enlazan por esa línea y, si cambia el espesor, la cara de
   * referencia queda quieta y el muro crece hacia el otro lado.
   */
  refLado?: 1 | -1 | null;
  /** cota donde arranca el muro (vacío = en la fundación) y donde termina (vacío = en la azotea) */
  zDesde?: number | null;
  zHasta?: number | null;
  /**
   * solo de gravedad: el muro no forma pieza a propósito (un núcleo que lleva solo peso, como en las torres con
   * exoesqueleto o diagrid, que toman todo el viento). No cambia ningún cálculo: solo saca el aviso «no forma pieza»
   */
  soloGravedad?: boolean | null;
  /**
   * papel del muro en el molde de la hoja J, elegido a mano para cada viento (vacío = el que propone la app):
   * alma (izquierda), alma der., ala sup., ala inf. o fuera (no entra al molde)
   */
  rolA?: RolMolde | '';
  rolB?: RolMolde | '';
  /**
   * columna de un pórtico: dos columnas de la misma pieza, alineadas en la dirección del viento, trabajan juntas
   * (acción de pórtico de la hoja J, columnas AO a AX). En la otra dirección quedan fuera del cálculo.
   */
  portico?: boolean;
  /** grupo al que pertenece (pieza armada como un elemento: se mueve, gira y espeja entera) */
  grupo?: string;
  /** si el grupo es una pieza tipo: su forma y sus medidas (para cambiarlas después sin salir de la categoría) */
  pieza?: { tipo: import('./piezasTipo').TipoPieza; med: import('./piezasTipo').MedidasPieza };
  /**
   * vano calado (herramienta «Calar»): este tramo y el tramo «con» son el mismo muro partido por un vano de «ancho» m.
   * «dintel»: puertas en cada piso, unidas por dinteles: los dos tramos siguen en la misma pieza (trabajan juntos, como en
   * la guía, que verifica el corte en el dintel). «hueco»: abertura de toda la altura, sin dintel.
   */
  vano?: { con: string; ancho: number; tipo: 'dintel' | 'hueco' };
  /**
   * calados que no parten el elemento (puertas y ventanas, en cada piso): el elemento sigue entero, con dintel y antepecho;
   * el cálculo usa el J de la sección más débil (ver aberturas.ts)
   */
  aberturas?: import('./aberturas').Abertura[] | null;
  /**
   * qué J lleva a la planilla un elemento calado: «entero» (como la cátedra: las aberturas no cambian el J; por defecto)
   * o «corte» (la sección más débil, cortada por las aberturas)
   */
  caladoJ?: 'entero' | 'corte' | null;
  /**
   * perfil irregular (tipo «perfil»): contorno cerrado con rectas, arcos y Bézier, y sus huecos, con los vértices
   * respecto del baricentro (x, y). largo, espesor y dir son los de su caja (para las tablas).
   */
  perfil?: import('./perfil').Perfil;
  /** grupo de dibujo que lo contiene (ver grupos.ts); no cambia el cálculo */
  gd?: string;
  /** en una copia de componente: referencia del muro en la definición (el mismo en todas las copias) */
  cref?: string;
  /** (versiones anteriores) columna circular: se convierte en «tubo-circ» al abrir el proyecto */
  circular?: { D: number; d: number } | null;
}

/** ubicación de una copia de componente: espejo (en x, primero), giro en cuartos de vuelta antihorarios y traslación */
export interface Ubicacion { x: number; y: number; g: 0 | 1 | 2 | 3; e: boolean }
/** grupo de dibujo (jerarquía): junta muros y grupos para moverlos, copiarlos, bloquearlos u ocultarlos */
export interface GrupoDib {
  id: string; nombre: string;
  /** grupo que lo contiene (vacío = la planta) */
  padre?: string;
  /** bloqueado: no se elige para mover ni editar (se sigue calculando) */
  bloq?: boolean;
  /** oculto en la planta (se sigue calculando) */
  oculto?: boolean;
  /** fijo en su lugar 📌: no se mueve, gira ni espeja (ni sus muros), pero se puede entrar y cambiar medidas */
  fijo?: boolean;
  /** componente al que pertenece esta copia, y su ubicación */
  comp?: string; T?: Ubicacion;
  /** subgrupo dentro de una copia de componente: referencia en la definición */
  cref?: string;
}

export type TipoElemento = 'tabique' | 'tubo-rect' | 'tubo-circ' | 'perfil';
export type RolMolde = 'alma' | 'alma der.' | 'ala sup.' | 'ala inf.' | 'fuera';
export const tipoDe = (m: Muro): TipoElemento => (m.perfil ? 'perfil' : m.tipo === 'perfil' ? 'tabique' : m.tipo ?? (m.circular ? 'tubo-circ' : 'tabique'));

/** Convierte datos de versiones anteriores (columna circular con D y d) al modelo actual. */
export function normalizarMuro(m: Muro): Muro {
  if (!m.circular) return m;
  const { D, d } = m.circular;
  const r: Muro = { ...m, tipo: 'tubo-circ', largo: D, espesor: d > 0 ? (D - d) / 2 : D / 2 };
  delete r.circular;
  return r;
}
export function normalizarProyecto(p: Proyecto): Proyecto {
  return { ...p, hormigon: p.hormigon || 'H30', muros: p.muros.map(normalizarMuro) };
}

/** diámetro interior de un tubo circular (0 = macizo) */
export const dInterior = (m: Muro) => Math.max(0, Math.round((m.largo - 2 * m.espesor) * 1e4) / 1e4);

/** Rectángulos que forman el elemento en planta (centro y medidas en x e y), para dibujar y calcular. */
export function rectangulos(m: Muro): { x: number; y: number; ax: number; ay: number }[] {
  const t = tipoDe(m);
  // perfil: tiras que lo aproximan (el cálculo usa sus propiedades exactas)
  if (t === 'perfil') return tiras(m.perfil!).map(r => ({ ...r, x: r.x + m.x, y: r.y + m.y }));
  if (t === 'tubo-rect') {
    const B = m.largo, H = m.ladoY ?? m.largo, e = Math.min(m.espesor, B / 2, H / 2);
    if (e >= B / 2 || e >= H / 2) return [{ x: m.x, y: m.y, ax: B, ay: H }];
    return [
      { x: m.x, y: m.y + H / 2 - e / 2, ax: B, ay: e }, { x: m.x, y: m.y - H / 2 + e / 2, ax: B, ay: e },
      { x: m.x - B / 2 + e / 2, y: m.y, ax: e, ay: H - 2 * e }, { x: m.x + B / 2 - e / 2, y: m.y, ax: e, ay: H - 2 * e },
    ];
  }
  if (t === 'tubo-circ') return [{ x: m.x, y: m.y, ax: m.largo, ay: m.largo }];
  return [m.dir === 'Y' ? { x: m.x, y: m.y, ax: m.espesor, ay: m.largo } : { x: m.x, y: m.y, ax: m.largo, ay: m.espesor }];
}

/** espesor del muro a la cota z (el de PB por debajo del primer tramo) */
export function espesorEn(m: Muro, z: number): number {
  let e = m.espesor;
  if (m.espesores?.length) [...m.espesores].sort((a, b) => a.desde - b.desde).forEach(t => { if (z > t.desde + 1e-9 && t.e > 0) e = t.e; });
  return e;
}
/** el muro con el espesor que tiene a la cota z (el mismo objeto si no cambia) */
export function muroEn(m: Muro, z: number): Muro {
  if (!m.espesores?.length) return m;
  const e = espesorEn(m, z);
  return e === m.espesor ? m : { ...m, espesor: e };
}
/** cotas donde el muro cambia de espesor, entre z0 y z1 */
export function cambiosDeEspesor(m: Muro, z0: number, z1: number): number[] {
  return [...new Set((m.espesores ?? []).map(t => t.desde).filter(z => z > z0 + 1e-6 && z < z1 - 1e-6))].sort((a, b) => a - b);
}
/** peso propio del muro entre z0 y z1 respecto del de una sección constante (la de PB): Σ A(z)·Δz / (A_PB·(z1 − z0)) */
export function factorPesoEspesor(m: Muro, z0: number, z1: number): number {
  if (!m.espesores?.length || z1 <= z0) return 1;
  const cortes = [z0, ...cambiosDeEspesor(m, z0, z1), z1], A0 = areaMuro(m) || 1;
  let s = 0;
  for (let i = 0; i + 1 < cortes.length; i++) s += areaMuro(muroEn(m, (cortes[i] + cortes[i + 1]) / 2)) * (cortes[i + 1] - cortes[i]);
  return s / (A0 * (z1 - z0));
}

/** área en planta del elemento (m²) */
export function areaMuro(m: Muro): number {
  const t = tipoDe(m);
  if (t === 'perfil') return propiedades(m.perfil!).A;
  if (t === 'tubo-circ') return (Math.PI / 4) * (m.largo ** 2 - dInterior(m) ** 2);
  return rectangulos(m).reduce((a, r) => a + r.ax * r.ay, 0);
}

/** medidas totales en x e y (caja que lo contiene) */
export function huella(m: Muro): { ax: number; ay: number } {
  const t = tipoDe(m);
  if (t === 'perfil') { const k = propiedades(m.perfil!); return { ax: 2 * Math.max(Math.abs(k.x0), Math.abs(k.x1)), ay: 2 * Math.max(Math.abs(k.y0), Math.abs(k.y1)) }; }
  if (t === 'tubo-rect') return { ax: m.largo, ay: m.ladoY ?? m.largo };
  if (t === 'tubo-circ') return { ax: m.largo, ay: m.largo };
  return m.dir === 'Y' ? { ax: m.espesor, ay: m.largo } : { ax: m.largo, ay: m.espesor };
}

/** caja real del elemento en la planta (x0, x1, y0, y1) */
export function cajaMuro(m: Muro): { x0: number; x1: number; y0: number; y1: number } {
  if (tipoDe(m) === 'perfil') { const k = propiedades(m.perfil!); return { x0: m.x + k.x0, x1: m.x + k.x1, y0: m.y + k.y0, y1: m.y + k.y1 }; }
  const { ax, ay } = huella(m);
  return { x0: m.x - ax / 2, x1: m.x + ax / 2, y0: m.y - ay / 2, y1: m.y + ay / 2 };
}

/** El muro está en la planta del nivel de cota z (arranca en z o más abajo y sigue más arriba de z). */
export function presenteEn(m: Muro, z: number, zFund: number, zTop: number): boolean {
  const a = m.zDesde ?? zFund, b = m.zHasta ?? zTop;
  return a <= z + 1e-6 && (z < b - 1e-6 || (z >= zTop - 1e-6 && b >= zTop - 1e-6));
}

/** El muro entra en el cálculo de la planilla: llega a la fundación y pasa por PB. */
export function entraEnCalculo(m: Muro, zFund: number, zTop: number): boolean {
  return m.llega && (m.zDesde ?? zFund) <= zFund + 1e-6 && (m.zHasta ?? zTop) > 1e-6;
}

/**
 * Clasificación de una pieza para la hoja J: automática (la app decide), tabique singular, compuesta simétrica (doble T:
 * columnas B a K), compuesta asimétrica (W a AI), tubo circular (S, T), pórtico (AO a AU) o elemento especial (oblicuos,
 * curvos, calados y cualquier sección: va como rectángulo equivalente, con su geometría en la hoja «Elementos especiales»)
 */
export type ClasePieza = 'auto' | 'singular' | 'simetrica' | 'asimetrica' | 'tubo' | 'portico' | 'especial';
export const NOMBRE_CLASE: Record<ClasePieza, string> = {
  auto: 'Automática', singular: 'Tabique singular', simetrica: 'Compuesta simétrica', asimetrica: 'Compuesta asimétrica',
  tubo: 'Tubo circular', portico: 'Pórtico', especial: 'Elemento especial',
};

export interface Proyecto {
  version: 1;
  nombre: string;
  alumno: string;
  sitio: Sitio;
  niveles: Nivel[];
  /** b1: lado de la fundación paralelo al viento A · a1: perpendicular (M,NyQ N80 y N81) */
  fundacion: { b1: number; a1: number;
    /** tensión admisible del suelo (kg/cm²), dato del estudio geotécnico (CIRSOC 401, art. 7.4); vacío = 2,5 como la guía */
    sigmaAdm?: number | null };
  /** hormigón de los tabiques: su número es la resistencia característica σbk en MPa (H30 → 300 kg/cm²) */
  hormigon: string;
  muros: Muro[];
  /** grupos de dibujo (jerarquía, componentes y bloqueo) */
  grupos?: GrupoDib[];
  /** caminos (rectas y arcos) para la matriz sobre un camino */
  caminos?: Camino[];
  /** cotas de medición de la planta */
  cotas?: Cota[];
  /** líneas guía y ejes de la grilla (geometría de construcción, no se calcula) */
  guias?: import('./guias').Guia[];
  /** huecos de la losa (ascensores, escaleras, plenos): no tienen losa, no cargan los muros */
  huecosLosa?: HuecoLosa[];
  /** encuentros entre muros: qué pasa en cada junta («A|B» → inglete, pasa A o pasa B); vacío = el convenio por defecto */
  juntas?: Record<string, 'inglete' | 'pasaA' | 'pasaB'>;
  /** cota del nivel cuyas áreas de influencia se copian solas a «Área inf.» al cambiar la planta (vacío = a mano) */
  areasAuto?: number | null;
  /**
   * Rototraslación: par de tabiques perpendiculares al viento que trabajan juntos contra el giro (dos muros cerca uno
   * del otro). Van en las filas 28–29 de la hoja del viento («USAR SOLAMENTE PARA DOS TABIQUES»), con los brazos desde
   * su punto medio, en vez de las filas 31–50. Clave: el viento de la hoja (A = cara mayor); valor: los nombres de las
   * dos piezas del otro viento. Vacío = el bloque general.
   */
  parPerp?: { A?: [string, string] | null; B?: [string, string] | null };
  /**
   * clasificación de cada pieza elegida por el usuario (por nombre de pieza; vacío = automática) y si entra al cálculo
   * del J (enJ: false = no va a la hoja J; sus muros quedan fuera del cálculo en ese viento)
   */
  clasesPieza?: Record<string, { clase?: ClasePieza | null; enJ?: boolean | null }>;
  /** exoesqueleto de acero en el perímetro, por fuera de la fachada o detrás de la piel (etapa 08); vacío = sin exoesqueleto */
  exo?: import('./exo').ExoDef | null;
  /** el perfil de la torre dibujado en el editor (Diseño → Perfil); los niveles guardan lo que escribió (B, L, dx, dy) */
  perfil?: import('./perfilTorre').PerfilTorre | null;
  /**
   * lofts de losas (como el Loft de Rhino): se eligen dos o más losas sección y las siluetas de las losas que quedan
   * entre ellas salen de interpolarlas en altura (ver loft.ts); se vuelven a aplicar solos con cada cambio
   */
  lofts?: import('./loft').Loft[];
  /** perfil de la torre en alzado: la planta de cada losa sale de la del nivel base escalada, girada y corrida (perfil_torre.ts) */
  perfilTorre?: import('./perfil_torre').PerfilTorre | null;
  /** la carpintería de cada nivel sigue a su losa, desfasada hacia adentro estos metros (vacío = a mano) */
  carpinteriaRetiro?: number | null;
  /** carpintería por tramos de altura: sin, por losa (de losa a losa) o continua (carpinteria.ts); manda sobre «carpinteriaRetiro» */
  carpinteriaTramos?: import('./carpinteria').TramoCarpinteria[];
  /** la carpintería no sigue a las losas: los tramos no la recalculan y las losas se editan sin tocarla (vacío = sigue) */
  carpinteriaFija?: boolean | null;
  /** la envolvente diseñada aparte de las losas: la usan los tramos «Envolvente» (vacío = la piel sigue el borde de las losas) */
  envolvente?: import('./envolvente').Envolvente | null;
  /** panelería de la carpintería: montantes cada «modulo» m, antepecho opaco y travesaños intermedios (vacío = sin paneles) */
  paneleria?: import('./carpinteria').Paneleria | null;
  /** planos que recortan las losas (la corona a 45° del Citicorp), dibujados en el corte de la torre (planos_corte.ts) */
  planosCorte?: import('./planos_corte').PlanoCorte[];
  /**
   * cómo se calcula este proyecto: método (planilla, guía…), versión de la planilla y armado de las piezas, más la
   * versión de las fórmulas con la que se guardó. Va dentro del proyecto para que el archivo dé los mismos resultados
   * en cualquier computadora; vacío = lo que la app usaba antes (ver metodos/tipos.ts, CONFIG_POR_DEFECTO)
   */
  calculo?: (Partial<import('./metodos/tipos').ConfigCalculo> & { formulas?: string }) | null;
  /** datos del viento según CIRSOC 102-25 (métodos CIRSOC y FEM): ciudad, categoría de riesgo, exposición…; vacío = por defecto */
  cirsoc102?: import('./cargas/cirsoc102').DatosCirsoc102 | null;
  /** cargas gravitatorias según CIRSOC 101-25 (métodos CIRSOC y FEM); vacío = por defecto */
  cirsoc101?: import('./cargas/cirsoc101').DatosCirsoc101 | null;
  /** datos del hormigón para la verificación CIRSOC 201 (recubrimiento, exposición) y el límite de deriva; vacío = por defecto */
  cirsoc201?: import('./metodos/cirsoc').DatosCirsoc201 | null;
  /**
   * contexto urbano: los edificios vecinos, para los simuladores de viento (túnel 2D y 3D). No entra en ningún método
   * de cálculo ni en el Excel. Vacío = la torre aislada
   */
  contexto?: { edificios: EdificioVecino[] } | null;
}
/** edificio vecino: su contorno en planta (m, en las coordenadas de la planta del proyecto) y su altura sobre PB (m) */
export interface EdificioVecino {
  id: string; nombre: string; v: { x: number; y: number }[]; altura: number;
  /**
   * retiros: los tramos de arriba, de abajo hacia arriba. Cada uno va desde la altura del anterior (el primero, desde
   * «altura») hasta la suya, con su propio contorno (normalmente más chico). Sin retiros, un prisma.
   */
  retiros?: { v: { x: number; y: number }[]; altura: number }[];
}
/** hueco de la losa: rectángulo (o contorno) en la planta, de un nivel a otro (vacío = en todos los pisos) */
export interface HuecoLosa { id: string; nombre: string; v: { x: number; y: number }[]; zDesde?: number | null; zHasta?: number | null }
/** el hueco está en la losa del nivel de cota z */
export const huecoEn = (h: HuecoLosa, z: number) => (h.zDesde ?? -Infinity) <= z + 1e-6 && z <= (h.zHasta ?? Infinity) + 1e-6;
/** camino abierto o cerrado: vértices con bulge (el tramo que sale de cada vértice es un arco si b ≠ 0) */
export interface Camino { id: string; nombre: string; v: import('./perfil').VerticePerfil[]; cerrado: boolean }
/** punto de una cota: fijo, o pegado a un nodo de un muro (la cota sigue al muro si se mueve) */
export interface PuntoCota { x: number; y: number; ref?: { id: string; k: number } }
/** cota: horizontal, vertical o alineada entre dos puntos, con su línea corrida «d» m (con signo) */
export interface Cota { id: string; a: PuntoCota; b: PuntoCota; tipo: 'h' | 'v' | 'alineada'; d: number }

/** Ejemplo de la «Guía de predimensionado. Edificio en torre» 2024 (Neuquén, 20 pisos, planta 20 × 16 m). */
export function ejemploGuia(): Proyecto {
  const niveles: Nivel[] = [{ nombre: 'Azotea', cota: 64, B: 20, L: 16 }];
  for (let n = 20; n >= 1; n--) niveles.push({ nombre: `${n}º`, cota: 4 + 3 * (n - 1) });
  niveles.push({ nombre: 'PB', cota: 0 }, { nombre: '1º SS', cota: -4, B: 22, L: 18 }, { nombre: '2º SS', cota: -8 });
  const m = (id: string, dir: 'X' | 'Y', x: number, y: number, largo: number, areaInf: number, piezaA: string, pegadoA = '', piezaB = '', pegadoB = ''): Muro =>
    ({ id, dir, x, y, largo, espesor: 0.2, llega: true, areaInf, piezaA, pegadoA, piezaB, pegadoB });
  return {
    version: 1,
    nombre: 'Ejemplo de la guía 2024 (Neuquén)',
    alumno: '',
    sitio: { V: 48, Kd: 0.85, I: 1, zg: 457, alfa: 5, Kzt: 1, G: 0.85, Cpb: 0.8, Cps: -0.5, GCpi: 0.18 },
    niveles,
    fundacion: { b1: 18, a1: 22 },
    hormigon: 'H30',
    muros: [
      m('M1', 'Y', -9.9, 5.75, 4.5, 10.5, 'T1', '', 'T1B'), m('M2', 'Y', 9.9, 5.75, 4.5, 10.5, 'T2', '', 'T2B'),
      m('M3', 'Y', -9.9, -5.75, 4.5, 10.5, 'T3', '', 'T3B'), m('M4', 'Y', 9.9, -5.75, 4.5, 10.5, 'T4', '', 'T4B'),
      m('M5', 'Y', -6.4, 0, 3.6, 17.2, 'T5', '', 'T5B', 'M6'), m('M6', 'X', -4.0, 1.9, 5.0, 30.4, 'T5', 'M5', 'T5B'),
      m('M7', 'X', -4.0, -1.9, 5.0, 30.4, 'T5', 'M5', 'T5B'),
      m('M8', 'Y', 6.4, 0, 3.6, 17.2, 'T6', '', 'T6B', 'M9'), m('M9', 'X', 4.0, 1.9, 5.0, 30.4, 'T6', 'M8', 'T6B'),
      m('M10', 'X', 4.0, -1.9, 5.0, 30.4, 'T6', 'M8', 'T6B'),
    ],
  };
}

/** Anexo de la guía («Caso particular con rototraslación»): T5 aislado, un tabique de 4,00 × 0,20 m; el eje de
 *  inercia se corre hacia T6 y la planta, además de trasladarse, rota. */
export function ejemploAsimetrico(): Proyecto {
  const p = ejemploGuia();
  return {
    ...p, nombre: 'Ejemplo de la guía: T5 aislado (rototraslación)',
    // ejemplo solo para la planilla: con CIRSOC no verifica (deriva y armadura) y no se redimensiona
    calculo: { ...p.calculo, metodo: 'planilla' },
    muros: p.muros.filter(m => m.id !== 'M6' && m.id !== 'M7').map(m => (m.id === 'M5' ? { ...m, largo: 4, pegadoB: '' } : m)),
  };
}

/**
 * Citicorp Center (hoy 601 Lexington Avenue, Nueva York, 1977; Hugh Stubbins, arquitecto; William LeMessurier,
 * ingeniero). 59 pisos, 278,6 m (914 ft), planta cuadrada de unos 47,85 m (157 ft). La torre se apoya en cuatro
 * supercolumnas de unos 34,7 m (114 ft) en el medio de cada cara, no en las esquinas, que vuelan unos 22 m (72 ft)
 * sobre la iglesia de San Pedro. Los chevrones de acero de 8 pisos por cara (el «exoesqueleto») llevan las cargas
 * de las esquinas a esas columnas. Arriba, un amortiguador de masa sintonizada de unas 400 t.
 *
 * Modelo (cada dato con su fuente en exo.notas, que se ven en la etapa 08):
 *  - Niveles: el 8 (34,75 m, sobre las supercolumnas) junta los pisos 8 y 9 del cajón de transición; del 10 al 56,
 *    un nivel por piso de 4,064 m (13'-4"); arriba, la corona hasta 278,6 m. Son 49 niveles sobre PB, el máximo de
 *    la planilla, y los seis módulos de chevrones caen justo en los pisos 8, 16, 24, 32, 40, 48 y 56 (229,82 m).
 *  - El núcleo lleva la mitad del peso y no toma viento (no entra en ninguna pieza): el viento lo toman los chevrones
 *    y baja por las supercolumnas, que son las piezas de la planilla en la base abierta (hasta 34,75 m).
 *  - Exoesqueleto (ficha E) con los módulos por cotas: el mástil se afina arriba del piso 40; diagonales y cordón con
 *    las medidas de Wikipedia (secciones equivalentes en tubo cuadrado, supuestas).
 * Para pensar: en 1978, revisando los vientos a 45° (que el cálculo original no había mirado), se vio que las uniones
 * de los chevrones eran abulonadas y no soldadas, y no alcanzaban; se reforzaron soldando chapas de 2 in en más de
 * 200 uniones. En la app se puede probar qué pasa con las diagonales articuladas (abulonadas) o rígidas (soldadas).
 */
export function ejemploCiticorp(): Proyecto {
  const lado = 47.85, base = 34.75, paso = 4.064;
  const z = (piso: number) => +(base + paso * (piso - 8)).toFixed(2);
  const niveles: Nivel[] = [{ nombre: 'Corona (pisos técnicos y amortiguador)', cota: 278.6, B: lado, L: lado }];
  for (let piso = 56; piso >= 10; piso--) niveles.push({ nombre: piso === 56 ? '56º (último piso de oficinas)' : `${piso}º`, cota: z(piso) });
  niveles.push({ nombre: '8º–9º (cajón de transición sobre las supercolumnas)', cota: base, pisos: 2 });
  niveles.push({ nombre: 'PB (plaza)', cota: 0 }, { nombre: 'Subsuelo', cota: -9, B: lado, L: lado });
  const d = lado / 2 - 3.65;     // centro de cada supercolumna: a 3,65 m de la cara
  // la mitad del peso de cada losa (47,85² = 2290 m²) baja por el núcleo y la otra mitad por las cuatro supercolumnas
  const col = (id: string, x: number, y: number, piezaA: string, piezaB: string): Muro =>
    ({ id, dir: 'Y', x, y, largo: 7.3, ladoY: 7.3, espesor: 0.6, tipo: 'tubo-rect', llega: true, areaInf: 286, piezaA, pegadoA: '', piezaB, pegadoB: '', zHasta: base });
  // el último módulo sube hasta la cima: la corona inclinada es estructura (si no, queda colgada de columnas sueltas)
  const cortes = [...[8, 16, 24, 32, 40, 48, 56].map(z), 278.6];
  return {
    version: 1,
    nombre: 'Citicorp Center (Nueva York, 1977) · modelo aproximado',
    alumno: '',
    sitio: { V: 49, Kd: 0.85, I: 1, zg: 457, alfa: 5, Kzt: 1, G: 0.85, Cpb: 0.8, Cps: -0.5, GCpi: 0.18 },
    niveles,
    // sobre la roca de Manhattan (esquisto): código de edificación de Nueva York, roca intermedia, 20 t/ft² ≈ 19,5 kg/cm²
    fundacion: { b1: lado, a1: lado, sigmaAdm: 19.5 },
    hormigon: 'H40',
    muros: [
      // núcleo octogonal de 63 × 72 ft (19,2 × 21,9 m) como un tubo rectangular; solo gravedad (sin pieza)
      { id: 'N1', dir: 'Y', x: 0, y: 0, largo: 19.2, ladoY: 21.9, espesor: 0.6, tipo: 'tubo-rect', llega: true, areaInf: 1145, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '', soloGravedad: true },
      col('S1', 0, d, 'S1', 'S1B'), col('S2', d, 0, 'S2', 'S2B'), col('S3', 0, -d, 'S3', 'S3B'), col('S4', -d, 0, 'S4', 'S4B'),
    ],
    exo: {
      tipo: 'E', separacion: 0, modulo: 8, pisoInicio: 1, cortes, cuartos: true, esquinaCortada: true, limiteH: 450,
      // mástil 60 × 30 in en la base, 18 in de profundidad arriba del piso 40: tubos cuadrados equivalentes (supuesto)
      // secciones dimensionadas con la app (botón «Dimensionar» de la etapa 08); las reales no están publicadas
      mastil: { b: 2.2, e: 0.15 }, tramos: [{ clase: 'mastil', desde: z(40), sec: { b: 1.8, e: 0.1 } }],
      losas: { franja: 6.4, qD: 0.45, qL: 0.25 },
      // debajo del cajón, el mástil es la supercolumna de 24 × 24 ft (cuatro barras): cajón de acero equivalente (pared supuesta)
      mastilBase: { hasta: base, sec: { b: 7.3, e: 0.065 } },
      diagonal: { b: 1.4, e: 0.06 }, viga: { b: 1.4, e: 0.08 }, columna: { b: 2.2, e: 0.15 },
      E: 2.1e7, sigmaAdm: 14000, uniones: { diagonal: 'articulada', viga: 'rigida', columna: 'rigida', base: 'empotrada' },
      notas: [
        '59 pisos y techo a 915 ft (279 m) (Wikipedia, «Citigroup Center»); el plano de elevación dice 914′-0″ (278,6 m).',
        'Planta de 157 × 157 ft (47,85 m) y esquinas que vuelan 72 ft (22 m) (Wikipedia).',
        'Cuatro supercolumnas de 24 × 24 ft (7,3 m) a media cara, de 112 ft (Wikipedia; el plano: 114 ft = 34,75 m). Acá son tubos de hormigón equivalentes (pared de 0,60 m, supuesta) y son las piezas de la planilla en la base abierta.',
        'Seis módulos de chevrones de 8 pisos por cara, sin columna en las esquinas en el tope de cada módulo (Wikipedia): en la app la columna de esquina termina un piso abajo del nudo. Columnas a los cuartos de cada cara que bajan a las diagonales a medio módulo, con una viga a medio módulo (plano de elevación). Pisos de 13′-4″ (4,064 m) leídos del plano: el sexto módulo termina en el piso 56, a 229,82 m.',
        'Los pisos 8 y 9 son el cajón de transición (Wikipedia: el piso 9 es un reticulado; el plano: cajón de 2 pisos): acá un solo nivel a 34,75 m, para que entren los 49 niveles de la planilla.',
        'Mástil de 60 in de ancho y 30 in de profundidad, 18 in arriba del piso 40; diagonales de 14 in y cordón de 36 in (Wikipedia). La app usa tubos cuadrados: las secciones salen del botón «Dimensionar» (control del curso y CIRSOC 301) con las losas apoyadas (el mástil y las esquinas de 2,20 m con chapa de 150 mm, las diagonales de 1,40 m, el cordón de 1,40 m; arriba del piso 40 el mástil se afina a 1,80 m). Con el viento del CIRSOC, la flecha h/500 del curso y sin el amortiguador, hacen falta barras más grandes que las de 14 in: no son las de la obra.',
        'Debajo del cajón, el mástil es la supercolumna (24 × 24 ft): un cajón de acero equivalente de 7,30 m con pared de 6,5 cm (supuesto; con 5 cm no alcanza cuando las losas apoyan en el exo).',
        'Control de orden de magnitud: la torre real tiene 24 000 t cortas de acero (≈ 21 800 t, Wikipedia, con vigas y losas); el exo dimensionado de la app, con las losas apoyadas, pesa unas 42 500 t (tubos cuadrados de catálogo, viento del CIRSOC y sin el amortiguador: bastante más pesado que la obra).',
        'Las losas apoyan en el exo: una franja de 6,4 m junto a cada fachada: así el exo lleva la otra mitad de cada losa (47,85² ≈ 2290 m²; 1145 m² por piso), con 0,45 t/m² de peso (losa colaborante con contrapiso, cielorraso e instalaciones) y 0,25 t/m² de sobrecarga de oficinas (unas 50 lb/ft²): supuestos. Entran 1,2 D + 1,6 L y 1,2 D + 0,5 L + 1,6 W.',
        'Núcleo octogonal de 63 × 72 ft que lleva la mitad del peso (Wikipedia; no dice el material): acá un tubo de hormigón sin pieza (no toma viento).',
        'Corona: techo a 45° que sube 160 ft (49 m) sobre el último piso, con el amortiguador de 400 t (Wikipedia).',
        '1978: uniones abulonadas; con el viento a 45° no alcanzaban y se soldaron chapas de 2 in en más de 200 uniones (Wikipedia; NIST 2019 lo revisó). Diagonales articuladas = abulonadas.',
        'Viento: CIRSOC 102 con V = 49 m/s y exposición de centro de ciudad (supuesto).',
        'Flecha objetivo h/450, no la h/500 del curso: con la geometría de la obra (las esquinas no llegan al tope de cada módulo) y los tubos del catálogo la azotea se corre unos h/480. El edificio real tiene además el amortiguador de 400 t para el movimiento. Con la marca de «esquina cortada» apagada, la torre llega a h/500.',
        'Criterio CIRSOC: el último módulo del exo sube hasta la cima (la corona inclinada es estructura; sin ella, la corona quedaba en columnas sueltas y un piso se corría 1/25). Con eso el exo dimensionado pesa unas 46 000 t y la deriva de servicio de la azotea da unos 240 mm (límite 557 mm). Fundación sobre la roca de Manhattan: código de Nueva York, roca intermedia, 20 t/ft² ≈ 19,5 kg/cm².',
      ],
    },
  };
}

export function proyectoVacio(): Proyecto {
  const p = ejemploGuia();
  return { ...p, nombre: 'Proyecto nuevo', niveles: [{ nombre: 'Azotea', cota: 3, B: 20, L: 16 }, { nombre: 'PB', cota: 0 }], muros: [] };
}
