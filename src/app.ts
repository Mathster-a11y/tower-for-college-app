import './compat';
import { pedirTexto, confirmar, avisar } from './ui/tarjeta';
import { montarDivisores } from './ui/divisores';
import { SincroSheets, paquete, proyectoDesdeHoja, type Lectura } from './sync/sheets';
import './estilo.css';
import { estado, calcularProyecto } from './ui/estado';
import { montarPlanta } from './ui/planta';
import { montar3D } from './ui/montar3d';
import { ultimaDeformada } from './ui/deformadaAuto';
import { botonesExportar } from './ui/exportarDibujo';
import { avisoActual } from './autoria';
import { recorrido, recorridoSiEsPrimeraVez } from './ui/recorrido';
import { tablaComparacion, comparar } from './ui/comparar';
import { borrarVersion, fechaCorta, guardarVersion, leerVersion, versiones } from './ui/biblioteca';
import { cantidadAvisos } from './ui/paneles';
import { ETAPAS, ETAPAS_FIN, etapaPorId, todas, datosRoto3D, type Etapa } from './ui/etapas';
import { montarPresentacion } from './ui/modoPresentacion';
import { ponerPredecir, predecirActivo, tarjetaPredecir } from './ui/predecir';
import { activarGlobos, aplicarMat, chip, esc, h, hacerPlegable, plegarExplicaciones, plegarSeccion, plegarTodas } from './ui/comp';
import { hiloDeEtapa } from './ui/hilo';
import { leerProyecto, textoErrores } from './engine/lector';
import { IDS_METODO, METODOS, VERSION_FORMULAS, configDe, configMotor, describirConfig } from './engine/metodos/tipos';
import { tarjeta } from './ui/tarjeta';
import { resaltarFilas } from './ui/grilla';
import plantillaURL from './assets/planilla_virgen.xlsx';
import plantilla2025URL from './assets/planilla_catedra_2025.xlsx';
import { usarConfig, type Motor } from './engine/config';
import { aPlanilla } from './engine/mapping';
import { calcularPlanilla } from './engine/planilla';
import { ejemploGuia, ejemploAsimetrico, proyectoVacio } from './engine/modelo';
import { ejemploCiticorpFachada } from './engine/ejemploCiticorpFachada';
import { capturar3D, vistas3D } from './ui/vistas';
import { ejemploBasicoExo, ejemploGherkin, ejemploHancock, ejemploHearst, ejemploOnterie, ejemploShanghai } from './engine/ejemplosExo';
import { TORRES_PRUEBA, armarTorre } from './engine/torresPrueba';
import { ejemploPlanta34 } from './engine/ejemplo34';
import { datos201De } from './engine/metodos/cirsoc';
import { datosGuia } from './engine/metodos/guiaPasos';
import { datosExo, exoEnElCalculo } from './ui/exo';
import { montarDiagramaJ } from './ui/diagramaJ';
import { borrarMuros, grupoCerrado, murosDe } from './engine/grupos';
import { TIPOS_EXO, propsSeccion, pesoExo, type EntradaExo } from './engine/exo';
import type { MetaFigura } from './xlsx/figuras';
import { celdasAEscribir } from './xlsx/celdas';
import metaFiguras from './assets/figuras/figuras.json';
// los PNG de los dibujos rediseñados (tools/figuras), por nombre
const urlFiguras = import.meta.glob('./assets/figuras/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
import { interpretar, murosDeLineas, unidadProbable, tablaDelProyecto, type Importacion } from './engine/importar';
import { AVISO_LETRA_PPTX, precargarLetras } from './ui/tipografia';

// los canvas (túneles, llaves de color) dibujan con Plex Sans: pedirla antes del primer cuadro
void precargarLetras();

/** la app completa (el editor). main.ts la arranca, salvo en la pestaña de la vista previa de la planilla. */
export function iniciarApp() {

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
  // el color de la etapa también para los pasos del centro (jerarquía de botones en estilo.css)
  document.documentElement.style.setProperty('--rolb', `var(${e.rol.replace('--r-', '--rb-')})`);
  $('banda-nro').textContent = e.nro;
  $('banda-titulo').textContent = e.id === 'flexion' ? 'Flexocompresión' : e.id === 'rototrasl' ? 'Rototraslación' : e.nombre;
  const sp = $('subpasos');
  const sub = estado.sub[e.id] ?? e.sub?.[0] ?? '';
  sp.replaceChildren(...(e.sub ?? []).map((s, i) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(s === sub) }, `${i + 1} · ${s}${s === 'Avisos' && cantidadAvisos() ? ` (${cantidadAvisos()})` : ''}`);
    b.addEventListener('click', () => { estado.sub[e.id] = s; dibujarPanel(); if (e.id === 'viento' || e.id === 'ecuaciones' || e.id === 'diseno') dibujarCentro(); $('panel').scrollTop = 0; });
    return b;
  }));
  sp.hidden = !e.sub?.length;
  const p = $('panel');
  const y = p.scrollTop;
  p.replaceChildren();
  if (estado.calculo.error) p.append(h('p', { class: 'error' }, `Error en el cálculo: ${estado.calculo.error}`));
  // modo con botón: los resultados de las etapas son los del último cálculo
  // (en vivo, mientras calcula en segundo plano, alcanza con el chip de arriba: el aviso movería el panel en cada cambio)
  if (estado.pendiente && !estado.calculando && e.id !== 'diseno' && e.id !== 'ayuda') {
    const b = h('button', { type: 'button', class: 'chico primario' }, 'Calcular (F9)');
    b.addEventListener('click', () => estado.calcularAhora());
    p.append(h('div', { class: 'aviso-viejo panel-viejo' }, h('span', {}, `Resultados del último cálculo: ${estado.cambiosPendientes} cambio${estado.cambiosPendientes === 1 ? '' : 's'} sin calcular.`), b));
  }
  try { e.panel(p, sub); } catch (err) { console.error(err); p.append(h('p', { class: 'error' }, `No se pudo armar el panel: ${String(err)}`)); }
  // el hilo del cálculo: qué se hace en esta etapa, qué usa y a quién le pasa el resultado
  const hilo = hiloDeEtapa(e.id);
  if (hilo) p.prepend(hilo);
  // las secciones vienen plegadas: un renglón para abrirlas o plegarlas todas juntas
  const secs = p.querySelectorAll('section.seccion.plegable');
  if (secs.length > 1) {
    const ab = h('button', { type: 'button', class: 'enlace' }, 'Abrir todas'), pl = h('button', { type: 'button', class: 'enlace' }, 'Plegar todas');
    ab.addEventListener('click', () => plegarTodas(p, false)); pl.addEventListener('click', () => plegarTodas(p, true));
    // recorrer: abre las secciones de a una, en orden (para seguir una explicación o un tutorial)
    const rec = h('button', { type: 'button', class: 'enlace b-recorrer', title: 'Abre las secciones de a una, en orden' }, 'Recorrer ›');
    let k = -1;
    rec.addEventListener('click', () => {
      const lista = [...p.querySelectorAll<HTMLElement>('section.seccion.plegable')];
      k = (k + 1) % lista.length;
      plegarTodas(p, true);
      const s = lista[k]; s.classList.remove('plegada'); s.querySelector(':scope > .cab')?.setAttribute('aria-expanded', 'true');
      if (s.dataset.clave) plegarSeccion(s.dataset.clave, false);
      s.scrollIntoView({ block: 'start', behavior: 'smooth' });
      rec.textContent = k === lista.length - 1 ? `${k + 1} de ${lista.length} · volver al principio ›` : `${k + 1} de ${lista.length} · siguiente ›`;
    });
    secs[0].before(h('div', { class: 'plegar-todas' }, h('span', { class: 'nota chica' }, `${secs.length} secciones`), rec, ab, pl));
  }
  requestAnimationFrame(() => resaltarEnTablas());
  p.scrollTop = y;
}
/** las opciones de cálculo en la etapa de diseño: plegadas por defecto (se recuerda en este navegador) */
let calcAbierto = (() => { try { return localStorage.getItem('torre3d.calculoAbierto') === '1'; } catch { return false; } })();
const guardarCalcAbierto = () => { try { localStorage.setItem('torre3d.calculoAbierto', calcAbierto ? '1' : '0'); } catch { /* */ } };
function dibujarTira(e: Etapa) {
  const t = $('tira-centro');
  t.replaceChildren(h('span', { class: 'nombre' }, e.nombreCentro()), h('span', { class: 'espacio' }));
  // las opciones de cálculo; en la etapa de diseño quedan plegadas en «Cálculo ▾» (se diseña sin pensar en el método)
  const calc: HTMLElement[] = [];
  // método de cálculo (uno solo, guardado en el proyecto) y sus opciones: versión de la planilla y armado de piezas
  const cfg = estado.config;
  const segMet = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Método de cálculo', 'data-globo': `Método de cálculo|Cada método sigue sus reglas y se guarda con el proyecto (el archivo da lo mismo en cualquier computadora). ${METODOS[cfg.metodo].nombre}: ${METODOS[cfg.metodo].reglas}` });
  IDS_METODO.forEach(k => {
    const m = METODOS[k];
    const b = h('button', { type: 'button', 'aria-pressed': String(cfg.metodo === k), 'data-globo': `${m.nombre}|${m.reglas}${m.disponible ? '' : ` Llega en la ${m.etapa} del plan.`}` }, m.corto);
    if (!m.disponible) { b.setAttribute('disabled', ''); b.classList.add('proximamente'); }
    b.addEventListener('click', () => { if (m.disponible && cfg.metodo !== k) estado.cambiarCalculo({ metodo: k }); });
    segMet.append(b);
  });
  calc.push(h('span', { class: 'par-ctl' }, h('span', { class: 'nota chica' }, 'Método'), segMet));
  if (cfg.metodo === 'planilla' || cfg.metodo === 'combinado') {
    const segV = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Versión de la planilla', 'data-globo': 'Versión de la planilla|«Anterior»: replica la planilla anterior del repositorio (20 filas en «J Tabiques paralelos»). «2025»: replica la planilla de la cátedra EDIFICIO_TORRE_1 (28 filas, qh máximo con IF, W del tubo = J/(D/2), sumas completas en Rototrasl.). Verificadas celda por celda con LibreOffice.' });
    ([['actual', 'Anterior'], ['nuevo', '2025 (cátedra)']] as const).forEach(([k, txt]) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(cfg.version === k) }, txt);
      b.addEventListener('click', () => { if (cfg.version !== k) estado.cambiarCalculo({ version: k }); });
      segV.append(b);
    });
    calc.push(h('span', { class: 'par-ctl' }, h('span', { class: 'nota chica' }, 'Planilla'), segV));
  }
  if (cfg.metodo === 'cirsoc' || cfg.metodo === 'fem' || cfg.metodo === 'combinado') {
    const segN = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Verificación del hormigón', 'data-globo': 'Verificación CIRSOC 201|«Simple»: lo que se hace a mano: compresión con el método empírico (14.5), cordones de borde para la flexión, corte y cuantías mínimas. «Completa»: diagrama de interacción N-M de cada muro con todas las combinaciones, la cuantía necesaria, corte y cuantías.' });
    ([['simple', 'Simple'], ['completa', 'Completa']] as const).forEach(([k, txt]) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(cfg.verificacion === k) }, txt);
      b.addEventListener('click', () => { if (cfg.verificacion !== k) estado.cambiarCalculo({ verificacion: k }); });
      segN.append(b);
    });
    calc.push(h('span', { class: 'par-ctl' }, h('span', { class: 'nota chica' }, 'Verificación'), segN));
  }
  if (cfg.metodo === 'fem' || cfg.metodo === 'combinado') {
    const segT = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Teoría de las piezas', 'data-globo': 'Piezas del modelo FEM|«Timoshenko»: cada pieza se deforma por flexión y por el corte de sus almas (lo más real en tabiques cortos y altos). «Euler»: solo flexión, como la planilla: con piezas de toda la altura da el mismo reparto que la rototraslación.' });
    ([['timoshenko', 'Timoshenko'], ['euler', 'Euler']] as const).forEach(([k, txt]) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(cfg.teoria === k) }, txt);
      b.addEventListener('click', () => { if (cfg.teoria !== k) estado.cambiarCalculo({ teoria: k }); });
      segT.append(b);
    });
    calc.push(h('span', { class: 'par-ctl' }, h('span', { class: 'nota chica' }, 'Piezas'), segT));
  }
  if (cfg.metodo === 'planilla' || cfg.metodo === 'guia' || cfg.metodo === 'combinado') {
    const segA = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Armado de piezas', 'data-globo': 'Armado de piezas|«Cátedra»: método simplificado de la cátedra (sección 7): alas apiladas con el ancho del muro más corto y la suma de los espesores, almas a cada lado del baricentro unidas extremo con extremo con el espesor más fino. «App»: el armado de la app (alas que conservan el área, posición por área). No cambia los muros: se puede volver atrás.' });
    ([['catedra', 'Cátedra'], ['app', 'App']] as const).forEach(([k, txt]) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(cfg.armado === k) }, txt);
      b.addEventListener('click', () => { if (cfg.armado !== k) estado.cambiarCalculo({ armado: k }); });
      segA.append(b);
    });
    calc.push(h('span', { class: 'par-ctl' }, h('span', { class: 'nota chica' }, 'Armado'), segA));
  }
  if (e.id === 'diseno' && !calcAbierto) {
    const res = [METODOS[cfg.metodo]?.corto, cfg.metodo === 'planilla' || cfg.metodo === 'combinado' ? (cfg.version === 'nuevo' ? '2025' : 'Anterior') : null, cfg.metodo === 'planilla' || cfg.metodo === 'guia' || cfg.metodo === 'combinado' ? (cfg.armado === 'app' ? 'Armado App' : 'Cátedra') : null].filter(Boolean).join(' · ');
    const bc = h('button', { type: 'button', class: 'chico b-calculo', 'aria-expanded': 'false', 'data-globo': 'Opciones de cálculo|Método, versión de la planilla y armado de piezas. Mientras se diseña no hace falta tocarlas: quedan como las dejó el docente o el proyecto.' }, `Cálculo: ${res} ▾`);
    bc.addEventListener('click', () => { calcAbierto = true; guardarCalcAbierto(); dibujarTira(e); });
    t.append(bc);
  } else {
    t.append(...calc);
    if (e.id === 'diseno') { const bx = h('button', { type: 'button', class: 'chico b-calculo', 'aria-expanded': 'true' }, 'Plegar ▴'); bx.addEventListener('click', () => { calcAbierto = false; guardarCalcAbierto(); dibujarTira(e); }); t.append(bx); }
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
  // modo práctica: antes del dibujo, la pregunta; contestada, la comparación arriba del dibujo
  if (predecirActivo()) {
    const t = tarjetaPredecir(e.id, () => dibujarCentro());
    if (t) { dib.append(t.el); if (t.pregunta) return; }
  }
  try { e.centro(dib, tam); } catch (err) { console.error(err); dib.append(h('p', { class: 'error' }, `No se pudo dibujar: ${String(err)}`)); }
  // las explicaciones largas del centro, detrás de un botón «?»
  plegarExplicaciones(dib);
  // cada dibujo se puede guardar como SVG o PNG
  botonesExportar(dib, `torre3d_${e.id}_viento${estado.dir}${estado.sub[e.id] ? `_${estado.sub[e.id]}` : ''}`.replace(/[^\w-]+/g, '_'));
  lienzo.scrollTop = y;
}
function dibujarAvance() {
  const a = $('avance');
  const cab = h('h4', { class: 'cab-avance' }, 'Avance de la planilla', h('span', { class: 'plegar', 'aria-hidden': 'true' }, '▾'));
  const lista = h('div', { class: 'lista-avance' });
  a.replaceChildren(cab, lista);
  hacerPlegable(a, cab, 'Avance de la planilla', false);
  lista.replaceChildren(...ETAPAS.map(e => {
    const est = e.estado();
    const b = h('button', { type: 'button', 'aria-current': String(e.id === estado.etapa) }, h('span', { class: 'nro' }, e.nro), h('span', { class: 'nom' }, e.nombre), chip(est === 'pendiente' ? 'pendiente' : est, est === 'revisar' && e.id === 'flexion' ? 'armadura' : est));
    b.addEventListener('click', () => irA(e.id));
    return b;
  }));
}
function dibujarCapas() {
  const c = $('capas');
  type Interruptor = Exclude<keyof typeof estado.capas, 'casoViento' | 'corteViento'>;
  const capas: [Interruptor, string, string][] = [['losas', 'Losas', 'var(--ink2)'], ['fachada', 'Fachada', 'var(--dim)'], ['viento', 'Viento', 'var(--carga)'], ['fuera', 'Fuera del cálculo', 'var(--dim)'], ...(estado.proyecto.exo ? [['exo', 'Exoesqueleto', 'var(--r-rototrasl)'] as [Interruptor, string, string]] : []), ['deformada', 'Deformada (exagerada)', 'var(--deformada)'], ...(estado.capas.deformada ? [['espectro', 'Espectro', 'var(--deformada)'] as [Interruptor, string, string]] : [])];
  c.replaceChildren(...capas.map(([k, t, col]) => {
    const b = h('button', { type: 'button', class: 'chip-capa', 'aria-pressed': String(estado.capas[k]) }, h('i', {}), t);
    b.style.setProperty('--c', col);
    b.addEventListener('click', () => { estado.capas[k] = !estado.capas[k]; dibujarCapas(); estado.avisarSeleccion(); });
    return b;
  }));
  // exageración de la deformada (flexión = traslación de cada piso, y giro de la rototraslación), en escala logarítmica
  if (estado.capas.deformada) {
    let pedido = 0;
    const redibujar = () => { if (!pedido) pedido = requestAnimationFrame(() => { pedido = 0; estado.avisarSeleccion(); }); };
    const desliz = (nombre: string, globo: string, leer: () => number, poner: (m: number | null) => void) => {
      const inp = h('input', { type: 'range', min: '-1', max: '1', step: '0.01', 'aria-label': nombre }) as HTMLInputElement;
      inp.value = String(Math.log10(leer()));
      const val = h('span', { class: 'mono' }, `× ${leer().toFixed(1).replace('.', ',')}`);
      inp.addEventListener('input', () => { const m = 10 ** Number(inp.value); val.textContent = `× ${m.toFixed(1).replace('.', ',')}`; poner(Math.abs(Number(inp.value)) < 0.02 ? null : m); redibujar(); });
      inp.addEventListener('dblclick', () => { inp.value = '0'; val.textContent = '× 1,0'; poner(null); redibujar(); });
      return h('label', { class: 'campo-linea desliz-def', 'data-globo': globo }, `${nombre} `, inp, val);
    };
    const rel = (v: number | null, auto: number) => (v === null || !(auto > 0) ? 1 : v / auto);
    c.append(h('div', { class: 'fila-acciones controles-def' },
      desliz('Flexión', 'Exageración de la flexión|Multiplica el corrimiento de cada piso (la traslación). 1 = la automática; doble clic vuelve a 1. Los números son los reales.', () => rel(estado.roto3d.exag, ultimaDeformada.auto), m => { estado.roto3d.exag = m === null ? null : Math.max(1, ultimaDeformada.auto * m); }),
      desliz('Giro', 'Exageración del giro|Multiplica aparte el giro de la rototraslación para que el revirado se vea. 1 = la automática; doble clic vuelve a 1.', () => rel(estado.roto3d.giro, ultimaDeformada.giroAuto), m => { estado.roto3d.giro = m === null ? null : Math.max(1, ultimaDeformada.giroAuto * m); })));
  }
}
function dibujarEstadoCalculo() {
  dibujarModoCalculo();
  // en vivo, con el cálculo en segundo plano: los diagramas se atenúan (si tarda) hasta que llegan los resultados
  document.body.classList.toggle('calculando', estado.calculando);
  if (estado.calculando) {
    const el = $('estado-calculo');
    el.className = 'chip-estado pendiente calculando';
    el.textContent = 'Calculando…';
    el.setAttribute('data-globo', 'Calculando en segundo plano|Los últimos cambios se están calculando sin frenar la app: podés seguir editando. Mientras tanto, los resultados, el 3D y los diagramas son los del cálculo anterior; se actualizan solos al terminar.');
    el.style.cursor = 'default';
    el.onclick = null;
    return;
  }
  if (estado.pendiente) {
    const el = $('estado-calculo');
    el.className = 'chip-estado revisar';
    el.textContent = `Sin calcular · ${estado.cambiosPendientes} cambio${estado.cambiosPendientes === 1 ? '' : 's'}`;
    el.setAttribute('data-globo', 'Cálculo pendiente|Modo «Con botón»: los cambios se guardan pero los resultados, el 3D y los diagramas son los del último cálculo. Tocá «Calcular» o F9.');
    el.onclick = () => estado.calcularAhora();
    return;
  }
  // resumen honesto (hallazgo 6 del informe técnico): dice cuántos controles se calcularon, cuáles quedan a revisar y
  // cuáles son solo informativos (dependen de datos que la app no tiene, como el estudio de suelos), y con qué método
  const cmp = estado.calculo.combinado;
  if (cmp && !estado.calculo.error) {
    const el = $('estado-calculo');
    const peor = Math.max(...Object.values(cmp.resumen).map(r => r.noVerifican));
    el.className = `chip-estado ${peor ? 'no-verifica' : 'verifica'}`;
    el.textContent = `No verifican: ${(['planilla', 'guia', 'cirsoc', 'fem'] as const).map(m => `${METODOS[m].corto} ${cmp.resumen[m].noVerifican}`).join(' · ')}`;
    el.setAttribute('data-globo', 'Método Combinado|Los cuatro métodos con la misma torre: cuántos controles no verifican con cada uno. La comparación está en Resumen.');
    el.style.cursor = 'pointer'; el.onclick = () => irA('resumen');
    return;
  }
  const cs = estado.calculo.controles ?? [];
  const malos = cs.filter(c => c.estado === 'no verifica').length, revisar = cs.filter(c => c.estado === 'atención').length;
  const info = cs.filter(c => c.estado === 'informativo').length, calculados = cs.length - info;
  const el = $('estado-calculo');
  el.className = `chip-estado ${estado.calculo.error || malos ? 'no-verifica' : revisar ? 'revisar' : 'verifica'}`;
  el.textContent = estado.calculo.error ? 'Error en el cálculo' : malos ? `${malos} control${malos > 1 ? 'es' : ''} no verifica${malos > 1 ? 'n' : ''}`
    : `Verifican los ${calculados} calculados${revisar ? ` · ${revisar} a revisar` : ''}`;
  el.setAttribute('data-globo', `Estado del cálculo · ${describirConfig(estado.config)}|Cuenta los ${calculados} controles calculados de todas las etapas con el método elegido. «A revisar» son puntos que verifican pero piden atención: armadura por tracción, edificio flexible o una pregunta abierta para la cátedra.${info ? ` Además hay ${info} control${info > 1 ? 'es' : ''} solo informativo${info > 1 ? 's' : ''} (por ejemplo la tensión en el suelo, que se compara con el estudio de suelos): no entran en «verifican».` : ''}`);
  el.style.cursor = 'pointer';
  el.onclick = () => irA('resumen');
}
/**
 * @param porCambio la llamada viene de un cambio de datos: en el modo con botón y con cambios sin calcular, no se
 *                  redibujan los diagramas del centro ni el avance (son lo que cuesta), solo la planta y los paneles
 */
function dibujarTodo(porCambio = false) {
  $<HTMLButtonElement>('b-deshacer').disabled = !estado.puedeDeshacer;
  $<HTMLButtonElement>('b-rehacer').disabled = !estado.puedeRehacer;
  { const np = $('nombre-proyecto'); np.textContent = estado.proyecto.nombre; np.title = estado.proyecto.nombre; }
  const ahorrar = porCambio && estado.pendiente;
  dibujarRiel(); dibujarPanel();
  if (!ahorrar || etapaPorId(estado.etapa).centro === 'planta') dibujarCentro();
  else marcarCentroViejo();
  if (!ahorrar) dibujarAvance();
  dibujarEstadoCalculo();
  // la capa del exoesqueleto aparece o se va con él
  const conExo = !!estado.proyecto.exo;
  if (conExo !== capasConExo) { capasConExo = conExo; dibujarCapas(); }
}
let capasConExo = false;

// ------------------------------------------------------------------ modo de cálculo: en vivo o con botón
const zonaModo = h('span', { class: 'modo-calculo' });
// al final de la cabecera, a la derecha (el aviso de los controles va junto al nombre del proyecto)
document.querySelector('.barra')!.append(zonaModo);
function dibujarModoCalculo() {
  const seg = h('div', { class: 'seg chico', role: 'group', 'aria-label': 'Modo de cálculo', 'data-globo': 'Modo de cálculo|«En vivo»: cada cambio recalcula todo y redibuja todas las vistas, como el Excel (ideal para presentar y para la sincronía con la planilla). «Con botón»: los cambios se guardan sin calcular; el cálculo, el 3D y los diagramas se actualizan con «Calcular» (o F9). Usa muchos menos recursos de la máquina.' });
  ([['vivo', 'En vivo'], ['boton', 'Con botón']] as const).forEach(([k, txt]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(estado.modo === k) }, txt);
    b.addEventListener('click', () => { if (estado.modo !== k) estado.cambiarModo(k); });
    seg.append(b);
  });
  const partes: HTMLElement[] = [h('span', { class: 'nota chica' }, 'Cálculo'), seg];
  if (estado.modo === 'boton') {
    const bc = h('button', { type: 'button', class: 'chico' + (estado.pendiente ? ' primario' : ''), id: 'b-calcular', 'data-globo': 'Calcular (F9)|Calcula todo con los datos actuales y actualiza resultados, 3D y diagramas.' }, estado.pendiente ? `Calcular (${estado.cambiosPendientes})` : 'Calcular');
    bc.addEventListener('click', () => estado.calcularAhora());
    partes.push(bc);
  }
  // tutorial: «En esta etapa», de dónde llega cada indicador, «Recorrer» y las explicaciones plegables. Se apaga para
  // ganar lugar cuando ya se conoce la app (se recuerda en este navegador)
  const bt = h('button', { type: 'button', class: 'chico b-tutorial', 'aria-pressed': String(tutorialPrendido()),
    'data-globo': 'Tutorial|Prendido: arriba de cada etapa, qué se calcula y de dónde llega cada dato, «Recorrer» las secciones y las explicaciones («Ver la explicación», «Cómo leer este gráfico»). Apagado: solo las herramientas y los resultados.' }, tutorialPrendido() ? 'Tutorial: sí' : 'Tutorial: no');
  bt.addEventListener('click', () => { ponerTutorial(!tutorialPrendido()); dibujarModoCalculo(); });
  zonaModo.replaceChildren(bt, ...partes);
}
const CLAVE_TUTORIAL = 'torre3d.tutorial';
function tutorialPrendido(): boolean { try { return localStorage.getItem(CLAVE_TUTORIAL) !== 'no'; } catch { return true; } }
function ponerTutorial(si: boolean) {
  try { localStorage.setItem(CLAVE_TUTORIAL, si ? 'si' : 'no'); } catch { /* sin almacenamiento */ }
  document.body.classList.toggle('sin-tutorial', !si);
}
document.body.classList.toggle('sin-tutorial', !tutorialPrendido());
/** aviso sobre los diagramas del centro cuando quedaron del cálculo anterior */
function marcarCentroViejo() {
  const dib = $('centro-dibujos');
  if (estado.calculando || dib.querySelector('.aviso-viejo')) return;
  const b = h('button', { type: 'button', class: 'chico primario' }, 'Calcular (F9)');
  b.addEventListener('click', () => estado.calcularAhora());
  dib.prepend(h('div', { class: 'aviso-viejo' }, h('span', {}, 'Diagramas del último cálculo: hay cambios sin calcular.'), b));
}
document.addEventListener('keydown', ev => {
  if (ev.key === 'F9') { ev.preventDefault(); estado.calcularAhora(); }
});
/** lo pesado de los Excel (jszip, el armado de los libros) se carga recién al exportar o importar */
const xlsxPlanilla = () => import('./xlsx/planilla');
const xlsxTablas = () => import('./xlsx/tablas');
/** los informes para imprimir y el desglose también se cargan al pedirlos */
const imprimirInforme = () => import('./ui/informe').then(m => m.imprimirInforme());
const imprimirCartaPdf = () => import('./ui/cartaPdf').then(m => m.imprimirCartaPdf());
const imprimirLaminas = () => import('./ui/lamina').then(m => m.imprimirLaminas());
const imprimirDesglose = () => import('./ui/desglose').then(m => m.imprimirDesglose());
const descargarPPTX = () => import('./ui/desglose').then(m => m.descargarPPTX());
const dibujosPorHoja = () => import('./ui/dibujosDesglose').then(m => m.dibujosPorHoja());
/** abre (o trae al frente) la pestaña de la vista previa: tiene que ser en el mismo clic (si no, el navegador la bloquea) */
function abrirVistaPlanilla() {
  const w = window.open(`${location.pathname}${location.search}#planilla`, 'torre3d-planilla');
  if (w) w.focus();
  return !!w;
}
function mensaje(t: string) { $('mensaje').textContent = t; }
// el mensaje del pie va en un renglón (cortado con «…»): el texto completo, al pasar el mouse. Lo escriben muchas partes
// de la app directamente, así que el globo se pone solo cada vez que cambia
{ const m = $('mensaje'); new MutationObserver(() => { m.title = m.textContent ?? ''; }).observe(m, { childList: true, characterData: true, subtree: true }); }
// el aviso de los controles junto al nombre del proyecto: si no entra entero, el texto completo en el globo
{ const c = $('estado-calculo'); new MutationObserver(() => { c.title = c.textContent ?? ''; }).observe(c, { childList: true, characterData: true, subtree: true }); }

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
  // Enter da la acción principal; Escape cierra (sistema de diseño, 5.1)
  d.onkeydown = ev => { if (ev.key === 'Enter' && !(ev.target instanceof HTMLButtonElement) && !(ev.target instanceof HTMLTextAreaElement)) { const pr = fila.querySelector<HTMLButtonElement>('button.primario'); if (pr) { ev.preventDefault(); pr.click(); } } };
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
  if (!resultadosListos('escribir la planilla')) return;
  const { asig, res } = estado.calculo;
  const celdas = celdasAEscribir(asig.datos, res);
  const filas = Object.entries(celdas).map(([hoja, cs]) => `<li><b>${hoja}</b>: ${Object.keys(cs).length} celdas</li>`).join('');
  // par de dos tabiques perpendiculares: B31:B50 de esa hoja van en 0 (son vínculos: es la excepción a «no tocar fórmulas»)
  const conPar = ([['A', 'Rototrasl. cara mayor'], ['B', 'Rototrasl. cara menor']] as const).filter(([k]) => (k === 'A' ? asig.datos.rotA : asig.datos.rotB).par).map(([, n]) => `«${n}»`);
  const radio = (name: string, value: string, checked: boolean, txt: string, nota: string) =>
    `<label class="campo-linea"><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}> ${txt} <small>${nota}</small></label>`;
  dialogo(`<h2>Escribir la planilla</h2>
    <p><b>Planilla</b></p>
    ${radio('exp-plan', 'nuevo', estado.config.version === 'nuevo', 'Planilla de la cátedra 2025', '(EDIFICIO_TORRE_1; calculada con el motor «Planilla 2025»)')}
    ${radio('exp-plan', 'actual', estado.config.version === 'actual', `Planilla anterior${plantillaAbierta ? ' (la que abriste)' : ''}`, '(calculada con el motor «Actual»)')}
    <p><b>Contenido</b></p>
    ${radio('exp-cont', 'virgen', true, 'Planilla virgen', '(solo los datos en las 7 hojas de la cátedra, más las tablas «T3D» para volver a abrirla en la app)')}
    ${radio('exp-cont', 'renovada', false, 'Planilla de la cátedra con las hojas de la app', '(además, las hojas «G ·» de la app con fórmulas, gráficos y dibujos; la planilla renovada del CIRSOC está en Exportar)')}
    <p>La app escribe solo celdas de datos. No cambia ninguna fórmula, salvo las del último piso (C y D de M,NyQ), que se escriben a mano como indica la planilla${estado.config.version === 'nuevo' ? ', y la columna B de M,NyQ, donde vuelve a poner el vínculo con «viento»' : ''}${conPar.length ? `, y B31:B50 de ${conPar.join(' y ')}, que van en 0 porque elegiste dos tabiques perpendiculares (filas 28–29) en vez del bloque general` : ''}.</p>
    <ul>${filas}<li><b>Hojas «G ·»</b> (solo con las hojas de la app): los motores de la app con fórmulas vivas y gráficos, la carta de la torre y los dibujos de cada etapa.</li>${asig.piezas.some(z => z.especial && z.filaHoja !== null) ? '<li><b>Elementos especiales</b>: la sección real de los oblicuos, curvos, calados con corte y piezas clasificadas como especiales (en la hoja J va su rectángulo equivalente, con el mismo J y la misma área; esta hoja lo controla).</li>' : ''}<li><b>Flexocompresión PB</b>: la verificación de la guía en PB, pieza por pieza y en los dos vientos, paso a paso y con los coeficientes a la vista (la «Flex comp PB paralelos» de la cátedra queda como estaba).</li><li><b>Hojas «T3D …»</b>: la torre completa en tablas. Con ellas la app vuelve a armar el proyecto.</li></ul>
    <label class="campo-linea"><input type="checkbox" id="exp-figuras" checked> Dibujos explicativos rediseñados sobre las hojas originales <small>(solo con las hojas de la app; los del Excel quedan en el archivo, ocultos; las celdas no cambian)</small></label>
    ${cantidadAvisos() ? `<p class="error">${cantidadAvisos() === 1 ? 'Hay 1 aviso: revisalo' : `Hay ${cantidadAvisos()} avisos: revisalos`} en la pestaña «Avisos».</p>` : ''}
    <p class="nota">Al abrirla, Excel o LibreOffice recalculan todo. Para revisarla antes, con las fórmulas calculadas: «Vista previa ↗» (se abre en otra pestaña y se actualiza sola mientras editás).</p>`, [
    ['Cancelar', () => $<HTMLDialogElement>('dialogo').close()],
    ['Vista previa ↗', () => { abrirVistaPlanilla(); }],
    ['Escribir y descargar', async () => {
      const dlg = $('dialogo');
      const motor = (dlg.querySelector<HTMLInputElement>('input[name="exp-plan"]:checked')?.value ?? estado.config.version) as Motor;
      const virgen = dlg.querySelector<HTMLInputElement>('input[name="exp-cont"]:checked')?.value !== 'renovada';
      // se calcula con la planilla elegida (la distribución de filas de cada una es distinta) y el armado del proyecto.
      // Todo lo que depende de la configuración se calcula acá, de una vez y sin esperas: la configuración global no
      // cambia mientras se arma el archivo (hallazgo 5 del informe técnico)
      const conf = { ...configMotor(estado.config), motor };
      try {
        const [mods, { escribirPlanilla }, { figurasDesdeMeta }] = await Promise.all([import('./xlsx/opcionesG'), xlsxPlanilla(), import('./xlsx/figuras')]);
        const { asig, res, g } = usarConfig(conf, () => {
          const asig = aPlanilla(estado.proyecto);
          return { asig, res: calcularPlanilla(asig.datos), g: virgen ? null : mods.opcionesG(estado.proyecto) };
        });
        const base = motor === 'nuevo' ? await (await fetch(plantilla2025URL)).arrayBuffer() : plantillaAbierta ?? await (await fetch(plantillaURL)).arrayBuffer();
        if (virgen) {
          const bytes = await escribirPlanilla(base, asig.datos, res, estado.proyecto, undefined, undefined, { motor, virgen: true, asig });
          descargar(nombreArchivo('.xlsx'), bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          $<HTMLDialogElement>('dialogo').close();
          return;
        }
        // hojas «G ·»: motores con fórmulas, gráficos, y la carta y los dibujos de la app como imágenes
        if (!g) return;
        if (estado.proyecto.exo && exoEnElCalculo()) {
          const hoja = (dir: 'A' | 'B') => { const d = datosExo(dir); if (!d) return null; return {
            ficha: `${d.def.tipo} · ${TIPOS_EXO[d.def.tipo].nombre}`, ancho: d.ancho, t: d.tCaras[1], Eh: d.Eh, Eacero: d.def.E, colA: propsSeccion(d.def.columna).A,
            fraccion: d.r.fraccionExo, Jeq: d.r.caras[0]?.Jeq ?? 0, limiteH: d.def.limiteH ?? 500, peso: pesoExo(d.def, (['A', 'B'] as const).map(x => datosExo(x)?.entrada).filter(Boolean) as EntradaExo[]), niveles: d.niveles, zs: d.r.zs, W: d.r.Ftab.map((f, i) => f + d.r.Fexo[i]), Ftab: d.r.Ftab, Fexo: d.r.Fexo, u: d.r.u, uSin: d.r.uSin, Mtab: d.r.Mtab,
            barras: d.r.controles.filter(c => !/^[KR]\d/.test(c.id) || d.def.tipo !== 'F').map(c => { const e = d.r.caras.find(x => x.nombre === c.cara)!.esfuerzos.find(x => x.id === c.id)!; return [`${c.cara} · ${c.id}`, c.clase, e.L, c.N, c.M, c.sigma / 10, c.lambda, c.estado]; }) }; };
          g.exo = { A: hoja('A'), B: hoja('B') };
        }
        try {
          const dib = (await dibujosPorHoja()).flat();
          g.imagenes = dib.map(d => ({ titulo: d.titulo, ancho: d.ancho, alto: d.alto, png: Uint8Array.from(atob(d.png.split(',')[1] ?? ''), c => c.charCodeAt(0)) })).filter(d => d.png.length);
        } catch (e) { console.warn('dibujos para la planilla', e); }
        // dibujos explicativos rediseñados sobre las hojas originales (sin tildar: quedan los del Excel)
        let figuras: ReturnType<typeof figurasDesdeMeta> = [];
        if ($<HTMLInputElement>('exp-figuras').checked) {
          const png: Record<string, Uint8Array> = {};
          await Promise.all(Object.entries(urlFiguras).map(async ([ruta, url]) => { png[ruta.replace(/^.*\//, '').replace('.png', '')] = new Uint8Array(await (await fetch(url)).arrayBuffer()); }));
          figuras = figurasDesdeMeta(metaFiguras as Record<string, MetaFigura>, n => png[n]);
        }
        const bytes = await escribirPlanilla(base, asig.datos, res, estado.proyecto, g, figuras, { motor, virgen: false, asig });
        descargar(nombreArchivo('.xlsx'), bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $<HTMLDialogElement>('dialogo').close();
      } catch (e) { fallo('No se pudo escribir la planilla', e); }
    }, true],
  ]);
}


/** archivo de antes de que el método fuera parte del proyecto: se abre con la configuración de siempre y se avisa */
function avisarSinMetodo(texto: string | null) {
  if (texto !== null) { try { if ((JSON.parse(texto) as { calculo?: unknown }).calculo) return; } catch { return; } }
  mensaje(`El archivo no decía con qué método se calculó: se abrió con «${describirConfig(estado.config)}», lo que la app usaba antes. Si lo calculaste de otra forma, cambialo arriba (Método); queda guardado en el proyecto.`);
}
async function abrir(f: File) {
  try { await abrirArchivo(f); } catch (e) { fallo(`No se pudo abrir «${f.name}»`, e); }
}
async function abrirArchivo(f: File) {
  const buf = await f.arrayBuffer();
  if (f.name.toLowerCase().endsWith('.json')) {
    // el lector único valida antes de tocar nada: si el archivo está dañado, el proyecto abierto queda como estaba
    const texto = new TextDecoder().decode(buf);
    if (await reemplazarConCopia(texto)) { plantillaAbierta = null; avisarSinMetodo(texto); }
    return;
  }
  const nombre = f.name.toLowerCase();
  const { leerTexto, leerLibro } = await xlsxTablas(), { leerPlanilla } = await xlsxPlanilla();
  if (/\.(csv|tsv|txt)$/.test(nombre)) { dialogoImportar(interpretar(leerTexto(new TextDecoder().decode(buf), f.name)), f.name, null); return; }
  const leido = await leerPlanilla(buf);
  if (leido.proyecto) {
    const sinMetodo = !leido.proyecto?.calculo;
    if (!(await reemplazarConCopia(leido.proyecto))) return;
    plantillaAbierta = buf;
    if (sinMetodo) avisarSinMetodo(null);
    if (leido.avisos.length) mensaje(`Planilla abierta · ${leido.avisos.length} aviso${leido.avisos.length > 1 ? 's' : ''}: ${leido.avisos[0]}`);
    return;
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
    const { escribirLibro } = await xlsxTablas();
    const bytes = await escribirLibro(tablaDelProyecto(estado.proyecto.niveles, estado.proyecto.muros));
    descargar(nombreArchivo('_tabla.xlsx'), bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (e) { fallo('No se pudo armar la tabla', e); }
}
document.addEventListener('torre:ir-etapa', ev => irA((ev as CustomEvent<string>).detail));
document.addEventListener('torre:importar', () => $<HTMLInputElement>('b-abrir').click());
document.addEventListener('torre:tabla', () => { void descargarTabla(); });

$('b-deshacer').addEventListener('click', () => estado.deshacer());
$('b-rehacer').addEventListener('click', () => estado.rehacer());
document.addEventListener('keydown', ev => {
  // el evento puede venir de un elemento o del documento (eventos armados por la app)
  const t = ev.target instanceof Element ? ev.target : null;
  const escribiendo = !!t?.matches('input, select, textarea') || $<HTMLDialogElement>('dialogo').open;
  if (escribiendo) return;
  const k = ev.key.toLowerCase();
  if ((ev.ctrlKey || ev.metaKey) && k === 'z') { ev.preventDefault(); if (ev.shiftKey) estado.rehacer(); else estado.deshacer(); }
  else if ((ev.ctrlKey || ev.metaKey) && k === 'y') { ev.preventDefault(); estado.rehacer(); }
});
// Supr fuera de la planta (o con otra herramienta): borra el muro elegido, o su grupo entero si está en un grupo cerrado.
// Va en window para correr después de la planta: si ella ya lo borró (defaultPrevented), no se borra dos veces.
window.addEventListener('keydown', ev => {
  if ((ev.key !== 'Delete' && ev.key !== 'Backspace') || ev.defaultPrevented || !estado.seleccion) return;
  const t = ev.target instanceof Element ? ev.target : null;
  if (t?.closest('input, select, textarea, [contenteditable]') || $<HTMLDialogElement>('dialogo').open) return;
  const p = estado.proyecto, m = p.muros.find(x => x.id === estado.seleccion);
  if (!m) return;
  ev.preventDefault();
  const g = grupoCerrado(p, m, estado.contexto);
  const ids = g ? murosDe(p, g.id).map(x => x.id) : [m.id];
  const r = { b: 0, s: 0 };
  estado.cambiar(pp => { const x = borrarMuros(pp, ids); r.b = x.borrados; r.s = x.bloqueados; });
  estado.seleccion = null; estado.grupoSel = null; estado.limpiarGrupos();
  mensaje(r.b ? `${r.b === 1 ? 'Se borró un muro' : `Se borraron ${r.b} muros${g ? ` (el grupo «${g.nombre}»)` : ''}`}${r.s ? ` · ${r.s} bloqueados no se tocaron` : ''}. Ctrl+Z para deshacer.` : 'Está bloqueado 🔒: desbloquealo en el Esquema para borrarlo.');
  estado.avisarPanel();
});
window.addEventListener('error', e => { if (String(e.message ?? '').includes('ResizeObserver loop')) return; fallo('Error inesperado', e.error ?? e.message); });   // el aviso de ResizeObserver es del navegador y no rompe nada
window.addEventListener('unhandledrejection', e => fallo('Error inesperado', e.reason));

$('b-ejemplo').addEventListener('click', () => { plantillaAbierta = null; reemplazarConCopia(ejemploGuia()); cerrarMenus(); mensaje('Cargado el ejemplo de la guía 2024 (Neuquén, 20 pisos). Es el de la cátedra, para Planilla y Guía: con CIRSOC la deriva de servicio de la azotea pasa 1/500 y el Resumen lo marca.'); });
$('b-ejemplo-citicorp-fachada').addEventListener('click', () => { plantillaAbierta = null; estado.capas.fachada = true; reemplazarConCopia(ejemploCiticorpFachada()); cerrarMenus(); mensaje('Cargado el Citicorp Center con su forma y su fachada: la plaza abierta, carpintería por piso hasta el cajón de la corona y, arriba, la envolvente con su techo a 45°. El exoesqueleto va adentro de la piel y la corona tiene su reticulado bajo la pendiente (etapa 08). Mirá la capa «Fachada» en el 3D y el alzado desplegado (Carpintería → Panelería). Abre con el método CIRSOC, que cuenta el exo (con Planilla o Guía el exo es un estudio aparte y los tabiques solos no alcanzan).'); });
// torres de prueba: diez plantas variadas armadas con las piezas tipo (se usan para controlar la app)
TORRES_PRUEBA.forEach((t, k) => {
  const [cod, desc] = t.nombre.split(' · ');
  const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.id = `b-prueba-${k + 1}`;
  b.append(`${cod} · ${desc}`);
  const pista = document.createElement('span'); pista.className = 'pista'; pista.textContent = `${t.pisos} pisos · ${t.B} × ${t.L} m · ${t.hormigon ?? 'H30'}`; b.append(pista);
  b.addEventListener('click', () => { plantillaAbierta = null; reemplazarConCopia(armarTorre(t)); cerrarMenus(); mensaje(`Cargada la torre de prueba ${cod}: ${desc}.`); });
  $('torres-prueba').append(b);
});
$('b-ejemplo-34').addEventListener('click', () => { plantillaAbierta = null; reemplazarConCopia(ejemploPlanta34()); cerrarMenus(); mensaje('Cargada la torre de 34 pisos: los núcleos toman el viento; las columnas, solo carga de losa. Es un ejemplo solo para la Planilla: con otro método no está dimensionada (con CIRSOC no verifican el suelo, la deriva ni la armadura de varios núcleos).'); });
$('b-ejemplo-chica').addEventListener('click', () => { plantillaAbierta = null; reemplazarConCopia(ejemploBasicoExo()); cerrarMenus(); mensaje('Cargada la torre chica con tubo en X: es el ejemplo paso a paso de la guía. Seguí el viento A.'); });
$('b-ejemplo-hancock').addEventListener('click', () => { plantillaAbierta = null; reemplazarConCopia(ejemploHancock()); cerrarMenus(); mensaje('Cargado el John Hancock Center: caras que se angostan con la altura y el tubo en X que toma todo el viento (etapa 08 · Exoesqueleto). Las fuentes de cada número están en la etapa 08.'); });
$('b-ejemplo-shanghai').addEventListener('click', () => { plantillaAbierta = null; reemplazarConCopia(ejemploShanghai()); cerrarMenus(); mensaje('Cargada la Shanghai Tower: núcleo de hormigón con outriggers en las juntas de zona (etapa 08 · Exoesqueleto, ficha F). Las fuentes y los supuestos están en la etapa 08.'); });
$('b-ejemplo-hearst').addEventListener('click', () => { plantillaAbierta = null; reemplazarConCopia(ejemploHearst()); cerrarMenus(); mensaje('Cargada la Hearst Tower: diagrid con nudos cada 40 ft y núcleo corrido (etapa 08 · Exoesqueleto). Las fuentes están en la etapa 08.'); });
$('b-ejemplo-gherkin').addEventListener('click', () => { plantillaAbierta = null; reemplazarConCopia(ejemploGherkin()); cerrarMenus(); mensaje('Cargado 30 St Mary Axe («the Gherkin»): diagrid que sigue el perfil de la torre, con la planta circular llevada a un cuadrado de la misma área (etapa 08). Fuentes y supuestos en la etapa 08. Verifica con el método CIRSOC y con el FEM.'); });
$('b-ejemplo-onterie').addEventListener('click', () => { plantillaAbierta = null; reemplazarConCopia(ejemploOnterie()); cerrarMenus(); mensaje('Cargado el Onterie Center: tubo de hormigón con X de paneles (etapa 08). La planta es supuesta: lo dice la etapa 08.'); });
$('b-ejemplo-asim').addEventListener('click', () => { plantillaAbierta = null; reemplazarConCopia(ejemploAsimetrico()); cerrarMenus(); mensaje('Cargado el Anexo de la guía: T5 aislado, la planta rota. Es un ejemplo solo para la Planilla: con otro método no está dimensionado (con CIRSOC no verifican la deriva ni la armadura de T1, T3 y T6).'); });
// proyecto nuevo: armado de la cátedra por defecto (lo que enseña la guía); los archivos viejos siguen con el que tenían
$('b-torre-nueva').addEventListener('click', () => $('b-nuevo').click());
$('b-nuevo').addEventListener('click', async () => {
  cerrarMenus();
  // documento en blanco: pisos y altura; la losa sale rectangular de 20 × 16 y se cambia en Planta → Losa → «Losa desde cero»
  const r = await pedirTexto('Proyecto nuevo, en blanco', 'Cuántos pisos sobre PB y qué altura tiene cada uno, como «10 × 3» (diez pisos de 3 m). Después: la forma de la losa (Planta → Losa → «Losa desde cero»), la carpintería (Losa → Carpintería) y los muros (Dibujar, Insertar o Colocar).', '10 × 3', 'Crear');
  if (r === null) return;
  const m = /^\s*(\d+)\s*[x×*]\s*([\d.,]+)\s*$/i.exec(r);
  const n = m ? Math.max(1, Math.min(200, +m[1])) : 10, hp = m ? Math.max(2, Math.min(10, +m[2].replace(',', '.'))) : 3;
  const base = proyectoVacio();
  const niveles = Array.from({ length: n + 1 }, (_, k) => { const piso = n - k, cota = +(piso * hp).toFixed(2); return piso === n ? { nombre: 'Azotea', cota, B: 20, L: 16 } : piso === 0 ? { nombre: 'PB', cota: 0 } : { nombre: `${piso}º`, cota }; });
  plantillaAbierta = null;
  reemplazarConCopia({ ...base, niveles, calculo: { metodo: 'planilla', version: 'actual', armado: 'catedra', formulas: VERSION_FORMULAS } });
  estado.etapa = 'diseno'; dibujarTodo();
});
$('b-guardar').addEventListener('click', () => { descargarProyecto(); cerrarMenus(); });
$('b-tabla').addEventListener('click', () => { void descargarTabla(); cerrarMenus(); });
$('b-comparacion').addEventListener('click', () => { cerrarMenus(); if (resultadosListos('escribir la comparación de métodos')) void descargarComparacion(); });
/** comparación de métodos (etapa 7): la tabla del método Combinado con sus gráficos */
async function bytesComparacion(): Promise<Uint8Array> {
  const p = { ...estado.proyecto, calculo: { ...(estado.proyecto.calculo ?? {}), metodo: 'combinado' as const } };
  const cmp = estado.calculo.combinado ?? calcularProyecto(p).combinado;
  if (!cmp) throw new Error('La comparación no se pudo hacer.');
  const { libroCombinado } = await import('./xlsx/libros/libroCombinado');
  return libroCombinado(cmp, estado.proyecto).xlsx();
}
async function descargarComparacion() {
  try {
    descargar(nombreArchivo('_comparacion.xlsx'), await bytesComparacion(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    mensaje('Comparación de métodos descargada: la tabla de los cuatro métodos, con las diferencias y sus gráficos.');
  } catch (e) { fallo('No se pudo armar la comparación', e); }
}
$('b-reporte-fem').addEventListener('click', () => { cerrarMenus(); if (resultadosListos('escribir el reporte FEM')) void descargarReporteFem(); });
/** reporte FEM (etapa 6b): los números del modelo y sus diagramas (no es una calculadora: el modelo no cabe en fórmulas) */
async function bytesReporteFem(): Promise<Uint8Array> {
  const p = { ...estado.proyecto, calculo: { ...(estado.proyecto.calculo ?? {}), metodo: 'fem' as const } };
  const c = calcularProyecto(p);
  if (!c.fem || !c.cirsoc) throw new Error(c.error ?? 'El cálculo del modelo no se pudo hacer.');
  const { reporteFem } = await import('./xlsx/libros/reporteFem');
  return reporteFem({ p, fem: c.fem, verif: c.cirsoc.verif, controles: c.controles, rects: datosGuia(p, c.asig.piezas).rects, teoria: configDe(p).teoria, limiteDeriva: datos201De(p).limiteDeriva }).xlsx();
}
async function descargarReporteFem() {
  try {
    const cfg = estado.config;
    const p = { ...estado.proyecto, calculo: { ...(estado.proyecto.calculo ?? {}), metodo: 'fem' as const } };
    descargar(nombreArchivo('_reporte_fem.xlsx'), await bytesReporteFem(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    mensaje(`Reporte FEM descargado (piezas ${configDe(p).teoria === 'euler' ? 'Euler' : 'Timoshenko'}).${cfg.metodo !== 'fem' ? ` El método elegido es «${METODOS[cfg.metodo].nombre}»: el reporte da los números del método FEM.` : ''}`);
  } catch (e) { fallo('No se pudo armar el reporte FEM', e); }
}
/** la planilla renovada con el método CIRSOC y ese nivel, aunque el proyecto tenga otro método (no se cambia el proyecto) */
async function bytesRenovada(nivel: 'simple' | 'completa'): Promise<{ bytes: Uint8Array; avisos: string[] }> {
  const p = { ...estado.proyecto, calculo: { ...(estado.proyecto.calculo ?? {}), metodo: 'cirsoc' as const, verificacion: nivel } };
  const c = calcularProyecto(p);
  if (!c.cirsoc) throw new Error(c.error ?? 'El cálculo CIRSOC no se pudo hacer.');
  const { datosRenovada, libroRenovada } = await import('./xlsx/libros/libroRenovada');
  const R = datosRenovada(p, c.asig.piezas, c.cirsoc.verif, nivel);
  const { libro } = libroRenovada(R, estado.proyecto);
  return { bytes: await libro.xlsx(), avisos: [...R.geo.avisos] };
}
$('b-libro-renovada').addEventListener('click', () => { cerrarMenus(); void descargarRenovada(); });
/** planilla renovada (etapa 5b): el método CIRSOC como calculadora cerrada, con la verificación del 201 simple o completa */
async function descargarRenovada() {
  const cfg = estado.config;
  const r = await tarjeta({ tipo: 'pregunta', titulo: 'Planilla renovada (CIRSOC)',
    texto: 'Simple: compresión con el método empírico y flexión con cordones de borde (para hacer a mano). Completa: el diagrama de interacción de cada muro con la cuantía mínima y con la adoptada (más grande: unas 50 000 fórmulas).',
    botones: cfg.verificacion === 'simple' ? ['Simple', 'Completa', 'Cancelar'] : ['Completa', 'Simple', 'Cancelar'] });
  if (r.boton === 2) return;
  const nivel: 'simple' | 'completa' = (cfg.verificacion === 'simple') === (r.boton === 0) ? 'simple' : 'completa';
  // se calcula con el método CIRSOC y ese nivel aunque el proyecto tenga otro método elegido (no se cambia el proyecto)
  if (!resultadosListos('escribir la planilla renovada')) return;
  try {
    const { bytes, avisos } = await bytesRenovada(nivel);
    descargar(nombreArchivo(`_renovada_${nivel}.xlsx`), bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (cfg.metodo !== 'cirsoc') avisos.push(`El método elegido es «${METODOS[cfg.metodo].nombre}»: la planilla renovada da los números del método CIRSOC (elegilo arriba para verlos en pantalla).`);
    mensaje(`Planilla renovada (${nivel}) descargada: los datos van en la hoja «Datos» y se recalcula sola.${avisos.length ? ' ' + avisos.join(' ') : ''}`);
  } catch (e) { fallo('No se pudo armar la planilla renovada', e); }
}
async function bytesGuia(): Promise<{ bytes: Uint8Array; avisos: string[] }> {
  const p = estado.proyecto, d = datosGuia(p, estado.calculo.asig.piezas);
  const { libroGuia } = await import('./xlsx/libros/libroGuia');
  return { bytes: await libroGuia(d, p).libro.xlsx(), avisos: [...d.avisos] };
}
/** la planilla virgen (solo datos en las hojas de la cátedra), con la versión del proyecto */
async function bytesVirgen(): Promise<Uint8Array> {
  const motor = estado.config.version;
  const conf = { ...configMotor(estado.config), motor };
  const { asig, res } = usarConfig(conf, () => { const asig = aPlanilla(estado.proyecto); return { asig, res: calcularPlanilla(asig.datos) }; });
  const base = motor === 'nuevo' ? await (await fetch(plantilla2025URL)).arrayBuffer() : plantillaAbierta ?? await (await fetch(plantillaURL)).arrayBuffer();
  const { escribirPlanilla } = await xlsxPlanilla();
  return escribirPlanilla(base, asig.datos, res, estado.proyecto, undefined, undefined, { motor, virgen: true, asig });
}
$('b-libros-zip').addEventListener('click', () => { cerrarMenus(); if (resultadosListos('armar los libros')) void descargarLibrosZip(); });
/** todos los libros juntos: uno por método más la comparación, y un léame con lo que no se pudo armar */
async function descargarLibrosZip() {
  mensaje('Armando los libros de los cuatro métodos…');
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip(), notas: string[] = [], faltan: string[] = [];
  const nivel: 'simple' | 'completa' = estado.config.verificacion === 'completa' ? 'completa' : 'simple';
  const partes: [string, string, () => Promise<Uint8Array>][] = [
    ['1_planilla_virgen.xlsx', 'Planilla virgen (método Planilla): solo los datos en las hojas de la cátedra', bytesVirgen],
    ['2_guia.xlsx', 'Planilla de la guía (método Guía): calculadora paso a paso', async () => (await bytesGuia()).bytes],
    [`3_renovada_${nivel}.xlsx`, `Planilla renovada CIRSOC, ${nivel} (método CIRSOC)`, async () => (await bytesRenovada(nivel)).bytes],
    ['4_reporte_fem.xlsx', 'Reporte FEM (método FEM): los números del modelo', bytesReporteFem],
    ['5_comparacion.xlsx', 'Comparación de métodos (Combinado)', bytesComparacion],
  ];
  for (const [nombre, texto, armar] of partes) {
    try { zip.file(nombre, await armar()); notas.push(`${nombre}: ${texto}`); }
    catch (e) { faltan.push(`${nombre}: no se pudo armar (${e instanceof Error ? e.message : String(e)})`); }
  }
  if (!notas.length) { fallo('No se pudo armar ningún libro', new Error(faltan.join(' · '))); return; }
  zip.file('LEAME.txt', [`${estado.proyecto.nombre || 'Proyecto'}: los libros de los cuatro métodos, armados con la misma torre.`, '', ...notas, ...(faltan.length ? ['', 'Faltan:', ...faltan] : []), '', 'Al abrirlos, Excel o LibreOffice recalculan todo.'].join('\r\n'));
  descargar(nombreArchivo('_libros.zip'), await zip.generateAsync({ type: 'uint8array' }), 'application/zip');
  mensaje(`Libros descargados en un .zip (${notas.length} de ${partes.length}).${faltan.length ? ' ' + faltan.join(' · ') : ''}`);
}
$('b-libro-guia').addEventListener('click', () => { cerrarMenus(); if (resultadosListos('escribir la planilla de la guía')) void descargarLibroGuia(); });
/** planilla de la guía (etapa 5a): una calculadora cerrada con el procedimiento de la guía, que la app solo llena en «Datos» */
async function descargarLibroGuia() {
  try {
    const { bytes, avisos } = await bytesGuia();
    descargar(nombreArchivo('_guia.xlsx'), bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const cfg = estado.config;
    if (cfg.metodo !== 'guia') avisos.push(`El método elegido es «${METODOS[cfg.metodo].nombre}»: la planilla de la guía da los números del método Guía (elegilo arriba para comparar en pantalla).`);
    else if (cfg.armado === 'catedra') avisos.push('Con el armado de la cátedra la app usa el J simplificado de cada pieza; la planilla de la guía calcula el J de la sección real (como el armado de la app).');
    mensaje(`Planilla de la guía descargada: completá o cambiá los datos en la hoja «Datos» y se recalcula sola.${avisos.length ? ' ' + avisos.join(' ') : ''}`);
  } catch (e) { fallo('No se pudo armar la planilla de la guía', e); }
}
$('b-vista-planilla').addEventListener('click', () => { cerrarMenus(); if (!abrirVistaPlanilla()) mensaje('El navegador no dejó abrir otra pestaña: permití las ventanas emergentes para esta página.'); });
$('b-informe').addEventListener('click', () => { cerrarMenus(); if (!resultadosListos('imprimir el informe')) return; imprimirInforme().catch(e => fallo('No se pudo armar el informe', e)); });
$('b-carta-pdf').addEventListener('click', () => { cerrarMenus(); if (!resultadosListos('imprimir la carta')) return; imprimirCartaPdf().catch(e => fallo('No se pudo armar la carta', e)); });
$('b-desglose').addEventListener('click', () => { cerrarMenus(); if (!resultadosListos('armar el desglose')) return; mensaje('Armando el desglose con los dibujos…'); imprimirDesglose().catch(e => fallo('No se pudo armar el desglose', e)); });
$('b-pynite').addEventListener('click', () => { cerrarMenus(); import('./ui/exportarPynite').then(m => mensaje(m.exportarPynite())).catch(e => fallo('No se pudo armar el contraste con Pynite', e)); });
$('b-modelo3d').addEventListener('click', () => { cerrarMenus(); mensaje('Armando el modelo 3D…'); import('./ui/exportarModelo3d').then(m => m.exportarModelo3D()).then(t => mensaje(t)).catch(e => fallo('No se pudo exportar el modelo 3D', e)); });
$('b-presentacion').addEventListener('click', () => { cerrarMenus(); if (!resultadosListos('armar la presentación')) return; mensaje('Armando la presentación…'); import('./ui/presentacion').then(m => m.descargarPresentacion()).then(n => mensaje(`Presentación del trabajo: ${n} láminas. ${AVISO_LETRA_PPTX}`)).catch(e => fallo('No se pudo armar la presentación', e)); });
$('b-desglose-pptx').addEventListener('click', () => { cerrarMenus(); if (!resultadosListos('armar el PowerPoint')) return; mensaje('Armando el PowerPoint…'); descargarPPTX().then(n => mensaje(`Desglose en PowerPoint: ${n} diapositivas. ${AVISO_LETRA_PPTX}`)).catch(e => fallo('No se pudo armar el PowerPoint', e)); });
$('b-recorrido').addEventListener('click', () => { cerrarMenus(); recorrido(0); });
recorridoSiEsPrimeraVez();
$('b-lamina').addEventListener('click', () => { cerrarMenus(); if (!resultadosListos('imprimir la lámina')) return; imprimirLaminas().catch(e => fallo('No se pudo armar la lámina', e)); });

// «Mis proyectos»: versiones en el navegador
function armarMis() {
  const m = $('m-mis'); m.replaceChildren();
  const guardar = h('button', { type: 'button', role: 'menuitem' }, 'Guardar una versión ahora', h('span', { class: 'pista' }, 'Con nombre, en este navegador'));
  guardar.addEventListener('click', async () => {
    cerrarMenus();
    const n = await pedirTexto('Guardar una versión', 'Nombre de la versión. Se guarda en este navegador.', `${estado.proyecto.nombre || 'Proyecto'} · ${fechaCorta(Date.now())}`, 'Guardar');
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
    abrir.addEventListener('click', async () => {
      cerrarMenus();
      const p = leerVersion(v.id);
      if (!p) { fallo(`No se pudo abrir «${v.nombre}»`, new Error('La versión guardada está dañada.')); return; }
      try { if (await reemplazarConCopia(p)) mensaje(`Abierta la versión «${v.nombre}».`); } catch (e) { fallo(`No se pudo abrir «${v.nombre}»`, e); }
    });
    const cmp = h('button', { type: 'button', class: 'glifo', title: `Comparar «${v.nombre}» con el proyecto actual`, 'aria-label': `Comparar ${v.nombre}` }, '⇄');
    cmp.addEventListener('click', ev => {
      ev.stopPropagation(); cerrarMenus();
      const p = leerVersion(v.id); if (!p) return;
      try {
        const html = tablaComparacion(comparar(p, estado.proyecto), v.nombre, 'Actual');
        dialogo(`<h2>Comparar con «${esc(v.nombre)}»</h2><p class="nota">Valores según el método Guía. ✓ verifica, ✗ no verifica; en amarillo, los controles que cambian de estado.</p><div class="cmp-caja">${html}</div>`, [['Cerrar', () => $<HTMLDialogElement>('dialogo').close(), true]]);
        // arriba de la tabla, las dos versiones lado a lado: planta y lo que toma cada pieza
        void import('./ui/compararVista').then(m => { $<HTMLDialogElement>('dialogo').querySelector('.cmp-caja')?.before(m.vistaComparacion(p, estado.proyecto, v.nombre, 'Actual')); }).catch(e => fallo('No se pudo dibujar la comparación', e));
      } catch (e) { fallo('No se pudo comparar', e); }
    });
    const borrar = h('button', { type: 'button', class: 'glifo', title: `Borrar «${v.nombre}»`, 'aria-label': `Borrar ${v.nombre}` }, '✕');
    borrar.addEventListener('click', async ev => { ev.stopPropagation(); cerrarMenus(); if (await confirmar('Borrar la versión', `Se borra «${v.nombre}» de este navegador. No se puede deshacer.`, 'Borrar')) { borrarVersion(v.id); armarMis(); } });
    fila.append(abrir, cmp, borrar); m.append(fila);
  });
}
/**
 * Abre otro proyecto. Primero lo valida el lector único (si está dañado tira un error y no se toca nada); después el
 * actual queda guardado como copia automática. Si el navegador no tiene lugar para esa copia, pregunta antes de seguir.
 * Devuelve true si se abrió.
 */
async function reemplazarConCopia(p: unknown): Promise<boolean> {
  const l = leerProyecto(p);
  if (!l.ok) throw new Error(textoErrores(l.errores));
  if (!guardarVersion(estado.proyecto, `${estado.proyecto.nombre || 'Proyecto'} (antes de abrir otro)`, true)) {
    const r = await tarjeta({ tipo: 'pregunta', titulo: 'No se pudo guardar una copia del proyecto abierto',
      texto: 'El navegador no tiene lugar para la copia automática. Si abrís el otro, el proyecto actual se pierde salvo que lo descargues.',
      botones: ['Descargar el actual y abrir', 'Abrir sin copia', 'Cancelar'] });   // Escape = el último (Cancelar)
    if (r.boton === 2) return false;
    if (r.boton === 0) descargarProyecto();
  }
  const avisos = estado.reemplazar(l.proyecto);
  if (avisos.length) mensaje(`Proyecto reparado al abrir: ${avisos.join(' ')}`);
  return true;
}
/** descarga el proyecto abierto como .json */
function descargarProyecto() { descargar(nombreArchivo('.json'), JSON.stringify(estado.proyecto, null, 1), 'application/json'); }
/** antes de exportar: los resultados tienen que ser los del proyecto actual y el cálculo no tiene que haber fallado */
function resultadosListos(que: string): boolean {
  estado.asegurarCalculo();
  if (estado.vigente) return true;
  fallo(`No se puede ${que}`, new Error(estado.calculo.error
    ? `El cálculo tiene un error: ${estado.calculo.error}. Lo que se ve en pantalla es del último cálculo que anduvo; corregí el proyecto y volvé a intentar.`
    : 'Los resultados no corresponden al proyecto actual. Calculá (F9) y volvé a intentar.'));
  return false;
}
// menús desplegables (tarjetas)
function cerrarMenus() { document.querySelectorAll('.menu.abierto').forEach(m => { m.classList.remove('abierto'); (m.previousElementSibling as HTMLElement | null)?.setAttribute('aria-expanded', 'false'); }); }
([['b-ejemplos', 'm-ejemplos'], ['b-mis', 'm-mis'], ['b-mostrar', 'm-mostrar'], ['b-exportar-menu', 'm-exportar']] as const).forEach(([b, m]) => {
  $(b).addEventListener('click', ev => { ev.stopPropagation(); if (m === 'm-mis') armarMis(); const abierto = $(m).classList.contains('abierto'); cerrarMenus(); if (!abierto) { $(m).classList.add('abierto'); $(b).setAttribute('aria-expanded', 'true'); } });
});
document.addEventListener('click', ev => { if (!(ev.target as Element).closest('.menu')) cerrarMenus(); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && document.querySelector('.menu.abierto')) { cerrarMenus(); ev.stopImmediatePropagation(); } }, true);
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
// modo presentación: todas las etapas menos la ayuda, en el orden del riel
const presentacion = montarPresentacion({ etapas: () => todas().filter(e => e.id !== 'ayuda'), actual: () => estado.etapa, irA, redibujar: () => dibujarTodo() });
$('b-presentar').addEventListener('click', () => presentacion.alternar());
$('b-presentar-menu').addEventListener('click', () => { cerrarMenus(); presentacion.alternar(); });
// modo práctica «Predecí antes de ver»
{ const b = $('b-predecir'), pintar = () => { b.setAttribute('aria-pressed', String(predecirActivo())); b.firstChild!.textContent = predecirActivo() ? 'Predecí antes de ver: prendido' : 'Predecí antes de ver'; };
  pintar(); b.addEventListener('click', () => { cerrarMenus(); ponerPredecir(!predecirActivo()); pintar(); mensaje(predecirActivo() ? 'Modo práctica: en Fuerzas, Rigidez y Rototraslación, la app te pide una estimación antes de mostrar el resultado.' : 'Modo práctica apagado.'); dibujarCentro(); }); }
$('b-exportar').addEventListener('click', () => { void exportar(); });
$<HTMLInputElement>('b-abrir').addEventListener('change', e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void abrir(f); (e.target as HTMLInputElement).value = ''; });

estado.suscribir(() => dibujarTodo(true));
estado.suscribirSeleccion(() => { if (etapaPorId(estado.etapa).centro !== 'planta') dibujarCentro(); });
// lo elegido en la planta (muro, pieza o varios) se resalta en las tablas de la izquierda: Muros, medidas y Piezas
function resaltarEnTablas() {
  const p = estado.proyecto, ids = new Set<string>(estado.multi.m);
  if (estado.seleccion) ids.add(estado.seleccion);
  if (estado.grupoSel) murosDe(p, estado.grupoSel).forEach(m => ids.add(m.id));
  estado.multi.g.forEach(g => murosDe(p, g).forEach(m => ids.add(m.id)));
  resaltarFilas('muros', ids); resaltarFilas('medidas-A', ids); resaltarFilas('medidas-B', ids);
  const nota = document.getElementById('nota-conjunto');
  if (nota) nota.textContent = ids.size > 1 ? `${ids.size} muros elegidos en la planta (resaltados): lo que escribas en una celda de una de sus filas se aplica a todos, en esa columna. Un clic en otra fila deja de editar el conjunto.` : '';
  // se resalta sin mover el panel: si saltara hasta la fila, se perderían de vista las herramientas de arriba
  document.querySelectorAll<HTMLElement>('#panel [data-muros-pieza]').forEach(tr => {
    const si = (tr.dataset.murosPieza ?? '').split(' ').some(id => ids.has(id));
    tr.classList.toggle('resaltada', si);
  });
}
estado.suscribirSeleccion(resaltarEnTablas);
estado.suscribir(() => requestAnimationFrame(resaltarEnTablas));
montarPlanta($('vista-planta'));
montar3D($('vista-3d'), { deformada: () => estado.capas.deformada, roto: datosRoto3D, rotulo: true });
montarDiagramaJ($('vista-3d'), $<HTMLButtonElement>('b-j3d'));
$('b-foto3d').addEventListener('click', () => {
  const n = vistas3D.length + 1;
  const ok = capturar3D(`Vista del 3D ${n} · viento ${estado.dir}${estado.capas.tensiones ? ' · tensiones' : ''}${estado.capas.presiones && !estado.capas.deformada ? ` · presiones, caso ${estado.capas.casoViento}` : ''}${estado.capas.deformada ? ' · deformada' : ''}`);
  mensaje(ok ? `Vista del 3D guardada para el informe (${n}). Exportar → Informe la pone en la sección «Vistas, plantas y cortes».` : 'No se pudo guardar la vista del 3D.');
});
{
  // capa de tensiones del 3D (botón σ)
  const bT = $<HTMLButtonElement>('b-t3d');
  try { estado.capas.tensiones = localStorage.getItem('torre3d.tensiones3d') === '1'; } catch { /* sin almacenamiento */ }
  bT.setAttribute('aria-pressed', String(estado.capas.tensiones));
  bT.addEventListener('click', () => {
    estado.capas.tensiones = !estado.capas.tensiones;
    bT.setAttribute('aria-pressed', String(estado.capas.tensiones));
    try { localStorage.setItem('torre3d.tensiones3d', estado.capas.tensiones ? '1' : '0'); } catch { /* sin almacenamiento */ }
    estado.avisarPanel();
  });
}
{
  // presiones del viento sobre las fachadas (botón p): simulador de viento, etapa V1
  const bP = $<HTMLButtonElement>('b-p3d');
  try { estado.capas.presiones = localStorage.getItem('torre3d.presiones3d') === '1'; } catch { /* sin almacenamiento */ }
  bP.setAttribute('aria-pressed', String(estado.capas.presiones));
  bP.addEventListener('click', () => {
    estado.capas.presiones = !estado.capas.presiones;
    bP.setAttribute('aria-pressed', String(estado.capas.presiones));
    try { localStorage.setItem('torre3d.presiones3d', estado.capas.presiones ? '1' : '0'); } catch { /* sin almacenamiento */ }
    if (estado.capas.presiones && estado.capas.deformada) mensaje('Las presiones se ven con la torre sin deformar: apagá la deformada.');
    estado.avisarPanel();
  });
}
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
// versión de esta compilación (la misma en la página publicada y en el archivo único de esa versión)
{
  const v = document.getElementById('compilacion'), c = __COMPILACION__;
  if (v) { v.textContent = `v${c.version} · ${c.commit}`; v.title = `Compilación ${c.commit} del ${c.fecha.split('-').reverse().join('/')} (versión ${c.version}). El archivo torre3d.html de la página publicada y esta app dicen lo mismo si coinciden.`; }
}

// ------------------------------------------------------------------ Google Sheets (dos vías)
const CLAVE_SHEETS = 'torre3d.sheets';
let sincro: SincroSheets | null = null;
let aplicandoRemoto = false;
const paqueteActual = () => paquete(estado.proyecto, celdasAEscribir(estado.calculo.asig.datos, estado.calculo.res));
function pistaSheets(t: string) { const e = document.getElementById('b-sheets-pista'); if (e) e.textContent = t; }
function traerDeLaHoja(l: Lectura) {
  let base = estado.proyecto;
  if (l.t3d) { const lp = leerProyecto(l.t3d); if (lp.ok) base = lp.proyecto; /* si está dañado se usa el de la app */ }
  const { proyecto, avisos } = proyectoDesdeHoja(base, l);
  aplicandoRemoto = true;
  // lo que llega de la hoja pasa por el lector único: si está dañado no se aplica y la app sigue con su proyecto
  try { avisos.push(...estado.reemplazar(proyecto)); }
  catch (e) { mensaje(`Los cambios de Google Sheets no se aplicaron: ${e instanceof Error ? e.message : String(e)}`); return; }
  finally { aplicandoRemoto = false; }
  mensaje(`Cambios traídos de Google Sheets (versión ${l.version})${avisos.length ? ` · ${avisos.length} aviso${avisos.length > 1 ? 's' : ''}: ${avisos[0]}` : ''}.`);
}
/** la planilla cambió mientras la app quería escribir (otro editor o una edición a mano): que decida el alumno */
async function conflictoSheets(version: number) {
  const s = sincro;
  if (!s) return;
  const r = await tarjeta({ tipo: 'pregunta', titulo: 'La planilla de Google Sheets cambió',
    texto: `Mientras editabas en la app, la planilla pasó a la versión ${version} (otra persona o una edición a mano). No se pisó nada. ¿Con cuál te quedás?`,
    botones: ['Traer la de la planilla', 'Escribir la de la app encima', 'Decidir después'] });
  try {
    if (r.boton === 0) await s.traer();
    else if (r.boton === 1) await s.escribir(paqueteActual(), true);
    else mensaje('Sincronización en pausa hasta que elijas (Exportar → Sincronizar con Google Sheets).');
  } catch (e) { fallo('No se pudo resolver el cambio de la planilla', e); }
}
async function conectarSheets(url: string, clave: string) {
  sincro?.detener();
  const s = new SincroSheets(url, { remoto: traerDeLaHoja, estado: (t, error) => { mensaje(t); if (error) pistaSheets('Sin conexión: revisá la dirección y la clave'); }, conflicto: v => { void conflictoSheets(v); } }, undefined, clave);
  const r = await s.conectar(paqueteActual);
  sincro = s; s.iniciar(5000);
  try { localStorage.setItem(CLAVE_SHEETS, JSON.stringify({ url, clave })); } catch { /* sin almacenamiento: hay que volver a conectar la próxima vez */ }
  pistaSheets('Conectado: los cambios van y vienen solos');
  mensaje(r === 'leido' ? 'Conectado con Google Sheets: se trajo el edificio de la planilla.' : 'Conectado con Google Sheets: se escribió el edificio en la planilla.');
}
function desconectarSheets() {
  sincro?.detener(); sincro = null;
  try { localStorage.removeItem(CLAVE_SHEETS); } catch { /* nada */ }
  pistaSheets('Editar el edificio desde la planilla o desde la app');
  mensaje('Desconectado de Google Sheets.');
}
estado.suscribir(() => { if (sincro && !aplicandoRemoto && estado.vigente) sincro.programar(paqueteActual); });
$('b-sheets').addEventListener('click', () => {
  cerrarMenus();
  const actual = sincro?.url ?? '';
  dialogo(`<h2>Sincronizar con Google Sheets</h2>
    <p>La planilla del curso en Google Sheets y la app quedan unidas: lo que cambiás en una aparece en la otra en unos segundos.</p>
    <ol class="nota">
      <li>Subí la planilla a Google Drive y abrila con Google Sheets.</li>
      <li>Extensiones → Apps Script: pegá el código de <a href="https://github.com/mathster-a11y/tower-for-college-app/blob/main/docs/sheets/Codigo.gs" target="_blank" rel="noopener">docs/sheets/Codigo.gs</a> y guardá.</li>
      <li>Elegí la función <b>configurar</b> y tocá Ejecutar: en el registro aparece la <b>clave</b>.</li>
      <li>Implementar → Nueva implementación → Aplicación web · Ejecutar como: yo · Acceso: cualquier persona.</li>
      <li>Pegá acá la dirección que termina en <code>/exec</code> y la clave.</li>
    </ol>
    <p class="nota"><b>Si ya lo tenías instalado</b> y la app avisa que el script es de una versión anterior: pegá el código nuevo encima, guardá y publicalo como versión nueva (Implementar → Administrar implementaciones → ✎ → Versión: nueva → Implementar). La dirección y la clave no cambian.</p>
    <label class="campo"><span>Dirección de la aplicación web</span><input id="sh-url" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(actual)}"></label>
    <label class="campo"><span>Clave (la que muestra «configurar»)</span><input id="sh-clave" type="password" autocomplete="off" value="${esc(sincro?.clave ?? '')}"></label>
    <p class="nota">Desde la planilla se editan las hojas «T3D Niveles», «T3D Muros» y los datos de la hoja «viento». Si la planilla ya tiene un edificio, al conectar se trae ese; si está vacía, se escribe el de la app. Si la planilla cambia mientras editás en la app, no se pisa nada: la app te pregunta con cuál quedarte. La clave no se comparte: sin ella, la dirección sola no lee ni escribe.</p>`, [
    ...(sincro ? [['Desconectar', () => { desconectarSheets(); $<HTMLDialogElement>('dialogo').close(); }] as [string, () => void]] : []),
    ['Cancelar', () => $<HTMLDialogElement>('dialogo').close()],
    ['Conectar', async () => {
      const url = ($('sh-url') as HTMLInputElement).value.trim(), clave = ($('sh-clave') as HTMLInputElement).value.trim();
      if (!/^[0-9a-f]{32}$/i.test(clave)) { await avisar('error', 'Falta la clave', 'Ejecutá «configurar» en el editor de Apps Script de la planilla y copiá la clave que aparece en el registro (32 letras y números). Si la planilla tiene el script viejo, pegale el código nuevo.'); return; }
      if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { await avisar('error', 'Dirección no válida', 'Tiene que ser la dirección de la aplicación web de Apps Script: empieza con https://script.google.com/ y termina en /exec.'); return; }
      $<HTMLDialogElement>('dialogo').close();
      mensaje('Conectando con Google Sheets…');
      try { await conectarSheets(url, clave); } catch (e) { fallo('No se pudo conectar con Google Sheets', e); }
    }, true],
  ]);
});
// si la última vez quedó conectada, se vuelve a conectar sola
try {
  const g = localStorage.getItem(CLAVE_SHEETS);
  // antes se guardaba solo la dirección (script sin clave): hay que volver a conectar con la clave
  const d = g && g.startsWith('{') ? JSON.parse(g) as { url: string; clave: string } : null;
  if (d?.url && d.clave) conectarSheets(d.url, d.clave).catch(e => { mensaje(`Google Sheets no responde: ${(e as Error).message}`); pistaSheets('Sin conexión: revisá la dirección y la clave'); });
  else if (g) pistaSheets('Volvé a conectar: el script de la planilla ahora pide una clave');
} catch { /* sin almacenamiento */ }

// notación matemática en toda la interfaz (sistema de diseño 2.1): se aplica a lo que se va dibujando
{
  let pend = false;
  const pasar = () => { pend = false; aplicarMat(document); };
  new MutationObserver(() => { if (!pend) { pend = true; requestAnimationFrame(pasar); } }).observe(document.body, { childList: true, subtree: true });
  pasar();
}

// instalar como app (tablet o compu): con el link publicado se guarda una copia completa para usarla sin internet.
// La primera vez se avisa cuando terminó de guardarse todo (antes, sin red no abriría).
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !import.meta.env.DEV) {
  const primeraVez = !navigator.serviceWorker.controller;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(() => { if (primeraVez) mensaje('Lista para usar sin conexión: la app quedó guardada completa en este dispositivo.'); })
      .catch(() => { /* sin copia: la app igual funciona en línea */ });
  });
}

// solo en desarrollo: acceso para las pruebas automáticas (no va en la app publicada)
if (import.meta.env.DEV) import('./ui/etapas').then(m => { (window as unknown as Record<string, unknown>).__torre = { estado, datosRoto3D: m.datosRoto3D }; });

// guardado automático: si el navegador no deja guardar, se avisa y se ofrece descargar el proyecto
estado.suscribirGuardado(async falla => {
  if (!falla) { mensaje('El guardado automático en el navegador volvió a andar.'); return; }
  mensaje('⚠ El proyecto NO se está guardando en el navegador: descargalo (.json) para no perderlo.');
  const r = await tarjeta({ tipo: 'aviso', titulo: 'El navegador no deja guardar el proyecto',
    texto: 'El guardado automático falló (el navegador no tiene lugar o está en modo privado). Los cambios están solo en esta pestaña: si la cerrás, se pierden. Descargá el proyecto para guardarlo.',
    botones: ['Descargar el proyecto', 'Seguir sin descargar'] });   // Escape = el último
  if (r.boton === 0) descargarProyecto();
});
if (estado.avisoInicio) void tarjeta({ tipo: 'aviso', titulo: 'Proyecto guardado', texto: estado.avisoInicio, botones: ['Entendido'] });

// la app arrancó: se saca el cartel de «Cargando…»
(window as unknown as { __torreLista?: boolean }).__torreLista = true;
document.getElementById('arranque')?.remove();

// paneles de los costados: divisores que se deslizan y paneles que se pliegan
montarDivisores();
{
  const b3 = document.querySelector<HTMLElement>('.bloque3d'), cab3 = b3?.querySelector<HTMLElement>('.tira');
  if (b3 && cab3) { cab3.insertAdjacentHTML('beforeend', '<span class="plegar" aria-hidden="true">▾</span>'); hacerPlegable(b3, cab3, 'Axonometría', false); }
}

}
