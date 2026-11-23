/**
 * Carpintería por tramos de altura: cada tramo, desde una cota hacia arriba, con su modo.
 *
 *  - «sin»: sin carpintería (la base abierta del Citicorp, debajo del cajón de transición).
 *  - «losa» (interrumpida): en cada piso la carpintería es vertical y va de la losa de abajo a la de arriba; su
 *    contorno es lo común a las dos losas (lo que está en las dos), metido «retiro» metros. Así siempre apoya abajo y
 *    llega arriba: no queda en el aire ni hace falta tapa.
 *  - «continua» (ininterrumpida): la piel pasa por el borde de cada losa (metido «retiro») y sigue la superficie entre
 *    losa y losa; en el 3D es una superficie que une los pisos.
 *
 * La carpintería del nivel k es la del piso que va de la losa k a la de arriba (la del último nivel, la de su losa).
 * Se vuelve a aplicar en cada cambio, después del perfil, los lofts y los planos de corte.
 */
import type { Proyecto } from './modelo';
import { desfasarAnillo } from './contorno';
import { adentro } from './avisos';
import { areaSilueta, plantaDeNivel, puntosSilueta, type Punto, type Vertice } from './silueta';

export type ModoCarpinteria = 'sin' | 'losa' | 'continua';
/** «plana»: los lados curvos de la losa pasan a facetas rectas (un paño plano por faceta); «curva» (o vacío): sigue la curva */
export type FormaCarpinteria = 'plana' | 'curva';
export interface TramoCarpinteria { desde: number; modo: ModoCarpinteria; retiro?: number | null; forma?: FormaCarpinteria | null }
export const esPlana = (t: TramoCarpinteria | null | undefined) => t?.forma === 'plana';
export const NOMBRE_MODO: Record<ModoCarpinteria, string> = { sin: 'Sin carpintería', losa: 'Por losa (de losa a losa)', continua: 'Continua (sigue la superficie)' };

/** los tramos del proyecto (si solo había «carpintería que sigue a la losa», un tramo continuo desde PB) */
export function tramosCarpinteria(p: Proyecto): TramoCarpinteria[] {
  if (p.carpinteriaTramos?.length) return [...p.carpinteriaTramos].sort((a, b) => a.desde - b.desde);
  if (p.carpinteriaRetiro !== null && p.carpinteriaRetiro !== undefined) return [{ desde: 0, modo: 'continua', retiro: p.carpinteriaRetiro }];
  return [];
}
/** el tramo que rige en la cota z (el más alto que arranca en z o abajo); null si no hay tramos o z queda debajo */
export function tramoEn(p: Proyecto, z: number): TramoCarpinteria | null {
  const ts = tramosCarpinteria(p).filter(t => t.desde <= z + 1e-6);
  return ts.length ? ts[ts.length - 1] : null;
}

const area = (q: Punto[]) => q.reduce((s, a, i) => { const b = q[(i + 1) % q.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
const convexo = (q: Punto[]) => { let sg = 0; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length], c = q[(i + 2) % q.length], cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x); if (Math.abs(cr) < 1e-9) continue; const s = Math.sign(cr); if (sg && s !== sg) return false; sg = s; } return true; };
/** Sutherland–Hodgman: el polígono «suj» recortado por el polígono convexo «rec» (los dos antihorarios) */
function recortarConvexo(suj: Punto[], rec: Punto[]): Punto[] {
  let out = suj;
  for (let i = 0; i < rec.length && out.length; i++) {
    const a = rec[i], b = rec[(i + 1) % rec.length], dentro = (q: Punto) => (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x) >= -1e-9;
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length], dp = dentro(p), dq = dentro(q);
      if (dp) out.push(p);
      if (dp !== dq) {
        const d1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x), d2 = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x), t = d1 / (d1 - d2);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
  }
  return out;
}
const ccw = (q: Punto[]) => (area(q) < 0 ? [...q].reverse() : q);

/**
 * Lo común a dos losas (lo que está en las dos). Exacto si una contiene a la otra (y entonces con sus arcos) o si una
 * es convexa; si no, la más chica (exacto: false, para avisar).
 */
export function comunLosas(a: Vertice[], b: Vertice[]): { v: Vertice[]; exacto: boolean } {
  const pa = puntosSilueta(a, 4), pb = puntosSilueta(b, 4);
  if (pb.every(q => adentro(q, pa, 1e-4))) return { v: b, exacto: true };
  if (pa.every(q => adentro(q, pb, 1e-4))) return { v: a, exacto: true };
  const A = ccw(pa), B = ccw(pb);
  const r = convexo(B) ? recortarConvexo(A, B) : convexo(A) ? recortarConvexo(B, A) : null;
  if (r && r.length >= 3) return { v: r.map(q => ({ x: +q.x.toFixed(4), y: +q.y.toFixed(4) })), exacto: true };
  return { v: areaSilueta(a) <= areaSilueta(b) ? a : b, exacto: false };
}

// ------------------------------------------------------------------ facetas: la carpintería plana
const curvo = (q: Vertice) => !!(q.c1 && q.c2) || Math.abs(q.b ?? 0) > 1e-9;
/** largo de un lado (con su arco o su Bézier) */
function largoLado(v: Vertice[], i: number): number {
  const pts = puntosSilueta([v[i], { x: v[(i + 1) % v.length].x, y: v[(i + 1) % v.length].y }], 2).slice(0, -1);
  pts.push(v[(i + 1) % v.length]);
  let l = 0; for (let k = 0; k + 1 < pts.length; k++) l += Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].y - pts[k].y);
  return l;
}
/** puntos de un lado curvo a largo de curva parejo (n facetas: n − 1 puntos interiores) */
function puntosEnLado(v: Vertice[], i: number, n: number): Punto[] {
  const b = v[(i + 1) % v.length];
  const fino = puntosSilueta([v[i], { x: b.x, y: b.y }], 1); fino.splice(fino.length - 1, 1); fino.push({ x: b.x, y: b.y });
  // el lado de vuelta (de b a v[i]) también lo dibuja puntosSilueta; lo que importa es el tramo de v[i] a b
  const ac = [0]; for (let k = 1; k < fino.length; k++) ac.push(ac[k - 1] + Math.hypot(fino[k].x - fino[k - 1].x, fino[k].y - fino[k - 1].y));
  const L = ac[ac.length - 1], out: Punto[] = [];
  for (let j = 1; j < n; j++) {
    const s = (L * j) / n; let k = 1; while (k < ac.length - 1 && ac[k] < s) k++;
    const t = ac[k] > ac[k - 1] ? (s - ac[k - 1]) / (ac[k] - ac[k - 1]) : 0;
    out.push({ x: +(fino[k - 1].x + (fino[k].x - fino[k - 1].x) * t).toFixed(4), y: +(fino[k - 1].y + (fino[k].y - fino[k - 1].y) * t).toFixed(4) });
  }
  return out;
}
/** cuántas facetas lleva cada lado (1 en los rectos): las que hagan falta para que ninguna pase de «modulo» m */
export const facetasDe = (v: Vertice[], modulo: number) => v.map((q, i) => (curvo(q) ? Math.max(2, Math.ceil(largoLado(v, i) / modulo - 1e-6)) : 1));
/** el contorno con los lados curvos pasados a facetas rectas (polígono: cada faceta es un paño plano en el 3D) */
export function facetar(v: Vertice[], modulo: number, n = facetasDe(v, modulo)): Vertice[] {
  const out: Vertice[] = [];
  v.forEach((q, i) => { out.push({ x: q.x, y: q.y }); if (curvo(q)) out.push(...puntosEnLado(v, i, n[i] ?? 2)); });
  return out;
}
/** ancho de las facetas: el módulo de la panelería (si hay) o 1,5 m */
export const moduloFacetas = (p: Proyecto) => Math.max(0.3, p.paneleria?.modulo ?? 1.5);

/** escribe la carpintería de cada nivel según los tramos; devuelve los niveles donde lo común no salió exacto */
export function aplicarCarpinteriaTramos(p: Proyecto): { niveles: number; aproximados: number[] } {
  const tramos = tramosCarpinteria(p);
  if (!tramos.length) return { niveles: 0, aproximados: [] };
  // niveles de abajo hacia arriba (para saber cuál es la losa de arriba de cada piso)
  const orden = p.niveles.map((n, i) => ({ n, i })).sort((x, y) => x.n.cota - y.n.cota);
  const sil = new Map(orden.map(({ i }) => [i, plantaDeNivel(p, i).silueta]));
  let n = 0; const aprox: number[] = [];
  const hecho = new Map<number, Vertice[]>();
  orden.forEach(({ n: nv, i }, k) => {
    const t = tramoEn(p, nv.cota);
    if (!t) return;                                            // debajo del primer tramo: a mano
    if (t.modo === 'sin') { nv.carpinteria = null; return; }
    const d = Math.max(0, t.retiro ?? 0), arriba = orden[k + 1];
    let base = sil.get(i)!;
    if (t.modo === 'losa' && arriba) {
      const c = comunLosas(base, sil.get(arriba.i)!);
      base = c.v; if (!c.exacto) aprox.push(nv.cota);
    }
    const v = d > 0 ? desfasarAnillo(base, -d) : base;
    if ('error' in v) return;
    hecho.set(i, (v as Vertice[]).map(q => ({ ...q })));
  });
  // carpintería plana: ya metida, los lados curvos pasan a facetas. En un mismo tramo, si las carpinterías tienen los
  // mismos lados (una torre ahusada o con perfil), cada lado lleva las mismas facetas en todos los pisos: así las
  // facetas de un piso y las del de arriba son paralelas y los paños de la piel continua quedan planos.
  const mod = moduloFacetas(p);
  tramos.forEach(t => {
    if (!esPlana(t) || t.modo === 'sin') return;
    const idx = orden.filter(({ n: nv, i }) => tramoEn(p, nv.cota) === t && hecho.has(i)).map(({ i }) => i);
    const vs = idx.map(i => hecho.get(i)!), forma = (v: Vertice[]) => v.map(q => (curvo(q) ? 'c' : 'r')).join('');
    const iguales = vs.length > 1 && vs.every(v => forma(v) === forma(vs[0]));
    const nf = iguales ? vs.map(v => facetasDe(v, mod)).reduce((x, y) => x.map((c, k) => Math.max(c, y[k]))) : null;
    idx.forEach((i, k) => hecho.set(i, facetar(vs[k], mod, nf ?? undefined)));
  });
  hecho.forEach((v, i) => { p.niveles[i].carpinteria = v; n++; });
  return { niveles: n, aproximados: aprox };
}

// ------------------------------------------------------------------ bandas de la fachada y panelería
export interface BandaFachada { z0: number; z1: number; modo: 'losa' | 'continua'; a: Punto[]; b: Punto[]; /** facetas planas: un montante en cada vértice */ plana?: boolean }
/**
 * La fachada piso por piso: cada banda va de una losa a la de arriba, con el anillo de abajo (a) y el de arriba (b) del
 * mismo largo y con las costuras alineadas. «Por losa»: el mismo contorno abajo y arriba (vertical). «Continua»: los
 * contornos de las dos losas, alineados en toda la tira continua. «Sin»: no hay banda.
 * @param preparar alinea y remuestrea secciones (prepararSecciones del loft; se pasa para no atar los módulos)
 */
export function bandasFachada(p: Proyecto, preparar: (vs: Vertice[][], max?: number) => Punto[][]): BandaFachada[] {
  const nivs = p.niveles.map((n, i) => ({ n, i })).filter(({ n }) => n.cota >= -1e-6).sort((a, b) => a.n.cota - b.n.cota);
  const contorno = (i: number): Vertice[] => {
    const c = p.niveles[i].carpinteria;
    if (c && c.length >= 3) return c as Vertice[];
    return plantaDeNivel(p, i).silueta;
  };
  const modo = (z: number): ModoCarpinteria => tramoEn(p, z)?.modo ?? 'continua';
  const out: BandaFachada[] = [];
  let k = 0;
  while (k + 1 < nivs.length) {
    const md = modo(nivs[k].n.cota);
    if (md === 'sin') { k++; continue; }
    const plana = esPlana(tramoEn(p, nivs[k].n.cota));
    if (md === 'losa') { const pts = puntosSilueta(contorno(nivs[k].i), 8); out.push({ z0: nivs[k].n.cota, z1: nivs[k + 1].n.cota, modo: 'losa', a: pts, b: pts, plana }); k++; continue; }
    let f = k + 1;
    while (f + 1 < nivs.length && modo(nivs[f].n.cota) === 'continua' && esPlana(tramoEn(p, nivs[f].n.cota)) === plana) f++;
    const cs = nivs.slice(k, f + 1).map(x => contorno(x.i));
    // plana: si los pisos tienen los mismos vértices (facetas iguales), se unen vértice con vértice y cada paño es plano
    const poli = plana ? anillosPoligonales(cs) : null;
    let anillos: Punto[][];
    if (poli) anillos = poli; else { try { anillos = preparar(cs, 400); } catch { k = f; continue; } }
    for (let j = 0; j + 1 < anillos.length; j++) out.push({ z0: nivs[k + j].n.cota, z1: nivs[k + j + 1].n.cota, modo: 'continua', a: anillos[j], b: anillos[j + 1], plana: !!poli });
    k = f;
  }
  return out;
}

/** polígonos con la misma cantidad de vértices, antihorarios y con la costura alineada piso a piso; null si no se puede */
function anillosPoligonales(cs: Vertice[][]): Punto[][] | null {
  if (cs.some(v => v.some(curvo)) || cs.some(v => v.length !== cs[0].length)) return null;
  const out: Punto[][] = [];
  cs.forEach(v => {
    const r = ccw(v.map(q => ({ x: q.x, y: q.y })));
    if (!out.length) { out.push(r); return; }
    const prev = out[out.length - 1], n = r.length;
    let mejor = 0, dm = Infinity;
    for (let s = 0; s < n; s++) { let d = 0; for (let i = 0; i < n; i++) { const a = prev[i], b = r[(i + s) % n]; d += (a.x - b.x) ** 2 + (a.y - b.y) ** 2; } if (d < dm) { dm = d; mejor = s; } }
    out.push(r.map((_, i) => r[(i + mejor) % n]));
  });
  return out;
}

/** panelería: montantes cada «modulo» m por el contorno (siempre en las esquinas), travesaño en cada losa, un antepecho
 *  opaco de «antepecho» m sobre cada losa y «intermedios» travesaños más en el vidrio */
export interface Paneleria { modulo: number; antepecho?: number | null; intermedios?: number | null }
export interface Panel { p: [Punto & { z: number }, Punto & { z: number }, Punto & { z: number }, Punto & { z: number }]; opaco: boolean; area: number }
export interface ResultadoPaneleria { paneles: Panel[]; montantes: [Punto & { z: number }, Punto & { z: number }][]; vidrio: { n: number; area: number }; opacos: { n: number; area: number }; largoMontantes: number; largoTravesanos: number; /** paños que no son planos (alabeados más de 5 mm) */ alabeados: number }

/** índices (con fracción) de los montantes sobre un anillo: en las esquinas (giro > 10°) y cada «modulo» m entre ellas */
function montantesAnillo(r: Punto[], modulo: number, plana = false): number[] {
  const n = r.length, L = r.map((q, i) => Math.hypot(r[(i + 1) % n].x - q.x, r[(i + 1) % n].y - q.y));
  const giro = (i: number) => { const a = r[(i - 1 + n) % n], b = r[i], c = r[(i + 1) % n]; const t1 = Math.atan2(b.y - a.y, b.x - a.x), t2 = Math.atan2(c.y - b.y, c.x - b.x); let d = Math.abs(t2 - t1); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
  let esq = r.map((_, i) => i).filter(i => giro(i) > ((plana ? 0.05 : 10) * Math.PI) / 180);
  if (!esq.length) esq = [0];
  const out: number[] = [];
  esq.forEach((e, k) => {
    const f = esq[(k + 1) % esq.length], idx: number[] = [];
    for (let i = e; ; i = (i + 1) % n) { idx.push(i); if ((i + 1) % n === f || idx.length > n) break; }
    const largo = idx.reduce((s, i) => s + L[i], 0), partes = Math.max(1, Math.ceil(largo / modulo - 1e-6));
    out.push(e);
    // puntos a largo igual dentro del tramo entre esquinas
    for (let j = 1; j < partes; j++) {
      let falta = (largo * j) / partes;
      for (const i of idx) { if (falta <= L[i] + 1e-9) { out.push(i + (L[i] > 0 ? falta / L[i] : 0)); break; } falta -= L[i]; }
    }
  });
  return out.sort((a, b) => a - b);
}
const enAnillo = (r: Punto[], t: number) => { const n = r.length, i = Math.floor(t) % n, f = t - Math.floor(t), a = r[i], b = r[(i + 1) % n]; return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; };
const area4 = (q: (Punto & { z: number })[]) => { const tri = (a: Punto & { z: number }, b: Punto & { z: number }, c: Punto & { z: number }) => { const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z; return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2; }; return tri(q[0], q[1], q[2]) + tri(q[0], q[2], q[3]); };

/** cuánto se sale del plano un paño de cuatro puntos: distancia del cuarto al plano de los otros tres (m) */
export function alabeo(q: (Punto & { z: number })[]): number {
  const [a, b, c, d] = q, ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nn = Math.hypot(nx, ny, nz);
  return nn < 1e-12 ? 0 : Math.abs((d.x - a.x) * nx + (d.y - a.y) * ny + (d.z - a.z) * nz) / nn;
}
export function calcularPaneleria(bandas: BandaFachada[], pn: Paneleria): ResultadoPaneleria {
  const paneles: Panel[] = [], montantes: ResultadoPaneleria['montantes'] = [];
  let largoM = 0, largoT = 0;
  const ap = Math.max(0, pn.antepecho ?? 0), inter = Math.max(0, Math.round(pn.intermedios ?? 0)), mod = Math.max(0.3, pn.modulo);
  bandas.forEach(bd => {
    const h = bd.z1 - bd.z0; if (h <= 1e-6) return;
    const ts = montantesAnillo(bd.a, mod, !!bd.plana);
    // cortes en altura de la banda (fracciones): antepecho y travesaños intermedios del vidrio
    const fr: { t: number; opaco: boolean }[] = [];
    const t0 = ap > 0 && ap < h - 0.3 ? ap / h : 0;
    if (t0 > 0) fr.push({ t: 0, opaco: true });
    for (let j = 0; j <= inter; j++) fr.push({ t: t0 + ((1 - t0) * j) / (inter + 1), opaco: false });
    fr.push({ t: 1, opaco: false });
    const P = (t: number, s: number) => { const a = enAnillo(bd.a, t), b = enAnillo(bd.b, t); return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s, z: bd.z0 + h * s }; };
    ts.forEach((t, k) => {
      const t2 = k + 1 < ts.length ? ts[k + 1] : ts[0] + bd.a.length;
      const pa = P(t, 0), pb = P(t, 1);
      montantes.push([pa, pb]); largoM += Math.hypot(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z);
      for (let j = 0; j + 1 < fr.length; j++) {
        const q: Panel['p'] = [P(t, fr[j].t), P(t2, fr[j].t), P(t2, fr[j + 1].t), P(t, fr[j + 1].t)];
        paneles.push({ p: q, opaco: fr[j].opaco, area: area4(q) });
        largoT += Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y, q[1].z - q[0].z);
      }
    });
  });
  const sum = (op: boolean) => paneles.filter(x => x.opaco === op).reduce((s, x) => ({ n: s.n + 1, area: s.area + x.area }), { n: 0, area: 0 });
  return { paneles, montantes, vidrio: sum(false), opacos: sum(true), largoMontantes: largoM, largoTravesanos: largoT, alabeados: paneles.filter(x => alabeo(x.p) > 0.005).length };
}
