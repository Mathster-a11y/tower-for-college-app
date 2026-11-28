/**
 * Avisos de lo que no verifica: al tocar el chip de estado del cálculo se abre la lista de los controles que no
 * verifican (y los que piden atención), cada uno con su valor contra el criterio, qué cambiar para que verifique y un
 * botón que lleva a la etapa (y al viento) donde se ve y se arregla.
 */
import type { Control } from '../engine/verificaciones';
import { fmt } from './estado';

export interface Consejo { etapa: string; nombreEtapa: string; texto: string }

const ETAPA: Record<string, string> = {
  diseno: '01 Diseño', viento: '02 Viento', fuerzas: '03 Fuerzas', estabilidad: '04 Estabilidad', rigidez: '05 Rigidez',
  rototrasl: '06 Rototraslación', flexion: '07 Flexión', exo: '08 Exoesqueleto', resumen: 'Resumen',
};
const con = (etapa: string, texto: string): Consejo => ({ etapa, nombreEtapa: ETAPA[etapa] ?? etapa, texto });

/** el viento del control («…, viento A»), si lo dice */
export function vientoDe(c: Control): 'A' | 'B' | null {
  const m = /viento ([AB])\b/.exec(`${c.grupo} ${c.nombre}`);
  return m ? (m[1] as 'A' | 'B') : null;
}

/** qué hacer para que el control verifique, y en qué etapa se ve */
export function consejo(c: Control): Consejo {
  const n = c.nombre, g = c.grupo, d = vientoDe(c), enD = d ? ` en el viento ${d}` : '';
  if (g.startsWith('Flexocompresión')) {
    if (/tracción/.test(n)) return con('flexion', 'El tabique descargado queda traccionado: lleva armadura (la calcula Flexión). Para evitarla, que cargue más peso (más área de losa en Diseño → Áreas) o que sea más largo, así la tensión por el momento baja.');
    return con('flexion', 'El hormigón no alcanza a compresión: subí la calidad del hormigón (Diseño → Materiales y fundación) o hacé el tabique más largo o más grueso para repartir la carga.');
  }
  if (g.startsWith('Corte en dinteles')) return con('flexion', 'El dintel sobre la abertura no alcanza al corte: hacé la abertura más angosta o más baja (Diseño → Calar), o subí la calidad del hormigón.');
  if (g === 'Exoesqueleto') {
    if (/Desplazamiento/.test(n)) return con('exo', 'La azotea se mueve de más con el exo: más sección en las barras o un módulo de diagrid más cerrado (Exoesqueleto → Dimensionar).');
    return con('exo', 'Alguna barra del exo no alcanza: «Dimensionar» en Exoesqueleto agranda los perfiles; también ayuda achicar el módulo o la luz de pandeo.');
  }
  if (g === 'Rigidez') {
    if (/ΣJ/.test(n)) return con('rigidez', `Falta inercia${enD}: alargá los tabiques paralelos a ese viento, pegá alas para formar piezas en L, T o C (Armar) o sumá un núcleo. Los tabiques sueltos casi no suman J.`);
    return con('rigidez', `La torre se deforma de más${enD}: más J en esa dirección (tabiques más largos o piezas armadas) o un hormigón más rígido.`);
  }
  if (g === 'Viento') {
    if (/Frecuencia/.test(n)) return con('viento', `Edificio flexible${enD} (F < 1 Hz): la ráfaga se calcula dinámica. Si no es lo que querés, rigidizá la torre (más J) o bajá la altura.`);
    return con('viento', 'La carga de viento quedó por debajo del mínimo del reglamento: revisá la velocidad básica, la exposición y el ancho de las caras en Viento.');
  }
  if (g === 'Diseño') return con('diseno', 'La torre es muy esbelta para ese viento: ensanchá la planta en esa dirección o bajá la altura.');
  if (g === 'Reparto') {
    if (/Σ J·a/.test(n)) return con('rototrasl', 'El eje de inercia no cierra: revisá que cada tabique esté en su pieza y con su dirección (Diseño → Piezas).');
    return con('rototrasl', 'Considerá la torsión del caso 2 del CIRSOC: el reparto de la rototraslación ya la suma; revisá que el centro de rigidez quede cerca del centro de la planta.');
  }
  if (g === 'Funicular') return con('estabilidad', `La resultante sale del núcleo central${enD}: agrandá la platea en esa dirección o sumá peso abajo.`);
  if (g === 'Estabilidad') {
    if (/Vuelco/.test(n)) return con('estabilidad', 'El peso no alcanza a equilibrar el vuelco: platea más ancha (Diseño → Materiales y fundación), más peso propio o menos altura.');
    if (/Excentricidad/.test(n)) return con('estabilidad', 'La resultante cae fuera del tercio medio de la platea: agrandala en la dirección del viento o sumá peso.');
    if (/Tensión máxima/.test(n)) return con('estabilidad', 'El suelo recibe más de lo que admite: platea más grande, o una tensión admisible mayor si el estudio de suelos la da (Diseño → Materiales y fundación).');
    if (/Tensión mínima/.test(n)) return con('estabilidad', 'Hay tracción bajo la platea (se levanta un borde): agrandala o sumá peso.');
    if (/Profundidad/.test(n)) return con('diseno', 'El estudio de suelos tiene que llegar más hondo: corregí su profundidad en Diseño → Materiales y fundación.');
    if (/P-Δ/.test(n)) return con('estabilidad', `El peso sobre la torre deformada pesa de más${enD}: rigidizá la torre (más J) para que se deforme menos.`);
    return con('estabilidad', 'Revisá la estabilidad de la torre con el viento excéntrico: más rigidez a torsión (núcleos cerrados) o una planta más simétrica.');
  }
  return con('resumen', 'Revisá el detalle en Resumen.');
}

/** el valor del control y su unidad, para mostrar contra el criterio */
export function valorDe(c: Control): string {
  const v = c.guia ?? c.planilla;
  if (v === null || v === undefined || !isFinite(v)) return '';
  return `${fmt(v, Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 3)}${c.unidad ? ` ${c.unidad}` : ''}`;
}

/**
 * La lista para el desplegable del chip. «ir» lleva a la etapa (y fija el viento si el control es de uno).
 */
export function listaAvisos(cs: Control[], ir: (etapa: string, dir: 'A' | 'B' | null) => void, nota?: string): HTMLElement {
  const caja = document.createElement('div');
  caja.className = 'avisos-calculo';
  const malos = cs.filter(c => c.estado === 'no verifica'), atencion = cs.filter(c => c.estado === 'atención');
  const tit = document.createElement('b');
  tit.textContent = malos.length ? `${malos.length} control${malos.length > 1 ? 'es' : ''} no verifica${malos.length > 1 ? 'n' : ''}` : 'Todo verifica';
  caja.append(tit);
  if (nota) { const p = document.createElement('div'); p.className = 'av-criterio'; p.textContent = nota; caja.append(p); }
  const item = (c: Control) => {
    const k = consejo(c), d = vientoDe(c);
    const li = document.createElement('li');
    li.className = c.estado === 'no verifica' ? 'mal' : 'revisar';
    const cab = document.createElement('div'); cab.className = 'av-cab';
    const nom = document.createElement('span'); nom.className = 'av-nombre'; nom.textContent = c.grupo.startsWith('Flexocompresión') || c.grupo.startsWith('Corte') ? `${c.grupo} · ${c.nombre}` : c.nombre;
    const val = document.createElement('span'); val.className = 'av-valor'; val.textContent = valorDe(c);
    cab.append(nom, val);
    const cri = document.createElement('div'); cri.className = 'av-criterio'; cri.textContent = `Pide: ${c.criterio}${c.nota ? ` · ${c.nota}` : ''}`;
    const qh = document.createElement('div'); qh.className = 'av-consejo'; qh.textContent = k.texto;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'av-ir';
    b.textContent = `Ir a ${k.nombreEtapa}${d ? ` · viento ${d}` : ''} ›`;
    b.addEventListener('click', () => ir(k.etapa, d));
    li.append(cab, cri, qh, b);
    return li;
  };
  if (malos.length) { const ul = document.createElement('ul'); ul.append(...malos.map(item)); caja.append(ul); }
  if (atencion.length) {
    const st = document.createElement('div'); st.className = 'av-sub'; st.textContent = `A revisar (verifican, pero piden atención): ${atencion.length}`;
    const ul = document.createElement('ul'); ul.append(...atencion.map(item));
    const det = document.createElement('details'); const sm = document.createElement('summary'); sm.append(st); det.append(sm, ul);
    if (!malos.length) det.open = true;
    caja.append(det);
  }
  const pie = document.createElement('button'); pie.type = 'button'; pie.className = 'av-todo'; pie.textContent = 'Ver todos los controles en Resumen ›';
  pie.addEventListener('click', () => ir('resumen', null));
  caja.append(pie);
  return caja;
}
