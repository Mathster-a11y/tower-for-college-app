/**
 * Forma de la torre desde una tabla de alturas: una ventana con el texto pegado de Excel a la izquierda y, a la derecha,
 * el alzado que sale de esa tabla, que se rehace mientras se pega o se corrige. Debajo, qué se leyó, los avisos fila por
 * fila y si entre las filas van tramos rectos o una curva suave. Nada cambia hasta «Usar la tabla».
 */
import { perfilDesdeTabla, valorPerfil, type PuntoPerfil } from '../engine/perfil_torre';

const NS = 'http://www.w3.org/2000/svg';
const sv = (tag: string, a: Record<string, string | number>) => { const e = document.createElementNS(NS, tag); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v))); return e; };
const f2 = (x: number) => String(+x.toFixed(2)).replace('.', ',');

export interface OpcionesTablaPerfil {
  /** cota de la losa base y de la azotea (m) */
  zBase: number; zTop: number;
  /** ancho de la losa base en x (m), para dibujar el alzado en metros */
  anchoBase: number;
  /** el texto con el que arranca (por ejemplo, la tabla del perfil actual) */
  texto?: string;
}

export function pedirTablaPerfil(op: OpcionesTablaPerfil): Promise<{ puntos: PuntoPerfil[]; suave: boolean } | null> {
  return new Promise(resolver => {
    const d = document.createElement('dialog'); d.className = 'tarjeta tabla-perfil';
    const ins = document.createElement('span'); ins.className = 'insignia pregunta'; ins.textContent = '?'; ins.setAttribute('aria-hidden', 'true');
    const cuerpo = document.createElement('div'); cuerpo.className = 'tarjeta-cuerpo';
    const t = document.createElement('h2'); t.textContent = 'Forma desde una tabla de alturas';
    const ayuda = document.createElement('p');
    ayuda.textContent = `Pegá desde Excel la cota (m, como en Niveles) y el ancho o el diámetro a esa altura (m). Con tres columnas, el ancho en x y en y; con cinco, además cuánto se corre la planta (x, y). La losa base (${f2(op.zBase)} m) da el tamaño y la tabla, la forma: los anchos se toman en proporción al de la tabla en esa cota. La fila de títulos se saltea.`;
    const ta = document.createElement('textarea'); ta.className = 'tarjeta-texto'; ta.rows = 14; ta.value = op.texto ?? ''; ta.setAttribute('aria-label', 'Tabla de alturas'); ta.spellcheck = false;
    ta.placeholder = 'cota\tancho\n0\t49\n20,75\t54,2\n83\t56,5\n166\t26';
    const svg = sv('svg', { viewBox: '0 0 220 300', class: 'alzado-tabla', role: 'img', 'aria-label': 'Alzado que sale de la tabla' }) as SVGSVGElement;
    const lado = document.createElement('div'); lado.className = 'tabla-perfil-lado'; lado.append(ta, svg);
    const resumen = document.createElement('p'); resumen.className = 'nota-chica';
    const avisos = document.createElement('ul'); avisos.className = 'tabla-perfil-avisos';
    // tramos rectos o curva suave entre las filas
    let suave = false;
    const seg = document.createElement('div'); seg.className = 'seg chico'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Entre las filas');
    const bRectos = document.createElement('button'), bSuave = document.createElement('button');
    bRectos.type = bSuave.type = 'button'; bRectos.textContent = 'Tramos rectos'; bSuave.textContent = 'Curva suave';
    bRectos.title = 'Entre una fila y la siguiente, el ancho cambia en línea recta (con muchas filas, sigue la curva tal cual)';
    bSuave.title = 'Una curva suave que pasa por todas las filas (con pocas filas, redondea la forma)';
    const pintarSeg = () => { bRectos.setAttribute('aria-pressed', String(!suave)); bSuave.setAttribute('aria-pressed', String(suave)); };
    bRectos.addEventListener('click', () => { suave = false; pintarSeg(); rehacer(); }); bSuave.addEventListener('click', () => { suave = true; pintarSeg(); rehacer(); });
    seg.append(bRectos, bSuave); pintarSeg();
    const filaOp = document.createElement('div'); filaOp.className = 'fila-acciones'; filaOp.append(Object.assign(document.createElement('span'), { className: 'nota-chica', textContent: 'Entre las filas:' }), seg);
    const botones = document.createElement('div'); botones.className = 'tarjeta-botones';
    const usar = document.createElement('button'); usar.type = 'button'; usar.className = 'primario'; usar.textContent = 'Usar la tabla';
    const cancelar = document.createElement('button'); cancelar.type = 'button'; cancelar.textContent = 'Cancelar';
    botones.append(usar, cancelar);
    cuerpo.append(t, ayuda, lado, resumen, avisos, filaOp, botones);
    d.append(ins, cuerpo);

    let ultimo: ReturnType<typeof perfilDesdeTabla> | null = null;
    function rehacer() {
      const txt = ta.value.trim();
      ultimo = txt ? perfilDesdeTabla(txt, op.zBase, op.zTop) : null;
      avisos.replaceChildren(...(ultimo?.avisos ?? []).map(a => Object.assign(document.createElement('li'), { textContent: a })));
      if (!ultimo) resumen.textContent = 'Pegá la tabla: el alzado aparece a la derecha.';
      else if (ultimo.error) resumen.textContent = ultimo.error;
      else resumen.textContent = `${ultimo.filas} ${ultimo.filas === 1 ? 'fila leída' : 'filas leídas'} · ${ultimo.puntos.length} puntos del perfil, de ${f2(op.zBase)} a ${f2(op.zTop)} m.`;
      resumen.classList.toggle('error', !!ultimo?.error);
      usar.disabled = !ultimo || !!ultimo.error;
      dibujar();
    }
    function dibujar() {
      svg.replaceChildren();
      const W = 220, H = 300, y0 = H - 14, y1 = 12, alto = op.zTop - op.zBase || 1;
      svg.append(sv('line', { x1: 6, x2: W - 6, y1: y0, y2: y0, class: 'suelo' }));
      if (!ultimo || ultimo.error || !ultimo.puntos.length) return;
      const pf = { puntos: ultimo.puntos, suave };
      const hs = Array.from({ length: 81 }, (_, k) => k / 80), vs = hs.map(h => valorPerfil(pf, h));
      // escala: el ancho más grande (con su corrimiento) entra en el dibujo, en la misma escala que la altura si se puede
      const semi = Math.max(...vs.map(v => (Math.max(v.fx, v.fy) * op.anchoBase) / 2 + Math.abs(v.dx)), 1);
      const k = Math.min((W - 24) / (2 * semi), (y0 - y1) / alto), mx = W / 2;
      const X = (m: number) => mx + m * k, Yz = (h: number) => y0 - h * alto * k;
      const der = hs.map((h, i) => `${X((vs[i].fx * op.anchoBase) / 2 + vs[i].dx).toFixed(1)},${Yz(h).toFixed(1)}`);
      const izq = hs.map((h, i) => `${X((-vs[i].fx * op.anchoBase) / 2 + vs[i].dx).toFixed(1)},${Yz(h).toFixed(1)}`).reverse();
      svg.append(sv('polygon', { points: [...der, ...izq].join(' '), class: 'torre' }));
      // las filas de la tabla, como puntos en el borde
      ultimo.puntos.forEach(q => { const v = valorPerfil(pf, q.h); svg.append(sv('circle', { cx: X((v.fx * op.anchoBase) / 2 + v.dx), cy: Yz(q.h), r: 2.6, class: 'punto' })); });
      const txt = sv('text', { x: 6, y: Yz(1) - 3, class: 'rot' }); txt.textContent = `${f2(op.zTop)} m`; svg.append(txt);
    }
    ta.addEventListener('input', rehacer);
    let hecho = false;
    const fin = (r: { puntos: PuntoPerfil[]; suave: boolean } | null) => { if (hecho) return; hecho = true; d.close(); d.remove(); resolver(r); };
    usar.addEventListener('click', () => { if (ultimo && !ultimo.error) fin({ puntos: ultimo.puntos, suave }); });
    cancelar.addEventListener('click', () => fin(null));
    d.addEventListener('cancel', ev => { ev.preventDefault(); fin(null); });
    document.body.append(d);
    d.showModal();
    rehacer();
    ta.focus();
  });
}
