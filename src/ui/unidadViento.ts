/**
 * Unidades de la velocidad en los túneles de viento.
 *
 * La simulación no conoce los km/h: trabaja con el viento que entra al túnel como 1 (por eso los rótulos viejos decían
 * «1,2 V»: 1,2 veces el viento que llega). Para leerla como un pronóstico, cada múltiplo se pasa a km/h o m/s con un
 * viento de referencia:
 *  - el de diseño del CIRSOC 102-25 a la altura del corte: v(z) = V · √(Kz · Kzt) (V a 10 m, ráfaga de 3 s), o
 *  - uno que elige el alumno (por ejemplo, un día ventoso de 40 km/h).
 * Como el flujo del túnel no cambia de forma con la velocidad (mismo Reynolds de la red), multiplicar es correcto: si
 * el aire que llega va a 40 km/h, donde la simulación dice 1,2 va a 48 km/h.
 */
import { elegirEspectroVel, espectroVel, type EspectroVel } from './campoSuave';
import { Kz } from '../engine/cargas/cirsoc102';
import { fmt } from './estado';
import { h } from './comp';
import { vientoCirsoc } from './cirsoc102';

export type UnidadVel = 'kmh' | 'ms' | 'veces';
export type RefVel = 'diseno' | 'propia';
const CLAVE = 'torre3d.unidadViento';

function leer(): { unidad: UnidadVel; ref: RefVel; kmh: number } {
  try {
    const x = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
    if (x && ['kmh', 'ms', 'veces'].includes(x.unidad) && ['diseno', 'propia'].includes(x.ref) && x.kmh > 0) return x;
  } catch { /* sin almacenamiento */ }
  return { unidad: 'kmh', ref: 'diseno', kmh: 40 };
}
/** la elección del alumno (se recuerda en este navegador) */
export const unidadViento = leer();
export function guardarUnidadViento() { try { localStorage.setItem(CLAVE, JSON.stringify(unidadViento)); } catch { /* sin almacenamiento */ } }

/** el viento de diseño del CIRSOC 102-25 a la altura z (m sobre PB), en m/s: V · √(Kz · Kzt); null sin datos */
export function vientoDisenoEn(z: number): number | null {
  try { const w = vientoCirsoc(); return w.V * Math.sqrt(Kz(z, w.exposicion) * w.Kzt); } catch { return null; }
}
/** el viento que llega al túnel (m/s), con la referencia elegida; z: altura del corte (m sobre PB) */
export function vientoQueLlega(z: number): number | null {
  return unidadViento.ref === 'propia' ? unidadViento.kmh / 3.6 : vientoDisenoEn(z);
}
/** de dónde sale el viento que llega, en palabras */
export function textoReferencia(z: number): string {
  const v = vientoQueLlega(z);
  if (v === null) return 'el viento que llega al túnel';
  return unidadViento.ref === 'propia' ? `un viento que llega a ${fmt(v * 3.6, 0)} km/h` : `el viento de diseño ${z < 5 ? 'cerca del suelo (el reglamento lo toma a 5 m)' : `a ${fmt(z, 0)} m de altura`}, ${fmt(v * 3.6, 0)} km/h (CIRSOC 102-25)`;
}

/** una velocidad (en veces el viento que llega) en la unidad elegida, corta: «48 km/h», «13 m/s» o «1,2 ×» */
export function txtVel(veces: number, ref: number | null): string {
  if (unidadViento.unidad === 'veces' || ref === null || !isFinite(ref)) return `${fmt(veces, veces < 1 && veces > 0 ? 2 : 1)} ×`;
  if (unidadViento.unidad === 'ms') return `${fmt(veces * ref, 0)} m/s`;
  return `${fmt(veces * ref * 3.6, 0)} km/h`;
}
/** cuánto más rápido (o más lento) que el viento que llega: «+20 %», «−35 %», «igual» */
export function txtPct(veces: number): string {
  const p = Math.round((veces - 1) * 100);
  return p === 0 ? 'igual' : `${p > 0 ? '+' : '−'}${Math.abs(p)} %`;
}
/** la velocidad con su comparación: «48 km/h (+20 % que el viento que llega)» */
export function txtVelLargo(veces: number, ref: number | null): string {
  if (unidadViento.unidad === 'veces' || ref === null) return `${fmt(veces, 2)} veces el viento que llega (${txtPct(veces)})`;
  return `${txtVel(veces, ref)} (${txtPct(veces)} que el viento que llega)`;
}
/** el nombre de la unidad, para encabezados y CSV */
export const nombreUnidad = (ref: number | null) => (unidadViento.unidad === 'veces' || ref === null ? 'veces el viento que llega' : unidadViento.unidad === 'ms' ? 'm/s' : 'km/h');
/** una velocidad (en veces) como número en la unidad elegida (para CSV y gráficos) */
export const enUnidad = (veces: number, ref: number | null) => (unidadViento.unidad === 'veces' || ref === null ? veces : unidadViento.unidad === 'ms' ? veces * ref : veces * ref * 3.6);

/** el selector para el panel: la unidad y el viento que llega (diseño o propio) */
export function controlUnidadViento(z: number, alCambiar: () => void): HTMLElement {
  const sel = (op: [string, string][], v: string, f: (x: string) => void) => {
    const s = document.createElement('select');
    op.forEach(([k, t]) => s.append(new Option(t, k, false, k === v)));
    s.addEventListener('change', () => { f(s.value); guardarUnidadViento(); alCambiar(); });
    return s;
  };
  const vd = vientoDisenoEn(z);
  const u = sel([['kmh', 'km/h (como el pronóstico)'], ['ms', 'm/s'], ['veces', 'veces el viento que llega']], unidadViento.unidad, x => { unidadViento.unidad = x as UnidadVel; });
  const r = sel([['diseno', `de diseño a esta altura${vd ? ` (${fmt(vd * 3.6, 0)} km/h)` : ''}`], ['propia', 'otro, en km/h']], unidadViento.ref, x => { unidadViento.ref = x as RefVel; });
  const caja = h('div', { class: 'unidad-viento' },
    h('label', { class: 'campo' }, h('span', {}, 'Velocidades en'), u),
    h('label', { class: 'campo' }, h('span', {}, 'Viento que llega'), r));
  if (unidadViento.ref === 'propia') {
    const inp = document.createElement('input'); inp.type = 'number'; inp.min = '1'; inp.max = '400'; inp.step = '5'; inp.value = String(unidadViento.kmh);
    inp.addEventListener('change', () => { const v = +inp.value; if (v > 0) { unidadViento.kmh = v; guardarUnidadViento(); alCambiar(); } });
    caja.append(h('label', { class: 'campo' }, h('span', {}, 'km/h'), inp));
  }
  // el espectro de la velocidad: el térmico de la app o el arcoíris de los programas comerciales
  const esp = sel([['termico', 'térmico: violeta a amarillo (el de la app)'], ['arcoiris', 'arcoíris: azul a rojo (como los programas comerciales)']], espectroVel, x => { elegirEspectroVel(x as EspectroVel); });
  caja.append(h('label', { class: 'campo' }, h('span', {}, 'Colores de la velocidad'), esp));
  if (espectroVel === 'arcoiris') caja.append(h('p', { class: 'nota chica' }, 'Con el arcoíris, el azul es aire lento y el rojo aire rápido: no son compresión y tracción como en el resto de la app. Las presiones (Cp) siguen con azul que empuja y rojo que succiona.'));
  caja.append(h('p', { class: 'nota chica' }, `La simulación mide todo en «veces el viento que llega» al túnel; acá se pasa a ${unidadViento.unidad === 'veces' ? 'esa misma escala (1 = igual que el viento que llega, 1,2 = 20 % más rápido)' : `${unidadViento.unidad === 'ms' ? 'm/s' : 'km/h'} con ${textoReferencia(z)}`}. Un 20 % más rápido es lo mismo con cualquier viento: cambia el número, no el dibujo.`));
  return caja;
}
