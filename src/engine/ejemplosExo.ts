/**
 * Edificios reales con exoesqueleto, para la etapa 08. Cada número lleva su fuente o la marca «supuesto» (en
 * exo.notas, que se muestran en la etapa 08 y van a la hoja «G · Exoesqueleto»). Lo que no está publicado (secciones
 * de las barras, medidas del núcleo) se supone y se puede dimensionar con el botón de la etapa 08.
 *
 * La planilla admite 49 niveles sobre PB: en las torres más altas cada nivel de la app junta varios pisos reales
 * (se dice en el nombre del nivel). Las cotas de los módulos del exo (exo.cortes) caen siempre en un nivel.
 */
import type { Muro, Nivel, Proyecto } from './modelo';

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
    version: 1,
    nombre: 'John Hancock Center (Chicago, 1969) · modelo aproximado',
    alumno: '',
    sitio: { V: 48, Kd: 0.85, I: 1, zg: 457, alfa: 5, Kzt: 1, G: 0.85, Cpb: 0.8, Cps: -0.5, GCpi: 0.18 },
    niveles,
    fundacion: { b1: r2(ancha(0) * FT) + 4, a1: r2(angosta(0) * FT) + 4 },
    hormigon: 'H30',
    // núcleo de hormigón: medidas supuestas (no publicadas); entra en la arriba más angosta (30,5 × 50,3 m)
    muros: [tubo('N1', 0, 0, 24, 12, 0.5, 1300)],
    exo: {
      tipo: 'D', separacion: 0, modulo: 8, anchoVariable: true, cortes, alas: 5,
      // secciones dimensionadas con la app (botón «Dimensionar»): las reales no están en las fuentes
      columna: { b: 1.6, e: 0.08 }, diagonal: { b: 1.4, e: 0.06 }, viga: { b: 0.9, e: 0.04 },
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
    version: 1,
    nombre: 'Hearst Tower (Nueva York, 2006) · modelo aproximado',
    alumno: '',
    sitio: { V: 49, Kd: 0.85, I: 1, zg: 457, alfa: 5, Kzt: 1, G: 0.85, Cpb: 0.8, Cps: -0.5, GCpi: 0.18 },
    niveles,
    fundacion: { b1: B + 4, a1: L + 4 },
    hormigon: 'H40',
    // núcleo al oeste (supuesto: medidas y que también toma viento); corrido 12 m del centro → torsión
    muros: [tubo('N1', -12, 0, 12, 16, 0.6, 700, 'Núcleo', 'Núcleo B')],
    exo: {
      tipo: 'A', separacion: 0, modulo: 8, pasoH: r2(40 * FT), cortes,
      columna: { b: 0.15, e: 0.008 }, diagonal: { b: 0.8, e: 0.04 }, viga: { b: 0.15, e: 0.008 },
      losas: { franja: 5.5, qD: 0.45, qL: 0.25 }, arriostradas: true,
      E: 2.1e7, sigmaAdm: 14000, uniones: { columna: 'rigida', diagonal: 'rigida', viga: 'rigida', base: 'empotrada' },
      notas: [
        '46 pisos y 597 ft (182 m): Wikipedia. Torre de 160 × 120 ft (48,8 × 36,6 m) sobre la base histórica de 200 × 200 ft: ENR.',
        'Diagrid arriba del piso 10, triángulos de 4 pisos (52 ft), barras de 57 ft y nudos cada 40 ft (12,2 m): Wikipedia y AISC. Por eso la cara de 160 ft tiene 4 rombos y la de 120 ft, 3.',
        'Entrepiso de 182 m / 45 = 4,04 m (el real es de 13′6″ = 4,11 m en los pisos tipo; supuesto para que la azotea quede a 182 m).',
        'Debajo del piso 10 el diagrid baja por la base histórica hasta PB como un rombo alto (supuesto: en la obra son megacolumnas en el atrio).',
        'Núcleo al oeste, corrido del centro (Wikipedia): genera torsión. Sus medidas y que también tome viento son supuestos.',
        '10 480 t cortas de acero en total (Wikipedia; unas 9500 t). Barras de perfiles laminados de ala ancha con nudos abulonados (AISC, Modern Steel Construction); sus medidas no están publicadas. Acá, las del botón «Dimensionar» con las losas apoyadas y arriostrando las diagonales: diagonales de 0,80 m × 40 mm (el diagrid no tiene columnas ni vigas intermedias: quedan en el tubo más chico). El diagrid de la app pesa unas 6700 t (sin el arriostramiento hacían falta diagonales de 0,90 m y unas 7500 t).',
        'Las diagonales están arriostradas por las losas en cada piso entre nudos (AISC): en la app cada diagonal se ata a la losa en los tres pisos que cruza entre nudos, recibe ahí la carga de la losa y pandea de piso a piso (4 m de alto, unos 4,4 m de barra) en lugar de nudo a nudo.',
        'Las losas apoyan en el exo: una franja de 5,5 m junto a cada fachada: el diagrid lleva la mitad de cada losa (48,8 × 36,6 m), el núcleo la otra mitad, con 0,45 t/m² de peso (losa colaborante con contrapiso, cielorraso e instalaciones) y 0,25 t/m² de sobrecarga de oficinas (unas 50 lb/ft²): supuestos. Entran 1,2 D + 1,6 L y 1,2 D + 0,5 L + 1,6 W.',
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
    version: 1,
    nombre: 'Onterie Center (Chicago, 1986) · modelo aproximado',
    alumno: '',
    sitio: { V: 48, Kd: 0.85, I: 1, zg: 457, alfa: 5, Kzt: 1, G: 0.85, Cpb: 0.8, Cps: -0.5, GCpi: 0.18 },
    niveles,
    fundacion: { b1: B + 4, a1: L + 4 },
    hormigon: 'H40',
    // núcleo de ascensores (supuesto): también toma viento
    muros: [tubo('N1', 0, 0, 10, 8, 0.4, 450, 'Núcleo', 'Núcleo B')],
    exo: {
      tipo: 'D', separacion: 0, modulo: 5, material: 'hormigon',
      // hormigón: E ≈ 3·10⁶ t/m² (H40), tensión admisible de compresión ≈ 0,45·f′c ≈ 1800 t/m²; barras macizas (e = b/2)
      // secciones dimensionadas con la app (catálogo de hormigón macizo)
      columna: { b: 1.7, e: 0.85 }, diagonal: { b: 0.8, e: 0.4 }, viga: { b: 1.6, e: 0.8 },
      E: 3.0e6, sigmaAdm: 1800, uniones: { columna: 'rigida', diagonal: 'rigida', viga: 'rigida', base: 'empotrada' },
      notas: [
        '60 pisos y 570 ft (174 m): Wikipedia («Axis Apartments»). Las X son paneles de hormigón que llenan las ventanas y forman un tubo reticulado; es el primer rascacielos de hormigón con diagonales en el perímetro (Wikipedia; STRUCTURE, «Evolution of the Braced Tube», 2024).',
        'Planta de 48 × 26 m, X cada 10 pisos y núcleo: supuestos (no encontré las medidas en una fuente confiable).',
        'Barras de hormigón macizas (e = b/2), E = 3·10⁶ t/m², γ = 2,4 t/m³ y σ adm = 1800 t/m² (0,45 f′c de un H40): supuestos para el modelo. Las barras de la app son cuadradas (las del botón «Dimensionar»: columnas de 1,70 m, diagonales de 0,80 m); los paneles reales son placas que llenan las ventanas.',
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
  for (let k = n; k >= 1; k--) niveles.push({ nombre: k === n ? 'Corona (632 m)' : `nivel ${k} (≈ piso ${Math.round((k * dz) / (h / 128))})`, cota: r2(k * dz), ...(k === n ? { B, L: B } : {}) });
  niveles.push({ nombre: 'PB', cota: 0, B, L: B }, { nombre: 'Subsuelo', cota: -10 });
  // juntas de zona: nueve zonas iguales (supuesto); los brazos van en el nivel de la app más cercano
  const juntas = Array.from({ length: 8 }, (_, j) => r2(Math.round(((j + 1) * h) / 9 / dz) * dz));
  return {
    version: 1,
    nombre: 'Shanghai Tower (Shanghái, 2015) · modelo aproximado',
    alumno: '',
    sitio: { V: 42, Kd: 0.85, I: 1, zg: 457, alfa: 5, Kzt: 1, G: 0.85, Cpb: 0.8, Cps: -0.5, GCpi: 0.18 },
    niveles,
    fundacion: { b1: B + 6, a1: B + 6 },
    hormigon: 'H40',
    // núcleo de hormigón de 30 × 30 m (Thornton Tomasetti); pared de 1,50 m (supuesto); toma el viento de los dos lados
    muros: [tubo('N1', 0, 0, 30, 30, 1.5, (B * B) / 2, 'Núcleo', 'Núcleo B')],
    exo: {
      tipo: 'F', separacion: 0, modulo: 4, nucleo: 30, outriggers: juntas, cinturon: false,
      losas: { franja: 6.25, qD: 0.5, qL: 0.25 },
      // supercolumnas compuestas como cajones de acero equivalentes, por tramos (supuesto); brazos: botón «Dimensionar»
      columna: { b: 4.0, e: 0.25 }, diagonal: { b: 1.2, e: 0.06 }, viga: { b: 0.15, e: 0.008 },
      tramos: [{ clase: 'columna', desde: 0, sec: { b: 4.0, e: 0.25 } }, { clase: 'columna', desde: 211, sec: { b: 3.5, e: 0.2 } }, { clase: 'columna', desde: 421, sec: { b: 2.5, e: 0.15 } }],
      E: 2.1e7, sigmaAdm: 14000,
      notas: [
        '632 m y nueve zonas de 12 a 15 pisos, con dos pisos de máquinas y refugio en cada junta (Wikipedia; Designing Buildings). Acá nueve zonas iguales (supuesto).',
        'Núcleo de hormigón de unos 90 × 90 ft (30 m): Thornton Tomasetti. Pared de 1,50 m y que toma el viento de los dos lados: supuestos.',
        'Outriggers de acero de dos pisos de alto en los pisos de máquinas, cinturones dobles en cada zona y ocho supercolumnas compuestas (acero y hormigón) atadas al núcleo por los brazos: AISC (Modern Steel Construction, abril 2013) y ENR. Acá los brazos son de un piso de alto (un nivel de la app, 13,2 m) y van en las ocho juntas (supuesto: las fuentes no dicen en cuántas).',
        'Planta cuadrada de 55 m (supuesto: la torre real es redondeada y se angosta con la altura). Un nivel de la app cada 13,2 m (unos 2,7 pisos reales; la planilla admite 49 niveles).',
        'Supercolumnas pareadas a media cara, alineadas con los brazos: cada brazo toma la suya (sin el reparto del cinturón, que en la obra lleva sobre todo el peso de cada zona). Son compuestas (acero y hormigón) y cada una lleva unas 24 000 t: un tubo de acero no alcanza. Acá son cajones de acero equivalentes por tramos: 4,0 m × 250 mm hasta 211 m, 3,5 m × 200 mm hasta 421 m y 2,5 m × 150 mm arriba (supuestos). Por eso el «acero» que informa la app (unas 107 000 t) no es el de la obra: la mayor parte son las supercolumnas, que en la realidad son sobre todo hormigón.',
        'Brazos dimensionados con la app (diagonales de 1,20 m × 60 mm; los cordones quedan en el tubo más chico porque el brazo de 13,2 m de alto los descarga). Flecha de la azotea unos h/650 con el viento de la planilla; sin los brazos, h/210.',
        'Las losas apoyan en el perímetro: la mitad de cada losa (franja de 6,25 m), con 0,5 t/m² de peso y 0,25 t/m² de sobrecarga (supuesto); la otra mitad, en el núcleo. Los brazos se conectan al terminar la obra gruesa.',
        'Viento: CIRSOC 102 con V = 42 m/s y exposición de centro de ciudad (supuesto: del orden de la presión básica de 0,55 kPa de Shanghái pasada a ráfaga; hay tifones).',
      ],
    },
  };
}
