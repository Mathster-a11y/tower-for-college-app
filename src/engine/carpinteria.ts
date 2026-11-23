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
export interface TramoCarpinteria { desde: number; modo: ModoCarpinteria; retiro?: number | null }
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

/** escribe la carpintería de cada nivel según los tramos; devuelve los niveles donde lo común no salió exacto */
export function aplicarCarpinteriaTramos(p: Proyecto): { niveles: number; aproximados: number[] } {
  const tramos = tramosCarpinteria(p);
  if (!tramos.length) return { niveles: 0, aproximados: [] };
  // niveles de abajo hacia arriba (para saber cuál es la losa de arriba de cada piso)
  const orden = p.niveles.map((n, i) => ({ n, i })).sort((x, y) => x.n.cota - y.n.cota);
  const sil = new Map(orden.map(({ i }) => [i, plantaDeNivel(p, i).silueta]));
  let n = 0; const aprox: number[] = [];
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
    nv.carpinteria = (v as Vertice[]).map(q => ({ ...q }));
    n++;
  });
  return { niveles: n, aproximados: aprox };
}

// ------------------------------------------------------------------ bandas de la fachada y panelería
export interface BandaFachada { z0: number; z1: number; modo: 'losa' | 'continua'; a: Punto[]; b: Punto[] }
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
    if (md === 'losa') { const pts = puntosSilueta(contorno(nivs[k].i), 8); out.push({ z0: nivs[k].n.cota, z1: nivs[k + 1].n.cota, modo: 'losa', a: pts, b: pts }); k++; continue; }
    let f = k + 1;
    while (f + 1 < nivs.length && modo(nivs[f].n.cota) === 'continua') f++;
    let anillos: Punto[][];
    try { anillos = preparar(nivs.slice(k, f + 1).map(x => contorno(x.i)), 400); } catch { k = f; continue; }
    for (let j = 0; j + 1 < anillos.length; j++) out.push({ z0: nivs[k + j].n.cota, z1: nivs[k + j + 1].n.cota, modo: 'continua', a: anillos[j], b: anillos[j + 1] });
    k = f;
  }
  return out;
}

/** panelería: montantes cada «modulo» m por el contorno (siempre en las esquinas), travesaño en cada losa, un antepecho
 *  opaco de «antepecho» m sobre cada losa y «intermedios» travesaños más en el vidrio */
export interface Paneleria { modulo: number; antepecho?: number | null; intermedios?: number | null }
export interface Panel { p: [Punto & { z: number }, Punto & { z: number }, Punto & { z: number }, Punto & { z: number }]; opaco: boolean; area: number }
export interface ResultadoPaneleria { paneles: Panel[]; montantes: [Punto & { z: number }, Punto & { z: number }][]; vidrio: { n: number; area: number }; opacos: { n: number; area: number }; largoMontantes: number; largoTravesanos: number }

/** índices (con fracción) de los montantes sobre un anillo: en las esquinas (giro > 10°) y cada «modulo» m entre ellas */
function montantesAnillo(r: Punto[], modulo: number): number[] {
  const n = r.length, L = r.map((q, i) => Math.hypot(r[(i + 1) % n].x - q.x, r[(i + 1) % n].y - q.y));
  const giro = (i: number) => { const a = r[(i - 1 + n) % n], b = r[i], c = r[(i + 1) % n]; const t1 = Math.atan2(b.y - a.y, b.x - a.x), t2 = Math.atan2(c.y - b.y, c.x - b.x); let d = Math.abs(t2 - t1); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
  let esq = r.map((_, i) => i).filter(i => giro(i) > (10 * Math.PI) / 180);
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

export function calcularPaneleria(bandas: BandaFachada[], pn: Paneleria): ResultadoPaneleria {
  const paneles: Panel[] = [], montantes: ResultadoPaneleria['montantes'] = [];
  let largoM = 0, largoT = 0;
  const ap = Math.max(0, pn.antepecho ?? 0), inter = Math.max(0, Math.round(pn.intermedios ?? 0)), mod = Math.max(0.3, pn.modulo);
  bandas.forEach(bd => {
    const h = bd.z1 - bd.z0; if (h <= 1e-6) return;
    const ts = montantesAnillo(bd.a, mod);
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
  return { paneles, montantes, vidrio: sum(false), opacos: sum(true), largoMontantes: largoM, largoTravesanos: largoT };
}
