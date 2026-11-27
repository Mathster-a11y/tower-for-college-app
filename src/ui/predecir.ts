/**
 * «Predecí antes de ver»: un modo de práctica. En Fuerzas, Rigidez y Rototraslación, antes de mostrar el dibujo, la app
 * pide una estimación (el momento en la base, cuánto se corre la azotea, qué pieza toma más corte). Después muestra la
 * respuesta al lado de la estimación, con la diferencia y una pista de por qué. Sirve para entrenar la intuición
 * estructural: primero se piensa, después se calcula.
 *
 * Las respuestas valen para el proyecto como está: si se cambia algo, se vuelve a preguntar. Se prende y se apaga desde
 * Mostrar (se recuerda en este navegador).
 */
import { estado, fmt } from './estado';
import { h } from './comp';
import { respuestasPredecir } from './etapas';

const CLAVE = 'torre3d.predecir';
export function predecirActivo(): boolean { try { return localStorage.getItem(CLAVE) === 'si'; } catch { return false; } }
export function ponerPredecir(si: boolean) { try { localStorage.setItem(CLAVE, si ? 'si' : 'no'); } catch { /* sin almacenamiento */ } }

/** lo que contestó el alumno, por etapa, viento y versión del proyecto */
const respuestas = new Map<string, string>();
const clave = (etapa: string) => `${etapa}|${estado.dir}|${estado.revision}`;

/** qué tan cerca: con el error relativo */
function nota(err: number): string {
  const a = Math.abs(err);
  return a <= 0.15 ? 'Muy cerca.' : a <= 0.4 ? 'Cerca.' : a <= 1 ? 'Lejos.' : 'Muy lejos.';
}
const numero = (t: string) => Number(t.replace(/\s/g, '').replace(',', '.'));

/**
 * La tarjeta de la etapa: la pregunta (si todavía no se contestó: el dibujo no se muestra) o, ya contestada, la
 * comparación arriba del dibujo. null si la etapa no tiene pregunta.
 */
export function tarjetaPredecir(etapa: string, redibujar: () => void): { el: HTMLElement; pregunta: boolean } | null {
  if (!['fuerzas', 'rigidez', 'rototrasl'].includes(etapa)) return null;
  const r = respuestasPredecir();
  if (!r) return null;
  if (etapa === 'rigidez' && r.sinRigidez) return null;
  const k = clave(etapa), dada = respuestas.get(k);
  const responder = (v: string) => { respuestas.set(k, v); redibujar(); };
  const otraVez = h('button', { type: 'button', class: 'chico' }, 'Probar de nuevo');
  otraVez.addEventListener('click', () => { respuestas.delete(k); redibujar(); });

  // la pregunta con un número (momento, corrimiento)
  const conNumero = (texto: string, pista: string, unidad: string, real: number, explica: string) => {
    if (dada === undefined) {
      const inp = h('input', { type: 'text', inputmode: 'decimal', class: 'campo-vertice', 'aria-label': texto }) as HTMLInputElement;
      const ok = h('button', { type: 'button', class: 'primario' }, 'Ver el resultado') as HTMLButtonElement;
      const ir = () => { const v = numero(inp.value); if (isFinite(v) && v > 0) responder(String(v)); else inp.focus(); };
      ok.addEventListener('click', ir); inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') ir(); });
      setTimeout(() => inp.focus(), 0);
      return { pregunta: true, el: h('section', { class: 'predecir' }, h('span', { class: 'predecir-tit' }, 'Predecí antes de ver'), h('h3', {}, texto), h('p', { class: 'nota' }, pista),
        h('div', { class: 'fila-acciones' }, inp, h('span', {}, unidad), ok)) };
    }
    const v = Number(dada), err = real > 0 ? (v - real) / real : 0;
    return { pregunta: false, el: h('section', { class: 'predecir hecha' },
      h('p', {}, h('b', {}, `Dijiste ${fmt(v, v < 10 ? 1 : 0)} ${unidad}; da ${fmt(real, real < 10 ? 1 : 0)} ${unidad}. `), `${err >= 0 ? 'Te pasaste' : 'Te quedaste corto'} un ${fmt(Math.abs(err) * 100, 0)} %. ${nota(err)}`),
      h('p', { class: 'predecir-explica' }, explica), h('div', { class: 'fila-acciones' }, otraVez)) };
  };

  if (etapa === 'fuerzas') return conNumero(`¿Cuánto vale el momento que el viento ${r.dir} hace en la base (Mv)?`,
    `El viento total sobre la torre es W = ${fmt(r.W, 1)} t. Pensá a qué altura actúa la resultante.`, 'tm', r.Mv,
    `Mv = W · hw = ${fmt(r.W, 1)} t · ${fmt(r.hw, 2)} m. La resultante del viento actúa a ${fmt(r.hw, 1)} m: un poco por encima de la mitad de la altura, porque el viento crece con la altura.`);
  if (etapa === 'rigidez') return conNumero(`¿Cuántos milímetros se corre la azotea con el viento ${r.dir}?`,
    `El límite del curso es h/500 = ${fmt(r.limite * 1000, 1)} mm. ¿La torre queda por debajo o por encima?`, 'mm', r.dTop * 1000,
    `La deformada sale de integrar dos veces M / (E·ΣJ) piso por piso, desde el empotramiento. ${r.dTop <= r.limite ? 'Queda por debajo del límite h/500: verifica.' : 'Pasa el límite h/500: hace falta más ΣJ.'}`);

  // rototraslación: qué pieza toma más corte
  const orden = [...r.piezas].sort((a, b) => b.pct - a.pct), mayor = orden[0];
  if (!mayor) return null;
  if (dada === undefined) {
    const bs = r.piezas.map(p => { const b = h('button', { type: 'button' }, p.nombre); b.addEventListener('click', () => responder(p.nombre)); return b; });
    return { pregunta: true, el: h('section', { class: 'predecir' }, h('span', { class: 'predecir-tit' }, 'Predecí antes de ver'),
      h('h3', {}, `Con el viento ${r.dir}, ¿qué pieza toma más corte?`), h('p', { class: 'nota' }, 'Mirá la planta: cuenta el J de cada pieza (cuánto mide en el sentido del viento, al cubo) y, si la planta no es simétrica, de qué lado gira.'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Piezas' }, ...bs)) };
  }
  const elegida = r.piezas.find(p => p.nombre === dada);
  const acerto = dada === mayor.nombre;
  return { pregunta: false, el: h('section', { class: `predecir hecha${acerto ? ' bien' : ''}` },
    h('p', {}, h('b', {}, acerto ? `¡Bien! ${mayor.nombre} es la que más toma: ${fmt(mayor.pct, 1)} % del corte. ` : `Elegiste ${dada}${elegida ? ` (${fmt(elegida.pct, 1)} %)` : ''}. La que más toma es ${mayor.nombre}: ${fmt(mayor.pct, 1)} %. `)),
    h('p', { class: 'predecir-explica' }, `Las tres que más toman: ${orden.slice(0, 3).map(p => `${p.nombre} ${fmt(p.pct, 1)} %`).join(' · ')}. Cada pieza toma en proporción a su J (traslación) y, si la planta no es simétrica, suma o resta por el giro según de qué lado del centro de rigidez está (rotación).`),
    h('div', { class: 'fila-acciones' }, otraVez)) };
}
