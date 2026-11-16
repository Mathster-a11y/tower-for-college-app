import { envolverPiezas } from '../engine/grupos';
import { ejemploGuia, normalizarProyecto, type Proyecto } from '../engine/modelo';
import { aPlanilla, type Asignacion } from '../engine/mapping';
import { calcularPlanilla, type PlanillaRes } from '../engine/planilla';
import { calcularCorregido, type ResultadoCorregido } from '../engine/correcciones';
import { controles, type Control } from '../engine/verificaciones';
import { protegerBloqueados, protegerFijos, sincronizarComponentes } from '../engine/grupos';
import { areasInfluencia } from '../engine/areas';
import { config, type Metodo, type Motor } from '../engine/config';

// motor y método elegidos (se recuerdan en el navegador); el motor nuevo es el de la planilla de la cátedra 2025
const CLAVE_CONFIG = 'torre3d.config.v1';
const CLAVE_MODO = 'torre3d.modoCalculo';
try {
  const c = JSON.parse(localStorage.getItem(CLAVE_CONFIG) ?? '{}') as { motor?: Motor; metodo?: Metodo };
  if (c.motor === 'actual' || c.motor === 'nuevo') config.motor = c.motor;
  if (c.metodo === 'app' || c.metodo === 'planilla') config.metodo = c.metodo;
} catch { /* sin almacenamiento: quedan los valores por defecto */ }

export interface Calculo { asig: Asignacion; res: PlanillaRes; corr: ResultadoCorregido; controles: Control[]; error?: string; }

const CLAVE = 'torre3d.proyecto.v1';

/** todo el cálculo de un proyecto (planilla, corregido y controles) */
export function calcularProyecto(proyecto: Proyecto): Calculo {
  const asig = aPlanilla(proyecto);
  const res = calcularPlanilla(asig.datos);
  const iPB = proyecto.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const corr = calcularCorregido(asig.datos, asig.filaNivel[iPB] ?? 50, { proyecto, piezas: asig.piezas });
  return { asig, res, corr, controles: controles(proyecto, asig.datos, res, corr, proyecto.hormigon || 'H30', asig.piezas, asig.filaNivel) };
}
type Oyente = () => void;

/** nombre del grupo de una pieza armada: su tipo (núcleo, C, pórtico…) y su nombre */
const nombrePieza = (g: string, ms: import('../engine/modelo').Muro[]) => `${ms[0].pieza?.tipo ? `${ms[0].pieza.tipo[0].toUpperCase()}${ms[0].pieza.tipo.slice(1)} ` : 'Pieza '}${g}`;
class Estado {
  proyecto: Proyecto;
  dir: 'A' | 'B' = 'A';
  seleccion: string | null = null;
  /** de dónde salen los valores de fórmulas, indicadores y dibujos: la planilla original o la corregida (guía/CIRSOC) */
  fuente: 'planilla' | 'guia' = 'planilla';
  /** etapa y sub-paso a la vista */
  etapa = 'diseno';
  sub: Record<string, string> = {};
  /** capas de la vista 3D */
  capas = { losas: true, viento: true, fuera: true, deformada: false, espectro: true, exo: true, tensiones: false };
  /** grilla de discretización de 0,05 m en la planta: se ve y los puntos se ajustan a ella (apagada: ajuste a 0,01 m) */
  grillaFina = false;
  /** planta: los muros que se encuentran se dibujan unidos (juntas limpias) o cada uno con su rectángulo */
  juntasLimpias = (() => { try { return localStorage.getItem('torre3d.juntas') !== '0'; } catch { return true; } })();
  /** rototraslación en 3D: exageración de la traslación y extra del giro (null = automáticas), torre sin deformar, animación y rótulos */
  roto3d: { exag: number | null; giro: number | null; original: boolean; animar: boolean; rotulos: boolean } = { exag: null, giro: null, original: true, animar: false, rotulos: true };
  /** plano para calcar en la planta (no se guarda en el proyecto): imagen, ancho real (m), centro (m) y opacidad */
  calco: { url: string; aspecto: number; ancho: number; x: number; y: number; opacidad: number } | null = null;
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
  /** historia para deshacer / rehacer (proyectos como JSON) */
  private atras: string[] = [];
  private adelante: string[] = [];
  private ultimo = '';

  constructor() {
    let p: Proyecto | null = null;
    try { const t = localStorage.getItem(CLAVE); if (t) p = JSON.parse(t) as Proyecto; } catch { p = null; }
    this.proyecto = p && p.version === 1 ? normalizarProyecto(p) : ejemploGuia();
    this.recalcular();
    this.ultimo = JSON.stringify(this.proyecto);
  }
  suscribir(f: Oyente) { this.oyentes.push(f); }
  /** solo cambia el muro elegido: redibuja las vistas (planta, 3D) sin rearmar el panel */
  private oyentesSel: Oyente[] = [];
  suscribirSeleccion(f: Oyente) { this.oyentesSel.push(f); }
  elegir(id: string | null) { if (this.seleccion === id) return; this.seleccion = id; this.oyentesSel.forEach(o => o()); }
  avisarSeleccion() { this.oyentesSel.forEach(o => o()); }
  /** redibuja todo sin recalcular (cambió la vista, no los datos) */
  avisarPanel() { this.oyentes.forEach(o => o()); }
  /** cambia el motor de cálculo o el método de armado de piezas, recalcula y redibuja */
  cambiarConfig(c: { motor?: Motor; metodo?: Metodo }) {
    Object.assign(config, c);
    try { localStorage.setItem(CLAVE_CONFIG, JSON.stringify(config)); } catch { /* sin almacenamiento */ }
    this.calcularAhora();
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
    try {
      this.calculo = calcularProyecto(this.proyecto);
    } catch (e) {
      this.calculo = { ...(this.calculo ?? {}), error: String(e) } as Calculo;
    }
  }
  /** cambia el proyecto, recalcula, guarda en el navegador y avisa a las vistas */
  cambiar(f?: (p: Proyecto) => void) {
    if (f) f(this.proyecto);
    // grupos: lo bloqueado no cambia y las copias vinculadas siguen a la que se editó
    if (this.proyecto.grupos?.length) {
      const previo = this.ultimo ? JSON.parse(this.ultimo) as Proyecto : null;
      const n = protegerBloqueados(previo, this.proyecto);
      const nf = protegerFijos(previo, this.proyecto);
      const hechos = sincronizarComponentes(previo, this.proyecto);
      this.avisoGrupos = n ? `${n === 1 ? 'Un muro está bloqueado' : `${n} muros están bloqueados`}: no se modificó. Desbloquealo en el Esquema.`
        : nf ? `${nf === 1 ? 'Un muro está' : `${nf} muros están`} en un grupo fijo en su lugar 📌: no se movió. Soltalo en el Esquema para moverlo.`
        : hechos.length ? `Copias vinculadas actualizadas: ${hechos.join(', ')}.` : '';
      if (this.avisoGrupos) { const e = typeof document !== 'undefined' ? document.getElementById('mensaje') : null; if (e) e.textContent = this.avisoGrupos; }
    }
    // áreas de influencia al día (si se eligió un nivel tipo): se copian solas a «Área inf.»
    const pa = this.proyecto;
    if (pa.areasAuto !== undefined && pa.areasAuto !== null) {
      const i = pa.niveles.findIndex(n => Math.abs(n.cota - pa.areasAuto!) < 1e-6);
      if (i >= 0) { const a = areasInfluencia(pa, i); pa.muros.forEach(m => { if (m.id in a.area && Math.abs(m.areaInf - a.area[m.id]) > 1e-9) m.areaInf = a.area[m.id]; }); }
    }
    const nuevo = JSON.stringify(this.proyecto);
    const cambio = nuevo !== this.ultimo;
    if (cambio) {
      this.atras.push(this.ultimo);
      if (this.atras.length > 100) this.atras.shift();
      this.adelante = [];
      this.ultimo = nuevo;
    }
    this.actualizar(cambio);
  }
  /** @param cambio cambiaron los datos del proyecto (cambiar de viento o de vista no cuenta como cambio pendiente) */
  private actualizar(cambio = true) {
    if (this.modo === 'vivo') { this.recalcular(); this.pendiente = false; this.cambiosPendientes = 0; }
    else if (cambio) { this.pendiente = true; this.cambiosPendientes++; }
    try { localStorage.setItem(CLAVE, this.ultimo); } catch { /* sin almacenamiento: no pasa nada */ }
    this.oyentes.forEach(o => o());
  }
  get puedeDeshacer() { return this.atras.length > 0; }
  get puedeRehacer() { return this.adelante.length > 0; }
  deshacer() { this.mover(this.atras, this.adelante); }
  rehacer() { this.mover(this.adelante, this.atras); }
  private mover(de: string[], a: string[]) {
    const t = de.pop();
    if (t === undefined) return;
    a.push(this.ultimo);
    this.ultimo = t;
    this.proyecto = JSON.parse(t) as Proyecto;
    if (this.seleccion && !this.proyecto.muros.some(m => m.id === this.seleccion)) this.seleccion = null;
    this.limpiarGrupos();
    this.actualizar();
  }
  /** otro proyecto (ejemplo, archivo abierto): se calcula siempre, también en el modo con botón */
  reemplazar(p: Proyecto) { this.proyecto = normalizarProyecto(p); envolverPiezas(this.proyecto, nombrePieza); this.seleccion = null; this.contexto = null; this.grupoSel = null; this.multi = { m: [], g: [] }; this.cambiar(); if (this.pendiente) this.calcularAhora(); }
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
