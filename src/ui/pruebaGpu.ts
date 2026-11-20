/**
 * Prototipo de la etapa V3 (docs/plan_viento.html): «Probar la placa de video». Corre el túnel 3D (D3Q19 en WebGPU)
 * con la grilla liviana del plan (160 × 80 × 64 celdas, un prisma sobre el suelo y el perfil de viento) unos segundos
 * y mide la velocidad. Criterio del plan para seguir con V3: al menos 10 cuadros por segundo, a 20 pasos por cuadro.
 */
import { h, kpi, type H } from './comp';
import { fmt } from './estado';
import { canalConPrisma, perfilPotencia } from '../viento/lbm3d';

const G = { nx: 160, ny: 80, nz: 64 }, PASOS_CUADRO = 20, CUADROS_MIN = 10;
type Resultado = { adaptador: string; mlups: number; fps: number; pasos: number; seg: number; corte: Float32Array | null } | { error: string };
let resultado: Resultado | null = null, corriendo = false;

/** el criterio: millones de celdas por segundo que hacen falta para 10 cuadros por segundo con la grilla liviana */
export const MLUPS_NECESARIOS = (G.nx * G.ny * G.nz * PASOS_CUADRO * CUADROS_MIN) / 1e6;

async function medir(alTerminar: () => void) {
  corriendo = true; resultado = null; alTerminar();
  let sim: Awaited<ReturnType<typeof import('../viento/lbm3dGpu').crearLbm3dGpu>> | null = null;
  try {
    const { crearLbm3dGpu, hayWebGpu } = await import('../viento/lbm3dGpu');
    if (!(await hayWebGpu())) throw new Error('Este navegador no tiene WebGPU (Chrome y Edge sí; Safari desde la versión 26; Firefox, todavía no en Linux, Android ni Mac con Intel). El túnel 2D funciona igual.');
    const a = 16, hT = 40;
    sim = await crearLbm3dGpu({ ...G, nu: (0.08 * a) / 5000, cs: 0.17, uIn: perfilPotencia(G.nz, 0.08, hT, 0.2), solido: canalConPrisma(G.nx, G.ny, G.nz, a, hT, 40) });
    sim.avanzar(20); await sim.esperar();                                   // calentamiento (compila y sube todo)
    const t0 = performance.now(); let n = 0;
    while (performance.now() - t0 < 4000) { sim.avanzar(40); n += 40; await sim.esperar(); }
    const seg = (performance.now() - t0) / 1000, N = G.nx * G.ny * G.nz;
    const mlups = (n * N) / seg / 1e6;
    // un poco más, para que el corte muestre la estela
    while (sim.pasos < 1500 && performance.now() - t0 < 12000) { sim.avanzar(60); await sim.esperar(); }
    const corte = await sim.corte(Math.round(hT * 0.6));
    resultado = { adaptador: sim.adaptador, mlups, fps: (mlups * 1e6) / (N * PASOS_CUADRO), pasos: sim.pasos, seg, corte };
  } catch (e) { resultado = { error: e instanceof Error ? e.message : String(e) }; }
  finally { sim?.destruir(); corriendo = false; alTerminar(); }
}

function dibujarCorte(c: Float32Array): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = G.nx; cv.height = G.ny; cv.className = 'corte-gpu';
  const g = cv.getContext('2d')!, img = g.createImageData(G.nx, G.ny);
  for (let y = 0; y < G.ny; y++) for (let x = 0; x < G.nx; x++) {
    const k = (y * G.nx + x) * 4, p = ((G.ny - 1 - y) * G.nx + x) * 4;
    if (c[k + 3] === 0) { img.data[p] = 34; img.data[p + 1] = 34; img.data[p + 2] = 51; img.data[p + 3] = 255; continue; }
    const s = Math.min(1, Math.hypot(c[k], c[k + 1], c[k + 2]) / 0.1);
    img.data[p] = 40 + 200 * s; img.data[p + 1] = 90 + 60 * (1 - Math.abs(s - 0.5) * 2); img.data[p + 2] = 220 - 180 * s; img.data[p + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

export function seccionPruebaGpu(redibujar: () => void): H {
  const caja = h('div', {});
  caja.append(h('p', { class: 'nota' }, `El túnel 3D (etapa V3 del plan) necesita la placa de video. Esta prueba corre la grilla liviana (${G.nx} × ${G.ny} × ${G.nz} celdas, una torre sobre el suelo con el perfil de viento) unos segundos y mide la velocidad. Para seguir con el 3D hacen falta ${CUADROS_MIN} cuadros por segundo a ${PASOS_CUADRO} pasos por cuadro (unos ${fmt(MLUPS_NECESARIOS, 0)} millones de celdas por segundo).`));
  const b = h('button', { type: 'button', class: 'boton' }, corriendo ? 'Midiendo…' : 'Probar la placa de video') as HTMLButtonElement;
  b.disabled = corriendo;
  b.addEventListener('click', () => { void medir(redibujar); });
  caja.append(b);
  const r = resultado;
  if (r && 'error' in r) caja.append(h('p', { class: 'aviso-viejo' }, r.error));
  else if (r) {
    const alcanza = r.fps >= CUADROS_MIN;
    caja.append(h('div', { class: 'kpis' },
      kpi('Velocidad', `${fmt(r.mlups, 0)} M/s`, 'millones de celdas por segundo'),
      kpi('Cuadros por segundo', fmt(r.fps, 1), `a ${PASOS_CUADRO} pasos por cuadro · hacen falta ${CUADROS_MIN}`, alcanza ? 'var(--ok)' : 'var(--revisar)'),
    ));
    const texto = `Placa: ${r.adaptador || 'sin nombre'} · ${fmt(r.mlups, 0)} millones de celdas por segundo · ${fmt(r.fps, 1)} cuadros por segundo (${r.pasos} pasos en ${fmt(r.seg, 1)} s de medición). ${alcanza ? 'Alcanza para el túnel 3D.' : 'No alcanza para el túnel 3D en esta computadora: el 2D funciona igual.'}`;
    caja.append(h('p', { class: 'nota' }, texto));
    if (r.corte) caja.append(h('figure', { class: 'diagrama' }, dibujarCorte(r.corte), h('figcaption', {}, 'Corte horizontal a 0,6 de la altura de la torre (velocidad: azul quieto, rojo rápido). Es solo para ver que el cálculo anda; el túnel 3D completo es la etapa V3.')));
    const copiar = h('button', { type: 'button', class: 'mini' }, 'Copiar el resultado');
    copiar.addEventListener('click', () => { void navigator.clipboard?.writeText(texto); copiar.textContent = 'Copiado'; });
    caja.append(copiar);
  }
  return caja;
}
