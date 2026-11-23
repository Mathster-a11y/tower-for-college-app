/** Editor de la planta de PB en SVG: grilla, contorno, ejes, muros coloreados por su papel; arrastrar para mover. */
import { problemaAbertura, ubicarAbertura, type Abertura } from '../engine/aberturas';
import { claveJunta, conEspesor, detectarJuntas, ejeDeMuro, huellasLimpias, lineaReferencia, quienPasa } from '../engine/juntas';
import { avisar, confirmar, pedirTexto } from './tarjeta';
import { estado, COLORES } from './estado';
import { cajaMuro, dInterior, huecoEn, huella, presenteEn, rectangulos, tipoDe, type HuecoLosa, type Muro } from '../engine/modelo';
import { agrupar, armarPiezas, calarMuro, cerrarVano, fijarPasoGrilla, imanarNodo, inferir, muroDesdeTramo, nodosMuro, tuboEnTabiques, type GuiaInferencia, type Punto } from '../engine/dibujo';
import { esCirc, partes, PARTES, piezaTipo, problemaMedidas, rehacerPieza, TIPOS, type MedidasPieza, type TipoPieza } from '../engine/piezasTipo';
import { aMetros, contornoDesdeCAD, factorUnidad, imanCAD, leerDXFCompleto, murosDesdeCAD, nodosCAD, type Entidad } from '../engine/cad';
import { carpinteriaDeNivel } from '../engine/silueta';
import { esquinasEnNiveles, psiRedondeo } from '../engine/esquinas';
import { bandasFachada, calcularPaneleria, NOMBRE_MODO, tramoEn, tramosCarpinteria, type ModoCarpinteria, type TramoCarpinteria } from '../engine/carpinteria';
import { aplicarPerfil, nivelBase, PERFILES, valorPerfil, type PerfilTorre } from '../engine/perfil_torre';
import { montarCorte } from './corteTorre';
import { avisosDiseno, rangoNiveles, type AvisoDiseno } from '../engine/avisos';
import { antihorario, FORMAS_LOSA, formaLosa, ladosLosa, salienteEnLado, seCruza, type FormaLosa, type MedidasLosa } from '../engine/losas';
import { prepararSecciones } from '../engine/loft';
import { loftDeNivel, nivelesDeLoft, nuevoIdLoft, problemaLoft, type Loft } from '../engine/loft';
import type { TipoEsquina } from '../engine/contorno';
import { Jreal } from '../engine/mapping';
import { areasInfluencia, cuatroColores, vecindades, type AreasInfluencia } from '../engine/areas';
import { montarColocar, type ApiPlanta } from './colocar';
import { enPlanta, polilinea, ponerPerfil } from '../engine/perfil';
import { imanDeGuias, montarGuias, opGuias } from './guias';
import { crucesSobre } from '../engine/guias';
import { montarEditorContorno } from './editorContorno';
import { hacerMovible, hacerRedimensionable } from './flotantes';
import { borrarGrupo, copiarNodo, espejarNodo, girarNodo, hacerComponente, hacerUnico } from '../engine/grupos';
import { abrirMenuContextual, type EntradaMenu } from './menuContextual';
import { NOMBRE_CLASE, type ClasePieza } from '../engine/modelo';
import { agruparNodos, ancestros, borrarMuros, grupoCerrado, motivoNoEditable, muroFijo, desagruparVarios, hijosGrupo, subgrupos, dentroDe, grupoPorId, muroBloqueado, muroOculto, murosDe, nodoAlTocar } from '../engine/grupos';
import { ajustarContorno, areaSilueta, cajaSilueta, leerDXF, plantaDeNivel, puntosSilueta, type Vertice } from '../engine/silueta';

/** «rótulo <b>valor</b> unidad» con nodos de texto */
function datoPieza(rotulo: string, valor: string, unidad: string): HTMLSpanElement {
  const s = document.createElement('span'), b = document.createElement('b');
  b.textContent = valor; s.append(rotulo, b, unidad);
  return s;
}

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, txt?: string) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));
  if (txt !== undefined) e.textContent = txt;
  return e;
};

export function montarPlanta(cont: HTMLElement) {
  const svg = el('svg', { class: 'planta', role: 'img', 'aria-label': 'Planta con los muros del contraviento' });
  cont.appendChild(svg);
  // elección del nivel cuya planta se muestra
  const rotulo = cont.querySelector('.rotulo') as HTMLElement | null;
  const selNivel = document.createElement('select');
  selNivel.className = 'sel-nivel';
  selNivel.setAttribute('aria-label', 'Planta del nivel');
  selNivel.title = 'Planta del nivel: los muros que no están en ese nivel se ven en gris claro';
  selNivel.addEventListener('change', () => { estado.nivelPlanta = selNivel.value === '' ? null : Number(selNivel.value); dibujar(); estado.avisarSeleccion(); });
  cont.appendChild(selNivel);
  // leyenda de colores (los de la planilla)
  const ley = document.createElement('div');
  ley.className = 'leyenda leyenda-planta';
  ([['alma', 'alma (izq.)'], ['alma der.', 'alma der.'], ['ala sup.', 'ala sup.'], ['ala inf.', 'ala inf.'], ['tubo', 'tubo'], ['perfil', 'perfil'], ['columna', 'columna (circular o de pórtico)'], ['fuera del cálculo', 'fuera del cálculo']] as const).forEach(([k, t]) => {
    const sp = document.createElement('span'); const i = document.createElement('i'); i.className = 'caja'; i.style.background = COLORES[k]; sp.append(i, t); ley.append(sp);
  });
  cont.appendChild(ley);
  // barra del grupo que se está editando
  const barraCtx = document.createElement('div'); barraCtx.className = 'barra-ctx'; barraCtx.hidden = true;
  const salirCtx = document.createElement('button'); salirCtx.type = 'button'; salirCtx.textContent = 'Salir del grupo'; salirCtx.title = 'Volver al nivel de arriba (también: Esc)';
  salirCtx.addEventListener('click', () => salirDeGrupo());
  const desagCtx = document.createElement('button'); desagCtx.type = 'button'; desagCtx.textContent = 'Desagrupar este'; desagCtx.title = 'Deshace el grupo que se está editando: su contenido queda suelto y elegido';
  desagCtx.addEventListener('click', () => { if (estado.contexto) desagruparElegidos([estado.contexto]); });
  cont.appendChild(barraCtx);
  // barra de lo elegido (lazo o Mayúsculas + clic)
  const barraSel = document.createElement('div'); barraSel.className = 'barra-sel'; barraSel.hidden = true;
  const cuentaSel = document.createElement('span');
  const bSel = (t: string, titulo: string, f: () => void, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.title = titulo; if (cls) b.className = cls; b.addEventListener('click', f); return b; };
  // lista de lo elegido: cada uno con ✕ para sacarlo del conjunto (sin teclado: lápiz o dedo)
  const listaSel = document.createElement('div'); listaSel.className = 'lista-sel'; listaSel.hidden = true;
  const bLista = document.createElement('button'); bLista.type = 'button'; bLista.className = 'b-lista-sel'; bLista.title = 'Ver lo elegido y sacar uno (también: Mayúsculas + clic sobre el muro)'; bLista.textContent = '▾';
  bLista.addEventListener('click', () => { listaSel.hidden = !listaSel.hidden; armarListaSel(); });
  const armarListaSel = () => {
    listaSel.textContent = '';
    if (listaSel.hidden) return;
    const p = estado.proyecto;
    const item = (txt: string, sacar: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip-sel'; b.title = `Sacar ${txt} de la selección`; b.textContent = `${txt} ✕`; b.addEventListener('click', () => { sacar(); mensaje(`${txt} fuera de la selección.`); estado.avisarPanel(); }); return b; };
    estado.multi.g.forEach(g => listaSel.append(item(`«${grupoPorId(p, g)?.nombre ?? g}»`, () => { estado.multi.g = estado.multi.g.filter(x => x !== g); })));
    estado.multi.m.forEach(id => listaSel.append(item(id, () => { estado.multi.m = estado.multi.m.filter(x => x !== id); if (estado.seleccion === id) estado.seleccion = estado.multi.m[0] ?? null; })));
  };
  /** deshace los grupos y deja elegido lo que tenían adentro (para seguir editándolo); «todo» suelta también los de adentro */
  const desagruparElegidos = (gids: string[], todo = false) => {
    const p0 = estado.proyecto;
    gids = gids.filter(id => grupoPorId(p0, id));
    if (!gids.length) { mensaje('Elegí un grupo para desagrupar.'); return; }
    const sueltos = { m: [] as string[], g: [] as string[] };
    gids.forEach(id => {
      if (todo) sueltos.m.push(...murosDe(p0, id).map(m => m.id));
      else { sueltos.m.push(...p0.muros.filter(m => m.gd === id).map(m => m.id)); sueltos.g.push(...hijosGrupo(p0, id).map(h => h.id)); }
    });
    const nombres = gids.map(id => `«${grupoPorId(p0, id)?.nombre}»`).join(', ');
    let r = { hechos: 0, error: null as string | null };
    estado.cambiar(pp => { r = desagruparVarios(pp, gids, todo); });
    if (r.hechos) {
      const p = estado.proyecto;
      estado.multi = { m: sueltos.m.filter(id => p.muros.some(x => x.id === id)), g: sueltos.g.filter(id => grupoPorId(p, id)) };
      if (gids.includes(estado.contexto ?? '')) estado.contexto = null;
      estado.grupoSel = null;
    }
    mensaje(r.hechos ? `${r.hechos > 1 ? 'Grupos deshechos' : 'Grupo deshecho'}: ${nombres}. Lo que tenían queda elegido. Ctrl+Z deshace.${r.error ? ` (${r.error})` : ''}` : r.error ?? 'No se pudo desagrupar.');
    estado.avisarPanel();
  };
  const bDesagSel = bSel('Desagrupar', 'Deshace los grupos elegidos; sus muros quedan sueltos y elegidos (Ctrl+Mayús+G)', () => desagruparElegidos(estado.multi.g));
  // sacar del cálculo (o volver): las piezas de lo elegido dejan de ir a la hoja J en los dos vientos (clasesPieza.enJ)
  const piezasElegidas = (deGrupo: boolean) => {
    const p = estado.proyecto, ids = new Set<string>();
    if (deGrupo) { if (estado.grupoSel) murosDe(p, estado.grupoSel).forEach(m => ids.add(m.id)); }
    else { estado.multi.m.forEach(id => ids.add(id)); estado.multi.g.forEach(g => murosDe(p, g).forEach(m => ids.add(m.id))); }
    const s = new Set<string>();
    ids.forEach(id => { const m = p.muros.find(x => x.id === id); if (m?.piezaA) s.add(m.piezaA); if (m?.piezaB) s.add(m.piezaB); });
    return [...s];
  };
  const alternarCalculo = (deGrupo: boolean) => {
    const nombres = piezasElegidas(deGrupo);
    if (!nombres.length) { mensaje('Lo elegido no tiene pieza en ningún viento (Diseño → Muros): no entra al cálculo.'); return; }
    const cs = estado.proyecto.clasesPieza ?? {}, adentro = nombres.every(n => cs[n]?.enJ !== false);
    estado.cambiar(pp => {
      const t = (pp.clasesPieza ??= {});
      nombres.forEach(n => { const c0 = { ...(t[n] ?? {}) }; c0.enJ = adentro ? false : null; if ((!c0.clase || c0.clase === 'auto') && c0.enJ !== false) delete t[n]; else t[n] = c0; });
      if (!Object.keys(t).length) delete pp.clasesPieza;
    });
    mensaje(`${nombres.join(', ')}: ${adentro ? 'fuera del cálculo (no van a la hoja J en ningún viento; quedan en gris). Ctrl+Z deshace.' : 'vuelven al cálculo.'}`);
    estado.avisarPanel();
  };
  const tituloFuera = 'Saca del cálculo las piezas de lo elegido: no van a la hoja J en ningún viento y quedan en gris en la planta. Tocá de nuevo para que vuelvan.';
  const bFueraSel = bSel('Sacar del cálculo', tituloFuera, () => alternarCalculo(false));
  const bFueraGrupo = bSel('Sacar del cálculo', tituloFuera, () => alternarCalculo(true));
  const ponerBotonFuera = (b: HTMLButtonElement, deGrupo: boolean) => {
    const ns = piezasElegidas(deGrupo), cs = estado.proyecto.clasesPieza ?? {};
    b.disabled = !ns.length;
    b.textContent = ns.length && ns.every(n => cs[n]?.enJ === false) ? 'Volver al cálculo' : 'Sacar del cálculo';
  };
  barraSel.append(cuentaSel, bLista, bFueraSel,
    bSel('Borrar', 'Borra lo elegido (Supr). Ctrl+Z deshace.', () => borrarElegidos(), 'peligro'),
    bSel('Agrupar', 'Junta lo elegido en un grupo (Ctrl+G)', () => agruparElegidos()),
    bDesagSel,
    bSel('Soltar', 'Vacía la selección (Esc)', () => { estado.multi = { m: [], g: [] }; estado.avisarPanel(); }));
  barraSel.append(listaSel);
  cont.appendChild(barraSel);
  // barra del grupo elegido: el grupo es un elemento cerrado; se copia, gira y espeja entero
  const barraGrupo = document.createElement('div'); barraGrupo.className = 'barra-sel barra-grupo'; barraGrupo.hidden = true;
  const nombreGrupo = document.createElement('span');
  const conGrupo = (f: (p: import('../engine/modelo').Proyecto, id: string) => string | null | void, ok: string) => {
    const id = estado.grupoSel; if (!id) return;
    let err: string | null | void = null;
    estado.cambiar(pp => { err = f(pp, id); }); estado.limpiarGrupos();
    mensaje(err || estado.avisoGrupos || ok); estado.avisarPanel();
  };
  const duplicarGrupo = (vinculada: boolean) => {
    const id = estado.grupoSel; if (!id) return;
    const ms = murosDe(estado.proyecto, id), x0 = Math.min(...ms.map(m => cajaMuro(m).x0)), x1 = Math.max(...ms.map(m => cajaMuro(m).x1));
    const r: { v: { id: string } | { error: string } | null } = { v: null };
    estado.cambiar(pp => { r.v = copiarNodo(pp, id, +(x1 - x0 + 1).toFixed(2), 0, vinculada); });
    if (r.v && 'id' in r.v) { estado.grupoSel = r.v.id; mensaje(`${vinculada ? 'Copia vinculada' : 'Copia'} de «${grupoPorId(estado.proyecto, id)?.nombre}» a la derecha: arrastrala a su lugar.`); } else if (r.v) mensaje(r.v.error);
    estado.avisarPanel();
  };
  const bDesagTodo = bSel('Desagrupar todo', 'Deshace el grupo y los grupos que tiene adentro: todos sus muros quedan sueltos', () => { if (estado.grupoSel) desagruparElegidos([estado.grupoSel], true); });
  barraGrupo.append(nombreGrupo,
    bSel('Entrar', 'Editar sus elementos (doble clic)', () => { const id = estado.grupoSel; if (!id) return; estado.contexto = id; estado.grupoSel = null; mensaje(`Editando «${grupoPorId(estado.proyecto, id)?.nombre}»: Esc para salir.`); estado.avisarPanel(); }),
    bSel('Desagrupar', 'Deshace el grupo: lo que tiene queda suelto y elegido (Ctrl+Mayús+G)', () => { if (estado.grupoSel) desagruparElegidos([estado.grupoSel]); }),
    bDesagTodo,
    bSel('Duplicar', 'Copia independiente del grupo entero', () => duplicarGrupo(false)),
    bSel('Copia vinculada', 'Otra copia del mismo componente: si se edita una, cambian todas', () => duplicarGrupo(true)),
    bSel('↺ 90°', 'Girar el grupo 90° (antihorario) alrededor del centro de su caja', () => conGrupo((pp, id) => { girarNodo(pp, id); }, 'Grupo girado 90°.')),
    bSel('⇋', 'Espejar con un eje vertical por el centro de su caja', () => conGrupo((pp, id) => { espejarNodo(pp, id, 'x'); }, 'Grupo espejado.')),
    bSel('⇵', 'Espejar con un eje horizontal por el centro de su caja', () => conGrupo((pp, id) => { espejarNodo(pp, id, 'y'); }, 'Grupo espejado.')),
    bFueraGrupo,
    bSel('Borrar', 'Borra el grupo con todo lo que tiene (Supr)', () => { conGrupo((pp, id) => borrarGrupo(pp, id), 'Grupo borrado. Ctrl+Z deshace.'); estado.grupoSel = null; estado.avisarPanel(); }, 'peligro'));
  cont.appendChild(barraGrupo);
  // opciones del lazo
  /** dibujo de muros: ortogonal (lo normal) o en cualquier ángulo (F8 o el botón «Orto»); los diagonales son perfiles */
  let orto = true;
  /** línea de referencia del muro que se dibuja: el muro a la izquierda de la línea, centrado o a la derecha */
  let refDib: 'izq' | 'eje' | 'der' = (() => { try { const v = localStorage.getItem('torre3d.refDib'); return v === 'izq' || v === 'der' ? v : 'eje'; } catch { return 'eje'; } })();
  /** corrimiento del centro del muro respecto de la línea dibujada a→b (el cuerpo queda del lado elegido) */
  const corrimientoRef = (a: Punto, b: Punto, e: number): Punto => {
    if (refDib === 'eje') return { x: 0, y: 0 };
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L, k = (refDib === 'izq' ? 1 : -1) * e / 2;
    return { x: nx * k, y: ny * k };
  };
  /** lado de la referencia de un muro ya armado (para guardarla): de qué lado de su eje quedó la línea dibujada */
  const ladoRef = (m: Muro, linea: [Punto, Punto]): 1 | -1 | null => {
    if (refDib === 'eje') return null;
    const E = ejeDeMuro(m); if (!E) return null;
    const mx = (linea[0].x + linea[1].x) / 2 - (E.a.x + E.b.x) / 2, my = (linea[0].y + linea[1].y) / 2 - (E.a.y + E.b.y) / 2;
    const d = mx * E.n.x + my * E.n.y;
    return Math.abs(d) < 1e-6 ? null : d > 0 ? 1 : -1;
  };
  const opLazo = { forma: 'libre' as 'libre' | 'rect', criterio: 'auto' as 'auto' | 'centro' | 'entero' | 'tocando' };
  const barraLazo = document.createElement('div'); barraLazo.className = 'barra-lazo'; barraLazo.hidden = true;
  const segL = (etq: string, ops: [string, string, string][], get: () => string, set: (v: string) => void) => {
    const w = document.createElement('span'); w.className = 'seg chico'; w.setAttribute('role', 'group'); w.setAttribute('aria-label', etq);
    const pintar = () => w.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === get())));
    ops.forEach(([v, t, tit]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.title = tit; b.dataset.v = v; b.addEventListener('click', () => { set(v); pintar(); }); w.append(b); });
    pintar(); return w;
  };
  barraLazo.append(
    segL('Forma', [['libre', 'Libre', 'Dibujá la forma a mano'], ['rect', 'Rectángulo', 'Arrastrá en diagonal']], () => opLazo.forma, v => { opLazo.forma = v as 'libre' | 'rect'; }),
    segL('Elige', [['auto', 'Auto', 'Libre: centro adentro · Rectángulo: de izquierda a derecha, entero adentro; de derecha a izquierda, tocando'], ['centro', 'Centro', 'Entra el muro con el centro adentro'], ['entero', 'Entero', 'Entra solo el muro entero adentro'], ['tocando', 'Tocando', 'Entra todo lo que toca el lazo']], () => opLazo.criterio, v => { opLazo.criterio = v as typeof opLazo.criterio; }));
  cont.appendChild(barraLazo);
  // opciones de «Dibujar»: espesor y ortogonal
  const barraDib = document.createElement('div'); barraDib.className = 'barra-lazo barra-dib'; barraDib.hidden = true;
  const bOrto = document.createElement('button'); bOrto.type = 'button'; bOrto.title = 'Ortogonal (F8): los muros salen en x o en y. Apagado, en cualquier ángulo (de a 15° con la grilla): quedan como perfiles en diagonal.';
  const pintarOrto = () => { bOrto.textContent = orto ? '⟂ Orto' : '∠ Libre'; bOrto.setAttribute('aria-pressed', String(orto)); };
  bOrto.addEventListener('click', () => { orto = !orto; pintarOrto(); pedirDibujo(); });
  pintarOrto();
  const lEsp = document.createElement('label'); lEsp.className = 'col-campo'; lEsp.append('espesor ');
  const iEsp = document.createElement('input'); iEsp.type = 'text'; iEsp.inputMode = 'decimal'; iEsp.style.width = '48px';
  iEsp.addEventListener('change', () => { const v = Number(iEsp.value.replace(',', '.')); if (v > 0 && v < 5) ultimoEspesor = v; iEsp.value = String(ultimoEspesor).replace('.', ','); });
  lEsp.append(iEsp, ' m');
  const sOrto = document.createElement('span'); sOrto.className = 'seg chico'; sOrto.append(bOrto);
  // línea de referencia (como ArchiCAD): la línea que se dibuja es una cara o el eje del muro; R la cambia
  const segRef = segL('Línea de referencia', [
    ['izq', '◧ cara', 'La línea que dibujás es la cara derecha del muro: el muro queda a la izquierda (mirando hacia donde dibujás). Así se dibuja una planta por su borde exterior.'],
    ['eje', '▭ eje', 'La línea que dibujás es el eje del muro (centrado).'],
    ['der', 'cara ◨', 'La línea que dibujás es la cara izquierda del muro: el muro queda a la derecha.'],
  ], () => refDib, v => { refDib = v as typeof refDib; try { localStorage.setItem('torre3d.refDib', refDib); } catch { /* sin almacenamiento */ } pedirDibujo(); });
  segRef.title = 'Línea de referencia (R): cara, eje o la otra cara. Los muros se enganchan por esa línea y, si cambiás el espesor, esa cara queda quieta.';
  barraDib.append(sOrto, segRef, lEsp);
  cont.appendChild(barraDib);
  document.addEventListener('keydown', ev => { if ((ev.key === 'r' || ev.key === 'R') && modo === 'dibujar' && !ev.ctrlKey && !ev.metaKey && !(ev.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) { ev.preventDefault(); refDib = refDib === 'izq' ? 'eje' : refDib === 'eje' ? 'der' : 'izq'; segRef.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === refDib))); mensaje(refDib === 'eje' ? 'Línea de referencia: el eje del muro.' : `Línea de referencia: una cara; el muro queda a la ${refDib === 'izq' ? 'izquierda' : 'derecha'} de la línea que dibujás.`); pedirDibujo(); } });
  document.addEventListener('keydown', ev => { if (ev.key === 'F8' && modo === 'dibujar') { ev.preventDefault(); orto = !orto; pintarOrto(); mensaje(orto ? 'Ortogonal: los muros salen en x o en y.' : 'Libre: los muros pueden ir en diagonal (de a 15° con la grilla); quedan como perfiles.'); pedirDibujo(); } });
  /** elige los muros iguales al elegido (mismo tipo, largo y espesor), sueltos en el grupo que se edita */
  const elegirIguales = () => {
    const p = estado.proyecto;
    const ref = p.muros.find(x => x.id === (estado.multi.m[0] ?? estado.seleccion));
    if (!ref) { mensaje('Elegí un muro y apretá «Iguales»: se eligen todos los que tienen el mismo tipo, largo y espesor.'); return; }
    const igual = (m: Muro) => tipoDe(m) === tipoDe(ref) && Math.abs(m.largo - ref.largo) < 0.005 && Math.abs(m.espesor - ref.espesor) < 0.005 && Math.abs((m.ladoY ?? 0) - (ref.ladoY ?? 0)) < 0.005;
    const ms = p.muros.filter(m => igual(m) && !muroOculto(p, m) && !muroBloqueado(p, m) && nodoAlTocar(p, m, estado.contexto)?.t === 'm').map(m => m.id);
    estado.multi = { m: ms, g: [] }; estado.grupoSel = null;
    mensaje(`${ms.length} muros iguales a ${ref.id} (${tipoDe(ref)} ${fmtN(ref.largo)} × ${fmtN(ref.espesor)} m).`);
    estado.avisarPanel();
  };
  const fmtN = (v: number) => v.toFixed(2).replace('.', ',');
  document.addEventListener('torre:elegir-iguales', elegirIguales);
  barraSel.insertBefore(bSel('Iguales', 'Elige todos los muros con el mismo tipo, largo y espesor', elegirIguales), barraSel.lastChild);
  /** junta lo elegido (o el elemento elegido) en un grupo nuevo, dentro del grupo que se está editando */
  function agruparElegidos() {
    const p = estado.proyecto;
    const ms = [...estado.multi.m], gs = [...estado.multi.g];
    if (!ms.length && !gs.length) { const m = p.muros.find(x => x.id === estado.seleccion); const n = m && nodoAlTocar(p, m, estado.contexto); if (n) (n.t === 'g' ? gs : ms).push(n.id); else if (estado.grupoSel) gs.push(estado.grupoSel); }
    const res: { r: { id: string } | { error: string } } = { r: { error: 'Elegí muros o grupos (Mayúsculas + clic o el lazo) para agrupar.' } };
    if (ms.length || gs.length) estado.cambiar(pp => { res.r = agruparNodos(pp, ms, gs, estado.contexto); });
    const r = res.r;
    if ('error' in r) mensaje(r.error); else { estado.grupoSel = r.id; estado.multi = { m: [], g: [] }; mensaje(`Grupo nuevo: «${grupoPorId(estado.proyecto, r.id)?.nombre}». Doble clic para entrar a editarlo.`); estado.avisarPanel(); }
  }
  const salirDeGrupo = () => { const g = grupoPorId(estado.proyecto, estado.contexto); estado.grupoSel = g?.id ?? null; estado.contexto = g?.padre ?? null; mensaje(estado.contexto ? `Editando «${grupoPorId(estado.proyecto, estado.contexto)?.nombre}».` : 'De vuelta en la planta.'); estado.avisarPanel(); };
  document.addEventListener('keydown', ev => {
    if ((modo !== 'mover' && modo !== 'lazo') || (ev.target as HTMLElement).closest?.('input, textarea, select, [contenteditable], .grilla-caja')) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); borrarElegidos(); return; }
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'a' || ev.key === 'A')) {
      ev.preventDefault();
      const p = estado.proyecto, zN = nivelActualZ(), ms = new Set<string>(), gs = new Set<string>();
      p.muros.forEach(m => { if (muroOculto(p, m) || muroBloqueado(p, m) || !zN(m)) return; const n = nodoAlTocar(p, m, estado.contexto); if (n) (n.t === 'm' ? ms : gs).add(n.id); });
      estado.multi = { m: [...ms], g: [...gs] }; estado.grupoSel = null;
      mensaje(`Todo elegido: ${ms.size + gs.size} elementos.`); estado.avisarPanel(); return;
    }
    if (ev.key === 'Escape') {
      if (lazo) { lazo = null; dibujar(); return; }
      if (estado.multi.m.length || estado.multi.g.length) { estado.multi = { m: [], g: [] }; estado.seleccion = null; estado.avisarPanel(); return; }
      if (estado.contexto) { salirDeGrupo(); return; }
      if (estado.grupoSel || estado.seleccion) { estado.grupoSel = null; estado.seleccion = null; estado.avisarPanel(); dibujar(); }
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'g' || ev.key === 'G')) {
      ev.preventDefault();
      const p = estado.proyecto;
      if (ev.shiftKey) {
        // lo elegido: los grupos de la selección, el grupo elegido, el del muro tocado o, adentro de uno, el que se edita
        const m = p.muros.find(x => x.id === estado.seleccion), n = m && nodoAlTocar(p, m, estado.contexto);
        const gs = estado.multi.g.length ? estado.multi.g : estado.grupoSel ? [estado.grupoSel] : n?.t === 'g' ? [n.id] : estado.contexto ? [estado.contexto] : [];
        desagruparElegidos(gs); return;
      }
      void p; agruparElegidos();
    }
  });
  // herramientas: mover (arrastrar muros) o dibujar (dos clics por muro, encadenados; Esc termina)
  let modo: 'mover' | 'dibujar' | 'calibrar' | 'silueta' | 'insertar' | 'calar' | 'lazo' | 'colocar' = 'mover';
  // pieza tipo a insertar (biblioteca)
  let insTipo: TipoPieza = 'C';
  const insMed: MedidasPieza = { h: 4, b: 2, e: 0.2, giro: 0 };
  let iNivel = 0;
  let arrastreV: number | null = null;
  /** vértice del contorno elegido (para escribir sus coordenadas o borrarlo desde el panel) */
  let vSel: number | null = null;
  /** en el modo «Silueta»: se edita el contorno de la losa (false) o el de la carpintería (true) */
  let editaCarp = false;
  /** lo elegido en «Esquinas de la torre» (vive mientras la página está abierta) */
  /** loft de losas en armado: la otra losa (cota), las intermedias que también mandan, tipo, giro y si escribe B y L */
  /** losa desde cero: forma y medidas elegidas, lado para salientes, y el contorno que se dibuja a mano (null: no se dibuja) */
  const dc = { abierto: null as boolean | null, forma: 'rect' as FormaLosa, med: { ...FORMAS_LOSA.rect.def } as MedidasLosa, bl: true, lado: 0, ancho: 4, prof: 1.5, centro: null as number | null, orto: true,
    /** qué se muestra en fantasma sobre la planta antes de aplicarlo (null: nada) */
    previa: null as 'forma' | 'sacar' | 'meter' | null };
  let trazo: Punto[] | null = null, trazoCursor: Punto | null = null;
  /** perfil de la torre: la sección abierta y el punto elegido */
  let pfAbierto = false, pfSel: number | null = null;
  const lft = { abierto: false, otra: null as number | null, medias: [] as number[], tipo: 'recto' as 'recto' | 'suave', giro: 0, bl: true };
  const esq = { abierto: false, tipo: 'redondeada' as TipoEsquina, a: 2, b: 2, que: 'ambas' as 'ambas' | 'losa' | 'carpinteria', todos: true };
  let calib: Punto[] = [];
  let inicio: Punto | null = null, cursor: Punto | null = null, iman = '';
  const barra = document.createElement('div');
  barra.className = 'herr-planta seg chico';
  barra.setAttribute('role', 'group');
  barra.setAttribute('aria-label', 'Herramienta');
  const bMover = document.createElement('button'), bDibujar = document.createElement('button'), bArmar = document.createElement('button');
  bMover.type = bDibujar.type = bArmar.type = 'button';
  bMover.textContent = 'Mover'; bDibujar.textContent = 'Dibujar'; bArmar.textContent = 'Armar';
  bMover.title = 'Arrastrar un muro para moverlo (flechas: 5 cm; con Mayúsculas: 1 m)';
  bDibujar.title = 'Clic en el inicio y clic en el fin: el muro sale horizontal o vertical y se pega a los extremos de otros muros. Sigue encadenado; Esc o doble clic termina. Después del primer punto se puede escribir el largo y Enter.';
  bArmar.title = 'Los muros que se tocan forman una pieza (T1, T2… en el viento A y T1B, T2B… en el B); el ala queda pegada a su alma.';
  let refrescarBarraTr = () => { /* se completa cuando está la barra de transformaciones */ };
  /**
   * indicación de la herramienta activa: qué hacer ahora, en una línea sobre la leyenda (en una tablet no hay globos de
   * ayuda al pasar el mouse). Se puede ocultar (✕) y volver a prender con «?» en la barra.
   */
  const indic = document.createElement('div'); indic.className = 'indicacion-planta'; indic.setAttribute('role', 'status');
  const indicTxt = document.createElement('span'), indicX = document.createElement('button');
  indicX.type = 'button'; indicX.textContent = '✕'; indicX.title = 'Ocultar las indicaciones (se vuelven a prender con «?» en la barra de herramientas)'; indicX.setAttribute('aria-label', 'Ocultar las indicaciones');
  indic.append(indicTxt, indicX);
  let conIndic = (() => { try { return localStorage.getItem('torre3d.indicaciones') !== '0'; } catch { return true; } })();
  const INDIC: Record<'mover' | 'dibujar' | 'calibrar' | 'silueta' | 'insertar' | 'calar' | 'lazo' | 'colocar', string> = {
    mover: 'Mover: tocá un muro para elegirlo y arrastralo (flechas: 5 cm). Arrastrá el fondo para correr la vista; rueda o pellizco para el zoom; Mayúsculas + arrastrar elige varios.',
    lazo: 'Lazo: dibujá un lazo alrededor de lo que querés elegir (entra todo muro con el centro adentro). Mayúsculas suma, Alt saca, Supr borra lo elegido.',
    dibujar: 'Dibujar muros: tocá el inicio y el fin; sale horizontal o vertical y se pega a otros muros. Sigue encadenado: escribí el largo y Enter, o Esc para terminar.',
    calibrar: 'Calibrar el calco: tocá dos puntos de la imagen y escribí la distancia real entre ellos.',
    silueta: 'Losa: arrastrá los vértices (□) de la losa o de la carpintería. En la carta: formas (con vista previa), dibujarla a mano, balcones, loft y herramientas de CAD. Esc sale.',
    insertar: 'Insertar: elegí la pieza y sus medidas en la carta y tocá la planta donde va (el centro de la pieza). Esc sale.',
    calar: 'Calar: tocá el muro donde va el vano (puerta, ventana o hueco). Tocá un vano hecho para moverlo o sacarlo. Esc sale.',
    colocar: 'Colocar: elegí un muro, un grupo o varios con el lazo y usá la carta (mover, copiar, girar, espejar, matriz).',
  };
  const INDIC_TRAZO = 'Dibujar la losa: tocá los vértices uno por uno (se pegan a la grilla; con «a 90°» o Mayúsculas salen horizontales o verticales). Tocá el primero o Enter para cerrar · Retroceso borra el último · Esc cancela.';
  const indicar = (t: string) => { indicTxt.textContent = t; indic.hidden = !conIndic || !t; };
  indicX.addEventListener('click', () => { conIndic = false; try { localStorage.setItem('torre3d.indicaciones', '0'); } catch { /* sin almacenamiento */ } indic.hidden = true; bIndic.setAttribute('aria-pressed', 'false'); });
  const bIndic = document.createElement('button'); bIndic.type = 'button'; bIndic.textContent = '?'; bIndic.className = 'b-indic';
  bIndic.title = 'Indicaciones: qué hacer con la herramienta elegida (una línea sobre la planta)'; bIndic.setAttribute('aria-label', 'Indicaciones de las herramientas');
  bIndic.addEventListener('click', () => { conIndic = !conIndic; try { localStorage.setItem('torre3d.indicaciones', conIndic ? '1' : '0'); } catch { /* sin almacenamiento */ } bIndic.setAttribute('aria-pressed', String(conIndic)); indicar(INDIC[modo]); });
  /**
   * avisos de diseño (tabique fuera de la losa, carpintería afuera, B × L distinto de la losa…): se recalculan cuando
   * cambia el proyecto (no en cada cuadro de un arrastre); botón con la cantidad y una carta con la lista
   */
  let avisos: AvisoDiseno[] = [], revAvisos = -1;
  const bAvisos = document.createElement('button'); bAvisos.type = 'button'; bAvisos.className = 'b-avisos';
  bAvisos.title = 'Avisos de diseño: lo que conviene revisar (tocá uno para ir al nivel y al muro)';
  const panelAv = document.createElement('div'); panelAv.className = 'calco-panel avisos-panel'; panelAv.hidden = true;
  let avAbierto = false;
  bAvisos.addEventListener('click', () => { avAbierto = !avAbierto; armarAvisos(); });
  function recalcularAvisos() {
    const rev = estado.revision ?? 0;
    if (rev === revAvisos) return;
    revAvisos = rev;
    try { avisos = avisosDiseno(estado.proyecto, estado.calculo?.asig?.papeles as Record<string, { A?: string; B?: string }> | undefined); } catch { avisos = []; }
    bAvisos.textContent = avisos.length ? `⚠ ${avisos.length}` : '✓';
    bAvisos.classList.toggle('hay', avisos.length > 0);
    bAvisos.setAttribute('aria-label', avisos.length ? `${avisos.length} avisos de diseño` : 'Sin avisos de diseño');
    if (avAbierto) armarAvisos();
  }
  function armarAvisos() {
    panelAv.hidden = !avAbierto; bAvisos.setAttribute('aria-pressed', String(avAbierto));
    if (!avAbierto) return;
    panelAv.replaceChildren();
    const t = document.createElement('b'); t.textContent = avisos.length ? `Avisos de diseño (${avisos.length})` : 'Avisos de diseño'; panelAv.append(t);
    if (!avisos.length) { const p0 = document.createElement('p'); p0.className = 'nota-losa'; p0.textContent = 'Nada para revisar: los tabiques apoyan en la losa, la carpintería está adentro y la planilla usa las medidas de la losa.'; panelAv.append(p0); }
    avisos.forEach(a => {
      const d = document.createElement('div'); d.className = 'aviso-item';
      const tx = document.createElement('span'); tx.textContent = a.texto;
      const ar = document.createElement('span'); ar.className = 'nota-losa'; ar.textContent = a.arreglo;
      d.append(tx, ar);
      if (a.muro || a.cotas.length) {
        const ver = document.createElement('button'); ver.type = 'button'; ver.textContent = 'Ver';
        ver.title = a.cotas.length ? `Ir ${rangoNiveles(estado.proyecto, a.cotas.slice(0, 1))}${a.muro ? ` y elegir ${a.muro}` : ''}` : `Elegir ${a.muro}`;
        ver.addEventListener('click', () => {
          if (a.cotas.length) { const z = [...a.cotas].sort((x, y) => y - x)[0]; const iPB = estado.proyecto.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1); estado.nivelPlanta = Math.abs((estado.proyecto.niveles[iPB]?.cota ?? 0) - z) < 1e-6 ? null : z; }
          if (a.muro) { estado.grupoSel = null; estado.seleccion = a.muro; estado.avisarPanel(); }
          dibujar();
        });
        d.append(ver);
      }
      panelAv.append(d);
    });
  }
  const ponerModo = (m: typeof modo) => { if (m !== 'mover' && m !== 'lazo' && m !== 'colocar') { col.cerrar(); gui.cerrar(); if (edc.activo()) edc.cerrar(); } modo = m; lazo = null; bLazo.setAttribute('aria-pressed', String(m === 'lazo')); svg.classList.toggle('con-lazo', m === 'lazo'); inicio = null; calib = []; bMover.setAttribute('aria-pressed', String(m === 'mover')); bDibujar.setAttribute('aria-pressed', String(m === 'dibujar')); bSil.setAttribute('aria-pressed', String(m === 'silueta')); svg.classList.toggle('dibujando', m === 'dibujar' || m === 'calibrar'); svg.classList.toggle('editando-silueta', m === 'silueta'); panelSil.hidden = m !== 'silueta'; bIns.setAttribute('aria-pressed', String(m === 'insertar')); panelIns.hidden = m !== 'insertar'; svg.classList.toggle('dibujando', m === 'dibujar' || m === 'calibrar' || m === 'insertar'); if (m === 'insertar') armarPanelIns(); bCalar.setAttribute('aria-pressed', String(m === 'calar')); panelCal.hidden = m !== 'calar'; svg.classList.toggle('calando', m === 'calar'); previaCalar = null; abSel = null; vanoSel = null; arrAb = null; if (m === 'calar') armarPanelCal(); dibujar(); refrescarBarraTr(); indicar(INDIC[m]); };
  bMover.addEventListener('click', () => ponerModo('mover'));
  bDibujar.addEventListener('click', () => ponerModo(modo === 'dibujar' ? 'mover' : 'dibujar'));
  bArmar.addEventListener('click', () => {
    estado.cambiar(() => { estado.proyecto.muros = armarPiezas(estado.proyecto.muros); });
    const ms = estado.proyecto.muros, nA = new Set(ms.map(m => m.piezaA).filter(Boolean)).size, nB = new Set(ms.map(m => m.piezaB).filter(Boolean)).size;
    const t = `Piezas armadas: ${nA} en el viento A y ${nB} en el viento B (los muros que se tocan forman una pieza; el ala queda pegada a su alma).`;
    mensaje(t); indicar(t);
  });
  // calcar un plano: imagen de fondo con escala (dos clics y la medida real), posición y transparencia
  const bCalco = document.createElement('label');
  bCalco.className = 'boton';
  bCalco.textContent = 'Importar…';
  bCalco.title = 'Plano de fondo para ubicar los elementos: DXF de AutoCAD (con capas e imán a los nodos), PDF o imagen (PNG, JPG).';
  const inCalco = document.createElement('input');
  inCalco.type = 'file'; inCalco.accept = '.dxf,.pdf,image/png,image/jpeg,image/*'; inCalco.hidden = true;
  bCalco.append(inCalco);
  inCalco.addEventListener('change', async () => {
    const f = inCalco.files?.[0]; if (!f) return;
    const ext = f.name.toLowerCase().split('.').pop();
    if (ext === 'dxf') { inCalco.value = ''; cargarDXF(f.name, await f.text()); return; }
    if (ext === 'pdf') { inCalco.value = ''; await cargarPDF(f); return; }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const p = estado.proyecto;
      const B = p.niveles.find(n => n.B)?.B ?? 20;
      estado.calco = { url, aspecto: img.naturalHeight / img.naturalWidth || 1, ancho: B * 1.2, x: 0, y: 0, opacidad: 0.5 };
      armarPanelCalco(); dibujar();
    };
    img.src = url;
    inCalco.value = '';
  });
  // ---- DXF de fondo: capas, uso de cada capa e imán a sus nodos
  const dock = document.createElement('div');
  dock.className = 'dock-planta';
  cont.appendChild(dock);
  // clic en el título de un panel: se pliega o se despliega
// (en todas las cartas, también las sueltas: un toque en el título las pliega y deja libre la planta)
  cont.addEventListener('click', ev => { const t = ev.target as HTMLElement; if (t.tagName === 'B' && t.parentElement?.classList.contains('calco-panel') && t === t.parentElement.querySelector(':scope > b')) { t.parentElement.classList.toggle('plegado'); firmaReservas = ''; } });
  const panelCad = document.createElement('div');
  panelCad.className = 'calco-panel cad-panel';
  panelCad.hidden = true;
  dock.appendChild(panelCad);
  const COLOR_USO: Record<string, string> = { referencia: 'var(--dim)', muros: 'var(--ink)', losa: 'var(--ink2)', 'carpintería': 'var(--serie-1)' };
  function cargarDXF(nombre: string, texto: string) {
    const d = leerDXFCompleto(texto);
    if (!d.entidades.length) { mensaje(`${nombre}: no tiene líneas, polilíneas ni círculos en la sección de entidades.`); return; }
    const { factor, unidad } = factorUnidad(d);
    const ents = aMetros(d.entidades, factor);
    const adivinar = (c: string) => (/muro|tabiq|wall|column|pilar|estruct/i.test(c) ? 'muros' : /carp|cerram|facha|vidri|ventan/i.test(c) ? 'carpintería' : /losa|slab|forjado|borde/i.test(c) ? 'losa' : 'referencia') as 'referencia' | 'muros' | 'losa' | 'carpintería';
    const capas = Object.fromEntries(d.capas.map(c => [c, { ver: true, uso: adivinar(c) }]));
    estado.cad = { archivo: nombre, unidad, omitidas: d.omitidas, ents, capas, nodos: [] };
    recalcularNodos();
    armarPanelCad(); dibujar();
    mensaje(`${nombre}: ${ents.length} entidades en ${d.capas.length} capas, en ${unidad}${d.unidad === 'desconocida' ? ' (unidad estimada por el tamaño)' : ''}.`);
  }
  function recalcularNodos() {
    const c = estado.cad; if (!c) return;
    c.nodos = Object.keys(c.capas).filter(k => c.capas[k].ver).flatMap(k => nodosCAD(c.ents.filter(e => e.capa === k)).map(n => ({ ...n, capa: k })));
  }
  const mensaje = (t: string) => { const e = document.getElementById('mensaje'); if (e) e.textContent = t; };
  /** muros que se mueven junto con «m»: el grupo de dibujo elegido, o si no, su pieza agrupada */
  const enMultiM = (m: Muro) => estado.multi.m.includes(m.id) || estado.multi.g.some(g => dentroDe(estado.proyecto, m, g));
  const compas = (m: Muro): string[] => {
    const p = estado.proyecto;
    let ids: string[];
    // lo elegido (lazo, Mayúsculas + clic) se mueve todo junto
    if (enMultiM(m)) ids = [...new Set([...estado.multi.m, ...estado.multi.g.flatMap(g => murosDe(p, g).map(o => o.id))])];
    else if (estado.grupoSel && estado.grupoSel !== estado.contexto && dentroDe(p, m, estado.grupoSel)) ids = murosDe(p, estado.grupoSel).map(o => o.id);
    else if (grupoCerrado(p, m, estado.contexto)) ids = murosDe(p, grupoCerrado(p, m, estado.contexto)!.id).map(o => o.id);   // un grupo cerrado se mueve entero
    else ids = m.grupo ? p.muros.filter(o => o.grupo === m.grupo).map(o => o.id) : [m.id];
    // los tramos de un muro calado van juntos (los dos lados del vano)
    const set = new Set(ids);
    for (let cambio = true; cambio;) {
      cambio = false;
      p.muros.forEach(o => {
        const par = o.vano?.con;
        if (!par) return;
        if (set.has(o.id) && !set.has(par)) { set.add(par); cambio = true; }
        if (set.has(par) && !set.has(o.id)) { set.add(o.id); cambio = true; }
      });
    }
    return [...set].filter(id => { const o = p.muros.find(x => x.id === id); return o && !muroBloqueado(p, o); });
  };
  /** forma y criterio del lazo: libre o rectángulo; centro adentro, entero adentro o tocando (automático: rectángulo de izquierda a derecha = entero, de derecha a izquierda = tocando) */
  const esquinasMuro = (m: Muro): Punto[] => { const k = cajaMuro(m); return [{ x: k.x0, y: k.y0 }, { x: k.x1, y: k.y0 }, { x: k.x1, y: k.y1 }, { x: k.x0, y: k.y1 }]; };
  const cruzan = (a: Punto, b: Punto, c: Punto, d: Punto) => { const o = (p: Punto, q: Punto, r: Punto) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); };
  const tocaPol = (m: Muro, pol: Punto[]) => {
    const e = esquinasMuro(m);
    if (e.some(q => dentroPol(q, pol)) || pol.some(q => dentroPol(q, e))) return true;
    for (let i = 0; i < pol.length; i++) for (let j = 0; j < 4; j++) if (cruzan(pol[i], pol[(i + 1) % pol.length], e[j], e[(j + 1) % 4])) return true;
    return false;
  };
  /** el muro está en la planta del nivel a la vista */
  const nivelActualZ = () => { const p = estado.proyecto; const z = p.niveles[iNivel]?.cota ?? 0, zF = p.niveles.at(-1)?.cota ?? 0, zT = p.niveles[0]?.cota ?? 0; return (m: Muro) => presenteEn(m, z, zF, zT); };
  /** lazo en curso (puntos en metros) y si suma, saca o reemplaza la selección */
  let lazo: { pts: Punto[]; op: 'nuevo' | 'suma' | 'saca' } | null = null;
  const rectPol = (a: Punto, b: Punto): Punto[] => [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];
  const dentroPol = (q: Punto, pol: Punto[]) => { let c = false; for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) { const a = pol[i], b = pol[j]; if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
  /** lo que queda adentro del lazo: muros con el centro adentro; un grupo, si todos sus muros visibles quedan adentro */
  const elegirConLazo = (pol: Punto[], op: 'nuevo' | 'suma' | 'saca', criterio: 'centro' | 'entero' | 'tocando' = 'centro') => {
    const p = estado.proyecto, zN = nivelActualZ();
    const visible = (m: Muro) => !muroOculto(p, m) && dentroDe(p, m, estado.contexto) && zN(m);
    const cumple = (m: Muro) => criterio === 'centro' ? dentroPol(m, pol) : criterio === 'entero' ? esquinasMuro(m).every(q => dentroPol(q, pol)) : tocaPol(m, pol);
    const adentro = new Set(p.muros.filter(m => visible(m) && cumple(m)).map(m => m.id));
    const ms = new Set<string>(), gs = new Set<string>();
    let bloqueados = 0;
    p.muros.forEach(m => {
      if (!adentro.has(m.id)) return;
      const n = nodoAlTocar(p, m, estado.contexto);
      if (!n) return;
      if (muroBloqueado(p, m)) { bloqueados++; return; }
      if (n.t === 'm') ms.add(n.id);
      else if (criterio === 'tocando' || murosDe(p, n.id).filter(visible).every(o => adentro.has(o.id))) gs.add(n.id);
    });
    if (op === 'nuevo') estado.multi = { m: [...ms], g: [...gs] };
    else if (op === 'suma') estado.multi = { m: [...new Set([...estado.multi.m, ...ms])], g: [...new Set([...estado.multi.g, ...gs])] };
    else estado.multi = { m: estado.multi.m.filter(id => !ms.has(id)), g: estado.multi.g.filter(id => !gs.has(id)) };
    estado.grupoSel = null;
    const n = estado.multi.m.length + estado.multi.g.length;
    mensaje(n ? `${n} elegidos${bloqueados ? ` (${bloqueados} bloqueados quedaron afuera)` : ''}: Supr para borrar · Ctrl+G para agrupar · Esc para soltar.` : bloqueados ? `Los ${bloqueados} muros del lazo están bloqueados.` : criterio === 'centro' ? 'El lazo no encerró ningún muro: tiene que quedar adentro el centro de cada uno.' : criterio === 'entero' ? 'Ningún muro quedó entero adentro del rectángulo.' : 'El rectángulo no tocó ningún muro.');
    estado.avisarPanel();
  };
  /** borra lo elegido: la selección múltiple, o si no, el grupo o el muro elegido */
  const borrarElegidos = () => {
    const p = estado.proyecto;
    let ids: string[] = [...estado.multi.m];
    estado.multi.g.forEach(g => ids.push(...murosDe(p, g).map(m => m.id)));
    if (!ids.length && estado.grupoSel) ids = murosDe(p, estado.grupoSel).map(m => m.id);
    if (!ids.length && estado.seleccion) { const m = p.muros.find(x => x.id === estado.seleccion); const g = m && grupoCerrado(p, m, estado.contexto); ids = g ? murosDe(p, g.id).map(x => x.id) : [estado.seleccion]; }
    if (!ids.length) { mensaje('No hay nada elegido para borrar.'); return; }
    const r = { b: 0, s: 0 };
    estado.cambiar(pp => { const x = borrarMuros(pp, ids); r.b = x.borrados; r.s = x.bloqueados; });
    estado.multi = { m: [], g: [] }; estado.grupoSel = null; estado.seleccion = null; estado.limpiarGrupos();
    mensaje(r.b === 0 && r.s ? 'Está bloqueado 🔒: desbloquealo en el Esquema para borrarlo.' : `${r.b === 1 ? 'Se borró un muro' : `Se borraron ${r.b} muros`}${r.s ? ` (${r.s} bloqueados no se tocaron)` : ''}. Ctrl+Z para deshacer.`);
    estado.avisarPanel();
  };
  /** elige los muros que no entran al cálculo: no llegan a la fundación o quedan fuera del molde en los dos vientos */
  const elegirFueraDelCalculo = () => {
    const p = estado.proyecto, pap = estado.calculo.asig?.papeles ?? {};
    const ms = p.muros.filter(m => !muroOculto(p, m) && !muroBloqueado(p, m) && dentroDe(p, m, estado.contexto) && (!m.llega || ((pap[m.id]?.A ?? 'fuera del cálculo') === 'fuera del cálculo' && (pap[m.id]?.B ?? 'fuera del cálculo') === 'fuera del cálculo')));
    estado.multi = { m: ms.map(m => m.id), g: [] }; estado.grupoSel = null;
    mensaje(ms.length ? `${ms.length} muros fuera del cálculo elegidos: Supr para borrarlos.` : 'No hay muros fuera del cálculo.');
    estado.avisarPanel();
  };
  document.addEventListener('torre:borrar-elegidos', borrarElegidos);
  document.addEventListener('torre:elegir-fuera', elegirFueraDelCalculo);
  /** toca un muro con Mayúsculas o Ctrl (o con «Elegir varios»): suma o saca su grupo o el muro de la selección múltiple */
  const alternarMulti = (m: Muro) => {
    const nodo = nodoAlTocar(estado.proyecto, m, estado.contexto);
    if (!nodo) return;
    const lista = nodo.t === 'g' ? estado.multi.g : estado.multi.m;
    const i = lista.indexOf(nodo.id);
    // si había un muro elegido con un clic (sin estar en el conjunto), entra primero al conjunto
    const s0 = estado.seleccion && estado.seleccion !== m.id ? estado.proyecto.muros.find(x => x.id === estado.seleccion) : undefined;
    const n0 = s0 && nodoAlTocar(estado.proyecto, s0, estado.contexto);
    if (n0 && !estado.multi.m.length && !estado.multi.g.length) (n0.t === 'g' ? estado.multi.g : estado.multi.m).push(n0.id);
    const saca = i >= 0;
    if (saca) lista.splice(i, 1); else lista.push(nodo.id);
    if (saca && estado.seleccion === m.id) estado.seleccion = estado.multi.m[0] ?? null;
    const n = estado.multi.g.length + estado.multi.m.length;
    mensaje(n ? `${saca ? 'Sacado' : 'Sumado'} ${nodo.t === 'g' ? `«${grupoPorId(estado.proyecto, nodo.id)?.nombre}»` : nodo.id}: ${n} elegido${n > 1 ? 's' : ''}. Mayús + clic suma o saca; Esc suelta todo.` : 'Selección vacía.');
    estado.avisarPanel();
  };
  async function cargarPDF(f: File) {
    try {
      const { pdfAImagen } = await import('./pdf');
      const { url, aspecto } = await pdfAImagen(f);
      const B = estado.proyecto.niveles.find(n => n.B)?.B ?? 20;
      estado.calco = { url, aspecto, ancho: B * 1.2, x: 0, y: 0, opacidad: 0.5 };
      armarPanelCalco(); dibujar();
      mensaje(`${f.name}: primera página como imagen de fondo. Ajustá la escala con «Escala con dos puntos».`);
    } catch (e) { mensaje(`No se pudo leer el PDF: ${String(e)}`); }
  }
  function armarPanelCad() {
    const c = estado.cad;
    panelCad.hidden = !c;
    panelCad.replaceChildren();
    if (!c) return;
    const tit = document.createElement('b'); tit.textContent = `Plano: ${c.archivo}`;
    const info = document.createElement('span'); info.className = 'nota chica'; info.textContent = `${c.ents.length} entidades · ${c.unidad}${c.omitidas ? ` · ${c.omitidas} bloques o textos sin leer` : ''}`;
    const lista = document.createElement('div'); lista.className = 'capas-cad';
    Object.entries(c.capas).forEach(([nombre, cfg]) => {
      const fila = document.createElement('div'); fila.className = 'capa-cad';
      const ver = document.createElement('input'); ver.type = 'checkbox'; ver.checked = cfg.ver; ver.title = 'Mostrar la capa (y usar sus nodos para el imán)';
      ver.addEventListener('change', () => { cfg.ver = ver.checked; recalcularNodos(); dibujar(); });
      const n = document.createElement('span'); n.textContent = nombre; n.title = `${c.ents.filter(e => e.capa === nombre).length} entidades`;
      const sel = document.createElement('select'); sel.title = 'Para qué se usa la capa';
      ['referencia', 'muros', 'losa', 'carpintería'].forEach(u => { const o = document.createElement('option'); o.value = u; o.textContent = u === 'muros' ? 'muros y columnas' : u; sel.append(o); });
      sel.value = cfg.uso; sel.style.borderLeft = `4px solid ${COLOR_USO[cfg.uso]}`;
      sel.addEventListener('change', () => { cfg.uso = sel.value as typeof cfg.uso; armarPanelCad(); dibujar(); });
      fila.append(ver, n, sel);
      lista.append(fila);
    });
    const deUso = (u: string) => c.ents.filter(e => c.capas[e.capa]?.uso === u && c.capas[e.capa]?.ver);
    const boton = (t: string, titulo: string, f: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.title = titulo; b.addEventListener('click', f); return b; };
    const bMuros = boton('Crear muros y columnas', 'Los pares de líneas paralelas (8 a 60 cm) y los rectángulos cerrados de las capas «muros» pasan a ser tabiques; los círculos, columnas. Después se arman las piezas.', () => {
      const nuevos = murosDesdeCAD(deUso('muros'), new Set(estado.proyecto.muros.map(m => m.id)));
      if (!nuevos.length) { mensaje('No encontré muros en las capas marcadas como «muros» (pares de líneas paralelas, rectángulos o círculos).'); return; }
      estado.cambiar(() => { estado.proyecto.muros = armarPiezas([...estado.proyecto.muros, ...nuevos]); });
      mensaje(`Se crearon ${nuevos.length} elementos. Revisalos en la tabla de muros y agrupá las piezas que correspondan.`);
    });
    const contorno = (u: 'losa' | 'carpintería') => boton(u === 'losa' ? 'Usar como losa' : 'Usar como carpintería', u === 'losa' ? 'El contorno cerrado más grande de las capas «losa» pasa a ser la silueta de este nivel.' : 'El contorno cerrado más grande de las capas «carpintería» pasa a ser la carpintería de este nivel: su caja da a máx y b máx.', () => {
      const v = contornoDesdeCAD(deUso(u));
      if (!v) { mensaje(`No hay un contorno cerrado (polilínea cerrada) en las capas marcadas como «${u}».`); return; }
      estado.cambiar(() => { const n = estado.proyecto.niveles[iNivel]; if (u === 'losa') n.silueta = v.map(q => ({ ...q })); else n.carpinteria = v.map(q => ({ ...q })); });
    });
    const quitar = boton('Quitar plano', 'Saca el dibujo de fondo (lo creado con él queda)', () => { estado.cad = null; armarPanelCad(); dibujar(); });
    const acciones = document.createElement('div'); acciones.className = 'acciones-cad';
    acciones.append(bMuros, contorno('losa'), contorno('carpintería'), quitar);
    panelCad.append(tit, info, lista, acciones);
  }
  // silueta del piso: mover vértices, doble clic en un borde agrega uno, clic derecho en un vértice lo borra
  const bSil = document.createElement('button');
  bSil.type = 'button'; bSil.textContent = 'Losa';
  bSil.title = 'Losa y carpintería de este piso: formas de arranque, dibujarla a mano, balcones, loft y herramientas de CAD. Se edita el contorno de la losa o de la carpintería de este piso: arrastrar los vértices, doble clic en un borde para agregar uno, clic derecho en un vértice para borrarlo. También se importa de AutoCAD (DXF).';
  bSil.addEventListener('click', () => ponerModo(modo === 'silueta' ? 'mover' : 'silueta'));
  const panelSil = document.createElement('div');
  panelSil.className = 'calco-panel silueta-panel';
  panelSil.hidden = true;
  dock.appendChild(panelSil);
  /** la silueta del nivel a la vista, como propia (si heredaba, se copia al editarla) */
  const siluetaPropia = (): Vertice[] => {
    const n = estado.proyecto.niveles[iNivel];
    if (editaCarp) {
      if (!n.carpinteria || n.carpinteria.length < 3) n.carpinteria = (carpinteriaDeNivel(estado.proyecto, iNivel)?.v ?? plantaDeNivel(estado.proyecto, iNivel).silueta).map(v => ({ ...v }));
      return n.carpinteria;
    }
    if (!n.silueta || n.silueta.length < 3) n.silueta = plantaDeNivel(estado.proyecto, iNivel).silueta.map(v => ({ ...v }));
    return n.silueta;
  };
  /** los vértices que se están editando (losa o carpintería), propios o heredados */
  const verticesEd = (): Vertice[] => (editaCarp ? carpinteriaDeNivel(estado.proyecto, iNivel)?.v ?? plantaDeNivel(estado.proyecto, iNivel).silueta : plantaDeNivel(estado.proyecto, iNivel).silueta);
  function armarPanelSil() {
    const p = estado.proyecto, n = p.niveles[iNivel];
    if (!n) return;
    const pl = plantaDeNivel(p, iNivel);
    const caja = cajaSilueta(pl.silueta);
    panelSil.replaceChildren();
    const b = (t: string) => { const x = document.createElement('b'); x.textContent = t; return x; };
    const linea = (t: string) => { const x = document.createElement('span'); x.textContent = t; return x; };
    const boton = (t: string, f: () => void, titulo = '') => { const x = document.createElement('button'); x.type = 'button'; x.textContent = t; x.title = titulo; x.addEventListener('click', f); return x; };
    const dxf = document.createElement('label'); dxf.className = 'boton'; dxf.textContent = 'Importar DXF…';
    dxf.title = 'Polilínea cerrada de AutoCAD (LWPOLYLINE), con arcos. Se pide la unidad del dibujo y se centra en la planta.';
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.dxf'; inp.hidden = true; dxf.append(inp);
    inp.addEventListener('change', async () => {
      const f = inp.files?.[0]; inp.value = ''; if (!f) return;
      const cs = leerDXF(await f.text());
      if (!cs.length) { await avisar('error', 'El DXF no tiene contornos', 'No hay polilíneas cerradas (LWPOLYLINE). En AutoCAD: PEDIT → Juntar → Cerrar.'); return; }
      const mayor = cs.map(c => ({ c, a: areaSilueta(c) })).sort((x, y) => y.a - x.a)[0].c;   // el contorno más grande
      const ext = cajaSilueta(mayor);
      const guess = Math.max(ext.B, ext.L) > 2000 ? 'mm' : Math.max(ext.B, ext.L) > 200 ? 'cm' : 'm';
      const u = ((await pedirTexto('Unidad del dibujo', `Escribí m, cm o mm. El contorno mide ${ext.B.toFixed(1)} × ${ext.L.toFixed(1)} en el DXF.`, guess, 'Importar')) ?? '').trim().toLowerCase();
      const factor = u === 'mm' ? 0.001 : u === 'cm' ? 0.01 : u === 'm' ? 1 : NaN;
      if (!isFinite(factor)) return;
      estado.cambiar(() => { const nv = estado.proyecto.niveles[iNivel]; const c = ajustarContorno(mayor, factor, true); if (editaCarp) nv.carpinteria = c; else nv.silueta = c; });
    });
    const que = document.createElement('div'); que.className = 'seg seg-chico'; que.setAttribute('role', 'group'); que.setAttribute('aria-label', 'Contorno a editar');
    ([['Losa', false], ['Carpintería', true]] as const).forEach(([t, v]) => { const x = boton(t, () => { editaCarp = v; vSel = null; armarPanelSil(); dibujar(); }, v ? 'Contorno de la carpintería (cerramiento): su caja da a máx y b máx' : 'Contorno de la losa (silueta del piso)'); x.setAttribute('aria-pressed', String(editaCarp === v)); que.append(x); });
    // vértices: agregar, borrar y escribir coordenadas (en una tablet, el doble clic y el clic derecho no andan bien)
    const vs = verticesEd();
    if (vSel !== null && vSel >= vs.length) vSel = null;
    const filaV = document.createElement('div'); filaV.className = 'fila-vertices';
    const agregar = boton('+ vértice', () => estado.cambiar(() => {
      const s2 = siluetaPropia();
      let k = 0, lmax = -1;
      s2.forEach((a, j) => { const c = s2[(j + 1) % s2.length], l = Math.hypot(c.x - a.x, c.y - a.y); if (l > lmax) { lmax = l; k = j; } });
      const a2 = s2[k], c2 = s2[(k + 1) % s2.length];
      if (a2.c1 && a2.c2) {
        // Bézier: se parte en dos Bézier en la mitad (de Casteljau), sin cambiar la curva
        const m = (p: Punto, q: Punto) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
        const p01 = m(a2, a2.c1), p12 = m(a2.c1, a2.c2), p23 = m(a2.c2, c2), p012 = m(p01, p12), p123 = m(p12, p23), mid = m(p012, p123);
        s2[k] = { x: a2.x, y: a2.y, c1: p01, c2: p012 };
        s2.splice(k + 1, 0, { x: +mid.x.toFixed(4), y: +mid.y.toFixed(4), c1: p123, c2: p23 });
      } else {
        s2[k] = { ...a2, b: 0 };
        s2.splice(k + 1, 0, { x: +((a2.x + c2.x) / 2).toFixed(2), y: +((a2.y + c2.y) / 2).toFixed(2) });
      }
      vSel = k + 1;
    }), 'Agrega un vértice en el medio del tramo más largo; después se arrastra adonde va.');
    const borrar = boton('− vértice', () => { if (vSel === null || vs.length <= 3) return; const k = vSel; vSel = null; estado.cambiar(() => { siluetaPropia().splice(k, 1); }); }, 'Borra el vértice elegido (tocalo primero). Quedan al menos 3.');
    borrar.disabled = vSel === null || vs.length <= 3;
    // las herramientas de CAD del contorno (arcos, empalmes, chaflanes, desfase, formas): el mismo editor que el de los
    // muros, sobre la losa o la carpintería de este nivel
    const cad = boton('Herramientas CAD…', () => {
      const nivel = iNivel, carp = editaCarp, nombre = estado.proyecto.niveles[nivel]?.nombre ?? '';
      const v0 = verticesEd().map(q => ({ ...q }));
      ponerModo('mover');
      edc.abrirContorno({
        titulo: `${carp ? 'Carpintería' : 'Losa'} del nivel ${nombre}`, v: v0,
        guardar: v => { estado.cambiar(() => { const nv = estado.proyecto.niveles[nivel]; if (carp) nv.carpinteria = v; else nv.silueta = v; }); editaCarp = carp; ponerModo('silueta'); },
      });
    }, 'Arcos (por tres puntos o por radio), empalmes, chaflanes, dividir lados, largo y ángulo exactos, desfasar, simetría, girar, escalar y formas (círculo, polígono, elipse). El mismo editor que el contorno de los muros.');
    cad.classList.add('primario');
    filaV.append(agregar, borrar, cad);
    if (vSel !== null) {
      const k = vSel, v0 = vs[k];
      const campo = (eje: 'x' | 'y') => {
        const inp = document.createElement('input'); inp.type = 'number'; inp.step = '0.05'; inp.value = String(v0[eje]); inp.className = 'campo-vertice'; inp.setAttribute('aria-label', `${eje} del vértice ${k + 1} (m)`);
        inp.addEventListener('change', () => { const val = parseFloat(inp.value.replace(',', '.')); if (!isFinite(val)) return; estado.cambiar(() => { const s2 = siluetaPropia(); if (s2[k]) s2[k] = { ...s2[k], [eje]: +val.toFixed(2) }; }); });
        const l = document.createElement('label'); l.append(`${eje} `, inp, ' m'); return l;
      };
      filaV.append(b(`vértice ${k + 1}:`), campo('x'), campo('y'));
    }
    if (editaCarp) {
      const car = carpinteriaDeNivel(p, iNivel);
      const f2 = (x: number) => x.toFixed(2).replace('.', ',');
      // carpintería por tramos de altura: sin, por losa (de losa a losa, entre las dos) o continua; se recalcula sola
      const tramos = tramosCarpinteria(p);
      const segue = document.createElement('div'); segue.className = 'sigue-losa';
      const ponerTramos = (f: (ts: TramoCarpinteria[]) => void) => estado.cambiar(pp => { const ts = tramosCarpinteria(pp).map(t => ({ ...t })); f(ts); delete pp.carpinteriaRetiro; if (ts.length) pp.carpinteriaTramos = ts.sort((x, y) => x.desde - y.desde); else delete pp.carpinteriaTramos; });
      const nivelesFach = p.niveles.filter(x => x.cota >= -1e-6).sort((x, y) => x.cota - y.cota);
      if (!tramos.length) {
        segue.append(Object.assign(document.createElement('p'), { className: 'nota-losa', textContent: 'La carpintería se dibuja a mano, nivel por nivel. Por tramos, sigue sola a las losas: «por losa» va vertical de losa a losa (siempre entre las dos, sin tapas) y «continua» sigue la superficie.' }),
          boton('Armar por tramos', () => ponerTramos(ts => { ts.push({ desde: nivelesFach[0]?.cota ?? 0, modo: 'losa', retiro: 0.3 }); }), 'Un tramo «por losa», metido 0,30 m, desde el nivel más bajo'));
      } else {
        segue.append(Object.assign(document.createElement('b'), { textContent: 'Carpintería por tramos' }));
        tramos.forEach((t, k) => {
          const fila = document.createElement('div'); fila.className = 'tramo-carp';
          const sd = document.createElement('select'); sd.setAttribute('aria-label', 'Desde qué nivel');
          nivelesFach.forEach(x => sd.append(new Option(x.nombre, String(x.cota), false, Math.abs(x.cota - t.desde) < 1e-6)));
          sd.addEventListener('change', () => ponerTramos(ts => { ts[k].desde = +sd.value; }));
          const sm = document.createElement('select'); sm.setAttribute('aria-label', 'Modo');
          (Object.keys(NOMBRE_MODO) as ModoCarpinteria[]).forEach(m => sm.append(new Option(NOMBRE_MODO[m], m, false, m === t.modo)));
          sm.addEventListener('change', () => ponerTramos(ts => { ts[k].modo = sm.value as ModoCarpinteria; }));
          const rt = document.createElement('input'); rt.type = 'text'; rt.inputMode = 'decimal'; rt.className = 'campo-vertice'; rt.value = String(t.retiro ?? 0).replace('.', ','); rt.setAttribute('aria-label', 'Retiro desde el borde de la losa');
          rt.addEventListener('change', () => { const x = parseFloat(rt.value.replace(',', '.')); if (isFinite(x) && x >= 0) ponerTramos(ts => { ts[k].retiro = x; }); });
          const lab = (t2: string, ...h: (string | Node)[]) => { const l = document.createElement('label'); l.className = 'campo-esq'; l.append(t2, ...h); return l; };
          fila.append(lab('desde ', sd), sm, ...(t.modo === 'sin' ? [] : [lab('metida ', rt, ' m')]), boton('✕', () => ponerTramos(ts => { ts.splice(k, 1); }), 'Sacar este tramo'));
          segue.append(fila);
        });
        const ult = tramos[tramos.length - 1], sig = nivelesFach.find(x => x.cota > ult.desde + 1e-6);
        segue.append(h2(...(sig ? [boton('+ tramo', () => ponerTramos(ts => { ts.push({ desde: sig.cota, modo: 'continua', retiro: ult.retiro ?? 0.3 }); }), `Otro tramo desde ${sig.nombre}`)] : []),
          boton('Volver a la carpintería a mano', () => ponerTramos(ts => { ts.length = 0; }), 'Las carpinterías quedan como están ahora y se editan nivel por nivel')),
          Object.assign(document.createElement('p'), { className: 'nota-losa', textContent: 'Por losa: vertical, de la losa de abajo a la de arriba, con el contorno de lo común a las dos (nunca queda en el aire). Continua: pasa por el borde de cada losa y sigue la superficie. Sin: la base abierta (como el Citicorp debajo del cajón).' }));
        // panelería: montantes cada «módulo» m (en las esquinas siempre), antepecho opaco y travesaños intermedios
        const pn = p.paneleria;
        const pan = document.createElement('div'); pan.className = 'paneleria';
        const cpn = (rot: string, val: number, f: (x: number) => void, unidad: string, ti: string) => { const i = document.createElement('input'); i.type = 'text'; i.inputMode = 'decimal'; i.className = 'campo-vertice'; i.value = String(val).replace('.', ','); i.addEventListener('change', () => { const x = parseFloat(i.value.replace(',', '.')); if (isFinite(x) && x >= 0) f(x); }); const l = document.createElement('label'); l.className = 'campo-esq'; l.title = ti; l.append(rot + ' ', i, unidad ? ` ${unidad}` : ''); return l; };
        const ponerPn = (f: (q: NonNullable<typeof pn>) => void) => estado.cambiar(pp => { const q = { ...(pp.paneleria ?? { modulo: 1.5, antepecho: 0.9, intermedios: 0 }) }; f(q); pp.paneleria = q; });
        if (!pn) pan.append(boton('Panelería: montantes y antepechos', () => ponerPn(() => { /* los valores de siempre */ }), 'Montantes cada 1,5 m (y en las esquinas), travesaño en cada losa y un antepecho opaco de 0,90 m'));
        else {
          const r = calcularPaneleria(bandasFachada(p, prepararSecciones), pn);
          const f1 = (x: number) => x.toFixed(1).replace('.', ',');
          pan.append(Object.assign(document.createElement('b'), { textContent: 'Panelería' }),
            cpn('montantes cada', pn.modulo, x => ponerPn(q => { q.modulo = Math.max(0.3, x); }), 'm', 'distancia entre montantes por el contorno (siempre hay uno en cada esquina)'),
            cpn('antepecho opaco', pn.antepecho ?? 0, x => ponerPn(q => { q.antepecho = x; }), 'm', 'banda opaca sobre cada losa (0 = todo vidrio)'),
            cpn('travesaños intermedios', pn.intermedios ?? 0, x => ponerPn(q => { q.intermedios = Math.round(x); }), '', 'travesaños de más en el vidrio de cada piso'),
            Object.assign(document.createElement('p'), { className: 'nota-losa', textContent: `${r.vidrio.n} paneles de vidrio (${f1(r.vidrio.area)} m²) · ${r.opacos.n} antepechos (${f1(r.opacos.area)} m²) · montantes ${f1(r.largoMontantes)} m · travesaños ${f1(r.largoTravesanos)} m. En el 3D: capa «Fachada».` }),
            boton('Sin panelería', () => estado.cambiar(pp => { delete pp.paneleria; }), ''));
        }
        segue.append(pan);
        const tn = tramoEn(p, n.cota);
        panelSil.append(que, b(`Carpintería de ${n.nombre}`), segue, linea(tn ? `en este nivel: ${NOMBRE_MODO[tn.modo].toLowerCase()}${car ? ` · a máx ${f2(car.a)} × b máx ${f2(car.b)} m` : ''}` : 'este nivel queda debajo del primer tramo (a mano)'));
        return;
      }
      panelSil.append(que, b(`Carpintería de ${n.nombre}`), segue,
        linea(!car ? 'sin carpintería: arrastrá un vértice y se copia la silueta de la losa' : car.propia ? 'propia de este nivel' : 'heredada de otro nivel (de arriba o, si arriba no hay, de abajo; se copia al editarla)'),
        ...(car ? [linea(`a máx ${f2(car.a)} × b máx ${f2(car.b)} m · área ${areaSilueta(car.v).toFixed(1).replace('.', ',')} m²`)] : []),
        linea(`la planilla usa B × L = ${pl.B} × ${pl.L} m${car && (Math.abs(car.a - pl.B) > 0.01 || Math.abs(car.b - pl.L) > 0.01) ? ' (distinto de la caja)' : ''}`),
        filaV, dxf,
        boton('Copiar de la losa', () => estado.cambiar(() => { estado.proyecto.niveles[iNivel].carpinteria = pl.silueta.map(v => ({ ...v })); }), 'La carpintería arranca igual que la silueta de la losa; después se mueven los vértices hacia adentro.'),
        ...(car ? [boton('Usar a máx y b máx como B y L', () => estado.cambiar(() => { const nv = estado.proyecto.niveles[iNivel]; nv.B = +car.a.toFixed(2); nv.L = +car.b.toFixed(2); }), 'Escribe en este nivel B = a máx y L = b máx (es lo que lee la planilla para el viento). No se hace solo: queda a tu criterio.')] : []),
        ...(car ? [boton('Copiar a todos los niveles', async () => {
          if (!(await confirmar('Copiar la carpintería', `La carpintería de ${n.nombre} pasa a ser la de todos los niveles (se reemplazan las que ya tengan). Se puede deshacer.`, 'Copiar'))) return;
          estado.cambiar(() => { estado.proyecto.niveles.forEach(nv => { nv.carpinteria = car.v.map(q => JSON.parse(JSON.stringify(q))); }); });
          mensaje(`Carpintería de ${n.nombre} copiada a los ${estado.proyecto.niveles.length} niveles: el viento (túneles y presiones) la usa en toda la torre.`);
        }, 'La misma carpintería en todos los pisos: lo que usan el túnel 2D, el túnel 3D y las presiones en cada piso.')] : []),
        boton('Quitar carpintería', () => estado.cambiar(() => { estado.proyecto.niveles[iNivel].carpinteria = null; }), 'Vuelve a la del nivel de arriba (o a ninguna).'),
        seccionEsquinas(Math.min(car?.a ?? pl.B, car?.b ?? pl.L)));
      return;
    }
    const delLoft = loftDeNivel(p, iNivel);
    const delPerfil = !delLoft && !!p.perfilTorre && iNivel < nivelBase(p, p.perfilTorre) && !n.manual;
    // piso por piso: una losa generada se suelta para editarla a mano; una suelta se vuelve a atar
    const generable = !!p.perfilTorre && iNivel < nivelBase(p, p.perfilTorre) || (p.lofts ?? []).some(l => nivelesDeLoft(p, l).intermedios.includes(iNivel));
    const bSoltar = (delLoft || delPerfil) ? [boton('Soltar esta losa (editarla a mano)', () => estado.cambiar(pp => { pp.niveles[iNivel].manual = true; }), 'Queda con la forma que tiene ahora y deja de recalcularse: la editás como cualquier losa. Los demás pisos siguen con el perfil o el loft.')]
      : n.manual && generable ? [boton('Volver a atar (que la genere el perfil o el loft)', () => estado.cambiar(pp => { delete pp.niveles[iNivel].manual; }), 'Se pierde lo editado a mano en este piso')] : [];
    const avisoPerfil = delPerfil ? [Object.assign(document.createElement('p'), { className: 'nota aviso-loft', textContent: 'Esta losa la genera el perfil de la torre (abajo, en «Perfil de la torre»): se recalcula sola. Cambiá la losa base o el perfil, o quitalo.' })] : [];
    const avisoLoft = delLoft ? [(() => { const x = document.createElement('p'); x.className = 'nota aviso-loft'; const { secciones } = nivelesDeLoft(p, delLoft); x.textContent = `Esta losa la genera el loft ${delLoft.id} (de ${p.niveles[secciones[secciones.length - 1]]?.nombre} a ${p.niveles[secciones[0]]?.nombre}): se recalcula sola con cada cambio, así que lo que edites acá se pierde. Cambiá las losas sección o quitá el loft.`; return x; })()] : [];
    panelSil.append(que, b(`Silueta de ${n.nombre}`), ...avisoLoft, ...avisoPerfil, ...bSoltar, linea(delLoft ? `generada por el loft ${delLoft.id}` : delPerfil ? 'generada por el perfil de la torre' : n.manual ? 'suelta: editada a mano (el perfil y los lofts no la tocan)' : pl.propia ? 'propia de este nivel' : 'heredada (se copia al editarla)'),
      linea(`área ${areaSilueta(pl.silueta).toFixed(1).replace('.', ',')} m² · caja ${caja.B.toFixed(2).replace('.', ',')} × ${caja.L.toFixed(2).replace('.', ',')} m`),
      linea(`la planilla usa B × L = ${pl.B} × ${pl.L} m`),
      filaV, dxf,
      boton('Usar la caja como B y L', () => estado.cambiar(() => { const nv = estado.proyecto.niveles[iNivel]; nv.B = +caja.B.toFixed(2); nv.L = +caja.L.toFixed(2); }), 'Pone en este nivel B y L iguales a la caja de la silueta (lo que lee la planilla para el viento).'),
      boton('Copiar a todos los niveles', async () => {
        if (!(await confirmar('Copiar la silueta', `La silueta de la losa de ${n.nombre} pasa a ser la de todos los niveles (se reemplazan las que ya tengan). Se puede deshacer.`, 'Copiar'))) return;
        estado.cambiar(() => { estado.proyecto.niveles.forEach(nv => { nv.silueta = pl.silueta.map(q => JSON.parse(JSON.stringify(q))); }); });
        mensaje(`Silueta de ${n.nombre} copiada a los ${estado.proyecto.niveles.length} niveles.`);
      }, 'La misma silueta de losa en todos los pisos.'),
      boton('Quitar silueta', () => estado.cambiar(() => { estado.proyecto.niveles[iNivel].silueta = null; }), 'Vuelve a la del nivel de arriba o al rectángulo B × L.'),
      seccionDesdeCero(),
      seccionPerfil(),
      seccionLoft(),
      seccionEsquinas(Math.min(caja.B, caja.L)));
  }
  /**
   * perfil de la torre (alzado): la planta de la losa base se escala, se gira y se corre con la altura. Un alzado chico
   * con los puntos de la curva: se arrastran (a los costados cambia el ancho, arriba y abajo la altura), un toque en
   * el alzado agrega un punto; el punto elegido se ajusta con números.
   */
  function seccionPerfil(): HTMLElement {
    const p = estado.proyecto, pf = p.perfilTorre ?? null;
    const det = document.createElement('details'); det.className = 'esquinas-torre perfil-torre'; det.open = pfAbierto;
    det.addEventListener('toggle', () => { pfAbierto = det.open; });
    const sum = document.createElement('summary'); sum.textContent = `Perfil de la torre (alzado)${pf ? ' · activo' : ''}`; det.append(sum);
    const nota = (t: string) => Object.assign(document.createElement('p'), { className: 'nota-losa', textContent: t });
    const boton = (t: string, ti: string, f: () => void, prim = false) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = t; x.title = ti; if (prim) x.className = 'primario'; x.addEventListener('click', f); return x; };
    const poner = (f: (q: PerfilTorre) => void) => estado.cambiar(pp => { const q: PerfilTorre = structuredClone(pp.perfilTorre ?? { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 1 }] }); f(q); q.puntos.sort((a, b) => a.h - b.h); pp.perfilTorre = q; });
    det.append(nota('El edificio entero toma la forma de la losa base y la cambia con la altura: más angosto o más ancho, girado o inclinado. Elegí un perfil y ajustalo arrastrando los puntos del alzado.'));
    // plantillas
    const pls = document.createElement('div'); pls.className = 'galeria-perfiles';
    PERFILES.forEach(x => pls.append(boton(x.nombre, x.texto, () => { pfSel = null; poner(q => { q.puntos = structuredClone(x.p.puntos); q.suave = x.p.suave ?? false; q.giro = x.p.giro ?? 0; }); })));
    det.append(pls);
    if (!pf) return det;
    // alzado: eje vertical = altura (0 abajo, 1 arriba), a los costados el ancho (factor 1 = la base)
    const W = 260, H = 230, mx = W / 2, y0 = H - 16, y1 = 14, K = 62;
    const iB = nivelBase(p, pf), zb = p.niveles[iB].cota, zt = p.niveles[0].cota;
    const baseB = plantaDeNivel(p, iB).B || 20, kd = K / (baseB / 2);
    const Yh = (h: number) => y0 - h * (y0 - y1), Xf = (f: number, dx: number) => mx + f * K + dx * kd;
    const sv = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'alzado-perfil', role: 'img', 'aria-label': 'Alzado del perfil de la torre' }) as SVGSVGElement;
    const dibujarAlzado = (q: PerfilTorre) => {
      sv.replaceChildren();
      // niveles
      p.niveles.forEach((nv, i) => { if (i > iB) return; const h = (nv.cota - zb) / (zt - zb || 1); sv.append(el('line', { x1: 8, x2: W - 8, y1: Yh(h), y2: Yh(h), class: 'nivel' })); });
      // la torre: borde derecho (fx) y el izquierdo en espejo, corridos por dx; en trazos, la cara en y (fy) si es distinta
      const hs = Array.from({ length: 61 }, (_, k) => k / 60), vs = hs.map(h => valorPerfil(q, h));
      const der = hs.map((h, k) => `${Xf(vs[k].fx, vs[k].dx).toFixed(1)},${Yh(h).toFixed(1)}`), izq = hs.map((h, k) => `${Xf(-vs[k].fx, vs[k].dx).toFixed(1)},${Yh(h).toFixed(1)}`).reverse();
      sv.append(el('polygon', { points: [...der, ...izq].join(' '), class: 'torre' }));
      if (q.puntos.some(x => x.fy !== null && x.fy !== undefined && Math.abs(x.fy - x.fx) > 1e-6)) sv.append(el('polyline', { points: hs.map((h, k) => `${Xf(vs[k].fy, vs[k].dy).toFixed(1)},${Yh(h).toFixed(1)}`).join(' '), class: 'cara-y' }));
      sv.append(el('line', { x1: mx, x2: mx, y1: y0 + 6, y2: y1 - 6, class: 'eje' }));
      q.puntos.forEach((x, i) => {
        const c = el('circle', { cx: Xf(x.fx, x.dx ?? 0), cy: Yh(x.h), r: pfSel === i ? 8 : 6, class: 'punto' + (pfSel === i ? ' sel' : ''), 'data-i': i });
        sv.append(c);
      });
      const t = el('text', { x: 8, y: H - 2, class: 'rot' }); t.textContent = `base: ${p.niveles[iB].nombre}`; sv.append(t);
      const t2 = el('text', { x: 8, y: 11, class: 'rot' }); t2.textContent = p.niveles[0].nombre; sv.append(t2);
    };
    let q = structuredClone(pf);
    dibujarAlzado(q);
    // arrastrar un punto: a los costados el ancho, arriba y abajo la altura (el primero y el último quedan en la base y la azotea)
    const aLocal = (ev: PointerEvent) => { const r = sv.getBoundingClientRect(); return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H }; };
    let arr: { i: number; id: number; movio: boolean } | null = null;
    sv.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      const t = (ev.target as Element).closest?.('[data-i]');
      const l = aLocal(ev);
      if (t) { arr = { i: +t.getAttribute('data-i')!, id: ev.pointerId, movio: false }; pfSel = arr.i; }
      else {
        // un toque en el alzado agrega un punto a esa altura, con el ancho que marca el toque
        const h = Math.max(0.01, Math.min(0.99, (y0 - l.y) / (y0 - y1))), v = valorPerfil(q, h);
        q.puntos.push({ h: +h.toFixed(3), fx: +Math.max(0.05, Math.abs(l.x - mx - v.dx * kd) / K).toFixed(3) });
        q.puntos.sort((a, b) => a.h - b.h); pfSel = q.puntos.findIndex(x => Math.abs(x.h - h) < 1e-3);
        arr = { i: pfSel, id: ev.pointerId, movio: true };
      }
      try { sv.setPointerCapture(ev.pointerId); } catch { /* sintético */ }
      dibujarAlzado(q);
    });
    sv.addEventListener('pointermove', ev => {
      if (!arr || ev.pointerId !== arr.id) return;
      const l = aLocal(ev), x = q.puntos[arr.i], n = q.puntos.length;
      x.fx = +Math.max(0.05, Math.min(3, (l.x - mx - (x.dx ?? 0) * kd) / K)).toFixed(3);
      if (arr.i > 0 && arr.i < n - 1) x.h = +Math.max(q.puntos[arr.i - 1].h + 0.005, Math.min(q.puntos[arr.i + 1].h - 0.005, (y0 - l.y) / (y0 - y1))).toFixed(3);
      arr.movio = true; dibujarAlzado(q);
    });
    const soltarP = () => { if (!arr) return; const m = arr.movio; arr = null; if (m) estado.cambiar(pp => { pp.perfilTorre = structuredClone(q); }); else armarPanelSil(); };
    sv.addEventListener('pointerup', soltarP); sv.addEventListener('pointercancel', soltarP);
    det.append(sv);
    // forma de la curva, giro, base
    const seg = document.createElement('div'); seg.className = 'seg seg-chico'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Curva del perfil');
    ([[false, 'Tramos rectos'], [true, 'Curva suave']] as const).forEach(([v, t]) => { const x = boton(t, v ? 'Curva suave que pasa por todos los puntos (sin pasarse de ellos)' : 'Rectas entre los puntos: aristas y escalones', () => poner(z => { z.suave = v; })); x.setAttribute('aria-pressed', String(!!pf.suave === v)); seg.append(x); });
    const num = (rot: string, val: number, f: (x: number) => void, unidad: string, ti = '') => { const i = document.createElement('input'); i.type = 'text'; i.inputMode = 'decimal'; i.className = 'campo-vertice'; i.value = String(val).replace('.', ','); i.addEventListener('change', () => { const x = parseFloat(i.value.replace(',', '.')); if (isFinite(x)) f(x); }); const l = document.createElement('label'); l.className = 'campo-esq'; l.title = ti; l.append(rot + ' ', i, ` ${unidad}`); return l; };
    const sb = document.createElement('select'); sb.setAttribute('aria-label', 'Losa base');
    p.niveles.forEach((nv, i) => { if (nv.cota >= -1e-6 && i > 0) sb.append(new Option(nv.nombre, String(nv.cota), false, i === iB)); });
    sb.addEventListener('change', () => poner(z => { z.base = +sb.value; }));
    const lb = document.createElement('label'); lb.className = 'campo-esq'; lb.append('losa base ', sb);
    det.append(seg, lb, num('giro total', pf.giro ?? 0, x => poner(z => { z.giro = x; }), '°', 'de la base a la azotea, antihorario'));
    // el punto elegido
    if (pfSel !== null && pf.puntos[pfSel]) {
      const i = pfSel, x = pf.puntos[i], alt = zb + x.h * (zt - zb);
      const caja = document.createElement('div'); caja.className = 'punto-perfil';
      caja.append(Object.assign(document.createElement('b'), { textContent: `Punto ${i + 1} · a ${alt.toFixed(1).replace('.', ',')} m` }),
        num('ancho en x', +(x.fx * 100).toFixed(1), v => poner(z => { z.puntos[i].fx = v / 100; }), '%', 'respecto de la losa base'),
        num('ancho en y', +((x.fy ?? x.fx) * 100).toFixed(1), v => poner(z => { z.puntos[i].fy = Math.abs(v / 100 - z.puntos[i].fx) < 1e-9 ? null : v / 100; }), '%', 'igual que en x si no se cambia'),
        num('corrimiento x', x.dx ?? 0, v => poner(z => { z.puntos[i].dx = v; }), 'm', 'torre inclinada'),
        num('corrimiento y', x.dy ?? 0, v => poner(z => { z.puntos[i].dy = v; }), 'm'));
      if (i > 0 && i < pf.puntos.length - 1) caja.append(boton('Sacar este punto', '', () => { pfSel = null; poner(z => { z.puntos.splice(i, 1); }); }));
      det.append(caja);
    } else det.append(nota('Tocá un punto del alzado para ajustarlo con números; tocá en otro lado del alzado para agregar uno.'));
    const lofts = (p.lofts ?? []).length;
    if (lofts) det.append(nota(`Hay ${lofts} ${lofts === 1 ? 'loft' : 'lofts'}: mandan sobre los niveles que generan.`));
    det.append(h2(boton('Quitar el perfil', 'Las losas quedan como están ahora (como siluetas propias)', () => { pfSel = null; estado.cambiar(pp => { delete pp.perfilTorre; }); })));
    void aplicarPerfil;
    return det;
  }
  /**
   * losa desde cero: formas de arranque con sus medidas, dibujarla a mano vértice por vértice, y salientes (balcones,
   * voladizos) o entrantes (retiros) en un lado. Abierta de entrada si el nivel todavía no tiene silueta propia.
   */
  function seccionDesdeCero(): HTMLElement {
    const p = estado.proyecto, n = p.niveles[iNivel], pl = plantaDeNivel(p, iNivel);
    const det = document.createElement('details'); det.className = 'esquinas-torre losa-cero';
    det.open = dc.abierto ?? (!pl.propia || !p.muros.length);
    // (un details nuevo ya abierto también avisa «toggle»: solo cuenta si cambió, si no la carta se rearma sin fin)
    det.addEventListener('toggle', () => { if (dc.abierto === det.open) return; dc.abierto = det.open; if (!det.open && dc.previa) { dc.previa = null; pedirDibujo(); } });
    const sum = document.createElement('summary'); sum.textContent = 'Losa desde cero: formas, a mano y balcones'; det.append(sum);
    const nota = (t: string) => { const x = document.createElement('p'); x.className = 'nota-losa'; x.textContent = t; return x; };
    const boton = (t: string, ti: string, f: () => void, prim = false) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = t; x.title = ti; if (prim) x.className = 'primario'; x.addEventListener('click', f); return x; };
    // galería de formas con su dibujito
    const gal = document.createElement('div'); gal.className = 'galeria-formas'; gal.setAttribute('role', 'group'); gal.setAttribute('aria-label', 'Forma de la losa');
    (Object.keys(FORMAS_LOSA) as FormaLosa[]).forEach(f => {
      const v = formaLosa(f, FORMAS_LOSA[f].def), x = document.createElement('button'); x.type = 'button'; x.title = `${FORMAS_LOSA[f].nombre}: ${FORMAS_LOSA[f].texto}`; x.setAttribute('aria-pressed', String(dc.forma === f));
      if (!('error' in v)) {
        const ps = puntosSilueta(v, 10), xs = ps.map(q => q.x), ys = ps.map(q => q.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), k = 26 / Math.max(x1 - x0, y1 - y0);
        const sv = el('svg', { viewBox: '0 0 30 30', width: 30, height: 30, 'aria-hidden': 'true' });
        sv.append(el('polygon', { points: ps.map(q => `${(15 + (q.x - (x0 + x1) / 2) * k).toFixed(1)},${(15 - (q.y - (y0 + y1) / 2) * k).toFixed(1)}`).join(' ') }));
        x.append(sv);
      }
      const t = document.createElement('span'); t.textContent = FORMAS_LOSA[f].nombre; x.append(t);
      x.addEventListener('click', () => { dc.forma = f; dc.med = { ...FORMAS_LOSA[f].def }; dc.previa = 'forma'; armarPanelSil(); dibujar(); });
      gal.append(x);
    });
    det.append(nota('1 · Elegí una forma y escribí sus medidas (en metros). Queda centrada en la planta.'), gal);
    const ROT: Record<keyof MedidasLosa, string> = { B: 'B (ancho en x)', L: 'L (largo en y)', a: 'a (ancho de las alas)', r: 'r (radio de las esquinas)', n: 'lados', Bs: 'ancho de arriba' };
    const campos = document.createElement('div'); campos.className = 'campos-forma';
    FORMAS_LOSA[dc.forma].medidas.forEach(k => {
      const i = document.createElement('input'); i.type = 'text'; i.inputMode = 'decimal'; i.className = 'campo-vertice'; i.value = String(dc.med[k] ?? '').replace('.', ',');
      i.addEventListener('input', () => { const x = parseFloat(i.value.replace(',', '.')); if (isFinite(x)) dc.med[k] = x; dc.previa = 'forma'; avisoForma(); pedirDibujo(); });
      const l = document.createElement('label'); l.className = 'campo-esq'; l.append(ROT[k] + ' ', i, k === 'n' ? '' : ' m'); campos.append(l);
    });
    // lo que está mal en las medidas se dice acá mismo, mientras se escribe (y la vista previa no se dibuja)
    const errF = document.createElement('p'); errF.className = 'error-losa'; errF.setAttribute('role', 'status');
    const avisoForma = () => { const v = formaLosa(dc.forma, dc.med); errF.textContent = 'error' in v ? v.error : dc.previa === 'forma' ? `Vista previa en la planta (línea de trazos). «Usar» la aplica.` : ''; errF.classList.toggle('mal', 'error' in v); };
    avisoForma();
    const blc = document.createElement('input'); blc.type = 'checkbox'; blc.checked = dc.bl; blc.addEventListener('change', () => { dc.bl = blc.checked; });
    const lbl = document.createElement('label'); lbl.className = 'campo-linea'; lbl.title = 'La planilla toma de cada nivel B y L (para el viento): con esto quedan iguales a la caja de la forma'; lbl.append(blc, ' B y L de la planilla = la caja de la forma');
    const usar = (todos: boolean) => {
      const v = formaLosa(dc.forma, dc.med);
      if ('error' in v) { void avisar('error', 'No se puede armar la forma', v.error); return; }
      estado.cambiar(pp => {
        const c = cajaSilueta(v);
        (todos ? pp.niveles.map((_, k) => k) : [iNivel]).forEach(k => { pp.niveles[k].silueta = v.map(q => JSON.parse(JSON.stringify(q))); if (dc.bl) { pp.niveles[k].B = +c.B.toFixed(2); pp.niveles[k].L = +c.L.toFixed(2); } });
      });
      dc.previa = null;
      mensaje(`${FORMAS_LOSA[dc.forma].nombre} en ${todos ? 'todos los niveles' : n.nombre}. Ajustala arrastrando los vértices o con «Herramientas CAD…».`);
    };
    det.append(campos, errF, lbl, h2(boton(`Usar en ${n.nombre}`, 'La losa de este nivel pasa a tener esta forma', () => usar(false), true), boton('Usar en todos los niveles', 'Todas las losas con esta forma (después se cambian de a una o con un loft)', async () => { if (await confirmar('Forma en todos los niveles', `Las losas de los ${p.niveles.length} niveles pasan a ser «${FORMAS_LOSA[dc.forma].nombre}» (se reemplazan las que tengan). Se puede deshacer.`, 'Usar')) usar(true); })));
    // a mano
    det.append(nota('2 · O dibujala a mano: tocá los vértices en la planta, uno por uno, y cerrala tocando el primero.'));
    const ort = document.createElement('input'); ort.type = 'checkbox'; ort.checked = dc.orto; ort.addEventListener('change', () => { dc.orto = ort.checked; });
    const lo = document.createElement('label'); lo.className = 'campo-linea'; lo.append(ort, ' a 90° (horizontal o vertical)');
    det.append(h2(trazo ? boton('Cancelar el dibujo', 'Esc', () => { trazo = null; trazoCursor = null; armarPanelSil(); dibujar(); indicar(INDIC.silueta); })
      : boton('Dibujar la losa a mano', 'Tocá los vértices en la planta; se pegan a la grilla. Enter o tocar el primero: cierra. Retroceso: borra el último. Esc: cancela.', () => { trazo = []; trazoCursor = null; armarPanelSil(); dibujar(); indicar(INDIC_TRAZO); }, true), lo));
    // salientes y entrantes
    const lados = ladosLosa(pl.silueta);
    if (dc.lado >= lados.length) dc.lado = 0;
    det.append(nota('3 · Balcones, voladizos y retiros: un rectángulo que sale (o entra) de un lado recto.'));
    const sl = document.createElement('select'); sl.setAttribute('aria-label', 'Lado');
    lados.forEach(l => sl.append(new Option(`Lado ${l.i + 1} · mira ${l.mira} · ${l.largo.toFixed(2).replace('.', ',')} m${l.recto ? '' : ' (curvo)'}`, String(l.i), false, l.i === dc.lado)));
    sl.addEventListener('change', () => { dc.lado = +sl.value; if (dc.previa !== 'meter') dc.previa = 'sacar'; avisoSal(); dibujar(); });
    const num = (rot: string, val: number | null, f: (x: number | null) => void, ti = '') => { const i = document.createElement('input'); i.type = 'text'; i.inputMode = 'decimal'; i.className = 'campo-vertice'; i.value = val === null ? '' : String(val).replace('.', ','); i.placeholder = val === null ? 'medio' : ''; i.addEventListener('input', () => { const x = parseFloat(i.value.replace(',', '.')); f(isFinite(x) ? x : null); if (dc.previa !== 'meter') dc.previa = 'sacar'; avisoSal(); pedirDibujo(); }); const l = document.createElement('label'); l.className = 'campo-esq'; l.title = ti; l.append(rot + ' ', i, ' m'); return l; };
    const errS = document.createElement('p'); errS.className = 'error-losa'; errS.setAttribute('role', 'status');
    const avisoSal = () => {
      if (!dc.previa || dc.previa === 'forma') { errS.textContent = ''; return; }
      const r = salienteEnLado(pl.silueta, dc.lado, dc.ancho, (dc.previa === 'meter' ? -1 : 1) * Math.abs(dc.prof), dc.centro);
      errS.textContent = 'error' in r ? r.error : `Vista previa del ${dc.previa === 'meter' ? 'retiro' : 'balcón'} en la planta.`;
      errS.classList.toggle('mal', 'error' in r);
    };
    const bSacar = boton('Sacar (balcón)', 'Agrega un rectángulo hacia afuera del lado elegido (resaltado en la planta)', () => aplicar(1), true), bMeter = boton('Meter (retiro)', 'Saca un rectángulo hacia adentro del lado elegido', () => aplicar(-1));
    // al pasar por encima (o tocar el campo) cada botón muestra lo que haría
    ([[bSacar, 'sacar'], [bMeter, 'meter']] as const).forEach(([b, q]) => { b.addEventListener('pointermove', () => { if (dc.previa !== q) { dc.previa = q; avisoSal(); pedirDibujo(); } }); b.addEventListener('focus', () => { dc.previa = q; avisoSal(); pedirDibujo(); }); });
    const botonesSal = h2(bSacar, bMeter);
    avisoSal();
    const aplicar = (signo: 1 | -1) => {
      const r = salienteEnLado(pl.silueta, dc.lado, dc.ancho, signo * Math.abs(dc.prof), dc.centro);
      if ('error' in r) { void avisar('error', signo > 0 ? 'No se puede agregar el saliente' : 'No se puede hacer el entrante', r.error); return; }
      dc.previa = null;
      estado.cambiar(pp => { const nv = pp.niveles[iNivel]; nv.silueta = r; if (dc.bl) { const c = cajaSilueta(r); nv.B = +c.B.toFixed(2); nv.L = +c.L.toFixed(2); } });
      mensaje(signo > 0 ? `Saliente de ${dc.ancho} × ${dc.prof} m en el lado ${dc.lado + 1}.` : `Entrante de ${dc.ancho} × ${dc.prof} m en el lado ${dc.lado + 1}.`);
    };
    det.append(sl,
      num('ancho', dc.ancho, x => { if (x && x > 0) dc.ancho = x; }), num('profundidad', dc.prof, x => { if (x && x > 0) dc.prof = x; }),
      num('centro a', dc.centro, x => { dc.centro = x; }, 'distancia del centro del saliente al primer vértice del lado (vacío: en el medio del lado)'),
      errS, botonesSal);
    return det;
  }
  /** fila de botones */
  function h2(...xs: HTMLElement[]) { const d = document.createElement('div'); d.className = 'fila-acciones'; d.append(...xs); return d; }
  /**
   * loft de losas (como el de Rhino): la losa que se está viendo es la primera; se elige la otra (y, si se quiere,
   * losas del medio que también mandan) y las siluetas de todas las losas entre ellas salen de interpolarlas
   */
  function seccionLoft(): HTMLElement {
    const p = estado.proyecto, n = p.niveles[iNivel];
    const det = document.createElement('details'); det.className = 'esquinas-torre loft-losas'; det.open = lft.abierto;
    det.addEventListener('toggle', () => { lft.abierto = det.open; });
    const sum = document.createElement('summary'); sum.textContent = `Loft de losas${p.lofts?.length ? ` (${p.lofts.length})` : ''}`; det.append(sum);
    const nota = (t: string) => { const x = document.createElement('p'); x.className = 'nota'; x.textContent = t; return x; };
    const fila = (rot: string, ...hijos: (HTMLElement | string)[]) => { const l = document.createElement('label'); l.className = 'campo-esq'; l.append(rot, ...hijos); return l; };
    const nombreDe = (z: number) => p.niveles.find(x => Math.abs(x.cota - z) < 1e-6)?.nombre ?? `${z} m`;
    const fz = (z: number) => z.toFixed(2).replace('.', ',');
    det.append(nota('Como el Loft de Rhino: elegís dos losas y la silueta de todas las que quedan entre ellas sale de pasar de una forma a la otra. Las losas sección se siguen editando; las del medio se recalculan solas.'));
    // la otra losa
    if (lft.otra !== null && (Math.abs(lft.otra - n.cota) < 1e-6 || !p.niveles.some(x => Math.abs(x.cota - lft.otra!) < 1e-6))) lft.otra = null;
    lft.medias = lft.medias.filter(z => p.niveles.some(x => Math.abs(x.cota - z) < 1e-6) && Math.abs(z - n.cota) > 1e-6 && (lft.otra === null || Math.abs(z - lft.otra) > 1e-6));
    const sOtra = document.createElement('select');
    sOtra.append(new Option('— elegí la otra losa —', ''));
    p.niveles.forEach(x => { if (Math.abs(x.cota - n.cota) > 1e-6) sOtra.append(new Option(`${x.nombre} (${fz(x.cota)} m)`, String(x.cota), false, lft.otra !== null && Math.abs(x.cota - lft.otra) < 1e-6)); });
    sOtra.addEventListener('change', () => { lft.otra = sOtra.value === '' ? null : Number(sOtra.value); armarPanelSil(); });
    det.append(fila('Losa 1 ', Object.assign(document.createElement('b'), { textContent: `${n.nombre} (la que estás viendo)` })), fila('Losa 2 ', sOtra));
    if (lft.otra !== null) {
      const z0 = Math.min(n.cota, lft.otra), z1 = Math.max(n.cota, lft.otra);
      const entre = p.niveles.filter(x => x.cota > z0 + 1e-6 && x.cota < z1 - 1e-6);
      // losas del medio que también mandan (loft por varias secciones)
      const sMed = document.createElement('select');
      sMed.append(new Option('+ losa del medio que también manda…', ''));
      entre.filter(x => !lft.medias.some(z => Math.abs(z - x.cota) < 1e-6)).forEach(x => sMed.append(new Option(`${x.nombre} (${fz(x.cota)} m)`, String(x.cota))));
      sMed.addEventListener('change', () => { if (sMed.value !== '') lft.medias.push(Number(sMed.value)); armarPanelSil(); });
      if (entre.length > 1) det.append(fila('Secciones ', sMed));
      lft.medias.forEach(z => { const q = document.createElement('button'); q.type = 'button'; q.textContent = `✕ ${nombreDe(z)}`; q.title = 'Sacar esta losa de las secciones'; q.addEventListener('click', () => { lft.medias = lft.medias.filter(w => Math.abs(w - z) > 1e-6); armarPanelSil(); }); det.append(q); });
      const seg = document.createElement('div'); seg.className = 'seg seg-chico'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Tipo de loft');
      ([['recto', 'Recto'], ['suave', 'Suave']] as const).forEach(([v, t]) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = t; x.setAttribute('aria-pressed', String(lft.tipo === v)); x.title = v === 'recto' ? 'Tramos rectos entre secciones («Straight sections» de Rhino): las caras son planas o regladas.' : 'Curva suave en altura («Normal» de Rhino): pasa por todas las secciones y llega vertical a las de los extremos.'; x.addEventListener('click', () => { lft.tipo = v; armarPanelSil(); }); seg.append(x); });
      const giro = document.createElement('input'); giro.type = 'text'; giro.inputMode = 'decimal'; giro.className = 'campo-vertice'; giro.value = String(lft.giro).replace('.', ',');
      giro.addEventListener('change', () => { const g = parseFloat(giro.value.replace(',', '.')); lft.giro = isFinite(g) ? g : 0; });
      const bl = document.createElement('input'); bl.type = 'checkbox'; bl.checked = lft.bl; bl.addEventListener('change', () => { lft.bl = bl.checked; });
      const generadas = entre.filter(x => !lft.medias.some(z => Math.abs(z - x.cota) < 1e-6)).length;
      det.append(fila('Forma ', seg), fila('Giro total ', giro, ' °'),
        fila('B y L de la caja ', bl),
        nota(`Genera ${generadas} ${generadas === 1 ? 'losa' : 'losas'} entre ${nombreDe(z0)} y ${nombreDe(z1)}. El giro (antihorario, de la losa más baja a la más alta) se reparte con la altura. Con «B y L de la caja», cada losa generada le pasa a la planilla su ancho y su largo; si no, siguen los B y L que tenga.`));
      const hacer = document.createElement('button'); hacer.type = 'button'; hacer.className = 'primario'; hacer.textContent = 'Hacer el loft';
      hacer.addEventListener('click', async () => {
        const p2 = estado.proyecto;
        const l: Loft = { id: nuevoIdLoft(p2), cotas: [n.cota, lft.otra!, ...lft.medias].sort((a, b) => a - b), ...(lft.tipo === 'suave' ? { tipo: 'suave' as const } : {}), ...(lft.giro ? { giro: lft.giro } : {}), ...(lft.bl ? {} : { bl: false }) };
        const pr = problemaLoft(p2, l);
        if (pr) { await avisar('error', 'No se puede hacer el loft', pr); return; }
        // dos lofts no pueden generar la misma losa ni pisarse: cada losa la manda uno solo
        const choca = (p2.lofts ?? []).find(o => { const a = [...o.cotas].sort((x, y) => x - y); return a[0] < z1 - 1e-6 && a[a.length - 1] > z0 + 1e-6; });
        if (choca) { const a = [...choca.cotas].sort((x, y) => x - y); await avisar('error', 'Se pisa con otro loft', `El loft ${choca.id} ya va de ${nombreDe(a[0])} a ${nombreDe(a[a.length - 1])}. Dos lofts pueden compartir una losa extrema, pero no superponerse: quitá ese loft o elegí otras losas.`); return; }
        estado.cambiar(pp => { pp.lofts = [...(pp.lofts ?? []), l]; });
        lft.otra = null; lft.medias = [];
        mensaje(`Loft ${l.id}: ${generadas} ${generadas === 1 ? 'losa generada' : 'losas generadas'} entre ${nombreDe(z0)} y ${nombreDe(z1)}. Miralas en el 3D.`);
        armarPanelSil();
      });
      det.append(hacer);
    }
    // lofts hechos
    (p.lofts ?? []).forEach(l => {
      const a = [...l.cotas].sort((x, y) => x - y), pr = problemaLoft(p, l), { intermedios } = nivelesDeLoft(p, l);
      const caja = document.createElement('div'); caja.className = 'loft-item';
      const t = document.createElement('span');
      t.textContent = `${l.id} · ${a.map(nombreDe).join(' → ')} · ${l.tipo === 'suave' ? 'suave' : 'recto'}${l.giro ? ` · giro ${String(l.giro).replace('.', ',')}°` : ''} · ${intermedios.length} losas${pr ? ` · ⚠ ${pr}` : ''}`;
      const ir = document.createElement('button'); ir.type = 'button'; ir.textContent = 'Ver'; ir.title = 'Ir a la losa más baja del loft';
      ir.addEventListener('click', () => { estado.nivelPlanta = a[0]; dibujar(); });
      const quitar = document.createElement('button'); quitar.type = 'button'; quitar.textContent = 'Quitar';
      quitar.title = 'Saca el loft: las losas que generó quedan con la forma que tienen ahora (como siluetas propias).';
      quitar.addEventListener('click', () => { estado.cambiar(pp => { pp.lofts = (pp.lofts ?? []).filter(o => o.id !== l.id); if (!pp.lofts.length) delete pp.lofts; }); mensaje(`Loft ${l.id} quitado: las losas quedan como estaban.`); armarPanelSil(); });
      const borrar = document.createElement('button'); borrar.type = 'button'; borrar.textContent = 'Quitar y borrar losas';
      borrar.title = 'Saca el loft y borra la silueta, B y L de las losas que generó: vuelven a heredar las de arriba.';
      borrar.addEventListener('click', async () => {
        if (!(await confirmar('Quitar el loft', `Se saca el loft ${l.id} y ${intermedios.length} losas vuelven a heredar la silueta, B y L del nivel de arriba. Se puede deshacer.`, 'Quitar'))) return;
        estado.cambiar(pp => { intermedios.forEach(i => { const nv = pp.niveles[i]; nv.silueta = null; nv.B = null; nv.L = null; }); pp.lofts = (pp.lofts ?? []).filter(o => o.id !== l.id); if (!pp.lofts.length) delete pp.lofts; });
        armarPanelSil();
      });
      caja.append(t, ir, quitar, borrar);
      det.append(caja);
    });
    return det;
  }
  /**
   * esquinas de la torre de una vez: redondeadas, en chaflán o sustraídas, en la losa y/o la carpintería de este nivel
   * o de todos. Cambia la forma que recibe el viento (presiones 3D y túneles), no B y L de la planilla.
   */
  function seccionEsquinas(ancho: number): HTMLElement {
    const det = document.createElement('details'); det.className = 'esquinas-torre'; det.open = esq.abierto;
    det.addEventListener('toggle', () => { esq.abierto = det.open; });
    const sum = document.createElement('summary'); sum.textContent = 'Esquinas de la torre (viento)'; det.append(sum);
    const elegir = <T extends string>(rot: string, ops: [T, string][], val: T, al: (x: T) => void) => {
      const s2 = document.createElement('select');
      ops.forEach(([v, t]) => s2.append(new Option(t, v, false, v === val)));
      s2.addEventListener('change', () => { al(s2.value as T); armarPanelSil(); });
      const l = document.createElement('label'); l.className = 'campo-esq'; l.append(rot, s2); return l;
    };
    const medida = (rot: string, v: number, al: (x: number) => void) => {
      const i = document.createElement('input'); i.type = 'text'; i.inputMode = 'decimal'; i.value = String(v).replace('.', ','); i.className = 'campo-vertice';
      i.addEventListener('change', () => { const x = parseFloat(i.value.replace(',', '.')); if (isFinite(x) && x > 0) al(x); armarPanelSil(); });
      const l = document.createElement('label'); l.className = 'campo-esq'; l.append(rot, i, ' m'); return l;
    };
    const pct = (x: number) => `${((100 * x) / (ancho || 1)).toFixed(0)} % del ancho`;
    det.append(
      elegir<TipoEsquina>('Forma', [['redondeada', 'redondeadas (arco)'], ['chaflan', 'en chaflán (ochava)'], ['sustraida', 'sustraídas (retranqueo)']], esq.tipo, x => { esq.tipo = x; }),
      medida(esq.tipo === 'redondeada' ? 'radio r ' : esq.tipo === 'chaflan' ? 'corte d ' : 'a ', esq.a, x => { esq.a = x; }),
      ...(esq.tipo === 'sustraida' ? [medida('b ', esq.b, x => { esq.b = x; })] : []),
      elegir('Contorno', [['ambas', 'losa y carpintería'], ['losa', 'solo la losa'], ['carpinteria', 'solo la carpintería']], esq.que, x => { esq.que = x; }),
      elegir('Niveles', [['todos', 'todos los niveles'], ['este', 'solo este nivel']], esq.todos ? 'todos' : 'este', x => { esq.todos = x === 'todos'; }),
    );
    const nota = document.createElement('p'); nota.className = 'nota';
    nota.textContent = esq.tipo === 'redondeada'
      ? `r = ${pct(esq.a)}. Como referencia, el Eurocódigo (EN 1991-1-4) baja el arrastre de un prisma cuadrado con el factor ψr = 1 − 2,5·r/b ≥ 0,5: acá ψr ≈ ${psiRedondeo(esq.a, ancho).toFixed(2).replace('.', ',')}.`
      : esq.tipo === 'chaflan'
        ? `d = ${pct(esq.a)}. Ochavas de 5 a 10 % del ancho ya achican el despegue del aire en las esquinas, el arrastre y, sobre todo, la sacudida lateral por los remolinos.`
        : `a × b = ${esq.a} × ${esq.b} m (${pct(esq.a)}). El retranqueo rompe el despegue en dos aristas más chicas y desordena los remolinos: baja la sacudida lateral.`;
    const aplicar = document.createElement('button'); aplicar.type = 'button'; aplicar.className = 'primario'; aplicar.textContent = 'Aplicar a las esquinas salientes';
    aplicar.addEventListener('click', async () => {
      const p2 = estado.proyecto;
      const niveles = esq.todos ? p2.niveles.map((_, k) => k) : [iNivel];
      const r = esquinasEnNiveles(p2, { tipo: esq.tipo, a: esq.a, b: esq.b, que: esq.que, niveles });
      if (!r.cambios.length) { await avisar('error', 'No se cambió ninguna esquina', r.avisos.join(' ') || 'No hay esquinas salientes entre lados rectos.'); return; }
      estado.cambiar(() => { r.cambios.forEach(c => { const nv = estado.proyecto.niveles[c.i]; if (c.que === 'losa') nv.silueta = c.v; else nv.carpinteria = c.v; }); });
      if (r.avisos.length) await avisar('info', 'Esquinas tratadas, con avisos', r.avisos.join(' '));
    });
    const pie = document.createElement('p'); pie.className = 'nota';
    pie.textContent = 'Se tratan las esquinas salientes entre lados rectos (las entrantes y las curvas quedan). Se puede deshacer. Cambia la forma que recibe el viento en las presiones 3D y en los túneles 2D y 3D (ahí se comparan el arrastre, la fuerza lateral y la velocidad crítica); la planilla y el CIRSOC 102 siguen con B, L y los Cp de la norma, que no premian la forma de las esquinas (eso pide un ensayo en túnel de viento).';
    det.append(nota, aplicar, pie);
    return det;
  }
  // biblioteca de piezas tipo: se eligen forma y medidas, se ve su J y se ubica con un clic en la planta
  const bIns = document.createElement('button');
  bIns.type = 'button'; bIns.textContent = 'Insertar…';
  bIns.title = 'Piezas tipo (tabique, L, T, C, U, doble T, núcleo, columna) con sus medidas y su J; se ubican con un clic y quedan agrupadas.';
  bIns.addEventListener('click', () => ponerModo(modo === 'insertar' ? 'mover' : 'insertar'));
  const panelIns = document.createElement('div');
  panelIns.className = 'calco-panel piezas-panel';
  panelIns.hidden = true;
  cont.appendChild(panelIns);
  // calar: vanos en tabiques y núcleos (puertas con dintel o huecos de toda la altura)
  const bCalar = document.createElement('button');
  bCalar.type = 'button'; bCalar.textContent = 'Calar';
  bCalar.title = 'Abrir un vano en un tabique o en una cara de un núcleo: tocá el muro donde va el vano. Puerta con dintel (los dos tramos siguen trabajando juntos) o hueco de toda la altura.';
  bCalar.addEventListener('click', () => ponerModo(modo === 'calar' ? 'mover' : 'calar'));
  const bLazo = document.createElement('button');
  bLazo.type = 'button'; bLazo.textContent = 'Lazo';
  bLazo.title = 'Elegir varios dibujando un lazo alrededor (entra todo muro con el centro adentro; un grupo, si entra entero). Mayúsculas: suma a lo elegido · Alt: saca. También: Mayúsculas + arrastrar el fondo en «Mover». Supr borra lo elegido.';
  bLazo.addEventListener('click', () => ponerModo(modo === 'lazo' ? 'mover' : 'lazo'));
  const panelCal = document.createElement('div');
  panelCal.className = 'calco-panel piezas-panel calar-panel';
  panelCal.hidden = true;
  cont.appendChild(panelCal);
  let calAncho = 0.9, calTipo: 'puerta' | 'ventana' | 'hueco' = 'puerta', calAlto = 2.1, calAntepecho = 0.9;
  /** entrepiso más chico donde está el elemento (para que la abertura deje dintel en todos los pisos) */
  const entrepisoMin = (m: Muro) => {
    const p = estado.proyecto, zF = p.niveles.at(-1)?.cota ?? 0, zT = p.niveles[0]?.cota ?? 0;
    const zs = p.niveles.map(n => n.cota).filter(z => z >= Math.max(0, m.zDesde ?? zF) - 1e-6 && z <= (m.zHasta ?? zT) + 1e-6).sort((a, b) => a - b);
    let h = Infinity; for (let i = 0; i + 1 < zs.length; i++) h = Math.min(h, zs[i + 1] - zs[i]);
    return isFinite(h) ? h : 3;
  };
  /** polígono de la abertura en planta (el hueco en el espesor del elemento), para marcarla */
  const marcasAbertura = (m: Muro, a: Abertura): Punto[][] => {
    const t = tipoDe(m);
    if (t === 'tubo-circ') {
      const R = m.largo / 2, r = dInterior(m) / 2, rm = (R + r) / 2 || R / 2, c = (a.s * Math.PI) / 180, w = a.ancho / rm;
      const n = 10, ext = Array.from({ length: n + 1 }, (_, i) => { const th = c - w / 2 + (w * i) / n; return { x: m.x + R * Math.cos(th), y: m.y + R * Math.sin(th) }; });
      const int = Array.from({ length: n + 1 }, (_, i) => { const th = c + w / 2 - (w * i) / n; return { x: m.x + r * Math.cos(th), y: m.y + r * Math.sin(th) }; });
      return [[...ext, ...int]];
    }
    const e = t === 'tubo-rect' ? Math.min(m.espesor, m.largo / 2, (m.ladoY ?? m.largo) / 2) : m.espesor;
    const caja = (cx: number, cy: number, ax: number, ay: number) => [{ x: cx - ax / 2, y: cy - ay / 2 }, { x: cx + ax / 2, y: cy - ay / 2 }, { x: cx + ax / 2, y: cy + ay / 2 }, { x: cx - ax / 2, y: cy + ay / 2 }];
    if (t === 'tabique') return [m.dir === 'X' ? caja(m.x + a.s, m.y, a.ancho, e) : caja(m.x, m.y + a.s, e, a.ancho)];
    if (t === 'tubo-rect') {
      const B = m.largo, H = m.ladoY ?? m.largo;
      switch (a.cara ?? 'y-') {
        case 'y+': return [caja(m.x + a.s, m.y + H / 2 - e / 2, a.ancho, e)];
        case 'y-': return [caja(m.x + a.s, m.y - H / 2 + e / 2, a.ancho, e)];
        case 'x+': return [caja(m.x + B / 2 - e / 2, m.y + a.s, e, a.ancho)];
        case 'x-': return [caja(m.x - B / 2 + e / 2, m.y + a.s, e, a.ancho)];
      }
    }
    return [];
  };
  /** la abertura que se pondría tocando el elemento en q (null si el elemento no se puede calar así) */
  const aberturaEn = (m: Muro, q: Punto): Abertura | null => {
    const u = ubicarAbertura(m, q); if (!u) return null;
    const a: Abertura = { s: +u.s.toFixed(3), ancho: calAncho, desde: calTipo === 'ventana' ? calAntepecho : 0, alto: calAlto, ...(u.cara ? { cara: u.cara } : {}) };
    const k = caraAbertura(m, a); if (k) a.s = +aGuia(k, a.s, a.ancho).toFixed(3);
    return a;
  };
  /** abertura elegida en «Calar» (se mueve, cambia o quita), vano calado elegido (se cierra) y arrastre de la abertura */
  let abSel: { id: string; i: number } | null = null, vanoSel: string | null = null;
  let arrAb: { id: string; i: number; s0: number; q0: number; movio: boolean } | null = null;
  type Cara = { o: Punto; u: Punto; n: Punto; L: number; e: number };
  /** la cara recta donde está la abertura: centro, dirección a lo largo, normal hacia afuera, largo y espesor (null en el tubo circular) */
  const caraAbertura = (m: Muro, a: Abertura): Cara | null => {
    const t = tipoDe(m);
    if (t === 'tabique') return { o: { x: m.x, y: m.y }, u: m.dir === 'X' ? { x: 1, y: 0 } : { x: 0, y: 1 }, n: m.dir === 'X' ? { x: 0, y: 1 } : { x: -1, y: 0 }, L: m.largo, e: m.espesor };
    if (t === 'tubo-rect') {
      const B = m.largo, H = m.ladoY ?? m.largo, e = Math.min(m.espesor, B / 2, H / 2);
      switch (a.cara ?? 'y-') {
        case 'y+': return { o: { x: m.x, y: m.y + H / 2 - e / 2 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, L: B, e };
        case 'y-': return { o: { x: m.x, y: m.y - H / 2 + e / 2 }, u: { x: 1, y: 0 }, n: { x: 0, y: -1 }, L: B, e };
        case 'x+': return { o: { x: m.x + B / 2 - e / 2, y: m.y }, u: { x: 0, y: 1 }, n: { x: 1, y: 0 }, L: H - 2 * e, e };
        case 'x-': return { o: { x: m.x - B / 2 + e / 2, y: m.y }, u: { x: 0, y: 1 }, n: { x: -1, y: 0 }, L: H - 2 * e, e };
      }
    }
    return null;
  };
  const sobreCara = (k: Cara, q: Punto) => (q.x - k.o.x) * k.u.x + (q.y - k.o.y) * k.u.y;
  const fm = (v: number) => v.toFixed(2).replace('.', ',');
  /**
   * referencias para acotar una abertura sobre su cara: las guías que la cruzan (botón «Cotas e imán a las guías») y
   * los bordes de las otras aberturas de la misma cara. La cota de cada lado va a la más cercana (o al borde del muro).
   */
  type Ref = { s: number; nombre: string; tipo: 'guia' | 'calado' };
  let calGuias = (() => { try { return localStorage.getItem('torre3d.calarGuias') !== 'no'; } catch { return true; } })();
  const refsGuia = (k: Cara): Ref[] => (calGuias && opGuias.ver ? crucesSobre(estado.proyecto.guias ?? [], k.o, k.u, -k.L / 2 + 1e-6, k.L / 2 - 1e-6).map(x => ({ ...x, tipo: 'guia' as const })) : []);
  const refsCalados = (m: Muro, cara: string | undefined, sin?: number): Ref[] => (m.aberturas ?? []).flatMap((b, j) => (j === sin || (b.cara ?? 'y-') !== (cara ?? 'y-') ? [] :
    [{ s: b.s - b.ancho / 2, nombre: 'abertura', tipo: 'calado' as const }, { s: b.s + b.ancho / 2, nombre: 'abertura', tipo: 'calado' as const }]));
  /** la referencia más cercana de cada lado de la abertura [c0, c1] (sin contar las que coinciden con el borde) */
  const vecinas = (refs: Ref[], c0: number, c1: number) => ({
    izq: refs.filter(r => r.s <= c0 - 0.005).sort((a, b) => b.s - a.s)[0] as Ref | undefined,
    der: refs.filter(r => r.s >= c1 + 0.005).sort((a, b) => a.s - b.s)[0] as Ref | undefined,
  });
  const nombreRef = (r: Ref) => (r.nombre === 'abertura' ? 'la otra abertura' : r.nombre === 'guía' ? 'la guía' : `el ${r.nombre}`);
  /** imán de las guías: un borde o el centro de la abertura (ancho w, centro s) cae sobre la guía más cercana */
  const aGuia = (k: Cara, s0: number, w: number): number => {
    let mejor = s0, d = tolPx() / escala;
    refsGuia(k).forEach(r => [r.s + w / 2, r.s - w / 2, r.s].forEach(c => { if (Math.abs(c - s0) < d) { d = Math.abs(c - s0); mejor = c; } }));
    return mejor;
  };
  /** el hueco de toda la altura que se calaría tocando w en q: la cara (en un núcleo, la más cercana), su centro y si entra */
  const huecoPrevio = (w: Muro, q: Punto) => {
    const caras = tipoDe(w) === 'tubo-rect' ? tuboEnTabiques(w, (() => { let k = 0; return () => `__${k++}`; })()) : [w];
    const dist = (c: Muro) => (c.dir === 'X' ? Math.abs(q.y - c.y) + Math.max(0, Math.abs(q.x - c.x) - c.largo / 2) : Math.abs(q.x - c.x) + Math.max(0, Math.abs(q.y - c.y) - c.largo / 2));
    const c = [...caras].sort((a2, b2) => dist(a2) - dist(b2))[0];
    const sc = c.dir === 'X' ? c.x : c.y, s0 = sc - c.largo / 2;
    const kc: Cara = { o: { x: c.x, y: c.y }, u: c.dir === 'X' ? { x: 1, y: 0 } : { x: 0, y: 1 }, n: c.dir === 'X' ? { x: 0, y: 1 } : { x: -1, y: 0 }, L: c.largo, e: c.espesor };
    const sq = aGuia(kc, (c.dir === 'X' ? q.x : q.y) - sc, calAncho) + sc;
    const cen = Math.min(s0 + c.largo - 0.1 - calAncho / 2, Math.max(s0 + 0.1 + calAncho / 2, sq));
    return { c, kc, sc, cen, ok: calAncho <= c.largo - 0.2, refs: [...refsGuia(kc), ...(tipoDe(w) === 'tabique' ? refsCalados(w, undefined) : [])] };
  };
  /** cotas de una abertura sobre su cara: del borde del elemento a la abertura, el ancho y de la abertura al otro borde */
  const dibCotasCara = (X: (x: number) => number, Y: (y: number) => number, escala: number, k: Cara, c0: number, c1: number, cls: string, refs: Ref[] = []) => {
    const g = el('g', { class: `cota cotas-vano ${cls}` });
    const P = (s2: number, d: number) => ({ x: k.o.x + k.u.x * s2 + k.n.x * d, y: k.o.y + k.u.y * s2 + k.n.y * d });
    const d0 = k.e / 2 + 2 / escala, d1 = k.e / 2 + 20 / escala, vert = !k.u.x;
    const ln = (a: Punto, b: Punto, c: string) => g.appendChild(el('line', { x1: X(a.x), y1: Y(a.y), x2: X(b.x), y2: Y(b.y), class: c }));
    // de cada lado, hasta la guía o la otra abertura más cercana; si no hay, hasta el borde del muro
    const { izq, der } = vecinas(refs, c0, c1);
    const marcas = [izq ? izq.s : -k.L / 2, c0, c1, der ? der.s : k.L / 2];
    const refDe = [izq, undefined, undefined, der];
    marcas.forEach((s2, j) => ln(P(s2, d0), P(s2, d1 + 4 / escala), 'cota-ext' + (refDe[j] ? ` ${refDe[j]!.tipo}` : '')));
    // un borde (o el centro) justo sobre una guía: se nombra del otro lado del muro
    refs.filter(r => r.tipo === 'guia').forEach(r => {
      const sobre = Math.abs(r.s - c0) < 0.005 ? 'borde' : Math.abs(r.s - c1) < 0.005 ? 'borde' : Math.abs(r.s - (c0 + c1) / 2) < 0.005 ? 'centro' : '';
      if (!sobre) return;
      const t = P(r.s, -(k.e / 2 + 12 / escala)), tx = X(t.x), ty = Y(t.y);
      g.appendChild(el('text', { x: tx, y: ty, class: 'cota-txt en-guia', 'text-anchor': 'middle', 'dominant-baseline': 'central', ...(vert ? { transform: `rotate(-90 ${tx} ${ty})` } : {}) }, `${sobre} en ${r.nombre}`));
    });
    for (let i = 0; i < 3; i++) {
      const v = marcas[i + 1] - marcas[i]; if (v < 0.005) continue;
      ln(P(marcas[i], d1), P(marcas[i + 1], d1), 'cota-lin');
      [marcas[i], marcas[i + 1]].forEach(s2 => { const q = P(s2, d1); g.appendChild(el('line', { x1: X(q.x) - 3.5, y1: Y(q.y) + 3.5, x2: X(q.x) + 3.5, y2: Y(q.y) - 3.5, class: 'cota-marca' })); });
      // tramo corto: el número va afuera (antes del primero, después del último) o una fila más afuera (el ancho)
      const corto = v * escala < 36, med = (marcas[i] + marcas[i + 1]) / 2;
      const t = !corto ? P(med, d1 + 9 / escala) : i === 0 ? P(marcas[0] - 6 / escala, d1) : i === 2 ? P(marcas[3] + 6 / escala, d1) : P(med, d1 + 24 / escala), tx = X(t.x), ty = Y(t.y);
      const ref = i === 0 ? izq : i === 2 ? der : undefined;
      g.appendChild(el('text', { x: tx, y: ty, class: 'cota-txt' + (i === 1 ? ' cota-ancho' : '') + (ref ? ` ${ref.tipo}` : ''), 'text-anchor': !corto || i === 1 ? 'middle' : i === 0 ? 'end' : 'start', 'dominant-baseline': 'central', ...(vert ? { transform: `rotate(-90 ${tx} ${ty})` } : {}) }, ref ? `${fm(v)} · ${ref.nombre}` : fm(v)));
    }
    return g;
  };
  /** la abertura bajo el punto (en el piso que se ve) */
  const aberturaBajo = (q: Punto, zN: number): { id: string; i: number } | null => {
    const p = estado.proyecto, zF = p.niveles.at(-1)?.cota ?? 0, zT = p.niveles[0]?.cota ?? 0;
    for (const m of p.muros) {
      if (!m.aberturas?.length || !presenteEn(m, zN, zF, zT) || muroOculto(p, m)) continue;
      for (let i = 0; i < m.aberturas.length; i++) if (marcasAbertura(m, m.aberturas[i]).some(pg => dentroPol(q, pg))) return { id: m.id, i };
    }
    return null;
  };
  /** el vano calado (hueco entre dos tramos) bajo el punto: devuelve el tramo que guarda el vano */
  const vanoBajo = (q: Punto): string | null => {
    const p = estado.proyecto;
    for (const m of p.muros) {
      const o = m.vano && p.muros.find(x => x.id === m.vano!.con); if (!o) continue;
      const a = (m.dir === 'X' ? m.x : m.y) + m.largo / 2, b = (o.dir === 'X' ? o.x : o.y) - o.largo / 2;
      const s2 = m.dir === 'X' ? q.x : q.y, d = m.dir === 'X' ? q.y - m.y : q.x - m.x;
      if (s2 >= Math.min(a, b) - 0.05 && s2 <= Math.max(a, b) + 0.05 && Math.abs(d) <= m.espesor / 2 + 0.1) return m.id;
    }
    return null;
  };
  /** quita la abertura elegida o cierra el vano elegido */
  const quitarCalado = () => {
    if (abSel) {
      const { id, i } = abSel; abSel = null;
      estado.cambiar(pp => { const w = pp.muros.find(o => o.id === id); if (w) { w.aberturas = (w.aberturas ?? []).filter((_, k) => k !== i); if (!w.aberturas.length) delete w.aberturas; } });
      mensaje(`${id}: abertura quitada. Ctrl+Z deshace.`); armarPanelCal(); return true;
    }
    if (vanoSel) {
      const r = cerrarVano(estado.proyecto.muros, vanoSel); vanoSel = null;
      if ('error' in r) mensaje(`No se pudo cerrar el vano: ${r.error}.`);
      else { estado.cambiar(() => { estado.proyecto.muros = r.muros; }); mensaje(`Vano cerrado: ${r.id} vuelve a ser un solo muro. Ctrl+Z deshace.`); }
      armarPanelCal(); return true;
    }
    return false;
  };
  /** calar un muro o la losa (huecos de ascensor, escalera); hueco de losa en dibujo y elegido */
  let calQue: 'muro' | 'losa' = 'muro', losaIni: Punto | null = null, cursorLosa: Punto | null = null, huecoSel: string | null = null;
  const rectHueco = (a: Punto, b: Punto) => [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }].map(q => ({ x: +q.x.toFixed(3), y: +q.y.toFixed(3) }));
  let previaCalar: { id: string; q: Punto } | null = null;
  function armarPanelCal() {
    panelCal.replaceChildren();
    const que = document.createElement('div'); que.className = 'seg seg-chico'; que.setAttribute('role', 'group');
    ([['muro', 'Muro (vano)'], ['losa', 'Losa (hueco)']] as const).forEach(([k, t]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.setAttribute('aria-pressed', String(calQue === k));
      b.addEventListener('click', () => { calQue = k; losaIni = null; huecoSel = null; armarPanelCal(); dibujar(); }); que.append(b);
    });
    if (calQue === 'losa') { armarPanelHueco(que); return; }
    const tit = document.createElement('b'); tit.textContent = 'Calar un vano';
    const seg = document.createElement('div'); seg.className = 'seg seg-chico'; seg.setAttribute('role', 'group');
    ([['puerta', 'Puerta', ''], ['ventana', 'Ventana', ''], ['hueco', 'Toda la altura', 'Hueco a toda la altura (sin dintel)']] as const).forEach(([k, t, tt]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = t; if (tt) b.title = tt; b.setAttribute('aria-pressed', String(calTipo === k));
      b.addEventListener('click', () => { if (k !== calTipo) calAlto = k === 'ventana' ? 1.2 : 2.1; calTipo = k; armarPanelCal(); dibujar(); }); seg.append(b);
    });
    const campoC = (etq: string, v: number, f: (x: number) => void) => {
      const l = document.createElement('label'); l.className = 'fila-vertices';
      // con coma, como el resto de la app (el campo numérico del navegador muestra punto)
      const i = document.createElement('input'); i.type = 'text'; i.inputMode = 'decimal'; i.value = fm(v); i.className = 'campo-vertice';
      i.addEventListener('change', () => { const x = parseFloat(i.value.replace(',', '.')); if (x >= 0) { f(+x.toFixed(2)); dibujar(); } else i.value = fm(v); });
      l.append(etq, ' ', i, ' m'); return l;
    };
    const filas: HTMLElement[] = [campoC('ancho', calAncho, x => { if (x > 0) calAncho = x; })];
    if (calTipo !== 'hueco') filas.push(campoC('alto', calAlto, x => { if (x > 0) calAlto = x; }));
    if (calTipo === 'ventana') filas.push(campoC('antepecho', calAntepecho, x => { calAntepecho = x; }));
    const ayuda = document.createElement('span');
    ayuda.textContent = calTipo === 'puerta'
      ? 'Puerta en cada piso, desde el piso hasta el alto elegido. El elemento sigue entero (se ve completo en la planta) y arriba queda el dintel; el cálculo usa el J de la sección más débil, el corte por la puerta.'
      : calTipo === 'ventana'
        ? 'Ventana en cada piso, con antepecho abajo y dintel arriba. El elemento sigue entero; el cálculo usa el J del corte por la ventana.'
        : 'Abertura de toda la altura (sin dintel): en un tabique suelto, cada tramo pasa a ser una pieza que trabaja sola; en un núcleo, la sección queda abierta (C).';
    const como = document.createElement('span'); como.textContent = calTipo === 'hueco'
      ? 'Tocá el muro donde va el vano. Un núcleo se pasa a sus cuatro tabiques y se cala la cara tocada. Deshacer: Ctrl+Z.'
      : 'Tocá el tabique, la cara del núcleo o el tubo circular donde va la abertura. Para moverla o sacarla: tocala. Deshacer: Ctrl+Z.';
    // cotas e imán a las guías (y siempre, la distancia a la abertura más cercana del mismo muro)
    const nG = (estado.proyecto.guias ?? []).length;
    const bG = document.createElement('button'); bG.type = 'button'; bG.textContent = 'Cotas e imán a las guías'; bG.setAttribute('aria-pressed', String(calGuias));
    bG.title = 'Las cotas de la abertura van hasta la guía más cercana que cruza el muro (si no, hasta el borde), y al ponerla o arrastrarla un borde o el centro se pega a las guías. La distancia a la otra abertura del mismo muro se acota siempre.';
    bG.addEventListener('click', () => { calGuias = !calGuias; try { localStorage.setItem('torre3d.calarGuias', calGuias ? 'si' : 'no'); } catch { /* sin almacenamiento */ } armarPanelCal(); dibujar(); });
    const filaG = document.createElement('div'); filaG.className = 'fila-vertices'; filaG.append(bG);
    if (calGuias && !nG) { const sp = document.createElement('span'); sp.className = 'nota-chica'; sp.textContent = 'no hay guías: armalas en «Guías»'; filaG.append(sp); }
    else if (calGuias && !opGuias.ver) { const sp = document.createElement('span'); sp.className = 'nota-chica'; sp.textContent = 'las guías están ocultas («Guías» → ver guías)'; filaG.append(sp); }
    // la ayuda larga, plegada: el cuadro tapaba media planta (justo donde va el vano)
    const det = document.createElement('details'); det.className = 'calar-ayuda';
    const sum = document.createElement('summary'); sum.textContent = '¿Cómo se usa?';
    det.append(sum, ayuda, como);
    const corto = document.createElement('span'); corto.textContent = calTipo === 'hueco' ? 'Tocá el muro donde va el vano.' : 'Tocá el muro donde va la abertura; tocá una hecha para moverla o sacarla.';
    panelCal.append(tit, que, seg, ...filas, filaG, corto, det);
    // lo elegido: la abertura (mover, medidas, quitar) o el vano de toda la altura (cerrar)
    const p = estado.proyecto;
    const mkE = <K extends keyof HTMLElementTagNameMap>(t: K, txt = '', cls = '') => { const e = document.createElement(t); if (txt) e.textContent = txt; if (cls) e.className = cls; return e; };
    const w = abSel && p.muros.find(x => x.id === abSel!.id), a = w && w.aberturas?.[abSel!.i];
    if (abSel && !a) abSel = null;
    if (w && a) {
      const k = caraAbertura(w, a), i = abSel!.i;
      const caja = mkE('div', '', 'calar-elegido');
      caja.append(mkE('b', `${a.desde > 1e-6 ? 'Ventana' : 'Puerta'} en ${w.id}${a.cara ? ` (cara ${a.cara})` : ''}`));
      const cambiarAb = (f: (o: Abertura) => void, inp: HTMLInputElement, v: number) => {
        const nueva = { ...a }; f(nueva);
        const err = problemaAbertura({ ...w, aberturas: [...(w.aberturas ?? []).filter((_, q) => q !== i), nueva] }, nueva, entrepisoMin(w));
        if (err) { mensaje(`${w.id}: ${err}.`); inp.value = fm(v); return; }
        estado.cambiar(pp => { const x = pp.muros.find(o => o.id === w.id); if (x?.aberturas) x.aberturas[i] = nueva; }); armarPanelCal();
      };
      const campo = (etq: string, v: number, f: (o: Abertura, x: number) => void, tit2 = '') => {
        const l = mkE('label', '', 'fila-vertices'); if (tit2) l.title = tit2; const inp = mkE('input'); inp.type = 'text'; inp.inputMode = 'decimal'; inp.className = 'campo-vertice'; inp.value = fm(v);
        inp.addEventListener('change', () => { const x = Number(inp.value.replace(',', '.')); if (!isFinite(x) || x < 0) { inp.value = fm(v); return; } cambiarAb(o => f(o, +x.toFixed(3)), inp, v); });
        l.append(etq, ' ', inp, ' m'); return l;
      };
      if (k) {
        const ini = a.s - a.ancho / 2 + k.L / 2, fin = k.L / 2 - a.s - a.ancho / 2;
        caja.append(campo(k.u.x ? 'desde el borde izq.' : 'desde el borde de abajo', ini, (o, x) => { o.s = +(x + o.ancho / 2 - k.L / 2).toFixed(3); }, 'Distancia del borde del elemento al borde de la abertura'),
          campo(k.u.x ? 'hasta el borde der.' : 'hasta el borde de arriba', fin, (o, x) => { o.s = +(k.L / 2 - x - o.ancho / 2).toFixed(3); }));
        // y a la guía o la otra abertura más cercana de cada lado
        const { izq, der } = vecinas([...refsGuia(k), ...refsCalados(w, a.cara, i)], a.s - a.ancho / 2, a.s + a.ancho / 2);
        if (izq) caja.append(campo(`desde ${nombreRef(izq)} (${k.u.x ? 'izq.' : 'abajo'})`, a.s - a.ancho / 2 - izq.s, (o, x) => { o.s = +(izq.s + x + o.ancho / 2).toFixed(3); }));
        if (der) caja.append(campo(`hasta ${nombreRef(der)} (${k.u.x ? 'der.' : 'arriba'})`, der.s - a.s - a.ancho / 2, (o, x) => { o.s = +(der.s - x - o.ancho / 2).toFixed(3); }));
      }
      caja.append(campo('ancho', a.ancho, (o, x) => { o.ancho = x; }), campo('alto', a.alto, (o, x) => { o.alto = x; }));
      if (a.desde > 1e-6) caja.append(campo('antepecho', a.desde, (o, x) => { o.desde = x; }));
      const bq = mkE('button', 'Quitar la abertura', 'peligro'); bq.type = 'button'; bq.title = 'También: Supr'; bq.addEventListener('click', () => quitarCalado());
      const bs = mkE('button', 'Soltar'); bs.type = 'button'; bs.addEventListener('click', () => { abSel = null; armarPanelCal(); dibujar(); });
      caja.append(mkE('span', 'Arrastrala para moverla a lo largo del muro: las cotas muestran dónde queda.', 'nota-chica'), bq, bs);
      panelCal.append(caja);
    }
    const vm = vanoSel && p.muros.find(x => x.id === vanoSel), vo = vm && vm.vano && p.muros.find(x => x.id === vm.vano!.con);
    if (vanoSel && !vo) vanoSel = null;
    if (vm && vo) {
      const caja = mkE('div', '', 'calar-elegido');
      const bq = mkE('button', 'Cerrar el vano (unir los tramos)', 'peligro'); bq.type = 'button'; bq.title = 'Los dos tramos vuelven a ser un solo muro. También: Supr'; bq.addEventListener('click', () => quitarCalado());
      const bs = mkE('button', 'Soltar'); bs.type = 'button'; bs.addEventListener('click', () => { vanoSel = null; armarPanelCal(); dibujar(); });
      caja.append(mkE('b', `Vano de ${fm(vm.vano!.ancho)} m entre ${vm.id} y ${vo.id}`), bq, bs);
      panelCal.append(caja);
    }
  }
  /** panel de los huecos de la losa: cómo se dibujan y las medidas del elegido */
  function armarPanelHueco(que: HTMLElement) {
    const p = estado.proyecto;
    const mk = <K extends keyof HTMLElementTagNameMap>(t: K, txt = '', cls = '') => { const e = document.createElement(t); if (txt) e.textContent = txt; if (cls) e.className = cls; return e; };
    const tit = mk('b', 'Calar la losa');
    panelCal.append(tit, que, mk('span', losaIni ? 'Tocá la esquina opuesta del hueco.' : 'Tocá dos esquinas del hueco (ascensor, escalera, pleno). Ahí no hay losa: no carga a los muros vecinos. Tocá un hueco para cambiar sus medidas.'));
    const h = (p.huecosLosa ?? []).find(x => x.id === huecoSel);
    if (h) {
      const xs = h.v.map(q => q.x), ys = h.v.map(q => q.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const cambiar = (f: (x: HuecoLosa) => void) => { estado.cambiar(pp => { const x = (pp.huecosLosa ?? []).find(y => y.id === h.id); if (x) f(x); }); armarPanelCal(); };
      const campo = (etq: string, v: number, f: (x: number) => void) => { const l = mk('label', '', 'fila-vertices'); const i = mk('input'); i.type = 'text'; i.inputMode = 'decimal'; i.className = 'campo-vertice'; i.value = v.toFixed(2).replace('.', ','); i.addEventListener('change', () => { const x = Number(i.value.replace(',', '.')); if (isFinite(x)) f(x); }); l.append(etq, ' ', i, ' m'); return l; };
      const nom = mk('input'); nom.type = 'text'; nom.value = h.nombre; nom.addEventListener('change', () => cambiar(x => { x.nombre = nom.value.trim() || x.nombre; }));
      const ln = mk('label', '', 'fila-vertices'); ln.append('nombre ', nom);
      const ponerCaja = (a: number, b: number, c: number, d: number) => cambiar(x => { x.v = rectHueco({ x: a, y: c }, { x: b, y: d }); });
      const niv = (etq: string, val: number | null | undefined, vacio: string, f: (z: number | null) => void) => {
        const l = mk('label', '', 'fila-vertices'), sl = mk('select'); sl.append(new Option(vacio, ''), ...p.niveles.map(n => new Option(n.nombre, String(n.cota))));
        sl.value = val === null || val === undefined ? '' : String(val); sl.addEventListener('change', () => f(sl.value === '' ? null : Number(sl.value))); l.append(etq, ' ', sl); return l;
      };
      const borrar = mk('button', 'Borrar el hueco'); borrar.type = 'button'; borrar.title = 'También: Supr';
      borrar.addEventListener('click', () => { estado.cambiar(pp => { pp.huecosLosa = (pp.huecosLosa ?? []).filter(x => x.id !== h.id); }); huecoSel = null; armarPanelCal(); mensaje('Hueco de losa borrado.'); });
      panelCal.append(mk('b', `Hueco «${h.nombre}»`), ln,
        campo('ancho (x)', x1 - x0, v => { if (v > 0.05) ponerCaja((x0 + x1) / 2 - v / 2, (x0 + x1) / 2 + v / 2, y0, y1); }),
        campo('alto (y)', y1 - y0, v => { if (v > 0.05) ponerCaja(x0, x1, (y0 + y1) / 2 - v / 2, (y0 + y1) / 2 + v / 2); }),
        campo('centro x', (x0 + x1) / 2, v => ponerCaja(v - (x1 - x0) / 2, v + (x1 - x0) / 2, y0, y1)),
        campo('centro y', (y0 + y1) / 2, v => ponerCaja(x0, x1, v - (y1 - y0) / 2, v + (y1 - y0) / 2)),
        niv('desde', h.zDesde, 'el primer piso', z => cambiar(x => { x.zDesde = z; })), niv('hasta', h.zHasta, 'la azotea', z => cambiar(x => { x.zHasta = z; })), borrar);
    }
    const n = p.huecosLosa?.length ?? 0;
    if (n) panelCal.append(mk('span', `${n} hueco${n > 1 ? 's' : ''} en la losa. Para que las áreas de los muros sigan los huecos: «Áreas» → «al día».`, 'nota-chica'));
  }
  const NS2 = 'http://www.w3.org/2000/svg';
  /** dibujito de la pieza (en su marco: el viento A sube) */
  const miniatura = (t: TipoPieza, med: MedidasPieza, tam: number) => {
    const s2 = document.createElementNS(NS2, 'svg');
    s2.setAttribute('viewBox', `0 0 ${tam} ${tam}`); s2.setAttribute('width', String(tam)); s2.setAttribute('height', String(tam));
    const ms = piezaTipo(t, med, 0, 0, new Set());
    const rs = ms.flatMap(m => (tipoDe(m) === 'tubo-circ' ? [] : rectangulos(m)));
    const ext = Math.max(0.5, ...rs.map(r => Math.max(Math.abs(r.x) + r.ax / 2, Math.abs(r.y) + r.ay / 2)), ...ms.filter(m => tipoDe(m) === 'tubo-circ').map(m => m.largo / 2));
    const k = (tam / 2 - 4) / ext;
    rs.forEach(r => { const q = document.createElementNS(NS2, 'rect'); q.setAttribute('x', String(tam / 2 + (r.x - r.ax / 2) * k)); q.setAttribute('y', String(tam / 2 - (r.y + r.ay / 2) * k)); q.setAttribute('width', String(Math.max(1.5, r.ax * k))); q.setAttribute('height', String(Math.max(1.5, r.ay * k))); s2.append(q); });
    ms.filter(m => tipoDe(m) === 'tubo-circ').forEach(m => { const q = document.createElementNS(NS2, 'circle'); q.setAttribute('cx', String(tam / 2)); q.setAttribute('cy', String(tam / 2)); q.setAttribute('r', String((m.largo / 2) * k)); s2.append(q); });
    return s2;
  };
  function armarPanelIns() {
    panelIns.replaceChildren();
    const tit = document.createElement('b'); tit.textContent = 'Insertar pieza';
    const formas = document.createElement('div'); formas.className = 'formas';
    TIPOS.forEach(t => {
      const b = document.createElement('button'); b.type = 'button'; b.title = `${t.nombre}: ${t.ayuda}`;
      b.setAttribute('aria-pressed', String(t.tipo === insTipo));
      b.append(miniatura(t.tipo, { ...insMed, giro: 0, h: 4, b: t.tipo === 'núcleo' ? 3 : t.tipo === 'pórtico' ? 0.7 : 2, e: t.tipo === 'columna' ? 2 : t.tipo === 'tubo circ.' ? 0.6 : t.tipo === 'pórtico' ? 0.7 : 0.3 }, 30));
      const sp = document.createElement('span'); sp.textContent = t.nombre; b.append(sp);
      b.addEventListener('click', () => { const antes = insTipo; insTipo = t.tipo; if (t.tipo === 'columna') { insMed.h = 0.6; insMed.e = 0.3; } else if (t.tipo === 'tubo circ.') { insMed.h = 3; insMed.e = 0.25; } else if (t.tipo === 'pórtico') { insMed.h = 6; insMed.b = 0.6; insMed.e = 0.4; } else if (insMed.h < 1 || antes === 'pórtico') { insMed.h = 4; insMed.b = 2; insMed.e = 0.2; } armarPanelIns(); dibujar(); });
      formas.append(b);
    });
    const info = TIPOS.find(t => t.tipo === insTipo)!;
    const campo = (t: string, k: 'h' | 'b' | 'e', ayuda: string) => {
      const l = document.createElement('label'); l.title = ayuda;
      const i = document.createElement('input'); i.type = 'number'; i.step = k === 'e' ? '0.05' : '0.1'; i.min = '0.05'; i.value = String(insMed[k]);
      i.addEventListener('input', () => { const v = Number(i.value); if (v > 0) { insMed[k] = v; actualizar(); dibujar(); } });
      l.append(t, i); return l;
    };
    const giro = document.createElement('label'); giro.append('giro');
    const sg = document.createElement('select');
    [0, 90, 180, 270].forEach(g => { const o = document.createElement('option'); o.value = String(g); o.textContent = `${g}°`; sg.append(o); });
    sg.value = String(insMed.giro);
    sg.addEventListener('change', () => { insMed.giro = Number(sg.value) as MedidasPieza['giro']; actualizar(); dibujar(); });
    giro.append(sg);
    const vista = document.createElement('div'); vista.className = 'vista-pieza';
    const datos = document.createElement('div'); datos.className = 'datos-pieza';
    const ayuda = document.createElement('p'); ayuda.className = 'nota chica'; ayuda.textContent = `${info.ayuda} Hacé clic en la planta para ubicarla (el centro de la pieza va donde hacés clic). Después, doble clic en la pieza para cambiar sus medidas (alma y cada ala por separado). Esc: salir.`;
    const actualizar = () => {
      vista.replaceChildren(miniatura(insTipo, insMed, 96));
      const ms = piezaTipo(insTipo, insMed, 0, 0, new Set());
      const f = (x: number) => x.toLocaleString('es-AR', { maximumFractionDigits: 3 });
      datos.replaceChildren(datoPieza('J viento A (↑) ', f(Jreal(ms, 'A')), ' m⁴'), datoPieza('J viento B (→) ', f(Jreal(ms, 'B')), ' m⁴'),
        datoPieza('área ', f(ms.reduce((q, m) => q + (tipoDe(m) === 'tubo-circ' ? Math.PI / 4 * (m.largo ** 2 - Math.max(0, m.largo - 2 * m.espesor) ** 2) : rectangulos(m).reduce((z, r) => z + r.ax * r.ay, 0)), 0)), ' m²'));
    };
    const filaMed = document.createElement('div'); filaMed.className = 'medidas';
    filaMed.append(campo(esCirc(insTipo) ? 'D' : 'h', 'h', esCirc(insTipo) ? 'diámetro exterior (m)' : insTipo === 'pórtico' ? 'largo total del pórtico, de cara exterior a cara exterior (m)' : 'largo del alma, medida total (m)'));
    if (info.usaB) filaMed.append(campo('b', 'b', insTipo === 'pórtico' ? 'lado de cada columna en el plano del pórtico (m)' : 'ancho de las alas (m)'));
    filaMed.append(campo('e', 'e', esCirc(insTipo) ? 'espesor de pared (la mitad de D: maciza)' : insTipo === 'pórtico' ? 'el otro lado de la columna (m)' : 'espesor (m)'), giro);
    actualizar();
    panelIns.append(tit, formas, filaMed, vista, datos, ayuda);
  }
  // medidas de una pieza tipo ya ubicada: doble clic en la pieza; sigue en su categoría y se ve su J
  let medGrupo: string | null = null;
  const panelMed = document.createElement('div');
  panelMed.className = 'calco-panel piezas-panel med-panel';
  panelMed.hidden = true;
  cont.appendChild(panelMed);
  const NOMBRE_PARTE: Record<'eA' | 'bS' | 'eS' | 'bI' | 'eI', [string, string]> = {
    eA: ['e alma', 'espesor del alma (m)'], bS: ['b ala sup.', 'ancho del ala superior (m), medida total'], eS: ['e ala sup.', 'espesor del ala superior (m)'],
    bI: ['b ala inf.', 'ancho del ala inferior (m), medida total'], eI: ['e ala inf.', 'espesor del ala inferior (m)'],
  };
  function armarPanelMed() {
    const p = estado.proyecto, ms = medGrupo ? p.muros.filter(m => m.grupo === medGrupo) : [];
    const info = ms[0]?.pieza;
    if (!medGrupo || !info || modo !== 'mover') { panelMed.hidden = true; medGrupo = null; return; }
    panelMed.hidden = false; panelPrec.hidden = true;
    const med = info.med, tipo = info.tipo, t = TIPOS.find(x => x.tipo === tipo)!;
    panelMed.replaceChildren();
    const tit = document.createElement('b'); tit.textContent = `Pieza ${medGrupo} · ${t.nombre}`;
    const cambiar = (k: keyof MedidasPieza, v: number | null) => {
      const actual = estado.proyecto.muros.find(m => m.grupo === medGrupo)?.pieza?.med ?? med;
      const nm: MedidasPieza = { ...actual };
      if (v === null) delete (nm as unknown as Record<string, unknown>)[k]; else (nm as unknown as Record<string, number>)[k] = v;
      const mal = problemaMedidas(tipo, nm);
      if (mal) { mensaje(`Pieza ${medGrupo}: ${mal}. No se cambió.`); armarPanelMed(); return; }
      estado.cambiar(() => { estado.proyecto.muros = rehacerPieza(estado.proyecto.muros, medGrupo!, nm); });
      // se rehace el panel (J, dibujo) y el foco sigue en el campo donde está ahora (Enter: el mismo; Tab: el siguiente)
      setTimeout(() => { const kf = (document.activeElement as HTMLElement | null)?.dataset?.k; armarPanelMed(); if (kf) (panelMed.querySelector(`input[data-k="${kf}"]`) as HTMLInputElement | null)?.focus(); }, 0);
    };
    const campo = (k: 'h' | 'b' | 'e' | 'eA' | 'bS' | 'eS' | 'bI' | 'eI', etq: string, ayuda: string, opcional: boolean, efectivo: number) => {
      const l = document.createElement('label'); l.title = ayuda;
      const i = document.createElement('input'); i.type = 'number'; i.step = k.startsWith('e') ? '0.05' : '0.1'; i.min = '0.05'; i.dataset.k = k;
      const propio = (med as unknown as Record<string, number | undefined>)[k];
      i.value = opcional ? (propio == null ? '' : String(propio)) : String(efectivo); i.placeholder = String(efectivo);
      i.addEventListener('change', () => { const tx = i.value.trim(); if (!tx && opcional) { cambiar(k, null); return; } const v = Number(tx); if (v > 0) cambiar(k, v); else i.value = String(efectivo); });
      l.append(etq, i); return l;
    };
    const ef = partes(med);
    const gen = document.createElement('div'); gen.className = 'medidas';
    if (tipo === 'pórtico') {
      // la luz (de eje a eje de las columnas) es lo que se piensa al proyectar; h = luz + b
      const l = document.createElement('label'); l.title = 'distancia entre los ejes de las dos columnas (m)';
      const i = document.createElement('input'); i.type = 'number'; i.step = '0.05'; i.min = '0.1'; i.dataset.k = 'luz';
      i.value = String(+(med.h - med.b).toFixed(3));
      i.addEventListener('change', () => { const v = Number(i.value); if (v > 0) cambiar('h', +(v + med.b).toFixed(3)); else i.value = String(+(med.h - med.b).toFixed(3)); });
      l.append('luz entre columnas', i);
      gen.append(l);
    }
    gen.append(campo('h', esCirc(tipo) ? 'D' : 'h', esCirc(tipo) ? 'diámetro exterior (m)' : tipo === 'pórtico' ? 'largo total del pórtico, de cara exterior a cara exterior (m)' : 'largo del alma, medida total (m)', false, med.h));
    if (t.usaB) gen.append(campo('b', 'b', tipo === 'pórtico' ? 'lado de cada columna en el plano del pórtico (m)' : 'ancho de las alas (m), si no se da uno por ala', false, med.b));
    gen.append(campo('e', 'e', 'espesor general (m), si no se da uno por parte', false, med.e));
    const porParte = document.createElement('div'); porParte.className = 'medidas por-parte';
    PARTES[tipo].forEach(k => porParte.append(campo(k, NOMBRE_PARTE[k][0], `${NOMBRE_PARTE[k][1]}; vacío = la general`, true, ef[k])));
    const vista = document.createElement('div'); vista.className = 'vista-pieza';
    vista.append(miniatura(tipo, med, 96));
    const datos = document.createElement('div'); datos.className = 'datos-pieza';
    const f = (x: number) => x.toLocaleString('es-AR', { maximumFractionDigits: 3 });
    // los nombres de los muros vienen del proyecto: van como texto, nunca como HTML
    const lista = document.createElement('span'); lista.textContent = `${ms.length} muro${ms.length > 1 ? 's' : ''}: ${ms.map(m => m.id).join(', ')}`;
    datos.replaceChildren(datoPieza('J viento A (↑) ', f(Jreal(ms, 'A')), ' m⁴'), datoPieza('J viento B (→) ', f(Jreal(ms, 'B')), ' m⁴'), lista);
    const nota = document.createElement('p'); nota.className = 'nota chica';
    nota.textContent = `${t.ayuda} Las partes se nombran en la posición de la pieza sin girar (alma vertical, ala superior arriba). Los cambios se aplican al salir del campo o con Enter; el centro de la pieza queda donde está.`;
    const listo = document.createElement('button'); listo.type = 'button'; listo.textContent = 'Listo';
    listo.addEventListener('click', () => { medGrupo = null; armarPanelMed(); dibujar(); });
    panelMed.append(tit, gen, ...(PARTES[tipo].length ? [porParte] : []), vista, datos, nota, listo);
  }
  let ultimoToque: { id: string; t: number } | null = null;
  /** doble clic en un elemento: las medidas de su pieza tipo, o si no, el editor de su contorno */
  function abrirMedidas(m: Muro) {
    if (m.grupo && m.pieza) { medGrupo = m.grupo; armarPanelMed(); return; }
    edc.abrir(m);
  }
  // áreas de influencia de la losa (cada punto descarga en el elemento más cercano)
  let verAreas = false, areasCache: { clave: string; a: AreasInfluencia } | null = null;
  const bAreas = document.createElement('button');
  bAreas.type = 'button'; bAreas.textContent = 'Áreas';
  bAreas.title = 'Áreas de influencia de la losa de este nivel: cada punto descarga en el muro o columna más cercano (mitad de la luz). Se pueden copiar a la columna «Área inf.» de los muros.';
  bAreas.setAttribute('aria-pressed', 'false');
  bAreas.addEventListener('click', () => { verAreas = !verAreas; bAreas.setAttribute('aria-pressed', String(verAreas)); dibujar(); });
  const panelAreas = document.createElement('div');
  panelAreas.className = 'calco-panel areas-panel';
  panelAreas.hidden = true;
  dock.appendChild(panelAreas);
  const areasDe = (i: number): AreasInfluencia => {
    const p = estado.proyecto, clave = JSON.stringify([i, p.niveles, p.muros.map(m => [m.id, m.x, m.y, m.dir, m.largo, m.espesor, m.ladoY, m.tipo, m.zDesde, m.zHasta])]);
    if (!areasCache || areasCache.clave !== clave) areasCache = { clave, a: areasInfluencia(p, i) };
    return areasCache.a;
  };
  /** color de cada área: el del grupo de más arriba, o el de la pieza agrupada, o el del muro solo */
  /** cuatro colores (teorema de los cuatro colores: dos áreas vecinas nunca comparten color) y un rayado por color,
   *  para que también se distingan impresos en blanco y negro; el quinto es de reserva */
  const PALETA_AREAS = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1'];
  const RAYADOS = ['d45', 'h', 'd135', 'v', 'd45'] as const;
  const claveArea = (m: Muro | undefined): { k: string; nombre: string } => {
    if (!m) return { k: '?', nombre: '?' };
    const cad = ancestros(estado.proyecto, m.gd);
    if (cad.length) { const g = cad[cad.length - 1]; return { k: `g:${g.id}`, nombre: g.nombre }; }
    if (m.grupo) return { k: `p:${m.grupo}`, nombre: `pieza ${m.grupo}` };
    return { k: `m:${m.id}`, nombre: m.id };
  };
  const estiloArea = (_k: string, c: number) => ({ color: PALETA_AREAS[c % PALETA_AREAS.length], rayado: RAYADOS[c % RAYADOS.length] });
  /** color de cada región (grupo, pieza o muro): mapa coloreado con cuatro colores, sin dos vecinas iguales */
  let coloresCache: { a: AreasInfluencia; firma: string; col: Map<string, number> } | null = null;
  const ordenClaves = (a: AreasInfluencia) => {
    const porId = new Map(estado.proyecto.muros.map(m => [m.id, m]));
    const claves = a.ids.map(id => claveArea(porId.get(id)).k), firma = claves.join('|');
    if (coloresCache && coloresCache.a === a && coloresCache.firma === firma) return coloresCache.col;
    const col = cuatroColores(vecindades(a, o => claves[o]));
    coloresCache = { a, firma, col };
    return col;
  };
  function armarPanelAreas(i: number, a: AreasInfluencia) {
    panelAreas.hidden = !verAreas;
    if (!verAreas) return;
    const p = estado.proyecto, f1 = (v: number) => v.toFixed(1).replace('.', ',');
    const mk = <K extends keyof HTMLElementTagNameMap>(t: K, txt = '', cls = '') => { const e = document.createElement(t); if (txt) e.textContent = txt; if (cls) e.className = cls; return e; };
    panelAreas.replaceChildren(mk('b', `Áreas de influencia · ${p.niveles[i]?.nombre ?? ''}`));
    const suma = a.ids.reduce((q, id) => q + a.area[id], 0);
    panelAreas.append(mk('span', `losa ${f1(a.total)} m²${a.huecos ? ` (sin ${f1(a.huecos)} m² de huecos)` : ''} · ${a.ids.length} elementos`, 'nota-chica'));
    // leyenda por grupo: color, área y peso de losa por piso
    const orden = ordenClaves(a), porClave = new Map<string, { nombre: string; area: number; n: number }>();
    a.ids.forEach(id => { const c = claveArea(p.muros.find(o => o.id === id)); const e = porClave.get(c.k) ?? { nombre: c.nombre, area: 0, n: 0 }; e.area += a.area[id]; e.n++; porClave.set(c.k, e); });
    const ley = mk('div', '', 'areas-leyenda');
    [...porClave.entries()].sort((x, y) => (orden.get(x[0]) ?? 0) - (orden.get(y[0]) ?? 0)).forEach(([k, e]) => {
      const st = estiloArea(k, orden.get(k) ?? 0), sw = mk('i', '', `muestra r-${st.rayado}`); sw.style.setProperty('--c', st.color);
      const fila2 = mk('div', '', 'areas-ley-fila'); fila2.append(sw, mk('span', `${e.nombre}${e.n > 1 ? ` (${e.n})` : ''}`), mk('span', `${f1(e.area)} m² · ${(e.area * 0.9).toFixed(1).replace('.', ',')} t/piso`, 'n'));
      ley.append(fila2);
    });
    panelAreas.append(ley);
    const zN = p.niveles[i]?.cota ?? 0;
    const lAuto = mk('label', '', 'col-campo'), cAuto = mk('input'); cAuto.type = 'checkbox'; cAuto.checked = p.areasAuto !== undefined && p.areasAuto !== null && Math.abs(p.areasAuto - zN) < 1e-6;
    cAuto.addEventListener('change', () => { estado.cambiar(pp => { pp.areasAuto = cAuto.checked ? zN : null; }); mensaje(cAuto.checked ? `Áreas al día: cada cambio en la planta (muros, huecos) copia las áreas de ${p.niveles[i]?.nombre} a «Área inf.».` : 'Áreas a mano: se copian con el botón.'); });
    lAuto.append(cAuto, `al día: copiar solas las áreas de ${p.niveles[i]?.nombre ?? 'este nivel'} al cambiar la planta`);
    lAuto.title = 'Cada vez que movés un muro o un hueco, las áreas de influencia de este nivel se copian a la columna «Área inf.» (la carga de las losas en la flexocompresión). Cambia los valores que tenías cargados a mano.';
    panelAreas.append(lAuto);
    const tabla = mk('table', '', 'areas-tabla');
    const fila = (c: string[], th = false) => { const tr = mk('tr'); c.forEach(t => tr.append(mk(th ? 'th' : 'td', t))); return tr; };
    tabla.append(fila(['Muro', 'Calculada', 'Cargada'], true));
    [...a.ids].sort((x, y) => a.area[y] - a.area[x]).forEach(id => { const m = p.muros.find(o => o.id === id); tabla.append(fila([id, `${f1(a.area[id])} m²`, m ? `${f1(m.areaInf)} m²` : '—'])); });
    panelAreas.append(tabla);
    if (Math.abs(suma - a.total) > 0.05) panelAreas.append(mk('span', `suma ${f1(suma)} m²`, 'nota-chica'));
    const copiar = mk('button', 'Copiar a «Área inf.» de los muros') as HTMLButtonElement; copiar.type = 'button';
    copiar.title = 'Escribe estas áreas en la columna «Área inf.» de cada muro (la usa la flexocompresión, por cada losa que el muro tiene arriba). Los muros que no están en esta planta no cambian.';
    copiar.addEventListener('click', () => { estado.cambiar(() => { estado.proyecto.muros.forEach(m => { if (m.id in a.area) m.areaInf = a.area[m.id]; }); }); mensaje(`Áreas de influencia de ${p.niveles[i]?.nombre}: copiadas a ${a.ids.length} muros.`); });
    panelAreas.append(copiar, mk('span', 'Criterio: cada punto de la losa va al elemento más cercano (el borde queda a mitad de camino). Elegí la planta tipo arriba antes de copiar.', 'nota-chica'));
  }
  // grilla de discretización de 0,05 m: se ve y los puntos se ajustan a ella; apagada, el ajuste es de 0,01 m
  const bGrilla = document.createElement('button');
  bGrilla.type = 'button'; bGrilla.textContent = 'Grilla'; bGrilla.className = 'b-grilla';
  bGrilla.title = 'Grilla de discretización de 0,05 × 0,05 m: los muros, vértices y piezas se ajustan a ella (tecla G). Apagada, el ajuste es de 1 cm.';
  const ponerGrilla = (on: boolean) => {
    estado.grillaFina = on; fijarPasoGrilla(on ? 0.05 : 0.01); bGrilla.setAttribute('aria-pressed', String(on));
    try { localStorage.setItem('torre3d.grilla', on ? '1' : '0'); } catch { /* sin almacenamiento */ }
    dibujar();
  };
  bGrilla.addEventListener('click', () => ponerGrilla(!estado.grillaFina));
  document.addEventListener('keydown', ev => { if ((ev.key === 'g' || ev.key === 'G') && !ev.ctrlKey && !ev.metaKey && !(ev.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) ponerGrilla(!estado.grillaFina); });
  try { estado.grillaFina = localStorage.getItem('torre3d.grilla') === '1'; } catch { /* sin almacenamiento */ }
  fijarPasoGrilla(estado.grillaFina ? 0.05 : 0.01); bGrilla.setAttribute('aria-pressed', String(estado.grillaFina));
  const apiPlanta: ApiPlanta = {
    svg, dock, el,
    aMundo: ev => aMundo(ev),
    pegar: ev => { ultimoIdIman = undefined; const q = pegarNodo(ev, new Set()); return { p: q, id: ultimoIdIman }; },
    dibujar: () => dibujar(), pedirDibujo: () => pedirDibujo(), mensaje: t => mensaje(t),
    seleccion: () => {
      const p = estado.proyecto;
      if (estado.multi.m.length || estado.multi.g.length) return { m: [...estado.multi.m], g: [...estado.multi.g] };
      if (estado.grupoSel && estado.grupoSel !== estado.contexto) return { m: [], g: [estado.grupoSel] };
      const m = p.muros.find(x => x.id === estado.seleccion);
      if (!m) return { m: [], g: [] };
      const nodo = nodoAlTocar(p, m, estado.contexto);
      return !nodo ? { m: [], g: [] } : nodo.t === 'g' ? { m: [], g: [nodo.id] } : { m: compas(m).filter(id => { const o = p.muros.find(x => x.id === id); return o && (o.gd ?? null) === (estado.contexto ?? null); }), g: [] };
    },
    activar: on => { if (on) { if (modo !== 'colocar') ponerModo('colocar'); } else if (modo !== 'mover' && modo !== 'lazo') ponerModo('mover'); },
    centrarEn: (x, y) => {
      // solo si el punto queda tapado por los paneles de la izquierda o fuera de la vista
      const w = svg.clientWidth || 600, h = svg.clientHeight || 500, px = ox + x * escala, py = oy - y * escala;
      if (px > 290 && px < w - 290 && py > 60 && py < h - 60) return;
      centroVista = { x, y }; dibujar();
    },
  };
  const col = montarColocar(apiPlanta);
  // barra de transformaciones: siempre a mano (abajo a la izquierda de la planta), con lápiz, dedo o mouse
  const barraTr = document.createElement('div'); barraTr.className = 'barra-transformar'; barraTr.setAttribute('role', 'toolbar'); barraTr.setAttribute('aria-label', 'Transformar lo elegido');
  const TR: [string, string, string, () => void, string?][] = [
    ['✥', 'Mover', 'Mover: tocá un punto base y el destino (o escribí la distancia)', () => col.herramienta('mover'), 'mover'],
    ['⧉', 'Copiar', 'Copiar: punto base y destino; deja el original', () => col.herramienta('copiar'), 'copiar'],
    ['↺', '90°', 'Girar 90° a la izquierda, alrededor del centro de lo elegido', () => col.transformar('g90')],
    ['↻', '90°', 'Girar 90° a la derecha, alrededor del centro de lo elegido', () => col.transformar('g270')],
    ['∠', 'Girar°', 'Girar en cualquier ángulo: tocá el centro (el ángulo se escribe abajo)', () => col.herramienta('girar-libre'), 'girar-libre'],
    ['⇋', 'Espejar', 'Espejar con un eje vertical por el centro de lo elegido', () => col.transformar('ex')],
    ['⇵', 'Espejar', 'Espejar con un eje horizontal por el centro de lo elegido', () => col.transformar('ey')],
    ['⟋', 'Simetría', 'Simetría por un eje: tocá dos puntos (horizontal, vertical o a 45°)', () => col.herramienta('espejar'), 'espejar'],
    ['⤡', 'Escalar', 'Escalar: tocá el punto base (el factor se escribe abajo)', () => col.herramienta('escalar'), 'escalar'],
  ];
  const botonesTr = TR.map(([ic, t, tit, f, h]) => {
    const b = document.createElement('button'); b.type = 'button'; b.title = tit; b.dataset.h = h ?? '';
    const i = document.createElement('span'); i.className = 'ic'; i.textContent = ic; const sp = document.createElement('span'); sp.className = 'tx'; sp.textContent = t;
    b.append(i, sp);
    b.addEventListener('click', () => { if (b.getAttribute('aria-disabled') === 'true') { mensaje('Primero elegí qué transformar: tocá un muro o un grupo, o varios con el lazo.'); return; } f(); refrescarTr(); });
    barraTr.append(b); return b;
  });
  const bMasTr = document.createElement('button'); bMasTr.type = 'button'; bMasTr.title = 'Todas las herramientas de colocar: copias, matrices, alinear, editar muros'; bMasTr.innerHTML = '<span class="ic">⋯</span><span class="tx">Más</span>';
  bMasTr.addEventListener('click', () => col.botones[0].click());
  barraTr.append(bMasTr);
  cont.appendChild(barraTr);
  // en plantas angostas (tablet vertical) la barra queda solo con íconos, para que entren todos los botones
  try { new ResizeObserver(() => barraTr.classList.toggle('angosta', cont.clientWidth < 620)).observe(cont); } catch { /* sin ResizeObserver */ }
  function refrescarTr() {
    const hay = col.hayEleccion(), act = col.herramientaActiva();
    // solo con algo elegido (o una herramienta de transformar en curso): si no, tapaba la parte de abajo de la planta
    barraTr.hidden = (modo !== 'mover' && modo !== 'lazo' && modo !== 'colocar') || (!hay && !act);
    botonesTr.forEach(b => { b.setAttribute('aria-disabled', String(!hay && !(b.dataset.h && b.dataset.h === act))); b.setAttribute('aria-pressed', String(!!b.dataset.h && b.dataset.h === act)); });
  }
  // los cuadros de la derecha (medidas, mover con precisión) se pliegan tocando el título; con pantalla táctil arrancan plegados
  const tactilPlegar = matchMedia('(pointer: coarse)').matches;
  cont.addEventListener('click', ev => {
    const t = ev.target as HTMLElement;
    const pan = t.closest('.prec-panel, .med-panel');
    if (pan && t.tagName === 'B' && t.parentElement === pan) { pan.classList.toggle('plegado'); try { localStorage.setItem('torre3d.plegar.' + (pan.classList.contains('prec-panel') ? 'prec' : 'med'), pan.classList.contains('plegado') ? '1' : '0'); } catch { /* sin almacenamiento */ } }
  });
  const plegarInicial = (pan: HTMLElement, k: string) => { let v: string | null = null; try { v = localStorage.getItem('torre3d.plegar.' + k); } catch { /* */ } if (v === '1' || (v === null && tactilPlegar)) pan.classList.add('plegado'); };
  plegarInicial(panelMed, 'med');
  const gui = montarGuias(apiPlanta);
  const edc = montarEditorContorno(apiPlanta);
  estado.suscribir(() => { col.refrescar(); gui.refrescar(); refrescarTr(); });
  refrescarBarraTr = refrescarTr;
  refrescarTr();
  // comandos de teclado como en CAD: se escribe el alias (L, M, CO, RO, MI, ES, O, AL, PA, UN, F…) y Enter o Espacio
  const COMANDOS: Record<string, [string, () => void]> = {};
  const cmd = (alias: string[], nombre: string, f: () => void) => alias.forEach(a => { COMANDOS[a] = [nombre, f]; });
  cmd(['L', 'MU'], 'dibujar muros', () => ponerModo('dibujar'));
  cmd(['LA', 'SE'], 'lazo', () => ponerModo('lazo'));
  cmd(['M', 'MO'], 'mover', () => col.iniciar('mover'));
  cmd(['CO', 'CP'], 'copiar', () => col.iniciar('copiar'));
  cmd(['RO'], 'girar', () => col.iniciar('girar'));
  cmd(['RL'], 'girar libre', () => col.iniciar('girar-libre'));
  cmd(['MI', 'SI'], 'simetría', () => col.iniciar('espejar'));
  cmd(['SC', 'ESC'], 'escalar', () => col.iniciar('escalar'));
  cmd(['O', 'DE'], 'desfase', () => col.iniciar('desfase'));
  cmd(['AL', 'EX', 'TR'], 'alargar o recortar', () => col.iniciar('alargar'));
  cmd(['PA', 'BR'], 'partir', () => col.iniciar('partir'));
  cmd(['UN', 'J'], 'unir', () => col.iniciar('unir'));
  cmd(['F', 'ESQ'], 'esquina', () => col.iniciar('esquina'));
  cmd(['AR', 'MA'], 'matrices', () => col.iniciar(null));
  cmd(['CAM'], 'dibujar camino', () => col.iniciar('camino'));
  cmd(['D', 'DIM', 'COT'], 'cotas', () => col.iniciar('cota'));
  cmd(['ME', 'DI'], 'medir', () => col.iniciar('medir'));
  cmd(['CA'], 'calar', () => ponerModo('calar'));
  cmd(['IN', 'I'], 'insertar pieza', () => ponerModo('insertar'));
  cmd(['EJ'], 'guías', () => gui.boton.click());
  cmd(['CON'], 'contornos', () => ponerModo('silueta'));
  let comando = '';
  document.addEventListener('keydown', ev => {
    if ((modo !== 'mover' && modo !== 'lazo') || ev.ctrlKey || ev.metaKey || ev.altKey || (ev.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return;
    if (!svg.isConnected || !svg.getClientRects().length) return;
    // solo con el foco en la planta (o en ningún lado): las letras tipeadas en la tabla o los paneles no son comandos
    { const t = ev.target; if (t instanceof Element && t !== document.body && !cont.contains(t)) return; }
    if (/^[a-zA-ZñÑ]$/.test(ev.key) && !(ev.key.toLowerCase() === 'g' && !comando)) {
      comando += ev.key.toUpperCase(); ev.preventDefault(); ev.stopPropagation();
      const posibles = Object.keys(COMANDOS).filter(k => k.startsWith(comando));
      mensaje(`Comando: ${comando}▌${posibles.length ? ` → ${[...new Set(posibles.map(k => COMANDOS[k][0]))].slice(0, 4).join(', ')} · Enter o Espacio` : ' (no existe; Esc borra)'}`);
      return;
    }
    if (comando && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); const c = COMANDOS[comando]; const t = comando; comando = ''; if (c) { mensaje(`${t}: ${c[0]}.`); c[1](); } else mensaje(`No hay un comando «${t}». La lista está en Ayuda → Atajos.`); return; }
    if (comando && ev.key === 'Backspace') { ev.preventDefault(); ev.stopImmediatePropagation(); comando = comando.slice(0, -1); mensaje(comando ? `Comando: ${comando}▌` : ''); return; }
    if (comando && ev.key === 'Escape') { ev.stopImmediatePropagation(); comando = ''; mensaje(''); }
  }, true);
  estado.suscribirSeleccion(() => { col.refrescar(); refrescarTr(); });
  // menú «⋯» con las herramientas que se usan menos (para que la barra entre en la tablet)
  const mas = document.createElement('div'); mas.className = 'menu-mas';
  const bMas = document.createElement('button'); bMas.type = 'button'; bMas.textContent = '⋯'; bMas.title = 'Más: importar un plano, áreas de influencia y juntas entre muros'; bMas.setAttribute('aria-label', 'Más herramientas'); bMas.setAttribute('aria-haspopup', 'true');
  const listaMas = document.createElement('div'); listaMas.className = 'menu-mas-lista'; listaMas.hidden = true;
  const bJuntas = document.createElement('button'); bJuntas.type = 'button';
  const pintarJuntas = () => { bJuntas.textContent = estado.juntasLimpias ? 'Juntas: unidas ✓' : 'Juntas: muros separados'; bJuntas.setAttribute('aria-pressed', String(estado.juntasLimpias)); };
  bJuntas.title = 'Unidas: los muros que se encuentran (L, T, X, también en ángulo) se dibujan como una sola pieza, sin la línea de la junta y sin superposición. Separados: cada muro con su rectángulo.';
  bJuntas.addEventListener('click', () => { estado.juntasLimpias = !estado.juntasLimpias; try { localStorage.setItem('torre3d.juntas', estado.juntasLimpias ? '1' : '0'); } catch { /* */ } pintarJuntas(); dibujar(); });
  pintarJuntas();
  listaMas.append(bCalco, bAreas, bJuntas);
  bMas.addEventListener('click', ev => { ev.stopPropagation(); listaMas.hidden = !listaMas.hidden; { const r = bMas.getBoundingClientRect(), c = cont.getBoundingClientRect(); listaMas.style.left = `${Math.max(4, Math.min(r.left - c.left, c.width - 170))}px`; listaMas.style.top = `${r.bottom - c.top + 4}px`; } bMas.setAttribute('aria-expanded', String(!listaMas.hidden)); });
  listaMas.addEventListener('click', () => { setTimeout(() => { listaMas.hidden = true; }, 0); });
  document.addEventListener('pointerdown', ev => { if (!mas.contains(ev.target as Node) && !listaMas.contains(ev.target as Node)) listaMas.hidden = true; });
  mas.append(bMas);
  cont.appendChild(listaMas);
  barra.append(bMover, bLazo, bSil, bDibujar, bArmar, bIns, bCalar, ...col.botones.slice(0, 1), gui.boton, ...col.botones.slice(1), bGrilla, mas);
  // corte de la torre: la silueta se ajusta en un corte vertical, con el plano del proyecto calcado debajo
  const corte = montarCorte(cont, mensaje);
  const bCorte = document.createElement('button'); bCorte.type = 'button'; bCorte.textContent = 'Corte';
  bCorte.title = 'Corte vertical de la torre: arrastrá el borde de las losas para darle la silueta de los planos (alzado o corte calcado debajo)';
  bCorte.addEventListener('click', () => { ponerModo('mover'); corte.abrir(); });
  barra.insertBefore(bCorte, bDibujar);
  barra.append(bIndic, bAvisos); bIndic.setAttribute('aria-pressed', String(conIndic));
  cont.appendChild(panelAv);
  cont.appendChild(indic); indicar(INDIC[modo]);
  cont.appendChild(barra);
  const panelCalco = document.createElement('div');
  panelCalco.className = 'calco-panel';
  panelCalco.hidden = true;
  dock.appendChild(panelCalco);
  function armarPanelCalco() {
    const c = estado.calco;
    panelCalco.hidden = !c;
    panelCalco.replaceChildren();
    if (!c) return;
    const campo = (t: string, k: 'ancho' | 'x' | 'y' | 'opacidad', paso: string, min?: string, max?: string) => {
      const l = document.createElement('label'); const i = document.createElement('input');
      i.type = k === 'opacidad' ? 'range' : 'number'; i.step = paso; if (min) i.min = min; if (max) i.max = max; i.value = String(+c[k].toFixed(k === 'opacidad' ? 2 : 3));
      i.addEventListener('input', () => { const v = Number(i.value); if (isFinite(v) && estado.calco) { estado.calco[k] = v; dibujar(); } });
      l.append(t, i); return l;
    };
    const cal = document.createElement('button'); cal.type = 'button'; cal.textContent = 'Escala con dos puntos';
    cal.title = 'Clic en dos puntos del plano cuya distancia real conocés (por ejemplo, los extremos de una cota) y escribí esa distancia.';
    cal.addEventListener('click', () => ponerModo('calibrar'));
    const quitar = document.createElement('button'); quitar.type = 'button'; quitar.textContent = 'Quitar';
    quitar.addEventListener('click', () => { if (estado.calco) URL.revokeObjectURL(estado.calco.url); estado.calco = null; armarPanelCalco(); dibujar(); });
    const tit = document.createElement('b'); tit.textContent = 'Plano de fondo';
    panelCalco.append(tit, campo('ancho (m)', 'ancho', '0.1', '0.1'), campo('centro x', 'x', '0.05'), campo('centro y', 'y', '0.05'), campo('opacidad', 'opacidad', '0.05', '0.05', '1'), cal, quitar);
  }
  const nuevoId = () => { let k = 1; while (estado.proyecto.muros.some(m => m.id === `M${k}`)) k++; return `M${k}`; };
  let arrastre: { id: string; x0: number; y0: number; mx: number; my: number; otros: { id: string; x: number; y: number }[] } | null = null;
  // arrastre desde un nodo del elemento elegido: el nodo se pega a los nodos del CAD o de otros muros
  let arrastreNodo: { p: { x: number; y: number }; orig: { id: string; x: number; y: number }[] } | null = null;
  /** nodos del elemento: esquinas, medios de los lados y centro (en las columnas circulares, centro y cuadrantes) */
  const nodosDe = (m: Muro) => nodosMuro(m);
  /** elemento con el mouse encima (modo mover): se ven sus nodos para agarrarlo desde una esquina sin elegirlo antes */
  let hoverId: string | null = null;
  const NOMBRE_NODO = ['esquina inf. izq.', 'esquina inf. der.', 'esquina sup. der.', 'esquina sup. izq.', 'medio de abajo', 'medio derecho', 'medio de arriba', 'medio izquierdo', 'centro'];
  const NOMBRE_NODO_CIRC = ['centro', 'borde derecho', 'borde izquierdo', 'borde de arriba', 'borde de abajo'];
  // mover con precisión: se elige un nodo del elemento (o del grupo) y se lo lleva a unas coordenadas o se lo corre dx, dy
  let refNodo = -1;   // −1 = el centro
  const valPrec = { x: '', y: '', dx: '', dy: '' };
  const panelPrec = document.createElement('div');
  panelPrec.className = 'calco-panel prec-panel';
  panelPrec.hidden = true;
  cont.appendChild(panelPrec);
  plegarInicial(panelPrec, 'prec');
  let clavePrec = '';
  function armarPanelPrec() {
    const p = estado.proyecto, m = modo === 'mover' ? p.muros.find(x => x.id === estado.seleccion) : undefined;
    panelPrec.hidden = !m;
    if (!m) { clavePrec = ''; return; }
    const nodos = nodosDe(m), circ = tipoDe(m) === 'tubo-circ';
    const iRef = refNodo >= 0 && refNodo < nodos.length ? refNodo : nodos.findIndex(n => n.t === 'centro');
    const ref = nodos[iRef];
    const f2 = (v: number) => v.toFixed(3).replace(/\.?0+$/, '').replace('.', ',');
    const clave = `${m.id}|${iRef}|${ref.x}|${ref.y}`;
    if (clave === clavePrec && panelPrec.contains(document.activeElement)) return;
    clavePrec = clave;
    const ids = compas(m);
    const correr = (dx: number, dy: number, texto: string) => {
      if (!isFinite(dx) || !isFinite(dy) || (dx === 0 && dy === 0)) return;
      estado.cambiar(() => { estado.proyecto.muros.forEach(w => { if (ids.includes(w.id)) { w.x = +(w.x + dx).toFixed(3); w.y = +(w.y + dy).toFixed(3); } }); });
      mensaje(texto);
    };
    const num = (t: string) => { const v = parseFloat(t.replace(',', '.')); return isFinite(v) ? v : NaN; };
    const mk = <K extends keyof HTMLElementTagNameMap>(t: K, txt = '', cls = '') => { const e = document.createElement(t); if (txt) e.textContent = txt; if (cls) e.className = cls; return e; };
    const campo = (k: keyof typeof valPrec, etq: string, ph: string) => {
      const i = mk('input'); i.type = 'text'; i.inputMode = 'decimal'; i.placeholder = ph; i.value = valPrec[k]; i.setAttribute('aria-label', etq);
      i.addEventListener('input', () => { valPrec[k] = i.value; });
      const l = mk('label', '', 'prec-campo'); l.append(mk('span', etq), i); return { l, i };
    };
    panelPrec.replaceChildren();
    panelPrec.append(mk('b', `${m.id}${grupoCerrado(p, m, estado.contexto) ? ` · grupo «${grupoCerrado(p, m, estado.contexto)!.nombre}»` : m.grupo ? ` · pieza ${m.grupo}` : ''}`));
    // medidas del elemento (como en las piezas insertables): largo, espesor y dirección, sin ir a la tabla
    {
      // las medidas se cambian también en un muro de una pieza agrupada (el grupo cerrado es para mover con el mouse);
      // solo los bloqueados 🔒 no se tocan
      const t = tipoDe(m), mot = muroBloqueado(p, m) ? `${m.id} está bloqueado 🔒: desbloquealo en el Esquema.` : null;
      const med = mk('div', '', 'prec-medidas');
      if (mot) med.append(mk('span', mot, 'prec-nota'));
      else if (t === 'perfil') { const be = mk('button', 'Editar el contorno'); be.type = 'button'; be.title = 'También: doble clic en el perfil'; be.addEventListener('click', () => edc.abrir(m)); med.append(mk('span', 'Perfil irregular: su forma se edita con el contorno.', 'prec-nota'), be); }
      else {
        const campoM = (etq: string, v: number, ayuda: string, poner: (w: import('../engine/modelo').Muro, x: number) => string | null) => {
          const l = mk('label', '', 'prec-campo'); l.title = ayuda; l.append(etq);
          const i = mk('input'); i.type = 'text'; i.inputMode = 'decimal'; i.value = f2(v);
          i.addEventListener('change', () => {
            const x = Number(i.value.replace(',', '.'));
            if (!(x > 0)) { i.value = f2(v); mensaje('La medida tiene que ser mayor que cero.'); return; }
            let err: string | null = null;
            estado.cambiar(pp => { const w = pp.muros.find(o => o.id === m.id); if (w) err = poner(w, +x.toFixed(3)); });
            mensaje(err ?? `${m.id}: ${etq} = ${f2(x)} m.`);
          });
          l.append(i, 'm'); return l;
        };
        if (t === 'tabique') {
          med.append(campoM('largo', m.largo, 'Largo del tabique (crece desde su centro)', (w, x) => { w.largo = x; return null; }),
            campoM('espesor', m.espesor, m.refLado ? 'Espesor del tabique (la cara de referencia queda quieta)' : 'Espesor del tabique', (w, x) => { if (x > w.largo) return 'El espesor no puede pasar el largo (girá el tabique si es eso lo que querés).'; const k = conEspesor(w, x); w.x = k.x; w.y = k.y; w.espesor = x; return null; }));
          const gir = mk('button', m.dir === 'Y' ? '↻ a X' : '↻ a Y'); gir.type = 'button'; gir.title = `Girar el tabique 90° sobre su centro (pasa a dirección ${m.dir === 'Y' ? 'X' : 'Y'})`;
          gir.addEventListener('click', () => { estado.cambiar(pp => { const w = pp.muros.find(o => o.id === m.id); if (w) { w.dir = w.dir === 'Y' ? 'X' : 'Y'; w.rolA = ''; w.rolB = ''; } }); });
          med.append(gir);
        } else if (t === 'tubo-rect') {
          med.append(campoM('lado x', m.largo, 'Lado en x (exterior)', (w, x) => { if (2 * w.espesor >= x) return 'La pared ocupa todo el lado.'; w.largo = x; return null; }),
            campoM('lado y', m.ladoY ?? m.largo, 'Lado en y (exterior)', (w, x) => { if (2 * w.espesor >= x) return 'La pared ocupa todo el lado.'; w.ladoY = x; return null; }),
            campoM('pared', m.espesor, 'Espesor de la pared', (w, x) => { w.espesor = Math.min(x, Math.min(w.largo, w.ladoY ?? w.largo) / 2); return null; }));
        } else if (t === 'tubo-circ') {
          med.append(campoM('D', m.largo, 'Diámetro exterior', (w, x) => { w.largo = x; w.espesor = Math.min(w.espesor, x / 2); return null; }),
            campoM('pared', m.espesor, 'Espesor de pared (la mitad de D: maciza)', (w, x) => { w.espesor = Math.min(x, w.largo / 2); return null; }));
        }
        if (t !== 'tubo-circ') { const be = mk('button', 'Contorno…'); be.type = 'button'; be.title = 'Editar la polilínea del contorno (también: doble clic)'; be.addEventListener('click', () => edc.abrir(m)); med.append(be); }
      }
      panelPrec.append(med);
      // espesor que cambia con la altura (tabiques y tubos rectangulares), por tramos: «desde el nivel …, espesor …»
      if (!mot && (t === 'tabique' || t === 'tubo-rect')) {
        const caja = mk('div', '', 'prec-espesores');
        const tramos = [...(m.espesores ?? [])].sort((a, b) => a.desde - b.desde);
        const sobrePB = p.niveles.filter(n => n.cota > 0).sort((a, b) => a.cota - b.cota);
        const guardar = (nuevos: { desde: number; e: number }[], txt: string) => {
          clavePrec = ''; (document.activeElement as HTMLElement | null)?.blur?.();   // que el cuadro se vuelva a armar con los tramos nuevos
          estado.cambiar(pp => { const w = pp.muros.find(o => o.id === m.id); if (!w) return; const v = nuevos.filter(x => x.e > 0).sort((a, b) => a.desde - b.desde); if (v.length) w.espesores = v; else delete w.espesores; });
          mensaje(txt);
        };
        caja.append(mk('span', `Espesor en altura · en PB ${f2(m.espesor)} m`, 'prec-sub'));
        tramos.forEach((tr, k) => {
          const fila = mk('div', '', 'prec-fila prec-tramo');
          const sel = mk('select'); sobrePB.forEach(n => { const o = mk('option', `desde ${n.nombre}`); o.value = String(n.cota); sel.append(o); }); sel.value = String(tr.desde);
          sel.addEventListener('change', () => guardar(tramos.map((x, j) => (j === k ? { ...x, desde: Number(sel.value) } : x)), `${m.id}: el tramo empieza en ${sel.selectedOptions[0]?.textContent?.replace('desde ', '')}.`));
          const i = mk('input'); i.type = 'text'; i.inputMode = 'decimal'; i.value = f2(tr.e); i.setAttribute('aria-label', 'espesor del tramo');
          i.addEventListener('change', () => { const x = Number(i.value.replace(',', '.')); if (!(x > 0)) { i.value = f2(tr.e); return; } guardar(tramos.map((y, j) => (j === k ? { ...y, e: +x.toFixed(3) } : y)), `${m.id}: ${f2(x)} m desde ese nivel.`); });
          const quitar = mk('button', '✕'); quitar.type = 'button'; quitar.title = 'Sacar este tramo';
          quitar.addEventListener('click', () => guardar(tramos.filter((_, j) => j !== k), `${m.id}: tramo sacado.`));
          fila.append(sel, i, mk('span', 'm'), quitar); caja.append(fila);
        });
        const mas = mk('button', '+ tramo'); mas.type = 'button'; mas.title = 'El muro cambia de espesor desde un nivel hacia arriba (por ejemplo, se afina en los pisos altos)';
        mas.addEventListener('click', () => {
          const ult = tramos[tramos.length - 1], prox = sobrePB.find(n => n.cota > (ult?.desde ?? sobrePB[Math.floor(sobrePB.length / 2) - 1]?.cota ?? 0)) ?? sobrePB[0];
          if (!prox) return;
          guardar([...tramos, { desde: prox.cota, e: +((ult?.e ?? m.espesor) * 0.75).toFixed(3) }], `${m.id}: nuevo tramo desde ${prox.nombre}. La hoja J de la planilla usa el espesor de PB; la app calcula J, peso y deformada con cada tramo.`);
        });
        caja.append(mas);
        panelPrec.append(caja);
      }
      // aberturas (puertas y ventanas): medidas y quitar; el elemento sigue entero
      if (!mot && m.aberturas?.length) {
        const ca = mk('div', '', 'prec-espesores');
        ca.append(mk('span', `Aberturas (${m.aberturas.length}) · en todos los pisos`, 'prec-sub'));
        m.aberturas.forEach((a, i) => {
          const fila = mk('div', '', 'prec-fila');
          const num = (etq: string, v: number, poner: (o: Abertura, x: number) => void) => {
            const l = mk('label', '', 'prec-campo'); l.append(etq); const inp = mk('input'); inp.type = 'text'; inp.inputMode = 'decimal'; inp.value = f2(v); inp.style.width = '44px';
            inp.addEventListener('change', () => {
              const x = Number(inp.value.replace(',', '.')); if (!(x >= 0)) { inp.value = f2(v); return; }
              const nueva = { ...a }; poner(nueva, +x.toFixed(3));
              const resto = (m.aberturas ?? []).filter((_, k) => k !== i);
              const err = problemaAbertura({ ...m, aberturas: [...resto, nueva] }, nueva, entrepisoMin(m));
              if (err) { mensaje(`${m.id}: ${err}.`); inp.value = f2(v); return; }
              clavePrec = ''; estado.cambiar(pp => { const w = pp.muros.find(o => o.id === m.id); if (w?.aberturas) w.aberturas[i] = nueva; });
            });
            l.append(inp); return l;
          };
          const quitar = mk('button', '✕'); quitar.type = 'button'; quitar.title = 'Quitar esta abertura';
          quitar.addEventListener('click', () => { clavePrec = ''; estado.cambiar(pp => { const w = pp.muros.find(o => o.id === m.id); if (w) { w.aberturas = (w.aberturas ?? []).filter((_, k) => k !== i); if (!w.aberturas.length) delete w.aberturas; } }); mensaje(`${m.id}: abertura quitada.`); });
          fila.append(mk('span', `${a.desde > 1e-6 ? 'ventana' : 'puerta'}${a.cara ? ` ${a.cara}` : ''}`), num('ancho', a.ancho, (o, x) => { o.ancho = x; }), num('alto', a.alto, (o, x) => { o.alto = x; }), num('desde', a.desde, (o, x) => { o.desde = x; }), quitar);
          ca.append(fila);
        });
        ca.append(mk('span', 'El cálculo usa la sección más débil: el corte por las aberturas (J de los pedazos que quedan, con su Steiner).', 'prec-nota'));
        panelPrec.append(ca);
      }
      // juntas de este muro con los otros: qué pasa en cada una (L: inglete o pasa uno; X: pasa uno; T: el que llega se corta)
      const js = detectarJuntas(p.muros.filter(o => !muroOculto(p, o))).filter(j => j.a === m.id || j.b === m.id);
      if (js.length) {
        const cj = mk('div', '', 'prec-juntas');
        cj.append(mk('span', 'Encuentros con otros muros', 'prec-sub'));
        js.forEach(j => {
          const otro = j.a === m.id ? j.b : j.a, clave = claveJunta(j.a, j.b), [primero] = clave.split('|');
          const fila = mk('div', '', 'prec-fila prec-junta');
          fila.append(mk('span', `${j.tipo} con ${otro}${Math.abs(j.angulo - 90) > 0.5 ? ` · ${j.angulo.toFixed(0)}°` : ''}`));
          if (j.tipo === 'T') { fila.append(mk('span', j.a === m.id ? 'este llega y se corta' : 'pasa este', 'prec-nota')); cj.append(fila); return; }
          const sel = mk('select');
          // por defecto, como las hojas J: pasa el ala (perpendicular al viento elegido); en otro ángulo, el más grueso
          const ea = ejeDeMuro(m), eb = ejeDeMuro(p.muros.find(o => o.id === otro)!);
          const auto = ea && eb ? quienPasa(ea, eb, estado.dir, j.tipo === 'L') : null;
          const ops: [string, string][] = [['', `como las hojas J: ${auto ? `pasa ${auto.id}` : 'inglete'} (viento ${estado.dir})`], ...(j.tipo === 'L' ? [['inglete', 'inglete'] as [string, string]] : []), [m.id === primero ? 'pasaA' : 'pasaB', `pasa ${m.id}`], [m.id === primero ? 'pasaB' : 'pasaA', `pasa ${otro}`]];
          ops.forEach(([v, t]) => { const o = mk('option', t); o.value = v; sel.append(o); });
          sel.value = p.juntas?.[clave] ?? '';
          sel.addEventListener('change', () => { clavePrec = ''; estado.cambiar(pp => { pp.juntas = { ...(pp.juntas ?? {}) }; if (sel.value) pp.juntas[clave] = sel.value as 'inglete' | 'pasaA' | 'pasaB'; else delete pp.juntas[clave]; if (!Object.keys(pp.juntas).length) delete pp.juntas; }); mensaje(`Junta ${m.id}–${otro}: ${sel.selectedOptions[0]?.textContent}.`); });
          fila.append(sel); cj.append(fila);
        });
        panelPrec.append(cj);
      }
      panelPrec.append(mk('span', 'Mover con precisión', 'prec-sub'));
    }
    if (m.pieza) {
      const bm = mk('button', m.pieza.tipo === 'pórtico' ? 'Medidas del pórtico (luz entre columnas)…' : 'Medidas de la pieza…', 'b-medidas');
      (bm as HTMLButtonElement).type = 'button';
      bm.addEventListener('click', () => abrirMedidas(m));
      panelPrec.append(bm);
    }
    const sel = mk('select'); sel.setAttribute('aria-label', 'Nodo de referencia');
    nodos.forEach((n, i) => { const o = mk('option', (circ ? NOMBRE_NODO_CIRC : NOMBRE_NODO)[i] ?? n.t); o.value = String(i); sel.append(o); });
    sel.value = String(iRef);
    sel.addEventListener('change', () => { refNodo = +sel.value; clavePrec = ''; armarPanelPrec(); dibujar(); });
    const fr = mk('div', '', 'prec-fila'); fr.append(mk('span', 'Tomar desde'), sel); panelPrec.append(fr);
    panelPrec.append(mk('span', `está en x ${f2(ref.x)} · y ${f2(ref.y)} m (clic en un nodo para elegirlo)`, 'prec-nota'));
    const cx = campo('x', 'x', f2(ref.x)), cy = campo('y', 'y', f2(ref.y));
    const llevar = mk('button', 'Llevar'); (llevar as HTMLButtonElement).type = 'button';
    llevar.title = 'Lleva el nodo elegido a esas coordenadas (m, desde el centro de la planta); un campo vacío deja esa coordenada igual';
    llevar.addEventListener('click', () => { const x = cx.i.value.trim() ? num(cx.i.value) : ref.x, y = cy.i.value.trim() ? num(cy.i.value) : ref.y; valPrec.x = valPrec.y = ''; correr(x - ref.x, y - ref.y, `${m.id}: ${(circ ? NOMBRE_NODO_CIRC : NOMBRE_NODO)[iRef]} llevado a x ${f2(x)} · y ${f2(y)} m.`); });
    const f1 = mk('div', '', 'prec-fila'); f1.append(mk('span', 'Llevar a'), cx.l, cy.l, llevar); panelPrec.append(f1);
    const cdx = campo('dx', 'dx', '0'), cdy = campo('dy', 'dy', '0');
    const mover = mk('button', 'Mover'); (mover as HTMLButtonElement).type = 'button';
    mover.title = 'Corre el elemento (o su grupo) esas distancias en m';
    mover.addEventListener('click', () => { const dx = cdx.i.value.trim() ? num(cdx.i.value) : 0, dy = cdy.i.value.trim() ? num(cdy.i.value) : 0; valPrec.dx = valPrec.dy = ''; correr(dx, dy, `${m.id}: movido dx ${f2(dx)} · dy ${f2(dy)} m.`); });
    const f3 = mk('div', '', 'prec-fila'); f3.append(mk('span', 'Correr'), cdx.l, cdy.l, mover); panelPrec.append(f3);
    [cx.i, cy.i].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') llevar.click(); }));
    [cdx.i, cdy.i].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') mover.click(); }));
  }
  let escala = 20, ox = 0, oy = 0;
  // vista: acercar (rueda, pellizco, botones) y desplazar (arrastrar el fondo); zoom 1 = toda la planta
  let zoom = 1, centroVista = { x: 0, y: 0 };
  /** ancho útil de la última vista (sin el cuadro flotante de la derecha): el centro del zoom se mide sobre él */
  let wUtilVista = 0, firmaReservas = '0|0';
  /**
   * cuánto tapan las cartas abiertas a cada costado de la planta (px): las del dock y las sueltas que no se movieron a
   * mano. Las que aparecen solas al elegir algo (medidas del muro, precisión) no cuentan: si no, la planta saltaría al
   * tocar un muro y el muro se iría de abajo del cursor. Las de la izquierda corren el encuadre a la derecha y al revés; cada costado, a lo sumo el 40 % del ancho.
   */
  function reservasCartas(w: number): { izq: number; der: number } {
    const R = svg.getBoundingClientRect();
    if (!R.width) return { izq: 0, der: 0 };
    const cartas = [...cont.querySelectorAll<HTMLElement>(':scope > .calco-panel, :scope > .contorno-panel, :scope > .dock-planta')]
      .filter(e => !e.hidden && !e.classList.contains('movido') && !e.classList.contains('med-panel') && !e.classList.contains('prec-panel') && getComputedStyle(e).position === 'absolute' && (!e.classList.contains('dock-planta') || !!e.querySelector(':scope > .calco-panel:not([hidden])')));
    let izq = 0, der = 0;
    cartas.forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < R.top + 60) return;
      if ((r.left + r.right) / 2 < R.left + R.width / 2) izq = Math.max(izq, r.right - R.left + 12);
      else der = Math.max(der, R.right - r.left + 12);
    });
    return { izq: Math.min(izq, w * 0.4), der: Math.min(der, w * 0.4) };
  }
  const ZMIN = 0.5, ZMAX = 16;

  const aMundo = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left - ox) / escala, y: -(ev.clientY - r.top - oy) / escala };
  };

  /** ajuste: con la grilla de discretización encendida, a 0,05 m; apagada, a 0,01 m */
  const aj = (v: number) => { const pa = estado.grillaFina === false ? 0.01 : 0.05; return +(Math.round(v / pa) * pa).toFixed(2); };
  /** un solo dibujo por cuadro de pantalla: el lápiz y el mouse mandan muchos movimientos por cuadro */
  let cuadroPedido = 0;
  const pedirDibujo = () => { if (!cuadroPedido) cuadroPedido = requestAnimationFrame(() => { cuadroPedido = 0; dibujar(); }); };
  /** tipo de puntero del último toque (mouse, pen o touch): agranda imanes y zonas de agarre para el dedo y el lápiz */
  let tipoPuntero = 'mouse';
  const tolPx = () => (tipoPuntero === 'touch' ? 18 : tipoPuntero === 'pen' ? 12 : 8);
  /** el arrastre recién empieza cuando el puntero se movió unos píxeles: tocar para elegir no corre la pieza */
  let umbral: { x: number; y: number } | null = null;
  const pasoUmbral = (ev: PointerEvent) => {
    if (!umbral) return true;
    if (Math.hypot(ev.clientX - umbral.x, ev.clientY - umbral.y) < (ev.pointerType === 'mouse' ? 3 : 7)) return false;
    umbral = null; return true;
  };
  /** manijas de los vértices del contorno: se agregan al final para quedar arriba de los muros */
  let manijasSil: SVGElement[] = [];
  function dibujar() {
    if (cuadroPedido) { cancelAnimationFrame(cuadroPedido); cuadroPedido = 0; }
    manijasSil = [];
    const p = estado.proyecto;
    const iPB = p.niveles.reduce((k, n, i) => (n.cota >= 0 ? i : k), -1);
    // nivel elegido (por defecto PB)
    let iN = estado.nivelPlanta === null ? iPB : p.niveles.findIndex(n => Math.abs(n.cota - estado.nivelPlanta!) < 1e-6);
    if (iN < 0) { iN = iPB; estado.nivelPlanta = null; }
    const nivel = p.niveles[iN];
    selNivel.replaceChildren(...p.niveles.map((n, i) => { const o = document.createElement('option'); o.value = i === iPB ? '' : String(n.cota); o.textContent = `Planta: ${n.nombre}`; return o; }));
    selNivel.value = iN === iPB ? '' : String(nivel?.cota ?? '');
    if (rotulo) rotulo.textContent = '';
    iNivel = iN;
    const pl = plantaDeNivel(p, iN);
    recalcularAvisos();
    const conAviso = new Set(avisos.filter(a => a.muros && (a.tipo === 'sin-pieza' || a.cotas.some(z => Math.abs(z - (p.niveles[iN]?.cota ?? 0)) < 1e-6))).flatMap(a => a.muros!));
    const B = pl.B, L = pl.L;
    if (modo === 'silueta') armarPanelSil();
    const zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0, zTop = p.niveles[0]?.cota ?? 0;
    const zN = nivel?.cota ?? 0;
    const w = svg.clientWidth || 600, h = svg.clientHeight || 500;
    const ext = Math.max(B, L, ...p.muros.map(m => 2 * (Math.abs(m.x) + huella(m).ax / 2)), ...p.muros.map(m => 2 * (Math.abs(m.y) + huella(m).ay / 2))) + (w < 520 ? 12 : 6);   // en pantallas chicas, más margen para los rótulos
    // con un cuadro flotante abierto a la derecha (calar, insertar, silueta) la planta se encuadra en lo que queda
    // libre a su izquierda: si no, el cuadro tapaba justo los muros de ese lado
    // las cartas abiertas que el usuario no movió se reservan su costado (izquierdo o derecho, según dónde estén)
    const { izq: reservaI, der: reservaD } = w > 640 ? reservasCartas(w) : { izq: 0, der: 0 }, wUtil = w - reservaI - reservaD;
    escala = (Math.min(wUtil, h) / ext) * zoom;
    ox = reservaI + wUtil / 2 - centroVista.x * escala; oy = h / 2 + centroVista.y * escala;
    // (el centro de la vista en pantalla queda en wUtilVista / 2: lo usan el zoom y el pellizco)
    wUtilVista = 2 * reservaI + wUtil;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.replaceChildren();
    const X = (x: number) => ox + x * escala, Y = (y: number) => oy - y * escala;
    // grilla de 1 m
    const g = el('g', { class: 'grilla' });
    const n = Math.ceil(ext / 2);
    // la grilla cubre lo que se ve (con zoom y desplazamiento)
    const gx0 = Math.floor(-ox / escala) - 1, gx1 = Math.ceil((w - ox) / escala) + 1, gy0 = Math.floor((oy - h) / escala) - 1, gy1 = Math.ceil(oy / escala) + 1;
    for (let i = gx0; i <= gx1; i++) g.appendChild(el('line', { x1: X(i), y1: Y(gy0), x2: X(i), y2: Y(gy1), class: i % 5 ? 'g1' : 'g5' }));
    for (let i = gy0; i <= gy1; i++) g.appendChild(el('line', { x1: X(gx0), y1: Y(i), x2: X(gx1), y2: Y(i), class: i % 5 ? 'g1' : 'g5' }));
    svg.appendChild(g);
    // grilla de discretización de 0,05 m (se prende con el botón «Grilla 5 cm»): un solo trazo para que sea liviana;
    // si las líneas de 5 cm quedan a menos de 4 px, se dibujan las de 10 cm o 25 cm (el ajuste sigue a 5 cm)
    if (estado.grillaFina) {
      const paso = [0.05, 0.1, 0.25].find(q => q * escala >= 4);
      if (paso) {
        let d = '';
        const k0 = Math.floor(gx0 / paso), k1 = Math.ceil(gx1 / paso), j0 = Math.floor(gy0 / paso), j1 = Math.ceil(gy1 / paso);
        for (let k = k0; k <= k1; k++) { if (Math.abs(k * paso - Math.round(k * paso)) < 1e-9) continue; const x = X(k * paso).toFixed(1); d += `M${x} ${Y(gy0).toFixed(1)}V${Y(gy1).toFixed(1)}`; }
        for (let j = j0; j <= j1; j++) { if (Math.abs(j * paso - Math.round(j * paso)) < 1e-9) continue; const y = Y(j * paso).toFixed(1); d += `M${X(gx0).toFixed(1)} ${y}H${X(gx1).toFixed(1)}`; }
        svg.insertBefore(el('path', { d, class: 'grilla-fina' }), g);
      }
    }
    const c = estado.calco;
    if (c) {
      const alto = c.ancho * c.aspecto;
      svg.appendChild(el('image', { href: c.url, x: X(c.x - c.ancho / 2), y: Y(c.y + alto / 2), width: c.ancho * escala, height: alto * escala, opacity: c.opacidad, preserveAspectRatio: 'none', class: 'calco' }));
    }
    // dibujo de CAD (capas visibles), color según el uso de la capa
    const cad = estado.cad;
    if (cad) {
      const gc = el('g', { class: 'cad' });
      cad.ents.forEach((e: Entidad) => {
        const cfg = cad.capas[e.capa]; if (!cfg?.ver) return;
        const cl = `cad-${cfg.uso === 'carpintería' ? 'carpinteria' : cfg.uso}`;
        if (e.t === 'linea') gc.appendChild(el('line', { x1: X(e.a.x), y1: Y(e.a.y), x2: X(e.b.x), y2: Y(e.b.y), class: cl }));
        else if (e.t === 'poli') { const pp = puntosSilueta(e.v, 8); gc.appendChild(el(e.cerrada ? 'polygon' : 'polyline', { points: pp.map(q => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' '), class: cl })); }
        else if (e.t === 'circulo') gc.appendChild(el('circle', { cx: X(e.c.x), cy: Y(e.c.y), r: e.r * escala, class: cl }));
        else { const a0 = (e.a0 * Math.PI) / 180, a1 = (e.a1 * Math.PI) / 180, d = ((e.a1 - e.a0 + 360) % 360); gc.appendChild(el('path', { d: `M${X(e.c.x + e.r * Math.cos(a0))},${Y(e.c.y + e.r * Math.sin(a0))} A${e.r * escala},${e.r * escala} 0 ${d > 180 ? 1 : 0} 0 ${X(e.c.x + e.r * Math.cos(a1))},${Y(e.c.y + e.r * Math.sin(a1))}`, class: cl })); }
      });
      svg.appendChild(gc);
    }
    // carpintería del nivel: contorno y su caja (a máx × b máx), que es lo que se carga a mano como B y L
    const car = carpinteriaDeNivel(p, iN);
    if (car) {
      const pc = puntosSilueta(car.v);
      svg.appendChild(el('polygon', { points: pc.map(q => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' '), class: 'carpinteria' }));
      const xs = pc.map(q => q.x), ys = pc.map(q => q.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      svg.appendChild(el('rect', { x: X(x0), y: Y(y1), width: (x1 - x0) * escala, height: (y1 - y0) * escala, class: 'caja-carpinteria' }));
      const tx = el('text', { x: X(x0) + 4, y: Y(y1) - 6, class: 'etiqueta caja-txt' }, `carpintería: a máx ${car.a.toFixed(2).replace('.', ',')} × b máx ${car.b.toFixed(2).replace('.', ',')} m (B y L se cargan en Niveles)`);
      svg.appendChild(tx);
    }
    const contorno = puntosSilueta(pl.silueta);
    const pathC = el('polygon', { points: contorno.map(q => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' '), class: 'contorno' + (modo === 'silueta' && !editaCarp ? ' editando' : '') });
    svg.appendChild(pathC);
    if (modo === 'silueta') {
      const vEd = verticesEd();
      const objetivo = editaCarp ? el('polygon', { points: puntosSilueta(vEd).map(q => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' '), class: 'carpinteria editando' }) : pathC;
      if (editaCarp) svg.appendChild(objetivo);
      // doble clic en un borde: vértice nuevo en el tramo más cercano
      objetivo.addEventListener('dblclick', ev => {
        const q = aMundo(ev as unknown as PointerEvent);
        const v = vEd;
        let mejor = 0, dMin = Infinity;
        v.forEach((a, i) => { const b2 = v[(i + 1) % v.length]; const dx = b2.x - a.x, dy = b2.y - a.y; const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy || 1))); const d = Math.hypot(a.x + t * dx - q.x, a.y + t * dy - q.y); if (d < dMin) { dMin = d; mejor = i; } });
        estado.cambiar(() => { const s2 = siluetaPropia(); s2[mejor] = { ...s2[mejor], b: 0 }; s2.splice(mejor + 1, 0, { x: aj(q.x), y: aj(q.y) }); });
      });
      const tactil = matchMedia('(pointer: coarse)').matches;
      // las losas que genera un loft no se editan a mano (se recalculan solas): sin manijas
      (!editaCarp && (loftDeNivel(estado.proyecto, iNivel) || (estado.proyecto.perfilTorre && iNivel < nivelBase(estado.proyecto, estado.proyecto.perfilTorre) && !estado.proyecto.niveles[iNivel]?.manual)) || (editaCarp && (estado.proyecto.carpinteriaRetiro != null || !!estado.proyecto.carpinteriaTramos?.length)) ? [] : vEd).forEach((v, i) => {
        // manija: un círculo visible y otro invisible más grande para agarrarlo (con el dedo, más grande todavía)
        const hnd = el('g', { class: 'manija-vertice', tabindex: 0 });
        hnd.appendChild(el('circle', { cx: X(v.x), cy: Y(v.y), r: tactil ? 16 : 9, class: 'vertice-zona' }));
        hnd.appendChild(el('circle', { cx: X(v.x), cy: Y(v.y), r: tactil ? 6 : 4, class: 'vertice' + (editaCarp ? ' vertice-carp' : '') }));
        hnd.appendChild(el('title', {}, `vértice ${i + 1}: x ${v.x.toFixed(2)} · y ${v.y.toFixed(2)}${v.b ? ` · arco (bulge ${v.b.toFixed(3)})` : ''} · arrastrar para mover, clic derecho para borrar`));
        hnd.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); siluetaPropia(); arrastreV = i; vSel = i; umbral = { x: ev.clientX, y: ev.clientY }; try { svg.setPointerCapture(ev.pointerId); } catch { /* sintético */ } });
        hnd.addEventListener('contextmenu', ev => { ev.preventDefault(); if (vEd.length > 3) estado.cambiar(() => { siluetaPropia().splice(i, 1); }); });
        manijasSil.push(hnd);
      });
    }
    if (verAreas) {
      const a = areasDe(iN);
      // bordes entre áreas: cuadrados de 4 centros de celda; donde cambia el dueño se unen los medios de los lados
      // (como las curvas de nivel): queda una línea quebrada fina en vez de escalones
      let d = '';
      const own = (j: number, k: number) => (j < 0 || k < 0 || j >= a.ny || k >= a.nx ? -1 : a.duenio[j * a.nx + k]);
      const cx = (k: number) => X(a.x0 + (k + 0.5) * a.paso), cy = (j: number) => Y(a.y0 + (j + 0.5) * a.paso);
      for (let j = 0; j < a.ny - 1; j++) for (let k = 0; k < a.nx - 1; k++) {
        const o0 = own(j, k), o1 = own(j, k + 1), o2 = own(j + 1, k + 1), o3 = own(j + 1, k);
        if (o0 < 0 || o1 < 0 || o2 < 0 || o3 < 0) continue;
        const xa = cx(k), xb = cx(k + 1), ya = cy(j), yb = cy(j + 1), xm = (xa + xb) / 2, ym = (ya + yb) / 2;
        const ms2: [number, number][] = [];
        if (o0 !== o1) ms2.push([xm, ya]);
        if (o1 !== o2) ms2.push([xb, ym]);
        if (o3 !== o2) ms2.push([xm, yb]);
        if (o0 !== o3) ms2.push([xa, ym]);
        if (ms2.length === 2) d += `M${ms2[0][0].toFixed(1)},${ms2[0][1].toFixed(1)}L${ms2[1][0].toFixed(1)},${ms2[1][1].toFixed(1)}`;
        else if (ms2.length > 2) ms2.forEach(([x, y]) => { d += `M${x.toFixed(1)},${y.toFixed(1)}L${xm.toFixed(1)},${ym.toFixed(1)}`; });
      }
      const ga = el('g', { class: 'areas-inf' });
      // relleno por grupo (color y rayado); una tira por fila y por grupo, para que sea liviano
      const orden = ordenClaves(a), porId = new Map(p.muros.map(m => [m.id, m]));
      const claveDe = a.ids.map(id => claveArea(porId.get(id)).k);
      const defsA = el('defs');
      const usados = new Set<string>();
      const patron = (k: string) => {
        const st = estiloArea(k, orden.get(k) ?? 0), id = `ar-${st.rayado}-${st.color.slice(1)}`;
        if (!usados.has(id)) {
          usados.add(id);
          const pt = el('pattern', { id, patternUnits: 'userSpaceOnUse', width: 8, height: 8, patternTransform: st.rayado === 'd45' ? 'rotate(45)' : st.rayado === 'd135' ? 'rotate(-45)' : st.rayado === 'v' ? 'rotate(90)' : '' });
          pt.appendChild(el('rect', { width: 8, height: 8, fill: st.color, 'fill-opacity': 0.22 }));
          pt.appendChild(el('line', { x1: 0, y1: 0, x2: 0, y2: 8, stroke: st.color, 'stroke-width': 1.4, 'stroke-opacity': 0.55 }));
          defsA.appendChild(pt);
        }
        return `url(#${id})`;
      };
      const relleno = el('g', { class: 'areas-relleno' });
      for (let j = 0; j < a.ny; j++) {
        let k = 0;
        while (k < a.nx) {
          const o = a.duenio[j * a.nx + k];
          if (o < 0) { k++; continue; }
          const c = claveDe[o]; let k2 = k + 1;
          while (k2 < a.nx && a.duenio[j * a.nx + k2] >= 0 && claveDe[a.duenio[j * a.nx + k2]] === c) k2++;
          const x0 = X(a.x0 + k * a.paso), x1 = X(a.x0 + k2 * a.paso), y0 = Y(a.y0 + (j + 1) * a.paso), y1 = Y(a.y0 + j * a.paso);
          relleno.appendChild(el('rect', { x: x0.toFixed(1), y: y0.toFixed(1), width: (x1 - x0 + 0.4).toFixed(1), height: (y1 - y0 + 0.4).toFixed(1), fill: patron(c) }));
          k = k2;
        }
      }
      ga.appendChild(defsA);
      ga.appendChild(relleno);
      ga.appendChild(el('path', { d, class: 'areas-borde' }));
      a.ids.forEach(id => {
        const v = a.area[id];
        if (!v) return;
        // el rótulo va en el centro del área; si ahí pisa otro texto o un muro, se prueban lugares alrededor (al final)
        const c = a.centro[id];
        const mu = p.muros.find(o => o.id === id);
        const cands: [number, number][] = [[c.x, c.y]];
        if (mu) {
          const { ax, ay } = huella(mu);
          for (const dd of [1.2, 2, 3]) cands.push([c.x, c.y + dd], [c.x, c.y - dd], [mu.x + ax / 2 + dd, mu.y], [mu.x - ax / 2 - dd, mu.y], [mu.x, mu.y + ay / 2 + dd * 0.7], [mu.x, mu.y - ay / 2 - dd * 0.7]);
        }
        const t = el('text', { x: X(c.x), y: Y(c.y) + 4, class: 'etiqueta areas-txt', 'text-anchor': 'middle' }, `${v.toFixed(1).replace('.', ',')} m²`);
        t.appendChild(el('title', {}, `${id}: ${v.toFixed(2).replace('.', ',')} m² de losa`));
        t.dataset.cands = JSON.stringify(cands.map(([x, y]) => [X(x), Y(y) + 4]));
        ga.appendChild(t);
      });
      svg.appendChild(ga);
      armarPanelAreas(iN, a);
    } else panelAreas.hidden = true;
    svg.appendChild(el('line', { x1: X(0), y1: Y(-n), x2: X(0), y2: Y(n), class: 'eje' }));
    svg.appendChild(el('line', { x1: X(-n), y1: Y(0), x2: X(n), y2: Y(0), class: 'eje' }));
    // ejes de inercia y centro de rigidez (con los valores elegidos: planilla o guía/CIRSOC)
    const c0 = estado.calculo;
    const r = c0.valores;
    const xA = r?.rotA.J7, yB = r?.rotB.J7;
    if (xA !== undefined && isFinite(xA) && estado.dir === 'A') svg.appendChild(el('line', { x1: X(xA), y1: Y(-n), x2: X(xA), y2: Y(n), class: 'inercia' }));
    if (yB !== undefined && isFinite(yB) && estado.dir === 'B') svg.appendChild(el('line', { x1: X(-n), y1: Y(yB), x2: X(n), y2: Y(yB), class: 'inercia' }));
    if (xA !== undefined && yB !== undefined && isFinite(xA) && isFinite(yB)) {
      const cr = el('circle', { cx: X(xA), cy: Y(yB), r: 5, class: 'cr' });
      cr.appendChild(el('title', {}, `Centro de rigidez: x = ${xA.toFixed(2)} m, y = ${yB.toFixed(2)} m (cruce de los ejes de inercia)`));
      svg.appendChild(cr);
      svg.appendChild(el('text', { x: X(xA) + 7, y: Y(yB) - 7, class: 'etiqueta' }, 'CR'));
    }
    // viento
    const fl = el('g', { class: 'viento' });
    if (estado.dir === 'A') { fl.appendChild(el('line', { x1: X(0), y1: Y(-L / 2 - 4.5), x2: X(0), y2: Y(-L / 2 - 1.2), 'marker-end': 'url(#punta)' })); fl.appendChild(el('text', { x: X(0.6), y: Y(-L / 2 - 3.5) }, 'viento A')); }
    else { fl.appendChild(el('line', { x1: X(-B / 2 - 4.5), y1: Y(0), x2: X(-B / 2 - 1.2), y2: Y(0), 'marker-end': 'url(#punta)' })); fl.appendChild(el('text', { x: X(-B / 2 - 4.5), y: Y(2.4) }, 'viento B')); }   // arriba de la flecha, lejos de los rótulos de los muros
    const defs = el('defs');
    const mk = el('marker', { id: 'punta', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
    mk.appendChild(el('path', { d: 'M0,0 L10,5 L0,10 z', class: 'punta' }));
    defs.appendChild(mk);
    svg.appendChild(defs);
    svg.appendChild(fl);
    // vigas de los pórticos: una línea entre las dos columnas de cada grupo (va debajo de los muros)
    const porGrupo = new Map<string, typeof p.muros>();
    p.muros.filter(m => m.portico).forEach(m => { const k = m.grupo || m.piezaA || m.id; porGrupo.set(k, [...(porGrupo.get(k) ?? []), m]); });
    porGrupo.forEach(cs => { if (cs.length === 2) svg.appendChild(el('line', { x1: X(cs[0].x), y1: Y(cs[0].y), x2: X(cs[1].x), y2: Y(cs[1].y), class: 'viga-portico' })); });
    // huecos de la losa de este nivel (ascensores, escaleras): rayados con la cruz de un pleno
    (p.huecosLosa ?? []).forEach(hh => {
      if (!huecoEn(hh, zN) || hh.v.length < 3) return;
      const pts = hh.v.map(q => `${X(q.x)},${Y(q.y)}`).join(' ');
      const g = el('g', { class: 'hueco-losa' + (hh.id === huecoSel ? ' sel' : '') });
      g.appendChild(el('polygon', { points: pts }));
      if (hh.v.length === 4) { g.appendChild(el('line', { x1: X(hh.v[0].x), y1: Y(hh.v[0].y), x2: X(hh.v[2].x), y2: Y(hh.v[2].y) })); g.appendChild(el('line', { x1: X(hh.v[1].x), y1: Y(hh.v[1].y), x2: X(hh.v[3].x), y2: Y(hh.v[3].y) })); }
      const cx = hh.v.reduce((a, q) => a + q.x, 0) / hh.v.length, cy = hh.v.reduce((a, q) => a + q.y, 0) / hh.v.length;
      g.appendChild(el('text', { x: X(cx), y: Y(cy) - 6, class: 'etiqueta hueco-txt', 'text-anchor': 'middle' }, hh.nombre));
      g.appendChild(el('title', {}, `${hh.nombre}: hueco de la losa (no carga a los muros)`));
      svg.appendChild(g);
    });
    if (modo === 'calar' && calQue === 'losa' && losaIni && cursorLosa) svg.appendChild(el('polygon', { points: rectHueco(losaIni, cursorLosa).map(q => `${X(q.x)},${Y(q.y)}`).join(' '), class: 'hueco-previa' }));
    // juntas entre los muros de este nivel: se dibujan unidos (debajo, el contorno de todos; arriba, el relleno sin borde)
    const msNivel = p.muros.filter(m => !muroOculto(p, m) && presenteEn(m, zN, zFund, zTop));
    const juntasN = estado.juntasLimpias ? detectarJuntas(msNivel) : [];
    // quién pasa: el de las hojas J para el viento elegido (el ala, perpendicular al viento), salvo que se elija otro
    const limpias = estado.juntasLimpias ? huellasLimpias(msNivel, juntasN, p.juntas ?? {}, estado.dir) : new Map<string, { x: number; y: number }[][]>();
    const ptsPg = (pg: { x: number; y: number }[]) => pg.map(q => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' ');
    if (limpias.size) {
      const gc = el('g', { class: 'juntas-contorno' });
      limpias.forEach(pgs => pgs.forEach(pg => gc.appendChild(el('polygon', { points: ptsPg(pg) }))));
      svg.appendChild(gc);
    }
    // muros
    const papeles = estado.calculo.asig?.papeles ?? {};
    const yaRotuladas = new Set<string>();
    const enMulti = (m: Muro) => estado.multi.m.includes(m.id) || estado.multi.g.some(g => dentroDe(p, m, g));
    p.muros.forEach(m => {
      if (muroOculto(p, m)) return;
      const papel = papeles[m.id]?.[estado.dir] ?? 'sin pieza';
      const { ax: dx, ay: dy } = huella(m);
      const t = tipoDe(m);
      const esta = presenteEn(m, zN, zFund, zTop);
      const grupoSel = (!!m.grupo && p.muros.find(x => x.id === estado.seleccion)?.grupo === m.grupo) || (!!estado.grupoSel && estado.grupoSel !== estado.contexto && dentroDe(p, m, estado.grupoSel));
      const fueraCtx = !dentroDe(p, m, estado.contexto), bloq = muroBloqueado(p, m);
      const grupo = el('g', { 'data-muro': m.id, class: 'muro' + (estado.seleccion === m.id && !estado.grupoSel ? ' sel' : grupoSel || estado.seleccion === m.id ? ' sel-grupo' : '') + (m.llega ? '' : ' fuera') + (esta ? '' : ' ausente') + (fueraCtx ? ' fuera-ctx' : '') + (bloq ? ' bloqueado' : '') + (enMulti(m) ? ' multi' : '') + (conAviso.has(m.id) ? ' con-aviso' : ''), 'data-id': m.id, tabindex: 0 });
      const forma = el('g');
      if (limpias.has(m.id)) limpias.get(m.id)!.forEach(pg => forma.appendChild(el('polygon', { points: ptsPg(pg), fill: COLORES[papel], class: 'limpio' })));
      else if (t === 'perfil') {
        const pp = enPlanta(m), anillo = (vs: typeof pp.v) => { const ps = polilinea(vs, 4, 20); return `M${ps.map(q => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' L')} Z`; };
        forma.appendChild(el('path', { d: [pp.v, ...(pp.huecos ?? [])].map(anillo).join(' '), fill: COLORES[papel], 'fill-rule': 'evenodd', class: 'perfil' }));
      } else if (t === 'tubo-circ') {
        forma.appendChild(el('circle', { cx: X(m.x), cy: Y(m.y), r: (m.largo / 2) * escala, fill: COLORES[papel] }));
        if (dInterior(m) > 0) forma.appendChild(el('circle', { cx: X(m.x), cy: Y(m.y), r: (dInterior(m) / 2) * escala, class: 'hueco' }));
      } else rectangulos(m).forEach(r => forma.appendChild(el('rect', { x: X(r.x - r.ax / 2), y: Y(r.y + r.ay / 2), width: Math.max(2, r.ax * escala), height: Math.max(2, r.ay * escala), fill: COLORES[papel] })));
      grupo.appendChild(forma);
      const pieza = estado.dir === 'A' ? m.piezaA : m.piezaB;
      // etiqueta del lado de afuera (lejos del centro de la planta), para no tapar los muros del núcleo
      const izq = m.x < 0, abajo = m.y < 0;
      const vertical = t !== 'tabique' || m.dir === 'Y';
      const lx = vertical ? (izq ? X(m.x - dx / 2) - 4 : X(m.x + dx / 2) + 4) : X(m.x);
      const ly = vertical ? Y(m.y) + 4 : abajo ? Y(m.y - dy / 2) + 13 : Y(m.y + dy / 2) - 5;
      const ancla = vertical ? (izq ? 'end' : 'start') : 'middle';
      // con muchos muros, un solo rótulo por pieza (el del primer muro) para que la planta se pueda leer
      const muchos = p.muros.length > 24;
      const rot = !muchos ? `${m.id}${pieza ? ' · ' + pieza : ''}` : pieza && !yaRotuladas.has(pieza) ? pieza : '';
      if (pieza) yaRotuladas.add(pieza);
      if (rot && esta) grupo.appendChild(el('text', { x: lx, y: ly, class: 'etiqueta', 'text-anchor': ancla }, rot));
      grupo.appendChild(el('title', {}, `${m.id}${pieza ? ' · pieza ' + pieza : ''} · ${papel}${esta ? '' : ' · no está en este nivel'}`));
      grupo.addEventListener('pointerdown', ev => {
        if (modo !== 'mover') return;
        ev.preventDefault();
        const nodo = nodoAlTocar(estado.proyecto, m, estado.contexto);
        if (!nodo) { mensaje('Ese muro está fuera del grupo que estás editando: Esc o «Salir» para volver a la planta.'); return; }
        if (ev.shiftKey || ev.ctrlKey || ev.metaKey || estado.eligeVarios) { ev.stopPropagation(); alternarMulti(m); return; }
        if (!enMultiM(m) && (estado.multi.m.length || estado.multi.g.length)) estado.multi = { m: [], g: [] };   // tocar otra cosa suelta la selección (como en CAD)
        if (muroBloqueado(estado.proyecto, m)) { const g = ancestros(estado.proyecto, m.gd).find(x => x.bloq); mensaje(`${m.id} está en «${g?.nombre ?? 'un grupo'}», que está bloqueado 🔒: desbloquealo en el Esquema para moverlo o editarlo.`); estado.grupoSel = g?.id ?? null; estado.avisarPanel(); return; }
        ultimoEspesor = m.espesor;
        const fijoG = muroFijo(estado.proyecto, m);
        const ahoraG = performance.now();
        if (nodo.t === 'g' && ultimoToque && ultimoToque.id === m.id && ahoraG - ultimoToque.t < 450) {
          // doble clic en un grupo: se entra a editarlo
          ultimoToque = null; estado.contexto = nodo.id; estado.grupoSel = null; estado.seleccion = m.id;
          mensaje(`Editando «${grupoPorId(estado.proyecto, nodo.id)?.nombre}»: el resto queda atenuado. Esc o «Salir» para volver.`);
          estado.avisarPanel(); return;
        }
        estado.grupoSel = nodo.t === 'g' ? nodo.id : null;
        // doble clic propio (la planta se redibuja entre los dos clics y el navegador no lo cuenta): abre las medidas de la pieza
        const ahora = performance.now();
        if (ultimoToque && ultimoToque.id === m.id && ahora - ultimoToque.t < 450) { ultimoToque = null; abrirMedidas(m); return; }
        ultimoToque = { id: m.id, t: ahora };
        estado.seleccion = m.id;
        // un clic elige (como en ArchiCAD): el muro queda en el conjunto de selección («1 elegido»); Mayús + clic suma o saca
        if (nodo.t === 'm' && !enMultiM(m)) estado.multi = { m: [m.id], g: [] };
        const q = aMundo(ev);
        // cerca de una esquina (o de otro nodo) del elemento: se agarra desde ese nodo, con imán a los nodos de los demás
        const nd = nodosDe(m).map(n => ({ n, d: Math.hypot(n.x - q.x, n.y - q.y) * escala })).sort((a, b) => a.d - b.d || (a.n.t === 'esquina' ? -1 : 1))[0];
        if (nd && nd.d <= 10 && nd.n.t !== 'centro' && !fijoG) {
          const ids = compas(m);
          umbral = { x: ev.clientX, y: ev.clientY };
          arrastreNodo = { p: { x: nd.n.x, y: nd.n.y }, orig: estado.proyecto.muros.filter(o => ids.includes(o.id)).map(o => ({ id: o.id, x: o.x, y: o.y })) };
          refNodo = nodosDe(m).findIndex(o => o.x === nd.n.x && o.y === nd.n.y); clavePrec = '';
          try { svg.setPointerCapture(ev.pointerId); } catch { /* sintético */ }
          estado.cambiar();
          return;
        }
        // fijo en su lugar 📌: se elige (y se entra con doble clic) pero no se arrastra
        if (fijoG) { mensaje(`${m.id} está en «${fijoG.nombre}», fijo en su lugar 📌: no se mueve. Soltalo en el Esquema para moverlo.`); estado.avisarSeleccion(); return; }
        umbral = { x: ev.clientX, y: ev.clientY };
        const compasSel = compas(m);
        arrastre = { id: m.id, x0: m.x, y0: m.y, mx: q.x, my: q.y, otros: estado.proyecto.muros.filter(o => o.id !== m.id && compasSel.includes(o.id)).map(o => ({ id: o.id, x: o.x, y: o.y })) };
        try { svg.setPointerCapture(ev.pointerId); } catch { /* puntero sintético: se arrastra igual */ }
        estado.cambiar();
      });
      svg.appendChild(grupo);
    });
    // caja del grupo elegido y de los elegidos para agrupar
    const caja = (ms: Muro[], cls: string, rot: string) => {
      if (!ms.length) return;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      ms.forEach(w => { const k = cajaMuro(w); x0 = Math.min(x0, k.x0); x1 = Math.max(x1, k.x1); y0 = Math.min(y0, k.y0); y1 = Math.max(y1, k.y1); });
      const pad = 6;
      svg.appendChild(el('rect', { x: X(x0) - pad, y: Y(y1) - pad, width: (x1 - x0) * escala + 2 * pad, height: (y1 - y0) * escala + 2 * pad, class: cls }));
      if (rot) svg.appendChild(el('text', { x: X(x0) - pad, y: Y(y1) - pad - 4, class: `${cls}-rot` }, rot));
    };
    if (estado.contexto) { const g = grupoPorId(p, estado.contexto); caja(murosDe(p, estado.contexto), 'caja-ctx', ''); void g; }
    if (estado.grupoSel && estado.grupoSel !== estado.contexto) {
      const g = grupoPorId(p, estado.grupoSel);
      if (g) caja(murosDe(p, g.id).filter(w => !muroOculto(p, w)), 'caja-grupo' + (g.comp ? ' comp' : '') + (g.bloq ? ' bloq' : ''), `${g.bloq ? '🔒 ' : ''}${g.nombre}${g.comp ? ' · componente' : ''}`);
    }
    estado.multi.g.forEach(id => caja(murosDe(p, id), 'caja-multi', ''));
    gui.capa({ X, Y, escala });
    col.capa({ X, Y, escala });
    edc.capa({ X, Y, escala });
    if (modo === 'silueta' && !editaCarp) {
      // lado elegido para un saliente (resaltado) y el contorno que se dibuja a mano
      const lados = ladosLosa(pl.silueta), w = antihorario(pl.silueta);
      // vista previa (fantasma): la forma elegida o el contorno con el balcón o el retiro, antes de aplicarlos
      if (!trazo && dc.previa) {
        const v = dc.previa === 'forma' ? formaLosa(dc.forma, dc.med) : salienteEnLado(pl.silueta, dc.lado, dc.ancho, (dc.previa === 'meter' ? -1 : 1) * Math.abs(dc.prof), dc.centro);
        if (!('error' in v)) {
          const ps = puntosSilueta(v, 6), c = cajaSilueta(v);
          const g = el('g', { class: 'previa-losa' });
          g.append(el('polygon', { points: ps.map(q => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' ') }));
          const t = el('text', { x: X(c.cx), y: Y(c.cy + c.L / 2) - 8, 'text-anchor': 'middle' });
          t.textContent = `vista previa · ${c.B.toFixed(2).replace('.', ',')} × ${c.L.toFixed(2).replace('.', ',')} m · ${areaSilueta(v).toFixed(1).replace('.', ',')} m²`;
          g.append(t);
          svg.append(g);
        }
      }
      if (!trazo && lados[dc.lado] && (dc.abierto ?? true)) {
        const a = w[dc.lado], b2 = w[(dc.lado + 1) % w.length];
        svg.append(el('line', { x1: X(a.x), y1: Y(a.y), x2: X(b2.x), y2: Y(b2.y), class: 'lado-saliente' }));
      }
      if (trazo) {
        const g = el('g', { class: 'trazo-losa' });
        const pts = [...trazo, ...(trazoCursor ? [trazoCursor] : [])];
        if (pts.length >= 2) g.append(el('polyline', { points: pts.map(q => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' ') }));
        if (trazo.length >= 3 && trazoCursor) g.append(el('line', { x1: X(trazoCursor.x), y1: Y(trazoCursor.y), x2: X(trazo[0].x), y2: Y(trazo[0].y), class: 'cierre' }));
        trazo.forEach((q, k) => g.append(el('circle', { cx: X(q.x), cy: Y(q.y), r: k === 0 ? 7 : 4, class: k === 0 ? 'primero' : '' })));
        if (trazoCursor && trazo.length) { const u = trazo[trazo.length - 1], t = el('text', { x: X(trazoCursor.x) + 10, y: Y(trazoCursor.y) - 10, class: 'medida-trazo' }); t.textContent = `${Math.hypot(trazoCursor.x - u.x, trazoCursor.y - u.y).toFixed(2).replace('.', ',')} m${ultimoIman ? ` · ${ultimoIman}` : ''}`; g.append(t); }
        else if (trazoCursor && ultimoIman) { const t = el('text', { x: X(trazoCursor.x) + 10, y: Y(trazoCursor.y) - 10, class: 'medida-trazo' }); t.textContent = ultimoIman; g.append(t); }
        if (trazoCursor) guiasIman.forEach(gi => { g.append(el('line', { x1: X(gi.de.x), y1: Y(gi.de.y), x2: X(gi.a.x), y2: Y(gi.a.y), class: 'guia-inferencia' }), el('circle', { cx: X(gi.de.x), cy: Y(gi.de.y), r: 3, class: 'guia-inferencia-punto' })); });
        svg.append(g);
      }
    }
    if (lazo && lazo.pts.length > 1) {
      const pol = opLazo.forma === 'rect' ? rectPol(lazo.pts[0], lazo.pts[1]) : lazo.pts;
      const crit = opLazo.forma === 'rect' && opLazo.criterio === 'auto' ? (lazo.pts[1].x >= lazo.pts[0].x ? 'entero' : 'tocando') : opLazo.criterio;
      svg.appendChild(el('polygon', { points: pol.map(q => `${X(q.x)},${Y(q.y)}`).join(' '), class: `lazo-traza ${lazo.op} crit-${crit}` }));
    }
    barraLazo.hidden = modo !== 'lazo';
    barraDib.hidden = modo !== 'dibujar';
    if (modo === 'dibujar' && document.activeElement !== iEsp) iEsp.value = String(ultimoEspesor).replace('.', ',');
    const nSel = estado.multi.m.length + estado.multi.g.length;
    barraSel.hidden = !nSel;
    const gB = !nSel && estado.grupoSel && estado.grupoSel !== estado.contexto ? grupoPorId(p, estado.grupoSel) : undefined;
    barraGrupo.hidden = !gB || modo !== 'mover';
    bDesagSel.hidden = !estado.multi.g.length;
    bDesagTodo.hidden = !gB || subgrupos(p, gB.id).length < 2;
    if (gB) { nombreGrupo.textContent = `${gB.bloq ? '🔒 ' : ''}${gB.nombre}${gB.comp ? ' ◆' : ''}`; barraGrupo.querySelectorAll('button').forEach(b => { (b as HTMLButtonElement).disabled = !!gB.bloq && b.textContent !== 'Duplicar' && b.textContent !== 'Copia vinculada'; }); }
    if (nSel) ponerBotonFuera(bFueraSel, false);
    if (gB) ponerBotonFuera(bFueraGrupo, true);
    if (nSel) { const g = estado.multi.g.length; cuentaSel.textContent = `${nSel} elegido${nSel > 1 ? 's' : ''}${g ? ` (${g} grupo${g > 1 ? 's' : ''})` : ''}`; armarListaSel(); } else listaSel.hidden = true;
    barraCtx.hidden = !estado.contexto;
    if (estado.contexto) {
      const cad = ancestros(p, estado.contexto).reverse();
      barraCtx.replaceChildren(...[document.createTextNode('Editando: '), ...cad.flatMap((g, i) => { const b = document.createElement('b'); b.textContent = g.nombre; return i ? [document.createTextNode(' › '), b] : [b]; }), desagCtx, salirCtx]);
    }
    calib.forEach(q => svg.appendChild(el('circle', { cx: X(q.x), cy: Y(q.y), r: 4, class: 'iman extremo' })));
    // nodos del elemento elegido (modo mover): se arrastran para ubicarlo con precisión
    // nodos del elegido y del que tiene el mouse encima: se arrastran desde ahí (esquinas, medios, centro)
    const elegidoSel = modo === 'mover' ? p.muros.find(m => m.id === estado.seleccion && !muroBloqueado(p, m) && !muroOculto(p, m) && dentroDe(p, m, estado.contexto)) : undefined;
    const enHover = modo === 'mover' && !arrastre && !arrastreNodo && hoverId && hoverId !== estado.seleccion ? p.muros.find(m => m.id === hoverId && !muroBloqueado(p, m) && !muroOculto(p, m) && dentroDe(p, m, estado.contexto)) : undefined;
    [elegidoSel, enHover].forEach((elegido, k) => {
      if (!elegido || !presenteEn(elegido, zN, zFund, zTop)) return;
      const gg = el('g', { class: 'nodos' + (k ? ' nodos-hover' : '') });
      const lista = nodosDe(elegido);
      // en muros finos las esquinas y los medios de los lados cortos quedan pegados: se dibuja uno solo
      // (primero el centro, después las esquinas, después los medios)
      const puestos: [number, number][] = [];
      const prio = { centro: 0, esquina: 1, medio: 2 } as const;
      const visibles = new Set(lista.map((nd, i) => ({ nd, i })).sort((u, v) => prio[u.nd.t] - prio[v.nd.t]).filter(({ nd }) => {
        const x = X(nd.x), y = Y(nd.y), esRef = !k && refNodo >= 0 ? nd === lista[refNodo] : false;
        if (!esRef && puestos.some(([a, b]) => Math.hypot(a - x, b - y) < 5)) return false;
        puestos.push([x, y]); return true;
      }).map(o => o.nd));
      lista.forEach(ndDibujado => {
        if (!visibles.has(ndDibujado)) return;
        const nd = ndDibujado;
        const x = X(nd.x), y = Y(nd.y);
        const esRef = !k && (refNodo >= 0 ? nd === lista[refNodo] : nd.t === 'centro');
        // marca chica (no tapa el muro) y un círculo invisible más grande para agarrarla fácil
        const forma = el('g', { class: `nodo nodo-${nd.t}` });
        forma.appendChild(el('circle', { cx: x, cy: y, r: tolPx() + 2, class: 'hit' }));
        forma.appendChild(nd.t === 'esquina' ? el('rect', { x: x - 1.8, y: y - 1.8, width: 3.6, height: 3.6 })
          : nd.t === 'medio' ? el('polygon', { points: `${x},${y - 2.5} ${x - 2.2},${y + 1.8} ${x + 2.2},${y + 1.8}` })
            : el('polygon', { points: `${x},${y - 3} ${x + 3},${y} ${x},${y + 3} ${x - 3},${y}`, class: 'centro' }));
        forma.appendChild(el('title', {}, `Arrastrar desde ${nd.t === 'esquina' ? 'esta esquina' : nd.t === 'medio' ? 'el medio de este lado' : 'el centro'}: se pega a los nodos del plano o de otros muros${elegido.grupo ? ' (mueve el grupo entero)' : ''}`));
        forma.addEventListener('pointerdown', e0 => {
          const ev = e0 as PointerEvent;
          ev.preventDefault(); ev.stopPropagation();
          // Mayús + clic sobre los nodos del elegido también suma o saca de la selección (como sobre el muro)
          if (ev.shiftKey || ev.ctrlKey || ev.metaKey || estado.eligeVarios) { alternarMulti(elegido); return; }
          // en muros finos los círculos de agarre se superponen: vale el nodo visible más cercano al puntero
          const qq = aMundo(ev);
          const nd = [...visibles].sort((u, v) => Math.hypot(u.x - qq.x, u.y - qq.y) - Math.hypot(v.x - qq.x, v.y - qq.y))[0] ?? ndDibujado;
          // el segundo clic de un doble clic suele caer en un nodo del elemento recién elegido
          const ahora = performance.now();
          if (ultimoToque && ultimoToque.id === elegido.id && ahora - ultimoToque.t < 450) {
            ultimoToque = null;
            const nodo = nodoAlTocar(estado.proyecto, elegido, estado.contexto);
            if (nodo?.t === 'g') { estado.contexto = nodo.id; estado.grupoSel = null; mensaje(`Editando «${grupoPorId(estado.proyecto, nodo.id)?.nombre}»: el resto queda atenuado. Esc o «Salir» para volver.`); estado.avisarPanel(); return; }
            abrirMedidas(elegido); return;
          }
          ultimoToque = { id: elegido.id, t: ahora };
          if (k) { estado.seleccion = elegido.id; hoverId = null; }
          refNodo = nodosDe(elegido).findIndex(o => o.x === nd.x && o.y === nd.y); clavePrec = '';
          if (muroBloqueado(p, elegido)) return;
          const ids = compas(elegido);
          umbral = { x: ev.clientX, y: ev.clientY };
          arrastreNodo = { p: { x: nd.x, y: nd.y }, orig: p.muros.filter(o => ids.includes(o.id)).map(o => ({ id: o.id, x: o.x, y: o.y })) };
          try { svg.setPointerCapture(ev.pointerId); } catch { /* sintético */ }
        });
        if (esRef) forma.classList.add('ref');
        gg.appendChild(forma);
      });
      svg.appendChild(gg);
    });
    armarPanelPrec();
    if (medGrupo) { panelPrec.hidden = true; if (!panelMed.contains(document.activeElement)) armarPanelMed(); }
    // aberturas (puertas y ventanas) de los elementos enteros: el hueco marcado sobre el elemento, que se sigue viendo completo
    p.muros.forEach(m => {
      if (!m.aberturas?.length || !presenteEn(m, zN, zFund, zTop) || muroOculto(p, m)) return;
      m.aberturas.forEach(a => marcasAbertura(m, a).forEach(pg => {
        svg.appendChild(el('polygon', { points: pg.map(q => `${X(q.x)},${Y(q.y)}`).join(' '), class: `abertura ${a.desde > 1e-6 ? 'ventana' : 'puerta'}` }));
      }));
    });
    // en «Calar»: la abertura elegida, con sus cotas, y el vano elegido
    if (modo === 'calar') {
      const w = abSel && p.muros.find(x => x.id === abSel!.id), a = w && w.aberturas?.[abSel!.i];
      if (w && a) {
        marcasAbertura(w, a).forEach(pg => svg.appendChild(el('polygon', { points: pg.map(q => `${X(q.x)},${Y(q.y)}`).join(' '), class: 'abertura-sel' })));
        const k = caraAbertura(w, a); if (k) svg.appendChild(dibCotasCara(X, Y, escala, k, a.s - a.ancho / 2, a.s + a.ancho / 2, 'sel', [...refsGuia(k), ...refsCalados(w, a.cara, abSel!.i)]));
      }
      const vm = vanoSel && p.muros.find(x => x.id === vanoSel), vo = vm && vm.vano && p.muros.find(x => x.id === vm.vano!.con);
      if (vm && vo) {
        const s0 = (vm.dir === 'X' ? vm.x : vm.y) - vm.largo / 2, s1 = (vo.dir === 'X' ? vo.x : vo.y) + vo.largo / 2, c = (s0 + s1) / 2;
        const k: Cara = { o: vm.dir === 'X' ? { x: c, y: vm.y } : { x: vm.x, y: c }, u: vm.dir === 'X' ? { x: 1, y: 0 } : { x: 0, y: 1 }, n: vm.dir === 'X' ? { x: 0, y: 1 } : { x: -1, y: 0 }, L: s1 - s0, e: vm.espesor };
        const g0 = vm.largo - (s1 - s0) / 2, g1 = g0 + vm.vano!.ancho;
        const P = (t: number, d: number) => ({ x: k.o.x + k.u.x * t + k.n.x * d, y: k.o.y + k.u.y * t + k.n.y * d });
        const pg = [P(g0, -k.e / 2 - 0.05), P(g1, -k.e / 2 - 0.05), P(g1, k.e / 2 + 0.05), P(g0, k.e / 2 + 0.05)];
        svg.appendChild(el('polygon', { points: pg.map(q => `${X(q.x)},${Y(q.y)}`).join(' '), class: 'abertura-sel' }));
        svg.appendChild(dibCotasCara(X, Y, escala, k, g0, g1, 'sel', refsGuia(k)));
      }
    }
    // vanos calados: el dintel (puertas) en trazos entre los dos tramos
    p.muros.forEach(m => {
      if (!m.vano || !presenteEn(m, zN, zFund, zTop)) return;
      const o = p.muros.find(x => x.id === m.vano!.con);
      if (!o) return;
      const fin = (w: Muro, lado: 1 | -1) => (w.dir === 'X' ? { x: w.x + lado * w.largo / 2, y: w.y } : { x: w.x, y: w.y + lado * w.largo / 2 });
      const a = fin(m, 1), b = fin(o, -1);
      const cl = m.vano.tipo === 'dintel' ? 'dintel' : 'hueco-vano';
      svg.appendChild(el('line', { x1: X(a.x), y1: Y(a.y), x2: X(b.x), y2: Y(b.y), class: cl }));
    });
    if (modo === 'calar' && previaCalar && calTipo !== 'hueco') {
      const w = p.muros.find(x => x.id === previaCalar!.id);
      const ab = w ? aberturaEn(w, previaCalar.q) : null;
      if (w && ab) {
        const ok = !problemaAbertura({ ...w, aberturas: [...(w.aberturas ?? []), ab] }, ab, entrepisoMin(w));
        marcasAbertura(w, ab).forEach(pg => svg.appendChild(el('polygon', { points: pg.map(q => `${X(q.x)},${Y(q.y)}`).join(' '), class: `previa-vano${ok ? '' : ' no-entra'}` })));
        const k = caraAbertura(w, ab); if (k) svg.appendChild(dibCotasCara(X, Y, escala, k, ab.s - ab.ancho / 2, ab.s + ab.ancho / 2, 'previa', [...refsGuia(k), ...refsCalados(w, ab.cara)]));
      }
    } else if (modo === 'calar' && previaCalar) {
      const w = p.muros.find(x => x.id === previaCalar!.id);
      if (w && tipoDe(w) !== 'tubo-circ') {
        // dónde quedaría el vano (en un núcleo, sobre la cara más cercana), con el imán de las guías
        const { c, kc, sc, cen, ok, refs } = huecoPrevio(w, previaCalar.q);
        const ax = c.dir === 'X' ? calAncho : c.espesor + 0.1, ay = c.dir === 'X' ? c.espesor + 0.1 : calAncho;
        const cx = c.dir === 'X' ? cen : c.x, cy = c.dir === 'Y' ? cen : c.y;
        svg.appendChild(el('rect', { x: X(cx - ax / 2), y: Y(cy + ay / 2), width: Math.max(2, ax * escala), height: Math.max(2, ay * escala), class: `previa-vano${ok ? '' : ' no-entra'}` }));
        if (ok) svg.appendChild(dibCotasCara(X, Y, escala, kc, cen - sc - calAncho / 2, cen - sc + calAncho / 2, 'previa', refs));
      }
    }
    // pieza tipo: vista previa donde se va a insertar
    if (modo === 'insertar' && cursor) {
      const pr = el('g', { class: 'previa' });
      piezaTipo(insTipo, insMed, cursor.x, cursor.y, new Set()).forEach(m => {
        if (tipoDe(m) === 'tubo-circ') pr.appendChild(el('circle', { cx: X(m.x), cy: Y(m.y), r: (m.largo / 2) * escala }));
        else rectangulos(m).forEach(r => pr.appendChild(el('rect', { x: X(r.x - r.ax / 2), y: Y(r.y + r.ay / 2), width: Math.max(2, r.ax * escala), height: Math.max(2, r.ay * escala) })));
      });
      svg.appendChild(pr);
    }
    // muro en dibujo: vista previa con su largo y el imán
    if (modo === 'dibujar' && cursor) {
      const pr = el('g', { class: 'previa' });
      if (inicio && !orto && esDiagonal(inicio, finLibre(inicio, cursor))) {
        const fb = finLibre(inicio, cursor), off = corrimientoRef(inicio, fb, ultimoEspesor), pol = rectLibre(inicio, fb, ultimoEspesor).map(q => ({ x: q.x + off.x, y: q.y + off.y }));
        pr.appendChild(el('polygon', { points: pol.map(q => `${X(q.x)},${Y(q.y)}`).join(' ') }));
        pr.appendChild(el('line', { x1: X(inicio.x), y1: Y(inicio.y), x2: X(fb.x), y2: Y(fb.y), class: 'linea-ref' }));
        const L = Math.hypot(fb.x - inicio.x, fb.y - inicio.y), ang = ((Math.atan2(fb.y - inicio.y, fb.x - inicio.x) * 180) / Math.PI + 360) % 360;
        pr.appendChild(el('text', { x: X((inicio.x + fb.x) / 2) + 10, y: Y((inicio.y + fb.y) / 2) - 8, class: 'etiqueta' }, largoTipeado ? `${largoTipeado}▌ m` : `${L.toFixed(2).replace('.', ',')} m · ${ang.toFixed(0)}°`));
        pr.appendChild(el('circle', { cx: X(inicio.x), cy: Y(inicio.y), r: 4, class: 'iman' }));
      } else if (inicio) {
        const t = muroDesdeTramo(inicio, cursor, ultimoEspesor);
        if (t) {
          const ax = t.dir === 'X' ? t.largo : t.espesor, ay = t.dir === 'X' ? t.espesor : t.largo;
          const fin0 = t.dir === 'X' ? { x: t.x + (cursor.x >= inicio.x ? 1 : -1) * t.largo / 2, y: t.y } : { x: t.x, y: t.y + (cursor.y >= inicio.y ? 1 : -1) * t.largo / 2 };
          const off = corrimientoRef(inicio, fin0, ultimoEspesor);
          pr.appendChild(el('rect', { x: X(t.x + off.x - ax / 2), y: Y(t.y + off.y + ay / 2), width: Math.max(2, ax * escala), height: Math.max(2, ay * escala) }));
          pr.appendChild(el('line', { x1: X(inicio.x), y1: Y(t.dir === 'X' ? t.y : inicio.y), x2: X(t.dir === 'X' ? fin0.x : t.x), y2: Y(fin0.y), class: 'linea-ref' }));
          pr.appendChild(el('text', { x: X(t.x) + (t.dir === 'Y' ? 8 : 0), y: Y(t.y) + (t.dir === 'X' ? -8 : 4), class: 'etiqueta', 'text-anchor': t.dir === 'X' ? 'middle' : 'start' }, largoTipeado ? `${largoTipeado}▌ m` : `${t.largo.toFixed(2).replace('.', ',')} m`));
        }
        pr.appendChild(el('circle', { cx: X(inicio.x), cy: Y(inicio.y), r: 4, class: 'iman' }));
      }
      pr.appendChild(el('circle', { cx: X(cursor.x), cy: Y(cursor.y), r: iman === 'grilla' ? 2 : 3.5, class: `iman ${iman}` }));
      guiasIman.forEach(g => { pr.appendChild(el('line', { x1: X(g.de.x), y1: Y(g.de.y), x2: X(g.a.x), y2: Y(g.a.y), class: 'guia-inferencia' })); pr.appendChild(el('circle', { cx: X(g.de.x), cy: Y(g.de.y), r: 3, class: 'guia-inferencia-punto' })); });
      // el rótulo, del lado del cursor donde entra (cerca del borde derecho, a la izquierda)
      if (ultimoIman && ultimoIman !== 'grilla') { const izq = X(cursor.x) + 10 + ultimoIman.length * 6.6 > (svg.clientWidth || 600) - 8; pr.appendChild(el('text', { x: X(cursor.x) + (izq ? -10 : 10), y: Y(cursor.y) - 10, class: 'etiqueta iman-txt', 'text-anchor': izq ? 'end' : 'start' }, ultimoIman)); }
      svg.appendChild(pr);
    }
    // línea de referencia de los muros elegidos que se dibujaron por una cara (como ArchiCAD: se ve al elegirlos)
    {
      const ids = new Set([estado.seleccion, ...estado.multi.m].filter(Boolean) as string[]);
      p.muros.filter(m => ids.has(m.id) && m.refLado).forEach(m => {
        const lr = lineaReferencia(m); if (!lr) return;
        const [a, b] = lr;
        svg.appendChild(el('line', { x1: X(a.x), y1: Y(a.y), x2: X(b.x), y2: Y(b.y), class: 'linea-ref' }));
        [a, b].forEach(q => svg.appendChild(el('circle', { cx: X(q.x), cy: Y(q.y), r: 3, class: 'linea-ref-punta' })));
      });
    }
    // «¿Qué pasa si…?»: el muro con el cambio que se está probando, en trazos (el proyecto todavía no cambió)
    if (estado.fantasma && document.querySelector('.que-pasa')) {
      const fm = estado.fantasma;
      (tipoDe(fm) === 'tubo-circ' ? [{ x: fm.x, y: fm.y, ax: fm.largo, ay: fm.largo }] : rectangulos(fm)).forEach(r => svg.appendChild(el('rect', { x: X(r.x - r.ax / 2), y: Y(r.y + r.ay / 2), width: r.ax * escala, height: r.ay * escala, class: 'fantasma' })));
    }
    if (verAreas) acomodarAreas();
    manijasSil.forEach(m => svg.appendChild(m));
    if (arrastreNodo && destinoIman && cursor) {
      svg.appendChild(el('circle', { cx: ox + destinoIman.x * escala, cy: oy - destinoIman.y * escala, r: 6, class: 'iman-destino' }));
      svg.appendChild(el('text', { x: ox + cursor.x * escala + 10, y: oy - cursor.y * escala - 10, class: 'etiqueta iman-txt' }, ultimoIman));
    }
  }
  /** rótulos de las áreas: el primer lugar libre (sin pisar textos ni muros) entre los candidatos */
  function acomodarAreas() {
    const ts = [...svg.querySelectorAll<SVGTextElement>('text.areas-txt')];
    const otros = [...svg.querySelectorAll<SVGGraphicsElement>('text:not(.areas-txt), .muro rect, .muro circle')].map(e => { try { return e.getBBox(); } catch { return null; } }).filter((b): b is DOMRect => !!b && b.width > 0);
    const puestos: DOMRect[] = [];
    const choca = (b: DOMRect) => [...otros, ...puestos].some(o => b.x < o.x + o.width + 2 && o.x < b.x + b.width + 2 && b.y < o.y + o.height + 1 && o.y < b.y + b.height + 1);
    ts.forEach(t => {
      const cands: [number, number][] = JSON.parse(t.dataset.cands ?? '[]');
      for (const [x, y] of cands) {
        t.setAttribute('x', String(x)); t.setAttribute('y', String(y));
        const b = t.getBBox();
        if (!choca(b)) { puestos.push(b); return; }
      }
      t.setAttribute('x', String(cands[0][0])); t.setAttribute('y', String(cands[0][1]));
      puestos.push(t.getBBox());
    });
  }
  let ultimoEspesor = 0.2;
  const pegar = (ev: PointerEvent, excluir?: Set<string>) => {
    const q = aMundo(ev), tol = tolPx() / escala + 0.05;
    const nc = estado.cad ? imanCAD(q, estado.cad.nodos, tol) : null;
    if (nc) { iman = nc.t === 'intersección' || nc.t === 'centro' ? 'extremo' : 'eje'; ultimoIman = nc.t; return { x: +nc.p.x.toFixed(3), y: +nc.p.y.toFixed(3) }; }
    // inferencias: extremos y medios de los muros de este nivel, su eje, alineaciones con esos puntos (y con el
    // arranque del tramo), y si no, la grilla; las guías del plano tienen prioridad si están más cerca
    const zN = estado.proyecto.niveles[iNivel]?.cota ?? 0, zF = estado.proyecto.niveles.at(-1)?.cota ?? 0, zT = estado.proyecto.niveles[0]?.cota ?? 0;
    const ms = estado.proyecto.muros.filter(m => (!excluir || !excluir.has(m.id)) && presenteEn(m, zN, zF, zT));
    const r = inferir(q, ms, tol, cadenaDibujo.map((p0, k) => ({ p: p0, rotulo: k === 0 ? 'el arranque' : `el vértice ${k + 1}` })));
    const gm = imanDeGuias(q, tol);
    guiasIman = [];
    if (gm && (r.a === 'grilla' || r.a === 'alineado' || (gm.punto && (r.a === 'eje' || Math.hypot(gm.p.x - q.x, gm.p.y - q.y) < Math.hypot(r.p.x - q.x, r.p.y - q.y))))) { iman = gm.punto ? 'extremo' : 'eje'; ultimoIman = gm.t; return gm.p; }
    iman = r.a === 'extremo' || r.a === 'medio' ? 'extremo' : r.a === 'grilla' ? 'grilla' : 'eje'; ultimoIman = r.rotulo || 'grilla'; guiasIman = r.guias; return r.p;
  };
  /** guías de la última inferencia (líneas de puntos de alineación) y los puntos del muro encadenado que se dibuja */
  let guiasIman: GuiaInferencia[] = [];
  let cadenaDibujo: Punto[] = [];
  let ultimoIman = '';
  /** imán al arrastrar desde un nodo: nodos del plano CAD, nodos y caras de los otros elementos, grilla */
  const pegarNodo = (ev: PointerEvent, excluir: Set<string>) => {
    const q = aMundo(ev), tol = (tolPx() + 2) / escala;
    const nc = estado.cad ? imanCAD(q, estado.cad.nodos, tol) : null;
    if (nc) { ultimoIman = nc.t; destinoIman = { x: nc.p.x, y: nc.p.y }; return { x: +nc.p.x.toFixed(3), y: +nc.p.y.toFixed(3) }; }
    const zN = estado.proyecto.niveles[iNivel]?.cota ?? 0, zF = estado.proyecto.niveles.at(-1)?.cota ?? 0, zT = estado.proyecto.niveles[0]?.cota ?? 0;
    const r = imanarNodo(q, estado.proyecto.muros.filter(m => !excluir.has(m.id) && presenteEn(m, zN, zF, zT)), tol);
    const gm = imanDeGuias(q, tol);
    if (gm && (r.a === 'grilla' || (gm.punto && (r.a === 'cara' || Math.hypot(gm.p.x - q.x, gm.p.y - q.y) < Math.hypot(r.p.x - q.x, r.p.y - q.y))))) { ultimoIman = gm.t; ultimoIdIman = undefined; destinoIman = gm.p; return gm.p; }
    ultimoIman = r.a === 'grilla' ? 'grilla' : `${r.a}${r.id ? ` de ${r.id}` : ''}`;
    ultimoIdIman = r.a === 'grilla' ? undefined : r.id;
    destinoIman = r.a === 'grilla' ? null : r.p;
    return r.p;
  };
  let destinoIman: { x: number; y: number } | null = null;
  let ultimoIdIman: string | undefined;
  // --- acercar y desplazar ---
  const acercarEn = (f: number, sx: number, sy: number) => {
    // con un cuadro flotante abierto, la planta ocupa solo el ancho útil: el centro de la vista es el de ese ancho
    const w = wUtilVista || svg.clientWidth || 600, h = svg.clientHeight || 500;
    const q = { x: (sx - ox) / escala, y: -(sy - oy) / escala };      // punto del mundo bajo el cursor
    const z2 = Math.max(ZMIN, Math.min(ZMAX, zoom * f));
    const s2 = escala * (z2 / zoom);
    zoom = z2;
    centroVista = { x: q.x - (sx - w / 2) / s2, y: q.y + (sy - h / 2) / s2 };
    dibujar();
  };
  const encuadrar = () => { zoom = 1; centroVista = { x: 0, y: 0 }; dibujar(); };
  svg.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = svg.getBoundingClientRect();
    acercarEn(Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015)), ev.clientX - r.left, ev.clientY - r.top);
  }, { passive: false });
  const punteros = new Map<number, { x: number; y: number }>();
  let pan: { sx: number; sy: number; c: { x: number; y: number }; toque?: boolean } | null = null;
  let pellizco: { d: number; z: number; mx: number; my: number; c: { x: number; y: number } } | null = null;
  const local = (ev: PointerEvent) => { const r = svg.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  const esFondo = (t: EventTarget | null) => !(t as Element | null)?.closest?.('.muro, .nodos, .vertice, .manija-vertice, .editando, .areas-inf text');
  // Lápiz: mientras el lápiz está apoyado o cerca de la pantalla (hasta 0,8 s después), los toques de la mano se ignoran
  let lapizAbajo = false, lapizVisto = 0;
  const ignorados = new Set<number>();
  const esPalma = (ev: PointerEvent) => ev.pointerType === 'touch' && (lapizAbajo || performance.now() - lapizVisto < 800);
  for (const tipo of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const) {
    svg.addEventListener(tipo, ev => {
      if (ev.pointerType === 'pen') { lapizVisto = performance.now(); if (tipo === 'pointerdown') lapizAbajo = true; if (tipo === 'pointerup' || tipo === 'pointercancel') lapizAbajo = false; }
      if (tipo === 'pointerdown' && esPalma(ev)) ignorados.add(ev.pointerId);
      if (ignorados.has(ev.pointerId)) { ev.stopImmediatePropagation(); ev.preventDefault(); if (tipo === 'pointerup' || tipo === 'pointercancel') ignorados.delete(ev.pointerId); return; }
      if (tipo === 'pointerdown') tipoPuntero = ev.pointerType || 'mouse';
    }, true);
  }
  // lazo: en el modo «Lazo», o con Mayúsculas arrastrando el fondo en «Mover»
  // dibujar la losa a mano: cada toque agrega un vértice; tocar el primero (o Enter) la cierra
  const puntoTrazo = (ev: PointerEvent): Punto => {
    // inferencias también al dibujar la losa: los vértices ya puestos (el primero, para cerrar a escuadra), las
    // esquinas de la losa del nivel y los extremos y medios de los muros
    const q = aMundo(ev), u = trazo?.[trazo.length - 1], tol = tolPx() / escala + 0.05;
    const extra = [...(trazo ?? []).map((p0, k) => ({ p: p0, rotulo: k === 0 ? 'el primer vértice' : `el vértice ${k + 1}` })), ...plantaDeNivel(estado.proyecto, iNivel).silueta.map((v, k) => ({ p: { x: v.x, y: v.y }, rotulo: `la esquina ${k + 1} de la losa` }))];
    const zN = estado.proyecto.niveles[iNivel]?.cota ?? 0, zF = estado.proyecto.niveles.at(-1)?.cota ?? 0, zT = estado.proyecto.niveles[0]?.cota ?? 0;
    const ms = estado.proyecto.muros.filter(m => presenteEn(m, zN, zF, zT));
    let r;
    if (u && (dc.orto || ev.shiftKey)) {
      // a 90°: el tramo manda en una coordenada y la inferencia ajusta la otra
      const horiz = Math.abs(q.x - u.x) >= Math.abs(q.y - u.y);
      r = inferir(horiz ? { x: q.x, y: u.y } : { x: u.x, y: q.y }, ms, tol, extra, horiz ? 'x' : 'y');
      r.p = horiz ? { x: r.a === 'grilla' ? aj(q.x) : r.p.x, y: u.y } : { x: u.x, y: r.a === 'grilla' ? aj(q.y) : r.p.y };
    } else { r = inferir(q, ms, tol, extra); if (r.a === 'grilla') r.p = { x: aj(q.x), y: aj(q.y) }; }
    guiasIman = r.guias; ultimoIman = r.rotulo;
    return r.p;
  };
  const cerrarTrazo = async () => {
    if (!trazo || trazo.length < 3) { mensaje('Hacen falta al menos tres vértices.'); return; }
    const v = antihorario(trazo.map(q => ({ x: q.x, y: q.y })));
    if (seCruza(v)) { await avisar('error', 'El contorno se cruza', 'Dos lados de la losa se cruzan. Borrá los últimos vértices (Retroceso) y seguí por otro lado.'); return; }
    trazo = null; trazoCursor = null;
    estado.cambiar(pp => { const nv = pp.niveles[iNivel]; nv.silueta = v; if (dc.bl) { const c = cajaSilueta(v); nv.B = +c.B.toFixed(2); nv.L = +c.L.toFixed(2); } });
    indicar(INDIC.silueta);
    mensaje(`Losa dibujada: ${v.length} vértices, ${areaSilueta(v).toFixed(1).replace('.', ',')} m². Ajustala arrastrando los vértices o con «Herramientas CAD…».`);
  };
  svg.addEventListener('pointerdown', ev => {
    if (modo !== 'silueta' || !trazo || ev.button !== 0) return;
    ev.stopImmediatePropagation(); ev.preventDefault();
    const q = puntoTrazo(ev);
    if (trazo.length >= 3) { const a = trazo[0], d = Math.hypot((q.x - a.x) * escala, (q.y - a.y) * escala); if (d < (ev.pointerType === 'touch' ? 22 : 12)) { void cerrarTrazo(); return; } }
    const u = trazo[trazo.length - 1];
    if (u && Math.hypot(u.x - q.x, u.y - q.y) < 1e-6) return;
    trazo.push(q); pedirDibujo();
  }, true);
  svg.addEventListener('pointermove', ev => { if (modo === 'silueta' && trazo) { trazoCursor = puntoTrazo(ev); pedirDibujo(); } });
  document.addEventListener('keydown', ev => {
    if (modo !== 'silueta' || !trazo || (ev.target as HTMLElement).closest?.('input, textarea, select')) return;
    if (ev.key === 'Enter') { ev.preventDefault(); ev.stopImmediatePropagation(); void cerrarTrazo(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); trazo = null; trazoCursor = null; armarPanelSil(); dibujar(); indicar(INDIC.silueta); }
    else if (ev.key === 'Backspace' || ev.key === 'Delete') { ev.preventDefault(); ev.stopImmediatePropagation(); trazo.pop(); pedirDibujo(); }
  }, true);
  svg.addEventListener('pointerdown', ev => {
    if (lazo) { lazo = null; pedirDibujo(); return; }          // segundo dedo: se suelta el lazo y se pellizca
    if (ev.button !== 0) return;
    if (!(modo === 'lazo' || (modo === 'mover' && ev.shiftKey && esFondo(ev.target)))) return;
    if (modo === 'lazo' && (ev.target as Element | null)?.closest?.('.nodos')) return;
    ev.stopImmediatePropagation(); ev.preventDefault();
    lazo = { pts: [aMundo(ev)], op: ev.altKey ? 'saca' : ev.shiftKey || ev.ctrlKey || ev.metaKey ? 'suma' : 'nuevo' };
    try { svg.setPointerCapture(ev.pointerId); } catch { /* sintético */ }
  }, true);
  svg.addEventListener('pointermove', ev => {
    if (!lazo) return;
    ev.stopImmediatePropagation();
    const q = aMundo(ev), u = lazo.pts[lazo.pts.length - 1];
    if (opLazo.forma === 'rect') { lazo.pts = [lazo.pts[0], q]; pedirDibujo(); return; }
    if (Math.hypot(q.x - u.x, q.y - u.y) * escala >= 3) { lazo.pts.push(q); pedirDibujo(); }
  }, true);
  const finLazo = (ev: PointerEvent) => {
    if (!lazo) return;
    ev.stopImmediatePropagation();
    const l = lazo; lazo = null;
    if (opLazo.forma === 'rect' && l.pts.length === 2 && Math.abs(l.pts[1].x - l.pts[0].x) * escala > 4 && Math.abs(l.pts[1].y - l.pts[0].y) * escala > 4) {
      const [a, b] = l.pts, crit = opLazo.criterio === 'auto' ? (b.x >= a.x ? 'entero' : 'tocando') : opLazo.criterio;
      elegirConLazo(rectPol(a, b), l.op, crit);
      return;
    }
    if (l.pts.length < 3 || opLazo.forma === 'rect' || ev.type === 'pointercancel') {
      // toque sin arrastrar: en el modo lazo, un toque en el vacío suelta la selección
      if (l.op === 'nuevo' && ev.type !== 'pointercancel') { estado.multi = { m: [], g: [] }; estado.avisarPanel(); } else dibujar();
      return;
    }
    elegirConLazo(l.pts, l.op, opLazo.criterio === 'auto' ? 'centro' : opLazo.criterio);
  };
  svg.addEventListener('pointerup', finLazo, true);
  svg.addEventListener('pointercancel', finLazo, true);
  svg.addEventListener('pointerdown', ev => {
    punteros.set(ev.pointerId, local(ev));
    if (punteros.size === 2) {
      // dos dedos: se suelta lo que se estaba arrastrando y se pellizca
      ev.stopImmediatePropagation(); ev.preventDefault();
      arrastre = null; arrastreNodo = null; arrastreV = null; pan = null;
      const [a, b] = [...punteros.values()];
      pellizco = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, c: { ...centroVista } };
      try { svg.setPointerCapture(ev.pointerId); } catch { /* sintético */ }
      return;
    }
    if (ev.button === 1 || (ev.button === 0 && modo === 'mover' && esFondo(ev.target))) {
      ev.preventDefault();
      pan = { sx: ev.clientX, sy: ev.clientY, c: { ...centroVista }, toque: ev.button === 0 && !ev.shiftKey };
      try { svg.setPointerCapture(ev.pointerId); } catch { /* sintético */ }
      if (ev.button === 1) ev.stopImmediatePropagation();
    }
  }, true);
  svg.addEventListener('pointermove', ev => {
    if (punteros.has(ev.pointerId)) punteros.set(ev.pointerId, local(ev));
    if (pellizco && punteros.size >= 2) {
      ev.stopImmediatePropagation();
      const [a, b] = [...punteros.values()];
      const w = wUtilVista || svg.clientWidth || 600, h = svg.clientHeight || 500;
      const base = escala / zoom;                                     // escala con zoom 1
      const z2 = Math.max(ZMIN, Math.min(ZMAX, pellizco.z * Math.hypot(a.x - b.x, a.y - b.y) / pellizco.d));
      const s0 = base * pellizco.z, s2 = base * z2;
      const q = { x: pellizco.c.x + (pellizco.mx - w / 2) / s0, y: pellizco.c.y - (pellizco.my - h / 2) / s0 };   // punto bajo el centro del pellizco
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      zoom = z2; centroVista = { x: q.x - (mx - w / 2) / s2, y: q.y + (my - h / 2) / s2 };
      pedirDibujo();
      return;
    }
    if (pan) {
      ev.stopImmediatePropagation();
      centroVista = { x: pan.c.x - (ev.clientX - pan.sx) / escala, y: pan.c.y + (ev.clientY - pan.sy) / escala };
      pedirDibujo();
    }
  }, true);
  const finPuntero = (ev: PointerEvent) => {
    // un toque en el fondo (sin arrastrar) suelta lo elegido: con el lápiz o el dedo no hay tecla Esc
    if (pan?.toque && ev.type === 'pointerup' && punteros.size === 1 && modo === 'mover' && Math.hypot(ev.clientX - pan.sx, ev.clientY - pan.sy) < (ev.pointerType === 'mouse' ? 3 : 8)
      && (estado.seleccion || estado.grupoSel || estado.multi.m.length || estado.multi.g.length)) {
      estado.multi = { m: [], g: [] }; estado.grupoSel = null; estado.seleccion = null; estado.avisarPanel(); pedirDibujo();
    }
    punteros.delete(ev.pointerId); if (punteros.size < 2) pellizco = null; if (!punteros.size) pan = null;
  };
  svg.addEventListener('pointerup', finPuntero, true);
  svg.addEventListener('pointercancel', finPuntero, true);
  // botones de la vista
  const zoomBar = document.createElement('div'); zoomBar.className = 'zoom-planta';
  ([['+', 'Acercar', () => acercarEn(1.4, (wUtilVista || svg.clientWidth || 600) / 2, (svg.clientHeight || 500) / 2)], ['−', 'Alejar', () => acercarEn(1 / 1.4, (wUtilVista || svg.clientWidth || 600) / 2, (svg.clientHeight || 500) / 2)], ['⤢', 'Encuadrar: toda la planta', encuadrar]] as const).forEach(([t, a, f]) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.title = `${a} (también: rueda del mouse o pellizcar; arrastrar el fondo para desplazar)`; b.setAttribute('aria-label', a); b.addEventListener('click', f); zoomBar.append(b);
  });
  cont.appendChild(zoomBar);

  // ---- que nada se pise en la planta: las barras de abajo se apilan, el zoom queda arriba de la leyenda, el cuadro de
  // precisión debajo del selector de planta y los rótulos de los muros se corren si se tocan
  const solapan = (a: DOMRect, b: DOMRect, m = 1) => a.left < b.right - m && a.right > b.left + m && a.top < b.bottom - m && a.bottom > b.top + m;
  const visible = (e: Element | null): e is HTMLElement => !!e && !(e as HTMLElement).hidden && getComputedStyle(e).display !== 'none' && (e as HTMLElement).getBoundingClientRect().width > 2;
  function separarRotulos() {
    const puestos: DOMRect[] = [];
    svg.querySelectorAll<SVGTextElement>('text.etiqueta').forEach(t => {
      if (t.closest('[transform]') || !t.textContent?.trim()) return;
      // posición original (si ya se corrió en un dibujo anterior del mismo elemento)
      if (t.dataset.y0 === undefined) t.dataset.y0 = t.getAttribute('y') ?? '0';
      const y0 = +t.dataset.y0;
      t.setAttribute('y', String(y0));
      let r = t.getBoundingClientRect();
      if (!r.width) return;
      const h = r.height + 1;
      for (const k of [1, -1, 2, -2, 3, -3]) {
        if (!puestos.some(p => solapan(r, p))) break;
        t.setAttribute('y', String(y0 + k * h));
        r = t.getBoundingClientRect();
      }
      puestos.push(r);
    });
  }
  function acomodar() {
    const R = cont.getBoundingClientRect();
    if (!R.width) return;
    // si cambió lo que tapan las cartas (se abrió, se cerró, se plegó o se agrandó una), la planta se vuelve a encuadrar
    const w0 = svg.clientWidth || 600, rs = w0 > 640 ? reservasCartas(w0) : { izq: 0, der: 0 }, firma = `${Math.round(rs.izq)}|${Math.round(rs.der)}`;
    if (firma !== firmaReservas) { firmaReservas = firma; pedirDibujo(); }
    // con la herramienta «Mover», la indicación es la de la carta abierta del costado (colocar, cotas o guías)
    if (modo === 'mover' || modo === 'lazo') {
      const gu = [...dock.querySelectorAll<HTMLElement>(':scope > .guias-panel')].find(visible), co = [...dock.querySelectorAll<HTMLElement>(':scope > .colocar-panel:not(.guias-panel)')].find(visible);
      const tit = (co?.querySelector(':scope > b')?.textContent ?? '').toLowerCase();
      const t = edc.activo() ? 'Editar el contorno: arrastrá los vértices (□); tocá el medio de un lado (○) para elegirlo (recto, arco o Bézier); en un arco, arrastrá su centro (✛) sin mover los extremos. Enter: listo · Esc: cancelar.'
        : gu ? 'Guías: armá la grilla de ejes o elegí una herramienta de líneas o círculos en la carta y tocá la planta. Con el imán prendido, los muros se pegan a las guías.'
        : co ? (tit.startsWith('cota') ? 'Cotas: tocá el primer punto y después el segundo (se pegan a esquinas, medios y centros de los muros); la cota sigue al muro si se mueve.' : INDIC.colocar)
        : !estado.proyecto.muros.length && modo === 'mover' ? 'Planta vacía: empezá por la losa (botón «Losa» → «Losa desde cero»: una forma o dibujada a mano) y después dibujá los muros («Dibujar») o insertá piezas («Insertar…»).'
        : INDIC[modo];
      if (indicTxt.textContent !== t) indicar(t);
    }
    // abajo, de abajo hacia arriba: leyenda, herramientas, barras de selección y de grupo, barra del grupo que se edita
    const pila = [ley, indic, barraTr, ...cont.querySelectorAll<HTMLElement>(':scope > .barra-sel, :scope > .barra-lazo'), barraCtx];
    const puestos: DOMRect[] = [];
    pila.forEach(e => {
      if (!visible(e)) return;
      e.style.bottom = '';
      if (e.classList.contains('movido')) return;             // lo movió el usuario: queda donde lo dejó
      let r = e.getBoundingClientRect();
      for (let i = 0; i < 8; i++) {
        const choca = puestos.find(p => solapan(r, p));
        if (!choca) break;
        e.style.bottom = `${Math.ceil(R.bottom - choca.top + 6)}px`;
        r = e.getBoundingClientRect();
      }
      puestos.push(r);
    });
    // botones de zoom (a la derecha): arriba de lo que tengan abajo
    if (visible(zoomBar)) {
      zoomBar.style.bottom = '';
      let r = zoomBar.getBoundingClientRect();
      for (let i = 0; i < 8; i++) { const choca = puestos.find(p => solapan(r, p)); if (!choca) break; zoomBar.style.bottom = `${Math.ceil(R.bottom - choca.top + 6)}px`; r = zoomBar.getBoundingClientRect(); }
      puestos.push(r);
    }
    // cuadro de precisión (arriba a la derecha): debajo del selector de planta y sin llegar a los botones de zoom
    if (visible(panelPrec) && getComputedStyle(panelPrec).position === 'absolute') {
      panelPrec.style.top = ''; panelPrec.style.maxHeight = '';
      let r = panelPrec.getBoundingClientRect();
      if (visible(selNivel)) { const s = selNivel.getBoundingClientRect(); if (solapan(r, s)) { panelPrec.style.top = `${Math.ceil(s.bottom - R.top + 6)}px`; r = panelPrec.getBoundingClientRect(); } }
      const abajo = puestos.filter(p => p.left < r.right && p.right > r.left && p.top > r.top).reduce((m, p) => Math.min(m, p.top), R.bottom);
      if (r.bottom > abajo - 6) { panelPrec.style.maxHeight = `${Math.max(80, Math.floor(abajo - 6 - r.top))}px`; panelPrec.style.overflowY = 'auto'; }
    }
    // cuadros altos de los costados (paneles apilados, insertar, calar, medidas, contorno): no bajan hasta las barras de
    // abajo; si no entran, se desplazan por dentro
    [dock, panelIns, panelCal, panelMed, cont.querySelector<HTMLElement>(':scope > .contorno-panel')].forEach(e => {
      if (!e) return;
      e.style.maxHeight = '';
      if (!visible(e) || e.classList.contains('movido')) return;
      const r = e.getBoundingClientRect();
      const abajo = puestos.filter(p => p.left < r.right && p.right > r.left && p.top > r.top + 60).reduce((m, p) => Math.min(m, p.top), R.bottom);
      if (r.bottom > abajo - 6) { e.style.maxHeight = `${Math.max(120, Math.floor(abajo - 6 - r.top))}px`; e.style.overflowY = 'auto'; }
    });
    separarRotulos();
  }
  // todo lo que flota sobre la planta se puede mover con su asa (⠿) adonde no moleste; doble clic vuelve a su lugar
  hacerMovible(dock, cont, 'paneles');
  ([[panelIns, 'insertar'], [panelCal, 'calar'], [panelMed, 'medidas'], [panelPrec, 'precision']] as const).forEach(([e, k]) => hacerMovible(e, cont, k));
  const pc = cont.querySelector<HTMLElement>(':scope > .contorno-panel'); if (pc) hacerMovible(pc, cont, 'contorno');
  // todas las cartas (sueltas y las del costado) cambian de tamaño con el tirador ◢; las sueltas que falten, también se mueven
  const claveCarta = (e: HTMLElement, i: number) => [...e.classList].find(c => c.endsWith('-panel') && c !== 'calco-panel' && c !== 'colocar-panel' && c !== 'piezas-panel') ?? (e.classList.contains('colocar-panel') ? 'colocar' : `carta${i}`);
  const prepararCartas = () => cont.querySelectorAll<HTMLElement>(':scope > .calco-panel, :scope > .contorno-panel, :scope > .dock-planta > .calco-panel').forEach((e, i) => {
    const k = claveCarta(e, i);
    if (e.parentElement === cont) hacerMovible(e, cont, k);
    hacerRedimensionable(e, cont, k);
  });
  prepararCartas();
  new MutationObserver(prepararCartas).observe(cont, { childList: true });
  new MutationObserver(prepararCartas).observe(dock, { childList: true });
  cont.addEventListener('carta-cambiada', () => { firmaReservas = ''; pedirAcomodar(); });
  ([[barraSel, 'barra-eleccion'], [barraGrupo, 'barra-grupo'], [barraLazo, 'barra-lazo'], [barraDib, 'barra-dibujo'], [barraTr, 'barra-transformar'], [barraCtx, 'barra-contexto']] as const).forEach(([e, k]) => hacerMovible(e, cont, k, { enLinea: true }));
  let cuadroAcomodar = 0;
  const pedirAcomodar = () => { if (!cuadroAcomodar) cuadroAcomodar = requestAnimationFrame(() => { cuadroAcomodar = 0; acomodar(); }); };
  new ResizeObserver(pedirAcomodar).observe(cont);
  new MutationObserver(pedirAcomodar).observe(cont, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  svg.addEventListener('pointerdown', ev => {
    if (modo === 'insertar' && ev.button === 0) {
      ev.preventDefault();
      const q = aMundo(ev), g5 = aj;
      const mal = problemaMedidas(insTipo, insMed);
      if (mal) { mensaje(`No se puede insertar: ${mal}.`); return; }
      estado.cambiar(() => {
        const p = estado.proyecto;
        const nuevos = piezaTipo(insTipo, insMed, g5(q.x), g5(q.y), new Set(p.muros.map(m => m.id)));
        if (estado.contexto) nuevos.forEach(m => { m.gd = estado.contexto!; });     // insertada dentro del grupo que se edita
        p.muros = agrupar([...p.muros, ...nuevos], nuevos.map(m => m.id)).muros;
        // la pieza insertada es un grupo cerrado del Esquema: se mueve entera y se entra con doble clic
        const g = p.muros.find(m => m.id === nuevos[0].id)?.grupo;
        const r = g ? agruparNodos(p, nuevos.map(m => m.id), [], estado.contexto, `${insTipo[0].toUpperCase()}${insTipo.slice(1)} ${g}`) : null;
        estado.seleccion = nuevos[0].id;
        if (r && !('error' in r)) estado.grupoSel = r.id;
      });
      ponerModo('mover');
      return;
    }
    if (modo === 'calar' && ev.button === 0 && calQue === 'losa') {
      ev.preventDefault();
      const q = pegarNodo(ev, new Set()), p = estado.proyecto, w = aMundo(ev);
      const zN = p.niveles[iNivel]?.cota ?? 0;
      const tocado = !losaIni && (p.huecosLosa ?? []).find(h => huecoEn(h, zN) && dentroPol(w, h.v));
      if (tocado) { huecoSel = tocado.id; armarPanelCal(); dibujar(); return; }
      if (!losaIni) { losaIni = q; huecoSel = null; armarPanelCal(); dibujar(); return; }
      if (Math.abs(q.x - losaIni.x) < 0.1 || Math.abs(q.y - losaIni.y) < 0.1) { mensaje('El hueco es muy chico: tocá la esquina opuesta más lejos.'); return; }
      const a = losaIni; losaIni = null;
      let id = '';
      estado.cambiar(pp => { const hs = (pp.huecosLosa ??= []); let k = 1; while (hs.some(h => h.id === `H${k}`)) k++; id = `H${k}`; hs.push({ id, nombre: `Hueco ${k}`, v: rectHueco(a, q) }); });
      huecoSel = id; armarPanelCal();
      const ax = Math.abs(q.x - a.x), ay = Math.abs(q.y - a.y);
      mensaje(`Hueco de losa de ${ax.toFixed(2).replace('.', ',')} × ${ay.toFixed(2).replace('.', ',')} m (${(ax * ay).toFixed(2).replace('.', ',')} m²) en todos los pisos: se puede cambiar en el panel.`);
      return;
    }
    if (modo === 'calar' && ev.button === 0) {
      ev.preventDefault();
      // tocar una abertura o un vano ya hecho lo elige (y la abertura se arrastra a lo largo del muro)
      { const q = aMundo(ev), zV = estado.proyecto.niveles[iNivel]?.cota ?? 0, bajo = aberturaBajo(q, zV);
        if (bajo) {
          const w = estado.proyecto.muros.find(x => x.id === bajo.id)!, a = w.aberturas![bajo.i], mot = motivoNoEditable(estado.proyecto, w, estado.contexto);
          abSel = bajo; vanoSel = null; previaCalar = null;
          if (mot) mensaje(mot); else { const k = caraAbertura(w, a); if (k) arrAb = { ...bajo, s0: a.s, q0: sobreCara(k, q), movio: false }; mensaje(`${w.id}: abertura elegida. Arrastrala para moverla; Supr la quita.`); }
          armarPanelCal(); dibujar(); return;
        }
        const vb = vanoBajo(q);
        if (vb) { vanoSel = vb; abSel = null; previaCalar = null; mensaje('Vano elegido: «Cerrar el vano» (o Supr) une los dos tramos.'); armarPanelCal(); dibujar(); return; }
        if (abSel || vanoSel) { abSel = null; vanoSel = null; armarPanelCal(); }
      }
      const idM = ((ev.target as Element).closest?.('g.muro') as SVGGElement | null)?.dataset.id;
      if (!idM) { mensaje('Calar: tocá un tabique o un núcleo, en el lugar del vano.'); dibujar(); return; }
      { const mm = estado.proyecto.muros.find(x => x.id === idM), mot = mm && motivoNoEditable(estado.proyecto, mm, estado.contexto); if (mot) { mensaje(mot); return; } }
      if (calTipo !== 'hueco') {
        // puerta o ventana: el elemento no se parte; se le agrega la abertura (en todos sus pisos)
        const mm = estado.proyecto.muros.find(x => x.id === idM)!;
        const ab = aberturaEn(mm, aMundo(ev));
        if (!ab) { mensaje(`${idM}: este elemento no se cala con puertas o ventanas (los perfiles irregulares se editan con su contorno).`); return; }
        const err = problemaAbertura({ ...mm, aberturas: [...(mm.aberturas ?? []), ab] }, ab, entrepisoMin(mm));
        if (err) { mensaje(`No se puede calar ${idM}: ${err}.`); return; }
        estado.cambiar(pp => { const w = pp.muros.find(x => x.id === idM); if (w) w.aberturas = [...(w.aberturas ?? []), ab]; });
        previaCalar = null;
        mensaje(`${calTipo === 'puerta' ? 'Puerta' : 'Ventana'} de ${String(calAncho).replace('.', ',')} × ${String(calAlto).replace('.', ',')} m en ${idM}${ab.cara ? ` (cara ${ab.cara})` : ''}, en todos sus pisos. El elemento sigue entero; el cálculo usa la sección más débil.`);
        return;
      }
      const mmH = estado.proyecto.muros.find(x => x.id === idM)!, hp = tipoDe(mmH) === 'tubo-circ' ? null : huecoPrevio(mmH, aMundo(ev));
      const r = calarMuro(estado.proyecto.muros, idM, hp ? (hp.c.dir === 'X' ? { x: hp.cen, y: hp.c.y } : { x: hp.c.x, y: hp.cen }) : aMundo(ev), calAncho, 'hueco');
      if ('error' in r) { mensaje(`No se puede calar ${idM}: ${r.error}.`); return; }
      estado.cambiar(() => { estado.proyecto.muros = r.muros; });
      previaCalar = null;
      mensaje(`Hueco de ${String(calAncho).replace('.', ',')} m a toda altura en ${idM}.`);
      return;
    }
    if (modo === 'calibrar' && ev.button === 0 && estado.calco) {
      ev.preventDefault();
      calib.push(aMundo(ev));
      dibujar();
      if (calib.length === 2) {
        const medida = Math.hypot(calib[1].x - calib[0].x, calib[1].y - calib[0].y);
        const p0 = calib[0], c = estado.calco;
        ponerModo('mover');
        pedirTexto('Distancia real', `Distancia real entre los dos puntos, en metros. En el dibujo mide ${medida.toFixed(2).replace('.', ',')} m.`, '', 'Escalar').then(txt => {
          const real = Number(String(txt ?? '').replace(',', '.'));
          if (!(real > 0 && medida > 1e-6) || estado.calco !== c) return;
          const f = real / medida;
          // escala alrededor del primer punto: ese punto queda en su lugar
          c.x = +(p0.x + (c.x - p0.x) * f).toFixed(3); c.y = +(p0.y + (c.y - p0.y) * f).toFixed(3); c.ancho = +(c.ancho * f).toFixed(3);
          armarPanelCalco(); dibujar();
        });
      }
      return;
    }
    if (modo !== 'dibujar' || ev.button !== 0) return;
    ev.preventDefault();
    const ahora = performance.now();
    if (ev.pointerType !== 'mouse' && toqueDibujo && ahora - toqueDibujo.t < 380 && Math.hypot(ev.clientX - toqueDibujo.x, ev.clientY - toqueDibujo.y) < 24) {
      toqueDibujo = null; inicio = null; dibujar(); return;                // doble toque: termina el muro encadenado
    }
    toqueDibujo = { t: ahora, x: ev.clientX, y: ev.clientY };
    // con el lápiz o el dedo, volver a tocar el último punto (a menos de 12 px) termina el encadenado: no hace un muro
    // de pocos centímetros por el pulso
    if (ev.pointerType !== 'mouse' && inicio) { const l = local(ev); if (Math.hypot(l.x - (ox + inicio.x * escala), l.y - (oy - inicio.y * escala)) < (ev.pointerType === 'touch' ? 20 : 12)) { inicio = null; dibujar(); mensaje('Muro terminado.'); return; } }
    const q = pegar(ev);
    if (!inicio) { inicio = q; cursor = q; largoTipeado = ''; cadenaDibujo = [q]; dibujar(); return; }
    muroHasta(q);
    if (inicio) cadenaDibujo = [...cadenaDibujo, inicio as Punto].slice(-12);
  });
  /** largo tipeado mientras se dibuja un muro (Enter lo aplica en la dirección del cursor) */
  let largoTipeado = '';
  /** crea el muro desde «inicio» hasta q (horizontal o vertical) y encadena el próximo */
  /** punto final en dibujo libre: la dirección va de a 15° cuando el cursor no está pegado a un punto */
  const finLibre = (a: Punto, q: Punto): Punto => {
    if (ultimoIman !== 'grilla' && ultimoIman !== '') return q;
    const L = Math.hypot(q.x - a.x, q.y - a.y), ang = Math.round(Math.atan2(q.y - a.y, q.x - a.x) / (Math.PI / 12)) * (Math.PI / 12);
    return { x: +(a.x + L * Math.cos(ang)).toFixed(3), y: +(a.y + L * Math.sin(ang)).toFixed(3) };
  };
  /** contorno de un muro diagonal de a a b con espesor e */
  const rectLibre = (a: Punto, b: Punto, e: number) => { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / L * e / 2, ny = (b.x - a.x) / L * e / 2; return [{ x: a.x + nx, y: a.y + ny }, { x: a.x - nx, y: a.y - ny }, { x: b.x - nx, y: b.y - ny }, { x: b.x + nx, y: b.y + ny }].map(q => ({ x: +q.x.toFixed(4), y: +q.y.toFixed(4) })); };
  const esDiagonal = (a: Punto, b: Punto) => Math.abs(b.x - a.x) > 1e-3 && Math.abs(b.y - a.y) > 1e-3;
  const muroHasta = (q0: Punto) => {
    if (!inicio) return;
    const q = orto ? q0 : finLibre(inicio, q0);
    if (!orto && esDiagonal(inicio, q)) {
      if (Math.hypot(q.x - inicio.x, q.y - inicio.y) < 0.05) return;
      const a0 = inicio;
      estado.cambiar(() => {
        const id = nuevoId(), t = `T${id.slice(1)}`;
        const base: Muro = { id, dir: 'Y', x: 0, y: 0, largo: 1, espesor: ultimoEspesor, llega: true, areaInf: 10, piezaA: t, pegadoA: '', piezaB: `${t}B`, pegadoB: '', ...(estado.contexto ? { gd: estado.contexto } : {}) };
        const off = corrimientoRef(a0, q, ultimoEspesor);
        const nuevo = ponerPerfil(base, { v: rectLibre(a0, q, ultimoEspesor).map(v => ({ x: +(v.x + off.x).toFixed(4), y: +(v.y + off.y).toFixed(4) })) });
        const lr = ladoRef(nuevo, [a0, q]); if (lr) nuevo.refLado = lr;
        estado.proyecto.muros = [...estado.proyecto.muros, nuevo];
        estado.seleccion = id;
      });
      inicio = { x: +q.x.toFixed(3), y: +q.y.toFixed(3) };
      largoTipeado = '';
      return;
    }
    const t = muroDesdeTramo(inicio, q, ultimoEspesor);
    if (!t) return;
    const fin = t.dir === 'X' ? { x: t.x + (q.x >= inicio.x ? 1 : -1) * t.largo / 2, y: t.y } : { x: t.x, y: t.y + (q.y >= inicio.y ? 1 : -1) * t.largo / 2 };
    estado.cambiar(() => {
      const id = nuevoId();
      // dibujado mientras se edita un grupo: queda adentro de ese grupo
      const a0 = inicio!, off = corrimientoRef(a0, fin, ultimoEspesor);
      const m: Muro = { id, ...t, x: +(t.x + off.x).toFixed(4), y: +(t.y + off.y).toFixed(4), llega: true, areaInf: 10, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '', ...(estado.contexto ? { gd: estado.contexto } : {}) };
      const lr = ladoRef(m, [a0, fin]); if (lr) m.refLado = lr;
      estado.proyecto.muros = armarPiezas([...estado.proyecto.muros, m]);
      estado.seleccion = id;
    });
    inicio = { x: +fin.x.toFixed(3), y: +fin.y.toFixed(3) };      // encadenado: el próximo arranca donde terminó este
    largoTipeado = '';
  };
  document.addEventListener('keydown', ev => {
    if (modo !== 'dibujar' || !inicio || (ev.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return;
    if (/^[0-9.,]$/.test(ev.key)) { ev.preventDefault(); largoTipeado += ev.key === '.' ? ',' : ev.key; mensaje(`Largo: ${largoTipeado} m · Enter lo dibuja hacia donde apunta el cursor.`); pedirDibujo(); return; }
    if (ev.key === 'Backspace' && largoTipeado) { ev.preventDefault(); largoTipeado = largoTipeado.slice(0, -1); pedirDibujo(); return; }
    if (ev.key === 'Enter' && largoTipeado && cursor) {
      ev.preventDefault();
      const L = Number(largoTipeado.replace(',', '.'));
      if (!(L > 0)) { largoTipeado = ''; return; }
      const dx = cursor.x - inicio.x, dy = cursor.y - inicio.y;
      if (!orto) { const d = finLibre(inicio, cursor), Ld = Math.hypot(d.x - inicio.x, d.y - inicio.y) || 1; muroHasta({ x: inicio.x + ((d.x - inicio.x) / Ld) * L, y: inicio.y + ((d.y - inicio.y) / Ld) * L }); mensaje(`Muro de ${largoTipeado || String(L).replace('.', ',')} m.`); dibujar(); return; }
      const q = Math.abs(dx) >= Math.abs(dy) ? { x: inicio.x + Math.sign(dx || 1) * L, y: inicio.y } : { x: inicio.x, y: inicio.y + Math.sign(dy || 1) * L };
      muroHasta(q); mensaje(`Muro de ${largoTipeado || String(L).replace('.', ',')} m. Seguí tipeando el próximo largo o tocá.`); dibujar();
    }
  });
  let toqueDibujo: { t: number; x: number; y: number } | null = null;
  svg.addEventListener('dblclick', () => { if (modo === 'dibujar') { inicio = null; dibujar(); } });
  // clic derecho: como Esc (termina o cancela lo que se está haciendo), como en los programas de CAD
  svg.addEventListener('contextmenu', ev => {
    if (modo === 'dibujar') { ev.preventDefault(); if (inicio) { inicio = null; dibujar(); } else ponerModo('mover'); return; }
    if (modo !== 'mover') { ev.preventDefault(); svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return; }
    // «Mover»: sobre un muro o un grupo, el menú de herramientas; en el fondo vacío, como Esc
    // el muro bajo el puntero (el destino del evento puede ser el svg si el arrastre capturó el puntero)
    const bajo = document.elementsFromPoint(ev.clientX, ev.clientY).map(e => (e.closest?.('g.muro') as SVGGElement | null)?.dataset.id).find(Boolean);
    const idM = ((ev.target as Element).closest?.('g.muro') as SVGGElement | null)?.dataset.id ?? bajo;
    if (idM) { ev.preventDefault(); menuDe(idM, ev.clientX, ev.clientY); return; }
    if (estado.multi.m.length || estado.multi.g.length || estado.contexto) { ev.preventDefault(); svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
  });
  /** clase de pieza y «entra al J» para las piezas de unos muros (en los dos vientos) */
  const piezasDe = (ids: string[]) => { const p = estado.proyecto, s = new Set<string>(); ids.forEach(id => { const m = p.muros.find(x => x.id === id); if (m?.piezaA) s.add(m.piezaA); if (m?.piezaB) s.add(m.piezaB); }); return [...s]; };
  const menuClase = (ids: string[]): EntradaMenu[] => {
    const nombres = piezasDe(ids), cs = estado.proyecto.clasesPieza ?? {};
    if (!nombres.length) return [{ texto: 'Clase de la pieza', no: 'Estos muros no tienen pieza en ningún viento (Diseño → Muros).' }];
    const actual = new Set(nombres.map(n => cs[n]?.clase ?? 'auto')), enJ = nombres.every(n => cs[n]?.enJ !== false);
    const poner = (f: (c: { clase?: ClasePieza | null; enJ?: boolean | null }) => void, txt: string) => {
      estado.cambiar(pp => {
        const t = (pp.clasesPieza ??= {});
        nombres.forEach(n => { const c0 = { ...(t[n] ?? {}) }; f(c0); if ((!c0.clase || c0.clase === 'auto') && c0.enJ !== false) delete t[n]; else t[n] = c0; });
        if (!Object.keys(t).length) delete pp.clasesPieza;
      });
      mensaje(`${nombres.join(', ')}: ${txt}.`); estado.avisarPanel();
    };
    return [
      { texto: `Clase de la pieza (${nombres.join(', ')})`, sub: (Object.keys(NOMBRE_CLASE) as ClasePieza[]).map(k => ({ texto: NOMBRE_CLASE[k], marcado: actual.size === 1 && actual.has(k), accion: () => poner(c => { c.clase = k === 'auto' ? null : k; }, `clase «${NOMBRE_CLASE[k]}»`) })) },
      { texto: 'Entra al cálculo del J', marcado: enJ, ayuda: 'Sin tildar: la pieza no va a la hoja J (en los dos vientos)', accion: () => poner(c => { c.enJ = enJ ? false : null; }, enJ ? 'fuera del cálculo del J' : 'vuelve al cálculo del J') },
    ];
  };
  /** el menú de clic derecho sobre el muro idM: el grupo cerrado que lo contiene, lo elegido o el muro solo */
  function menuDe(idM: string, x: number, y: number) {
    const p = estado.proyecto, m = p.muros.find(w => w.id === idM);
    if (!m) return;
    const enMulti = estado.multi.m.includes(idM) || estado.multi.g.some(g => dentroDe(p, m, g));
    const nodo = nodoAlTocar(p, m, estado.contexto);
    if (!enMulti) {
      // como un clic: queda elegido lo que se tocó (el grupo cerrado o el muro)
      estado.multi = { m: [], g: [] };
      if (nodo?.t === 'g') { estado.grupoSel = nodo.id; estado.seleccion = null; } else { estado.grupoSel = null; estado.seleccion = idM; }
      estado.avisarPanel();
    }
    const nSel = estado.multi.m.length + estado.multi.g.length;
    if (enMulti && nSel > 1) {
      const ids = [...estado.multi.m, ...estado.multi.g.flatMap(g => murosDe(p, g).map(w => w.id))];
      abrirMenuContextual(x, y, [{ titulo: `${nSel} elegidos` },
        { texto: 'Agrupar', atajo: 'Ctrl+G', accion: () => agruparElegidos() },
        { texto: 'Desagrupar', atajo: 'Ctrl+Mayús+G', no: estado.multi.g.length ? false : 'No hay grupos entre lo elegido', accion: () => desagruparElegidos(estado.multi.g) },
        { texto: 'Desagrupar todo (explotar)', no: estado.multi.g.length ? false : 'No hay grupos entre lo elegido', ayuda: 'Deshace los grupos y los de adentro: todos los muros quedan sueltos', accion: () => desagruparElegidos(estado.multi.g, true) },
        '—', ...menuClase(ids), '—',
        { texto: 'Soltar la selección', atajo: 'Esc', accion: () => { estado.multi = { m: [], g: [] }; estado.avisarPanel(); } },
        { texto: 'Borrar', atajo: 'Supr', peligro: true, accion: () => borrarElegidos() }]);
      return;
    }
    if (nodo?.t === 'g') {
      const g = grupoPorId(p, nodo.id)!, id = g.id;
      const bloq = ancestros(p, id).some(a => a.bloq), fijo = ancestros(p, id).some(a => a.fijo);
      const ids = murosDe(p, id).map(w => w.id);
      const toggle = (k: 'bloq' | 'fijo' | 'oculto', si: string, no: string) => { estado.cambiar(pp => { const gg = grupoPorId(pp, id); if (!gg) return; if (gg[k]) delete gg[k]; else gg[k] = true; }); mensaje(grupoPorId(estado.proyecto, id)?.[k] ? si : no); estado.avisarPanel(); };
      const motivo = bloq ? 'Está bloqueado 🔒: desbloquealo primero' : false;
      abrirMenuContextual(x, y, [
        { titulo: `${g.bloq ? '🔒 ' : ''}${g.fijo ? '📌 ' : ''}${g.nombre} · ${g.comp ? `componente ${g.comp}` : 'grupo'}` },
        { texto: 'Entrar a editar', atajo: 'doble clic', no: motivo, accion: () => { estado.contexto = id; estado.grupoSel = null; mensaje(`Editando «${g.nombre}»: Esc para salir.`); estado.avisarPanel(); } },
        { texto: 'Desagrupar', atajo: 'Ctrl+Mayús+G', no: motivo, ayuda: g.comp ? 'Deshace el grupo; esta copia deja de estar vinculada al componente' : 'Deshace el grupo; su contenido queda suelto y elegido', accion: () => desagruparElegidos([id]) },
        { texto: 'Desagrupar todo (explotar)', no: motivo || (subgrupos(p, id).length < 2 ? 'No tiene grupos adentro' : false), ayuda: 'Deshace el grupo y los grupos de adentro: todos sus muros quedan sueltos', accion: () => desagruparElegidos([id], true) },
        '—',
        g.comp
          ? { texto: 'Hacer único', no: motivo, ayuda: 'Separa esta copia del componente: deja de cambiar con las demás', accion: () => conGrupo(pp => { hacerUnico(pp, id); }, 'La copia ya no está vinculada: es un grupo común.') }
          : { texto: 'Hacer componente', no: motivo, ayuda: 'Un componente es un grupo con copias vinculadas: si editás una, cambian todas', accion: () => conGrupo(pp => hacerComponente(pp, id), 'Ahora es un componente: «Copia vinculada» para repetirlo.') },
        { texto: 'Duplicar', ayuda: 'Copia independiente a la derecha', accion: () => duplicarGrupo(false) },
        { texto: 'Copia vinculada', ayuda: 'Otra copia del mismo componente: si se edita una, cambian todas (si no era componente, pasa a serlo)', accion: () => duplicarGrupo(true) },
        '—',
        { texto: 'Girar 90°', no: motivo || (fijo ? 'Está fijo en su lugar 📌' : false), accion: () => conGrupo(pp => { girarNodo(pp, id); }, 'Grupo girado 90°.') },
        { texto: 'Espejar ↔', no: motivo || (fijo ? 'Está fijo en su lugar 📌' : false), accion: () => conGrupo(pp => { espejarNodo(pp, id, 'x'); }, 'Grupo espejado.') },
        { texto: 'Espejar ↕', no: motivo || (fijo ? 'Está fijo en su lugar 📌' : false), accion: () => conGrupo(pp => { espejarNodo(pp, id, 'y'); }, 'Grupo espejado.') },
        '—',
        { texto: 'Bloquear', marcado: !!g.bloq, ayuda: 'No se mueve ni se edita; se sigue calculando', accion: () => toggle('bloq', `«${g.nombre}» bloqueado 🔒.`, `«${g.nombre}» desbloqueado.`) },
        { texto: 'Fijo en su lugar', marcado: !!g.fijo, ayuda: 'No se mueve, gira ni espeja; se puede entrar a cambiar medidas', accion: () => toggle('fijo', `«${g.nombre}» fijo en su lugar 📌.`, `«${g.nombre}» suelto.`) },
        { texto: 'Ocultar en la planta', marcado: !!g.oculto, ayuda: 'Se sigue calculando', accion: () => toggle('oculto', `«${g.nombre}» oculto: se sigue calculando.`, `«${g.nombre}» visible.`) },
        '—', ...menuClase(ids), '—',
        { texto: 'Borrar el grupo', atajo: 'Supr', peligro: true, no: motivo, accion: () => { conGrupo(pp => borrarGrupo(pp, id), 'Grupo borrado. Ctrl+Z deshace.'); estado.grupoSel = null; estado.avisarPanel(); } },
      ]);
      return;
    }
    const mot = motivoNoEditable(p, m, estado.contexto);
    abrirMenuContextual(x, y, [{ titulo: `${m.id} · ${m.largo.toFixed(2).replace('.', ',')} × ${m.espesor.toFixed(2).replace('.', ',')} m` },
      ...(estado.contexto ? [{ texto: 'Salir del grupo', atajo: 'Esc', accion: () => salirDeGrupo() } as EntradaMenu] : []),
      ...menuClase([idM]), '—',
      { texto: 'Borrar', atajo: 'Supr', peligro: true, no: mot || false, accion: () => borrarElegidos() }]);
  }
  document.addEventListener('keydown', ev => {
    if (modo !== 'calar' || calQue !== 'muro' || (ev.target as HTMLElement).closest?.('input, select, textarea')) return;
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && (abSel || vanoSel)) { ev.preventDefault(); quitarCalado(); }
    else if (ev.key === 'Escape' && (abSel || vanoSel)) { ev.stopImmediatePropagation(); abSel = null; vanoSel = null; armarPanelCal(); dibujar(); }
  });
  document.addEventListener('keydown', ev => { if (modo === 'calar' && calQue === 'losa' && huecoSel && (ev.key === 'Delete' || ev.key === 'Backspace') && !(ev.target as HTMLElement).closest?.('input, select, textarea')) { ev.preventDefault(); const id = huecoSel; huecoSel = null; estado.cambiar(pp => { pp.huecosLosa = (pp.huecosLosa ?? []).filter(x => x.id !== id); }); armarPanelCal(); mensaje('Hueco de losa borrado.'); return; } if (modo === 'calar' && calQue === 'losa' && losaIni && ev.key === 'Escape') { losaIni = null; armarPanelCal(); dibujar(); return; } if ((modo === 'calibrar' || modo === 'insertar' || modo === 'calar' || (modo === 'silueta' && !(ev.target as HTMLElement).closest?.('input, select, textarea'))) && ev.key === 'Escape') { ponerModo('mover'); return; } if (modo === 'dibujar' && ev.key === 'Escape') { if (inicio) inicio = null; else ponerModo('mover'); dibujar(); } });

  svg.addEventListener('pointermove', ev => {
    const co = document.getElementById('coords');
    if (co) { const q = aMundo(ev); co.textContent = `x ${q.x.toFixed(2).replace('.', ',').replace('-', '−')} · y ${q.y.toFixed(2).replace('.', ',').replace('-', '−')} m · ajuste ${estado.grillaFina ? '5' : '1'} cm`; }
    if (modo === 'dibujar') { cursor = pegar(ev); pedirDibujo(); return; }
    if (modo === 'mover' && !arrastre && !arrastreNodo && !pan) {
      const t = ev.target as Element;
      const enNodo = t.closest?.('.nodos-hover');
      const id = enNodo ? hoverId : ((t.closest?.('g.muro') as SVGGElement | null)?.dataset.id ?? null);
      if (id !== hoverId && ev.pointerType !== 'touch') { hoverId = id; pedirDibujo(); }
    }
    if (modo === 'insertar') { const q = aMundo(ev); cursor = { x: aj(q.x), y: aj(q.y) }; pedirDibujo(); return; }
    if (modo === 'calar' && arrAb) {
      const ar = arrAb, w = estado.proyecto.muros.find(x => x.id === ar.id), a = w?.aberturas?.[ar.i], k = w && a && caraAbertura(w, a);
      if (!w || !a || !k) return;
      const lim = k.L / 2 - 0.1 - a.ancho / 2;
      const sN = Math.max(-lim, Math.min(lim, aGuia(k, aj(ar.s0 + sobreCara(k, aMundo(ev)) - ar.q0), a.ancho)));
      if (Math.abs(sN - a.s) < 1e-6) return;
      const nueva = { ...a, s: +sN.toFixed(3) };
      if (!problemaAbertura({ ...w, aberturas: [...w.aberturas!.filter((_, q) => q !== ar.i), nueva] }, nueva, entrepisoMin(w))) { a.s = nueva.s; ar.movio = true; pedirDibujo(); }
      return;
    }
    if (modo === 'calar' && calQue === 'losa') { cursorLosa = pegarNodo(ev, new Set()); if (losaIni) pedirDibujo(); return; }
    if (modo === 'calar') { const q = aMundo(ev), idM = ((ev.target as Element).closest?.('g.muro') as SVGGElement | null)?.dataset.id; const sobre = aberturaBajo(q, estado.proyecto.niveles[iNivel]?.cota ?? 0) || vanoBajo(q); svg.classList.toggle('sobre-calado', !!sobre); previaCalar = idM && !sobre ? { id: idM, q } : null; pedirDibujo(); return; }
    if (modo === 'calibrar') return;
    if (arrastreNodo) {
      if (!pasoUmbral(ev)) return;
      const excl = new Set(arrastreNodo.orig.map(o => o.id));
      const q = pegarNodo(ev, excl);
      const dx = q.x - arrastreNodo.p.x, dy = q.y - arrastreNodo.p.y;
      arrastreNodo.orig.forEach(o => { const w = estado.proyecto.muros.find(x => x.id === o.id); if (w) { w.x = +(o.x + dx).toFixed(3); w.y = +(o.y + dy).toFixed(3); } });
      cursor = q; pedirDibujo();
      return;
    }
    if (modo === 'silueta') {
      if (arrastreV === null || !pasoUmbral(ev)) return;
      const q = aMundo(ev), nv = estado.proyecto.niveles[iNivel], v = editaCarp ? nv.carpinteria : nv.silueta;
      if (v && v[arrastreV]) {
        // los puntos de control de las Bézier que llegan y salen de este vértice se mueven con él
        const k = arrastreV, a = v[k], dx = aj(q.x) - a.x, dy = aj(q.y) - a.y, pr = v[(k - 1 + v.length) % v.length];
        if (a.c1) a.c1 = { x: a.c1.x + dx, y: a.c1.y + dy };
        if (pr.c2) pr.c2 = { x: pr.c2.x + dx, y: pr.c2.y + dy };
        a.x = aj(q.x); a.y = aj(q.y); pedirDibujo();
      }
      return;
    }
    if (!arrastre || !pasoUmbral(ev)) return;
    const q = aMundo(ev);
    const snap = (v: number) => aj(v);
    const m = estado.proyecto.muros.find(x => x.id === arrastre!.id);
    if (!m) return;
    m.x = +snap(arrastre.x0 + q.x - arrastre.mx).toFixed(2);
    m.y = +snap(arrastre.y0 + q.y - arrastre.my).toFixed(2);
    // el grupo se mueve entero
    const dx = m.x - arrastre.x0, dy = m.y - arrastre.y0;
    arrastre.otros.forEach(o => { const w = estado.proyecto.muros.find(x => x.id === o.id); if (w) { w.x = +(o.x + dx).toFixed(2); w.y = +(o.y + dy).toFixed(2); } });
    pedirDibujo();
  });
  const soltar = () => { umbral = null; if (arrAb) { const mv = arrAb.movio; arrAb = null; if (mv) estado.cambiar(); armarPanelCal(); return; } if (arrastreNodo) { arrastreNodo = null; cursor = null; destinoIman = null; estado.cambiar(); return; } if (arrastre) { arrastre = null; estado.cambiar(); } if (arrastreV !== null) { arrastreV = null; estado.cambiar(); if (modo === 'silueta') armarPanelSil(); } };
  svg.addEventListener('pointerup', soltar);
  svg.addEventListener('pointercancel', soltar);
  svg.addEventListener('keydown', ev => {
    const m = estado.proyecto.muros.find((x: Muro) => x.id === estado.seleccion);
    if (!m) return;
    const paso = ev.shiftKey ? 1 : 0.05;
    const mov: Record<string, [number, number]> = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, paso], ArrowDown: [0, -paso] };
    if (mov[ev.key]) { ev.preventDefault(); if (muroBloqueado(estado.proyecto, m)) { mensaje(`${m.id} está bloqueado 🔒.`); return; } if (muroFijo(estado.proyecto, m)) { mensaje(`${m.id} está en un grupo fijo en su lugar 📌.`); return; } const ids = compas(m); estado.cambiar(() => { estado.proyecto.muros.forEach(w => { if (ids.includes(w.id)) { w.x = +(w.x + mov[ev.key][0]).toFixed(2); w.y = +(w.y + mov[ev.key][1]).toFixed(2); } }); }); }
  });
  new ResizeObserver(dibujar).observe(svg);
  estado.suscribir(dibujar);
  estado.suscribirSeleccion(() => { refNodo = -1; clavePrec = ''; const m = estado.proyecto.muros.find(x => x.id === estado.seleccion); if (medGrupo && m?.grupo !== medGrupo) { medGrupo = null; panelMed.hidden = true; } dibujar(); });
  ponerModo('mover');
}
