import { describe, expect, it } from 'vitest';
import { alinearPlantas, geometria3D, type NivelPlanta, type P } from './geometria3d';
import { mallaTorre } from './malla3d';

const circulo = (r: number, n = 48): P[] => Array.from({ length: n }, (_, k) => ({ x: r * Math.cos((2 * Math.PI * k) / n), y: r * Math.sin((2 * Math.PI * k) / n) }));
/** un tronco de cono de 60 m: radio 20 m abajo y 8 m arriba, un nivel cada 6 m */
const cono = (opc: Partial<NivelPlanta> = {}): NivelPlanta[] => Array.from({ length: 11 }, (_, k) => ({ cota: 6 * k, silueta: circulo(20 - 1.2 * k), ...opc }));
const T = { nx: 160, ny: 96, nz: 64 };
// volumen del tronco de cono (m³) y el de la torre en celdas
const vExacto = (Math.PI * 60 * (20 ** 2 + 20 * 8 + 8 ** 2)) / 3;
const vCeldas = (g: ReturnType<typeof geometria3D>) => g.celdas / g.escala ** 3;

describe('túnel 3D · paredes exactas en altura', () => {
  it('alinear dos plantas: los mismos puntos y lo que corre la piel', () => {
    const a = circulo(10), b = circulo(7).map(q => ({ x: q.x + 1, y: q.y }));
    const r = alinearPlantas(a, b, 64);
    expect(r.a.length).toBe(64);
    expect(r.b.length).toBe(64);
    // el punto k de abajo va con el k de arriba: el corrimiento es el de un radio que achica 3 m más 1 m de costado
    expect(r.corre).toBeGreaterThan(2);
    expect(r.corre).toBeLessThan(4.2);
  });

  it('un cono: con la piel interpolada el volumen de celdas se acerca al real (con escalones queda más grande)', () => {
    const esc = geometria3D({ niveles: cono(), dir: 'B', ...T });
    const sua = geometria3D({ niveles: cono(), dir: 'B', ...T, alturaExacta: true });
    const eEsc = Math.abs(vCeldas(esc) - vExacto) / vExacto, eSua = Math.abs(vCeldas(sua) - vExacto) / vExacto;
    expect(eSua).toBeLessThan(eEsc);
    expect(eSua).toBeLessThan(0.03);
    // los tramos interpolados llevan la planta de arriba (y no se cierra el piso entre medio)
    expect(sua.tramos.filter(t => t.polArriba).length).toBe(10);
    expect(esc.tramos.some(t => t.polArriba)).toBe(false);
  });

  it('en la piel inclinada, el corte de cada enlace cae sobre la superficie del cono', () => {
    const g = geometria3D({ niveles: cono(), dir: 'B', ...T, alturaExacta: true });
    const EX = [0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0];
    const EY = [0, 0, 0, 1, -1, 0, 0, 1, -1, -1, 1, 0, 0, 0, 0, 1, -1, 1, -1];
    const EZ = [0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1, -1, -1, 1, 1, -1, -1, 1];
    // el eje del cono en la red (el centro de la caja) y el radio a cada altura
    const cx = (g.caja.x0 + g.caja.x1 + 1) / 2, cy = (g.caja.y0 + g.caja.y1 + 1) / 2;
    const radio = (zRed: number) => (20 - (1.2 * ((zRed - 1) / g.escala)) / 6) * g.escala;
    let n = 0, peor = 0;
    g.paredes.celdas.forEach((c, k) => {
      const x = c % g.nx, y = Math.floor(c / g.nx) % g.ny, z = Math.floor(c / (g.nx * g.ny));
      if (z < 3 || (z - 1) / g.escala > 55) return;                     // lejos del suelo y de la azotea
      for (let i = 1; i < 19; i++) {
        if (EZ[i] === 0) continue;                                      // los que suben o bajan (la piel inclinada)
        const q = g.paredes.q[19 * k + i] / 255;
        if (!q) continue;
        // el punto del corte, desde el centro de la celda de aire hacia la sólida (c − e_i)
        const px = x + 0.5 - EX[i] * q, py = y + 0.5 - EY[i] * q, pz = z + 0.5 - EZ[i] * q;
        peor = Math.max(peor, Math.abs(Math.hypot(px - cx, py - cy) - radio(pz)));
        n++;
      }
    });
    expect(n).toBeGreaterThan(200);
    // dentro de un cuarto de celda (el contorno tiene 48 lados y la planta se toma con 128 puntos)
    expect(peor).toBeLessThan(0.25);
  });

  it('un retiro grande o un tramo «por losa» siguen con escalón', () => {
    // basamento de 40 m de radio hasta 6 m y torre de 10 m: corre 30 m en un piso de 6 m (más de 3 veces su alto)
    const retiro: NivelPlanta[] = [{ cota: 0, silueta: circulo(40) }, { cota: 6, silueta: circulo(10) }, { cota: 12, silueta: circulo(10) }, { cota: 18, silueta: circulo(10) }];
    const g = geometria3D({ niveles: retiro, dir: 'B', ...T, alturaExacta: true });
    expect(g.tramos.some(t => t.polArriba)).toBe(false);
    const losa = geometria3D({ niveles: cono({ continua: false }), dir: 'B', ...T, alturaExacta: true });
    expect(losa.tramos.some(t => t.polArriba)).toBe(false);
  });

  it('la torre dibujada: la piel sin tapas entre pisos, con tapa en la azotea', () => {
    const g = geometria3D({ niveles: cono(), dir: 'B', ...T, alturaExacta: true });
    const m = mallaTorre(g, []);
    expect(m.pos.length % 9).toBe(0);
    // la azotea: los vértices más altos están todos a 60 m
    let zMax = 0;
    for (let k = 2; k < m.pos.length; k += 3) zMax = Math.max(zMax, m.pos[k]);
    expect(zMax / g.escala).toBeCloseTo(60, 3);
    // ninguna tapa en las cotas intermedias: no hay triángulos horizontales salvo arriba
    let horizontales = 0;
    for (let k = 0; k < m.pos.length; k += 9) {
      const z1 = m.pos[k + 2], z2 = m.pos[k + 5], z3 = m.pos[k + 8];
      if (Math.abs(z1 - z2) < 1e-6 && Math.abs(z2 - z3) < 1e-6 && z1 / g.escala < 59) horizontales++;
    }
    expect(horizontales).toBe(0);
  });
});
