/**
 * Evaluador de fórmulas de Excel, lo justo para las planillas de la cátedra (vista previa de la exportación):
 * números, textos, referencias (A1, $A$1, 'Hoja'!A1, rangos), + − * / ^ &, comparaciones, y las funciones que usan
 * las planillas: SUM, MAX, MIN, IF, POWER, PI, ABS, SQRT, SIGN, AVERAGE; y las de los libros nuevos: AND, OR, NOT,
 * IFERROR, INT, ROUND y SUMPRODUCT (con cuentas elemento por elemento). Sigue las reglas de Excel: una celda vacía vale 0
 * en una cuenta, los errores se propagan (#DIV/0!, #NUM!, #VALUE!, #REF!, #NAME?) y SUM y MAX saltean textos en rangos.
 */

export type Valor = number | string | boolean | null | { error: string };
export const esError = (v: Valor): v is { error: string } => typeof v === 'object' && v !== null;
const ERR = (e: string): Valor => ({ error: e });

/** una celda del libro: valor fijo o fórmula (sin el «=») */
export interface CeldaLibro { v?: Valor; f?: string }
export type Libro = Map<string, Map<string, CeldaLibro>>;

// ------------------------------------------------------------------ referencias
export const colANum = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
export const numACol = (n: number) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
export const partirRef = (ref: string) => { const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref)!; return { c: colANum(m[1]), r: Number(m[2]) }; };

// ------------------------------------------------------------------ tokens
type Tok = { t: 'name'; v: string } | { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'ref'; hoja: string | null; a: string; b?: string } | { t: 'fn'; v: string } | { t: 'op'; v: string } | { t: '(' } | { t: ')' } | { t: ',' } | { t: 'bool'; v: boolean } | { t: 'err'; v: string };

function tokens(f: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const celda = /^\$?[A-Z]{1,3}\$?\d+/;
  while (i < f.length) {
    const ch = f[i];
    if (ch === ' ') { i++; continue; }
    if (ch === '"') { let j = i + 1, s = ''; while (j < f.length) { if (f[j] === '"') { if (f[j + 1] === '"') { s += '"'; j += 2; continue; } break; } s += f[j++]; } out.push({ t: 'str', v: s }); i = j + 1; continue; }
    if (ch === '(') { out.push({ t: '(' }); i++; continue; }
    if (ch === ')') { out.push({ t: ')' }); i++; continue; }
    if (ch === ',' || ch === ';') { out.push({ t: ',' }); i++; continue; }
    if (ch === '#') { const m = /^#[A-Z0-9/!?]+[!?0]?/.exec(f.slice(i)); const e = m ? m[0] : '#'; out.push({ t: 'err', v: e }); i += e.length; continue; }
    const dos = f.slice(i, i + 2);
    if (dos === '<=' || dos === '>=' || dos === '<>') { out.push({ t: 'op', v: dos }); i += 2; continue; }
    if ('+-*/^&=<>%'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue; }
    // libro externo: [1]Hoja!A1 o '[1]Hoja'!A1. La planilla anterior tiene tres (M,NyQ G55:G57, a la planilla 2024)
    // con la copia guardada vacía: Excel y LibreOffice dan 0 si no encuentran el archivo
    const ext = /^'?\[\d+\]/.exec(f.slice(i));
    if (ext) {
      const resto = f.slice(i + ext[0].length);
      const m = /^(?:[^'!]+'|[A-Za-z_][\w.]*)!\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?/.exec(resto);
      if (m) { out.push({ t: 'num', v: 0 }); i += ext[0].length + m[0].length; continue; }
    }
    // hoja: 'Nombre con espacios'!A1 o Nombre!A1
    let hoja: string | null = null, k = i;
    if (ch === "'") { let j = i + 1, s = ''; while (j < f.length) { if (f[j] === "'") { if (f[j + 1] === "'") { s += "'"; j += 2; continue; } break; } s += f[j++]; } if (f[j + 1] === '!') { hoja = s; k = j + 2; } }
    else { const m = /^([A-Za-z_][\w.]*)!/.exec(f.slice(i)); if (m) { hoja = m[1]; k = i + m[0].length; } }
    const mc = celda.exec(f.slice(k));
    if (mc && !/^[A-Za-z0-9_(]/.test(f.slice(k + mc[0].length))) {
      let j = k + mc[0].length, b: string | undefined;
      if (f[j] === ':') { const m2 = celda.exec(f.slice(j + 1)); if (m2) { b = m2[0].replace(/\$/g, ''); j += 1 + m2[0].length; } }
      out.push({ t: 'ref', hoja, a: mc[0].replace(/\$/g, ''), b }); i = j; continue;
    }
    if (hoja !== null) { out.push({ t: 'err', v: '#REF!' }); i = k; continue; }
    const mn = /^\d+(\.\d*)?([eE][+-]?\d+)?|^\.\d+([eE][+-]?\d+)?/.exec(f.slice(i));
    if (mn) { out.push({ t: 'num', v: Number(mn[0]) }); i += mn[0].length; continue; }
    const mf = /^[A-Za-z_][\w.]*/.exec(f.slice(i));
    if (mf) {
      const nombre = mf[0].toUpperCase(); i += mf[0].length;
      if (f[i] === '(') out.push({ t: 'fn', v: nombre });
      else if (nombre === 'TRUE' || nombre === 'FALSE') out.push({ t: 'bool', v: nombre === 'TRUE' });
      else out.push({ t: 'name', v: mf[0] });                                         // nombre definido
      continue;
    }
    out.push({ t: 'err', v: '#VALUE!' }); i++;
  }
  return out;
}

// ------------------------------------------------------------------ árbol
type Nodo =
  | { k: 'val'; v: Valor } | { k: 'ref'; hoja: string | null; a: string; b?: string } | { k: 'name'; n: string }
  | { k: 'un'; op: string; x: Nodo } | { k: 'bin'; op: string; a: Nodo; b: Nodo } | { k: 'fn'; n: string; args: Nodo[] } | { k: 'pct'; x: Nodo };

const PREC: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };

function parsear(ts: Tok[]): Nodo {
  let i = 0;
  const prim = (): Nodo => {
    const t = ts[i++];
    if (!t) throw new Error('fin');
    if (t.t === 'num') return { k: 'val', v: t.v };
    if (t.t === 'str') return { k: 'val', v: t.v };
    if (t.t === 'bool') return { k: 'val', v: t.v };
    if (t.t === 'err') return { k: 'val', v: ERR(t.v) };
    if (t.t === 'name') return { k: 'name', n: t.v };
    if (t.t === 'ref') return { k: 'ref', hoja: t.hoja, a: t.a, b: t.b };
    // en Excel el signo va antes que todo, también que ^: -2^2 = 4
    if (t.t === 'op' && (t.v === '-' || t.v === '+')) return { k: 'un', op: t.v, x: expr(5) };
    if (t.t === '(') { const e = expr(0); if (ts[i]?.t !== ')') throw new Error('falta )'); i++; return e; }
    if (t.t === 'fn') {
      i++;                                                                            // «(»
      const args: Nodo[] = [];
      if (ts[i]?.t === ')') { i++; return { k: 'fn', n: t.v, args }; }
      for (;;) {
        if (ts[i]?.t === ',' || ts[i]?.t === ')') args.push({ k: 'val', v: null }); else args.push(expr(0));
        const s = ts[i++];
        if (s?.t === ')') break;
        if (s?.t !== ',') throw new Error('falta , o )');
      }
      return { k: 'fn', n: t.v, args };
    }
    throw new Error('inesperado');
  };
  const expr = (min: number): Nodo => {
    let a = prim();
    for (;;) {
      const t = ts[i];
      if (t?.t === 'op' && t.v === '%') { i++; a = { k: 'pct', x: a }; continue; }
      if (!t || t.t !== 'op' || PREC[t.v] === undefined || PREC[t.v] <= min) break;
      const p = PREC[t.v];
      i++;
      a = { k: 'bin', op: t.v, a, b: expr(p) };                                      // ^ de izquierda a derecha, como Excel
    }
    return a;
  };
  const e = expr(0);
  if (i < ts.length) throw new Error('sobra');
  return e;
}

// ------------------------------------------------------------------ evaluación
export class Evaluador {
  private memo = new Map<string, Valor>();
  private enCurso = new Set<string>();
  private arboles = new Map<string, Nodo | null>();
  /** @param nombres nombres definidos del libro: nombre → hoja y celda (o rango «A1:B2») */
  constructor(private libro: Libro, private nombres: Map<string, { hoja: string; ref: string }> = new Map()) {}
  private nombre(n: string): Nodo {
    const d = this.nombres.get(n) ?? [...this.nombres.entries()].find(([k]) => k.toLowerCase() === n.toLowerCase())?.[1];
    if (!d) return { k: 'val', v: ERR('#NAME?') };
    const [a, b] = d.ref.replace(/\$/g, '').split(':');
    return { k: 'ref', hoja: d.hoja, a, b };
  }

  /** valor de una celda (evalúa su fórmula si tiene) */
  celda(hoja: string, ref: string): Valor {
    const clave = `${hoja}!${ref}`;
    if (this.memo.has(clave)) return this.memo.get(clave)!;
    const c = this.libro.get(hoja)?.get(ref);
    if (!c) return null;
    if (c.f === undefined) return c.v ?? null;
    if (this.enCurso.has(clave)) return ERR('#CICLO');
    this.enCurso.add(clave);
    let v: Valor;
    try {
      let nodo = this.arboles.get(c.f);
      if (nodo === undefined) { try { nodo = parsear(tokens(c.f)); } catch { nodo = null; } this.arboles.set(c.f, nodo); }
      v = nodo ? this.ev(nodo, hoja) : ERR('#FÓRMULA');
      if (Array.isArray(v)) v = (v as Valor[])[0] ?? null;
    } finally { this.enCurso.delete(clave); }
    if (typeof v === 'number' && !Number.isFinite(v)) v = ERR('#NUM!');
    if (v === null) v = 0;                                                            // =A1 con A1 vacía muestra 0
    this.memo.set(clave, v);
    return v;
  }

  private rango(hoja: string, a: string, b: string): Valor[] {
    const p = partirRef(a), q = partirRef(b), out: Valor[] = [];
    for (let r = Math.min(p.r, q.r); r <= Math.max(p.r, q.r); r++) for (let c = Math.min(p.c, q.c); c <= Math.max(p.c, q.c); c++) out.push(this.celda(hoja, `${numACol(c)}${r}`));
    return out;
  }

  private num(v: Valor): number | { error: string } {
    if (esError(v)) return v;
    if (v === null || v === '') return 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number') return v;
    const x = Number(v.replace(',', '.'));
    return Number.isFinite(x) && v.trim() !== '' ? x : { error: '#VALUE!' };
  }

  /** valores sueltos de los argumentos (los rangos se abren; dentro de un rango, los textos no cuentan) */
  private lista(args: Nodo[], hoja: string): { nums: number[]; error: { error: string } | null } {
    const nums: number[] = [];
    for (const a0 of args) {
      const a = a0.k === 'name' ? this.nombre(a0.n) : a0;
      if (a.k === 'ref' && a.b) {
        for (const v of this.rango(a.hoja ?? hoja, a.a, a.b)) { if (esError(v)) return { nums, error: v }; if (typeof v === 'number') nums.push(v); }
        continue;
      }
      const v = this.ev(a, hoja);
      if (esError(v)) return { nums, error: v };
      if (a.k === 'ref') { if (typeof v === 'number') nums.push(v); continue; }      // celda suelta: solo si es número
      const n = this.num(v);
      if (typeof n !== 'number') return { nums, error: n };
      nums.push(n);
    }
    return { nums, error: null };
  }

  /** evaluación en arreglo (para SUMPRODUCT): un rango es un arreglo y las cuentas van elemento por elemento */
  private arr(n: Nodo, hoja: string): Valor[] | { error: string } {
    if (n.k === 'name') return this.arr(this.nombre(n.n), hoja);
    if (n.k === 'ref' && n.b) return this.rango(n.hoja ?? hoja, n.a, n.b);
    if (n.k === 'bin') {
      const a = this.arr(n.a, hoja), b = this.arr(n.b, hoja);
      if (!Array.isArray(a)) return a;
      if (!Array.isArray(b)) return b;
      const len = Math.max(a.length, b.length), out: Valor[] = [];
      for (let i = 0; i < len; i++) {
        const x = a.length === 1 ? a[0] : a[i], y = b.length === 1 ? b[0] : b[i];
        out.push(this.ev({ k: 'bin', op: n.op, a: { k: 'val', v: x }, b: { k: 'val', v: y } }, hoja));
      }
      return out;
    }
    if (n.k === 'un') {
      const a = this.arr(n.x, hoja);
      if (!Array.isArray(a)) return a;
      return a.map(x => this.ev({ k: 'un', op: n.op, x: { k: 'val', v: x } }, hoja));
    }
    const v = this.ev(n, hoja);
    return esError(v) ? v : [v];
  }

  private ev(n: Nodo, hoja: string): Valor {
    switch (n.k) {
      case 'val': return n.v;
      case 'name': return this.ev(this.nombre(n.n), hoja);
      case 'ref': return n.b ? ERR('#VALUE!') : this.celda(n.hoja ?? hoja, n.a);
      case 'pct': { const x = this.num(this.ev(n.x, hoja)); return typeof x === 'number' ? x / 100 : x; }
      case 'un': { const x = this.num(this.ev(n.x, hoja)); return typeof x !== 'number' ? x : n.op === '-' ? -x : x; }
      case 'bin': {
        const a = this.ev(n.a, hoja), b = this.ev(n.b, hoja);
        if (esError(a)) return a;
        if (esError(b)) return b;
        if (n.op === '&') return `${txt(a)}${txt(b)}`;
        if (['=', '<>', '<', '>', '<=', '>='].includes(n.op)) return comparar(a, b, n.op);
        const x = this.num(a), y = this.num(b);
        if (typeof x !== 'number') return x;
        if (typeof y !== 'number') return y;
        switch (n.op) {
          case '+': return x + y;
          case '-': return x - y;
          case '*': return x * y;
          case '/': return y === 0 ? ERR('#DIV/0!') : x / y;
          case '^': return potencia(x, y);
        }
        return ERR('#VALUE!');
      }
      case 'fn': return this.funcion(n.n, n.args, hoja);
    }
  }

  private funcion(nombre: string, args: Nodo[], hoja: string): Valor {
    switch (nombre) {
      case 'PI': return Math.PI;
      case 'SUM': { const l = this.lista(args, hoja); return l.error ?? l.nums.reduce((s, x) => s + x, 0); }
      case 'MAX': { const l = this.lista(args, hoja); return l.error ?? (l.nums.length ? Math.max(...l.nums) : 0); }
      case 'MIN': { const l = this.lista(args, hoja); return l.error ?? (l.nums.length ? Math.min(...l.nums) : 0); }
      case 'AVERAGE': { const l = this.lista(args, hoja); return l.error ?? (l.nums.length ? l.nums.reduce((s, x) => s + x, 0) / l.nums.length : ERR('#DIV/0!')); }
      case 'POWER': {
        const x = this.num(this.ev(args[0] ?? { k: 'val', v: null }, hoja)), y = this.num(this.ev(args[1] ?? { k: 'val', v: null }, hoja));
        if (typeof x !== 'number') return x;
        if (typeof y !== 'number') return y;
        return potencia(x, y);
      }
      case 'SIGN': {
        const x = this.num(this.ev(args[0] ?? { k: 'val', v: null }, hoja));
        return typeof x !== 'number' ? x : Math.sign(x);
      }
      case 'ABS': case 'SQRT': {
        const x = this.num(this.ev(args[0] ?? { k: 'val', v: null }, hoja));
        if (typeof x !== 'number') return x;
        return nombre === 'ABS' ? Math.abs(x) : x < 0 ? ERR('#NUM!') : Math.sqrt(x);
      }
      case 'AND': case 'OR': {
        const l = this.lista(args, hoja);
        if (l.error) return l.error;
        return nombre === 'AND' ? l.nums.every(x => x !== 0) : l.nums.some(x => x !== 0);
      }
      case 'NOT': { const x = this.num(this.ev(args[0] ?? { k: 'val', v: null }, hoja)); return typeof x !== 'number' ? x : x === 0; }
      case 'IFERROR': { const x = this.ev(args[0] ?? { k: 'val', v: null }, hoja); return esError(x) || (typeof x === 'number' && !Number.isFinite(x)) ? this.ev(args[1] ?? { k: 'val', v: null }, hoja) : x; }
      case 'INT': { const x = this.num(this.ev(args[0] ?? { k: 'val', v: null }, hoja)); return typeof x !== 'number' ? x : Math.floor(x); }
      case 'ROUND': {
        const x = this.num(this.ev(args[0] ?? { k: 'val', v: null }, hoja)), d = this.num(this.ev(args[1] ?? { k: 'val', v: 0 }, hoja));
        if (typeof x !== 'number') return x;
        if (typeof d !== 'number') return d;
        const f = 10 ** Math.trunc(d);
        return (Math.sign(x) * Math.round(Math.abs(x) * f + 1e-9)) / f;              // la mitad, lejos del cero (Excel)
      }
      case 'SUMPRODUCT': {
        // cada argumento es un arreglo (los rangos se abren y las cuentas van elemento por elemento); se multiplican y se suman
        const arrs = args.map(a => this.arr(a, hoja));
        for (const x of arrs) if (!Array.isArray(x)) return x;
        const n = Math.max(...(arrs as Valor[][]).map(x => x.length));
        let s = 0;
        for (let i = 0; i < n; i++) {
          let prod = 1;
          for (const x of arrs as Valor[][]) {
            const v = x.length === 1 ? x[0] : x[i];
            if (esError(v)) return v;
            prod *= typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0;   // textos y vacíos: 0
          }
          s += prod;
        }
        return s;
      }
      case 'IF': {
        const c = this.ev(args[0] ?? { k: 'val', v: null }, hoja);
        if (esError(c)) return c;
        const cn = typeof c === 'string' ? (c.toUpperCase() === 'TRUE' ? 1 : c.toUpperCase() === 'FALSE' ? 0 : NaN) : this.num(c);
        if (typeof cn !== 'number' || Number.isNaN(cn)) return ERR('#VALUE!');
        if (cn !== 0) return args[1] ? this.ev(args[1], hoja) : true;
        return args.length > 2 ? this.ev(args[2], hoja) : false;
      }
    }
    return ERR('#NAME?');
  }
}

const txt = (v: Valor) => (v === null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v));
function potencia(x: number, y: number): Valor {
  if (x === 0 && y < 0) return ERR('#DIV/0!');
  if (x < 0 && !Number.isInteger(y)) return ERR('#NUM!');
  if (x === 0 && y === 0) return ERR('#NUM!');
  return Math.pow(x, y);
}
/** comparación como Excel: vacío = 0 o «»; números < textos < booleanos; textos sin distinguir mayúsculas */
function comparar(a: Valor, b: Valor, op: string): Valor {
  const rango = (v: Valor) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  let d: number;
  if (rango(a) !== rango(b)) d = rango(a) - rango(b);
  else if (typeof a === 'string') d = a.toLowerCase() < String(b).toLowerCase() ? -1 : a.toLowerCase() > String(b).toLowerCase() ? 1 : 0;
  else d = Number(a) - Number(b);
  switch (op) {
    case '=': return d === 0;
    case '<>': return d !== 0;
    case '<': return d < 0;
    case '>': return d > 0;
    case '<=': return d <= 0;
    default: return d >= 0;
  }
}

/** ¿el evaluador entiende la fórmula? (para avisar en la vista previa y para las pruebas) */
export function seEntiende(f: string): boolean { try { parsear(tokens(f)); return true; } catch { return false; } }
