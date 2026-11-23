/**
 * Niveles de fidelidad de los túneles de viento: un solo selector que arma la resolución, las paredes, el canal y el
 * motor, de «básica» (cualquier computadora) a «máxima» (placa de video potente). La elección se recuerda en este
 * navegador; cada túnel aplica su parte (el 2D y el 3D) y, si después se cambia una opción suelta, queda «a medida».
 */
export type Fidelidad = 'basica' | 'intermedia' | 'alta' | 'maxima';
export interface Opciones2D { res: string; paredes: 'exactas' | 'escalera'; canal: 'ancho' | 'angosto' }
export interface Opciones3D { motor: 'placa' | 'procesador'; tam: string; paredes: 'exactas' | 'escalera' }

export const FIDELIDAD: Record<Fidelidad, { nombre: string; para: string; d2: Opciones2D; d3: Opciones3D }> = {
  basica: { nombre: 'básica', para: 'cualquier computadora, también sin placa de video: para ver cómo se mueve el aire',
    d2: { res: 'rapida', paredes: 'escalera', canal: 'angosto' }, d3: { motor: 'procesador', tam: 'rapida', paredes: 'escalera' } },
  intermedia: { nombre: 'intermedia', para: 'una notebook común: tendencias confiables, comparar plantas y esquinas',
    d2: { res: 'normal', paredes: 'exactas', canal: 'ancho' }, d3: { motor: 'placa', tam: 'rapida', paredes: 'exactas' } },
  alta: { nombre: 'alta', para: 'una computadora con placa de video: Cp y arrastre más cerca de los ensayos',
    d2: { res: 'fina', paredes: 'exactas', canal: 'ancho' }, d3: { motor: 'placa', tam: 'liviano', paredes: 'exactas' } },
  maxima: { nombre: 'máxima', para: 'una placa de video potente; para más, la ventana de detalle o exportar el caso a OpenFOAM',
    d2: { res: 'fina', paredes: 'exactas', canal: 'ancho' }, d3: { motor: 'placa', tam: 'fino', paredes: 'exactas' } },
};
export const ORDEN_FIDELIDAD: Fidelidad[] = ['basica', 'intermedia', 'alta', 'maxima'];

/** la que conviene para esta computadora (núcleos, memoria y si hay WebGPU); «máxima» nunca se elige sola */
export function fidelidadRecomendada(hayPlaca: boolean | null): Fidelidad {
  const nucleos = navigator.hardwareConcurrency || 2;
  const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (!hayPlaca) return nucleos >= 8 && memoria >= 8 ? 'intermedia' : 'basica';
  return nucleos >= 8 && memoria >= 8 ? 'alta' : 'intermedia';
}

const CLAVE = 'torre3d.fidelidad';
/** la elegida por el alumno (null: ninguna todavía, quedan las opciones de siempre) */
export function fidelidadGuardada(): Fidelidad | null {
  try { const v = localStorage.getItem(CLAVE); return v && v in FIDELIDAD ? (v as Fidelidad) : null; } catch { return null; }
}
export function guardarFidelidad(f: Fidelidad) { try { localStorage.setItem(CLAVE, f); } catch { /* sin almacenamiento */ } }

/** el nivel que corresponde a unas opciones (null: a medida) */
export function nivelDe2D(o: Opciones2D, ventana: boolean): Fidelidad | null {
  const k = ORDEN_FIDELIDAD.filter(f => { const d = FIDELIDAD[f].d2; return d.res === o.res && d.paredes === o.paredes && d.canal === o.canal; });
  // alta y máxima son iguales en el 2D salvo la ventana de detalle
  if (k.includes('alta') && k.includes('maxima')) return ventana ? 'maxima' : 'alta';
  return k[0] ?? null;
}
export function nivelDe3D(o: Opciones3D): Fidelidad | null {
  return ORDEN_FIDELIDAD.find(f => { const d = FIDELIDAD[f].d3; return d.motor === o.motor && (o.motor === 'procesador' || d.tam === o.tam) && d.paredes === o.paredes; }) ?? null;
}
