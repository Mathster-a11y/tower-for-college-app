/**
 * La guía de un método para imprimir o guardar en PDF: portada, qué es el método y con qué reglas calcula, y por cada
 * capítulo su esquema (en una hoja A3 apaisada, entero) y la explicación paso a paso de cada cuenta, con la ecuación,
 * los números del proyecto abierto, la nota y, si es un control, si verifica y qué hacer si no. Al final, todos los
 * controles juntos. Se arma con los mismos grafos que la etapa Ecuaciones: el PDF y la app dicen lo mismo.
 */
import { estado, fmt } from '../estado';
import { esc, h, type H } from '../comp';
import { filas, referencias, simbolo, vistaGrafo, type CapituloGrafo, type NodoGrafo, type ParamGrafo } from '../grafo';
import { conNumeros, conSimbolos, grafoDeMetodo, type MetodoEc } from './vista';
import { TEXTOS_METODO } from './metodos';

type Cap = CapituloGrafo<unknown, unknown>;
const ANCHO_A3 = 1480, ALTO_A3 = 960;   // px útiles de una hoja A3 apaisada con 10 mm de margen (sin el título)

export async function abrirGuiaImprimible(metodo: MetodoEc, imprimir = true): Promise<void> {
  document.querySelector('.guia-impresion')?.remove();
  const dir = estado.dir;
  const pieza = estado.calculo.asig.piezas.find(x => x.dir === dir && x.filaHoja !== null)?.nombre ?? '';
  const g = grafoDeMetodo(metodo, dir, pieza, '');
  const d = g.datos(), r = g.calcular(d);
  const t = TEXTOS_METODO[metodo];
  const raiz = h('div', { class: 'guia-impresion' });
  const temaAntes = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = 'light';
  const cerrar = () => { raiz.remove(); document.body.classList.remove('con-guia'); if (temaAntes === undefined) delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = temaAntes; };
  const bImp = h('button', { type: 'button', class: 'boton primario' }, 'Imprimir o guardar en PDF');
  bImp.addEventListener('click', () => window.print());
  const bCer = h('button', { type: 'button', class: 'boton' }, 'Cerrar');
  bCer.addEventListener('click', cerrar);
  raiz.append(h('div', { class: 'guia-barra' }, h('strong', {}, t.titulo), h('span', { class: 'nota' }, 'Los esquemas van en hojas A3 apaisadas; el texto, en A4.'), bImp, bCer));

  // ---- portada y el método
  const p = estado.proyecto;
  raiz.append(h('section', { class: 'guia-portada' },
    h('p', { class: 'guia-sobre' }, 'Torre 3D · guía de cálculo'),
    h('h1', {}, t.titulo), h('p', { class: 'guia-sub' }, t.subtitulo),
    h('p', {}, `Proyecto: ${p.nombre || 'sin nombre'} · viento ${dir} · ${p.hormigon || 'H30'} · ${new Date().toLocaleDateString('es-AR')}. Los números son los de este proyecto; cada ecuación está comprobada contra el motor de la app.`),
    h('h2', {}, 'Qué es'), ...t.que.map(x => h('p', {}, x)),
    h('h2', {}, 'La cadena de cuentas'), h('ol', {}, ...t.cadena.map(x => h('li', {}, x))),
    h('h2', {}, 'Cómo se sabe si verifica'), h('ul', {}, ...t.verifica.map(x => h('li', {}, x))),
    h('h2', {}, 'En qué se diferencia'), h('ul', {}, ...t.diferencias.map(x => h('li', {}, x))),
    h('h2', {}, 'Cómo leer los esquemas'),
    h('ul', {},
      h('li', {}, 'Cada cuenta es una tarjeta con su título, su ecuación y el número que da con este proyecto.'),
      h('li', {}, 'Cuando una ecuación usa el resultado de otra, una flecha sale de debajo del símbolo que la otra calcula y cae justo encima del lugar donde se usa. Cada resultado tiene su color: el de su símbolo, el de sus flechas y el de cada lugar donde aparece.'),
      h('li', {}, 'Los datos van en óvalos, cerca de la ecuación que los usa. Los que usan varias ecuaciones llevan borde de color; los de una sola, gris. Punteados: datos de la planta o de la geometría.'),
      h('li', {}, 'Las tarjetas punteadas traen un resultado de otro capítulo. Las de tensiones llevan un borde rojo (tracción) o azul (compresión). Las de control dicen si verifican (verde) o no (rojo).'),
    )));

  // ---- capítulos
  const vistas: { el: H; redibujar(): void }[] = [];
  const controles: { cap: string; n: NodoGrafo<unknown>; c: Cap }[] = [];
  g.capitulos.forEach((cap: Cap) => {
    const val = (k: string): number | null => {
      const pp = cap.params.find(x => x.id === k);
      if (pp) return pp.get(d);
      const v = cap.nodos.find(x => x.id === k)?.valor(r);
      return v === undefined || v === null || !isFinite(v) ? null : v;
    };
    const dec = (k: string) => cap.params.find(x => x.id === k)?.dec ?? cap.nodos.find(x => x.id === k)?.dec ?? 2;
    const sec = h('section', { class: 'guia-cap' }, h('h2', {}, cap.titulo), h('p', {}, cap.intro));
    // los datos del capítulo
    if (cap.params.length) {
      const tb = h('tbody');
      cap.params.forEach((x: ParamGrafo<unknown>) => { const s = h('td', {}); s.innerHTML = simbolo(x.sim); tb.append(h('tr', {}, s, h('td', {}, x.nombre), h('td', { class: 'n' }, `${fmt(x.get(d), x.dec ?? 2)}${x.unidad ? ` ${x.unidad}` : ''}`), h('td', { class: 'nota' }, x.fuente ?? ''))); });
      sec.append(h('h3', {}, 'Datos'), h('table', { class: 'tabla chica' }, h('thead', {}, h('tr', {}, ...['', 'qué es', 'valor', 'de dónde sale'].map(x => h('th', {}, x)))), tb));
    }
    raiz.append(sec);
    // el esquema, en su hoja
    const vg = vistaGrafo(cap, r, { elegido: null, elegir: () => undefined, arrastrar: () => undefined, valorParam: k => cap.params.find(x => x.id === k)!.get(d) });
    vistas.push(vg);
    raiz.append(h('section', { class: 'guia-diagrama' }, h('h3', {}, `${t.titulo} · ${cap.titulo}`), h('div', { class: 'guia-tablero' }, vg.el)));
    // paso a paso, en el orden del esquema (de arriba hacia abajo)
    const usos = Object.fromEntries(cap.nodos.map(n => [n.id, [...referencias(n.ec), ...(n.control ? referencias(n.control.cond) : [])].filter(x => cap.nodos.some(y => y.id === x))]));
    const fila = filas(cap.nodos.map(n => n.id), usos);
    const orden = [...cap.nodos].sort((a, b) => fila[a.id] - fila[b.id] || cap.nodos.indexOf(a) - cap.nodos.indexOf(b));
    const pasos = h('section', { class: 'guia-pasos' }, h('h3', {}, `${cap.titulo}: paso a paso`));
    orden.forEach(n => {
      const v = n.valor(r);
      const caja = h('div', { class: `guia-paso${n.tension ? ` ${n.tension}` : ''}${n.externo ? ' externo' : ''}` });
      const tit = h('h4', {}); tit.innerHTML = `${simbolo(n.sim)} · ${esc(n.titulo)}`;
      caja.append(tit);
      if (n.externo) caja.append(h('p', {}, `${v === null || v === undefined || !isFinite(v) ? '—' : fmt(v, n.dec ?? 2)}${n.unidad ? ` ${n.unidad}` : ''} · viene ${n.externo.startsWith('de') || n.externo.startsWith('del') ? n.externo : `de: ${n.externo}`}.`));
      else {
        const e1 = h('p', { class: 'ec' }); e1.innerHTML = `${simbolo(n.sim)} = ${conSimbolos(n.ec, cap)}`;
        caja.append(e1);
        if (v !== null && v !== undefined && isFinite(v)) {
          const e2 = h('p', { class: 'ec' }); e2.innerHTML = `${simbolo(n.sim)} = ${conNumeros(n.ec, val, dec)} = <span class="res">${fmt(v, n.dec ?? 2)}</span>${n.unidad ? ` <span class="u">${esc(n.unidad)}</span>` : ''}`;
          caja.append(e2);
        }
      }
      if (n.nota) caja.append(h('p', {}, n.nota));
      if (n.ref) caja.append(h('p', { class: 'nota' }, `Referencia: ${n.ref}`));
      if (n.control) {
        const ok = n.control.ok(r);
        controles.push({ cap: cap.titulo, n, c: cap });
        const cond = h('span', {}); cond.innerHTML = `${/^[≤≥<>=]/.test(n.control.cond.trim()) ? `${simbolo(n.sim)} ` : ''}${conNumeros(n.control.cond, val, dec)}`;
        caja.append(h('div', { class: `guia-control ${ok === null ? '' : ok ? 'verifica' : 'no-verifica'}` },
          h('span', { class: `chip-estado ${ok === null ? 'informativo' : ok ? 'verifica' : 'no-verifica'}` }, ok === null ? 'sin dato' : ok ? 'verifica' : 'no verifica'), ' Condición: ', cond),
          h('p', {}, ok === false ? 'No verifica. Qué se puede hacer:' : 'Si no verificara, qué se puede hacer:'), h('ul', {}, ...n.control.siNo.map(x => h('li', {}, x.texto))));
      }
      pasos.append(caja);
    });
    raiz.append(pasos);
  });

  // ---- todos los controles
  if (controles.length) {
    const tb = h('tbody');
    controles.forEach(({ cap, n }) => {
      const ok = n.control!.ok(r), v = n.valor(r);
      const s = h('td', {}); s.innerHTML = `${simbolo(n.sim)} · ${esc(n.titulo)}`;
      const c = h('td', {}); c.innerHTML = conSimbolos(n.control!.cond, g.capitulos.find((x: Cap) => x.titulo === cap)!);
      tb.append(h('tr', {}, h('td', {}, cap), s, h('td', { class: 'n' }, v === null || v === undefined || !isFinite(v) ? '—' : `${fmt(v, n.dec ?? 2)}${n.unidad ? ` ${n.unidad}` : ''}`), c,
        h('td', {}, h('span', { class: `chip-estado ${ok === null ? 'informativo' : ok ? 'verifica' : 'no-verifica'}` }, ok === null ? '—' : ok ? 'verifica' : 'no verifica'))));
    });
    raiz.append(h('section', { class: 'guia-cap' }, h('h2', {}, 'Todos los controles'), h('table', { class: 'tabla' }, h('thead', {}, h('tr', {}, ...['capítulo', 'control', 'valor', 'condición', 'estado'].map(x => h('th', {}, x)))), tb)));
  }

  document.body.classList.add('con-guia');
  document.body.append(raiz);
  // cada esquema se acomoda y se achica para entrar en el ancho de la hoja
  await new Promise(res => setTimeout(res, 250));
  await (document.fonts?.ready ?? Promise.resolve());
  vistas.forEach(v => {
    const w = v.el.offsetWidth, hh = v.el.offsetHeight;
    if (!(w > 0 && hh > 0)) return;
    // la hoja se gira según la forma del esquema: apaisada si es ancho, vertical si es alto
    const vertical = hh > w * 1.1;
    v.el.closest('.guia-diagrama')?.classList.toggle('vertical', vertical);
    v.el.style.zoom = String(Math.min(1.7, (vertical ? ALTO_A3 + 40 : ANCHO_A3) / w, (vertical ? ANCHO_A3 - 30 : ALTO_A3) / hh));
    v.redibujar();
  });
  await new Promise(res => setTimeout(res, 250));
  raiz.dataset.listo = '1';
  if (imprimir) window.print();
}
