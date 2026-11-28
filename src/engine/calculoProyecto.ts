/**
 * El cálculo de un proyecto con su método, sin nada de la interfaz: lo usan el estado de la app (en el momento o en
 * segundo plano, en un worker) y las pruebas. El resultado es solo datos (se puede copiar entre hilos).
 */
import { exoConViento } from './exoReglamento';
import type { Proyecto } from './modelo';
import { aPlanilla, type Asignacion } from './mapping';
import { calcularPlanilla, type PlanillaRes } from './planilla';
import { calcularCorregido, type ResultadoCorregido } from './correcciones';
import { controles, type Control } from './verificaciones';
import { config, usarConfig } from './config';
import { viento102, type Viento102 } from './cargas/cirsoc102';
import { calcularFem, esfuerzosFem, torsorFem, type ResultadoMetodoFem } from './metodos/fem';
import { nucleosCerrados } from './torsionNucleos';
import { compararMetodos, type Comparacion } from './metodos/combinado';
import { controlesCirsoc, datosCirsoc, verificarDireccion201, type VerifPieza201 } from './metodos/cirsoc';
import { configDe, configMotor, type ConfigCalculo } from './metodos/tipos';

/**
 * Resultado de calcular un proyecto con su método. Las vistas leen «valores» (los del método elegido) y no deciden
 * por su cuenta entre la planilla y la guía; «res» y «corr» quedan para comparar los dos.
 */
export interface Calculo {
  asig: Asignacion; res: PlanillaRes; corr: ResultadoCorregido; controles: Control[];
  /** configuración con la que se calculó (método, versión de la planilla, armado) */
  config: ConfigCalculo;
  /** los valores del método: la planilla tal cual (Planilla virgen), la guía, o el CIRSOC (planilla con el viento del 102-25) */
  valores: PlanillaRes;
  /** método CIRSOC: viento del 102-25, cálculo con ese viento y verificación del 201 de cada pieza */
  cirsoc?: { viento: Viento102; corr: ResultadoCorregido; verif: VerifPieza201[]; /** el exo en el cálculo (con el viento del 102-25) */ exo?: Record<'A' | 'B', import('./exoReglamento').ExoDireccion> | null };
  /** método FEM: modelo, modos, casos de carga resueltos y reparto (cirsoc lleva el viento con las frecuencias del modelo) */
  fem?: ResultadoMetodoFem;
  /** método Combinado: los cuatro métodos con la misma torre, comparados (las etapas muestran la Planilla virgen) */
  combinado?: Comparacion;
  /** el último cálculo falló: los resultados que quedan son los del último cálculo bueno (de la revisión «revision») */
  error?: string;
  /** cálculo hecho en el worker: lo que ya calculó del exo (la torre con el exo y sus barras; ya trae sus controles),
   *  para que la etapa 08 y el riel no lo repitan */
  exoHecho?: import('./exoDeCalculo').SemillaExo;
  /** revisión del proyecto con la que se calcularon estos resultados (ver Estado.revision) */
  revision: number;
}


/**
 * todo el cálculo de un proyecto (planilla, corregido y controles), con la configuración guardada EN el proyecto
 * (no la del navegador). No cambia la configuración global: sirve también para calcular otra versión (comparar).
 */
export function calcularProyecto(proyecto: Proyecto): Calculo {
  const c = configDe(proyecto);
  return usarConfig(configMotor(c), () => calcularConConfig(proyecto, c));
}
function calcularConConfig(proyecto: Proyecto, c: ConfigCalculo): Calculo {
  if (c.metodo === 'combinado') {
    const base = calcularConConfig(proyecto, { ...c, metodo: 'planilla' });
    return { ...base, config: c, combinado: compararMetodos(proyecto, calcularProyecto) };
  }
  // CIRSOC y FEM no se escriben en la planilla: la tabla de los niveles crece con la torre (más de 49 niveles sobre PB)
  if ((c.metodo === 'cirsoc' || c.metodo === 'fem') && !config.filasLibres) return usarConfig({ filasLibres: true }, () => calcularConConfig(proyecto, c));
  const asig = aPlanilla(proyecto);
  const res = calcularPlanilla(asig.datos);
  const iPB = proyecto.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const filaPB = asig.filaNivel[iPB] ?? 50;
  const corr = calcularCorregido(asig.datos, filaPB, { proyecto, piezas: asig.piezas });
  if (c.metodo === 'cirsoc' || c.metodo === 'fem') {
    // método CIRSOC: el motor de la planilla con el viento del 102-25, el reparto de la guía y el hormigón del 201.
    // método FEM: lo mismo, pero la frecuencia sale del análisis modal y el reparto de los casos de carga, del modelo.
    const fem = c.metodo === 'fem' ? calcularFem(proyecto, c.teoria) : undefined;
    const w = fem?.viento ?? viento102(proyecto);
    // los núcleos cerrados frenan el giro por sí mismos (Bredt): solo en CIRSOC y FEM, la Guía sigue como la cátedra
    const corrC = calcularCorregido(datosCirsoc(asig.datos, w), filaPB, { proyecto, piezas: asig.piezas, nucleos: nucleosCerrados(proyecto) });
    // con exoesqueleto: los tabiques toman solo su parte del viento (y la deriva es la de la torre con el exo)
    const SJ = { A: corrC.rotoA?.SJ ?? 0, B: corrC.rotoB?.SJ ?? 0 };
    const ex = exoConViento(proyecto, corrC.guia, asig.piezas, asig.filaNivel, w, SJ);
    const fM = (d: 'A' | 'B') => ex?.[d].fM ?? 1, fV = (d: 'A' | 'B') => ex?.[d].fV ?? 1;
    const esf = (d: 'A' | 'B') => (fem ? (n: string) => esfuerzosFem(fem, d, n)?.map(x => ({ M: x.M * fM(d), V: x.V * fV(d) })) ?? null : undefined);
    const tor = (d: 'A' | 'B') => (fem ? (n: string) => torsorFem(fem, d, n)?.map(T => T * fV(d)) ?? null : undefined);
    const verif = [...verificarDireccion201(proyecto, asig.piezas, corrC.rotoA, 'A', w.A.QPB * fV('A'), w.A.MPB * fM('A'), w.B.B, w.B.QPB * fV('B'), esf('A'), tor('A')),
      ...verificarDireccion201(proyecto, asig.piezas, corrC.rotoB, 'B', w.B.QPB * fV('B'), w.B.MPB * fM('B'), w.A.B, w.A.QPB * fV('A'), esf('B'), tor('B'))];
    const base = controles(proyecto, asig.datos, res, corrC, proyecto.hormigon || 'H30', asig.piezas, asig.filaNivel, ex);
    return { asig, res, corr, revision: 0, config: c, valores: corrC.guia, cirsoc: { viento: w, corr: corrC, verif, exo: ex }, fem,
      controles: controlesCirsoc(proyecto, base, corrC.guia, w, verif, asig.filaNivel, c.verificacion, SJ, fem?.deriva, ex ?? undefined) };
  }
  return { asig, res, corr, controles: controles(proyecto, asig.datos, res, corr, proyecto.hormigon || 'H30', asig.piezas, asig.filaNivel), revision: 0,
    config: c, valores: c.metodo === 'guia' ? corr.guia : res };
}
