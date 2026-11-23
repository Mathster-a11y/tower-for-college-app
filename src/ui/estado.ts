import { envolverPiezas } from '../engine/grupos';
import { ejemploGuia, type Proyecto } from '../engine/modelo';
import { aPlanilla, type Asignacion } from '../engine/mapping';
import { calcularPlanilla, type PlanillaRes } from '../engine/planilla';
import { calcularCorregido, type ResultadoCorregido } from '../engine/correcciones';
import { controles, type Control } from '../engine/verificaciones';
import { protegerBloqueados, protegerFijos, sincronizarComponentes } from '../engine/grupos';
import { areasInfluencia } from '../engine/areas';
import { config, usarConfig } from '../engine/config';
import { leerProyecto, textoErrores } from '../engine/lector';
import { viento102, type Viento102 } from '../engine/cargas/cirsoc102';
import { calcularFem, type ResultadoMetodoFem } from '../engine/metodos/fem';
import { compararMetodos, type Comparacion } from '../engine/metodos/combinado';
import { controlesCirsoc, datosCirsoc, verificarDireccion201, type VerifPieza201 } from '../engine/metodos/cirsoc';
import { CONFIG_POR_DEFECTO, configDe, configMotor, VERSION_FORMULAS, type ConfigCalculo } from '../engine/metodos/tipos';
import { Historial } from './historial';
import { Guardado } from './guardado';
import { aplicarLofts } from '../engine/loft';
import { aplicarCarpinteria, aplicarPerfil } from '../engine/perfil_torre';
import { aplicarPlanosCorte } from '../engine/planos_corte';

/**
 * Hasta noviembre de 2026 el motor y el armado se recordaban en el navegador (no en el proyecto), y el mismo archivo
 * daba resultados distintos en cada computadora (hallazgo 5 del informe técnico). Ahora van dentro del proyecto; esta
 * clave solo se lee una vez, para que el proyecto guardado en este navegador siga con lo que el alumno venía viendo.
 */
const CLAVE_CONFIG_VIEJA = 'torre3d.config.v1';
const CLAVE_MODO = 'torre3d.modoCalculo';
function configViejaDelNavegador(): ConfigCalculo {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE_CONFIG_VIEJA) ?? '{}') as { motor?: string; metodo?: string };
    return { metodo: 'planilla', version: c.motor === 'nuevo' ? 'nuevo' : 'actual', armado: c.metodo === 'planilla' ? 'catedra' : 'app', verificacion: 'completa', teoria: 'timoshenko' };
  } catch { return { ...CONFIG_POR_DEFECTO }; }
}

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
  cirsoc?: { viento: Viento102; corr: ResultadoCorregido; verif: VerifPieza201[] };
  /** método FEM: modelo, modos, casos de carga resueltos y reparto (cirsoc lleva el viento con las frecuencias del modelo) */
  fem?: ResultadoMetodoFem;
  /** método Combinado: los cuatro métodos con la misma torre, comparados (las etapas muestran la Planilla virgen) */
  combinado?: Comparacion;
  /** el último cálculo falló: los resultados que quedan son los del último cálculo bueno (de la revisión «revision») */
  error?: string;
  /** revisión del proyecto con la que se calcularon estos resultados (ver Estado.revision) */
  revision: number;
}

const CLAVE = 'torre3d.proyecto.v1';

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
    const corrC = calcularCorregido(datosCirsoc(asig.datos, w), filaPB, { proyecto, piezas: asig.piezas });
    const esf = (d: 'A' | 'B') => (fem ? (n: string) => fem.esfuerzos(d, n) : undefined);
    const verif = [...verificarDireccion201(proyecto, asig.piezas, corrC.rotoA, 'A', w.A.QPB, w.A.MPB, w.B.B, w.B.QPB, esf('A')),
      ...verificarDireccion201(proyecto, asig.piezas, corrC.rotoB, 'B', w.B.QPB, w.B.MPB, w.A.B, w.A.QPB, esf('B'))];
    const base = controles(proyecto, asig.datos, res, corrC, proyecto.hormigon || 'H30', asig.piezas, asig.filaNivel);
    return { asig, res, corr, revision: 0, config: c, valores: corrC.guia, cirsoc: { viento: w, corr: corrC, verif }, fem,
      controles: controlesCirsoc(proyecto, base, corrC.guia, w, verif, asig.filaNivel, c.verificacion, { A: corrC.rotoA?.SJ ?? 0, B: corrC.rotoB?.SJ ?? 0 }, fem?.deriva) };
  }
  return { asig, res, corr, controles: controles(proyecto, asig.datos, res, corr, proyecto.hormigon || 'H30', asig.piezas, asig.filaNivel), revision: 0,
    config: c, valores: c.metodo === 'guia' ? corr.guia : res };
}
type Oyente = () => void;

/** nombre del grupo de una pieza armada: su tipo (núcleo, C, pórtico…) y su nombre */
const nombrePieza = (g: string, ms: import('../engine/modelo').Muro[]) => `${ms[0].pieza?.tipo ? `${ms[0].pieza.tipo[0].toUpperCase()}${ms[0].pieza.tipo.slice(1)} ` : 'Pieza '}${g}`;
class Estado {
  proyecto: Proyecto;
  dir: 'A' | 'B' = 'A';
  seleccion: string | null = null;
  /** «¿Qué pasa si…?»: el muro elegido con el cambio que se está probando (la planta lo dibuja en trazos) */
  fantasma: import('../engine/modelo').Muro | null = null;
  /** cómo se calcula el proyecto abierto (método, versión de la planilla, armado): sale del proyecto */
  get config(): ConfigCalculo { return configDe(this.proyecto); }
  /** de dónde salen los valores de fórmulas, indicadores y dibujos: la planilla tal cual o la guía (según el método) */
  get fuente(): 'planilla' | 'guia' { return this.config.metodo === 'guia' ? 'guia' : 'planilla'; }
  /** etapa y sub-paso a la vista */
  etapa = 'diseno';
  sub: Record<string, string> = {};
  /** capas de la vista 3D */
  capas = { losas: true, fachada: false, viento: true, fuera: true, deformada: false, espectro: true, exo: true, tensiones: false, presiones: false, casoViento: 1 as 1 | 2 | 3 | 4, corteViento: null as number | null };
  /** grilla de discretización de 0,05 m en la planta: se ve y los puntos se ajustan a ella (apagada: ajuste a 0,01 m) */
  grillaFina = false;
  /** planta: los muros que se encuentran se dibujan unidos (juntas limpias) o cada uno con su rectángulo */
  juntasLimpias = (() => { try { return localStorage.getItem('torre3d.juntas') !== '0'; } catch { return true; } })();
  /** rototraslación en 3D: exageración de la traslación y extra del giro (null = automáticas), torre sin deformar, animación y rótulos */
  roto3d: { exag: number | null; giro: number | null; original: boolean; animar: boolean; rotulos: boolean } = { exag: null, giro: null, original: true, animar: false, rotulos: true };
  /** plano para calcar en la planta (no se guarda en el proyecto): imagen, ancho real (m), centro (m) y opacidad */
  calco: { url: string; aspecto: number; ancho: number; x: number; y: number; opacidad: number } | null = null;
  /** plano calcado en el corte de la torre (alzado o corte del proyecto): x = borde izquierdo y z = borde de arriba, en m */
  calcoCorte: { url: string; aspecto: number; ancho: number; x: number; z: number; opacidad: number } | null = null;
  /** dibujo de CAD (DXF) de fondo en la planta: entidades en metros, capas (visible y uso) y nodos para el imán */
  cad: { archivo: string; unidad: string; omitidas: number; ents: import('../engine/cad').Entidad[]; capas: Record<string, { ver: boolean; uso: 'referencia' | 'muros' | 'losa' | 'carpintería' }>; nodos: { p: { x: number; y: number }; t: import('../engine/cad').TipoNodo; capa: string }[] } | null = null;
  /** grupo de dibujo que se está editando (null = la planta entera); el resto queda atenuado */
  contexto: string | null = null;
  /** grupo de dibujo elegido (al tocar un muro de un grupo se elige el grupo entero) */
  grupoSel: string | null = null;
  /** selección múltiple para agrupar: muros y grupos */
  multi: { m: string[]; g: string[] } = { m: [], g: [] };
  /** «Elegir varios» (para el lápiz y el dedo, que no tienen Mayúsculas): cada toque suma o saca de la selección */
  eligeVarios = false;
  /** último aviso de grupos (bloqueado, copias actualizadas) */
  avisoGrupos = '';
  /** pieza elegida en Flexión */
  piezaFlex: string | null = null;
  /** cota del nivel donde se verifican las fibras (null: PB, como la guía) */
  nivelFlex: number | null = null;
  /** con exoesqueleto: las fibras de los tabiques con el momento que les queda (true) o sin el exo, como la planilla */
  flexConExo = true;
  /** cota del nivel cuya planta se muestra (null = PB) */
  nivelPlanta: number | null = null;
  calculo!: Calculo;
  private oyentes: Oyente[] = [];
  /**
   * revisión del proyecto: sube con cada cambio de datos (editar, deshacer, abrir otro). Los resultados son «vigentes»
   * solo si se calcularon con la revisión actual y sin error (ver vigente)
   */
  revision = 0;
  /** el guardado automático en el navegador falló (y todavía no volvió a andar) */
  get guardadoFallo() { return this.guardado.fallo; }
  private readonly guardado = new Guardado(CLAVE);
  private readonly historial = new Historial();
  /** al arrancar: el proyecto guardado en el navegador estaba dañado (se abrió el ejemplo; el texto quedó aparte) */
  avisoInicio = '';

  constructor() {
    let p: Proyecto | null = null;
    let t: string | null = null;
    t = this.guardado.leer();
    if (t) {
      const l = leerProyecto(t);
      if (l.ok) {
        p = l.proyecto;
        if (l.avisos.length) this.avisoInicio = `Proyecto guardado reparado al abrir: ${l.avisos[0]}`;
        // guardado antes de que el método fuera parte del proyecto: sigue con lo que este navegador venía usando
        if (!p.calculo) p.calculo = { ...configViejaDelNavegador(), formulas: VERSION_FORMULAS };
      }
      else {
        // no se pisa: el texto dañado queda en otra clave para poder recuperarlo a mano
        this.guardado.guardarAparte(`${CLAVE}.danado`, t);
        this.avisoInicio = `El proyecto guardado en este navegador estaba dañado y se abrió el ejemplo (${textoErrores(l.errores)}). El texto original quedó guardado aparte.`;
      }
    }
    this.proyecto = p ?? ejemploGuia();
    const migrado = !this.proyecto.calculo || (!!p && !JSON.parse(t ?? '{}').calculo);
    if (!this.proyecto.calculo) this.proyecto.calculo = { ...configViejaDelNavegador(), formulas: VERSION_FORMULAS };
    this.recalcular();
    this.historial.actual = JSON.stringify(this.proyecto);
    // la migración se guarda enseguida (la vista previa, en otra pestaña, lee el proyecto guardado) y la preferencia
    // vieja del navegador ya no hace falta
    if (migrado && this.guardado.guardar(this.historial.actual)) this.guardado.quitar(CLAVE_CONFIG_VIEJA);
  }
  /** los resultados que se muestran corresponden al proyecto actual y el cálculo no falló */
  get vigente(): boolean { return !!this.calculo && !this.calculo.error && this.calculo.revision === this.revision; }
  /** avisa cuando el guardado automático en el navegador falla (true) o vuelve a andar (false) */
  suscribirGuardado(f: (fallo: boolean) => void) { this.guardado.suscribir(f); }
  suscribir(f: Oyente) { this.oyentes.push(f); }
  /** solo cambia el muro elegido: redibuja las vistas (planta, 3D) sin rearmar el panel */
  private oyentesSel: Oyente[] = [];
  suscribirSeleccion(f: Oyente) { this.oyentesSel.push(f); }
  elegir(id: string | null) { if (this.seleccion === id) return; this.seleccion = id; this.oyentesSel.forEach(o => o()); }
  avisarSeleccion() { this.oyentesSel.forEach(o => o()); }
  /** redibuja todo sin recalcular (cambió la vista, no los datos) */
  avisarPanel() { this.oyentes.forEach(o => o()); }
  /**
   * cambia el método, la versión de la planilla o el armado: es un cambio del proyecto (se guarda con él, se deshace y
   * viaja en el archivo). Se calcula enseguida, también en el modo con botón.
   */
  cambiarCalculo(c: Partial<ConfigCalculo>) {
    this.cambiar(p => { p.calculo = { ...configDe(p), ...c, formulas: VERSION_FORMULAS }; });
    if (this.pendiente) this.calcularAhora();
  }
  /**
   * Modo de cálculo: «vivo» recalcula todo y redibuja todas las vistas en cada cambio (como el Excel); «boton» solo
   * guarda el cambio y redibuja la planta y los paneles de datos: el cálculo, el 3D y los diagramas esperan al botón
   * «Calcular» (o F9). Se recuerda en el navegador.
   */
  modo: 'vivo' | 'boton' = (() => { try { return localStorage.getItem(CLAVE_MODO) === 'boton' ? 'boton' : 'vivo'; } catch { return 'vivo'; } })();
  /** en el modo con botón: hay cambios que todavía no se calcularon (y cuántos) */
  pendiente = false;
  cambiosPendientes = 0;
  cambiarModo(m: 'vivo' | 'boton') {
    this.modo = m;
    try { localStorage.setItem(CLAVE_MODO, m); } catch { /* sin almacenamiento */ }
    if (m === 'vivo' && this.pendiente) this.calcularAhora();
    else this.avisarPanel();
  }
  /** calcula con los datos actuales y redibuja todo (botón «Calcular», F9, cambio de motor o de método) */
  calcularAhora() {
    this.recalcular();
    this.pendiente = false;
    this.cambiosPendientes = 0;
    this.oyentes.forEach(o => o());
  }
  /** antes de exportar o imprimir: si hay cambios sin calcular, se calculan */
  asegurarCalculo() { if (this.pendiente) this.calcularAhora(); }
  recalcular() {
    // la configuración global del motor queda igual a la del proyecto activo: las funciones que la leen por defecto
    // (vistas, exportar a Sheets, dibujos) usan siempre la del proyecto, nunca una preferencia del navegador
    Object.assign(config, configMotor(this.config));
    try {
      this.calculo = { ...calcularProyecto(this.proyecto), revision: this.revision };
    } catch (e) {
      // se conservan los resultados del último cálculo bueno (con su revisión) para que las vistas no se rompan,
      // pero quedan marcados: no son vigentes y no se exportan
      this.calculo = { ...(this.calculo ?? {}), error: e instanceof Error ? e.message : String(e), revision: this.calculo?.revision ?? -1 } as Calculo;
    }
  }
  /** cambia el proyecto, recalcula, guarda en el navegador y avisa a las vistas */
  cambiar(f?: (p: Proyecto) => void) {
    if (f) f(this.proyecto);
    // grupos: lo bloqueado no cambia y las copias vinculadas siguen a la que se editó
    if (this.proyecto.grupos?.length) {
      const previo = this.historial.actual ? JSON.parse(this.historial.actual) as Proyecto : null;
      const n = protegerBloqueados(previo, this.proyecto);
      const nf = protegerFijos(previo, this.proyecto);
      const hechos = sincronizarComponentes(previo, this.proyecto);
      this.avisoGrupos = n ? `${n === 1 ? 'Un muro está bloqueado' : `${n} muros están bloqueados`}: no se modificó. Desbloquealo en el Esquema.`
        : nf ? `${nf === 1 ? 'Un muro está' : `${nf} muros están`} en un grupo fijo en su lugar 📌: no se movió. Soltalo en el Esquema para moverlo.`
        : hechos.length ? `Copias vinculadas actualizadas: ${hechos.join(', ')}.` : '';
      if (this.avisoGrupos) { const e = typeof document !== 'undefined' ? document.getElementById('mensaje') : null; if (e) e.textContent = this.avisoGrupos; }
    }
    // lofts de losas: las siluetas intermedias siguen a las losas sección
    // perfil de la torre, después los lofts (mandan sobre los niveles que generan) y la carpintería que sigue a la losa
    if (this.proyecto.perfilTorre) aplicarPerfil(this.proyecto);
    if (this.proyecto.lofts?.length) aplicarLofts(this.proyecto);
    if (this.proyecto.planosCorte?.length) aplicarPlanosCorte(this.proyecto);
    if (this.proyecto.carpinteriaRetiro !== null && this.proyecto.carpinteriaRetiro !== undefined) aplicarCarpinteria(this.proyecto);
    // áreas de influencia al día (si se eligió un nivel tipo): se copian solas a «Área inf.»
    const pa = this.proyecto;
    if (pa.areasAuto !== undefined && pa.areasAuto !== null) {
      const i = pa.niveles.findIndex(n => Math.abs(n.cota - pa.areasAuto!) < 1e-6);
      if (i >= 0) { const a = areasInfluencia(pa, i); pa.muros.forEach(m => { if (m.id in a.area && Math.abs(m.areaInf - a.area[m.id]) > 1e-9) m.areaInf = a.area[m.id]; }); }
    }
    const nuevo = JSON.stringify(this.proyecto);
    const cambio = this.historial.registrar(nuevo);
    if (cambio) this.revision++;
    this.actualizar(cambio);
  }
  /** @param cambio cambiaron los datos del proyecto (cambiar de viento o de vista no cuenta como cambio pendiente) */
  private actualizar(cambio = true) {
    if (this.modo === 'vivo') { this.recalcular(); this.pendiente = false; this.cambiosPendientes = 0; }
    else if (cambio) { this.pendiente = true; this.cambiosPendientes++; }
    this.guardar();
    this.oyentes.forEach(o => o());
  }
  /** guarda el proyecto en el navegador; si falla, avisa (una vez, hasta que vuelva a andar) */
  private guardar() { this.guardado.guardar(this.historial.actual); }
  get puedeDeshacer() { return this.historial.puedeDeshacer; }
  get puedeRehacer() { return this.historial.puedeRehacer; }
  deshacer() { this.restaurar(this.historial.deshacer()); }
  rehacer() { this.restaurar(this.historial.rehacer()); }
  private restaurar(t: string | undefined) {
    if (t === undefined) return;
    this.revision++;
    this.proyecto = JSON.parse(t) as Proyecto;
    if (this.seleccion && !this.proyecto.muros.some(m => m.id === this.seleccion)) this.seleccion = null;
    this.limpiarGrupos();
    this.actualizar();
  }
  /**
   * otro proyecto (ejemplo, archivo abierto, Sheets, «Mis proyectos»): pasa por el lector único; si no es válido tira un
   * error con lo que está mal y el proyecto abierto queda como estaba. Se calcula siempre, también en el modo con botón.
   * Devuelve los avisos de las reparaciones.
   */
  reemplazar(p: unknown): string[] {
    const l = leerProyecto(p);
    if (!l.ok) throw new Error(textoErrores(l.errores));
    const nuevo = l.proyecto;
    // sin configuración de cálculo: la de siempre, escrita en el proyecto para que el archivo quede completo
    if (!nuevo.calculo) nuevo.calculo = { ...CONFIG_POR_DEFECTO, formulas: VERSION_FORMULAS };
    envolverPiezas(nuevo, nombrePieza);          // sobre la copia: si falla, no se tocó nada
    this.proyecto = nuevo;
    this.seleccion = null; this.contexto = null; this.grupoSel = null; this.multi = { m: [], g: [] };
    this.revision++;
    this.cambiar();
    if (this.pendiente) this.calcularAhora();
    return l.avisos;
  }
  /** saca de la selección y del contexto los grupos que ya no existen */
  limpiarGrupos() {
    const ids = new Set((this.proyecto.grupos ?? []).map(g => g.id));
    if (this.contexto && !ids.has(this.contexto)) this.contexto = null;
    if (this.grupoSel && !ids.has(this.grupoSel)) this.grupoSel = null;
    this.multi = { m: this.multi.m.filter(id => this.proyecto.muros.some(x => x.id === id)), g: this.multi.g.filter(id => ids.has(id)) };
  }
}

export const estado = new Estado();

export const COLORES: Record<string, string> = {
  alma: '#FFFF00', 'alma der.': '#FFCC99', 'ala sup.': '#00FF00', 'ala inf.': '#00CCFF', columna: '#FF4040',
  tubo: '#B07CFF', perfil: '#5EC8B4', 'fuera del cálculo': '#B8B8B8', 'sin pieza': '#FFFFFF',
};
/** número en castellano con signo menos verdadero (−) y sin «−0» */
export const fmt = (x: number | null | undefined, d = 2) => {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  if (!isFinite(x)) return '∞';
  const r = Math.abs(x) < 0.5 * 10 ** -d ? 0 : x;
  return r.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−');
};
