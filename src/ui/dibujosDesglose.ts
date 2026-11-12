/**
 * Dibujos de la app para el desglose (PowerPoint y PDF): se arman fuera de la pantalla los mismos dibujos de cada
 * etapa (viento, fuerzas, funicular, rigidez, rototraslación paso a paso, perfiles de las piezas y cartas) y se
 * convierten a PNG. Cada hoja de la planilla recibe los dibujos que la explican.
 */
import { estado } from './estado';
import { ETAPAS } from './etapas';
import { carta } from './carta';
import { datosCarta } from './etapas';
import { dibujoPerfil } from './perfil';
import { svgAutonomo } from './exportarDibujo';
import type { Muro } from '../engine/modelo';

export interface Dibujo { titulo: string; png: string; ancho: number; alto: number }

/** SVG → PNG (data URL), con los estilos copiados */
function aPNG(svg: SVGSVGElement, escala = 1.6): Promise<{ png: string; ancho: number; alto: number } | null> {
  const { texto, ancho, alto } = svgAutonomo(svg);
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = Math.round(ancho * escala); cv.height = Math.round(alto * escala);
      const cx = cv.getContext('2d'); if (!cx) { res(null); return; }
      cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height);
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      try { res({ png: cv.toDataURL('image/png'), ancho, alto }); } catch { res(null); }
    };
    img.onerror = () => res(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(texto);
  });
}

/** dibujos (SVG grandes) dentro de un contenedor, con el título de su figura si lo tiene */
async function recoger(c: HTMLElement, prefijo: string): Promise<Dibujo[]> {
  const out: Dibujo[] = [];
  const svgs = [...c.querySelectorAll('svg')].filter(s => { const r = s.getBoundingClientRect(); return r.width > 180 && r.height > 120 && !s.closest('svg svg'); }) as SVGSVGElement[];
  for (const s of svgs) {
    const fig = s.closest('figure');
    const cap = fig?.querySelector('figcaption')?.textContent?.trim() || s.closest('section')?.querySelector('h2,h3')?.textContent?.trim() || '';
    const r = await aPNG(s);
    if (r) out.push({ titulo: cap ? `${prefijo} · ${cap}` : prefijo, ...r });
  }
  return out;
}

/** dibujos para cada una de las seis hojas del desglose */
export async function dibujosPorHoja(): Promise<Dibujo[][]> {
  const dirAntes = estado.dir, subAntes = { ...estado.sub };
  const raiz = document.documentElement, temaAntes = raiz.getAttribute('data-theme');
  raiz.setAttribute('data-theme', 'light');
  const caja = document.createElement('div');
  caja.style.cssText = 'position:absolute;left:-12000px;top:0;width:1100px;background:#fff';
  document.body.append(caja);
  const etapa = (id: string) => ETAPAS.find(e => e.id === id)!;
  const vista = async (id: string, dir: 'A' | 'B', sub: Record<string, string>, prefijo: string) => {
    estado.dir = dir; Object.assign(estado.sub, sub);
    const c = document.createElement('div'); c.className = 'centro-dibujos'; caja.replaceChildren(c);
    try { const e = etapa(id); if (typeof e.centro === 'function') e.centro(c, { ancho: 1000, alto: 560 }); } catch { return []; }
    return recoger(c, prefijo);
  };
  const svgSuelto = async (svg: SVGSVGElement, titulo: string) => {
    const c = document.createElement('div'); c.append(svg); caja.replaceChildren(c);
    const r = await aPNG(svg); return r ? [{ titulo, ...r }] : [];
  };
  const perfiles = async (dir: 'A' | 'B') => {
    const { asig, res } = estado.calculo;
    const out: Dibujo[] = [];
    for (const pz of asig.piezas.filter(z => z.dir === dir && z.filaHoja !== null)) {
      const fila = (dir === 'A' ? asig.datos.jpar : asig.datos.jort)[pz.filaHoja!];
      const fr = (dir === 'A' ? res.jpar : res.jort).filas[pz.filaHoja!];
      const muros = pz.muros.map(id => estado.proyecto.muros.find(m => m.id === id)).filter((m): m is Muro => !!m);
      out.push(...await svgSuelto(dibujoPerfil(pz, fila, fr, muros, 420, asig.papeles), `Perfil equivalente · ${pz.nombre} (fila ${pz.filaHoja! + 4})`));
    }
    return out;
  };
  const cartas = async (dir: 'A' | 'B') => {
    estado.dir = dir;
    const dc = datosCarta(); if (!dc) return [];
    return [...await svgSuelto(carta(dc, 'A', 1100), `Carta · lámina M, N y Q · viento ${dir}`), ...await svgSuelto(carta(dc, 'D', 1100), `Carta · vuelco y suelo · viento ${dir}`)];
  };
  const out: Dibujo[][] = [[], [], [], [], [], []];
  try {
    out[0] = await vista('viento', 'A', {}, 'Viento');
    out[1] = [...await vista('fuerzas', 'A', {}, 'Fuerzas · viento A'), ...await vista('estabilidad', 'A', {}, 'Estabilidad · viento A'), ...await cartas('A')];
    out[2] = [...await vista('rigidez', 'A', {}, 'Rigidez · viento A'), ...await perfiles('A')];
    out[3] = [...await vista('rigidez', 'B', {}, 'Rigidez · viento B'), ...await perfiles('B')];
    for (const [k, dir] of [[4, 'A'], [5, 'B']] as const) {
      for (const paso of ['1', '2', '3', '4']) out[k].push(...await vista('rototrasl', dir, { pasoRoto: paso, funiHasta: '' }, `Rototraslación · viento ${dir} · paso ${paso}`));
    }
  } finally {
    caja.remove();
    estado.dir = dirAntes;
    Object.keys(estado.sub).forEach(k => delete estado.sub[k]); Object.assign(estado.sub, subAntes);
    if (temaAntes === null) raiz.removeAttribute('data-theme'); else raiz.setAttribute('data-theme', temaAntes);
  }
  return out;
}
