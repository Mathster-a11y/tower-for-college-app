/**
 * La guía de un método para imprimir o guardar en PDF: portada, qué es el método y con qué reglas calcula, y por cada
 * capítulo su esquema (en una hoja A3 apaisada, entero) y la explicación paso a paso de cada cuenta, con la ecuación,
 * los números del proyecto abierto, la nota y, si es un control, si verifica y qué hacer si no. Al final, todos los
 * controles juntos. Se arma con los mismos grafos que la etapa Ecuaciones: el PDF y la app dicen lo mismo.
 */
import { estado, fmt } from '../estado';
import { esc, h, type H } from '../comp';
import { filas, referencias, simbolo, vistaGrafo, type CapituloGrafo, type NodoGrafo, type ParamGrafo } from '../grafo';
import { conNumeros, conSimbolos, grafoDeMetodo, posicionesDe, type MetodoEc } from './vista';
import { TEXTOS_METODO } from './metodos';
import { glosarioDe, seccionesSimulacion, tablaUnidades, tablaVariables, unidadesTunel } from './glosario';
import { METODOS_ECUACIONES } from './vista';

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

  // ---- la simulación, explicada paso a paso (en la guía del flujo, antes de las cuentas)
  if (metodo === 'Flujo') raiz.append(...seccionesSimulacion());

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
    const vg = vistaGrafo(cap, r, { elegido: null, elegir: () => undefined, arrastrar: () => undefined, valorParam: k => cap.params.find(x => x.id === k)!.get(d), posiciones: posicionesDe(metodo, cap.id) });
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

  // ---- el glosario del método: sus variables (avisando si otro método usa la misma letra para otra cosa) y sus unidades
  raiz.append(...seccionesGlosario(metodo, g));

  document.body.classList.add('con-guia');
  document.body.append(raiz);
  // cada esquema se acomoda y se achica para entrar en el ancho de la hoja
  await new Promise(res => setTimeout(res, 250));
  await (document.fonts?.ready ?? Promise.resolve());
  vistas.forEach(v => {
    const w = v.el.offsetWidth, hh = v.el.offsetHeight;
    if (!(w > 0 && hh > 0)) return;
    // la hoja se gira según la forma del esquema: apaisada si es ancho, vertical si es alto
    const zH = Math.min(1.7, ANCHO_A3 / w, ALTO_A3 / hh), zV = Math.min(1.7, (ALTO_A3 + 40) / w, (ANCHO_A3 - 30) / hh);
    const vertical = zV > zH;                                         // la que deja el esquema más grande
    v.el.closest('.guia-diagrama')?.classList.toggle('vertical', vertical);
    v.el.style.zoom = String(vertical ? zV : zH);
    v.redibujar();
  });
  await new Promise(res => setTimeout(res, 250));
  raiz.dataset.listo = '1';
  if (imprimir) window.print();
}

/** los mismos símbolos en los otros métodos: símbolo → nombres (para avisar cuando una letra cambia de significado) */
function simbolosDeOtros(metodo: MetodoEc, dir: 'A' | 'B', pieza: string): Map<string, { nombre: string; unidad: string; metodo: string }[]> {
  const m = new Map<string, { nombre: string; unidad: string; metodo: string }[]>();
  for (const otro of METODOS_ECUACIONES) {
    if (otro === metodo) continue;
    let g; try { g = grafoDeMetodo(otro, dir, pieza, ''); } catch { continue; }
    glosarioDe(g).forEach(e => { const l = m.get(e.sim) ?? []; if (!l.some(x => x.unidad === e.unidad && x.metodo === otro)) l.push({ nombre: e.nombre, unidad: e.unidad, metodo: otro }); m.set(e.sim, l); });
  }
  return m;
}
/** el glosario de un método: sus variables y sus unidades, para la guía impresa y para el glosario completo */
export function seccionesGlosario(metodo: MetodoEc, g: ReturnType<typeof grafoDeMetodo>): H[] {
  const es = glosarioDe(g), pieza = estado.calculo.asig.piezas.find(x => x.dir === estado.dir && x.filaHoja !== null)?.nombre ?? '';
  const us = [...es.map(e => e.unidad), ...(metodo === 'Flujo' ? unidadesTunel() : [])];
  return [
    h('section', { class: 'guia-cap' }, h('h2', {}, `Glosario del método ${metodo}`),
      h('p', {}, 'Cada letra que aparece en las cuentas de este método: qué es, en qué unidad está y en qué capítulo se usa. Si otro método usa la misma letra para otra cosa, se avisa: el significado lo da el método.'),
      tablaVariables(es, simbolosDeOtros(metodo, estado.dir, pieza))),
    h('section', { class: 'guia-cap' }, h('h2', {}, 'Las unidades de este método'),
      h('p', {}, 'Cómo se lee cada unidad, qué mide y cuánto vale en otras. Las unidades «viejas» (t, kg/cm²) son las de la guía de la cátedra; las del CIRSOC nuevo son N, kN y MPa.'),
      tablaUnidades(us)),
  ];
}

/** el glosario completo: las unidades, la simulación paso a paso y las variables de los cinco métodos */
export async function abrirGlosario(imprimir = true): Promise<void> {
  document.querySelector('.guia-impresion')?.remove();
  const raiz = h('div', { class: 'guia-impresion' });
  const temaAntes = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = 'light';
  const cerrar = () => { raiz.remove(); document.body.classList.remove('con-guia'); if (temaAntes === undefined) delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = temaAntes; };
  const bImp = h('button', { type: 'button', class: 'boton primario' }, 'Imprimir o guardar en PDF');
  bImp.addEventListener('click', () => window.print());
  const bCer = h('button', { type: 'button', class: 'boton' }, 'Cerrar');
  bCer.addEventListener('click', cerrar);
  raiz.append(h('div', { class: 'guia-barra' }, h('strong', {}, 'Glosario y unidades'), bImp, bCer));
  const dir = estado.dir, pieza = estado.calculo.asig.piezas.find(x => x.dir === dir && x.filaHoja !== null)?.nombre ?? '';
  raiz.append(h('section', { class: 'guia-portada' },
    h('p', { class: 'guia-sobre' }, 'Torre 3D · guía de cálculo'),
    h('h1', {}, 'Glosario y unidades'),
    h('p', { class: 'guia-sub' }, 'Cada unidad, cada letra de las cuentas y cómo funciona la simulación del viento, punto por punto.'),
    h('h2', {}, 'Cómo usar este glosario'),
    h('ul', {},
      h('li', {}, 'Las unidades: cómo se lee cada una, qué mide y cuánto vale en otras (t y kN, kg/cm² y MPa, m/s y km/h).'),
      h('li', {}, 'La simulación: cómo funciona un túnel de viento numérico, en once pasos y sin fórmulas al principio, y el diccionario de sus palabras.'),
      h('li', {}, 'Las variables de cada método (Guía, Planilla, CIRSOC, FEM y Flujo): cada letra con su significado, su unidad y el capítulo donde aparece. Una misma letra puede querer decir otra cosa en otro método (Q es el corte en la guía y la respuesta de fondo en el CIRSOC): se avisa en cada caso.'),
      h('li', {}, 'Las ecuaciones de cada letra, con sus números, están en la guía de cada método (etapa Ecuaciones → «Guía del método …»).'))));
  raiz.append(h('section', { class: 'guia-cap' }, h('h2', {}, 'Todas las unidades'), tablaUnidades()));
  raiz.append(...seccionesSimulacion());
  for (const m of METODOS_ECUACIONES) {
    let g; try { g = grafoDeMetodo(m, dir, pieza, ''); } catch { continue; }
    raiz.append(h('section', { class: 'guia-cap' }, h('h2', {}, `Variables del método ${m}`), h('p', {}, TEXTOS_METODO[m].subtitulo),
      tablaVariables(glosarioDe(g), simbolosDeOtros(m, dir, pieza))));
  }
  document.body.classList.add('con-guia');
  document.body.append(raiz);
  await new Promise(res => setTimeout(res, 200));
  raiz.dataset.listo = '1';
  if (imprimir) window.print();
}
