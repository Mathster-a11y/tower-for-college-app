import { expect, it } from 'vitest';
import { grafoFem } from './fem';
import { ejemploHancock, ejemploHearst, ejemploOnterie } from '../../engine/ejemplosExo';

// torres donde el viento lo toma todo el exo (sin tabiques en ese viento): la vista Ecuaciones → FEM se cortaba
it('Ecuaciones · FEM: una torre sin piezas de tabique en el viento arma todas las tarjetas sin errores', () => {
  for (const f of [ejemploHancock, ejemploHearst, ejemploOnterie]) for (const dir of ['A', 'B'] as const) {
    const g = grafoFem(f(), 'timoshenko', { dir, pieza: '' });
    const r = g.calcular(g.datos());
    g.capitulos.forEach(c => { c.params.forEach(p => p.get(g.datos())); c.nodos.forEach(n => expect(() => n.valor(r)).not.toThrow()); });
  }
});
