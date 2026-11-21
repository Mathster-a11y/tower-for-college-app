/**
 * Torre grande para medir (informe técnico, hallazgo 11): 48 pisos y 3 subsuelos, 40 muros (los del ejemplo de la
 * guía repetidos en cuatro torres pegadas) y un grupo cerrado. Sirve para medir antes y después de reorganizar.
 */
import { ejemploGuia, type Proyecto } from '../../src/engine/modelo';

export function torreGrande(): Proyecto {
  const p = ejemploGuia();
  const pisos = 48, hPiso = 3;
  const B = p.niveles[0].B ?? 20, L = p.niveles[0].L ?? 16;
  p.niveles = [{ nombre: 'Azotea', cota: (pisos + 1) * hPiso, B: B * 2, L: L * 2 },
    ...Array.from({ length: pisos }, (_, i) => ({ nombre: `${pisos - i}º`, cota: (pisos - i) * hPiso })),
    { nombre: 'PB', cota: 0 }, { nombre: '1º SS', cota: -3.5 }, { nombre: '2º SS', cota: -7 }, { nombre: '3º SS', cota: -10.5 }];
  const base = p.muros;
  const muros = [];
  for (const [dx, dy, k] of [[-B / 2, -L / 2, 0], [B / 2, -L / 2, 1], [-B / 2, L / 2, 2], [B / 2, L / 2, 3]] as const)
    for (const m of base) muros.push({ ...m, id: `${m.id}_${k}`, x: m.x + dx, y: m.y + dy, piezaA: m.piezaA ? `${m.piezaA}_${k}` : m.piezaA, piezaB: m.piezaB ? `${m.piezaB}_${k}` : m.piezaB, pegadoA: m.pegadoA ? `${m.pegadoA}_${k}` : m.pegadoA, pegadoB: m.pegadoB ? `${m.pegadoB}_${k}` : m.pegadoB });
  p.muros = muros;
  p.grupos = [{ id: 'g1', nombre: 'Torre 1', muros: muros.filter(m => m.id.endsWith('_0')).map(m => m.id) } as never];
  p.nombre = 'Torre grande para medir';
  return p;
}
