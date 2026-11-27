/**
 * Ficha M, «Malla sobre la fachada», en la etapa 08: sus datos (patrón, nudos por anillo, esquinas, giro y tope) y la
 * vista «Malla en 3D»: la malla real girable, con cada barra pintada por su esfuerzo con el viento elegido (tracción
 * en rojo, compresión en azul, como en toda la app), y la planta de un anillo con sus nudos sobre la fachada.
 */
import { estado, fmt } from './estado';
import { h, seccion, type H } from './comp';
import { campo } from './paneles';
import { datosExo, exoActual } from './exo';
import { MALLA_POR_DEFECTO, NUDOS_MAX, PATRONES_MALLA, pisosFlojos, tramosParejos, type MallaDef, type PatronMalla } from '../engine/exoMalla';
import { calcularExo, conMalla, paraViento, seccionEn, type ExoDef } from '../engine/exo';
import type { MallaHoja } from '../xlsx/hojasG';
import type { FilaMalla } from '../engine/exoDeCalculo';
import { plantaDeNivel, puntosSilueta } from '../engine/silueta';

const NS = 'http://www.w3.org/2000/svg';
const sv = (tag: string, a: Record<string, string | number> = {}, txt?: string) => { const e = document.createElementNS(NS, tag); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v))); if (txt !== undefined) e.textContent = txt; return e; };

/** los datos de la malla en el formulario de la ficha */
export function camposMalla(fo: H, def: ExoDef, set: (f: (d: ExoDef) => void) => void) {
  const m: MallaDef = def.malla ?? MALLA_POR_DEFECTO;
  const conMalla = (f: (x: MallaDef) => void) => set(d => { d.malla = { ...(d.malla ?? MALLA_POR_DEFECTO) }; f(d.malla); });
  const nombres = Object.keys(PATRONES_MALLA) as PatronMalla[];
  // el patrón: dos botones (cada uno con su recuadro), a todo el ancho del formulario
  const seg = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Patrón de la malla' });
  nombres.forEach(k => { const b = h('button', { type: 'button', 'aria-pressed': String(m.patron === k), title: PATRONES_MALLA[k].texto }, PATRONES_MALLA[k].nombre); b.addEventListener('click', () => conMalla(x => { x.patron = k; })); seg.append(b); });
  fo.append(h('div', { class: 'campo-linea malla-linea malla-patron' }, h('span', {}, 'Patrón'), seg), h('p', { class: 'nota chica nota-ancha' }, PATRONES_MALLA[m.patron].texto));
  const num = (v: string) => parseFloat(v.replace(',', '.'));
  campo(fo, 'Nudos por anillo', 'exo-malla-n', m.nudos, v => { const x = num(v); if (isFinite(x) && x >= 3) conMalla(y => { y.nudos = Math.min(NUDOS_MAX, Math.round(x)); }); },
    { tipo: 'number', ayuda: `en toda la vuelta, de 3 a ${NUDOS_MAX} (Gherkin: 18)` });
  campo(fo, 'Nudos por anillo arriba', 'exo-malla-narriba', m.nudosArriba ?? '', v => { const x = num(v); conMalla(y => { if (isFinite(x) && x >= 3) y.nudosArriba = Math.min(NUDOS_MAX, Math.round(x)); else delete y.nudosArriba; }); },
    { tipo: 'number', ayuda: 'densidad variable: de los nudos de abajo a estos en el último anillo; vacío: los mismos en toda la altura' });
  campo(fo, 'Giro por módulo', 'exo-malla-giro', m.giro ?? 0, v => { const x = num(v); if (isFinite(x)) conMalla(y => { y.giro = x || undefined; }); },
    { tipo: 'number', unidad: '°', ayuda: 'torres que se retuercen; 0: sin giro' });
  campo(fo, 'Malla hasta la cota', 'exo-malla-hasta', m.hasta ?? '', v => { const x = num(v); conMalla(y => { y.hasta = isFinite(x) && x > 0 ? x : undefined; }); },
    { tipo: 'number', unidad: 'm', ayuda: 'vacío: hasta la azotea' });
  // secciones por altura: n tramos parejos, cortados en anillos (después «Dimensionar» ajusta cada uno)
  const nTramos = 1 + new Set((def.tramos ?? []).filter(t => t.clase !== 'mastil').map(t => t.desde)).size;
  campo(fo, 'Tramos de sección en altura', 'exo-malla-tramos', nTramos, v => {
    const x = Math.round(num(v)), en = datosExo('A')?.entrada;
    if (!(x >= 1 && x <= 8) || !en?.malla) return;
    set(d => {
      const sinTramos = { ...d, tramos: (d.tramos ?? []).filter(t => t.clase === 'mastil') };
      const nuevos = tramosParejos(en.malla!, en.zs, x, (d.malla ?? MALLA_POR_DEFECTO).patron, (c, z) => seccionEn(d, c, z));
      d.tramos = [...(sinTramos.tramos ?? []), ...nuevos];
      if (!d.tramos.length) delete d.tramos;
    });
  }, { tipo: 'number', ayuda: '1: la misma sección en toda la altura; más: cada tramo con la suya (cortados en anillos). Después, «Dimensionar» ajusta cada tramo' });
  const trs = (def.tramos ?? []).filter(t => t.clase !== 'mastil');
  if (trs.length) {
    const mm = (x: { b: number; e: number }) => `${fmt(x.b * 1000, 0)}×${fmt(x.e * 1000, 1)}`;
    const nombre = { columna: 'Columnas', diagonal: 'Diagonales', viga: 'Anillos' } as const;
    const lineas = (['diagonal', 'columna', 'viga'] as const).filter(c => trs.some(t => t.clase === c)).map(c => {
      const base = c === 'columna' ? def.columna : c === 'diagonal' ? def.diagonal : def.viga;
      const ts = trs.filter(t => t.clase === c).sort((a, b) => a.desde - b.desde);
      return `${nombre[c]}: ${[`abajo ${mm(base)}`, ...ts.map(t => `desde ${fmt(t.desde, 1)} m ${mm(t.sec)}`)].join(' · ')}`;
    });
    fo.append(h('p', { class: 'nota chica nota-ancha' }, `${lineas.join('. ')} (mm).`));
  }
  const lab = h('label', { class: 'campo-linea malla-linea', title: 'Cada esquina de la planta es un nudo y los demás se reparten por los lados según su largo. En una planta curva no hay esquinas: se reparten por la vuelta' });
  const cb = h('input', { type: 'checkbox' }) as HTMLInputElement; cb.checked = m.esquinas !== false;
  cb.addEventListener('change', () => conMalla(x => { x.esquinas = cb.checked ? undefined : false; }));
  lab.append(cb, ' Nudos en las esquinas de la planta');
  fo.append(lab);
  const la = h('label', { class: 'campo-linea malla-linea', title: 'Cada barra que cruza una losa tiene ahí un nudo atado a ella: recibe la losa y el viento de ese piso y pandea de piso a piso, como en el Gherkin y el Hearst. Sin esto, los pisos entre anillos los sostienen solo los tabiques' });
  const ca = h('input', { type: 'checkbox' }) as HTMLInputElement; ca.checked = m.arriostrada !== false;
  ca.addEventListener('change', () => conMalla(x => { x.arriostrada = ca.checked ? undefined : false; }));
  la.append(ca, ' Losas atadas a la malla en cada piso');
  fo.append(la);
  fo.append(h('p', { class: 'nota chica nota-ancha' }, 'La malla sigue la fachada de cada nivel (la carpintería o, si no hay, el borde de la losa) corrida la separación hacia afuera: sirve para plantas redondas, elípticas, poligonales o curvas y para torres que se angostan o se corren. Se calcula entera con cada viento: es exacta con losas rígidas y una planta simétrica respecto del viento; con plantas asimétricas difiere menos del 1 % (el giro de la planta lo toma la rototraslación). Los anillos toman el empuje hacia afuera de las diagonales en sus nudos (como un zuncho: el peso, en una malla poligonal, abre los nudos) y se verifican con el CIRSOC 301 a tracción o compresión, con la sección de las vigas; el empuje a lo largo de la fachada lo toma la losa.'));
}

let giro = 30, anilloVisto = 0, soloViento = true, modoSacar = false;

/** la vista «Malla en 3D»: la malla real girable y la planta de un anillo */
export function vistaMalla(): HTMLElement {
  const caja = h('div', { class: 'malla-vista' });
  const d = datosExo(estado.dir);
  const g = d?.entrada.malla;
  if (!d || !g) { caja.append(h('p', { class: 'nota' }, 'Todavía no se puede armar la malla: faltan niveles o viento.')); return caja; }
  // la fuerza de cada barra (las del modelo traen su posición real) y su mayor valor, para la intensidad del color: con
  // el viento solo se ve el trabajo de tubo (tracción del lado del viento, compresión del otro); con el peso y las losas,
  // lo que de verdad tiene cada barra (casi todo comprimido)
  const en = d.entrada;
  const r = soloViento ? calcularExo(paraViento(conMalla({ ...d.def, pesoPropio: false }, en), estado.dir), en.zs, en.W, en.EJ, en.ancho, en.tCaras, en.Eh, en.anchos, en.corr, { qLosa: 0, anchosPerp: en.anchosPerp }) : d.r;
  const esf = new Map(r.caras[0].esfuerzos.filter(e => e.p3).map(e => [clave(e.p3!.a, e.p3!.b), e.N]));
  const Nmax = Math.max(1e-9, ...[...esf.values()].map(Math.abs));
  const diag = g.barras.filter(b => b.clase === 'diagonal').map(b => { const A = g.nudos[b.a], B = g.nudos[b.b]; return (Math.atan2(Math.abs(B.z - A.z), Math.hypot(B.x - A.x, B.y - A.y)) * 180) / Math.PI; });
  const angMedio = diag.length ? diag.reduce((s, v) => s + v, 0) / diag.length : NaN;
  const porAnillo = g.anillos.map((_, ri) => g.nudos.filter(q => q.anillo === ri).length);
  const enPisos = g.nudos.filter(q => q.anillo < 0).length;
  const seg = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Qué esfuerzo se pinta' });
  ([[true, 'Solo el viento', 'El trabajo de tubo: del lado de donde viene el viento las barras traccionan; del otro, comprimen'], [false, 'Viento, peso y losas', 'Lo que tiene cada barra con todas las cargas (el peso comprime casi toda la malla)']] as const).forEach(([v, t, ti]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(soloViento === v), title: ti }, t);
    b.addEventListener('click', () => { soloViento = v; caja.replaceWith(vistaMalla()); });
    seg.append(b);
  });
  caja.append(h('div', { class: 'fila-acciones' }, seg), h('p', { class: 'nota' }, `${g.anillos.length} anillos · ${g.nudos.length - enPisos} nudos en los anillos (${Math.min(...porAnillo)}${Math.max(...porAnillo) !== Math.min(...porAnillo) ? `–${Math.max(...porAnillo)}` : ''} por anillo)${enPisos ? ` y ${enPisos} donde las barras cruzan las losas` : ''} · ${g.barras.length} barras · diagonales a ${fmt(angMedio, 0)}° de la horizontal en promedio (en un diagrid conviene entre 60° y 70°: Moon, 2007). Rojo: tracción; azul: compresión, con el viento ${estado.dir}${soloViento ? ' solo' : ', el peso y las losas'}; gris: anillos.`));

  const fila = h('div', { class: 'malla-fila' });
  const ax = h('div', { class: 'malla-ax' }), pl = h('div', { class: 'malla-pl' });
  const colD = h('div', {}, pl);
  fila.append(ax, colD);
  const rGiro = h('input', { type: 'range', min: '0', max: '360', step: '5', value: String(giro), 'aria-label': 'Girar la malla' }) as HTMLInputElement;
  rGiro.addEventListener('input', () => { giro = +rGiro.value; dibujarAx(); });
  const rAn = h('input', { type: 'range', min: '0', max: String(g.anillos.length - 1), step: '1', value: String(Math.min(anilloVisto, g.anillos.length - 1)), 'aria-label': 'Anillo que se ve en planta' }) as HTMLInputElement;
  const tAn = h('span', { class: 'nota chica' });
  rAn.addEventListener('input', () => { anilloVisto = +rAn.value; dibujarPl(); dibujarAx(); });
  const bSacar = h('button', { type: 'button', 'aria-pressed': String(modoSacar), title: 'Tocá una barra para sacarla (por ejemplo, para abrir una entrada en planta baja) o una punteada para devolverla. Si la malla queda inestable, el cálculo lo avisa' }, 'Sacar o devolver barras');
  bSacar.addEventListener('click', () => { modoSacar = !modoSacar; bSacar.setAttribute('aria-pressed', String(modoSacar)); dibujarAx(); });
  const nSac = (g.quitadas ?? []).length;
  const bTodas = h('button', { type: 'button' }, `Devolver las ${nSac}`);
  bTodas.addEventListener('click', () => estado.cambiar(() => { const x = estado.proyecto.exo; if (x?.malla) { const m = { ...x.malla }; delete m.sacadas; x.malla = m; } }));
  caja.append(fila, h('div', { class: 'fila-acciones malla-controles' }, h('label', {}, 'Girar ', rGiro), h('label', {}, 'Anillo en planta ', rAn), tAn),
    h('div', { class: 'fila-acciones' }, h('div', { class: 'seg chico' }, bSacar), ...(nSac ? [bTodas, h('span', { class: 'nota chica' }, `${nSac} barra${nSac > 1 ? 's' : ''} sacada${nSac > 1 ? 's' : ''} a mano (si cambiás los nudos o el módulo, cambian de lugar y dejan de valer)`)] : [])));

  const W = 520, H = 560;
  function dibujarAx() {
    const ang = (giro * Math.PI) / 180, el = (22 * Math.PI) / 180;
    const P = (x: number, y: number, z: number) => { const xr = (x - g!.cx) * Math.cos(ang) - (y - g!.cy) * Math.sin(ang), yr = (x - g!.cx) * Math.sin(ang) + (y - g!.cy) * Math.cos(ang); return { X: xr, Y: -z * Math.cos(el) + yr * Math.sin(el), prof: yr }; };
    const pts = g!.nudos.map(q => P(q.x, q.y, q.z));
    const x0 = Math.min(...pts.map(p => p.X)), x1 = Math.max(...pts.map(p => p.X)), y0 = Math.min(...pts.map(p => p.Y)), y1 = Math.max(...pts.map(p => p.Y));
    const k = Math.min((W - 30) / Math.max(1, x1 - x0), (H - 30) / Math.max(1, y1 - y0));
    const X = (v: number) => 15 + (v - x0) * k, Y = (v: number) => 15 + (v - y0) * k;
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'malla-svg', role: 'img', 'aria-label': `La malla en tres dimensiones, girada ${giro}°` });
    // de atrás para adelante: las barras de atrás más claras
    const prof0 = Math.min(...pts.map(p => p.prof)), prof1 = Math.max(...pts.map(p => p.prof));
    const orden = g!.barras.map((b, i) => ({ b, i, prof: (pts[b.a].prof + pts[b.b].prof) / 2 })).sort((u, v) => v.prof - u.prof);
    orden.forEach(({ b, prof }) => {
      const A = g!.nudos[b.a], B = g!.nudos[b.b], pa = pts[b.a], pb = pts[b.b];
      const atras = (prof - prof0) / Math.max(1e-9, prof1 - prof0);          // 1: lo más lejos
      const N = esf.get(clave(A, B));
      const l = sv('line', { x1: X(pa.X).toFixed(1), y1: Y(pa.Y).toFixed(1), x2: X(pb.X).toFixed(1), y2: Y(pb.Y).toFixed(1), class: `malla-barra ${b.clase}` });
      const fuerza = N === undefined ? 0 : Math.min(1, Math.abs(N) / Nmax);
      (l as SVGElement).style.stroke = b.clase === 'anillo' || N === undefined ? 'var(--ink2)' : N >= 0 ? 'var(--traccion)' : 'var(--compresion)';
      (l as SVGElement).style.strokeOpacity = String((b.clase === 'anillo' || N === undefined ? 0.45 : 0.25 + 0.75 * fuerza) * (1 - 0.55 * atras));
      (l as SVGElement).style.strokeWidth = String(b.clase === 'anillo' ? 1 : 1 + 2.2 * fuerza);
      if (N !== undefined) l.append(sv('title', {}, `${b.clase === 'columna' ? 'Columna' : 'Diagonal'} · N = ${fmt(N, 1)} t (${N >= 0 ? 'tracción' : 'compresión'})`));
      svg.append(l);
    });
    // las barras sacadas a mano: punteadas, para poder devolverlas
    (g!.quitadas ?? []).forEach(b => {
      const pa = pts[b.a], pb = pts[b.b];
      svg.append(sv('line', { x1: X(pa.X).toFixed(1), y1: Y(pa.Y).toFixed(1), x2: X(pb.X).toFixed(1), y2: Y(pb.Y).toFixed(1), class: 'malla-quitada' }));
    });
    // modo «sacar o devolver barras»: cada barra entera (de anillo a anillo) con una franja ancha para tocarla
    if (modoSacar) {
      const vistas = new Set<string>();
      const toque = (b: { a: number; b: number; clave?: string; clase: string }, quitada: boolean) => {
        if (!b.clave || b.clase === 'anillo') return;
        const pa = pts[b.a], pb = pts[b.b];
        const t = sv('line', { x1: X(pa.X).toFixed(1), y1: Y(pa.Y).toFixed(1), x2: X(pb.X).toFixed(1), y2: Y(pb.Y).toFixed(1), class: 'malla-toque', 'data-clave': b.clave });
        t.append(sv('title', {}, quitada ? 'Devolver esta barra' : 'Sacar esta barra (de anillo a anillo)'));
        t.addEventListener('click', () => {
          const clave = b.clave!;
          estado.cambiar(() => {
            const x = estado.proyecto.exo; if (!x) return;
            const m = { ...(x.malla ?? MALLA_POR_DEFECTO) }, ss = new Set(m.sacadas ?? []);
            if (ss.has(clave)) ss.delete(clave); else ss.add(clave);
            m.sacadas = [...ss]; if (!m.sacadas.length) delete m.sacadas;
            x.malla = m;
          });
        });
        svg.append(t);
      };
      g!.barras.forEach(b => { if (b.clave && !vistas.has(b.clave + b.a)) { vistas.add(b.clave + b.a); toque(b, false); } });
      (g!.quitadas ?? []).forEach(b => toque(b, true));
    }
    // el anillo que se ve en planta, resaltado
    const r = Math.min(anilloVisto, g!.anillos.length - 1);
    g!.nudos.forEach((q, i) => { if (q.anillo === r) svg.append(sv('circle', { cx: X(pts[i].X).toFixed(1), cy: Y(pts[i].Y).toFixed(1), r: 2.6, class: 'malla-nudo-sel' })); });
    ax.replaceChildren(svg);
  }
  function dibujarPl() {
    const r = Math.min(anilloVisto, g!.anillos.length - 1), k0 = g!.anillos[r], z = d!.entrada.zs[k0];
    const ns = g!.nudos.filter(q => q.anillo === r).sort((a, b) => a.t - b.t);
    const iN = estado.proyecto.niveles.findIndex(nv => Math.abs(nv.cota - z) < 1e-6);
    const nv = estado.proyecto.niveles[iN];
    const losa = iN >= 0 ? puntosSilueta(plantaDeNivel(estado.proyecto, iN).silueta, 4).map(q => ({ x: q.x + (nv?.dx ?? 0), y: q.y + (nv?.dy ?? 0) })) : [];
    const todos = [...ns, ...losa];
    const x0 = Math.min(...todos.map(q => q.x)), x1 = Math.max(...todos.map(q => q.x)), y0 = Math.min(...todos.map(q => q.y)), y1 = Math.max(...todos.map(q => q.y));
    const S = 260, k = (S - 30) / Math.max(1, x1 - x0, y1 - y0), X = (x: number) => 15 + (x - x0) * k, Y = (y: number) => S - 15 - (y - y0) * k;
    const svg = sv('svg', { viewBox: `0 0 ${S} ${S}`, class: 'malla-svg planta', role: 'img', 'aria-label': `Planta del anillo ${r + 1}` });
    if (losa.length) svg.append(sv('polygon', { points: losa.map(q => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' '), class: 'malla-losa' }));
    svg.append(sv('polygon', { points: ns.map(q => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' '), class: 'malla-anillo' }));
    ns.forEach((q, i) => svg.append(sv('circle', { cx: X(q.x).toFixed(1), cy: Y(q.y).toFixed(1), r: i === 0 ? 4 : 3, class: i === 0 ? 'malla-nudo primero' : 'malla-nudo' })));
    // el viento: una flecha del lado de donde llega (A: a lo largo de y; B: a lo largo de x)
    const flecha = estado.dir === 'A' ? `M${S / 2},${S - 3} v-12 m-4,4 l4,-4 l4,4` : `M3,${S / 2} h12 m-4,-4 l4,4 l-4,4`;
    svg.append(sv('path', { d: flecha, class: 'malla-viento' }));
    pl.replaceChildren(svg);
    tAn.textContent = `anillo ${r + 1} de ${g!.anillos.length} · cota ${fmt(z, 2)} m · ${ns.length} nudos, uno cada ${fmt(ns.reduce((s, q) => s + q.trib, 0) / Math.max(1, ns.length), 2)} m de fachada`;
  }
  dibujarAx(); dibujarPl();
  colD.append(derivaPorPiso(d.r.u, d.entrada.zs, g, d.dir));
  return caja;
}

const clave = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => `${a.x.toFixed(4)},${a.y.toFixed(4)},${a.z.toFixed(3)}|${b.x.toFixed(4)},${b.y.toFixed(4)},${b.z.toFixed(3)}`;

/** ficha M: la hoja «G · Malla» del Excel (nudos, barras, fuerzas con los dos vientos y la peor relación del CIRSOC 301) */
export function hojaMalla(): MallaHoja | null {
  const def = estado.proyecto.exo;
  return def && def.tipo === 'M' ? exoActual().hojaMalla(def) : null;
}

/** ficha M: botón que baja el programa de Pynite que resuelve la malla como reticulado espacial y la compara con la app */
export function botonPyniteMalla(def: ExoDef): HTMLElement {
  const b = h('button', { type: 'button', class: 'boton', title: 'Un programa en Python (Google Colab o la computadora) que resuelve la malla con Pynite, otro programa de elementos finitos, como reticulado espacial de verdad, y la compara con la app' }, 'Contrastar la malla con Pynite (.py)');
  b.addEventListener('click', async () => {
    const d = exoActual().datosPyniteMalla(def), msg = document.getElementById('mensaje');
    if (!d) { if (msg) msg.textContent = 'No se pudo armar la malla para Pynite.'; return; }
    const { programaPyniteMalla } = await import('./exportarPyniteMalla');
    const { nombre, texto } = programaPyniteMalla(d, estado.proyecto.nombre);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' })); a.download = nombre;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    if (msg) msg.textContent = `Bajó ${nombre}: corrélo en Google Colab (primero «!pip install PyniteFEA») o con Python. Compara los corrimientos, las fuerzas y el giro de la app con Pynite.`;
  });
  return h('div', { class: 'fila-acciones' }, b, h('span', { class: 'nota chica' }, 'En el Gherkin con 12 nudos por anillo, Pynite y la app difieren menos del 0,2 % en los corrimientos y del 0,1 % en las fuerzas.'));
}

// ------------------------------------------------------------------ qué malla conviene
let barridoM: { clave: string; filas: FilaMalla[] } | null = null;
/** el barrido vale mientras no cambien el proyecto ni el exo (sin contar el módulo, los nudos y los cortes, que se barren) */
const claveBarridoM = (def: ExoDef) => JSON.stringify([estado.proyecto.niveles.length, estado.calculo?.valores ? 1 : 0, { ...def, modulo: 0, cortes: 0, malla: { ...(def.malla ?? MALLA_POR_DEFECTO), nudos: 0 } }]);
/** ficha M: probar módulos y nudos por anillo con las mismas secciones y comparar la rigidez por tonelada */
export function seccionBarridoMalla(def: ExoDef): HTMLElement {
  const s = seccion('Qué malla conviene');
  const modulos = [2, 4, 6, 8], nudos = [12, 16, 20, 24];
  s.cuerpo.append(h('p', { class: 'nota' }, `Con las mismas secciones, cada malla (módulo de anillo a anillo × nudos por anillo) tiene su rigidez y su acero. La rigidez por tonelada (J equivalente / acero) dice qué geometría rinde más: con más rigidez por tonelada, el «Dimensionar» llega con menos acero. Los módulos chicos acuestan las diagonales (toman bien el corte); los grandes las paran (toman bien la flexión). En un diagrid alto el óptimo suele quedar con las diagonales entre 60° y 70° (Moon, Connor y Fernández, 2007). Prueba ${modulos.length * nudos.length} mallas sin los cortes a mano.`));
  const res = h('div', {});
  const boton = h('button', { type: 'button', class: 'boton' }, `Probar módulos de ${modulos[0]} a ${modulos[modulos.length - 1]} pisos y de ${nudos[0]} a ${nudos[nudos.length - 1]} nudos`);
  const mostrar = (filas: FilaMalla[]) => {
    res.replaceChildren();
    if (!filas.length) { res.append(h('p', { class: 'nota' }, 'Ninguna malla se pudo calcular.')); return; }
    const mejor = filas.reduce((a, b) => (b.porTonelada > a.porTonelada ? b : a));
    const k = (f: FilaMalla) => f.porTonelada / mejor.porTonelada;
    // la tabla: una fila por módulo, una columna por cantidad de nudos, con la rigidez por tonelada relativa a la mejor
    const tabla = h('table', { class: 'tabla-valores malla-barrido' });
    tabla.append(h('tr', {}, h('th', {}, 'módulo \\ nudos'), ...nudos.map(n => h('th', {}, String(n)))));
    modulos.forEach(mo => tabla.append(h('tr', {}, h('th', {}, `${mo} pisos`), ...nudos.map(n => {
      const f = filas.find(x => x.modulo === mo && x.nudos === n);
      if (!f) return h('td', {}, '—');
      const td = h('td', { title: `${fmt(f.angulo, 0)}° · J eq ${fmt(f.Jeq, 0)} m⁴ · ${fmt(f.peso, 0)} t · deriva ${fmt(f.deriva * 100, 0)} % del límite` }, `${fmt(k(f) * 100, 0)} %`, h('span', { class: 'malla-ang' }, ` ${fmt(f.angulo, 0)}°`));
      if (f === mejor) td.classList.add('mejor');
      td.style.setProperty('--k', String(Math.max(0, Math.min(1, k(f)))));
      return td;
    }))));
    const usar = h('button', { type: 'button', class: 'primario' }, `Usar la mejor: módulo de ${mejor.modulo} pisos y ${mejor.nudos} nudos`);
    usar.addEventListener('click', () => estado.cambiar(() => { const x = estado.proyecto.exo; if (x) { x.modulo = mejor.modulo; delete x.cortes; x.malla = { ...(x.malla ?? MALLA_POR_DEFECTO), nudos: mejor.nudos }; } }));
    res.append(tabla,
      h('p', { class: 'nota chica' }, `Cada celda: la rigidez por tonelada de esa malla, con la mejor (resaltada) = 100 %, y el ángulo medio de sus diagonales. La mejor: ${fmt(mejor.angulo, 0)}°, J equivalente ${fmt(mejor.Jeq, 0)} m⁴ con ${fmt(mejor.peso, 0)} t (${fmt(mejor.porTonelada, 2)} m⁴/t). Después de elegir, «Dimensionar» busca los tubos.`),
      h('div', { class: 'fila-acciones' }, usar));
  };
  boton.addEventListener('click', () => {
    boton.setAttribute('disabled', '');
    // de a una malla, dejando pintar entre una y otra (las de módulo grande y muchos nudos tardan un par de segundos)
    const pares = modulos.flatMap(mo => nudos.map(n => [mo, n] as const)), filas: FilaMalla[] = [], ex = exoActual();
    const paso = (i: number) => {
      if (!boton.isConnected) return;
      if (i >= pares.length) { barridoM = { clave: claveBarridoM(def), filas }; mostrar(filas); boton.removeAttribute('disabled'); return; }
      try { filas.push(...ex.barridoMalla(def, [pares[i][0]], [pares[i][1]])); } catch { /* una malla que no se puede calcular queda vacía */ }
      mostrar(filas);
      res.prepend(h('p', { class: 'nota' }, `Probando mallas: ${i + 1} de ${pares.length}…`));
      setTimeout(() => paso(i + 1), 0);
    };
    res.replaceChildren(h('p', { class: 'nota' }, 'Probando mallas…'));
    setTimeout(() => paso(0), 30);
  });
  s.cuerpo.append(h('div', { class: 'fila-acciones' }, boton), res);
  if (barridoM && barridoM.clave === claveBarridoM(def)) mostrar(barridoM.filas);
  return s.el;
}

/**
 * La deriva de cada piso (Δu / h, en mm por metro) con el viento elegido, al lado de la malla: la media de la torre
 * punteada y los pisos flojos (más de 3 veces la media) marcados. Color de la deformada (no es tracción ni compresión).
 */
function derivaPorPiso(u: number[], zs: number[], g: import('../engine/exoMalla').MallaGeo, dir: 'A' | 'B'): SVGSVGElement {
  const S = 260, Hh = 300, m = { i: 36, d: 10, a: 10, b: 28 };
  const der = u.map((x, i) => (Math.abs(x - (i ? u[i - 1] : 0)) / Math.max(1e-9, zs[i + 1] - zs[i])) * 1000);
  const media = (Math.abs(u[u.length - 1] ?? 0) / Math.max(1e-9, zs[zs.length - 1] - zs[0])) * 1000;
  const flojos = new Set(pisosFlojos(g, zs, u).map(f => f.z));
  const dMax = Math.max(1e-9, ...der, media * 1.2), z0 = zs[0], z1 = zs[zs.length - 1];
  const X = (v: number) => m.i + (v / dMax) * (S - m.i - m.d), Y = (z: number) => Hh - m.b - ((z - z0) / Math.max(1e-9, z1 - z0)) * (Hh - m.a - m.b);
  const svg = sv('svg', { viewBox: `0 0 ${S} ${Hh}`, class: 'malla-svg malla-deriva', role: 'img', 'aria-label': `Deriva de cada piso con el viento ${dir}` }) as SVGSVGElement;
  svg.append(sv('line', { x1: X(0), y1: Y(z0), x2: X(0), y2: Y(z1), class: 'malla-eje' }), sv('line', { x1: X(0), y1: Y(z0), x2: S - m.d, y2: Y(z0), class: 'malla-eje' }));
  svg.append(sv('line', { x1: X(media).toFixed(1), y1: Y(z0), x2: X(media).toFixed(1), y2: Y(z1), class: 'malla-media' }));
  // en escalones: la deriva es de cada entrepiso (un valor de una losa a la siguiente)
  const pts = der.flatMap((v, i) => [`${X(v).toFixed(1)},${Y(zs[i]).toFixed(1)}`, `${X(v).toFixed(1)},${Y(zs[i + 1]).toFixed(1)}`]);
  svg.append(sv('polyline', { points: pts.join(' '), class: 'malla-deriva-linea' }));
  der.forEach((v, i) => { if (flojos.has(zs[i + 1])) svg.append(sv('circle', { cx: X(v).toFixed(1), cy: Y((zs[i] + zs[i + 1]) / 2).toFixed(1), r: 4, class: 'malla-flojo' })); });
  svg.append(sv('text', { x: m.i, y: Hh - 8, class: 'malla-rot' }, `deriva de cada piso (mm/m), viento ${dir}`));
  svg.append(sv('text', { x: X(media) + 3, y: Y(z0) - 4, class: 'malla-rot' }, `media ${fmt(media, 2)}`));
  svg.append(sv('text', { x: 2, y: Y(z1) + 4, class: 'malla-rot' }, `${fmt(z1, 0)} m`), sv('text', { x: 2, y: Y(z0), class: 'malla-rot' }, `${fmt(z0, 0)} m`));
  if (flojos.size) svg.append(sv('text', { x: S - m.d, y: m.a + 10, class: 'malla-rot', 'text-anchor': 'end' }, `● ${flojos.size} piso${flojos.size > 1 ? 's' : ''} flojo${flojos.size > 1 ? 's' : ''}`));
  return svg;
}
