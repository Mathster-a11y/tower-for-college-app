import { describe, expect, it } from 'vitest';
import { leerProyecto } from '../src/engine/lector';
import { ejemploAsimetrico, ejemploCiticorp, ejemploGuia, normalizarProyecto, proyectoVacio, type Proyecto } from '../src/engine/modelo';
import { ejemploPlanta34 } from '../src/engine/ejemplo34';
import { ejemploBasicoExo, ejemploHancock, ejemploHearst, ejemploOnterie } from '../src/engine/ejemplosExo';
import { torresPrueba } from '../src/engine/torresPrueba';

const ejemplos: Proyecto[] = [ejemploGuia(), ejemploAsimetrico(), ejemploCiticorp(), proyectoVacio(), ejemploPlanta34(),
  ejemploBasicoExo(), ejemploHancock(), ejemploHearst(), ejemploOnterie(), ...torresPrueba()];
const roto = (f: (p: Record<string, any>) => void) => { const p = JSON.parse(JSON.stringify(ejemploGuia())); f(p); return p; }; // eslint-disable-line @typescript-eslint/no-explicit-any
const errores = (x: unknown) => { const r = leerProyecto(x); return r.ok ? [] : r.errores; };

describe('lector único de proyectos', () => {
  it('acepta todos los ejemplos y torres de prueba sin cambiarlos ni avisar', () => {
    for (const p of ejemplos) {
      const r = leerProyecto(JSON.parse(JSON.stringify(p)));
      expect(r.ok, p.nombre).toBe(true);
      if (!r.ok) continue;
      expect(r.avisos, p.nombre).toEqual([]);
      expect(r.proyecto).toEqual(normalizarProyecto(JSON.parse(JSON.stringify(p))));
    }
  });
  it('acepta el texto JSON y no toca el objeto original', () => {
    const p = ejemploGuia(), copia = JSON.stringify(p);
    expect(leerProyecto(copia).ok).toBe(true);
    leerProyecto(p);
    expect(JSON.stringify(p)).toBe(copia);
  });
  it('rechaza lo que el informe encontró: niveles [null]', () => {
    expect(errores(roto(p => { p.niveles = [null]; }))).toEqual(['Nivel 1: está vacío o dañado.']);
  });
  it('rechaza estructuras rotas, con un mensaje que dice qué y dónde', () => {
    expect(errores('esto no es json')).toEqual(['El archivo no es JSON válido.']);
    expect(errores(null)[0]).toMatch(/No es un proyecto/);
    expect(errores(roto(p => { p.version = 7; }))[0]).toMatch(/más nueva/);
    expect(errores(roto(p => { delete p.sitio; }))[0]).toMatch(/viento/);
    expect(errores(roto(p => { p.sitio.V = 'mucho'; }))[0]).toMatch(/«V»/);
    expect(errores(roto(p => { p.niveles[3].cota = null; }))[0]).toMatch(/Nivel 4.*cota/);
    expect(errores(roto(p => { p.muros = 'muchos'; }))[0]).toMatch(/muros/);
    expect(errores(roto(p => { p.muros[0].largo = Number.NaN; }))[0]).toMatch(/largo/);
    expect(errores(roto(p => { p.muros[0].largo = -2; }))[0]).toMatch(/largo.*mayor que 0/);
    expect(errores(roto(p => { p.muros[0].dir = 'Z'; }))[0]).toMatch(/dirección/);
    expect(errores(roto(p => { p.muros[1].id = p.muros[0].id; }))[0]).toMatch(/dos muros/);
    expect(errores(roto(p => { p.muros[0].espesores = [{ desde: 10, e: 0 }]; }))[0]).toMatch(/tramos de espesor/);
    expect(errores(roto(p => { p.fundacion = {}; }))[0]).toMatch(/fundación/);
  });
  it('repara sin cambiar el cálculo y lo avisa', () => {
    const r = leerProyecto(roto(p => {
      p.niveles.reverse();
      delete p.nombre;
      p.muros[0].gd = 'grupo-que-no-existe';
      p.muros[1].vano = { con: 'muro-que-no-existe', ancho: 1, tipo: 'dintel' };
      delete p.muros[2].piezaB;
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proyecto.niveles.map(n => n.cota)).toEqual(ejemploGuia().niveles.map(n => n.cota));
    expect(r.proyecto.nombre).toBe('');
    expect(r.proyecto.muros[0].gd).toBeUndefined();
    expect(r.proyecto.muros[1].vano).toBeUndefined();
    expect(r.proyecto.muros[2].piezaB).toBe('');
    expect(r.avisos.join(' ')).toMatch(/ordenaron/);
    expect(r.avisos.join(' ')).toMatch(/2 referencias/);
    // lo que la app produce mientras se edita se acepta con aviso (insertar una fila de Niveles repite la cota; se pueden borrar todos)
    const d = leerProyecto(roto(p => { p.niveles[1].cota = p.niveles[2].cota; }));
    expect(d.ok && d.avisos[0]).toMatch(/dos niveles con la cota/);
    const v = leerProyecto(roto(p => { p.niveles = []; }));
    expect(v.ok && v.avisos[0]).toMatch(/no tiene niveles/);
    const z = leerProyecto(roto(p => { p.muros[0].zDesde = 30; p.muros[0].zHasta = 10; }));
    expect(z.ok && z.avisos[0]).toMatch(/termina.*ningún piso/);
  });
});
