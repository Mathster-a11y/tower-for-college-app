/**
 * Simulador de viento, prototipo de la etapa V3: Lattice Boltzmann D3Q19 en la placa de video (WebGPU). Hace lo mismo
 * que la referencia en JavaScript (lbm3d.ts), en el mismo orden: un paso por despacho, tirando de los vecinos, con
 * rebote en los sólidos, tapa deslizante, salida que copia la celda de atrás y entrada con el perfil uIn(z).
 * Las poblaciones van en f32 (19 × 4 bytes por celda, dos copias).
 */
import { EX3, EY3, EZ3, W19, OPP3, ESP3, inicial3, type OpcionesLbm3 } from './lbm3d';

const lista = (a: number[], t: string) => `array<${t}, 19>(${a.map(x => (t === 'f32' ? x.toPrecision(17) : String(x))).join(', ')})`;

const WGSL = /* wgsl */ `
struct Param { nx: u32, ny: u32, nz: u32, n: u32, tau0: f32, cs2: f32, zc: u32, trt: u32 };
@group(0) @binding(0) var<uniform> p: Param;
@group(0) @binding(1) var<storage, read> fi: array<f32>;
@group(0) @binding(2) var<storage, read_write> fo: array<f32>;
@group(0) @binding(3) var<storage, read> sol: array<u32>;
@group(0) @binding(4) var<storage, read> uin: array<f32>;
@group(0) @binding(5) var<storage, read_write> vel: array<f32>;
@group(0) @binding(6) var<storage, read_write> todo: array<f32>;
// paredes exactas: 19 bytes de q por celda de aire que toca una pared (5 u32 por fila); sol = 2 + fila en esas celdas
@group(0) @binding(7) var<storage, read> qtab: array<u32>;

var<private> EX: array<i32, 19> = ${lista(EX3, 'i32')};
var<private> EY: array<i32, 19> = ${lista(EY3, 'i32')};
var<private> EZ: array<i32, 19> = ${lista(EZ3, 'i32')};
var<private> W: array<f32, 19> = ${lista(W19, 'f32')};
var<private> OPP: array<u32, 19> = ${lista(OPP3, 'u32')};
var<private> ESP: array<u32, 19> = ${lista(ESP3, 'u32')};

// índice de la celda (x, y, z) si es aire y está en el dominio (y periódico); −1 si no
fn aire(x: i32, y: i32, z: i32) -> i32 {
  if (x < 0 || x >= i32(p.nx) || z < 0 || z >= i32(p.nz)) { return -1; }
  var yy = y % i32(p.ny); if (yy < 0) { yy += i32(p.ny); }
  let c = (u32(z) * p.ny + u32(yy)) * p.nx + u32(x);
  if (sol[c] == 1u) { return -1; }
  return i32(c);
}

fn feq(i: u32, r: f32, u: f32, v: f32, w: f32) -> f32 {
  let eu = f32(EX[i]) * u + f32(EY[i]) * v + f32(EZ[i]) * w;
  return W[i] * r * (1.0 + 3.0 * eu + 4.5 * eu * eu - 1.5 * (u * u + v * v + w * w));
}

@compute @workgroup_size(64, 1, 1)
fn paso(@builtin(global_invocation_id) g: vec3<u32>) {
  let x = g.x; let y = g.y; let z = g.z;
  if (x >= p.nx || y >= p.ny || z >= p.nz) { return; }
  let n = p.n;
  let c = (z * p.ny + y) * p.nx + x;
  if (sol[c] == 1u) { return; }
  if (x == 0u) {
    let u = uin[z];
    for (var i = 0u; i < 19u; i++) { fo[i * n + c] = feq(i, 1.0, u, 0.0, 0.0); }
    return;
  }
  var v: array<f32, 19>;
  for (var i = 0u; i < 19u; i++) {
    let sx = i32(x) - EX[i];
    let sz = i32(z) - EZ[i];
    var sy = i32(y) - EY[i];
    if (sy < 0) { sy += i32(p.ny); } else if (sy >= i32(p.ny)) { sy -= i32(p.ny); }
    if (sz >= i32(p.nz) || sz < 0) { v[i] = fi[ESP[i] * n + c]; continue; }
    var sxx = sx;
    if (sx >= i32(p.nx)) { sxx = i32(p.nx) - 2; }
    let s = (u32(sz) * p.ny + u32(sy)) * p.nx + u32(sxx);
    if (sol[s] != 1u) { v[i] = fi[i * n + s]; continue; }
    // rebote: a mitad de camino, o con la pared exacta (Bouzidi cuadrático; lineal si falta aire detrás)
    let io = OPP[i]; let fo = fi[io * n + c];
    var qb = 0u;
    if (sol[c] >= 2u) { let k = sol[c] - 2u; qb = (qtab[k * 5u + i / 4u] >> (8u * (i % 4u))) & 255u; }
    if (qb == 0u) { v[i] = fo; continue; }
    let q = f32(qb) / 255.0;
    let fic = fi[i * n + c];
    let c2 = aire(i32(x) + EX[i], i32(y) + EY[i], i32(z) + EZ[i]);
    if (c2 < 0) {
      if (q < 0.5) { v[i] = fo; } else { v[i] = fo / (2.0 * q) + ((2.0 * q - 1.0) / (2.0 * q)) * fic; }
      continue;
    }
    let fo2 = fi[io * n + u32(c2)];
    let c3 = aire(i32(x) + 2 * EX[i], i32(y) + 2 * EY[i], i32(z) + 2 * EZ[i]);
    if (c3 < 0) {
      if (q < 0.5) { v[i] = 2.0 * q * fo + (1.0 - 2.0 * q) * fo2; } else { v[i] = fo / (2.0 * q) + ((2.0 * q - 1.0) / (2.0 * q)) * fic; }
      continue;
    }
    if (q < 0.5) {
      v[i] = q * (1.0 + 2.0 * q) * fo + (1.0 - 4.0 * q * q) * fo2 - q * (1.0 - 2.0 * q) * fi[io * n + u32(c3)];
    } else {
      v[i] = fo / (q * (2.0 * q + 1.0)) + ((2.0 * q - 1.0) / q) * fic + ((1.0 - 2.0 * q) / (1.0 + 2.0 * q)) * fi[i * n + u32(c2)];
    }
  }
  var r = 0.0; var jx = 0.0; var jy = 0.0; var jz = 0.0;
  for (var i = 0u; i < 19u; i++) { r += v[i]; jx += v[i] * f32(EX[i]); jy += v[i] * f32(EY[i]); jz += v[i] * f32(EZ[i]); }
  let u = jx / r; let vv = jy / r; let w = jz / r;
  var eq: array<f32, 19>;
  for (var i = 0u; i < 19u; i++) { eq[i] = feq(i, r, u, vv, w); }
  var tau = p.tau0;
  if (p.cs2 > 0.0) {
    var xx = 0.0; var yy = 0.0; var zz = 0.0; var xy = 0.0; var xz = 0.0; var yz = 0.0;
    for (var i = 1u; i < 19u; i++) {
      let d = v[i] - eq[i]; let ex = f32(EX[i]); let ey = f32(EY[i]); let ez = f32(EZ[i]);
      xx += ex * ex * d; yy += ey * ey * d; zz += ez * ez * d; xy += ex * ey * d; xz += ex * ez * d; yz += ey * ez * d;
    }
    let Q = sqrt(2.0 * (xx * xx + yy * yy + zz * zz + 2.0 * (xy * xy + xz * xz + yz * yz)));
    tau = 0.5 * (p.tau0 + sqrt(p.tau0 * p.tau0 + 18.0 * p.cs2 * Q / r));
  }
  let om = 1.0 / tau;
  if (p.trt == 0u) {
    for (var i = 0u; i < 19u; i++) { fo[i * n + c] = v[i] + om * (eq[i] - v[i]); }
    return;
  }
  // TRT (Λ = 3/16): simétrica con ω+, antisimétrica con ω−
  let omm = 1.0 / (0.1875 / (tau - 0.5) + 0.5);
  for (var i = 0u; i < 19u; i++) {
    let o = OPP[i];
    let sp = 0.5 * ((v[i] + v[o]) - (eq[i] + eq[o]));
    let sm = 0.5 * ((v[i] - v[o]) - (eq[i] - eq[o]));
    fo[i * n + c] = v[i] - om * sp - omm * sm;
  }
}

// el campo entero: (u, v, w, ρ) de cada celda; ρ = 0 en los sólidos
@compute @workgroup_size(64, 1, 1)
fn campoEntero(@builtin(global_invocation_id) g: vec3<u32>) {
  let x = g.x; let y = g.y; let z = g.z;
  if (x >= p.nx || y >= p.ny || z >= p.nz) { return; }
  let n = p.n;
  let c = (z * p.ny + y) * p.nx + x;
  let k = c * 4u;
  if (sol[c] == 1u) { todo[k] = 0.0; todo[k + 1u] = 0.0; todo[k + 2u] = 0.0; todo[k + 3u] = 0.0; return; }
  var r = 0.0; var jx = 0.0; var jy = 0.0; var jz = 0.0;
  for (var i = 0u; i < 19u; i++) { let q = fi[i * n + c]; r += q; jx += q * f32(EX[i]); jy += q * f32(EY[i]); jz += q * f32(EZ[i]); }
  todo[k] = jx / r; todo[k + 1u] = jy / r; todo[k + 2u] = jz / r; todo[k + 3u] = r;
}

// el corte horizontal en z = p.zc: (u, v, w, ρ) de cada celda; ρ = 0 en los sólidos
@compute @workgroup_size(64, 1, 1)
fn corte(@builtin(global_invocation_id) g: vec3<u32>) {
  let x = g.x; let y = g.y;
  if (x >= p.nx || y >= p.ny) { return; }
  let n = p.n;
  let c = (p.zc * p.ny + y) * p.nx + x;
  let k = (y * p.nx + x) * 4u;
  if (sol[c] == 1u) { vel[k] = 0.0; vel[k + 1u] = 0.0; vel[k + 2u] = 0.0; vel[k + 3u] = 0.0; return; }
  var r = 0.0; var jx = 0.0; var jy = 0.0; var jz = 0.0;
  for (var i = 0u; i < 19u; i++) { let q = fi[i * n + c]; r += q; jx += q * f32(EX[i]); jy += q * f32(EY[i]); jz += q * f32(EZ[i]); }
  vel[k] = jx / r; vel[k + 1u] = jy / r; vel[k + 2u] = jz / r; vel[k + 3u] = r;
}
`;

export interface Lbm3dGpu {
  nx: number; ny: number; nz: number; N: number; pasos: number;
  /** avanza n pasos (todos en la placa, sin esperar) */
  avanzar(n: number): void;
  /** espera a que la placa termine lo pedido */
  esperar(): Promise<void>;
  /** las poblaciones (para comparar con la referencia; solo en grillas chicas) */
  leer(): Promise<Float32Array>;
  /** el corte horizontal en z: (u, v, w, ρ) por celda */
  corte(z: number): Promise<Float32Array>;
  /** el campo entero: (u, v, w, ρ) por celda (ρ = 0 en los sólidos) */
  campo(): Promise<Float32Array>;
  /** millones de celdas por segundo de los últimos pasos (medido) */
  mlups: number;
  destruir(): void;
  adaptador: string;
}

/** ¿hay WebGPU en este navegador? (null: no hay; si no, el nombre del adaptador) */
export async function hayWebGpu(): Promise<string | null> {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) return null;
  try { const a = await gpu.requestAdapter(); return a ? `${a.info?.vendor ?? ''} ${a.info?.architecture ?? ''} ${a.info?.description ?? ''}`.trim() || 'placa de video' : null; } catch { return null; }
}

export async function crearLbm3dGpu(o: OpcionesLbm3): Promise<Lbm3dGpu> {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) throw new Error('Este navegador no tiene WebGPU.');
  const ad = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!ad) throw new Error('No hay una placa de video disponible para WebGPU.');
  const { nx, ny, nz } = o, N = nx * ny * nz, bytes = 19 * N * 4;
  if (bytes > ad.limits.maxStorageBufferBindingSize || bytes > ad.limits.maxBufferSize) throw new Error(`La grilla necesita ${(bytes / 2 ** 20).toFixed(0)} MB por copia y la placa admite ${(ad.limits.maxStorageBufferBindingSize / 2 ** 20).toFixed(0)} MB.`);
  const dev = await ad.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: Math.max(bytes, 134217728), maxBufferSize: Math.max(bytes, 268435456) } });
  const nombre = `${ad.info?.vendor ?? ''} ${ad.info?.architecture ?? ''} ${ad.info?.description ?? ''}`.trim() || 'placa de video';
  const mod = dev.createShaderModule({ code: WGSL });
  const info = await mod.getCompilationInfo();
  const errores = info.messages.filter(m => m.type === 'error');
  if (errores.length) throw new Error('WGSL: ' + errores.map(m => `${m.lineNum}:${m.linePos} ${m.message}`).join(' · '));
  const usoF = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
  const f0 = new Float32Array(19 * N);
  inicial3(f0, nx, ny, nz, o.uIn, o.solido);
  const bA = dev.createBuffer({ size: bytes, usage: usoF }), bB = dev.createBuffer({ size: bytes, usage: usoF });
  dev.queue.writeBuffer(bA, 0, f0); dev.queue.writeBuffer(bB, 0, f0);
  const sol = dev.createBuffer({ size: 4 * N, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  // sol: 0 aire, 1 sólido, 2 + fila de la tabla de paredes exactas
  const sol32 = Uint32Array.from(o.solido), nP = o.paredes?.celdas.length ?? 0, qtab32 = new Uint32Array(Math.max(5, 5 * nP));
  for (let k = 0; k < nP; k++) {
    sol32[o.paredes!.celdas[k]] = 2 + k;
    for (let i = 0; i < 19; i++) qtab32[k * 5 + (i >> 2)] |= o.paredes!.q[k * 19 + i] << (8 * (i & 3));
  }
  dev.queue.writeBuffer(sol, 0, sol32);
  const qtab = dev.createBuffer({ size: 4 * qtab32.length, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  dev.queue.writeBuffer(qtab, 0, qtab32);
  const uin = dev.createBuffer({ size: 4 * nz, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  dev.queue.writeBuffer(uin, 0, o.uIn);
  const vel = dev.createBuffer({ size: 16 * nx * ny, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const todo = dev.createBuffer({ size: 16 * N, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const par = dev.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const tau0 = 3 * o.nu + 0.5, cs2 = (o.cs ?? 0) ** 2;
  const escribirPar = (zc: number) => { const ab = new ArrayBuffer(32), u = new Uint32Array(ab), f = new Float32Array(ab); u[0] = nx; u[1] = ny; u[2] = nz; u[3] = N; f[4] = tau0; f[5] = cs2; u[6] = zc; u[7] = o.colision === 'trt' ? 1 : 0; dev.queue.writeBuffer(par, 0, ab); };
  escribirPar(1);
  const bgl = dev.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
  ] });
  const layout = dev.createPipelineLayout({ bindGroupLayouts: [bgl] });
  const pPaso = dev.createComputePipeline({ layout, compute: { module: mod, entryPoint: 'paso' } });
  const pCorte = dev.createComputePipeline({ layout, compute: { module: mod, entryPoint: 'corte' } });
  const pMacro = dev.createComputePipeline({ layout, compute: { module: mod, entryPoint: 'campoEntero' } });
  const grupo = (a: GPUBuffer, b: GPUBuffer) => dev.createBindGroup({ layout: bgl, entries: [
    { binding: 0, resource: { buffer: par } }, { binding: 1, resource: { buffer: a } }, { binding: 2, resource: { buffer: b } },
    { binding: 3, resource: { buffer: sol } }, { binding: 4, resource: { buffer: uin } }, { binding: 5, resource: { buffer: vel } }, { binding: 6, resource: { buffer: todo } }, { binding: 7, resource: { buffer: qtab } }] });
  const gAB = grupo(bA, bB), gBA = grupo(bB, bA);
  let pasos = 0;
  const actual = () => (pasos % 2 === 0 ? bA : bB);                       // donde está el último estado
  const leerBuffer = async (src: GPUBuffer, size: number) => {
    const st = dev.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = dev.createCommandEncoder(); enc.copyBufferToBuffer(src, 0, st, 0, size); dev.queue.submit([enc.finish()]);
    await st.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(st.getMappedRange().slice(0)); st.unmap(); st.destroy();
    return out;
  };
  const gpuObj: Lbm3dGpu = {
    nx, ny, nz, N, adaptador: nombre,
    get pasos() { return pasos; },
    avanzar(k: number) {
      const enc = dev.createCommandEncoder(), pass = enc.beginComputePass();
      pass.setPipeline(pPaso);
      for (let i = 0; i < k; i++) { pass.setBindGroup(0, pasos % 2 === 0 ? gAB : gBA); pass.dispatchWorkgroups(Math.ceil(nx / 64), ny, nz); pasos++; }
      pass.end(); dev.queue.submit([enc.finish()]);
    },
    esperar: () => dev.queue.onSubmittedWorkDone(),
    leer: () => leerBuffer(actual(), bytes),
    async corte(z: number) {
      escribirPar(Math.max(0, Math.min(nz - 1, Math.round(z))));
      const enc = dev.createCommandEncoder(), pass = enc.beginComputePass();
      pass.setPipeline(pCorte); pass.setBindGroup(0, pasos % 2 === 0 ? gAB : gBA);   // corte lee «fi»: el último estado (bA con pasos pares)
      pass.dispatchWorkgroups(Math.ceil(nx / 64), ny, 1); pass.end(); dev.queue.submit([enc.finish()]);
      return leerBuffer(vel, 16 * nx * ny);
    },
    async campo() {
      const enc = dev.createCommandEncoder(), pass = enc.beginComputePass();
      pass.setPipeline(pMacro); pass.setBindGroup(0, pasos % 2 === 0 ? gAB : gBA);
      pass.dispatchWorkgroups(Math.ceil(nx / 64), ny, nz); pass.end(); dev.queue.submit([enc.finish()]);
      return leerBuffer(todo, 16 * N);
    },
    mlups: 0,
    destruir() { [bA, bB, sol, uin, vel, par, todo, qtab].forEach(b => b.destroy()); dev.destroy(); },
  };
  return gpuObj;
}
