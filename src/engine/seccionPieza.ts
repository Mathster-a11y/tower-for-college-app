/**
 * La sección real de una pieza: todos sus muros juntos, sin contar dos veces lo que se pisa. Dos muros que se cruzan o
 * se encuentran sin estar unidos (las puntas no coinciden) se superponen; si se sumaran sus áreas, esa parte entraría
 * dos veces al cálculo (área, baricentro y J). Acá la sección es la unión de las huellas de los muros (biblioteca
 * polygon-clipping, MIT) y de ella salen el área, el baricentro y los momentos de inercia. Si los muros no se pisan, la
 * unión es la suma y no cambia nada: entonces se devuelve null y el cálculo sigue con las fórmulas de siempre.
 */
import polygonClipping from 'polygon-clipping';
import type { Muro } from './modelo';
import { areaMuro } from './modelo';
import { perfilDeMuro, polilinea } from './perfil';

type Anillo = [number, number][];
export interface SeccionReal {
  /** área real (m²), sin superposiciones, y la suma de las áreas de los muros sueltos */
  A: number; Asuma: number; superpuesta: number;
  xg: number; yg: number;
  /** momentos de inercia respecto del baricentro (m⁴): Jx = ∫(y−yg)² dA (viento A), Jy = ∫(x−xg)² dA (viento B) */
  Jx: number; Jy: number;
  /** la sección para dibujarla: polígonos con su contorno y sus huecos, y las partes que se pisan */
  poligonos: Anillo[][]; superposiciones: Anillo[][];
}

/** huella de un muro en la planta (con sus huecos), con las curvas en tramos de 1° como mucho */
export function huellaMuro(m: Muro): Anillo[] {
  const p = perfilDeMuro(m), anillo = (v: Parameters<typeof polilinea>[0]): Anillo => polilinea(v, 1, 32).map(q => [q.x, q.y]);
  return [anillo(p.v), ...(p.huecos ?? []).map(anillo)];
}
const caja = (r: Anillo[]) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; r[0].forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }); return { x0, y0, x1, y1 }; };

/** integrales de un conjunto de polígonos (contornos antihorarios, huecos horarios, como los devuelve la unión) */
function integrales(pols: Anillo[][]) {
  let A = 0, Sx = 0, Sy = 0, Ixx = 0, Iyy = 0;
  pols.forEach(pg => pg.forEach(r => {
    for (let i = 0; i + 1 < r.length; i++) {
      const [x0, y0] = r[i], [x1, y1] = r[i + 1], c = x0 * y1 - x1 * y0;
      A += c / 2; Sx += ((x0 + x1) * c) / 6; Sy += ((y0 + y1) * c) / 6;
      Ixx += ((y0 * y0 + y0 * y1 + y1 * y1) * c) / 12; Iyy += ((x0 * x0 + x0 * x1 + x1 * x1) * c) / 12;
    }
  }));
  return { A, Sx, Sy, Ixx, Iyy };
}

const memo = new Map<string, SeccionReal | null>();
/**
 * La sección real de los muros, o null si no se pisan (la suma de siempre ya es exacta). Los muros con aberturas no
 * entran acá: su sección es la más débil, que se calcula aparte.
 */
export function seccionReal(muros: Muro[]): SeccionReal | null {
  const ms = muros.filter(m => !m.aberturas?.length);
  if (ms.length < 2) return null;
  let clave: string | null = null;
  try { clave = JSON.stringify(ms.map(m => [m.id, m.x, m.y, m.dir, m.largo, m.espesor, m.ladoY, m.tipo, m.perfil, m.refLado])); } catch { clave = null; }
  if (clave && memo.has(clave)) return memo.get(clave)!;
  const hs = ms.map(huellaMuro), cs = hs.map(caja);
  // solo si alguna caja toca a otra puede haber superposición (lo común: nada que hacer)
  let toca = false;
  for (let i = 0; i < cs.length && !toca; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j];
    if (a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9) { toca = true; break; }
  }
  let r: SeccionReal | null = null;
  if (toca) {
    const pols = polygonClipping.union(hs[0] as never, ...(hs.slice(1) as never[])) as unknown as Anillo[][];
    const k = integrales(pols), Asuma = ms.reduce((q, m) => q + areaMuro(m), 0);
    // diferencia de redondeo de las curvas (tramos de 1°): menos de una parte en mil no es una superposición
    if (k.A > 0 && Asuma - k.A > Math.max(1e-6, 1e-3 * Asuma)) {
      const xg = k.Sx / k.A, yg = k.Sy / k.A;
      // las partes que se pisan: donde se cruzan dos huellas
      const sup: Anillo[][] = [];
      for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
        const a = cs[i], b = cs[j];
        if (!(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1)) continue;
        sup.push(...(polygonClipping.intersection(hs[i] as never, hs[j] as never) as unknown as Anillo[][]));
      }
      r = { A: k.A, Asuma, superpuesta: Asuma - k.A, xg, yg, Jx: k.Ixx - k.A * yg * yg, Jy: k.Iyy - k.A * xg * xg, poligonos: pols, superposiciones: sup };
    }
  }
  if (clave) { memo.set(clave, r); if (memo.size > 200) memo.delete(memo.keys().next().value!); }
  return r;
}

/** la unión de las huellas, siempre (para dibujar la sección de una pieza aunque sus muros no se pisen) */
export function unionHuellas(muros: Muro[]): Anillo[][] {
  const hs = muros.filter(m => !m.aberturas?.length).map(huellaMuro);
  if (!hs.length) return [];
  return polygonClipping.union(hs[0] as never, ...(hs.slice(1) as never[])) as unknown as Anillo[][];
}
