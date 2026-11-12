import { describe, expect, it } from 'vitest';
import { desglosar, resumenHoja, comparar, diferencia, type EntradaDesglose } from './desglose';
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
    const sj = hs[2].pasos.find(p => p.titulo.startsWith('Suma de los J'))!;
    expect(comparar(sj.analitico, sj.excel)).toBe('coincide');
  });
  it('semáforo: verde < 0,5 %, amarillo hasta 5 %, rojo más; Δ y % sobre el analítico', () => {
    expect(diferencia(100, 100.4)).toMatchObject({ nivel: 'verde' });
    expect(diferencia(100, 103)).toMatchObject({ nivel: 'amarillo', pct: 3 });
    expect(diferencia(100, 90)).toMatchObject({ nivel: 'rojo', pct: 10, delta: -10 });
    expect(diferencia(0, 2)).toMatchObject({ nivel: 'rojo', pct: null, delta: 2 });
    expect(diferencia(5, null)).toBeNull();
  });
  it('rototraslación: el momento total M tras + Q rot · hW coincide con O cuando no hay rotación', () => {
    const r = desglosar(entrada(ejemploGuia()))[4];
    const mt = r.pasos.find(p => p.titulo.startsWith('Momento total'))!;
    expect(comparar(mt.analitico, mt.excel)).toBe('coincide');
  });
});
