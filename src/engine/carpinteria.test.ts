import { describe, expect, it } from 'vitest';
import { aplicarCarpinteriaTramos, comunLosas, tramoEn } from './carpinteria';
import { ejemploGuia } from './modelo';
import { cajaSilueta, carpinteriaDeNivel, rectangulo } from './silueta';
import { avisosDiseno } from './avisos';

describe('carpintería por tramos', () => {
  it('lo común a dos losas: la de adentro si una contiene a la otra; recorte exacto con una convexa', () => {
    expect(comunLosas(rectangulo(20, 16), rectangulo(10, 8))).toEqual({ v: rectangulo(10, 8), exacto: true });
    const corrida = rectangulo(20, 16).map(q => ({ x: q.x + 5, y: q.y }));
    const c = comunLosas(rectangulo(20, 16), corrida);
    expect(c.exacto).toBe(true);
    expect(cajaSilueta(c.v)).toMatchObject({ B: 15, L: 16 });
  });
  it('por losa: cada piso entre su losa y la de arriba (retranqueo y voladizo), sin tapas; sin: no hay fachada', () => {
    const p = ejemploGuia();
    const i15 = p.niveles.findIndex(n => n.nombre === '15º'), i14 = i15 + 1, iPB = p.niveles.findIndex(n => n.nombre === 'PB');
    // del 15º para arriba la losa es de 16 × 16 (retranqueo)
    for (let i = 0; i <= i15; i++) p.niveles[i].silueta = rectangulo(16, 16);
    p.niveles[i14].silueta = rectangulo(20, 16);                     // del 14º para abajo, 20 × 16
    p.carpinteriaTramos = [{ desde: 0, modo: 'sin' }, { desde: 3, modo: 'losa', retiro: 0.2 }];
    aplicarCarpinteriaTramos(p);
    // el piso del 14º (entre la losa de 20 × 16 y la de 16 × 16 de arriba): la carpintería cabe debajo de la de arriba
    expect(cajaSilueta(p.niveles[i14].carpinteria!)).toMatchObject({ B: 15.6, L: 15.6 });
    expect(cajaSilueta(p.niveles[i14 + 1].carpinteria!).B).toBeCloseTo(19.6, 6);
    expect(carpinteriaDeNivel(p, iPB)).toBeNull();
    expect(tramoEn(p, 20)?.modo).toBe('losa');
    expect(avisosDiseno(p).filter(a => a.tipo === 'carpinteria-fuera')).toEqual([]);
  });
});
