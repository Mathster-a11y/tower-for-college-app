/**
 * Un pedazo de la página (por ejemplo, un esquema de Ecuaciones) como imagen PNG o JPEG, tal como se ve: se copia con
 * los estilos calculados de cada elemento y las tipografías de la app adentro de un SVG (foreignObject), se dibuja en un
 * lienzo al doble de resolución y se descarga. Con el tema claro, sobre fondo blanco, para imprimir o pegar en la lámina.
 */
const PROPS_FUERA = new Set(['zoom', 'cursor', 'transition', 'animation', 'will-change', 'pointer-events', 'user-select', '-webkit-user-select']);

/** copia en el clon los estilos calculados del original, elemento por elemento */
function copiarEstilos(orig: Element, clon: Element) {
  const cs = getComputedStyle(orig);
  let css = '';
  for (let i = 0; i < cs.length; i++) {
    const p = cs[i];
    if (PROPS_FUERA.has(p) || p.startsWith('--') || p.startsWith('transition') || p.startsWith('animation')) continue;
    css += `${p}:${cs.getPropertyValue(p)};`;
  }
  (clon as HTMLElement).setAttribute('style', css);
  const a = orig.children, b = clon.children;
  for (let i = 0; i < a.length && i < b.length; i++) copiarEstilos(a[i], b[i]);
  // los campos llevan su valor como atributo (el clon no copia lo escrito)
  if (orig instanceof HTMLInputElement) (clon as HTMLInputElement).setAttribute('value', orig.value);
}

/** las @font-face de la página con sus archivos adentro (data:), para que la imagen use las mismas letras */
async function fuentesIncrustadas(): Promise<string> {
  const reglas: { t: string; base: string }[] = [];
  for (const hoja of [...document.styleSheets]) {
    let rs: CSSRuleList;
    try { rs = hoja.cssRules; } catch { continue; }                       // hojas de otro origen
    // las direcciones de las fuentes son relativas a la hoja de estilos, no a la página
    for (const r of [...rs]) if (r instanceof CSSFontFaceRule) reglas.push({ t: r.cssText, base: hoja.href ?? document.baseURI });
  }
  const conDatos = await Promise.all(reglas.map(async ({ t, base }) => {
    const m = /url\(["']?([^"')]+)["']?\)/.exec(t);
    if (!m || m[1].startsWith('data:')) return t;
    try {
      const blob = await (await fetch(new URL(m[1], base).href)).blob();
      const datos = await new Promise<string>((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = mal; fr.readAsDataURL(blob); });
      return t.replace(m[0], `url("${datos}")`);
    } catch { return ''; }
  }));
  return conDatos.filter(Boolean).join('\n');
}

export async function elementoAImagen(el: HTMLElement, tipo: 'png' | 'jpeg', nombre: string, escala = 2): Promise<void> {
  const raiz = document.documentElement, temaAntes = raiz.dataset.theme;
  raiz.dataset.theme = 'light';
  try {
    await new Promise(r => requestAnimationFrame(() => r(null)));
    const zoomAntes = el.style.zoom;
    el.style.zoom = '';
    const w = Math.ceil(el.scrollWidth), h = Math.ceil(el.scrollHeight);
    const clon = el.cloneNode(true) as HTMLElement;
    copiarEstilos(el, clon);
    el.style.zoom = zoomAntes;
    clon.style.margin = '0'; clon.style.transform = 'none'; clon.style.translate = 'none';
    clon.style.width = `${w}px`; clon.style.height = `${h}px`;
    clon.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    const fuentes = await fuentesIncrustadas();
    const xml = new XMLSerializer().serializeToString(clon);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><style>${fuentes.replace(/]]>/g, '')}</style><foreignObject x="0" y="0" width="${w}" height="${h}">${xml}</foreignObject></svg>`;
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((ok, mal) => { img.onload = () => ok(); img.onerror = () => mal(new Error('El navegador no pudo dibujar el esquema como imagen.')); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
    // los lienzos tienen un tope de tamaño: se baja la escala si hace falta
    const k = Math.max(0.5, Math.min(escala, 16000 / Math.max(w, h), Math.sqrt(120e6 / (w * h))));
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    const g = cv.getContext('2d')!;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);
    g.scale(k, k);
    g.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>(ok => cv.toBlob(ok, `image/${tipo}`, 0.92));
    if (!blob) throw new Error('No se pudo armar la imagen.');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${nombre}.${tipo === 'jpeg' ? 'jpg' : 'png'}`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } finally {
    if (temaAntes === undefined) delete raiz.dataset.theme; else raiz.dataset.theme = temaAntes;
  }
}
