/**
 * Torre de 34 pisos de 3,60 m (planta del PDF del usuario, medidas leídas de sus trazos vectoriales).
 *
 * Planta de 39,60 × 18,00 m entre ejes (40,10 × 18,50 m a las caras de las columnas):
 *  - 20 columnas cuadradas de 0,50 × 0,50 m en el perímetro y en los ejes x = 7,20 y x = 21,60;
 *  - 12 columnas en cruz en los costados (0,50 × 0,50 m con dos aletas de 0,20 × 0,30 m; en las esquinas, una);
 *  - cuatro núcleos de tabiques de 0,35 y 0,20 m entre y = 7,20 y y = 18,25: los dos de la derecha son el espejo de los de
 *    la izquierda respecto del eje x = 21,60.
 * Las columnas toman carga de losa (área de influencia) pero no rigidez lateral: quedan «fuera» del molde de la hoja J
 * (el viento lo toman los núcleos, como en la guía). Supuestos: un subsuelo de 3,60 m, el sitio del ejemplo de la guía y H30.
 */
import { agrupar } from './dibujo';
import { areasInfluencia } from './areas';
import type { Muro, Nivel, Proyecto } from './modelo';

const CX = 19.8, CY = 9;                       // centro de la planta (ejes de simetría de PB)
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function ejemploPlanta34(): Proyecto {
  let n = 0;
  const id = () => `M${++n}`;
  /** rectángulo de muro dado por sus bordes (coordenadas del plano, origen en la columna de abajo a la izquierda) */
  const rect = (x0: number, x1: number, y0: number, y1: number, extra: Partial<Muro> = {}): Muro => {
    const ax = x1 - x0, ay = y1 - y0, dirY = ay >= ax;
    return { id: id(), dir: dirY ? 'Y' : 'X', x: r3((x0 + x1) / 2 - CX), y: r3((y0 + y1) / 2 - CY), largo: r3(dirY ? ay : ax), espesor: r3(dirY ? ax : ay), llega: true, areaInf: 0, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '', ...extra };
  };
  const espejo = (x0: number, x1: number) => [43.2 - x1, 43.2 - x0] as const;
  let muros: Muro[] = [];
  const pieza = (ms: Muro[], nombre?: string) => { muros = agrupar([...muros, ...ms], ms.map(m => m.id), nombre).muros; };

  // núcleos (izquierda y su espejo a la derecha)
  for (const lado of [0, 1]) {
    const R = (x0: number, x1: number, y0: number, y1: number) => (lado ? rect(...espejo(x0, x1), y0, y1) : rect(x0, x1, y0, y1));
    pieza([R(10.625, 10.975, 13.6, 17.9), R(10.625, 13.322, 17.9, 18.25), R(12.97, 13.32, 12.8, 17.9), R(10.625, 13.32, 12.6, 12.8), R(10.625, 10.975, 10.89, 12.6), R(10.625, 13.32, 10.69, 10.89)]);
    pieza([R(10.625, 10.975, 7.55, 9.26), R(10.625, 13.27, 7.2, 7.55), R(10.625, 13.27, 9.26, 9.46)]);
    pieza([R(17.825, 18.175, 7.55, 17.9), R(14.7, 18.175, 17.9, 18.25), R(15.48, 17.825, 13.62, 13.82), R(15.48, 17.825, 10.69, 10.89), R(15.52, 18.175, 7.2, 7.55), R(15.52, 15.72, 7.55, 9.46)]);
  }
  // columnas: fuera del molde de la hoja J (no toman viento), sí carga de losa
  const fuera: Partial<Muro> = { rolA: 'fuera', rolB: 'fuera' };
  const cuadradas: [number, number][] = [[3.6, 0], [3.6, 18], [7.2, 0], [7.2, 7.2], [7.2, 10.8], [7.2, 14.4], [7.2, 18], [10.8, 0], [14.4, 0], [18, 0],
    [21.6, 0], [21.6, 7.2], [21.6, 10.8], [21.6, 14.4], [21.6, 18], [25.2, 0], [28.8, 0], [32.4, 0], [36, 0], [36, 18]];
  cuadradas.forEach(([x, y]) => pieza([rect(x - 0.25, x + 0.25, y - 0.25, y + 0.25, fuera)]));
  for (const x of [0, 39.6]) for (const y of [0, 3.6, 7.2, 10.8, 14.4, 18]) {
    const ms = [rect(x - 0.25, x + 0.25, y - 0.25, y + 0.25, fuera)];
    if (y < 18) ms.push(rect(x - 0.1, x + 0.1, y + 0.25, y + 0.55, fuera));     // aleta hacia arriba
    if (y > 0) ms.push(rect(x - 0.1, x + 0.1, y - 0.55, y - 0.25, fuera));      // aleta hacia abajo
    pieza(ms);
  }

  const B = 40.1, L = 18.5;
  const niveles: Nivel[] = [{ nombre: 'Azotea', cota: 34 * 3.6, B, L }];
  for (let p = 33; p >= 1; p--) niveles.push({ nombre: `${p}º`, cota: +(p * 3.6).toFixed(2) });
  niveles.push({ nombre: 'PB', cota: 0 }, { nombre: '1º SS', cota: -3.6, B: B + 2, L: L + 2 });
  const p: Proyecto = {
    version: 1, nombre: 'Torre de 34 pisos · planta del PDF', alumno: '',
    sitio: { V: 48, Kd: 0.85, I: 1, zg: 457, alfa: 5, Kzt: 1, G: 0.85, Cpb: 0.8, Cps: -0.5, GCpi: 0.18 },
    niveles, fundacion: { b1: L + 2, a1: B + 2 }, hormigon: 'H30', muros,
  };
  const iPB = niveles.findIndex(x => x.cota === 0);
  const a = areasInfluencia(p, iPB);
  p.muros.forEach(m => { if (m.id in a.area) m.areaInf = +a.area[m.id].toFixed(2); });
  return p;
}
