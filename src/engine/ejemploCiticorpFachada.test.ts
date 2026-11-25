import { describe, expect, it } from 'vitest';
import { ejemploCiticorpFachada } from './ejemploCiticorpFachada';
import { aplicarCarpinteriaTramos, bandasFachada, calcularPaneleria } from './carpinteria';
import { avisosDiseno } from './avisos';
import { leerProyecto } from './lector';
import { cajaSilueta, carpinteriaDeNivel } from './silueta';
import { armarCara, paraLado, paraViento } from './exo';
import { adentro } from './avisos';

const armar = () => { const p = ejemploCiticorpFachada(); aplicarCarpinteriaTramos(p); return p; };
/** la piel a la cota z: el anillo de la banda que la contiene, interpolado entre abajo y arriba */
function pielEn(p: ReturnType<typeof armar>, z: number) {
  const b = bandasFachada(p).find(x => z >= x.z0 - 1e-6 && z <= x.z1 + 1e-6);
  if (!b) return null;
  const f = Math.min(1, Math.max(0, (z - b.z0) / (b.z1 - b.z0)));
  return b.a.map((q, i) => ({ x: q.x + (b.b[i].x - q.x) * f, y: q.y + (b.b[i].y - q.y) * f }));
}

describe('Citicorp Center: forma y fachada', () => {
  it('se lee como proyecto válido y entra en los 49 niveles de la planilla', () => {
    const p = ejemploCiticorpFachada();
    expect(leerProyecto(JSON.parse(JSON.stringify(p))).ok).toBe(true);
    expect(p.niveles.filter(n => n.cota > 0).length).toBeLessThanOrEqual(49);
  });
  it('la corona: cajón en todo el ancho, pendiente a 45° y la franja plana arriba', () => {
    const p = armar();
    const iC = p.niveles.findIndex(n => n.nombre.startsWith('Corona: techo del cajón'));
    expect(cajaSilueta(carpinteriaDeNivel(p, iC + 1)!.v).L).toBeCloseTo(47.85, 2);        // el piso 56 (el cajón): todo el ancho
    const top = cajaSilueta(carpinteriaDeNivel(p, 0)!.v);
    expect(top.L).toBeCloseTo(7.97, 1);
    const r = calcularPaneleria(bandasFachada(p), p.paneleria!);
    const inc = r.carasInfo.filter(c => c.inclinacion >= 30 && c.inclinacion <= 60);
    expect(inc.map(c => c.inclinacion)).toEqual([45]);
    expect(r.paneles.filter(x => x.cara === inc[0].id).every(x => x.opaco)).toBe(true);
    expect(r.alabeados).toBe(0);
  });
  it('la estructura siempre adentro de la piel (del cajón de transición para arriba)', () => {
    const p = armar(), def = p.exo!;
    const zs = [0, ...p.niveles.filter(n => n.cota > 0).map(n => n.cota).sort((a, b) => a - b)];
    const zBase = 34.75, fuera: string[] = [];
    (['A', 'B'] as const).forEach(dir => {
      const ancho = 47.85 + 2 * def.separacion, t = ancho / 2;
      [-t, t].forEach(tc => {
        const c = armarCara(paraLado(paraViento(def, dir), tc), ancho, zs);
        c.barras.forEach(b => {
          if ((b.fraccion ?? 1) !== 1) return;                                    // alas: son barras de otra cara
          const A = c.nudos[b.a], B = c.nudos[b.b];
          for (let k = 0; k <= 10; k++) {
            const s = A.s + (B.s - A.s) * k / 10, z = A.z + (B.z - A.z) * k / 10;
            if (z < zBase + 1e-6) continue;
            const piel = pielEn(p, z); if (!piel) { fuera.push(`${dir}${tc > 0 ? '+' : '−'} ${b.id} z=${z.toFixed(1)} sin piel`); break; }
            const q = dir === 'A' ? { x: tc, y: s } : { x: s, y: tc };
            if (!adentro(q, piel, 0.01)) { fuera.push(`${dir}${tc > 0 ? '+' : '−'} ${b.id} (${q.x.toFixed(1)}, ${q.y.toFixed(1)}, ${z.toFixed(1)})`); break; }
          }
        });
      });
    });
    expect(fuera).toEqual([]);
  });
  it('sin avisos de la piel, de las losas ni de la planilla', () => {
    const p = armar();
    expect(avisosDiseno(p).filter(a => a.tipo !== 'sin-pieza').map(a => a.texto)).toEqual([]);
    const i56 = p.niveles.findIndex(n => n.nombre.startsWith('56º'));
    expect([p.niveles[i56].B, p.niveles[i56].L]).toEqual([47.85, 47.85]);
  });
});

describe('Citicorp: la base', () => {
  it('debajo del cajón solo baja la supercolumna reticulada a media cara (sin esquinas ni diagonales en la plaza)', () => {
    const p = ejemploCiticorpFachada(), def = p.exo!;
    const zs = [0, ...p.niveles.filter(n => n.cota > 0).map(n => n.cota).sort((a, b) => a - b)];
    const ancho = 47.85 + 2 * def.separacion;
    (['A', 'B'] as const).forEach(dir => {
      const c = armarCara(paraLado(paraViento(def, dir), ancho / 2), ancho, zs);
      // las que se dibujan (las alas son las supercolumnas de las otras caras: se dibujan con ellas)
      const abajo = c.barras.filter(b => (b.fraccion ?? 1) === 1 && Math.min(c.nudos[b.a].z, c.nudos[b.b].z) < 34.75 - 1e-6);
      // la supercolumna reticulada: todo adentro de sus 7,30 m de ancho, a media cara (nada en las esquinas)
      expect(abajo.length).toBeGreaterThan(0);
      expect(abajo.every(b => Math.abs(c.nudos[b.a].s) <= 3.65 + 1e-6 && Math.abs(c.nudos[b.b].s) <= 3.65 + 1e-6)).toBe(true);
    });
  });
});

describe('Citicorp: los chevrones se unen solo por el mástil', () => {
  it('ninguna columna de esquina llega al nudo del tope de su módulo (termina un piso abajo)', () => {
    const p = ejemploCiticorpFachada(), def = p.exo!;
    const zs = [0, ...p.niveles.filter(n => n.cota > 0).map(n => n.cota).sort((a, b) => a - b)];
    const ancho = 47.85 + 2 * def.separacion, S = ancho / 2;
    const topes = [16, 24, 32, 40, 48, 56].map(k => p.niveles.find(n => n.nombre.startsWith(`${k}º`))!.cota);
    (['A', 'B'] as const).forEach(dir => {
      const c = armarCara(paraLado(paraViento(def, dir), S), ancho, zs);
      const esq = c.barras.filter(b => (b.fraccion ?? 1) === 1 && b.clase === 'columna' && [b.a, b.b].every(k => Math.abs(Math.abs(c.nudos[k].s) - S) < 1e-3));
      topes.forEach(z => expect(esq.filter(b => Math.abs(Math.max(c.nudos[b.a].z, c.nudos[b.b].z) - z) < 1e-6).length).toBe(0));
    });
  });

  it('las columnas de los cuartos van de corrido, piso por piso, del 10º al 56º', () => {
    const p = ejemploCiticorpFachada(), def = p.exo!;
    const zs = [0, ...p.niveles.filter(n => n.cota > 0).map(n => n.cota).sort((a, b) => a - b)];
    const ancho = 47.85 + 2 * def.separacion, S = ancho / 2;
    const cota = (k: number) => p.niveles.find(n => n.nombre.startsWith(`${k}º`))!.cota;
    const tramo = zs.filter(z => z >= cota(10) - 1e-6 && z <= cota(56) + 1e-6);
    (['A', 'B'] as const).forEach(dir => {
      const c = armarCara(paraLado(paraViento(def, dir), S), ancho, zs);
      for (const s of [-S / 2, S / 2]) {
        const cols = c.barras.filter(b => b.clase === 'columna' && [b.a, b.b].every(k => Math.abs(c.nudos[k].s - s) < 0.01));
        tramo.forEach((z, k) => {
          if (!k) return;
          const hay = cols.some(b => Math.abs(Math.min(c.nudos[b.a].z, c.nudos[b.b].z) - tramo[k - 1]) < 1e-6 && Math.abs(Math.max(c.nudos[b.a].z, c.nudos[b.b].z) - z) < 1e-6);
          expect(hay, `cara ${dir}, cuarto ${s.toFixed(2)}, ${tramo[k - 1].toFixed(2)} → ${z.toFixed(2)}`).toBe(true);
          // y unidas: el nudo de abajo de cada tramo es el de arriba del tramo de abajo
          if (k >= 2) {
            const de = (z0: number, z1: number) => cols.find(b => Math.abs(Math.min(c.nudos[b.a].z, c.nudos[b.b].z) - z0) < 1e-6 && Math.abs(Math.max(c.nudos[b.a].z, c.nudos[b.b].z) - z1) < 1e-6)!;
            const ab = de(tramo[k - 2], tramo[k - 1]), ar = de(tramo[k - 1], z);
            const arriba = c.nudos[ab.a].z > c.nudos[ab.b].z ? ab.a : ab.b, abajo = c.nudos[ar.a].z < c.nudos[ar.b].z ? ar.a : ar.b;
            expect(abajo, `cara ${dir}, cuarto ${s.toFixed(2)}, nudo a ${tramo[k - 1].toFixed(2)}`).toBe(arriba);
          }
        });
      }
    });
  });
  it('las losas apoyan en el exo: lleva su franja de cada losa además del viento', async () => {
    const p = ejemploCiticorpFachada(), def = p.exo!;
    expect(def.losas?.franja).toBeGreaterThan(0);
    const { calcularExo } = await import('./exo');
    const zs = [0, ...p.niveles.filter(n => n.cota > 0).map(n => n.cota).sort((a, b) => a - b)];
    const ancho = 47.85 + 2 * def.separacion, S = ancho / 2;
    // sin viento: con las losas, las columnas bajan más carga que con el peso propio solo
    const W = zs.map(() => 0), EJ = () => 1e3;
    const conLosas = calcularExo(paraViento(def, 'A'), zs, W, EJ, ancho, [-S, S], 3e6);
    const sinLosas = calcularExo({ ...paraViento(def, 'A'), losas: undefined }, zs, W, EJ, ancho, [-S, S], 3e6);
    const reaccion = (r: typeof conLosas) => r.caras.reduce((s, c) => s + c.reacciones.reduce((q, x) => q + x.V, 0), 0);
    expect(Math.abs(reaccion(conLosas))).toBeGreaterThan(Math.abs(reaccion(sinLosas)) * 1.5);
  });
  it('abre con el método CIRSOC (el exo entra en el cálculo)', () => {
    expect(ejemploCiticorpFachada().calculo?.metodo).toBe('cirsoc');
  });
});
