/**
 * Etapa «Viento», paso «Túnel 2D» (simulador de viento, etapa V2 de docs/plan_viento.html): la planta de la torre a
 * una cota, en un canal, con el método de Lattice Boltzmann. Se ven la estela y los remolinos; se miden el arrastre,
 * la fuerza lateral y el número de Strouhal, y con la n1 de la torre, la velocidad crítica de desprendimiento.
 * Didáctico: no cambia ningún número de ningún método.
 */
import { estado, fmt } from './estado';
import { h, kpi, seccion, type H } from './comp';
import { vientoCirsoc } from './cirsoc102';
import type { Tam } from './diagramas';
import { contornoAlViento, puntosSilueta } from '../engine/silueta';
import { chaflanar, geometria2D, type Geometria2D } from '../viento/geometria2d';
import { medir, velocidadCritica, type Mediciones } from '../viento/mediciones';
import type { CuadroTunel, MensajeTunel } from '../viento/tunel.worker';
import { seccionPruebaGpu } from './pruebaGpu';
import TunelWorker from '../viento/tunel.worker?worker&inline';

type Vista = 'vorticidad' | 'velocidad' | 'presion';
const RE: Record<string, { Re: number; cs: number; texto: string }> = {
  laminar: { Re: 150, cs: 0, texto: 'laminar (Re ≈ 150): remolinos ordenados, la calle de von Kármán' },
  medio: { Re: 1000, cs: 0.16, texto: 'medio (Re ≈ 1 000, con modelo de turbulencia)' },
  alto: { Re: 20000, cs: 0.22, texto: 'alto (Re ≈ 20 000, con más modelo de turbulencia)' },
};
const RES: Record<string, { D: number; texto: string }> = { rapida: { D: 14, texto: 'rápida (14 celdas por ancho)' }, normal: { D: 20, texto: 'normal (20 celdas)' }, fina: { D: 30, texto: 'fina (30 celdas, más lenta)' } };
const U0 = 0.1;

/** lo que eligió el alumno (vive mientras la página está abierta; no se guarda en el proyecto) */
const cfg = {
  nivel: null as string | null, angulo: 0, re: 'medio', res: 'normal', ochava: 0, forma: 'dibujada' as 'dibujada' | 'vivas',
  segunda: 'no' as 'no' | 'detras' | 'lado', distancia: 2, vista: 'vorticidad' as Vista, humo: true,
};

interface Corrida {
  clave: string; geo: Geometria2D; nu: number; cs: number; worker: Worker;
  campo: CuadroTunel | null; pasos: number; Fx: number[]; Fy: number[]; corriendo: boolean; esperando: boolean;
  roto: boolean; med: Mediciones | null; humo: Float32Array; cuadrosSinMirar: number; nivel: string; cota: number;
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
  return JSON.stringify([estado.revision, estado.dir, nivelElegido()?.n.nombre, cfg.angulo, cfg.re, cfg.res, cfg.ochava, cfg.forma, cfg.segunda, cfg.distancia]);
}

function iniciar() {
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
  // ochava: un porcentaje del ancho transversal al viento (se mide antes de ochavar)
  const g0 = geometria2D({ poligonos: [pol], dir: estado.dir, angulo: cfg.angulo, D });
  if (cfg.ochava > 0) pol = chaflanar(pol, (cfg.ochava / 100) * g0.anchoM);
  const geo = geometria2D({ poligonos: [pol], dir: estado.dir, angulo: cfg.angulo, D, largo: 16, alto: 7, entrada: 4, segunda: cfg.segunda === 'no' ? null : { donde: cfg.segunda, distancia: cfg.distancia } });
  const nu = (U0 * geo.D) / re.Re;
  // el worker va adentro del script (también en el archivo único, que se abre con doble clic: ahí no se pueden cargar
  // workers desde el disco)
  const worker = new TunelWorker();
  const humo = new Float32Array(2 * 700);
  for (let k = 0; k < 700; k++) { humo[2 * k] = Math.random() * geo.nx; humo[2 * k + 1] = Math.random() * geo.ny; }
  corrida = { clave: claveCorrida(), geo, nu, cs: re.cs, worker, campo: null, pasos: 0, Fx: [], Fy: [], corriendo: true, esperando: false, roto: false, med: null, humo, cuadrosSinMirar: 0, nivel: ne.n.nombre, cota: ne.n.cota };
  worker.onmessage = (e: MessageEvent<CuadroTunel>) => recibir(e.data);
  worker.postMessage({ tipo: 'iniciar', nx: geo.nx, ny: geo.ny, solido: geo.solido, nu, u0: U0, cs: re.cs } satisfies MensajeTunel);
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
  }
  actualizarMediciones();
}

/** humo: partículas llevadas por el viento (interpolación bilineal), que vuelven a entrar por la izquierda */
function moverHumo(c: Corrida, pasos: number) {
  if (!c.campo || !cfg.humo) return;
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
let imagen: ImageData | null = null, auxiliar: HTMLCanvasElement | null = null, vort: Float32Array | null = null, vortS: Float32Array | null = null;
const css = (v: string, def: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || def;
function rgb(hex: string): [number, number, number] { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim()); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [128, 128, 128]; }

function dibujar() {
  const c = corrida, cv = lienzo;
  if (!c || !cv || !c.campo) return;
  const { nx, ny, solido } = c.geo, { ux, uy, rho } = c.campo;
  if (!imagen || imagen.width !== nx || imagen.height !== ny) { imagen = new ImageData(nx, ny); auxiliar = document.createElement('canvas'); auxiliar.width = nx; auxiliar.height = ny; }
  const px = imagen.data;
  // convención de la app: rojo tracción, azul compresión. La presión que empuja (comprime) va en azul y la succión en
  // rojo; el giro y la velocidad no son tracción ni compresión: van con otros colores (naranja/violeta y verde)
  const fondo = rgb(css('--lienzo', '#ffffff')), comp = rgb(css('--compresion', '#378add')), trac = rgb(css('--traccion', '#e24b4a')), sol = rgb(css('--ink', '#223344'));
  const giroA = rgb(css('--carga', '#d85a30')), giroH = rgb(css('--corte', '#7f77dd')), rapido = rgb(css('--deformada', '#1d9e75'));
  const mezcla = (a: number[], b: number[], t: number, k: number) => { px[k] = a[0] + (b[0] - a[0]) * t; px[k + 1] = a[1] + (b[1] - a[1]) * t; px[k + 2] = a[2] + (b[2] - a[2]) * t; px[k + 3] = 255; };
  if (cfg.vista === 'vorticidad') {
    if (!vort || vort.length !== nx * ny) vort = new Float32Array(nx * ny);
    if (!vortS || vortS.length !== nx * ny) vortS = new Float32Array(nx * ny);
    for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) { const q = y * nx + x; vortS[q] = (uy[q + 1] - uy[q - 1]) * 0.5 - (ux[q + nx] - ux[q - nx]) * 0.5; }
    // promedio de 3 × 3 celdas: saca el ruido de la escala de la grilla, que no es físico
    for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
      const q = y * nx + x;
      vort[q] = (vortS[q - nx - 1] + vortS[q - nx] + vortS[q - nx + 1] + vortS[q - 1] + vortS[q] + vortS[q + 1] + vortS[q + nx - 1] + vortS[q + nx] + vortS[q + nx + 1]) / 9;
    }
  }
  const escV = (3 * U0) / c.geo.D;
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const q = y * nx + x, k = 4 * ((ny - 1 - y) * nx + x);           // y de la red hacia arriba
    if (solido[q]) { mezcla(sol, sol, 0, k); continue; }
    if (cfg.vista === 'vorticidad') { const w = vort![q] / escV; mezcla(fondo, w >= 0 ? giroA : giroH, Math.min(1, Math.abs(w)), k); }
    else if (cfg.vista === 'velocidad') { const s = Math.hypot(ux[q], uy[q]) / U0; mezcla(fondo, rapido, Math.min(1, s / 1.6), k); }
    else { const cp = (rho[q] - 1) / 3 / (0.5 * U0 * U0); mezcla(fondo, cp >= 0 ? comp : trac, Math.min(1, Math.abs(cp) / (cp >= 0 ? 1 : 1.6)), k); }
  }
  auxiliar!.getContext('2d')!.putImageData(imagen, 0, 0);
  const g = cv.getContext('2d')!;
  const s = cv.width / nx;
  g.imageSmoothingEnabled = true;
  g.drawImage(auxiliar!, 0, 0, cv.width, ny * s);
  if (cfg.humo) {
    g.fillStyle = css('--ink2', '#556'); g.globalAlpha = 0.55;
    const hm = c.humo;
    for (let k = 0; k < hm.length; k += 2) g.fillRect(hm[k] * s - 1, (ny - hm[k + 1]) * s - 1, 2, 2);
    g.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------------------------------- centro
export function centroTunel(c: H, tam: Tam) {
  if (!corrida || corrida.clave !== claveCorrida()) iniciar();
  const cr = corrida;
  if (!cr) { c.append(h('p', { class: 'nota' }, 'Hace falta una planta con losa sobre PB para armar el túnel.')); return; }
  const ancho = Math.max(320, (tam.ancho ?? 900) - 10);
  if (!lienzo) { lienzo = document.createElement('canvas'); lienzo.className = 'tunel2d'; }
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
    h('div', { class: 'tunel-marco' }, lienzo),
    h('p', { class: 'nota' }, `Planta de ${cr.nivel} (${fmt(cr.cota, 2)} m) · viento ${estado.dir}${cfg.angulo ? ` girado ${cfg.angulo}°` : ''} de izquierda a derecha · ancho de la torre ${fmt(cr.geo.anchoM, 1)} m = ${cr.geo.D} celdas · canal de ${cr.geo.nx} × ${cr.geo.ny} celdas, periódico arriba y abajo. Reynolds de la simulación ≈ ${fmt(reRed, 0)}; el real, con la V de diseño, ≈ ${(reReal / 1e6).toFixed(0)} millones: en una planta de aristas vivas el aire se despega en las esquinas casi a cualquier Reynolds, por eso la estela y el Strouhal se parecen; en una planta redondeada, no.`),
    h('p', { class: 'llave' }, cfg.vista === 'vorticidad' ? 'Color: giro del aire (naranja antihorario, violeta horario).' : cfg.vista === 'velocidad' ? 'Color: velocidad, de blanco (quieto) a verde (1,6 veces la de entrada).' : 'Color: presión en Cp, azul la que empuja (comprime) y rojo la que succiona (tracciona), como en toda la app.'),
  );
  if (!cr.corriendo && !cr.roto && cr.cuadrosSinMirar > 2) { cr.cuadrosSinMirar = 0; correr(true); }
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
    sel('Planta', [['dibujada', 'como está dibujada'], ['vivas', 'su caja, con esquinas vivas (para comparar)']], cfg.forma, x => { cfg.forma = x; }),
    sel('Ochavas', ['0', '5', '10', '15'].map(v => [v, v === '0' ? 'sin ochavas (esquinas vivas)' : `${v} % del ancho`] as [string, string]), String(cfg.ochava), x => { cfg.ochava = +x; }),
    sel('Otra torre igual', [['no', 'no'], ['detras', 'detrás'], ['lado', 'al lado']], cfg.segunda, x => { cfg.segunda = x; }),
    cfg.segunda !== 'no' ? sel('Separación (anchos)', ['0.5', '1', '2', '3', '4'].map(v => [v, v.replace('.', ',')] as [string, string]), String(cfg.distancia), x => { cfg.distancia = +x; }) : h('span', {}),
    sel('Color', [['vorticidad', 'giro del aire (remolinos)'], ['velocidad', 'velocidad'], ['presion', 'presión (Cp)']], cfg.vista, x => { cfg.vista = x; }),
  ));
  const humo = h('label', { class: 'campo-linea' }, h('input', { type: 'checkbox', ...(cfg.humo ? { checked: '' } : {}) }), ' Humo (partículas que lleva el viento)');
  humo.querySelector('input')!.addEventListener('change', e => { cfg.humo = (e.target as HTMLInputElement).checked; dibujar(); });
  d.append(humo, h('p', { class: 'nota' }, 'El viento A o B es el del selector de arriba. Cambiar el corte, el giro, el Reynolds, la resolución, las ochavas o la otra torre empieza la simulación de nuevo; el color y el humo, no.'));
  const m = seccion('Lo que se mide').cuerpo; c.append(m.parentElement!);
  panelMed = h('div', {});
  m.append(panelMed);
  actualizarMediciones();
  const ca = seccion('Comparar formas de esquina').cuerpo; c.append(ca.parentElement!);
  panelAnot = h('div', {}); ca.append(panelAnot); armarAnotadas();
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
    const forma = `${cfg.forma === 'vivas' ? 'caja, esquinas vivas' : 'dibujada'}${cfg.ochava ? ` + ochavas ${cfg.ochava} %` : ''} · ${c.nivel}${cfg.angulo ? ` · ${cfg.angulo}°` : ''} · Re ${RE[cfg.re].Re}`;
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

let ultimaMed = 0;
function actualizarMediciones() {
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
  );
}

/** para las pruebas y para soltar el worker al cambiar de proyecto */
export function detenerTunel() { corrida?.worker.terminate(); corrida = null; }
