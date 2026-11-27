/**
 * Del proyecto del alumno a los datos de la planilla original: cotas, anchos, perfiles equivalentes
 * en las hojas J, distancias de la rototraslación y datos de flexocompresión.
 *
 * Reglas del curso (acordadas con la cátedra / el alumno):
 *  - Un muro paralelo al viento es alma; uno perpendicular es ala y va al extremo del alma
 *    a la que se pega que tenga más cerca (si está justo en la mitad, arriba).
 *  - Cada muro va en una sola pieza por dirección, pero se carga en las dos direcciones.
 *  - Varias alas en un mismo extremo se juntan en una sola: espesores sumados y ancho que conserva el área
 *    (criterio provisorio: la medida del ala equivalente es una pregunta abierta para la cátedra).
 *  - La posición de cada pieza es el baricentro de sus muros, pesado por área, medido desde el eje de simetría de PB.
 *  - Plantilla simétrica: solo el muro suelto y la doble T con alas iguales y centradas en el alma.
 *    Todo lo demás (C, U, L, T, E, alas distintas) va en las columnas asimétricas, un muro por columna.
 *  - El tipo de fila es libre en las dos hojas. En «paralelos» se prefieren las filas en las que la hoja de
 *    flexocompresión lee el módulo que corresponde; si no alcanzan, se usa otra fila y la app calcula la
 *    flexocompresión con el módulo correcto (columna «Guía») y avisa.
 */
import { FLEX_D_FIJO, FLEX_FILA_NUEVO, N_FILAS, RANURA_FILA_NUEVO, TIPO_FILA_PARALELOS, calcFilaJ, type FilaJ, type PlanillaDatos, type TipoFila } from './planilla';
import { config } from './config';
import { areaMuro, dInterior, entraEnCalculo, NOMBRE_CLASE, rectangulos, tipoDe, type ClasePieza, type Muro, type Proyecto } from './modelo';
import { acople, propiedades, rectanguloEquivalente } from './perfil';
import { detectarJuntas, huellasLimpias, propiedadesPoligonos } from './juntas';
import { seccionReal } from './seccionPieza';
import { criterioDelProyecto } from './escuadra';
import { propsPoligonos, seccionDebil } from './aberturas';

export type Direccion = 'A' | 'B';
export type Papel = 'alma' | 'alma der.' | 'ala sup.' | 'ala inf.' | 'columna' | 'tubo' | 'perfil' | 'fuera del cálculo' | 'sin pieza';
export type Molde = 'simétrico' | 'asimétrico' | 'tubo' | 'pórtico';

export interface PiezaEquivalente {
  nombre: string;
  dir: Direccion;
  muros: string[];
  molde: Molde;
  fila: FilaJ;
  /** posición en planta perpendicular al viento (m), desde el eje de simetría de PB */
  posicion: number;
  area: number;
  areaInf: number;
  /** fila asignada en la hoja J (0 a 19) o null si no entró */
  filaHoja: number | null;
  avisos: string[];
  /** J de la sección real (cada muro con su Steiner, respecto del baricentro) y J del molde de la hoja (m⁴) */
  Jreal?: number;
  /** con calados: la posición del baricentro de la sección real (el corte débil), la que va con el J real */
  posicionReal?: number;
  Jhoja?: number;
  /** alas en el medio del alma que la app sumó al ala superior (sin papel elegido a mano) */
  alasMedio?: string[];
  /** clase elegida a mano (vacío = automática) */
  clase?: import('./modelo').ClasePieza;
  /** elemento especial: su sección real (área, J en este viento, baricentro) y el rectángulo equivalente de la hoja J */
  especial?: { A: number; J: number; xg: number; yg: number; b: number; h: number; tipos: string[] };
}

export interface Asignacion {
  datos: PlanillaDatos;
  piezas: PiezaEquivalente[];
  /** papel de cada muro en cada dirección */
  papeles: Record<string, { A: Papel; B: Papel }>;
  avisos: string[];
  /** índice de la fila de viento/M,NyQ de cada nivel del proyecto */
  filaNivel: number[];
}

/** Filas de «paralelos» a las que les faltan las fórmulas Y y AC en la planilla virgen (piezas 8 y 9). */
export const FILAS_SIN_YAC = [7, 8];
/** Planilla anterior: «Rototrasl. cara menor» suma ΣJ y ΣJ·x de las perpendiculares en las filas 31 a 38 (B51 = SUM(B28:B38)), que leen las piezas 1 a 8 del viento A. */
export const FILAS_CR_ACTUAL = 8;
/** Filas de «paralelos» con O = 0 fijo (piezas 18 a 20). */
export const FILAS_O0 = [17, 18, 19];

const r4 = (x: number) => Math.round(x * 10000) / 10000;

// ------------------------------------------------------------------ método de la planilla (especificación, sección 7)
/**
 * Método simplificado de la cátedra para armar una pieza de tabiques (especificación, secciones 6, 7, 9 y 14):
 *  1. baricentro de referencia de la pieza, una sola vez, con la geometría original;
 *  2. muros perpendiculares al viento (alas) y paralelos (almas);
 *  3–4. alas sobre el baricentro → ala superior: ancho = el muro más corto, alto = suma de espesores (no conserva el
 *       área); alas bajo el baricentro → ala inferior, con la misma regla;
 *  5. almas a la izquierda y a la derecha del baricentro: largo = suma de los largos, espesor = el más fino;
 *     en una pieza simétrica hay un solo grupo de almas;
 *  6. simétrica si el baricentro cae dentro del material, asimétrica si cae fuera.
 * Posición (supuesto 14.3): la sección simplificada se apoya en el borde superior e izquierdo de la caja de los muros;
 * ordenada perpendicular al viento = borde izquierdo + AL (asimétricas) o + medio ancho (simétricas).
 * Convención (supuesto 14.1): viento A, arriba = +y e izquierda = −x; viento B, arriba = +x e izquierda = +y.
 * Un tabique suelto va solo en la hoja de su dirección fuerte (sección 9).
 */
export function perfilPlanilla(nombre: string, dir: Direccion, muros0: Muro[], papeles: Asignacion['papeles'], forzar: 'simétrico' | 'asimétrico' | null = null): PiezaEquivalente {
  const A = dir === 'A', dirAlma = A ? 'Y' : 'X';
  const avisos: string[] = [];
  const set = (m: Muro, p: Papel) => { papeles[m.id] = { ...(papeles[m.id] ?? { A: 'sin pieza', B: 'sin pieza' }), [dir]: p }; };
  const rol = (m: Muro) => (A ? m.rolA : m.rolB) || '';
  const fuera = muros0.filter(m => rol(m) === 'fuera');
  fuera.forEach(m => set(m, 'fuera del cálculo'));
  const muros = muros0.filter(m => rol(m) !== 'fuera');
  const area = seccionReal(muros0)?.A ?? muros0.reduce((a, m) => a + areaMuro(m), 0);
  const areaInf = muros0.reduce((a, m) => a + m.areaInf, 0);
  // coordenadas del método: s a lo largo del viento (+ = arriba), t perpendicular (+ = derecha)
  const s = (m: Muro) => (A ? m.y : m.x), t = (m: Muro) => (A ? m.x : -m.y);
  const esAlma = (m: Muro) => m.dir === dirAlma;
  const medioS = (m: Muro) => (esAlma(m) ? m.largo : m.espesor) / 2, medioT = (m: Muro) => (esAlma(m) ? m.espesor : m.largo) / 2;
  const base = { nombre, dir, muros: muros0.map(m => m.id), area, areaInf, filaHoja: null, avisos, posicion: 0 };
  if (!muros.length) return { ...base, molde: 'simétrico', fila: {} };
  const aT = (x: number) => r4(A ? x : -x);                       // de t a la coordenada de la planta (x en A, y en B)
  const Am = muros.reduce((q, m) => q + m.largo * m.espesor, 0);
  const sg = muros.reduce((q, m) => q + m.largo * m.espesor * s(m), 0) / Am;
  const tg = muros.reduce((q, m) => q + m.largo * m.espesor * t(m), 0) / Am;
  const tMin = Math.min(...muros.map(m => t(m) - medioT(m))), tMax = Math.max(...muros.map(m => t(m) + medioT(m)));
  const sMax = Math.max(...muros.map(m => s(m) + medioS(m)));
  const almas = muros.filter(esAlma), alas = muros.filter(m => !esAlma(m));
  const f3 = (v: number) => String(r4(v)).replace('.', ',');

  // tabique suelto: solo en la hoja de su dirección fuerte
  if (muros.length === 1) {
    const m = muros[0];
    if (!esAlma(m)) {
      // no es «fuera del cálculo»: trabaja en el otro viento (su dirección fuerte); en este no tiene pieza
      set(m, 'sin pieza');
      avisos.push(`Método planilla: ${m.id} es un tabique suelto perpendicular a este viento; va solo en la hoja de su dirección fuerte (en este viento no tiene pieza, pero sigue en el cálculo).`);
      return { ...base, molde: 'simétrico', fila: {} };
    }
    set(m, 'alma');
    return { ...base, posicion: aT(t(m)), molde: 'simétrico', fila: { B: m.espesor, C: m.largo } };
  }
  if (!almas.length) {
    alas.forEach(m => set(m, 'sin pieza'));
    avisos.push('Método planilla: la pieza no tiene muros paralelos a este viento (almas); no entra en esta hoja (sigue en el cálculo del otro viento).');
    return { ...base, molde: 'simétrico', fila: {} };
  }
  const sup = alas.filter(m => s(m) >= sg), inf = alas.filter(m => s(m) < sg);
  const grupoAla = (g: Muro[]) => (g.length ? { b: r4(Math.min(...g.map(m => m.largo))), d: r4(g.reduce((q, m) => q + m.espesor, 0)) } : { b: 0, d: 0 });
  // almas: las que están en la misma línea (una a continuación de la otra) suman sus largos, con el espesor más fino;
  // las líneas paralelas, una al lado de la otra (las dos caras de un cajón), suman sus espesores, con el largo más corto
  // (como la cátedra: un núcleo de dos almas de 0,35 × 10,43 va como un alma de 0,70 × 10,43)
  const grupoAlma = (g: Muro[]) => {
    if (!g.length) return { b: 0, h: 0 };
    const lineas: Muro[][] = [];
    [...g].sort((a, b) => t(a) - t(b)).forEach(m => {
      const l = lineas.find(x => x.some(o => Math.abs(t(o) - t(m)) < (o.espesor + m.espesor) / 2 - 1e-9));
      if (l) l.push(m); else lineas.push([m]);
    });
    const c = lineas.map(l => ({ b: Math.min(...l.map(m => m.espesor)), h: l.reduce((q, m) => q + m.largo, 0) }));
    return { b: r4(c.reduce((q, x) => q + x.b, 0)), h: r4(Math.min(...c.map(x => x.h))) };
  };
  const S = grupoAla(sup), I = grupoAla(inf);
  sup.forEach(m => set(m, 'ala sup.')); inf.forEach(m => set(m, 'ala inf.'));
  // ¿el baricentro cae dentro del material?
  // simétrica: el baricentro cae dentro del material o sobre el eje de simetría de la pieza (en el medio, a lo ancho:
  // una doble T, un cajón); asimétrica: corrido hacia un lado (una C, una U, una L). A mano, la elige el usuario.
  const enEje = Math.abs(tg - (tMin + tMax) / 2) <= 0.01 * Math.max(1e-9, tMax - tMin);
  const dentro = forzar ? forzar === 'simétrico' : enEje || muros.some(m => Math.abs(t(m) - tg) <= medioT(m) + 1e-9 && Math.abs(s(m) - sg) <= medioS(m) + 1e-9);
  const txtAlas = `ala sup. ${f3(S.b)} × ${f3(S.d)} m (${sup.map(m => m.id).join(', ') || '—'}), ala inf. ${f3(I.b)} × ${f3(I.d)} m (${inf.map(m => m.id).join(', ') || '—'})`;
  if (dentro) {
    const W = grupoAlma(almas);
    almas.forEach(m => set(m, 'alma'));
    const ancho = Math.max(W.b, S.b, I.b);
    avisos.push(`${forzar ? 'Clasificada a mano como simétrica' : `Método planilla: pieza simétrica (el baricentro cae ${enEje ? 'sobre su eje de simetría' : 'dentro del material'})`}: alma ${f3(W.b)} × ${f3(W.h)} m (${almas.map(m => m.id).join(', ')}), ${txtAlas}.`);
    return { ...base, posicion: aT(tMin + ancho / 2), molde: 'simétrico', fila: { B: W.b, C: W.h, F: S.b, G: S.d, J: I.b, K: I.d } };
  }
  let izq = almas.filter(m => t(m) <= tg), der = almas.filter(m => t(m) > tg);
  // un solo grupo de almas, a la derecha: va como alma izquierda del molde (mismo J); la posición se mide desde el borde derecho
  const espejo = !izq.length && der.length > 0;
  if (espejo) { izq = der; der = []; }
  const L = grupoAlma(izq), R = grupoAlma(der);
  izq.forEach(m => set(m, 'alma')); der.forEach(m => set(m, 'alma der.'));
  const fila: FilaJ = { W: S.b, X: S.d, Z: L.b, AB: L.h, AE: R.b, AF: R.h, AH: I.b, AI: I.d };
  const k = calcFilaJ({ S: 0.01, ...fila }, !A, false);
  const perp = espejo ? tMax - k.AL : tMin + k.AL;
  avisos.push(`${forzar ? 'Clasificada a mano como asimétrica' : 'Método planilla: pieza asimétrica (el baricentro cae fuera del material y corrido de su eje)'}: ${txtAlas}, alma izq. ${f3(L.b)} × ${f3(L.h)} m (${izq.map(m => m.id).join(', ')}), alma der. ${f3(R.b)} × ${f3(R.h)} m (${der.map(m => m.id).join(', ') || '—'}); AK = ${f3(k.AK)} m, AL = ${f3(k.AL)} m${espejo ? ' (un solo grupo de almas, a la derecha: va como alma izquierda y AL se mide desde el borde derecho)' : ''}; ordenada a lo largo del viento (borde superior − AK) ${f3(sMax - k.AK)} m.`);
  return { ...base, posicion: aT(perp), molde: 'asimétrico', fila };
}

// ------------------------------------------------------------------ clase elegida a mano
/**
 * Pieza armada con la clase que eligió el usuario. Simétrica y asimétrica usan el método de la cátedra (sección 7) con el
 * molde forzado; tubo y pórtico, sus columnas de la hoja J; singular y especial van como el rectángulo equivalente de
 * la sección real (mismo J en este viento y misma área): un tabique solo da su propio rectángulo.
 */
function piezaPorClase(nombre: string, dir: Direccion, muros: Muro[], papeles: Asignacion['papeles'], clase: ClasePieza): PiezaEquivalente {
  const tabiques = muros.every(m => tipoDe(m) === 'tabique' && !m.portico);
  const otra = (txt: string) => { const pz = elegirPerfil(nombre, dir, muros, papeles); pz.avisos.push(`${NOMBRE_CLASE[clase]}: ${txt}; se usa la clasificación automática.`); return pz; };
  if ((clase === 'simetrica' || clase === 'asimetrica') && tabiques) {
    const pz = perfilPlanilla(nombre, dir, muros, papeles, clase === 'simetrica' ? 'simétrico' : 'asimétrico');
    return { ...pz, clase };
  }
  if (clase === 'simetrica' || clase === 'asimetrica') return otra('el molde de la hoja es de tabiques rectos (hay tubos, perfiles o columnas de pórtico); para esta pieza conviene «Elemento especial»');
  if (clase === 'tubo') {
    if (muros.length === 1 && tipoDe(muros[0]) === 'tubo-circ') return { ...elegirPerfil(nombre, dir, muros, papeles), clase };
    return otra('un tubo circular es un solo elemento de tipo tubo');
  }
  if (clase === 'portico') {
    if (muros.length !== 2) return otra(`un pórtico tiene dos columnas y esta pieza tiene ${muros.length} elementos`);
    return { ...perfilEquivalente(nombre, dir, muros.map(m => ({ ...m, portico: m.portico ?? true })), papeles), clase };
  }
  // singular o especial: el rectángulo equivalente de la sección real
  const dirAlma = dir === 'A' ? 'Y' : 'X';
  const avisos: string[] = [];
  const set = (m: Muro, p: Papel) => { papeles[m.id] = { ...(papeles[m.id] ?? { A: 'sin pieza', B: 'sin pieza' }), [dir]: p }; };
  const sr = seccionReal(muros);
  const area = sr ? sr.A + muros.filter(m => m.aberturas?.length).reduce((q, m) => q + propsPoligonos(seccionDebil(m) ?? []).A, 0) : muros.reduce((q, m) => q + (m.aberturas?.length ? propsPoligonos(seccionDebil(m) ?? []).A : areaMuro(m)), 0);
  const xg = sr && !muros.some(m => m.aberturas?.length) ? sr.xg : muros.reduce((q, m) => q + areaMuro(m) * m.x, 0) / Math.max(1e-12, muros.reduce((q, m) => q + areaMuro(m), 0));
  const yg = sr && !muros.some(m => m.aberturas?.length) ? sr.yg : muros.reduce((q, m) => q + areaMuro(m) * m.y, 0) / Math.max(1e-12, muros.reduce((q, m) => q + areaMuro(m), 0));
  const base = { nombre, dir, muros: muros.map(m => m.id), area, areaInf: muros.reduce((q, m) => q + m.areaInf, 0), filaHoja: null, avisos, posicion: dir === 'A' ? xg : yg, clase };
  if (clase === 'singular' && muros.length === 1 && tipoDe(muros[0]) === 'tabique' && !muros[0].aberturas?.length) {
    const m = muros[0];
    set(m, m.dir === dirAlma ? 'alma' : 'ala sup.');
    // paralelo al viento: su J fuerte; perpendicular: el débil (como en la hoja de la otra dirección)
    return { ...base, molde: 'simétrico', fila: m.dir === dirAlma ? { B: m.espesor, C: m.largo } : { B: m.largo, C: m.espesor } };
  }
  const J = Jreal(muros, dir);
  if (!(J > 0 && area > 0)) return otra('no se pudo calcular la sección');
  // sin redondear (al 1e-8 m): el J del rectángulo de la hoja queda igual al de la sección real (la hoja «Elementos especiales» lo controla)
  const h = Math.round(Math.sqrt((12 * J) / area) * 1e8) / 1e8, b = Math.round((area / h) * 1e8) / 1e8;
  muros.forEach(m => set(m, m.dir === dirAlma ? 'alma' : 'ala sup.'));
  const tipos = [...new Set(muros.map(m => (m.aberturas?.length ? 'calado' : tipoDe(m) === 'perfil' ? 'perfil (oblicuo o curvo)' : tipoDe(m))))];
  const f3 = (v: number) => v.toFixed(3).replace('.', ',');
  avisos.push(`${NOMBRE_CLASE[clase]}: en la hoja J va el rectángulo equivalente de ${f3(b)} × ${f3(h)} m (mismo J = ${f3(J)} m⁴ y misma área = ${f3(area)} m² que la sección real)${clase === 'especial' ? '; su geometría va en la hoja «Elementos especiales»' : ''}.`);
  return { ...base, molde: 'simétrico', fila: { B: b, C: h }, Jreal: J, ...(clase === 'especial' ? { especial: { A: area, J, xg, yg, b, h, tipos } } : {}) };
}

// ------------------------------------------------------------------ perfil equivalente
export function perfilEquivalente(nombre: string, dir: Direccion, muros: Muro[], papeles: Asignacion['papeles']): PiezaEquivalente {
  const dirAlma = dir === 'A' ? 'Y' : 'X';
  const s = (m: Muro) => (dir === 'A' ? m.y : m.x);            // coordenada en la dirección del viento
  const t = (m: Muro) => (dir === 'A' ? m.x : m.y);            // coordenada transversal
  const avisos: string[] = [];
  // (muros que se pisan: el área y el baricentro de su unión, sin contar dos veces lo superpuesto)
  const sr = seccionReal(muros);
  const area = sr ? sr.A : muros.reduce((a, m) => a + areaMuro(m), 0);
  // posición del baricentro de las áreas, sin redondear (la planilla de la guía la calcula con fórmulas y tiene que dar igual)
  const posicion = sr ? (dir === 'A' ? sr.xg : sr.yg) : muros.reduce((a, m) => a + areaMuro(m) * t(m), 0) / area;
  const areaInf = muros.reduce((a, m) => a + m.areaInf, 0);
  const base = { nombre, dir, muros: muros.map(m => m.id), posicion, area, areaInf, filaHoja: null, avisos };
  const set = (m: Muro, p: Papel) => { papeles[m.id] = { ...(papeles[m.id] ?? { A: 'sin pieza', B: 'sin pieza' }), [dir]: p }; };

  // pórtico: dos columnas unidas por una viga, alineadas con el viento (columnas AO a AU de la hoja J)
  const cols = muros.filter(m => m.portico);
  // un pórtico son dos columnas; con otra cantidad, las columnas se calculan como tabiques (no se dejan fuera)
  if (cols.length && cols.length === muros.length && cols.length !== 2) avisos.push(`Un pórtico tiene dos columnas y esta pieza tiene ${cols.length}: se calculan como tabiques.`);
  if (cols.length === 2 && cols.length === muros.length) {
    const enV = (m: Muro) => (m.dir === dirAlma ? m.largo : m.espesor), tr = (m: Muro) => (m.dir === dirAlma ? m.espesor : m.largo);
    const [c1, c2] = [...cols].sort((a, b) => s(a) - s(b));
    if (cols.length === 2 && Math.abs(t(c1) - t(c2)) <= Math.max(tr(c1), tr(c2)) / 2 + 0.05) {
      set(c1, 'columna'); set(c2, 'columna');
      const AQ = r4(s(c2) + enV(c2) / 2 - (s(c1) - enV(c1) / 2));
      if (Math.abs(tr(c1) - tr(c2)) > 1e-6 || Math.abs(enV(c1) - enV(c2)) > 1e-6) avisos.push('Pórtico con columnas distintas: la hoja J las lleva al medio del pórtico (AQ/2), no al baricentro real; mirá la diferencia de J.');
      return { ...base, molde: 'pórtico', fila: { AO: tr(c1), AP: enV(c1), AQ, AT: tr(c2), AU: enV(c2) } };
    }
    // pórtico en diagonal: su rigidez en el plano del pórtico se reparte J·sen²θ (viento A) y J·cos²θ (viento B);
    // en la hoja J va el rectángulo equivalente con ese J y el área de las columnas
    if (cols.length === 2) {
      const dx = c2.x - c1.x, dy = c2.y - c1.y, L = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
      const sn = Math.sin(th), cs = Math.cos(th);
      const diagonal = L > 0 && Math.abs(sn) > 0.05 && Math.abs(cs) > 0.05;
      if (diagonal) {
        const ux = dx / L, uy = dy / L, cx = (c1.x + c2.x) / 2, cy = (c1.y + c2.y) / 2;
        const Jplano = cols.reduce((q, m) => { const d = (m.x - cx) * ux + (m.y - cy) * uy; return q + Jreal([m], 'A') * sn * sn + Jreal([m], 'B') * cs * cs + areaMuro(m) * d * d; }, 0);
        const Jv = Jplano * (dir === 'A' ? sn * sn : cs * cs);
        cols.forEach(m => set(m, 'columna'));
        const grados = ((th * 180) / Math.PI + 180) % 180;
        const { b, h } = rectanguloEquivalente(Jv, area);
        avisos.push(`Pórtico en diagonal (${grados.toFixed(0)}°): toma ${dir === 'A' ? 'sen²θ' : 'cos²θ'} = ${((dir === 'A' ? sn * sn : cs * cs) * 100).toFixed(0)} % de su J en el plano. En la hoja J va el rectángulo equivalente de ${b.toFixed(3).replace('.', ',')} × ${h.toFixed(3).replace('.', ',')} m.`);
        return { ...base, molde: 'simétrico', fila: { B: b, C: h }, Jreal: Jv };
      }
    }
    // el pórtico trabaja en su plano (el otro viento): en este no tiene pieza, pero no está «fuera del cálculo»
    cols.forEach(m => set(m, 'sin pieza'));
    avisos.push(`El pórtico ${muros.map(m => m.id).join('–')} trabaja en su plano: en este viento no toma carga (sí en el otro).`);
    return { ...base, molde: 'pórtico', fila: {} };
  }
  // perfil irregular (solo o con otros muros en la pieza): en la hoja J va el rectángulo equivalente de este viento,
  // con el mismo J (exacto, con Steiner) y la misma área
  const perf = muros.filter(m => tipoDe(m) === 'perfil');
  if (perf.length) {
    const J = Jreal(muros, dir);
    muros.forEach(m => set(m, 'perfil'));
    if (!(J > 0 && area > 0)) return { ...base, molde: 'simétrico', fila: {} };
    const { b, h } = rectanguloEquivalente(J, area);
    const f2 = (v: number) => v.toFixed(3).replace('.', ',');
    avisos.push(`Perfil irregular: en la hoja J va el rectángulo equivalente de ${f2(b)} × ${f2(h)} m (mismo J y misma área). La flexión usa la fibra real del contorno.`);
    perf.forEach(m => { const k = propiedades(m.perfil!); if (acople(k) > 0.1) avisos.push(`${m.id}: J xy pesa ${(acople(k) * 100).toFixed(0)} % (el perfil no es simétrico respecto de x ni de y): la flexión se tuerce hacia el otro lado; el cálculo del curso sigue por direcciones.`); });
    return { ...base, molde: 'simétrico', fila: { B: b, C: h }, Jreal: J };
  }
  const circ = muros.filter(m => tipoDe(m) === 'tubo-circ');
  if (circ.length) {
    if (muros.length > 1) avisos.push('Un tubo circular tiene que ser una pieza sola; se usa solo el primero.');
    set(circ[0], 'columna');
    return { ...base, molde: 'tubo', fila: { S: circ[0].largo, T: dInterior(circ[0]) || undefined } };
  }
  // tubo rectangular: caja en las columnas asimétricas (ala sup., dos almas, ala inf.); el J sale exacto
  const caja = muros.filter(m => tipoDe(m) === 'tubo-rect');
  if (caja.length) {
    if (muros.length > 1) avisos.push('Un tubo rectangular tiene que ser una pieza sola; se usa solo el primero.');
    const m = caja[0];
    const enViento = dir === 'A' ? (m.ladoY ?? m.largo) : m.largo, trans = dir === 'A' ? m.largo : (m.ladoY ?? m.largo);
    const e = Math.min(m.espesor, enViento / 2, trans / 2);
    set(m, 'tubo');
    if (e >= enViento / 2 || e >= trans / 2) return { ...base, molde: 'simétrico', fila: { B: trans, C: enViento } };   // macizo
    return { ...base, molde: 'asimétrico', fila: { W: trans, X: e, Z: e, AB: enViento - 2 * e, AE: e, AF: enViento - 2 * e, AH: trans, AI: e } };
  }
  // papel elegido a mano para este viento (vacío = el que propone la app)
  const rol = (m: Muro) => (dir === 'A' ? m.rolA : m.rolB) || '';
  const fuera = muros.filter(m => rol(m) === 'fuera');
  fuera.forEach(m => set(m, 'fuera del cálculo'));
  if (fuera.length) avisos.push(`Fuera del molde (elegido a mano): ${fuera.map(m => m.id).join(', ')}; no suman al J de la hoja.`);
  const activos = muros.filter(m => rol(m) !== 'fuera');
  let almas = activos.filter(m => m.dir === dirAlma);
  const alas = activos.filter(m => m.dir !== dirAlma);
  // más de dos almas: el molde admite dos. Ningún muro queda fuera sin que lo pida el usuario: las almas de más se suman
  // a la más cercana de las dos del molde (espesores sumados). El J respecto del eje perpendicular al viento no depende de
  // la posición transversal del alma, así que si cubren el mismo tramo el J del molde es exacto.
  const sumadas: { de: Muro; a: string }[] = [];
  if (almas.length > 2) {
    const elegidas = almas.filter(m => rol(m) === 'alma' || rol(m) === 'alma der.');
    const orden = [...elegidas, ...[...almas].filter(m => !elegidas.includes(m)).sort((x, y) => y.largo * y.espesor - x.largo * x.espesor)];
    const quedan = orden.slice(0, 2).map(m => ({ ...m })), sobran = orden.slice(2);
    sobran.forEach(m => {
      const w = quedan.reduce((b, x) => (Math.abs(t(x) - t(m)) < Math.abs(t(b) - t(m)) ? x : b), quedan[0]);
      // si no cubre el mismo tramo, se suma el área con el largo del alma del molde (aproximado: el aviso de J lo muestra)
      w.espesor = r4(w.espesor + (m.largo * m.espesor) / w.largo);
      sumadas.push({ de: m, a: w.id });
    });
    avisos.push(`Más de dos almas: el molde de la hoja admite dos (${quedan.map(m => m.id).join(' y ')}). ${sumadas.map(x => `${x.de.id} se sumó a ${x.a}`).join(', ')} (espesor equivalente, misma área): ningún muro queda fuera. Mirá la diferencia de J.`);
    almas = quedan;
  }

  if (almas.length === 0) {
    if (alas.length > 1) avisos.push('Pieza sin alma: solo se toma el primer muro (trabaja por su eje débil).');
    const m = alas[0];
    if (!m) return { ...base, molde: 'simétrico', fila: {} };
    set(m, 'alma');
    return { ...base, molde: 'simétrico', fila: { B: m.largo, C: m.espesor } };
  }
  // alma izquierda (la principal: la de más área, salvo que se elija a mano la derecha) y alma derecha
  let [izq, der] = [...almas].sort((x, y) => y.largo * y.espesor - x.largo * x.espesor) as [Muro, Muro | undefined];
  const forzDer = almas.find(m => rol(m) === 'alma der.');
  if (forzDer && almas.length === 2) { der = forzDer; izq = almas.find(m => m !== forzDer)!; }
  // cada ala se pega a un alma (la indicada o la más cercana) y queda en un extremo de esa alma o en el medio
  const pegado = (m: Muro) => (dir === 'A' ? m.pegadoA : m.pegadoB);
  type PosAla = 'arriba' | 'abajo' | 'medio';
  const info = alas.map(a => {
    // el alma indicada; si no, la que toca (y entre las que tocan, aquella de la que el ala está en un extremo);
    // si no toca ninguna, la más cercana
    const toca = (x: Muro) => Math.abs(t(x) - t(a)) <= a.largo / 2 + x.espesor / 2 + 0.02 && s(a) >= s(x) - x.largo / 2 - a.espesor && s(a) <= s(x) + x.largo / 2 + a.espesor;
    const enExtremo = (x: Muro) => Math.abs(s(a) - (s(x) + x.largo / 2)) <= a.espesor + 0.05 || Math.abs(s(a) - (s(x) - x.largo / 2)) <= a.espesor + 0.05;
    let w = almas.find(x => x.id === pegado(a));
    if (!w) {
      const tocan = almas.filter(toca);
      w = tocan.find(x => x === izq && enExtremo(x)) ?? tocan.find(enExtremo) ?? tocan[0]
        ?? almas.reduce((best, x) => (Math.abs(t(x) - t(a)) < Math.abs(t(best) - t(a)) ? x : best), almas[0]);
      if (almas.length > 1 && tocan.length !== 1) avisos.push(`Nota: el ala ${a.id} no dice a qué alma se pega: se tomó ${w.id}.`);
    }
    const top = s(w) + w.largo / 2, bot = s(w) - w.largo / 2, tol = a.espesor + 0.05;
    const pos: PosAla = s(a) >= top - tol ? 'arriba' : s(a) <= bot + tol ? 'abajo' : 'medio';
    return { a, w, pos };
  });
  // el extremo con más ala es la «ala superior» del molde (dar vuelta la pieza no cambia el J)
  const areaExt = (p: PosAla) => info.filter(x => x.pos === p).reduce((q, x) => q + x.a.largo * x.a.espesor, 0);
  const arriba: PosAla = areaExt('arriba') >= areaExt('abajo') ? 'arriba' : 'abajo';
  const abajo: PosAla = arriba === 'arriba' ? 'abajo' : 'arriba';
  // papel final de cada ala: el elegido a mano o el propuesto (las del medio se suman al ala superior)
  const papelAla = (x: typeof info[number]): 'ala sup.' | 'ala inf.' => {
    const r = rol(x.a);
    if (r === 'ala sup.' || r === 'ala inf.') return r;
    return x.pos === abajo ? 'ala inf.' : 'ala sup.';
  };
  const medio = info.filter(x => x.pos === 'medio' && !rol(x.a));
  const alasMedio = medio.map(x => x.a.id);
  if (medio.length) avisos.push(`Nota: ${medio.map(x => x.a.id).join(', ')} ${medio.length > 1 ? 'están' : 'está'} en el medio del alma; ${medio.length > 1 ? 'se suman' : 'se suma'} al ala superior del molde (se puede cambiar a «fuera» o «ala inf.»). Mirá la diferencia de J.`);
  const sup = info.filter(x => papelAla(x) === 'ala sup.'), inf = info.filter(x => papelAla(x) === 'ala inf.');
  // el molde cuelga el ala inferior del alma izquierda: si el ala inferior está pegada al alma derecha (y no se eligió a
  // mano), se cambian las almas; el J no depende de cuál es la izquierda salvo por la profundidad del ala inferior
  if (der && !forzDer && inf.filter(x => x.w === der).length > inf.filter(x => x.w === izq).length) [izq, der] = [der, izq];
  // solo las alas de los extremos recortan el alma (las del medio no)
  const extSup = sup.filter(x => x.pos === arriba).map(x => x.a), extInf = inf.filter(x => x.pos === abajo).map(x => x.a);
  const banda = (g: Muro[]) => (g.length ? [Math.min(...g.map(a => s(a) - a.espesor / 2)), Math.max(...g.map(a => s(a) + a.espesor / 2))] : null);
  const solape = (w: Muro, g: Muro[]) => {
    const bb = banda(g.filter(a => info.find(x => x.a === a)?.w === w || almas.length === 1 || Math.abs(t(a) - t(w)) <= a.largo / 2 + w.espesor));
    if (!bb) return 0;
    return Math.max(0, Math.min(s(w) + w.largo / 2, bb[1]) - Math.max(s(w) - w.largo / 2, bb[0]));
  };
  const libre = (w: Muro, ...grupos: Muro[][]) => {
    const sol = grupos.reduce((x, g) => x + solape(w, g), 0);
    if (sol > 1e-9) avisos.push(`Nota: el alma ${w.id} llega hasta la cara exterior del ala (${String(r4(sol)).replace('.', ',')} m); en la hoja J va con su largo libre, ${String(r4(w.largo - sol)).replace('.', ',')} m, y ese tramo se suma al ala, para que el J sea el del dibujo.`);
    return r4(Math.max(0.01, w.largo - sol));
  };
  /** ala equivalente: espesor del ala del extremo (o la mayor) y ancho que conserva el área (con los tramos de alma que caen en su banda) */
  const ala = (g: typeof info, ext: Muro[], ws: Muro[]) => {
    if (!g.length) return null;
    const tt = Math.max(...(ext.length ? ext : g.map(x => x.a)).map(m => m.espesor));
    const area = g.reduce((q, x) => q + x.a.largo * x.a.espesor, 0) + ws.reduce((q, w) => q + solape(w, ext) * w.espesor, 0);
    return { b: r4(area / tt), t: r4(tt), area };
  };
  set(izq, 'alma');
  if (der) set(der, 'alma der.');
  info.forEach(x => set(x.a, papelAla(x)));
  sumadas.forEach(x => set(x.de, x.a === izq.id ? 'alma' : 'alma der.'));
  const A = ala(sup, extSup, almas), B = ala(inf, extInf, [izq]);

  if (!der) {
    if (!A && !B) return { ...base, molde: 'simétrico', fila: { B: izq.espesor, C: izq.largo } };
    // doble T: alas solo en los extremos, iguales (2 %) y centradas en el alma
    const centrada = (g: Muro[], b: number) => {
      const Ar = g.reduce((x, m) => x + m.largo * m.espesor, 0);
      const c = g.reduce((x, m) => x + m.largo * m.espesor * t(m), 0) / Ar;
      return Math.abs(c - t(izq)) <= Math.max(0.05, 0.02 * b);
    };
    const iguales = (a: number, b: number) => Math.abs(a - b) <= 0.02 * Math.max(a, b);
    const sinMedio = sup.every(x => x.pos !== 'medio') && inf.every(x => x.pos !== 'medio');
    if (A && B && sinMedio && iguales(A.area, B.area) && iguales(A.t, B.t) && centrada(sup.map(x => x.a), A.b) && centrada(inf.map(x => x.a), B.b)) {
      return { ...base, alasMedio, molde: 'simétrico', fila: { B: izq.espesor, C: libre(izq, extSup, extInf), F: A.b, G: A.t, J: B.b, K: B.t } };
    }
    const top = A ?? B!, bot = A ? B : null;
    if (!A) inf.forEach(x => set(x.a, 'ala sup.'));
    const fila: FilaJ = { W: top.b, X: top.t, Z: izq.espesor, AB: libre(izq, extSup, extInf) };
    if (bot) { fila.AH = bot.b; fila.AI = bot.t; }
    return { ...base, alasMedio, molde: 'asimétrico', fila };
  }
  // dos almas: el ala superior une las dos; la inferior va solo bajo el alma izquierda
  if (inf.some(x => x.w === der)) avisos.push(`Nota: el molde solo admite el ala inferior bajo el alma izquierda; ${inf.filter(x => x.w === der).map(x => x.a.id).join(', ')} se juntó ahí.`);
  if (!A) avisos.push('Las dos almas no tienen un ala que las una: conviene cargarlas como piezas separadas.');
  // el alma derecha del molde cuelga del ala superior; si en la realidad no llega a ella, se acepta y se avisa
  const derArriba = arriba === 'arriba' ? s(der) + der.largo / 2 : s(der) - der.largo / 2;
  const supArriba = arriba === 'arriba' ? s(izq) + izq.largo / 2 : s(izq) - izq.largo / 2;
  if (Math.abs(derArriba - supArriba) > 0.3) avisos.push(`El alma derecha ${der.id} no llega al ala superior: en el molde de la hoja va colgada de ella (es la simplificación de la hoja). Mirá la diferencia de J.`);
  const fila: FilaJ = { W: A ? A.b : 0.01, X: A ? A.t : 0.01, Z: izq.espesor, AB: libre(izq, extSup, extInf), AE: der.espesor, AF: libre(der, extSup) };
  if (B) { fila.AH = B.b; fila.AI = B.t; }
  return { ...base, alasMedio, molde: 'asimétrico', fila };
}

/**
 * Igual que perfilEquivalente, pero si hay alas en el medio del alma (una «H», una doble T girada) prueba también
 * dejarlas fuera del molde y se queda con lo que da el J de la hoja más parecido al de la sección real. Un muro en el
 * medio casi no suma J (está sobre el baricentro); subirlo al ala superior del molde lo puede multiplicar.
 */
function elegirPerfil(nombre: string, dir: Direccion, muros: Muro[], papeles: Asignacion['papeles']): PiezaEquivalente {
  // pieza con calados (puertas y ventanas que no la parten): el molde para los papeles y los colores, pero en la hoja J va
  // el rectángulo equivalente de su sección más débil (mismo J y misma área que el corte por las aberturas)
  if (muros.some(m => m.aberturas?.length)) {
    const base = elegirPerfilSinCalados(nombre, dir, muros.map(m => ({ ...m, aberturas: null })), papeles);
    if (base.molde === 'pórtico' || !Object.keys(base.fila).length) return base;
    const J = Jreal(muros, dir);
    const A = muros.reduce((q, m) => q + (m.aberturas?.length ? propsPoligonos(seccionDebil(m) ?? []).A : areaMuro(m)), 0);
    if (!(J > 0 && A > 0)) return base;
    const { b, h } = rectanguloEquivalente(J, A);
    const f3 = (v: number) => v.toFixed(3).replace('.', ',');
    const cal = muros.filter(m => m.aberturas?.length);
    return { ...base, molde: 'simétrico', fila: { B: b, C: h }, Jreal: J, area: A,
      avisos: [...base.avisos, `Calada (${cal.map(m => `${m.id}: ${m.aberturas!.length} abertura${m.aberturas!.length > 1 ? 's' : ''}`).join(', ')}): sigue entera, pero en la hoja J va su sección más débil (el corte por las aberturas): rectángulo equivalente de ${f3(b)} × ${f3(h)} m, J = ${f3(J)} m⁴.`] };
  }
  return elegirPerfilSinCalados(nombre, dir, muros, papeles);
}
function elegirPerfilSinCalados(nombre: string, dir: Direccion, muros: Muro[], papeles: Asignacion['papeles']): PiezaEquivalente {
  // la app ya no prueba variantes que dejan muros fuera del molde: ningún muro sale del cálculo sin que el usuario lo
  // pida («fuera» en el grupo). El aviso de la diferencia de J sigue mostrando cuánto se aparta el molde de la sección real.
  return perfilEquivalente(nombre, dir, muros, papeles);
}
/** (ya no se usa) búsqueda de la combinación de almas y alas con el J más cercano al real, dejando muros fuera */
export function elegirPerfilConVariantes(nombre: string, dir: Direccion, muros: Muro[], papeles: Asignacion['papeles']): PiezaEquivalente {
  const pz = perfilEquivalente(nombre, dir, muros, papeles);
  if (!Object.keys(pz.fila).length || pz.molde === 'tubo' || pz.molde === 'pórtico') return pz;
  const clave = dir === 'A' ? 'rolA' : 'rolB';
  // si el alumno eligió papeles a mano en este viento, se respetan tal cual
  if (muros.some(m => (m[clave] ?? '') !== '' || tipoDe(m) !== 'tabique')) return pz;
  const dirAlma = dir === 'A' ? 'Y' : 'X';
  const almas = muros.filter(m => m.dir === dirAlma);
  const Jr = Jreal(muros, dir);
  const Jh = (x: PiezaEquivalente) => (Object.keys(x.fila).length ? calcFilaJ({ S: 0.01, W: 0.01, X: 0.01, ...x.fila }, dir === 'B', false).AY : 0);
  // variantes: qué almas usa el molde (y en qué orden) y si las alas del medio quedan fuera
  const variantes: Record<string, string>[] = [{}];
  if (almas.length > 2 && almas.length <= 6) {
    almas.forEach((a, i) => almas.forEach((b, j) => {
      if (i === j) return;
      const v: Record<string, string> = {};
      almas.forEach(m => { v[m.id] = m === a ? 'alma' : m === b ? 'alma der.' : 'fuera'; });
      variantes.push(v);
    }));
    almas.forEach(a => { const v: Record<string, string> = {}; almas.forEach(m => { v[m.id] = m === a ? 'alma' : 'fuera'; }); variantes.push(v); });
  }
  const conRoles = (v: Record<string, string>) => muros.map(m => (v[m.id] ? { ...m, [clave]: v[m.id] } : m));
  let mejor = { v: {} as Record<string, string>, d: Math.abs(Jh(pz) - Jr) };
  for (const v0 of variantes) {
    const p1 = perfilEquivalente(nombre, dir, conRoles(v0), papeles);
    const prueba = [v0, ...(p1.alasMedio?.length ? [{ ...v0, ...Object.fromEntries(p1.alasMedio.map(id => [id, 'fuera'])) }] : [])];
    for (const v of prueba) {
      const px = v === v0 ? p1 : perfilEquivalente(nombre, dir, conRoles(v), papeles);
      const d = Math.abs(Jh(px) - Jr);
      if (d < mejor.d - 1e-9) mejor = { v, d };
    }
  }
  if (!Object.keys(mejor.v).length) return perfilEquivalente(nombre, dir, muros, papeles);   // vuelve a dejar los papeles de la opción elegida
  const elegido = perfilEquivalente(nombre, dir, conRoles(mejor.v), papeles);
  // los avisos de «elegido a mano» no corresponden: lo eligió la app
  elegido.avisos = elegido.avisos.filter(x => !x.startsWith('Fuera del molde (elegido a mano)') && !x.startsWith('Más de dos almas'));
  const fuera = Object.entries(mejor.v).filter(([, r]) => r === 'fuera').map(([id]) => id);
  const almasUsadas = Object.entries(mejor.v).filter(([, r]) => r.startsWith('alma')).map(([id]) => id);
  elegido.avisos.push(`La app armó el molde con ${almasUsadas.length ? `${almasUsadas.join(' y ')} como ${almasUsadas.length > 1 ? 'almas' : 'alma'}` : 'el alma más larga'}${fuera.length ? ` y dejó fuera ${fuera.join(', ')}` : ''}: es la combinación que deja el J de la hoja más cerca del real (se puede cambiar en el grupo).`);
  return elegido;
}

/** J de la sección real respecto de su baricentro, para el viento dado: cada rectángulo con su Steiner (m⁴) */
export function Jreal(muros: Muro[], dir: Direccion): number {
  // perfiles: con sus propiedades exactas (como un círculo: A, J propio y posición)
  // muros que se encuentran (L, T, X): con su huella limpia (sin superposición ni hueco en la esquina)
  const conCalados = muros.filter(m => m.aberturas?.length);
  if (conCalados.length) {
    // elementos calados: en su sección más débil (los pedazos que quedan, como polígonos), los demás como siempre
    const deb = conCalados.flatMap(m => seccionDebil(m) ?? []).filter(pg => pg.length >= 3).map(pg => { const k = propsPoligonos([pg]); return { A: k.A, I: dir === 'A' ? k.Jx : k.Jy, s: dir === 'A' ? k.yg : k.xg }; });
    const resto = muros.filter(m => !m.aberturas?.length);
    const As = deb.reduce((q, c) => q + c.A, 0);
    let Ar = 0, Sr = 0, Jr = 0, sgR = 0;
    if (resto.length) {
      // el resto, con su propio J y Steiner: se calcula con la misma función y se combina
      Jr = Jreal(resto, dir);
      resto.forEach(m => { const a = areaMuro(m); Ar += a; Sr += a * (dir === 'A' ? m.y : m.x); });
      sgR = Ar > 0 ? Sr / Ar : 0;
    }
    const A = As + Ar;
    if (!(A > 0)) return 0;
    const sg = (deb.reduce((q, c) => q + c.A * c.s, 0) + Ar * sgR) / A;
    return deb.reduce((q, c) => q + c.I + c.A * (c.s - sg) ** 2, 0) + (Ar > 0 ? Jr + Ar * (sgR - sg) ** 2 : 0);
  }
  // muros que se pisan (sin estar unidos): la sección es su unión, sin contar dos veces lo superpuesto
  const sr = seccionReal(muros);
  if (sr) return dir === 'A' ? sr.Jx : sr.Jy;
  const limpias = huellasLimpias(muros, detectarJuntas(muros), {}, dir === 'A' ? 'A' : 'B');
  const deLimpias = [...limpias.values()].flat().filter(pg => pg.length >= 3).map(pg => { const k = propiedadesPoligonos([pg]); return { A: k.A, I: dir === 'A' ? k.Jx : k.Jy, s: dir === 'A' ? k.yg : k.xg }; });
  const perf = muros.filter(m => tipoDe(m) === 'perfil' && !limpias.has(m.id)).map(m => { const k = propiedades(m.perfil!); return { A: k.A, I: dir === 'A' ? k.JA : k.JB, s: dir === 'A' ? m.y + k.yg : m.x + k.xg }; });
  const rs = muros.filter(m => tipoDe(m) !== 'tubo-circ' && tipoDe(m) !== 'perfil' && !limpias.has(m.id)).flatMap(m => rectangulos(m).map(r => ({ b: dir === 'A' ? r.ax : r.ay, h: dir === 'A' ? r.ay : r.ax, s: dir === 'A' ? r.y : r.x })));
  const circ = [...perf, ...deLimpias, ...muros.filter(m => tipoDe(m) === 'tubo-circ').map(m => ({ A: (Math.PI / 4) * (m.largo ** 2 - dInterior(m) ** 2), I: (Math.PI / 64) * (m.largo ** 4 - dInterior(m) ** 4), s: dir === 'A' ? m.y : m.x }))];
  const A = rs.reduce((q, r) => q + r.b * r.h, 0) + circ.reduce((q, c) => q + c.A, 0);
  if (!(A > 0)) return 0;
  const sg = (rs.reduce((q, r) => q + r.b * r.h * r.s, 0) + circ.reduce((q, c) => q + c.A * c.s, 0)) / A;
  return rs.reduce((q, r) => q + (r.b * r.h ** 3) / 12 + r.b * r.h * (r.s - sg) ** 2, 0) + circ.reduce((q, c) => q + c.I + c.A * (c.s - sg) ** 2, 0);
}

// ------------------------------------------------------------------ asignación de filas
/**
 * Orden de preferencia de filas (índices 0 a 19) para cada tipo de pieza.
 * «paralelos»: la hoja de flexocompresión lee Q (simétrico) en las filas 1–7 y 12–17, AN (asimétrico) en 8–11
 * y V (circular) en 18–20; a las filas 8 y 9 les faltan fórmulas del molde asimétrico (último recurso para él).
 * «ortogonales»: cualquier fila; la 20 queda al final porque su N suma también U.
 */
function ordenFilas(tipo: 'simétrica' | 'asimétrica' | 'circular', paralelos: boolean): number[] {
  const r = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
  if (!paralelos) return tipo === 'circular' ? r(0, 18) : r(0, 19);
  if (tipo === 'asimétrica') return [9, 10, ...r(11, 16), ...r(0, 6), 17, 18, 19, 7, 8];
  if (tipo === 'circular') return [17, 18, 19, ...r(0, 6), ...r(11, 16), 7, 8, 9, 10];
  return [...r(0, 6), ...r(11, 16), 7, 8, 9, 10, 17, 18, 19];
}

function asignarFilas(piezas: PiezaEquivalente[], paralelos: boolean, avisos: string[]): FilaJ[] {
  // planilla 2025: con más de 20 piezas se agregan filas al final de cada bloque (la planilla anterior admite 20)
  const conFila = piezas.filter(p => Object.keys(p.fila).length).length;
  const extra = config.motor === 'nuevo' ? Math.max(0, conFila - 20) : 0;
  const filas: (FilaJ | null)[] = new Array(20 + extra).fill(null);
  if (extra) avisos.push(`Viento ${paralelos ? 'A' : 'B'}: ${conFila} piezas; la planilla 2025 trae 20 filas, así que al exportar se ${extra === 1 ? 'agrega 1 fila' : `agregan ${extra} filas`} al final de «J Tabiques ${paralelos ? 'paralelos' : 'ortogonales'}», de los dos bloques de rototraslación${paralelos ? ' y de «Flex comp PB paralelos»' : ''}, con las mismas fórmulas, y las sumas las incluyen.`);
  const masFilas = Array.from({ length: extra }, (_, k) => 20 + k);
  const tipoDe = (p: PiezaEquivalente) => (p.molde === 'asimétrico' ? 'asimétrica' : p.molde === 'tubo' ? 'circular' : 'simétrica') as 'simétrica' | 'asimétrica' | 'circular';
  const actual = config.motor === 'actual';
  const poner = (p: PiezaEquivalente, i: number) => {
    const tipo = tipoDe(p);
    if (actual && paralelos && tipo === 'asimétrica' && FILAS_SIN_YAC.includes(i)) {
      p.avisos.push(`Fila de la pieza ${i + 1}: en la planilla virgen le faltan las fórmulas del ala superior y del alma izquierda; su J queda incompleto en la planilla.`);
    }
    if (!actual && paralelos && i < 20 && FLEX_FILA_NUEVO[i] !== RANURA_FILA_NUEVO[i]) {
      p.avisos.push(`Planilla 2025: va en la fila ${RANURA_FILA_NUEVO[i] + 4} de «J Tabiques paralelos» (la que lee «Rototrasl. cara mayor»!B${5 + i}), pero «Flex comp PB paralelos» fila ${4 + i} lee el área y el módulo de la fila ${FLEX_FILA_NUEVO[i] + 4}: la flexocompresión de la planilla no corresponde a esta pieza.`);
    }
    if (paralelos && i < 20 && TIPO_FILA_PARALELOS[i] !== tipo) {
      const mod = { 'simétrica': 'simétrico (Q)', 'asimétrica': 'asimétrico (AN)', circular: 'circular (V)' };
      p.avisos.push(`Va en la fila de la pieza ${i + 1}, donde «Flex comp PB paralelos» lee el módulo ${mod[TIPO_FILA_PARALELOS[i]]}: la flexocompresión de la planilla no vale para esta pieza; la app la calcula con el módulo ${mod[tipo]} (columna «Guía»).`);
    }
    if (actual && paralelos && FILAS_O0.includes(i)) {
      p.avisos.push(`Fila de la pieza ${i + 1}: la planilla tiene el área en 0 fijo; la app usa el área real en la flexocompresión.`);
    }
    if (paralelos && FLEX_D_FIJO.includes(i)) {
      p.avisos.push(`Fila de la pieza ${i + 1}: en «Flex comp PB paralelos» (D13:D20) el volumen es 0,01 fijo, así que la planilla no suma el peso propio de esta pieza; la app lo suma (columna «Guía»).`);
    }
    if (actual && paralelos && i >= FILAS_CR_ACTUAL) {
      p.avisos.push(`Fila de la pieza ${i + 1}: la planilla anterior suma ΣJ y ΣJ·x de las piezas perpendiculares de «Rototrasl. cara menor» solo hasta la fila 38 (B51, I51), es decir, las piezas 1 a ${FILAS_CR_ACTUAL} del viento A: esta queda afuera y el CR del viento B de la planilla no la cuenta. El dibujo y el 3D usan el CR real.`);
    }
    filas[i] = p.fila;
    p.filaHoja = i;
  };
  // 1) filas «seguras», para las piezas de más J (las que mueven el CR y cargan más):
  //    · planilla anterior: B51 e I51 de «Rototrasl. cara menor» suman solo las filas 31 a 38, que leen las piezas 1 a 8
  //      del viento A; fuera de ellas la pieza no cuenta para el CR del viento B. Además, esas filas suman el peso propio
  //      en Flex (D13:D20 tienen 0,01 fijo). Se prioriza que el CR salga bien sobre el módulo que lee Flex.
  //    · planilla 2025: Flex lee la misma pieza que Rototrasl. solo en las ranuras 1 a 6.
  const seguras = !paralelos ? [] : actual ? Array.from({ length: FILAS_CR_ACTUAL }, (_, k) => k) : [0, 1, 2, 3, 4, 5];
  const porJ = piezas.filter(p => Object.keys(p.fila).length).sort((a, b) => (b.Jhoja ?? 0) - (a.Jhoja ?? 0));
  for (const p of porJ) {
    if (!seguras.some(k => filas[k] === null)) break;
    const tipo = tipoDe(p);
    // dentro de las seguras, las filas de su tipo primero; una asimétrica no va donde a la hoja le faltan fórmulas
    const i = ordenFilas(tipo, paralelos).filter(k => seguras.includes(k) && !(actual && tipo === 'asimétrica' && FILAS_SIN_YAC.includes(k))).find(k => filas[k] === null);
    if (i !== undefined) poner(p, i);
  }
  // 2) el resto, como siempre: primero los tipos con menos filas propias
  const prioridad = { asimétrica: 0, circular: 1, simétrica: 2 };
  const orden = [...piezas].sort((a, b) => prioridad[tipoDe(a)] - prioridad[tipoDe(b)]);
  for (const p of orden) {
    if (!Object.keys(p.fila).length || p.filaHoja !== null) continue;
    const i = [...ordenFilas(tipoDe(p), paralelos), ...masFilas].find(k => filas[k] === null);
    if (i === undefined) {
      avisos.push(`No queda fila libre en «J Tabiques ${paralelos ? 'paralelos' : 'ortogonales'}» para la pieza ${p.nombre} (máximo 20 piezas).`);
      continue;
    }
    poner(p, i);
  }
  // rellenos de 0,01 como en la planilla (evitan #DIV/0!)
  return filas.map((f, i) => {
    const r: FilaJ = { S: 0.01, W: 0.01, X: 0.01, ...(f ?? {}) };
    if (config.motor === 'actual' && paralelos && FILAS_SIN_YAC.includes(i)) r.sinYAC = true;
    if (config.motor === 'actual' && paralelos && FILAS_O0.includes(i)) r.O0 = true;
    return r;
  });
}

// ------------------------------------------------------------------ todo
export function aPlanilla(p: Proyecto): Asignacion {
  // criterio de los encuentros en el cálculo (D: muros a escuadra, sin tocarse; si no, la sección del diseño)
  criterioDelProyecto(p);
  const avisos: string[] = [];
  const niveles = p.niveles;
  const iPB = (() => { let k = -1; niveles.forEach((n, i) => { if (n.cota >= 0) k = i; }); return k; })();
  if (iPB < 0) avisos.push('No hay ningún nivel con cota ≥ 0 (PB).');
  const arriba = niveles.slice(0, iPB + 1);
  const subs = niveles.slice(iPB + 1);
  // la fila 4 de M,NyQ es siempre 0: el nivel más alto que entra es el de la fila 5 → 49 niveles sobre PB
  if (arriba.length - 1 > 49) avisos.push(`La planilla admite hasta 49 niveles sobre PB (este proyecto tiene ${arriba.length - 1}): el más alto cae en la fila 4 de «M,NyQ», que la planilla deja siempre en 0, y el corte, el momento y el vuelco salen mal. Sacá niveles o juntá los de arriba.`);
  if (subs.length > 3) avisos.push('La planilla admite hasta 3 subsuelos.');
  const conTramos = p.muros.filter(m => m.espesores?.length).map(m => m.id);
  if (conTramos.length) avisos.push(`${conTramos.length === 1 ? 'El muro' : 'Los muros'} ${conTramos.slice(0, 6).join(', ')}${conTramos.length > 6 ? '…' : ''} cambia${conTramos.length > 1 ? 'n' : ''} de espesor en altura: la hoja J de la planilla usa el espesor de PB; la app calcula el J de cada piso, el peso y la deformada con cada tramo (etapas 05 y botón J del 3D).`);
  if (subs.length < 3) avisos.push(`La planilla tiene 3 subsuelos fijos; ${3 - subs.length === 1 ? 'el que falta se carga' : `los ${3 - subs.length} que faltan se cargan`} con altura 0 y sin superficie.`);

  const Z = new Array<number>(N_FILAS).fill(0);
  const C = new Array<number | null>(N_FILAS).fill(null), D = new Array<number | null>(N_FILAS).fill(null);
  const E = new Array<number | null>(N_FILAS).fill(null), F = new Array<number | null>(N_FILAS).fill(null);
  E[0] = 0; F[0] = 0; C[0] = 0;
  const filaNivel: number[] = [];
  const kTop = 50 - (arriba.length - 1);
  arriba.forEach((n, j) => { const k = kTop + j; Z[k] = n.cota; filaNivel.push(k); });
  for (let j = 0; j < 3; j++) {
    const k = 51 + j;
    if (j < subs.length) { Z[k] = subs[j].cota; filaNivel.push(k); }
    else { Z[k] = j > 0 ? Z[k - 1] : Z[50]; E[k] = 0; F[k] = 0; }
  }
  // último piso: C y D escritos a mano (medio entrepiso más el parapeto), y D = 0 en la fila de arriba
  if (kTop >= 1 && kTop <= 50) {
    const ent = arriba.length > 1 ? arriba[0].cota - arriba[1].cota : 0;
    C[kTop] = ent; D[kTop] = r4(ent / 2 + Math.max(0, p.sitio.parapeto ?? 0)); D[kTop - 1] = 0;
  }
  // anchos: en el último piso y donde cambian
  let Bant: number | null = null, Lant: number | null = null;
  niveles.forEach((n, j) => {
    const k = filaNivel[j];
    if (k === undefined) return;
    const b = n.B ?? null, l = n.L ?? null;
    if (j === 0 || (b !== null && b !== Bant)) { E[k] = b ?? Bant ?? 0; Bant = E[k]; }
    if (j === 0 || (l !== null && l !== Lant)) { F[k] = l ?? Lant ?? 0; Lant = F[k]; }
  });

  // piezas
  const papeles: Asignacion['papeles'] = {};
  const zFund = niveles.length ? niveles[niveles.length - 1].cota : 0, zTop = niveles[0]?.cota ?? 0;
  const entra = (m: Muro) => entraEnCalculo(m, zFund, zTop);
  p.muros.forEach(m => { papeles[m.id] = { A: entra(m) ? 'sin pieza' : 'fuera del cálculo', B: entra(m) ? 'sin pieza' : 'fuera del cálculo' }; });
  const activos = p.muros.filter(entra);
  const grupos = (dir: Direccion) => {
    const g = new Map<string, Muro[]>();
    activos.forEach(m => { const k = dir === 'A' ? m.piezaA : m.piezaB; if (k) g.set(k, [...(g.get(k) ?? []), m]); });
    return [...g.entries()].map(([nombre, ms0]) => {
      // tramos unidos por un dintel (puertas): para la hoja J van como un solo muro entero, como en la guía (el dintel
      // transmite el corte entre los dos tramos; la guía verifica el dintel aparte)
      const unidos: [Muro, Muro][] = [];
      let ms = [...ms0];
      ms0.forEach(a => {
        const b = a.vano?.tipo === 'dintel' ? ms.find(x => x.id === a.vano!.con) : undefined;
        if (!b || !ms.includes(a) || a.dir !== b.dir) return;
        const ini = Math.min(a.dir === 'X' ? a.x - a.largo / 2 : a.y - a.largo / 2, b.dir === 'X' ? b.x - b.largo / 2 : b.y - b.largo / 2);
        const fin = Math.max(a.dir === 'X' ? a.x + a.largo / 2 : a.y + a.largo / 2, b.dir === 'X' ? b.x + b.largo / 2 : b.y + b.largo / 2);
        const entero: Muro = { ...a, largo: r4(fin - ini), x: a.dir === 'X' ? r4((ini + fin) / 2) : a.x, y: a.dir === 'Y' ? r4((ini + fin) / 2) : a.y, areaInf: a.areaInf + b.areaInf };
        ms = ms.filter(x => x !== a && x !== b).concat(entero);
        unidos.push([a, b]);
      });
      // calados: por defecto entero (como la cátedra: las aberturas no cambian el J); «con el corte», la sección más débil
      const calEnteros = ms.filter(m => m.aberturas?.length && (m.caladoJ ?? 'entero') === 'entero');
      ms = ms.map(m => (calEnteros.includes(m) ? { ...m, aberturas: null } : m));
      const cfg = p.clasesPieza?.[nombre];
      let pz: PiezaEquivalente;
      if (cfg?.enJ === false) {
        // fuera del cálculo del J (elegido a mano): no va a la hoja J de este viento
        ms.forEach(m => { papeles[m.id] = { ...(papeles[m.id] ?? { A: 'sin pieza', B: 'sin pieza' }), [dir]: 'fuera del cálculo' }; });
        pz = { nombre, dir, muros: ms.map(m => m.id), molde: 'simétrico', fila: {}, posicion: 0, area: ms.reduce((q, m) => q + areaMuro(m), 0), areaInf: ms.reduce((q, m) => q + m.areaInf, 0), filaHoja: null,
          avisos: ['Fuera del cálculo del J (elegido a mano): no va a la hoja J de este viento.'] };
      } else if (cfg?.clase && cfg.clase !== 'auto') pz = piezaPorClase(nombre, dir, ms, papeles, cfg.clase);
      // automática: perfiles (oblicuos o curvos) y calados con corte son elementos especiales
      else if (ms.some(m => tipoDe(m) === 'perfil' || m.aberturas?.length)) pz = { ...piezaPorClase(nombre, dir, ms, papeles, 'especial'), clase: undefined };
      else {
        // método de la planilla (sección 7): solo para piezas de tabiques; tubos, perfiles, pórticos y calados siguen como siempre
        const simple = (m: Muro) => tipoDe(m) === 'tabique' && !m.portico && !m.aberturas?.length;
        pz = config.metodo === 'planilla' && ms.every(simple) ? perfilPlanilla(nombre, dir, ms, papeles) : elegirPerfil(nombre, dir, ms, papeles);
      }
      if (calEnteros.length && cfg?.enJ !== false) pz.avisos.push(`Calada (${calEnteros.map(m => m.id).join(', ')}): va entera en la hoja J, como la cátedra (las aberturas no cambian el J). Para usar la sección cortada por las aberturas, elegí «con el corte» en el muro.`);
      unidos.forEach(([a, b]) => {
        if (!pz.muros.includes(b.id)) pz.muros.push(b.id);
        if (papeles[a.id]) papeles[b.id] = { ...papeles[a.id] };
        pz.avisos.push(`${a.id}–${b.id}: puerta con dintel de ${String(a.vano!.ancho).replace('.', ',')} m. La hoja J lleva el muro entero, como la guía (el dintel une los dos tramos); sin dintel, cada tramo trabajaría solo.`);
      });
      return pz;
    });
  };
  const piezasA = grupos('A'), piezasB = grupos('B');
  // J de la hoja (molde) contra J de la sección real: la simplificación puede cambiarlo mucho
  const porId = new Map(p.muros.map(m => [m.id, m]));
  [...piezasA, ...piezasB].forEach(pz => {
    if (!Object.keys(pz.fila).length) return;
    // tubo circular: la hoja lleva el J exacto de la corona (π/64 · (D⁴ − d⁴))
    if (pz.molde === 'tubo') { const D = pz.fila.S ?? 0, d = pz.fila.T ?? 0; pz.Jhoja = pz.Jreal = (Math.PI / 64) * (D ** 4 - d ** 4); return; }
    // el J real es el de todos los muros de la pieza (también los que se dejan fuera del molde)
    const ms = pz.muros.map(id => porId.get(id)!).filter(Boolean);
    pz.Jhoja = calcFilaJ({ S: 0.01, W: 0.01, X: 0.01, ...pz.fila }, pz.dir === 'B', false).AY;
    pz.Jreal = Jreal(ms, pz.dir);
    if (ms.some(m => m.aberturas?.length)) {
      const At = ms.reduce((q, m) => q + (m.aberturas?.length ? propsPoligonos(seccionDebil(m) ?? []).A : areaMuro(m)), 0);
      const tA = ms.reduce((q, m) => { if (!m.aberturas?.length) return q + areaMuro(m) * (pz.dir === 'A' ? m.x : m.y); const k = propsPoligonos(seccionDebil(m) ?? []); return q + k.A * (pz.dir === 'A' ? k.xg : k.yg); }, 0);
      if (At > 0) pz.posicionReal = tA / At;
    }
    const dif = pz.Jreal > 0 ? (pz.Jhoja - pz.Jreal) / pz.Jreal : 0;
    if (Math.abs(dif) > 0.05) pz.avisos.push(`La simplificación al molde cambia el J: hoja ${String(r4(pz.Jhoja)).replace('.', ',')} m⁴ contra ${String(r4(pz.Jreal)).replace('.', ',')} m⁴ de la sección real (${dif > 0 ? '+' : '−'}${Math.abs(Math.round(dif * 100))} %).`);
  });
  if (activos.length && activos.every(m => !(m.areaInf > 0))) avisos.push('Ningún muro tiene área de influencia: la flexocompresión no suma la carga de las losas (N queda solo con el peso propio). Cargala en «Muros», columna «Área inf.».');
  const jpar = asignarFilas(piezasA, true, avisos);
  const jort = asignarFilas(piezasB, false, avisos);

  // columna H de rototraslación: paralelas desde la fila 5 y perpendiculares desde la fila 31 (o más abajo si se
  // agregaron filas de paralelas: el bloque de perpendiculares empieza 6 filas después del de paralelas)
  const Hpos = (par: PiezaEquivalente[], per: PiezaEquivalente[], nP: number, nO: number) => {
    const H = new Array<number | null>(nP + 6 + nO).fill(null);
    par.forEach(pz => { if (pz.filaHoja !== null) H[pz.filaHoja] = pz.posicion; });
    per.forEach(pz => { if (pz.filaHoja !== null) H[nP + 6 + pz.filaHoja] = pz.posicion; });
    return H;
  };
  const alturaTotal = arriba.length ? arriba[0].cota - (arriba[arriba.length - 1]?.cota ?? 0) : 0;
  const pisosArriba = Math.max(0, arriba.length - 1);
  const flex: PlanillaDatos['flex'] = new Array(jpar.length).fill(null).map(() => ({ C: null as number | null, F: null as number | null, G: null as number | null }));
  const tipoFlex = (pz: PiezaEquivalente): TipoFila => (pz.molde === 'asimétrico' ? 'asimétrica' : pz.molde === 'tubo' ? 'circular' : 'simétrica');
  piezasA.forEach(pz => { if (pz.filaHoja !== null) flex[pz.filaHoja] = { C: alturaTotal, F: r4(pz.areaInf), G: pisosArriba, ...(pz.filaHoja >= 20 ? { tipo: tipoFlex(pz) } : {}) }; });

  // dos tabiques perpendiculares que trabajan juntos contra el giro (elegidos en Rototraslación): filas 28–29 de la hoja
  // del viento, con su posición en H28 y H29; el bloque general (filas 31–50) queda en 0
  const conPar = (dir: Direccion, par: PiezaEquivalente[], per: PiezaEquivalente[], nP: number, nO: number): PlanillaDatos['rotA'] => {
    const H = Hpos(par, per, nP, nO);
    const elegido = p.parPerp?.[dir];
    if (!elegido) return { H };
    const [a, b] = elegido.map(n => per.find(z => z.nombre === n && z.filaHoja !== null));
    if (!a || !b || a === b) {
      avisos.push(`Rototraslación del viento ${dir}: el par de tabiques perpendiculares (${elegido.join(' y ')}) ya no está entre las piezas del viento ${dir === 'A' ? 'B' : 'A'}; se usa el bloque general (filas 31 a 50).`);
      return { H };
    }
    H[nP + 3] = a.posicion; H[nP + 4] = b.posicion;
    return { H, par: [a.filaHoja!, b.filaHoja!] };
  };
  const datos: PlanillaDatos = {
    viento: { ...p.sitio, Z },
    mnyq: { C, D, E, F, b1: p.fundacion.b1, a1: p.fundacion.a1 },
    jpar, jort,
    rotA: conPar('A', piezasA, piezasB, jpar.length, jort.length),
    rotB: conPar('B', piezasB, piezasA, jort.length, jpar.length),
    flex,
  };
  // las piezas que quedan enteras fuera del molde (columnas que no toman viento) van en un solo aviso
  const enteras = (pz: PiezaEquivalente) => pz.avisos.length === 1 && pz.avisos[0].startsWith('Fuera del molde (elegido a mano)') && pz.muros.every(id => (pz.dir === 'A' ? porId.get(id)?.rolA : porId.get(id)?.rolB) === 'fuera');
  const fueraA = piezasA.filter(enteras).map(pz => pz.nombre), fueraB = piezasB.filter(enteras).map(pz => pz.nombre);
  [...piezasA, ...piezasB].filter(pz => !enteras(pz)).forEach(pz => pz.avisos.forEach(a => avisos.push(`${pz.nombre}: ${a}`)));
  for (const [d, xs] of [['A', fueraA], ['B', fueraB]] as const) if (xs.length) avisos.push(`Viento ${d}: ${xs.length} ${xs.length > 1 ? 'piezas quedan' : 'pieza queda'} fuera del molde (elegido a mano: ${xs.length > 6 ? `${xs.slice(0, 6).join(', ')}…` : xs.join(', ')}). No toman viento; sí la carga de su área de influencia.`);
  return { datos, piezas: [...piezasA, ...piezasB], papeles, avisos, filaNivel };
}
