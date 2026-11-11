/**
 * Las etapas del cálculo, en el orden de la guía: 01 Diseño · 02 Viento · 03 Fuerzas · 04 Estabilidad · 05 Rigidez ·
 * 06 Rototraslación · 07 Flexión, más Resumen y Ayuda. Cada etapa tiene su color de rol, su panel (datos, indicadores,
 * fórmulas con los números y la celda de la planilla) y su dibujo grande en el centro.
 */
import { estado, fmt } from './estado';
import { h, seccion, kpi, chip, colorEstado, formula, v, n, r, op, esc, type H, type EstadoChip } from './comp';
import { panelAvisos, panelAyuda, panelMuros, panelNiveles, panelPiezas, panelProyecto, panelResultados, seccionViento, cantidadAvisos } from './paneles';
import { graficoAltura, graficoRigidez, graficoTensiones, tablaValores, type Tam } from './diagramas';
import { dibujoGuia, dibujoPresiones, dibujoPoligono } from './funicular';
import { dibujoRototraslacion, type DatosRotoPlano, type ElementoPlano, type Paso } from './rototraslacion';
import { datosAltura, deformada, E_DE_DIVISOR, reparto, rigidez, rigidezPorNivel, type PuntoAltura } from '../engine/diagramas';
import { calcFunicular, poligonoFunicular } from '../engine/funicular';
import { verificarDireccion, Q_CARGADO, Q_DESCARGADO, PE_HORMIGON, SIGMA_E, alturaYLosas, datosAlturaDe } from '../engine/flexocompresion';
import { TENSION_ADM, type Control } from '../engine/verificaciones';
import type { PlanillaRes } from '../engine/planilla';

export interface Etapa {
  id: string; nro: string; nombre: string; rol: string; icono: string;
  sub?: string[];
  dependeDir?: boolean;
  /** usa el selector de valores (planilla / guía) */
  conFuente?: boolean;
  panel(c: H, sub: string): void;
  /** «planta»: el editor de la planta; si no, el dibujo de la etapa */
  centro: 'planta' | ((c: H, tam: Tam) => void);
  nombreCentro(): string;
  estado(): EstadoChip;
  globo: string;
}

// ------------------------------------------------------------------ datos comunes
function datos() {
  const { asig, res, corr, controles } = estado.calculo;
  const p = estado.proyecto;
  const dir = estado.dir;
  const iPB = p.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1);
  const filaPB = asig.filaNivel[iPB] ?? 50;
  const R: PlanillaRes = estado.fuente === 'guia' ? corr.guia : res;
  const alt = datosAltura(p, R.viento, R.mnyq, asig.filaNivel, dir);
  const W = dir === 'A' ? R.mnyq.H61 : alt.reduce((s, x) => s + x.F, 0);
  const Mv = dir === 'A' ? R.mnyq.J61 : R.mnyq.O61;
  return { p, asig, res, corr, controles, dir, iPB, filaPB, R, alt, W, Mv, hw: W > 0 ? Mv / W : NaN };
}
const fuenteTxt = () => (estado.fuente === 'guia' ? 'Valores «Guía/CIRSOC»: Kz con z mínimo de 5 m, sin viento en PB ni en los subsuelos.' : 'Valores de la planilla original, tal como los calcula.');
const peor = (cs: Control[]): EstadoChip => (cs.some(c => c.estado === 'no verifica') ? 'no verifica' : cs.some(c => c.estado === 'atención') ? 'revisar' : cs.length ? 'verifica' : 'pendiente');
const grupoControles = (pre: string[]) => estado.calculo.controles?.filter(c => pre.some(g => c.grupo.startsWith(g))) ?? [];

/** Tabla de controles: planilla, guía y estado. */
function tablaControles(cs: Control[]): H {
  const t = h('table', { class: 'tabla' });
  t.append(h('thead', {}, h('tr', {}, ...['Control', 'Planilla', 'Guía', ''].map(x => h('th', {}, x)))));
  const tb = h('tbody');
  cs.forEach(k => {
    tb.append(h('tr', {}, h('td', {}, k.nombre, h('small', {}, `${k.criterio} · ${k.fuente}`)), h('td', { class: 'n' }, fmt(k.planilla)), h('td', { class: 'n' }, fmt(k.guia)), h('td', {}, chip(k.estado === 'atención' ? 'revisar' : k.estado))));
    if (k.nota) tb.append(h('tr', { class: 'nota-fila' }, h('td', { colspan: '4' }, k.nota)));
  });
  t.append(tb);
  return h('div', { class: 'scroll' }, t);
}
/** dos dibujos lado a lado si entran; si no, uno debajo del otro */
function anchos(tam: Tam, n2 = 2) { const a = tam.ancho ?? 600; return a >= 760 ? { ancho: Math.floor((a - 16 * (n2 - 1)) / n2), alto: Math.max(320, (tam.alto ?? 520) - 70) } : { ancho: a, alto: 380 }; }
function fila(...hijos: Node[]) { return h('div', { class: 'fila-dibujos' }, ...hijos); }
function nivelElegido(alt: PuntoAltura[], clave: string): PuntoAltura | undefined {
  const sobre = alt.filter(x => x.z > 0);
  const nom = estado.sub[clave];
  return sobre.find(x => x.nivel === nom) ?? sobre[0];
}
function selectorNivel(alt: PuntoAltura[], clave: string): H {
  const sobre = alt.filter(x => x.z > 0);
  const s = h('select', { 'aria-label': 'Nivel' });
  sobre.forEach(x => s.append(h('option', { value: x.nivel }, `${x.nivel} · z = ${fmt(x.z, 2)} m`)));
  s.value = nivelElegido(alt, clave)?.nivel ?? '';
  s.addEventListener('change', () => { estado.sub[clave] = s.value; estado.avisarPanel(); });
  return h('div', { class: 'fila-acciones' }, h('span', { class: 'nota' }, 'Nivel'), s);
}

// ------------------------------------------------------------------ 01 Diseño
const diseno: Etapa = {
  id: 'diseno', nro: '01', nombre: 'Diseño', rol: '--r-diseno', sub: ['Proyecto', 'Niveles', 'Muros', 'Piezas'],
  icono: '<rect x="4" y="4" width="18" height="16" rx="2"/><path d="M4 12h9M13 4v16"/>',
  globo: 'Diseño|Los datos de la torre: niveles, muros y piezas. Cada muro va en una pieza por dirección; la app arma con ellas los perfiles de las hojas J.',
  panel(c, sub) {
    if (sub === 'Niveles') panelNiveles(c);
    else if (sub === 'Muros') panelMuros(c);
    else if (sub === 'Piezas') panelPiezas(c);
    else panelProyecto(c);
  },
  centro: 'planta',
  nombreCentro: () => 'Planta',
  estado() {
    const { asig, error } = estado.calculo;
    if (error) return 'no verifica';
    if (!estado.proyecto.muros.length || !asig?.piezas.length) return 'pendiente';
    return cantidadAvisos() ? 'revisar' : 'completa';
  },
};

// ------------------------------------------------------------------ 02 Viento
const viento: Etapa = {
  id: 'viento', nro: '02', nombre: 'Viento', rol: '--r-viento', dependeDir: true, conFuente: true,
  icono: '<path d="M3 8h12a3 3 0 1 0-3-3M3 13h17a3 3 0 1 1-3 3M3 18h8"/>',
  globo: 'Viento|La presión del viento según el CIRSOC 102, método analítico: crece con la altura en la cara de barlovento y es constante (con qh) en sotavento.',
  panel(c) {
    const d = datos();
    const R = d.R, s = d.p.sitio;
    c.append(seccionViento());
    const pn = nivelElegido(d.alt, 'nivelViento');
    const cuerpo = seccion('Fórmulas, nivel por nivel').cuerpo;
    c.append(cuerpo.parentElement!);
    cuerpo.append(selectorNivel(d.alt, 'nivelViento'));
    if (pn) {
      const k = d.asig.filaNivel[d.p.niveles.findIndex(x => x.nombre === pn.nivel)];
      const fila = 5 + k;
      const zc = estado.fuente === 'guia' ? Math.max(pn.z, 5) : pn.z;
      cuerpo.append(
        formula('Coeficiente de exposición (CIRSOC 102, Tabla 5)', `${v('K', 'z')}${op('=')}2,01 · (${n(zc)} / ${n(s.zg, 0)})<sup>2/${fmt(s.alfa, 1)}</sup>${op('=')}${r(R.viento.Kz[k], 3)}`, `viento!H${fila}${estado.fuente === 'guia' && pn.z < 5 ? ' · la planilla usa z real; el CIRSOC, z ≥ 5 m' : ''}`),
        formula('Presión dinámica', `${v('q', 'z')}${op('=')}0,613 · ${n(s.Kzt)} · ${n(s.Kd)} · ${n(s.V, 0)}² · ${n(s.I)} · ${n(R.viento.Kz[k], 3)}${op('=')}${r(R.viento.qz[k], 1, 'N/m²')}`, `viento!M${fila}`),
        formula('Barlovento', `${v('p')}${op('=')}${v('q', 'z')} · ${v('G')} · ${v('C', 'p')}${op('=')}${n(R.viento.qz[k], 1)} · ${n(s.G)} · ${n(s.Cpb)}${op('=')}${r(R.viento.P[k], 1, 'N/m²')}`, `viento!P${fila}`),
        formula('Sotavento (con qh, la de la azotea)', `${v('p')}${op('=')}${v('q', 'h')} · ${v('G')} · ${v('C', 'p')}${op('=')}${n(R.viento.qh, 1)} · ${n(s.G)} · (${n(s.Cps)})${op('=')}${r(R.viento.Q[k], 1, 'N/m²')}`, `viento!Q${fila} · qh = viento!N4`),
        formula('Presión neta (barlovento − sotavento)', `${v('p', 'neta')}${op('=')}${n(R.viento.P[k], 1)} − (${n(R.viento.Q[k], 1)})${op('=')}${r(R.viento.R[k], 1, 'N/m²')}${op('=')}${r(R.viento.S[k], 4, 't/m²')}`, `viento!R${fila} · viento!S${fila}`),
      );
    }
    c.append(h('p', { class: 'nota' }, fuenteTxt()));
  },
  centro(c, tam) {
    const d = datos();
    const sobre = d.alt.filter(x => x.z > 0);
    const a = anchos(tam);
    c.append(fila(
      graficoAltura({ titulo: `Presión del viento en altura · p = q·G·Cp`, eje: 'presión', unidad: 'kN/m²', decimales: 2, series: [
        { nombre: 'barlovento (qz·G·Cp)', color: 'carga', tipo: 'linea', puntos: sobre.map(x => ({ z: x.z, x: x.pBarlo, nivel: x.nivel })) },
        { nombre: 'sotavento (qh·G·Cp)', color: 'carga', punteada: true, tipo: 'linea', puntos: sobre.map(x => ({ z: x.z, x: x.pSota, nivel: x.nivel })) },
      ] }, a),
      graficoAltura({ titulo: `Fuerza del viento en cada nivel · W = ${fmt(d.W, 1)} t`, eje: 'fuerza Wi', unidad: 't', decimales: 2,
        series: [{ nombre: 'fuerza', color: 'carga', tipo: 'barras', puntos: d.alt.map(x => ({ z: x.z, x: x.F, nivel: x.nivel })) }],
        alturas: isFinite(d.hw) ? [{ z: d.alt[d.alt.length - 1].z + d.hw, texto: `W a hw = ${fmt(d.hw)} m de la base` }] : [] }, a),
    ));
    c.append(h('p', { class: 'nota' }, `Viento ${d.dir}: ${d.dir === 'A' ? 'sobre la cara mayor (ancho B, M,NyQ columna E)' : 'sobre la cara menor (ancho L, M,NyQ columna F)'}. Cada fuerza es la presión neta por el ancho de la cara y la altura de influencia del nivel: Wi = D · E · p (M,NyQ columna H). ${fuenteTxt()}`));
    c.append(tablaValores(['Nivel', 'Cota (m)', 'Barlovento (kN/m²)', 'Sotavento (kN/m²)', 'Wi (t)'], d.alt.map(x => [x.nivel, x.z, x.pBarlo, x.pSota, x.F]), [0, 2, 3, 3, 2]));
  },
  nombreCentro: () => `Alzado · viento ${estado.dir}`,
  estado: () => (estado.calculo.res?.mnyq.H61 > 0 ? 'completa' : 'pendiente'),
};

// ------------------------------------------------------------------ 03 Fuerzas
const fuerzas: Etapa = {
  id: 'fuerzas', nro: '03', nombre: 'Fuerzas', rol: '--r-fuerzas', dependeDir: true, conFuente: true,
  icono: '<path d="M19 3v18M4 6h10M11 3l3 3-3 3M4 12h10M11 9l3 3-3 3M4 18h10M11 15l3 3-3 3"/>',
  globo: 'Fuerzas|La torre trabaja como una ménsula empotrada: en cada nivel, el corte es la suma de las fuerzas de arriba y el momento flector, su momento.',
  panel(c) {
    const d = datos();
    const m = d.R.mnyq, A = d.dir === 'A';
    c.append(h('div', { class: 'kpis' }, kpi('W, viento total', `${fmt(d.W, 1)} t`, A ? 'M,NyQ!H61' : 'suma de la cara menor'), kpi('hw', `${fmt(d.hw)} m`, 'altura de la resultante sobre la base'), kpi('Mv', `${fmt(d.Mv, 0)} tm`, A ? 'momento volcador · M,NyQ!J61' : 'M,NyQ!O61')));
    const cu = seccion('Fórmulas').cuerpo; c.append(cu.parentElement!);
    cu.append(
      formula('Fuerza en cada nivel', `${v('W', 'i')}${op('=')}${v('D')} · ${A ? v('E') : v('F')} · ${v('p', 'neta')}`, `M,NyQ!H${5}…  (D = altura de influencia; ${A ? 'E = ancho B' : 'F = ancho L'})`),
      formula('Viento total', `${v('W')}${op('=')}Σ ${v('W', 'i')}${op('=')}${r(d.W, 1, 't')}`, A ? 'M,NyQ!H61' : 'M,NyQ columna N'),
      formula('Corte y momento, de arriba hacia abajo', `${v('Q', 'i')}${op('=')}${v('Q', 'i−1')} + ${v('W', 'i−1')} · ${v('M', 'i')}${op('=')}${v('M', 'i−1')} + ${v('Q', 'i')} · ${v('h', 'piso')}`, A ? 'M,NyQ columnas I y J' : 'M,NyQ columnas N y O'),
      formula('Altura de la resultante', `${v('h', 'w')}${op('=')}${v('M', 'v')} / ${v('W')}${op('=')}${n(d.Mv, 1)} / ${n(d.W, 1)}${op('=')}${r(d.hw, 2, 'm')}`, A ? 'M,NyQ!G66' : '—'),
    );
    const t = tablaValores(['Nivel', 'Cota (m)', 'Wi (t)', 'Q (t)', 'M (tm)'], d.alt.map(x => [x.nivel, x.z, x.F, x.V, x.M]), [0, 2, 2, 1, 0]);
    t.setAttribute('open', '');
    c.append(seccion('Nivel por nivel', t).el, h('p', { class: 'nota' }, fuenteTxt()));
    void m;
  },
  centro(c, tam) {
    const d = datos();
    const a = anchos(tam);
    c.append(fila(
      graficoAltura({ titulo: `Corte Q en altura · en la base ${fmt(d.alt[d.alt.length - 1]?.V ?? 0, 1)} t`, eje: 'corte Q', unidad: 't', decimales: 1, series: [{ nombre: 'corte', color: 'corte', tipo: 'linea', puntos: d.alt.map(x => ({ z: x.z, x: x.V, nivel: x.nivel })) }] }, a),
      graficoAltura({ titulo: `Momento flector M en altura · Mv = ${fmt(d.Mv, 0)} tm`, eje: 'momento M', unidad: 'tm', decimales: 0, series: [{ nombre: 'momento', color: 'carga', tipo: 'linea', puntos: d.alt.map(x => ({ z: x.z, x: x.M, nivel: x.nivel })) }] }, a),
    ));
    c.append(h('p', { class: 'nota' }, 'El corte crece en escalones (una fuerza por piso) y el momento crece cada vez más rápido hacia abajo: por eso los tabiques se verifican en PB, donde las solicitaciones son máximas.'));
  },
  nombreCentro: () => `Esfuerzos · viento ${estado.dir}`,
  estado: () => (estado.calculo.res?.mnyq.J61 > 0 ? 'completa' : 'pendiente'),
};

// ------------------------------------------------------------------ 04 Estabilidad
const estabilidad: Etapa = {
  id: 'estabilidad', nro: '04', nombre: 'Estabilidad', rol: '--r-estabilidad', dependeDir: true, conFuente: true,
  icono: '<path d="M10 3h7v14h-7zM4 21h19M13.5 17l-4 4M13.5 17l4 4"/>',
  globo: 'Estabilidad|La torre no vuelca si el momento estabilizante del peso es al menos 1,5 veces el del viento y si la resultante de W y G cae en el tercio medio de la base.',
  panel(c) {
    const d = datos();
    const m = d.R.mnyq, b1 = d.p.fundacion.b1, a1 = d.p.fundacion.a1;
    const fg = calcFunicular(d.p, m, d.asig.filaNivel, d.dir);
    const vuelco = m.L99, okV = vuelco >= 1.5, okE = fg.verifica;
    c.append(h('div', { class: 'kpis' },
      kpi('Vuelco Me / Mv', fmt(vuelco, 2), okV ? '≥ 1,5 · verifica' : '< 1,5 · no verifica', colorEstado(okV)),
      kpi(`e, viento ${d.dir}`, `${fmt(fg.e, 2)} m`, `${okE ? '≤' : '>'} b/6 = ${fmt(fg.tercio, 2)} m`, colorEstado(okE)),
      kpi('Suelo, σ máx.', `${fmt(m.N89, 2)} kg/cm²`, 'contra la del estudio de suelos'),
    ));
    const cu = seccion('Fórmulas').cuerpo; c.append(cu.parentElement!);
    cu.append(
      formula('Peso sin sobrecarga (0,7 t/m² por planta)', `${v('P')}${op('=')}Σ 0,7 · ${v('E')} · ${v('F')}${op('=')}${r(m.M61, 0, 't')}`, 'M,NyQ!M61'),
      formula('Momento estabilizante', `${v('M', 'e')}${op('=')}${v('P')} · ${v('b')}<sub>1</sub> / 2${op('=')}${n(m.M61, 0)} · ${n(b1, 2)} / 2${op('=')}${r(m.K99, 0, 'tm')}`, 'M,NyQ!K99'),
      formula('Vuelco', `${v('M', 'e')} / ${v('M', 'v')}${op('=')}${n(m.K99, 0)} / ${n(m.J61, 0)}${op('=')}${r(vuelco, 2)}${op(okV ? '≥' : '<')}1,5`, 'M,NyQ!L99', okV ? 'verifica' : 'no verifica'),
      formula(`Excentricidad, viento ${d.dir}`, `${v('e')}${op('=')}${v('M', 'v')} / ${v('P')}${op('=')}${n(fg.Mv, 0)} / ${n(fg.G, 0)}${op('=')}${r(fg.e, 2, 'm')}${op(okE ? '≤' : '>')}${v('b')}/6${op('=')}${r(fg.tercio, 2, 'm')}`, d.dir === 'A' ? 'M,NyQ!M99 y N99' : `con a1 = ${fmt(a1, 2)} m (la planilla no verifica el viento B)`, okE ? 'verifica' : 'no verifica'),
      formula('Tensión en el suelo (con sobrecarga, 0,9 t/m²)', `${v('σ')}${op('=')}−${v('N')}/${v('F')} ± ${v('M', 'v')}/${v('W')}${op('=')}${n(m.N86, 2)} ∓ ${n(Math.abs(m.N87), 2)}${op('=')}${r(m.N89, 2, 'kg/cm²')}`, 'M,NyQ!N89 (máx.) · N90 (mín., sin sobrecarga)'),
    );
    c.append(seccion('Controles', tablaControles(grupoControles(['Estabilidad', 'Funicular']))).el, h('p', { class: 'nota' }, fuenteTxt()));
  },
  centro(c, tam) {
    const d = datos();
    const m = d.R.mnyq;
    const fg = calcFunicular(d.p, m, d.asig.filaNivel, d.dir);
    const perfil = d.p.niveles.map((x, j) => ({ z: x.cota, lado: d.dir === 'A' ? m.F[d.asig.filaNivel[j]] : m.E[d.asig.filaNivel[j]] })).filter(x => isFinite(x.lado));
    const cons = poligonoFunicular(d.alt.map(x => ({ z: x.z, F: x.F, nivel: x.nivel })));
    const a = anchos(tam);
    const f1 = h('figure', { class: 'diagrama' }, h('figcaption', {}, '1 · Polígono funicular del viento: dónde actúa W'), dibujoPoligono(cons, fg.zBase, { ancho: a.ancho, alto: Math.min(a.alto + 60, 560) }),
      h('p', { class: 'nota' }, `Las fuerzas de cada piso se ponen una tras otra en el polígono de fuerzas; con un polo O se trazan los rayos y, en el alzado, un lado paralelo a cada rayo entre dos fuerzas seguidas. Los lados extremos se cortan sobre la resultante: hw = ${fmt(cons.zR - fg.zBase)} m (planilla G66: ${fmt(fg.hw)} m).`));
    const f2 = h('figure', { class: 'diagrama' }, h('figcaption', {}, '2 · Suma de W y G: la resultante corta la base'), dibujoGuia(fg, perfil, { ancho: a.ancho, alto: Math.min(a.alto + 60, 560) }),
      h('p', { class: `nota estado ${fg.verifica ? 'verifica' : 'no-verifica'}` }, fg.verifica ? `Verifica: corta la base a ${fmt(fg.e)} m del eje, dentro del tercio medio (±${fmt(fg.tercio)} m).` : `No verifica: corta la base a ${fmt(fg.e)} m del eje, fuera del tercio medio (±${fmt(fg.tercio)} m).`));
    c.append(fila(f1, f2));
    const fuera = fg.puntos.filter(x => !x.dentro);
    c.append(h('figure', { class: 'diagrama' }, h('figcaption', {}, '3 · Línea de presiones piso a piso'), dibujoPresiones(fg, { ancho: Math.min(tam.ancho ?? 600, 760), alto: 360 }),
      h('p', { class: 'nota' }, `En cada nivel, la resultante de todo lo que está arriba corta el nivel a e = M / N del eje. La banda verde es el núcleo central de la planta (lado / 6): es una referencia, porque la planta no es maciza. ${fuera.length ? `Fuera: ${fuera.map(x => x.nivel).join(', ')}.` : 'Todos los niveles quedan dentro.'}`)));
  },
  nombreCentro: () => `Funicular · viento ${estado.dir}`,
  estado: () => peor(grupoControles(['Estabilidad', 'Funicular']).filter(c => c.estado !== 'informativo')),
};

// ------------------------------------------------------------------ 05 Rigidez
const rigidezE: Etapa = {
  id: 'rigidez', nro: '05', nombre: 'Rigidez', rol: '--r-rigidez', dependeDir: true, conFuente: true,
  icono: '<path d="M6 4h14M6 20h14M13 4v16"/>',
  globo: 'Rigidez|La suma de los J de las piezas tiene que alcanzar para que la azotea no se corra más de h/500 con el viento.',
  panel(c) {
    const d = datos();
    const rs = rigidez(d.R, d.p.hormigon || 'H30');
    const rg = rs.find(x => x.dir === d.dir)!;
    const E = E_DE_DIVISOR((rg.W * rg.h * rg.h) / rg.minimos.h500);
    const Jniv = rigidezPorNivel(d.p, d.asig.piezas, d.dir, rg.J);
    const def = deformada(d.alt, d.W, E, rg.J, z => Jniv.find(q => Math.abs(q.z - z) < 1e-6)?.J || rg.J);
    c.append(h('div', { class: 'kpis' },
      ...rs.map(x => kpi(`ΣJ viento ${x.dir}`, `${fmt(x.J, 1)} / ${fmt(x.minimos.h500, 1)}`, `m⁴ · ${x.J >= x.minimos.h500 ? 'verifica' : 'no verifica'}`, colorEstado(x.J >= x.minimos.h500))),
      kpi('Azotea', `${fmt(def.dTop * 1000, 1)} mm`, `límite h/500 = ${fmt(def.limite * 1000, 1)} mm`, colorEstado(def.dTop <= def.limite)),
    ));
    const cu = seccion('Fórmulas').cuerpo; c.append(cu.parentElement!);
    cu.append(
      formula(`J mínimo (fila ${rg.hormigon}, h/500)`, `${v('J', 'mín')}${op('=')}${v('W')} · ${v('h')}² / (${v('E')}/${v('k')})${op('=')}${n(rg.W, 1)} · ${n(rg.h, 2)}² / ${n((rg.W * rg.h * rg.h) / rg.minimos.h500, 0)}${op('=')}${r(rg.minimos.h500, 2, 'm⁴')}`, `J ${d.dir === 'A' ? 'paralelos' : 'ortogonales'}, tabla de J mínimo (M37)`),
      formula(`ΣJ, viento ${d.dir}`, `Σ ${v('J', 'j')}${op('=')}${r(rg.J, 3, 'm⁴')}${op(rg.J >= rg.minimos.h500 ? '≥' : '<')}${n(rg.minimos.h500, 2)}`, `J ${d.dir === 'A' ? 'paralelos' : 'ortogonales'}!AY24`, rg.J >= rg.minimos.h500 ? 'verifica' : 'no verifica'),
      formula('Desplazamiento de la azotea (ménsula, momento real de cada nivel)', `${v('δ')}${op('=')}∬ ${v('M')}/(${v('E')}·${v('J')}) d${v('z')}${op('=')}${r(def.dTop * 1000, 1, 'mm')}${op(def.dTop <= def.limite ? '≤' : '>')}${v('h')}/500${op('=')}${r(def.limite * 1000, 1, 'mm')}`, `E = ${fmt(E / 10, 0)} kg/cm² (el de la planilla) · con carga uniforme: δ = W·h³/8EJ = ${fmt(def.dUniforme * 1000, 1)} mm`, def.dTop <= def.limite ? 'verifica' : 'no verifica'),
    );
    const piezasDir = d.asig.piezas.filter(x => x.dir === d.dir && x.filaHoja !== null);
    const Jp = (i: number) => (d.dir === 'A' ? d.R.jpar : d.R.jort).filas[i].AY;
    const tot = piezasDir.reduce((s, x) => s + Jp(x.filaHoja!), 0);
    const t = tablaValores(['Pieza', 'Molde', 'J (m⁴)', '% de ΣJ'], piezasDir.map(x => [x.nombre, x.molde, Jp(x.filaHoja!), (Jp(x.filaHoja!) / tot) * 100]), [0, 0, 3, 1]);
    t.setAttribute('open', '');
    c.append(seccion('J de cada pieza', t).el);
  },
  centro(c, tam) {
    const d = datos();
    const rs = rigidez(d.R, d.p.hormigon || 'H30');
    const rg = rs.find(x => x.dir === d.dir)!;
    const E = E_DE_DIVISOR((rg.W * rg.h * rg.h) / rg.minimos.h500);
    const Jniv = rigidezPorNivel(d.p, d.asig.piezas, d.dir, rg.J);
    const varia = Jniv.some(x => Math.abs(x.J - rg.J) > 1e-6 * rg.J);
    const def = deformada(d.alt, d.W, E, rg.J, z => Jniv.find(q => Math.abs(q.z - z) < 1e-6)?.J || rg.J);
    const a = anchos(tam);
    c.append(graficoRigidez(rs, { ancho: Math.min(tam.ancho ?? 600, 900) }));
    const piezasDir = d.asig.piezas.filter(x => x.dir === d.dir && x.filaHoja !== null);
    const Jp = (i: number) => (d.dir === 'A' ? d.R.jpar : d.R.jort).filas[i].AY;
    c.append(fila(
      graficoAltura({ titulo: `Deformada · la azotea se corre ${fmt(def.dTop * 1000, 1)} mm (h/500 = ${fmt(def.limite * 1000, 1)} mm)`, eje: 'desplazamiento', unidad: 'mm', decimales: 1,
        series: [{ nombre: 'deformada', color: 'deformada', tipo: 'linea', puntos: def.puntos.map(x => ({ z: x.z, x: x.d * 1000, nivel: x.nivel })) }], referencias: [{ x: def.limite * 1000, texto: 'h/500' }] }, a),
      varia
        ? graficoAltura({ titulo: 'ΣJ en cada nivel (la planta cambia en altura)', eje: 'ΣJ', unidad: 'm⁴', decimales: 2, series: [{ nombre: 'ΣJ', color: 'acento', tipo: 'barras', puntos: Jniv.map(x => ({ z: x.z, x: x.J, nivel: x.nivel })) }] }, a)
        : graficoAltura({ titulo: 'Cómo se reparte ΣJ entre las piezas', eje: 'J', unidad: 'm⁴', decimales: 3, categorias: true,
          series: [{ nombre: 'J', color: 'acento', tipo: 'barras', puntos: [...piezasDir].sort((x, y) => Jp(x.filaHoja!) - Jp(y.filaHoja!)).map((x, i) => ({ z: i, x: Jp(x.filaHoja!), nivel: x.nombre })) }] }, a),
    ));
  },
  nombreCentro: () => `Rigidez · viento ${estado.dir}`,
  estado: () => peor(grupoControles(['Rigidez'])),
};

// ------------------------------------------------------------------ 06 Rototraslación
const rototrasl: Etapa = {
  id: 'rototrasl', nro: '06', nombre: 'Rototrasl.', rol: '--r-rototrasl', dependeDir: true, conFuente: true,
  icono: '<rect x="4" y="5" width="18" height="14" rx="2"/><circle cx="13" cy="12" r="3.5"/>',
  globo: 'Rototraslación|Cada pieza toma viento según su J (traslación). Si el centro de rigidez no coincide con la resultante, el momento Mt = Q·e hace girar la planta y se reparte según J·a (rotación).',
  panel(c) {
    const d = datos();
    const rot = d.dir === 'A' ? d.R.rotA : d.R.rotB;
    const rep = reparto(rot, d.dir === 'A' ? d.asig.datos.rotA.H : d.asig.datos.rotB.H, d.asig.piezas, d.dir);
    const hoja = d.dir === 'A' ? 'Rototrasl. cara mayor' : 'Rototrasl. cara menor';
    c.append(h('div', { class: 'kpis' }, kpi('ΣJ', `${fmt(rot.B25, 2)} m⁴`, `${hoja}!B25`), kpi('Xr = d', `${fmt(rep.d, 2)} m`, 'centro de rigidez'), kpi('Mt = Q·e', `${fmt(rep.Mt, 0)} tm`, 'momento que hace girar')));
    const cu = seccion('Fórmulas').cuerpo; c.append(cu.parentElement!);
    cu.append(
      formula('Centro de rigidez (eje de inercia)', `${v('X', 'r')}${op('=')}Σ ${v('J')}·${v('x')} / Σ ${v('J')}${op('=')}${n(rot.I25, 2)} / ${n(rot.B25, 2)}${op('=')}${r(rep.d, 2, 'm')}`, `${hoja}!J7`),
      formula('Momento de rotación', `${v('M', 't')}${op('=')}${v('Q')} · ${v('e')}${op('=')}${n(rep.Q, 1)} · ${n(rep.d, 2)}${op('=')}${r(rep.Mt, 1, 'tm')}`, `${hoja}!J15`),
      formula('Rototraslación (clase 5 y guía): lo que toma el tabique j', `${v('W', 'j')}${op('=')}${v('W')} · ${v('J', 'j')} / Σ${v('J', 'j')}${op('±')}${v('W')} · ${v('e')} · ${v('J', 'j')} · ${v('a', 'j')} / Σ${v('J', 'jt')} · ${v('a', 'j')}²`, `${hoja}: traslación columna E, rotación columna N · ΣJjt incluye los perpendiculares (filas 31 a 50)`),
    );
    const t = h('table', { class: 'tabla' });
    t.append(h('thead', {}, h('tr', {}, ...['Pieza', 'J (m⁴)', '%', 'Q tras.', 'Q rot.', 'Q total'].map(x => h('th', {}, x)))));
    const tb = h('tbody');
    rep.piezas.forEach(x => tb.append(h('tr', {}, h('td', {}, x.nombre), ...[[x.J, 3], [x.frac * 100, 1], [x.Qtras, 2], [x.Qrot, 2], [x.Qtot, 2]].map(([val, dd]) => h('td', { class: 'n' }, fmt(val, dd))))));
    t.append(tb);
    c.append(seccion('Reparto por pieza (t)', h('div', { class: 'scroll' }, t)).el, h('p', { class: 'nota' }, `Valores en el nivel −1º, como la planilla. ${fuenteTxt()}`));
  },
  centro(c, tam) {
    const d = datos();
    const dp = datosRotoPlano(d);
    const paso = (Number(estado.sub.pasoRoto) || 1) as Paso;
    const seg = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Paso' });
    (['1 · Eje de inercia', '2 · Traslación', '3 · Rotación', '4 · Rototraslación'] as const).forEach((t, i) => {
      const b2 = h('button', { type: 'button', 'aria-pressed': String(paso === i + 1) }, t);
      b2.addEventListener('click', () => { estado.sub.pasoRoto = String(i + 1); estado.avisarPanel(); });
      seg.append(b2);
    });
    const textos: Record<Paso, string> = {
      1: 'El J de cada tabique es un vector dibujado sobre el tabique (más grueso y más largo cuanto mayor es J). Con el polígono de los J, el polo O y los rayos se traza el funicular debajo de la planta: cada lado va entre las rectas de acción de dos tabiques, paralelo a su rayo. Los lados extremos se cortan sobre la recta de la resultante de los J: el eje de inercia. Donde cruza el eje de inercia de la otra dirección está el centro de rigidez CR.',
      2: 'Traslación: el viento W actúa en el eje de simetría y cada tabique toma una parte proporcional a su J: Wj = W · Jj / ΣJ. La flecha está sobre la recta de acción del tabique; su grosor es su J y su largo, la fuerza.',
      3: 'Rotación: como el eje de inercia no coincide con el eje de simetría, el viento gira la planta con Mt = W · e alrededor del CR. Cada tabique toma ± W · e · Jj · aj / ΣJt·aj² (aj: distancia al eje de inercia). Del lado del viento se suma (+) y del otro se resta (−). Los perpendiculares no toman traslación pero colaboran en la rotación.',
      4: 'Rototraslación = traslación ± rotación. En azul la parte de traslación; en violeta la de rotación, que se suma (+) o se resta (−).',
    };
    c.append(h('div', { class: 'fila-acciones' }, seg), h('p', { class: 'nota' }, textos[paso]));
    const svg = dibujoRototraslacion(dp, paso, { ancho: Math.min(tam.ancho ?? 640, 1000), alto: Math.max(460, Math.min(700, (tam.alto ?? 560) - 70)) });
    c.append(svg);
    const ley = h('div', { class: 'leyenda' });
    const mu = (col: string, t: string) => { const sp = h('span', {}); const i = h('i', {}); i.style.setProperty('--c', col); sp.append(i, t); return sp; };
    ley.append(mu('var(--accent)', paso === 1 ? 'J de cada tabique' : 'traslación'), mu('var(--corte)', 'rotación'), mu('var(--elegido)', 'eje de inercia y funicular'), mu('var(--carga)', 'viento W'));
    c.append(ley);
  },
  nombreCentro: () => `Planta · rototraslación, viento ${estado.dir}`,
  estado: () => (estado.calculo.asig?.piezas.length ? (grupoControles(['Reparto']).some(c => c.estado === 'no verifica') ? 'revisar' : 'completa') : 'pendiente'),
};

/** Datos de la rototraslación en planta (paralelos y perpendiculares) desde la hoja de rototraslación. */
function datosRotoPlano(d: ReturnType<typeof datos>): DatosRotoPlano {
  const A = d.dir === 'A';
  const rot = A ? d.R.rotA : d.R.rotB;
  const H = A ? d.asig.datos.rotA.H : d.asig.datos.rotB.H;
  const porId = new Map(d.p.muros.map(m => [m.id, m]));
  const B = d.p.niveles.slice(0, d.iPB + 1).reduce<number | null>((x, y) => y.B ?? x, null) ?? 20;
  const L = d.p.niveles.slice(0, d.iPB + 1).reduce<number | null>((x, y) => y.L ?? x, null) ?? 16;
  const elem = (otra: boolean) => d.asig.piezas.filter(pz => (otra ? pz.dir !== d.dir : pz.dir === d.dir) && pz.filaHoja !== null).map(pz => {
    const i = (otra ? 26 : 0) + pz.filaHoja!;
    const rotF = isFinite(rot.N[i]) ? rot.N[i] : 0, tras = otra ? 0 : rot.E[i];
    // en el viento B la planta está girada: la posición transversal es −y
    const pos = (H[i] ?? 0) * (!A && !otra ? -1 : 1) * (A && otra ? 1 : 1);
    return { nombre: pz.nombre, pos, J: rot.B[i], frac: otra ? 0 : rot.C[i], tras, rot: rotF, total: tras + rotF, a: rot.K[i], muros: pz.muros.map(id => porId.get(id)!).filter(Boolean) } as ElementoPlano;
  });
  return { dir: d.dir, T: A ? B : L, S: A ? L : B, Xr: rot.J7 * (A ? 1 : -1), Yr: rot.J38 ?? 0, Q: rot.D5, Mt: rot.J15, paralelos: elem(false), perpendiculares: elem(true), muros: d.p.muros.filter(m => m.llega), papeles: d.asig.papeles };
}

// ------------------------------------------------------------------ 07 Flexión
function verifs() {
  const d = datos();
  return verificarDireccion(d.p, d.asig.piezas, d.corr, d.asig.filaNivel, d.dir, TENSION_ADM(d.p.hormigon || 'H30'));
}
const flexion: Etapa = {
  id: 'flexion', nro: '07', nombre: 'Flexión', rol: '--r-flexion', dependeDir: true,
  icono: '<path d="M6 4v16M6 4l14 16H6"/>',
  globo: 'Flexocompresión|Cada muro se verifica en PB con σ = −N/F ± M/W: sin sobrecarga para ver si tracciona (y cuánta armadura lleva), con sobrecarga para la compresión máxima del hormigón.',
  panel(c) {
    const d = datos();
    const adm = TENSION_ADM(d.p.hormigon || 'H30');
    const vs = verifs();
    if (!vs.length) { c.append(h('p', { class: 'nota' }, 'No hay piezas en este viento.')); return; }
    const elegida = vs.find(x => x.nombre === estado.piezaFlex) ?? vs[0];
    c.append(h('p', { class: 'nota' }, `Como la guía (sección 5), en PB y muro por muro. Valores «Guía/CIRSOC» (momento de cada pieza en PB). Admisible: ${adm} kg/cm² (${d.p.hormigon}).`));
    const t = h('table', { class: 'tabla' });
    t.append(h('thead', {}, h('tr', {}, ...['Pieza', 'tracción', 'compresión', ''].map(x => h('th', {}, x)))));
    const tb = h('tbody');
    vs.forEach(x => {
      const e: EstadoChip = !x.verifica ? 'no verifica' : x.traccion > 0 ? 'revisar' : 'verifica';
      const tr = h('tr', { tabindex: '0', class: x === elegida ? 'sel' : '' }, h('td', {}, x.nombre), h('td', { class: 'n' }, fmt(x.traccion, 1)), h('td', { class: 'n' }, fmt(x.compresion, 1)), h('td', {}, chip(e, e === 'revisar' ? 'armadura' : e)));
      const elegir = () => { estado.piezaFlex = x.nombre; estado.avisarPanel(); };
      tr.addEventListener('click', elegir);
      tr.addEventListener('keydown', ev => { if (ev.key === 'Enter') elegir(); });
      tb.append(tr);
    });
    t.append(tb);
    c.append(seccion('Piezas (kg/cm²)', h('div', { class: 'scroll' }, t), h('p', { class: 'nota chica' }, 'Elegí una pieza para ver sus cuentas y su diagrama.')).el);
    // cuentas de la pieza elegida
    const alt = datosAlturaDe(d.p);
    const cu = seccion(`${elegida.nombre}: cuentas`).cuerpo; c.append(cu.parentElement!);
    cu.append(formula('Momento que toma la pieza en PB', `${v('M')}${op('=')}${v('M', 'PB')} · ${v('Q', 'j')}/${v('Q')}${op('=')}${r(elegida.M, 1, 'tm')} · ${v('J')}${op('=')}${r(elegida.J, 3, 'm⁴')}`, 'rototraslación (traslación + rotación)'));
    elegida.muros.forEach(m => {
      const mu = d.p.muros.find(x => x.id === m.id)!;
      const { altura, losas } = alturaYLosas(mu, alt);
      cu.append(h('div', { class: 'subtit' }, `${m.id} · ${m.papel === 'ala' ? 'ala (hace par)' : m.papel}`));
      cu.append(
        formula('Carga sin sobrecarga', `${v('N', 'g')}${op('=')}${v('F')}·${v('h')}·${PE_HORMIGON.toString().replace('.', ',')} + ${String(Q_DESCARGADO).replace('.', ',')}·${v('a')}·${v('n')}${op('=')}${n(m.A, 3)}·${n(altura, 1)}·2,4 + 0,7·${n(m.losaDesc / Q_DESCARGADO / Math.max(losas, 1), 2)}·${losas}${op('=')}${r(m.Ndesc, 1, 't')}`),
        formula('Tracción (descargado)', `${v('σ')}${op('=')}−${v('N', 'g')}/${v('F')} + ${m.papel === 'ala' ? `${v('M')}·${v('d')}/${v('J')}` : `${v('M')}·${v('y')}/${v('J')}`}${op('=')}−${n(m.Ndesc / m.A, 1)} + ${n(m.sigM, 1)}${op('=')}${r(m.traccion, 2, 'kg/cm²')}`, m.traccion > 0 ? `tracciona en ${fmt(m.x * 100, 0)} cm: T = ${fmt(m.T, 2)} t · As = T/${SIGMA_E} = ${fmt(m.As, 2)} cm²; mínima 0,8 % = ${fmt(m.AsMin, 1)} cm² → ${fmt(Math.max(m.As, m.AsMin), 1)} cm²` : 'todo comprimido: armadura mínima', m.traccion > 0 ? 'revisar' : 'verifica'),
        formula('Compresión (cargado)', `${v('σ')}${op('=')}−${v('N', 'q')}/${v('F')} − ${n(m.sigM, 1)}${op('=')}−${n(m.Ncarg / m.A, 1)} − ${n(m.sigM, 1)}${op('=')}${r(m.compresion, 2, 'kg/cm²')}`, `|σ| ${m.verifica ? '≤' : '>'} ${adm} kg/cm² · Nq con ${String(Q_CARGADO).replace('.', ',')} t/m²`, m.verifica ? 'verifica' : 'no verifica'),
      );
    });
  },
  centro(c, tam) {
    const vs = verifs();
    const d = datos();
    const adm = TENSION_ADM(d.p.hormigon || 'H30');
    const v0 = vs.find(x => x.nombre === estado.piezaFlex) ?? vs[0];
    if (!v0) { c.append(h('p', { class: 'nota' }, 'No hay piezas en este viento.')); return; }
    c.append(h('figure', { class: 'diagrama' }, h('figcaption', {}, `${v0.nombre}: tensiones de cada muro en PB · M = ${fmt(v0.M, 1)} tm`), graficoTensiones(v0, adm, { ancho: Math.min(tam.ancho ?? 600, 980), alto: Math.max(300, Math.min(480, (tam.alto ?? 520) - 160)) })));
    const filas = v0.muros.map(m => [`${m.id} (${m.papel})`, m.A, m.Ndesc, m.Ncarg, m.sigM / 10, m.desc[0] / 10, m.desc[1] / 10, m.carg[0] / 10, m.carg[1] / 10, Math.max(m.As, m.AsMin)]);
    const t = tablaValores(['Muro', 'F (m²)', 'Ng (t)', 'Nq (t)', 'M·y/J', 'σ desc. ext.', 'σ desc. int.', 'σ carg. ext.', 'σ carg. int.', 'As (cm²)'], filas, [0, 3, 1, 1, 1, 1, 1, 1, 1, 1]);
    t.setAttribute('open', '');
    c.append(t, h('p', { class: 'nota' }, 'Arriba de cero, tracción (zona sombreada): la línea punteada es el edificio sin sobrecarga, que es el que más tracciona. La línea llena es con sobrecarga, que es el que más comprime. Tensiones en kg/cm².'));
  },
  nombreCentro: () => `Flexocompresión · viento ${estado.dir}`,
  estado: () => peor(grupoControles(['Flexocompresión'])),
};

// ------------------------------------------------------------------ Resumen y Ayuda
const resumen: Etapa = {
  id: 'resumen', nro: '✓', nombre: 'Resumen', rol: '--r-resumen', conFuente: false,
  icono: '<path d="M5 6l1.5 1.5L9 5M5 12l1.5 1.5L9 11M5 18l1.5 1.5L9 17M12 6h9M12 12h9M12 18h9"/>',
  globo: 'Resumen|Todos los controles juntos, con el valor de la planilla y el corregido, y los avisos del proyecto.',
  sub: ['Controles', 'Avisos'],
  panel(c, sub) { if (sub === 'Avisos') panelAvisos(c); else { panelResultados(c, false); c.append(h('p', { class: 'nota' }, 'Todos los controles están en el centro, agrupados; cada etapa muestra además los suyos con sus fórmulas.')); } },
  centro(c) {
    const cs = estado.calculo.controles ?? [];
    const grupos = [...new Set(cs.map(x => x.grupo))];
    c.append(h('div', { class: 'kpis' }, ...grupos.map(g => { const e = peor(cs.filter(x => x.grupo === g && x.estado !== 'informativo')); return kpi(g, e, `${cs.filter(x => x.grupo === g).length} controles`, e === 'verifica' ? 'var(--ok)' : e === 'no verifica' ? 'var(--mal)' : e === 'revisar' ? 'var(--revisar)' : 'var(--accent)'); })));
    c.append(seccion('Todos los controles', tablaControles(cs)).el);
  },
  nombreCentro: () => 'Resumen de controles',
  estado: () => peor((estado.calculo.controles ?? []).filter(c => c.estado !== 'informativo')),
};
const ayuda: Etapa = {
  id: 'ayuda', nro: '?', nombre: 'Ayuda', rol: '--r-ayuda',
  icono: '<circle cx="13" cy="12" r="9"/><path d="M10.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M13 17v.1"/>',
  globo: 'Ayuda|Cómo se usa la app, atajos y dónde quedan los datos.',
  panel(c) { panelAyuda(c); },
  centro: 'planta',
  nombreCentro: () => 'Planta',
  estado: () => 'informativo',
};

export const ETAPAS: Etapa[] = [diseno, viento, fuerzas, estabilidad, rigidezE, rototrasl, flexion];
export const ETAPAS_FIN: Etapa[] = [resumen, ayuda];
export const todas = () => [...ETAPAS, ...ETAPAS_FIN];
export const etapaPorId = (id: string) => todas().find(e => e.id === id) ?? diseno;
export { esc };
