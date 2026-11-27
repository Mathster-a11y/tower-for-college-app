/**
 * «Extender o recortar hasta» (como en AutoCAD): la punta de un muro recto más cercana al encuentro se lleva al eje de
 * otro muro, alargándolo o acortándolo; así quedan en T exacta (el que llega termina contra la cara del otro al dibujarse).
 * Si el cruce de los ejes cae fuera del otro muro, también se alarga el otro hasta ahí y queda una esquina cerrada (L).
 * Sirve para tabiques y para muros rectos en diagonal (perfiles rectangulares); no para curvos, tubos ni columnas.
 */
import type { Muro, Proyecto } from './modelo';
import { tipoDe } from './modelo';
import { ejeDeMuro, type Eje, type P } from './juntas';
import { ponerPerfil } from './perfil';

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const dist = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);

/** el muro con su eje llevado a las puntas a y b (mismo espesor; un tabique sigue en x o en y) */
function conEje(m: Muro, E: Eje, a: P, b: P): Muro {
  const L = dist(a, b), c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (tipoDe(m) === 'tabique') {
    // (x, y del tabique es el centro de su eje)
    return { ...m, x: r4(c.x), y: r4(c.y), largo: r4(L) };
  }
  const h = { x: (E.n.x * E.e) / 2, y: (E.n.y * E.e) / 2 };
  const v = [{ x: a.x + h.x, y: a.y + h.y }, { x: b.x + h.x, y: b.y + h.y }, { x: b.x - h.x, y: b.y - h.y }, { x: a.x - h.x, y: a.y - h.y }];
  // antihorario
  const s = v.reduce((q, p, i) => { const w = v[(i + 1) % 4]; return q + p.x * w.y - w.x * p.y; }, 0);
  return ponerPerfil({ ...m }, { v: s < 0 ? v.reverse() : v });
}

export function extenderHasta(p: Proyecto, idA: string, idB: string): { texto: string } | { error: string } {
  const A = p.muros.find(m => m.id === idA), B = p.muros.find(m => m.id === idB);
  if (!A || !B || A === B) return { error: 'Elegí dos muros distintos.' };
  const EA = ejeDeMuro(A), EB = ejeDeMuro(B);
  if (!EA || !EB) return { error: 'Solo muros rectos (tabiques o muros en diagonal): no curvos, tubos ni perfiles con forma.' };
  const den = EA.u.x * EB.u.y - EA.u.y * EB.u.x;
  if (Math.abs(den) < Math.sin((2 * Math.PI) / 180)) return { error: `${A.id} y ${B.id} son paralelos: no se encuentran.` };
  // cruce de los ejes
  const t = ((EB.a.x - EA.a.x) * EB.u.y - (EB.a.y - EA.a.y) * EB.u.x) / den;
  const X = { x: EA.a.x + EA.u.x * t, y: EA.a.y + EA.u.y * t };
  // la punta de A más cercana al cruce va al cruce
  const kA = dist(EA.a, X) <= dist(EA.b, X) ? 0 : 1;
  const [a1, b1] = kA === 0 ? [X, EA.b] : [EA.a, X];
  if (dist(a1, b1) < 0.05) return { error: `${A.id} quedaría sin largo.` };
  const nuevoA = conEje(A, EA, a1, b1);
  // si el cruce cae fuera de B, B también se alarga hasta ahí (esquina en L)
  const tB = (X.x - EB.a.x) * EB.u.x + (X.y - EB.a.y) * EB.u.y;
  let nuevoB: Muro | null = null;
  if (tB < -1e-3 || tB > EB.L + 1e-3) {
    const [a2, b2] = tB < 0 ? [X, EB.b] : [EB.a, X];
    nuevoB = conEje(B, EB, a2, b2);
  }
  const dA = dist(kA === 0 ? EA.a : EA.b, X);
  const mas = (kA === 0 ? t > 0 : t < EA.L) ? 'recortado' : 'alargado';
  p.muros = p.muros.map(m => (m.id === A.id ? nuevoA : nuevoB && m.id === B.id ? nuevoB : m));
  const cm = (v: number) => `${Math.round(v * 100)} cm`;
  return { texto: nuevoB ? `${A.id} y ${B.id} cerrados en esquina (${A.id} ${mas} ${cm(dA)}).` : `${A.id} ${mas} ${cm(dA)} hasta ${B.id}: quedan en T.` };
}
