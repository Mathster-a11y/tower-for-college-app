/**
 * Editor del contorno de un elemento (doble clic en un tabique, un tubo rectangular o un perfil): la polilínea cerrada
 * que lo forma, con imán a la grilla, a las guías y a los nodos.
 *
 * «Mantener ortogonal» (lo normal para tabiques y tubos): al arrastrar un vértice, los lados vecinos siguen en x e y;
 * al arrastrar el medio de un lado, el lado se corre entero (cambia el largo o el ancho). Así el tabique sigue siendo
 * un tabique. Sin ortogonal: los vértices van libres, tocar el medio de un lado agrega un vértice, y cada tramo puede
 * ser recto, un arco o una Bézier. Si al terminar el contorno ya no es un rectángulo en x e y, la app avisa antes de
 * convertirlo en perfil irregular (cambia cómo entra en la hoja J).
 */
import { estado, fmt } from './estado';
import { tarjeta } from './tarjeta';
import type { ApiPlanta, Vista } from './colocar';
import type { Muro } from '../engine/modelo';
import { tipoDe } from '../engine/modelo';
import { muroBloqueado } from '../engine/grupos';
import { acople, esOrtogonal, esRectanguloOrtogonal, perfilDeMuro, polilinea, ponerPerfil, propiedades, type Perfil, type VerticePerfil } from '../engine/perfil';
import type { Punto, Vertice } from '../engine/silueta';
import { arcoComplementario, arcoConCentro, arcoConRadioMismoLado, geometriaArco, invertirArco, arcoConRadio, chaflan, enderezarAnillo, suavizarAnillo, sustraerEsquina, tratarEsquinas, circulo, desfasarAnillo, dividirLado, elipse, empalme, escalarAnillo, espejarAnillo, girarAnillo, ladoCon, medidaLado, poligonoRegular, polar15, rectangulo } from '../engine/contorno';

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const num = (t: string) => { const v = parseFloat(t.replace(',', '.')); return isFinite(v) ? v : NaN; };
type Sel = { anillo: number; i: number } | null;

/** íconos de las herramientas de CAD (trazos de 24 × 24, con el color del texto) */
const ICONOS = {
  recto: '<path d="M4 18 20 6"/>',
  arco: '<path d="M4 18Q12 0 20 18"/>',
  bezier: '<path d="M4 18C7 3 17 21 20 6"/><circle cx="7" cy="3" r="1.6"/><circle cx="17" cy="21" r="1.6"/>',
  redondear: '<path d="M4 20V11a7 7 0 0 1 7-7h9"/>',
  chaflan: '<path d="M4 20V11l7-7h9"/>',
  sustraer: '<path d="M4 20V10h6V4h10"/>',
  suavizar: '<path d="M3 17C8 4 16 20 21 7"/>',
  enderezar: '<path d="M3 17 9 6l6 10 6-9"/>',
  afuera: '<rect x="8" y="8" width="8" height="8" stroke-dasharray="2 2"/><rect x="4" y="4" width="16" height="16"/>',
  adentro: '<rect x="4" y="4" width="16" height="16" stroke-dasharray="2 2"/><rect x="8" y="8" width="8" height="8"/>',
  espejoX: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 6 3 12l6 6zM15 6l6 6-6 6z"/>',
  espejoY: '<path d="M3 12h18" stroke-dasharray="2 2"/><path d="M6 9l6-6 6 6zM6 15l6 6 6-6z"/>',
  girar: '<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M17 3v4h-4"/>',
  escalar: '<rect x="4" y="13" width="7" height="7"/><path d="M11 13l8-8M14 5h5v5"/>',
  dividir: '<path d="M3 12h18M9 8v8M15 8v8"/>',
  arcoRadio: '<path d="M4 18a8 8 0 0 1 16 0"/><path d="M12 18V10" stroke-dasharray="2 2"/>',
  forma: '<rect x="4" y="5" width="16" height="14" rx="2"/>',
  hueco: '<rect x="3" y="4" width="18" height="16"/><rect x="9" y="9" width="6" height="6"/>',
  deshacer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  rehacer: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
} as const;
const svgIcono = (k: keyof typeof ICONOS) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[k]}</svg>`;

export function montarEditorContorno(api: ApiPlanta) {
  const { svg, el } = api;
  let id: string | null = null, P: Perfil | null = null, original: Muro | null = null, ortogonal = true;
  let vista: Vista = { X: x => x, Y: y => y, escala: 1 }; void vista;
  let sel: Sel = null, tramo: Sel = null;
  /** se tocó el medio de un lado recto (sin ortogonal): si el puntero se mueve, se agrega un vértice ahí */
  let pendiente: { anillo: number; i: number; sx: number; sy: number } | null = null;
  // deshacer dentro del editor (Ctrl+Z / Ctrl+Y)
  let atras: Perfil[] = [], adelante: Perfil[] = [];
  const guardar = () => { if (P) { atras.push(clonar(P)); if (atras.length > 100) atras.shift(); adelante = []; } };
  const deshacer = (rehacer = false) => {
    const de = rehacer ? adelante : atras, a = rehacer ? atras : adelante;
    const q = de.pop(); if (!q || !P) { api.mensaje(rehacer ? 'Nada para rehacer.' : 'Nada para deshacer en el contorno.'); return; }
    a.push(clonar(P)); P = q; sel = null; tramo = null; armar(); api.dibujar();
  };
  // valores de las herramientas
  const her = { r: 0.3, d: 0.2, partes: 2, desf: 0.1, giro: 15, escala: 1.25, lados: 6, forma: 'rect' as 'rect' | 'circulo' | 'poligono' | 'elipse' };
  let arrastre: { tipo: 'vertice' | 'lado' | 'c1' | 'c2' | 'arco' | 'centro'; anillo: number; i: number; base: Perfil } | null = null;
  /**
   * otro contorno (no un muro): la losa o la carpintería de un nivel. Sin huecos; los arcos se guardan exactos
   * (bulge) y las Bézier, como puntos de la curva.
   */
  let destino: { titulo: string; guardar: (v: Vertice[]) => void } | null = null;
  const panel = document.createElement('div'); panel.className = 'calco-panel colocar-panel contorno-panel'; panel.hidden = true;
  (svg.parentElement ?? api.dock).appendChild(panel);

  const anillos = (p: Perfil) => [p.v, ...(p.huecos ?? [])];
  const anilloDe = (p: Perfil, k: number) => (k === 0 ? p.v : p.huecos![k - 1]);
  const clonar = (p: Perfil): Perfil => JSON.parse(JSON.stringify(p));

  /** abre el editor para el muro; devuelve false si no se puede */
  function abrir(m: Muro): boolean {
    if (muroBloqueado(estado.proyecto, m)) { api.mensaje(`${m.id} está bloqueado 🔒.`); return false; }
    const t = tipoDe(m);
    destino = null;
    id = m.id; original = JSON.parse(JSON.stringify(m)); P = perfilDeMuro(m);
    ortogonal = t !== 'perfil' || esOrtogonal(P);
    if (t === 'tubo-circ') ortogonal = false;
    sel = null; tramo = null; atras = []; adelante = [];
    api.activar(true); svg.classList.add('editando-contorno'); svg.parentElement?.classList.add('con-contorno');
    api.centrarEn?.(m.x, m.y);
    armar(); api.dibujar();
    api.mensaje(`Contorno de ${m.id}: arrastrá los vértices (□) o el medio de un lado (○) para cambiar largo y ancho. Enter o «Listo» termina; Esc cancela.`);
    return true;
  }
  /** abre el editor con un contorno cerrado cualquiera (la losa o la carpintería de un nivel) */
  function abrirContorno(o: { titulo: string; v: Vertice[]; guardar: (v: Vertice[]) => void }) {
    if (o.v.length < 3) { api.mensaje('El contorno necesita al menos tres vértices.'); return false; }
    destino = { titulo: o.titulo, guardar: o.guardar };
    id = '·contorno'; original = null;
    P = { v: o.v.map(q => ({ x: q.x, y: q.y, ...(q.b ? { b: q.b } : {}) })) };
    ortogonal = esOrtogonal(P) && !P.v.some(q => q.b);
    sel = null; tramo = null; atras = []; adelante = [];
    api.activar(true); svg.classList.add('editando-contorno'); svg.parentElement?.classList.add('con-contorno');
    armar(); api.dibujar();
    api.mensaje(`${o.titulo}: elegí un lado (○) para hacerlo arco, o un vértice (□) para redondearlo (empalme). Enter o «Listo» termina; Esc cancela.`);
    return true;
  }
  function cerrar() { id = null; P = null; original = null; arrastre = null; destino = null; panel.hidden = true; svg.classList.remove('editando-contorno'); svg.parentElement?.classList.remove('con-contorno'); api.activar(false); api.dibujar(); }

  /** guarda el contorno en el muro: tabique o tubo si sigue siéndolo, o perfil irregular (con aviso) */
  async function listo() {
    if (destino && P) {
      // arcos exactos (bulge) y Bézier exactas (puntos de control): el viento y el 3D las recorren con puntosSilueta
      const v: Vertice[] = P.v.map(a => ({ x: r4(a.x), y: r4(a.y), ...(a.c1 && a.c2 ? { c1: { x: r4(a.c1.x), y: r4(a.c1.y) }, c2: { x: r4(a.c2.x), y: r4(a.c2.y) } } : a.b ? { b: r4(a.b) } : {}) }));
      const d = destino;
      cerrar();
      d.guardar(v);
      api.mensaje(`${d.titulo}: guardado (${v.length} vértices${v.some(q => q.b) ? ', con arcos' : ''}). Ctrl+Z deshace.`);
      return;
    }
    if (!P || !id || !original) return;
    const m = estado.proyecto.muros.find(x => x.id === id);
    if (!m) { cerrar(); return; }
    const t0 = tipoDe(original), rect = esRectanguloOrtogonal(P);
    const huecoRect = P.huecos?.length === 1 && P.v.length === 4 && !P.v.some(q => q.b || q.c1) ? esRectanguloOrtogonal({ v: P.v }) : null;
    const hueco = huecoRect ? esRectanguloOrtogonal({ v: P.huecos![0] }) : null;
    const espTubo = huecoRect && hueco && Math.abs(huecoRect.cx - hueco.cx) < 1e-3 && Math.abs(huecoRect.cy - hueco.cy) < 1e-3 && Math.abs((huecoRect.ax - hueco.ax) - (huecoRect.ay - hueco.ay)) < 2e-3 ? r4((huecoRect.ax - hueco.ax) / 2) : null;
    let nuevo: Muro | null = null;
    if (rect && (t0 === 'tabique' || t0 === 'perfil')) {
      if (t0 === 'perfil') {
        const r = await tarjeta({ tipo: 'pregunta', titulo: 'Volver a tabique', texto: `El contorno de ${id} es un rectángulo con los lados en x e y. ¿Lo convierto en tabique (entra en la hoja J como siempre) o queda como perfil?`, botones: ['Convertir en tabique', 'Dejarlo como perfil', 'Seguir editando'] });
        if (r.boton === 2 || r.boton < 0) return;
        if (r.boton === 1) nuevo = ponerPerfil(m, P);
      }
      if (!nuevo) { const { perfil: _p, ...resto } = m; void _p; nuevo = { ...resto, tipo: undefined, x: rect.cx, y: rect.cy, dir: rect.ay > rect.ax ? 'Y' : rect.ax > rect.ay ? 'X' : (m.dir), largo: Math.max(rect.ax, rect.ay), espesor: Math.min(rect.ax, rect.ay) } as Muro; delete nuevo.tipo; }
    } else if (t0 === 'tubo-rect' && huecoRect && espTubo !== null && espTubo > 0) {
      const { perfil: _p, ...resto } = m; void _p;
      nuevo = { ...resto, tipo: 'tubo-rect', x: huecoRect.cx, y: huecoRect.cy, largo: huecoRect.ax, ladoY: huecoRect.ay, espesor: espTubo } as Muro;
    } else if (t0 === 'tubo-rect' && rect) {
      const { perfil: _p, ...resto } = m; void _p;
      nuevo = { ...resto, tipo: 'tubo-rect', x: rect.cx, y: rect.cy, largo: rect.ax, ladoY: rect.ay, espesor: Math.min(rect.ax, rect.ay) / 2 } as Muro;
    } else {
      if (t0 !== 'perfil') {
        const nombre = t0 === 'tabique' ? 'un tabique' : t0 === 'tubo-rect' ? 'un tubo rectangular' : 'un tubo circular';
        const r = await tarjeta({ tipo: 'aviso', titulo: 'Cambia de categoría', texto: `El contorno de ${id} ya no es ${t0 === 'tubo-circ' ? 'un círculo' : 'un rectángulo con los lados en x e y'}: deja de ser ${nombre} y pasa a ser un perfil irregular. En la hoja J entra con su rectángulo equivalente (mismo J y misma área) y la flexión usa la fibra real. ${esOrtogonal(P) ? '' : 'Además tiene lados en diagonal o curvas: aparece J xy.'}`, botones: ['Convertir en perfil', 'Seguir editando', 'Descartar los cambios'] });
        if (r.boton === 1 || r.boton < 0) return;
        if (r.boton === 2) { cerrar(); api.mensaje('Cambios descartados.'); return; }
      }
      nuevo = ponerPerfil(m, P);
      if (t0 === 'tubo-rect' || t0 === 'tubo-circ') delete nuevo.ladoY;
    }
    const n = nuevo!;
    const k = propiedades(perfilDeMuro(n));
    estado.cambiar(p => { const i = p.muros.findIndex(x => x.id === id); if (i >= 0) p.muros[i] = n; });
    api.mensaje(`${id}: ${tipoDe(n) === 'perfil' ? 'perfil irregular' : tipoDe(n)} · A = ${fmt(k.A, 3)} m² · J A = ${fmt(k.JA, 4)} · J B = ${fmt(k.JB, 4)} m⁴.`);
    cerrar();
  }

  // ---------------------------------------------------------------- arrastres
  const ortoAnillo = (vs: VerticePerfil[]) => vs.every((a, i) => { const b = vs[(i + 1) % vs.length]; return !a.b && !a.c1 && (Math.abs(a.x - b.x) < 1e-4 || Math.abs(a.y - b.y) < 1e-4); });
  function moverVertice(base: Perfil, k: number, i: number, q: Punto): Perfil {
    const p = clonar(base), vs = anilloDe(p, k), bs = anilloDe(base, k), n = vs.length;
    const dx = q.x - bs[i].x, dy = q.y - bs[i].y;
    vs[i] = { ...vs[i], x: r4(q.x), y: r4(q.y) };
    // los puntos de control de la Bézier que sale del vértice se mueven con él
    if (vs[i].c1) vs[i].c1 = { x: r4(bs[i].c1!.x + dx), y: r4(bs[i].c1!.y + dy) };
    const ant = vs[(i - 1 + n) % n]; if (ant.c2) ant.c2 = { x: r4(bs[(i - 1 + n) % n].c2!.x + dx), y: r4(bs[(i - 1 + n) % n].c2!.y + dy) };
    if (ortogonal && ortoAnillo(bs)) {
      const ia = (i - 1 + n) % n, ib = (i + 1) % n;
      if (Math.abs(bs[ia].y - bs[i].y) < 1e-4) vs[ia] = { ...vs[ia], y: r4(q.y) }; else vs[ia] = { ...vs[ia], x: r4(q.x) };
      if (Math.abs(bs[ib].y - bs[i].y) < 1e-4) vs[ib] = { ...vs[ib], y: r4(q.y) }; else vs[ib] = { ...vs[ib], x: r4(q.x) };
    }
    return p;
  }
  function moverLado(base: Perfil, k: number, i: number, q: Punto): Perfil {
    const p = clonar(base), vs = anilloDe(p, k), bs = anilloDe(base, k), n = vs.length, j = (i + 1) % n;
    if (Math.abs(bs[i].y - bs[j].y) < 1e-4) { vs[i] = { ...vs[i], y: r4(q.y) }; vs[j] = { ...vs[j], y: r4(q.y) }; }
    else if (Math.abs(bs[i].x - bs[j].x) < 1e-4) { vs[i] = { ...vs[i], x: r4(q.x) }; vs[j] = { ...vs[j], x: r4(q.x) }; }
    else { const mx = (bs[i].x + bs[j].x) / 2, my = (bs[i].y + bs[j].y) / 2, dx = q.x - mx, dy = q.y - my; vs[i] = { ...vs[i], x: r4(bs[i].x + dx), y: r4(bs[i].y + dy) }; vs[j] = { ...vs[j], x: r4(bs[j].x + dx), y: r4(bs[j].y + dy) }; }
    return p;
  }
  /** bulge del arco que pasa por q entre los vértices i e i+1 */
  function arcoPor(base: Perfil, k: number, i: number, q: Punto): Perfil {
    const p = clonar(base), vs = anilloDe(p, k), a = vs[i], b = vs[(i + 1) % vs.length];
    const ax = a.x - q.x, ay = a.y - q.y, bx = b.x - q.x, by = b.y - q.y, cr = ax * by - ay * bx;
    if (Math.abs(cr) < 1e-9) { delete vs[i].b; return p; }
    const ang = Math.atan2(Math.abs(cr), ax * bx + ay * by), th = 2 * (Math.PI - ang) * (cr > 0 ? -1 : 1);
    vs[i] = { ...vs[i], b: r4(Math.tan(th / 4)) }; delete vs[i].c1; delete vs[i].c2;
    return p;
  }

  const punteroEn = (ev: PointerEvent) => api.pegar(ev).p;
  svg.addEventListener('pointerdown', ev => {
    if (!id || !P || ev.button !== 0) return;
    // la manija tocada; si encima había otro dibujo (un rótulo, la flecha del viento), la más cercana a menos de 12 px
    let h = (ev.target as Element).closest?.('[data-h]') as SVGElement | null;
    if (!h) {
      let dmin = 12;
      svg.querySelectorAll<SVGElement>('.capa-contorno [data-h]').forEach(e => { const r = e.getBoundingClientRect(), d = Math.hypot(ev.clientX - (r.left + r.right) / 2, ev.clientY - (r.top + r.bottom) / 2); if (d < dmin) { dmin = d; h = e; } });
    }
    ev.preventDefault(); ev.stopPropagation();
    if (!h) { sel = null; tramo = null; armar(); api.dibujar(); return; }
    const [tipo, k, i] = h.getAttribute('data-h')!.split(':');
    guardar();
    const kk = Number(k), ii = Number(i);
    if (tipo === 'lado' && !ortogonal) {
      // sin ortogonal: tocar el medio de un lado recto lo elige (sus herramientas: arco, largo, dividir…); arrastrarlo
      // agrega un vértice ahí (se agrega recién cuando el puntero se mueve)
      const vs = anilloDe(P, kk), a = vs[ii];
      tramo = { anillo: kk, i: ii }; sel = null;
      if (!a.b && !a.c1) pendiente = { anillo: kk, i: ii, sx: ev.clientX, sy: ev.clientY };
      else arrastre = { tipo: 'arco', anillo: kk, i: ii, base: clonar(P) };
    } else {
      arrastre = { tipo: tipo as 'vertice' | 'lado' | 'c1' | 'c2' | 'arco' | 'centro', anillo: kk, i: ii, base: clonar(P) };
      if (tipo === 'vertice') { sel = { anillo: kk, i: ii }; tramo = null; } else { tramo = { anillo: kk, i: ii }; sel = null; }
    }
    try { svg.setPointerCapture(ev.pointerId); } catch { /* sintético */ }
    armar(); api.dibujar();
  });
  svg.addEventListener('pointermove', ev => {
    if (id && P && pendiente && Math.hypot(ev.clientX - pendiente.sx, ev.clientY - pendiente.sy) > 4) {
      const vs = anilloDe(P, pendiente.anillo), ii = pendiente.i, a = vs[ii], b = vs[(ii + 1) % vs.length];
      vs.splice(ii + 1, 0, { x: r4((a.x + b.x) / 2), y: r4((a.y + b.y) / 2) });
      arrastre = { tipo: 'vertice', anillo: pendiente.anillo, i: ii + 1, base: clonar(P) }; sel = { anillo: pendiente.anillo, i: ii + 1 }; tramo = null;
      pendiente = null;
    }
    if (!id || !P || !arrastre) return;
    ev.stopPropagation();
    const q = punteroEn(ev), a = arrastre;
    if (a.tipo === 'vertice') {
      // Shift: el lado que llega al vértice va de a 15° (rastreo polar)
      const vs = anilloDe(a.base, a.anillo), ant = vs[(a.i - 1 + vs.length) % vs.length];
      P = moverVertice(a.base, a.anillo, a.i, ev.shiftKey && !ortogonal ? polar15(ant, q) : q);
    }
    else if (a.tipo === 'lado') P = moverLado(a.base, a.anillo, a.i, q);
    else if (a.tipo === 'arco') P = arcoPor(a.base, a.anillo, a.i, q);
    else if (a.tipo === 'centro') {
      // el centro corre sobre la mediatriz de la cuerda: así el arco sigue pasando por sus dos extremos
      const g = geometriaArco(anilloDe(a.base, a.anillo), a.i);
      if (g) { const p = clonar(a.base), d = (q.x - g.mx) * g.nx + (q.y - g.my) * g.ny; const vs = arcoConCentro(anilloDe(p, a.anillo), a.i, d); if (a.anillo === 0) p.v = vs; else p.huecos![a.anillo - 1] = vs; P = p; }
    }
    else {
      const p = clonar(a.base), vs = anilloDe(p, a.anillo), n = vs.length, v = vs[a.i];
      v[a.tipo] = { x: r4(q.x), y: r4(q.y) };
      // tangente continua con la Bézier vecina (la curva no hace quiebre en el vértice); Alt: quiebre a propósito
      if (!ev.altKey) {
        const V = a.tipo === 'c1' ? vs[a.i] : vs[(a.i + 1) % n];
        const vec = a.tipo === 'c1' ? vs[(a.i - 1 + n) % n] : vs[(a.i + 1) % n];
        const otro = a.tipo === 'c1' ? 'c2' : 'c1', ctl = vec[otro];
        if (ctl && vec.c1 && vec.c2) {
          const lo = Math.hypot(ctl.x - V.x, ctl.y - V.y), dx = V.x - q.x, dy = V.y - q.y, l = Math.hypot(dx, dy);
          if (l > 1e-6) vec[otro] = { x: r4(V.x + (dx / l) * lo), y: r4(V.y + (dy / l) * lo) };
        }
      }
      P = p;
    }
    api.pedirDibujo(); armarDatos();
  });
  const soltar = () => { if (pendiente) { pendiente = null; armar(); api.dibujar(); return; } if (arrastre) { arrastre = null; armar(); api.dibujar(); } };
  svg.addEventListener('pointerup', soltar); svg.addEventListener('pointercancel', soltar);
  svg.addEventListener('dblclick', ev => { if (id) { ev.stopPropagation(); ev.preventDefault(); } }, true);
  document.addEventListener('keydown', ev => {
    if (!id || (ev.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); cerrar(); api.mensaje('Edición del contorno cancelada.'); }
    else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopImmediatePropagation(); void listo(); }
    else if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel) { ev.preventDefault(); ev.stopImmediatePropagation(); borrarVertice(); }
    else if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z' || ev.key === 'y')) { ev.preventDefault(); ev.stopImmediatePropagation(); deshacer(ev.key === 'y' || ev.shiftKey); }
  }, true);

  function borrarVertice() {
    if (!P || !sel) return;
    const vs = anilloDe(P, sel.anillo);
    if (vs.length <= 3) { api.mensaje('Un contorno necesita al menos tres vértices.'); return; }
    if (ortogonal) { api.mensaje('Con «Mantener ortogonal» no se borran vértices: destildalo primero.'); return; }
    guardar(); vs.splice(sel.i, 1); sel = null; armar(); api.dibujar();
  }
  /** aplica una herramienta a un anillo: el resultado reemplaza al anillo (o avisa el error) */
  function aplicarAnillo(k: number, f: (vs: VerticePerfil[]) => VerticePerfil[] | { error: string }, ok: string, libre = true) {
    if (!P) return;
    const r = f(anilloDe(P, k).map(q => ({ ...q })));
    if ('error' in r) { api.mensaje(r.error); return; }
    if (r.length < 2) { api.mensaje('El contorno quedaría sin lados.'); return; }
    guardar();
    if (k === 0) P.v = r; else P.huecos![k - 1] = r;
    if (libre && !esOrtogonal(P)) ortogonal = false;
    sel = null; tramo = null; armar(); api.dibujar(); api.mensaje(ok);
  }
  const centroAnillo = (k: number): Punto => { const pr = propiedades({ v: anilloDe(P!, k) }); return { x: pr.xg, y: pr.yg }; };
  /** forma nueva con el mismo centro y la misma caja que el anillo */
  function formaEn(k: number, forma: typeof her.forma): VerticePerfil[] {
    const pr = propiedades({ v: anilloDe(P!, k) }), cx = (pr.x0 + pr.x1) / 2, cy = (pr.y0 + pr.y1) / 2, ax = pr.x1 - pr.x0, ay = pr.y1 - pr.y0;
    if (forma === 'rect') return rectangulo(cx, cy, ax, ay);
    if (forma === 'circulo') return circulo(cx, cy, Math.min(ax, ay) / 2);
    if (forma === 'elipse') return elipse(cx, cy, ax / 2, ay / 2);
    return poligonoRegular(cx, cy, Math.min(ax, ay) / 2, her.lados);
  }
  function tipoTramo(t: 'recta' | 'arco' | 'bezier') {
    if (!P || !tramo) return;
    const vs = anilloDe(P, tramo.anillo), a = vs[tramo.i], b = vs[(tramo.i + 1) % vs.length];
    guardar();
    delete a.b; delete a.c1; delete a.c2;
    if (t === 'arco') a.b = 0.4;
    if (t === 'bezier') { const dx = b.x - a.x, dy = b.y - a.y; a.c1 = { x: r4(a.x + dx / 3 - dy / 4), y: r4(a.y + dy / 3 + dx / 4) }; a.c2 = { x: r4(a.x + (2 * dx) / 3 - dy / 4), y: r4(a.y + (2 * dy) / 3 + dx / 4) }; }
    if (t !== 'recta') ortogonal = false;
    armar(); api.dibujar();
  }

  // ---------------------------------------------------------------- panel
  const mk = <K extends keyof HTMLElementTagNameMap>(t: K, txt = '', cls = '') => { const e = document.createElement(t); if (txt) e.textContent = txt; if (cls) e.className = cls; return e; };
  /** botón con su ícono (o solo el ícono, si no hay texto: entonces el título es su nombre) */
  const boton = (t: string, titulo: string, f: () => void, activo = false, icono?: keyof typeof ICONOS) => {
    const x = mk('button'); x.type = 'button'; x.title = titulo; if (activo) x.classList.add('activo'); x.addEventListener('click', f);
    if (icono) { x.insertAdjacentHTML('beforeend', svgIcono(icono)); x.classList.add('con-icono'); if (!t) x.setAttribute('aria-label', titulo.split('.')[0]); }
    if (t) x.append(t);
    return x;
  };
  /** un grupo de herramientas: rótulo chico arriba y las filas abajo */
  const grupo = (rot: string, ...filas: HTMLElement[]) => { const g = mk('div', '', 'cad-grupo'); g.append(mk('span', rot, 'cad-rot'), ...filas); return g; };
  const fila = (...h: (Node | string)[]) => { const d = mk('div', '', 'col-fila'); d.append(...h); return d; };
  const datos = mk('div', '', 'col-nota contorno-datos');
  let abiertoCad = false;
  function armarDatos() {
    if (!P) return;
    const k = propiedades(P), r = esRectanguloOrtogonal(P);
    if (destino) { datos.textContent = `área ${fmt(k.A, 2)} m² · caja ${fmt(k.x1 - k.x0)} × ${fmt(k.y1 - k.y0)} m`; return; }
    datos.textContent = `${r ? `${fmt(r.ax)} × ${fmt(r.ay)} m · ` : ''}A = ${fmt(k.A, 3)} m² · J A = ${fmt(k.JA, 4)} · J B = ${fmt(k.JB, 4)} m⁴${acople(k) > 0.005 ? ` · J xy = ${fmt(k.Jxy, 4)}` : ''}`;
  }
  function armar() {
    if (!id || !P) { panel.hidden = true; return; }
    panel.hidden = false; panel.classList.remove('plegado');
    panel.replaceChildren();
    const m = estado.proyecto.muros.find(x => x.id === id);
    const tit = mk('b', destino ? destino.titulo : `Contorno de ${id}${m ? ` (${tipoDe(m) === 'perfil' ? 'perfil' : tipoDe(m) === 'tabique' ? 'tabique' : 'tubo'})` : ''}`);
    panel.append(tit);
    armarDatos(); panel.append(datos);
    const r = esRectanguloOrtogonal(P);
    if (r) {
      // largo y ancho escritos (el rectángulo crece desde su centro)
      const campo = (etq: string, v: number, f: (x: number) => void) => { const l = mk('label', '', 'col-campo'); l.append(etq); const i = mk('input'); i.type = 'text'; i.inputMode = 'decimal'; i.style.width = '56px'; i.value = String(v).replace('.', ','); i.addEventListener('change', () => { const x = num(i.value); if (x > 0) f(x); }); l.append(i, 'm'); return l; };
      const poner = (ax: number, ay: number) => { P = { v: [{ x: r.cx - ax / 2, y: r.cy - ay / 2 }, { x: r.cx + ax / 2, y: r.cy - ay / 2 }, { x: r.cx + ax / 2, y: r.cy + ay / 2 }, { x: r.cx - ax / 2, y: r.cy + ay / 2 }].map(q => ({ x: r4(q.x), y: r4(q.y) })) }; armar(); api.dibujar(); };
      panel.append(fila(campo('ancho (x)', r.ax, x => poner(x, r.ay)), campo('alto (y)', r.ay, y => poner(r.ax, y))));
    }
    const lo = mk('label', '', 'col-campo'), ci = mk('input'); ci.type = 'checkbox'; ci.checked = ortogonal;
    ci.addEventListener('change', () => { ortogonal = ci.checked; armar(); api.dibujar(); });
    lo.append(ci, destino ? 'Mantener ortogonal (lados en x e y)' : 'Mantener ortogonal (sigue siendo tabique)'); lo.title = destino ? 'Al arrastrar un vértice, los lados vecinos siguen en x e y. Destildalo para curvas y diagonales.' : 'Los lados quedan en x e y: el elemento no cambia de categoría';
    panel.append(fila(lo));
    if (!ortogonal) panel.append(mk('p', 'Libre: tocá el medio de un lado (○) para elegirlo y hacerlo arco; arrastralo para agregar un vértice. Tocá un vértice (□) para redondearlo o cortarlo.', 'col-nota'));
    else panel.append(mk('p', 'Para curvas y diagonales, destildá «Mantener ortogonal». También podés elegir un lado (○) y usar «Arco por radio».', 'col-nota'));
    if (tramo) panel.append(grupo('Tipo de lado', fila(boton('Recto', 'Lado recto', () => tipoTramo('recta'), false, 'recto'), boton('Arco', 'Arrastrá el medio para curvarlo', () => tipoTramo('arco'), false, 'arco'), boton('Bézier', 'Curva libre: arrastrá los dos puntos de control (○). La Bézier vecina acompaña para que no haya quiebre; con Alt, se quiebra.', () => tipoTramo('bezier'), false, 'bezier'))));
    // ---- herramientas de CAD
    const campo = (etq: string, v: number, f: (x: number) => void, ancho = 46, unidad = 'm') => { const l = mk('label', '', 'col-campo'); l.append(etq); const i = mk('input'); i.type = 'text'; i.inputMode = 'decimal'; i.style.width = `${ancho}px`; i.value = String(r4(v)).replace('.', ','); i.addEventListener('change', () => { const x = num(i.value); if (isFinite(x)) f(x); else i.value = String(r4(v)).replace('.', ','); }); l.append(i, unidad); return l; };
    if (sel) {
      const k = sel.anillo, i = sel.i, q = anilloDe(P, k)[i];
      panel.append(mk('b', `Vértice ${i + 1}${k ? ` del hueco ${k}` : ''}`, 'col-sub'));
      panel.append(fila(campo('x', q.x, x => { guardar(); P = moverVertice(P!, k, i, { x, y: q.y }); armar(); api.dibujar(); }, 60), campo('y', q.y, y => { guardar(); P = moverVertice(P!, k, i, { x: q.x, y }); armar(); api.dibujar(); }, 60)));
      panel.append(grupo('Esta esquina', fila(campo('r', her.r, x => { her.r = x; }), campo('d', her.d, x => { her.d = x; })),
        fila(boton('Empalme', 'Redondea la esquina con un arco tangente de radio r', () => aplicarAnillo(k, vs => empalme(vs, i, her.r), `Esquina redondeada con radio ${fmt(her.r)} m.`), false, 'redondear'),
          boton('Chaflán', 'Corta la esquina a la distancia d sobre cada lado', () => aplicarAnillo(k, vs => chaflan(vs, i, her.d), `Esquina cortada a ${fmt(her.d)} m.`), false, 'chaflan'),
          boton('Sustraer', 'Saca de la esquina un rectángulo de d × d (retranqueo)', () => aplicarAnillo(k, vs => sustraerEsquina(vs, i, her.d), `Esquina sustraída ${fmt(her.d)} × ${fmt(her.d)} m.`), false, 'sustraer'))));
    }
    if (tramo) {
      const k = tramo.i >= 0 ? tramo.anillo : 0, i = tramo.i, md = medidaLado(anilloDe(P, k), i), a0 = anilloDe(P, k)[i];
      panel.append(mk('b', `Lado ${i + 1}${k ? ` del hueco ${k}` : ''}`, 'col-sub'));
      if (!a0.b && !a0.c1) panel.append(fila(
        campo('largo', md.largo, x => aplicarAnillo(k, vs => ladoCon(vs, i, x), `Lado de ${fmt(x)} m (queda fijo su primer vértice).`), 52),
        campo('ángulo', md.angulo, x => aplicarAnillo(k, vs => ladoCon(vs, i, md.largo, x), `Lado a ${fmt(x)}°.`), 44, '°')));
      else if (a0.b) {
        // arco: radio y centro sin mover los extremos (el centro siempre queda sobre la mediatriz de la cuerda)
        const g = geometriaArco(anilloDe(P, k), i)!;
        const aCentro = (x: number, y: number) => aplicarAnillo(k, vs => arcoConCentro(vs, i, (x - g.mx) * g.nx + (y - g.my) * g.ny), 'Centro del arco movido sobre la mediatriz (los extremos no se mueven).');
        panel.append(
          fila(mk('span', `arco de ${fmt(md.largo)} m · cuerda ${fmt(g.c)} m${g.mayor ? ' · arco mayor' : ''}`)),
          fila(campo('radio', Math.round(g.r * 1000) / 1000, x => aplicarAnillo(k, vs => arcoConRadioMismoLado(vs, i, x), `Arco de radio ${fmt(x)} m (los extremos quedan).`), 64)),
          fila(campo('centro x', Math.round(g.cx * 1000) / 1000, x => aCentro(x, g.cy), 60), campo('y', Math.round(g.cy * 1000) / 1000, y => aCentro(g.cx, y), 60)),
          fila(boton('Invertir', 'La panza del arco del otro lado de la cuerda (mismo radio)', () => aplicarAnillo(k, vs => invertirArco(vs, i), 'Arco invertido.')),
            boton(g.mayor ? 'Arco menor' : 'Arco mayor', 'El mismo radio, con el centro del otro lado de la cuerda: la parte chica o la grande del círculo', () => aplicarAnillo(k, vs => arcoComplementario(vs, i), g.mayor ? 'Arco menor.' : 'Arco mayor.'))),
          mk('p', 'Arrastrá el centro (✛) o el medio del arco (○): los extremos no se mueven. El centro corre por la mediatriz de la cuerda (la línea de puntos); si escribís otro punto, se lleva a la mediatriz.', 'col-nota'));
      }
      if (!a0.b && !a0.c1) panel.append(fila(campo('en', her.partes, x => { her.partes = Math.max(2, Math.round(x)); }, 32, 'partes'), boton('Dividir', 'Parte el lado en partes iguales (agrega vértices)', () => aplicarAnillo(k, vs => dividirLado(vs, i, her.partes), `Lado dividido en ${her.partes}.`), false, 'dividir')),
        fila(campo('r', her.r, x => { her.r = x; }), boton('Arco por radio', 'Convierte el lado en un arco del radio escrito (hacia afuera; el radio es al menos la mitad del lado)', () => aplicarAnillo(k, vs => arcoConRadio(vs, i, her.r), `Arco de radio ${fmt(her.r)} m.`), false, 'arcoRadio')));
    }
    const kSel = sel?.anillo ?? tramo?.anillo ?? 0, nomK = kSel ? `el hueco ${kSel}` : 'el contorno';
    const det = mk('details', '', 'contorno-cad'); det.open = abiertoCad; det.addEventListener('toggle', () => { abiertoCad = det.open; });
    det.append(mk('summary', `Herramientas de CAD (sobre ${nomK})`));
    // ordenadas de lo más común (las esquinas) a lo menos: en cada grupo, primero las medidas y después las acciones
    det.append(grupo('Todas las esquinas salientes',
      fila(campo('r', her.r, x => { her.r = x; }), campo('d', her.d, x => { her.d = x; })),
      fila(boton('Redondear', 'Empalme de radio r en cada esquina saliente', () => aplicarAnillo(kSel, vs => tratarEsquinas(vs, 'redondeada', her.r), `Esquinas redondeadas con r = ${fmt(her.r)} m.`), false, 'redondear'),
        boton('Chaflán', 'Corta cada esquina saliente a la distancia d', () => aplicarAnillo(kSel, vs => tratarEsquinas(vs, 'chaflan', her.d), `Esquinas en chaflán de ${fmt(her.d)} m.`), false, 'chaflan'),
        boton('Sustraer', 'Saca d × d de cada esquina saliente', () => aplicarAnillo(kSel, vs => tratarEsquinas(vs, 'sustraida', her.d), `Esquinas sustraídas ${fmt(her.d)} × ${fmt(her.d)} m.`), false, 'sustraer'))));
    det.append(grupo('Curvas',
      fila(boton('Suavizar', 'Curva continua que pasa por todos los vértices: cada lado recto pasa a ser una Bézier tangente a las vecinas (después se ajusta con los puntos de control)', () => aplicarAnillo(kSel, vs => suavizarAnillo(vs), `${nomK} suavizado: cada lado es una Bézier que pasa por los vértices.`), false, 'suavizar'),
        boton('Enderezar', 'Saca todos los arcos y las Bézier: quedan los lados rectos entre los mismos vértices', () => aplicarAnillo(kSel, vs => enderezarAnillo(vs), `${nomK} con todos los lados rectos.`, false), false, 'enderezar'))));
    det.append(grupo('Contorno paralelo',
      fila(campo('d', her.desf, x => { her.desf = Math.abs(x); }),
        boton('Afuera', 'Contorno paralelo hacia afuera, a la distancia d (arcos exactos, esquinas en inglete)', () => aplicarAnillo(kSel, vs => desfasarAnillo(vs, kSel ? -her.desf : her.desf), `${nomK} agrandado ${fmt(her.desf)} m.`, false), false, 'afuera'),
        boton('Adentro', 'Contorno paralelo hacia adentro, a la distancia d', () => aplicarAnillo(kSel, vs => desfasarAnillo(vs, kSel ? her.desf : -her.desf), `${nomK} achicado ${fmt(her.desf)} m.`, false), false, 'adentro'))));
    det.append(grupo('Mover la forma (desde su baricentro)',
      fila(boton('', 'Simetría con un eje vertical por su baricentro', () => aplicarAnillo(kSel, vs => espejarAnillo(vs, 'x', centroAnillo(kSel)), 'Espejado.', false), false, 'espejoX'),
        boton('', 'Simetría con un eje horizontal por su baricentro', () => aplicarAnillo(kSel, vs => espejarAnillo(vs, 'y', centroAnillo(kSel)), 'Espejado.', false), false, 'espejoY'),
        campo('', her.giro, x => { her.giro = x; }, 40, '°'),
        boton('Girar', 'Gira el contorno alrededor de su baricentro (positivo: antihorario)', () => aplicarAnillo(kSel, vs => girarAnillo(vs, her.giro, centroAnillo(kSel)), `Girado ${fmt(her.giro)}°.`), false, 'girar')),
      fila(campo('×', her.escala, x => { her.escala = x; }, 40, ''),
        boton('Escalar', 'Agranda o achica el contorno desde su baricentro', () => aplicarAnillo(kSel, vs => (her.escala > 0 ? escalarAnillo(vs, her.escala, centroAnillo(kSel)) : { error: 'El factor tiene que ser mayor que cero.' }), `Escalado × ${fmt(her.escala)}.`, false), false, 'escalar'))));
    const selForma = mk('select'); ([['rect', 'Rectángulo'], ['circulo', 'Círculo'], ['poligono', 'Polígono regular'], ['elipse', 'Elipse']] as const).forEach(([v, t]) => { const o = mk('option', t); o.value = v; o.selected = her.forma === v; selForma.append(o); });
    selForma.addEventListener('change', () => { her.forma = selForma.value as typeof her.forma; armar(); });
    det.append(grupo('Reemplazar por una forma',
      fila(selForma, ...(her.forma === 'poligono' ? [campo('lados', her.lados, x => { her.lados = Math.max(3, Math.round(x)); }, 32, '')] : [])),
      fila(
      boton(`Cambiar ${nomK}`, 'Reemplaza el contorno por la forma elegida, con el mismo centro y la misma caja', () => aplicarAnillo(kSel, () => formaEn(kSel, her.forma), `${nomK}: ${selForma.selectedOptions[0].textContent?.toLowerCase()}.`), false, 'forma'),
      ...(destino ? [] : [boton('Hueco con esa forma', 'Agrega un hueco con la forma elegida en el medio', () => {
        if (!P) return; guardar(); const k = propiedades(P), ax = (k.x1 - k.x0) * 0.4, ay = (k.y1 - k.y0) * 0.4;
        const base = rectangulo(k.xg, k.yg, ax, ay), h = her.forma === 'rect' ? base : her.forma === 'circulo' ? circulo(k.xg, k.yg, Math.min(ax, ay) / 2) : her.forma === 'elipse' ? elipse(k.xg, k.yg, ax / 2, ay / 2) : poligonoRegular(k.xg, k.yg, Math.min(ax, ay) / 2, her.lados);
        P.huecos = [...(P.huecos ?? []), h]; if (her.forma !== 'rect') ortogonal = false; armar(); api.dibujar();
      }, false, 'hueco')]))));
    det.append(mk('p', 'Shift al arrastrar un vértice: el lado va de a 15°. Ctrl+Z / Ctrl+Y deshacen y rehacen dentro del contorno.', 'col-nota'));
    panel.append(det);
    panel.append(fila(
      boton('Deshacer', 'Ctrl+Z', () => deshacer(), false, 'deshacer'), boton('Rehacer', 'Ctrl+Y', () => deshacer(true), false, 'rehacer')));
    if (destino) panel.append(fila(...(sel && !ortogonal ? [boton('Borrar vértice', 'También: Supr', borrarVertice)] : [])));
    else panel.append(fila(
      boton('Agregar hueco', 'Un hueco rectangular en el medio (se edita igual que el contorno)', () => {
        if (!P) return; guardar(); const k = propiedades(P), ax = (k.x1 - k.x0) * 0.4, ay = (k.y1 - k.y0) * 0.4;
        P.huecos = [...(P.huecos ?? []), [{ x: k.xg - ax / 2, y: k.yg - ay / 2 }, { x: k.xg - ax / 2, y: k.yg + ay / 2 }, { x: k.xg + ax / 2, y: k.yg + ay / 2 }, { x: k.xg + ax / 2, y: k.yg - ay / 2 }].map(q => ({ x: r4(q.x), y: r4(q.y) }))];
        armar(); api.dibujar();
      }),
      ...(sel && sel.anillo > 0 ? [boton('Borrar hueco', '', () => { if (!P || !sel) return; guardar(); P.huecos!.splice(sel.anillo - 1, 1); if (!P.huecos!.length) delete P.huecos; sel = null; armar(); api.dibujar(); })] : []),
      ...(sel && !ortogonal ? [boton('Borrar vértice', 'También: Supr', borrarVertice)] : [])));
    panel.append(fila(boton('Listo', 'Enter', () => void listo(), true), boton('Cancelar', 'Esc', () => { cerrar(); api.mensaje('Edición del contorno cancelada.'); })));
  }

  // ---------------------------------------------------------------- dibujo
  function capa(v: Vista) {
    vista = v;
    if (!id || !P) return;
    const { X, Y } = v;
    const g = el('g', { class: 'capa-contorno' });
    const d = anillos(P).map(vs => { const ps = polilinea(vs, 3, 24); return `M${ps.map(q => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' L')} Z`; }).join(' ');
    g.append(el('path', { d, class: 'contorno-edit', 'fill-rule': 'evenodd' }));
    anillos(P).forEach((vs, k) => {
      vs.forEach((a, i) => {
        const b = vs[(i + 1) % vs.length];
        // medio del lado (o del arco) para correrlo, curvarlo o agregar un vértice
        let mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (a.b || a.c1) { const ps = polilinea([a, b], 3, 24); const pm = ps.length > 2 ? ps[Math.floor(ps.length / 2)] : null; if (pm && !a.c1) { mx = pm.x; my = pm.y; } }
        const esT = tramo && tramo.anillo === k && tramo.i === i;
        if (a.c1 && a.c2) {
          g.append(el('line', { x1: X(a.x), y1: Y(a.y), x2: X(a.c1.x), y2: Y(a.c1.y), class: 'ctrl-lin' }), el('line', { x1: X(b.x), y1: Y(b.y), x2: X(a.c2.x), y2: Y(a.c2.y), class: 'ctrl-lin' }));
          for (const c of ['c1', 'c2'] as const) g.append(el('circle', { cx: X(a[c]!.x), cy: Y(a[c]!.y), r: 5, class: 'h-ctrl', 'data-h': `${c}:${k}:${i}` }));
        }
        // en lados cortos (en pantalla) la manija sale hacia afuera, para no taparse con las de las esquinas
        let hx = X(mx), hy = Y(my);
        const Ls = Math.hypot(X(b.x) - X(a.x), Y(b.y) - Y(a.y));
        if (Ls < 30) { const kc = propiedades({ v: vs }), ux = hx - X(kc.xg), uy = hy - Y(kc.yg), L = Math.hypot(ux, uy) || 1, off = (k === 0 ? 16 : -16); g.append(el('line', { x1: hx, y1: hy, x2: hx + (ux / L) * off, y2: hy + (uy / L) * off, class: 'ctrl-lin' })); hx += (ux / L) * off; hy += (uy / L) * off; }
        g.append(el('circle', { cx: hx, cy: hy, r: 5, class: 'h-lado' + (esT ? ' sel' : ''), 'data-h': `${a.b ? 'arco' : 'lado'}:${k}:${i}` }));
      });
      // arco elegido: centro (se arrastra sobre la mediatriz), radios a los extremos y la mediatriz de la cuerda
      if (tramo && tramo.anillo === k && vs[tramo.i]?.b) {
        const ga = geometriaArco(vs, tramo.i);
        if (ga) {
          const a = vs[tramo.i], b = vs[(tramo.i + 1) % vs.length], L = Math.max(ga.r, ga.c) * 1.2;
          g.append(el('line', { x1: X(ga.mx - ga.nx * L), y1: Y(ga.my - ga.ny * L), x2: X(ga.mx + ga.nx * L), y2: Y(ga.my + ga.ny * L), class: 'mediatriz' }),
            el('line', { x1: X(ga.cx), y1: Y(ga.cy), x2: X(a.x), y2: Y(a.y), class: 'radio-arco' }), el('line', { x1: X(ga.cx), y1: Y(ga.cy), x2: X(b.x), y2: Y(b.y), class: 'radio-arco' }),
            el('line', { x1: X(a.x), y1: Y(a.y), x2: X(b.x), y2: Y(b.y), class: 'mediatriz' }));
          const cx = X(ga.cx), cy = Y(ga.cy);
          const hc = el('g', { class: 'h-centro', 'data-h': `centro:${k}:${tramo.i}` });
          hc.append(el('circle', { cx, cy, r: 9, class: 'h-centro-fondo' }), el('line', { x1: cx - 7, y1: cy, x2: cx + 7, y2: cy }), el('line', { x1: cx, y1: cy - 7, x2: cx, y2: cy + 7 }));
          const t = el('text', { x: cx + 10, y: cy - 8, class: 'rot-centro' }); t.textContent = `r = ${fmt(ga.r)} m`; hc.append(t);
          g.append(hc);
        }
      }
      vs.forEach((a, i) => { const s = sel && sel.anillo === k && sel.i === i; g.append(el('rect', { x: X(a.x) - 5, y: Y(a.y) - 5, width: 10, height: 10, class: 'h-vert' + (s ? ' sel' : ''), 'data-h': `vertice:${k}:${i}` })); });
    });
    svg.append(g);
  }
  return { abrir, abrirContorno, capa, activo: () => !!id, cerrar };
}
