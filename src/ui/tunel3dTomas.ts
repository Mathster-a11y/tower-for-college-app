/**
 * Túnel 3D: la lista de tomas para grabar en fila y exportar juntas («Exportar simulaciones»). Cada toma dice qué se
 * simula (la definición de la geometría, las paredes, el giro, la banda), qué se ve (cortes, flechas, líneas, tubos,
 * partículas, remolinos, espectro, maqueta…), desde dónde (la cámara, con zoom) y cómo se graba (recorrido, duración y
 * llaves). Lo que se simula vuelve a arrancar la simulación solo si cambia; lo que se ve, no.
 * La lista se guarda en este navegador.
 */
import type { NombreCamara, Recorrido } from './tunel3dVista';

export interface SimToma {
  /** grilla: la definición de la geometría (las de TAM; 'procesador' si el motor es el procesador) */
  tam: string; paredes: 'exactas' | 'planta' | 'escalera'; angulo: number; lento: boolean; ajustado: boolean;
  banda: boolean; bandaCota: number; bandaPisos: number;
}
export interface VistaToma {
  maqueta: boolean; torreCp: boolean; suelo: boolean;
  lineas: 'no' | 'lineas' | 'tubos'; colorLineas: 'velocidad' | 'uno'; particulas: boolean;
  vortices: boolean; umbralQ: number;
  flechas: 'no' | 'fijas' | 'proporcionales';
  /** cantidad de flechas: veces las de siempre (con más, trazo más fino) */
  densidadFlechas: number;
  /** grosor de los tubos (veces el de base) */
  grosorLineas: number;
  horizontal: boolean; vertical: boolean; zRel: number; yRel: number;
  color: 'velocidad' | 'cp'; espectro: 'termico' | 'arcoiris' | 'grises'; escalaVel: 'fija' | 'auto';
  rastrillo: 'grilla' | 'vertical' | 'horizontal'; verRastrillo: boolean; rastN: number;
  vereda: boolean; lawson: boolean;
}
export type DondeLlaves = 'costado' | 'encima' | 'no';
export interface Toma {
  id: string; nombre: string; activa: boolean;
  sim: SimToma; vista: VistaToma;
  /** la cámara: una de las fijas, o la propia de la toma («guardada»: la que se veía al agregarla) */
  camara: NombreCamara | 'guardada'; pos?: number[]; mira?: number[]; acercar: number; recorrido: Recorrido; segundos: number;
  /** pasadas del aire por el túnel antes de grabar (para que el flujo esté armado) */
  calentar: number;
  /** las llaves de colores: en una franja al costado (no tapan nada), encima de la imagen en una esquina, o ninguna */
  llaves: DondeLlaves; simbolos: boolean; grafico: boolean; rotulo: boolean;
}
export interface ExportarTomas { resolucion: '1280x720' | '1920x1080'; mp4: boolean; pptx: boolean }

export const VISTA_BASE: VistaToma = {
  maqueta: false, torreCp: true, suelo: true, lineas: 'lineas', colorLineas: 'velocidad', particulas: false, vortices: false, umbralQ: 0.3,
  flechas: 'fijas', densidadFlechas: 1, grosorLineas: 1, horizontal: true, vertical: false, zRel: 0.5, yRel: 0.5, color: 'velocidad', espectro: 'termico', escalaVel: 'fija',
  rastrillo: 'grilla', verRastrillo: true, rastN: 14, vereda: false, lawson: true,
};
export const SIM_BASE: SimToma = { tam: 'liviano', paredes: 'exactas', angulo: 0, lento: false, ajustado: false, banda: false, bandaCota: NaN, bandaPisos: 3 };
const base = (nombre: string, vista: Partial<VistaToma>, extra: Partial<Toma> = {}): Toma => ({
  id: '', nombre, activa: true, sim: { ...SIM_BASE }, vista: { ...VISTA_BASE, ...vista },
  camara: 'esquina', acercar: 1, recorrido: 'quieta', segundos: 10, calentar: 1.5, llaves: 'costado', simbolos: false, grafico: true, rotulo: true, ...extra,
});
/** las tomas para empezar (se pueden cambiar todas) */
export const PLANTILLAS: [string, () => Toma][] = [
  ['Cortes con flechas', () => base('Cortes con flechas', { flechas: 'fijas', lineas: 'no' })],
  ['Líneas de corriente en tubos', () => base('Líneas de corriente en tubos', { lineas: 'tubos', flechas: 'no', horizontal: false }, { recorrido: 'orbita', segundos: 15 })],
  ['Nubes de turbulencia (remolinos)', () => base('Remolinos (criterio Q)', { vortices: true, umbralQ: 0.3, lineas: 'no', flechas: 'no', horizontal: false, maqueta: true }, { recorrido: 'orbita', segundos: 15 })],
  ['Maqueta con partículas', () => base('Maqueta con partículas', { maqueta: true, particulas: true, lineas: 'no', horizontal: false, flechas: 'no' })],
  // de cerca, un corte a la altura de la cámara llena la imagen: sin corte, con tubos y partículas
  ['Zoom a la esquina', () => base('Zoom a la esquina', { lineas: 'tubos', particulas: true, horizontal: false, flechas: 'no', rastrillo: 'vertical', rastN: 20 }, { camara: 'detalle', acercar: 1 })],
  ['Presión en el corte (Cp)', () => base('Presión en el corte (Cp)', { color: 'cp', flechas: 'no', lineas: 'no' }, { camara: 'arriba' })],
  ['Espectro arcoíris', () => base('Velocidad en arcoíris', { espectro: 'arcoiris', lineas: 'lineas', flechas: 'fijas' })],
  ['Geometría gruesa (en escalera)', () => ({ ...base('Geometría en escalera (gruesa)', { lineas: 'lineas', flechas: 'fijas' }), sim: { ...SIM_BASE, paredes: 'escalera' } })],
  ['Un escalón por piso (para comparar con la piel)', () => ({ ...base('Paredes exactas solo en planta: un escalón por piso', { lineas: 'lineas', flechas: 'fijas' }), sim: { ...SIM_BASE, paredes: 'planta' } })],
  ['Vereda y confort (Lawson)', () => base('Vereda: confort del peatón', { vereda: true, lawson: true, lineas: 'no', flechas: 'fijas' }, { camara: 'arriba' })],
  ['Vuelo del peatón a la vista de arriba', () => base('Vuelo', { lineas: 'tubos', flechas: 'no', horizontal: true }, { recorrido: 'vuelo', segundos: 15 })],
];

const CLAVE = 'torre3d.tomas3d';
let nId = 0;
export const nuevoId = () => `t${Date.now().toString(36)}${(nId++).toString(36)}`;
export function cargarTomas(): Toma[] {
  try {
    const t = JSON.parse(localStorage.getItem(CLAVE) ?? '[]') as Toma[];
    // lo que falte (tomas guardadas con una versión anterior) sale de la base
    return Array.isArray(t) ? t.map(x => ({ ...base('', {}), ...x, sim: { ...SIM_BASE, ...x.sim }, vista: { ...VISTA_BASE, ...x.vista } })) : [];
  } catch { return []; }
}
export function guardarTomas(t: Toma[]) { try { localStorage.setItem(CLAVE, JSON.stringify(t)); } catch { /* sin almacenamiento */ } }

/** la ficha de una toma en palabras (para el LEAME, la presentación y la lista) */
export function describirToma(t: Toma, nombresTam: Record<string, string>): string[] {
  const v = t.vista, s = t.sim;
  const que: string[] = [];
  if (v.horizontal) que.push(`corte horizontal (${Math.round(v.zRel * 100)} % de la altura)`);
  if (v.vertical) que.push('corte vertical');
  if (v.horizontal || v.vertical) que.push(v.color === 'cp' ? 'el corte con la presión (Cp)' : 'el corte con la velocidad');
  if (v.flechas !== 'no' && (v.horizontal || v.vertical || v.vereda)) que.push(`${v.flechas === 'fijas' ? 'flechas del mismo largo' : 'flechas proporcionales'}${v.densidadFlechas !== 1 ? ` (×${String(v.densidadFlechas).replace('.', ',')} de cantidad)` : ''}`);
  if (v.lineas !== 'no') que.push(v.lineas === 'tubos' ? 'líneas de corriente en tubos' : 'líneas de corriente');
  if (v.particulas) que.push('partículas');
  if (v.vortices) que.push('remolinos (criterio Q)');
  if (v.vereda) que.push(v.lawson ? 'vereda con el confort de Lawson' : 'vereda');
  if (v.maqueta) que.push('modo maqueta'); else if (!v.torreCp) que.push('torre sin colores');
  return [
    `Simulación: ${s.banda ? `banda de ${s.bandaPisos} pisos` : 'torre entera'}, grilla ${nombresTam[s.tam] ?? s.tam}, paredes ${s.paredes === 'exactas' ? 'exactas en planta y en altura' : s.paredes === 'planta' ? 'exactas solo en planta' : 'en escalera (geometría gruesa)'}${s.angulo ? `, viento girado ${s.angulo}°` : ''}${s.ajustado && !s.banda ? ', dominio ajustado' : ''}${s.lento ? ', túnel lento' : ''}.`,
    `Se ve: ${que.join(', ') || 'solo la torre'}. Colores de la velocidad: ${v.espectro === 'arcoiris' ? 'arcoíris (el rojo es aire rápido, no tracción)' : v.espectro === 'grises' ? 'grises' : 'térmico'}, escala ${v.escalaVel === 'fija' ? 'fija' : 'automática'}.`,
    `Cámara: ${t.camara === 'guardada' ? 'la guardada' : t.camara === 'detalle' ? 'zoom a la esquina' : t.camara}${t.acercar !== 1 ? ` (×${t.acercar})` : ''}, ${t.recorrido === 'quieta' ? 'quieta' : t.recorrido === 'orbita' ? 'una vuelta alrededor' : 'vuelo del peatón a arriba'}, ${t.segundos} s. Llaves ${t.llaves === 'costado' ? 'en una franja al costado' : t.llaves === 'encima' ? 'en una esquina' : 'sin llaves'}.`,
  ];
}
