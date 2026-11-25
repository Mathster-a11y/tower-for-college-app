import { describe, expect, it } from 'vitest';
import { ejemploGuia } from '../src/engine/modelo';
import { aplicarPerfil, formaPerfil, medidasNiveles } from '../src/engine/perfilTorre';
import { calcularProyecto } from '../src/ui/estado';
import { ejemploCiticorpFachada } from '../src/engine/ejemploCiticorpFachada';

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
  it('con el exo en el cálculo (CIRSOC), el P-Δ usa el corrimiento de la torre con el exo; con Planilla, el de los tabiques', () => {
    const p = ejemploCiticorpFachada();
    expect(p.calculo?.metodo).toBe('cirsoc');
    const cs = calcularProyecto(p).controles;
    for (const dir of ['A', 'B']) {
      const pd = cs.find(c => c.nombre === `Efecto P-Δ, viento ${dir}`)!;
      expect(pd.estado).toBe('verifica');
      expect(pd.guia!).toBeLessThan(0.1);
      expect(pd.nota).toMatch(/exoesqueleto/);
    }
    // con Planilla el exo es un estudio aparte: los tabiques solos son demasiado flexibles (como su ΣJ y su flecha)
    const q = { ...p, calculo: { ...p.calculo, metodo: 'planilla' as const } };
    const pdP = calcularProyecto(q).controles.find(c => c.nombre === 'Efecto P-Δ, viento A')!;
    expect(pdP.guia!).toBeGreaterThan(0.25);
  });
});
