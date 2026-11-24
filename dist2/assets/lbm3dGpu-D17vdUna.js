import{bf as ee,bg as re,bh as ie,bi as ae,bj as te,bk as ne,bl as oe}from"./index-CzhjONoD.js";const y=(t,l)=>`array<${l}, 19>(${t.map(n=>l==="f32"?n.toPrecision(17):String(n)).join(", ")})`,ue=`
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

var<private> EX: array<i32, 19> = ${y(re,"i32")};
var<private> EY: array<i32, 19> = ${y(ie,"i32")};
var<private> EZ: array<i32, 19> = ${y(ae,"i32")};
var<private> W: array<f32, 19> = ${y(te,"f32")};
var<private> OPP: array<u32, 19> = ${y(ne,"u32")};
var<private> ESP: array<u32, 19> = ${y(oe,"u32")};

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
    // rebote: a mitad de camino, o con la pared exacta (Bouzidi lineal)
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
    // Bouzidi lineal (la cuadrática se vuelve inestable con viscosidad de red muy baja; ver lbm3d, paredesLineales)
    let fo2 = fi[io * n + u32(c2)];
    if (q < 0.5) { v[i] = 2.0 * q * fo + (1.0 - 2.0 * q) * fo2; } else { v[i] = fo / (2.0 * q) + ((2.0 * q - 1.0) / (2.0 * q)) * fic; }
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
  let omm = max(1.5, 1.0 / (0.1875 / (tau - 0.5) + 0.5));   // piso de ω− (OMEGA_MENOS_MIN de lbm2d: ruido a Reynolds alto)
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
`;async function le(){var l,n,u,s,f,c;const t=navigator.gpu;if(!t)return null;try{const o=await t.requestAdapter();return o?`${(n=(l=o.info)==null?void 0:l.vendor)!=null?n:""} ${(s=(u=o.info)==null?void 0:u.architecture)!=null?s:""} ${(c=(f=o.info)==null?void 0:f.description)!=null?c:""}`.trim()||"placa de video":null}catch{return null}}async function de(t){var T,$,Y,R,W,D,L,X,Z;const l=navigator.gpu;if(!l)throw new Error("Este navegador no tiene WebGPU.");const n=await l.requestAdapter({powerPreference:"high-performance"});if(!n)throw new Error("No hay una placa de video disponible para WebGPU.");const{nx:u,ny:s,nz:f}=t,c=u*s*f,o=19*c*4;if(o>n.limits.maxStorageBufferBindingSize||o>n.limits.maxBufferSize)throw new Error(`La grilla necesita ${(o/2**20).toFixed(0)} MB por copia y la placa admite ${(n.limits.maxStorageBufferBindingSize/2**20).toFixed(0)} MB.`);const e=await n.requestDevice({requiredLimits:{maxStorageBufferBindingSize:Math.max(o,134217728),maxBufferSize:Math.max(o,268435456)}}),F=`${($=(T=n.info)==null?void 0:T.vendor)!=null?$:""} ${(R=(Y=n.info)==null?void 0:Y.architecture)!=null?R:""} ${(D=(W=n.info)==null?void 0:W.description)!=null?D:""}`.trim()||"placa de video",b=e.createShaderModule({code:ue}),j=(await b.getCompilationInfo()).messages.filter(r=>r.type==="error");if(j.length)throw new Error("WGSL: "+j.map(r=>`${r.lineNum}:${r.linePos} ${r.message}`).join(" · "));const C=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST,x=new Float32Array(19*c);ee(x,u,s,f,t.uIn,t.solido,t.perturbacion);const g=e.createBuffer({size:o,usage:C}),v=e.createBuffer({size:o,usage:C});e.queue.writeBuffer(g,0,x),e.queue.writeBuffer(v,0,x);const m=e.createBuffer({size:4*c,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),O=Uint32Array.from(t.solido),k=(X=(L=t.paredes)==null?void 0:L.celdas.length)!=null?X:0,z=new Uint32Array(Math.max(5,5*k));for(let r=0;r<k;r++){O[t.paredes.celdas[r]]=2+r;for(let i=0;i<19;i++)z[r*5+(i>>2)]|=t.paredes.q[r*19+i]<<8*(i&3)}e.queue.writeBuffer(m,0,O);const P=e.createBuffer({size:4*z.length,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(P,0,z);const q=e.createBuffer({size:4*f,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(q,0,t.uIn);const E=e.createBuffer({size:16*u*s,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),U=e.createBuffer({size:16*c,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),B=e.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),N=3*t.nu+.5,I=((Z=t.cs)!=null?Z:0)**2,M=r=>{const i=new ArrayBuffer(32),a=new Uint32Array(i),d=new Float32Array(i);a[0]=u,a[1]=s,a[2]=f,a[3]=c,d[4]=N,d[5]=I,a[6]=r,a[7]=t.colision==="trt"?1:0,e.queue.writeBuffer(B,0,i)};M(1);const _=e.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:6,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:7,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}}]}),S=e.createPipelineLayout({bindGroupLayouts:[_]}),Q=e.createComputePipeline({layout:S,compute:{module:b,entryPoint:"paso"}}),H=e.createComputePipeline({layout:S,compute:{module:b,entryPoint:"corte"}}),J=e.createComputePipeline({layout:S,compute:{module:b,entryPoint:"campoEntero"}}),A=(r,i)=>e.createBindGroup({layout:_,entries:[{binding:0,resource:{buffer:B}},{binding:1,resource:{buffer:r}},{binding:2,resource:{buffer:i}},{binding:3,resource:{buffer:m}},{binding:4,resource:{buffer:q}},{binding:5,resource:{buffer:E}},{binding:6,resource:{buffer:U}},{binding:7,resource:{buffer:P}}]}),G=A(g,v),h=A(v,g);let p=0;const K=()=>p%2===0?g:v,w=async(r,i)=>{const a=e.createBuffer({size:i,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),d=e.createCommandEncoder();d.copyBufferToBuffer(r,0,a,0,i),e.queue.submit([d.finish()]),await a.mapAsync(GPUMapMode.READ);const V=new Float32Array(a.getMappedRange().slice(0));return a.unmap(),a.destroy(),V};return{nx:u,ny:s,nz:f,N:c,adaptador:F,get pasos(){return p},avanzar(r){const i=e.createCommandEncoder(),a=i.beginComputePass();a.setPipeline(Q);for(let d=0;d<r;d++)a.setBindGroup(0,p%2===0?G:h),a.dispatchWorkgroups(Math.ceil(u/64),s,f),p++;a.end(),e.queue.submit([i.finish()])},esperar:()=>e.queue.onSubmittedWorkDone(),leer:()=>w(K(),o),async corte(r){M(Math.max(0,Math.min(f-1,Math.round(r))));const i=e.createCommandEncoder(),a=i.beginComputePass();return a.setPipeline(H),a.setBindGroup(0,p%2===0?G:h),a.dispatchWorkgroups(Math.ceil(u/64),s,1),a.end(),e.queue.submit([i.finish()]),w(E,16*u*s)},async campo(){const r=e.createCommandEncoder(),i=r.beginComputePass();return i.setPipeline(J),i.setBindGroup(0,p%2===0?G:h),i.dispatchWorkgroups(Math.ceil(u/64),s,f),i.end(),e.queue.submit([r.finish()]),w(U,16*c)},mlups:0,destruir(){[g,v,m,q,E,B,U,P].forEach(r=>r.destroy()),e.destroy()}}}export{de as crearLbm3dGpu,le as hayWebGpu};
