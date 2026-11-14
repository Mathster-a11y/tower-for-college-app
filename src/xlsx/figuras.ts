/**
 * Dibujos explicativos de las hojas originales, rediseñados (tools/figuras): se ponen como imágenes sobre la hoja,
 * en el lugar de la figura original. Las celdas no se tocan; las formas originales de esa hoja quedan en el archivo,
 * ocultas (en Excel: Inicio → Buscar y seleccionar → Panel de selección para volver a mostrarlas).
 * Google Sheets no importa las formas de Excel pero sí las imágenes: así los dibujos también se ven ahí.
 */
import type JSZip from 'jszip';

export interface MetaFigura { W: number; H: number; ancla: string | null; pos?: { col: number; fila: number; dx: number; dy: number }; hojas: string[] }
/** imagen ubicada: columna y fila desde 0, desfasaje y tamaño en píxeles de la hoja */
export interface FiguraPlanilla { nombre: string; hoja: string; png: Uint8Array; col: number; fila: number; dx: number; dy: number; ancho: number; alto: number }

const MARCA = 'oculto por Torre 3D';
const NOMBRE = 'T3D figura';
const EMU = 9525;

/** figuras.json + los PNG → dónde va cada imagen */
export function figurasDesdeMeta(meta: Record<string, MetaFigura>, png: (nombre: string) => Uint8Array | undefined): FiguraPlanilla[] {
  const out: FiguraPlanilla[] = [];
  for (const [nombre, m] of Object.entries(meta)) {
    const bytes = png(nombre);
    if (!bytes?.length) continue;
    let col = 0, fila = 0, dx = 0, dy = 0;
    if (m.ancla) {
      const a = /^([A-Z]+)(\d+)$/.exec(m.ancla)!;
      col = [...a[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1; fila = +a[2] - 1;
    } else if (m.pos) { col = m.pos.col - 1; fila = m.pos.fila - 1; dx = m.pos.dx; dy = m.pos.dy; }
    for (const hoja of m.hojas) out.push({ nombre, hoja, png: bytes, col, fila, dx, dy, ancho: m.W, alto: m.H });
  }
  return out;
}

const ANCLA = /<xdr:(oneCellAnchor|twoCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:\1>/g;

/**
 * Pone las figuras sobre sus hojas (y oculta las formas originales de esas hojas). Con una lista vacía deja la
 * planilla como estaba: saca las figuras puestas antes y vuelve a mostrar las formas que había ocultado.
 */
export async function agregarFiguras(zip: JSZip, rutas: Record<string, string>, figuras: FiguraPlanilla[]): Promise<void> {
  let ct = await zip.file('[Content_Types].xml')!.async('string');
  for (const [hoja, ruta] of Object.entries(rutas)) {
    const base = ruta.replace(/^.*\//, '');
    const relsHoja = await zip.file(`xl/worksheets/_rels/${base}.rels`)?.async('string');
    const dib = relsHoja && /Target="\.\.\/drawings\/([^"]+\.xml)"/.exec(relsHoja)?.[1];
    if (!dib) continue;
    const rutaDib = `xl/drawings/${dib}`, rutaRels = `xl/drawings/_rels/${dib}.rels`;
    let xml = await zip.file(rutaDib)?.async('string');
    if (!xml) continue;
    const propias = figuras.filter(f => f.hoja === hoja);
    const teniaFiguras = xml.includes(`name="${NOMBRE}`), teniaOcultas = xml.includes(MARCA);
    if (!propias.length && !teniaFiguras && !teniaOcultas) continue;
    // 1) fuera las figuras de una escritura anterior; las formas que se habían ocultado vuelven a verse
    xml = xml.replace(ANCLA, a => (a.includes(`name="${NOMBRE}`) ? '' : a)).split(` hidden="1" descr="${MARCA}"`).join('');
    let rels = await zip.file(rutaRels)?.async('string') ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    rels = rels.replace(/<Relationship\b[^>]*Id="rIdT3Dfig\d+"[^>]*\/>/g, '');
    if (propias.length) {
      // 2) las formas originales (no los gráficos) quedan ocultas: la figura nueva las reemplaza
      xml = xml.replace(ANCLA, a => (/<xdr:(sp|cxnSp)[\s>]/.test(a) && !/<xdr:cNvPr\b[^>]*\bhidden=/.test(a) ? a.replace(/<xdr:cNvPr\b/, `<xdr:cNvPr hidden="1" descr="${MARCA}"`) : a));
      // 3) las imágenes
      const nuevas = propias.map((f, k) => {
        const media = `t3d_fig_${f.nombre}.png`;
        zip.file(`xl/media/${media}`, f.png);
        rels = rels.replace('</Relationships>', `<Relationship Id="rIdT3Dfig${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${media}"/></Relationships>`);
        const cx = f.ancho * EMU, cy = f.alto * EMU;
        return `<xdr:oneCellAnchor><xdr:from><xdr:col>${f.col}</xdr:col><xdr:colOff>${f.dx * EMU}</xdr:colOff><xdr:row>${f.fila}</xdr:row><xdr:rowOff>${f.dy * EMU}</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/>`
          + `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${9000 + k}" name="${NOMBRE} ${f.nombre}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>`
          + `<xdr:blipFill><a:blip r:embed="rIdT3Dfig${k + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>`
          + `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
      });
      xml = xml.replace('</xdr:wsDr>', nuevas.join('') + '</xdr:wsDr>');
      if (!/Extension="png"/i.test(ct)) ct = ct.replace('<Default ', '<Default Extension="png" ContentType="image/png"/><Default ');
    }
    zip.file(rutaDib, xml);
    zip.file(rutaRels, rels);
  }
  zip.file('[Content_Types].xml', ct);
}
