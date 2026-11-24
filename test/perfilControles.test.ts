import { describe, expect, it } from 'vitest';
import { ejemploGuia } from '../src/engine/modelo';
import { aplicarPerfil, formaPerfil, medidasNiveles } from '../src/engine/perfilTorre';
import { calcularProyecto } from '../src/ui/estado';

describe('controles de la torre inclinada', () => {
  it('el prisma no tiene controles de perfil; la inclinada suma P-Δ y el vuelco con el peso corrido', () => {
    const p = ejemploGuia();
    expect(calcularProyecto(p).controles.some(c => c.nombre.startsWith('Efecto P-Δ'))).toBe(false);
    const ms = medidasNiveles(p), H = Math.max(...ms.map(m => m.z)), b = ms.find(m => m.z === 0)!;
    const q = { ...p, niveles: aplicarPerfil(p, formaPerfil('inclinada', b.B, b.L, H)).niveles };
    const cs = calcularProyecto(q).controles;
    const pd = cs.find(c => c.nombre === 'Efecto P-Δ, viento A')!, vu = cs.find(c => c.nombre === 'Vuelco con el perfil (peso corrido y P-Δ)')!;
    expect(pd.guia!).toBeGreaterThan(0); expect(pd.guia!).toBeLessThan(0.25);
    // inclinada hacia donde va el viento A: el peso corrido suma vuelco, así que el factor baja respecto del de la planilla
    const base = cs.find(c => c.nombre === 'Vuelco Me / Mv')!;
    expect(vu.guia!).toBeLessThan(base.guia!);
    expect(vu.nota).toMatch(/M_G = /);
  });
});
