/**
 * «¿Qué pasa si…?»: con un muro elegido, deslizadores de largo, espesor y posición; la torre se recalcula en vivo
 * sobre una copia (con el método elegido) y se ve qué cambia: rigidez, parte del viento de su pieza, eje de rigidez,
 * desplazamiento de la azotea, verificación y controles. La planta muestra el muro cambiado en trazos. «Aplicar» lo
 * pasa al proyecto (se puede deshacer); «Volver» lo deja como estaba.
 */
import { estado, fmt } from './estado';
import { h, seccion, type H } from './comp';
import { calcularProyecto } from './estado';
import { aplicarCambio, medirEscenario, muroAjustable, sentido, type CambioMuro, type Medida } from '../engine/quePasaSi';
import { tipoDe } from '../engine/modelo';

/** el cambio que se está probando (se pierde al elegir otro muro o al cambiar el proyecto) */
let prueba: { id: string; rev: number; k: CambioMuro } | null = null;
let temporizador = 0, escuchando = false;

/** el muro en trazos de la planta: solo se redibuja si cambió */
function ponerFantasma(f: typeof estado.fantasma) {
  if (JSON.stringify(f) === JSON.stringify(estado.fantasma)) return;
  estado.fantasma = f;
  estado.avisarSeleccion();
}
/** al elegir otro muro (en la planta o en la tabla) la sección pasa a ese muro sin rearmar el panel */
function escucharSeleccion() {
  if (escuchando) return;
  escuchando = true;
  estado.suscribirSeleccion(() => {
    const sec = document.querySelector<HTMLElement>('.que-pasa');
    if (!sec || sec.dataset.muro === (estado.seleccion ?? '')) return;
    sec.replaceWith(seccionQuePasaSi());
  });
}

function cambioActual(id: string): CambioMuro {
  if (!prueba || prueba.id !== id || prueba.rev !== estado.revision) prueba = { id, rev: estado.revision, k: {} };
  return prueba.k;
}

function tablaMedidas(ms: Medida[]): H {
  const f = (x: number | null, d: number) => (x === null || !isFinite(x) ? '—' : fmt(x, d));
  return h('table', { class: 'tabla' },
    h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'antes'), h('th', {}, 'con el cambio'), h('th', {}, 'Δ'))),
    h('tbody', {}, ...ms.map(x => {
      const s = sentido(x), d = x.antes !== null && x.ahora !== null ? x.ahora - x.antes : null;
      const est = (e: string | null | undefined) => (e === 'no verifica' ? ' ✗' : e === 'atención' ? ' ⚠' : '');
      const tr = h('tr', {},
        h('td', {}, x.nombre + (x.unidad ? ` (${x.unidad})` : '')),
        h('td', { class: 'n' }, f(x.antes, x.decimales) + est(x.estadoAntes)),
        h('td', { class: `n ${s}` }, f(x.ahora, x.decimales) + est(x.estadoAhora)),
        h('td', { class: `n ${s}` }, d === null || Math.abs(d) < 10 ** -(x.decimales + 1) ? '=' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), x.decimales)}`));
      if (x.nota) tr.title = x.nota;
      return tr;
    })));
}

export function seccionQuePasaSi(): H {
  const p = estado.proyecto, m = p.muros.find(x => x.id === estado.seleccion);
  const s = seccion('¿Qué pasa si…?');
  s.el.classList.add('que-pasa');
  s.el.dataset.muro = m?.id ?? '';
  escucharSeleccion();
  const c = s.cuerpo;
  if (!m) {
    ponerFantasma(null);
    c.append(h('p', { class: 'nota', title: 'Largo, espesor y posición con deslizadores; se ve en el momento qué le pasa a la torre (rigidez, reparto del viento, giro de la planta, desplazamiento y verificación) sin tocar el proyecto hasta que apliques el cambio.' }, 'Elegí un muro para probar cambios con deslizadores y ver qué le pasa a la torre.'));
    return s.el;
  }
  const k = cambioActual(m.id), ajustable = muroAjustable(p, m.id);
  const res = h('div', {});
  const dir = m.dir === 'Y' ? 'A' : 'B';
  // recalcula la copia (después de una pausa corta mientras se arrastra) y dibuja el muro en trazos
  const recalcular = () => {
    clearTimeout(temporizador);
    const hayCambio = Object.values(k).some(v => v !== undefined && v !== 0);
    ponerFantasma(hayCambio ? aplicarCambio(p, m.id, k).muros.find(x => x.id === m.id) ?? null : null);
    if (!hayCambio) { res.replaceChildren(h('p', { class: 'nota' }, `Mové un deslizador. ${m.id} trabaja en el viento ${dir}.`)); return; }
    res.replaceChildren(h('p', { class: 'calculando' }, 'Calculando…'));
    temporizador = window.setTimeout(() => {
      try {
        const q = aplicarCambio(p, m.id, k), c1 = calcularProyecto(q);
        if (c1.error) { res.replaceChildren(h('p', { class: 'aviso-viejo' }, `Con este cambio el cálculo no anda: ${c1.error}`)); return; }
        res.replaceChildren(tablaMedidas(medirEscenario(p, estado.calculo, c1, m.id)),
          h('p', { class: 'nota chica' }, 'Verde mejora, rojo empeora (pasá el mouse por cada fila). Se calcula con el método elegido arriba. ✗ no verifica · ⚠ atención.'));
      } catch (e) { res.replaceChildren(h('p', { class: 'aviso-viejo' }, `No se pudo calcular: ${e instanceof Error ? e.message : String(e)}`)); }
    }, 140);
  };
  const deslizador = (rot: string, min: number, max: number, paso: number, val: number, mostrar: (v: number) => string, al: (v: number) => void) => {
    const i = h('input', { type: 'range', min: String(min), max: String(max), step: String(paso), value: String(val) }) as HTMLInputElement;
    const o = h('output', {}, mostrar(val));
    i.addEventListener('input', () => { const v = +i.value; o.textContent = mostrar(v); al(v); recalcular(); });
    i.addEventListener('dblclick', () => { i.value = String(val0(rot)); i.dispatchEvent(new Event('input')); });
    return h('label', { class: 'deslizador' }, h('span', {}, rot), o, i);
  };
  const L0 = m.largo, e0 = m.espesor;
  const val0 = (rot: string) => (rot.startsWith('Largo') ? L0 : rot.startsWith('Espesor') ? e0 : 0);
  const m2 = (v: number) => `${fmt(v, 2)} m`;
  c.append(h('p', { class: 'nota' }, `Probando con ${m.id}${m.piezaA || m.piezaB ? ` (pieza ${dir === 'A' ? m.piezaA : m.piezaB || m.piezaA})` : ''}. Doble clic en un deslizador lo vuelve a su valor.`));
  if (ajustable) {
    c.append(
      deslizador(tipoDe(m) === 'tubo-circ' ? 'Largo (diámetro)' : 'Largo', Math.max(0.3, +(L0 * 0.3).toFixed(2)), +(L0 * 2.5).toFixed(2), 0.05, k.largo ?? L0, m2, v => { k.largo = Math.abs(v - L0) < 1e-9 ? undefined : v; }),
      deslizador('Espesor', 0.1, Math.max(0.6, e0), 0.01, k.espesor ?? e0, m2, v => { k.espesor = Math.abs(v - e0) < 1e-9 ? undefined : v; }),
    );
  } else c.append(h('p', { class: 'nota chica' }, `${m.id} es un perfil irregular: se puede correr, pero su forma se edita con doble clic en la planta.`));
  c.append(
    deslizador('Correr en x', -6, 6, 0.05, k.dx ?? 0, v => `${v > 0 ? '+' : ''}${fmt(v, 2)} m`, v => { k.dx = v || undefined; }),
    deslizador('Correr en y', -6, 6, 0.05, k.dy ?? 0, v => `${v > 0 ? '+' : ''}${fmt(v, 2)} m`, v => { k.dy = v || undefined; }),
  );
  const aplicar = h('button', { type: 'button', class: 'boton' }, 'Aplicar el cambio');
  aplicar.addEventListener('click', () => {
    const q = aplicarCambio(p, m.id, k).muros.find(x => x.id === m.id)!;
    prueba = null; estado.fantasma = null;
    estado.cambiar(pp => { const mm = pp.muros.find(x => x.id === m.id); if (mm) { mm.largo = q.largo; mm.espesor = q.espesor; mm.x = q.x; mm.y = q.y; } });
  });
  const volver = h('button', { type: 'button', class: 'boton' }, 'Volver');
  volver.addEventListener('click', () => { prueba = null; estado.fantasma = null; estado.avisarPanel(); });
  c.append(res, h('div', { class: 'fila-acciones' }, aplicar, volver));
  recalcular();
  return s.el;
}
