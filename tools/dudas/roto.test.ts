import { it } from 'vitest';
import { ejemploPlanta34 } from '../../src/engine/ejemplo34';
import { ejemploAsimetrico } from '../../src/engine/modelo';
import { calcularProyecto } from '../../src/ui/estado';
it.skipIf(!process.env.DUDAS)('roto', () => {
  for (const p0 of [ejemploAsimetrico(), ejemploPlanta34()]) {
    const p = { ...p0, calculo: { ...(p0.calculo ?? {}), metodo: 'planilla' as const, version: 'actual' as const } };
    const c = calcularProyecto(p); const r = c.res.rotA; const g = c.corr.rotoA!;
    console.log('PLANILLA', JSON.stringify({ D5: r.D5, J7: r.J7, J15: r.J15, J28: r.J28, J38: r.J38, B25: r.B25, I25: r.I25, L25: r.L25, B51: r.B51, I51: r.I51, M51: r.M51, C25: r.C25, E25: r.E25, G25: r.G25 }));
    console.log('pos', r.C.slice(0, 14).map(x => +(+x).toFixed(2)), 'J', r.B.slice(0, 14).map(x => +x.toFixed(2)));
    console.log('perp J', r.B.slice(r.oO, r.oO + 20).map(x => +x.toFixed(2)), 'pos', r.C.slice(r.oO, r.oO + 20).map(x => isFinite(x) ? +x.toFixed(2) : null), 'Kmm', r.K.slice(r.oO, r.oO + 20).map(x => isFinite(x) ? +x.toFixed(2) : null));
    console.log('GUIA', JSON.stringify({ Q: g.Q, Xr: g.Xr, Sr: g.Sr, e: g.e, Mt: g.Mt, SJ: g.SJ, SJa2: g.SJa2 }));
    console.log('par', g.paralelos.map(x => `${x.nombre} pos ${x.pos.toFixed(2)} J ${x.J.toFixed(2)} a ${x.a.toFixed(2)} tras ${x.tras.toFixed(1)} rot ${x.rot.toFixed(1)}`).join(' | '));
    console.log('perp', g.perpendiculares.length, 'ΣJa2 perp', g.perpendiculares.reduce((s, x) => s + x.J * x.a * x.a, 0).toFixed(1), 'ΣJa2 par', g.paralelos.reduce((s, x) => s + x.J * x.a * x.a, 0).toFixed(1));
  }
});
