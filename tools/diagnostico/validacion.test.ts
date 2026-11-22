/**
 * Validación del túnel 2D contra casos publicados (propuesta 8 del diagnóstico): cilindro circular y prisma cuadrado a
 * Re = 100, con las cuatro combinaciones de paredes (escalera / exactas) y colisión (BGK / TRT). Referencias: cilindro
 * Cd ≈ 1,33–1,36 y St ≈ 0,164–0,165; cuadrado Cd ≈ 1,44–1,47 y St ≈ 0,141–0,146 (con poco bloqueo).
 * Uso: DIAG=1 npx vitest run tools/diagnostico/validacion.test.ts  (≈ 25 min)  → docs/diagnostico_viento/validacion.txt
 */
import { describe, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { Lbm2D } from '../../src/viento/lbm2d';
import { geometria2D } from '../../src/viento/geometria2d';
import { medir } from '../../src/viento/mediciones';
const OUT = new URL('../../docs/diagnostico_viento/validacion.txt', import.meta.url).pathname;
const circulo = Array.from({ length: 128 }, (_, k) => ({ x: Math.cos((k / 128) * 2 * Math.PI), y: Math.sin((k / 128) * 2 * Math.PI) }));
const cuadrado = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
function corrida(nombre: string, pol: { x: number; y: number }[], Re: number, D: number, exactas: boolean, colision: 'bgk' | 'trt', alto = 12) {
  const g = geometria2D({ poligonos: [pol], dir: 'B', D, largo: 20, alto, entrada: 5 });
  const u0 = 0.08, nu = (u0 * g.D) / Re, cs = Re > 300 ? 0.16 : 0;
  const m = new Lbm2D({ nx: g.nx, ny: g.ny, nu, u0, cs, solido: g.solido, q: exactas ? g.q : undefined, colision });
  const pasos = Math.round((120 * g.D) / u0), Fx: number[] = [], Fy: number[] = [];
  for (let k = 0; k < pasos; k++) { m.paso(); if (k > pasos * 0.45) { Fx.push(m.Fx); Fy.push(m.Fy); } }
  const r = medir(Fx, Fy, u0, g.D);
  appendFileSync(OUT, `${nombre} Re ${Re} D ${D} alto ${alto} ${colision} ${exactas ? 'exactas' : 'escalera'}: Cd ${r.Cd.toFixed(3)} Clrms ${r.ClRms.toFixed(3)} St ${r.St?.toFixed(4)} ${m.roto ? 'ROTO' : ''}\n`);
}
describe.skipIf(!process.env.DIAG)('validación del túnel 2D', () => it('cilindro y cuadrado a Re = 100', () => {
  for (const [nombre, pol] of [['círculo', circulo], ['cuadrado', cuadrado]] as const)
    for (const [ex, col] of [[false, 'bgk'], [true, 'bgk'], [false, 'trt'], [true, 'trt']] as const) corrida(nombre, pol, 100, 20, ex, col);
}, 3_600_000));
