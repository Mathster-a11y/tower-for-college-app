/** Proyectos al azar (y casos borde): el cálculo nunca debe tirar una excepción. */
import { describe, it, expect } from 'vitest';
import { aPlanilla } from '../src/engine/mapping';
import { calcularPlanilla } from '../src/engine/planilla';
import { calcularCorregido } from '../src/engine/correcciones';
import { controles } from '../src/engine/verificaciones';
import { ejemploGuia, proyectoVacio, type Muro, type Proyecto } from '../src/engine/modelo';
import { celdasAEscribir } from '../src/xlsx/planilla';

function correr(p: Proyecto) {
  const a = aPlanilla(p);
  const r = calcularPlanilla(a.datos);
  const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
  const c = calcularCorregido(a.datos, a.filaNivel[iPB] ?? 50);
  controles(p, a.datos, r, c, p.hormigon);
  celdasAEscribir(a.datos, r);
  return { a, r };
}

let semilla = 12345;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const elegir = <T>(xs: T[]) => xs[Math.floor(azar() * xs.length)];

function proyectoAzar(): Proyecto {
  const p = ejemploGuia();
  const pisos = 1 + Math.floor(azar() * 50);
  const subs = Math.floor(azar() * 4);
  p.niveles = [{ nombre: 'Azotea', cota: 4 + 3 * (pisos - 1), B: 10 + azar() * 30, L: 8 + azar() * 30 }];
  for (let k = pisos - 1; k >= 1; k--) p.niveles.push({ nombre: `${k}º`, cota: 4 + 3 * (k - 1) });
  p.niveles.push({ nombre: 'PB', cota: 0 });
  for (let k = 1; k <= subs; k++) p.niveles.push({ nombre: `${k}º SS`, cota: -3 * k });
  const n = Math.floor(azar() * 25);
  const muros: Muro[] = [];
  for (let i = 0; i < n; i++) {
    const dir = elegir(['X', 'Y'] as const);
    const almas = muros.filter(m => m.dir !== dir);
    muros.push({
      id: `M${i}`, dir, x: (azar() - 0.5) * 20, y: (azar() - 0.5) * 16, largo: 0.5 + azar() * 8, espesor: 0.15 + azar() * 0.3,
      llega: azar() > 0.1, areaInf: azar() * 40,
      piezaA: elegir(['', `T${i % 8}`, `T${i % 3}`]), pegadoA: dir === 'X' && almas.length && azar() > 0.5 ? elegir(almas).id : '',
      piezaB: elegir(['', `T${i % 8}B`, `T${i % 3}B`]), pegadoB: dir === 'Y' && almas.length && azar() > 0.5 ? elegir(almas).id : '',
      circular: azar() > 0.9 ? { D: 0.5 + azar(), d: elegir([0, 0.2]) } : null,
    });
  }
  p.muros = muros;
  return p;
}

describe('robustez', () => {
  it('proyecto nuevo (sin muros) y casos borde', () => {
    expect(() => correr(proyectoVacio())).not.toThrow();
    const p = proyectoVacio(); p.niveles = []; expect(() => correr(p)).not.toThrow();
    const q = ejemploGuia(); q.muros.forEach(m => (m.llega = false)); expect(() => correr(q)).not.toThrow();
    const t = ejemploGuia();
    t.muros = Array.from({ length: 30 }, (_, i) => ({ ...t.muros[0], id: `M${i}`, x: i - 15, piezaA: `P${i}`, piezaB: `P${i}B` }));
    expect(() => correr(t)).not.toThrow();
    expect(correr(t).a.avisos.join(' ')).toMatch(/pieza|fila|20/i);
    const s = ejemploGuia(); s.muros = s.muros.map(m => ({ ...m, piezaA: 'T1', piezaB: 'T1B', pegadoA: '', pegadoB: '' })); expect(() => correr(s)).not.toThrow();
  });
  it('300 proyectos al azar', () => {
    for (let k = 0; k < 300; k++) {
      const p = proyectoAzar();
      try { correr(p); } catch (e) { throw new Error(`proyecto ${k}: ${String(e)}\n${JSON.stringify(p)}`); }
    }
  });
});
