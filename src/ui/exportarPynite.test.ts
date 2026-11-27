import { describe, expect, it } from 'vitest';
import { programaPynite } from './exportarPynite';
import { ejemploGuia } from '../engine/modelo';

describe('contraste con Pynite (archivo .py)', () => {
  it('lleva el modelo de Pynite de las pruebas y los datos de los dos vientos', () => {
    const r = programaPynite(ejemploGuia());
    expect(r.vientos).toBe(2);
    expect(r.texto).toContain('def resolver(d):');
    expect(r.texto).not.toContain("if __name__ == '__main__'");
    expect(r.nombre).toMatch(/^[\w-]+_contraste_pynite\.py$/);
    // los datos, en base64: se leen de vuelta con los dos vientos
    const b64 = r.texto.split("base64.b64decode('''")[1].split("''')")[0].replace(/\s/g, '');
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))));
    expect(d.vientos.map((v: { entrada: { dir: string } }) => v.entrada.dir)).toEqual(['A', 'B']);
    expect(d.vientos[0].app.map((x: { motor: string }) => x.motor)).toEqual(['App · Euler', 'App · Timoshenko']);
  });
  it('un nombre de proyecto con comillas o código no entra como código del programa', () => {
    const p = ejemploGuia(); p.nombre = "x'''\nimport os; os.system('rm -rf /')\n'''";
    const r = programaPynite(p);
    expect(r.texto).not.toContain('os.system');
    expect(r.nombre).not.toMatch(/['\n/]/);
  });
});
