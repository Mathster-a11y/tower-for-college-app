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
import { tramoEn } from '../engine/carpinteria';
/** paredes: exactas en planta y en altura (la piel interpolada entre pisos), exactas solo en planta (un prisma por piso) o en escalera */
export type Paredes3DModo = 'exactas' | 'planta' | 'escalera';
import { datos102De } from '../engine/cargas/cirsoc102';
import { celdaReferencia, celdasDeCara, cpReglamento, geometria3D, grillaBanda, perfil102, PromedioCp, type Cara, type Geometria3D } from '../viento/geometria3d';
import { MedicionBanda } from '../viento/banda3d';
import type { Lbm3dGpu } from '../viento/lbm3dGpu';
import { mallaTorre, stlTorre } from '../viento/malla3d';
import { AVISO_RED, CRITICO_RED, dondeRespectoTorre, SALVAGUARDAS } from '../viento/salvaguardas';
import { avisoArcoiris, textoEspectro, coloresTermico, dibujarFlechas, elegirEspectroVel, espectroVel, lutVelocidad, muestraVelocidad, type ModoFlechas } from './campoSuave';
import { tramosEdificio } from '../viento/contexto';
import { FIDELIDAD, fidelidadGuardada, fidelidadRecomendada, guardarFidelidad, nivelDe3D, ORDEN_FIDELIDAD, type Fidelidad } from './fidelidad';
import { controlUnidadViento, textoReferencia, txtPct, txtVel, vientoDisenoEn, vientoQueLlega } from './unidadViento';
import { altoSimbolos, llaveEnLienzo, llaveHtml, simbolosEnLienzo, simbolosHtml, type Llave, type Simbolo } from './llaveColor';
import { categoriaLawson, LAWSON_LDDC, velocidad5 } from '../viento/confort';
import { MediaPlano } from '../viento/direcciones';
import { aBase64, deBase64, desempaquetar, empaquetar, FORMATO_3D, huella, VERSION_3D } from '../viento/archivo3d';
import { abrirLamina } from './tunel3dLamina';
import { criterioQ, isosuperficie, umbralQ } from '../viento/vortices';
import { alMuestrear, cfgRosa, factorEval, seccionRosa, zEval, type CtxRosa } from './tunel3dRosa';
import { Fuerzas3D, segundosPorPaso } from '../viento/fuerzas3d';
import { seccionFuerzas, type InfoFuerzas } from './tunel3dFuerzas';
import { acercar, sacarAfuera, CAMARAS, camara, centroTorre, formatoVideo, graficoEnLienzo, grabar, grupoTubos, Particulas, type NombreCamara, type Recorrido, type Trazo } from './tunel3dVista';
import { cargarTomas, describirToma, guardarTomas, nuevoId, PLANTILLAS, type ExportarTomas, type Toma } from './tunel3dTomas';
import { alCambiarFachada, cfgFachada, colorCp, llaveFachada, seccionFachada, valorTrozo } from './tunel3dFachada';
import { vientoCirsoc } from './cirsoc102';
import { FACTOR_SERVICIO, KN_POR_T } from '../engine/cargas/cirsoc102';
import { seccionDinamica, type InfoDinamica } from './tunel3dDinamica';
import { moduloHormigon, rigidez, rigidezPorNivel } from '../engine/diagramas';
import { medidasNiveles } from '../engine/perfilTorre';
import { datos201De } from '../engine/metodos/cirsoc';

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

const cfg = { tam: 'liviano', paredes: 'exactas' as Paredes3DModo, angulo: 0, color: 'velocidad' as 'velocidad' | 'cp', zRel: 0.5, yRel: 0.5, lineas: true, colorLineas: 'velocidad' as 'velocidad' | 'uno',
  /** etapa 3: líneas o tubos, partículas, de dónde salen (rastrillo), escala de la velocidad y modo maqueta */
  estiloLineas: 'lineas' as 'lineas' | 'tubos', particulas: false, rastrillo: 'grilla' as 'grilla' | 'vertical' | 'horizontal', rastPos: 0.5, rastAlto: 0.6, rastN: 14,
  escalaVel: 'fija' as 'fija' | 'auto', maqueta: false,
  /** etapa 7: los remolinos como superficies (criterio Q) y qué tan fuertes tienen que ser para dibujarse */
  vortices: false, umbralQ: 0.3,
  vereda: false, horizontal: true, vertical: false,
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
  estiloFlechas: 'fijas' as 'fijas' | 'proporcionales', llave: true, simbolos: false,
  /**
   * banda de pisos: en vez de la torre entera, una franja de pisos a la altura elegida (cota del medio, m sobre PB) y de
   * «bandaPisos» pisos de alto, con todas las celdas de la grilla: mucho más detalle en esos pisos
   */
  banda: false, bandaCota: NaN, bandaPisos: 3,
  /** dominio de la torre entera: alto de 1,5 H (normal) o 1,25 H (ajustado: más celdas en la torre, el techo más cerca) */
  ajustado: false,
  /** lo que también se puede apagar para las grabaciones: los colores de Cp de la torre, el suelo y la raya del rastrillo */
  torreCp: true, suelo: true, verRastrillo: true,
  /** cantidad de flechas en los cortes: veces las de siempre (unas 32 a lo ancho); con más, el trazo se afina */
  densidadFlechas: 1,
  /** grosor de los tubos de las líneas de corriente (veces el de base, más fino que antes) */
  grosorLineas: 1 };
// la fidelidad elegida antes (si hay) arma las opciones de entrada
{ const f = fidelidadGuardada(); if (f) Object.assign(cfg, FIDELIDAD[f].d3); }
/** colores de las categorías Lawson (de quieto a incómodo; ni rojo ni azul, que son tracción y compresión) */
const COL_LAWSON: Record<string, string> = { A: '#e8f5e9', B: '#a5d6a7', C: '#ffe082', D: '#ffb74d', E: '#8d6e63' };

interface Corrida {
  clave: string; geo: Geometria3D; uIn: Float32Array; gpu: Lbm3dGpu | null; error: string | null; cargando: boolean;
  prom: PromedioCp; caras: ReturnType<typeof celdasDeCara>; campo: Float32Array | null;
  /** fuerzas por piso y en la base (etapa 1 de la propuesta de resultados) y lo del reglamento para comparar; segundos reales por paso */
  fz: Fuerzas3D | null; infoFz: Omit<InfoFuerzas, 'pasadas' | 'angulo' | 'config'> | null; dtPaso: number;
  /** dinámica (etapa 4); y el muestreo: cada cuántos pasos como máximo se lee el campo (para que el espectro no mienta) */
  infoDin: InfoDinamica | null; nMuestra: number; pasosCampo: number;
  /** velocidad media a la altura de evaluación del confort (etapa 5) */
  plano: MediaPlano | null;
  /** abierta de un archivo (el nombre): no se simula, se miran sus resultados */
  guardada: string | null;
  corriendo: boolean; ocupado: boolean; k: number; mlups: number; ultimoCampo: number; ultimasLineas: number; sinMirar: number;
  /** salvaguardas: la velocidad más alta en unidades de la red y, si se rompió, dónde (y se pausa) */
  maxRed: number; roto: string | null;
  /** banda de pisos: arrastre, fuerza lateral, Strouhal y Cp de la franja */
  banda: MedicionBanda | null;
}
let corrida: Corrida | null = null;
let soporteGpu: string | null | undefined;                    // undefined: todavía no se preguntó
let vista: { cont: HTMLElement; ren: THREE.WebGLRenderer; esc: THREE.Scene; cam: THREE.PerspectiveCamera; ctl: OrbitControls; torre: THREE.Mesh | null; trozos: { desde: number; n: number; caras: number[] }[]; planoH: THREE.Mesh | null; planoV: THREE.Mesh | null; lineas: THREE.Group; clave: string;
  particulas: Particulas | null; sol: THREE.DirectionalLight; suelo: THREE.Mesh; vecinos: THREE.Mesh[]; vortices: THREE.Mesh | null } | null = null;
let panelEstado: H | null = null;

// ------------------------------------------------------------------------------------------------ corrida
function claveCorrida() { return JSON.stringify([estado.revision, estado.dir, cfg.tam, cfg.paredes, cfg.angulo, cfg.motor, cfg.lento, cfg.contexto, cfg.banda, cfg.bandaCota, cfg.bandaPisos, cfg.ajustado]); }
/** los vecinos del contexto urbano que van al túnel (si se eligió usarlos) */
// cada tramo de cada vecino (con sus retiros) es un prisma de su altura «desde» a su «altura»
const vecinos3d = () => (cfg.contexto ? (estado.proyecto.contexto?.edificios ?? []).flatMap(e => tramosEdificio(e).map(t => ({ pol: t.v, desde: t.desde, altura: t.hasta }))) : []);
const tamActual = () => (cfg.motor === 'procesador' ? TAM_CPU : TAM[cfg.tam]);

function nivelesProyecto() {
  const p = estado.proyecto, iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1), zPB = p.niveles[iPB]?.cota ?? 0;
  // continua: la carpintería del tramo sigue de este piso al de arriba (no es «por losa», con escalón en cada piso)
  return p.niveles.map((n, i) => ({ n, i })).filter(x => x.n.cota >= zPB).map(x => ({ cota: x.n.cota - zPB, silueta: puntosSilueta(contornoAlViento(p, x.i).v, 12), continua: tramoEn(p, x.n.cota)?.modo !== 'losa' }));
}

/** lo que necesita la dinámica: frecuencias, viento de 5 y 10 años, masas, fuerzas del CIRSOC y la rigidez de cada nivel */
function datosDinamica(geo: Geometria3D, infoFz: Corrida['infoFz']): InfoDinamica | null {
  if (!infoFz) return null;
  const p = estado.proyecto, w = vientoCirsoc(), dir = estado.dir, otra = dir === 'A' ? 'B' : 'A';
  const VH = vientoDisenoEn(geo.H), V23 = vientoDisenoEn((2 / 3) * geo.H);
  if (!VH || !V23) return null;
  const masas = medidasNiveles(p).filter(m => m.z > 1e-6).map(m => ({ z: m.z, m: 0.7 * m.B * m.L * (m.n.pisos && m.n.pisos > 0 ? m.n.pisos : 1) }));
  const niv = [...w[dir].niveles].filter(n => n.z > 1e-6).sort((a, b) => a.z - b.z);
  const { asig } = estado.calculo, R = estado.calculo.valores, E = moduloHormigon(p.hormigon || 'H30');
  const rg = rigidez(R, p.hormigon || 'H30').find(x => x.dir === dir)!;
  const zPB = p.niveles.reduce((v, n) => (n.cota >= 0 ? n.cota : v), 0);
  const Jniv = rigidezPorNivel(p, asig.piezas, dir, rg.J).sort((a, b) => a.z - b.z);
  return {
    dir, B: geo.B, H: geo.H, VH, V23, n1Viento: w[dir].n1, n1Costado: w[otra].n1, masas,
    metodoN1: w[otra].metodoFrecuencia, n1Otros: w[otra].n1Otros, n1Guia: w[otra].n1Guia2005,
    f5: (FACTOR_SERVICIO[5] * w.V50) / w.V, f10: (FACTOR_SERVICIO[10] * w.V50) / w.V,
    regl: [{ z: 0, F: w[dir].WPB }, ...niv.map(n => ({ z: n.z, F: n.W }))], servicio: w.servicio.relacion,
    EJ: z => E * ((Jniv.find(q => q.z >= z + zPB - 1e-6)?.J ?? rg.J) || rg.J), limD: datos201De(p).limiteDeriva,
  };
}

/** la corrida nueva (sin motor): las mediciones con el proyecto abierto (fuerzas, dinámica, vereda) */
function armarCorrida(geo: Geometria3D, uIn: Float32Array): Corrida {
  const caras = celdasDeCara(geo);
  // fuerzas: con la q y la ráfaga G del CIRSOC 102-25 para pasar de Cp a toneladas (si el proyecto no tiene datos del 102, sin fuerzas)
  let fz: Fuerzas3D | null = null, infoFz: Corrida['infoFz'] = null, dtPaso = NaN;
  if (geo.banda) {
    // la banda: sin suelo ni toda la altura, no hay fuerzas por piso, dinámica ni vereda; se mide la franja. El campo se
    // lee por lo menos 12 veces por período de los remolinos (T ≈ B / (0,13 U) pasos)
    const Bc = geo.B * geo.escala, nMuestra = Math.max(4, Math.floor(Bc / (0.13 * UH) / 12));
    return { clave: claveCorrida(), geo, uIn, gpu: null, error: null, cargando: true, prom: new PromedioCp(caras, UH, celdaReferencia(geo)), caras, campo: null, fz: null, infoFz: null, dtPaso: NaN, infoDin: null, nMuestra, pasosCampo: 0, plano: null,
      corriendo: true, ocupado: false, k: 10, mlups: 0, ultimoCampo: 0, ultimasLineas: 0, sinMirar: 0, maxRed: 0, roto: null, guardada: null, banda: new MedicionBanda(caras, geo, UH, celdaReferencia(geo)) };
  }
  try {
    const v = vientoCirsoc()[estado.dir], niv = [...v.niveles].filter(n => n.z > 1e-6).sort((a, b) => a.z - b.z);
    // PB toma la fachada de la mitad de abajo del primer piso, que el reglamento manda directo a la base (WPB)
    fz = new Fuerzas3D(caras, geo, [{ nombre: 'PB', z: 0 }, ...niv.map(n => ({ nombre: n.nivel, z: n.z }))], UH, (v.qh * v.Gusado) / 1000 / KN_POR_T);
    infoFz = { dir: estado.dir, regl: [v.WPB, ...niv.map(n => n.W)], WRegl: v.WPB + niv.reduce((s2, n) => s2 + n.W, 0), MRegl: v.MPB, qh: v.qh, G: v.Gusado };
    dtPaso = segundosPorPaso(geo, UH, vientoDisenoEn(geo.H) ?? NaN);
  } catch { fz = null; }
  let infoDin: InfoDinamica | null = null;
  try { infoDin = datosDinamica(geo, infoFz); } catch { infoDin = null; }
  // los remolinos de una torre tienen un período de ≈ B / (0,12 · V): se lee el campo por lo menos 10 veces por período
  const VHm = vientoDisenoEn(geo.H) ?? NaN, nMuestra = isFinite(dtPaso) && VHm > 0 ? Math.max(4, Math.floor(geo.B / (0.12 * VHm) / 10 / dtPaso)) : Infinity;
  return { clave: claveCorrida(), geo, uIn, gpu: null, error: null, cargando: true, prom: new PromedioCp(caras, UH, celdaReferencia(geo)), caras, campo: null, fz, infoFz, dtPaso, infoDin, nMuestra, pasosCampo: 0, plano: new MediaPlano(geo, zEval(geo)),
    corriendo: true, ocupado: false, k: 10, mlups: 0, ultimoCampo: 0, ultimasLineas: 0, sinMirar: 0, maxRed: 0, roto: null, guardada: null, banda: null };
}
/** las opciones de la geometría de la corrida (se guardan en el archivo para rearmarla igual) */
function opcionesGeo() {
  const T = tamActual(), niveles = nivelesProyecto();
  const banda = cfg.banda ? bandaElegida() : null;
  const alturaExacta = cfg.paredes === 'exactas';
  if (!banda) return { niveles, dir: estado.dir, angulo: cfg.angulo, nx: T.nx, ny: T.ny, nz: T.nz, contexto: vecinos3d(), alturaExacta, ...(cfg.ajustado ? { altoRel: 1.25 } : {}) };
  // la grilla de la banda: las mismas celdas que la de la torre entera, repartidas en la franja (B y L de una geometría chica)
  const g0 = geometria3D({ niveles, dir: estado.dir, angulo: cfg.angulo, nx: 64, ny: 64, nz: 8, banda });
  const G = grillaBanda(T.nx * T.ny * T.nz, g0.B, g0.L, banda.z1 - banda.z0);
  return { niveles, dir: estado.dir, angulo: cfg.angulo, nx: G.nx, ny: G.ny, nz: G.nz, contexto: [], banda, alturaExacta };
}
/** la altura de la torre sobre PB, el alto de un piso tipo y la banda elegida (m sobre PB) */
function bandaElegida(): { z0: number; z1: number } {
  const niv = nivelesProyecto(), H = Math.max(...niv.map(n => n.cota)), hp = H / Math.max(1, niv.length - 1);
  const hb = Math.min(H, Math.max(1, cfg.bandaPisos) * hp), centro = isFinite(cfg.bandaCota) ? cfg.bandaCota : (2 / 3) * H;
  const z0 = Math.max(0, Math.min(H - hb, centro - hb / 2));
  return { z0, z1: z0 + hb };
}

async function iniciar() {
  detener();
  const og = opcionesGeo(), T = { nx: og.nx, ny: og.ny, nz: og.nz };
  const ctx = og.contexto ?? [];
  // con vecinos el aire se acelera en las calles: el túnel lento siempre
  UH = cfg.lento || ctx.length ? 0.05 : 0.08;
  const geo = geometria3D(og);
  const exp = datos102De(estado.proyecto).exposicion;
  // la banda: el viento llega parejo (el de su altura; con planos deslizantes arriba y abajo no puede tener perfil)
  const uIn = geo.banda ? new Float32Array(T.nz).fill(UH) : perfil102(T.nz, geo.escala, geo.H, exp, UH);
  const c = armarCorrida(geo, uIn);
  corrida = c;
  try {
    const anchoC = geo.B * geo.escala;
    const exactas = cfg.paredes !== 'escalera';
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
    c.k = Math.max(1, Math.min(200, c.nMuestra, Math.round(c.k * (25 / Math.max(1, dt)))));      // ~25 ms de placa por cuadro
    const ahora = performance.now();
    if (ahora - c.ultimoCampo > 1200 || c.gpu.pasos - c.pasosCampo >= c.nMuestra) {
      c.campo = await c.gpu.campo(); c.ultimoCampo = performance.now(); c.pasosCampo = c.gpu.pasos;
      if (vigilar3d(c)) { estado.avisarPanel(); return; }               // se rompió: se pausa y se dice dónde
      // se promedia pasada una pasada del aire por el canal
      if (c.gpu.pasos > (0.8 * c.geo.nx) / UH) {
        c.prom.sumar(c.campo, 4, 3);
        c.fz?.sumar(c.campo, c.campo[celdaReferencia(c.geo) * 4 + 3], c.gpu.pasos * (isFinite(c.dtPaso) ? c.dtPaso : 1));
        c.plano?.sumar(c.campo);
        c.banda?.sumar(c.campo, c.gpu.pasos);
        if (!c.geo.banda) alMuestrear({ geo: c.geo, caras: c.caras, prom: c.prom, plano: c.plano, uIn: c.uIn, pasadas: (c.gpu.pasos * UH) / c.geo.nx, giro: cfg.angulo }, ctxRosa());
      }
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
/** tramo del espectro térmico que usan las líneas de corriente (sin el amarillo más claro, que no se ve sobre blanco) */
// (el arcoíris no tiene tramo claro: se usa entero)
/** el tope de la escala de la velocidad, en veces la de la red a la altura de la torre: fija (1,6) o la de lo que se ve */
let escalaV = 1.6;
const tramoLinea = () => (espectroVel === 'arcoiris' ? [0, 1] : [0.06, 0.82]);
const colLinea = (s: number, out: THREE.Color) => { const [t0, t1] = tramoLinea(), L = lutVelocidad(), t = t0 + (t1 - t0) * Math.max(0, Math.min(1, s / (escalaV * UH))), i = 3 * Math.round(t * 255); return out.setRGB(L[i] / 255, L[i + 1] / 255, L[i + 2] / 255, THREE.SRGBColorSpace); };
const coloresLinea = () => { const [t0, t1] = tramoLinea(), L = lutVelocidad(); return Array.from({ length: 6 }, (_, k) => { const i = 3 * Math.round((t0 + ((t1 - t0) * k) / 5) * 255); return `rgb(${L[i]},${L[i + 1]},${L[i + 2]})`; }); };
const colVel = (s: number, out: THREE.Color) => { const L = lutVelocidad(), i = 3 * Math.max(0, Math.min(255, Math.round((s / (escalaV * UH)) * 255))); return out.setRGB(L[i] / 255, L[i + 1] / 255, L[i + 2] / 255, THREE.SRGBColorSpace); };
/** las marcas de una llave de velocidad con la escala en uso */
const marcasVel = (quieto = 'quieto'): [number, string][] => [[0, quieto], ...(1 / escalaV <= 0.72 ? [[1 / escalaV, `${tv3(1)} (llega)`] as [number, string]] : []), [1, `≥ ${tv3(escalaV)}`]];
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
  // sombras (modo maqueta): el sol cubre todo el túnel
  ren.shadowMap.type = THREE.PCFSoftShadowMap;
  const lado = Math.max(Lx, Ly, Hm) * 0.8, sc = sol.shadow.camera as THREE.OrthographicCamera;
  sc.left = -lado; sc.right = lado; sc.top = lado; sc.bottom = -lado; sc.near = 1; sc.far = 4 * lado + 300; sol.shadow.mapSize.set(2048, 2048); sol.shadow.bias = -0.0005;
  sol.target.position.copy(centroTorre(g)); esc.add(sol.target);
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(g.nx / g.escala, g.ny / g.escala), new THREE.MeshStandardMaterial({ color: 0xeef0f2 }));
  suelo.rotation.x = -Math.PI / 2; suelo.receiveShadow = true; esc.add(suelo);
  // la banda no tiene suelo: abajo y arriba hay planos deslizantes (no se dibujan)
  if (g.banda) suelo.visible = false;
  // la torre: con paredes exactas, su contorno real piso por piso (la superficie, coloreada con el Cp de la celda de
  // cara más cercana); en escalera, una cara por celda de cara, como la ve la simulación
  const pos: number[] = [], trozos: { desde: number; n: number; caras: number[] }[] = [];
  if (cfg.paredes !== 'escalera' && g.tramos.length) {
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
  const vecinos: THREE.Mesh[] = [];
  if (g.vecinos.length) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a9ca3, roughness: 1 });
    for (const v of g.vecinos) {
      const forma = new THREE.Shape(v.pol.map(q => new THREE.Vector2((q.x - g.nx / 2) / g.escala, (q.y - g.ny / 2) / g.escala)));
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: v.altura - v.desde, bevelEnabled: false }), mat);
      m.rotation.x = -Math.PI / 2; m.position.y = v.desde; m.castShadow = m.receiveShadow = true; esc.add(m); vecinos.push(m);
    }
  }
  const lineas = new THREE.Group(); esc.add(lineas);
  torre.castShadow = true;
  vista = { cont, ren, esc, cam, ctl, torre, trozos, planoH: null, planoV: null, lineas, clave: c.clave, particulas: null, sol, suelo, vecinos, vortices: null };
  aplicarMaqueta();
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
  // con muchas flechas la imagen se hace más fina (hasta 4096 px), para que el trazo fino no se pixele
  const k = Math.max(1, Math.min(8, Math.floor((vel && cfg.flechas !== 'no' && cfg.densidadFlechas >= 2 ? 4096 : 2048) / ancho))), W = ancho * k, H = alto * k;
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
    // densidad: n veces más flechas (la separación baja como 1/n) y el trazo se afina como 1/√n (no menos de un tercio)
    const dens = Math.max(0.25, cfg.densidadFlechas), paso = Math.max(6, Math.round(W / (32 * dens))), grosor = Math.max(0.33, Math.min(1.2, 1 / Math.sqrt(dens))) * Math.max(1, W / 2048);
    dibujarFlechas(g, { W, H, x0: 0, dx: 1 / k, y0: alto, dy: 1 / k }, cfg.flechas, muestraVelocidad(VA, VB, sol, ancho, alto, 1), paso, '#1d1d24', '#f4f4f4', cfg.vereda || cfg.color === 'cp', grosor);
  }
  const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** la velocidad del campo abierto a 1,5 m superada el 5 % del tiempo (m/s) */
const u5Peaton = () => velocidad5(cfg.vientoMedio) * factorEval();

function actualizarCampo() {
  armarLlaves3d();
  const c = corrida, v = vista;
  if (!c || !v || !c.campo) return;
  const g = c.geo, F = c.campo, ref = F[celdaReferencia(g) * 4 + 3] || 1;
  const pintarCelda = (cel: number, out: THREE.Color, z: number) => {
    if (g.solido[cel]) return false;
    const u = F[4 * cel], w = F[4 * cel + 1], q = F[4 * cel + 2], r = F[4 * cel + 3];
    if (cfg.vereda && !g.banda && z === zVereda(g)) {
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
  // con lo que se eligió en «Fachada» (Cp medio, desvío o picos); antes de la primera muestra, el Cp instantáneo
  const cpInst = (ks: number[]) => { const vs = ks.map(k => (F[4 * c.caras[k].celda + 3] - ref) / 3 / (0.5 * UH * UH)); return cfgFachada.est === 'media' && vs.length ? vs.reduce((a2, b2) => a2 + b2, 0) / vs.length : NaN; };
  v.trozos.forEach(t => {
    const rgb = colorCp(c.prom.muestras ? valorTrozo(c.prom, t.caras) : cpInst(t.caras));
    col.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
    for (let i = 0; i < t.n; i++) colA.setXYZ(t.desde + i, col.r, col.g, col.b);
  });
  colA.needsUpdate = true;
  // corte horizontal
  v.planoH && (v.esc.remove(v.planoH), (v.planoH.material as THREE.MeshBasicMaterial).map?.dispose());
  v.planoV && (v.esc.remove(v.planoV), (v.planoV.material as THREE.MeshBasicMaterial).map?.dispose());
  v.planoH = v.planoV = null;
  const zc = cfg.vereda && !g.banda ? zVereda(g) : Math.max(1, Math.min(g.nz - 1, Math.round(cfg.zRel * g.H * g.escala + 0.5)));
  const antes = escalaV;
  escalaV = cfg.escalaVel === 'auto' ? escalaAutomatica(c, zc) : 1.6;
  if (Math.abs(antes - escalaV) > 0.05) armarLlaves3d();
  if (cfg.horizontal || cfg.vereda) {
    const t = textura(g.nx, g.ny, (i, j, o) => pintarCelda((zc * g.ny + j) * g.nx + i, o, zc), (i, j) => { const cel = (zc * g.ny + j) * g.nx + i; return g.solido[cel] ? null : [F[4 * cel] / UH, F[4 * cel + 1] / UH]; });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(g.nx / g.escala, g.ny / g.escala), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = (zc + (g.banda ? 0.5 : -0.5)) / g.escala; v.esc.add(m); v.planoH = m;
  }
  if (cfg.vertical) {
    const yc = Math.max(0, Math.min(g.ny - 1, Math.round(cfg.yRel * (g.ny - 1))));
    const t = textura(g.nx, g.nz, (i, j, o) => pintarCelda((j * g.ny + yc) * g.nx + i, o, j), (i, j) => { const cel = (j * g.ny + yc) * g.nx + i; return g.solido[cel] ? null : [F[4 * cel] / UH, F[4 * cel + 2] / UH]; });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(g.nx / g.escala, g.nz / g.escala), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    m.position.set(0, g.nz / g.escala / 2, -((yc + 0.5) - g.ny / 2) / g.escala); v.esc.add(m); v.planoV = m;
  }
  // líneas de corriente, cada tanto
  if ((cfg.lineas || cfg.particulas || cfg.vortices) && performance.now() - c.ultimasLineas > 3000) { c.ultimasLineas = performance.now(); lineasDeCorriente(); vortices(); }
  if (!cfg.vortices && v.vortices) { v.esc.remove(v.vortices); v.vortices.geometry.dispose(); v.vortices = null; }
  if (!cfg.lineas && !cfg.particulas) v.lineas.clear();
  dibujar();
}

/** modo maqueta: torre blanca, vecinos gris claro y sombras suaves; el color queda solo para el aire */
function aplicarMaqueta() {
  const v = vista;
  if (!v) return;
  v.ren.shadowMap.enabled = cfg.maqueta; v.sol.castShadow = cfg.maqueta;
  const mt = v.torre!.material as THREE.MeshStandardMaterial;
  const blanca = cfg.maqueta || !cfg.torreCp;
  mt.vertexColors = !blanca; mt.color.set(blanca ? 0xf7f7f5 : 0xffffff); mt.needsUpdate = true;
  v.suelo.visible = cfg.suelo && !corrida?.geo.banda;
  for (const m of v.vecinos) { const mm = m.material as THREE.MeshStandardMaterial; mm.color.set(cfg.maqueta ? 0xd9dcdf : 0x9a9ca3); mm.needsUpdate = true; }
  (v.suelo.material as THREE.MeshStandardMaterial).needsUpdate = true; mt.needsUpdate = true;
}
/** escala automática: el tope es la velocidad que supera el 98 % del aire que se ve (los cortes, o todo el túnel) */
function escalaAutomatica(c: Corrida, zc: number): number {
  const g = c.geo, F = c.campo!, vs: number[] = [];
  const mirar = (cel: number) => { if (!g.solido[cel]) vs.push(Math.hypot(F[4 * cel], F[4 * cel + 1], F[4 * cel + 2])); };
  if (cfg.horizontal || cfg.vertical) {
    if (cfg.horizontal) for (let j = 0; j < g.ny; j++) for (let i = 2; i < g.nx - 2; i++) mirar((zc * g.ny + j) * g.nx + i);
    if (cfg.vertical) { const yc = Math.max(0, Math.min(g.ny - 1, Math.round(cfg.yRel * (g.ny - 1)))); for (let k = 1; k < g.nz; k++) for (let i = 2; i < g.nx - 2; i++) mirar((k * g.ny + yc) * g.nx + i); }
  } else for (let cel = 0; cel < g.nx * g.ny * g.nz; cel += 7) mirar(cel);
  if (!vs.length) return 1.6;
  vs.sort((a, b) => a - b);
  return Math.max(0.3, Math.min(3, vs[Math.floor(0.98 * (vs.length - 1))] / UH));
}
const zVereda = (g: Geometria3D) => zEval(g);

/** los remolinos: la superficie donde Q (giro menos estiramiento) pasa el umbral, violeta y transparente */
function vortices() {
  const c = corrida, v = vista;
  if (!c || !v || !c.campo) return;
  if (v.vortices) { v.esc.remove(v.vortices); v.vortices.geometry.dispose(); v.vortices = null; }
  if (!cfg.vortices) return;
  const g = c.geo, Q = criterioQ(c.campo, g.nx, g.ny, g.nz, g.solido), iso = umbralQ(Q, cfg.umbralQ);
  if (!isFinite(iso)) return;
  const t = isosuperficie(Q, g.nx, g.ny, g.nz, iso), pos = new Float32Array(t.length);
  for (let i = 0; i < t.length; i += 3) { const q = aMundo(g, t[i] + 0.5, t[i + 1] + 0.5, t[i + 2] - 0.5); pos[i] = q.x; pos[i + 1] = q.y; pos[i + 2] = q.z; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color('#6a4fb3'), transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, roughness: 0.6 }));
  v.esc.add(m); v.vortices = m;
}
/** las semillas de las líneas: la grilla de siempre o un rastrillo vertical u horizontal (en celdas de la red) */
function semillas(g: Geometria3D): number[][] {
  const bC = g.caja.y1 - g.caja.y0 + 1, x0 = Math.max(2, g.caja.x0 - bC), yc = (g.caja.y0 + g.caja.y1 + 1) / 2, n = Math.max(3, Math.round(cfg.rastN));
  if (cfg.rastrillo === 'vertical') { const y = yc + (cfg.rastPos - 0.5) * 2.6 * bC; return Array.from({ length: n }, (_, k) => [x0, y, (0.04 + (1.25 * k) / (n - 1)) * g.hC + 0.5]); }
  if (cfg.rastrillo === 'horizontal') { const z = Math.max(0.03, cfg.rastAlto) * g.hC + 0.5; return Array.from({ length: n }, (_, k) => [x0, yc + (-1.3 + (2.6 * k) / (n - 1)) * bC, z]); }
  const out: number[][] = [];
  for (const zr of [0.15, 0.4, 0.65, 0.9, 1.1]) for (let s2 = -1; s2 <= 1.001; s2 += 0.25) out.push([x0, yc + s2 * bC * 0.95, zr * g.hC + 0.5]);
  return out;
}
/** las líneas de corriente del campo (puntos en metros, velocidad de la red y tiempo de la red en cada punto) */
function trazosDeCorriente(): Trazo[] {
  const c = corrida!, g = c.geo, F = c.campo!;
  // las coordenadas de los puntos son las de la planta en la red (como el dibujo de la torre): el centro de la celda i
  // está en i + ½ y la altura de la celda k en k − ½ (con suelo) o k + ½ (banda). La velocidad se interpola entre centros
  const dz = g.banda ? -0.5 : 0.5;
  const vel = (x0: number, y0: number, z0: number): [number, number, number] | null => {
    const x = x0 - 0.5, y = y0 - 0.5, z = z0 + dz;
    if (x < 0 || x >= g.nx - 1 || z < (g.banda ? 0 : 1) || z >= g.nz - 1 || y < 0 || y >= g.ny - 1) return null;
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k;
    let su = 0, sv = 0, sw = 0;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let d = 0; d < 2; d++) {
      const cel = ((k + d) * g.ny + j + b) * g.nx + i + a, ww = (a ? fx : 1 - fx) * (b ? fy : 1 - fy) * (d ? fz : 1 - fz);
      if (g.solido[cel]) continue;
      su += ww * F[4 * cel]; sv += ww * F[4 * cel + 1]; sw += ww * F[4 * cel + 2];
    }
    return [su, sv, sw];
  };
  // la torre (y los vecinos) como se dibujan: la planta exacta de cada tramo. Una línea no puede entrar: si cae adentro
  // (o a menos del grosor del tubo del borde) se la saca hasta el borde más cercano, o arriba de la azotea si está más
  // cerca. En la grilla una celda es sólida si su centro está adentro: sin esto, en las esquinas la línea pasaba por
  // celdas «de aire» que en el dibujo ya son torre
  const margen = (cfg.lineas && cfg.estiloLineas === 'tubos' ? radioTubo(g) * g.escala : 0.1) + 0.2;
  const cuerpos = [...g.tramos.map(t2 => ({ pol: t2.pol, h0: t2.h0, h1: t2.h1 })), ...g.vecinos.map(v2 => ({ pol: v2.pol, h0: v2.desde, h1: v2.altura }))];
  const fuera = (p: number[]) => sacarAfuera(p, cuerpos, g.escala, margen);
  return semillas(g).map(p0 => {
    let p = p0.slice(), t = 0, cerca = 0;
    fuera(p);
    const a0 = vel(p[0], p[1], p[2]);
    const tr: Trazo = { pts: [aMundo(g, p[0], p[1], p[2])], vel: [a0 ? Math.hypot(...a0) : 0], t: [0] };
    for (let n = 0; n < 1600; n++) {
      const a = vel(p[0], p[1], p[2]); if (!a) break;
      const m = Math.hypot(...a); if (m < 1e-6) break;
      // cerca de la torre, pasos más cortos (el aire dobla en poco lugar)
      const hh = (cerca > 0 ? 0.3 : 0.6) / m, mid = [p[0] + 0.5 * hh * a[0], p[1] + 0.5 * hh * a[1], p[2] + 0.5 * hh * a[2]];
      fuera(mid);
      const b = vel(mid[0], mid[1], mid[2]); if (!b) break;
      p = [p[0] + hh * b[0], p[1] + hh * b[1], p[2] + hh * b[2]]; t += hh;
      if (fuera(p)) cerca = 6; else if (cerca > 0) cerca--;
      // cerca de la torre se guardan todos los puntos (si no, la curva suavizada corta la esquina)
      if (cerca > 0 || n % 2 === 0) { tr.pts.push(aMundo(g, p[0], p[1], p[2])); tr.vel.push(m); tr.t.push(t); }
    }
    return tr;
  }).filter(tr => tr.pts.length > 3);
}
/** el radio de los tubos (m): unas 0,06 celdas más 5 cm, por el grosor elegido (antes 0,16 celdas más 12 cm: muy gruesos de cerca) */
const radioTubo = (g: Geometria3D) => Math.max(0.02, cfg.grosorLineas * (0.06 / g.escala + 0.05));
function lineasDeCorriente() {
  const c = corrida!, v = vista!, g = c.geo;
  v.lineas.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); });
  v.lineas.clear(); v.particulas = null;
  if (!cfg.lineas && !cfg.particulas) return;
  const trazos = trazosDeCorriente();
  const porVel = cfg.colorLineas === 'velocidad', uno = new THREE.Color(css('--deformada', '#1d9e75')).multiplyScalar(0.6);
  const color = (m: number, out: THREE.Color) => (porVel ? colLinea(m, out) : out.copy(uno));
  if (cfg.lineas) {
    if (cfg.estiloLineas === 'tubos') v.lineas.add(grupoTubos(trazos, color, radioTubo(g)));
    else {
      const mat = new THREE.LineBasicMaterial({ vertexColors: true }), cc = new THREE.Color();
      for (const tr of trazos) {
        const geom = new THREE.BufferGeometry().setFromPoints(tr.pts);
        geom.setAttribute('color', new THREE.Float32BufferAttribute(tr.vel.flatMap(m => { color(m, cc); return [cc.r, cc.g, cc.b]; }), 3));
        v.lineas.add(new THREE.Line(geom, mat));
      }
    }
  }
  // el rastrillo a la vista (ámbar): de dónde salen las líneas
  if (cfg.rastrillo !== 'grilla' && cfg.verRastrillo) {
    const ss = semillas(g), a = ss[0], b = ss[ss.length - 1];
    const r = new THREE.Line(new THREE.BufferGeometry().setFromPoints([aMundo(g, a[0], a[1], a[2]), aMundo(g, b[0], b[1], b[2])]), new THREE.LineBasicMaterial({ color: new THREE.Color(css('--elegido', '#ef9f27')) }));
    v.lineas.add(r);
  }
  // partículas: cruzan el túnel en unos 8 segundos al viento que llega a la altura de la torre
  if (cfg.particulas) {
    // más claras que las líneas y más gruesas que los tubos: se ven aunque viajen por adentro
    const blancoP = new THREE.Color(1, 1, 1), colP = (m: number, out: THREE.Color) => color(m, out).lerp(blancoP, 0.45);
    const p = new Particulas(trazos, colP, 8, Math.max(0.6, cfg.grosorLineas * (0.7 / g.escala + 0.3)), g.nx / UH / 8000);
    v.lineas.add(p.obj); v.particulas = p;
  }
}

/** la resolución del lienzo mientras se graba en fila (null: la de la pantalla) */
let tamGrab: { w: number; h: number } | null = null;
function dibujar() {
  const v = vista;
  if (!v || !v.cont.isConnected) return;
  if (tamGrab) {
    // grabando en fila: el lienzo con la resolución del video (en pantalla se ve achicado, con la misma forma)
    if (v.ren.domElement.width !== tamGrab.w || v.ren.domElement.height !== tamGrab.h) { v.ren.setPixelRatio(1); v.ren.setSize(tamGrab.w, tamGrab.h, false); v.cam.aspect = tamGrab.w / tamGrab.h; v.cam.updateProjectionMatrix(); }
  } else {
    const w = Math.max(320, v.cont.clientWidth), hh = Math.round(w * 0.58);
    if (v.ren.getPixelRatio() !== Math.min(2, window.devicePixelRatio)) v.ren.setPixelRatio(Math.min(2, window.devicePixelRatio));
    if (v.ren.domElement.width !== Math.round(w * v.ren.getPixelRatio())) { v.ren.setSize(w, hh); v.cam.aspect = w / hh; v.cam.updateProjectionMatrix(); }
  }
  v.particulas?.avanzar(performance.now());
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

/** la altura (m) del viento de referencia: la del corte horizontal (o la vereda); sin corte horizontal, la de la torre */
function zRef3d(): number {
  const g = corrida?.geo; if (!g) return 10;
  // la banda: el viento llega parejo, el de la mitad de la franja
  if (g.banda) return (g.banda.z0 + g.banda.z1) / 2;
  return cfg.vereda ? 1.5 : cfg.horizontal ? Math.max(1.5, cfg.zRel * g.H) : g.H;
}
/** una velocidad (en veces el viento que llega a esa altura) en la unidad elegida */
const tv3 = (x: number) => txtVel(x, vientoQueLlega(zRef3d()));

/** arma el .zip del caso de OpenFOAM con la torre, los vecinos (si se simulan) y el viento del 102-25 a la altura de la torre */
async function exportarOpenFOAM() {
  const [{ casoOpenFOAM, Z0_EXPOSICION }, { default: JSZip }] = await Promise.all([import('../viento/openfoam'), import('jszip')]);
  const p = estado.proyecto, niveles = nivelesProyecto(), H = Math.max(...niveles.map(k => k.cota));
  const exp = datos102De(p).exposicion, Uref = vientoDisenoEn(H) ?? 40;
  const vecinos = cfg.contexto ? (p.contexto?.edificios ?? []).map(e => ({ id: e.id, tramos: tramosEdificio(e) })) : [];
  const nombre = (p.nombre || 'torre').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '_').replace(/^_|_$/g, '') || 'torre';
  const f = casoOpenFOAM({ nombre: p.nombre || 'Torre', niveles, dir: estado.dir, angulo: cfg.angulo, vecinos, Uref, z0: Z0_EXPOSICION[exp] ?? 0.03 });
  const zip = new JSZip(), carpeta = zip.folder(`${nombre}_viento${estado.dir}`)!;
  for (const [ruta, c] of f) carpeta.file(ruta, c, ruta.startsWith('Allrun') ? { unixPermissions: 0o755 } : {});
  const blob = await zip.generateAsync({ type: 'blob', platform: 'UNIX' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${nombre}_openfoam_viento${estado.dir}.zip`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ------------------------------------------------------------------------------------------------ llaves de colores
let llaves3d: H | null = null;
/** las llaves que se ven (para dibujarlas dentro del video) */
let llavesVisibles: Llave[] = [];
/** los símbolos del dibujo que corresponden a lo que se ve (para el video) */
let simbolosVisibles: Simbolo[] = [];
/** las llaves de lo que se ve: las caras (Cp) y el corte o la vereda */
function armarLlaves3d() {
  if (!llaves3d) return;
  if (!cfg.llave && !cfg.simbolos) { llaves3d.replaceChildren(); return; }
  const fondo = '#ffffff', az = css('--compresion', '#378add'), ro = css('--traccion', '#e24b4a');
  if (cfgFachada.unidad === 'kn' && !(corrida?.infoFz?.qh)) cfgFachada.unidad = 'cp';
  const caras: Llave = llaveFachada(corrida?.infoFz?.qh ?? NaN);
  let corte: Llave | null = null;
  if (cfg.vereda && cfg.lawson) corte = { titulo: `Vereda (${fmt(cfgRosa.alturaEval, 1)} m): confort Lawson`, colores: LAWSON_LDDC.map(k => COL_LAWSON[k.codigo]), marcas: [[0, 'A sentarse'], [0.5, 'C parado'], [1, 'E incómodo']] };
  else if (cfg.vereda) corte = { titulo: `Vereda (${fmt(cfgRosa.alturaEval, 1)} m): el viento comparado con el del campo abierto`, colores: [fondo, css('--deformada', '#1d9e75'), css('--elegido', '#ef9f27')], marcas: [[0, 'quieto'], [1 / 1.6, 'igual'], [1, '+60 % o más']] };
  else if (cfg.horizontal || cfg.vertical) corte = cfg.color === 'cp'
    ? { titulo: 'Cortes: presión (Cp)', colores: [ro, fondo, az], marcas: [[0, '≤ −1,2 succiona'], [1.2 / 2.2, '0'], [1, '+1 empuja']] }
    : { titulo: `Cortes: velocidad del viento (el que llega a ${Math.round(zRef3d())} m: ${tv3(1)})${avisoArcoiris()}`, colores: coloresTermico(), marcas: marcasVel() };
  // las flechas: si el corte ya va en velocidad, su llave sirve; si no, una aparte arriba a la derecha
  const conCortes = cfg.horizontal || cfg.vertical || cfg.vereda;
  let flechas: Llave | null = null;
  if (conCortes && cfg.flechas === 'fijas' && (cfg.vereda || cfg.color === 'cp')) flechas = { titulo: `Flechas: el color dice la velocidad${avisoArcoiris()}`, colores: coloresTermico(), marcas: [[0, 'quieta'], [1 / 1.6, `${tv3(1)} (llega)`], [1, `≥ ${tv3(1.6)}`]] };
  else if (conCortes && cfg.flechas === 'proporcionales') flechas = { titulo: 'Flechas: el largo dice la velocidad', colores: ['#f4f4f4', '#1d1d24'], marcas: [[0, 'corta: lenta'], [1, `una separación: ${tv3(1.6)}`]] };
  if (flechas && cfg.lineas && cfg.colorLineas === 'velocidad' && flechas.titulo.startsWith('Flechas: el color')) flechas.titulo = `Flechas y líneas de corriente: el color dice la velocidad${avisoArcoiris()}`;
  const lf = flechas ? llaveHtml(flechas) : null; lf?.classList.add('derecha');
  // qué quiere decir cada marca: las flechas, las líneas de corriente y los anillos
  const sim: Simbolo[] = [];
  if (conCortes && cfg.flechas === 'fijas') sim.push({ forma: 'flecha', color: cfg.vereda || cfg.color === 'cp' ? '#9a5aa8' : undefined, texto: 'Flecha: hacia dónde va el aire en el corte',
    nota: cfg.vereda || cfg.color === 'cp' ? 'todas del mismo largo; el color da la velocidad' : 'todas del mismo largo; la velocidad la da el color del corte' });
  else if (conCortes && cfg.flechas === 'proporcionales') sim.push({ forma: 'flecha', texto: 'Flecha: hacia dónde va el aire en el corte', nota: `más larga, más rápido (una separación = ${tv3(1.6)})` });
  if (conCortes && cfg.flechas !== 'no') sim.push({ forma: 'flechaCorta', texto: 'Solo se ve lo que va por el plano del corte', nota: 'el aire que lo atraviesa no aparece en la flecha' });
  if (cfg.lineas) sim.push({ forma: 'lineaGruesa', color: cfg.colorLineas === 'velocidad' ? coloresLinea()[3] : new THREE.Color(css('--deformada', '#1d9e75')).multiplyScalar(0.6).getStyle(), texto: 'Línea de corriente: el camino del aire', nota: cfg.colorLineas === 'velocidad' ? 'el color dice la velocidad' : undefined });
  // las líneas usan la escala de la velocidad: si el corte o las flechas ya la muestran, no hace falta otra llave
  const corteVel = (cfg.horizontal || cfg.vertical) && !cfg.vereda && cfg.color !== 'cp';
  if (cfg.vortices) sim.push({ forma: 'lineaGruesa', color: '#6a4fb3', texto: 'Superficie violeta: un remolino', nota: 'donde el aire gira más de lo que se estira (criterio Q)' });
  const llLineas: Llave | null = (cfg.lineas || cfg.particulas) && cfg.colorLineas === 'velocidad' && !corteVel && !flechas ? { titulo: `${cfg.particulas && !cfg.lineas ? 'Partículas' : 'Líneas de corriente'}: velocidad${avisoArcoiris()}`, colores: coloresLinea(), marcas: marcasVel() } : null;
  const ls = sim.length && cfg.simbolos ? simbolosHtml('Símbolos del dibujo', sim, '#223344', fondo) : null;
  simbolosVisibles = sim;
  llavesVisibles = cfg.llave ? [...(cfg.maqueta || !cfg.torreCp ? [] : [caras]), ...(corte ? [corte] : []), ...(llLineas ? [llLineas] : []), ...(flechas ? [flechas] : [])] : [];
  llaves3d.replaceChildren(...(cfg.llave ? [...(cfg.maqueta ? [] : [llaveHtml(caras)]), ...(corte ? [llaveHtml(corte)] : []), ...(llLineas ? [(() => { const e = llaveHtml(llLineas); e.classList.add('derecha'); return e; })()] : []), ...(lf ? [lf] : [])] : []), ...(ls ? [ls] : []));
}

// ------------------------------------------------------------------------------------------------ vista y grabación (etapa 3)
let camaraGuardada: { pos: THREE.Vector3; mira: THREE.Vector3 } | null = null;
let grabando: { parar: () => void } | null = null;
const cfgGrab = { recorrido: 'orbita' as Recorrido, segundos: 15 };
function ponerCamara(p: { pos: THREE.Vector3; mira: THREE.Vector3 }) {
  const v = vista; if (!v) return;
  v.cam.position.copy(p.pos); v.ctl.target.copy(p.mira); v.ctl.update(); dibujar();
}
function seccionVista(): HTMLElement {
  const s = seccion('Vista, cámaras y grabación'), d = s.cuerpo;
  const cambiar = (f: () => void, lineas = true) => { f(); if (lineas && corrida) corrida.ultimasLineas = 0; aplicarMaqueta(); actualizarCampo(); armarLlaves3d(); estado.avisarPanel(); };
  const chk = (rot: string, val: boolean, al: (x: boolean) => void, ayuda?: string) => {
    const l = h('label', { class: 'campo-linea', ...(ayuda ? { title: ayuda } : {}) }, h('input', { type: 'checkbox', ...(val ? { checked: '' } : {}) }), ` ${rot}`);
    l.querySelector('input')!.addEventListener('change', e => cambiar(() => al((e.target as HTMLInputElement).checked)));
    return l;
  };
  const sel = <T extends string>(rot: string, op: [T, string][], v: T, al: (x: T) => void) => {
    const e = h('select', {}) as HTMLSelectElement; op.forEach(([k, t]) => e.append(new Option(t, k, false, k === v)));
    e.addEventListener('change', () => cambiar(() => al(e.value as T)));
    return h('label', { class: 'campo' }, h('span', {}, rot), e);
  };
  const rango = (rot: string, v: number, min: number, max: number, paso: number, al: (x: number) => void) => {
    const i = h('input', { type: 'range', min: String(min), max: String(max), step: String(paso), value: String(v) }) as HTMLInputElement;
    i.addEventListener('change', () => cambiar(() => al(+i.value)));
    return h('label', { class: 'campo' }, h('span', {}, rot), i);
  };
  d.append(
    chk('Modo maqueta (torre blanca y sombras)', cfg.maqueta, x => { cfg.maqueta = x; }, 'Como una maqueta en un túnel: la torre y los vecinos sin color, con sombras; el color queda para el aire'),
    h('div', { class: 'grilla2' },
      sel('Líneas de corriente', [['lineas', 'líneas finas'], ['tubos', 'tubos con relieve']], cfg.estiloLineas, x => { cfg.estiloLineas = x; }),
      sel('Escala de la velocidad', [['fija', 'fija (hasta 1,6 veces el que llega)'], ['auto', 'automática (lo que se ve)']], cfg.escalaVel, x => { cfg.escalaVel = x; }),
      ...(cfg.estiloLineas === 'tubos' ? [sel('Grosor de los tubos', [['0.5', 'muy finos'], ['1', 'finos'], ['1.7', 'medios'], ['2.8', 'gruesos']], String(cfg.grosorLineas) as '0.5' | '1' | '1.7' | '2.8', x => { cfg.grosorLineas = +x; })] : [])),
    chk('Partículas que viajan con el aire (como tinta)', cfg.particulas, x => { cfg.particulas = x; }, 'Puntos que recorren las líneas de corriente a la velocidad del aire: donde se separan el aire acelera, donde se juntan se frena'),
    chk('Remolinos (superficies violetas)', cfg.vortices, x => { cfg.vortices = x; }, 'Envuelve los núcleos de los remolinos: donde el aire gira más de lo que se estira (criterio Q). Con grillas grandes tarda un poco en armarse'),
    ...(cfg.vortices ? [rango('Remolinos: hacia la derecha, también los flojos', 1 - cfg.umbralQ, 0.5, 0.97, 0.01, x => { cfg.umbralQ = 1 - x; })] : []),
    h('div', { class: 'grilla2' },
      sel('De dónde salen', [['grilla', 'una grilla delante de la torre'], ['vertical', 'un rastrillo vertical'], ['horizontal', 'un rastrillo horizontal']], cfg.rastrillo, x => { cfg.rastrillo = x; }),
      ...(cfg.rastrillo === 'vertical' ? [rango('Rastrillo: de costado', cfg.rastPos, 0, 1, 0.02, x => { cfg.rastPos = x; })] : cfg.rastrillo === 'horizontal' ? [rango('Rastrillo: altura', cfg.rastAlto, 0.03, 1.3, 0.01, x => { cfg.rastAlto = x; })] : []),
      ...(cfg.rastrillo !== 'grilla' ? [rango('Cantidad de líneas', cfg.rastN, 4, 40, 1, x => { cfg.rastN = x; })] : [])),
    h('p', { class: 'nota chica' }, `El rastrillo es la raya ámbar de la vista: de ahí salen las líneas. ${cfg.escalaVel === 'auto' ? 'Con la escala automática los colores aprovechan todo el espectro, pero dos vistas no se comparan: para comparar, fija.' : 'Con la escala fija dos corridas o dos grabaciones se comparan con los mismos colores.'}`));
  // cámaras
  const fila = h('div', { class: 'fila-acciones' });
  CAMARAS.forEach(([k, t]) => { const b = h('button', { type: 'button', class: 'mini' }, t); b.addEventListener('click', () => { if (corrida) ponerCamara(camara(k as NombreCamara, corrida.geo)); }); fila.append(b); });
  const bG = h('button', { type: 'button', class: 'mini', title: 'Recuerda dónde está la cámara ahora' }, '★ Guardar esta');
  bG.addEventListener('click', () => { const v = vista; if (v) { camaraGuardada = { pos: v.cam.position.clone(), mira: v.ctl.target.clone() }; estado.avisarPanel(); } });
  fila.append(bG);
  if (camaraGuardada) { const bV = h('button', { type: 'button', class: 'mini' }, '↺ La guardada'); bV.addEventListener('click', () => camaraGuardada && ponerCamara(camaraGuardada)); fila.append(bV); }
  d.append(h('span', { class: 'nota chica' }, 'Cámaras: siempre las mismas para la misma torre, así las imágenes de dos proyectos se comparan.'), fila);
  // grabación
  const rec = h('select', {}) as HTMLSelectElement;
  ([['quieta', 'cámara quieta'], ['orbita', 'una vuelta alrededor de la torre'], ['vuelo', 'vuelo: del peatón a la vista de arriba']] as [Recorrido, string][]).forEach(([k, t]) => rec.append(new Option(t, k, false, k === cfgGrab.recorrido)));
  rec.addEventListener('change', () => { cfgGrab.recorrido = rec.value as Recorrido; });
  const dur = h('select', {}) as HTMLSelectElement;
  [10, 15, 30, 60].forEach(n => dur.append(new Option(`${n} s`, String(n), false, n === cfgGrab.segundos)));
  dur.addEventListener('change', () => { cfgGrab.segundos = +dur.value; });
  const bR = h('button', { type: 'button', class: grabando ? 'boton' : 'primario' }, grabando ? '■ Parar' : '● Grabar video');
  bR.addEventListener('click', () => { if (grabando) { grabando.parar(); return; } grabarVideo(); });
  d.append(h('div', { class: 'grilla2' }, h('label', { class: 'campo' }, h('span', {}, 'Recorrido'), rec), h('label', { class: 'campo' }, h('span', {}, 'Duración'), dur)),
    h('div', { class: 'fila-acciones' }, bR),
    h('p', { class: 'nota chica' }, 'Graba la vista en un video (WebM) con la llave de colores, el tiempo real simulado y el gráfico de las fuerzas en la base, que corre junto con la imagen. La simulación sigue mientras se graba.'));
  return s.el;
}
function grabarVideo() {
  const v = vista, c = corrida;
  if (!v || !c) return;
  const g = c.geo, p0 = v.cam.position.clone(), m0 = v.ctl.target.clone();
  const desde = camara('peaton', g), hasta = camara('arriba', g);
  const suave = (t: number) => t * t * (3 - 2 * t);
  const tinta = css('--ink', '#223344'), colA = css('--carga', '#d85a30'), colL = css('--corte', '#7f77dd');
  const msg = (t: string) => { const e = document.getElementById('mensaje'); if (e) e.textContent = t; };
  v.ctl.enabled = false;
  grabando = grabar({
    lienzo: v.ren.domElement, segundos: cfgGrab.segundos,
    alCuadro: t => {
      if (cfgGrab.recorrido === 'orbita') {
        const r = p0.clone().sub(m0), a = 2 * Math.PI * t;
        v.cam.position.set(m0.x + r.x * Math.cos(a) - r.z * Math.sin(a), p0.y, m0.z + r.x * Math.sin(a) + r.z * Math.cos(a)); v.cam.lookAt(m0);
      } else if (cfgGrab.recorrido === 'vuelo') {
        const k = suave(t); v.cam.position.lerpVectors(desde.pos, hasta.pos, k); v.cam.lookAt(new THREE.Vector3().lerpVectors(desde.mira, hasta.mira, k));
      }
      dibujar();
    },
    encima: (gx, W, H) => {
      // las llaves arriba a la izquierda, el tiempo arriba a la derecha y las fuerzas abajo
      let y = 10;
      for (const ll of llavesVisibles) { const alto = 46; llaveEnLienzo(gx, ll, 10, y + alto, Math.min(300, W * 0.36), '#ffffff', tinta); y += alto + 6; }
      const seg = c.gpu ? c.gpu.pasos * (isFinite(c.dtPaso) ? c.dtPaso : 0) : 0;
      gx.save(); gx.font = '600 13px system-ui, sans-serif'; gx.textAlign = 'right'; gx.fillStyle = 'rgba(255,255,255,0.85)'; gx.fillRect(W - 220, 8, 212, 40);
      gx.fillStyle = tinta; gx.fillText(`viento ${estado.dir} · ${fmt(seg, 0)} s simulados`, W - 16, 26); gx.font = '11px system-ui, sans-serif'; gx.fillText('Torre 3D · túnel de viento (didáctico)', W - 16, 41); gx.restore();
      if (c.fz && c.fz.serie.length > 1) graficoEnLienzo(gx, c.fz.serie, 10, H - 110, Math.min(420, W * 0.45), 100, { arrastre: colA, lateral: colL, tinta });
    },
    alTerminar: (blob, error) => {
      grabando = null; v.ctl.enabled = true; v.cam.position.copy(p0); v.ctl.target.copy(m0); v.ctl.update(); dibujar(); estado.avisarPanel();
      if (!blob) { msg(error ?? 'No se pudo grabar.'); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `tunel3d_viento${estado.dir}.webm`;
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      msg(`Video listo (${fmt(blob.size / 1e6, 1)} MB).`);
    },
  });
  if (grabando) msg(`Grabando ${cfgGrab.segundos} s…`);
  estado.avisarPanel();
}


// ------------------------------------------------------------------------------------------------ tomas en fila
let tomas: Toma[] = cargarTomas();
const cfgExp: ExportarTomas = { resolucion: '1280x720', mp4: true, pptx: true };
let enFila: { cancelar: boolean; i: number; n: number; estado: string } | null = null;
const pausa = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const nombresTam = () => ({ ...Object.fromEntries(Object.entries(TAM).map(([k, v]) => [k, v.texto])), procesador: TAM_CPU.texto });

/** la toma con lo que se ve ahora (y la cámara de este momento) */
function tomaActual(): Toma {
  const v = vista;
  return {
    id: nuevoId(), nombre: `Toma ${tomas.length + 1}`, activa: true,
    sim: { tam: cfg.motor === 'procesador' ? 'procesador' : cfg.tam, paredes: cfg.paredes, angulo: cfg.angulo, lento: cfg.lento, ajustado: cfg.ajustado, banda: cfg.banda, bandaCota: cfg.bandaCota, bandaPisos: cfg.bandaPisos },
    vista: {
      maqueta: cfg.maqueta, torreCp: cfg.torreCp, suelo: cfg.suelo, lineas: cfg.lineas ? cfg.estiloLineas : 'no', colorLineas: cfg.colorLineas, particulas: cfg.particulas,
      vortices: cfg.vortices, umbralQ: cfg.umbralQ, flechas: cfg.flechas, horizontal: cfg.horizontal, vertical: cfg.vertical, zRel: cfg.zRel, yRel: cfg.yRel,
      densidadFlechas: cfg.densidadFlechas, grosorLineas: cfg.grosorLineas, color: cfg.color, espectro: espectroVel, escalaVel: cfg.escalaVel, rastrillo: cfg.rastrillo, verRastrillo: cfg.verRastrillo, rastN: cfg.rastN, vereda: cfg.vereda, lawson: cfg.lawson,
    },
    camara: v ? 'guardada' : 'esquina', ...(v ? { pos: v.cam.position.toArray(), mira: v.ctl.target.toArray() } : {}),
    acercar: 1, recorrido: cfgGrab.recorrido, segundos: cfgGrab.segundos, calentar: 1.5, llaves: 'costado', simbolos: cfg.simbolos, grafico: true, rotulo: true,
  };
}
function aplicarSimToma(t: Toma) {
  const s = t.sim;
  if (s.tam === 'procesador') cfg.motor = 'procesador'; else if (TAM[s.tam]) { cfg.tam = s.tam; if (soporteGpu) cfg.motor = 'placa'; }
  cfg.paredes = s.paredes; cfg.angulo = s.angulo; cfg.lento = s.lento; cfg.ajustado = s.ajustado; cfg.banda = s.banda; cfg.bandaCota = s.bandaCota; cfg.bandaPisos = s.bandaPisos;
}
function aplicarVistaToma(t: Toma) {
  const v = t.vista;
  Object.assign(cfg, {
    maqueta: v.maqueta, torreCp: v.torreCp, suelo: v.suelo, lineas: v.lineas !== 'no', estiloLineas: v.lineas === 'tubos' ? 'tubos' : 'lineas', colorLineas: v.colorLineas,
    particulas: v.particulas, vortices: v.vortices, umbralQ: v.umbralQ, flechas: v.flechas, densidadFlechas: v.densidadFlechas, grosorLineas: v.grosorLineas, horizontal: v.horizontal, vertical: v.vertical, zRel: v.zRel, yRel: v.yRel,
    color: v.color, escalaVel: v.escalaVel, rastrillo: v.rastrillo, verRastrillo: v.verRastrillo, rastN: v.rastN, vereda: v.vereda, lawson: v.lawson,
    llave: true, simbolos: t.simbolos,
  });
  if (espectroVel !== v.espectro) elegirEspectroVel(v.espectro);
}
/** la cámara de la toma (con el zoom) */
function camaraToma(t: Toma, g: Geometria3D) {
  const b = t.camara === 'guardada' && t.pos && t.mira ? { pos: new THREE.Vector3().fromArray(t.pos), mira: new THREE.Vector3().fromArray(t.mira) } : camara(t.camara === 'guardada' ? 'esquina' : t.camara, g);
  return acercar(b, t.acercar);
}

/**
 * lo que va en el video además de la escena: el rótulo de la toma, el tiempo, las llaves, los símbolos y el gráfico de
 * las fuerzas. Con la franja al costado (F > 0) todo va en la franja y no tapa nada; «encima», en las esquinas, chico
 * y medio transparente; sin llaves, solo el rótulo y el gráfico (si se piden).
 */
function encimaToma(gx: CanvasRenderingContext2D, Wt: number, Ht: number, t: Toma, F: number) {
  const c = corrida; if (!c) return;
  const tinta = css('--ink', '#223344'), colA = css('--carga', '#d85a30'), colL = css('--corte', '#7f77dd');
  const seg = c.gpu ? c.gpu.pasos * (isFinite(c.dtPaso) ? c.dtPaso : 0) : 0;
  const W = Wt - F, p = estado.proyecto;
  const rotulo = `${t.nombre}`, sub = `${p.nombre || 'Proyecto'} · viento ${estado.dir}${cfg.angulo ? ` girado ${cfg.angulo}°` : ''}${c.geo.banda ? ` · banda de ${fmt(c.geo.banda.z0, 0)} a ${fmt(c.geo.banda.z1, 0)} m` : ''}`;
  const tiempo = isFinite(c.dtPaso) && seg > 0 ? `${fmt(seg, 0)} s simulados` : `${fmt(((c.gpu?.pasos ?? 0) * UH) / c.geo.nx, 1)} pasadas del aire`;
  gx.save();
  if (F > 0) {
    // franja: rótulo arriba, llaves y símbolos en el medio, gráfico abajo
    const x = W + 12, ancho = F - 24;
    gx.fillStyle = '#ffffff'; gx.fillRect(W, 0, F, Ht); gx.fillStyle = 'rgba(0,0,0,0.12)'; gx.fillRect(W, 0, 1, Ht);
    let y = 14;
    if (t.rotulo) {
      gx.fillStyle = tinta; gx.textBaseline = 'top'; gx.font = `700 ${Math.round(F / 18)}px system-ui, sans-serif`; gx.fillText(rotulo, x, y, ancho); y += Math.round(F / 18) + 6;
      gx.font = `${Math.round(F / 26)}px system-ui, sans-serif`; gx.fillStyle = '#5f6b76'; gx.fillText(sub, x, y, ancho); y += Math.round(F / 26) + 4; gx.fillText(tiempo, x, y, ancho); y += Math.round(F / 26) + 12;
    }
    // cada llave con su alto real (el título largo se parte en renglones), una debajo de otra, sin salirse de la franja
    if (t.llaves !== 'no') for (const ll of llavesVisibles) {
      const prueba = document.createElement('canvas').getContext('2d')!, r0 = llaveEnLienzo(prueba, ll, 0, 1000, ancho, '#ffffff', tinta, ancho);
      llaveEnLienzo(gx, ll, x, y + r0.alto, ancho, '#ffffff', tinta, ancho); y += r0.alto + 8;
    }
    if (t.simbolos && simbolosVisibles.length) { const a = altoSimbolos(simbolosVisibles); simbolosEnLienzo(gx, 'Símbolos del dibujo', simbolosVisibles, x + ancho, y + a, '#ffffff', tinta, ancho); y += a + 8; }
    if (t.grafico && c.fz && c.fz.serie.length > 1) graficoEnLienzo(gx, c.fz.serie, x, Ht - 118, ancho, 106, { arrastre: colA, lateral: colL, tinta });
  } else {
    // encima: hasta tres llaves arriba a la izquierda, chicas (no más de un 28 % del ancho) y medio transparentes
    if (t.llaves === 'encima') {
      const an = Math.min(260, W * 0.28); let y = 10;
      for (const ll of llavesVisibles.slice(0, 3)) { const prueba = document.createElement('canvas').getContext('2d')!, r0 = llaveEnLienzo(prueba, ll, 0, 1000, an, '#ffffff', tinta, an); llaveEnLienzo(gx, ll, 10, y + r0.alto, an, '#ffffff', tinta, an); y += r0.alto + 6; }
    }
    if (t.rotulo) {
      gx.font = '600 13px system-ui, sans-serif'; gx.textAlign = 'right'; gx.textBaseline = 'alphabetic';
      const ancho = Math.min(W * 0.4, Math.max(gx.measureText(rotulo).width, 200) + 24);
      gx.fillStyle = 'rgba(255,255,255,0.82)'; gx.fillRect(W - ancho - 8, 8, ancho, 44);
      gx.fillStyle = tinta; gx.fillText(rotulo, W - 16, 26, ancho - 16); gx.font = '11px system-ui, sans-serif'; gx.fillText(`${sub} · ${tiempo}`, W - 16, 42, ancho - 16);
    }
    if (t.grafico && c.fz && c.fz.serie.length > 1) graficoEnLienzo(gx, c.fz.serie, W - Math.min(360, W * 0.3) - 10, Ht - 100, Math.min(360, W * 0.3), 90, { arrastre: colA, lateral: colL, tinta });
  }
  gx.restore();
}

/** graba una toma (con la cámara y el recorrido de la toma) y devuelve el video */
function grabarToma(t: Toma, W: number, F: number): Promise<{ blob: Blob | null; error?: string }> {
  return new Promise(res => {
    const v = vista!, g = corrida!.geo, c0 = camaraToma(t, g);
    const desde = camara('peaton', g), hasta = camara('arriba', g), suave = (x: number) => x * x * (3 - 2 * x);
    v.ctl.enabled = false;
    grabando = grabar({
      lienzo: v.ren.domElement, segundos: t.segundos, ancho: W - F, franja: F, mp4: cfgExp.mp4,
      alCuadro: k => {
        if (t.recorrido === 'orbita') {
          const r = c0.pos.clone().sub(c0.mira), a = 2 * Math.PI * k;
          v.cam.position.set(c0.mira.x + r.x * Math.cos(a) - r.z * Math.sin(a), c0.pos.y, c0.mira.z + r.x * Math.sin(a) + r.z * Math.cos(a)); v.cam.lookAt(c0.mira);
        } else if (t.recorrido === 'vuelo') {
          const q = suave(k); v.cam.position.lerpVectors(desde.pos, hasta.pos, q); v.cam.lookAt(new THREE.Vector3().lerpVectors(desde.mira, hasta.mira, q));
        } else { v.cam.position.copy(c0.pos); v.cam.lookAt(c0.mira); }
        dibujar();
      },
      encima: (gx, Wt, Ht) => encimaToma(gx, Wt, Ht, t, F),
      alTerminar: (blob, error) => { grabando = null; v.ctl.enabled = true; res({ blob, error }); },
    });
    if (enFila?.cancelar) grabando?.parar();
  });
}

/** los videos de la última exportación de simulaciones (en esta sesión), para la presentación del trabajo */
export interface VideoTunel { nombre: string; blob: Blob; portada: string; ext: string; ficha: string[]; ancho: number; alto: number }
let ultimosVideos: VideoTunel[] = [];
export const ultimasSimulaciones = (): VideoTunel[] => ultimosVideos;
/** graba todas las tomas activas, una detrás de otra, y arma el paquete (.zip con los videos, la ficha y la presentación) */
async function exportarSimulaciones() {
  const msg = (x: string) => { const e = document.getElementById('mensaje'); if (e) e.textContent = x; };
  const lista = tomas.filter(t => t.activa);
  if (!lista.length) { msg('No hay tomas marcadas para grabar.'); return; }
  if (!vista?.cont.isConnected || !corrida) { msg('Abrí la vista del túnel 3D (Viento → Túnel 3D) y esperá a que arranque.'); return; }
  const fv = formatoVideo(cfgExp.mp4);
  if (!fv) { msg('Este navegador no graba video (probá con Chrome o Edge).'); return; }
  const [W, H] = cfgExp.resolucion.split('x').map(Number);
  const antes = { cfg: JSON.parse(JSON.stringify(cfg)) as typeof cfg, espectro: espectroVel, cam: vista ? { pos: vista.cam.position.clone(), mira: vista.ctl.target.clone() } : null };
  enFila = { cancelar: false, i: 0, n: lista.length, estado: 'empezando' };
  const videos: { t: Toma; blob: Blob; portada: string; ext: string }[] = [], fallas: string[] = [];
  const avisar = (x: string) => { if (enFila) enFila.estado = x; msg(x); estado.avisarPanel(); };
  try {
    for (const [i, t] of lista.entries()) {
      if (enFila.cancelar) break;
      enFila.i = i;
      aplicarSimToma(t);
      if (!corrida || corrida.clave !== claveCorrida()) { avisar(`Toma ${i + 1} de ${lista.length} · «${t.nombre}»: arrancando la simulación…`); await iniciar(); estado.avisarPanel(); }
      // que la vista sea de esta corrida y que la simulación corra
      for (let k = 0; k < 120 && (!vista || !corrida || vista.clave !== corrida.clave || !corrida.gpu); k++) await pausa(250);
      const c: Corrida | null = corrida;
      if (!c?.gpu || !vista) { fallas.push(`«${t.nombre}»: no arrancó (${c?.error ?? 'sin motor'})`); continue; }
      if (!c.corriendo) { c.corriendo = true; requestAnimationFrame(ciclo); }
      // calentar: el aire tiene que pasar por el túnel unas veces antes de grabar
      const t0 = performance.now();
      while (!enFila.cancelar && corrida === c && (c.gpu.pasos * UH) / c.geo.nx < t.calentar) {
        if (c.roto) break;
        avisar(`Toma ${i + 1} de ${lista.length} · «${t.nombre}»: calentando ${fmt((c.gpu.pasos * UH) / c.geo.nx, 1)} de ${fmt(t.calentar, 1)} pasadas del aire…`);
        await pausa(1000);
        if (performance.now() - t0 > 30 * 60 * 1000) break;
      }
      if (enFila.cancelar) break;
      if (c.roto) { fallas.push(`«${t.nombre}»: la simulación se volvió inestable (${c.roto})`); continue; }
      // lo que se ve, la resolución y la cámara
      // la franja de las llaves: un cuarto del ancho, dentro de la resolución elegida (el video queda de W × H)
      const F = t.llaves === 'costado' ? 2 * Math.round(W * 0.125) : 0;
      tamGrab = { w: W - F, h: H };
      aplicarVistaToma(t); c.ultimasLineas = 0; aplicarMaqueta(); actualizarCampo(); armarLlaves3d();
      const c0 = camaraToma(t, c.geo); ponerCamara(c0);
      await pausa(1500); c.ultimasLineas = 0; actualizarCampo(); await pausa(800);
      dibujar();
      // la portada del video en la presentación: el primer cuadro con la franja, como en el video
      const pc = document.createElement('canvas'); pc.width = W; pc.height = H;
      const pg2 = pc.getContext('2d')!; pg2.fillStyle = '#ffffff'; pg2.fillRect(0, 0, W, H); pg2.drawImage(vista.ren.domElement, 0, 0, W - F, H); encimaToma(pg2, W, H, t, F);
      const portada = pc.toDataURL('image/png');
      avisar(`Toma ${i + 1} de ${lista.length} · «${t.nombre}»: grabando ${t.segundos} s…`);
      const r = await grabarToma(t, W, F);
      if (r.blob) videos.push({ t, blob: r.blob, portada, ext: fv.ext }); else fallas.push(`«${t.nombre}»: ${r.error ?? 'no se grabó'}`);
    }
  } finally {
    tamGrab = null;
    Object.assign(cfg, antes.cfg); if (espectroVel !== antes.espectro) elegirEspectroVel(antes.espectro);
    const cancelada = enFila?.cancelar; enFila = null;
    if (vista) { vista.ctl.enabled = true; if (antes.cam) ponerCamara(antes.cam); }
    if (corrida && corrida.clave === claveCorrida()) { corrida.ultimasLineas = 0; aplicarMaqueta(); actualizarCampo(); } else void iniciar();
    armarLlaves3d(); estado.avisarPanel();
    if (cancelada) msg(`Cancelado. ${videos.length ? `Se arma el paquete con las ${videos.length} tomas grabadas.` : ''}`);
  }
  if (!videos.length) { msg(`No se grabó ninguna toma. ${fallas.join(' · ')}`); return; }
  // quedan a mano para la presentación del trabajo (Exportar ▾ → Presentación del trabajo)
  ultimosVideos = videos.map(x => ({ nombre: x.t.nombre, blob: x.blob, portada: x.portada, ext: x.ext, ficha: describirToma(x.t, nombresTam()), ancho: W, alto: H }));
  msg('Armando el paquete…');
  await armarPaquete(videos, fallas, W, H);
}


/** las tarjetas abiertas de la lista (se recuerdan al redibujar el panel) */
const tomasAbiertas = new Set<string>();
/** probar una toma en la vista (sin grabar): su simulación, lo que se ve y la cámara */
async function probarToma(t: Toma) {
  aplicarSimToma(t);
  if (!corrida || corrida.clave !== claveCorrida()) { await iniciar(); estado.avisarPanel(); for (let k = 0; k < 60 && (!vista || vista.clave !== corrida?.clave); k++) await pausa(250); }
  aplicarVistaToma(t);
  if (corrida) corrida.ultimasLineas = 0;
  aplicarMaqueta(); actualizarCampo(); armarLlaves3d();
  if (corrida && vista) ponerCamara(camaraToma(t, corrida.geo));
  estado.avisarPanel();
}
function seccionTomas(): HTMLElement {
  const s = seccion('Grabar varias simulaciones y exportarlas'), d = s.cuerpo;
  const listo = () => { guardarTomas(tomas); estado.avisarPanel(); };
  const campo = (rot: string, el: HTMLElement, ayuda?: string) => h('label', { class: 'campo', ...(ayuda ? { title: ayuda } : {}) }, h('span', {}, rot), el);
  const fSel = <O extends object, K extends keyof O>(rot: string, o: O, k: K, ops: [string, string][], num = false) => {
    const e = h('select', {}) as HTMLSelectElement; ops.forEach(([v, t]) => e.append(new Option(t, v, false, String(o[k]) === v)));
    e.addEventListener('change', () => { (o as Record<K, unknown>)[k] = num ? +e.value : e.value; listo(); });
    return campo(rot, e);
  };
  const fChk = <O extends object, K extends keyof O>(rot: string, o: O, k: K, ayuda?: string) => {
    const l = h('label', { class: 'campo-linea', ...(ayuda ? { title: ayuda } : {}) }, h('input', { type: 'checkbox', ...(o[k] ? { checked: '' } : {}) }), ` ${rot}`);
    l.querySelector('input')!.addEventListener('change', e => { (o as Record<K, unknown>)[k] = (e.target as HTMLInputElement).checked; listo(); });
    return l;
  };
  const fNum = <O extends object, K extends keyof O>(rot: string, o: O, k: K, min: number, max: number, paso: number, ayuda?: string) => {
    const i = h('input', { type: 'number', min: String(min), max: String(max), step: String(paso), value: String(o[k]), class: 'n' }) as HTMLInputElement;
    i.addEventListener('change', () => { const v = parseFloat(i.value.replace(',', '.')); if (isFinite(v)) { (o as Record<K, unknown>)[k] = Math.max(min, Math.min(max, v)); listo(); } });
    return campo(rot, i, ayuda);
  };
  // agregar tomas: con una plantilla o con lo que se ve ahora
  const pl = h('select', { 'aria-label': 'Plantilla' }) as HTMLSelectElement;
  PLANTILLAS.forEach(([n], i) => pl.append(new Option(n, String(i))));
  const bAdd = h('button', { type: 'button', class: 'boton' }, '＋ Agregar');
  bAdd.addEventListener('click', () => { const t = PLANTILLAS[+pl.value][1](); t.id = nuevoId(); t.sim.tam = cfg.motor === 'procesador' ? 'procesador' : cfg.tam; tomas.push(t); tomasAbiertas.add(t.id); listo(); });
  const bAct = h('button', { type: 'button', class: 'boton', title: 'Una toma con todo lo que se ve ahora en la vista, con esta cámara' }, '＋ Con lo que se ve ahora');
  bAct.addEventListener('click', () => { const t = tomaActual(); tomas.push(t); tomasAbiertas.add(t.id); listo(); });
  d.append(h('p', { class: 'nota' }, 'Armá una lista de tomas: cada una con su simulación (la definición de la geometría, las paredes, el giro, la banda), lo que se ve (cortes, flechas, líneas o tubos, partículas, remolinos, espectro, maqueta), la cámara (con zoom), el recorrido y las llaves. «Exportar simulaciones» las graba una detrás de otra y baja un .zip con los videos, un LEAME con la ficha de cada uno y una presentación de PowerPoint con un video por lámina. Lo que se simula vuelve a arrancar la simulación solo si cambia; las tomas con la misma simulación se graban seguidas sin esperar.'),
    h('div', { class: 'fila-acciones' }, pl, bAdd, bAct));
  // cómo se exporta
  const res = h('select', {}) as HTMLSelectElement;
  ([['1280x720', '1280 × 720 (HD)'], ['1920x1080', '1920 × 1080 (Full HD)']] as const).forEach(([v, t]) => res.append(new Option(t, v, false, cfgExp.resolucion === v)));
  res.addEventListener('change', () => { cfgExp.resolucion = res.value as ExportarTomas['resolucion']; });
  const fv = formatoVideo(true);
  const mp4 = h('label', { class: 'campo-linea', title: 'PowerPoint reproduce MP4; WebM no siempre' }, h('input', { type: 'checkbox', ...(cfgExp.mp4 ? { checked: '' } : {}) }), ` MP4 si el navegador lo graba (${fv?.ext === 'mp4' ? 'este sí' : 'este no: va en WebM'})`);
  mp4.querySelector('input')!.addEventListener('change', e => { cfgExp.mp4 = (e.target as HTMLInputElement).checked; });
  const ppt = h('label', { class: 'campo-linea' }, h('input', { type: 'checkbox', ...(cfgExp.pptx ? { checked: '' } : {}) }), ' Con la presentación de PowerPoint (un video por lámina, con su ficha)');
  ppt.querySelector('input')!.addEventListener('change', e => { cfgExp.pptx = (e.target as HTMLInputElement).checked; });
  const activas = tomas.filter(t => t.activa).length;
  const bExp = h('button', { type: 'button', class: enFila ? 'boton' : 'primario' }, enFila ? '■ Cancelar' : `▶ Exportar simulaciones (${activas})`);
  bExp.addEventListener('click', () => { if (enFila) { enFila.cancelar = true; grabando?.parar(); return; } void exportarSimulaciones(); });
  if (!activas && !enFila) bExp.setAttribute('disabled', '');
  d.append(h('div', { class: 'grilla2' }, campo('Resolución de los videos', res)), mp4, ppt, h('div', { class: 'fila-acciones' }, bExp),
    ...(enFila ? [h('p', { class: 'nota' }, `Toma ${enFila.i + 1} de ${enFila.n}: ${enFila.estado}. Quedate en esta vista mientras graba (la placa de video dibuja lo que se ve).`)] : []));
  // la lista
  const nt = nombresTam(), gr: [string, string][] = [...(cfg.motor === 'procesador' || soporteGpu === null ? [] : Object.entries(TAM).map(([k, v]) => [k, `${k} · ${v.texto}`] as [string, string])), ['procesador', TAM_CPU.texto]];
  tomas.forEach((t, i) => {
    const det = h('details', { class: 'toma3d', ...(tomasAbiertas.has(t.id) ? { open: '' } : {}) }) as HTMLDetailsElement;
    det.addEventListener('toggle', () => { if (det.open) tomasAbiertas.add(t.id); else tomasAbiertas.delete(t.id); });
    const act = h('input', { type: 'checkbox', title: 'Grabarla', ...(t.activa ? { checked: '' } : {}) }) as HTMLInputElement;
    act.addEventListener('click', e => e.stopPropagation()); act.addEventListener('change', () => { t.activa = act.checked; listo(); });
    const nom = h('input', { type: 'text', value: t.nombre, class: 'toma3d-nombre', 'aria-label': 'Nombre de la toma' }) as HTMLInputElement;
    nom.addEventListener('click', e => e.preventDefault()); nom.addEventListener('keydown', e => e.stopPropagation());
    nom.addEventListener('change', () => { t.nombre = nom.value.trim() || `Toma ${i + 1}`; guardarTomas(tomas); });
    const boton = (txt: string, tit: string, f: () => void) => { const b = h('button', { type: 'button', class: 'mini', title: tit }, txt); b.addEventListener('click', e => { e.preventDefault(); f(); }); return b; };
    const sum = h('summary', {}, act, ' ', nom, h('span', { class: 'nota chica' }, ` ${t.segundos} s · ${t.camara === 'detalle' ? 'zoom a la esquina' : t.camara}`),
      boton('↑', 'Subir', () => { if (i) { [tomas[i - 1], tomas[i]] = [tomas[i], tomas[i - 1]]; listo(); } }),
      boton('↓', 'Bajar', () => { if (i < tomas.length - 1) { [tomas[i + 1], tomas[i]] = [tomas[i], tomas[i + 1]]; listo(); } }),
      boton('⧉', 'Duplicar', () => { const c2 = JSON.parse(JSON.stringify(t)) as Toma; c2.id = nuevoId(); c2.nombre = `${t.nombre} (copia)`; tomas.splice(i + 1, 0, c2); tomasAbiertas.add(c2.id); listo(); }),
      boton('✕', 'Borrar', () => { tomas.splice(i, 1); listo(); }));
    det.append(sum);
    if (det.open || tomasAbiertas.has(t.id)) {
      const v = t.vista, si = t.sim;
      const prob = h('button', { type: 'button', class: 'boton' }, 'Probar esta toma en la vista'); prob.addEventListener('click', () => { void probarToma(t); });
      det.append(
        h('p', { class: 'nota chica' }, describirToma(t, nt).join(' ')),
        h('h4', {}, 'Simulación (si cambia, la simulación vuelve a arrancar)'),
        h('div', { class: 'grilla2' },
          fSel('Definición de la geometría (grilla)', si, 'tam', gr.some(([k]) => k === si.tam) ? gr : [...gr, [si.tam, si.tam]]),
          fSel('Paredes', si, 'paredes', [['exactas', 'exactas en planta y en altura'], ['planta', 'exactas solo en planta (un escalón por piso)'], ['escalera', 'en escalera (gruesa)']]),
          fSel('Giro del viento', si, 'angulo', ['-45', '-30', '-15', '0', '15', '30', '45'].map(a => [a, a === '0' ? '0°' : `${a}°`]), true),
          fChk('Túnel lento (más estable)', si, 'lento'), fChk('Dominio ajustado (1,25 H)', si, 'ajustado'), fChk('Banda de pisos', si, 'banda')),
        ...(si.banda ? [h('div', { class: 'grilla2' }, fNum('Banda: cota del medio (m; vacío = 2/3 H)', si, 'bandaCota', 0, 2000, 0.5), fNum('Banda: pisos', si, 'bandaPisos', 1, 8, 1))] : []),
        h('h4', {}, 'Qué se ve'),
        h('div', { class: 'grilla2' },
          fChk('Corte horizontal', v, 'horizontal'), fChk('Corte vertical', v, 'vertical'),
          fNum('Altura del corte horizontal (0 a 1)', v, 'zRel', 0, 1.3, 0.05), fNum('Posición del corte vertical (0 a 1)', v, 'yRel', 0, 1, 0.05),
          fSel('Color de los cortes', v, 'color', [['velocidad', 'velocidad'], ['cp', 'presión (Cp)']]),
          fSel('Flechas en los cortes', v, 'flechas', [['no', 'sin flechas'], ['fijas', 'del mismo largo (color = velocidad)'], ['proporcionales', 'el largo dice la velocidad']]),
          ...(v.flechas !== 'no' ? [fSel('Cantidad de flechas (más: trazo más fino)', v, 'densidadFlechas', [['0.5', 'la mitad'], ['1', 'normal'], ['1.5', '1,5 veces'], ['2', 'el doble'], ['3', 'el triple'], ['4', '4 veces'], ['6', '6 veces']], true)] : []),
          fSel('Líneas de corriente', v, 'lineas', [['no', 'sin líneas'], ['lineas', 'líneas finas'], ['tubos', 'tubos con relieve']]),
          fSel('Color de las líneas', v, 'colorLineas', [['velocidad', 'la velocidad'], ['uno', 'un solo color']]),
          ...(v.lineas === 'tubos' ? [fSel('Grosor de los tubos', v, 'grosorLineas', [['0.5', 'muy finos'], ['1', 'finos'], ['1.7', 'medios'], ['2.8', 'gruesos']], true)] : []),
          fChk('Partículas (como tinta)', v, 'particulas'), fChk('Nubes de turbulencia (remolinos, criterio Q)', v, 'vortices'),
          ...(v.vortices ? [fNum('Remolinos: umbral (0,03 muchos ↔ 0,5 solo los fuertes)', v, 'umbralQ', 0.03, 0.5, 0.01)] : []),
          fSel('Espectro de la velocidad', v, 'espectro', [['termico', 'térmico (de la app)'], ['arcoiris', 'arcoíris (el rojo es rápido, no tracción)']]),
          fSel('Escala de la velocidad', v, 'escalaVel', [['fija', 'fija (se comparan los videos)'], ['auto', 'automática (todo el espectro)']]),
          fSel('De dónde salen las líneas', v, 'rastrillo', [['grilla', 'una grilla delante'], ['vertical', 'un rastrillo vertical'], ['horizontal', 'un rastrillo horizontal']]),
          ...(v.rastrillo !== 'grilla' ? [fNum('Cantidad de líneas', v, 'rastN', 4, 40, 1), fChk('Ver la raya del rastrillo', v, 'verRastrillo')] : []),
          fChk('Modo maqueta (torre blanca y sombras)', v, 'maqueta'), fChk('Torre con los colores del Cp', v, 'torreCp'), fChk('Suelo', v, 'suelo'),
          fChk('Vereda (viento a 1,5 m)', v, 'vereda'), ...(v.vereda ? [fChk('Vereda con el confort de Lawson', v, 'lawson')] : [])),
        h('h4', {}, 'Cámara y grabación'),
        h('div', { class: 'grilla2' },
          fSel('Cámara', t, 'camara', [...CAMARAS.map(([k, n]) => [k, n] as [string, string]), ...(t.pos ? [['guardada', 'la de esta toma'] as [string, string]] : [])]),
          fNum('Zoom (1 = normal, 2 = el doble de cerca)', t, 'acercar', 0.4, 5, 0.1),
          fSel('Recorrido', t, 'recorrido', [['quieta', 'cámara quieta'], ['orbita', 'una vuelta alrededor'], ['vuelo', 'vuelo: del peatón a la vista de arriba']]),
          fNum('Duración (s)', t, 'segundos', 3, 180, 1), fNum('Calentar antes de grabar (pasadas del aire)', t, 'calentar', 0, 20, 0.5, 'Cuántas veces el aire cruza el túnel antes de grabar: con menos de 1 el flujo todavía no se armó')),
        h('h4', {}, 'Llaves y rótulos del video'),
        h('div', { class: 'grilla2' },
          fSel('Llaves de colores', t, 'llaves', [['costado', 'en una franja al costado (no tapan nada)'], ['encima', 'encima, en una esquina (chicas)'], ['no', 'sin llaves']]),
          fChk('Símbolos del dibujo (qué es cada marca)', t, 'simbolos'), fChk('Gráfico de las fuerzas en la base', t, 'grafico'), fChk('Rótulo: nombre, proyecto y tiempo', t, 'rotulo')),
        h('div', { class: 'fila-acciones' }, prob));
    }
    d.append(det);
  });
  if (!tomas.length) d.append(h('p', { class: 'nota chica' }, 'Todavía no hay tomas: agregá una con una plantilla o con lo que se ve ahora.'));
  return s.el;
}
/** el .zip: los videos, el LEAME con la ficha de cada uno, y la presentación con los videos (si se pidió) */
async function armarPaquete(videos: { t: Toma; blob: Blob; portada: string; ext: string }[], fallas: string[], W: number, H: number) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip(), p = estado.proyecto, hoy = new Date().toLocaleDateString('es-AR');
  const archivo = (i: number, t: Toma, ext: string) => `${String(i + 1).padStart(2, '0')}_${t.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'toma'}.${ext}`;
  const nt = nombresTam();
  const leame = [
    `Simulaciones de viento · ${p.nombre || 'Proyecto'} · ${hoy}`,
    'Torre 3D · túnel de viento 3D (Lattice Boltzmann, didáctico: no reemplaza un ensayo ni un estudio profesional).',
    `Videos de ${W} × ${H} (${videos[0].ext.toUpperCase()}). ${videos[0].ext === 'webm' ? 'WebM: si PowerPoint no lo reproduce, convertilo a MP4 (por ejemplo con VLC o HandBrake) o usá Chrome o Edge, que graban MP4.' : ''}`,
    '',
    ...videos.flatMap(({ t, ext }, i) => [`${archivo(i, t, ext)} · ${t.nombre}`, ...describirToma(t, nt).map(x => `   ${x}`), '']),
    ...(fallas.length ? ['No se grabaron:', ...fallas.map(x => `   ${x}`)] : []),
  ].join('\r\n');
  zip.file('LEAME.txt', leame);
  videos.forEach(({ t, blob, ext }, i) => zip.file(`videos/${archivo(i, t, ext)}`, blob));
  zip.file('tomas.json', JSON.stringify(videos.map(x => x.t), null, 1));
  if (cfgExp.pptx) {
    try {
      const { default: Pptx } = await import('pptxgenjs');
      const pr = new Pptx(); pr.layout = 'LAYOUT_WIDE';
      const t0 = pr.addSlide();
      t0.addText('Estudio de viento en el túnel 3D', { x: 0.6, y: 2.2, w: 12, h: 1, fontSize: 36, bold: true, color: '1F2328' });
      t0.addText(`${p.nombre || 'Proyecto'} · ${hoy}`, { x: 0.6, y: 3.2, w: 12, h: 0.6, fontSize: 18, color: '5F6B76' });
      t0.addText('Simulación didáctica (Lattice Boltzmann) con Torre 3D. Cada lámina tiene un video con sus llaves de colores al costado.', { x: 0.6, y: 4.0, w: 12, h: 0.8, fontSize: 14, color: '5F6B76' });
      const aBase64 = async (b: Blob) => { const buf = new Uint8Array(await b.arrayBuffer()); let s2 = ''; for (let k = 0; k < buf.length; k += 0x8000) s2 += String.fromCharCode(...buf.subarray(k, k + 0x8000)); return btoa(s2); };
      for (const { t, blob, portada, ext } of videos) {
        const sl = pr.addSlide();
        sl.addText(t.nombre, { x: 0.4, y: 0.15, w: 12.5, h: 0.6, fontSize: 24, bold: true, color: '1F2328' });
        // el video en 16:9 (13,33 × 7,5 in), con lugar para el título y la ficha
        const hv = 5.6, wv = (hv * W) / H;
        sl.addMedia({ type: 'video', data: `${blob.type || `video/${ext}`};base64,${await aBase64(blob)}`, extn: ext, cover: portada.replace(/^data:/, ''), x: (13.33 - wv) / 2, y: 0.85, w: wv, h: hv });
        sl.addText(describirToma(t, nt).join('\n'), { x: 0.4, y: 6.55, w: 12.5, h: 0.85, fontSize: 10, color: '5F6B76', valign: 'top' });
      }
      zip.file('presentacion.pptx', await pr.write({ outputType: 'blob' }) as Blob);
    } catch (e) { zip.file('presentacion_ERROR.txt', `No se pudo armar la presentación: ${e instanceof Error ? e.message : String(e)}`); }
  }
  const out = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(out);
  a.download = `simulaciones_viento_${(p.nombre || 'proyecto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)}.zip`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  const e = document.getElementById('mensaje'); if (e) e.textContent = `Listo: ${videos.length} video${videos.length === 1 ? '' : 's'} en el paquete (${fmt(out.size / 1e6, 1)} MB)${fallas.length ? `; no se grabaron ${fallas.length}` : ''}.`;
}

// ------------------------------------------------------------------------------------------------ archivo y lámina (etapa 6)
async function guardarCorrida() {
  const c = corrida, msg = (t: string) => { const e = document.getElementById('mensaje'); if (e) e.textContent = t; };
  if (!c || !c.gpu || !c.campo) { msg('Todavía no hay nada para guardar: esperá a que la simulación arranque.'); return; }
  const o = opcionesGeo();
  const datos = {
    formato: FORMATO_3D, version: VERSION_3D, fecha: new Date().toISOString(), proyecto: estado.proyecto.nombre || '', huella: huella(o.niveles),
    cfg: { tam: cfg.tam, paredes: cfg.paredes, angulo: cfg.angulo, motor: cfg.motor, lento: cfg.lento, contexto: cfg.contexto, alturaEval: cfgRosa.alturaEval }, dir: estado.dir, UH,
    opc: { ...o, angulo: cfg.angulo }, uIn: [...c.uIn], pasos: c.gpu.pasos,
    prom: c.prom.exportar(), fz: c.fz?.exportar() ?? null, plano: c.plano?.exportar() ?? null, campo: aBase64(c.campo),
  };
  const blob = await empaquetar(datos);
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `tunel3d_viento${estado.dir}${cfg.angulo ? `_giro${cfg.angulo}` : ''}.torreviento3d`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  msg(`Corrida guardada (${fmt(blob.size / 1e6, 1)} MB).`);
}
async function abrirCorrida(f: File) {
  const msg = (t: string) => { const e = document.getElementById('mensaje'); if (e) e.textContent = t; };
  try {
    const d = await desempaquetar(f) as any;      // eslint-disable-line @typescript-eslint/no-explicit-any
    if (d?.formato !== FORMATO_3D) throw new Error('no es una corrida del túnel 3D');
    if (d.version > VERSION_3D) throw new Error('es de una versión más nueva de la app');
    detener();
    Object.assign(cfg, { tam: d.cfg.tam, paredes: d.cfg.paredes, angulo: d.cfg.angulo, motor: d.cfg.motor, lento: d.cfg.lento, contexto: d.cfg.contexto });
    cfgRosa.alturaEval = d.cfg.alturaEval ?? cfgRosa.alturaEval;
    if (d.dir !== estado.dir) estado.dir = d.dir;
    UH = d.UH;
    const geo = geometria3D(d.opc), uIn = new Float32Array(d.uIn), c = armarCorrida(geo, uIn);
    c.prom.importar(d.prom);
    if (d.fz && c.fz) c.fz.importar(d.fz);
    if (d.plano && c.plano) c.plano.importar(d.plano);
    c.campo = deBase64(d.campo);
    const N = geo.nx * geo.ny * geo.nz, campo = c.campo;
    c.gpu = { nx: geo.nx, ny: geo.ny, nz: geo.nz, N, pasos: d.pasos, mlups: 0, adaptador: 'corrida guardada', avanzar: () => undefined, esperar: async () => undefined, leer: async () => new Float32Array(0), corte: async () => new Float32Array(0), campo: async () => campo, destruir: () => undefined };
    c.cargando = false; c.corriendo = false; c.guardada = f.name;
    corrida = c;
    const otra = huella(opcionesGeo().niveles) !== d.huella;
    msg(`Corrida abierta: ${f.name}${d.proyecto ? ` (${d.proyecto})` : ''}.${otra ? ' Ojo: la torre del proyecto abierto no es la misma que la de la corrida; las comparaciones con el CIRSOC usan el proyecto abierto.' : ''}`);
    estado.avisarPanel();
    requestAnimationFrame(() => { if (corrida === c) { c.ultimasLineas = 0; actualizarCampo(); actualizarPanel(true); } });
  } catch (e) { msg(`No se pudo abrir la corrida: ${e instanceof Error ? e.message : String(e)}`); }
}
async function lamina() {
  const c = corrida;
  if (!c || !c.gpu) return;
  dibujar();
  const pasadas = (c.gpu.pasos * UH) / c.geo.nx;
  const datos = [
    `Torre de ${fmt(c.geo.H, 1)} m, ${fmt(c.geo.B, 1)} m de ancho y ${fmt(c.geo.L, 1)} m de largo al viento; viento ${estado.dir}${cfg.angulo ? ` girado ${cfg.angulo}°` : ''}`,
    `Viento de diseño en la azotea: ${fmt((vientoDisenoEn(c.geo.H) ?? NaN) * 3.6, 0)} km/h (CIRSOC 102-25, exposición ${datos102De(estado.proyecto).exposicion}), con su perfil en altura`,
    `Grilla de ${c.geo.nx} × ${c.geo.ny} × ${c.geo.nz} celdas de ${fmt(1 / c.geo.escala, 2)} m; ${cfg.motor === 'procesador' ? 'procesador' : 'placa de video'}; paredes ${cfg.paredes}`,
    `Tiempo simulado: ${fmt(pasadas, 1)} pasadas del aire por el túnel${isFinite(c.dtPaso) ? ` (${fmt(c.gpu.pasos * c.dtPaso, 0)} s reales)` : ''}${c.guardada ? ` · corrida guardada «${c.guardada}»` : ''}`,
    ...(c.geo.vecinos.length ? [`Con ${c.geo.vecinos.length} edificios vecinos del contexto urbano`] : []),
  ];
  await abrirLamina(vista?.ren.domElement ?? null, datos, [
    { titulo: '1 · Estructura: fuerzas en la base y por piso', el: panelFz, nota: 'Las cargas de la simulación son un estudio complementario: la media sirve para comparar formas; los picos dependen de cuánto se simuló.' },
    { titulo: '2 · Fachada: presiones pico y zonas', el: panelFach, nota: 'Los picos de las esquinas son los menos precisos con una grilla gruesa: sirven para ver dónde están y comparar formas.' },
    { titulo: '3 · Confort en la torre: remolinos, aceleración y deriva', el: panelDin, nota: 'El viento de entrada no tiene la turbulencia del viento real: la aceleración en el sentido del viento queda corta; la de costado es la confiable.' },
    { titulo: '4 · Calle: rosa de vientos y envolvente', el: panelRosa, nota: 'El confort depende de la rosa de vientos de la estación meteorológica: sin ella el mapa es un ejercicio.' },
  ]);
}

// ------------------------------------------------------------------------------------------------ centro y panel
export function centroTunel3d(c: H, _tam: Tam) {
  c.append(h('p', { class: 'cartel-tunel' }, 'Visualización didáctica: no reemplaza los coeficientes del CIRSOC 102 ni un ensayo en túnel de viento.'));
  if (corrida?.guardada) {
    const b = h('button', { type: 'button', class: 'boton' }, 'Volver a simular');
    b.addEventListener('click', () => { corrida = null; estado.avisarPanel(); });
    c.append(h('p', { class: 'aviso-linea' }, `Corrida guardada «${corrida.guardada}»: se miran sus resultados, no se simula. `, b));
  } else if (soporteGpu === undefined) {
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
  if (!corrida || (!corrida.guardada && corrida.clave !== claveCorrida())) { void iniciar(); }
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
  // una corrida guardada no tiene ciclo que pinte: se pinta acá (el campo ya está)
  if (cr.guardada && cr.campo) { cr.ultimasLineas = 0; actualizarCampo(); }
  if (!cr.corriendo && cr.sinMirar > 30) { cr.sinMirar = 0; cr.corriendo = true; requestAnimationFrame(ciclo); }
  const g = cr.geo;
  c.append(h('p', { class: 'nota' }, `${cfg.motor === 'procesador' ? 'Simulado con el procesador (sin placa de video), grilla gruesa. ' : ''}${g.vecinos.length ? `Con ${g.vecinos.length} edificios vecinos (en gris: el Cp y las caras son solo de la torre; túnel lento). ` : ''}${g.banda ? `Banda de pisos de ${fmt(g.banda.z0, 1)} a ${fmt(g.banda.z1, 1)} m sobre PB (${g.nz} celdas de alto, ${fmt(1 / g.escala, 2)} m por celda), sin suelo, con planos deslizantes arriba y abajo · viento ${estado.dir}${cfg.angulo ? ` girado ${cfg.angulo}°` : ''} entrando por la izquierda, parejo, con la velocidad de esa altura` : `Torre de ${fmt(g.H, 1)} m (${g.hC} celdas de alto, ${fmt(1 / g.escala, 2)} m por celda) · viento ${estado.dir}${cfg.angulo ? ` girado ${cfg.angulo}°` : ''} entrando por la izquierda, con el perfil del CIRSOC 102-25 (exposición ${datos102De(estado.proyecto).exposicion})`} · ancho ${fmt(g.B, 1)} m, largo ${fmt(g.L, 1)} m · paredes ${cfg.paredes === 'exactas' ? `exactas en planta y en altura: el aire choca con la planta real y, donde la fachada sigue de un piso al otro, con la piel inclinada o curva entre pisos (${g.paredes.celdas.length} celdas de pared con su corte exacto)` : cfg.paredes === 'planta' ? `exactas solo en planta: la planta real de cada piso, con un escalón en cada piso (${g.paredes.celdas.length} celdas de pared con su corte exacto)` : 'en escalera: la pared es el borde de las celdas'}. Caras: Cp promediado en el tiempo, azul la que empuja (comprime) y rojo la que succiona (tracciona). ${cfg.vereda ? (cfg.lawson ? 'Vereda: confort del peatón a 1,5 m, de verde claro (A, para sentarse) a marrón (E, incómodo); los porcentajes, en el panel.' : 'Vereda: velocidad a 1,5 m relativa al campo abierto (blanco quieto, verde igual, ámbar más viento).') : cfg.color === 'cp' ? 'Cortes: Cp instantáneo.' : `Cortes: velocidad con ${textoEspectro()} (60 % más rápido que el viento que llega a esa altura, o más). Las velocidades se leen con ${textoReferencia(zRef3d())}.`} Girá con el mouse.`));
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
  // el nivel de fidelidad: motor, grilla y paredes de una vez (se recuerda para los dos túneles)
  {
    const actual = nivelDe3D({ motor: cfg.motor, tam: cfg.tam, paredes: cfg.paredes }), rec = fidelidadRecomendada(soporteGpu === undefined ? null : !!soporteGpu);
    const ops: [string, string][] = ORDEN_FIDELIDAD.map(f => [f, `${FIDELIDAD[f].nombre}${f === rec ? ' (la que conviene acá)' : ''}${FIDELIDAD[f].d3.motor === 'placa' && soporteGpu === null ? ' · necesita placa de video' : ''}`]);
    if (!actual) ops.push(['medida', 'a medida (cambiaste una opción suelta)']);
    d.append(sel('Fidelidad', ops, actual ?? 'medida', x => { if (x === 'medida') return; const f = x as Fidelidad; Object.assign(cfg, FIDELIDAD[f].d3); guardarFidelidad(f); }, true),
      h('p', { class: 'nota chica' }, actual ? `${FIDELIDAD[actual].nombre[0].toUpperCase()}${FIDELIDAD[actual].nombre.slice(1)}: para ${FIDELIDAD[actual].para}.` : 'Las opciones de abajo no coinciden con ningún nivel.'));
  }
  d.append(h('div', { class: 'grilla2' },
    sel('Velocidad del túnel', [['normal', 'normal (0,08 de la red)'], ['lento', 'lenta (0,05: más estable, tarda más)']], cfg.lento ? 'lento' : 'normal', x => { cfg.lento = x === 'lento'; }, true),
    sel('Motor', [['placa', soporteGpu === null ? 'placa de video (no hay WebGPU)' : 'placa de video (WebGPU)'], ['procesador', 'procesador (sin placa, más lento)']], cfg.motor, x => { cfg.motor = x as 'placa' | 'procesador'; }, true),
    cfg.motor === 'procesador' ? h('label', { class: 'campo' }, h('span', {}, 'Grilla'), h('span', { class: 'nota chica' }, TAM_CPU.texto)) : sel('Grilla', Object.entries(TAM).map(([k, v]) => [k, v.texto] as [string, string]), cfg.tam, x => { cfg.tam = x; }, true),
    sel('Paredes', [['exactas', 'exactas en planta y en altura: la piel sigue la fachada entre pisos'], ['planta', 'exactas solo en planta: un escalón por piso (para comparar)'], ['escalera', 'en escalera: el borde de las celdas (para comparar)']], cfg.paredes, x => { cfg.paredes = x as Paredes3DModo; }, true),
    sel('Giro del viento', [...new Set(['-45', '-30', '-15', '0', '15', '30', '45', String(cfg.angulo)])].map(a => [a, a === '0' ? `0° (viento ${estado.dir})` : `${a}°`] as [string, string]), String(cfg.angulo), x => { cfg.angulo = +x; }, true),
    sel('Color de los cortes', [['velocidad', 'velocidad'], ['cp', 'presión (Cp)']], cfg.color, x => { cfg.color = x; }),
    rango('Altura del corte horizontal', cfg.zRel, x => { cfg.zRel = x; }),
    rango('Posición del corte vertical', cfg.yRel, x => { cfg.yRel = x; }),
  ),
  ...((estado.proyecto.contexto?.edificios.length ?? 0) ? [(() => {
    const l = h('label', { class: 'campo-linea' }, h('input', { type: 'checkbox', ...(cfg.contexto ? { checked: '' } : {}) }), ` Con los edificios vecinos (${estado.proyecto.contexto!.edificios.length}, del contexto urbano: se arman en el túnel 2D)`);
    l.querySelector('input')!.addEventListener('change', e => { cfg.contexto = (e.target as HTMLInputElement).checked; estado.avisarPanel(); });
    return l;
  })()] : []),
  chk(`Viento en la vereda (${fmt(cfgRosa.alturaEval, 1)} m)`, cfg.vereda, x => { cfg.vereda = x; }),
  chk('Vereda con el confort del peatón (Lawson)', cfg.lawson, x => { cfg.lawson = x; }), (() => {
    const i = h('input', { type: 'text', inputmode: 'decimal', value: String(cfg.vientoMedio).replace('.', ','), class: 'n' }) as HTMLInputElement;
    i.addEventListener('change', () => { const v = parseFloat(i.value.replace(',', '.')); if (v > 0 && v < 30) { cfg.vientoMedio = v; actualizarCampo(); actualizarPanel(true); } else i.value = String(cfg.vientoMedio).replace('.', ','); });
    return h('label', { class: 'campo' }, h('span', {}, 'Viento medio anual del lugar a 10 m (m/s, estación meteorológica)'), i);
  })(),
  h('p', { class: 'nota' }, 'El viento A o B es el del selector de arriba. La grilla, las paredes y el giro empiezan la simulación de nuevo; los cortes y los colores, no.'));
  // banda de pisos: todas las celdas en una franja de la torre (más detalle en esos pisos)
  {
    const niv = nivelesProyecto(), H = Math.max(...niv.map(n => n.cota)), b = bandaElegida();
    const cotas = niv.map(n => n.cota).filter(z => z > 0).sort((a, b2) => a - b2);
    d.append(sel('Qué se simula', [['torre', 'la torre entera (con el suelo y el perfil del viento)'], ['banda', 'una banda de pisos (más detalle)']], cfg.banda ? 'banda' : 'torre', x => { cfg.banda = x === 'banda'; }, true));
    if (!cfg.banda) d.append(sel('Dominio', [['normal', 'normal: 1,5 veces la altura de la torre'], ['ajustado', 'ajustado: 1,25 veces (más celdas en la torre)']], cfg.ajustado ? 'ajustado' : 'normal', x => { cfg.ajustado = x === 'ajustado'; }, true),
      h('p', { class: 'nota chica' }, 'Con el dominio ajustado la torre tiene un 20 % más de celdas por metro (si el alto es lo que limita la escala, lo común en torres altas); el techo del túnel queda más cerca de la azotea y el aire que pasa por arriba se acelera un poco más (bloqueo).'));
    if (cfg.banda) {
      const centro = (b.z0 + b.z1) / 2, cerca = cotas.reduce((m, z) => (Math.abs(z - centro) < Math.abs(m - centro) ? z : m), cotas[0] ?? 0);
      d.append(h('div', { class: 'grilla2' },
        sel('Altura de la banda (el medio)', cotas.map(z => [String(z), `${fmt(z, 1)} m${Math.abs(z - (2 / 3) * H) < H / (2 * cotas.length) ? ' (≈ 2/3 de la altura)' : ''}`] as [string, string]), String(cerca), x => { cfg.bandaCota = +x; }, true),
        sel('Alto de la banda', ['1', '2', '3', '5', '8'].map(k => [k, `${k} piso${k === '1' ? '' : 's'}`] as [string, string]), String(cfg.bandaPisos), x => { cfg.bandaPisos = +x; }, true)),
        h('p', { class: 'nota chica' }, `Banda de ${fmt(b.z0, 1)} a ${fmt(b.z1, 1)} m sobre PB, sin suelo: arriba y abajo hay planos deslizantes (el aire no sube ni baja por ellos, como en una rebanada de una torre muy alta) y el viento llega parejo, con la velocidad de esa altura. Todas las celdas de la grilla van a esos pisos: mucho más detalle en la fachada que con la torre entera. No hay fuerzas por piso contra el CIRSOC, dinámica de la torre ni vereda: se mide el arrastre, la fuerza lateral, el Strouhal y el Cp de cada cara de la franja.`));
    }
  }
  {
    const stl = h('button', { type: 'button', class: 'boton' }, '⤓ La torre en STL (piso por piso)');
    stl.addEventListener('click', () => {
      const b = new Blob([stlTorre(nivelesProyecto(), { alturaExacta: cfg.paredes === 'exactas' })], { type: 'model/stl' }), a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = `torre_${(estado.proyecto.nombre || 'proyecto').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '_').replace(/^_|_$/g, '')}.stl`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
    // el caso para OpenFOAM: la misma torre (y los vecinos) con el viento del 102-25, listo para correr en un laboratorio
    const of = h('button', { type: 'button', class: 'boton' }, '⤓ Caso de OpenFOAM (.zip)');
    of.title = 'La torre, los vecinos, la malla, la capa límite del viento y la medición del arrastre, para correr con OpenFOAM (el simulador libre de los laboratorios)';
    of.addEventListener('click', () => { void exportarOpenFOAM().catch(e => { const m = document.getElementById('mensaje'); if (m) m.textContent = `No se pudo armar el caso: ${e instanceof Error ? e.message : String(e)}`; }); });
    const guardar = h('button', { type: 'button', class: 'boton', title: 'Las estadísticas de la fachada, las fuerzas en el tiempo, la vereda y el último campo: se vuelve a abrir sin simular' }, '⤓ Guardar la corrida (.torreviento3d)');
    guardar.addEventListener('click', () => { void guardarCorrida(); });
    const entrada = h('input', { type: 'file', accept: '.torreviento3d', hidden: '' }) as HTMLInputElement;
    entrada.addEventListener('change', () => { const f = entrada.files?.[0]; if (f) void abrirCorrida(f); });
    const abrir = h('button', { type: 'button', class: 'boton' }, 'Abrir una corrida guardada');
    abrir.addEventListener('click', () => entrada.click());
    const lam = h('button', { type: 'button', class: 'boton primario', title: 'Una hoja por bloque: la torre en el túnel, las fuerzas, la fachada, la dinámica y la calle' }, 'Lámina «Estudio de viento» (imprimir o PDF)');
    lam.addEventListener('click', () => { void lamina(); });
    // la banda no tiene lámina ni archivo propio (sus medidas son otras): se guardan las de la torre entera
    if (!cfg.banda) d.append(h('div', { class: 'fila-acciones' }, lam), h('div', { class: 'fila-acciones' }, guardar, abrir, entrada));
    d.append(h('div', { class: 'fila-acciones' }, stl, of), h('p', { class: 'nota chica' }, 'STL: un prisma cerrado por piso con la planta que rige en ese piso (la carpintería o la losa), en metros y con z hacia arriba, para imprimir en 3D o llevar la forma a un programa de CAD. Caso de OpenFOAM: el nivel de laboratorio (RANS k-ε con la capa límite del viento, malla de 0,2 a 1 millón de celdas); el LEAME.txt del .zip explica cómo correrlo.'));
  }
  // «Qué se dibuja»: cada capa se prende y se apaga sin volver a simular
  const uv = seccion('Unidades de la velocidad').cuerpo; c.append(uv.parentElement!);
  uv.append(controlUnidadViento(zRef3d(), () => { if (corrida) corrida.ultimasLineas = 0; actualizarCampo(); armarLlaves3d(); estado.avisarPanel(); }));
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
      ...(cfg.flechas !== 'no' ? [(() => {
        const sd = h('select', { 'aria-label': 'Cantidad de flechas' }) as HTMLSelectElement;
        ([[0.5, 'la mitad'], [1, 'normal (unas 32 a lo ancho)'], [1.5, '1,5 veces'], [2, 'el doble'], [3, 'el triple'], [4, '4 veces'], [6, '6 veces']] as [number, string][]).forEach(([v2, t2]) => sd.append(new Option(t2, String(v2), false, v2 === cfg.densidadFlechas)));
        sd.addEventListener('change', () => { cfg.densidadFlechas = +sd.value; actualizarCampo(); });
        return h('label', { class: 'campo', title: 'Con más flechas el trazo se afina, para que no se empasten y se lea el detalle' }, h('span', {}, 'Cantidad de flechas (vectores)'), sd);
      })()] : []),
      capa('Líneas de corriente', cfg.lineas, x => { cfg.lineas = x; }, (() => {
        const sel = h('select', { 'aria-label': 'Color de las líneas de corriente' }) as HTMLSelectElement;
        sel.append(new Option('color: la velocidad', 'velocidad', false, cfg.colorLineas === 'velocidad'), new Option('de un solo color', 'uno', false, cfg.colorLineas === 'uno'));
        sel.addEventListener('change', () => { cfg.colorLineas = sel.value as 'velocidad' | 'uno'; if (corrida) corrida.ultimasLineas = 0; actualizarCampo(); estado.avisarPanel(); });
        return sel;
      })()),
      capa('Llaves de colores sobre la vista', cfg.llave, x => { cfg.llave = x; }),
      capa('Símbolos del dibujo (qué es cada flecha, línea y marca)', cfg.simbolos, x => { cfg.simbolos = x; }),
      h('p', { class: 'nota chica' }, 'Prender o apagar capas no vuelve a simular.'));
  }
  c.append(seccionVista());
  c.append(seccionTomas());
  const m = seccion('Lo que se mide').cuerpo; c.append(m.parentElement!);
  panelEstado = h('div', {}); m.append(panelEstado);
  const sf = seccion('Fuerzas: base y piso por piso').cuerpo; c.append(sf.parentElement!);
  panelFz = h('div', {}); sf.append(panelFz); ultimoFz = 0;
  const sfa = seccion('Fachada: presiones pico y zonas').cuerpo; c.append(sfa.parentElement!);
  panelFach = h('div', {}); sfa.append(panelFach);
  const sdi = seccion('Dinámica: remolinos, aceleración y deriva').cuerpo; c.append(sdi.parentElement!);
  panelDin = h('div', {}); sdi.append(panelDin);
  const sro = seccion('Varias direcciones: rosa de vientos y envolvente').cuerpo; c.append(sro.parentElement!);
  panelRosa = h('div', {}); sro.append(panelRosa); actualizarRosa(true);
  actualizarPanel(true);
}

/** lo que necesita el barrido de direcciones */
function ctxRosa(): CtxRosa {
  const c = corrida, niv = nivelesProyecto();
  const area = (pol: { x: number; y: number }[]) => Math.abs(pol.reduce((a, q, i) => { const r = pol[(i + 1) % pol.length]; return a + q.x * r.y - r.x * q.y; }, 0)) / 2;
  const mayor = niv.reduce((m, n) => (area(n.silueta) > area(m.silueta) ? n : m), niv[0]);
  return {
    arrancar: giro => { cfg.angulo = giro; estado.avisarPanel(); },
    silueta: mayor?.silueta ?? [], qh: c?.infoFz?.qh ?? NaN, menorDimension: c ? Math.min(c.geo.B, c.geo.L) : 1,
    cotas: niv.map(n => n.cota), claveProyecto: String(estado.revision),
  };
}
let panelRosa: H | null = null;
function actualizarRosa(forzar = false) {
  const el = panelRosa;
  if (!el?.isConnected) return;
  if (!forzar && el.contains(document.activeElement) && ['SELECT', 'INPUT'].includes(document.activeElement?.tagName ?? '')) return;
  if (cfg.banda) { el.replaceChildren(h('p', { class: 'nota' }, 'No aplica a la banda de pisos: hace falta la torre entera (con el suelo y el perfil del viento). Elegí «la torre entera» en «Qué se simula».')); return; }
  seccionRosa(el, ctxRosa(), () => { actualizarRosa(true); if (corrida && corrida.plano?.z !== zEval(corrida.geo)) corrida.plano = new MediaPlano(corrida.geo, zEval(corrida.geo)); actualizarCampo(); armarLlaves3d(); });
}
let ultimoPanel = 0, ultimoFz = 0, panelFz: H | null = null, panelFach: H | null = null, panelDin: H | null = null;
function actualizarDinamica(forzar = false) {
  const el = panelDin, c = corrida;
  if (!el?.isConnected) return;
  if (!forzar && el.contains(document.activeElement) && document.activeElement?.tagName === 'SELECT') return;
  if (!c || !c.gpu) { el.replaceChildren(); return; }
  if (c.geo.banda) { el.replaceChildren(h('p', { class: 'nota' }, 'No aplica a la banda de pisos: hace falta la torre entera (con el suelo y el perfil del viento). Elegí «la torre entera» en «Qué se simula».')); return; }
  seccionDinamica(el, c.fz, c.infoDin, () => actualizarDinamica(true));
}
alCambiarFachada(() => { actualizarCampo(); actualizarFachada(true); });
/** la fachada: no se rehace mientras se está eligiendo algo en ella (se cerraría la lista desplegable) */
function actualizarFachada(forzar = false) {
  const el = panelFach, c = corrida;
  if (!el?.isConnected) return;
  if (!forzar && el.contains(document.activeElement) && document.activeElement !== document.body && document.activeElement?.tagName !== 'BUTTON') return;
  if (!c || !c.gpu) { el.replaceChildren(); return; }
  if (c.geo.banda) { el.replaceChildren(h('p', { class: 'nota' }, 'No aplica a la banda de pisos: hace falta la torre entera (con el suelo y el perfil del viento). Elegí «la torre entera» en «Qué se simula».')); return; }
  if (cfgFachada.unidad === 'kn' && !c.infoFz) cfgFachada.unidad = 'cp';
  seccionFachada(el, c.prom, c.caras, c.geo, { qh: c.infoFz?.qh ?? NaN, pasadas: (c.gpu.pasos * UH) / c.geo.nx, dir: estado.dir, cotas: nivelesProyecto().map(n => n.cota), menorDimension: Math.min(c.geo.B, c.geo.L) });
}
function actualizarFuerzas(forzar = false) {
  const el = panelFz, c = corrida;
  if (!el?.isConnected) return;
  if (!forzar && performance.now() - ultimoFz < 2500) return;
  ultimoFz = performance.now();
  actualizarFachada(); actualizarDinamica(); actualizarRosa();
  if (!c || !c.gpu) { el.replaceChildren(); return; }
  if (c.geo.banda) { el.replaceChildren(h('p', { class: 'nota' }, 'No aplica a la banda de pisos: hace falta la torre entera (con el suelo y el perfil del viento). Elegí «la torre entera» en «Qué se simula».')); return; }
  if (!c.fz || !c.infoFz) { el.replaceChildren(h('p', { class: 'nota' }, 'Faltan los datos del viento del CIRSOC 102-25 (Viento → CIRSOC 102-25) para pasar la simulación a toneladas.')); return; }
  const config = `${TAM[cfg.tam] ? `grilla ${cfg.motor === 'procesador' ? 'del procesador' : cfg.tam}` : ''}, paredes ${cfg.paredes}${cfg.angulo ? `, viento girado ${cfg.angulo}°` : ''}${cfg.contexto && vecinos3d().length ? `, con ${vecinos3d().length} vecinos` : ''}`;
  seccionFuerzas(el, c.fz, { ...c.infoFz, pasadas: (c.gpu.pasos * UH) / c.geo.nx, angulo: cfg.angulo, config });
}
function actualizarPanel(forzar = false) {
  actualizarFuerzas(forzar);
  const el = panelEstado, c = corrida;
  if (!el?.isConnected) return;
  if (!forzar && performance.now() - ultimoPanel < 800) return;
  ultimoPanel = performance.now();
  if (!c || !c.gpu) { el.replaceChildren(h('p', { class: 'nota' }, soporteGpu === null && cfg.motor !== 'procesador' ? 'Sin WebGPU: elegí el procesador como motor.' : 'Arrancando…')); return; }
  const g = c.geo, pasadas = (c.gpu.pasos * UH) / g.nx, reg = cpReglamento(g), cp = c.prom.porCara();
  if (g.banda && c.banda) { el.replaceChildren(...panelBanda(c, pasadas)); return; }
  const nombres: [Cara, string][] = [['barlovento', 'Barlovento'], ['lateral', 'Laterales'], ['sotavento', 'Sotavento'], ['cubierta', 'Cubierta']];
  const tabla = h('table', { class: 'tabla' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Cara'), h('th', {}, 'Cp simulación'), h('th', {}, 'Cp CIRSOC 102-25'))),
    h('tbody', {}, ...nombres.map(([k, t]) => h('tr', {}, h('td', {}, t), h('td', { class: 'n' }, c.prom.muestras ? fmt(cp[k], 2) : '…'), h('td', { class: 'n' }, reg[k] === null ? '—' : fmt(reg[k]!, 2))))));
  // vereda: el mayor factor de viento a 1,5 m
  let vereda = '', lawson: H | null = null;
  if (c.campo) {
    const z = zVereda(g); let max = 0;
    for (let y = 0; y < g.ny; y++) for (let x = 2; x < g.nx - 2; x++) { const cel = (z * g.ny + y) * g.nx + x; if (g.solido[cel]) continue; max = Math.max(max, Math.hypot(c.campo[4 * cel], c.campo[4 * cel + 1], c.campo[4 * cel + 2]) / (c.uIn[z] || UH)); }
    vereda = `En la vereda (${fmt(cfgRosa.alturaEval, 1)} m), donde más sopla el viento va ${txtPct(max)} que en el campo abierto a esa altura (${fmt(max * 100, 0)} %: esquinas y bajada por la cara de barlovento).`;
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

/** lo que se mide en la banda: arrastre, fuerza lateral, Strouhal y Cp de cada cara, con lo de referencia */
function panelBanda(c: Corrida, pasadas: number): H[] {
  const r = c.banda!.resultado(), g = c.geo, b = g.banda!, reg = cpReglamento(g);
  const Bc = g.B * g.escala, hp = (g.H / Math.max(1, cfg.bandaPisos));
  const nombres: [Cara, string][] = [['barlovento', 'Barlovento'], ['lateral', 'Laterales'], ['sotavento', 'Sotavento']];
  const V = vientoDisenoEn(b.z1);
  return [
    h('div', { class: 'kpis' },
      kpi('Tiempo', fmt(pasadas, 1), `pasadas del aire (${c.gpu?.pasos ?? 0} pasos)${c.corriendo ? '' : ' · en pausa'}`),
      kpi('Detalle', `${fmt(Bc, 0)} celdas`, `en el ancho B = ${fmt(g.B, 1)} m (${fmt(g.escala * hp, 0)} por piso de alto)`),
      kpi('Arrastre Cd', r.muestras ? fmt(r.Cd, 2) : '…', r.muestras ? `fluctúa ± ${fmt(r.cdRms, 2)} · por metro de alto: F = Cd · q · B` : 'después de la primera pasada'),
      kpi('Fuerza lateral', r.muestras ? `± ${fmt(r.clRms, 2)}` : '…', 'Cl (desvío): la de los remolinos que se desprenden'),
      kpi('Strouhal St', isFinite(r.St) ? fmt(r.St, 3) : '…', isFinite(r.St) ? `remolinos cada B / (St · V)${V ? `: con ${fmt(V, 0)} m/s, ${fmt(g.B / (r.St * V), 1)} s` : ''}` : 'hacen falta más muestras')),
    h('table', { class: 'tabla' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Cara'), h('th', {}, 'Cp de la banda'), h('th', {}, 'Cp CIRSOC 102-25'))),
      h('tbody', {}, ...nombres.map(([k, t]) => h('tr', {}, h('td', {}, t), h('td', { class: 'n' }, r.muestras && r.cp[k] !== null ? fmt(r.cp[k]!, 2) : '…'), h('td', { class: 'n' }, reg[k] === null ? '—' : fmt(reg[k]!, 2)))))),
    h('p', { class: 'nota' }, `Banda de ${fmt(b.z0, 1)} a ${fmt(b.z1, 1)} m sobre PB. Cp y Cd con la velocidad que llega a la banda (no la de la azotea); ${r.muestras} muestras desde la primera pasada del aire. Como el aire no puede pasar por arriba ni por abajo, la banda se parece a un tramo de una torre infinita: el arrastre sale más alto que en la torre entera (en un prisma cuadrado, Cd ≈ 2,1 contra ≈ 1,3–1,5 de la torre con su punta) y los remolinos son más ordenados. Sirve para ver el detalle de la fachada en esos pisos, no para las fuerzas de toda la torre.`),
  ];
}

/** al cambiar de proyecto o cerrar: suelta la placa */
export function detenerTunel3d() { detener(); }
