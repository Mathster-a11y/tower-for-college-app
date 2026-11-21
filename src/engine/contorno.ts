/**
 * Herramientas de dibujo de contornos (las de cualquier programa de CAD, con nombres y lógica propios): formas
 * (rectángulo, círculo, polígono regular, elipse), empalme y chaflán en un vértice, desfase del contorno, dividir un
 * lado, largo y ángulo de un lado, y simetría, giro y escala del contorno. Trabaja sobre anillos de vértices con
 * bulge (arcos) y Bézier, como los perfiles.
 */
import { polilinea, type VerticePerfil } from './perfil';
import { tramosListos, paralelaTramos } from './colocar';
import type { Punto } from './silueta';

type Anillo = VerticePerfil[];
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const limpio = (q: VerticePerfil): VerticePerfil => ({ x: r4(q.x), y: r4(q.y), ...(q.b ? { b: q.b } : {}), ...(q.c1 && q.c2 ? { c1: { x: r4(q.c1.x), y: r4(q.c1.y) }, c2: { x: r4(q.c2.x), y: r4(q.c2.y) } } : {}) });

/** área con signo (positiva en sentido antihorario), con los arcos y las Bézier (partidos muy finos) */
export function areaConSigno(vs: Anillo): number {
  const ps = polilinea(vs, 0.5, 64);
  let A = 0; ps.forEach((a, i) => { const b = ps[(i + 1) % ps.length]; A += (a.x * b.y - b.x * a.y) / 2; });
  return A;
}

// ------------------------------------------------------------------ formas
export function rectangulo(cx: number, cy: number, ax: number, ay: number): Anillo {
  return [{ x: cx - ax / 2, y: cy - ay / 2 }, { x: cx + ax / 2, y: cy - ay / 2 }, { x: cx + ax / 2, y: cy + ay / 2 }, { x: cx - ax / 2, y: cy + ay / 2 }].map(limpio);
}
/** círculo exacto: dos semicírculos (bulge 1) */
export function circulo(cx: number, cy: number, r: number): Anillo {
  return [{ x: cx + r, y: cy, b: 1 }, { x: cx - r, y: cy, b: 1 }].map(limpio);
}
/** polígono regular de n lados; «r» es el radio del círculo circunscrito (o inscrito si «inscrito» es false) */
export function poligonoRegular(cx: number, cy: number, r: number, n: number, ang0 = -90, alCirculo: 'circunscrito' | 'inscrito' = 'circunscrito'): Anillo {
  const k = Math.max(3, Math.round(n)), R = alCirculo === 'inscrito' ? r / Math.cos(Math.PI / k) : r;
  return Array.from({ length: k }, (_, i) => { const t = ((ang0 + (360 * i) / k) * Math.PI) / 180; return limpio({ x: cx + R * Math.cos(t), y: cy + R * Math.sin(t) }); });
}
/** elipse de semiejes a (en x) y b (en y): cuatro Bézier (error de forma menor a 0,03 %) */
export function elipse(cx: number, cy: number, a: number, b: number): Anillo {
  const k = 0.5522847498;
  return [
    { x: cx + a, y: cy, c1: { x: cx + a, y: cy + k * b }, c2: { x: cx + k * a, y: cy + b } },
    { x: cx, y: cy + b, c1: { x: cx - k * a, y: cy + b }, c2: { x: cx - a, y: cy + k * b } },
    { x: cx - a, y: cy, c1: { x: cx - a, y: cy - k * b }, c2: { x: cx - k * a, y: cy - b } },
    { x: cx, y: cy - b, c1: { x: cx + k * a, y: cy - b }, c2: { x: cx + a, y: cy - k * b } },
  ].map(limpio);
}

// ------------------------------------------------------------------ vértices y lados
const recto = (vs: Anillo, i: number) => !vs[(i + vs.length) % vs.length].b && !vs[(i + vs.length) % vs.length].c1;
/**
 * Empalme (redondeo) de radio r en el vértice i: el vértice se reemplaza por un arco tangente a los dos lados. Los dos
 * lados tienen que ser rectos y lo bastante largos.
 */
export function empalme(vs: Anillo, i: number, r: number): Anillo | { error: string } {
  const n = vs.length, ia = (i - 1 + n) % n, P = vs[i], A = vs[ia], B = vs[(i + 1) % n];
  if (!recto(vs, ia) || !recto(vs, i)) return { error: 'El empalme va entre dos lados rectos.' };
  if (!(r > 0)) return { error: 'El radio tiene que ser mayor que cero.' };
  const u = { x: A.x - P.x, y: A.y - P.y }, w = { x: B.x - P.x, y: B.y - P.y }, Lu = Math.hypot(u.x, u.y), Lw = Math.hypot(w.x, w.y);
  const cos = (u.x * w.x + u.y * w.y) / (Lu * Lw), ang = Math.acos(Math.max(-1, Math.min(1, cos)));
  if (ang < 1e-3 || Math.PI - ang < 1e-3) return { error: 'Los dos lados están alineados: no hay esquina para redondear.' };
  const t = r / Math.tan(ang / 2);
  if (t > Lu + 1e-9 || t > Lw + 1e-9) return { error: `El radio no entra: haría falta un lado de al menos ${t.toFixed(2).replace('.', ',')} m.` };
  const p1 = { x: P.x + (u.x / Lu) * t, y: P.y + (u.y / Lu) * t }, p2 = { x: P.x + (w.x / Lw) * t, y: P.y + (w.y / Lw) * t };
  // giro del arco = π − ángulo de la esquina, con el sentido de la esquina
  const giro = Math.PI - ang, cr = (P.x - A.x) * (B.y - P.y) - (P.y - A.y) * (B.x - P.x), b = Math.tan(giro / 4) * Math.sign(cr);
  const out = vs.map(q => ({ ...q }));
  out.splice(i, 1, { x: p1.x, y: p1.y, b }, { x: p2.x, y: p2.y, ...(vs[i].b ? { b: vs[i].b } : {}) });
  return quitarRepetidos(out.map(limpio));
}
/** chaflán: corta la esquina i a la distancia d sobre cada lado (d2 sobre el segundo si se da) */
export function chaflan(vs: Anillo, i: number, d: number, d2 = d): Anillo | { error: string } {
  const n = vs.length, ia = (i - 1 + n) % n, P = vs[i], A = vs[ia], B = vs[(i + 1) % n];
  if (!recto(vs, ia) || !recto(vs, i)) return { error: 'El chaflán va entre dos lados rectos.' };
  const Lu = Math.hypot(A.x - P.x, A.y - P.y), Lw = Math.hypot(B.x - P.x, B.y - P.y);
  if (!(d > 0) || !(d2 > 0)) return { error: 'La distancia tiene que ser mayor que cero.' };
  if (d > Lu + 1e-9 || d2 > Lw + 1e-9) return { error: 'La distancia es más larga que el lado.' };
  const p1 = { x: P.x + ((A.x - P.x) / Lu) * d, y: P.y + ((A.y - P.y) / Lu) * d }, p2 = { x: P.x + ((B.x - P.x) / Lw) * d2, y: P.y + ((B.y - P.y) / Lw) * d2 };
  const out = vs.map(q => ({ ...q }));
  out.splice(i, 1, p1, p2);
  return quitarRepetidos(out.map(limpio));
}
/** parte el lado i (recto) en n partes iguales */
export function dividirLado(vs: Anillo, i: number, partes: number): Anillo | { error: string } {
  const n = vs.length, a = vs[i], b = vs[(i + 1) % n], k = Math.round(partes);
  if (!recto(vs, i)) return { error: 'Solo se dividen los lados rectos.' };
  if (k < 2) return { error: 'Al menos en dos partes.' };
  const nuevos = Array.from({ length: k - 1 }, (_, j) => ({ x: a.x + ((b.x - a.x) * (j + 1)) / k, y: a.y + ((b.y - a.y) * (j + 1)) / k }));
  const out = vs.map(q => ({ ...q }));
  out.splice(i + 1, 0, ...nuevos);
  return out.map(limpio);
}
/** el lado i con otro largo (queda fijo su primer vértice) y/o otro ángulo (grados, desde x, antihorario) */
export function ladoCon(vs: Anillo, i: number, largo: number, angulo?: number): Anillo | { error: string } {
  const n = vs.length, a = vs[i], j = (i + 1) % n, b = vs[j];
  if (!recto(vs, i)) return { error: 'Solo los lados rectos tienen largo y ángulo para escribir.' };
  if (!(largo > 0)) return { error: 'El largo tiene que ser mayor que cero.' };
  const t = angulo !== undefined ? (angulo * Math.PI) / 180 : Math.atan2(b.y - a.y, b.x - a.x);
  const out = vs.map(q => ({ ...q }));
  out[j] = { ...out[j], x: a.x + largo * Math.cos(t), y: a.y + largo * Math.sin(t) };
  return out.map(limpio);
}
/** largo y ángulo (grados) de un lado recto; para arcos, el largo del arco y el radio */
export function medidaLado(vs: Anillo, i: number): { largo: number; angulo: number; radio?: number } {
  const a = vs[i], b = vs[(i + 1) % vs.length], c = Math.hypot(b.x - a.x, b.y - a.y), angulo = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (a.b) { const th = 4 * Math.atan(a.b), R = c / (2 * Math.abs(Math.sin(th / 2))); return { largo: R * Math.abs(th), angulo, radio: R }; }
  return { largo: c, angulo };
}
/** el arco del lado i con radio R (el arco menor, del mismo lado que estaba; si era recto, hacia afuera) */
export function arcoConRadio(vs: Anillo, i: number, R: number): Anillo | { error: string } {
  const a = vs[i], b = vs[(i + 1) % vs.length], c = Math.hypot(b.x - a.x, b.y - a.y);
  if (R < c / 2 - 1e-9) return { error: `El radio tiene que ser al menos la mitad de la cuerda (${(c / 2).toFixed(3).replace('.', ',')} m).` };
  const th = 2 * Math.asin(Math.min(1, c / (2 * R)));
  const sg = a.b ? Math.sign(a.b) : Math.sign(areaConSigno(vs)) || 1;   // recto: la panza hacia afuera (bulge + = a la derecha del avance)
  const out = vs.map(q => ({ ...q }));
  out[i] = { x: a.x, y: a.y, b: sg * Math.tan(th / 4) };
  return out.map(limpio);
}

// ------------------------------------------------------------------ todo el contorno
/** contorno paralelo a la distancia d: positiva hacia afuera, negativa hacia adentro. Arcos exactos, esquinas en inglete. */
export function desfasarAnillo(vs: Anillo, d: number): Anillo | { error: string } {
  const ts = tramosListos(vs, true);
  if (ts.length < 2) return { error: 'El contorno necesita al menos dos lados.' };
  // en sentido antihorario, la izquierda es adentro: hacia afuera es d negativa
  const s = Math.sign(areaConSigno(vs)) || 1;
  const r = paralelaTramos(ts, -s * d, true);
  if ('error' in r) return r;
  // un lado que se da vuelta: el desfase es más grande que el contorno
  const n = r.v.length;
  if (ts.some((t, i) => !t.bulge && ((r.v[(i + 1) % n].x - r.v[i].x) * (t.b.x - t.a.x) + (r.v[(i + 1) % n].y - r.v[i].y) * (t.b.y - t.a.y)) <= 0)) return { error: 'El desfase hacia adentro es más grande que el contorno.' };
  const A0 = Math.abs(areaConSigno(vs)), a1 = areaConSigno(r.v), A1 = Math.abs(a1);
  if (d < 0 && (A1 >= A0 || Math.sign(a1) !== s)) return { error: 'El desfase hacia adentro es más grande que el contorno.' };
  return quitarRepetidos(r.v);
}
export function espejarAnillo(vs: Anillo, eje: 'x' | 'y', c: Punto): Anillo {
  const f = (q: Punto) => (eje === 'x' ? { x: 2 * c.x - q.x, y: q.y } : { x: q.x, y: 2 * c.y - q.y });
  return vs.map(q => limpio({ ...f(q), ...(q.b ? { b: -q.b } : {}), ...(q.c1 && q.c2 ? { c1: f(q.c1), c2: f(q.c2) } : {}) }));
}
export function girarAnillo(vs: Anillo, grados: number, c: Punto): Anillo {
  const t = (grados * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
  const f = (q: Punto) => ({ x: c.x + (q.x - c.x) * cs - (q.y - c.y) * sn, y: c.y + (q.x - c.x) * sn + (q.y - c.y) * cs });
  return vs.map(q => limpio({ ...f(q), ...(q.b ? { b: q.b } : {}), ...(q.c1 && q.c2 ? { c1: f(q.c1), c2: f(q.c2) } : {}) }));
}
export function escalarAnillo(vs: Anillo, k: number, c: Punto): Anillo {
  const f = (q: Punto) => ({ x: c.x + (q.x - c.x) * k, y: c.y + (q.y - c.y) * k });
  return vs.map(q => limpio({ ...f(q), ...(q.b ? { b: q.b } : {}), ...(q.c1 && q.c2 ? { c1: f(q.c1), c2: f(q.c2) } : {}) }));
}
/** saca vértices repetidos (a menos de 0,1 mm) */
export function quitarRepetidos(vs: Anillo): Anillo {
  return vs.filter((q, i) => { const s = vs[(i + 1) % vs.length]; return vs.length <= 2 || Math.hypot(q.x - s.x, q.y - s.y) > 1e-4; });
}
/** ángulo cada 15° desde el punto anterior (como el rastreo polar): el punto q, girado al múltiplo de 15° más cercano */
export function polar15(desde: Punto, q: Punto, paso = 15): Punto {
  const dx = q.x - desde.x, dy = q.y - desde.y, L = Math.hypot(dx, dy);
  if (L < 1e-9) return q;
  const t = Math.round(Math.atan2(dy, dx) / ((paso * Math.PI) / 180)) * ((paso * Math.PI) / 180);
  return { x: r4(desde.x + L * Math.cos(t)), y: r4(desde.y + L * Math.sin(t)) };
}
