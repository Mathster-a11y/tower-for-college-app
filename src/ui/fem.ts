/**
 * Vistas del método FEM (etapa 6): lo que el modelo pseudo-3D agrega a las etapas de siempre.
 *  - Rigidez: modos de vibrar (la frecuencia que entra al viento) y la deriva de servicio piso por piso.
 *  - Rototrasl.: el reparto del modelo contra el de la planilla, pieza por pieza.
 * Todo sale de estado.calculo.fem: estas vistas no calculan.
 */
import { estado, fmt } from './estado';
import { h, kpi, seccion, type H } from './comp';
import { datos201De } from '../engine/metodos/cirsoc';
import { graficoAltura, type Tam } from './diagramas';
import contrasteResumen from '../engine/contraste_resumen.json';

const fem = () => estado.calculo.fem;
const tabla = (cab: string[], filas: (string | number)[][], dec: number[] = []): H => {
  const t = h('table', { class: 'tabla' });
  t.append(h('thead', {}, h('tr', {}, ...cab.map(x => h('th', {}, x)))));
  const tb = h('tbody');
  filas.forEach(f => tb.append(h('tr', {}, ...f.map((x, i) => (typeof x === 'number' ? h('td', { class: 'n' }, fmt(x, dec[i] ?? 2)) : h('td', {}, x))))));
  t.append(tb);
  return h('div', { class: 'scroll' }, t);
};
const sentido = { x: 'en x (viento B)', y: 'en y (viento A)', giro: 'giro' };

/** Rigidez (método FEM): modos y deriva */
export function panelRigidezFem(c: H) {
  const r = fem();
  if (!r) return;
  const d = estado.dir, w = r.viento[d], der = r.deriva[d], lim = datos201De(estado.proyecto).limiteDeriva;
  const top = der.d[der.d.length - 1] ?? 0;
  let peor = 0;
  for (let i = 1; i < der.z.length; i++) { const dz = der.z[i] - der.z[i - 1]; const x = dz > 0 ? (der.d[i] - der.d[i - 1]) / dz : 0; if (x > peor) peor = x; }
  c.append(h('div', { class: 'kpis' },
    kpi(`n1, viento ${d}`, `${fmt(r.n1[d], 3)} Hz`, `${w.rigido ? 'rígido: G = 0,85' : `flexible: Gf = ${fmt(w.Gusado, 3)}`} · aprox. 102-25: ${fmt(w.n1Otros, 2)} Hz`),
    kpi('Deriva de servicio', `${fmt(top * 1000, 1)} mm`, `límite h/${lim} = ${fmt((der.h / lim) * 1000, 1)} mm · peor piso 1/${peor > 0 ? Math.round(1 / peor) : '∞'}`),
  ));
  c.append(seccion('Modelo FEM', h('p', { class: 'nota' },
    `Pseudo-3D con losas rígidas: cada piso se mueve en x, en y y gira (3 grados de libertad); cada pieza es una ménsula ${r.modelo.timo ? 'de Timoshenko (flexión + corte de las almas)' : 'de Euler-Bernoulli (solo flexión)'} que llega hasta su cota. ${r.modelo.z.length} pisos, ${r.modelo.piezas.length} piezas, E = ${fmt(r.modelo.E / 10, 0)} kg/cm². La masa de cada losa es la carga permanente D por el área de la planta más los tabiques (${fmt(r.masas.reduce((s, m) => s + m, 0) * 9.80665, 0)} t en total).`)).el);
  const modos = r.modos.slice(0, 6);
  c.append(seccion('Modos de vibrar', tabla(['Modo', 'f (Hz)', 'T (s)', 'Movimiento', '% masa x', '% masa y', '% giro'],
    modos.map((m, i) => [String(i + 1), m.f, m.T, sentido[m.dominante], m.participacion.x * 100, m.participacion.y * 100, m.participacion.giro * 100]), [0, 3, 2, 0, 0, 0, 0])).el);
  c.append(h('p', { class: 'nota' }, `La primera frecuencia con movimiento dominante ${d === 'A' ? 'en y' : 'en x'} entra al viento del CIRSOC 102-25 (art. 1.9) en lugar de la fórmula aproximada${w.aproximadaValida ? '' : ', que no vale para esta torre (h ≥ 4·Lef)'}.`));
  c.append(seccionContraste());
}

/** nombres de los casos del contraste (tools/motor_fem/casos.ts) */
const NOMBRE_CASO: Record<string, string> = { guia: 'Ejemplo de la guía', anexo: 'Guía con T5 aislado', planta34: 'Torre de 34 pisos', p4: 'P4 · asimétrica', p5: 'P5 · muros que terminan', p6: 'P6 · redonda', p8: 'P8 · con subsuelos' };
/**
 * «Contrastado con otros programas»: las torres de prueba resueltas con OpenSees y Pynite (tools/motor_fem/verificar.py)
 * y lo que difieren; el motor de la app da lo mismo que OpenSees (las pruebas de la app lo controlan en cada cambio).
 * Y el botón para bajar el contraste de la torre propia, para correrlo en Google Colab.
 */
function seccionContraste(): HTMLElement {
  // una fila por torre, con los dos vientos juntos (A / B): entra en el panel
  const torres = [...new Set(contrasteResumen.map(x => x.caso.split('_')[0]))];
  const par = (c: string, f: (x: (typeof contrasteResumen)[number]) => string) => (['A', 'B'] as const).map(v => { const x = contrasteResumen.find(y => y.caso === `${c}_${v}`); return x ? f(x) : '—'; }).join('/');
  const filas = torres.map(c => [NOMBRE_CASO[c] ?? c,
    par(c, x => (x.planillaOpenSees === null ? 'no' : fmt(x.planillaOpenSees, 2))),
    par(c, x => fmt(x.pyniteOpenSees, 2)),
    par(c, x => `+${fmt((x.flechaTimoshenko / x.flechaEuler - 1) * 100, 1)}`)]);
  const t = h('table', { class: 'tabla-contraste' },
    h('thead', {}, h('tr', {}, ...['Torre', 'Planilla', 'Pynite', 'Corte (%)'].map(x => h('th', {}, x)))),
    h('tbody', {}, ...filas.map(f => h('tr', {}, ...f.map(x => h('td', {}, x))))));
  const b = h('button', { type: 'button' }, 'Bajar el contraste de esta torre (.py)') as HTMLButtonElement;
  b.title = 'Un programa en Python que resuelve esta torre con Pynite y la compara con la app (reparto del corte y flecha). Se corre en Google Colab: primero «!pip install PyniteFEA»';
  b.addEventListener('click', () => { void import('./exportarPynite').then(m => { const t2 = m.exportarPynite(); const e = document.getElementById('mensaje'); if (e) e.textContent = t2; }); });
  return seccion('Contrastado con otros programas',
    h('p', { class: 'nota' }, 'El motor de la app se comparó con dos programas de elementos finitos independientes, OpenSees (Berkeley) y Pynite (código abierto, licencia MIT), con las mismas torres y el viento de la planilla. Con ménsulas de flexión pura (Euler) la app da lo mismo que OpenSees: las pruebas lo controlan en cada cambio.'),
    h('p', { class: 'nota chica' }, 'Cada celda, viento A / viento B. «Planilla» y «Pynite»: la diferencia más grande con OpenSees entre todas las piezas, en puntos de % del corte del viento («no»: la planilla no vale, hay muros que terminan antes de la azotea). «Corte»: cuánto más se corre la azotea al sumar la deformación por corte de las almas (Timoshenko), que la planilla no ve.'),
    h('div', { class: 'tabla-scroll' }, t),
    h('p', { class: 'nota chica' }, 'Pynite arma la losa con brazos muy rígidos pero no infinitamente rígidos: por eso difiere un poco, más en un núcleo que toma casi todo (P8) y con muros que terminan antes de la azotea (P5). Con «Bajar el contraste de esta torre» hacés lo mismo con tu proyecto, en Google Colab.'),
    h('div', { class: 'fila-acciones' }, b)).el;
}


/** centro de Rigidez (FEM): la deformada de servicio del modelo */
export function centroRigidezFem(c: H, tam: Tam) {
  const r = fem();
  if (!r) return;
  const der = r.deriva[estado.dir], lim = datos201De(estado.proyecto).limiteDeriva;
  const zPB = estado.proyecto.niveles.reduce((z, n) => (n.cota >= 0 ? n.cota : z), 0);
  const nombre = (z: number) => estado.proyecto.niveles.find(n => Math.abs(n.cota - zPB - z) < 1e-6)?.nombre ?? 'PB';
  c.append(graficoAltura({ titulo: `Deriva de servicio del modelo FEM, viento ${estado.dir} (borde más desfavorable)`, eje: 'desplazamiento', unidad: 'mm',
    series: [{ nombre: 'desplazamiento', color: 'deformada', tipo: 'linea', puntos: der.z.map((z, i) => ({ z: z + zPB, x: der.d[i] * 1000, nivel: nombre(z) })) }],
    referencias: [{ x: (der.h / lim) * 1000, texto: `h/${lim}` }] }, tam));
}

/** Rototrasl. (FEM): reparto del modelo contra el de la planilla */
export function seccionRepartoFem(): H | null {
  const r = fem();
  if (!r) return null;
  const filas = r.reparto.filter(x => x.dir === estado.dir);
  return seccion(`Reparto del modelo FEM, viento ${estado.dir} (caso 1)`,
    tabla(['Pieza', 'Planilla %', 'FEM %', 'Diferencia'], filas.map(x => [x.nombre, x.planilla, x.fem, x.fem - x.planilla]), [0, 1, 1, 1]),
    h('p', { class: 'nota' }, 'El modelo reparte el viento piso por piso con la rigidez y la posición de cada pieza; la planilla lo hace con el J en PB. Con piezas de toda la altura y Euler los dos dan lo mismo; las diferencias vienen del corte de las almas (Timoshenko), de las piezas que no llegan arriba y de los cambios de planta. La verificación del CIRSOC 201 usa los esfuerzos del modelo en los cuatro casos de carga.')).el;
}
