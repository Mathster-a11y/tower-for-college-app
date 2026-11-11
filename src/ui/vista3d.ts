/** Vista 3D de la torre: losas de cada nivel, muros del contraviento con el color de su papel y el viento. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { estado, COLORES } from './estado';
import { entraEnCalculo, rectangulos, tipoDe } from '../engine/modelo';

export function montar3D(cont: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  cont.appendChild(renderer.domElement);
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

  function fondo() {
    const oscuro = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
    escena.background = new THREE.Color(oscuro ? 0x15191c : 0xf3f5f4);
  }

  function construir() {
    fondo();
    grupo.clear();
    const p = estado.proyecto;
    if (!p.niveles.length) return;
    const top = p.niveles[0].cota;
    const fondoCota = p.niveles[p.niveles.length - 1].cota;
    // losas: el eje y de three es la altura; x del plano = x; z del plano = −y
    let B = 0, L = 0;
    const matLosa = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, transparent: true, opacity: 0.55, roughness: 0.9 });
    const matSub = new THREE.MeshStandardMaterial({ color: 0xb9c0c6, transparent: true, opacity: 0.45, roughness: 0.9 });
    p.niveles.forEach(n => {
      B = n.B ?? B; L = n.L ?? L;
      const losa = new THREE.Mesh(new THREE.BoxGeometry(B, 0.2, L), n.cota < 0 ? matSub : matLosa);
      losa.position.set(0, n.cota - 0.1, 0);
      grupo.add(losa);
      const borde = new THREE.LineSegments(new THREE.EdgesGeometry(losa.geometry), new THREE.LineBasicMaterial({ color: 0x7d8a94 }));
      borde.position.copy(losa.position);
      grupo.add(borde);
    });
    // muros
    const papeles = estado.calculo.asig?.papeles ?? {};
    const h = top - fondoCota;
    const zNivel = estado.nivelPlanta;
    if (zNivel !== null) {
      const resalte = new THREE.Mesh(new THREE.BoxGeometry(B + 0.6, 0.3, L + 0.6), new THREE.MeshStandardMaterial({ color: 0x1f6f8b, transparent: true, opacity: 0.35 }));
      const n = p.niveles.find(x => Math.abs(x.cota - zNivel) < 1e-6);
      if (n) { resalte.position.set(0, n.cota - 0.1, 0); grupo.add(resalte); }
    }
    p.muros.forEach(m => {
      const papel = papeles[m.id]?.[estado.dir] ?? 'sin pieza';
      const color = new THREE.Color(COLORES[papel] === '#FFFFFF' ? '#d9d9d9' : COLORES[papel]);
      const entra = entraEnCalculo(m, fondoCota, top);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, transparent: !entra, opacity: entra ? 1 : 0.4,
        emissive: estado.seleccion === m.id ? new THREE.Color(0x1f6f8b) : new THREE.Color(0x000000), emissiveIntensity: 0.6 });
      const z0 = Math.max(fondoCota, m.zDesde ?? fondoCota), z1 = Math.min(top, m.zHasta ?? top);
      const alto = z1 - z0;
      if (alto <= 0) return;
      if (tipoDe(m) === 'tubo-circ') {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(m.largo / 2, m.largo / 2, alto, 32, 1, false), mat);
        c.position.set(m.x, z0 + alto / 2, -m.y);
        grupo.add(c);
        return;
      }
      rectangulos(m).forEach(r => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(r.ax, alto, r.ay), mat);
        b.position.set(r.x, z0 + alto / 2, -r.y);
        grupo.add(b);
      });
    });
    // viento
    const largo = 8;
    const dir = estado.dir === 'A' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(1, 0, 0);
    const origen = estado.dir === 'A' ? new THREE.Vector3(0, top * 0.6, L / 2 + largo + 3) : new THREE.Vector3(-B / 2 - largo - 3, top * 0.6, 0);
    grupo.add(new THREE.ArrowHelper(dir, origen, largo, 0x1f6f8b, 2.5, 1.6));
    // la cámara se vuelve a encuadrar cuando cambia el tamaño de la torre (no al mover un muro)
    const clave = [B, L, top, fondoCota].map(v => v.toFixed(1)).join('|');
    medidas = { B, L, h, top, fondoCota };
    if (clave !== encuadre) { encuadrar(); encuadre = clave; }
  }

  let medidas = { B: 20, L: 16, h: 20, top: 20, fondoCota: 0 };
  /** la torre entera entra en el visor, sea ancho o angosto */
  function encuadrar() {
    const { B, L, h, top, fondoCota } = medidas;
    const r = 0.5 * Math.sqrt(B * B + L * L + h * h) + 4;
    const fovV = (camara.fov * Math.PI) / 180;
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camara.aspect);
    const d = r / Math.sin(Math.min(fovV, fovH) / 2);
    const dir = new THREE.Vector3(-0.62, 0.38, 0.69).normalize();
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
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fondo);
  estado.suscribir(construir);
  estado.suscribirSeleccion(construir);
  construir();
  tamaño();
  renderer.setAnimationLoop(() => { controles.update(); renderer.render(escena, camara); });
}
