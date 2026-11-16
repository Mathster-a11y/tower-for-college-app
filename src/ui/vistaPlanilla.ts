/**
 * Vista previa de la planilla que se exporta, en otra pestaña (dirección con «#planilla»). Lee la torre que la app
 * guarda en el navegador, arma la planilla de la cátedra con sus datos (el mismo paso que la exportación) y muestra
 * cada hoja con sus fórmulas calculadas, como la vería Excel. Cuando la torre cambia en la pestaña principal, el
 * navegador avisa (evento «storage») y la vista se rehace sola. No escribe nada: solo lee.
 */
import plantillaURL from '../assets/planilla_virgen.xlsx';
import plantilla2025URL from '../assets/planilla_catedra_2025.xlsx';
import { normalizarProyecto, ejemploGuia, type Proyecto } from '../engine/modelo';
import { aPlanilla } from '../engine/mapping';
import { calcularPlanilla } from '../engine/planilla';
import { config, usarConfig, type Metodo, type Motor } from '../engine/config';
import { vistaPrevia, type HojaVista } from '../xlsx/vistaPrevia';
import { escribirPlanilla } from '../xlsx/planilla';
import { numACol } from '../xlsx/formulas';
import '../estilo.css';

const CLAVE = 'torre3d.proyecto.v1', CLAVE_CONFIG = 'torre3d.config.v1';
const CLAVE_VISTA = 'torre3d.vistaPlanilla';

type Attrs = Record<string, string>;
const h = <K extends keyof HTMLElementTagNameMap>(t: K, a: Attrs = {}, ...hijos: (Node | string)[]) => {
  const e = document.createElement(t);
  Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v));
  e.append(...hijos);
  return e;
};

function leerProyecto(): Proyecto {
  try { const t = localStorage.getItem(CLAVE); if (t) { const p = JSON.parse(t) as Proyecto; if (p.version === 1) return normalizarProyecto(p); } } catch { /* nada guardado */ }
  return ejemploGuia();
}
function leerConfig(): { motor: Motor; metodo: Metodo } {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE_CONFIG) ?? '{}') as { motor?: Motor; metodo?: Metodo };
    return { motor: c.motor === 'nuevo' ? 'nuevo' : 'actual', metodo: c.metodo === 'planilla' ? 'planilla' : 'app' };
  } catch { return { motor: config.motor, metodo: config.metodo }; }
}

export function montarVistaPlanilla() {
  (window as unknown as { __torreLista?: boolean }).__torreLista = true;
  document.title = 'Planilla · Torre 3D';
  const tema = () => { try { const t = localStorage.getItem('torre3d.tema'); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; } catch { /* sin almacenamiento */ } };
  tema();
  document.body.replaceChildren();
  document.body.className = 'vista-planilla';

  // preferencias de esta pestaña (la planilla que se mira, la hoja, el zoom y el resaltado)
  const pref = (() => { try { return JSON.parse(localStorage.getItem(CLAVE_VISTA) ?? '{}') as { motor?: Motor | 'igual'; hoja?: string; zoom?: number; resaltar?: boolean }; } catch { return {}; } })();
  let elegido: Motor | 'igual' = pref.motor ?? 'igual', hojaAct = pref.hoja ?? 'M,NyQ', zoom = pref.zoom ?? 1, resaltar = pref.resaltar ?? true;
  const guardar = () => { try { localStorage.setItem(CLAVE_VISTA, JSON.stringify({ motor: elegido, hoja: hojaAct, zoom, resaltar })); } catch { /* nada */ } };

  const titulo = h('b', {}, 'Planilla que se exporta');
  const nombre = h('span', { class: 'vp-nombre' });
  const estadoTxt = h('span', { class: 'vp-estado' }, 'Calculando…');
  const selMotor = h('select', { 'aria-label': 'Planilla' }) as HTMLSelectElement;
  [['igual', 'la del motor elegido en la app'], ['nuevo', 'cátedra 2025'], ['actual', 'anterior']].forEach(([v, t]) => selMotor.append(new Option(t, v)));
  selMotor.value = elegido;
  selMotor.addEventListener('change', () => { elegido = selMotor.value as Motor | 'igual'; guardar(); void rehacer(); });
  const chkRes = h('input', { type: 'checkbox' }) as HTMLInputElement; chkRes.checked = resaltar;
  chkRes.addEventListener('change', () => { resaltar = chkRes.checked; guardar(); hoja.classList.toggle('vp-resaltar', resaltar); });
  const bMenos = h('button', { type: 'button', title: 'Achicar' }, '−'), bMas = h('button', { type: 'button', title: 'Agrandar' }, '+'), zTxt = h('span', { class: 'mono' });
  const ponerZoom = (z: number) => { zoom = Math.min(2, Math.max(0.4, Math.round(z * 10) / 10)); zTxt.textContent = `${Math.round(zoom * 100)} %`; tabla.style.setProperty('zoom', String(zoom)); guardar(); };
  bMenos.addEventListener('click', () => ponerZoom(zoom - 0.1)); bMas.addEventListener('click', () => ponerZoom(zoom + 0.1));
  const bBajar = h('button', { type: 'button', class: 'primario', title: 'Descarga esta misma planilla (virgen: solo los datos en las hojas de la cátedra y las tablas T3D)' }, 'Descargar esta planilla');
  bBajar.addEventListener('click', () => void descargar());
  const barra = h('header', { class: 'vp-barra' }, titulo, nombre, h('label', {}, 'Planilla ', selMotor), h('label', { title: 'Las celdas que escribe la app (datos de la torre) con un borde azul' }, chkRes, ' resaltar lo que escribe la app'),
    h('span', { class: 'vp-zoom' }, bMenos, zTxt, bMas), estadoTxt, bBajar);
  const formula = h('div', { class: 'vp-barra-f' }, h('span', { class: 'mono vp-ref' }, ''), h('span', { class: 'vp-f' }, 'Tocá una celda para ver su fórmula.'));
  const hoja = h('div', { class: 'vp-hoja' + (resaltar ? ' vp-resaltar' : '') });
  const tabla = h('table', { class: 'vp-tabla' });
  hoja.append(tabla);
  const pestanas = h('nav', { class: 'vp-pestanas', 'aria-label': 'Hojas' });
  const nota = h('p', { class: 'vp-nota' }, 'Se actualiza sola cuando cambiás la torre en la pestaña de la app. Las fórmulas se calculan como al abrir el archivo en Excel (verificado con LibreOffice, celda por celda). Si en la app abriste tu propia planilla, acá se muestra la de la cátedra.');
  document.body.append(barra, formula, hoja, pestanas, nota);
  ponerZoom(zoom);

  let hojas: HojaVista[] = [];
  let celdaSel: string | null = null;

  const dibujarHoja = () => {
    const hv = hojas.find(x => x.nombre === hojaAct) ?? hojas[0];
    if (!hv) return;
    hojaAct = hv.nombre;
    pestanas.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.textContent === hv.nombre)));
    const scroll = { x: hoja.scrollLeft, y: hoja.scrollTop };
    tabla.replaceChildren();
    const cg = h('colgroup', {}, h('col', { style: 'width:42px' }));
    hv.anchos.forEach(w => cg.append(h('col', { style: `width:${w}px` })));
    tabla.append(cg);
    const cab = h('tr', {}, h('th', { class: 'vp-esq' }));
    for (let c = 1; c <= hv.cols; c++) cab.append(h('th', {}, numACol(c)));
    tabla.append(h('thead', {}, cab));
    const tb = h('tbody');
    for (let r = 1; r <= hv.filas; r++) {
      const tr = h('tr', hv.altos[r] ? { style: `height:${hv.altos[r]}px` } : {}, h('th', {}, String(r)));
      for (let c = 1; c <= hv.cols; c++) {
        const ref = `${numACol(c)}${r}`;
        if (hv.tapadas.has(ref)) continue;
        const cel = hv.celdas.get(ref), comb = hv.combinadas.get(ref);
        const td = h('td', { 'data-ref': ref });
        if (comb) { if (comb.filas > 1) td.rowSpan = comb.filas; if (comb.cols > 1) td.colSpan = comb.cols; }
        if (cel) {
          td.textContent = cel.texto;
          const e = cel.estilo, st: string[] = [];
          if (e.fondo) st.push(`background:${e.fondo}`);
          if (e.color && e.color.toLowerCase() !== '#000000') st.push(`color:${e.color}`);
          if (e.negrita) st.push('font-weight:700');
          if (e.cursiva) st.push('font-style:italic');
          if (e.tam && e.tam !== 10) st.push(`font-size:${(e.tam / 10).toFixed(2)}em`);
          st.push(`text-align:${e.alinear === 'center' || e.alinear === 'centerContinuous' ? 'center' : e.alinear === 'right' ? 'right' : e.alinear === 'left' ? 'left' : /^[−\-\d,.\s%E+]+$/.test(cel.texto) ? 'right' : 'left'}`);
          if (e.envolver) st.push('white-space:normal');
          td.setAttribute('style', st.join(';'));
          // como Excel: un texto que no entra se sigue viendo sobre las celdas vacías de al lado
          const desborda = !e.envolver && !comb && !/^[−\-\d,.\s%E+]+$/.test(cel.texto) && !hv.celdas.get(`${numACol(c + 1)}${r}`)?.texto;
          td.className = `vp-${cel.tipo}${cel.error ? ' vp-error' : ''}${desborda ? ' vp-desborda' : ''}`;
          if (cel.f) td.title = `=${cel.f}`;
        }
        if (ref === celdaSel) td.classList.add('vp-sel');
        tr.append(td);
      }
      tb.append(tr);
    }
    tabla.append(tb);
    hoja.scrollLeft = scroll.x; hoja.scrollTop = scroll.y;
  };
  tabla.addEventListener('click', ev => {
    const td = (ev.target as HTMLElement).closest('td'); if (!td) return;
    const ref = td.dataset.ref!, hv = hojas.find(x => x.nombre === hojaAct), cel = hv?.celdas.get(ref);
    celdaSel = ref;
    tabla.querySelectorAll('.vp-sel').forEach(x => x.classList.remove('vp-sel')); td.classList.add('vp-sel');
    (formula.firstChild as HTMLElement).textContent = ref;
    (formula.lastChild as HTMLElement).textContent = !cel ? '(vacía)' : cel.f ? `=${cel.f}   →   ${cel.texto}` : cel.tipo === 'dato' ? `${cel.texto}   (dato que escribe la app)` : cel.texto;
  });
  const dibujarPestanas = () => {
    pestanas.replaceChildren(...hojas.map(hv => { const b = h('button', { type: 'button' }, hv.nombre); b.addEventListener('click', () => { hojaAct = hv.nombre; celdaSel = null; guardar(); dibujarHoja(); hoja.scrollTo(0, 0); }); return b; }));
  };

  // cálculo: la torre guardada, con el motor y el método de la app (o la planilla elegida acá)
  const plantillas: Partial<Record<Motor, ArrayBuffer>> = {};
  const plantilla = async (m: Motor) => (plantillas[m] ??= await (await fetch(m === 'nuevo' ? plantilla2025URL : plantillaURL)).arrayBuffer());
  const armar = () => {
    const c = leerConfig(), motor: Motor = elegido === 'igual' ? c.motor : elegido;
    const p = leerProyecto();
    const { asig, res } = usarConfig({ motor, metodo: c.metodo }, () => { const asig = aPlanilla(p); return { asig, res: calcularPlanilla(asig.datos, { motor }) }; });
    return { p, motor, asig, res, metodo: c.metodo };
  };
  let turno = 0;
  const rehacer = async () => {
    const yo = ++turno;
    estadoTxt.textContent = 'Calculando…';
    try {
      const { p, motor, asig, res, metodo } = armar();
      const hs = await vistaPrevia(await plantilla(motor), asig.datos, res, motor);
      if (yo !== turno) return;
      const nuevaLista = hs.map(x => x.nombre).join('|') !== hojas.map(x => x.nombre).join('|');
      hojas = hs.filter(x => x.celdas.size);
      if (nuevaLista) dibujarPestanas();
      dibujarHoja();
      nombre.textContent = `${p.nombre || 'Proyecto'} · ${motor === 'nuevo' ? 'planilla de la cátedra 2025' : 'planilla anterior'}${metodo === 'planilla' ? ' · método planilla' : ''}`;
      estadoTxt.textContent = `Actualizada ${new Date().toLocaleTimeString('es-AR')}`;
      estadoTxt.classList.remove('vp-mal');
    } catch (e) {
      if (yo !== turno) return;
      estadoTxt.textContent = `No se pudo armar: ${(e as Error).message}`;
      estadoTxt.classList.add('vp-mal');
    }
  };
  async function descargar() {
    try {
      const { p, motor, asig, res } = armar();
      const bytes = await escribirPlanilla(await plantilla(motor), asig.datos, res, p, undefined, undefined, { motor, virgen: true });
      const a = h('a', { href: URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), download: `${(p.nombre || 'torre').replace(/[\\/:*?"<>|]+/g, '_')} - planilla.xlsx` });
      document.body.append(a); a.click(); a.remove();
    } catch (e) { estadoTxt.textContent = `No se pudo descargar: ${(e as Error).message}`; estadoTxt.classList.add('vp-mal'); }
  }
  let espera: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('storage', ev => {
    if (ev.key === 'torre3d.tema') { tema(); return; }
    if (ev.key !== CLAVE && ev.key !== CLAVE_CONFIG && ev.key !== null) return;
    clearTimeout(espera); espera = setTimeout(() => void rehacer(), 250);
  });
  void rehacer();
}

/** abre (o trae al frente) la pestaña de la vista previa */
export function abrirVistaPlanilla() {
  const url = `${location.pathname}${location.search}#planilla`;
  const w = window.open(url, 'torre3d-planilla');
  if (w) w.focus();
  return !!w;
}
