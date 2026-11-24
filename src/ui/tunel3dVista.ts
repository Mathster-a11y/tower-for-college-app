/**
 * Túnel 3D, etapa 3 de la propuesta de resultados (docs/propuesta_resultados_3d): cómo se ve y cómo se graba.
 *  · líneas de corriente como tubos con relieve (se lee qué pasa adelante y qué atrás de la torre);
 *  · partículas que viajan por las líneas a la velocidad del aire (como tinta en un túnel de verdad);
 *  · cámaras guardadas (barlovento, esquina, costado, arriba, peatón): las imágenes de dos proyectos se comparan;
 *  · grabación en video (WebM) con la llave, el tiempo y el gráfico de las fuerzas de la base dentro del cuadro.
 * Todo con three.js y el lienzo del navegador; nada copiado de otros programas, solo las ideas.
 */
import * as THREE from 'three';
import type { Geometria3D } from '../viento/geometria3d';

/** una línea de corriente: puntos (m), la velocidad de la red en cada uno y el tiempo de la red acumulado (pasos) */
export interface Trazo { pts: THREE.Vector3[]; vel: number[]; t: number[] }

// ------------------------------------------------------------------------------------------------ tubos
/** las líneas como tubos de radio r (m), con el color de la velocidad a lo largo */
export function grupoTubos(trazos: Trazo[], color: (v: number, out: THREE.Color) => THREE.Color, r: number): THREE.Group {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 }), c = new THREE.Color(), radial = 6;
  for (const tr of trazos) {
    if (tr.pts.length < 4) continue;
    const curva = new THREE.CatmullRomCurve3(tr.pts), seg = Math.min(400, tr.pts.length * 2);
    const geo = new THREE.TubeGeometry(curva, seg, r, radial, false);
    // el color de cada anillo: la velocidad interpolada en la misma fracción del largo
    const largo: number[] = [0];
    for (let i = 1; i < tr.pts.length; i++) largo.push(largo[i - 1] + tr.pts[i].distanceTo(tr.pts[i - 1]));
    const L = largo[largo.length - 1] || 1, cols = new Float32Array((seg + 1) * (radial + 1) * 3);
    let k = 0;
    for (let i = 0; i <= seg; i++) {
      const d = (i / seg) * L; while (k < largo.length - 2 && largo[k + 1] < d) k++;
      const f = (d - largo[k]) / (largo[k + 1] - largo[k] || 1), v = tr.vel[k] + (tr.vel[k + 1] - tr.vel[k]) * Math.max(0, Math.min(1, f));
      color(v, c);
      for (let j = 0; j <= radial; j++) { const o = 3 * (i * (radial + 1) + j); cols[o] = c.r; cols[o + 1] = c.g; cols[o + 2] = c.b; }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.add(new THREE.Mesh(geo, mat));
  }
  return g;
}

// ------------------------------------------------------------------------------------------------ partículas
/**
 * Partículas que recorren las líneas: cada línea lleva varias, repartidas en el tiempo; avanzan con el tiempo de la red
 * (las rápidas se separan, las lentas se juntan: se ve dónde el aire acelera y dónde se frena).
 */
export class Particulas {
  readonly obj: THREE.Points;
  private readonly pos: Float32Array; private readonly col: Float32Array;
  private reloj = 0; private ultimo = 0;
  constructor(private readonly trazos: Trazo[], private readonly color: (v: number, out: THREE.Color) => THREE.Color, private readonly porLinea: number, tam: number, private readonly pasosPorMs: number) {
    const n = trazos.length * porLinea;
    this.pos = new Float32Array(3 * n); this.col = new Float32Array(3 * n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.obj = new THREE.Points(geo, new THREE.PointsMaterial({ size: tam, vertexColors: true, sizeAttenuation: true }));
    this.avanzar(performance.now());
  }
  avanzar(ahora: number) {
    const dt = this.ultimo ? Math.min(100, ahora - this.ultimo) : 0; this.ultimo = ahora;
    this.reloj += dt * this.pasosPorMs;
    const c = new THREE.Color();
    let o = 0;
    for (const tr of this.trazos) {
      const T = tr.t[tr.t.length - 1] || 1;
      for (let k = 0; k < this.porLinea; k++, o += 3) {
        const tt = (this.reloj + (k * T) / this.porLinea) % T;
        let i = 0, a = 0, b = tr.t.length - 1;
        while (b - a > 1) { const m = (a + b) >> 1; if (tr.t[m] <= tt) a = m; else b = m; }
        i = a;
        const f = (tt - tr.t[i]) / (tr.t[i + 1] - tr.t[i] || 1), p = tr.pts[i], q = tr.pts[Math.min(i + 1, tr.pts.length - 1)];
        this.pos[o] = p.x + (q.x - p.x) * f; this.pos[o + 1] = p.y + (q.y - p.y) * f; this.pos[o + 2] = p.z + (q.z - p.z) * f;
        this.color(tr.vel[i], c); this.col[o] = c.r; this.col[o + 1] = c.g; this.col[o + 2] = c.b;
      }
    }
    this.obj.geometry.getAttribute('position').needsUpdate = true;
    this.obj.geometry.getAttribute('color').needsUpdate = true;
    this.obj.geometry.computeBoundingSphere();
  }
}

// ------------------------------------------------------------------------------------------------ cámaras
export type NombreCamara = 'esquina' | 'barlovento' | 'costado' | 'arriba' | 'peaton' | 'detalle';
export const CAMARAS: [NombreCamara, string][] = [['esquina', 'Esquina'], ['barlovento', 'Barlovento'], ['costado', 'Costado'], ['arriba', 'Arriba'], ['peaton', 'Peatón'], ['detalle', 'Zoom a la esquina']];
/** la cámara acercada (f > 1) o alejada (f < 1) hacia el punto que mira */
export function acercar(c: { pos: THREE.Vector3; mira: THREE.Vector3 }, f: number): { pos: THREE.Vector3; mira: THREE.Vector3 } {
  if (!(f > 0) || f === 1) return { pos: c.pos.clone(), mira: c.mira.clone() };
  return { pos: c.mira.clone().add(c.pos.clone().sub(c.mira).multiplyScalar(1 / f)), mira: c.mira.clone() };
}
/** el centro de la torre en el mundo (m) */
export function centroTorre(g: Geometria3D) { return new THREE.Vector3(((g.caja.x0 + g.caja.x1 + 1) / 2 - g.nx / 2) / g.escala, 0, -((g.caja.y0 + g.caja.y1 + 1) / 2 - g.ny / 2) / g.escala); }
/** posición y punto al que mira cada cámara (siempre las mismas para la misma torre y grilla) */
export function camara(nombre: NombreCamara, g: Geometria3D): { pos: THREE.Vector3; mira: THREE.Vector3 } {
  const c = centroTorre(g), H = g.H, D = Math.max(H, g.B, g.L), Lx = g.nx / g.escala, Ly = g.ny / g.escala;
  switch (nombre) {
    case 'barlovento': return { pos: new THREE.Vector3(c.x - 2.3 * D, 0.55 * H, c.z), mira: new THREE.Vector3(c.x, 0.45 * H, c.z) };
    case 'costado': return { pos: new THREE.Vector3(c.x + 0.4 * D, 0.5 * H, c.z + 2.6 * D), mira: new THREE.Vector3(c.x + 0.4 * D, 0.4 * H, c.z) };
    case 'arriba': return { pos: new THREE.Vector3(c.x + 0.5 * D, 3.2 * D, c.z + 0.01), mira: new THREE.Vector3(c.x + 0.5 * D, 0, c.z) };
    case 'peaton': return { pos: new THREE.Vector3(c.x + 0.8 * D, 1.7, c.z + 1.1 * D), mira: new THREE.Vector3(c.x, 0.55 * H, c.z) };
    case 'detalle': {
      // la esquina de barlovento (la que da al viento y a la cámara de costado), de cerca: ahí se despega el aire
      const xe = (g.caja.x0 - g.nx / 2) / g.escala, ze = -((g.caja.y1 + 1) - g.ny / 2) / g.escala, d = Math.max(g.B, g.L, 0.25 * H);
      // desde afuera, en diagonal y un poco arriba: se ve la esquina, el aire que se despega y el corte de costado
      return { pos: new THREE.Vector3(xe - 1.3 * d, 0.6 * H + 0.35 * d, ze - 1.7 * d), mira: new THREE.Vector3(xe + 0.35 * d, 0.55 * H, ze + 0.15 * d) };
    }
    default: return { pos: new THREE.Vector3(-Lx * 0.62, Math.max(H * 1.9, Lx * 0.42), Ly * 1.25), mira: new THREE.Vector3(Lx * 0.05, H * 0.3, 0) };
  }
}

// ------------------------------------------------------------------------------------------------ grabación
export type Recorrido = 'quieta' | 'orbita' | 'vuelo';
export interface OpcionesGrabacion {
  /** el lienzo de three (con preserveDrawingBuffer) */
  lienzo: HTMLCanvasElement;
  segundos: number;
  /** mueve la cámara y dibuja la escena para la fracción t (0 a 1) del video */
  alCuadro: (t: number) => void;
  /** lo que va encima de cada cuadro (llave, tiempo, gráfico) */
  encima: (g: CanvasRenderingContext2D, W: number, H: number, t: number) => void;
  alTerminar: (video: Blob | null, error?: string) => void;
  /** ancho del video (px); por defecto el del lienzo (hasta 1600) */
  ancho?: number;
  /** franja al costado para las llaves (px, fuera de la imagen: no tapa nada); 0 o nada, sin franja */
  franja?: number;
  /** preferir MP4 (lo abre PowerPoint) si el navegador lo graba */
  mp4?: boolean;
}
/** el formato que va a grabar el navegador (MP4 si se pide y se puede, si no WebM); null si no graba video */
export function formatoVideo(mp4 = true): { tipo: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const tipos: [string, 'mp4' | 'webm'][] = [...(mp4 ? [['video/mp4;codecs=avc1.42E01E', 'mp4'], ['video/mp4;codecs=avc1', 'mp4'], ['video/mp4', 'mp4']] as [string, 'mp4'][] : []), ['video/webm;codecs=vp9', 'webm'], ['video/webm;codecs=vp8', 'webm'], ['video/webm', 'webm']];
  const t = tipos.find(([x]) => MediaRecorder.isTypeSupported?.(x));
  return t ? { tipo: t[0], ext: t[1] } : null;
}
/** graba la vista en un video WebM (MediaRecorder sobre un lienzo que junta la escena y lo de encima) */
export function grabar(op: OpcionesGrabacion): { parar: () => void } {
  const W = op.ancho ?? Math.min(1600, op.lienzo.width), H = Math.round((W * op.lienzo.height) / op.lienzo.width), F = Math.max(0, Math.round(op.franja ?? 0));
  // las medidas del video tienen que ser pares (los codificadores de MP4 no aceptan impares)
  const cv = document.createElement('canvas'); cv.width = 2 * Math.round((W + F) / 2); cv.height = 2 * Math.round(H / 2);
  const g = cv.getContext('2d')!;
  const fmt = formatoVideo(op.mp4 ?? false);
  if (!fmt || !('captureStream' in cv)) { setTimeout(() => op.alTerminar(null, 'Este navegador no graba video (probá con Chrome, Edge o Firefox).'), 0); return { parar: () => undefined }; }
  const rec = new MediaRecorder(cv.captureStream(30), { mimeType: fmt.tipo, videoBitsPerSecond: Math.round(6_000_000 * Math.max(1, (cv.width * cv.height) / (1280 * 720))) });
  const partes: Blob[] = [];
  rec.ondataavailable = e => { if (e.data.size) partes.push(e.data); };
  rec.onstop = () => op.alTerminar(new Blob(partes, { type: fmt.tipo.split(';')[0] }));
  let vivo = true;
  const t0 = performance.now();
  const cuadro = () => {
    if (!vivo) return;
    const t = Math.min(1, (performance.now() - t0) / (op.segundos * 1000));
    op.alCuadro(t);
    // con franja: fondo blanco a la derecha y la escena a la izquierda (lo de encima recibe el ancho total)
    if (F) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height); }
    g.drawImage(op.lienzo, 0, 0, W, cv.height);
    op.encima(g, cv.width, cv.height, t);
    if (t >= 1) { vivo = false; rec.stop(); return; }
    requestAnimationFrame(cuadro);
  };
  rec.start(500);
  requestAnimationFrame(cuadro);
  return { parar: () => { if (vivo) { vivo = false; rec.stop(); } } };
}

/** el gráfico de las fuerzas de la base dentro del video: arrastre y lateral, con el último instante marcado */
export function graficoEnLienzo(g: CanvasRenderingContext2D, serie: { t: number; Vx: number; Vy: number }[], x: number, y: number, w: number, h: number, col: { arrastre: string; lateral: string; tinta: string }) {
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.88)'; g.fillRect(x, y, w, h);
  const s = serie.slice(-300);
  g.fillStyle = col.tinta; g.font = '600 11px system-ui, sans-serif'; g.fillText('Fuerzas en la base (t)', x + 8, y + 14);
  if (s.length > 1) {
    const vals = s.flatMap(q => [q.Vx, q.Vy, 0]), lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.1 || 1;
    const t0 = s[0].t, t1 = s[s.length - 1].t || t0 + 1;
    const X = (t: number) => x + 8 + ((t - t0) / (t1 - t0 || 1)) * (w - 16), Y = (v: number) => y + h - 8 - ((v - lo + pad) / (hi - lo + 2 * pad)) * (h - 30);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x + 8, Y(0)); g.lineTo(x + w - 8, Y(0)); g.stroke(); g.setLineDash([]);
    for (const [k, c] of [['Vx', col.arrastre], ['Vy', col.lateral]] as const) {
      g.strokeStyle = c; g.lineWidth = 1.8; g.beginPath();
      s.forEach((q, i) => (i ? g.lineTo(X(q.t), Y(q[k])) : g.moveTo(X(q.t), Y(q[k])))); g.stroke();
      const u = s[s.length - 1]; g.fillStyle = c; g.beginPath(); g.arc(X(u.t), Y(u[k]), 3.5, 0, 2 * Math.PI); g.fill();
    }
    const u = s[s.length - 1];
    g.font = '11px system-ui, sans-serif';
    g.fillStyle = col.arrastre; g.fillText(`arrastre ${u.Vx.toFixed(0)}`, x + w - 150, y + 14);
    g.fillStyle = col.lateral; g.fillText(`lateral ${u.Vy.toFixed(0)}`, x + w - 70, y + 14);
  }
  g.restore();
}
