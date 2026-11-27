/**
 * Curvas para dibujar (no para calcular): contornos con arcos (bulge) y Bézier cúbicas pasados a puntos con un error
 * máximo, no con un paso fijo en grados. Con paso fijo, un círculo grande quedaba facetado (un tramo cada 10° en un
 * radio de 28 m se aparta 11 cm) y uno chico tenía puntos de más. Acá cada tramo lleva los puntos que necesita para
 * que la curva no se aparte más de «tol» de la real. El cálculo sigue con su propia discretización (no cambia ningún
 * resultado): esto es solo para el 3D y los dibujos que necesitan puntos.
 */
export interface PuntoCurva { x: number; y: number }
export interface VerticeCurva { x: number; y: number; b?: number; c1?: PuntoCurva; c2?: PuntoCurva }

/** tramos para un arco de radio r y ángulo th (rad) con flecha ≤ tol */
export function tramosArco(r: number, th: number, tol = 0.005, max = 720): number {
  if (!(r > 0) || !(Math.abs(th) > 0)) return 1;
  const paso = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / r)));
  return Math.max(2, Math.min(max, Math.ceil(Math.abs(th) / Math.max(paso, 1e-4))));
}

/** el contorno cerrado (o abierto) en puntos: rectas tal cual; arcos y Bézier con error ≤ tol (m) */
export function discretizarCurva(v: VerticeCurva[], tol = 0.005, cerrado = true): PuntoCurva[] {
  const out: PuntoCurva[] = [];
  const n = v.length, hasta = cerrado ? n : n - 1;
  for (let i = 0; i < hasta; i++) {
    const a = v[i], b = v[(i + 1) % n];
    out.push({ x: a.x, y: a.y });
    if (a.c1 && a.c2) {
      // cota del apartamiento de una Bézier cúbica partida en m tramos: (3/4)·máx|segunda diferencia|/m²
      const d1 = Math.hypot(a.x - 2 * a.c1.x + a.c2.x, a.y - 2 * a.c1.y + a.c2.y), d2 = Math.hypot(a.c1.x - 2 * a.c2.x + b.x, a.c1.y - 2 * a.c2.y + b.y);
      const m = Math.max(2, Math.min(400, Math.ceil(Math.sqrt((0.75 * Math.max(d1, d2)) / tol))));
      for (let k = 1; k < m; k++) {
        const t = k / m, u = 1 - t;
        out.push({ x: u * u * u * a.x + 3 * u * u * t * a.c1.x + 3 * u * t * t * a.c2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * a.c1.y + 3 * u * t * t * a.c2.y + t * t * t * b.y });
      }
      continue;
    }
    const bu = a.b ?? 0, c = Math.hypot(b.x - a.x, b.y - a.y);
    if (Math.abs(bu) < 1e-9 || c < 1e-12) continue;
    const th = 4 * Math.atan(bu), r = c / (2 * Math.sin(Math.abs(th) / 2));
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, dist = c / 2 / Math.tan(th / 2);
    const ox = cx - ((b.y - a.y) / c) * dist, oy = cy + ((b.x - a.x) / c) * dist;
    const a0 = Math.atan2(a.y - oy, a.x - ox), m = tramosArco(r, th, tol);
    for (let k = 1; k < m; k++) { const t = a0 + (th * k) / m; out.push({ x: ox + r * Math.cos(t), y: oy + r * Math.sin(t) }); }
  }
  if (!cerrado && n) out.push({ x: v[n - 1].x, y: v[n - 1].y });
  return out;
}

/** un círculo de radio r con error ≤ tol (al menos 24 puntos) */
export function circuloFino(cx: number, cy: number, r: number, tol = 0.005): PuntoCurva[] {
  const m = Math.max(24, tramosArco(r, 2 * Math.PI, tol));
  return Array.from({ length: m }, (_, i) => ({ x: cx + r * Math.cos((i / m) * 2 * Math.PI), y: cy + r * Math.sin((i / m) * 2 * Math.PI) }));
}
