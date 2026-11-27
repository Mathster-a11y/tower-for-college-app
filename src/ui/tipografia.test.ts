import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FAMILIA_MATH, FAMILIA_MONO, FAMILIA_UI, letraLienzo } from './tipografia';

/** todos los .ts de la interfaz, sin las pruebas */
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? archivos(p) : /\.ts$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : []; });
}

describe('tipografía (guía: tres familias, nombradas en un solo lugar)', () => {
  it('las tres familias que distinguen I, l y 1', () => {
    expect(FAMILIA_UI.startsWith('"IBM Plex Sans"')).toBe(true);
    expect(FAMILIA_MONO.startsWith('"JetBrains Mono"')).toBe(true);
    expect(FAMILIA_MATH.startsWith('"IBM Plex Math"')).toBe(true);
    expect(FAMILIA_UI).toContain('"IBM Plex Math"'); // lo que Plex Sans no tiene sale de Plex Math
    expect(letraLienzo(11, 600)).toBe(`600 11px ${FAMILIA_UI}`);
    expect(letraLienzo(12)).toBe(`12px ${FAMILIA_UI}`);
  });
  it('ningún texto de la interfaz usa una letra del sistema (system-ui, Arial, Calibri: I y l iguales)', () => {
    const malos = archivos('src/ui').filter(f => !f.endsWith('tipografia.ts'))
      .flatMap(f => readFileSync(f, 'utf8').split('\n').map((l, i) => [f, i + 1, l] as const))
      .filter(([, , l]) => /system-ui|'Arial'|"Arial"|Calibri|Helvetica|Segoe UI/.test(l) && !/^\s*(\/\/|\*)/.test(l));
    expect(malos.map(([f, n]) => `${f}:${n}`)).toEqual([]);
  });
});
