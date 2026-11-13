/**
 * Grupos de dibujo, componentes y bloqueo.
 *
 * Un grupo de dibujo junta muros y otros grupos (jerarquía) para moverlos, copiarlos, bloquearlos u ocultarlos de una
 * vez. No es la «pieza» de la hoja J: la pieza (m.grupo, m.piezaA, m.piezaB) es lo que entra al cálculo. Agrupar para
 * ordenar no cambia ningún número.
 *
 * Un componente es un grupo con copias vinculadas: todas las copias (instancias) comparten la misma definición, cada
 * una con su ubicación T (espejo, giro en cuartos de vuelta y traslación). Si se edita un muro de una copia, el cambio
 * pasa a las demás. Cada instancia se usa como un tabique: «llega», desde, hasta y área de influencia son propios
 * de cada copia y no se copian.
 */
import type { GrupoDib, Muro, Proyecto, Ubicacion } from './modelo';
import { tipoDe } from './modelo';
import { agrupar } from './dibujo';
import { marcoTrasEspejo, marcoTrasGiro } from './piezasTipo';

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
export const grupos = (p: Proyecto) => (p.grupos ??= []);
export const grupoPorId = (p: Proyecto, id: string | null | undefined) => (id ? (p.grupos ?? []).find(g => g.id === id) : undefined);

/** cadena de grupos de un muro o de un grupo, del más cercano al más alto */
export function ancestros(p: Proyecto, gid: string | null | undefined): GrupoDib[] {
  const out: GrupoDib[] = [];
  let g = grupoPorId(p, gid);
  while (g && out.length < 64) { out.push(g); g = grupoPorId(p, g.padre); }
  return out;
}
export const hijosGrupo = (p: Proyecto, gid: string | null) => (p.grupos ?? []).filter(g => (g.padre ?? null) === gid);
export const murosDirectos = (p: Proyecto, gid: string | null) => p.muros.filter(m => (m.gd ?? null) === gid);
/** ids de todos los grupos del subárbol (incluido el mismo) */
export function subgrupos(p: Proyecto, gid: string): string[] {
  const out = [gid];
  for (let i = 0; i < out.length; i++) hijosGrupo(p, out[i]).forEach(h => out.push(h.id));
  return out;
}
/** muros del subárbol de un grupo */
export function murosDe(p: Proyecto, gid: string): Muro[] {
  const s = new Set(subgrupos(p, gid));
  return p.muros.filter(m => m.gd && s.has(m.gd));
}
/** el muro está dentro del grupo (en cualquier nivel) */
export const dentroDe = (p: Proyecto, m: Muro, gid: string | null) => gid === null || ancestros(p, m.gd).some(g => g.id === gid);
/** bloqueado: el grupo del muro o alguno de sus padres está bloqueado */
export const muroBloqueado = (p: Proyecto, m: Muro) => ancestros(p, m.gd).some(g => g.bloq);
export const grupoBloqueado = (p: Proyecto, gid: string) => ancestros(p, gid).some(g => g.bloq);
export const muroOculto = (p: Proyecto, m: Muro) => ancestros(p, m.gd).some(g => g.oculto);

/**
 * Lo que se elige al tocar un muro mientras se edita el grupo «contexto» (null = la planta): el grupo de más arriba
 * dentro del contexto que lo contiene, o el muro mismo si está suelto en el contexto. null si el muro está fuera.
 */
export function nodoAlTocar(p: Proyecto, m: Muro, contexto: string | null): { t: 'g'; id: string } | { t: 'm'; id: string } | null {
  const cad = ancestros(p, m.gd);
  if (contexto !== null && !cad.some(g => g.id === contexto)) return null;
  const k = contexto === null ? cad.length : cad.findIndex(g => g.id === contexto);
  return k <= 0 ? { t: 'm', id: m.id } : { t: 'g', id: cad[k - 1].id };
}

/** nombre libre: «Grupo 1», «Grupo 2»… */
function nombreLibre(p: Proyecto, base: string) {
  const usados = new Set((p.grupos ?? []).map(g => g.nombre));
  for (let k = 1; ; k++) if (!usados.has(`${base} ${k}`)) return `${base} ${k}`;
}
function idLibre(p: Proyecto) {
  const usados = new Set((p.grupos ?? []).map(g => g.id));
  for (let k = 1; ; k++) if (!usados.has(`G${k}`)) return `G${k}`;
}
function idMuroLibre(p: Proyecto, extra: Set<string>) {
  for (let k = 1; ; k++) if (!p.muros.some(m => m.id === `M${k}`) && !extra.has(`M${k}`)) { extra.add(`M${k}`); return `M${k}`; }
}

/**
 * Agrupa muros sueltos y grupos que estén en el mismo nivel de la jerarquía («contexto»). Devuelve el id del grupo
 * nuevo, o un error si algo no se puede agrupar (bloqueado o de otro nivel).
 */
export function agruparNodos(p: Proyecto, muros: string[], gs: string[], contexto: string | null, nombre?: string): { id: string } | { error: string } {
  if (muros.length + gs.length < 1) return { error: 'Elegí al menos un muro o un grupo.' };
  for (const id of muros) { const m = p.muros.find(x => x.id === id); if (!m) return { error: `No existe ${id}.` }; if ((m.gd ?? null) !== contexto) return { error: `${id} está dentro de otro grupo.` }; if (muroBloqueado(p, m)) return { error: `${id} está bloqueado.` }; }
  for (const id of gs) { const g = grupoPorId(p, id); if (!g) return { error: `No existe el grupo ${id}.` }; if ((g.padre ?? null) !== contexto) return { error: `${g.nombre} está dentro de otro grupo.` }; if (g.bloq) return { error: `${g.nombre} está bloqueado.` }; }
  const id = idLibre(p);
  grupos(p).push({ id, nombre: nombre || nombreLibre(p, 'Grupo'), ...(contexto ? { padre: contexto } : {}) });
  p.muros.forEach(m => { if (muros.includes(m.id)) m.gd = id; });
  p.grupos!.forEach(g => { if (gs.includes(g.id)) g.padre = id; });
  return { id };
}

/** deshace un grupo: su contenido pasa al grupo de arriba. Una copia de componente deja de estar vinculada. */
export function desagruparNodo(p: Proyecto, gid: string): string | null {
  const g = grupoPorId(p, gid);
  if (!g) return 'No existe el grupo.';
  if (grupoBloqueado(p, gid)) return `${g.nombre} está bloqueado: desbloquealo primero.`;
  if (g.comp) murosDe(p, gid).forEach(m => { delete m.cref; });
  p.muros.forEach(m => { if (m.gd === gid) { if (g.padre) m.gd = g.padre; else delete m.gd; } });
  p.grupos!.forEach(h => { if (h.padre === gid) { if (g.padre) h.padre = g.padre; else delete h.padre; } });
  p.grupos = p.grupos!.filter(x => x.id !== gid);
  return null;
}

/** borra el grupo con todo lo que tiene (no si está bloqueado) */
export function borrarGrupo(p: Proyecto, gid: string): string | null {
  const g = grupoPorId(p, gid);
  if (!g) return 'No existe el grupo.';
  if (grupoBloqueado(p, gid) || subgrupos(p, gid).some(s => grupoPorId(p, s)?.bloq)) return `${g.nombre} está bloqueado: desbloquealo primero.`;
  const sg = new Set(subgrupos(p, gid));
  const fuera = new Set(p.muros.filter(m => m.gd && sg.has(m.gd)).map(m => m.id));
  p.muros = p.muros.filter(m => !fuera.has(m.id)).map(m => (m.vano && fuera.has(m.vano.con) ? (({ vano: _v, ...r }) => r as Muro)(m) : m));
  p.grupos = p.grupos!.filter(x => !sg.has(x.id));
  return null;
}

// ------------------------------------------------------------------ transformaciones de muros (giros de 90° y espejos)
/** gira el muro un cuarto de vuelta antihorario alrededor de (cx, cy) */
export function girarMuro(m: Muro, cx: number, cy: number): Muro {
  const n: Muro = { ...m, x: r4(cx - (m.y - cy)), y: r4(cy + (m.x - cx)), dir: m.dir === 'X' ? 'Y' : 'X', rolA: '', rolB: '' };
  if (m.pieza) n.pieza = { ...m.pieza, med: marcoTrasGiro(m.pieza.med) };
  if (tipoDe(m) === 'tubo-rect') { n.largo = m.ladoY ?? m.largo; n.ladoY = m.largo; n.dir = m.dir; }
  return n;
}
/** espeja el muro respecto de la recta x = c (eje «x») o y = c (eje «y») */
export function espejarMuro(m: Muro, eje: 'x' | 'y', c: number): Muro {
  const n: Muro = eje === 'x' ? { ...m, x: r4(2 * c - m.x) } : { ...m, y: r4(2 * c - m.y) };
  if (m.pieza) n.pieza = { ...m.pieza, med: marcoTrasEspejo(m.pieza.med, eje) };
  return n;
}
const ID: Ubicacion = { x: 0, y: 0, g: 0, e: false };
/** de la definición (local) a la planta: espejo, giro, traslación */
export function aPlanta(m: Muro, T: Ubicacion): Muro {
  let n = T.e ? espejarMuro(m, 'x', 0) : m;
  for (let k = 0; k < T.g; k++) n = girarMuro(n, 0, 0);
  if (T.g % 2 === 0) n = { ...n, rolA: m.rolA, rolB: m.rolB };   // un giro de 180° conserva los papeles
  return { ...n, x: r4(n.x + T.x), y: r4(n.y + T.y) };
}
/** de la planta a la definición (inversa de aPlanta) */
export function aLocal(m: Muro, T: Ubicacion): Muro {
  let n: Muro = { ...m, x: r4(m.x - T.x), y: r4(m.y - T.y) };
  for (let k = 0; k < (4 - T.g) % 4; k++) n = girarMuro(n, 0, 0);
  if (T.g % 2 === 0) n = { ...n, rolA: m.rolA, rolB: m.rolB };
  return T.e ? espejarMuro(n, 'x', 0) : n;
}

/** centro de la caja de un conjunto de muros */
export function centroCaja(ms: Muro[]): { x: number; y: number } {
  if (!ms.length) return { x: 0, y: 0 };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  ms.forEach(m => {
    const t = tipoDe(m), ax = t === 'tubo-rect' || t === 'tubo-circ' ? m.largo : m.dir === 'Y' ? m.espesor : m.largo;
    const ay = t === 'tubo-rect' ? m.ladoY ?? m.largo : t === 'tubo-circ' ? m.largo : m.dir === 'Y' ? m.largo : m.espesor;
    x0 = Math.min(x0, m.x - ax / 2); x1 = Math.max(x1, m.x + ax / 2); y0 = Math.min(y0, m.y - ay / 2); y1 = Math.max(y1, m.y + ay / 2);
  });
  return { x: r4((x0 + x1) / 2), y: r4((y0 + y1) / 2) };
}

/** rehace los «pegado a» y los grupos de pieza de los muros tocados por un giro (un alma pasa a ser ala) */
function rehacerPiezas(muros: Muro[], ids: Set<string>): Muro[] {
  let out = muros;
  const gs = new Set(out.filter(m => ids.has(m.id) && m.grupo).map(m => m.grupo!));
  gs.forEach(g => { out = agrupar(out, out.filter(m => m.grupo === g).map(m => m.id), g).muros; });
  return out;
}

/** mueve un grupo (y su ubicación si es una copia de componente) */
export function moverNodo(p: Proyecto, gid: string, dx: number, dy: number) {
  const ids = new Set(murosDe(p, gid).map(m => m.id));
  p.muros = p.muros.map(m => (ids.has(m.id) ? { ...m, x: r4(m.x + dx), y: r4(m.y + dy) } : m));
  subgrupos(p, gid).forEach(s => { const g = grupoPorId(p, s)!; if (g.T) g.T = { ...g.T, x: r4(g.T.x + dx), y: r4(g.T.y + dy) }; });
}
/** gira un grupo 90° antihorario alrededor del centro de su caja */
export function girarNodo(p: Proyecto, gid: string) {
  const ms = murosDe(p, gid), c = centroCaja(ms), ids = new Set(ms.map(m => m.id));
  p.muros = rehacerPiezas(p.muros.map(m => (ids.has(m.id) ? girarMuro(m, c.x, c.y) : m)), ids);
  subgrupos(p, gid).forEach(s => {
    const g = grupoPorId(p, s)!;
    if (g.T) g.T = { x: r4(c.x - (g.T.y - c.y)), y: r4(c.y + (g.T.x - c.x)), g: ((g.T.g + 1) % 4) as Ubicacion['g'], e: g.T.e };
  });
}
/** espeja un grupo respecto de un eje vertical («x») u horizontal («y») por el centro de su caja */
export function espejarNodo(p: Proyecto, gid: string, eje: 'x' | 'y') {
  const ms = murosDe(p, gid), c = centroCaja(ms), ids = new Set(ms.map(m => m.id));
  p.muros = p.muros.map(m => (ids.has(m.id) ? espejarMuro(m, eje, eje === 'x' ? c.x : c.y) : m));
  subgrupos(p, gid).forEach(s => {
    const g = grupoPorId(p, s)!;
    if (!g.T) return;
    // E_c ∘ (T R^g E^e) = T' R^g' E^(1−e): para el eje x, g' = −g; para el eje y (= giro de 180° del eje x), g' = 2 − g
    const gg = eje === 'x' ? (4 - g.T.g) % 4 : (6 - g.T.g) % 4;
    g.T = { x: eje === 'x' ? r4(2 * c.x - g.T.x) : g.T.x, y: eje === 'y' ? r4(2 * c.y - g.T.y) : g.T.y, g: gg as Ubicacion['g'], e: !g.T.e };
  });
}

// ------------------------------------------------------------------ copias y componentes
/** convierte un grupo en componente (la primera instancia): cada muro recibe su referencia en la definición */
export function hacerComponente(p: Proyecto, gid: string): string | null {
  const g = grupoPorId(p, gid);
  if (!g) return 'No existe el grupo.';
  if (g.comp) return null;
  if (ancestros(p, g.padre).some(a => a.comp)) return 'Ya está dentro de un componente.';
  if (subgrupos(p, gid).slice(1).some(s => grupoPorId(p, s)?.comp)) return 'Tiene un componente adentro: hacelo único primero.';
  const usados = new Set((p.grupos ?? []).map(x => x.comp).filter(Boolean));
  let k = 1; while (usados.has(`C${k}`)) k++;
  g.comp = `C${k}`;
  const ms = murosDe(p, gid);
  g.T = { ...centroCaja(ms), g: 0, e: false };
  ms.forEach(m => { m.cref = m.id; });
  subgrupos(p, gid).slice(1).forEach(s => { const h = grupoPorId(p, s)!; h.cref = h.id; });
  return null;
}
/** la copia deja de estar vinculada (sigue siendo un grupo) */
export function hacerUnico(p: Proyecto, gid: string) {
  const g = grupoPorId(p, gid);
  if (!g?.comp) return;
  delete g.comp; delete g.T;
  murosDe(p, gid).forEach(m => { delete m.cref; });
  subgrupos(p, gid).slice(1).forEach(s => { delete grupoPorId(p, s)!.cref; });
}
/** cantidad de copias de un componente */
export const copiasDe = (p: Proyecto, comp: string) => (p.grupos ?? []).filter(g => g.comp === comp);

/** nombres de pieza libres para la copia: cada pieza del original pasa a otra pieza nueva (T…, T…B) */
function mapaPiezas(p: Proyecto, ms: Muro[]): Map<string, string> {
  const usados = new Set<string>();
  p.muros.forEach(m => { [m.piezaA, m.piezaB, m.grupo].forEach(x => x && usados.add(x)); });
  const mapa = new Map<string, string>();
  const libre = () => { for (let k = 1; ; k++) if (!usados.has(`T${k}`) && !usados.has(`T${k}B`)) { usados.add(`T${k}`); usados.add(`T${k}B`); return `T${k}`; } };
  ms.forEach(m => {
    [m.grupo, m.piezaA].forEach(x => { if (x && !mapa.has(x)) { const n = libre(); mapa.set(x, n); mapa.set(`${x}B`, `${n}B`); } });
    if (m.piezaB && !mapa.has(m.piezaB)) mapa.set(m.piezaB, libre() + 'B');
  });
  return mapa;
}

/**
 * Copia un grupo con todo lo que tiene, corrido (dx, dy). Con «vinculada», la copia es otra instancia del mismo
 * componente (si el grupo no lo era, se convierte primero). Devuelve el id del grupo nuevo.
 */
export function copiarNodo(p: Proyecto, gid: string, dx: number, dy: number, vinculada = false): { id: string } | { error: string } {
  const g = grupoPorId(p, gid);
  if (!g) return { error: 'No existe el grupo.' };
  if (vinculada && !g.comp) { const e = hacerComponente(p, gid); if (e) return { error: e }; }
  const sg = subgrupos(p, gid), mapaG = new Map<string, string>();
  const nuevosG: GrupoDib[] = [];
  sg.forEach(s => { const id = idLibre({ ...p, grupos: [...(p.grupos ?? []), ...nuevosG] } as Proyecto); mapaG.set(s, id); nuevosG.push({ id, nombre: '' }); });
  sg.forEach((s, i) => {
    const o = grupoPorId(p, s)!, n = nuevosG[i];
    Object.assign(n, { ...o, id: mapaG.get(s)!, padre: i === 0 ? o.padre : mapaG.get(o.padre!) });
    if (i === 0) n.nombre = g.comp && vinculada ? o.nombre.replace(/ \(\d+\)$/, '') + ` (${copiasDe(p, g.comp).length + 1})` : `${o.nombre} (copia)`;
    if (n.padre === undefined) delete n.padre;
    delete n.bloq;
    if (i === 0 && n.T) n.T = { ...n.T, x: r4(n.T.x + dx), y: r4(n.T.y + dy) };
    if (!vinculada) { delete n.comp; delete n.T; delete n.cref; }
  });
  const ms = murosDe(p, gid), extra = new Set<string>(), mapaM = new Map<string, string>();
  ms.forEach(m => mapaM.set(m.id, idMuroLibre(p, extra)));
  const pz = mapaPiezas(p, ms);
  const nuevos = ms.map(m => {
    const n: Muro = { ...m, id: mapaM.get(m.id)!, x: r4(m.x + dx), y: r4(m.y + dy), gd: mapaG.get(m.gd!) };
    n.piezaA = pz.get(m.piezaA) ?? m.piezaA; n.piezaB = pz.get(m.piezaB) ?? m.piezaB;
    if (m.grupo) n.grupo = pz.get(m.grupo) ?? m.grupo;
    n.pegadoA = mapaM.get(m.pegadoA) ?? ''; n.pegadoB = mapaM.get(m.pegadoB) ?? '';
    if (m.vano) { if (mapaM.has(m.vano.con)) n.vano = { ...m.vano, con: mapaM.get(m.vano.con)! }; else delete n.vano; }
    if (!vinculada) delete n.cref;
    return n;
  });
  p.muros.push(...nuevos);
  grupos(p).push(...nuevosG);
  return { id: mapaG.get(gid)! };
}

// ------------------------------------------------------------------ sincronización de las copias vinculadas
/** campos propios de cada copia (como en un tabique): no pasan de una copia a otra */
const PROPIOS = new Set(['id', 'gd', 'cref', 'areaInf', 'llega', 'zDesde', 'zHasta', 'grupo', 'piezaA', 'piezaB', 'pegadoA', 'pegadoB', 'vano']);
/** la definición de una instancia: muros en coordenadas locales, por referencia, sin los campos propios */
function definicion(p: Proyecto, g: GrupoDib): Map<string, string> {
  const out = new Map<string, string>();
  const porId = new Map(p.muros.map(m => [m.id, m]));
  murosDe(p, g.id).forEach(m => {
    const l = aLocal(m, g.T ?? ID) as unknown as Record<string, unknown>;
    const o: Record<string, unknown> = {};
    Object.keys(l).sort().forEach(k => { if (!PROPIOS.has(k) && l[k] !== undefined) o[k] = l[k]; });
    // relaciones con otros muros de la copia, por referencia
    const ref = (id: string) => porId.get(id)?.cref ?? '';
    o._pA = ref(m.pegadoA); o._pB = ref(m.pegadoB);
    if (m.vano) o._vano = { ...m.vano, con: ref(m.vano.con) };
    o._sub = m.gd === g.id ? '' : grupoPorId(p, m.gd)?.cref ?? '';
    // a qué otros muros de la copia acompaña en la pieza (la partición, no el nombre)
    o._pieza = murosDe(p, g.id).filter(x => x.piezaA && x.piezaA === m.piezaA).map(x => x.cref).sort().join(',');
    out.set(m.cref ?? `nuevo:${m.id}`, JSON.stringify(o));
  });
  return out;
}
const iguales = (a: Map<string, string>, b: Map<string, string>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

/**
 * Después de un cambio: si una copia de un componente cambió, el cambio pasa a las demás copias. Devuelve los nombres
 * de los componentes actualizados.
 */
export function sincronizarComponentes(previo: Proyecto | null, p: Proyecto): string[] {
  const hechos: string[] = [];
  const comps = [...new Set((p.grupos ?? []).map(g => g.comp).filter(Boolean) as string[])];
  comps.forEach(c => {
    const inst = copiasDe(p, c);
    if (inst.length < 2) return;
    // copia que cambió: su definición es distinta de la que tenía antes
    const cambiadas = inst.filter(g => {
      const ant = previo && grupoPorId(previo, g.id);
      if (!ant || ant.comp !== c) return false;
      const ahora = definicion(p, g), antes = definicion(previo!, ant);
      if (iguales(ahora, antes)) return false;
      // ¿se movió entera sin actualizar su ubicación? (arrastre de todos sus muros): se corrige la ubicación
      const msA = murosDe(p, g.id), msP = murosDe(previo!, ant.id);
      if (msA.length && msA.length === msP.length) {
        const d = msA.map(m => { const o = msP.find(x => x.id === m.id); return o ? [r4(m.x - o.x), r4(m.y - o.y)] : null; });
        if (d.every(v => v && v[0] === d[0]![0] && v[1] === d[0]![1]) && (d[0]![0] || d[0]![1]) && msA.every(m => { const o = msP.find(x => x.id === m.id)!; return JSON.stringify({ ...m, x: 0, y: 0 }) === JSON.stringify({ ...o, x: 0, y: 0 }); })) {
          g.T = { ...(g.T ?? ID), x: r4((g.T ?? ID).x + d[0]![0]), y: r4((g.T ?? ID).y + d[0]![1]) };
          return !iguales(definicion(p, g), antes);
        }
      }
      return true;
    });
    if (!cambiadas.length) return;
    const fuente = cambiadas[0];
    copiarDefinicion(p, fuente, inst.filter(g => g.id !== fuente.id));
    hechos.push(fuente.nombre);
  });
  return hechos;
}

/** lleva la definición de la copia «fuente» a las otras copias: mismos muros (por referencia), cada una en su lugar */
function copiarDefinicion(p: Proyecto, fuente: GrupoDib, otras: GrupoDib[]) {
  const msF = murosDe(p, fuente.id).filter(m => m.cref);
  // los muros nuevos de la fuente reciben su referencia
  murosDe(p, fuente.id).forEach(m => { if (!m.cref) m.cref = `${m.id}~${fuente.comp}`; msF.includes(m) || msF.push(m); });
  const refF = new Map(msF.map(m => [m.cref!, m]));
  const extra = new Set<string>();
  otras.forEach(g => {
    const actuales = murosDe(p, g.id);
    const porRef = new Map(actuales.filter(m => m.cref).map(m => [m.cref!, m]));
    // subgrupos de la copia por referencia
    const subPorRef = new Map(subgrupos(p, g.id).slice(1).map(s => [grupoPorId(p, s)!.cref ?? '', s]));
    const idDe = new Map<string, string>();   // referencia → id en esta copia
    msF.forEach(m => idDe.set(m.cref!, porRef.get(m.cref!)?.id ?? idMuroLibre(p, extra)));
    // piezas: cada pieza de la fuente pasa a la pieza que ya tenía esta copia, o a una nueva
    const pzMapa = new Map<string, string>();
    msF.forEach(m => { const o = porRef.get(m.cref!); if (o) { if (m.piezaA) pzMapa.set(m.piezaA, o.piezaA); if (m.piezaB) pzMapa.set(m.piezaB, o.piezaB); if (m.grupo && o.grupo) pzMapa.set(m.grupo, o.grupo); } });
    const faltan = msF.filter(m => (m.piezaA && !pzMapa.has(m.piezaA)) || (m.piezaB && !pzMapa.has(m.piezaB)));
    if (faltan.length) mapaPiezas(p, faltan).forEach((v, k) => { if (!pzMapa.has(k)) pzMapa.set(k, v); });
    const nuevos: Muro[] = msF.map(mf => {
      const viejo = porRef.get(mf.cref!);
      const loc = aLocal(mf, fuente.T ?? ID);
      const n = aPlanta(loc, g.T ?? ID);
      const sub = mf.gd === fuente.id ? g.id : subPorRef.get(grupoPorId(p, mf.gd)?.cref ?? '') ?? g.id;
      const r: Muro = { ...n, id: idDe.get(mf.cref!)!, gd: sub, cref: mf.cref,
        piezaA: pzMapa.get(mf.piezaA) ?? mf.piezaA, piezaB: pzMapa.get(mf.piezaB) ?? mf.piezaB,
        pegadoA: '',
        pegadoB: mf.pegadoB ? idDe.get(p.muros.find(x => x.id === mf.pegadoB)?.cref ?? '') ?? '' : '',
      };
      r.pegadoA = mf.pegadoA ? idDe.get(p.muros.find(x => x.id === mf.pegadoA)?.cref ?? '') ?? '' : '';
      if (mf.grupo) r.grupo = pzMapa.get(mf.grupo) ?? mf.grupo; else delete r.grupo;
      if (mf.vano) { const con = idDe.get(p.muros.find(x => x.id === mf.vano!.con)?.cref ?? ''); if (con) r.vano = { ...mf.vano, con }; else delete r.vano; } else delete r.vano;
      // propios de esta copia (como un tabique): se conservan
      if (viejo) { r.areaInf = viejo.areaInf; r.llega = viejo.llega; if (viejo.zDesde !== undefined) r.zDesde = viejo.zDesde; else delete r.zDesde; if (viejo.zHasta !== undefined) r.zHasta = viejo.zHasta; else delete r.zHasta; }
      else { const otro = actuales[0]; if (otro) { r.llega = otro.llega; if (otro.zDesde !== undefined) r.zDesde = otro.zDesde; else delete r.zDesde; if (otro.zHasta !== undefined) r.zHasta = otro.zHasta; else delete r.zHasta; } }
      return r;
    });
    const fuera = new Set(actuales.filter(m => m.cref && !refF.has(m.cref)).map(m => m.id));
    const reemplazo = new Map(nuevos.map(n => [n.id, n]));
    p.muros = p.muros.filter(m => !fuera.has(m.id)).map(m => reemplazo.get(m.id) ?? m);
    nuevos.forEach(n => { if (!p.muros.some(m => m.id === n.id)) p.muros.push(n); });
  });
}

/**
 * Parámetros de uso de un grupo, como en un tabique: llega a la fundación, arranca y termina en una cota. Se aplican
 * a todos sus muros (solo a esta copia si es un componente).
 */
export function usoDeGrupo(p: Proyecto, gid: string, uso: { llega?: boolean; zDesde?: number | null; zHasta?: number | null }) {
  murosDe(p, gid).forEach(m => {
    if (uso.llega !== undefined) m.llega = uso.llega;
    if (uso.zDesde !== undefined) { if (uso.zDesde === null) delete m.zDesde; else m.zDesde = uso.zDesde; }
    if (uso.zHasta !== undefined) { if (uso.zHasta === null) delete m.zHasta; else m.zHasta = uso.zHasta; }
  });
}

/**
 * Guardia del bloqueo: los muros que estaban bloqueados antes y siguen bloqueados no pueden cambiar de forma ni
 * desaparecer. Devuelve cuántos se restauraron.
 */
export function protegerBloqueados(previo: Proyecto | null, p: Proyecto): number {
  if (!previo || !(previo.grupos ?? []).some(g => g.bloq)) return 0;
  const GEOM = ['x', 'y', 'dir', 'largo', 'espesor', 'tipo', 'ladoY', 'gd'] as const;
  let n = 0;
  previo.muros.forEach(o => {
    if (!muroBloqueado(previo, o)) return;
    const i = p.muros.findIndex(m => m.id === o.id);
    const cur = i >= 0 ? p.muros[i] : null;
    // si el grupo se desbloqueó en este mismo cambio, vale el cambio
    const sigue = cur ? muroBloqueado(p, cur) : ancestros(p, o.gd).some(g => g.bloq) || ancestros(previo, o.gd).some(g => g.bloq && grupoPorId(p, g.id)?.bloq);
    if (!sigue) return;
    if (!cur) { p.muros.push(o); n++; return; }
    if (GEOM.some(k => JSON.stringify(cur[k]) !== JSON.stringify(o[k]))) { p.muros[i] = { ...cur, ...Object.fromEntries(GEOM.map(k => [k, o[k]])) } as Muro; GEOM.forEach(k => { if (o[k] === undefined) delete (p.muros[i] as unknown as Record<string, unknown>)[k]; }); n++; }
  });
  return n;
}
