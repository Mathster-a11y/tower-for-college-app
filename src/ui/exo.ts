/**
 * Etapa 08 · Exoesqueleto: ficha y perfiles en el panel; en el centro, el alzado de una cara con el flujo de fuerzas
 * (barras en tracción en azul y en compresión en rojo, el grosor según |N|), los diagramas de M de columnas y vigas,
 * el reparto del viento entre tabiques y exoesqueleto piso por piso y la deformada con y sin exoesqueleto.
 */
import { estado, fmt } from './estado';
import { h, seccion, kpi, chip, colorEstado, type H, type EstadoChip } from './comp';
import { campo } from './paneles';
import { tablaValores, type Tam } from './diagramas';
import { calcularExo, EXO_POR_DEFECTO, TIPOS_EXO, propsSeccion, type ExoDef, type ResultadoExo, type TipoExo } from '../engine/exo';
import { datosAltura, E_DE_DIVISOR, rigidez, rigidezPorNivel } from '../engine/diagramas';
import { plantaDeNivel } from '../engine/silueta';
import type { PlanillaRes } from '../engine/planilla';

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, a: Record<string, string | number> = {}, txt?: string) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v)));
  if (txt !== undefined) e.textContent = txt;
  return e;
};

export interface DatosExo { r: ResultadoExo; def: ExoDef; dir: 'A' | 'B'; ancho: number; tCaras: number[]; niveles: string[]; h: number; Eh: number }

/** el cálculo del exoesqueleto para el viento elegido (null si el proyecto no tiene exo o faltan datos) */
export function datosExo(dir: 'A' | 'B' = estado.dir, def: ExoDef | null | undefined = estado.proyecto.exo): DatosExo | null {
  if (!def) return null;
  try {
    const { asig, res, corr } = estado.calculo, p = estado.proyecto;
    const R: PlanillaRes = estado.fuente === 'guia' ? corr.guia : res;
    const alt = datosAltura(p, R.viento, R.mnyq, asig.filaNivel, dir);
    const iPB = p.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1);
    const zPB = p.niveles[iPB]?.cota ?? 0;
    const sobre = alt.filter(x => x.z > zPB + 1e-6).sort((a, b) => a.z - b.z);
    if (sobre.length < 2) return null;
    const zs = [zPB, ...sobre.map(x => x.z)], W = sobre.map(x => x.F);
    const rg = rigidez(R, p.hormigon || 'H30').find(x => x.dir === dir)!;
    const E = E_DE_DIVISOR((rg.W * rg.h * rg.h) / rg.minimos.h500);
    const Jniv = rigidezPorNivel(p, asig.piezas, dir, rg.J).sort((a, b) => a.z - b.z);
    const EJ = (z: number) => E * ((Jniv.find(q => q.z >= z - 1e-6)?.J ?? rg.J) || rg.J);
    const pl = plantaDeNivel(p, iPB);
    const A = dir === 'A';
    const ancho = (A ? pl.L : pl.B) + 2 * def.separacion, t = (A ? pl.B : pl.L) / 2 + def.separacion;
    const r = calcularExo(def, zs, W, EJ, ancho, [-t, t], E);
    return { r, def, dir, ancho, tCaras: [-t, t], niveles: sobre.map(x => x.nivel), h: zs[zs.length - 1] - zPB, Eh: E };
  } catch { return null; }
}

export function estadoExo(): EstadoChip {
  if (!estado.proyecto.exo) return 'pendiente';
  const ds = (['A', 'B'] as const).map(d => datosExo(d));
  if (ds.some(d => !d)) return 'revisar';
  return ds.every(d => d!.r.controles.every(c => c.estado === 'verifica') && d!.r.u[d!.r.u.length - 1] <= d!.h / 500) ? 'verifica' : 'no verifica';
}

// ------------------------------------------------------------------ panel
export function panelExo(c: H) {
  const p = estado.proyecto, def = p.exo;
  const set = (f: (d: ExoDef) => void) => estado.cambiar(() => { if (p.exo) f(p.exo); });
  const sw = h('label', { class: 'campo-linea' });
  const cb = h('input', { type: 'checkbox' }) as HTMLInputElement; cb.checked = !!def;
  cb.addEventListener('change', () => estado.cambiar(() => { p.exo = cb.checked ? structuredClone(EXO_POR_DEFECTO) : null; }));
  sw.append(cb, ' Agregar un exoesqueleto de acero por fuera de la fachada');
  c.append(h('p', { class: 'nota' }, 'Una estructura de acero por fuera que trabaja junto con los tabiques: las losas las atan y cada una toma el viento según su rigidez, como dos resortes en paralelo.'), sw);
  if (!def) return;
  const d = datosExo();
  if (d) {
    const n = d.r.u.length - 1, lim = d.h / 500;
    const malos = d.r.controles.filter(x => x.estado !== 'verifica').length;
    c.append(h('div', { class: 'kpis' },
      kpi('Flecha azotea', `${fmt(d.r.u[n] * 1000, 1)} mm`, `sin exo ${fmt(d.r.uSin[n] * 1000, 1)} mm · límite ${fmt(lim * 1000, 0)}`, colorEstado(d.r.u[n] <= lim)),
      kpi('Momento que toma el exo', `${fmt(d.r.fraccionExo * 100, 0)} %`, `los tabiques: ${fmt((1 - d.r.fraccionExo) * 100, 0)} %`),
      kpi('J equivalente de cada cara', `${fmt(d.r.caras[0]?.Jeq ?? 0, 1)} m⁴`, 'para la rototraslación'),
      kpi('Barras', `${d.r.controles.length - malos} de ${d.r.controles.length}`, malos ? `${malos} no verifican (tensión o pandeo)` : 'todas verifican', colorEstado(!malos))));
  }
  const fo = h('div', { class: 'formulario' });
  campo(fo, 'Ficha', 'exo-tipo', def.tipo, v => set(x => { x.tipo = v as TipoExo; }), { lista: Object.keys(TIPOS_EXO), ayuda: `${TIPOS_EXO[def.tipo].nombre}: ${TIPOS_EXO[def.tipo].texto}` });
  const nu = (f: (x: ExoDef, v: number) => void) => (v: string) => { const x = parseFloat(v.replace(',', '.')); if (isFinite(x) && x > 0) set(e => f(e, x)); };
  campo(fo, 'Separación', 'exo-sep', def.separacion, nu((x, v) => (x.separacion = v)), { tipo: 'number', unidad: 'm', ayuda: 'distancia de la fachada al eje de las columnas del exo' });
  campo(fo, 'Módulo', 'exo-mod', def.modulo, nu((x, v) => (x.modulo = Math.round(v))), { tipo: 'number', unidad: 'pisos', ayuda: 'alto de cada cruz, marco o diamante' });
  const sec = (nombre: string, k: 'columna' | 'diagonal' | 'viga') => {
    const s = def[k], pr = propsSeccion(s);
    campo(fo, `${nombre}: lado`, `exo-${k}-b`, s.b * 1000, nu((x, v) => (x[k].b = v / 1000)), { tipo: 'number', unidad: 'mm', ayuda: `tubo cuadrado · A = ${fmt(pr.A * 1e4, 0)} cm² · i = ${fmt(pr.i * 100, 1)} cm` });
    campo(fo, `${nombre}: espesor`, `exo-${k}-e`, s.e * 1000, nu((x, v) => (x[k].e = v / 1000)), { tipo: 'number', unidad: 'mm' });
  };
  sec('Columna', 'columna'); sec('Diagonal', 'diagonal'); sec('Viga / cinturón', 'viga');
  c.append(seccion('Ficha y perfiles', fo).el);
  if (d) {
    const peores = [...d.r.controles].sort((a, b) => b.sigma / (def.sigmaAdm) - a.sigma / def.sigmaAdm).slice(0, 12);
    c.append(seccion('Barras más cargadas', tablaValores(['Barra', 'clase', 'N (t)', 'M (tm)', 'σ (kg/cm²)', 'λ', ''],
      peores.map(x => [`${x.cara} · ${x.id}`, x.clase, x.N, x.M, x.sigma / 10, x.lambda, x.estado === 'verifica' ? '✓' : '✗']), [0, 0, 1, 2, 0, 0, 0])).el);
    c.append(h('p', { class: 'nota chica' }, `Acero: E = 2,1·10⁶ kg/cm², σ adm = ${fmt(def.sigmaAdm / 10, 0)} kg/cm². Pandeo: N ≤ π²·E·I / (1,7·L²) y λ = L / i ≤ 200. Los valores con el viento ${d.dir}.`));
  }
}

// ------------------------------------------------------------------ dibujo
export function dibujoExo(d: DatosExo, tam: Tam): SVGSVGElement {
  const W = Math.max(860, Math.min(1300, tam.ancho ?? 1000)), H = 680;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'grafico exo-dibujo', role: 'img', 'aria-label': `Exoesqueleto, viento ${d.dir}` }) as SVGSVGElement;
  svg.append(el('rect', { x: 0, y: 0, width: W, height: H, class: 'ex-fondo' }));
  const r = d.r, cara = r.caras[0], zs = r.zs, z0 = zs[0], zT = zs[zs.length - 1];
  // ---- alzado de la cara (izquierda)
  const x0 = 70, y0 = 70, alto = H - 170, anchoAl = Math.min(W * 0.42, 460);
  const k = Math.min(alto / (zT - z0), (anchoAl - 60) / d.ancho);
  const X = (s: number) => x0 + anchoAl / 2 + s * k, Y = (z: number) => y0 + alto - (z - z0) * k;
  svg.append(el('text', { x: 16, y: 28, class: 'ex-titulo' }, `Cara paralela al viento ${d.dir} · flujo de fuerzas (${TIPOS_EXO[d.def.tipo].nombre})`));
  // fachada de la torre (gris) detrás
  const sTorre = d.ancho / 2 - d.def.separacion;
  svg.append(el('rect', { x: X(-sTorre), y: Y(zT), width: 2 * sTorre * k, height: (zT - z0) * k, class: 'ex-torre' }));
  zs.forEach(z => svg.append(el('line', { x1: X(-sTorre), x2: X(sTorre), y1: Y(z), y2: Y(z), class: 'ex-losa' })));
  const Nmax = Math.max(...cara.esfuerzos.map(e => Math.abs(e.N)), 1e-9), Mmax = Math.max(...cara.esfuerzos.map(e => Math.max(Math.abs(e.Ma), Math.abs(e.Mb))), 1e-9);
  // diagramas de M de columnas y vigas: a un costado de la barra, proporcional
  const kM = 26 / Mmax;
  cara.esfuerzos.filter(e => e.clase !== 'diagonal').forEach(e => {
    const ax = X(e.a.s), ay = Y(e.a.z), bx = X(e.b.s), by = Y(e.b.z), L = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / L, ny = (bx - ax) / L;
    svg.append(el('polygon', { points: `${ax},${ay} ${bx},${by} ${bx + nx * e.Mb * kM},${by + ny * e.Mb * kM} ${ax - nx * e.Ma * kM},${ay - ny * e.Ma * kM}`, class: 'ex-momento' }));
  });
  // barras: color por tracción / compresión, grosor por |N|
  cara.esfuerzos.forEach(e => {
    const w = 1.2 + 6 * Math.abs(e.N) / Nmax;
    const ln = el('line', { x1: X(e.a.s), y1: Y(e.a.z), x2: X(e.b.s), y2: Y(e.b.z), class: `ex-barra ${e.N >= 0 ? 'traccion' : 'compresion'} ${e.clase}`, 'stroke-width': w.toFixed(1) });
    ln.append(el('title', {}, `${e.id} · ${e.clase} · N = ${fmt(e.N, 1)} t (${e.N >= 0 ? 'tracción' : 'compresión'}) · M = ${fmt(Math.max(Math.abs(e.Ma), Math.abs(e.Mb)), 1)} tm · L = ${fmt(e.L)} m`));
    svg.append(ln);
  });
  // base: empotramientos y reacciones verticales
  cara.reacciones.forEach(q => {
    const x = X(q.s), y = Y(z0);
    svg.append(el('path', { d: `M${x - 10},${y + 1} h20 l-10,-9 z`, class: 'ex-apoyo' }));
    svg.append(el('text', { x, y: y + 24, class: `ex-valor ${q.V >= 0 ? 'compresion' : 'traccion'}`, 'text-anchor': 'middle' }, `${q.V >= 0 ? '↑' : '↓'} ${fmt(Math.abs(q.V), 0)} t`));
  });
  // viento de cada piso que va al exo (flechas a la izquierda, sobre la losa)
  const Fm = Math.max(...r.Fexo.map(Math.abs), ...r.Ftab.map(Math.abs), 1e-9);
  r.Fexo.forEach((f, i) => {
    const y = Y(zs[i + 1]), L = (Math.abs(f) / Fm) * 38, xi = X(-d.ancho / 2) - 6;
    if (L < 1) return;
    svg.append(el('line', { x1: f >= 0 ? xi - L : xi, y1: y, x2: f >= 0 ? xi : xi - L, y2: y, class: 'ex-viento', 'marker-end': 'url(#ex-pv)' }));
  });
  const defs = el('defs'); const mk = el('marker', { id: 'ex-pv', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' });
  mk.append(el('path', { d: 'M0,1 L10,5 L0,9 z', class: 'ex-viento-punta' })); defs.append(mk); svg.prepend(defs);
  svg.append(el('text', { x: X(-d.ancho / 2) - 50, y: Y(zT) - 10, class: 'ex-nota', 'text-anchor': 'middle' }, 'viento que toma el exo'));
  // leyenda
  const ly = H - 44;
  [['traccion', 'tracción'], ['compresion', 'compresión'], ['momento', 'diagrama de M (columnas y vigas)']].forEach(([c, t], i) => {
    const x = 16 + i * 120;
    svg.append(c === 'momento' ? el('rect', { x, y: ly - 7, width: 16, height: 9, class: 'ex-momento' }) : el('line', { x1: x, y1: ly - 3, x2: x + 18, y2: ly - 3, class: `ex-barra ${c}`, 'stroke-width': 4 }));
    svg.append(el('text', { x: x + 24, y: ly + 1, class: 'ex-nota' }, t));
  });
  svg.append(el('text', { x: 16, y: H - 20, class: 'ex-nota' }, `Grosor ∝ |N| (máx. ${fmt(Nmax, 0)} t). Ancho de la cara ${fmt(d.ancho)} m, módulo ${d.def.modulo} pisos. Reacciones de la base en t.`));
  // ---- gráficos a la derecha: reparto del viento y deformada
  const gx = x0 + anchoAl + 60, gw = (W - gx - 40) / 2 - 24;
  const graf = (xg: number, titulo: string, series: { v: number[]; clase: string; nombre: string }[], unidad: string, barras = false) => {
    titulo.split('\n').forEach((t, i) => svg.append(el('text', { x: xg, y: 48 + i * 15, class: 'ex-subtitulo' }, t)));
    const vmax = Math.max(...series.flatMap(s => s.v.map(Math.abs)), 1e-9), vmin = Math.min(0, ...series.flatMap(s => s.v));
    const Xg = (v: number) => xg + ((v - vmin) / (vmax - vmin || 1)) * gw;
    svg.append(el('line', { x1: Xg(0), x2: Xg(0), y1: Y(z0), y2: Y(zT), class: 'ex-eje' }));
    svg.append(el('line', { x1: xg, x2: xg + gw, y1: Y(z0), y2: Y(z0), class: 'ex-eje' }));
    series.forEach((s, si) => {
      if (barras) s.v.forEach((v, i) => svg.append(el('rect', { x: Math.min(Xg(0), Xg(v)), y: Y(zs[i + 1]) - 3 + si * 3, width: Math.abs(Xg(v) - Xg(0)), height: 3, class: `ex-serie ${s.clase}` })));
      else svg.append(el('polyline', { points: [[0, z0], ...s.v.map((v, i) => [v, zs[i + 1]])].map(([v, z]) => `${Xg(v).toFixed(1)},${Y(z).toFixed(1)}`).join(' '), class: `ex-linea ${s.clase}` }));
      svg.append(el('rect', { x: xg, y: Y(z0) + 30 + si * 16, width: 12, height: 6, class: `ex-serie ${s.clase}` }));
      svg.append(el('text', { x: xg + 16, y: Y(z0) + 36 + si * 16, class: 'ex-nota' }, s.nombre));
    });
    svg.append(el('text', { x: xg + gw, y: Y(z0) + 16, class: 'ex-nota', 'text-anchor': 'end' }, `${fmt(vmax, unidad === 'mm' ? 1 : 1)} ${unidad}`));
  };
  graf(gx, 'Viento de cada piso:\nquién lo toma', [{ v: r.Ftab, clase: 'tab', nombre: 'tabiques' }, { v: r.Fexo, clase: 'exo', nombre: 'exoesqueleto' }], 't', true);
  graf(gx + gw + 48, 'Corrimiento\nde cada piso', [{ v: r.uSin.map(x => x * 1000), clase: 'sin', nombre: 'sin exo' }, { v: r.u.map(x => x * 1000), clase: 'con', nombre: 'con exo' }], 'mm');
  const lim = (d.h / 500) * 1000, xs0 = gx + gw + 48, vmx = Math.max(...r.uSin.map(x => x * 1000), lim);
  const xl = xs0 + (lim / vmx) * gw;
  svg.append(el('line', { x1: xl, x2: xl, y1: Y(z0), y2: Y(zT), class: 'ex-limite' }));
  svg.append(el('text', { x: xl - 3, y: Y(zT) + 14, class: 'ex-nota', 'text-anchor': 'end' }, `h/500 = ${fmt(lim, 0)} mm`));
  return svg;
}

export function centroExo(c: H, tam: Tam) {
  if (!estado.proyecto.exo) {
    c.append(h('div', { class: 'tarjeta-vacia' }, h('h3', {}, 'Sin exoesqueleto'), h('p', { class: 'nota' }, 'Tildá «Agregar un exoesqueleto» en el panel de la izquierda para ver cómo cambia la torre: la flecha, el reparto del viento y los esfuerzos de cada barra.'),
      h('div', { class: 'fila-acciones' }, ...(['D', 'B', 'C', 'A'] as TipoExo[]).map(t => { const b = h('button', { type: 'button' }, `${t} · ${TIPOS_EXO[t].nombre}`); b.addEventListener('click', () => estado.cambiar(() => { estado.proyecto.exo = { ...structuredClone(EXO_POR_DEFECTO), tipo: t }; })); return b; }))));
    return;
  }
  const d = datosExo();
  if (!d) { c.append(h('p', { class: 'error' }, 'No se pudo calcular el exoesqueleto con estos datos (¿faltan niveles sobre PB?).')); return; }
  c.append(h('p', { class: 'nota' }, `${TIPOS_EXO[d.def.tipo].nombre}: ${TIPOS_EXO[d.def.tipo].texto} Tocá una barra para ver su N, su M y su largo.`));
  c.append(dibujoExo(d, tam));
  const n = d.r.u.length;
  c.append(seccion('Piso por piso', tablaValores(['Nivel', 'viento (t)', 'tabiques (t)', 'exo (t)', 'M tabiques (tm)', 'M sin exo (tm)', 'δ con exo (mm)', 'δ sin exo (mm)'],
    d.niveles.map((nv, i) => [nv, d.r.Ftab[i] + d.r.Fexo[i], d.r.Ftab[i], d.r.Fexo[i], d.r.Mtab[i + 1] ?? 0, d.r.Msin[i + 1] ?? 0, d.r.u[i] * 1000, d.r.uSin[i] * 1000]).reverse(), [0, 2, 2, 2, 0, 0, 1, 1])).el);
  void n; void chip;
}
