/**
 * El flujo de viento (túnel 2D y 3D, Lattice Boltzmann) como grafo de fórmulas: no es un método de cálculo de la
 * torre sino una simulación del aire; acá se ve cómo se eligen los números de la red (viscosidad, τ, Mach), qué se
 * mide (presión, Cp, Strouhal) y cómo se conecta con la torre: la velocidad crítica de desprendimiento de remolinos.
 * Los números de la red son los del túnel 2D de la app (U0 = 0,1; la torre ocupa D celdas).
 */
import type { CapituloGrafo, Grafo, NodoGrafo, ParamGrafo } from '../grafo';

export interface DF { U0: number; D: number; Re: number; cs: number; St: number; V: number; B: number; n1: number; nuAire: number }
export type RF = Record<string, number | null>;

const param = (id: keyof DF, sim: string, nombre: string, min: number, max: number, paso: number, dec: number, unidad?: string, fuente?: string): ParamGrafo<DF> =>
  ({ id, sim, nombre, unidad, dec, min, max, paso, fuente, get: d => d[id], set: (d, x) => { d[id] = x; } });
const idea = (id: string, titulo: string, sim: string, ec: string, nota: string, ref?: string): NodoGrafo<RF> => ({ id, titulo, sim, ec, valor: () => null, nota, ref });

export function calcularFlujo(d: DF): RF {
  const nu = (d.U0 * d.D) / d.Re, tau = 3 * nu + 0.5, Ma = d.U0 * Math.sqrt(3);
  const fd = (d.St * d.V) / d.B, ReReal = (d.V * d.B) / d.nuAire, Vcr = (d.n1 * d.B) / d.St;
  return { nu, tau, Ma, fd, ReReal, Vcr, V: d.V, celdas: d.D };
}

export function grafoFlujo(d0: DF): Grafo<DF, RF> {
  const red: CapituloGrafo<DF, RF> = {
    id: 'red', titulo: '1 · La red (Lattice Boltzmann)',
    intro: 'El aire como partículas que saltan de celda en celda en 9 direcciones (D2Q9; 19 en 3D, D3Q19). En cada paso chocan y se acercan al equilibrio; de ese reparto salen la densidad, la velocidad y la presión. Equivale a resolver Navier-Stokes sin escribirlo.',
    params: [
      param('U0', 'U_0', 'velocidad de entrada en la red (celdas por paso)', 0.02, 0.2, 0.01, 2, '', 'túnel 2D: 0,1'),
      param('D', 'D', 'celdas que ocupa el ancho de la torre', 10, 120, 2, 0, 'celdas'),
      param('Re', 'Re', 'número de Reynolds de la simulación', 50, 20000, 50, 0, '', 'laminar 150 · medio 1 000 · alto 20 000'),
      param('cs', 'C_s', 'constante de Smagorinsky (turbulencia)', 0, 0.3, 0.01, 2, '', '0 laminar · 0,16 · 0,22'),
    ],
    nodos: [
      { id: 'nu', titulo: 'Viscosidad en la red', sim: 'ν', ec: '[U0] · [D] / [Re]', dec: 4, valor: r => r.nu, f: x => (x.U0 * x.D) / x.Re,
        nota: 'Se elige la viscosidad para que la simulación tenga el Reynolds buscado: Re = U·D/ν.' },
      { id: 'tau', titulo: 'Tiempo de relajación', sim: 'τ', ec: '3 · [nu] + 0,5', dec: 4, valor: r => r.tau, f: x => 3 * x.nu + 0.5,
        control: { cond: '> 0,5', ok: r => (r.tau ?? 0) > 0.5 + 1e-4, siNo: [{ texto: 'τ muy cerca de 0,5 vuelve inestable la red: más celdas en la torre, menos Re o el modelo de turbulencia.', mueve: ['D', 'Re', 'cs'] }] },
        nota: 'Cuánto tardan las partículas en volver al equilibrio. Cerca de 0,5 (poca viscosidad) la red se vuelve inestable.' },
      { id: 'Ma', titulo: 'Mach de la red', sim: 'Ma', ec: '[U0] · √3', dec: 3, valor: r => r.Ma, f: x => x.U0 * Math.sqrt(3),
        control: { cond: '≤ 0,3', ok: r => (r.Ma ?? 1) <= 0.3, siNo: [{ texto: 'Bajar U0: la red solo representa bien al aire incompresible si va bastante más lento que su «sonido» (c = 1/√3).', mueve: ['U0'] }] } },
      idea('feq', 'Equilibrio de cada dirección', 'f_i^eq', 'w_i · ρ · (1 + 3 · e_i·u + 4,5 · (e_i·u)² − 1,5 · u²)', 'Cómo se repartirían las partículas entre las 9 direcciones si el aire estuviera quieto respecto de su velocidad u. Es la «receta» que reemplaza a las ecuaciones.', 'BGK'),
      { ...idea('col', 'Choque y salto (BGK)', 'f_i(x + e_i, t + 1)', 'f_i − (f_i − [feq]) / [tau]', 'En cada paso, cada dirección se acerca al equilibrio en 1/τ y salta a la celda vecina. Contra la torre rebota (rebote a mitad de camino).'), valor: () => null },
      idea('teff', 'Turbulencia (Smagorinsky)', 'τ_ef', '½ · ([tau] + √([tau]² + 18 · [cs]² · Q / ρ))', 'Con Re alto los remolinos más chicos que una celda no entran en la red: el modelo agrega viscosidad donde el flujo se deforma mucho.'),
      idea('macro', 'Densidad, velocidad y presión', 'ρ, u, p', 'ρ = Σ f_i · ρu = Σ f_i · e_i · p = ρ / 3 (de [col])', 'Lo que se ve en la pantalla sale de sumar las partículas de cada celda.'),
    ],
  };
  const med: CapituloGrafo<DF, RF> = {
    id: 'medir', titulo: '2 · Lo que se mide',
    intro: 'De la simulación salen los coeficientes que el reglamento resume en tablas (Cp de cada cara) y uno que no trae: la frecuencia con la que se desprenden los remolinos (Strouhal). Con la frecuencia de la torre da la velocidad a la que podría entrar en resonancia.',
    params: [
      param('St', 'St', 'número de Strouhal medido en el túnel', 0.08, 0.25, 0.002, 3, '', 'túnel 2D, pico del espectro'),
      param('V', 'V', 'velocidad de diseño del viento', 20, 80, 0.5, 1, 'm/s', '102-25'),
      param('B', 'B', 'ancho de la torre contra el viento', 5, 80, 0.5, 2, 'm'),
      param('n1', 'n_1', 'frecuencia de la torre', 0.05, 2, 0.01, 3, 'Hz', 'mejor la del FEM'),
      { ...param('nuAire', 'ν_aire', 'viscosidad del aire', 1e-5, 2e-5, 1e-6, 6, 'm²/s'), fijo: true },
    ],
    nodos: [
      idea('Cp', 'Coeficiente de presión', 'C_p', '(p − p_∞) / (½ · ρ · U_0²)', 'Positivo donde el aire empuja (barlovento, azul en el túnel: comprime la cara) y negativo donde succiona (rojo: tracciona). Se compara con el 0,8 y el −0,5 del reglamento.'),
      idea('Cd', 'Coeficiente de arrastre', 'C_d', 'F_x / (½ · ρ · U_0² · D)', 'La fuerza total sobre la torre, sin dimensiones. F sale del intercambio de cantidad de movimiento en el borde de la torre.'),
      { id: 'Rer', titulo: 'Reynolds real', sim: 'Re_real', ec: '[V] · [B] / [nuAire]', dec: 0, valor: r => r.ReReal, f: x => (x.V * x.B) / x.nuAire,
        nota: 'Decenas de millones: imposible en una red. Con aristas vivas (una torre prismática) los coeficientes casi no dependen de Re, por eso alcanza con simular a Re menor.' },
      { id: 'fd', titulo: 'Frecuencia de los remolinos', sim: 'f_d', ec: '[St] · [V] / [B]', unidad: 'Hz', dec: 3, valor: r => r.fd, f: x => (x.St * x.V) / x.B,
        nota: 'Cada cuánto se desprende un remolino de cada lado con el viento de diseño: empuja la torre de costado con esa frecuencia.' },
      { id: 'Vcr', titulo: 'Velocidad crítica', sim: 'V_cr', ec: '[n1] · [B] / [St]', unidad: 'm/s', dec: 1, valor: r => r.Vcr, f: x => (x.n1 * x.B) / x.St,
        control: { cond: '> [V]', ok: r => (r.Vcr ?? 0) > (r.V ?? 0), siNo: [
          { texto: 'Con menos viento que el de diseño los remolinos van al ritmo de la torre: puede entrar en resonancia de costado. Se estudia en túnel de viento real.' },
          { texto: 'Más rigidez sube n1 y con ella la velocidad crítica.', mueve: ['n1'] },
          { texto: 'Cambiar la forma (esquinas redondeadas o retiradas, aberturas) cambia St y desordena los remolinos.', mueve: ['St'] },
        ] },
        nota: 'El viento al que la frecuencia de los remolinos iguala la de la torre.' },
    ],
  };
  return { datos: () => ({ ...d0 }), calcular: calcularFlujo, capitulos: [red, med] };
}
