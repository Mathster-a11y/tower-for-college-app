/**
 * La presentación del trabajo (Exportar ▾ → Presentación del trabajo): un PowerPoint para exponer la torre, armado
 * con los números y los dibujos del proyecto abierto. El orden es el de la entrega: la carta C de portada, la lámina
 * principal A, la estabilidad (D), la rigidez y el reparto (B y la rototraslación), las verificaciones, el
 * exoesqueleto (si entra en el cálculo), el túnel de viento (con los videos de la última exportación, si los hay) y
 * las conclusiones. Cada lámina trae notas para el que expone (lo que conviene decir y de dónde sale cada número).
 */
import { estado, fmt } from './estado';
import { carta } from './carta';
import { datosCarta, datosRotoPlanoActual } from './etapas';
import { dibujoRototraslacion } from './rototraslacion';
import { aPNG } from './dibujosDesglose';
import { describirConfig } from '../engine/metodos/tipos';
import { AUTOR } from '../autoria';
import { medidasNiveles } from '../engine/perfilTorre';
import type { Control } from '../engine/verificaciones';
import { FUENTE_PPTX } from './tipografia';

const TINTA = '1F2328', GRIS = '5F6B76', AZUL = '1A6BBD', OK = '1A7A3A', MAL = 'C62828', AMBAR = '8A5F00', FUENTE = FUENTE_PPTX;
interface Img { png: string; ancho: number; alto: number }

/** un SVG a PNG fuera de la pantalla, con el tema claro */
async function imagen(svg: SVGSVGElement, caja: HTMLElement): Promise<Img | null> {
  const c = document.createElement('div'); c.append(svg); caja.replaceChildren(c);
  return aPNG(svg, 1.8);
}

/** lo que se dice en la conclusión: qué verifica, qué no y qué queda para la cátedra */
export function resumenControles(cs: Control[]): { verifican: number; noVerifican: Control[]; atencion: Control[]; total: number } {
  const calc = cs.filter(c => c.estado === 'verifica' || c.estado === 'no verifica' || c.estado === 'atención');
  return { verifican: calc.filter(c => c.estado === 'verifica').length, noVerifican: calc.filter(c => c.estado === 'no verifica'), atencion: calc.filter(c => c.estado === 'atención'), total: calc.length };
}

export async function descargarPresentacion(): Promise<number> {
  const p = estado.proyecto, cfg = describirConfig(estado.config), hoy = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  const { default: Pptx } = await import('pptxgenjs');
  const pr = new Pptx(); pr.layout = 'LAYOUT_WIDE'; pr.author = p.alumno || AUTOR; pr.title = `${p.nombre || 'Proyecto'} · presentación`;
  type Lam = ReturnType<typeof pr.addSlide>;
  let n = 0;
  const txt = (s: Lam, t: string | unknown[], o: Record<string, unknown>) => s.addText(t as never, { fontFace: FUENTE, color: TINTA, margin: 0, ...o });
  /** lámina con el marco común: banda de la sección, título, pie con el proyecto y el número */
  const lamina = (seccion: string, titulo: string, sub = '', color = AZUL): Lam => {
    const s = pr.addSlide(); n++;
    s.background = { color: 'FFFFFF' };
    s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.36, fill: { color } });
    txt(s, seccion.toUpperCase(), { x: 0.4, y: 0, w: 9, h: 0.36, fontSize: 11, bold: true, color: 'FFFFFF', valign: 'middle', charSpacing: 1 });
    txt(s, titulo, { x: 0.4, y: 0.48, w: 12.5, h: 0.6, fontSize: 26, bold: true });
    if (sub) txt(s, sub, { x: 0.4, y: 1.06, w: 12.5, h: 0.4, fontSize: 13, color: GRIS });
    txt(s, `${p.nombre || 'Proyecto'}${p.alumno ? ` · ${p.alumno}` : ''}`, { x: 0.4, y: 7.08, w: 9, h: 0.3, fontSize: 9, color: GRIS, valign: 'middle' });
    txt(s, String(n), { x: 12.3, y: 7.08, w: 0.6, h: 0.3, fontSize: 9, color: GRIS, align: 'right', valign: 'middle' });
    return s;
  };
  /** una imagen dentro de una caja, sin deformarla */
  const poner = (s: Lam, im: Img | null, x: number, y: number, w: number, h: number) => {
    if (!im) return;
    const r = Math.min(w / im.ancho, h / im.alto), ww = im.ancho * r, hh = im.alto * r;
    s.addImage({ data: im.png, x: x + (w - ww) / 2, y: y + (h - hh) / 2, w: ww, h: hh });
  };
  /** un dato grande con su título (como los recuadros de la app) */
  const dato = (s: Lam, x: number, y: number, w: number, tit: string, val: string, nota = '', color = TINTA) => {
    s.addShape('roundRect', { x, y, w, h: 0.95, fill: { color: 'F3F4F2' }, line: { color: 'DFE3E7', width: 0.75 }, rectRadius: 0.06 });
    txt(s, tit, { x: x + 0.15, y: y + 0.08, w: w - 0.3, h: 0.25, fontSize: 10.5, color: GRIS });
    txt(s, val, { x: x + 0.15, y: y + 0.32, w: w - 0.3, h: 0.38, fontSize: 19, bold: true, color });
    if (nota) txt(s, nota, { x: x + 0.15, y: y + 0.68, w: w - 0.3, h: 0.22, fontSize: 9, color: GRIS });
  };

  // ---- los dibujos (fuera de la pantalla, con el tema claro)
  const raiz = document.documentElement, temaAntes = raiz.getAttribute('data-theme'), dirAntes = estado.dir;
  raiz.setAttribute('data-theme', 'light');
  const caja = document.createElement('div'); caja.style.cssText = 'position:absolute;left:-12000px;top:0;width:1100px;background:#fff'; document.body.append(caja);
  const dib: Record<'A' | 'B', { C: Img | null; A: Img | null; D: Img | null; B: Img | null; roto: Img | null; dc: ReturnType<typeof datosCarta> }> = {} as never;
  try {
    for (const dir of ['A', 'B'] as const) {
      estado.dir = dir;
      const dc = datosCarta();
      dib[dir] = { C: null, A: null, D: null, B: null, roto: null, dc };
      if (!dc) continue;
      for (const v of ['C', 'A', 'D', 'B'] as const) dib[dir][v] = await imagen(carta(dc, v, 1100), caja);
      try { dib[dir].roto = await imagen(dibujoRototraslacion(datosRotoPlanoActual(), 4, { ancho: 900, alto: 560 }), caja); } catch { dib[dir].roto = null; }
    }
  } finally {
    caja.remove(); estado.dir = dirAntes;
    if (temaAntes === null) raiz.removeAttribute('data-theme'); else raiz.setAttribute('data-theme', temaAntes);
  }
  const dA = dib.A?.dc, dB = dib.B?.dc;
  const zTop = p.niveles[0]?.cota ?? 0, pisos = p.niveles.filter(nv => nv.cota > 0).reduce((s2, nv) => s2 + (nv.pisos && nv.pisos > 0 ? nv.pisos : 1), 0);
  // las medidas de PB (B y L se heredan del nivel de arriba si PB no las tiene cargadas)
  const ms = medidasNiveles(p), pb = ms.find(m => Math.abs(m.z) < 1e-6) ?? ms[ms.length - 1];
  const rc = resumenControles(estado.calculo.controles);

  // ---- 1 · portada: la torre en el espacio (carta C)
  {
    const s = pr.addSlide(); n++;
    s.background = { color: 'FFFFFF' };
    poner(s, dib.A?.C ?? null, 5.6, 0.3, 7.5, 6.9);
    txt(s, p.nombre || 'Proyecto', { x: 0.5, y: 1.6, w: 5.2, h: 1.6, fontSize: 32, bold: true, valign: 'bottom' });
    txt(s, 'Estructura de tabiques frente al viento', { x: 0.5, y: 3.3, w: 5.2, h: 0.5, fontSize: 16, color: GRIS });
    txt(s, [p.alumno, hoy].filter(Boolean).join(' · '), { x: 0.5, y: 3.85, w: 5.2, h: 0.4, fontSize: 13, color: GRIS });
    txt(s, cfg, { x: 0.5, y: 4.4, w: 5.0, h: 0.9, fontSize: 11, color: GRIS, valign: 'top' });
    s.addNotes(`Presentación del proyecto. La imagen es la carta C: la torre como una ménsula empotrada en la fundación, con el viento de cada piso (el volumen naranja), la deformada exagerada y el diagrama de momentos. Método de cálculo: ${cfg}.`);
  }
  // ---- 2 · la torre: datos y método
  {
    const s = lamina('La torre', 'Qué se calculó', 'Los datos del proyecto y el método');
    const filas: [string, string, string][] = [
      ['Altura sobre PB', `${fmt(zTop, 2)} m`, `${pisos} pisos`],
      ['Planta en PB', pb ? `${fmt(pb.B, 2)} × ${fmt(pb.L, 2)} m` : '—', 'B × L'],
      ['Esbeltez h / B', pb ? fmt(zTop / Math.min(pb.B, pb.L), 2) : '—', 'altura sobre el lado menor'],
      ['Hormigón', p.hormigon || 'H30', `${p.muros.length} muros en planta`],
      ['Viento A: W', dA ? `${fmt(dA.W, 1)} t` : '—', dA ? `a ${fmt(dA.hw, 2)} m de la fundación` : ''],
      ['Viento B: W', dB ? `${fmt(dB.W, 1)} t` : '—', dB ? `a ${fmt(dB.hw, 2)} m de la fundación` : ''],
    ];
    filas.forEach(([t, v, nota], i) => dato(s, 0.4 + (i % 3) * 4.2, 1.7 + Math.floor(i / 3) * 1.15, 4.0, t, v, nota));
    txt(s, [{ text: 'Método: ', options: { bold: true } }, { text: cfg }], { x: 0.4, y: 4.2, w: 12.5, h: 0.5, fontSize: 14 });
    txt(s, 'El viento empuja la torre; los tabiques (muros de hormigón) lo llevan a la fundación como una ménsula. Cada pieza toma una parte según su rigidez (J) y su posición: si el centro de rigidez no coincide con el del viento, la planta además gira (rototraslación).', { x: 0.4, y: 4.8, w: 12.5, h: 1.2, fontSize: 14, color: GRIS, valign: 'top' });
    s.addNotes('Presentar la torre: altura, planta y material. Explicar en una frase el camino de la carga: viento → losas (diafragmas) → tabiques → fundación.');
  }
  // ---- 3 · el viento: la lámina principal (carta A), un viento por lámina
  for (const dir of ['A', 'B'] as const) {
    const d = dib[dir]; if (!d?.A || !d.dc) continue;
    const s = lamina(`El viento · viento ${dir}`, `¿Cuánto viento recibe? · viento ${dir}`, `W = ${fmt(d.dc.W, 1)} t a ${fmt(d.dc.hw, 2)} m · momento en la fundación ${fmt(d.dc.Mv, 0)} tm`);
    poner(s, d.A, 0.4, 1.5, 12.5, 5.5);
    s.addNotes(`Lámina principal (carta A): la hoja «M,NyQ» dibujada nivel por nivel. A la izquierda el alzado con la presión de barlovento y la succión de sotavento; a la derecha el viento de cada piso (Wi), el corte (Q), el momento (M) y el peso (N), que crecen hacia abajo. El viento ${dir} suma W = ${fmt(d.dc.W, 1)} t, como una sola fuerza a ${fmt(d.dc.hw, 2)} m de la fundación.`);
  }
  // ---- 4 · estabilidad: vuelco y suelo (carta D)
  for (const dir of ['A', 'B'] as const) {
    const d = dib[dir]; if (!d?.D || !d.dc) continue;
    const v = d.dc.vuelco, ok = v.coef >= 1.5;
    const s = lamina(`Estabilidad · viento ${dir}`, `¿Se vuelca? ¿El suelo aguanta? · viento ${dir}`, `Me / Mv = ${fmt(v.coef, 2)} (${ok ? 'verifica: ≥ 1,5' : 'no verifica: < 1,5'}) · la resultante cae a ${fmt(v.e, 2)} m del centro`, ok ? OK : MAL);
    poner(s, d.D, 0.4, 1.5, 12.5, 5.5);
    s.addNotes(`Carta D: el peso sostiene ${fmt(v.coef, 2)} veces lo que el viento intenta volcar alrededor del punto de giro. La resultante del peso y el viento corta la base a ${fmt(v.e, 2)} m del centro (${Math.abs(v.e) <= v.nucleo ? 'dentro' : 'fuera'} del núcleo central b′/6 = ${fmt(v.nucleo, 2)} m): ${Math.abs(v.e) <= v.nucleo ? 'toda la base comprime el suelo' : 'parte de la base se levanta'}.`);
  }
  // ---- 5 · rigidez y reparto (ficha B y rototraslación)
  for (const dir of ['A', 'B'] as const) {
    const d = dib[dir]; if (!d?.B || !d.dc) continue;
    const dTop = d.dc.roto ? d.dc.roto.dTop * 1000 : NaN, lim = (d.dc.zTop / 500) * 1000;
    const s = lamina(`Rigidez y reparto · viento ${dir}`, `¿Es rígida? ¿Gira? · viento ${dir}`, isFinite(dTop) ? `La azotea se corre ${fmt(dTop, 1)} mm (límite h/500 = ${fmt(lim, 0)} mm)` : '', isFinite(dTop) && dTop > lim ? MAL : AZUL);
    poner(s, d.B, 0.4, 1.5, d.roto ? 7.2 : 12.5, 5.5);
    if (d.roto) poner(s, d.roto, 7.8, 1.6, 5.1, 5.3);
    s.addNotes('Ficha B: la planta con las piezas, su J y el centro de rigidez; el alzado con la deformada. A la derecha, la rototraslación: cuánto toma cada pieza por traslación y cuánto por el giro de la planta.');
  }
  // ---- 6 · verificaciones
  {
    const s = lamina('Verificaciones', `¿Verifica? ${rc.verifican} de ${rc.total}`, rc.noVerifican.length ? `${rc.noVerifican.length} no verifican: hay que cambiar el diseño` : rc.atencion.length ? `Ninguno da «no verifica»; ${rc.atencion.length} quedan para revisar con la cátedra` : 'Todos los controles calculados verifican', rc.noVerifican.length ? MAL : rc.atencion.length ? AMBAR : OK);
    const lista = [...rc.noVerifican, ...rc.atencion, ...estado.calculo.controles.filter(c => c.estado === 'verifica')].slice(0, 14);
    const color = (e: string) => (e === 'verifica' ? OK : e === 'no verifica' ? MAL : AMBAR);
    const celda = (t: string, o: Record<string, unknown> = {}) => ({ text: t, options: { fontFace: FUENTE, fontSize: 11, color: TINTA, valign: 'middle', ...o } });
    s.addTable([
      [celda('Control', { bold: true, color: GRIS, fill: { color: 'EEF2F6' } }), celda('Criterio', { bold: true, color: GRIS, fill: { color: 'EEF2F6' } }), celda('Valor', { bold: true, color: GRIS, fill: { color: 'EEF2F6' } }), celda('', { fill: { color: 'EEF2F6' } })],
      ...lista.map(c => [celda(c.nombre), celda(c.criterio, { color: GRIS, fontSize: 10 }), celda(c.guia !== null ? `${fmt(c.guia, 2)} ${c.unidad}` : c.planilla !== null ? `${fmt(c.planilla, 2)} ${c.unidad}` : '—'), celda(c.estado, { bold: true, color: color(c.estado) })]),
    ] as never, { x: 0.4, y: 1.6, w: 12.5, colW: [4.2, 5.2, 1.8, 1.3], border: { type: 'solid', color: 'DFE3E7', pt: 0.75 }, rowH: 0.34 });
    if (estado.calculo.controles.length > lista.length) txt(s, `(${estado.calculo.controles.length - lista.length} controles más en la app: Resumen)`, { x: 0.4, y: 6.7, w: 12.5, h: 0.3, fontSize: 10, color: GRIS });
    s.addNotes(`Los controles de la app con el método elegido: verifican ${rc.verifican} de ${rc.total}.${rc.noVerifican.length ? ` No verifican: ${rc.noVerifican.map(c => c.nombre).join('; ')}.` : ''}${rc.atencion.length ? ` Para revisar con la cátedra: ${rc.atencion.map(c => c.nombre).join('; ')}.` : ''}`);
  }
  // ---- 7 · exoesqueleto (si entra en el cálculo)
  if (p.exo) {
    try {
      const ex = await import('./exo');
      if (ex.exoEnElCalculo()) {
        const { TIPOS_EXO } = await import('../engine/exo');
        const s = lamina('Exoesqueleto', `Exoesqueleto: ${TIPOS_EXO[p.exo.tipo].nombre}`, TIPOS_EXO[p.exo.tipo].texto, '6A3D9A');
        (['A', 'B'] as const).forEach((dir, k) => {
          const d = ex.datosExo(dir); if (!d) return;
          const fl = ex.flechaExo(d), n0 = d.r.u.length - 1;
          dato(s, 0.4 + k * 6.3, 1.9, 2.95, `Viento ${dir}: el exo toma`, `${fmt(d.r.fraccionExo * 100, 0)} %`, 'del momento en la base');
          dato(s, 0.4 + k * 6.3 + 3.1, 1.9, 2.95, `Viento ${dir}: azotea`, `${fmt(fl.u * 1000, 1)} mm`, isFinite(d.r.uSin[n0]) ? `sin exo ${fmt(d.r.uSin[n0] * (fl.u / (d.r.u[n0] || 1)) * 1000, 1)} mm` : '');
        });
        txt(s, (p.exo.notas ?? []).slice(0, 4).join('\n'), { x: 0.4, y: 3.2, w: 12.5, h: 3.5, fontSize: 11, color: GRIS, valign: 'top' });
        s.addNotes('El exoesqueleto trabaja junto con los tabiques: cada uno toma el viento según su rigidez. Con el método de la cátedra (Planilla, Guía) no entra en el cálculo; acá va con el método CIRSOC o FEM.');
      }
    } catch { /* sin exo */ }
  }
  // ---- 8 · el túnel de viento: los videos de la última exportación (si hay)
  {
    let videos: import('./tunel3d').VideoTunel[] = [];
    try { videos = (await import('./tunel3d')).ultimasSimulaciones(); } catch { videos = []; }
    const aB64 = async (b: Blob) => { const u = new Uint8Array(await b.arrayBuffer()); let x = ''; for (let k = 0; k < u.length; k += 0x8000) x += String.fromCharCode(...u.subarray(k, k + 0x8000)); return btoa(x); };
    if (videos.length) {
      for (const v of videos) {
        const s = lamina('Túnel de viento 3D', v.nombre, 'Simulación didáctica (Lattice Boltzmann)', 'D85A30');
        const hv = 5.15, wv = Math.min(12.5, (hv * v.ancho) / v.alto);
        s.addMedia({ type: 'video', data: `${v.blob.type || `video/${v.ext}`};base64,${await aB64(v.blob)}`, extn: v.ext, cover: v.portada.replace(/^data:/, ''), x: (13.33 - wv) / 2, y: 1.5, w: wv, h: hv });
        txt(s, v.ficha.join('\n'), { x: 0.4, y: 6.68, w: 12.5, h: 0.4, fontSize: 8.5, color: GRIS, valign: 'top' });
        s.addNotes(`Video del túnel 3D. ${v.ficha.join(' ')} Es una simulación didáctica: muestra cómo se mueve el aire alrededor de la torre (dónde se acelera en las esquinas, la estela detrás), no reemplaza un ensayo.`);
      }
    } else {
      const s = lamina('Túnel de viento 3D', 'El viento alrededor de la torre', '', 'D85A30');
      txt(s, 'Para sumar los videos: Viento → Túnel 3D → «Grabar varias simulaciones y exportarlas» → «Exportar simulaciones», y después volver a armar esta presentación (los videos de la última exportación entran solos, uno por lámina).', { x: 0.4, y: 2.0, w: 12.5, h: 1.6, fontSize: 16, color: GRIS, valign: 'top' });
      s.addNotes('Todavía no hay videos del túnel 3D en esta sesión.');
    }
  }
  // ---- 9 · conclusiones
  {
    const s = lamina('Conclusiones', 'Conclusiones', '', rc.noVerifican.length ? MAL : OK);
    const ptos: string[] = [];
    if (dA && dB) ptos.push(`El viento ${dA.W >= dB.W ? 'A' : 'B'} es el que más carga la torre (${fmt(Math.max(dA.W, dB.W), 1)} t contra ${fmt(Math.min(dA.W, dB.W), 1)} t).`);
    // con exo en el cálculo, el corrimiento de la carta es el de los tabiques solos (el del exo va en su lámina)
    let conExo = false; try { conExo = !!p.exo && (await import('./exo')).exoEnElCalculo(); } catch { conExo = false; }
    for (const d of [dA, dB]) if (d) ptos.push(`Viento ${d.dir}: Me / Mv = ${fmt(d.vuelco.coef, 2)} (${d.vuelco.coef >= 1.5 ? 'no se vuelca' : 'no alcanza el 1,5'}); la azotea se corre ${d.roto ? `${fmt(d.roto.dTop * 1000, 1)} mm` : '—'}${conExo ? ' con los tabiques solos (con el exo, ver su lámina)' : ''} (límite ${fmt((d.zTop / 500) * 1000, 0)} mm).`);
    ptos.push(rc.noVerifican.length ? `No verifican ${rc.noVerifican.length} controles: ${rc.noVerifican.slice(0, 4).map(c => c.nombre).join('; ')}${rc.noVerifican.length > 4 ? '…' : ''}.` : rc.atencion.length ? `Ningún control da «no verifica»: verifican ${rc.verifican} de ${rc.total}.` : `Verifican los ${rc.total} controles calculados.`);
    if (rc.atencion.length) ptos.push(`Quedan ${rc.atencion.length} para revisar con la cátedra.`);
    txt(s, ptos.map(t => ({ text: t, options: { bullet: true, breakLine: true } })), { x: 0.6, y: 1.6, w: 12.1, h: 4.8, fontSize: 18, valign: 'top', paraSpaceAfter: 10 });
    s.addNotes('Cerrar con lo que verifica, lo que no y qué se cambiaría. Las cuentas completas están en el desglose (Exportar ▾ → Desglose por hoja) y en las planillas.');
  }
  const nombre = `${(p.nombre || 'proyecto').replace(/[^\wáéíóúñÁÉÍÓÚÑ-]+/g, '_').slice(0, 60)}_presentacion.pptx`;
  await pr.writeFile({ fileName: nombre });
  return n;
}
