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
import { interseccion } from './interseccion';
import { contornoEnvolvente } from './envolvente';
import { plantaDeNivel, puntosSilueta, type Punto, type Vertice } from './silueta';

export type ModoCarpinteria = 'sin' | 'losa' | 'continua';
/** «plana»: los lados curvos de la losa pasan a facetas rectas (un paño plano por faceta); «curva» (o vacío): sigue la curva */
export type FormaCarpinteria = 'plana' | 'curva';
export interface TramoCarpinteria { desde: number; modo: ModoCarpinteria; retiro?: number | null; forma?: FormaCarpinteria | null }
export const esPlana = (t: TramoCarpinteria | null | undefined) => t?.forma === 'plana';
export const NOMBRE_MODO: Record<ModoCarpinteria, string> = { sin: 'Sin carpintería', losa: 'Por piso (de losa a losa)', continua: 'Envolvente (sigue la superficie)' };

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

/**
 * Lo común a dos losas (lo que está en las dos), exacto para cualquier forma. Si una contiene a la otra, es esa (con sus
 * arcos); si no, la intersección en piezas (puede ser más de una), de la más grande a la más chica.
 */
export function comunLosas(a: Vertice[], b: Vertice[]): { v: Vertice[]; piezas: Vertice[][]; exacto: boolean } {
  const pa = puntosSilueta(a, 4), pb = puntosSilueta(b, 4);
  const ri = interseccion(pa, pb);
  // una contiene a la otra (no alcanza con los vértices: en una losa cóncava los lados pueden cruzar un vacío): lo
  // común es una sola pieza con el área de la más chica; entonces se usa esa losa tal cual, con sus arcos
  const ar = (q: Punto[]) => Math.abs(area(q)), aa = ar(pa), ab = ar(pb);
  if (ri.length === 1) {
    if (Math.abs(ar(ri[0]) - ab) < 1e-6 * Math.max(1, ab)) return { v: b, piezas: [b], exacto: true };
    if (Math.abs(ar(ri[0]) - aa) < 1e-6 * Math.max(1, aa)) return { v: a, piezas: [a], exacto: true };
  }
  const r = ri.map(q => q.map(p => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4) })));
  return { v: r[0] ?? [], piezas: r, exacto: true };
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
  // carpintería fija: las losas se editan sin tocarla (los avisos dicen si queda fuera de una losa o sobre un vacío)
  if (p.carpinteriaFija) return { niveles: 0, aproximados: [] };
  // las piezas de más las calculan los tramos: sin tramos (o en los pisos a mano) no hay
  p.niveles.forEach(nv => { delete nv.carpinteriaPartida; });
  if (!tramos.length) return { niveles: 0, aproximados: [] };
  // niveles de abajo hacia arriba (para saber cuál es la losa de arriba de cada piso)
  const orden = p.niveles.map((n, i) => ({ n, i })).sort((x, y) => x.n.cota - y.n.cota);
  const sil = new Map(orden.map(({ i }) => [i, plantaDeNivel(p, i).silueta]));
  let n = 0; const aprox: number[] = [];
  const hecho = new Map<number, Vertice[][]>();
  orden.forEach(({ n: nv, i }, k) => {
    const t = tramoEn(p, nv.cota);
    if (!t) return;                                            // debajo del primer tramo: a mano
    if (nv.carpManual) return;                                 // editada a mano: la controlan los avisos
    if (t.modo === 'sin') { nv.carpinteria = null; return; }
    const d = Math.max(0, t.retiro ?? 0), arriba = orden[k + 1];
    // envolvente diseñada aparte: la carpintería es el corte de la piel a esta altura (ya con su retiro)
    if (t.modo === 'continua' && p.envolvente) {
      const ve = contornoEnvolvente(p, i);
      if (!ve) { nv.carpinteria = null; return; }
      hecho.set(i, [ve.map(q => ({ ...q }))]);
      return;
    }
    let bases: Vertice[][] = [sil.get(i)!];
    if (t.modo === 'losa' && arriba) bases = comunLosas(sil.get(i)!, sil.get(arriba.i)!).piezas;
    const vs = bases.map(b => (d > 0 ? desfasarAnillo(b, -d) : b)).filter(v => !('error' in v) && (v as Vertice[]).length >= 3) as Vertice[][];
    if (!vs.length) { if (bases.length) aprox.push(nv.cota); return; }
    hecho.set(i, vs.map(v => v.map(q => ({ ...q }))));
  });
  // carpintería plana: ya metida, los lados curvos pasan a facetas. En un mismo tramo, si las carpinterías tienen los
  // mismos lados (una torre ahusada o con perfil), cada lado lleva las mismas facetas en todos los pisos: así las
  // facetas de un piso y las del de arriba son paralelas y los paños de la piel continua quedan planos.
  const mod = moduloFacetas(p);
  tramos.forEach(t => {
    if (!esPlana(t) || t.modo === 'sin') return;
    const idx = orden.filter(({ n: nv, i }) => tramoEn(p, nv.cota) === t && hecho.has(i)).map(({ i }) => i);
    const vs = idx.map(i => hecho.get(i)![0]), forma = (v: Vertice[]) => v.map(q => (curvo(q) ? 'c' : 'r')).join('');
    const iguales = vs.length > 1 && vs.every(v => forma(v) === forma(vs[0]));
    const nf = iguales ? vs.map(v => facetasDe(v, mod)).reduce((x, y) => x.map((c, k) => Math.max(c, y[k]))) : null;
    idx.forEach((i, k) => hecho.set(i, [facetar(vs[k], mod, nf ?? undefined), ...hecho.get(i)!.slice(1).map(v => facetar(v, mod))]));
  });
  hecho.forEach((vs, i) => {
    const nv = p.niveles[i];
    // lo común partido: la carpintería es la pieza más grande; lo demás queda sin carpintería (y se avisa)
    nv.carpinteria = vs[0];
    if (vs.length > 1) nv.carpinteriaPartida = { piezas: vs.length, area: +vs.slice(1).reduce((x, v) => x + Math.abs(area(puntosSilueta(v, 8))), 0).toFixed(2) };
    n++;
  });
  return { niveles: n, aproximados: aprox };
}

// ------------------------------------------------------------------ bandas de la fachada y panelería
type P3 = Punto & { z: number };
/**
 * Una banda de fachada: de una losa (z0) a la de arriba (z1), con el anillo de abajo (a) y el de arriba (b) del mismo
 * largo: el punto a[i] se une con b[i].
 *  - plana: las caras son planos (el poliedro de la piel); la panelería va por cara, con su propia grilla vertical.
 *  - montantes: cada punto es un montante (la piel curva continua: los montantes suben piso a piso).
 */
export interface BandaFachada { z0: number; z1: number; modo: 'losa' | 'continua'; a: Punto[]; b: Punto[]; plana?: boolean; montantes?: boolean }

const ccwP = (q: Punto[]) => (area(q) < 0 ? [...q].reverse() : q);
/** el punto del anillo más cerca de q (t: índice del lado + fracción) */
function cercano(q: Punto, r: Punto[]): { t: number; p: Punto; d: number } {
  let mejor = { t: 0, p: r[0], d: Infinity };
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 > 1e-18 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0;
    const p = { x: a.x + dx * t, y: a.y + dy * t }, d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < mejor.d - 1e-12) mejor = { t: i + t, p, d };
  }
  return mejor;
}
/**
 * Une dos anillos (polígonos) por cercanía en planta: cada vértice de abajo con el punto más cercano de arriba y cada
 * vértice de arriba con el más cercano de abajo. Así las esquinas van con las esquinas y cada cara de la piel queda
 * entre un lado de abajo y uno de arriba (un plano cuando los lados son paralelos), sin caras que crucen esquinas.
 */
export function parear(A0: Punto[], B0: Punto[]): [Punto[], Punto[]] {
  const A = ccwP(A0), B = ccwP(B0), nB = B.length;
  const pares = [...A.map((q, i) => ({ ta: i, tb: cercano(q, B).t })), ...B.map((q, j) => ({ ta: cercano(q, A).t, tb: j }))].sort((x, y) => x.ta - y.ta || x.tb - y.tb);
  const out: { ta: number; tb: number }[] = [];
  let prev = pares[0].tb, prevU = prev;
  const ini = prev;
  out.push({ ta: pares[0].ta, tb: prev });
  for (const q of pares.slice(1)) {
    const dlt = (((q.tb - prev) % nB) + nB) % nB;
    if (dlt > nB / 2) continue;                                 // se volvería para atrás: se cruzarían las caras
    const u = prevU + dlt;
    if (u - ini > nB - 1e-9) continue;
    const ult = out[out.length - 1];
    if (Math.abs(q.ta - ult.ta) < 1e-9 && Math.abs(u - ult.tb) < 1e-9) continue;
    out.push({ ta: q.ta, tb: u }); prev = q.tb; prevU = u;
  }
  return [out.map(q => enAnillo(A, q.ta)), out.map(q => enAnillo(B, q.tb))];
}

const alabeadas = (a: Punto[], b: Punto[], z0: number, z1: number) => a.reduce((n, _, i) => { const m = a.length, q: P3[] = [{ ...a[i], z: z0 }, { ...a[(i + 1) % m], z: z0 }, { ...b[(i + 1) % m], z: z1 }, { ...b[i], z: z1 }]; return n + (alabeo(q) > 0.005 ? 1 : 0); }, 0);
/** anillos con la misma cantidad de vértices, antihorarios y con la costura alineada (el de arriba con el de abajo) */
function anillosPoligonales(cs: Punto[][]): Punto[][] | null {
  if (cs.some(v => v.length !== cs[0].length)) return null;
  const out: Punto[][] = [];
  cs.forEach(v => {
    const r = ccwP(v);
    if (!out.length) { out.push(r); return; }
    const prev = out[out.length - 1], n = r.length;
    let mejor = 0, dm = Infinity;
    for (let s = 0; s < n; s++) { let d = 0; for (let i = 0; i < n; i++) { const a = prev[i], b = r[(i + s) % n]; d += (a.x - b.x) ** 2 + (a.y - b.y) ** 2; } if (d < dm) { dm = d; mejor = s; } }
    out.push(r.map((_, i) => r[(i + mejor) % n]));
  });
  return out;
}
function mejorUnion(A: Punto[], B: Punto[], z0: number, z1: number): [Punto[], Punto[]] {
  const cerca = parear(A, B);
  const vv = anillosPoligonales([A, B]);
  if (!vv) return cerca;
  return alabeadas(vv[0], vv[1], z0, z1) <= alabeadas(cerca[0], cerca[1], z0, z1) ? [vv[0], vv[1]] : cerca;
}
/**
 * La fachada piso por piso. «Por losa»: el mismo contorno abajo y arriba (vertical). «Continua» plana: cada piso unido
 * con el de arriba por cercanía (caras planas). «Continua» curva: montantes cada módulo en la losa de abajo del tramo
 * que suben piso a piso al punto más cercano (siempre a plomo en el alzado de la piel, sin trama torcida). «Sin»: nada.
 * @param _preparar ya no se usa (queda por compatibilidad)
 */
export function bandasFachada(p: Proyecto, _preparar?: unknown): BandaFachada[] {
  const nivs = p.niveles.map((n, i) => ({ n, i })).filter(({ n }) => n.cota >= -1e-6).sort((a, b) => a.n.cota - b.n.cota);
  const contorno = (i: number): Vertice[] => {
    const c = p.niveles[i].carpinteria;
    if (c && c.length >= 3) return c as Vertice[];
    return plantaDeNivel(p, i).silueta;
  };
  const modo = (z: number): ModoCarpinteria => tramoEn(p, z)?.modo ?? 'continua';
  const mod = moduloFacetas(p);
  const out: BandaFachada[] = [];
  let k = 0;
  while (k + 1 < nivs.length) {
    const md = modo(nivs[k].n.cota);
    if (md === 'sin') { k++; continue; }
    const plana = esPlana(tramoEn(p, nivs[k].n.cota));
    if (md === 'losa') {
      const pts = ccwP(puntosSilueta(contorno(nivs[k].i), 8));
      out.push({ z0: nivs[k].n.cota, z1: nivs[k + 1].n.cota, modo: 'losa', a: pts, b: pts, plana });
      k++; continue;
    }
    let f = k + 1;
    while (f + 1 < nivs.length && modo(nivs[f].n.cota) === 'continua' && esPlana(tramoEn(p, nivs[f].n.cota)) === plana) f++;
    const rs = nivs.slice(k, f + 1).map(x => ccwP(puntosSilueta(contorno(x.i), plana ? 8 : 3)));
    if (plana) {
      for (let j = 0; j + 1 < rs.length; j++) {
        const z0 = nivs[k + j].n.cota, z1 = nivs[k + j + 1].n.cota;
        // vértice con vértice si los dos pisos tienen los mismos lados (torre ahusada, con perfil, recortada sin
        // cambiar de lados); si no, por cercanía. Se queda la unión con menos caras alabeadas.
        const [a, b] = mejorUnion(rs[j], rs[j + 1], z0, z1);
        out.push({ z0, z1, modo: 'continua', a, b, plana: true });
      }
    } else {
      // curva: los montantes arrancan en la losa de abajo y suben al punto más cercano de cada losa
      let pts = montantesAnillo(rs[0], { ...(p.paneleria ?? {}), modulo: mod }).map(t => enAnillo(rs[0], t));
      for (let j = 0; j + 1 < rs.length; j++) {
        const sig = pts.map(q => cercano(q, rs[j + 1]));
        // sin cruces: los que se vuelven para atrás se sacan
        const keep: number[] = []; let ult = -Infinity; const n1 = rs[j + 1].length, t0 = sig[0]?.t ?? 0;
        sig.forEach((c, i) => { const u = ((c.t - t0) % n1 + n1) % n1; if (i === 0 || u >= ult - 1e-9) { keep.push(i); ult = u; } });
        const a = keep.map(i => pts[i]), b = keep.map(i => sig[i].p);
        out.push({ z0: nivs[k + j].n.cota, z1: nivs[k + j + 1].n.cota, modo: 'continua', a, b, montantes: true });
        pts = b;
      }
    }
    k = f;
  }
  return out;
}

/** panelería: montantes cada «modulo» m (siempre en las esquinas), travesaño en cada losa, un antepecho opaco de
 *  «antepecho» m sobre cada losa y «intermedios» travesaños más en el vidrio */
export interface Paneleria {
  modulo: number; antepecho?: number | null; intermedios?: number | null;
  /** cómo se reparten los montantes en cada cara: «maximo» parejo, sin pasar del módulo (vacío); «fijo» cada módulo exacto */
  regla?: 'maximo' | 'fijo' | null;
  /** con módulo fijo, dónde arranca la modulación: al inicio de la cara, centrada (vacío) o al final; el sobrante va al otro lado */
  origen?: 'inicio' | 'centro' | 'fin' | null;
  /** corrimiento de la modulación (m) desde el origen */
  desfase?: number | null;
}
/** lo que hace falta para repartir montantes en un largo */
export type Reparto = Pick<Paneleria, 'modulo' | 'regla' | 'origen' | 'desfase'>;
/**
 * dónde van los montantes en un largo L (de 0 a L, los dos bordes incluidos). Parejo: tantas partes iguales como hagan
 * falta para no pasar del módulo. Fijo: cada módulo exacto desde el origen (inicio, centro o fin) más el desfase; el
 * sobrante queda en los extremos (como la «justificación» de las grillas de muro cortina).
 */
export function divisiones(L: number, rep: Reparto): number[] {
  const mod = Math.max(0.3, rep.modulo);
  if (L <= 1e-9) return [0];
  if ((rep.regla ?? 'maximo') !== 'fijo') { const n = Math.max(1, Math.ceil(L / mod - 1e-6)); return Array.from({ length: n + 1 }, (_, k) => (L * k) / n); }
  const org = rep.origen ?? 'centro', d = rep.desfase ?? 0;
  // un punto de la grilla: al inicio, al final, o de modo que el sobrante quede repartido igual a los dos lados
  const n = Math.floor(L / mod + 1e-9), sobra = L - n * mod;
  const base = org === 'inicio' ? 0 : org === 'fin' ? L : sobra / 2;
  const x0 = (((base + d) % mod) + mod) % mod;
  const out = [0];
  for (let x = x0; x < L - 1e-6; x += mod) if (x > 1e-6) out.push(+x.toFixed(9));
  out.push(L);
  return out;
}
/** un paño: polígono plano (3 o más puntos; en las caras planas, recortado por el borde de la cara) */
export interface Panel { p: P3[]; opaco: boolean; area: number }
export interface ResultadoPaneleria { paneles: Panel[]; montantes: [P3, P3][]; vidrio: { n: number; area: number }; opacos: { n: number; area: number }; largoMontantes: number; largoTravesanos: number; /** paños que no son planos (alabeados más de 5 mm) */ alabeados: number; /** caras planas de la piel (el poliedro) */ caras: number }

/** índices (con fracción) de los montantes sobre un anillo: en las esquinas (giro > 10°) y cada «modulo» m entre ellas */
function montantesAnillo(r: Punto[], rep: Reparto): number[] {
  const n = r.length, L = r.map((q, i) => Math.hypot(r[(i + 1) % n].x - q.x, r[(i + 1) % n].y - q.y));
  const giro = (i: number) => { const a = r[(i - 1 + n) % n], b = r[i], c = r[(i + 1) % n]; const t1 = Math.atan2(b.y - a.y, b.x - a.x), t2 = Math.atan2(c.y - b.y, c.x - b.x); let d = Math.abs(t2 - t1); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
  let esq = r.map((_, i) => i).filter(i => giro(i) > (10 * Math.PI) / 180);
  if (!esq.length) esq = [0];
  const out: number[] = [];
  esq.forEach((e, k) => {
    const f = esq[(k + 1) % esq.length], idx: number[] = [];
    for (let i = e; ; i = (i + 1) % n) { idx.push(i); if ((i + 1) % n === f || idx.length > n) break; }
    const largo = idx.reduce((s, i) => s + L[i], 0), ds = divisiones(largo, rep);
    out.push(e);
    for (const dj of ds.slice(1, -1)) {
      let falta = dj;
      for (const i of idx) { if (falta <= L[i] + 1e-9) { out.push(i + (L[i] > 0 ? falta / L[i] : 0)); break; } falta -= L[i]; }
    }
  });
  return out.sort((a, b) => a - b);
}
function enAnillo(r: Punto[], t: number): Punto { const n = r.length, i = ((Math.floor(t) % n) + n) % n, f = t - Math.floor(t), a = r[i], b = r[(i + 1) % n]; return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; }
/** normal (Newell) y área de un polígono en el espacio */
function newell(q: P3[]): { n: { x: number; y: number; z: number }; area: number } {
  let x = 0, y = 0, z = 0;
  q.forEach((a, i) => { const b = q[(i + 1) % q.length]; x += (a.y - b.y) * (a.z + b.z); y += (a.z - b.z) * (a.x + b.x); z += (a.x - b.x) * (a.y + b.y); });
  const m = Math.hypot(x, y, z);
  return { n: m > 1e-15 ? { x: x / m, y: y / m, z: z / m } : { x: 0, y: 0, z: 1 }, area: m / 2 };
}
/** cuánto se sale del plano un paño de cuatro puntos: distancia del cuarto al plano de los otros tres (m) */
export function alabeo(q: P3[]): number {
  if (q.length < 4) return 0;
  const [a, b, c, d] = q, ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nn = Math.hypot(nx, ny, nz);
  return nn < 1e-12 ? 0 : Math.abs((d.x - a.x) * nx + (d.y - a.y) * ny + (d.z - a.z) * nz) / nn;
}
/** cortes en altura de una banda (fracciones): antepecho opaco y travesaños intermedios del vidrio */
function filas(h: number, ap: number, inter: number): { t: number; opaco: boolean }[] {
  const fr: { t: number; opaco: boolean }[] = [];
  const t0 = ap > 0 && ap < h - 0.3 ? ap / h : 0;
  if (t0 > 0) fr.push({ t: 0, opaco: true });
  for (let j = 0; j <= inter; j++) fr.push({ t: t0 + ((1 - t0) * j) / (inter + 1), opaco: false });
  fr.push({ t: 1, opaco: false });
  return fr;
}
type SZ = { s: number; z: number };
/** recorta un polígono convexo (s, z) por el semiplano f(q) ≥ 0, con f lineal */
function recortarSZ(q: SZ[], f: (p: SZ) => number): SZ[] {
  const out: SZ[] = [];
  q.forEach((p, i) => {
    const r = q[(i + 1) % q.length], fp = f(p), fr = f(r);
    if (fp >= -1e-12) out.push(p);
    if ((fp >= -1e-12) !== (fr >= -1e-12)) { const t = fp / (fp - fr); out.push({ s: p.s + (r.s - p.s) * t, z: p.z + (r.z - p.z) * t }); }
  });
  return out;
}
const areaSZ = (q: SZ[]) => Math.abs(q.reduce((a, p, i) => { const r = q[(i + 1) % q.length]; return a + p.s * r.z - r.s * p.z; }, 0) / 2);
const clave = (a: P3, b: P3) => { const r = (x: number) => Math.round(x * 1000) + 0, k = (q: P3) => `${r(q.x)},${r(q.y)},${r(q.z)}`, x = k(a), y = k(b); return x < y ? x + '|' + y : y + '|' + x; };

/**
 * La panelería de las caras planas (el poliedro de la piel): las caras del mismo plano (en todos los pisos) forman una
 * cara de la torre con una sola grilla: montantes a plomo (líneas de nivel horizontal constante en la cara: en el
 * alzado de esa cara son verticales), repartidos parejo entre sus bordes cada «modulo» m como mucho, y travesaños
 * horizontales en cada losa, el antepecho y los intermedios. Cada paño es el rectángulo de la grilla recortado por el
 * borde de la cara (en un borde inclinado queda un trapecio o un triángulo): siempre plano.
 */
function paneleriaPlana(bandas: BandaFachada[], rep: Reparto, ap: number, inter: number, res: ResultadoPaneleria, vistos: Set<string>) {
  type Cara = { q: P3[]; bd: BandaFachada };
  type Grupo = { n: { x: number; y: number; z: number }; d: number; caras: Cara[] };
  const grupos: Grupo[] = [];
  const agregar = (q: P3[], bd: BandaFachada) => {
    const w = newell(q); if (w.area < 1e-6) return;
    const d = w.n.x * q[0].x + w.n.y * q[0].y + w.n.z * q[0].z;
    let g = grupos.find(x => x.n.x * w.n.x + x.n.y * w.n.y + x.n.z * w.n.z > 0.99995 && Math.abs(x.d - d) < 0.005);
    if (!g) { g = { n: w.n, d, caras: [] }; grupos.push(g); }
    g.caras.push({ q, bd });
  };
  bandas.forEach(bd => {
    const m = bd.a.length;
    for (let i = 0; i < m; i++) {
      const raw: P3[] = [{ ...bd.a[i], z: bd.z0 }, { ...bd.a[(i + 1) % m], z: bd.z0 }, { ...bd.b[(i + 1) % m], z: bd.z1 }, { ...bd.b[i], z: bd.z1 }];
      const q = raw.filter((p, k) => { const r = raw[(k + 1) % raw.length]; return Math.hypot(p.x - r.x, p.y - r.y, p.z - r.z) > 1e-6; });
      if (q.length < 3) continue;
      if (q.length === 4 && alabeo(q) > 0.005) { res.alabeados++; agregar([q[0], q[1], q[2]], bd); agregar([q[0], q[2], q[3]], bd); }
      else agregar(q, bd);
    }
  });
  res.caras += grupos.length;
  grupos.forEach(g => {
    const n2 = Math.hypot(g.n.x, g.n.y);
    if (n2 < 1e-3) { g.caras.forEach(c => res.paneles.push({ p: c.q, opaco: false, area: newell(c.q).area })); return; }   // cara horizontal
    const h = { x: -g.n.y / n2, y: g.n.x / n2 }, m2 = { x: g.n.x / n2, y: g.n.y / n2 };
    const aSZ = (p: P3): SZ => ({ s: p.x * h.x + p.y * h.y, z: p.z });
    const a3 = (q: SZ): P3 => { const t = (g.d - g.n.z * q.z) / n2; return { x: q.s * h.x + t * m2.x, y: q.s * h.y + t * m2.y, z: q.z }; };
    const todas = g.caras.flatMap(c => c.q.map(aSZ)), smin = Math.min(...todas.map(q => q.s)), smax = Math.max(...todas.map(q => q.s));
    const cols = divisiones(smax - smin, rep).map(x => smin + x);
    // bordes de la cara que no comparte con otra del mismo plano: las esquinas y las aristas inclinadas son montantes
    const usos = new Map<string, number>();
    g.caras.forEach(c => c.q.forEach((p, i) => { const k = clave(p, c.q[(i + 1) % c.q.length]); usos.set(k, (usos.get(k) ?? 0) + 1); }));
    const montante = (a: P3, b: P3) => { if (Math.abs(a.z - b.z) < 1e-6 || Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-4) return; const k = clave(a, b); if (vistos.has(k)) return; vistos.add(k); res.montantes.push([a, b]); res.largoMontantes += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); };
    g.caras.forEach(c => {
      const poli = c.q.map(aSZ), hb = c.bd.z1 - c.bd.z0, fr = filas(hb, ap, inter);
      c.q.forEach((p, i) => { const r = c.q[(i + 1) % c.q.length]; if (usos.get(clave(p, r)) === 1) montante(p, r); });
      cols.forEach(sk => {
        // el montante de la grilla dentro de la cara
        const z = recortarSZ(recortarSZ(poli, q => q.s - sk + 1e-7), q => sk + 1e-7 - q.s);
        if (z.length >= 2) { const lo = z.reduce((x, y) => (y.z < x.z ? y : x)), hi = z.reduce((x, y) => (y.z > x.z ? y : x)); montante(a3({ s: sk, z: lo.z }), a3({ s: sk, z: hi.z })); }
      });
      for (let k = 0; k + 1 < cols.length; k++) {
        for (let j = 0; j + 1 < fr.length; j++) {
          const z0 = c.bd.z0 + hb * fr[j].t, z1 = c.bd.z0 + hb * fr[j + 1].t;
          let q = recortarSZ(poli, x => x.s - cols[k]); q = recortarSZ(q, x => cols[k + 1] - x.s); q = recortarSZ(q, x => x.z - z0); q = recortarSZ(q, x => z1 - x.z);
          if (q.length < 3 || areaSZ(q) < 1e-6) continue;
          const p3 = q.map(a3);
          res.paneles.push({ p: p3, opaco: fr[j].opaco, area: newell(p3).area });
          p3.forEach((x, i) => { const y = p3[(i + 1) % p3.length]; if (Math.abs(x.z - z0) < 1e-6 && Math.abs(y.z - z0) < 1e-6) res.largoTravesanos += Math.hypot(x.x - y.x, x.y - y.y); });
        }
      }
    });
  });
}

export function calcularPaneleria(bandas: BandaFachada[], pn: Paneleria): ResultadoPaneleria {
  const res: ResultadoPaneleria = { paneles: [], montantes: [], vidrio: { n: 0, area: 0 }, opacos: { n: 0, area: 0 }, largoMontantes: 0, largoTravesanos: 0, alabeados: 0, caras: 0 };
  const ap = Math.max(0, pn.antepecho ?? 0), inter = Math.max(0, Math.round(pn.intermedios ?? 0)), mod = Math.max(0.3, pn.modulo);
  const vistos = new Set<string>();
  const rep: Reparto = { ...pn, modulo: mod };
  paneleriaPlana(bandas.filter(b => b.plana), rep, ap, inter, res, vistos);
  bandas.filter(b => !b.plana).forEach(bd => {
    const h = bd.z1 - bd.z0; if (h <= 1e-6) return;
    const ts = bd.montantes ? bd.a.map((_, i) => i) : montantesAnillo(bd.a, rep);
    const fr = filas(h, ap, inter);
    const P = (t: number, s: number): P3 => { const a = enAnillo(bd.a, t), b = enAnillo(bd.b, t); return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s, z: bd.z0 + h * s }; };
    ts.forEach((t, k) => {
      const t2 = k + 1 < ts.length ? ts[k + 1] : ts[0] + bd.a.length;
      const pa = P(t, 0), pb = P(t, 1);
      res.montantes.push([pa, pb]); res.largoMontantes += Math.hypot(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z);
      for (let j = 0; j + 1 < fr.length; j++) {
        const q = [P(t, fr[j].t), P(t2, fr[j].t), P(t2, fr[j + 1].t), P(t, fr[j + 1].t)];
        const ar = newell([q[0], q[1], q[2]]).area + newell([q[0], q[2], q[3]]).area;
        if (ar < 1e-9) continue;
        res.paneles.push({ p: q, opaco: fr[j].opaco, area: ar });
        res.largoTravesanos += Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y, q[1].z - q[0].z);
        if (alabeo(q) > 0.005) res.alabeados++;
      }
    });
  });
  const sum = (op: boolean) => res.paneles.filter(x => x.opaco === op).reduce((s, x) => ({ n: s.n + 1, area: s.area + x.area }), { n: 0, area: 0 });
  res.vidrio = sum(false); res.opacos = sum(true);
  return res;
}
