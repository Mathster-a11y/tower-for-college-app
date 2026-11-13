import { hacerZoomable } from './zoomDibujo';
/**
 * Exportar dibujos: cada dibujo del centro se puede guardar como SVG (vectorial, para editar o imprimir) o
 * como PNG (imagen). Para que se vea igual fuera de la app, se copian a cada elemento los estilos que le da la
 * hoja de estilos (colores del tema, grosores, trazos, letras).
 */
const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline', 'paint-order', 'display', 'visibility'];

/** copia autónoma del SVG, con los estilos calculados escritos en cada elemento y un fondo */
export function svgAutonomo(svg: SVGSVGElement): { texto: string; ancho: number; alto: number } {
  const copia = svg.cloneNode(true) as SVGSVGElement;
  const orig = [svg, ...svg.querySelectorAll('*')], dest = [copia, ...copia.querySelectorAll('*')];
  orig.forEach((o, i) => {
    const cs = getComputedStyle(o as Element), d = dest[i] as SVGElement;
    d.setAttribute('style', PROPS.map(p => `${p}:${cs.getPropertyValue(p)}`).join(';'));
    d.removeAttribute('class');
  });
  // si el dibujo está acercado, se guarda entero (el viewBox original)
  const v0 = svg.dataset.vb0?.split(' ').map(Number);
  if (v0?.length === 4) copia.setAttribute('viewBox', v0.join(' '));
  const vb = v0?.length === 4 ? { x: v0[0], y: v0[1], width: v0[2], height: v0[3] } : svg.viewBox.baseVal;
  const ancho = vb && vb.width ? vb.width : svg.clientWidth || 800, alto = vb && vb.height ? vb.height : svg.clientHeight || 600;
  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copia.setAttribute('width', String(ancho)); copia.setAttribute('height', String(alto));
  const fondo = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  fondo.setAttribute('x', String(vb?.x ?? 0)); fondo.setAttribute('y', String(vb?.y ?? 0));
  fondo.setAttribute('width', String(ancho)); fondo.setAttribute('height', String(alto));
  fondo.setAttribute('fill', getComputedStyle(document.documentElement).getPropertyValue('--lienzo').trim() || '#ffffff');
  copia.insertBefore(fondo, copia.firstChild);
  return { texto: new XMLSerializer().serializeToString(copia), ancho, alto };
}

function bajar(nombre: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function guardarSVG(svg: SVGSVGElement, nombre: string) {
  bajar(`${nombre}.svg`, new Blob([svgAutonomo(svg).texto], { type: 'image/svg+xml' }));
}
export function guardarPNG(svg: SVGSVGElement, nombre: string, escala = 2) {
  const { texto, ancho, alto } = svgAutonomo(svg);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = Math.round(ancho * escala); c.height = Math.round(alto * escala);
    const ctx = c.getContext('2d')!;
    ctx.scale(escala, escala); ctx.drawImage(img, 0, 0, ancho, alto);
    c.toBlob(b => { if (b) bajar(`${nombre}.png`, b); }, 'image/png');
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(texto)}`;
}

/** agrega «SVG · PNG» arriba de cada dibujo del contenedor */
export function botonesExportar(cont: HTMLElement, base: string) {
  const dibujos = [...cont.querySelectorAll<SVGSVGElement>('svg.grafico, svg.funicular, svg.carta, svg.rototrasl, svg.perfil')].filter(s => !s.parentElement?.closest('svg'));   // solo los dibujos de afuera, no los anidados
  dibujos.forEach((s, i) => {
    if (s.previousElementSibling?.classList.contains('exportar-dibujo')) return;
    const nombre = `${base}${dibujos.length > 1 ? `_${i + 1}` : ''}`;
    const barra = document.createElement('div');
    barra.className = 'exportar-dibujo';
    const b = (t: string, titulo: string, f: () => void) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = t; x.title = titulo; x.addEventListener('click', f); return x; };
    barra.append(b('⤓ SVG', 'Guardar este dibujo como SVG (vectorial: se puede editar o imprimir sin perder calidad)', () => guardarSVG(s, nombre)),
      b('⤓ PNG', 'Guardar este dibujo como imagen PNG (al doble de resolución)', () => guardarPNG(s, nombre)));
    s.before(barra);
    // los funiculares y la rototraslación se pueden acercar (muchos vectores chicos juntos)
    if (s.matches('svg.funicular, svg.rototrasl')) hacerZoomable(s, barra, nombre);
  });
}
