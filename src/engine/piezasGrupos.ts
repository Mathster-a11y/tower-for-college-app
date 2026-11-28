/**
 * Piezas de cálculo y grupos del Esquema, con una sola regla: una pieza de cálculo (los muros con el mismo nombre en
 * el viento A) de dos o más muros es un grupo; una de un solo muro, no (se elige con un clic). Y las dos formas de
 * desarmar una pieza: «Separar la pieza» (cada muro pasa a ser una pieza propia en el cálculo) y «Sacar este muro de la
 * pieza». «Desagrupar» (grupos.ts) solo suelta el dibujo y no cambia el cálculo.
 */
import type { Muro, Proyecto } from './modelo';
import { desagruparNodo, envolverPiezas, grupoPorId, hijosGrupo, muroBloqueado, murosDirectos } from './grupos';
import { jEnDireccion, propiedadesSeccion } from './seccionPieza';

/** J de un conjunto de muros (la sección con que entra al cálculo) en la dirección de un viento */
export function jMuros(ms: Muro[], dir: 'A' | 'B'): number {
  const s = propiedadesSeccion(ms.filter(m => m.llega));
  return s ? jEnDireccion(s, dir === 'A' ? Math.PI / 2 : 0) : 0;
}

/**
 * Una vez por proyecto (p.gruposPorPieza): deshace los grupos de un solo muro que no hacen falta (no bloqueados, ocultos,
 * fijos ni copias de componente) y, con «envolver», envuelve en un grupo cada pieza de cálculo de dos o más muros que no
 * lo tenga. La app lo llama sin envolver (pedido del usuario, 28/11: los grupos los arma el usuario, ninguno se arma solo).
 */
export function gruposPorPieza(p: Proyecto, nombres?: (g: string, ms: Muro[]) => string, envolver = true): { envueltas: number; sueltas: number } {
  if (p.gruposPorPieza) return { envueltas: 0, sueltas: 0 };
  const cuenta = new Map<string, number>();
  p.muros.forEach(m => { if (m.piezaA) cuenta.set(m.piezaA, (cuenta.get(m.piezaA) ?? 0) + 1); });
  let sueltas = 0;
  for (const g of [...(p.grupos ?? [])]) {
    if (g.bloq || g.oculto || g.fijo || g.comp || g.cref || hijosGrupo(p, g.id).length) continue;
    const ms = murosDirectos(p, g.id);
    if (ms.length !== 1) continue;
    const m = ms[0];
    if (m.pieza || m.cref || (m.piezaA && (cuenta.get(m.piezaA) ?? 0) > 1)) continue;
    if (!desagruparNodo(p, g.id)) sueltas++;
  }
  const envueltas = envolver ? envolverPiezas(p, nombres, 'calculo') : 0;
  p.gruposPorPieza = 1;
  return { envueltas, sueltas };
}

/** nombres de pieza libres: T1, T2… sin repetir los de cálculo ni los de las piezas armadas */
function nombresLibres(p: Proyecto) {
  const usados = new Set<string>();
  p.muros.forEach(m => [m.piezaA, m.piezaB, m.grupo].forEach(x => x && usados.add(x)));
  let k = 1;
  return () => { while (usados.has(`T${k}`) || usados.has(`T${k}B`)) k++; const n = `T${k}`; usados.add(n); usados.add(`${n}B`); return n; };
}

/** el grupo del Esquema que es exactamente esta pieza (todos sus muros y nada más), si lo hay */
function grupoDeLaPieza(p: Proyecto, ms: Muro[]): string | null {
  const gd = ms[0]?.gd;
  if (!gd || !ms.every(m => m.gd === gd) || hijosGrupo(p, gd).length || murosDirectos(p, gd).length !== ms.length) return null;
  return gd;
}

/** el nombre de la pieza del viento B que es exactamente estos muros (se separa igual), o null si es otra cosa */
function piezaBIgual(p: Proyecto, ms: Muro[]): string | null {
  const b = ms[0]?.piezaB;
  if (!b || !ms.every(m => m.piezaB === b)) return null;
  return p.muros.filter(m => m.piezaB === b).length === ms.length ? b : null;
}

/** lo que ata un muro a su pieza: papeles, «pegado a», pieza armada y pórtico */
function soltar(m: Muro, conB: boolean) {
  m.pegadoA = ''; delete m.rolA;
  if (conB) { m.pegadoB = ''; delete m.rolB; }
  delete m.grupo; delete m.pieza; delete m.portico;
}

const f2 = (v: number) => v.toFixed(2).replace('.', ',');

/** Separa la pieza: cada muro que llega pasa a ser una pieza propia (el más rígido conserva el nombre); los que no llegan
 * quedan sin pieza. Deshace su grupo del Esquema. */
export function separarPieza(p: Proyecto, nombre: string): { texto: string } | { error: string } {
  const ms = p.muros.filter(m => m.piezaA === nombre);
  if (ms.length < 2) return { error: `La pieza ${nombre} tiene un solo muro: no hay nada que separar.` };
  if (ms.some(m => muroBloqueado(p, m))) return { error: `La pieza ${nombre} está bloqueada: desbloqueala primero.` };
  const antes = jMuros(ms, 'A'), despues = ms.filter(m => m.llega).reduce((s, m) => s + jMuros([m], 'A'), 0);
  const gd = grupoDeLaPieza(p, ms);
  if (gd) { const e = desagruparNodo(p, gd); if (e) return { error: e }; }
  const B = piezaBIgual(p, ms), libre = nombresLibres(p), nuevos: string[] = [];
  // el nombre lo conserva el muro más rígido en el viento A
  const llegan = ms.filter(m => m.llega), mayor = llegan.reduce<Muro | null>((a, m) => (!a || jMuros([m], 'A') > jMuros([a], 'A') ? m : a), null);
  for (const m of ms) {
    const n = !m.llega ? '' : m === mayor ? nombre : libre();
    if (m.llega && m !== mayor) nuevos.push(n);
    soltar(m, !!B);
    m.piezaA = n;
    if (B) m.piezaB = !n ? '' : n === nombre ? B : `${n}B`;
  }
  if (p.clasesPieza) { delete p.clasesPieza[nombre]; if (B) delete p.clasesPieza[B]; }
  const sin = ms.filter(m => !m.llega).length;
  return { texto: `Pieza ${nombre} separada: ${ms.filter(m => m.llega).length} piezas de un muro (${[nombre, ...nuevos].join(', ')})${sin ? `; ${sin} ${sin === 1 ? 'muro que no llega quedó' : 'muros que no llegan quedaron'} sin pieza` : ''}. J viento A: ${f2(antes)} → ${f2(despues)} m⁴. Ctrl+Z deshace.` };
}

/** Saca un muro de su pieza: pasa a ser una pieza propia (o sin pieza, si no llega) y sale del grupo de la pieza. */
export function sacarDePieza(p: Proyecto, id: string): { texto: string } | { error: string } {
  const m = p.muros.find(x => x.id === id);
  if (!m) return { error: 'No existe el muro.' };
  const nombre = m.piezaA;
  const ms = nombre ? p.muros.filter(x => x.piezaA === nombre) : [m];
  if (ms.length < 2) return { error: `${m.id} ya es una pieza de un solo muro.` };
  if (muroBloqueado(p, m)) return { error: `${m.id} está bloqueado: desbloquealo primero.` };
  const antes = jMuros(ms, 'A');
  const gd = grupoDeLaPieza(p, ms), B = piezaBIgual(p, ms);
  if (gd) { const g = grupoPorId(p, gd); if (g?.padre) m.gd = g.padre; else delete m.gd; }
  const n = m.llega ? nombresLibres(p)() : '';
  soltar(m, !!B);
  m.piezaA = n;
  if (B) m.piezaB = n ? `${n}B` : '';
  p.muros.forEach(o => { if (o.pegadoA === m.id) o.pegadoA = ''; if (B && o.pegadoB === m.id) o.pegadoB = ''; });
  const resto = p.muros.filter(x => x.piezaA === nombre);
  // si la pieza quedó de un solo muro, su grupo ya no hace falta
  if (resto.length === 1 && gd && grupoPorId(p, gd) && murosDirectos(p, gd).length === 1 && !hijosGrupo(p, gd).length) desagruparNodo(p, gd);
  return { texto: `${m.id} salió de la pieza ${nombre}${n ? ` y es la pieza ${n}` : ' y quedó sin pieza (no llega)'}. J viento A de ${nombre}: ${f2(antes)} → ${f2(jMuros(resto, 'A'))} m⁴. Ctrl+Z deshace.` };
}
