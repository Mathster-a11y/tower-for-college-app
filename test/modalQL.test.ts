/**
 * El análisis modal con Householder + QL tiene que dar lo mismo que el Jacobi original (verificado contra OpenSees):
 * frecuencias, participaciones y formas (a menos del signo, que es arbitrario en un autovector).
 */
import { describe, expect, it } from 'vitest';
import { ejemploGuia } from '../src/engine/modelo';
import { torresPrueba } from '../src/engine/torresPrueba';
import { modeloDeProyecto, masasDeProyecto } from '../src/engine/metodos/fem';
import { autosistemaJacobi, autosistemaQL, modal } from '../src/engine/fem/pseudo3d';

describe('modal: Householder + QL igual que Jacobi', () => {
  const proyectos = [ejemploGuia(), ...torresPrueba()];
  it.each(proyectos.map((p, i) => [p.nombre || `torre ${i}`, i]))('%s', (_n, i) => {
    const p = proyectos[i as number];
    for (const teoria of ['timoshenko', 'euler'] as const) {
      const mo = modeloDeProyecto(p, teoria);
      const { masas, inercias } = masasDeProyecto(p, mo);
      const a = modal(mo, masas, inercias, 'jacobi'), b = modal(mo, masas, inercias, 'ql');
      expect(b.length).toBe(a.length);
      a.forEach((x, k) => {
        const y = b[k];
        expect(y.f).toBeCloseTo(x.f, 8);
        expect(Math.abs(y.f - x.f)).toBeLessThanOrEqual(1e-7 * Math.max(1, x.f));
        // los modos de frecuencias casi iguales pueden mezclarse: las formas se comparan solo si el modo está aislado
        const aislado = [a[k - 1], a[k + 1]].every(z => !z || Math.abs(z.f - x.f) > 1e-4 * Math.max(1e-9, x.f));
        if (!aislado || x.f < 1e-6) return;
        expect(y.dominante).toBe(x.dominante);
        expect(y.participacion.x).toBeCloseTo(x.participacion.x, 6);
        expect(y.participacion.y).toBeCloseTo(x.participacion.y, 6);
        const sg = Math.sign(x.forma.reduce((s, v, j) => s + v * y.forma[j], 0)) || 1;
        const escala = Math.max(...x.forma.map(Math.abs));
        x.forma.forEach((v, j) => expect(Math.abs(sg * y.forma[j] - v)).toBeLessThan(1e-6 * escala));
      });
    }
  });

  it('una matriz chica conocida', () => {
    const A = [[2, -1, 0], [-1, 2, -1], [0, -1, 2]];
    const { valores, V } = autosistemaQL(A);
    const ord = [...valores].sort((x, y) => x - y);
    [2 - Math.SQRT2, 2, 2 + Math.SQRT2].forEach((v, k) => expect(ord[k]).toBeCloseTo(v, 12));
    // A·v = λ·v para cada columna
    valores.forEach((l, j) => A.forEach((f, i) => expect(f.reduce((s, a, k) => s + a * V[k][j], 0)).toBeCloseTo(l * V[i][j], 12)));
    expect(autosistemaJacobi(A).valores.sort((x, y) => x - y)[0]).toBeCloseTo(2 - Math.SQRT2, 12);
  });
});
