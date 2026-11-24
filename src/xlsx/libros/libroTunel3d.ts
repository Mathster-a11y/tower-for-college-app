/**
 * Libro de resultados del túnel 3D (etapa 1 de la propuesta de resultados): cargas por piso, la base con su
 * estadística y la serie de tiempo. Los picos estimados y las comparaciones con el CIRSOC son fórmulas a la vista.
 */
import { abs, LibroK, rc } from '../kit/libro';
import type { MuestraBase, ResumenFuerzas } from '../../viento/fuerzas3d';
import { FACTOR_PICO } from '../../viento/fuerzas3d';
import type { FilaZona } from '../../viento/fachada3d';

export interface DatosLibroTunel3d {
  proyecto: string; dir: 'A' | 'B';
  resumen: ResumenFuerzas; serie: MuestraBase[];
  /** fuerza de cada nivel del CIRSOC 102-25 (t), en el orden de resumen.pisos; null si no hay */
  regl: (number | null)[];
  /** q_h (N/m²) y G con los que se pasó de Cp a fuerza */
  qh: number; G: number;
  config: string;
  /** fachada: el peor valor de cada zona contra componentes y revestimientos del CIRSOC (etapa 2) */
  fachada?: { zonas: FilaZona[]; area: number; a: number; qh: number } | null;
}

export function libroTunel3d(d: DatosLibroTunel3d): LibroK {
  const L = new LibroK(), r = d.resumen;
  const le = L.hoja('Léame', [110]);
  le.encabezado(`Túnel de viento 3D · ${d.proyecto} · viento ${d.dir}`, 'Fuerzas del viento sobre la torre (Torre 3D). Didáctico: el cálculo de la entrega sigue con el CIRSOC 102.', 1);
  [
    'Qué hay en cada hoja:',
    '• Cargas por piso: la fuerza de cada nivel en el sentido del viento (arrastre, Fx), de costado (lateral, Fy) y el torsor (Mz), con su media, su desvío en el tiempo y el pico estimado = |media| + g · desvío (fórmula). Al lado, la fuerza del CIRSOC 102-25 y el cociente simulación / reglamento. Se pegan en un programa de análisis estructural como cargas por nivel.',
    '• Base: el cortante, el vuelco y el torsor en la base, y la simultaneidad (en el instante del máximo de cada fuerza, cuánto valen las otras dos, como fracción de su propio máximo).',
    '• Serie: las fuerzas de la base en el tiempo (en segundos reales), con su gráfico.',
    '• Fachada (si se miró): el peor pico de cada zona (centro de las caras y esquinas) en kN/m², contra los componentes y revestimientos del CIRSOC 102, con la presión interior. Las presiones son fórmulas de los Cp.',
    `Cómo se pasa de la simulación a toneladas: cada celda pegada a la torre da su Cp; la presión es Cp · qh · G con qh = ${d.qh.toFixed(0)} N/m² (la del CIRSOC 102-25 a la altura de la torre) y G = ${d.G.toFixed(2)} (la misma ráfaga que usa el reglamento), por el área de la celda. Así lo único que cambia entre la simulación y el reglamento es la forma (los Cp).`,
    `Muestras: ${r.muestras}, en ${r.tiempo.toFixed(0)} s reales. Con pocas muestras el desvío y los picos son poco confiables; la media se estabiliza antes.`,
    `Simulación: ${d.config}.`,
  ].forEach((t, i) => le.put(1, 4 + i, t, { papel: i ? 'texto' : 'textoB', ajustar: true }));
  for (let i = 0; i < 8; i++) le.altos.set(4 + i, i && i < 7 ? 46 : 20);

  // ------------------------------------------------------------------------------------------------ cargas por piso
  const h = L.hoja('Cargas por piso', [12, 8, 10, 10, 10, 10, 10, 10, 10, 10, 10, 11, 10]);
  h.encabezado('Cargas por piso', `t y tm. Pico estimado = |media| + g · desvío, con g en la celda B4. Simulación / CIRSOC = Fx media / W del 102-25.`, 13);
  h.put(1, 4, 'g (factor de pico)', 'textoB'); h.put(2, 4, FACTOR_PICO, { papel: 'dato', fmt: '0.0' });
  const r0 = 6, g = abs(2, 4);
  h.cabecera(r0, 1, ['Nivel', 'z (m)', 'Fx media', 'Fx desvío', 'Fx pico est.', 'Fy media', 'Fy desvío', 'Fy pico est.', 'Mz media', 'Mz desvío', 'Mz pico est.', 'W CIRSOC (t)', 'Sim. / CIRSOC']);
  r.pisos.forEach((p, i) => {
    const f = r0 + 1 + i;
    h.put(1, f, p.nombre, 'textoB'); h.put(2, f, p.z, { papel: 'texto', fmt: '0.00' });
    ([[3, p.Fx], [6, p.Fy], [9, p.Mz]] as const).forEach(([c, e]) => {
      h.put(c, f, e.media, { papel: 'texto', fmt: '0.00' }); h.put(c + 1, f, e.sigma, { papel: 'texto', fmt: '0.00' });
      h.f(c + 2, f, `ABS(${rc(c, f)})+${g}*${rc(c + 1, f)}`, { papel: 'calc', fmt: '0.00' });
    });
    h.put(12, f, d.regl[i] ?? null, { papel: 'texto', fmt: '0.00' });
    if (d.regl[i]) h.f(13, f, `${rc(3, f)}/${rc(12, f)}`, { papel: 'res', fmt: '0.00' });
  });
  const rN = r0 + r.pisos.length, rT = rN + 2;
  h.put(1, rT, 'Cortante en la base (t)', 'textoB');
  for (const c of [3, 6, 12]) h.f(c, rT, `SUM(${rc(c, r0 + 1)}:${rc(c, rN)})`, { papel: 'res', fmt: '0.0' });
  h.f(13, rT, `${rc(3, rT)}/${rc(12, rT)}`, { papel: 'res', fmt: '0.00' });
  h.put(1, rT + 1, 'Vuelco en la base (tm)', 'textoB');
  for (const c of [3, 6, 12]) h.f(c, rT + 1, `SUMPRODUCT(${rc(c, r0 + 1)}:${rc(c, rN)},${rc(2, r0 + 1)}:${rc(2, rN)})`, { papel: 'res', fmt: '0' });
  h.put(1, rT + 3, 'La simulación ve la torre entera en 3D: el aire que pasa por arriba descarga los últimos pisos y la succión de los costados y de atrás depende de la forma real. El reglamento usa Cp fijos por cara. Las dos usan la misma ráfaga G.', 'nota');
  h.combinar(1, rT + 3, 13, rT + 3); h.altos.set(rT + 3, 30);
  h.fijar = { fila: r0, col: 1 };
  const rango = (c: number) => `'Cargas por piso'!${abs(c, r0 + 1)}:${abs(c, rN)}`;
  h.graficos.push({ tipo: 'dispersion', titulo: 'Fuerza de cada nivel (arrastre)', ejeX: 'F (t)', ejeY: 'z (m)', desde: [15, 2], hasta: [23, 22],
    series: [{ nombre: 'simulación (media)', x: rango(3), y: rango(2), color: 'D85A30' }, { nombre: 'pico estimado', x: rango(5), y: rango(2), color: '7F77DD', punteada: true }, { nombre: 'CIRSOC 102-25', x: rango(12), y: rango(2), color: '2B3440', punteada: true }] });

  // ------------------------------------------------------------------------------------------------ base
  const b = L.hoja('Base', [36, 12, 12, 12, 12, 13]);
  b.encabezado('Fuerzas en la base', 'Media, desvío, mínimo y máximo en el tiempo; pico estimado = |media| + g · desvío.', 6);
  b.put(1, 4, 'g (factor de pico)', 'textoB'); b.put(2, 4, FACTOR_PICO, { papel: 'dato', fmt: '0.0' });
  b.cabecera(6, 1, ['', 'media', 'desvío', 'mínimo', 'máximo', 'pico estimado']);
  ([['Arrastre Vx (t)', r.base.Vx], ['Lateral Vy (t)', r.base.Vy], ['Torsor Mz (tm)', r.base.Mz], ['Vuelco por el arrastre Mx (tm)', r.base.Mx], ['Vuelco por el lateral My (tm)', r.base.My]] as const).forEach(([t, e], i) => {
    const f = 7 + i;
    b.put(1, f, t, 'textoB');
    [e.media, e.sigma, e.min, e.max].forEach((v, k) => b.put(2 + k, f, isFinite(v) ? v : null, { papel: 'texto', fmt: '0.00' }));
    b.f(6, f, `ABS(${rc(2, f)})+${abs(2, 4)}*${rc(3, f)}`, { papel: 'calc', fmt: '0.00' });
  });
  b.cabecera(14, 1, ['Simultaneidad: en el instante del máximo de…', 'arrastre', 'lateral', 'torsor']);
  const s = r.simultaneidad;
  ([['…el arrastre', 1, s.conVx.Vy, s.conVx.Mz], ['…el lateral', s.conVy.Vx, 1, s.conVy.Mz], ['…el torsor', s.conMz.Vx, s.conMz.Vy, 1]] as const).forEach(([t, a, l, m], i) => {
    b.put(1, 15 + i, t, 'textoB');
    [a, l, m].forEach((v, k) => b.put(2 + k, 15 + i, isFinite(v) ? v : null, { papel: k === i ? 'texto' : 'res', fmt: '0.00' }));
  });
  b.put(1, 19, 'Cada fila: cuánto vale cada fuerza (fracción de su propio máximo) cuando la de esa fila es máxima. El CIRSOC 102 combina 100 % y 75 % en sus casos 1 a 4.', 'nota');
  b.combinar(1, 19, 6, 19); b.altos.set(19, 30);

  // ------------------------------------------------------------------------------------------------ serie
  if (d.serie.length) {
    const t = L.hoja('Serie', [10, 12, 12, 12, 14, 14]);
    t.encabezado('Fuerzas en la base en el tiempo', 't en segundos reales (desde que se empezó a medir).', 6);
    const s0 = 5, t0 = d.serie[0].t;
    t.cabecera(s0, 1, ['t (s)', 'Vx arrastre (t)', 'Vy lateral (t)', 'Mz torsor (tm)', 'Mx vuelco (tm)', 'My vuelco (tm)']);
    d.serie.forEach((m, i) => [m.t - t0, m.Vx, m.Vy, m.Mz, m.Mx, m.My].forEach((v, k) => t.put(1 + k, s0 + 1 + i, v, { papel: 'texto', fmt: k ? '0.00' : '0.0' })));
    const sN = s0 + d.serie.length, col = (c: number) => `'Serie'!${abs(c, s0 + 1)}:${abs(c, sN)}`;
    t.fijar = { fila: s0, col: 1 };
    t.graficos.push({ tipo: 'dispersion', titulo: 'Cortante en la base', ejeX: 't (s)', ejeY: 't', desde: [8, 2], hasta: [18, 22],
      series: [{ nombre: 'arrastre', x: col(1), y: col(2), color: 'D85A30', sinMarcas: true }, { nombre: 'lateral', x: col(1), y: col(3), color: '7F77DD', sinMarcas: true }] });
  }
  // ------------------------------------------------------------------------------------------------ fachada
  if (d.fachada && d.fachada.zonas.length) {
    const fa = L.hoja('Fachada', [30, 12, 12, 13, 13, 14, 14]);
    fa.encabezado('Presiones de fachada por zona', 'p = qh · (Cp pico ± GCpi) / 1000 (kN/m²). Cp pico = Cp medio ± g · desvío. El CIRSOC: componentes y revestimientos, h > 18 m.', 7);
    fa.put(1, 4, 'qh (N/m²)', 'textoB'); fa.put(2, 4, d.fachada.qh, { papel: 'dato', fmt: '0' });
    fa.put(1, 5, 'GCpi (edificio cerrado)', 'textoB'); fa.put(2, 5, 0.18, { papel: 'dato', fmt: '0.00' });
    fa.put(1, 6, 'Área del elemento (m²) · ancho de la zona de esquina a (m)', 'textoB'); fa.put(2, 6, d.fachada.area, { papel: 'dato', fmt: '0.0' }); fa.put(3, 6, d.fachada.a, { papel: 'dato', fmt: '0.00' });
    const q = abs(2, 4), gi = abs(2, 5);
    fa.cabecera(8, 1, ['Zona', 'Cp pico + sim.', 'Cp pico − sim.', 'Empuje sim. (kN/m²)', 'Succión sim. (kN/m²)', 'Empuje CIRSOC (kN/m²)', 'Succión CIRSOC (kN/m²)']);
    d.fachada.zonas.forEach((z, i) => {
      const f = 9 + i;
      fa.put(1, f, z.nombre, 'textoB'); fa.put(2, f, isFinite(z.cpMas) ? z.cpMas : null, { papel: 'coef', fmt: '0.00' }); fa.put(3, f, isFinite(z.cpMenos) ? z.cpMenos : null, { papel: 'coef', fmt: '0.00' });
      fa.f(4, f, `${q}*(${rc(2, f)}+${gi})/1000`, { papel: 'calc', fmt: '0.00' }); fa.f(5, f, `${q}*(${rc(3, f)}-${gi})/1000`, { papel: 'calc', fmt: '0.00' });
      fa.put(6, f, z.pMasRegl, { papel: 'texto', fmt: '0.00' }); fa.put(7, f, z.pMenosRegl, { papel: 'texto', fmt: '0.00' });
    });
    fa.put(1, 12, 'Positiva: el viento empuja la fachada hacia adentro (la comprime). Negativa: la succiona hacia afuera (la tracciona). Donde la simulación da más que el reglamento conviene reforzar el anclaje o el vidrio.', 'nota');
    fa.combinar(1, 12, 7, 12); fa.altos.set(12, 30);
  }
  return L;
}
