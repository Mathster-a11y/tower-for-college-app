/**
 * La torre del túnel 3D como superficie, con el contorno real de cada piso (no en escalones de celdas), y la misma
 * torre en STL para llevarla a otro programa (impresión 3D, CAD, otro simulador de viento).
 */
import { ShapeUtils, Vector2 } from 'three';
import type { Geometria3D, NivelPlanta, P } from './geometria3d';

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
  g.tramos.forEach((t, k) => {
    const pol = antihorario(t.pol), z0 = t.h0 * g.escala, z1 = t.h1 * g.escala;
    const filas = Math.max(1, Math.ceil(z1 - z0));
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
    // tapa de arriba (la azotea o el retiro): el Cp promedio de las celdas de cubierta que están encima de la planta
    const zt = Math.floor(z1) + 1, deCubierta: number[] = [];
    caras.forEach((f, j) => { if (f.nz === 1 && Math.abs(f.z - zt) <= 1 && dentro(pol, f.x + 0.5, f.y + 0.5)) deCubierta.push(j); });
    const tri = triangular(pol), desde = pos.length / 3;
    tri.forEach(([i, j, l]) => [pol[i], pol[j], pol[l]].forEach(q => pos.push(q.x, q.y, z1)));
    trozos.push({ desde, n: 3 * tri.length, caras: deCubierta });
    // tapa de abajo (se ve si el piso vuela sobre el de abajo); el suelo no
    if (k > 0) {
      const d2 = pos.length / 3;
      tri.forEach(([i, j, l]) => [pol[i], pol[l], pol[j]].forEach(q => pos.push(q.x, q.y, z0)));
      trozos.push({ desde: d2, n: 3 * tri.length, caras: [] });
    }
  });
  return { pos: Float32Array.from(pos), trozos };
}

/**
 * la torre en STL binario (m, z hacia arriba), en las coordenadas del proyecto: un prisma cerrado por piso, con la
 * planta que rige en ese piso (la de su nivel; el primero desde el suelo). Cada prisma es un sólido cerrado.
 */
export function stlTorre(niveles: NivelPlanta[]): ArrayBuffer {
  const niv = niveles.filter(n => n.cota >= 0 && n.silueta.length >= 3).sort((a, b) => a.cota - b.cota);
  const tris: number[][] = [];
  const agregar = (a: number[], b: number[], c: number[], fuera: number[] | null) => {
    // normal; si se pide un sentido (tapas), se da vuelta el triángulo para que mire hacia afuera
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (fuera && n[0] * fuera[0] + n[1] * fuera[1] + n[2] * fuera[2] < 0) { [b, c] = [c, b]; n = n.map(x => -x); }
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    tris.push([n[0] / l, n[1] / l, n[2] / l, ...a, ...b, ...c]);
  };
  for (let k = 0; k < niv.length - 1; k++) {
    const pol = antihorario(niv[k].silueta), z0 = k === 0 ? 0 : niv[k].cota, z1 = niv[k + 1].cota;
    if (!(z1 > z0)) continue;
    for (let i = 0; i < pol.length; i++) {
      const a = pol[i], b = pol[(i + 1) % pol.length];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
      agregar([a.x, a.y, z0], [b.x, b.y, z0], [b.x, b.y, z1], null); agregar([a.x, a.y, z0], [b.x, b.y, z1], [a.x, a.y, z1], null);
    }
    for (const [i, j, l] of triangular(pol)) {
      agregar([pol[i].x, pol[i].y, z1], [pol[j].x, pol[j].y, z1], [pol[l].x, pol[l].y, z1], [0, 0, 1]);
      agregar([pol[i].x, pol[i].y, z0], [pol[j].x, pol[j].y, z0], [pol[l].x, pol[l].y, z0], [0, 0, -1]);
    }
  }
  const buf = new ArrayBuffer(84 + 50 * tris.length), dv = new DataView(buf);
  const cab = 'Torre 3D: la torre piso por piso (m, z hacia arriba)';
  for (let i = 0; i < Math.min(80, cab.length); i++) dv.setUint8(i, cab.charCodeAt(i) < 128 ? cab.charCodeAt(i) : 63);
  dv.setUint32(80, tris.length, true);
  tris.forEach((t, k) => { t.forEach((x, j) => dv.setFloat32(84 + 50 * k + 4 * j, x, true)); dv.setUint16(84 + 50 * k + 48, 0, true); });
  return buf;
}
