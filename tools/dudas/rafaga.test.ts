import { it } from 'vitest';
import { rafaga } from '../../src/engine/cargas/cirsoc102';
import { ejemploGuia, ejemploAsimetrico } from '../../src/engine/modelo';
import { ejemploPlanta34 } from '../../src/engine/ejemplo34';
it.skipIf(!process.env.DUDAS)('Gf con la frecuencia de la planilla', () => {
  for (const [n, p, n1] of [['guia', ejemploGuia(), 0.8735], ['asim', ejemploAsimetrico(), 0.8735], ['p34', ejemploPlanta34(), 0.4713]] as const) {
    const h = p.niveles[0].cota, nv = p.niveles.find(x => x.B) ?? p.niveles[0];
    for (const e of ['B', 'C'] as const) {
      const r = rafaga(h, nv.B!, nv.L!, e, p.sitio.V, n1);
      console.log(n, 'h', h, 'B', nv.B, 'L', nv.L, 'V', p.sitio.V, 'exp', e, 'G', r.G.toFixed(3), 'Gf', r.Gf!.toFixed(3), 'Gf1%', rafaga(h, nv.B!, nv.L!, e, p.sitio.V, n1, 0.01).Gf!.toFixed(3));
    }
  }
});
