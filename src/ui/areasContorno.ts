/**
 * Dibujo liso de las áreas de influencia: en lugar de pintar las celdas de la cuadrícula (escalones), cada región se
 * arma con «marching squares» sobre los centros de las celdas, y el borde entre dos dueños cae donde sus distancias
 * se igualan (AreasInfluencia.corte), no a medio paso. Afuera de la losa las regiones se estiran hasta el borde de la
 * cuadrícula y el dibujo se recorta con el contorno de la losa (y sus huecos), así el sombreado sigue el contorno.
 */
import type { AreasInfluencia } from '../engine/areas';

type P = { x: number; y: number };

/** dueño de cada celda, con un anillo más alrededor y las celdas sin dueño (fuera de la losa, huecos) llenadas con el vecino más cercano */
function grillaLlena(a: AreasInfluencia): { o: Int32Array; nx: number; ny: number } {
  const nx = a.nx + 2, ny = a.ny + 2, o = new Int32Array(nx * ny).fill(-1);
  const cola: number[] = [];
  for (let j = 0; j < a.ny; j++) for (let k = 0; k < a.nx; k++) {
    const v = a.duenio[j * a.nx + k];
    if (v >= 0) { const n = (j + 1) * nx + k + 1; o[n] = v; cola.push(n); }
  }
  for (let h = 0; h < cola.length; h++) {
    const n = cola[h], j = Math.floor(n / nx), k = n % nx;
    for (const [dj, dk] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const j2 = j + dj, k2 = k + dk;
      if (j2 < 0 || k2 < 0 || j2 >= ny || k2 >= nx) continue;
      const m = j2 * nx + k2;
      if (o[m] < 0) { o[m] = o[n]; cola.push(m); }
    }
  }
  return { o, nx, ny };
}

export interface DibujoAreas {
  /** un camino por región (clave → «d» del path, en las coordenadas que dan X e Y) */
  regiones: Map<string, string>;
  /** los bordes entre los dueños (las líneas finas entre áreas) */
  bordes: string;
  /** el contorno de la losa con sus huecos, para recortar (regla par-impar) */
  recorte: string;
}

/** «dec»: decimales de las coordenadas (en metros, 3 = al milímetro) */
export function dibujoAreas(a: AreasInfluencia, claveDe: string[], X: (x: number) => number = x => x, Y: (y: number) => number = y => y, dec = 3): DibujoAreas {
  const { o, nx, ny } = grillaLlena(a);
  const centro = (j: number, k: number): P => ({ x: a.x0 + (k - 0.5) * a.paso, y: a.y0 + (j - 0.5) * a.paso });
  const f = (v: number) => v.toFixed(dec);
  const pt = (q: P) => `${f(X(q.x))},${f(Y(q.y))}`;
  const corte = (oa: number, qa: P, ob: number, qb: P): P => {
    const t = a.corte ? a.corte(oa, qa, ob, qb) : 0.5;
    return { x: qa.x + t * (qb.x - qa.x), y: qa.y + t * (qb.y - qa.y) };
  };
  const reg = new Map<string, string[]>();
  const agregar = (c: string, d: string) => { let l = reg.get(c); if (!l) reg.set(c, l = []); l.push(d); };
  let bordes = '';
  // tiras de cuadrados enteros de una misma región, para que el dibujo sea liviano
  const tira = new Map<string, number>();
  const cerrarTira = (c: string, j: number, kFin: number) => {
    const k0 = tira.get(c); if (k0 === undefined) return;
    tira.delete(c);
    const a0 = centro(j, k0), b0 = centro(j + 1, kFin);
    agregar(c, `M${pt(a0)}L${pt({ x: b0.x, y: a0.y })}L${pt(b0)}L${pt({ x: a0.x, y: b0.y })}Z`);
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let k = 0; k < nx - 1; k++) {
      const n = [j * nx + k, j * nx + k + 1, (j + 1) * nx + k + 1, (j + 1) * nx + k];
      const q = [centro(j, k), centro(j, k + 1), centro(j + 1, k + 1), centro(j + 1, k)];
      const ow = n.map(i => o[i]);
      if (ow.some(v => v < 0)) { [...tira.keys()].forEach(c => cerrarTira(c, j, k)); continue; }
      const cl = ow.map(v => claveDe[v]);
      // cuadrado entero de una región: se suma a la tira
      if (cl.every(c => c === cl[0])) {
        [...tira.keys()].forEach(c => { if (c !== cl[0]) cerrarTira(c, j, k); });
        if (!tira.has(cl[0])) tira.set(cl[0], k);
      } else {
        [...tira.keys()].forEach(c => cerrarTira(c, j, k));
        // cada región presente: su parte del cuadrado (las esquinas suyas y los cortes en los lados que cambian)
        for (const c of new Set(cl)) {
          const v: P[] = [];
          for (let i = 0; i < 4; i++) {
            const i2 = (i + 1) % 4;
            if (cl[i] === c) v.push(q[i]);
            if ((cl[i] === c) !== (cl[i2] === c)) v.push(corte(ow[i], q[i], ow[i2], q[i2]));
          }
          if (v.length >= 3) agregar(c, `M${v.map(pt).join('L')}Z`);
        }
      }
      // bordes entre dueños (también dentro de una misma región: cada muro con su área)
      const xs: P[] = [];
      for (let i = 0; i < 4; i++) { const i2 = (i + 1) % 4; if (ow[i] !== ow[i2]) xs.push(corte(ow[i], q[i], ow[i2], q[i2])); }
      if (xs.length === 2) bordes += `M${pt(xs[0])}L${pt(xs[1])}`;
      else if (xs.length > 2) { const m = { x: xs.reduce((s, p) => s + p.x, 0) / xs.length, y: xs.reduce((s, p) => s + p.y, 0) / xs.length }; xs.forEach(p => { bordes += `M${pt(p)}L${pt(m)}`; }); }
    }
    [...tira.keys()].forEach(c => cerrarTira(c, j, nx - 1));
  }
  const anillo = (pol: P[]) => (pol.length >= 3 ? `M${pol.map(pt).join('L')}Z` : '');
  const recorte = [anillo(a.contorno ?? []), ...(a.huecosPol ?? []).map(anillo)].join('');
  return { regiones: new Map([...reg].map(([c, l]) => [c, l.join('')])), bordes, recorte };
}
