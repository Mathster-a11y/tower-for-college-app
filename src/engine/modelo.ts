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
}

export interface Nivel {
  nombre: string;
  /** cota del NPT (m) */
  cota: number;
  /** medida de la planta perpendicular al viento A (m); vacío = igual a la del nivel de arriba */
  B?: number | null;
  /** medida de la planta paralela al viento A (m); vacío = igual a la del nivel de arriba */
  L?: number | null;
  /**
   * silueta de la planta (contorno cerrado, en m, desde el centro de PB); vacío = la del nivel de arriba o el
   * rectángulo B × L. Cada vértice puede llevar «b» (bulge, como en AutoCAD): el tramo que sale de ese vértice es un
   * arco de círculo con b = tan(ángulo / 4); b = 0 es recto.
   */
  silueta?: { x: number; y: number; b?: number }[] | null;
  /**
   * contorno de la carpintería (cerramiento) del nivel; vacío = el del nivel de arriba. Su caja da el a máx
   * (ancho) y el b máx (largo) del perfil al que se le aplica el viento; B y L se cargan a mano.
   */
  carpinteria?: { x: number; y: number; b?: number }[] | null;
}

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
  /** cota donde arranca el muro (vacío = en la fundación) y donde termina (vacío = en la azotea) */
  zDesde?: number | null;
  zHasta?: number | null;
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
  /** (versiones anteriores) columna circular: se convierte en «tubo-circ» al abrir el proyecto */
  circular?: { D: number; d: number } | null;
}

export type TipoElemento = 'tabique' | 'tubo-rect' | 'tubo-circ';
export type RolMolde = 'alma' | 'alma der.' | 'ala sup.' | 'ala inf.' | 'fuera';
export const tipoDe = (m: Muro): TipoElemento => m.tipo ?? (m.circular ? 'tubo-circ' : 'tabique');

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

/** área en planta del elemento (m²) */
export function areaMuro(m: Muro): number {
  const t = tipoDe(m);
  if (t === 'tubo-circ') return (Math.PI / 4) * (m.largo ** 2 - dInterior(m) ** 2);
  return rectangulos(m).reduce((a, r) => a + r.ax * r.ay, 0);
}

/** medidas totales en x e y (caja que lo contiene) */
export function huella(m: Muro): { ax: number; ay: number } {
  const t = tipoDe(m);
  if (t === 'tubo-rect') return { ax: m.largo, ay: m.ladoY ?? m.largo };
  if (t === 'tubo-circ') return { ax: m.largo, ay: m.largo };
  return m.dir === 'Y' ? { ax: m.espesor, ay: m.largo } : { ax: m.largo, ay: m.espesor };
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

export interface Proyecto {
  version: 1;
  nombre: string;
  alumno: string;
  sitio: Sitio;
  niveles: Nivel[];
  /** b1: lado de la fundación paralelo al viento A · a1: perpendicular (M,NyQ N80 y N81) */
  fundacion: { b1: number; a1: number };
  /** hormigón de los tabiques: su número es la resistencia característica σbk en MPa (H30 → 300 kg/cm²) */
  hormigon: string;
  muros: Muro[];
}

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
 * Modelo para empezar a calcular, con supuestos (marcados): 48 pisos de oficinas de 4,064 m (13'-4", pisos 8 a 56,
 * seis módulos de 8, leídos del plano de elevación) más la corona: 49 niveles sobre PB, el máximo de la planilla. El núcleo central es de hormigón y llega
 * al suelo (así lo muestran los dibujos de la obra); sus medidas (21 × 21 m, pared de 0,90 m) son supuestas. Las
 * supercolumnas son reticuladas de acero; acá van como cajones de hormigón equivalentes (7,30 × 7,30 m, pared de
 * 0,60 m), también supuestos. Los chevrones del perímetro todavía no suman rigidez: entran cuando esté la
 * herramienta de exoesqueleto.
 */
export function ejemploCiticorp(): Proyecto {
  const lado = 47.85, base = 34.75, paso = 4.064;
  // Medidas del plano de elevación original: 914'-0" (278,6 m) de alto. Pisos 1 a 7: la base abierta sobre las
  // supercolumnas (plaza, iglesia, vestíbulos), hasta 114 ft (34,75 m). Pisos 8 a 56: 48 pisos de 13'-4" (4,064 m), que
  // llenan los 6 módulos de chevrones de 8 pisos (106'-8"). Arriba del piso 56, la corona: pisos técnicos, el
  // amortiguador de 400 t y el techo inclinado hasta 278,6 m. Son 49 niveles sobre PB, el máximo de la planilla: el
  // piso 56 y la corona se juntan en la azotea.
  const niveles: Nivel[] = [{ nombre: 'Azotea (piso 56 y corona)', cota: 278.6, B: lado, L: lado }];
  for (let piso = 55; piso >= 8; piso--) niveles.push({ nombre: piso === 8 ? '8º (primer piso sobre las supercolumnas)' : `${piso}º`, cota: +(base + paso * (piso - 8)).toFixed(2) });
  niveles.push({ nombre: 'PB (plaza)', cota: 0 }, { nombre: 'Subsuelo', cota: -9, B: lado, L: lado });
  const d = lado / 2 - 3.65;     // centro de cada supercolumna: a 3,65 m de la cara
  const col = (id: string, x: number, y: number, piezaA: string, piezaB: string): Muro =>
    ({ id, dir: 'Y', x, y, largo: 7.3, ladoY: 7.3, espesor: 0.6, tipo: 'tubo-rect', llega: true, areaInf: 290, piezaA, pegadoA: '', piezaB, pegadoB: '' });
  return {
    version: 1,
    nombre: 'Citicorp Center (Nueva York, 1977) · modelo aproximado',
    alumno: '',
    sitio: { V: 49, Kd: 0.85, I: 1, zg: 457, alfa: 5, Kzt: 1, G: 0.85, Cpb: 0.8, Cps: -0.5, GCpi: 0.18 },
    niveles,
    fundacion: { b1: lado, a1: lado },
    hormigon: 'H40',
    muros: [
      { id: 'N1', dir: 'Y', x: 0, y: 0, largo: 21, ladoY: 21, espesor: 0.9, tipo: 'tubo-rect', llega: true, areaInf: 1130, piezaA: 'Núcleo', pegadoA: '', piezaB: 'Núcleo B', pegadoB: '' },
      col('S1', 0, d, 'S1', 'S1B'), col('S2', d, 0, 'S2', 'S2B'), col('S3', 0, -d, 'S3', 'S3B'), col('S4', -d, 0, 'S4', 'S4B'),
    ],
  };
}

export function proyectoVacio(): Proyecto {
  const p = ejemploGuia();
  return { ...p, nombre: 'Proyecto nuevo', niveles: [{ nombre: 'Azotea', cota: 3, B: 20, L: 16 }, { nombre: 'PB', cota: 0 }], muros: [] };
}
