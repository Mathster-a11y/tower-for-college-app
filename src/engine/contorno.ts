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
/**
 * esquina sustraída (retranqueada): saca de la esquina i un rectángulo de a sobre el lado de llegada y b sobre el de
 * salida; la esquina saliente queda como dos esquinas salientes y una entrante.
 */
export function sustraerEsquina(vs: Anillo, i: number, a: number, b = a): Anillo | { error: string } {
  const n = vs.length, ia = (i - 1 + n) % n, P = vs[i], A = vs[ia], B = vs[(i + 1) % n];
  if (!recto(vs, ia) || !recto(vs, i)) return { error: 'La esquina sustraída va entre dos lados rectos.' };
  const Lu = Math.hypot(A.x - P.x, A.y - P.y), Lw = Math.hypot(B.x - P.x, B.y - P.y);
  if (!(a > 0) || !(b > 0)) return { error: 'Las medidas tienen que ser mayores que cero.' };
  if (a >= Lu - 1e-6 || b >= Lw - 1e-6) return { error: 'La sustracción es más larga que el lado.' };
  const u = { x: (A.x - P.x) / Lu, y: (A.y - P.y) / Lu }, w = { x: (B.x - P.x) / Lw, y: (B.y - P.y) / Lw };
  const p1 = { x: P.x + u.x * a, y: P.y + u.y * a }, p2 = { x: P.x + w.x * b, y: P.y + w.y * b };
  const q = { x: p1.x + w.x * b, y: p1.y + w.y * b };
  const out = vs.map(v => ({ ...v }));
  out.splice(i, 1, p1, q, p2);
  return quitarRepetidos(out.map(limpio));
}

export type TipoEsquina = 'redondeada' | 'chaflan' | 'sustraida';
/** las esquinas salientes (convexas, de más de 5° de quiebre) entre dos lados rectos */
export function esquinasSalientes(vs: Anillo): number[] {
  const n = vs.length, s = Math.sign(areaConSigno(vs)) || 1, out: number[] = [];
  for (let i = 0; i < n; i++) {
    const ia = (i - 1 + n) % n, A = vs[ia], P = vs[i], B = vs[(i + 1) % n];
    if (!recto(vs, ia) || !recto(vs, i)) continue;
    const ux = P.x - A.x, uy = P.y - A.y, wx = B.x - P.x, wy = B.y - P.y, l = Math.hypot(ux, uy) * Math.hypot(wx, wy);
    if (!(l > 0)) continue;
    if (((ux * wy - uy * wx) / l) * s > Math.sin((5 * Math.PI) / 180)) out.push(i);
  }
  return out;
}
/**
 * trata de una vez las esquinas salientes del contorno (o las de «cuales»): redondeadas con radio a, en chaflán a
 * la distancia a, o sustraídas a × b. Las esquinas entrantes y las que tocan un arco quedan como están.
 */
export function tratarEsquinas(vs: Anillo, tipo: TipoEsquina, a: number, b = a, cuales?: number[]): Anillo | { error: string } {
  const todas = esquinasSalientes(vs), ids = (cuales ? todas.filter(i => cuales.includes(i)) : todas).sort((x, y) => y - x);
  if (!ids.length) return { error: 'El contorno no tiene esquinas salientes entre lados rectos.' };
  let out: Anillo = vs.map(v => ({ ...v }));
  // de la última a la primera: tratar una esquina solo cambia los índices de las que vienen después
  for (const i of ids) {
    const r = tipo === 'redondeada' ? empalme(out, i, a) : tipo === 'chaflan' ? chaflan(out, i, a, a) : sustraerEsquina(out, i, a, b);
    if ('error' in r) return { error: `Esquina ${i + 1}: ${r.error}` };
    out = r;
  }
  return out;
}

/**
 * curva suave que pasa por los vértices (Catmull-Rom llevada a Bézier cúbicas): cada lado recto pasa a ser una Bézier
 * tangente a las vecinas; los arcos y las Bézier que ya había quedan. «tension» 1 es la curva clásica; menos, más tensa.
 */
export function suavizarAnillo(vs: Anillo, tension = 1): Anillo {
  const n = vs.length, k = tension / 6;
  return vs.map((a, i) => {
    if (!recto(vs, i)) return { ...a };
    const p0 = vs[(i - 1 + n) % n], p2 = vs[(i + 1) % n], p3 = vs[(i + 2) % n];
    return limpio({ x: a.x, y: a.y, c1: { x: a.x + (p2.x - p0.x) * k, y: a.y + (p2.y - p0.y) * k }, c2: { x: p2.x - (p3.x - a.x) * k, y: p2.y - (p3.y - a.y) * k } });
  });
}
/** todos los lados rectos (saca arcos y Bézier; quedan los vértices) */
export const enderezarAnillo = (vs: Anillo): Anillo => vs.map(a => limpio({ x: a.x, y: a.y }));

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

/**
 * geometría del arco del lado i (con bulge): centro, radio, punto medio de la cuerda M, normal izquierda n (de a→b) y d,
 * la distancia con signo del centro a la cuerda sobre la mediatriz (centro = M + d·n). null si el lado es recto.
 */
export function geometriaArco(vs: Anillo, i: number): { cx: number; cy: number; r: number; d: number; mx: number; my: number; nx: number; ny: number; c: number; mayor: boolean; flecha: number } | null {
  const a = vs[i], b = vs[(i + 1) % vs.length], bu = a.b ?? 0;
  const dx = b.x - a.x, dy = b.y - a.y, c = Math.hypot(dx, dy);
  if (Math.abs(bu) < 1e-12 || c < 1e-12) return null;
  const th = 4 * Math.atan(bu), d = c / 2 / Math.tan(th / 2);
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, nx = -dy / c, ny = dx / c;
  const r = Math.hypot(c / 2, d);
  // flecha: del medio de la cuerda al arco (r − d del lado de la panza)
  return { cx: mx + nx * d, cy: my + ny * d, r, d, mx, my, nx, ny, c, mayor: Math.abs(th) > Math.PI + 1e-12, flecha: r + (bu > 0 ? d : -d) };
}
/** bulge del arco de cuerda c con el centro a la distancia d (sobre la mediatriz) y la panza del lado «signo» (el del bulge) */
export function bulgeConCentro(c: number, d: number, signo: number): number {
  const th = signo >= 0 ? 2 * Math.atan2(c / 2, d) : -2 * Math.atan2(c / 2, -d);
  return Math.tan(th / 4);
}
/** el arco del lado i con el centro a la distancia d de la cuerda (sobre la mediatriz): los extremos no se mueven */
export function arcoConCentro(vs: Anillo, i: number, d: number): Anillo {
  const a = vs[i], b = vs[(i + 1) % vs.length], c = Math.hypot(b.x - a.x, b.y - a.y);
  const sg = a.b ? Math.sign(a.b) : Math.sign(areaConSigno(vs)) || 1;
  const out = vs.map(q => ({ ...q }));
  out[i] = { x: a.x, y: a.y, b: bulgeConCentro(c, d, sg) };
  return out.map(limpio);
}
/** el arco del lado i con radio R, sin cambiar los extremos ni de qué lado de la cuerda queda el centro (arco menor o mayor) */
export function arcoConRadioMismoLado(vs: Anillo, i: number, R: number): Anillo | { error: string } {
  const g = geometriaArco(vs, i);
  if (!g) return arcoConRadio(vs, i, R);
  if (R < g.c / 2 - 1e-9) return { error: `El radio tiene que ser al menos la mitad de la cuerda (${(g.c / 2).toFixed(3).replace('.', ',')} m).` };
  const dd = Math.sqrt(Math.max(0, R * R - (g.c / 2) ** 2));
  return arcoConCentro(vs, i, (g.d < 0 ? -1 : 1) * dd);
}
/** arco menor ↔ mayor: el mismo radio, con el centro del otro lado de la cuerda */
export function arcoComplementario(vs: Anillo, i: number): Anillo {
  const g = geometriaArco(vs, i);
  return g ? arcoConCentro(vs, i, -g.d) : vs;
}
/** la panza del arco del otro lado de la cuerda (el mismo radio, en espejo) */
export function invertirArco(vs: Anillo, i: number): Anillo {
  return vs.map((q, j) => (j === i && q.b ? { ...q, b: -q.b } : { ...q })).map(limpio);
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

// ------------------------------------------------------------------ patrón polar
export interface OpcionesPolar {
  /** cuántas copias alrededor del centro */
  n: number;
  /** ancho de cada una sobre el borde (m, la cuerda) */
  ancho: number;
  /** profundidad del entrante o vuelo del saliente (m, en la dirección del radio) */
  prof: number;
  /** triángulo (en V, con la punta en el radio) o rectángulo (en U) */
  forma: 'triangulo' | 'rectangulo';
  /** entrante (un pozo de luz, una muesca) o saliente (un balcón, una aleta) */
  tipo: 'entrante' | 'saliente';
  /** ángulo de la primera copia (°, antihorario desde +x) */
  angulo0: number;
}
/**
 * Patrón polar: un entrante o un saliente repetido n veces alrededor del centro del contorno, parejos (como los pozos de
 * luz del Gherkin o los balcones de una torre redonda). El contorno tiene que verse entero desde su centro (un círculo,
 * un polígono, una elipse, casi cualquier planta de torre). Si es un círculo, los tramos entre copias quedan como arcos
 * exactos; si no, las curvas pasan a tramos rectos finos.
 */
export function patronPolar(vs: Anillo, op: OpcionesPolar): Anillo | { error: string } {
  const n = Math.round(op.n);
  if (!(n >= 1 && n <= 72)) return { error: 'La cantidad de copias tiene que ir de 1 a 72.' };
  if (!(op.ancho > 0) || !(op.prof > 0)) return { error: 'El ancho y la profundidad (o el vuelo) tienen que ser mayores que cero.' };
  let ps = polilinea(vs, 2, 48);
  if (ps.length < 3) return { error: 'El contorno necesita por lo menos tres vértices.' };
  let A = 0, cx = 0, cy = 0;
  ps.forEach((a, i) => { const b = ps[(i + 1) % ps.length], cr = a.x * b.y - b.x * a.y; A += cr / 2; cx += ((a.x + b.x) * cr) / 6; cy += ((a.y + b.y) * cr) / 6; });
  if (Math.abs(A) < 1e-9) return { error: 'El contorno no tiene área.' };
  cx /= A; cy /= A;
  if (A < 0) ps = [...ps].reverse();
  // ¿se ve entero desde el centro? (los ángulos crecen siempre)
  const ang = (p: Punto) => Math.atan2(p.y - cy, p.x - cx);
  let giro = 0;
  for (let i = 0; i < ps.length; i++) {
    let d = ang(ps[(i + 1) % ps.length]) - ang(ps[i]);
    if (d <= -Math.PI) d += 2 * Math.PI; else if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -1e-9) return { error: 'El contorno tiene que verse entero desde su centro (sin entrantes que se den vuelta) para repetir en polar.' };
    giro += d;
  }
  if (Math.abs(giro - 2 * Math.PI) > 1e-6) return { error: 'El contorno tiene que rodear su centro.' };
  // el borde en la dirección θ: dónde corta el rayo desde el centro
  const borde = (t: number): Punto => {
    const ux = Math.cos(t), uy = Math.sin(t);
    let mejor: Punto | null = null, dm = Infinity;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i], b = ps[(i + 1) % ps.length], ex = b.x - a.x, ey = b.y - a.y, den = ux * ey - uy * ex;
      if (Math.abs(den) < 1e-14) continue;
      const s = ((a.x - cx) * ey - (a.y - cy) * ex) / den, u = ((a.x - cx) * uy - (a.y - cy) * ux) / den;
      if (s > 0 && u >= -1e-9 && u <= 1 + 1e-9 && s < dm) { dm = s; mejor = { x: cx + ux * s, y: cy + uy * s }; }
    }
    return mejor ?? { x: cx, y: cy };
  };
  const radio = (t: number) => { const q = borde(t); return Math.hypot(q.x - cx, q.y - cy); };
  const g = Math.PI / 180, dos = 2 * Math.PI, norm = (t: number) => ((t % dos) + dos) % dos;
  // los ángulos de las copias, crecientes (sin volver a 0: la siguiente de la última es la primera más una vuelta)
  const fi = Array.from({ length: n }, (_, k) => (op.angulo0 + (360 * k) / n) * g);
  // medio ángulo de cada copia: el que deja los dos puntos del borde a la distancia «ancho» (bisección; en un círculo es la cuerda)
  const de = fi.map(f => {
    const cuerda = (d: number) => { const p = borde(f - d), q = borde(f + d); return Math.hypot(p.x - q.x, p.y - q.y); };
    if (cuerda(Math.PI / 2 - 1e-6) < op.ancho) return NaN;
    let lo = 0, hi = Math.PI / 2 - 1e-6;
    for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (cuerda(m) < op.ancho) lo = m; else hi = m; }
    return (lo + hi) / 2;
  });
  if (de.some(x => !Number.isFinite(x))) return { error: 'El ancho es más grande que la planta.' };
  if (de.some((d, k) => 2 * d >= dos / n - 1e-6 || (op.tipo === 'entrante' && op.prof >= radio(fi[k]) - 1e-3))) return { error: op.tipo === 'entrante' ? 'Las copias se pisan o el entrante llega al centro: probá con menos copias, menos ancho o menos profundidad.' : 'Las copias se pisan: probá con menos copias o menos ancho.' };
  const circular = ps.every(q => Math.abs(Math.hypot(q.x - cx, q.y - cy) / radio(0) - 1) < 1e-3);
  const R = radio(0), s = op.tipo === 'entrante' ? -1 : 1;
  const out: VerticePerfil[] = [];
  for (let k = 0; k < n; k++) {
    const f = fi[k], d = de[k], u = { x: Math.cos(f), y: Math.sin(f) };
    const a = borde(f - d), b = borde(f + d);
    // la copia: del borde en f − δ hacia adentro (o afuera) y de vuelta al borde en f + δ
    out.push({ x: a.x, y: a.y });
    if (op.forma === 'triangulo') { const r = radio(f) + s * op.prof; out.push({ x: cx + u.x * r, y: cy + u.y * r }); }
    else out.push({ x: a.x + s * u.x * op.prof, y: a.y + s * u.y * op.prof }, { x: b.x + s * u.x * op.prof, y: b.y + s * u.y * op.prof });
    // hasta la copia siguiente: un arco exacto (círculo) o el contorno original entre las dos
    const t0 = f + d, t1 = (k + 1 < n ? fi[k + 1] : fi[0] + dos) - de[(k + 1) % n];
    const span = t1 - t0;
    if (circular) { out.push({ x: cx + R * Math.cos(t0), y: cy + R * Math.sin(t0), b: Math.tan(span / 4) }); continue; }
    out.push({ x: b.x, y: b.y });
    ps.map(q => ({ q, t: norm(ang(q) - t0) })).filter(x => x.t > 1e-9 && x.t < span - 1e-9).sort((x, y) => x.t - y.t).forEach(x => out.push({ x: x.q.x, y: x.q.y }));
  }
  return out.map(limpio);
}
