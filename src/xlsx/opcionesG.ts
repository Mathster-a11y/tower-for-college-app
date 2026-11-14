/** Lo que las hojas «G ·» necesitan de la app (lo que no se puede escribir con fórmulas: perfiles, áreas, tubos). */
import { entraEnCalculo, rectangulos, tipoDe, type Proyecto } from '../engine/modelo';
import { aPlanilla } from '../engine/mapping';
import { propiedades, rectanguloEquivalente } from '../engine/perfil';
import { areasInfluencia, cuatroColores, vecindades } from '../engine/areas';
import type { OpcionesG, PerpApp } from './hojasG';

const dInterior = (largo: number, espesor: number) => Math.max(0, largo - 2 * espesor);
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

export function opcionesG(p: Proyecto): OpcionesG {
  const asig = aPlanilla(p);
  const piezasA: (string | null)[] = Array(20).fill(null), piezasB: (string | null)[] = Array(20).fill(null);
  asig.piezas.forEach(pz => { if (pz.filaHoja !== null) (pz.dir === 'A' ? piezasA : piezasB)[pz.filaHoja] = pz.nombre; });
  // muros perpendiculares que no son tabiques simples: como rototraslacionGuia
  const zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0, zTop = p.niveles[0]?.cota ?? 0;
  const perp: { A: PerpApp[]; B: PerpApp[] } = { A: [], B: [] };
  p.muros.filter(m => entraEnCalculo(m, zFund, zTop) && tipoDe(m) !== 'tabique').forEach(m => {
    for (const dir of ['A', 'B'] as const) {
      const A = dir === 'A';
      if (tipoDe(m) === 'tubo-circ') { const d = dInterior(m.largo, m.espesor); perp[dir].push({ nombre: m.id, pos: A ? m.y : m.x, J: (Math.PI * (m.largo ** 4 - d ** 4)) / 64, muro: m.id }); continue; }
      if (tipoDe(m) === 'perfil') {
        const k = propiedades(m.perfil!), Jesta = A ? k.JA : k.JB, Jotra = A ? k.JB : k.JA;
        if (Jotra > Jesta) perp[dir].push({ nombre: m.id, pos: A ? m.y : m.x, J: Jotra, muro: m.id });
        continue;
      }
      rectangulos(m).forEach((r, k, todos) => {
        const largoT = A ? r.ax : r.ay, largoS = A ? r.ay : r.ax;
        if (largoT <= largoS) return;
        perp[dir].push({ nombre: todos.length > 1 ? `${m.id}·${k + 1}` : m.id, pos: A ? r.y : r.x, J: (largoS * largoT ** 3) / 12, muro: m.id });
      });
    }
  });
  const perfiles = p.muros.filter(m => tipoDe(m) === 'perfil' && m.perfil).map(m => {
    const k = propiedades(m.perfil!);
    const eqA = rectanguloEquivalente(k.JA, k.A), eqB = rectanguloEquivalente(k.JB, k.A);
    return [m.id, 'perfil', r4(k.A), r4(m.x + k.xg), r4(m.y + k.yg), r4(k.JA), r4(k.JB), r4(k.Jxy), `${eqA.b.toFixed(3)} × ${eqA.h.toFixed(3)}`, `${eqB.b.toFixed(3)} × ${eqB.h.toFixed(3)}`,
      Math.abs(k.Jxy) > 1e-6 ? 'J xy ≠ 0: los ejes principales están girados' : ''];
  });
  // áreas de influencia en la losa de PB (o la del nivel de «Áreas automáticas»)
  let areas: (string | number | null)[][] = [];
  try {
    const i = p.areasAuto != null ? p.niveles.findIndex(n => Math.abs(n.cota - p.areasAuto!) < 1e-6) : p.niveles.reduce((k, n, j) => (n.cota >= 0 ? j : k), 0);
    const a = areasInfluencia(p, Math.max(0, i));
    const colores = cuatroColores(vecindades(a, n => a.ids[n]));
    const nombres = ['azul', 'naranja', 'verde', 'violeta', 'gris'];
    areas = a.ids.map(id => [id, a.area[id], p.muros.find(m => m.id === id)?.areaInf ?? null, nombres[colores.get(id) ?? 4] ?? '']);
  } catch { areas = []; }
  return { filaNivel: asig.filaNivel, piezasA, piezasB, perpendiculares: perp, perfiles, areas };
}
