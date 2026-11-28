/**
 * Etapa «Vista 3D»: pisos separados, aislar y rayos X, color por dato, vistas guardadas (completar y leer del archivo).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { aplicarPresentacion, colorRampa, completarPresentacion, datosColor, desplazamientoPiso, separarPisos, PRESENTACION_INICIAL, type Presentacion3D } from './presentacion3d';
import { estado } from './estado';
import { ejemploGuia } from '../engine/modelo';
import { leerProyecto } from '../engine/lector';

const COTAS = [-3, 0, 3, 6];

/** una caja del muro «id» entre z0 y z1 (sin transformación: los vértices ya en el lugar, como los prismas) */
function muro(id: string, z0: number, z1: number): THREE.Mesh {
  const g = new THREE.BoxGeometry(1, z1 - z0, 0.2);
  g.translate(0, (z0 + z1) / 2, 0);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x888888 }));
  m.userData = { muro: id, capa: 'Muros' };
  return m;
}
const caja = (o: THREE.Object3D) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };

describe('pisos separados', () => {
  it('cada nivel sube lo que suben los de abajo; la losa va con los muros de arriba', () => {
    expect(desplazamientoPiso(COTAS, 2, -3.1)).toBe(0);     // losa del subsuelo (de −3,2 a −3)
    expect(desplazamientoPiso(COTAS, 2, -0.1)).toBe(2);     // losa de PB
    expect(desplazamientoPiso(COTAS, 2, 1.5)).toBe(2);      // muros entre PB y el 1º
    expect(desplazamientoPiso(COTAS, 2, 4.5)).toBe(4);
    expect(desplazamientoPiso(COTAS, 2, 6)).toBe(6);        // la azotea
    expect(desplazamientoPiso(COTAS, 0, 6)).toBe(0);
  });

  it('un muro de varios pisos se separa en tramos; una barra del exo se estira y sigue unida a sus nudos', () => {
    const g = new THREE.Group();
    // muro de PB a 6 m con un tramo por piso (como los prismas: un anillo de vértices en cada cota)
    const m1 = muro('M1', 0, 3), m2 = muro('M1', 3, 6);
    // barra del exo: un cilindro con su propia posición y giro, de (0, 0) a (0, 6)
    const barra = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6, 8), new THREE.MeshStandardMaterial());
    barra.position.set(5, 3, 0);
    g.add(m1, m2, barra);
    const extra = separarPisos(g, COTAS, 2);
    expect(extra).toBe(6);
    expect(caja(m1).min.y).toBeCloseTo(2, 6); expect(caja(m1).max.y).toBeCloseTo(5, 6);      // PB–1º sube 2
    expect(caja(m2).min.y).toBeCloseTo(7, 6); expect(caja(m2).max.y).toBeCloseTo(10, 6);     // 1º–2º sube 4: queda un hueco
    expect(caja(barra).min.y).toBeCloseTo(2, 6); expect(caja(barra).max.y).toBeCloseTo(12, 6); // de PB (sube 2) a la azotea (sube 6)
    expect(barra.position.y).toBe(0);                                                         // la transformación quedó en los vértices
  });

  it('las aristas de un muro: la de arriba queda con su tramo, la de abajo también', () => {
    const g = new THREE.Group(), m = muro('M1', 0, 3);
    const ln = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial());
    ln.userData = { muro: 'M1', capa: 'Muros' };
    g.add(ln);
    separarPisos(g, COTAS, 2);
    expect(caja(ln).min.y).toBeCloseTo(2, 6); expect(caja(ln).max.y).toBeCloseTo(5, 6);
  });

  it('una losa sube con los muros que apoyan en ella', () => {
    const g = new THREE.Group(), l = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 5).translate(0, 2.9, 0), new THREE.MeshStandardMaterial());
    l.userData = { capa: 'Losas', nivel: 3 };
    g.add(l);
    separarPisos(g, COTAS, 2);
    expect(caja(l).max.y).toBeCloseTo(7, 6);          // la losa del 1º (cota 3) sube 4, como los muros de 3 a 6
  });

  it('sin separación no se toca nada', () => {
    const g = new THREE.Group(), m = muro('M1', 0, 3); g.add(m);
    const geo = m.geometry;
    expect(separarPisos(g, COTAS, 0)).toBe(0);
    expect(m.geometry).toBe(geo);
  });
});

/** aplica la presentación a un grupo de prueba (sin WebGL: el renderer solo guarda opciones) */
function aplicar(pr: Presentacion3D, g: THREE.Group) {
  const renderer = { shadowMap: {}, localClippingEnabled: false } as unknown as THREE.WebGLRenderer;
  return aplicarPresentacion({ grupo: g, renderer, sol: new THREE.DirectionalLight(), medidas: { B: 20, L: 16, top: 6, fondoCota: -3 }, corr: () => ({ x: 0, y: 0 }),
    colores: { tinta: '#222222', poche: '#333333', plano: '#2a9d5c' } }, pr);
}

describe('aislar, rayos X y color por dato', () => {
  estado.proyecto = ejemploGuia();
  estado.recalcular();
  const ids = estado.proyecto.muros.slice(0, 3).map(m => m.id);

  it('aislar deja solo los muros elegidos; rayos X deja a los otros casi transparentes', () => {
    const g = new THREE.Group(), [a, b] = [muro(ids[0], 0, 3), muro(ids[1], 0, 3)];
    const losa = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 5), new THREE.MeshStandardMaterial()); losa.userData = { capa: 'Losas', nivel: 0 };
    g.add(a, b, losa);
    aplicar({ ...completarPresentacion(null), aislar: { modo: 'aislar', muros: [ids[0]], nombre: '' } }, g);
    expect(a.visible).toBe(true); expect(b.visible).toBe(false); expect(losa.visible).toBe(false);

    const g2 = new THREE.Group(), [c, d] = [muro(ids[0], 0, 3), muro(ids[1], 0, 3)];
    g2.add(c, d);
    aplicar({ ...completarPresentacion(null), aislar: { modo: 'rayosx', muros: [ids[0]], nombre: '' } }, g2);
    expect((c.material as THREE.Material).transparent).toBe(false);
    expect((d.material as THREE.Material).opacity).toBeLessThan(0.15);
  });

  it('si ninguno de los muros aislados existe, se ve toda la torre', () => {
    const g = new THREE.Group(), a = muro(ids[0], 0, 3); g.add(a);
    aplicar({ ...completarPresentacion(null), aislar: { modo: 'aislar', muros: ['NO-EXISTE'], nombre: '' } }, g);
    expect(a.visible).toBe(true);
  });

  it('color por espesor: cada muro con el tono de su valor; rojo y azul no se usan', () => {
    const dc = datosColor('espesor');
    expect(typeof dc).toBe('object');
    const g = new THREE.Group(), a = muro(ids[0], 0, 3); g.add(a);
    aplicar({ ...completarPresentacion(null), colorPor: 'espesor' }, g);
    const v = (dc as Exclude<ReturnType<typeof datosColor>, string | null>).valor.get(ids[0])!;
    expect(((a.material as THREE.MeshStandardMaterial).color).getHexString()).toBe(colorRampa(v).getHexString());
    for (const t of [0, 0.5, 1]) { const c = colorRampa(t); expect(c.b).toBeGreaterThanOrEqual(c.g); }   // violeta: nunca rojo puro ni azul de compresión
  });

  it('parte del viento con cualquier método; la cuantía solo con CIRSOC o FEM', () => {
    const parte = datosColor('parte');
    expect(typeof parte).toBe('object');
    expect([...(parte as { valor: Map<string, number> }).valor.values()].every(x => x >= 0 && x <= 1)).toBe(true);
    expect(typeof datosColor('cuantia')).toBe('string');
    estado.proyecto = { ...ejemploGuia(), calculo: { metodo: 'cirsoc' } };
    estado.recalcular();
    const cu = datosColor('cuantia');
    expect(typeof cu).toBe('object');
    expect((cu as { valor: Map<string, number> }).valor.size).toBeGreaterThan(0);
  });
});

describe('vistas guardadas', () => {
  it('completar una presentación vieja o rota', () => {
    const p = completarPresentacion({ estilo: 'alambre', separar: -4, aislar: { modo: 'aislar' } as Presentacion3D['aislar'] });
    expect(p.estilo).toBe('alambre');
    expect(p.separar).toBe(0);
    expect(p.aislar.muros).toEqual([]);
    expect(p.corte).toEqual(PRESENTACION_INICIAL.corte);
    expect(completarPresentacion(null)).toEqual(PRESENTACION_INICIAL);
  });
  it('el archivo guarda las vistas y suelta las incompletas', () => {
    const buena = { nombre: 'Núcleo', pr: { estilo: 'sombreado' }, camara: { pos: [1, 2, 3], obj: [0, 0, 0], zoom: 1 } };
    const l = leerProyecto({ ...ejemploGuia(), vistas3d: [buena, { nombre: 'rota', pr: {}, camara: { pos: [1, 2], obj: [0, 0, 0], zoom: 1 } }, 7] });
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    expect(l.proyecto.vistas3d).toEqual([buena]);
    expect(l.avisos.some(a => /vistas guardadas/.test(a))).toBe(true);
    const sin = leerProyecto(ejemploGuia());
    expect(sin.ok && sin.proyecto.vistas3d).toBeFalsy();
  });
});
