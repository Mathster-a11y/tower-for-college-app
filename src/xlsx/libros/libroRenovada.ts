/**
 * «Planilla renovada» (plan de trabajo, etapa 5b): el método CIRSOC como una calculadora cerrada, con el mismo
 * funcionamiento que la planilla de la guía (la app escribe solo «Datos»; todo lo demás son fórmulas):
 *
 *   Léame · Datos · Tablas · 1 Viento 102-25 · 2 Cargas y vuelco · 3 Secciones · 4 Reparto por caso ·
 *   5 Solicitaciones · 6 Hormigón 201 · 7 Diagramas N-M (completa) · 8 Deriva · Resumen
 *
 * Viento CIRSOC 102-25 (frecuencia, G o Gf, carga mínima, cuatro casos con torsión), cargas y combinaciones del 101-25,
 * reparto de la guía por caso de carga y verificación del CIRSOC 201-2005, simple (método empírico, cordones) o completa
 * (diagrama de interacción de cada muro con la cuantía adoptada, que la app precarga con la necesaria, y con la mínima).
 * Cada cuenta es la de la app (cargas/cirsoc102.ts, metodos/cirsoc.ts, verificacion/cirsoc201.ts): las pruebas lo comparan.
 */
import { hojaRef, LibroK, rc, type Estilo, type HojaK } from '../kit/libro';
import { datosGuia, type DatosGuia } from '../../engine/metodos/guiaPasos';
import type { PiezaEquivalente } from '../../engine/mapping';
import { CIUDADES, EXPOSICIONES, FACTOR_SERVICIO, KN_POR_T, KD_EDIFICIOS, datos102De, type DatosCirsoc102 } from '../../engine/cargas/cirsoc102';
import { combinaciones, datos101De, SOBRECARGA_DESTINO, type DatosCirsoc101 } from '../../engine/cargas/cirsoc101';
import { CLASES_EXPOSICION, datos201De, type DatosCirsoc201, type VerifPieza201 } from '../../engine/metodos/cirsoc';
import { DIVISORES } from '../../engine/planilla';
import { tablasProyecto } from '../proyectoTablas';
import type { Proyecto } from '../../engine/modelo';
import { coef, dato, escribirGeometria, hojaSecciones, num, res, VER } from './comun';

export const HR = {
  leame: 'Léame', datos: 'Datos', tablas: 'Tablas', viento: '1 Viento 102-25', cargas: '2 Cargas y vuelco', secciones: '3 Secciones',
  reparto: '4 Reparto por caso', solic: '5 Solicitaciones', h201: '6 Hormigón 201', diag: '7 Diagramas N-M', deriva: '8 Deriva', resumen: 'Resumen',
};
export type Claves = Record<string, { hoja: string; ref: string }>;
export interface DatosRenovada {
  geo: DatosGuia;
  c102: Required<DatosCirsoc102>; c101: Required<DatosCirsoc101>; c201: Required<DatosCirsoc201>;
  nivel: 'simple' | 'completa';
  /** cuantía vertical adoptada de cada parte (completa): clave «dir|pieza|muro|n», la necesaria que calculó la app */
  rhoAdoptada: Map<string, number>;
}
const NB = 40;          // barras repartidas a lo largo del tabique (como la app)
const NC = 120;         // posiciones del eje neutro en el diagrama

export function libroRenovada(R: DatosRenovada, p?: Proyecto): { libro: LibroK; claves: Claves } {
  const d = R.geo, completa = R.nivel === 'completa';
  const L = new LibroK();
  L.titulo = `Planilla renovada (CIRSOC) · ${d.nombre}`;
  const claves: Claves = {};
  const clave = (k: string, hoja: HojaK, ref: string) => { claves[k] = { hoja: hoja.nombre, ref }; };
  const N = d.niveles.length, NR = d.rects.length;
  const iPB = d.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const nombrar = (n: string, h: HojaK, ref: string) => L.nombrar(n, h.nombre, ref);

  // ============================================================================================ Léame
  const le = L.hoja(HR.leame, [3, 112]);
  le.put(1, 1, 'Planilla renovada: el procedimiento del CIRSOC', 'titulo');
  const lineas: [string, string][] = [
    ['', `Proyecto: ${d.nombre}. Hecha con Torre 3D, método «CIRSOC», verificación ${R.nivel}.`],
    ['', 'Funciona como la planilla de la cátedra, pero con los reglamentos vigentes: viento CIRSOC 102-25, cargas y combinaciones CIRSOC 101-25 y hormigón CIRSOC 201-2005 (por resistencia). Es una calculadora: funciona sola, sin la app.'],
    ['', 'Los datos se escriben UNA sola vez, en la hoja «Datos». Todas las demás celdas son fórmulas. Si cambiás un dato, todo se recalcula (también los gráficos).'],
    ['s', 'Colores'],
    ['dato', 'Celda blanca con borde azul: dato del proyecto (incluida la cuantía adoptada de cada muro, en la hoja 6).'],
    ['coef', 'Celda amarilla: tabla o coeficiente del reglamento (hoja «Tablas»).'],
    ['calc', 'Celda gris: fórmula.'],
    ['res', 'Celda verde: resultado de un paso.'],
    ['s', 'Hojas'],
    ['', '1 Viento 102-25: V de la ciudad y la categoría de riesgo, Kz (exposición B, C o D), qz, frecuencia n1 (fórmula 1.9-5 de los tabiques), G = 0,85 si n1 ≥ 1 Hz o Gf (flexible), Cp de sotavento según L/B, fuerza de cada nivel, carga mínima (0,75 kN/m²), los cuatro casos de carga y el viento de servicio.'],
    ['', '2 Cargas y vuelco: D y L (101-25), combinaciones y vuelco con 0,9 D + 1,0 W.'],
    ['', '3 Secciones: el J de cada pieza con sus rectángulos (como la guía) y el eje de inercia.'],
    ['', '4 Reparto por caso: lo que toma cada pieza en los cuatro casos de la Fig. 2.4-8 (traslación y rotación de la guía, con la torsión de cada caso).'],
    ['', '5 Solicitaciones: Nu, Mu y Vu de cada muro en cada combinación, caso de viento y sentido.'],
    ['', `6 Hormigón 201: corte en el plano (11.10), cuantías mínimas (14.3) y ${completa ? 'flexocompresión con el diagrama de interacción (hoja 7), con la cuantía mínima y con la adoptada' : 'compresión con el método empírico (14.5) y flexión con dos cordones de borde'}.`],
    ...(completa ? [['', '7 Diagramas N-M: el diagrama de interacción φPn–φMn de cada muro (eje neutro en 120 posiciones, 40 barras repartidas, bloque de tensiones, φ de 0,65 a 0,90), con la cuantía mínima y con la adoptada.'] as [string, string]] : []),
    ['', '8 Deriva: la torre como ménsula con el viento de servicio; azotea y cada piso contra h / límite.'],
    ['', 'Resumen: todos los controles.'],
    ['s', 'Convenciones'],
    ['', 'Unidades: m, t (1 t = 9,80665 kN, exacto), t/m²; presiones en N/m²; el 201 adentro en N y mm. Nu + compresión.'],
    ['', 'Las hojas «T3D» (ocultas) guardan el proyecto completo para volver a abrirlo en Torre 3D.'],
  ];
  lineas.forEach(([t, x], i) => { if (t === 's') le.seccion(3 + i, x, 2); else { le.put(1, 3 + i, null, t === '' ? 'vacio' : (t as 'dato')); le.put(2, 3 + i, x, { papel: 'texto', ajustar: true }); le.altos.set(3 + i, x.length > 120 ? 27 : 15); } });

  // ============================================================================================ Tablas
  const ta = L.hoja(HR.tablas, [26, 9, 9, 9, 3, 12, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 3, 12, 9, 3, 12, 9, 3, 18, 9, 9, 3, 10, 10]);
  ta.encabezado('Tablas del reglamento', 'Las que usan las hojas de cálculo. Están en amarillo: son del reglamento y no hace falta tocarlas.', 28);
  ta.put(1, 3, 'Fig. 1.5-1D: V (m/s) por ciudad y categoría de riesgo', 'subtitulo');
  ta.cabecera(4, 1, ['Ciudad', 'I', 'II', 'III-IV']);
  const ciudades = Object.entries(CIUDADES);
  ciudades.forEach(([c, v], i) => { ta.put(1, 5 + i, c, 'textoB'); v.forEach((x, j) => ta.put(2 + j, 5 + i, x, coef('0.0'))); });
  const fc1 = 5 + ciudades.length - 1;
  nombrar('tCiudad', ta, `A5:A${fc1}`); nombrar('tV', ta, `B5:D${fc1}`); nombrar('tCat', ta, 'B4:D4');
  ta.put(6, 3, 'Tabla 1.9-1: exposición', 'subtitulo');
  ta.cabecera(4, 6, ['Exposición', 'α', 'zg (m)', 'â', 'b̂', 'ā', 'b̄', 'c', 'ℓ (m)', 'ε̄', 'zmín (m)']);
  (['B', 'C', 'D'] as const).forEach((e, i) => { const x = EXPOSICIONES[e]; ta.put(6, 5 + i, e, 'textoB'); [x.alfa, x.zg, x.aHat, x.bHat, x.aBar, x.bBar, x.c, x.l, x.eBar, x.zmin].forEach((v, j) => ta.put(7 + j, 5 + i, v, coef('0.0000'))); });
  nombrar('tExp', ta, 'F5:F7'); nombrar('tExpV', ta, 'G5:P7');
  ta.put(18, 3, 'Servicio (C AB.4.2)', 'subtitulo');
  ta.cabecera(4, 18, ['Recurrencia (años)', 'Factor de V50']);
  Object.entries(FACTOR_SERVICIO).forEach(([a, f], i) => { ta.put(18, 5 + i, Number(a), coef('0')); ta.put(19, 5 + i, f, coef('0.00')); });
  const nRec = Object.keys(FACTOR_SERVICIO).length;
  nombrar('tRec', ta, `R5:R${4 + nRec}`); nombrar('tFac', ta, `S5:S${4 + nRec}`);
  ta.put(21, 3, 'Tabla 4.1 (101-25)', 'subtitulo');
  ta.cabecera(4, 21, ['Destino', 'L (kN/m²)']);
  Object.entries(SOBRECARGA_DESTINO).forEach(([k, v], i) => { ta.put(21, 5 + i, k, 'textoB'); ta.put(22, 5 + i, v, coef('0.00')); });
  nombrar('tDest', ta, 'U5:U6'); nombrar('tL', ta, 'V5:V6');
  ta.put(24, 3, '200-24, Tabla 8.3: Ref de tabiques in situ (mm)', 'subtitulo');
  ta.cabecera(4, 24, ['Tabique', '50 años', '100 años']);
  ta.put(24, 5, 'interior', 'textoB'); ta.put(25, 5, 20, coef('0')); ta.put(26, 5, 25, coef('0'));
  ta.put(24, 6, 'exterior', 'textoB'); ta.put(25, 6, 30, coef('0')); ta.put(26, 6, 35, coef('0'));
  ta.put(24, 8, 'Δr con control (mm)', 'textoB'); const rCon = ta.put(25, 8, 5, coef('0')); ta.put(24, 9, 'Δr sin control (mm)', 'textoB'); const rSin = ta.put(25, 9, 10, coef('0'));
  nombrar('tRecTipo', ta, 'X5:X6'); nombrar('tRef', ta, 'Y5:Z6'); nombrar('dRcon', ta, rCon); nombrar('dRsin', ta, rSin);
  ta.put(28, 3, "200-24, Tabla 2.5: f'c mínimo", 'subtitulo');
  ta.cabecera(4, 28, ['Clase', "f'c mín (MPa)"]);
  Object.entries(CLASES_EXPOSICION).forEach(([k, v], i) => { ta.put(28, 5 + i, k, 'textoB'); ta.put(29, 5 + i, v.fcMin, coef('0')); });
  const nCl = Object.keys(CLASES_EXPOSICION).length;
  nombrar('tClase', ta, `AB5:AB${4 + nCl}`); nombrar('tFcMin', ta, `AC5:AC${4 + nCl}`);
  // combinaciones
  const rCo = fc1 + 3;
  ta.put(1, rCo - 1, 'Combinaciones por resistencia (101-25 art. 2.3.2, con el viento de resistencia del 102-25)', 'subtitulo');
  ta.cabecera(rCo, 1, ['Combinación', 'D', 'L', 'W']);
  const combos = combinaciones();
  combos.forEach((c, i) => { ta.put(1, rCo + 1 + i, c.nombre, 'textoB'); ta.put(2, rCo + 1 + i, c.D, coef('0.0')); ta.put(3, rCo + 1 + i, c.L, coef('0.0')); ta.put(4, rCo + 1 + i, c.W, coef('0.0')); });
  const comboRef = (i: number, c: number) => `${hojaRef(HR.tablas)}${rc(c, rCo + 1 + i)}`;
  // constantes
  const rK = rCo + combos.length + 3;
  ta.put(1, rK - 1, 'Constantes', 'subtitulo');
  const constantes: [string, number, string, string][] = [
    ['1 t en kN', KN_POR_T, 'kNt', 'exacto'], ['1 t en N', KN_POR_T * 1000, 'Nt', ''], ['Kd (edificios, Tabla 1.6-1)', KD_EDIFICIOS, 'Kd', ''], ['Cp de barlovento', 0.8, 'Cpb', ''],
    ['fy del acero ADN 420 (MPa)', 420, 'fy', ''], ['Es (MPa)', 200000, 'Es', ''], ['εcu del hormigón', 0.003, 'ecu', ''], ['φ al corte', 0.75, 'phiV', ''],
  ];
  constantes.forEach(([t, v, n], i) => { ta.put(1, rK + i, t, 'textoB'); const ref = ta.put(2, rK + i, v, coef('0.00000')); nombrar(n, ta, ref); });
  const rDiv = rK + constantes.length + 2;
  ta.put(1, rDiv - 1, 'E del hormigón (el de la cátedra: divisor h/500 · 500 / 8)', 'subtitulo');
  ta.cabecera(rDiv, 1, ['Hormigón', 'Divisor', 'Desde f\'c']);
  DIVISORES.forEach(([h, , b], i) => { ta.put(1, rDiv + 1 + i, h, 'textoB'); ta.put(2, rDiv + 1 + i, b, coef('0')); ta.put(3, rDiv + 1 + i, parseFloat(h.slice(1)), coef('0')); });
  const rb = rDiv + 6;
  ta.put(1, rb, 'k de cada barra (0 a 39)', 'subtitulo');
  for (let k = 0; k < NB; k++) ta.put(2 + k, rb, k, coef('0'));
  nombrar('barK', ta, `B${rb}:${rc(1 + NB, rb)}`);
  const divRef = (i: number, c: number) => `${hojaRef(HR.tablas)}${rc(c, rDiv + 1 + i)}`;

  // ============================================================================================ Datos
  const da = L.hoja(HR.datos, [36, 16, 16, 16, 14, 13, 13, 12, 12, 12, 12, 13, 13, 11]);
  da.encabezado('Datos del proyecto', 'Lo único que se escribe a mano (celdas blancas). Las tablas del reglamento están en la hoja «Tablas». Todas las hojas leen de acá: un dato se escribe una sola vez.', 14);
  da.fijar = { fila: 3, col: 1 };
  const filaD = (r: number, rot: string, v: number | string | null, nombre: string, unidad: string, nota: string, e: Estilo, lista?: string[]) => {
    da.put(1, r, rot, 'textoB'); const ref = da.put(2, r, v, e); da.put(3, r, unidad, 'unidad'); da.put(4, r, nota, 'nota');
    nombrar(nombre, da, ref); if (lista) da.listas.push({ rango: ref, opciones: lista });
  };
  const c2 = R.c102, c1 = R.c101, c3 = R.c201;
  da.seccion(4, 'Proyecto', 14);
  da.put(1, 5, 'Nombre', 'textoB'); da.put(2, 5, d.nombre, dato());
  filaD(6, "Hormigón: f'c (MPa)", parseFloat(d.hormigon.replace(/[^\d.]/g, '')) || 30, 'fc', 'MPa', 'H30 → 30', dato('0'), ['20', '25', '30', '35', '40', '45', '50']);
  da.put(1, 7, 'Verificación del hormigón', 'textoB'); da.put(2, 7, R.nivel, { papel: 'texto' }); da.put(4, 7, 'se elige al exportar desde la app', 'nota');
  da.seccion(9, 'Viento (CIRSOC 102-25)', 14);
  filaD(10, 'Ciudad (Fig. 1.5-1D)', c2.ciudad ?? '', 'ciudad', '', 'de la tabla de la hoja «Tablas»', dato(), ciudades.map(x => x[0]));
  filaD(11, 'V a mano (vacío = la de la ciudad)', c2.Vmanual ?? null, 'Vmano', 'm/s', '', dato('0.0'));
  filaD(12, 'Categoría de riesgo', c2.categoria, 'categoria', '', 'I, II o III-IV (vivienda y oficinas: II)', dato(), ['I', 'II', 'III-IV']);
  filaD(13, 'Exposición', c2.exposicion, 'exposicion', '', 'B: urbana · C: abierta · D: costa', dato(), ['B', 'C', 'D']);
  filaD(14, 'Kzt: factor topográfico', c2.Kzt, 'KztDato', '', 'terreno llano: 1', dato('0.00'));
  filaD(15, 'Altitud del terreno', c2.altitud, 'altitud', 'm', 'sobre el nivel del mar (Ke)', dato('0'));
  filaD(16, 'Frecuencia', c2.frecuencia, 'frecMetodo', '', 'tabiques (1.9-5), otros (1.9-4) o manual (n1 de un análisis)', dato(), ['tabiques', 'otros', 'manual']);
  filaD(17, 'n1 a mano (si «manual»)', c2.n1manual ?? null, 'nManual', 'Hz', '', dato('0.000'));
  filaD(18, 'β: amortiguamiento', c2.beta, 'beta', '', 'hormigón: 0,02', dato('0.000'));
  filaD(19, 'Recurrencia del viento de servicio', c2.recurrenciaServicio, 'recurrencia', 'años', '5, 10, 25, 50, 100, 200 o 500', dato('0'), Object.keys(FACTOR_SERVICIO));
  filaD(20, 'Parapeto sobre la azotea', d.viento.parapeto, 'parap', 'm', '', dato('0.00'));
  da.seccion(22, 'Cargas (CIRSOC 101-25)', 14);
  filaD(23, 'D: carga permanente de la losa', c1.D, 'Dlosa', 't/m²', 'el peso propio de los tabiques va aparte (2,4 t/m³)', dato('0.000'));
  filaD(24, 'Destino (Tabla 4.1)', c1.destino, 'destino', '', 'vivienda, oficinas u otro', dato(), ['vivienda', 'oficinas', 'otro']);
  filaD(25, 'L a mano (si «otro»)', c1.Lmanual ?? null, 'Lmano', 'kN/m²', '', dato('0.00'));
  filaD(26, 'γ del hormigón armado', d.coef.gH, 'gamaH', 't/m³', '', coef('0.0'));
  da.seccion(28, 'Hormigón (CIRSOC 201-2005)', 14);
  filaD(29, 'Tabique (200-24, Tabla 8.3)', c3.recubrimiento, 'recTipo', '', 'interior: no expuesto · exterior: al aire libre o contra el suelo', dato(), ['interior', 'exterior']);
  filaD(30, 'Clase de exposición (200-24, Tabla 2.1 y 2.2)', c3.exposicion, 'expHorm', '', "A1, A2, A3, CL1, CL2, M1, M2, M3, C1, C2, Q1, Q2 o Q3: fija el f'c mínimo", dato(), Object.keys(CLASES_EXPOSICION));
  filaD(31, 'Vida útil prevista', c3.vidaUtil, 'vidaUtil', 'años', '50 o 100', dato('0'), ['50', '100']);
  filaD(32, 'Control de ejecución', c3.control, 'controlEj', '', 'con (Δr = 5 mm) o sin (Δr = 10 mm)', dato(), ['con', 'sin']);
  filaD(33, 'Recubrimiento a mano (vacío = la tabla)', c3.recManual ?? null, 'recMano', 'mm', '', dato('0'));
  filaD(34, 'Límite de deriva: h / …', c3.limiteDeriva, 'limDeriva', '', '400, 500 (como la guía) o 600', dato('0'), ['400', '500', '600']);
  da.seccion(36, 'Fundación (platea)', 14);
  filaD(37, 'b1: lado paralelo al viento A', d.fund.b1, 'lado_b1', 'm', '', dato('0.00'));
  filaD(38, 'a1: lado perpendicular al viento A', d.fund.a1, 'lado_a1', 'm', '', dato('0.00'));
  const geo = escribirGeometria(L, da, d, 40);

  // ============================================================================================ 1 Viento 102-25
  const vi = L.hoja(HR.viento, [34, 12, 12, 9, 7, 7, 8, 8, 8, 10, 10, 10, 10, 10, 11, 10, 10, 10, 10, 11, 10]);
  vi.encabezado('Paso 1 · Viento según CIRSOC 102-25 (procedimiento direccional, capítulo 2)', 'Kz = 2,41·(z/zg)^(2/α) con z ≥ 5 m (Tabla 1.13-1) · qz = 0,613·Kz·Kzt·Kd·Ke·V² [N/m²] (1.13-1) · presión neta = qz·G·0,8 − qh·G·Cp sotavento (la presión interna se anula) · fuerza = presión × ancho × altura de influencia. La frecuencia decide G: 0,85 si n1 ≥ 1 Hz (rígido) o Gf (flexible, 1.9-10).', 21);
  const VI = hojaRef(HR.viento);
  const fP = (r: number, rot: string, form: string, e: Estilo, u: string, nombre: string | null, nota = '') => {
    vi.put(1, r, rot, 'textoB'); const ref = vi.f(2, r, form, e); vi.put(3, r, u, 'unidad'); if (nota) vi.put(4, r, nota, 'nota');
    if (nombre) { nombrar(nombre, vi, ref); clave(nombre, vi, ref); }
    return ref;
  };
  vi.seccion(4, 'Velocidad y factores', 21);
  fP(5, 'V: velocidad básica', 'IF(Vmano>0,Vmano,IFERROR(INDEX(tV,MATCH(ciudad,tCiudad,0),MATCH(categoria,tCat,0)),INDEX(tV,MATCH("Mar del Plata",tCiudad,0),2)))', res('0.0'), 'm/s', 'V', 'la de la ciudad y la categoría (o la escrita a mano)');
  fP(6, 'V50 = V de la categoría II / √1,5', 'IFERROR(INDEX(tV,MATCH(ciudad,tCiudad,0),2),V)/SQRT(1.5)', num('0.00'), 'm/s', 'V_50', 'la del 102-2005 (para el viento de servicio)');
  fP(7, 'Ke = e^(−0,000119 · altitud)', 'EXP(-0.000119*MAX(0,altitud))', num('0.0000'), '', 'Ke', 'Tabla 1.12-1');
  fP(8, 'Kzt', 'IF(KztDato>0,KztDato,1)', num('0.00'), '', 'Kzt', '');
  const fila = 'MATCH(exposicion,tExp,0)';
  ['alfaE', 'zgE', 'aHatE', 'bHatE', 'aBarE', 'bBarE', 'cE', 'lE', 'eBarE', 'zminE'].forEach((n, j) => fP(9 + j, ['α', 'zg', 'â', 'b̂', 'ā', 'b̄', 'c', 'ℓ', 'ε̄', 'zmín'][j] + ' (exposición)', `INDEX(tExpV,${fila},${j + 1})`, num('0.0000'), '', n));
  // tabla de niveles
  const rT = 21;
  vi.seccion(rT, 'Nivel por nivel (z: altura sobre PB)', 21);
  vi.cabecera(rT + 1, 1, ['Nivel', 'Cota (m)', 'B (m)', 'L (m)', '¿Sobre PB?', 'z (m)', 'Altura de influencia (m)', 'Kz', 'qz (N/m²)', 'Viento A: presión neta (N/m²)', 'W A sin mínimo (t)', 'W A (t)', 'Q A, debajo del nivel (t)', 'M A en el nivel (tm)', 'Viento B: presión neta (N/m²)', 'W B sin mínimo (t)', 'W B (t)', 'Q B (t)', 'M B (tm)', 'auxiliar: cota ≥ 0', 'auxiliar: cota > PB']);
  const rv = (i: number) => rT + 2 + i, rv0 = rv(0), rv1 = rv(N - 1);
  for (let i = 0; i < N; i++) {
    const r = rv(i), a = r - 1;
    vi.f(1, r, geo.nivDato(1, i), { papel: 'calc' }); vi.f(2, r, geo.nivDato(2, i), num('0.00')); vi.f(3, r, geo.nivDato(3, i), num('0.00')); vi.f(4, r, geo.nivDato(4, i), num('0.00'));
    vi.f(5, r, `IF(B${r}>zPB,1,0)`, num('0'));
    vi.f(6, r, `B${r}-zPB`, num('0.00'));
    vi.f(7, r, i === N - 1 ? '0' : i === 0 ? `IF(E${r}=1,(B${r}-B${r + 1})/2+parap,0)` : `IF(E${r}=1,(B${a}-B${r + 1})/2,0)`, num('0.000'));
    vi.f(8, r, `IF(E${r}=1,2.41*POWER(MIN(MAX(F${r},5),zgE)/zgE,2/alfaE),0)`, num('0.0000'));
    vi.f(9, r, `IF(E${r}=1,0.613*H${r}*Kzt*Kd*Ke*V^2,0)`, num('0.00'));
    for (const [c0, dir, ancho] of [[10, 'A', 'C'], [15, 'B', 'D']] as const) {
      const cp = (k: number) => rc(c0 + k, r), cpa = (k: number) => rc(c0 + k, a);
      vi.f(c0, r, `IF(E${r}=1,I${r}*G_${dir}*Cpb-qh*G_${dir}*Cps_${dir},0)`, num('0.00'));
      vi.f(c0 + 1, r, `${cp(0)}*${ancho}${r}*G${r}/1000/kNt`, num('0.000'));
      vi.f(c0 + 2, r, `${cp(1)}*fmin_${dir}`, res('0.000'));
      vi.f(c0 + 3, r, i === 0 ? `${cp(2)}` : `IF(E${r}=1,${cpa(3)}+${cp(2)},0)`, num('0.00'));
      vi.f(c0 + 4, r, i === 0 ? '0' : `IF(E${r}=1,${cpa(4)}+${cpa(3)}*(F${a}-F${r}),0)`, res('0.0'));
      clave(`W_${dir}_${i}`, vi, cp(2)); clave(`Q_${dir}_${i}`, vi, cp(3)); clave(`M_${dir}_${i}`, vi, cp(4));
    }
    vi.f(20, r, `IF(B${r}>=0,B${r},1E+9)`, num('0.00'));
    vi.f(21, r, `IF(B${r}>zPB,B${r},1E+9)`, num('0.00'));
  }
  const col = (c: number) => `${rc(c, rv0)}:${rc(c, rv1)}`;
  nombrar('v_cota', vi, col(2)); nombrar('v_B', vi, col(3)); nombrar('v_L', vi, col(4)); nombrar('v_sobre', vi, col(5)); nombrar('v_z', vi, col(6)); nombrar('v_hInf', vi, col(7));
  nombrar('v_WA', vi, col(11)); nombrar('v_QA', vi, col(13)); nombrar('v_MA', vi, col(14)); nombrar('v_WB', vi, col(16)); nombrar('v_QB', vi, col(18)); nombrar('v_MB', vi, col(19));
  // cotas, alturas y planta
  const rz = rv1 + 2;
  vi.seccion(rz, 'Cotas y planta de PB', 21);
  fP(rz + 1, 'zTop: cota de la azotea', `MAX(${col(2)})`, num('0.00'), 'm', 'zTop');
  fP(rz + 2, 'zPB: cota de PB (la menor que no es negativa)', `MIN(${col(20)})`, num('0.00'), 'm', 'zPB');
  fP(rz + 3, 'zFund: cota de la fundación', `MIN(${col(2)})`, num('0.00'), 'm', 'zFund');
  fP(rz + 4, 'h: altura media de la cubierta sobre PB', 'zTop-zPB', res('0.00'), 'm', 'h_PB');
  fP(rz + 5, 'Cota del primer nivel sobre PB', `MIN(${col(21)})`, num('0.00'), 'm', 'zArriba');
  fP(rz + 6, 'B en PB', 'SUMPRODUCT((v_cota=zPB)*v_B)', num('0.00'), 'm', 'B_PB');
  fP(rz + 7, 'L en PB', 'SUMPRODUCT((v_cota=zPB)*v_L)', num('0.00'), 'm', 'L_PB');
  fP(rz + 8, 'Kh = Kz en h; qh', '2.41*POWER(MIN(MAX(h_PB,5),zgE)/zgE,2/alfaE)', num('0.0000'), '', 'Kh');
  fP(rz + 9, 'qh = 0,613·Kh·Kzt·Kd·Ke·V²', '0.613*Kh*Kzt*Kd*Ke*V^2', res('0.00'), 'N/m²', 'qh');
  fP(rz + 10, 'q a 5 m (para la franja de PB)', '0.613*2.41*POWER(5/zgE,2/alfaE)*Kzt*Kd*Ke*V^2', num('0.00'), 'N/m²', 'q_5m');
  // frecuencia: rectángulos paralelos a cada viento (1.9-5)
  const rF = rz + 12;
  vi.seccion(rF, 'Frecuencia de los tabiques (1.9-5): Cw = 100 / AB · Σ (h / hi)² · Ai / (1 + 0,83 · (hi / Di)²)', 21);
  vi.cabecera(rF + 1, 1, ['Muro', 'hi (m)', 'Ai (m²)', '¿Paralelo a A?', 'Di en A (m)', 'Término A', '¿Paralelo a B?', 'Di en B (m)', 'Término B']);
  const rf0 = rF + 2, rf1 = rf0 + Math.max(NR, 1) - 1;
  for (let k = 0; k < NR; k++) {
    const r = rf0 + k, m = (c: number) => geo.muroDato(c, k);
    vi.f(1, r, m(1), { papel: 'calc' });
    vi.f(2, r, `MAX(0.01,SUMPRODUCT((m_muro=A${r})*m_top)-zPB)`, num('0.00'));
    vi.f(3, r, `IF(${m(9)}="",${m(6)}*${m(7)},${m(9)})`, num('0.0000'));
    vi.f(4, r, `IF(AND(${m(8)}<>1,${m(7)}>${m(6)}),1,0)`, num('0'));
    vi.f(5, r, m(7), num('0.000'));
    vi.f(6, r, `D${r}*(h_PB/B${r})^2*C${r}/(1+0.83*(B${r}/E${r})^2)`, num('0.0000'));
    vi.f(7, r, `IF(AND(${m(8)}<>1,${m(6)}>${m(7)}),1,0)`, num('0'));
    vi.f(8, r, m(6), num('0.000'));
    vi.f(9, r, `G${r}*(h_PB/B${r})^2*C${r}/(1+0.83*(B${r}/H${r})^2)`, num('0.0000'));
  }
  // cada viento: frecuencia, G, Cp, fuerzas y carga mínima
  const rD = rf1 + 2;
  vi.seccion(rD, 'Cada viento: frecuencia, ráfaga, Cp de sotavento, carga mínima y fuerzas en PB', 21);
  vi.cabecera(rD + 1, 1, ['', 'Viento A', 'Viento B', 'Unidad']);
  const filasDir: [string, string, string, Estilo['fmt'], string][] = [
    // [rótulo, fórmula con {d} = dirección, {B} = ancho, {L} = largo, formato, unidad]
    ['Ancho que recibe el viento (B)', '{B}', 'nombre:Bd', '0.00', 'm'],
    ['Largo en el sentido del viento (L)', '{L}', 'nombre:Ld', '0.00', 'm'],
    ['Cp de sotavento (Fig. 2.4-1, según L/B)', 'IF(IF(Bd_{d}>0,Ld_{d}/Bd_{d},1)<=1,-0.5,IF(IF(Bd_{d}>0,Ld_{d}/Bd_{d},1)<=2,-0.5+(Ld_{d}/Bd_{d}-1)*0.2,IF(Ld_{d}/Bd_{d}<=4,-0.3+(Ld_{d}/Bd_{d}-2)/2*0.1,-0.2)))', 'nombre:Cps', '0.000', ''],
    ['Lef = Σ hi·Li / Σ hi (1.9-1)', 'SUMPRODUCT(v_sobre*v_z*{Lcol})/SUMPRODUCT(v_sobre*v_z)', 'nombre:Lef', '0.00', 'm'],
    ['¿Vale la fórmula aproximada? (h < 90 m y h < 4·Lef)', 'IF(AND(h_PB<90,h_PB<4*Lef_{d}),"SÍ","NO: hace falta un análisis")', 'nombre:', 'g', ''],
    ['Cw', '100/(B_PB*L_PB)*SUM({term})', 'nombre:Cw', '0.000', ''],
    ['na = 117,3·√Cw / h (1.9-5)', '117.3*SQRT(Cw_{d})/h_PB', 'nombre:na', '0.000', 'Hz'],
    ['n1 usada', 'IF(AND(frecMetodo="manual",nManual>0),nManual,IF(frecMetodo="otros",22.86/h_PB,na_{d}))', 'nombre:frec', '0.000', 'Hz'],
    ['z̄ = máx(0,6 h; zmín)', 'MAX(0.6*h_PB,zminE)', 'nombre:zBar', '0.00', 'm'],
    ['Iz = c·(10/z̄)^(1/6) (1.9-7)', 'cE*(10/zBar_{d})^(1/6)', 'nombre:Iz', '0.0000', ''],
    ['Lz = ℓ·(z̄/10)^ε̄ (1.9-9)', 'lE*(zBar_{d}/10)^eBarE', 'nombre:Lz', '0.00', 'm'],
    ['Q (1.9-8)', 'SQRT(1/(1+0.63*((Bd_{d}+h_PB)/Lz_{d})^0.63))', 'nombre:Qr', '0.0000', ''],
    ['V z̄ = b̄·(z̄/10)^ā·V (1.9-16)', 'bBarE*(zBar_{d}/10)^aBarE*V', 'nombre:Vz', '0.00', 'm/s'],
    ['N1 = n1·Lz / V z̄ (1.9-14)', 'frec_{d}*Lz_{d}/Vz_{d}', 'nombre:Nred', '0.0000', ''],
    ['Rn (1.9-13)', '7.47*Nred_{d}/(1+10.3*Nred_{d})^(5/3)', 'nombre:Rn', '0.0000', ''],
    ['Rh (1.9-15a, η = 4,6 n1 h / V z̄)', 'IF(4.6*frec_{d}*h_PB/Vz_{d}>0,1/(4.6*frec_{d}*h_PB/Vz_{d})-(1-EXP(-2*4.6*frec_{d}*h_PB/Vz_{d}))/(2*(4.6*frec_{d}*h_PB/Vz_{d})^2),1)', 'nombre:Rh', '0.0000', ''],
    ['RB (η = 4,6 n1 B / V z̄)', 'IF(4.6*frec_{d}*Bd_{d}/Vz_{d}>0,1/(4.6*frec_{d}*Bd_{d}/Vz_{d})-(1-EXP(-2*4.6*frec_{d}*Bd_{d}/Vz_{d}))/(2*(4.6*frec_{d}*Bd_{d}/Vz_{d})^2),1)', 'nombre:RB', '0.0000', ''],
    ['RL (η = 15,4 n1 L / V z̄)', 'IF(15.4*frec_{d}*Ld_{d}/Vz_{d}>0,1/(15.4*frec_{d}*Ld_{d}/Vz_{d})-(1-EXP(-2*15.4*frec_{d}*Ld_{d}/Vz_{d}))/(2*(15.4*frec_{d}*Ld_{d}/Vz_{d})^2),1)', 'nombre:RL', '0.0000', ''],
    ['R (1.9-12)', 'SQRT(1/beta*Rn_{d}*Rh_{d}*RB_{d}*(0.53+0.47*RL_{d}))', 'nombre:Rr', '0.0000', ''],
    ['gR (1.9-11)', 'SQRT(2*LN(3600*frec_{d}))+0.577/SQRT(2*LN(3600*frec_{d}))', 'nombre:gR', '0.0000', ''],
    ['Gf (1.9-10)', '0.925*((1+1.7*Iz_{d}*SQRT(3.4^2*Qr_{d}^2+gR_{d}^2*Rr_{d}^2))/(1+1.7*3.4*Iz_{d}))', 'nombre:Gf', '0.0000', ''],
    ['G usado: 0,85 si n1 ≥ 1 Hz (rígido); si no, Gf', 'IF(frec_{d}>=1,0.85,Gf_{d})', 'nombre:G', '0.0000', ''],
    ['W sin la mínima', 'SUM({Wcol})', 'nombre:Wsin', '0.00', 't'],
    ['Área de pared expuesta', 'SUMPRODUCT(v_sobre*{anchoCol}*v_hInf)', 'nombre:Apared', '0.00', 'm²'],
    ['W mínima = 0,75 kN/m² · área (2.1.5)', '0.75*Apared_{d}/kNt', 'nombre:Wmin', '0.00', 't'],
    ['Factor por la mínima', 'IF(AND(Wsin_{d}<Wmin_{d},Wsin_{d}>0),Wmin_{d}/Wsin_{d},1)', 'nombre:fmin', '0.0000', ''],
    ['W total', 'MAX(Wsin_{d},Wmin_{d})', 'nombre:Wtot', '0.00', 't'],
    ['Q en PB', 'SUMPRODUCT((v_cota=zArriba)*{Qcol})', 'nombre:QPB', '0.00', 't'],
    ['M en PB', 'SUMPRODUCT((v_cota=zArriba)*({Mcol}+{Qcol}*v_z))', 'nombre:MPB', '0.0', 'tm'],
    ['Franja de PB (presión a 5 m, de PB a medio entrepiso)', '(q_5m*G_{d}*Cpb-qh*G_{d}*Cps_{d})*Bd_{d}*(zArriba-zPB)/2/1000/kNt', 'nombre:WPB', '0.000', 't'],
  ];
  filasDir.forEach(([rot, form, nom, fmt, u], k) => {
    const r = rD + 2 + k;
    vi.put(1, r, rot, 'textoB'); vi.put(4, r, u, 'unidad');
    for (const dir of ['A', 'B'] as const) {
      const A = dir === 'A';
      const f = form.replace(/\{d\}/g, dir).replace('{B}', A ? 'B_PB' : 'L_PB').replace('{L}', A ? 'L_PB' : 'B_PB').replace('{Lcol}', A ? 'v_L' : 'v_B')
        .replace('{term}', `${hojaRef(HR.viento)}${A ? 'F' : 'I'}${rf0}:${A ? 'F' : 'I'}${rf1}`).replace('{Wcol}', A ? 'v_WA' : 'v_WB').replace('{anchoCol}', A ? 'v_B' : 'v_L')
        .replace(/\{Qcol\}/g, A ? 'v_QA' : 'v_QB').replace('{Mcol}', A ? 'v_MA' : 'v_MB');
      const ref = vi.f(A ? 2 : 3, r, f, fmt === 'g' ? { papel: 'calc' } : ['G', 'frec', 'QPB', 'MPB', 'Wtot'].includes(nom.slice(7)) ? res(fmt) : num(fmt));
      const n = nom.slice(7);
      if (n) { nombrar(`${n}_${dir}`, vi, ref); clave(`${n}_${dir}`, vi, ref); }
    }
  });
  const rCs = rD + 2 + filasDir.length + 1;
  vi.seccion(rCs, 'Casos de carga (Fig. 2.4-8) en PB y viento de servicio', 21);
  vi.cabecera(rCs + 1, 1, ['Caso', 'Q viento A (t)', 'Q viento B (t)', '', 'Mt (tm)']);
  [['1: cada dirección sola', '1', '0'], ['2: 75 % con torsión e = ±0,15 B', '0.75', '0.75'], ['3: 75 % de las dos a la vez', '0.75', '0'], ['4: 56,3 % de las dos, con las dos torsiones', '0.563', '0.563']].forEach(([t, f, ft], i) => {
    const r = rCs + 2 + i;
    vi.put(1, r, t, 'textoB'); vi.f(2, r, `${f}*QPB_A`, num('0.00')); vi.f(3, r, `${f}*QPB_B`, num('0.00'));
    vi.f(5, r, i === 1 ? `MAX(${ft}*QPB_A*0.15*Bd_A,${ft}*QPB_B*0.15*Bd_B)` : i === 3 ? `${ft}*(QPB_A*0.15*Bd_A+QPB_B*0.15*Bd_B)` : '0', num('0.0'));
  });
  const rS = rCs + 7;
  fP(rS, 'Factor de V50 para la recurrencia', `IFERROR(INDEX(tFac,MATCH(recurrencia,tRec,0)),INDEX(tFac,MATCH(10,tRec,0)))`, num('0.00'), '', 'facServ', 'Fig. C AB.4.2-1');
  fP(rS + 1, 'Va = factor · V50', 'facServ*V_50', num('0.00'), 'm/s', 'Va');
  fP(rS + 2, 'Relación de presiones (Va / V)²', '(Va/V)^2', res('0.0000'), '', 'relServ', 'el viento de servicio es esta parte del de cálculo');
  vi.graficos.push({ tipo: 'dispersion', titulo: 'Fuerza de cada nivel (102-25)', ejeX: 'W (t)', ejeY: 'cota (m)',
    series: [{ nombre: 'viento A', x: `${VI}$L$${rv0}:$L$${rv1}`, y: `${VI}$B$${rv0}:$B$${rv1}`, color: 'C55A11' }, { nombre: 'viento B', x: `${VI}$Q$${rv0}:$Q$${rv1}`, y: `${VI}$B$${rv0}:$B$${rv1}`, color: '548235', punteada: true }], desde: [23, 4], hasta: [31, 24] });
  vi.graficos.push({ tipo: 'dispersion', titulo: 'Momento en altura', ejeX: 'M (tm)', ejeY: 'cota (m)',
    series: [{ nombre: 'viento A', x: `${VI}$N$${rv0}:$N$${rv1}`, y: `${VI}$B$${rv0}:$B$${rv1}`, color: 'C55A11' }, { nombre: 'viento B', x: `${VI}$S$${rv0}:$S$${rv1}`, y: `${VI}$B$${rv0}:$B$${rv1}`, color: '548235', punteada: true }], desde: [23, 25], hasta: [31, 45] });

  // ============================================================================================ 2 Cargas y vuelco
  const ca = L.hoja(HR.cargas, [52, 13, 10, 50]);
  ca.encabezado('Paso 2 · Cargas, combinaciones y vuelco', 'D: carga permanente de las losas (más el peso propio de cada tabique, hoja 6) · L: sobrecarga de uso (Tabla 4.1) · combinaciones por resistencia con el viento de resistencia del 102-25 (1,0 W) · vuelco: 0,9 · Me ≥ 1,0 · Mv.', 4);
  const fC = (r: number, rot: string, form: string, e: Estilo, u: string, nombre: string | null, nota = '') => {
    ca.put(1, r, rot, 'textoB'); const ref = ca.f(2, r, form, e); ca.put(3, r, u, 'unidad'); if (nota) ca.put(4, r, nota, 'nota');
    if (nombre) { nombrar(nombre, ca, ref); clave(nombre, ca, ref); }
    return ref;
  };
  ca.seccion(4, 'Cargas', 4);
  fC(5, 'L: sobrecarga de uso', 'IF(destino="otro",IF(Lmano>0,Lmano,0),IFERROR(INDEX(tL,MATCH(destino,tDest,0)),0))/kNt', res('0.0000'), 't/m²', 'Lsob', 'kN/m² de la tabla / 9,80665');
  fC(6, 'Peso de las losas G = D · Σ B·L de todos los niveles', 'Dlosa*SUMPRODUCT(niv_B,niv_L)', res('0.0'), 't', 'G_total');
  ca.seccion(8, 'Vuelco (viento A)', 4);
  fC(9, 'Brazo de PB a la fundación', 'zPB-zFund', num('0.00'), 'm', 'brazo');
  fC(10, 'Mv = M en PB + (Q en PB + franja de PB) · brazo', 'MPB_A+(QPB_A+MAX(0,WPB_A))*brazo', res('0.0'), 'tm', 'Mv');
  fC(11, 'Me = G · b1 / 2', 'G_total*lado_b1/2', res('0.0'), 'tm', 'Me');
  fC(12, 'Me / Mv', 'Me/Mv', res('0.00'), '', 'vuelco');
  ca.put(1, 13, 'Control 0,9 · Me ≥ 1,0 · Mv', 'textoB'); ca.f(2, 13, VER('0.9*Me>=Mv'), { papel: 'calc', centrar: true }); ca.verificaciones.push('B13');
  ca.seccion(15, 'Combinaciones (las de la hoja «Tablas»)', 4);
  ca.cabecera(16, 1, ['Combinación', 'D', 'L', 'W']);
  combos.forEach((_, i) => { ca.f(1, 17 + i, comboRef(i, 1), { papel: 'calc' }); ca.f(2, 17 + i, comboRef(i, 2), num('0.0')); ca.f(3, 17 + i, comboRef(i, 3), num('0.0')); ca.f(4, 17 + i, comboRef(i, 4), num('0.0')); });

  // ============================================================================================ 3 Secciones
  const sec = hojaSecciones(L, HR.secciones, 'Paso 3 · Secciones: el J de cada pieza (J propio + Steiner) y el eje de inercia', geo, d, clave);

  // ============================================================================================ 4 Reparto por caso
  const re = L.hoja(HR.reparto, [12, 9, 9, 9, 9, 9, 9, 8, 8, 8, 8, 9, 9, 9, 9, 8, 8, 8, 8, 3, 10, 10, 10, 8, 9, 10]);
  re.encabezado('Paso 4 · Reparto por caso de carga (rototraslación de la guía y Fig. 2.4-8)', 'parte(e) = J/ΣJ − e·J·a / ΣJt·a²: la fracción del viento que toma la pieza con la resultante a la distancia e del eje de inercia. Caso 1: e = Xr; caso 2: 75 % con e ± 0,15 B (el peor); caso 3: 75 %; caso 4: 56,3 % con e ± 0,15 B más la torsión del otro viento (0,563 · Q otro · 0,15 B otro). M y V de cada pieza en PB = fracción × M y Q en PB del viento.', 26);
  const RE = hojaRef(HR.reparto);
  const repBloque = (dir: 'A' | 'B', r0: number) => {
    const A = dir === 'A', otro = A ? 'B' : 'A';
    re.seccion(r0, `Viento ${dir}`, 26);
    const fila = (k: number, rot: string, form: string, e: Estilo, nombre: string) => { re.put(1, r0 + k, rot, 'textoB'); re.combinar(1, r0 + k, 4, r0 + k); const ref = re.f(5, r0 + k, form, e); nombrar(nombre, re, ref); clave(nombre, re, ref); return ref; };
    fila(1, `Xr: eje de inercia del viento ${dir} = e`, `Xr_${dir}`, num('0.000'), `eR_${dir}`);
    fila(2, `Sr: eje de inercia del viento ${otro}`, `Xr_${otro}`, num('0.000'), `Sr_${dir}`);
    fila(3, 'B del viento (ancho en PB)', `Bd_${dir}`, num('0.00'), `Bdir_${dir}`);
    fila(4, 'Torsión del otro viento en el caso 4 (0,15 · B otro · Q otro)', `0.15*Bd_${otro}*QPB_${otro}`, num('0.0'), `Tor_${dir}`);
    const ps = geo.piezasDir(dir), f0 = r0 + 7, f1 = f0 + Math.max(ps.length, 1) - 1;
    re.cabecera(r0 + 6, 1, ['Pieza', 'J (m⁴)', 't̄ (m)', 'a (m)', 'J·a² (m⁶)', 'parte(e)', 'parte(e + 0,15 B)', 'parte(e − 0,15 B)', 'cruz (caso 4)', 'f caso 1', 'f caso 2', 'f caso 3', 'f caso 4', 'M1 (tm)', 'M2', 'M3', 'M4', 'V1 (t)', 'V2', 'V3', 'V4']);
    const T = (dir === 'A' ? sec.tA : sec.tB);
    const pa = (e: string, r: number) => `B${r}/SJ_${dir}-IF(SJaa_${dir}>0,(${e})*B${r}*D${r}/SJaa_${dir},0)`;
    ps.forEach((pz, k) => {
      const r = f0 + k, rs = T.f0 + k, S = hojaRef(HR.secciones);
      re.f(1, r, `${S}A${rs}`, { papel: 'calc' }); re.f(2, r, `${S}E${rs}`, num('0.0000')); re.f(3, r, `${S}D${rs}`, num('0.000'));
      re.f(4, r, `C${r}-eR_${dir}`, num('0.000')); re.f(5, r, `B${r}*D${r}^2`, num('0.000'));
      re.f(6, r, pa(`eR_${dir}`, r), num('0.0000')); re.f(7, r, pa(`eR_${dir}+0.15*Bdir_${dir}`, r), num('0.0000')); re.f(8, r, pa(`eR_${dir}-0.15*Bdir_${dir}`, r), num('0.0000'));
      re.f(9, r, `IF(AND(SJaa_${dir}>0,QPB_${dir}>0),Tor_${dir}/QPB_${dir}*ABS(B${r}*D${r})/SJaa_${dir},0)`, num('0.0000'));
      re.f(10, r, `F${r}`, res('0.0000')); re.f(11, r, `0.75*MAX(G${r},H${r})`, res('0.0000')); re.f(12, r, `0.75*F${r}`, res('0.0000')); re.f(13, r, `0.563*MAX(G${r},H${r})+0.563*I${r}`, res('0.0000'));
      for (let c = 0; c < 4; c++) { re.f(14 + c, r, `${rc(10 + c, r)}*MPB_${dir}`, num('0.0')); re.f(18 + c, r, `${rc(10 + c, r)}*QPB_${dir}`, num('0.00')); }
      for (let c = 0; c < 4; c++) clave(`f${c + 1}_${dir}_${pz.nombre}`, re, rc(10 + c, r));
    });
    nombrar(`r${dir}_nombre`, re, `A${f0}:A${f1}`);
    for (let c = 0; c < 4; c++) { nombrar(`r${dir}_M${c + 1}`, re, `${rc(14 + c, f0)}:${rc(14 + c, f1)}`); nombrar(`r${dir}_V${c + 1}`, re, `${rc(18 + c, f0)}:${rc(18 + c, f1)}`); }
    // perpendiculares (como la guía)
    const q0 = f1 + 3;
    re.cabecera(q0 - 1, 1, ['Muro', `J propio en ${otro} (m⁴)`, `J propio en ${dir} (m⁴)`, '¿Perpendicular?', 'a = pos − Sr (m)', 'J·a² (m⁶)']);
    const q1 = q0 + Math.max(NR, 1) - 1;
    for (let k = 0; k < NR; k++) {
      const r = q0 + k, m = (c: number) => geo.muroDato(c, k);
      const hO = A ? m(6) : m(7), bO = A ? m(7) : m(6);
      re.f(1, r, m(1), { papel: 'calc' });
      re.f(2, r, `IF(${A ? m(11) : m(10)}="",${bO}*${hO}^3/12,${A ? m(11) : m(10)})`, num('0.0000'));
      re.f(3, r, `IF(${A ? m(10) : m(11)}="",${hO}*${bO}^3/12,${A ? m(10) : m(11)})`, num('0.0000'));
      re.f(4, r, `IF(OR(${m(8)}=1,B${r}>C${r}),1,0)`, num('0'));
      re.f(5, r, `${A ? m(5) : m(4)}-Sr_${dir}`, num('0.000'));
      re.f(6, r, `D${r}*B${r}*E${r}^2`, num('0.000'));
    }
    re.put(1, q1 + 1, 'Σ J·a² = paralelas + perpendiculares', 'textoB'); re.combinar(1, q1 + 1, 4, q1 + 1);
    const ref = re.f(5, q1 + 1, `SUM(E${f0}:E${f1})+SUM(F${q0}:F${q1})`, res('0.0'));
    nombrar(`SJaa_${dir}`, re, ref); clave(`SJaa_${dir}`, re, ref);
    re.graficos.push({ tipo: 'barras', titulo: `Fracción del viento ${dir} que toma cada pieza`, ejeX: 'pieza', ejeY: 'fracción',
      series: [1, 2, 3, 4].map((c, i) => ({ nombre: `caso ${c}`, x: `${RE}$A$${f0}:$A$${f1}`, y: `${RE}$${rc(10 + i, f0).replace(/\d+/, '')}$${f0}:$${rc(10 + i, f0).replace(/\d+/, '')}$${f1}`, color: ['2E75B6', 'C55A11', '548235', '7030A0'][i] })),
      desde: [28, r0], hasta: [37, r0 + 18] });
    return q1 + 3;
  };
  const finA = repBloque('A', 4); repBloque('B', Math.max(finA, 24));

  // ============================================================================================ 6 Hormigón 201 (y 5 Solicitaciones)
  // las partes: un renglón por rectángulo que está en una pieza, viento A y después viento B
  type Parte = { dir: 'A' | 'B'; pieza: string; k: number; muro: string; n: number; secRow: number; alma: boolean };
  const partes: Parte[] = [];
  for (const dir of ['A', 'B'] as const) {
    const b = dir === 'A' ? sec.bA : sec.bB;
    for (const pz of geo.piezasDir(dir)) {
      const vistos = new Map<string, number>();
      d.rects.forEach((x, k) => {
        if ((dir === 'A' ? x.piezaA : x.piezaB) !== pz.nombre) return;
        const n = vistos.get(x.muro) ?? 0; vistos.set(x.muro, n + 1);
        const h = dir === 'A' ? x.ay : x.ax, bb = x.A !== null ? x.A / h : dir === 'A' ? x.ax : x.ay;
        partes.push({ dir, pieza: pz.nombre, k, muro: x.muro, n, secRow: b.f0 + k, alma: x.tubo || h >= bb });
      });
    }
  }
  const h2 = L.hoja(HR.h201, [8, 8, 7, 9, 8, 8, 8, ...Array(70).fill(10)]);
  const so = L.hoja(HR.solic, [8, 8, 6, 24, 6, 6, 11, 11, 11, 11, 11, 11, 11]);
  h2.encabezado('Paso 6 · Hormigón: CIRSOC 201-2005, muro por muro en PB', `D = peso propio + D de las losas (área de influencia × losas); L = sobrecarga de las losas. Nw = M·A·d/J (la fuerza del par en cada muro), Mw = M·Jpropio/J (el momento de las almas), Vw = V·A/A almas. Corte en el plano (11.10): d = 0,8 lw, Vc el menor de (11-29) y (11-30), Vn ≤ 5/6 √f'c h d. Cuantías mínimas (14.3): vertical 0,0012 y horizontal 0,0020; con Vu > φVc/2, 0,0025 las dos. ${completa ? 'Flexocompresión: relación de uso con el diagrama N-M de la hoja 7 (≤ 1 verifica), con la cuantía mínima y con la adoptada.' : 'Simple: compresión con el método empírico (14.5) y flexión con dos cordones de borde de 0,15 lw separados 0,85 lw.'}`, 30);
  so.encabezado('Paso 5 · Solicitaciones de cada muro', 'Para cada combinación con viento: los cuatro casos de carga y los dos sentidos. Nu = cD·D + cL·L ± cW·Nw; Mu = cW·Mw; Vu = cW·Vw (t y tm; Nu + compresión).', 13);
  so.cabecera(4, 1, ['Pieza', 'Muro', 'Viento', 'Combinación', 'Caso', 'Sentido', 'Nu (t)', 'Mu (tm)', 'Vu (t)', ...(completa ? ['φMn con ρ mín (tm)', 'Relación con ρ mín', 'φMn con ρ adoptada (tm)', 'Relación con ρ adoptada'] : [])]);
  so.fijar = { fila: 5, col: 3 };
  const cab201 = ['Pieza', 'Muro', 'Viento', 'A (m²)', 'b (m)', 'h (m)', 'd (m)', '¿Alma?', 'lw (m)', 't (m)', 'Altura (m)', 'Losas', 'D (t)', 'L (t)', 'J pieza (m⁴)', 'A almas (m²)',
    'M1 (tm)', 'M2', 'M3', 'M4', 'V1 (t)', 'V2', 'V3', 'V4', 'Nw1 (t)', 'Nw2', 'Nw3', 'Nw4', 'Mw1 (tm)', 'Mw2', 'Mw3', 'Mw4', 'Vw1 (t)', 'Vw2', 'Vw3', 'Vw4',
    'hw (m)', 'lc (m)', 'Recubrimiento al eje (m)', 'Vu máx (t)', 'Nu mín (t)', 'Mu máx (tm)', 'Vc (t)', 'φVc (t)', 'Vu > φVc/2', 'ρ vertical mín', 'ρ horizontal mín', 'ρ horizontal', 'Vs (t)', 'Vn máx (t)', 'φVn (t)', 'Vu / φVn', 'Corte',
    'Nu máx (t)', 'φPn empírico (t)', 'T cordón (t)', 'C cordón (t)', 'C adm (t)', 'As por borde (cm²)', 'Simple',
    ...(completa ? ['ρ adoptada', 'Relación con ρ mín', 'Relación con ρ adoptada', 'Flexocompresión'] : [])];
  h2.cabecera(4, 1, cab201);
  h2.fijar = { fila: 5, col: 3 };
  const H2 = hojaRef(HR.h201), SO = hojaRef(HR.solic), DG = hojaRef(HR.diag), SEC = hojaRef(HR.secciones);
  // columnas de la hoja 6 por nombre
  const C = Object.fromEntries(cab201.map((t, i) => [t, i + 1])) as Record<string, number>;
  const X = (t: string, r: number) => rc(C[t], r);
  const lcForm = 'zArriba-zPB';
  const recForm = '(IF(recMano>0,recMano,INDEX(tRef,MATCH(recTipo,tRecTipo,0),IF(vidaUtil=100,2,1))+IF(controlEj="sin",dRsin,dRcon))+12)/1000';
  let rsol = 5;
  // diagramas: un bloque por parte con alma (dos diagramas: ρ mín y ρ adoptada)
  const dg = completa ? L.hoja(HR.diag, [8, 10, 10, 12, 12, 12, 10, 8, 12, 12, 3, 8, 10, 10, 12, 12, 12, 10, 8, 12, 12]) : null;
  if (dg) dg.encabezado('Paso 7 · Diagramas de interacción φPn–φMn de cada muro (CIRSOC 201, 10.2 y 10.3)', "Eje neutro c en 120 posiciones (de 1,6·lw/120 a 1,6·lw) más la tracción pura; armadura vertical repartida en 40 barras; bloque de tensiones 0,85 f'c en a = β1·c; acero elastoplástico (fy = 420 MPa, εcu = 0,003); φ de 0,65 (εt ≤ 0,002) a 0,90 (εt ≥ 0,005); φPn ≤ φPn,máx = 0,80·0,65·P0 (10-2). Unidades: N y mm. A la izquierda con la cuantía mínima, a la derecha con la adoptada (hoja 6).", 21);
  let rdg = 5;
  partes.forEach((pt, ip) => {
    const r = 5 + ip, s = pt.secRow, dir = pt.dir;
    h2.f(1, r, `${SEC}B${s}`, { papel: 'calc' }); h2.f(2, r, `${SEC}A${s}`, { papel: 'calc' }); h2.put(3, r, dir, { papel: 'calc', centrar: true });
    h2.f(4, r, `${SEC}D${s}`, num('0.0000'));
    h2.f(5, r, `IF(${SEC}C${s}="tubo",${SEC}F${s},${SEC}E${s})`, num('0.000'));                   // un tubo circular: b = su diámetro, como la app
    h2.f(6, r, `${SEC}F${s}`, num('0.000')); h2.f(7, r, `${SEC}K${s}`, num('0.000'));
    h2.f(8, r, `IF(F${r}>=E${r},1,0)`, num('0'));
    h2.f(9, r, `MAX(E${r},F${r})`, num('0.000')); h2.f(10, r, `MIN(E${r},F${r})`, num('0.000'));
    h2.f(11, r, `MAX(0,SUMPRODUCT((m_muro=B${r})*m_top)-zPB)*SUMPRODUCT((m_muro=B${r})*m_fac)`, num('0.00'));
    h2.f(12, r, `SUMPRODUCT((niv_cota>zPB+1E-9)*(niv_cota<=SUMPRODUCT((m_muro=B${r})*m_top)+1E-6)*niv_pisos)`, num('0'));
    const pfx = dir === 'A' ? 'sA_' : 'sB_';
    const parte = `SUMPRODUCT((m_muro=B${r})*m_inf)*D${r}/SUMPRODUCT((${pfx}muro=B${r})*(${pfx}pieza<>"")*${pfx}A)*L${r}`;
    h2.f(13, r, `D${r}*K${r}*gamaH+Dlosa*${parte}`, num('0.00'));
    h2.f(14, r, `Lsob*${parte}`, num('0.00'));
    h2.f(15, r, `SUMPRODUCT((p${dir}_nombre=A${r})*p${dir}_J)`, num('0.0000'));
    h2.f(16, r, `SUMPRODUCT((${pfx}pieza=A${r})*(${pfx}h>=${pfx}b)*${pfx}A)`, num('0.0000'));
    for (let c = 0; c < 4; c++) {
      h2.f(17 + c, r, `SUMPRODUCT((r${dir}_nombre=A${r})*r${dir}_M${c + 1})`, num('0.0'));
      h2.f(21 + c, r, `SUMPRODUCT((r${dir}_nombre=A${r})*r${dir}_V${c + 1})`, num('0.00'));
      h2.f(25 + c, r, `IF(O${r}>0,${rc(17 + c, r)}*D${r}*G${r}/O${r},0)`, num('0.00'));
      h2.f(29 + c, r, `IF(AND(H${r}=1,O${r}>0),${rc(17 + c, r)}*(E${r}*F${r}^3/12)/O${r},0)`, num('0.00'));
      h2.f(33 + c, r, `IF(H${r}=1,${rc(21 + c, r)}*D${r}/IF(P${r}>0,P${r},1),0)`, num('0.00'));
    }
    h2.f(C['hw (m)'], r, `MAX(0.1,MIN(SUMPRODUCT((m_muro=B${r})*m_top),zTop)-zPB)`, num('0.00'));
    h2.f(C['lc (m)'], r, lcForm, num('0.00'));
    h2.f(C['Recubrimiento al eje (m)'], r, recForm, num('0.000'));
    // solicitaciones de la parte
    const s0 = rsol;
    combos.forEach((cb, ic) => {
      const cD = comboRef(ic, 2), cL = comboRef(ic, 3), cW = comboRef(ic, 4);
      if (cb.W === 0) {
        so.f(1, rsol, `${H2}A${r}`, { papel: 'calc' }); so.f(2, rsol, `${H2}B${r}`, { papel: 'calc' }); so.put(3, rsol, dir, { papel: 'calc', centrar: true }); so.f(4, rsol, comboRef(ic, 1), { papel: 'calc' }); so.put(5, rsol, '—', { papel: 'calc', centrar: true }); so.put(6, rsol, '', { papel: 'calc' });
        so.f(7, rsol, `${cD}*${H2}M${r}+${cL}*${H2}N${r}`, num('0.00')); so.f(8, rsol, '0', num('0.00')); so.f(9, rsol, '0', num('0.00'));
        rsol++; return;
      }
      for (let c = 0; c < 4; c++) for (const sg of [1, -1]) {
        so.f(1, rsol, `${H2}A${r}`, { papel: 'calc' }); so.f(2, rsol, `${H2}B${r}`, { papel: 'calc' }); so.put(3, rsol, dir, { papel: 'calc', centrar: true }); so.f(4, rsol, comboRef(ic, 1), { papel: 'calc' });
        so.put(5, rsol, c + 1, { papel: 'calc', centrar: true }); so.put(6, rsol, sg > 0 ? '+' : '−', { papel: 'calc', centrar: true });
        so.f(7, rsol, `${cD}*${H2}M${r}+${cL}*${H2}N${r}${sg > 0 ? '+' : '-'}${cW}*${H2}${rc(25 + c, r)}`, num('0.00'));
        so.f(8, rsol, `${cW}*${H2}${rc(29 + c, r)}`, num('0.00'));
        so.f(9, rsol, `${cW}*${H2}${rc(33 + c, r)}`, num('0.00'));
        rsol++;
      }
    });
    const s1 = rsol - 1;
    const Nu = `${SO}$G$${s0}:$G$${s1}`, Mu = `${SO}$H$${s0}:$H$${s1}`, Vu = `${SO}$I$${s0}:$I$${s1}`;
    // corte (11.10), en N y mm
    h2.f(C['Vu máx (t)'], r, `MAX(0,SUMPRODUCT(MAX(ABS(${Vu}))))`, num('0.00'));
    h2.f(C['Nu mín (t)'], r, `MIN(${Nu})`, num('0.00'));
    h2.f(C['Mu máx (tm)'], r, `SUMPRODUCT(MAX(ABS(${Mu})))`, num('0.00'));
    const Lmm = `(${X('lw (m)', r)}*1000)`, hmm = `(${X('t (m)', r)}*1000)`, dmm = `(0.8*${Lmm})`, sq = 'SQRT(fc)';
    const V = `(${X('Vu máx (t)', r)}*Nt)`, Nn = `(${X('Nu mín (t)', r)}*Nt)`, Mm = `(${X('Mu máx (tm)', r)}*Nt*1000)`;
    const brazo = `IF(${V}>0,${Mm}/${V}-${Lmm}/2,-1)`;
    const v1 = `(${sq}/4*${hmm}*${dmm}+${Nn}*${dmm}/(4*${Lmm}))`;
    const v2 = `IF(${brazo}>0,(${sq}/2+${Lmm}*(${sq}+2*${Nn}/(${Lmm}*${hmm}))/(${brazo}))*(${hmm}*${dmm}/10),1E+300)`;
    h2.f(C['Vc (t)'], r, `MAX(0,MIN(${v1},${v2}))/Nt`, num('0.00'));
    h2.f(C['φVc (t)'], r, `phiV*${X('Vc (t)', r)}`, num('0.00'));
    h2.f(C['Vu > φVc/2'], r, `IF(${X('Vu máx (t)', r)}*Nt>phiV*${X('Vc (t)', r)}*Nt/2,1,0)`, num('0'));
    h2.f(C['ρ vertical mín'], r, `IF(${X('Vu > φVc/2', r)}=1,0.0025,0.0012)`, num('0.0000'));
    h2.f(C['ρ horizontal mín'], r, `IF(${X('Vu > φVc/2', r)}=1,0.0025,0.002)`, num('0.0000'));
    const nec = `((${X('Vu máx (t)', r)}/phiV-${X('Vc (t)', r)})*Nt/(${hmm}*${dmm}*fy))`, rmin = X('ρ horizontal mín', r);
    h2.f(C['ρ horizontal'], r, `IF(${V}/phiV>5/6*${sq}*${hmm}*${dmm},MAX(${rmin},0.02),IF(${nec}>${rmin},MIN(0.02,ROUND((${rmin}-INT(-((${nec}-${rmin})/0.0005-1E-9))*0.0005)*1000000,0)/1000000),${rmin}))`, res('0.0000'));
    h2.f(C['Vs (t)'], r, `${X('ρ horizontal', r)}*${hmm}*${dmm}*fy/Nt`, num('0.00'));
    h2.f(C['Vn máx (t)'], r, `5/6*${sq}*${hmm}*${dmm}/Nt`, num('0.00'));
    h2.f(C['φVn (t)'], r, `phiV*MIN(${X('Vc (t)', r)}+${X('Vs (t)', r)},${X('Vn máx (t)', r)})`, res('0.00'));
    h2.f(C['Vu / φVn'], r, `IF(${X('φVn (t)', r)}>0,${X('Vu máx (t)', r)}/${X('φVn (t)', r)},1E+99)`, res('0.000'));
    h2.f(C['Corte'], r, VER(`${X('Vu máx (t)', r)}*Nt<=${X('φVn (t)', r)}*Nt`), { papel: 'calc', centrar: true });
    // simple
    h2.f(C['Nu máx (t)'], r, `MAX(${Nu})`, num('0.00'));
    h2.f(C['φPn empírico (t)'], r, `0.55*0.65*fc*${Lmm}*${hmm}*(1-(0.8*${X('lc (m)', r)}/(32*${X('t (m)', r)}))^2)/Nt`, num('0.0'));
    h2.f(C['T cordón (t)'], r, `SUMPRODUCT(MAX(ABS(${Mu})/(0.85*${X('lw (m)', r)})-${Nu}/2))`, num('0.00'));
    h2.f(C['C cordón (t)'], r, `SUMPRODUCT(MAX(ABS(${Mu})/(0.85*${X('lw (m)', r)})+${Nu}/2))`, num('0.00'));
    h2.f(C['C adm (t)'], r, `0.65*0.85*fc*0.15*${X('lw (m)', r)}*${X('t (m)', r)}*1000000/Nt`, num('0.0'));
    h2.f(C['As por borde (cm²)'], r, `MAX(0,${X('T cordón (t)', r)}*Nt/(0.9*fy))/100`, num('0.00'));
    h2.f(C['Simple'], r, VER(`AND(${X('Nu máx (t)', r)}<=${X('φPn empírico (t)', r)},${X('C cordón (t)', r)}<=${X('C adm (t)', r)})`), { papel: 'calc', centrar: true });
    const kp = `${dir}|${pt.pieza}|${pt.muro}|${pt.n}`;
    for (const [n, t] of [['Vu', 'Vu máx (t)'], ['phiVn', 'φVn (t)'], ['rhoH', 'ρ horizontal'], ['rhoMin', 'ρ vertical mín'], ['NuMax', 'Nu máx (t)'], ['axialEmp', 'φPn empírico (t)'], ['C', 'C cordón (t)'], ['T', 'T cordón (t)'], ['D', 'D (t)'], ['Lm', 'L (t)']] as const) clave(`${n}|${kp}`, h2, X(t, r));
    for (let i = s0; i <= s1; i++) { clave(`Nu|${kp}|${i - s0}`, so, `G${i}`); clave(`Mu|${kp}|${i - s0}`, so, `H${i}`); clave(`Vu|${kp}|${i - s0}`, so, `I${i}`); }
    if (completa && dg) {
      const rhoA = R.rhoAdoptada.get(kp) ?? 0.0012;
      h2.put(C['ρ adoptada'], r, rhoA, dato('0.0000'));
      // diagramas: bloque de constantes y 121 puntos, para ρ mín (columnas A–J) y ρ adoptada (L–U)
      const b0 = rdg;
      dg.seccion(b0, `${pt.pieza} · ${pt.muro} (viento ${dir}, ${pt.alma ? 'alma' : 'ala'})`, 21);
      const bloqueDg = (c0: number, rho: string, etiqueta: string) => {
        const cc = (k: number) => c0 + k;
        const K = (k: number, rr: number) => rc(cc(k), rr);
        const k0 = b0 + 1;
        const consts: [string, string, Estilo['fmt']][] = [
          [etiqueta, rho, '0.0000'], ['L (mm)', `${H2}${X('lw (m)', r)}*1000`, '0'], ['h (mm)', `${H2}${X('t (m)', r)}*1000`, '0'], ['d1 (mm)', `${H2}${X('Recubrimiento al eje (m)', r)}*1000`, '0'],
          ['β1', 'IF(fc<=30,0.85,MAX(0.65,0.85-0.05*(fc-30)/7))', '0.000'], ['As (mm²)', `${K(1, k0)}*${K(1, k0 + 1)}*${K(1, k0 + 2)}`, '0'], ['As de cada barra', `${K(1, k0 + 5)}/${NB}`, '0.00'],
          ['P0 (N)', `0.85*fc*(${K(1, k0 + 1)}*${K(1, k0 + 2)}-${K(1, k0 + 5)})+fy*${K(1, k0 + 5)}`, '0'], ['φPn,máx (N)', `0.8*0.65*${K(1, k0 + 7)}`, '0'], ['φPn,mín (N)', `-0.9*fy*${K(1, k0 + 5)}`, '0'],
        ];
        consts.forEach(([t, f, fmt], i) => { dg.put(cc(0), k0 + i, t, 'textoB'); dg.f(cc(1), k0 + i, f, num(fmt)); });
        const Lr = K(1, k0 + 1), hr = K(1, k0 + 2), d1 = K(1, k0 + 3), b1 = K(1, k0 + 4), Asi = K(1, k0 + 6), PM = K(1, k0 + 8), Pm = K(1, k0 + 9);
        const t0 = k0 + consts.length + 1;
        dg.cabecera(t0, cc(0), ['i', 'c (mm)', 'a (mm)', 'Pn (N)', 'Mn (N·mm)', 'εt', 'φ', 'φPn (N)', 'φMn (N·mm)']);
        const p0 = t0 + 1;
        // tracción pura (c = 0)
        dg.put(cc(0), p0, 0, num('0')); dg.put(cc(1), p0, 0, num('0')); dg.put(cc(2), p0, 0, num('0'));
        dg.f(cc(3), p0, `-fy*${K(1, k0 + 5)}`, num('0')); dg.put(cc(4), p0, 0, num('0')); dg.put(cc(5), p0, '∞', { papel: 'calc' }); dg.put(cc(6), p0, 0.9, num('0.000'));
        dg.f(cc(7), p0, Pm, num('0')); dg.put(cc(8), p0, 0, num('0'));
        const Y = `(${d1}+(${Lr}-2*${d1})*barK/${NB - 1})`;
        for (let i = 1; i <= NC; i++) {
          const rr = p0 + i, c = K(1, rr), a = K(2, rr);
          const es = `600*(${c}-${Y})/${c}`;
          const CL = `(ABS(${es}+fy)-ABS(${es}-fy))/2`;
          const fs = `(${CL}-0.85*fc*(${Y}<${a})*(${CL}>0))`;
          dg.put(cc(0), rr, i, num('0'));
          dg.f(cc(1), rr, `${Lr}*1.6*${i}/${NC}`, num('0'));
          dg.f(cc(2), rr, `MIN(${b1}*${c},${Lr})`, num('0'));
          dg.f(cc(3), rr, `0.85*fc*${a}*${hr}+${Asi}*SUMPRODUCT(${fs})`, num('0'));
          dg.f(cc(4), rr, `0.85*fc*${a}*${hr}*(${Lr}/2-${a}/2)+${Asi}*SUMPRODUCT(${fs}*(${Lr}/2-${Y}))`, num('0'));
          dg.f(cc(5), rr, `-ecu*(${c}-(${Lr}-${d1}))/${c}`, num('0.00000'));
          const et = K(5, rr);
          dg.f(cc(6), rr, `IF(${et}<=0.002,0.65,IF(${et}>=0.005,0.9,0.65+(${et}-0.002)/0.003*0.25))`, num('0.000'));
          dg.f(cc(7), rr, `MIN(${K(6, rr)}*${K(3, rr)},${PM})`, num('0'));
          dg.f(cc(8), rr, `${K(6, rr)}*${K(4, rr)}`, num('0'));
        }
        const p1 = p0 + NC;
        const letra = (k: number) => rc(cc(k), 1).replace(/\d+/, '');
        return { cP: letra(7), cM: letra(8), p0, p1, PM: `${DG}${PM}`, Pm: `${DG}${Pm}` };
      };
      const dMin = bloqueDg(1, `${H2}${X('ρ vertical mín', r)}`, 'ρ mínima');
      const dAd = bloqueDg(12, `${H2}${X('ρ adoptada', r)}`, 'ρ adoptada');
      rdg = dMin.p1 + 3;
      // relación de uso de cada solicitación con cada diagrama
      for (let i = s0; i <= s1; i++) {
        for (const [cMn, cRel, D] of [[10, 11, dMin], [12, 13, dAd]] as const) {
          const Pu = `(G${i}*Nt)`;
          const rgo = (c: string, a: number, b: number) => `${DG}$${c}$${a}:$${c}$${b}`;
          const Pa = rgo(D.cP, D.p0, D.p1 - 1), Pb = rgo(D.cP, D.p0 + 1, D.p1), Ma = rgo(D.cM, D.p0, D.p1 - 1), Mb = rgo(D.cM, D.p0 + 1, D.p1);
          const cruce = `((${Pa}-${Pu})*(${Pb}-${Pu})<=0)*(${Pa}<>${Pb})*(${Ma}+(${Pu}-${Pa})/(${Pb}-${Pa}+(${Pb}=${Pa}))*(${Mb}-${Ma}))`;
          so.f(cMn, i, `IF(OR(${Pu}>${D.PM}+0.000001,${Pu}<${D.Pm}-0.000001),0,SUMPRODUCT(MAX(${cruce})))/Nt/1000`, num('0.00'));
          so.f(cRel, i, `IF(ABS(H${i})<1E-9,IF(G${i}>=0,${Pu}/${D.PM},${Pu}/${D.Pm}),IF(${rc(cMn, i)}>0,ABS(H${i})/${rc(cMn, i)},1E+99))`, num('0.000'));
        }
      }
      h2.f(C['Relación con ρ mín'], r, `MAX(${SO}K${s0}:K${s1})`, res('0.000'));
      h2.f(C['Relación con ρ adoptada'], r, `MAX(${SO}M${s0}:M${s1})`, res('0.000'));
      h2.f(C['Flexocompresión'], r, `IF(${X('Relación con ρ mín', r)}<=1,"VERIFICA",IF(AND(${X('Relación con ρ adoptada', r)}<=1,${X('ρ adoptada', r)}<0.04),"ATENCIÓN","NO VERIFICA"))`, { papel: 'calc', centrar: true });
      clave(`relMin|${kp}`, h2, X('Relación con ρ mín', r)); clave(`relAd|${kp}`, h2, X('Relación con ρ adoptada', r));
      for (let i = s0; i <= s1; i++) clave(`phiMn|${kp}|${i - s0}`, so, `J${i}`);
      if (pt.alma) dg.graficos.push({ tipo: 'dispersion', titulo: `${pt.pieza} · ${pt.muro}: diagrama de interacción`, ejeX: 'φMn (N·mm)', ejeY: 'φPn (N)',
        series: [{ nombre: 'ρ mínima', x: `${DG}${rc(9, dMin.p0)}:${rc(9, dMin.p1)}`, y: `${DG}${rc(8, dMin.p0)}:${rc(8, dMin.p1)}`, color: 'A6A6A6', sinMarcas: true },
          { nombre: 'ρ adoptada', x: `${DG}${rc(20, dAd.p0)}:${rc(20, dAd.p1)}`, y: `${DG}${rc(19, dAd.p0)}:${rc(19, dAd.p1)}`, color: '1F4E79', sinMarcas: true }],
        desde: [23, b0], hasta: [31, b0 + 22] });
    }
  });
  h2.verificaciones.push(`${rc(C['Corte'], 5)}:${rc(C['Corte'], 5 + partes.length)}`, `${rc(C['Simple'], 5)}:${rc(C['Simple'], 5 + partes.length)}`);
  if (completa) h2.verificaciones.push(`${rc(C['Flexocompresión'], 5)}:${rc(C['Flexocompresión'], 5 + partes.length)}`);

  // ============================================================================================ 8 Deriva
  const de = L.hoja(HR.deriva, [14, 9, 12, 12, 12, 12, 12, 14, 9, 12, 12, 12, 12, 12]);
  de.encabezado('Paso 8 · Deriva con el viento de servicio (102-25, comentario C B.4.2)', 'La torre como ménsula empotrada en PB, con el momento del 102-25 de cada nivel, el Σ J de cada viento (hoja 3) y el E de la cátedra: θ = ∫ M/(E·J) dz y δ = ∫ θ dz (trapecios). El viento de servicio es (Va/V)² del de cálculo. Azotea ≤ h / límite y cada piso ≤ altura del piso / límite.', 12);
  de.put(1, 4, 'E del hormigón (t/m²)', 'textoB'); de.combinar(1, 4, 3, 4);
  const Eref = de.f(4, 4, `IF(fc>=${divRef(3, 3)},${divRef(3, 2)},IF(fc>=${divRef(2, 3)},${divRef(2, 2)},IF(fc>=${divRef(1, 3)},${divRef(1, 2)},${divRef(0, 2)})))*500/8`, num('0'));
  nombrar('E_h', de, Eref);
  const sobre = d.niveles.map((n, i) => ({ n, i })).filter(x => x.i < iPB).reverse();   // de abajo hacia arriba
  for (const [c0, dir] of [[1, 'A'], [8, 'B']] as const) {
    de.seccion(6, `Viento ${dir}`, c0 + 6); de.cabecera(7, c0, ['Nivel', 'z (m)', 'M (tm)', 'θ', 'δ (m)', 'δ de servicio (m)']);
    const cM = dir === 'A' ? 14 : 19;
    const K = (k: number, r: number) => rc(c0 + k, r);
    de.put(c0, 8, 'PB', { papel: 'calc' }); de.put(c0 + 1, 8, 0, num('0.00')); de.f(c0 + 2, 8, `MPB_${dir}`, num('0.0')); de.put(c0 + 3, 8, 0, num('0.00000')); de.put(c0 + 4, 8, 0, num('0.00000')); de.put(c0 + 5, 8, 0, num('0.00000'));
    sobre.forEach(({ i }, k) => {
      const r = 9 + k, a = r - 1;
      de.f(c0, r, `${VI}A${rv(i)}`, { papel: 'calc' });
      de.f(c0 + 1, r, `${VI}F${rv(i)}`, num('0.00'));
      de.f(c0 + 2, r, `${VI}${rc(cM, rv(i))}`, num('0.0'));
      de.f(c0 + 3, r, `${K(3, a)}+(${K(2, a)}/SJ_${dir}+${K(2, r)}/SJ_${dir})/2*(${K(1, r)}-${K(1, a)})/E_h`, num('0.00000'));
      de.f(c0 + 4, r, `${K(4, a)}+(${K(3, a)}+${K(3, r)})/2*(${K(1, r)}-${K(1, a)})`, num('0.00000'));
      de.f(c0 + 5, r, `${K(4, r)}*relServ`, res('0.00000'));
    });
    const rl = 8 + sobre.length, ru = rl + 2;
    de.put(c0, ru, 'Azotea (servicio)', 'textoB'); const top = de.f(c0 + 1, ru, `${K(5, rl)}`, res('0.0000'));
    de.put(c0, ru + 1, 'h / límite', 'textoB'); de.f(c0 + 1, ru + 1, `${K(1, rl)}/limDeriva`, num('0.0000'));
    de.put(c0, ru + 2, 'Peor piso: Δδ / Δz', 'textoB');
    // la peor deriva entre pisos, con una columna auxiliar
    const cAux = c0 + 6;
    de.put(cAux, 7, 'Δδ / Δz del piso', { papel: 'cab', centrar: true });
    for (let r = 9; r <= rl; r++) de.f(cAux, r, `(${K(5, r)}-${K(5, r - 1)})/(${K(1, r)}-${K(1, r - 1)})`, num('0.00000'));
    de.f(c0 + 1, ru + 2, `MAX(${rc(cAux, 9)}:${rc(cAux, rl)})`, num('0.00000'));
    de.put(c0, ru + 3, 'Control', 'textoB'); de.f(c0 + 1, ru + 3, VER(`AND(${K(1, ru)}<=${K(1, ru + 1)},${K(1, ru + 2)}<=1/limDeriva)`), { papel: 'calc', centrar: true }); de.verificaciones.push(K(1, ru + 3));
    nombrar(`deriva_${dir}`, de, top); clave(`deriva_${dir}`, de, top); clave(`peorPiso_${dir}`, de, K(1, ru + 2));
  }

  // ============================================================================================ Resumen
  const rs = L.hoja(HR.resumen, [16, 52, 13, 12, 16, 40]);
  rs.encabezado('Resumen de los controles', 'VERIFICA en verde, NO VERIFICA en rojo, ATENCIÓN en naranja (hay que mirarlo).', 6);
  rs.cabecera(4, 1, ['Paso', 'Control', 'Valor', 'Unidad', 'Estado', 'Criterio']);
  const filas: [string, string, string, string, string, string, Estilo['fmt']][] = [];
  for (const dir of ['A', 'B'] as const) filas.push(['1 Viento', `Frecuencia n1, viento ${dir}`, `frec_${dir}`, 'Hz', `IF(frec_${dir}>=1,"VERIFICA","ATENCIÓN")`, 'n1 ≥ 1 Hz: rígido; si no, Gf', '0.000']);
  for (const dir of ['A', 'B'] as const) filas.push(['1 Viento', `Carga del viento ${dir}`, `Wtot_${dir}`, 't', `IF(fmin_${dir}>1,"VERIFICA (manda la mínima)","VERIFICA")`, 'W ≥ 0,75 kN/m² · área de la pared (2.1.5)', '0.00']);
  filas.push(['2 Cargas', 'Vuelco Me / Mv', 'vuelco', '', VER('0.9*Me>=Mv'), '0,9 Me ≥ Mv', '0.00']);
  filas.push(['Datos', "f'c del hormigón (MPa)", 'fc', 'MPa', VER('fc>=INDEX(tFcMin,MATCH(expHorm,tClase,0))'), "≥ el f'c mínimo de la clase de exposición (200-24, Tabla 2.5)", '0']);
  for (const dir of ['A', 'B'] as const) filas.push(['8 Deriva', `Deriva de servicio en la azotea, viento ${dir}`, `deriva_${dir}`, 'm', `${hojaRef(HR.deriva)}${rc(dir === 'A' ? 2 : 9, 8 + sobre.length + 5)}`, 'h / límite y cada piso', '0.0000']);
  let r2 = 5;
  for (const f of filas) { rs.put(1, r2, f[0], 'texto'); rs.put(2, r2, f[1], 'textoB'); rs.f(3, r2, f[2], res(f[6])); rs.put(4, r2, f[3], 'unidad'); rs.f(5, r2, f[4], { papel: 'calc', centrar: true }); rs.put(6, r2, f[5], 'nota'); r2++; }
  // por pieza: hormigón y corte
  for (const dir of ['A', 'B'] as const) for (const pz of geo.piezasDir(dir)) {
    const rows = partes.map((x, i) => ({ x, r: 5 + i })).filter(z => z.x.dir === dir && z.x.pieza === pz.nombre);
    if (!rows.length) continue;
    const r0 = rows[0].r, r1 = rows[rows.length - 1].r;
    const rg = (t: string) => `${H2}${X(t, r0)}:${X(t, r1)}`;
    if (completa) {
      rs.put(1, r2, `6 Hormigón ${dir}`, 'texto'); rs.put(2, r2, `${pz.nombre}: flexocompresión, uso con ρ mín`, 'textoB');
      rs.f(3, r2, `MAX(${rg('Relación con ρ mín')})`, res('0.000')); rs.put(4, r2, '', 'unidad');
      rs.f(5, r2, `IF(C${r2}<=1,"VERIFICA",IF(MAX(${rg('Relación con ρ adoptada')})<=1,"ATENCIÓN","NO VERIFICA"))`, { papel: 'calc', centrar: true });
      rs.put(6, r2, 'más de 1: hace falta más armadura (la adoptada, hoja 6)', 'nota'); clave(`pieza201|${dir}|${pz.nombre}`, rs, `C${r2}`); r2++;
    } else {
      rs.put(1, r2, `6 Hormigón ${dir}`, 'texto'); rs.put(2, r2, `${pz.nombre}: compresión y cordones (simple)`, 'textoB');
      rs.f(3, r2, `MAX(SUMPRODUCT(MAX(${rg('Nu máx (t)')}/${rg('φPn empírico (t)')})),SUMPRODUCT(MAX(${rg('C cordón (t)')}/${rg('C adm (t)')})))`, res('0.000')); rs.put(4, r2, 'uso', 'unidad');
      rs.f(5, r2, VER(`C${r2}<=1`), { papel: 'calc', centrar: true }); rs.put(6, r2, "Nu ≤ φPn (14.5) y C ≤ 0,65·0,85 f'c·A cordón", 'nota'); clave(`pieza201|${dir}|${pz.nombre}`, rs, `C${r2}`); r2++;
    }
    const almas = rows.filter(z => z.x.alma);
    if (almas.length) {
      rs.put(1, r2, `6 Hormigón ${dir}`, 'texto'); rs.put(2, r2, `${pz.nombre}: corte en el plano`, 'textoB');
      rs.f(3, r2, `MAX(${almas.map(z => `${H2}${X('Vu / φVn', z.r)}`).join(',')})`, res('0.000')); rs.put(4, r2, 'Vu/φVn', 'unidad');
      rs.f(5, r2, VER(`C${r2}<=1`), { papel: 'calc', centrar: true }); rs.put(6, r2, 'Vu ≤ φVn (11.10)', 'nota'); clave(`corte|${dir}|${pz.nombre}`, rs, `C${r2}`); r2++;
    }
  }
  rs.verificaciones.push(`E5:E${r2}`);

  if (p) for (const t of tablasProyecto(p)) {
    const h = L.hoja(t.nombre, t.anchos); h.oculta = true;
    t.filas.forEach((f, i) => f.forEach((x, j) => { if (x !== null && x !== '') h.put(j + 1, i + 1, x, 'vacio'); }));
  }
  const orden = [HR.leame, HR.datos, HR.tablas, HR.viento, HR.cargas, HR.secciones, HR.reparto, HR.solic, HR.h201, HR.diag, HR.deriva, HR.resumen];
  L.hojas.sort((a, b) => (orden.indexOf(a.nombre) + 1 || 99) - (orden.indexOf(b.nombre) + 1 || 99));
  return { libro: L, claves };
}

/** los datos de la planilla renovada: la geometría (como la de la guía), los del 102, 101 y 201, y la cuantía necesaria de cada muro */
export function datosRenovada(p: Proyecto, piezas: PiezaEquivalente[], verif: VerifPieza201[], nivel: 'simple' | 'completa'): DatosRenovada {
  const rhoAdoptada = new Map<string, number>();
  for (const v of verif) {
    const vistos = new Map<string, number>();
    for (const m of v.muros) { const n = vistos.get(m.id) ?? 0; vistos.set(m.id, n + 1); rhoAdoptada.set(`${v.dir}|${v.nombre}|${m.id}|${n}`, m.rhoNecesaria); }
  }
  return { geo: datosGuia(p, piezas), c102: datos102De(p), c101: datos101De(p) as Required<DatosCirsoc101>, c201: datos201De(p), nivel, rhoAdoptada };
}
