import { describe, expect, it } from 'vitest';
import { ejemploGuia } from '../src/engine/modelo';
import { aplicarPerfil, formaPerfil, medidasNiveles, muestrear, perfilDesdeNiveles, xEnZ, esPerfilVariable } from '../src/engine/perfilTorre';
import { protocoloPerfil } from '../src/engine/perfilVariable';

describe('perfil de la torre', () => {
  it('las curvas pasan por sus puntos (polilínea, Bézier y spline) y la spline se corre con el sesgo', () => {
    const ps = [{ z: 0, x: -10 }, { z: 30, x: -14 }, { z: 60, x: -8 }];
    for (const modo of ['polilinea', 'bezier', 'spline'] as const) {
      const d = muestrear(ps, modo, 0, 0);
      for (const q of ps) expect(xEnZ(d, q.z)).toBeCloseTo(q.x, 6);
    }
    const s0 = xEnZ(muestrear(ps, 'spline', 0, 0), 15), s1 = xEnZ(muestrear(ps, 'spline', 0, 0.9), 15);
    expect(Math.abs(s1 - s0)).toBeGreaterThan(0.05);
  });
  it('leer los niveles y volver a escribirlos no cambia nada', () => {
    const p = ejemploGuia(), r = aplicarPerfil(p, perfilDesdeNiveles(p));
    const a = medidasNiveles(p), b = medidasNiveles({ ...p, niveles: r.niveles });
    a.forEach((m, k) => { expect(b[k].B).toBeCloseTo(m.B, 3); expect(b[k].L).toBeCloseTo(m.L, 3); expect(b[k].dx).toBeCloseTo(0, 6); });
    expect(esPerfilVariable(p)).toBe(false);
  });
  it('ahusada: B baja de abajo hacia arriba; inclinada: la cima corrida un cuarto de L en y, B y L iguales', () => {
    const p = ejemploGuia(), ms = medidasNiveles(p), H = Math.max(...ms.map(m => m.z)), B = ms.find(m => m.z === 0)!.B, L = ms.find(m => m.z === 0)!.L;
    const ah = aplicarPerfil(p, formaPerfil('ahusada', B, L, H)), top = ah.niveles[0];
    expect(top.B!).toBeLessThan(B); expect(top.B!).toBeCloseTo(0.6 * B, 1);
    const inc = aplicarPerfil(p, formaPerfil('inclinada', B, L, H)), t2 = inc.niveles[0];
    expect(t2.B).toBeCloseTo(B, 3); expect(t2.L).toBeCloseTo(L, 3); expect(t2.dy!).toBeCloseTo(L / 4, 1); expect(t2.dx ?? 0).toBeCloseTo(0, 6);
    expect(esPerfilVariable({ ...p, niveles: inc.niveles })).toBe(true);
  });
  it('avisa los muros que quedan afuera de una planta que se achica', () => {
    const p = ejemploGuia(), ms = medidasNiveles(p), H = Math.max(...ms.map(m => m.z)), B = ms.find(m => m.z === 0)!.B, L = ms.find(m => m.z === 0)!.L;
    const r = aplicarPerfil(p, formaPerfil('ahusada', B, L, H));
    expect(r.afuera.length).toBeGreaterThan(0); expect(r.avisos.join(' ')).toContain('afuera');
  });
});

describe('protocolo de perfil variable', () => {
  const niveles = (p: ReturnType<typeof ejemploGuia>) => medidasNiveles(p).filter(m => m.z > 0);
  it('prisma: sin peso corrido, sin torsor extra, Wh = W; P-Δ con la deformada', () => {
    const p = ejemploGuia(), ns = niveles(p);
    const alt = ns.map(m => ({ z: m.z, F: 5 })), defl = ns.map(m => ({ z: m.z, d: 0.0001 * m.z }));
    const r = protocoloPerfil(p, 'A', alt, defl);
    expect(r.MG).toBeCloseTo(0, 9); expect(r.MtExtra).toBeCloseTo(0, 9); expect(r.Wh).toBeCloseTo(r.W, 9);
    expect(r.Mv).toBeCloseTo(ns.reduce((s, m) => s + 5 * m.z, 0), 6);
    expect(r.MPD1).toBeCloseTo(ns.reduce((s, m) => s + 0.7 * m.B * m.L * (m.n.pisos || 1) * 0.0001 * m.z, 0), 6);
    expect(r.amp).toBeCloseTo(1 / (1 - r.theta), 9);
  });
  it('inclinada hacia donde va el viento A: el peso corrido suma momento; la fachada inclinada reduce Wh', () => {
    const p = ejemploGuia(), ms = medidasNiveles(p), H = Math.max(...ms.map(m => m.z)), B = ms.find(m => m.z === 0)!.B, L = ms.find(m => m.z === 0)!.L;
    const q = { ...p, niveles: aplicarPerfil(p, formaPerfil('inclinada', B, L, H)).niveles }, ns = niveles(q);
    const r = protocoloPerfil(q, 'A', ns.map(m => ({ z: m.z, F: 5 })), ns.map(m => ({ z: m.z, d: 0 })));
    // M_G = Σ P · dy, con dy = (L/4) · z / H
    expect(r.MG).toBeCloseTo(ns.reduce((s, m) => s + 0.7 * m.B * m.L * (m.n.pisos || 1) * m.dy, 0), 6);
    expect(r.MG).toBeGreaterThan(0);
    const beta = Math.atan(L / 4 / H);
    expect(r.niveles[3].beta).toBeCloseTo(beta, 6); expect(r.Wh).toBeCloseTo(r.W * Math.cos(beta), 6);
    // con el viento B no se corre en su sentido (x): sin peso corrido; pero el viento B pasa corrido a lo ancho → torsor
    const rb = protocoloPerfil(q, 'B', ns.map(m => ({ z: m.z, F: 5 })), ns.map(m => ({ z: m.z, d: 0 })));
    expect(rb.MG).toBeCloseTo(0, 9); expect(rb.MtExtra).toBeGreaterThan(0);
  });
});
