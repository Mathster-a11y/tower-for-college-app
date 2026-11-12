import './estilo.css';
import { estado } from './ui/estado';
import { montarPlanta } from './ui/planta';
import { montar3D } from './ui/vista3d';
import { imprimirInforme } from './ui/informe';
import { imprimirDesglose, descargarPPTX } from './ui/desglose';
import { imprimirLaminas } from './ui/lamina';
import { botonesExportar } from './ui/exportarDibujo';
import { avisoActual } from './autoria';
import { recorrido, recorridoSiEsPrimeraVez } from './ui/recorrido';
import { tablaComparacion, comparar } from './ui/comparar';
import { borrarVersion, fechaCorta, guardarVersion, leerVersion, versiones } from './ui/biblioteca';
import { cantidadAvisos } from './ui/paneles';
import { ETAPAS, ETAPAS_FIN, etapaPorId, todas, datosRoto3D, type Etapa } from './ui/etapas';
import { activarGlobos, chip, h } from './ui/comp';
import plantillaURL from './assets/planilla_virgen.xlsx';
import { ejemploGuia, ejemploAsimetrico, proyectoVacio, type Proyecto } from './engine/modelo';
import { celdasAEscribir, escribirPlanilla, leerPlanilla } from './xlsx/planilla';
import { leerLibro, leerTexto, escribirLibro } from './xlsx/tablas';
import { interpretar, murosDeLineas, unidadProbable, tablaDelProyecto, type Importacion } from './engine/importar';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let plantillaAbierta: ArrayBuffer | null = null;

// ------------------------------------------------------------------ riel, franja, panel, centro, avance
const rolDe = (e: Etapa) => `var(${e.rol})`;
function dibujarRiel() {
  const riel = $('riel');
  const boton = (e: Etapa) => {
    const b = h('button', { type: 'button', 'aria-current': String(e.id === estado.etapa), 'data-globo': e.globo, title: `${e.nro} · ${e.nombre}` });
    b.style.setProperty('--rol', rolDe(e));
    const ic = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ic.setAttribute('viewBox', '0 0 26 24'); ic.setAttribute('aria-hidden', 'true');
    ic.innerHTML = e.icono;
    const est = e.estado();
    b.append(ic, e.nombre, h('span', { class: `punto ${est.replace(' ', '-')}`, title: est }));
    b.addEventListener('click', () => irA(e.id));
    return b;
  };
  const fin = h('div', { class: 'riel-fin' }, ...ETAPAS_FIN.map(boton));
  riel.replaceChildren(...ETAPAS.map(boton), fin);
}
function irA(id: string) {
  estado.etapa = id;
  try { localStorage.setItem('torre3d.etapa', id); } catch { /* sin almacenamiento */ }
  dibujarTodo();
  $('panel').scrollTop = 0;
}
function dibujarPanel() {
  const e = etapaPorId(estado.etapa);
  const lat = $('lateral');
  lat.style.setProperty('--rol', rolDe(e));
  lat.style.setProperty('--rolb', `var(${e.rol.replace('--r-', '--rb-')})`);
  $('banda-nro').textContent = e.nro;
  $('banda-titulo').textContent = e.id === 'flexion' ? 'Flexocompresión' : e.id === 'rototrasl' ? 'Rototraslación' : e.nombre;
  const sp = $('subpasos');
  const sub = estado.sub[e.id] ?? e.sub?.[0] ?? '';
  sp.replaceChildren(...(e.sub ?? []).map((s, i) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(s === sub) }, `${i + 1} · ${s}${s === 'Avisos' && cantidadAvisos() ? ` (${cantidadAvisos()})` : ''}`);
    b.addEventListener('click', () => { estado.sub[e.id] = s; dibujarPanel(); $('panel').scrollTop = 0; });
    return b;
  }));
  sp.hidden = !e.sub?.length;
  const p = $('panel');
  const y = p.scrollTop;
  p.replaceChildren();
  if (estado.calculo.error) p.append(h('p', { class: 'error' }, `Error en el cálculo: ${estado.calculo.error}`));
  try { e.panel(p, sub); } catch (err) { console.error(err); p.append(h('p', { class: 'error' }, `No se pudo armar el panel: ${String(err)}`)); }
  p.scrollTop = y;
}
function dibujarTira(e: Etapa) {
  const t = $('tira-centro');
  t.replaceChildren(h('span', { class: 'nombre' }, e.nombreCentro()), h('span', { class: 'espacio' }));
  if (e.conFuente) {
    const seg = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Valores', 'data-globo': 'Valores|«Planilla»: lo que calcula el Excel original, tal cual. «Guía/CIRSOC»: con Kz mínimo de 5 m, sin viento en PB ni en los subsuelos, el J completo y el momento de rotación en unidades correctas.' });
    ([['planilla', 'Planilla'], ['guia', 'Guía/CIRSOC']] as const).forEach(([k, txt]) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(estado.fuente === k) }, txt);
      b.addEventListener('click', () => { estado.fuente = k; dibujarTodo(); });
      seg.append(b);
    });
    t.append(h('span', { class: 'nota chica' }, 'Valores'), seg);
  }
  const seg = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Dirección del viento', 'data-globo': 'Viento A y B|El viento A empuja la cara mayor (ancho B) y lo toman los tabiques paralelos (hoja «J Tabiques paralelos»). El viento B empuja la cara menor y lo toman los ortogonales.' });
  (['A', 'B'] as const).forEach(dd => {
    const b = h('button', { type: 'button', 'aria-pressed': String(estado.dir === dd) }, `Viento ${dd}`);
    b.addEventListener('click', () => { estado.dir = dd; estado.cambiar(); });
    seg.append(b);
  });
  t.append(seg);
}
let ultimoTam = '';
function dibujarCentro() {
  const e = etapaPorId(estado.etapa);
  dibujarTira(e);
  const planta = $('vista-planta'), dib = $('centro-dibujos'), lienzo = $('lienzo');
  if (e.centro === 'planta') { planta.hidden = false; dib.hidden = true; lienzo.style.overflow = 'hidden'; return; }
  planta.hidden = true; dib.hidden = false; lienzo.style.overflow = 'auto';
  const tam = { ancho: Math.max(320, lienzo.clientWidth - 34), alto: Math.max(360, lienzo.clientHeight - 30) };
  ultimoTam = `${tam.ancho}x${tam.alto}`;
  const y = lienzo.scrollTop;
  dib.replaceChildren();
  try { e.centro(dib, tam); } catch (err) { console.error(err); dib.append(h('p', { class: 'error' }, `No se pudo dibujar: ${String(err)}`)); }
  // cada dibujo se puede guardar como SVG o PNG
  botonesExportar(dib, `torre3d_${e.id}_viento${estado.dir}${estado.sub[e.id] ? `_${estado.sub[e.id]}` : ''}`.replace(/[^\w-]+/g, '_'));
  lienzo.scrollTop = y;
}
function dibujarAvance() {
  const a = $('avance');
  a.replaceChildren(h('h4', {}, 'Avance de la planilla'), ...ETAPAS.map(e => {
    const est = e.estado();
    const b = h('button', { type: 'button', 'aria-current': String(e.id === estado.etapa) }, h('span', { class: 'nro' }, e.nro), h('span', { class: 'nom' }, e.nombre), chip(est === 'pendiente' ? 'pendiente' : est, est === 'revisar' && e.id === 'flexion' ? 'armadura' : est));
    b.addEventListener('click', () => irA(e.id));
    return b;
  }));
}
function dibujarCapas() {
  const c = $('capas');
  const capas: [keyof typeof estado.capas, string, string][] = [['losas', 'Losas', 'var(--ink2)'], ['viento', 'Viento', 'var(--carga)'], ['fuera', 'Fuera del cálculo', 'var(--dim)'], ['deformada', 'Deformada (exagerada)', 'var(--deformada)']];
  c.replaceChildren(...capas.map(([k, t, col]) => {
    const b = h('button', { type: 'button', class: 'chip-capa', 'aria-pressed': String(estado.capas[k]) }, h('i', {}), t);
    b.style.setProperty('--c', col);
    b.addEventListener('click', () => { estado.capas[k] = !estado.capas[k]; dibujarCapas(); estado.avisarSeleccion(); });
    return b;
  }));
}
function dibujarEstadoCalculo() {
  const cs = estado.calculo.controles ?? [];
  const malos = cs.filter(c => c.estado === 'no verifica').length, revisar = cs.filter(c => c.estado === 'atención').length;
  const el = $('estado-calculo');
  el.className = `chip-estado ${estado.calculo.error || malos ? 'no-verifica' : revisar ? 'revisar' : 'verifica'}`;
  el.textContent = estado.calculo.error ? 'Error en el cálculo' : malos ? `${malos} control${malos > 1 ? 'es' : ''} no verifica${malos > 1 ? 'n' : ''}` : revisar ? `Verifica · ${revisar} a revisar` : 'Todo verifica';
  el.setAttribute('data-globo', 'Estado del cálculo|Cuenta los controles de todas las etapas. «A revisar» son puntos que verifican pero piden atención: armadura por tracción, edificio flexible o una pregunta abierta para la cátedra.');
  el.style.cursor = 'pointer';
  el.onclick = () => irA('resumen');
}
function dibujarTodo() {
  $<HTMLButtonElement>('b-deshacer').disabled = !estado.puedeDeshacer;
  $<HTMLButtonElement>('b-rehacer').disabled = !estado.puedeRehacer;
  $('nombre-proyecto').textContent = estado.proyecto.nombre;
  dibujarRiel(); dibujarPanel(); dibujarCentro(); dibujarAvance(); dibujarEstadoCalculo();
}
export function mensaje(t: string) { $('mensaje').textContent = t; }

function descargar(nombre: string, datos: BlobPart, tipo: string) {
  const url = URL.createObjectURL(new Blob([datos], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const nombreArchivo = (ext: string) => (estado.proyecto.nombre || 'torre').replace(/[^\wáéíóúñÁÉÍÓÚÑ -]/g, '').trim().replace(/\s+/g, '_') + ext;

function dialogo(html: string, botones: [string, () => void | Promise<void>, boolean?][]) {
  const d = $<HTMLDialogElement>('dialogo');
  d.innerHTML = html;
  const fila = document.createElement('div');
  fila.className = 'fila-acciones derecha-al-final';
  botones.forEach(([t, f, prim]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = t; if (prim) b.className = 'primario';
    b.addEventListener('click', async () => { await f(); });
    fila.append(b);
  });
  d.append(fila);
  d.showModal();
}

/** muestra un error en un diálogo en vez de fallar en silencio */
function fallo(titulo: string, e: unknown) {
  console.error(e);
  const msg = e instanceof Error ? e.message : String(e);
  dialogo(`<h2>${titulo}</h2><p class="error"></p><p class="nota">Si el problema sigue, guardá el proyecto (.json) y mandalo junto con este mensaje.</p>`, [['Cerrar', () => $<HTMLDialogElement>('dialogo').close(), true]]);
  $('dialogo').querySelector('.error')!.textContent = msg;
}

async function exportar() {
  if (estado.calculo.error) { fallo('No se puede escribir la planilla', `El cálculo tiene un error: ${estado.calculo.error}`); return; }
  const { asig, res } = estado.calculo;
  const celdas = celdasAEscribir(asig.datos, res);
  const filas = Object.entries(celdas).map(([hoja, cs]) => `<li><b>${hoja}</b>: ${Object.keys(cs).length} celdas</li>`).join('');
  dialogo(`<h2>Escribir la planilla</h2>
    <p>La app escribe solo celdas de datos de la planilla ${plantillaAbierta ? 'que abriste' : 'virgen del curso'} y agrega la hoja «T3D» con el proyecto. No cambia ninguna fórmula, salvo las del último piso (C y D de M,NyQ), que se escriben a mano como indica la planilla.</p>
    <ul>${filas}<li><b>T3D</b>: hoja nueva</li></ul>
    ${cantidadAvisos() ? `<p class="error">${cantidadAvisos() === 1 ? 'Hay 1 aviso: revisalo' : `Hay ${cantidadAvisos()} avisos: revisalos`} en la pestaña «Avisos».</p>` : ''}
    <p class="nota">Al abrirla, Excel o LibreOffice recalculan todo.</p>`, [
    ['Cancelar', () => $<HTMLDialogElement>('dialogo').close()],
    ['Escribir y descargar', async () => {
      try {
        const base = plantillaAbierta ?? await (await fetch(plantillaURL)).arrayBuffer();
        const bytes = await escribirPlanilla(base, asig.datos, res, estado.proyecto);
        descargar(nombreArchivo('.xlsx'), bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $<HTMLDialogElement>('dialogo').close();
      } catch (e) { fallo('No se pudo escribir la planilla', e); }
    }, true],
  ]);
}

function proyectoValido(x: unknown): x is Proyecto {
  const p = x as Proyecto;
  return !!p && p.version === 1 && Array.isArray(p.niveles) && Array.isArray(p.muros) && !!p.sitio && !!p.fundacion;
}

async function abrir(f: File) {
  try { await abrirArchivo(f); } catch (e) { fallo(`No se pudo abrir «${f.name}»`, e); }
}
async function abrirArchivo(f: File) {
  const buf = await f.arrayBuffer();
  if (f.name.toLowerCase().endsWith('.json')) {
    const p: unknown = JSON.parse(new TextDecoder().decode(buf));
    if (!proyectoValido(p)) throw new Error('El archivo no es un proyecto de Torre 3D.');
    plantillaAbierta = null; reemplazarConCopia(p); return;
  }
  const nombre = f.name.toLowerCase();
  if (/\.(csv|tsv|txt)$/.test(nombre)) { dialogoImportar(interpretar(leerTexto(new TextDecoder().decode(buf), f.name)), f.name, null); return; }
  const leido = await leerPlanilla(buf);
  if (leido.proyecto) {
    if (!proyectoValido(leido.proyecto)) throw new Error('La hoja «T3D» de la planilla está dañada.');
    plantillaAbierta = buf;
    reemplazarConCopia(leido.proyecto); return;
  }
  const imp = interpretar(await leerLibro(buf));
  dialogoImportar(imp, f.name, imp.tipo === 'planilla' ? buf : null);
}

/** Resumen de lo que se va a importar, con las opciones de cada tipo; nada cambia hasta «Importar». */
function dialogoImportar(imp: Importacion, archivo: string, planilla: ArrayBuffer | null) {
  const hayMuros = imp.muros.length > 0 || imp.lineas.length > 0;
  const capas = [...new Set(imp.lineas.map(l => l.capa).filter(Boolean))] as string[];
  const unidad = imp.lineas.length ? unidadProbable(imp.lineas) : 'm';
  const titulo = imp.tipo === 'planilla' ? 'Importar la planilla del curso' : imp.tipo === 'lineas' ? 'Importar líneas (AutoCAD)' : 'Importar tabla';
  const partes: string[] = [];
  if (imp.niveles) partes.push(`${imp.niveles.length} niveles`);
  if (imp.muros.length) partes.push(`${imp.muros.length} muros`);
  if (imp.lineas.length) partes.push(`${imp.lineas.length} líneas`);
  if (imp.sitio) partes.push('datos del viento y de la fundación');
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  dialogo(`<h2>${titulo}</h2>
    <p>«${esc(archivo)}»: ${partes.join(', ') || 'nada para importar'}.</p>
    ${imp.lineas.length ? `<div class="grilla2">
      <label class="campo"><span>Unidad del dibujo</span><select id="imp-unidad">${['m', 'cm', 'mm'].map(u => `<option ${u === unidad ? 'selected' : ''}>${u}</option>`).join('')}</select><small>la app la estimó por el largo de las líneas</small></label>
      <label class="campo"><span>Espesor de los muros (m)</span><input id="imp-esp" type="number" step="any" value="0.2"><small>si la tabla no lo trae</small></label>
      ${capas.length > 1 ? `<label class="campo"><span>Capa</span><select id="imp-capa"><option value="">todas</option>${capas.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>` : ''}
      <label class="campo"><span>Centrar</span><select id="imp-centrar"><option value="1">sí: centro del dibujo en (0, 0)</option><option value="0">no: coordenadas como vienen</option></select></label>
    </div><p class="nota">Cada línea es el eje de un muro. Después asigná las piezas en la pestaña «Muros».</p>` : ''}
    ${hayMuros ? `<label class="campo"><span>Muros</span><select id="imp-modo"><option value="reemplazar">reemplazar los muros actuales</option><option value="agregar">agregar a los actuales</option></select></label>` : ''}
    ${imp.niveles ? `<label class="campo"><span>Niveles</span><select id="imp-niv"><option value="1">reemplazar los niveles</option><option value="0">dejar los actuales</option></select></label>` : ''}
    ${imp.sitio ? `<label class="campo"><span>Viento y fundación</span><select id="imp-sitio"><option value="1">tomar los de la planilla</option><option value="0">dejar los actuales</option></select></label>` : ''}
    ${imp.avisos.length ? `<ul class="avisos nota">${imp.avisos.slice(0, 8).map(a => `<li>${esc(a)}</li>`).join('')}${imp.avisos.length > 8 ? `<li>… y ${imp.avisos.length - 8} avisos más</li>` : ''}</ul>` : ''}`, [
    ['Cancelar', () => $<HTMLDialogElement>('dialogo').close()],
    ['Importar', () => {
      const d = $<HTMLDialogElement>('dialogo');
      const v = (id: string) => (d.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement | null)?.value;
      const avisos: string[] = [];
      let muros = imp.muros;
      if (imp.lineas.length) {
        const capa = v('imp-capa') || '';
        const escala = { m: 1, cm: 0.01, mm: 0.001 }[v('imp-unidad') as 'm' | 'cm' | 'mm'] ?? 1;
        muros = [...muros, ...murosDeLineas(imp.lineas.filter(l => !capa || l.capa === capa), { escala, centrar: v('imp-centrar') !== '0', espesor: Number(v('imp-esp')) || 0.2 }, avisos)];
      }
      estado.cambiar(p => {
        if (hayMuros) {
          if (v('imp-modo') === 'agregar') {
            const ids = new Set(p.muros.map(m => m.id));
            muros = muros.map(m => { let id = m.id, k = 2; while (ids.has(id)) id = `${m.id}_${k++}`; ids.add(id); return { ...m, id }; });
            p.muros = [...p.muros, ...muros];
          } else p.muros = muros;
        }
        if (imp.niveles && v('imp-niv') !== '0') p.niveles = imp.niveles;
        if (imp.sitio && v('imp-sitio') !== '0') { p.sitio = { ...p.sitio, ...imp.sitio }; if (imp.fundacion) p.fundacion = imp.fundacion; }
        if (imp.tipo === 'planilla' && v('imp-modo') !== 'agregar') p.nombre = archivo.replace(/\.[^.]+$/, '');
      });
      if (planilla) plantillaAbierta = planilla;
      estado.seleccion = null;
      d.close();
      if (avisos.length) dialogo(`<h2>Importado</h2><ul class="avisos">${avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`, [['Entendido', () => $<HTMLDialogElement>('dialogo').close(), true]]);
    }, true],
  ]);
}

async function descargarTabla() {
  try {
    const bytes = await escribirLibro(tablaDelProyecto(estado.proyecto.niveles, estado.proyecto.muros));
    descargar(nombreArchivo('_tabla.xlsx'), bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (e) { fallo('No se pudo armar la tabla', e); }
}
document.addEventListener('torre:importar', () => $<HTMLInputElement>('b-abrir').click());
document.addEventListener('torre:tabla', () => { void descargarTabla(); });

$('b-deshacer').addEventListener('click', () => estado.deshacer());
$('b-rehacer').addEventListener('click', () => estado.rehacer());
document.addEventListener('keydown', ev => {
  const t = ev.target as HTMLElement;
  const escribiendo = t.matches('input, select, textarea') || $<HTMLDialogElement>('dialogo').open;
  if (escribiendo) return;
  const k = ev.key.toLowerCase();
  if ((ev.ctrlKey || ev.metaKey) && k === 'z') { ev.preventDefault(); if (ev.shiftKey) estado.rehacer(); else estado.deshacer(); }
  else if ((ev.ctrlKey || ev.metaKey) && k === 'y') { ev.preventDefault(); estado.rehacer(); }
  else if ((ev.key === 'Delete' || ev.key === 'Backspace') && estado.seleccion) {
    ev.preventDefault();
    const id = estado.seleccion;
    estado.cambiar(p => { p.muros = p.muros.filter(m => m.id !== id); });
    estado.seleccion = null; estado.cambiar();
  }
});
window.addEventListener('error', e => fallo('Error inesperado', e.error ?? e.message));
window.addEventListener('unhandledrejection', e => fallo('Error inesperado', e.reason));

$('b-ejemplo').addEventListener('click', () => { plantillaAbierta = null; reemplazarConCopia(ejemploGuia()); cerrarMenus(); mensaje('Cargado el ejemplo de la guía 2024 (Neuquén, 20 pisos).'); });
$('b-ejemplo-asim').addEventListener('click', () => { plantillaAbierta = null; reemplazarConCopia(ejemploAsimetrico()); cerrarMenus(); mensaje('Cargado el Anexo de la guía: T5 aislado, la planta rota.'); });
$('b-nuevo').addEventListener('click', () => { plantillaAbierta = null; reemplazarConCopia(proyectoVacio()); estado.etapa = 'diseno'; estado.sub.diseno = 'Niveles'; dibujarTodo(); cerrarMenus(); });
$('b-guardar').addEventListener('click', () => { descargar(nombreArchivo('.json'), JSON.stringify(estado.proyecto, null, 1), 'application/json'); cerrarMenus(); });
$('b-tabla').addEventListener('click', () => { void descargarTabla(); cerrarMenus(); });
$('b-informe').addEventListener('click', () => { cerrarMenus(); imprimirInforme(); });
$('b-desglose').addEventListener('click', () => { cerrarMenus(); mensaje('Armando el desglose con los dibujos…'); imprimirDesglose().catch(e => fallo('No se pudo armar el desglose', e)); });
$('b-desglose-pptx').addEventListener('click', () => { cerrarMenus(); mensaje('Armando el PowerPoint…'); descargarPPTX().then(n => mensaje(`Desglose en PowerPoint: ${n} diapositivas.`)).catch(e => fallo('No se pudo armar el PowerPoint', e)); });
$('b-recorrido').addEventListener('click', () => { cerrarMenus(); recorrido(0); });
recorridoSiEsPrimeraVez();
$('b-lamina').addEventListener('click', () => { cerrarMenus(); imprimirLaminas(); });

// «Mis proyectos»: versiones en el navegador
function armarMis() {
  const m = $('m-mis'); m.replaceChildren();
  const guardar = h('button', { type: 'button', role: 'menuitem' }, 'Guardar una versión ahora', h('span', { class: 'pista' }, 'Con nombre, en este navegador'));
  guardar.addEventListener('click', () => {
    const n = window.prompt('Nombre de la versión:', `${estado.proyecto.nombre || 'Proyecto'} · ${fechaCorta(Date.now())}`);
    if (n === null) return;
    mensaje(guardarVersion(estado.proyecto, n) ? `Versión guardada: ${n}.` : 'El navegador no tiene más lugar: borrá versiones viejas o guardá el proyecto como .json.');
    cerrarMenus();
  });
  m.append(guardar);
  const vs = versiones();
  if (!vs.length) m.append(h('p', { class: 'menu-nota' }, 'Todavía no hay versiones. Se guarda una copia sola cada vez que abrís un ejemplo u otro archivo.'));
  vs.forEach(v => {
    const fila = h('div', { class: 'mis-fila' });
    const abrir = h('button', { type: 'button', role: 'menuitem', title: 'Abrir esta versión (la actual se guarda antes como copia automática)' }, v.nombre, h('span', { class: 'pista' }, `${fechaCorta(v.fecha)} · ${v.pisos} niveles · ${v.muros} muros${v.auto ? ' · copia automática' : ''}`));
    abrir.addEventListener('click', () => { const p = leerVersion(v.id); if (!p) return; reemplazarConCopia(p); cerrarMenus(); mensaje(`Abierta la versión «${v.nombre}».`); });
    const cmp = h('button', { type: 'button', class: 'glifo', title: `Comparar «${v.nombre}» con el proyecto actual`, 'aria-label': `Comparar ${v.nombre}` }, '⇄');
    cmp.addEventListener('click', ev => {
      ev.stopPropagation(); cerrarMenus();
      const p = leerVersion(v.id); if (!p) return;
      try {
        const html = tablaComparacion(comparar(p, estado.proyecto), v.nombre, 'Actual');
        dialogo(`<h2>Comparar con «${v.nombre.replace(/</g, '&lt;')}»</h2><p class="nota">Valores según la guía/CIRSOC. ✓ verifica, ✗ no verifica; en amarillo, los controles que cambian de estado.</p><div class="cmp-caja">${html}</div>`, [['Cerrar', () => $<HTMLDialogElement>('dialogo').close(), true]]);
      } catch (e) { fallo('No se pudo comparar', e); }
    });
    const borrar = h('button', { type: 'button', class: 'glifo', title: `Borrar «${v.nombre}»`, 'aria-label': `Borrar ${v.nombre}` }, '✕');
    borrar.addEventListener('click', ev => { ev.stopPropagation(); if (window.confirm(`¿Borrar la versión «${v.nombre}»?`)) { borrarVersion(v.id); armarMis(); } });
    fila.append(abrir, cmp, borrar); m.append(fila);
  });
}
/** antes de cambiar de proyecto, el actual queda guardado como copia automática */
function reemplazarConCopia(p: Proyecto) {
  guardarVersion(estado.proyecto, `${estado.proyecto.nombre || 'Proyecto'} (antes de abrir otro)`, true);
  estado.reemplazar(p);
}
// menús desplegables (tarjetas)
function cerrarMenus() { document.querySelectorAll('.menu.abierto').forEach(m => { m.classList.remove('abierto'); (m.previousElementSibling as HTMLElement | null)?.setAttribute('aria-expanded', 'false'); }); }
([['b-ejemplos', 'm-ejemplos'], ['b-mis', 'm-mis'], ['b-mostrar', 'm-mostrar'], ['b-exportar-menu', 'm-exportar']] as const).forEach(([b, m]) => {
  $(b).addEventListener('click', ev => { ev.stopPropagation(); if (m === 'm-mis') armarMis(); const abierto = $(m).classList.contains('abierto'); cerrarMenus(); if (!abierto) { $(m).classList.add('abierto'); $(b).setAttribute('aria-expanded', 'true'); } });
});
document.addEventListener('click', ev => { if (!(ev.target as Element).closest('.menu')) cerrarMenus(); });
// aspecto: sistema, clásico o tablero oscuro
function aplicarTema(t: string) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('torre3d.tema', t); } catch { /* sin almacenamiento */ }
  estado.avisarSeleccion();
}
document.querySelectorAll<HTMLButtonElement>('#m-mostrar [data-tema]').forEach(b => b.addEventListener('click', () => { aplicarTema(b.dataset.tema ?? ''); cerrarMenus(); dibujarTodo(); }));
try { aplicarTema(localStorage.getItem('torre3d.tema') ?? ''); estado.etapa = localStorage.getItem('torre3d.etapa') ?? 'diseno'; } catch { /* sin almacenamiento */ }
if (!todas().some(e => e.id === estado.etapa)) estado.etapa = 'diseno';
// teclas Alt+1…9: etapas
document.addEventListener('keydown', ev => {
  if (!ev.altKey || ev.ctrlKey || ev.metaKey) return;
  const k = Number(ev.key);
  if (k >= 1 && k <= ETAPAS.length) { ev.preventDefault(); irA(ETAPAS[k - 1].id); }
});
$('b-exportar').addEventListener('click', () => { void exportar(); });
$<HTMLInputElement>('b-abrir').addEventListener('change', e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void abrir(f); (e.target as HTMLInputElement).value = ''; });

estado.suscribir(dibujarTodo);
estado.suscribirSeleccion(() => { if (etapaPorId(estado.etapa).centro !== 'planta') dibujarCentro(); });
montarPlanta($('vista-planta'));
montar3D($('vista-3d'), { deformada: () => estado.capas.deformada, roto: datosRoto3D, rotulo: true });
$('b-encuadrar').addEventListener('click', () => $('vista-3d').querySelector('canvas')?.dispatchEvent(new MouseEvent('dblclick')));
new ResizeObserver(() => {
  const l = $('lienzo');
  const t = `${Math.max(320, l.clientWidth - 34)}x${Math.max(360, l.clientHeight - 30)}`;
  if (t !== ultimoTam && etapaPorId(estado.etapa).centro !== 'planta') { clearTimeout(rz); rz = window.setTimeout(dibujarCentro, 120); }
}).observe($('lienzo'));
let rz: number | undefined;
activarGlobos();
dibujarCapas();
dibujarTodo();
// aviso de autoría: si la licencia ya venció, el pie lo dice
{ const a = document.getElementById('autoria'); if (a) a.textContent = avisoActual(); }
