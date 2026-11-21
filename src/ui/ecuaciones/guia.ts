/**
 * Las cuentas del método de la guía «Edificio en torre» 2024, como grafo de fórmulas, capítulo por capítulo.
 * Los valores salen de calcularGuiaPasos (el mismo motor que la «Planilla de la guía» y que el método Guía de la app):
 * al arrastrar un dato, se recalcula todo con ese motor.
 */
import { calcularGuiaPasos, datosGuia, filaDivisor, type DatosGuia, type FlexoCalc, type ResultadoGuia } from '../../engine/metodos/guiaPasos';
import type { PiezaEquivalente } from '../../engine/mapping';
import type { Proyecto } from '../../engine/modelo';
import { sectorizar, type CapituloGrafo, type Grafo, type NodoGrafo, type ParamGrafo } from '../grafo';
import { h, type H } from '../comp';
import { fmt } from '../estado';

export interface RG { g: ResultadoGuia; d: DatosGuia }
export interface SelGuia { dir: 'A' | 'B'; pieza: string; muro: string }

const vto = (d: DatosGuia) => d.viento;
/** un dato del viento o de los coeficientes, arrastrable */
const dato = (id: string, sim: string, nombre: string, ruta: (d: DatosGuia) => Record<string, number>, clave: string, min: number, max: number, paso: number, dec: number, unidad?: string, fuente?: string): ParamGrafo<DatosGuia> =>
  ({ id, sim, nombre, unidad, dec, min, max, paso, fuente, get: d => ruta(d)[clave], set: (d, x) => { ruta(d)[clave] = x; } });
/** un número de la geometría: se ve, no se arrastra */
const fijo = (id: string, sim: string, nombre: string, get: (d: DatosGuia) => number, dec: number, unidad?: string, fuente?: string): ParamGrafo<DatosGuia> =>
  ({ id, sim, nombre, unidad, dec, fuente, get, set: () => undefined, min: 0, max: 0, paso: 0, fijo: true });
/** un resultado que viene de otro capítulo */
const de = (id: string, sim: string, titulo: string, externo: string, valor: (r: RG) => number | null | undefined, dec: number, unidad?: string): NodoGrafo<RG> =>
  ({ id, sim, titulo, ec: '', externo, valor, dec, unidad });

const pzSel = (r: RG, s: SelGuia) => r.g.roto[s.dir].piezas.find(x => x.nombre === s.pieza) ?? r.g.roto[s.dir].piezas[0];
const flexoSel = (r: RG, s: SelGuia): FlexoCalc | undefined => {
  const fs = r.g.flexo.filter(x => x.dir === s.dir && x.pieza === (pzSel(r, s)?.nombre ?? s.pieza));
  return fs.find(x => x.muro === s.muro) ?? fs[0];
};
const sobrePB = (r: RG) => r.g.niveles.filter(x => x.sobrePB);
const ancho = (r: RG, dir: 'A' | 'B') => (dir === 'A' ? r.g.BPB : r.g.LPB);

function tablaNiveles(r: RG, dir: 'A' | 'B'): H {
  const t = h('table', { class: 'tabla chica' });
  t.append(h('thead', {}, h('tr', {}, ...['Nivel', 'z (m)', 'D (m)', 'Kz', 'qz (N/m²)', 'p (t/m²)', `W${dir} (t)`, `Q${dir} (t)`, `M${dir} (tm)`].map(x => h('th', {}, x)))));
  const tb = h('tbody');
  r.g.niveles.forEach(x => tb.append(h('tr', { class: x.sobrePB ? '' : 'apagada' },
    h('td', {}, x.nombre), ...[[x.cota, 2], [x.D, 2], [x.Kz, 3], [x.qz, 0], [x.p, 4], [dir === 'A' ? x.WA : x.WB, 2], [dir === 'A' ? x.QA : x.QB, 2], [dir === 'A' ? x.MA : x.MB, 1]].map(([v, d]) => h('td', { class: 'n' }, fmt(v, d))))));
  t.append(tb);
  return h('div', { class: 'scroll' }, t);
}

export function grafoGuia(p: Proyecto, piezas: PiezaEquivalente[], s: SelGuia): Grafo<DatosGuia, RG> {
  const d0 = datosGuia(p, piezas);
  const dir = s.dir, A = dir === 'A';
  const W = (r: RG) => (A ? r.g.totales.WA : r.g.totales.WB);

  // ------------------------------------------------------------------------------------------ 1 · viento
  const viento: CapituloGrafo<DatosGuia, RG> = {
    id: 'viento', titulo: '1 · Viento y fuerzas',
    intro: `De la velocidad del viento a la fuerza en cada nivel y al corte y momento en planta baja (guía 2.1, CIRSOC 102-2005). Viento ${dir}: sopla contra la cara de ${A ? 'B' : 'L'} = ${fmt(ancho({ g: calcularGuiaPasos(d0), d: d0 }, dir), 2)} m.`,
    params: [
      dato('V', 'V', 'velocidad básica del viento', vto, 'V', 20, 80, 1, 0, 'm/s', 'Proyecto → Sitio (mapa del 102)'),
      dato('I', 'I', 'factor de importancia', vto, 'I', 0.77, 1.15, 0.01, 2, '', 'Tabla 1 del 102'),
      dato('Kd', 'Kd', 'factor de direccionalidad', vto, 'Kd', 0.5, 1, 0.01, 2, '', '0,85 para edificios'),
      dato('Kzt', 'Kzt', 'factor topográfico', vto, 'Kzt', 1, 2, 0.01, 2, '', '1 en terreno llano'),
      dato('zg', 'zg', 'altura gradiente', vto, 'zg', 200, 500, 5, 0, 'm', 'exposición (Tabla 2)'),
      dato('alfa', 'α', 'exponente de la ley potencial', vto, 'alfa', 5, 12, 0.1, 1, '', 'exposición (Tabla 2)'),
      dato('G', 'G', 'factor de ráfaga', vto, 'G', 0.7, 1.5, 0.01, 2, '', '0,85 si la torre es rígida'),
      dato('Cpb', 'Cp_b', 'coeficiente de presión a barlovento', vto, 'Cpb', 0.5, 1, 0.05, 2),
      dato('Cps', 'Cp_s', 'coeficiente a sotavento (negativo: succión)', vto, 'Cps', -1, 0, 0.05, 2, '', 'depende de L/B'),
      fijo('h', 'h', 'altura de la azotea sobre el terreno', d => d.niveles[0]?.cota ?? 0, 2, 'm', 'Diseño → Niveles'),
      fijo('B', A ? 'B' : 'L', `ancho de la cara que recibe el viento ${dir}`, d => { const i = d.niveles.reduce((k, n, j) => (n.cota >= 0 ? j : k), -1); return A ? d.niveles[i]?.B ?? 0 : d.niveles[i]?.L ?? 0; }, 2, 'm', 'Diseño → Niveles (PB)'),
      fijo('D0', 'D_i', 'altura de influencia del nivel (en la azotea: medio piso más el parapeto)', d => { const n = d.niveles; return n.length > 1 ? (n[0].cota - n[1].cota) / 2 + d.viento.parapeto : 0; }, 2, 'm'),
      fijo('hs', 'h_s', 'de PB a la fundación', d => { const i = d.niveles.reduce((k, n, j) => (n.cota >= 0 ? j : k), -1); return (d.niveles[i]?.cota ?? 0) - (d.niveles[d.niveles.length - 1]?.cota ?? 0); }, 2, 'm'),
    ],
    nodos: [
      { id: 'Kz', titulo: 'Exposición en la azotea', sim: 'Kz', ec: '2,01 · ([h] / [zg])^{2 / [alfa]}', dec: 3,
        valor: r => r.g.niveles[0]?.Kz, f: x => 2.01 * Math.pow(Math.max(x.h, 5) / x.zg, 2 / x.alfa),
        nota: 'Cuánto aumenta el viento con la altura. Debajo de 5 m la guía usa z = 5 m (Kz constante).', ref: 'CIRSOC 102-2005, Tabla 5' },
      { id: 'qh', titulo: 'Presión dinámica en la azotea', sim: 'qh', ec: '0,613 · [Kz] · [Kzt] · [Kd] · [V]² · [I]', unidad: 'N/m²', dec: 0,
        valor: r => r.g.qh, f: x => 0.613 * x.Kz * x.Kzt * x.Kd * x.V ** 2 * x.I,
        nota: 'La energía del viento por metro cuadrado: ½ ρ V² con ρ = 1,226 kg/m³ (de ahí el 0,613), corregida por la altura, la topografía, la dirección y la importancia.', ref: 'CIRSOC 102-2005, ec. (13)' },
      { id: 'pb', titulo: 'Empuje en la cara de barlovento', sim: 'p_b', ec: '[qh] · [G] · [Cpb]', unidad: 'N/m²', dec: 0,
        valor: r => r.g.qh * r.d.viento.G * r.d.viento.Cpb, f: x => x.qh * x.G * x.Cpb, nota: 'Presión contra la cara que recibe el viento (en cada nivel con su qz; acá, en la azotea).' },
      { id: 'ps', titulo: 'Succión en la cara de sotavento', sim: 'p_s', ec: '[qh] · [G] · [Cps]', unidad: 'N/m²', dec: 0,
        valor: r => r.g.qh * r.d.viento.G * r.d.viento.Cps, f: x => x.qh * x.G * x.Cps, nota: 'La cara de atrás succiona (por eso da negativa) con qh, el de la azotea, en toda la altura.' },
      { id: 'p', titulo: 'Presión neta (en la azotea)', sim: 'p', ec: '([pb] − [ps]) / 10 000', unidad: 't/m²', dec: 4,
        valor: r => r.g.niveles[0]?.p, f: x => (x.pb - x.ps) / 10000,
        nota: 'Empuje adelante menos la succión atrás (negativa): se suman, porque las dos empujan la torre hacia el mismo lado. Dividido 10 000 pasa de N/m² a t/m². En cada nivel se repite con su Kz.' },
      { id: 'Wi', titulo: 'Fuerza en el nivel (azotea)', sim: 'W_i', ec: '[p] · [B] · [D0]', unidad: 't', dec: 2,
        valor: r => (A ? r.g.niveles[0]?.WA : r.g.niveles[0]?.WB), f: x => x.p * x.B * x.D0,
        nota: 'La presión por el área que le toca a cada losa: el ancho de la cara por la mitad del piso de arriba y la mitad del de abajo.', ref: 'guía 2.1' },
      { id: 'Q', titulo: 'Corte en planta baja', sim: 'Q_PB', ec: 'Σ [Wi]', unidad: 't', dec: 1,
        valor: r => W(r), nota: 'La suma de las fuerzas de todos los niveles sobre PB: lo que los tabiques tienen que llevar hasta la fundación. Tocá la tarjeta para ver la tabla nivel por nivel.' },
      { id: 'MPB', titulo: 'Momento en planta baja', sim: 'M_PB', ec: 'Σ [Wi] · (z_i − z_PB)', unidad: 'tm', dec: 0,
        valor: r => r.g.roto[dir].MPB, nota: 'Cada fuerza por su brazo hasta PB: el momento que flexiona la torre en su base. Con él se verifican los tabiques.' },
      { id: 'hw', titulo: 'Altura de la resultante', sim: 'h_w', ec: '[MPB] / [Q]', unidad: 'm', dec: 2,
        valor: r => r.g.roto[dir].MPB / W(r), f: x => x.MPB / x.Q, nota: 'Dónde estaría una sola fuerza que reemplaza a todas: un poco más arriba de la mitad, porque el viento crece con la altura.' },
      { id: 'WPB', titulo: A ? 'Viento en la franja de PB' : 'Franja de PB (solo viento A)', sim: 'W_PB', ec: 'p_PB · [B] · h_PB', unidad: 't', dec: 2, fila: 5,
        valor: r => (A ? r.g.totales.WPB : 0), nota: 'La guía no carga la franja de PB en los tabiques, pero la suma a la fundación (criterio C).' },
      { id: 'Mv', titulo: 'Momento de vuelco en la fundación', sim: 'Mv', ec: '[MPB] + ([Q] + [WPB]) · [hs]', unidad: 'tm', dec: 0,
        valor: r => (A ? r.g.totales.MAfund : r.g.totales.MBfund), f: x => x.MPB + (x.Q + x.WPB) * x.hs,
        nota: 'El momento llega hasta la base de la fundación: el corte sigue actuando en los subsuelos con su brazo.', ref: 'guía 2.2' },
    ],
    detalle: (id, r) => (id === 'Q' || id === 'Wi' || id === 'MPB' || id === 'p' ? tablaNiveles(r, dir) : null),
  };

  // ------------------------------------------------------------------------------------------ 2 · estabilidad
  const estab: CapituloGrafo<DatosGuia, RG> = {
    id: 'estabilidad', titulo: '2 · Vuelco y suelo',
    intro: 'Que la torre no vuelque y que el suelo aguante: el peso tiene que ganarle al viento con margen, y la presión en la base no puede superar la del estudio de suelos (guía 2.2 y 3). Viento A, sobre la fundación de b1 × a1.',
    params: [
      dato('qD', 'q_D', 'peso por m² de planta (sin sobrecarga)', d => d.coef, 'qD', 0.4, 1.6, 0.05, 2, 't/m²', 'guía: 0,7 t/m²'),
      dato('qC', 'q_C', 'peso por m² de planta (con sobrecarga)', d => d.coef, 'qC', 0.5, 2, 0.05, 2, 't/m²', 'guía: 0,9 t/m²'),
      dato('b1', 'b_1', 'lado de la fundación paralelo al viento', d => d.fund, 'b1', 5, 60, 0.5, 2, 'm', 'Proyecto → Fundación'),
      dato('a1', 'a_1', 'lado de la fundación perpendicular al viento', d => d.fund, 'a1', 5, 60, 0.5, 2, 'm', 'Proyecto → Fundación'),
      dato('sadm', 'σ_adm', 'tensión admisible del suelo', d => d.fund, 'sigmaAdm', 0.5, 6, 0.1, 2, 'kg/cm²', 'estudio de suelos'),
      fijo('At', 'A_t', 'suma de las áreas de todas las plantas', d => d.niveles.reduce((s, n) => s + n.B * n.L, 0), 0, 'm²', 'Diseño → Niveles'),
    ],
    nodos: [
      de('MvE', 'Mv', 'Momento de vuelco', 'del capítulo 1 (viento A)', r => r.g.totales.MAfund, 0, 'tm'),
      { id: 'P', titulo: 'Peso de la torre', sim: 'P', ec: '[qD] · [At]', unidad: 't', dec: 0, valor: r => r.g.totales.G, f: x => x.qD * x.At,
        nota: 'Cada planta pesa q por su área; sin sobrecarga, porque para el vuelco conviene el peso más chico.' },
      { id: 'Me', titulo: 'Momento estabilizante', sim: 'Me', ec: '[P] · [b1] / 2', unidad: 'tm', dec: 0, valor: r => r.g.totales.Me, f: x => (x.P * x.b1) / 2,
        nota: 'El peso hace girar la torre al revés, alrededor del borde de la fundación: su brazo es medio b1.' },
      { id: 'FS', titulo: 'Seguridad al vuelco', sim: 'Me/Mv', ec: '[Me] / [MvE]', dec: 2, valor: r => r.g.totales.vuelco, f: x => x.Me / x.MvE,
        control: { cond: '≥ 1,5', ok: r => r.g.totales.vuelco >= 1.5,
          siNo: [
            { texto: 'Agrandar la fundación en el sentido del viento: Me crece con b1.', mueve: ['b1'] },
            { texto: 'Sumar peso (subsuelos, platea más gruesa): Me crece con P.', mueve: ['qD'] },
            { texto: 'Bajar el momento de vuelco: menos altura o una forma con menos succión (capítulo 1).', mueve: ['MvE'] },
          ] },
        nota: 'Cuántas veces el peso le gana al viento. La guía pide 1,5.', ref: 'guía 2.2' },
      { id: 'e', titulo: 'Excentricidad de la carga', sim: 'e', ec: '[MvE] / [P]', unidad: 'm', dec: 2, valor: r => r.g.totales.e, f: x => x.MvE / x.P,
        control: { cond: '≤ [b6]', ok: r => r.g.totales.e <= r.g.totales.b6 + 1e-9,
          siNo: [
            { texto: 'Agrandar b1: el núcleo central (b1/6) crece y la resultante queda adentro.', mueve: ['b1'] },
            { texto: 'Más peso: la resultante se acerca al centro.', mueve: ['qD'] },
          ] },
        nota: 'Cuánto se corre la resultante del centro de la fundación. Si sale del tercio central (b1/6), un borde de la base deja de apoyar.' },
      { id: 'b6', titulo: 'Núcleo central', sim: 'b_1/6', ec: '[b1] / 6', unidad: 'm', dec: 2, valor: r => r.g.totales.b6, f: x => x.b1 / 6 },
      { id: 'sN', titulo: 'Tensión por la carga (con sobrecarga)', sim: 'σ_N', ec: '[P] · [qC] / [qD] / ([a1] · [b1]) / 10', unidad: 'kg/cm²', dec: 2, valor: r => -r.g.totales.sC, f: x => (x.P * x.qC / x.qD) / (x.a1 * x.b1) / 10,
        tension: 'compresion', nota: 'La carga repartida en toda la base (con sobrecarga). /10 pasa de t/m² a kg/cm².' },
      { id: 'sM', titulo: 'Tensión por el momento', sim: 'σ_M', ec: '6 · [MvE] / ([a1] · [b1]²) / 10', unidad: 'kg/cm²', dec: 2, valor: r => -r.g.totales.sM, f: x => (6 * x.MvE) / (x.a1 * x.b1 ** 2) / 10,
        nota: 'El momento aprieta un borde y alivia el otro: M / W con W = a1·b1²/6.' },
      { id: 'smax', titulo: 'Presión máxima en el suelo', sim: 'σ_máx', ec: '[sN] + [sM]', unidad: 'kg/cm²', dec: 2, valor: r => -r.g.totales.sMax, f: x => x.sN + x.sM, tension: 'compresion',
        control: { cond: '≤ [sadm]', ok: r => -r.g.totales.sMax <= r.d.fund.sigmaAdm + 1e-9,
          siNo: [
            { texto: 'Agrandar la fundación: baja la carga por m² y, con b1, mucho el efecto del momento (b1²).', mueve: ['b1', 'a1'] },
            { texto: 'Fundar más hondo o mejorar el suelo (otra σadm del estudio).', mueve: ['sadm'] },
          ] },
        nota: 'El borde más cargado (compresión, en azul). Se compara con la que da el estudio de suelos.', ref: 'guía 3' },
    ],
  };

  // ------------------------------------------------------------------------------------------ 3 · rigidez
  const rig: CapituloGrafo<DatosGuia, RG> = {
    id: 'rigidez', titulo: '3 · Rigidez y flecha',
    intro: `Que la torre no se mueva de más: el J de cada pieza con Steiner, la suma de los J del viento ${dir} y la flecha de la ménsula contra h/500 (guía 4.1 y 4.2). Pieza elegida: ${s.pieza}.`,
    params: [
      fijo('E', 'E', 'módulo de elasticidad del hormigón', d => (filaDivisor(d.hormigon)[2] * 500) / 8, 0, 't/m²', `del hormigón (${d0.hormigon})`),
      fijo('Ht', 'H', 'altura total (azotea a fundación)', d => (d.niveles[0]?.cota ?? 0) - (d.niveles[d.niveles.length - 1]?.cota ?? 0), 2, 'm'),
      fijo('hR', 'h', 'altura de la azotea', d => d.niveles[0]?.cota ?? 0, 2, 'm'),
      fijo('Bf', A ? 'B' : 'L', 'ancho de la cara', d => { const i = d.niveles.reduce((k, n, j) => (n.cota >= 0 ? j : k), -1); return A ? d.niveles[i]?.B ?? 0 : d.niveles[i]?.L ?? 0; }, 2, 'm'),
    ],
    nodos: [
      de('WR', 'W', 'Viento total', `del capítulo 1 (viento ${dir})`, r => W(r), 1, 't'),
      de('pT', 'p_h', 'Presión neta arriba', 'del capítulo 1', r => sobrePB(r)[0]?.p, 4, 't/m²'),
      de('p1', 'p_1', 'Presión neta abajo (1.er piso)', 'del capítulo 1', r => r.g.niveles.filter(x => x.cota > 0).at(-1)?.p, 4, 't/m²'),
      { id: 'Jj', titulo: `J de ${s.pieza} (Steiner)`, sim: `J_${s.pieza}`, ec: 'Σ (b · h³ / 12 + A · d²)', unidad: 'm⁴', dec: 3, valor: r => pzSel(r, s)?.J,
        nota: 'El J de cada muro respecto de su propio eje más su área por la distancia al baricentro de la pieza al cuadrado: así las alas lejos del centro suman mucho. Tocá la tarjeta para ver muro por muro.', ref: 'guía 4.1' },
      { id: 'SJ', titulo: `Suma de los J del viento ${dir}`, sim: 'ΣJ', ec: 'Σ [Jj]', unidad: 'm⁴', dec: 2, valor: r => r.g.roto[dir].SJ,
        control: { cond: '≥ [Jmin]', ok: r => r.g.roto[dir].SJ >= (A ? r.g.rigidez.JminA : r.g.rigidez.JminB) - 1e-9,
          siNo: [
            { texto: 'Alargar los tabiques en el sentido del viento: J crece con el largo al cubo (h³).', mueve: ['Jj'] },
            { texto: 'Sumar piezas o alas lejos del baricentro (A · d² crece con la distancia al cuadrado).', mueve: ['Jj'] },
            { texto: 'Un hormigón mejor sube E y baja el J mínimo.', mueve: ['E'] },
          ] },
        nota: 'Todas las piezas del viento trabajan juntas, como resortes en paralelo.' },
      { id: 'Jmin', titulo: 'J mínimo (flecha h/500)', sim: 'J_mín', ec: '[WR] · [hR]² · 500 / (8 · [E])', unidad: 'm⁴', dec: 2, valor: r => (A ? r.g.rigidez.JminA : r.g.rigidez.JminB), f: x => (x.WR * x.hR ** 2 * 500) / (8 * x.E),
        nota: 'Despejando J de f = W·h³/(8EJ) ≤ h/500 con la carga repartida: la tabla de la planilla.' },
      { id: 'qs', titulo: 'Carga arriba', sim: 'q_sup', ec: '[pT] · [Bf]', unidad: 't/m', dec: 3, valor: r => r.g.rigidez[A ? 'flechaA' : 'flechaB'].qvMax, f: x => x.pT * x.Bf },
      { id: 'qi', titulo: 'Carga abajo', sim: 'q_inf', ec: '[p1] · [Bf]', unidad: 't/m', dec: 3, valor: r => r.g.rigidez[A ? 'flechaA' : 'flechaB'].qvMin, f: x => x.p1 * x.Bf },
      { id: 'qv', titulo: 'Carga repartida media', sim: 'q_v', ec: '([qs] + [qi]) / 2', unidad: 't/m', dec: 3, valor: r => r.g.rigidez[A ? 'flechaA' : 'flechaB'].qv, f: x => (x.qs + x.qi) / 2,
        nota: 'La guía toma el promedio de la carga de arriba y la de abajo como si fuera uniforme.' },
      { id: 'fadm', titulo: 'Flecha admisible', sim: 'f_adm', ec: '[Ht] / 500', unidad: 'm', dec: 3, valor: r => r.g.rigidez.fAdm, f: x => x.Ht / 500 },
      { id: 'fl', titulo: 'Flecha de la ménsula', sim: 'f', ec: '[qv] · [Ht]^{4} / (8 · [E] · [SJ])', unidad: 'm', dec: 3, valor: r => r.g.rigidez[A ? 'flechaA' : 'flechaB'].f, f: x => (x.qv * x.Ht ** 4) / (8 * x.E * x.SJ),
        control: { cond: '≤ [fadm]', ok: r => r.g.rigidez[A ? 'flechaA' : 'flechaB'].f <= r.g.rigidez.fAdm + 1e-12,
          siNo: [
            { texto: 'Más ΣJ: alargar los tabiques (J crece con el largo al cubo) o sumar piezas.', mueve: ['SJ', 'Jj'] },
            { texto: 'Mejor hormigón (más E).', mueve: ['E'] },
            { texto: 'La flecha crece con la altura a la cuarta: una torre más baja se mueve mucho menos.', mueve: ['Ht'] },
          ] },
        nota: 'La torre como una ménsula empotrada en la fundación con carga repartida: f = q·H⁴ / (8·E·J).', ref: 'guía 4.2' },
    ],
    detalle: (id, r) => {
      if (id !== 'Jj') return null;
      const ps = r.g.partes[dir].filter(x => x.pieza === (pzSel(r, s)?.nombre ?? s.pieza));
      const t = h('table', { class: 'tabla chica' });
      t.append(h('thead', {}, h('tr', {}, ...['Muro', 'papel', 'b (m)', 'h (m)', 'A (m²)', 'd (m)', 'J propio', 'A·d²'].map(x => h('th', {}, x)))));
      const tb = h('tbody');
      ps.forEach(x => tb.append(h('tr', {}, h('td', {}, x.muro), h('td', {}, x.papel), ...[[x.b, 2], [x.h, 2], [x.A, 3], [x.d, 2], [x.Jp, 3], [x.Ad2, 3]].map(([v, dd]) => h('td', { class: 'n' }, fmt(v, dd))))));
      t.append(tb);
      return h('div', { class: 'scroll' }, t);
    },
  };

  // ------------------------------------------------------------------------------------------ 4 · rototraslación
  const roto: CapituloGrafo<DatosGuia, RG> = {
    id: 'roto', titulo: '4 · Reparto entre piezas',
    intro: `Cuánto viento toma ${s.pieza}: una parte por su rigidez (traslación) y otra porque la planta gira si el centro de rigidez no está donde empuja el viento (rotación). Guía, «caso particular con rototraslación».`,
    params: [],
    nodos: [
      de('Qr', 'Q', 'Corte en PB', `del capítulo 1 (viento ${dir})`, r => r.g.roto[dir].Q, 1, 't'),
      de('Mr', 'M_PB', 'Momento en PB', 'del capítulo 1', r => r.g.roto[dir].MPB, 0, 'tm'),
      de('Jr', `J_${s.pieza}`, `J de ${s.pieza}`, 'del capítulo 3', r => pzSel(r, s)?.J, 3, 'm⁴'),
      de('SJr', 'ΣJ', 'Suma de los J', 'del capítulo 3', r => r.g.roto[dir].SJ, 2, 'm⁴'),
      de('tj', `t_${s.pieza}`, `Posición de ${s.pieza}`, 'de la planta (baricentro de la pieza)', r => pzSel(r, s)?.t, 2, 'm'),
      { id: 'Xr', titulo: 'Eje de inercia (centro de rigidez)', sim: 'X_r', ec: 'Σ [Jr] · [tj] / [SJr]', unidad: 'm', dec: 2, valor: r => r.g.roto[dir].Xr,
        nota: 'El promedio de las posiciones pesado por J: dónde habría que empujar para que la planta se corra sin girar. Con la planta simétrica cae en el eje.' },
      { id: 'Mt', titulo: 'Momento de rotación', sim: 'Mt', ec: '[Qr] · [Xr]', unidad: 'tm', dec: 1, valor: r => r.g.roto[dir].Mt, f: x => x.Qr * x.Xr,
        nota: 'El viento empuja en el eje de simetría (x = 0) y la planta resiste en Xr: la excentricidad es Xr y el viento hace girar la planta con Q · e.' },
      { id: 'a', titulo: `Brazo de ${s.pieza} al eje de inercia`, sim: `a_${s.pieza}`, ec: '[tj] − [Xr]', unidad: 'm', dec: 2, valor: r => pzSel(r, s)?.a, f: x => x.tj - x.Xr },
      { id: 'SJa2', titulo: 'Rigidez a la rotación', sim: 'ΣJ·a²', ec: 'Σ [Jr] · [a]² + Σ J_⊥ · a_⊥²', unidad: 'm⁶', dec: 1, valor: r => r.g.roto[dir].SJa2,
        nota: 'Los muros lejos del centro de rigidez resisten mucho el giro (a²). Los perpendiculares al viento también suman, con su J propio.' },
      { id: 'tras', titulo: 'Traslación', sim: 'Q_tras', ec: '[Qr] · [Jr] / [SJr]', unidad: 't', dec: 2, valor: r => pzSel(r, s)?.tras, f: x => (x.Qr * x.Jr) / x.SJr,
        nota: 'Todas las piezas se corren lo mismo: cada una toma en proporción a su J.' },
      { id: 'rot', titulo: 'Rotación', sim: 'Q_rot', ec: '− [Mt] · [Jr] · [a] / [SJa2]', unidad: 't', dec: 2, valor: r => pzSel(r, s)?.rot, f: x => (-x.Mt * x.Jr * x.a) / x.SJa2,
        nota: 'El giro mueve más a las piezas lejos del eje de inercia. Del lado donde empuja el viento se suma; del otro, se resta.' },
      { id: 'Qj', titulo: `Corte de ${s.pieza}`, sim: `Q_${s.pieza}`, ec: '[tras] + [rot]', unidad: 't', dec: 2, valor: r => pzSel(r, s)?.Q, f: x => x.tras + x.rot },
      { id: 'Mj', titulo: `Momento de ${s.pieza} en PB`, sim: `M_${s.pieza}`, ec: '[Mr] · [Qj] / [Qr]', unidad: 'tm', dec: 1, valor: r => pzSel(r, s)?.M, f: x => (x.Mr * x.Qj) / x.Qr,
        nota: 'La pieza toma del momento la misma parte que del corte. Con este momento se verifica en el capítulo 5.' },
    ],
  };

  // ------------------------------------------------------------------------------------------ 5 · flexocompresión
  const fx0 = flexoSel({ g: calcularGuiaPasos(d0), d: d0 }, s);
  const flexo: CapituloGrafo<DatosGuia, RG> = {
    id: 'flexo', titulo: '5 · Tensiones y armadura',
    intro: `El muro ${fx0?.muro ?? s.muro} (${fx0?.papel ?? 'alma'} de ${s.pieza}) en PB: la carga lo comprime y el momento lo tracciona de un lado y lo comprime del otro (guía 5). Rojo: tracción; azul: compresión.`,
    params: [
      dato('gH', 'γ_H', 'peso del hormigón', d => d.coef, 'gH', 2, 2.6, 0.05, 2, 't/m³'),
      dato('qDf', 'q_D', 'peso de losa sin sobrecarga', d => d.coef, 'qD', 0.4, 1.6, 0.05, 2, 't/m²'),
      dato('qCf', 'q_C', 'peso de losa con sobrecarga', d => d.coef, 'qC', 0.5, 2, 0.05, 2, 't/m²'),
      dato('sE', 'σ_e', 'tensión del acero', d => d.coef, 'sigE', 1500, 5000, 100, 0, 'kg/cm²', 'guía: 2400 kg/cm²'),
      dato('cu', 'ρ_mín', 'cuantía mínima', d => d.coef, 'cuantia', 0.0025, 0.02, 0.0005, 4, '', 'guía: 0,8 %'),
    ],
    nodos: [
      de('Mf', `M_${s.pieza}`, `Momento de ${s.pieza}`, 'del capítulo 4', r => flexoSel(r, s)?.M, 1, 'tm'),
      de('Jf', `J_${s.pieza}`, `J de ${s.pieza}`, 'del capítulo 3', r => flexoSel(r, s)?.J, 3, 'm⁴'),
      de('Am', 'A', `Área de ${fx0?.muro ?? 'el muro'}`, 'de la planta', r => flexoSel(r, s)?.A, 3, 'm²'),
      de('alt', 'h_m', 'Altura del muro sobre PB', 'de la planta', r => flexoSel(r, s)?.altura, 2, 'm'),
      de('Ai', 'A_inf', 'Área de losa que carga', 'de la planta × losas', r => { const x = flexoSel(r, s); return x ? x.losaD / r.d.coef.qD : null; }, 1, 'm²'),
      de('y', 'y', 'Fibra más alejada', 'de la sección', r => { const x = flexoSel(r, s); return x ? (x.papel === 'ala' ? Math.abs(x.d) : Math.max(Math.abs(x.y1), Math.abs(x.y2))) : null; }, 2, 'm'),
      { id: 'Pp', titulo: 'Peso propio del muro', sim: 'P_p', ec: '[Am] · [alt] · [gH]', unidad: 't', dec: 1, valor: r => flexoSel(r, s)?.Pp, f: x => x.Am * x.alt * x.gH },
      { id: 'Nd', titulo: 'Carga sin sobrecarga', sim: 'N_D', ec: '[Pp] + [qDf] · [Ai]', unidad: 't', dec: 1, valor: r => flexoSel(r, s)?.Nd, f: x => x.Pp + x.qDf * x.Ai,
        nota: 'Para la tracción conviene la carga más chica: la que menos comprime.' },
      { id: 'Nc', titulo: 'Carga con sobrecarga', sim: 'N_C', ec: '[Pp] + [qCf] · [Ai]', unidad: 't', dec: 1, valor: r => flexoSel(r, s)?.Nc, f: x => x.Pp + x.qCf * x.Ai,
        nota: 'Para la compresión, la más grande.' },
      { id: 'sM', titulo: 'Tensión por el momento', sim: 'σ_M', ec: '[Mf] · [y] / [Jf] / 10', unidad: 'kg/cm²', dec: 2, valor: r => { const x = flexoSel(r, s); return x ? x.sigM / 10 : null; }, f: x => (x.Mf * x.y) / x.Jf / 10,
        nota: 'Navier: M·y/J en la fibra más alejada del baricentro de la pieza. El muro trabaja como parte de la pieza entera.' },
      { id: 'st', titulo: 'Fibra traccionada (sin sobrecarga)', sim: 'σ_t', ec: '− [Nd] / [Am] / 10 + [sM]', unidad: 'kg/cm²', dec: 2, valor: r => flexoSel(r, s)?.traccion, f: x => -x.Nd / x.Am / 10 + x.sM, tension: 'traccion',
        nota: 'Si da positiva, el hormigón está traccionado: no la aguanta y hace falta armadura.' },
      { id: 'sc', titulo: 'Fibra comprimida (con sobrecarga)', sim: 'σ_c', ec: '− [Nc] / [Am] / 10 − [sM]', unidad: 'kg/cm²', dec: 2, valor: r => flexoSel(r, s)?.compresion, f: x => -x.Nc / x.Am / 10 - x.sM, tension: 'compresion',
        control: { cond: '|σ_c| ≤ [sbk]', ok: r => { const x = flexoSel(r, s); return x ? x.verifica : null; },
          siNo: [
            { texto: 'Engrosar el muro: más área, menos N/A.', mueve: ['Am'] },
            { texto: 'Alargar la pieza o sumarle alas: más J, menos tensión por el momento.', mueve: ['Jf'] },
            { texto: 'Que la pieza tome menos viento: más rigidez en las otras (capítulo 4).', mueve: ['Mf'] },
          ] },
        nota: 'La compresión del hormigón no puede pasar la tensión de rotura de la guía (σbk = 10 · el número del hormigón).' },
      { id: 'sbk', titulo: 'Compresión admisible', sim: 'σ_bk', ec: '10 · H', unidad: 'kg/cm²', dec: 0, valor: r => r.g.sigAdm, nota: `Para ${d0.hormigon}: ${fmt(calcularGuiaPasos(d0).sigAdm, 0)} kg/cm².` },
      { id: 'T', titulo: 'Fuerza de tracción', sim: 'T', ec: '[st] · b · x / 2', unidad: 't', dec: 2, valor: r => flexoSel(r, s)?.T,
        nota: 'El volumen del triángulo de tracciones: σ_t por el espesor por la zona traccionada x, sobre dos (en kg/cm² × cm², pasado a t).' },
      { id: 'As', titulo: 'Armadura por cálculo', sim: 'A_s', ec: '[T] · 1000 / [sE]', unidad: 'cm²', dec: 2, valor: r => flexoSel(r, s)?.As, f: x => (x.T * 1000) / x.sE,
        nota: 'La tracción la toma el acero.' },
      { id: 'Asm', titulo: 'Armadura mínima', sim: 'A_smín', ec: '[cu] · [Am] · 10^{4}', unidad: 'cm²', dec: 1, valor: r => flexoSel(r, s)?.AsMin, f: x => x.cu * x.Am * 1e4 },
      { id: 'Asu', titulo: 'Armadura a colocar', sim: 'A_s,usar', ec: 'máx([As], [Asm])', unidad: 'cm²', dec: 1, valor: r => { const x = flexoSel(r, s); return x ? Math.max(x.As, x.AsMin) : null; }, f: x => Math.max(x.As, x.Asm),
        nota: 'Se reparte en dos capas a lo largo del muro (Ø y separación en la etapa Flexión).' },
    ],
  };

  sectorizar(viento, { 'Presión del viento': ['Kz', 'qh', 'pb', 'ps', 'p'], 'Fuerza en cada nivel': ['Wi', 'WPB'], 'Corte': ['Q'], 'Momento y resultante': ['MPB', 'hw', 'Mv'] });
  sectorizar(estab, { 'Peso': ['P'], 'Vuelco': ['MvE', 'Me', 'FS'], 'Excentricidad': ['e', 'b6'], 'Presión en el suelo': ['sN', 'sM', 'smax'] });
  sectorizar(rig, { 'Inercia de las piezas': ['Jj', 'SJ'], 'J mínimo': ['WR', 'Jmin'], 'Carga repartida': ['pT', 'p1', 'qs', 'qi', 'qv'], 'Flecha': ['fadm', 'fl'] });
  sectorizar(roto, { 'Centro de rigidez': ['Jr', 'SJr', 'tj', 'Xr', 'a', 'SJa2'], 'Momento de rotación': ['Qr', 'Mt'], 'Traslación y rotación': ['tras', 'rot'], 'Corte y momento de la pieza': ['Qj', 'Mr', 'Mj'] });
  sectorizar(flexo, { 'Cargas del muro': ['Am', 'alt', 'Ai', 'Pp', 'Nd', 'Nc'], 'Momento': ['Mf', 'Jf', 'y', 'sM'], 'Tensiones': ['st', 'sc', 'sbk'], 'Armadura': ['T', 'As', 'Asm', 'Asu'] });
  return {
    datos: () => structuredClone(d0),
    calcular: d => ({ g: calcularGuiaPasos(d), d }),
    capitulos: [viento, estab, rig, roto, flexo],
  };
}
