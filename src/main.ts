import './estilo.css';
import { estado } from './ui/estado';
import { montarPlanta } from './ui/planta';
import { montar3D } from './ui/vista3d';
import { PANELES, cantidadAvisos } from './ui/paneles';
import plantillaURL from './assets/planilla_virgen.xlsx';
import { ejemploGuia, proyectoVacio, type Proyecto } from './engine/modelo';
import { celdasAEscribir, escribirPlanilla, leerPlanilla } from './xlsx/planilla';
import { leerLibro, leerTexto, escribirLibro } from './xlsx/tablas';
import { interpretar, murosDeLineas, unidadProbable, tablaDelProyecto, type Importacion } from './engine/importar';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let pestana = 'Sitio';
let plantillaAbierta: ArrayBuffer | null = null;

function dibujarPestanas() {
  const nav = $('pestanas');
  nav.replaceChildren(...Object.keys(PANELES).map(k => {
    const b = document.createElement('button');
    b.type = 'button'; b.role = 'tab'; b.textContent = k;
    b.setAttribute('aria-selected', String(k === pestana));
    if (k === 'Avisos') { const n = cantidadAvisos(); if (n) b.textContent = `Avisos (${n})`; }
    b.addEventListener('click', () => { pestana = k; dibujarPanel(); dibujarPestanas(); });
    return b;
  }));
}
function dibujarPanel() {
  $<HTMLButtonElement>('b-deshacer').disabled = !estado.puedeDeshacer;
  $<HTMLButtonElement>('b-rehacer').disabled = !estado.puedeRehacer;
  const p = $('panel');
  const y = p.scrollTop;
  p.replaceChildren();
  PANELES[pestana](p);
  p.scrollTop = y;
  $('nombre-proyecto').textContent = estado.proyecto.nombre;
}

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
  fila.className = 'fila-acciones derecha';
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
    plantillaAbierta = null; estado.reemplazar(p); return;
  }
  const nombre = f.name.toLowerCase();
  if (/\.(csv|tsv|txt)$/.test(nombre)) { dialogoImportar(interpretar(leerTexto(new TextDecoder().decode(buf), f.name)), f.name, null); return; }
  const leido = await leerPlanilla(buf);
  if (leido.proyecto) {
    if (!proyectoValido(leido.proyecto)) throw new Error('La hoja «T3D» de la planilla está dañada.');
    plantillaAbierta = buf;
    estado.reemplazar(leido.proyecto); return;
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

function cambiarDir(d: 'A' | 'B') {
  estado.dir = d;
  $('dir-A').setAttribute('aria-pressed', String(d === 'A'));
  $('dir-B').setAttribute('aria-pressed', String(d === 'B'));
  estado.cambiar();
}

$('dir-A').addEventListener('click', () => cambiarDir('A'));
$('dir-B').addEventListener('click', () => cambiarDir('B'));
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

$('b-ejemplo').addEventListener('click', () => { plantillaAbierta = null; estado.reemplazar(ejemploGuia()); });
$('b-nuevo').addEventListener('click', () => { plantillaAbierta = null; estado.reemplazar(proyectoVacio()); pestana = 'Niveles'; dibujarPestanas(); dibujarPanel(); });
$('b-guardar').addEventListener('click', () => descargar(nombreArchivo('.json'), JSON.stringify(estado.proyecto, null, 1), 'application/json'));
$('b-exportar').addEventListener('click', () => { void exportar(); });
$<HTMLInputElement>('b-abrir').addEventListener('change', e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void abrir(f); (e.target as HTMLInputElement).value = ''; });

estado.suscribir(() => { dibujarPanel(); dibujarPestanas(); });
montarPlanta($('vista-planta'));
montar3D($('vista-3d'));
dibujarPestanas();
dibujarPanel();
