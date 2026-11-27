/**
 * El exoesqueleto de un cálculo, sin interfaz: los datos de cada viento (la torre con el exo), la verificación de las
 * barras (CIRSOC 301/302 o la del curso), el desplazamiento que se controla y los controles de la lista general.
 * Lo usan la etapa 08 (en la interfaz) y el cálculo en segundo plano (en el worker), con las mismas cuentas.
 * Cada objeto recuerda lo que ya calculó: la etapa, el riel, el avance, los controles y el informe piden lo mismo
 * varias veces por cálculo, y con el CIRSOC 301 cada pedido resuelve todas las caras otra vez.
 */
import { armarCara, conMalla, gammaExo, pesoExo, propsSeccion, seccionEn, type ClaseBarra, paraViento, calcularExo, cirsoc301, COMBOS_101_25, COMBOS_CURSO, COMBOS_OBLICUOS_101_25, COMBOS_OBLICUOS_CURSO, FY_F24, type Cirsoc301Barra, type EntradaExo, type ExoDef, type ResultadoExo } from './exo';
import { datosAltura, moduloHormigon, rigidez, rigidezPorNivel } from './diagramas';
import { plantaDeNivel } from './silueta';
import { exoConLosasJuntas } from './losasJuntas';
import { giroMalla, indiceBarraMalla, mallaDe, nombresMalla, MALLA_POR_DEFECTO, PATRONES_MALLA } from './exoMalla';
import type { MallaHoja } from '../xlsx/hojasG';
import type { Proyecto } from './modelo';
import type { PlanillaRes } from './planilla';
import type { Viento102 } from './cargas/cirsoc102';
import type { Control } from './verificaciones';
import type { Calculo } from './calculoProyecto';
import { datos201De } from './metodos/cirsoc';

export interface DatosExo { r: ResultadoExo; def: ExoDef; dir: 'A' | 'B'; ancho: number; tCaras: number[]; niveles: string[]; h: number; Eh: number;
  /** caras que siguen la planta: ancho y posición (|t|) de la cara en cada cota de zs */
  anchos?: number[]; ts?: number[];
  /** torre inclinada o corrida (Diseño → Perfil): corrimiento del centro de la torre en cada cota de zs, a lo largo de la cara (corr) y de costado (tc) */
  corr?: number[]; tc?: number[] }
export type DatosExoCompletos = DatosExo & { entrada: EntradaExo };
/** una malla del barrido de la ficha M: rigidez, acero y rigidez por tonelada con las mismas secciones; deriva / límite */
/** la malla para Pynite (ver datosPyniteMalla) */
export interface DatosPyniteMalla {
  E: number; Eh: number; zs: number[]; cx: number; cy: number; nudos: [number, number, number, number][]; barras: [number, number, number, number, boolean, boolean][]; nombres: string[];
  WA: number[]; WB: number[]; JA: number[]; JB: number[];
  app: { uA: number[]; uB: number[]; NA: number[]; NB: number[]; giro: number[]; anillos: number[] };
}
export interface FilaMalla { modulo: number; nudos: number; angulo: number; Jeq: number; peso: number; porTonelada: number; deriva: number }
/** lo que el worker manda ya calculado: la torre con el exo de cada viento y la verificación de las barras, por clave */
export interface SemillaExo { torre: Record<string, ResultadoExo>; barras: Record<string, Cirsoc301Barra[]> }

/** número en castellano con signo menos verdadero (el mismo formato que la interfaz) */
const fmt = (x: number, d = 2) => {
  if (!isFinite(x)) return '∞';
  const r = Math.abs(x) < 0.5 * 10 ** -d ? 0 : x;
  return r.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−');
};

/** lo que el cálculo necesita del exo (las partes del cálculo que se leen) */
export type CalculoParaExo = Pick<Calculo, 'asig' | 'valores' | 'cirsoc' | 'fem'>;

export class ExoDeCalculo {
  private memo = new Map<string, { v: unknown; error: string }>();
  /** el error del último cálculo del exo que falló (para explicarlo en la etapa) */
  ultimoError = '';
  constructor(readonly p: Proyecto, readonly calculo: CalculoParaExo, readonly metodo: string) {}

  /** el exo entra en el cálculo de los tabiques (métodos CIRSOC y FEM) */
  get enElCalculo(): boolean { return !!this.p.exo && (this.metodo === 'cirsoc' || this.metodo === 'fem'); }
  /** el viento del 102-25 si el método sigue las reglas del CIRSOC (CIRSOC o FEM); si no, null (el de la planilla o la guía) */
  get vientoReglamento(): Viento102 | null {
    return this.metodo === 'cirsoc' || this.metodo === 'fem' ? this.calculo.fem?.viento ?? this.calculo.cirsoc?.viento ?? null : null;
  }

  private recordar<T>(clave: string, def: ExoDef, f: () => T): T {
    const k = `${clave}|${JSON.stringify(def)}`;
    const x = this.memo.get(k);
    if (x) { this.ultimoError = x.error; return x.v as T; }
    const v = f();
    this.memo.set(k, { v, error: this.ultimoError });
    return v;
  }
  /** resultados que ya calculó otro hilo (el worker) con este mismo cálculo: la torre con el exo de cada viento */
  private sembrados = new Map<string, ResultadoExo>();
  /** lo que el worker ya calculó (la torre con el exo y la verificación de las barras), con las mismas claves */
  sembrar(s: SemillaExo) {
    for (const [k, r] of Object.entries(s.torre)) this.sembrados.set(k, r);
    for (const [k, v] of Object.entries(s.barras)) this.memo.set(k, { v, error: '' });
  }
  /** lo que calculó este objeto, para mandarlo desde el worker (sin funciones: se puede copiar entre hilos) */
  semilla(): SemillaExo {
    const s: SemillaExo = { torre: {}, barras: {} };
    for (const [k, x] of this.memo) {
      if (k.startsWith('301 ')) s.barras[k] = x.v as Cirsoc301Barra[];
      else if (k.startsWith('datos ') && x.v) s.torre[k] = (x.v as DatosExo).r;
    }
    return s;
  }

  datos(dir: 'A' | 'B', def: ExoDef): DatosExoCompletos | null {
    return this.recordar(`datos ${dir}`, def, () => this.datosSinMemoria(dir, def, this.sembrados.get(`datos ${dir}|${JSON.stringify(def)}`)));
  }
  private datosSinMemoria(dir: 'A' | 'B', def: ExoDef, hecho?: ResultadoExo): DatosExoCompletos | null {
    this.ultimoError = '';
    try {
      const { asig } = this.calculo, p = this.p;
      const R: PlanillaRes = this.calculo.valores;
      const alt = datosAltura(p, R.viento, R.mnyq, asig.filaNivel, dir);
      const iPB = p.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1);
      const zPB = p.niveles[iPB]?.cota ?? 0;
      const sobre = alt.filter(x => x.z > zPB + 1e-6).sort((a, b) => a.z - b.z);
      if (sobre.length < 2) return null;
      // métodos CIRSOC y FEM: el viento de resistencia del 102-25 (en FEM, con la frecuencia del modelo) y el ΣJ de la sección real
      const w102 = this.vientoReglamento;
      const zs = [zPB, ...sobre.map(x => x.z)];
      const W = w102 ? sobre.map(x => w102[dir].niveles.find((n: { z: number }) => Math.abs(n.z - (x.z - zPB)) < 1e-6)?.W ?? 0) : sobre.map(x => x.F);
      const rg0 = rigidez(R, p.hormigon || 'H30').find(x => x.dir === dir)!;
      const roto = this.calculo.cirsoc?.corr[dir === 'A' ? 'rotoA' : 'rotoB'];
      const rg = w102 && roto ? { ...rg0, J: roto.SJ } : rg0;
      const E = moduloHormigon(p.hormigon || 'H30');
      const Jniv = rigidezPorNivel(p, asig.piezas, dir, rg.J).sort((a, b) => a.z - b.z);
      // J de los tabiques que toman viento en cada piso; si arriba no hay ninguno (núcleo solo de gravedad), es 0: el exo toma todo
      const EJ = (z: number) => E * (Jniv.find(q => q.z >= z - 1e-6)?.J ?? rg.J);
      const { ancho, t, anchos, ts, corr, tc, anchosPerp } = this.anchosCara(dir, def, zs);
      // ficha M: la malla sobre la fachada real es una sola «cara» (la malla entera, proyectada en el plano del viento)
      const malla = def.tipo === 'M' ? mallaDe(p, def, zs) : undefined, tCaras = malla ? [0] : [-t, t];
      if (malla) {
        // arriba del tope de la malla, los pisos sin tabiques que tomen viento quedarían sueltos (corrimientos de kilómetros)
        const zTop = zs[malla.anillos[malla.anillos.length - 1]], sueltos = zs.slice(1).filter(z => z > zTop + 1e-6 && !(EJ(z) > 0));
        if (sueltos.length) throw new Error(`La malla llega hasta la cota ${fmt(zTop, 1)} m y arriba no hay tabiques que tomen el viento ${dir}: los pisos de las cotas ${fmt(sueltos[0], 1)} a ${fmt(sueltos[sueltos.length - 1], 1)} m quedarían sueltos. Subí «Malla hasta la cota» o dejala vacía (hasta la azotea).`);
      }
      // (con las losas de los pisos que junta un nivel, como la corona del Citicorp: también las carga el exo)
      const r = hecho ?? calcularExo(paraViento(conMalla(exoConLosasJuntas(p, def, dir), { malla, dir }), dir), zs, W, EJ, ancho, tCaras, E, anchos, corr, { anchosPerp });
      const h0 = zs[zs.length - 1] - zPB;
      return { r, def, dir, ancho, tCaras, niveles: sobre.map(x => x.nivel), h: h0, Eh: E, anchos, ts, corr, tc, entrada: { dir, zs, W, EJ, ancho, tCaras, Eh: E, h: h0, anchos, corr, anchosPerp, malla } };
    } catch (err) { this.ultimoError = err instanceof Error ? err.message : String(err); return null; }
  }

  /** ancho de la cara (y su posición t) del viento dir, fijo o en cada cota si la cara sigue la planta */
  anchosCara(dir: 'A' | 'B', def: ExoDef, zs: number[]) {
    const p = this.p, iPB = p.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1);
    const pl = plantaDeNivel(p, iPB), A = dir === 'A';
    // ficha F: los planos de los brazos pasan por las caras del núcleo (a ± medio núcleo), no por las fachadas
    const ancho = (A ? pl.L : pl.B) + 2 * def.separacion, t = def.tipo === 'F' ? Math.max(0.5, (def.nucleo ?? ancho / 3) / 2) : (A ? pl.B : pl.L) / 2 + def.separacion;
    // caras que siguen la planta de cada nivel (Hancock): ancho y posición de la cara en cada cota
    let anchos: number[] | undefined, ts: number[] | undefined;
    if (def.anchoVariable) {
      const plz = zs.map(z => { const i = p.niveles.findIndex(nv => Math.abs(nv.cota - z) < 1e-6); return plantaDeNivel(p, i >= 0 ? i : iPB); });
      anchos = plz.map(q => (A ? q.L : q.B) + 2 * def.separacion);
      ts = plz.map(q => (A ? q.B : q.L) / 2 + def.separacion);
    }
    // torre inclinada o corrida: cada nivel corrido (dx, dy) respecto de PB; las caras lo siguen
    const nivEn = (z: number) => p.niveles.find(nv => Math.abs(nv.cota - z) < 1e-6);
    const corrido = (f: (nv: typeof p.niveles[number]) => number | null | undefined) => { const v = zs.map(z => { const nv = nivEn(z); return (nv && f(nv)) || 0; }); return v.some(x => Math.abs(x) > 1e-9) ? v : undefined; };
    const corr = corrido(nv => (A ? nv.dy : nv.dx)), tc = corrido(nv => (A ? nv.dx : nv.dy));
    // la cara perpendicular: la del cinturón en la ficha F (sus planos pasan por el núcleo)
    const anchosPerp = def.tipo === 'F' ? zs.map(() => (A ? pl.B : pl.L) + 2 * def.separacion) : ts?.map(x => 2 * x);
    return { ancho, t, anchos, ts, corr, tc, anchosPerp };
  }

  /**
   * la geometría de la cara sin calcularla (sirve aunque todavía sea un mecanismo, mientras se arma barra por barra):
   * cotas sobre PB, ancho, posición de las caras y la cara armada
   */
  geometria(dir: 'A' | 'B', def: ExoDef) {
    try {
      const p = this.p, { asig } = this.calculo, R: PlanillaRes = this.calculo.valores;
      const alt = datosAltura(p, R.viento, R.mnyq, asig.filaNivel, dir);
      const iPB = p.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1), zPB = p.niveles[iPB]?.cota ?? 0;
      const zs = [zPB, ...alt.filter(x => x.z > zPB + 1e-6).sort((a, b) => a.z - b.z).map(x => x.z)];
      if (zs.length < 3) return null;
      const g = this.anchosCara(dir, def, zs);
      const malla = def.tipo === 'M' ? mallaDe(p, def, zs) : undefined;
      return { zs, ...g, tCaras: malla ? [0] : [-g.t, g.t], malla, cara: armarCara(paraViento(conMalla(def, { malla, dir }), dir), g.ancho, zs, 'cara', g.anchos, g.corr, { anchoPerp: g.anchosPerp?.[0] }) };
    } catch { return null; }
  }

  /** CIRSOC 301/302 de las barras de acero: con las combinaciones del 101-25 (métodos CIRSOC y FEM) o la del curso */
  /**
   * Ficha M: la rigidez de la malla al giro de la planta, como un Σ J·d² equivalente (m⁶, en hormigón como los tabiques):
   * el tubo de barras con las losas rígidas que giran, bajo un torsor con la forma del viento A, comparado con una
   * ménsula de J = 1 m⁴ bajo ese viento, en el último anillo. NaN si no hay malla.
   */
  jGiroMalla(def: ExoDef): number {
    return this.recordar('jGiro', def, () => {
      const d = this.datos('A', def);
      if (def.tipo !== 'M' || !d?.entrada.malla) return NaN;
      const { zs, W, Eh } = d.entrada, m = def.malla ?? MALLA_POR_DEFECTO;
      const g = mallaDe(this.p, { ...def, malla: { ...m, arriostrada: false } }, zs);
      const th = giroMalla(g, zs, W, def.E, (c, z) => propsSeccion(seccionEn(def, c, z)).A);
      // la ménsula de J = 1 m⁴ bajo las fuerzas W, en la cota de cada anillo; el J·d² equivalente ajusta el giro de todos
      // los anillos (mínimos cuadrados: θ ≈ u / J·d²), no solo el de arriba (en una cúpula, el último anillo es muy
      // chico y su giro depende de cómo se cierra la malla)
      const u = (x: number) => W.reduce((s, P, i) => { const a = zs[i + 1] - zs[0]; return s + (P * (x <= a ? x * x * (3 * a - x) : a * a * (3 * x - a))) / (6 * Eh); }, 0);
      let uu = 0, ut = 0;
      g.anillos.filter(k => k > 0).forEach(k => { const t = th[k - 1], ur = u(zs[k] - zs[0]); if (isFinite(t)) { uu += ur * ur; ut += ur * t; } });
      return ut > 0 ? uu / ut : NaN;
    });
  }
  /**
   * Ficha M: qué malla conviene. Con las mismas secciones, cada combinación de módulo (pisos de anillo a anillo, sin los
   * cortes a mano) y nudos por anillo da una rigidez (J equivalente, el promedio de los dos vientos) y un acero; la
   * rigidez por tonelada mide qué geometría rinde más. Con el ángulo medio de las diagonales y la deriva de servicio.
   */
  barridoMalla(def: ExoDef, modulos: number[], nudos: number[]): FilaMalla[] {
    const m0 = def.malla ?? MALLA_POR_DEFECTO, out: FilaMalla[] = [];
    for (const modulo of modulos) for (const n of nudos) {
      // (sin guardar cada malla en la memoria: son muchas y no se vuelven a pedir)
      const d = { ...def, modulo, cortes: undefined, malla: { ...m0, nudos: n } };
      const ds = (['A', 'B'] as const).map(dir => this.datosSinMemoria(dir, d));
      if (ds.some(x => !x)) continue;
      const [dA, dB] = ds as DatosExoCompletos[], g = dA.entrada.malla!;
      const diag = g.barras.filter(b => b.clase === 'diagonal').map(b => { const A = g.nudos[b.a], B = g.nudos[b.b]; return (Math.atan2(Math.abs(B.z - A.z), Math.hypot(B.x - A.x, B.y - A.y)) * 180) / Math.PI; });
      const Jeq = ((dA.r.caras[0]?.Jeq ?? 0) + (dB.r.caras[0]?.Jeq ?? 0)) / 2, peso = pesoExo(d, [dA.entrada, dB.entrada]);
      const fl = Math.max(this.flecha(dA).u / this.flecha(dA).lim, this.flecha(dB).u / this.flecha(dB).lim);
      out.push({ modulo, nudos: n, angulo: diag.length ? diag.reduce((s2, v) => s2 + v, 0) / diag.length : NaN, Jeq, peso, porTonelada: peso > 0 ? Jeq / peso : 0, deriva: fl });
    }
    return out;
  }
  /**
   * Ficha M: la malla para resolverla aparte como reticulado espacial (tools/motor_fem/pynite_malla.py): nudos, barras
   * con su sección y sus articulaciones, el viento y el J de los tabiques de cada piso, y lo que da la app con el viento
   * solo (sin peso ni losas), para comparar: el corrimiento de cada piso y la fuerza de cada barra.
   */
  datosPyniteMalla(def: ExoDef): DatosPyniteMalla | null {
    if (def.tipo !== 'M') return null;
    const dA = this.datos('A', def), dB = this.datos('B', def);
    if (!dA || !dB) return null;
    const g = dA.entrada.malla!, zs = dA.entrada.zs, Eh = dA.entrada.Eh, indice = indiceBarraMalla(g);
    const colRigida = (def.uniones?.columna ?? 'rigida') === 'rigida', baseArt = def.uniones?.base === 'articulada';
    const sin = (d: DatosExoCompletos) => { const en = d.entrada; return calcularExo(paraViento(conMalla({ ...d.def, pesoPropio: false }, en), d.dir), en.zs, en.W, en.EJ, en.ancho, en.tCaras, en.Eh, en.anchos, en.corr, { qLosa: 0, anchosPerp: en.anchosPerp }); };
    const rA = sin(dA), rB = sin(dB);
    const lista = g.barras.map((b, i) => [b, i] as const).filter(([b]) => b.clase !== 'anillo');
    const fuerzas = (r: ResultadoExo) => { const N = g.barras.map(() => 0); r.caras[0].esfuerzos.forEach(e => { const i = e.p3 ? indice(e.p3) : undefined; if (i !== undefined) N[i] = e.N; }); return lista.map(([, i]) => N[i]); };
    const thApp = giroMalla(mallaDe(this.p, { ...def, malla: { ...(def.malla ?? MALLA_POR_DEFECTO), arriostrada: false } }, zs), zs, dA.entrada.W, def.E, (c, z) => propsSeccion(seccionEn(def, c, z)).A);
    return {
      E: def.E, Eh, zs, cx: g.cx, cy: g.cy,
      nudos: g.nudos.map(q => [q.x, q.y, q.z, q.k]),
      barras: lista.map(([b]) => {
        const A = g.nudos[b.a], B = g.nudos[b.b], pr = propsSeccion(seccionEn(def, b.clase as ClaseBarra, Math.min(A.z, B.z)));
        const rel = (q: typeof A) => (b.clase === 'columna' ? !colRigida : q.anillo >= 0) || (q.k === 0 && baseArt);
        return [b.a, b.b, pr.A, pr.I, rel(A), rel(B)];
      }),
      nombres: lista.map(([, i]) => nombresMalla(g)[i]),
      WA: dA.entrada.W, WB: dB.entrada.W,
      JA: zs.slice(1).map(z => dA.entrada.EJ(z) / Eh), JB: zs.slice(1).map(z => dB.entrada.EJ(z) / Eh),
      app: { uA: [0, ...rA.u], uB: [0, ...rB.u], NA: fuerzas(rA), NB: fuerzas(rB), giro: [0, ...thApp], anillos: g.anillos },
    };
  }
  /** ficha M: los datos de la hoja «G · Malla» del Excel (nudos, barras, fuerzas con los dos vientos y la peor relación del CIRSOC 301) */
  hojaMalla(def: ExoDef): MallaHoja | null {
    if (def.tipo !== 'M') return null;
    const dA = this.datos('A', def), dB = this.datos('B', def), g = dA?.entrada.malla ?? dB?.entrada.malla;
    if (!g) return null;
    const nombres = nombresMalla(g), indice = indiceBarraMalla(g);
    const N: Record<'A' | 'B', (number | null)[]> = { A: g.barras.map(() => null), B: g.barras.map(() => null) };
    const ratio: (number | null)[] = g.barras.map(() => null);
    const reglamento = def.material !== 'hormigon';
    for (const [dir, d] of [['A', dA], ['B', dB]] as const) {
      if (!d) continue;
      const esf = d.r.caras[0]?.esfuerzos ?? [];
      const porId = new Map(esf.map(e => [e.id, e]));
      g.barras.forEach((b, i) => { if (b.clase !== 'anillo') N[dir][i] = 0; });
      esf.forEach(e => { const i = e.p3 ? indice(e.p3) : undefined; if (i !== undefined) N[dir][i] = e.N; });
      if (reglamento) this.verif301(d).forEach(v => {
        const i = v.cara === 'anillos' ? nombres.indexOf(v.id) : (() => { const e = porId.get(v.id); return e?.p3 ? indice(e.p3) : undefined; })();
        if (i !== undefined && i >= 0) ratio[i] = Math.max(ratio[i] ?? 0, v.ratio);
      });
    }
    const ens = ([dA, dB].filter(Boolean) as DatosExoCompletos[]).map(d => d.entrada);
    const Jg = this.jGiroMalla(def);
    return {
      patron: PATRONES_MALLA[(def.malla ?? MALLA_POR_DEFECTO).patron].nombre, gamma: gammaExo(def), peso: pesoExo(def, ens), Jgiro: Jg > 0 ? Jg : undefined,
      nudos: g.nudos.map((q, i) => [`N${i + 1}`, q.anillo >= 0 ? q.anillo + 1 : null, q.x, q.y, q.z]),
      barras: g.barras.map((b, i) => {
        const A = g.nudos[b.a], B = g.nudos[b.b], sec = seccionEn(def, b.clase, Math.min(A.z, B.z));
        return { id: nombres[i], clase: b.clase === 'anillo' ? 'anillo' : b.clase, a: b.a, b: b.b, L: Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z), sec: { b: sec.b, e: sec.e }, NA: N.A[i], NB: N.B[i], ratio: ratio[i] };
      }),
    };
  }
  verif301(d: DatosExoCompletos): Cirsoc301Barra[] {
    return this.recordar(`301 ${d.dir} ${d.ancho} ${d.tCaras.join(' ')}`, d.def, () => {
      const en = d.entrada, reglamento = !!this.vientoReglamento;
      // vientos oblicuos (quartering): las columnas de esquina con los dos vientos a la vez
      const otro = this.datos(d.dir === 'A' ? 'B' : 'A', d.def)?.entrada;
      const combos = reglamento ? [...COMBOS_101_25, ...COMBOS_OBLICUOS_101_25] : [...COMBOS_CURSO, ...COMBOS_OBLICUOS_CURSO];
      return cirsoc301(conMalla(exoConLosasJuntas(this.p, d.def, d.dir), en), en.zs, en.W, en.EJ, en.ancho, en.tCaras, en.Eh, en.anchos, FY_F24, { combos, costura: d.def.sinCostura ? false : true, otro, dir: d.dir, corr: en.corr, anchosPerp: en.anchosPerp });
    });
  }

  /**
   * Corrimiento de cada nivel de la torre con el exo (tabiques y exo juntos) con otras fuerzas por nivel: las del túnel
   * de viento, por ejemplo. Las fuerzas van por altura sobre PB (m) y en t; se suman a la cota más cercana del exo.
   * Devuelve z sobre PB (con PB en 0) y el corrimiento (m), o null si el exo no se puede calcular.
   */
  corrimientos(dir: 'A' | 'B', def: ExoDef, fuerzas: { z: number; F: number }[]): { z: number; d: number }[] | null {
    const d = this.datos(dir, def);
    if (!d) return null;
    const en = d.entrada, zPB = en.zs[0], sobre = en.zs.slice(1);
    const W = sobre.map(() => 0);
    for (const q of fuerzas) {
      if (q.z <= 1e-6 || !isFinite(q.F)) continue;          // la de PB no mueve nada
      let k = 0;
      sobre.forEach((z, i) => { if (Math.abs(z - zPB - q.z) < Math.abs(sobre[k] - zPB - q.z)) k = i; });
      W[k] += q.F;
    }
    const r = calcularExo(paraViento(conMalla(exoConLosasJuntas(this.p, def, dir), en), dir), en.zs, W, en.EJ, en.ancho, en.tCaras, en.Eh, en.anchos, en.corr, { anchosPerp: en.anchosPerp });
    return [{ z: 0, d: 0 }, ...r.zs.slice(1).map((z, i) => ({ z: z - zPB, d: r.u[i] }))];
  }

  /** desplazamiento de la azotea que se controla y su límite: con el viento de servicio y h/límite de deriva (CIRSOC) o h/500 (curso) */
  flecha(d: DatosExo): { u: number; lim: number; texto: string } {
    const n = d.r.u.length - 1, w = this.vientoReglamento;
    if (w) { const limD = datos201De(this.p).limiteDeriva; return { u: d.r.u[n] * w.servicio.relacion, lim: d.h / limD, texto: `deriva de servicio (${fmt(w.servicio.relacion * 100, 0)} % del viento de cálculo) ≤ h/${limD}` }; }
    return { u: d.r.u[n], lim: d.h / (d.def.limiteH ?? 500), texto: `flecha ≤ h/${d.def.limiteH ?? 500}` };
  }

  /**
   * Los controles del exoesqueleto en la lista general (Resumen, informe, lámina): el desplazamiento de la azotea con el
   * exo y las barras (CIRSOC 301/302 con el método CIRSOC o FEM; tensión y pandeo con los del curso), en cada viento.
   */
  controles(): Control[] {
    const def = this.p.exo;
    if (!def || !this.enElCalculo) return [];
    const out: Control[] = [];
    const reglamento = !!this.vientoReglamento && def.material !== 'hormigon';
    for (const dir of ['A', 'B'] as const) {
      const d = this.datos(dir, def);
      if (!d) { out.push({ grupo: 'Exoesqueleto', nombre: `Exoesqueleto, viento ${dir}`, criterio: 'que se pueda calcular', fuente: 'etapa 08', planilla: null, guia: null, unidad: '', estado: 'atención', nota: 'Faltan datos para calcular el exoesqueleto (niveles, piezas o viento).' }); continue; }
      const fl = this.flecha(d);
      // con el viento del reglamento, la deriva de servicio de la torre con el exo ya está en «Rigidez» (método CIRSOC)
      if (!this.vientoReglamento) out.push({ grupo: 'Exoesqueleto', nombre: `Desplazamiento de la azotea con el exo, viento ${dir}`, criterio: fl.texto, fuente: 'etapa 08 · ménsula + exo', planilla: null, guia: fl.u * 1000, unidad: 'mm',
        estado: fl.u <= fl.lim ? 'verifica' : 'no verifica', nota: `límite ${fmt(fl.lim * 1000, 0)} mm; el exo toma el ${fmt(d.r.fraccionExo * 100, 0)} % del momento` });
      if (reglamento) {
        const v = this.verif301(d), peor = v.reduce((m, x) => (x.ratio > m.ratio ? x : m), v[0]), malos = v.filter(x => !x.verifica).length;
        out.push({ grupo: 'Exoesqueleto', nombre: `Barras del exo (CIRSOC 301/302), viento ${dir}`, criterio: 'interacción ≤ 1 y pared no esbelta en todas', fuente: 'CIRSOC 301, cap. H; 302, tabla 2.2.1', planilla: null, guia: peor?.ratio ?? null, unidad: '',
          estado: malos ? 'no verifica' : 'verifica', nota: peor ? `la más cargada: ${peor.id} (${peor.clase}, ${peor.combinacion})${malos ? `; ${malos} de ${v.length} no verifican` : ''}` : undefined });
      } else {
        const cs = d.r.controles, malos = cs.filter(c => c.estado !== 'verifica').length, peor = cs.reduce((m, c) => (c.sigma > m.sigma ? c : m), cs[0]);
        out.push({ grupo: 'Exoesqueleto', nombre: `Barras del exo (tensión y pandeo), viento ${dir}`, criterio: `σ ≤ σadm = ${fmt(def.sigmaAdm / 10, 0)} kg/cm² y sin pandeo`, fuente: 'etapa 08', planilla: null, guia: peor ? peor.sigma / 10 : null, unidad: 'kg/cm²',
          estado: malos ? 'no verifica' : 'verifica', nota: peor ? `la más cargada: ${peor.id} (${peor.clase})${malos ? `; ${malos} de ${cs.length} no verifican` : ''}` : undefined });
      }
    }
    return out;
  }
}
