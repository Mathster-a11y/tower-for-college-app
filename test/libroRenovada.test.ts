/**
 * Planilla renovada (etapa 5b): el libro recalculado con el evaluador de fórmulas da lo mismo que el método CIRSOC de la
 * app: viento del 102-25 nivel por nivel, frecuencia y ráfaga, vuelco, deriva, reparto por caso de carga, solicitaciones
 * de cada muro y la verificación del 201 (simple en todas las torres; completa, con los diagramas N-M, en varias).
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { ejemploGuia, type Proyecto } from '../src/engine/modelo';
import { torresPrueba } from '../src/engine/torresPrueba';
import { calcularProyecto } from '../src/ui/estado';
import { datosRenovada, libroRenovada, HR } from '../src/xlsx/libros/libroRenovada';
import { Evaluador, esError, seEntiende } from '../src/xlsx/formulas';
import { vuelco102 } from '../src/engine/metodos/cirsoc';
import { sueloCirsoc } from '../src/engine/fundaciones';

const torres = [ejemploGuia(), ...torresPrueba()];
const casos = [
  ...torres.map(p => ({ p, nivel: 'simple' as const, nombre: `${p.nombre} · simple` })),
  ...[0, 2, 6, 10].map(i => ({ p: torres[i], nivel: 'completa' as const, nombre: `${torres[i].nombre} · completa` })),
];

describe.each(casos)('planilla renovada · $nombre', ({ p: p0, nivel }) => {
  const p: Proyecto = { ...p0, calculo: { metodo: 'cirsoc', verificacion: nivel } };
  const c = calcularProyecto(p);
  const w = c.cirsoc!.viento, verif = c.cirsoc!.verif;
  const R = datosRenovada(p, c.asig.piezas, verif, nivel);
  const { libro, claves } = libroRenovada(R, p);
  const { libro: lb, nombres } = libro.aLibroEvaluable();
  const ev = new Evaluador(lb, nombres);
  const val = (k: string) => { const x = claves[k]; if (!x) throw new Error(`falta la clave ${k}`); return ev.celda(x.hoja, x.ref); };
  const igual = (k: string, esperado: number, tol = 1e-9) => {
    const x = val(k);
    if (!isFinite(esperado)) { expect(typeof x === 'number' && x >= 1e98, `${k}: ${x} (app ∞)`).toBe(true); return; }
    if (typeof x !== 'number') throw new Error(`${k}: ${JSON.stringify(x)} (esperado ${esperado})`);
    expect(Math.abs(x - esperado), `${k}: libro ${x}, app ${esperado}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(esperado)));
  };

  it('todas las fórmulas se entienden y ninguna da error', () => {
    const errores: string[] = [];
    for (const [hoja, celdas] of lb) for (const [ref, x] of celdas) {
      if (x.f === undefined) continue;
      if (!seEntiende(x.f)) { errores.push(`${hoja}!${ref}: no se entiende ${x.f.slice(0, 120)}`); continue; }
      const v = ev.celda(hoja, ref);
      if (esError(v)) errores.push(`${hoja}!${ref} = ${v.error}: ${x.f.slice(0, 160)}`);
    }
    expect(errores.slice(0, 8).join('\n')).toBe('');
  });
  it('viento del 102-25: frecuencia, ráfaga, fuerzas nivel por nivel, carga mínima y servicio', () => {
    igual('V', w.V); igual('qh', w.A.qh); igual('relServ', w.servicio.relacion);
    for (const dir of ['A', 'B'] as const) {
      const x = w[dir];
      if (x.Cw !== undefined) igual(`Cw_${dir}`, x.Cw);
      igual(`frec_${dir}`, x.n1); igual(`G_${dir}`, x.Gusado); igual(`Cps_${dir}`, x.Cps); igual(`Lef_${dir}`, x.Lef);
      igual(`Wtot_${dir}`, x.W); igual(`Wmin_${dir}`, x.Wmin); igual(`QPB_${dir}`, x.QPB); igual(`MPB_${dir}`, x.MPB); igual(`WPB_${dir}`, x.WPB);
      x.niveles.forEach((n, i) => { igual(`W_${dir}_${i}`, n.W); igual(`Q_${dir}_${i}`, n.Q); igual(`M_${dir}_${i}`, n.M); });
    }
  });
  it('núcleos cerrados (Bredt): Jt y el torsor de cada caso, como la app', () => {
    for (const n of R.nucleos ?? []) {
      igual(`Jt_${n.nombre}`, n.Jt);
      for (const dir of ['A', 'B'] as const) {
        const rg = c.cirsoc!.corr[dir === 'A' ? 'rotoA' : 'rotoB']!;
        igual(`T1_${dir}_${n.nombre}`, w[dir].QPB * Math.abs(rg.e) * n.Jeq / rg.SJa2);
      }
    }
  });
  it('vuelco y deriva de servicio', () => {
    const vu = vuelco102(p, w);
    igual('vuelco', vu.Me / vu.Mv); igual('Mv', vu.Mv);
    for (const dir of ['A', 'B'] as const) igual(`deriva_${dir}`, c.controles.find(x => x.nombre === `Deriva de servicio, viento ${dir}`)!.guia!);
    const su = sueloCirsoc(p, w);
    su.dirs.forEach(d => d.combos.forEach((x, i) => igual(`suelo_${d.dir}_${i}`, x.vuelca ? 1e99 : x.sMax)));
  });
  it('reparto por caso de carga', () => {
    for (const v of verif) v.partes.forEach((f, k) => igual(`f${k + 1}_${v.dir}_${v.nombre}`, f));
  });
  it('solicitaciones y CIRSOC 201 muro por muro', () => {
    for (const v of verif) {
      const vistos = new Map<string, number>();
      for (const m of v.muros) {
        const n = vistos.get(m.id) ?? 0; vistos.set(m.id, n + 1);
        const kp = `${v.dir}|${v.nombre}|${m.id}|${n}`;
        m.solicitaciones.forEach((s, i) => { igual(`Nu|${kp}|${i}`, s.Nu); igual(`Mu|${kp}|${i}`, s.Mu); igual(`Vu|${kp}|${i}`, s.Vu); });
        igual(`Vu|${kp}`, m.corte.Vu); igual(`phiVn|${kp}`, m.corte.phiVn); igual(`rhoH|${kp}`, m.rhoH); igual(`rhoMin|${kp}`, m.rhoMin);
        igual(`NuMax|${kp}`, m.NuMax); igual(`axialEmp|${kp}`, m.axialEmp); igual(`C|${kp}`, m.cordon.C, 1e-7); igual(`T|${kp}`, m.cordon.T, 1e-7);   // diferencia de dos números grandes
        if (nivel === 'completa') { igual(`relMin|${kp}`, m.relacion, 1e-7); igual(`relAd|${kp}`, m.relacionNecesaria, 1e-7); }
      }
    }
  });
  it('se escribe como .xlsx', async () => {
    const zip = await JSZip.loadAsync(await libro.xlsx());
    const wb = await zip.file('xl/workbook.xml')!.async('string');
    for (const h of Object.values(HR)) if (h !== HR.diag || nivel === 'completa') expect(wb).toContain(`name="${h}"`);
  });
});

describe('la planilla renovada se vuelve a abrir en la app', () => {
  it('las tablas T3D ocultas devuelven el mismo proyecto', async () => {
    const { leerPlanilla } = await import('../src/xlsx/planilla');
    const p: Proyecto = { ...ejemploGuia(), calculo: { metodo: 'cirsoc', verificacion: 'simple' } };
    const c = calcularProyecto(p);
    const { libro } = libroRenovada(datosRenovada(p, c.asig.piezas, c.cirsoc!.verif, 'simple'), p);
    const l = await leerPlanilla(await libro.xlsx());
    expect(l.proyecto!.muros.length).toBe(p.muros.length);
    expect(l.proyecto!.calculo?.metodo).toBe('cirsoc');
  });
});
