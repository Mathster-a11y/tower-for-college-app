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
