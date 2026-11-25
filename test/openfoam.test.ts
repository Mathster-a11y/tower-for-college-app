import { describe, expect, it } from 'vitest';
import { casoOpenFOAM } from '../src/viento/openfoam';

describe('caso de OpenFOAM', () => {
  const torre = [{ x: -10, y: -8 }, { x: 10, y: -8 }, { x: 10, y: 8 }, { x: -10, y: 8 }];
  const caso = (dir: 'A' | 'B') => casoOpenFOAM({ nombre: 'prueba', niveles: [0, 20, 40, 60].map(c => ({ cota: c, silueta: torre })), dir, angulo: 0,
    vecinos: [{ id: 'E1', tramos: [{ desde: 0, hasta: 12, v: [{ x: 30, y: -15 }, { x: 60, y: -15 }, { x: 60, y: 15 }, { x: 30, y: 15 }] }, { desde: 12, hasta: 40, v: [{ x: 38, y: -8 }, { x: 52, y: -8 }, { x: 52, y: 8 }, { x: 38, y: 8 }] }] }],
    Uref: 40, z0: 0.3 });
  it('trae todos los archivos para correr (malla, física, numérica, scripts y STL)', () => {
    const f = caso('A');
    for (const k of ['system/blockMeshDict', 'system/snappyHexMeshDict', 'system/surfaceFeatureExtractDict', 'system/controlDict', 'system/fvSchemes', 'system/fvSolution',
      'constant/transportProperties', 'constant/turbulenceProperties', '0/U', '0/p', '0/k', '0/epsilon', '0/nut', 'Allrun', 'LEAME.txt', 'calcular_cd.py',
      'constant/triSurface/torre.stl', 'constant/triSurface/vecino_E1.stl']) expect(f.has(k), k).toBe(true);
    // cada superficie tiene su condición de pared en cada campo
    for (const c of ['0/U', '0/p', '0/k', '0/epsilon', '0/nut']) for (const s of ['torre', 'vecino_E1', 'entrada', 'salida', 'suelo', 'techo', 'costados']) expect(f.get(c) as string, `${c} ${s}`).toContain(`    ${s}\n`);
    expect(f.get('0/U') as string).toContain('atmBoundaryLayerInletVelocity');
    expect(f.get('calcular_cd.py') as string).not.toContain('__U__');
  });
  it('el viento sopla en +x: con el viento A, el ancho que enfrenta es el de la planta en x (20 m)', () => {
    expect(caso('A').get('system/controlDict') as string).toContain('Aref            1200;');   // 20 × 60
    expect(caso('B').get('system/controlDict') as string).toContain('Aref            960;');    // 16 × 60
  });
});
