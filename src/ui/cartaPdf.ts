/**
 * «Carta PDF»: solo la carta de la torre, una hoja A4 apaisada por carta y por viento (A · M, N y Q; B · ficha;
 * C · axonometría con la torre deformada y el viento; D · vuelco y suelo), con un rótulo y los controles principales.
 * Se arma fuera de la pantalla y se abre el diálogo de impresión (guardar como PDF).
 */
import { estado } from './estado';
import { carta, type Variante } from './carta';
import { datosCarta } from './etapas';
import { AVISO } from '../autoria';
import { h } from './comp';

const CARTAS: [Variante, string, string][] = [
  ['C', 'La torre en el espacio', 'La torre como una ménsula: el viento de cada piso (volumen naranja), la torre deformada exagerada y su sombra, el diagrama de momentos y las reacciones en la base.'],
  ['A', 'Viento, corte, momento y peso', 'A la misma altura que el alzado: el viento de cada piso Wi, el corte Q, el momento M y el peso N de cada nivel.'],
  ['D', 'Vuelco y suelo', 'El momento volcador del viento contra el equilibrante del peso, alrededor del punto de giro; dónde cae la resultante y las tensiones en el suelo.'],
  ['B', 'Ficha de la torre', 'Planta con piezas, ejes y centro de rigidez; alzado con la resultante y la deformada; los valores principales.'],
];

export function armarCartaPdf(): HTMLElement {
  const p = estado.proyecto, dirAntes = estado.dir;
  const doc = h('div', { class: 'carta-pdf' });
  const hoy = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  let n = 0;
  try {
    for (const dir of ['A', 'B'] as const) {
      estado.dir = dir;
      const dc = datosCarta();
      if (!dc) continue;
      for (const [v, titulo, texto] of CARTAS) {
        n++;
        const hoja = h('section', { class: 'cp-hoja' });
        hoja.append(h('header', { class: 'cp-cab' },
          h('div', {}, h('b', {}, `${titulo} · viento ${dir}`), h('span', {}, texto)),
          h('div', { class: 'cp-rotulo' }, h('b', {}, p.nombre || 'Proyecto'), h('span', {}, `${p.alumno ? p.alumno + ' · ' : ''}${hoy} · hoja ${n} de 8`))));
        const s = carta(dc, v, 1100);
        s.classList.add('cp-carta');
        hoja.append(s);
        if (dc.controles?.length) {
          hoja.append(h('footer', { class: 'cp-pie' }, ...dc.controles.slice(0, 6).map(c => h('span', { class: `cp-ctrl ${c.estado}` }, h('i', {}), `${c.nombre}: ${c.valor}`)), h('span', { class: 'cp-marca' }, `Torre 3D · ${AVISO}`)));
        }
        doc.append(hoja);
      }
    }
  } finally { estado.dir = dirAntes; }
  return doc;
}

/** arma la carta, abre el diálogo de impresión (A4 apaisado) y la quita al terminar */
export function imprimirCartaPdf() {
  document.querySelector('.carta-pdf')?.remove();
  const raiz = document.documentElement, temaAntes = raiz.getAttribute('data-theme');
  raiz.setAttribute('data-theme', 'light');
  const doc = armarCartaPdf();
  document.body.append(doc);
  const pagina = document.createElement('style');
  pagina.textContent = '@page { size: 297mm 210mm; margin: 0; }';
  document.head.append(pagina);
  document.body.classList.add('imprimiendo');
  const fin = () => {
    document.body.classList.remove('imprimiendo'); doc.remove(); pagina.remove(); window.removeEventListener('afterprint', fin);
    if (temaAntes === null) raiz.removeAttribute('data-theme'); else raiz.setAttribute('data-theme', temaAntes);
  };
  window.addEventListener('afterprint', fin);
  setTimeout(() => window.print(), 60);
}
