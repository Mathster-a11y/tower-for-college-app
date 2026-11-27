/**
 * Ficha M, «Malla sobre la fachada»: la geometría sigue la fachada real y el cálculo por proyección da lo mismo que un
 * reticulado espacial completo con losas rígidas (tres movimientos por piso: u, v y el giro θ) resuelto acá aparte.
 */
import { describe, expect, it } from 'vitest';
import { ejemploBasicoExo, ejemploGherkin } from './ejemplosExo';
import { mallaDe, anillosMalla, nudosEnContorno, corrido } from './exoMalla';
import { calcularExo, conMalla, propsSeccion, rigidezTabiques, pesoExo, seccionEn, type ExoDef } from './exo';
import type { Proyecto } from './modelo';
import { calcularProyecto } from './calculoProyecto';
import { ExoDeCalculo } from './exoDeCalculo';

/** el Gherkin con la ficha M: diagrid de 18 nudos por anillo sobre la fachada circular (las cotas de las pruebas de la malla, hasta la base de la cúpula) */
function gherkinM(): { p: Proyecto; def: ExoDef; zs: number[] } {
  const p = ejemploGherkin();
  const def: ExoDef = { ...p.exo!, tipo: 'M', circular: undefined, anchoVariable: false, arriostradas: false, malla: { patron: 'diagrid', nudos: 18, esquinas: true } };
  p.exo = def;
  const zs = [...new Set(p.niveles.map(n => n.cota).filter(z => z >= 0 && z <= 166 + 1e-6))].sort((a, b) => a - b);
  return { p, def, zs };
}

/** resuelve A·x = b (eliminación con pivoteo parcial) */
function resolver(A: number[][], b: number[]): number[] {
  const n = b.length, M = A.map((f, i) => [...f, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

/**
 * Referencia: el reticulado espacial de la malla (barras articuladas, E·A/L en su dirección) con una losa rígida en cada
 * piso (u, v, θ del piso: el nudo se corre u − θ·(y − yc) en x y v + θ·(x − xc) en y; w libre) más la ménsula de los
 * tabiques en u. Viento en x (el viento B de la app).
 */
function referencia3D(geo: ReturnType<typeof mallaDe>, def: ExoDef, zs: number[], W: number[], EJ: (z: number) => number, dir: 'A' | 'B' = 'B') {
  const n = zs.length - 1, libres = geo.nudos.map((q, i) => (q.k > 0 ? i : -1)).filter(i => i >= 0);
  const iw = new Map(libres.map((id, j) => [id, 3 * n + j]));
  const N = 3 * n + libres.length, K = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  // fila de un movimiento del nudo (componente c: 0 x, 1 y, 2 z) en función de los gdl
  const fila = (id: number, c: number): Map<number, number> => {
    const q = geo.nudos[id], m = new Map<number, number>();
    if (q.k === 0) return m;
    const k = q.k - 1;
    if (c === 0) { m.set(3 * k, 1); m.set(3 * k + 2, -(q.y - geo.cy)); }
    else if (c === 1) { m.set(3 * k + 1, 1); m.set(3 * k + 2, q.x - geo.cx); }
    else m.set(iw.get(id)!, 1);
    return m;
  };
  const Bs = geo.barras.map(b => {
    const A = geo.nudos[b.a], Bn = geo.nudos[b.b], L = Math.hypot(Bn.x - A.x, Bn.y - A.y, Bn.z - A.z);
    const c = [(Bn.x - A.x) / L, (Bn.y - A.y) / L, (Bn.z - A.z) / L];
    const row = new Map<number, number>();
    for (let j = 0; j < 3; j++) {
      fila(b.b, j).forEach((v, g) => row.set(g, (row.get(g) ?? 0) + c[j] * v));
      fila(b.a, j).forEach((v, g) => row.set(g, (row.get(g) ?? 0) - c[j] * v));
    }
    const sec = seccionEn(def, b.clase, Math.min(A.z, Bn.z)), k = (def.E * propsSeccion(sec).A) / L;
    row.forEach((vi, gi) => row.forEach((vj, gj) => { K[gi][gj] += k * vi * vj; }));
    return { row, k, b };
  });
  const o = dir === 'A' ? 1 : 0;
  const Kt = rigidezTabiques(zs, EJ);   // los tabiques y el viento en el sentido del viento (B: x; A: y)
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) K[3 * i + o][3 * j + o] += Kt[i][j];
  // los pisos sin nudos de la malla no tienen nada de costado ni al giro: un resorte despreciable (no hay carga ahí)
  for (let i = 0; i < n; i++) { K[3 * i + 1 - o][3 * i + 1 - o] += 1e-6; K[3 * i + 2][3 * i + 2] += 1e-6; }
  const F = new Array<number>(N).fill(0); W.forEach((w, k) => { F[3 * k + o] = w; });
  const x = resolver(K, F);
  return { u: Array.from({ length: n }, (_, k) => x[3 * k + o]), v: Array.from({ length: n }, (_, k) => x[3 * k + 1 - o]), th: Array.from({ length: n }, (_, k) => x[3 * k + 2]),
    N: Bs.map(({ row, k, b }) => ({ b, N: k * [...row].reduce((s, [g, v]) => s + v * x[g], 0) })) };
}

describe('malla sobre la fachada: geometría', () => {
  it('el Gherkin: 18 nudos por anillo sobre la fachada circular, anillos alternados medio paso', () => {
    const { p, def, zs } = gherkinM();
    const g = mallaDe(p, def, zs);
    const porAnillo = g.anillos.map((_, r) => g.nudos.filter(q => q.anillo === r));
    porAnillo.forEach(ns => expect(ns.length).toBe(18));
    // sobre la fachada: el radio de cada nudo es el de la carpintería de su cota (la separación es 0)
    porAnillo.forEach(ns => { const R = ns.map(q => Math.hypot(q.x - g.cx, q.y - g.cy)); expect(Math.max(...R) - Math.min(...R)).toBeLessThan(0.03); });
    // el radio sigue el perfil: más ancho en el piso 18 que en la base y que arriba
    const radio = (r: number) => Math.hypot(porAnillo[r][0].x - g.cx, porAnillo[r][0].y - g.cy);
    const rMax = Math.max(...porAnillo.map((_, r) => radio(r)));
    expect(rMax).toBeGreaterThan(radio(0) + 2); expect(rMax).toBeGreaterThan(radio(porAnillo.length - 1) + 5);
    // diagrid: cada anillo corrido medio paso (10°) respecto del de abajo
    const ang = (q: { x: number; y: number }) => ((Math.atan2(q.y - g.cy, q.x - g.cx) * 180) / Math.PI + 360) % 360;
    const a0 = Math.min(...porAnillo[0].map(ang).map(a => a % 20)), a1 = Math.min(...porAnillo[1].map(ang).map(a => (a + 10) % 20));
    expect(Math.abs(a0 - a1)).toBeLessThan(0.5);
    // cada nudo (menos los del tope) sube con dos diagonales
    // sin atar las losas, cada nudo (menos los del tope) sube con dos diagonales de anillo a anillo
    const g0 = mallaDe(p, { ...def, malla: { ...def.malla!, arriostrada: false } }, zs);
    expect(g0.barras.filter(b => b.clase === 'diagonal').length).toBe(36 * (g0.anillos.length - 1));
    expect(g0.barras.filter(b => b.clase === 'anillo').length).toBe(18 * (g0.anillos.length - 1));
    // con las losas atadas (por defecto) cada diagonal se parte en los pisos que cruza: todos los pisos tienen nudos
    const pisos = new Set(g.nudos.map(q => q.k));
    zs.forEach((_, k) => expect(pisos.has(k)).toBe(true));
    const largo = (gg: typeof g) => gg.barras.filter(b => b.clase === 'diagonal').reduce((s2, b) => { const A = gg.nudos[b.a], B = gg.nudos[b.b]; return s2 + Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z); }, 0);
    expect(largo(g)).toBeCloseTo(largo(g0), 6);
    // anillos en los bordes de los módulos (cada 4 pisos) y en la mitad
    expect(anillosMalla(def, zs).slice(0, 4)).toEqual([0, 2, 4, 6]);
  });

  it('una planta con esquinas: las esquinas son nudos y los lados se reparten por su largo', () => {
    const q = [{ x: -10, y: -5 }, { x: 10, y: -5 }, { x: 10, y: 5 }, { x: -10, y: 5 }];
    const ns = nudosEnContorno(q, 12, true, false, 0);
    expect(ns.length).toBe(12);
    const acum = [0, 20, 30, 50, 60];
    acum.slice(0, 4).forEach(c => expect(ns.some(x => Math.abs((((x.pos % 60) + 60) % 60) - c) < 1e-9)).toBe(true));
    // corrido 1 m hacia afuera: el rectángulo de 22 × 12
    const c = corrido(q, 1);
    expect(c[0]).toEqual({ x: -11, y: -6 }); expect(c[2]).toEqual({ x: 11, y: 6 });
    // en un anillo «del medio» del diagrid los nudos caen a mitad de cada tramo (no en las esquinas)
    const m = nudosEnContorno(q, 12, true, true, 0);
    acum.slice(0, 4).forEach(cc => expect(m.some(x => Math.abs((((x.pos % 60) + 60) % 60) - cc) < 1e-9)).toBe(false));
  });
});

describe('malla sobre la fachada: el cálculo por proyección', () => {
  it('da lo mismo que el reticulado espacial con losas rígidas (Gherkin, viento en x)', () => {
    const { p, def: def0, zs } = gherkinM();
    // la malla articulada pura (sin atar las losas en los pisos intermedios): ahí la proyección es exacta
    const def: ExoDef = { ...def0, pesoPropio: false, losas: undefined, malla: { ...def0.malla!, arriostrada: false } };
    const geo = mallaDe(p, def, zs), n = zs.length - 1;
    const W = zs.slice(1).map(() => 10), EJ = () => 2.1e6 * 50;
    const ref = referencia3D(geo, def, zs, W, EJ);
    const r = calcularExo(conMalla(def, { malla: geo, dir: 'B' }), zs, W, EJ, 40, [0], 2.1e6);
    // la planta es simétrica respecto del viento: la referencia no se corre de costado ni gira
    expect(Math.max(...ref.v.map(Math.abs))).toBeLessThan(1e-9 * Math.max(...ref.u));
    expect(Math.max(...ref.th.map(Math.abs))).toBeLessThan(1e-9);
    // los corrimientos de los pisos y la fuerza de cada diagonal, iguales
    r.u.forEach((u, k) => expect(u).toBeCloseTo(ref.u[k], 9));
    expect(r.u[n - 1]).toBeGreaterThan(0);
    const porPos = new Map(r.caras[0].esfuerzos.map(e => [`${e.p3!.a.x.toFixed(4)},${e.p3!.a.y.toFixed(4)},${e.p3!.a.z.toFixed(3)}|${e.p3!.b.x.toFixed(4)},${e.p3!.b.y.toFixed(4)},${e.p3!.b.z.toFixed(3)}`, e]));
    let comparadas = 0, Nmax = 0;
    ref.N.forEach(({ b, N }) => {
      const A = geo.nudos[b.a], B = geo.nudos[b.b];
      const e = porPos.get(`${A.x.toFixed(4)},${A.y.toFixed(4)},${A.z.toFixed(3)}|${B.x.toFixed(4)},${B.y.toFixed(4)},${B.z.toFixed(3)}`);
      if (b.clase === 'anillo') { expect(Math.abs(N)).toBeLessThan(1e-6); return; }   // con la losa rígida, el anillo no trabaja
      expect(e).toBeDefined();
      expect(e!.N).toBeCloseTo(N, 6);
      expect(e!.L).toBeCloseTo(Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z), 9);
      comparadas++; Nmax = Math.max(Nmax, Math.abs(N));
    });
    expect(comparadas).toBe(geo.barras.filter(b => b.clase !== 'anillo').length);
    expect(Nmax).toBeGreaterThan(1);
  });

  it('el peso es el de las barras reales (con los anillos) y lo cuenta una vez', () => {
    const { p, def, zs } = gherkinM();
    const geo = mallaDe(p, def, zs);
    const ref = geo.barras.reduce((s, b) => { const A = geo.nudos[b.a], B = geo.nudos[b.b]; return s + 7.85 * propsSeccion(seccionEn(def, b.clase, Math.min(A.z, B.z))).A * Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z); }, 0);
    const en = { zs, W: [], EJ: () => 1, ancho: 1, tCaras: [0], Eh: 1, h: 1, malla: geo };
    expect(pesoExo(def, [{ ...en, dir: 'A' }, { ...en, dir: 'B' }])).toBeCloseTo(ref, 6);
  });

  it('el peso propio y las losas bajan por la malla: la suma de las reacciones es la carga', () => {
    const { p, def, zs } = gherkinM();
    const geo = mallaDe(p, def, zs);
    const r = calcularExo(conMalla({ ...def, pesoPropio: true }, { malla: geo, dir: 'A' }), zs, zs.slice(1).map(() => 0), () => 2.1e6 * 50, 40, [0], 2.1e6, undefined, undefined, { qLosa: 0.5 });
    const V = r.caras[0].reacciones.reduce((s, x) => s + x.V, 0);
    const peso = pesoExo(def, [{ zs, W: [], EJ: () => 1, ancho: 1, tCaras: [0], Eh: 1, h: 1, malla: geo }]);
    const f = def.losas!.franja, losas = zs.slice(1).reduce((s, _, i) => s + 0.5 * Math.max(0, geo.perimetro[i + 1] * f - Math.PI * f * f), 0);
    // (la mitad del peso de las barras que llegan a la base cae en el apoyo mismo: no pasa por las barras)
    const enApoyo = geo.barras.reduce((s, b) => { const A = geo.nudos[b.a], B = geo.nudos[b.b]; const w = 7.85 * propsSeccion(seccionEn(def, b.clase, Math.min(A.z, B.z))).A * Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z) / 2; return s + (A.k === 0 ? w : 0) + (B.k === 0 ? w : 0); }, 0);
    expect(V).toBeCloseTo(peso + losas - enApoyo, 3);
  });
});

describe('malla sobre la fachada: límite del método', () => {
  it('planta asimétrica (una D): la referencia gira un poco y se corre de costado; la proyección, sin eso, queda a menos del 1 %', () => {
    const { p, def: def0, zs } = gherkinM();
    // todas las losas y la fachada: medio círculo de 25 m de radio (recto del lado −x)
    const D = [{ x: 0, y: -25, b: Math.tan(Math.PI / 4) }, { x: 0, y: 25 }];
    p.niveles.forEach(nv => { nv.silueta = D.map(v => ({ ...v })); nv.carpinteria = D.map(v => ({ ...v })); });
    const def: ExoDef = { ...def0, pesoPropio: false, losas: undefined, malla: { patron: 'diagrid', nudos: 18, esquinas: true, arriostrada: false } };
    const geo = mallaDe(p, def, zs), n = zs.length - 1, EJ = () => 2.1e6 * 50;
    for (const dir of ['A', 'B'] as const) {
      // viento B: a lo largo de x (perpendicular al lado recto: la planta es simétrica respecto de su eje); A: a lo largo de y
      const W = zs.slice(1).map(() => 10);
      const r = calcularExo(conMalla(def, { malla: geo, dir }), zs, W, EJ, 40, [0], 2.1e6);
      const ref = referencia3D(geo, def, zs, W, EJ, dir);
      // la azotea: la proyección queda a menos del 1 % (medido: 0,13 % con viento A y 0,19 % con viento B); el giro y el
      // corrimiento de costado que no ve son de ese orden (θ·R ≈ 0,3 % de u)
      expect(Math.abs(r.u[n - 1] - ref.u[n - 1]) / ref.u[n - 1]).toBeLessThan(0.01);
      expect(Math.max(...ref.th.map(Math.abs)) * 25).toBeLessThan(0.01 * ref.u[n - 1]);
    }
  });
});

describe('malla sobre la fachada: en el cálculo de la app', () => {
  it('con las losas atadas, ningún piso queda suelto: el corrimiento crece parejo con la altura (Gherkin, hasta la cúpula)', () => {
    const { p } = gherkinM();
    p.calculo = { ...(p.calculo ?? {}), metodo: 'cirsoc' } as typeof p.calculo;
    const c = calcularProyecto(p), ex = new ExoDeCalculo(p, c, 'cirsoc');
    for (const dir of ['A', 'B'] as const) {
      const d = ex.datos(dir, p.exo!)!, u = d.r.u, z = d.r.zs.slice(1);
      expect(u.every(x => isFinite(x) && x >= -1e-9)).toBe(true);
      // la deriva de cada piso, menos de 3 veces la promedio (sin los picos de un piso que no toca la malla)
      const der = u.map((x, k) => (x - (k ? u[k - 1] : 0)) / (z[k] - (k ? z[k - 1] : d.r.zs[0])));
      const media = u[u.length - 1] / (z[z.length - 1] - d.r.zs[0]);
      expect(Math.max(...der)).toBeLessThan(3 * media);
    }
  });
  it('el Gherkin con la ficha M se calcula con los dos vientos y verifica sus barras con el CIRSOC 301', () => {
    const { p } = gherkinM();
    p.calculo = { ...(p.calculo ?? {}), metodo: 'cirsoc' } as typeof p.calculo;
    const c = calcularProyecto(p), ex = new ExoDeCalculo(p, c, 'cirsoc');
    for (const dir of ['A', 'B'] as const) {
      const d = ex.datos(dir, p.exo!);
      expect(d, ex.ultimoError).not.toBeNull();
      expect(d!.tCaras).toEqual([0]);
      expect(d!.r.fraccionExo).toBeGreaterThan(0.3);                // el diagrid toma buena parte del momento
      const v = ex.verif301(d!);
      expect(v.length).toBe(d!.r.caras[0].esfuerzos.length);
      expect(v.every(x => isFinite(x.ratio))).toBe(true);
    }
    // la malla sola es igual de rígida con los dos vientos (la planta es redonda; el núcleo no, por eso las flechas difieren)
    const jA = ex.datos('A', p.exo!)!.r.caras[0].Jeq, jB = ex.datos('B', p.exo!)!.r.caras[0].Jeq;
    expect(Math.abs(jA - jB) / jA).toBeLessThan(0.02);
    expect(jA).toBeGreaterThan(1000);                              // un tubo de 50 m: miles de m⁴ equivalentes
    expect(ex.controles().length).toBeGreaterThan(0);
  });

  it('una torre de planta rectangular también: las esquinas son nudos', () => {
    const p = ejemploBasicoExo();
    p.exo = { ...p.exo!, tipo: 'M', malla: { patron: 'columnas', nudos: 16, esquinas: true } };
    p.calculo = { ...(p.calculo ?? {}), metodo: 'cirsoc' } as typeof p.calculo;
    const c = calcularProyecto(p), ex = new ExoDeCalculo(p, c, 'cirsoc');
    const d = ex.datos('A', p.exo!);
    expect(d, ex.ultimoError).not.toBeNull();
    expect(d!.r.caras[0].esfuerzos.some(e => e.clase === 'columna')).toBe(true);
    expect(d!.r.u.at(-1)!).toBeLessThan(d!.r.uSin.at(-1)!);
  });
});
