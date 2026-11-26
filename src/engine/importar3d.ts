/**
 * Importar un 3D (STL u OBJ, de Rhino, SketchUp, Revit, Blender…) y cortarlo por piso: la planta de cada nivel sale de
 * cortar la malla con un plano horizontal a su cota. Sirve para torres de forma libre: se modela afuera y la app saca
 * la losa y la carpintería de cada piso.
 *
 *  - leerSTL (binario o texto) y leerOBJ (vértices y caras; las caras de más de tres lados se parten en abanico);
 *  - unidades (m, cm, mm) y eje vertical (z, como en Rhino y casi todos los STL, o y, como en muchos OBJ);
 *  - cortarMalla: los segmentos del corte se encadenan en contornos cerrados; los de adentro de otro (patios, huecos)
 *    se separan de los de afuera; cada contorno se simplifica (puntos alineados dentro de una tolerancia).
 */
import { medidasAlViento, type CriterioAncho, type Punto } from './silueta';
import type { Nivel, Proyecto } from './modelo';

/** triángulos: 9 números por triángulo (x, y, z de los tres vértices), en las unidades y ejes del archivo */
export type Triangulos = Float32Array;

/** STL binario (80 bytes de cabecera, cantidad, 50 bytes por triángulo) o de texto («solid … facet … vertex …») */
export function leerSTL(buf: ArrayBuffer): Triangulos {
  const dv = new DataView(buf);
  if (buf.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + 50 * n === buf.byteLength) {
      const t = new Float32Array(9 * n);
      for (let k = 0; k < n; k++) for (let j = 0; j < 9; j++) t[9 * k + j] = dv.getFloat32(84 + 50 * k + 12 + 4 * j, true);
      return t;
    }
  }
  const txt = new TextDecoder().decode(buf);
  const vs = [...txt.matchAll(/vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g)].map(m => [+m[1], +m[2], +m[3]]);
  if (!vs.length || vs.length % 3) throw new Error('El STL no tiene triángulos legibles.');
  return Float32Array.from(vs.flat());
}

/** OBJ de texto: «v x y z» y «f a b c …» (índices desde 1, negativos desde el final, con /vt/vn) */
export function leerOBJ(txt: string): Triangulos {
  const v: number[][] = [], t: number[] = [];
  for (const linea of txt.split(/\r?\n/)) {
    const p = linea.trim().split(/\s+/);
    if (p[0] === 'v' && p.length >= 4) v.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'f' && p.length >= 4) {
      const idx = p.slice(1).map(s => { const i = parseInt(s.split('/')[0], 10); return i < 0 ? v.length + i : i - 1; });
      for (let k = 1; k + 1 < idx.length; k++) for (const i of [idx[0], idx[k], idx[k + 1]]) { const q = v[i]; if (!q) throw new Error('El OBJ tiene una cara con un vértice que no existe.'); t.push(q[0], q[1], q[2]); }
    }
  }
  if (!t.length) throw new Error('El OBJ no tiene caras.');
  return Float32Array.from(t);
}

export interface Modelo3D {
  /** triángulos en m, con z hacia arriba, centrados en planta (el centro de la caja en x e y) y con la base en z = 0 */
  tris: Float32Array;
  /** alto (m) y medidas de la caja en planta (m) */
  alto: number; ancho: number; largo: number;
}
/**
 * pasa a metros, con z hacia arriba, el centro de la caja en planta en el origen y la base en z = 0. eje: el eje
 * vertical del archivo (con «y», el y del archivo pasa a z y el z, a −y: la planta no se ve espejada)
 */
export function normalizarModelo(t: Triangulos, unidad: 'm' | 'cm' | 'mm', eje: 'z' | 'y'): Modelo3D {
  const k = unidad === 'mm' ? 0.001 : unidad === 'cm' ? 0.01 : 1;
  const out = new Float32Array(t.length);
  for (let i = 0; i < t.length; i += 3) {
    const x = t[i] * k, y = t[i + 1] * k, z = t[i + 2] * k;
    if (eje === 'y') { out[i] = x; out[i + 1] = -z; out[i + 2] = y; } else { out[i] = x; out[i + 1] = y; out[i + 2] = z; }
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < out.length; i += 3) { x0 = Math.min(x0, out[i]); x1 = Math.max(x1, out[i]); y0 = Math.min(y0, out[i + 1]); y1 = Math.max(y1, out[i + 1]); z0 = Math.min(z0, out[i + 2]); z1 = Math.max(z1, out[i + 2]); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let i = 0; i < out.length; i += 3) { out[i] -= cx; out[i + 1] -= cy; out[i + 2] -= z0; }
  return { tris: out, alto: z1 - z0, ancho: x1 - x0, largo: y1 - y0 };
}

/** la unidad y el eje vertical más probables: una torre es más alta que ancha y mide entre 10 y 1000 m */
export function adivinarModelo(t: Triangulos): { unidad: 'm' | 'cm' | 'mm'; eje: 'z' | 'y' } {
  const ext = [0, 1, 2].map(c => { let a = Infinity, b = -Infinity; for (let i = c; i < t.length; i += 3) { a = Math.min(a, t[i]); b = Math.max(b, t[i]); } return b - a; });
  const eje = ext[1] > ext[2] * 1.2 && ext[1] > ext[0] ? 'y' : 'z';
  const alto = eje === 'y' ? ext[1] : ext[2];
  return { eje, unidad: alto > 20000 ? 'mm' : alto > 2000 ? 'cm' : 'm' };
}

const areaCon = (p: Punto[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
function dentroDe(p: Punto[], q: Punto): boolean {
  let s = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) s = !s; }
  return s;
}
/** saca los puntos que quedan a menos de «tol» de la recta entre sus vecinos (Douglas-Peucker en un anillo) */
function simplificar(p: Punto[], tol: number): Punto[] {
  if (p.length <= 4) return p;
  // se parte el anillo en los dos puntos más alejados entre sí y se simplifica cada mitad
  let i0 = 0, i1 = 0, dm = -1;
  for (let i = 0; i < p.length; i++) { const d = Math.hypot(p[i].x - p[0].x, p[i].y - p[0].y); if (d > dm) { dm = d; i1 = i; } }
  dm = -1; for (let i = 0; i < p.length; i++) { const d = Math.hypot(p[i].x - p[i1].x, p[i].y - p[i1].y); if (d > dm) { dm = d; i0 = i; } }
  const tramo = (a: number, b: number): Punto[] => { const s: Punto[] = []; for (let i = a; ; i = (i + 1) % p.length) { s.push(p[i]); if (i === b) break; } return s; };
  const dp = (s: Punto[]): Punto[] => {
    if (s.length <= 2) return s;
    const a = s[0], b = s[s.length - 1], L = Math.hypot(b.x - a.x, b.y - a.y) || 1e-12;
    let k = -1, d = -1;
    for (let i = 1; i < s.length - 1; i++) { const di = Math.abs((b.x - a.x) * (a.y - s[i].y) - (a.x - s[i].x) * (b.y - a.y)) / L; if (di > d) { d = di; k = i; } }
    if (d <= tol) return [a, b];
    const l = dp(s.slice(0, k + 1)), r = dp(s.slice(k));
    return [...l.slice(0, -1), ...r];
  };
  const m1 = dp(tramo(i0, i1)), m2 = dp(tramo(i1, i0));
  return [...m1.slice(0, -1), ...m2.slice(0, -1)];
}

export interface Corte { contornos: Punto[][]; huecos: Punto[][] }
/**
 * el corte de la malla (en m, z hacia arriba) a la altura z: contornos exteriores (antihorarios, de mayor a menor área)
 * y huecos (los que quedan adentro de otro), simplificados con la tolerancia «tol» (m)
 */
export function cortarMalla(m: Modelo3D, z: number, tol = 0.005): Corte {
  const t = m.tris, zz = z + 1e-6 * Math.max(1, m.alto);           // un poquito corrido: ningún vértice justo en el plano
  const seg: [Punto, Punto][] = [];
  for (let i = 0; i < t.length; i += 9) {
    const p = [0, 3, 6].map(o => ({ x: t[i + o], y: t[i + o + 1], z: t[i + o + 2] }));
    const cruces: Punto[] = [];
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const A = p[a], B = p[b];
      if ((A.z - zz) * (B.z - zz) < 0) { const u = (zz - A.z) / (B.z - A.z); cruces.push({ x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u }); }
    }
    if (cruces.length === 2) seg.push([cruces[0], cruces[1]]);
  }
  if (!seg.length) return { contornos: [], huecos: [] };
  // encadenar: cada extremo se busca por su posición redondeada
  const paso = Math.max(1e-5, 1e-7 * Math.max(m.ancho, m.largo));
  const clave = (q: Punto) => `${Math.round(q.x / paso)},${Math.round(q.y / paso)}`;
  const porPunto = new Map<string, number[]>();
  seg.forEach((s, k) => s.forEach(q => { const c = clave(q); const l = porPunto.get(c); if (l) l.push(k); else porPunto.set(c, [k]); }));
  const usado = new Uint8Array(seg.length), anillos: Punto[][] = [];
  for (let k0 = 0; k0 < seg.length; k0++) {
    if (usado[k0]) continue;
    usado[k0] = 1;
    const anillo: Punto[] = [seg[k0][0]];
    let actual = seg[k0][1];
    for (let n = 0; n < seg.length; n++) {
      const c = clave(actual);
      if (c === clave(anillo[0])) break;
      anillo.push(actual);
      const sig = (porPunto.get(c) ?? []).find(j => !usado[j]);
      if (sig === undefined) break;                                   // malla abierta: el anillo queda como está
      usado[sig] = 1;
      actual = clave(seg[sig][0]) === c ? seg[sig][1] : seg[sig][0];
    }
    if (anillo.length >= 3) anillos.push(anillo);
  }
  const limpios = anillos.map(a => simplificar(a, tol)).filter(a => a.length >= 3 && Math.abs(areaCon(a)) > tol * tol);
  // de afuera o huecos: un anillo adentro de una cantidad impar de otros es un hueco
  const contornos: Punto[][] = [], huecos: Punto[][] = [];
  limpios.forEach((a, k) => {
    const n = limpios.filter((b, j) => j !== k && Math.abs(areaCon(b)) > Math.abs(areaCon(a)) && dentroDe(b, a[0])).length;
    const ccw = areaCon(a) >= 0 ? a : [...a].reverse();
    (n % 2 ? huecos : contornos).push(ccw.map(q => ({ x: +q.x.toFixed(3), y: +q.y.toFixed(3) })));
  });
  contornos.sort((a, b) => areaCon(b) - areaCon(a));
  return { contornos, huecos };
}

export interface OpcionesImportar {
  /** cortar en los niveles que ya tiene el proyecto o armar niveles nuevos cada «alturaPiso» m (desde PB) */
  niveles: 'actuales' | 'nuevos';
  alturaPiso?: number;
  /** a dónde va la forma: la losa y la carpintería, o solo la carpintería (el vidrio que ve el viento) */
  destino: 'ambas' | 'carpinteria';
  /** B y L de cada nivel (lo que lee la planilla): de la caja, de igual área o sin tocar */
  bl: CriterioAncho | null;
}
export interface InformeImportar { cortados: number; sinCorte: string[]; varias: string[]; conHuecos: string[]; alto: number }

/** corta el modelo en cada nivel y escribe la forma en el proyecto (se usa dentro de estado.cambiar) */
export function aplicarModelo(p: Proyecto, m: Modelo3D, op: OpcionesImportar): InformeImportar {
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const zPB = iPB >= 0 ? p.niveles[iPB].cota : 0;
  if (op.niveles === 'nuevos') {
    const hp = op.alturaPiso && op.alturaPiso > 0.5 ? op.alturaPiso : 3;
    const n = Math.max(1, Math.floor(m.alto / hp + 1e-6)), resto = m.alto - n * hp;
    const nuevos: Nivel[] = [];
    // la azotea arriba de todo (si sobra más de medio metro sobre el último piso, es un nivel más)
    if (resto > 0.5) nuevos.push({ nombre: 'Azotea', cota: +(zPB + m.alto).toFixed(2) });
    for (let k = n; k >= 1; k--) nuevos.push({ nombre: k === n && resto <= 0.5 ? 'Azotea' : `${k}º`, cota: +(zPB + k * hp).toFixed(2) });
    const pb = iPB >= 0 ? p.niveles[iPB] : { nombre: 'PB', cota: zPB };
    p.niveles = [...nuevos, pb, ...p.niveles.filter(x => x.cota < zPB - 1e-9)];
  }
  const inf: InformeImportar = { cortados: 0, sinCorte: [], varias: [], conHuecos: [], alto: m.alto };
  const sobre = p.niveles.map((n, i) => ({ n, i })).filter(x => x.n.cota >= zPB - 1e-9);
  for (const { n } of sobre) {
    const h = n.cota - zPB;
    // un poco arriba del piso (la planta del piso), y en la azotea un poco abajo del techo
    const z = Math.min(h + 0.02, m.alto - 0.02);
    if (z < 0) continue;
    const c = cortarMalla(m, z);
    if (!c.contornos.length) { inf.sinCorte.push(n.nombre); continue; }
    if (c.contornos.length > 1) inf.varias.push(n.nombre);
    if (c.huecos.length) inf.conHuecos.push(n.nombre);
    const v = c.contornos[0].map(q => ({ x: q.x, y: q.y }));
    n.carpinteria = v.map(q => ({ ...q })); n.carpManual = true;
    if (op.destino === 'ambas') { n.silueta = v.map(q => ({ ...q })); if (p.perfilTorre) n.manual = true; }
    if (op.bl) { const bl = medidasAlViento(v, op.bl); n.B = +bl.B.toFixed(2); n.L = +bl.L.toFixed(2); }
    inf.cortados++;
  }
  return inf;
}
