/**
 * «Comparación de métodos» (etapa 7): el Excel del método Combinado. Un reporte con la tabla de los cuatro métodos
 * (Planilla virgen, Guía, CIRSOC y FEM), la diferencia contra la planilla y la capa de la que sale, y gráficos de barras
 * que los superponen. La diferencia en % es una fórmula (se ve la cuenta); los valores vienen de la app.
 */
import { hojaRef, LibroK, rc } from '../kit/libro';
import { CAPAS, METODOS_COMPARADOS, type Capa, type Comparacion, type MetodoComparado } from '../../engine/metodos/combinado';
import { describirConfig, METODOS } from '../../engine/metodos/tipos';
import type { Proyecto } from '../../engine/modelo';
import { tablasProyecto } from '../proyectoTablas';
import { num, res } from './comun';

const NOMBRE: Record<MetodoComparado, string> = { planilla: 'Planilla virgen', guia: 'Guía', cirsoc: 'CIRSOC', fem: 'FEM' };
const COLOR: Record<MetodoComparado, string> = { planilla: 'A6A6A6', guia: '2E75B6', cirsoc: 'C55A11', fem: '548235' };
const TITULO: Record<Capa, string> = { cargas: 'Cargas (viento)', estabilidad: 'Estabilidad', rigidez: 'Rigidez', reparto: 'Reparto del viento (caso 1)', 'verificación': 'Verificación: compresión del hormigón solo (≤ 1 alcanza) y armadura vertical necesaria (%)' };

export function libroCombinado(cmp: Comparacion, p: Proyecto): LibroK {
  const L = new LibroK();
  L.titulo = `Comparación de métodos · ${p.nombre}`;
  const le = L.hoja('Léame', [3, 110]);
  le.put(1, 1, 'Comparación de los cuatro métodos', 'titulo');
  const lineas = [
    `Proyecto: ${p.nombre}. Hecho con Torre 3D, método «Combinado».`,
    'El Combinado no tiene reglas propias: corre los cuatro métodos con la misma torre y los compara. Cada método tiene su planilla (Exportar): Planilla virgen, Planilla de la guía, Planilla renovada (CIRSOC) y Reporte FEM.',
    ...METODOS_COMPARADOS.map(m => `${describirConfig(cmp.configs[m])}: ${METODOS[m].reglas}`),
    'Δ: diferencia contra la Planilla virgen en % (contra la Guía donde la planilla no lo calcula). La columna «Estado» dice cómo quedó el control con cada método.',
    'Los valores vienen de la app (para cambiarlos, cambiá la torre en la app y volvé a exportar); las diferencias son fórmulas.',
  ];
  lineas.forEach((x, i) => { le.put(2, 3 + i, x, { papel: 'texto', ajustar: true }); le.altos.set(3 + i, x.length > 115 ? 27 : 15); });

  const co = L.hoja('Comparación', [46, 8, 13, 13, 13, 13, 10, 10, 10, 13, 13, 13, 13]);
  co.encabezado('Comparación de los cuatro métodos', 'Capa por capa: las cargas, la estabilidad, la rigidez, el reparto y la verificación. Debajo de cada capa, de dónde salen las diferencias.', 13);
  co.fijar = { fila: 5, col: 2 };
  co.cabecera(4, 1, ['', 'Unidad', ...METODOS_COMPARADOS.map(m => NOMBRE[m]), ...METODOS_COMPARADOS.slice(1).map(m => `Δ ${NOMBRE[m]}`), ...METODOS_COMPARADOS.map(m => `Estado ${NOMBRE[m]}`)]);
  const estadoTxt = (e: string | null | undefined) => (e === 'verifica' ? 'VERIFICA' : e === 'no verifica' ? 'NO VERIFICA' : e === 'atención' ? 'ATENCIÓN' : '');
  let r = 5;
  const CO = hojaRef('Comparación');
  for (const capa of Object.keys(TITULO) as Capa[]) {
    const filas = cmp.filas.filter(f => f.capa === capa && METODOS_COMPARADOS.some(m => f.valores[m] !== null));
    if (!filas.length) continue;
    co.seccion(r, TITULO[capa], 13); r++;
    const r0 = r;
    for (const f of filas) {
      co.put(1, r, f.nombre, 'textoB'); co.put(2, r, f.unidad, 'unidad');
      METODOS_COMPARADOS.forEach((m, j) => co.put(3 + j, r, f.valores[m], res(f.unidad === '%' ? '0.00' : f.unidad === 'm' ? '0.0000' : '0.000')));
      const ref = f.valores.planilla !== null ? 'C' : 'D';
      METODOS_COMPARADOS.slice(1).forEach((_m, j) => {
        const c = rc(4 + j, r).replace(/\d+/, '');
        if (c === ref) { co.put(7 + j, r, null, num()); return; }
        co.f(7 + j, r, `IF(OR(${ref}${r}="",${c}${r}="",${ref}${r}=0),"",(${c}${r}-${ref}${r})/ABS(${ref}${r}))`, num('%'));
      });
      METODOS_COMPARADOS.forEach((m, j) => co.put(10 + j, r, estadoTxt(f.estados?.[m]), { papel: 'calc', centrar: true }));
      r++;
    }
    co.put(1, r, `De dónde salen las diferencias: ${CAPAS[capa]}.`, { papel: 'nota', ajustar: true }); co.combinar(1, r, 13, r); co.altos.set(r, 27);
    const r1 = r - 1;
    if (capa === 'reparto' || capa === 'verificación' || capa === 'cargas') {
      co.graficos.push({ tipo: 'barras', titulo: TITULO[capa], ejeX: '', ejeY: capa === 'reparto' ? '%' : capa === 'cargas' ? '' : 'uso',
        series: METODOS_COMPARADOS.map(m => ({ nombre: NOMBRE[m], x: `${CO}$A$${r0}:$A$${r1}`, y: `${CO}$${rc(3 + METODOS_COMPARADOS.indexOf(m), 1).replace(/\d+/, '')}$${r0}:$${rc(3 + METODOS_COMPARADOS.indexOf(m), 1).replace(/\d+/, '')}$${r1}`, color: COLOR[m] })),
        desde: [15, r0 - 1], hasta: [27, r0 + Math.max(16, r1 - r0 + 4)] });
    }
    r += 2;
  }
  co.verificaciones.push(`J5:M${r}`);
  co.seccion(r, 'Controles de cada método', 13); r++;
  co.cabecera(r, 1, ['', '', ...METODOS_COMPARADOS.map(m => NOMBRE[m])]); r++;
  ([['Controles calculados', 'calculados'], ['No verifican', 'noVerifican'], ['A revisar', 'atencion']] as const).forEach(([t, k]) => {
    co.put(1, r, t, 'textoB'); METODOS_COMPARADOS.forEach((m, j) => co.put(3 + j, r, cmp.resumen[m][k], res('0'))); r++;
  });
  for (const t of tablasProyecto(p)) {
    const h = L.hoja(t.nombre, t.anchos); h.oculta = true;
    t.filas.forEach((f, i) => f.forEach((x, j) => { if (x !== null && x !== '') h.put(j + 1, i + 1, x, 'vacio'); }));
  }
  return L;
}
