import { writeFileSync } from 'node:fs';
import { ejemploGuia, ejemploAsimetrico } from '../../../src/engine/modelo';
import { aPlanilla } from '../../../src/engine/mapping';
import { calcularPlanilla } from '../../../src/engine/planilla';
for (const [nombre, f] of [['guia', ejemploGuia], ['anexo', ejemploAsimetrico]] as const) {
  const p = f(); const a = aPlanilla(p); const r = calcularPlanilla(a.datos);
  // fuerzas por nivel (viento A): H de M,NyQ en las filas de cada nivel sobre PB
  const niveles = p.niveles.map((n, j) => ({ nombre: n.nombre, z: n.cota, W: r.mnyq.H[a.filaNivel[j]] ?? 0 })).filter(n => n.z >= 0);
  const piezas = a.piezas.filter(pz => pz.dir === 'A' && pz.filaHoja !== null).map(pz => {
    const ms = p.muros.filter(m => pz.muros.includes(m.id));
    // área de corte: la de las almas (muros paralelos al viento A)
    const Av = ms.filter(m => m.dir === 'Y').reduce((s, m) => s + m.largo * m.espesor, 0);
    const ycg = ms.reduce((s, m) => s + m.largo * m.espesor * m.y, 0) / ms.reduce((s, m) => s + m.largo * m.espesor, 0);
    return { nombre: pz.nombre, x: pz.posicion, y: ycg, J: r.rotA.B[pz.filaHoja!], A: pz.area, Av, fila: pz.filaHoja };
  });
  // perpendiculares (viento B) para la rigidez a torsión
  const perp = a.piezas.filter(pz => pz.dir === 'B' && pz.filaHoja !== null).map(pz => ({ nombre: pz.nombre, y: pz.posicion, J: r.rotB.B[pz.filaHoja!] }));
  const planilla = { Q: r.rotA.D5, reparto: piezas.map(pz => ({ nombre: pz.nombre, frac: r.rotA.C[pz.fila!], Qtras: r.rotA.E[pz.fila!], N: r.rotA.N[pz.fila!] })), Xr: r.rotA.J7 };
  writeFileSync(`docs/motor-fem/prototipo/${nombre}.json`, JSON.stringify({ niveles, piezas, perp, planilla, E: 3.4e6, G: 3.4e6 / 2.4 }, null, 1));
  console.log(nombre, 'niveles', niveles.length, 'ΣW', niveles.reduce((s, n) => s + n.W, 0).toFixed(2), 'piezas', piezas.map(x => `${x.nombre}:${x.J.toFixed(3)}@${x.x}`).join(' '));
}
