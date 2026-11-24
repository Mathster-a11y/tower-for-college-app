/**
 * Túnel 3D, etapa 7 de la propuesta de resultados: los remolinos como superficies.
 *
 * Criterio Q (Hunt, Wray y Moin, 1988): con el gradiente de la velocidad partido en la parte que gira (Ω, antisimétrica)
 * y la que estira (S, simétrica), Q = ½ (|Ω|² − |S|²). Donde Q > 0 el aire gira más de lo que se deforma: es el
 * núcleo de un remolino. La superficie Q = umbral envuelve esos núcleos (el remolino de la estela, los de las esquinas,
 * el de la azotea).
 *
 * La superficie se arma con tetraedros: cada cubo de 8 celdas se parte en 6 tetraedros que comparten la diagonal 0–6, y
 * en cada uno el corte es un triángulo (un vértice adentro o tres) o dos (dos adentro). Sin tablas: se escribe entero.
 */

/** Q en cada celda (unidades de la red: 1/paso²); 0 en los sólidos y en el borde de la red */
export function criterioQ(campo: ArrayLike<number>, nx: number, ny: number, nz: number, solido: Uint8Array): Float32Array {
  const Q = new Float32Array(nx * ny * nz), idx = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
  const u = (c: number, k: number) => campo[4 * c + k];
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const c = idx(x, y, z);
    if (solido[c]) continue;
    const vec = [idx(x + 1, y, z), idx(x - 1, y, z), idx(x, y + 1, z), idx(x, y - 1, z), idx(x, y, z + 1), idx(x, y, z - 1)];
    // al lado de un sólido el gradiente no es confiable: se deja en 0
    if (vec.some(v => solido[v])) continue;
    // g[i][j] = ∂u_i / ∂x_j (diferencias centradas)
    const g = [0, 1, 2].map(i => [0, 1, 2].map(j => (u(vec[2 * j], i) - u(vec[2 * j + 1], i)) / 2));
    let s2 = 0, w2 = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const s = (g[i][j] + g[j][i]) / 2, w = (g[i][j] - g[j][i]) / 2; s2 += s * s; w2 += w * w; }
    Q[c] = 0.5 * (w2 - s2);
  }
  return Q;
}
/** un umbral de Q: una fracción del percentil 99 de los Q positivos (los remolinos fuertes) */
export function umbralQ(Q: Float32Array, frac: number): number {
  const pos: number[] = [];
  for (let i = 0; i < Q.length; i += 3) if (Q[i] > 0) pos.push(Q[i]);
  if (!pos.length) return Infinity;
  pos.sort((a, b) => a - b);
  return frac * pos[Math.floor(0.99 * (pos.length - 1))];
}

// los 8 vértices de un cubo y sus 6 tetraedros alrededor de la diagonal 0–6
const ESQ = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const TET = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
/**
 * La isosuperficie f = iso: triángulos (x, y, z en coordenadas de celda, los centros de las celdas en los enteros),
 * nueve números por triángulo
 */
export function isosuperficie(f: Float32Array, nx: number, ny: number, nz: number, iso: number): Float32Array {
  const out: number[] = [], v = new Float64Array(8), p: number[][] = ESQ.map(() => [0, 0, 0]);
  const idx = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
  const corte = (a: number, b: number) => { const t = (iso - v[a]) / (v[b] - v[a] || 1e-30); return [p[a][0] + (p[b][0] - p[a][0]) * t, p[a][1] + (p[b][1] - p[a][1]) * t, p[a][2] + (p[b][2] - p[a][2]) * t]; };
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    let adentro = 0;
    for (let k = 0; k < 8; k++) { const e = ESQ[k]; v[k] = f[idx(x + e[0], y + e[1], z + e[2])]; p[k][0] = x + e[0]; p[k][1] = y + e[1]; p[k][2] = z + e[2]; if (v[k] > iso) adentro++; }
    if (adentro === 0 || adentro === 8) continue;
    for (const t of TET) {
      const dentro = t.filter(k => v[k] > iso), fuera = t.filter(k => v[k] <= iso);
      if (dentro.length === 0 || dentro.length === 4) continue;
      if (dentro.length === 1 || dentro.length === 3) {
        const [s, otros] = dentro.length === 1 ? [dentro[0], fuera] : [fuera[0], dentro];
        out.push(...corte(s, otros[0]), ...corte(s, otros[1]), ...corte(s, otros[2]));
      } else {
        const [a, b] = dentro, [c, d] = fuera, q1 = corte(a, c), q2 = corte(a, d), q3 = corte(b, d), q4 = corte(b, c);
        out.push(...q1, ...q2, ...q3, ...q1, ...q3, ...q4);
      }
    }
  }
  return new Float32Array(out);
}
