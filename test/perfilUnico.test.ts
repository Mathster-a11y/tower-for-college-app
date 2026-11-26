import { describe, expect, it } from 'vitest';
import { ejemploGuia } from '../src/engine/modelo';
import { aplicarPerfil as aplicarAlzados, formaPerfil, medidasNiveles, perfilDesdeVistas } from '../src/engine/perfilTorre';
import { aplicarPerfil, PERFILES } from '../src/engine/perfil_torre';
import { cajaSilueta, plantaDeNivel } from '../src/engine/silueta';

/** las dos herramientas de perfil (la carta de la planta y el editor de alzados de Diseño → Perfil) son una sola */
describe('perfil de la torre: una sola fuente de verdad', () => {
  it('inclinada: corre el nivel entero (dx), no la losa adentro del nivel', () => {
    const p = ejemploGuia();
    const inc = PERFILES.find(x => x.id === 'inclinada')!;
    p.perfilTorre = structuredClone(inc.p);
    aplicarPerfil(p);
    const top = p.niveles[0];
    expect(top.dx).toBeCloseTo(4, 6);
    // la losa queda en sus coordenadas (centrada como la de PB)
    const iPB = p.niveles.findIndex(n => n.nombre === 'PB'), cPB = cajaSilueta(plantaDeNivel(p, iPB).silueta), cTop = cajaSilueta(plantaDeNivel(p, 0).silueta);
    expect(cTop.cx).toBeCloseTo(cPB.cx, 6); expect(cTop.cy).toBeCloseTo(cPB.cy, 6);
  });
  it('«solo la planilla»: escribe B, L y el corrimiento y deja las losas como están', () => {
    const p = ejemploGuia();
    const antes = JSON.stringify(p.niveles.map(n => n.silueta ?? null));
    p.perfilTorre = { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 0.6, dx: 2 }], aplica: 'medidas' };
    aplicarPerfil(p);
    expect(JSON.stringify(p.niveles.map(n => n.silueta ?? null))).toBe(antes);
    const ms = medidasNiveles(p), base = ms.find(m => m.n.nombre === 'PB')!, top = ms[0];
    expect(top.B).toBeCloseTo(base.B * 0.6, 2); expect(top.L).toBeCloseTo(base.L * 0.6, 2); expect(top.dx).toBeCloseTo(2, 6);
  });
  it('el editor de alzados escribe el perfil único y da las mismas medidas que antes (B, L, dx y dy de cada nivel)', () => {
    for (const forma of ['ahusada', 'inclinada', 'escalonada'] as const) {
      const p = ejemploGuia(), ms = medidasNiveles(p), b = ms.find(m => m.z === 0)!, H = Math.max(...ms.map(m => m.z));
      const pf = formaPerfil(forma, b.B, b.L, H);
      const antes = aplicarAlzados(p, pf, false).niveles;            // lo que escribía el editor directamente
      p.perfilTorre = perfilDesdeVistas(p, pf, false);
      aplicarPerfil(p);
      p.niveles.forEach((n, k) => {
        if (n.cota < 0) return;
        expect(n.B ?? 0, `${forma} · ${n.nombre} · B`).toBeCloseTo(antes[k].B ?? 0, 1);
        expect(n.L ?? 0, `${forma} · ${n.nombre} · L`).toBeCloseTo(antes[k].L ?? 0, 1);
        expect(n.dx ?? 0, `${forma} · ${n.nombre} · dx`).toBeCloseTo(antes[k].dx ?? 0, 2);
        expect(n.dy ?? 0, `${forma} · ${n.nombre} · dy`).toBeCloseTo(antes[k].dy ?? 0, 2);
      });
    }
  });
  it('con «las plantas siguen al perfil», las losas se escalan con el perfil del editor', () => {
    const p = ejemploGuia(), ms = medidasNiveles(p), b = ms.find(m => m.z === 0)!, H = Math.max(...ms.map(m => m.z));
    p.perfilTorre = perfilDesdeVistas(p, formaPerfil('ahusada', b.B, b.L, H), true);
    expect(p.perfilTorre.aplica).toBe('losas');
    aplicarPerfil(p);
    const iPB = p.niveles.findIndex(n => n.nombre === 'PB');
    const cPB = cajaSilueta(plantaDeNivel(p, iPB).silueta), cTop = cajaSilueta(plantaDeNivel(p, 0).silueta);
    expect(cTop.B / cPB.B).toBeLessThan(0.7);
  });
});
