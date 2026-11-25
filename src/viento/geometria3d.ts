/**
 * Túnel de viento 3D (etapa V3 de docs/plan_viento.html): la torre del proyecto en celdas, con el viento hacia +x de
 * la red. Cada altura toma la silueta del nivel que la cubre (los retiros y los cambios de planta se ven), el suelo
 * es la fila z = 0 y la entrada lleva el perfil de velocidad del CIRSOC 102-25 (u ∝ √Kz, con el Kz del método).
 * Didáctico: no dimensiona.
 */
import { Kz, EXPOSICIONES, CP_BARLOVENTO, CP_LATERAL, cpSotavento, type Exposicion } from '../engine/cargas/cirsoc102';

export interface P { x: number; y: number }
/**
 * continua: la fachada sigue sin escalón de este nivel al de arriba (carpintería «continua» del proyecto). Con
 * alturaExacta, el túnel interpola la planta entre los dos niveles (la piel inclinada o curva) en vez de levantar un
 * prisma por piso. Vacío = continua.
 */
export interface NivelPlanta { cota: number; silueta: P[]; continua?: boolean }

export interface OpcionesGeo3 {
  /** niveles sobre PB (cota sobre PB, m) con su silueta en planta (m), en cualquier orden */
  niveles: NivelPlanta[];
  dir: 'A' | 'B'; angulo?: number;
  /** grilla: celdas en x, y, z */
  nx: number; ny: number; nz: number;
  /** alto del dominio en múltiplos de la altura de la torre (1,5 por defecto) */
  altoRel?: number;
  /**
   * contexto urbano: los edificios vecinos (contorno en planta, m, en las coordenadas del proyecto, y altura sobre PB),
   * como prismas. La fuerza y el Cp siguen siendo solo de la torre
   */
  /** vecinos: prismas de «desde» (0 si falta) a «altura» (m sobre PB); un edificio con retiros va en varios */
  contexto?: { pol: P[]; altura: number; desde?: number }[] | null;
  /**
   * banda de pisos: solo la franja de z0 a z1 (m sobre PB), sin suelo, con planos deslizantes arriba y abajo (como una
   * rebanada de una torre muy alta: el aire no puede subir ni bajar por los bordes). La torre va de borde a borde y el
   * viento llega parejo (el de la altura de la banda). Con todas las celdas en la franja, cada piso tiene muchas más
   * celdas que en la torre entera. Sin contexto.
   */
  banda?: { z0: number; z1: number } | null;
  /**
   * paredes exactas también en altura: entre dos niveles con la fachada continua, la planta de cada altura se interpola
   * (la piel queda inclinada o curva, como la capa «Fachada» del 3D) y el rebote sabe dónde corta la pared inclinada.
   * Sin esto (o donde la fachada no sigue), cada piso es un prisma con la planta de su nivel (escalones de un piso).
   */
  alturaExacta?: boolean;
}

export interface Geometria3D {
  nx: number; ny: number; nz: number; solido: Uint8Array;
  /** celdas por metro, altura de la torre (m) y en celdas */
  escala: number; H: number; hC: number;
  /** ancho transversal al viento y largo en el sentido del viento (m), en el nivel más ancho */
  B: number; L: number;
  /** caja de la torre en la red (para la cámara y las caras) */
  caja: { x0: number; x1: number; y0: number; y1: number };
  /** celdas sólidas de la torre (sin el suelo) */
  celdas: number;
  /** paredes exactas: para cada celda de aire pegada a un sólido, dónde corta la pared cada uno de sus 19 enlaces */
  paredes: Paredes3D;
  /**
   * la torre como tramos de planta (para dibujarla con su contorno real, no en escalones): de h0 a h1 (m sobre PB),
   * con el contorno en coordenadas de la red (x, y)
   */
  tramos: Tramo3D[];
  /** con contexto: las celdas sólidas de la torre (las caras y el Cp son solo de ella) y los vecinos en la red */
  cuerpo?: Uint8Array;
  vecinos: { pol: P[]; altura: number; desde: number }[];
  /** de la planta del proyecto (m) a la red: girar con (co, si) y llevar con la escala y el origen (ox, oy) */
  giro: { co: number; si: number; ox: number; oy: number };
  /** banda de pisos (m sobre PB): la red va de z0 (z = 0) a z1 (z = nz), sin suelo; H es su alto */
  banda?: { z0: number; z1: number };
}
/**
 * un tramo de la torre de h0 a h1 (m sobre la base de la red): un prisma con la planta pol, o, si tiene polArriba, la
 * piel reglada que va de pol (en h0) a polArriba (en h1), punto a punto (los dos con los mismos puntos)
 */
export interface Tramo3D { h0: number; h1: number; pol: P[]; polArriba?: P[] }

/** puntos que se toman de cada planta para interpolar en altura (alcanza para la grilla más fina del túnel) */
const PUNTOS_LOFT = 128;
/** la piel se interpola si la planta corre menos de 3 veces la altura del piso (más que eso es un retiro o un basamento) */
export const CORRIMIENTO_MAX = 3;
const areaPol = (p: P[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
/** los vértices de una planta en sentido antihorario, sin repetidos ni los que están en medio de un lado recto */
function vertices(p0: P[]): P[] {
  const p = (areaPol(p0) >= 0 ? p0 : [...p0].reverse()).filter((q, i, arr) => { const r = arr[(i + 1) % arr.length]; return Math.hypot(q.x - r.x, q.y - r.y) > 1e-9; });
  return p.filter((q, i) => {
    const a = p[(i + p.length - 1) % p.length], c = p[(i + 1) % p.length];
    const cruz = (q.x - a.x) * (c.y - q.y) - (q.y - a.y) * (c.x - q.x), l = Math.hypot(q.x - a.x, q.y - a.y) * Math.hypot(c.x - q.x, c.y - q.y);
    return l > 0 && Math.abs(cruz) / l > 1e-6;
  });
}
/** n puntos repartidos por largo de arco, en sentido antihorario, desde el primer vértice */
function remuestrear(p0: P[], n: number): P[] {
  const p = areaPol(p0) >= 0 ? p0 : [...p0].reverse();
  const largos = p.map((a, i) => { const b = p[(i + 1) % p.length]; return Math.hypot(b.x - a.x, b.y - a.y); });
  const total = largos.reduce((s, l) => s + l, 0);
  const out: P[] = [];
  let i = 0, acum = 0;
  for (let k = 0; k < n; k++) {
    const d = (k * total) / n;
    while (i < p.length - 1 && acum + largos[i] < d) { acum += largos[i]; i++; }
    const a = p[i], b = p[(i + 1) % p.length], t = largos[i] > 0 ? (d - acum) / largos[i] : 0;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}
/**
 * las dos plantas de un tramo con los mismos puntos y la costura alineada (el punto k de abajo va con el k de arriba,
 * como el loft de las losas): se elige el corrimiento de la costura que deja la piel menos torcida. Devuelve también
 * cuánto se corre la planta (el mayor desplazamiento de un punto).
 */
export function alinearPlantas(a0: P[], b0: P[], n = PUNTOS_LOFT): { a: P[]; b: P[]; corre: number } {
  // con los mismos lados (torre ahusada, corona cortada por un plano, la misma forma escalada): esquina con esquina, cada
  // lado con los mismos puntos en las dos plantas (así las esquinas no se redondean ni la piel se retuerce)
  const va = vertices(a0), vb = vertices(b0);
  if (va.length === vb.length && va.length >= 3) {
    const m = va.length;
    let mejor = 0, min = Infinity;
    for (let s = 0; s < m; s++) { let suma = 0; for (let i = 0; i < m; i++) { const q = vb[(i + s) % m]; suma += (va[i].x - q.x) ** 2 + (va[i].y - q.y) ** 2; } if (suma < min) { min = suma; mejor = s; } }
    const vb2 = va.map((_, i) => vb[(i + mejor) % m]);
    const largo = (p: P[], i: number) => Math.hypot(p[(i + 1) % m].x - p[i].x, p[(i + 1) % m].y - p[i].y);
    const L = va.map((_, i) => Math.max(largo(va, i), largo(vb2, i))), total = L.reduce((x, y) => x + y, 0) || 1;
    const a: P[] = [], b: P[] = [];
    for (let i = 0; i < m; i++) {
      const k = Math.max(1, Math.round((n * L[i]) / total)), j = (i + 1) % m;
      for (let t = 0; t < k; t++) {
        const u = t / k;
        a.push({ x: va[i].x + (va[j].x - va[i].x) * u, y: va[i].y + (va[j].y - va[i].y) * u });
        b.push({ x: vb2[i].x + (vb2[j].x - vb2[i].x) * u, y: vb2[i].y + (vb2[j].y - vb2[i].y) * u });
      }
    }
    const corre = a.reduce((mx, q, i) => Math.max(mx, Math.hypot(q.x - b[i].x, q.y - b[i].y)), 0);
    return { a, b, corre };
  }
  const a = remuestrear(a0, n), b = remuestrear(b0, n);
  let mejor = 0, min = Infinity;
  for (let s = 0; s < n; s++) {
    let suma = 0;
    for (let i = 0; i < n && suma < min; i++) { const q = b[(i + s) % n]; suma += (a[i].x - q.x) ** 2 + (a[i].y - q.y) ** 2; }
    if (suma < min) { min = suma; mejor = s; }
  }
  const bb = a.map((_, i) => b[(i + mejor) % n]);
  const corre = a.reduce((m, q, i) => Math.max(m, Math.hypot(q.x - bb[i].x, q.y - bb[i].y)), 0);
  return { a, b: bb, corre };
}
/** ¿está (x, y) adentro de la planta interpolada entre a (t = 0) y b (t = 1)? (sin armar la planta) */
function dentroInterp(a: P[], b: P[], t: number, x: number, y: number): boolean {
  let s = false;
  const n = a.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pix = a[i].x + (b[i].x - a[i].x) * t, piy = a[i].y + (b[i].y - a[i].y) * t;
    const pjx = a[j].x + (b[j].x - a[j].x) * t, pjy = a[j].y + (b[j].y - a[j].y) * t;
    if ((piy > y) !== (pjy > y) && x < ((pjx - pix) * (y - piy)) / (pjy - piy) + pix) s = !s;
  }
  return s;
}
/**
 * la torre en altura: qué planta rige a cada altura h (en las unidades de las cotas). Con la fachada continua entre dos
 * niveles, la interpolada; si no, la del nivel de abajo (un prisma por piso, como antes).
 */
interface Torre3D {
  /** la planta a la altura h (un arreglo nuevo en los tramos interpolados; el mismo objeto en los prismas) */
  plantaEn(h: number): P[];
  /** ¿la altura h está adentro de la torre en (x, y)? */
  dentroEn(h: number, x: number, y: number): boolean;
  /** suave[k]: del nivel k al k + 1 la piel se interpola */
  suave: boolean[];
  secs: ({ a: P[]; b: P[] } | null)[];
}
function torreEnAltura(pols: { cota: number; pol: P[]; continua?: boolean }[], escala: number, alturaExacta: boolean): Torre3D {
  const n = pols.length;
  const secs = pols.map((q, k) => {
    if (!alturaExacta || k + 1 >= n || q.continua === false) return null;
    const dz = (pols[k + 1].cota - q.cota) * escala;
    if (!(dz > 0)) return null;
    const al = alinearPlantas(q.pol, pols[k + 1].pol);
    // la misma planta arriba y abajo: un prisma (más simple y exacto); un corrimiento muy grande: un retiro, con escalón
    if (al.corre < 1e-6 || al.corre > CORRIMIENTO_MAX * dz) return null;
    return { a: al.a, b: al.b };
  });
  const indice = (h: number) => { let k = 0; while (k + 1 < n && pols[k + 1].cota <= h + 1e-9) k++; return k; };
  const tDe = (k: number, h: number) => Math.min(1, Math.max(0, (h - pols[k].cota) / (pols[k + 1].cota - pols[k].cota)));
  return {
    suave: secs.map(x => !!x), secs,
    plantaEn(h) {
      const k = indice(h), sc = secs[k];
      if (!sc) return pols[k].pol;
      const t = tDe(k, h);
      return sc.a.map((q, i) => ({ x: q.x + (sc.b[i].x - q.x) * t, y: q.y + (sc.b[i].y - q.y) * t }));
    },
    dentroEn(h, x, y) {
      const k = indice(h), sc = secs[k];
      return sc ? dentroInterp(sc.a, sc.b, tDe(k, h), x, y) : dentro(pols[k].pol, x, y);
    },
  };
}
/**
 * el corte de la pared en un enlace que sube o baja por una piel inclinada: se busca a lo largo del enlace, de la celda
 * de aire (a) a la sólida (b), dónde se entra a la torre (bisección; 10 pasos dan 1/1024 del enlace). zRedAAltura pasa
 * de la z de la red a la altura. Null si las puntas no son aire y torre (por ejemplo, un vecino).
 */
function corteInclinado(t: Torre3D, zRedAAltura: (z: number) => number, hMax: number) {
  const en = (x: number, y: number, z: number) => { const h = zRedAAltura(z); return h >= 0 && h <= hMax && t.dentroEn(h, x, y); };
  return (ax: number, ay: number, az: number, bx: number, by: number, bz: number): number | null => {
    if (en(ax, ay, az) || !en(bx, by, bz)) return null;
    let lo = 0, hi = 1;
    for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (en(ax + (bx - ax) * m, ay + (by - ay) * m, az + (bz - az) * m)) hi = m; else lo = m; }
    return (lo + hi) / 2;
  };
}

/** un punto de la red (x, y en celdas; los centros en +0,5) a la planta del proyecto (m) */
export function aPlantaProyecto(g: Geometria3D, x: number, y: number): P {
  const { co, si, ox, oy } = g.giro, rx = (x - ox) / g.escala, ry = (y - oy) / g.escala;
  return { x: rx * co + ry * si, y: -rx * si + ry * co };
}
/** un punto de la planta del proyecto (m) a la red (celdas) */
export function aRed(g: Geometria3D, p: P): P {
  const { co, si, ox, oy } = g.giro;
  return { x: ox + (p.x * co - p.y * si) * g.escala, y: oy + (p.x * si + p.y * co) * g.escala };
}

/**
 * paredes exactas del 3D (rebote interpolado): las celdas de aire que tienen algún enlace con un sólido y, por cada
 * una, 19 bytes con q (dónde corta la pared el enlace que llega desde c − e_i, en 255avos del camino; 0 = no hay
 * pared en esa dirección). Compacto: la placa de video solo guarda estas celdas, no 19 números por celda.
 */
export interface Paredes3D { celdas: Int32Array; q: Uint8Array }

// las 19 direcciones de D3Q19 (las mismas que lbm3d)
const EXd = [0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0];
const EYd = [0, 0, 0, 1, -1, 0, 0, 1, -1, -1, 1, 0, 0, 0, 0, 1, -1, 1, -1];
const EZd = [0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1, -1, -1, 1, 1, -1, -1, 1];

/** primer corte (fracción de a a b) del segmento a→b, en planta, con el contorno p */
function corteEnPlanta(p: P[], ax: number, ay: number, bx: number, by: number): number | null {
  let mejor: number | null = null;
  const rx = bx - ax, ry = by - ay;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const c = p[j], d = p[i], sx = d.x - c.x, sy = d.y - c.y, den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-14) continue;
    const t = ((c.x - ax) * sy - (c.y - ay) * sx) / den, u = ((c.x - ax) * ry - (c.y - ay) * rx) / den;
    if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && (mejor === null || t < mejor)) mejor = t;
  }
  return mejor;
}

/**
 * q de los enlaces aire → sólido. Contra una fachada (el enlace cruza el contorno de su piso): el corte exacto en
 * planta. Contra una losa de arriba de un retiro o la azotea (enlace vertical): la cota del nivel. Contra el suelo: a
 * mitad de camino (el suelo está justo entre celdas). Si no se puede decir con certeza, a mitad de camino.
 * capa[z]: el contorno (en celdas) que rige en la altura z, o null; planos: las alturas (en coordenadas de la red) donde
 * cambia la planta.
 */
export function paredes3D(nx: number, ny: number, nz: number, solido: Uint8Array, capa: (P[] | null)[], planos: number[], conSuelo = true,
  /** la piel inclinada (paredes exactas en altura): el corte de un enlace que sube o baja, en coordenadas de la red */
  corte?: (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => number | null): Paredes3D {
  const celdas: number[] = [], qs: number[] = [];
  const sol = (x: number, y: number, z: number) => z >= 0 && z < nz && x >= 0 && x < nx && solido[(z * ny + ((y + ny) % ny)) * nx + x] === 1;
  for (let z = conSuelo ? 1 : 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const c = (z * ny + y) * nx + x;
    if (solido[c]) continue;
    let tiene = false;
    const fila = new Array<number>(19).fill(0);
    for (let i = 1; i < 19; i++) {
      const sx = x - EXd[i], sy = y - EYd[i], sz = z - EZd[i];
      if (!sol(sx, sy, sz)) continue;
      tiene = true;
      let q = 0.5;
      if (conSuelo && sz === 0) q = 0.5;                                       // el suelo, entre celdas
      else if (EXd[i] === 0 && EYd[i] === 0) {
        // vertical: la losa del retiro o la azotea está en un plano de cambio de planta entre las dos celdas
        const z0 = Math.min(z, sz) + 0.5, z1 = Math.max(z, sz) + 0.5;
        const pl = planos.find(h => h > z0 - 1e-9 && h < z1 + 1e-9);
        if (pl !== undefined) q = Math.abs(z + 0.5 - pl);
        else if (corte) q = corte(x + 0.5, y + 0.5, z + 0.5, sx + 0.5, sy + 0.5, sz + 0.5) ?? 0.5;
      } else {
        // con componente horizontal: si las dos alturas tienen la misma planta, la pared es vertical y el corte
        // en planta da la fracción del enlace
        const p0 = capa[z], p1 = capa[sz];
        if (p0 && p0 === p1) { const t = corteEnPlanta(p0, x + 0.5, y + 0.5, sx + 0.5, sy + 0.5); if (t !== null) q = t; }
        // de una altura a otra por una piel inclinada (las dos alturas tienen plantas distintas)
        else if (corte) q = corte(x + 0.5, y + 0.5, z + 0.5, sx + 0.5, sy + 0.5, sz + 0.5) ?? 0.5;
      }
      fila[i] = Math.max(1, Math.min(255, Math.round(Math.min(1, Math.max(1e-3, q)) * 255)));
    }
    if (tiene) { celdas.push(c); qs.push(...fila); }
  }
  return { celdas: Int32Array.from(celdas), q: Uint8Array.from(qs) };
}

function dentro(p: P[], x: number, y: number): boolean {
  let s = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) s = !s;
  }
  return s;
}

export function geometria3D(o: OpcionesGeo3): Geometria3D {
  if (o.banda) return geometriaBanda(o, o.banda);
  const { nx, ny, nz } = o;
  const niv = o.niveles.filter(n => n.cota >= 0 && n.silueta.length >= 3).sort((a, b) => a.cota - b.cota);
  if (!niv.length) throw new Error('No hay niveles con planta sobre PB.');
  const H = niv[niv.length - 1].cota;
  if (!(H > 0)) throw new Error('No hay niveles con planta sobre PB.');
  // giro: el viento pasa a +x (viento A sopla hacia +y: −90°; viento B, hacia +x: 0°), más el giro extra
  const th = ((o.dir === 'A' ? -90 : 0) - (o.angulo ?? 0)) * (Math.PI / 180), co = Math.cos(th), si = Math.sin(th);
  const rot = niv.map(n => ({ cota: n.cota, continua: n.continua, pol: n.silueta.map(q => ({ x: q.x * co - q.y * si, y: q.x * si + q.y * co })) }));
  const todos = rot.flatMap(n => n.pol);
  const xMin = Math.min(...todos.map(q => q.x)), xMax = Math.max(...todos.map(q => q.x));
  const yMin = Math.min(...todos.map(q => q.y)), yMax = Math.max(...todos.map(q => q.y));
  const B = yMax - yMin, L = xMax - xMin;
  // el contexto, girado igual; el grupo entero (torre + vecinos) tiene que entrar en el dominio
  const ctx = (o.contexto ?? []).filter(c => c.pol.length >= 3 && c.altura > (c.desde ?? 0)).map(c => ({ desde: c.desde ?? 0, altura: c.altura, pol: c.pol.map(q => ({ x: q.x * co - q.y * si, y: q.x * si + q.y * co })) }));
  const gx = [xMin, xMax, ...ctx.flatMap(c => c.pol.map(q => q.x))], gy = [yMin, yMax, ...ctx.flatMap(c => c.pol.map(q => q.y))];
  const gx0 = Math.min(...gx), gx1 = Math.max(...gx), gy0 = Math.min(...gy), gy1 = Math.max(...gy);
  const Hmax = Math.max(H, ...ctx.map(c => c.altura));
  // escala: la torre ocupa 1/altoRel del alto; y entra con lugar en x (4 L delante como mínimo) y en y (1,5 B a cada lado)
  const altoRel = o.altoRel ?? 1.5;
  let escala = Math.min((nz - 1) / (altoRel * H), (nx * 0.55) / (L + 3 * B), (ny * 0.6) / B);
  // la torre a un cuarto del largo (más lugar para la estela), centrada en y
  let ox = Math.round(nx * 0.25) - xMin * escala, oy = (ny - B * escala) / 2 - yMin * escala;
  if (ctx.length) {
    // con contexto: que entre el grupo (desde el 15 % del largo, con estela detrás, y centrado a lo ancho) y el más alto
    escala = Math.min(escala, (nz - 1) / (1.3 * Hmax), (nx * 0.7) / (gx1 - gx0), (ny * 0.82) / (gy1 - gy0));
    ox = Math.round(nx * 0.15) - gx0 * escala; oy = (ny - (gy1 - gy0) * escala) / 2 - gy0 * escala;
  }
  const hC = Math.max(1, Math.round(H * escala));
  const pols = rot.map(n => ({ cota: n.cota, continua: n.continua, pol: n.pol.map(q => ({ x: ox + q.x * escala, y: oy + q.y * escala })) }));
  const torre = torreEnAltura(pols, escala, !!o.alturaExacta);
  const solido = new Uint8Array(nx * ny * nz);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) solido[y * nx + x] = 1;      // suelo
  let celdas = 0;
  const caja = { x0: nx, x1: 0, y0: ny, y1: 0 };
  const capa: (P[] | null)[] = new Array(nz).fill(null);
  for (let z = 1; z < nz; z++) {
    const h = (z - 0.5) / escala;                                            // altura del centro de la celda (m)
    if (h > H) break;
    // cada piso con la planta de su nivel (como se dibuja: «Planta: PB» es el piso de PB a 1º); debajo del primer nivel,
    // la del primero. Con la fachada continua y paredes exactas en altura, la planta interpolada a esa altura.
    const n = { pol: torre.plantaEn(h) };
    capa[z] = n.pol;
    const bx0 = Math.max(0, Math.floor(Math.min(...n.pol.map(q => q.x)))), bx1 = Math.min(nx - 1, Math.ceil(Math.max(...n.pol.map(q => q.x))));
    const by0 = Math.max(0, Math.floor(Math.min(...n.pol.map(q => q.y)))), by1 = Math.min(ny - 1, Math.ceil(Math.max(...n.pol.map(q => q.y))));
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      if (!dentro(n.pol, x + 0.5, y + 0.5)) continue;
      solido[(z * ny + y) * nx + x] = 1; celdas++;
      caja.x0 = Math.min(caja.x0, x); caja.x1 = Math.max(caja.x1, x); caja.y0 = Math.min(caja.y0, y); caja.y1 = Math.max(caja.y1, y);
    }
  }
  // los vecinos: prismas desde el suelo (después de la torre: no cuentan en su caja ni en sus celdas)
  let cuerpo: Uint8Array | undefined;
  const vecinos = ctx.map(c => ({ desde: c.desde, altura: c.altura, pol: c.pol.map(q => ({ x: ox + q.x * escala, y: oy + q.y * escala })) }));
  if (vecinos.length) {
    cuerpo = solido.slice(); for (let k = 0; k < nx * ny; k++) cuerpo[k] = 0;        // sin el suelo
    for (const v of vecinos) {
      const bx0 = Math.max(0, Math.floor(Math.min(...v.pol.map(q => q.x)))), bx1 = Math.min(nx - 1, Math.ceil(Math.max(...v.pol.map(q => q.x))));
      const by0 = Math.max(0, Math.floor(Math.min(...v.pol.map(q => q.y)))), by1 = Math.min(ny - 1, Math.ceil(Math.max(...v.pol.map(q => q.y))));
      for (let z = 1; z < nz && (z - 0.5) / escala <= v.altura; z++) if ((z - 0.5) / escala >= v.desde) for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (dentro(v.pol, x + 0.5, y + 0.5)) solido[(z * ny + y) * nx + x] = 1;
    }
  }
  // planos donde cambia la planta (en coordenadas de la red: la altura h está en z = h·escala + 1) y la azotea (y las de los vecinos)
  // (donde la piel sigue inclinada no hay losa a la vista: ese nivel no es un plano; la azotea siempre)
  const planos = [...new Set([...pols.filter((_, k) => k === 0 || k === pols.length - 1 || !torre.suave[k - 1]).map(q => q.cota), ...vecinos.flatMap(v => (v.desde > 0 ? [v.desde, v.altura] : [v.altura]))])].map(h => h * escala + 1);
  // los tramos: cada nivel rige de su cota a la del siguiente (el primero, desde el suelo); el último es la azotea
  const tramos: Tramo3D[] = pols.slice(0, -1).map((n, k) => {
    const sc = torre.secs[k];
    return sc ? { h0: n.cota, h1: pols[k + 1].cota, pol: sc.a, polArriba: sc.b } : { h0: k === 0 ? 0 : n.cota, h1: pols[k + 1].cota, pol: n.pol };
  }).filter(t => t.h1 > t.h0 + 1e-9);
  // si el primer tramo es una piel y la torre arranca más arriba del suelo, un prisma desde el suelo hasta él
  if (tramos.length && tramos[0].polArriba && tramos[0].h0 > 1e-9) tramos.unshift({ h0: 0, h1: tramos[0].h0, pol: pols[0].pol });
  const corte = o.alturaExacta && torre.suave.some(Boolean) ? corteInclinado(torre, z => (z - 1) / escala, H) : undefined;
  return { nx, ny, nz, solido, escala, H, hC, B, L, caja, celdas, paredes: paredes3D(nx, ny, nz, solido, capa, planos, true, corte), tramos, cuerpo, vecinos, giro: { co, si, ox, oy } };
}

/**
 * banda de pisos (ver OpcionesGeo3.banda): la planta de cada altura de la franja, sin suelo; la escala sale del ancho y
 * del largo (como la torre entera) y del alto de la franja. La celda z tiene su centro a z0 + (z + ½)/escala.
 */
function geometriaBanda(o: OpcionesGeo3, banda: { z0: number; z1: number }): Geometria3D {
  const { nx, ny, nz } = o;
  const niv = o.niveles.filter(n => n.cota >= 0 && n.silueta.length >= 3).sort((a, b) => a.cota - b.cota);
  if (!niv.length) throw new Error('No hay niveles con planta sobre PB.');
  const Htorre = niv[niv.length - 1].cota;
  const z0 = Math.max(0, Math.min(banda.z0, Htorre)), z1 = Math.max(z0, Math.min(banda.z1, Htorre)), hb = z1 - z0;
  if (!(hb > 0)) throw new Error('La banda tiene que tener alto y estar dentro de la torre.');
  const th = ((o.dir === 'A' ? -90 : 0) - (o.angulo ?? 0)) * (Math.PI / 180), co = Math.cos(th), si = Math.sin(th);
  const rot = niv.map(n => ({ cota: n.cota, continua: n.continua, pol: n.silueta.map(q => ({ x: q.x * co - q.y * si, y: q.x * si + q.y * co })) }));
  // la planta que rige en la altura h: la del último nivel con cota ≤ h (debajo del primero, la del primero)
  const plantaEn = <T extends { cota: number }>(xs: T[], h: number) => [...xs].reverse().find(q => q.cota <= h + 1e-9) ?? xs[0];
  const enBanda = [...new Set([plantaEn(rot, z0), ...rot.filter(n => n.cota > z0 && n.cota < z1)])];
  const todos = enBanda.flatMap(n => n.pol);
  const xMin = Math.min(...todos.map(q => q.x)), xMax = Math.max(...todos.map(q => q.x));
  const yMin = Math.min(...todos.map(q => q.y)), yMax = Math.max(...todos.map(q => q.y));
  const B = yMax - yMin, L = xMax - xMin;
  // la franja no tiene el alto que limite la escala: el ancho ocupado se baja a 1/5 (menos bloqueo lateral que en la
  // torre entera, donde casi siempre manda el alto)
  const escala = Math.min(nz / hb, (nx * 0.55) / (L + 3 * B), (ny * BLOQUEO_BANDA) / B);
  const ox = Math.round(nx * 0.25) - xMin * escala, oy = (ny - B * escala) / 2 - yMin * escala;
  const pols = rot.map(n => ({ cota: n.cota, continua: n.continua, pol: n.pol.map(q => ({ x: ox + q.x * escala, y: oy + q.y * escala })) }));
  const torre = torreEnAltura(pols, escala, !!o.alturaExacta);
  const solido = new Uint8Array(nx * ny * nz);
  let celdas = 0;
  const caja = { x0: nx, x1: 0, y0: ny, y1: 0 };
  const capa: (P[] | null)[] = new Array(nz).fill(null);
  for (let z = 0; z < nz; z++) {
    const n = { pol: torre.plantaEn(Math.min(z1, z0 + (z + 0.5) / escala)) };
    capa[z] = n.pol;
    const bx0 = Math.max(0, Math.floor(Math.min(...n.pol.map(q => q.x)))), bx1 = Math.min(nx - 1, Math.ceil(Math.max(...n.pol.map(q => q.x))));
    const by0 = Math.max(0, Math.floor(Math.min(...n.pol.map(q => q.y)))), by1 = Math.min(ny - 1, Math.ceil(Math.max(...n.pol.map(q => q.y))));
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      if (!dentro(n.pol, x + 0.5, y + 0.5)) continue;
      solido[(z * ny + y) * nx + x] = 1; celdas++;
      caja.x0 = Math.min(caja.x0, x); caja.x1 = Math.max(caja.x1, x); caja.y0 = Math.min(caja.y0, y); caja.y1 = Math.max(caja.y1, y);
    }
  }
  // planos donde cambia la planta dentro de la franja (el centro de la celda z está en z + ½ = (h − z0)·escala)
  const planos = pols.filter((q, k) => q.cota > z0 && q.cota < z1 && (k === 0 || !torre.suave[k - 1])).map(q => (q.cota - z0) * escala);
  const cortes = [0, ...pols.filter(q => q.cota > z0 && q.cota < z1).map(q => q.cota - z0), hb];
  // en la banda, una piel interpolada se dibuja con sus plantas en los bordes de cada tramo (la de abajo y la de arriba)
  const tramos: Tramo3D[] = cortes.slice(0, -1).map((h0, k) => {
    const ha = z0 + h0, hz = z0 + cortes[k + 1], ia = pols.findIndex((q, i) => q.cota <= ha + 1e-9 && (i + 1 >= pols.length || pols[i + 1].cota > ha + 1e-9));
    if (ia >= 0 && torre.suave[ia]) {
      const sc = torre.secs[ia]!, c0 = pols[ia].cota, c1 = pols[ia + 1].cota, lerp = (t: number) => sc.a.map((q, i) => ({ x: q.x + (sc.b[i].x - q.x) * t, y: q.y + (sc.b[i].y - q.y) * t }));
      return { h0, h1: cortes[k + 1], pol: lerp((ha - c0) / (c1 - c0)), polArriba: lerp((Math.min(hz, c1) - c0) / (c1 - c0)) };
    }
    return { h0, h1: cortes[k + 1], pol: plantaEn(pols, ha).pol };
  }).filter(t => t.h1 > t.h0 + 1e-9);
  const corte = o.alturaExacta && torre.suave.some(Boolean) ? corteInclinado(torre, z => Math.min(z1, z0 + z / escala), z1) : undefined;
  return { nx, ny, nz, solido, escala, H: hb, hC: nz, B, L, caja, celdas, paredes: paredes3D(nx, ny, nz, solido, capa, planos, false, corte), tramos, vecinos: [], giro: { co, si, ox, oy }, banda: { z0, z1 } };
}
/** la parte del ancho del túnel que ocupa la torre en la banda (bloqueo) */
export const BLOQUEO_BANDA = 0.2;
/**
 * grilla de la banda con las mismas celdas que la de la torre entera (nTotal): el dominio en planta tiene las mismas
 * proporciones (la torre a un cuarto del largo, 3 B de estela) y la torre ocupa un quinto del ancho y el alto es el de la franja
 */
export function grillaBanda(nTotal: number, B: number, L: number, hb: number): { nx: number; ny: number; nz: number } {
  const Lx = (L + 3 * B) / 0.55, Ly = B / BLOQUEO_BANDA;
  const e = Math.cbrt(nTotal / (Lx * Ly * hb));
  const nz = Math.max(8, Math.round(hb * e)), e2 = Math.sqrt(nTotal / nz / (Lx * Ly));
  return { nx: Math.max(32, Math.round(Lx * e2)), ny: Math.max(16, Math.round(Ly * e2)), nz };
}

/**
 * perfil de entrada del 102-25: u(z) = uH · √(Kz(z) / Kz(H)), con z ≥ 5 m (Kz constante abajo); uH en la altura de la
 * torre. Limitado a 1,3 uH arriba (estabilidad de la red).
 */
export function perfil102(nz: number, escala: number, H: number, exp: Exposicion, uH: number): Float32Array {
  const u = new Float32Array(nz), kH = Kz(H, exp);
  for (let z = 1; z < nz; z++) u[z] = Math.min(1.3 * uH, uH * Math.sqrt(Kz((z - 0.5) / escala, exp) / kH));
  return u;
}
export const exponentePerfil = (exp: Exposicion) => 1 / EXPOSICIONES[exp].alfa;

/**
 * la celda de referencia de la presión: en el borde lateral, a la altura de la torre y a mitad de camino entre la
 * entrada y la torre (cerca de la entrada la presión todavía está perturbada por la condición de entrada)
 */
export const celdaReferencia = (g: Geometria3D) => (Math.min(g.nz - 1, g.hC) * g.ny + 0) * g.nx + Math.max(4, Math.round(g.caja.x0 / 2));

export type Cara = 'barlovento' | 'sotavento' | 'lateral' | 'cubierta';
/**
 * las celdas de fluido pegadas a la torre y la cara a la que miran (con la normal de la celda sólida vecina): un sólido
 * en +x es una cara de barlovento (su normal mira hacia −x, contra el viento), en −x sotavento, en ±y lateral y abajo
 * (−z, sin contar el suelo) cubierta.
 */
export function celdasDeCara(g: Geometria3D): { celda: number; cara: Cara; x: number; y: number; z: number; nx: number; ny: number; nz: number }[] {
  const { nx, ny, nz, solido } = g, out: ReturnType<typeof celdasDeCara> = [], torre = g.cuerpo ?? solido;
  // con contexto, solo las caras de la torre (las de los vecinos no se miden)
  // en la banda no hay suelo: desde z = 0 (y la torre va de borde a borde: no tiene cubierta)
  const zMin = g.banda ? 0 : 1;
  const s = (x: number, y: number, z: number) => x >= 0 && x < nx && y >= 0 && y < ny && z >= zMin && z < nz && torre[(z * ny + y) * nx + x] === 1;
  for (let z = zMin; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const c = (z * ny + y) * nx + x;
    if (solido[c]) continue;
    if (s(x + 1, y, z)) out.push({ celda: c, cara: 'barlovento', x, y, z, nx: -1, ny: 0, nz: 0 });
    if (s(x - 1, y, z)) out.push({ celda: c, cara: 'sotavento', x, y, z, nx: 1, ny: 0, nz: 0 });
    if (s(x, y + 1, z)) out.push({ celda: c, cara: 'lateral', x, y, z, nx: 0, ny: -1, nz: 0 });
    if (s(x, y - 1, z)) out.push({ celda: c, cara: 'lateral', x, y, z, nx: 0, ny: 1, nz: 0 });
    if (z >= 2 && s(x, y, z - 1)) out.push({ celda: c, cara: 'cubierta', x, y, z, nx: 0, ny: 0, nz: 1 });
  }
  return out;
}

/** el Cp del reglamento para comparar (Tabla 2.4-1 y Fig. 2.4-1; la cubierta depende de h/L: se deja sin valor) */
export function cpReglamento(g: Geometria3D): Record<Cara, number | null> {
  return { barlovento: CP_BARLOVENTO, sotavento: cpSotavento(g.B > 0 ? g.L / g.B : 1), lateral: CP_LATERAL, cubierta: null };
}

/**
 * Cp en el tiempo, celda por celda: se acumula la diferencia de densidad con la referencia en cada muestra (su suma, su
 * suma de cuadrados, el mínimo y el máximo) para tener el Cp medio, el desvío (RMS de la parte que fluctúa) y los
 * extremos. Cp = (ρ − ρ∞)/3 / (½ uH²), con la velocidad de entrada a la altura de la torre (como qh del reglamento) y la
 * presión de referencia ρ∞ de una celda lejos, aguas arriba y a la altura de la torre (como la toma estática de un túnel).
 */
export class PromedioCp {
  readonly suma: Float64Array; readonly suma2: Float64Array; readonly min: Float64Array; readonly max: Float64Array;
  muestras = 0;
  private readonly k0: number;
  constructor(readonly caras: ReturnType<typeof celdasDeCara>, readonly uH: number, readonly celdaRef = -1) {
    const n = caras.length;
    this.suma = new Float64Array(n); this.suma2 = new Float64Array(n); this.min = new Float64Array(n).fill(Infinity); this.max = new Float64Array(n).fill(-Infinity);
    this.k0 = 1 / 3 / (0.5 * uH * uH);
  }
  /** rho: la densidad de cada celda (o un campo de 4 valores por celda con ρ en el 4.º, si paso = 4) */
  sumar(rho: ArrayLike<number>, paso = 1, desplaz = 0) {
    const ref = this.celdaRef >= 0 ? rho[this.celdaRef * paso + desplaz] : 1;
    for (let k = 0; k < this.caras.length; k++) {
      const d = rho[this.caras[k].celda * paso + desplaz] - ref;
      this.suma[k] += d; this.suma2[k] += d * d;
      if (d < this.min[k]) this.min[k] = d;
      if (d > this.max[k]) this.max[k] = d;
    }
    this.muestras++;
  }
  /** Cp medio */
  cp(k: number): number { return this.muestras ? (this.suma[k] / this.muestras) * this.k0 : NaN; }
  /** desvío del Cp en el tiempo (RMS de lo que fluctúa alrededor de la media) */
  rms(k: number): number { if (!this.muestras) return NaN; const m = this.suma[k] / this.muestras; return Math.sqrt(Math.max(0, this.suma2[k] / this.muestras - m * m)) * this.k0; }
  /** el Cp más bajo y el más alto que pasaron por la celda */
  cpMin(k: number): number { return this.muestras ? this.min[k] * this.k0 : NaN; }
  cpMax(k: number): number { return this.muestras ? this.max[k] * this.k0 : NaN; }
  /** el estado acumulado, para guardar la corrida (y volver a abrirla sin simular) */
  exportar() { return { muestras: this.muestras, suma: [...this.suma], suma2: [...this.suma2], min: [...this.min], max: [...this.max] }; }
  importar(d: ReturnType<PromedioCp['exportar']>) {
    if (d.suma.length !== this.suma.length) throw new Error('La corrida guardada no corresponde a esta torre (otra cantidad de celdas de fachada).');
    this.suma.set(d.suma); this.suma2.set(d.suma2); this.min.set(d.min.map(v => (v === null ? Infinity : v))); this.max.set(d.max.map(v => (v === null ? -Infinity : v))); this.muestras = d.muestras;
  }
  /** el promedio de cada cara (pesado por celda) */
  porCara(): Record<Cara, number> {
    const s: Record<Cara, number> = { barlovento: 0, sotavento: 0, lateral: 0, cubierta: 0 }, n: Record<Cara, number> = { barlovento: 0, sotavento: 0, lateral: 0, cubierta: 0 };
    this.caras.forEach((c, k) => { s[c.cara] += this.cp(k); n[c.cara]++; });
    (Object.keys(s) as Cara[]).forEach(k => { s[k] = n[k] ? s[k] / n[k] : NaN; });
    return s;
  }
}
