/**
 * Capturas de prueba del túnel 3D (prototipo V3): corre el D3Q19 (en la placa si hay WebGPU; si no, la referencia en
 * JavaScript) con una torre prismática sobre el suelo y dibuja cortes, el Cp de las caras y una vista 3D con líneas de
 * corriente. Colores: velocidad de blanco a verde; Cp positivo (empuje, comprime) azul y negativo (succión, tracciona)
 * rojo, como en toda la app.
 */
import * as THREE from 'three';
import { canalConPrisma, EX3, EY3, EZ3, Lbm3D, perfilPotencia } from '../../src/viento/lbm3d';
import { crearLbm3dGpu, hayWebGpu } from '../../src/viento/lbm3dGpu';

const P = new URLSearchParams(location.search);
const nx = +(P.get('nx') ?? 112), ny = +(P.get('ny') ?? 56), nz = +(P.get('nz') ?? 44);
const a = +(P.get('a') ?? 12), hT = +(P.get('h') ?? 28), x0 = +(P.get('x0') ?? 28);
const paradas = (P.get('pasos') ?? '400,1200,2400').split(',').map(Number);
const u0 = 0.1, N = nx * ny * nz, y0 = Math.floor((ny - a) / 2);
const uIn = perfilPotencia(nz, u0, hT, 0.2), uRef = uIn[hT];
const solido = canalConPrisma(nx, ny, nz, a, hT, x0);
const opciones = { nx, ny, nz, nu: (u0 * a) / 3000, cs: 0.17, uIn, solido };
const estado = document.getElementById('estado')!, figs = document.getElementById('figs')!;
const idx = (x: number, y: number, z: number) => (z * ny + y) * nx + x;

interface Campo { u: Float32Array; v: Float32Array; w: Float32Array; r: Float32Array }
function macros(f: Float32Array): Campo {
  const u = new Float32Array(N), v = new Float32Array(N), w = new Float32Array(N), r = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    if (solido[c]) continue;
    let rr = 0, jx = 0, jy = 0, jz = 0;
    for (let i = 0; i < 19; i++) { const q = f[i * N + c]; rr += q; jx += q * EX3[i]; jy += q * EY3[i]; jz += q * EZ3[i]; }
    r[c] = rr; u[c] = jx / rr; v[c] = jy / rr; w[c] = jz / rr;
  }
  return { u, v, w, r };
}

// ---------------------------------------------------------------------------------------------- colores
const verde = [29, 158, 117], azul = [55, 138, 221], rojo = [226, 75, 74], blanco = [255, 255, 255], solidoC = [52, 58, 70];
const mezcla = (p: number[], q: number[], t: number) => p.map((x, i) => x + (q[i] - x) * Math.max(0, Math.min(1, t)));
const colVel = (s: number) => mezcla(blanco, verde, s / (1.3 * u0));
const colCp = (cp: number) => (cp >= 0 ? mezcla(blanco, azul, cp / 1) : mezcla(blanco, rojo, -cp / 1.2));
const cpDe = (r: number) => (r - 1) / 3 / (0.5 * uRef * uRef);

function figura(titulo: string, cv: HTMLCanvasElement, ley?: string) {
  const f = document.createElement('figure'); f.dataset.fig = titulo;
  const t = document.createElement('figcaption'); t.textContent = titulo;
  f.append(cv); if (ley) { const l = document.createElement('div'); l.className = 'ley'; l.innerHTML = ley; f.append(l); }
  f.append(t); figs.append(f); return f;
}
const LEY_VEL = `velocidad: <span>quieto<i style="background:linear-gradient(90deg,#fff,rgb(29,158,117))"></i>1,3 × la de entrada</span> · torre en gris oscuro · flechas: sentido del aire`;
const LEY_CP = `Cp: <span>succión (tracciona)<i style="background:linear-gradient(90deg,rgb(226,75,74),#fff)"></i>0<i style="background:linear-gradient(90deg,#fff,rgb(55,138,221))"></i>empuje (comprime)</span>`;

/** un corte: f(i, j) → celda; dibuja la velocidad y flechas del plano */
function corte(cm: Campo, ni: number, nj: number, celda: (i: number, j: number) => number, comp: (c: number) => [number, number], esc: number, titulo: string) {
  const cv = document.createElement('canvas'); cv.width = ni * esc; cv.height = nj * esc;
  const g = cv.getContext('2d')!;
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
    const c = celda(i, j);
    const col = solido[c] ? solidoC : colVel(Math.hypot(cm.u[c], cm.v[c], cm.w[c]));
    g.fillStyle = `rgb(${col.map(Math.round).join(',')})`; g.fillRect(i * esc, (nj - 1 - j) * esc, esc, esc);
  }
  g.strokeStyle = 'rgba(31,35,40,0.55)'; g.lineWidth = 1;
  const paso = 4;
  for (let j = 2; j < nj; j += paso) for (let i = 2; i < ni; i += paso) {
    const c = celda(i, j); if (solido[c]) continue;
    const [p, q] = comp(c), m = Math.hypot(p, q); if (m < 1e-6) continue;
    const L = Math.min(1, m / u0) * paso * esc * 0.9, cx = (i + 0.5) * esc, cy = (nj - 1 - j + 0.5) * esc, dx = (p / m) * L, dy = -(q / m) * L;
    g.beginPath(); g.moveTo(cx - dx / 2, cy - dy / 2); g.lineTo(cx + dx / 2, cy + dy / 2); g.stroke();
    const ax = cx + dx / 2, ay = cy + dy / 2, an = Math.atan2(dy, dx);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax - 4 * Math.cos(an - 0.5), ay - 4 * Math.sin(an - 0.5)); g.lineTo(ax - 4 * Math.cos(an + 0.5), ay - 4 * Math.sin(an + 0.5)); g.closePath(); g.fillStyle = 'rgba(31,35,40,0.55)'; g.fill();
  }
  return figura(titulo, cv, LEY_VEL);
}

/** Cp de las cuatro caras y la cubierta, desplegadas, con el promedio de cada una contra el CIRSOC 102 */
function caras(cm: Campo, pasos: number) {
  const esc = 9, gap = 10;
  const cv = document.createElement('canvas'); cv.width = (4 * a + 3) * esc + 4 * gap + a * esc + 20; cv.height = hT * esc + 70;
  const g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  g.font = '12px system-ui'; g.fillStyle = '#1f2328';
  // cada cara: celdas de fluido pegadas, recorridas de izquierda a derecha mirándola desde afuera
  const defs: { nombre: string; cirsoc: string; celda: (k: number, z: number) => number }[] = [
    { nombre: 'barlovento', cirsoc: '+0,8 (qz)', celda: (k, z) => idx(x0 - 1, y0 + k, z) },
    { nombre: 'lateral derecha', cirsoc: '−0,7', celda: (k, z) => idx(x0 + k, y0 - 1, z) },
    { nombre: 'sotavento', cirsoc: '−0,5', celda: (k, z) => idx(x0 + a, y0 + a - 1 - k, z) },
    { nombre: 'lateral izquierda', cirsoc: '−0,7', celda: (k, z) => idx(x0 + a - 1 - k, y0 + a, z) },
  ];
  let xo = 10;
  const res: string[] = [];
  defs.forEach(d => {
    let s = 0, n = 0;
    for (let z = 1; z <= hT; z++) for (let k = 0; k < a; k++) {
      const cp = cpDe(cm.r[d.celda(k, z)]); s += cp; n++;
      g.fillStyle = `rgb(${colCp(cp).map(Math.round).join(',')})`; g.fillRect(xo + k * esc, 20 + (hT - z) * esc, esc, esc);
    }
    g.strokeStyle = '#5f6b76'; g.strokeRect(xo, 20, a * esc, hT * esc);
    g.fillStyle = '#1f2328'; g.fillText(d.nombre, xo, 14);
    const prom = s / n; res.push(`${d.nombre}: ${prom.toFixed(2).replace('.', ',')} (CIRSOC ${d.cirsoc})`);
    g.fillText(`Cp medio ${prom.toFixed(2).replace('.', ',')}`, xo, 20 + hT * esc + 16);
    g.fillStyle = '#5f6b76'; g.fillText(`CIRSOC ${d.cirsoc}`, xo, 20 + hT * esc + 32);
    xo += a * esc + gap;
  });
  // cubierta (vista desde arriba, el viento de izquierda a derecha)
  let s = 0;
  for (let k = 0; k < a; k++) for (let j = 0; j < a; j++) { const cp = cpDe(cm.r[idx(x0 + k, y0 + j, hT + 1)]); s += cp; g.fillStyle = `rgb(${colCp(cp).map(Math.round).join(',')})`; g.fillRect(xo + k * esc, 20 + (a - 1 - j) * esc, esc, esc); }
  g.strokeStyle = '#5f6b76'; g.strokeRect(xo, 20, a * esc, a * esc); g.fillStyle = '#1f2328'; g.fillText('cubierta', xo, 14);
  g.fillText(`Cp medio ${(s / a / a).toFixed(2).replace('.', ',')}`, xo, 20 + a * esc + 16);
  res.push(`cubierta: ${(s / a / a).toFixed(2).replace('.', ',')}`);
  figura(`Cp sobre las caras de la torre (paso ${pasos}; promedio de un instante, no en el tiempo; con qh de la altura de la torre) · ${res.join(' · ')}`, cv, LEY_CP);
}

/** vista 3D: la torre con su Cp, el suelo, el corte horizontal y líneas de corriente */
function vista3d(cm: Campo, pasos: number, desde: 'sotavento' | 'barlovento') {
  const W = 1100, H = 620;
  const ren = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); ren.setSize(W, H); ren.setPixelRatio(1);
  const esc = new THREE.Scene(); esc.background = new THREE.Color(0xffffff);
  const cam = new THREE.PerspectiveCamera(35, W / H, 1, 2000);
  if (desde === 'sotavento') { cam.position.set(nx * 0.05, nz * 2.2, ny * 2.3); cam.lookAt(nx * 0.5, 0, 0); }
  else { cam.position.set(x0 - nx * 0.55, nz * 1.15, ny * 1.25); cam.lookAt(x0 + a, hT * 0.35, 0); }
  esc.add(new THREE.HemisphereLight(0xffffff, 0x99aabb, 1.6)); const sol = new THREE.DirectionalLight(0xffffff, 1.1); sol.position.set(-40, 80, 60); esc.add(sol);
  // coordenadas: x de la red → x; z (altura) → y; y de la red → −z (centrado)
  const P3 = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -(y - ny / 2));
  // suelo
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(nx, ny), new THREE.MeshStandardMaterial({ color: 0xeef0f2 }));
  suelo.rotation.x = -Math.PI / 2; suelo.position.set(nx / 2, 0, 0); esc.add(suelo);
  // torre: cada celda de cara con su Cp
  const pos: number[] = [], col: number[] = [];
  const quad = (p: THREE.Vector3[], c: number[]) => { [0, 1, 2, 0, 2, 3].forEach(k => { pos.push(p[k].x, p[k].y, p[k].z); col.push(c[0] / 255, c[1] / 255, c[2] / 255); }); };
  for (let z = 1; z <= hT; z++) for (let k = 0; k < a; k++) {
    const zz = z - 1;
    quad([P3(x0, y0 + k, zz), P3(x0, y0 + k + 1, zz), P3(x0, y0 + k + 1, zz + 1), P3(x0, y0 + k, zz + 1)], colCp(cpDe(cm.r[idx(x0 - 1, y0 + k, z)])));
    quad([P3(x0 + a, y0 + k, zz), P3(x0 + a, y0 + k + 1, zz), P3(x0 + a, y0 + k + 1, zz + 1), P3(x0 + a, y0 + k, zz + 1)], colCp(cpDe(cm.r[idx(x0 + a, y0 + k, z)])));
    quad([P3(x0 + k, y0, zz), P3(x0 + k + 1, y0, zz), P3(x0 + k + 1, y0, zz + 1), P3(x0 + k, y0, zz + 1)], colCp(cpDe(cm.r[idx(x0 + k, y0 - 1, z)])));
    quad([P3(x0 + k, y0 + a, zz), P3(x0 + k + 1, y0 + a, zz), P3(x0 + k + 1, y0 + a, zz + 1), P3(x0 + k, y0 + a, zz + 1)], colCp(cpDe(cm.r[idx(x0 + k, y0 + a, z)])));
  }
  for (let k = 0; k < a; k++) for (let j = 0; j < a; j++) quad([P3(x0 + k, y0 + j, hT), P3(x0 + k + 1, y0 + j, hT), P3(x0 + k + 1, y0 + j + 1, hT), P3(x0 + k, y0 + j + 1, hT)], colCp(cpDe(cm.r[idx(x0 + k, y0 + j, hT + 1)])));
  const gt = new THREE.BufferGeometry(); gt.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gt.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); gt.computeVertexNormals();
  esc.add(new THREE.Mesh(gt, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 })));
  // corte horizontal a 0,25 de la altura (velocidad), semitransparente
  const zc = Math.round(hT * 0.25), tex = document.createElement('canvas'); tex.width = nx; tex.height = ny;
  const tg = tex.getContext('2d')!, img = tg.createImageData(nx, ny);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { const c = idx(x, y, zc), k = 4 * ((ny - 1 - y) * nx + x), cc = solido[c] ? solidoC : colVel(Math.hypot(cm.u[c], cm.v[c], cm.w[c])); img.data[k] = cc[0]; img.data[k + 1] = cc[1]; img.data[k + 2] = cc[2]; img.data[k + 3] = 255; }
  tg.putImageData(img, 0, 0);
  const plano = new THREE.Mesh(new THREE.PlaneGeometry(nx, ny), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(tex), transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  plano.rotation.x = -Math.PI / 2; plano.position.set(nx / 2, zc + 0.5, 0); esc.add(plano);
  // líneas de corriente: sembradas antes de la torre, integradas con el campo (RK2, interpolación trilineal)
  const vel = (x: number, y: number, z: number): [number, number, number] | null => {
    if (x < 0 || x >= nx - 1 || z < 1 || z >= nz - 1) return null;
    y = ((y % ny) + ny) % ny;
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k, j1 = (j + 1) % ny;
    let su = 0, sv = 0, sw = 0;
    for (const [ii, wx] of [[i, 1 - fx], [i + 1, fx]] as const) for (const [jj, wy] of [[j, 1 - fy], [j1, fy]] as const) for (const [kk, wz] of [[k, 1 - fz], [k + 1, fz]] as const) {
      const c = idx(ii, jj, kk), ww = wx * wy * wz; if (solido[c]) continue;
      su += ww * cm.u[c]; sv += ww * cm.v[c]; sw += ww * cm.w[c];
    }
    return [su, sv, sw];
  };
  const matL = new THREE.LineBasicMaterial({ color: 0x1d6f57 });
  for (const zs of [hT * 0.2, hT * 0.5, hT * 0.8, hT * 1.1]) for (let dy = -a * 0.9; dy <= a * 0.9 + 1e-9; dy += a * 0.3) {
    let p = [x0 - a * 1.2, ny / 2 + dy, zs]; const pts = [P3(p[0], p[1], p[2])];
    for (let s = 0; s < 900; s++) {
      const v1 = vel(p[0], p[1], p[2]); if (!v1) break;
      const m = Math.hypot(...v1); if (m < 1e-5) break;
      const h = 0.5 / m, mid = [p[0] + 0.5 * h * v1[0], p[1] + 0.5 * h * v1[1], p[2] + 0.5 * h * v1[2]];
      const v2 = vel(mid[0], mid[1], mid[2]); if (!v2) break;
      p = [p[0] + h * v2[0], p[1] + h * v2[1], p[2] + h * v2[2]];
      if (s % 2 === 0) pts.push(P3(p[0], p[1], p[2]));
    }
    esc.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), matL));
  }
  ren.render(esc, cam);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d')!.drawImage(ren.domElement, 0, 0);
  figura(`Vista 3D desde ${desde} (paso ${pasos}): la torre con su Cp (azul empuje, rojo succión), el corte horizontal a ${zc} celdas de altura (velocidad) y líneas de corriente sembradas antes de la torre`, cv, `${LEY_CP} · líneas de corriente en verde oscuro`);
}

async function main() {
  const gpuNombre = await hayWebGpu();
  const motor = gpuNombre ? await crearLbm3dGpu(opciones) : null;
  const cpu = motor ? null : new Lbm3D(opciones);
  let hechos = 0;
  const t0 = performance.now();
  for (const meta of paradas) {
    while (hechos < meta) {
      const n = Math.min(100, meta - hechos);
      if (motor) { motor.avanzar(n); await motor.esperar(); } else for (let k = 0; k < n; k++) cpu!.paso();
      hechos += n;
      estado.textContent = `calculando… paso ${hechos} de ${paradas[paradas.length - 1]} (${motor ? 'WebGPU: ' + motor.adaptador : 'JavaScript'})`;
    }
    const cm = macros(motor ? await motor.leer() : cpu!.f);
    corte(cm, nx, ny, (i, j) => idx(i, j, Math.round(hT * 0.6)), c => [cm.u[c], cm.v[c]], 6, `Planta: corte horizontal a 0,6 de la altura de la torre, paso ${hechos} (el viento entra por la izquierda)`);
    corte(cm, nx, nz, (i, j) => idx(i, Math.round(y0 + (a - 1) / 2), j), c => [cm.u[c], cm.w[c]], 6, `Alzado: corte vertical por el eje de la torre, paso ${hechos}: el aire baja por la cara de barlovento, pasa por arriba y vuelve detrás`);
    if (meta === paradas[paradas.length - 1]) { caras(cm, hechos); vista3d(cm, hechos, 'barlovento'); vista3d(cm, hechos, 'sotavento'); }
  }
  estado.textContent = `Listo: ${hechos} pasos en ${((performance.now() - t0) / 1000).toFixed(0)} s con ${motor ? 'WebGPU (' + motor.adaptador + ')' : 'JavaScript'} · grilla ${nx} × ${ny} × ${nz} (${(N / 1e6).toFixed(2)} millones de celdas) · torre de ${a} × ${a} × ${hT} celdas · perfil de viento de la ley potencial (α = 0,2) · Reynolds de la red ≈ 3000 con Smagorinsky.`;
  document.body.dataset.listo = '1';
  motor?.destruir();
}
main().catch(e => { estado.textContent = 'Error: ' + (e?.message ?? e); document.body.dataset.listo = '1'; });
