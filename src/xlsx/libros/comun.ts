/**
 * Partes comunes de los libros nuevos (planilla de la guía y planilla renovada): la geometría de la torre en la hoja
 * «Datos» (niveles, muros como rectángulos y piezas) y la hoja de secciones (J de cada pieza con Steiner, eje de inercia
 * y la planta dibujada). Las dos planillas calculan las secciones igual: es la geometría, no el reglamento.
 */
import { hojaRef, rc, type Estilo, type HojaK, type LibroK } from '../kit/libro';
import type { NivelG, RectG } from '../../engine/metodos/guiaPasos';

export const num = (fmt: Estilo['fmt'] = '0.000'): Estilo => ({ papel: 'calc', fmt });
export const res = (fmt: Estilo['fmt'] = '0.000'): Estilo => ({ papel: 'res', fmt });
export const dato = (fmt: Estilo['fmt'] = 'g'): Estilo => ({ papel: 'dato', fmt });
export const coef = (fmt: Estilo['fmt'] = 'g'): Estilo => ({ papel: 'coef', fmt });
export const VER = (cond: string, no = '"NO VERIFICA"') => `IF(${cond},"VERIFICA",${no})`;

export interface Geometria { niveles: NivelG[]; rects: RectG[]; piezas: { nombre: string; dir: 'A' | 'B' }[] }
export interface Geo {
  /** hoja de los datos */
  hoja: string;
  rN0: number; rN1: number; rM0: number; rM1: number; rPs: number;
  /** piezas de un viento con la fila de «Datos» donde está su nombre */
  piezasDir: (dir: 'A' | 'B') => { nombre: string; dir: 'A' | 'B'; r: number }[];
  /** referencia a una celda de la tabla de niveles: columna (1 = nombre, 2 = cota, 3 = B, 4 = L, 5 = pisos) y nivel */
  nivDato: (c: number, i: number) => string;
  /** referencia a una celda de la tabla de muros: columna y rectángulo */
  muroDato: (c: number, k: number) => string;
}
export type Clave = (k: string, hoja: HojaK, ref: string) => void;

/** niveles, muros (un renglón por rectángulo) y piezas en la hoja «Datos», desde la fila r0 */
export function escribirGeometria(L: LibroK, da: HojaK, d: Geometria, r0: number, ancho = 14): Geo {
  const N = d.niveles.length, R = d.rects.length;
  const nombrar = (n: string, ref: string) => L.nombrar(n, da.nombre, ref);
  da.seccion(r0, 'Niveles, de la azotea a la fundación (PB = el último con cota ≥ 0)', ancho);
  da.cabecera(r0 + 1, 1, ['Nivel', 'Cota (m)', 'B: ancho que recibe el viento A (m)', 'L: ancho que recibe el viento B (m)', 'Pisos que representa']);
  const rN0 = r0 + 2, rN1 = rN0 + N - 1;
  d.niveles.forEach((n, i) => { const r = rN0 + i; da.put(1, r, n.nombre, dato()); da.put(2, r, n.cota, dato('0.00')); da.put(3, r, n.B, dato('0.00')); da.put(4, r, n.L, dato('0.00')); da.put(5, r, n.pisos, dato('0')); });
  const rngD = (c: number, a: number, b: number) => `${rc(c, a)}:${rc(c, b)}`;
  nombrar('niv_cota', rngD(2, rN0, rN1)); nombrar('niv_B', rngD(3, rN0, rN1)); nombrar('niv_L', rngD(4, rN0, rN1)); nombrar('niv_pisos', rngD(5, rN0, rN1));
  const rMs = rN1 + 2;
  da.seccion(rMs, 'Muros: un renglón por rectángulo (un tubo rectangular son 4; un tubo circular o un perfil, 1 con su área y su J)', ancho);
  da.cabecera(rMs + 1, 1, ['Muro', 'Pieza en el viento A', 'Pieza en el viento B', 'x: centro (m)', 'y: centro (m)', 'ax: medida en x (m)', 'ay: medida en y (m)', 'Tubo circular (1 = sí)', 'A propia (m²)', 'J propio viento A (m⁴)', 'J propio viento B (m⁴)', 'Área de influencia (m²)', 'Llega hasta la cota (m)', 'Factor de peso']);
  const rM0 = rMs + 2, rM1 = rM0 + Math.max(R, 1) - 1;
  d.rects.forEach((x, i) => {
    const r = rM0 + i;
    da.put(1, r, x.muro, dato()); da.put(2, r, x.piezaA ?? '', dato()); da.put(3, r, x.piezaB ?? '', dato());
    da.put(4, r, x.x, dato('0.000')); da.put(5, r, x.y, dato('0.000')); da.put(6, r, x.ax, dato('0.000')); da.put(7, r, x.ay, dato('0.000'));
    da.put(8, r, x.tubo ? 1 : null, dato('0')); da.put(9, r, x.A, dato('0.0000')); da.put(10, r, x.JA, dato('0.0000')); da.put(11, r, x.JB, dato('0.0000'));
    const primero = x.zHasta !== null;
    da.put(12, r, primero ? x.areaInf ?? 0 : null, dato('0.00')); da.put(13, r, primero ? x.zHasta : null, dato('0.00')); da.put(14, r, primero ? x.factor ?? 1 : null, dato('0.000'));
  });
  ['m_muro', 'm_pA', 'm_pB', 'm_x', 'm_y', 'm_ax', 'm_ay', 'm_tubo', 'm_A', 'm_JA', 'm_JB', 'm_inf', 'm_top', 'm_fac'].forEach((n, i) => nombrar(n, rngD(i + 1, rM0, rM1)));
  da.put(1, rM1 + 1, 'Área de influencia, cota y factor de peso van en el primer rectángulo de cada muro; los demás rectángulos del muro los comparten.', 'nota');
  const rPs = rM1 + 3;
  da.seccion(rPs, 'Piezas (cómo se arma cada una: los rectángulos de arriba que llevan su nombre)', ancho);
  da.cabecera(rPs + 1, 1, ['Pieza', 'Viento']);
  d.piezas.forEach((pz, i) => { da.put(1, rPs + 2 + i, pz.nombre, dato()); da.put(2, rPs + 2 + i, pz.dir, dato()); });
  const D_ = hojaRef(da.nombre);
  return {
    hoja: da.nombre, rN0, rN1, rM0, rM1, rPs,
    piezasDir: dir => d.piezas.map((pz, i) => ({ ...pz, r: rPs + 2 + i })).filter(pz => pz.dir === dir),
    nivDato: (c, i) => `${D_}${rc(c, rN0 + i)}`,
    muroDato: (c, k) => `${D_}${rc(c, rM0 + k)}`,
  };
}

/** las aberturas de los tabiques en «Datos», desde la fila r0 (nombres ab_*) */
export function escribirAberturas(L: LibroK, da: HojaK, ab: { muro: string; viento: 'A' | 'B'; L: number; e: number; s: number; ancho: number; desde: number; alto: number }[], r0: number, ancho = 14): { f0: number; f1: number } {
  da.seccion(r0, 'Aberturas de los tabiques (puertas y ventanas): el dintel se verifica al corte; en la sección, el tabique va con su corte más débil', ancho);
  da.cabecera(r0 + 1, 1, ['Muro', 'Trabaja en el viento', 'Largo del muro L (m)', 'Espesor e (m)', 'Centro de la abertura desde el centro del muro (m)', 'Ancho (m)', 'Desde el piso (m)', 'Alto (m)', 'Primera abertura del muro (1 = sí)', 'Pieza', 'J del muro entero, una vez por muro (m⁴)']);
  const f0 = r0 + 2, f1 = f0 + Math.max(ab.length, 1) - 1;
  ab.forEach((a, i) => {
    const r = f0 + i, ix = `MATCH(A${r},m_muro,0)`;
    da.put(1, r, a.muro, dato()); da.put(2, r, a.viento, dato()); da.put(3, r, a.L, dato('0.00')); da.put(4, r, a.e, dato('0.00')); da.put(5, r, a.s, dato('0.00')); da.put(6, r, a.ancho, dato('0.00')); da.put(7, r, a.desde, dato('0.00')); da.put(8, r, a.alto, dato('0.00'));
    da.put(9, r, ab.findIndex(x => x.muro === a.muro) === i ? 1 : 0, dato('0'));
    da.f(10, r, `IF(B${r}="A",INDEX(m_pA,${ix}),INDEX(m_pB,${ix}))`, { papel: 'calc' });
    da.f(11, r, `I${r}*D${r}*C${r}^3/12`, num('0.0000'));
  });
  for (const [n, c] of [['ab_muro', 1], ['ab_dir', 2], ['ab_pieza', 10], ['ab_Jm', 11]] as const) L.nombrar(n, da.nombre, `${rc(c, f0)}:${rc(c, f1)}`);
  if (!ab.length) da.put(1, f0, 'No hay aberturas en los tabiques.', 'nota');
  return { f0, f1 };
}
/**
 * columnas comunes de la hoja de dinteles (A a P): muro, viento, pieza, L, e, abertura, J del muro, J de la pieza (los
 * tabiques paralelos al viento, cada uno con e·L³/12, como la guía), momento estático S = e·(L²/4 − s²)/2 y la altura
 * del piso de PB (zArriba − zPB). Devuelve la fila de cada abertura.
 */
export function columnasDintel(h: HojaK, geo: Geo, ab: { f0: number }, n: number, r0: number) {
  h.cabecera(r0, 1, ['Muro', 'Viento', 'Pieza', 'L (m)', 'e (m)', 's (m)', 'Ancho (m)', 'Desde (m)', 'Alto (m)', 'J del muro (m⁴)', 'J de la pieza (m⁴)', 'S (m³)', 'h piso (m)', 'h dintel (m)']);
  const D = hojaRef(geo.hoja), filas: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = r0 + 1 + i, a = (c: number) => `${D}${rc(c, ab.f0 + i)}`;
    const ix = `MATCH(A${r},m_muro,0)`;
    h.f(1, r, a(1), { papel: 'calc' });
    h.f(2, r, a(2), { papel: 'calc', centrar: true });
    h.f(3, r, `IF(B${r}="A",INDEX(m_pA,${ix}),INDEX(m_pB,${ix}))`, { papel: 'calc' });
    h.f(4, r, a(3), num('0.00')); h.f(5, r, a(4), num('0.00'));
    h.f(6, r, a(5), num('0.00')); h.f(7, r, a(6), num('0.00')); h.f(8, r, a(7), num('0.00')); h.f(9, r, a(8), num('0.00'));
    h.f(10, r, `E${r}*D${r}^3/12`, num('0.0000'));
    h.f(11, r, `SUMPRODUCT((ab_pieza=C${r})*(ab_dir=B${r})*ab_Jm)+IF(B${r}="A",SUMPRODUCT((m_pA=C${r})*(m_ay>m_ax)*(m_tubo<>1)*(m_JA="")*m_ax*m_ay^3),SUMPRODUCT((m_pB=C${r})*(m_ax>m_ay)*(m_tubo<>1)*(m_JA="")*m_ay*m_ax^3))/12`, num('0.0000'));
    h.f(12, r, `E${r}*(D${r}^2/4-F${r}^2)/2`, num('0.0000'));
    h.f(13, r, 'zArriba-zPB', num('0.00'));
    h.f(14, r, `M${r}-(H${r}+I${r})`, num('0.00'));
    filas.push(r);
  }
  return filas;
}

export interface Secciones { bA: { f0: number; f1: number }; bB: { f0: number; f1: number }; tA: { f0: number; f1: number; fin: number }; tB: { f0: number; f1: number; fin: number } }
/**
 * Hoja de secciones: cada rectángulo en las piezas de cada viento (J propio + Steiner), las piezas con su J y su
 * posición transversal, los ejes de inercia y la planta de PB dibujada. Necesita los nombres B_PB y L_PB.
 * Nombres que define: sA_*, sB_* (rectángulos), pA_*, pB_* (piezas), SJ_A, SJ_B, Xr_A, Xr_B.
 */
export function hojaSecciones(L: LibroK, nombreHoja: string, titulo: string, geo: Geo, d: Geometria, clave: Clave): Secciones {
  const R = d.rects.length;
  const se = L.hoja(nombreHoja, [8, 10, 7, 9, 8, 8, 9, 9, 10, 9, 9, 10, 10, 3, 9, 9, 9]);
  const nombrar = (n: string, ref: string) => L.nombrar(n, nombreHoja, ref);
  se.encabezado(titulo, 'Cada rectángulo de «Datos» en las piezas de cada viento: h = su medida en el sentido del viento, b = la transversal; J propio = b·h³/12 (o el dato, para tubos y perfiles); s = posición en el sentido del viento; s̄ = baricentro de la pieza = Σ A·s / Σ A; Steiner = A·(s − s̄)². J de la pieza = Σ (J propio + A·d²). Eje de inercia = Σ J·t / Σ J (t: posición transversal de la pieza).', 13);
  const bloque = (dir: 'A' | 'B', r0: number) => {
    const A = dir === 'A';
    se.seccion(r0, `Viento ${dir}: rectángulos (flexión ${A ? 'en y' : 'en x'})`, 13);
    se.cabecera(r0 + 1, 1, ['Muro', 'Pieza', 'Papel', 'A (m²)', 'b (m)', 'h (m)', 's (m)', 't (m)', 'J propio (m⁴)', 's̄ pieza (m)', 'd = s − s̄ (m)', 'A·d² (m⁴)', 'J + A·d² (m⁴)']);
    const f0 = r0 + 2, f1 = f0 + Math.max(R, 1) - 1;
    for (let k = 0; k < R; k++) {
      const r = f0 + k, m = (c: number) => geo.muroDato(c, k);
      const pz = m(A ? 2 : 3), hh = m(A ? 7 : 6), bb = m(A ? 6 : 7), Jd = m(A ? 10 : 11), s = m(A ? 5 : 4), t = m(A ? 4 : 5);
      se.f(1, r, `${m(1)}`, { papel: 'calc' });
      se.f(2, r, `IF(${pz}="","",${pz})`, { papel: 'calc' });
      se.f(3, r, `IF(${m(8)}=1,"tubo",IF(F${r}>=E${r},"alma","ala"))`, { papel: 'calc', centrar: true });
      se.f(4, r, `IF(${m(9)}="",${m(6)}*${m(7)},${m(9)})`, num('0.0000'));
      se.f(5, r, `IF(${m(9)}="",${bb},D${r}/F${r})`, num('0.000'));
      se.f(6, r, `${hh}`, num('0.000'));
      se.f(7, r, `${s}`, num('0.000'));
      se.f(8, r, `${t}`, num('0.000'));
      se.f(9, r, `IF(${Jd}="",E${r}*F${r}^3/12,${Jd})`, num('0.0000'));
      se.f(10, r, `IF(B${r}="",0,SUMPRODUCT((B$${f0}:B$${f1}=B${r})*D$${f0}:D$${f1}*G$${f0}:G$${f1})/SUMPRODUCT((B$${f0}:B$${f1}=B${r})*D$${f0}:D$${f1}))`, num('0.000'));
      se.f(11, r, `IF(B${r}="",0,G${r}-J${r})`, num('0.000'));
      se.f(12, r, `IF(B${r}="",0,D${r}*K${r}^2)`, num('0.0000'));
      se.f(13, r, `IF(B${r}="",0,I${r}+L${r})`, res('0.0000'));
    }
    return { f0, f1 };
  };
  const bA = bloque('A', 4), bB = bloque('B', bA.f1 + 3);
  for (const [p, b] of [['sA_', bA], ['sB_', bB]] as const) {
    nombrar(`${p}pieza`, `B${b.f0}:B${b.f1}`); nombrar(`${p}muro`, `A${b.f0}:A${b.f1}`); nombrar(`${p}A`, `D${b.f0}:D${b.f1}`); nombrar(`${p}Jt`, `M${b.f0}:M${b.f1}`); nombrar(`${p}s`, `G${b.f0}:G${b.f1}`); nombrar(`${p}t`, `H${b.f0}:H${b.f1}`);
    nombrar(`${p}d`, `K${b.f0}:K${b.f1}`); nombrar(`${p}b`, `E${b.f0}:E${b.f1}`); nombrar(`${p}h`, `F${b.f0}:F${b.f1}`); nombrar(`${p}papel`, `C${b.f0}:C${b.f1}`);
  }
  const D_ = hojaRef(geo.hoja);
  const tablaPiezas = (dir: 'A' | 'B', r0: number) => {
    const pfx = dir === 'A' ? 'sA_' : 'sB_';
    se.seccion(r0, `Piezas del viento ${dir} y eje de inercia`, 13);
    se.cabecera(r0 + 1, 1, ['Pieza', 'A (m²)', 's̄ (m)', 't̄: posición transversal (m)', 'J (m⁴)', 'J · t̄ (m⁵)']);
    const ps = geo.piezasDir(dir), f0 = r0 + 2, f1 = f0 + Math.max(ps.length, 1) - 1;
    ps.forEach((pz, k) => {
      const r = f0 + k;
      se.f(1, r, `${D_}A${pz.r}`, { papel: 'calc' });
      se.f(2, r, `SUMPRODUCT((${pfx}pieza=A${r})*${pfx}A)`, num('0.0000'));
      se.f(3, r, `IF(B${r}>0,SUMPRODUCT((${pfx}pieza=A${r})*${pfx}A*${pfx}s)/B${r},0)`, num('0.000'));
      se.f(4, r, `IF(B${r}>0,SUMPRODUCT((${pfx}pieza=A${r})*${pfx}A*${pfx}t)/B${r},0)`, num('0.000'));
      se.f(5, r, `SUMPRODUCT((${pfx}pieza=A${r})*${pfx}Jt)`, res('0.0000'));
      se.f(6, r, `E${r}*D${r}`, num('0.0000'));
      clave(`J_${dir}_${pz.nombre}`, se, rc(5, r)); clave(`t_${dir}_${pz.nombre}`, se, rc(4, r));
    });
    se.put(4, f1 + 1, 'Σ', 'textoB');
    const SJ = se.f(5, f1 + 1, `SUM(E${f0}:E${f1})`, res('0.000')); se.f(6, f1 + 1, `SUM(F${f0}:F${f1})`, num('0.000'));
    se.put(1, f1 + 2, `Eje de inercia del viento ${dir}: Σ J·t̄ / Σ J`, 'textoB'); se.combinar(1, f1 + 2, 4, f1 + 2);
    const Xr = se.f(5, f1 + 2, `IF(E${f1 + 1}>0,F${f1 + 1}/E${f1 + 1},0)`, res('0.000')); se.put(6, f1 + 2, 'm', 'unidad');
    nombrar(`SJ_${dir}`, SJ); nombrar(`Xr_${dir}`, Xr); clave(`SJ_${dir}`, se, SJ); clave(`Xr_${dir}`, se, Xr);
    nombrar(`p${dir}_nombre`, `A${f0}:A${f1}`); nombrar(`p${dir}_J`, `E${f0}:E${f1}`); nombrar(`p${dir}_t`, `D${f0}:D${f1}`);
    return { f0, f1, fin: f1 + 2 };
  };
  const tA = tablaPiezas('A', bB.f1 + 3), tB = tablaPiezas('B', tA.fin + 2);
  // planta: contorno de cada rectángulo (5 vértices y un renglón vacío) para el gráfico
  const rPl = tB.fin + 3;
  se.seccion(rPl, 'Planta (para el gráfico): vértices de cada rectángulo y de la planta de PB', 13);
  se.cabecera(rPl + 1, 1, ['x (m)', 'y (m)']);
  let rr = rPl + 2;
  const p0 = rr;
  for (let k = 0; k < R; k++) {
    const m = (c: number) => geo.muroDato(c, k);
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]) { se.f(1, rr, `${m(4)}+${sx}*${m(6)}/2`, num('0.00')); se.f(2, rr, `${m(5)}+${sy}*${m(7)}/2`, num('0.00')); rr++; }
    rr++;
  }
  const p1 = rr - 1;
  const c0 = rr;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]) { se.f(1, rr, `${sx}*B_PB/2`, num('0.00')); se.f(2, rr, `${sy}*L_PB/2`, num('0.00')); rr++; }
  const c1 = rr - 1;
  const e0 = rr + 1;
  se.put(3, e0 - 1, 'ejes de inercia', 'nota');
  se.f(1, e0, 'Xr_A', num('0.00')); se.f(2, e0, '-L_PB/2', num('0.00')); se.f(1, e0 + 1, 'Xr_A', num('0.00')); se.f(2, e0 + 1, 'L_PB/2', num('0.00'));
  se.f(1, e0 + 3, '-B_PB/2', num('0.00')); se.f(2, e0 + 3, 'Xr_B', num('0.00')); se.f(1, e0 + 4, 'B_PB/2', num('0.00')); se.f(2, e0 + 4, 'Xr_B', num('0.00'));
  const SE = hojaRef(nombreHoja);
  se.graficos.push({ tipo: 'dispersion', titulo: 'Planta de PB, muros y ejes de inercia', ejeX: 'x (m)', ejeY: 'y (m)',
    series: [
      { nombre: 'planta', x: `${SE}$A$${c0}:$A$${c1}`, y: `${SE}$B$${c0}:$B$${c1}`, color: 'A6A6A6', sinMarcas: true, ancho: 12700 },
      { nombre: 'muros', x: `${SE}$A$${p0}:$A$${p1}`, y: `${SE}$B$${p0}:$B$${p1}`, color: '1F4E79', sinMarcas: true, ancho: 19050 },
      { nombre: 'eje de inercia A', x: `${SE}$A$${e0}:$A$${e0 + 1}`, y: `${SE}$B$${e0}:$B$${e0 + 1}`, color: 'C55A11', sinMarcas: true, punteada: true },
      { nombre: 'eje de inercia B', x: `${SE}$A$${e0 + 3}:$A$${e0 + 4}`, y: `${SE}$B$${e0 + 3}:$B$${e0 + 4}`, color: '548235', sinMarcas: true, punteada: true },
    ], desde: [15, 4], hasta: [26, 30] });
  se.graficos.push({ tipo: 'barras', titulo: 'J de cada pieza', ejeX: 'pieza', ejeY: 'J (m⁴)',
    series: [{ nombre: 'viento A', x: `${SE}$A$${tA.f0}:$A$${tA.f1}`, y: `${SE}$E$${tA.f0}:$E$${tA.f1}`, color: 'C55A11' }], desde: [15, 31], hasta: [26, 48], sinLeyenda: true });
  return { bA, bB, tA, tB };
}
