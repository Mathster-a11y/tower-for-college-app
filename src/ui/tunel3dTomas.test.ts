import { describe, expect, it, beforeEach } from 'vitest';
import { cargarTomas, describirToma, guardarTomas, PLANTILLAS, SIM_BASE, VISTA_BASE } from './tunel3dTomas';

describe('túnel 3D · lista de tomas', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* sin almacenamiento */ } });
  it('cada plantilla arma una toma completa y se describe en palabras', () => {
    for (const [nombre, f] of PLANTILLAS) {
      const t = f();
      expect(t.nombre.length).toBeGreaterThan(0);
      expect(Object.keys(t.vista).sort()).toEqual(Object.keys(VISTA_BASE).sort());
      expect(Object.keys(t.sim).sort()).toEqual(Object.keys(SIM_BASE).sort());
      const d = describirToma(t, { liviano: 'liviana' });
      expect(d).toHaveLength(3);
      expect(d.join(' ')).not.toMatch(/undefined|NaN/);
      void nombre;
    }
    expect(describirToma(PLANTILLAS.find(p => /Zoom/.test(p[0]))![1](), {})[2]).toMatch(/zoom a la esquina/);
    expect(describirToma(PLANTILLAS.find(p => /arcoíris/.test(p[0]))![1](), {})[1]).toMatch(/no tracción/);
  });
  it('se guardan en el navegador y una toma vieja sin campos nuevos los toma de la base', () => {
    if (typeof localStorage === 'undefined') return;
    const t = PLANTILLAS[0][1](); t.id = 'x';
    guardarTomas([t]);
    expect(cargarTomas()[0]).toEqual(t);
    const vieja = { ...t, vista: { horizontal: true } } as unknown as typeof t;
    localStorage.setItem('torre3d.tomas3d', JSON.stringify([vieja]));
    expect(cargarTomas()[0].vista.espectro).toBe('termico');
  });
});
