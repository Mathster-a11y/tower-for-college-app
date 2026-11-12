import { describe, expect, it } from 'vitest';
import { desglosar, resumenHoja, comparar, type EntradaDesglose } from './desglose';
import { ejemploGuia, ejemploAsimetrico, type Proyecto } from './modelo';
import { aPlanilla } from './mapping';
import { calcularPlanilla } from './planilla';

export function entrada(p: Proyecto): EntradaDesglose {
  const asig = aPlanilla(p), r = calcularPlanilla(asig.datos);
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  return { d: asig.datos, r, filaNivel: asig.filaNivel, nombresNivel: p.niveles.map(n => n.nombre),
    piezas: asig.piezas.map(z => ({ nombre: z.nombre, dir: z.dir, fila: z.filaHoja })), hormigon: p.hormigon || 'H30',
    BPB: p.niveles.slice(0, iPB + 1).reduce<number | null>((v, n) => n.B ?? v, null) ?? 0 };
}
describe('desglose analítico', () => {
  for (const [nombre, p] of [['guía', ejemploGuia()], ['anexo', ejemploAsimetrico()]] as const) {
    it(`ejemplo ${nombre}: cada hoja coincide salvo las diferencias explicadas`, () => {
      const hs = desglosar(entrada(p));
      expect(hs.map(h => h.hoja)).toEqual(['viento', 'M,NyQ', 'J Tabiques paralelos', 'J Tabiques ortogonales', 'Rototrasl. cara mayor', 'Rototrasl. cara menor']);
      for (const h of hs) {
        const r = resumenHoja(h);
        const malos = h.pasos.filter(x => comparar(x.analitico, x.excel) === 'difiere').map(x => `${x.titulo}: ${x.analitico} vs ${x.excel}`);
        console.log(nombre, h.hoja, `${r.coinciden}/${r.total}`, 'A:', r.verificaAnalitico, 'E:', r.verificaExcel, malos);
        // si algo difiere, la hoja lo explica
        if (r.difieren) expect(h.diferencias.length + h.pasos.filter(x => x.nota).length).toBeGreaterThan(0);
      }
    });
  }
  it('una pieza simétrica con alas iguales: J igual al de la planilla', () => {
    const hs = desglosar(entrada(ejemploGuia()));
    const j = hs[2];
    expect(comparar(j.pasos.at(-3)!.analitico, j.pasos.at(-3)!.excel)).toBe('coincide');   // ΣJ
  });
});
