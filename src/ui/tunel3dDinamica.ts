/**
 * Túnel 3D → «Dinámica: remolinos, aceleración y deriva» (etapa 4 de la propuesta de resultados). Del espectro de la
 * fuerza lateral de la base salen el Strouhal y la velocidad crítica; con la frecuencia propia de la torre (CIRSOC
 * 102-25), su masa y el amortiguamiento, la aceleración en la azotea en mili-g para el viento de 5 y 10 años; y con las
 * fuerzas de cada nivel, la deriva entre pisos. Colores: la fuerza lateral con --corte, la torre (frecuencia propia,
 * aceleración, deriva) con --deformada; nada en rojo y azul (no son tracción ni compresión).
 */
import { fmt } from './estado';
import { h, kpi, colorEstado } from './comp';
import { graficoAltura } from './diagramas';
import type { Fuerzas3D } from '../viento/fuerzas3d';
import { aceleracion, derivas, espectro, frecuenciaPico, masaGeneralizada, peorAceleracion, remuestrear, type Espectro } from '../viento/dinamica3d';

export const cfgDin = { zeta: 0.02, uso: 'viviendas' as 'viviendas' | 'oficinas' };
/** referencia del código de Canadá (NBCC, comentario): aceleración pico con el viento de 10 años */
const LIMITE_MG = { viviendas: 15, oficinas: 25 } as const;

export interface InfoDinamica {
  dir: 'A' | 'B';
  /** ancho de la torre de costado al viento (m), altura (m), viento de diseño en la azotea y a 2/3 de la altura (m/s) */
  B: number; H: number; VH: number; V23: number;
  /** frecuencia propia (Hz) en el sentido del viento y de costado (CIRSOC 102-25) */
  n1Viento: number; n1Costado: number;
  /** de dónde sale n₁ de costado y las otras estimaciones del CIRSOC (1.9-4 y la de la guía 2005), para comparar */
  metodoN1: string; n1Otros: number; n1Guia: number;
  /** masa de cada nivel (t) y su altura sobre PB (m) */
  masas: { z: number; m: number }[];
  /** viento de 5 y 10 años sobre el de diseño (velocidades) */
  f5: number; f10: number;
  /** deriva: fuerza de cada nivel del CIRSOC (t, con PB en z = 0), relación del viento de servicio, EJ(z) (t·m²) y límite h / limD */
  regl: { z: number; F: number }[]; servicio: number; EJ: (z: number) => number; limD: number;
  /** con el exoesqueleto en el cálculo: el corrimiento de la torre con el exo (tabiques y exo) para unas fuerzas por
   *  nivel. Sin él, la deriva sale de la ménsula de los tabiques solos (con un diagrid que toma el viento daría
   *  derivas absurdas) */
  corrimientos?: (F: { z: number; F: number }[]) => { z: number; d: number }[] | null;
}

/** la deriva de cada piso (corrimiento relativo / altura del piso) a partir del corrimiento de cada nivel */
function derivasDe(c: { z: number; d: number }[]): { z: number; d: number; deriva: number }[] {
  const o = [...c].sort((a, b) => a.z - b.z);
  return o.map((q, i) => ({ ...q, deriva: i > 0 && q.z - o[i - 1].z > 1e-9 ? Math.abs(q.d - o[i - 1].d) / (q.z - o[i - 1].z) : 0 }));
}
/** el nombre corto de un nivel para el eje: «39° (comedores)» → «39°» */
const nivelCorto = (n: string) => n.replace(/\s*\(.*\)\s*$/, '').trim() || n;

export function seccionDinamica(cont: HTMLElement, fz: Fuerzas3D | null, info: InfoDinamica | null, alCambiar: () => void) {
  if (!fz || !info || fz.serie.length < 40) {
    cont.replaceChildren(h('p', { class: 'nota' }, `Hace falta una serie más larga de las fuerzas de la base (${fz?.serie.length ?? 0} de 40 muestras como mínimo) para ver con qué ritmo oscilan.`));
    return;
  }
  const s = fz.serie, dts = s.slice(1).map((q, i) => q.t - s[i].t).sort((a, b) => a - b), dt = dts[Math.floor(dts.length / 2)];
  const t = s.map(q => q.t), T = t[t.length - 1] - t[0];
  const eY = espectro(remuestrear(t, s.map(q => q.My / info.H), dt), dt), eX = espectro(remuestrear(t, s.map(q => q.Mx / info.H), dt), dt);
  if (!eY || !eX) { cont.replaceChildren(h('p', { class: 'nota' }, 'Todavía no alcanza la serie para el espectro.')); return; }
  // los remolinos de un edificio tienen un Strouhal entre 0,05 y 0,3: el pico se busca ahí (afuera es ruido de la grilla)
  const fLo = Math.max(2 * eY.df, (0.05 * info.VH) / info.B), fHi = (0.3 * info.VH) / info.B;
  const fs = fHi > fLo ? frecuenciaPico(eY, fLo, fHi) : NaN, St = (fs * info.B) / info.VH;
  const ciclos = fs * T, fNyq = 1 / (2 * dt);
  const Vcr = isFinite(St) && St > 0 ? (info.n1Costado * info.B) / St : NaN, margen = Vcr / info.V23;
  const M = masaGeneralizada(info.masas, info.H);
  const lat10 = aceleracion(eY, info.n1Costado, M, cfgDin.zeta, info.f10), lat5 = aceleracion(eY, info.n1Costado, M, cfgDin.zeta, info.f5);
  const vie10 = aceleracion(eX, info.n1Viento, M, cfgDin.zeta, info.f10);
  // con vientos de hasta 10 años (la resonancia con los remolinos puede aparecer con vientos más flojos)
  const barrido = peorAceleracion(eY, info.n1Costado, M, cfgDin.zeta, info.f10);
  const lim = LIMITE_MG[cfgDin.uso], peor10 = Math.max(barrido.pico, lat10.pico, vie10.pico);
  const fueraRango = info.n1Costado / info.f10 > fNyq;
  const pocos = ciclos < 8;
  // deriva entre pisos con el viento de servicio: CIRSOC y simulación (arrastre medio de cada nivel)
  const r = fz.resumen();
  // los pisos de la simulación ya empiezan en PB (z = 0)
  const sim = r.pisos.map(p => ({ z: p.z, F: p.Fx.media * info.servicio }));
  const reg = info.regl.map(q => ({ ...q, F: q.F * info.servicio }));
  const conExo = (F: { z: number; F: number }[]) => { const c = info.corrimientos?.(F); return c ? derivasDe(c) : null; };
  const dSim = (conExo(sim) ?? derivas(sim, info.EJ)).slice(1), dReg = (conExo(reg) ?? derivas(reg, info.EJ)).slice(1);
  const nombreEn = (z: number) => nivelCorto(r.pisos.reduce((m, p) => (Math.abs(p.z - z) < Math.abs(m.z - z) ? p : m), r.pisos[0])?.nombre ?? '');
  const peorD = (d: typeof dSim) => Math.max(...d.map(x => x.deriva)), hSobre = (x: number) => (x > 0 ? `h/${fmt(1 / x, 0)}` : '—');
  // controles
  const z = h('select', {}) as HTMLSelectElement;
  ([[0.01, '1 % (acero, estructura liviana)'], [0.02, '2 % (hormigón, lo habitual)'], [0.03, '3 % (hormigón con mucha tabiquería)']] as const).forEach(([v, tx]) => z.append(new Option(tx, String(v), false, v === cfgDin.zeta)));
  z.addEventListener('change', () => { cfgDin.zeta = +z.value; alCambiar(); });
  const u = h('select', {}) as HTMLSelectElement;
  u.append(new Option(`viviendas (≈ ${LIMITE_MG.viviendas} mili-g)`, 'viviendas', false, cfgDin.uso === 'viviendas'), new Option(`oficinas (≈ ${LIMITE_MG.oficinas} mili-g)`, 'oficinas', false, cfgDin.uso === 'oficinas'));
  u.addEventListener('change', () => { cfgDin.uso = u.value as 'viviendas' | 'oficinas'; alCambiar(); });
  cont.replaceChildren(
    h('div', { class: 'grilla2' }, h('label', { class: 'campo' }, h('span', {}, 'Amortiguamiento'), z), h('label', { class: 'campo' }, h('span', {}, 'Uso de la torre'), u)),
    ...(!isFinite(fs) ? [h('p', { class: 'aviso-linea' }, 'La serie todavía es corta para distinguir el ritmo de los remolinos. Dejá correr la simulación.')] : []),
    ...(pocos && isFinite(fs) ? [h('p', { class: 'aviso-linea' }, `Van ${fmt(ciclos, 1)} oscilaciones de los remolinos: con menos de 8 el espectro y la aceleración cambian mucho. Dejá correr la simulación.`)] : []),
    h('div', { class: 'kpis' },
      kpi('Strouhal', isFinite(St) ? fmt(St, 3) : '—', `${isFinite(fs) ? `remolinos cada ${fmt(1 / fs, 1)} s (${fmt(fs, 2)} Hz)` : 'todavía sin pico claro'} con el viento de diseño · un prisma cuadrado da ≈ 0,12`),
      kpi('Velocidad crítica', isFinite(Vcr) ? `${fmt(Vcr * 3.6, 0)} km/h` : '—', `n₁ = ${fmt(info.n1Costado, 2)} Hz de costado · diseño a 2/3 h: ${fmt(info.V23 * 3.6, 0)} km/h${isFinite(margen) ? ` (${margen > 1.3 ? 'lejos: no entra en resonancia' : margen > 1 ? 'cerca: revisar' : 'la supera: resonancia posible'})` : ''}`, colorEstado(isFinite(margen) ? (margen > 1.3 ? true : margen > 1 ? null : false) : null)),
      kpi('Aceleración en la azotea', `${fmt(peor10, 1)} mili-g`, `la peor con vientos de hasta 10 años${barrido.pico >= Math.max(lat10.pico, vie10.pico) - 1e-9 ? `: de costado, con ${fmt(barrido.f * info.VH * 3.6, 0)} km/h en la azotea` : ''} · con el de 10 años: de costado ${fmt(lat10.pico, 1)}, en el sentido del viento ${fmt(vie10.pico, 1)} · 5 años: ${fmt(lat5.pico, 1)} · referencia ${cfgDin.uso}: ${lim} mili-g`, colorEstado(fueraRango ? null : peor10 <= lim)),
      kpi('Deriva entre pisos', hSobre(peorD(dSim)), `con el viento de servicio, la peor · CIRSOC ${hSobre(peorD(dReg))} · límite h/${info.limD}`, colorEstado(peorD(dSim) <= 1 / info.limD && peorD(dReg) <= 1 / info.limD))),
    ...(info.metodoN1.includes('1.9-5') && info.n1Guia > 2 * info.n1Costado ? [h('p', { class: 'aviso-linea' }, `La frecuencia de costado (${fmt(info.n1Costado, 2)} Hz) sale de la fórmula 1.9-5 de tabiques, que con tabiques esbeltos da valores bajos: con la 1.9-4 sería ${fmt(info.n1Otros, 2)} Hz y con la de la guía 2005, ${fmt(info.n1Guia, 2)} Hz. La velocidad crítica y la aceleración cambian mucho con ella: elegí el método en Viento → CIRSOC 102-25 o usá la del análisis modal (método FEM).`)] : []),
    ...(fueraRango ? [h('p', { class: 'aviso-linea' }, `El muestreo de la simulación no llega a la frecuencia de la torre (${fmt(info.n1Costado, 2)} Hz): la aceleración queda sin dato confiable. Con la placa de video y una grilla más fina se muestrea más seguido.`)] : []),
    h('figure', { class: 'diagrama' }, h('figcaption', {}, 'Con qué ritmo empuja el viento de costado (espectro de la fuerza lateral)'), graficoEspectro(eY, fs, info.n1Costado / info.f10, Math.max(320, Math.min(460, (cont.clientWidth || 380) - 10))),
      h('p', { class: 'nota chica' }, 'Cada barra es cuánta energía tiene la fuerza lateral en esa frecuencia. El pico violeta son los remolinos que se desprenden de un costado y del otro. La raya verde es la frecuencia de la torre llevada al viento de 10 años: si cae cerca del pico, la torre se mece al ritmo de los remolinos.')),
    h('figure', { class: 'diagrama' }, graficoAltura({ titulo: `Deriva entre pisos con el viento de servicio${info.corrimientos ? ' (torre con el exoesqueleto)' : ''}`, eje: 'corrimiento entre pisos por metro de altura', unidad: 'mm/m', decimales: 2,
      series: [{ nombre: 'con las fuerzas de la simulación', color: 'deformada', tipo: 'linea', puntos: dSim.map(x => ({ z: x.z, x: x.deriva * 1000, nivel: nombreEn(x.z) })) },
        { nombre: 'con las del CIRSOC 102-25', color: 'tinta', tipo: 'linea', punteada: true, puntos: dReg.map(x => ({ z: x.z, x: x.deriva * 1000, nivel: nombreEn(x.z) })) }],
      referencias: [{ x: 1000 / info.limD, texto: `límite h/${info.limD}` }] }, { ancho: Math.max(300, Math.min(460, (cont.clientWidth || 380) - 10)), alto: 300 }),
      h('p', { class: 'nota chica' }, `Cuántos milímetros se corre cada piso respecto del de abajo por cada metro de altura de piso (1 mm/m = h/1000). La raya vertical es el límite h/${info.limD} = ${fmt(1000 / info.limD, 2)} mm/m: las curvas tienen que quedar a su izquierda.`)),
    h('p', { class: 'nota chica' }, `Cómo se calcula. Strouhal: St = f · B / V con B = ${fmt(info.B, 1)} m y V = ${fmt(info.VH * 3.6, 0)} km/h en la azotea. Velocidad crítica: V = n₁ · B / St. Aceleración: la torre como un péndulo en su primer modo (φ = z/h); fuerza generalizada F* = M base / h; σa = (g / M*) · √(π · n₁ · S(n₁) / 4ζ), con M* = ${fmt(M, 0)} t (0,7 t/m² por planta) y ζ = ${fmt(cfgDin.zeta * 100, 0)} %; pico = ${fmt(lat10.g, 2)} · σa. Para otro viento la fuerza escala con V² y las frecuencias con V. Viento de 10 años = ${fmt(info.f10, 2)} del de diseño y de 5 años = ${fmt(info.f5, 2)} (CIRSOC 102-25, servicio). La ISO 10137 pide el de 1 año, más bajo que el de 5: con 5 años queda del lado seguro. La referencia de ${LIMITE_MG.viviendas} mili-g (viviendas) y ${LIMITE_MG.oficinas} (oficinas) es del comentario del código de Canadá (10 años). Ojo: el viento que entra a la simulación es parejo (sin la turbulencia del viento real), así que la aceleración en el sentido del viento queda corta; la de costado, que la dan los remolinos, es la que la simulación ve bien. Deriva: ${info.corrimientos ? 'la torre con el exoesqueleto (tabiques y exo juntos, como en la etapa 08)' : 'la ménsula de la etapa Rigidez (J de cada nivel)'} con las fuerzas por el viento de servicio (${fmt(info.servicio, 2)} del de diseño).`));
}

/** el espectro: barras, el pico de los remolinos y la frecuencia de la torre */
function graficoEspectro(e: Espectro, fs: number, n1: number, ancho: number): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg', sv = (t: string, a: Record<string, string | number>, txt?: string) => { const x = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) x.setAttribute(k, String(v)); if (txt !== undefined) x.textContent = txt; return x; };
  const W = ancho, H = 200, m = { l: 14, r: 10, t: 24, b: 30 };
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'grafico-espectro', role: 'img', 'aria-label': 'Espectro de la fuerza lateral' }) as SVGSVGElement;
  const fMax = Math.min(e.f[e.f.length - 1], Math.max(3 * (isFinite(fs) ? fs : 0), 1.5 * n1, 4 * e.df));
  const idx = e.f.map((_, i) => i).filter(i => i > 0 && e.f[i] <= fMax), sMax = Math.max(...idx.map(i => e.S[i]), 1e-12);
  const X = (f: number) => m.l + (f / fMax) * (W - m.l - m.r), Y = (v: number) => H - m.b - (v / sMax) * (H - m.t - m.b);
  const bw = Math.max(1, ((W - m.l - m.r) * e.df) / fMax - 1);
  idx.forEach(i => svg.append(sv('rect', { x: X(e.f[i]) - bw / 2, y: Y(e.S[i]), width: bw, height: H - m.b - Y(e.S[i]), class: 'ge-barra' })));
  svg.append(sv('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'ge-eje' }));
  for (let k = 0; k <= 4; k++) { const f = (fMax * k) / 4; svg.append(sv('text', { x: X(f), y: H - m.b + 13, 'text-anchor': 'middle', class: 'ge-nota' }, fmt(f, 2))); }
  svg.append(sv('text', { x: (W + m.l) / 2, y: H - 3, 'text-anchor': 'middle', class: 'ge-nota' }, 'frecuencia (Hz, tiempo real)'));
  if (isFinite(fs) && fs <= fMax) svg.append(sv('text', { x: Math.max(60, Math.min(W - 60, X(fs))), y: 12, 'text-anchor': 'middle', class: 'ge-pico' }, `remolinos ${fmt(fs, 2)} Hz`));
  if (n1 <= fMax) { svg.append(sv('line', { x1: X(n1), x2: X(n1), y1: m.t, y2: H - m.b, class: 'ge-torre' })); svg.append(sv('text', { x: Math.min(W - 40, X(n1) + 4), y: m.t + 12, class: 'ge-torre-t' }, 'torre')); }
  return svg;
}
