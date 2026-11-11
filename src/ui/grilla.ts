/**
 * Grilla tipo planilla de cálculo para tablas de datos (niveles, muros):
 *  - elegir celdas con clic, arrastre o Mayús + clic / flechas; Ctrl+A elige todo;
 *  - escribir sobre la celda elegida (Enter baja, Tab va a la derecha, Esc cancela; F2 o doble clic edita);
 *  - Supr borra; Ctrl+C copia; Ctrl+V pega lo copiado de Excel / LibreOffice / Google Sheets (agrega filas si hace falta);
 *  - el cuadradito de la esquina de la selección se arrastra para llenar: copia el valor o, si hay dos o más
 *    números en serie, continúa la serie (como Excel); Ctrl+D llena hacia abajo.
 * Cada acción es un solo paso de deshacer.
 */
import { estado } from './estado';

export interface Columna<T> {
  titulo: string;
  /** clave corta para la selección y el ancho */
  clave: string;
  tipo?: 'texto' | 'numero' | 'lista';
  opciones?: string[];
  ancho?: string;
  ayuda?: string;
  leer: (f: T) => string | number | null | undefined;
  /** recibe el texto escrito ('' = vacío); devuelve false si el valor no vale */
  escribir: (f: T, v: string) => boolean | void;
}

export interface OpcionesGrilla<T> {
  id: string;
  filas: () => T[];
  nueva?: () => T;
  /** fila «activa» (para sincronizar con la planta) */
  alElegirFila?: (f: T | null) => void;
  rotuloFila?: (f: T, i: number) => string;
}

interface Sel { r0: number; c0: number; r1: number; c1: number; }
const selecciones = new Map<string, Sel>();
let enfocada: string | null = null;

const num = (v: string) => { const t = v.trim().replace(/\s/g, ''); if (!t) return null; const x = Number(t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t.replace(/,(?=\d{3}\b)/g, '')); return isFinite(x) ? x : NaN; };
export const aNumero = num;

function ordenar(s: Sel) { return { ra: Math.min(s.r0, s.r1), rb: Math.max(s.r0, s.r1), ca: Math.min(s.c0, s.c1), cb: Math.max(s.c0, s.c1) }; }

export function grilla<T>(cols: Columna<T>[], op: OpcionesGrilla<T>): HTMLElement {
  const filas = op.filas();
  const nC = cols.length;
  // una fila vacía al final (como en Excel) para escribir o pegar elementos nuevos
  const nF = filas.length + (op.nueva ? 1 : 0);
  let sel = selecciones.get(op.id) ?? { r0: 0, c0: 0, r1: 0, c1: 0 };
  const lim = (s: Sel): Sel => ({ r0: Math.max(0, Math.min(s.r0, nF - 1)), r1: Math.max(0, Math.min(s.r1, nF - 1)), c0: Math.max(0, Math.min(s.c0, nC - 1)), c1: Math.max(0, Math.min(s.c1, nC - 1)) });
  sel = lim(sel);

  const caja = document.createElement('div');
  caja.className = 'grilla-caja';
  caja.tabIndex = 0;
  caja.setAttribute('role', 'grid');
  caja.setAttribute('aria-label', 'Tabla editable: flechas para moverse, escribir para cambiar, arrastrar el cuadradito para llenar');
  const tabla = document.createElement('table');
  tabla.className = 'grilla';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  trh.append(document.createElement('th'));
  cols.forEach(c => { const th = document.createElement('th'); th.textContent = c.titulo; if (c.ayuda) th.title = c.ayuda; if (c.ancho) th.style.width = c.ancho; trh.append(th); });
  thead.append(trh);
  tabla.append(thead);
  const tbody = document.createElement('tbody');
  const celdas: HTMLTableCellElement[][] = [];
  const conExtra: (T | null)[] = op.nueva ? [...filas, null] : filas;
  conExtra.forEach((f, r) => {
    const tr = document.createElement('tr');
    if (f === null) tr.className = 'nueva';
    const th = document.createElement('th');
    th.textContent = f === null ? '+' : op.rotuloFila ? op.rotuloFila(f, r) : String(r + 1);
    if (f === null) th.title = 'Escribí o pegá acá para agregar';
    th.dataset.r = String(r);
    tr.append(th);
    celdas.push([]);
    cols.forEach((c, k) => {
      const td = document.createElement('td');
      const v = f === null ? null : c.leer(f);
      td.textContent = v === null || v === undefined || (typeof v === 'number' && !isFinite(v)) ? '' : typeof v === 'number' ? String(+v.toFixed(4)).replace('.', ',') : String(v);
      if (c.tipo === 'numero') td.className = 'n';
      td.dataset.r = String(r); td.dataset.c = String(k);
      tr.append(td);
      celdas[r].push(td);
    });
    tbody.append(tr);
  });
  tabla.append(tbody);
  caja.append(tabla);
  const tirador = document.createElement('div');
  tirador.className = 'tirador';
  tirador.title = 'Arrastrar para llenar';
  caja.append(tirador);

  // ---------------------------------------------------------------- pintar la selección
  let llenado: { r: number; c: number } | null = null;
  function pintar() {
    const { ra, rb, ca, cb } = ordenar(sel);
    celdas.forEach((fila, r) => fila.forEach((td, c) => {
      td.classList.toggle('sel', r >= ra && r <= rb && c >= ca && c <= cb);
      td.classList.toggle('activa', r === sel.r1 && c === sel.c1);
    }));
    // rango que se va a llenar
    celdas.forEach(fila => fila.forEach(td => td.classList.remove('llenar')));
    if (llenado) {
      const R = rangoLlenado();
      if (R) for (let r = R.ra; r <= R.rb; r++) for (let c = R.ca; c <= R.cb; c++) celdas[r]?.[c]?.classList.add('llenar');
    }
    const fin = celdas[rb]?.[cb];
    if (fin && nF) {
      tirador.style.display = '';
      const cr = caja.getBoundingClientRect(), tr = fin.getBoundingClientRect();
      tirador.style.left = `${tr.right - cr.left + caja.scrollLeft - 4}px`;
      tirador.style.top = `${tr.bottom - cr.top + caja.scrollTop - 4}px`;
    } else tirador.style.display = 'none';
    selecciones.set(op.id, sel);
  }
  function rangoLlenado() {
    if (!llenado) return null;
    const { ra, rb, ca, cb } = ordenar(sel);
    // se llena en la dirección en que más se arrastró, fuera de la selección
    const dAbajo = llenado.r - rb, dArriba = ra - llenado.r, dDer = llenado.c - cb, dIzq = ca - llenado.c;
    const m = Math.max(dAbajo, dArriba, dDer, dIzq);
    if (m <= 0) return null;
    if (m === dAbajo) return { ra: rb + 1, rb: llenado.r, ca, cb, dir: 'abajo' as const };
    if (m === dArriba) return { ra: llenado.r, rb: ra - 1, ca, cb, dir: 'arriba' as const };
    if (m === dDer) return { ra, rb, ca: cb + 1, cb: llenado.c, dir: 'der' as const };
    return { ra, rb, ca: llenado.c, cb: ca - 1, dir: 'izq' as const };
  }
  function elegirFila() { op.alElegirFila?.(filas[sel.r1] ?? null); }

  // ---------------------------------------------------------------- cambios
  /** aplica valores [fila][col] desde (r, c); agrega filas si hace falta; un solo paso de deshacer */
  function poner(r0: number, c0: number, vals: string[][]) {
    let malos = 0;
    estado.cambiar(() => {
      const lista = op.filas();
      vals.forEach((fila, i) => {
        const r = r0 + i;
        while (r >= lista.length && op.nueva) lista.push(op.nueva());
        const f = lista[r];
        if (!f) return;
        fila.forEach((v, j) => { const col = cols[c0 + j]; if (col && col.escribir(f, v) === false) malos++; });
      });
    });
    if (malos) avisar(`${malos} valor${malos > 1 ? 'es' : ''} no ${malos > 1 ? 'válidos' : 'válido'}: ${malos > 1 ? 'quedaron' : 'quedó'} sin cambiar.`);
  }
  function texto(r: number, c: number) { return celdas[r]?.[c]?.textContent ?? ''; }

  function llenar() {
    const R = rangoLlenado();
    llenado = null;
    if (!R) { pintar(); return; }
    const { ra, rb, ca, cb } = ordenar(sel);
    const vertical = R.dir === 'abajo' || R.dir === 'arriba';
    const salida: Map<string, string> = new Map();
    if (vertical) {
      for (let c = ca; c <= cb; c++) {
        const fuente = Array.from({ length: rb - ra + 1 }, (_, k) => texto(ra + k, c));
        const serie = continuar(fuente, R.rb - R.ra + 1, R.dir === 'arriba');
        serie.forEach((v, k) => salida.set(`${R.dir === 'abajo' ? R.ra + k : R.rb - k},${c}`, v));
      }
    } else {
      for (let r = ra; r <= rb; r++) {
        const fuente = Array.from({ length: cb - ca + 1 }, (_, k) => texto(r, ca + k));
        const serie = continuar(fuente, R.cb - R.ca + 1, R.dir === 'izq');
        serie.forEach((v, k) => salida.set(`${r},${R.dir === 'der' ? R.ca + k : R.cb - k}`, v));
      }
    }
    estado.cambiar(() => {
      const lista = op.filas();
      salida.forEach((v, k) => { const [r, c] = k.split(',').map(Number); const f = lista[r]; if (f) cols[c].escribir(f, v); });
    });
    sel = { r0: Math.min(ra, R.ra), c0: Math.min(ca, R.ca), r1: Math.max(rb, R.rb), c1: Math.max(cb, R.cb) };
    selecciones.set(op.id, sel);
  }

  // ---------------------------------------------------------------- edición en la celda
  let editor: HTMLInputElement | HTMLSelectElement | null = null;
  function editar(inicial?: string) {
    const td = celdas[sel.r1]?.[sel.c1];
    if (!td) return;
    const col = cols[sel.c1];
    const anterior = td.textContent ?? '';
    let ed: HTMLInputElement | HTMLSelectElement;
    let sugerencias: HTMLDataListElement | null = null;
    if (col.tipo === 'lista' && col.opciones) {
      // texto con sugerencias: se puede escribir («10º») o elegir de la lista
      ed = document.createElement('input');
      const dl = document.createElement('datalist');
      dl.id = `dl-${op.id}-${col.clave}`;
      col.opciones.forEach(o => { const opt = document.createElement('option'); opt.value = o; dl.append(opt); });
      sugerencias = dl;
      ed.setAttribute('list', dl.id);
      ed.value = inicial ?? anterior;
    } else {
      ed = document.createElement('input');
      ed.value = inicial ?? anterior;
      if (col.tipo === 'numero') ed.inputMode = 'decimal';
    }
    ed.className = 'editor';
    ed.setAttribute('aria-label', col.titulo);
    td.textContent = '';
    td.append(ed);
    if (sugerencias) td.append(sugerencias);
    editor = ed;
    ed.focus();
    if (ed instanceof HTMLInputElement && inicial === undefined) ed.select();
    let hecho = false;
    const terminar = (guardar: boolean, mover?: [number, number]) => {
      if (hecho) return; hecho = true;
      editor = null;
      const v = ed.value;
      if (mover) { sel = lim({ r0: sel.r1 + mover[0], r1: sel.r1 + mover[0], c0: sel.c1 + mover[1], c1: sel.c1 + mover[1] }); selecciones.set(op.id, sel); }
      enfocada = op.id;
      if (guardar && v !== anterior) poner(sel.r1 - (mover?.[0] ?? 0), sel.c1 - (mover?.[1] ?? 0), [[v]]);
      else { td.textContent = anterior; caja.focus(); pintar(); }
    };
    ed.addEventListener('keydown', e => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter') { ke.preventDefault(); terminar(true, [ke.shiftKey ? -1 : 1, 0]); }
      else if (ke.key === 'Tab') { ke.preventDefault(); terminar(true, [0, ke.shiftKey ? -1 : 1]); }
      else if (ke.key === 'Escape') { ke.preventDefault(); terminar(false); }
      ke.stopPropagation();
    });
    ed.addEventListener('change', () => { if (ed instanceof HTMLSelectElement) terminar(true); });
    ed.addEventListener('blur', () => terminar(true));
  }

  // ---------------------------------------------------------------- mouse
  let arrastrando = false;
  const celdaDe = (t: EventTarget | null) => {
    const el = (t as HTMLElement | null)?.closest?.('td[data-c], th[data-r]') as HTMLElement | null;
    if (!el) return null;
    return { r: +el.dataset.r!, c: el.dataset.c === undefined ? -1 : +el.dataset.c };
  };
  caja.addEventListener('pointerdown', e => {
    if (editor && (e.target as HTMLElement).closest('.editor')) return;
    if (e.target === tirador) {
      e.preventDefault();
      llenado = { r: ordenar(sel).rb, c: ordenar(sel).cb };
      caja.setPointerCapture(e.pointerId);
      return;
    }
    const p = celdaDe(e.target);
    if (!p) return;
    e.preventDefault();
    caja.focus();
    if (p.c === -1) sel = e.shiftKey ? { ...sel, r1: p.r, c1: nC - 1 } : { r0: p.r, c0: 0, r1: p.r, c1: nC - 1 };
    else sel = e.shiftKey ? { ...sel, r1: p.r, c1: p.c } : { r0: p.r, c0: p.c, r1: p.r, c1: p.c };
    arrastrando = true;
    caja.setPointerCapture(e.pointerId);
    pintar();
    elegirFila();
  });
  caja.addEventListener('pointermove', e => {
    if (!arrastrando && !llenado) return;
    const debajo = document.elementFromPoint(e.clientX, e.clientY);
    const p = celdaDe(debajo);
    if (!p) return;
    if (llenado) { llenado = { r: p.r, c: Math.max(0, p.c) }; pintar(); return; }
    sel = { ...sel, r1: p.r, c1: p.c === -1 ? nC - 1 : p.c };
    pintar();
  });
  const soltar = () => { if (llenado) { enfocada = op.id; llenar(); } arrastrando = false; };
  caja.addEventListener('pointerup', soltar);
  caja.addEventListener('pointercancel', () => { llenado = null; arrastrando = false; pintar(); });
  caja.addEventListener('dblclick', e => { if (celdaDe(e.target)?.c !== -1) editar(); });

  // ---------------------------------------------------------------- teclado
  caja.addEventListener('keydown', e => {
    if (editor) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const mov: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (mov[e.key]) {
      e.preventDefault();
      const [dr, dc] = mov[e.key];
      sel = lim(e.shiftKey ? { ...sel, r1: sel.r1 + dr, c1: sel.c1 + dc } : { r0: sel.r1 + dr, c0: sel.c1 + dc, r1: sel.r1 + dr, c1: sel.c1 + dc });
      pintar(); elegirFila();
      celdas[sel.r1]?.[sel.c1]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      sel = lim({ r0: sel.r1, r1: sel.r1, c0: sel.c1 + (e.shiftKey ? -1 : 1), c1: sel.c1 + (e.shiftKey ? -1 : 1) }); pintar();
    } else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); editar(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); e.stopPropagation();
      const { ra, rb, ca, cb } = ordenar(sel);
      enfocada = op.id;
      poner(ra, ca, Array.from({ length: rb - ra + 1 }, () => Array.from({ length: cb - ca + 1 }, () => '')));
    } else if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); sel = { r0: 0, c0: 0, r1: nF - 1, c1: nC - 1 }; pintar(); }
    else if (ctrl && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      const { ra, rb, ca, cb } = ordenar(sel);
      if (rb > ra) { enfocada = op.id; poner(ra + 1, ca, Array.from({ length: rb - ra }, () => Array.from({ length: cb - ca + 1 }, (_, k) => texto(ra, ca + k)))); }
    } else if (!ctrl && !e.altKey && e.key.length === 1) { e.preventDefault(); editar(e.key); }
    else if (ctrl && e.key.toLowerCase() === 'z') { /* lo maneja la app */ }
    if (ctrl && ['c', 'v', 'x'].includes(e.key.toLowerCase())) e.stopPropagation();
  });
  caja.addEventListener('copy', e => {
    if (editor) return;
    e.preventDefault();
    const { ra, rb, ca, cb } = ordenar(sel);
    const tsv = Array.from({ length: rb - ra + 1 }, (_, i) => Array.from({ length: cb - ca + 1 }, (_, j) => texto(ra + i, ca + j)).join('\t')).join('\n');
    e.clipboardData?.setData('text/plain', tsv);
  });
  caja.addEventListener('paste', e => {
    if (editor) return;
    e.preventDefault();
    const t = e.clipboardData?.getData('text/plain') ?? '';
    const vals = t.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(l => l.split('\t'));
    if (!vals.length) return;
    const { ra, ca } = ordenar(sel);
    // si se copió una sola celda y hay un rango elegido, se repite en todo el rango (como Excel)
    const { rb, cb } = ordenar(sel);
    const rep = vals.length === 1 && vals[0].length === 1 && (rb > ra || cb > ca)
      ? Array.from({ length: rb - ra + 1 }, () => Array.from({ length: cb - ca + 1 }, () => vals[0][0])) : vals;
    enfocada = op.id;
    if (!op.nueva && ra + rep.length > nF) avisar('Se pegaron solo las filas que entran en la tabla.');
    poner(ra, ca, rep);
    sel = lim({ r0: ra, c0: ca, r1: ra + rep.length - 1, c1: ca + (rep[0]?.length ?? 1) - 1 });
    selecciones.set(op.id, sel);
  });
  caja.addEventListener('focus', () => { enfocada = op.id; });
  caja.addEventListener('blur', () => { setTimeout(() => { if (!caja.contains(document.activeElement) && enfocada === op.id) enfocada = null; }, 0); });

  const aviso = document.createElement('p');
  aviso.className = 'nota grilla-aviso';
  aviso.setAttribute('role', 'status');
  function avisar(t: string) { aviso.textContent = t; setTimeout(() => { if (aviso.textContent === t) aviso.textContent = ''; }, 5000); }

  const envoltura = document.createElement('div');
  envoltura.className = 'grilla-envoltura';
  envoltura.append(caja, aviso);
  // después de montarse: pintar la selección y devolver el foco si la grilla lo tenía
  requestAnimationFrame(() => {
    pintar();
    if (enfocada === op.id) caja.focus({ preventScroll: true });
  });
  new ResizeObserver(() => pintar()).observe(caja);
  return envoltura;
}

/** Pone la celda activa en una fila (por ejemplo, el muro elegido en la planta), si no está ya dentro de la selección. */
export function elegirFila(id: string, r: number) {
  const s = selecciones.get(id);
  if (s && r >= Math.min(s.r0, s.r1) && r <= Math.max(s.r0, s.r1)) return;
  const c = s?.c1 ?? 0;
  selecciones.set(id, { r0: r, c0: c, r1: r, c1: c });
}

/** Selección actual de una grilla (filas, de menor a mayor). */
export function filasElegidas(id: string): [number, number] | null {
  const s = selecciones.get(id);
  if (!s) return null;
  return [Math.min(s.r0, s.r1), Math.max(s.r0, s.r1)];
}

/**
 * Continúa una serie como el llenado de Excel: con dos o más números en progresión aritmética, sigue la serie;
 * con un número solo o valores que no son serie, repite el patrón; texto que termina en número («M3») incrementa
 * el número si hay serie.
 */
export function continuar(fuente: string[], n: number, haciaAtras = false): string[] {
  const src = haciaAtras ? [...fuente].reverse() : fuente;
  const nums = src.map(v => num(v));
  const todosNum = src.length >= 2 && nums.every(x => x !== null && !Number.isNaN(x));
  if (todosNum) {
    const xs = nums as number[];
    const paso = xs[1] - xs[0];
    const esSerie = xs.every((x, i) => i === 0 || Math.abs(x - xs[i - 1] - paso) < 1e-9 * Math.max(1, Math.abs(x)));
    if (esSerie) return Array.from({ length: n }, (_, k) => fmtNum(xs[xs.length - 1] + paso * (k + 1)));
  }
  // texto con número al final: «M1», «M2» → «M3», «M4»; «3º», «4º» → «5º»
  const partes = src.map(v => /^(.*?)(-?\d+)([^\d]*)$/.exec(v));
  if (src.length >= 2 && partes.every(p => p && p[1] === partes[0]![1] && p[3] === partes[0]![3])) {
    const xs = partes.map(p => +p![2]);
    const paso = xs[1] - xs[0];
    if (xs.every((x, i) => i === 0 || x - xs[i - 1] === paso)) {
      const [, pre, , suf] = partes[0]!;
      return Array.from({ length: n }, (_, k) => `${pre}${xs[xs.length - 1] + paso * (k + 1)}${suf}`);
    }
  }
  return Array.from({ length: n }, (_, k) => src[k % src.length]);
}
const fmtNum = (x: number) => String(+x.toFixed(6)).replace('.', ',');
