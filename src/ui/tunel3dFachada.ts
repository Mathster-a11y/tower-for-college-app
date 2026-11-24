/**
 * Túnel 3D → «Fachada: presiones pico y zonas» (etapa 2 de la propuesta de resultados). Qué se mira en las caras de la
 * torre (Cp medio, desvío, pico de empuje o de succión; en Cp o en kN/m²; en bandas o continuo), la fachada desplegada
 * (las cuatro caras una al lado de la otra, con los pisos y las zonas de esquina) y la tabla por zona contra los
 * componentes y revestimientos del CIRSOC 102.
 *
 * Colores de la app: el aire que empuja la cara la comprime (azul), el que la succiona la tracciona (rojo); el desvío
 * (cuánto tiembla la presión) no es ni una cosa ni la otra: blanco a violeta.
 */
import { fmt } from './estado';
import { h, type H } from './comp';
import { descargarCSV } from './csv';
import { llaveHtml, type Llave } from './llaveColor';
import type { celdasDeCara, Geometria3D, PromedioCp } from '../viento/geometria3d';
import { anchoZonaEsquina, bandas, desplegar, G_PICO, GCPI_CERRADO, NOMBRE_ESTADISTICA, valorCelda, zonasFachada, type Desplegada, type Estadistica, type FilaZona } from '../viento/fachada3d';

export const cfgFachada = { est: 'media' as Estadistica, unidad: 'cp' as 'cp' | 'kn', enBandas: true, area: 4.5 };
let alCambiar: () => void = () => undefined;
/** lo que hay que rehacer cuando se elige otra cosa (la torre se vuelve a pintar) */
export function alCambiarFachada(f: () => void) { alCambiar = f; }

const css = (v: string, d: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || d;
const hex = (s: string): [number, number, number] => { const m = s.replace('#', ''); const n = parseInt(m.length === 3 ? m.split('').map(x => x + x).join('') : m, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mezcla = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const BLANCO: [number, number, number] = [255, 255, 255], VIOLETA: [number, number, number] = [43, 29, 85];

/** escala fija de cada estadística en Cp (fija: dos corridas se comparan con los mismos colores) */
export function rangoCp(est: Estadistica): [number, number] {
  return est === 'rms' ? [0, 0.6] : est === 'media' ? [-1.5, 1] : [-3.5, 2];
}
/** el valor que se muestra en la unidad elegida (los kN/m² son Cp · qh, sin la presión interior: el mapa es exterior) */
export const enUnidad = (cp: number, qh: number) => (cfgFachada.unidad === 'kn' ? (cp * qh) / 1000 : cp);
/** el escalón de bandas en Cp */
function pasoBanda(est: Estadistica): number { const [a, b] = rangoCp(est), bs = bandas(a, b); return bs.length > 1 ? bs[1] - bs[0] : (b - a) / 8; }

/** color de un Cp (r, g, b de 0 a 255) para la estadística elegida */
export function colorCp(cp: number, est: Estadistica = cfgFachada.est): [number, number, number] {
  if (!isFinite(cp)) return [207, 212, 217];
  let v = cp;
  if (cfgFachada.enBandas) { const p = pasoBanda(est); v = (Math.floor(v / p) + 0.5) * p; if (Math.abs(cp) < 1e-12) v = 0; }
  const [lo, hi] = rangoCp(est);
  if (est === 'rms') return mezcla(BLANCO, VIOLETA, Math.max(0, Math.min(1, v / hi)));
  return v >= 0 ? mezcla(BLANCO, hex(css('--compresion', '#378add')), Math.min(1, v / hi)) : mezcla(BLANCO, hex(css('--traccion', '#e24b4a')), Math.min(1, v / lo));
}
/** la llave de las caras de la torre (y de la fachada desplegada) */
export function llaveFachada(qh: number): Llave {
  const est = cfgFachada.est, [lo, hi] = rangoCp(est), n = 8, u = cfgFachada.unidad === 'kn' ? ' kN/m²' : '';
  const colores = Array.from({ length: n + 1 }, (_, i) => { const c = colorCp(lo + ((hi - lo) * i) / n, est); return `rgb(${c.map(Math.round).join(',')})`; });
  const f = (cp: number) => fmt(enUnidad(cp, qh), cfgFachada.unidad === 'kn' ? 1 : 1);
  const titulo = `Caras de la torre: ${NOMBRE_ESTADISTICA[est]}${cfgFachada.unidad === 'kn' ? ' (kN/m²)' : ''}`;
  if (est === 'rms') return { titulo, colores, marcas: [[0, `0${u}: quieta`], [1, `≥ ${f(hi)}${u}: tiembla`]] };
  return { titulo, colores, marcas: [[0, `≤ ${f(lo)} succiona`], [-lo / (hi - lo), '0'], [1, `+${f(hi)} empuja`]] };
}
/** el valor de un trozo de la torre (una o más celdas): el peor para los picos, el promedio para lo demás */
export function valorTrozo(p: PromedioCp, ks: number[]): number {
  const vs = ks.map(k => valorCelda(p, k, cfgFachada.est)).filter(isFinite);
  if (!vs.length) return NaN;
  return cfgFachada.est === 'picoMenos' ? Math.min(...vs) : cfgFachada.est === 'picoMas' ? Math.max(...vs) : vs.reduce((a, b) => a + b, 0) / vs.length;
}

export interface InfoFachada { qh: number; pasadas: number; dir: 'A' | 'B'; cotas: number[]; menorDimension: number }

let cacheDesplegada: { caras: unknown; d: Desplegada } | null = null;
export function seccionFachada(cont: HTMLElement, p: PromedioCp, caras: ReturnType<typeof celdasDeCara>, g: Geometria3D, info: InfoFachada) {
  if (!p.muestras) { cont.replaceChildren(h('p', { class: 'nota' }, 'Las presiones se empiezan a medir después de la primera pasada del aire.')); return; }
  if (!cacheDesplegada || cacheDesplegada.caras !== caras) cacheDesplegada = { caras, d: desplegar(caras, g) };
  const d = cacheDesplegada.d, a = anchoZonaEsquina(info.menorDimension);
  // qué se mira
  const est = h('select', { 'aria-label': 'Qué se muestra en las caras' }) as HTMLSelectElement;
  (Object.keys(NOMBRE_ESTADISTICA) as Estadistica[]).forEach(k => est.append(new Option(NOMBRE_ESTADISTICA[k], k, false, k === cfgFachada.est)));
  est.addEventListener('change', () => { cfgFachada.est = est.value as Estadistica; alCambiar(); });
  const uni = h('select', { 'aria-label': 'Unidad' }) as HTMLSelectElement;
  uni.append(new Option('Cp (sin unidad)', 'cp', false, cfgFachada.unidad === 'cp'), new Option('kN/m²', 'kn', false, cfgFachada.unidad === 'kn'));
  uni.addEventListener('change', () => { cfgFachada.unidad = uni.value as 'cp' | 'kn'; alCambiar(); });
  const bnd = h('input', { type: 'checkbox', ...(cfgFachada.enBandas ? { checked: '' } : {}) }) as HTMLInputElement;
  bnd.addEventListener('change', () => { cfgFachada.enBandas = bnd.checked; alCambiar(); });
  const area = h('input', { type: 'number', min: '0.5', step: '0.5', value: String(cfgFachada.area), class: 'corto' }) as HTMLInputElement;
  area.addEventListener('change', () => { const v = parseFloat(area.value.replace(',', '.')); if (v > 0) { cfgFachada.area = v; alCambiar(); } });
  const controles = h('div', { class: 'formulario' },
    h('label', { class: 'campo' }, h('span', {}, 'Mostrar'), est),
    h('label', { class: 'campo' }, h('span', {}, 'Unidad'), uni),
    h('label', { class: 'campo-linea' }, bnd, ' En bandas (escalones con valores redondos)'),
    h('label', { class: 'campo', title: 'El área que toma un elemento de la fachada (un vidrio, un panel): con áreas chicas el reglamento pide picos más fuertes' }, h('span', {}, 'Área del elemento'), h('span', { class: 'fila-rango' }, area, ' m²')));
  const conPicos = info.pasadas >= 10;
  const avisoPicos = cfgFachada.est !== 'media' && !conPicos ? [h('p', { class: 'aviso-linea' }, `Llevás ${fmt(info.pasadas, 1)} pasadas del aire: el desvío y los picos todavía cambian. Esperá a 10 o más.`)] : [];
  // fachada desplegada
  const lienzo = dibujarDesplegada(d, p, info, a, Math.max(300, Math.min(520, (cont.clientWidth || 380) - 4)));
  const ll = llaveHtml(llaveFachada(info.qh)); ll.classList.add('en-flujo');
  // por zona
  const zs = zonasFachada(p, d, a, info.qh, cfgFachada.area);
  const tabla = tablaZonas(zs);
  const csv = h('button', { type: 'button', class: 'mini', title: 'Cada celda de las caras verticales: cara, posición a lo largo de la cara, altura, Cp medio, desvío, picos y presión de diseño' }, '⤓ CSV de la fachada');
  csv.addEventListener('click', () => descargarCSV(`tunel3d_fachada_viento${info.dir}.csv`,
    ['Cara', 's (m)', 'z (m)', 'zona', 'Cp medio', 'Cp desvío', 'Cp mín.', 'Cp máx.', 'Cp pico +', 'Cp pico −', 'p empuje (kN/m²)', 'p succión (kN/m²)'],
    d.paneles.flatMap(pn => pn.celdas.map(q => {
      const m = p.cp(q.k), r = p.rms(q.k), pm = m + G_PICO * r, pn2 = m - G_PICO * r;
      return [pn.nombre, (q.s + 0.5) / g.escala, (q.z + 0.5) / g.escala, q.dEsquina < a ? 5 : 4, m, r, p.cpMin(q.k), p.cpMax(q.k), pm, pn2, (info.qh / 1000) * (pm + GCPI_CERRADO), (info.qh / 1000) * (pn2 - GCPI_CERRADO)];
    })), 3));
  ultimasZonas = { zonas: zs, area: cfgFachada.area, a, qh: info.qh };
  cont.replaceChildren(controles, ...avisoPicos,
    h('figure', { class: 'diagrama' }, h('figcaption', {}, 'La fachada desplegada: las cuatro caras una al lado de la otra'), lienzo, ll,
      h('p', { class: 'nota chica' }, `Mirando la torre desde afuera, recorrida en sentido antihorario desde la cara que recibe el viento ${info.dir}. Las rayas finas son los pisos; las punteadas, el ancho de la zona de esquina (a = ${fmt(a, 2)} m, el 10 % del lado menor). Cada cuadrito es una celda de la simulación (${fmt(1 / g.escala, 2)} m).${a * g.escala < 1 ? ' Con esta grilla la zona de esquina es más angosta que una celda: queda en la primera columna de cada borde y su pico se mezcla con el del centro. Con una grilla más fina (Fidelidad) se separan mejor.' : ''}`)),
    tabla,
    h('div', { class: 'fila-acciones' }, csv),
    h('p', { class: 'nota chica' }, `Pico = Cp medio ± ${fmt(G_PICO, 1)} · desvío (la simulación dura minutos y la ráfaga de diseño es de 50 años: se extrapola con el desvío). Presión de diseño del revestimiento = qh · (Cp pico ± ${fmt(GCPI_CERRADO, 2)}), con qh = ${fmt(info.qh / 1000, 2)} kN/m² (CIRSOC 102-25 a la altura de la torre) y la presión interior de un edificio cerrado. El CIRSOC: componentes y revestimientos de edificios de más de 18 m, con el área del elemento. La grilla es gruesa: los picos de las esquinas son los menos precisos; sirven para ver dónde están y comparar formas.`));
}
/** lo último que se calculó por zona, para el Excel */
export let ultimasZonas: { zonas: FilaZona[]; area: number; a: number; qh: number } | null = null;

function tablaZonas(zs: FilaZona[]): H {
  const f = (v: number, d = 2) => (isFinite(v) ? fmt(v, d) : '—');
  const fila = (z: FilaZona) => {
    const peorS = z.pMenos < z.pMenosRegl, peorE = z.pMas > z.pMasRegl;
    return h('tr', {}, h('td', {}, z.nombre),
      h('td', { class: `n${peorE ? ' marca' : ''}` }, f(z.pMas)), h('td', { class: 'n' }, f(z.pMasRegl)),
      h('td', { class: `n${peorS ? ' marca' : ''}` }, f(z.pMenos)), h('td', { class: 'n' }, f(z.pMenosRegl)));
  };
  return h('div', {},
    h('table', { class: 'tabla' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Zona'), h('th', {}, 'Empuje sim.'), h('th', {}, 'Empuje CIRSOC'), h('th', {}, 'Succión sim.'), h('th', {}, 'Succión CIRSOC'))),
      h('tbody', {}, ...zs.map(fila))),
    h('p', { class: 'nota chica' }, `Presión neta de diseño en kN/m² (positiva: empuja la fachada hacia adentro; negativa: la succiona hacia afuera). En negrita, donde la simulación da más que el reglamento: ahí conviene reforzar el anclaje o el vidrio. Área del elemento: ${fmt(cfgFachada.area, 1)} m².`));
}

/** la fachada desplegada en un lienzo: cada celda con su color, los pisos y las zonas de esquina */
function dibujarDesplegada(d: Desplegada, p: PromedioCp, info: InfoFachada, a: number, ancho: number): HTMLCanvasElement {
  const arriba = 16, abajo = 4, izq = 4;
  const px = Math.max(2, Math.min(14, Math.floor((ancho - izq * 2) / Math.max(1, d.ancho)), Math.floor(320 / Math.max(1, d.alto))));
  const W = Math.max(ancho, d.ancho * px + izq * 2), H = d.alto * px + arriba + abajo, k = window.devicePixelRatio || 1;
  const cv = document.createElement('canvas'); cv.width = W * k; cv.height = H * k; cv.style.width = `${W}px`; cv.style.height = `${H}px`; cv.className = 'fachada-desplegada';
  const g = cv.getContext('2d')!; g.scale(k, k);
  const tinta = css('--ink', '#223344'), dim = css('--dim', '#8a94a0');
  const X = (s: number) => izq + s * px, Y = (z: number) => arriba + (d.alto - z) * px;
  g.font = '600 10px system-ui, sans-serif'; g.textBaseline = 'alphabetic';
  for (const pn of d.paneles) {
    // las celdas que caen en el mismo lugar (entrantes de la planta): la de valor más extremo
    const lugar = new Map<string, number>();
    for (const q of pn.celdas) {
      const v = valorCelda(p, q.k, cfgFachada.est), key = `${q.s},${q.z}`, w = lugar.get(key);
      if (w === undefined || Math.abs(v) > Math.abs(w)) lugar.set(key, v);
    }
    lugar.forEach((v, key) => { const [s, z] = key.split(',').map(Number); const c = colorCp(v); g.fillStyle = `rgb(${c.map(Math.round).join(',')})`; g.fillRect(X(pn.s0 + s), Y(z + 1), px + 0.5, px + 0.5); });
    // borde del panel, zona de esquina y nombre
    g.strokeStyle = tinta; g.lineWidth = 1; g.strokeRect(X(pn.s0), Y(d.alto), pn.ancho * px, d.alto * px);
    const aC = a * d.escala;
    if (2 * aC < pn.ancho) { g.save(); g.setLineDash([3, 3]); g.strokeStyle = tinta; g.globalAlpha = 0.7; for (const s of [aC, pn.ancho - aC]) { g.beginPath(); g.moveTo(X(pn.s0 + s), Y(0)); g.lineTo(X(pn.s0 + s), Y(d.alto)); g.stroke(); } g.restore(); }
    g.fillStyle = tinta; g.textAlign = 'center'; g.fillText(pn.nombre, X(pn.s0 + pn.ancho / 2), arriba - 4);
  }
  // pisos
  g.strokeStyle = dim; g.globalAlpha = 0.5; g.lineWidth = 0.6;
  for (const z of info.cotas) { const zc = z * d.escala; if (zc <= 0 || zc >= d.alto) continue; for (const pn of d.paneles) { g.beginPath(); g.moveTo(X(pn.s0), Y(zc)); g.lineTo(X(pn.s0 + pn.ancho), Y(zc)); g.stroke(); } }
  g.globalAlpha = 1;
  return cv;
}
