/**
 * Etapa «Vista 3D» (al final del riel, debajo de Exoesqueleto): la torre en grande con estilos de dibujo (sombreado,
 * transparente, alambre, texturado, render y render parcial), color por dato, cámaras (perspectiva o paralela;
 * isométrica, dimétrica, trimétrica, planta, frente, contrafrente y laterales) con un cubo de navegación, cortes en
 * planta y en alzado con el relleno de lo cortado, pisos separados, aislar y rayos X, elegir un muro tocándolo (y verlo
 * en la planta), vistas guardadas en el proyecto y la imagen para guardar. No cambia el cálculo.
 */
import * as THREE from 'three';
import { estado, fmt } from './estado';
import { h, hacerPlegable, type H } from './comp';
import { completarPresentacion, datosColor, desplazamientoPiso, RAMPA_CSS, type ColorPor, type Estilo3D, type Presentacion3D, type Vista3D } from './presentacion3d';

const CLAVE = 'torre3d.visor3d';
const cfg: Presentacion3D = (() => {
  try { const g = JSON.parse(localStorage.getItem(CLAVE) ?? 'null'); if (g) return completarPresentacion(g); } catch { /* sin almacenamiento */ }
  return completarPresentacion(null);
})();
const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(cfg)); } catch { /* sin almacenamiento */ } };

type Api = {
  construir: () => void; encuadrar: () => void;
  elegirEn: (x: number, y: number) => { muro?: string; nivel?: number; punto: THREE.Vector3 } | null;
  camaraAhora: () => { pos: [number, number, number]; obj: [number, number, number]; zoom: number };
  ponerCamara: (c: { pos: [number, number, number]; obj: [number, number, number]; zoom: number }) => void;
  orientacion: () => THREE.Quaternion;
  alCambiarCamara: (f: () => void) => void;
};
let caja: H | null = null;
let api: Api | null = null;
/** el nivel que se tocó en el 3D (para «Ver en la planta») */
let nivelTocado: number | null = null;
/** se aplica lo elegido: se rearma el 3D (y el panel, para que los botones digan lo que está puesto) */
function cambio(rearmarPanel = true) { guardar(); api?.construir(); if (rearmarPanel) estado.avisarPanel(); }

const ESTILOS: [Estilo3D, string, string][] = [
  ['sombreado', 'Sombreado', 'Caras opacas con luz y las aristas; el vidrio de la fachada, transparente'],
  ['transparente', 'Transparente', 'Todo traslúcido con las aristas: se ve la estructura de adentro'],
  ['alambre', 'Alambre', 'Solo las aristas (sin caras)'],
  ['texturado', 'Texturado', 'Hormigón con encofrado en muros y losas; vidrio en la fachada'],
  ['render', 'Render', 'Texturas, sombras del sol sobre un suelo y luz más fotográfica (más lento)'],
];
const VISTAS: [Vista3D, string, string][] = [
  ['libre', 'Libre', 'La que dejes girando con el mouse'],
  ['iso', 'Isométrica', 'Los tres ejes con el mismo ángulo (35,26° desde el suelo)'],
  ['dimetrica', 'Dimétrica', 'Dos ejes iguales (a 45° en planta, 20,7° desde el suelo)'],
  ['trimetrica', 'Trimétrica', 'Los tres ejes distintos (a 30° en planta, 25° desde el suelo)'],
  ['planta', 'Planta', 'Desde arriba'],
  ['frente', 'Frente', 'Desde el −y de la planta (la cara que recibe el viento A)'],
  ['contrafrente', 'Contrafrente', 'Desde el +y de la planta'],
  ['izquierda', 'Lateral izq.', 'Desde el −x de la planta'],
  ['derecha', 'Lateral der.', 'Desde el +x de la planta'],
];

/** sección del panel, abierta de entrada (los controles se usan todo el tiempo); se recuerda si se pliega */
function seccion(titulo: string): { el: H; cuerpo: H } {
  const cuerpo = h('div', { class: 'cuerpo' });
  const cab = h('div', { class: 'cab' }, h('h3', {}, titulo), h('span', { class: 'plegar', 'aria-hidden': 'true' }, '▾'));
  const el = h('section', { class: 'seccion' }, cab, cuerpo);
  hacerPlegable(el, cab, `Vista 3D · ${titulo}`, false);
  return { el, cuerpo };
}

function seg<T extends string>(opciones: [T, string, string][], valor: T, elegir: (v: T) => void, clase = 'seg'): H {
  const s = h('div', { class: clase, role: 'group' });
  opciones.forEach(([v, t, ayuda]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(v === valor), title: ayuda }, t);
    b.addEventListener('click', () => elegir(v));
    s.append(b);
  });
  return s;
}

/** los niveles sobre el suelo, de abajo arriba (para los cortes y el render parcial) */
const nivelesOrden = () => [...estado.proyecto.niveles].sort((a, b) => a.cota - b.cota);
function selectorNivel(valor: number, alCambiar: (z: number) => void, etiqueta: string, desplaz = 0): H {
  const s = h('select', { 'aria-label': etiqueta });
  nivelesOrden().forEach(n => s.append(h('option', { value: String(n.cota) }, `${n.nombre} · ${fmt(n.cota, 2)} m`)));
  const cotas = nivelesOrden().map(n => n.cota);
  const cerca = cotas.reduce((a, c) => (Math.abs(c + desplaz - valor) < Math.abs(a + desplaz - valor) ? c : a), cotas[0] ?? 0);
  s.value = String(cerca);
  s.addEventListener('change', () => alCambiar(Number(s.value) + desplaz));
  return h('label', { class: 'fila-acciones' }, h('span', { class: 'nota' }, etiqueta), s);
}

export function panelVisor(c: H) {
  const p = estado.proyecto;
  const top = p.niveles[0]?.cota ?? 0, fondo = p.niveles[p.niveles.length - 1]?.cota ?? 0;
  const B = Math.max(1, ...p.niveles.map(n => n.B ?? 0)), L = Math.max(1, ...p.niveles.map(n => n.L ?? 0));
  c.append(h('p', { class: 'nota' }, 'La torre en grande para mirarla y presentarla: estilos de dibujo, cámaras, cortes en planta y en alzado. No cambia el proyecto ni el cálculo. Arrastrar gira, la rueda acerca y el doble clic encuadra.'));

  const estilo = seccion('Estilo');
  estilo.cuerpo.append(seg(ESTILOS, cfg.estilo, v => { cfg.estilo = v; cambio(); }));
  // color por dato: cada muro con el tono de un número de la app (una rampa de un solo tono)
  estilo.cuerpo.append(h('p', { class: 'nota' }, 'Color de los muros'),
    seg(COLORES, cfg.colorPor, v => { cfg.colorPor = v; cambio(); }, 'seg vistas-visor'));
  const dc = datosColor(cfg.colorPor);
  if (typeof dc === 'string') estilo.cuerpo.append(h('p', { class: 'nota aviso-loft' }, dc));
  else if (dc) {
    const barra = h('div', { class: 'escala-dato', 'aria-hidden': 'true' });
    barra.style.background = RAMPA_CSS;
    estilo.cuerpo.append(h('div', { class: 'leyenda-dato' }, h('b', {}, dc.titulo), barra,
      h('div', { class: 'extremos' }, h('span', {}, dc.min), h('span', {}, dc.max)), ...(dc.nota ? [h('small', {}, dc.nota)] : [])));
  }
  const parcial = h('input', { type: 'checkbox' }) as HTMLInputElement;
  parcial.checked = cfg.parcial.activo;
  parcial.addEventListener('change', () => {
    cfg.parcial.activo = parcial.checked;
    if (parcial.checked && cfg.parcial.z1 <= cfg.parcial.z0) { cfg.parcial.z0 = fondo; cfg.parcial.z1 = Math.min(top, fondo + 20); }
    cambio();
  });
  estilo.cuerpo.append(h('label', { class: 'fila-acciones', title: 'Solo una franja de la torre con el estilo elegido; el resto, transparente (para mostrar un tramo: la base, el cajón, la corona…)' }, parcial, h('span', {}, 'Render parcial: solo una franja de alturas')));
  if (cfg.parcial.activo) {
    estilo.cuerpo.append(
      selectorNivel(cfg.parcial.z0, z => { cfg.parcial.z0 = z; cambio(false); }, 'desde'),
      selectorNivel(cfg.parcial.z1, z => { cfg.parcial.z1 = z; cambio(false); }, 'hasta'));
  }

  const camara = seccion('Cámara');
  camara.cuerpo.append(
    seg([['perspectiva', 'Perspectiva', 'Como la ve el ojo: lo lejano, más chico'], ['paralela', 'Paralela', 'Sin fuga: las medidas paralelas se ven iguales (axonometría, planta y alzados)']] as ['perspectiva' | 'paralela', string, string][],
      cfg.proyeccion, v => { cfg.proyeccion = v; cambio(); }),
    h('p', { class: 'nota' }, 'Punto de vista'),
    seg(VISTAS, cfg.vista, v => {
      cfg.vista = v;
      // las axonometrías, la planta y los alzados se dibujan en paralela (se puede volver a perspectiva)
      if (v !== 'libre') cfg.proyeccion = 'paralela';
      cambio();
    }, 'seg vistas-visor'));
  const bEnc = h('button', { type: 'button', title: 'Vuelve al punto de vista elegido, con la torre entera' }, 'Encuadrar');
  bEnc.addEventListener('click', () => api?.encuadrar());
  camara.cuerpo.append(h('div', { class: 'fila-acciones' }, bEnc));

  const corte = seccion('Corte');
  corte.cuerpo.append(seg([['no', 'Sin corte', 'La torre entera'], ['planta', 'En planta', 'Un plano horizontal: se ve lo de abajo, con los muros cortados rellenos'], ['alzado', 'En alzado', 'Un plano vertical: la torre cortada de arriba abajo, con muros y losas cortados rellenos']] as ['no' | 'planta' | 'alzado', string, string][],
    cfg.corte.tipo, v => {
      cfg.corte.tipo = v;
      if (v === 'planta' && cfg.vista === 'libre') cfg.vista = 'libre';
      cambio();
    }));
  if (cfg.corte.tipo === 'planta') {
    corte.cuerpo.append(selectorNivel(cfg.corte.z, z => { cfg.corte.z = z; cambio(false); }, 'piso (corta a 1,20 m)', 1.2));
    const r = h('input', { type: 'range', min: String(fondo), max: String(top + 1), step: '0.05', value: String(cfg.corte.z), 'aria-label': 'Altura del corte' }) as HTMLInputElement;
    const et = h('span', { class: 'n' }, `z = ${fmt(cfg.corte.z, 2)} m`);
    r.addEventListener('input', () => { cfg.corte.z = Number(r.value); et.textContent = `z = ${fmt(cfg.corte.z, 2)} m`; guardar(); api?.construir(); });
    corte.cuerpo.append(h('label', { class: 'fila-acciones' }, h('span', { class: 'nota' }, 'altura'), r, et));
  }
  if (cfg.corte.tipo === 'alzado') {
    corte.cuerpo.append(seg([['y', 'Longitudinal', 'Un plano paralelo a x (corta la torre a lo largo de B)'], ['x', 'Transversal', 'Un plano paralelo a y (corta la torre a lo ancho, L)']] as ['x' | 'y', string, string][],
      cfg.corte.eje, v => { cfg.corte.eje = v; cfg.corte.pos = 0; cambio(); }));
    const ext = (cfg.corte.eje === 'x' ? B : L) / 2 + 1;
    const r = h('input', { type: 'range', min: String(-ext), max: String(ext), step: '0.05', value: String(cfg.corte.pos), 'aria-label': 'Posición del corte' }) as HTMLInputElement;
    const et = h('span', { class: 'n' }, `${cfg.corte.eje} = ${fmt(cfg.corte.pos, 2)} m`);
    r.addEventListener('input', () => { cfg.corte.pos = Number(r.value); et.textContent = `${cfg.corte.eje} = ${fmt(cfg.corte.pos, 2)} m`; guardar(); api?.construir(); });
    const bLado = h('button', { type: 'button', title: 'Muestra la otra mitad de la torre' }, '⇄ La otra mitad');
    bLado.addEventListener('click', () => { cfg.corte.lado = cfg.corte.lado === 1 ? -1 : 1; cambio(false); });
    corte.cuerpo.append(h('label', { class: 'fila-acciones' }, h('span', { class: 'nota' }, 'posición'), r, et), h('div', { class: 'fila-acciones' }, bLado));
  }
  corte.cuerpo.append(h('p', { class: 'nota' }, 'Para ver el corte de frente: «En planta» con el punto de vista «Planta»; «En alzado» longitudinal con «Frente» y transversal con «Lateral izq.» (o «⇄ La otra mitad» y el lateral de enfrente).'));

  // pisos separados
  const pisos = seccion('Pisos separados');
  const rs = h('input', { type: 'range', min: '0', max: '12', step: '0.5', value: String(cfg.separar), 'aria-label': 'Separación entre pisos' }) as HTMLInputElement;
  const ets = h('span', { class: 'n' }, cfg.separar > 0 ? `${fmt(cfg.separar, 1)} m` : 'juntos');
  rs.addEventListener('input', () => { ets.textContent = Number(rs.value) > 0 ? `${fmt(Number(rs.value), 1)} m` : 'juntos'; });
  rs.addEventListener('change', () => { cfg.separar = Number(rs.value); cambio(false); });
  const bJuntar = h('button', { type: 'button', title: 'La torre como es' }, 'Juntar');
  bJuntar.addEventListener('click', () => { cfg.separar = 0; cambio(); });
  pisos.cuerpo.append(h('label', { class: 'fila-acciones' }, h('span', { class: 'nota' }, 'separación'), rs, ets), h('div', { class: 'fila-acciones' }, bJuntar),
    h('p', { class: 'nota' }, 'Cada nivel se abre del de abajo (la losa va con los muros de arriba): se ve qué muros llegan a cada nivel y dónde cambia la planta. Las barras del exo se estiran para seguir unidas.'));

  // elegir un muro (tocándolo en el 3D o en la planta), aislarlo y verlo en la planta
  const muro = seccion('Muro elegido');
  infoMuro = h('div', { class: 'info-muro-visor' });
  muro.cuerpo.append(h('p', { class: 'nota' }, 'Tocá un muro en el 3D para elegirlo (lo elegido en la planta también vale).'), infoMuro);
  pintarInfoMuro();

  // vistas guardadas en el proyecto
  const vistas = seccion('Vistas guardadas');
  const lista = estado.proyecto.vistas3d ?? [];
  const nombre = h('input', { type: 'text', id: 'visor-nombre-vista', placeholder: `Vista ${lista.length + 1}`, 'aria-label': 'Nombre de la vista', maxlength: '60' }) as HTMLInputElement;
  const bGuardar = h('button', { type: 'button', title: 'Guarda en el proyecto lo que se ve: estilo, color, cortes, pisos, lo aislado y la cámara' }, 'Guardar esta vista');
  bGuardar.addEventListener('click', () => {
    if (!api) return;
    const n = nombre.value.trim() || `Vista ${lista.length + 1}`;
    const v = { nombre: n, pr: JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>, camara: api.camaraAhora() };
    estado.cambiar(p => { p.vistas3d = [...(p.vistas3d ?? []).filter(x => x.nombre !== n), v]; });
  });
  vistas.cuerpo.append(h('div', { class: 'fila-acciones' }, nombre, bGuardar));
  if (!lista.length) vistas.cuerpo.append(h('p', { class: 'nota' }, 'Todavía no hay vistas guardadas. Se guardan en el proyecto (viajan con el archivo) y no cambian el cálculo.'));
  lista.forEach((v, i) => {
    const bIr = h('button', { type: 'button', title: 'Vuelve a esta vista' }, v.nombre);
    bIr.addEventListener('click', () => irAVista(i));
    const bX = h('button', { type: 'button', class: 'quitar', title: `Borra la vista «${v.nombre}»`, 'aria-label': `Borrar ${v.nombre}` }, '✕');
    bX.addEventListener('click', () => estado.cambiar(p => { p.vistas3d = (p.vistas3d ?? []).filter((_, k) => k !== i); }));
    vistas.cuerpo.append(h('div', { class: 'fila-acciones vista-guardada' }, bIr, bX));
  });

  const imagen = seccion('Imagen');
  const bImg = h('button', { type: 'button', title: 'Guarda lo que se ve como PNG (para el informe o las láminas)' }, '⤓ Guardar imagen (PNG)');
  bImg.addEventListener('click', () => {
    const cv = caja?.querySelector('canvas');
    if (!cv) return;
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = `${(estado.proyecto.nombre || 'torre').replace(/[^\w-]+/g, '_')}_3d_${cfg.estilo}_${cfg.vista}.png`;
    a.click();
  });
  imagen.cuerpo.append(h('div', { class: 'fila-acciones' }, bImg));

  c.append(estilo.el, camara.el, corte.el, pisos.el, muro.el, vistas.el, imagen.el);
}

const COLORES: [ColorPor, string, string][] = [
  ['no', 'Por papel', 'Los colores de siempre (alma, ala, tubo…)'],
  ['espesor', 'Espesor', 'Del más delgado (claro) al más grueso (oscuro)'],
  ['parte', 'Parte del viento', 'J / ΣJ de la pieza de cada muro, en el viento elegido'],
  ['cuantia', 'Cuantía', 'Cuantía vertical necesaria del CIRSOC 201 (con CIRSOC o FEM)'],
];

/** vuelve a una vista guardada: lo que se ve y la cámara */
function irAVista(i: number) {
  const v = estado.proyecto.vistas3d?.[i];
  if (!v) return;
  Object.assign(cfg, completarPresentacion(v.pr as Partial<Presentacion3D>));
  guardar();
  api?.construir();
  api?.ponerCamara(v.camara);
  estado.avisarPanel();
}

// ------------------------------------------------------------------------------------------------ muro elegido
let infoMuro: H | null = null;
const nombreNivel = (z: number) => {
  const n = [...estado.proyecto.niveles].sort((a, b) => a.cota - b.cota).filter(x => x.cota <= z + 1e-6).pop();
  return n ? n.nombre : '—';
};
/** los muros de la pieza del muro en el viento elegido (o solo el muro, si no está en una pieza) */
function murosDePieza(id: string): { muros: string[]; nombre: string } {
  const p = estado.proyecto, m = p.muros.find(x => x.id === id);
  const pz = m ? (estado.dir === 'A' ? m.piezaA : m.piezaB) : '';
  if (!m || !pz) return { muros: m ? [m.id] : [], nombre: m ? `muro ${m.id}` : '' };
  return { muros: p.muros.filter(x => (estado.dir === 'A' ? x.piezaA : x.piezaB) === pz).map(x => x.id), nombre: `pieza ${pz} (viento ${estado.dir})` };
}
function pintarInfoMuro() {
  const el = infoMuro;
  if (!el) return;
  el.replaceChildren();
  const p = estado.proyecto, id = estado.seleccion, m = id ? p.muros.find(x => x.id === id) : undefined;
  const botones: H[] = [];
  const b = (t: string, ayuda: string, f: () => void) => { const x = h('button', { type: 'button', title: ayuda }, t); x.addEventListener('click', f); botones.push(x); };
  if (m) {
    const zTop = p.niveles[0]?.cota ?? 0, zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0;
    const pz = estado.dir === 'A' ? m.piezaA : m.piezaB;
    el.append(h('p', {}, h('b', {}, `Muro ${m.id}`), ` · ${pz ? `pieza ${pz} en el viento ${estado.dir}` : `sin pieza en el viento ${estado.dir}`}`),
      h('p', { class: 'nota' }, `De ${nombreNivel(m.zDesde ?? zFund)} a ${nombreNivel(Math.min(m.zHasta ?? zTop, zTop))} · ${fmt(m.largo, 2)} × ${fmt(m.espesor, 2)} m${nivelTocado !== null ? ` · tocado en ${nombreNivel(nivelTocado)}` : ''}`));
    const aislarCon = (modo: 'aislar' | 'rayosx', q: { muros: string[]; nombre: string }) => { cfg.aislar = { modo, muros: q.muros, nombre: q.nombre }; cambio(); };
    b('Aislar el muro', 'Solo este muro; lo demás se oculta', () => aislarCon('aislar', { muros: [m.id], nombre: `muro ${m.id}` }));
    if (pz) b('Aislar la pieza', `Solo los muros de la pieza ${pz}`, () => aislarCon('aislar', murosDePieza(m.id)));
    b('Rayos X', 'La pieza (o el muro) opaca dentro de la torre casi transparente', () => aislarCon('rayosx', murosDePieza(m.id)));
    b('Ver en la planta', 'Va a Diseño con este muro elegido, en el nivel que tocaste', () => {
      if (nivelTocado !== null) {
        const iPB = p.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1);
        const n = [...p.niveles].sort((a2, b2) => a2.cota - b2.cota).filter(x => x.cota <= nivelTocado! + 1e-6).pop();
        estado.nivelPlanta = !n || Math.abs(n.cota - (p.niveles[iPB]?.cota ?? 0)) < 1e-6 ? null : n.cota;
      }
      document.dispatchEvent(new CustomEvent('torre:ir-etapa', { detail: 'diseno' }));
    });
  } else el.append(h('p', { class: 'nota' }, 'No hay ningún muro elegido.'));
  if (cfg.aislar.modo !== 'no' && cfg.aislar.muros.length) {
    el.append(h('p', { class: 'nota' }, `${cfg.aislar.modo === 'aislar' ? 'Aislado' : 'En rayos X'}: ${cfg.aislar.nombre}.`));
    b('Mostrar todo', 'Vuelve a mostrar toda la torre', () => { cfg.aislar = { modo: 'no', muros: [], nombre: '' }; cambio(); });
  }
  if (estado.nivelPlanta !== null) {
    el.append(h('p', { class: 'nota' }, `El nivel que se ve en la planta (${nombreNivel(estado.nivelPlanta)}) está marcado en el 3D.`));
    b('Quitar la marca del nivel', 'Saca la marca del nivel de la planta en el 3D', () => { estado.nivelPlanta = null; estado.avisarSeleccion(); });
  }
  if (botones.length) el.append(h('div', { class: 'fila-acciones' }, ...botones));
}
let oyendoSeleccion = false;

// ------------------------------------------------------------------------------------------------ cubo de navegación
const CARAS: { vista: Vista3D | null; texto: string; t: string }[] = [
  { vista: 'frente', texto: 'Frente', t: 'translateZ(var(--m))' },
  { vista: 'contrafrente', texto: 'Contra', t: 'rotateY(180deg) translateZ(var(--m))' },
  { vista: 'derecha', texto: 'Der.', t: 'rotateY(90deg) translateZ(var(--m))' },
  { vista: 'izquierda', texto: 'Izq.', t: 'rotateY(-90deg) translateZ(var(--m))' },
  { vista: 'planta', texto: 'Planta', t: 'rotateX(90deg) translateZ(var(--m))' },
  { vista: null, texto: 'Abajo', t: 'rotateX(-90deg) translateZ(var(--m))' },
];
function cuboNavegacion(): { el: H; actualizar: () => void } {
  const cubo = h('div', { class: 'cubo' });
  const el = h('div', { class: 'cubo-nav', role: 'group', 'aria-label': 'Cubo de navegación' }, h('div', { class: 'escena-cubo' }, cubo));
  CARAS.forEach(c => {
    const f = c.vista ? h('button', { type: 'button', class: 'cara', title: `Ver desde: ${c.texto}` }, c.texto) : h('div', { class: 'cara', 'aria-hidden': 'true' }, c.texto);
    f.style.transform = c.t;
    if (c.vista) { const v = c.vista; f.addEventListener('click', () => irVista(v)); }
    cubo.append(f);
  });
  const bIso = h('button', { type: 'button', class: 'iso', title: 'Isométrica' }, 'Iso');
  bIso.addEventListener('click', () => irVista('iso'));
  el.append(bIso);
  const S = new THREE.Matrix4().makeScale(1, -1, 1), M = new THREE.Matrix4();
  const actualizar = () => {
    if (!api) return;
    // la cámara ve el mundo con R⁻¹; en CSS el eje y va hacia abajo: S · R⁻¹ · S
    M.makeRotationFromQuaternion(api.orientacion()).invert().premultiply(S).multiply(S);
    cubo.style.transform = `matrix3d(${M.elements.map(x => x.toFixed(5)).join(',')})`;
  };
  return { el, actualizar };
}
function irVista(v: Vista3D) {
  cfg.vista = v;
  if (v !== 'libre') cfg.proyeccion = 'paralela';
  cambio();
  api?.encuadrar();
}

export function centroVisor(c: H) {
  if (!caja) {
    caja = h('div', { class: 'vista3d grande visor3d' });
    const v = caja;
    const cubo = cuboNavegacion();
    requestAnimationFrame(() => {
      void import('./vista3d').then(m => {
        api = (m.montar3D(v, { deformada: () => false, roto: () => null, etiquetas: false, presentacion: () => cfg }) as Api | undefined) ?? null;
        if (!api) return;
        v.append(cubo.el);
        api.alCambiarCamara(cubo.actualizar);
        cubo.actualizar();
      });
    });
    // tocar (sin arrastrar) elige el muro; tocar el fondo suelta la elección
    let ini: { x: number; y: number; id: number } | null = null;
    v.addEventListener('pointerdown', e => { ini = (e.target as Element).closest('.cubo-nav') || e.button !== 0 ? null : { x: e.clientX, y: e.clientY, id: e.pointerId }; });
    v.addEventListener('pointerup', e => {
      const a = ini; ini = null;
      if (!a || a.id !== e.pointerId || Math.hypot(e.clientX - a.x, e.clientY - a.y) > 6 || !api) return;
      const r = api.elegirEn(e.clientX, e.clientY);
      // con pisos separados, la altura tocada se lleva a la de la torre junta
      nivelTocado = r ? (r.nivel ?? alturaReal(r.punto.y)) : null;
      estado.elegir(r?.muro ?? null);
      pintarInfoMuro();
    });
    v.addEventListener('pointercancel', () => { ini = null; });
  }
  if (!oyendoSeleccion) { oyendoSeleccion = true; estado.suscribirSeleccion(() => pintarInfoMuro()); }
  c.append(caja);
}
/** la altura en la torre junta de un punto de la torre con los pisos separados */
function alturaReal(y: number): number {
  if (!(cfg.separar > 0)) return y;
  const cotas = [...new Set(estado.proyecto.niveles.map(n => n.cota))].sort((a, b) => a - b);
  let z = cotas[0] ?? y;
  for (const c of cotas) { const d = desplazamientoPiso(cotas, cfg.separar, c); if (c + d <= y + 1e-6) z = y - d; }
  return z;
}
