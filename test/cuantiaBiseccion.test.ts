/**
 * La cuantía necesaria (201, verificación completa) se busca por bisección sobre los escalones de 0,05 %: tiene que dar
 * exactamente lo mismo que recorrerlos uno por uno, en todos los muros de todas las torres de prueba.
 */
import { describe, expect, it } from 'vitest';
import { ejemploGuia, type Proyecto } from '../src/engine/modelo';
import { torresPrueba } from '../src/engine/torresPrueba';
import { calcularProyecto } from '../src/ui/estado';
import { BUSQUEDA_CUANTIA } from '../src/engine/verificacion/cirsoc201';
import { torreGrande } from '../tools/rendimiento/torreGrande';

const proyectos: Proyecto[] = [ejemploGuia(), ...torresPrueba(), torreGrande()];
describe('cuantía necesaria: bisección = búsqueda lineal', () => {
  it.each(proyectos.map((p, i) => [p.nombre || `torre ${i}`, i]))('%s', (_n, i) => {
    for (const metodo of ['cirsoc', 'fem'] as const) {
      const p: Proyecto = { ...proyectos[i as number], calculo: { metodo, verificacion: 'completa' } };
      BUSQUEDA_CUANTIA.lineal = true;
      const a = calcularProyecto(p).cirsoc!.verif;
      BUSQUEDA_CUANTIA.lineal = false;
      const b = calcularProyecto(p).cirsoc!.verif;
      const resumen = (v: typeof a) => v.flatMap(x => x.muros.map(m => [x.dir, x.nombre, m.id, m.rhoNecesaria, m.relacionNecesaria, m.verifica]));
      expect(resumen(b)).toEqual(resumen(a));
    }
  });
});
