/**
 * Libro de resultados del túnel 2D: «Piso por piso» (Cd de cada planta, qz del CIRSOC 102-25 y la fuerza de cada
 * nivel como fórmula), «Interferencia» (con vecinos contra la planta sola) y «Cp del perímetro» del corte a la vista.
 *
 * No es una planilla de cálculo del método: son los datos de una simulación, con las fórmulas a la vista para que se
 * vea de dónde sale cada fuerza (F = Cd · qz · ancho · h / 1000 / 9,807) y con gráficos que leen las celdas.
 */
import { abs, LibroK, rc } from '../kit/libro';
import type { FilaInterferencia, FilaPiso } from '../../viento/porPiso';

export interface DatosLibroTunel {
  proyecto: string; dir: 'A' | 'B';
  /** piso por piso: las filas de la simulación y el qz del reglamento de cada nivel (N/m²) */
  pisos: (FilaPiso & { qz: number })[];
  interferencia: FilaInterferencia[];
  /** Cp promedio del perímetro del corte a la vista: posición a lo largo del contorno (m) y Cp */
  cp: { nivel: string; puntos: { s: number; cp: number }[] } | null;
  /** cómo se simuló (texto) */
  config: string;
}

export function libroTunel(d: DatosLibroTunel): LibroK {
  const L = new LibroK();
  const le = L.hoja('Léame', [110]);
  le.encabezado(`Túnel de viento 2D · ${d.proyecto} · viento ${d.dir}`, 'Resultados de la simulación (Torre 3D). Didáctico: no reemplaza los coeficientes del CIRSOC 102 ni un ensayo en túnel.', 1);
  [
    'Qué hay en cada hoja:',
    '• Piso por piso: cada planta se simula como un prisma infinito (2D) y da su coeficiente de arrastre Cd. La fuerza de cada nivel es F = Cd · qz · ancho · h de influencia, con el qz del CIRSOC 102-25 (la presión dinámica del viento a esa altura). Las columnas grises son fórmulas.',
    '• Interferencia: con edificios vecinos, el Cd de cada planta con los vecinos dividido por el de la misma planta sola. Menos de 1: los vecinos la protegen. Más de 1: la cargan más.',
    '• Cp del perímetro: el coeficiente de presión promedio a lo largo del contorno del corte que se ve en la app. Positivo: el aire empuja (comprime la fachada). Negativo: succiona (la tracciona).',
    'Unidades: z, ancho y h en metros; qz en N/m² (1 kN/m² = 1000 N/m²); F en toneladas (1 t = 9,807 kN); Cd, Cl, St y Cp no tienen unidad (son cocientes).',
    `Simulación: ${d.config}.`,
  ].forEach((t, i) => le.put(1, 4 + i, t, { papel: i ? 'texto' : 'textoB', ajustar: true }));
  for (let i = 0; i < 6; i++) le.altos.set(4 + i, i && i < 5 ? 44 : 20);

  // ------------------------------------------------------------------------------------------------ piso por piso
  if (d.pisos.length) {
    const h = L.hoja('Piso por piso', [12, 9, 11, 10, 11, 11, 10, 9, 12, 12, 12]);
    h.encabezado('Fuerza del viento piso por piso', 'F = Cd · qz · ancho · h / 1000 / 9,807 (t). El Cd sale de la simulación de la planta de cada nivel; qz, del CIRSOC 102-25.', 11);
    const r0 = 5;
    h.cabecera(r0, 1, ['Nivel', 'z (m)', 'qz (N/m²)', 'ancho (m)', 'h influencia (m)', 'Cd simulado', 'Cl eficaz', 'Strouhal', 'Coef. 102-25', 'F simulada (t)', 'F 102-25 (t)']);
    d.pisos.forEach((f, i) => {
      const r = r0 + 1 + i;
      h.put(1, r, f.nivel, 'textoB'); h.put(2, r, f.z, { papel: 'texto', fmt: '0.00' }); h.put(3, r, f.qz, { papel: 'texto', fmt: '0' });
      h.put(4, r, f.ancho, { papel: 'texto', fmt: '0.00' }); h.put(5, r, f.hInf, { papel: 'texto', fmt: '0.00' });
      h.put(6, r, f.Cd, { papel: 'coef', fmt: '0.00' }); h.put(7, r, f.ClRms, { papel: 'texto', fmt: '0.00' }); h.put(8, r, f.St ?? null, { papel: 'texto', fmt: '0.000' });
      h.put(9, r, isFinite(f.Creg) ? f.Creg : null, { papel: 'texto', fmt: '0.00' });
      h.f(10, r, `${rc(6, r)}*${rc(3, r)}*${rc(4, r)}*${rc(5, r)}/1000/9.80665`, { papel: 'calc', fmt: '0.00' });
      h.put(11, r, f.Freg, { papel: 'texto', fmt: '0.00' });
    });
    const rN = r0 + d.pisos.length, rT = rN + 2;
    h.put(1, rT, 'Corte en PB (t)', 'textoB');
    h.f(10, rT, `SUM(${rc(10, r0 + 1)}:${rc(10, rN)})`, { papel: 'res', fmt: '0.0' }); h.f(11, rT, `SUM(${rc(11, r0 + 1)}:${rc(11, rN)})`, { papel: 'res', fmt: '0.0' });
    h.put(1, rT + 1, 'Momento en PB (tm)', 'textoB');
    h.f(10, rT + 1, `SUMPRODUCT(${rc(10, r0 + 1)}:${rc(10, rN)},${rc(2, r0 + 1)}:${rc(2, rN)})`, { papel: 'res', fmt: '0' });
    h.f(11, rT + 1, `SUMPRODUCT(${rc(11, r0 + 1)}:${rc(11, rN)},${rc(2, r0 + 1)}:${rc(2, rN)})`, { papel: 'res', fmt: '0' });
    h.put(1, rT + 3, 'El Cd de la simulación es el arrastre medio de cada planta en 2D: no ve el aire que pasa por arriba de la azotea ni la ráfaga del reglamento (G o Gf). Sirve para comparar plantas y pisos entre sí.', 'nota');
    h.combinar(1, rT + 3, 11, rT + 3); h.altos.set(rT + 3, 30);
    h.fijar = { fila: r0, col: 1 };
    const rango = (c: number) => `'Piso por piso'!${abs(c, r0 + 1)}:${abs(c, rN)}`;
    h.graficos.push({ tipo: 'dispersion', titulo: 'Coeficiente de arrastre por piso', ejeX: 'coeficiente', ejeY: 'z (m)', desde: [13, 2], hasta: [21, 20],
      series: [{ nombre: 'Cd simulado', x: rango(6), y: rango(2), color: '7F77DD' }, { nombre: 'CIRSOC 102-25', x: rango(9), y: rango(2), color: 'D85A30', punteada: true }] });
    h.graficos.push({ tipo: 'dispersion', titulo: 'Fuerza de cada nivel', ejeX: 'F (t)', ejeY: 'z (m)', desde: [13, 22], hasta: [21, 40],
      series: [{ nombre: 'con el Cd simulado', x: rango(10), y: rango(2), color: '7F77DD' }, { nombre: 'CIRSOC 102-25', x: rango(11), y: rango(2), color: 'D85A30', punteada: true }] });
  }

  // ------------------------------------------------------------------------------------------------ interferencia
  if (d.interferencia.length) {
    const h = L.hoja('Interferencia', [12, 9, 13, 11, 11, 14, 12]);
    h.encabezado('Factor de interferencia por piso', 'Factor = Cd con los vecinos / Cd de la misma planta sola (la misma configuración del túnel).', 7);
    const r0 = 5;
    h.cabecera(r0, 1, ['Nivel', 'z (m)', 'Cd con vecinos', 'Cd sola', 'Factor', 'F con vecinos (t)', 'F sola (t)']);
    d.interferencia.forEach((f, i) => {
      const r = r0 + 1 + i;
      h.put(1, r, f.nivel, 'textoB'); h.put(2, r, f.z, { papel: 'texto', fmt: '0.00' });
      h.put(3, r, f.CdCon, { papel: 'coef', fmt: '0.00' }); h.put(4, r, f.CdSin, { papel: 'coef', fmt: '0.00' });
      h.f(5, r, `${rc(3, r)}/${rc(4, r)}`, { papel: 'res', fmt: '0.00' });
      h.put(6, r, f.FCon, { papel: 'texto', fmt: '0.00' }); h.put(7, r, f.FSin, { papel: 'texto', fmt: '0.00' });
    });
    const rN = r0 + d.interferencia.length;
    h.put(1, rN + 2, 'Menos de 1: los vecinos la protegen (la tapan o le bajan la velocidad). Más de 1: la cargan más (canalizan el aire entre edificios o le pegan con la estela de otro).', 'nota');
    h.combinar(1, rN + 2, 7, rN + 2); h.altos.set(rN + 2, 30);
    h.fijar = { fila: r0, col: 1 };
    h.graficos.push({ tipo: 'dispersion', titulo: 'Factor de interferencia', ejeX: 'Cd con vecinos / Cd sola', ejeY: 'z (m)', desde: [9, 2], hasta: [17, 22], sinLeyenda: true,
      series: [{ nombre: 'factor', x: `'Interferencia'!${abs(5, r0 + 1)}:${abs(5, rN)}`, y: `'Interferencia'!${abs(2, r0 + 1)}:${abs(2, rN)}`, color: '7F77DD' }] });
  }

  // ------------------------------------------------------------------------------------------------ Cp del perímetro
  if (d.cp && d.cp.puntos.length) {
    const h = L.hoja('Cp del perímetro', [16, 12]);
    h.encabezado(`Cp promedio a lo largo del perímetro · ${d.cp.nivel}`, 'Cp = (p − p del aire libre) / (½ · ρ · V²). Positivo: empuja (comprime la fachada). Negativo: succiona (la tracciona).', 2);
    const r0 = 5;
    h.cabecera(r0, 1, ['s (m, a lo largo del contorno)', 'Cp promedio']);
    d.cp.puntos.forEach((p, i) => { h.put(1, r0 + 1 + i, p.s, { papel: 'texto', fmt: '0.00' }); h.put(2, r0 + 1 + i, p.cp, { papel: 'texto', fmt: '0.000' }); });
    const rN = r0 + d.cp.puntos.length;
    h.fijar = { fila: r0, col: 1 };
    h.graficos.push({ tipo: 'dispersion', titulo: 'Cp a lo largo del perímetro', ejeX: 's (m)', ejeY: 'Cp', desde: [4, 2], hasta: [14, 22], sinLeyenda: true,
      series: [{ nombre: 'Cp', x: `'Cp del perímetro'!${abs(1, r0 + 1)}:${abs(1, rN)}`, y: `'Cp del perímetro'!${abs(2, r0 + 1)}:${abs(2, rN)}`, color: '1F4E79', sinMarcas: true }] });
  }
  return L;
}
