/**
 * Grafo de fórmulas: cada cuenta es una tarjeta con su ecuación; cuando una ecuación usa el resultado de otra, una
 * flecha sale de debajo del símbolo que la otra calcula y cae justo encima del lugar de la ecuación donde se usa.
 * Idea tomada de FormulaDAG (koaning/wigglystuff, MIT): las flechas se deducen de las marcas [id] de cada ecuación,
 * las tarjetas van en filas según de cuántas cuentas dependen, cada resultado tiene un color que comparten su símbolo,
 * sus flechas y cada lugar donde se usa, y al pasar el mouse por una tarjeta se ve de qué depende y qué depende de ella.
 *
 * Además, para la cátedra: los datos se pueden arrastrar (o mover con el deslizador del panel) y toda la cadena se
 * recalcula con el motor de la app; las ecuaciones que dependen del dato muestran el número en lugar del símbolo
 * mientras se arrastra. Los controles dicen si verifican y, si no, qué hacer (y señalan los datos que conviene tocar).
 *
 * Colores: ni rojo ni azul para las variables (en la app son tracción y compresión); las tensiones de tracción y de
 * compresión sí llevan su rojo y su azul.
 */
import { fmt } from './estado';
import { h, mat, v, type H } from './comp';

// ---------------------------------------------------------------------------------------------- tipos
export interface ParamGrafo<D> {
  id: string;
  /** símbolo: «V», «σ_adm» (lo que sigue al «_» va de subíndice) */
  sim: string;
  nombre: string;
  unidad?: string; dec?: number;
  get(d: D): number;
  set(d: D, x: number): void;
  min: number; max: number; paso: number;
  /** de dónde sale en la app */
  fuente?: string;
  /** sale de la geometría o de otra parte: se muestra pero no se arrastra */
  fijo?: boolean;
}
export interface SiNo { texto: string; mueve?: string[] }
export interface NodoGrafo<R> {
  id: string;
  titulo: string;
  sim: string;
  /** lado derecho de la ecuación: texto con [id] donde se usa otro resultado o un dato */
  ec: string;
  valor(r: R): number | null | undefined;
  unidad?: string; dec?: number;
  /** la misma cuenta, con los valores de lo que usa: las pruebas comprueban que la ecuación dibujada es la del motor */
  f?: (x: Record<string, number>) => number;
  nota?: string;
  ref?: string;
  /** fila mínima en el tablero (0 = arriba), para acomodar una cuenta junto a las de su tema */
  fila?: number;
  /** viene de otro capítulo (o de la geometría): no tiene ecuación acá, solo el valor */
  externo?: string;
  /** tensiones: el color de la tarjeta (rojo tracción, azul compresión) */
  tension?: 'traccion' | 'compresion';
  control?: {
    /** la condición, con [id]: «≤ [fAdm]» */
    cond: string;
    ok(r: R): boolean | null;
    /** qué hacer si no verifica (y qué datos o cuentas tocar) */
    siNo: SiNo[];
  };
}
export interface CapituloGrafo<D, R> {
  id: string;
  titulo: string;
  intro: string;
  params: ParamGrafo<D>[];
  nodos: NodoGrafo<R>[];
  /** detalle de una cuenta (por ejemplo, la tabla nivel por nivel) */
  detalle?: (id: string, r: R) => H | null;
}
export interface Grafo<D, R> {
  datos(): D;
  calcular(d: D): R;
  capitulos: CapituloGrafo<D, R>[];
}

// ---------------------------------------------------------------------------------------------- texto
/** símbolo con subíndice: «σ_adm» → σ con «adm» abajo; sin «_», como mat (qh, Kz, Mv…) */
export function simbolo(s: string): string {
  const i = s.indexOf('_');
  if (i < 0) return mat(s);
  const base = s.slice(0, i), sub = s.slice(i + 1);
  return base.length === 1 ? v(base, sub) : `${mat(base)}<sub>${sub}</sub>`;
}
/** texto de una ecuación: como mat, y además «p_PB», «h_s» con su subíndice */
export function textoMat(t: string): string {
  return t.split(/([A-Za-zα-ωΑ-Ω]+_[A-Za-z0-9áéíóú⊥]+)/).map((x, i) => (i % 2 ? simbolo(x) : mat(x))).join('');
}
export const referencias = (ec: string) => [...ec.matchAll(/\[([A-Za-z][A-Za-z0-9_]*)\]/g)].map(m => m[1]);

const formato = (x: number | null | undefined, dec = 2) => (x === null || x === undefined || !isFinite(x) ? '—' : fmt(x, dec));

// ---------------------------------------------------------------------------------------------- disposición
/** fila de cada cuenta: los datos arriba (0) y cada cuenta una fila debajo de la más profunda que usa */
export function filas(ids: string[], usos: Record<string, string[]>, minimo: Record<string, number> = {}): Record<string, number> {
  const fila: Record<string, number> = {};
  const enCurso = new Set<string>();
  const de = (id: string): number => {
    if (fila[id] !== undefined) return fila[id];
    if (enCurso.has(id)) throw new Error(`la cuenta ${id} se usa a sí misma`);
    enCurso.add(id);
    const u = usos[id] ?? [];
    fila[id] = Math.max(minimo[id] ?? 0, u.length ? 1 + Math.max(...u.map(de)) : 0);
    enCurso.delete(id);
    return fila[id];
  };
  ids.forEach(de);
  return fila;
}

/** orden dentro de cada fila (baricentro, ida y vuelta) y carriles para las flechas que saltan filas */
export function ordenar(ids: string[], fila: Record<string, number>, aristas: [string, string][]): { capas: string[][]; rutas: string[][] } {
  const nf = Math.max(0, ...Object.values(fila)) + 1;
  const capas: string[][] = Array.from({ length: nf }, () => []);
  ids.forEach(id => capas[fila[id]].push(id));
  const rutas: string[][] = [];
  let nc = 0;
  const hijos = new Map<string, string[]>(), padres = new Map<string, string[]>();
  const unir = (a: string, b: string) => { hijos.set(a, [...(hijos.get(a) ?? []), b]); padres.set(b, [...(padres.get(b) ?? []), a]); };
  for (const [a, b] of aristas) {
    const r = [a];
    let prev = a;
    for (let k = fila[a] + 1; k < fila[b]; k++) { const c = `~${nc++}`; capas[k].push(c); unir(prev, c); r.push(c); prev = c; }
    unir(prev, b); r.push(b); rutas.push(r);
  }
  const pos = () => { const m = new Map<string, number>(); capas.forEach(c => c.forEach((id, i) => m.set(id, i / Math.max(1, c.length - 1)))); return m; };
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    const abajo = vuelta % 2 === 0;
    const orden = abajo ? capas.map((_, i) => i).slice(1) : capas.map((_, i) => i).slice(0, -1).reverse();
    for (const k of orden) {
      const p = pos();
      const bar = (id: string) => { const vec = (abajo ? padres : hijos).get(id) ?? []; return vec.length ? vec.reduce((s, x) => s + p.get(x)!, 0) / vec.length : p.get(id)!; };
      capas[k] = capas[k].map(id => ({ id, b: bar(id) })).sort((a, b) => a.b - b.b).map(x => x.id);
    }
  }
  return { capas, rutas };
}

// ---------------------------------------------------------------------------------------------- dibujo
const NS = 'http://www.w3.org/2000/svg';
const N_COLORES = 8;

export interface VistaGrafo {
  el: H;
  /** recalcular con los datos cambiados y actualizar números, ecuaciones y flechas */
  actualizar(r: unknown, revelar: Set<string>): void;
  elegir(id: string | null): void;
  redibujar(): void;
}

/**
 * Arma el tablero de un capítulo. «al» avisa cuando se elige una tarjeta o se arrastra un dato.
 */
export function vistaGrafo<D, R>(cap: CapituloGrafo<D, R>, r0: R, al: {
  elegir(id: string | null): void;
  arrastrar(id: string, x: number, fin: boolean): void;
  valorParam(id: string): number;
  elegido: string | null;
}): VistaGrafo {
  const porId = new Map<string, NodoGrafo<R> | ParamGrafo<D>>();
  cap.params.forEach(p => porId.set(p.id, p));
  cap.nodos.forEach(n => porId.set(n.id, n));
  const esNodo = (x: NodoGrafo<R> | ParamGrafo<D> | undefined): x is NodoGrafo<R> => !!x && 'ec' in x;
  // aristas: de lo usado a lo que lo usa (cada par una vez); la condición del control también usa
  const usos: Record<string, string[]> = {};
  cap.nodos.forEach(n => {
    const refs = [...referencias(n.ec), ...(n.control ? referencias(n.control.cond) : [])].filter(x => porId.has(x) && x !== n.id);
    usos[n.id] = [...new Set(refs)];
  });
  cap.params.forEach(p => (usos[p.id] = []));
  const ids = [...cap.params.map(p => p.id), ...cap.nodos.map(n => n.id)].filter(id => usos[id].length || Object.values(usos).some(u => u.includes(id)) || esNodo(porId.get(id)));
  const fila = filas(ids, usos, Object.fromEntries(cap.nodos.filter(n => n.fila !== undefined).map(n => [n.id, n.fila!])));
  // cada dato va justo encima de la primera cuenta que lo usa (así sus flechas son cortas)
  cap.params.forEach(p => {
    const usan = ids.filter(x => usos[x]?.includes(p.id)).map(x => fila[x]);
    if (usan.length && fila[p.id] !== undefined) fila[p.id] = Math.max(0, Math.min(...usan) - 1);
  });
  // y lo que viene de otro capítulo, también
  cap.nodos.filter(n => n.externo).forEach(n => {
    const usan = ids.filter(x => usos[x]?.includes(n.id)).map(x => fila[x]);
    if (usan.length) fila[n.id] = Math.max(0, Math.min(...usan) - 1);
  });
  const aristas: [string, string][] = [];
  ids.forEach(id => usos[id].forEach(u => aristas.push([u, id])));
  const { capas, rutas } = ordenar(ids, fila, aristas);
  // color de cada cosa que se usa (los datos, gris tinta; los resultados, la paleta)
  const productores = cap.nodos.filter(n => aristas.some(([a]) => a === n.id)).map(n => n.id);
  const color = new Map<string, number>(productores.map((id, i) => [id, i % N_COLORES]));

  // ---- DOM
  const tablero = h('div', { class: 'gr-tablero' });
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'gr-flechas');
  svg.setAttribute('aria-hidden', 'true');
  const filasEl: H[] = [];
  const tarjetas = new Map<string, H>(), carriles = new Map<string, H>();
  const valores = new Map<string, H>(), salidas = new Map<string, HTMLElement>();
  let r = r0;
  const uso = (id: string) => {
    const x = porId.get(id);
    const s = h('span', { class: `gr-uso${color.has(id) ? ` gc-${color.get(id)}` : ' gr-dato'}`, 'data-uso': id });
    s.innerHTML = x ? simbolo(x.sim) : id;
    return s;
  };
  // [id]: uso de otro resultado o de un dato · ^{…}: exponente (puede tener usos adentro)
  const ecuacion = (txt: string) => {
    const e = h('span', { class: 'gr-rhs' });
    const pila: HTMLElement[] = [e];
    txt.split(/(\[[A-Za-z][A-Za-z0-9_]*\]|\^\{|\})/).forEach(t => {
      const m = /^\[([A-Za-z][A-Za-z0-9_]*)\]$/.exec(t), arriba = pila[pila.length - 1];
      if (m) arriba.append(uso(m[1]));
      else if (t === '^{') { const sup = document.createElement('sup'); arriba.append(sup); pila.push(sup); }
      else if (t === '}' && pila.length > 1) pila.pop();
      else if (t) { const sp = h('span', {}); sp.innerHTML = textoMat(t); arriba.append(sp); }
    });
    return e;
  };
  capas.forEach(capa => {
    const f = h('div', { class: 'gr-fila' });
    capa.forEach(id => {
      if (id.startsWith('~')) { const c = h('div', { class: 'gr-carril', 'data-carril': id }); carriles.set(id, c); f.append(c); return; }
      const x = porId.get(id)!;
      if (!esNodo(x)) {
        // dato: chip arrastrable
        const p = x as ParamGrafo<D>;
        const chip = h('button', { type: 'button', class: `gr-param${p.fijo ? ' fijo' : ''}`, 'data-id': id, title: `${p.nombre}${p.fuente ? ` · ${p.fuente}` : ''}${p.fijo ? '' : '. Arrastrá de costado para cambiarlo (o con las flechas del teclado).'}` });
        const s = h('span', { class: 'gr-sal' }); s.innerHTML = simbolo(p.sim); salidas.set(id, s);
        const val = h('span', { class: 'gr-num' });
        valores.set(id, val);
        chip.append(s, h('span', { class: 'gr-igual' }, ' = '), val, h('span', { class: 'gr-nombre' }, p.nombre));
        if (p.fijo) chip.addEventListener('click', () => al.elegir(al.elegido === p.id ? null : p.id));
        else arrastrable(chip, p);
        tarjetas.set(id, chip);
        f.append(chip);
        return;
      }
      const n = x;
      const t = h('div', { class: `gr-nodo${n.tension ? ` ${n.tension}` : ''}${n.control ? ' control' : ''}`, 'data-id': id, tabindex: '0', role: 'button' });
      const sal = h('span', { class: `gr-sal${color.has(id) ? ` gc-${color.get(id)}` : ''}` }); sal.innerHTML = simbolo(n.sim); salidas.set(id, sal);
      const ec = n.externo ? h('div', { class: 'gr-ec' }, sal) : h('div', { class: 'gr-ec' }, sal, h('span', { class: 'gr-igual' }, ' = '), ecuacion(n.ec));
      const val = h('div', { class: 'gr-valor' });
      valores.set(id, val);
      if (n.externo) t.classList.add('externo');
      t.append(h('div', { class: 'gr-tit' }, n.titulo), ec);
      if (n.externo) t.append(h('div', { class: 'gr-de' }, `↳ ${n.externo}`));
      if (n.control) {
        // «≤ fadm» lleva el símbolo adelante; una condición completa («|σc| ≤ σbk») va sola
        const cond = h('div', { class: 'gr-cond' });
        if (/^[≤≥<>=]/.test(n.control.cond.trim())) { const sp = h('span', {}); sp.innerHTML = simbolo(n.sim) + ' '; cond.append(sp); }
        cond.append(ecuacion(n.control.cond));
        t.append(cond);
      }
      t.append(val);
      t.addEventListener('click', () => al.elegir(al.elegido === id ? null : id));
      t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); al.elegir(al.elegido === id ? null : id); } });
      tarjetas.set(id, t);
      f.append(t);
    });
    filasEl.push(f);
    tablero.append(f);
  });
  tablero.append(svg);

  // ---- resaltar lo que está antes y después
  const arriba = (id: string, s = new Set<string>()) => { (usos[id] ?? []).forEach(u => { if (!s.has(u)) { s.add(u); arriba(u, s); } }); return s; };
  const abajo = (id: string, s = new Set<string>()) => { ids.forEach(x => { if (usos[x]?.includes(id) && !s.has(x)) { s.add(x); abajo(x, s); } }); return s; };
  const enfocar = (id: string | null) => {
    tablero.classList.toggle('enfocado', !!id);
    if (!id) { tarjetas.forEach(t => t.classList.remove('activo')); svg.querySelectorAll('.gr-arista').forEach(p => p.classList.remove('activo')); return; }
    const s = new Set([id, ...arriba(id), ...abajo(id)]);
    tarjetas.forEach((t, k) => t.classList.toggle('activo', s.has(k)));
    svg.querySelectorAll<SVGElement>('.gr-arista').forEach(p => p.classList.toggle('activo', s.has(p.dataset.de!) && s.has(p.dataset.a!) && (arriba(id).has(p.dataset.de!) || p.dataset.de === id || abajo(id).has(p.dataset.a!) || p.dataset.a === id)));
  };
  tarjetas.forEach((t, id) => {
    t.addEventListener('mouseenter', () => enfocar(id));
    t.addEventListener('mouseleave', () => enfocar(al.elegido));
    t.addEventListener('focus', () => enfocar(id));
  });
  // un dato o un resultado: todos los lugares donde se usa se iluminan
  tablero.addEventListener('mouseover', e => {
    const u = (e.target as HTMLElement).closest<HTMLElement>('[data-uso], .gr-param');
    const id = u?.dataset.uso ?? u?.dataset.id ?? null;
    tablero.querySelectorAll('[data-uso]').forEach(x => x.classList.toggle('ligado', !!id && (x as HTMLElement).dataset.uso === id));
  });

  // ---- arrastrar un dato (mouse o dedo): 6 px por paso
  function arrastrable(chip: H, p: ParamGrafo<D>) {
    let x0 = 0, v0 = 0, movio = false, id = -1;
    chip.addEventListener('pointerdown', e => { id = e.pointerId; x0 = e.clientX; v0 = al.valorParam(p.id); movio = false; chip.setPointerCapture(id); chip.classList.add('arrastrando'); });
    chip.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const pasos = Math.round((e.clientX - x0) / 6);
      if (!pasos && !movio) return;
      movio = true;
      const x = Math.min(p.max, Math.max(p.min, +(v0 + pasos * p.paso).toFixed(6)));
      al.arrastrar(p.id, x, false);
    });
    const fin = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1; chip.classList.remove('arrastrando');
      if (movio) al.arrastrar(p.id, al.valorParam(p.id), true);
      else al.elegir(al.elegido === p.id ? null : p.id);
    };
    chip.addEventListener('pointerup', fin);
    chip.addEventListener('pointercancel', fin);
    chip.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const x = Math.min(p.max, Math.max(p.min, +(al.valorParam(p.id) + (e.key === 'ArrowRight' ? 1 : -1) * p.paso).toFixed(6)));
      al.arrastrar(p.id, x, true);
    });
  }

  // ---- números y ecuaciones (con los valores en lugar de los símbolos mientras se arrastra)
  const textoValor = (id: string): string => {
    const x = porId.get(id);
    if (!x) return '—';
    if (esNodo(x)) return formato(x.valor(r), x.dec);
    return formato(al.valorParam(id), (x as ParamGrafo<D>).dec);
  };
  let revelados = new Set<string>();
  const pintar = () => {
    valores.forEach((el, id) => {
      const x = porId.get(id)!;
      if (!esNodo(x)) { el.textContent = `${textoValor(id)}${x.unidad ? ` ${x.unidad}` : ''}`; return; }
      el.replaceChildren(h('span', { class: 'gr-num' }, textoValor(id)), x.unidad ? h('span', { class: 'u' }, ` ${x.unidad}`) : '');
      const t = tarjetas.get(id)!;
      if (x.control) {
        const ok = x.control.ok(r);
        t.classList.toggle('verifica', ok === true);
        t.classList.toggle('no-verifica', ok === false);
        el.append(h('span', { class: `chip-estado ${ok === null ? 'informativo' : ok ? 'verifica' : 'no-verifica'}` }, ok === null ? '—' : ok ? 'verifica' : 'no verifica'));
      }
    });
    // símbolos → números en las cuentas que dependen de lo que se arrastra
    tablero.querySelectorAll<HTMLElement>('[data-uso]').forEach(s => {
      const id = s.dataset.uso!;
      const x = porId.get(id);
      if (revelados.has(id)) { s.textContent = textoValor(id); s.classList.add('revelado'); }
      else if (s.classList.contains('revelado')) { s.innerHTML = x ? simbolo(x.sim) : id; s.classList.remove('revelado'); }
    });
    salidas.forEach((s, id) => {
      const x = porId.get(id);
      if (!esNodo(x)) return;                              // el chip del dato ya muestra su número
      if (revelados.has(id)) { s.textContent = textoValor(id); s.classList.add('revelado'); }
      else if (s.classList.contains('revelado')) { s.innerHTML = x ? simbolo(x.sim) : id; s.classList.remove('revelado'); }
    });
  };

  // ---- flechas
  const dibujar = () => {
    if (!tablero.isConnected) return;
    const base = tablero.getBoundingClientRect();
    const rel = (e: Element) => { const b = e.getBoundingClientRect(); return { l: b.left - base.left, r: b.right - base.left, t: b.top - base.top, b: b.bottom - base.top }; };
    svg.setAttribute('width', String(tablero.scrollWidth));
    svg.setAttribute('height', String(tablero.scrollHeight));
    svg.replaceChildren();
    const caja = filasEl.map(rel);
    // tallo: debajo del símbolo de salida (los datos: debajo del chip)
    const tallo = (id: string) => {
      const t = tarjetas.get(id)!, s = salidas.get(id)!;
      const bs = rel(s), bt = rel(t);
      return { x: (bs.l + bs.r) / 2, y: bt.b };
    };
    // por hueco entre filas, una vía horizontal por cada resultado que se corre de costado
    interface Tramo { de: string; a: string; xs: number[]; f0: number; punta: { x: number; y: number } }
    const tramos: Tramo[] = [];
    for (const ruta of rutas) {
      const de = ruta[0], a = ruta[ruta.length - 1];
      const t = tarjetas.get(a)!;
      const lugares = [...t.querySelectorAll<HTMLElement>(`.gr-ec [data-uso="${de}"], .gr-cond [data-uso="${de}"]`)];
      const st = tallo(de);
      const xsCarril = ruta.slice(1, -1).map(c => { const b = rel(carriles.get(c)!); return (b.l + b.r) / 2; });
      (lugares.length ? lugares : [t]).forEach(l => {
        const b = rel(l);
        const px = (b.l + b.r) / 2;
        tramos.push({ de, a, xs: [st.x, ...xsCarril, px], f0: fila[de], punta: { x: px, y: b.t - 2 } });
      });
    }
    const vias = new Map<number, string[]>();
    tramos.forEach(tr => tr.xs.forEach((x, k) => {
      if (k === tr.xs.length - 1 || Math.abs(tr.xs[k + 1] - x) < 1) return;
      const g = tr.f0 + k, l = vias.get(g) ?? [];
      if (!l.includes(tr.de)) l.push(tr.de);
      vias.set(g, l);
    }));
    // el hueco crece con la cantidad de vías (se ajusta y se vuelve a medir una vez)
    let cambio = false;
    filasEl.forEach((f, g) => {
      const n = vias.get(g)?.length ?? 0;
      const alto = `${Math.max(26, 14 + n * 8)}px`;
      if (g < filasEl.length - 1 && f.style.marginBottom !== alto) { f.style.marginBottom = alto; cambio = true; }
    });
    if (cambio) { requestAnimationFrame(dibujar); return; }
    vias.forEach(l => l.sort((a, b) => tallo(a).x - tallo(b).x));
    const yVia = (g: number, de: string) => {
      const l = vias.get(g)!, y0 = caja[g].b, y1 = caja[g + 1].t;
      return y0 + ((y1 - y0) * (l.indexOf(de) + 1)) / (l.length + 1);
    };
    const R = 6;
    for (const tr of tramos) {
      let d = `M ${tr.xs[0]} ${tallo(tr.de).y}`;
      tr.xs.forEach((x, k) => {
        if (k === tr.xs.length - 1) return;
        const nx = tr.xs[k + 1];
        if (Math.abs(nx - x) < 1) return;
        const y = yVia(tr.f0 + k, tr.de), s = Math.sign(nx - x), rr = Math.min(R, Math.abs(nx - x) / 2);
        d += ` L ${x} ${y - rr} Q ${x} ${y} ${x + s * rr} ${y} L ${nx - s * rr} ${y} Q ${nx} ${y} ${nx} ${y + rr}`;
      });
      d += ` L ${tr.punta.x} ${tr.punta.y - 6}`;
      const c = color.has(tr.de) ? `gc-${color.get(tr.de)}` : 'gr-dato';
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `gr-arista ${c}`);
      g.dataset.de = tr.de; g.dataset.a = tr.a;
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      const pu = document.createElementNS(NS, 'path');
      pu.setAttribute('d', `M ${tr.punta.x} ${tr.punta.y} l -3.5 -7 h 7 z`);
      pu.setAttribute('class', 'punta');
      g.append(p, pu);
      svg.append(g);
    }
    enfocar(al.elegido);
  };

  const elegir = (id: string | null) => {
    tarjetas.forEach((t, k) => t.classList.toggle('elegido', k === id));
    enfocar(id);
  };
  pintar();
  elegir(al.elegido);
  // primera medida: cuando el tablero ya está en la página
  const obs = new ResizeObserver(() => requestAnimationFrame(dibujar));
  requestAnimationFrame(() => { if (tablero.isConnected) obs.observe(tablero); dibujar(); });
  if (document.fonts?.ready) document.fonts.ready.then(() => requestAnimationFrame(dibujar));
  return {
    el: tablero,
    actualizar(nr, rev) { r = nr as R; revelados = rev; pintar(); requestAnimationFrame(dibujar); },
    elegir,
    redibujar: () => requestAnimationFrame(dibujar),
  };
}

/** cuentas que dependen (directa o indirectamente) de un dato */
export function dependientes<D, R>(cap: CapituloGrafo<D, R>, id: string): Set<string> {
  const usos = new Map(cap.nodos.map(n => [n.id, new Set([...referencias(n.ec), ...(n.control ? referencias(n.control.cond) : [])])]));
  const s = new Set<string>();
  let crece = true;
  while (crece) {
    crece = false;
    usos.forEach((u, n) => { if (!s.has(n) && (u.has(id) || [...u].some(x => s.has(x)))) { s.add(n); crece = true; } });
  }
  return s;
}
