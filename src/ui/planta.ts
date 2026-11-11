/** Editor de la planta de PB en SVG: grilla, contorno, ejes, muros coloreados por su papel; arrastrar para mover. */
import { estado, COLORES } from './estado';
import { dInterior, huella, presenteEn, rectangulos, tipoDe, type Muro } from '../engine/modelo';
import { armarPiezas, imanar, muroDesdeTramo, type Punto } from '../engine/dibujo';
import { ajustarContorno, areaSilueta, cajaSilueta, leerDXF, plantaDeNivel, puntosSilueta, type Vertice } from '../engine/silueta';

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, txt?: string) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));
  if (txt !== undefined) e.textContent = txt;
  return e;
};

export function montarPlanta(cont: HTMLElement) {
  const svg = el('svg', { class: 'planta', role: 'img', 'aria-label': 'Planta con los muros del contraviento' });
  cont.appendChild(svg);
  // elección del nivel cuya planta se muestra
  const rotulo = cont.querySelector('.rotulo') as HTMLElement | null;
  const selNivel = document.createElement('select');
  selNivel.className = 'sel-nivel';
  selNivel.setAttribute('aria-label', 'Planta del nivel');
  selNivel.title = 'Planta del nivel: los muros que no están en ese nivel se ven en gris claro';
  selNivel.addEventListener('change', () => { estado.nivelPlanta = selNivel.value === '' ? null : Number(selNivel.value); dibujar(); estado.avisarSeleccion(); });
  cont.appendChild(selNivel);
  // leyenda de colores (los de la planilla)
  const ley = document.createElement('div');
  ley.className = 'leyenda leyenda-planta';
  ([['alma', 'alma'], ['ala sup.', 'ala sup.'], ['ala inf.', 'ala inf.'], ['tubo', 'tubo'], ['columna', 'columna circ.'], ['fuera del cálculo', 'fuera del cálculo']] as const).forEach(([k, t]) => {
    const sp = document.createElement('span'); const i = document.createElement('i'); i.className = 'caja'; i.style.background = COLORES[k]; sp.append(i, t); ley.append(sp);
  });
  cont.appendChild(ley);
  // herramientas: mover (arrastrar muros) o dibujar (dos clics por muro, encadenados; Esc termina)
  let modo: 'mover' | 'dibujar' | 'calibrar' | 'silueta' = 'mover';
  let iNivel = 0;
  let arrastreV: number | null = null;
  let calib: Punto[] = [];
  let inicio: Punto | null = null, cursor: Punto | null = null, iman = '';
  const barra = document.createElement('div');
  barra.className = 'herr-planta seg chico';
  barra.setAttribute('role', 'group');
  barra.setAttribute('aria-label', 'Herramienta');
  const bMover = document.createElement('button'), bDibujar = document.createElement('button'), bArmar = document.createElement('button');
  bMover.type = bDibujar.type = bArmar.type = 'button';
  bMover.textContent = 'Mover'; bDibujar.textContent = 'Dibujar muro'; bArmar.textContent = 'Armar piezas';
  bMover.title = 'Arrastrar un muro para moverlo (flechas: 5 cm; con Mayúsculas: 1 m)';
  bDibujar.title = 'Clic en el inicio y clic en el fin: el muro sale horizontal o vertical y se pega a los extremos de otros muros. Sigue encadenado; Esc o doble clic termina.';
  bArmar.title = 'Los muros que se tocan forman una pieza (T1, T2… en el viento A y T1B, T2B… en el B); el ala queda pegada a su alma.';
  const ponerModo = (m: typeof modo) => { modo = m; inicio = null; calib = []; bMover.setAttribute('aria-pressed', String(m === 'mover')); bDibujar.setAttribute('aria-pressed', String(m === 'dibujar')); bSil.setAttribute('aria-pressed', String(m === 'silueta')); svg.classList.toggle('dibujando', m === 'dibujar' || m === 'calibrar'); svg.classList.toggle('editando-silueta', m === 'silueta'); panelSil.hidden = m !== 'silueta'; dibujar(); };
  bMover.addEventListener('click', () => ponerModo('mover'));
  bDibujar.addEventListener('click', () => ponerModo('dibujar'));
  bArmar.addEventListener('click', () => estado.cambiar(() => { estado.proyecto.muros = armarPiezas(estado.proyecto.muros); }));
  // calcar un plano: imagen de fondo con escala (dos clics y la medida real), posición y transparencia
  const bCalco = document.createElement('label');
  bCalco.className = 'boton';
  bCalco.textContent = 'Calcar plano…';
  bCalco.title = 'Poner una imagen del plano (PNG o JPG) de fondo para dibujar los muros encima. Un PDF se puede exportar antes como imagen.';
  const inCalco = document.createElement('input');
  inCalco.type = 'file'; inCalco.accept = 'image/*'; inCalco.hidden = true;
  bCalco.append(inCalco);
  inCalco.addEventListener('change', () => {
    const f = inCalco.files?.[0]; if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const p = estado.proyecto;
      const B = p.niveles.find(n => n.B)?.B ?? 20;
      estado.calco = { url, aspecto: img.naturalHeight / img.naturalWidth || 1, ancho: B * 1.2, x: 0, y: 0, opacidad: 0.5 };
      armarPanelCalco(); dibujar();
    };
    img.src = url;
    inCalco.value = '';
  });
  // silueta del piso: mover vértices, doble clic en un borde agrega uno, clic derecho en un vértice lo borra
  const bSil = document.createElement('button');
  bSil.type = 'button'; bSil.textContent = 'Silueta';
  bSil.title = 'Editar el contorno de este piso: arrastrar los vértices, doble clic en un borde para agregar uno, clic derecho en un vértice para borrarlo. También se importa de AutoCAD (DXF).';
  bSil.addEventListener('click', () => ponerModo(modo === 'silueta' ? 'mover' : 'silueta'));
  const panelSil = document.createElement('div');
  panelSil.className = 'calco-panel silueta-panel';
  panelSil.hidden = true;
  cont.appendChild(panelSil);
  /** la silueta del nivel a la vista, como propia (si heredaba, se copia al editarla) */
  const siluetaPropia = (): Vertice[] => {
    const n = estado.proyecto.niveles[iNivel];
    if (!n.silueta || n.silueta.length < 3) n.silueta = plantaDeNivel(estado.proyecto, iNivel).silueta.map(v => ({ ...v }));
    return n.silueta;
  };
  function armarPanelSil() {
    const p = estado.proyecto, n = p.niveles[iNivel];
    if (!n) return;
    const pl = plantaDeNivel(p, iNivel);
    const caja = cajaSilueta(pl.silueta);
    panelSil.replaceChildren();
    const b = (t: string) => { const x = document.createElement('b'); x.textContent = t; return x; };
    const linea = (t: string) => { const x = document.createElement('span'); x.textContent = t; return x; };
    const boton = (t: string, f: () => void, titulo = '') => { const x = document.createElement('button'); x.type = 'button'; x.textContent = t; x.title = titulo; x.addEventListener('click', f); return x; };
    const dxf = document.createElement('label'); dxf.className = 'boton'; dxf.textContent = 'Importar DXF…';
    dxf.title = 'Polilínea cerrada de AutoCAD (LWPOLYLINE), con arcos. Se pide la unidad del dibujo y se centra en la planta.';
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.dxf'; inp.hidden = true; dxf.append(inp);
    inp.addEventListener('change', async () => {
      const f = inp.files?.[0]; inp.value = ''; if (!f) return;
      const cs = leerDXF(await f.text());
      if (!cs.length) { window.alert('El DXF no tiene polilíneas cerradas (LWPOLYLINE). En AutoCAD: PEDIT → Juntar → Cerrar.'); return; }
      const mayor = cs.map(c => ({ c, a: areaSilueta(c) })).sort((x, y) => y.a - x.a)[0].c;   // el contorno más grande
      const ext = cajaSilueta(mayor);
      const guess = Math.max(ext.B, ext.L) > 2000 ? 'mm' : Math.max(ext.B, ext.L) > 200 ? 'cm' : 'm';
      const u = (window.prompt(`Unidad del dibujo (m, cm o mm). El contorno mide ${ext.B.toFixed(1)} × ${ext.L.toFixed(1)} en el DXF:`, guess) ?? '').trim().toLowerCase();
      const factor = u === 'mm' ? 0.001 : u === 'cm' ? 0.01 : u === 'm' ? 1 : NaN;
      if (!isFinite(factor)) return;
      estado.cambiar(() => { estado.proyecto.niveles[iNivel].silueta = ajustarContorno(mayor, factor, true); });
    });
    panelSil.append(b(`Silueta de ${n.nombre}`), linea(pl.propia ? 'propia de este nivel' : 'heredada (se copia al editarla)'),
      linea(`área ${areaSilueta(pl.silueta).toFixed(1).replace('.', ',')} m² · caja ${caja.B.toFixed(2).replace('.', ',')} × ${caja.L.toFixed(2).replace('.', ',')} m`),
      linea(`la planilla usa B × L = ${pl.B} × ${pl.L} m`),
      dxf,
      boton('Usar la caja como B y L', () => estado.cambiar(() => { const nv = estado.proyecto.niveles[iNivel]; nv.B = +caja.B.toFixed(2); nv.L = +caja.L.toFixed(2); }), 'Pone en este nivel B y L iguales a la caja de la silueta (lo que lee la planilla para el viento).'),
      boton('Quitar silueta', () => estado.cambiar(() => { estado.proyecto.niveles[iNivel].silueta = null; }), 'Vuelve a la del nivel de arriba o al rectángulo B × L.'));
  }
  barra.append(bMover, bDibujar, bArmar, bCalco, bSil);
  cont.appendChild(barra);
  const panelCalco = document.createElement('div');
  panelCalco.className = 'calco-panel';
  panelCalco.hidden = true;
  cont.appendChild(panelCalco);
  function armarPanelCalco() {
    const c = estado.calco;
    panelCalco.hidden = !c;
    panelCalco.replaceChildren();
    if (!c) return;
    const campo = (t: string, k: 'ancho' | 'x' | 'y' | 'opacidad', paso: string, min?: string, max?: string) => {
      const l = document.createElement('label'); const i = document.createElement('input');
      i.type = k === 'opacidad' ? 'range' : 'number'; i.step = paso; if (min) i.min = min; if (max) i.max = max; i.value = String(+c[k].toFixed(k === 'opacidad' ? 2 : 3));
      i.addEventListener('input', () => { const v = Number(i.value); if (isFinite(v) && estado.calco) { estado.calco[k] = v; dibujar(); } });
      l.append(t, i); return l;
    };
    const cal = document.createElement('button'); cal.type = 'button'; cal.textContent = 'Escala con dos puntos';
    cal.title = 'Clic en dos puntos del plano cuya distancia real conocés (por ejemplo, los extremos de una cota) y escribí esa distancia.';
    cal.addEventListener('click', () => ponerModo('calibrar'));
    const quitar = document.createElement('button'); quitar.type = 'button'; quitar.textContent = 'Quitar';
    quitar.addEventListener('click', () => { if (estado.calco) URL.revokeObjectURL(estado.calco.url); estado.calco = null; armarPanelCalco(); dibujar(); });
    const tit = document.createElement('b'); tit.textContent = 'Plano de fondo';
    panelCalco.append(tit, campo('ancho (m)', 'ancho', '0.1', '0.1'), campo('centro x', 'x', '0.05'), campo('centro y', 'y', '0.05'), campo('opacidad', 'opacidad', '0.05', '0.05', '1'), cal, quitar);
  }
  const nuevoId = () => { let k = 1; while (estado.proyecto.muros.some(m => m.id === `M${k}`)) k++; return `M${k}`; };
  let arrastre: { id: string; x0: number; y0: number; mx: number; my: number } | null = null;
  let escala = 20, ox = 0, oy = 0;

  const aMundo = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left - ox) / escala, y: -(ev.clientY - r.top - oy) / escala };
  };

  function dibujar() {
    const p = estado.proyecto;
    const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
    // nivel elegido (por defecto PB)
    let iN = estado.nivelPlanta === null ? iPB : p.niveles.findIndex(n => Math.abs(n.cota - estado.nivelPlanta!) < 1e-6);
    if (iN < 0) { iN = iPB; estado.nivelPlanta = null; }
    const nivel = p.niveles[iN];
    selNivel.replaceChildren(...p.niveles.map((n, i) => { const o = document.createElement('option'); o.value = i === iPB ? '' : String(n.cota); o.textContent = `Planta: ${n.nombre}`; return o; }));
    selNivel.value = iN === iPB ? '' : String(nivel?.cota ?? '');
    if (rotulo) rotulo.textContent = '';
    iNivel = iN;
    const pl = plantaDeNivel(p, iN);
    const B = pl.B, L = pl.L;
    if (modo === 'silueta') armarPanelSil();
    const zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0, zTop = p.niveles[0]?.cota ?? 0;
    const zN = nivel?.cota ?? 0;
    const w = svg.clientWidth || 600, h = svg.clientHeight || 500;
    const ext = Math.max(B, L, ...p.muros.map(m => 2 * (Math.abs(m.x) + huella(m).ax / 2)), ...p.muros.map(m => 2 * (Math.abs(m.y) + huella(m).ay / 2))) + 6;
    escala = Math.min(w, h) / ext;
    ox = w / 2; oy = h / 2;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.replaceChildren();
    const X = (x: number) => ox + x * escala, Y = (y: number) => oy - y * escala;
    // grilla de 1 m
    const g = el('g', { class: 'grilla' });
    const n = Math.ceil(ext / 2);
    for (let i = -n; i <= n; i++) {
      g.appendChild(el('line', { x1: X(i), y1: Y(-n), x2: X(i), y2: Y(n), class: i % 5 ? 'g1' : 'g5' }));
      g.appendChild(el('line', { x1: X(-n), y1: Y(i), x2: X(n), y2: Y(i), class: i % 5 ? 'g1' : 'g5' }));
    }
    svg.appendChild(g);
    const c = estado.calco;
    if (c) {
      const alto = c.ancho * c.aspecto;
      svg.appendChild(el('image', { href: c.url, x: X(c.x - c.ancho / 2), y: Y(c.y + alto / 2), width: c.ancho * escala, height: alto * escala, opacity: c.opacidad, preserveAspectRatio: 'none', class: 'calco' }));
    }
    const contorno = puntosSilueta(pl.silueta);
    const pathC = el('polygon', { points: contorno.map(q => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' '), class: 'contorno' + (modo === 'silueta' ? ' editando' : '') });
    svg.appendChild(pathC);
    if (modo === 'silueta') {
      // doble clic en un borde: vértice nuevo en el tramo más cercano
      pathC.addEventListener('dblclick', ev => {
        const q = aMundo(ev as unknown as PointerEvent);
        const v = pl.silueta;
        let mejor = 0, dMin = Infinity;
        v.forEach((a, i) => { const b2 = v[(i + 1) % v.length]; const dx = b2.x - a.x, dy = b2.y - a.y; const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy || 1))); const d = Math.hypot(a.x + t * dx - q.x, a.y + t * dy - q.y); if (d < dMin) { dMin = d; mejor = i; } });
        estado.cambiar(() => { const s2 = siluetaPropia(); s2[mejor] = { ...s2[mejor], b: 0 }; s2.splice(mejor + 1, 0, { x: +(Math.round(q.x / 0.05) * 0.05).toFixed(2), y: +(Math.round(q.y / 0.05) * 0.05).toFixed(2) }); });
      });
      pl.silueta.forEach((v, i) => {
        const hnd = el('circle', { cx: X(v.x), cy: Y(v.y), r: 5.5, class: 'vertice', tabindex: 0 });
        hnd.appendChild(el('title', {}, `vértice ${i + 1}: x ${v.x.toFixed(2)} · y ${v.y.toFixed(2)}${v.b ? ` · arco (bulge ${v.b.toFixed(3)})` : ''} · arrastrar para mover, clic derecho para borrar`));
        hnd.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); siluetaPropia(); arrastreV = i; try { svg.setPointerCapture(ev.pointerId); } catch { /* sintético */ } });
        hnd.addEventListener('contextmenu', ev => { ev.preventDefault(); if (pl.silueta.length > 3) estado.cambiar(() => { siluetaPropia().splice(i, 1); }); });
        svg.appendChild(hnd);
      });
    }
    svg.appendChild(el('line', { x1: X(0), y1: Y(-n), x2: X(0), y2: Y(n), class: 'eje' }));
    svg.appendChild(el('line', { x1: X(-n), y1: Y(0), x2: X(n), y2: Y(0), class: 'eje' }));
    // ejes de inercia y centro de rigidez (con los valores elegidos: planilla o guía/CIRSOC)
    const c0 = estado.calculo;
    const r = estado.fuente === 'guia' ? c0.corr?.guia : c0.res;
    const xA = r?.rotA.J7, yB = r?.rotB.J7;
    if (xA !== undefined && isFinite(xA) && estado.dir === 'A') svg.appendChild(el('line', { x1: X(xA), y1: Y(-n), x2: X(xA), y2: Y(n), class: 'inercia' }));
    if (yB !== undefined && isFinite(yB) && estado.dir === 'B') svg.appendChild(el('line', { x1: X(-n), y1: Y(yB), x2: X(n), y2: Y(yB), class: 'inercia' }));
    if (xA !== undefined && yB !== undefined && isFinite(xA) && isFinite(yB)) {
      const cr = el('circle', { cx: X(xA), cy: Y(yB), r: 5, class: 'cr' });
      cr.appendChild(el('title', {}, `Centro de rigidez: x = ${xA.toFixed(2)} m, y = ${yB.toFixed(2)} m (cruce de los ejes de inercia)`));
      svg.appendChild(cr);
      svg.appendChild(el('text', { x: X(xA) + 7, y: Y(yB) - 7, class: 'etiqueta' }, 'CR'));
    }
    // viento
    const fl = el('g', { class: 'viento' });
    if (estado.dir === 'A') { fl.appendChild(el('line', { x1: X(0), y1: Y(-L / 2 - 4.5), x2: X(0), y2: Y(-L / 2 - 1.2), 'marker-end': 'url(#punta)' })); fl.appendChild(el('text', { x: X(0.6), y: Y(-L / 2 - 3.5) }, 'viento A')); }
    else { fl.appendChild(el('line', { x1: X(-B / 2 - 4.5), y1: Y(0), x2: X(-B / 2 - 1.2), y2: Y(0), 'marker-end': 'url(#punta)' })); fl.appendChild(el('text', { x: X(-B / 2 - 4.5), y: Y(0.6) }, 'viento B')); }
    const defs = el('defs');
    const mk = el('marker', { id: 'punta', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
    mk.appendChild(el('path', { d: 'M0,0 L10,5 L0,10 z', class: 'punta' }));
    defs.appendChild(mk);
    svg.appendChild(defs);
    svg.appendChild(fl);
    // muros
    const papeles = estado.calculo.asig?.papeles ?? {};
    const yaRotuladas = new Set<string>();
    p.muros.forEach(m => {
      const papel = papeles[m.id]?.[estado.dir] ?? 'sin pieza';
      const { ax: dx, ay: dy } = huella(m);
      const t = tipoDe(m);
      const esta = presenteEn(m, zN, zFund, zTop);
      const grupo = el('g', { class: 'muro' + (estado.seleccion === m.id ? ' sel' : '') + (m.llega ? '' : ' fuera') + (esta ? '' : ' ausente'), 'data-id': m.id, tabindex: 0 });
      const forma = el('g');
      if (t === 'tubo-circ') {
        forma.appendChild(el('circle', { cx: X(m.x), cy: Y(m.y), r: (m.largo / 2) * escala, fill: COLORES[papel] }));
        if (dInterior(m) > 0) forma.appendChild(el('circle', { cx: X(m.x), cy: Y(m.y), r: (dInterior(m) / 2) * escala, class: 'hueco' }));
      } else rectangulos(m).forEach(r => forma.appendChild(el('rect', { x: X(r.x - r.ax / 2), y: Y(r.y + r.ay / 2), width: Math.max(2, r.ax * escala), height: Math.max(2, r.ay * escala), fill: COLORES[papel] })));
      grupo.appendChild(forma);
      const pieza = estado.dir === 'A' ? m.piezaA : m.piezaB;
      // etiqueta del lado de afuera (lejos del centro de la planta), para no tapar los muros del núcleo
      const izq = m.x < 0, abajo = m.y < 0;
      const vertical = t !== 'tabique' || m.dir === 'Y';
      const lx = vertical ? (izq ? X(m.x - dx / 2) - 4 : X(m.x + dx / 2) + 4) : X(m.x);
      const ly = vertical ? Y(m.y) + 4 : abajo ? Y(m.y - dy / 2) + 13 : Y(m.y + dy / 2) - 5;
      const ancla = vertical ? (izq ? 'end' : 'start') : 'middle';
      // con muchos muros, un solo rótulo por pieza (el del primer muro) para que la planta se pueda leer
      const muchos = p.muros.length > 24;
      const rot = !muchos ? `${m.id}${pieza ? ' · ' + pieza : ''}` : pieza && !yaRotuladas.has(pieza) ? pieza : '';
      if (pieza) yaRotuladas.add(pieza);
      if (rot && esta) grupo.appendChild(el('text', { x: lx, y: ly, class: 'etiqueta', 'text-anchor': ancla }, rot));
      grupo.appendChild(el('title', {}, `${m.id}${pieza ? ' · pieza ' + pieza : ''} · ${papel}${esta ? '' : ' · no está en este nivel'}`));
      grupo.addEventListener('pointerdown', ev => {
        if (modo !== 'mover') return;
        ev.preventDefault();
        ultimoEspesor = m.espesor;
        estado.seleccion = m.id;
        const q = aMundo(ev);
        arrastre = { id: m.id, x0: m.x, y0: m.y, mx: q.x, my: q.y };
        try { svg.setPointerCapture(ev.pointerId); } catch { /* puntero sintético: se arrastra igual */ }
        estado.cambiar();
      });
      svg.appendChild(grupo);
    });
    calib.forEach(q => svg.appendChild(el('circle', { cx: X(q.x), cy: Y(q.y), r: 5, class: 'iman extremo' })));
    // muro en dibujo: vista previa con su largo y el imán
    if (modo === 'dibujar' && cursor) {
      const pr = el('g', { class: 'previa' });
      if (inicio) {
        const t = muroDesdeTramo(inicio, cursor, ultimoEspesor);
        if (t) {
          const ax = t.dir === 'X' ? t.largo : t.espesor, ay = t.dir === 'X' ? t.espesor : t.largo;
          pr.appendChild(el('rect', { x: X(t.x - ax / 2), y: Y(t.y + ay / 2), width: Math.max(2, ax * escala), height: Math.max(2, ay * escala) }));
          pr.appendChild(el('text', { x: X(t.x) + (t.dir === 'Y' ? 8 : 0), y: Y(t.y) + (t.dir === 'X' ? -8 : 4), class: 'etiqueta', 'text-anchor': t.dir === 'X' ? 'middle' : 'start' }, `${t.largo.toFixed(2).replace('.', ',')} m`));
        }
        pr.appendChild(el('circle', { cx: X(inicio.x), cy: Y(inicio.y), r: 4, class: 'iman' }));
      }
      pr.appendChild(el('circle', { cx: X(cursor.x), cy: Y(cursor.y), r: iman === 'grilla' ? 3 : 6, class: `iman ${iman}` }));
      svg.appendChild(pr);
    }
  }
  let ultimoEspesor = 0.2;
  const pegar = (ev: PointerEvent) => { const r = imanar(aMundo(ev), estado.proyecto.muros, 8 / escala + 0.05); iman = r.a; return r.p; };
  svg.addEventListener('pointerdown', ev => {
    if (modo === 'calibrar' && ev.button === 0 && estado.calco) {
      ev.preventDefault();
      calib.push(aMundo(ev));
      dibujar();
      if (calib.length === 2) {
        const medida = Math.hypot(calib[1].x - calib[0].x, calib[1].y - calib[0].y);
        const txt = window.prompt(`Distancia real entre los dos puntos, en metros (en el dibujo mide ${medida.toFixed(2).replace('.', ',')} m):`);
        const real = Number(String(txt ?? '').replace(',', '.'));
        if (real > 0 && medida > 1e-6) {
          const f = real / medida, c = estado.calco;
          // escala alrededor del primer punto: ese punto queda en su lugar
          c.x = +(calib[0].x + (c.x - calib[0].x) * f).toFixed(3); c.y = +(calib[0].y + (c.y - calib[0].y) * f).toFixed(3); c.ancho = +(c.ancho * f).toFixed(3);
          armarPanelCalco();
        }
        ponerModo('mover');
      }
      return;
    }
    if (modo !== 'dibujar' || ev.button !== 0) return;
    ev.preventDefault();
    const q = pegar(ev);
    if (!inicio) { inicio = q; cursor = q; dibujar(); return; }
    const t = muroDesdeTramo(inicio, q, ultimoEspesor);
    if (!t) return;
    const fin = t.dir === 'X' ? { x: t.x + (q.x >= inicio.x ? 1 : -1) * t.largo / 2, y: t.y } : { x: t.x, y: t.y + (q.y >= inicio.y ? 1 : -1) * t.largo / 2 };
    estado.cambiar(() => {
      const id = nuevoId();
      const m: Muro = { id, ...t, llega: true, areaInf: 10, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '' };
      estado.proyecto.muros = armarPiezas([...estado.proyecto.muros, m]);
      estado.seleccion = id;
    });
    inicio = { x: +fin.x.toFixed(2), y: +fin.y.toFixed(2) };      // encadenado: el próximo arranca donde terminó este
  });
  svg.addEventListener('dblclick', () => { if (modo === 'dibujar') { inicio = null; dibujar(); } });
  svg.addEventListener('contextmenu', ev => { if (modo === 'dibujar') { ev.preventDefault(); inicio = null; dibujar(); } });
  document.addEventListener('keydown', ev => { if (modo === 'calibrar' && ev.key === 'Escape') { ponerModo('mover'); return; } if (modo === 'dibujar' && ev.key === 'Escape') { if (inicio) inicio = null; else ponerModo('mover'); dibujar(); } });

  svg.addEventListener('pointermove', ev => {
    const co = document.getElementById('coords');
    if (co) { const q = aMundo(ev); co.textContent = `x ${q.x.toFixed(2).replace('.', ',').replace('-', '−')} · y ${q.y.toFixed(2).replace('.', ',').replace('-', '−')} m`; }
    if (modo === 'dibujar') { cursor = pegar(ev); dibujar(); return; }
    if (modo === 'calibrar') return;
    if (modo === 'silueta') {
      if (arrastreV === null) return;
      const q = aMundo(ev), v = estado.proyecto.niveles[iNivel].silueta;
      if (v && v[arrastreV]) { v[arrastreV].x = +(Math.round(q.x / 0.05) * 0.05).toFixed(2); v[arrastreV].y = +(Math.round(q.y / 0.05) * 0.05).toFixed(2); dibujar(); }
      return;
    }
    if (!arrastre) return;
    const q = aMundo(ev);
    const snap = (v: number) => Math.round(v / 0.05) * 0.05;
    const m = estado.proyecto.muros.find(x => x.id === arrastre!.id);
    if (!m) return;
    m.x = +snap(arrastre.x0 + q.x - arrastre.mx).toFixed(2);
    m.y = +snap(arrastre.y0 + q.y - arrastre.my).toFixed(2);
    dibujar();
  });
  const soltar = () => { if (arrastre) { arrastre = null; estado.cambiar(); } if (arrastreV !== null) { arrastreV = null; estado.cambiar(); } };
  svg.addEventListener('pointerup', soltar);
  svg.addEventListener('pointercancel', soltar);
  svg.addEventListener('keydown', ev => {
    const m = estado.proyecto.muros.find((x: Muro) => x.id === estado.seleccion);
    if (!m) return;
    const paso = ev.shiftKey ? 1 : 0.05;
    const mov: Record<string, [number, number]> = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, paso], ArrowDown: [0, -paso] };
    if (mov[ev.key]) { ev.preventDefault(); estado.cambiar(() => { m.x = +(m.x + mov[ev.key][0]).toFixed(2); m.y = +(m.y + mov[ev.key][1]).toFixed(2); }); }
  });
  new ResizeObserver(dibujar).observe(svg);
  estado.suscribir(dibujar);
  estado.suscribirSeleccion(dibujar);
  ponerModo('mover');
}
