/**
 * Cómo se ve el 3D en la etapa «Vista 3D»: el estilo (sombreado, transparente, alambre, texturado, render y render
 * parcial), los cortes en planta y en alzado (con el relleno de lo cortado, como en un plano de obra) y el punto de vista
 * de las cámaras (perspectiva o paralela; isométrica, dimétrica, trimétrica, planta, frente y laterales).
 *
 * Se aplica sobre el modelo ya armado (vista3d.ts lo llama al final de cada construcción): clona los materiales, no
 * cambia nada del proyecto ni del cálculo.
 *
 * Coordenadas de three: x = x de la planta, y = altura, z = −y de la planta.
 */
import * as THREE from 'three';
import { estado } from './estado';
import { muroEn, presenteEn, type Proyecto } from '../engine/modelo';
import { huellaMuro } from '../engine/seccionPieza';
import { plantaDeNivel } from '../engine/silueta';
import { discretizarCurva } from '../engine/curvas';

export type Estilo3D = 'sombreado' | 'transparente' | 'alambre' | 'texturado' | 'render';
export type Vista3D = 'libre' | 'iso' | 'dimetrica' | 'trimetrica' | 'planta' | 'frente' | 'contrafrente' | 'izquierda' | 'derecha';
export interface Presentacion3D {
  estilo: Estilo3D;
  proyeccion: 'perspectiva' | 'paralela';
  vista: Vista3D;
  /** corte en planta (a la altura z, se ve lo de abajo) o en alzado (un plano vertical perpendicular a x o a y de la planta) */
  corte: { tipo: 'no' | 'planta' | 'alzado'; z: number; eje: 'x' | 'y'; pos: number; lado: 1 | -1 };
  /** render parcial: solo la franja de alturas [z0, z1] con el estilo elegido; el resto, transparente */
  parcial: { activo: boolean; z0: number; z1: number };
}

export const PRESENTACION_INICIAL: Presentacion3D = {
  estilo: 'sombreado', proyeccion: 'perspectiva', vista: 'libre',
  corte: { tipo: 'no', z: 1.2, eje: 'y', pos: 0, lado: -1 },
  parcial: { activo: false, z0: 0, z1: 10 },
};

/** dirección desde el centro de la torre hacia la cámara (en three), o null para la vista libre */
export function direccionVista(v: Vista3D): THREE.Vector3 | null {
  const dirAz = (az: number, el: number) => { const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180; return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)); };
  switch (v) {
    case 'iso': return new THREE.Vector3(1, 1, 1).normalize();                 // los tres ejes con el mismo ángulo (35,26°)
    case 'dimetrica': return dirAz(45, 20.7);                                   // dos ejes iguales
    case 'trimetrica': return dirAz(30, 25);                                    // los tres distintos
    case 'planta': return new THREE.Vector3(0, 1, 1e-4).normalize();            // desde arriba, el +y de la planta hacia arriba
    case 'frente': return new THREE.Vector3(0, 0, 1);                           // desde el −y de la planta (la cara del viento A)
    case 'contrafrente': return new THREE.Vector3(0, 0, -1);
    case 'izquierda': return new THREE.Vector3(-1, 0, 0);
    case 'derecha': return new THREE.Vector3(1, 0, 0);
    default: return null;
  }
}

// ------------------------------------------------------------------------------------------------ texturas
let texHormigon: THREE.CanvasTexture | null = null;
/** hormigón: un gris con grano y algunas juntas de encofrado (hecho en un canvas, sin archivos) */
function hormigon(): THREE.CanvasTexture {
  if (texHormigon) return texHormigon;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b9bcbd'; g.fillRect(0, 0, 256, 256);
  let s = 7;
  const azar = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 9000; i++) { const v = 150 + Math.floor(azar() * 70); g.fillStyle = `rgba(${v},${v},${v + 2},0.35)`; g.fillRect(azar() * 256, azar() * 256, 1 + azar() * 2, 1 + azar() * 2); }
  g.strokeStyle = 'rgba(110,112,114,0.35)'; g.lineWidth = 1;
  for (const y of [0.5, 128.5]) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  for (const x of [0.5, 128.5]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  texHormigon = new THREE.CanvasTexture(c);
  texHormigon.wrapS = texHormigon.wrapT = THREE.RepeatWrapping;
  texHormigon.colorSpace = THREE.SRGBColorSpace;
  return texHormigon;
}
/** coordenadas de textura por proyección según la normal de cada punto (una placa de encofrado cada 2,4 m) */
function uvCaja(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position');
  if (!pos) return;
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const nor = geo.getAttribute('normal'), uv = new Float32Array(pos.count * 2), k = 1 / 4.8;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const [u, v] = ny >= nx && ny >= nz ? [x, z] : nx >= nz ? [z, y] : [x, y];
    uv[2 * i] = u * k; uv[2 * i + 1] = v * k;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// ------------------------------------------------------------------------------------------------ cortes
const anillos = (rs: [number, number][][]) => rs.map(r => r.map(([x, y]) => new THREE.Vector2(x, y)));
/** relleno del corte en planta: la huella de cada muro que pasa por la altura z (poché, como en un plano) */
function rellenoPlanta(p: Proyecto, z: number, corr: (z: number) => { x: number; y: number }, mat: THREE.Material): THREE.Object3D {
  const zTop = p.niveles[0]?.cota ?? 0, zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0, d = corr(z);
  const g = new THREE.Group();
  p.muros.filter(m => presenteEn(m, z, zFund, zTop)).forEach(m => {
    const [ext, ...huecos] = anillos(huellaMuro(muroEn(m, z)) as [number, number][][]);
    if (!ext || ext.length < 3) return;
    const forma = new THREE.Shape(ext);
    huecos.forEach(hh => forma.holes.push(new THREE.Path(hh)));
    const ms = new THREE.Mesh(new THREE.ShapeGeometry(forma), mat);
    ms.rotation.x = -Math.PI / 2;                                       // (x, y, 0) → (x, 0, −y)
    ms.position.set(d.x, z - 0.004, -d.y);
    g.add(ms);
  });
  return g;
}
/** intervalos donde la recta (x = c o y = c de la planta) corta un polígono */
function cortesRecta(pol: { x: number; y: number }[], eje: 'x' | 'y', c: number): [number, number][] {
  const xs: number[] = [];
  for (let i = 0; i < pol.length; i++) {
    const a = pol[i], b = pol[(i + 1) % pol.length];
    const [ua, ub, va, vb] = eje === 'x' ? [a.x, b.x, a.y, b.y] : [a.y, b.y, a.x, b.x];
    if ((ua > c) !== (ub > c)) xs.push(va + ((c - ua) * (vb - va)) / (ub - ua));
  }
  xs.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}
/** relleno del corte en alzado: cada muro y cada losa que corta el plano vertical, en su altura (sin el corrimiento de una torre inclinada) */
function rellenoAlzado(p: Proyecto, eje: 'x' | 'y', c: number, matMuro: THREE.Material, matLosa: THREE.Material, adelante: number): THREE.Object3D {
  const zTop = p.niveles[0]?.cota ?? 0, zFund = p.niveles[p.niveles.length - 1]?.cota ?? 0;
  const g = new THREE.Group();
  // un rectángulo vertical en el plano del corte: s es la coordenada a lo largo del plano (y de la planta si el corte es x = c)
  const rect = (s0: number, s1: number, z0: number, z1: number, mat: THREE.Material) => {
    const geo = new THREE.PlaneGeometry(s1 - s0, z1 - z0);
    const ms = new THREE.Mesh(geo, mat);
    const sm = (s0 + s1) / 2, zm = (z0 + z1) / 2;
    if (eje === 'x') { ms.rotation.y = Math.PI / 2; ms.position.set(c + 0.01 * adelante, zm, -sm); } else ms.position.set(sm, zm, -c - 0.01 * adelante);
    g.add(ms);
  };
  p.muros.forEach(m => {
    const z0 = m.zDesde ?? zFund, z1 = Math.min(m.zHasta ?? zTop, zTop);
    if (!(z1 > z0)) return;
    const [ext] = huellaMuro(m) as [number, number][][];
    if (!ext) return;
    cortesRecta(ext.map(([x, y]) => ({ x, y })), eje, c).forEach(([s0, s1]) => rect(s0, s1, z0, z1, matMuro));
  });
  p.niveles.forEach((n, i) => {
    if (n.sinLosa) return;
    const pol = discretizarCurva(plantaDeNivel(p, i).silueta).map(q => ({ x: q.x + (n.dx ?? 0), y: q.y + (n.dy ?? 0) }));
    cortesRecta(pol, eje, c).forEach(([s0, s1]) => rect(s0, s1, n.cota - 0.2, n.cota, matLosa));
  });
  return g;
}

// ------------------------------------------------------------------------------------------------ aplicar
export interface ContextoPresentacion {
  grupo: THREE.Group;
  renderer: THREE.WebGLRenderer;
  sol: THREE.DirectionalLight;
  medidas: { B: number; L: number; top: number; fondoCota: number };
  corr: (z: number) => { x: number; y: number };
  colores: { tinta: string; poche: string; plano: string };
}

/** aplica la presentación al modelo recién armado; devuelve los planos de corte (para el relleno y la cámara) */
export function aplicarPresentacion(c: ContextoPresentacion, pr: Presentacion3D) {
  const { grupo, renderer, sol, medidas: md } = c;
  const p = estado.proyecto;
  // planos de corte (se ve lo que queda del lado positivo)
  const planos: THREE.Plane[] = [];
  if (pr.corte.tipo === 'planta') planos.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), pr.corte.z));
  if (pr.corte.tipo === 'alzado') {
    const l = pr.corte.lado;
    planos.push(pr.corte.eje === 'x' ? new THREE.Plane(new THREE.Vector3(-l, 0, 0), l * pr.corte.pos) : new THREE.Plane(new THREE.Vector3(0, 0, l), l * pr.corte.pos));
  }
  const render = pr.estilo === 'render', textura = pr.estilo === 'texturado' || render;
  const tinta = new THREE.LineBasicMaterial({ color: new THREE.Color(c.colores.tinta), transparent: true, opacity: pr.estilo === 'alambre' ? 0.9 : 0.5 });
  const fuera = (o: THREE.Object3D) => {
    if (!pr.parcial.activo) return false;
    const b = new THREE.Box3().setFromObject(o);
    if (b.isEmpty()) return false;
    const zc = (b.min.y + b.max.y) / 2;
    return zc < Math.min(pr.parcial.z0, pr.parcial.z1) || zc > Math.max(pr.parcial.z0, pr.parcial.z1);
  };
  const bordes: THREE.Object3D[] = [];
  const mallas: THREE.Mesh[] = [];
  grupo.traverse(o => { if ((o as THREE.Mesh).isMesh) mallas.push(o as THREE.Mesh); });
  for (const ms of mallas) {
    const vidrio = ms.userData.capa === 'Fachada';
    const fantasma = fuera(ms);
    const mats = (Array.isArray(ms.material) ? ms.material : [ms.material]).map(m0 => {
      const m = m0.clone() as THREE.MeshStandardMaterial;
      if (fantasma || pr.estilo === 'transparente') { m.transparent = true; m.opacity = fantasma ? 0.08 : vidrio ? 0.1 : 0.22; m.depthWrite = false; m.map = null; }
      else if (vidrio) { m.transparent = true; m.opacity = textura ? 0.32 : 0.28; if (textura && 'metalness' in m) { m.color = new THREE.Color(0xd4e6ef); m.metalness = 0; m.roughness = 0.1; m.opacity = 0.22; } }
      else {
        m.transparent = false; m.opacity = 1; m.depthWrite = true;
        if (textura && 'map' in m && !m.vertexColors) { m.map = hormigon(); m.color = new THREE.Color(0xffffff); m.roughness = 0.92; uvCaja(ms.geometry); }
      }
      m.clippingPlanes = planos;
      m.clipShadows = true;
      m.needsUpdate = true;
      return m;
    });
    ms.material = Array.isArray(ms.material) ? mats : mats[0];
    ms.castShadow = render && !vidrio && !fantasma;
    ms.receiveShadow = render;
    if (pr.estilo === 'alambre') ms.visible = false;
    // aristas: en alambre y en transparente (en las otras ya están las líneas de cada prisma)
    if ((pr.estilo === 'alambre' || pr.estilo === 'transparente' || fantasma) && ms.geometry) {
      const ln = new THREE.LineSegments(new THREE.EdgesGeometry(ms.geometry, 25), fantasma ? new THREE.LineBasicMaterial({ color: tinta.color, transparent: true, opacity: 0.18 }) : tinta);
      ln.position.copy(ms.position); ln.quaternion.copy(ms.quaternion); ln.scale.copy(ms.scale);
      bordes.push(ln);
      ms.parent?.add(ln);
    }
  }
  // las líneas también se cortan
  grupo.traverse(o => {
    const l = o as THREE.Line;
    if (!(l as unknown as { isLine?: boolean }).isLine) return;
    const ms = Array.isArray(l.material) ? l.material : [l.material];
    ms.forEach(m => { m.clippingPlanes = planos; m.needsUpdate = true; });
  });
  renderer.localClippingEnabled = planos.length > 0;
  // render: sombras del sol, un suelo que las recibe y un tono más fotográfico
  renderer.shadowMap.enabled = render;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = render ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = render ? 1.05 : 1;
  sol.castShadow = render;
  if (render) {
    const R = 0.6 * Math.hypot(md.B, md.L, md.top - md.fondoCota) + 10;
    const blanco = new THREE.Vector3(0, (md.top + md.fondoCota) / 2, 0);
    sol.position.copy(blanco).add(new THREE.Vector3(-0.45, 0.8, 0.4).normalize().multiplyScalar(R * 2));
    sol.target.position.copy(blanco); sol.target.updateMatrixWorld();
    const sc = sol.shadow.camera as THREE.OrthographicCamera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = R * 4; sc.updateProjectionMatrix();
    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.bias = -0.0004;
    const suelo = new THREE.Mesh(new THREE.CircleGeometry(R * 1.6, 64), new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 1 }));
    suelo.rotation.x = -Math.PI / 2; suelo.position.y = -0.02; suelo.receiveShadow = true;
    grupo.add(suelo);
  }
  // el relleno de lo cortado (poché) y el borde del plano de corte
  if (pr.corte.tipo !== 'no') {
    const poche = new THREE.MeshBasicMaterial({ color: new THREE.Color(c.colores.poche), side: THREE.DoubleSide });
    const losaC = new THREE.MeshBasicMaterial({ color: new THREE.Color(c.colores.poche).lerp(new THREE.Color(0xffffff), 0.35), side: THREE.DoubleSide });
    grupo.add(pr.corte.tipo === 'planta' ? rellenoPlanta(p, pr.corte.z, c.corr, poche) : rellenoAlzado(p, pr.corte.eje, pr.corte.pos, poche, losaC, pr.corte.lado));
    const m = 3, B = md.B / 2 + m, L = md.L / 2 + m;
    const pts = pr.corte.tipo === 'planta'
      ? [[-B, -L], [B, -L], [B, L], [-B, L], [-B, -L]].map(([x, y]) => new THREE.Vector3(x, pr.corte.z + 0.01, -y))
      : (pr.corte.eje === 'x'
        ? [[-L, md.fondoCota], [L, md.fondoCota], [L, md.top + m], [-L, md.top + m], [-L, md.fondoCota]].map(([s, z]) => new THREE.Vector3(pr.corte.pos, z, -s))
        : [[-B, md.fondoCota], [B, md.fondoCota], [B, md.top + m], [-B, md.top + m], [-B, md.fondoCota]].map(([s, z]) => new THREE.Vector3(s, z, -pr.corte.pos)));
    grupo.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: new THREE.Color(c.colores.plano), dashSize: 1, gapSize: 0.6 })).computeLineDistances());
  }
  return planos;
}
