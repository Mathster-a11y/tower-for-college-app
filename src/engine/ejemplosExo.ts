/**
 * Edificios reales con exoesqueleto, para la etapa 08. Cada número lleva su fuente o la marca «supuesto» (en
 * exo.notas, que se muestran en la etapa 08 y van a la hoja «G · Exoesqueleto»). Lo que no está publicado (secciones
 * de las barras, medidas del núcleo) se supone y se puede dimensionar con el botón de la etapa 08.
 *
 * La planilla admite 49 niveles sobre PB: en las torres más altas cada nivel de la app junta varios pisos reales
 * (se dice en el nombre del nivel). Las cotas de los módulos del exo (exo.cortes) caen siempre en un nivel.
 */
import type { Muro, Nivel, Proyecto } from './modelo';
import { nucleoGherkin } from './nucleoGherkin';

const FT = 0.3048;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** interpolación lineal por tramos */
const tramos = (pts: [number, number][]) => (x: number) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return pts[pts.length - 1][1];
};

const tubo = (id: string, x: number, y: number, lx: number, ly: number, e: number, areaInf: number, piezaA = '', piezaB = ''): Muro =>
  ({ id, dir: 'Y', x, y, largo: lx, ladoY: ly, espesor: e, tipo: 'tubo-rect', llega: true, areaInf, piezaA, pegadoA: '', piezaB, pegadoB: '' });

/**
 * John Hancock Center (Chicago, 1969, SOM: Bruce Graham y Fazlur Khan). Tubo arriostrado en X con las caras inclinadas.
 *  - 100 pisos, 1127 ft (343,5 m) de techo (estudio JHU; CTBUH: 343,7 m).
 *  - Ancho de la cara angosta: 165 ft en la base, 140 a 400 ft, 130 a 600, 120 a 800 y 100 arriba (1100 ft) (estudio JHU,
 *    Figura 1). Cara ancha: 265 ft en la base y 165 arriba (estudio JHU), lineal en el medio (supuesto).
 *  - El núcleo de hormigón lleva la mitad del peso; el viento lo toma entero el tubo de acero (estudio JHU, hipótesis
 *    del análisis): acá el núcleo no entra a ninguna pieza (solo gravedad).
 *  - X de unos 200 ft de alto: 5 y media por cara (estudio JHU; Chicago Architecture Center: pisos 2–20, 21–37, 38–55,
 *    56–74, 75–91 y media X 92–97).
 */
export function ejemploHancock(): Proyecto {
  const angosta = tramos([[0, 165], [400, 140], [600, 130], [800, 120], [1100, 100]]);
  const ancha = tramos([[0, 265], [1100, 165]]);
  const paso = 25;                                    // ft: un nivel de la app cada 25 ft ≈ 2,2 pisos reales
  const niveles: Nivel[] = [];
  const piso = (zft: number) => Math.max(1, Math.round(zft / (1100 / 97)) + 1);   // piso real aproximado
  niveles.push({ nombre: 'Azotea (pisos 99–100)', cota: r2(1127 * FT), B: r2(ancha(1100) * FT), L: r2(angosta(1100) * FT), pisos: 100 - piso(1100) });
  for (let zft = 1100; zft >= paso; zft -= paso) {
    const p0 = piso(zft - paso) + 1, p1 = piso(zft);
    niveles.push({ nombre: p1 > p0 ? `${p0}º–${p1}º` : `${p1}º`, cota: r2(zft * FT), B: r2(ancha(zft) * FT), L: r2(angosta(zft) * FT), pisos: Math.max(1, p1 - p0 + 1) });
  }
  niveles.push({ nombre: 'PB', cota: 0, B: r2(ancha(0) * FT), L: r2(angosta(0) * FT) }, { nombre: 'Subsuelo', cota: -6 });
  const cortes = [0, 200, 400, 600, 800, 1000, 1100].map(z => r2(z * FT));
  return {
    // abre con CIRSOC: los ejemplos cumplen el reglamento (con la Planilla el exo es un estudio aparte)
    calculo: { metodo: 'cirsoc' },
    version: 1,
    nombre: 'John Hancock Center (Chicago, 1969) · modelo aproximado',
    alumno: '',
    sitio: { V: 48, Kd: 0.85, I: 1, zg: 457, alfa: 5, Kzt: 1, G: 0.85, Cpb: 0.8, Cps: -0.5, GCpi: 0.18 },
    niveles,
    // caissons hasta la roca: la platea los representa con una tensión equivalente de 20 kg/cm² (supuesto)
    fundacion: { b1: r2(ancha(0) * FT) + 4, a1: r2(angosta(0) * FT) + 4, sigmaAdm: 20 },
    hormigon: 'H30',
    // núcleo de hormigón: medidas supuestas (no publicadas); entra en la arriba más angosta (30,5 × 50,3 m)
    muros: [{ ...tubo('N1', 0, 0, 24, 12, 0.5, 1300), soloGravedad: true }],
    exo: {
      tipo: 'D', separacion: 0, modulo: 8, anchoVariable: true, cortes, alas: 5,
      // secciones dimensionadas con la app (botón «Dimensionar»): las reales no están en las fuentes
      columna: { b: 1.6, e: 0.1 }, diagonal: { b: 1.4, e: 0.08 }, viga: { b: 0.9, e: 0.04 },
      losas: { franja: 7, qD: 0.45, qL: 0.25 },
      E: 2.1e7, sigmaAdm: 14000, uniones: { columna: 'rigida', diagonal: 'rigida', viga: 'rigida', base: 'empotrada' },
      notas: [
        '100 pisos, techo a 1127 ft (343,5 m): estudio de la Johns Hopkins University (JHU, wk05). CTBUH: 343,7 m.',
        'Cara angosta 165 → 140 → 130 → 120 → 100 ft a 0, 400, 600, 800 y 1100 ft; cara ancha 265 → 165 ft: estudio JHU. Entre esas cotas, lineal (supuesto).',
        'El tubo de acero toma todo el viento y el núcleo de hormigón la mitad del peso (hipótesis del estudio JHU): el núcleo no entra en ninguna pieza.',
        'X de 200 ft, cinco y media por cara (JHU; Chicago Architecture Center: pisos 2–20, 21–37, 38–55, 56–74, 75–91 y media X 92–97). Acá arrancan en PB y la media X de arriba es una X de 100 ft (supuesto).',
        'Un nivel de la app cada 25 ft (≈ 2,2 pisos reales; la planilla admite 49 niveles): el nombre dice qué pisos junta.',
        '24 columnas en el perímetro, 7 por cara (estudio JHU): las 5 intermedias de cada cara perpendicular al viento trabajan con las esquinas como alas del tubo (alas = 5; cota superior, sin «shear lag»). Las intermedias de las caras paralelas no se modelan.',
        'Secciones: las del botón «Dimensionar», con el control del curso y el CIRSOC 301 y las losas apoyadas (columnas de 1,60 m y diagonales de 1,40 m); las reales no están en las fuentes. Medidas del núcleo y viento (V = 48 m/s, exposición de centro de ciudad, con el CIRSOC 102): supuestos.',
        'Control de orden de magnitud: unas 30 lb/ft² de acero en toda la torre (SOM) sobre 2,8 millones de ft² (CTBUH) son unas 38 000 t, con vigas y losas; el tubo dimensionado de la app, con las losas apoyadas, pesa unas 42 100 t: más que eso (el modelo no tiene «shear lag» ni las columnas intermedias de las caras paralelas, y usa el viento del CIRSOC). Otra fuente de divulgación da 46 000 t cortas de acero en toda la torre.',
        'Las losas apoyan en el exo: una franja de 7 m junto a cada fachada (con el núcleo que lleva la otra mitad del peso, como en el estudio JHU: en la base la mitad de la planta son unos 2030 m², arriba unos 770 m²; 7 m es un término medio), con 0,45 t/m² de peso (losa colaborante con contrapiso, cielorraso e instalaciones) y 0,25 t/m² de sobrecarga de oficinas (unas 50 lb/ft²): supuestos. Entran 1,2 D + 1,6 L y 1,2 D + 0,5 L + 1,6 W.',
        'Criterio CIRSOC (102-25 y 301/302): la base pide columnas de 1,60 m × 100 mm y diagonales de 1,40 m × 80 mm (las del botón «Dimensionar» con el criterio del curso no alcanzan con el viento del 102-25). Fundación: la torre apoya en caissons hasta la roca; la app no los calcula: la platea los representa con una tensión equivalente de 20 kg/cm² (supuesto).',
      ],
    },
  };
}

/**
 * Hearst Tower (Nueva York, 2006, Foster + Partners; estructura WSP Cantor Seinuk). Diagrid sobre la base histórica.
 *  - 46 pisos, 597 ft (182 m) (Wikipedia). Torre de 160 × 120 ft dentro de una base de 200 × 200 ft (ENR).
 *  - Diagrid sobre el piso 10; triángulos de 4 pisos (52 ft), barras de 57 ft, nudos cada 40 ft (Wikipedia, AISC).
 *  - Núcleo al oeste, corrido del centro (hay torsión). 10 480 t cortas de acero (Wikipedia).
 */
export function ejemploHearst(): Proyecto {
  const B = r2(160 * FT), L = r2(120 * FT), h = 182, n = 45, dz = h / n;      // 45 entrepisos de PB a la azotea
  const niveles: Nivel[] = [];
  for (let k = n; k >= 1; k--) niveles.push({ nombre: k === n ? 'Azotea (piso 46)' : `${k + 1}º`, cota: r2(k * dz), ...(k === n ? { B, L } : {}) });
  niveles.push({ nombre: 'PB (base histórica de 6 pisos)', cota: 0, B, L }, { nombre: 'Subsuelo', cota: -7 });
  const zPiso = (piso: number) => r2((piso - 1) * dz);
  // diagrid: un rombo cada 8 pisos (dos triángulos de 4); el primero baja desde el piso 10 hasta PB por la base
  const cortes = [0, zPiso(10), zPiso(18), zPiso(26), zPiso(34), zPiso(42), h].map(r2);
  return {
    // abre con CIRSOC: los ejemplos cumplen el reglamento (con la Planilla el exo es un estudio aparte)
    calculo: { metodo: 'cirsoc' },
    version: 1,
    nombre: 'Hearst Tower (Nueva York, 2006) · modelo aproximado',
    alumno: '',
    sitio: { V: 49, Kd: 0.85, I: 1, zg: 457, alfa: 5, Kzt: 1, G: 0.85, Cpb: 0.8, Cps: -0.5, GCpi: 0.18 },
    niveles,
    // sobre la roca de Manhattan: código de Nueva York, roca intermedia, 20 t/ft² ≈ 19,5 kg/cm²
    fundacion: { b1: B + 4, a1: L + 4, sigmaAdm: 19.5 },
    hormigon: 'H40',
    // núcleo al oeste (supuesto: medidas y que también toma viento); corrido 12 m del centro → torsión
    // núcleo corrido al oeste, solo de gravedad: el viento y la torsión los toma el diagrid (un tubo cerrado)
    muros: [{ ...tubo('N1', -12, 0, 12, 16, 0.6, 700), soloGravedad: true }],
    exo: {
      tipo: 'A', separacion: 0, modulo: 8, pasoH: r2(40 * FT), cortes,
      columna: { b: 0.15, e: 0.008 }, diagonal: { b: 1.2, e: 0.07 }, viga: { b: 0.15, e: 0.008 },
      losas: { franja: 5.5, qD: 0.45, qL: 0.25 }, arriostradas: true,
      E: 2.1e7, sigmaAdm: 14000, uniones: { columna: 'rigida', diagonal: 'rigida', viga: 'rigida', base: 'empotrada' },
      notas: [
        '46 pisos y 597 ft (182 m): Wikipedia. Torre de 160 × 120 ft (48,8 × 36,6 m) sobre la base histórica de 200 × 200 ft: ENR.',
        'Diagrid arriba del piso 10, triángulos de 4 pisos (52 ft), barras de 57 ft y nudos cada 40 ft (12,2 m): Wikipedia y AISC. Por eso la cara de 160 ft tiene 4 rombos y la de 120 ft, 3.',
        'Entrepiso de 182 m / 45 = 4,04 m (el real es de 13′6″ = 4,11 m en los pisos tipo; supuesto para que la azotea quede a 182 m).',
        'Debajo del piso 10 el diagrid baja por la base histórica hasta PB como un rombo alto (supuesto: en la obra son megacolumnas en el atrio).',
        'Núcleo al oeste, corrido del centro (Wikipedia). Acá es solo de gravedad: el viento y la torsión los toma el diagrid, que es un tubo cerrado (con el núcleo como única pieza de viento, toda la torsión del núcleo corrido caía sobre él y no verificaba). Sus medidas son supuestas.',
        '10 480 t cortas de acero en total (Wikipedia; unas 9500 t). Barras de perfiles laminados de ala ancha con nudos abulonados (AISC, Modern Steel Construction); sus medidas no están publicadas. Acá, las del botón «Dimensionar» con las losas apoyadas y arriostrando las diagonales: diagonales de 0,80 m × 40 mm (el diagrid no tiene columnas ni vigas intermedias: quedan en el tubo más chico). El diagrid de la app pesa unas 6700 t (sin el arriostramiento hacían falta diagonales de 0,90 m y unas 7500 t).',
        'Las diagonales están arriostradas por las losas en cada piso entre nudos (AISC): en la app cada diagonal se ata a la losa en los tres pisos que cruza entre nudos, recibe ahí la carga de la losa y pandea de piso a piso (4 m de alto, unos 4,4 m de barra) en lugar de nudo a nudo.',
        'Las losas apoyan en el exo: una franja de 5,5 m junto a cada fachada: el diagrid lleva la mitad de cada losa (48,8 × 36,6 m), el núcleo la otra mitad, con 0,45 t/m² de peso (losa colaborante con contrapiso, cielorraso e instalaciones) y 0,25 t/m² de sobrecarga de oficinas (unas 50 lb/ft²): supuestos. Entran 1,2 D + 1,6 L y 1,2 D + 0,5 L + 1,6 W.',
        'Criterio CIRSOC (102-25, 301/302 y 201): con el diagrid tomando todo el viento, las diagonales pasan a 1,20 m × 70 mm y el diagrid de la app pesa unas 17 300 t, casi el doble del acero real de toda la torre (unas 9500 t): tubos cuadrados de catálogo en lugar de perfiles armados, el viento del 102-25 y sin el aporte del núcleo. Deriva de servicio de la azotea: unos 160 mm (límite 364 mm).',
        'Fundación sobre la roca de Manhattan: tensión admisible del código de edificación de Nueva York para roca intermedia, 20 t/ft² ≈ 19,5 kg/cm² (la roca de mejor calidad admite 40 a 60 t/ft²); la app no calcula la fundación real.',
      ],
    },
  };
}

/**
 * Onterie Center, hoy Axis Apartments (Chicago, 1986, SOM: Fazlur Khan). Tubo reticulado de hormigón: X de paneles que
 * llenan las ventanas.
 *  - 60 pisos, 570 ft (174 m) (Wikipedia). Primer rascacielos de hormigón con tabiques diagonales en el perímetro.
 *  - Medidas de la planta y de las X: no publicadas en las fuentes consultadas (supuestas).
 */
export function ejemploOnterie(): Proyecto {
  const B = 48, L = 26, h = 174, n = 30, dz = h / n;                         // un nivel cada 2 pisos
  const niveles: Nivel[] = [];
  for (let k = n; k >= 1; k--) niveles.push({ nombre: k === n ? 'Azotea (pisos 59–60)' : `${2 * k - 1}º–${2 * k}º`, cota: r2(k * dz), pisos: 2, ...(k === n ? { B, L } : {}) });
  niveles.push({ nombre: 'PB', cota: 0, B, L }, { nombre: 'Subsuelo', cota: -5 });
  return {
    // abre con CIRSOC: los ejemplos cumplen el reglamento (con la Planilla el exo es un estudio aparte)
    calculo: { metodo: 'cirsoc' },
    version: 1,
    nombre: 'Onterie Center (Chicago, 1986) · modelo aproximado',
    alumno: '',
    sitio: { V: 48, Kd: 0.85, I: 1, zg: 457, alfa: 5, Kzt: 1, G: 0.85, Cpb: 0.8, Cps: -0.5, GCpi: 0.18 },
    niveles,
    // caissons hasta la roca: la platea los representa con una tensión equivalente de 20 kg/cm² (supuesto)
    fundacion: { b1: B + 4, a1: L + 4, sigmaAdm: 20 },
    hormigon: 'H40',
    // núcleo de ascensores (supuesto), solo de gravedad: el viento lo toma el tubo de hormigón con las X
    muros: [{ ...tubo('N1', 0, 0, 10, 8, 0.4, 450), soloGravedad: true }],
    exo: {
      tipo: 'D', separacion: 0, modulo: 5, material: 'hormigon',
      // hormigón: E ≈ 3·10⁶ t/m² (H40), tensión admisible de compresión ≈ 0,45·f′c ≈ 1800 t/m²; barras macizas (e = b/2)
      // secciones dimensionadas con la app (catálogo de hormigón macizo)
      columna: { b: 3.0, e: 1.5 }, diagonal: { b: 1.5, e: 0.75 }, viga: { b: 1.6, e: 0.8 },
      E: 3.0e6, sigmaAdm: 1800, uniones: { columna: 'rigida', diagonal: 'rigida', viga: 'rigida', base: 'empotrada' },
      notas: [
        '60 pisos y 570 ft (174 m): Wikipedia («Axis Apartments»). Las X son paneles de hormigón que llenan las ventanas y forman un tubo reticulado; es el primer rascacielos de hormigón con diagonales en el perímetro (Wikipedia; STRUCTURE, «Evolution of the Braced Tube», 2024).',
        'Planta de 48 × 26 m, X cada 10 pisos y núcleo: supuestos (no encontré las medidas en una fuente confiable).',
        'Barras de hormigón macizas (e = b/2), E = 3·10⁶ t/m², γ = 2,4 t/m³ y σ adm = 1800 t/m² (0,45 f′c de un H40): supuestos para el modelo. Las barras de la app son cuadradas y equivalen a los paneles reales, que son placas que llenan los vanos entre ventanas: columnas de 3,0 × 1,5 m y diagonales de 1,5 × 0,75 m, las medidas con que verifican tensión, pandeo y la deriva con CIRSOC y FEM. Fundación: platea con σ adm = 20 kg/cm² (supuesto de roca o pilotes; el original va sobre cajones).',
        'Un nivel de la app cada 2 pisos (la planilla admite 49 niveles).',
      ],
    },
  };
}

/**
 * Torre chica para el paso a paso de la guía: 10 pisos de 3 m, planta de 16 × 12 m, dos tabiques de 4,00 × 0,25 m
 * paralelos al viento A y un tubo arriostrado en X de dos módulos de 5 pisos (ficha D), sin peso propio del acero
 * para que las cuentas a mano sean cortas. Solo el viento A tiene piezas (el ejemplo sigue ese viento).
 */
export function ejemploBasicoExo(): Proyecto {
  const niveles: Nivel[] = [{ nombre: 'Azotea', cota: 30, B: 16, L: 12 }];
  for (let k = 9; k >= 1; k--) niveles.push({ nombre: `${k + 1}º`, cota: 3 * k });
  niveles.push({ nombre: 'PB', cota: 0 }, { nombre: 'Subsuelo', cota: -3 });
  const t = (id: string, x: number): Muro => ({ id, dir: 'Y', x, y: 0, largo: 4, espesor: 0.25, llega: true, areaInf: 40, piezaA: id, pegadoA: '', piezaB: '', pegadoB: '' });
  return {
    // abre con CIRSOC: los ejemplos cumplen el reglamento (con la Planilla el exo es un estudio aparte)
    calculo: { metodo: 'cirsoc' },
    version: 1,
    nombre: 'Torre chica con tubo en X (ejemplo de la guía)',
    alumno: '',
    sitio: { V: 48, Kd: 0.85, I: 1, zg: 457, alfa: 5, Kzt: 1, G: 0.85, Cpb: 0.8, Cps: -0.5, GCpi: 0.18 },
    niveles,
    fundacion: { b1: 16, a1: 12 },
    hormigon: 'H30',
    muros: [t('T1', -4), t('T2', 4)],
    exo: {
      tipo: 'D', separacion: 0, modulo: 5, pesoPropio: false,
      columna: { b: 0.3, e: 0.016 }, diagonal: { b: 0.2, e: 0.0125 }, viga: { b: 0.25, e: 0.0125 },
      E: 2.1e7, sigmaAdm: 14000, uniones: { columna: 'rigida', diagonal: 'articulada', viga: 'rigida', base: 'empotrada' },
      notas: ['Ejemplo para aprender: medidas elegidas para que las cuentas a mano sean cortas (no es un edificio real).'],
    },
  };
}

/**
 * Shanghai Tower (Shanghái, 2015, Gensler; estructura Thornton Tomasetti). Núcleo de hormigón con outriggers,
 * supercolumnas y cinturones: la ficha F.
 *  - 632 m y nueve zonas de 12 a 15 pisos, con dos pisos de máquinas y refugio en cada junta (Wikipedia, Designing
 *    Buildings).
 *  - Núcleo de hormigón de unos 90 × 90 ft (30 m) (Thornton Tomasetti); outriggers de acero de dos pisos de alto en los
 *    pisos de máquinas y cinturones dobles en cada zona; ocho supercolumnas compuestas (AISC, Modern Steel Construction,
 *    abril 2013; ENR).
 *  - Lo demás (planta, espesor del núcleo, cuántas juntas tienen brazos, secciones): supuesto.
 */
export function ejemploShanghai(): Proyecto {
  const h = 632, n = 48, dz = h / n, B = 55;                   // un nivel de la app cada 13,2 m ≈ 2,7 pisos reales
  const niveles: Nivel[] = [];
  for (let k = n; k >= 1; k--) niveles.push({ nombre: k === n ? 'Corona (632 m)' : `nivel ${k} (≈ piso ${Math.round((k * dz) / (h / 128))})`, cota: r2(k * dz), pisos: k % 3 === 0 ? 2 : 3, ...(k === n ? { B, L: B } : {}) });
  niveles.push({ nombre: 'PB', cota: 0, B, L: B }, { nombre: 'Subsuelo', cota: -10 });
  // juntas de zona: nueve zonas iguales (supuesto); los brazos van en el nivel de la app más cercano
  const juntas = Array.from({ length: 8 }, (_, j) => r2(Math.round(((j + 1) * h) / 9 / dz) * dz));
  return {
    // abre con CIRSOC: los ejemplos cumplen el reglamento (con la Planilla el exo es un estudio aparte)
    calculo: { metodo: 'cirsoc' },
    version: 1,
    nombre: 'Shanghai Tower (Shanghái, 2015) · modelo aproximado',
    alumno: '',
    sitio: { V: 42, Kd: 0.85, I: 1, zg: 457, alfa: 5, Kzt: 1, G: 0.85, Cpb: 0.8, Cps: -0.5, GCpi: 0.18 },
    niveles,
    fundacion: { b1: 107, a1: 107, sigmaAdm: 20 },
    hormigon: 'H70',
    // núcleo de hormigón de 30 × 30 m (Thornton Tomasetti); pared de 1,50 m (supuesto); toma el viento de los dos lados
    // la pared se angosta con la altura (supuesto): 2,5 m abajo, 1,8 m desde 211 m y 1,2 m desde 421 m
    muros: [{ ...tubo('N1', 0, 0, 30, 30, 2.5, (B * B) / 2, 'Núcleo', 'Núcleo B'), espesores: [{ desde: 211, e: 1.8 }, { desde: 421, e: 1.2 }] }],
    exo: {
      tipo: 'F', separacion: 0, modulo: 4, nucleo: 30, outriggers: juntas, cinturon: false,
      losas: { franja: 6.25, qD: 0.5, qL: 0.25 },
      // supercolumnas compuestas: cajones de acero rellenos de hormigón de 55 MPa, por tramos (CIRSOC 301 cap. I; supuesto); brazos: botón «Dimensionar»
      columna: { b: 5.5, e: 0.13, relleno: 55 }, diagonal: { b: 2.0, e: 0.10 }, viga: { b: 0.15, e: 0.008 },
      tramos: [{ clase: 'columna', desde: 0, sec: { b: 5.5, e: 0.13, relleno: 55 } }, { clase: 'columna', desde: 211, sec: { b: 4.5, e: 0.1, relleno: 55 } }, { clase: 'columna', desde: 421, sec: { b: 3.5, e: 0.08, relleno: 55 } }],
      E: 2.1e7, sigmaAdm: 14000,
      notas: [
        '632 m y nueve zonas de 12 a 15 pisos, con dos pisos de máquinas y refugio en cada junta (Wikipedia; Designing Buildings). Acá nueve zonas iguales (supuesto).',
        'Núcleo de hormigón de unos 90 × 90 ft (30 m): Thornton Tomasetti. Pared que se angosta con la altura (2,50 m abajo, 1,80 m desde 211 m y 1,20 m desde 421 m), de hormigón de alta resistencia (H70; la obra usó C60 a C70) y que toma el viento de los dos lados: supuestos.',
        'Outriggers de acero de dos pisos de alto en los pisos de máquinas, cinturones dobles en cada zona y ocho supercolumnas compuestas (acero y hormigón) atadas al núcleo por los brazos: AISC (Modern Steel Construction, abril 2013) y ENR. Acá los brazos son de un piso de alto (un nivel de la app, 13,2 m) y van en las ocho juntas (supuesto: las fuentes no dicen en cuántas).',
        'Planta cuadrada de 55 m (supuesto: la torre real es redondeada y se angosta con la altura). Un nivel de la app cada 13,2 m: cada uno junta 2 o 3 pisos reales (128 en total) y carga sus losas (la planilla admite 49 niveles).',
        'Supercolumnas pareadas a media cara, alineadas con los brazos: cada brazo toma la suya (sin el reparto del cinturón, que en la obra lleva sobre todo el peso de cada zona). Son compuestas (acero y hormigón) y cada una lleva unas 24 000 t: un tubo de acero no alcanza. Acá son cajones de acero rellenos de hormigón de 55 MPa (columnas compuestas, CIRSOC 301 cap. I: rigidez de la sección transformada, compresión con Fmy y Em, y el peso del hormigón sumado), por tramos: 5,5 m × 130 mm hasta 211 m, 4,5 m × 100 mm hasta 421 m y 3,5 m × 80 mm arriba (supuestos, las medidas con que verifican con CIRSOC y FEM). La obra usó hormigón C60 a C70; el capítulo I llega a 55 MPa. El peso que informa la app suma el acero y el hormigón del relleno.',
        'Brazos de 2,0 m × 100 mm (diagonales; los cordones quedan en el tubo más chico porque el brazo de 13,2 m de alto los descarga).',
        'Las losas apoyan en el perímetro: la mitad de cada losa (franja de 6,25 m), con 0,5 t/m² de peso y 0,25 t/m² de sobrecarga (supuesto); la otra mitad, en el núcleo. Los brazos se conectan al terminar la obra gruesa.',
        'Fundación: platea cuadrada de 107 m, de la misma área que la losa circular real de 121 m de diámetro sobre 955 pilotes; σ adm = 20 kg/cm² como equivalente de los pilotes (supuesto).',
        'Viento: CIRSOC 102 con V = 42 m/s y exposición de centro de ciudad (supuesto: del orden de la presión básica de 0,55 kPa de Shanghái pasada a ráfaga; hay tifones).',
      ],
    },
  };
}

/**
 * 30 St Mary Axe, «the Gherkin» (Londres, 2004, Foster + Partners; estructura Arup). Diagrid de perfil variable: la planta
 * es circular y su diámetro crece desde la base hasta el piso 17 y después se angosta hasta la cúpula. Fuentes y supuestos
 * en exo.notas (las fuentes técnicas: Arup, New Steel Construction, Archinomy, Harvard Design Magazine, CTBUH).
 */
export function ejemploGherkin(): Proyecto {
  const dz = 4.15, hTop = 166, hLente = 179.77;
  // diámetro exterior (m) medido en el corte de Foster + Partners (escala: del suelo a la lente, 179,77 m; da 48,9 m en la
  // base, 56,4 m en el piso 18 y 26,5 m en el 39, como las fuentes)
  const PERFIL: [number, number][] = [[0, 48.9], [4.15, 49.9], [8.3, 50.8], [12.45, 51.6], [16.6, 52.1], [20.75, 52.8], [24.9, 53.3], [29.05, 53.9],
    [33.2, 54.4], [37.35, 54.8], [41.5, 55.3], [45.65, 55.4], [49.8, 55.6], [53.95, 55.9], [58.1, 56.1], [62.25, 56.2], [66.4, 56.3], [70.55, 56.35],
    [74.7, 56.4], [78.85, 56.2], [83, 55.95], [87.15, 55.5], [91.3, 55.3], [95.45, 54.7], [99.6, 54], [103.75, 53.2], [107.9, 52.5], [112.05, 51.4],
    [116.2, 50.1], [120.35, 49], [124.5, 47.7], [128.65, 46.1], [132.8, 44.4], [136.95, 42.5], [141.1, 40.7], [145.25, 38.4], [149.4, 35.9],
    [153.55, 33.1], [157.7, 30.1], [161.85, 26.5], [166, 22.85], [168, 20.8], [170, 18.6], [172, 16.25], [174, 13.7], [176, 10.7], [178, 7.2],
    [179.3, 4.2], [179.77, 2.4]];
  const D = tramos(PERFIL);
  // planta circular: el cálculo lee un cuadrado de la misma área (lado 0,886 D); la silueta y la carpintería son el círculo
  const lado = (d: number) => r2(Math.sqrt(Math.PI / 4) * d);
  const circulo = (d: number) => { const r = r2(d / 2), b = Math.tan(Math.PI / 8); return [{ x: r, y: 0, b }, { x: 0, y: r, b }, { x: -r, y: 0, b }, { x: 0, y: -r, b }]; };
  const uso = (k: number) => (k === 40 ? 'bar, entrepiso bajo la cúpula' : k >= 38 ? 'comedores y salas' : k === 37 ? 'cocina y máquinas' : k >= 35 ? 'máquinas' : k === 1 ? 'locales' : 'oficinas');
  // pozos de luz: la losa de cada piso de oficinas termina en seis triángulos abiertos a la fachada (no son huecos dentro
  // de la losa: son su contorno). Cada triángulo va de un nudo del diagrid al siguiente (20°) y su punta llega al 63 % del
  // radio (plantas de Foster). Siguen las espirales: los nudos de la franja avanzan 5° por piso, así que el centro del
  // triángulo está en 10° + 5° · k (k = piso) y sus vértices sobre la fachada caen sobre dos diagonales. Del 2º al 30º;
  // el 16º es entero (folleto, 2024) y el 31º ya no los tiene (planta del piso 31).
  const conPozos = (k: number) => k >= 2 && k <= 30 && k !== 16;
  const losaConPozos = (k: number) => {
    const R = r2(D(k * dz) / 2), g = Math.PI / 180, pt = (r: number, a: number, b = 0) => ({ x: r2(r * Math.cos(a)), y: r2(r * Math.sin(a)), ...(b ? { b } : {}) });
    const v: { x: number; y: number; b?: number }[] = [];
    for (let j = 0; j < 6; j++) {
      const c = (10 + 5 * k + 60 * j) * g;
      // del nudo de la derecha del triángulo j: arco de 40° (los «dedos» de oficinas) hasta el nudo izquierdo del siguiente
      v.push(pt(R, c - 10 * g), pt(0.63 * R, c), pt(R, c + 10 * g, Math.tan((40 * g) / 4)));
    }
    return v;
  };
  const niveles: Nivel[] = [];
  // cada nivel: la losa y la carpintería (el vidrio que ve el viento) con el diámetro de su cota; la piel va de un piso
  // al de arriba sin escalones (la capa «Fachada» del 3D y el túnel con paredes exactas en altura). El ancho para el
  // cálculo (B y L) es el del medio del tramo que cubre, hasta el nivel de arriba
  const nivel = (nombre: string, z: number, zArriba: number, losa: number | null, contorno?: Nivel['silueta']): Nivel => {
    const dv = D((z + zArriba) / 2);
    // la cúpula no tiene losas (niveles «sin losa»); su silueta es un punto (0,3 m), que no se usa
    return { nombre, cota: r2(z), B: lado(dv), L: lado(dv), silueta: contorno ?? circulo(losa ?? 0.3), carpinteria: circulo(D(z)) };
  };
  // la cúpula (de 166 a 179,77 m): solo cerramiento de vidrio, sin estructura ni losas (lleva la lente de 2,4 m)
  const cupula = [hLente, 176.5, 172.5, 169];
  // (niveles sin losa: solo carpintería; no se dibuja losa ni suma su peso)
  niveles.push({ nombre: 'Lente (179,77 m)', cota: hLente, B: lado(2.4), L: lado(2.4), silueta: circulo(2.4), carpinteria: circulo(2.4), sinLosa: true });
  for (let j = 1; j < cupula.length; j++) niveles.push({ ...nivel(`Cúpula de vidrio (${String(cupula[j]).replace('.', ',')} m)`, cupula[j], cupula[j - 1], null), sinLosa: true });
  niveles.push(nivel(`40º (${uso(40)})`, hTop, cupula[cupula.length - 1], D(hTop)));
  for (let k = 39; k >= 1; k--) niveles.push(nivel(`${k}º (${uso(k)})`, k * dz, (k + 1) * dz, D(k * dz), conPozos(k) ? losaConPozos(k) : undefined));
  niveles.push(nivel('PB (hall de doble altura)', 0, dz, D(0)), { nombre: 'Subsuelo', cota: -6.15 });
  // un rombo cada 4 pisos (anillos de nudos cada 2 pisos, 8,3 m); el último anillo, en el piso 40 (166 m)
  // en el cálculo, un módulo más (de 166 m a la lente) lleva el viento y el peso de la cúpula al anillo del piso 40: es el
  // marco de la cúpula, que en el dibujo es carpintería (circular.hasta)
  const cortes = [...Array.from({ length: 11 }, (_, j) => r2(j * 4 * dz)), hLente];
  const zPiso = (k: number) => r2(k * dz);
  return {
    version: 1,
    nombre: '30 St Mary Axe, «the Gherkin» (Londres, 2004) · modelo aproximado',
    alumno: '',
    // abre con el método CIRSOC: con los de la cátedra el exo es un estudio aparte (y la torre no tiene tabiques que tomen viento)
    calculo: { metodo: 'cirsoc' },
    sitio: { V: 40, Kd: 0.85, I: 1, zg: 457, alfa: 5, Kzt: 1, G: 0.85, Cpb: 0.8, Cps: -0.5, GCpi: 0.18 },
    niveles,
    // 333 pilotes de 750 mm y unos 27 m, con 117 000 t de capacidad: en la app, una platea con la tensión equivalente
    fundacion: { b1: 52, a1: 52, sigmaAdm: 4.3 },
    hormigon: 'H40',
    // núcleo relevado en las plantas de Foster (docs/gherkin-nucleo): muros de 25 cm y columnas de 0,70 m; todo hasta la
    // losa del 38º; la escalera, el ascensor chico, W, D, S y P siguen hasta la del 40º (W y la escalera, recortados a
    // la piel del 40º en el último piso), y la losa del 40º apoya en ellos y en el diagrid
    // (W2, el muro corto que va de la columna de 95° hacia la de 109°, de 40 cm: con 25 cm pedía más del 4 % de acero)
    muros: nucleoGherkin({ z38: zPiso(38), z39: zPiso(39), z40: hTop, espesorDe: { W2: 0.4 } }),
    exo: {
      tipo: 'A', separacion: 0, modulo: 4, cortes, anchoVariable: true, pasoH: 9.65, circular: { nudos: 18, hasta: hTop },
      columna: { b: 0.15, e: 0.008 }, diagonal: { b: 0.5, e: 0.06 }, viga: { b: 0.3, e: 0.016 },
      tramos: [{ clase: 'diagonal', desde: zPiso(13), sec: { b: 0.45, e: 0.05 } }, { clase: 'diagonal', desde: zPiso(25), sec: { b: 0.4, e: 0.03 } }, { clase: 'diagonal', desde: zPiso(33), sec: { b: 0.3, e: 0.02 } }, { clase: 'diagonal', desde: hTop, sec: { b: 0.25, e: 0.016 } }],
      losas: { franja: 7, qD: 0.4, qL: 0.25 }, arriostradas: true,
      E: 2.1e7, sigmaAdm: 14000, uniones: { columna: 'rigida', diagonal: 'rigida', viga: 'rigida', base: 'empotrada' },
      notas: [
        'Corte de Foster + Partners (PA1202, «Bury Street East Illustrative Section», julio de 1999): niveles cada 4,15 m, del 1º (locales, +4,15) al 34º (oficinas, +141,10); 35º y 36º máquinas, 37º cocina y máquinas, 38º y 39º comedores y salas, 40º entrepiso (+166,00) bajo la cúpula; cima +179,77; subsuelo −6,15. Acá un nivel de la app por piso real.',
        'Silueta: medida en el corte de Foster, píxel por píxel, con la escala del suelo a la cima (179,77 m): 48,9 m de diámetro en la base, 56,4 m en el piso 18 (el mayor), 40,7 m en el 34º, 26,5 m en el 39º y 22,9 m en el 40º. Coincide con las fuentes (49 m en la base, 56,15 m en el piso 17, 26,5 m arriba; Archinomy) con menos de 0,5 m de diferencia.',
        'Cada nivel tiene dos contornos: la losa (el diámetro en su cota) y la carpintería (el vidrio, con el diámetro de la mitad del tramo hasta el nivel de arriba). La carpintería es lo que ve el túnel de viento y lo que dibuja el 3D como piel de vidrio. Las celdas del túnel siguen el corte con menos de una celda (1,4 m con la grilla de 200 celdas de alto).',
        'Cúpula «Lens» (de 166 m a la cima): en la app es solo carpintería, sin estructura ni losas, hasta la lente de 2,4 m (Archinomy: 2,4 m y 250 kg, la única pieza de vidrio curvo). En el cálculo, su viento y su peso bajan al anillo del piso 40 por un módulo liviano (su marco); en el dibujo el diagrid termina en el piso 40.',
        'Diagrid: 18 nudos por anillo, anillos cada dos pisos (8,3 m) y cada anillo girado 10° respecto del de abajo: 20 anillos × 18 = los 360 nudos publicados (Engineering Timelines). Rombos de 4 pisos de alto y 20° de ancho, como en el corte, las plantas (18 nudos en la planta baja de Foster) y la foto de la entrada (la X de la base a unos 8,3 m, la punta de la «A» a 16,6 m). Las «A» prefabricadas de dos pisos y los anillos horizontales a tracción (7116 kN en el piso 2): Harvard Design Magazine, Archinomy.',
        'Cálculo: las fichas de la etapa 08 son caras planas, así que el diagrid circular se calcula como un tubo cuadrado de la misma área (lado 0,886 D), con nudos cada 9,65 m en la cara; el viento sobre el cuadrado es mayor que sobre el cilindro (del lado seguro). El 3D y la planta dibujan el diagrid circular real; el color de sus barras es el esfuerzo del tubo circular con el momento que toma el exo (rojo tracción, azul compresión) más el peso de las losas.',
        'Tubos de 508 mm × 40 mm de PB al piso 2 y de 273 mm × 12,5 mm en los pisos 36 a 38 (Archinomy). La app usa cajones cuadrados verificados con el CIRSOC 301/302 y el viento del 102-25: 0,50 m × 60 mm hasta el piso 13, 0,45 × 50 mm hasta el 25, 0,40 × 30 mm hasta el 33 y 0,30 × 20 mm arriba. Anillos: cajón de 0,30 m × 16 mm (supuesto).',
        'Núcleo circular de servicios y ascensores, de columnas de acero que llevan solo carga vertical (el viento lo toma entero el diagrid): Arup, Archinomy. Relevado en las plantas de Foster: se superpusieron las de oficinas bajas, medias y altas, alineadas por sus columnas (coinciden con 2 a 5 cm), y quedó lo que se repite en todas. Un anillo de 16 columnas a 12,3 m del centro, giradas con su radio; cuatro columnas centrales (D, en el nudo de los ascensores, y S, del lado del hall); y, de cada lado, el banco de 3 ascensores, un ascensor suelto, la escalera, un ascensor chico y dos muros hacia el anillo. Lo que cambia de planta a planta (baños, ascensores bajos, locales) no entra. Datos e imágenes en docs/gherkin-nucleo.',
        'Núcleo en la app: muros de 25 cm (W2, el corto junto a la columna de 95°, de 40 cm: con 25 cm pedía más del 4 % de acero) y columnas de 0,70 × 0,70 m de hormigón (en la obra son de acero). El anillo, los bancos de ascensores y el resto llegan a la losa del 38º; las escaleras, el ascensor chico, el muro W y las columnas D, S y P siguen hasta la del 40º (son lo que aparece en la planta del restaurante; el anillo ya no está): la losa del 40º apoya en ellos y en el diagrid. Del 39º al 40º, el muro W y los dos de la escalera se recortan a 11 m del centro, porque la piel del 40º mide 11,43 m de radio; esos tramos arrancan en el 39º y no entran al cálculo de viento. Los muros de cada mitad forman una pieza que toma viento junto con el diagrid (en la obra lo toma solo el diagrid); las columnas llevan solo carga vertical. Las losas pasan enteras por el medio del núcleo. Las puertas de los ascensores y de la escalera no se modelan: el banco de ascensores, el ascensor suelto y la escalera son tubos cerrados, como funcionan estructuralmente; los muros se encuentran en esquinas y en T exactas.',
        'Losas: compuestas de 160 mm sobre chapa Ribdeck 80, con vigas radiales cada 10° del núcleo a la fachada y una viga radial que ata cada nudo al núcleo; sin columnas interiores (New Steel Construction). El diagrid lleva una franja de 7 m junto a la fachada (supuesto), con 0,4 t/m² de peso y 0,25 t/m² de sobrecarga.',
        'Pozos de luz: cada piso gira 5° y deja seis pozos triangulares que suben en espiral (Harvard Design Magazine). Acá la losa termina en seis triángulos abiertos a la fachada (son su contorno, no huecos): cada uno va de un nudo del diagrid al siguiente (20°) con la punta al 63 % del radio, y giran 5° por piso con las espirales, así que sus vértices caen sobre las diagonales (plantas de Foster y del folleto), en las oficinas del 2º al 30º; el 16º es entero (folleto, 2024) y el 31º ya no los tiene (planta del piso 31).',
        'Áreas útiles del folleto (CBRE, 2024): piso 16, 19 558 ft² (1817 m²); 22, 17 878; 30, 12 226 ft² (1136 m²). Ascensores en tres tramos (medio, alto y expreso al restaurante), con transferencia en los pisos 21 y 22; 2,75 m de piso a cielorraso.',
        'Acero: 8358 t según el modelo de Arup: 29 % en el diagrid, 24 % en las columnas del núcleo y 47 % en vigas (Archinomy); Arup da unas 10 000 t y 2500 t de diagrid. Fundación: 333 pilotes de 750 mm de unos 27 m, con 117 000 t de capacidad (New Steel Construction); la app no calcula pilotes: platea de 52 × 52 m con la tensión equivalente, 4,3 kg/cm².',
        'Viento: Londres no está en el CIRSOC; V = 40 m/s y exposición de centro de ciudad (supuesto, del lado seguro). Frecuencia: el CIRSOC no tiene fórmula para un diagrid; la de tabiques (1.9-5) da un Gf de unos 1,36, del lado seguro (queda en «atención»).',
      ],
    },
  };
}
