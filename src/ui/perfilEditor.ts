/**
 * Diseño → Perfil: el editor del perfil de la torre (docs/propuesta_exoesqueleto.pdf, págs. 12 y 13). Dos alzados,
 * uno por viento, con las líneas de los niveles; los bordes se mueven con manijas (redondas en la polilínea y la
 * spline, cuadradas en Bézier con sus manijas de tangente). Fichas de forma, modo de la curva, tensión y sesgo de la
 * spline. «Aplicar a los niveles» corta las curvas en la cota de cada nivel y escribe B, L y el corrimiento (dx, dy):
 * lo que ya usa la planilla y lo que usa el protocolo de perfil variable.
 */
import { estado, fmt } from './estado';
import { h, seccion, type H } from './comp';
import type { Tam } from './diagramas';
import { aplicarPerfil, perfilDesdeVistas, formaPerfil, FORMAS_PERFIL, medidasNiveles, muestrear, perfilDesdeNiveles, xEnZ, type FormaPerfil, type ModoCurva, type PerfilTorre, type PuntoPerfil, type VistaPerfil } from '../engine/perfilTorre';

const NS = 'http://www.w3.org/2000/svg';
const sv = (t: string, a: Record<string, string | number> = {}, hijo?: string | SVGElement) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v)); if (typeof hijo === 'string') e.textContent = hijo; else if (hijo) e.append(hijo); return e; };
const css = (v: string, d: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || d;
const mensaje = (t: string) => { const e = document.getElementById('mensaje'); if (e) e.textContent = t; };

/** el borrador que se edita (se guarda en el proyecto al aplicar) y con qué revisión del proyecto se armó */
let borrador: PerfilTorre | null = null, revBorrador = -1;
/** el perfil de la torre con el que se armó el borrador: si otra herramienta lo cambia (la carta de la planta), se vuelve a leer */
let firmaPerfil = '';
const firmaDe = () => JSON.stringify(estado.proyecto.perfilTorre ?? null);
type Lado = 'izq' | 'der';
type Sel = { vista: 'A' | 'B'; lado: Lado; i: number } | null;
let sel: Sel = null;
/** al mover un punto: en espejo (cambia el ancho), los dos bordes juntos (inclina) o solo ese */
let mover: 'espejo' | 'juntos' | 'solo' = 'espejo';
let verPolilinea = false, ajustarPlantas = true;

function perfilActual(): PerfilTorre {
  if (!borrador || revBorrador < 0 || firmaPerfil !== firmaDe()) {
    borrador = structuredClone(estado.proyecto.perfil ?? perfilDesdeNiveles(estado.proyecto)); revBorrador = estado.revision; firmaPerfil = firmaDe();
    ajustarPlantas = estado.proyecto.perfilTorre?.aplica !== 'medidas';
  }
  return borrador;
}
/** volver a leer el perfil del proyecto (otro proyecto, deshacer…) */
export function olvidarBorradorPerfil() { borrador = null; revBorrador = -1; sel = null; }
const H = () => Math.max(1, ...medidasNiveles(estado.proyecto).map(m => m.z));
const base = () => { const m = medidasNiveles(estado.proyecto).find(q => Math.abs(q.z) < 1e-9) ?? medidasNiveles(estado.proyecto).at(-1)!; return { B: m.B, L: m.L }; };
const ordenar = (v: VistaPerfil) => { v.izq.sort((a, b) => a.z - b.z); v.der.sort((a, b) => a.z - b.z); };
const parejos = (v: VistaPerfil) => v.izq.length === v.der.length && v.izq.every((q, k) => Math.abs(q.z - v.der[k].z) < 1e-6);

// ---------------------------------------------------------------------------------------------------- panel
/** el dibujito de una ficha de forma */
function iconoForma(f: FormaPerfil): SVGElement {
  const pf = formaPerfil(f, 20, 16, 60), d = (v: PuntoPerfil[]) => muestrear(v, pf.modo, 0, 0, 8);
  const izq = d(pf.B.izq), der = d(pf.B.der).reverse(), X = (x: number) => 24 + x * 0.7, Y = (z: number) => 56 - z * 0.85;
  const path = [...izq, ...der].map((q, k) => `${k ? 'L' : 'M'}${X(q.x).toFixed(1)} ${Y(q.z).toFixed(1)}`).join(' ') + ' Z';
  return sv('svg', { viewBox: '0 0 48 60', width: 40, height: 50, 'aria-hidden': 'true' }, sv('path', { d: path, fill: 'color-mix(in srgb, var(--r-diseno) 22%, transparent)', stroke: 'var(--r-diseno)', 'stroke-width': 1.4 }));
}
export function panelPerfil(c: H) {
  const pf = perfilActual();
  c.append(h('p', { class: 'nota' }, 'La forma de la torre vista de frente por cada viento. Movés los bordes con las manijas (arriba, en los dos alzados) o partís de una ficha; «Aplicar a los niveles» escribe B, L y cuánto se corre cada nivel. La planilla ya calcula los retranqueos; lo que una torre inclinada o con fachadas inclinadas agrega está en Estabilidad → «Perfil variable».'));
  // fichas de forma
  const fichas = h('div', { class: 'fichas-forma' });
  (Object.entries(FORMAS_PERFIL) as [FormaPerfil, string][]).forEach(([f, nombre]) => {
    const b = h('button', { type: 'button', class: 'ficha-forma', 'aria-pressed': String(pf.forma === f), title: `Partir de: ${nombre.toLowerCase()} (con las medidas de la base)` }, iconoForma(f) as Node, h('span', {}, nombre));
    b.addEventListener('click', () => { const bb = base(); borrador = formaPerfil(f, bb.B, bb.L, H()); sel = null; estado.avisarPanel(); });
    fichas.append(b);
  });
  const s1 = seccion('Formas'); s1.cuerpo.append(fichas, h('p', { class: 'nota chica' }, 'Inclinada: la torre se va corriendo hacia donde sopla el viento A, un cuarto de su largo en la azotea.'));
  c.append(s1.el);
  // la curva
  const s2 = seccion('Curva');
  const modo = h('select', {}) as HTMLSelectElement;
  ([['polilinea', 'polilínea (tramos rectos)'], ['bezier', 'Bézier (con manijas de tangente)'], ['spline', 'spline (pasa por los puntos)']] as [ModoCurva, string][]).forEach(([k, t]) => modo.append(new Option(t, k, false, k === pf.modo)));
  modo.addEventListener('change', () => { pf.modo = modo.value as ModoCurva; pf.forma = null; estado.avisarPanel(); });
  s2.cuerpo.append(h('label', { class: 'campo' }, h('span', {}, 'Modo'), modo));
  if (pf.modo === 'spline') {
    const rango = (rot: string, v: number, al: (x: number) => void, ayuda: string) => {
      const i = h('input', { type: 'range', min: '-1', max: '1', step: '0.05', value: String(v) }) as HTMLInputElement;
      const t = h('span', { class: 'nota chica' }, fmt(v, 2));
      i.addEventListener('input', () => { al(+i.value); t.textContent = fmt(+i.value, 2); redibujar(); });
      return h('label', { class: 'campo', title: ayuda }, h('span', {}, rot), h('div', { class: 'fila-rango' }, i, t));
    };
    s2.cuerpo.append(rango('Tensión', pf.tension, x => { pf.tension = x; }, 'Más tensión: la curva se acerca a la polilínea; menos: más redonda'),
      rango('Sesgo (excentricidad)', pf.sesgo, x => { pf.sesgo = x; }, 'Corre la curva hacia un lado sin dejar de pasar por los puntos'));
  }
  const ver = h('label', { class: 'campo-linea' }, h('input', { type: 'checkbox', ...(verPolilinea ? { checked: '' } : {}) }), ' Ver también como polilínea (para comparar)');
  ver.querySelector('input')!.addEventListener('change', e => { verPolilinea = (e.target as HTMLInputElement).checked; redibujar(); });
  s2.cuerpo.append(ver);
  c.append(s2.el);
  // cómo se mueven los puntos
  const s3 = seccion('Puntos');
  const seg = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Al mover un punto' });
  ([['espejo', 'en espejo (ancho)'], ['juntos', 'los dos juntos (inclinar)'], ['solo', 'solo ese borde']] as const).forEach(([k, t]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(mover === k) }, t);
    b.addEventListener('click', () => { mover = k; estado.avisarPanel(); });
    seg.append(b);
  });
  const borrar = h('button', { type: 'button', class: 'boton' }, 'Borrar el punto elegido');
  borrar.addEventListener('click', () => borrarPunto());
  if (!sel) borrar.setAttribute('disabled', '');
  s3.cuerpo.append(h('span', { class: 'nota chica' }, 'Al mover un punto'), seg,
    h('p', { class: 'nota chica' }, 'Tocá un borde para agregar un punto a esa altura (en los dos bordes). Tocá una manija para elegirla; Supr la borra. Los puntos de abajo y de arriba no se borran: solo se mueven a los costados.'),
    h('div', { class: 'fila-acciones' }, borrar));
  c.append(s3.el);
  // aplicar
  const s4 = seccion('Aplicar');
  const aj = h('label', { class: 'campo-linea' }, h('input', { type: 'checkbox', ...(ajustarPlantas ? { checked: '' } : {}) }), ' Las plantas dibujadas (silueta y carpintería) siguen al perfil');
  aj.querySelector('input')!.addEventListener('change', e => { ajustarPlantas = (e.target as HTMLInputElement).checked; });
  const ap = h('button', { type: 'button', class: 'boton primario' }, 'Aplicar a los niveles');
  ap.addEventListener('click', () => {
    // el editor escribe el perfil de la torre (el mismo de la carta de la planta): la app lo aplica en cada cambio
    const r = aplicarPerfil(estado.proyecto, pf, false);
    estado.cambiar(p => { p.perfil = structuredClone(pf); p.perfilTorre = perfilDesdeVistas(p, pf, ajustarPlantas, p.perfilTorre); });
    revBorrador = estado.revision; firmaPerfil = firmaDe();
    mensaje(`Perfil aplicado a ${r.niveles.length} niveles.${r.avisos.length ? ` ${r.avisos.join(' ')}` : ''} Ctrl+Z deshace.`);
    estado.avisarPanel();
  });
  const leer = h('button', { type: 'button', class: 'boton' }, 'Volver a leer los niveles');
  leer.title = 'Descarta lo que se movió y arma el perfil con las medidas de los niveles como están';
  leer.addEventListener('click', () => { borrador = perfilDesdeNiveles(estado.proyecto); sel = null; estado.avisarPanel(); });
  const previa = aplicarPerfil(estado.proyecto, pf, false);
  s4.cuerpo.append(aj, h('div', { class: 'fila-acciones' }, ap, leer),
    ...(previa.avisos.length ? previa.avisos.map(t => h('p', { class: 'aviso-linea' }, t)) : [h('p', { class: 'nota chica' }, 'Ningún muro queda afuera de su planta.')]),
    h('p', { class: 'nota chica' }, 'Cada nivel toma la medida del perfil justo arriba de su cota. Los muros no se mueven: el nivel entero (losa y muros) se corre como un todo.'));
  c.append(s4.el);
}

// ---------------------------------------------------------------------------------------------------- centro
let lienzo: SVGSVGElement | null = null, ultimoTam: Tam = { ancho: 900 };
export function centroPerfil(c: H, tam: Tam) {
  ultimoTam = tam;
  lienzo = sv('svg', { class: 'perfil-torre', role: 'img', 'aria-label': 'Perfil de la torre en los dos alzados' }) as SVGSVGElement;
  c.append(h('p', { class: 'nota' }, 'Izquierda: lo que ve el viento A (el ancho B). Derecha: lo que ve el viento B (el largo L). Las rayas horizontales son los niveles; la línea punteada, el eje de la base.'), lienzo as unknown as H);
  redibujar();
  document.removeEventListener('keydown', teclaPerfil); document.addEventListener('keydown', teclaPerfil);
}
function teclaPerfil(e: KeyboardEvent) {
  if (!lienzo?.isConnected) { document.removeEventListener('keydown', teclaPerfil); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); borrarPunto(); }
}
function borrarPunto() {
  const pf = perfilActual();
  if (!sel) return;
  const v = pf[sel.vista], n = v[sel.lado].length;
  if (sel.i === 0 || sel.i === n - 1) { mensaje('Los puntos de abajo y de arriba no se borran: movelos a los costados.'); return; }
  if (parejos(v)) { v.izq.splice(sel.i, 1); v.der.splice(sel.i, 1); } else v[sel.lado].splice(sel.i, 1);
  sel = null; pf.forma = null; estado.avisarPanel();
}

function redibujar() {
  const svg = lienzo; if (!svg?.isConnected && svg !== null && !svg.parentNode) return;
  if (!svg) return;
  const pf = perfilActual(), ms = medidasNiveles(estado.proyecto).filter(m => m.z >= -1e-9), Ht = H();
  const W = Math.max(520, Math.min(1200, (ultimoTam.ancho ?? 900) - 20)), Hp = Math.min(760, Math.max(420, W * 0.62));
  svg.setAttribute('viewBox', `0 0 ${W} ${Hp}`); svg.setAttribute('width', String(W)); svg.setAttribute('height', String(Hp));
  svg.replaceChildren();
  const tinta = css('--ink', '#223344'), dim = css('--dim', '#8a94a0'), acento = css('--r-diseno', '#1a6bbd'), relleno = 'color-mix(in srgb, var(--r-diseno) 14%, transparent)';
  // escala común a los dos alzados (para comparar anchos); cada uno con su centro
  const xsTodos = (['A', 'B'] as const).flatMap(k => [...pf[k].izq, ...pf[k].der].map(q => q.x));
  const span = Math.max(10, Math.max(...xsTodos) - Math.min(...xsTodos));
  const mT = 58, mB = 40, esc = Math.min((Hp - mT - mB) / Ht, (W / 2 - 90) / (span * 1.25));
  const Y = (z: number) => Hp - mB - z * esc;
  (['A', 'B'] as const).forEach((vk, kv) => {
    const v = pf[vk], cx0 = (W / 2) * kv + W / 4 + 20;
    const mid0 = (xEnZ(muestrear(v.izq, pf.modo, pf.tension, pf.sesgo), 0) + xEnZ(muestrear(v.der, pf.modo, pf.tension, pf.sesgo), 0)) / 2;
    const X = (x: number) => cx0 + (x - mid0) * esc;
    const g = sv('g', { class: `perfil-vista vista-${vk}` });
    // título y el viento
    g.append(sv('text', { x: cx0, y: 18, 'text-anchor': 'middle', class: 'pf-tit' }, vk === 'A' ? 'Alzado del viento A · ancho B' : 'Alzado del viento B · largo L'));
    // niveles
    ms.forEach(m => {
      const y = Y(m.z);
      g.append(sv('line', { x1: X(mid0) - (span * esc) * 0.62, x2: X(mid0) + (span * esc) * 0.62, y1: y, y2: y, stroke: dim, 'stroke-width': 0.6, 'stroke-dasharray': '2 3' }));
    });
    const extremos = [ms[ms.length - 1], ms[0]].filter(Boolean);
    extremos.forEach(m => g.append(sv('text', { x: X(mid0) - (span * esc) * 0.64, y: Y(m.z) + 3, 'text-anchor': 'end', class: 'pf-niv' }, m.n.nombre)));
    // eje de la base y suelo
    g.append(sv('line', { x1: X(mid0), x2: X(mid0), y1: Y(0), y2: Y(Ht) - 6, stroke: dim, 'stroke-dasharray': '6 4', 'stroke-width': 0.8 }));
    g.append(sv('line', { x1: X(mid0) - (span * esc) * 0.7, x2: X(mid0) + (span * esc) * 0.7, y1: Y(0), y2: Y(0), stroke: tinta, 'stroke-width': 1.6 }));
    // la torre: el contorno con la curva
    const di = muestrear(v.izq, pf.modo, pf.tension, pf.sesgo), dd = muestrear(v.der, pf.modo, pf.tension, pf.sesgo);
    const d = [...di, ...dd.slice().reverse()].map((q, k) => `${k ? 'L' : 'M'}${X(q.x).toFixed(1)} ${Y(q.z).toFixed(1)}`).join(' ') + ' Z';
    g.append(sv('path', { d, fill: relleno, stroke: acento, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    if (verPolilinea && pf.modo !== 'polilinea') for (const b of [v.izq, v.der]) g.append(sv('polyline', { points: b.map(q => `${X(q.x).toFixed(1)},${Y(q.z).toFixed(1)}`).join(' '), fill: 'none', stroke: dim, 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
    // lo que se escribe en cada nivel: una marca del ancho cortado a esa cota
    ms.forEach(m => {
      const z = m.z + 1e-6, xi = xEnZ(di, z), xd = xEnZ(dd, z);
      g.append(sv('line', { x1: X(xi), x2: X(xd), y1: Y(m.z), y2: Y(m.z), stroke: acento, 'stroke-width': 0.9, opacity: 0.55 }));
    });
    // medidas de la base y de la azotea
    for (const z of [0, Ht]) {
      const xi = xEnZ(di, z + (z ? -1e-6 : 1e-6)), xd = xEnZ(dd, z + (z ? -1e-6 : 1e-6));
      g.append(sv('text', { x: (X(xi) + X(xd)) / 2, y: z ? Y(z) - 8 : Y(z) + 16, 'text-anchor': 'middle', class: 'pf-med' }, `${vk === 'A' ? 'B' : 'L'} = ${fmt(xd - xi, 2)} m${z && Math.abs((xi + xd) / 2 - mid0) > 0.01 ? ` · corrida ${fmt((xi + xd) / 2 - mid0, 2)} m` : ''}`));
    }
    // tocar el borde: agrega un punto a esa altura
    for (const lado of ['izq', 'der'] as Lado[]) {
      const dens = lado === 'izq' ? di : dd;
      const hit = sv('polyline', { points: dens.map(q => `${X(q.x).toFixed(1)},${Y(q.z).toFixed(1)}`).join(' '), fill: 'none', stroke: 'transparent', 'stroke-width': 12, class: 'pf-borde' });
      hit.addEventListener('pointerdown', e => {
        if ((e.target as Element).closest('.pf-manija')) return;
        const z = Math.max(0.01, Math.min(Ht - 0.01, (Hp - mB - aLocal(svg, e).y) / esc));
        agregarPunto(v, z, pf); e.stopPropagation();
      });
      g.append(hit);
    }
    // manijas
    for (const lado of ['izq', 'der'] as Lado[]) v[lado].forEach((q, i) => {
      const elegido = sel && sel.vista === vk && sel.lado === lado && sel.i === i;
      const cuad = pf.modo === 'bezier';
      const m = cuad ? sv('rect', { x: X(q.x) - 5, y: Y(q.z) - 5, width: 10, height: 10, class: `pf-manija${elegido ? ' sel' : ''}` }) : sv('circle', { cx: X(q.x), cy: Y(q.z), r: 6, class: `pf-manija${elegido ? ' sel' : ''}` });
      m.append(sv('title', {}, `${fmt(q.z, 1)} m · ${fmt(q.x, 2)} m (arrastrá; Supr borra)`));
      arrastrable(m, svg, (pt) => moverPunto(pf, vk, lado, i, (pt.x - cx0) / esc + mid0, (Hp - mB - pt.y) / esc, Ht), () => { sel = { vista: vk, lado, i }; });
      g.append(m);
      // Bézier: la manija de tangente del punto elegido
      if (cuad && elegido) {
        const t = q.t ?? { dz: ((v[lado][Math.min(i + 1, v[lado].length - 1)].z - v[lado][Math.max(i - 1, 0)].z) / 6), dx: ((v[lado][Math.min(i + 1, v[lado].length - 1)].x - v[lado][Math.max(i - 1, 0)].x) / 6) };
        const tx = X(q.x + t.dx), ty = Y(q.z + t.dz), ux = X(q.x - t.dx), uy = Y(q.z - t.dz);
        g.append(sv('line', { x1: ux, y1: uy, x2: tx, y2: ty, stroke: acento, 'stroke-width': 1 }));
        const mt = sv('circle', { cx: tx, cy: ty, r: 4.5, class: 'pf-tangente' });
        arrastrable(mt, svg, pt => { q.t = { dz: (Hp - mB - pt.y) / esc - q.z, dx: (pt.x - cx0) / esc + mid0 - q.x }; pf.forma = null; redibujar(); }, () => undefined);
        g.append(mt);
      }
    });
    svg.append(g);
  });
}
const aLocal = (svg: SVGSVGElement, e: PointerEvent | MouseEvent) => { const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal; return { x: ((e.clientX - r.left) / r.width) * vb.width, y: ((e.clientY - r.top) / r.height) * vb.height }; };
function arrastrable(el: SVGElement, svg: SVGSVGElement, mover: (p: { x: number; y: number }) => void, elegir: () => void) {
  el.addEventListener('pointerdown', e => {
    // el dibujo se rehace en cada movimiento (la manija se reemplaza): se escucha en la ventana, no en la manija
    e.stopPropagation(); e.preventDefault(); elegir();
    const mov = (ev: PointerEvent) => { ev.preventDefault(); mover(aLocal(svg, ev)); };
    const fin = () => { window.removeEventListener('pointermove', mov); window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', fin); estado.avisarPanel(); };
    window.addEventListener('pointermove', mov); window.addEventListener('pointerup', fin); window.addEventListener('pointercancel', fin);
    redibujar();
  });
}
function moverPunto(pf: PerfilTorre, vk: 'A' | 'B', lado: Lado, i: number, x: number, z: number, Ht: number) {
  const v = pf[vk], b = v[lado], q = b[i], otro = v[lado === 'izq' ? 'der' : 'izq'];
  const n = b.length, fijoZ = i === 0 || i === n - 1;
  const zNueva = fijoZ ? q.z : Math.max(b[i - 1].z, Math.min(b[i + 1].z, z));
  const r2 = (t: number) => Math.round(t * 100) / 100, ANCHO_MIN = 1;
  const o = otro.length === n ? otro[i] : undefined;
  q.z = r2(Math.max(0, Math.min(Ht, zNueva)));
  if (o && mover !== 'solo') {
    o.z = q.z;
    if (mover === 'juntos') { const dx = x - q.x; q.x = r2(x); o.x = r2(o.x + dx); }
    else {
      // en espejo respecto del medio de este par (en una torre inclinada, el medio está corrido)
      const mid = (q.x + o.x) / 2, s = lado === 'izq' ? -1 : 1;
      const xx = s * (x - mid) < ANCHO_MIN / 2 ? mid + (s * ANCHO_MIN) / 2 : x;
      q.x = r2(xx); o.x = r2(2 * mid - xx);
    }
  } else {
    // solo ese borde: no puede pasar al otro (queda al menos 1 m de ancho a esa altura)
    const xo = xEnZ(muestrear(otro, 'polilinea'), q.z);
    q.x = r2(lado === 'izq' ? Math.min(x, xo - ANCHO_MIN) : Math.max(x, xo + ANCHO_MIN));
  }
  pf.forma = null;
  redibujar();
}
function agregarPunto(v: VistaPerfil, z: number, pf: PerfilTorre) {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  for (const lado of ['izq', 'der'] as Lado[]) {
    const x = xEnZ(muestrear(v[lado], pf.modo, pf.tension, pf.sesgo), z);
    v[lado].push({ z: r2(z), x: r2(x) });
  }
  ordenar(v); pf.forma = null;
  sel = null;
  mensaje(`Punto agregado a ${fmt(z, 1)} m en los dos bordes: arrastralo.`);
  estado.avisarPanel();
}
