/**
 * Diseñador 3D del exoesqueleto (etapa 08): las cuatro caras alrededor de las losas, para armar la estructura tocando
 * la torre en vez de llenar campos.
 *
 *  - Zonas en altura: otra tipología desde un nivel (diagrid arriba de un tubo en X, chevrones arriba de mega-marcos…),
 *    cada una con su módulo; entre zonas va una viga de transición. Plantillas listas para arrancar.
 *  - Elegir una barra: sus esfuerzos, su sección, sus uniones o sacarla (vale para las cuatro caras: el cálculo usa una
 *    cara tipo por viento).
 *  - Pintar secciones: se elige un tubo del catálogo y se tocan las barras.
 *  - Armar barra por barra: con la ficha «L · Libre» (o una zona libre) la cara arranca vacía y cada columna, diagonal
 *    y viga se dibuja tocando puntos de una grilla en la cara (divisiones del ancho, pisos y medios pisos), de corrido
 *    como una polilínea. Se borra tocando, se espeja y se repite hacia arriba. Mientras la estructura todavía se mueve
 *    (mecanismo), se sigue viendo y se marcan los nudos sueltos.
 *  - Colores: por clase de barra (diseño) o por esfuerzo (tracción en rojo, compresión en azul, como en toda la app).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { estado, fmt } from './estado';
import { h } from './comp';
import { datosExo, flechaExo, geometriaExo } from './exo';
import { CATALOGO_HORMIGON, CATALOGO_TUBOS, pesoExo, TIPOS_EXO, zonasDe, type BarraNueva, type ClaseBarra, type ExoDef, type Seccion, type TipoExo, type ZonaExo } from '../engine/exo';
import { plantaDeNivel, puntosSilueta } from '../engine/silueta';

type Herramienta = 'elegir' | 'borrar' | 'pintar' | 'zona' | ClaseBarra;
/** barra para dibujar: con esfuerzos si la cara se pudo calcular */
interface BarraVista { id: string; clase: ClaseBarra; a: { s: number; z: number }; b: { s: number; z: number }; sec: Seccion; fraccion?: number; N: number }
type ModoColor = 'clase' | 'esfuerzo' | 'verifica';
const css = (v: string, def: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || def;

/** plantillas: zonas listas (las cotas, como fracción de la altura sobre PB) */
export const PLANTILLAS: { nombre: string; texto: string; tipo: TipoExo; modulo: number; zonas: { f: number; tipo: TipoExo; modulo?: number; vanos?: number }[] }[] = [
  { nombre: 'Tubo en X con diagrid arriba', texto: 'Cruces abajo (donde el corte es mayor) y diamantes livianos en la mitad de arriba.', tipo: 'D', modulo: 4, zonas: [{ f: 0, tipo: 'D', modulo: 4 }, { f: 0.55, tipo: 'A', modulo: 6, vanos: 2 }] },
  { nombre: 'Diagrid que se abre con la altura', texto: 'Rombos chicos y densos abajo, más grandes arriba: la densidad sigue al momento volcador.', tipo: 'A', modulo: 4, zonas: [{ f: 0, tipo: 'A', modulo: 4, vanos: 3 }, { f: 0.4, tipo: 'A', modulo: 6, vanos: 2 }, { f: 0.75, tipo: 'A', modulo: 8, vanos: 1 }] },
  { nombre: 'Base en X y chevrones arriba', texto: 'Tubo en X en el tercio de abajo y, arriba, chevrones que cuelgan las esquinas del mástil.', tipo: 'D', modulo: 4, zonas: [{ f: 0, tipo: 'D', modulo: 3 }, { f: 0.33, tipo: 'E', modulo: 6 }] },
  { nombre: 'Mega-marcos con cinturones', texto: 'Pórticos de esquina abajo y dos reticulados cinturón en la mitad de arriba.', tipo: 'B', modulo: 4, zonas: [{ f: 0, tipo: 'B', modulo: 4 }, { f: 0.5, tipo: 'C', modulo: 3 }] },
];

const mismo = (p: [number, number], q: [number, number]) => Math.abs(p[0] - q[0]) < 1e-5 && Math.abs(p[1] - q[1]) < 1e-4;

interface Elegida { id: string; dir: 'A' | 'B' }

class Disenador {
  el: HTMLElement;
  private lienzo: HTMLElement; private lateral: HTMLElement; private barraH: HTMLElement; private kpis: HTMLElement; private ayuda: HTMLElement;
  private renderer: THREE.WebGLRenderer; private etiquetas: CSS2DRenderer;
  private escena = new THREE.Scene(); private camara = new THREE.PerspectiveCamera(40, 1, 0.5, 4000); private controles: OrbitControls;
  private grupo = new THREE.Group();
  private herramienta: Herramienta = 'elegir'; private color: ModoColor = 'clase';
  private sel: Elegida | null = null; private nudoA: { dir: 'A' | 'B'; t: number; s: number; z: number } | null = null;
  private pincel: Seccion | null = null; private tipoZona: TipoExo = 'A';
  /** grilla de la cara para dibujar: divisiones del ancho y medios pisos */
  private divisiones = 2; private medios = false;
  /** repetir hacia arriba: desde qué nivel (índice de zs), cuántos pisos tiene el módulo dibujado y cuántas veces */
  private rep = { desde: 0, pisos: 4, veces: 3 };
  /** nudos sueltos (con una sola barra) de la última cara armada */
  private sueltos = 0; private mecanismo = false;
  private encuadre = '';
  private pickables: THREE.Object3D[] = [];

  constructor() {
    this.el = h('div', { class: 'exo3d' });
    this.barraH = h('div', { class: 'exo3d-herr fila-acciones' });
    this.lienzo = h('div', { class: 'exo3d-lienzo' });
    this.lateral = h('div', { class: 'exo3d-lateral' });
    this.kpis = h('div', { class: 'exo3d-kpis' });
    this.ayuda = h('p', { class: 'exo3d-txt exo3d-ayuda' });
    this.el.append(this.barraH, this.kpis, h('div', { class: 'exo3d-cuerpo' }, this.lienzo, this.lateral), this.ayuda);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.etiquetas = new CSS2DRenderer();
    this.etiquetas.domElement.className = 'exo3d-etiquetas';
    this.lienzo.append(this.renderer.domElement, this.etiquetas.domElement);
    this.controles = new OrbitControls(this.camara, this.renderer.domElement);
    this.controles.enableDamping = false;
    this.controles.addEventListener('change', () => this.pintar());
    this.escena.add(new THREE.HemisphereLight(0xffffff, 0x8a949e, 1.6));
    const sol = new THREE.DirectionalLight(0xffffff, 1.4); sol.position.set(60, 120, 80); this.escena.add(sol);
    this.escena.add(this.grupo);
    new ResizeObserver(() => this.tamano()).observe(this.lienzo);
    // tocar (sin arrastrar): elegir, pintar, agregar o cortar zona
    let abajo: { x: number; y: number } | null = null;
    this.renderer.domElement.addEventListener('pointerdown', ev => { abajo = { x: ev.clientX, y: ev.clientY }; });
    this.renderer.domElement.addEventListener('pointerup', ev => {
      if (!abajo || Math.hypot(ev.clientX - abajo.x, ev.clientY - abajo.y) > 5) { abajo = null; return; }
      abajo = null; this.tocar(ev);
    });
    // Esc: primero corta la polilínea, después suelta la barra elegida y recién ahí vuelve a «Elegir»
    window.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape' || !this.el.isConnected || (ev.target as HTMLElement).closest?.('input, select, textarea')) return;
      if (this.nudoA) this.nudoA = null; else if (this.sel) this.sel = null; else this.herramienta = 'elegir';
      this.actualizar();
    });
  }

  private tamano() {
    const w = this.lienzo.clientWidth || 600, hh = this.lienzo.clientHeight || 480;
    this.renderer.setSize(w, hh); this.etiquetas.setSize(w, hh);
    this.camara.aspect = w / hh; this.camara.updateProjectionMatrix();
    this.pintar();
  }
  private pintar() { this.renderer.render(this.escena, this.camara); this.etiquetas.render(this.escena, this.camara); }

  private get def(): ExoDef { return estado.proyecto.exo!; }
  private cambiar(f: (d: ExoDef) => void) { estado.cambiar(p => { if (p.exo) f(p.exo); }); }

  /** rehace todo con el proyecto actual (se llama en cada cambio) */
  actualizar() {
    if (!estado.proyecto.exo) return;
    this.armarHerramientas();
    this.armarEscena();
    this.armarLateral();
    this.armarKpis();
    this.ayuda.textContent = this.textoAyuda();
    requestAnimationFrame(() => this.tamano());
  }

  private textoAyuda(): string {
    switch (this.herramienta) {
      case 'elegir': return 'Tocá una barra para ver sus esfuerzos y cambiarla (sección, uniones o sacarla). Arrastrá para girar, rueda para el zoom, botón derecho para correr. Esc suelta.';
      case 'pintar': return this.pincel ? `Pintar: tocá barras y pasan a ${fmt(this.pincel.b * 1000, 0)} × ${fmt(this.pincel.e * 1000, 1)} mm (en las cuatro caras).` : 'Pintar: elegí primero un tubo en la lista de al lado.';
      case 'borrar': return 'Borrar: tocá una barra. Las dibujadas a mano se borran; las de la ficha se sacan (se vuelven a poner con «Como estaba»).';
      case 'zona': return `Zona nueva: tocá una barra o un nudo a la altura donde querés que empiece «${TIPOS_EXO[this.tipoZona].nombre}» (se corta en el nivel más cercano).`;
      default: return this.nudoA ? `Seguí tocando puntos de la misma cara: cada toque agrega una ${this.herramienta} y sigue desde ahí. Tocá el mismo punto o Esc para cortar.` : `Dibujar ${this.herramienta}: tocá el primer punto de la grilla de una cara. Lo dibujado vale para las cuatro caras.`;
    }
  }

  private armarHerramientas() {
    const seg = (aria: string, ops: [string, string, string][], val: string, f: (v: string) => void) => {
      const s = h('div', { class: 'seg chico', role: 'group', 'aria-label': aria });
      ops.forEach(([v, t, ti]) => { const b = h('button', { type: 'button', 'aria-pressed': String(val === v), title: ti }, t); b.addEventListener('click', () => f(v)); s.append(b); });
      return s;
    };
    const herr = seg('Herramienta', [
      ['elegir', 'Elegir', 'Tocá una barra para ver y cambiar sus datos'],
      ['borrar', 'Borrar', 'Tocá una barra para borrarla'],
      ['pintar', 'Pintar sección', 'Elegí un tubo y tocá barras'],
      ['zona', 'Cortar zona', 'Tocá la torre a la altura donde empieza otra tipología'],
      ['columna', '+ columna', 'Dibujar columnas de corrido tocando puntos de una cara'], ['diagonal', '+ diagonal', 'Dibujar diagonales de corrido'], ['viga', '+ viga', 'Dibujar vigas de corrido'],
    ], this.herramienta, v => { this.herramienta = v as Herramienta; this.nudoA = null; this.actualizar(); });
    const col = seg('Colores', [
      ['clase', 'Por clase', 'Columnas, diagonales y vigas con su color'],
      ['esfuerzo', 'Tracción / compresión', `Viento ${estado.dir}: tracción en rojo, compresión en azul; las caras del otro viento en gris`],
      ['verifica', 'Qué no verifica', 'Las barras que no verifican (tensión o pandeo), resaltadas'],
    ], this.color, v => { this.color = v as ModoColor; this.actualizar(); });
    const extra: HTMLElement[] = [];
    if (this.herramienta === 'zona') {
      const s = h('select', { 'aria-label': 'Tipología de la zona nueva' }) as HTMLSelectElement;
      (Object.keys(TIPOS_EXO) as TipoExo[]).forEach(t => s.append(new Option(`${t} · ${TIPOS_EXO[t].nombre}`, t, false, t === this.tipoZona)));
      s.addEventListener('change', () => { this.tipoZona = s.value as TipoExo; this.ayuda.textContent = this.textoAyuda(); });
      extra.push(s);
    }
    if (this.herramienta === 'columna' || this.herramienta === 'diagonal' || this.herramienta === 'viga') {
      const dv = h('select', { 'aria-label': 'Divisiones del ancho de la cara', title: 'puntos de la grilla a lo ancho de la cara' }) as HTMLSelectElement;
      [1, 2, 3, 4, 6, 8].forEach(n => dv.append(new Option(`${n === 1 ? 'solo bordes' : `ancho en ${n}`}`, String(n), false, n === this.divisiones)));
      dv.addEventListener('change', () => { this.divisiones = +dv.value; this.actualizar(); });
      const md = h('input', { type: 'checkbox' }) as HTMLInputElement; md.checked = this.medios;
      md.addEventListener('change', () => { this.medios = md.checked; this.actualizar(); });
      extra.push(h('label', { class: 'campo-linea' }, 'Grilla ', dv), h('label', { class: 'campo-linea', title: 'puntos también a media altura de cada piso (nudos entre losas)' }, md, ' medios pisos'));
    }
    const enc = h('button', { type: 'button', title: 'Volver a encuadrar la torre' }, 'Encuadrar');
    enc.addEventListener('click', () => { this.encuadre = ''; this.actualizar(); });
    this.barraH.replaceChildren(herr, ...extra, col, enc);
  }

  /** caras, losas, nudos y zonas */
  private armarEscena() {
    this.grupo.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mt)) mt.forEach(x => x.dispose()); else mt?.dispose?.(); });
    this.grupo.children.slice().forEach(o => { this.grupo.remove(o); if (o instanceof CSS2DObject) o.element.remove(); });
    this.pickables = [];
    const p = estado.proyecto;
    const iPB = p.niveles.reduce((k, x, i) => (x.cota >= 0 ? i : k), -1);
    const zPB = p.niveles[iPB]?.cota ?? 0;
    // losas (contornos) de PB para arriba
    const matL = new THREE.LineBasicMaterial({ color: new THREE.Color(css('--dim', '#8a949e')), transparent: true, opacity: 0.7 });
    const matF = new THREE.MeshBasicMaterial({ color: new THREE.Color(css('--rule', '#dfe3e7')), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    let top = zPB, ext = 10;
    p.niveles.forEach((n, i) => {
      if (n.cota < zPB - 1e-6) return;
      top = Math.max(top, n.cota);
      const pol = puntosSilueta(plantaDeNivel(p, i).silueta, 12);
      ext = Math.max(ext, ...pol.map(q => Math.hypot(q.x, q.y)));
      const pts = pol.map(q => new THREE.Vector3(q.x, n.cota, -q.y));
      this.grupo.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), matL));
      const forma = new THREE.Shape(pol.map(q => new THREE.Vector2(q.x, q.y)));
      const losa = new THREE.Mesh(new THREE.ShapeGeometry(forma), matF);
      losa.rotation.x = -Math.PI / 2; losa.position.y = n.cota;
      this.grupo.add(losa);
    });
    // barras de las cuatro caras: con sus esfuerzos si la cara se calcula; si todavía es un mecanismo (se está armando
    // barra por barra), la geometría sola, en gris, con los nudos sueltos marcados
    const cCol = new THREE.Color(css('--ink', '#1f2328')), cDia = new THREE.Color(css('--num', '#a55500')), cVig = new THREE.Color(css('--dim', '#8a949e'));
    const acero = new THREE.Color(css('--ink2', '#6b7480')), cT = new THREE.Color(css('--traccion', '#e24b4a')), cC = new THREE.Color(css('--compresion', '#378add'));
    const cSel = new THREE.Color(css('--elegido', '#e8a317')), cMal = new THREE.Color(css('--revisar', '#b26a00'));
    const radio = { columna: 0.32, diagonal: 0.22, viga: 0.25 } as const;
    const eje = new THREE.Vector3(0, 1, 0);
    const dibujando = this.herramienta === 'diagonal' || this.herramienta === 'viga' || this.herramienta === 'columna';
    const conPuntos = dibujando || this.herramienta === 'zona';
    this.sueltos = 0; this.mecanismo = false;
    (['A', 'B'] as const).forEach(dir => {
      const d = datosExo(dir), g = d ? null : geometriaExo(dir);
      if (!d && !g) return;
      if (!d) this.mecanismo = true;
      const zs = d ? d.r.zs : g!.zs, ancho = d ? d.ancho : g!.ancho, anchos = d ? d.anchos : g!.anchos, ts = d ? d.ts : g!.ts, t0 = d ? d.tCaras[1] : g!.t;
      const barras: BarraVista[] = d ? d.r.caras[0].esfuerzos.map(e => ({ id: e.id, clase: e.clase, a: e.a, b: e.b, sec: e.sec, fraccion: e.fraccion, N: e.N }))
        : g!.cara.barras.map(x => ({ id: x.id, clase: x.clase, a: g!.cara.nudos[x.a], b: g!.cara.nudos[x.b], sec: x.sec, fraccion: x.fraccion, N: 0 }));
      // nudos sueltos: con una sola barra y fuera de la base (no hay con qué sostenerlos)
      const cuenta = new Map<string, { s: number; z: number; n: number }>();
      const clave = (q: { s: number; z: number }) => `${q.s.toFixed(4)}|${q.z.toFixed(4)}`;
      barras.forEach(x => [x.a, x.b].forEach(q => { const c = cuenta.get(clave(q)) ?? { s: q.s, z: q.z, n: 0 }; c.n++; cuenta.set(clave(q), c); }));
      // (la punta de una columna rígida no es un problema: solo se marcan si la cara es un mecanismo, o si el nudo queda
      //  entre losas, donde nada lo sostiene)
      const enLosa = (z: number) => zs.some(zz => Math.abs(zz - z) < 1e-6);
      const sueltos = [...cuenta.values()].filter(q => q.n === 1 && q.z > zs[0] + 1e-6 && (!d || !enLosa(q.z)));
      if (dir === estado.dir || this.sueltos === 0) this.sueltos = Math.max(this.sueltos, sueltos.length);
      const activa = dir === estado.dir;
      const Nmax = Math.max(...barras.map(e => Math.abs(e.N)), 1e-9);
      const malas = new Set(d ? d.r.controles.filter(x => x.estado !== 'verifica').map(x => x.id) : []);
      const medio = (z: number) => { const W = (k: number) => (anchos?.[k] ?? ancho) / 2, k = zs.findIndex(zz => zz >= z - 1e-9); return k <= 0 ? W(Math.max(0, k)) : W(k - 1) + (W(k) - W(k - 1)) * ((z - zs[k - 1]) / (zs[k] - zs[k - 1] || 1)); };
      const aPlanta = (sv: number, t: number) => (dir === 'A' ? { x: t, y: sv } : { x: sv, y: t });
      const tEn = (signo: number, z: number) => {
        if (!ts) return signo * t0;
        const k = zs.findIndex(zz => zz >= z - 1e-9);
        const v = k <= 0 ? ts[Math.max(0, k)] : ts[k - 1] + (ts[k] - ts[k - 1]) * ((z - zs[k - 1]) / (zs[k] - zs[k - 1] || 1));
        return signo * v;
      };
      const a3 = (sv: number, z: number, signo: number) => { const q = aPlanta(sv, tEn(signo, z)); return new THREE.Vector3(q.x, z, -q.y); };
      for (const signo of [-1, 1]) {
        barras.forEach(e => {
          if ((e.fraccion ?? 1) !== 1) return;              // alas: son barras de las otras caras
          const A = a3(e.a.s, e.a.z, signo), B = a3(e.b.s, e.b.z, signo), L = A.distanceTo(B);
          if (L < 1e-6) return;
          const elegida = this.sel?.id === e.id;
          let col: THREE.Color;
          if (elegida) col = cSel;
          else if (!d) col = e.clase === 'columna' ? cCol : e.clase === 'diagonal' ? cDia : cVig;
          else if (this.color === 'esfuerzo') col = activa ? acero.clone().lerp(e.N >= 0 ? cT : cC, 0.35 + 0.65 * Math.min(1, Math.abs(e.N) / Nmax)) : acero;
          else if (this.color === 'verifica') col = malas.has(e.id) ? cMal : acero.clone().lerp(new THREE.Color(0xffffff), 0.45);
          else col = e.clase === 'columna' ? cCol : e.clase === 'diagonal' ? cDia : cVig;
          const r = radio[e.clase] * (elegida ? 1.6 : 1) * Math.max(0.6, Math.min(2.2, e.sec.b / 0.4));
          const transl = this.color === 'esfuerzo' && !activa && !!d;
          const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), new THREE.MeshStandardMaterial({ color: col, roughness: 0.45, metalness: 0.25, transparent: transl, opacity: transl ? 0.5 : 1 }));
          m.position.copy(A.clone().add(B).multiplyScalar(0.5));
          m.quaternion.setFromUnitVectors(eje, B.clone().sub(A).normalize());
          m.userData = { barra: e.id, dir };
          this.grupo.add(m); this.pickables.push(m);
        });
        // nudos sueltos: más grandes, en el color de «revisar»
        sueltos.forEach(q => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), new THREE.MeshBasicMaterial({ color: cMal })); m.position.copy(a3(q.s, q.z, signo)); this.grupo.add(m); });
        // grilla para dibujar: los nudos de la cara más los puntos de cada piso (y de cada medio piso) en las divisiones del ancho
        if (conPuntos) {
          const pts: { s: number; z: number }[] = [];
          barras.forEach(e => { if ((e.fraccion ?? 1) === 1) pts.push(e.a, e.b); });
          const cotas = this.medios ? zs.flatMap((z, k) => (k + 1 < zs.length ? [z, (z + zs[k + 1]) / 2] : [z])) : zs;
          cotas.forEach(z => { const w = medio(z); for (let i = 0; i <= this.divisiones; i++) pts.push({ s: -w + (2 * w * i) / this.divisiones, z }); if (this.divisiones % 2) pts.push({ s: 0, z }); });
          const vistos = new Set<string>(), lista: { s: number; z: number }[] = [];
          pts.forEach(q => { const k = clave(q); if (!vistos.has(k)) { vistos.add(k); lista.push(q); } });
          const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: cSel }), lista.length);
          const mt = new THREE.Matrix4();
          lista.forEach((q, i) => { const v = a3(q.s, q.z, signo); mt.makeTranslation(v.x, v.y, v.z); inst.setMatrixAt(i, mt); });
          inst.userData = { puntos: lista.map(q => ({ dir, t: signo, s: q.s, z: q.z })) };
          this.grupo.add(inst); this.pickables.push(inst);
          // el punto de arranque de la polilínea, grande
          if (this.nudoA && this.nudoA.dir === dir && this.nudoA.t === signo) {
            const m = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 10), new THREE.MeshBasicMaterial({ color: cSel }));
            m.position.copy(a3(this.nudoA.s, this.nudoA.z, signo)); this.grupo.add(m);
          }
        }
      }
    });
    // zonas: un plano finito en cada corte y el nombre al costado
    const zs0 = this.cotas();
    if (zs0.length) {
      const d0 = { r: { zs: zs0 } };
      const zonas = zonasDe(this.def, d0.r.zs);
      const cZ = new THREE.Color(css('--corte', '#7b4fd1'));
      zonas.forEach((zn, i) => {
        const z0 = d0.r.zs[zn.kI], z1 = d0.r.zs[zn.kF];
        if (i > 0) {
          const pl = new THREE.Mesh(new THREE.PlaneGeometry(2 * ext + 8, 2 * ext + 8), new THREE.MeshBasicMaterial({ color: cZ, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
          pl.rotation.x = -Math.PI / 2; pl.position.y = z0; this.grupo.add(pl);
        }
        const e = document.createElement('div'); e.className = 'et3d exo3d-zona';
        e.textContent = `${zonas.length > 1 ? `Zona ${i + 1} · ` : ''}${zn.tipo} · ${TIPOS_EXO[zn.tipo].nombre} · módulo ${zn.modulo}${zn.tipo === 'A' && (zn.vanos ?? 1) > 1 ? ` · ${zn.vanos} vanos` : ''}`;
        const o = new CSS2DObject(e); o.position.set(0, z0 + Math.min(3, (z1 - z0) / 2), 0); this.grupo.add(o);   // sobre el eje, al pie de la zona: no se corta en el borde
      });
    }
    // encuadre: solo si cambió el tamaño de la torre
    const clave = `${ext.toFixed(0)}|${top.toFixed(0)}`;
    if (clave !== this.encuadre) {
      this.encuadre = clave;
      const hT = top - zPB, c = new THREE.Vector3(0, zPB + hT / 2, 0), dist = Math.max(hT, 2 * ext) * 1.35;
      this.camara.position.set(c.x + dist * 0.75, c.y + dist * 0.25, c.z + dist * 0.85);
      this.controles.target.copy(c); this.controles.update();
    }
  }

  /** cotas de los pisos de la cara (sobre PB), calculada o no */
  private cotas(): number[] { return (datosExo(estado.dir)?.r.zs ?? geometriaExo(estado.dir)?.zs ?? geometriaExo('A')?.zs ?? []); }
  /** medio ancho de la cara del viento dir en la cota z */
  private medioAncho(dir: 'A' | 'B', z: number): number {
    const g = geometriaExo(dir);
    if (!g) return 1;
    const W = (k: number) => (g.anchos?.[k] ?? g.ancho) / 2, k = g.zs.findIndex(zz => zz >= z - 1e-9);
    return k <= 0 ? W(Math.max(0, k)) : W(k - 1) + (W(k) - W(k - 1)) * ((z - g.zs[k - 1]) / (g.zs[k] - g.zs[k - 1] || 1));
  }

  private tocar(ev: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), this.camara);
    const hit = ray.intersectObjects(this.pickables, false);
    // con las herramientas de dibujo, los puntos de la grilla ganan aunque haya una barra delante
    const hp = hit.find(x => x.object.userData.puntos && x.instanceId !== undefined);
    const nudo = hp ? (hp.object.userData.puntos as { dir: 'A' | 'B'; t: number; s: number; z: number }[])[hp.instanceId!] : undefined;
    const barra = hit.find(x => x.object.userData.barra)?.object.userData as { barra: string; dir: 'A' | 'B' } | undefined;
    const h0 = this.herramienta;
    if (h0 === 'elegir') { this.sel = barra ? { id: barra.barra, dir: barra.dir } : null; this.actualizar(); return; }
    if (h0 === 'borrar') { if (barra) this.borrarBarra(barra.barra); return; }
    if (h0 === 'pintar') {
      if (!barra || !this.pincel) return;
      const sec = this.pincel;
      this.cambiar(d => { d.barras = { ...(d.barras ?? {}) }; d.barras[barra.barra] = { ...(d.barras[barra.barra] ?? {}), sec: { ...sec } }; });
      return;
    }
    if (h0 === 'zona') {
      const z = nudo?.z ?? hit[0]?.point.y;
      if (z === undefined) return;
      this.agregarZona(z);
      return;
    }
    // dibujar de corrido: cada punto nuevo agrega una barra desde el anterior y sigue desde ahí
    if (!nudo) return;
    if (!this.nudoA || this.nudoA.dir !== nudo.dir || this.nudoA.t !== nudo.t) { this.nudoA = nudo; this.actualizar(); return; }
    const a = this.nudoA;
    if (Math.abs(a.s - nudo.s) < 1e-6 && Math.abs(a.z - nudo.z) < 1e-6) { this.nudoA = null; this.actualizar(); return; }
    const clase = h0;
    // la posición en la cara va como fracción del medio ancho: así cae en el mismo lugar en las cuatro caras
    const fr = (q: { s: number; z: number }): [number, number] => [+(q.s / this.medioAncho(a.dir, q.z)).toFixed(6), +q.z.toFixed(4)];
    const nb: BarraNueva = { clase, a: fr(a), b: fr(nudo), enFraccion: true };
    this.nudoA = nudo;
    const igual = (x: BarraNueva) => x.clase === nb.clase && ((mismo(x.a, nb.a) && mismo(x.b, nb.b)) || (mismo(x.a, nb.b) && mismo(x.b, nb.a)));
    if ((this.def.nuevas ?? []).some(igual)) { this.actualizar(); return; }
    this.cambiar(d => { d.nuevas = [...(d.nuevas ?? []), nb]; });
  }

  /** borra una barra: si es de las dibujadas (N…), sale de la lista (y los cambios de las siguientes se corren); si es de la ficha, se saca */
  private borrarBarra(id: string) {
    if (this.sel?.id === id) this.sel = null;
    if (/^N\d+$/.test(id)) {
      const i = +id.slice(1) - 1;
      this.cambiar(d => {
        d.nuevas = (d.nuevas ?? []).filter((_, j) => j !== i);
        if (!d.nuevas.length) delete d.nuevas;
        if (d.barras) {
          const nb: NonNullable<ExoDef['barras']> = {};
          Object.entries(d.barras).forEach(([k, v]) => { const m = /^N(\d+)$/.exec(k); if (!m) nb[k] = v; else if (+m[1] - 1 !== i) nb[+m[1] - 1 > i ? `N${+m[1] - 1}` : k] = v; });
          d.barras = nb; if (!Object.keys(nb).length) delete d.barras;
        }
      });
    } else this.cambiar(d => { d.barras = { ...(d.barras ?? {}), [id]: { ...(d.barras?.[id] ?? {}), quitar: true } }; });
  }

  /** zona nueva desde la cota z (el nivel más cercano); si no había zonas, la de abajo es la ficha */
  private agregarZona(z: number) {
    const zs = this.cotas();
    if (!zs.length) return;
    let k = 0; zs.forEach((zz, i) => { if (Math.abs(zz - z) < Math.abs(zs[k] - z)) k = i; });
    if (k === 0 || k === zs.length - 1) { estado.avisarPanel(); return; }
    const cota = zs[k], tipo = this.tipoZona, def = this.def;
    this.cambiar(d => {
      const zonas: ZonaExo[] = d.zonas?.length ? d.zonas.filter(x => Math.abs(x.desde - cota) > 1e-6) : [{ desde: zs[0], tipo: def.tipo, modulo: def.modulo, ...(def.vanos ? { vanos: def.vanos } : {}) }];
      zonas.push({ desde: cota, tipo, modulo: def.modulo });
      d.zonas = zonas.sort((a, b) => a.desde - b.desde);
      delete d.barras;                                   // los números de las barras cambian
    });
    this.herramienta = 'elegir';
  }

  private armarLateral() {
    const p = estado.proyecto, def = this.def;
    const partes: HTMLElement[] = [];
    // barra elegida
    if (this.sel) {
      const d = datosExo(this.sel.dir), e = d?.r.caras[0].esfuerzos.find(x => x.id === this.sel!.id);
      if ((!d || !e) && this.mecanismo) {
        // todavía no se calcula: se puede borrar igual
        const id = this.sel.id, borrar = h('button', { type: 'button', class: 'peligro' }, 'Borrar');
        borrar.addEventListener('click', () => this.borrarBarra(id));
        partes.push(h('section', { class: 'exo3d-caja' }, h('b', {}, `Barra ${id}`), h('p', { class: 'exo3d-txt' }, 'Sin esfuerzos: la estructura todavía se mueve.'), borrar));
      } else if (!d || !e) this.sel = null;
      else {
        const ctl = d.r.controles.find(x => x.id === e.id);
        const cam = def.barras?.[e.id] ?? {};
        const poner = (f: (c: NonNullable<ExoDef['barras']>[string]) => void) => this.cambiar(x => {
          x.barras = { ...(x.barras ?? {}) }; const c = { ...(x.barras[e.id] ?? {}) }; f(c);
          if (Object.keys(c).length) x.barras[e.id] = c; else delete x.barras[e.id];
          if (!Object.keys(x.barras).length) delete x.barras;
        });
        const cat = def.material === 'hormigon' ? CATALOGO_HORMIGON : CATALOGO_TUBOS;
        const s = h('select', { 'aria-label': 'Sección de la barra' }) as HTMLSelectElement;
        s.append(new Option(`como su clase`, ''));
        cat.forEach((t, i) => s.append(new Option(`${fmt(t.b * 1000, 0)} × ${fmt(t.e * 1000, 1)} mm`, String(i), false, !!cam.sec && cam.sec.b === t.b && cam.sec.e === t.e)));
        s.addEventListener('change', () => poner(c => { if (s.value === '') delete c.sec; else c.sec = cat[+s.value]; }));
        const union = (etq: string, art: boolean, f: (v: boolean) => void) => { const q = h('select', {}) as HTMLSelectElement; q.append(new Option('rígida', 'r', false, !art), new Option('articulada', 'a', false, art)); q.addEventListener('change', () => f(q.value === 'a')); return h('label', { class: 'campo-linea' }, etq, ' ', q); };
        const sacar = h('button', { type: 'button', class: 'peligro' }, 'Sacar la barra');
        sacar.addEventListener('click', () => { this.sel = null; poner(c => { c.quitar = true; }); });
        const nueva = e.id.startsWith('N');
        const borrarNueva = h('button', { type: 'button', class: 'peligro' }, 'Borrar la barra agregada');
        borrarNueva.addEventListener('click', () => { const i = +e.id.slice(1) - 1; this.sel = null; this.cambiar(x => { x.nuevas = (x.nuevas ?? []).filter((_, j) => j !== i); if (!x.nuevas.length) delete x.nuevas; }); });
        const volver = h('button', { type: 'button' }, 'Como estaba');
        volver.addEventListener('click', () => poner(c => { delete c.relA; delete c.relB; delete c.sec; delete c.quitar; }));
        const N = e.N;
        partes.push(h('section', { class: 'exo3d-caja' },
          h('b', {}, `Barra ${e.id} · ${e.clase}`),
          h('div', { class: N >= 0 ? 'exo3d-n traccion' : 'exo3d-n compresion' }, `N = ${fmt(Math.abs(N), 1)} t ${N >= 0 ? 'tracción' : 'compresión'} (viento ${this.sel.dir})`),
          h('div', { class: 'exo3d-txt' }, `L = ${fmt(e.L, 2)} m · tubo ${fmt(e.sec.b * 1000, 0)} × ${fmt(e.sec.e * 1000, 1)} mm${ctl ? ` · σ = ${fmt(ctl.sigma, 0)} t/m² · ${ctl.estado}` : ''}`),
          h('label', { class: 'campo-linea' }, 'Sección ', s),
          union('Unión en a', e.relA, v => poner(c => { c.relA = v; })), union('Unión en b', e.relB, v => poner(c => { c.relB = v; })),
          h('div', { class: 'fila-acciones' }, nueva ? borrarNueva : sacar, ...(Object.keys(cam).length ? [volver] : [])),
          h('p', { class: 'exo3d-txt' }, 'Vale para esta barra en las cuatro caras (el cálculo usa una cara tipo por viento).')));
      }
    }
    // pincel
    if (this.herramienta === 'pintar') {
      const cat = def.material === 'hormigon' ? CATALOGO_HORMIGON : CATALOGO_TUBOS;
      const lista = h('div', { class: 'exo3d-pincel' });
      cat.forEach(t => {
        const b = h('button', { type: 'button', 'aria-pressed': String(!!this.pincel && this.pincel.b === t.b && this.pincel.e === t.e) }, `${fmt(t.b * 1000, 0)}×${fmt(t.e * 1000, 1)}`);
        b.addEventListener('click', () => { this.pincel = t; this.actualizar(); });
        lista.append(b);
      });
      partes.push(h('section', { class: 'exo3d-caja' }, h('b', {}, 'Tubo para pintar'), lista));
    }
    // dibujo a mano: arranques rápidos, espejar y repetir hacia arriba
    partes.push(this.cajaDibujo());
    // zonas
    const zsN = this.cotas();
    const nombreZ = (z: number) => p.niveles.find(n => Math.abs(n.cota - z) < 1e-6)?.nombre ?? `${fmt(z, 1)} m`;
    const cajaZ = h('section', { class: 'exo3d-caja' }, h('b', {}, 'Zonas en altura'));
    if (!def.zonas?.length) {
      cajaZ.append(h('p', { class: 'exo3d-txt' }, `Toda la torre: ${def.tipo} · ${TIPOS_EXO[def.tipo].nombre}, módulo ${def.modulo}. Con «Cortar zona» (o una plantilla) cambiás de tipología en altura.`));
    } else {
      zonasDe(def, zsN).forEach((zn, i) => {
        const fila = h('div', { class: 'exo3d-zona-fila' });
        const tipo = h('select', { 'aria-label': `Tipología de la zona ${i + 1}` }) as HTMLSelectElement;
        (Object.keys(TIPOS_EXO) as TipoExo[]).forEach(t => tipo.append(new Option(`${t} · ${TIPOS_EXO[t].nombre}`, t, false, t === zn.tipo)));
        const mod = h('input', { type: 'number', min: '1', step: '1', value: String(zn.modulo), class: 'campo-vertice', 'aria-label': 'Pisos por módulo', title: 'pisos por módulo' }) as HTMLInputElement;
        const van = h('input', { type: 'number', min: '1', step: '1', value: String(zn.vanos ?? 1), class: 'campo-vertice', 'aria-label': 'Vanos del diagrid', title: 'rombos por cara (diagrid)' }) as HTMLInputElement;
        const editar = (f: (z: ZonaExo) => void) => this.cambiar(d => {
          const lista = zonasDe(d, zsN).map(x => ({ desde: x.desde, tipo: x.tipo, modulo: x.modulo, ...(x.vanos ? { vanos: x.vanos } : {}) } as ZonaExo));
          f(lista[i]); d.zonas = lista; delete d.barras;
        });
        tipo.addEventListener('change', () => editar(z => { z.tipo = tipo.value as TipoExo; }));
        mod.addEventListener('change', () => { const v = Math.round(+mod.value); if (v >= 1) editar(z => { z.modulo = v; }); });
        van.addEventListener('change', () => { const v = Math.round(+van.value); if (v >= 1) editar(z => { z.vanos = v; }); });
        const quitar = h('button', { type: 'button', title: 'Juntar esta zona con la de abajo' }, '✕');
        quitar.addEventListener('click', () => this.cambiar(d => {
          const lista = zonasDe(d, zsN).map(x => ({ desde: x.desde, tipo: x.tipo, modulo: x.modulo, ...(x.vanos ? { vanos: x.vanos } : {}) } as ZonaExo));
          lista.splice(i, 1);
          if (lista.length <= 1) { if (lista[0]) { d.tipo = lista[0].tipo; d.modulo = lista[0].modulo ?? d.modulo; } delete d.zonas; } else { lista[0].desde = zsN[0]; d.zonas = lista; }
          delete d.barras;
        }));
        fila.append(h('span', { class: 'exo3d-desde' }, `${i === 0 ? 'desde PB' : `desde ${nombreZ(zn.desde)}`}`), tipo, h('label', {}, 'mód. ', mod), ...(zn.tipo === 'A' ? [h('label', {}, 'vanos ', van)] : []), ...(i > 0 || zonasDe(def, zsN).length > 1 ? [quitar] : []));
        cajaZ.append(fila);
      });
      cajaZ.append(h('p', { class: 'exo3d-txt' }, 'Entre zonas va una viga de transición que ata los dos dibujos. Cambiar una zona borra los cambios barra por barra (cambian los números de las barras).'));
    }
    partes.push(cajaZ);
    // plantillas
    const cajaP = h('section', { class: 'exo3d-caja' }, h('b', {}, 'Plantillas'));
    PLANTILLAS.forEach(pl => {
      const b = h('button', { type: 'button', title: pl.texto }, pl.nombre);
      b.addEventListener('click', () => {
        if (!zsN.length) return;
        const z0 = zsN[0], hT = zsN[zsN.length - 1] - z0;
        this.sel = null;
        this.cambiar(d => {
          d.tipo = pl.tipo; d.modulo = pl.modulo;
          d.zonas = pl.zonas.map(z => { const c = z0 + z.f * hT; let k = 0; zsN.forEach((zz, j) => { if (Math.abs(zz - c) < Math.abs(zsN[k] - c)) k = j; }); return { desde: zsN[k], tipo: z.tipo, ...(z.modulo ? { modulo: z.modulo } : {}), ...(z.vanos ? { vanos: z.vanos } : {}) }; });
          delete d.barras; delete d.nuevas; delete d.cortes;
        });
      });
      cajaP.append(b, h('p', { class: 'exo3d-txt' }, pl.texto));
    });
    partes.push(cajaP);
    const nN = def.nuevas?.length ?? 0, nB = Object.keys(def.barras ?? {}).length;
    if (nN || nB) {
      const limpiar = h('button', { type: 'button' }, `Deshacer los cambios a mano (${nB} barras cambiadas, ${nN} agregadas)`);
      limpiar.addEventListener('click', () => { this.sel = null; this.cambiar(d => { delete d.barras; delete d.nuevas; }); });
      partes.push(limpiar);
    }
    this.lateral.replaceChildren(...partes);
  }

  private cajaDibujo(): HTMLElement {
    const def = this.def, zs = this.cotas(), n = zs.length - 1;
    const p = estado.proyecto;
    const nombreZ = (z: number) => p.niveles.find(x => Math.abs(x.cota - z) < 1e-6)?.nombre ?? `${fmt(z, 1)} m`;
    const caja = h('section', { class: 'exo3d-caja' }, h('b', {}, 'Armar barra por barra'));
    const nN = def.nuevas?.length ?? 0;
    caja.append(h('p', { class: 'exo3d-txt' }, nN ? `${nN} ${nN === 1 ? 'barra dibujada' : 'barras dibujadas'} a mano.` : 'Elegí «+ columna», «+ diagonal» o «+ viga» y tocá puntos de una cara: se dibuja de corrido. Con la ficha «L · Libre» la cara arranca vacía.'));
    const agregar = (bs: BarraNueva[]) => this.cambiar(d => {
      const lista = [...(d.nuevas ?? [])];
      bs.forEach(nb => { if (!lista.some(x => x.clase === nb.clase && ((mismo(x.a, nb.a) && mismo(x.b, nb.b)) || (mismo(x.a, nb.b) && mismo(x.b, nb.a))))) lista.push(nb); });
      d.nuevas = lista;
    });
    const boton = (t: string, ti: string, f: () => void) => { const b = h('button', { type: 'button', title: ti }, t); b.addEventListener('click', f); return b; };
    if (def.tipo !== 'L' || def.zonas?.length) caja.append(boton('Empezar de cero (ficha libre)', 'Saca la ficha y las zonas: la cara queda vacía para dibujarla entera', () => { this.sel = null; this.cambiar(d => { d.tipo = 'L'; delete d.zonas; delete d.barras; delete d.nuevas; delete d.cortes; }); }));
    const r4 = (z: number) => +z.toFixed(4);
    caja.append(
      boton('Columnas de esquina', 'Columnas en los dos bordes de cada cara, piso por piso, de PB a la azotea', () => agregar(zs.slice(0, -1).flatMap((z, k) => [-1, 1].map(s0 => ({ clase: 'columna' as const, a: [s0, r4(z)] as [number, number], b: [s0, r4(zs[k + 1])] as [number, number], enFraccion: true }))))),
      boton('Vigas en todos los pisos', 'Una viga de borde a borde en cada losa (atan las columnas)', () => agregar(zs.slice(1).map(z => ({ clase: 'viga' as const, a: [-1, r4(z)] as [number, number], b: [1, r4(z)] as [number, number], enFraccion: true })))),
    );
    if (nN) {
      caja.append(boton('Espejar lo dibujado', 'Copia cada barra dibujada del otro lado del eje de la cara (las que ya están no se repiten)', () => agregar((def.nuevas ?? []).map(x => ({ ...x, a: [-x.a[0], x.a[1]] as [number, number], b: [-x.b[0], x.b[1]] as [number, number] })))));
      // repetir hacia arriba un módulo dibujado
      const k0 = Math.min(Math.max(0, this.rep.desde), Math.max(0, n - 1));
      const sDesde = h('select', { 'aria-label': 'Desde qué nivel' }) as HTMLSelectElement;
      zs.slice(0, -1).forEach((z, k) => sDesde.append(new Option(k === 0 ? 'PB' : nombreZ(z), String(k), false, k === k0)));
      sDesde.addEventListener('change', () => { this.rep.desde = +sDesde.value; });
      const num = (v: number, f: (x: number) => void, et: string) => { const i = h('input', { type: 'number', min: '1', step: '1', value: String(v), class: 'campo-vertice', 'aria-label': et }) as HTMLInputElement; i.addEventListener('change', () => { const x = Math.round(+i.value); if (x >= 1) f(x); }); return i; };
      const repetir = boton('Repetir hacia arriba', 'Copia las barras dibujadas que caen enteras en el módulo elegido, corridas de a un módulo, las veces pedidas (sin pasar la azotea)', () => {
        const { desde, pisos, veces } = { ...this.rep, desde: k0 };
        // posición en pisos de una cota (entero = sobre una losa; con decimales = entre losas)
        const idx = (z: number) => { const k = zs.findIndex(zz => zz >= z - 1e-6); if (k <= 0) return 0; return k - 1 + (z - zs[k - 1]) / (zs[k] - zs[k - 1] || 1); };
        const cota = (x: number) => { const k = Math.floor(x + 1e-9), f = x - k; return k >= n ? zs[n] : zs[k] + f * (zs[k + 1] - zs[k]); };
        const dentro = (x: BarraNueva) => [x.a[1], x.b[1]].every(z => { const i = idx(z); return i >= desde - 1e-6 && i <= desde + pisos + 1e-6; });
        const base = (def.nuevas ?? []).filter(dentro), out: BarraNueva[] = [];
        for (let j = 1; j <= veces; j++) base.forEach(x => {
          const ia = idx(x.a[1]) + j * pisos, ib = idx(x.b[1]) + j * pisos;
          if (Math.max(ia, ib) > n + 1e-6) return;
          out.push({ ...x, a: [x.a[0], r4(cota(ia))], b: [x.b[0], r4(cota(ib))] });
        });
        if (!out.length) { this.ayuda.textContent = 'No hay barras dibujadas enteras dentro de ese módulo (o la copia pasaría la azotea).'; return; }
        agregar(out);
      });
      caja.append(h('div', { class: 'exo3d-zona-fila' }, h('span', { class: 'exo3d-desde' }, 'Repetir un módulo dibujado'), h('label', {}, 'desde ', sDesde),
        h('label', {}, 'alto ', num(this.rep.pisos, x => { this.rep.pisos = x; }, 'Pisos del módulo'), ' pisos'), h('label', {}, num(this.rep.veces, x => { this.rep.veces = x; }, 'Cuántas veces'), ' veces'), repetir));
      caja.append(boton('Borrar todo lo dibujado', 'Saca todas las barras dibujadas a mano (se puede deshacer)', () => { this.sel = null; this.cambiar(d => { delete d.nuevas; if (d.barras) { Object.keys(d.barras).forEach(k => { if (/^N\d+$/.test(k)) delete d.barras![k]; }); if (!Object.keys(d.barras).length) delete d.barras; } }); }));
    }
    return caja;
  }

  private armarKpis() {
    const dA = datosExo('A'), dB = datosExo('B');
    const kpi = (t: string, v: string, ok?: boolean) => h('div', { class: `exo3d-kpi${ok === undefined ? '' : ok ? ' ok' : ' mal'}` }, h('span', {}, t), h('b', {}, v));
    const out: HTMLElement[] = [];
    for (const d of [dA, dB]) {
      if (!d) continue;
      const f = flechaExo(d), n = d.r.u.length;
      const pct = d.r.fraccionExo;
      const malas = d.r.controles.filter(x => x.estado !== 'verifica').length;
      out.push(kpi(`Viento ${d.dir} · flecha`, `${fmt(f.u * 1000, 0)} / ${fmt(f.lim * 1000, 0)} mm`, f.u <= f.lim), kpi(`Viento ${d.dir} · momento al exo`, `${fmt(100 * pct, 0)} %`), kpi(`Viento ${d.dir} · barras`, malas ? `${malas} no verifican` : 'verifican', !malas));
      void n;
    }
    if (dA && dB) out.push(kpi('Acero (cuatro caras)', `${fmt(pesoExo(this.def, [dA.entrada, dB.entrada]), 0)} t`));
    if (this.mecanismo || this.sueltos) out.push(h('p', { class: 'exo3d-aviso' }, this.sueltos
      ? `La estructura todavía se mueve: ${this.sueltos === 1 ? 'hay un nudo suelto' : `hay ${this.sueltos} nudos sueltos`} (en ámbar), con una sola barra. Uní cada uno con otra barra o borrala.`
      : 'La estructura todavía se mueve (es un mecanismo): falta triangular algún paño con una diagonal, o hacer rígidas las uniones de columnas y vigas. Mientras tanto, todo el viento lo toman los tabiques.'));
    else if (!dA && !dB) out.push(h('p', { class: 'error' }, 'No se pudo calcular el exoesqueleto (Ctrl+Z vuelve atrás).'));
    this.kpis.replaceChildren(...out);
  }
}

let unico: Disenador | null = null;
/** el diseñador (uno solo para toda la sesión: la cámara queda donde la dejaste) */
export function disenadorExo3D(): HTMLElement {
  if (!unico) unico = new Disenador();
  unico.actualizar();
  return unico.el;
}
