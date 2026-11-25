/**
 * La torre del túnel 3D como superficie, con el contorno real de cada piso (no en escalones de celdas), y la misma
 * torre en STL para llevarla a otro programa (impresión 3D, CAD, otro simulador de viento).
 */
import { ShapeUtils, Vector2 } from 'three';
import { alinearPlantas, CORRIMIENTO_MAX, type Geometria3D, type NivelPlanta, type P } from './geometria3d';

type CeldaCara = { celda: number; x: number; y: number; z: number; nx: number; ny: number; nz: number };

/**
 * pos: triángulos (x, y en la red; z = altura en celdas: h · escala); trozos: grupos de vértices consecutivos con las
 * celdas de cara cuyo Cp les da color (vacío: sin dato, gris)
 */
export interface MallaTorre { pos: Float32Array; trozos: { desde: number; n: number; caras: number[] }[] }

const area = (p: P[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
const antihorario = (p: P[]) => (area(p) >= 0 ? p : [...p].reverse());
function dentro(p: P[], x: number, y: number): boolean {
  let s = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) s = !s; }
  return s;
}
/** triángulos de un polígono simple (índices) */
function triangular(p: P[]): number[][] { return ShapeUtils.triangulateShape(p.map(q => new Vector2(q.x, q.y)), []); }

export function mallaTorre(g: Geometria3D, caras: CeldaCara[]): MallaTorre {
  const pos: number[] = [], trozos: MallaTorre['trozos'] = [];
  const porCelda = new Map<number, number[]>();
  caras.forEach((f, k) => { const l = porCelda.get(f.celda); if (l) l.push(k); else porCelda.set(f.celda, [k]); });
  const celda = (x: number, y: number, z: number) => (x < 0 || x >= g.nx || y < 0 || y >= g.ny || z < 1 || z >= g.nz ? -1 : (z * g.ny + y) * g.nx + x);
  // la celda de cara más cerca de un punto de la fachada, mirando hacia afuera (normal horizontal n)
  const caraLateral = (x: number, y: number, zc: number, nx: number, ny: number): number[] => {
    const z = Math.floor(zc) + 1;
    for (const d of [0.4, 0.9, 1.4, 1.9]) {
      const c = celda(Math.floor(x + nx * d), Math.floor(y + ny * d), z), l = c >= 0 ? porCelda.get(c) : undefined;
      if (!l) continue;
      // la que mira más parecido (si la celda toca dos caras, en una esquina)
      let mejor = l[0], pm = -Infinity;
      for (const k of l) { const f = caras[k], pr = f.nx * nx + f.ny * ny; if (pr > pm) { pm = pr; mejor = k; } }
      return [mejor];
    }
    return [];
  };
  const quad = (a: number[], b: number[], c: number[], d: number[], cs: number[]) => {
    const desde = pos.length / 3;
    [a, b, c, a, c, d].forEach(v => pos.push(v[0], v[1], v[2]));
    trozos.push({ desde, n: 6, caras: cs });
  };
  /** tapa horizontal (azotea, retiro o voladizo), coloreada arriba con el Cp de las celdas de cubierta encima */
  const tapa = (pol: P[], z: number, arriba: boolean) => {
    const tri = triangular(pol), desde = pos.length / 3, deCubierta: number[] = [];
    if (arriba) { const zt = Math.floor(z) + 1; caras.forEach((f, j) => { if (f.nz === 1 && Math.abs(f.z - zt) <= 1 && dentro(pol, f.x + 0.5, f.y + 0.5)) deCubierta.push(j); }); }
    tri.forEach(([i, j, l]) => (arriba ? [pol[i], pol[j], pol[l]] : [pol[i], pol[l], pol[j]]).forEach(q => pos.push(q.x, q.y, z)));
    trozos.push({ desde, n: 3 * tri.length, caras: deCubierta });
  };
  g.tramos.forEach((t, k) => {
    const z0 = t.h0 * g.escala, z1 = t.h1 * g.escala;
    const filas = Math.max(1, Math.ceil(z1 - z0));
    const antes = k > 0 ? g.tramos[k - 1] : null, ultimo = k === g.tramos.length - 1;
    if (t.polArriba) {
      // piel interpolada (paredes exactas en altura): de pol en h0 a polArriba en h1, punto a punto, en filas de una celda
      const a = t.pol, b = t.polArriba, n = a.length;
      const en = (i: number, u: number) => [a[i].x + (b[i].x - a[i].x) * u, a[i].y + (b[i].y - a[i].y) * u];
      const sentido = area(a) >= 0 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        for (let f = 0; f < filas; f++) {
          const ua = f / filas, ub = (f + 1) / filas, za = z0 + (z1 - z0) * ua, zb = z0 + (z1 - z0) * ub;
          const pa0 = en(i, ua), pb0 = en(j, ua), pa1 = en(i, ub), pb1 = en(j, ub);
          const mx = (pb0[0] + pb1[0] - pa0[0] - pa1[0]) / 2, my = (pb0[1] + pb1[1] - pa0[1] - pa1[1]) / 2, L = Math.hypot(mx, my) || 1;
          const nxo = (sentido * my) / L, nyo = (-sentido * mx) / L;
          quad([pa0[0], pa0[1], za], [pb0[0], pb0[1], za], [pb1[0], pb1[1], zb], [pa1[0], pa1[1], zb],
            caraLateral((pa0[0] + pb1[0]) / 2, (pa0[1] + pb1[1]) / 2, (za + zb) / 2, nxo, nyo));
        }
      }
      // la piel sigue en el tramo de arriba (con la misma planta): tapa solo arriba de todo; abajo, si el de abajo era un prisma
      if (ultimo) tapa(antihorario(b), z1, true);
      if (k > 0 && !antes?.polArriba) tapa(antihorario(a), z0, false);
      return;
    }
    const pol = antihorario(t.pol);
    // fachadas: cada lado partido en pedazos de una celda, y en filas de una celda de alto
    for (let i = 0; i < pol.length; i++) {
      const a = pol[i], b = pol[(i + 1) % pol.length], lx = b.x - a.x, ly = b.y - a.y, L = Math.hypot(lx, ly);
      if (L < 1e-9) continue;
      const nxo = ly / L, nyo = -lx / L, seg = Math.max(1, Math.ceil(L));
      for (let s = 0; s < seg; s++) for (let f = 0; f < filas; f++) {
        const ta = s / seg, tb = (s + 1) / seg, za = z0 + ((z1 - z0) * f) / filas, zb = z0 + ((z1 - z0) * (f + 1)) / filas;
        const pa = [a.x + lx * ta, a.y + ly * ta], pb = [a.x + lx * tb, a.y + ly * tb];
        quad([pa[0], pa[1], za], [pb[0], pb[1], za], [pb[0], pb[1], zb], [pa[0], pa[1], zb], caraLateral((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (za + zb) / 2, nxo, nyo));
      }
    }
    // tapa de arriba (la azotea o el retiro); la de abajo, si el piso vuela sobre el de abajo (no si abajo hay una piel
    // que termina en esta misma planta); el suelo no
    tapa(pol, z1, true);
    if (k > 0 && !antes?.polArriba) tapa(pol, z0, false);
  });
  return { pos: Float32Array.from(pos), trozos };
}

/**
 * la torre en STL binario (m, z hacia arriba), en las coordenadas del proyecto. Con la piel continua (alturaExacta, por
 * defecto), donde la fachada sigue de un piso al otro (la misma regla que el túnel: carpintería continua y un
 * corrimiento de menos de 3 pisos de alto) los pisos van juntos en un solo sólido de piel reglada, con las plantas de
 * todos sus niveles con los mismos puntos (sin rajas entre pisos); donde hay un escalón (o sin alturaExacta), un prisma
 * cerrado por piso con la planta de su nivel (el primero desde el suelo). Cada sólido es cerrado.
 */
export function stlTorre(niveles: NivelPlanta[], op: { alturaExacta?: boolean } = {}): ArrayBuffer {
  const niv = niveles.filter(n => n.cota >= 0 && n.silueta.length >= 3).sort((a, b) => a.cota - b.cota);
  const alturaExacta = op.alturaExacta ?? true;
  const tris: number[][] = [];
  const agregar = (a: number[], b: number[], c: number[], fuera: number[] | null) => {
    // normal; si se pide un sentido (tapas), se da vuelta el triángulo para que mire hacia afuera
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (fuera && n[0] * fuera[0] + n[1] * fuera[1] + n[2] * fuera[2] < 0) { [b, c] = [c, b]; n = n.map(x => -x); }
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    tris.push([n[0] / l, n[1] / l, n[2] / l, ...a, ...b, ...c]);
  };
  const tapa = (pol: P[], z: number, arriba: boolean) => {
    for (const [i, j, l] of triangular(pol)) agregar([pol[i].x, pol[i].y, z], [pol[j].x, pol[j].y, z], [pol[l].x, pol[l].y, z], [0, 0, arriba ? 1 : -1]);
  };
  /** costados de un anillo de abajo (en z0) a uno de arriba (en z1), punto a punto, los dos antihorarios */
  const costados = (a: P[], b: P[], z0: number, z1: number) => {
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      if (Math.hypot(a[j].x - a[i].x, a[j].y - a[i].y) < 1e-9 && Math.hypot(b[j].x - b[i].x, b[j].y - b[i].y) < 1e-9) continue;
      agregar([a[i].x, a[i].y, z0], [a[j].x, a[j].y, z0], [b[j].x, b[j].y, z1], null); agregar([a[i].x, a[i].y, z0], [b[j].x, b[j].y, z1], [b[i].x, b[i].y, z1], null);
    }
  };
  // ¿del nivel k al k + 1 la piel sigue? (la regla del túnel)
  const sigue = (k: number) => {
    if (!alturaExacta || niv[k].continua === false) return false;
    const dz = niv[k + 1].cota - niv[k].cota;
    if (!(dz > 0)) return false;
    const c = alinearPlantas(niv[k].silueta, niv[k + 1].silueta).corre;
    return c > 1e-6 && c <= CORRIMIENTO_MAX * dz;
  };
  let k = 0;
  while (k < niv.length - 1) {
    const z0 = k === 0 ? 0 : niv[k].cota;
    if (!sigue(k)) {
      // un prisma: la planta del nivel de su cota a la del de arriba
      const pol = antihorario(niv[k].silueta), z1 = niv[k + 1].cota;
      if (z1 > z0) { costados(pol, pol, z0, z1); tapa(pol, z1, true); tapa(pol, z0, false); }
      k++; continue;
    }
    // una piel: todos los pisos seguidos que siguen, con las plantas con los mismos puntos (cada una alineada con la de abajo)
    const anillos: P[][] = [alinearPlantas(niv[k].silueta, niv[k].silueta).a], cotas = [niv[k].cota];
    let f = k;
    while (f < niv.length - 1 && sigue(f)) { anillos.push(alinearPlantas(anillos[anillos.length - 1], niv[f + 1].silueta).b); cotas.push(niv[f + 1].cota); f++; }
    // si el primer nivel no está en el suelo y es el primero de la torre, un prisma desde el suelo hasta él
    if (k === 0 && cotas[0] > 1e-9) { const pol = anillos[0]; costados(pol, pol, 0, cotas[0]); tapa(pol, 0, false); tapa(pol, cotas[0], true); }
    for (let j = 0; j + 1 < anillos.length; j++) costados(anillos[j], anillos[j + 1], cotas[j], cotas[j + 1]);
    tapa(anillos[0], cotas[0], false); tapa(anillos[anillos.length - 1], cotas[cotas.length - 1], true);
    k = f;
  }
  const buf = new ArrayBuffer(84 + 50 * tris.length), dv = new DataView(buf);
  const cab = 'Torre 3D: la torre, piel continua o piso por piso (m, z hacia arriba)';
  for (let i = 0; i < Math.min(80, cab.length); i++) dv.setUint8(i, cab.charCodeAt(i) < 128 ? cab.charCodeAt(i) : 63);
  dv.setUint32(80, tris.length, true);
  tris.forEach((t, k) => { t.forEach((x, j) => dv.setFloat32(84 + 50 * k + 4 * j, x, true)); dv.setUint16(84 + 50 * k + 48, 0, true); });
  return buf;
}
