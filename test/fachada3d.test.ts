import { describe, expect, it } from 'vitest';
import { geometria3D, celdasDeCara, PromedioCp } from '../src/viento/geometria3d';
import { desplegar, zonasFachada, gcpComponentes, anchoZonaEsquina, valorCelda, bandas } from '../src/viento/fachada3d';

const cuadrado = (b: number, l: number) => [{ x: -b / 2, y: -l / 2 }, { x: b / 2, y: -l / 2 }, { x: b / 2, y: l / 2 }, { x: -b / 2, y: l / 2 }];
const g = geometria3D({ niveles: [0, 15, 30].map(c => ({ cota: c, silueta: cuadrado(20, 12) })), dir: 'A', nx: 96, ny: 48, nz: 40 });
const caras = celdasDeCara(g), uH = 0.08;
const N = g.nx * g.ny * g.nz;
const ref = (g.caja.y0 >= 0) ? 0 : 0;
void ref;

describe('fachada del túnel 3D', () => {
  it('estadística por celda: media, desvío, mínimo y máximo', () => {
    const p = new PromedioCp(caras, uH, -1);
    const k0 = 3 * 0.5 * uH * uH;
    [0.5, 1.5, 1.0, 1.0].forEach(cp => { const rho = new Float32Array(N).fill(1); caras.forEach(c => { rho[c.celda] = 1 + cp * k0; }); p.sumar(rho); });
    expect(p.cp(0)).toBeCloseTo(1, 4); expect(p.cpMin(0)).toBeCloseTo(0.5, 4); expect(p.cpMax(0)).toBeCloseTo(1.5, 4);
    expect(p.rms(0)).toBeCloseTo(Math.sqrt((0.25 + 0.25) / 4), 4);
    expect(valorCelda(p, 0, 'picoMas')).toBeCloseTo(1 + 3.5 * p.rms(0), 4);
  });
  it('desplegada: cuatro paneles con el ancho de cada cara y las esquinas marcadas', () => {
    const d = desplegar(caras, g);
    expect(d.paneles.map(x => x.nombre)).toEqual(['Barlovento', 'Costado', 'Sotavento', 'Otro costado']);
    // el viento A va en +y del proyecto: barlovento y sotavento son las caras de 20 m (B); los costados, de 12 m
    const anchoM = (i: number) => d.paneles[i].ancho / g.escala;
    expect(Math.abs(anchoM(0) - anchoM(2))).toBeLessThan(2 / g.escala + 1e-9);
    expect(d.alto).toBeGreaterThan(0);
    const a = anchoZonaEsquina(12);
    expect(d.paneles[0].celdas.some(q => q.dEsquina < a)).toBe(true);
    expect(d.paneles[0].celdas.some(q => q.dEsquina >= a)).toBe(true);
  });
  it('zonas: GCp del CIRSOC por área, la succión de la esquina es la más fuerte', () => {
    expect(gcpComponentes(5, 1).menos).toBeCloseTo(-1.8, 6); expect(gcpComponentes(5, 100).menos).toBeCloseTo(-1.0, 6);
    expect(gcpComponentes(4, 1).mas).toBeCloseTo(0.9, 6);
    const p = new PromedioCp(caras, uH, -1), d = desplegar(caras, g), a = anchoZonaEsquina(12), k0 = 3 * 0.5 * uH * uH;
    const rho = new Float32Array(N).fill(1);
    const esquina = new Set(d.paneles.flatMap(x => x.celdas.filter(q => q.dEsquina < a).map(q => q.k)));
    caras.forEach((c, k) => { rho[c.celda] = 1 + (esquina.has(k) ? -1.5 : -0.5) * k0; });
    p.sumar(rho);
    const z = zonasFachada(p, d, a, 1500, 4);
    expect(z[1].cpMenos).toBeCloseTo(-1.5, 3); expect(z[0].cpMenos).toBeCloseTo(-0.5, 3);
    expect(z[1].pMenos).toBeCloseTo(1.5 * (-1.5 - 0.18), 3);
    expect(z[1].pMenosRegl).toBeLessThan(z[0].pMenosRegl);
  });
  it('bandas con valores redondos', () => {
    expect(bandas(-2.3, 1.2)).toEqual([-2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1]);
  });
});
