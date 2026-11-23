/**
 * Ejemplo de contexto urbano (docs/contexto_urbano): la torre de 34 pisos en una manzana con torres vecinas, en el
 * túnel 2D, aislada y con contexto, a una altura de corte. Mide la fuerza solo sobre la torre del proyecto.
 * Uso: DIAG=1 CASO=60:ctx PROYECTO=ruta/al/proyecto.json SALIDA=carpeta/ npx vitest run tools/contexto/simular.test.ts
 *   CASO = «altura:ctx» o «altura:ais»; tarda unos 6 a 10 minutos por caso.
 */
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { Lbm2D } from '../../src/viento/lbm2d';
import { distanciasPared, dentro, type Geometria2D, type P } from '../../src/viento/geometria2d';
import { puntosSilueta } from '../../src/engine/silueta';
import { medir } from '../../src/viento/mediciones';
import { perimetro, PromedioPerimetro } from '../../src/viento/perimetro';
import { promedioArea, puntosAltos } from '../../src/viento/salvaguardas';

const S = process.env.SALIDA ?? './';
it.skipIf(!process.env.DIAG)(`contexto ${process.env.CASO}`, () => {
  const ctx = JSON.parse(readFileSync('docs/contexto_urbano/contexto_ejemplo.json', 'utf8'));
  const proy = JSON.parse(readFileSync(process.env.PROYECTO ?? 'torre34.json', 'utf8'));
  const [zCorte, caso] = (process.env.CASO ?? '60:ctx').split(':');
  const z = +zCorte, conCtx = caso === 'ctx';
  const D = 16, U0 = +(process.env.U0 ?? 0.06), Re = 1000, cs = 0.16;
  const pb = proy.niveles.find((n: { nombre: string }) => n.nombre === 'PB');
  const torre: P[] = puntosSilueta(pb.carpinteria, 12).map((q: P) => ({ x: q.x, y: q.y }));
  const rect = (v: { cx: number; cy: number; ancho: number; largo: number }): P[] => [
    { x: v.cx - v.ancho / 2, y: v.cy - v.largo / 2 }, { x: v.cx + v.ancho / 2, y: v.cy - v.largo / 2 }, { x: v.cx + v.ancho / 2, y: v.cy + v.largo / 2 }, { x: v.cx - v.ancho / 2, y: v.cy + v.largo / 2 }];
  const vecinos: P[][] = conCtx ? ctx.vecinos.filter((v: { altura: number }) => v.altura > z).map(rect) : [];
  // viento A (+y) → +x de la red: (x, y) → (y, −x)
  const rot = (q: P): P => ({ x: q.y, y: -q.x });
  const pols = [torre, ...vecinos].map(p => p.map(rot));
  const xs = torre.map(rot).map(q => q.y), B = Math.max(...xs) - Math.min(...xs);   // ancho de la torre transversal al viento
  const escala = D / B;
  // el mismo dominio con y sin contexto: 250 m antes del grupo, 600 m después, 300 m a cada lado
  const todos = [torre, ...ctx.vecinos.map(rect)].map(p => p.map(rot)).flat();
  const gx0 = Math.min(...todos.map(q => q.x)), gx1 = Math.max(...todos.map(q => q.x)), gy0 = Math.min(...todos.map(q => q.y)), gy1 = Math.max(...todos.map(q => q.y));
  const nx = Math.round((250 + (gx1 - gx0) + 600) * escala), ny = Math.round((600 + (gy1 - gy0)) * escala);
  const ox = 250 * escala - gx0 * escala, oy = 300 * escala - gy0 * escala;
  const aRed = (q: P): P => ({ x: ox + q.x * escala, y: oy + q.y * escala });
  const contornos = pols.map(p => p.map(aRed));
  const solido = new Uint8Array(nx * ny), cuerpo = new Uint8Array(nx * ny);
  const caja = { x0: nx, x1: 0, y0: ny, y1: 0 };
  contornos.forEach((p, k) => {
    const bx0 = Math.max(0, Math.floor(Math.min(...p.map(q => q.x)))), bx1 = Math.min(nx - 1, Math.ceil(Math.max(...p.map(q => q.x))));
    const by0 = Math.max(0, Math.floor(Math.min(...p.map(q => q.y)))), by1 = Math.min(ny - 1, Math.ceil(Math.max(...p.map(q => q.y))));
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (dentro(p, x + 0.5, y + 0.5)) {
      const c = y * nx + x; solido[c] = 1;
      if (k === 0) { cuerpo[c] = 1; caja.x0 = Math.min(caja.x0, x); caja.x1 = Math.max(caja.x1, x); caja.y0 = Math.min(caja.y0, y); caja.y1 = Math.max(caja.y1, y); }
    }
  });
  const q = distanciasPared(nx, ny, solido, contornos);
  const qUsar = process.env.PAREDES === '0' ? undefined : q;
  const geo: Geometria2D = { nx, ny, solido, escala, anchoM: B, D, celdasTorre: 0, caja, contornos, q, nTorre: 1, cuerpo };
  const m = new Lbm2D({ nx, ny, nu: (U0 * D) / Re, u0: U0, cs, solido, q: qUsar, colision: 'trt', cuerpo, paredesLineales: process.env.CUAD !== '1' });
  const perim = new PromedioPerimetro(perimetro(geo), U0);
  const arranque = Math.round(900 / U0), medidos = Math.round(2400 / U0), Fx: number[] = [], Fy: number[] = [];
  const sumU = new Float64Array(nx * ny), sumV = new Float64Array(nx * ny), sumS = new Float64Array(nx * ny); let n = 0;
  let pasoRoto = -1, maxRed = 0;
  for (let k = 0; k < arranque + medidos && !m.roto; k++) {
    m.paso();
    if (m.roto) pasoRoto = k;
    if (k % 500 === 0) for (let c = 0; c < nx * ny; c++) if (!solido[c]) maxRed = Math.max(maxRed, Math.hypot(m.ux[c], m.uy[c]));
    if (k < arranque) continue;
    Fx.push(m.Fx); Fy.push(m.Fy);
    if (k % 20 === 0) { perim.sumar(m.rho); for (let c = 0; c < nx * ny; c++) { sumU[c] += m.ux[c]; sumV[c] += m.uy[c]; sumS[c] += Math.hypot(m.ux[c], m.uy[c]); } n++; }
  }
  const md = medir(Fx, Fy, U0, D);
  // la velocidad media alta en el entorno de la torre (un ancho alrededor)
  const media = new Float32Array(nx * ny), aire = new Uint8Array(nx * ny);
  for (let c = 0; c < nx * ny; c++) { media[c] = sumS[c] / n / U0; aire[c] = solido[c] ? 0 : 1; }
  const prom = promedioArea(nx, ny, media, aire, 1);
  const altos = puntosAltos(nx, ny, prom, solido, 1.0, 3, 4, { x0: caja.x0 - D, x1: caja.x1 + D, y0: caja.y0 - D, y1: caja.y1 + D });
  const ex = perim.extremos(120);
  // Cp promedio por cara: barlovento (normal −x), sotavento, laterales, en los tramos del perímetro
  const p = perim.p, caras = { barlovento: [0, 0], sotavento: [0, 0], lateral: [0, 0] } as Record<string, number[]>;
  for (let k = 0; k < p.celdas.length; k++) {
    const cx = (caja.x0 + caja.x1 + 1) / 2, cy = (caja.y0 + caja.y1 + 1) / 2, dx = p.px[k] - cx, dy = p.py[k] - cy;
    const hx = (caja.x1 - caja.x0 + 1) / 2, hy = (caja.y1 - caja.y0 + 1) / 2;
    const cara = Math.abs(dx) / hx > Math.abs(dy) / hy ? (dx < 0 ? 'barlovento' : 'sotavento') : 'lateral';
    caras[cara][0] += perim.cp(k); caras[cara][1]++;
  }
  // un recorte del campo medio alrededor del grupo, para las imágenes (cada 1 celda)
  const rx0 = Math.max(0, Math.floor(ox + (gx0 - 60) * escala)), rx1 = Math.min(nx - 1, Math.ceil(ox + (gx1 + 160) * escala));
  const ry0 = Math.max(0, Math.floor(oy + (gy0 - 60) * escala)), ry1 = Math.min(ny - 1, Math.ceil(oy + (gy1 + 60) * escala));
  const W = rx1 - rx0 + 1, H = ry1 - ry0 + 1, mu = [], mv = [], ms = [], so = [];
  for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) { const c = y * nx + x; mu.push(+(sumU[c] / n / U0).toFixed(3)); mv.push(+(sumV[c] / n / U0).toFixed(3)); ms.push(+(sumS[c] / n / U0).toFixed(3)); so.push(solido[c] ? (cuerpo[c] ? 2 : 1) : 0); }
  const res = {
    corte: z, caso, roto: m.roto, pasoRoto, maxRed, U0, nx, ny, celda_m: 1 / escala, Cd: md.Cd, ClRms: md.ClRms, St: md.St,
    cp: Object.fromEntries(Object.entries(caras).map(([k, v]) => [k, v[1] ? v[0] / v[1] : null])), cpMin: ex.min?.cp, cpMax: ex.max?.cp,
    altos: altos.map(a => ({ v: a.valor, x_m: (a.x - (caja.x0 + caja.x1 + 1) / 2) / escala, y_m: (a.y - (caja.y0 + caja.y1 + 1) / 2) / escala })),
    vecinos: conCtx ? ctx.vecinos.filter((v: { altura: number }) => v.altura > z).map((v: { id: string }) => v.id) : [],
    recorte: { W, H, x0_m: (rx0 - ox) / escala, y0_m: (ry0 - oy) / escala, mu, mv, ms, so },
  };
  writeFileSync(`${S}ctx_${z}_${caso}${process.env.SUF ?? ''}.json`, JSON.stringify(res));
  console.log(`${z} m ${caso}: Cd ${md.Cd.toFixed(2)} Cl ±${md.ClRms.toFixed(2)} St ${md.St?.toFixed(3)} ${m.roto ? 'ROTO' : ''}`);
}, 3_600_000);
