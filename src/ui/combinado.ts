/**
 * Vista del método Combinado (etapa 7): la tabla de los cuatro métodos con la diferencia contra la referencia y la capa
 * de la que sale cada diferencia. Sale de estado.calculo.combinado: esta vista no calcula.
 */
import { estado, fmt } from './estado';
import { h, kpi, seccion, type H } from './comp';
import { CAPAS, diferencia, METODOS_COMPARADOS, type Capa, type FilaComparacion, type MetodoComparado } from '../engine/metodos/combinado';
import { METODOS, describirConfig } from '../engine/metodos/tipos';

const NOMBRE: Record<MetodoComparado, string> = { planilla: 'Planilla', guia: 'Guía', cirsoc: 'CIRSOC', fem: 'FEM' };
const TITULO_CAPA: Record<Capa, string> = { cargas: 'Cargas (viento)', estabilidad: 'Estabilidad', rigidez: 'Rigidez', reparto: 'Reparto (caso 1)', 'verificación': 'Verificación del hormigón (uso ≤ 1)' };
const decimales = (f: FilaComparacion) => (f.unidad === '%' ? 2 : f.unidad === 'm' ? 4 : f.unidad === 't' || f.unidad === 'tm' ? 1 : 3);
const claseEstado = (e: string | null | undefined) => (e === 'verifica' ? 'ok' : e === 'no verifica' ? 'mal' : e === 'atención' ? 'revisar' : '');

/** panel: cuántos controles no verifican con cada método */
export function panelCombinado(c: H) {
  const cmp = estado.calculo.combinado;
  if (!cmp) return;
  c.append(h('div', { class: 'kpis' }, ...METODOS_COMPARADOS.map(m => {
    const r = cmp.resumen[m];
    return kpi(NOMBRE[m], r.noVerifican ? `${r.noVerifican} no verifican` : 'verifica', `${r.calculados} controles · ${r.atencion} a revisar`, r.noVerifican ? 'var(--mal)' : r.atencion ? 'var(--revisar)' : 'var(--ok)');
  })));
  c.append(h('p', { class: 'nota' }, 'El método Combinado no tiene reglas propias: corre los cuatro métodos con la misma torre y los compara. Las demás etapas muestran la Planilla virgen; elegí otro método arriba para ver sus etapas.'));
  const cu = seccion('Cómo se calculó cada uno').cuerpo; c.append(cu.parentElement!);
  METODOS_COMPARADOS.forEach(m => cu.append(h('p', { class: 'nota' }, h('b', {}, `${describirConfig(cmp.configs[m])}. `), METODOS[m].reglas)));
}

/** centro: la tabla, capa por capa */
export function centroCombinado(c: H) {
  const cmp = estado.calculo.combinado;
  if (!cmp) { c.append(h('p', { class: 'nota' }, 'Calculando…')); return; }
  for (const capa of Object.keys(TITULO_CAPA) as Capa[]) {
    const filas = cmp.filas.filter(f => f.capa === capa && METODOS_COMPARADOS.some(m => f.valores[m] !== null));
    if (!filas.length) continue;
    const t = h('table', { class: 'tabla compacta' });
    t.append(h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, ''), ...METODOS_COMPARADOS.map(m => h('th', {}, NOMBRE[m])), ...METODOS_COMPARADOS.slice(1).map(m => h('th', {}, `Δ ${NOMBRE[m]}`)))));
    const tb = h('tbody');
    for (const f of filas) {
      const ref = f.valores.planilla !== null ? 'planilla' : 'guia';
      tb.append(h('tr', { title: f.nota ?? '' }, h('td', {}, f.nombre), h('td', { class: 'chica' }, f.unidad),
        ...METODOS_COMPARADOS.map(m => h('td', { class: `n ${claseEstado(f.estados?.[m])}` }, f.valores[m] === null ? '—' : fmt(f.valores[m]!, decimales(f)))),
        ...METODOS_COMPARADOS.slice(1).map(m => {
          const d = m === ref ? null : diferencia(f, m);
          return h('td', { class: 'n chica' }, d === null ? '' : `${d > 0 ? '+' : ''}${fmt(d, 0)} %`);
        })));
    }
    t.append(tb);
    c.append(seccion(TITULO_CAPA[capa], h('p', { class: 'nota' }, `De dónde salen las diferencias: ${CAPAS[capa]}.`), h('div', { class: 'scroll' }, t)).el);
  }
  c.append(h('p', { class: 'nota' }, 'Δ: diferencia contra la Planilla virgen (contra la Guía donde la planilla no lo calcula). Color: el estado del control de cada método (verde verifica, naranja a revisar, rojo no verifica). Pasá el mouse por una fila para ver su nota.'));
}
