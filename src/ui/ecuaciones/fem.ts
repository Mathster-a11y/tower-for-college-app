/**
 * El método FEM como grafo de fórmulas: solo cómo funcionan sus ecuaciones y sus matrices (la carga del viento es la
 * del CIRSOC 102-25, con la frecuencia que sale del propio modelo).
 *  1 · la matriz de rigidez de un tramo de pieza (viga de Timoshenko) y la condensación de la ménsula a sus pisos;
 *  2 · la losa rígida (tres incógnitas por piso) y el ensamble K = Σ Tᵀ·Kp·T;
 *  3 · la vibración: K·φ = ω²·M·φ y la primera frecuencia;
 *  4 · las cargas y la solución K·u = F;
 *  5 · las fuerzas de cada pieza: fp = Kp·(T·u), su corte, su momento y su parte del viento.
 * Los valores salen de calcularFem (el mismo motor del método FEM, verificado contra OpenSees y Pynite).
 */
import type { Proyecto } from '../../engine/modelo';
import { calcularFem, type ResultadoMetodoFem } from '../../engine/metodos/fem';
import { rigidezMensula } from '../../engine/fem/pseudo3d';
import { sectorizar, type CapituloGrafo, type Grafo, type NodoGrafo, type ParamGrafo } from '../grafo';
import { h, type H } from '../comp';
import { fmt } from '../estado';

export interface RFe { fem: ResultadoMetodoFem; p: Proyecto }
export interface SelFem { dir: 'A' | 'B'; pieza: string }

const de = (id: string, sim: string, titulo: string, externo: string, valor: (r: RFe) => number | null | undefined, dec: number, unidad?: string): NodoGrafo<RFe> =>
  ({ id, sim, titulo, ec: '', externo, valor, dec, unidad });

export function grafoFem(p0: Proyecto, teoria: 'timoshenko' | 'euler', s: SelFem): Grafo<Proyecto, RFe> {
  const calcular = (p: Proyecto): RFe => ({ fem: calcularFem(p, teoria), p });
  const r0 = calcular(p0);
  const dir = s.dir, A = dir === 'A';
  const mo = r0.fem.modelo;
  const pz = (r: RFe) => r.fem.modelo.piezas.find(x => x.dir === dir && x.nombre === s.pieza) ?? r.fem.modelo.piezas.find(x => x.dir === dir)!;
  const nombre = pz(r0)?.nombre ?? s.pieza;
  const timo = mo.timo;
  const n = mo.z.length, top = n - 1;
  const caso1 = (r: RFe) => r.fem.casos[A ? 0 : 1].res;
  const pzRes = (r: RFe) => caso1(r).piezas.find(x => x.dir === dir && x.nombre === pz(r).nombre);
  const modo1 = (r: RFe) => r.fem.modos.find(m => m.dominante === (A ? 'y' : 'x') && m.f > 1e-6);
  // la ménsula condensada de la pieza: rigidez lateral de cada piso respecto de los demás
  const Kp = (r: RFe) => { const q = pz(r), zs = r.fem.modelo.z.filter(z => z <= q.zHasta + 1e-6); return zs.length ? rigidezMensula(zs, r.fem.modelo.E * q.J, r.fem.modelo.timo ? r.fem.modelo.G * Math.max(q.Av, 1e-9) : null) : [[NaN]]; };
  // la planta del piso más alto del modelo (B y L se heredan de los niveles de arriba)
  const plantaArriba = (r: RFe) => {
    const zPB = r.p.niveles.reduce((z, x) => (x.cota >= 0 ? x.cota : z), 0), zt = r.fem.modelo.z[top] + zPB;
    let B = 0, L = 0;
    for (const x of r.p.niveles) { B = x.B ?? B; L = x.L ?? L; if (Math.abs(x.cota - zt) < 1e-6) break; }
    return { B, L };
  };
  const fijo = (id: string, sim: string, nombre: string, get: (r: RFe) => number, dec: number, unidad?: string, fuente?: string): ParamGrafo<Proyecto> =>
    ({ id, sim, nombre, unidad, dec, fuente, get: () => get(r0), set: () => undefined, min: 0, max: 0, paso: 0, fijo: true });

  // ------------------------------------------------------------------------------------------ 1 · la pieza
  const pieza: CapituloGrafo<Proyecto, RFe> = {
    id: 'pieza', titulo: '1 · Matriz de una pieza',
    intro: `Cada pieza (${nombre}) es una viga vertical empotrada en PB, cortada en tramos de piso a piso. Cada tramo tiene 4 movimientos en sus puntas (corrimiento w y giro φ abajo y arriba) y su matriz de rigidez 4×4 dice qué fuerzas hacen falta para producirlos. ${timo ? 'Timoshenko: suma la deformación por corte del alma (Φ).' : 'Euler-Bernoulli: solo flexión (Φ = 0).'} Primer tramo, de PB al 1.er piso.`,
    params: [
      fijo('E', 'E', 'módulo de elasticidad', () => mo.E, 0, 't/m²'),
      fijo('G', 'G', 'módulo de corte (E / 2,4)', () => mo.G, 0, 't/m²'),
      fijo('J', 'J', `inercia de ${nombre}`, r => pz(r).J, 3, 'm⁴', 'Steiner, como la guía'),
      fijo('Av', 'A_v', 'área de corte (las almas)', r => pz(r).Av, 3, 'm²'),
      fijo('L', 'L', 'largo del tramo (altura del piso)', () => mo.z[0], 2, 'm'),
    ],
    nodos: [
      { id: 'EI', titulo: 'Rigidez a flexión', sim: 'EI', ec: '[E] · [J]', unidad: 't·m²', dec: 0, valor: r => r.fem.modelo.E * pz(r).J, f: x => x.E * x.J },
      { id: 'GA', titulo: 'Rigidez a corte', sim: 'GA_v', ec: '[G] · [Av]', unidad: 't', dec: 0, valor: r => r.fem.modelo.G * pz(r).Av, f: x => x.G * x.Av },
      { id: 'Phi', titulo: 'Peso del corte', sim: 'Φ', ec: timo ? '12 · [EI] / ([GA] · [L]²)' : '0 (Euler)', dec: 4, valor: r => (r.fem.modelo.timo ? (12 * r.fem.modelo.E * pz(r).J) / (r.fem.modelo.G * pz(r).Av * r.fem.modelo.z[0] ** 2) : 0),
        f: timo ? x => (12 * x.EI) / (x.GA * x.L ** 2) : undefined,
        nota: 'Cuánto se deforma el tramo por corte comparado con la flexión. En un tabique largo y bajo (piso de 3 m, muro de 8 m) es grande; en una pieza esbelta, casi 0. Por eso el FEM reparte distinto que la rototraslación, que solo mira J.' },
      { id: 'k', titulo: 'Factor del tramo', sim: 'k', ec: '[EI] / ((1 + [Phi]) · [L]³)', unidad: 't/m', dec: 0, valor: r => { const q = pz(r), L = r.fem.modelo.z[0], EI = r.fem.modelo.E * q.J, fi = r.fem.modelo.timo ? (12 * EI) / (r.fem.modelo.G * q.Av * L * L) : 0; return EI / ((1 + fi) * L ** 3); },
        f: x => x.EI / ((1 + x.Phi) * x.L ** 3) },
      { id: 'ke', titulo: 'Matriz del tramo (w₁, φ₁, w₂, φ₂)', sim: 'k_e', ec: '[k] · [[12, 6L, −12, 6L], [6L, (4+[Phi])L², −6L, (2−[Phi])L²], [−12, −6L, 12, −6L], [6L, (2−Φ)L², −6L, (4+Φ)L²]]', unidad: 't/m', dec: 0,
        valor: r => { const q = pz(r), L = r.fem.modelo.z[0], EI = r.fem.modelo.E * q.J, fi = r.fem.modelo.timo ? (12 * EI) / (r.fem.modelo.G * q.Av * L * L) : 0; return (12 * EI) / ((1 + fi) * L ** 3); },
        f: x => 12 * x.k, nota: 'Cada columna son las fuerzas que aparecen al mover una sola punta una unidad. El valor que se muestra es el primero, 12k: la fuerza para correr una punta 1 m con las otras quietas.' },
      { id: 'Kc', titulo: 'Ménsula condensada (la azotea)', sim: 'K_p', ec: 'K_ww − K_wφ · K_φφ^{−1} · K_φw (con [ke] de cada piso)', unidad: 't/m', dec: 0, valor: r => { const K = Kp(r); return K[K.length - 1][K.length - 1]; },
        nota: 'Se ensamblan los tramos de todos los pisos y se eliminan los giros (ninguna carga los empuja): queda una matriz de un número por par de pisos, que dice cuánto empuja la pieza en cada piso si se corre otro. El valor es el de la azotea con la azotea.' },
    ],
    detalle: (id, r) => (id === 'Kc' ? matriz(Kp(r), 'K_p de la pieza (t/m), pisos de abajo hacia arriba') : null),
  };

  // ------------------------------------------------------------------------------------------ 2 · losa rígida y ensamble
  const ensamble: CapituloGrafo<Proyecto, RFe> = {
    id: 'ensamble', titulo: '2 · Losa rígida y ensamble',
    intro: 'Cada losa es rígida en su plano: todos sus puntos se mueven con tres números, ux, uy y el giro θ. Una pieza no tiene incógnitas propias: su corrimiento sale de la losa (T). Así, cada pieza suma su matriz a la de la torre en los lugares de sus pisos.',
    params: [
      fijo('n', 'n', 'pisos del modelo', () => n, 0),
      fijo('x', A ? 'x_p' : 'y_p', `posición de ${nombre}`, r => pz(r).pos, 2, 'm'),
    ],
    nodos: [
      de('Kp2', 'K_p', 'Ménsula condensada (azotea)', 'del capítulo 1', r => { const K = Kp(r); return K[K.length - 1][K.length - 1]; }, 0, 't/m'),
      { id: 'gdl', titulo: 'Incógnitas de la torre', sim: 'N', ec: '3 · [n]', dec: 0, valor: () => 3 * n, f: x => 3 * x.n, nota: 'ux, uy y θ de cada losa: la matriz de la torre es de N × N.' },
      { id: 'T', titulo: 'Corrimiento de la pieza en un piso', sim: 'd_p', ec: A ? 'u_y + [x] · θ' : 'u_x − [x] · θ', dec: 0, valor: () => null,
        nota: 'Una pieza paralela al viento A (en x) se corre lo que la losa en y más el giro por su distancia; es la «T» que lleva la pieza a las incógnitas de la losa. Es la misma idea de la rototraslación, ahora piso por piso.' },
      { id: 'Kyy', titulo: 'Aporte al corrimiento (azotea)', sim: 'ΔK_uu', ec: '1 · [Kp2] · 1', unidad: 't/m', dec: 0, valor: r => { const K = Kp(r); return K[K.length - 1][K.length - 1]; }, f: x => x.Kp2,
        nota: 'Tᵀ·Kp·T: en la casilla del corrimiento de la azotea entra la rigidez de la pieza tal cual.' },
      { id: 'Kth', titulo: 'Aporte al giro (azotea)', sim: 'ΔK_θθ', ec: '[x]² · [Kp2]', unidad: 't·m', dec: 0, valor: r => { const K = Kp(r); return pz(r).pos ** 2 * K[K.length - 1][K.length - 1]; }, f: x => x.x ** 2 * x.Kp2,
        nota: 'Y en la del giro, la rigidez por la distancia al cuadrado: las piezas lejos del centro resisten mucho el giro (como J·a² en la rototraslación).' },
      { id: 'K', titulo: 'Matriz de la torre', sim: 'K', ec: 'Σ T^{T} · [Kp2] · T (todas las piezas) → [gdl] × [gdl]', dec: 0, valor: () => null, nota: 'Se suman los aportes de todas las piezas. Si en una dirección no hay ninguna pieza, la matriz no se puede invertir (la torre se caería de costado).' },
    ],
  };

  // ------------------------------------------------------------------------------------------ 3 · vibración
  const vib: CapituloGrafo<Proyecto, RFe> = {
    id: 'modal', titulo: '3 · Vibración (modal)',
    intro: 'La torre suelta oscila con formas propias (modos) y frecuencias propias. Se buscan con la masa de cada losa: K·φ = ω²·M·φ. La primera frecuencia del viento elegido es la n1 que el 102-25 usa para la ráfaga.',
    params: [fijo('Bp', 'B', 'ancho de la planta de la azotea', r => plantaArriba(r).B, 2, 'm'), fijo('Lp', 'L', 'largo de la planta de la azotea', r => plantaArriba(r).L, 2, 'm')],
    nodos: [
      de('mk', 'm', 'Masa de la azotea', 'peso / g (losa + tabiques)', r => r.fem.masas[top], 2, 't·s²/m'),
      { id: 'J0', titulo: 'Inercia al giro de la losa', sim: 'J_0', ec: '[mk] · ([Bp]² + [Lp]²) / 12', unidad: 't·s²·m', dec: 1, valor: r => r.fem.inercias[top], f: x => (x.mk * (x.Bp ** 2 + x.Lp ** 2)) / 12 },
      { id: 'M', titulo: 'Matriz de masas', sim: 'M', ec: 'diag([mk], [mk], [J0]) en cada piso', dec: 0, valor: () => null },
      de('Km', 'K', 'Matriz de la torre', 'del capítulo 2', () => null, 0),
      { id: 'eig', titulo: 'Problema de autovalores', sim: 'ω²', ec: '[Km] · φ = ω² · [M] · φ', unidad: '1/s²', dec: 4, valor: r => (modo1(r)?.omega ?? NaN) ** 2,
        nota: 'Se resuelve con el método de Jacobi sobre M^−½·K·M^−½ (simétrica): se gira la matriz hasta que queda diagonal; la diagonal son los ω² y las columnas, las formas.' },
      { id: 'w', titulo: 'Pulsación del primer modo', sim: 'ω', ec: '√[eig]', unidad: 'rad/s', dec: 3, valor: r => modo1(r)?.omega, f: x => Math.sqrt(x.eig) },
      { id: 'n1', titulo: 'Frecuencia', sim: 'n_1', ec: '[w] / (2 · π)', unidad: 'Hz', dec: 3, valor: r => modo1(r)?.f, f: x => x.w / (2 * Math.PI),
        control: { cond: '≥ 1 Hz (rígida)', ok: r => (modo1(r)?.f ?? 0) >= 1, siNo: [{ texto: 'Torre flexible: el viento se amplifica con Gf (102-25, 1.9-10). No es un error: es lo que pasa a esta torre.' }, { texto: 'Más rigidez (K) sube n1; más masa la baja.', mueve: ['Km', 'mk'] }] } },
      { id: 'part', titulo: 'Masa que mueve el modo', sim: 'M_ef', ec: '(Σ m · φ)² / Σ m · φ² / Σ m', unidad: '%', dec: 1, valor: r => (modo1(r)?.participacion[A ? 'y' : 'x'] ?? NaN) * 100,
        nota: 'Qué parte de la torre se mueve con ese modo. Cerca del 60 al 70 %: la ménsula oscila «toda junta» y el resto lo llevan los modos más altos.' },
    ],
  };

  // ------------------------------------------------------------------------------------------ 4 · K·u = F
  const sol: CapituloGrafo<Proyecto, RFe> = {
    id: 'solucion', titulo: '4 · Cargas y K·u = F',
    intro: `Con la n1 del modelo, el 102-25 da la fuerza de cada piso (capítulo de viento del CIRSOC). Se arma el vector de cargas F (en cada losa: Fx, Fy y el torsor de los casos 2 y 4) y se resuelve K·u = F por eliminación de Gauss. Caso 1, viento ${dir}.`,
    params: [
      fijo('Bw', A ? 'B' : 'L', 'ancho de la cara', r => r.fem.viento[dir].B, 2, 'm'),
      fijo('rel', '(V_a/V)²', 'presión de servicio / de resistencia (102-25, apéndice B)', r => r.fem.viento.servicio.relacion, 3),
    ],
    nodos: [
      de('Ki', 'K', 'Matriz de la torre', 'del capítulo 2', () => null, 0),
      de('W', 'W_azotea', 'Fuerza en la azotea', '102-25 con la n1 del modelo', r => r.fem.viento[dir].niveles[0]?.W, 2, 't'),
      { id: 'F', titulo: 'Vector de cargas', sim: 'F', ec: A ? '(0, [W], 0) en la azotea … (0, W_i, 0) en cada piso' : '([W], 0, 0) en la azotea … (W_i, 0, 0) en cada piso', dec: 0, valor: () => null,
        nota: 'Caso 2: además un torsor 0,75 · W · 0,15 · B en cada losa (con los dos signos); casos 3 y 4: los dos vientos a la vez.' },
      { id: 'u', titulo: 'Solución', sim: 'u', ec: '[Ki]^{−1} · [F]', dec: 0, valor: () => null, nota: 'Gauss con pivoteo: N ecuaciones, N incógnitas. Da ux, uy y θ de cada losa.' },
      { id: 'uh', titulo: 'Corrimiento de la azotea', sim: A ? 'u_y' : 'u_x', ec: 'del vector [u]', unidad: 'mm', dec: 1, valor: r => (A ? caso1(r).uy[top] : caso1(r).ux[top]) * 1000 },
      { id: 'th', titulo: 'Giro de la azotea', sim: 'θ', ec: 'del vector [u]', unidad: 'mrad', dec: 3, valor: r => caso1(r).rz[top] * 1000 },
      { id: 'der', titulo: 'Deriva de servicio (borde)', sim: 'Δ_s', ec: '[rel] · (|[uh] ± [Bw]/2 · [th]|)', unidad: 'mm', dec: 1, valor: r => r.fem.deriva[dir].d[r.fem.deriva[dir].d.length - 1] * 1000,
        f: x => x.rel * Math.max(Math.abs(x.uh + (A ? 1 : -1) * (x.Bw / 2) * x.th), Math.abs(x.uh - (A ? 1 : -1) * (x.Bw / 2) * x.th)),
        control: { cond: '≤ h / 500', ok: r => { const d = r.fem.deriva[dir]; return d.d[d.d.length - 1] <= d.h / 500 + 1e-12; }, siNo: [{ texto: 'Más rigidez (más J o más piezas): K más grande, u más chico.', mueve: ['Ki'] }, { texto: 'Si gira mucho, piezas lejos del centro (más rigidez al giro).', mueve: ['th'] }] },
        nota: 'El borde de la planta más corrido, con la presión de servicio (10 años): la azotea no puede moverse más de h/500.' },
    ],
  };

  // ------------------------------------------------------------------------------------------ 5 · fuerzas de la pieza
  const fz: CapituloGrafo<Proyecto, RFe> = {
    id: 'fuerzas', titulo: '5 · Fuerzas de cada pieza',
    intro: `Con u resuelto, cada pieza vuelve a su corrimiento (T·u) y su matriz da las fuerzas que toma en cada piso: fp = Kp · dp. La suma es el corte en su base y, con los brazos, el momento. ${nombre}, caso 1.`,
    params: [fijo('xp', A ? 'x_p' : 'y_p', `posición de ${nombre}`, r => pz(r).pos, 2, 'm')],
    nodos: [
      de('uy', A ? 'u_y' : 'u_x', 'Corrimiento de la azotea', 'del capítulo 4', r => (A ? caso1(r).uy[top] : caso1(r).ux[top]) * 1000, 2, 'mm'),
      de('th', 'θ', 'Giro de la azotea', 'del capítulo 4', r => caso1(r).rz[top] * 1000, 4, 'mrad'),
      de('Kp', 'K_p', `Matriz de ${nombre}`, 'del capítulo 1', () => null, 0),
      { id: 'dp', titulo: `Corrimiento de ${nombre} (azotea)`, sim: 'd_p', ec: A ? '[uy] + [xp] · [th]' : '[uy] − [xp] · [th]', unidad: 'mm', dec: 2, valor: r => { const c = caso1(r), q = pz(r); return ((A ? c.uy[top] + q.pos * c.rz[top] : c.ux[top] - q.pos * c.rz[top])) * 1000; },
        f: x => x.uy + (A ? 1 : -1) * x.xp * x.th },
      { id: 'fp', titulo: 'Fuerzas en cada piso', sim: 'f_p', ec: '[Kp] · [dp] (todos los pisos)', unidad: 't', dec: 2, valor: r => pzRes(r)?.f[top], nota: 'El valor es el de la azotea. La pieza puede tomar fuerzas de distinto signo en distintos pisos: así las piezas se acoplan a través de las losas.' },
      { id: 'V', titulo: 'Corte en la base', sim: 'V_p', ec: 'Σ [fp]', unidad: 't', dec: 1, valor: r => pzRes(r)?.V },
      { id: 'Mb', titulo: 'Momento en la base', sim: 'M_p', ec: 'Σ [fp] · z', unidad: 'tm', dec: 0, valor: r => pzRes(r)?.M },
      de('Q', 'Q', 'Viento total', 'Σ W (102-25 con la n1 del modelo)', r => r.fem.viento[dir].niveles.reduce((s2, x) => s2 + x.W, 0), 1, 't'),
      { id: 'parte', titulo: 'Parte del viento (modelo)', sim: 'φ_FEM', ec: '[V] / [Q]', unidad: '', dec: 4, valor: r => (pzRes(r)?.V ?? NaN) / r.fem.viento[dir].niveles.reduce((s2, x) => s2 + x.W, 0), f: x => x.V / x.Q,
        nota: 'Se compara con la de la rototraslación (J/ΣJ ± rotación): el modelo suma el corte de las almas y el acople de las losas, y cambia el reparto, sobre todo entre piezas cortas y largas.' },
      de('prot', 'φ_rot', 'Parte por rototraslación', 'J/ΣJ ± rotación (planilla)', r => (r.fem.reparto.find(x => x.dir === dir && x.nombre === pz(r).nombre)?.planilla ?? NaN) / 100, 4),
    ],
  };

  sectorizar(pieza, { 'Rigideces del tramo': ['EI', 'GA', 'Phi'], 'Matriz del tramo': ['k', 'ke'], 'Condensación': ['Kc'] });
  sectorizar(ensamble, { 'Losa rígida': ['Kp2', 'T', 'Kyy', 'Kth'], 'Matriz de la torre': ['gdl', 'K'] });
  sectorizar(vib, { 'Masas': ['mk', 'J0', 'M'], 'Autovalores': ['Km', 'eig', 'w', 'n1', 'part'] });
  sectorizar(sol, { 'Cargas': ['W', 'F'], 'Solución': ['Ki', 'u', 'uh', 'th'], 'Deriva': ['der'] });
  sectorizar(fz, { 'Corrimiento de la pieza': ['uy', 'th', 'dp'], 'Fuerzas': ['Kp', 'fp', 'V', 'Mb'], 'Reparto': ['Q', 'parte', 'prot'] });
  return { datos: () => structuredClone(p0), calcular, capitulos: [pieza, ensamble, vib, sol, fz] };
}

function matriz(K: number[][], titulo: string): H {
  const t = h('table', { class: 'tabla chica matriz' });
  t.append(h('caption', {}, titulo));
  const tb = h('tbody');
  K.forEach(f => tb.append(h('tr', {}, ...f.map(x => h('td', { class: 'n' }, fmt(x, 0))))));
  t.append(tb);
  return h('div', { class: 'scroll' }, t);
}
