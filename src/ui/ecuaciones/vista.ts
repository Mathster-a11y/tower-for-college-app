/**
 * Etapa «Ecuaciones»: la guía de cálculo de cada método como grafo de fórmulas. En el centro, el tablero del capítulo
 * (cada cuenta una tarjeta, las flechas llevan cada resultado al lugar donde se usa); en el panel, los capítulos, la
 * pieza, los datos que se pueden mover y el detalle de la cuenta elegida: qué es, la ecuación con los números, de qué
 * depende, qué la usa y, si es un control, qué hacer cuando no verifica.
 */
import { estado, fmt } from '../estado';
import { esc, h, seccion, type H } from '../comp';
import { dependientes, referencias, simbolo, textoMat, vistaGrafo, type CapituloGrafo, type Grafo, type NodoGrafo, type ParamGrafo, type VistaGrafo } from '../grafo';
import { grafoGuia } from './guia';
import { grafoPlanilla, tablaNivelesPlanilla, type RP } from './planilla';
import { grafoCirsoc } from './cirsoc';
import { grafoFem } from './fem';
import { abrirGuiaImprimible } from './imprimir';
import { grafoFlujo } from './flujo';
import { viento102 } from '../../engine/cargas/cirsoc102';
import { calcularFem } from '../../engine/metodos/fem';

export const METODOS_ECUACIONES = ['Guía', 'Planilla', 'CIRSOC', 'FEM', 'Flujo'] as const;
type MetodoEc = typeof METODOS_ECUACIONES[number];

/** lo que se elige y se mueve en la guía (se pierde al cambiar el proyecto) */
const sel = {
  capitulo: 'viento', pieza: '', muro: '', elegido: null as string | null,
  /** valores movidos de los datos, por método */
  movidos: {} as Record<string, Record<string, number>>,
  revision: -1,
};
let vista: VistaGrafo | null = null;
let detalleEl: H | null = null;
let datosEl: H | null = null;
let soltar = 0;

// ---------------------------------------------------------------------------------------------- el grafo actual
type G = Grafo<unknown, unknown>;
let memo: { clave: string; g: G } | null = null;
function grafoActual(): { g: G; metodo: MetodoEc } {
  const metodo0 = (estado.sub.ecuaciones as MetodoEc) ?? 'Guía';
  const clave = `${estado.revision}|${estado.dir}|${sel.pieza}|${sel.muro}|${metodo0}|${estado.config.version}`;
  if (memo?.clave === clave && sel.revision === estado.revision) return { g: memo.g, metodo: metodo0 };
  const x = armarGrafo();
  memo = { clave: `${estado.revision}|${estado.dir}|${sel.pieza}|${sel.muro}|${x.metodo}|${estado.config.version}`, g: x.g };
  return x;
}
function armarGrafo(): { g: G; metodo: MetodoEc } {
  if (sel.revision !== estado.revision) { sel.movidos = {}; sel.elegido = null; sel.revision = estado.revision; }
  const metodo = (estado.sub.ecuaciones as MetodoEc) ?? 'Guía';
  const piezas = estado.calculo.asig.piezas.filter(x => x.dir === estado.dir && x.filaHoja !== null);
  if (!piezas.some(x => x.nombre === sel.pieza)) { sel.pieza = piezas[0]?.nombre ?? ''; sel.muro = ''; }
  return { g: grafoDeMetodo(metodo, estado.dir, sel.pieza, sel.muro), metodo };
}
/** el grafo de un método para la torre abierta (también para la guía impresa) */
export function grafoDeMetodo(metodo: MetodoEc, dir: 'A' | 'B', pieza: string, muro: string): G {
  const { asig } = estado.calculo;
  if (metodo === 'Planilla') {
    const iPB = estado.proyecto.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
    const gp = grafoPlanilla(asig.datos, asig.piezas, asig.filaNivel[iPB] ?? 50, estado.proyecto.hormigon || 'H30', estado.config.version, { dir, pieza });
    gp.capitulos[0].detalle = (id, r) => (['Q', 'Wi', 'M', 'p'].includes(id) ? tablaNivelesPlanilla(r as RP) : null);
    return gp as unknown as G;
  }
  if (metodo === 'Flujo') {
    const w = viento102(estado.proyecto);
    let n1 = estado.calculo.fem?.n1[dir];
    try { n1 ??= calcularFem(estado.proyecto).n1[dir]; } catch { n1 = w[dir].n1; }
    return grafoFlujo({ U0: 0.1, D: 40, Re: 1000, cs: 0.16, St: 0.168, V: w.V, B: w[dir].B, n1, nuAire: 1.5e-5 }) as unknown as G;
  }
  if (metodo === 'FEM') return grafoFem(estado.proyecto, estado.config.teoria, { dir, pieza }) as unknown as G;
  if (metodo === 'CIRSOC') return grafoCirsoc(estado.proyecto, 'cirsoc', { dir, pieza, muro }) as unknown as G;
  return grafoGuia(estado.proyecto, asig.piezas, { dir, pieza, muro }) as unknown as G;
}
export type { MetodoEc };
const capituloActual = (g: G) => g.capitulos.find(c => c.id === sel.capitulo) ?? g.capitulos[0];
function datosMovidos(g: G, metodo: string) {
  const d = g.datos();
  const mv = sel.movidos[metodo] ?? {};
  g.capitulos.forEach(c => c.params.forEach(p => { if (mv[p.id] !== undefined) p.set(d, mv[p.id]); }));
  return d;
}
let cache: { clave: string; r: unknown } | null = null;
function resultado(g: G, metodo: string) {
  const clave = `${estado.revision}|${estado.dir}|${sel.pieza}|${metodo}|${JSON.stringify(sel.movidos[metodo] ?? {})}`;
  if (cache?.clave !== clave) cache = { clave, r: g.calcular(datosMovidos(g, metodo)) };
  return cache.r;
}

// ---------------------------------------------------------------------------------------------- panel
export function panelEcuaciones(c: H) {
  const { g, metodo } = grafoActual();
  const cap = capituloActual(g);
  c.append(h('p', { class: 'nota' }, 'Cada cuenta es una tarjeta. La flecha sale del resultado y cae en el lugar exacto de la ecuación que lo usa; cada resultado tiene su color. Pasá el mouse (o tocá) una tarjeta para ver de dónde viene y a dónde va. Los datos de arriba se arrastran de costado y toda la cadena se recalcula.'));
  // la guía del método, para imprimir o guardar en PDF
  const bGuia = h('button', { type: 'button', class: 'boton primario' }, `Guía del método ${metodo} (imprimir o PDF)`);
  bGuia.addEventListener('click', () => { void abrirGuiaImprimible(metodo); });
  c.append(h('div', { class: 'fila-acciones' }, bGuia));
  // capítulos
  const lista = h('div', { class: 'ec-capitulos', role: 'group', 'aria-label': 'Capítulos' });
  g.capitulos.forEach(k => {
    const b = h('button', { type: 'button', class: 'boton', 'aria-pressed': String(k.id === cap.id) }, k.titulo);
    b.addEventListener('click', () => { sel.capitulo = k.id; sel.elegido = null; estado.avisarPanel(); });
    lista.append(b);
  });
  c.append(seccion('Capítulos', lista).el);
  // pieza (para rigidez, reparto y tensiones) y muro
  const piezas = estado.calculo.asig.piezas.filter(x => x.dir === estado.dir && x.filaHoja !== null);
  if (piezas.length && ['rigidez', 'roto', 'flexo', 'pieza', 'ensamble', 'fuerzas'].includes(cap.id)) {
    const s = h('select', { 'aria-label': 'Pieza' }) as HTMLSelectElement;
    piezas.forEach(x => s.append(h('option', { value: x.nombre }, x.nombre)));
    s.value = sel.pieza;
    s.addEventListener('change', () => { sel.pieza = s.value; sel.muro = ''; estado.avisarPanel(); });
    const fila = h('label', { class: 'fila-campo' }, h('span', {}, `Pieza (viento ${estado.dir})`), s);
    if (cap.id === 'flexo' && metodo !== 'Planilla') {
      const pz = piezas.find(x => x.nombre === sel.pieza);
      const m = h('select', { 'aria-label': 'Muro' }) as HTMLSelectElement;
      (pz?.muros ?? []).forEach(id => m.append(h('option', { value: id }, id)));
      m.value = sel.muro || (pz?.muros[0] ?? '');
      m.addEventListener('change', () => { sel.muro = m.value; estado.avisarPanel(); });
      c.append(seccion('Qué se calcula', fila, h('label', { class: 'fila-campo' }, h('span', {}, 'Muro'), m)).el);
    } else c.append(seccion('Qué se calcula', fila).el);
  }
  // datos que se pueden mover
  datosEl = h('div', {});
  c.append(seccion('Datos que podés mover', datosEl).el);
  pintarDatos(g, metodo, cap);
  // detalle de la cuenta elegida
  detalleEl = h('div', { class: 'ec-detalle' });
  c.append(seccion('La cuenta elegida', detalleEl).el);
  pintarDetalle(g, metodo, cap);
}

function pintarDatos(g: G, metodo: string, cap: CapituloGrafo<unknown, unknown>) {
  if (!datosEl) return;
  const mv = sel.movidos[metodo] ?? {};
  const libres = cap.params.filter(p => !p.fijo);
  datosEl.replaceChildren();
  if (!libres.length) { datosEl.append(h('p', { class: 'nota' }, 'En este capítulo todo viene de los anteriores o de la planta. Para probar cambios, mové los datos de los capítulos 1, 2 o 5, o la planta.')); return; }
  const d0 = g.datos();
  libres.forEach(p => {
    const val = mv[p.id] ?? p.get(d0);
    const i = h('input', { type: 'range', min: String(p.min), max: String(p.max), step: String(p.paso), value: String(val) }) as HTMLInputElement;
    const o = h('output', {}, `${fmt(val, p.dec ?? 2)}${p.unidad ? ` ${p.unidad}` : ''}`);
    const nom = h('span', {}); nom.innerHTML = `${simbolo(p.sim)} · ${esc(p.nombre)}`;
    i.addEventListener('input', () => { mover(p.id, +i.value, false); o.textContent = `${fmt(+i.value, p.dec ?? 2)}${p.unidad ? ` ${p.unidad}` : ''}`; });
    i.addEventListener('change', () => mover(p.id, +i.value, true));
    i.addEventListener('dblclick', () => { delete (sel.movidos[metodo] ??= {})[p.id]; estado.avisarPanel(); });
    const lbl = h('label', { class: `deslizador ec${mv[p.id] !== undefined ? ' movido' : ''}` }, nom, o, i);
    datosEl!.append(lbl);
  });
  if (Object.keys(mv).length) {
    const b = h('button', { type: 'button', class: 'boton' }, 'Volver a los datos del proyecto');
    b.addEventListener('click', () => { sel.movidos[metodo] = {}; estado.avisarPanel(); });
    datosEl.append(h('div', { class: 'fila-acciones' }, b), h('p', { class: 'nota chica' }, 'Lo que movés acá no cambia el proyecto: es para ver cómo se propaga. Doble clic en un deslizador lo vuelve a su valor.'));
  }
}

function pintarDetalle(g: G, metodo: string, cap: CapituloGrafo<unknown, unknown>) {
  if (!detalleEl) return;
  const r = resultado(g, metodo);
  const d = datosMovidos(g, metodo);
  detalleEl.replaceChildren();
  const id = sel.elegido;
  const n = cap.nodos.find(x => x.id === id), p = cap.params.find(x => x.id === id);
  if (!n && !p) { detalleEl.append(h('p', { class: 'nota' }, cap.intro), h('p', { class: 'nota chica' }, 'Tocá una tarjeta para ver su explicación, la cuenta con los números y, si es un control, qué hacer cuando no verifica.')); return; }
  const valorDe = (k: string): number | null => {
    const pp = cap.params.find(x => x.id === k);
    if (pp) return pp.get(d);
    const v = cap.nodos.find(x => x.id === k)?.valor(r);
    return v === undefined || v === null || !isFinite(v) ? null : v;
  };
  const decDe = (k: string) => (cap.params.find(x => x.id === k)?.dec ?? cap.nodos.find(x => x.id === k)?.dec ?? 2);
  const titulo = h('h4', {}); titulo.innerHTML = `${simbolo((n ?? p)!.sim)} · ${esc(n ? n.titulo : p!.nombre)}`;
  detalleEl.append(titulo);
  if (p) {
    detalleEl.append(h('p', {}, `${fmt(p.get(d), p.dec ?? 2)}${p.unidad ? ` ${p.unidad}` : ''}`), h('p', { class: 'nota' }, p.fuente ? `Sale de: ${p.fuente}.` : 'Dato del proyecto.'));
  } else if (n) {
    if (n.ec && !n.externo) {
      const sim = h('div', { class: 'ec gr-detalle-ec' }); sim.innerHTML = `${simbolo(n.sim)} = ${conSimbolos(n.ec, cap)}`;
      const num = h('div', { class: 'ec gr-detalle-ec' });
      num.innerHTML = `${simbolo(n.sim)} = ${conNumeros(n.ec, valorDe, decDe)} = <span class="res">${fmt(n.valor(r) ?? NaN, n.dec ?? 2)}</span>${n.unidad ? ` <span class="u">${esc(n.unidad)}</span>` : ''}`;
      detalleEl.append(sim, num);
    } else detalleEl.append(h('p', {}, `${fmt(n.valor(r) ?? NaN, n.dec ?? 2)}${n.unidad ? ` ${n.unidad}` : ''} · ${n.externo ?? ''}`));
    if (n.nota) detalleEl.append(h('p', { class: 'nota' }, n.nota));
    if (n.ref) detalleEl.append(h('p', { class: 'nota chica' }, `Referencia: ${n.ref}`));
    if (n.control) {
      const ok = n.control.ok(r);
      const cond = h('div', { class: 'ec gr-detalle-ec' }); cond.innerHTML = `${/^[≤≥<>=]/.test(n.control.cond.trim()) ? `${simbolo(n.sim)} = ${fmt(n.valor(r) ?? NaN, n.dec ?? 2)} ` : ''}${conNumeros(n.control.cond, valorDe, decDe)}`;
      detalleEl.append(h('div', { class: `ec-control ${ok === null ? '' : ok ? 'verifica' : 'no-verifica'}` },
        h('span', { class: `chip-estado ${ok === null ? 'informativo' : ok ? 'verifica' : 'no-verifica'}` }, ok === null ? 'sin dato' : ok ? 'verifica' : 'no verifica'), cond));
      const lista = h('ul', { class: 'ec-sino' });
      n.control.siNo.forEach(x => {
        const li = h('li', {}, x.texto);
        if (x.mueve?.length) {
          const b = h('button', { type: 'button', class: 'mini' }, 'mostrar');
          b.title = 'Resaltar en el tablero lo que conviene tocar';
          b.addEventListener('click', () => señalar(x.mueve!));
          li.append(' ', b);
        }
        lista.append(li);
      });
      detalleEl.append(h('p', { class: 'nota' }, ok === false ? 'No verifica. Qué se puede hacer:' : 'Si no verificara, qué se puede hacer:'), lista);
    }
    const usa = [...new Set([...referencias(n.ec), ...(n.control ? referencias(n.control.cond) : [])])];
    if (usa.length) detalleEl.append(h('p', { class: 'nota chica' }, 'Usa: ', ...usa.map(k => enlace(k, cap))));
  }
  const lousan = cap.nodos.filter(x => [...referencias(x.ec), ...(x.control ? referencias(x.control.cond) : [])].includes(id!));
  if (lousan.length) detalleEl.append(h('p', { class: 'nota chica' }, 'Lo usan: ', ...lousan.map(x => enlace(x.id, cap))));
  const extra = cap.detalle?.(id!, r);
  if (extra) detalleEl.append(extra);
}
function enlace(id: string, cap: CapituloGrafo<unknown, unknown>): H {
  const x = cap.nodos.find(k => k.id === id) ?? cap.params.find(k => k.id === id);
  const b = h('button', { type: 'button', class: 'mini enlace' });
  b.innerHTML = x ? simbolo(x.sim) : esc(id);
  b.title = x ? ('titulo' in x ? x.titulo : x.nombre) : id;
  b.addEventListener('click', () => elegir(id));
  return b;
}
export const conSimbolos = (ec: string, cap: CapituloGrafo<unknown, unknown>) =>
  ec.split(/(\[[A-Za-z][A-Za-z0-9_]*\]|\^\{|\})/).map(t => { const m = /^\[(.+)\]$/.exec(t); if (m) { const x = cap.nodos.find(k => k.id === m[1]) ?? cap.params.find(k => k.id === m[1]); return x ? simbolo(x.sim) : m[1]; } return t === '^{' ? '<sup>' : t === '}' ? '</sup>' : textoMat(t); }).join('');
export const conNumeros = (ec: string, val: (k: string) => number | null, dec: (k: string) => number) =>
  ec.split(/(\[[A-Za-z][A-Za-z0-9_]*\]|\^\{|\})/).map(t => { const m = /^\[(.+)\]$/.exec(t); if (m) { const v = val(m[1]); return `<span class="num">${v === null ? '—' : fmt(v, dec(m[1]))}</span>`; } return t === '^{' ? '<sup>' : t === '}' ? '</sup>' : textoMat(t); }).join('');

// ---------------------------------------------------------------------------------------------- acciones
function elegir(id: string | null) {
  sel.elegido = id;
  vista?.elegir(id);
  const { g, metodo } = grafoActual();
  pintarDetalle(g, metodo, capituloActual(g));
  if (id) document.querySelector(`.gr-tablero [data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}
function señalar(ids: string[]) {
  const t = document.querySelectorAll<HTMLElement>(ids.map(k => `.gr-tablero [data-id="${CSS.escape(k)}"]`).join(','));
  t.forEach(x => { x.classList.remove('señalado'); void x.offsetWidth; x.classList.add('señalado'); });
  t[0]?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
}
let pendiente = 0;
function mover(id: string, x: number, fin: boolean) {
  const { metodo } = grafoActual();
  (sel.movidos[metodo] ??= {})[id] = x;
  // CIRSOC y FEM recalculan el proyecto entero: mientras se arrastra, un recálculo por cuadro como mucho
  if (!fin && (metodo === 'CIRSOC' || metodo === 'FEM')) {
    if (!pendiente) pendiente = requestAnimationFrame(() => { pendiente = 0; aplicarMovida(id, false); });
    return;
  }
  aplicarMovida(id, fin);
}
function aplicarMovida(id: string, fin: boolean) {
  const { g, metodo } = grafoActual();
  const cap = capituloActual(g);
  const r = resultado(g, metodo);
  clearTimeout(soltar);
  vista?.actualizar(r, fin ? new Set() : new Set([id, ...dependientes(cap, id)]));
  if (fin) { pintarDetalle(g, metodo, cap); pintarDatos(g, metodo, cap); }
  else soltar = window.setTimeout(() => vista?.actualizar(resultado(g, metodo), new Set()), 1500);
}

// ---------------------------------------------------------------------------------------------- centro
export function centroEcuaciones(c: H) {
  const { g, metodo } = grafoActual();
  const cap = capituloActual(g);
  const pest = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Capítulo' });
  g.capitulos.forEach(k => {
    const b = h('button', { type: 'button', 'aria-pressed': String(k.id === cap.id) }, k.titulo);
    b.addEventListener('click', () => { sel.capitulo = k.id; sel.elegido = null; estado.avisarPanel(); });
    pest.append(b);
  });
  c.append(h('div', { class: 'fila-acciones' }, pest), h('p', { class: 'nota' }, cap.intro));
  const r = resultado(g, metodo);
  vista = vistaGrafo(cap as CapituloGrafo<unknown, unknown>, r, {
    elegido: sel.elegido,
    elegir,
    arrastrar: mover,
    valorParam: k => sel.movidos[metodo]?.[k] ?? cap.params.find(p => p.id === k)!.get(g.datos()),
  });
  const ley = h('div', { class: 'leyenda gr-leyenda' },
    h('span', {}, 'Arriba, los datos (se arrastran de costado). Cada flecha lleva un resultado al lugar donde se usa.'),
    h('span', { class: 'gr-ley traccion' }, 'tracción'), h('span', { class: 'gr-ley compresion' }, 'compresión'),
    h('span', { class: 'gr-ley control' }, 'control: verifica o no'));
  // zoom: «ajustar» hace entrar el tablero entero en el ancho (si es más ancho que el centro)
  const marco = h('div', { class: 'gr-marco' }, vista.el);
  const salida = h('output', {}, '100 %');
  const poner = (z: number) => { zoom = Math.min(1.4, Math.max(0.4, z)); vista!.el.style.zoom = String(zoom); salida.textContent = `${Math.round(zoom * 100)} %`; vista!.redibujar(); };
  const bz = (t: string, titulo: string, f: () => void) => { const b = h('button', { type: 'button', class: 'mini', title: titulo }, t); b.addEventListener('click', f); return b; };
  const ajustar = () => { const w = vista!.el.offsetWidth; poner(w > 0 ? Math.min(1, (marco.clientWidth - 8) / w) : 1); };
  c.append(h('div', { class: 'gr-zoom' }, bz('−', 'Alejar', () => poner((zoom ?? 1) - 0.1)), salida, bz('+', 'Acercar', () => poner((zoom ?? 1) + 0.1)), bz('Ajustar al ancho', 'Que entre todo el esquema', ajustar)), marco, ley);
  // la primera vez, si no entra, se ajusta solo (después de que el tablero se acomoda)
  if (zoom === null) setTimeout(() => { if (marco.isConnected) ajustar(); }, 120); else poner(zoom);
}
let zoom: number | null = null;

export type { NodoGrafo, ParamGrafo };
