import './estilo.css';
import { estado } from './ui/estado';
import { montarPlanta } from './ui/planta';
import { montar3D } from './ui/vista3d';
import { PANELES } from './ui/paneles';
import { ejemploGuia, proyectoVacio, type Proyecto } from './engine/modelo';
import { celdasAEscribir, escribirPlanilla, leerPlanilla } from './xlsx/planilla';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let pestana = 'Sitio';
let plantillaAbierta: ArrayBuffer | null = null;

function dibujarPestanas() {
  const nav = $('pestanas');
  nav.replaceChildren(...Object.keys(PANELES).map(k => {
    const b = document.createElement('button');
    b.type = 'button'; b.role = 'tab'; b.textContent = k;
    b.setAttribute('aria-selected', String(k === pestana));
    if (k === 'Avisos') { const n = estado.calculo.asig?.avisos.length ?? 0; if (n) b.textContent = `Avisos (${n})`; }
    b.addEventListener('click', () => { pestana = k; dibujarPanel(); dibujarPestanas(); });
    return b;
  }));
}
function dibujarPanel() {
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

async function exportar() {
  const { asig, res } = estado.calculo;
  const celdas = celdasAEscribir(asig.datos, res);
  const filas = Object.entries(celdas).map(([hoja, cs]) => `<li><b>${hoja}</b>: ${Object.keys(cs).length} celdas</li>`).join('');
  dialogo(`<h2>Escribir la planilla</h2>
    <p>La app escribe solo celdas de datos de la planilla ${plantillaAbierta ? 'que abriste' : 'virgen del curso'} y agrega la hoja «T3D» con el proyecto. No cambia ninguna fórmula, salvo las del último piso (C y D de M,NyQ), que se escriben a mano como indica la planilla.</p>
    <ul>${filas}<li><b>T3D</b>: hoja nueva</li></ul>
    ${asig.avisos.length ? `<p class="error">${asig.avisos.length === 1 ? 'Hay 1 aviso: revisalo' : `Hay ${asig.avisos.length} avisos: revisalos`} en la pestaña «Avisos».</p>` : ''}
    <p class="nota">Al abrirla, Excel o LibreOffice recalculan todo.</p>`, [
    ['Cancelar', () => $<HTMLDialogElement>('dialogo').close()],
    ['Escribir y descargar', async () => {
      const base = plantillaAbierta ?? await (await fetch('./planilla_virgen.xlsx')).arrayBuffer();
      const bytes = await escribirPlanilla(base, asig.datos, res, estado.proyecto);
      descargar(nombreArchivo('.xlsx'), bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      $<HTMLDialogElement>('dialogo').close();
    }, true],
  ]);
}

async function abrir(f: File) {
  const buf = await f.arrayBuffer();
  if (f.name.toLowerCase().endsWith('.json')) { estado.reemplazar(JSON.parse(new TextDecoder().decode(buf)) as Proyecto); return; }
  const leido = await leerPlanilla(buf);
  plantillaAbierta = buf;
  if (leido.proyecto) { estado.reemplazar(leido.proyecto); return; }
  // planilla sin hoja T3D: se toman los datos del viento y las cotas; los muros se dibujan en la app
  const p = { ...estado.proyecto, sitio: { ...estado.proyecto.sitio, ...Object.fromEntries(Object.entries(leido.sitio).filter(([, v]) => v !== undefined)) } };
  const cotas = leido.cotas;
  const nombres = Array.from({ length: 54 }, (_, i) => (i <= 50 ? `${50 - i}º` : `${i - 50}º SS`));
  nombres[50] = 'PB';
  const niveles = cotas.map((z, i) => ({ nombre: nombres[i], cota: z })).filter((n, i) => i >= 50 || n.cota > 0);
  if (niveles.length) { niveles[0].nombre = 'Azotea'; (niveles[0] as { B?: number; L?: number }).B = p.niveles[0]?.B ?? 20; (niveles[0] as { L?: number }).L = p.niveles[0]?.L ?? 16; p.niveles = niveles; }
  estado.reemplazar(p);
  dialogo('<h2>Planilla abierta</h2><p>La planilla no tenía la hoja «T3D»: se cargaron los datos del viento y las cotas. Dibujá los muros en la planta.</p>', [['Entendido', () => $<HTMLDialogElement>('dialogo').close(), true]]);
}

function cambiarDir(d: 'A' | 'B') {
  estado.dir = d;
  $('dir-A').setAttribute('aria-pressed', String(d === 'A'));
  $('dir-B').setAttribute('aria-pressed', String(d === 'B'));
  estado.cambiar();
}

$('dir-A').addEventListener('click', () => cambiarDir('A'));
$('dir-B').addEventListener('click', () => cambiarDir('B'));
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
