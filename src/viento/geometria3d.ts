/**
 * Túnel de viento 3D (etapa V3 de docs/plan_viento.html): la torre del proyecto en celdas, con el viento hacia +x de
 * la red. Cada altura toma la silueta del nivel que la cubre (los retiros y los cambios de planta se ven), el suelo
 * es la fila z = 0 y la entrada lleva el perfil de velocidad del CIRSOC 102-25 (u ∝ √Kz, con el Kz del método).
 * Didáctico: no dimensiona.
 */
import { Kz, EXPOSICIONES, CP_BARLOVENTO, CP_LATERAL, cpSotavento, type Exposicion } from '../engine/cargas/cirsoc102';

export interface P { x: number; y: number }
export interface NivelPlanta { cota: number; silueta: P[] }

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
  tramos: { h0: number; h1: number; pol: P[] }[];
  /** con contexto: las celdas sólidas de la torre (las caras y el Cp son solo de ella) y los vecinos en la red */
  cuerpo?: Uint8Array;
  vecinos: { pol: P[]; altura: number; desde: number }[];
  /** de la planta del proyecto (m) a la red: girar con (co, si) y llevar con la escala y el origen (ox, oy) */
  giro: { co: number; si: number; ox: number; oy: number };
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
export function paredes3D(nx: number, ny: number, nz: number, solido: Uint8Array, capa: (P[] | null)[], planos: number[]): Paredes3D {
  const celdas: number[] = [], qs: number[] = [];
  const sol = (x: number, y: number, z: number) => z >= 0 && z < nz && x >= 0 && x < nx && solido[(z * ny + ((y + ny) % ny)) * nx + x] === 1;
  for (let z = 1; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const c = (z * ny + y) * nx + x;
    if (solido[c]) continue;
    let tiene = false;
    const fila = new Array<number>(19).fill(0);
    for (let i = 1; i < 19; i++) {
      const sx = x - EXd[i], sy = y - EYd[i], sz = z - EZd[i];
      if (!sol(sx, sy, sz)) continue;
      tiene = true;
      let q = 0.5;
      if (sz === 0) q = 0.5;                                                   // el suelo, entre celdas
      else if (EXd[i] === 0 && EYd[i] === 0) {
        // vertical: la losa del retiro o la azotea está en un plano de cambio de planta entre las dos celdas
        const z0 = Math.min(z, sz) + 0.5, z1 = Math.max(z, sz) + 0.5;
        const pl = planos.find(h => h > z0 - 1e-9 && h < z1 + 1e-9);
        if (pl !== undefined) q = Math.abs(z + 0.5 - pl);
      } else {
        // con componente horizontal: si las dos alturas tienen la misma planta, la pared es vertical y el corte
        // en planta da la fracción del enlace
        const p0 = capa[z], p1 = capa[sz];
        if (p0 && p0 === p1) { const t = corteEnPlanta(p0, x + 0.5, y + 0.5, sx + 0.5, sy + 0.5); if (t !== null) q = t; }
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
  const { nx, ny, nz } = o;
  const niv = o.niveles.filter(n => n.cota >= 0 && n.silueta.length >= 3).sort((a, b) => a.cota - b.cota);
  if (!niv.length) throw new Error('No hay niveles con planta sobre PB.');
  const H = niv[niv.length - 1].cota;
  if (!(H > 0)) throw new Error('No hay niveles con planta sobre PB.');
  // giro: el viento pasa a +x (viento A sopla hacia +y: −90°; viento B, hacia +x: 0°), más el giro extra
  const th = ((o.dir === 'A' ? -90 : 0) - (o.angulo ?? 0)) * (Math.PI / 180), co = Math.cos(th), si = Math.sin(th);
  const rot = niv.map(n => ({ cota: n.cota, pol: n.silueta.map(q => ({ x: q.x * co - q.y * si, y: q.x * si + q.y * co })) }));
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
  const pols = rot.map(n => ({ cota: n.cota, pol: n.pol.map(q => ({ x: ox + q.x * escala, y: oy + q.y * escala })) }));
  const solido = new Uint8Array(nx * ny * nz);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) solido[y * nx + x] = 1;      // suelo
  let celdas = 0;
  const caja = { x0: nx, x1: 0, y0: ny, y1: 0 };
  const capa: (P[] | null)[] = new Array(nz).fill(null);
  for (let z = 1; z < nz; z++) {
    const h = (z - 0.5) / escala;                                            // altura del centro de la celda (m)
    if (h > H) break;
    // cada piso con la planta de su nivel (como se dibuja: «Planta: PB» es el piso de PB a 1º); debajo del primer nivel,
    // la del primero
    const n = [...pols].reverse().find(q => q.cota <= h + 1e-9) ?? pols[0];
    if (!n) continue;
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
  const planos = [...new Set([...pols.map(q => q.cota), ...vecinos.flatMap(v => (v.desde > 0 ? [v.desde, v.altura] : [v.altura]))])].map(h => h * escala + 1);
  // los tramos: cada nivel rige de su cota a la del siguiente (el primero, desde el suelo); el último es la azotea
  const tramos = pols.slice(0, -1).map((n, k) => ({ h0: k === 0 ? 0 : n.cota, h1: pols[k + 1].cota, pol: n.pol })).filter(t => t.h1 > t.h0 + 1e-9);
  return { nx, ny, nz, solido, escala, H, hC, B, L, caja, celdas, paredes: paredes3D(nx, ny, nz, solido, capa, planos), tramos, cuerpo, vecinos, giro: { co, si, ox, oy } };
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
  const s = (x: number, y: number, z: number) => x >= 0 && x < nx && y >= 0 && y < ny && z >= 1 && z < nz && torre[(z * ny + y) * nx + x] === 1;
  for (let z = 1; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
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
