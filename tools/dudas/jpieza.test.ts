import { it } from 'vitest';
import { ejemploPlanta34 } from '../../src/engine/ejemplo34';
import { calcularProyecto } from '../../src/ui/estado';
import { partesDePieza } from '../../src/engine/flexocompresion';
it.skipIf(!process.env.DUDAS)('J', () => {
  const p0 = ejemploPlanta34();
  for (const armado of ['app', 'catedra'] as const) {
    const p = { ...p0, calculo: { ...(p0.calculo ?? {}), metodo: 'planilla' as const, version: 'actual' as const, armado } };
    const c = calcularProyecto(p);
    for (const pz of c.asig.piezas.filter(z => z.dir === 'A' && ['T1', 'T3'].includes(z.nombre))) {
      const ms = pz.muros.map(id => p.muros.find(m => m.id === id)!);
      const real = partesDePieza(ms, 'A');
      console.log(armado, pz.nombre, 'tipo', (pz as any).tipo, 'fila', pz.filaHoja, 'Jhoja', c.res.jpar.filas[pz.filaHoja!]?.AY ?? c.res.rotA.B[pz.filaHoja!], 'Jreal', real.J.toFixed(2), 'Areal', real.partes.reduce((s, x) => s + x.A, 0).toFixed(3));
      console.log('  muros', ms.map(m => `${m.id} ${m.largo}x${m.espesor} @(${m.x},${m.y}) ${m.ladoY ? 'Y' : 'X'} ${(m as any).papel ?? ''}`).join(' | '));
      console.log('  hoja', JSON.stringify(c.res.jpar.filas[pz.filaHoja!]).slice(0, 600));
    }
  }
});
