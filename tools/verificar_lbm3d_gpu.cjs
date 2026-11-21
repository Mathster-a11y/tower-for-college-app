// Verifica el D3Q19 en WebGPU (src/viento/lbm3dGpu.ts) contra la referencia en JavaScript (src/viento/lbm3d.ts), en
// Chromium con WebGPU por software (SwiftShader). Uso: npx vite --port 5179  y en otra terminal:
//   node tools/verificar_lbm3d_gpu.cjs
// Imprime la peor diferencia de las poblaciones después de N pasos (tiene que ser < 1e-4, la precisión de f32).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader'] });
  const pg = await b.newPage();
  await pg.goto(`http://localhost:${process.env.PUERTO || 5179}/tools/gpu/`);
  await pg.waitForFunction(() => document.getElementById('r').textContent !== 'calculando…', null, { timeout: 300000 });
  const r = JSON.parse(await pg.locator('#r').innerText());
  console.log(JSON.stringify(r, null, 1));
  await b.close();
  process.exit(r.ok ? 0 : 1);
})();
