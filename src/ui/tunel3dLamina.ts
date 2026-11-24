/**
 * Túnel 3D → lámina «Estudio de viento» (etapa 6 de la propuesta de resultados): una hoja por bloque, como los informes
 * de las consultoras de viento. Portada con la vista 3D y los datos de la simulación; estructura (fuerzas), fachada,
 * confort en la torre (dinámica) y calle (rosa de vientos). Usa lo que ya muestran los paneles (copiados, con los
 * dibujos pasados a imágenes y sin botones), así la lámina y la app dicen lo mismo. Se imprime o se guarda en PDF con
 * el diálogo del navegador, como las guías de cálculo.
 */
import { estado, fmt } from './estado';
import { h } from './comp';

export interface BloqueLamina { titulo: string; el: HTMLElement | null; nota: string }

/** copia un panel para imprimir: los lienzos como imágenes, las listas como texto, sin botones ni entradas */
function copiar(el: HTMLElement): HTMLElement {
  const c = el.cloneNode(true) as HTMLElement;
  const orig = [...el.querySelectorAll('canvas')], copias = [...c.querySelectorAll('canvas')];
  copias.forEach((cv, i) => {
    const img = document.createElement('img');
    try { img.src = orig[i].toDataURL('image/png'); } catch { /* lienzo sin datos */ }
    img.style.width = orig[i].style.width || `${orig[i].width}px`; img.style.maxWidth = '100%';
    img.className = orig[i].className; cv.replaceWith(img);
  });
  c.querySelectorAll('select').forEach((s, i) => { const o = el.querySelectorAll('select')[i] as HTMLSelectElement | undefined; const t = document.createElement('strong'); t.textContent = o?.selectedOptions[0]?.text ?? ''; s.replaceWith(t); });
  c.querySelectorAll('input[type="number"], input[type="text"]').forEach((x, i) => { const o = el.querySelectorAll('input[type="number"], input[type="text"]')[i] as HTMLInputElement | undefined; const t = document.createElement('strong'); t.textContent = o?.value ?? ''; x.replaceWith(t); });
  c.querySelectorAll('button, input[type="range"], input[type="checkbox"], .fila-acciones:empty').forEach(x => x.remove());
  c.querySelectorAll('details').forEach(d => d.setAttribute('open', ''));
  return c;
}

export async function abrirLamina(vista: HTMLCanvasElement | null, datos: string[], bloques: BloqueLamina[]) {
  document.querySelector('.guia-impresion')?.remove();
  const raiz = h('div', { class: 'guia-impresion lamina-viento' });
  const temaAntes = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = 'light';
  const cerrar = () => { raiz.remove(); document.body.classList.remove('con-guia'); if (temaAntes === undefined) delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = temaAntes; };
  const bImp = h('button', { type: 'button', class: 'boton primario' }, 'Imprimir o guardar en PDF');
  bImp.addEventListener('click', () => window.print());
  const bCer = h('button', { type: 'button', class: 'boton' }, 'Cerrar');
  bCer.addEventListener('click', cerrar);
  raiz.append(h('div', { class: 'guia-barra' }, h('strong', {}, 'Estudio de viento'), h('span', { class: 'nota' }, 'Una hoja A4 por bloque.'), bImp, bCer));
  const p = estado.proyecto, img = h('img', { class: 'lamina-vista', alt: 'La torre en el túnel de viento 3D' }) as HTMLImageElement;
  try { if (vista) img.src = vista.toDataURL('image/png'); } catch { /* sin imagen */ }
  raiz.append(h('section', { class: 'guia-portada' },
    h('p', { class: 'guia-sobre' }, 'Torre 3D · túnel de viento 3D'),
    h('h1', {}, 'Estudio de viento'),
    h('p', { class: 'guia-sub' }, `${p.nombre || 'Proyecto sin nombre'} · viento ${estado.dir} · ${new Date().toLocaleDateString('es-AR')}`),
    ...(img.src ? [img] : []),
    h('ul', {}, ...datos.map(t => h('li', {}, t))),
    h('p', { class: 'nota' }, 'Estudio didáctico hecho con una simulación de Lattice Boltzmann en el navegador (grilla gruesa, Reynolds bajo y viento de entrada sin turbulencia). Sirve para entender el comportamiento y comparar formas; no reemplaza los coeficientes del CIRSOC 102 ni un ensayo en túnel de viento. El cálculo de la entrega sigue con el reglamento.')));
  for (const b of bloques) {
    if (!b.el || !b.el.childElementCount) continue;
    raiz.append(h('section', { class: 'guia-cap' }, h('h2', {}, b.titulo), copiar(b.el), h('p', { class: 'nota lamina-advertencia' }, b.nota)));
  }
  document.body.classList.add('con-guia');
  document.body.append(raiz);
  await new Promise(res => setTimeout(res, 300));
  raiz.dataset.listo = '1';
}
/** el texto de los datos de la simulación para la portada */
export const lineaDatos = (rot: string, v: string) => `${rot}: ${v}`;
export { fmt };
