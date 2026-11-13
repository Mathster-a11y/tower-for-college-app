/**
 * Edición de muros como en CAD: desfase (copia paralela a una distancia), alargar o recortar un extremo hasta un
 * punto, partir, unir dos tramos alineados y armar una esquina entre dos muros perpendiculares.
 * Trabajan con tabiques (los tubos no se alargan ni se parten).
 */
import type { Muro, Proyecto } from './modelo';
import { tipoDe } from './modelo';
import { muroBloqueado } from './grupos';
import type { Punto } from './silueta';

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const idLibre = (p: Proyecto) => { for (let k = 1; ; k++) if (!p.muros.some(m => m.id === `M${k}`)) return `M${k}`; };
/** coordenada a lo largo del muro (y para «Y», x para «X») y su eje transversal */
const largoEje = (m: Muro) => (m.dir === 'Y' ? { s: m.y, t: m.x } : { s: m.x, t: m.y });
const extremosS = (m: Muro) => { const { s } = largoEje(m); return [s - m.largo / 2, s + m.largo / 2] as const; };
const conS = (m: Muro, s0: number, s1: number): Muro => { const a = Math.min(s0, s1), b = Math.max(s0, s1), c = r4((a + b) / 2), L = r4(b - a); return m.dir === 'Y' ? { ...m, y: c, largo: L } : { ...m, x: c, largo: L }; };

function tabique(p: Proyecto, id: string): Muro | string {
  const m = p.muros.find(x => x.id === id);
  if (!m) return `No existe ${id}.`;
  if (muroBloqueado(p, m)) return `${id} está bloqueado 🔒.`;
  if (tipoDe(m) !== 'tabique') return `${id} es un tubo: esta herramienta es para tabiques.`;
  return m;
}

/** desfase: copia del muro corrida d m en perpendicular a su largo, del lado del punto «lado» */
export function desfasar(p: Proyecto, id: string, d: number, lado: Punto): { id: string } | { error: string } {
  const m = p.muros.find(x => x.id === id);
  if (!m) return { error: `No existe ${id}.` };
  if (!(d > 0)) return { error: 'La distancia tiene que ser mayor que cero.' };
  const s = m.dir === 'Y' ? Math.sign(lado.x - m.x) || 1 : Math.sign(lado.y - m.y) || 1;
  const nid = idLibre(p);
  const { gd: _g, cref: _c, vano: _v, grupo: _gr, pieza: _pz, ...resto } = m; void _g; void _c; void _v; void _gr; void _pz;
  const n: Muro = { ...resto, id: nid, x: m.dir === 'Y' ? r4(m.x + s * d) : m.x, y: m.dir === 'X' ? r4(m.y + s * d) : m.y, piezaA: '', piezaB: '', pegadoA: '', pegadoB: '' };
  if (m.gd) n.gd = m.gd;
  p.muros.push(n);
  return { id: nid };
}

/** alarga o recorta el extremo del muro más cercano a «toque» hasta la coordenada de «hasta» (a lo largo del muro) */
export function alargar(p: Proyecto, id: string, toque: Punto, hasta: Punto): string | null {
  const m = tabique(p, id); if (typeof m === 'string') return m;
  const [a, b] = extremosS(m), sq = m.dir === 'Y' ? toque.y : toque.x, sh = m.dir === 'Y' ? hasta.y : hasta.x;
  const fijo = Math.abs(sq - a) < Math.abs(sq - b) ? b : a;
  if (Math.abs(sh - fijo) < 0.01) return 'El muro quedaría sin largo.';
  const i = p.muros.indexOf(m);
  p.muros[i] = conS(m, fijo, sh);
  return null;
}

/** parte el muro en dos en el punto (proyectado sobre su eje) */
export function partir(p: Proyecto, id: string, q: Punto): { id: string } | { error: string } {
  const m = tabique(p, id); if (typeof m === 'string') return { error: m };
  const [a, b] = extremosS(m), s = r4(m.dir === 'Y' ? q.y : q.x);
  if (s <= a + 0.05 || s >= b - 0.05) return { error: 'Tocá más adentro del muro (a más de 5 cm de las puntas).' };
  const nid = idLibre(p), i = p.muros.indexOf(m);
  const { vano: _v, ...resto } = m; void _v;
  p.muros[i] = conS(resto as Muro, a, s);
  p.muros.splice(i + 1, 0, { ...conS(resto as Muro, s, b), id: nid, pegadoA: '', pegadoB: '' });
  if (m.vano) { const o = p.muros.find(x => x.id === m.vano!.con); if (o?.vano?.con === m.id) { /* el vano queda del lado del tramo que lo toca */ const [oa] = extremosS(o); if (Math.abs(oa - b) < Math.abs(oa - a)) o.vano = { ...o.vano, con: nid }; } }
  // los que estaban pegados a él siguen pegados al tramo que tocan
  p.muros.forEach(o => { if (o.id === m.id || o.id === nid) return; ['pegadoA', 'pegadoB'].forEach(k => { const kk = k as 'pegadoA' | 'pegadoB'; if (o[kk] === m.id) { const so = m.dir === 'Y' ? o.y : o.x; if (so > s) o[kk] = nid; } }); });
  return { id: nid };
}

/** une dos tabiques alineados (misma dirección, eje y espesor) que se tocan o se pisan */
export function unir(p: Proyecto, idA: string, idB: string): string | null {
  const a = tabique(p, idA); if (typeof a === 'string') return a;
  const b = tabique(p, idB); if (typeof b === 'string') return b;
  if (a.id === b.id) return 'Elegí dos muros distintos.';
  if (a.dir !== b.dir || Math.abs(largoEje(a).t - largoEje(b).t) > 0.005 || Math.abs(a.espesor - b.espesor) > 0.005) return 'Para unir, los dos tienen que estar alineados y tener el mismo espesor.';
  const [a0, a1] = extremosS(a), [b0, b1] = extremosS(b);
  if (Math.max(a0, b0) > Math.min(a1, b1) + 0.01) return `Están separados ${(Math.max(a0, b0) - Math.min(a1, b1)).toFixed(2).replace('.', ',')} m: alargá uno hasta el otro primero.`;
  const i = p.muros.indexOf(a);
  p.muros[i] = conS(a, Math.min(a0, b0), Math.max(a1, b1));
  if (p.muros[i].vano?.con === b.id) delete p.muros[i].vano;
  p.muros = p.muros.filter(m => m.id !== b.id).map(m => ({ ...m, pegadoA: m.pegadoA === b.id ? a.id : m.pegadoA, pegadoB: m.pegadoB === b.id ? a.id : m.pegadoB, ...(m.vano?.con === b.id ? { vano: { ...m.vano, con: a.id } } : {}) }));
  return null;
}

/**
 * Esquina entre dos muros perpendiculares: el primero llega hasta la cara de afuera del segundo y el segundo topa
 * contra la cara de adentro del primero (una L limpia, sin superponerse).
 */
export function esquina(p: Proyecto, idA: string, idB: string): string | null {
  const a = tabique(p, idA); if (typeof a === 'string') return a;
  const b = tabique(p, idB); if (typeof b === 'string') return b;
  if (a.dir === b.dir) return 'La esquina es entre dos muros perpendiculares.';
  const C = a.dir === 'Y' ? { s_a: b.y, s_b: a.x } : { s_a: b.x, s_b: a.y };   // dónde se cruzan los ejes, en la coordenada de cada uno
  const [a0, a1] = extremosS(a), [b0, b1] = extremosS(b);
  const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
  const sa = Math.sign(C.s_a - ca) || 1, sb = Math.sign(C.s_b - cb) || 1;
  const finA = C.s_a + sa * b.espesor / 2, finB = C.s_b - sb * a.espesor / 2;
  const fijoA = sa > 0 ? a0 : a1, fijoB = sb > 0 ? b0 : b1;
  if ((finA - fijoA) * sa <= 0.01 || (finB - fijoB) * sb <= 0.01) return 'Con esa esquina uno de los muros quedaría sin largo.';
  p.muros[p.muros.indexOf(a)] = conS(a, fijoA, finA);
  p.muros[p.muros.indexOf(b)] = conS(b, fijoB, finB);
  return null;
}
