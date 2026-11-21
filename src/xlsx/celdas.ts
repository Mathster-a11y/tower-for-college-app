/**
 * Las celdas que la app escribe en la planilla de la cátedra, hoja por hoja. Módulo liviano (sin jszip ni el armado
 * del libro): lo usan la sincronización con Sheets y el diálogo de exportar.
 */
import { filasParalelosNuevo, COLUMNA_ORTO_49, type PlanillaDatos, type PlanillaRes } from '../engine/planilla';
import { config, type Motor } from '../engine/config';
import type { ValorCelda } from './xml';

export const HOJAS = {
  viento: 'viento', mnyq: 'M,NyQ', jpar: 'J Tabiques paralelos', jort: 'J Tabiques ortogonales',
  rotA: 'Rototrasl. cara mayor', rotB: 'Rototrasl. cara menor', flex: 'Flex comp PB paralelos', t3d: 'T3D',
};
const COLS_J = ['B', 'C', 'F', 'G', 'J', 'K', 'S', 'T', 'W', 'X', 'Z', 'AB', 'AE', 'AF', 'AH', 'AI', 'AO', 'AP', 'AQ', 'AT', 'AU'] as const;
/** letra de la columna en la planilla para una columna de la hoja J (los nombres del motor son los de la distribución original) */
export const colJ = (orto: boolean, col: string, motor: Motor) => (orto && motor === 'nuevo' ? COLUMNA_ORTO_49[col] ?? col : col);

const num = (x: number | null | undefined): ValorCelda => (x === null || x === undefined ? { vacia: true } : { num: x });

/** Celdas que cambia la app, hoja por hoja (lo que se muestra al alumno antes de confirmar). */
export function celdasAEscribir(d: PlanillaDatos, r: PlanillaRes, motor: Motor = config.motor): Record<string, Record<string, ValorCelda>> {
  const nuevo = motor === 'nuevo';
  const c: Record<string, Record<string, ValorCelda>> = {};
  const v = (c[HOJAS.viento] = {} as Record<string, ValorCelda>);
  const s = d.viento;
  Object.entries({ C4: s.V, D4: s.Kd, E4: s.I, F4: s.zg, G4: s.alfa, I4: s.Kzt, J4: s.G, K4: s.Cpb, L4: s.Cps, O4: s.GCpi })
    .forEach(([ref, x]) => (v[ref] = num(x)));
  s.Z.forEach((z, i) => (v[`B${5 + i}`] = { num: z }));

  const m = (c[HOJAS.mnyq] = {} as Record<string, ValorCelda>);
  for (let k = 1; k < 54; k++) {
    const r = k + 4;
    m[`C${r}`] = d.mnyq.C[k] !== null ? { num: d.mnyq.C[k]! } : { formula: `+B${r - 1}-B${r}` };
    m[`D${r}`] = d.mnyq.D[k] !== null ? { num: d.mnyq.D[k]! } : { formula: `(B${r - 1}-B${r + 1})/2` };
    m[`E${r}`] = d.mnyq.E[k] !== null ? { num: d.mnyq.E[k]! } : { formula: `+E${r - 1}` };
    m[`F${r}`] = d.mnyq.F[k] !== null ? { num: d.mnyq.F[k]! } : { formula: `+F${r - 1}` };
    // planilla 2025: el ejemplo de la cátedra tiene cotas escritas a mano en B22:B54 de M,NyQ; se vuelve a poner el
    // vínculo original con «viento» (la fila r de M,NyQ lee la fila r+1 de viento), que es la fórmula de la planilla
    if (nuevo) m[`B${r}`] = { formula: `+viento!B${r + 1}` };
  }
  m.E4 = { num: d.mnyq.E[0] ?? 0 };
  m.F4 = { num: d.mnyq.F[0] ?? 0 };
  m.N80 = num(d.mnyq.b1);
  m.N81 = num(d.mnyq.a1);
  const mn = r.mnyq;
  m.O99 = { str: mn.L99 >= 1.5 && mn.M99 <= mn.N99 ? 'VERIFICA' : 'NO VERIFICA' };

  // planilla 2025: «J Tabiques paralelos» tiene 28 filas; cada pieza va en la fila que lee su ranura de Rototrasl.
  const jpar = nuevo ? filasParalelosNuevo(d.jpar) : d.jpar;
  for (const [hoja, filas] of [[HOJAS.jpar, jpar], [HOJAS.jort, d.jort]] as const) {
    const h = (c[hoja] = {} as Record<string, ValorCelda>);
    filas.forEach((f, i) => COLS_J.forEach(col => (h[`${colJ(hoja === HOJAS.jort, col, motor)}${4 + i}`] = num(f[col]))));
  }
  // columna H: paralelas desde la fila 5 y perpendiculares 6 filas después del bloque de paralelas (31 con 20 piezas)
  for (const [hoja, rot, ro, nP] of [[HOJAS.rotA, d.rotA, r.rotA, d.jpar.length], [HOJAS.rotB, d.rotB, r.rotB, d.jort.length]] as const) {
    const h = (c[hoja] = {} as Record<string, ValorCelda>);
    rot.H.forEach((x, i) => { if (i < nP || i >= nP + 6) h[`H${5 + i}`] = num(x); });
    // dos tabiques perpendiculares: J y posición en las filas 28–29 (datos) y el bloque general en 0 (B31:B50 son
    // vínculos a la otra hoja J: es la única fórmula que se reemplaza, para no contar dos veces esas piezas)
    if (rot.par) {
      [0, 1].forEach(k => { h[`B${5 + nP + 3 + k}`] = num(ro.B[nP + 3 + k]); h[`H${5 + nP + 3 + k}`] = num(rot.H[nP + 3 + k]); });
      for (let i = ro.oO; i < ro.B.length; i++) h[`B${5 + i}`] = { num: 0 };
    }
  }
  const f = (c[HOJAS.flex] = {} as Record<string, ValorCelda>);
  d.flex.forEach((x, i) => { f[`C${4 + i}`] = num(x.C); f[`F${4 + i}`] = num(x.F); f[`G${4 + i}`] = num(x.G); });
  return c;
}

