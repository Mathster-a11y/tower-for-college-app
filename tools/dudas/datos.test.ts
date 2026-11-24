/**
 * Números del documento de dudas sobre la planilla (docs/dudas_planilla): tres ejemplos con los métodos Planilla,
 * Guía, CIRSOC y FEM. Solo corre con DUDAS=1: `DUDAS=1 npx vitest run tools/dudas`.
 */
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { ejemploGuia, ejemploAsimetrico } from '../../src/engine/modelo';
import { ejemploPlanta34 } from '../../src/engine/ejemplo34';
import { calcularProyecto } from '../../src/ui/estado';
import { repartoCorregido } from '../../src/engine/correcciones';
import { verificarDireccion } from '../../src/engine/flexocompresion';

const r = (v: number | null | undefined, d = 2) => (v == null || !isFinite(v) ? null : +v.toFixed(d));
it.skipIf(!process.env.DUDAS)('datos de los tres ejemplos', () => {
  const ejemplos = [['guia', 'Ejemplo de la guía 2024 (Neuquén, 20 pisos, simétrico)', ejemploGuia()],
    ['asim', 'Torre asimétrica (ejemplo de la app)', ejemploAsimetrico()],
    ['p34', 'Torre de 34 pisos (planta del usuario)', ejemploPlanta34()]] as const;
  const out: Record<string, unknown> = {};
  for (const [k, nombre, p0] of ejemplos) {
    const p = { ...p0, calculo: { ...(p0.calculo ?? {}), metodo: 'combinado' as const, version: 'actual' as const } };
    const c = calcularProyecto(p);
    const pl = calcularProyecto({ ...p, calculo: { ...p.calculo, metodo: 'planilla' } });
    const gu = calcularProyecto({ ...p, calculo: { ...p.calculo, metodo: 'guia' } });
    const ci = calcularProyecto({ ...p, calculo: { ...p.calculo, metodo: 'cirsoc' } });
    const rot = pl.res.rotA, rep = repartoCorregido(rot), fx = pl.res.flex;
    const hW = rot.D5 ? rot.F5 / rot.D5 : 0;
    const vg = verificarDireccion(p, gu.asig.piezas, gu.corr, gu.asig.filaNivel, 'A', 300);
    const piezas = pl.asig.piezas.filter(z => z.dir === 'A' && z.filaHoja !== null).map(z => {
      const i = z.filaHoja!;
      const g = vg.find(x => x.nombre === z.nombre);
      const v = ci.cirsoc?.verif.find(x => x.dir === 'A' && x.nombre === z.nombre);
      // flexocompresión de la planilla y la misma con la combinación corregida (Nq con la compresión, Ng con la tracción)
      const F = fx.B[i], W = fx.W?.[i], Ng = fx.H[i], Nq = fx.I[i], M = fx.J[i];
      return {
        nombre: z.nombre, fila: i + 1, J: r(rot.B[i], 3), Qtras: r(rot.E[i]), Qrot: r(rot.N[i]), G: r(rot.G[i], 0), O: r(rot.O[i], 0),
        Mcorr: r(rep[i].Mtot, 0), Mguia: r(g?.M, 0), McirsocCaso1: v ? r(v.partes[0] * (ci.cirsoc!.viento.A.MPB), 0) : null, partesCirsoc: v?.partes.map(x => r(x * 100, 1)),
        F: r(F, 3), W: r(W, 3), Ng: r(Ng, 1), Nq: r(Nq, 1),
        sigCompPl: r(fx.O[i]), sigTracPl: r(fx.P[i]),
        sigCompBien: W ? r((-Nq / F - M / W) * 0.1) : null, sigTracBien: W ? r((-Ng / F + M / W) * 0.1) : null,
        guiaTrac: r(g?.traccion), guiaComp: r(g?.compresion),
        vol: r(fx.D[i], 2), pesoPropio: r(fx.E[i], 1),
        parte: c.combinado!.filas.find(f => f.nombre === `${z.nombre}: parte del viento A (caso 1)`)?.valores,
        cirsocUso: v ? r(Math.max(...v.muros.map(x => x.relacion)), 2) : null, cirsocRho: v ? r(Math.max(...v.muros.map(x => x.rhoNecesaria)) * 100, 2) : null,
      };
    });
    const fila = (n: string) => c.combinado!.filas.find(f => f.nombre === n)?.valores;
    out[k] = {
      nombre, pisos: p.niveles.filter(n => n.cota >= 0).length, altura: r(p.niveles[0].cota, 1),
      Q: r(rot.D5, 1), Mv: r(rot.F5, 0), hW: r(hW, 2), e: r(pl.corr.rotoA?.e, 2),
      cargas: Object.fromEntries(['Frecuencia n1, viento A', 'G (factor de ráfaga), viento A', 'Corte del viento en PB, viento A', 'Momento del viento en PB, viento A', 'Vuelco Me / Mv (viento A)'].map(n => [n, fila(n)])),
      piezas,
    };
  }
  mkdirSync('docs/dudas_planilla', { recursive: true });
  writeFileSync('docs/dudas_planilla/datos.json', JSON.stringify(out, null, 1));
});
