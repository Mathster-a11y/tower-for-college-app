/**
 * Las cuentas de la planilla de la cátedra (hojas «viento», «M,NyQ», «J», «Rototrasl.» y «Flex comp PB»), como grafo
 * de fórmulas. Los valores salen del motor de la planilla (calcularPlanilla), que replica la planilla celda por celda:
 * al arrastrar un dato se recalcula la planilla entera. Las planillas originales no se cambian: donde hacen algo
 * distinto de la guía, la nota lo explica.
 */
import { calcularPlanilla, DIVISORES, type PlanillaDatos, type PlanillaRes } from '../../engine/planilla';
import type { Motor } from '../../engine/config';
import type { PiezaEquivalente } from '../../engine/mapping';
import { sectorizar, type CapituloGrafo, type Grafo, type NodoGrafo, type ParamGrafo } from '../grafo';
import { h, type H } from '../comp';
import { fmt } from '../estado';

export interface RP { res: PlanillaRes; d: PlanillaDatos }
export interface SelPlanilla { dir: 'A' | 'B'; pieza: string }

const dato = (id: string, sim: string, nombre: string, clave: keyof PlanillaDatos['viento'], min: number, max: number, paso: number, dec: number, unidad?: string, fuente?: string): ParamGrafo<PlanillaDatos> =>
  ({ id, sim, nombre, unidad, dec, min, max, paso, fuente, get: d => d.viento[clave] as number, set: (d, x) => { (d.viento[clave] as number) = x; } });
const fijo = (id: string, sim: string, nombre: string, get: (d: PlanillaDatos) => number, dec: number, unidad?: string, fuente?: string): ParamGrafo<PlanillaDatos> =>
  ({ id, sim, nombre, unidad, dec, fuente, get, set: () => undefined, min: 0, max: 0, paso: 0, fijo: true });
const de = (id: string, sim: string, titulo: string, externo: string, valor: (r: RP) => number | null | undefined, dec: number, unidad?: string): NodoGrafo<RP> =>
  ({ id, sim, titulo, ec: '', externo, valor, dec, unidad });

/** fila de la azotea en las hojas «viento» y «M,NyQ» (la de mayor qz) */
const filaAzotea = (r: RP) => { let k = 0; r.res.viento.qz.slice(0, 51).forEach((q, i) => { if (q > r.res.viento.qz[k]) k = i; }); return k; };

export function grafoPlanilla(datos: PlanillaDatos, piezas: PiezaEquivalente[], filaPB: number, hormigon: string, motor: Motor, s: SelPlanilla): Grafo<PlanillaDatos, RP> {
  const dir = s.dir, A = dir === 'A';
  const pz = piezas.find(x => x.dir === dir && x.nombre === s.pieza && x.filaHoja !== null) ?? piezas.find(x => x.dir === dir && x.filaHoja !== null);
  const i = pz?.filaHoja ?? 0;
  const rot = (r: RP) => (A ? r.res.rotA : r.res.rotB);
  const QPB = (r: RP) => (A ? r.res.mnyq.I[filaPB] : r.res.mnyq.N[filaPB]);
  const MPB = (r: RP) => (A ? r.res.mnyq.J[filaPB] : r.res.mnyq.O[filaPB]);
  const filaDiv = DIVISORES.find(x => x[0] === hormigon) ?? DIVISORES[0], div = filaDiv[2];
  const calc = (d: PlanillaDatos) => calcularPlanilla(d, { motor });
  const r0: RP = { res: calc(datos), d: datos };
  const k0 = filaAzotea(r0);

  // ------------------------------------------------------------------------------------------ 1 · viento
  const viento: CapituloGrafo<PlanillaDatos, RP> = {
    id: 'viento', titulo: '1 · Viento y fuerzas',
    intro: `Hojas «viento» y «M,NyQ» de la planilla: la presión nivel por nivel con el CIRSOC 102-2005 y las fuerzas, el corte y el momento. Viento ${dir}. Diferencias con la guía: Kz con la altura real también debajo de 5 m, y viento también en la franja de PB.`,
    params: [
      dato('V', 'V', 'velocidad básica del viento', 'V', 20, 80, 1, 0, 'm/s', 'viento!J3'),
      dato('I', 'I', 'factor de importancia', 'I', 0.77, 1.15, 0.01, 2),
      dato('Kd', 'Kd', 'factor de direccionalidad', 'Kd', 0.5, 1, 0.01, 2),
      dato('Kzt', 'Kzt', 'factor topográfico', 'Kzt', 1, 2, 0.01, 2),
      dato('zg', 'zg', 'altura gradiente', 'zg', 200, 500, 5, 0, 'm'),
      dato('alfa', 'α', 'exponente de la ley potencial', 'alfa', 5, 12, 0.1, 1),
      dato('G', 'G', 'factor de ráfaga', 'G', 0.7, 1.5, 0.01, 2, '', 'la planilla: 0,85'),
      dato('Cpb', 'Cp_b', 'coeficiente a barlovento', 'Cpb', 0.5, 1, 0.05, 2),
      dato('Cps', 'Cp_s', 'coeficiente a sotavento (negativo: succión)', 'Cps', -1, 0, 0.05, 2),
      fijo('z', 'z', 'cota de la azotea', d => d.viento.Z[k0] ?? 0, 2, 'm', 'viento!B'),
      fijo('B', A ? 'B' : 'L', 'ancho de la cara', () => (A ? r0.res.mnyq.E[k0] : r0.res.mnyq.F[k0]), 2, 'm', 'M,NyQ!E y F'),
      fijo('D', 'D', 'altura de influencia del nivel', () => r0.res.mnyq.D[k0], 2, 'm', 'M,NyQ!D'),
    ],
    nodos: [
      { id: 'Kz', titulo: 'Exposición en la azotea', sim: 'Kz', ec: '2,01 · ([z] / [zg])^{2 / [alfa]}', dec: 3, valor: r => r.res.viento.Kz[filaAzotea(r)], f: x => 2.01 * Math.pow(x.z / x.zg, 2 / x.alfa), ref: 'viento!C' },
      { id: 'qz', titulo: 'Presión dinámica en la azotea', sim: 'qh', ec: '0,613 · [Kz] · [Kzt] · [Kd] · [V]² · [I]', unidad: 'N/m²', dec: 0, valor: r => r.res.viento.qh, f: x => 0.613 * x.Kz * x.Kzt * x.Kd * x.V ** 2 * x.I, ref: 'viento!D y N4' },
      { id: 'pb', titulo: 'Barlovento', sim: 'p_b', ec: '[qz] · [G] · [Cpb]', unidad: 'N/m²', dec: 0, valor: r => r.res.viento.P[filaAzotea(r)], f: x => x.qz * x.G * x.Cpb, ref: 'viento!P' },
      { id: 'ps', titulo: 'Sotavento', sim: 'p_s', ec: '[qz] · [G] · [Cps]', unidad: 'N/m²', dec: 0, valor: r => r.res.viento.Q[filaAzotea(r)], f: x => x.qz * x.G * x.Cps, ref: 'viento!Q' },
      { id: 'p', titulo: 'Presión neta', sim: 'p', ec: '([pb] − [ps]) / 10 000', unidad: 't/m²', dec: 4, valor: r => r.res.viento.S[filaAzotea(r)], f: x => (x.pb - x.ps) / 10000, ref: 'viento!S' },
      { id: 'Wi', titulo: 'Fuerza en el nivel (azotea)', sim: 'W_i', ec: '[D] · [B] · [p]', unidad: 't', dec: 2, valor: r => (A ? r.res.mnyq.H[filaAzotea(r)] : r.res.mnyq.D[filaAzotea(r)] * r.res.mnyq.F[filaAzotea(r)] * r.res.mnyq.G[filaAzotea(r)]), f: x => x.D * x.B * x.p, ref: A ? 'M,NyQ!H' : 'M,NyQ (cara menor)' },
      { id: 'Q', titulo: 'Corte en PB', sim: 'Q_PB', ec: 'Σ [Wi]', unidad: 't', dec: 1, valor: QPB, ref: A ? 'M,NyQ!I' : 'M,NyQ!N' },
      { id: 'M', titulo: 'Momento en PB', sim: 'M_PB', ec: 'Σ [Q]_i · Δz', unidad: 'tm', dec: 0, valor: MPB, ref: A ? 'M,NyQ!J' : 'M,NyQ!O', nota: 'Cada piso suma el corte de arriba por su altura.' },
      { id: 'Mv', titulo: 'Momento de vuelco', sim: 'Mv', ec: '[M] + Σ Q · Δz (subsuelos)', unidad: 'tm', dec: 0, valor: r => (A ? r.res.mnyq.J61 : r.res.mnyq.O61), ref: A ? 'M,NyQ!J61' : 'M,NyQ!O61' },
    ],
  };

  // ------------------------------------------------------------------------------------------ 2 · estabilidad
  const estab: CapituloGrafo<PlanillaDatos, RP> = {
    id: 'estabilidad', titulo: '2 · Vuelco y suelo',
    intro: 'Hoja «M,NyQ», filas 61 a 99: el peso con 0,7 t/m², el vuelco con Me/Mv ≥ 1,5, la excentricidad contra el núcleo central y las tensiones en el suelo. Viento A.',
    params: [
      { id: 'b1', sim: 'b_1', nombre: 'lado de la fundación paralelo al viento', unidad: 'm', dec: 2, min: 5, max: 60, paso: 0.5, fuente: 'M,NyQ!N80', get: d => d.mnyq.b1 ?? 0, set: (d, x) => { d.mnyq.b1 = x; } },
      { id: 'a1', sim: 'a_1', nombre: 'lado de la fundación perpendicular', unidad: 'm', dec: 2, min: 5, max: 60, paso: 0.5, fuente: 'M,NyQ!N81', get: d => d.mnyq.a1 ?? 0, set: (d, x) => { d.mnyq.a1 = x; } },
      fijo('At', 'A_t', 'suma de las áreas de las plantas', () => r0.res.mnyq.M61 / 0.7, 0, 'm²', 'M,NyQ!K'),
    ],
    nodos: [
      de('Mv', 'Mv', 'Momento de vuelco', 'del capítulo 1', r => r.res.mnyq.J61, 0, 'tm'),
      { id: 'P', titulo: 'Peso de la torre', sim: 'P', ec: '0,7 · [At]', unidad: 't', dec: 0, valor: r => r.res.mnyq.M61, f: x => 0.7 * x.At, ref: 'M,NyQ!M61' },
      { id: 'Me', titulo: 'Momento estabilizante', sim: 'Me', ec: '[P] · [b1] / 2', unidad: 'tm', dec: 0, valor: r => r.res.mnyq.K99, f: x => (x.P * x.b1) / 2, ref: 'M,NyQ!K99' },
      { id: 'FS', titulo: 'Seguridad al vuelco', sim: 'Me/Mv', ec: '[Me] / [Mv]', dec: 2, valor: r => r.res.mnyq.L99, f: x => x.Me / x.Mv, ref: 'M,NyQ!L99',
        control: { cond: '≥ 1,5', ok: r => r.res.mnyq.L99 >= 1.5, siNo: [{ texto: 'Agrandar b1 (el brazo del peso).', mueve: ['b1'] }, { texto: 'Más peso: subsuelos o platea.', mueve: ['P'] }] } },
      { id: 'e', titulo: 'Excentricidad', sim: 'e', ec: '[Mv] / [P]', unidad: 'm', dec: 2, valor: r => r.res.mnyq.M99, f: x => x.Mv / x.P, ref: 'M,NyQ!M99',
        control: { cond: '≤ [b6]', ok: r => r.res.mnyq.M99 <= r.res.mnyq.N99 + 1e-9, siNo: [{ texto: 'Agrandar b1: crece el núcleo central.', mueve: ['b1'] }] } },
      { id: 'b6', titulo: 'Núcleo central', sim: 'b_1/6', ec: '[b1] / 6', unidad: 'm', dec: 2, valor: r => r.res.mnyq.N99, f: x => x.b1 / 6, ref: 'M,NyQ!N99' },
      { id: 'sN', titulo: 'Tensión por la carga (cargada, × 9/7)', sim: 'σ_N', ec: '[P] · 9/7 / ([a1] · [b1]) / 10', unidad: 'kg/cm²', dec: 2, valor: r => -r.res.mnyq.N86, f: x => (x.P * 9 / 7) / (x.a1 * x.b1) / 10, tension: 'compresion', ref: 'M,NyQ!N86',
        nota: 'La planilla pasa de 0,7 a 0,9 t/m² multiplicando el peso por 9/7.' },
      { id: 'sM', titulo: 'Tensión por el momento', sim: 'σ_M', ec: '6 · [Mv] / ([a1] · [b1]²) / 10', unidad: 'kg/cm²', dec: 2, valor: r => -r.res.mnyq.N87, f: x => (6 * x.Mv) / (x.a1 * x.b1 ** 2) / 10, ref: 'M,NyQ!N87' },
      { id: 'smax', titulo: 'Presión máxima en el suelo', sim: 'σ_máx', ec: '[sN] + [sM]', unidad: 'kg/cm²', dec: 2, valor: r => -r.res.mnyq.N89, f: x => x.sN + x.sM, tension: 'compresion', ref: 'M,NyQ!N89',
        nota: 'La planilla no la compara con el suelo: se compara a mano con la σadm del estudio de suelos (la guía y la app sí lo hacen).' },
    ],
  };

  // ------------------------------------------------------------------------------------------ 3 · rigidez
  const hojaJ = (r: RP) => (A ? r.res.jpar : r.res.jort), jmin = (r: RP) => (A ? r.res.jminA : r.res.jminB);
  const rig: CapituloGrafo<PlanillaDatos, RP> = {
    id: 'rigidez', titulo: '3 · Rigidez',
    intro: `Hojas «J Tabiques ${A ? 'paralelos' : 'ortogonales'}»: cada pieza se lleva a un molde (rectángulo, T, doble T, U) y su J sale de la fórmula del molde. La suma tiene que alcanzar el J mínimo de la tabla para que la azotea no se corra más de h/500. Pieza elegida: ${pz?.nombre ?? '—'} (fila ${i + 4}).`,
    params: [
      fijo('h', 'h', 'altura para el J mínimo', () => jmin(r0).h, 2, 'm', A ? 'MAX(M,NyQ!B4:B43)' : 'M,NyQ!G69'),
      fijo('k', '8E/500', `divisor de la tabla (${filaDiv[0]}, h/500)`, () => div, 0, 't/m²', 'tabla de la hoja J'),
    ],
    nodos: [
      de('W', 'W', 'Viento total', 'del capítulo 1', r => jmin(r).W, 1, 't'),
      { id: 'Jj', titulo: `J de ${pz?.nombre ?? 'la pieza'} (molde)`, sim: `J_${pz?.nombre ?? 'j'}`, ec: 'J del molde (b, h, alas)', unidad: 'm⁴', dec: 3, valor: r => hojaJ(r).filas[i]?.AY,
        nota: 'La planilla no suma muro por muro: arma el molde con las medidas que se cargan en la fila (alto, ancho y alas) y aplica su fórmula. La guía y la app usan la sección real con Steiner.', ref: `columna AY, fila ${i + 4}` },
      { id: 'SJ', titulo: 'Suma de los J', sim: 'ΣJ', ec: 'Σ [Jj]', unidad: 'm⁴', dec: 2, valor: r => hojaJ(r).AY24, ref: 'AY24',
        control: { cond: '≥ [Jmin]', ok: r => hojaJ(r).AY24 >= jmin(r).tabla.find(x => x.hormigon === filaDiv[0])!.h500 - 1e-9,
          siNo: [{ texto: 'Alargar los tabiques (J crece con el largo al cubo) o sumar piezas.', mueve: ['Jj'] }, { texto: 'Mejor hormigón: el divisor de la tabla crece con E.', mueve: ['k'] }] } },
      { id: 'Jmin', titulo: 'J mínimo (h/500)', sim: 'J_mín', ec: '[W] · [h]² / [k]', unidad: 'm⁴', dec: 2, valor: r => jmin(r).tabla.find(x => x.hormigon === filaDiv[0])?.h500, f: x => (x.W * x.h ** 2) / x.k,
        nota: 'De f = W·h³ / (8·E·J) ≤ h/500: J ≥ W·h² / (8·E/500). La tabla trae el divisor 8E/500 para cada hormigón.' },
    ],
  };

  // ------------------------------------------------------------------------------------------ 4 · rototraslación
  const roto: CapituloGrafo<PlanillaDatos, RP> = {
    id: 'roto', titulo: '4 · Rototraslación',
    intro: `Hoja «Rototrasl. ${A ? 'cara mayor' : 'cara menor'}», fila ${i + 5} (${pz?.nombre ?? '—'}): la parte del viento por traslación y la de rotación. Ojo: la planilla suma la rotación (una fuerza) al momento de traslación; la guía corrige las unidades.`,
    params: [fijo('Hj', `H_${pz?.nombre ?? 'j'}`, 'posición de la pieza (columna H)', d => (A ? d.rotA.H[i] : d.rotB.H[i]) ?? 0, 2, 'm', `H${i + 5}`)],
    nodos: [
      de('Q', 'Q', 'Corte', 'del capítulo 1 (D5)', r => rot(r).D5, 1, 't'),
      de('Mv', 'Mv', 'Momento', 'del capítulo 1 (F5)', r => rot(r).F5, 0, 'tm'),
      de('Jj', `J_${pz?.nombre ?? 'j'}`, 'J de la pieza', 'del capítulo 3 (B)', r => rot(r).B[i], 3, 'm⁴'),
      de('SJ', 'ΣJ', 'Suma de los J', 'del capítulo 3 (B25)', r => rot(r).B25, 2, 'm⁴'),
      { id: 'Xr', titulo: 'Eje de inercia', sim: 'X_r', ec: 'Σ [Jj] · [Hj] / [SJ]', unidad: 'm', dec: 2, valor: r => rot(r).J7, ref: 'J7' },
      { id: 'Mt', titulo: 'Momento de rotación', sim: 'Mt', ec: '[Q] · [Xr]', unidad: 'tm', dec: 1, valor: r => rot(r).J15, f: x => x.Q * x.Xr, ref: 'J15' },
      { id: 'a', titulo: 'Brazo al eje de inercia', sim: 'a', ec: '[Hj] − [Xr]', unidad: 'm', dec: 2, valor: r => rot(r).K[i], f: x => x.Hj - x.Xr, ref: `K${i + 5}` },
      { id: 'SJa2', titulo: 'Rigidez a la rotación', sim: 'ΣJ·a²', ec: 'Σ [Jj] · [a]² (paralelas y perpendiculares)', unidad: 'm⁶', dec: 1, valor: r => rot(r).M51, ref: 'M51' },
      { id: 'C', titulo: 'Parte por traslación', sim: 'C', ec: '[Jj] / [SJ]', dec: 4, valor: r => rot(r).C[i], f: x => x.Jj / x.SJ, ref: `C${i + 5}` },
      { id: 'E', titulo: 'Corte por traslación', sim: 'Q_tras', ec: '[C] · [Q]', unidad: 't', dec: 2, valor: r => rot(r).E[i], f: x => x.C * x.Q, ref: `E${i + 5}` },
      { id: 'Gm', titulo: 'Momento por traslación', sim: 'M_tras', ec: '[C] · [Mv]', unidad: 'tm', dec: 1, valor: r => rot(r).G[i], f: x => x.C * x.Mv, ref: `G${i + 5}` },
      { id: 'N', titulo: 'Rotación', sim: 'Q_rot', ec: '− [Mt] · [Jj] · [a] / [SJa2]', unidad: 't', dec: 2, valor: r => rot(r).N[i], f: x => (-x.Mt * x.Jj * x.a) / x.SJa2, ref: `N${i + 5}` },
      { id: 'O', titulo: 'Momento de la pieza (planilla)', sim: `M_${pz?.nombre ?? 'j'}`, ec: '[Gm] + [N]', unidad: 'tm', dec: 1, valor: r => rot(r).O[i], f: x => x.Gm + x.N, ref: `O${i + 5}`,
        nota: 'La planilla suma la rotación (t) al momento por traslación (tm). Con la planta simétrica no importa (la rotación es casi 0); con excentricidad, la guía hace M = M_PB · (Q_tras + Q_rot) / Q.' },
    ],
  };

  // ------------------------------------------------------------------------------------------ 5 · flexocompresión (solo viento A)
  const flex: CapituloGrafo<PlanillaDatos, RP> = {
    id: 'flexo', titulo: '5 · Tensiones en PB',
    intro: A ? `Hoja «Flex comp PB paralelos», fila ${i + 4} (${pz?.nombre ?? '—'}): la pieza entera en PB, con su área y su módulo resistente W. Rojo: tracción; azul: compresión.` : 'La planilla verifica la flexocompresión solo con el viento A. Elegí el viento A arriba.',
    params: A ? [fijo('F', 'F', 'área de la pieza', () => r0.res.flex.B[i], 3, 'm²', `B${i + 4}`), fijo('W', 'W', 'módulo resistente (J / y)', () => r0.res.flex.W[i], 3, 'm³', 'de la hoja J')] : [],
    nodos: A ? [
      de('M', `M_${pz?.nombre ?? 'j'}`, 'Momento de la pieza', 'del capítulo 4 (O)', r => r.res.flex.J[i], 1, 'tm'),
      de('Pp', 'P_p', 'Peso propio', 'F · altura · 2,4 (columna E)', r => r.res.flex.E[i], 1, 't'),
      de('Ai', 'A_inf · n', 'Área de losa por pisos', 'columnas F y G', r => (r.d.flex[i]?.F ?? 0) * (r.d.flex[i]?.G ?? 0), 1, 'm²'),
      { id: 'H', titulo: 'Carga con 0,7 t/m²', sim: 'N_0,7', ec: '[Pp] + [Ai] · 0,7', unidad: 't', dec: 1, valor: r => r.res.flex.H[i], f: x => x.Pp + x.Ai * 0.7, ref: `H${i + 4}` },
      { id: 'I', titulo: 'Carga con 0,9 t/m²', sim: 'N_0,9', ec: '[Pp] + [Ai] · 0,9', unidad: 't', dec: 1, valor: r => r.res.flex.I[i], f: x => x.Pp + x.Ai * 0.9, ref: `I${i + 4}` },
      { id: 'O', titulo: 'Borde comprimido', sim: 'σ_c', ec: '(− [H] / [F] − [M] / [W]) · 0,1', unidad: 'kg/cm²', dec: 2, valor: r => r.res.flex.O[i], f: x => (-x.H / x.F - x.M / x.W) * 0.1, tension: 'compresion', ref: `O${i + 4}`,
        control: { cond: '|σ_c| ≤ 10 · H', ok: r => Math.abs(Math.min(0, r.res.flex.O[i])) <= (parseFloat(hormigon.replace(/[^\d.]/g, '')) || 30) * 10,
          siNo: [{ texto: 'Más área (muros más gruesos) o más W (pieza más larga o con alas).', mueve: ['F', 'W'] }, { texto: 'Que la pieza tome menos momento (capítulo 4).', mueve: ['M'] }] },
        nota: 'La planilla combina la compresión con la carga de 0,7 t/m² (sin sobrecarga). La guía la hace con la de 0,9, que comprime más: lo más desfavorable.' },
      { id: 'P', titulo: 'Borde traccionado', sim: 'σ_t', ec: '(− [I] / [F] + [M] / [W]) · 0,1', unidad: 'kg/cm²', dec: 2, valor: r => r.res.flex.P[i], f: x => (-x.I / x.F + x.M / x.W) * 0.1, tension: 'traccion', ref: `P${i + 4}`,
        nota: 'Si da positiva hay tracción y hace falta armadura. La planilla usa la carga de 0,9 (la guía, la de 0,7, que comprime menos y deja más tracción).' },
    ] : [],
  };

  sectorizar(viento, { 'Presión del viento': ['Kz', 'qz', 'pb', 'ps', 'p'], 'Fuerza en cada nivel': ['Wi'], 'Corte': ['Q'], 'Momento': ['M', 'Mv'] });
  sectorizar(estab, { 'Peso': ['P'], 'Vuelco': ['Mv', 'Me', 'FS'], 'Excentricidad': ['e', 'b6'], 'Presión en el suelo': ['sN', 'sM', 'smax'] });
  sectorizar(rig, { 'Inercia (molde)': ['Jj', 'SJ'], 'J mínimo': ['W', 'Jmin'] });
  sectorizar(roto, { 'Centro de rigidez': ['Jj', 'SJ', 'Xr', 'a', 'SJa2'], 'Traslación': ['C', 'E', 'Mv', 'Gm'], 'Rotación': ['Q', 'Mt', 'N'], 'Momento de la pieza': ['O'] });
  sectorizar(flex, { 'Cargas': ['Pp', 'Ai', 'H', 'I'], 'Tensiones': ['M', 'O', 'P'] });
  return {
    datos: () => structuredClone(datos),
    calcular: d => ({ res: calc(d), d }),
    capitulos: [viento, estab, rig, roto, flex],
  };
}

export function tablaNivelesPlanilla(r: RP): H {
  const t = h('table', { class: 'tabla chica' });
  t.append(h('thead', {}, h('tr', {}, ...['fila', 'z (m)', 'Kz', 'qz (N/m²)', 'p (t/m²)', 'W (t)', 'Q (t)', 'M (tm)'].map(x => h('th', {}, x)))));
  const tb = h('tbody');
  r.res.mnyq.B.forEach((z, k) => { if (k > 50 || !r.res.viento.qz[k]) return; tb.append(h('tr', {}, h('td', {}, String(k + 4)), ...[[z, 2], [r.res.viento.Kz[k], 3], [r.res.viento.qz[k], 0], [r.res.viento.S[k], 4], [r.res.mnyq.H[k], 2], [r.res.mnyq.I[k], 2], [r.res.mnyq.J[k], 0]].map(([v, d]) => h('td', { class: 'n' }, fmt(v, d))))); });
  t.append(tb);
  return h('div', { class: 'scroll' }, t);
}
