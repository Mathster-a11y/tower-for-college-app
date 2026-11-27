/**
 * Las herramientas para diseñar torres de perfil complejo sin código, probadas armando el Gherkin como lo haría un
 * usuario: la forma desde una tabla de alturas, los pozos de luz que giran, el círculo entero desde el piso 31, la
 * excepción de un solo piso (el 16) y la cúpula sin losas.
 */
import { describe, expect, it } from 'vitest';
import { aplicarPerfil, perfilDesdeTabla, valorPerfil } from './perfil_torre';
import { losasDeNivel, type Nivel, type Proyecto } from './modelo';
import { ejemploGherkin } from './ejemplosExo';
import { areaSilueta, cajaSilueta, puntosSilueta, type Vertice } from './silueta';
import { vuelco102 } from './metodos/cirsoc';
import { viento102 } from './cargas/cirsoc102';
import { alturaYLosas, datosAlturaDe } from './flexocompresion';

const circulo = (d: number): Vertice[] => { const r = d / 2, b = Math.tan(Math.PI / 8); return [{ x: r, y: 0, b }, { x: 0, y: r, b }, { x: -r, y: 0, b }, { x: 0, y: -r, b }]; };
/** la losa con los 6 pozos de luz (como el ejemplo): R exterior, punta al 63 % */
const conPozos = (d: number): Vertice[] => {
  const R = d / 2, g = Math.PI / 180, out: Vertice[] = [];
  for (let j = 0; j < 6; j++) {
    const c = (10 + 60 * j) * g;
    out.push({ x: R * Math.cos(c - 10 * g), y: R * Math.sin(c - 10 * g) }, { x: 0.63 * R * Math.cos(c), y: 0.63 * R * Math.sin(c) }, { x: R * Math.cos(c + 10 * g), y: R * Math.sin(c + 10 * g), b: Math.tan((40 * g) / 4) });
  }
  return out;
};
// la tabla del corte de Foster (la misma que usa el ejemplo), como la pegaría un usuario desde Excel: con título y coma decimal
const TABLA = `cota\tdiámetro
0\t48,9
16,6\t52,1
33,2\t54,4
49,8\t55,6
74,7\t56,4
99,6\t54
124,5\t47,7
149,4\t35,9
166\t22,85
172\t16,25
176\t10,7
179,77\t2,4`;
const diametro = (v: Vertice[]) => { const c = cajaSilueta(v); return (c.B + c.L) / 2; };
const tablaD = (z: number) => { const f = TABLA.split('\n').slice(1).map(l => l.split('\t').map(x => +x.replace(',', '.'))); const k = f.findIndex(r => r[0] >= z); if (k <= 0) return f[0][1]; const a = f[k - 1], b = f[k]; return a[1] + ((b[1] - a[1]) * (z - a[0])) / (b[0] - a[0]); };

function torreDeUsuario(): Proyecto {
  const p = ejemploGherkin();
  // el usuario parte de los mismos niveles, sin las losas dibujadas: solo dibuja la de PB (con pozos) y pega la tabla
  p.niveles = p.niveles.map(n => ({ nombre: n.nombre, cota: n.cota } as Nivel));
  const pb = p.niveles.find(n => n.cota === 0)!;
  pb.silueta = conPozos(48.9);
  const r = perfilDesdeTabla(TABLA, 0, p.niveles[0].cota);
  expect(r.error).toBeUndefined();
  // los pozos giran 5° por piso: 40 pisos → 5 · 179,77 / 4,15 grados de la base a la lente
  p.perfilTorre = { puntos: r.puntos, giro: (5 * 179.77) / 4.15 };
  return p;
}

describe('diseñar una torre de perfil complejo sin código (el Gherkin)', () => {
  it('tabla de alturas: títulos, coma decimal, tramos rectos y proporción a la base', () => {
    const r = perfilDesdeTabla(TABLA, 0, 179.77);
    expect(r.filas).toBe(12);
    expect(r.fuera).toBe(0);
    expect(r.puntos[0]).toEqual({ h: 0, fx: 1 });
    // a 74,7 m (h = 0,4155) el diámetro es 56,4: 1,153 veces el de la base
    const pf = { puntos: r.puntos };
    expect(valorPerfil(pf, 74.7 / 179.77).fx).toBeCloseTo(56.4 / 48.9, 3);
    // una tabla con una sola fila útil no alcanza
    expect(perfilDesdeTabla('cota;ancho\n0;10', 0, 10).error).toBeTruthy();
    // tres columnas: ancho en x y en y; cinco: corrimiento
    const r3 = perfilDesdeTabla('0 20 10 0 0\n10 10 10 2 -1', 0, 10);
    expect(r3.puntos[1]).toMatchObject({ h: 1, fx: 0.5, fy: 1, dx: 2, dy: -1 });
  });

  it('con la tabla, cada losa tiene el diámetro del corte; los pozos giran 5° por piso', () => {
    const p = torreDeUsuario();
    aplicarPerfil(p);
    for (const k of [1, 10, 18, 30, 39]) {
      const n = p.niveles.find(x => Math.abs(x.cota - k * 4.15) < 1e-6)!;
      // el diámetro exterior de la losa (la caja de los arcos entre pozos) dentro de 1 %
      expect(Math.abs(diametro(n.silueta as Vertice[]) / tablaD(n.cota) - 1)).toBeLessThan(0.02);
    }
    // el giro: el primer pozo del piso 6 está 30° más allá que en PB
    const pozo = (n: Nivel) => { const v = n.silueta as Vertice[]; return Math.atan2(v[1].y, v[1].x) * (180 / Math.PI); };
    const p6 = p.niveles.find(x => Math.abs(x.cota - 6 * 4.15) < 1e-6)!, p0 = p.niveles.find(x => x.cota === 0)!;
    expect(pozo(p6) - pozo(p0)).toBeCloseTo(30, 0);
  });

  it('formas por tramos: el círculo entero desde el 31 y el piso 16 entero (excepción de un solo piso)', () => {
    const p = torreDeUsuario();
    aplicarPerfil(p);
    const nv = (k: number) => p.niveles.find(x => Math.abs(x.cota - k * 4.15) < 1e-6)!;
    // como en la app: «Usar esta losa desde este piso» en el 31 (dibujada como un círculo) y «Solo en este piso» en el 16
    nv(31).silueta = circulo(diametro(nv(31).silueta as Vertice[]));
    const sil17 = (nv(17).silueta as Vertice[]).map(q => ({ ...q }));
    nv(16).silueta = circulo(diametro(nv(16).silueta as Vertice[]));
    p.perfilTorre = { ...p.perfilTorre!, formas: [{ desde: nv(16).cota, silueta: nv(16).silueta as Vertice[] }, { desde: nv(17).cota, silueta: sil17 }, { desde: nv(31).cota, silueta: nv(31).silueta as Vertice[] }] };
    aplicarPerfil(p);
    const lados = (k: number) => (nv(k).silueta as Vertice[]).length;
    expect(lados(15)).toBe(18);            // con pozos
    expect(lados(16)).toBe(4);             // el círculo entero (4 arcos)
    expect(lados(17)).toBe(18);            // otra vez con pozos
    expect(lados(30)).toBe(18);
    expect(lados(31)).toBe(4);
    expect(lados(39)).toBe(4);
    // el círculo de arriba sigue el perfil: en el 39 tiene el diámetro del corte
    expect(Math.abs(diametro(nv(39).silueta as Vertice[]) / tablaD(nv(39).cota) - 1)).toBeLessThan(0.02);
    // y el piso 16 entero tiene más área que el 15 con pozos
    expect(areaSilueta(nv(16).silueta as Vertice[])).toBeGreaterThan(areaSilueta(nv(15).silueta as Vertice[]));
  });

  it('nivel sin losa: no cuenta losas (CIRSOC, la Guía y lo que baja por los muros)', () => {
    expect(losasDeNivel({ pisos: 3 })).toBe(3);
    expect(losasDeNivel({ pisos: 3, sinLosa: true })).toBe(0);
    expect(losasDeNivel({})).toBe(1);
    // el ejemplo ya tiene la cúpula sin losas: se compara con la misma torre con losas en la cúpula
    const q = ejemploGherkin(), p = ejemploGherkin(), w = viento102(p);
    p.niveles.forEach(n => { delete n.sinLosa; });
    const G = vuelco102(p, w).G;
    const Gs = vuelco102(q, w).G;
    // los cuatro niveles de la cúpula ya no suman peso de losa
    const sinDome = q.niveles.filter(n => n.cota > 166);
    expect(sinDome.length).toBe(4);
    expect(Gs).toBeLessThan(G);
    // el núcleo llega al 38: las losas que baja no cambian (la cúpula está arriba), pero en una torre con un nivel sin losa sí
    const alt = datosAlturaDe(q);
    expect(alt.pisosSobrePB?.filter(x => x === 0).length).toBe(4);
    const m = { ...q.muros[0], zHasta: null };
    expect(alturaYLosas(m, alt).losas).toBe(alturaYLosas(m, datosAlturaDe(p)).losas - 4);
  });

  it('la torre armada así se parece a la del ejemplo (área de las losas piso por piso)', () => {
    const p = torreDeUsuario();
    aplicarPerfil(p);
    const ej = ejemploGherkin();
    let peor = 0;
    for (let k = 2; k <= 30; k++) {
      if (k === 16) continue;
      const z = k * 4.15, a = p.niveles.find(x => Math.abs(x.cota - z) < 1e-6)!, b = ej.niveles.find(x => Math.abs(x.cota - z) < 1e-6)!;
      const Aa = areaSilueta(puntosSilueta(a.silueta as Vertice[], 16)), Ab = areaSilueta(puntosSilueta(b.silueta as Vertice[], 16));
      peor = Math.max(peor, Math.abs(Aa / Ab - 1));
    }
    // la tabla tiene 12 filas (el ejemplo, 49): las áreas difieren poco
    expect(peor).toBeLessThan(0.04);
  });
});

describe('tabla de alturas: avisos y camino inverso', () => {
  it('avisa las filas salteadas, las cotas repetidas y las que quedan fuera de la torre', async () => {
    const r = perfilDesdeTabla('cota\tancho\n0\t20\n5\tveinte\n5\t18\n5\t16\n10\t10\n30\t5', 0, 10);
    expect(r.error).toBeUndefined();
    expect(r.avisos.some(a => a.startsWith('Fila 3'))).toBe(true);           // «veinte»
    expect(r.avisos.some(a => a.includes('dos veces'))).toBe(true);          // la cota 5
    expect(r.avisos.some(a => a.includes('fuera de la torre'))).toBe(true);  // la de 30 m
    expect(valorPerfil({ puntos: r.puntos }, 0.5).fx).toBeCloseTo(16 / 20, 6);   // queda la última fila de la cota 5
    expect(r.avisos.some(a => a.startsWith('Fila 1'))).toBe(false);          // el título no se avisa
  });
  it('del perfil a la tabla y de vuelta da el mismo perfil en cada losa', async () => {
    const { tablaDesdePerfil, aplicarPerfil: ap } = await import('./perfil_torre');
    const p = torreDeUsuario(); ap(p);
    const tabla = tablaDesdePerfil(p, p.perfilTorre!);
    expect(tabla.split('\n')[0]).toContain('cota');
    const r = perfilDesdeTabla(tabla, 0, p.niveles[0].cota);
    expect(r.error).toBeUndefined();
    const zt = p.niveles[0].cota;
    p.niveles.filter(n => n.cota >= 0).forEach(n => {
      const h = n.cota / zt, a = valorPerfil(p.perfilTorre!, h), b = valorPerfil({ puntos: r.puntos }, h);
      expect(b.fx).toBeCloseTo(a.fx, 3); expect(b.fy).toBeCloseTo(a.fy, 3);
    });
  });
});
