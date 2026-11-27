/** Pisos abiertos en los túneles: la plaza del Citicorp se simula con el núcleo y las supercolumnas, no con la losa. */
import { describe, expect, it } from 'vitest';
import { ejemploCiticorpFachada } from './ejemploCiticorpFachada';
import { ejemploCiticorp, ejemploGuia, ejemploAsimetrico } from './modelo';
import { ejemploPlanta34 } from './ejemplo34';
import { ejemploBasicoExo, ejemploGherkin, ejemploHancock, ejemploHearst, ejemploOnterie, ejemploShanghai } from './ejemplosExo';
import { esPisoAbierto, piezasPisoAbierto } from './pisoAbierto';
import { puntosAlViento } from './silueta';
import { geometriaAlzado } from '../viento/geometria2d';
import { geometria3D } from '../viento/geometria3d';
import { tramoEn } from './carpinteria';
import type { Proyecto } from './modelo';

const iPlaza = (p: Proyecto) => p.niveles.findIndex(n => n.nombre.startsWith('PB'));

describe('pisos abiertos en los túneles de viento', () => {
  it('la plaza del Citicorp: el corte en planta da el núcleo y las 4 supercolumnas (20 rectángulos), no la losa', () => {
    const p = ejemploCiticorpFachada(), i = iPlaza(p);
    expect(esPisoAbierto(p, i)).toBe(true);
    const r = piezasPisoAbierto(p, i)!;
    expect(r.pols.length).toBe(20);
    // cada pieza es mucho más chica que la losa (hay aire entre ellas)
    const area = (q: { x: number; y: number }[]) => Math.abs(q.reduce((s, a, k) => { const b = q[(k + 1) % q.length]; return s + a.x * b.y - b.x * a.y; }, 0)) / 2;
    const losa = area(puntosAlViento(p, i));
    expect(r.pols.reduce((s, q) => s + area(q), 0)).toBeLessThan(0.25 * losa);
    // el cajón del 8º–9º para arriba tiene fachada
    const i8 = p.niveles.findIndex(n => n.nombre.startsWith('8º'));
    expect(esPisoAbierto(p, i8)).toBe(false);
  });

  it('los demás ejemplos no tienen pisos abiertos: el túnel no cambia', () => {
    for (const p of [ejemploGuia(), ejemploAsimetrico(), ejemploCiticorp(), ejemploPlanta34(), ejemploBasicoExo(), ejemploGherkin(), ejemploHancock(), ejemploHearst(), ejemploOnterie(), ejemploShanghai()])
      p.niveles.forEach((_, i) => expect(piezasPisoAbierto(p, i), `${p.nombre} · ${p.niveles[i].nombre}`).toBeNull());
  });

  it('corte vertical: la plaza queda con aire entre las columnas y la torre apoyada arriba', () => {
    const p = ejemploCiticorpFachada();
    const zPB = p.niveles[iPlaza(p)].cota;
    const niveles = p.niveles.map((n, i) => ({ n, i })).filter(x => x.n.cota >= zPB - 1e-6).map(x => { const pz = piezasPisoAbierto(p, x.i)?.pols; return { z: x.n.cota - zPB, pol: puntosAlViento(p, x.i), ...(pz ? { piezas: pz } : {}) }; });
    const perfil = () => 1;
    const sin = geometriaAlzado({ niveles: niveles.map(n => ({ z: n.z, pol: n.pol })), dir: 'A', celdasH: 240, perfil });
    const con = geometriaAlzado({ niveles, dir: 'A', celdasH: 240, perfil });
    // una fila a media altura de la plaza (17 m): antes era sólida de punta a punta de la planta; ahora tiene aire adentro
    const fila = (g: typeof con) => { const y = Math.round(1 + 17 * g.escala), xs: number[] = []; for (let x = 0; x < g.nx; x++) if (g.cuerpo![y * g.nx + x]) xs.push(x); return xs; };
    const fS = fila(sin), fC = fila(con);
    expect(fS.length).toBe(Math.max(...fS) - Math.min(...fS) + 1);                // lleno
    expect(fC.length).toBeGreaterThan(0);                                         // columnas o núcleo
    expect(fC.length).toBeLessThan(0.6 * fS.length);                              // con aire entre ellos
    const huecos = fC.slice(1).filter((x, k) => x > fC[k] + 1).length;
    expect(huecos).toBeGreaterThanOrEqual(1);
    // arriba del cajón (50 m) la torre sigue llena
    const y50 = Math.round(1 + 50 * con.escala); let n50 = 0; for (let x = 0; x < con.nx; x++) n50 += con.cuerpo![y50 * con.nx + x];
    expect(n50).toBeGreaterThan(fS.length * 0.8);
  });

  it('corte vertical sin piezas en la línea: ese piso queda todo aire', () => {
    const cuad = (c: number, l: number) => [{ x: c - l, y: c - l }, { x: c + l, y: c - l }, { x: c + l, y: c + l }, { x: c - l, y: c + l }];
    const niveles = [{ z: 0, pol: cuad(0, 10), piezas: [cuad(0, 1).map(q => ({ x: q.x + 8, y: q.y + 8 }))] }, { z: 10, pol: cuad(0, 10) }, { z: 40, pol: cuad(0, 10) }];
    const g = geometriaAlzado({ niveles, dir: 'A', celdasH: 60, perfil: () => 1 });
    const y = Math.round(1 + 5 * g.escala); let n = 0; for (let x = 0; x < g.nx; x++) n += g.cuerpo![y * g.nx + x];
    expect(n).toBe(0);
  });
  it('túnel 3D: la plaza es el núcleo y las columnas con aire entre ellos; arriba del cajón, la torre llena', () => {
    const p = ejemploCiticorpFachada(), zPB = p.niveles[iPlaza(p)].cota;
    // lo mismo que arma el túnel 3D (nivelesProyecto en src/ui/tunel3d.ts)
    const niveles = p.niveles.map((n, i) => ({ n, i })).filter(x => x.n.cota >= zPB).map(x => {
      const piezas = piezasPisoAbierto(p, x.i)?.pols ?? [];
      return { cota: x.n.cota - zPB, silueta: puntosAlViento(p, x.i), continua: tramoEn(p, x.n.cota)?.modo !== 'losa', ...(piezas.length ? { piezas } : {}) };
    });
    expect(niveles.filter(n => n.piezas).length).toBe(1);
    const op = { dir: 'A' as const, nx: 120, ny: 90, nz: 150 };
    const con = geometria3D({ ...op, niveles }), sin = geometria3D({ ...op, niveles: niveles.map(({ piezas: _, ...n }) => n) });
    const capa = (g: typeof con, z: number) => { const k = Math.round(z * g.escala) + 1; let s2 = 0; for (let j = 0; j < g.nx * g.ny; j++) s2 += g.solido[k * g.nx * g.ny + j]; return s2; };
    const pC = capa(con, 17), pS = capa(sin, 17);
    expect(pC).toBeGreaterThan(0);
    expect(pC).toBeLessThan(0.5 * pS);
    expect(capa(con, 60)).toBe(capa(sin, 60));
  });
});
