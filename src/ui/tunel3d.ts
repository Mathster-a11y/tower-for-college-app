/**
 * Etapa «Viento», paso «Túnel 3D» (etapa V3 de docs/plan_viento.html): la torre del proyecto en un túnel de viento
 * 3D (Lattice Boltzmann D3Q19 en la placa de video, WebGPU), con el perfil de velocidad del CIRSOC 102-25. Muestra el
 * Cp medio de cada cara (azul empuje, rojo succión, como en toda la app) al lado del Cp del reglamento, cortes
 * horizontal y vertical, líneas de corriente y el viento en la vereda. Didáctico: no cambia ningún número.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { estado, fmt } from './estado';
import { h, kpi, seccion, type H } from './comp';
import type { Tam } from './diagramas';
import { contornoAlViento, puntosSilueta } from '../engine/silueta';
import { datos102De } from '../engine/cargas/cirsoc102';
import { celdaReferencia, celdasDeCara, cpReglamento, geometria3D, perfil102, PromedioCp, type Cara, type Geometria3D } from '../viento/geometria3d';
import type { Lbm3dGpu } from '../viento/lbm3dGpu';
import { mallaTorre, stlTorre } from '../viento/malla3d';
import { AVISO_RED, CRITICO_RED, dondeRespectoTorre, SALVAGUARDAS } from '../viento/salvaguardas';
import { coloresTermico, dibujarFlechas, LUT_TERMICO, muestraVelocidad, type ModoFlechas } from './campoSuave';
import { llaveHtml, simbolosHtml, type Llave, type Simbolo } from './llaveColor';
import { categoriaLawson, factorPeaton, LAWSON_LDDC, velocidad5 } from '../viento/confort';

const TAM: Record<string, { nx: number; ny: number; nz: number; texto: string }> = {
  rapida: { nx: 96, ny: 48, nz: 40, texto: 'rápida (96 × 48 × 40, 0,2 M celdas: gruesa)' },
  liviano: { nx: 160, ny: 80, nz: 64, texto: 'liviana (160 × 80 × 64, 0,8 M celdas)' },
  fino: { nx: 256, ny: 128, nz: 96, texto: 'fina (256 × 128 × 96, 3,1 M celdas: placa potente)' },
};
/** sin placa de video: el procesador, con una grilla gruesa (unas 25 a 40 veces más lento por celda que una placa media) */
const TAM_CPU = { nx: 80, ny: 40, nz: 32, texto: 'procesador (80 × 40 × 32, 0,1 M celdas)' };
/** velocidad a la altura de la torre en unidades de la red (0,05 con el túnel «lento», más estable) */
let UH = 0.08;
const RE = 5000, CS = 0.17;
const css = (v: string, def: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || def;

const cfg = { tam: 'liviano', paredes: 'exactas' as 'exactas' | 'escalera', angulo: 0, color: 'velocidad' as 'velocidad' | 'cp', zRel: 0.5, yRel: 0.5, lineas: true, vereda: false, horizontal: true, vertical: false,
  /** confort del peatón: viento medio anual a 10 m del lugar (m/s, de una estación meteorológica) y si se pinta Lawson */
  vientoMedio: 4, lawson: true,
  /** motor: la placa de video (WebGPU) o el procesador (sin placa, más lento y con la grilla gruesa) */
  motor: 'placa' as 'placa' | 'procesador',
  /** túnel «lento»: la velocidad de la red a la altura de la torre baja de 0,08 a 0,05 (más estable, más pasos) */
  lento: false,
  /** contexto urbano: simular con los edificios vecinos del proyecto */
  contexto: true,
  /** flechas de la velocidad sobre los cortes: largo fijo con el color de la velocidad (por defecto), proporcionales o ninguna */
  flechas: 'fijas' as ModoFlechas,
  /** el estilo de las flechas al volver a prenderlas, los puntos de velocidad alta y las llaves de colores */
  estiloFlechas: 'fijas' as 'fijas' | 'proporcionales', llave: true, simbolos: false };
/** colores de las categorías Lawson (de quieto a incómodo; ni rojo ni azul, que son tracción y compresión) */
const COL_LAWSON: Record<string, string> = { A: '#e8f5e9', B: '#a5d6a7', C: '#ffe082', D: '#ffb74d', E: '#8d6e63' };

interface Corrida {
  clave: string; geo: Geometria3D; uIn: Float32Array; gpu: Lbm3dGpu | null; error: string | null; cargando: boolean;
  prom: PromedioCp; caras: ReturnType<typeof celdasDeCara>; campo: Float32Array | null;
  corriendo: boolean; ocupado: boolean; k: number; mlups: number; ultimoCampo: number; ultimasLineas: number; sinMirar: number;
  /** salvaguardas: la velocidad más alta en unidades de la red y, si se rompió, dónde (y se pausa) */
  maxRed: number; roto: string | null;
}
let corrida: Corrida | null = null;
let soporteGpu: string | null | undefined;                    // undefined: todavía no se preguntó
let vista: { cont: HTMLElement; ren: THREE.WebGLRenderer; esc: THREE.Scene; cam: THREE.PerspectiveCamera; ctl: OrbitControls; torre: THREE.Mesh | null; trozos: { desde: number; n: number; caras: number[] }[]; planoH: THREE.Mesh | null; planoV: THREE.Mesh | null; lineas: THREE.Group; clave: string } | null = null;
let panelEstado: H | null = null;

// ------------------------------------------------------------------------------------------------ corrida
function claveCorrida() { return JSON.stringify([estado.revision, estado.dir, cfg.tam, cfg.paredes, cfg.angulo, cfg.motor, cfg.lento, cfg.contexto]); }
/** los vecinos del contexto urbano que van al túnel (si se eligió usarlos) */
const vecinos3d = () => (cfg.contexto ? (estado.proyecto.contexto?.edificios ?? []).map(e => ({ pol: e.v, altura: e.altura })) : []);
const tamActual = () => (cfg.motor === 'procesador' ? TAM_CPU : TAM[cfg.tam]);

function nivelesProyecto() {
  const p = estado.proyecto, iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1), zPB = p.niveles[iPB]?.cota ?? 0;
  return p.niveles.map((n, i) => ({ n, i })).filter(x => x.n.cota >= zPB).map(x => ({ cota: x.n.cota - zPB, silueta: puntosSilueta(contornoAlViento(p, x.i).v, 12) }));
}

async function iniciar() {
  detener();
  const T = tamActual();
  const ctx = vecinos3d();
  // con vecinos el aire se acelera en las calles: el túnel lento siempre
  UH = cfg.lento || ctx.length ? 0.05 : 0.08;
  const geo = geometria3D({ niveles: nivelesProyecto(), dir: estado.dir, angulo: cfg.angulo, nx: T.nx, ny: T.ny, nz: T.nz, contexto: ctx });
  const exp = datos102De(estado.proyecto).exposicion;
  const uIn = perfil102(T.nz, geo.escala, geo.H, exp, UH);
  const caras = celdasDeCara(geo);
  const c: Corrida = { clave: claveCorrida(), geo, uIn, gpu: null, error: null, cargando: true, prom: new PromedioCp(caras, UH, celdaReferencia(geo)), caras, campo: null,
    corriendo: true, ocupado: false, k: 10, mlups: 0, ultimoCampo: 0, ultimasLineas: 0, sinMirar: 0, maxRed: 0, roto: null };
  corrida = c;
  try {
    const anchoC = geo.B * geo.escala;
    const exactas = cfg.paredes === 'exactas';
    const o = { nx: T.nx, ny: T.ny, nz: T.nz, nu: (UH * anchoC) / RE, cs: CS, uIn, solido: geo.solido, paredes: exactas ? geo.paredes : undefined, colision: exactas ? 'trt' as const : 'bgk' as const };
    const gpu = cfg.motor === 'procesador' ? (await import('../viento/lbm3dCpu')).crearLbm3dCpu(o) : await (await import('../viento/lbm3dGpu')).crearLbm3dGpu(o);
    if (corrida !== c) { gpu.destruir(); return; }
    c.gpu = gpu;
  } catch (e) { c.error = e instanceof Error ? e.message : String(e); }
  c.cargando = false;
  estado.avisarPanel();
  requestAnimationFrame(ciclo);
}
function detener() { corrida?.gpu?.destruir(); corrida = null; }

async function ciclo() {
  const c = corrida;
  if (!c || !c.gpu) return;
  dibujar();
  if (!vista?.cont.isConnected) { if (++c.sinMirar > 30) { c.corriendo = false; return; } } else c.sinMirar = 0;
  if (c.corriendo && !c.ocupado) {
    c.ocupado = true;
    try {
    const t0 = performance.now();
    c.gpu.avanzar(c.k); await c.gpu.esperar();
    if (corrida !== c) return;
    const dt = performance.now() - t0;
    c.mlups = (c.k * c.geo.nx * c.geo.ny * c.geo.nz) / (dt / 1000) / 1e6;
    c.k = Math.max(1, Math.min(200, Math.round(c.k * (25 / Math.max(1, dt)))));      // ~25 ms de placa por cuadro
    const ahora = performance.now();
    if (ahora - c.ultimoCampo > 1200) {
      c.campo = await c.gpu.campo(); c.ultimoCampo = performance.now();
      if (vigilar3d(c)) { estado.avisarPanel(); return; }               // se rompió: se pausa y se dice dónde
      // se promedia pasada una pasada del aire por el canal
      if (c.gpu.pasos > (0.8 * c.geo.nx) / UH) c.prom.sumar(c.campo, 4, 3);
      if (corrida !== c) return;                              // se cambió la grilla o el giro mientras leía
      actualizarCampo();
      actualizarPanel();
    }
    } catch (e) { if (corrida !== c) return; c.error = e instanceof Error ? e.message : String(e); c.corriendo = false; estado.avisarPanel(); return; }
    c.ocupado = false;
  }
  if (corrida !== c) return;
  requestAnimationFrame(ciclo);
}

// ------------------------------------------------------------------------------------------------ colores
const verde = () => new THREE.Color(css('--deformada', '#1d9e75')), blanco = new THREE.Color(1, 1, 1);
/** la velocidad con el espectro térmico (el mismo del túnel 2D): 0 quieto, 1,6 veces la de la altura de la torre o más */
const colVel = (s: number, out: THREE.Color) => { const i = 3 * Math.max(0, Math.min(255, Math.round((s / (1.6 * UH)) * 255))); return out.setRGB(LUT_TERMICO[i] / 255, LUT_TERMICO[i + 1] / 255, LUT_TERMICO[i + 2] / 255, THREE.SRGBColorSpace); };
function colCp(cp: number, out: THREE.Color) {
  // convención de la app: empuje (comprime) azul, succión (tracciona) rojo
  if (!isFinite(cp)) return out.set(0xcfd4d9);
  return out.copy(blanco).lerp(new THREE.Color(css(cp >= 0 ? '--compresion' : '--traccion', cp >= 0 ? '#378add' : '#e24b4a')), Math.min(1, Math.abs(cp) / (cp >= 0 ? 1 : 1.2)));
}

// ------------------------------------------------------------------------------------------------ escena
/** red → mundo (m, centrado; la altura hacia arriba) */
function aMundo(g: Geometria3D, x: number, y: number, z: number) { return new THREE.Vector3((x - g.nx / 2) / g.escala, z / g.escala, -(y - g.ny / 2) / g.escala); }

function armarVista(cont: HTMLElement) {
  const c = corrida!;
  if (vista && vista.clave === c.clave) { cont.append(vista.ren.domElement); vista.cont = cont; return; }
  vista?.ren.dispose();
  const ren = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  ren.setPixelRatio(Math.min(2, window.devicePixelRatio));
  const esc = new THREE.Scene(); esc.background = new THREE.Color(css('--lienzo', '#ffffff'));
  const cam = new THREE.PerspectiveCamera(35, 1.6, 1, 5000);
  const g = c.geo, Hm = g.H;
  const Lx = g.nx / g.escala, Ly = g.ny / g.escala;
  cam.position.set(-Lx * 0.62, Math.max(Hm * 1.9, Lx * 0.42), Ly * 1.25);
  const ctl = new OrbitControls(cam, ren.domElement); ctl.target.set(Lx * 0.05, Hm * 0.3, 0); ctl.update();
  esc.add(new THREE.HemisphereLight(0xffffff, 0x99aabb, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 1.1); sol.position.set(-60, 120, 80); esc.add(sol);
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(g.nx / g.escala, g.ny / g.escala), new THREE.MeshStandardMaterial({ color: 0xeef0f2 }));
  suelo.rotation.x = -Math.PI / 2; esc.add(suelo);
  // la torre: con paredes exactas, su contorno real piso por piso (la superficie, coloreada con el Cp de la celda de
  // cara más cercana); en escalera, una cara por celda de cara, como la ve la simulación
  const pos: number[] = [], trozos: { desde: number; n: number; caras: number[] }[] = [];
  if (cfg.paredes === 'exactas' && g.tramos.length) {
    const m = mallaTorre(g, c.caras);
    for (let k = 0; k < m.pos.length; k += 3) { const q = aMundo(g, m.pos[k], m.pos[k + 1], m.pos[k + 2]); pos.push(q.x, q.y, q.z); }
    trozos.push(...m.trozos);
  } else for (const f of c.caras) {
    // la cara está entre la celda de aire y el sólido vecino (en −normal)
    const { x, y, z } = f, q: THREE.Vector3[] = [];
    if (f.nx !== 0) { const xf = f.nx < 0 ? x + 1 : x; q.push(aMundo(g, xf, y, z - 1), aMundo(g, xf, y + 1, z - 1), aMundo(g, xf, y + 1, z), aMundo(g, xf, y, z)); }
    else if (f.ny !== 0) { const yf = f.ny < 0 ? y + 1 : y; q.push(aMundo(g, x, yf, z - 1), aMundo(g, x + 1, yf, z - 1), aMundo(g, x + 1, yf, z), aMundo(g, x, yf, z)); }
    else { const zf = z - 1; q.push(aMundo(g, x, y, zf), aMundo(g, x + 1, y, zf), aMundo(g, x + 1, y + 1, zf), aMundo(g, x, y + 1, zf)); }
    trozos.push({ desde: pos.length / 3, n: 6, caras: [trozos.length] });
    [0, 1, 2, 0, 2, 3].forEach(k => pos.push(q[k].x, q[k].y, q[k].z));
  }
  const gt = new THREE.BufferGeometry();
  gt.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  gt.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(0.8), 3));
  gt.computeVertexNormals();
  const torre = new THREE.Mesh(gt, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }));
  esc.add(torre);
  // los vecinos del contexto urbano: prismas grises (no se miden)
  if (g.vecinos.length) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a9ca3, roughness: 1 });
    for (const v of g.vecinos) {
      const forma = new THREE.Shape(v.pol.map(q => new THREE.Vector2((q.x - g.nx / 2) / g.escala, (q.y - g.ny / 2) / g.escala)));
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: v.altura, bevelEnabled: false }), mat);
      m.rotation.x = -Math.PI / 2; esc.add(m);
    }
  }
  const lineas = new THREE.Group(); esc.add(lineas);
  vista = { cont, ren, esc, cam, ctl, torre, trozos, planoH: null, planoV: null, lineas, clave: c.clave };
  cont.append(ren.domElement);
  ctl.addEventListener('change', () => dibujar());
}

/**
 * la textura de un corte: el color de cada celda, y la imagen k veces más fina interpolando entre los centros de las
 * celdas (sin pixelado; el borde de la torre queda suave porque las celdas sólidas entran con su color en la mezcla)
 */
const rgbS = { r: 0, g: 0, b: 0 };
function textura(ancho: number, alto: number, pintar: (i: number, j: number, out: THREE.Color) => boolean, vel?: (i: number, j: number) => [number, number] | null) {
  const n = ancho * alto, R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), aire = new Uint8Array(n), col = new THREE.Color();
  for (let j = 0; j < alto; j++) for (let i = 0; i < ancho; i++) {
    const c = j * ancho + i;
    if (!pintar(i, j, col)) { R[c] = 52 / 255; G[c] = 58 / 255; B[c] = 70 / 255; continue; }
    col.getRGB(rgbS, THREE.SRGBColorSpace); R[c] = rgbS.r; G[c] = rgbS.g; B[c] = rgbS.b; aire[c] = 1;
  }
  const k = Math.max(1, Math.min(6, Math.floor(2048 / ancho))), W = ancho * k, H = alto * k;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!, img = g.createImageData(W, H), d = img.data;
  for (let fila = 0; fila < H; fila++) {
    const Y = alto - (fila + 0.5) / k - 0.5;                           // la fila de arriba de la imagen es la j más alta
    let j = Math.floor(Y), fy = Y - j; if (j < 0) { j = 0; fy = 0; } else if (j >= alto - 1) { j = alto - 2; fy = 1; }
    for (let p = 0; p < W; p++) {
      const X = (p + 0.5) / k - 0.5;
      let i = Math.floor(X), fx = X - i; if (i < 0) { i = 0; fx = 0; } else if (i >= ancho - 1) { i = ancho - 2; fx = 1; }
      const c = j * ancho + i, w = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy], cs = [c, c + 1, c + ancho, c + ancho + 1];
      let r = 0, gg = 0, bb = 0, a = 0;
      for (let m = 0; m < 4; m++) { r += w[m] * R[cs[m]]; gg += w[m] * G[cs[m]]; bb += w[m] * B[cs[m]]; a += w[m] * aire[cs[m]]; }
      const q = 4 * (fila * W + p);
      d[q] = r * 255; d[q + 1] = gg * 255; d[q + 2] = bb * 255; d[q + 3] = 255 - 20 * a;   // el aire, apenas transparente
    }
  }
  g.putImageData(img, 0, 0);
  // las flechas de la velocidad en el plano del corte, dibujadas sobre la textura (unas 32 a lo ancho)
  if (vel && cfg.flechas !== 'no') {
    const VA = new Float32Array(n), VB = new Float32Array(n), sol = new Uint8Array(n);
    for (let j = 0; j < alto; j++) for (let i = 0; i < ancho; i++) { const c = j * ancho + i, m = vel(i, j); if (m) { VA[c] = m[0]; VB[c] = m[1]; } else sol[c] = 1; }
    dibujarFlechas(g, { W, H, x0: 0, dx: 1 / k, y0: alto, dy: 1 / k }, cfg.flechas, muestraVelocidad(VA, VB, sol, ancho, alto, 1), Math.max(18, Math.round(W / 32)), '#1d1d24', '#f4f4f4', cfg.vereda || cfg.color === 'cp');
  }
  const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** la velocidad del campo abierto a 1,5 m superada el 5 % del tiempo (m/s) */
const u5Peaton = () => velocidad5(cfg.vientoMedio) * factorPeaton(datos102De(estado.proyecto).exposicion);

function actualizarCampo() {
  armarLlaves3d();
  const c = corrida, v = vista;
  if (!c || !v || !c.campo) return;
  const g = c.geo, F = c.campo, ref = F[celdaReferencia(g) * 4 + 3] || 1;
  const pintarCelda = (cel: number, out: THREE.Color, z: number) => {
    if (g.solido[cel]) return false;
    const u = F[4 * cel], w = F[4 * cel + 1], q = F[4 * cel + 2], r = F[4 * cel + 3];
    if (cfg.vereda && z === zVereda(g)) {
      // vereda: la velocidad relativa a la del campo abierto a la misma altura (1 = como en el campo; > 1, más viento)
      const f = Math.hypot(u, w, q) / (c.uIn[z] || UH);
      if (cfg.lawson) { out.set(COL_LAWSON[categoriaLawson(f * u5Peaton()).codigo]); return true; }
      return !!(f <= 1 ? out.copy(blanco).lerp(verde(), f) : out.copy(verde()).lerp(new THREE.Color(css('--elegido', '#ef9f27')), Math.min(1, (f - 1) / 0.6)));
    }
    if (cfg.color === 'cp') return !!colCp((r - ref) / 3 / (0.5 * UH * UH), out);
    return !!colVel(Math.hypot(u, w, q), out);
  };
  // caras de la torre: Cp promediado (si todavía no hay muestras, el instantáneo)
  const colA = v.torre!.geometry.getAttribute('color') as THREE.BufferAttribute, col = new THREE.Color();
  const cpCara = (k: number) => (c.prom.muestras ? c.prom.cp(k) : (F[4 * c.caras[k].celda + 3] - ref) / 3 / (0.5 * UH * UH));
  v.trozos.forEach(t => {
    let s = 0, n = 0;
    for (const k of t.caras) { const cp = cpCara(k); if (isFinite(cp)) { s += cp; n++; } }
    colCp(n ? s / n : NaN, col);
    for (let i = 0; i < t.n; i++) colA.setXYZ(t.desde + i, col.r, col.g, col.b);
  });
  colA.needsUpdate = true;
  // corte horizontal
  v.planoH && (v.esc.remove(v.planoH), (v.planoH.material as THREE.MeshBasicMaterial).map?.dispose());
  v.planoV && (v.esc.remove(v.planoV), (v.planoV.material as THREE.MeshBasicMaterial).map?.dispose());
  v.planoH = v.planoV = null;
  const zc = cfg.vereda ? zVereda(g) : Math.max(1, Math.min(g.nz - 1, Math.round(cfg.zRel * g.H * g.escala + 0.5)));
  if (cfg.horizontal || cfg.vereda) {
    const t = textura(g.nx, g.ny, (i, j, o) => pintarCelda((zc * g.ny + j) * g.nx + i, o, zc), (i, j) => { const cel = (zc * g.ny + j) * g.nx + i; return g.solido[cel] ? null : [F[4 * cel] / UH, F[4 * cel + 1] / UH]; });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(g.nx / g.escala, g.ny / g.escala), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = (zc - 0.5) / g.escala; v.esc.add(m); v.planoH = m;
  }
  if (cfg.vertical) {
    const yc = Math.max(0, Math.min(g.ny - 1, Math.round(cfg.yRel * (g.ny - 1))));
    const t = textura(g.nx, g.nz, (i, j, o) => pintarCelda((j * g.ny + yc) * g.nx + i, o, j), (i, j) => { const cel = (j * g.ny + yc) * g.nx + i; return g.solido[cel] ? null : [F[4 * cel] / UH, F[4 * cel + 2] / UH]; });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(g.nx / g.escala, g.nz / g.escala), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    m.position.set(0, g.nz / g.escala / 2, -((yc + 0.5) - g.ny / 2) / g.escala); v.esc.add(m); v.planoV = m;
  }
  // líneas de corriente, cada tanto
  if (cfg.lineas && performance.now() - c.ultimasLineas > 3000) { c.ultimasLineas = performance.now(); lineasDeCorriente(); }
  if (!cfg.lineas) v.lineas.clear();
  dibujar();
}

const zVereda = (g: Geometria3D) => Math.max(1, Math.ceil(1.5 * g.escala));

function lineasDeCorriente() {
  const c = corrida!, v = vista!, g = c.geo, F = c.campo!;
  v.lineas.children.forEach(o => (o as THREE.Line).geometry.dispose()); v.lineas.clear();
  const vel = (x: number, y: number, z: number): [number, number, number] | null => {
    if (x < 0 || x >= g.nx - 1 || z < 1 || z >= g.nz - 1 || y < 0 || y >= g.ny - 1) return null;
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k;
    let su = 0, sv = 0, sw = 0;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let d = 0; d < 2; d++) {
      const cel = ((k + d) * g.ny + j + b) * g.nx + i + a, ww = (a ? fx : 1 - fx) * (b ? fy : 1 - fy) * (d ? fz : 1 - fz);
      if (g.solido[cel]) continue;
      su += ww * F[4 * cel]; sv += ww * F[4 * cel + 1]; sw += ww * F[4 * cel + 2];
    }
    return [su, sv, sw];
  };
  const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(css('--deformada', '#1d9e75')).multiplyScalar(0.6) });
  const bC = g.caja.y1 - g.caja.y0 + 1, x0 = Math.max(2, g.caja.x0 - bC);
  for (const zr of [0.15, 0.4, 0.65, 0.9, 1.1]) for (let s = -1; s <= 1.001; s += 0.25) {
    let p = [x0, (g.caja.y0 + g.caja.y1 + 1) / 2 + s * bC * 0.95, zr * g.hC + 0.5];
    const pts = [aMundo(g, p[0], p[1], p[2])];
    for (let n = 0; n < 1200; n++) {
      const a = vel(p[0], p[1], p[2]); if (!a) break;
      const m = Math.hypot(...a); if (m < 1e-6) break;
      const hh = 0.6 / m, mid = [p[0] + 0.5 * hh * a[0], p[1] + 0.5 * hh * a[1], p[2] + 0.5 * hh * a[2]];
      const b = vel(mid[0], mid[1], mid[2]); if (!b) break;
      p = [p[0] + hh * b[0], p[1] + hh * b[1], p[2] + hh * b[2]];
      if (n % 2 === 0) pts.push(aMundo(g, p[0], p[1], p[2]));
    }
    if (pts.length > 3) v.lineas.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
}

function dibujar() {
  const v = vista;
  if (!v || !v.cont.isConnected) return;
  const w = Math.max(320, v.cont.clientWidth), hh = Math.round(w * 0.58);
  if (v.ren.domElement.width !== Math.round(w * v.ren.getPixelRatio())) { v.ren.setSize(w, hh); v.cam.aspect = w / hh; v.cam.updateProjectionMatrix(); }
  v.ren.render(v.esc, v.cam);
}

// ------------------------------------------------------------------------------------------------ salvaguardas
/**
 * guardia de estabilidad del 3D (salvaguarda B): la velocidad más alta en unidades de la red y las celdas que se
 * fueron de rango. Si hay alguna, pausa y anota dónde (devuelve true)
 */
function vigilar3d(c: Corrida): boolean {
  const F = c.campo!, g = c.geo; let mx = 0, n = 0, sx = 0, sy = 0, sz = 0;
  for (let cel = 0; cel < g.nx * g.ny * g.nz; cel++) {
    if (g.solido[cel]) continue;
    const r = F[4 * cel + 3], v = Math.hypot(F[4 * cel], F[4 * cel + 1], F[4 * cel + 2]);
    if (!(r > 0.5 && r < 1.5) || !(v === v)) { n++; const x = cel % g.nx, y = Math.floor(cel / g.nx) % g.ny, z = Math.floor(cel / (g.nx * g.ny)); sx += x; sy += y; sz += z; continue; }
    if (v > mx) mx = v;
  }
  c.maxRed = mx;
  if (!n || !SALVAGUARDAS) return false;
  c.roto = `a ${fmt((sz / n - 0.5) / g.escala, 0)} m de altura, ${dondeRespectoTorre({ x: sx / n, y: sy / n }, g.caja, 1 / g.escala)}`;
  c.corriendo = false;
  return true;
}

// ------------------------------------------------------------------------------------------------ llaves de colores
let llaves3d: H | null = null;
/** las llaves de lo que se ve: las caras (Cp) y el corte o la vereda */
function armarLlaves3d() {
  if (!llaves3d) return;
  if (!cfg.llave && !cfg.simbolos) { llaves3d.replaceChildren(); return; }
  const fondo = '#ffffff', az = css('--compresion', '#378add'), ro = css('--traccion', '#e24b4a');
  const caras: Llave = { titulo: 'Caras de la torre: Cp promedio', colores: [ro, fondo, az], marcas: [[0, '≤ −1,2 succiona'], [1.2 / 2.2, '0'], [1, '+1 empuja']] };
  let corte: Llave | null = null;
  if (cfg.vereda && cfg.lawson) corte = { titulo: 'Vereda (1,5 m): confort Lawson', colores: LAWSON_LDDC.map(k => COL_LAWSON[k.codigo]), marcas: [[0, 'A sentarse'], [0.5, 'C parado'], [1, 'E incómodo']] };
  else if (cfg.vereda) corte = { titulo: 'Vereda (1,5 m): viento / campo abierto', colores: [fondo, css('--deformada', '#1d9e75'), css('--elegido', '#ef9f27')], marcas: [[0, '0'], [1 / 1.6, '1 (igual)'], [1, '1,6 más']] };
  else if (cfg.horizontal || cfg.vertical) corte = cfg.color === 'cp'
    ? { titulo: 'Cortes: presión (Cp)', colores: [ro, fondo, az], marcas: [[0, '≤ −1,2 succiona'], [1.2 / 2.2, '0'], [1, '+1 empuja']] }
    : { titulo: 'Cortes: velocidad (V a la altura de la torre)', colores: coloresTermico(), marcas: [[0, 'quieto'], [0.5, '0,8 V'], [1, '≥ 1,6 V']] };
  // las flechas: si el corte ya va en velocidad, su llave sirve; si no, una aparte arriba a la derecha
  const conCortes = cfg.horizontal || cfg.vertical || cfg.vereda;
  let flechas: Llave | null = null;
  if (conCortes && cfg.flechas === 'fijas' && (cfg.vereda || cfg.color === 'cp')) flechas = { titulo: 'Flechas: el color dice la velocidad', colores: coloresTermico(), marcas: [[0, 'quieta'], [0.5, '0,8 V'], [1, '≥ 1,6 V']] };
  else if (conCortes && cfg.flechas === 'proporcionales') flechas = { titulo: 'Flechas: el largo dice la velocidad', colores: ['#f4f4f4', '#1d1d24'], marcas: [[0, 'corta: lenta'], [1, 'una separación: 1,6 V']] };
  const lf = flechas ? llaveHtml(flechas) : null; lf?.classList.add('derecha');
  // qué quiere decir cada marca: las flechas, las líneas de corriente y los anillos
  const sim: Simbolo[] = [];
  if (conCortes && cfg.flechas === 'fijas') sim.push({ forma: 'flecha', color: cfg.vereda || cfg.color === 'cp' ? '#9a5aa8' : undefined, texto: 'Flecha: hacia dónde va el aire en el corte',
    nota: cfg.vereda || cfg.color === 'cp' ? 'todas del mismo largo; el color da la velocidad' : 'todas del mismo largo; la velocidad la da el color del corte' });
  else if (conCortes && cfg.flechas === 'proporcionales') sim.push({ forma: 'flecha', texto: 'Flecha: hacia dónde va el aire en el corte', nota: 'más larga, más rápido (una separación = 1,6 V)' });
  if (conCortes && cfg.flechas !== 'no') sim.push({ forma: 'flechaCorta', texto: 'Solo se ve lo que va por el plano del corte', nota: 'el aire que lo atraviesa no aparece en la flecha' });
  if (cfg.lineas) sim.push({ forma: 'lineaGruesa', color: new THREE.Color(css('--deformada', '#1d9e75')).multiplyScalar(0.6).getStyle(), texto: 'Línea de corriente: el camino del aire' });
  const ls = sim.length && cfg.simbolos ? simbolosHtml('Símbolos del dibujo', sim, '#223344', fondo) : null;
  llaves3d.replaceChildren(...(cfg.llave ? [llaveHtml(caras), ...(corte ? [llaveHtml(corte)] : []), ...(lf ? [lf] : [])] : []), ...(ls ? [ls] : []));
}

// ------------------------------------------------------------------------------------------------ centro y panel
export function centroTunel3d(c: H, _tam: Tam) {
  c.append(h('p', { class: 'cartel-tunel' }, 'Visualización didáctica: no reemplaza los coeficientes del CIRSOC 102 ni un ensayo en túnel de viento.'));
  if (soporteGpu === undefined) {
    c.append(h('p', { class: 'nota' }, 'Buscando la placa de video…'));
    void import('../viento/lbm3dGpu').then(m => m.hayWebGpu()).then(r => { soporteGpu = r; estado.avisarPanel(); });
    return;
  }
  if (soporteGpu === null && cfg.motor !== 'procesador') {
    const b = h('button', { type: 'button', class: 'boton' }, 'Ir al túnel 2D');
    const cpu = h('button', { type: 'button', class: 'boton' }, 'Simular con el procesador (más lento)');
    cpu.addEventListener('click', () => { cfg.motor = 'procesador'; estado.avisarPanel(); });
    b.addEventListener('click', () => { estado.sub.viento = 'Túnel 2D'; estado.avisarPanel(); });
    c.append(h('p', { class: 'aviso-viejo' }, 'Este navegador no tiene WebGPU, la placa de video del túnel 3D (Chrome y Edge sí; Safari desde la versión 26; Firefox, todavía no en Linux, Android ni Mac con Intel). Se puede simular igual con el procesador, con una grilla gruesa (0,1 millones de celdas) y bastante más lento: una pasada del aire tarda alrededor de un minuto. El túnel 2D funciona en cualquier navegador.'), h('div', { class: 'fila-acciones' }, cpu, b));
    return;
  }
  if (!corrida || corrida.clave !== claveCorrida()) { void iniciar(); }
  const cr = corrida!;
  if (cr.cargando) { c.append(h('p', { class: 'nota' }, cfg.motor === 'procesador' ? 'Preparando la torre…' : 'Preparando la torre y la placa de video…')); return; }
  if (cr.error) { c.append(h('p', { class: 'aviso-viejo' }, `No se pudo arrancar el túnel 3D: ${cr.error}`)); return; }
  if (cr.roto) {
    const b = h('button', { type: 'button', class: 'boton' }, cfg.lento ? 'Empezar de nuevo' : 'Empezar de nuevo con el túnel lento');
    b.addEventListener('click', () => { cfg.lento = true; void iniciar(); estado.avisarPanel(); });
    c.append(h('p', { class: 'aviso-viejo' }, `La simulación se volvió inestable ${cr.roto} y quedó en pausa (con la imagen así no se puede leer nada). Pasa cuando el aire se acelera más de lo que el método aguanta, en esquinas vivas con la grilla gruesa. ${cfg.lento ? 'Probá otra grilla o paredes en escalera.' : 'El túnel lento suele alcanzar.'}`), b);
  }
  const marco = h('div', { class: 'tunel-marco tunel3d' });
  llaves3d = h('div', {}); marco.append(llaves3d); armarLlaves3d();
  c.append(marco);
  armarVista(marco);
  if (!cr.corriendo && cr.sinMirar > 30) { cr.sinMirar = 0; cr.corriendo = true; requestAnimationFrame(ciclo); }
  const g = cr.geo;
  c.append(h('p', { class: 'nota' }, `${cfg.motor === 'procesador' ? 'Simulado con el procesador (sin placa de video), grilla gruesa. ' : ''}${g.vecinos.length ? `Con ${g.vecinos.length} edificios vecinos (en gris: el Cp y las caras son solo de la torre; túnel lento). ` : ''}Torre de ${fmt(g.H, 1)} m (${g.hC} celdas de alto, ${fmt(1 / g.escala, 2)} m por celda) · viento ${estado.dir}${cfg.angulo ? ` girado ${cfg.angulo}°` : ''} entrando por la izquierda, con el perfil del CIRSOC 102-25 (exposición ${datos102De(estado.proyecto).exposicion}) · ancho ${fmt(g.B, 1)} m, largo ${fmt(g.L, 1)} m · paredes ${cfg.paredes === 'exactas' ? `exactas: el aire choca con la planta real de cada piso (${g.paredes.celdas.length} celdas de pared con su corte exacto)` : 'en escalera: la pared es el borde de las celdas'}. Caras: Cp promediado en el tiempo, azul la que empuja (comprime) y rojo la que succiona (tracciona). ${cfg.vereda ? (cfg.lawson ? 'Vereda: confort del peatón a 1,5 m, de verde claro (A, para sentarse) a marrón (E, incómodo); los porcentajes, en el panel.' : 'Vereda: velocidad a 1,5 m relativa al campo abierto (blanco quieto, verde igual, ámbar más viento).') : cfg.color === 'cp' ? 'Cortes: Cp instantáneo.' : 'Cortes: velocidad con el espectro térmico, de violeta muy oscuro (quieto) a amarillo claro (1,6 veces la de la altura de la torre o más).'} Girá con el mouse.`));
  dibujar();
}

export function panelTunel3d(c: H) {
  const cambiar = (f: () => void, rehacer = false) => { f(); if (rehacer) estado.avisarPanel(); else { actualizarCampo(); estado.avisarPanel(); } };
  const sel = <T extends string>(rot: string, ops: [T, string][], val: T, al: (x: T) => void, rehacer = false) => {
    const s = h('select', {}) as HTMLSelectElement;
    ops.forEach(([v, t]) => s.append(new Option(t, v, false, v === val)));
    s.addEventListener('change', () => cambiar(() => al(s.value as T), rehacer));
    return h('label', { class: 'campo' }, h('span', {}, rot), s);
  };
  const rango = (rot: string, val: number, al: (x: number) => void) => {
    const i = h('input', { type: 'range', min: '0', max: '1', step: '0.02', value: String(val) }) as HTMLInputElement;
    i.addEventListener('input', () => { al(+i.value); actualizarCampo(); });
    return h('label', { class: 'campo' }, h('span', {}, rot), i);
  };
  const chk = (rot: string, val: boolean, al: (x: boolean) => void) => {
    const l = h('label', { class: 'campo-linea' }, h('input', { type: 'checkbox', ...(val ? { checked: '' } : {}) }), ` ${rot}`);
    l.querySelector('input')!.addEventListener('change', e => { al((e.target as HTMLInputElement).checked); actualizarCampo(); actualizarPanel(true); });
    return l;
  };
  c.append(h('p', { class: 'nota' }, 'La torre entera dentro de un túnel de viento 3D, con el viento que crece con la altura como en el CIRSOC 102-25. Se ve cómo baja el aire por la cara de barlovento, cómo se despega en las esquinas y la estela detrás; el Cp de cada cara se promedia en el tiempo y se compara con el del reglamento. Usa la placa de video (WebGPU); sin ella, el procesador con una grilla gruesa. Didáctico: no cambia ningún número.'));
  const play = h('button', { type: 'button', class: 'boton' }, corrida && !corrida.corriendo ? '▶ Seguir' : '⏸ Pausa');
  play.addEventListener('click', () => { if (!corrida) return; corrida.corriendo = !corrida.corriendo; if (corrida.corriendo) requestAnimationFrame(ciclo); estado.avisarPanel(); });
  const reini = h('button', { type: 'button', class: 'boton' }, '↺ Empezar de nuevo');
  reini.addEventListener('click', () => { void iniciar(); });
  c.append(h('div', { class: 'fila-acciones' }, play, reini));
  const d = seccion('Túnel 3D').cuerpo; c.append(d.parentElement!);
  d.append(h('div', { class: 'grilla2' },
    sel('Velocidad del túnel', [['normal', 'normal (0,08 de la red)'], ['lento', 'lenta (0,05: más estable, tarda más)']], cfg.lento ? 'lento' : 'normal', x => { cfg.lento = x === 'lento'; }, true),
    sel('Motor', [['placa', soporteGpu === null ? 'placa de video (no hay WebGPU)' : 'placa de video (WebGPU)'], ['procesador', 'procesador (sin placa, más lento)']], cfg.motor, x => { cfg.motor = x as 'placa' | 'procesador'; }, true),
    cfg.motor === 'procesador' ? h('label', { class: 'campo' }, h('span', {}, 'Grilla'), h('span', { class: 'nota chica' }, TAM_CPU.texto)) : sel('Grilla', Object.entries(TAM).map(([k, v]) => [k, v.texto] as [string, string]), cfg.tam, x => { cfg.tam = x; }, true),
    sel('Paredes', [['exactas', 'exactas: la planta real de cada piso (rebote interpolado + TRT)'], ['escalera', 'en escalera (como antes, para comparar)']], cfg.paredes, x => { cfg.paredes = x as 'exactas' | 'escalera'; }, true),
    sel('Giro del viento', ['-45', '-30', '-15', '0', '15', '30', '45'].map(a => [a, a === '0' ? `0° (viento ${estado.dir})` : `${a}°`] as [string, string]), String(cfg.angulo), x => { cfg.angulo = +x; }, true),
    sel('Color de los cortes', [['velocidad', 'velocidad'], ['cp', 'presión (Cp)']], cfg.color, x => { cfg.color = x; }),
    rango('Altura del corte horizontal', cfg.zRel, x => { cfg.zRel = x; }),
    rango('Posición del corte vertical', cfg.yRel, x => { cfg.yRel = x; }),
  ),
  ...((estado.proyecto.contexto?.edificios.length ?? 0) ? [(() => {
    const l = h('label', { class: 'campo-linea' }, h('input', { type: 'checkbox', ...(cfg.contexto ? { checked: '' } : {}) }), ` Con los edificios vecinos (${estado.proyecto.contexto!.edificios.length}, del contexto urbano: se arman en el túnel 2D)`);
    l.querySelector('input')!.addEventListener('change', e => { cfg.contexto = (e.target as HTMLInputElement).checked; estado.avisarPanel(); });
    return l;
  })()] : []),
  chk('Viento en la vereda (1,5 m)', cfg.vereda, x => { cfg.vereda = x; }),
  chk('Vereda con el confort del peatón (Lawson)', cfg.lawson, x => { cfg.lawson = x; }), (() => {
    const i = h('input', { type: 'text', inputmode: 'decimal', value: String(cfg.vientoMedio).replace('.', ','), class: 'n' }) as HTMLInputElement;
    i.addEventListener('change', () => { const v = parseFloat(i.value.replace(',', '.')); if (v > 0 && v < 30) { cfg.vientoMedio = v; actualizarCampo(); actualizarPanel(true); } else i.value = String(cfg.vientoMedio).replace('.', ','); });
    return h('label', { class: 'campo' }, h('span', {}, 'Viento medio anual del lugar a 10 m (m/s, estación meteorológica)'), i);
  })(),
  h('p', { class: 'nota' }, 'El viento A o B es el del selector de arriba. La grilla, las paredes y el giro empiezan la simulación de nuevo; los cortes y los colores, no.'));
  {
    const stl = h('button', { type: 'button', class: 'boton' }, '⤓ La torre en STL (piso por piso)');
    stl.addEventListener('click', () => {
      const b = new Blob([stlTorre(nivelesProyecto())], { type: 'model/stl' }), a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = `torre_${(estado.proyecto.nombre || 'proyecto').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '_').replace(/^_|_$/g, '')}.stl`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
    d.append(h('div', { class: 'fila-acciones' }, stl), h('p', { class: 'nota chica' }, 'Un prisma cerrado por piso con la planta que rige en ese piso (la carpintería o la losa), en metros y con z hacia arriba: para imprimir en 3D o llevar la forma a un programa de CAD o a otro simulador de viento.'));
  }
  // «Qué se dibuja»: cada capa se prende y se apaga sin volver a simular
  const qd = seccion('Qué se dibuja').cuerpo; c.append(qd.parentElement!);
  {
    const estilo = h('select', { 'aria-label': 'Estilo de las flechas' }) as HTMLSelectElement;
    ([['fijas', 'del mismo largo (el color dice la velocidad)'], ['proporcionales', 'el largo dice la velocidad']] as const).forEach(([v, t]) => estilo.append(new Option(t, v, false, v === cfg.estiloFlechas)));
    estilo.addEventListener('change', () => { cfg.estiloFlechas = estilo.value as 'fijas' | 'proporcionales'; if (cfg.flechas !== 'no') cfg.flechas = cfg.estiloFlechas; actualizarCampo(); });
    if (cfg.flechas === 'no') estilo.setAttribute('disabled', '');
    const capa = (rot: string, val: boolean, al: (x: boolean) => void, extra?: H) => {
      const l = chk(rot, val, x => { al(x); if (corrida) corrida.ultimasLineas = 0; estado.avisarPanel(); });
      return extra ? h('div', { class: 'capa-con-opcion' }, l, extra) : l;
    };
    const todo = (x: boolean) => { cfg.flechas = x ? cfg.estiloFlechas : 'no'; cfg.lineas = x; cfg.horizontal = x; cfg.vertical = x; cfg.llave = x; cfg.simbolos = x; if (corrida) corrida.ultimasLineas = 0; actualizarCampo(); estado.avisarPanel(); };
    const bTodo = h('button', { type: 'button', class: 'mini' }, 'Todo'), bNada = h('button', { type: 'button', class: 'mini' }, 'Nada');
    bTodo.addEventListener('click', () => todo(true)); bNada.addEventListener('click', () => todo(false));
    qd.append(h('div', { class: 'fila-acciones' }, bTodo, bNada),
      capa('Corte horizontal', cfg.horizontal, x => { cfg.horizontal = x; }), capa('Corte vertical', cfg.vertical, x => { cfg.vertical = x; }),
      capa('Flechas de la velocidad en los cortes', cfg.flechas !== 'no', x => { cfg.flechas = x ? cfg.estiloFlechas : 'no'; }, estilo),
      capa('Líneas de corriente', cfg.lineas, x => { cfg.lineas = x; }),
      capa('Llaves de colores sobre la vista', cfg.llave, x => { cfg.llave = x; }),
      capa('Símbolos del dibujo (qué es cada flecha, línea y marca)', cfg.simbolos, x => { cfg.simbolos = x; }),
      h('p', { class: 'nota chica' }, 'Prender o apagar capas no vuelve a simular.'));
  }
  const m = seccion('Lo que se mide').cuerpo; c.append(m.parentElement!);
  panelEstado = h('div', {}); m.append(panelEstado);
  actualizarPanel(true);
}

let ultimoPanel = 0;
function actualizarPanel(forzar = false) {
  const el = panelEstado, c = corrida;
  if (!el?.isConnected) return;
  if (!forzar && performance.now() - ultimoPanel < 800) return;
  ultimoPanel = performance.now();
  if (!c || !c.gpu) { el.replaceChildren(h('p', { class: 'nota' }, soporteGpu === null && cfg.motor !== 'procesador' ? 'Sin WebGPU: elegí el procesador como motor.' : 'Arrancando…')); return; }
  const g = c.geo, pasadas = (c.gpu.pasos * UH) / g.nx, reg = cpReglamento(g), cp = c.prom.porCara();
  const nombres: [Cara, string][] = [['barlovento', 'Barlovento'], ['lateral', 'Laterales'], ['sotavento', 'Sotavento'], ['cubierta', 'Cubierta']];
  const tabla = h('table', { class: 'tabla' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Cara'), h('th', {}, 'Cp simulación'), h('th', {}, 'Cp CIRSOC 102-25'))),
    h('tbody', {}, ...nombres.map(([k, t]) => h('tr', {}, h('td', {}, t), h('td', { class: 'n' }, c.prom.muestras ? fmt(cp[k], 2) : '…'), h('td', { class: 'n' }, reg[k] === null ? '—' : fmt(reg[k]!, 2))))));
  // vereda: el mayor factor de viento a 1,5 m
  let vereda = '', lawson: H | null = null;
  if (c.campo) {
    const z = zVereda(g); let max = 0;
    for (let y = 0; y < g.ny; y++) for (let x = 2; x < g.nx - 2; x++) { const cel = (z * g.ny + y) * g.nx + x; if (g.solido[cel]) continue; max = Math.max(max, Math.hypot(c.campo[4 * cel], c.campo[4 * cel + 1], c.campo[4 * cel + 2]) / (c.uIn[z] || UH)); }
    vereda = `En la vereda (1,5 m), el viento llega a ${fmt(max, 2)} veces el del campo abierto a esa altura (esquinas y bajada por la cara de barlovento).`;
    if (cfg.vereda && cfg.lawson) {
      // confort: qué parte de la vereda (alrededor de la torre) cae en cada categoría Lawson LDDC
      const cuenta: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 }; let n = 0;
      const x0 = Math.max(2, g.caja.x0 - (g.caja.x1 - g.caja.x0)), x1 = Math.min(g.nx - 2, g.caja.x1 + 2 * (g.caja.x1 - g.caja.x0)), y0 = Math.max(0, g.caja.y0 - (g.caja.y1 - g.caja.y0)), y1 = Math.min(g.ny - 1, g.caja.y1 + (g.caja.y1 - g.caja.y0));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const cel = (z * g.ny + y) * g.nx + x; if (g.solido[cel]) continue; n++; cuenta[categoriaLawson((Math.hypot(c.campo[4 * cel], c.campo[4 * cel + 1], c.campo[4 * cel + 2]) / (c.uIn[z] || UH)) * u5Peaton()).codigo]++; }
      lawson = h('div', {}, h('p', { class: 'llave' }, `Confort del peatón (Lawson LDDC, 5 % del tiempo) alrededor de la torre, con ${fmt(cfg.vientoMedio, 1)} m/s de viento medio anual: en campo abierto, a 1,5 m, se superan ${fmt(u5Peaton(), 1)} m/s el 5 % del tiempo.`),
        h('div', { class: 'leyenda' }, ...LAWSON_LDDC.map(k => { const sp = h('span', {}); const i = h('i', { class: 'caja' }); i.style.background = COL_LAWSON[k.codigo]; sp.append(i, `${k.codigo} ${k.texto}${isFinite(k.hasta) ? ` (≤ ${fmt(k.hasta, 1)} m/s)` : ''}: ${n ? fmt((100 * cuenta[k.codigo]) / n, 0) : '—'} %`); return sp; })),
        h('p', { class: 'nota chica' }, 'Supone vientos de Rayleigh (Weibull k = 2) con el viento medio del lugar, el perfil del 102-25 para bajar a 1,5 m y la dirección simulada todo el año. Un estudio de confort real usa la rosa de vientos de la estación y todas las direcciones.'));
    }
  }
  // guardia de estabilidad (salvaguarda B): aviso cuando el aire se acerca al límite del método
  const aviso: H[] = [];
  if (SALVAGUARDAS && c.maxRed > AVISO_RED && !c.roto) {
    const b = h('button', { type: 'button', class: 'boton' }, 'Usar el túnel lento y empezar de nuevo');
    b.addEventListener('click', () => { cfg.lento = true; void iniciar(); estado.avisarPanel(); });
    aviso.push(h('p', { class: 'aviso-linea' }, `El aire llega a ${fmt(c.maxRed, 2)} en unidades de la red (${c.maxRed > CRITICO_RED ? 'muy cerca del' : 'cerca del'} límite del método, ≈ ${fmt(CRITICO_RED, 2)}): puede volverse inestable.`), ...(cfg.lento ? [] : [b]));
  }
  el.replaceChildren(
    ...aviso,
    h('div', { class: 'kpis' },
      kpi('Tiempo', fmt(pasadas, 1), `pasadas del aire por el túnel (${c.gpu.pasos} pasos)${c.corriendo ? '' : ' · en pausa'}`),
      kpi(cfg.motor === 'procesador' ? 'Procesador' : 'Placa de video', `${fmt(c.mlups, c.mlups < 10 ? 1 : 0)} M/s`, 'millones de celdas por segundo'),
    ),
    tabla,
    ...(lawson ? [lawson] : []),
    h('p', { class: 'nota' }, `${c.prom.muestras ? `Cp promediado en ${c.prom.muestras} muestras (desde la primera pasada del aire), con qh de la altura de la torre y la presión de referencia aguas arriba.` : 'El Cp se empieza a promediar después de la primera pasada del aire.'} El reglamento da valores de diseño de un edificio aislado; la simulación, con la planta real, una sola dirección y un Reynolds de red ≈ ${fmt(RE, 0)}, da el orden de magnitud: en barlovento se parecen; en los costados y sotavento la simulación suele dar más succión. ${vereda}`),
  );
}

/** al cambiar de proyecto o cerrar: suelta la placa */
export function detenerTunel3d() { detener(); }
