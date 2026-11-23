/**
 * Corte de la torre para darle forma mirando los planos: se abre sobre la planta, con la torre cortada por un plano
 * vertical (en x o en y) y, si se carga, el alzado o el corte del proyecto calcado debajo (imagen o PDF, escalado con
 * dos puntos y una medida, y corrido con el mouse o el dedo).
 *
 * Cada losa se ve con sus dos bordes (las manijas): arrastrar una corre ese lado de la losa (este piso, un tramo o
 * todos), hasta que coincida con el plano. Una losa que generaba el perfil o un loft queda «suelta» (editada a mano).
 */
import { estado } from './estado';
import { avisar, pedirTexto } from './tarjeta';
import { moverBordeEnCorte, tramoCorte, type EjeCorte } from '../engine/corte';
import { cajaSilueta, carpinteriaDeNivel, plantaDeNivel, type Vertice } from '../engine/silueta';
import { nivelBase } from '../engine/perfil_torre';
import { nivelesDeLoft } from '../engine/loft';
import { presenteEn, rectangulos, type Proyecto } from '../engine/modelo';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag: string, a: Record<string, string | number> = {}, txt?: string) => { const e = document.createElementNS(NS, tag); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v))); if (txt !== undefined) e.textContent = txt; return e as SVGElement; };
const f2 = (x: number) => x.toFixed(2).replace('.', ',');

type Rango = 'este' | 'arriba' | 'abajo' | 'todos';
type Modo = 'editar' | 'calibrar' | 'mover-calco';

/** niveles que genera el perfil o un loft (al editarlos a mano quedan sueltos) */
function generados(p: Proyecto): Set<number> {
  const s = new Set<number>();
  if (p.perfilTorre) { const ib = nivelBase(p, p.perfilTorre); p.niveles.forEach((_, i) => { if (i < ib) s.add(i); }); }
  (p.lofts ?? []).forEach(l => nivelesDeLoft(p, l).intermedios.forEach(i => s.add(i)));
  return s;
}

export function montarCorte(cont: HTMLElement, mensaje: (t: string) => void) {
  const raiz = document.createElement('div'); raiz.className = 'corte-torre'; raiz.hidden = true;
  const barra = document.createElement('div'); barra.className = 'corte-barra';
  const svg = document.createElementNS(NS, 'svg') as SVGSVGElement; svg.classList.add('corte-svg');
  const pie = document.createElement('div'); pie.className = 'corte-pie'; pie.setAttribute('role', 'status');
  raiz.append(barra, svg, pie);
  cont.appendChild(raiz);

  let eje: EjeCorte = 'x', c = 0, rango: Rango = 'este', modo: Modo = 'editar';
  let zoom = 1, centro: { w: number; z: number } | null = null;
  let k = 1, ox = 0, oy = 0;
  const W = (w: number) => ox + w * k, Z = (z: number) => oy - z * k;
  const aMundo = (ev: PointerEvent) => { const r = svg.getBoundingClientRect(); return { w: (ev.clientX - r.left - ox) / k, z: -(ev.clientY - r.top - oy) / k }; };
  let calib: { w: number; z: number }[] = [];
  /** losas cambiadas mientras se arrastra (vista previa): índice → contorno */
  let previa: Map<number, Vertice[]> | null = null;

  const boton = (t: string, ti: string, f: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.title = ti; b.addEventListener('click', f); return b; };
  function armarBarra() {
    const seg = document.createElement('div'); seg.className = 'seg chico'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Plano del corte');
    ([['x', 'Corte en x', 'El plano y = c: a lo ancho va x (la cara del viento A)'], ['y', 'Corte en y', 'El plano x = c: a lo ancho va y']] as const).forEach(([v, t, ti]) => { const b = boton(t, ti, () => { eje = v; centro = null; armar(); }); b.setAttribute('aria-pressed', String(eje === v)); seg.append(b); });
    const pos = document.createElement('input'); pos.type = 'text'; pos.inputMode = 'decimal'; pos.className = 'campo-vertice'; pos.value = f2(c);
    pos.addEventListener('change', () => { const x = parseFloat(pos.value.replace(',', '.')); if (isFinite(x)) { c = x; armar(); } });
    const lpos = document.createElement('label'); lpos.className = 'campo-linea'; lpos.title = 'Dónde pasa el plano del corte (desde el centro de la planta)'; lpos.append(`${eje === 'x' ? 'y' : 'x'} = `, pos, ' m');
    const sr = document.createElement('select'); sr.setAttribute('aria-label', 'Qué pisos cambia el arrastre');
    ([['este', 'solo ese piso'], ['arriba', 'ese y los de arriba'], ['abajo', 'ese y los de abajo'], ['todos', 'todos los pisos']] as const).forEach(([v, t]) => sr.append(new Option(t, v, false, v === rango)));
    sr.addEventListener('change', () => { rango = sr.value as Rango; armarPie(); });
    const lr = document.createElement('label'); lr.className = 'campo-linea'; lr.append('Arrastrar cambia ', sr);
    // calco
    const lc = document.createElement('label'); lc.className = 'boton'; lc.textContent = estado.calcoCorte ? 'Cambiar el calco…' : 'Calco del plano…';
    lc.title = 'Una imagen o un PDF del alzado o el corte del proyecto, para ver debajo y ajustar la silueta';
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,.pdf'; inp.hidden = true; lc.append(inp);
    inp.addEventListener('change', async () => {
      const fl = inp.files?.[0]; inp.value = ''; if (!fl) return;
      try {
        let url: string, aspecto: number;
        if (fl.name.toLowerCase().endsWith('.pdf')) ({ url, aspecto } = await (await import('./pdf')).pdfAImagen(fl));
        else { url = URL.createObjectURL(fl); aspecto = await new Promise<number>(ok => { const im = new Image(); im.onload = () => ok(im.naturalHeight / im.naturalWidth || 1); im.onerror = () => ok(1); im.src = url; }); }
        const zT = estado.proyecto.niveles[0]?.cota ?? 30, ancho = Math.max(10, (zT + 6) / aspecto);
        estado.calcoCorte = { url, aspecto, ancho, x: -ancho / 2, z: zT + 3, opacidad: 0.5 };
        modo = 'calibrar'; calib = [];
        armar();
      } catch (e) { void avisar('error', 'No se pudo abrir el plano', String(e)); }
    });
    const ext: HTMLElement[] = [lc];
    if (estado.calcoCorte) {
      const bc = boton('Escala con dos puntos', 'Tocá dos puntos del plano y escribí la distancia real entre ellos', () => { modo = modo === 'calibrar' ? 'editar' : 'calibrar'; calib = []; armar(); }); bc.setAttribute('aria-pressed', String(modo === 'calibrar'));
      const bm = boton('Mover el calco', 'Arrastrá el plano hasta que su piso y su eje coincidan con los de la torre', () => { modo = modo === 'mover-calco' ? 'editar' : 'mover-calco'; armar(); }); bm.setAttribute('aria-pressed', String(modo === 'mover-calco'));
      const op = document.createElement('input'); op.type = 'range'; op.min = '0.1'; op.max = '1'; op.step = '0.05'; op.value = String(estado.calcoCorte.opacidad); op.setAttribute('aria-label', 'Opacidad del calco');
      op.addEventListener('input', () => { if (estado.calcoCorte) { estado.calcoCorte.opacidad = +op.value; dibujar(); } });
      ext.push(bc, bm, op, boton('Quitar el calco', '', () => { estado.calcoCorte = null; modo = 'editar'; armar(); }));
    }
    barra.replaceChildren(Object.assign(document.createElement('b'), { textContent: 'Corte de la torre' }), seg, lpos, lr, ...ext, boton('Cerrar', 'Volver a la planta (Esc)', cerrar));
  }
  function armarPie() {
    pie.textContent = modo === 'calibrar' ? (calib.length ? 'Tocá el segundo punto del plano (de una medida que conozcas: el ancho de la torre, la altura de un piso…).' : 'Escala del calco: tocá el primer punto de una medida conocida del plano.')
      : modo === 'mover-calco' ? 'Arrastrá el plano hasta que su piso (cota 0) y su eje coincidan con los de la torre. Volvé a tocar «Mover el calco» para terminar.'
      : `Arrastrá los bordes de las losas (●) hasta que coincidan con el plano: cambia ${rango === 'este' ? 'solo ese piso' : rango === 'arriba' ? 'ese piso y los de arriba' : rango === 'abajo' ? 'ese piso y los de abajo' : 'todos los pisos'}. Rueda o pellizco para el zoom; arrastrá el fondo para correr la vista; Esc cierra.`;
  }

  function encuadrar(p: Proyecto) {
    const ws: number[] = [], zs = p.niveles.map(n => n.cota);
    p.niveles.forEach((_, i) => { const t = tramoCorte(plantaDeNivel(p, i).silueta, eje, c); if (t) ws.push(...t); });
    if (estado.calcoCorte) { ws.push(estado.calcoCorte.x, estado.calcoCorte.x + estado.calcoCorte.ancho); }
    const w0 = Math.min(...ws, -10) - 4, w1 = Math.max(...ws, 10) + 4, z0 = Math.min(0, ...zs) - 3, z1 = Math.max(...zs) + 6;
    const ancho = svg.clientWidth || 800, alto = svg.clientHeight || 600;
    k = Math.min(ancho / (w1 - w0), alto / (z1 - z0)) * zoom;
    const cen = centro ?? { w: (w0 + w1) / 2, z: (z0 + z1) / 2 };
    ox = ancho / 2 - cen.w * k; oy = alto / 2 + cen.z * k;
    svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  }

  function dibujar() {
    if (raiz.hidden) return;
    const p = estado.proyecto;
    encuadrar(p);
    svg.replaceChildren();
    const cc = estado.calcoCorte;
    if (cc) { const im = el('image', { href: cc.url, x: W(cc.x), y: Z(cc.z), width: cc.ancho * k, height: cc.ancho * cc.aspecto * k, opacity: cc.opacidad, preserveAspectRatio: 'none', class: 'calco-corte' }); svg.append(im); }
    // terreno y eje
    svg.append(el('line', { x1: 0, x2: svg.clientWidth || 800, y1: Z(0), y2: Z(0), class: 'terreno' }), el('line', { x1: W(0), x2: W(0), y1: 0, y2: svg.clientHeight || 600, class: 'eje' }));
    // tabiques que corta el plano (de referencia)
    const zF = p.niveles.at(-1)?.cota ?? 0, zT = p.niveles[0]?.cota ?? 0;
    p.muros.forEach(m => {
      rectangulos(m).forEach(r => {
        const u0 = eje === 'x' ? r.y - r.ay / 2 : r.x - r.ax / 2, u1 = eje === 'x' ? r.y + r.ay / 2 : r.x + r.ax / 2;
        if (c < u0 || c > u1) return;
        const w0 = eje === 'x' ? r.x - r.ax / 2 : r.y - r.ay / 2, w1 = eje === 'x' ? r.x + r.ax / 2 : r.y + r.ay / 2;
        const a = Math.max(zF, m.zDesde ?? zF), b = Math.min(zT, m.zHasta ?? zT);
        if (!presenteEn(m, a, zF, zT) && b <= a) return;
        svg.append(el('rect', { x: W(w0), y: Z(b), width: Math.max(1, (w1 - w0) * k), height: Math.max(1, (b - a) * k), class: 'muro-cortado' }));
      });
    });
    // losas, sus bordes (manijas) y la línea de la fachada
    const filas = p.niveles.map((n, i) => ({ n, i, v: previa?.get(i) ?? plantaDeNivel(p, i).silueta })).map(x => ({ ...x, t: tramoCorte(x.v, eje, c) })).filter(x => x.t).sort((a, b) => a.n.cota - b.n.cota);
    const izq = filas.map(x => `${W(x.t![0]).toFixed(1)},${Z(x.n.cota).toFixed(1)}`), der = filas.map(x => `${W(x.t![1]).toFixed(1)},${Z(x.n.cota).toFixed(1)}`);
    svg.append(el('polyline', { points: izq.join(' '), class: 'fachada' }), el('polyline', { points: der.join(' '), class: 'fachada' }));
    // carpintería (en trazos), si la hay
    const carp = p.niveles.map((n, i) => ({ n, c: carpinteriaDeNivel(p, i) })).filter(x => x.c && x.n.cota >= 0).map(x => ({ z: x.n.cota, t: tramoCorte(x.c!.v, eje, c) })).filter(x => x.t).sort((a, b) => a.z - b.z);
    if (carp.length > 1) { svg.append(el('polyline', { points: carp.map(x => `${W(x.t![0])},${Z(x.z)}`).join(' '), class: 'carp' }), el('polyline', { points: carp.map(x => `${W(x.t![1])},${Z(x.z)}`).join(' '), class: 'carp' })); }
    const gen = generados(p);
    filas.forEach(x => {
      const [w0, w1] = x.t!;
      svg.append(el('rect', { x: W(w0), y: Z(x.n.cota), width: Math.max(1, (w1 - w0) * k), height: Math.max(2, 0.25 * k), class: 'losa' + (x.n.manual ? ' manual' : gen.has(x.i) ? ' generada' : '') }));
      if (k > 3) svg.append(el('text', { x: W(w1) + 8, y: Z(x.n.cota) + 4, class: 'nivel' }, x.n.nombre));
      for (const [lado, w] of [['min', w0], ['max', w1]] as const) svg.append(el('circle', { cx: W(w), cy: Z(x.n.cota), r: 6, class: 'manija', 'data-i': x.i, 'data-lado': lado }));
    });
    calib.forEach(q => svg.append(el('circle', { cx: W(q.w), cy: Z(q.z), r: 5, class: 'calib' })));
    if (arr && arr.rot) svg.append(el('text', { x: arr.sx + 12, y: arr.sy - 12, class: 'rot' }, arr.rot));
  }

  // arrastres: una manija (borde de losa), el calco o el fondo (correr la vista)
  let arr: { tipo: 'borde' | 'calco' | 'vista'; id: number; i?: number; lado?: 'min' | 'max'; w0?: number; z0?: number; sx: number; sy: number; c0?: { w: number; z: number }; cx0?: number; cz0?: number; rot?: string } | null = null;
  svg.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const q = aMundo(ev), r = svg.getBoundingClientRect();
    if (modo === 'calibrar' && estado.calcoCorte) {
      calib.push(q); armarPie(); dibujar();
      if (calib.length === 2) {
        const medida = Math.hypot(calib[1].w - calib[0].w, calib[1].z - calib[0].z), a0 = calib[0], cc = estado.calcoCorte;
        void pedirTexto('Distancia real', `Distancia real entre los dos puntos, en metros. En el dibujo mide ${f2(medida)} m.`, '', 'Escalar').then(txt => {
          const real = Number(String(txt ?? '').replace(',', '.'));
          calib = []; modo = 'editar';
          if (real > 0 && medida > 1e-6 && estado.calcoCorte === cc) { const f = real / medida; cc.x = a0.w + (cc.x - a0.w) * f; cc.z = a0.z + (cc.z - a0.z) * f; cc.ancho *= f; mensaje('Calco escalado. Movelo hasta que su piso y su eje coincidan con los de la torre.'); modo = 'mover-calco'; }
          armar();
        });
      }
      return;
    }
    const h = (ev.target as Element).closest?.('.manija');
    if (h && modo === 'editar') {
      const i = +h.getAttribute('data-i')!, lado = h.getAttribute('data-lado') as 'min' | 'max', t = tramoCorte(plantaDeNivel(estado.proyecto, i).silueta, eje, c)!;
      arr = { tipo: 'borde', id: ev.pointerId, i, lado, w0: lado === 'min' ? t[0] : t[1], sx: ev.clientX - r.left, sy: ev.clientY - r.top };
    } else if (modo === 'mover-calco' && estado.calcoCorte) arr = { tipo: 'calco', id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, cx0: estado.calcoCorte.x, cz0: estado.calcoCorte.z };
    else { const p0 = estado.proyecto; encuadrar(p0); arr = { tipo: 'vista', id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, c0: { w: (((svg.clientWidth || 800) / 2) - ox) / k, z: (oy - (svg.clientHeight || 600) / 2) / k } }; }
    try { svg.setPointerCapture(ev.pointerId); } catch { /* sintético */ }
  });
  /** niveles que cambia el arrastre del nivel i */
  const afectados = (p: Proyecto, i: number) => p.niveles.map((_, j) => j).filter(j => rango === 'todos' || j === i || (rango === 'arriba' && p.niveles[j].cota > p.niveles[i].cota) || (rango === 'abajo' && p.niveles[j].cota < p.niveles[i].cota && p.niveles[j].cota >= 0));
  svg.addEventListener('pointermove', ev => {
    if (!arr || ev.pointerId !== arr.id) return;
    const r = svg.getBoundingClientRect();
    if (arr.tipo === 'vista') { centro = { w: arr.c0!.w - (ev.clientX - arr.sx) / k, z: arr.c0!.z + (ev.clientY - arr.sy) / k }; dibujar(); return; }
    if (arr.tipo === 'calco' && estado.calcoCorte) { estado.calcoCorte.x = arr.cx0! + (ev.clientX - arr.sx) / k; estado.calcoCorte.z = arr.cz0! - (ev.clientY - arr.sy) / k; dibujar(); return; }
    // borde: el corrimiento (al cm) se aplica a cada piso afectado desde su propio borde
    const p = estado.proyecto, q = aMundo(ev), dw = Math.round((q.w - arr.w0!) * 100) / 100;
    previa = new Map();
    afectados(p, arr.i!).forEach(j => {
      const v = plantaDeNivel(p, j).silueta, t = tramoCorte(v, eje, c); if (!t) return;
      const nv = moverBordeEnCorte(v, eje, c, arr!.lado!, (arr!.lado === 'min' ? t[0] : t[1]) + dw); if (nv) previa!.set(j, nv);
    });
    arr.sx = ev.clientX - r.left; arr.sy = ev.clientY - r.top;
    arr.rot = `${dw >= 0 ? '+' : ''}${f2(dw)} m · ${previa.size} ${previa.size === 1 ? 'piso' : 'pisos'}`;
    dibujar();
  });
  const soltar = (ev: PointerEvent) => {
    if (!arr || ev.pointerId !== arr.id) return;
    const a = arr; arr = null;
    if (a.tipo === 'borde' && previa && previa.size) {
      const cambios = previa, gen = generados(estado.proyecto);
      previa = null;
      let sueltos = 0;
      estado.cambiar(pp => cambios.forEach((v, j) => {
        const n = pp.niveles[j]; n.silueta = v; const cj = cajaSilueta(v); n.B = +cj.B.toFixed(2); n.L = +cj.L.toFixed(2);
        if (gen.has(j) && !n.manual) { n.manual = true; sueltos++; }
      }));
      mensaje(`${cambios.size} ${cambios.size === 1 ? 'losa cambiada' : 'losas cambiadas'} desde el corte${sueltos ? ` (${sueltos} quedaron sueltas del perfil o el loft)` : ''}. Ctrl+Z deshace.`);
    } else { previa = null; dibujar(); }
  };
  svg.addEventListener('pointerup', soltar); svg.addEventListener('pointercancel', soltar);
  svg.addEventListener('wheel', ev => { ev.preventDefault(); const p0 = estado.proyecto; encuadrar(p0); const r = svg.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, q = { w: (mx - ox) / k, z: (oy - my) / k }; const f = ev.deltaY < 0 ? 1.2 : 1 / 1.2; zoom = Math.max(0.3, Math.min(40, zoom * f)); const k2 = k * f; centro = { w: q.w - (mx - (svg.clientWidth || 800) / 2) / k2, z: q.z + (my - (svg.clientHeight || 600) / 2) / k2 }; dibujar(); }, { passive: false });
  document.addEventListener('keydown', ev => { if (!raiz.hidden && ev.key === 'Escape' && !(ev.target as HTMLElement).closest?.('input, select, textarea')) { ev.preventDefault(); if (modo !== 'editar') { modo = 'editar'; calib = []; armar(); } else cerrar(); } });
  new ResizeObserver(() => dibujar()).observe(raiz);
  estado.suscribir(() => { if (!raiz.hidden && !arr) armar(); });

  function armar() { armarBarra(); armarPie(); dibujar(); }
  function abrir() { raiz.hidden = false; armar(); }
  function cerrar() { raiz.hidden = true; modo = 'editar'; calib = []; previa = null; mensaje('Corte cerrado.'); }
  return { abrir, cerrar, activo: () => !raiz.hidden };
}
