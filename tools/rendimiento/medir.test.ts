/** Mide la torre grande: serializar, calcular con cada método y un cambio completo del estado (cambiar → guardar). */
import { describe, it } from 'vitest';
import { torreGrande } from './torreGrande';
import { calcularProyecto, estado } from '../../src/ui/estado';

const ms = (f: () => void, n = 5) => { f(); const t = performance.now(); for (let i = 0; i < n; i++) f(); return (performance.now() - t) / n; };

describe.skipIf(!process.env.MEDIR)('rendimiento con una torre grande', () => {
  it('mide', () => {
    const p = torreGrande();
    const txt = JSON.stringify(p);
    const out: string[] = [`muros ${p.muros.length}, niveles ${p.niveles.length}, JSON ${(txt.length / 1024).toFixed(0)} kB`];
    out.push(`JSON.stringify ${ms(() => JSON.stringify(p), 50).toFixed(2)} ms · JSON.parse ${ms(() => JSON.parse(txt), 50).toFixed(2)} ms`);
    for (const metodo of ['planilla', 'guia', 'cirsoc', 'fem'] as const)
      out.push(`calcular (${metodo}) ${ms(() => calcularProyecto({ ...p, calculo: { ...(p.calculo ?? {}), metodo } }), metodo === 'fem' ? 2 : 3).toFixed(0)} ms`);
    estado.reemplazar(p);
    for (const metodo of ['planilla', 'cirsoc', 'fem'] as const) {
      estado.cambiarCalculo({ metodo });
      let i = 0;
      out.push(`cambiar un muro, en vivo (${metodo}) ${ms(() => estado.cambiar(q => { q.muros[5].x += (i++ % 2 ? 0.05 : -0.05); }), metodo === 'fem' ? 2 : 5).toFixed(0)} ms`);
    }
    estado.cambiarModo('boton');
    let j = 0;
    out.push(`cambiar un muro, con botón (sin calcular) ${ms(() => estado.cambiar(q => { q.muros[5].x += (j++ % 2 ? 0.05 : -0.05); }), 20).toFixed(1)} ms`);
    console.log(out.join('\n'));
  });
});
