/**
 * Panel «Guías»: grilla de ejes (A, B, C… / 1, 2, 3…) y líneas guía de construcción: horizontales, verticales, por
 * dos puntos, paralelas a una distancia, y círculos (compás, tangente a dos rectas con un radio, por tres puntos).
 * El imán de la planta toma sus cruces, centros, cuadrantes y cualquier punto sobre ellas.
 */
import { estado, fmt } from './estado';
import type { Punto } from '../engine/silueta';
import { circulo3p, circuloTTR, distGuia, ejesGrilla, idGuia, imanGuias, leerSeparaciones, paralela, rectaPorDosPuntos, type Guia, type GuiaRecta } from '../engine/guias';
import type { ApiPlanta, Vista } from './colocar';

type Herr = null | 'v' | 'h' | 'dos' | 'paralela' | 'compas' | 'ttr' | 'tres' | 'borrar';
const num = (t: string) => { const v = parseFloat(t.replace(',', '.')); return isFinite(v) ? v : NaN; };
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** opciones compartidas con la planta (ver e imán) */
export const opGuias = { ver: true, iman: true };
/** imán de las guías para la planta */
export function imanDeGuias(q: Punto, tol: number) {
  if (!opGuias.ver || !opGuias.iman) return null;
  return imanGuias(q, estado.proyecto.guias ?? [], tol);
}

export function montarGuias(api: ApiPlanta) {
  const { svg, el } = api;
  let herr: Herr = null, abierto = false, pts: Punto[] = [], elegidas: string[] = [], cursor: Punto | null = null, sel: string | null = null;
  let vista: Vista = { X: x => x, Y: y => y, escala: 1 };
  const op = { sepX: '3 × 7,20', sepY: '2 × 6,00', nx: 'letras' as 'letras' | 'numeros', ny: 'numeros' as 'letras' | 'numeros', centrar: true, x0: 0, y0: 0, d: 1, r: 2 };

  const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Guías';
  b.title = 'Grilla de ejes y líneas guía (rectas y círculos) para ubicar los muros: el imán toma sus cruces';
  const panel = document.createElement('div'); panel.className = 'calco-panel colocar-panel guias-panel'; panel.hidden = true;
  api.dock.appendChild(panel);
  b.addEventListener('click', () => { abierto = !abierto; panel.classList.remove('plegado'); poner(null); });

  const poner = (h: Herr) => { herr = h; pts = []; elegidas = []; cursor = null; api.activar(!!h); svg.classList.toggle('colocando', !!h); armar(); api.dibujar(); if (h) api.mensaje(instr()); };
  const instr = () => ({
    v: 'Guía vertical: tocá por dónde pasa.', h: 'Guía horizontal: tocá por dónde pasa.',
    dos: pts.length ? 'Tocá el segundo punto.' : 'Guía por dos puntos: tocá el primero.',
    paralela: elegidas.length ? `Tocá de qué lado va la paralela (a ${fmt(op.d)} m).` : 'Paralela: tocá la guía de referencia.',
    compas: pts.length ? (op.r > 0 ? '' : 'Tocá un punto del círculo.') : `Compás: tocá el centro${op.r > 0 ? ` (radio ${fmt(op.r)} m)` : ''}.`,
    ttr: elegidas.length < 2 ? `Tangente a dos rectas: tocá la ${elegidas.length ? 'segunda' : 'primera'} recta.` : `Tocá cerca de dónde va el círculo (radio ${fmt(op.r)} m).`,
    tres: `Círculo por tres puntos: tocá el punto ${pts.length + 1}.`, borrar: 'Tocá la guía que querés borrar (Esc termina).',
  } as Record<string, string>)[herr ?? ''] ?? '';

  const guias = () => estado.proyecto.guias ?? [];
  const agregar = (g: Omit<GuiaRecta, 'id'> | { t: 'circulo'; c: Punto; r: number }, txt: string) => {
    estado.cambiar(p => { const gs = (p.guias ??= []); gs.push({ ...g, id: idGuia(gs) } as Guia); });
    api.mensaje(txt);
  };
  const cercana = (q: Punto, soloRectas = false) => {
    const tol = 14 / vista.escala;
    return guias().filter(g => !soloRectas || g.t === 'recta').map(g => ({ g, d: distGuia(q, g) })).filter(x => x.d <= tol).sort((a, c) => a.d - c.d)[0]?.g;
  };

  const alTocar = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    // sin herramienta y con el panel abierto: tocar una guía la elige (para editar su posición)
    if (!herr) {
      if (!abierto || svg.classList.contains('colocando')) return;
      const g = cercana(api.aMundo(ev));
      if (g) { ev.preventDefault(); ev.stopPropagation(); sel = g.id; armar(); api.dibujar(); }
      return;
    }
    ev.preventDefault(); ev.stopPropagation();
    const q = api.pegar(ev).p, w = api.aMundo(ev);
    switch (herr) {
      case 'v': agregar({ t: 'recta', p: { x: r3(q.x), y: 0 }, ang: 90 }, `Guía vertical en x = ${fmt(q.x)} m.`); break;
      case 'h': agregar({ t: 'recta', p: { x: 0, y: r3(q.y) }, ang: 0 }, `Guía horizontal en y = ${fmt(q.y)} m.`); break;
      case 'dos':
        if (!pts.length) { pts.push(q); api.mensaje(instr()); break; }
        if (Math.hypot(q.x - pts[0].x, q.y - pts[0].y) < 1e-3) { api.mensaje('Tocá otro punto.'); break; }
        { const r = rectaPorDosPuntos(pts[0], q); agregar({ t: 'recta', ...r }, `Guía a ${fmt(r.ang, 1)}°.`); }
        pts = []; break;
      case 'paralela': {
        if (!elegidas.length) { const g = cercana(w); if (!g) { api.mensaje('No hay una guía ahí: tocá sobre una.'); break; } elegidas = [g.id]; api.mensaje(instr()); break; }
        const g = guias().find(x => x.id === elegidas[0]);
        if (g) { const n = paralela(g, op.d, w); agregar(n.t === 'recta' ? { t: 'recta', p: n.p, ang: n.ang } : { t: 'circulo', c: n.c, r: n.r }, `Paralela a ${fmt(op.d)} m.`); }
        elegidas = []; break;
      }
      case 'compas':
        if (!pts.length) {
          if (op.r > 0) { agregar({ t: 'circulo', c: { x: r3(q.x), y: r3(q.y) }, r: op.r }, `Círculo de radio ${fmt(op.r)} m.`); break; }
          pts.push(q); api.mensaje(instr()); break;
        }
        { const r = r3(Math.hypot(q.x - pts[0].x, q.y - pts[0].y)); if (r > 1e-3) agregar({ t: 'circulo', c: { x: r3(pts[0].x), y: r3(pts[0].y) }, r }, `Círculo de radio ${fmt(r)} m.`); }
        pts = []; break;
      case 'ttr': {
        if (elegidas.length < 2) { const g = cercana(w, true); if (!g) { api.mensaje('Tocá sobre una recta guía.'); break; } if (!elegidas.includes(g.id)) elegidas.push(g.id); api.mensaje(instr()); armar(); api.dibujar(); break; }
        const [a, c] = elegidas.map(id => guias().find(x => x.id === id)) as GuiaRecta[];
        const r = a && c ? circuloTTR(a, c, op.r, w) : null;
        if (!r) api.mensaje('Las dos rectas son paralelas: no hay círculo tangente a las dos con un solo radio.');
        else agregar({ t: 'circulo', ...r }, `Círculo tangente a las dos rectas, radio ${fmt(op.r)} m.`);
        elegidas = []; break;
      }
      case 'tres':
        pts.push(q);
        if (pts.length === 3) { const c = circulo3p(pts[0], pts[1], pts[2]); if (!c) api.mensaje('Los tres puntos están alineados.'); else agregar({ t: 'circulo', ...c }, `Círculo de radio ${fmt(c.r)} m por tres puntos.`); pts = []; }
        else api.mensaje(instr());
        break;
      case 'borrar': { const g = cercana(w); if (!g) { api.mensaje('No hay una guía ahí.'); break; } estado.cambiar(p => { p.guias = (p.guias ?? []).filter(x => x.id !== g.id); }); api.mensaje('Guía borrada.'); break; }
    }
    armar(); api.dibujar();
  };
  svg.addEventListener('pointerdown', ev => { if (herr || abierto) alTocar(ev); });
  svg.addEventListener('pointermove', ev => { if (!herr) return; cursor = api.pegar(ev).p; api.pedirDibujo(); });
  document.addEventListener('keydown', ev => {
    if ((ev.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return;
    if (ev.key === 'Escape' && herr) { ev.stopImmediatePropagation(); if (pts.length || elegidas.length) { pts = []; elegidas = []; api.mensaje(instr()); api.dibujar(); } else poner(null); }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel && abierto && !herr) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      const id = sel; sel = null; estado.cambiar(p => { p.guias = (p.guias ?? []).filter(x => x.id !== id); }); api.mensaje('Guía borrada.'); armar();
    }
  }, true);

  // ---------------------------------------------------------------- panel
  const mk = <K extends keyof HTMLElementTagNameMap>(t: K, txt = '', cls = '') => { const e = document.createElement(t); if (txt) e.textContent = txt; if (cls) e.className = cls; return e; };
  const boton = (t: string, titulo: string, f: () => void, activo = false) => { const x = mk('button', t); x.type = 'button'; x.title = titulo; if (activo) x.classList.add('activo'); x.addEventListener('click', f); return x; };
  const fila = (...h: (Node | string)[]) => { const d = mk('div', '', 'col-fila'); d.append(...h); return d; };
  const campo = (etq: string, valor: string, f: (v: string) => void, ancho = 70) => { const l = mk('label', '', 'col-campo'); l.append(etq); const i = mk('input'); i.type = 'text'; i.value = valor; i.style.width = `${ancho}px`; i.addEventListener('change', () => f(i.value)); l.append(i); return l; };
  const campoN = (etq: string, v: number, f: (v: number) => void, ancho = 50) => campo(etq, String(v).replace('.', ','), t => { const x = num(t); if (isFinite(x)) f(x); armar(); }, ancho);
  const tilde = (etq: string, v: boolean, f: (v: boolean) => void) => { const l = mk('label', '', 'col-campo'); const i = mk('input'); i.type = 'checkbox'; i.checked = v; i.addEventListener('change', () => { f(i.checked); armar(); api.dibujar(); }); l.append(i, etq); return l; };
  const selNombres = (v: string, f: (v: 'letras' | 'numeros') => void) => { const s = mk('select'); [['letras', 'A, B, C…'], ['numeros', '1, 2, 3…']].forEach(([k, t]) => { const o = mk('option', t); o.value = k; s.append(o); }); s.value = v; s.addEventListener('change', () => f(s.value as 'letras' | 'numeros')); return s; };

  function armar() {
    b.setAttribute('aria-pressed', String(abierto));
    panel.hidden = !abierto;
    if (!abierto) return;
    panel.replaceChildren();
    const tit = mk('b', 'Guías'); tit.title = 'Tocá el título para plegar o desplegar el panel';
    const cerrar = boton('✕', 'Cerrar', () => { abierto = false; sel = null; poner(null); }); cerrar.className = 'col-cerrar';
    panel.append(tit, cerrar);
    if (herr) panel.append(mk('p', instr(), 'col-instr'));
    panel.append(mk('div', 'Grilla de ejes', 'col-sub'));
    panel.append(fila(campo('ejes en x', op.sepX, v => { op.sepX = v; }, 92), selNombres(op.nx, v => { op.nx = v; })));
    panel.append(fila(campo('ejes en y', op.sepY, v => { op.sepY = v; }, 92), selNombres(op.ny, v => { op.ny = v; })));
    panel.append(fila(tilde('centrada en la planta', op.centrar, v => { op.centrar = v; }), ...(op.centrar ? [] : [campoN('x₀', op.x0, v => { op.x0 = v; }, 40), campoN('y₀', op.y0, v => { op.y0 = v; }, 40)])));
    panel.append(mk('p', 'Separaciones entre ejes, como en el plano: «4 × 7,20» o «3,60; 7,20; 3,60».', 'col-nota'));
    const hayEjes = guias().some(g => g.t === 'recta' && g.deEjes);
    panel.append(fila(
      boton(hayEjes ? 'Rehacer la grilla' : 'Armar la grilla', 'Arma los ejes (reemplaza la grilla anterior; las otras guías quedan)', () => {
        const sx = leerSeparaciones(op.sepX), sy = leerSeparaciones(op.sepY);
        if (!sx || !sy) { api.mensaje('No entiendo las separaciones: escribilas como «4 × 7,20» o «3,60; 7,20».'); return; }
        estado.cambiar(p => { const otras = (p.guias ?? []).filter(g => !(g.t === 'recta' && g.deEjes)); p.guias = [...otras, ...ejesGrilla({ sepX: sx, sepY: sy, x0: op.x0, y0: op.y0, nombresX: op.nx, nombresY: op.ny, centrar: op.centrar }, otras)]; });
        api.mensaje(`Grilla de ${sx.length + 1} × ${sy.length + 1} ejes: el imán toma los cruces.`); armar();
      }),
      ...(hayEjes ? [boton('Quitar', 'Borra los ejes de la grilla', () => { estado.cambiar(p => { p.guias = (p.guias ?? []).filter(g => !(g.t === 'recta' && g.deEjes)); }); armar(); })] : [])));
    panel.append(mk('div', 'Líneas guía', 'col-sub'));
    panel.append(fila(
      boton('│ Vertical', 'Tocá por dónde pasa', () => poner(herr === 'v' ? null : 'v'), herr === 'v'),
      boton('─ Horizontal', 'Tocá por dónde pasa', () => poner(herr === 'h' ? null : 'h'), herr === 'h'),
      boton('Por 2 puntos', 'Recta con cualquier ángulo', () => poner(herr === 'dos' ? null : 'dos'), herr === 'dos')));
    panel.append(fila(boton('Paralela', 'Tocá una guía y el lado: va a la distancia indicada', () => poner(herr === 'paralela' ? null : 'paralela'), herr === 'paralela'), campoN('a', op.d, v => { op.d = v; }), 'm'));
    panel.append(mk('div', 'Círculos', 'col-sub'));
    panel.append(fila(
      boton('Compás', 'Centro y radio (con radio 0, el segundo toque da el radio)', () => poner(herr === 'compas' ? null : 'compas'), herr === 'compas'),
      boton('Tangente a 2', 'Círculo de radio dado tangente a dos rectas guía', () => poner(herr === 'ttr' ? null : 'ttr'), herr === 'ttr'),
      boton('Por 3 puntos', '', () => poner(herr === 'tres' ? null : 'tres'), herr === 'tres')));
    panel.append(fila(campoN('radio', op.r, v => { op.r = Math.max(0, v); }), 'm', mk('span', '(0 = el segundo toque)', 'col-nota')));
    panel.append(mk('div', 'Ver', 'col-sub'));
    panel.append(fila(tilde('ver guías', opGuias.ver, v => { opGuias.ver = v; }), tilde('imán a las guías', opGuias.iman, v => { opGuias.iman = v; })));
    const n = guias().length;
    panel.append(fila(boton('Borrar una', 'Tocá la guía a borrar', () => poner(herr === 'borrar' ? null : 'borrar'), herr === 'borrar'), boton(`Borrar todas (${n})`, '', () => { if (n && confirm(`¿Borrar las ${n} guías y ejes?`)) { estado.cambiar(p => { p.guias = []; }); sel = null; armar(); } })));
    // guía elegida: su posición
    const g = guias().find(x => x.id === sel);
    if (g) {
      panel.append(mk('div', g.t === 'recta' && g.eje ? `Eje ${g.eje}` : 'Guía elegida', 'col-sub'));
      const cambiar = (f: (x: Guia) => void) => { estado.cambiar(p => { const x = (p.guias ?? []).find(y => y.id === g.id); if (x) f(x); }); armar(); };
      if (g.t === 'recta' && g.ang === 90) panel.append(fila(campoN('x', g.p.x, v => cambiar(x => { if (x.t === 'recta') x.p = { x: v, y: 0 }; }), 60), 'm'));
      else if (g.t === 'recta' && g.ang === 0) panel.append(fila(campoN('y', g.p.y, v => cambiar(x => { if (x.t === 'recta') x.p = { x: 0, y: v }; }), 60), 'm'));
      else if (g.t === 'recta') panel.append(fila(campoN('x', g.p.x, v => cambiar(x => { if (x.t === 'recta') x.p = { ...x.p, x: v }; }), 50), campoN('y', g.p.y, v => cambiar(x => { if (x.t === 'recta') x.p = { ...x.p, y: v }; }), 50), campoN('ángulo', g.ang, v => cambiar(x => { if (x.t === 'recta') x.ang = v; }), 44), '°'));
      else panel.append(fila(campoN('x', g.c.x, v => cambiar(x => { if (x.t === 'circulo') x.c = { ...x.c, x: v }; }), 50), campoN('y', g.c.y, v => cambiar(x => { if (x.t === 'circulo') x.c = { ...x.c, y: v }; }), 50), campoN('r', g.r, v => cambiar(x => { if (x.t === 'circulo' && v > 0) x.r = v; }), 44)));
      if (g.t === 'recta') panel.append(fila(campo('nombre', g.eje ?? '', v => cambiar(x => { if (x.t === 'recta') { if (v.trim()) x.eje = v.trim(); else delete x.eje; } }), 50)));
      panel.append(fila(boton('Borrar esta guía', 'También: Supr', () => { const id = g.id; sel = null; estado.cambiar(p => { p.guias = (p.guias ?? []).filter(x => x.id !== id); }); armar(); })));
    } else panel.append(mk('p', 'Con el panel abierto, tocá una guía para cambiar su posición o borrarla.', 'col-nota'));
  }

  /** capa: guías, ejes con sus globos y vistas previas */
  function capa(v: Vista) {
    vista = v;
    if (!opGuias.ver) return;
    const gs = guias();
    if (!gs.length && !herr) return;
    const { X, Y, escala } = v;
    const w = svg.clientWidth || 600, h = svg.clientHeight || 500, x0 = X(0), y0 = Y(0);
    const bx0 = (0 - x0) / escala, bx1 = (w - x0) / escala, by0 = (y0 - h) / escala, by1 = y0 / escala;
    const g = el('g', { class: 'capa-guias' });
    const recorte = (p: Punto, ang: number): [Punto, Punto] | null => {
      const u = { x: Math.cos((ang * Math.PI) / 180), y: Math.sin((ang * Math.PI) / 180) };
      let t0 = -Infinity, t1 = Infinity;
      for (const [pp, uu, lo, hi] of [[p.x, u.x, bx0, bx1], [p.y, u.y, by0, by1]] as const) {
        if (Math.abs(uu) < 1e-12) { if (pp < lo || pp > hi) return null; continue; }
        const a = (lo - pp) / uu, c = (hi - pp) / uu; t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c));
      }
      return t0 < t1 ? [{ x: p.x + t0 * u.x, y: p.y + t0 * u.y }, { x: p.x + t1 * u.x, y: p.y + t1 * u.y }] : null;
    };
    gs.forEach(gu => {
      const elegida = gu.id === sel || elegidas.includes(gu.id);
      if (gu.t === 'circulo') { g.append(el('circle', { cx: X(gu.c.x), cy: Y(gu.c.y), r: gu.r * escala, class: 'guia' + (elegida ? ' sel' : '') })); return; }
      const seg = recorte(gu.p, gu.ang);
      if (!seg) return;
      g.append(el('line', { x1: X(seg[0].x), y1: Y(seg[0].y), x2: X(seg[1].x), y2: Y(seg[1].y), class: (gu.eje ? 'guia eje' : 'guia') + (elegida ? ' sel' : '') }));
      if (gu.eje) {
        // globo con el nombre del eje en el borde de arriba (verticales) o de la izquierda (horizontales)
        const vert = Math.abs(Math.sin((gu.ang * Math.PI) / 180)) > 0.7, t = Math.tan((gu.ang * Math.PI) / 180);
        let px: number, py: number;
        if (vert) { py = 60; const wy = (y0 - py) / escala; px = X(Math.abs(gu.ang - 90) < 1e-9 ? gu.p.x : gu.p.x + (wy - gu.p.y) / t); }
        else { px = 16; const wx = (px - x0) / escala; py = Y(gu.p.y + (wx - gu.p.x) * t); }
        if (px > 8 && px < w - 8 && py > 30 && py < h - 8) {
          g.append(el('circle', { cx: px, cy: py, r: 9, class: 'globo-eje' }));
          g.append(el('text', { x: px, y: py + 3.5, class: 'globo-txt', 'text-anchor': 'middle' }, gu.eje));
        }
      }
    });
    // vistas previas
    if (herr && cursor) {
      const c = cursor;
      if (herr === 'v' || herr === 'h') { const s = recorte(c, herr === 'v' ? 90 : 0); if (s) g.append(el('line', { x1: X(s[0].x), y1: Y(s[0].y), x2: X(s[1].x), y2: Y(s[1].y), class: 'guia previa' })); }
      if (herr === 'dos' && pts.length) { const r = rectaPorDosPuntos(pts[0], c); const s = recorte(r.p, r.ang); if (s) g.append(el('line', { x1: X(s[0].x), y1: Y(s[0].y), x2: X(s[1].x), y2: Y(s[1].y), class: 'guia previa' })); }
      if (herr === 'compas') { const ctr = pts[0] ?? c, r = pts.length ? Math.hypot(c.x - ctr.x, c.y - ctr.y) : op.r; if (r > 0) g.append(el('circle', { cx: X(ctr.x), cy: Y(ctr.y), r: r * escala, class: 'guia previa' })); }
      if (herr === 'tres' && pts.length === 2) { const cc = circulo3p(pts[0], pts[1], c); if (cc) g.append(el('circle', { cx: X(cc.c.x), cy: Y(cc.c.y), r: cc.r * escala, class: 'guia previa' })); }
      pts.forEach(q => g.append(el('circle', { cx: X(q.x), cy: Y(q.y), r: 3, class: 'camino-vert' })));
      g.append(el('circle', { cx: X(c.x), cy: Y(c.y), r: 4, class: 'cursor-colocar' }));
    }
    svg.insertBefore(g, svg.querySelector('g.muro') ?? null);
  }
  return { boton: b, capa, cerrar: () => { if (abierto || herr) { abierto = false; sel = null; herr = null; pts = []; elegidas = []; svg.classList.remove('colocando'); armar(); } }, refrescar: () => { if (abierto && !panel.contains(document.activeElement)) armar(); } };
}
