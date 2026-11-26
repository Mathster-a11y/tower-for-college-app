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
import { anguloPlano, type PlanoCorte } from '../engine/planos_corte';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag: string, a: Record<string, string | number> = {}, txt?: string) => { const e = document.createElementNS(NS, tag); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v))); if (txt !== undefined) e.textContent = txt; return e as SVGElement; };
const f2 = (x: number) => x.toFixed(2).replace('.', ',');

type Rango = 'este' | 'arriba' | 'abajo' | 'todos';
type Modo = 'editar' | 'calibrar' | 'mover-calco' | 'plano' | 'medir';

/** niveles que genera el perfil o un loft (al editarlos a mano quedan sueltos) */
function generados(p: Proyecto): Set<number> {
  const s = new Set<number>();
  if (p.perfilTorre) { const ib = nivelBase(p, p.perfilTorre); p.niveles.forEach((_, i) => { if (i < ib) s.add(i); }); }
  (p.lofts ?? []).forEach(l => nivelesDeLoft(p, l).intermedios.forEach(i => s.add(i)));
  return s;
}

export function montarCorte(cont: HTMLElement, mensaje: (t: string) => void) {
  const raiz = document.createElement('div'); raiz.className = 'corte-torre'; raiz.hidden = true;
  let objetivo: 'losas' | 'envolvente' = 'losas';
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
  /** puntos del plano de corte que se está dibujando */
  let plano: { w: number; z: number }[] = [];
  /** medir sobre el calco: los toques en el borde de la torre del plano, con su lado (izquierdo o derecho) */
  let medidas: { w: number; z: number; lado: 'min' | 'max' }[] = [];
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
      const bme = boton('Medir sobre el calco', 'Tocá el borde de la torre en el plano a varias alturas (de los dos lados): cada losa entre dos toques del mismo lado toma el borde que marca el plano', () => { modo = modo === 'medir' ? 'editar' : 'medir'; armar(); }); bme.setAttribute('aria-pressed', String(modo === 'medir'));
      ext.push(bc, bm, bme, ...(medidas.length ? [boton(`Borrar los ${medidas.length} toques`, 'Saca las marcas de la medición (las losas ya cambiadas quedan; Ctrl+Z las vuelve)', () => { medidas = []; armar(); })] : []), op, boton('Quitar el calco', '', () => { estado.calcoCorte = null; modo = 'editar'; medidas = []; armar(); }));
    }
    // planos de corte: los de este corte, con su ángulo, qué sacan y quitar
    const pls = planosDe(estado.proyecto).filter(q => q.eje === eje);
    const bp = boton('+ Plano de corte', 'Dos puntos en el corte: el plano pasa por ellos y saca lo de arriba (la corona a 45° del Citicorp)', () => { modo = modo === 'plano' ? 'editar' : 'plano'; plano = []; armar(); }); bp.setAttribute('aria-pressed', String(modo === 'plano'));
    const listaP = pls.map(q => {
      const d = document.createElement('span'); d.className = 'plano-item';
      // ángulo exacto: se queda la punta a y la otra gira (mismo largo, mismo sentido)
      const ang = document.createElement('input'); ang.type = 'text'; ang.inputMode = 'decimal'; ang.className = 'campo-vertice'; ang.value = f2(anguloPlano(q)); ang.setAttribute('aria-label', `Ángulo del plano ${q.id}`);
      ang.addEventListener('change', () => { const t = parseFloat(ang.value.replace(',', '.')); if (!(t >= 0 && t <= 90)) return; cambiarPlano(q.id, x => { const L = Math.hypot(x.b.w - x.a.w, x.b.z - x.a.z), sw = x.b.w >= x.a.w ? 1 : -1, sz = x.b.z >= x.a.z ? 1 : -1, r = (t * Math.PI) / 180; x.b = { w: +(x.a.w + sw * L * Math.cos(r)).toFixed(2), z: +(x.a.z + sz * L * Math.sin(r)).toFixed(2) }; }); });
      d.append(`${q.id} · `, ang, '°',
        boton(`saca ${(q.saca ?? 'arriba') === 'arriba' ? 'arriba' : 'abajo'} ⇅`, 'Cambiar qué lado del plano se saca', () => cambiarPlano(q.id, x => { x.saca = (x.saca ?? 'arriba') === 'arriba' ? 'abajo' : 'arriba'; })),
        boton('✕', 'Quitar el plano: las losas vuelven a como estaban antes de cortarlas', () => quitarPlano(q.id)));
      return d;
    });
    // con envolvente, los planos recortan las losas o la envolvente (se elige)
    const obj = document.createElement('div'); obj.className = 'seg chico'; obj.setAttribute('role', 'group'); obj.setAttribute('aria-label', 'Qué recortan los planos');
    if (estado.proyecto.envolvente) ([['losas', 'Planos: losas'], ['envolvente', 'Planos: envolvente']] as const).forEach(([v, t]) => { const x = boton(t, v === 'losas' ? 'Los planos de corte recortan las losas' : 'Los planos de corte recortan la envolvente (las losas no se tocan)', () => { objetivo = v; modo = 'editar'; plano = []; armar(); }); x.setAttribute('aria-pressed', String(objetivo === v)); obj.append(x); });
    barra.replaceChildren(Object.assign(document.createElement('b'), { textContent: 'Corte de la torre' }), seg, ...(estado.proyecto.envolvente ? [obj] : []), lpos, lr, bp, ...listaP, ...ext, boton('Cerrar', 'Volver a la planta (Esc)', cerrar));
  }
  function armarPie() {
    pie.textContent = modo === 'plano' ? (plano.length ? 'Tocá el segundo punto del plano (por ejemplo, el otro extremo del techo inclinado del plano calcado).' : 'Plano de corte: tocá el primer punto de la recta (en el alzado calcado, una punta del techo inclinado). Se saca lo de arriba; después se puede cambiar.')
      : modo === 'calibrar' ? (calib.length ? 'Tocá el segundo punto del plano (de una medida que conozcas: el ancho de la torre, la altura de un piso…).' : 'Escala del calco: tocá el primer punto de una medida conocida del plano.')
      : modo === 'medir' ? `Medir sobre el calco: tocá el borde de la torre en el plano, de un lado y del otro, a varias alturas (más toques donde la forma cambia). Cada losa entre dos toques del mismo lado toma el borde del plano; con un solo toque, la losa más cercana. ${medidas.length ? `${medidas.length} ${medidas.length === 1 ? 'toque' : 'toques'}.` : ''} Esc termina.`
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
    // los toques de la medición: una cruz en cada uno y la línea que los une por lado
    for (const lado of ['min', 'max'] as const) {
      const ms = medidas.filter(m => m.lado === lado).sort((a, b) => a.z - b.z);
      if (ms.length > 1) svg.append(el('polyline', { points: ms.map(m => `${W(m.w).toFixed(1)},${Z(m.z).toFixed(1)}`).join(' '), class: 'medida-linea' }));
      ms.forEach(m => svg.append(el('path', { d: `M${W(m.w) - 6},${Z(m.z)}h12M${W(m.w)},${Z(m.z) - 6}v12`, class: 'medida' })));
    }
    // planos de corte de este corte: la recta de borde a borde de la vista, el lado que se saca sombreado, y sus manijas
    const ancho = svg.clientWidth || 800, alto = svg.clientHeight || 600;
    planosDe(p).filter(q => q.eje === eje).forEach(q => {
      const a = previaPlano?.id === q.id ? previaPlano.a : q.a, b = previaPlano?.id === q.id ? previaPlano.b : q.b;
      const dx = W(b.w) - W(a.w), dy = Z(b.z) - Z(a.z), L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, big = 4 * (ancho + alto);
      const p1 = [W(a.w) - ux * big, Z(a.z) - uy * big], p2 = [W(a.w) + ux * big, Z(a.z) + uy * big];
      // lado que se saca: hacia arriba de la pantalla (o abajo) desde la recta
      const arriba = (q.saca ?? 'arriba') === 'arriba', nx = uy, ny = -ux, s = (ny < 0) === arriba ? 1 : -1;
      svg.append(el('polygon', { points: `${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p2[0] + nx * s * big},${p2[1] + ny * s * big} ${p1[0] + nx * s * big},${p1[1] + ny * s * big}`, class: 'plano-sacado' }));
      svg.append(el('line', { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], class: 'plano' }));
      svg.append(el('text', { x: W((a.w + b.w) / 2) + 8, y: Z((a.z + b.z) / 2) - 8, class: 'rot' }, `${q.id} · ${f2(anguloPlano({ ...q, a, b }))}°`));
      ([['a', a], ['b', b]] as const).forEach(([k2, pt]) => svg.append(el('rect', { x: W(pt.w) - 6, y: Z(pt.z) - 6, width: 12, height: 12, class: 'manija-plano', 'data-plano': q.id, 'data-punta': k2 })));
    });
    plano.forEach(q => svg.append(el('circle', { cx: W(q.w), cy: Z(q.z), r: 5, class: 'calib' })));
    if (arr && arr.rot) svg.append(el('text', { x: arr.sx + 12, y: arr.sy - 12, class: 'rot' }, arr.rot));
  }

  // arrastres: una manija (borde de losa), el calco o el fondo (correr la vista)
  let previaPlano: { id: string; a: { w: number; z: number }; b: { w: number; z: number } } | null = null;
  let arr: { punta?: 'a' | 'b'; tipo: 'borde' | 'calco' | 'vista' | 'plano'; id: number; i?: number; lado?: 'min' | 'max'; w0?: number; z0?: number; sx: number; sy: number; c0?: { w: number; z: number }; cx0?: number; cz0?: number; rot?: string } | null = null;
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
    if (modo === 'medir') { medir(q); return; }
    if (modo === 'plano') {
      plano.push(q); armarPie(); dibujar();
      if (plano.length === 2) {
        const [a, b] = plano; plano = []; modo = 'editar';
        if (Math.hypot(b.w - a.w, b.z - a.z) < 0.2) { armar(); return; }
        const pp = estado.proyecto, id = (() => { let n = 1; while (planosDe(pp).some(x => x.id === `P${n}`)) n++; return `P${n}`; })();
        const r4 = (x: number) => Math.round(x * 100) / 100;
        estado.cambiar(px => {
          const nuevo: PlanoCorte = { id, eje, a: { w: r4(a.w), z: r4(a.z) }, b: { w: r4(b.w), z: r4(b.z) } };
          if (objetivo === 'losas') nuevo.antes = px.niveles.map(n => ({ cota: n.cota, silueta: n.silueta ? n.silueta.map(v => ({ ...v })) : null, B: n.B ?? null, L: n.L ?? null }));
          ponerPlanos(px, [...planosDe(px), nuevo]);
        });
        mensaje(`Plano ${id} a ${f2(anguloPlano({ id, eje, a, b }))}°: ${objetivo === 'envolvente' ? 'la envolvente queda recortada (las losas no se tocan)' : 'las losas que cruza quedan recortadas'}. Cambiá el lado con ⇅ o movelo con sus manijas (□).`);
      }
      return;
    }
    const hp = (ev.target as Element).closest?.('.manija-plano');
    if (hp && modo === 'editar') {
      const q0 = planosDe(estado.proyecto).find(x => x.id === hp.getAttribute('data-plano'));
      if (q0) { previaPlano = { id: q0.id, a: { ...q0.a }, b: { ...q0.b } }; arr = { tipo: 'plano', id: ev.pointerId, punta: hp.getAttribute('data-punta') as 'a' | 'b', sx: ev.clientX, sy: ev.clientY }; try { svg.setPointerCapture(ev.pointerId); } catch { /* sintético */ } return; }
    }
    const h = (ev.target as Element).closest?.('.manija');
    if (h && modo === 'editar') {
      const i = +h.getAttribute('data-i')!, lado = h.getAttribute('data-lado') as 'min' | 'max', t = tramoCorte(plantaDeNivel(estado.proyecto, i).silueta, eje, c)!;
      arr = { tipo: 'borde', id: ev.pointerId, i, lado, w0: lado === 'min' ? t[0] : t[1], sx: ev.clientX - r.left, sy: ev.clientY - r.top };
    } else if (modo === 'mover-calco' && estado.calcoCorte) arr = { tipo: 'calco', id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, cx0: estado.calcoCorte.x, cz0: estado.calcoCorte.z };
    else { const p0 = estado.proyecto; encuadrar(p0); arr = { tipo: 'vista', id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, c0: { w: (((svg.clientWidth || 800) / 2) - ox) / k, z: (oy - (svg.clientHeight || 600) / 2) / k } }; }
    try { svg.setPointerCapture(ev.pointerId); } catch { /* sintético */ }
  });
  /**
   * Un toque de la medición: se decide el lado (el de la losa más cercana en altura) y se vuelven a aplicar todos los
   * toques: cada losa entre dos toques del mismo lado toma el borde interpolado entre ellos (con un solo toque, la
   * losa más cercana a esa altura).
   */
  function medir(q: { w: number; z: number }) {
    const p = estado.proyecto;
    const filas = p.niveles.map((n, i) => ({ n, i, t: tramoCorte(plantaDeNivel(p, i).silueta, eje, c) })).filter(x => x.t && x.n.cota >= 0);
    if (!filas.length) return;
    const cerca = filas.reduce((a, b) => (Math.abs(b.n.cota - q.z) < Math.abs(a.n.cota - q.z) ? b : a));
    const lado: 'min' | 'max' = q.w < (cerca.t![0] + cerca.t![1]) / 2 ? 'min' : 'max';
    medidas.push({ w: Math.round(q.w * 100) / 100, z: q.z, lado });
    const objetivos = new Map<number, { min?: number; max?: number }>();
    for (const ld of ['min', 'max'] as const) {
      const ms = medidas.filter(m => m.lado === ld).sort((a, b) => a.z - b.z);
      if (!ms.length) continue;
      if (ms.length === 1) {
        const f = filas.reduce((a, b) => (Math.abs(b.n.cota - ms[0].z) < Math.abs(a.n.cota - ms[0].z) ? b : a));
        objetivos.set(f.i, { ...objetivos.get(f.i), [ld]: ms[0].w });
        continue;
      }
      filas.forEach(f => {
        const z = f.n.cota; if (z < ms[0].z - 1e-6 || z > ms[ms.length - 1].z + 1e-6) return;
        let j = 0; while (j + 2 < ms.length && ms[j + 1].z < z) j++;
        const a = ms[j], b = ms[j + 1], t = b.z > a.z ? (z - a.z) / (b.z - a.z) : 0;
        objetivos.set(f.i, { ...objetivos.get(f.i), [ld]: Math.round((a.w + (b.w - a.w) * t) * 100) / 100 });
      });
    }
    const gen = generados(p);
    let cambiadas = 0, sueltos = 0;
    estado.cambiar(pp => objetivos.forEach((o, i) => {
      let v: Vertice[] = plantaDeNivel(pp, i).silueta, cambio = false;
      for (const ld of ['min', 'max'] as const) {
        const w = o[ld]; if (w === undefined) continue;
        const t = tramoCorte(v, eje, c); if (!t || Math.abs((ld === 'min' ? t[0] : t[1]) - w) < 0.005) continue;
        const nv = moverBordeEnCorte(v, eje, c, ld, w); if (nv) { v = nv; cambio = true; }
      }
      const n = pp.niveles[i];
      if (!cambio) return;
      n.silueta = v; const cj = cajaSilueta(v); n.B = +cj.B.toFixed(2); n.L = +cj.L.toFixed(2); cambiadas++;
      if (gen.has(i) && !n.manual) { n.manual = true; sueltos++; }
    }));
    mensaje(`Toque ${medidas.length} (${lado === 'min' ? 'lado izquierdo' : 'lado derecho'} a ${f2(q.z)} m): ${cambiadas ? `${cambiadas} ${cambiadas === 1 ? 'losa tomó' : 'losas tomaron'} el borde del plano${sueltos ? ` (${sueltos} quedaron sueltas del perfil o el loft)` : ''}` : 'ninguna losa cambió todavía (falta otro toque de ese lado)'}. Ctrl+Z deshace.`);
    armar();
  }
  /** niveles que cambia el arrastre del nivel i */
  const afectados = (p: Proyecto, i: number) => p.niveles.map((_, j) => j).filter(j => rango === 'todos' || j === i || (rango === 'arriba' && p.niveles[j].cota > p.niveles[i].cota) || (rango === 'abajo' && p.niveles[j].cota < p.niveles[i].cota && p.niveles[j].cota >= 0));
  svg.addEventListener('pointermove', ev => {
    if (!arr || ev.pointerId !== arr.id) return;
    const r = svg.getBoundingClientRect();
    if (arr.tipo === 'plano' && previaPlano) { const q = aMundo(ev); previaPlano[arr.punta!] = { w: Math.round(q.w * 100) / 100, z: Math.round(q.z * 100) / 100 }; dibujar(); return; }
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
    if (a.tipo === 'plano' && previaPlano) { const pv = previaPlano; previaPlano = null; cambiarPlano(pv.id, x => { x.a = pv.a; x.b = pv.b; }); return; }
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
  document.addEventListener('keydown', ev => { if (!raiz.hidden && ev.key === 'Escape' && !(ev.target as HTMLElement).closest?.('input, select, textarea')) { ev.preventDefault(); if (modo !== 'editar') { modo = 'editar'; calib = []; plano = []; armar(); } else cerrar(); } });
  new ResizeObserver(() => dibujar()).observe(raiz);
  estado.suscribir(() => { if (!raiz.hidden && !arr) armar(); });

  /** a qué se le dibujan los planos: a las losas o a la envolvente (que no guarda «antes»: se recalcula sola) */
  function planosDe(pp: Proyecto): PlanoCorte[] { return objetivo === 'envolvente' ? pp.envolvente?.planos ?? [] : pp.planosCorte ?? []; }
  function ponerPlanos(pp: Proyecto, xs: PlanoCorte[]) {
    if (objetivo === 'envolvente') { if (pp.envolvente) pp.envolvente = { ...pp.envolvente, planos: xs.length ? xs : null }; return; }
    if (xs.length) pp.planosCorte = xs; else delete pp.planosCorte;
  }
  /** cambia un plano: las losas vuelven a como estaban antes de cortarlas y se recortan con el plano nuevo */
  function cambiarPlano(id: string, f: (q: PlanoCorte) => void) {
    estado.cambiar(pp => {
      const q = planosDe(pp).find(x => x.id === id); if (!q) return;
      restaurar(pp, q); f(q);
      if (objetivo === 'envolvente') ponerPlanos(pp, [...planosDe(pp)]);
    });
  }
  function quitarPlano(id: string) {
    estado.cambiar(pp => {
      const q = planosDe(pp).find(x => x.id === id); if (!q) return;
      restaurar(pp, q);
      ponerPlanos(pp, planosDe(pp).filter(x => x.id !== id));
    });
    mensaje(objetivo === 'envolvente' ? `Plano ${id} quitado de la envolvente.` : `Plano ${id} quitado: las losas que recortaba volvieron a como estaban.`);
  }
  /** las losas como estaban antes del plano (las que no se tocaron después quedan igual) */
  function restaurar(pp: Proyecto, q: PlanoCorte) {
    (q.antes ?? []).forEach(a => { const n = pp.niveles.find(x => Math.abs(x.cota - a.cota) < 1e-6); if (!n) return; n.silueta = a.silueta ? a.silueta.map(v => ({ ...v })) : null; n.B = a.B; n.L = a.L; });
  }
  function armar() { if (objetivo === 'envolvente' && !estado.proyecto.envolvente) objetivo = 'losas'; armarBarra(); armarPie(); dibujar(); }
  /** @param a qué recortan los planos que se dibujen: las losas (por defecto) o la envolvente */
  function abrir(obj: 'losas' | 'envolvente' = 'losas') { objetivo = obj === 'envolvente' && estado.proyecto.envolvente ? 'envolvente' : 'losas'; raiz.hidden = false; armar(); }
  function cerrar() { raiz.hidden = true; modo = 'editar'; calib = []; previa = null; mensaje('Corte cerrado.'); }
  return { abrir, cerrar, activo: () => !raiz.hidden };
}
