/**
 * Diseñador 3D del exoesqueleto (etapa 08): las cuatro caras alrededor de las losas, para armar la estructura tocando
 * la torre en vez de llenar campos.
 *
 *  - Zonas en altura: otra tipología desde un nivel (diagrid arriba de un tubo en X, chevrones arriba de mega-marcos…),
 *    cada una con su módulo; entre zonas va una viga de transición. Plantillas listas para arrancar.
 *  - Elegir una barra: sus esfuerzos, su sección, sus uniones o sacarla (vale para las cuatro caras: el cálculo usa una
 *    cara tipo por viento).
 *  - Pintar secciones: se elige un tubo del catálogo y se tocan las barras.
 *  - Agregar barras: se tocan dos nudos (o puntos de piso) de una cara.
 *  - Colores: por clase de barra (diseño) o por esfuerzo (tracción en rojo, compresión en azul, como en toda la app).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { estado, fmt } from './estado';
import { h } from './comp';
import { datosExo, flechaExo } from './exo';
import { CATALOGO_HORMIGON, CATALOGO_TUBOS, pesoExo, TIPOS_EXO, zonasDe, type ClaseBarra, type ExoDef, type Seccion, type TipoExo, type ZonaExo } from '../engine/exo';
import { plantaDeNivel, puntosSilueta } from '../engine/silueta';

type Herramienta = 'elegir' | 'pintar' | 'zona' | ClaseBarra;
type ModoColor = 'clase' | 'esfuerzo' | 'verifica';
const css = (v: string, def: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || def;

/** plantillas: zonas listas (las cotas, como fracción de la altura sobre PB) */
export const PLANTILLAS: { nombre: string; texto: string; tipo: TipoExo; modulo: number; zonas: { f: number; tipo: TipoExo; modulo?: number; vanos?: number }[] }[] = [
  { nombre: 'Tubo en X con diagrid arriba', texto: 'Cruces abajo (donde el corte es mayor) y diamantes livianos en la mitad de arriba.', tipo: 'D', modulo: 4, zonas: [{ f: 0, tipo: 'D', modulo: 4 }, { f: 0.55, tipo: 'A', modulo: 6, vanos: 2 }] },
  { nombre: 'Diagrid que se abre con la altura', texto: 'Rombos chicos y densos abajo, más grandes arriba: la densidad sigue al momento volcador.', tipo: 'A', modulo: 4, zonas: [{ f: 0, tipo: 'A', modulo: 4, vanos: 3 }, { f: 0.4, tipo: 'A', modulo: 6, vanos: 2 }, { f: 0.75, tipo: 'A', modulo: 8, vanos: 1 }] },
  { nombre: 'Base en X y chevrones arriba', texto: 'Tubo en X en el tercio de abajo y, arriba, chevrones que cuelgan las esquinas del mástil.', tipo: 'D', modulo: 4, zonas: [{ f: 0, tipo: 'D', modulo: 3 }, { f: 0.33, tipo: 'E', modulo: 6 }] },
  { nombre: 'Mega-marcos con cinturones', texto: 'Pórticos de esquina abajo y dos reticulados cinturón en la mitad de arriba.', tipo: 'B', modulo: 4, zonas: [{ f: 0, tipo: 'B', modulo: 4 }, { f: 0.5, tipo: 'C', modulo: 3 }] },
];

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
  private encuadre = '';
  private pickables: THREE.Object3D[] = [];

  constructor() {
    this.el = h('div', { class: 'exo3d' });
    this.barraH = h('div', { class: 'exo3d-herr fila-acciones' });
    this.lienzo = h('div', { class: 'exo3d-lienzo' });
    this.lateral = h('div', { class: 'exo3d-lateral' });
    this.kpis = h('div', { class: 'exo3d-kpis' });
    this.ayuda = h('p', { class: 'nota chica exo3d-ayuda' });
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
    window.addEventListener('keydown', ev => { if (ev.key === 'Escape' && this.el.isConnected) { this.nudoA = null; this.sel = null; this.herramienta = 'elegir'; this.actualizar(); } });
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
      case 'zona': return `Zona nueva: tocá una barra o un nudo a la altura donde querés que empiece «${TIPOS_EXO[this.tipoZona].nombre}» (se corta en el nivel más cercano).`;
      default: return this.nudoA ? `Tocá el segundo nudo de la ${this.herramienta}, en la misma cara (o el mismo para soltarlo).` : `Agregar ${this.herramienta}: tocá el primer nudo (los puntos de la cara). Vale para las cuatro caras.`;
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
      ['pintar', 'Pintar sección', 'Elegí un tubo y tocá barras'],
      ['zona', 'Cortar zona', 'Tocá la torre a la altura donde empieza otra tipología'],
      ['diagonal', '+ diagonal', 'Tocá dos nudos de una cara'], ['viga', '+ viga', 'Tocá dos nudos de una cara'], ['columna', '+ columna', 'Tocá dos nudos de una cara'],
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
    // barras de las cuatro caras
    const cCol = new THREE.Color(css('--ink', '#1f2328')), cDia = new THREE.Color(css('--num', '#a55500')), cVig = new THREE.Color(css('--dim', '#8a949e'));
    const acero = new THREE.Color(css('--ink2', '#6b7480')), cT = new THREE.Color(css('--traccion', '#e24b4a')), cC = new THREE.Color(css('--compresion', '#378add'));
    const cSel = new THREE.Color(css('--elegido', '#e8a317')), cMal = new THREE.Color(css('--revisar', '#b26a00'));
    const radio = { columna: 0.32, diagonal: 0.22, viga: 0.25 } as const;
    const eje = new THREE.Vector3(0, 1, 0);
    const nudosVistos = new Set<string>();
    const matNudo = new THREE.MeshBasicMaterial({ color: cSel });
    const agregando = this.herramienta === 'diagonal' || this.herramienta === 'viga' || this.herramienta === 'columna' || this.herramienta === 'zona';
    (['A', 'B'] as const).forEach(dir => {
      const d = datosExo(dir);
      if (!d) return;
      const activa = dir === estado.dir;
      const cara = d.r.caras[0];
      const Nmax = Math.max(...cara.esfuerzos.map(e => Math.abs(e.N)), 1e-9);
      const malas = new Set(d.r.controles.filter(x => x.estado !== 'verifica').map(x => x.id));
      const aPlanta = (s: number, t: number) => (dir === 'A' ? { x: t, y: s } : { x: s, y: t });
      const tEn = (signo: number, z: number) => {
        if (!d.ts) return signo * d.tCaras[1];
        const zs = d.r.zs, k = zs.findIndex(zz => zz >= z - 1e-9);
        const v = k <= 0 ? d.ts[Math.max(0, k)] : d.ts[k - 1] + (d.ts[k] - d.ts[k - 1]) * ((z - zs[k - 1]) / (zs[k] - zs[k - 1] || 1));
        return signo * v;
      };
      const a3 = (s: number, z: number, signo: number) => { const q = aPlanta(s, tEn(signo, z)); return new THREE.Vector3(q.x, z, -q.y); };
      for (const signo of [-1, 1]) {
        cara.esfuerzos.forEach(e => {
          if ((e.fraccion ?? 1) !== 1) return;              // alas: son barras de las otras caras
          const A = a3(e.a.s, e.a.z, signo), B = a3(e.b.s, e.b.z, signo), L = A.distanceTo(B);
          if (L < 1e-6) return;
          const elegida = this.sel?.id === e.id;
          let col: THREE.Color;
          if (elegida) col = cSel;
          else if (this.color === 'esfuerzo') col = activa ? acero.clone().lerp(e.N >= 0 ? cT : cC, 0.35 + 0.65 * Math.min(1, Math.abs(e.N) / Nmax)) : acero;
          else if (this.color === 'verifica') col = malas.has(e.id) ? cMal : acero.clone().lerp(new THREE.Color(0xffffff), 0.45);
          else col = e.clase === 'columna' ? cCol : e.clase === 'diagonal' ? cDia : cVig;
          const r = radio[e.clase] * (elegida ? 1.6 : 1) * Math.max(0.6, Math.min(2.2, e.sec.b / 0.4));
          const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), new THREE.MeshStandardMaterial({ color: col, roughness: 0.45, metalness: 0.25, transparent: this.color === 'esfuerzo' && !activa, opacity: this.color === 'esfuerzo' && !activa ? 0.5 : 1 }));
          m.position.copy(A.clone().add(B).multiplyScalar(0.5));
          m.quaternion.setFromUnitVectors(eje, B.clone().sub(A).normalize());
          m.userData = { barra: e.id, dir };
          this.grupo.add(m); this.pickables.push(m);
        });
        // nudos (y puntos de piso en los bordes y en el medio) para agregar barras o cortar zonas
        if (agregando) {
          const pts: { s: number; z: number }[] = [];
          cara.esfuerzos.forEach(e => { pts.push(e.a, e.b); });
          d.r.zs.forEach((z, k) => { const w = (d.anchos?.[k] ?? d.ancho) / 2; pts.push({ s: -w, z }, { s: 0, z }, { s: w, z }); });
          pts.forEach(q => {
            const clave = `${dir}${signo}|${q.s.toFixed(3)}|${q.z.toFixed(3)}`;
            if (nudosVistos.has(clave)) return; nudosVistos.add(clave);
            const esA = this.nudoA && this.nudoA.dir === dir && this.nudoA.t === signo && Math.abs(this.nudoA.s - q.s) < 1e-6 && Math.abs(this.nudoA.z - q.z) < 1e-6;
            const m = new THREE.Mesh(new THREE.SphereGeometry(esA ? 0.9 : 0.5, 10, 8), esA ? new THREE.MeshBasicMaterial({ color: cT.clone().lerp(cSel, 1) }) : matNudo);
            m.position.copy(a3(q.s, q.z, signo));
            m.userData = { nudo: { dir, t: signo, s: q.s, z: q.z } };
            this.grupo.add(m); this.pickables.push(m);
          });
        }
      }
    });
    // zonas: un plano finito en cada corte y el nombre al costado
    const d0 = datosExo(estado.dir) ?? datosExo('A');
    if (d0) {
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

  private tocar(ev: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), this.camara);
    const hit = ray.intersectObjects(this.pickables, false);
    // con las herramientas de nudos, los nudos ganan aunque haya una barra delante
    const nudo = hit.find(x => x.object.userData.nudo)?.object.userData.nudo as { dir: 'A' | 'B'; t: number; s: number; z: number } | undefined;
    const barra = hit.find(x => x.object.userData.barra)?.object.userData as { barra: string; dir: 'A' | 'B' } | undefined;
    const h0 = this.herramienta;
    if (h0 === 'elegir') { this.sel = barra ? { id: barra.barra, dir: barra.dir } : null; this.actualizar(); return; }
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
    // agregar barra
    if (!nudo) return;
    if (!this.nudoA) { this.nudoA = nudo; this.actualizar(); return; }
    const a = this.nudoA; this.nudoA = null;
    if (a.dir !== nudo.dir || a.t !== nudo.t || (Math.abs(a.s - nudo.s) < 1e-6 && Math.abs(a.z - nudo.z) < 1e-6)) { this.actualizar(); return; }
    const clase = h0;
    // la posición en la cara va como fracción del medio ancho: así cae en el mismo lugar en las cuatro caras
    const dd = datosExo(a.dir);
    if (!dd) return;
    const medio = (z: number) => {
      const zs = dd.r.zs, W = (k: number) => (dd.anchos?.[k] ?? dd.ancho) / 2, k = zs.findIndex(zz => zz >= z - 1e-9);
      return k <= 0 ? W(Math.max(0, k)) : W(k - 1) + (W(k) - W(k - 1)) * ((z - zs[k - 1]) / (zs[k] - zs[k - 1] || 1));
    };
    const fr = (q: { s: number; z: number }): [number, number] => [+(q.s / medio(q.z)).toFixed(6), +q.z.toFixed(4)];
    this.cambiar(d => { d.nuevas = [...(d.nuevas ?? []), { clase, a: fr(a), b: fr(nudo), enFraccion: true }]; });
  }

  /** zona nueva desde la cota z (el nivel más cercano); si no había zonas, la de abajo es la ficha */
  private agregarZona(z: number) {
    const d0 = datosExo(estado.dir) ?? datosExo('A');
    if (!d0) return;
    const zs = d0.r.zs;
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
      if (!d || !e) this.sel = null;
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
          h('div', { class: 'nota chica' }, `L = ${fmt(e.L, 2)} m · tubo ${fmt(e.sec.b * 1000, 0)} × ${fmt(e.sec.e * 1000, 1)} mm${ctl ? ` · σ = ${fmt(ctl.sigma, 0)} t/m² · ${ctl.estado}` : ''}`),
          h('label', { class: 'campo-linea' }, 'Sección ', s),
          union('Unión en a', e.relA, v => poner(c => { c.relA = v; })), union('Unión en b', e.relB, v => poner(c => { c.relB = v; })),
          h('div', { class: 'fila-acciones' }, nueva ? borrarNueva : sacar, ...(Object.keys(cam).length ? [volver] : [])),
          h('p', { class: 'nota chica' }, 'Vale para esta barra en las cuatro caras (el cálculo usa una cara tipo por viento).')));
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
    // zonas
    const d0 = datosExo(estado.dir) ?? datosExo('A');
    const zsN = d0?.r.zs ?? [];
    const nombreZ = (z: number) => p.niveles.find(n => Math.abs(n.cota - z) < 1e-6)?.nombre ?? `${fmt(z, 1)} m`;
    const cajaZ = h('section', { class: 'exo3d-caja' }, h('b', {}, 'Zonas en altura'));
    if (!def.zonas?.length) {
      cajaZ.append(h('p', { class: 'nota chica' }, `Toda la torre: ${def.tipo} · ${TIPOS_EXO[def.tipo].nombre}, módulo ${def.modulo}. Con «Cortar zona» (o una plantilla) cambiás de tipología en altura.`));
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
      cajaZ.append(h('p', { class: 'nota chica' }, 'Entre zonas va una viga de transición que ata los dos dibujos. Cambiar una zona borra los cambios barra por barra (cambian los números de las barras).'));
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
      cajaP.append(b, h('p', { class: 'nota chica' }, pl.texto));
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
    if (!dA && !dB) out.push(h('p', { class: 'error' }, 'No se pudo calcular el exoesqueleto (¿quedó un mecanismo? Ctrl+Z vuelve atrás).'));
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
