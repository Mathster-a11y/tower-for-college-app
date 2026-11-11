/**
 * Vista 3D de la torre: losas de cada nivel, muros del contraviento con el color de su papel y el viento.
 * Con «deformada» muestra la rototraslación exagerada: cada nivel se corre δ(z) en el sentido del viento y gira
 * θ(z) alrededor del centro de rigidez CR (ver rototraslacion3D en el motor). Cada muro se arma como un prisma con
 * un anillo en cada nivel, así se dobla y se revira piso por piso; la torre sin deformar queda en línea de trazos.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { estado, COLORES, fmt } from './estado';
import { entraEnCalculo, rectangulos, tipoDe } from '../engine/modelo';
import { desplazar, movimientoEn, type Rototraslacion3D } from '../engine/diagramas';

type P2 = { x: number; y: number };
const css = (v: string, def: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || def;

/** Exageración «redonda» (1, 2, 5 × 10ⁿ) para que la azotea se corra cerca de un sexto del ancho de la planta. */
export function exageracionAuto(r: Rototraslacion3D, B: number, L: number): number {
  const rmax = Math.hypot(B / 2 + Math.abs(r.cr.x), L / 2 + Math.abs(r.cr.y));
  const mov = Math.max(...r.niveles.map(n => Math.abs(n.d) + Math.abs(n.th) * rmax), 1e-12);
  const f = (0.16 * Math.max(B, L)) / mov;
  const p = 10 ** Math.floor(Math.log10(f));
  return [5, 2, 1].map(k => k * p).find(v => v <= f) ?? p;
}

/**
 * Prisma deformable: una planta (polígono) repetida en varias cotas. Las posiciones se recalculan con mover()
 * sin rehacer la geometría (sirve para animar).
 */
class Prisma {
  malla: THREE.Mesh; bordes: THREE.LineSegments; conBordes = true;
  private base: number[] = []; private baseB: number[] = [];
  constructor(pol: P2[], zs: number[], mat: THREE.Material, matB: THREE.LineBasicMaterial, private zMover?: number) {
    const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => this.base.push(...a, ...b, ...c);
    const n = pol.length;
    for (let k = 0; k + 1 < zs.length; k++) for (let i = 0; i < n; i++) {
      const p = pol[i], q = pol[(i + 1) % n], z0 = zs[k], z1 = zs[k + 1];
      tri([p.x, p.y, z0], [q.x, q.y, z0], [q.x, q.y, z1]);
      tri([p.x, p.y, z0], [q.x, q.y, z1], [p.x, p.y, z1]);
    }
    for (const [z, arriba] of [[zs[0], false], [zs[zs.length - 1], true]] as const) for (let i = 1; i + 1 < n; i++) {
      const a: [number, number, number] = [pol[0].x, pol[0].y, z], b: [number, number, number] = [pol[i].x, pol[i].y, z], c: [number, number, number] = [pol[i + 1].x, pol[i + 1].y, z];
      if (arriba) tri(a, c, b); else tri(a, b, c);
    }
    // bordes: contorno arriba y abajo y, si es un rectángulo, las aristas verticales piso por piso
    const seg = (a: number[], b: number[]) => this.baseB.push(...a, ...b);
    for (const z of [zs[0], zs[zs.length - 1]]) for (let i = 0; i < n; i++) seg([pol[i].x, pol[i].y, z], [pol[(i + 1) % n].x, pol[(i + 1) % n].y, z]);
    if (n <= 8) for (let k = 0; k + 1 < zs.length; k++) for (const p of pol) seg([p.x, p.y, zs[k]], [p.x, p.y, zs[k + 1]]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.base.length), 3));
    const gb = new THREE.BufferGeometry();
    gb.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.baseB.length), 3));
    this.malla = new THREE.Mesh(g, mat);
    this.bordes = new THREE.LineSegments(gb, matB);
  }
  /** planta (x, y) y cota z → three (x, z, −y), con el movimiento de cada cota multiplicado por f */
  mover(r: Rototraslacion3D | null, f: number) {
    const poner = (src: number[], attr: THREE.BufferAttribute) => {
      const a = attr.array as Float32Array;
      for (let i = 0; i < src.length; i += 3) {
        const q = r && f ? desplazar(r, src[i], src[i + 1], this.zMover ?? src[i + 2], f) : { x: src[i], y: src[i + 1] };
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
}

export function montar3D(cont: HTMLElement, op: Opciones3D) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  cont.appendChild(renderer.domElement);
  const info = document.createElement('div');
  info.className = 'info3d';
  info.hidden = true;
  cont.appendChild(info);
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
  let fMax = 0;

  function fondo() { escena.background = new THREE.Color(css('--lienzo', '#ffffff')); }

  function construir() {
    if (!cont.isConnected) return;
    fondo();
    grupo.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); });
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
    const cotas = p.niveles.map(n => n.cota).sort((a, b) => a - b);
    const tinta = new THREE.LineBasicMaterial({ color: new THREE.Color(css('--ink2', '#556')), transparent: true, opacity: 0.55 });
    // losas
    const matLosa = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, transparent: true, opacity: def ? 0.4 : 0.55, roughness: 0.9, side: THREE.DoubleSide });
    const matSub = new THREE.MeshStandardMaterial({ color: 0xb9c0c6, transparent: true, opacity: 0.45, roughness: 0.9, side: THREE.DoubleSide });
    let Bn = 0, Ln = 0;
    p.niveles.forEach(n => {
      Bn = n.B ?? Bn; Ln = n.L ?? Ln;
      if (!estado.capas.losas) return;
      const pol = [{ x: -Bn / 2, y: -Ln / 2 }, { x: Bn / 2, y: -Ln / 2 }, { x: Bn / 2, y: Ln / 2 }, { x: -Bn / 2, y: Ln / 2 }];
      prismas.push(new Prisma(pol, [n.cota - 0.2, n.cota], n.cota < 0 ? matSub : matLosa, new THREE.LineBasicMaterial({ color: 0x7d8a94 }), n.cota));
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
      const color = new THREE.Color(COLORES[papel] === '#FFFFFF' ? '#d9d9d9' : COLORES[papel]);
      const entra = entraEnCalculo(m, fondoCota, top);
      if (!entra && !estado.capas.fuera) return;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, transparent: !entra, opacity: entra ? 1 : 0.4, flatShading: true,
        emissive: estado.seleccion === m.id ? new THREE.Color(0x1f6f8b) : new THREE.Color(0x000000), emissiveIntensity: 0.6 });
      const z0 = Math.max(fondoCota, m.zDesde ?? fondoCota), z1 = Math.min(top, m.zHasta ?? top);
      if (z1 - z0 <= 0) return;
      const zs = [z0, ...cotas.filter(z => z > z0 + 1e-6 && z < z1 - 1e-6), z1];
      const pols: P2[][] = tipoDe(m) === 'tubo-circ'
        ? [Array.from({ length: 28 }, (_, i) => ({ x: m.x + (m.largo / 2) * Math.cos((i / 28) * 2 * Math.PI), y: m.y + (m.largo / 2) * Math.sin((i / 28) * 2 * Math.PI) }))]
        : rectangulos(m).map(r => [{ x: r.x - r.ax / 2, y: r.y - r.ay / 2 }, { x: r.x + r.ax / 2, y: r.y - r.ay / 2 }, { x: r.x + r.ax / 2, y: r.y + r.ay / 2 }, { x: r.x - r.ax / 2, y: r.y + r.ay / 2 }]);
      pols.forEach(pol => { const pr = new Prisma(pol, zs, mat, tinta); pr.conBordes = def; prismas.push(pr); });
    });
    prismas.forEach(pr => { grupo.add(pr.malla); if (pr.conBordes) grupo.add(pr.bordes); });
    // viento
    const largo = 8;
    const dirV = estado.dir === 'A' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(1, 0, 0);
    const origen = estado.dir === 'A' ? new THREE.Vector3(0, top * 0.6, L / 2 + largo + 3) : new THREE.Vector3(-B / 2 - largo - 3, top * 0.6, 0);
    if (estado.capas.viento) grupo.add(new THREE.ArrowHelper(dirV, origen, largo, new THREE.Color(css('--carga', '#e07b00')).getHex(), 2.5, 1.6));
    if (roto) agregarRoto(roto, B, L, top, fondoCota, cotas);
    mover(fMax);
    // la cámara se vuelve a encuadrar cuando cambia el tamaño de la torre (no al mover un muro)
    const clave = [B, L, top, fondoCota].map(v => v.toFixed(1)).join('|') + (roto ? estado.dir : '');
    medidas = { B, L, h, top, fondoCota };
    if (clave !== encuadre) { encuadrar(); encuadre = clave; }
    rotular();
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
    const eje0 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(r.cr.x, z0, -r.cr.y), new THREE.Vector3(r.cr.x, top + 2, -r.cr.y)]), new THREE.LineDashedMaterial({ color: cEle, dashSize: 0.6, gapSize: 0.5 }));
    eje0.computeLineDistances();
    grupo.add(eje0);
    const zsE = [...cotas.filter(z => z >= z0), top + 2];
    const gE = new THREE.BufferGeometry().setFromPoints(zsE.map(z => new THREE.Vector3(r.cr.x, z, -r.cr.y)));
    const ejeD = new THREE.Line(gE, new THREE.LineBasicMaterial({ color: cEle }));
    grupo.add(ejeD);
    extras.push({ mover: f => {
      const a = gE.getAttribute('position') as THREE.BufferAttribute;
      zsE.forEach((z, i) => { const q = desplazar(r, r.cr.x, r.cr.y, Math.min(z, top), f); a.setXYZ(i, q.x, z, -q.y); });
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
        const q = desplazar(r, r.cr.x, r.cr.y, top, f);
        arco.position.set(q.x, top + 1.2, -q.y);
        arco.rotation.y = movimientoEn(r, top).th * f;
        arco.visible = f > 0;
      } });
    }
  }

  function mover(f: number) {
    prismas.forEach(pr => pr.mover(roto, f));
    extras.forEach(x => x.mover(f));
  }

  function rotular() {
    info.hidden = !(op.rotulo && roto);
    if (!roto || info.hidden) return;
    const giro = Math.abs(roto.thTop);
    info.innerHTML = `<b>Deformada × ${fmt(fMax, 0)}</b><br>azotea: δ = ${fmt(roto.dTop * 1000, 1)} mm` +
      (giro > 1e-12 ? ` · giro ${fmt(giro * 1e3, 3)} ‰ rad (${roto.thTop < 0 ? 'horario' : 'antihorario'})` : ' · sin giro (solo traslación)');
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
  let animando = false;
  renderer.setAnimationLoop(() => {
    if (!cont.isConnected) return;
    // ráfaga: la deformada va y vuelve entre la torre quieta y la exageración elegida
    if (roto && estado.roto3d.animar) { animando = true; mover(fMax * (0.5 - 0.5 * Math.cos(((performance.now() - t0) / 2600) * 2 * Math.PI))); }
    else if (animando) { animando = false; mover(fMax); }
    controles.update();
    renderer.render(escena, camara);
  });
  return { construir, encuadrar, tamaño };
}
