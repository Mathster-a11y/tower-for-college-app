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

const TAM: Record<string, { nx: number; ny: number; nz: number; texto: string }> = {
  rapida: { nx: 96, ny: 48, nz: 40, texto: 'rápida (96 × 48 × 40, 0,2 M celdas: gruesa)' },
  liviano: { nx: 160, ny: 80, nz: 64, texto: 'liviana (160 × 80 × 64, 0,8 M celdas)' },
  fino: { nx: 256, ny: 128, nz: 96, texto: 'fina (256 × 128 × 96, 3,1 M celdas: placa potente)' },
};
const UH = 0.08, RE = 5000, CS = 0.17;
const css = (v: string, def: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || def;

const cfg = { tam: 'liviano', angulo: 0, color: 'velocidad' as 'velocidad' | 'cp', zRel: 0.5, yRel: 0.5, lineas: true, vereda: false, horizontal: true, vertical: false };

interface Corrida {
  clave: string; geo: Geometria3D; uIn: Float32Array; gpu: Lbm3dGpu | null; error: string | null; cargando: boolean;
  prom: PromedioCp; caras: ReturnType<typeof celdasDeCara>; campo: Float32Array | null;
  corriendo: boolean; ocupado: boolean; k: number; mlups: number; ultimoCampo: number; ultimasLineas: number; sinMirar: number;
}
let corrida: Corrida | null = null;
let soporteGpu: string | null | undefined;                    // undefined: todavía no se preguntó
let vista: { cont: HTMLElement; ren: THREE.WebGLRenderer; esc: THREE.Scene; cam: THREE.PerspectiveCamera; ctl: OrbitControls; torre: THREE.Mesh | null; planoH: THREE.Mesh | null; planoV: THREE.Mesh | null; lineas: THREE.Group; clave: string } | null = null;
let panelEstado: H | null = null;

// ------------------------------------------------------------------------------------------------ corrida
function claveCorrida() { return JSON.stringify([estado.revision, estado.dir, cfg.tam, cfg.angulo]); }

function nivelesProyecto() {
  const p = estado.proyecto, iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1), zPB = p.niveles[iPB]?.cota ?? 0;
  return p.niveles.map((n, i) => ({ n, i })).filter(x => x.n.cota > zPB).map(x => ({ cota: x.n.cota - zPB, silueta: puntosSilueta(contornoAlViento(p, x.i).v, 12) }));
}

async function iniciar() {
  detener();
  const T = TAM[cfg.tam];
  const geo = geometria3D({ niveles: nivelesProyecto(), dir: estado.dir, angulo: cfg.angulo, nx: T.nx, ny: T.ny, nz: T.nz });
  const exp = datos102De(estado.proyecto).exposicion;
  const uIn = perfil102(T.nz, geo.escala, geo.H, exp, UH);
  const caras = celdasDeCara(geo);
  const c: Corrida = { clave: claveCorrida(), geo, uIn, gpu: null, error: null, cargando: true, prom: new PromedioCp(caras, UH, celdaReferencia(geo)), caras, campo: null,
    corriendo: true, ocupado: false, k: 10, mlups: 0, ultimoCampo: 0, ultimasLineas: 0, sinMirar: 0 };
  corrida = c;
  try {
    const { crearLbm3dGpu } = await import('../viento/lbm3dGpu');
    const anchoC = geo.B * geo.escala;
    const gpu = await crearLbm3dGpu({ nx: T.nx, ny: T.ny, nz: T.nz, nu: (UH * anchoC) / RE, cs: CS, uIn, solido: geo.solido });
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
const colVel = (s: number, out: THREE.Color) => out.copy(blanco).lerp(verde(), Math.min(1, s / (1.3 * UH)));
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
  // la torre: una cara por celda de cara, con el color del Cp de la celda de aire pegada
  const pos: number[] = [];
  for (const f of c.caras) {
    // la cara está entre la celda de aire y el sólido vecino (en −normal)
    const { x, y, z } = f, q: THREE.Vector3[] = [];
    if (f.nx !== 0) { const xf = f.nx < 0 ? x + 1 : x; q.push(aMundo(g, xf, y, z - 1), aMundo(g, xf, y + 1, z - 1), aMundo(g, xf, y + 1, z), aMundo(g, xf, y, z)); }
    else if (f.ny !== 0) { const yf = f.ny < 0 ? y + 1 : y; q.push(aMundo(g, x, yf, z - 1), aMundo(g, x + 1, yf, z - 1), aMundo(g, x + 1, yf, z), aMundo(g, x, yf, z)); }
    else { const zf = z - 1; q.push(aMundo(g, x, y, zf), aMundo(g, x + 1, y, zf), aMundo(g, x + 1, y + 1, zf), aMundo(g, x, y + 1, zf)); }
    [0, 1, 2, 0, 2, 3].forEach(k => pos.push(q[k].x, q[k].y, q[k].z));
  }
  const gt = new THREE.BufferGeometry();
  gt.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  gt.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(0.8), 3));
  gt.computeVertexNormals();
  const torre = new THREE.Mesh(gt, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }));
  esc.add(torre);
  const lineas = new THREE.Group(); esc.add(lineas);
  vista = { cont, ren, esc, cam, ctl, torre, planoH: null, planoV: null, lineas, clave: c.clave };
  cont.append(ren.domElement);
  ctl.addEventListener('change', () => dibujar());
}

function textura(ancho: number, alto: number, pintar: (i: number, j: number, out: THREE.Color) => boolean) {
  const cv = document.createElement('canvas'); cv.width = ancho; cv.height = alto;
  const g = cv.getContext('2d')!, img = g.createImageData(ancho, alto), col = new THREE.Color();
  for (let j = 0; j < alto; j++) for (let i = 0; i < ancho; i++) {
    const k = 4 * ((alto - 1 - j) * ancho + i);
    if (!pintar(i, j, col)) { img.data[k] = 52; img.data[k + 1] = 58; img.data[k + 2] = 70; img.data[k + 3] = 255; continue; }
    img.data[k] = col.r * 255; img.data[k + 1] = col.g * 255; img.data[k + 2] = col.b * 255; img.data[k + 3] = 235;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.LinearFilter; return t;
}

function actualizarCampo() {
  const c = corrida, v = vista;
  if (!c || !v || !c.campo) return;
  const g = c.geo, F = c.campo, ref = F[celdaReferencia(g) * 4 + 3] || 1;
  const pintarCelda = (cel: number, out: THREE.Color, z: number) => {
    if (g.solido[cel]) return false;
    const u = F[4 * cel], w = F[4 * cel + 1], q = F[4 * cel + 2], r = F[4 * cel + 3];
    if (cfg.vereda && z === zVereda(g)) {
      // vereda: la velocidad relativa a la del campo abierto a la misma altura (1 = como en el campo; > 1, más viento)
      const f = Math.hypot(u, w, q) / (c.uIn[z] || UH);
      return !!(f <= 1 ? out.copy(blanco).lerp(verde(), f) : out.copy(verde()).lerp(new THREE.Color(css('--elegido', '#ef9f27')), Math.min(1, (f - 1) / 0.6)));
    }
    if (cfg.color === 'cp') return !!colCp((r - ref) / 3 / (0.5 * UH * UH), out);
    return !!colVel(Math.hypot(u, w, q), out);
  };
  // caras de la torre: Cp promediado (si todavía no hay muestras, el instantáneo)
  const colA = v.torre!.geometry.getAttribute('color') as THREE.BufferAttribute, col = new THREE.Color();
  c.caras.forEach((f, k) => {
    const cp = c.prom.muestras ? c.prom.cp(k) : (F[4 * f.celda + 3] - ref) / 3 / (0.5 * UH * UH);
    colCp(cp, col);
    for (let s = 0; s < 6; s++) colA.setXYZ(6 * k + s, col.r, col.g, col.b);
  });
  colA.needsUpdate = true;
  // corte horizontal
  v.planoH && (v.esc.remove(v.planoH), (v.planoH.material as THREE.MeshBasicMaterial).map?.dispose());
  v.planoV && (v.esc.remove(v.planoV), (v.planoV.material as THREE.MeshBasicMaterial).map?.dispose());
  v.planoH = v.planoV = null;
  const zc = cfg.vereda ? zVereda(g) : Math.max(1, Math.min(g.nz - 1, Math.round(cfg.zRel * g.H * g.escala + 0.5)));
  if (cfg.horizontal || cfg.vereda) {
    const t = textura(g.nx, g.ny, (i, j, o) => pintarCelda((zc * g.ny + j) * g.nx + i, o, zc));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(g.nx / g.escala, g.ny / g.escala), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = (zc - 0.5) / g.escala; v.esc.add(m); v.planoH = m;
  }
  if (cfg.vertical) {
    const yc = Math.max(0, Math.min(g.ny - 1, Math.round(cfg.yRel * (g.ny - 1))));
    const t = textura(g.nx, g.nz, (i, j, o) => pintarCelda((j * g.ny + yc) * g.nx + i, o, j));
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

// ------------------------------------------------------------------------------------------------ centro y panel
export function centroTunel3d(c: H, _tam: Tam) {
  c.append(h('p', { class: 'cartel-tunel' }, 'Visualización didáctica: no reemplaza los coeficientes del CIRSOC 102 ni un ensayo en túnel de viento.'));
  if (soporteGpu === undefined) {
    c.append(h('p', { class: 'nota' }, 'Buscando la placa de video…'));
    void import('../viento/lbm3dGpu').then(m => m.hayWebGpu()).then(r => { soporteGpu = r; estado.avisarPanel(); });
    return;
  }
  if (soporteGpu === null) {
    const b = h('button', { type: 'button', class: 'boton' }, 'Ir al túnel 2D');
    b.addEventListener('click', () => { estado.sub.viento = 'Túnel 2D'; estado.avisarPanel(); });
    c.append(h('p', { class: 'aviso-viejo' }, 'Este navegador no tiene WebGPU, que hace falta para el túnel 3D (Chrome y Edge sí; Safari desde la versión 26; Firefox, todavía no en Linux, Android ni Mac con Intel). El túnel 2D funciona en cualquier navegador.'), b);
    return;
  }
  if (!corrida || corrida.clave !== claveCorrida()) { void iniciar(); }
  const cr = corrida!;
  if (cr.cargando) { c.append(h('p', { class: 'nota' }, 'Preparando la torre y la placa de video…')); return; }
  if (cr.error) { c.append(h('p', { class: 'aviso-viejo' }, `No se pudo arrancar el túnel 3D: ${cr.error}`)); return; }
  const marco = h('div', { class: 'tunel-marco tunel3d' });
  c.append(marco);
  armarVista(marco);
  if (!cr.corriendo && cr.sinMirar > 30) { cr.sinMirar = 0; cr.corriendo = true; requestAnimationFrame(ciclo); }
  const g = cr.geo;
  c.append(h('p', { class: 'nota' }, `Torre de ${fmt(g.H, 1)} m (${g.hC} celdas de alto, ${fmt(1 / g.escala, 2)} m por celda) · viento ${estado.dir}${cfg.angulo ? ` girado ${cfg.angulo}°` : ''} entrando por la izquierda, con el perfil del CIRSOC 102-25 (exposición ${datos102De(estado.proyecto).exposicion}) · ancho ${fmt(g.B, 1)} m, largo ${fmt(g.L, 1)} m. Caras: Cp promediado en el tiempo, azul la que empuja (comprime) y rojo la que succiona (tracciona). ${cfg.vereda ? 'Vereda: velocidad a 1,5 m relativa al campo abierto (blanco quieto, verde igual, ámbar más viento).' : cfg.color === 'cp' ? 'Cortes: Cp instantáneo.' : 'Cortes: velocidad, de blanco (quieto) a verde (1,3 veces la de la altura de la torre).'} Girá con el mouse.`));
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
    l.querySelector('input')!.addEventListener('change', e => { al((e.target as HTMLInputElement).checked); actualizarCampo(); });
    return l;
  };
  c.append(h('p', { class: 'nota' }, 'La torre entera dentro de un túnel de viento 3D, con el viento que crece con la altura como en el CIRSOC 102-25. Se ve cómo baja el aire por la cara de barlovento, cómo se despega en las esquinas y la estela detrás; el Cp de cada cara se promedia en el tiempo y se compara con el del reglamento. Necesita la placa de video (WebGPU). Didáctico: no cambia ningún número.'));
  const play = h('button', { type: 'button', class: 'boton' }, corrida && !corrida.corriendo ? '▶ Seguir' : '⏸ Pausa');
  play.addEventListener('click', () => { if (!corrida) return; corrida.corriendo = !corrida.corriendo; if (corrida.corriendo) requestAnimationFrame(ciclo); estado.avisarPanel(); });
  const reini = h('button', { type: 'button', class: 'boton' }, '↺ Empezar de nuevo');
  reini.addEventListener('click', () => { void iniciar(); });
  c.append(h('div', { class: 'fila-acciones' }, play, reini));
  const d = seccion('Túnel 3D').cuerpo; c.append(d.parentElement!);
  d.append(h('div', { class: 'grilla2' },
    sel('Grilla', Object.entries(TAM).map(([k, v]) => [k, v.texto] as [string, string]), cfg.tam, x => { cfg.tam = x; }, true),
    sel('Giro del viento', ['-45', '-30', '-15', '0', '15', '30', '45'].map(a => [a, a === '0' ? `0° (viento ${estado.dir})` : `${a}°`] as [string, string]), String(cfg.angulo), x => { cfg.angulo = +x; }, true),
    sel('Color de los cortes', [['velocidad', 'velocidad'], ['cp', 'presión (Cp)']], cfg.color, x => { cfg.color = x; }),
    rango('Altura del corte horizontal', cfg.zRel, x => { cfg.zRel = x; }),
    rango('Posición del corte vertical', cfg.yRel, x => { cfg.yRel = x; }),
  ),
  chk('Corte horizontal', cfg.horizontal, x => { cfg.horizontal = x; }), chk('Corte vertical', cfg.vertical, x => { cfg.vertical = x; }),
  chk('Líneas de corriente', cfg.lineas, x => { cfg.lineas = x; if (corrida) corrida.ultimasLineas = 0; }),
  chk('Viento en la vereda (1,5 m)', cfg.vereda, x => { cfg.vereda = x; }),
  h('p', { class: 'nota' }, 'El viento A o B es el del selector de arriba. La grilla y el giro empiezan la simulación de nuevo; los cortes y los colores, no.'));
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
  if (!c || !c.gpu) { el.replaceChildren(h('p', { class: 'nota' }, soporteGpu === null ? 'Sin WebGPU no hay túnel 3D.' : 'Arrancando…')); return; }
  const g = c.geo, pasadas = (c.gpu.pasos * UH) / g.nx, reg = cpReglamento(g), cp = c.prom.porCara();
  const nombres: [Cara, string][] = [['barlovento', 'Barlovento'], ['lateral', 'Laterales'], ['sotavento', 'Sotavento'], ['cubierta', 'Cubierta']];
  const tabla = h('table', { class: 'tabla' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Cara'), h('th', {}, 'Cp simulación'), h('th', {}, 'Cp CIRSOC 102-25'))),
    h('tbody', {}, ...nombres.map(([k, t]) => h('tr', {}, h('td', {}, t), h('td', { class: 'n' }, c.prom.muestras ? fmt(cp[k], 2) : '…'), h('td', { class: 'n' }, reg[k] === null ? '—' : fmt(reg[k]!, 2))))));
  // vereda: el mayor factor de viento a 1,5 m
  let vereda = '';
  if (c.campo) {
    const z = zVereda(g); let max = 0;
    for (let y = 0; y < g.ny; y++) for (let x = 2; x < g.nx - 2; x++) { const cel = (z * g.ny + y) * g.nx + x; if (g.solido[cel]) continue; max = Math.max(max, Math.hypot(c.campo[4 * cel], c.campo[4 * cel + 1], c.campo[4 * cel + 2]) / (c.uIn[z] || UH)); }
    vereda = `En la vereda (1,5 m), el viento llega a ${fmt(max, 2)} veces el del campo abierto a esa altura (esquinas y bajada por la cara de barlovento).`;
  }
  el.replaceChildren(
    h('div', { class: 'kpis' },
      kpi('Tiempo', fmt(pasadas, 1), `pasadas del aire por el túnel (${c.gpu.pasos} pasos)${c.corriendo ? '' : ' · en pausa'}`),
      kpi('Placa de video', `${fmt(c.mlups, 0)} M/s`, 'millones de celdas por segundo'),
    ),
    tabla,
    h('p', { class: 'nota' }, `${c.prom.muestras ? `Cp promediado en ${c.prom.muestras} muestras (desde la primera pasada del aire), con qh de la altura de la torre y la presión de referencia aguas arriba.` : 'El Cp se empieza a promediar después de la primera pasada del aire.'} El reglamento da valores de diseño de un edificio aislado; la simulación, con la planta real, una sola dirección y un Reynolds de red ≈ ${fmt(RE, 0)}, da el orden de magnitud: en barlovento se parecen; en los costados y sotavento la simulación suele dar más succión. ${vereda}`),
  );
}

/** al cambiar de proyecto o cerrar: suelta la placa */
export function detenerTunel3d() { detener(); }
