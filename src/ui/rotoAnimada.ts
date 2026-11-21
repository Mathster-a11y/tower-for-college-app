/**
 * Rototraslación animada en planta. La losa es rígida: se corre δ en el sentido del viento y gira φ alrededor del CR.
 * Cada tabique se mueve uj = δ + φ·(Xr − tj) y, como su rigidez es proporcional a su J, toma Fj = k·Jj·uj:
 *   δ = W / ΣJ (por unidad de k)   ·   φ = Mt / ΣJt·a²
 * Así la relación entre lo que se corre y lo que gira es la real; solo el tamaño está exagerado para que se vea.
 * La animación va en tres tiempos: traslación (todos se corren lo mismo), rotación (giran alrededor del CR) y la suma.
 * Las flechas debajo de la planta crecen con la fuerza de cada tabique en cada momento.
 */
import { fmt } from './estado';
import { rectangulos, tipoDe } from '../engine/modelo';
import type { DatosRotoPlano, ElementoPlano } from './rototraslacion';
import type { Tam } from './diagramas';

const NS = 'http://www.w3.org/2000/svg';
type Attrs = Record<string, string | number>;
const el = <K extends keyof SVGElementTagNameMap>(tag: K, a: Attrs = {}, txt?: string) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v)));
  if (txt !== undefined) e.textContent = txt;
  return e;
};

/** flecha (tronco + punta) de (x1,y1) a (x2,y2) */
function flecha(x1: number, y1: number, x2: number, y2: number, w: number, clase: string): SVGGElement {
  const g = el('g', { class: `rt-flecha-dib ${clase}` });
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 1) return g;
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
  const lp = Math.min(Math.max(9, w * 2.6), L * 0.6 + 4), ap = Math.max(9, w * 3) / 2;
  const bx = x2 - ux * lp, by = y2 - uy * lp;
  if (L > lp) g.append(el('line', { x1, y1, x2: bx + ux * 0.5, y2: by + uy * 0.5, class: 'tronco', 'stroke-width': w }));
  g.append(el('polygon', { points: `${x2},${y2} ${bx - uy * ap},${by + ux * ap} ${bx + uy * ap},${by - ux * ap}`, class: 'punta' }));
  return g;
}

/** Tiempos de la animación (s): pausa, traslación, rotación, se mantiene, vuelve. */
const T_TRAS = [0.5, 2.3], T_ROT = [2.8, 4.6], T_VUELVE = [6.4, 7.4], DURACION = 8;
const suave = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const tramo = (t: number, [a, b]: number[]) => suave((t - a) / (b - a));

/** Cuánto de traslación (f1) y de rotación (f2) hay en el instante t (s) */
export function fasesRoto(t: number): { f1: number; f2: number; fase: 0 | 1 | 2 | 3 } {
  const vuelta = 1 - tramo(t, T_VUELVE);
  const f1 = tramo(t, T_TRAS) * vuelta, f2 = tramo(t, T_ROT) * vuelta;
  const fase = t < T_TRAS[0] || t >= T_VUELVE[1] ? 0 : t < T_ROT[0] ? 1 : t < T_ROT[1] ? 2 : 3;
  return { f1, f2, fase };
}

/**
 * Corrimiento y giro de la losa (por unidad de rigidez): δ = W/ΣJ, φ = ±Mt/ΣJt·a² (positivo = horario en el dibujo,
 * cuando el CR queda a la derecha del viento). El corrimiento de un tabique a la distancia t es δ + φ·(Xr − t).
 */
export function movimientoLosa(d: Pick<DatosRotoPlano, 'Q' | 'Mt' | 'Xr'> & { SJ: number; SJa2: number }): { delta: number; phi: number } {
  const delta = d.SJ > 0 ? d.Q / d.SJ : 0;
  const phi = d.SJa2 > 0 && Math.abs(d.Xr) > 1e-3 ? Math.sign(d.Xr) * Math.abs(d.Mt) / d.SJa2 : 0;
  return { delta, phi };
}

export interface RotoAnimada { el: HTMLElement; parar: () => void }

export function rototraslacionAnimada(d: DatosRotoPlano & { SJ: number; SJa2: number }, tam: Tam = {}): RotoAnimada {
  const ancho = Math.max(420, tam.ancho ?? 640), alto = Math.max(420, tam.alto ?? 560);
  const caja = document.createElement('div');
  caja.className = 'roto-animada';
  const svg = el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'grafico rototrasl paso-4 animada', role: 'img',
    'aria-label': `Rototraslación animada, viento ${d.dir}` }) as SVGSVGElement;

  // ---- escala y marco del viento (t a la derecha, s hacia arriba), como en el dibujo por pasos
  const mi = 34, md = 30, ms = 64, abajo = 196;
  const tExt = Math.max(d.T / 2, ...d.paralelos.map(p => Math.abs(p.pos))) + 1;
  const k = Math.min((ancho - mi - md) / (2 * tExt), (alto - ms - abajo) / (d.S + 2));
  const cx = mi + (ancho - mi - md) / 2, cy = ms + (d.S / 2 + 1) * k;
  const X = (t: number) => cx + t * k, Y = (s: number) => cy - s * k;
  const ts = (m: { x: number; y: number }) => (d.dir === 'A' ? { t: m.x, s: m.y } : { t: -m.y, s: m.x });

  // ---- movimiento: la relación traslación / giro es la real; el tamaño se exagera para que el mayor corrimiento de
  // un borde de la planta sea un 7 % de la planta
  const { delta, phi } = movimientoLosa(d);
  const bordes = [-d.T / 2, d.T / 2, ...d.paralelos.map(p => p.pos)];
  const uMax = Math.max(1e-12, ...bordes.map(t => Math.abs(delta + phi * (d.Xr - t))), Math.abs(phi) * d.S / 2);
  const kappa = (0.07 * Math.max(d.T, d.S)) / uMax;                       // m de dibujo por unidad de u

  // ---- planta original (punteada) y planta que se mueve
  const fija = el('g', { class: 'rt-fija' });
  fija.append(el('rect', { x: X(-d.T / 2), y: Y(d.S / 2), width: d.T * k, height: d.S * k, class: 'rt-girada' }));
  const mueve = el('g', { class: 'rt-mueve' });
  mueve.append(el('rect', { x: X(-d.T / 2), y: Y(d.S / 2), width: d.T * k, height: d.S * k, class: 'rt-planta' }));
  d.muros.forEach(m => {
    const papel = d.papeles[m.id]?.[d.dir] ?? '';
    const cl = papel === 'alma' || papel === 'tubo' || papel === 'columna' ? 'rt-muro paralelo' : 'rt-muro';
    if (tipoDe(m) === 'tubo-circ') { const c = ts(m); mueve.append(el('circle', { cx: X(c.t), cy: Y(c.s), r: (m.largo / 2) * k, class: cl })); return; }
    rectangulos(m).forEach(r => {
      const c = ts(r);
      const at = d.dir === 'A' ? r.ax : r.ay, as = d.dir === 'A' ? r.ay : r.ax;
      mueve.append(el('rect', { x: X(c.t - at / 2), y: Y(c.s + as / 2), width: Math.max(1.5, at * k), height: Math.max(1.5, as * k), class: cl }));
    });
  });
  svg.append(fija, mueve);
  // ejes, CR y excentricidad (quedan fijos: son la referencia)
  const xr = X(d.Xr), gira = phi !== 0;
  svg.append(el('line', { x1: X(0), x2: X(0), y1: Y(d.S / 2 + 0.8), y2: Y(-d.S / 2 - 0.8), class: 'rt-simetria' }));
  svg.append(el('line', { x1: xr, x2: xr, y1: Y(d.S / 2 + 0.8), y2: Y(-d.S / 2 - 0.8), class: 'rt-inercia' }));
  svg.append(el('circle', { cx: xr, cy: Y(d.Yr), r: 5, class: 'rt-cr' }));
  svg.append(el('text', { x: xr + (d.Xr >= 0 ? 9 : -9), y: Y(d.Yr) - 8, class: 'd-valor', 'text-anchor': d.Xr >= 0 ? 'start' : 'end' }, 'CR'));
  if (gira) {
    const ye = Y(-d.S / 2) + 18;
    svg.append(el('line', { x1: X(0), x2: xr, y1: ye, y2: ye, class: 'rt-cota' }));
    svg.append(el('text', { x: (X(0) + xr) / 2, y: ye - 4, class: 'd-valor', 'text-anchor': 'middle' }, `e = ${fmt(Math.abs(d.Xr))} m`));
  }
  // rótulo de la fase, arriba
  const titulo = el('text', { x: mi, y: 20, class: 'rt-fase' });
  const sub = el('text', { x: mi, y: 38, class: 'rt-sub' });
  svg.append(titulo, sub);
  // arco del momento de rotación (aparece con la rotación)
  const r = 24, c0 = { x: xr, y: Y(d.Yr) }, horario = d.Xr > 0;
  const fin = horario ? { x: c0.x + r, y: c0.y } : { x: c0.x - r, y: c0.y };
  const arco = el('g', { class: 'rt-arco' });
  arco.append(el('path', { d: `M ${c0.x} ${c0.y + r} A ${r} ${r} 0 1 ${horario ? 1 : 0} ${fin.x} ${fin.y}`, class: 'rt-Mt' }),
    el('polygon', { points: horario ? `${fin.x - 5},${fin.y - 2} ${fin.x + 5},${fin.y - 2} ${fin.x},${fin.y + 7}` : `${fin.x - 5},${fin.y - 2} ${fin.x + 5},${fin.y - 2} ${fin.x},${fin.y + 7}`, class: 'rt-Mt-punta' }),
    el('text', { x: c0.x + (horario ? -r - 6 : r + 6), y: c0.y - r - 4, class: 'd-valor', 'text-anchor': horario ? 'end' : 'start' }, `Mt = ${fmt(Math.abs(d.Mt), 0)} tm`));
  if (gira) svg.append(arco);
  // fuerzas: se redibujan en cada cuadro
  const fuerzas = el('g');
  svg.append(fuerzas);

  const Jmax = Math.max(...d.paralelos.map(p => p.J), ...d.perpendiculares.map(p => p.J), 1e-9);
  const grosor = (J: number) => 1.5 + 3.5 * Math.sqrt(J / Jmax);
  const Fmax = Math.max(1e-9, ...d.paralelos.map(p => Math.max(Math.abs(p.tras), Math.abs(p.total))), ...d.perpendiculares.map(p => Math.abs(p.rot)));
  const base = Y(-d.S / 2) + 30, Lmax = abajo - 90;
  // piezas en la misma recta de acción, una al lado de la otra
  const corr = new Map<ElementoPlano, number>();
  const grupos = new Map<string, ElementoPlano[]>();
  d.paralelos.forEach(p => { const kk = p.pos.toFixed(2); grupos.set(kk, [...(grupos.get(kk) ?? []), p]); });
  grupos.forEach(ps => { const ws = ps.map(p => Math.max(9, grosor(p.J) * 3) + 4); let acc = -ws.reduce((a, b) => a + b, 0) / 2; ps.forEach((p, i) => { corr.set(p, acc + ws[i] / 2); acc += ws[i]; }); });
  const ordenGrupos = [...grupos.values()].sort((a, b) => a[0].pos - b[0].pos);

  const TEXTOS = [
    ['Rototraslación animada', 'Tocá ▶ o arrastrá la barra. Los movimientos están exagerados; la proporción entre corrimiento y giro es la real.'],
    ['1 · Traslación', `Todos los tabiques se corren lo mismo: δ ∝ W / ΣJ. Cada uno toma W · Jj / ΣJ: el más rígido, más.`],
    [gira ? '2 · Rotación alrededor del CR' : '2 · Sin rotación', gira ? `Mt = W · e gira la losa alrededor del CR: se mueve más el que está más lejos (a). Del lado del viento se suma, del otro se resta.` : 'El eje de inercia coincide con el eje de simetría: la losa no gira.'],
    ['3 · Rototraslación', 'La suma: cada tabique termina con W · Jj / ΣJ ± W · e · Jj · aj / ΣJt·a².'],
  ] as const;

  let tActual = 0;
  const poner = (t: number) => {
    tActual = t;
    const { f1, f2, fase } = fasesRoto(t);
    // losa: rota alrededor del CR y se corre en el sentido del viento (hacia arriba en el dibujo)
    const ang = (phi * f2 * kappa * 180) / Math.PI, dy = -delta * f1 * kappa * k;
    mueve.setAttribute('transform', `translate(0 ${dy.toFixed(2)}) rotate(${ang.toFixed(3)} ${xr} ${Y(d.Yr)})`);
    arco.style.opacity = String(f2);
    titulo.textContent = TEXTOS[fase][0];
    sub.textContent = TEXTOS[fase][1];
    // flechas de cada tabique paralelo: total = traslación·f1 + rotación·f2
    fuerzas.replaceChildren();
    d.paralelos.forEach(p => {
      const x = X(p.pos) + (corr.get(p) ?? 0), w = grosor(p.J);
      const F = p.tras * f1 + p.rot * f2, L = (Math.abs(F) / Fmax) * Lmax;
      if (L > 1) fuerzas.append(F >= 0 ? flecha(x, base + L + 2, x, base, w, 'rt-tras') : flecha(x, base, x, base + L + 2, w, 'rt-tras'));
      // el tramo que suma o resta la rotación, al costado
      const lr = (Math.abs(p.rot * f2) / Fmax) * Lmax;
      if (lr > 2) {
        const lt = (Math.abs(p.tras * f1) / Fmax) * Lmax, xb = x + Math.max(9, w * 3) / 2 + 3;
        fuerzas.append(el('line', { x1: xb, x2: xb, y1: base + Math.min(lt, lt + Math.sign(p.rot) * lr) + 2, y2: base + Math.max(lt, lt + Math.sign(p.rot) * lr) + 2, class: `rt-rot-tramo${p.rot < 0 ? ' resta' : ''}` }));
      }
    });
    ordenGrupos.forEach((ps, gi) => {
      const y1 = base + Lmax + 18 + (gi % 2) * 26;
      fuerzas.append(el('text', { x: X(ps[0].pos), y: y1, class: 'd-eje', 'text-anchor': 'middle' }, ps.map(p => p.nombre).join(' · ')));
      fuerzas.append(el('text', { x: X(ps[0].pos), y: y1 + 12, class: 'd-valor', 'text-anchor': 'middle' }, ps.map(p => fmt(p.tras * f1 + p.rot * f2, 1)).join(' / ') + ' t'));
    });
    // perpendiculares: solo rotación, a lo largo del muro (siguen a la losa)
    if (gira) d.perpendiculares.forEach(p => {
      const F = Math.abs(p.rot) * f2;
      if (F < Fmax * 1e-3) return;
      const tc = p.tc ?? (p.muros.length ? p.muros.reduce((x, m) => x + ts(m).t * m.largo * m.espesor, 0) / p.muros.reduce((x, m) => x + m.largo * m.espesor, 0) : 0);
      const sentido = Math.sign(p.pos - d.Yr) * (horario ? 1 : -1) || 1;
      const L = Math.max(4, (F / Fmax) * Lmax), yc = Y(p.pos) - 9 + dy;
      fuerzas.append(flecha(X(tc) - (sentido * L) / 2, yc, X(tc) + (sentido * L) / 2, yc, grosor(p.J), 'rt-rot'));
    });
    // viento
    const yW = base + Lmax;
    fuerzas.append(flecha(X(0), yW, X(0), yW - Math.min(Lmax, 46), 2.5, 'rt-W'));
    fuerzas.append(el('text', { x: X(0) + 8, y: yW - 20, class: 'd-valor' }, `W = ${fmt(d.Q, 1)} t`));
    barra.value = String(Math.round((t / DURACION) * 1000));
  };

  // ---- controles: reproducir / pausa, barra para arrastrar (mouse o dedo) y velocidad
  const fila = document.createElement('div');
  fila.className = 'fila-acciones controles3d';
  const boton = document.createElement('button');
  boton.type = 'button'; boton.className = 'mini';
  const barra = document.createElement('input');
  barra.type = 'range'; barra.min = '0'; barra.max = '1000'; barra.value = '0';
  barra.setAttribute('aria-label', 'Momento de la animación');
  barra.className = 'roto-barra';
  const saltos = ([['Traslación', T_TRAS[1] + 0.05], ['Rotación', T_ROT[1] + 0.05]] as const).map(([t, s]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mini'; b.textContent = t;
    b.title = t === 'Traslación' ? 'Ir al final de la traslación' : 'Ir al final de la rotación (rototraslación completa)';
    b.addEventListener('click', () => { pausar(); poner(s); });
    return b;
  });
  fila.append(boton, barra, ...saltos);
  caja.append(fila, svg);

  let cuadro = 0, t0 = 0, andando = false;
  const paso = (ahora: number) => {
    if (!caja.isConnected) { andando = false; return; }
    poner(((ahora - t0) / 1000) % DURACION);
    cuadro = requestAnimationFrame(paso);
  };
  const reproducir = () => {
    if (andando) return;
    andando = true; boton.textContent = '❚❚ Pausa'; boton.title = 'Pausar';
    t0 = performance.now() - tActual * 1000;
    cuadro = requestAnimationFrame(paso);
  };
  const pausar = () => { andando = false; cancelAnimationFrame(cuadro); boton.textContent = '▶ Animar'; boton.title = 'Reproducir la animación'; };
  boton.addEventListener('click', () => (andando ? pausar() : reproducir()));
  barra.addEventListener('input', () => { pausar(); poner((+barra.value / 1000) * DURACION); });

  poner(0);
  pausar();
  // sin «menos movimiento» en el sistema, arranca sola
  const quieto = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!quieto && d.paralelos.length) requestAnimationFrame(() => { if (caja.isConnected) reproducir(); });
  if (!d.paralelos.length) { fila.hidden = true; titulo.textContent = `No hay piezas que tomen el viento ${d.dir}.`; sub.textContent = ''; }
  return { el: caja, parar: pausar };
}
