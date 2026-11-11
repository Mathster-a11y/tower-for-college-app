import { ejemploGuia, normalizarProyecto, type Proyecto } from '../engine/modelo';
import { aPlanilla, type Asignacion } from '../engine/mapping';
import { calcularPlanilla, type PlanillaRes } from '../engine/planilla';
import { calcularCorregido, type ResultadoCorregido } from '../engine/correcciones';
import { controles, type Control } from '../engine/verificaciones';

export interface Calculo { asig: Asignacion; res: PlanillaRes; corr: ResultadoCorregido; controles: Control[]; error?: string; }

const CLAVE = 'torre3d.proyecto.v1';
type Oyente = () => void;

class Estado {
  proyecto: Proyecto;
  dir: 'A' | 'B' = 'A';
  seleccion: string | null = null;
  /** de dónde salen los valores de fórmulas, indicadores y dibujos: la planilla original o la corregida (guía/CIRSOC) */
  fuente: 'planilla' | 'guia' = 'guia';
  /** etapa y sub-paso a la vista */
  etapa = 'diseno';
  sub: Record<string, string> = {};
  /** capas de la vista 3D */
  capas = { losas: true, viento: true, fuera: true };
  /** pieza elegida en Flexión */
  piezaFlex: string | null = null;
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
  recalcular() {
    try {
      const asig = aPlanilla(this.proyecto);
      const res = calcularPlanilla(asig.datos);
      const iPB = this.proyecto.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
      const corr = calcularCorregido(asig.datos, asig.filaNivel[iPB] ?? 50);
      this.calculo = { asig, res, corr, controles: controles(this.proyecto, asig.datos, res, corr, this.proyecto.hormigon || 'H30', asig.piezas, asig.filaNivel) };
    } catch (e) {
      this.calculo = { ...(this.calculo ?? {}), error: String(e) } as Calculo;
    }
  }
  /** cambia el proyecto, recalcula, guarda en el navegador y avisa a las vistas */
  cambiar(f?: (p: Proyecto) => void) {
    if (f) f(this.proyecto);
    const nuevo = JSON.stringify(this.proyecto);
    if (nuevo !== this.ultimo) {
      this.atras.push(this.ultimo);
      if (this.atras.length > 100) this.atras.shift();
      this.adelante = [];
      this.ultimo = nuevo;
    }
    this.actualizar();
  }
  private actualizar() {
    this.recalcular();
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
    this.actualizar();
  }
  reemplazar(p: Proyecto) { this.proyecto = normalizarProyecto(p); this.seleccion = null; this.cambiar(); }
}

export const estado = new Estado();

export const COLORES: Record<string, string> = {
  alma: '#FFFF00', 'ala sup.': '#00FF00', 'ala inf.': '#00CCFF', columna: '#FF4040',
  tubo: '#B07CFF', 'fuera del cálculo': '#B8B8B8', 'sin pieza': '#FFFFFF',
};
/** número en castellano con signo menos verdadero (−) y sin «−0» */
export const fmt = (x: number | null | undefined, d = 2) => {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  if (!isFinite(x)) return '∞';
  const r = Math.abs(x) < 0.5 * 10 ** -d ? 0 : x;
  return r.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−');
};
