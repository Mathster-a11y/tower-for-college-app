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
import { cambiosDeEspesor, entraEnCalculo, huecoEn, muroEn, rectangulos, tipoDe } from '../engine/modelo';
import { enPlanta, polilinea } from '../engine/perfil';
import { desplazar, movimientoEn, type Rototraslacion3D } from '../engine/diagramas';
import { carpinteriaDeNivel, plantaDeNivel, puntosSilueta } from '../engine/silueta';
import { datosExo, momentoTabiques } from './exo';
import { nivelesOutrigger } from '../engine/exo';
import { diagridCircular, radioEn, type DiagridCircular } from '../engine/diagridCircular';
import { fibrasDireccion, peorFibraPorMuro } from '../engine/fibras';
import { prismasCalados, solidosEnAltura } from '../engine/aberturas';
import { TENSION_ADM } from '../engine/verificaciones';
import { capaPresiones, leyendaPresiones } from './presiones3d';

type P2 = { x: number; y: number };
const css = (v: string, def: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || def;

export { movMaximo, ultimaDeformada, exageracionAuto, giroExtraAuto } from './deformadaAuto';
import { movMaximo, ultimaDeformada, exageracionAuto, giroExtraAuto } from './deformadaAuto';

/** el corrimiento (dx, dy) del nivel que contiene la altura z: el de cota más alta que no pasa z (0 sin perfil) */
let corrimientoActual: (z: number) => P2 = () => ({ x: 0, y: 0 });
function corrimientoDe(p: { niveles: { cota: number; dx?: number | null; dy?: number | null }[] }): (z: number) => P2 {
  const ns = [...p.niveles].sort((a, b) => a.cota - b.cota);
  if (!ns.some(n => n.dx || n.dy)) return () => ({ x: 0, y: 0 });
  return z => { let r = { x: 0, y: 0 }; for (const n of ns) if (n.cota <= z + 1e-6) r = { x: n.dx ?? 0, y: n.dy ?? 0 }; return r; };
}
/**
 * Prisma deformable: una planta (polígono) repetida en varias cotas. Las posiciones se recalculan con mover()
 * sin rehacer la geometría (sirve para animar).
 */
class Prisma {
  malla: THREE.Mesh; bordes: THREE.LineSegments; conBordes = true;
  private base: number[] = []; private baseB: number[] = [];
  constructor(pol: P2[], zs: number[], mat: THREE.Material, matB: THREE.LineBasicMaterial, private zMover?: number, huecos: P2[][] = [], corr: (z: number) => P2 = corrimientoActual) {
    // torre con perfil (Diseño → Perfil): cada tramo se corre lo que se corre su nivel respecto de PB
    const cs = zs.slice(0, -1).map((z, k) => corr((z + zs[k + 1]) / 2));
    const csz = (z: number) => corr(z === zs[0] ? (zs[0] + zs[1]) / 2 : (zs[zs.length - 2] + zs[zs.length - 1]) / 2);
    let dk: P2 = { x: 0, y: 0 };
    const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => this.base.push(a[0] + dk.x, a[1] + dk.y, a[2], b[0] + dk.x, b[1] + dk.y, b[2], c[0] + dk.x, c[1] + dk.y, c[2]);
    const n = pol.length;
    for (const anillo of [pol, ...huecos]) for (let k = 0; k + 1 < zs.length; k++) for (let i = 0; i < anillo.length; i++) {
      const p = anillo[i], q = anillo[(i + 1) % anillo.length], z0 = zs[k], z1 = zs[k + 1];
      dk = cs[k];
      tri([p.x, p.y, z0], [q.x, q.y, z0], [q.x, q.y, z1]);
      tri([p.x, p.y, z0], [q.x, q.y, z1], [p.x, p.y, z1]);
    }
    // tapas: triangulación que sirve también para contornos cóncavos (siluetas en L, con arcos, etc.) y con huecos
    const todos = [...pol, ...huecos.flat()];
    const tris = n <= 4 && !huecos.length ? Array.from({ length: n - 2 }, (_, i) => [0, i + 1, i + 2]) : THREE.ShapeUtils.triangulateShape(pol.map(p => new THREE.Vector2(p.x, p.y)), huecos.map(h => h.map(p => new THREE.Vector2(p.x, p.y))));
    const horario = THREE.ShapeUtils.isClockWise(pol.map(p => new THREE.Vector2(p.x, p.y)));
    for (const [z, arriba] of [[zs[0], false], [zs[zs.length - 1], true]] as const) { dk = csz(z); tris.forEach(([i0, i1, i2]) => {
      const a: [number, number, number] = [todos[i0].x, todos[i0].y, z], b: [number, number, number] = [todos[i1].x, todos[i1].y, z], c: [number, number, number] = [todos[i2].x, todos[i2].y, z];
      if (arriba !== horario) tri(a, c, b); else tri(a, b, c);
    }); }
    // bordes: contorno arriba y abajo y, si es un rectángulo, las aristas verticales piso por piso
    const seg = (a: number[], b: number[]) => this.baseB.push(a[0] + dk.x, a[1] + dk.y, a[2], b[0] + dk.x, b[1] + dk.y, b[2]);
    for (const anillo of [pol, ...huecos]) for (const z of [zs[0], zs[zs.length - 1]]) for (let i = 0; i < anillo.length && ((dk = csz(z)), true); i++) seg([anillo[i].x, anillo[i].y, z], [anillo[(i + 1) % anillo.length].x, anillo[(i + 1) % anillo.length].y, z]);
    if (n <= 8) for (let k = 0; k + 1 < zs.length; k++) for (const p of pol) (dk = cs[k]), seg([p.x, p.y, zs[k]], [p.x, p.y, zs[k + 1]]);
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
  // leyenda de la capa de tensiones (abajo a la izquierda)
  const leyT = document.createElement('div');
  leyT.className = 'leyenda-tensiones3d';
  leyT.hidden = true;
  cont.appendChild(leyT);
  // leyenda de las presiones del viento (botón «p»), con los casos de carga para elegir
  const leyP = document.createElement('div');
  leyP.className = 'leyenda-presiones3d';
  leyP.hidden = true;
  cont.appendChild(leyP);
  const capaEt = new CSS2DRenderer();
  capaEt.domElement.className = 'etiquetas3d';
  if (op.etiquetas) cont.appendChild(capaEt.domElement);
  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
  const controles = new OrbitControls(camara, renderer.domElement);
  let hayQueDibujar = true;
  function pedirCuadro() { hayQueDibujar = true; }
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

  /** tensiones de la peor fibra de cada muro piso a piso y un material por color (escala simétrica en ± el mayor |σ|) */
  function mapaTensiones() {
    const { asig, corr } = estado.calculo, p = estado.proyecto;
    if (!asig || !corr) return null;
    const adm = TENSION_ADM(p.hormigon || 'H30');
    let fs;
    try { fs = fibrasDireccion(p, asig.piezas, corr, asig.filaNivel, estado.dir, adm, momentoTabiques(estado.dir)); } catch { return null; }
    const porMuro = peorFibraPorMuro(fs);
    if (!porMuro.size) return null;
    const todas = [...porMuro.values()].flat().map(x => x.sigma);
    // una escala por signo: la compresión llega a su máximo y la tracción al suyo (si no, la tracción casi no se ve)
    const maxC = Math.max(1, ...todas.map(x => -x)), maxT = Math.max(0, ...todas);
    const neutro = new THREE.Color(css('--tension-0', '#eceef0')), cTr = new THREE.Color(css('--traccion', '#e24b4a')), cCo = new THREE.Color(css('--compresion', '#378add'));
    const cache = new Map<string, THREE.MeshStandardMaterial>();
    const material = (sigma: number | null, sel: boolean) => {
      // 10 escalones por lado; el primero ya se distingue del gris de los muros que no toman este viento
      const paso = sigma === null ? 0 : sigma > 0 ? Math.max(1, Math.round((sigma / (maxT || 1)) * 10)) : -Math.max(1, Math.round((-sigma / maxC) * 10));
      const k = (sigma === null ? 'n' : String(paso)) + (sel ? 's' : '');
      let m = cache.get(k);
      if (!m) {
        const t = sigma === null ? 0 : 0.15 + 0.85 * (Math.abs(paso) / 10);
        const c = neutro.clone().lerp(paso > 0 ? cTr : cCo, t);
        m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true, emissive: sel ? new THREE.Color(0x1f6f8b) : new THREE.Color(0), emissiveIntensity: 0.5 });
        cache.set(k, m);
      }
      return m;
    };
    return { porMuro, maxC, maxT, material, supera: todas.some(x => x < -adm) };
  }

  let construido = false, viejo = false;
  function construir() {
    if (!cont.isConnected) return;
    // modo con botón: con cambios sin calcular el 3D espera al botón «Calcular» (es lo que más recursos usa)
    if (estado.pendiente && construido) {
      if (!viejo) { viejo = true; cont.classList.add('vista-vieja'); }
      return;
    }
    construido = true; viejo = false; cont.classList.remove('vista-vieja');
    pedirCuadro();
    fondo();
    grupo.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); if (o instanceof CSS2DObject) o.element.remove(); });
    grupo.clear();
    prismas = []; extras = [];
    const p = estado.proyecto;
    if (!p.niveles.length) return;
    corrimientoActual = corrimientoDe(p);
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
      const dN = { x: n.dx ?? 0, y: n.dy ?? 0 };
      prismas.push(new Prisma(pol, [n.cota - 0.2, n.cota], n.cota < 0 ? matSub : matLosa, new THREE.LineBasicMaterial({ color: 0x7d8a94 }), n.cota, hs, () => dN));
    });
    // la carpintería (el cerramiento que ve el viento), si el proyecto la tiene: una piel de vidrio que une los contornos
    // de los niveles (cada uno a la mitad del tramo que cubre, como en el túnel); arriba cierra en el último nivel
    if (estado.capas.losas && !def && p.niveles.some(n => n.carpinteria && n.carpinteria.length >= 3)) {
      const niv = p.niveles.map((n, i) => ({ n, i })).filter(x => x.n.cota >= 0).sort((a, b) => a.n.cota - b.n.cota);
      const anillos = niv.map((x, k) => {
        const c = carpinteriaDeNivel(p, x.i)?.v ?? plantaDeNivel(p, x.i).silueta;
        const z = k + 1 < niv.length ? (x.n.cota + niv[k + 1].n.cota) / 2 : x.n.cota;
        return { z, pts: puntosSilueta(c, 16) };
      });
      anillos.unshift({ z: niv[0].n.cota, pts: anillos[0].pts });
      const iguales = anillos.every(a => a.pts.length === anillos[0].pts.length);
      if (iguales) {
        const nP = anillos[0].pts.length, pos: number[] = [], idx: number[] = [];
        anillos.forEach(a => a.pts.forEach(q => pos.push(q.x, a.z, -q.y)));
        for (let k = 0; k + 1 < anillos.length; k++) for (let j = 0; j < nP; j++) {
          const a = k * nP + j, b = k * nP + ((j + 1) % nP), c2 = (k + 1) * nP + j, d2 = (k + 1) * nP + ((j + 1) % nP);
          idx.push(a, b, d2, a, d2, c2);
        }
        const gV = new THREE.BufferGeometry();
        gV.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gV.setIndex(idx); gV.computeVertexNormals();
        const vidrio = new THREE.Mesh(gV, new THREE.MeshStandardMaterial({ color: 0x8fb3cc, transparent: true, opacity: 0.16, roughness: 0.15, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
        vidrio.renderOrder = 2;
        grupo.add(vidrio);
      }
    }
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
    // capa de tensiones: cada muro de las piezas del viento, piso por piso, con su peor fibra
    // también sobre la deformada: cada piso de cada muro, del color de su peor fibra, se mueve con la torre
    const tens = estado.capas.tensiones ? mapaTensiones() : null;
    leyT.hidden = !tens;
    leyT.classList.toggle('arriba', !!roto);            // con la deformada, abajo a la izquierda va el recuadro del giro
    if (tens) leyT.innerHTML = `<b>Peor fibra de cada piso · viento ${estado.dir}</b><div class="escala"><span>−${fmt(tens.maxC, 0)}</span><i class="c"></i><span>0</span>${tens.maxT > 0 ? `<i class="t"></i><span>+${fmt(tens.maxT, 1)}</span>` : ''}</div><small>${roto ? 'sobre la deformada exagerada · ' : ''}kg/cm² · compresión con sobrecarga${tens.maxT > 0 ? ' · tracción sin sobrecarga' : ' · no hay tracción'} · gris: no toma este viento${tens.supera ? ' · <b>⚠ supera σbk</b>' : ''}</small>`;
    p.muros.forEach(m => {
      const papel = papeles[m.id]?.[estado.dir] ?? 'sin pieza';
      const porPiso = tens?.porMuro.get(m.id);
      if (porPiso && porPiso.length) {
        // un prisma por piso, del color de su tensión (el muro de los subsuelos y el de arriba de la azotea quedan grises)
        const z0 = Math.max(fondoCota, m.zDesde ?? fondoCota), z1 = Math.min(top, m.zHasta ?? top);
        const zs = [z0, ...cotas.filter(z => z > z0 + 1e-6 && z < z1 - 1e-6), ...cambiosDeEspesor(m, z0, z1), z1].sort((a, b) => a - b).filter((z, i, a) => i === 0 || z - a[i - 1] > 1e-6);
        for (let k = 0; k + 1 < zs.length; k++) {
          const za = zs[k], zb = zs[k + 1], mm = muroEn(m, (za + zb) / 2);
          const f = [...porPiso].reverse().find(x => x.z <= za + 1e-6);
          const mat = tens!.material(f ? f.sigma : null, estado.seleccion === m.id);
          const pols: P2[][] = tipoDe(mm) === 'perfil' ? [polilinea(enPlanta(mm).v, 6, 16)] : tipoDe(mm) === 'tubo-circ'
            ? [Array.from({ length: 28 }, (_, i) => ({ x: mm.x + (mm.largo / 2) * Math.cos((i / 28) * 2 * Math.PI), y: mm.y + (mm.largo / 2) * Math.sin((i / 28) * 2 * Math.PI) }))]
            : rectangulos(mm).map(r => [{ x: r.x - r.ax / 2, y: r.y - r.ay / 2 }, { x: r.x + r.ax / 2, y: r.y - r.ay / 2 }, { x: r.x + r.ax / 2, y: r.y + r.ay / 2 }, { x: r.x - r.ax / 2, y: r.y + r.ay / 2 }]);
          const hs = tipoDe(mm) === 'perfil' ? (enPlanta(mm).huecos ?? []).map(hh => polilinea(hh, 6, 16)) : [];
          pols.forEach(pol => { const pr = new Prisma(pol, [za, zb], mat, tinta, undefined, hs); pr.conBordes = true; prismas.push(pr); });
        }
        return;
      }
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
      // con puertas o ventanas: piso por piso, el elemento con sus huecos, el antepecho abajo y el dintel arriba
      if (m.aberturas?.length) {
        const pisos = [z0, ...zs.filter(z => z > z0 + 1e-6 && z < z1 - 1e-6), z1];
        for (let k = 0; k + 1 < pisos.length; k++) {
          const za = pisos[k], zb = pisos[k + 1], mm = muroEn(m, (za + zb) / 2);
          // debajo de PB (subsuelos) el elemento va entero
          const trozos = za >= 0 ? prismasCalados(mm, za, zb) : [];
          if (trozos.length) trozos.forEach(t => { const pr = new Prisma(t.pol, [t.za, t.zb], mat, tinta); pr.conBordes = true; prismas.push(pr); });
          else solidosEnAltura({ ...mm, aberturas: null }, 0).forEach(pol => { const pr = new Prisma(pol, [za, zb], mat, tinta); pr.conBordes = def; prismas.push(pr); });
        }
        return;
      }
      // con espesor por tramos, un prisma por tramo (el muro se afina en altura)
      const cortes = [z0, ...cambiosDeEspesor(m, z0, z1), z1];
      for (let k = 0; k + 1 < cortes.length; k++) {
        const za = cortes[k], zb = cortes[k + 1], mm = muroEn(m, (za + zb) / 2);
        const zsT = [za, ...zs.filter(z => z > za + 1e-6 && z < zb - 1e-6), zb];
        const pols: P2[][] = tipoDe(mm) === 'tubo-circ'
          ? [Array.from({ length: 28 }, (_, i) => ({ x: mm.x + (mm.largo / 2) * Math.cos((i / 28) * 2 * Math.PI), y: mm.y + (mm.largo / 2) * Math.sin((i / 28) * 2 * Math.PI) }))]
          : rectangulos(mm).map(r => [{ x: r.x - r.ax / 2, y: r.y - r.ay / 2 }, { x: r.x + r.ax / 2, y: r.y - r.ay / 2 }, { x: r.x + r.ax / 2, y: r.y + r.ay / 2 }, { x: r.x - r.ax / 2, y: r.y + r.ay / 2 }]);
        pols.forEach(pol => { const pr = new Prisma(pol, zsT, mat, tinta); pr.conBordes = def || cortes.length > 2; prismas.push(pr); });
      }
    });
    if (espectro && roto) {
      // el mayor corrimiento real de la torre: el de la esquina más alejada del CR en la azotea
      const maximo = Math.max(movMaximo(roto, B, L), 1e-12);
      const blanco = new THREE.Color(0xffffff), verde = new THREE.Color(css('--deformada', '#1d9e75'));
      prismas.forEach(pr => { if (!(pr.malla.material as THREE.MeshStandardMaterial).vertexColors) return; pr.colorear(roto!, maximo, blanco, verde); });
    }
    prismas.forEach(pr => { grupo.add(pr.malla); if (pr.conBordes) grupo.add(pr.bordes); });
    // presiones del viento sobre las fachadas (simulador de viento, etapa V1): sin la deformada
    const pres = estado.capas.presiones && !roto ? capaPresiones() : null;
    leyP.hidden = !pres;
    leyP.classList.add('arriba');                       // arriba: abajo quedan el corte y la base, y la leyenda de σ
    if (pres) { pres.objetos.forEach(o => grupo.add(o)); leyendaPresiones(leyP, pres); }
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
  /**
   * diagrid circular (30 St Mary Axe): las barras sobre la fachada real. El color es el esfuerzo de un tubo de n barras
   * con el momento que toma el exo en esa altura (rojo tracción del lado del viento, azul compresión del otro) más el
   * peso de las losas que apoyan en él; es la lectura del cálculo con caras planas, repartida en la vuelta.
   */
  function agregarExoCircular(dc: DiagridCircular) {
    const d = datosExo(estado.dir);
    const acero = new THREE.Color(css('--ink2', '#6b7480')), cT = new THREE.Color(css('--traccion', '#e24b4a')), cC = new THREE.Color(css('--compresion', '#378add'));
    const eje = new THREE.Vector3(0, 1, 0);
    const def = estado.proyecto.exo!;
    const interp = (vs: number[], zs: number[], z: number) => { const k = zs.findIndex(q => q >= z - 1e-9); return k <= 0 ? vs[Math.max(0, k)] ?? 0 : vs[k - 1] + ((vs[k] - vs[k - 1]) * (z - zs[k - 1])) / (zs[k] - zs[k - 1] || 1); };
    const Mexo = (z: number) => (d ? interp(d.r.Msin.map((m, k) => m - d.r.Mtab[k]), d.r.zs, z) : 0);
    // peso que baja por el diagrid: la franja de losa de cada piso que apoya en él, de arriba hasta z
    const franja = def.losas?.franja ?? 0, q = (def.losas?.qD ?? 0.7) + 0.5 * (def.losas?.qL ?? 0.2);
    const pesos = estado.proyecto.niveles.filter(n => n.cota > 0).map(n => { const R = radioEn(estado.proyecto, n.cota); return { z: n.cota, P: franja > 0 ? Math.PI * (R * R - Math.max(0, R - franja) ** 2) * q : 0 }; });
    const G = (z: number) => pesos.filter(x => x.z > z + 1e-6).reduce((a, x) => a + x.P, 0);
    const nMax = { v: 1e-9 };
    const esf = dc.barras.map(b => {
      if (b.clase !== 'diagonal') return 0;
      const zm = (b.a.z + b.b.z) / 2, R = radioEn(estado.proyecto, zm) || 1, L = Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y, b.b.z - b.a.z), sen = Math.abs(b.b.z - b.a.z) / (L || 1);
      // viento A hacia +y: del lado y < 0 tracciona; viento B hacia +x: del lado x < 0
      const s = estado.dir === 'A' ? -Math.sin(b.th) : -Math.cos(b.th);
      const N = ((Mexo(zm) * s) / (dc.n * R) - G(zm) / (2 * dc.n)) / (sen || 1);
      nMax.v = Math.max(nMax.v, Math.abs(N));
      return N;
    });
    const matAnillo = new THREE.MeshStandardMaterial({ color: acero, roughness: 0.45, metalness: 0.3 });
    const rd = Math.max(0.15, Math.min(0.35, (def.diagonal?.b ?? 0.4) * 0.6)), ra = Math.max(0.12, Math.min(0.3, (def.viga?.b ?? 0.3) * 0.5));
    dc.barras.forEach((b, i) => {
      const A = new THREE.Vector3(b.a.x, b.a.z, -b.a.y), Bv = new THREE.Vector3(b.b.x, b.b.z, -b.b.y), L = A.distanceTo(Bv);
      if (L < 1e-6) return;
      const mat = b.clase === 'anillo' ? matAnillo : new THREE.MeshStandardMaterial({ color: acero.clone().lerp(esf[i] >= 0 ? cT : cC, 0.35 + 0.65 * Math.min(1, Math.abs(esf[i]) / nMax.v)), roughness: 0.45, metalness: 0.3 });
      const m = new THREE.Mesh(new THREE.CylinderGeometry(b.clase === 'anillo' ? ra : rd, b.clase === 'anillo' ? ra : rd, L, 6), mat);
      m.position.copy(A.clone().add(Bv).multiplyScalar(0.5));
      m.quaternion.setFromUnitVectors(eje, Bv.clone().sub(A).normalize());
      grupo.add(m);
    });
  }

  function agregarExo() {
    const dc = diagridCircular(estado.proyecto);
    if (dc) { agregarExoCircular(dc); return; }
    const caras = (['A', 'B'] as const).map(dir => ({ dir, d: datosExo(dir) }));
    // N > 0 tracción (rojo, --traccion) y N < 0 compresión (azul, --compresion), como en el alzado de la etapa 08
    const acero = new THREE.Color(css('--ink2', '#6b7480')), cT = new THREE.Color(css('--traccion', '#e24b4a')), cC = new THREE.Color(css('--compresion', '#378add'));
    const radio = { columna: 0.32, diagonal: 0.2, viga: 0.24 } as const;
    const eje = new THREE.Vector3(0, 1, 0);
    caras.forEach(({ dir, d }) => {
      if (!d) return;
      const activa = dir === estado.dir;
      const Nmax = Math.max(...d.r.caras[0].esfuerzos.map(e => Math.abs(e.N)), 1e-9);
      // viento A: las caras van en x = ±t y la cara corre a lo largo de y; viento B: en y = ±t, a lo largo de x
      const aPlanta = (s2: number, t: number) => (dir === 'A' ? { x: t, y: s2 } : { x: s2, y: t });
      d.r.caras.forEach(c => c.esfuerzos.forEach(e => {
        if (e.nucleo) return;                               // ficha F: el núcleo ya está (son los tabiques)
        if ((e.fraccion ?? 1) !== 1 && d.def.tipo !== 'F') return;   // las alas son los mástiles de las otras caras: se dibujan con ellas
        // caras que siguen la planta (Hancock): la cara se mete hacia adentro con la altura
        const interp = (vs: number[], z: number) => {
          const zs = d.r.zs, k = zs.findIndex(zz => zz >= z - 1e-9);
          return k <= 0 ? vs[Math.max(0, k)] : vs[k - 1] + (vs[k] - vs[k - 1]) * ((z - zs[k - 1]) / (zs[k] - zs[k - 1] || 1));
        };
        // torre inclinada: la cara también se corre de costado con su nivel (tc)
        const tEn = (z: number) => (d.ts ? Math.sign(c.t) * interp(d.ts, z) : c.t) + (d.tc ? interp(d.tc, z) : 0);
        const pa = aPlanta(e.a.s, tEn(e.a.z)), pb = aPlanta(e.b.s, tEn(e.b.z));
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
    // ficha F: el cinturón, un anillo por el perímetro arriba y abajo de cada brazo
    const dA = caras[0].d, dB = caras[1].d;
    if (dA && dB && dA.def.tipo === 'F' && dA.def.cinturon !== false) {
      const hy = dA.ancho / 2, hx = dB.ancho / 2;
      const mat = new THREE.MeshStandardMaterial({ color: acero, roughness: 0.45, metalness: 0.3 });
      const tubo = (a: THREE.Vector3, b: THREE.Vector3) => { const L = a.distanceTo(b); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, L, 8), mat); m.position.copy(a.clone().add(b).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(eje, b.clone().sub(a).normalize()); grupo.add(m); };
      nivelesOutrigger(dA.def, dA.r.zs).forEach(k => [dA.r.zs[k], dA.r.zs[k - 1]].forEach(z => {
        const p = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([x, y]) => new THREE.Vector3(x, z, -y));
        p.forEach((q, i) => tubo(q, p[(i + 1) % 4]));
      }));
    }
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

  /** etiqueta pegada a un punto 3D. El texto va siempre como texto (los nombres vienen del proyecto: nunca como HTML) */
  function etiqueta(texto: string | (string | Node)[], clase: string, globo?: string): CSS2DObject {
    const e = document.createElement('div');
    e.className = `et3d ${clase}`;
    e.append(...(Array.isArray(texto) ? texto : [texto]));
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
      const cotaN = document.createElement('span'); cotaN.textContent = `${n.cota > 0 ? '+' : ''}${fmt(n.cota)}`;
      etiqueta([`${n.nombre} `, cotaN], 'nivel').position.copy(pt.add(A ? new THREE.Vector3(0, 0, 1.4) : new THREE.Vector3(-1.4, 0, 0)));
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
    pedirCuadro();
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
    pedirCuadro();
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
    pedirCuadro();
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
  // se dibuja solo cuando hace falta: la cámara se movió (o sigue frenando), algo pidió un cuadro, hay animación, o
  // pasó un segundo (refresco de seguridad). Antes se dibujaba 60 veces por segundo aunque nada cambiara.
  let ultimoCuadro = 0;
  controles.addEventListener('change', pedirCuadro);
  renderer.setAnimationLoop(() => {
    if (!cont.isConnected) return;
    // ráfaga: la deformada va y vuelve entre la torre quieta y la exageración elegida
    if (roto && estado.roto3d.animar) { animando = true; mover(fMax * (0.5 - 0.5 * Math.cos(((performance.now() - t0) / 2600) * 2 * Math.PI))); }
    else if (animando) { animando = false; mover(fMax); }
    const movio = controles.update();
    const ahora = performance.now();
    if (!(movio || hayQueDibujar || animando || ahora - ultimoCuadro > 1000)) return;
    hayQueDibujar = false; ultimoCuadro = ahora;
    renderer.render(escena, camara);
    if (op.etiquetas) { capaEt.render(escena, camara); if (++cuadro % 6 === 0 || !movio) ordenarRotulos(); }
  });
  return { construir, encuadrar, tamaño };
}
