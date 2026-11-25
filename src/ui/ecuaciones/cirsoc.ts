/**
 * Las cuentas de los métodos CIRSOC y FEM como grafo de fórmulas: el viento del 102-25 (exposición, presión dinámica,
 * frecuencia y ráfaga), el vuelco con las combinaciones del 101-25, el reparto entre piezas (rototraslación o modelo)
 * y la resistencia de cada muro con el 201 (el modelo simple de dos cordones, la compresión con el método empírico y
 * la cuantía necesaria del diagrama de interacción). El FEM agrega su capítulo del modelo: la frecuencia del análisis
 * modal, que cambia la ráfaga y con ella todo lo demás.
 * Los valores salen de calcularProyecto: al arrastrar un dato se recalcula el proyecto entero con ese método.
 */
import { calcularProyecto, type Calculo } from '../estado';
import { losasDeNivel, type Proyecto } from '../../engine/modelo';
import { EXPOSICIONES, KN_POR_T, viento102, type Viento102 } from '../../engine/cargas/cirsoc102';
import { datos101De } from '../../engine/cargas/cirsoc101';
import { vuelco102 } from '../../engine/metodos/cirsoc';
import { fcDe, FY, N_POR_T } from '../../engine/verificacion/cirsoc201';
import { sectorizar, type CapituloGrafo, type Grafo, type NodoGrafo, type ParamGrafo } from '../grafo';

export interface RC { c: Calculo; p: Proyecto; w: Viento102; vu: ReturnType<typeof vuelco102>; aprox: Viento102 | null }
export interface SelCirsoc { dir: 'A' | 'B'; pieza: string; muro: string }

const fijo = (id: string, sim: string, nombre: string, get: (d: Proyecto) => number, dec: number, unidad?: string, fuente?: string): ParamGrafo<Proyecto> =>
  ({ id, sim, nombre, unidad, dec, fuente, get, set: () => undefined, min: 0, max: 0, paso: 0, fijo: true });
const de = (id: string, sim: string, titulo: string, externo: string, valor: (r: RC) => number | null | undefined, dec: number, unidad?: string): NodoGrafo<RC> =>
  ({ id, sim, titulo, ec: '', externo, valor, dec, unidad });

export function grafoCirsoc(p0: Proyecto, metodo: 'cirsoc' | 'fem', s: SelCirsoc): Grafo<Proyecto, RC> {
  const fem = metodo === 'fem';
  const conMetodo = (p: Proyecto): Proyecto => ({ ...p, calculo: { ...(p.calculo ?? {}), metodo } });
  const calcular = (p: Proyecto): RC => {
    const c = calcularProyecto(conMetodo(p));
    const w = (fem ? c.fem?.viento : c.cirsoc?.viento)!;
    return { c, p, w, vu: vuelco102(p, w), aprox: fem ? viento102(p) : null };
  };
  const r0 = calcular(p0);
  const dir = s.dir, A = dir === 'A';
  const dw = (r: RC) => r.w[dir];
  const ex = EXPOSICIONES[r0.w.exposicion];
  const V0 = r0.w.V;
  const tabiques = !fem && /1\.9-5/.test(r0.w[dir].metodoFrecuencia);
  const verif = (r: RC) => r.c.cirsoc?.verif.find(x => x.dir === dir && x.nombre === s.pieza) ?? r.c.cirsoc?.verif.find(x => x.dir === dir);
  const muro = (r: RC) => { const v = verif(r); return v?.muros.find(m => m.id === s.muro) ?? v?.muros[0]; };
  const rg = (r: RC) => (A ? r.c.cirsoc?.corr.rotoA : r.c.cirsoc?.corr.rotoB);
  const el = (r: RC) => rg(r)?.paralelos.find(x => x.nombre === (verif(r)?.nombre ?? s.pieza));
  const pieza = verif(r0)?.nombre ?? s.pieza;

  // ------------------------------------------------------------------------------------------ 0 · modelo (FEM)
  const modelo: CapituloGrafo<Proyecto, RC> = {
    id: 'modelo', titulo: '0 · Modelo y frecuencia',
    intro: 'El FEM arma la torre como piezas verticales unidas por losas rígidas (tres movimientos por piso: x, y y giro) y busca cómo vibra: K·φ = ω²·M·φ. La primera frecuencia reemplaza a la fórmula aproximada del 102-25, que para torres esbeltas da de menos.',
    params: [],
    nodos: [
      de('m', 'M', 'Masas de las losas', 'del peso de cada piso', r => (r.c.fem?.masas ?? []).reduce((a, b) => a + b, 0), 1),
      de('K', 'K', 'Rigidez del modelo', 'de cada pieza: flexión (EJ) y corte (GA) piso por piso', () => null, 0),
      { id: 'w', titulo: 'Primer modo en este viento', sim: 'ω', ec: 'raíz de det([K] − ω² · [m]) = 0', unidad: 'rad/s', dec: 3, valor: r => (r.c.fem?.n1[dir] ?? NaN) * 2 * Math.PI,
        nota: 'La frecuencia con la que la torre oscila sola si se la empuja y se la suelta. Más rigidez: más rápido; más masa: más lento.' },
      { id: 'n1', titulo: 'Frecuencia del modelo', sim: 'n_1', ec: '[w] / (2 · π)', unidad: 'Hz', dec: 3, valor: r => r.c.fem?.n1[dir], f: x => x.w / (2 * Math.PI) },
      de('na', 'n_a', 'Frecuencia aproximada (102-25, 1.9-5)', 'la fórmula que usa el método CIRSOC', r => r.aprox?.[dir].n1, 3, 'Hz'),
      { id: 'T', titulo: 'Período', sim: 'T', ec: '1 / [n1]', unidad: 's', dec: 2, valor: r => 1 / (r.c.fem?.n1[dir] ?? NaN), f: x => 1 / x.n1,
        control: { cond: '< 1 s (rígida)', ok: r => (r.c.fem?.n1[dir] ?? 0) >= 1, siNo: [
          { texto: 'No es un error: es una torre flexible y el 102-25 pide el factor de ráfaga Gf (capítulo 1), que crece cuanto más baja es n1.', mueve: ['n1'] },
          { texto: 'Más rigidez (tabiques más largos, núcleo) sube n1 y baja Gf.', mueve: ['K'] },
        ] } },
    ],
  };

  // ------------------------------------------------------------------------------------------ 1 · viento 102-25
  const viento: CapituloGrafo<Proyecto, RC> = {
    id: 'viento', titulo: '1 · Viento (102-25)',
    intro: `El viento de resistencia del CIRSOC 102-25: velocidad por categoría de riesgo, exposición ${r0.w.exposicion}, altitud, frecuencia ${fem ? 'del modelo' : 'aproximada'} y ráfaga. Viento ${dir}, sobre la cara de ${fmtN(r0.w[dir].B)} m.`,
    params: [
      { id: 'V', sim: 'V', nombre: 'velocidad del viento (ya incluye la categoría)', unidad: 'm/s', dec: 1, min: 30, max: 80, paso: 0.5, fuente: `102-25, Fig. 1.5-1 (${r0.w.ciudad ?? 'manual'}, categoría ${r0.w.categoria})`,
        get: d => d.cirsoc102?.Vmanual ?? V0, set: (d, x) => { d.cirsoc102 = { ...(d.cirsoc102 ?? {}), Vmanual: x }; } },
      { id: 'Kzt', sim: 'Kzt', nombre: 'factor topográfico', dec: 2, min: 1, max: 2, paso: 0.01, get: d => d.cirsoc102?.Kzt ?? 1, set: (d, x) => { d.cirsoc102 = { ...(d.cirsoc102 ?? {}), Kzt: x }; } },
      { id: 'alt', sim: 'z_s', nombre: 'altitud del terreno', unidad: 'm', dec: 0, min: 0, max: 4000, paso: 50, get: d => d.cirsoc102?.altitud ?? 0, set: (d, x) => { d.cirsoc102 = { ...(d.cirsoc102 ?? {}), altitud: x }; } },
      { id: 'beta', sim: 'β', nombre: 'amortiguamiento', dec: 3, min: 0.01, max: 0.05, paso: 0.005, fuente: '0,02 para hormigón', get: d => d.cirsoc102?.beta ?? 0.02, set: (d, x) => { d.cirsoc102 = { ...(d.cirsoc102 ?? {}), beta: x }; } },
      fijo('h', 'h', 'altura sobre PB', () => r0.w.h, 2, 'm'),
      fijo('zg', 'zg', `altura gradiente (exposición ${r0.w.exposicion})`, () => ex.zg, 0, 'm', '102-25, Tabla 1.9-1'),
      fijo('alfa', 'α', 'exponente', () => ex.alfa, 1, '', 'Tabla 1.9-1'),
      fijo('Kd', 'Kd', 'direccionalidad', () => r0.w.Kd, 2),
      fijo('Cps', 'Cp_s', 'sotavento (según L/B)', () => r0.w[dir].Cps, 2, '', '102-25, Fig. 2.4-1'),
      fijo('B', A ? 'B' : 'L', 'ancho de la cara', () => r0.w[dir].B, 2, 'm'),
      fijo('hi', 'h_inf', 'altura de influencia de la azotea', () => r0.w[dir].niveles[0]?.hInf ?? 0, 2, 'm'),
      ...(tabiques ? [fijo('Cw', 'C_w', 'coeficiente de los tabiques paralelos al viento (1.9-5)', () => r0.w[dir].Cw ?? 0, 3, '', 'de la planta')] : []),
    ],
    nodos: [
      { id: 'Ke', titulo: 'Altitud', sim: 'Ke', ec: 'e^{−0,000119 · [alt]}', dec: 3, valor: r => r.w.Ke, f: x => Math.exp(-0.000119 * Math.max(0, x.alt)), ref: '102-25, art. 1.7', nota: 'Más alto, el aire es menos denso y empuja menos.' },
      { id: 'Kh', titulo: 'Exposición en la azotea', sim: 'Kh', ec: '2,41 · ([h] / [zg])^{2 / [alfa]}', dec: 3, valor: r => dw(r).Kh, f: x => 2.41 * Math.pow(Math.min(Math.max(x.h, 5), x.zg) / x.zg, 2 / x.alfa), ref: '102-25, Tabla 1.13-1' },
      { id: 'qh', titulo: 'Presión dinámica en la azotea', sim: 'qh', ec: '0,613 · [Kh] · [Kzt] · [Kd] · [Ke] · [V]²', unidad: 'N/m²', dec: 0, valor: r => dw(r).qh, f: x => 0.613 * x.Kh * x.Kzt * x.Kd * x.Ke * x.V ** 2, ref: '102-25, (1.13-1)' },
      fem ? de('n1', 'n_1', 'Frecuencia', 'del capítulo 0 (análisis modal)', r => dw(r).n1, 3, 'Hz')
        : tabiques ? { id: 'n1', titulo: 'Frecuencia aproximada', sim: 'n_1', ec: '117,3 · √[Cw] / [h]', unidad: 'Hz', dec: 3, valor: r => dw(r).n1, f: x => (117.3 * Math.sqrt(x.Cw)) / x.h, ref: '102-25, (1.9-5)',
          nota: 'La fórmula de los tabiques: cuanto más muro paralelo al viento, más rígida. Es un límite inferior: para torres esbeltas conviene la n1 de un análisis (método FEM).' }
          : de('n1', 'n_1', 'Frecuencia', r0.w[dir].metodoFrecuencia, r => dw(r).n1, 3, 'Hz'),
      de('Iz', 'I_z', 'Intensidad de la turbulencia', '102-25, (1.9-7)', r => dw(r).rafaga.Iz, 3),
      de('Qf', 'Q', 'Respuesta de fondo', '(1.9-8)', r => dw(r).rafaga.Q, 3),
      { id: 'R', titulo: 'Respuesta resonante', sim: 'R', ec: '√(R_n · R_h · R_B · (0,53 + 0,47 R_L) / [beta])', dec: 3, valor: r => dw(r).rafaga.R, ref: '(1.9-12)',
        nota: 'Cuánto se amplifica el viento porque la torre entra a vibrar con las ráfagas: crece si n1 es baja y si el amortiguamiento β es chico.' },
      de('gR', 'g_R', 'Factor de pico resonante', '(1.9-11), de n1', r => dw(r).rafaga.gR, 3),
      { id: 'Gf', titulo: 'Ráfaga de una torre flexible', sim: 'Gf', ec: '0,925 · (1 + 1,7 · [Iz] · √(3,4² · [Qf]² + [gR]² · [R]²)) / (1 + 1,7 · 3,4 · [Iz])', dec: 3, valor: r => dw(r).rafaga.Gf,
        f: x => 0.925 * ((1 + 1.7 * x.Iz * Math.sqrt(3.4 ** 2 * x.Qf ** 2 + x.gR ** 2 * x.R ** 2)) / (1 + 1.7 * 3.4 * x.Iz)), ref: '102-25, (1.9-10)' },
      { id: 'G', titulo: 'Factor de ráfaga usado', sim: 'G', ec: 'si [n1] ≥ 1 Hz: 0,85 · si no: [Gf]', dec: 3, valor: r => dw(r).Gusado, nota: 'Rígida (n1 ≥ 1 Hz): G = 0,85 como en el 102-2005. Flexible: Gf, que suele ser mayor que 1.' },
      { id: 'p', titulo: 'Presión neta en la azotea', sim: 'p', ec: '[qh] · [G] · (0,8 − [Cps])', unidad: 'N/m²', dec: 0, valor: r => dw(r).niveles[0]?.pNeta, f: x => x.qh * x.G * (0.8 - x.Cps),
        nota: 'Barlovento con Cp = 0,8 menos sotavento (negativo: succión). La presión interna empuja igual adentro de las dos caras y se anula.' },
      { id: 'Wi', titulo: 'Fuerza en la azotea', sim: 'W_i', ec: '[p] · [B] · [hi] / 1000 / 9,807', unidad: 't', dec: 2, valor: r => (dw(r).mandaMinimo ? null : dw(r).niveles[0]?.W), f: x => (x.p * x.B * x.hi) / 1000 / KN_POR_T, nota: 'N → kN → t.' },
      { id: 'Q', titulo: 'Corte en PB', sim: 'Q_PB', ec: 'Σ [Wi]', unidad: 't', dec: 1, valor: r => dw(r).QPB,
        control: { cond: '≥ W_mín (0,75 kN/m²)', ok: r => !dw(r).mandaMinimo, siNo: [{ texto: 'Manda la carga mínima del art. 2.1.5: la app ya usa la mínima en todos los niveles.' }] } },
      { id: 'M', titulo: 'Momento en PB', sim: 'M_PB', ec: 'Σ [Wi] · z_i', unidad: 'tm', dec: 0, valor: r => dw(r).MPB },
      { id: 'Mt2', titulo: 'Torsor del caso 2', sim: 'M_t2', ec: '0,75 · [Q] · 0,15 · [B]', unidad: 'tm', dec: 0, valor: r => (A ? r.w.casos[1].MtA : r.w.casos[1].MtB), f: x => 0.75 * x.Q * 0.15 * x.B,
        nota: 'Caso 2 de la Fig. 2.4-8: el 75 % del viento corrido 0,15 B del centro (ráfagas que no cargan toda la cara por igual). Los casos 3 y 4 cargan los dos vientos a la vez (vientos oblicuos).' },
    ],
  };

  // ------------------------------------------------------------------------------------------ 2 · vuelco (101-25)
  const vuelco: CapituloGrafo<Proyecto, RC> = {
    id: 'estabilidad', titulo: '2 · Vuelco (101-25)',
    intro: 'Con las combinaciones del 101-25 el vuelco se verifica con la que menos estabiliza: 0,9 D + 1,0 W (el peso con 0,9 y el viento entero). Equivale a Me/Mv ≥ 1,11. Viento A.',
    params: [
      { id: 'Dq', sim: 'D', nombre: 'carga permanente por m² de planta', unidad: 't/m²', dec: 2, min: 0.4, max: 1.6, paso: 0.05, fuente: 'Proyecto → CIRSOC 101', get: d => datos101De(d).D, set: (d, x) => { d.cirsoc101 = { ...(d.cirsoc101 ?? {}), D: x }; } },
      { id: 'b1', sim: 'b_1', nombre: 'lado de la fundación paralelo al viento', unidad: 'm', dec: 2, min: 5, max: 60, paso: 0.5, fuente: 'Proyecto → Fundación', get: d => d.fundacion.b1, set: (d, x) => { d.fundacion = { ...d.fundacion, b1: x }; } },
      fijo('At', 'A_t', 'suma de las áreas de las plantas (por los pisos que junta cada nivel)', d => { let B = 0, L = 0, s2 = 0; d.niveles.forEach(n => { B = n.B ?? B; L = n.L ?? L; s2 += B * L * losasDeNivel(n); }); return s2; }, 0, 'm²'),
      fijo('hs', 'h_s', 'de PB a la fundación', () => r0.vu.brazo, 2, 'm'),
    ],
    nodos: [
      de('MA', 'M_PB', 'Momento en PB', 'del capítulo 1 (viento A)', r => r.w.A.MPB, 0, 'tm'),
      de('QA', 'Q_PB', 'Corte en PB', 'del capítulo 1 (viento A)', r => r.w.A.QPB, 1, 't'),
      de('WPB', 'W_PB', 'Franja de PB', 'presión de z = 5 m', r => Math.max(0, r.w.A.WPB), 2, 't'),
      { id: 'Mv', titulo: 'Momento de vuelco', sim: 'Mv', ec: '[MA] + ([QA] + [WPB]) · [hs]', unidad: 'tm', dec: 0, valor: r => r.vu.Mv, f: x => x.MA + (x.QA + x.WPB) * x.hs },
      { id: 'P', titulo: 'Peso permanente', sim: 'D_t', ec: '[Dq] · [At]', unidad: 't', dec: 0, valor: r => r.vu.G, f: x => x.Dq * x.At },
      { id: 'Me', titulo: 'Momento estabilizante', sim: 'Me', ec: '[P] · [b1] / 2', unidad: 'tm', dec: 0, valor: r => r.vu.Me, f: x => (x.P * x.b1) / 2 },
      { id: 'FS', titulo: 'Vuelco con 0,9 D + 1,0 W', sim: '0,9·Me/Mv', ec: '0,9 · [Me] / [Mv]', dec: 2, valor: r => (0.9 * r.vu.Me) / r.vu.Mv, f: x => (0.9 * x.Me) / x.Mv,
        control: { cond: '≥ 1', ok: r => 0.9 * r.vu.Me >= r.vu.Mv - 1e-9, siNo: [
          { texto: 'Agrandar la fundación en el sentido del viento.', mueve: ['b1'] },
          { texto: 'Más peso permanente (subsuelos, platea).', mueve: ['Dq'] },
          { texto: 'Bajar el viento: con el FEM la frecuencia sube y la ráfaga baja.', mueve: ['MA'] },
        ] } },
    ],
  };

  // ------------------------------------------------------------------------------------------ 3 · reparto
  const reparto: CapituloGrafo<Proyecto, RC> = {
    id: 'roto', titulo: fem ? '3 · Reparto del modelo' : '3 · Reparto entre piezas',
    intro: fem
      ? `El modelo resuelve K·u = F con las fuerzas de cada caso y da el momento en la base de cada pieza directamente. La rototraslación (fila de abajo) es lo que daría el método CIRSOC: el modelo suma la deformación por corte de las almas, que cambia el reparto. Pieza: ${pieza}.`
      : `La rototraslación de la guía con el J real, ahora para los cuatro casos del 102-25: el caso 2 corre el viento 0,15 B y el 4 suma la torsión del otro viento. Pieza: ${pieza}.`,
    params: [fijo('Bc', A ? 'B' : 'L', 'ancho de la cara', () => r0.w[dir].B, 2, 'm')],
    nodos: [
      de('Mr', 'M_PB', 'Momento en PB', 'del capítulo 1', r => dw(r).MPB, 0, 'tm'),
      de('J', `J_${pieza}`, `J de ${pieza}`, 'Steiner, como la guía', r => el(r)?.J, 3, 'm⁴'),
      de('SJ', 'ΣJ', 'Suma de los J', 'de todas las piezas del viento', r => rg(r)?.SJ, 2, 'm⁴'),
      de('a', `a_${pieza}`, 'Brazo al eje de inercia', 'de la planta', r => el(r)?.a, 2, 'm'),
      de('e', 'e', 'Excentricidad', 'eje de inercia − eje de simetría', r => rg(r)?.e, 2, 'm'),
      de('SJa2', 'ΣJ·a²', 'Rigidez a la rotación', 'paralelos y perpendiculares', r => rg(r)?.SJa2, 1, 'm⁶'),
      { id: 'p1', titulo: 'Parte del viento, caso 1 (rototraslación)', sim: 'φ_1', ec: '[J] / [SJ] − [e] · [J] · [a] / [SJa2]', dec: 4, valor: r => { const g = rg(r), x = el(r); return g && x ? x.J / g.SJ - (g.SJa2 > 0 ? (g.e * x.J * x.a) / g.SJa2 : 0) : null; },
        f: x => x.J / x.SJ - (x.e * x.J * x.a) / x.SJa2, nota: 'Traslación más rotación, como fracción del viento.' },
      { id: 'p2', titulo: 'Caso 2: 75 % con torsión', sim: 'φ_2', ec: '0,75 · máx(φ con e ± 0,15 · [Bc])', dec: 4, valor: r => (fem ? null : verif(r)?.partes[1]) ?? null },
      { id: 'p4', titulo: 'Caso 4: 56,3 % de los dos vientos', sim: 'φ_4', ec: '0,563 · (máx(φ con e ± 0,15 · [Bc]) + torsión del otro viento)', dec: 4, valor: r => (fem ? null : verif(r)?.partes[3]) ?? null },
      ...(fem ? [de('pf', 'φ_FEM', 'Parte del viento, caso 1 (modelo)', 'K·u = F, momento en la base de la pieza / M_PB', r => verif(r)?.partes[0], 4)] : []),
      { id: 'Mj', titulo: `Momento de ${pieza}, caso 1`, sim: `M_${pieza}`, ec: fem ? '[pf] · [Mr]' : '[p1] · [Mr]', unidad: 'tm', dec: 0, valor: r => verif(r)?.M, f: x => (fem ? x.pf : x.p1) * x.Mr,
        nota: 'Con este momento (y el de los otros casos) se arman las solicitaciones de cada muro en el capítulo 4.' },
    ],
  };

  // ------------------------------------------------------------------------------------------ 4 · resistencia (201)
  const m0 = muro(r0);
  const resist: CapituloGrafo<Proyecto, RC> = {
    id: 'flexo', titulo: '4 · Resistencia (201)',
    intro: `El muro ${m0?.id ?? '—'} (${m0?.papel ?? ''} de ${pieza}) con las combinaciones mayoradas del 101-25 en los cuatro casos de viento. Primero el modelo simple, a mano: dos cordones de borde que toman el momento como una cupla; después, la cuantía que pide el diagrama de interacción (verificación completa).`,
    params: [
      fijo('lw', 'l_w', 'largo del muro', () => m0?.lw ?? 0, 2, 'm'),
      fijo('t', 't', 'espesor', () => m0?.h ?? 0, 2, 'm'),
      fijo('fc', "f'c", 'resistencia del hormigón', d => fcDe(d.hormigon || 'H30'), 0, 'MPa'),
      fijo('fy', 'f_y', 'fluencia del acero', () => FY, 0, 'MPa'),
    ],
    nodos: [
      { id: 'z', titulo: 'Brazo de la cupla', sim: 'z', ec: '0,85 · [lw]', unidad: 'm', dec: 2, valor: r => (muro(r)?.lw ?? NaN) * 0.85, f: x => 0.85 * x.lw },
      { id: 'Ac', titulo: 'Área de un cordón', sim: 'A_c', ec: '0,15 · [lw] · [t]', unidad: 'm²', dec: 3, valor: r => { const m = muro(r); return m ? 0.15 * m.lw * m.h : null; }, f: x => 0.15 * x.lw * x.t },
      de('Mu', 'M_u', 'Momento mayorado (el peor)', 'combinaciones del 101-25 × casos', r => muro(r)?.peor.Mu, 1, 'tm'),
      de('Nu', 'N_u', 'Carga axial de esa combinación', 'D y L de la pieza ± el par de las alas', r => muro(r)?.peor.Nu, 1, 't'),
      { id: 'T', titulo: 'Tracción en un cordón', sim: 'T', ec: 'máx(|[Mu]| / [z] − [Nu] / 2)', unidad: 't', dec: 1, valor: r => muro(r)?.cordon.T, tension: 'traccion',
        nota: 'La cupla del momento menos la mitad de la carga, que comprime los dos cordones. El máximo sale de todas las combinaciones (la peor suele ser 0,9 D + 1,0 W).' },
      { id: 'As', titulo: 'Acero del cordón', sim: 'A_s', ec: '[T] · 9807 / (0,9 · [fy]) / 100', unidad: 'cm²', dec: 1, valor: r => muro(r)?.cordon.AsBorde, f: x => Math.max(0, (x.T * N_POR_T) / (0.9 * x.fy)) / 100 },
      { id: 'C', titulo: 'Compresión en un cordón', sim: 'C', ec: 'máx(|[Mu]| / [z] + [Nu] / 2)', unidad: 't', dec: 1, valor: r => muro(r)?.cordon.C, tension: 'compresion',
        control: { cond: '≤ [Cadm]', ok: r => { const m = muro(r); return m ? m.cordon.C <= m.cordon.Cadm + 1e-9 : null; }, siNo: [
          { texto: 'Engrosar el muro o alargarlo: más área de cordón y más brazo z.', mueve: ['t', 'lw'] },
          { texto: 'Si no alcanza, la compresión la toma también la armadura (lo resuelve la verificación completa).', mueve: ['rho'] },
        ] } },
      { id: 'Cadm', titulo: 'Compresión que aguanta el cordón', sim: 'C_adm', ec: "0,65 · 0,85 · [fc] · [Ac] · 10^{6} / 9807", unidad: 't', dec: 0, valor: r => muro(r)?.cordon.Cadm, f: x => (0.65 * 0.85 * x.fc * x.Ac * 1e6) / N_POR_T },
      { id: 'rho', titulo: 'Cuantía vertical necesaria (completa)', sim: 'ρ', ec: 'la menor con todas las ([Mu], [Nu]) adentro de φ·(Mn, Pn)', unidad: '%', dec: 2, valor: r => (muro(r)?.rhoNecesaria ?? NaN) * 100,
        control: { cond: '≤ 4 %', ok: r => { const m = muro(r); return m ? m.rhoNecesaria <= 0.04 + 1e-12 && m.relacionNecesaria <= 1 + 1e-9 : null; }, siNo: [
          { texto: 'Engrosar o alargar el muro: más hormigón para la compresión y más brazo para el momento.', mueve: ['t', 'lw'] },
          { texto: 'Que la pieza tome menos momento: más rigidez en las otras piezas (capítulo 3), o la n1 del FEM.', mueve: ['Mu'] },
          { texto: 'Mejor hormigón (más f\'c).', mueve: ['fc'] },
        ] },
        nota: 'La app prueba cuantías de 0,05 % en 0,05 % desde la mínima (14.3) hasta que todas las combinaciones quedan adentro del diagrama de interacción N-M del muro. Arriba de 4 % no se puede armar.', ref: '201-2005, cap. 10 y 14' },
    ],
  };

  sectorizar(modelo, { 'Masa y rigidez': ['m', 'K'], 'Vibración': ['w', 'n1', 'na', 'T'] });
  sectorizar(viento, { 'Presión dinámica': ['Ke', 'Kh', 'qh'], 'Frecuencia y ráfaga': ['n1', 'Iz', 'Qf', 'R', 'gR', 'Gf', 'G'], 'Fuerzas': ['p', 'Wi'], 'Corte y momento': ['Q', 'M'], 'Torsión': ['Mt2'] });
  sectorizar(vuelco, { 'Momento de vuelco': ['MA', 'QA', 'WPB', 'Mv'], 'Peso y estabilizante': ['P', 'Me'], 'Verificación': ['FS'] });
  sectorizar(reparto, { 'Rigidez de las piezas': ['J', 'SJ', 'a', 'e', 'SJa2'], 'Parte de cada caso': ['p1', 'p2', 'p4', 'pf'], 'Momento de la pieza': ['Mr', 'Mj'] });
  sectorizar(resist, { 'Cupla de los cordones': ['z', 'Mu', 'Nu'], 'Tracción': ['T', 'As'], 'Compresión': ['Ac', 'C', 'Cadm'], 'Diagrama de interacción': ['rho'] });
  return {
    datos: () => structuredClone(p0),
    calcular,
    capitulos: fem ? [modelo, viento, vuelco, reparto, resist] : [viento, vuelco, reparto, resist],
  };
}

const fmtN = (x: number) => x.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
