import { describe, expect, it } from 'vitest';
import { cirsoc301, losaPorPiso, LOSA_QD, LOSA_QL, idBarra } from './exo';
import { armarCara, calcularExo, CATALOGO_TUBOS, cargarCara, cerosDeM, condensarCara, dimensionarExo, esfuerzosEn, EXO_POR_DEFECTO, pesoExo, propsSeccion, rigidezTabiques, type Barra, type Cara, type EntradaExo, type ExoDef } from './exo';

const pisos = (n: number, h = 3) => Array.from({ length: n + 1 }, (_, i) => i * h);
const resolver1 = (K: number[][], W: number[]) => {        // Gauss simple para las pruebas
  const n = K.length, A = K.map((f, i) => [...f, W[i]]);
  for (let c = 0; c < n; c++) { for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c]; x[r] = s / A[r][r]; }
  return x;
};

describe('exoesqueleto · motor', () => {
  it('ménsula de tabiques: carga en la punta δ = P·H³ / 3EI y carga repartida δ = W·H³ / 8EI (exacto en los nudos)', () => {
    const zs = pisos(10), EI = 2e6, H = 30;
    const K = rigidezTabiques(zs, () => EI);
    const P = new Array(10).fill(0); P[9] = 10;
    expect(resolver1(K, P)[9]).toBeCloseTo((10 * H ** 3) / (3 * EI), 9);
    // carga repartida como fuerzas en los nudos (media en la punta): se acerca a W·H³/8EI al afinar
    const z40 = pisos(40, 0.75), W = 40 * 1;
    const q = new Array(40).fill(W / 40); q[39] = W / 80;
    const d = resolver1(rigidezTabiques(z40, () => EI), q)[39];
    expect(Math.abs(d / ((W * H ** 3) / (8 * EI)) - 1)).toBeLessThan(0.02);
  });

  it('dos columnas atadas por diagonales muy rígidas = ménsula con J = Σ A·d² (más la flexión propia)', () => {
    const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'D', modulo: 1, diagonal: { b: 3, e: 1.5 }, viga: { b: 3, e: 1.5 } };
    const zs = pisos(12), ancho = 10, n = 12;
    const c = condensarCara(armarCara(def, ancho, zs), def.E, n);
    const P = new Array(n).fill(0); P[n - 1] = 50;
    const dCara = resolver1(c.K, P)[n - 1];
    const pc = propsSeccion(def.columna), J = 2 * pc.A * (ancho / 2) ** 2 + 2 * pc.I, H = 36;
    expect(Math.abs(dCara / ((50 * H ** 3) / (3 * def.E * J)) - 1)).toBeLessThan(0.03);
  });

  it('equilibrio: lo que toman los tabiques más el exo es el viento de cada piso; sin exo, todo a los tabiques', () => {
    const zs = pisos(20), W = zs.slice(1).map((_z, i) => 4 + i * 0.2);
    for (const tipo of ['A', 'B', 'C', 'D'] as const) {
      const r = calcularExo({ ...EXO_POR_DEFECTO, tipo, pesoPropio: false }, zs, W, () => 3.4e6 * 20, 18, [-10, 10], 3.4e6);
      r.Ftab.forEach((f, i) => expect(f + r.Fexo[i]).toBeCloseTo(W[i], 6));
      expect(r.u[19]).toBeLessThan(r.uSin[19]);
      expect(r.fraccionExo).toBeGreaterThan(0); expect(r.fraccionExo).toBeLessThan(1);
      // el corte de cada cara en la base (suma de las reacciones horizontales) es la mitad de lo que toma el exo
      const Hcaras = r.caras.reduce((s, c) => s + c.reacciones.reduce((q, x) => q + x.H, 0), 0);
      expect(-Hcaras).toBeCloseTo(r.Vexo0, 4);
      // las reacciones verticales se equilibran (par de columnas: tracción a barlovento, compresión a sotavento)
      r.caras.forEach(c => expect(Math.abs(c.reacciones.reduce((q, x) => q + x.V, 0))).toBeLessThan(1e-6 * Math.max(1, r.Vsin[0])));
    }
  });

  it('exo muy flexible: los tabiques toman casi todo y el resultado es el de siempre', () => {
    const zs = pisos(15), W = new Array(15).fill(5);
    const r = calcularExo({ ...EXO_POR_DEFECTO, columna: { b: 0.05, e: 0.002 }, diagonal: { b: 0.02, e: 0.001 }, viga: { b: 0.05, e: 0.002 } }, zs, W, () => 3.4e6 * 30, 18, [-10, 10], 3.4e6);
    expect(r.fraccionExo).toBeLessThan(0.01);
    expect(r.Mtab[0] / r.Msin[0]).toBeGreaterThan(0.99);
  });

  it('torre de la guía con el tubo en X: el exo toma la mayor parte y la flecha baja (orden de la propuesta)', () => {
    // 21 pisos de 3 m (64 m), ΣJ = 22,08 m⁴ en hormigón E = 3,4·10⁶ t/m², W ≈ 129 t
    const zs = [0, ...Array.from({ length: 21 }, (_, i) => 1 + i * 3)], W = zs.slice(1).map(z => 4 + 2.6 * (z / 64) ** 0.3);
    const r = calcularExo(EXO_POR_DEFECTO, zs, W, () => 3.4e6 * 22.08, 18, [-11, 11], 3.4e6);
    expect(r.uSin[20] * 1000).toBeGreaterThan(40);
    expect(r.u[20] / r.uSin[20]).toBeLessThan(0.5);
    expect(r.fraccionExo).toBeGreaterThan(0.5);
    r.caras.forEach(c => expect(c.Jeq).toBeGreaterThan(5));
  });
});

describe('exoesqueleto · pisos que no son múltiplo del módulo', () => {
  it('21 pisos con módulo 4: las cuatro fichas dan números finitos y en equilibrio', () => {
    const zs = pisos(21), W = new Array(21).fill(6);
    for (const tipo of ['A', 'B', 'C', 'D'] as const) {
      const r = calcularExo({ ...EXO_POR_DEFECTO, tipo }, zs, W, () => 3.4e6 * 20, 18, [-10, 10], 3.4e6);
      expect(r.u.every(Number.isFinite)).toBe(true);
      expect(r.caras[0].esfuerzos.every(e => Number.isFinite(e.N) && e.L > 0)).toBe(true);
      r.Ftab.forEach((f, i) => expect(f + r.Fexo[i]).toBeCloseTo(6, 6));
    }
  });
});

describe('exoesqueleto · números de la torre de la guía (para el informe)', () => {
  it('muestra el reparto', () => {
    const zs = [0, ...Array.from({ length: 21 }, (_, i) => 1 + i * 3)], W = zs.slice(1).map(z => 4 + 2.6 * (z / 64) ** 0.3);
    const r = calcularExo(EXO_POR_DEFECTO, zs, W, () => 3.4e6 * 22.08, 18, [-11, 11], 3.4e6);
    console.log(`δ sin exo ${(r.uSin[20] * 1000).toFixed(1)} mm · con exo ${(r.u[20] * 1000).toFixed(1)} mm · exo toma ${(r.fraccionExo * 100).toFixed(0)} % del momento · Jeq cara ${r.caras[0].Jeq.toFixed(1)} m⁴ · barras ${r.controles.length}, no verifican ${r.controles.filter(c => c.estado !== 'verifica').length}`);
    const peor = [...r.controles].sort((a, b) => b.sigma - a.sigma)[0];
    console.log(`peor barra ${peor.cara} ${peor.id} ${peor.clase} N=${peor.N.toFixed(1)} t σ=${(peor.sigma / 10).toFixed(0)} kg/cm² λ=${peor.lambda.toFixed(0)}`);
  });
});

describe('exoesqueleto · signos de los esfuerzos de cada barra', () => {
  it('Ma y Mb tienen el mismo convenio (flector): Mb − Ma = Q·L, y los nudos están en equilibrio de momentos', () => {
    for (const tipo of ['A', 'B', 'C', 'D'] as const) {
      const def: ExoDef = { ...EXO_POR_DEFECTO, tipo };
      const zs = pisos(16, 3.5), W = zs.slice(1).map(() => 4);
      const r = calcularExo(def, zs, W, () => 30, 20, [-11, 11], 3.4e6);
      // con su carga repartida (peso propio), N, V y M a lo largo de la barra llegan al extremo b con los valores de f
      r.caras[0].esfuerzos.forEach(e => {
        const f = esfuerzosEn(e, 1), tol = 1e-6 * Math.max(1, Math.abs(e.Ma), Math.abs(e.Mb), Math.abs(e.N));
        expect(Math.abs(f.M - e.Mb)).toBeLessThan(tol); expect(Math.abs(f.V - e.Qb)).toBeLessThan(tol); expect(Math.abs(f.N - e.Nb)).toBeLessThan(tol);
        if (e.relA) expect(Math.abs(e.Ma)).toBeLessThan(1e-9); if (e.relB) expect(Math.abs(e.Mb)).toBeLessThan(1e-9);
      });
      // equilibrio de momentos en cada nudo libre: la suma de los momentos de extremo (como acción sobre el nudo) es cero
      const suma = new Map<string, number>();
      r.caras[0].esfuerzos.forEach(e => {
        if (e.clase === 'diagonal') return;
        const ka = `${e.a.s.toFixed(3)},${e.a.z.toFixed(3)}`, kb = `${e.b.s.toFixed(3)},${e.b.z.toFixed(3)}`;
        // momento de extremo sobre la barra (antihorario +): en a = −Ma, en b = Mb; sobre el nudo, el opuesto
        suma.set(ka, (suma.get(ka) ?? 0) + e.Ma); suma.set(kb, (suma.get(kb) ?? 0) - e.Mb);
      });
      suma.forEach((v, k) => { if (!k.endsWith(',0.000')) expect(Math.abs(v)).toBeLessThan(1e-5); });
    }
  });
});

describe('exoesqueleto · dimensionado (el más liviano que verifica)', () => {
  const zs = [0, ...Array.from({ length: 21 }, (_, i) => 1 + i * 3)], W = zs.slice(1).map(z => 4 + 2.6 * (z / 64) ** 0.3);
  const entradas: EntradaExo[] = [
    { zs, W, EJ: () => 3.4e6 * 22.08, ancho: 18, tCaras: [-11, 11], Eh: 3.4e6, h: 64 },
    { zs, W: W.map(w => w * 0.8), EJ: () => 3.4e6 * 14.45, ancho: 22, tCaras: [-9, 9], Eh: 3.4e6, h: 64 },
  ];
  it('las cuatro fichas: todo verifica con los dos vientos y no hay un tubo más chico que alcance en cada clase', () => {
    for (const tipo of ['A', 'B', 'C', 'D'] as const) {
      const r = dimensionarExo({ ...EXO_POR_DEFECTO, tipo }, entradas);
      expect(r.verifica).toBe(true);
      entradas.forEach(en => {
        const c = calcularExo(r.def, en.zs, en.W, en.EJ, en.ancho, en.tCaras, en.Eh);
        expect(c.controles.every(x => x.estado === 'verifica')).toBe(true);
        expect(c.u[c.u.length - 1]).toBeLessThanOrEqual(en.h / 500 + 1e-9);
      });
      expect(r.peso).toBeGreaterThan(0);
      // un paso menos en la clase que quedó más grande ya no alcanza (el resultado es el borde)
      const k = (['columna', 'diagonal', 'viga'] as const).map(c => ({ c, i: CATALOGO_TUBOS.findIndex(s => s.b === r.def[c].b && s.e === r.def[c].e) })).sort((a, b) => b.i - a.i)[0];
      if (k.i > 0) {
        const menor = { ...r.def, [k.c]: CATALOGO_TUBOS[k.i - 1] };
        const ok = entradas.every(en => { const c = calcularExo(menor, en.zs, en.W, en.EJ, en.ancho, en.tCaras, en.Eh); return c.controles.every(x => x.estado === 'verifica') && c.u[c.u.length - 1] <= en.h / 500; });
        expect(ok).toBe(false);
      }
    }
  });
  it('con una flecha objetivo más exigente (h/2000) sale más pesado y la cumple', () => {
    const suelto = dimensionarExo({ ...EXO_POR_DEFECTO, tipo: 'D' }, entradas);
    const exigente = dimensionarExo({ ...EXO_POR_DEFECTO, tipo: 'D', limiteH: 2000 }, entradas);
    expect(exigente.verifica).toBe(true);
    expect(exigente.peso).toBeGreaterThan(suelto.peso);
    entradas.forEach(en => { const c = calcularExo(exigente.def, en.zs, en.W, en.EJ, en.ancho, en.tCaras, en.Eh); expect(c.u[c.u.length - 1]).toBeLessThanOrEqual(en.h / 2000 + 1e-9); });
  });
  it('el peso cuenta una vez las columnas de las esquinas', () => {
    const def = { ...EXO_POR_DEFECTO, tipo: 'D' as const };
    const solo = pesoExo(def, [entradas[0]]), ambos = pesoExo(def, entradas);
    const colsB = 2 * (61 * propsSeccion(def.columna).A * 7.85) * 2;   // dos columnas por cara, dos caras
    const otro = pesoExo(def, [entradas[1]]);
    expect(ambos).toBeCloseTo(solo + otro - colsB, 6);
  });
});

describe('exoesqueleto · articulaciones y cargas repartidas (casos cerrados)', () => {
  // viga horizontal entre dos nudos de la base (fijos): q hacia abajo, L = 6 m
  const viga = (relA: boolean, relB: boolean): Cara => {
    const p = propsSeccion({ b: 0.4, e: 0.02 }), q = 2;
    const b: Barra = { id: 'V1', clase: 'viga', a: 0, b: 1, A: p.A, I: p.I, sec: { b: 0.4, e: 0.02 }, relA, relB, borde: false, carga: { xa: 0, za: -q, xb: 0, zb: -q } };
    return { nombre: 'v', nudos: [{ id: 0, s: 0, z: 0, piso: 0 }, { id: 1, s: 6, z: 0, piso: 0 }], barras: [b] };
  };
  const q = 2, L = 6;
  it('empotrada-empotrada: M extremos = −qL²/12, M centro = qL²/24, cruza el eje dos veces', () => {
    const e = condensarCara(viga(false, false), 2.1e7, 0).recuperar([])[0];
    expect(e.Ma).toBeCloseTo(-q * L * L / 12, 9); expect(e.Mb).toBeCloseTo(-q * L * L / 12, 9);
    expect(esfuerzosEn(e, 0.5).M).toBeCloseTo(q * L * L / 24, 9);
    expect(cerosDeM(e).length).toBe(2);
  });
  it('simplemente apoyada (articulada en los dos extremos): M = 0 en los apoyos y qL²/8 en el centro', () => {
    const e = condensarCara(viga(true, true), 2.1e7, 0).recuperar([])[0];
    expect(Math.abs(e.Ma)).toBeLessThan(1e-9); expect(Math.abs(e.Mb)).toBeLessThan(1e-9);
    expect(esfuerzosEn(e, 0.5).M).toBeCloseTo(q * L * L / 8, 9);
    expect(e.Q).toBeCloseTo(q * L / 2, 9);
  });
  it('empotrada y articulada: M empotramiento = −qL²/8, reacción del lado articulado = 3qL/8', () => {
    const e = condensarCara(viga(false, true), 2.1e7, 0).recuperar([])[0];
    expect(e.Ma).toBeCloseTo(-q * L * L / 8, 9); expect(Math.abs(e.Mb)).toBeLessThan(1e-9);
    expect(-e.Qb).toBeCloseTo(3 * q * L / 8, 9);
  });
  it('ménsula vertical con carga horizontal repartida: δ punta = qH⁴ / 8EI (con la carga llevada al piso)', () => {
    const sec = { b: 0.5, e: 0.03 }, p = propsSeccion(sec), H = 10, w = 1.5, E = 2.1e7;
    const b: Barra = { id: 'C1', clase: 'columna', a: 0, b: 1, A: p.A, I: p.I, sec, relA: false, relB: false, borde: true, carga: { xa: w, za: 0, xb: w, zb: 0 } };
    const c = condensarCara({ nombre: 'm', nudos: [{ id: 0, s: 0, z: 0, piso: 0 }, { id: 1, s: 0, z: H, piso: 1 }], barras: [b] }, E, 1);
    const u = c.F[0] / c.K[0][0];
    expect(u).toBeCloseTo(w * H ** 4 / (8 * E * p.I), 9);
    const e = c.recuperar([u])[0];
    expect(Math.abs(e.Mb)).toBeLessThan(1e-6);                       // punta libre: el piso no le hace fuerza
    expect(Math.abs(e.Ma)).toBeCloseTo(w * H * H / 2, 6);
  });
  it('fachada colgada del exo: Σ reacciones horizontales de las caras + corte de los tabiques = viento total aplicado', () => {
    const zs = pisos(20), W = zs.slice(1).map((_z, i) => 4 + i * 0.2), sumW = W.reduce((a, b) => a + b, 0);
    for (const tipo of ['A', 'B', 'C', 'D', 'E'] as const) {
      const def: ExoDef = { ...EXO_POR_DEFECTO, tipo, viento: 'fachada', pisoInicio: 2 };
      const r = calcularExo(def, zs, W, () => 3.4e6 * 20, 18, [-10, 10], 3.4e6);
      // viento que entra en las barras de borde de las dos caras
      let aplicado = 0;
      [-10, 10].forEach(() => cargarCara(armarCara(def, 18, zs), def, zs, W).barras.forEach(br => { if (!br.carga) return; const c = armarCara(def, 18, zs); const A = c.nudos[br.a], B = c.nudos[br.b]; aplicado += (br.carga.xa + br.carga.xb) / 2 * Math.hypot(B.s - A.s, B.z - A.z); }));
      const Hcaras = r.caras.reduce((s, c) => s + c.reacciones.reduce((q2, x) => q2 + x.H, 0), 0);
      expect(r.Vtab[0] - Hcaras).toBeCloseTo(aplicado, 4);
      // el viento sobre la fachada es ΣW; a los pisos llega un poco menos (lo de abajo del primer piso va directo a la base)
      expect(aplicado).toBeCloseTo(sumW, 6);
      expect(r.Ftab.reduce((a, b) => a + b, 0) + r.Fexo.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(sumW * (1 + 1e-5));
    }
  });
  it('uniones: con vigas y columnas articuladas el tubo en X sigue rígido; los mega-marcos todo articulado no suman rigidez (los sostienen los tabiques)', () => {
    const zs = pisos(16), W = zs.slice(1).map(() => 4);
    const ok = calcularExo({ ...EXO_POR_DEFECTO, tipo: 'D', uniones: { columna: 'articulada', viga: 'articulada', base: 'articulada' } }, zs, W, () => 3.4e6 * 20, 18, [-10, 10], 3.4e6);
    expect(ok.u[15]).toBeLessThan(ok.uSin[15]);
    const zs2 = pisos(8);
    const c = condensarCara(armarCara({ ...EXO_POR_DEFECTO, tipo: 'B', uniones: { viga: 'articulada', columna: 'articulada', base: 'articulada' } }, 18, zs2), 2.1e7, 8);
    const rigida = condensarCara(armarCara({ ...EXO_POR_DEFECTO, tipo: 'B' }, 18, zs2), 2.1e7, 8);
    expect(Math.max(...c.K.flat().map(Math.abs))).toBeLessThan(1e-6 * Math.max(...rigida.K.flat().map(Math.abs)));
  });
  it('ficha E (chevrones al mástil, esquinas colgadas): estable, en equilibrio y las esquinas no llegan al suelo', () => {
    const zs = pisos(25), W = zs.slice(1).map(() => 4);
    const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'E', modulo: 8, pisoInicio: 1, pesoPropio: false };
    const c = armarCara(def, 18, zs);
    // a la base llegan el mástil y las alas (la mitad de los mástiles de las caras perpendiculares); las columnas de esquina no
    const enBase = c.barras.filter(b => c.nudos[b.a].piso === 0 || c.nudos[b.b].piso === 0);
    expect(enBase.filter(b => b.clase === 'columna' && (b.fraccion ?? 1) === 1).map(b => c.nudos[b.a].s)).toEqual([0]);
    expect(enBase.filter(b => (b.fraccion ?? 1) < 1).length).toBe(2);
    expect(c.barras.filter(b => b.clase === 'columna' && (b.fraccion ?? 1) === 1 && c.nudos[b.a].s !== 0).every(b => c.nudos[b.a].piso >= 1)).toBe(true);
    // con las alas, el exo toma parte del momento de vuelco (el par lo hacen los mástiles de barlovento y sotavento)
    const r0 = calcularExo(def, zs, W, () => 3.4e6 * 20, 18, [-10, 10], 3.4e6);
    expect(r0.fraccionExo).toBeGreaterThan(0.1);
    const r = r0;
    r.Ftab.forEach((f, i) => expect(f + r.Fexo[i]).toBeCloseTo(W[i], 6));
    expect(r.u[24]).toBeLessThan(r.uSin[24]);
  });
});

describe('exoesqueleto · barras agregadas a mano', () => {
  it('una diagonal nueva en los mega-marcos los hace más rígidos y queda en equilibrio', () => {
    const zs = pisos(12), W = zs.slice(1).map(() => 4);
    const base: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'B', pesoPropio: false };
    const r0 = calcularExo(base, zs, W, () => 3.4e6 * 5, 18, [-10, 10], 3.4e6);
    const def: ExoDef = { ...base, nuevas: [{ clase: 'diagonal', a: [-9, 0], b: [9, 12] }, { clase: 'diagonal', a: [9, 12], b: [-9, 24] }] };
    const c = armarCara(def, 18, zs);
    expect(c.barras.filter(b => b.id.startsWith('N')).length).toBe(2);
    const r1 = calcularExo(def, zs, W, () => 3.4e6 * 5, 18, [-10, 10], 3.4e6);
    expect(r1.u[11]).toBeLessThan(r0.u[11]);
    r1.Ftab.forEach((f, i) => expect(f + r1.Fexo[i]).toBeCloseTo(W[i], 6));
  });
});

describe('torsión con el exoesqueleto', async () => {
  const { torsionConExo } = await import('./exo');
  const { calcRoto } = await import('./planilla');
  it('el centro de rigidez se acerca al medio, el torsor baja y la rigidez a la torsión sube', () => {
    // dos tabiques paralelos de J 10 y 2 a x = −5 y +5 (CR corrido a la izquierda) y dos perpendiculares de J 4 a ±6
    const par = [10, 2], per = [4, 4], H: (number | null)[] = new Array(46).fill(null);
    H[0] = -5; H[1] = 5; H[26] = -6; H[27] = 6;
    const r = calcRoto(par, per, H, 100, 2000, false, true);
    const t = torsionConExo(r, 8, 12, 8, 10);
    expect(r.J7).toBeCloseTo((10 * -5 + 2 * 5) / 12, 6);
    expect(Math.abs(t.crCon)).toBeLessThan(Math.abs(t.crSin));
    expect(Math.abs(t.mtCon)).toBeLessThan(Math.abs(t.mtSin));
    expect(t.kCon).toBeGreaterThan(t.kSin);
    expect(t.giro).toBeGreaterThan(0); expect(t.giro).toBeLessThan(1);
    expect(t.parteExo).toBeGreaterThan(0.5);
  });
});

describe('exoesqueleto · las losas apoyan en el exo', () => {
  const zs = Array.from({ length: 21 }, (_, i) => i * 3.5), W = zs.slice(1).map(() => 10), cero = W.map(() => 0);
  it('equilibrio: las reacciones de la base suman lo que bajan las losas, en todas las fichas', () => {
    for (const tipo of ['A', 'B', 'C', 'D', 'E'] as const) {
      const def: ExoDef = { ...EXO_POR_DEFECTO, tipo, pesoPropio: false, losas: { franja: 5 } };
      const r = calcularExo(def, zs, cero, () => 3e6 * 50, 30, [-10, 10], 3e6);
      const cargas = [-10, 10].reduce((s, _t, i) => s + (cargarCara(armarCara(def, 30, zs, `cara ${i + 1}`), def, zs, cero, { q: LOSA_QD + LOSA_QL, franja: 5, ancho: () => 30, centro: () => 0, anchoPerp: () => 20 }).cargasNudo ?? []).reduce((a, c) => a + c.P, 0), 0);
      const V = r.caras.reduce((s, c) => s + c.reacciones.reduce((a, x) => a + x.V, 0), 0);
      expect(cargas).toBeGreaterThan(0);
      expect(V).toBeCloseTo(cargas, 3);
    }
  });
  it('tubo con columnas solo en las esquinas: el exo toma toda la franja perimetral, q·(2f(B+L) − 4f²) por piso', () => {
    const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'B', pesoPropio: false, losas: { franja: 5 } };
    const r = calcularExo(def, zs, cero, () => 3e6 * 50, 30, [-10, 10], 3e6);
    const V = r.caras.reduce((s, c) => s + c.reacciones.reduce((a, x) => a + x.V, 0), 0);
    expect(V).toBeCloseTo(20 * losaPorPiso(LOSA_QD + LOSA_QL, 5, 30, 20), 3);
  });
  it('CIRSOC 301: entra 1,2 D + 1,6 L y la columna de esquina de la base lleva su parte de la losa', () => {
    const def: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'B', losas: { franja: 5 } };
    const sin = cirsoc301({ ...def, losas: undefined }, zs, W, () => 3e6 * 50, 30, [-10, 10], 3e6);
    const con = cirsoc301(def, zs, W, () => 3e6 * 50, 30, [-10, 10], 3e6);
    expect(con.some(b => b.combinacion === '1,2 D + 1,6 L')).toBe(true);
    const col = (v: typeof con) => v.filter(b => b.clase === 'columna').reduce((m, b) => Math.max(m, -b.Pu), 0);
    // cada esquina: medio frente de 30 m y medio de 20 m, con la franja de 5 m menos la esquina → 5·(12,5 + 7,5) = 100 m² por piso
    const losa = 20 * 100 * (1.2 * LOSA_QD + 1.6 * LOSA_QL);
    expect(col(con) - col(sin)).toBeGreaterThan(0.95 * losa);
    expect(col(con)).toBeGreaterThan(losa);
    // sin las losas, nada cambia (las combinaciones son las de siempre)
    expect(sin.every(b => !/L/.test(b.combinacion))).toBe(true);
  });
});

describe('exoesqueleto · diagonales arriostradas por las losas', () => {
  const zs = Array.from({ length: 25 }, (_, i) => i * 4), W = zs.slice(1).map(() => 12);
  const base: ExoDef = { ...EXO_POR_DEFECTO, tipo: 'A', modulo: 8, vanos: 2, pesoPropio: false };
  it('cada diagonal se parte en los pisos que cruza: tramos de un piso, atados a la losa, con el mismo largo total', () => {
    const libre = armarCara(base, 24, zs), atada = armarCara({ ...base, arriostradas: true }, 24, zs);
    const largo = (c: Cara) => c.barras.filter(b => b.clase === 'diagonal').reduce((s, b) => s + Math.hypot(c.nudos[b.b].s - c.nudos[b.a].s, c.nudos[b.b].z - c.nudos[b.a].z), 0);
    expect(largo(atada)).toBeCloseTo(largo(libre), 6);
    atada.barras.filter(b => b.clase === 'diagonal').forEach(b => {
      expect(Math.abs(atada.nudos[b.b].z - atada.nudos[b.a].z)).toBeLessThanOrEqual(4 + 1e-6);
      expect(atada.nudos[b.a].piso).toBeGreaterThanOrEqual(0); expect(atada.nudos[b.b].piso).toBeGreaterThanOrEqual(0);
    });
    // todos los pisos tienen nudos en la cara (la losa carga la diagonal donde la toca)
    for (let k = 1; k < zs.length; k++) expect(atada.nudos.some(q => q.piso === k)).toBe(true);
  });
  it('equilibrio con el viento, un poco más rígido, mismo peso y menos esbeltez en las diagonales', () => {
    const r0 = calcularExo(base, zs, W, () => 3e6 * 30, 24, [-10, 10], 3e6), r1 = calcularExo({ ...base, arriostradas: true }, zs, W, () => 3e6 * 30, 24, [-10, 10], 3e6);
    r1.Ftab.forEach((f, i) => expect(f + r1.Fexo[i]).toBeCloseTo(W[i], 6));
    expect(r1.u[r1.u.length - 1]).toBeLessThanOrEqual(r0.u[r0.u.length - 1] * (1 + 1e-9));
    const en: EntradaExo = { zs, W, EJ: () => 3e6 * 30, ancho: 24, tCaras: [-10, 10], Eh: 3e6, h: 96 };
    expect(pesoExo({ ...base, arriostradas: true }, [en, en])).toBeCloseTo(pesoExo(base, [en, en]), 6);
    const lam = (d: ExoDef) => Math.max(...cirsoc301(d, zs, W, () => 3e6 * 30, 24, [-10, 10], 3e6).filter(x => x.clase === 'diagonal').map(x => x.lambdaC));
    expect(lam({ ...base, arriostradas: true })).toBeLessThan(lam(base) / 2);
  });
  it('un cambio barra por barra vale para la diagonal entera (todos sus tramos)', () => {
    const sec = { b: 0.9, e: 0.04 };
    const c = armarCara({ ...base, arriostradas: true, barras: { D1: { sec } } }, 24, zs);
    const tramos = c.barras.filter(b => idBarra(b.id) === 'D1');
    expect(tramos.length).toBeGreaterThan(1);
    tramos.forEach(b => expect(b.sec).toEqual(sec));
  });
});

