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
import { esc, h, mat, v, type H } from './comp';

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
  /** momento del procedimiento al que pertenece (un polígono de color agrupa las cuentas de cada uno) */
  sector?: string;
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
  /** los momentos del procedimiento, en orden (cada cuenta dice el suyo en «sector») */
  sectores?: string[];
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
  return base.length === 1 ? v(base, sub) : `${mat(base)}<sub>${esc(sub)}</sub>`;
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
      const bar = (id: string) => { const vec = [...(padres.get(id) ?? []), ...(hijos.get(id) ?? [])]; return vec.length ? vec.reduce((s, x) => s + p.get(x)!, 0) / vec.length : p.get(id)!; };
      capas[k] = capas[k].map(id => ({ id, b: bar(id) })).sort((a, b) => a.b - b.b).map(x => x.id);
    }
  }
  // cruces entre la fila k y la k+1
  const cruces = (k: number, arriba = capas[k], abajoC = capas[k + 1]) => {
    if (!arriba || !abajoC) return 0;
    const ia = new Map(arriba.map((id, i) => [id, i])), ib = new Map(abajoC.map((id, i) => [id, i]));
    const seg: [number, number][] = [];
    arriba.forEach(id => (hijos.get(id) ?? []).forEach(c => { if (ib.has(c)) seg.push([ia.get(id)!, ib.get(c)!]); }));
    let n = 0;
    for (let i = 0; i < seg.length; i++) for (let j = i + 1; j < seg.length; j++) if ((seg[i][0] - seg[j][0]) * (seg[i][1] - seg[j][1]) < 0) n++;
    return n;
  };
  const costo = (k: number, fila: string[]) => (k > 0 ? cruces(k - 1, capas[k - 1], fila) : 0) + cruces(k, fila, capas[k + 1]);
  function* permutaciones(a: string[]): Generator<string[]> {
    if (a.length <= 1) { yield a; return; }
    for (let i = 0; i < a.length; i++) for (const r of permutaciones([...a.slice(0, i), ...a.slice(i + 1)])) yield [a[i], ...r];
  }
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    let mejoro = false;
    for (let k = 0; k < capas.length; k++) {
      const c0 = costo(k, capas[k]);
      if (!c0) continue;
      if (capas[k].length <= 6) {
        let mejor = capas[k], mc = c0;
        for (const pm of permutaciones(capas[k])) { const c = costo(k, pm); if (c < mc) { mc = c; mejor = pm; if (!c) break; } }
        if (mc < c0) { capas[k] = mejor; mejoro = true; }
      } else {
        for (let i = 0; i + 1 < capas[k].length; i++) {
          const pm = [...capas[k]]; [pm[i], pm[i + 1]] = [pm[i + 1], pm[i]];
          if (costo(k, pm) < costo(k, capas[k])) { capas[k] = pm; mejoro = true; }
        }
      }
    }
    if (!mejoro) break;
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
  /** el dato o la cuenta original de una copia («A@3» → «A») */
  const orig = (id: string) => id.split('@')[0];
  // aristas: de lo usado a lo que lo usa (cada par una vez); la condición del control también usa
  const usos: Record<string, string[]> = {};
  cap.nodos.forEach(n => {
    const refs = [...referencias(n.ec), ...(n.control ? referencias(n.control.cond) : [])].filter(x => porId.has(x) && x !== n.id);
    usos[n.id] = [...new Set(refs)];
  });
  cap.params.forEach(p => (usos[p.id] = []));
  const ids = [...cap.params.map(p => p.id), ...cap.nodos.map(n => n.id)].filter(id => usos[id].length || Object.values(usos).some(u => u.includes(id)) || esNodo(porId.get(id)));
  const fila = filas(ids, usos, Object.fromEntries(cap.nodos.filter(n => n.fila !== undefined).map(n => [n.id, n.fila!])));
  // capas como «dot»: después del camino más largo, cada cuenta baja hasta justo encima de la primera que la usa
  // (una cuenta que se usa al final no queda arriba de todo, con flechas largas)
  for (let cambio = true, vuelta = 0; cambio && vuelta < 50; vuelta++) {
    cambio = false;
    for (const id of ids) {
      const usan = ids.filter(x => usos[x]?.includes(id)).map(x => fila[x]);
      if (!usan.length) continue;
      const tarde = Math.min(...usan) - 1;
      if (tarde > fila[id]) { fila[id] = tarde; cambio = true; }
    }
  }
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
  // copias (como en los cuadros sinópticos): un dato o un resultado de otro capítulo que se usa en filas distintas
  // se repite justo encima de cada una, con su mismo color y su mismo valor; así no hay flechas largas que crucen todo
  const copiasDe = new Map<string, string[]>();
  for (const id of [...ids]) {
    const x = porId.get(id);
    if (!x || (esNodo(x) && !x.externo)) continue;
    const consumidores = ids.filter(c => usos[c]?.includes(id));
    const filasC = [...new Set(consumidores.map(c => fila[c]))].sort((a, b) => a - b);
    filasC.slice(1).forEach(k => {
      const copia = `${id}@${k}`;
      porId.set(copia, x); usos[copia] = []; ids.push(copia); fila[copia] = k - 1;
      consumidores.filter(c => fila[c] === k).forEach(c => { usos[c] = usos[c].map(u => (u === id ? copia : u)); });
      copiasDe.set(id, [...(copiasDe.get(id) ?? []), copia]);
    });
  }
  const aristas: [string, string][] = [];
  ids.forEach(id => usos[id].forEach(u => aristas.push([u, id])));
  const { capas, rutas } = ordenar(ids, fila, aristas);
  // color de cada cosa que se usa (los datos, gris tinta; los resultados, la paleta)
  // los resultados que se usan y los datos que usan varias cuentas llevan color (los datos de una sola cuenta, gris:
  // quedan pegados a su cuenta); dos colores iguales no comparten filas, así cada flecha se distingue de sus vecinas
  const consumidores = (id: string) => aristas.filter(([a]) => a === id).map(([, b]) => b);
  const conColor = ids.filter(id => !id.includes('@') && (esNodo(porId.get(id)) && !(porId.get(id) as NodoGrafo<R>).externo ? consumidores(id).length > 0 : consumidores(id).length > 1 || copiasDe.has(id) || (esNodo(porId.get(id)) && consumidores(id).length > 0)));
  const tramo = (id: string): [number, number] => [fila[id], Math.max(fila[id], ...consumidores(id).map(x => fila[x]))];
  const color = new Map<string, number>();
  [...conColor].sort((a, b) => fila[a] - fila[b]).forEach(id => {
    const [a0, a1] = tramo(id), uso = new Array(N_COLORES).fill(0);
    color.forEach((c, otro) => { const [b0, b1] = tramo(otro); if (a0 <= b1 && b0 <= a1) uso[c]++; });
    const libre = uso.findIndex(x => x === 0);
    color.set(id, libre >= 0 ? libre : uso.indexOf(Math.min(...uso)));
  });
  copiasDe.forEach((cs, id) => { if (color.has(id)) cs.forEach(c => color.set(c, color.get(id)!)); });

  // ---- DOM
  const tablero = h('div', { class: 'gr-tablero' });
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'gr-flechas');
  svg.setAttribute('aria-hidden', 'true');
  const tarjetas = new Map<string, H>();
  const valores = new Map<string, H>(), salidas = new Map<string, HTMLElement>();
  let r = r0;
  const uso = (id: string) => {
    const x = porId.get(id);
    const s = h('span', { class: `gr-uso${color.has(id) ? ` gc-${color.get(id)}` : ' gr-dato'}`, 'data-uso': id });
    s.innerHTML = x ? simbolo(x.sim) : esc(id);
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
    const f = tablero;
    capa.forEach(id => {
      if (id.startsWith('~')) return;
      const x = porId.get(id)!;
      if (!esNodo(x)) {
        // dato: chip arrastrable
        const p = x as ParamGrafo<D>;
        const chip = h('button', { type: 'button', class: `gr-param${id.includes('@') ? ' copia' : ''}${p.fijo ? ' fijo' : ''}${color.has(id) ? ` compartido gc-${color.get(id)}` : ''}`, 'data-id': id, title: `${p.nombre}${p.fuente ? ` · ${p.fuente}` : ''}${p.fijo ? '' : '. Arrastrá de costado para cambiarlo (o con las flechas del teclado).'}` });
        const s = h('span', { class: `gr-sal${color.has(id) ? ` gc-${color.get(id)}` : ''}` }); s.innerHTML = simbolo(p.sim); salidas.set(id, s);
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
      const t = h('div', { class: `gr-nodo${id.includes('@') ? ' copia' : ''}${n.tension ? ` ${n.tension}` : ''}${n.control ? ' control' : ''}`, 'data-id': id, tabindex: '0', role: 'button' });
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
      t.addEventListener('click', () => al.elegir(al.elegido === orig(id) ? null : orig(id)));
      t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); al.elegir(al.elegido === orig(id) ? null : orig(id)); } });
      tarjetas.set(id, t);
      f.append(t);
    });
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
    const id0 = u?.dataset.uso ?? u?.dataset.id ?? null, id = id0 === null ? null : orig(id0);
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
    return formato(al.valorParam(orig(id)), (x as ParamGrafo<D>).dec);
  };
  let revelados = new Set<string>();
  const pintar = () => {
    valores.forEach((el, id) => {
      const x = porId.get(id)!;
      if (!esNodo(x)) { el.textContent = `${textoValor(id)}${x.unidad ? ` ${x.unidad}` : ''}`; return; }
      const simV = h('span', { class: `gr-sal gr-sal-v${color.has(id) ? ` gc-${color.get(id)}` : ''}` }); simV.innerHTML = simbolo(x.sim);
      el.replaceChildren(...(x.externo ? [] : [simV, h('span', { class: 'gr-igual' }, ' = ')]), h('span', { class: 'gr-num' }, textoValor(id)), x.unidad ? h('span', { class: 'u' }, ` ${x.unidad}`) : '');
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
      else if (s.classList.contains('revelado')) { s.innerHTML = x ? simbolo(x.sim) : esc(id); s.classList.remove('revelado'); }
    });
    salidas.forEach((s, id0) => {
      const id = id0;
      const x = porId.get(id);
      if (!esNodo(x)) return;                              // el chip del dato ya muestra su número
      if (revelados.has(orig(id))) { s.textContent = textoValor(id); s.classList.add('revelado'); }
      else if (s.classList.contains('revelado')) { s.innerHTML = x ? simbolo(x.sim) : esc(id); s.classList.remove('revelado'); }
    });
  };

  // ---- posiciones (Sugiyama con puertos, como «dot» de Graphviz): cada flecha va del símbolo de salida al lugar
  // exacto de la ecuación que lo usa; las tarjetas y los datos se corren para que esos dos puntos queden alineados
  // (flecha recta, sin codos) y el orden de cada fila sale de esos puntos (menos cruces).
  const xc = new Map<string, number>();
  let huecos = capas.map(() => 30);
  let cajaFila: { t: number; b: number }[] = [];
  const PAD = 14;
  const ancho = (id: string) => (id.startsWith('~') ? 4 : tarjetas.get(id)!.offsetWidth);
  const sep = (a: string, b: string) => (ancho(a) + ancho(b)) / 2 + (a.startsWith('~') || b.startsWith('~') ? 10 : 18);
  // sector de cada cosa: el suyo o, para datos y resultados de otro capítulo, el de quien los usa
  const sectorDe = (id: string): string | undefined => {
    if (id.startsWith('~')) return undefined;
    const x = porId.get(id);
    if (x && esNodo(x) && x.sector && !id.includes('@')) return x.sector;
    // un dato (o un resultado de otro capítulo) va con quien lo usa; si lo usan cuentas de sectores distintos, afuera
    const s2 = new Set(aristas.filter(([a]) => a === id).map(([, b]) => { const y = porId.get(b); return y && esNodo(y) ? y.sector : undefined; }));
    return s2.size === 1 ? [...s2][0] : undefined;
  };
  // enlaces entre filas vecinas, con el punto de enganche de cada punta (respecto del centro de su tarjeta)
  interface Enlace { otro: string; mio: number; suyo: number; arriba: boolean }
  const enlaces = new Map<string, Enlace[]>();
  // carriles de las flechas largas: sobre la recta que va del origen al destino
  const carril = new Map<string, { u: string; v: string; ou: number; ov: number; t: number }>();
  const medirEnlaces = () => {
    enlaces.clear(); carril.clear();
    const zz = (() => { const b = tablero.getBoundingClientRect(); return b.width / (tablero.offsetWidth || 1) || 1; })();
    const desdeCentro = (el: Element, t: Element) => { const a = el.getBoundingClientRect(), b = t.getBoundingClientRect(); return ((a.left + a.right) / 2 - (b.left + b.right) / 2) / zz; };
    const tallo0 = (u: string) => desdeCentro(salidas.get(u)!, tarjetas.get(u)!);
    const puerto0 = (v: string, u: string) => { const t = tarjetas.get(v)!, l = t.querySelector(`.gr-ec [data-uso="${orig(u)}"], .gr-cond [data-uso="${orig(u)}"]`); return l ? desdeCentro(l, t) : 0; };
    for (const ruta of rutas) {
      const u = ruta[0], v = ruta[ruta.length - 1];
      if (ruta.length > 2) { const ou = tallo0(u), ov = puerto0(v, u); ruta.slice(1, -1).forEach((c, i) => carril.set(c, { u, v, ou, ov, t: (i + 1) / (ruta.length - 1) })); }
      for (let k = 0; k + 1 < ruta.length; k++) {
        const a = ruta[k], b = ruta[k + 1];
        const oa = a === u ? tallo0(u) : 0, ob = b === v ? puerto0(v, u) : 0;
        enlaces.set(a, [...(enlaces.get(a) ?? []), { otro: b, mio: oa, suyo: ob, arriba: false }]);
        enlaces.set(b, [...(enlaces.get(b) ?? []), { otro: a, mio: ob, suyo: oa, arriba: true }]);
      }
    }
  };
  const deseado = (id: string, cuales?: boolean) => {
    const cr = carril.get(id);
    if (cr) { const a = xc.get(cr.u)! + cr.ou, b = xc.get(cr.v)! + cr.ov; return a + (b - a) * cr.t; }
    const ls = (enlaces.get(id) ?? []).filter(e => cuales === undefined || e.arriba === cuales);
    const todos = ls.length ? ls : enlaces.get(id) ?? [];
    return todos.length ? todos.reduce((s2, e) => s2 + xc.get(e.otro)! + e.suyo - e.mio, 0) / todos.length : xc.get(id)!;
  };
  const ubicar = (c: string[], desea: number[]) => {
    // lo más cerca posible de lo deseado sin pisarse: ida empujando a la derecha, vuelta a la izquierda, promedio
    const ida = [...desea], vuelta = [...desea];
    for (let i = 1; i < c.length; i++) ida[i] = Math.max(ida[i], ida[i - 1] + sep(c[i - 1], c[i]));
    for (let i = c.length - 2; i >= 0; i--) vuelta[i] = Math.min(vuelta[i], vuelta[i + 1] - sep(c[i], c[i + 1]));
    const x = c.map((_, i) => (ida[i] + vuelta[i]) / 2);
    for (let i = 1; i < c.length; i++) x[i] = Math.max(x[i], x[i - 1] + sep(c[i - 1], c[i]));
    c.forEach((id, i) => xc.set(id, x[i]));
  };
  const colocarX = (inicio: boolean) => {
    if (inicio) capas.forEach(c => { let x = 0; c.forEach((id, i) => { if (i) x += sep(c[i - 1], id); xc.set(id, x); }); const m = x / 2; c.forEach(id => xc.set(id, xc.get(id)! - m)); });
    for (let it = 0; it < 30; it++) {
      const abajo = it % 2 === 0;
      for (const k of abajo ? capas.map((_, i) => i) : capas.map((_, i) => i).reverse()) {
        const c = capas[k];
        if (c.length) ubicar(c, c.map(id => deseado(id, abajo)));
      }
    }
  };
  /** cada fila se reordena según dónde quiere estar cada cosa, con los sectores juntos */
  const reordenar = () => {
    capas.forEach((c, k) => {
      // manda dónde se usa cada cosa (el lugar en la ecuación de abajo); si no se usa en la fila de abajo, de dónde viene
      const clave = new Map(c.map(id => [id, (enlaces.get(id) ?? []).some(e => !e.arriba) ? deseado(id, false) : deseado(id)]));
      const grupos = new Map<string, string[]>();
      c.forEach(id => { const g = sectorDe(id) ?? `·${id}`; grupos.set(g, [...(grupos.get(g) ?? []), id]); });
      const media = (ids: string[]) => ids.reduce((s2, id) => s2 + clave.get(id)!, 0) / ids.length;
      capas[k] = [...grupos.values()].sort((a, b) => media(a) - media(b)).flatMap(g => g.sort((a, b) => clave.get(a)! - clave.get(b)!));
    });
  };
  /** enderezar: lo que tiene una sola flecha se corre hasta quedar alineado con su punta, si hay lugar */
  const enderezar = () => {
    for (let vuelta = 0; vuelta < 2; vuelta++) capas.forEach(c => c.forEach((id, i) => {
      if ((enlaces.get(id) ?? []).length !== 1) return;
      const lo = i > 0 ? xc.get(c[i - 1])! + sep(c[i - 1], id) : -Infinity, hi = i + 1 < c.length ? xc.get(c[i + 1])! - sep(id, c[i + 1]) : Infinity;
      if (lo <= hi) xc.set(id, Math.min(hi, Math.max(lo, deseado(id))));
    }));
  };
  const colocarTodo = () => {
    medirEnlaces();
    colocarX(true); reordenar(); colocarX(false); reordenar(); colocarX(false); enderezar();
    // grupos sin flechas entre sí: uno al lado del otro (si no, nada los acerca y uno se va lejos)
    const grupo = new Map<string, number>();
    let ng = 0;
    for (const id of xc.keys()) {
      if (grupo.has(id)) continue;
      const pila = [id]; grupo.set(id, ng);
      while (pila.length) { const a = pila.pop()!; (enlaces.get(a) ?? []).forEach(e => { if (!grupo.has(e.otro)) { grupo.set(e.otro, ng); pila.push(e.otro); } }); }
      ng++;
    }
    if (ng > 1) {
      const span = Array.from({ length: ng }, (_, g) => { const ids2 = [...xc.keys()].filter(id => grupo.get(id) === g); return { g, l: Math.min(...ids2.map(id => xc.get(id)! - ancho(id) / 2)), r: Math.max(...ids2.map(id => xc.get(id)! + ancho(id) / 2)) }; })
        .sort((a, b) => a.l - b.l);
      let x0 = span[0].l;
      span.forEach(sp => { const d = x0 - sp.l; xc.forEach((x, id) => { if (grupo.get(id) === sp.g) xc.set(id, x + d); }); x0 += sp.r - sp.l + 48; });
    }
    const izq = Math.min(...[...xc.entries()].map(([id, x]) => x - ancho(id) / 2));
    xc.forEach((x, id) => xc.set(id, x - izq + PAD + 6));
  };
  const colocarY = () => {
    let y = PAD + 16;
    cajaFila = capas.map((c, k) => {
      const alto = Math.max(0, ...c.filter(id => !id.startsWith('~')).map(id => tarjetas.get(id)!.offsetHeight));
      const caja = { t: y, b: y + alto };
      y += alto + huecos[k];
      return caja;
    });
    capas.forEach((c, k) => c.forEach(id => { if (id.startsWith('~')) return; const t = tarjetas.get(id)!; t.style.left = `${xc.get(id)! - t.offsetWidth / 2}px`; t.style.top = `${cajaFila[k].t}px`; }));
    const derecha = Math.max(...[...xc.entries()].map(([id, x]) => x + ancho(id) / 2));
    tablero.style.width = `${derecha + PAD + 6}px`;
    tablero.style.height = `${(cajaFila.at(-1)?.b ?? 0) + PAD + 6}px`;
  };
  let colocado = false;

  // ---- sectores: un polígono ortogonal de color debajo de las tarjetas de cada momento del procedimiento
  const svgSect = document.createElementNS(NS, 'svg');
  svgSect.setAttribute('class', 'gr-sectores');
  svgSect.setAttribute('aria-hidden', 'true');
  tablero.prepend(svgSect);
  const nombresSector = cap.sectores ?? [];
  const dibujarSectores = () => {
    svgSect.setAttribute('width', String(tablero.offsetWidth));
    svgSect.setAttribute('height', String(tablero.offsetHeight));
    svgSect.replaceChildren();
    const P = 9;
    nombresSector.forEach((nom, si) => {
      // en cada fila, una caja por tramo seguido de tarjetas del sector (si hay una ajena en el medio, se corta);
      // cada caja se une con la más cercana de la fila siguiente del sector: queda un polígono ortogonal
      type Caja = { k: number; l: number; r: number; t: number; b: number };
      const filasS: Caja[][] = [];
      capas.forEach((c, k) => {
        const tramos2: string[][] = [];
        let actual: string[] = [];
        c.forEach(id => {
          if (id.startsWith('~')) return;
          if (sectorDe(id) === nom) actual.push(id);
          else if (actual.length) { tramos2.push(actual); actual = []; }
        });
        if (actual.length) tramos2.push(actual);
        if (!tramos2.length) return;
        filasS.push(tramos2.map(ids => ({
          k, l: Math.min(...ids.map(id => xc.get(id)! - ancho(id) / 2)) - P, r: Math.max(...ids.map(id => xc.get(id)! + ancho(id) / 2)) + P,
          t: Math.min(...ids.map(id => tarjetas.get(id)!.offsetTop)) - P, b: Math.max(...ids.map(id => tarjetas.get(id)!.offsetTop + tarjetas.get(id)!.offsetHeight)) + P,
        })));
      });
      if (!filasS.length) return;
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `gr-sector gs-${si % 7}`);
      const rect = (x: number, y: number, w: number, hh: number) => { const r = document.createElementNS(NS, 'rect'); r.setAttribute('x', String(x)); r.setAttribute('y', String(y)); r.setAttribute('width', String(Math.max(0, w))); r.setAttribute('height', String(Math.max(0, hh))); r.setAttribute('rx', '6'); g.append(r); };
      const primera = filasS[0][0];
      primera.t -= 14;                                                      // lugar para el nombre
      filasS.forEach((cajas, i) => {
        cajas.forEach(f => rect(f.l, f.t, f.r - f.l, f.b - f.t));
        const sig = filasS[i + 1];
        if (!sig) return;
        // cada caja de abajo se cuelga de la de arriba más cercana (y si no, la de arriba de la de abajo más cercana)
        const dist = (a: Caja, b: Caja) => Math.max(0, Math.max(a.l, b.l) - Math.min(a.r, b.r));
        // un puente no tapa tarjetas de otro sector: si las taparía, el sector queda en islas del mismo color
        const ajenas = [...tarjetas.entries()].filter(([id]) => sectorDe(id) !== nom).map(([, t]) => ({ l: t.offsetLeft, r: t.offsetLeft + t.offsetWidth, t: t.offsetTop, b: t.offsetTop + t.offsetHeight }));
        const libre = (l: number, r: number, t: number, b: number) => !ajenas.some(x => x.l < r && l < x.r && x.t < b && t < x.b);
        const puente = (f: Caja, n: Caja) => {
          const l = Math.max(f.l, n.l), r = Math.min(f.r, n.r);
          if (l < r - 24 && libre(l, r, f.b, n.t)) rect(l, f.b - 6, r - l, n.t - f.b + 12);
        };
        sig.forEach(n => puente(cajas.reduce((m, f) => (dist(f, n) < dist(m, n) ? f : m)), n));
        cajas.forEach(f => { if (!sig.some(n => dist(f, n) === 0)) puente(f, sig.reduce((m, n) => (dist(f, n) < dist(f, m) ? n : m))); });
      });
      const tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', String(primera.l + 8)); tx.setAttribute('y', String(primera.t + 13));
      tx.textContent = nom;
      svgSect.append(g, tx);
      tx.setAttribute('class', `gr-sector-nombre gs-${si % 7}`);
    });
  };

  // ---- flechas
  const dibujar = () => {
    if (!tablero.isConnected) return;
    if (!colocado) { colocarTodo(); colocarY(); colocado = true; }
    const base = tablero.getBoundingClientRect();
    const z = base.width / (tablero.offsetWidth || 1) || 1;
    const rel = (e: Element) => { const b = e.getBoundingClientRect(); return { l: (b.left - base.left) / z, r: (b.right - base.left) / z, t: (b.top - base.top) / z, b: (b.bottom - base.top) / z }; };
    svg.setAttribute('width', String(tablero.scrollWidth));
    svg.setAttribute('height', String(tablero.scrollHeight));
    svg.replaceChildren();
    const caja = cajaFila;
    // tallo: debajo del símbolo de salida (los datos: debajo del chip)
    const tallo = (id: string) => {
      const t = tarjetas.get(id)!, s = salidas.get(id)!;
      const bs = rel(s), bt = rel(t);
      return { x: (bs.l + bs.r) / 2, y: bt.b };
    };
    interface Tramo { de: string; a: string; xs: number[]; f0: number; punta: { x: number; y: number }; lugar: HTMLElement | null }
    const tramos: Tramo[] = [];
    for (const ruta of rutas) {
      const de = ruta[0], a = ruta[ruta.length - 1];
      const t = tarjetas.get(a)!;
      const lugares = [...t.querySelectorAll<HTMLElement>(`.gr-ec [data-uso="${orig(de)}"], .gr-cond [data-uso="${orig(de)}"]`)];
      const st = tallo(de);
      const xsCarril = ruta.slice(1, -1).map(c => xc.get(c)!);
      (lugares.length ? lugares : [t]).forEach(l => {
        const b = rel(l);
        const px = (b.l + b.r) / 2;
        // menos de 5 px de diferencia: recta (un codo así no se ve y estorba)
        const xs = [st.x, ...xsCarril, px];
        for (let k = 1; k < xs.length; k++) if (Math.abs(xs[k] - xs[k - 1]) < 5) xs[k] = xs[k - 1];
        tramos.push({ de, a, xs, f0: fila[de], punta: { x: xs[xs.length - 1], y: rel(t).t }, lugar: l === t ? null : l });
      });
    }
    // vías: en cada hueco, una por cada resultado que se corre de costado, con sus tramos horizontales
    interface Via { de: string; seg: [number, number][]; bajan: number[]; suben: number[] }
    const vias = new Map<number, Via[]>();
    tramos.forEach(tr => tr.xs.forEach((x, k) => {
      if (k === tr.xs.length - 1 || tr.xs[k + 1] === x) return;
      const g = tr.f0 + k, l = vias.get(g) ?? [];
      let v = l.find(y => y.de === tr.de);
      if (!v) { v = { de: tr.de, seg: [], bajan: [], suben: [] }; l.push(v); }
      v.seg.push([Math.min(x, tr.xs[k + 1]), Math.max(x, tr.xs[k + 1])]); v.suben.push(x); v.bajan.push(tr.xs[k + 1]);
      vias.set(g, l);
    }));
    // las líneas verticales que cruzan el hueco sin correrse (las rectas) también cuentan para los cruces
    const rectas = new Map<number, number[]>();
    tramos.forEach(tr => tr.xs.forEach((x, k) => { if (k < tr.xs.length - 1 && tr.xs[k + 1] === x) rectas.set(tr.f0 + k, [...(rectas.get(tr.f0 + k) ?? []), x]); }));
    // cruces si «a» va por encima de «b»: la bajada de «b» desde arriba corta la horizontal de «a», y la bajada de
    // «a» hacia abajo corta la horizontal de «b»
    const dentro = (x: number, [l, r]: [number, number]) => x > l + 0.5 && x < r - 0.5;
    const cruza = (a: Via, b: Via) => b.suben.reduce((n, x) => n + a.seg.filter(sg => dentro(x, sg)).length, 0) + a.bajan.reduce((n, x) => n + b.seg.filter(sg => dentro(x, sg)).length, 0);
    const costo = (o: Via[]) => { let n = 0; for (let i = 0; i < o.length; i++) for (let j = i + 1; j < o.length; j++) n += cruza(o[i], o[j]); return n; };
    function* perm(a: Via[]): Generator<Via[]> { if (a.length <= 1) { yield a; return; } for (let i = 0; i < a.length; i++) for (const r of perm([...a.slice(0, i), ...a.slice(i + 1)])) yield [a[i], ...r]; }
    vias.forEach((l, g) => {
      // punto de partida: las que van a la derecha, de la que sale más a la derecha a la de más a la izquierda
      let mejor = [...l].sort((a, b) => (b.suben[0] - a.suben[0]));
      let mc = costo(mejor);
      if (mc && l.length <= 7) { for (const o of perm(l)) { const c = costo(o); if (c < mc) { mc = c; mejor = o; if (!c) break; } } }
      else for (let vuelta = 0; mc && vuelta < 8; vuelta++) for (let i = 0; i + 1 < mejor.length; i++) { const o = [...mejor]; [o[i], o[i + 1]] = [o[i + 1], o[i]]; const c = costo(o); if (c < mc) { mc = c; mejor = o; } }
      vias.set(g, mejor);
    });
    // el hueco entre filas crece con la cantidad de vías (se ajusta y se vuelve a dibujar)
    const nuevos = capas.map((_, g) => Math.max(34, 22 + (vias.get(g)?.length ?? 0) * 9));
    if (nuevos.some((x, g) => x !== huecos[g])) { huecos = nuevos; colocarY(); dibujar(); return; }
    const yVia = (g: number, de: string) => {
      const l = vias.get(g)!, y0 = caja[g].b, y1 = caja[g + 1].t;
      return y0 + ((y1 - y0) * (l.findIndex(v => v.de === de) + 1)) / (l.length + 1);
    };
    const R = 6;
    for (const tr of tramos) {
      let d = `M ${tr.xs[0]} ${tallo(tr.de).y}`;
      tr.xs.forEach((x, k) => {
        if (k === tr.xs.length - 1) return;
        const nx = tr.xs[k + 1];
        if (nx === x) return;
        const y = yVia(tr.f0 + k, tr.de), s2 = Math.sign(nx - x), rr = Math.min(R, Math.abs(nx - x) / 2);
        d += ` L ${x} ${y - rr} Q ${x} ${y} ${x + s2 * rr} ${y} L ${nx - s2 * rr} ${y} Q ${nx} ${y} ${nx} ${y + rr}`;
      });
      d += ` L ${tr.punta.x} ${tr.punta.y}`;
      const c = color.has(tr.de) ? `gc-${color.get(tr.de)}` : 'gr-dato';
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `gr-arista ${c}`);
      g.dataset.de = tr.de; g.dataset.a = tr.a;
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      // un punto donde sale (borde de abajo) y otro donde llega (borde de arriba)
      const punto = (x: number, y: number) => { const c2 = document.createElementNS(NS, 'circle'); c2.setAttribute('cx', String(x)); c2.setAttribute('cy', String(y)); c2.setAttribute('r', '3.6'); c2.setAttribute('class', 'punta'); return c2; };
      g.append(p, punto(tr.xs[0], tallo(tr.de).y), punto(tr.punta.x, tr.punta.y));
      svg.append(g);
    }
    // franjas: la columna de color que une el borde de la tarjeta con la variable que llega (de arriba) y con el
    // resultado que sale (hasta abajo, pasando por el renglón del valor)
    tarjetas.forEach(t => t.querySelectorAll(':scope > .gr-franja').forEach(f => f.remove()));
    const franja = (t: HTMLElement, el: Element, desdeArriba: boolean, clase: string) => {
      const bt = rel(t), be = rel(el), bl = t.clientLeft, btop = t.clientTop;
      const f = h('span', { class: `gr-franja ${clase}` });
      f.style.left = `${be.l - bt.l - bl - 2}px`;
      f.style.width = `${be.r - be.l + 4}px`;
      if (desdeArriba) { f.style.top = '0px'; f.style.height = `${be.b - bt.t - btop + 2}px`; }
      else { f.style.top = `${be.t - bt.t - btop - 2}px`; f.style.bottom = '0px'; }
      t.prepend(f);
    };
    const hechas = new Set<HTMLElement>();
    tramos.forEach(tr => {
      if (!tr.lugar || hechas.has(tr.lugar)) return;
      hechas.add(tr.lugar);
      franja(tarjetas.get(tr.a)!, tr.lugar, true, color.has(tr.de) ? `gc-${color.get(tr.de)}` : 'gr-dato');
    });
    new Set(tramos.map(tr => tr.de)).forEach(de => {
      const t = tarjetas.get(de)!, x = porId.get(de);
      if (!t.classList.contains('gr-nodo') || !x) return;
      franja(t, salidas.get(de)!, false, color.has(de) ? `gc-${color.get(de)}` : 'gr-dato');
    });
    dibujarSectores();
    enfocar(al.elegido);
  };

  const elegir = (id: string | null) => {
    tarjetas.forEach((t, k) => t.classList.toggle('elegido', orig(k) === id));
    enfocar(id);
  };
  pintar();
  elegir(al.elegido);
  // primera medida: cuando el tablero ya está en la página
  const obs = new ResizeObserver(() => requestAnimationFrame(dibujar));
  requestAnimationFrame(() => { if (tablero.isConnected) obs.observe(tablero); dibujar(); });
  if (document.fonts?.ready) document.fonts.ready.then(() => { colocado = false; requestAnimationFrame(dibujar); });
  return {
    el: tablero,
    actualizar(nr, rev) { r = nr as R; revelados = rev; pintar(); requestAnimationFrame(dibujar); },
    elegir,
    redibujar: () => requestAnimationFrame(dibujar),
  };
}

/** reparte las cuentas de un capítulo en sus momentos del procedimiento (los datos van con quien los usa) */
export function sectorizar<D, R>(cap: CapituloGrafo<D, R>, mapa: Record<string, string[]>): CapituloGrafo<D, R> {
  cap.sectores = Object.keys(mapa);
  for (const [nombre, ids] of Object.entries(mapa)) ids.forEach(id => { const n = cap.nodos.find(x => x.id === id); if (n) n.sector = nombre; });
  return cap;
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
