/** Editor de la planta de PB en SVG: grilla, contorno, ejes, muros coloreados por su papel; arrastrar para mover. */
import { estado, COLORES } from './estado';
import { dInterior, huella, presenteEn, rectangulos, tipoDe, type Muro } from '../engine/modelo';
import { agrupar, armarPiezas, imanar, muroDesdeTramo, type Punto } from '../engine/dibujo';
import { partes, PARTES, piezaTipo, problemaMedidas, rehacerPieza, TIPOS, type MedidasPieza, type TipoPieza } from '../engine/piezasTipo';
import { aMetros, contornoDesdeCAD, factorUnidad, imanCAD, leerDXFCompleto, murosDesdeCAD, nodosCAD, type Entidad } from '../engine/cad';
import { carpinteriaDeNivel } from '../engine/silueta';
import { Jreal } from '../engine/mapping';
import { areasInfluencia, type AreasInfluencia } from '../engine/areas';
import { ajustarContorno, areaSilueta, cajaSilueta, leerDXF, plantaDeNivel, puntosSilueta, type Vertice } from '../engine/silueta';

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
  ([['alma', 'alma (izq.)'], ['alma der.', 'alma der.'], ['ala sup.', 'ala sup.'], ['ala inf.', 'ala inf.'], ['tubo', 'tubo'], ['columna', 'columna circ.'], ['fuera del cálculo', 'fuera del cálculo']] as const).forEach(([k, t]) => {
    const sp = document.createElement('span'); const i = document.createElement('i'); i.className = 'caja'; i.style.background = COLORES[k]; sp.append(i, t); ley.append(sp);
  });
  cont.appendChild(ley);
  // herramientas: mover (arrastrar muros) o dibujar (dos clics por muro, encadenados; Esc termina)
  let modo: 'mover' | 'dibujar' | 'calibrar' | 'silueta' | 'insertar' = 'mover';
  // pieza tipo a insertar (biblioteca)
  let insTipo: TipoPieza = 'C';
  const insMed: MedidasPieza = { h: 4, b: 2, e: 0.2, giro: 0 };
  let iNivel = 0;
  let arrastreV: number | null = null;
  /** en el modo «Silueta»: se edita el contorno de la losa (false) o el de la carpintería (true) */
  let editaCarp = false;
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
  bDibujar.title = 'Clic en el inicio y clic en el fin: el muro sale horizontal o vertical y se pega a los extremos de otros muros. Sigue encadenado; Esc o doble clic termina.';
  bArmar.title = 'Los muros que se tocan forman una pieza (T1, T2… en el viento A y T1B, T2B… en el B); el ala queda pegada a su alma.';
  const ponerModo = (m: typeof modo) => { modo = m; inicio = null; calib = []; bMover.setAttribute('aria-pressed', String(m === 'mover')); bDibujar.setAttribute('aria-pressed', String(m === 'dibujar')); bSil.setAttribute('aria-pressed', String(m === 'silueta')); svg.classList.toggle('dibujando', m === 'dibujar' || m === 'calibrar'); svg.classList.toggle('editando-silueta', m === 'silueta'); panelSil.hidden = m !== 'silueta'; bIns.setAttribute('aria-pressed', String(m === 'insertar')); panelIns.hidden = m !== 'insertar'; svg.classList.toggle('dibujando', m === 'dibujar' || m === 'calibrar' || m === 'insertar'); if (m === 'insertar') armarPanelIns(); dibujar(); };
  bMover.addEventListener('click', () => ponerModo('mover'));
  bDibujar.addEventListener('click', () => ponerModo('dibujar'));
  bArmar.addEventListener('click', () => estado.cambiar(() => { estado.proyecto.muros = armarPiezas(estado.proyecto.muros); }));
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
  dock.addEventListener('click', ev => { const t = ev.target as HTMLElement; if (t.tagName === 'B' && t.parentElement?.classList.contains('calco-panel')) t.parentElement.classList.toggle('plegado'); });
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
  bSil.type = 'button'; bSil.textContent = 'Contornos';
  bSil.title = 'Editar el contorno de la losa o de la carpintería de este piso: arrastrar los vértices, doble clic en un borde para agregar uno, clic derecho en un vértice para borrarlo. También se importa de AutoCAD (DXF).';
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
      if (!cs.length) { window.alert('El DXF no tiene polilíneas cerradas (LWPOLYLINE). En AutoCAD: PEDIT → Juntar → Cerrar.'); return; }
      const mayor = cs.map(c => ({ c, a: areaSilueta(c) })).sort((x, y) => y.a - x.a)[0].c;   // el contorno más grande
      const ext = cajaSilueta(mayor);
      const guess = Math.max(ext.B, ext.L) > 2000 ? 'mm' : Math.max(ext.B, ext.L) > 200 ? 'cm' : 'm';
      const u = (window.prompt(`Unidad del dibujo (m, cm o mm). El contorno mide ${ext.B.toFixed(1)} × ${ext.L.toFixed(1)} en el DXF:`, guess) ?? '').trim().toLowerCase();
      const factor = u === 'mm' ? 0.001 : u === 'cm' ? 0.01 : u === 'm' ? 1 : NaN;
      if (!isFinite(factor)) return;
      estado.cambiar(() => { const nv = estado.proyecto.niveles[iNivel]; const c = ajustarContorno(mayor, factor, true); if (editaCarp) nv.carpinteria = c; else nv.silueta = c; });
    });
    const que = document.createElement('div'); que.className = 'seg seg-chico'; que.setAttribute('role', 'group'); que.setAttribute('aria-label', 'Contorno a editar');
    ([['Losa', false], ['Carpintería', true]] as const).forEach(([t, v]) => { const x = boton(t, () => { editaCarp = v; armarPanelSil(); dibujar(); }, v ? 'Contorno de la carpintería (cerramiento): su caja da a máx y b máx' : 'Contorno de la losa (silueta del piso)'); x.setAttribute('aria-pressed', String(editaCarp === v)); que.append(x); });
    if (editaCarp) {
      const car = carpinteriaDeNivel(p, iNivel);
      const f2 = (x: number) => x.toFixed(2).replace('.', ',');
      panelSil.append(que, b(`Carpintería de ${n.nombre}`),
        linea(!car ? 'sin carpintería: arrastrá un vértice y se copia la silueta de la losa' : car.propia ? 'propia de este nivel' : 'heredada del nivel de arriba (se copia al editarla)'),
        ...(car ? [linea(`a máx ${f2(car.a)} × b máx ${f2(car.b)} m · área ${areaSilueta(car.v).toFixed(1).replace('.', ',')} m²`)] : []),
        linea(`la planilla usa B × L = ${pl.B} × ${pl.L} m${car && (Math.abs(car.a - pl.B) > 0.01 || Math.abs(car.b - pl.L) > 0.01) ? ' (distinto de la caja)' : ''}`),
        dxf,
        boton('Copiar de la losa', () => estado.cambiar(() => { estado.proyecto.niveles[iNivel].carpinteria = pl.silueta.map(v => ({ ...v })); }), 'La carpintería arranca igual que la silueta de la losa; después se mueven los vértices hacia adentro.'),
        ...(car ? [boton('Usar a máx y b máx como B y L', () => estado.cambiar(() => { const nv = estado.proyecto.niveles[iNivel]; nv.B = +car.a.toFixed(2); nv.L = +car.b.toFixed(2); }), 'Escribe en este nivel B = a máx y L = b máx (es lo que lee la planilla para el viento). No se hace solo: queda a tu criterio.')] : []),
        boton('Quitar carpintería', () => estado.cambiar(() => { estado.proyecto.niveles[iNivel].carpinteria = null; }), 'Vuelve a la del nivel de arriba (o a ninguna).'));
      return;
    }
    panelSil.append(que, b(`Silueta de ${n.nombre}`), linea(pl.propia ? 'propia de este nivel' : 'heredada (se copia al editarla)'),
      linea(`área ${areaSilueta(pl.silueta).toFixed(1).replace('.', ',')} m² · caja ${caja.B.toFixed(2).replace('.', ',')} × ${caja.L.toFixed(2).replace('.', ',')} m`),
      linea(`la planilla usa B × L = ${pl.B} × ${pl.L} m`),
      dxf,
      boton('Usar la caja como B y L', () => estado.cambiar(() => { const nv = estado.proyecto.niveles[iNivel]; nv.B = +caja.B.toFixed(2); nv.L = +caja.L.toFixed(2); }), 'Pone en este nivel B y L iguales a la caja de la silueta (lo que lee la planilla para el viento).'),
      boton('Quitar silueta', () => estado.cambiar(() => { estado.proyecto.niveles[iNivel].silueta = null; }), 'Vuelve a la del nivel de arriba o al rectángulo B × L.'));
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
      b.append(miniatura(t.tipo, { ...insMed, giro: 0, h: 4, b: t.tipo === 'núcleo' ? 3 : 2, e: t.tipo === 'columna' ? 2 : 0.3 }, 30));
      const sp = document.createElement('span'); sp.textContent = t.nombre; b.append(sp);
      b.addEventListener('click', () => { insTipo = t.tipo; if (t.tipo === 'columna') { insMed.h = 0.6; insMed.e = 0.3; } else if (insMed.h < 1) { insMed.h = 4; insMed.e = 0.2; } armarPanelIns(); dibujar(); });
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
      datos.innerHTML = `<span>J viento A (↑) <b>${f(Jreal(ms, 'A'))}</b> m⁴</span><span>J viento B (→) <b>${f(Jreal(ms, 'B'))}</b> m⁴</span><span>área <b>${f(ms.reduce((q, m) => q + (tipoDe(m) === 'tubo-circ' ? Math.PI / 4 * (m.largo ** 2 - Math.max(0, m.largo - 2 * m.espesor) ** 2) : rectangulos(m).reduce((z, r) => z + r.ax * r.ay, 0)), 0))}</b> m²</span>`;
    };
    const filaMed = document.createElement('div'); filaMed.className = 'medidas';
    filaMed.append(campo(insTipo === 'columna' ? 'D' : 'h', 'h', insTipo === 'columna' ? 'diámetro exterior (m)' : 'largo del alma, medida total (m)'));
    if (info.usaB) filaMed.append(campo('b', 'b', 'ancho de las alas (m)'));
    filaMed.append(campo('e', 'e', insTipo === 'columna' ? 'espesor de pared (la mitad de D: maciza)' : 'espesor (m)'), giro);
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
    gen.append(campo('h', tipo === 'columna' ? 'D' : 'h', tipo === 'columna' ? 'diámetro exterior (m)' : 'largo del alma, medida total (m)', false, med.h));
    if (t.usaB) gen.append(campo('b', 'b', 'ancho de las alas (m), si no se da uno por ala', false, med.b));
    gen.append(campo('e', 'e', 'espesor general (m), si no se da uno por parte', false, med.e));
    const porParte = document.createElement('div'); porParte.className = 'medidas por-parte';
    PARTES[tipo].forEach(k => porParte.append(campo(k, NOMBRE_PARTE[k][0], `${NOMBRE_PARTE[k][1]}; vacío = la general`, true, ef[k])));
    const vista = document.createElement('div'); vista.className = 'vista-pieza';
    vista.append(miniatura(tipo, med, 96));
    const datos = document.createElement('div'); datos.className = 'datos-pieza';
    const f = (x: number) => x.toLocaleString('es-AR', { maximumFractionDigits: 3 });
    datos.innerHTML = `<span>J viento A (↑) <b>${f(Jreal(ms, 'A'))}</b> m⁴</span><span>J viento B (→) <b>${f(Jreal(ms, 'B'))}</b> m⁴</span><span>${ms.length} muro${ms.length > 1 ? 's' : ''}: ${ms.map(m => m.id).join(', ')}</span>`;
    const nota = document.createElement('p'); nota.className = 'nota chica';
    nota.textContent = `${t.ayuda} Las partes se nombran en la posición de la pieza sin girar (alma vertical, ala superior arriba). Los cambios se aplican al salir del campo o con Enter; el centro de la pieza queda donde está.`;
    const listo = document.createElement('button'); listo.type = 'button'; listo.textContent = 'Listo';
    listo.addEventListener('click', () => { medGrupo = null; armarPanelMed(); dibujar(); });
    panelMed.append(tit, gen, ...(PARTES[tipo].length ? [porParte] : []), vista, datos, nota, listo);
  }
  let ultimoToque: { id: string; t: number } | null = null;
  function abrirMedidas(m: Muro) {
    if (!m.grupo) return;
    if (!m.pieza) { mensaje(`${m.id} está en el grupo ${m.grupo}, que no es una pieza tipo: sus muros se editan uno por uno en «Muros».`); return; }
    medGrupo = m.grupo; armarPanelMed();
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
  function armarPanelAreas(i: number, a: AreasInfluencia) {
    panelAreas.hidden = !verAreas;
    if (!verAreas) return;
    const p = estado.proyecto, f1 = (v: number) => v.toFixed(1).replace('.', ',');
    const mk = <K extends keyof HTMLElementTagNameMap>(t: K, txt = '', cls = '') => { const e = document.createElement(t); if (txt) e.textContent = txt; if (cls) e.className = cls; return e; };
    panelAreas.replaceChildren(mk('b', `Áreas de influencia · ${p.niveles[i]?.nombre ?? ''}`));
    const suma = a.ids.reduce((q, id) => q + a.area[id], 0);
    panelAreas.append(mk('span', `losa ${f1(a.total)} m² · ${a.ids.length} elementos`, 'nota-chica'));
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
  barra.append(bMover, bDibujar, bArmar, bCalco, bSil, bIns, bAreas);
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
  const nodosDe = (m: Muro): { x: number; y: number; t: 'esquina' | 'medio' | 'centro' }[] => {
    if (tipoDe(m) === 'tubo-circ') { const r = m.largo / 2; return [{ x: m.x, y: m.y, t: 'centro' }, { x: m.x + r, y: m.y, t: 'medio' }, { x: m.x - r, y: m.y, t: 'medio' }, { x: m.x, y: m.y + r, t: 'medio' }, { x: m.x, y: m.y - r, t: 'medio' }]; }
    const { ax, ay } = huella(m), x0 = m.x - ax / 2, x1 = m.x + ax / 2, y0 = m.y - ay / 2, y1 = m.y + ay / 2;
    return [{ x: x0, y: y0, t: 'esquina' }, { x: x1, y: y0, t: 'esquina' }, { x: x1, y: y1, t: 'esquina' }, { x: x0, y: y1, t: 'esquina' },
      { x: m.x, y: y0, t: 'medio' }, { x: x1, y: m.y, t: 'medio' }, { x: m.x, y: y1, t: 'medio' }, { x: x0, y: m.y, t: 'medio' }, { x: m.x, y: m.y, t: 'centro' }];
  };
  const NOMBRE_NODO = ['esquina inf. izq.', 'esquina inf. der.', 'esquina sup. der.', 'esquina sup. izq.', 'medio de abajo', 'medio derecho', 'medio de arriba', 'medio izquierdo', 'centro'];
  const NOMBRE_NODO_CIRC = ['centro', 'borde derecho', 'borde izquierdo', 'borde de arriba', 'borde de abajo'];
  // mover con precisión: se elige un nodo del elemento (o del grupo) y se lo lleva a unas coordenadas o se lo corre dx, dy
  let refNodo = -1;   // −1 = el centro
  const valPrec = { x: '', y: '', dx: '', dy: '' };
  const panelPrec = document.createElement('div');
  panelPrec.className = 'calco-panel prec-panel';
  panelPrec.hidden = true;
  cont.appendChild(panelPrec);
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
    const ids = m.grupo ? p.muros.filter(o => o.grupo === m.grupo).map(o => o.id) : [m.id];
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
    panelPrec.append(mk('b', `Mover con precisión · ${m.id}${m.grupo ? ` (grupo ${m.grupo}: ${ids.length} muros)` : ''}`));
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

  const aMundo = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left - ox) / escala, y: -(ev.clientY - r.top - oy) / escala };
  };

  function dibujar() {
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
    const B = pl.B, L = pl.L;
    if (modo === 'silueta') armarPanelSil();
    const zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0, zTop = p.niveles[0]?.cota ?? 0;
    const zN = nivel?.cota ?? 0;
    const w = svg.clientWidth || 600, h = svg.clientHeight || 500;
    const ext = Math.max(B, L, ...p.muros.map(m => 2 * (Math.abs(m.x) + huella(m).ax / 2)), ...p.muros.map(m => 2 * (Math.abs(m.y) + huella(m).ay / 2))) + (w < 520 ? 12 : 6);   // en pantallas chicas, más margen para los rótulos
    escala = Math.min(w, h) / ext;
    ox = w / 2; oy = h / 2;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.replaceChildren();
    const X = (x: number) => ox + x * escala, Y = (y: number) => oy - y * escala;
    // grilla de 1 m
    const g = el('g', { class: 'grilla' });
    const n = Math.ceil(ext / 2);
    for (let i = -n; i <= n; i++) {
      g.appendChild(el('line', { x1: X(i), y1: Y(-n), x2: X(i), y2: Y(n), class: i % 5 ? 'g1' : 'g5' }));
      g.appendChild(el('line', { x1: X(-n), y1: Y(i), x2: X(n), y2: Y(i), class: i % 5 ? 'g1' : 'g5' }));
    }
    svg.appendChild(g);
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
        estado.cambiar(() => { const s2 = siluetaPropia(); s2[mejor] = { ...s2[mejor], b: 0 }; s2.splice(mejor + 1, 0, { x: +(Math.round(q.x / 0.05) * 0.05).toFixed(2), y: +(Math.round(q.y / 0.05) * 0.05).toFixed(2) }); });
      });
      vEd.forEach((v, i) => {
        const hnd = el('circle', { cx: X(v.x), cy: Y(v.y), r: 3.5, class: 'vertice' + (editaCarp ? ' vertice-carp' : ''), tabindex: 0 });
        hnd.appendChild(el('title', {}, `vértice ${i + 1}: x ${v.x.toFixed(2)} · y ${v.y.toFixed(2)}${v.b ? ` · arco (bulge ${v.b.toFixed(3)})` : ''} · arrastrar para mover, clic derecho para borrar`));
        hnd.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); siluetaPropia(); arrastreV = i; try { svg.setPointerCapture(ev.pointerId); } catch { /* sintético */ } });
        hnd.addEventListener('contextmenu', ev => { ev.preventDefault(); if (vEd.length > 3) estado.cambiar(() => { siluetaPropia().splice(i, 1); }); });
        svg.appendChild(hnd);
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
    const r = estado.fuente === 'guia' ? c0.corr?.guia : c0.res;
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
    // muros
    const papeles = estado.calculo.asig?.papeles ?? {};
    const yaRotuladas = new Set<string>();
    p.muros.forEach(m => {
      const papel = papeles[m.id]?.[estado.dir] ?? 'sin pieza';
      const { ax: dx, ay: dy } = huella(m);
      const t = tipoDe(m);
      const esta = presenteEn(m, zN, zFund, zTop);
      const grupoSel = !!m.grupo && p.muros.find(x => x.id === estado.seleccion)?.grupo === m.grupo;
      const grupo = el('g', { class: 'muro' + (estado.seleccion === m.id ? ' sel' : grupoSel ? ' sel-grupo' : '') + (m.llega ? '' : ' fuera') + (esta ? '' : ' ausente'), 'data-id': m.id, tabindex: 0 });
      const forma = el('g');
      if (t === 'tubo-circ') {
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
        ultimoEspesor = m.espesor;
        // doble clic propio (la planta se redibuja entre los dos clics y el navegador no lo cuenta): abre las medidas de la pieza
        const ahora = performance.now();
        if (ultimoToque && ultimoToque.id === m.id && ahora - ultimoToque.t < 450) { ultimoToque = null; abrirMedidas(m); return; }
        ultimoToque = { id: m.id, t: ahora };
        estado.seleccion = m.id;
        const q = aMundo(ev);
        arrastre = { id: m.id, x0: m.x, y0: m.y, mx: q.x, my: q.y, otros: m.grupo ? estado.proyecto.muros.filter(o => o.grupo === m.grupo && o.id !== m.id).map(o => ({ id: o.id, x: o.x, y: o.y })) : [] };
        try { svg.setPointerCapture(ev.pointerId); } catch { /* puntero sintético: se arrastra igual */ }
        estado.cambiar();
      });
      svg.appendChild(grupo);
    });
    calib.forEach(q => svg.appendChild(el('circle', { cx: X(q.x), cy: Y(q.y), r: 4, class: 'iman extremo' })));
    // nodos del elemento elegido (modo mover): se arrastran para ubicarlo con precisión
    const elegido = modo === 'mover' ? p.muros.find(m => m.id === estado.seleccion) : undefined;
    if (elegido && presenteEn(elegido, zN, zFund, zTop)) {
      const gg = el('g', { class: 'nodos' });
      const lista = nodosDe(elegido);
      // en muros finos las esquinas y los medios de los lados cortos quedan pegados: se dibuja uno solo
      // (primero el centro, después las esquinas, después los medios)
      const puestos: [number, number][] = [];
      const prio = { centro: 0, esquina: 1, medio: 2 } as const;
      const visibles = new Set(lista.map((nd, i) => ({ nd, i })).sort((u, v) => prio[u.nd.t] - prio[v.nd.t]).filter(({ nd }) => {
        const x = X(nd.x), y = Y(nd.y), esRef = refNodo >= 0 ? nd === lista[refNodo] : false;
        if (!esRef && puestos.some(([a, b]) => Math.hypot(a - x, b - y) < 7)) return false;
        puestos.push([x, y]); return true;
      }).map(o => o.nd));
      lista.forEach(nd => {
        if (!visibles.has(nd)) return;
        const x = X(nd.x), y = Y(nd.y);
        const esRef = refNodo >= 0 ? nd === lista[refNodo] : nd.t === 'centro';
        // marca chica (no tapa el muro) y un círculo invisible más grande para agarrarla fácil
        const forma = el('g', { class: `nodo nodo-${nd.t}` });
        forma.appendChild(el('circle', { cx: x, cy: y, r: 8, class: 'hit' }));
        forma.appendChild(nd.t === 'esquina' ? el('rect', { x: x - 2.75, y: y - 2.75, width: 5.5, height: 5.5 })
          : nd.t === 'medio' ? el('polygon', { points: `${x},${y - 3.6} ${x - 3.3},${y + 2.7} ${x + 3.3},${y + 2.7}` })
            : el('polygon', { points: `${x},${y - 4.2} ${x + 4.2},${y} ${x},${y + 4.2} ${x - 4.2},${y}`, class: 'centro' }));
        forma.appendChild(el('title', {}, `Arrastrar desde ${nd.t === 'esquina' ? 'esta esquina' : nd.t === 'medio' ? 'el medio de este lado' : 'el centro'}: se pega a los nodos del plano o de otros muros${elegido.grupo ? ' (mueve el grupo entero)' : ''}`));
        forma.addEventListener('pointerdown', e0 => {
          const ev = e0 as PointerEvent;
          ev.preventDefault(); ev.stopPropagation();
          // el segundo clic de un doble clic suele caer en un nodo del elemento recién elegido
          const ahora = performance.now();
          if (ultimoToque && ultimoToque.id === elegido.id && ahora - ultimoToque.t < 450) { ultimoToque = null; abrirMedidas(elegido); return; }
          ultimoToque = { id: elegido.id, t: ahora };
          refNodo = nodosDe(elegido).findIndex(o => o.x === nd.x && o.y === nd.y); clavePrec = '';
          const ids = elegido.grupo ? p.muros.filter(o => o.grupo === elegido.grupo).map(o => o.id) : [elegido.id];
          arrastreNodo = { p: { x: nd.x, y: nd.y }, orig: p.muros.filter(o => ids.includes(o.id)).map(o => ({ id: o.id, x: o.x, y: o.y })) };
          try { svg.setPointerCapture(ev.pointerId); } catch { /* sintético */ }
        });
        if (esRef) forma.classList.add('ref');
        gg.appendChild(forma);
      });
      svg.appendChild(gg);
    }
    armarPanelPrec();
    if (medGrupo) { panelPrec.hidden = true; if (!panelMed.contains(document.activeElement)) armarPanelMed(); }
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
      if (inicio) {
        const t = muroDesdeTramo(inicio, cursor, ultimoEspesor);
        if (t) {
          const ax = t.dir === 'X' ? t.largo : t.espesor, ay = t.dir === 'X' ? t.espesor : t.largo;
          pr.appendChild(el('rect', { x: X(t.x - ax / 2), y: Y(t.y + ay / 2), width: Math.max(2, ax * escala), height: Math.max(2, ay * escala) }));
          pr.appendChild(el('text', { x: X(t.x) + (t.dir === 'Y' ? 8 : 0), y: Y(t.y) + (t.dir === 'X' ? -8 : 4), class: 'etiqueta', 'text-anchor': t.dir === 'X' ? 'middle' : 'start' }, `${t.largo.toFixed(2).replace('.', ',')} m`));
        }
        pr.appendChild(el('circle', { cx: X(inicio.x), cy: Y(inicio.y), r: 4, class: 'iman' }));
      }
      pr.appendChild(el('circle', { cx: X(cursor.x), cy: Y(cursor.y), r: iman === 'grilla' ? 2.5 : 4.5, class: `iman ${iman}` }));
      if (ultimoIman && ultimoIman !== 'grilla') pr.appendChild(el('text', { x: X(cursor.x) + 10, y: Y(cursor.y) - 10, class: 'etiqueta iman-txt' }, ultimoIman));
      svg.appendChild(pr);
    }
    if (verAreas) acomodarAreas();
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
    const q = aMundo(ev), tol = 8 / escala + 0.05;
    const nc = estado.cad ? imanCAD(q, estado.cad.nodos, tol) : null;
    if (nc) { iman = nc.t === 'intersección' || nc.t === 'centro' ? 'extremo' : 'eje'; ultimoIman = nc.t; return { x: +nc.p.x.toFixed(3), y: +nc.p.y.toFixed(3) }; }
    const r = imanar(q, excluir ? estado.proyecto.muros.filter(m => !excluir.has(m.id)) : estado.proyecto.muros, tol); iman = r.a; ultimoIman = r.a; return r.p;
  };
  let ultimoIman = '';
  svg.addEventListener('pointerdown', ev => {
    if (modo === 'insertar' && ev.button === 0) {
      ev.preventDefault();
      const q = aMundo(ev), g5 = (v: number) => +(Math.round(v / 0.05) * 0.05).toFixed(2);
      const mal = problemaMedidas(insTipo, insMed);
      if (mal) { mensaje(`No se puede insertar: ${mal}.`); return; }
      estado.cambiar(() => {
        const p = estado.proyecto;
        const nuevos = piezaTipo(insTipo, insMed, g5(q.x), g5(q.y), new Set(p.muros.map(m => m.id)));
        p.muros = agrupar([...p.muros, ...nuevos], nuevos.map(m => m.id)).muros;
        estado.seleccion = nuevos[0].id;
      });
      ponerModo('mover');
      return;
    }
    if (modo === 'calibrar' && ev.button === 0 && estado.calco) {
      ev.preventDefault();
      calib.push(aMundo(ev));
      dibujar();
      if (calib.length === 2) {
        const medida = Math.hypot(calib[1].x - calib[0].x, calib[1].y - calib[0].y);
        const txt = window.prompt(`Distancia real entre los dos puntos, en metros (en el dibujo mide ${medida.toFixed(2).replace('.', ',')} m):`);
        const real = Number(String(txt ?? '').replace(',', '.'));
        if (real > 0 && medida > 1e-6) {
          const f = real / medida, c = estado.calco;
          // escala alrededor del primer punto: ese punto queda en su lugar
          c.x = +(calib[0].x + (c.x - calib[0].x) * f).toFixed(3); c.y = +(calib[0].y + (c.y - calib[0].y) * f).toFixed(3); c.ancho = +(c.ancho * f).toFixed(3);
          armarPanelCalco();
        }
        ponerModo('mover');
      }
      return;
    }
    if (modo !== 'dibujar' || ev.button !== 0) return;
    ev.preventDefault();
    const q = pegar(ev);
    if (!inicio) { inicio = q; cursor = q; dibujar(); return; }
    const t = muroDesdeTramo(inicio, q, ultimoEspesor);
    if (!t) return;
    const fin = t.dir === 'X' ? { x: t.x + (q.x >= inicio.x ? 1 : -1) * t.largo / 2, y: t.y } : { x: t.x, y: t.y + (q.y >= inicio.y ? 1 : -1) * t.largo / 2 };
    estado.cambiar(() => {
      const id = nuevoId();
      const m: Muro = { id, ...t, llega: true, areaInf: 10, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '' };
      estado.proyecto.muros = armarPiezas([...estado.proyecto.muros, m]);
      estado.seleccion = id;
    });
    inicio = { x: +fin.x.toFixed(2), y: +fin.y.toFixed(2) };      // encadenado: el próximo arranca donde terminó este
  });
  svg.addEventListener('dblclick', () => { if (modo === 'dibujar') { inicio = null; dibujar(); } });
  svg.addEventListener('contextmenu', ev => { if (modo === 'dibujar') { ev.preventDefault(); inicio = null; dibujar(); } });
  document.addEventListener('keydown', ev => { if ((modo === 'calibrar' || modo === 'insertar') && ev.key === 'Escape') { ponerModo('mover'); return; } if (modo === 'dibujar' && ev.key === 'Escape') { if (inicio) inicio = null; else ponerModo('mover'); dibujar(); } });

  svg.addEventListener('pointermove', ev => {
    const co = document.getElementById('coords');
    if (co) { const q = aMundo(ev); co.textContent = `x ${q.x.toFixed(2).replace('.', ',').replace('-', '−')} · y ${q.y.toFixed(2).replace('.', ',').replace('-', '−')} m`; }
    if (modo === 'dibujar') { cursor = pegar(ev); dibujar(); return; }
    if (modo === 'insertar') { const q = aMundo(ev); cursor = { x: +(Math.round(q.x / 0.05) * 0.05).toFixed(2), y: +(Math.round(q.y / 0.05) * 0.05).toFixed(2) }; dibujar(); return; }
    if (modo === 'calibrar') return;
    if (arrastreNodo) {
      const excl = new Set(arrastreNodo.orig.map(o => o.id));
      const q = pegar(ev, excl);
      const dx = q.x - arrastreNodo.p.x, dy = q.y - arrastreNodo.p.y;
      arrastreNodo.orig.forEach(o => { const w = estado.proyecto.muros.find(x => x.id === o.id); if (w) { w.x = +(o.x + dx).toFixed(3); w.y = +(o.y + dy).toFixed(3); } });
      cursor = q; dibujar();
      if (ultimoIman && ultimoIman !== 'grilla') svg.appendChild(el('text', { x: ox + q.x * escala + 10, y: oy - q.y * escala - 10, class: 'etiqueta iman-txt' }, ultimoIman));
      return;
    }
    if (modo === 'silueta') {
      if (arrastreV === null) return;
      const q = aMundo(ev), nv = estado.proyecto.niveles[iNivel], v = editaCarp ? nv.carpinteria : nv.silueta;
      if (v && v[arrastreV]) { v[arrastreV].x = +(Math.round(q.x / 0.05) * 0.05).toFixed(2); v[arrastreV].y = +(Math.round(q.y / 0.05) * 0.05).toFixed(2); dibujar(); }
      return;
    }
    if (!arrastre) return;
    const q = aMundo(ev);
    const snap = (v: number) => Math.round(v / 0.05) * 0.05;
    const m = estado.proyecto.muros.find(x => x.id === arrastre!.id);
    if (!m) return;
    m.x = +snap(arrastre.x0 + q.x - arrastre.mx).toFixed(2);
    m.y = +snap(arrastre.y0 + q.y - arrastre.my).toFixed(2);
    // el grupo se mueve entero
    const dx = m.x - arrastre.x0, dy = m.y - arrastre.y0;
    arrastre.otros.forEach(o => { const w = estado.proyecto.muros.find(x => x.id === o.id); if (w) { w.x = +(o.x + dx).toFixed(2); w.y = +(o.y + dy).toFixed(2); } });
    dibujar();
  });
  const soltar = () => { if (arrastreNodo) { arrastreNodo = null; cursor = null; estado.cambiar(); return; } if (arrastre) { arrastre = null; estado.cambiar(); } if (arrastreV !== null) { arrastreV = null; estado.cambiar(); } };
  svg.addEventListener('pointerup', soltar);
  svg.addEventListener('pointercancel', soltar);
  svg.addEventListener('keydown', ev => {
    const m = estado.proyecto.muros.find((x: Muro) => x.id === estado.seleccion);
    if (!m) return;
    const paso = ev.shiftKey ? 1 : 0.05;
    const mov: Record<string, [number, number]> = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, paso], ArrowDown: [0, -paso] };
    if (mov[ev.key]) { ev.preventDefault(); estado.cambiar(() => { m.x = +(m.x + mov[ev.key][0]).toFixed(2); m.y = +(m.y + mov[ev.key][1]).toFixed(2); }); }
  });
  new ResizeObserver(dibujar).observe(svg);
  estado.suscribir(dibujar);
  estado.suscribirSeleccion(() => { refNodo = -1; clavePrec = ''; const m = estado.proyecto.muros.find(x => x.id === estado.seleccion); if (medGrupo && m?.grupo !== medGrupo) { medGrupo = null; panelMed.hidden = true; } dibujar(); });
  ponerModo('mover');
}
