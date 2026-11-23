/**
 * Etapa «Viento», paso «Túnel 2D» (simulador de viento, etapa V2 de docs/plan_viento.html): la planta de la torre a
 * una cota, en un canal, con el método de Lattice Boltzmann. Se ven la estela y los remolinos; se miden el arrastre,
 * la fuerza lateral y el número de Strouhal, y con la n1 de la torre, la velocidad crítica de desprendimiento.
 * Didáctico: no cambia ningún número de ningún método.
 */
import { estado, fmt } from './estado';
import { h, kpi, seccion, type H } from './comp';
import { vientoCirsoc } from './cirsoc102';
import { graficoAltura, tablaValores, type Tam } from './diagramas';
import { corteYMomento, fuerzasPorPiso, plantasDistintas, type GrupoPlanta, type ResultadoPlanta } from '../viento/porPiso';
import type { PedidoMedicion, RespuestaMedicion } from '../viento/medicion.worker';
import MedicionWorker from '../viento/medicion.worker?worker&inline';
import { celdaRef2D, perimetro, PromedioPerimetro } from '../viento/perimetro';
import { descargarCSV } from './csv';
import { abrirGrabacion, cuadroDe, empaquetar, Grabadora, type GrabacionAbierta } from '../viento/grabacion';
import { contornoAlViento, puntosSilueta } from '../engine/silueta';
import { chaflanar, geometria2D, type Geometria2D } from '../viento/geometria2d';
import { medir, velocidadCritica, type Mediciones } from '../viento/mediciones';
import type { CuadroTunel, MensajeTunel } from '../viento/tunel.worker';
import { seccionPruebaGpu } from './pruebaGpu';
import TunelWorker from '../viento/tunel.worker?worker&inline';
import { llaveEnLienzo, type Llave } from './llaveColor';
import { colorTermico, coloresTermico, dibujarFlechas, divergente, isolineas, muestraVelocidad, pintarSuave, type ModoFlechas, type Vista as VistaPx } from './campoSuave';
import { AVISO_RED, CRITICO_RED, dondeRespectoTorre, esquinaVivaCerca, ladoMetro, promedioArea, puntosAltos, SALVAGUARDAS, type PuntoAlto } from '../viento/salvaguardas';
import { armarEscenario, cajaDe, contextoDesdeCAD, ESCENARIOS, pisaLaTorre, vecinosEnCorte, type Escenario } from '../viento/contexto';
import { factorUnidad, leerDXFCompleto, type DibujoCAD } from '../engine/cad';
import type { EdificioVecino } from '../engine/modelo';
import { encuadrar, sigmaBanda, FINURA_MAX, geometriaDetalle, type GeometriaDetalle, type Ventana } from '../viento/detalle';

type Vista = 'vorticidad' | 'velocidad' | 'presion';
const RE: Record<string, { Re: number; cs: number; texto: string }> = {
  laminar: { Re: 150, cs: 0, texto: 'laminar (Re ≈ 150): remolinos ordenados, la calle de von Kármán' },
  medio: { Re: 1000, cs: 0.16, texto: 'medio (Re ≈ 1 000, con modelo de turbulencia)' },
  alto: { Re: 20000, cs: 0.22, texto: 'alto (Re ≈ 20 000, con más modelo de turbulencia)' },
};
const RES: Record<string, { D: number; texto: string }> = { rapida: { D: 14, texto: 'rápida (14 celdas por ancho)' }, normal: { D: 20, texto: 'normal (20 celdas)' }, fina: { D: 30, texto: 'fina (30 celdas, más lenta)' } };
/** velocidad de entrada en unidades de la red (0,1; 0,06 con el túnel «lento», más estable cuando el aire se acelera mucho) */
let U0 = 0.1;

/** lo que eligió el alumno (vive mientras la página está abierta; no se guarda en el proyecto) */
const cfg = {
  nivel: null as string | null, angulo: 0, re: 'medio', res: 'normal', ochava: 0, forma: 'dibujada' as 'dibujada' | 'vivas',
  /** paredes exactas (rebote interpolado + TRT) o en escalera (como antes, para comparar) */
  paredes: 'exactas' as 'exactas' | 'escalera',
  /** canal ancho (12 anchos de alto: bloquea ≈ 8 %) o angosto (7 anchos: ≈ 14 %, más rápido) */
  canal: 'ancho' as 'ancho' | 'angosto',
  segunda: 'no' as 'no' | 'detras' | 'lado', distancia: 2, vista: 'vorticidad' as Vista, humo: true,
  /** túnel «lento»: la entrada a 0,06 en vez de 0,1 de la red (más estable, más pasos por pasada) */
  lento: false,
  /** contexto urbano: simular con los edificios vecinos del proyecto (los que llegan a la altura del corte) */
  contexto: true,
  /** el armador de escenarios: tipo, ancho de las calles (m) y alto de los vecinos (en veces la torre) */
  escenario: 'fila' as Escenario, separacion: 20, altoRel: 1,
  /** el Cp promedio dibujado sobre el contorno de la planta */
  cpContorno: true,
  /** isolíneas de la velocidad media (1,2 y 1,4 veces la de entrada): dónde y hasta dónde se acelera el aire */
  isolineas: true,
  /** flechas de la velocidad: largo fijo con el color de la velocidad (por defecto), proporcionales o ninguna */
  flechas: 'fijas' as ModoFlechas,
  /** ventana de detalle: el recuadro (celdas del túnel) y cuántas veces más fina */
  ventana: null as Ventana | null, fino: 'auto' as 'auto' | 2 | 4 | 8,
};
/** la ventana de detalle de la corrida: su geometría fina y los promedios en el tiempo */
interface CorridaDetalle { geo: GeometriaDetalle; transicion: Uint8Array; medible: Uint8Array; sumaV: Float64Array; sumaR: Float64Array; muestras: number; maxInst: number; roto: boolean }
let det: CorridaDetalle | null = null;
/** marcando el recuadro en el túnel (arrastrando) */
let marcando = false, arrastre: { x0: number; y0: number; x1: number; y1: number } | null = null;
let lienzoDet: HTMLCanvasElement | null = null, panelDet: H | null = null;
/**
 * zoom del túnel: z (1 = todo el túnel) y la esquina de arriba a la izquierda de lo que se ve, en píxeles del lienzo
 * sin zoom. Rueda o botones para acercar, arrastrar para moverse, doble clic para volver a ver todo.
 */
const zoom = { z: 1, ox: 0, oy: 0 };
/** ver la ventana de detalle también arriba, como recuadro sobre el túnel */
let verRecuadroArriba = true;

interface Corrida {
  clave: string; geo: Geometria2D; nu: number; cs: number; worker: Worker;
  campo: CuadroTunel | null; pasos: number; Fx: number[]; Fy: number[]; corriendo: boolean; esperando: boolean;
  roto: boolean; med: Mediciones | null; humo: Float32Array; cuadrosSinMirar: number; nivel: string; cota: number;
  /** Cp promediado en el tiempo a lo largo del perímetro de la planta */
  perim: PromedioPerimetro;
  /** salvaguardas: la velocidad media de cada celda (suma y cuadros), la más alta del último cuadro (red) y dónde se rompió */
  sumaV: Float64Array; nV: number; maxRed: number; dondeRoto: string | null; altos: PuntoAlto[];
  /** isolíneas de la velocidad media (tramos en la red, por nivel) y la cola del humo (las últimas posiciones) */
  isos: { nivel: number; tramos: number[][] }[]; cola: Float32Array[];
}
let corrida: Corrida | null = null;
let lienzo: HTMLCanvasElement | null = null;
let panelMed: H | null = null;
/** las mediciones anotadas para comparar formas (esquinas vivas, redondeadas, ochavadas, sustraídas…) */
const anotadas: { forma: string; Cd: number; Cl: number; St: number | null; Vcr: number }[] = [];

/** los niveles sobre PB, para elegir el corte (por defecto, uno a media altura) */
function niveles() {
  const p = estado.proyecto;
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  // de PB a la azotea: cada corte es el piso de ese nivel, con su carpintería (o su losa si no hay)
  return p.niveles.slice(0, iPB + 1).map((n, i) => ({ n, i })).filter(x => x.n.cota >= (p.niveles[iPB]?.cota ?? 0));
}
function nivelElegido() {
  const ns = niveles(), p = estado.proyecto;
  // sin elegir: el primer nivel con carpintería propia (lo que se está diseñando); si no hay, uno a media altura
  return ns.find(x => x.n.nombre === cfg.nivel) ?? ns.find(x => (p.niveles[x.i].carpinteria?.length ?? 0) >= 3) ?? ns[Math.floor(ns.length / 2)] ?? null;
}

function claveCorrida(): string {
  return JSON.stringify([estado.revision, estado.dir, nivelElegido()?.n.nombre, cfg.angulo, cfg.re, cfg.res, cfg.ochava, cfg.forma, cfg.paredes, cfg.canal, cfg.segunda, cfg.distancia, cfg.lento, cfg.contexto]);
}

function iniciar() {
  if (repro) { if (repro.reloj !== null) clearInterval(repro.reloj); repro = null; }   // empezar de nuevo sale de la reproducción
  if (grab) grab = null;
  corrida?.worker.terminate();
  corrida = null;
  const ne = nivelElegido();
  if (!ne) return;
  let pol = puntosSilueta(contornoAlViento(estado.proyecto, ne.i).v, 12).map(q => ({ x: q.x, y: q.y }));
  if (pol.length < 3) return;
  // para comparar: la misma planta con esquinas vivas (su caja)
  if (cfg.forma === 'vivas') {
    const xs = pol.map(q => q.x), ys = pol.map(q => q.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    pol = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  }
  const D = RES[cfg.res].D, re = RE[cfg.re];
  // contexto urbano: los vecinos que llegan a la altura del corte (a mitad del piso, sobre PB)
  const ctx = cfg.contexto ? vecinosEnCorte(edificiosVecinos(), alturaCorte(ne.i)) : [];
  // con vecinos el aire se acelera en las calles: el túnel lento siempre (con el normal se rompe con facilidad)
  U0 = cfg.lento || ctx.length ? 0.06 : 0.1;
  // ochava: un porcentaje del ancho transversal al viento (se mide antes de ochavar)
  const g0 = geometria2D({ poligonos: [pol], dir: estado.dir, angulo: cfg.angulo, D });
  if (cfg.ochava > 0) pol = chaflanar(pol, (cfg.ochava / 100) * g0.anchoM);
  const geo = geometria2D({ poligonos: [pol], dir: estado.dir, angulo: cfg.angulo, D, largo: 16, alto: cfg.canal === 'ancho' ? 12 : 7, entrada: 4, segunda: cfg.segunda === 'no' ? null : { donde: cfg.segunda, distancia: cfg.distancia }, contexto: ctx });
  const nu = (U0 * geo.D) / re.Re;
  // el worker va adentro del script (también en el archivo único, que se abre con doble clic: ahí no se pueden cargar
  // workers desde el disco)
  const worker = new TunelWorker();
  const humo = new Float32Array(2 * 700);
  for (let k = 0; k < 700; k++) { humo[2 * k] = Math.random() * geo.nx; humo[2 * k + 1] = Math.random() * geo.ny; }
  corrida = { clave: claveCorrida(), geo, nu, cs: re.cs, worker, campo: null, pasos: 0, Fx: [], Fy: [], corriendo: true, esperando: false, roto: false, med: null, humo, cuadrosSinMirar: 0, nivel: ne.n.nombre, cota: ne.n.cota, perim: new PromedioPerimetro(perimetro(geo), U0),
    sumaV: new Float64Array(geo.nx * geo.ny), nV: 0, maxRed: 0, dondeRoto: null, altos: [], isos: [], cola: [] };
  worker.onmessage = (e: MessageEvent<CuadroTunel>) => recibir(e.data);
  const exactas = cfg.paredes === 'exactas';
  worker.postMessage({ tipo: 'iniciar', nx: geo.nx, ny: geo.ny, solido: geo.solido, nu, u0: U0, cs: re.cs, q: exactas ? geo.q : undefined, colision: exactas ? 'trt' : 'bgk', cuerpo: geo.cuerpo } satisfies MensajeTunel);
  det = null;
  if (cfg.ventana) ponerVentana(cfg.ventana);
}

/** pone (o saca, con null) la ventana de detalle en la corrida */
function ponerVentana(v: Ventana | null) {
  const c = corrida;
  if (!c) return;
  if (!v) { cfg.ventana = null; det = null; c.worker.postMessage({ tipo: 'detalle', geo: null, exactas: false } satisfies MensajeTunel); return; }
  const { v: va, r } = encuadrar(c.geo, v, cfg.fino), gd = geometriaDetalle(c.geo, va, r), n = gd.nx * gd.ny;
  cfg.ventana = va;
  // las celdas donde la ventana se relaja hacia el túnel grueso (la orilla y la banda): se velan y no se miden
  const sb = sigmaBanda(gd), transicion = new Uint8Array(n);
  for (let k = 0; k < n; k++) transicion[k] = sb[k] > 0.01 || sb[k] >= 1 ? 1 : 0;
  const medible = new Uint8Array(n); for (let k = 0; k < n; k++) medible[k] = gd.solido[k] || transicion[k] ? 0 : 1;
  det = { geo: gd, transicion, medible, sumaV: new Float64Array(n), sumaR: new Float64Array(n), muestras: 0, maxInst: 0, roto: false };
  c.worker.postMessage({ tipo: 'detalle', geo: gd, exactas: cfg.paredes === 'exactas' } satisfies MensajeTunel);
}

/** pausa o sigue (el worker calcula sin parar mientras corre) */
function correr(si: boolean) {
  const c = corrida;
  if (!c) return;
  c.corriendo = si;
  c.worker.postMessage({ tipo: 'correr', si } satisfies MensajeTunel);
}

function recibir(r: CuadroTunel) {
  const c = corrida;
  if (!c) return;
  c.esperando = false; c.campo = r; c.pasos = r.pasos; c.roto = r.roto;
  vigilar(c, r);
  if (grab && grab.clave === c.clave) {
    grab.g.agregar(r.pasos, r.ux, r.uy, r.rho, r.Fx, r.Fy);
    // corrida larga: al llegar a las pasadas pedidas, se guarda sola
    if (grab.hasta && (r.pasos * U0) / c.geo.D >= grab.hasta) void terminarGrabacion();
    else if (performance.now() - grab.ultimoAviso > 1000) { grab.ultimoAviso = performance.now(); actualizarGrabacion(); }
  }
  for (let k = 0; k < r.Fx.length; k++) { c.Fx.push(r.Fx[k]); c.Fy.push(r.Fy[k]); }
  const MAX = 30000;
  if (c.Fx.length > MAX) { c.Fx.splice(0, c.Fx.length - MAX); c.Fy.splice(0, c.Fy.length - MAX); }
  // si el dibujo no está en la página (otra etapa), se para solo
  if (!lienzo?.isConnected) { if (++c.cuadrosSinMirar > 2) correr(false); }
  else c.cuadrosSinMirar = 0;
  moverHumo(c, r.hechos);
  requestAnimationFrame(() => { dibujar(); c.worker.postMessage({ tipo: 'listo' } satisfies MensajeTunel); });
  // se mide pasado el arranque: medio recorrido del canal
  if (c.pasos > (0.6 * c.geo.nx) / U0) {
    const desde = Math.max(0, c.Fx.length - Math.min(c.Fx.length, c.pasos - Math.round((0.6 * c.geo.nx) / U0)));
    c.med = medir(c.Fx.slice(desde), c.Fy.slice(desde), U0, c.geo.D);
    c.perim.sumar(r.rho);                                             // la presión en el perímetro, pasado el arranque
    // la velocidad media de cada celda (para los puntos de velocidad alta y las isolíneas)
    for (let k = 0; k < r.ux.length; k++) c.sumaV[k] += Math.hypot(r.ux[k], r.uy[k]); c.nV++;
    if (det && r.det && r.det.nx === det.geo.nx && r.det.ny === det.geo.ny) {
      const d = r.det, n = d.ux.length, inst = new Float32Array(n); let mx = 0;
      for (let k = 0; k < n; k++) { const v = Math.hypot(d.ux[k], d.uy[k]); inst[k] = v; det.sumaV[k] += v; det.sumaR[k] += d.rho[k]; }
      if (SALVAGUARDAS) {
        // el pico de cada cuadro promediado en ~1 m² (salvaguarda C): el de una celda crece al afinar la grilla
        const prom = promedioArea(det.geo.nx, det.geo.ny, inst, det.medible, ladoMetro(1 / (c.geo.escala * det.geo.r)));
        for (let k = 0; k < n; k++) if (det.medible[k] && prom[k] > mx) mx = prom[k];
      } else for (let k = 0; k < n; k++) if (!det.geo.solido[k] && inst[k] > mx) mx = inst[k];
      det.muestras++; det.maxInst = Math.max(det.maxInst, mx / U0);
    }
  }
  if (det && r.det) det.roto = r.det.roto;
  actualizarMediciones();
}

/** cuántas posiciones guarda la estela del humo */
const LARGO_COLA = 8;
/** humo: partículas llevadas por el viento (interpolación bilineal), que vuelven a entrar por la izquierda */
function moverHumo(c: Corrida, pasos: number) {
  if (!c.campo || !cfg.humo) return;
  // la estela: las últimas posiciones, de la más vieja a la actual
  c.cola.push(c.humo.slice()); if (c.cola.length > LARGO_COLA) c.cola.shift();
  const { nx, ny, solido } = c.geo, { ux, uy } = c.campo, hm = c.humo;
  const sub = Math.max(1, Math.ceil(pasos / 20)), dt = pasos / sub;
  for (let k = 0; k < hm.length; k += 2) {
    let x = hm[k], y = hm[k + 1];
    for (let s = 0; s < sub; s++) {
      const i = Math.min(nx - 2, Math.max(0, Math.floor(x))), j = Math.min(ny - 2, Math.max(0, Math.floor(y))), fx = x - i, fy = y - j;
      const a = j * nx + i;
      const u = ux[a] * (1 - fx) * (1 - fy) + ux[a + 1] * fx * (1 - fy) + ux[a + nx] * (1 - fx) * fy + ux[a + nx + 1] * fx * fy;
      const v = uy[a] * (1 - fx) * (1 - fy) + uy[a + 1] * fx * (1 - fy) + uy[a + nx] * (1 - fx) * fy + uy[a + nx + 1] * fx * fy;
      x += u * dt; y += v * dt;
      if (y < 0) y += ny; else if (y >= ny) y -= ny;
    }
    const celda = Math.floor(y) * nx + Math.floor(x);
    if (x >= nx - 1 || x < 0 || solido[celda]) { x = Math.random() * 2; y = Math.random() * ny; }
    hm[k] = x; hm[k + 1] = y;
  }
}

// ---------------------------------------------------------------------------------------------------- dibujo
let vort: Float32Array | null = null, vortS: Float32Array | null = null, campoS: Float32Array | null = null, pesoAire: Uint8Array | null = null, imgPant: ImageData | null = null;
const css = (v: string, def: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || def;
function rgb(hex: string): [number, number, number] { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim()); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [128, 128, 128]; }

function dibujar() {
  const c = corrida, cv = lienzo;
  if (!c || !cv || !c.campo) return;
  const { nx, ny, solido } = c.geo, { ux, uy, rho } = c.campo;
  // convención de la app: rojo tracción, azul compresión. La presión que empuja (comprime) va en azul y la succión en
  // rojo; el giro y la velocidad no son tracción ni compresión: van con otros colores (naranja/violeta y el espectro
  // térmico, sin rojo ni azul)
  const fondo = rgb(css('--lienzo', '#ffffff')), comp = rgb(css('--compresion', '#378add')), trac = rgb(css('--traccion', '#e24b4a')), sol = rgb(css('--ink', '#223344'));
  const giroA = rgb(css('--carga', '#d85a30')), giroH = rgb(css('--corte', '#7f77dd'));
  if (cfg.vista === 'vorticidad' && c.campo.w) vort = c.campo.w;      // grabación: el giro ya viene calculado
  else if (cfg.vista === 'vorticidad') {
    if (!vort || vort.length !== nx * ny) vort = new Float32Array(nx * ny);
    if (!vortS || vortS.length !== nx * ny) vortS = new Float32Array(nx * ny);
    for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) { const q = y * nx + x; vortS[q] = (uy[q + 1] - uy[q - 1]) * 0.5 - (ux[q + nx] - ux[q - nx]) * 0.5; }
    // promedio de 3 × 3 celdas: saca el ruido de la escala de la grilla, que no es físico
    for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
      const q = y * nx + x;
      vort[q] = (vortS[q - nx - 1] + vortS[q - nx] + vortS[q - nx + 1] + vortS[q - 1] + vortS[q] + vortS[q + 1] + vortS[q + nx - 1] + vortS[q + nx] + vortS[q + nx + 1]) / 9;
    }
  }
  const escV = (3 * U0) / c.geo.D, rhoRef = rho[celdaRef2D(c.geo)] || 1;   // la presión de referencia (como la toma de un túnel)
  // el valor de cada celda (normalizado para su escala de color) y qué celdas cuentan
  if (!campoS || campoS.length !== nx * ny) campoS = new Float32Array(nx * ny);
  const S = campoS;
  if (!pesoAire || pesoAire.length !== nx * ny) { pesoAire = new Uint8Array(nx * ny); }
  for (let q = 0; q < nx * ny; q++) {
    pesoAire[q] = solido[q] ? 0 : 1;
    if (cfg.vista === 'vorticidad') S[q] = solido[q] ? 0 : vort![q] / escV;
    else if (cfg.vista === 'velocidad') S[q] = solido[q] ? 0 : Math.min(1, Math.hypot(ux[q], uy[q]) / U0 / 1.6);
    else { const cp = (rho[q] - rhoRef) / 3 / (0.5 * U0 * U0); S[q] = solido[q] ? 0 : cp >= 0 ? cp : cp / 1.6; }
  }
  const g = cv.getContext('2d')!;
  const s = cv.width / nx;
  acotarZoom(cv);
  // la imagen a la resolución de la pantalla (lo que se ve con el zoom), interpolando el campo entre celdas
  if (!imgPant || imgPant.width !== cv.width || imgPant.height !== cv.height) imgPant = new ImageData(cv.width, cv.height);
  const vis: VistaPx = { W: cv.width, H: cv.height, x0: zoom.ox / s, dx: 1 / (zoom.z * s), y0: ny - zoom.oy / s, dy: 1 / (zoom.z * s) };
  // la velocidad cuenta también las paredes (en la pared el aire está quieto: la capa límite se ve); lo demás, solo aire
  const colorear = cfg.vista === 'velocidad' ? colorTermico : cfg.vista === 'vorticidad' ? divergente(fondo, giroH, giroA) : divergente(fondo, trac, comp);
  pintarSuave(imgPant.data, vis, nx, ny, S, cfg.vista === 'velocidad' ? null : pesoAire, colorear, sol);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.putImageData(imgPant, 0, 0);
  g.setTransform(zoom.z, 0, 0, zoom.z, -zoom.ox * zoom.z, -zoom.oy * zoom.z);
  // la torre con su contorno exacto, encima (borde liso); los vecinos del contexto, en gris
  c.geo.contornos.forEach((p, k) => {
    g.fillStyle = k < c.geo.nTorre ? css('--ink', '#223344') : GRIS_VECINO;
    g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(q.x * s, (ny - q.y) * s) : g.moveTo(q.x * s, (ny - q.y) * s))); g.closePath(); g.fill();
  });
  // las flechas de la velocidad, en una grilla pareja de la pantalla (no se amontonan con el zoom)
  g.setTransform(1, 0, 0, 1, 0, 0);
  dibujarFlechas(g, vis, cfg.flechas, muestraVelocidad(ux, uy, solido, nx, ny, U0), 30, css('--ink', '#223344'), css('--lienzo', '#ffffff'), cfg.vista !== 'velocidad');
  if (cfg.isolineas && c.isos.length) dibujarIsolineas(g, c, s);
  g.setTransform(zoom.z, 0, 0, zoom.z, -zoom.ox * zoom.z, -zoom.oy * zoom.z);
  // Cp promedio sobre el contorno: azul donde empuja (comprime), rojo donde succiona (tracciona)
  if (cfg.cpContorno && c.perim.muestras > 0) {
    const p = c.perim.p, az = css('--compresion', '#378add'), ro = css('--traccion', '#e24b4a');
    for (let k = 0; k < p.celdas.length; k++) {
      const cp = c.perim.cp(k), r = (Math.max(1.5, Math.min(5, 1.5 + Math.abs(cp) * 2.2)) * Math.max(1, s / 3) * Math.min(zoom.z, 2)) / zoom.z;   // del mismo tamaño en pantalla con zoom
      g.fillStyle = cp >= 0 ? az : ro; g.globalAlpha = 0.85;
      g.beginPath(); g.arc(p.px[k] * s, (ny - p.py[k]) * s, r, 0, 2 * Math.PI); g.fill();
    }
    g.globalAlpha = 1;
  }
  // el recuadro de la ventana de detalle (o el que se está marcando)
  const rec = arrastre ? { x0: Math.min(arrastre.x0, arrastre.x1), y0: Math.min(arrastre.y0, arrastre.y1), w: Math.abs(arrastre.x1 - arrastre.x0), h: Math.abs(arrastre.y1 - arrastre.y0) } : cfg.ventana;
  if (rec) {
    g.save(); g.strokeStyle = css('--elegido', '#ef9f27'); g.lineWidth = 2 / zoom.z; g.setLineDash([6 / zoom.z, 4 / zoom.z]);
    g.strokeRect(rec.x0 * s, (ny - rec.y0 - rec.h) * s, rec.w * s, rec.h * s); g.restore();
  }
  dibujarDetalle(c, rhoRef);
  if (cfg.humo) {
    // las partículas con su estela: un tramo por cada cuadro anterior, más transparente cuanto más viejo
    const hm = c.humo, col = c.cola, tinta = css('--ink2', '#556');
    g.strokeStyle = tinta; g.lineWidth = 1.4 / zoom.z; g.lineCap = 'round';
    for (let a = 0; a + 1 < col.length; a++) {
      const p0 = col[a], p1 = col[a + 1];
      g.globalAlpha = 0.1 + (0.45 * (a + 1)) / col.length;
      g.beginPath();
      for (let k = 0; k < hm.length; k += 2) {
        if (Math.abs(p1[k] - p0[k]) > 6 || Math.abs(p1[k + 1] - p0[k + 1]) > 6) continue;     // volvió a entrar: sin estela
        g.moveTo(p0[k] * s, (ny - p0[k + 1]) * s); g.lineTo(p1[k] * s, (ny - p1[k + 1]) * s);
      }
      g.stroke();
    }
    g.fillStyle = tinta; g.globalAlpha = 0.7;
    const t = 2 / zoom.z;
    for (let k = 0; k < hm.length; k += 2) g.fillRect(hm[k] * s - t / 2, (ny - hm[k + 1]) * s - t / 2, t, t);
    g.globalAlpha = 1;
  }
  // lo que no se mueve con el zoom: los puntos de velocidad alta, el recuadro de la ventana arriba, la llave de colores
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (SALVAGUARDAS) marcarAltos(g, c, s);
  if (verRecuadroArriba && det && cfg.ventana && copiaDet && copiaDet.width > 0 && c.campo.det) recuadroArriba(g, cv, nx, ny, s);
  const l1 = llaveEnLienzo(g, llaveVista(c.geo.D), 8, cv.height - 8, Math.min(190, cv.width * 0.3), css('--lienzo', '#ffffff'), css('--ink', '#223344'));
  const lf = llaveFlechas();
  if (lf) llaveEnLienzo(g, lf, 8, cv.height - 14 - l1.alto, Math.min(190, cv.width * 0.3), css('--lienzo', '#ffffff'), css('--ink', '#223344'));
}

/** la llave de las flechas, si hace falta una aparte (con el color de fondo de velocidad, la del fondo sirve) */
function llaveFlechas(): Llave | null {
  if (cfg.flechas === 'fijas' && cfg.vista !== 'velocidad') return { titulo: 'Flechas: dirección; el color, la velocidad', colores: coloresTermico(), marcas: [[0, 'quieto'], [0.5, '0,8 V'], [1, '≥ 1,6 V']] };
  if (cfg.flechas === 'proporcionales') return { titulo: 'Flechas: el largo dice la velocidad', colores: [css('--lienzo', '#ffffff'), css('--ink', '#223344')], marcas: [[0, 'corta: lenta'], [1, 'una separación: 1,6 V']] };
  return null;
}

/** guardia de estabilidad (salvaguarda B): la velocidad más alta en unidades de la red y, si se rompió, dónde */
function vigilar(c: Corrida, r: CuadroTunel) {
  const { nx, solido } = c.geo;
  let mx = 0;
  for (let k = 0; k < r.ux.length; k++) if (!solido[k]) { const v = Math.hypot(r.ux[k], r.uy[k]); if (v > mx) mx = v; }
  c.maxRed = mx;
  if (r.roto && !c.dondeRoto) {
    // las celdas que se fueron de rango (densidad imposible o NaN): su centro, dicho respecto de la torre
    let sx = 0, sy = 0, n = 0;
    for (let k = 0; k < r.rho.length; k++) if (!solido[k] && !(r.rho[k] > 0.2 && r.rho[k] < 5)) { sx += k % nx; sy += Math.floor(k / nx); n++; }
    c.dondeRoto = n ? dondeRespectoTorre({ x: sx / n, y: sy / n }, c.geo.caja, 1 / c.geo.escala) : 'en una zona chica';
  }
  // los puntos de velocidad alta (salvaguarda A), con la velocidad media promediada en ~1 m² (salvaguarda C)
  if (SALVAGUARDAS && c.nV > 0 && (c.nV % 10 === 1)) {
    const n = c.geo.nx * c.geo.ny, media = new Float32Array(n), aire = new Uint8Array(n);
    for (let k = 0; k < n; k++) { media[k] = c.sumaV[k] / c.nV / U0; aire[k] = solido[k] ? 0 : 1; }
    const prom = promedioArea(c.geo.nx, c.geo.ny, media, aire, ladoMetro(1 / c.geo.escala));
    // el entorno de la torre: hasta un ancho de torre alrededor (lo que pasa lejos en la estela no es de la fachada)
    const k = c.geo.caja, D = c.geo.D, zona = { x0: k.x0 - D, x1: k.x1 + D, y0: k.y0 - D, y1: k.y1 + D };
    c.altos = puntosAltos(c.geo.nx, c.geo.ny, prom, solido, 1.3, 4, Math.max(3, D / 4), zona);
  }
  if (cfg.isolineas && c.nV > 0 && c.nV % 10 === 1) {
    const n = c.geo.nx * c.geo.ny, media = new Float32Array(n);
    for (let k = 0; k < n; k++) media[k] = solido[k] ? NaN : c.sumaV[k] / c.nV / U0;
    c.isos = [1.2, 1.4].map(nivel => ({ nivel, tramos: isolineas(c.geo.nx, c.geo.ny, media, nivel, solido) }));
  }
}

/** las isolíneas de la velocidad media: 1,2 V fina y 1,4 V gruesa, con su valor en algunos lugares (sin pisarse) */
function dibujarIsolineas(g: CanvasRenderingContext2D, c: Corrida, s: number) {
  const ny = c.geo.ny, tinta = css('--ink', '#223344'), fondo = css('--lienzo', '#ffffff');
  const P = (x: number, y: number) => [(x * s - zoom.ox) * zoom.z, ((ny - y) * s - zoom.oy) * zoom.z];
  g.save(); g.lineCap = 'round';
  const puestos: number[][] = [];
  for (const { nivel, tramos } of c.isos) {
    const traza = () => { g.beginPath(); for (const [x0, y0, x1, y1] of tramos) { const a = P(x0, y0), b = P(x1, y1); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); } g.stroke(); };
    const fino = nivel < 1.3;
    g.strokeStyle = fondo; g.lineWidth = fino ? 2.6 : 4; g.globalAlpha = 0.55; traza();
    g.strokeStyle = tinta; g.lineWidth = fino ? 0.9 : 1.9; g.globalAlpha = fino ? 0.8 : 1; traza();
    // el valor en unos pocos lugares separados
    g.setLineDash([]); g.font = '600 10.5px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const t = `${fmt(nivel, 1)} V`;
    for (let k = 0; k < tramos.length && puestos.length < 4; k += 7) {
      const [x0, y0, x1, y1] = tramos[k], q = P((x0 + x1) / 2, (y0 + y1) / 2);
      if (q[0] < 20 || q[1] < 20 || q[0] > (lienzo?.width ?? 0) - 20 || q[1] > (lienzo?.height ?? 0) - 20) continue;
      if (puestos.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < (p[2] === nivel ? 140 : 45))) continue;
      puestos.push([q[0], q[1], nivel]);
      g.lineWidth = 3.5; g.strokeStyle = fondo; g.strokeText(t, q[0], q[1]); g.fillStyle = tinta; g.fillText(t, q[0], q[1]);
    }
  }
  g.restore();
}

/** los puntos de velocidad alta en el túnel: un anillo y la velocidad media (en veces la de entrada) */
function marcarAltos(g: CanvasRenderingContext2D, c: Corrida, s: number) {
  const ny = c.geo.ny, tinta = css('--ink', '#223344'), fondo = css('--lienzo', '#ffffff');
  g.save(); g.font = '600 11px system-ui, sans-serif'; g.textBaseline = 'middle';
  // el rótulo: el número (y el valor si hay lugar: de cerca o con pocos puntos); si se pisa con otro, se corre
  const puestos: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const conValor = zoom.z >= 2 || c.altos.length <= 2;
  c.altos.forEach((p, i) => {
    const x = (p.x * s - zoom.ox) * zoom.z, y = ((ny - p.y) * s - zoom.oy) * zoom.z;
    if (x < -20 || y < -20 || x > (lienzo?.width ?? 0) + 20 || y > (lienzo?.height ?? 0) + 20) return;
    for (const [col, w] of [[fondo, 4], [tinta, 1.6]] as const) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(x, y, 9, 0, 2 * Math.PI); g.stroke(); }
    const t = conValor ? `${i + 1} · ${fmt(p.valor, 2)} V` : `${i + 1}`, w = g.measureText(t).width;
    let tx = x + 13, ty = y;
    for (let k = 0; k < 8 && puestos.some(r => tx < r.x1 && tx + w > r.x0 && ty - 7 < r.y1 && ty + 7 > r.y0); k++) ty += 15;
    puestos.push({ x0: tx, y0: ty - 7, x1: tx + w, y1: ty + 7 });
    g.lineWidth = 3.5; g.strokeStyle = fondo; g.strokeText(t, tx, ty); g.fillStyle = tinta; g.fillText(t, tx, ty);
  });
  // si se rompió: un cartel en el túnel en vez de una imagen sin sentido
  if (c.roto) {
    const t1 = 'La simulación se volvió inestable', t2 = `cerca de ${c.dondeRoto ?? 'la torre'}. Probá el túnel «lento» o más resolución.`;
    g.font = '600 13px system-ui, sans-serif';
    const w = Math.max(g.measureText(t1).width, g.measureText(t2).width) + 24, x = ((lienzo?.width ?? 400) - w) / 2, y = 40;
    g.globalAlpha = 0.92; g.fillStyle = fondo; g.fillRect(x, y, w, 46); g.globalAlpha = 1; g.strokeStyle = tinta; g.lineWidth = 1; g.strokeRect(x, y, w, 46);
    g.fillStyle = tinta; g.textAlign = 'center'; g.fillText(t1, x + w / 2, y + 14); g.font = '12px system-ui, sans-serif'; g.fillText(t2, x + w / 2, y + 32);
  }
  g.restore();
}

/** los vecinos del contexto urbano: un gris neutro (ni rojo ni azul) */
const GRIS_VECINO = '#8f9198';
const edificiosVecinos = (): EdificioVecino[] => estado.proyecto.contexto?.edificios ?? [];
/** la altura del corte del nivel i, sobre PB: a mitad del piso que empieza en ese nivel */
function alturaCorte(i: number) {
  const p = estado.proyecto, iPB = p.niveles.reduce((k, n, j) => (n.cota >= 0 ? j : k), -1), zPB = p.niveles[iPB]?.cota ?? 0;
  const n = p.niveles[i], arriba = p.niveles[i - 1];
  return n.cota - zPB + (arriba ? Math.min(1.5, (arriba.cota - n.cota) / 2) : 1.5);
}

/** la llave de colores de la vista elegida (la misma en el túnel y en la ventana) */
function llaveVista(D: number): Llave {
  const fondo = css('--lienzo', '#ffffff'), sol = css('--ink', '#223344');
  const torre = { color: sol, texto: 'torre' }, conVecinos = !!corrida && corrida.geo.contornos.length > corrida.geo.nTorre && cfg.segunda === 'no';
  const vec = conVecinos ? [{ color: GRIS_VECINO, texto: 'vecinos' }] : [];
  const cp = cfg.cpContorno ? [{ color: css('--compresion', '#378add'), texto: 'empuja', forma: 'punto' as const }, { color: css('--traccion', '#e24b4a'), texto: 'succiona (Cp en el contorno)', forma: 'punto' as const }] : [];
  if (cfg.vista === 'vorticidad') return { titulo: 'Giro del aire (remolinos)', colores: [css('--corte', '#7f77dd'), fondo, css('--carga', '#d85a30')], marcas: [[0, 'horario'], [0.5, '0'], [1, 'antihorario']], extras: [torre, ...vec, ...cp] };
  if (cfg.vista === 'velocidad') return { titulo: 'Velocidad (V: viento de entrada)', colores: coloresTermico(), marcas: [[0, 'quieto'], [0.25, '0,4 V'], [0.5, '0,8 V'], [0.75, '1,2 V'], [1, '≥ 1,6 V']], extras: [torre, ...vec, ...cp] };
  void D;
  return { titulo: 'Presión (Cp)', colores: [css('--traccion', '#e24b4a'), fondo, css('--compresion', '#378add')], marcas: [[0, '≤ −1,6 succiona'], [1.6 / 2.6, '0'], [1, '+1 empuja']], extras: [torre, ...vec, ...cp.length ? [cp[0], cp[1]] : []] };
}

/** que el zoom no deje ver afuera del túnel */
function acotarZoom(cv: HTMLCanvasElement) {
  zoom.z = Math.max(1, Math.min(12, zoom.z));
  zoom.ox = Math.max(0, Math.min(cv.width - cv.width / zoom.z, zoom.ox));
  zoom.oy = Math.max(0, Math.min(cv.height - cv.height / zoom.z, zoom.oy));
}
/** acerca o aleja alrededor de un punto del lienzo (px, en coordenadas de lo que se ve) */
function acercar(cv: HTMLCanvasElement, f: number, px = cv.width / 2, py = cv.height / 2) {
  const wx = zoom.ox + px / zoom.z, wy = zoom.oy + py / zoom.z;
  zoom.z *= f; acotarZoom(cv);
  zoom.ox = wx - px / zoom.z; zoom.oy = wy - py / zoom.z; acotarZoom(cv);
  cv.classList.toggle('arrastrable', zoom.z > 1.001 && !marcando);
  dibujar(); actualizarAumento();
}
let aumento: HTMLElement | null = null;
const actualizarAumento = () => { if (aumento) aumento.textContent = zoom.z > 1.001 ? `× ${fmt(zoom.z, 1)}` : 'todo'; };

/**
 * la ventana de detalle también arriba, en la esquina del túnel más lejos del recuadro, con líneas que la unen con él
 * (lo de abajo, la ventana grande con sus mediciones, sigue igual)
 */
function recuadroArriba(g: CanvasRenderingContext2D, cv: HTMLCanvasElement, nx: number, ny: number, s: number) {
  const v = cfg.ventana!, d = copiaDet!;
  // el recuadro en pantalla (con el zoom)
  const a = { x: (v.x0 * s - zoom.ox) * zoom.z, y: ((ny - v.y0 - v.h) * s - zoom.oy) * zoom.z };
  const b = { x: a.x + v.w * s * zoom.z, y: a.y + v.h * s * zoom.z };
  const W = Math.min(cv.width * 0.34, 320), Hh = (W * d.height) / d.width, m = 8;
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  // la esquina más lejos del recuadro (arriba a la derecha si se puede)
  const esquinas = [[cv.width - W - m, m], [m, m], [cv.width - W - m, cv.height - Hh - m - 60]] as const;
  const [ix, iy] = esquinas.reduce((best, e) => (Math.hypot(e[0] + W / 2 - cx, e[1] + Hh / 2 - cy) > Math.hypot(best[0] + W / 2 - cx, best[1] + Hh / 2 - cy) ? e : best), esquinas[0]);
  g.save();
  g.strokeStyle = css('--elegido', '#ef9f27'); g.lineWidth = 1; g.setLineDash([4, 4]); g.globalAlpha = 0.8;
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(ix, iy); g.moveTo(b.x, a.y); g.lineTo(ix + W, iy); g.moveTo(a.x, b.y); g.lineTo(ix, iy + Hh); g.moveTo(b.x, b.y); g.lineTo(ix + W, iy + Hh); g.stroke();
  g.setLineDash([]); g.globalAlpha = 1;
  g.drawImage(d, ix, iy, W, Hh);
  g.lineWidth = 2; g.strokeRect(ix, iy, W, Hh);
  g.font = '600 11px system-ui, sans-serif'; g.textBaseline = 'top';
  const rot = `ventana ×${det!.geo.r}`, tw = g.measureText(rot).width;
  g.fillStyle = css('--elegido', '#ef9f27'); g.fillRect(ix, iy, tw + 10, 16); g.fillStyle = '#1b1b1b'; g.fillText(rot, ix + 5, iy + 2);
  g.restore();
  void nx;
}

/** la ventana fina, con los mismos colores que el túnel */
let imgDet: ImageData | null = null, copiaDet: HTMLCanvasElement | null = null;
function dibujarDetalle(c: Corrida, rhoRef: number) {
  const cv = lienzoDet, d = c.campo?.det;
  if (!cv || !cv.isConnected || !det || !d || d.nx !== det.geo.nx || d.ny !== det.geo.ny) return;
  const { nx, ny, solido, r } = det.geo, { ux, uy, rho } = d;
  const fondo = rgb(css('--lienzo', '#ffffff')), comp = rgb(css('--compresion', '#378add')), trac = rgb(css('--traccion', '#e24b4a')), sol = rgb(css('--ink', '#223344'));
  const giroA = rgb(css('--carga', '#d85a30')), giroH = rgb(css('--corte', '#7f77dd'));
  // el giro se mide en la grilla fina: la misma escala de color en 1/s físicos (3·u0/D del túnel, por r)
  const escV = (3 * U0) / (c.geo.D * r), n = nx * ny;
  const S = new Float32Array(n), peso = new Uint8Array(n);
  if (cfg.vista === 'vorticidad') {
    // el giro, suavizado en 3 × 3 celdas como en el túnel (las orillas interpoladas del grueso dejan escalones chicos)
    const wS = new Float32Array(n);
    for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) { const q = y * nx + x; if (!solido[q]) wS[q] = (uy[q + 1] - uy[q - 1]) * 0.5 - (ux[q + nx] - ux[q - nx]) * 0.5; }
    for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) { const q = y * nx + x; S[q] = (wS[q - nx - 1] + wS[q - nx] + wS[q - nx + 1] + wS[q - 1] + wS[q] + wS[q + 1] + wS[q + nx - 1] + wS[q + nx] + wS[q + nx + 1]) / 9 / escV; }
    // las orillas, con el valor de la de adentro
    for (let x = 0; x < nx; x++) { S[x] = S[nx + x]; S[(ny - 1) * nx + x] = S[(ny - 2) * nx + x]; }
    for (let y = 0; y < ny; y++) { S[y * nx] = S[y * nx + 1]; S[y * nx + nx - 1] = S[y * nx + nx - 2]; }
  }
  for (let q = 0; q < n; q++) {
    peso[q] = solido[q] ? 0 : 1;
    if (solido[q]) { S[q] = 0; continue; }
    if (cfg.vista === 'velocidad') S[q] = Math.min(1, Math.hypot(ux[q], uy[q]) / U0 / 1.6);
    else if (cfg.vista === 'presion') { const cp = (rho[q] - rhoRef) / 3 / (0.5 * U0 * U0); S[q] = cp >= 0 ? cp : cp / 1.6; }
  }
  if (!imgDet || imgDet.width !== cv.width || imgDet.height !== cv.height) imgDet = new ImageData(cv.width, cv.height);
  const colorear = cfg.vista === 'velocidad' ? colorTermico : cfg.vista === 'vorticidad' ? divergente(fondo, giroH, giroA) : divergente(fondo, trac, comp);
  // la banda de transición con el túnel grueso, velada (35 % hacia el fondo): ahí no se mide
  pintarSuave(imgDet.data, { W: cv.width, H: cv.height, x0: 0, dx: nx / cv.width, y0: ny, dy: ny / cv.height }, nx, ny, S, cfg.vista === 'velocidad' ? null : peso, colorear, sol, { m: det.transicion, fondo, f: 0.35 });
  const g = cv.getContext('2d')!;
  g.putImageData(imgDet, 0, 0);
  const s = cv.width / nx;
  // la torre con su contorno exacto, encima
  g.save(); g.beginPath(); g.rect(0, 0, cv.width, cv.height); g.clip();
  g.fillStyle = css('--ink', '#223344'); g.strokeStyle = css('--elegido', '#ef9f27'); g.lineWidth = 1.5;
  det.geo.contornos.forEach((p, k) => {
    g.fillStyle = k < c.geo.nTorre ? css('--ink', '#223344') : GRIS_VECINO;
    g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(q.x * s, (ny - q.y) * s) : g.moveTo(q.x * s, (ny - q.y) * s))); g.closePath(); g.fill(); g.stroke();
  });
  g.restore();
  // una copia sin la llave ni las flechas, para el recuadro de arriba (ahí la llave quedaría ilegible)
  if (!copiaDet) copiaDet = document.createElement('canvas');
  if (copiaDet.width !== cv.width || copiaDet.height !== cv.height) { copiaDet.width = cv.width; copiaDet.height = cv.height; }
  copiaDet.getContext('2d')!.drawImage(cv, 0, 0);
  dibujarFlechas(g, { W: cv.width, H: cv.height, x0: 0, dx: nx / cv.width, y0: ny, dy: ny / cv.height }, cfg.flechas, muestraVelocidad(ux, uy, solido, nx, ny, U0), 28, css('--ink', '#223344'), css('--lienzo', '#ffffff'), cfg.vista !== 'velocidad');
  llaveEnLienzo(g, llaveVista(c.geo.D), 6, cv.height - 6, Math.min(170, cv.width * 0.4), css('--lienzo', '#ffffff'), css('--ink', '#223344'));
  actualizarLecturaDetalle(c);
}

/** lo que se lee en la ventana: la velocidad más alta (promedio y pico) y la succión más fuerte en la pared */
let ultimaLectura = 0;
function actualizarLecturaDetalle(c: Corrida) {
  const el = panelDet;
  if (!el?.isConnected || !det || performance.now() - ultimaLectura < 700) return;
  ultimaLectura = performance.now();
  const { nx, ny, solido } = det.geo, n = det.muestras;
  if (det.roto) { el.replaceChildren(h('p', { class: 'aviso-linea' }, 'La ventana se volvió inestable: probá con ×2 o con un recuadro que no corte la torre tan cerca de una esquina.')); return; }
  if (!n) { el.replaceChildren(h('p', { class: 'nota' }, 'Los promedios de la ventana arrancan junto con las mediciones del túnel, pasado el arranque.')); return; }
  const rhoRef = c.campo?.rho[celdaRef2D(c.geo)] ?? 1;
  let vMax = 0, cpMin = Infinity, pVmax = { x: 0, y: 0 };
  // la velocidad media y el Cp en la pared; con las salvaguardas, promediados en ~1 m² (no el valor de una celda)
  const lado = SALVAGUARDAS ? ladoMetro(1 / (c.geo.escala * det.geo.r)) : 1, N = nx * ny;
  const media = new Float32Array(N), cp = new Float32Array(N), pared = new Uint8Array(N);
  for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const q = y * nx + x;
    media[q] = det.sumaV[q] / n / U0; cp[q] = (det.sumaR[q] / n - rhoRef) / 3 / (0.5 * U0 * U0);
    if (det.medible[q] && (solido[q - 1] || solido[q + 1] || solido[q - nx] || solido[q + nx])) pared[q] = 1;
  }
  const mediaA = lado > 1 ? promedioArea(nx, ny, media, det.medible, lado) : media, cpA = lado > 1 ? promedioArea(nx, ny, cp, pared, lado) : cp;
  for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const q = y * nx + x;
    if (!det.medible[q]) continue;                                    // la torre y la banda de transición no se miden
    if (mediaA[q] > vMax) { vMax = mediaA[q]; pVmax = { x: x + 0.5, y: y + 0.5 }; }
    if (pared[q] && cpA[q] < cpMin) cpMin = cpA[q];
  }
  const viva = SALVAGUARDAS && esquinaVivaCerca(pVmax, det.geo.contornos, 3 * det.geo.r);
  const V = estimarV();
  el.replaceChildren(h('div', { class: 'kpis' },
    kpi('Viento medio más alto', `${fmt(vMax, 2)} × V`, `≈ ${fmt(vMax * V, 0)} m/s con V = ${fmt(V, 0)} m/s`),
    kpi('Pico (remolinos)', `${fmt(det.maxInst, 2)} × V`, `≈ ${fmt(det.maxInst * V, 0)} m/s`),
    ...(isFinite(cpMin) ? [kpi('Succión más fuerte en la pared', `Cp ${fmt(cpMin, 2)}`, 'promedio en el tiempo')] : [])),
    h('p', { class: 'nota chica' }, `Promedio de ${n} cuadros${lado > 1 ? `, y cada valor promediado en un cuadrado de ${fmt(lado / (c.geo.escala * det.geo.r), 1)} m de lado (el de una celda crece al afinar la grilla)` : ''}. V es la velocidad de diseño del CIRSOC 102 a la altura del corte, usada solo como escala: la simulación tiene otro Reynolds.`),
    ...(viva ? [h('p', { class: 'nota chica' }, 'La velocidad más alta está junto a una esquina viva: ahí la velocidad teórica es infinita y el pico de la simulación depende de la grilla. Redondear o chaflanar la esquina lo baja de verdad.')] : []));
}

/** la torre (la planta del corte elegido) y su altura sobre PB, para armar escenarios y dibujar el plano chico */
function torreParaContexto() {
  const p = estado.proyecto, ne = nivelElegido();
  const pol = ne ? puntosSilueta(contornoAlViento(p, ne.i).v, 12).map(q => ({ x: q.x, y: q.y })) : [];
  const iPB = p.niveles.reduce((k, n, j) => (n.cota >= 0 ? j : k), -1), zPB = p.niveles[iPB]?.cota ?? 0;
  return { pol, H: Math.max(...p.niveles.map(n => n.cota)) - zPB, z: ne ? alturaCorte(ne.i) : 0 };
}

/** el contexto urbano: usarlo o no, escenarios armados, la lista de vecinos, agregar, importar y exportar */
function panelContexto(el: H) {
  const eds = edificiosVecinos(), t = torreParaContexto(), enCorte = vecinosEnCorte(eds, t.z).length;
  const poner = (nuevos: EdificioVecino[] | null, msj: string) => {
    estado.cambiar(p => { if (nuevos && nuevos.length) p.contexto = { edificios: nuevos }; else delete p.contexto; });
    mensajeTunel(msj); estado.avisarPanel();
  };
  el.append(h('p', { class: 'nota' }, 'Los edificios de alrededor de la torre: tapan el viento, lo encajonan en las calles o le mandan su estela. Se guardan con el proyecto y solo los usan los túneles de viento: no cambian ningún cálculo ni el Excel. En cada corte entran los que llegan a esa altura.'));
  if (eds.length) {
    const chk = h('label', { class: 'campo-linea' }, h('input', { type: 'checkbox', ...(cfg.contexto ? { checked: '' } : {}) }), ` Simular con los vecinos (${eds.length}; en el corte de ${fmt(t.z, 1)} m entran ${enCorte})`);
    chk.querySelector('input')!.addEventListener('change', e => { cfg.contexto = (e.target as HTMLInputElement).checked; estado.avisarPanel(); });
    el.append(chk, planoContexto(t.pol, eds, t.z));
    if (cfg.contexto && enCorte) el.append(h('p', { class: 'nota chica' }, 'Con vecinos el canal es más grande y usa la velocidad lenta (en las calles el aire se acelera): tarda más. La fuerza (Cd, Cl) se mide solo sobre la torre.'));
    const pisan = eds.filter(e => pisaLaTorre(e, cajaDe(t.pol)));
    if (pisan.length) el.append(h('p', { class: 'aviso-linea' }, `${pisan.map(e => e.id).join(', ')} se pisa${pisan.length > 1 ? 'n' : ''} con la torre: movelo${pisan.length > 1 ? 's' : ''} o borralo${pisan.length > 1 ? 's' : ''}.`));
    // la lista: altura editable y borrar
    const filas = eds.map((e, k) => {
      const alt = h('input', { type: 'text', inputmode: 'decimal', value: fmt(e.altura, 1), class: 'n', style: 'width: 56px' }) as HTMLInputElement;
      alt.addEventListener('change', () => { const x = parseFloat(alt.value.replace(',', '.')); if (x > 0) poner(eds.map((q, j) => (j === k ? { ...q, altura: x } : q)), `${e.id}: ${fmt(x, 1)} m de alto.`); else alt.value = fmt(e.altura, 1); });
      const borrar = h('button', { type: 'button', class: 'mini', title: `Borrar ${e.id}`, 'aria-label': `Borrar ${e.id}` }, '✕');
      borrar.addEventListener('click', () => poner(eds.filter((_, j) => j !== k), `${e.id} borrado. Ctrl+Z deshace.`));
      const c0 = cajaDe(e.v);
      return h('tr', {}, h('td', {}, h('b', {}, e.id)), h('td', {}, e.nombre || '—'), h('td', { class: 'n' }, `${fmt(c0.x1 - c0.x0, 0)} × ${fmt(c0.y1 - c0.y0, 0)}`), h('td', {}, alt, ' m'), h('td', {}, borrar));
    });
    el.append(h('table', { class: 'tabla tabla-contexto' }, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Edificio'), h('th', { class: 'n' }, 'Planta (m)'), h('th', {}, 'Alto'), h('th', {}, ''))), h('tbody', {}, ...filas)));
  }
  // armar un escenario
  const sel = h('select', {}) as HTMLSelectElement;
  (Object.entries(ESCENARIOS) as [Escenario, string][]).forEach(([v, tx]) => sel.append(new Option(tx, v, false, v === cfg.escenario)));
  sel.addEventListener('change', () => { cfg.escenario = sel.value as Escenario; });
  const num = (rot: string, v: number, al: (x: number) => void, positivo = true) => {
    const i = h('input', { type: 'text', inputmode: 'decimal', value: fmt(v, 1), class: 'n' }) as HTMLInputElement;
    i.addEventListener('change', () => { const x = parseFloat(i.value.replace(',', '.').replace('−', '-')); if (isFinite(x) && (!positivo || x > 0)) al(x); else i.value = fmt(v, 1); });
    return h('label', { class: 'campo' }, h('span', {}, rot), i);
  };
  const armar = h('button', { type: 'button', class: 'boton' }, eds.length ? 'Armar (reemplaza los vecinos)' : 'Armar el escenario');
  armar.addEventListener('click', () => {
    if (t.pol.length < 3) return;
    const nuevos = armarEscenario(cfg.escenario, cajaDe(t.pol), t.H, estado.dir, cfg.separacion, cfg.altoRel);
    cfg.contexto = true;
    poner(nuevos, `Contexto: ${ESCENARIOS[cfg.escenario]} (${nuevos.length} edificios), armado para el viento ${estado.dir}. Ctrl+Z deshace.`);
  });
  el.append(h('b', { class: 'col-sub' }, 'Armar un escenario'),
    h('label', { class: 'campo' }, h('span', {}, 'Escenario'), sel),
    h('div', { class: 'grilla2' }, num('Ancho de las calles (m)', cfg.separacion, x => { cfg.separacion = x; }), num('Alto de los vecinos (× la torre)', cfg.altoRel, x => { cfg.altoRel = x; })),
    h('div', { class: 'fila-acciones' }, armar),
    h('p', { class: 'nota chica' }, `Se arma alrededor de la torre en el sentido del viento ${estado.dir} (con el otro viento, armalo de nuevo). Las torres vecinas tienen la planta de la torre; el ejemplo del documento se escala al ancho de la torre.`));
  // agregar un rectángulo
  const nv = { cx: 0, cy: 0, ancho: 20, largo: 20, altura: Math.round(t.H) || 60 };
  const agregar = h('button', { type: 'button', class: 'boton' }, '+ Agregar');
  agregar.addEventListener('click', () => {
    const id = `E${eds.length + 1}`, v = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: nv.cx + (a * nv.ancho) / 2, y: nv.cy + (b * nv.largo) / 2 }));
    poner([...eds, { id, nombre: 'Edificio', v, altura: nv.altura }], `${id} agregado.`);
  });
  el.append(h('b', { class: 'col-sub' }, 'Agregar un edificio (rectángulo)'),
    h('div', { class: 'grilla2' }, num('Centro x (m)', nv.cx, x => { nv.cx = x; }, false), num('Centro y (m)', nv.cy, x => { nv.cy = x; }, false), num('Ancho en x (m)', nv.ancho, x => { nv.ancho = x; }), num('Largo en y (m)', nv.largo, x => { nv.largo = x; }), num('Alto (m)', nv.altura, x => { nv.altura = x; })),
    h('p', { class: 'nota chica' }, 'En las coordenadas de la planta del proyecto (el centro de la torre suele estar cerca de 0, 0). Para un centro negativo, escribí el número con el signo menos.'),
    h('div', { class: 'fila-acciones' }, agregar));
  // importar / exportar / quitar
  const exp = h('button', { type: 'button', class: 'boton' }, '⤓ Exportar');
  exp.addEventListener('click', () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, edificios: eds }, null, 1)], { type: 'application/json' }));
    a.download = 'contexto_urbano.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  if (!eds.length) exp.setAttribute('disabled', '');
  const inp = h('input', { type: 'file', accept: '.json', hidden: '' }) as HTMLInputElement;
  inp.addEventListener('change', async () => {
    const f = inp.files?.[0]; if (!f) return;
    try { const n = leerContexto(JSON.parse(await f.text())); if (!n.length) throw new Error(); cfg.contexto = true; poner(n, `Contexto importado: ${n.length} edificios.`); }
    catch { mensajeTunel('El archivo no tiene edificios: tiene que ser un contexto exportado por la app o uno como docs/contexto_urbano/contexto_ejemplo.json.'); }
  });
  const imp = h('label', { class: 'boton' }, '⤒ Importar…', inp);
  // plano del sitio en DXF: cada polilínea cerrada o círculo es un edificio; la altura, del número de la capa
  const inpDxf = h('input', { type: 'file', accept: '.dxf', hidden: '' }) as HTMLInputElement;
  inpDxf.addEventListener('change', async () => {
    const f = inpDxf.files?.[0]; if (!f) return;
    try { const d = leerDXFCompleto(await f.text()); if (!d.entidades.length) throw new Error(); dxfSitio = { d, nombre: f.name }; estado.avisarPanel(); }
    catch { mensajeTunel('No se pudo leer el DXF (tiene que ser un DXF de texto, como el que guarda AutoCAD).'); }
  });
  const impDxf = h('label', { class: 'boton' }, '⤒ Plano del sitio (DXF)…', inpDxf);
  const quitar = h('button', { type: 'button', class: 'boton' }, 'Quitar todos');
  quitar.addEventListener('click', () => poner(null, 'Contexto quitado: la torre vuelve a estar aislada. Ctrl+Z deshace.'));
  if (!eds.length) quitar.setAttribute('disabled', '');
  el.append(h('div', { class: 'fila-acciones' }, imp, impDxf, exp, quitar));
  if (dxfSitio) el.append(armarDxfSitio(eds, t, poner));
}

/** el DXF del sitio elegido, esperando que se confirme cómo se importa */
let dxfSitio: { d: DibujoCAD; nombre: string } | null = null;
const opDxf = { altura: 30, dx: 0, dy: 0 };
function armarDxfSitio(eds: EdificioVecino[], t: { pol: { x: number; y: number }[] }, poner: (n: EdificioVecino[] | null, m: string) => void): H {
  const { d, nombre } = dxfSitio!, u = factorUnidad(d);
  const prueba = contextoDesdeCAD(d.entidades, u.factor, opDxf.dx, opDxf.dy, opDxf.altura, t.pol.length >= 3 ? cajaDe(t.pol) : null);
  const num = (rot: string, v: number, al: (x: number) => void, positivo = false) => {
    const i = h('input', { type: 'text', inputmode: 'decimal', value: fmt(v, 2), class: 'n' }) as HTMLInputElement;
    i.addEventListener('change', () => { const x = parseFloat(i.value.replace(',', '.').replace('−', '-')); if (isFinite(x) && (!positivo || x > 0)) { al(x); estado.avisarPanel(); } else i.value = fmt(v, 2); });
    return h('label', { class: 'campo' }, h('span', {}, rot), i);
  };
  const capasConAltura = [...new Set(prueba.edificios.map(e => e.nombre))].filter(c => /\d/.test(c));
  const usar = (reemplazar: boolean) => {
    const nuevos = prueba.edificios.map((e, k) => ({ ...e, id: `D${(reemplazar ? 0 : eds.length) + k + 1}` }));
    dxfSitio = null; cfg.contexto = true;
    poner(reemplazar ? nuevos : [...eds, ...nuevos], `Plano del sitio: ${nuevos.length} edificios${prueba.omitidos ? ` (se dejó afuera el contorno de la torre)` : ''}. Ctrl+Z deshace.`);
  };
  const agregar = h('button', { type: 'button', class: 'boton primario' }, `Agregar ${prueba.edificios.length}`);
  agregar.addEventListener('click', () => usar(false));
  const reemplazar = h('button', { type: 'button', class: 'boton' }, 'Reemplazar los vecinos');
  reemplazar.addEventListener('click', () => usar(true));
  const cancelar = h('button', { type: 'button', class: 'boton' }, 'Cancelar');
  cancelar.addEventListener('click', () => { dxfSitio = null; estado.avisarPanel(); });
  if (!prueba.edificios.length) { agregar.setAttribute('disabled', ''); reemplazar.setAttribute('disabled', ''); }
  return h('div', { class: 'dxf-sitio' },
    h('b', { class: 'col-sub' }, `Plano del sitio: ${nombre}`),
    h('p', { class: 'nota chica' }, `Unidades: ${u.unidad}${d.unidad === 'desconocida' ? ' (adivinadas por el tamaño del dibujo)' : ''}. ${prueba.edificios.length} edificios (polilíneas cerradas y círculos)${prueba.omitidos ? `; ${prueba.omitidos} contorno${prueba.omitidos > 1 ? 's' : ''} que coincide${prueba.omitidos > 1 ? 'n' : ''} con la torre se deja${prueba.omitidos > 1 ? 'n' : ''} afuera` : ''}. ${capasConAltura.length ? `La altura sale del número de la capa (${capasConAltura.slice(0, 4).join(', ')}${capasConAltura.length > 4 ? '…' : ''}); ` : ''}${prueba.sinAltura ? `${prueba.sinAltura} sin número en la capa van con la altura de abajo.` : ''}`),
    h('div', { class: 'grilla2' }, num('Altura si la capa no dice (m)', opDxf.altura, x => { opDxf.altura = x; }, true), h('span', {}),
      num('Correr en x (m)', opDxf.dx, x => { opDxf.dx = x; }), num('Correr en y (m)', opDxf.dy, x => { opDxf.dy = x; })),
    h('p', { class: 'nota chica' }, 'El plano tiene que estar en las mismas coordenadas que la planta del proyecto; si no, corrélo hasta que la torre del plano caiga sobre la del proyecto (el plano chico de arriba se actualiza después de agregar).'),
    h('div', { class: 'fila-acciones' }, agregar, ...(eds.length ? [reemplazar] : []), cancelar));
}

/** lee un contexto: el que exporta la app ({ edificios: [{ v, altura }] }) o el del documento ({ vecinos: [{ cx, cy, ancho, largo, altura }] }) */
function leerContexto(x: unknown): EdificioVecino[] {
  const o = x as { edificios?: EdificioVecino[]; vecinos?: { id?: string; nombre?: string; cx: number; cy: number; ancho: number; largo: number; altura: number }[] };
  const ok = (n: unknown) => typeof n === 'number' && isFinite(n);
  if (Array.isArray(o.edificios)) return o.edificios.filter(e => ok(e.altura) && e.altura > 0 && Array.isArray(e.v) && e.v.length >= 3 && e.v.every(q => ok(q.x) && ok(q.y))).map((e, i) => ({ id: String(e.id || `E${i + 1}`), nombre: String(e.nombre ?? ''), v: e.v.map(q => ({ x: q.x, y: q.y })), altura: e.altura }));
  if (Array.isArray(o.vecinos)) return o.vecinos.filter(v => [v.cx, v.cy, v.ancho, v.largo, v.altura].every(ok) && v.ancho > 0 && v.largo > 0 && v.altura > 0).map((v, i) => ({
    id: String(v.id || `E${i + 1}`), nombre: String(v.nombre ?? ''), altura: v.altura,
    v: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: v.cx + (a * v.ancho) / 2, y: v.cy + (b * v.largo) / 2 })) }));
  return [];
}

/** el plano chico: la torre, los vecinos (los que llegan al corte, más oscuros) y la dirección del viento */
function planoContexto(torre: { x: number; y: number }[], eds: EdificioVecino[], z: number): Element {
  const todos = [...torre, ...eds.flatMap(e => e.v)], c = cajaDe(todos.length ? todos : [{ x: 0, y: 0 }]);
  const W = 260, Hh = 190, m = 10, k = Math.min((W - 2 * m) / (c.x1 - c.x0 || 1), (Hh - 2 * m) / (c.y1 - c.y0 || 1));
  const X = (x: number) => m + (x - c.x0) * k, Y = (y: number) => Hh - m - (y - c.y0) * k;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, class: 'plano-contexto', role: 'img', 'aria-label': 'Plano del contexto urbano' });
  const pol = (pts: { x: number; y: number }[], fill: string) => svg.append(svgEl('polygon', { points: pts.map(q => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' '), fill, stroke: '#555', 'stroke-width': 0.6 }));
  eds.forEach(e => { pol(e.v, e.altura > z ? GRIS_VECINO : '#cfcbc1'); const cc = cajaDe(e.v); svg.append(svgEl('text', { x: X((cc.x0 + cc.x1) / 2), y: Y((cc.y0 + cc.y1) / 2) + 3, 'text-anchor': 'middle', 'font-size': 9, fill: '#1d1d24' }, e.id)); });
  if (torre.length >= 3) pol(torre, css('--ink', '#223344'));
  // el viento: A hacia +y, B hacia +x
  const [x1, y1, x2, y2] = estado.dir === 'A' ? [W - 16, Hh - 14, W - 16, Hh - 44] : [W - 50, Hh - 14, W - 20, Hh - 14];
  svg.append(svgEl('line', { x1, y1, x2, y2, stroke: css('--ink', '#223344'), 'stroke-width': 2, 'marker-end': 'url(#flechaCtx)' }));
  const defs = svgEl('defs', {}), mk = svgEl('marker', { id: 'flechaCtx', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' });
  mk.append(svgEl('path', { d: 'M0 0 L10 5 L0 10 z', fill: css('--ink', '#223344') })); defs.append(mk); svg.prepend(defs);
  return h('figure', { class: 'diagrama plano-contexto-fig' }, svg, h('figcaption', {}, `Viento ${estado.dir}. Gris oscuro: llegan al corte de ${fmt(z, 1)} m; gris claro: más bajos.`));
}

/** el tamaño del recuadro en metros, con la definición que le toca, y botones para achicarlo o agrandarlo en su lugar */
function tamanoVentana(geo: Geometria2D): H {
  const v = cfg.ventana!, r = det!.geo.r, m = 1 / geo.escala;             // metros por celda gruesa
  const redim = (w: number, hh: number) => { const cx = v.x0 + v.w / 2, cy = v.y0 + v.h / 2; ponerVentana({ x0: cx - w / 2, y0: cy - hh / 2, w, h: hh }); estado.avisarPanel(); };
  const campo = (rot: string, val: number, al: (x: number) => void) => {
    const i = h('input', { type: 'text', inputmode: 'decimal', value: fmt(val, 1), class: 'n' }) as HTMLInputElement;
    i.addEventListener('change', () => { const x = parseFloat(i.value.replace(',', '.')); if (x > 0) al(x / m); else i.value = fmt(val, 1); });
    return h('label', { class: 'campo' }, h('span', {}, rot), i);
  };
  const menos = h('button', { type: 'button', class: 'boton', title: 'El mismo centro, 30 % más chico: más definición' }, '− Más chico (más fino)');
  menos.addEventListener('click', () => redim(v.w * 0.7, v.h * 0.7));
  const mas = h('button', { type: 'button', class: 'boton', title: 'El mismo centro, 40 % más grande: menos definición' }, '+ Más grande');
  mas.addEventListener('click', () => redim(v.w * 1.4, v.h * 1.4));
  const cm = (100 * m) / r;
  return h('div', {},
    h('div', { class: 'grilla2' }, campo('Ancho del recuadro (m)', v.w * m, x => redim(x, v.h)), campo('Alto del recuadro (m)', v.h * m, x => redim(v.w, x))),
    h('div', { class: 'fila-acciones' }, menos, mas),
    h('p', { class: 'llave' }, `Recuadro de ${fmt(v.w * m, 1)} × ${fmt(v.h * m, 1)} m · celda fina de ${cm >= 10 ? fmt(cm, 0) : fmt(cm, 1)} cm (×${r}; el túnel, ${fmt(100 * m, 0)} cm)`),
    h('p', { class: 'nota chica' }, 'Más chico el recuadro, más fino el contorno que se ve y se simula, con un costo parecido. Pero el viento que entra por las orillas sigue teniendo la definición del túnel: un recuadro muy chico ve sobre todo lo que le llega de afuera. Conviene que abarque la esquina y un poco de aire alrededor (de medio ancho de torre para arriba).'));
}

/** los botones de zoom encima del túnel */
function botonesZoom(cv: HTMLCanvasElement): H {
  const b = (t: string, tit: string, f: () => void) => { const x = h('button', { type: 'button', title: tit, 'aria-label': tit }, t); x.addEventListener('click', f); return x; };
  aumento = h('span', {}); actualizarAumento();
  const chk = h('label', { class: 'zoom-chk', title: 'La ventana de detalle también arriba, sobre el túnel' }, h('input', { type: 'checkbox', ...(verRecuadroArriba ? { checked: '' } : {}) }), ' ventana arriba');
  chk.querySelector('input')!.addEventListener('change', e => { verRecuadroArriba = (e.target as HTMLInputElement).checked; dibujar(); });
  return h('div', { class: 'zoom-tunel' },
    b('+', 'Acercar (también con la rueda)', () => acercar(cv, 1.5)), b('−', 'Alejar', () => acercar(cv, 1 / 1.5)),
    b('⤢', 'Ver todo el túnel (también: doble clic)', () => { zoom.z = 1; zoom.ox = zoom.oy = 0; acercar(cv, 1); }), aumento,
    ...(det ? [chk] : []));
}

/** marcar el recuadro arrastrando sobre el túnel */
function prepararMarcado(cv: HTMLCanvasElement) {
  /** del puntero a la red (con el zoom) */
  const aRed = (e: PointerEvent | MouseEvent) => {
    const c = corrida!, b = cv.getBoundingClientRect(), k = cv.width / b.width;
    const bx = zoom.ox + ((e.clientX - b.left) * k) / zoom.z, by = zoom.oy + ((e.clientY - b.top) * k) / zoom.z, s = cv.width / c.geo.nx;
    return { x: bx / s, y: c.geo.ny - by / s };
  };
  // zoom: rueda (alrededor del puntero), arrastrar para moverse, doble clic para ver todo
  cv.addEventListener('wheel', e => {
    if (!corrida && !repro) return;
    e.preventDefault();
    const b = cv.getBoundingClientRect(), k = cv.width / b.width;
    acercar(cv, e.deltaY < 0 ? 1.2 : 1 / 1.2, (e.clientX - b.left) * k, (e.clientY - b.top) * k);
  }, { passive: false });
  cv.addEventListener('dblclick', () => { if (marcando) return; zoom.z = 1; zoom.ox = zoom.oy = 0; acercar(cv, 1); });
  let paneo: { x: number; y: number; ox: number; oy: number } | null = null;
  cv.addEventListener('pointerdown', e => {
    if (marcando || zoom.z <= 1.001) return;
    paneo = { x: e.clientX, y: e.clientY, ox: zoom.ox, oy: zoom.oy }; cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => {
    if (!paneo) return;
    const k = cv.width / cv.getBoundingClientRect().width;
    zoom.ox = paneo.ox - ((e.clientX - paneo.x) * k) / zoom.z; zoom.oy = paneo.oy - ((e.clientY - paneo.y) * k) / zoom.z; dibujar();
  });
  const finPaneo = () => { paneo = null; };
  cv.addEventListener('pointerup', finPaneo); cv.addEventListener('pointercancel', finPaneo);
  cv.addEventListener('pointerdown', e => {
    if (!marcando || !corrida || repro) return;
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    const p = aRed(e); arrastre = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  });
  cv.addEventListener('pointermove', e => { if (!arrastre || !corrida) return; const p = aRed(e); arrastre.x1 = p.x; arrastre.y1 = p.y; dibujar(); });
  const soltar = (e: PointerEvent) => {
    if (!arrastre || !corrida) return;
    const a = arrastre; arrastre = null; marcando = false; cv.classList.remove('marcando');
    try { cv.releasePointerCapture(e.pointerId); } catch { /* ya estaba suelto */ }
    const w = Math.abs(a.x1 - a.x0), hh = Math.abs(a.y1 - a.y0);
    // un clic sin arrastrar: un recuadro de un ancho de torre alrededor del punto
    const D = corrida.geo.D, v = w < 3 && hh < 3 ? { x0: a.x0 - D / 2, y0: a.y0 - D / 2, w: D, h: D } : { x0: Math.min(a.x0, a.x1), y0: Math.min(a.y0, a.y1), w, h: hh };
    ponerVentana(v); estado.avisarPanel();
  };
  cv.addEventListener('pointerup', soltar);
  cv.addEventListener('pointercancel', () => { arrastre = null; dibujar(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && (marcando || arrastre)) { marcando = false; arrastre = null; cv.classList.remove('marcando'); dibujar(); estado.avisarPanel(); } });
}

// ---------------------------------------------------------------------------------------------------- centro
export function centroTunel(c: H, tam: Tam) {
  if (repro) { centroRepro(c, tam); return; }
  if (!corrida || corrida.clave !== claveCorrida()) iniciar();
  const cr = corrida;
  if (!cr) { c.append(h('p', { class: 'nota' }, 'Hace falta una planta con losa sobre PB para armar el túnel.')); return; }
  const ancho = Math.max(320, (tam.ancho ?? 900) - 10);
  if (!lienzo) { lienzo = document.createElement('canvas'); lienzo.className = 'tunel2d'; prepararMarcado(lienzo); }
  lienzo.classList.toggle('marcando', marcando);
  lienzo.width = Math.round(ancho); lienzo.height = Math.round((ancho * cr.geo.ny) / cr.geo.nx);
  lienzo.setAttribute('role', 'img');
  lienzo.setAttribute('aria-label', `Túnel de viento 2D: la planta de ${cr.nivel} con el viento ${estado.dir} de izquierda a derecha`);
  const reRed = (U0 * cr.geo.D) / cr.nu, reReal = (estimarV() * cr.geo.anchoM) / 1.5e-5;
  c.append(
    h('p', { class: 'cartel-tunel' }, 'Visualización didáctica: no reemplaza los coeficientes del CIRSOC 102 ni un ensayo en túnel de viento.'),
    ...(() => {
      // qué contorno está en el túnel: la carpintería (propia o heredada) o la losa, y si hay carpintería en otro piso
      const ne = nivelElegido(); if (!ne) return [];
      const p = estado.proyecto, c = contornoAlViento(p, ne.i), otros = p.niveles.filter(n => (n.carpinteria?.length ?? 0) >= 3).map(n => n.nombre);
      if (c.de === 'losa' && otros.length) return [h('p', { class: 'aviso-linea' }, `En ${ne.n.nombre} el viento choca con la losa: la carpintería está dibujada en ${otros.join(', ')}. Elegí ese corte o, en Diseño → Contornos → Carpintería, «Copiar a todos los niveles».`)];
      return [h('p', { class: 'llave' }, `Contorno en el túnel: ${c.de === 'carpintería' ? `la carpintería${(p.niveles[ne.i].carpinteria?.length ?? 0) >= 3 ? ` de ${ne.n.nombre}` : ' (heredada de otro nivel)'}` : 'la losa (no hay carpintería dibujada)'}.`)];
    })(),
    h('div', { class: 'tunel-marco' }, lienzo, botonesZoom(lienzo)),
    h('p', { class: 'nota' }, `Planta de ${cr.nivel} (${fmt(cr.cota, 2)} m) · viento ${estado.dir}${cfg.angulo ? ` girado ${cfg.angulo}°` : ''} de izquierda a derecha · ancho de la torre ${fmt(cr.geo.anchoM, 1)} m = ${cr.geo.D} celdas · canal de ${cr.geo.nx} × ${cr.geo.ny} celdas, periódico arriba y abajo (la torre tapa el ${fmt((100 * cr.geo.D) / cr.geo.ny, 0)} % del alto del canal) · paredes ${cfg.paredes === 'exactas' ? 'exactas: el aire choca con el contorno real, no con el borde de las celdas (rebote interpolado de Bouzidi y colisión TRT)' : 'en escalera: la pared es el borde de las celdas'}. Reynolds de la simulación ≈ ${fmt(reRed, 0)}; el real, con la V de diseño, ≈ ${(reReal / 1e6).toFixed(0)} millones: en una planta de aristas vivas el aire se despega en las esquinas casi a cualquier Reynolds, por eso la estela y el Strouhal se parecen; en una planta redondeada, no.`),
    h('p', { class: 'llave' }, cfg.vista === 'vorticidad' ? 'Color: giro del aire (naranja antihorario, violeta horario).' : cfg.vista === 'velocidad' ? 'Color: velocidad con un espectro térmico, de violeta muy oscuro (quieto) a naranja y amarillo claro (1,6 veces la de entrada o más).' : 'Color: presión en Cp, azul la que empuja (comprime) y rojo la que succiona (tracciona), como en toda la app.'),
  );
  if (det) {
    // la ventana fina: al menos 360 px de ancho, o el doble del recuadro en el túnel
    const wD = Math.min(ancho, 640, Math.max(360, (520 * det.geo.nx) / det.geo.ny));
    if (!lienzoDet) { lienzoDet = document.createElement('canvas'); lienzoDet.className = 'tunel2d'; lienzoDet.setAttribute('role', 'img'); }
    lienzoDet.width = Math.round(wD); lienzoDet.height = Math.round((wD * det.geo.ny) / det.geo.nx);
    lienzoDet.style.maxWidth = `${Math.round(wD)}px`;
    lienzoDet.setAttribute('aria-label', 'Ventana de detalle del túnel 2D, con la grilla más fina');
    panelDet = h('div', {});
    c.append(h('div', { class: 'ventana-detalle' },
      h('h3', { class: 'subtit' }, `Ventana de detalle ×${det.geo.r}`),
      h('p', { class: 'llave' }, `El recuadro naranja del túnel, con celdas ${det.geo.r} veces más chicas (${det.geo.nx} × ${det.geo.ny}; la torre tendría ${cr.geo.D * det.geo.r} celdas de ancho). Mismos colores que arriba; la línea naranja es el contorno real. La franja velada del borde es la transición con el túnel grueso: ahí lo fino se acerca de a poco al viento de afuera (salvo pegado a la torre) y no se mide.`),
      h('div', { class: 'tunel-marco' }, lienzoDet), panelDet,
      h('p', { class: 'nota' }, 'Anidamiento en un solo sentido: las orillas de la ventana toman el viento del túnel grueso y lo fino no le devuelve nada. Sirve para ver cómo se despega el aire en una esquina o un balcón con más definición; los remolinos que nacen en la ventana y salen de ella el túnel grueso no los ve, y lo que entra por las orillas tiene la definición del túnel grueso.')));
    ultimaLectura = 0;
  }
  cajaCp = h('div', { class: 'cp-perimetro' }); c.append(cajaCp); anchoCp = Math.min(ancho, 900); ultimoCp = 0; armarCp();
  resultadosPisos(c, Math.min(ancho, 900));
  // mientras se simula la torre piso por piso, el túnel de la vista queda en pausa
  if (!cr.corriendo && !cr.roto && cr.cuadrosSinMirar > 2 && !(pisos && !pisos.fin)) { cr.cuadrosSinMirar = 0; correr(true); }
  dibujar();
}

function estimarV(): number { try { return vientoCirsoc().V; } catch { return 40; } }

// ---------------------------------------------------------------------------------------------------- panel
export function panelTunel(c: H) {
  const ns = niveles();
  const cambiar = (f: () => void) => { f(); estado.avisarPanel(); };
  const sel = <T extends string>(rot: string, ops: [T, string][], val: T, al: (x: T) => void) => {
    const s = h('select', {}) as HTMLSelectElement;
    ops.forEach(([v, t]) => s.append(new Option(t, v, false, v === val)));
    s.addEventListener('change', () => cambiar(() => al(s.value as T)));
    return h('label', { class: 'campo' }, h('span', {}, rot), s);
  };
  c.append(h('p', { class: 'nota' }, 'Un corte en planta de la torre dentro de un canal de viento, simulado con el método de Lattice Boltzmann. Muestra cómo se despega el aire en las esquinas y cómo se desprenden los remolinos de la estela. Didáctico: no cambia ningún número de ningún método.'));
  const play = h('button', { type: 'button', class: 'boton' }, corrida && !corrida.corriendo ? '▶ Seguir' : '⏸ Pausa');
  play.addEventListener('click', () => { if (!corrida) return; correr(!corrida.corriendo); play.textContent = corrida.corriendo ? '⏸ Pausa' : '▶ Seguir'; estado.avisarPanel(); });
  const reini = h('button', { type: 'button', class: 'boton' }, '↺ Empezar de nuevo');
  reini.addEventListener('click', () => { iniciar(); estado.avisarPanel(); });
  c.append(h('div', { class: 'fila-acciones' }, play, reini));
  const d = seccion('Túnel').cuerpo; c.append(d.parentElement!);
  d.append(h('div', { class: 'grilla2' },
    sel('Corte en planta', ns.map(x => [x.n.nombre, `${x.n.nombre} (${fmt(x.n.cota, 1)} m) · ${contornoAlViento(estado.proyecto, x.i).de}${(estado.proyecto.niveles[x.i].carpinteria?.length ?? 0) >= 3 ? ' propia' : ''}`] as [string, string]), nivelElegido()?.n.nombre ?? '', x => { cfg.nivel = x; }),
    sel('Giro del viento', ['-45', '-30', '-15', '0', '15', '30', '45'].map(a => [a, a === '0' ? `0° (viento ${estado.dir})` : `${a}°`] as [string, string]), String(cfg.angulo), x => { cfg.angulo = +x; }),
    sel('Reynolds', Object.entries(RE).map(([k, v]) => [k, v.texto] as [string, string]), cfg.re, x => { cfg.re = x; }),
    sel('Resolución', Object.entries(RES).map(([k, v]) => [k, v.texto] as [string, string]), cfg.res, x => { cfg.res = x; }),
    sel('Paredes', [['exactas', 'exactas: la curva real (rebote interpolado + TRT)'], ['escalera', 'en escalera (como antes, para comparar)']], cfg.paredes, x => { cfg.paredes = x; }),
    sel('Canal', [['ancho', 'ancho: 12 anchos (bloquea ≈ 8 %, más preciso)'], ['angosto', 'angosto: 7 anchos (≈ 14 %, más rápido)']], cfg.canal, x => { cfg.canal = x; }),
    sel('Velocidad del túnel', [['normal', 'normal (0,1 de la red)'], ['lento', 'lenta (0,06: más estable, tarda más)']], cfg.lento ? 'lento' : 'normal', x => { cfg.lento = x === 'lento'; }),
    sel('Planta', [['dibujada', 'como está dibujada'], ['vivas', 'su caja, con esquinas vivas (para comparar)']], cfg.forma, x => { cfg.forma = x; }),
    sel('Ochavas', ['0', '5', '10', '15'].map(v => [v, v === '0' ? 'sin ochavas (esquinas vivas)' : `${v} % del ancho`] as [string, string]), String(cfg.ochava), x => { cfg.ochava = +x; }),
    sel('Otra torre igual', [['no', 'no'], ['detras', 'detrás'], ['lado', 'al lado']], cfg.segunda, x => { cfg.segunda = x; }),
    cfg.segunda !== 'no' ? sel('Separación (anchos)', ['0.5', '1', '2', '3', '4'].map(v => [v, v.replace('.', ',')] as [string, string]), String(cfg.distancia), x => { cfg.distancia = +x; }) : h('span', {}),
    sel('Color', [['vorticidad', 'giro del aire (remolinos)'], ['velocidad', 'velocidad'], ['presion', 'presión (Cp)']], cfg.vista, x => { cfg.vista = x; }),
    sel('Flechas de la velocidad', [['fijas', 'del mismo largo (el color dice la velocidad)'], ['proporcionales', 'el largo dice la velocidad'], ['no', 'sin flechas']], cfg.flechas, x => { cfg.flechas = x; }),
  ));
  const humo = h('label', { class: 'campo-linea' }, h('input', { type: 'checkbox', ...(cfg.humo ? { checked: '' } : {}) }), ' Humo (partículas que lleva el viento)');
  humo.querySelector('input')!.addEventListener('change', e => { cfg.humo = (e.target as HTMLInputElement).checked; dibujar(); });
  const cpc = h('label', { class: 'campo-linea' }, h('input', { type: 'checkbox', ...(cfg.cpContorno ? { checked: '' } : {}) }), ' Presión sobre el contorno (Cp promedio: azul empuja, rojo succiona)');
  cpc.querySelector('input')!.addEventListener('change', e => { cfg.cpContorno = (e.target as HTMLInputElement).checked; dibujar(); });
  d.append(cpc);
  const iso = h('label', { class: 'campo-linea' }, h('input', { type: 'checkbox', ...(cfg.isolineas ? { checked: '' } : {}) }), ' Isolíneas de la velocidad media (1,2 y 1,4 veces la de entrada: dónde se acelera el aire)');
  iso.querySelector('input')!.addEventListener('change', e => { cfg.isolineas = (e.target as HTMLInputElement).checked; dibujar(); });
  d.append(humo, iso, h('p', { class: 'nota' }, 'El viento A o B es el del selector de arriba. Cambiar el corte, el giro, el Reynolds, la resolución, las ochavas o la otra torre empieza la simulación de nuevo; el color y el humo, no.'));
  const cu = seccion('Contexto urbano (torres vecinas)').cuerpo; c.append(cu.parentElement!);
  panelContexto(cu);
  const vd = seccion('Ventana de detalle').cuerpo; c.append(vd.parentElement!);
  {
    const rotulo = () => (marcando ? 'Arrastrá sobre el túnel… (Esc cancela)' : '▭ Marcar un recuadro en el túnel');
    const marcar = h('button', { type: 'button', class: 'boton' }, rotulo());
    marcar.addEventListener('click', () => { marcando = !marcando; lienzo?.classList.toggle('marcando', marcando); marcar.textContent = rotulo(); });
    const quitar = h('button', { type: 'button', class: 'boton' }, 'Quitar la ventana');
    quitar.addEventListener('click', () => { ponerVentana(null); estado.avisarPanel(); });
    if (!cfg.ventana) quitar.setAttribute('disabled', '');
    vd.append(h('div', { class: 'grilla2' }, sel('Definición', [['auto', `automática (según el tamaño, ×2 a ×${FINURA_MAX})`], ['2', '×2 fija'], ['4', '×4 fija'], ['8', '×8 fija (el recuadro se achica si hace falta)']], String(cfg.fino) as 'auto' | '2' | '4' | '8', x => { cfg.fino = x === 'auto' ? 'auto' : (+x as 2 | 4 | 8); if (cfg.ventana) ponerVentana(cfg.ventana); })),
      h('div', { class: 'fila-acciones' }, marcar, quitar),
      ...(cfg.ventana && det && corrida ? [tamanoVentana(corrida.geo)] : []),
      h('p', { class: 'nota' }, 'Arrastrá un recuadro sobre una esquina o un balcón (o hacé un clic: marca un ancho de torre alrededor). Esa parte se vuelve a simular con una grilla más fina, debajo del túnel, con la velocidad más alta y la succión más fuerte que se miden ahí. Con la definición automática, cuanto más chico el recuadro, más fina la grilla; el túnel anda, como mucho, a la mitad o un tercio de la velocidad.'));
  }
  const gr = seccion('Grabar y reproducir').cuerpo; c.append(gr.parentElement!);
  armarPanelGrabacion(gr);
  const m = seccion('Lo que se mide').cuerpo; c.append(m.parentElement!);
  panelMed = h('div', {});
  m.append(panelMed);
  actualizarMediciones();
  const ca = seccion('Comparar formas de esquina').cuerpo; c.append(ca.parentElement!);
  panelAnot = h('div', {}); ca.append(panelAnot); armarAnotadas();
  const pp = seccion('Torre piso por piso').cuerpo; c.append(pp.parentElement!);
  armarPanelPisos(pp);
  const gp = seccion('Túnel 3D: probar la placa de video').cuerpo; c.append(gp.parentElement!);
  const ponerGpu = () => { gp.replaceChildren(seccionPruebaGpu(ponerGpu)); };
  ponerGpu();
}

/** anotar y comparar formas: la planta dibujada contra su caja con esquinas vivas (u otras esquinas) */
let panelAnot: H | null = null;
function armarAnotadas() {
  const el = panelAnot;
  if (!el) return;
  const anotar = h('button', { type: 'button', class: 'boton primario' }, 'Anotar esta medición');
  anotar.title = 'Guarda Cd, Cl, St y V crítica de la corrida actual (cuando ya se midieron) para compararlas con otra forma';
  anotar.addEventListener('click', () => {
    const c = corrida, md = c?.med;
    if (!c || !md || !isFinite(md.Cd)) { anotar.textContent = 'Todavía midiendo: esperá unas pasadas'; return; }
    let n1 = NaN; try { n1 = vientoCirsoc()[estado.dir].n1; } catch { /* sin datos */ }
    const St = md.St ?? null;
    const forma = `${cfg.forma === 'vivas' ? 'caja, esquinas vivas' : 'dibujada'}${cfg.ochava ? ` + ochavas ${cfg.ochava} %` : ''} · ${c.nivel}${cfg.angulo ? ` · ${cfg.angulo}°` : ''} · Re ${RE[cfg.re].Re} · paredes ${cfg.paredes} · canal ${cfg.canal}${c.geo.contornos.length > c.geo.nTorre && cfg.segunda === 'no' ? ` · con ${c.geo.contornos.length - c.geo.nTorre} vecinos` : ' · aislada'}`;
    anotadas.push({ forma, Cd: md.Cd, Cl: md.ClRms, St, Vcr: St ? velocidadCritica(n1, c.geo.anchoM, St) : NaN });
    armarAnotadas();
  });
  const hijos: H[] = [h('div', { class: 'fila-acciones' }, anotar)];
  if (anotadas.length) {
    const borrar = h('button', { type: 'button', class: 'boton' }, 'Borrar las anotadas');
    borrar.addEventListener('click', () => { anotadas.length = 0; armarAnotadas(); });
    hijos[0].append(borrar);
    const ref = anotadas[0];
    const dif = (x: number, r: number) => (isFinite(x) && isFinite(r) && r !== 0 && Math.abs(x / r - 1) > 0.005 ? ` (${x > r ? '+' : '−'}${fmt(Math.abs(100 * (x / r - 1)), 0)} %)` : '');
    hijos.push(h('table', { class: 'tabla chica' },
      h('thead', {}, h('tr', {}, ...['forma', 'Cd', 'Cl eficaz', 'St', 'V crítica'].map(x => h('th', {}, x)))),
      h('tbody', {}, ...anotadas.map(a => h('tr', {}, h('td', {}, a.forma),
        h('td', { class: 'n' }, `${fmt(a.Cd, 2)}${dif(a.Cd, ref.Cd)}`), h('td', { class: 'n' }, `${fmt(a.Cl, 2)}${dif(a.Cl, ref.Cl)}`),
        h('td', { class: 'n' }, a.St ? fmt(a.St, 3) : '—'), h('td', { class: 'n' }, isFinite(a.Vcr) ? `${fmt(a.Vcr, 1)} m/s` : '—'))))));
  }
  hijos.push(h('p', { class: 'nota' }, 'Para ver cuánto ayudan las esquinas: con el mismo corte, Reynolds y resolución, anotá la planta como «su caja, con esquinas vivas» y después «como está dibujada» (los porcentajes comparan con la primera anotada). Menos Cd: menos empuje en el sentido del viento. Menos Cl: menos sacudida de costado por los remolinos. La V crítica = n1·B/St conviene que quede bien por encima del viento de diseño.'));
  el.replaceChildren(...hijos);
}

// ---------------------------------------------------------------------------------------------- piso por piso
/**
 * Túnel piso por piso (propuesta 3): cada planta distinta de la torre en su worker, con la misma configuración del
 * túnel (Reynolds, resolución, paredes, canal, giro); el Cd de cada planta se aplica a la franja de su piso con el qz
 * del 102-25.
 */
const PASADAS: Record<string, { n: number; texto: string }> = { rapida: { n: 60, texto: 'rápida (60 pasadas)' }, normal: { n: 120, texto: 'normal (120 pasadas)' }, larga: { n: 200, texto: 'larga (200 pasadas, más estable)' } };
interface CorridaPisos { clave: string; grupos: GrupoPlanta[]; res: Map<string, ResultadoPlanta>; avance: Map<string, number>; workers: Worker[]; pendientes: GrupoPlanta[]; t0: number; fin: number }
let pisos: CorridaPisos | null = null;
let pasadasPisos = 'normal';
const clavePisos = () => JSON.stringify([estado.revision, estado.dir, cfg.angulo, cfg.re, cfg.res, cfg.paredes, cfg.canal, pasadasPisos, cfg.contexto]);
/** la geometría y el pedido de una planta, con la configuración del túnel */
function pedidoPlanta(g: GrupoPlanta): { pedido: PedidoMedicion; anchoM: number } {
  const D = RES[cfg.res].D, re = RE[cfg.re];
  const geo = geometria2D({ poligonos: [g.pol], dir: estado.dir, angulo: cfg.angulo, D, largo: 16, alto: cfg.canal === 'ancho' ? 12 : 7, entrada: 4, contexto: g.vecinos });
  // con vecinos, el túnel lento (en las calles el aire se acelera)
  const u0 = cfg.lento || g.vecinos.length ? 0.06 : 0.1;
  const exactas = cfg.paredes === 'exactas', pasos = Math.round((PASADAS[pasadasPisos].n * geo.D) / u0);
  return { anchoM: geo.anchoM, pedido: { nx: geo.nx, ny: geo.ny, solido: geo.solido, nu: (u0 * geo.D) / re.Re, u0, cs: re.cs, D: geo.D, q: exactas ? geo.q : undefined, colision: exactas ? 'trt' : 'bgk', pasos, desde: Math.min(pasos - 1000, Math.round((0.6 * geo.nx) / u0)), cuerpo: geo.cuerpo } };
}
function detenerPisos() { pisos?.workers.forEach(w => w.terminate()); if (pisos) pisos.workers = []; }
function empezarPisos() {
  detenerPisos();
  correr(false);                                                    // el túnel de la vista se pausa: cada núcleo, una planta
  const grupos = plantasDistintas(estado.proyecto, cfg.contexto ? edificiosVecinos() : []);
  pisos = { clave: clavePisos(), grupos, res: new Map(), avance: new Map(), workers: [], pendientes: [...grupos], t0: performance.now(), fin: 0 };
  const n = Math.max(1, Math.min(grupos.length, 4, (navigator.hardwareConcurrency || 2) - 1));
  for (let k = 0; k < n; k++) siguientePlanta();
}
function siguientePlanta() {
  const c = pisos;
  if (!c) return;
  const g = c.pendientes.shift();
  if (!g) { if (!c.workers.length && !c.fin) { c.fin = performance.now(); estado.avisarPanel(); } return; }
  const { pedido, anchoM } = pedidoPlanta(g);
  const w = new MedicionWorker();
  c.workers.push(w);
  w.onmessage = (e: MessageEvent<RespuestaMedicion>) => {
    if (pisos !== c) { w.terminate(); return; }
    const r = e.data;
    if (r.tipo === 'avance') { c.avance.set(g.clave, r.hechos / r.pasos); actualizarAvancePisos(); return; }
    c.res.set(g.clave, { Cd: r.med.Cd, ClRms: r.med.ClRms, St: r.med.St, anchoM, roto: r.roto });
    c.avance.set(g.clave, 1);
    w.terminate(); c.workers = c.workers.filter(x => x !== w);
    if (!c.pendientes.length && !c.workers.length) c.fin = performance.now();
    estado.avisarPanel();
    siguientePlanta();
  };
  w.postMessage(pedido, pedido.q ? [pedido.solido.buffer, pedido.q.buffer] : [pedido.solido.buffer]);
}
let panelPisos: H | null = null;
function actualizarAvancePisos() {
  const el = panelPisos, c = pisos;
  if (!el?.isConnected || !c) return;
  el.querySelectorAll<HTMLElement>('[data-planta]').forEach(b => { const a = c.avance.get(b.dataset.planta!) ?? 0; (b.firstElementChild as HTMLElement).style.width = `${Math.round(a * 100)}%`; });
}
/** el panel: cuántas plantas, cuánto tarda (estimado), el botón y el avance de cada una */
function armarPanelPisos(el: H) {
  panelPisos = el;
  const grupos = plantasDistintas(estado.proyecto, cfg.contexto ? edificiosVecinos() : []), c = pisos && pisos.clave === clavePisos() ? pisos : null;
  const nNiv = grupos.reduce((s, g) => s + g.niveles.length, 0);
  // tiempo estimado: ≈ 15 millones de celdas por segundo por núcleo en JavaScript
  const est = grupos.length ? (() => { const { pedido } = pedidoPlanta(grupos[0]); const nW = Math.max(1, Math.min(grupos.length, 4, (navigator.hardwareConcurrency || 2) - 1)); return (Math.ceil(grupos.length / nW) * pedido.nx * pedido.ny * pedido.pasos) / 15e6; })() : 0;
  const sel = h('select', {}) as HTMLSelectElement;
  Object.entries(PASADAS).forEach(([k, v]) => sel.append(new Option(v.texto, k, false, k === pasadasPisos)));
  sel.addEventListener('change', () => { pasadasPisos = sel.value; estado.avisarPanel(); });
  const corriendo = !!c && !c.fin;
  const b = h('button', { type: 'button', class: `boton${corriendo ? '' : ' primario'}` }, corriendo ? '⏹ Detener' : c?.fin ? '↺ Simular de nuevo' : '▶ Simular la torre piso por piso') as HTMLButtonElement;
  b.addEventListener('click', () => { if (corriendo) { detenerPisos(); pisos = null; } else empezarPisos(); estado.avisarPanel(); });
  const filas = grupos.map((g, k) => {
    const r = c?.res.get(g.clave), barra = h('span', { class: 'pp-barra', 'data-planta': g.clave }, h('i', {}));
    (barra.firstElementChild as HTMLElement).style.width = `${Math.round((c?.avance.get(g.clave) ?? 0) * 100)}%`;
    const desde = g.niveles[0].nombre, hasta = g.niveles[g.niveles.length - 1].nombre;
    return h('div', { class: 'pp-fila' }, h('span', {}, `Planta ${k + 1} · ${g.de} · ${g.niveles.length > 1 ? `${desde} a ${hasta}` : desde} (${g.niveles.length} ${g.niveles.length > 1 ? 'niveles' : 'nivel'})${g.vecinos.length ? ` · ${g.vecinos.length} vecinos` : ''}`),
      r ? h('span', { class: 'nota chica' }, `Cd ${fmt(r.Cd, 2)} · Cl ±${fmt(r.ClRms, 2)} · St ${r.St ? fmt(r.St, 3) : '—'}${r.roto ? ' · inestable' : ''}`) : barra);
  });
  el.replaceChildren(
    h('p', { class: 'nota' }, `${grupos.length} ${grupos.length === 1 ? 'planta distinta' : 'plantas distintas'} en ${nNiv} niveles (los pisos iguales se simulan una vez). Con la configuración del túnel de arriba. Tiempo estimado: ${est < 90 ? `${Math.max(1, Math.round(est))} s` : `${Math.round(est / 60)} min`} en ${Math.max(1, Math.min(grupos.length, 4, (navigator.hardwareConcurrency || 2) - 1))} núcleo(s).`),
    h('label', { class: 'campo' }, h('span', {}, 'Duración de cada simulación'), sel),
    h('div', { class: 'fila-acciones' }, b), ...filas,
    ...(c?.fin ? [h('p', { class: 'nota chica' }, `Listo en ${fmt((c.fin - c.t0) / 1000, 0)} s. Los resultados están debajo del túnel.`)] : []),
  );
}
/** los resultados en el centro: Cd y fuerza piso por piso contra el reglamento */
function resultadosPisos(c: H, ancho: number) {
  const r = pisos && pisos.clave === clavePisos() ? pisos : null;
  if (!r || !r.res.size) return;
  let v; try { v = vientoCirsoc()[estado.dir]; } catch { return; }
  const f = fuerzasPorPiso(v, r.grupos, r.res);
  if (!f.length) return;
  const pts = (x: (k: typeof f[number]) => number) => f.map(k => ({ z: k.z, nivel: k.nivel, x: x(k) }));
  const qs = corteYMomento(f.map(k => ({ z: k.z, F: k.Fsim }))), qr = corteYMomento(f.map(k => ({ z: k.z, F: k.Freg })));
  c.append(
    h('h3', { class: 'subtit' }, `Torre piso por piso · viento ${estado.dir}`),
    h('p', { class: 'llave' }, `Corte en PB: ${fmt(qs.Q, 1)} t con la simulación y ${fmt(qr.Q, 1)} t con el CIRSOC 102-25 · momento ${fmt(qs.M, 0)} tm y ${fmt(qr.M, 0)} tm.`),
    h('p', { class: 'nota' }, 'Cada planta se simula como un prisma infinito (2D) y da el arrastre medio de esa silueta. No es una carga de diseño: no ve el aire que pasa por arriba de la azotea ni el del pie (eso baja el arrastre de una torre real) y no tiene la ráfaga del reglamento (G o Gf, que lo sube). Sirve para comparar plantas y pisos entre sí: dónde la silueta empuja más, dónde se sacude más de costado (Cl) y cómo cambia el Strouhal. El coeficiente del reglamento es (p barlovento − p sotavento) / qz, con la ráfaga incluida.'),
    graficoAltura({ titulo: `Coeficiente de arrastre por piso · viento ${estado.dir}`, eje: 'coeficiente', unidad: '', decimales: 2,
      series: [{ nombre: 'Cd de la simulación (planta del piso, 2D)', color: 'corte', tipo: 'linea', puntos: pts(k => k.Cd) }, { nombre: 'coeficiente del CIRSOC 102-25', color: 'carga', punteada: true, tipo: 'linea', puntos: pts(k => k.Creg) }] }, { ancho, alto: 320 }),
    graficoAltura({ titulo: `Fuerza de cada nivel · viento ${estado.dir}`, eje: 'fuerza', unidad: 't', decimales: 1,
      series: [{ nombre: 'con el Cd simulado', color: 'corte', tipo: 'barras', puntos: pts(k => k.Fsim) }, { nombre: 'CIRSOC 102-25', color: 'carga', punteada: true, tipo: 'linea', puntos: pts(k => k.Freg) }] }, { ancho, alto: 360 }),
    tablaValores(['Nivel', 'z (m)', 'Cd sim.', 'Cl eficaz', 'St', 'Coef. 102-25', 'F sim. (t)', 'F 102-25 (t)'], f.map(k => [k.nivel, k.z, k.Cd, k.ClRms, k.St ?? '—', k.Creg, k.Fsim, k.Freg]), [0, 1, 2, 2, 3, 2, 2, 2]),
  );
  const csv = h('button', { type: 'button', class: 'mini' }, '⤓ Piso por piso (CSV para Excel)');
  csv.addEventListener('click', () => descargarCSV(`piso_por_piso_viento${estado.dir}.csv`,
    ['Nivel', 'z (m)', 'ancho (m)', 'h influencia (m)', 'Cd simulado', 'Cl eficaz', 'Strouhal', 'coeficiente 102-25', 'F simulada (t)', 'F 102-25 (t)'],
    f.map(k => [k.nivel, k.z, k.ancho, k.hInf, k.Cd, k.ClRms, k.St, k.Creg, k.Fsim, k.Freg]), 3));
  c.append(h('div', { class: 'fila-acciones' }, csv));
}

// ---------------------------------------------------------------------------------------------- grabar y reproducir
/**
 * Grabación (propuesta 4): los cuadros que llegan del worker se guardan (8 bits, a la mitad de resolución si la grilla
 * es grande) junto con las fuerzas de cada paso; «Detener y guardar» descarga un .torreviento. «Abrir grabación…» lo
 * reproduce sin simular, con los mismos colores, el humo y el Cp del contorno, y lo puede pasar a video (WebM).
 */
const DURACIONES: Record<string, { n: number | null; texto: string }> = { libre: { n: null, texto: 'hasta que la detenga' }, '100': { n: 100, texto: '100 pasadas' }, '300': { n: 300, texto: '300 pasadas' }, '1000': { n: 1000, texto: 'corrida larga: 1000 pasadas' } };
let duracion = 'libre';
let grab: { g: Grabadora; clave: string; hasta: number | null; t0: number; ultimoAviso: number; pasos0: number } | null = null;
let panelGrab: H | null = null;
function empezarGrabacion() {
  const c = corrida;
  if (!c) return;
  const f = c.geo.nx * c.geo.ny > 60000 ? 2 : 1;
  grab = { g: new Grabadora(c.geo.nx, c.geo.ny, c.geo.solido, f, 2.2 * U0, 0.06, 360, (3 * U0) / c.geo.D), clave: c.clave, hasta: DURACIONES[duracion].n !== null ? (c.pasos * U0) / c.geo.D + DURACIONES[duracion].n! : null, t0: performance.now(), ultimoAviso: 0, pasos0: c.pasos };
  if (!c.corriendo) correr(true);
  estado.avisarPanel();
}
async function terminarGrabacion() {
  const gr = grab, c = corrida;
  grab = null;
  if (!gr || !c || !gr.g.cuadros.length) { estado.avisarPanel(); return; }
  const f = gr.g.factor, { default: JSZip } = await import('jszip');
  const blob = await empaquetar(JSZip, gr.g, {
    titulo: `${estado.proyecto.nombre || 'Torre'} · ${c.nivel} · viento ${estado.dir}`, nivel: c.nivel, cota: c.cota, dir: estado.dir,
    config: { angulo: cfg.angulo, re: cfg.re, res: cfg.res, paredes: cfg.paredes, canal: cfg.canal, forma: cfg.forma, ochava: cfg.ochava },
    D: c.geo.D / f, anchoM: c.geo.anchoM, escala: c.geo.escala / f, contornos: c.geo.contornos.map(p => p.map(q => ({ x: q.x / f, y: q.y / f }))), nTorre: c.geo.nTorre,
    caja: { x0: Math.floor(c.geo.caja.x0 / f), x1: Math.floor(c.geo.caja.x1 / f), y0: Math.floor(c.geo.caja.y0 / f), y1: Math.floor(c.geo.caja.y1 / f) },
    u0: U0, med: c.med ? { Cd: c.med.Cd, ClRms: c.med.ClRms, St: c.med.St } : null,
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tunel_${c.nivel}_viento${estado.dir}.torreviento`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_');
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  mensajeTunel(`Grabación guardada: ${gr.g.cuadros.length} cuadros, ${(blob.size / 1e6).toFixed(1)} MB.`);
  estado.avisarPanel();
}
const mensajeTunel = (t: string) => { const e = document.getElementById('mensaje'); if (e) e.textContent = t; };
function actualizarGrabacion() {
  const el = panelGrab?.querySelector<HTMLElement>('.grab-estado'), gr = grab, c = corrida;
  if (!el || !gr || !c) return;
  const pas = ((c.pasos - gr.pasos0) * U0) / c.geo.D;
  el.textContent = `● Grabando: ${gr.g.cuadros.length} cuadros · ${fmt(pas, 0)} pasadas${gr.hasta ? ` de ${fmt(gr.hasta - (gr.pasos0 * U0) / c.geo.D, 0)}` : ''} · ${(gr.g.bytes() / 1e6).toFixed(1)} MB en memoria (el archivo sale comprimido)`;
}
function armarPanelGrabacion(el: H) {
  panelGrab = el;
  const sel = h('select', {}) as HTMLSelectElement;
  Object.entries(DURACIONES).forEach(([k, v]) => sel.append(new Option(v.texto, k, false, k === duracion)));
  sel.addEventListener('change', () => { duracion = sel.value; });
  sel.disabled = !!grab;
  const b = h('button', { type: 'button', class: `boton${grab ? '' : ' primario'}` }, grab ? '■ Detener y guardar' : '● Grabar');
  b.addEventListener('click', () => { if (grab) void terminarGrabacion(); else empezarGrabacion(); });
  const abrir = h('label', { class: 'boton' }, 'Abrir grabación…');
  const inp = h('input', { type: 'file', accept: '.torreviento,.zip', hidden: '' }) as HTMLInputElement;
  abrir.append(inp);
  inp.addEventListener('change', async () => {
    const f = inp.files?.[0]; inp.value = '';
    if (!f) return;
    try { const { default: JSZip } = await import('jszip'); empezarRepro(await abrirGrabacion(JSZip, await f.arrayBuffer())); }
    catch (e) { mensajeTunel(e instanceof Error ? e.message : String(e)); }
  });
  el.replaceChildren(
    h('p', { class: 'nota' }, 'Graba la corrida (los cuadros y las fuerzas) en un archivo .torreviento para verla después sin simular, en esta o en otra computadora, o pasarla a video. Una corrida larga se guarda sola al llegar a las pasadas pedidas.'),
    h('label', { class: 'campo' }, h('span', {}, 'Duración'), sel),
    h('div', { class: 'fila-acciones' }, b, abrir),
    h('p', { class: 'nota chica grab-estado' }, ''),
  );
  actualizarGrabacion();
}

let repro: { g: GrabacionAbierta; k: number; reloj: number | null; video: MediaRecorder | null } | null = null;
let panelRepro: H | null = null;
function empezarRepro(g: GrabacionAbierta) {
  if (grab) grab = null;
  corrida?.worker.terminate();
  const m = g.meta;
  U0 = m.u0;                                                          // la escala de colores con la velocidad con la que se grabó
  const geo: Geometria2D = { nx: m.nx, ny: m.ny, solido: g.solido, escala: m.escala, anchoM: m.anchoM, D: m.D, celdasTorre: 0, caja: m.caja, contornos: m.contornos, q: new Float32Array(0), nTorre: m.nTorre ?? m.contornos.length };
  const humo = new Float32Array(2 * 700);
  for (let k = 0; k < 700; k++) { humo[2 * k] = Math.random() * m.nx; humo[2 * k + 1] = Math.random() * m.ny; }
  // la corrida «en pantalla» pasa a ser la grabación: dibujar() y las mediciones la muestran igual que en vivo
  corrida = { clave: 'grabacion', geo, nu: 0, cs: 0, worker: { terminate() {}, postMessage() {} } as unknown as Worker, campo: null, pasos: m.pasos[0] ?? 0, Fx: Array.from(g.Fx), Fy: Array.from(g.Fy), corriendo: false, esperando: false, roto: false,
    med: m.med ? { Cd: m.med.Cd, Cl: 0, ClRms: m.med.ClRms, f: null, St: m.med.St } : null, humo, cuadrosSinMirar: 0, nivel: m.nivel, cota: m.cota, perim: new PromedioPerimetro(perimetro(geo), m.u0),
    sumaV: new Float64Array(m.nx * m.ny), nV: 0, maxRed: 0, dondeRoto: null, altos: [], isos: [], cola: [] };
  repro = { g, k: 0, reloj: null, video: null };
  mostrarCuadro(0);
  estado.avisarPanel();
}
function mostrarCuadro(k: number) {
  const r = repro, c = corrida;
  if (!r || !c) return;
  const m = r.g.meta, kk = Math.max(0, Math.min(m.cuadros - 1, k)), f = cuadroDe(r.g, kk);
  const pasosAntes = c.pasos;
  const escV = (3 * m.u0) / m.D;
  c.campo = { tipo: 'cuadro', pasos: m.pasos[kk], hechos: 0, roto: false, ux: f.ux, uy: f.uy, rho: f.rho, w: f.wn.map(x => x * escV), Fx: new Float32Array(0), Fy: new Float32Array(0) };
  c.pasos = m.pasos[kk];
  if (kk > r.k) moverHumo(c, Math.max(1, (c.pasos - pasosAntes) / m.factor));
  if (kk >= m.cuadros * 0.3 && kk > r.k) c.perim.sumar(f.rho);
  r.k = kk;
  dibujar();
  const barra = panelRepro?.querySelector<HTMLInputElement>('input[type=range]'), txt = panelRepro?.querySelector<HTMLElement>('.repro-txt');
  if (barra) barra.value = String(kk);
  if (txt) txt.textContent = `cuadro ${kk + 1} de ${m.cuadros} · ${fmt((m.pasos[kk] * m.u0) / m.D, 0)} pasadas`;
  ultimoCp = 0; armarCp();
}
function reproducir(si: boolean) {
  const r = repro;
  if (!r) return;
  if (r.reloj !== null) { clearInterval(r.reloj); r.reloj = null; }
  if (si) r.reloj = window.setInterval(() => { if (!repro) return; if (repro.k >= repro.g.meta.cuadros - 1) { reproducir(false); if (repro.video) repro.video.stop(); return; } mostrarCuadro(repro.k + 1); }, 1000 / 15);
  const b = panelRepro?.querySelector<HTMLButtonElement>('.repro-play');
  if (b) b.textContent = si ? '⏸ Pausa' : '▶ Reproducir';
}
function salirRepro() { reproducir(false); repro = null; corrida = null; estado.avisarPanel(); }
function grabarVideo() {
  const r = repro, cv = lienzo;
  if (!r || !cv) return;
  const tipo = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
  if (!tipo) { mensajeTunel('Este navegador no puede grabar video (MediaRecorder con WebM).'); return; }
  const partes: Blob[] = [], rec = new MediaRecorder(cv.captureStream(15), { mimeType: tipo });
  rec.ondataavailable = e => { if (e.data.size) partes.push(e.data); };
  rec.onstop = () => {
    r.video = null;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(partes, { type: 'video/webm' }));
    a.download = `tunel_${r.g.meta.nivel}_viento${r.g.meta.dir}.webm`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_');
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    mensajeTunel('Video guardado (WebM).');
  };
  r.video = rec;
  mostrarCuadro(0); rec.start(); reproducir(true);
}
function centroRepro(c: H, tam: Tam) {
  const r = repro!, m = r.g.meta, ancho = Math.max(320, (tam.ancho ?? 900) - 10);
  if (!lienzo) { lienzo = document.createElement('canvas'); lienzo.className = 'tunel2d'; prepararMarcado(lienzo); }
  lienzo.width = Math.round(ancho); lienzo.height = Math.round((ancho * m.ny) / m.nx);
  const play = h('button', { type: 'button', class: 'boton primario repro-play' }, r.reloj !== null ? '⏸ Pausa' : '▶ Reproducir');
  play.addEventListener('click', () => reproducir(repro?.reloj === null));
  const barra = h('input', { type: 'range', min: '0', max: String(m.cuadros - 1), value: String(r.k), 'aria-label': 'Cuadro de la grabación' }) as HTMLInputElement;
  barra.addEventListener('input', () => { reproducir(false); mostrarCuadro(+barra.value); });
  const video = h('button', { type: 'button', class: 'boton' }, '⤓ Video (WebM)'); video.addEventListener('click', grabarVideo);
  const salir = h('button', { type: 'button', class: 'boton' }, 'Volver al túnel en vivo'); salir.addEventListener('click', salirRepro);
  panelRepro = h('div', { class: 'repro' }, h('p', { class: 'llave' }, `Grabación: ${m.titulo} · ${Object.entries(m.config).map(([k, v]) => `${k} ${v}`).join(' · ')}`), h('div', { class: 'fila-acciones' }, play, barra, h('span', { class: 'nota chica repro-txt' }, ''), video, salir));
  c.append(h('p', { class: 'cartel-tunel' }, 'Reproducción de una grabación: no se está simulando.'), panelRepro, h('div', { class: 'tunel-marco' }, lienzo),
    h('p', { class: 'llave' }, cfg.vista === 'vorticidad' ? 'Color: giro del aire (naranja antihorario, violeta horario).' : cfg.vista === 'velocidad' ? 'Color: velocidad con un espectro térmico, de violeta muy oscuro (quieto) a naranja y amarillo claro (1,6 veces la de entrada o más).' : 'Color: presión en Cp, azul la que empuja (comprime) y rojo la que succiona (tracciona), como en toda la app.'));
  cajaCp = h('div', { class: 'cp-perimetro' }); c.append(cajaCp); anchoCp = Math.min(ancho, 900);
  mostrarCuadro(r.k);
}

// ---------------------------------------------------------------------------------------------- Cp del perímetro
let cajaCp: H | null = null, anchoCp = 800, ultimoCp = 0;
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (t: string, a: Record<string, string | number>, txt?: string) => { const e = document.createElementNS(NS, t); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v))); if (txt !== undefined) e.textContent = txt; return e; };
/** el gráfico del Cp promedio a lo largo del perímetro: esquinas marcadas, pico de succión y empuje máximo */
function armarCp() {
  const el = cajaCp, c = corrida;
  if (!el?.isConnected || !c) return;
  const ahora = performance.now();
  if (ahora - ultimoCp < 1500 && el.childElementCount) return;
  ultimoCp = ahora;
  const pr = c.perim, t = pr.tramos(120);
  if (pr.muestras < 5 || t.length < 4) { el.replaceChildren(h('p', { class: 'nota chica' }, 'Cp a lo largo del perímetro: se empieza a promediar pasado el arranque (medio recorrido del canal).')); return; }
  const W = anchoCp, Hh = 230, mi = 46, md = 12, ms = 18, mb = 34, L = pr.p.largo;
  const cps = t.map(x => x.cp), c0 = Math.min(-0.5, ...cps), c1 = Math.max(0.5, ...cps);
  const X = (sv: number) => mi + (sv / L) * (W - mi - md), Y = (cp: number) => ms + ((c1 - cp) / (c1 - c0)) * (Hh - ms - mb);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, class: 'grafico', role: 'img', 'aria-label': 'Cp promedio a lo largo del perímetro de la planta' });
  [c0, 0, c1].forEach(v => { svg.append(svgEl('line', { x1: mi, x2: W - md, y1: Y(v), y2: Y(v), class: v === 0 ? 'd-cero' : 'd-grilla' })); svg.append(svgEl('text', { x: mi - 6, y: Y(v) + 4, class: 'd-eje', 'text-anchor': 'end' }, fmt(v, 1))); });
  pr.p.esquinas.forEach(e => { svg.append(svgEl('line', { x1: X(e), x2: X(e), y1: ms, y2: Hh - mb, class: 'd-grilla', 'stroke-dasharray': '3 3' })); });
  // barras finas por tramo, con el color del signo (azul empuja, rojo succiona)
  const ancho = Math.max(1, (W - mi - md) / 120 - 0.5);
  t.forEach(x => svg.append(svgEl('rect', { x: X(x.s) - ancho / 2, y: Math.min(Y(0), Y(x.cp)), width: ancho, height: Math.abs(Y(x.cp) - Y(0)), class: x.cp >= 0 ? 'd-c-compresion' : 'd-c-traccion' })));
  // los picos: un punto en la punta de la barra; el valor va en la leyenda (sobre el gráfico se pisaba con los ejes)
  const ex = pr.extremos(120);
  if (ex.min) svg.append(svgEl('circle', { cx: X(ex.min.s), cy: Y(ex.min.cp), r: 4, class: 'd-pico' }));
  if (ex.max) svg.append(svgEl('circle', { cx: X(ex.max.s), cy: Y(ex.max.cp), r: 4, class: 'd-pico' }));
  [0, 0.25, 0.5, 0.75, 1].forEach((f, i) => svg.append(svgEl('text', { x: X(f * L), y: Hh - mb + 14, class: 'd-eje', 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle' }, `${fmt(f * L, 0)} m`)));
  svg.append(svgEl('text', { x: (mi + W - md) / 2, y: Hh - 6, class: 'd-eje', 'text-anchor': 'middle' }, 'posición a lo largo del perímetro (m)'));
  const csv = h('button', { type: 'button', class: 'mini' }, '⤓ Cp del perímetro (CSV)');
  csv.addEventListener('click', () => {
    const p = pr.p;
    descargarCSV(`cp_perimetro_${c.nivel}_viento${estado.dir}.csv`, ['s (m)', 'Cp promedio', 'x (red)', 'y (red)'], Array.from(p.celdas, (_, k) => [p.s[k], pr.cp(k), p.px[k], p.py[k]]), 4);
  });
  el.replaceChildren(h('figure', { class: 'diagrama' }, h('figcaption', {}, `Cp promedio a lo largo del perímetro · ${c.nivel} · ${pr.muestras} muestras`), h('div', { class: 'leyenda' }, h('span', {}, h('i', { class: 'caja', style: 'background: var(--compresion)' }), 'empuja (comprime)'), h('span', {}, h('i', { class: 'caja', style: 'background: var(--traccion)' }), 'succiona (tracciona)'),
    ...(ex.max ? [h('span', {}, `● empuje máximo ${fmt(ex.max.cp, 2)} a ${fmt(ex.max.s, 1)} m`)] : []), ...(ex.min ? [h('span', {}, `● succión pico ${fmt(ex.min.cp, 2)} a ${fmt(ex.min.s, 1)} m`)] : [])),
    svg, h('p', { class: 'nota chica' }, 'Desde el punto de barlovento (donde choca el viento), en sentido antihorario; las líneas punteadas son las esquinas.'), h('div', { class: 'fila-acciones' }, csv)));
}

let ultimaMed = 0;
function actualizarMediciones() {
  armarCp();
  const el = panelMed;
  if (!el?.isConnected || !corrida) return;
  const ahora = performance.now();
  if (ahora - ultimaMed < 400) return;
  ultimaMed = ahora;
  const c = corrida, md = c.med, t = (c.pasos * U0) / c.geo.D;
  let n1 = NaN, V = NaN;
  try { const w = vientoCirsoc(); n1 = w[estado.dir].n1; V = w.V; } catch { /* sin datos del 102-25 */ }
  const St = md?.St ?? null, Vcr = St ? velocidadCritica(n1, c.geo.anchoM, St) : NaN;
  el.replaceChildren(
    h('div', { class: 'kpis' },
      kpi('Tiempo', fmt(t, 0), `pasadas del aire por el ancho (${c.pasos} pasos)${c.roto ? ' · se volvió inestable: bajá el Reynolds o subí la resolución' : c.corriendo ? '' : ' · en pausa'}`, c.roto ? 'var(--mal)' : undefined),
      kpi('Arrastre Cd', md && isFinite(md.Cd) ? fmt(md.Cd, 2) : 'midiendo…', 'F en el sentido del viento / (½ ρ V² B)'),
      kpi('Fuerza lateral', md && isFinite(md.ClRms) ? `±${fmt(md.ClRms, 2)}` : 'midiendo…', 'Cl eficaz: la torre se sacude de costado'),
      kpi('Strouhal St', St ? fmt(St, 3) : 'midiendo…', 'St = f · B / V (f: remolinos por segundo)'),
    ),
    h('p', { class: 'nota' }, St && isFinite(Vcr)
      ? `Con la frecuencia propia de la torre (n1 = ${fmt(n1, 2)} Hz, del ${estado.config.metodo === 'fem' ? 'FEM' : '102-25'}) y B = ${fmt(c.geo.anchoM, 1)} m, los remolinos se desprenden a la frecuencia de la torre con un viento de V = n1 · B / St = ${fmt(Vcr, 1)} m/s. El viento de diseño es ${fmt(V, 1)} m/s: ${Vcr < V ? 'la resonancia puede aparecer por debajo del viento de diseño; en una torre real se estudia en túnel de viento.' : 'la resonancia quedaría por encima del viento de diseño.'} Es una estimación didáctica.`
      : 'El Strouhal aparece cuando la estela oscila con claridad (en un cuadrado, después de unas 40 a 80 pasadas). Sirve para estimar la velocidad crítica de desprendimiento con la n1 de la torre.'),
    ...(SALVAGUARDAS ? salvaguardasPanel(c, V) : []),
  );
}

/** guardia de estabilidad y lista de puntos de velocidad alta, en «Lo que se mide» */
function salvaguardasPanel(c: Corrida, V: number): H[] {
  const out: H[] = [];
  if (c.roto || c.maxRed > AVISO_RED) {
    const b = h('button', { type: 'button', class: 'boton' }, cfg.lento ? 'Empezar de nuevo' : 'Usar el túnel lento y empezar de nuevo');
    b.addEventListener('click', () => { cfg.lento = true; iniciar(); estado.avisarPanel(); });
    out.push(h('p', { class: 'aviso-linea' }, c.roto
      ? `La simulación se volvió inestable cerca de ${c.dondeRoto ?? 'la torre'}: el aire se aceleró más de lo que el método aguanta (pasa en esquinas vivas con viscosidad baja). ${cfg.lento ? 'Probá más resolución o un Reynolds más bajo.' : 'El túnel lento (entrada a 0,06 de la red) suele alcanzar.'}`
      : `El aire llega a ${fmt(c.maxRed, 2)} en unidades de la red (${c.maxRed > CRITICO_RED ? 'muy cerca del' : 'cerca del'} límite del método, ≈ ${fmt(CRITICO_RED, 2)}): puede volverse inestable.`), b);
  }
  if (c.altos.length) {
    const m = 1 / c.geo.escala, sv = isFinite(V) ? V : null;
    const algunaViva = c.altos.some(p => esquinaVivaCerca(p, c.geo.contornos, 3));
    out.push(h('div', { class: 'altos' },
      h('b', {}, 'Velocidad alta (media en el tiempo, promedio en 1 m²)'),
      h('ol', {}, ...c.altos.map(p => h('li', {}, `${fmt(p.valor, 2)} V${sv ? ` ≈ ${fmt(p.valor * sv, 0)} m/s` : ''} · ${dondeRespectoTorre(p, c.geo.caja, m)}${esquinaVivaCerca(p, c.geo.contornos, 3) ? ' · junto a una esquina viva' : ''}`))),
      ...(algunaViva ? [h('p', { class: 'nota chica' }, 'En una esquina viva la velocidad teórica es infinita: el aire se despega y deja una capa delgada muy rápida, y su pico crece al afinar la grilla. Por eso acá va promediado en 1 m². Redondear o chaflanar la esquina baja el pico de verdad.')] : [])));
  }
  return out;
}

/** para las pruebas y para soltar el worker al cambiar de proyecto */
export function detenerTunel() { corrida?.worker.terminate(); corrida = null; }
