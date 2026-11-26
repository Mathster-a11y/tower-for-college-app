/** El modelo 3D para Rhino (OBJ + MTL) y SketchUp (Collada): bien armado, por capas, con los materiales compartidos. */
import { describe, expect, it } from 'vitest';
import { aDAE, aOBJ, type ObjetoModelo } from './modelo3d';

// un cubo de 1 m: 12 triángulos
function cubo(dx: number): number[] {
  const v = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]].map(([x, y, z]) => [x + dx, y, z]);
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return f.flatMap(t => t.flatMap(i => v[i]));
}
const objs: ObjetoModelo[] = [
  { capa: 'Losas', nombre: 'Losa 1°', color: [0.8, 0.8, 0.8], opacidad: 0.5, tri: cubo(0) },
  { capa: 'Losas', nombre: 'Losa 1°', color: [0.8, 0.8, 0.8], opacidad: 0.5, tri: cubo(2) },
  { capa: 'Muros', nombre: 'Muro M1', color: [0.2, 0.3, 0.4], opacidad: 1, tri: cubo(4) },
];

describe('modelo 3D para otros programas', () => {
  it('OBJ: vértices, caras con índices desde 1, objetos con nombre único, grupos por capa y su MTL', () => {
    const { obj, mtl } = aOBJ(objs, 'torre.mtl', 'Torre de prueba');
    const v = obj.split('\n').filter(l => l.startsWith('v ')), f = obj.split('\n').filter(l => l.startsWith('f '));
    expect(v.length).toBe(3 * 36);
    expect(f.length).toBe(3 * 12);
    const maximo = Math.max(...f.flatMap(l => l.slice(2).split(' ').map(Number)));
    expect(maximo).toBe(v.length);
    expect(obj).toContain('mtllib torre.mtl');
    expect(obj).toContain('o Losa_1'); expect(obj).toContain('o Losa_1_2');    // sin acentos ni símbolos y sin repetirse
    expect(obj.match(/^g /gm)?.length).toBe(3);
    // las dos losas comparten material: dos materiales en total
    expect(mtl.match(/^newmtl /gm)?.length).toBe(2);
    expect(mtl).toContain('d 0.5');
  });
  it('Collada: metros, z arriba, un nodo por capa, una geometría por objeto y triángulos bien contados', () => {
    const d = aDAE(objs, 'Torre <de> prueba', '2026-01-01T00:00:00Z');
    expect(d).toContain('<unit name="meter" meter="1"/>');
    expect(d).toContain('<up_axis>Z_UP</up_axis>');
    expect(d.match(/<geometry /g)?.length).toBe(3);
    expect(d.match(/<triangles material="m" count="12">/g)?.length).toBe(3);
    expect(d.match(/<node id="capa-/g)?.length).toBe(2);
    expect(d).toContain('Torre &lt;de&gt; prueba');
    // etiquetas balanceadas (un XML que se puede leer)
    for (const t of ['COLLADA', 'library_geometries', 'geometry', 'mesh', 'source', 'node', 'visual_scene', 'effect', 'material']) {
      expect((d.match(new RegExp(`<${t}[ >]`, 'g')) ?? []).length).toBe((d.match(new RegExp(`</${t}>`, 'g')) ?? []).length);
    }
  });
});
