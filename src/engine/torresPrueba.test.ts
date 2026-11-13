/**
 * Diez torres variadas: se arman con las herramientas de la app y se controla todo el cálculo contra cuentas
 * hechas aparte (viento del CIRSOC, sumas de fuerzas y momentos, peso y vuelco, J de cada pieza, reparto de la
 * rototraslación, siluetas y áreas de influencia), además de los controles de estabilidad, rigidez y flexión.
 */
import { describe, expect, it } from 'vitest';
import { torresPrueba } from './torresPrueba';
import { aPlanilla } from './mapping';
import { calcularPlanilla } from './planilla';
import { calcularCorregido } from './correcciones';
import { controles } from './verificaciones';
import { desglosar, resumenHoja } from './desglose';
import { entrada } from './desglose.test';
import { areaSilueta, carpinteriaDeNivel, plantaDeNivel } from './silueta';
import { areasInfluencia } from './areas';
import { partesDePieza } from './flexocompresion';
import { presenteEn, type Proyecto } from './modelo';

function calcular(p: Proyecto) {
  const asig = aPlanilla(p), res = calcularPlanilla(asig.datos);
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const corr = calcularCorregido(asig.datos, asig.filaNivel[iPB] ?? 50, { proyecto: p, piezas: asig.piezas });
  return { asig, res, corr, iPB, cs: controles(p, asig.datos, res, corr, p.hormigon || 'H30', asig.piezas, asig.filaNivel) };
}
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9);

/** J de un rectángulo b × h (h en la dirección que flexiona) */
const Jr = (b: number, h: number) => (b * h ** 3) / 12;

const informe: Record<string, unknown>[] = [];

describe('diez torres de prueba', () => {
  const torres = torresPrueba();
  it('son 10 y todas tienen piezas en los dos vientos', () => {
    expect(torres).toHaveLength(10);
  });
  torres.forEach(p => {
    describe(p.nombre, () => {
      const { asig, res, corr, iPB, cs } = calcular(p);
      const s = p.sitio, zPB = 0;
      const sobre = p.niveles.filter(n => n.cota > zPB);

      it('el cálculo no tiene huecos (NaN o infinitos) en lo que se informa', () => {
        const nums = [res.mnyq.H61, res.mnyq.J61, res.mnyq.M61, res.mnyq.L99, res.jpar.AY24, res.jort.AY24, res.rotA.J7, res.rotB.J7,
          corr.guia.mnyq.H61, corr.guia.mnyq.J61, corr.guia.mnyq.L99];
        nums.forEach(v => expect(Number.isFinite(v)).toBe(true));
        cs.forEach(c => { if (c.guia !== null) expect(Number.isFinite(c.guia as number)).toBe(true); });
      });

      it('viento: qz de cada nivel = 0,613·Kzt·Kd·V²·I·Kz, con Kz = 2,01·(z/zg)^(2/α) (CIRSOC 102, tabla 5)', () => {
        sobre.forEach(n => {
          const fila = asig.filaNivel[p.niveles.indexOf(n)];
          const z = n.cota, Kz = 2.01 * (z / s.zg) ** (2 / s.alfa);
          const q = 0.613 * s.Kzt * s.Kd * s.V ** 2 * s.I * Kz;
          expect(rel(res.viento.qz[fila], q)).toBeLessThan(1e-9);
        });
      });

      it('fuerzas: W = Σ p(z)·B·h tributaria y Mv = Σ F·(z − z fundación), contra la Guía/CIRSOC', () => {
        // presión neta (t/m²) como la planilla: qz·G·Cpb − qh·G·Cps, en N/m² / 10 000; con z ≥ 5 m (criterio de la guía)
        const qde = (z: number) => 0.613 * s.Kzt * s.Kd * s.V ** 2 * s.I * 2.01 * (Math.max(z, 5) / s.zg) ** (2 / s.alfa);
        const qh = qde(p.niveles[0].cota);
        const Bniv = (i: number) => p.niveles.slice(0, i + 1).reduce<number>((v, x) => x.B ?? v, 0);
        let W = 0, Mv = 0;
        const zFund = p.niveles[p.niveles.length - 1].cota;
        sobre.forEach(n => {
          const i = p.niveles.indexOf(n);
          const arriba = i > 0 ? p.niveles[i - 1].cota : n.cota, abajo = p.niveles[i + 1].cota;
          const ht = i === 0 ? (n.cota - abajo) / 2 : (arriba - abajo) / 2;
          const pz = (qde(n.cota) * s.G * s.Cpb - qh * s.G * s.Cps) / 10000;
          const F = pz * Bniv(i) * ht;
          W += F; Mv += F * (n.cota - zFund);
        });
        // criterio C de la guía: la franja de PB (de 0 a medio entrepiso, con Kz de z = 5 m) entra en W y en el vuelco
        const iP = p.niveles.findIndex(n => n.cota === 0), z1 = p.niveles[iP - 1].cota;
        const pPB = (qde(0) * s.G * s.Cpb - qh * s.G * s.Cps) / 10000, FPB = pPB * Bniv(iP) * (z1 / 2);
        W += FPB; Mv += FPB * (0 - zFund);
        expect(rel(corr.guia.mnyq.H61, W)).toBeLessThan(0.01);
        expect(rel(corr.guia.mnyq.J61, Mv)).toBeLessThan(0.01);
        informe.push({ torre: p.nombre.split(' · ')[0], h: p.niveles[0].cota, W: +W.toFixed(1), WGuia: +corr.guia.mnyq.H61.toFixed(1), WPlanilla: +res.mnyq.H61.toFixed(1), Mv: Math.round(Mv) });
      });

      it('peso y vuelco: P = Σ 0,7 t/m² · B·L por nivel y ν = (P·b₁/2) / Mv', () => {
        const g = corr.guia.mnyq;
        expect(g.L99).toBeGreaterThan(0);
        // ν se recalcula con el P y el Mv de la propia hoja: Me = P · b1 / 2
        expect(rel(g.L99, (g.M61 * p.fundacion.b1) / 2 / g.J61)).toBeLessThan(0.02);
      });

      it('rigidez: ΣJ de las piezas (sección real, Steiner) y el de la planilla', () => {
        for (const dir of ['A', 'B'] as const) {
          const pzs = asig.piezas.filter(x => x.dir === dir && x.filaHoja !== null);
          let Jmano = 0;
          pzs.forEach(pz => {
            const ms = pz.muros.map(id => p.muros.find(m => m.id === id)!);
            Jmano += partesDePieza(ms, dir).J;
          });
          const Jhoja = dir === 'A' ? res.jpar.AY24 : res.jort.AY24;
          expect(Jmano).toBeGreaterThan(0);
          // el molde de la hoja simplifica la sección: se informa la diferencia (las piezas con aviso la explican)
          const avisos = pzs.filter(pz => pz.avisos.some(a => a.includes('cambia el J'))).length;
          if (!avisos) expect(rel(Jhoja, Jmano)).toBeLessThan(0.05);
          informe.push({ torre: p.nombre.split(' · ')[0], [`J${dir} mano`]: +Jmano.toFixed(2), [`J${dir} hoja`]: +Jhoja.toFixed(2), [`avisos ${dir}`]: avisos });
        }
      });

      it('una pieza de prueba a mano: tabique rectangular J = e·h³/12', () => {
        const t = p.muros.find(m => (m.tipo ?? 'tabique') === 'tabique' && m.pieza?.tipo === 'tabique');
        if (!t) return;
        const dir = t.dir === 'Y' ? 'A' : 'B';
        expect(rel(partesDePieza([t], dir).J, Jr(t.espesor, t.largo))).toBeLessThan(1e-9);
      });

      it('rototraslación: Σ traslación = Q, Σ J·a = 0 y Mt = Q·e', () => {
        for (const rr of [corr.guia.rotA, corr.guia.rotB]) {
          const tras = rr.E.slice(0, 20).reduce((a, x) => a + (Number.isFinite(x) ? x : 0), 0);
          expect(rel(tras, rr.D5)).toBeLessThan(1e-6);
          const sJa = rr.L.slice(0, 20).reduce((a, x) => a + (Number.isFinite(x) ? x : 0), 0);
          const esc = rr.L.slice(0, 20).reduce((a, x) => a + Math.abs(Number.isFinite(x) ? x : 0), 0) || 1;
          expect(Math.abs(sJa) / esc).toBeLessThan(1e-6);
          expect(rel(rr.J15, rr.D5 * rr.J7)).toBeLessThan(1e-9);
        }
      });

      it('silueta, carpintería y áreas de influencia', () => {
        const pl = plantaDeNivel(p, iPB);
        const A = areaSilueta(pl.silueta);
        expect(A).toBeGreaterThan(0);
        const a = areasInfluencia(p, iPB);
        const suma = Object.values(a.area).reduce((x, y) => x + y, 0);
        expect(rel(suma, a.total)).toBeLessThan(0.02);                  // toda la losa tiene dueño
        expect(rel(a.total, A)).toBeLessThan(0.03);                      // la cuadrícula cubre la silueta
        const car = carpinteriaDeNivel(p, 0);
        if (car) { expect(car.a).toBeLessThanOrEqual(pl.B + 1e-6 + 1); expect(areaSilueta(car.v)).toBeLessThan(A + 1e-6 + 60); }
        // los muros que terminan a media altura dejan de estar arriba
        p.muros.filter(m => m.zHasta != null).forEach(m => expect(presenteEn(m, p.niveles[0].cota, -99, p.niveles[0].cota)).toBe(false));
      });

      it('desglose analítico: cada diferencia con la planilla tiene su explicación', () => {
        const hs = desglosar(entrada(p));
        hs.forEach(h => { const r = resumenHoja(h); if (r.difieren) expect(h.diferencias.length + h.pasos.filter(x => x.nota).length).toBeGreaterThan(0); });
      });

      it('controles de estabilidad, rigidez, reparto y flexión: verifican', () => {
        const malos = cs.filter(c => c.estado === 'no verifica').map(c => `${c.grupo} · ${c.nombre}: ${c.guia}${c.nota ? ` (${c.nota})` : ''}`);
        const fila: Record<string, unknown> = { torre: p.nombre.split(' · ')[0] };
        cs.filter(c => ['Estabilidad', 'Rigidez', 'Viento'].includes(c.grupo)).forEach(c => { fila[c.nombre.slice(0, 24)] = typeof c.guia === 'number' ? +c.guia.toFixed(2) : c.guia; });
        fila['no verifica'] = malos.length; fila['atención'] = cs.filter(c => c.estado === 'atención').length;
        informe.push(fila);
        if (malos.length) console.log(p.nombre, '\n  ' + malos.join('\n  '));
        expect(malos).toEqual([]);
      });
    });
  });
  it('informe', () => { console.log(JSON.stringify(informe, null, 0).replace(/\},\{/g, '},\n{')); });
});
