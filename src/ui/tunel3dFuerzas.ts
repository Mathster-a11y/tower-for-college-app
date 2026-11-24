/**
 * Túnel 3D → «Fuerzas: base y piso por piso» (etapa 1 de la propuesta de resultados): tarjetas con la media, el desvío
 * y el pico estimado en la base contra el CIRSOC 102-25, la fuerza de cada nivel en altura, la serie de tiempo de la
 * base, la simultaneidad y las descargas (CSV para un programa de análisis estructural y Excel con fórmulas).
 */
import { estado, fmt } from './estado';
import { h, kpi, type H } from './comp';
import { graficoAltura, tablaValores } from './diagramas';
import { descargarCSV } from './csv';
import { FACTOR_PICO, picoEstimado, type Estad, type Fuerzas3D, type MuestraBase } from '../viento/fuerzas3d';

export interface InfoFuerzas {
  dir: 'A' | 'B';
  /** fuerza de cada nivel del CIRSOC 102-25 (t), en el orden de los pisos de la simulación; y la base */
  regl: (number | null)[]; WRegl: number; MRegl: number;
  qh: number; G: number;
  /** pasadas del aire por el túnel (para saber si los picos ya se pueden mostrar) */
  pasadas: number;
  angulo: number;
  config: string;
}
/** con menos pasadas que esto el desvío todavía no se asentó: no se muestran picos */
export const PASADAS_PICOS = 10;

const NS = 'http://www.w3.org/2000/svg';
const sv = (t: string, a: Record<string, string | number> = {}, txt?: string) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v)); if (txt !== undefined) e.textContent = txt; return e; };

/** abiertas o cerradas las tablas desplegables entre una actualización y la otra */
let tablaAbierta = false;

export function seccionFuerzas(cont: HTMLElement, fz: Fuerzas3D | null, info: InfoFuerzas) {
  if (!fz || fz.muestras < 2) {
    cont.replaceChildren(h('p', { class: 'nota' }, 'Las fuerzas se empiezan a medir después de la primera pasada del aire (cuando el flujo ya rodeó la torre).'));
    return;
  }
  const r = fz.resumen(), b = r.base, conPicos = info.pasadas >= PASADAS_PICOS;
  const pico = (e: Estad, u: string, d = 0) => (conPicos ? `pico estimado ${fmt(picoEstimado(e), d)} ${u}` : `picos después de ${PASADAS_PICOS} pasadas`);
  const cociente = info.WRegl > 0 ? b.Vx.media / info.WRegl : NaN;
  const kpis = h('div', { class: 'kpis' },
    kpi('Arrastre en la base', `${fmt(b.Vx.media, 1)} t`, `desvío ${fmt(b.Vx.sigma, 1)} t · ${pico(b.Vx, 't', 1)} · CIRSOC ${fmt(info.WRegl, 1)} t${isFinite(cociente) ? ` (simulación / CIRSOC = ${fmt(cociente, 2)})` : ''}`),
    kpi('Lateral en la base', `${fmt(b.Vy.media, 1)} t`, `oscila: desvío ${fmt(b.Vy.sigma, 1)} t · ${pico(b.Vy, 't', 1)} · el CIRSOC no la calcula para el viento de frente`),
    kpi('Torsor en la base', `${fmt(b.Mz.media, 0)} tm`, `desvío ${fmt(b.Mz.sigma, 0)} tm · ${pico(b.Mz, 'tm')}`),
    kpi('Vuelco por el arrastre', `${fmt(b.Mx.media, 0)} tm`, `${pico(b.Mx, 'tm')} · CIRSOC ${fmt(info.MRegl, 0)} tm`),
  );
  // en altura: la fuerza de cada nivel (simulación y reglamento) y la lateral
  const pts = (f: (i: number) => number | null) => r.pisos.map((p, i) => ({ z: p.z, x: f(i), nivel: p.nombre })).filter((q): q is { z: number; x: number; nivel: string } => q.x !== null && isFinite(q.x));
  const series = [
    { nombre: 'arrastre (media)', color: 'carga' as const, tipo: 'barras' as const, puntos: pts(i => r.pisos[i].Fx.media) },
    { nombre: 'CIRSOC 102-25', color: 'tinta' as const, tipo: 'linea' as const, punteada: true, puntos: pts(i => info.regl[i]) },
    ...(conPicos ? [{ nombre: 'lateral (pico estimado)', color: 'corte' as const, tipo: 'linea' as const, puntos: pts(i => picoEstimado(r.pisos[i].Fy)) }] : []),
  ];
  const ancho = Math.min(460, Math.max(300, (cont.clientWidth || 380) - 10));
  const alt = graficoAltura({ titulo: 'Fuerza de cada nivel', eje: 'F', unidad: 't', decimales: 1, series }, { ancho, alto: 300 });
  const s = r.simultaneidad;
  const simul = h('p', { class: 'nota' }, `Simultaneidad: cuando el arrastre es máximo, la lateral está al ${fmt(s.conVx.Vy * 100, 0)} % de su máximo y el torsor al ${fmt(s.conVx.Mz * 100, 0)} %; cuando la lateral es máxima, el arrastre está al ${fmt(s.conVy.Vx * 100, 0)} %. El CIRSOC 102 combina 100 % y 75 % en sus casos 1 a 4.`);
  const tabla = tablaValores(['Nivel', 'z (m)', 'Fx media (t)', 'Fx desvío', 'Fy media (t)', 'Fy desvío', 'Mz media (tm)', 'CIRSOC (t)'],
    [...r.pisos].reverse().map((p, k) => [p.nombre, p.z, p.Fx.media, p.Fx.sigma, p.Fy.media, p.Fy.sigma, p.Mz.media, info.regl[r.pisos.length - 1 - k] ?? NaN]), [0, 1, 2, 2, 2, 2, 1, 2]);
  if (tablaAbierta) tabla.setAttribute('open', '');
  tabla.addEventListener('toggle', () => { tablaAbierta = tabla.hasAttribute('open'); });
  // descargas
  const csvPisos = h('button', { type: 'button', class: 'mini', title: 'Una fila por nivel: z, Fx, Fy y Mz (media, desvío y pico estimado) y la fuerza del CIRSOC. Se pega en un programa de análisis estructural como cargas por nivel.' }, '⤓ CSV cargas por piso');
  csvPisos.addEventListener('click', () => descargarCSV(`tunel3d_cargas_viento${info.dir}.csv`,
    ['Nivel', 'z (m)', 'Fx media (t)', 'Fx desvío (t)', 'Fx pico est. (t)', 'Fy media (t)', 'Fy desvío (t)', 'Fy pico est. (t)', 'Mz media (tm)', 'Mz desvío (tm)', 'Mz pico est. (tm)', 'W CIRSOC 102 (t)'],
    r.pisos.map((p, i) => [p.nombre, p.z, p.Fx.media, p.Fx.sigma, picoEstimado(p.Fx), p.Fy.media, p.Fy.sigma, picoEstimado(p.Fy), p.Mz.media, p.Mz.sigma, picoEstimado(p.Mz), info.regl[i]]), 3));
  const csvSerie = h('button', { type: 'button', class: 'mini', title: 'Las fuerzas de la base en cada muestra, con el tiempo en segundos reales' }, '⤓ CSV serie de la base');
  csvSerie.addEventListener('click', () => { const t0 = fz.serie[0]?.t ?? 0; descargarCSV(`tunel3d_base_viento${info.dir}.csv`, ['t (s)', 'Vx arrastre (t)', 'Vy lateral (t)', 'Mz torsor (tm)', 'Mx vuelco (tm)', 'My vuelco (tm)'], fz.serie.map(m => [m.t - t0, m.Vx, m.Vy, m.Mz, m.Mx, m.My]), 3); });
  const xlsx = h('button', { type: 'button', class: 'mini', title: 'Hojas «Cargas por piso», «Base» y «Serie», con los picos y las comparaciones como fórmulas y gráficos' }, '⤓ Excel (.xlsx)');
  xlsx.addEventListener('click', () => { void descargarLibro(fz, info).catch(e => { const m = document.getElementById('mensaje'); if (m) m.textContent = `No se pudo armar el Excel: ${e instanceof Error ? e.message : String(e)}`; }); });
  cont.replaceChildren(
    kpis,
    h('figure', { class: 'diagrama' }, alt),
    h('figure', { class: 'diagrama' }, h('figcaption', {}, 'Las fuerzas en la base en el tiempo'), graficoSerie(fz.serie, ancho), h('p', { class: 'nota chica' }, 'El arrastre (naranja) oscila poco alrededor de su media; la lateral (violeta) va de un lado al otro con los remolinos que se desprenden de los costados.')),
    simul, tabla,
    h('div', { class: 'fila-acciones' }, csvPisos, csvSerie, xlsx),
    h('p', { class: 'nota chica' }, `Cómo se calcula: cada celda pegada a la torre da su Cp; la fuerza es Cp · qh · G · área, con qh = ${fmt(info.qh, 0)} N/m² (CIRSOC 102-25 a la altura de la torre) y G = ${fmt(info.G, 2)}, la misma ráfaga del reglamento: lo que cambia es solo la forma. ${r.muestras} muestras en ${fmt(r.tiempo, 0)} s reales. Pico estimado = |media| + ${fmt(FACTOR_PICO, 1)} · desvío. PB: la mitad de abajo del primer piso, que va directo a la base (en el CIRSOC, WPB). x: en el sentido del viento ${info.dir}${info.angulo ? ` (girado ${info.angulo}°: la comparación con el CIRSOC es de referencia)` : ''}. La grilla es gruesa y el Reynolds bajo: la media sirve para comparar formas; el cálculo de la entrega sigue con el CIRSOC.`),
  );
}

/** arrastre y lateral en la base, en el tiempo (las últimas 400 muestras) */
function graficoSerie(serie: MuestraBase[], ancho: number): SVGSVGElement {
  const W = ancho, H = 170, m = { l: 44, r: 10, t: 10, b: 28 };
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'grafico-serie', role: 'img', 'aria-label': 'Arrastre y lateral en la base en el tiempo' }) as SVGSVGElement;
  const s = serie.slice(-400);
  if (s.length < 2) return svg;
  const t0 = s[0].t, t1 = s[s.length - 1].t || t0 + 1;
  const vals = s.flatMap(x => [x.Vx, x.Vy, 0]), lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.08 || 1;
  const X = (t: number) => m.l + ((t - t0) / (t1 - t0 || 1)) * (W - m.l - m.r), Y = (v: number) => H - m.b - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - m.t - m.b);
  svg.append(sv('line', { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), class: 'gs-cero' }));
  svg.append(sv('line', { x1: m.l, x2: m.l, y1: m.t, y2: H - m.b, class: 'gs-eje' }));
  // sin repetir el cero ni escribir «−0»
  const marcas = [lo, 0, hi].filter((v, i, a) => i === 1 || Math.abs(Y(v) - Y(0)) > 12 && a.indexOf(v) === i);
  for (const v of marcas) svg.append(sv('text', { x: m.l - 5, y: Y(v) + 3, 'text-anchor': 'end', class: 'gs-nota' }, fmt(Math.abs(v) < 0.5 ? 0 : v, 0)));
  svg.append(sv('text', { x: m.l, y: H - 8, class: 'gs-nota' }, '0 s'), sv('text', { x: W - m.r, y: H - 8, 'text-anchor': 'end', class: 'gs-nota' }, `${fmt(t1 - t0, 0)} s`), sv('text', { x: (W + m.l) / 2, y: H - 8, 'text-anchor': 'middle', class: 'gs-nota' }, 'tiempo real · t'));
  for (const [k, cls] of [['Vx', 'gs-arrastre'], ['Vy', 'gs-lateral']] as const) svg.append(sv('polyline', { points: s.map(x => `${X(x.t).toFixed(1)},${Y(x[k]).toFixed(1)}`).join(' '), class: cls }));
  return svg;
}

async function descargarLibro(fz: Fuerzas3D, info: InfoFuerzas) {
  const { libroTunel3d } = await import('../xlsx/libros/libroTunel3d');
  const bytes = await libroTunel3d({ proyecto: estado.proyecto.nombre || 'Torre', dir: info.dir, resumen: fz.resumen(), serie: fz.serie, regl: info.regl, qh: info.qh, G: info.G, config: info.config }).xlsx();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `tunel3d_viento${info.dir}.xlsx`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export type { H };
