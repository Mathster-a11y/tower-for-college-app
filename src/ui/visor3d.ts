/**
 * Etapa «Vista 3D» (al final del riel, debajo de Exoesqueleto): la torre en grande con estilos de dibujo (sombreado,
 * transparente, alambre, texturado, render y render parcial), cámaras (perspectiva o paralela; isométrica, dimétrica,
 * trimétrica, planta, frente, contrafrente y laterales), cortes en planta y en alzado con el relleno de lo cortado, y la
 * imagen para guardar. No cambia el proyecto ni el cálculo.
 */
import { estado, fmt } from './estado';
import { h, hacerPlegable, type H } from './comp';
import { PRESENTACION_INICIAL, type Estilo3D, type Presentacion3D, type Vista3D } from './presentacion3d';

const CLAVE = 'torre3d.visor3d';
const cfg: Presentacion3D = (() => {
  try { const g = JSON.parse(localStorage.getItem(CLAVE) ?? 'null'); if (g) return { ...PRESENTACION_INICIAL, ...g, corte: { ...PRESENTACION_INICIAL.corte, ...g.corte }, parcial: { ...PRESENTACION_INICIAL.parcial, ...g.parcial } }; } catch { /* sin almacenamiento */ }
  return structuredClone(PRESENTACION_INICIAL);
})();
const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(cfg)); } catch { /* sin almacenamiento */ } };

let caja: H | null = null;
let api: { construir: () => void; encuadrar: () => void } | null = null;
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

  c.append(estilo.el, camara.el, corte.el, imagen.el);
}

export function centroVisor(c: H) {
  if (!caja) {
    caja = h('div', { class: 'vista3d grande visor3d' });
    const v = caja;
    requestAnimationFrame(() => {
      void import('./vista3d').then(m => { api = m.montar3D(v, { deformada: () => false, roto: () => null, etiquetas: false, presentacion: () => cfg }) ?? null; });
    });
  }
  c.append(caja);
}
