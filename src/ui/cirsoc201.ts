/**
 * Etapa «Flexión» con el método CIRSOC: verificación de cada pieza en PB según CIRSOC 201-2005 (simple o completa),
 * con todas las combinaciones del 101-25 y los cuatro casos de carga del viento. El centro dibuja el diagrama de
 * interacción del muro elegido con las solicitaciones de cada combinación.
 */
import { estado, fmt } from './estado';
import { formula, h, kpi, n, op, r, seccion, v, type H } from './comp';
import { tablaValores, type Tam } from './diagramas';
import { datos201De, recubrimientoMm, type DatosCirsoc201, type VerifPieza201 } from '../engine/metodos/cirsoc';
import { fcDe, N_POR_T, type VerifMuro201 } from '../engine/verificacion/cirsoc201';

const NS = 'http://www.w3.org/2000/svg';
const cambiar201 = (x: Partial<DatosCirsoc201>) => estado.cambiar(p => { p.cirsoc201 = { ...(p.cirsoc201 ?? {}), ...x }; });
const piezasDir = (): VerifPieza201[] => (estado.calculo.cirsoc?.verif ?? []).filter(x => x.dir === estado.dir);
let muroElegido: string | null = null;

function elegir<T extends string>(rotulo: string, opciones: [T, string][], actual: T, alCambiar: (x: T) => void, ayuda?: string): H {
  const s = h('select', {}) as HTMLSelectElement;
  opciones.forEach(([val, txt]) => s.append(new Option(txt, val, false, val === actual)));
  s.addEventListener('change', () => alCambiar(s.value as T));
  return h('label', { class: 'campo' }, h('span', {}, rotulo), s, ...(ayuda ? [h('small', {}, ayuda)] : []));
}
const pc = (x: number) => `${fmt(x * 100, 2)} %`;

export function panelFlexCirsoc(c: H) {
  const p = estado.proyecto, d = datos201De(p), cfg = estado.config;
  const vs = piezasDir();
  c.append(h('p', { class: 'nota' }, `Verificación por resistencia del CIRSOC 201-2005 (${cfg.verificacion}), en PB, muro por muro como la guía: almas a flexocompresión con su parte del momento, alas con la fuerza del par. Cargas mayoradas: combinaciones del 101-25 con el viento del 102-25 (1,0 W) en sus cuatro casos de carga.`));
  const dat = seccion('Hormigón y armadura (CIRSOC 201)').cuerpo; c.append(dat.parentElement!);
  dat.append(h('div', { class: 'grilla2' },
    elegir('Recubrimiento (Tabla 7.7.1)', [['interior', 'tabique interior · 20 mm'], ['exterior', 'al aire libre o contra el suelo · 30 mm']], d.recubrimiento, x => cambiar201({ recubrimiento: x })),
    elegir('Clase de exposición (Tabla 2.1)', [['A1-A2', 'A1 o A2 · sin aumento'], ['A3-Q1-C1', 'A3, Q1 o C1 · +30 %'], ['marina-agresiva', 'costa (CL, M) o agresiva · +50 %']], d.exposicion, x => cambiar201({ exposicion: x })),
    elegir('Límite de deriva de servicio', [['400', 'h/400'], ['500', 'h/500 (como la guía)'], ['600', 'h/600']], String(d.limiteDeriva) as '400' | '500' | '600', x => cambiar201({ limiteDeriva: +x as 400 | 500 | 600 })),
  ), h('p', { class: 'nota' }, `Recubrimiento ${recubrimientoMm(d)} mm · f'c = ${fcDe(p.hormigon || 'H30')} MPa (${p.hormigon || 'H30'}) · acero ADN 420.`));
  if (!vs.length) { c.append(h('p', { class: 'nota' }, 'No hay piezas en este viento.')); return; }
  const ok = vs.filter(x => x.verifica).length;
  c.append(h('div', { class: 'kpis' },
    kpi('Piezas que verifican', `${ok} / ${vs.length}`, cfg.verificacion === 'completa' ? 'con la armadura necesaria' : 'compresión y cordones', ok === vs.length ? 'var(--ok)' : 'var(--revisar)'),
    kpi('Peor cuantía vertical', pc(Math.max(...vs.flatMap(x => x.muros.map(m => m.rhoNecesaria)))), 'ρ máxima 4 %'),
  ));
  const t = tablaValores(['Pieza', 'Muro', 'Papel', 'ρ mín', 'ρ necesaria', 'Armado', 'Corte Vu/φVn'],
    vs.flatMap(x => x.muros.map(m => [x.nombre, m.id, m.papel, pc(m.rhoMin), pc(m.rhoNecesaria), m.armado, m.papel === 'alma' ? fmt(m.corte.Vu / m.corte.phiVn, 2) : '—'])));
  t.setAttribute('open', '');
  c.append(t);
  // cuentas del muro elegido
  const todos = vs.flatMap(x => x.muros.map(m => ({ pz: x, m })));
  const sel = todos.find(x => x.m.id === muroElegido) ?? todos[0];
  muroElegido = sel.m.id;
  const s = h('select', {}) as HTMLSelectElement;
  todos.forEach(x => s.append(new Option(`${x.pz.nombre} · ${x.m.id} (${x.m.papel})`, x.m.id, false, x.m.id === sel.m.id)));
  s.addEventListener('change', () => { muroElegido = s.value; estado.avisarPanel(); });
  const cu = seccion(`Cuentas de ${sel.m.id}`).cuerpo; c.append(cu.parentElement!);
  cu.append(h('label', { class: 'campo' }, h('span', {}, 'Muro'), s));
  cuentas(cu, sel.m, sel.pz);
}

function cuentas(cu: H, m: VerifMuro201, pz: VerifPieza201) {
  const fc = fcDe(estado.proyecto.hormigon || 'H30');
  cu.append(
    formula('Parte del viento que toma la pieza (casos 1 a 4)', pz.partes.map((x, i) => `caso ${i + 1}: ${n(x * 100, 1)} %`).join(' · '), 'rototraslación de la guía; casos 2 y 4 con e ± 0,15 B (Fig. 2.4-8 del 102-25)'),
    formula('Peor combinación', `${v('N', 'u')}${op('=')}${r(m.peor.Nu, 1, 't')} · ${v('M', 'u')}${op('=')}${r(m.peor.Mu, 1, 'tm')}`, m.peor.combinacion),
    formula('Cuantía vertical', `${v('ρ', 'mín')}${op('=')}${n(m.rhoMin * 100, 2)} %${op('→')}${v('ρ', 'nec')}${op('=')}${r(m.rhoNecesaria * 100, 2, '%')}`, m.rhoMin === 0.0012 ? '14.3.2: 0,0012 (Ø ≤ 16, fy = 420)' : '11.10.9.4: Vu > φVc/2 → ρ ≥ 0,0025'),
    formula('Momento resistente con la mínima', `${v('φ')}${v('M', 'n')}${op('=')}${r(m.phiMn, 1, 'tm')}${op(m.relacion <= 1 ? '≥' : '<')}${v('M', 'u')}`, `diagrama de interacción: εcu = 0,003, 0,85 f'c en β1·c, φ de 0,65 a 0,90 (9.3.2)`),
  );
  if (m.papel === 'alma') cu.append(formula('Corte en el plano (11.10)', `${v('V', 'u')}${op('=')}${n(m.corte.Vu, 1)} t${op(m.corte.verifica ? '≤' : '>')}${v('φ')}${v('V', 'n')}${op('=')}0,75 · (${n(m.corte.Vc, 1)} + ${n(m.corte.Vs, 1)})${op('=')}${r(m.corte.phiVn, 1, 't')}`,
    `d = 0,8 lw = ${fmt(m.corte.d, 2)} m · Vc el menor de (11-29) y (11-30) · Vs con ρ horizontal ${pc(m.rhoH)} · límite 5/6 √f'c h d = ${fmt(m.corte.VnMax, 1)} t`, m.corte.verifica ? 'verifica' : 'no verifica'));
  cu.append(
    formula('Simple: compresión con el método empírico (14.5)', `${v('φ')}${v('P', 'n')}${op('=')}0,55 · 0,65 · ${n(fc, 0)} · ${v('A', 'g')} · [1 − (0,8·${v('l', 'c')} / 32${v('h')})²]${op('=')}${r(m.axialEmp, 0, 't')}${op(m.NuMax <= m.axialEmp ? '≥' : '<')}${n(m.NuMax, 0)} t`, 'k = 0,8 (arriostrado arriba y abajo, con rotación restringida); lc = altura del piso de PB'),
    formula('Simple: cordones de borde', `${v('T')}${op('=')}${v('M', 'u')}/${v('z')} − ${v('N', 'u')}/2${op('=')}${r(Math.max(0, m.cordon.T), 1, 't')}${op('→')}${v('A', 's')}${op('=')}${v('T')}/(0,9·${v('f', 'y')})${op('=')}${r(m.cordon.AsBorde, 1, 'cm²')}`, `z = 0,85 lw; cordones de 0,15 lw; C = ${fmt(m.cordon.C, 0)} t ≤ ${fmt(m.cordon.Cadm, 0)} t. Modelo de cordones, no es un artículo: se compara con la completa`),
  );
}

export function centroFlexCirsoc(c: H, tam: Tam) {
  const vs = piezasDir();
  const todos = vs.flatMap(x => x.muros.map(m => ({ pz: x, m })));
  const sel = todos.find(x => x.m.id === muroElegido) ?? todos[0];
  if (!sel) { c.append(h('p', { class: 'nota' }, 'No hay piezas en este viento.')); return; }
  c.append(h('figure', { class: 'diagrama' }, h('figcaption', {}, `${sel.pz.nombre} · ${sel.m.id} (${sel.m.papel}): diagrama de interacción con ρ = ${pc(sel.m.rhoNecesaria)} y las combinaciones`), dibujoNM(sel.m, Math.min(tam.ancho ?? 640, 760), 460)));
  c.append(h('p', { class: 'nota' }, 'Cada punto es una combinación de carga (caso de viento y sentido). Adentro de la curva, verifica. La curva es la de la cuantía necesaria; con la mínima se achica.'));
}

/** diagrama N–M: φMn en x (tm), φPn en y (t); la curva espejada para el viento al revés */
function dibujoNM(m: VerifMuro201, W: number, H_: number): SVGSVGElement {
  const pts = m.diagrama.puntos.map(q => ({ x: q.phiMn / N_POR_T / 1000, y: q.phiPn / N_POR_T }));
  const curva = [...pts, ...pts.slice().reverse().map(q => ({ x: -q.x, y: q.y }))];
  const sol = m.solicitaciones.map(q => ({ x: q.Mu, y: q.Nu, peor: q === m.peor }));
  const xs = curva.map(q => Math.abs(q.x)).concat(sol.map(q => Math.abs(q.x))), ys = curva.map(q => q.y).concat(sol.map(q => q.y));
  const xm = Math.max(1, ...xs) * 1.1, y0 = Math.min(0, ...ys) * 1.1, y1 = Math.max(1, ...ys) * 1.05;
  const X = (x: number) => 50 + ((x + xm) / (2 * xm)) * (W - 70), Y = (y: number) => 20 + ((y1 - y) / (y1 - y0)) * (H_ - 50);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H_}`); svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H_)); svg.setAttribute('role', 'img');
  const el = (tag: string, a: Record<string, string | number>, txt?: string) => { const e = document.createElementNS(NS, tag); Object.entries(a).forEach(([k, val]) => e.setAttribute(k, String(val))); if (txt !== undefined) e.textContent = txt; svg.append(e); return e; };
  el('line', { x1: X(-xm), y1: Y(0), x2: X(xm), y2: Y(0), stroke: 'var(--ink-3, #999)' });
  el('line', { x1: X(0), y1: Y(y0), x2: X(0), y2: Y(y1), stroke: 'var(--ink-3, #999)' });
  el('polygon', { points: curva.map(q => `${X(q.x)},${Y(q.y)}`).join(' '), fill: 'var(--ok, #1a7a3a)', 'fill-opacity': 0.12, stroke: 'var(--ok, #1a7a3a)', 'stroke-width': 2 });
  el('text', { x: X(xm) - 4, y: Y(0) - 6, 'text-anchor': 'end', 'font-size': 12, fill: 'currentColor' }, 'φMn (tm)');
  el('text', { x: X(0) + 6, y: Y(y1) + 12, 'font-size': 12, fill: 'currentColor' }, 'φPn (t)');
  el('text', { x: X(xm * 0.35), y: Y(m.diagrama.phiPnMax / N_POR_T) - 6, 'font-size': 11, fill: 'currentColor' }, `φPn,máx = ${fmt(m.diagrama.phiPnMax / N_POR_T, 0)} t`);
  // cada solicitación (combinación · caso de viento · sentido); la peor, más grande y con su nombre
  sol.forEach(q => el('circle', { cx: X(q.x), cy: Y(q.y), r: q.peor ? 6 : 3.5, fill: q.peor ? 'var(--mal, #c62828)' : 'var(--accent, #1a6bbd)', 'fill-opacity': q.peor ? 1 : 0.7 }));
  const pe = sol.find(q => q.peor);
  if (pe) { const der = X(pe.x) > W * 0.55; el('text', { x: X(pe.x) + (der ? -10 : 10), y: Y(pe.y) + 18, 'text-anchor': der ? 'end' : 'start', 'font-size': 11, fill: 'currentColor' }, `peor con ρ mín: ${m.peor.combinacion}`); }
  return svg;
}
