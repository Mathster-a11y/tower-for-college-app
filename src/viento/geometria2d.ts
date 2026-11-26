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
  /**
   * contexto urbano: los contornos (m, planta del proyecto) de los edificios vecinos que llegan al corte. La escala
   * sigue siendo la de la torre; el canal se agranda para que entre el grupo, con la misma distancia a la entrada y
   * lugar para la estela
   */
  contexto?: P[][] | null;
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
  /**
   * paredes exactas: q[i·N + c] es dónde corta la pared el enlace que llega a la celda de aire c desde la celda sólida
   * c − e_i, como fracción del camino de c hacia esa celda (0 < q ≤ 1; 0 = no hay enlace). Lo usa el rebote
   * interpolado: la pared está donde está el contorno, no en el borde de las celdas.
   */
  q: Float32Array;
  /** cuántos contornos de «contornos» son de la torre (los primeros); los demás son vecinos o la segunda torre */
  nTorre: number;
  /** con contexto: las celdas sólidas de la torre (para medir la fuerza solo sobre ella) */
  cuerpo?: Uint8Array;
  /**
   * corte vertical (alzado): la torre de costado sobre el suelo. y es la altura (la fila 0 es el suelo, sólido), el
   * viento entra con el perfil de cada fila (fracción de u0) y arriba hay un techo deslizante. «escala» sigue siendo
   * celdas por metro; D es la altura de la torre en celdas (la medida de referencia del corte)
   */
  alzado?: { H: number; perfil: Float32Array; filaSuelo: number };
  /** fila de la celda de referencia de la presión (si no, cerca del borde de abajo) */
  filaRef?: number;
}

// las 9 direcciones de D2Q9 (las mismas que lbm2d)
const EXg = [0, 1, 0, -1, 0, 1, -1, -1, 1], EYg = [0, 0, 1, 0, -1, 1, 1, -1, -1];
/** primer corte del segmento a→b con los contornos (fracción de a a b), o null */
function corteSegmento(pols: P[][], a: P, b: P): number | null {
  let mejor: number | null = null;
  const rx = b.x - a.x, ry = b.y - a.y;
  for (const p of pols) for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const c = p[j], d = p[i], sx = d.x - c.x, sy = d.y - c.y, den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-14) continue;
    const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den, u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
    if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && (mejor === null || t < mejor)) mejor = t;
  }
  return mejor;
}
/** la fracción q de cada enlace aire → sólido (ver Geometria2D.q) */
export function distanciasPared(nx: number, ny: number, solido: Uint8Array, contornos: P[][], periodico: { x?: boolean; y?: boolean } = { y: true }): Float32Array {
  const N = nx * ny, q = new Float32Array(9 * N);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const c = y * nx + x;
    if (solido[c]) continue;
    for (let i = 1; i < 9; i++) {
      // la celda de atrás (con la vuelta en los bordes periódicos); el corte se busca sin dar la vuelta
      const xs = x - EXg[i], ys = y - EYg[i];
      const xw = periodico.x ? (xs + nx) % nx : xs, yw = periodico.y ? (ys + ny) % ny : ys;
      if (xw < 0 || xw >= nx || yw < 0 || yw >= ny || !solido[yw * nx + xw]) continue;
      const a = { x: x + 0.5, y: y + 0.5 }, b = { x: xs + 0.5, y: ys + 0.5 };
      const t = corteSegmento(contornos, a, b);
      q[i * N + c] = t === null ? 0.5 : Math.min(1, Math.max(1e-3, t));
    }
  }
  return q;
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

export function dentro(p: P[], x: number, y: number): boolean {
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
  let nx = Math.round((Math.max(largo, entrada + profD + extraX + 12)) * D), ny = Math.round((alto + extraY) * D);
  // la torre: a «entrada» D de la entrada, centrada en el alto (con la segunda al lado, el par centrado);
  // una celda corrida hacia arriba, para que los remolinos se desprendan sin esperar
  let ox = entrada * D, oy = Math.round((ny - (D + extraY * D)) / 2) + 1;
  // con contexto: el grupo entero a «entrada» D de la entrada, 12 D de estela detrás y 3 D (o lo que dé el alto) a cada lado
  const ctxR = (o.contexto ?? []).filter(p => p.length >= 3).map(p => p.map(rot));
  if (ctxR.length) {
    const tx = [xMin, xMax, ...ctxR.flat().map(q => q.x)], ty = [yMin, yMax, ...ctxR.flat().map(q => q.y)];
    const gx0 = Math.min(...tx), gx1 = Math.max(...tx), gy0 = Math.min(...ty), gy1 = Math.max(...ty);
    const largoG = (gx1 - gx0) * escala, anchoG = (gy1 - gy0) * escala;
    nx = Math.round(Math.max(largo * D, entrada * D + largoG + 12 * D));
    ny = Math.round(Math.max(alto * D, anchoG + 6 * D));
    ox = entrada * D + (xMin - gx0) * escala;
    oy = Math.round((ny - anchoG) / 2) + (yMin - gy0) * escala + 1;
  }
  const aRed = (q: P): P => ({ x: ox + (q.x - xMin) * escala, y: oy + (q.y - yMin) * escala });
  const contornos = polsR.map(p => p.map(aRed)), nTorre = contornos.length;
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
  // los vecinos, después de la torre (no cuentan en su caja ni en sus celdas)
  let cuerpo: Uint8Array | undefined;
  if (ctxR.length) {
    cuerpo = solido.slice();                                          // por ahora solo hay torre: esas son sus celdas
    for (const p of ctxR.map(p => p.map(aRed))) {
      contornos.push(p);
      const bx0 = Math.max(0, Math.floor(Math.min(...p.map(q => q.x)))), bx1 = Math.min(nx - 1, Math.ceil(Math.max(...p.map(q => q.x))));
      const by0 = Math.max(0, Math.floor(Math.min(...p.map(q => q.y)))), by1 = Math.min(ny - 1, Math.ceil(Math.max(...p.map(q => q.y))));
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (dentro(p, x + 0.5, y + 0.5)) solido[y * nx + x] = 1;
    }
  }
  return { nx, ny, solido, escala, anchoM, D, celdasTorre, caja, contornos, q: distanciasPared(nx, ny, solido, contornos), nTorre, cuerpo };
}

export interface NivelAlzado {
  /** altura sobre PB (m) */
  z: number;
  /** la planta de ese nivel (m, en planta del proyecto) */
  pol: P[];
}
/**
 * Corte vertical (alzado) de la torre: el plano vertical en el sentido del viento que pasa por la torre (corrido
 * «desplaz» del centro, en fracción del ancho transversal: 0 el medio, ±0,5 los bordes). De cada nivel se toma dónde
 * esa línea entra y sale de la planta (la cara de barlovento y la de sotavento) y la piel va recta de un nivel al
 * siguiente. Los tramos sin planta en la línea (una planta baja libre en ese lugar, un patio) quedan abiertos.
 * La red: el suelo en la fila 0 (sólido), la torre de H celdas de alto («celdasH»), 1,5 H de aire delante, 5 H detrás
 * y 4 H de alto en total (con 2,2 H el aire se apretaba arriba de la torre y corría al doble); el viento entra con «perfil(z)» (fracción del de la azotea, z en m sobre PB).
 */
export function geometriaAlzado(o: { niveles: NivelAlzado[]; dir: 'A' | 'B'; angulo?: number; desplaz?: number; celdasH?: number; perfil: (z: number) => number }): Geometria2D {
  const th = ((o.dir === 'A' ? -90 : 0) - (o.angulo ?? 0)) * (Math.PI / 180), co = Math.cos(th), si = Math.sin(th);
  const rot = (q: P): P => ({ x: q.x * co - q.y * si, y: q.x * si + q.y * co });
  const ns = o.niveles.filter(n => n.pol.length >= 3).map(n => ({ z: n.z, pol: n.pol.map(rot) })).sort((a, b) => a.z - b.z);
  if (ns.length < 2) throw new Error('Hacen falta al menos dos niveles con planta para el corte vertical.');
  // la línea del corte: a lo largo del viento (x), en y = centro + desplaz · ancho (del ancho de todos los niveles)
  const ys = ns.flatMap(n => n.pol.map(q => q.y)), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const yc = (y0 + y1) / 2 + Math.max(-0.49, Math.min(0.49, o.desplaz ?? 0)) * (y1 - y0);
  // de cada nivel: dónde entra y dónde sale la línea (los cortes con el contorno, del primero al último)
  const tramo = (pol: P[]): [number, number] | null => {
    const xs: number[] = [];
    for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
      const a = pol[j], b = pol[i];
      if ((a.y > yc) !== (b.y > yc)) xs.push(a.x + ((b.x - a.x) * (yc - a.y)) / (b.y - a.y));
    }
    return xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : null;
  };
  const filas = ns.map(n => ({ z: n.z, t: tramo(n.pol) }));
  const H = ns[ns.length - 1].z - ns[0].z;
  if (!(H > 0)) throw new Error('La torre no tiene altura sobre PB.');
  const xsT = filas.flatMap(f => (f.t ? f.t : [])), xMin = Math.min(...xsT), xMax = Math.max(...xsT);
  const Hc = Math.max(24, Math.round(o.celdasH ?? 60)), escala = Hc / H;
  const prof = (xMax - xMin) * escala;
  const nx = Math.round(1.5 * Hc + prof + 5 * Hc), ny = Math.round(4 * Hc) + 1;
  const ox = 1.5 * Hc, suelo = 1;                                      // la fila 0 es el suelo; la torre arranca en y = 1
  const aRed = (x: number, z: number): P => ({ x: ox + (x - xMin) * escala, y: suelo + (z - ns[0].z) * escala });
  // los contornos: cada racha de niveles seguidos con tramo es un polígono (cara de barlovento subiendo, sotavento
  // bajando); la base se mete media celda en el suelo para que no quede una rendija
  const contornos: P[][] = [];
  let racha: { z: number; t: [number, number] }[] = [];
  const cerrar = () => {
    if (racha.length >= 2) {
      const sube = racha.map(f => aRed(f.t[0], f.z)), baja = [...racha].reverse().map(f => aRed(f.t[1], f.z));
      if (Math.abs(racha[0].z - ns[0].z) < 1e-6) { sube[0] = { ...sube[0], y: suelo - 0.5 }; baja[baja.length - 1] = { ...baja[baja.length - 1], y: suelo - 0.5 }; }
      contornos.push([...sube, ...baja]);
    }
    racha = [];
  };
  for (const f of filas) { if (f.t) racha.push({ z: f.z, t: f.t }); else cerrar(); }
  cerrar();
  if (!contornos.length) throw new Error('El corte no pasa por la torre: probá más cerca del medio.');
  const solido = new Uint8Array(nx * ny);
  for (let x = 0; x < nx; x++) solido[x] = 1;                         // el suelo
  const cuerpo = new Uint8Array(nx * ny);
  let celdasTorre = 0;
  const caja = { x0: nx, x1: 0, y0: ny, y1: 0 };
  for (const p of contornos) {
    const bx0 = Math.max(0, Math.floor(Math.min(...p.map(q => q.x)))), bx1 = Math.min(nx - 1, Math.ceil(Math.max(...p.map(q => q.x))));
    const by0 = Math.max(1, Math.floor(Math.min(...p.map(q => q.y)))), by1 = Math.min(ny - 1, Math.ceil(Math.max(...p.map(q => q.y))));
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      if (!dentro(p, x + 0.5, y + 0.5)) continue;
      const c = y * nx + x;
      if (!cuerpo[c]) { celdasTorre++; caja.x0 = Math.min(caja.x0, x); caja.x1 = Math.max(caja.x1, x); caja.y0 = Math.min(caja.y0, y); caja.y1 = Math.max(caja.y1, y); }
      solido[c] = 1; cuerpo[c] = 1;
    }
  }
  // el perfil de entrada, fila por fila (la del suelo no cuenta)
  const perfil = new Float32Array(ny);
  for (let y = 1; y < ny; y++) perfil[y] = o.perfil((y - suelo + 0.5) / escala);
  // las paredes exactas: con el contorno de la torre y la línea del suelo (sin vuelta arriba-abajo)
  const lineaSuelo: P[] = [{ x: -1, y: -1 }, { x: nx + 1, y: -1 }, { x: nx + 1, y: suelo }, { x: -1, y: suelo }];
  const q = distanciasPared(nx, ny, solido, [...contornos, lineaSuelo], { y: false });
  return { nx, ny, solido, escala, anchoM: H, D: Hc, celdasTorre, caja, contornos, q, nTorre: contornos.length, cuerpo,
    alzado: { H, perfil, filaSuelo: 0 }, filaRef: Math.min(ny - 2, Math.round(suelo + 1.2 * Hc)) };
}
