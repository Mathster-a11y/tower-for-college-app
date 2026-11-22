/**
 * Diagnóstico del simulador de viento: cómo ve el túnel cada forma de planta. Dibuja, para cada contorno, las celdas
 * que el túnel marca como sólidas (centro de la celda adentro del contorno, como geometria2d) y encima el contorno
 * real. Muestra la «escalera» de las paredes y los detalles que desaparecen con 14, 20 y 30 celdas por ancho.
 * También dibuja los enlaces que cruzan la pared con el punto exacto de corte (lo que usa el rebote interpolado).
 * Uso: DIAG=1 npx vitest run tools/diagnostico  → docs/diagnostico_viento/img/*.svg
 */
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { puntosSilueta, rectangulo, type Vertice } from '../../src/engine/silueta';
import { suavizarAnillo, tratarEsquinas } from '../../src/engine/contorno';

const DIR = join(__dirname, '..', '..', 'docs', 'diagnostico_viento', 'img');
type P = { x: number; y: number };

function dentro(p: P[], x: number, y: number): boolean {
  let s = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) s = !s;
  }
  return s;
}
/** corte del segmento a→b con el contorno (fracción q de a a b), o null */
function corte(p: P[], a: P, b: P): number | null {
  let mejor: number | null = null;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const c = p[j], d = p[i];
    const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
    const den = r.x * s.y - r.y * s.x;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den, u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (mejor === null || t < mejor)) mejor = t;
  }
  return mejor;
}

const anillo = (v: Vertice[] | { error: string }) => { if ('error' in v) throw new Error(v.error); return v; };
const FORMAS: [string, string, Vertice[]][] = [
  ['vivas', 'Esquinas vivas (20 × 16 m)', rectangulo(20, 16)],
  ['redondeadas', 'Esquinas redondeadas r = 3 m', anillo(tratarEsquinas(rectangulo(20, 16), 'redondeada', 3))],
  ['chaflan', 'Chaflán de 2 m', anillo(tratarEsquinas(rectangulo(20, 16), 'chaflan', 2))],
  ['sustraidas', 'Esquinas sustraídas 2 × 2 m', anillo(tratarEsquinas(rectangulo(20, 16), 'sustraida', 2))],
  ['ochava1', 'Ochava chica de 1 m', anillo(tratarEsquinas(rectangulo(20, 16), 'chaflan', 1))],
  ['curva', 'Carpintería curva (Bézier suavizada)', suavizarAnillo(rectangulo(20, 16), 0.6)],
];

function svgForma(v: Vertice[], D: number, titulo: string, enlaces: boolean): string {
  const pol = puntosSilueta(v, 3);
  const xs = pol.map(q => q.x), ys = pol.map(q => q.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const ancho = y1 - y0;                    // el viento va en x: el ancho transversal es el de y
  const h = ancho / D;                       // metros por celda
  const m = 2, nx = Math.ceil((x1 - x0) / h) + 2 * m, ny = Math.ceil((y1 - y0) / h) + 2 * m;
  const ox = x0 - m * h, oy = y0 - m * h;
  const px = Math.min(520 / nx, 420 / ny), W = nx * px, H = ny * px + 46;
  const X = (x: number) => ((x - ox) / h) * px, Y = (y: number) => 46 + (ny - (y - oy) / h) * px;
  const sol: boolean[][] = [];
  let celdas = '', lineas = '';
  for (let j = 0; j < ny; j++) { sol[j] = []; for (let i = 0; i < nx; i++) {
    const cx = ox + (i + 0.5) * h, cy = oy + (j + 0.5) * h, s = dentro(pol, cx, cy);
    sol[j][i] = s;
    celdas += `<rect x="${(i * px).toFixed(1)}" y="${(46 + (ny - 1 - j) * px).toFixed(1)}" width="${px.toFixed(1)}" height="${px.toFixed(1)}" fill="${s ? '#5b6472' : '#ffffff'}" stroke="#d5d9df" stroke-width="0.5"/>`;
  } }
  // enlaces fluido → sólido con el punto exacto donde cruzan la pared (rebote interpolado)
  if (enlaces) {
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
    let n = 0;
    for (let j = 1; j < ny - 1 && n < 400; j++) for (let i = 1; i < nx - 1; i++) {
      if (sol[j][i]) continue;
      for (const [dx, dy] of dirs) {
        if (!sol[j + dy]?.[i + dx]) continue;
        const a = { x: ox + (i + 0.5) * h, y: oy + (j + 0.5) * h }, b = { x: a.x + dx * h, y: a.y + dy * h };
        const q = corte(pol, a, b);
        if (q === null) continue;
        const c = { x: a.x + q * (b.x - a.x), y: a.y + q * (b.y - a.y) };
        lineas += `<line x1="${X(a.x).toFixed(1)}" y1="${Y(a.y).toFixed(1)}" x2="${X(c.x).toFixed(1)}" y2="${Y(c.y).toFixed(1)}" stroke="#c77700" stroke-width="1"/><circle cx="${X(c.x).toFixed(1)}" cy="${Y(c.y).toFixed(1)}" r="1.6" fill="#c77700"/>`;
        n++;
      }
    }
  }
  const camino = pol.map((q, k) => `${k ? 'L' : 'M'}${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' ') + ' Z';
  const nSol = sol.flat().filter(Boolean).length;
  const areaCeldas = nSol * h * h;
  let areaReal = 0; pol.forEach((a, k) => { const b = pol[(k + 1) % pol.length]; areaReal += a.x * b.y - b.x * a.y; }); areaReal = Math.abs(areaReal) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}" font-family="IBM Plex Sans, Arial, sans-serif">
<text x="0" y="16" font-size="14" font-weight="600" fill="#1f2328">${titulo}</text>
<text x="0" y="34" font-size="12" fill="#556">${D} celdas por ancho · celda de ${h.toFixed(2).replace('.', ',')} m · área en celdas ${areaCeldas.toFixed(1).replace('.', ',')} m² (real ${areaReal.toFixed(1).replace('.', ',')} m²)</text>
${celdas}${lineas}<path d="${camino}" fill="none" stroke="#1565c0" stroke-width="2"/></svg>`;
}

describe.skipIf(!process.env.DIAG)('diagnóstico: la planta en celdas', () => {
  it('escribe los SVG', () => {
    mkdirSync(DIR, { recursive: true });
    for (const [k, t, v] of FORMAS) for (const D of [14, 20, 30]) writeFileSync(join(DIR, `celdas_${k}_${D}.svg`), svgForma(v, D, t, false));
    for (const [k, t, v] of FORMAS.filter(f => ['redondeadas', 'curva'].includes(f[0]))) writeFileSync(join(DIR, `enlaces_${k}_20.svg`), svgForma(v, 20, `${t}: enlaces que cruzan la pared`, true));
  });
});
