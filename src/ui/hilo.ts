/**
 * El hilo del cálculo: arriba del panel de cada etapa, qué se hace en ella, qué usa de las etapas anteriores y a cuál le
 * pasa el resultado. Las etapas de la cadena son botones (llevan a esa etapa). Sirve de guion para los tutoriales: la
 * explicación de fondo la da la cátedra; esto solo ubica al alumno en la cadena de cuentas.
 */
import { h, type H } from './comp';
import { estado } from './estado';

type Paso = [id: string, nombre: string, que: string];
interface Hilo { hace: string; usa: Paso[]; pasa: Paso[] }

const metodoCatedra = () => estado.config.metodo === 'planilla' || estado.config.metodo === 'guia';
const cirsoc = () => estado.config.metodo === 'cirsoc' || estado.config.metodo === 'fem';

function hilos(): Record<string, Hilo> {
  return {
    diseno: { hace: 'Cargás la torre: el sitio, los niveles, los muros de la planta y cómo se agrupan en piezas.', usa: [],
      pasa: [['viento', 'Viento', 'el ancho de cada cara y las alturas'], ['rigidez', 'Rigidez', 'las piezas y su J']] },
    viento: { hace: cirsoc() ? 'La presión del viento en cada nivel con el CIRSOC 102-25, con la frecuencia de la torre y su ráfaga.' : 'La presión del viento en cada nivel con el CIRSOC 102-2005, como la hoja «viento» de la planilla.',
      usa: [['diseno', 'Diseño', 'el sitio, las alturas y el ancho de cada cara']], pasa: [['fuerzas', 'Fuerzas', 'la fuerza de cada nivel']] },
    fuerzas: { hace: 'La torre como una ménsula: el corte y el momento se acumulan de arriba hacia abajo.',
      usa: [['viento', 'Viento', 'la fuerza de cada nivel']], pasa: [['estabilidad', 'Estabilidad', 'el momento en la base'], ['rototrasl', 'Rototrasl.', 'el corte Q y el momento Mv']] },
    estabilidad: { hace: 'Que no vuelque: el peso de la torre contra el momento del viento, y dónde cae la resultante en la base.',
      usa: [['fuerzas', 'Fuerzas', 'el momento del viento'], ['diseno', 'Diseño', 'el peso de los niveles y la fundación']], pasa: [] },
    rigidez: { hace: 'Que no se mueva de más: la suma de los J de las piezas contra el J mínimo (azotea ≤ h/500).',
      usa: [['diseno', 'Diseño', 'las piezas'], ['viento', 'Viento', 'la carga']], pasa: [['rototrasl', 'Rototrasl.', 'el J de cada pieza']] },
    rototrasl: { hace: 'Cuánto viento toma cada pieza: una parte por traslación (según su J) y otra por rotación (si la planta gira).',
      usa: [['fuerzas', 'Fuerzas', 'Q y Mv'], ['rigidez', 'Rigidez', 'el J de cada pieza']], pasa: [['flexion', 'Flexión', 'el momento de cada pieza']] },
    flexion: { hace: cirsoc() ? 'Cada muro en PB con el CIRSOC 201: las combinaciones mayoradas contra la resistencia (diagrama N-M) y la armadura.' : 'Cada pieza en PB: σ = −N/F ± M/W, la compresión contra el hormigón y la tracción que pide armadura.',
      usa: [['rototrasl', 'Rototrasl.', 'el momento de cada pieza'], ['diseno', 'Diseño', 'el peso que baja por cada muro']], pasa: [['resumen', 'Resumen', 'los controles']] },
    exo: { hace: `Una estructura de acero ${(estado.proyecto.exo?.separacion ?? 0) < 0 ? 'por dentro de la piel' : 'por fuera de la fachada'} que toma parte del viento: cuánto toma, cuánto baja la flecha y los esfuerzos de cada barra.`,
      usa: [['fuerzas', 'Fuerzas', 'el viento'], ['rigidez', 'Rigidez', 'el J de los tabiques']], pasa: metodoCatedra() ? [] : [['flexion', 'Flexión', 'menos momento en los tabiques']] },
    carta: { hace: 'La hoja «M,NyQ» dibujada: el edificio, el viento, el corte, el momento y el peso de cada nivel.', usa: [['fuerzas', 'Fuerzas', 'M, N y Q de cada nivel']], pasa: [] },
    resumen: { hace: 'Todos los controles juntos. Lo que no verifica o pide atención lleva a la etapa donde se resuelve.', usa: [], pasa: [] },
  };
}

const irA = (id: string) => document.dispatchEvent(new CustomEvent('torre:ir-etapa', { detail: id }));
const chip = ([id, nombre, que]: Paso, flecha: '←' | '→') => {
  const b = h('button', { type: 'button', class: 'hilo-etapa', title: `Ir a ${nombre}: ${que}` }, flecha === '←' ? `← ${nombre}` : `${nombre} →`);
  b.addEventListener('click', () => irA(id));
  return h('span', { class: 'hilo-paso' }, b, h('span', { class: 'hilo-que' }, que));
};

/** la tarjeta del hilo para el panel de la etapa (null si la etapa no está en la cadena) */
export function hiloDeEtapa(id: string): H | null {
  const x = hilos()[id];
  if (!x) return null;
  const el = h('div', { class: 'hilo' }, h('p', { class: 'hilo-hace' }, h('b', {}, 'En esta etapa. '), x.hace));
  if (x.usa.length) el.append(h('div', { class: 'hilo-fila' }, h('span', { class: 'hilo-rot' }, 'Usa'), h('span', { class: 'hilo-pasos' }, ...x.usa.map(p => chip(p, '←')))));
  if (x.pasa.length) el.append(h('div', { class: 'hilo-fila' }, h('span', { class: 'hilo-rot' }, 'Pasa a'), h('span', { class: 'hilo-pasos' }, ...x.pasa.map(p => chip(p, '→')))));
  // con Planilla o Guía, el aviso de que el exo no entra en el cálculo lo da el panel de la etapa (también sin tutorial)
  return el;
}

/** etapa del Resumen donde se resuelve cada grupo de controles */
export function etapaDeGrupo(grupo: string): [string, string] | null {
  if (grupo.startsWith('Viento')) return ['viento', 'Viento'];
  if (grupo === 'Estabilidad' || grupo === 'Funicular') return ['estabilidad', 'Estabilidad'];
  if (grupo === 'Rigidez') return ['rigidez', 'Rigidez'];
  if (grupo === 'Diseño') return ['diseno', 'Diseño'];
  if (grupo === 'Reparto') return ['rototrasl', 'Rototrasl.'];
  if (grupo.startsWith('Flexocompresión') || grupo.startsWith('CIRSOC 201') || grupo === 'Hormigón') return ['flexion', 'Flexión'];
  if (grupo.startsWith('Exo')) return ['exo', 'Exoesqueleto'];
  return null;
}
export const irAEtapa = irA;
