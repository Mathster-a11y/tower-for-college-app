import { ejemploGuia, type Proyecto } from '../engine/modelo';
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
  calculo!: Calculo;
  private oyentes: Oyente[] = [];

  constructor() {
    let p: Proyecto | null = null;
    try { const t = localStorage.getItem(CLAVE); if (t) p = JSON.parse(t) as Proyecto; } catch { p = null; }
    this.proyecto = p && p.version === 1 ? { ...p, hormigon: p.hormigon || 'H30' } : ejemploGuia();
    this.recalcular();
  }
  suscribir(f: Oyente) { this.oyentes.push(f); }
  recalcular() {
    try {
      const asig = aPlanilla(this.proyecto);
      const res = calcularPlanilla(asig.datos);
      const iPB = this.proyecto.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
      const corr = calcularCorregido(asig.datos, asig.filaNivel[iPB] ?? 50);
      this.calculo = { asig, res, corr, controles: controles(this.proyecto, asig.datos, res, corr, this.proyecto.hormigon || 'H30') };
    } catch (e) {
      this.calculo = { ...(this.calculo ?? {}), error: String(e) } as Calculo;
    }
  }
  /** cambia el proyecto, recalcula, guarda en el navegador y avisa a las vistas */
  cambiar(f?: (p: Proyecto) => void) {
    if (f) f(this.proyecto);
    this.recalcular();
    try { localStorage.setItem(CLAVE, JSON.stringify(this.proyecto)); } catch { /* sin almacenamiento: no pasa nada */ }
    this.oyentes.forEach(o => o());
  }
  reemplazar(p: Proyecto) { this.proyecto = { ...p, hormigon: p.hormigon || 'H30' }; this.seleccion = null; this.cambiar(); }
}

export const estado = new Estado();

export const COLORES: Record<string, string> = {
  alma: '#FFFF00', 'ala sup.': '#00FF00', 'ala inf.': '#00CCFF', columna: '#FF4040',
  'fuera del cálculo': '#B8B8B8', 'sin pieza': '#FFFFFF',
};
export const fmt = (x: number | null | undefined, d = 2) =>
  x === null || x === undefined || Number.isNaN(x) ? '—' : !isFinite(x) ? '∞' : x.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
