/**
 * Informe para imprimir (o guardar como PDF desde el diálogo de impresión): datos del proyecto, la carta de cada
 * viento (lámina M, N y Q y ficha), la rototraslación en planta y todos los controles. Se arma en un contenedor
 * aparte que solo se ve al imprimir.
 */
import { estado, fmt } from './estado';
import { h, esc } from './comp';
import { carta } from './carta';
import { datosCarta, datosRotoPlanoActual, tablaControles } from './etapas';
import { dibujoRototraslacion } from './rototraslacion';
import { tablaValores } from './diagramas';

export function armarInforme(): HTMLElement {
  const p = estado.proyecto;
  const dirAntes = estado.dir;
  const doc = h('div', { class: 'informe' });
  const hoy = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.append(h('header', { class: 'inf-portada' },
    h('div', { class: 'inf-marca' }, 'TORRE 3D · Edificios en torre (FAUD-UNMDP)'),
    h('h1', {}, p.nombre || 'Proyecto'),
    h('p', {}, `${hoy} · hormigón ${p.hormigon || 'H30'} · ${estado.fuente === 'guia' ? 'valores Guía/CIRSOC' : 'valores de la planilla'}`)));
  // datos
  const sDatos = h('section', { class: 'inf-hoja' }, h('h2', {}, '1 · Datos del edificio'));
  sDatos.append(h('h3', {}, 'Niveles'), tablaValores(['Nivel', 'cota (m)', 'B (m)', 'L (m)'], p.niveles.map(n => [n.nombre, n.cota, n.B ?? '', n.L ?? '']), [0, 2, 2, 2]));
  sDatos.append(h('h3', {}, 'Muros'), tablaValores(['Muro', 'tipo', 'x (m)', 'y (m)', 'largo (m)', 'espesor (m)', 'desde', 'hasta'],
    p.muros.map(m => [m.id, m.tipo ?? 'tabique', m.x, m.y, m.largo, m.espesor, m.zDesde ?? '—', m.zHasta ?? '—']), [0, 0, 2, 2, 2, 2, 2, 2]));
  doc.append(sDatos);
  // cartas y rototraslación de cada viento
  try {
    (['A', 'B'] as const).forEach((dir, i) => {
      estado.dir = dir;
      const dc = datosCarta();
      if (!dc) return;
      const s1 = h('section', { class: 'inf-hoja' }, h('h2', {}, `${2 + i * 2} · Viento ${dir}: M, N y Q`));
      s1.append(carta(dc, 'A', 1100), carta(dc, 'B', 1100));
      doc.append(s1);
      const s2 = h('section', { class: 'inf-hoja' }, h('h2', {}, `${3 + i * 2} · Viento ${dir}: rototraslación`));
      const dp = datosRotoPlanoActual();
      s2.append(h('p', {}, `ΣJ = ${fmt(dp.SJ, 3)} m⁴ · e = ${fmt(Math.abs(dp.Xr))} m · Mt = ${fmt(Math.abs(dp.Mt), 1)} tm · ΣJt·a² = ${fmt(dp.SJa2, 1)} m⁶`));
      s2.append(dibujoRototraslacion(dp, 1, { ancho: 900, alto: 620 }), dibujoRototraslacion(dp, 4, { ancho: 900, alto: 620 }));
      s2.append(tablaValores(['Pieza', 'J (m⁴)', '% ΣJ', 'a (m)', 'traslación (t)', 'rotación (t)', 'total (t)'],
        dp.paralelos.map(x => [x.nombre, x.J, x.frac * 100, x.a, x.tras, x.rot, x.total]), [0, 3, 1, 2, 2, 2, 2]));
      doc.append(s2);
    });
  } finally { estado.dir = dirAntes; }
  const sC = h('section', { class: 'inf-hoja' }, h('h2', {}, '6 · Controles'));
  sC.append(tablaControles(estado.calculo.controles ?? []));
  sC.append(h('p', { class: 'inf-pie' }, 'Informe generado con Torre 3D. Los valores salen de la planilla del curso calculada en la app; la planilla .xlsx escrita por la app los recalcula en Excel.'));
  doc.append(sC);
  void esc;
  // en papel las tablas van abiertas
  doc.querySelectorAll('details').forEach(x => { (x as HTMLDetailsElement).open = true; });
  return doc;
}

/** Arma el informe, abre el diálogo de impresión y lo quita al terminar. */
export function imprimirInforme() {
  document.querySelector('.informe')?.remove();
  // en papel, siempre el tema claro
  const raiz = document.documentElement, temaAntes = raiz.getAttribute('data-theme');
  raiz.setAttribute('data-theme', 'light');
  const doc = armarInforme();
  document.body.append(doc);
  document.body.classList.add('imprimiendo');
  const fin = () => {
    document.body.classList.remove('imprimiendo'); doc.remove(); window.removeEventListener('afterprint', fin);
    if (temaAntes === null) raiz.removeAttribute('data-theme'); else raiz.setAttribute('data-theme', temaAntes);
  };
  window.addEventListener('afterprint', fin);
  setTimeout(() => window.print(), 60);
}
