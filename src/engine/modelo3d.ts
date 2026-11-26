/**
 * El modelo 3D de la torre para seguir trabajando en otro programa (renders, maquetas): OBJ con sus materiales (lo abre
 * Rhino, Blender y casi todo) y Collada .dae (lo importa SketchUp sin complementos, y también Rhino). En metros, con z
 * hacia arriba, cada elemento con su nombre y agrupado por capa (losas, muros, fachada, exoesqueleto).
 */
export interface ObjetoModelo {
  capa: string;
  nombre: string;
  /** color (0..1) y opacidad (1 = opaco) */
  color: [number, number, number];
  opacidad: number;
  /** triángulos: x, y, z de cada vértice, de a tres vértices por triángulo (m, z hacia arriba) */
  tri: number[];
}

const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'objeto';
const n6 = (x: number) => (Math.abs(x) < 5e-7 ? '0' : x.toFixed(6).replace(/\.?0+$/, ''));
/** un material por color y opacidad (los iguales se comparten) */
function materiales(objs: ObjetoModelo[]) {
  const lista: { id: string; color: [number, number, number]; opacidad: number }[] = [], de = new Map<string, string>();
  objs.forEach(o => {
    const k = `${o.color.map(c => c.toFixed(3)).join(',')}|${o.opacidad.toFixed(3)}`;
    if (!de.has(k)) { const id = `${limpio(o.capa)}_${lista.length + 1}`; de.set(k, id); lista.push({ id, color: o.color, opacidad: o.opacidad }); }
  });
  return { lista, de: (o: ObjetoModelo) => de.get(`${o.color.map(c => c.toFixed(3)).join(',')}|${o.opacidad.toFixed(3)}`)! };
}
/** nombres únicos (dos «Muro M3» pasan a «Muro_M3» y «Muro_M3_2») */
function nombresUnicos(objs: ObjetoModelo[]): string[] {
  const usados = new Map<string, number>();
  return objs.map(o => { const b = limpio(o.nombre), n = (usados.get(b) ?? 0) + 1; usados.set(b, n); return n > 1 ? `${b}_${n}` : b; });
}

/** OBJ y su MTL (el OBJ apunta al MTL por su nombre de archivo) */
export function aOBJ(objs: ObjetoModelo[], nombreMtl: string, titulo: string): { obj: string; mtl: string } {
  const m = materiales(objs), nombres = nombresUnicos(objs);
  const o: string[] = [`# ${titulo}`, '# Torre 3D · metros, z hacia arriba', `mtllib ${nombreMtl}`];
  let base = 1;
  objs.forEach((ob, k) => {
    if (ob.tri.length < 9) return;
    o.push(`g ${limpio(ob.capa)}`, `o ${nombres[k]}`, `usemtl ${m.de(ob)}`);
    for (let i = 0; i < ob.tri.length; i += 3) o.push(`v ${n6(ob.tri[i])} ${n6(ob.tri[i + 1])} ${n6(ob.tri[i + 2])}`);
    const nv = ob.tri.length / 3;
    for (let i = 0; i < nv; i += 3) o.push(`f ${base + i} ${base + i + 1} ${base + i + 2}`);
    base += nv;
  });
  const mtl = ['# Torre 3D', ...m.lista.flatMap(x => [`newmtl ${x.id}`, `Kd ${x.color.map(n6).join(' ')}`, `Ka 0 0 0`, `d ${n6(x.opacidad)}`, `Tr ${n6(1 - x.opacidad)}`, 'illum 2', ''])];
  return { obj: o.join('\n') + '\n', mtl: mtl.join('\n') };
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Collada 1.4.1 (SketchUp: Archivo → Importar → COLLADA): un nodo por capa con un objeto por elemento */
export function aDAE(objs: ObjetoModelo[], titulo: string, fecha = new Date().toISOString()): string {
  const m = materiales(objs), nombres = nombresUnicos(objs);
  const ef = m.lista.map(x => `<effect id="${x.id}-fx"><profile_COMMON><technique sid="common"><lambert><diffuse><color>${x.color.map(n6).join(' ')} 1</color></diffuse><transparent opaque="A_ONE"><color>0 0 0 ${n6(x.opacidad)}</color></transparent><transparency><float>1</float></transparency></lambert></technique></profile_COMMON></effect>`).join('');
  const mat = m.lista.map(x => `<material id="${x.id}" name="${x.id}"><instance_effect url="#${x.id}-fx"/></material>`).join('');
  const validos = objs.map((o, k) => ({ o, k })).filter(x => x.o.tri.length >= 9);
  const geo = validos.map(({ o, k }) => {
    const id = `g${k}`, nv = o.tri.length / 3;
    const pos = o.tri.map(n6).join(' ');
    const idx = Array.from({ length: nv }, (_, i) => i).join(' ');
    return `<geometry id="${id}" name="${xml(nombres[k])}"><mesh><source id="${id}-p"><float_array id="${id}-pa" count="${o.tri.length}">${pos}</float_array><technique_common><accessor source="#${id}-pa" count="${nv}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source><vertices id="${id}-v"><input semantic="POSITION" source="#${id}-p"/></vertices><triangles material="m" count="${nv / 3}"><input semantic="VERTEX" source="#${id}-v" offset="0"/><p>${idx}</p></triangles></mesh></geometry>`;
  }).join('');
  const capas = [...new Set(validos.map(x => x.o.capa))];
  const nodos = capas.map(c => `<node id="capa-${xml(limpio(c))}" name="${xml(c)}">${validos.filter(x => x.o.capa === c).map(({ o, k }) => `<node id="n${k}" name="${xml(nombres[k])}"><instance_geometry url="#g${k}"><bind_material><technique_common><instance_material symbol="m" target="#${m.de(o)}"/></technique_common></bind_material></instance_geometry></node>`).join('')}</node>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1"><asset><contributor><authoring_tool>Torre 3D</authoring_tool></contributor><created>${fecha}</created><modified>${fecha}</modified><title>${xml(titulo)}</title><unit name="meter" meter="1"/><up_axis>Z_UP</up_axis></asset><library_effects>${ef}</library_effects><library_materials>${mat}</library_materials><library_geometries>${geo}</library_geometries><library_visual_scenes><visual_scene id="escena" name="${xml(titulo)}">${nodos}</visual_scene></library_visual_scenes><scene><instance_visual_scene url="#escena"/></scene></COLLADA>
`;
}
