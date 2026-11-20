/**
 * Planilla de la guía (etapa 5a): el libro recalculado con el evaluador de fórmulas da lo mismo que el motor de la guía
 * paso a paso (guiaPasos), y ese motor da lo mismo que el método Guía de la app (test/guiaPasos.test.ts).
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { ejemploGuia } from '../src/engine/modelo';
import { torresPrueba } from '../src/engine/torresPrueba';
import { aPlanilla } from '../src/engine/mapping';
import { calcularGuiaPasos, datosGuia } from '../src/engine/metodos/guiaPasos';
import { libroGuia, HG } from '../src/xlsx/libros/libroGuia';
import { Evaluador, esError, seEntiende } from '../src/xlsx/formulas';

const torres = [ejemploGuia(), ...torresPrueba()];

describe.each(torres.map(p => ({ p, nombre: p.nombre })))('planilla de la guía · $nombre', ({ p }) => {
  const asig = aPlanilla(p);
  const d = datosGuia(p, asig.piezas);
  const g = calcularGuiaPasos(d);
  const { libro, claves } = libroGuia(d, p);
  const { libro: lb, nombres } = libro.aLibroEvaluable();
  const ev = new Evaluador(lb, nombres);
  const val = (k: string) => { const c = claves[k]; if (!c) throw new Error(`falta la clave ${k}`); return ev.celda(c.hoja, c.ref); };
  const igual = (k: string, esperado: number, tol = 1e-9) => {
    const x = val(k);
    if (typeof x !== 'number') throw new Error(`${k}: ${JSON.stringify(x)} (esperado ${esperado})`);
    expect(Math.abs(x - esperado), `${k}: libro ${x}, motor ${esperado}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(esperado)));
  };

  it('todas las fórmulas se entienden y ninguna da error', () => {
    const errores: string[] = [];
    for (const [hoja, celdas] of lb) for (const [ref, c] of celdas) {
      if (c.f === undefined) continue;
      if (!seEntiende(c.f)) { errores.push(`${hoja}!${ref}: no se entiende ${c.f}`); continue; }
      const x = ev.celda(hoja, ref);
      if (esError(x)) errores.push(`${hoja}!${ref} = ${x.error}: ${c.f}`);
    }
    expect(errores.slice(0, 10).join("\n")).toBe("");
  });
  it('viento, cargas y fundación: igual que el motor', () => {
    g.niveles.forEach((n, i) => {
      igual(`W_A_${i}`, n.WA); igual(`W_B_${i}`, n.WB); igual(`Q_A_${i}`, n.QA); igual(`M_A_${i}`, n.MA); igual(`Q_B_${i}`, n.QB); igual(`M_B_${i}`, n.MB); igual(`N_${i}`, n.N);
    });
    const t = g.totales;
    igual('WA', t.WA); igual('WB', t.WB); igual('W_PB', t.WPB); igual('WA_total', t.WAtot); igual('Mv', t.MAfund); igual('G_total', t.G);
    igual('vuelco', t.vuelco); igual('e_A', t.e); igual('e_B', t.eB); igual('sMax', t.sMax); igual('sMin', t.sMin);
    igual('fueraA', t.presionesFueraA); igual('fueraB', t.presionesFueraB);
    igual('esbeltezA', g.esbeltez.A); igual('esbeltezB', g.esbeltez.B);
  });
  it('secciones, rigidez y rototraslación: igual que el motor', () => {
    for (const dir of ['A', 'B'] as const) {
      const r = g.roto[dir];
      igual(`SJ_${dir}`, r.SJ); igual(`Xr_${dir}`, r.Xr); igual(`SJa2_${dir}`, r.SJa2);
      r.piezas.forEach(x => { igual(`J_${dir}_${x.nombre}`, x.J); igual(`tras_${dir}_${x.nombre}`, x.tras); igual(`rot_${dir}_${x.nombre}`, x.rot); igual(`Mp_${dir}_${x.nombre}`, x.M); });
    }
    igual('JminA', g.rigidez.JminA); igual('JminB', g.rigidez.JminB); igual('flechaA', g.rigidez.flechaA.f); igual('flechaB', g.rigidez.flechaB.f);
  });
  it('flexocompresión y armado, muro por muro: igual que el motor', () => {
    const vistos = new Map<string, number>();
    for (const x of g.flexo) {
      // la clave lleva el índice del rectángulo: se buscan en orden
      const pref = `${x.dir}_${x.pieza}_${x.muro}_`;
      const ks = Object.keys(claves).filter(k => k.startsWith(`tr_${pref}`)).map(k => k.slice(3));
      const n = vistos.get(pref) ?? 0; vistos.set(pref, n + 1);
      const kf = ks[n];
      expect(kf, pref).toBeDefined();
      igual(`tr_${kf}`, x.traccion); igual(`co_${kf}`, x.compresion); igual(`As_${kf}`, x.As);
      igual(`phiV_${kf}`, x.phiV); igual(`sV_${kf}`, x.sV); igual(`phiH_${kf}`, x.phiH); igual(`sH_${kf}`, x.sH);
    }
  });
  it('se escribe como .xlsx con sus hojas, sus gráficos y los nombres definidos', async () => {
    const zip = await JSZip.loadAsync(await libro.xlsx());
    const wb = await zip.file('xl/workbook.xml')!.async('string');
    for (const h of Object.values(HG)) expect(wb).toContain(`name="${h}"`);
    expect(wb).toContain('<definedName name="Vbas">');
    expect(wb).toContain('fullCalcOnLoad="1"');
    expect(Object.keys(zip.files).filter(f => f.startsWith('xl/charts/')).length).toBeGreaterThanOrEqual(7);
  });
});

describe('la planilla de la guía se vuelve a abrir en la app', () => {
  it('las tablas T3D ocultas devuelven el mismo proyecto (muros, niveles y método)', async () => {
    const { leerPlanilla } = await import('../src/xlsx/planilla');
    const p = { ...ejemploGuia(), calculo: { metodo: 'guia' as const } };
    const { libro } = libroGuia(datosGuia(p, aPlanilla(p).piezas), p);
    const l = await leerPlanilla(await libro.xlsx());
    expect(l.proyecto).not.toBeNull();
    expect(l.proyecto!.muros.length).toBe(p.muros.length);
    expect(l.proyecto!.niveles.map(n => n.cota)).toEqual(p.niveles.map(n => n.cota));
    expect(l.proyecto!.calculo?.metodo).toBe('guia');
  });
});
