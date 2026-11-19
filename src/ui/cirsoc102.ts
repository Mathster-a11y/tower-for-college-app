/**
 * Etapa «Viento», paso «CIRSOC 102-25»: los datos del viento según el reglamento vigente (ciudad, categoría de riesgo,
 * exposición…), la frecuencia, el factor de ráfaga, las fuerzas por nivel, los cuatro casos de carga, las combinaciones
 * del CIRSOC 101-25 y el viento de servicio. Es la capa de cargas de los métodos CIRSOC y FEM (plan, etapa 3); hasta la
 * etapa 4 se muestra para comparar con la planilla y la guía (102-2005).
 */
import { CIUDADES, EXPOSICIONES, FACTOR_SERVICIO, GCPI, datos102De, viento102, type DatosCirsoc102, type Direccion102, type Viento102 } from '../engine/cargas/cirsoc102';
import { combinaciones, datos101De, sobrecarga, SERVICIO, type DatosCirsoc101 } from '../engine/cargas/cirsoc101';
import { estado, fmt } from './estado';
import { formula, h, kpi, n, op, r, seccion, v, type H } from './comp';
import { graficoAltura, tablaValores, type Tam } from './diagramas';

/** el cálculo del 102-25 del proyecto abierto (se rehace solo cuando cambia la revisión) */
let cache: { rev: number; v: Viento102 } | null = null;
export function vientoCirsoc(): Viento102 {
  if (!cache || cache.rev !== estado.revision) cache = { rev: estado.revision, v: viento102(estado.proyecto) };
  return cache.v;
}

const cambiar102 = (x: Partial<DatosCirsoc102>) => estado.cambiar(p => { p.cirsoc102 = { ...(p.cirsoc102 ?? {}), ...x }; });
const cambiar101 = (x: Partial<DatosCirsoc101>) => estado.cambiar(p => { p.cirsoc101 = { ...(p.cirsoc101 ?? {}), ...x }; });

function elegir<T extends string>(rotulo: string, opciones: [T, string][], actual: T, alCambiar: (x: T) => void, ayuda?: string): H {
  const s = h('select', {}) as HTMLSelectElement;
  opciones.forEach(([val, txt]) => s.append(new Option(txt, val, false, val === actual)));
  s.addEventListener('change', () => alCambiar(s.value as T));
  return h('label', { class: 'campo' }, h('span', {}, rotulo), s, ...(ayuda ? [h('small', {}, ayuda)] : []));
}
function numero(rotulo: string, valor: number | null | undefined, alCambiar: (x: number | null) => void, ayuda?: string, paso = 'any'): H {
  const i = h('input', { type: 'number', step: paso, value: valor === null || valor === undefined ? '' : String(valor) }) as HTMLInputElement;
  i.addEventListener('change', () => { const t = i.value.trim(); const x = t === '' ? null : Number(t.replace(',', '.')); if (x === null || isFinite(x)) alCambiar(x); });
  return h('label', { class: 'campo' }, h('span', {}, rotulo), i, ...(ayuda ? [h('small', {}, ayuda)] : []));
}

export function panelCirsoc102(c: H) {
  const p = estado.proyecto, d = datos102De(p), d1 = datos101De(p);
  const w = vientoCirsoc(), dir: Direccion102 = estado.dir === 'A' ? w.A : w.B;
  c.append(h('p', { class: 'nota' }, 'El viento según el reglamento vigente, CIRSOC 102-25 (procedimiento direccional). La planilla y la guía usan el de 2005. Lo usan los métodos CIRSOC y FEM; mientras tanto sirve para comparar.'));
  c.append(h('div', { class: 'kpis' },
    kpi('V', `${fmt(w.V, 1)} m/s`, `${w.ciudad ?? 'a mano'} · categoría ${w.categoria}`),
    kpi('Frecuencia n1', `${fmt(dir.n1, 2)} Hz`, dir.rigido ? 'rígido (≥ 1 Hz)' : 'flexible (< 1 Hz)', dir.rigido ? 'var(--ok)' : 'var(--revisar)'),
    kpi(dir.rigido ? 'G' : 'Gf', fmt(dir.Gusado, 3), dir.rigido ? 'art. 1.9.4' : 'art. 1.9.5'),
    kpi(`Corte en PB, viento ${dir.dir}`, `${fmt(dir.QPB, 1)} t`, `planilla: ${fmt(estado.calculo.res.mnyq.H61, 1)} t (viento A)`),
  ));
  // datos
  const dat = seccion('Datos del viento (CIRSOC 102-25)').cuerpo; c.append(dat.parentElement!);
  dat.append(h('div', { class: 'grilla2' },
    elegir('Ciudad (Fig. 1.5-1D)', [['', 'V a mano'], ...Object.keys(CIUDADES).map(k => [k, k] as [string, string])], d.ciudad ?? '', x => cambiar102({ ciudad: x || null }),
      p.cirsoc102?.ciudad ? undefined : 'sin elegir: la que corresponde a la V del 102-2005 del proyecto'),
    d.ciudad ? h('span', {}) : numero('V a mano (m/s)', d.Vmanual, x => cambiar102({ Vmanual: x })),
    elegir('Categoría de riesgo (Tabla 1.14-1)', [['I', 'I · bajo riesgo para las personas'], ['II', 'II · viviendas, oficinas (la mayoría)'], ['III-IV', 'III y IV · muchas personas o esenciales']], d.categoria, x => cambiar102({ categoria: x })),
    elegir('Exposición (art. 1.7.3)', [['B', 'B · urbana, suburbana o boscosa'], ['C', 'C · abierta, obstrucciones dispersas'], ['D', 'D · costa sin obstrucciones']], d.exposicion, x => cambiar102({ exposicion: x }),
      p.cirsoc102?.exposicion ? undefined : 'sin elegir: la del 102-2005 (la A pasa a B)'),
    numero('Factor topográfico Kzt (art. 1.8)', d.Kzt, x => cambiar102({ Kzt: x ?? 1 }), '1 = terreno llano; más en lomas y escarpas'),
    numero('Altitud del terreno (m)', d.altitud, x => cambiar102({ altitud: x ?? 0 }), `Ke = ${fmt(w.Ke, 3)} (Tabla 1.12-1)`),
    elegir('Cerramiento (Tabla 1.11-1)', (Object.keys(GCPI) as (keyof typeof GCPI)[]).map(k => [k, `${k} (GCpi ±${fmt(GCPI[k], 2)})`]), d.cerramiento, x => cambiar102({ cerramiento: x })),
    elegir('Frecuencia (art. 1.9.3)', [['tabiques', 'tabiques: 117,3·√Cw / h (1.9-5)'], ['otros', 'otros sistemas: 22,86 / h (1.9-4)'], ['manual', 'n1 de un análisis (dato)']], d.frecuencia, x => cambiar102({ frecuencia: x })),
    d.frecuencia === 'manual' ? numero('n1 (Hz)', d.n1manual, x => cambiar102({ n1manual: x })) : h('span', {}),
    numero('Amortiguamiento β', d.beta, x => cambiar102({ beta: x ?? 0.02 }), '0,02 = 2 % (hormigón); solo para Gf', '0.005'),
    elegir('Viento de servicio: recurrencia', Object.keys(FACTOR_SERVICIO).map(k => [k, `${k} años (× ${fmt(FACTOR_SERVICIO[+k], 2)})`] as [string, string]), String(d.recurrenciaServicio), x => cambiar102({ recurrenciaServicio: +x })),
  ));
  const car = seccion('Cargas (CIRSOC 101-25)').cuerpo; c.append(car.parentElement!);
  car.append(h('div', { class: 'grilla2' },
    numero('D de la losa (t/m²)', d1.D, x => cambiar101({ D: x ?? 0.7 }), 'peso propio, contrapiso, solado, cielorraso (la guía: 0,7)'),
    elegir('Destino (Tabla 4.1)', [['vivienda', 'vivienda · 2 kN/m²'], ['oficinas', 'oficinas · 2,5 kN/m²'], ['otro', 'otro (L a mano)']], d1.destino, x => cambiar101({ destino: x })),
    d1.destino === 'otro' ? numero('L (kN/m²)', d1.Lmanual, x => cambiar101({ Lmanual: x })) : h('span', {}),
  ), h('p', { class: 'nota' }, `L = ${fmt(sobrecarga(d1), 3)} t/m². D + L = ${fmt(d1.D + sobrecarga(d1), 3)} t/m² (la guía: 0,9).`));
  // fórmulas, en la azotea
  const fo = seccion('Fórmulas (azotea)').cuerpo; c.append(fo.parentElement!);
  const top = dir.niveles[0];
  if (top) fo.append(
    formula('Coeficiente de exposición (Tabla 1.13-1)', `${v('K', 'z')}${op('=')}2,41 · (${n(top.z, 1)} / ${n(EXPOSICIONES[w.exposicion].zg, 0)})<sup>2/${String(EXPOSICIONES[w.exposicion].alfa).replace('.', ',')}</sup>${op('=')}${r(top.Kz, 3)}`, 'z ≥ 5 m; exposición ' + w.exposicion),
    formula('Presión dinámica (1.13-1)', `${v('q', 'z')}${op('=')}0,613 · ${v('K', 'z')} · ${v('K', 'zt')} · ${v('K', 'd')} · ${v('K', 'e')} · ${v('V')}²${op('=')}0,613 · ${n(top.Kz, 3)} · ${n(w.Kzt, 2)} · ${n(w.Kd, 2)} · ${n(w.Ke, 3)} · ${n(w.V, 1)}²${op('=')}${r(top.qz, 0, 'N/m²')}`, 'sin factor de importancia: la categoría ya está en V'),
    formula('Frecuencia', dir.Cw !== undefined ? `${v('n', '1')}${op('=')}117,3 · √${v('C', 'w')} / ${v('h')}${op('=')}117,3 · √${n(dir.Cw, 4)} / ${n(w.h, 1)}${op('=')}${r(dir.n1, 2, 'Hz')}` : `${v('n', '1')}${op('=')}${r(dir.n1, 2, 'Hz')}`,
      `${dir.metodoFrecuencia}. Comparar: 22,86/h = ${fmt(dir.n1Otros, 2)} Hz; la guía (102-2005) = ${fmt(dir.n1Guia2005, 2)} Hz`),
    formula(dir.rigido ? 'Factor de ráfaga (rígido)' : 'Factor de ráfaga (flexible, 1.9-10)', dir.rigido ? `${v('G')}${op('=')}0,85` :
      `${v('G', 'f')}${op('=')}0,925 · (1 + 1,7·${v('I', 'z')}·√(${v('g', 'Q')}²${v('Q')}² + ${v('g', 'R')}²${v('R')}²)) / (1 + 1,7·${v('g', 'v')}·${v('I', 'z')})${op('=')}${r(dir.Gusado, 3)}`,
      dir.rigido ? `n1 ≥ 1 Hz (art. 1.9.4); G calculado = ${fmt(dir.rafaga.G, 3)}` : `Iz = ${fmt(dir.rafaga.Iz, 3)} · Q = ${fmt(dir.rafaga.Q, 3)} · R = ${fmt(dir.rafaga.R ?? NaN, 3)} · gR = ${fmt(dir.rafaga.gR ?? NaN, 3)} · β = ${fmt(d.beta, 3)}`),
    formula('Presión neta en la azotea', `${v('p')}${op('=')}${v('q', 'z')}·${v('G')}·0,8 − ${v('q', 'h')}·${v('G')}·(${n(dir.Cps, 2)})${op('=')}${r(top.pNeta, 0, 'N/m²')}`, `Cp sotavento con L/B = ${fmt(dir.L / dir.B, 2)} (Fig. 2.4-1); la presión interna se anula entre las dos caras`),
    formula('Carga mínima (art. 2.1.5)', `${v('W', 'mín')}${op('=')}0,75 kN/m² · área${op('=')}${r(dir.Wmin, 1, 't')}${op(dir.mandaMinimo ? '>' : '≤')}${n(dir.W, 1)} t`, dir.mandaMinimo ? 'manda la mínima: las fuerzas se escalan' : 'no manda'),
  );
  // avisos que enseñan
  if (!dir.aproximadaValida && d.frecuencia !== 'manual') c.append(h('p', { class: 'aviso-viejo' }, `La frecuencia aproximada vale solo si h < 90 m y h < 4·Lef (art. 1.9.2.1). Acá h = ${fmt(w.h, 1)} m y 4·Lef = ${fmt(4 * dir.Lef, 1)} m: hace falta un análisis (el FEM de la etapa 6) o escribir n1.`));
  if (!dir.rigido) c.append(h('p', { class: 'nota' }, `Con n1 = ${fmt(dir.n1, 2)} Hz el edificio es flexible y el factor de ráfaga sube a ${fmt(dir.Gusado, 3)} (la guía usa 0,85 y lo anota). Las fórmulas aproximadas dan un límite inferior de la frecuencia: con un análisis (FEM) suele salir más alta y Gf más chico.`));
}

export function centroCirsoc102(c: H, tam: Tam, anchos: (t: Tam) => { ancho: number; alto: number }, fila: (...x: Node[]) => H) {
  const w = vientoCirsoc(), dir = estado.dir === 'A' ? w.A : w.B;
  const pl = estado.calculo.valores;
  const a = anchos(tam);
  const sobre = estado.calculo.asig ? estado.proyecto.niveles.map((nv, j) => ({ nv, k: estado.calculo.asig.filaNivel[j] })).filter(x => x.k !== undefined && x.nv.cota > 0) : [];
  c.append(fila(
    graficoAltura({ titulo: 'Presión neta en altura: CIRSOC 102-25 y 102-2005', eje: 'presión', unidad: 'kN/m²', decimales: 2, series: [
      { nombre: 'CIRSOC 102-25', color: 'carga', tipo: 'linea', puntos: dir.niveles.map(x => ({ z: x.z, x: x.pNeta / 1000, nivel: x.nivel })) },
      { nombre: `${estado.fuente === 'guia' ? 'guía' : 'planilla'} (102-2005)`, color: 'carga', punteada: true, tipo: 'linea', puntos: sobre.map(x => ({ z: x.nv.cota, x: (pl.viento.P[x.k] - pl.viento.Q[x.k]) / 1000, nivel: x.nv.nombre })) },
    ] }, a),
    graficoAltura({ titulo: `Fuerza en cada nivel · CIRSOC 102-25: W = ${fmt(dir.QPB, 1)} t`, eje: 'fuerza Wi', unidad: 't', decimales: 2,
      series: [{ nombre: 'fuerza', color: 'carga', tipo: 'barras', puntos: dir.niveles.map(x => ({ z: x.z, x: x.W, nivel: x.nivel })) }] }, a),
  ));
  c.append(h('p', { class: 'nota' }, `Viento ${dir.dir}: ancho ${fmt(dir.B, 1)} m, largo ${fmt(dir.L, 1)} m. Corte en PB ${fmt(dir.QPB, 1)} t y momento ${fmt(dir.MPB, 0)} tm; la franja de PB (${fmt(dir.WPB, 2)} t) va al terreno. Las fuerzas están en t (1 t = 9,80665 kN, sin redondear a 10 como la planilla).`));
  c.append(tablaValores(['Nivel', 'z (m)', 'Kz', 'qz (N/m²)', 'p neta (N/m²)', 'h inf. (m)', 'Wi (t)', 'Q (t)'], dir.niveles.map(x => [x.nivel, x.z, x.Kz, x.qz, x.pNeta, x.hInf, x.W, x.Q]), [0, 2, 3, 0, 0, 2, 2, 1]));
  // casos de carga, combinaciones y servicio
  const cs = seccion('Casos de carga (art. 2.4.6, Fig. 2.4-8), en PB').cuerpo; c.append(cs.parentElement!);
  cs.append(tablaValores(['Caso', 'Qué es', 'Q viento A (t)', 'Q viento B (t)', 'Mt (tm)'], w.casos.map(x => [String(x.caso), x.texto, x.QA, x.QB, x.Mt]), [0, 0, 1, 1, 1]));
  cs.append(h('p', { class: 'nota' }, 'Los casos 2 y 4 agregan un momento torsor (excentricidad ±0,15 B); la rototraslación lo reparte entre los tabiques. Valores de la figura tomados del ASCE 7-10, en el que se basa el 102-25 (la figura es un dibujo).'));
  const co = seccion('Combinaciones (CIRSOC 101-25, art. 2.3.2; 102-25, Apéndice B)').cuerpo; c.append(co.parentElement!);
  co.append(tablaValores(['Combinación', 'D', 'L', 'W', 'Para qué'], [...combinaciones(), SERVICIO].map(x => [x.nombre, x.D, x.L, x.W, x.nota]), [0, 1, 1, 1, 0]));
  co.append(h('p', { class: 'nota' }, `El viento del 102-25 ya es «de resistencia»: va con 1,0 (el 102-2005 iba con 1,6). Viento de servicio (${w.servicio.recurrencia} años): Va = ${fmt(w.servicio.factor, 2)} · ${fmt(w.V50, 1)} = ${fmt(w.servicio.Va, 1)} m/s, es decir ${fmt(w.servicio.relacion * 100, 0)} % de la presión de cálculo.`));
}
