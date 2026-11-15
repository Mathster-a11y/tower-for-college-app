/**
 * Encuentros entre muros (juntas), con la idea de las «líneas de referencia» de los programas de dibujo: cada muro
 * recto tiene un eje (de punta a punta, por el medio del espesor) y dos muros se conectan cuando sus ejes se tocan.
 *  - L: las dos puntas coinciden. Por defecto pasa el que dicen las hojas J (abajo); se puede elegir inglete (el corte
 *    va por la bisectriz) o que pase el otro (el que pasa llega a la cara de afuera del otro y el otro se corta contra
 *    su cara de adentro).
 *  - T: la punta de uno cae sobre el eje del otro (no en una punta). El que llega se corta contra la cara del que pasa.
 *  - X: los ejes se cruzan. Pasa el que dicen las hojas J (o el elegido); el otro se corta en dos contra las dos caras.
 * Quién pasa, como en los dibujos de las hojas J de la planilla: en la pieza simétrica las alas (bm, bn) van de punta a
 * punta y el alma (h) se corta en sus caras; en la asimétrica el ala superior (b1) cruza entera y las almas cuelgan
 * debajo. Es decir: pasa el muro perpendicular al viento (el ala) y se corta el paralelo (el alma). Con encuentros en
 * otro ángulo (ninguno de los dos es perpendicular al viento) pasa el más grueso.
 * Con cualquier ángulo: los cortes siguen la cara del otro muro (corte oblicuo), así la huella no tiene huecos ni
 * partes contadas dos veces. Todo es geometría de la planta: la usan el dibujo y la sección exacta (área y J).
 */
import type { Muro } from './modelo';
import { tipoDe } from './modelo';
import { enPlanta } from './perfil';

export type P = { x: number; y: number };
export interface Eje { id: string; a: P; b: P; e: number; u: P; n: P; L: number;
  /** línea de referencia (el eje corrido hacia una cara si el muro se dibujó por su cara) */
  ra: P; rb: P }
export type TipoJunta = 'L' | 'T' | 'X';
export type EleccionJunta = 'inglete' | 'pasaA' | 'pasaB';
/** viento con el que se decide quién pasa: A sopla en y (el ala es el muro en x), B sopla en x */
export type VientoJunta = 'A' | 'B';
export interface Junta { tipo: TipoJunta; a: string; b: string; /** punta de a (y de b) que participa: 0 = a, 1 = b, −1 = ninguna (pasa entero) */ ka: number; kb: number; p: P; angulo: number }

const sub = (p: P, q: P): P => ({ x: p.x - q.x, y: p.y - q.y });
const add = (p: P, q: P): P => ({ x: p.x + q.x, y: p.y + q.y });
const mul = (p: P, k: number): P => ({ x: p.x * k, y: p.y * k });
const dot = (p: P, q: P) => p.x * q.x + p.y * q.y;
const cruz = (p: P, q: P) => p.x * q.y - p.y * q.x;
const dist = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);

/**
 * Quién pasa en un encuentro, según los dibujos de las hojas J: el muro perpendicular al viento (el ala) pasa y el
 * paralelo (el alma) se corta. Si ninguno de los dos es perpendicular al viento (encuentro en otro ángulo) pasa el más
 * grueso; si son igual de gruesos, el de id menor (o null con «empate», para que una L quede a inglete).
 */
export function quienPasa(A: Eje, B: Eje, viento: VientoJunta = 'A', empate = false): Eje | null {
  // viento A: sopla en y → el ala va en x (|u.x| ≈ 1); viento B: sopla en x → el ala va en y
  const perp = (E: Eje) => (viento === 'A' ? Math.abs(E.u.x) : Math.abs(E.u.y)) > Math.cos((5 * Math.PI) / 180);
  const pa = perp(A), pb = perp(B);
  if (pa !== pb) return pa ? A : B;
  if (Math.abs(A.e - B.e) > 1e-6) return A.e > B.e ? A : B;
  return empate ? null : A.id < B.id ? A : B;
}

/** eje de un muro recto: un tabique, o un perfil de 4 vértices que es un rectángulo (muro dibujado en diagonal) */
export function ejeDeMuro(m: Muro): Eje | null {
  const t = tipoDe(m);
  let a: P, b: P, e: number;
  if (t === 'tabique') {
    const h = m.largo / 2;
    [a, b] = m.dir === 'X' ? [{ x: m.x - h, y: m.y }, { x: m.x + h, y: m.y }] : [{ x: m.x, y: m.y - h }, { x: m.x, y: m.y + h }];
    e = m.espesor;
  } else if (t === 'perfil') {
    const v = enPlanta(m).v;
    if (v.length !== 4 || v.some(q => q.b || q.c1 || q.c2) || (enPlanta(m).huecos?.length ?? 0) > 0) return null;
    const lados = [0, 1, 2, 3].map(i => dist(v[i], v[(i + 1) % 4]));
    // rectángulo: lados opuestos iguales y ángulo recto
    if (Math.abs(lados[0] - lados[2]) > 1e-3 || Math.abs(lados[1] - lados[3]) > 1e-3 || Math.abs(dot(sub(v[1], v[0]), sub(v[2], v[1]))) > 1e-3 * lados[0] * lados[1]) return null;
    const corto = lados[0] <= lados[1] ? 0 : 1;           // los lados cortos son las puntas
    const m0 = mul(add(v[corto], v[corto + 1]), 0.5), m1 = mul(add(v[corto + 2], v[(corto + 3) % 4]), 0.5);
    a = m0; b = m1; e = lados[corto];
  } else return null;
  const L = dist(a, b);
  if (L < 1e-6) return null;
  const u = mul(sub(b, a), 1 / L), n = { x: -u.y, y: u.x };
  const off = m.refLado ? (m.refLado * e) / 2 : 0;
  return { id: m.id, a, b, e, u, n, L, ra: add(a, mul(n, off)), rb: add(b, mul(n, off)) };
}

/** línea de referencia de un muro recto (sus dos puntas), o null si no es recto */
export function lineaReferencia(m: Muro): [P, P] | null {
  const E = ejeDeMuro(m);
  return E ? [E.ra, E.rb] : null;
}

/**
 * El mismo muro con otro espesor, dejando quieta su línea de referencia (si se dibujó por una cara, esa cara no se
 * mueve y el muro crece o se afina hacia el otro lado, como en ArchiCAD). Solo tabiques; los demás cambian centrados.
 */
export function conEspesor(m: Muro, e: number): Muro {
  if (!m.refLado || tipoDe(m) !== 'tabique') return { ...m, espesor: e };
  const E = ejeDeMuro(m)!;
  const d = ((e - m.espesor) / 2) * -m.refLado;            // el centro se corre hacia el lado del cuerpo
  return { ...m, espesor: e, x: +(m.x + E.n.x * d).toFixed(4), y: +(m.y + E.n.y * d).toFixed(4) };
}

/** proyección de q sobre el eje: parámetro (0 = a, L = b) y distancia al eje */
const proy = (E: Eje, q: P) => ({ t: dot(sub(q, E.a), E.u), d: Math.abs(dot(sub(q, E.a), E.n)) });

/** juntas entre los muros (los que están en el mismo nivel, si se pasa el filtro) */
export function detectarJuntas(muros: Muro[], tol = 0.02): Junta[] {
  const ejes = muros.map(ejeDeMuro).filter(Boolean) as Eje[];
  const out: Junta[] = [];
  for (let i = 0; i < ejes.length; i++) for (let j = i + 1; j < ejes.length; j++) {
    const A = ejes[i], B = ejes[j];
    const ang = (Math.acos(Math.min(1, Math.abs(dot(A.u, B.u)))) * 180) / Math.PI;
    if (ang < 1) continue;                                        // paralelos: no hay junta (se tocan de costado o en línea)
    const pa = [A.a, A.b], pb = [B.a, B.b];
    // L: puntas que coinciden, de los ejes o de las líneas de referencia (dos muros dibujados por su cara de afuera se
    // enlazan en la esquina de afuera, como en ArchiCAD)
    let hecho = false;
    const ra = [A.ra, A.rb], rb = [B.ra, B.rb];
    for (let ka = 0; ka < 2 && !hecho; ka++) for (let kb = 0; kb < 2 && !hecho; kb++) {
      if (dist(pa[ka], pb[kb]) <= tol + 1e-9) { out.push({ tipo: 'L', a: A.id, b: B.id, ka, kb, p: pa[ka], angulo: ang }); hecho = true; }
      else if (dist(ra[ka], rb[kb]) <= tol + 1e-9) { out.push({ tipo: 'L', a: A.id, b: B.id, ka, kb, p: ra[ka], angulo: ang }); hecho = true; }
    }
    if (hecho) continue;
    // T: una punta sobre el eje del otro (adentro, lejos de sus puntas)
    const enEje = (E: Eje, q: P) => { const r = proy(E, q); return r.d <= Math.max(tol, 1e-9) && r.t > tol && r.t < E.L - tol; };
    // (o la punta de la línea de referencia sobre la línea de referencia del otro)
    const enRef = (E: Eje, q: P) => { const r = proy({ ...E, a: E.ra }, q); return r.d <= Math.max(tol, 1e-9) && r.t > tol && r.t < E.L - tol; };
    for (let ka = 0; ka < 2 && !hecho; ka++) if (enEje(B, pa[ka]) || enRef(B, ra[ka])) { out.push({ tipo: 'T', a: A.id, b: B.id, ka, kb: -1, p: pa[ka], angulo: ang }); hecho = true; }
    for (let kb = 0; kb < 2 && !hecho; kb++) if (enEje(A, pb[kb]) || enRef(A, rb[kb])) { out.push({ tipo: 'T', a: B.id, b: A.id, ka: kb, kb: -1, p: pb[kb], angulo: ang }); hecho = true; }
    if (hecho) continue;
    // X: los ejes se cruzan por dentro de los dos
    const den = cruz(A.u, B.u);
    if (Math.abs(den) < 1e-12) continue;
    const ta = cruz(sub(B.a, A.a), B.u) / den, tb = cruz(sub(B.a, A.a), A.u) / den;
    if (ta > tol && ta < A.L - tol && tb > tol && tb < B.L - tol) out.push({ tipo: 'X', a: A.id, b: B.id, ka: -1, kb: -1, p: add(A.a, mul(A.u, ta)), angulo: ang });
  }
  return out;
}

/** clave de una junta para guardar la elección (sin importar el orden) */
export const claveJunta = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** intersección de la recta p + s·d con la recta q + t·f (null si son paralelas) */
function corte(p: P, d: P, q: P, f: P): P | null {
  const den = cruz(d, f);
  if (Math.abs(den) < 1e-12) return null;
  const s = cruz(sub(q, p), f) / den;
  return add(p, mul(d, s));
}

/**
 * Huella limpia de cada muro con juntas: uno o más polígonos (el que se corta en una X queda en dos).
 * Los muros sin juntas no aparecen (se dibujan como siempre).
 */
export function huellasLimpias(muros: Muro[], juntas: Junta[], elecciones: Record<string, EleccionJunta> = {}, viento: VientoJunta = 'A'): Map<string, P[][]> {
  const ejes = new Map(muros.map(m => [m.id, ejeDeMuro(m)]).filter(([, e]) => e) as [string, Eje][]);
  // cada punta de cada muro: la recta que la corta (punto y dirección) y de qué lado queda el cuerpo del muro
  type Fin = { q: P; f: P } | null;
  const fines = new Map<string, [Fin, Fin]>();
  const cortes = new Map<string, { q: P; f: P }[][]>();     // X: pares de rectas que sacan un pedazo del medio
  const fin = (id: string) => { if (!fines.has(id)) fines.set(id, [null, null]); return fines.get(id)!; };
  /** cara de O del lado de q (s = +1) o del lado contrario (s = −1) */
  const cara = (O: Eje, q: P, s: 1 | -1) => { const lado = Math.sign(dot(sub(q, O.a), O.n)) || 1; return { q: add(O.a, mul(O.n, (s * lado * O.e) / 2)), f: O.u }; };
  juntas.forEach(j => {
    const A = ejes.get(j.a), B = ejes.get(j.b);
    if (!A || !B) return;
    const centroA = mul(add(A.a, A.b), 0.5), centroB = mul(add(B.a, B.b), 0.5);
    const el = elecciones[claveJunta(j.a, j.b)];
    if (j.tipo === 'T') { fin(A.id)[j.ka] = cara(B, centroA, 1); return; }
    if (j.tipo === 'X') {
      const pasa = el === 'pasaA' ? (A.id < B.id ? A : B) : el === 'pasaB' ? (A.id < B.id ? B : A) : quienPasa(A, B, viento)!;
      const otro = pasa === A ? B : A;
      const q1 = add(pasa.a, mul(pasa.n, pasa.e / 2)), q2 = add(pasa.a, mul(pasa.n, -pasa.e / 2));
      const lista = cortes.get(otro.id) ?? []; lista.push([{ q: q1, f: pasa.u }, { q: q2, f: pasa.u }]); cortes.set(otro.id, lista);
      return;
    }
    // L
    // sin elección: el de las hojas J (o inglete si son iguales y en ángulo: ninguno es más fuerte)
    const auto = quienPasa(A, B, viento, true);
    const eleccion: EleccionJunta = el ?? (auto ? ((auto === A) === (A.id < B.id) ? 'pasaA' : 'pasaB') : 'inglete');
    if (eleccion === 'inglete') {
      // las caras de afuera se cortan en la esquina de afuera; las de adentro en la de adentro: el corte une las dos
      const ladoA = Math.sign(dot(sub(centroB, A.a), A.n)) || 1, ladoB = Math.sign(dot(sub(centroA, B.a), B.n)) || 1;
      const afueraA = add(A.a, mul(A.n, (-ladoA * A.e) / 2)), adentroA = add(A.a, mul(A.n, (ladoA * A.e) / 2));
      const afueraB = add(B.a, mul(B.n, (-ladoB * B.e) / 2)), adentroB = add(B.a, mul(B.n, (ladoB * B.e) / 2));
      const ext = corte(afueraA, A.u, afueraB, B.u), int = corte(adentroA, A.u, adentroB, B.u);
      if (ext && int && dist(ext, int) > 1e-9) { const f = mul(sub(int, ext), 1 / dist(ext, int)); fin(A.id)[j.ka] = { q: ext, f }; fin(B.id)[j.kb] = { q: ext, f }; }
      return;
    }
    const pasa = (eleccion === 'pasaA') === (A.id < B.id) ? A : B, otro = pasa === A ? B : A;
    const kPasa = pasa === A ? j.ka : j.kb, kOtro = pasa === A ? j.kb : j.ka;
    const cPasa = pasa === A ? centroA : centroB, cOtro = pasa === A ? centroB : centroA;
    fin(pasa.id)[kPasa] = cara(otro, cPasa, -1);     // llega a la cara de afuera del otro
    fin(otro.id)[kOtro] = cara(pasa, cOtro, 1);      // el otro se corta contra la cara de adentro
  });
  const out = new Map<string, P[][]>();
  ejes.forEach((E, id) => {
    const fs = fines.get(id), cs = cortes.get(id);
    if (!fs && !cs) return;
    const izq = add(E.a, mul(E.n, E.e / 2)), der = add(E.a, mul(E.n, -E.e / 2));
    // cada lado (recta izq y der) cortado por la recta de cada punta; sin junta en una punta, el corte recto de siempre
    const puntaRecta = (k: number) => ({ q: k ? E.b : E.a, f: E.n });
    const f0 = fs?.[0] ?? puntaRecta(0), f1 = fs?.[1] ?? puntaRecta(1);
    const v = (lado: P, F: { q: P; f: P }) => corte(lado, E.u, F.q, F.f) ?? lado;
    let tramos: { desde: { q: P; f: P }; hasta: { q: P; f: P } }[] = [{ desde: f0, hasta: f1 }];
    // X: se saca el pedazo entre las dos caras del que pasa
    (cs ?? []).forEach(([c1, c2]) => {
      const t1 = dot(sub(corte(E.a, E.u, c1.q, c1.f) ?? E.a, E.a), E.u), t2 = dot(sub(corte(E.a, E.u, c2.q, c2.f) ?? E.a, E.a), E.u);
      const [cA, cB] = t1 <= t2 ? [c1, c2] : [c2, c1];
      tramos = tramos.flatMap(tr => [{ desde: tr.desde, hasta: cA }, { desde: cB, hasta: tr.hasta }]);
    });
    const polis = tramos.map(tr => [v(der, tr.desde), v(der, tr.hasta), v(izq, tr.hasta), v(izq, tr.desde)])
      .filter(pg => Math.abs(areaPoligono(pg)) > 1e-8);
    out.set(id, polis);
  });
  return out;
}

export function areaPoligono(pg: P[]): number {
  let s = 0;
  pg.forEach((a, i) => { const b = pg[(i + 1) % pg.length]; s += a.x * b.y - b.x * a.y; });
  return s / 2;
}
/** área, baricentro y momentos de inercia (respecto de su baricentro) de un conjunto de polígonos */
export function propiedadesPoligonos(pgs: P[][]): { A: number; xg: number; yg: number; Jx: number; Jy: number } {
  let A = 0, Sx = 0, Sy = 0, Ixx = 0, Iyy = 0;
  pgs.forEach(pg0 => {
    const s = areaPoligono(pg0) >= 0 ? 1 : -1, pg = s > 0 ? pg0 : [...pg0].reverse();
    pg.forEach((a, i) => {
      const b = pg[(i + 1) % pg.length], c = a.x * b.y - b.x * a.y;
      A += c / 2; Sy += ((a.x + b.x) * c) / 6; Sx += ((a.y + b.y) * c) / 6;
      Ixx += ((a.y * a.y + a.y * b.y + b.y * b.y) * c) / 12; Iyy += ((a.x * a.x + a.x * b.x + b.x * b.x) * c) / 12;
    });
  });
  const xg = A ? Sy / A : 0, yg = A ? Sx / A : 0;
  return { A, xg, yg, Jx: Ixx - A * yg * yg, Jy: Iyy - A * xg * xg };
}
