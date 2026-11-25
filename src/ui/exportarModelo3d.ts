/**
 * Exportar → «Modelo 3D (Rhino, SketchUp)»: lo que se ve en la axonometría (losas, muros, fachada y exoesqueleto, con
 * las capas que estén prendidas) en un .zip con el OBJ y su MTL (Rhino, Blender) y el Collada .dae (SketchUp, Rhino).
 */
import * as THREE from 'three';
import { estado } from './estado';
import { modelo3DVisible } from './vista3d';
import { aDAE, aOBJ, type ObjetoModelo } from '../engine/modelo3d';

/** con más elementos que esto en una capa (las barras de un diagrid), se juntan por color: archivos livianos */
const MAX_POR_CAPA = 300;

/** los objetos del 3D marcados con su capa, en metros y con z hacia arriba (la vista usa y hacia arriba y −y en z) */
export function objetosDelModelo(raiz: THREE.Object3D): ObjetoModelo[] {
  raiz.updateMatrixWorld(true);
  const out: ObjetoModelo[] = [], v = new THREE.Vector3();
  raiz.traverseVisible(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !o.userData.capa) return;
    const g = m.geometry as THREE.BufferGeometry, pos = g.getAttribute('position');
    if (!pos) return;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const idx = g.getIndex(), n = idx ? idx.count : pos.count, tri: number[] = [];
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
      tri.push(v.x, -v.z, v.y);
    }
    const c = mat?.color ?? new THREE.Color(0.8, 0.8, 0.8);
    out.push({ capa: o.userData.capa as string, nombre: o.name || o.userData.capa, color: [c.r, c.g, c.b], opacidad: mat?.transparent ? mat.opacity : 1, tri });
  });
  // capas con muchísimos elementos: un objeto por color
  const porCapa = new Map<string, ObjetoModelo[]>();
  out.forEach(o => { const l = porCapa.get(o.capa); if (l) l.push(o); else porCapa.set(o.capa, [o]); });
  return [...porCapa.values()].flatMap(l => {
    if (l.length <= MAX_POR_CAPA) return l;
    const juntos = new Map<string, ObjetoModelo>();
    l.forEach(o => { const k = `${o.color.join(',')}|${o.opacidad}`, j = juntos.get(k); if (j) j.tri.push(...o.tri); else juntos.set(k, { ...o, nombre: `${o.capa} ${juntos.size + 1}`, tri: [...o.tri] }); });
    return [...juntos.values()];
  });
}

export async function exportarModelo3D(): Promise<string> {
  const g = modelo3DVisible();
  if (!g) return 'Abrí la axonometría (la vista 3D de la derecha) para exportar el modelo.';
  const objs = objetosDelModelo(g);
  if (!objs.length) return 'No hay nada para exportar: prendé las losas, la fachada o el exoesqueleto en la vista 3D.';
  const titulo = estado.proyecto.nombre || 'torre';
  const base = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'torre';
  const { obj, mtl } = aOBJ(objs, `${base}.mtl`, titulo);
  const dae = aDAE(objs, titulo);
  const capas = [...new Set(objs.map(o => o.capa))];
  const leame = [
    `${titulo} · modelo 3D exportado de Torre 3D`,
    '',
    `Capas: ${capas.join(', ')} (lo que estaba prendido en la vista 3D). Unidades: metros, z hacia arriba.`,
    '',
    `Rhino: Archivo → Importar → ${base}.obj (dejá el .mtl en la misma carpeta; en las opciones, «grupos como capas»).`,
    `SketchUp: Archivo → Importar → ${base}.dae (tipo COLLADA). Cada capa llega como un grupo con sus elementos.`,
    'Blender, 3ds Max y otros: el .obj o el .dae.',
    '',
    'Las curvas llegan como mallas finas (el render las suaviza con «Suavizar» / «Smooth»). Los colores son los de la',
    'vista; para el render conviene asignarles los materiales del programa.',
  ].join('\n');
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file(`${base}.obj`, obj); zip.file(`${base}.mtl`, mtl); zip.file(`${base}.dae`, dae); zip.file('LEAME.txt', leame);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${base}_modelo3d.zip`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return `Modelo 3D exportado: ${objs.length} objetos en ${capas.length} capas (${capas.join(', ')}), en .obj (Rhino) y .dae (SketchUp).`;
}
