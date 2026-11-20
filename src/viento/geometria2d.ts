/**
 * Túnel de viento 2D: la planta de la torre (o sus muros) pasada a celdas, con el viento soplando hacia +X de la red.
 * El tamaño de la red sale del ancho de la torre transversal al viento (D celdas); el canal mide unos 20 D de largo
 * y 8 D de alto, con la torre a 5 D de la entrada.
 */
export interface P { x: number; y: number }

export interface OpcionesGeometria {
  /** polígonos en planta (m): la silueta de la losa, o los muros */
  poligonos: P[][];
  /** viento del proyecto: A sopla hacia +y, B hacia +x */
  dir: 'A' | 'B';
  /** giro extra del viento (grados, antihorario visto desde arriba) */
  angulo?: number;
  /** celdas en el ancho de la torre transversal al viento */
  D?: number;
  /** canal: largo y alto en múltiplos de D, y distancia de la entrada a la torre */
  largo?: number; alto?: number; entrada?: number;
  /** segunda torre igual: a «distancia» D de la primera, detrás (en el sentido del viento) o al lado */
  segunda?: { donde: 'detras' | 'lado'; distancia: number } | null;
}

export interface Geometria2D {
  nx: number; ny: number; solido: Uint8Array;
  /** celdas por metro y ancho transversal de la torre (m) */
  escala: number; anchoM: number; D: number;
  /** celdas sólidas de la primera torre (para el área) */
  celdasTorre: number;
  /** dónde quedó la torre: columna de adelante y de atrás, fila de abajo y de arriba */
  caja: { x0: number; x1: number; y0: number; y1: number };
  /** los polígonos en coordenadas de la red (para dibujarlos) */
  contornos: P[][];
}

/** área con signo (positiva antihoraria) */
export function areaPoligono(p: P[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q.x * r.y - r.x * q.y; }
  return a / 2;
}

/** ochava cada esquina convexa: corta d metros sobre cada lado (como máximo el 45 % del lado más corto) */
export function chaflanar(pol: P[], d: number): P[] {
  if (!(d > 0) || pol.length < 3) return pol;
  const s = Math.sign(areaPoligono(pol)) || 1, out: P[] = [];
  for (let i = 0; i < pol.length; i++) {
    const a = pol[(i - 1 + pol.length) % pol.length], b = pol[i], c = pol[(i + 1) % pol.length];
    const cruz = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
    if (cruz * s <= 1e-12 || l1 < 1e-9 || l2 < 1e-9) { out.push(b); continue; }   // cóncava o recta: queda
    const dd = Math.min(d, 0.45 * l1, 0.45 * l2);
    out.push({ x: b.x + ((a.x - b.x) / l1) * dd, y: b.y + ((a.y - b.y) / l1) * dd }, { x: b.x + ((c.x - b.x) / l2) * dd, y: b.y + ((c.y - b.y) / l2) * dd });
  }
  return out;
}

function dentro(p: P[], x: number, y: number): boolean {
  let s = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) s = !s;
  }
  return s;
}

export function geometria2D(o: OpcionesGeometria): Geometria2D {
  const D = Math.max(6, Math.round(o.D ?? 24)), largo = o.largo ?? 20, alto = o.alto ?? 8, entrada = o.entrada ?? 5;
  // giro: el sentido del viento pasa a +X. Viento A (+y) → girar −90°; viento B (+x) → sin giro; más el ángulo extra
  const th = ((o.dir === 'A' ? -90 : 0) - (o.angulo ?? 0)) * (Math.PI / 180), co = Math.cos(th), si = Math.sin(th);
  const rot = (q: P): P => ({ x: q.x * co - q.y * si, y: q.x * si + q.y * co });
  const polsR = o.poligonos.filter(p => p.length >= 3).map(p => p.map(rot));
  const todos = polsR.flat();
  if (!todos.length) throw new Error('No hay planta para el túnel.');
  const xMin = Math.min(...todos.map(q => q.x)), xMax = Math.max(...todos.map(q => q.x));
  const yMin = Math.min(...todos.map(q => q.y)), yMax = Math.max(...todos.map(q => q.y));
  const anchoM = yMax - yMin, profM = xMax - xMin;
  const escala = D / anchoM;
  const profD = (profM * escala) / D;                              // largo de la torre en el sentido del viento, en D
  const extraX = o.segunda?.donde === 'detras' ? o.segunda.distancia + profD : 0, extraY = o.segunda?.donde === 'lado' ? o.segunda.distancia + 1 : 0;
  const nx = Math.round((Math.max(largo, entrada + profD + extraX + 12)) * D), ny = Math.round((alto + extraY) * D);
  // la torre: a «entrada» D de la entrada, centrada en el alto (con la segunda al lado, el par centrado);
  // una celda corrida hacia arriba, para que los remolinos se desprendan sin esperar
  const ox = entrada * D, oy = Math.round((ny - (D + extraY * D)) / 2) + 1;
  const aRed = (q: P): P => ({ x: ox + (q.x - xMin) * escala, y: oy + (q.y - yMin) * escala });
  const contornos = polsR.map(p => p.map(aRed));
  if (o.segunda) {
    const dx = o.segunda.donde === 'detras' ? (profD + o.segunda.distancia) * D : 0, dy = o.segunda.donde === 'lado' ? (1 + o.segunda.distancia) * D : 0;
    contornos.push(...polsR.map(p => p.map(aRed).map(q => ({ x: q.x + dx, y: q.y + dy }))));
  }
  const solido = new Uint8Array(nx * ny);
  let celdasTorre = 0;
  const nPrimera = polsR.length;
  const caja = { x0: nx, x1: 0, y0: ny, y1: 0 };
  contornos.forEach((p, k) => {
    const bx0 = Math.max(0, Math.floor(Math.min(...p.map(q => q.x)))), bx1 = Math.min(nx - 1, Math.ceil(Math.max(...p.map(q => q.x))));
    const by0 = Math.max(0, Math.floor(Math.min(...p.map(q => q.y)))), by1 = Math.min(ny - 1, Math.ceil(Math.max(...p.map(q => q.y))));
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      if (!dentro(p, x + 0.5, y + 0.5)) continue;
      const c = y * nx + x;
      if (k < nPrimera && !solido[c]) { celdasTorre++; caja.x0 = Math.min(caja.x0, x); caja.x1 = Math.max(caja.x1, x); caja.y0 = Math.min(caja.y0, y); caja.y1 = Math.max(caja.y1, y); }
      solido[c] = 1;
    }
  });
  return { nx, ny, solido, escala, anchoM, D, celdasTorre, caja, contornos };
}
