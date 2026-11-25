/**
 * Túnel 3D → «Varias direcciones: rosa de vientos y envolvente» (etapa 5 de la propuesta de resultados).
 *
 * Con la rosa de vientos del lugar (de qué rumbo viene el viento, qué parte del tiempo y con qué velocidad media) y el
 * norte del proyecto, la app simula una dirección por rumbo, una detrás de la otra, y junta:
 *  · el confort de la vereda (o de una terraza, a la altura de evaluación) con todos los rumbos a la vez, con el criterio
 *    elegido (se cambia sin volver a simular) y la ráfaga peligrosa rayada;
 *  · la envolvente de la fachada: en cada celda, el peor empuje y la peor succión de todas las direcciones, contra los
 *    componentes y revestimientos del CIRSOC.
 */
import { estado, fmt } from './estado';
import { h, kpi } from './comp';
import { cfgFachada, dibujarDesplegada, tablaZonas } from './tunel3dFachada';
import type { celdasDeCara, Geometria3D, P, PromedioCp } from '../viento/geometria3d';
import { anchoZonaEsquina, desplegar, G_PICO, zonasDe, type Desplegada } from '../viento/fachada3d';
import { categoriaRosa, CRITERIOS, Envolvente, factorAltura, giroParaRumbo, gradosRumbo, grillaAlrededor, MediaPlano, puntosFachada, rosaPareja, RUMBOS, veredaEnPlanta, type GrillaPlanta, type Rumbo, type SectorRosa } from '../viento/direcciones';
import { datos102De } from '../engine/cargas/cirsoc102';

export const cfgRosa = {
  /** el rumbo al que apunta el eje +y del proyecto (la flecha del norte, al revés) */
  norte: 'N' as Rumbo,
  sectores: rosaPareja(4) as SectorRosa[],
  criterio: 'lddc' as keyof typeof CRITERIOS,
  /** pasadas del aire por dirección, después de la primera (la que acomoda el flujo) */
  pasadas: 6,
  /** altura de evaluación del confort (m sobre el suelo): 1,5 m la vereda; más, una terraza o un balcón */
  alturaEval: 1.5,
};
/** el plano de la red donde se mide el confort */
export const zEval = (g: Geometria3D) => Math.max(1, Math.min(g.nz - 2, Math.round(cfgRosa.alturaEval * g.escala + 0.5)));
/** el factor del campo abierto a la altura de evaluación (sobre 10 m) */
export const factorEval = () => factorAltura(datos102De(estado.proyecto).exposicion, cfgRosa.alturaEval);

export const COLORES_LAWSON: Record<string, string> = { A: '#e8f5e9', B: '#a5d6a7', C: '#ffe082', D: '#ffb74d', E: '#8d6e63' };

interface ResultadoGiro { f: Float32Array; fRaf: Float32Array }
const barrido = {
  activo: false, giros: [] as number[], unicos: [] as number[], idx: 0,
  res: new Map<number, ResultadoGiro>(), env: null as Envolvente | null,
  ref: null as { d: Desplegada; a: number } | null, grilla: null as GrillaPlanta | null, clave: '',
  /** pasadas de la corrida actual (para mostrar el avance) */
  pasadas: 0,
};
/** lo que el túnel le pasa al barrido */
export interface CtxRosa { arrancar: (giro: number) => void; silueta: P[]; qh: number; menorDimension: number; cotas: number[]; claveProyecto: string }

/** el giro de cada rumbo (en el orden de RUMBOS) con el norte elegido y el viento A o B elegido arriba */
const girosRumbos = () => RUMBOS.map(r => Math.round(giroParaRumbo(gradosRumbo(r), gradosRumbo(cfgRosa.norte), estado.dir)) % 360);

export function barridoActivo() { return barrido.activo; }
export function pararBarrido() { barrido.activo = false; }
function empezar(ctx: CtxRosa) {
  barrido.giros = girosRumbos();
  barrido.unicos = [...new Set(barrido.giros.filter((_, d) => cfgRosa.sectores[d].frecuencia > 0))];
  barrido.res = new Map(); barrido.env = null; barrido.ref = null; barrido.idx = 0; barrido.pasadas = 0;
  barrido.grilla = grillaAlrededor(ctx.silueta, 1.5); barrido.clave = ctx.claveProyecto + '|' + estado.dir + '|' + cfgRosa.alturaEval;
  barrido.activo = barrido.unicos.length > 0;
  if (barrido.activo) ctx.arrancar(barrido.unicos[0]);
}

/**
 * En cada muestra de la corrida: si el barrido está andando y la dirección ya juntó sus pasadas, guarda la vereda y la
 * fachada y arranca la siguiente.
 */
export function alMuestrear(c: { geo: Geometria3D; caras: ReturnType<typeof celdasDeCara>; prom: PromedioCp; plano: MediaPlano | null; uIn: Float32Array; pasadas: number; giro: number }, ctx: CtxRosa) {
  if (!barrido.activo) return;
  barrido.pasadas = c.pasadas;
  if (c.pasadas < 0.8 + cfgRosa.pasadas || !c.plano || !barrido.grilla) return;
  if (barrido.unicos[barrido.idx] !== c.giro) return;
  // la vereda en la planta del proyecto
  const z = c.plano.z;
  const v = veredaEnPlanta(c.geo, c.plano, c.uIn[z] || 1, barrido.grilla);
  barrido.res.set(c.giro, { f: v.f, fRaf: v.fRafaga });
  // la fachada: la primera corrida es la referencia
  const pts = puntosFachada(c.geo, c.caras);
  if (!barrido.env) { barrido.env = new Envolvente(pts); barrido.ref = { d: desplegar(c.caras, c.geo), a: anchoZonaEsquina(ctx.menorDimension) }; }
  barrido.env.sumar(pts, k => c.prom.cp(k) + G_PICO * c.prom.rms(k), k => c.prom.cp(k) - G_PICO * c.prom.rms(k), c.giro, Math.max(1.5, 1.6 / c.geo.escala));
  barrido.idx++;
  barrido.pasadas = 0;
  if (barrido.idx < barrido.unicos.length) ctx.arrancar(barrido.unicos[barrido.idx]);
  else { barrido.activo = false; ctx.arrancar(0); }
}

// ------------------------------------------------------------------------------------------------ panel
export function seccionRosa(cont: HTMLElement, ctx: CtxRosa, alCambiar: () => void) {
  const vieja = barrido.clave && !barrido.activo && barrido.clave !== ctx.claveProyecto + '|' + estado.dir + '|' + cfgRosa.alturaEval;
  if (vieja) { barrido.res = new Map(); barrido.env = null; barrido.ref = null; barrido.clave = ''; }
  // rosa de vientos
  const norte = h('select', {}) as HTMLSelectElement;
  RUMBOS.forEach(r => norte.append(new Option(r, r, false, r === cfgRosa.norte)));
  norte.addEventListener('change', () => { cfgRosa.norte = norte.value as Rumbo; alCambiar(); });
  const tabla = h('table', { class: 'tabla rosa-tabla' }, h('thead', {}, h('tr', {}, h('th', {}, 'Viene del'), h('th', {}, '% del tiempo'), h('th', {}, 'Viento medio a 10 m (m/s)'))));
  const cuerpo = h('tbody', {});
  cfgRosa.sectores.forEach((s, d) => {
    const num = (v: number, al: (x: number) => void) => { const i = h('input', { type: 'number', min: '0', step: '0.5', value: String(v), class: 'corto' }) as HTMLInputElement; i.addEventListener('change', () => { const x = parseFloat(i.value.replace(',', '.')); if (x >= 0) { al(x); alCambiar(); } }); return i; };
    cuerpo.append(h('tr', {}, h('td', {}, s.rumbo), h('td', {}, num(s.frecuencia, x => { cfgRosa.sectores[d].frecuencia = x; })), h('td', {}, num(s.media, x => { cfgRosa.sectores[d].media = x; }))));
  });
  tabla.append(cuerpo);
  const total = cfgRosa.sectores.reduce((a, s) => a + s.frecuencia, 0);
  const pareja = h('button', { type: 'button', class: 'mini' }, 'Rosa pareja');
  pareja.addEventListener('click', () => { const m = cfgRosa.sectores.reduce((a, s) => a + s.media, 0) / 8 || 4; cfgRosa.sectores = rosaPareja(m); alCambiar(); });
  const crit = h('select', {}) as HTMLSelectElement;
  (Object.keys(CRITERIOS) as (keyof typeof CRITERIOS)[]).forEach(k => crit.append(new Option(CRITERIOS[k].nombre, k, false, k === cfgRosa.criterio)));
  crit.addEventListener('change', () => { cfgRosa.criterio = crit.value as keyof typeof CRITERIOS; alCambiar(); });
  const alt = h('input', { type: 'number', min: '1', max: '100', step: '0.5', value: String(cfgRosa.alturaEval), class: 'corto' }) as HTMLInputElement;
  alt.addEventListener('change', () => { const v = parseFloat(alt.value.replace(',', '.')); if (v > 0) { cfgRosa.alturaEval = v; alCambiar(); } });
  const pas = h('select', {}) as HTMLSelectElement;
  [4, 6, 10, 15].forEach(n => pas.append(new Option(`${n} pasadas`, String(n), false, n === cfgRosa.pasadas)));
  pas.addEventListener('change', () => { cfgRosa.pasadas = +pas.value; });
  const n = [...new Set(girosRumbos().filter((_, d) => cfgRosa.sectores[d].frecuencia > 0))].length;
  const boton = h('button', { type: 'button', class: barrido.activo ? 'boton' : 'primario' }, barrido.activo ? '■ Parar' : `● Simular las ${n} direcciones`);
  boton.addEventListener('click', () => { if (barrido.activo) { barrido.activo = false; alCambiar(); return; } empezar(ctx); alCambiar(); });
  const avance = barrido.activo ? h('p', { class: 'nota' }, `Dirección ${barrido.idx + 1} de ${barrido.unicos.length} (giro ${barrido.unicos[barrido.idx]}°): ${fmt(Math.max(0, barrido.pasadas - 0.8), 1)} de ${cfgRosa.pasadas} pasadas. Cada dirección empieza de nuevo la simulación.`) : null;
  cont.replaceChildren(
    h('p', { class: 'nota' }, 'Con la rosa de vientos de la estación meteorológica más cercana: de qué rumbo viene el viento, qué parte del tiempo y con qué velocidad media. La app simula una dirección por rumbo y junta todo.'),
    h('div', { class: 'grilla2' },
      h('label', { class: 'campo', title: 'Hacia qué rumbo apunta el eje +y de la planta del proyecto (hacia donde sopla el viento A)' }, h('span', {}, 'El eje +y apunta al'), norte),
      h('label', { class: 'campo' }, h('span', {}, 'Criterio de confort'), crit),
      h('label', { class: 'campo', title: '1,5 m: la vereda; más alto, una terraza o un balcón (sobre el suelo). Cambiarla pide volver a simular' }, h('span', {}, 'Altura de evaluación (m)'), alt),
      h('label', { class: 'campo' }, h('span', {}, 'Por dirección'), pas)),
    tabla,
    h('div', { class: 'fila-acciones' }, pareja, h('span', { class: `nota chica${Math.abs(total - 100) > 0.5 ? ' aviso-linea' : ''}` }, `Suma: ${fmt(total, 1)} %${Math.abs(total - 100) > 0.5 ? ' (tiene que dar 100 %; igual se normaliza)' : ''}`)),
    h('div', { class: 'fila-acciones' }, boton), ...(avance ? [avance] : []),
    ...resultados(ctx));
}

function resultados(ctx: CtxRosa): HTMLElement[] {
  const hechos = RUMBOS.map((_, d) => barrido.res.get(girosRumbos()[d]));
  const sect = cfgRosa.sectores.map((s, d) => ({ s, r: hechos[d] })).filter(x => x.r && x.s.frecuencia > 0);
  if (!sect.length || !barrido.grilla) return [h('p', { class: 'nota chica' }, 'Todavía no hay direcciones simuladas.')];
  const gr = barrido.grilla, cr = CRITERIOS[cfgRosa.criterio], fA = factorEval();
  const sectores = sect.map(x => x.s), cat = new Array<string>(gr.nx * gr.ny), pel = new Uint8Array(gr.nx * gr.ny);
  const cuenta: Record<string, number> = {}; let nVal = 0, nPel = 0;
  for (let k = 0; k < gr.nx * gr.ny; k++) {
    const fs = sect.map(x => x.r!.f[k]), fr = sect.map(x => x.r!.fRaf[k]);
    if (fs.some(v => !isFinite(v))) continue;
    const c = categoriaRosa(fs, fr, sectores, fA, cr);
    cat[k] = c.codigo; pel[k] = c.peligro ? 1 : 0; cuenta[c.codigo] = (cuenta[c.codigo] ?? 0) + 1; nVal++; if (c.peligro) nPel++;
  }
  const mapa = dibujarMapa(gr, cat, pel, ctx.silueta);
  const leyenda = h('div', { class: 'leyenda' }, ...cr.umbrales.map(u => { const sp = h('span', {}), i = h('i', { class: 'caja' }); i.style.background = COLORES_LAWSON[u.codigo]; sp.append(i, `${u.codigo} ${u.texto}${isFinite(u.hasta) ? ` (≤ ${fmt(u.hasta, 1)} m/s)` : ''}: ${nVal ? fmt((100 * (cuenta[u.codigo] ?? 0)) / nVal, 0) : '—'} %`); return sp; }),
    (() => { const sp = h('span', {}), i = h('i', { class: 'caja rayada' }); sp.append(i, `peligroso (más de ${cr.seguridad.u} m/s el ${fmt(cr.seguridad.excedencia * 100, 3)} % del tiempo): ${nVal ? fmt((100 * nPel) / nVal, 1) : '—'} %`); return sp; })());
  const out: HTMLElement[] = [
    h('div', { class: 'kpis' }, kpi('Rumbos simulados', `${sect.length} de ${cfgRosa.sectores.filter(s => s.frecuencia > 0).length}`, `${fmt(sectores.reduce((a, s) => a + s.frecuencia, 0), 0)} % del tiempo`)),
    h('figure', { class: 'diagrama' }, h('figcaption', {}, `Confort a ${fmt(cfgRosa.alturaEval, 1)} m con todos los rumbos (${cr.nombre})`), mapa, leyenda,
      h('p', { class: 'nota chica' }, `Planta del proyecto, con el norte marcado. En cada punto se suma la probabilidad de cada rumbo de superar cada umbral (viento de Rayleigh con la media de ese rumbo, llevada a ${fmt(cfgRosa.alturaEval, 1)} m con el perfil del CIRSOC 102-25, por el factor del lugar que dio la simulación de ese rumbo); la categoría es la del primer umbral que no se supera más del ${fmt(cr.excedencia * 100, 0)} % del tiempo. Rayado: la ráfaga (la «media equivalente» de Lawson: la mayor entre la media y la ráfaga / 1,85, con ráfaga = media + 3 desvíos) pasa de ${cr.seguridad.u} m/s más del ${fmt(cr.seguridad.excedencia * 100, 3)} % del tiempo: no es seguro caminar. El criterio se cambia sin volver a simular.`)),
  ];
  // envolvente de la fachada
  if (barrido.env && barrido.ref) {
    const env = barrido.env, ref = barrido.ref, suc = cfgFachada.est !== 'picoMas';
    const antes = cfgFachada.est; cfgFachada.est = suc ? 'picoMenos' : 'picoMas';
    const lienzo = dibujarDesplegada(ref.d, null, { cotas: ctx.cotas }, ref.a, 420, k => (suc ? env.menos[k] : env.mas[k]));
    cfgFachada.est = antes;
    const zs = zonasDe(k => env.mas[k], k => env.menos[k], ref.d, ref.a, ctx.qh, cfgFachada.area);
    out.push(h('figure', { class: 'diagrama' }, h('figcaption', {}, `Envolvente de la fachada: ${suc ? 'la peor succión' : 'el peor empuje'} de ${env.direcciones} direcciones`), lienzo,
      h('p', { class: 'nota chica' }, `En cada celda, el pico más fuerte de todas las direcciones simuladas (se muestra ${suc ? 'la succión; para ver el empuje elegí «pico de empuje» en la Fachada' : 'el empuje'}). Las caras son las de la primera dirección simulada; en las otras se busca la celda más cercana de la misma altura.`)),
      tablaZonas(zs));
  }
  return out;
}

/** el mapa del confort en la planta: categorías, rayado donde es peligroso, la torre y la flecha del norte */
function dibujarMapa(gr: GrillaPlanta, cat: string[], pel: Uint8Array, silueta: P[]): HTMLCanvasElement {
  const px = Math.max(3, Math.min(8, Math.floor(400 / Math.max(gr.nx, gr.ny)))), W = gr.nx * px, H = gr.ny * px, k = window.devicePixelRatio || 1;
  const cv = document.createElement('canvas'); cv.width = W * k; cv.height = H * k; cv.style.width = `${W}px`; cv.style.height = `${H}px`; cv.className = 'mapa-confort';
  const g = cv.getContext('2d')!; g.scale(k, k);
  g.fillStyle = '#f2f3f4'; g.fillRect(0, 0, W, H);
  const X = (x: number) => ((x - gr.x0) / gr.paso) * px, Y = (y: number) => H - ((y - gr.y0) / gr.paso) * px;
  for (let j = 0; j < gr.ny; j++) for (let i = 0; i < gr.nx; i++) {
    const c = cat[j * gr.nx + i]; if (!c) continue;
    g.fillStyle = COLORES_LAWSON[c]; g.fillRect(i * px, H - (j + 1) * px, px + 0.5, px + 0.5);
    if (pel[j * gr.nx + i]) { g.strokeStyle = '#1d1d24'; g.lineWidth = 1; g.beginPath(); g.moveTo(i * px, H - j * px); g.lineTo((i + 1) * px, H - (j + 1) * px); g.stroke(); }
  }
  // la torre
  g.fillStyle = '#5f6b76'; g.beginPath(); silueta.forEach((q, n) => (n ? g.lineTo(X(q.x), Y(q.y)) : g.moveTo(X(q.x), Y(q.y)))); g.closePath(); g.fill();
  // el norte: +y apunta al rumbo β; el norte está β grados en sentido antihorario desde +y
  const b = (gradosRumbo(cfgRosa.norte) * Math.PI) / 180, ang = Math.PI / 2 + b, cx = W - 30, cy = 32, L = 16;
  const tx = cx + L * Math.cos(ang), ty = cy - L * Math.sin(ang);
  // un círculo blanco detrás: la flecha se lee sobre cualquier color del mapa
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(cx, cy, 2.1 * L, 0, 2 * Math.PI); g.fill();
  g.strokeStyle = '#8a949e'; g.lineWidth = 1; g.stroke();
  g.strokeStyle = '#223344'; g.fillStyle = '#223344'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - (tx - cx), cy - (ty - cy)); g.lineTo(tx, ty); g.stroke();
  g.beginPath(); g.arc(tx, ty, 3, 0, 2 * Math.PI); g.fill();
  g.font = '700 12px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('N', cx + 1.6 * L * Math.cos(ang), cy - 1.6 * L * Math.sin(ang) + 4);
  return cv;
}
