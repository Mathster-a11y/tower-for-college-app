/**
 * El procedimiento de la guía paso a paso (el de la «Planilla de la guía») da lo mismo que el método Guía de la app, en
 * la torre de la guía y en las diez torres de prueba: viento y cargas nivel por nivel, vuelco y suelo, rototraslación,
 * flecha, esbeltez y flexocompresión muro por muro. Así el Excel y la app coinciden (test/libroGuia.test.ts compara el
 * libro con este motor).
 */
import { describe, expect, it } from 'vitest';
import { ejemploGuia } from '../src/engine/modelo';
import { torresPrueba } from '../src/engine/torresPrueba';
import { calcularProyecto } from '../src/ui/estado';
import { calcularGuiaPasos, datosGuia } from '../src/engine/metodos/guiaPasos';
import { verificarDireccion } from '../src/engine/flexocompresion';
import { TENSION_ADM } from '../src/engine/verificaciones';

describe.each([ejemploGuia(), ...torresPrueba()].map(p => ({ p, nombre: p.nombre })))('guía paso a paso = método Guía · $nombre', ({ p: p0 }) => {
  const p = { ...p0, calculo: { metodo: 'guia' as const, armado: 'app' as const } };
  const c = calcularProyecto(p);
  const g = calcularGuiaPasos(datosGuia(p, c.asig.piezas));
  const cmp = (n: string, a: number, b: number) => expect(Math.abs(a - b), `${n}: app ${a}, guía ${b}`).toBeLessThanOrEqual(1e-7 * Math.max(1, Math.abs(a)));
  it('viento, cargas, vuelco y suelo', () => {
    const m = c.valores.mnyq;
    cmp('W total', m.H61, g.totales.WAtot); cmp('M fundación', m.J61, g.totales.MAfund); cmp('peso', m.M61, g.totales.G); cmp('vuelco', m.L99, g.totales.vuelco);
    cmp('σ máx', m.N89, g.totales.sMax); cmp('σ mín', m.N90, g.totales.sMin); cmp('M fundación B', m.O61, g.totales.MBfund);
    c.asig.filaNivel.forEach((k, j) => { cmp(`Q ${j}`, m.I[k], g.niveles[j].QA); cmp(`M ${j}`, m.J[k], g.niveles[j].MA); cmp(`Q B ${j}`, m.N[k], g.niveles[j].QB); cmp(`M B ${j}`, m.O[k], g.niveles[j].MB); });
  });
  it('rototraslación', () => {
    for (const dir of ['A', 'B'] as const) {
      const r = dir === 'A' ? c.corr.rotoA! : c.corr.rotoB!, rg = g.roto[dir];
      cmp(`Q ${dir}`, r.Q, rg.Q); cmp(`Xr ${dir}`, r.Xr, rg.Xr); cmp(`ΣJa² ${dir}`, r.SJa2, rg.SJa2);
      for (const x of r.paralelos) {
        const y = rg.piezas.find(z => z.nombre === x.nombre)!;
        expect(y, x.nombre).toBeDefined();
        cmp(`traslación ${x.nombre}`, x.tras, y.tras); cmp(`rotación ${x.nombre}`, x.rot, y.rot);
      }
    }
  });
  it('rigidez, flecha y esbeltez', () => {
    const ctrl = (n: string) => c.controles.find(x => x.nombre.startsWith(n))!.guia!;
    cmp('flecha A', ctrl('Flecha de la ménsula, viento A'), g.rigidez.flechaA.f); cmp('flecha B', ctrl('Flecha de la ménsula, viento B'), g.rigidez.flechaB.f);
    cmp('esbeltez A', ctrl('Esbeltez λ = h / L, viento A'), g.esbeltez.A); cmp('esbeltez B', ctrl('Esbeltez λ = h / L, viento B'), g.esbeltez.B);
    cmp('ΣJ A', ctrl('ΣJ viento A'), g.roto.A.SJ); cmp('ΣJ B', ctrl('ΣJ viento B'), g.roto.B.SJ);
  });
  it('flexocompresión muro por muro', () => {
    for (const dir of ['A', 'B'] as const) {
      verificarDireccion(p, c.asig.piezas, c.corr, c.asig.filaNivel, dir, TENSION_ADM(p.hormigon)).forEach(v => {
        const ys = g.flexo.filter(z => z.dir === dir && z.pieza === v.nombre);
        expect(ys.length, v.nombre).toBe(v.muros.length);
        v.muros.forEach((mu, i) => { cmp(`tracción ${mu.id}`, mu.traccion, ys[i].traccion); cmp(`compresión ${mu.id}`, mu.compresion, ys[i].compresion); cmp(`As ${mu.id}`, mu.As, ys[i].As); });
      });
    }
  });
});
