/**
 * Vista 3D de la torre: losas de cada nivel, muros del contraviento con el color de su papel y el viento.
 * Con «deformada» muestra la rototraslación exagerada: cada nivel se corre δ(z) en el sentido del viento y gira
 * θ(z) alrededor del centro de rigidez CR (ver rototraslacion3D en el motor). Cada muro se arma como un prisma con
 * un anillo en cada nivel, así se dobla y se revira piso por piso; la torre sin deformar queda en línea de trazos.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { estado, COLORES, fmt } from './estado';
import { entraEnCalculo, huecoEn, rectangulos, tipoDe } from '../engine/modelo';
import { enPlanta, polilinea } from '../engine/perfil';
import { desplazar, movimientoEn, type Rototraslacion3D } from '../engine/diagramas';
import { plantaDeNivel, puntosSilueta } from '../engine/silueta';
import { datosExo } from './exo';

type P2 = { x: number; y: number };
const css = (v: string, def: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || def;

/** Corrimiento real máximo de un punto de la planta (traslación + giro alrededor del CR de cada nivel). */
export function movMaximo(r: Rototraslacion3D, B: number, L: number): number {
  return Math.max(0, ...r.niveles.map(n => Math.abs(n.d) + Math.abs(n.th) * Math.hypot(B / 2 + Math.abs(n.cr.x), L / 2 + Math.abs(n.cr.y))));
}

/** Exageración «redonda» (1, 2, 5 × 10ⁿ) para que la azotea se corra cerca de un sexto del ancho de la planta. */
/** últimas exageraciones usadas (para los deslizadores de la axonometría) */
export const ultimaDeformada = { auto: 0, giroAuto: 1, f: 0, k: 1 };
export function exageracionAuto(r: Rototraslacion3D, B: number, L: number): number {
  const mov = Math.max(movMaximo(r, B, L), 1e-12);
  const f = (0.16 * Math.max(B, L)) / mov;
  const p = 10 ** Math.floor(Math.log10(f));
  return [5, 2, 1].map(k => k * p).find(v => v <= f) ?? p;
}

/**
 * Extra del giro: la rotación es mucho más chica que la traslación, así que se multiplica aparte para que el
 * revirado se vea (la azotea gira unos 20° en el dibujo). Es solo para dibujar: los números son los reales.
 */
export function giroExtraAuto(r: Rototraslacion3D, f: number): number {
  const th = Math.abs(r.thTop) * f;
  if (th < 1e-12) return 1;
  const x = 0.35 / th;
  if (x <= 1.5) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  return [1, 2, 5, 10].map(k => k * p).reduce((a, b) => (Math.abs(Math.log(b / x)) < Math.abs(Math.log(a / x)) ? b : a));
}

/**
 * Prisma deformable: una planta (polígono) repetida en varias cotas. Las posiciones se recalculan con mover()
 * sin rehacer la geometría (sirve para animar).
 */
class Prisma {
  malla: THREE.Mesh; bordes: THREE.LineSegments; conBordes = true;
  private base: number[] = []; private baseB: number[] = [];
  constructor(pol: P2[], zs: number[], mat: THREE.Material, matB: THREE.LineBasicMaterial, private zMover?: number, huecos: P2[][] = []) {
    const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => this.base.push(...a, ...b, ...c);
    const n = pol.length;
    for (const anillo of [pol, ...huecos]) for (let k = 0; k + 1 < zs.length; k++) for (let i = 0; i < anillo.length; i++) {
      const p = anillo[i], q = anillo[(i + 1) % anillo.length], z0 = zs[k], z1 = zs[k + 1];
      tri([p.x, p.y, z0], [q.x, q.y, z0], [q.x, q.y, z1]);
      tri([p.x, p.y, z0], [q.x, q.y, z1], [p.x, p.y, z1]);
    }
    // tapas: triangulación que sirve también para contornos cóncavos (siluetas en L, con arcos, etc.) y con huecos
    const todos = [...pol, ...huecos.flat()];
    const tris = n <= 4 && !huecos.length ? Array.from({ length: n - 2 }, (_, i) => [0, i + 1, i + 2]) : THREE.ShapeUtils.triangulateShape(pol.map(p => new THREE.Vector2(p.x, p.y)), huecos.map(h => h.map(p => new THREE.Vector2(p.x, p.y))));
    const horario = THREE.ShapeUtils.isClockWise(pol.map(p => new THREE.Vector2(p.x, p.y)));
    for (const [z, arriba] of [[zs[0], false], [zs[zs.length - 1], true]] as const) tris.forEach(([i0, i1, i2]) => {
      const a: [number, number, number] = [todos[i0].x, todos[i0].y, z], b: [number, number, number] = [todos[i1].x, todos[i1].y, z], c: [number, number, number] = [todos[i2].x, todos[i2].y, z];
      if (arriba !== horario) tri(a, c, b); else tri(a, b, c);
    });
    // bordes: contorno arriba y abajo y, si es un rectángulo, las aristas verticales piso por piso
    const seg = (a: number[], b: number[]) => this.baseB.push(...a, ...b);
    for (const anillo of [pol, ...huecos]) for (const z of [zs[0], zs[zs.length - 1]]) for (let i = 0; i < anillo.length; i++) seg([anillo[i].x, anillo[i].y, z], [anillo[(i + 1) % anillo.length].x, anillo[(i + 1) % anillo.length].y, z]);
    if (n <= 8) for (let k = 0; k + 1 < zs.length; k++) for (const p of pol) seg([p.x, p.y, zs[k]], [p.x, p.y, zs[k + 1]]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.base.length), 3));
    const gb = new THREE.BufferGeometry();
    gb.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.baseB.length), 3));
    this.malla = new THREE.Mesh(g, mat);
    this.bordes = new THREE.LineSegments(gb, matB);
  }
  /**
   * Espectro de la deformada: cada vértice se pinta según su corrimiento real (traslación más giro, sin exagerar),
   * de blanco (casi cero) a verde (el mayor de la torre), como en la app de estéreo-estructuras.
   */
  colorear(r: Rototraslacion3D, maximo: number, blanco: THREE.Color, verde: THREE.Color) {
    const col = new Float32Array(this.base.length), c = new THREE.Color();
    for (let i = 0; i < this.base.length; i += 3) {
      const x = this.base[i], y = this.base[i + 1], z = this.zMover ?? this.base[i + 2];
      const q = desplazar(r, x, y, z, 1, 1);
      const t = maximo > 0 ? Math.min(1, Math.hypot(q.x - x, q.y - y) / maximo) : 0;
      c.copy(blanco).lerp(verde, Math.pow(t, 0.8));
      col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b;
    }
    this.malla.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  /** planta (x, y) y cota z → three (x, z, −y), con el movimiento de cada cota multiplicado por f */
  mover(r: Rototraslacion3D | null, f: number, fg = f) {
    const poner = (src: number[], attr: THREE.BufferAttribute) => {
      const a = attr.array as Float32Array;
      for (let i = 0; i < src.length; i += 3) {
        const q = r && f ? desplazar(r, src[i], src[i + 1], this.zMover ?? src[i + 2], f, fg) : { x: src[i], y: src[i + 1] };
        a[i] = q.x; a[i + 1] = src[i + 2]; a[i + 2] = -q.y;
      }
      attr.needsUpdate = true;
    };
    poner(this.base, this.malla.geometry.getAttribute('position') as THREE.BufferAttribute);
    this.malla.geometry.computeVertexNormals();
    this.malla.geometry.computeBoundingSphere();
    poner(this.baseB, this.bordes.geometry.getAttribute('position') as THREE.BufferAttribute);
    this.bordes.geometry.computeBoundingSphere();
  }
}

export interface Opciones3D {
  /** ¿mostrar la deformada? */
  deformada: () => boolean;
  /** datos de la rototraslación en altura (null si no hay piezas) */
  roto: () => Rototraslacion3D | null;
  /** rótulo con la exageración y los movimientos */
  rotulo?: boolean;
  /** nombres de las piezas, CR, ejes y cotas sobre el dibujo */
  etiquetas?: boolean;
}

export function montar3D(cont: HTMLElement, op: Opciones3D) {
  // sin WebGL (algunos visores de HTML de Android, tablets viejas): el 3D no se dibuja, pero el resto de la app anda
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); }
  catch {
    const aviso = document.createElement('div'); aviso.className = 'sin-3d';
    aviso.textContent = 'Este navegador no puede dibujar en 3D (no tiene WebGL). El cálculo, la planta y los diagramas funcionan igual; para ver el 3D abrí la app en Chrome.';
    cont.appendChild(aviso);
    return;
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  cont.appendChild(renderer.domElement);
  const info = document.createElement('div');
  info.className = 'info3d';
  info.hidden = true;
  cont.appendChild(info);
  const capaEt = new CSS2DRenderer();
  capaEt.domElement.className = 'etiquetas3d';
  if (op.etiquetas) cont.appendChild(capaEt.domElement);
  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
  const controles = new OrbitControls(camara, renderer.domElement);
  controles.enableDamping = true;
  escena.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 1.4);
  sol.position.set(-60, 120, 80);
  escena.add(sol);
  const grupo = new THREE.Group();
  escena.add(grupo);
  let encuadre = '';
  let prismas: Prisma[] = [];
  let extras: { mover: (f: number) => void }[] = [];
  let roto: Rototraslacion3D | null = null;
  let fMax = 0, kGiro = 1;

  function fondo() { escena.background = new THREE.Color(css('--lienzo', '#ffffff')); }

  function construir() {
    if (!cont.isConnected) return;
    fondo();
    grupo.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); if (o instanceof CSS2DObject) o.element.remove(); });
    grupo.clear();
    prismas = []; extras = [];
    const p = estado.proyecto;
    if (!p.niveles.length) return;
    const top = p.niveles[0].cota;
    const fondoCota = p.niveles[p.niveles.length - 1].cota;
    const def = op.deformada();
    roto = def ? op.roto() : null;
    let B = 0, L = 0;
    p.niveles.forEach(n => { B = n.B ?? B; L = n.L ?? L; });
    fMax = roto ? (estado.roto3d.exag ?? exageracionAuto(roto, B, L)) : 0;
    kGiro = roto ? (estado.roto3d.giro ?? giroExtraAuto(roto, fMax)) : 1;
    if (roto) { ultimaDeformada.auto = exageracionAuto(roto, B, L); ultimaDeformada.giroAuto = giroExtraAuto(roto, fMax); ultimaDeformada.f = fMax; ultimaDeformada.k = kGiro; }
    const cotas = p.niveles.map(n => n.cota).sort((a, b) => a - b);
    const tinta = new THREE.LineBasicMaterial({ color: new THREE.Color(css('--ink2', '#556')), transparent: true, opacity: 0.55 });
    // losas (con el espectro, también se pintan según su corrimiento)
    const espectro = !!roto && estado.capas.espectro;
    const matLosa = espectro
      ? new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.9, roughness: 0.9, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: 0xdfe3e6, transparent: true, opacity: def ? 0.4 : 0.55, roughness: 0.9, side: THREE.DoubleSide });
    const matSub = new THREE.MeshStandardMaterial({ color: 0xb9c0c6, transparent: true, opacity: 0.45, roughness: 0.9, side: THREE.DoubleSide });
    p.niveles.forEach((n, iN) => {
      if (!estado.capas.losas) return;
      const pol = puntosSilueta(plantaDeNivel(p, iN).silueta, 12);
      const hs = (p.huecosLosa ?? []).filter(hh => huecoEn(hh, n.cota) && hh.v.length >= 3).map(hh => hh.v.map(q => ({ x: q.x, y: q.y })));
      prismas.push(new Prisma(pol, [n.cota - 0.2, n.cota], n.cota < 0 ? matSub : matLosa, new THREE.LineBasicMaterial({ color: 0x7d8a94 }), n.cota, hs));
    });
    // muros
    const papeles = estado.calculo.asig?.papeles ?? {};
    const h = top - fondoCota;
    const zNivel = estado.nivelPlanta;
    if (zNivel !== null && !def) {
      const n = p.niveles.find(x => Math.abs(x.cota - zNivel) < 1e-6);
      if (n) {
        const resalte = new THREE.Mesh(new THREE.BoxGeometry(B + 0.6, 0.3, L + 0.6), new THREE.MeshStandardMaterial({ color: 0x1f6f8b, transparent: true, opacity: 0.35 }));
        resalte.position.set(0, n.cota - 0.1, 0); grupo.add(resalte);
      }
    }
    p.muros.forEach(m => {
      const papel = papeles[m.id]?.[estado.dir] ?? 'sin pieza';
      const color = espectro ? new THREE.Color(0xffffff) : new THREE.Color(COLORES[papel] === '#FFFFFF' ? '#d9d9d9' : COLORES[papel]);
      const entra = entraEnCalculo(m, fondoCota, top);
      if (!entra && !estado.capas.fuera) return;
      const mat = new THREE.MeshStandardMaterial({ color, vertexColors: espectro, roughness: 0.7, transparent: !entra, opacity: entra ? 1 : 0.4, flatShading: true,
        emissive: estado.seleccion === m.id ? new THREE.Color(0x1f6f8b) : new THREE.Color(0x000000), emissiveIntensity: 0.6 });
      const z0 = Math.max(fondoCota, m.zDesde ?? fondoCota), z1 = Math.min(top, m.zHasta ?? top);
      if (z1 - z0 <= 0) return;
      const zs = [z0, ...cotas.filter(z => z > z0 + 1e-6 && z < z1 - 1e-6), z1];
      if (tipoDe(m) === 'perfil') {
        const pp = enPlanta(m), ext = polilinea(pp.v, 6, 16), hs = (pp.huecos ?? []).map(hh => polilinea(hh, 6, 16));
        const pr = new Prisma(ext, zs, mat, tinta, undefined, hs); pr.conBordes = def; prismas.push(pr);
        return;
      }
      const pols: P2[][] = tipoDe(m) === 'tubo-circ'
        ? [Array.from({ length: 28 }, (_, i) => ({ x: m.x + (m.largo / 2) * Math.cos((i / 28) * 2 * Math.PI), y: m.y + (m.largo / 2) * Math.sin((i / 28) * 2 * Math.PI) }))]
        : rectangulos(m).map(r => [{ x: r.x - r.ax / 2, y: r.y - r.ay / 2 }, { x: r.x + r.ax / 2, y: r.y - r.ay / 2 }, { x: r.x + r.ax / 2, y: r.y + r.ay / 2 }, { x: r.x - r.ax / 2, y: r.y + r.ay / 2 }]);
      pols.forEach(pol => { const pr = new Prisma(pol, zs, mat, tinta); pr.conBordes = def; prismas.push(pr); });
    });
    if (espectro && roto) {
      // el mayor corrimiento real de la torre: el de la esquina más alejada del CR en la azotea
      const maximo = Math.max(movMaximo(roto, B, L), 1e-12);
      const blanco = new THREE.Color(0xffffff), verde = new THREE.Color(css('--deformada', '#1d9e75'));
      prismas.forEach(pr => { if (!(pr.malla.material as THREE.MeshStandardMaterial).vertexColors) return; pr.colorear(roto!, maximo, blanco, verde); });
    }
    prismas.forEach(pr => { grupo.add(pr.malla); if (pr.conBordes) grupo.add(pr.bordes); });
    // viento
    const largo = 8;
    const dirV = estado.dir === 'A' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(1, 0, 0);
    const origen = estado.dir === 'A' ? new THREE.Vector3(0, top * 0.6, L / 2 + largo + 3) : new THREE.Vector3(-B / 2 - largo - 3, top * 0.6, 0);
    if (estado.capas.viento) grupo.add(new THREE.ArrowHelper(dirV, origen, largo, new THREE.Color(css('--carga', '#e07b00')).getHex(), 2.5, 1.6));
    if (estado.proyecto.exo && estado.capas.exo && !roto) agregarExo();
    if (roto) agregarRoto(roto, B, L, top, fondoCota, cotas);
    if (roto && op.etiquetas && estado.roto3d.rotulos) agregarRotulos(roto, B, L, top, fondoCota);
    mover(fMax);
    // la cámara se vuelve a encuadrar cuando cambia el tamaño de la torre (no al mover un muro)
    const clave = [B, L, top, fondoCota].map(v => v.toFixed(1)).join('|') + (roto ? estado.dir : '');
    medidas = { B, L, h, top, fondoCota };
    if (clave !== encuadre) { encuadrar(); encuadre = clave; }
    rotular();
  }

  /**
   * Exoesqueleto: las cuatro caras como tubos de acero. Las dos caras paralelas al viento elegido se pintan con su
   * esfuerzo normal (tracción o compresión, más intenso cuanto mayor |N|); las otras dos, en gris acero.
   */
  function agregarExo() {
    const caras = (['A', 'B'] as const).map(dir => ({ dir, d: datosExo(dir) }));
    const acero = new THREE.Color(css('--ink2', '#6b7480')), cT = new THREE.Color(css('--compresion', '#2b6cb0')), cC = new THREE.Color(css('--traccion', '#c53030'));
    const radio = { columna: 0.32, diagonal: 0.2, viga: 0.24 } as const;
    const eje = new THREE.Vector3(0, 1, 0);
    caras.forEach(({ dir, d }) => {
      if (!d) return;
      const activa = dir === estado.dir;
      const Nmax = Math.max(...d.r.caras[0].esfuerzos.map(e => Math.abs(e.N)), 1e-9);
      // viento A: las caras van en x = ±t y la cara corre a lo largo de y; viento B: en y = ±t, a lo largo de x
      const aPlanta = (s2: number, t: number) => (dir === 'A' ? { x: t, y: s2 } : { x: s2, y: t });
      d.r.caras.forEach(c => c.esfuerzos.forEach(e => {
        const pa = aPlanta(e.a.s, c.t), pb = aPlanta(e.b.s, c.t);
        const A = new THREE.Vector3(pa.x, e.a.z, -pa.y), Bv = new THREE.Vector3(pb.x, e.b.z, -pb.y);
        const L = A.distanceTo(Bv);
        if (L < 1e-6) return;
        const col = activa ? acero.clone().lerp(e.N >= 0 ? cT : cC, 0.35 + 0.65 * Math.min(1, Math.abs(e.N) / Nmax)) : acero;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(radio[e.clase], radio[e.clase], L, 8), new THREE.MeshStandardMaterial({ color: col, roughness: 0.45, metalness: 0.3, transparent: !activa, opacity: activa ? 1 : 0.55 }));
        m.position.copy(A.clone().add(Bv).multiplyScalar(0.5));
        m.quaternion.setFromUnitVectors(eje, Bv.clone().sub(A).normalize());
        grupo.add(m);
      }));
    });
  }

  /** torre sin deformar (trazos), eje del CR deformado y flecha curva del giro en la azotea */
  function agregarRoto(r: Rototraslacion3D, B: number, L: number, top: number, zPB: number, cotas: number[]) {
    const z0 = Math.max(0, zPB);
    const cDim = new THREE.Color(css('--ink2', '#556'));
    if (estado.roto3d.original) {
      const caja = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(B, top - z0, L)), new THREE.LineDashedMaterial({ color: cDim, dashSize: 0.8, gapSize: 0.6 }));
      caja.position.set(0, (top + z0) / 2, 0);
      caja.computeLineDistances();
      grupo.add(caja);
    }
    // eje vertical por el CR: sin deformar (trazos) y deformado (se traslada, no gira)
    const cEle = new THREE.Color(css('--elegido', '#e8a317'));
    // si un muro no llega arriba, el CR cambia de lugar en altura: el eje sigue al CR de cada nivel
    const crEn = (z: number) => movimientoEn(r, Math.min(z, top)).cr;
    const zsE = [...cotas.filter(z => z >= z0), top + 2];
    const eje0 = new THREE.Line(new THREE.BufferGeometry().setFromPoints(zsE.map(z => { const c = crEn(Math.max(z, z0 + 1e-6)); return new THREE.Vector3(c.x, z, -c.y); })), new THREE.LineDashedMaterial({ color: cEle, dashSize: 0.6, gapSize: 0.5 }));
    eje0.computeLineDistances();
    grupo.add(eje0);
    const gE = new THREE.BufferGeometry().setFromPoints(zsE.map(z => new THREE.Vector3(r.cr.x, z, -r.cr.y)));
    const ejeD = new THREE.Line(gE, new THREE.LineBasicMaterial({ color: cEle }));
    grupo.add(ejeD);
    extras.push({ mover: f => {
      const a = gE.getAttribute('position') as THREE.BufferAttribute;
      zsE.forEach((z, i) => { const zz = Math.min(z, top), c = crEn(Math.max(zz, z0 + 1e-6)), q = desplazar(r, c.x, c.y, zz, f, f * kGiro); a.setXYZ(i, q.x, z, -q.y); });
      a.needsUpdate = true; gE.computeBoundingSphere();
    } });
    // flecha curva del giro sobre la azotea (sentido de θ), como en las láminas de la clase
    if (Math.abs(r.thTop) > 1e-12) {
      const rad = 0.32 * Math.min(B, L), sgn = Math.sign(r.thTop);              // θ > 0: antihorario visto desde arriba
      const a0 = -Math.PI / 2 - sgn * 0.9, a1 = -Math.PI / 2 + sgn * 0.9;
      const cCor = new THREE.Color(css('--corte', '#7b4fd1'));
      const arco = new THREE.Group();
      const pts = Array.from({ length: 25 }, (_, i) => { const a = a0 + (a1 - a0) * (i / 24); return new THREE.Vector3(rad * Math.cos(a), 0, -rad * Math.sin(a)); });
      arco.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.18, 6), new THREE.MeshStandardMaterial({ color: cCor })));
      const fin = pts[pts.length - 1], ant = pts[pts.length - 2];
      const cono = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 12), new THREE.MeshStandardMaterial({ color: cCor }));
      cono.position.copy(fin);
      cono.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fin.clone().sub(ant).normalize());
      arco.add(cono);
      grupo.add(arco);
      extras.push({ mover: f => {
        const c = movimientoEn(r, top).cr, q = desplazar(r, c.x, c.y, top, f, f * kGiro);
        arco.position.set(q.x, top + 1.2, -q.y);
        arco.rotation.y = movimientoEn(r, top).th * f * kGiro;
        arco.visible = f > 0;
      } });
    }
  }

  /** etiqueta HTML pegada a un punto 3D */
  function etiqueta(texto: string, clase: string, globo?: string): CSS2DObject {
    const e = document.createElement('div');
    e.className = `et3d ${clase}`;
    e.innerHTML = texto;
    if (globo) e.title = globo;
    const o = new CSS2DObject(e);
    grupo.add(o);
    return o;
  }
  /** línea de cota con topes (en coordenadas de three) */
  function cota(a: THREE.Vector3, b: THREE.Vector3, texto: string, color: THREE.Color, globo?: string) {
    const mat = new THREE.LineBasicMaterial({ color });
    const u = b.clone().sub(a).normalize();
    const n = Math.abs(u.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t = n.clone().multiplyScalar(0.6);
    const pts = [a, b, a.clone().add(t), a.clone().sub(t), b.clone().add(t), b.clone().sub(t)];
    grupo.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat));
    etiqueta(texto, 'cota', globo).position.copy(a.clone().add(b).multiplyScalar(0.5));
  }

  /**
   * Lo que marca la planilla, sobre el dibujo: el nombre de cada pieza (en la azotea, se mueve con ella), el CR
   * (punto de giro) con el eje de inercia y el de simetría en el suelo, y las cotas de análisis: B, L, h, e,
   * los niveles y la δ de la azotea.
   */
  function agregarRotulos(r: Rototraslacion3D, B: number, L: number, top: number, zFondo: number) {
    const p = estado.proyecto;
    const z0 = Math.max(0, zFondo);
    const cTin = new THREE.Color(css('--ink', '#223'));
    const cEle = new THREE.Color(css('--elegido', '#e8a317'));
    const cCar = new THREE.Color(css('--carga', '#e07b00'));
    const A = estado.dir === 'A';
    // piezas: nombre en la azotea, en el baricentro de sus muros
    const porId = new Map(p.muros.map(m => [m.id, m]));
    (estado.calculo.asig?.piezas ?? []).filter(pz => pz.dir === estado.dir && pz.filaHoja !== null).forEach(pz => {
      const ms = pz.muros.map(id => porId.get(id)).filter((m): m is NonNullable<typeof m> => !!m);
      if (!ms.length) return;
      const a = ms.reduce((s2, m) => s2 + m.largo * m.espesor, 0) || 1;
      const x = ms.reduce((s2, m) => s2 + m.x * m.largo * m.espesor, 0) / a, y = ms.reduce((s2, m) => s2 + m.y * m.largo * m.espesor, 0) / a;
      const zt = Math.min(top, Math.max(...ms.map(m => m.zHasta ?? top)));
      const o = etiqueta(pz.nombre, 'pieza', `${pz.nombre}: ${pz.muros.join(', ')}`);
      extras.push({ mover: f => { const q = desplazar(r, x, y, zt, f, f * kGiro); o.position.set(q.x, zt + 1.6, -q.y); } });
    });
    // CR: punto de giro arriba y abajo
    const crAbajo = etiqueta('CR', 'cr', 'Centro de rigidez: cada planta gira alrededor de este punto (rototraslación)');
    // punto de giro del vuelco (M,NyQ): el borde de la base del lado de sotavento, a nivel de fundación
    const fu = p.fundacion, bB = A ? fu.b1 : fu.a1, aB = A ? fu.a1 : fu.b1;
    const zFu = p.niveles[p.niveles.length - 1]?.cota ?? 0;
    const g0 = A ? new THREE.Vector3(-aB / 2, zFu, -bB / 2) : new THREE.Vector3(bB / 2, zFu, -aB / 2);
    const g1 = A ? new THREE.Vector3(aB / 2, zFu, -bB / 2) : new THREE.Vector3(bB / 2, zFu, aB / 2);
    grupo.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, g0.distanceTo(g1), 12).rotateZ(A ? Math.PI / 2 : 0).rotateX(A ? 0 : Math.PI / 2), new THREE.MeshStandardMaterial({ color: new THREE.Color(css('--ink', '#222')) })).translateX((g0.x + g1.x) / 2).translateY(zFu).translateZ((g0.z + g1.z) / 2));
    etiqueta('punto de giro (vuelco)', 'giro', 'Borde de la base a sotavento: el viento hace volcar la torre alrededor de esta arista (M,NyQ: Mv contra Me = P · b\'/2)').position.copy(g1.clone().add(new THREE.Vector3(A ? 1 : 0.5, 0.8, A ? 0 : 0.5)));
    crAbajo.position.set(r.cr.x, z0 + 0.4, -r.cr.y);
    const crArriba = etiqueta('CR · centro de rotación de la planta', 'cr arriba');
    extras.push({ mover: f => { const c = movimientoEn(r, top).cr, q = desplazar(r, c.x, c.y, top, f, f * kGiro); crArriba.position.set(q.x, top + 6, -q.y); } });
    // ejes en el suelo, en el sentido del viento: simetría (donde actúa W) e inercia (por el CR)
    const largoEje = (A ? L : B) / 2 + 3;
    const eje = (t: number, color: THREE.Color, texto: string, trazos: boolean, alFinal = false) => {
      const a = A ? new THREE.Vector3(t, z0 + 0.05, largoEje) : new THREE.Vector3(-largoEje, z0 + 0.05, -t);
      const b = A ? new THREE.Vector3(t, z0 + 0.05, -largoEje) : new THREE.Vector3(largoEje, z0 + 0.05, -t);
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), trazos ? new THREE.LineDashedMaterial({ color, dashSize: 0.7, gapSize: 0.5 }) : new THREE.LineBasicMaterial({ color }));
      ln.computeLineDistances();
      grupo.add(ln);
      etiqueta(texto, 'eje').position.copy(alFinal ? b : a);
    };
    // t del eje de inercia en planta: A: x = Xr · B: y = −Xr (marco del viento)
    eje(0, cCar, 'eje de simetría (W)', true);
    if (Math.abs(r.e) > 1e-3) eje(A ? r.cr.x : r.cr.y, cEle, 'eje de inercia', false, true);
    // cotas: B y L en el suelo (del lado de sotavento), e entre los ejes (barlovento), h y los niveles en la esquina
    // de barlovento más cercana a la cámara, hacia afuera, así no tapan la torre
    const d2 = 2.2;
    cota(new THREE.Vector3(-B / 2, z0, A ? -L / 2 - d2 : L / 2 + d2), new THREE.Vector3(B / 2, z0, A ? -L / 2 - d2 : L / 2 + d2), `B = ${fmt(B)} m`, cTin, 'Largo del edificio en x');
    cota(new THREE.Vector3(B / 2 + d2, z0, L / 2), new THREE.Vector3(B / 2 + d2, z0, -L / 2), `L = ${fmt(L)} m`, cTin, 'Ancho del edificio en y');
    if (Math.abs(r.e) > 1e-3) {
      const ze = z0 + 0.1;
      const a = A ? new THREE.Vector3(0, ze, L / 2 + d2) : new THREE.Vector3(-B / 2 - d2, ze, 0);
      const b = A ? new THREE.Vector3(r.cr.x, ze, L / 2 + d2) : new THREE.Vector3(-B / 2 - d2, ze, -r.cr.y);
      cota(a, b, `e = ${fmt(Math.abs(r.e))} m`, cEle, 'Excentricidad: distancia del eje de simetría (donde actúa W) al eje de inercia. Mt = W · e');
    }
    // esquina de barlovento del lado de la cámara (three): A → (B/2, L/2 + 4) · B → (−B/2 − 4, L/2)
    const esq = A ? new THREE.Vector3(B / 2, 0, L / 2 + 4.5) : new THREE.Vector3(-B / 2 - 4.5, 0, L / 2);
    cota(esq.clone().setY(z0), esq.clone().setY(top), `h = ${fmt(top - z0)} m`, cTin, 'Altura sobre PB (la del J mínimo: h/500)');
    const nivs = p.niveles.filter(n => n.cota >= z0).sort((a2, b2) => a2.cota - b2.cota);
    const paso = Math.max(1, Math.ceil(nivs.length / 7));
    const tick = new THREE.LineBasicMaterial({ color: cTin });
    nivs.forEach((n, i) => {
      if (i % paso && i !== nivs.length - 1) return;
      const pt = esq.clone().setY(n.cota);
      grupo.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([pt.clone().add(new THREE.Vector3(A ? 0 : 0, 0, A ? 0.5 : 0)), pt.clone().add(A ? new THREE.Vector3(0, 0, 1.2) : new THREE.Vector3(-1.2, 0, 0))]), tick));
      etiqueta(`${n.nombre} <span>${n.cota > 0 ? '+' : ''}${fmt(n.cota)}</span>`, 'nivel').position.copy(pt.add(A ? new THREE.Vector3(0, 0, 1.4) : new THREE.Vector3(-1.4, 0, 0)));
    });
    // δ en la azotea: del CR sin deformar al CR corrido (solo la traslación)
    const gD = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    grupo.add(new THREE.Line(gD, new THREE.LineBasicMaterial({ color: new THREE.Color(css('--deformada', '#2a9d5c')) })));
    const etD = etiqueta(`δ = ${fmt(r.dTop * 1000, 1)} mm`, 'delta', 'Corrimiento real de la azotea (el dibujo está exagerado)');
    extras.push({ mover: f => {
      const c = movimientoEn(r, top).cr, q = desplazar(r, c.x, c.y, top, f, f * kGiro);
      const a = gD.getAttribute('position') as THREE.BufferAttribute;
      a.setXYZ(0, c.x, top + 2, -c.y); a.setXYZ(1, q.x, top + 2, -q.y); a.needsUpdate = true; gD.computeBoundingSphere();
      etD.position.set(q.x, top + 2, -q.y);
    } });
  }

  function mover(f: number) {
    prismas.forEach(pr => pr.mover(roto, f, f * kGiro));
    extras.forEach(x => x.mover(f));
  }

  function rotular() {
    info.hidden = !(op.rotulo && roto);
    if (!roto || info.hidden) return;
    const giro = Math.abs(roto.thTop);
    info.innerHTML = `<b>Traslación × ${fmt(fMax, 0)}${giro > 1e-12 ? ` · giro × ${fmt(fMax * kGiro, 0)}` : ''}</b><br>azotea: δ = ${fmt(roto.dTop * 1000, 1)} mm` +
      (giro > 1e-12 ? ` · θ = ${fmt(giro * 1e3, 3)} ‰ rad = ${fmt((giro * 180) / Math.PI * 60, 2)}′ (${roto.thTop < 0 ? 'horario' : 'antihorario'})` : ' · sin giro (solo traslación)') +
      (estado.capas.espectro ? (() => {
        const { B, L } = medidas, max = movMaximo(roto, B, L);
        return `<div class="espectro"><span>0</span><i></i><span>${fmt(max * 1000, 1)} mm</span></div><small>corrimiento real de cada punto (traslación + giro)</small>`;
      })() : '');
  }

  let medidas = { B: 20, L: 16, h: 20, top: 20, fondoCota: 0 };
  /** la torre entera entra en el visor, sea ancha o angosta */
  function encuadrar() {
    const { B, L, h, top, fondoCota } = medidas;
    const r = 0.5 * Math.sqrt(B * B + L * L + h * h) + (roto ? 9 : 4);
    const fovV = (camara.fov * Math.PI) / 180;
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camara.aspect);
    const d = r / Math.sin(Math.min(fovV, fovH) / 2);
    // deformada: de costado al viento (el viento va de izquierda a derecha en pantalla), un poco desde arriba
    // y desde barlovento, así se ven la flexión y el giro; si no, la axonometría de siempre
    const w = roto ? new THREE.Vector3(roto.viento.x, 0, -roto.viento.y) : null;
    const dir = w ? new THREE.Vector3(-w.z, 0, w.x).multiplyScalar(0.8).add(new THREE.Vector3(0, 0.45, 0)).addScaledVector(w, -0.42).normalize()
      : new THREE.Vector3(-0.62, 0.38, 0.69).normalize();
    controles.target.set(0, (top + fondoCota) / 2, 0);
    camara.position.copy(controles.target).addScaledVector(dir, d);
    camara.far = Math.max(2000, d * 4);
    camara.updateProjectionMatrix();
  }
  renderer.domElement.addEventListener('dblclick', encuadrar);
  renderer.domElement.title = 'Arrastrar: girar · rueda: acercar · doble clic: encuadrar la torre';

  function tamaño() {
    const w = cont.clientWidth || 400, h = cont.clientHeight || 400;
    renderer.setSize(w, h, false);
    capaEt.setSize(w, h);
    const antes = camara.aspect;
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
    if (Math.abs(antes - camara.aspect) > 0.05) encuadrar();
  }
  new ResizeObserver(tamaño).observe(cont);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', construir);
  estado.suscribir(construir);
  estado.suscribirSeleccion(construir);
  construir();
  tamaño();
  const t0 = performance.now();
  let cuadro = 0;
  /** rótulos 3D: si dos se pisan en pantalla, se oculta el de menor prioridad (cotas y punto de giro primero) */
  const PRIORIDAD: Record<string, number> = { cota: 6, giro: 6, cr: 5, delta: 4, pieza: 3, nivel: 2, eje: 1 };
  function ordenarRotulos() {
    const es = [...capaEt.domElement.querySelectorAll<HTMLElement>('.et3d')].filter(e => e.style.display !== 'none');
    const prio = (e: HTMLElement) => Math.max(0, ...[...e.classList].map(c => PRIORIDAD[c] ?? 0));
    es.sort((a, b) => prio(b) - prio(a));
    const puestos: DOMRect[] = [];
    es.forEach(e => {
      e.style.visibility = 'visible';
      const r = e.getBoundingClientRect();
      const choca = puestos.some(q => r.left < q.right - 1 && r.right > q.left + 1 && r.top < q.bottom - 1 && r.bottom > q.top + 1);
      if (choca) e.style.visibility = 'hidden'; else puestos.push(r);
    });
  }
  let animando = false;
  renderer.setAnimationLoop(() => {
    if (!cont.isConnected) return;
    // ráfaga: la deformada va y vuelve entre la torre quieta y la exageración elegida
    if (roto && estado.roto3d.animar) { animando = true; mover(fMax * (0.5 - 0.5 * Math.cos(((performance.now() - t0) / 2600) * 2 * Math.PI))); }
    else if (animando) { animando = false; mover(fMax); }
    controles.update();
    renderer.render(escena, camara);
    if (op.etiquetas) { capaEt.render(escena, camara); if (++cuadro % 6 === 0) ordenarRotulos(); }
  });
  return { construir, encuadrar, tamaño };
}
