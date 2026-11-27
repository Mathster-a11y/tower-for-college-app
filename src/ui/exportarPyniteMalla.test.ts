import { describe, expect, it } from 'vitest';
import { programaPyniteMalla } from './exportarPyniteMalla';
import { ejemploGherkin } from '../engine/ejemplosExo';
import { calcularProyecto } from '../engine/calculoProyecto';
import { ExoDeCalculo } from '../engine/exoDeCalculo';

describe('contraste de la malla con Pynite', () => {
  it('el programa lleva la malla en base64 (ningún texto del proyecto se vuelve código) y el modelo de las pruebas', () => {
    const p = ejemploGherkin();
    p.exo = { ...p.exo!, tipo: 'M', circular: undefined, malla: { patron: 'diagrid', nudos: 8 } };
    p.calculo = { ...(p.calculo ?? {}), metodo: 'cirsoc' } as typeof p.calculo;
    const d = new ExoDeCalculo(p, calcularProyecto(p), 'cirsoc').datosPyniteMalla(p.exo)!;
    const malicioso = 'Torre"""\nimport os; os.system("rm -rf /")';
    const { nombre, texto } = programaPyniteMalla(d, malicioso);
    expect(nombre).toMatch(/^[\w-]+_malla_pynite\.py$/);
    expect(texto).not.toContain('os.system');
    const b64 = texto.split("b64decode('''")[1].split("''')")[0].replace(/\s+/g, '');
    const vuelta = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))));
    expect(vuelta.nudos.length).toBe(d.nudos.length);
    expect(texto).toContain('def resolver(d):');
    expect(texto).not.toContain("if __name__ == '__main__'");
    // la app y su propio corrimiento: crece con la altura en los dos vientos
    expect(d.app.uA.at(-1)!).toBeGreaterThan(d.app.uA[5]);
  });
});
