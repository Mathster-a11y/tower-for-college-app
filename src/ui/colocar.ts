/**
 * Herramientas de colocación de la planta (panel «Colocar») y cotas de medición («Cotas»).
 *
 * Colocar: mover y copiar con punto base, girar de a 90°, simetría, escalar, matrices rectangular, polar y sobre un
 * camino, alinear y distribuir, y caminos (dibujar con rectas y arcos, unir tramos, tomar del CAD).
 * Cotas: horizontales, verticales o alineadas, pegadas a los nodos de los muros (siguen al muro), y las medidas del
 * elemento elegido.
 */
import { estado, fmt } from './estado';
import { confirmar } from './tarjeta';
import type { Camino, Cota } from '../engine/modelo';
import type { Punto } from '../engine/silueta';
import {
  alinear, aplicar, bulgeTresPuntos, caja, cajaSel, caminoDesdeCAD, copiarCon, distribuir, invertirCamino, largoCamino, matrizCamino, matrizPolar,
  matrizRect, muroSobreCamino, perfilDesdeCamino, girarLibre, puntosCamino, resolver, unirCaminos, vacia, type Alineacion, type EjeSimetria, type Operacion, type Seleccion,
} from '../engine/colocar';
import { cotaDesdeCursor, geometria, idCota, puntoCota } from '../engine/cotas';
import { alargar, desfasar, esquina, partir, unir } from '../engine/editar';
import { motivoNoEditable } from '../engine/grupos';

export interface Vista { X: (x: number) => number; Y: (y: number) => number; escala: number }
export interface ApiPlanta {
  svg: SVGSVGElement;
  dock: HTMLElement;
  el: <K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Record<string, string | number>, txt?: string) => SVGElementTagNameMap[K];
  aMundo: (ev: PointerEvent) => Punto;
  pegar: (ev: PointerEvent) => { p: Punto; id?: string };
  dibujar: () => void;
  pedirDibujo: () => void;
  mensaje: (t: string) => void;
  /** lo elegido en la planta (selección múltiple, grupo o muro con su pieza) */
  seleccion: () => Seleccion;
  /** la planta deja de reaccionar a los toques (true) o vuelve a «Mover» (false) */
  activar: (on: boolean) => void;
  /** lleva la vista para que el punto quede en el centro, si está tapado o fuera de la pantalla */
  centrarEn?: (x: number, y: number) => void;
}

type Herr = null | 'cota' | 'mover' | 'copiar' | 'girar' | 'espejar' | 'escalar' | 'centro-polar' | 'camino' | 'cad' | 'desfase' | 'alargar' | 'partir' | 'unir' | 'esquina' | 'girar-libre' | 'medir';
const num = (t: string) => { const v = parseFloat(t.replace(',', '.')); return isFinite(v) ? v : NaN; };
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function montarColocar(api: ApiPlanta) {
  const { svg, el } = api;
  let herr: Herr = null;
  let vista: Vista = { X: x => x, Y: y => y, escala: 1 };
  /** puntos tomados en la operación en curso y el cursor (con imán) */
  let pts: { p: Punto; id?: string }[] = [];
  let cursor: Punto | null = null;
  // opciones
  const op = { vinculada: true, copias: 1, giro: 1 as 1 | 2 | 3, conservar: true, factor: 2, espesor: false, alineada: false, verCotas: true, cotasElegido: true,
    matriz: 'rect' as 'rect' | 'polar' | 'camino', filas: 2, cols: 3, dx: 3.6, dy: 3.6, n: 6, total: 360, girarCopias: true, cx: 0, cy: 0,
    curva: false, dDesf: 0.6, angLibre: 30, espCam: 0.25, camino: '', porPaso: false, paso: 3.6, nCam: 5, d0: 0, d1: 0, tangente: false, arco: false };
  let caminoNuevo: { v: Camino['v']; paso?: Punto; ctrl?: Punto[] } | null = null;
  const caminosSel = new Set<string>();
  let cotaSel: string | null = null;
  /** muros tocados en la edición en curso (desfase, alargar, unir, esquina) */
  let tocados: { id: string; q: Punto }[] = [];
  /** distancia tipeada (mover y copiar después del punto base) */
  let tipeo = '';
  const muroBajo = (ev: PointerEvent) => ((ev.target as Element).closest?.('g.muro') as SVGGElement | null)?.dataset.id;
  /** dirección del punto base al cursor, redondeada a 45° (como el rastreo polar de CAD) */
  const dir45 = (a: Punto, b: Punto) => { const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * (Math.PI / 4); return { x: Math.cos(ang), y: Math.sin(ang) }; };

  // ---------------------------------------------------------------- botones de la barra
  const bColocar = document.createElement('button'); bColocar.type = 'button'; bColocar.textContent = 'Colocar';
  bColocar.title = 'Mover y copiar con punto base, girar, simetría, escalar, matrices (rectangular, polar, sobre un camino), alinear y caminos';
  const bCotas = document.createElement('button'); bCotas.type = 'button'; bCotas.textContent = 'Cotas';
  bCotas.title = 'Cotas de medición: tocá dos puntos (se pegan a los nodos de los muros) y después dónde va la línea de cota';
  let panelAbierto: 'colocar' | 'cotas' | null = null;
  const abrir = (q: typeof panelAbierto) => {
    panelAbierto = panelAbierto === q ? null : q;
    if (panelAbierto) document.dispatchEvent(new CustomEvent('torre:panel-planta', { detail: 'colocar' }));
    panel.classList.remove('plegado');
    poner(panelAbierto === 'cotas' ? 'cota' : null);
    armar();
  };
  document.addEventListener('torre:panel-planta', ev => { if ((ev as CustomEvent).detail !== 'colocar' && (panelAbierto || herr)) { panelAbierto = null; herr = null; pts = []; caminoNuevo = null; svg.classList.remove('colocando'); armar(); } });
  bColocar.addEventListener('click', () => abrir('colocar'));
  bCotas.addEventListener('click', () => abrir('cotas'));

  const panel = document.createElement('div');
  panel.className = 'calco-panel colocar-panel';
  panel.hidden = true;
  api.dock.appendChild(panel);

  const poner = (h: Herr) => {
    herr = h; pts = []; tocados = []; tipeo = ''; cursor = null; caminoNuevo = h === 'camino' ? { v: [] } : null;
    api.activar(!!h);
    svg.classList.toggle('colocando', !!h);
    api.dibujar();
    armar();
  };
  const salir = () => { panelAbierto = null; poner(null); };

  const instruccion = (): string => {
    switch (herr) {
      case 'cota': return pts.length === 0 ? 'Cota: tocá el primer punto (se pega a esquinas, medios y centros).' : pts.length === 1 ? 'Tocá el segundo punto.' : 'Tocá dónde va la línea de cota.';
      case 'mover': case 'copiar': return pts.length === 0 ? `${herr === 'mover' ? 'Mover' : 'Copiar'}: tocá el punto base.` : tipeo ? `Distancia: ${tipeo} m · Enter aplica en la dirección del cursor (de a 45°).` : 'Tocá el destino (con imán) o escribí la distancia y Enter.';
      case 'desfase': return tocados.length ? `Tocá de qué lado va la copia (a ${fmt(op.dDesf)} m).` : `Desfase: tocá el muro (copia paralela a ${fmt(op.dDesf)} m).`;
      case 'alargar': return tocados.length ? 'Tocá hasta dónde llega (una guía, otro muro o un punto).' : 'Alargar o recortar: tocá el muro cerca de la punta que cambia.';
      case 'partir': return 'Partir: tocá el muro donde se corta.';
      case 'unir': return tocados.length ? 'Tocá el segundo tramo (alineado y del mismo espesor).' : 'Unir: tocá el primer tramo.';
      case 'esquina': return tocados.length ? 'Tocá el segundo muro (perpendicular).' : 'Esquina: tocá el muro que pasa de largo.';
      case 'girar': return 'Girar: tocá el centro del giro.';
      case 'girar-libre': return `Girar ${fmt(op.angLibre, 1)}°: tocá el centro del giro.`;
      case 'medir': return pts.length ? 'Tocá el segundo punto.' : 'Medir: tocá el primer punto.';
      case 'espejar': return pts.length === 0 ? 'Simetría: tocá el primer punto del eje.' : 'Tocá el segundo punto del eje (queda horizontal, vertical o a 45°).';
      case 'escalar': return 'Escalar: tocá el punto base.';
      case 'centro-polar': return 'Tocá el centro de la matriz polar.';
      case 'camino': return op.curva && caminoNuevo?.v.length ? `Bézier: tocá el ${['primer punto de control', 'segundo punto de control', 'final de la curva'][caminoNuevo.ctrl?.length ?? 0]}.` : op.arco ? (caminoNuevo?.paso ? 'Arco: tocá el final del arco.' : caminoNuevo?.v.length ? 'Arco: tocá un punto por donde pasa.' : 'Tocá el inicio del camino.') : caminoNuevo?.v.length ? 'Tocá el próximo punto · Enter o doble toque termina · Esc cancela.' : 'Tocá el inicio del camino.';
      case 'cad': return 'Tocá una línea, arco o polilínea del dibujo de CAD para pasarla a camino.';
      default: return '';
    }
  };

  // ---------------------------------------------------------------- ejecutar
  const hacer = (f: () => string | null | void, ok: string) => {
    let err: string | null | void = null;
    estado.cambiar(() => { err = f(); });
    estado.limpiarGrupos();
    api.mensaje(err || estado.avisoGrupos || ok);
    estado.avisarPanel();
  };
  const sel = () => api.seleccion();
  const conSel = (f: (s: Seleccion) => string | null | void, ok: string) => {
    const s = sel();
    if (vacia(s)) { api.mensaje('Primero elegí qué colocar: un muro, un grupo, o varios con el lazo.'); return; }
    hacer(() => f(s), ok);
  };
  const operar = (o: Operacion, copia: boolean) => conSel(s => {
    if (!copia) return aplicar(estado.proyecto, s, o);
    const n = o.t === 'mover' ? Math.max(1, Math.round(op.copias)) : 1;
    for (let k = 1; k <= n; k++) {
      const oo: Operacion = o.t === 'mover' ? { t: 'mover', dx: r3(o.dx * k), dy: r3(o.dy * k) } : o;
      const r = copiarCon(estado.proyecto, s, estado.contexto, oo, op.vinculada);
      if ('error' in r) return r.error;
      if (k === 1) { s = { m: [], g: [r.original] }; }
    }
    return null;
  }, copia ? `Copia${op.vinculada ? ' vinculada' : ''} lista.` : 'Listo.');

  const ejeDesdePuntos = (a: Punto, b: Punto): { eje: EjeSimetria; c: Punto } => {
    const ang = ((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 360) % 180;
    const cand: [number, EjeSimetria][] = [[0, 'y'], [90, 'x'], [45, 'd1'], [135, 'd2'], [180, 'y']];
    const eje = cand.sort((u, v) => Math.abs(u[0] - ang) - Math.abs(v[0] - ang))[0][1];
    return { eje, c: a };
  };

  const alTocar = (ev: PointerEvent) => {
    if (!herr) return;
    if (ev.button !== 0) return;
    ev.preventDefault(); ev.stopPropagation();
    const t = api.pegar(ev);
    const q = t.p;
    switch (herr) {
      case 'cota': {
        // tocar una cota existente la elige
        const tg = (ev.target as Element).closest?.('[data-cota]');
        if (tg && !pts.length) { cotaSel = tg.getAttribute('data-cota'); api.mensaje(`Cota elegida: Supr la borra.`); api.dibujar(); return; }
        if (pts.length < 2) { pts.push(t); api.mensaje(instruccion()); api.dibujar(); return; }
        const a = pts[0], b = pts[1], cc = cotaDesdeCursor(a.p, b.p, api.aMundo(ev), op.alineada);
        if (Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y) < 1e-4) { pts = []; api.mensaje('Los dos puntos son el mismo: empezá de nuevo.'); return; }
        const ct: Cota = { id: idCota(estado.proyecto), a: puntoCota(a.p, estado.proyecto.muros, a.id), b: puntoCota(b.p, estado.proyecto.muros, b.id), ...cc };
        estado.cambiar(p => { (p.cotas ??= []).push(ct); });
        pts = []; api.mensaje(`Cota de ${fmt(geometria(estado.proyecto, ct).valor)} m. Seguí con la próxima o Esc para terminar.`);
        api.dibujar(); return;
      }
      case 'mover': case 'copiar':
        if (!pts.length) { pts.push(t); api.mensaje(instruccion()); return; }
        operar({ t: 'mover', dx: r3(q.x - pts[0].p.x), dy: r3(q.y - pts[0].p.y) }, herr === 'copiar');
        poner(null); return;
      case 'girar': operar({ t: 'girar', c: q, q: op.giro }, false); poner(null); return;
      case 'espejar':
        if (!pts.length) { pts.push(t); api.mensaje(instruccion()); return; }
        { const e = ejeDesdePuntos(pts[0].p, q); operar({ t: 'espejar', eje: e.eje, c: e.c }, op.conservar); }
        poner(null); return;
      case 'girar-libre': {
        const s0 = sel(), n = resolver(estado.proyecto, s0).ids.size;
        if (!n) { api.mensaje('Primero elegí qué girar.'); poner(null); return; }
        const tabs = estado.proyecto.muros.filter(m => resolver(estado.proyecto, s0).ids.has(m.id) && m.tipo !== 'perfil' && !m.perfil).length;
        const ang = op.angLibre, centro = q;
        poner(null);
        const seguir = () => hacer(() => { const r = girarLibre(estado.proyecto, s0, centro, ang); return 'error' in r ? r.error : null; }, `Girado ${fmt(ang, 1)}°${tabs ? `: ${tabs} muro${tabs > 1 ? 's pasaron' : ' pasó'} a perfil irregular (en diagonal)` : ''}.`);
        if (tabs && Math.abs(ang % 90) > 1e-9) void confirmar('Cambia de categoría', `Con ${fmt(ang, 1)}° los muros quedan en diagonal: ${tabs} tabique${tabs > 1 ? 's' : ''} o tubo${tabs > 1 ? 's' : ''} pasa${tabs > 1 ? 'n' : ''} a ser perfil irregular (en la hoja J entra con su rectángulo equivalente; aparece J xy). ¿Seguir?`, 'Girar y convertir').then(ok => { if (ok) seguir(); });
        else seguir();
        return;
      }
      case 'medir': {
        if (!pts.length) { pts.push(t); api.mensaje(instruccion()); api.dibujar(); return; }
        const a = pts[0].p, dx = q.x - a.x, dy = q.y - a.y;
        api.mensaje(`Distancia ${fmt(Math.hypot(dx, dy), 3)} m · Δx ${fmt(dx, 3)} · Δy ${fmt(dy, 3)} · ángulo ${fmt(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, 1)}°`);
        pts = []; api.dibujar(); return;
      }
      case 'escalar': operar({ t: 'escalar', c: q, f: op.factor, espesor: op.espesor }, false); poner(null); return;
      case 'centro-polar': op.cx = r3(q.x); op.cy = r3(q.y); poner(null); api.mensaje(`Centro de la matriz polar en (${fmt(op.cx)}; ${fmt(op.cy)}).`); return;
      case 'camino': {
        const cn = caminoNuevo!;
        if (op.curva && cn.v.length) {
          // Bézier: dos puntos de control y el final
          cn.ctrl = [...(cn.ctrl ?? []), q];
          if (cn.ctrl.length < 3) { api.mensaje(instruccion()); api.dibujar(); return; }
          const u = cn.v[cn.v.length - 1], [c1, c2, fin] = cn.ctrl;
          u.c1 = { x: r3(c1.x), y: r3(c1.y) }; u.c2 = { x: r3(c2.x), y: r3(c2.y) }; delete u.b;
          cn.ctrl = undefined;
          cn.v.push({ x: r3(fin.x), y: r3(fin.y) });
          api.mensaje(instruccion()); api.dibujar(); return;
        }
        if (op.arco && cn.v.length) {
          if (!cn.paso) { cn.paso = q; api.mensaje(instruccion()); api.dibujar(); return; }
          const u = cn.v[cn.v.length - 1];
          u.b = bulgeTresPuntos(u, cn.paso, q);
          cn.paso = undefined;
        }
        const u = cn.v[cn.v.length - 1];
        if (u && Math.hypot(u.x - q.x, u.y - q.y) < 1e-4) { terminarCamino(); return; }   // doble toque en el mismo punto: termina
        cn.v.push({ x: r3(q.x), y: r3(q.y) });
        api.mensaje(instruccion()); api.dibujar(); return;
      }
      case 'desfase': case 'alargar': case 'unir': case 'esquina': case 'partir': {
        const id = muroBajo(ev);
        if (id && !(herr === 'alargar' && tocados.length)) { const mm = estado.proyecto.muros.find(x => x.id === id), mot = mm && motivoNoEditable(estado.proyecto, mm, estado.contexto); if (mot) { api.mensaje(mot); return; } }
        const w = api.aMundo(ev);
        if (herr === 'partir') {
          if (!id) { api.mensaje('Tocá sobre un muro.'); return; }
          hacer(() => { const r = partir(estado.proyecto, id, q); return 'error' in r ? r.error : null; }, `${id} partido en dos.`);
          return;
        }
        if (!tocados.length || (herr === 'unir' || herr === 'esquina') && tocados.length === 1 && id && id !== tocados[0].id) {
          if (herr === 'alargar' && tocados.length) { /* segundo toque: el borde */ }
          else {
            if (!id) { api.mensaje('Tocá sobre un muro.'); return; }
            tocados.push({ id, q: w });
            if (herr === 'unir' && tocados.length === 2) { const [a, c] = tocados; tocados = []; hacer(() => unir(estado.proyecto, a.id, c.id), `${c.id} unido a ${a.id}.`); return; }
            if (herr === 'esquina' && tocados.length === 2) { const [a, c] = tocados; tocados = []; hacer(() => esquina(estado.proyecto, a.id, c.id), `Esquina entre ${a.id} y ${c.id}.`); return; }
            api.mensaje(instruccion()); armar(); api.dibujar(); return;
          }
        }
        const t0 = tocados[0];
        tocados = [];
        if (herr === 'desfase') hacer(() => { const r = desfasar(estado.proyecto, t0.id, op.dDesf, w); return 'error' in r ? r.error : null; }, `Copia de ${t0.id} a ${fmt(op.dDesf)} m. Tocá otro muro para seguir.`);
        else if (herr === 'alargar') hacer(() => alargar(estado.proyecto, t0.id, t0.q, q), `${t0.id} llega hasta el punto elegido.`);
        return;
      }
      case 'cad': {
        const cad = estado.cad;
        if (!cad) { api.mensaje('No hay un dibujo de CAD importado («Importar…»).'); return; }
        const w = api.aMundo(ev);
        let mejor: { d: number; i: number } | null = null;
        cad.ents.forEach((e, i) => {
          if (cad.capas[e.capa] && !cad.capas[e.capa].ver) return;
          const c = caminoDesdeCAD(e, '', '');
          const ps = puntosCamino(c, 3);
          for (let k = 1; k < ps.length; k++) { const d = distSeg(w, ps[k - 1], ps[k]); if (!mejor || d < mejor.d) mejor = { d, i }; }
        });
        const m = mejor as { d: number; i: number } | null;
        if (!m || m.d * vista.escala > 14) { api.mensaje('No hay una línea del CAD cerca: acercá el zoom y tocá sobre la línea.'); return; }
        const id = idCamino();
        estado.cambiar(p => { (p.caminos ??= []).push(caminoDesdeCAD(cad.ents[m.i], id, `Camino ${id.slice(1)}`)); });
        caminosSel.add(id);
        api.mensaje(`«Camino ${id.slice(1)}» tomado del CAD y elegido. Tocá otros tramos y después «Unir elegidos».`);
        armar(); api.dibujar(); return;
      }
    }
  };
  const distSeg = (q: Punto, a: Punto, b: Punto) => { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L)) : 0; return Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy); };
  const idCamino = () => { const u = new Set((estado.proyecto.caminos ?? []).map(c => c.id)); for (let k = 1; ; k++) if (!u.has(`R${k}`)) return `R${k}`; };
  const terminarCamino = (cerrar = false) => {
    const cn = caminoNuevo;
    if (!cn || cn.v.length < 2) { api.mensaje('Un camino necesita al menos dos puntos.'); return; }
    const id = idCamino();
    const v = cn.v.map((q, i) => (i === cn.v.length - 1 && !cerrar ? { x: q.x, y: q.y } : q));
    estado.cambiar(p => { (p.caminos ??= []).push({ id, nombre: `Camino ${id.slice(1)}`, v, cerrado: cerrar }); });
    op.camino = id;
    const L = largoCamino({ id, nombre: '', v, cerrado: cerrar });
    api.mensaje(`«Camino ${id.slice(1)}» listo: ${fmt(L)} m. Se puede usar en «Matriz sobre un camino».`);
    caminoNuevo = { v: [] };
    armar(); api.dibujar();
  };

  svg.addEventListener('pointerdown', ev => { if (herr) alTocar(ev); });
  svg.addEventListener('pointermove', ev => {
    if (!herr) return;
    const t = herr === 'cota' && pts.length === 2 ? { p: api.aMundo(ev) } : api.pegar(ev);
    cursor = t.p; api.pedirDibujo();
  });
  document.addEventListener('keydown', ev => {
    if ((ev.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return;
    if (ev.key === 'Escape' && herr) {
      ev.stopImmediatePropagation();
      if (herr === 'camino' && caminoNuevo && caminoNuevo.v.length >= 2) { terminarCamino(); poner(null); return; }
      if (pts.length) { pts = []; api.mensaje(instruccion()); api.dibujar(); return; }
      if (herr === 'cota') { salir(); return; }
      poner(null); return;
    }
    if ((herr === 'mover' || herr === 'copiar') && pts.length === 1) {
      if (/^[0-9.,]$/.test(ev.key)) { ev.preventDefault(); ev.stopImmediatePropagation(); tipeo += ev.key === '.' ? ',' : ev.key; api.mensaje(instruccion()); armar(); api.pedirDibujo(); return; }
      if (ev.key === 'Backspace' && tipeo) { ev.preventDefault(); ev.stopImmediatePropagation(); tipeo = tipeo.slice(0, -1); api.mensaje(instruccion()); armar(); return; }
      if (ev.key === 'Enter' && tipeo && cursor) {
        ev.preventDefault();
        const L = num(tipeo), d = dir45(pts[0].p, cursor);
        if (isFinite(L) && L > 0) { const h = herr; operar({ t: 'mover', dx: r3(d.x * L), dy: r3(d.y * L) }, h === 'copiar'); poner(null); }
        return;
      }
    }
    if (ev.key === 'Enter' && herr === 'camino') { ev.preventDefault(); terminarCamino(); poner(null); return; }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && cotaSel && herr === 'cota') {
      ev.preventDefault(); ev.stopImmediatePropagation();
      const id = cotaSel; cotaSel = null;
      estado.cambiar(p => { p.cotas = (p.cotas ?? []).filter(c => c.id !== id); });
      api.mensaje('Cota borrada.'); api.dibujar();
    }
  }, true);

  // ---------------------------------------------------------------- panel
  const mk = <K extends keyof HTMLElementTagNameMap>(t: K, txt = '', cls = '') => { const e = document.createElement(t); if (txt) e.textContent = txt; if (cls) e.className = cls; return e; };
  const boton = (t: string, titulo: string, f: () => void, activo = false) => { const b = mk('button', t); b.type = 'button'; b.title = titulo; if (activo) b.classList.add('activo'); b.addEventListener('click', f); return b; };
  const campoN = (etq: string, valor: number, f: (v: number) => void, ancho = 56, unidad = '') => {
    const l = mk('label', '', 'col-campo'); l.append(etq);
    const i = mk('input'); i.type = 'text'; i.inputMode = 'decimal'; i.value = String(valor).replace('.', ','); i.style.width = `${ancho}px`;
    i.addEventListener('change', () => { const v = num(i.value); if (isFinite(v)) f(v); else i.value = String(valor).replace('.', ','); });
    l.append(i); if (unidad) l.append(unidad); return l;
  };
  const tilde = (etq: string, v: boolean, f: (v: boolean) => void, titulo = '') => { const l = mk('label', '', 'col-campo'); const i = mk('input'); i.type = 'checkbox'; i.checked = v; i.addEventListener('change', () => { f(i.checked); armar(); api.dibujar(); }); l.append(i, etq); if (titulo) l.title = titulo; return l; };
  const fila = (...h: (Node | string)[]) => { const d = mk('div', '', 'col-fila'); d.append(...h); return d; };
  const sub = (t: string) => mk('div', t, 'col-sub');

  function armar() {
    if (panelAbierto === null) { panel.hidden = true; bColocar.setAttribute('aria-pressed', 'false'); bCotas.setAttribute('aria-pressed', 'false'); return; }
    bColocar.setAttribute('aria-pressed', String(panelAbierto === 'colocar'));
    bCotas.setAttribute('aria-pressed', String(panelAbierto === 'cotas'));
    panel.hidden = false;
    panel.replaceChildren();
    const tit = mk('b', panelAbierto === 'cotas' ? 'Cotas' : 'Colocar');
    const cerrar = boton('✕', 'Cerrar', salir); cerrar.className = 'col-cerrar';
    tit.title = 'Tocá el título para plegar o desplegar el panel (deja ver la planta)';
    panel.append(tit, cerrar);
    if (herr) panel.append(mk('p', instruccion(), 'col-instr'));
    if (panelAbierto === 'cotas') { armarCotas(); return; }
    // con una herramienta en uso, el panel se achica a la instrucción (no tapa la planta)
    if (herr) {
      panel.classList.add('compacto');
      const extra: HTMLElement[] = [];
      if (herr === 'camino') extra.push(tilde('arco', op.arco, v => { op.arco = v; if (v) op.curva = false; if (caminoNuevo) { caminoNuevo.paso = undefined; caminoNuevo.ctrl = undefined; } }), tilde('Bézier', op.curva, v => { op.curva = v; if (v) op.arco = false; if (caminoNuevo) { caminoNuevo.paso = undefined; caminoNuevo.ctrl = undefined; } }), boton('Terminar', 'Enter', () => { terminarCamino(); poner(null); }), boton('Cerrar', 'Cierra el camino', () => { terminarCamino(true); poner(null); }));
      if (herr === 'desfase') extra.push(campoN('a', op.dDesf, v => { op.dDesf = v; }, 44, 'm'));
      if (herr === 'girar-libre') extra.push(campoN('ángulo', op.angLibre, v => { op.angLibre = v; }, 44, '°'));
      if (herr === 'escalar') extra.push(campoN('factor', op.factor, v => { op.factor = v; }, 44));
      panel.append(fila(...extra, boton('Cancelar', 'Esc', () => poner(null))));
      return;
    }
    panel.classList.remove('compacto');
    const s = sel(), n = resolver(estado.proyecto, s).ids.size;
    panel.append(mk('p', n ? `Elegido: ${n} muro${n > 1 ? 's' : ''}${s.g.length ? ` en ${s.g.length} grupo${s.g.length > 1 ? 's' : ''}` : ''}.` : 'Elegí un muro, un grupo o varios con el lazo.', 'col-nota'));
    // transformar
    panel.append(sub('Transformar'));
    panel.append(fila(
      boton('Mover', 'Punto base → destino', () => poner(herr === 'mover' ? null : 'mover'), herr === 'mover'),
      boton('Copiar', 'Punto base → destino; deja el original', () => poner(herr === 'copiar' ? null : 'copiar'), herr === 'copiar'),
      campoN('copias', op.copias, v => { op.copias = Math.max(1, Math.round(v)); }, 36)));
    panel.append(fila(
      boton('Girar', 'Elegí el ángulo y tocá el centro', () => poner(herr === 'girar' ? null : 'girar'), herr === 'girar'),
      ...([1, 2, 3] as const).map(g => boton(`${g * 90}°`, `Girar ${g * 90}° antihorario`, () => { op.giro = g; armar(); }, op.giro === g))));
    panel.append(fila(
      boton('Girar libre', 'Cualquier ángulo (tocá el centro): los tabiques pasan a perfil irregular en diagonal', () => poner(herr === 'girar-libre' ? null : 'girar-libre'), herr === 'girar-libre'),
      campoN('ángulo', op.angLibre, v => { op.angLibre = v; }, 44, '°')));
    panel.append(fila(
      boton('Simetría', 'Tocá dos puntos del eje (horizontal, vertical o a 45°)', () => poner(herr === 'espejar' ? null : 'espejar'), herr === 'espejar'),
      boton('│ centro', 'Eje vertical por el centro de lo elegido', () => { const k = cajaSel(estado.proyecto, sel()); operar({ t: 'espejar', eje: 'x', c: { x: k.cx, y: k.cy } }, op.conservar); }),
      boton('─ centro', 'Eje horizontal por el centro de lo elegido', () => { const k = cajaSel(estado.proyecto, sel()); operar({ t: 'espejar', eje: 'y', c: { x: k.cx, y: k.cy } }, op.conservar); }),
      boton('x = 0', 'Eje vertical del edificio', () => operar({ t: 'espejar', eje: 'x', c: { x: 0, y: 0 } }, op.conservar)),
      boton('y = 0', 'Eje horizontal del edificio', () => operar({ t: 'espejar', eje: 'y', c: { x: 0, y: 0 } }, op.conservar))));
    panel.append(fila(tilde('conservar el original (copia)', op.conservar, v => { op.conservar = v; }, 'En la simetría: deja el original y agrega la copia espejada')));
    panel.append(fila(
      boton('Escalar', 'Tocá el punto base', () => poner(herr === 'escalar' ? null : 'escalar'), herr === 'escalar'),
      campoN('factor', op.factor, v => { op.factor = v; }, 44),
      tilde('espesores', op.espesor, v => { op.espesor = v; }, 'Si no se marca, el espesor de los muros no cambia')));
    panel.append(fila(tilde('copias vinculadas', op.vinculada, v => { op.vinculada = v; }, 'Las copias son del mismo componente: si se edita una, cambian todas')));
    // edición de muros
    panel.append(sub('Editar muros'));
    panel.append(fila(
      boton('Desfase', 'Copia paralela del muro a la distancia indicada', () => poner(herr === 'desfase' ? null : 'desfase'), herr === 'desfase'),
      campoN('a', op.dDesf, v => { op.dDesf = v; }, 44, 'm'),
      boton('Partir', 'Corta el muro en dos donde lo toques', () => poner(herr === 'partir' ? null : 'partir'), herr === 'partir')));
    panel.append(fila(
      boton('Alargar / recortar', 'Lleva la punta del muro hasta una guía, otro muro o un punto', () => poner(herr === 'alargar' ? null : 'alargar'), herr === 'alargar'),
      boton('Unir', 'Junta dos tramos alineados del mismo espesor', () => poner(herr === 'unir' ? null : 'unir'), herr === 'unir'),
      boton('Esquina', 'Arma la esquina entre dos muros perpendiculares', () => poner(herr === 'esquina' ? null : 'esquina'), herr === 'esquina')));
    // matrices
    panel.append(sub('Matriz'));
    const seg = mk('div', '', 'seg chico col-seg');
    ([['rect', 'Rectangular'], ['polar', 'Polar'], ['camino', 'Sobre camino']] as const).forEach(([k, t]) => { const b = boton(t, '', () => { op.matriz = k; armar(); }); b.setAttribute('aria-pressed', String(op.matriz === k)); seg.append(b); });
    panel.append(seg);
    if (op.matriz === 'rect') {
      panel.append(fila(campoN('filas', op.filas, v => { op.filas = v; }, 36), campoN('col.', op.cols, v => { op.cols = v; }, 36)));
      panel.append(fila(campoN('dx', op.dx, v => { op.dx = v; }, 50, 'm'), campoN('dy', op.dy, v => { op.dy = v; }, 50, 'm')));
      panel.append(fila(boton('Hacer la matriz', 'El original queda abajo a la izquierda', () => conSel(s => { const r = matrizRect(estado.proyecto, s, estado.contexto, op.filas, op.cols, op.dx, op.dy, op.vinculada); return 'error' in r ? r.error : null; }, `Matriz de ${op.filas} × ${op.cols} lista (un grupo).`))));
    } else if (op.matriz === 'polar') {
      panel.append(fila(campoN('cantidad', op.n, v => { op.n = v; }, 36), campoN('ángulo', op.total, v => { op.total = v; }, 44, '°')));
      panel.append(fila(campoN('centro x', op.cx, v => { op.cx = v; }, 46), campoN('y', op.cy, v => { op.cy = v; }, 46), boton('Tocar', 'Elegir el centro en la planta', () => poner('centro-polar'), herr === 'centro-polar')));
      panel.append(fila(tilde('girar las copias', op.girarCopias, v => { op.girarCopias = v; }, 'Solo con pasos de 90°; con otros ángulos quedarían en diagonal')));
      panel.append(fila(boton('Hacer la matriz', '', () => conSel(s => { const r = matrizPolar(estado.proyecto, s, estado.contexto, { x: op.cx, y: op.cy }, op.n, op.total, op.girarCopias, op.vinculada); if ('error' in r) return r.error; if (r.aviso) setTimeout(() => api.mensaje(r.aviso!), 0); return null; }, `Matriz polar de ${op.n} lista (un grupo).`))));
    } else {
      const cs = estado.proyecto.caminos ?? [];
      if (!cs.length) panel.append(mk('p', 'Todavía no hay caminos: dibujá uno abajo, en «Caminos».', 'col-nota'));
      else {
        const s2 = mk('select'); cs.forEach(c => { const o = mk('option', `${c.nombre} · ${fmt(largoCamino(c))} m`); o.value = c.id; s2.append(o); });
        if (!cs.some(c => c.id === op.camino)) op.camino = cs[cs.length - 1].id;
        s2.value = op.camino; s2.addEventListener('change', () => { op.camino = s2.value; api.dibujar(); });
        panel.append(fila(s2));
        panel.append(fila(tilde('por paso', op.porPaso, v => { op.porPaso = v; }), op.porPaso ? campoN('paso', op.paso, v => { op.paso = v; }, 46, 'm') : campoN('cantidad', op.nCam, v => { op.nCam = v; }, 36)));
        panel.append(fila(campoN('desfase inicio', op.d0, v => { op.d0 = v; }, 40, 'm'), campoN('fin', op.d1, v => { op.d1 = v; }, 40, 'm')));
        panel.append(fila(tilde('girar con la tangente (de a 90°)', op.tangente, v => { op.tangente = v; })));
        panel.append(fila(boton('Hacer la matriz', 'El original va al inicio del camino', () => conSel(s => { const c = cs.find(x => x.id === op.camino); if (!c) return 'Elegí un camino.'; const r = matrizCamino(estado.proyecto, s, estado.contexto, c, { n: op.porPaso ? undefined : op.nCam, paso: op.porPaso ? op.paso : undefined, d0: op.d0, d1: op.d1, tangente: op.tangente, vinculada: op.vinculada }); return 'error' in r ? r.error : null; }, 'Matriz sobre el camino lista (un grupo).'))));
      }
    }
    // alinear
    panel.append(sub('Alinear y distribuir'));
    const al = (t: string, a: Alineacion, titulo: string) => boton(t, titulo, () => conSel(s => alinear(estado.proyecto, s, a), 'Alineados.'));
    panel.append(fila(al('⇤', 'izq', 'Alinear a la izquierda'), al('↔', 'cx', 'Centrar en x'), al('⇥', 'der', 'Alinear a la derecha'), al('⤒', 'arriba', 'Alinear arriba'), al('↕', 'cy', 'Centrar en y'), al('⤓', 'abajo', 'Alinear abajo')));
    panel.append(fila(boton('Repartir ↔', 'Misma separación en x (quedan fijos los de las puntas)', () => conSel(s => distribuir(estado.proyecto, s, 'h'), 'Repartidos.')), boton('Repartir ↕', 'Misma separación en y', () => conSel(s => distribuir(estado.proyecto, s, 'v'), 'Repartidos.'))));
    // caminos
    panel.append(sub('Caminos'));
    panel.append(fila(
      boton(herr === 'camino' ? 'Terminar' : 'Dibujar camino', 'Tocá los puntos; con «arco», cada tramo pide un punto de paso y el final', () => { if (herr === 'camino') { terminarCamino(); poner(null); } else poner('camino'); }, herr === 'camino'),
      tilde('arco', op.arco, v => { op.arco = v; if (v) op.curva = false; if (caminoNuevo) { caminoNuevo.paso = undefined; caminoNuevo.ctrl = undefined; } }), tilde('Bézier', op.curva, v => { op.curva = v; if (v) op.arco = false; if (caminoNuevo) { caminoNuevo.paso = undefined; caminoNuevo.ctrl = undefined; } }),
      ...(herr === 'camino' ? [boton('Cerrar', 'Cierra el camino volviendo al primer punto', () => { terminarCamino(true); poner(null); })] : [])));
    panel.append(fila(boton('Tomar del CAD', 'Tocá líneas, arcos o polilíneas del dibujo de CAD importado', () => poner(herr === 'cad' ? null : 'cad'), herr === 'cad'),
      boton(`Unir elegidos${caminosSel.size ? ` (${caminosSel.size})` : ''}`, 'Junta en un solo camino los tramos elegidos que se tocan (a menos de 1 cm)', () => {
        const cs = (estado.proyecto.caminos ?? []).filter(c => caminosSel.has(c.id));
        const r = unirCaminos(cs);
        if ('error' in r) { api.mensaje(r.error); return; }
        const id = idCamino();
        hacer(() => { const p = estado.proyecto; p.caminos = [...(p.caminos ?? []).filter(c => !caminosSel.has(c.id)), { id, nombre: `Camino ${id.slice(1)}`, ...r }]; }, `${cs.length} tramos unidos en «Camino ${id.slice(1)}»${r.cerrado ? ' (cerrado)' : ''}: ${fmt(largoCamino({ id, nombre: '', ...r }))} m.`);
        caminosSel.clear(); op.camino = id; armar();
      })));
    panel.append(fila(campoN('espesor del muro sobre un camino', op.espCam, v => { op.espCam = v; }, 44, 'm')));
    const lista = mk('div', '', 'col-lista');
    (estado.proyecto.caminos ?? []).forEach(c => {
      const f = mk('div', '', 'col-camino' + (caminosSel.has(c.id) ? ' sel' : ''));
      const ch = mk('input'); ch.type = 'checkbox'; ch.checked = caminosSel.has(c.id); ch.title = 'Elegir para unir';
      ch.addEventListener('change', () => { if (ch.checked) caminosSel.add(c.id); else caminosSel.delete(c.id); armar(); api.dibujar(); });
      f.append(ch, mk('span', `${c.nombre} · ${fmt(largoCamino(c))} m${c.cerrado ? ' · cerrado' : ''}`),
        c.cerrado ? boton('▣', 'Perfil irregular con este contorno', () => hacer(() => { const r = perfilDesdeCamino(estado.proyecto, c, estado.contexto ?? undefined); return 'error' in r ? r.error : null; }, `Perfil irregular con el contorno de «${c.nombre}». Doble clic sobre él para editarlo.`))
          : boton('〰', `Muro de ${fmt(op.espCam)} m con este camino como eje (muro curvo)`, () => hacer(() => { const r = muroSobreCamino(estado.proyecto, c, op.espCam, estado.contexto ?? undefined); return 'error' in r ? r.error : null; }, `Muro de ${fmt(op.espCam)} m sobre «${c.nombre}» (perfil irregular). Doble clic sobre él para editarlo.`)),
        boton('⇄', 'Invertir el sentido', () => hacer(() => { const p = estado.proyecto; p.caminos = (p.caminos ?? []).map(x => (x.id === c.id ? invertirCamino(x) : x)); }, 'Sentido invertido.')),
        boton('✕', 'Borrar el camino', () => { caminosSel.delete(c.id); hacer(() => { const p = estado.proyecto; p.caminos = (p.caminos ?? []).filter(x => x.id !== c.id); }, 'Camino borrado.'); }));
      lista.append(f);
    });
    panel.append(lista);
  }
  function armarCotas() {
    panel.append(fila(tilde('alineada (en la dirección de los dos puntos)', op.alineada, v => { op.alineada = v; }, 'Si no: horizontal o vertical según dónde se toque el tercer punto')));
    panel.append(fila(boton('Medir', 'Distancia, Δx, Δy y ángulo entre dos puntos (no deja cota)', () => poner(herr === 'medir' ? 'cota' : 'medir'), herr === 'medir')));
    panel.append(fila(tilde('ver las cotas', op.verCotas, v => { op.verCotas = v; }), tilde('medidas del elegido', op.cotasElegido, v => { op.cotasElegido = v; })));
    const nc = estado.proyecto.cotas?.length ?? 0;
    panel.append(fila(boton(`Borrar todas (${nc})`, 'Borra todas las cotas de la planta', () => { if (!nc) return; hacer(() => { estado.proyecto.cotas = []; }, 'Cotas borradas.'); armar(); })));
    panel.append(mk('p', 'Las cotas se pegan a las esquinas, medios y centros de los muros y los siguen si se mueven. Tocar una cota la elige; Supr la borra.', 'col-nota'));
  }

  // ---------------------------------------------------------------- dibujo
  const dibCota = (g: SVGGElement, a: Punto, b: Punto, c1: Punto, c2: Punto, valor: number, ang: number, cls: string, id?: string) => {
    const { X, Y } = vista;
    const gg = el('g', { class: `cota ${cls}` + (id && id === cotaSel ? ' sel' : '') });
    if (id) gg.setAttribute('data-cota', id);
    // líneas de referencia (con un pequeño hueco junto al punto medido) y línea de cota con marcas oblicuas
    const ext = (p0: Punto, p1: Punto) => { const dx = X(p1.x) - X(p0.x), dy = Y(p1.y) - Y(p0.y), L = Math.hypot(dx, dy); if (L < 1) return; gg.append(el('line', { x1: X(p0.x) + (dx / L) * 3, y1: Y(p0.y) + (dy / L) * 3, x2: X(p1.x) + (dx / L) * 4, y2: Y(p1.y) + (dy / L) * 4, class: 'cota-ext' })); };
    ext(a, c1); ext(b, c2);
    gg.append(el('line', { x1: X(c1.x), y1: Y(c1.y), x2: X(c2.x), y2: Y(c2.y), class: 'cota-lin' }));
    [c1, c2].forEach(q => gg.append(el('line', { x1: X(q.x) - 3.5, y1: Y(q.y) + 3.5, x2: X(q.x) + 3.5, y2: Y(q.y) - 3.5, class: 'cota-marca' })));
    const tx = X((c1.x + c2.x) / 2), ty = Y((c1.y + c2.y) / 2);
    const t = el('text', { x: tx, y: ty - 4, class: 'cota-txt', 'text-anchor': 'middle', transform: `rotate(${-ang} ${tx} ${ty})` }, fmt(valor));
    gg.append(t);
    if (id) gg.append(el('title', {}, `Cota ${fmt(valor)} m · tocala con «Cotas» abierta para elegirla y borrarla`));
    g.append(gg);
  };
  /** capa de la planta: cotas, medidas del elegido, caminos y vistas previas */
  function capa(v: Vista) {
    vista = v;
    const { X, Y } = v;
    const p = estado.proyecto;
    const g = el('g', { class: 'capa-colocar' });
    // caminos
    (p.caminos ?? []).forEach(c => {
      const ps = puntosCamino(c, 3);
      const elegido = caminosSel.has(c.id) || (panelAbierto === 'colocar' && op.matriz === 'camino' && op.camino === c.id);
      g.append(el('polyline', { points: ps.map(q => `${X(q.x)},${Y(q.y)}`).join(' '), class: 'camino' + (elegido ? ' sel' : '') }));
      if (ps.length > 1) { const a = ps[0], b = ps[1]; const ang = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI; g.append(el('path', { d: 'M0,-4 L8,0 L0,4 z', class: 'camino-ini', transform: `translate(${X(a.x)} ${Y(a.y)}) rotate(${ang})` })); }
      if (elegido || p.caminos!.length < 6) g.append(el('text', { x: X(ps[0].x) + 6, y: Y(ps[0].y) - 6, class: 'camino-rot' }, c.nombre));
    });
    // cotas
    if (op.verCotas) (p.cotas ?? []).forEach(c => { const k = geometria(p, c); dibCota(g, k.a, k.b, k.c1, k.c2, k.valor, k.ang, '', c.id); });
    // medidas del elegido: ancho y alto de su caja
    if (op.cotasElegido && panelAbierto) {
      const s = sel();
      if (!vacia(s)) {
        const k = caja(p.muros.filter(m => resolver(p, s).ids.has(m.id)));
        const off = 18 / v.escala;
        if (k.x1 > k.x0) dibCota(g, { x: k.x0, y: k.y1 }, { x: k.x1, y: k.y1 }, { x: k.x0, y: k.y1 + off }, { x: k.x1, y: k.y1 + off }, k.x1 - k.x0, 0, 'auto');
        if (k.y1 > k.y0) dibCota(g, { x: k.x1, y: k.y0 }, { x: k.x1, y: k.y1 }, { x: k.x1 + off, y: k.y0 }, { x: k.x1 + off, y: k.y1 }, k.y1 - k.y0, 90, 'auto');
      }
    }
    // vistas previas
    if (herr === 'medir' && pts.length && cursor) { g.append(el('line', { x1: X(pts[0].p.x), y1: Y(pts[0].p.y), x2: X(cursor.x), y2: Y(cursor.y), class: 'cota-previa' })); g.append(el('text', { x: X(cursor.x) + 10, y: Y(cursor.y) - 10, class: 'cota-txt' }, `${fmt(Math.hypot(cursor.x - pts[0].p.x, cursor.y - pts[0].p.y), 3)} m`)); }
    if (herr === 'cota' && pts.length && cursor) {
      if (pts.length === 1) g.append(el('line', { x1: X(pts[0].p.x), y1: Y(pts[0].p.y), x2: X(cursor.x), y2: Y(cursor.y), class: 'cota-previa' }));
      else { const cc = cotaDesdeCursor(pts[0].p, pts[1].p, cursor, op.alineada); const k = geometria(p, { id: '', a: { ...pts[0].p }, b: { ...pts[1].p }, ...cc }); dibCota(g, k.a, k.b, k.c1, k.c2, k.valor, k.ang, 'previa'); }
    }
    if ((herr === 'mover' || herr === 'copiar') && pts.length && cursor) {
      const dx = cursor.x - pts[0].p.x, dy = cursor.y - pts[0].p.y, s = sel(), ids = resolver(p, s).ids;
      g.append(el('line', { x1: X(pts[0].p.x), y1: Y(pts[0].p.y), x2: X(cursor.x), y2: Y(cursor.y), class: 'cota-previa' }));
      p.muros.filter(m => ids.has(m.id)).forEach(m => { const kk = caja([m]); g.append(el('rect', { x: X(kk.x0 + dx), y: Y(kk.y1 + dy), width: Math.max(2, (kk.x1 - kk.x0) * v.escala), height: Math.max(2, (kk.y1 - kk.y0) * v.escala), class: 'fantasma' })); });
      g.append(el('text', { x: X(cursor.x) + 10, y: Y(cursor.y) - 10, class: 'cota-txt' }, tipeo ? `${tipeo}▌ m` : `${fmt(Math.hypot(dx, dy))} m`));
    }
    if (herr === 'espejar' && pts.length && cursor) {
      const e = ejeDesdePuntos(pts[0].p, cursor), L = 200 / v.escala, d = e.eje === 'x' ? [0, 1] : e.eje === 'y' ? [1, 0] : e.eje === 'd1' ? [Math.SQRT1_2, Math.SQRT1_2] : [Math.SQRT1_2, -Math.SQRT1_2];
      g.append(el('line', { x1: X(pts[0].p.x - d[0] * L), y1: Y(pts[0].p.y - d[1] * L), x2: X(pts[0].p.x + d[0] * L), y2: Y(pts[0].p.y + d[1] * L), class: 'eje-simetria' }));
    }
    if (herr === 'camino' && caminoNuevo && caminoNuevo.v.length) {
      const c: Camino = { id: '', nombre: '', v: caminoNuevo.v, cerrado: false };
      const ps = puntosCamino(c, 3);
      const fin = caminoNuevo.v[caminoNuevo.v.length - 1];
      if (cursor) {
        if (op.curva && caminoNuevo.ctrl?.length) {
          const cs = caminoNuevo.ctrl, c1 = cs[0], c2 = cs[1] ?? cursor, fin2 = cs.length >= 2 ? cursor : cursor;
          ps.push(...puntosCamino({ id: '', nombre: '', v: [{ ...fin, c1, c2 }, { ...fin2 }], cerrado: false }, 3).slice(1));
          cs.forEach(q => g.append(el('circle', { cx: X(q.x), cy: Y(q.y), r: 3, class: 'camino-paso' })));
          g.append(el('line', { x1: X(fin.x), y1: Y(fin.y), x2: X(c1.x), y2: Y(c1.y), class: 'cota-previa' }));
        } else if (op.arco && caminoNuevo.paso) { const b = bulgeTresPuntos(fin, caminoNuevo.paso, cursor); ps.push(...puntosCamino({ id: '', nombre: '', v: [{ ...fin, b }, { ...cursor }], cerrado: false }, 3).slice(1)); }
        else ps.push(cursor);
      }
      g.append(el('polyline', { points: ps.map(q => `${X(q.x)},${Y(q.y)}`).join(' '), class: 'camino previa' }));
      caminoNuevo.v.forEach(q => g.append(el('circle', { cx: X(q.x), cy: Y(q.y), r: 3, class: 'camino-vert' })));
      if (caminoNuevo.paso) g.append(el('circle', { cx: X(caminoNuevo.paso.x), cy: Y(caminoNuevo.paso.y), r: 3, class: 'camino-paso' }));
    }
    tocados.forEach(t => { const m = p.muros.find(x => x.id === t.id); if (m) { const k = caja([m]); g.append(el('rect', { x: X(k.x0) - 3, y: Y(k.y1) - 3, width: (k.x1 - k.x0) * v.escala + 6, height: (k.y1 - k.y0) * v.escala + 6, class: 'tocado' })); } });
    if (herr && cursor && herr !== 'cad') g.append(el('circle', { cx: X(cursor.x), cy: Y(cursor.y), r: 4, class: 'cursor-colocar' }));
    if (panelAbierto === 'colocar' && op.matriz === 'polar') g.append(el('path', { d: `M${X(op.cx) - 6},${Y(op.cy)} h12 M${X(op.cx)},${Y(op.cy) - 6} v12`, class: 'centro-polar' }));
    svg.append(g);
  }

  return {
    /** abre el panel y empieza una herramienta (para los comandos de teclado) */
    iniciar: (h: 'mover' | 'copiar' | 'girar' | 'girar-libre' | 'espejar' | 'escalar' | 'desfase' | 'alargar' | 'partir' | 'unir' | 'esquina' | 'cota' | 'medir' | 'camino' | null) => {
      panelAbierto = h === 'cota' || h === 'medir' ? 'cotas' : 'colocar';
      document.dispatchEvent(new CustomEvent('torre:panel-planta', { detail: 'colocar' }));
      panel.classList.remove('plegado'); poner(h);
    },
    botones: [bColocar, bCotas],
    capa,
    /** la planta cambió de herramienta: se cierra lo de acá */
    cerrar: () => { if (panelAbierto || herr) { panelAbierto = null; herr = null; pts = []; caminoNuevo = null; svg.classList.remove('colocando'); armar(); } },
    activo: () => !!herr || panelAbierto !== null,
    refrescar: () => { if (panelAbierto && !panel.contains(document.activeElement)) armar(); },
  };
}
