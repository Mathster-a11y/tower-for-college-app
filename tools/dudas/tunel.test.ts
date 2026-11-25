/** la torre del Gherkin en el túnel 3D: silueta de las celdas contra el perfil medido (DUDAS=1) */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { ejemploGherkin } from '../../src/engine/ejemplosExo';
import { contornoAlViento, puntosSilueta } from '../../src/engine/silueta';
import { geometria3D } from '../../src/viento/geometria3d';
it.skipIf(!process.env.DUDAS)('túnel', () => {
  const p = ejemploGherkin();
  const niveles = p.niveles.map((n, i) => ({ n, i })).filter(x => x.n.cota >= 0).map(x => ({ cota: x.n.cota, silueta: puntosSilueta(contornoAlViento(p, x.i).v, 12) }));
  const g = geometria3D({ nx: 320, ny: 160, nz: 200, niveles, dir: 'A' } as never);
  const { nx, ny, nz, solido, escala } = g;
  // alzado: ancho de la torre en cada altura (celdas sólidas en x, en la fila del centro)
  const filas: string[] = [];
  const img = Buffer.alloc(nx * nz, 255);
  for (let z = 1; z < nz; z++) {
    let x0 = -1, x1 = -1;
    for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) if (solido[(z * ny + y) * nx + x]) { if (x0 < 0) x0 = x; x1 = x; img[(nz - 1 - z) * nx + x] = 40; break; }
    if (x0 >= 0 && z % 8 === 0) filas.push(`z ${((z - 0.5) / escala).toFixed(1)} m  ancho ${((x1 - x0 + 1) / escala).toFixed(1)} m`);
  }
  writeFileSync(process.env.SALIDA ?? 'tunel.pgm', Buffer.concat([Buffer.from(`P5 ${nx} ${nz} 255\n`), img]));
  console.log(`escala ${escala.toFixed(3)} celdas/m · H ${g.H} · B ${g.B.toFixed(1)}\n` + filas.join('\n'));
});
