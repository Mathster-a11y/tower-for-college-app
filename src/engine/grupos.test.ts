import { describe, expect, it } from 'vitest';
import { ejemploGuia, type Proyecto } from './modelo';
import { agruparNodos, aLocal, aPlanta, copiarNodo, desagruparNodo, espejarNodo, girarNodo, grupoPorId, hacerComponente, hacerUnico, moverNodo, murosDe, nodoAlTocar, protegerBloqueados, sincronizarComponentes, usoDeGrupo, borrarGrupo } from './grupos';
import { aPlanilla } from './mapping';
import { calcularPlanilla } from './planilla';

const clon = (p: Proyecto) => JSON.parse(JSON.stringify(p)) as Proyecto;
const ok = <T,>(r: T | { error: string }) => { if (r && typeof r === 'object' && 'error' in r) throw new Error((r as { error: string }).error); return r as T; };
const J = (p: Proyecto) => { const r = calcularPlanilla(aPlanilla(p).datos); return JSON.stringify(r).length + ':' + JSON.stringify(aPlanilla(p).piezas.map(x => [x.dir, x.Jhoja])); };

describe('grupos de dibujo', () => {
  it('jerarquía: agrupar, anidar, elegir al tocar y desagrupar', () => {
    const p = ejemploGuia();
    const a = ok(agruparNodos(p, ['M5', 'M6', 'M7'], [], null)).id;
    const b = ok(agruparNodos(p, ['M8', 'M9', 'M10'], [], null)).id;
    const top = ok(agruparNodos(p, [], [a, b], null, 'Núcleos')).id;
    expect(murosDe(p, top).map(m => m.id).sort()).toEqual(['M10', 'M5', 'M6', 'M7', 'M8', 'M9']);
    const m6 = p.muros.find(m => m.id === 'M6')!;
    expect(nodoAlTocar(p, m6, null)).toEqual({ t: 'g', id: top });
    expect(nodoAlTocar(p, m6, top)).toEqual({ t: 'g', id: a });
    expect(nodoAlTocar(p, m6, a)).toEqual({ t: 'm', id: 'M6' });
    expect(nodoAlTocar(p, m6, b)).toBeNull();
    // no se puede agrupar algo que está en otro nivel
    expect('error' in agruparNodos(p, ['M6'], [], null)).toBe(true);
    expect(desagruparNodo(p, top)).toBeNull();
    expect(grupoPorId(p, a)!.padre).toBeUndefined();
  });

  it('agrupar, mover y desagrupar no cambia el cálculo (los grupos no son piezas)', () => {
    const p = ejemploGuia(), antes = J(p);
    const g = ok(agruparNodos(p, p.muros.map(m => m.id), [], null)).id;
    expect(J(p)).toBe(antes);
    moverNodo(p, g, 0, 0);
    desagruparNodo(p, g);
    expect(J(p)).toBe(antes);
  });

  it('ubicaciones: aLocal es la inversa de aPlanta con giros y espejos', () => {
    const m = ejemploGuia().muros.find(x => x.id === 'M6')!;
    for (const g of [0, 1, 2, 3] as const) for (const e of [false, true]) {
      const T = { x: 3.2, y: -1.5, g, e };
      const v = aLocal(aPlanta(m, T), T);
      expect([v.x, v.y, v.dir, v.largo]).toEqual([m.x, m.y, m.dir, m.largo]);
    }
  });
});

describe('componentes (copias vinculadas)', () => {
  /** núcleo izquierdo de la guía como componente; la copia vinculada espejada reemplaza al de la derecha */
  const armar = () => {
    const p = ejemploGuia();
    p.muros = p.muros.filter(m => !['M8', 'M9', 'M10'].includes(m.id));
    const a = ok(agruparNodos(p, ['M5', 'M6', 'M7'], [], null, 'Núcleo')).id;
    expect(hacerComponente(p, a)).toBeNull();
    const b = ok(copiarNodo(p, a, 0, 0, true)).id;
    espejarNodo(p, b, 'x');
    moverNodo(p, b, 8, 0);
    return { p, a, b };
  };

  it('la copia vinculada espejada queda donde estaba el núcleo derecho de la guía, con piezas propias', () => {
    const { p, b } = armar();
    const ms = murosDe(p, b);
    const xs = ms.map(m => [m.dir, m.x, m.y]).sort();
    expect(xs).toEqual([['X', 4, -1.9], ['X', 4, 1.9], ['Y', 6.4, 0]]);
    const piezas = new Set(ms.map(m => m.piezaA));
    expect(piezas.size).toBe(1);
    expect(p.muros.filter(m => !ms.includes(m)).some(m => piezas.has(m.piezaA))).toBe(false);
    // el ala de la copia está pegada al alma de la copia (no a la del original)
    const alma = ms.find(m => m.dir === 'Y')!;
    ms.filter(m => m.dir === 'X').forEach(m => expect(m.pegadoA).toBe(alma.id));
    // el cálculo da lo mismo que la guía original (mismos J por pieza)
    const jg = aPlanilla(ejemploGuia()).piezas.filter(x => x.dir === 'A').map(x => x.Jhoja).sort();
    const jc = aPlanilla(p).piezas.filter(x => x.dir === 'A').map(x => x.Jhoja).sort();
    expect(jc).toEqual(jg);
  });

  it('editar un muro de una copia cambia el de la otra, en espejo', () => {
    const { p, a, b } = armar();
    const previo = clon(p);
    const m6 = p.muros.find(m => m.id === 'M6')!;   // ala de arriba del original: x = −4, largo 5
    m6.largo = 4; m6.x = -4.5;                      // se acorta desde el lado del alma
    m6.espesor = 0.25;
    expect(sincronizarComponentes(previo, p)).toEqual(['Núcleo']);
    const par = murosDe(p, b).find(m => m.dir === 'X' && m.y === 1.9)!;
    expect([par.largo, par.espesor, par.x]).toEqual([4, 0.25, 4.5]);
    expect(murosDe(p, a).length).toBe(3);
  });

  it('agregar y borrar muros en una copia pasa a la otra', () => {
    const { p, b } = armar();
    let previo = clon(p);
    const g = p.grupos!.find(x => x.nombre === 'Núcleo')!;
    p.muros.push({ id: 'M99', dir: 'X', x: -5, y: 0, largo: 1, espesor: 0.2, llega: true, areaInf: 3, piezaA: 'T9', pegadoA: '', piezaB: 'T9B', pegadoB: '', gd: g.id });
    sincronizarComponentes(previo, p);
    const nuevo = murosDe(p, b).find(m => m.y === 0 && m.dir === 'X');
    expect(nuevo?.x).toBe(5);
    expect(nuevo?.piezaA).not.toBe('T9');
    previo = clon(p);
    p.muros = p.muros.filter(m => m.id !== 'M99');
    sincronizarComponentes(previo, p);
    expect(murosDe(p, b).length).toBe(3);
  });

  it('los parámetros de uso son de cada copia (como un tabique)', () => {
    const { p, a, b } = armar();
    const previo = clon(p);
    usoDeGrupo(p, b, { zHasta: 31, llega: false });
    expect(sincronizarComponentes(previo, p)).toEqual([]);
    expect(murosDe(p, a).every(m => m.llega && m.zHasta === undefined)).toBe(true);
    expect(murosDe(p, b).every(m => !m.llega && m.zHasta === 31)).toBe(true);
  });

  it('mover una copia arrastrando sus muros no mueve las otras', () => {
    const { p, a, b } = armar();
    const previo = clon(p);
    murosDe(p, b).forEach(m => { m.x += 1; });
    expect(sincronizarComponentes(previo, p)).toEqual([]);
    expect(murosDe(p, a).map(m => m.x).sort()).toEqual(murosDe(previo, a).map(m => m.x).sort());
    // y después una edición sigue llegando bien a la copia movida
    const p2 = clon(p);
    p.muros.find(m => m.id === 'M5')!.largo = 3;
    sincronizarComponentes(p2, p);
    expect(murosDe(p, b).find(m => m.dir === 'Y')!.largo).toBe(3);
    expect(murosDe(p, b).find(m => m.dir === 'Y')!.x).toBe(7.4);
  });

  it('girar una copia y editar el original: la copia gira el cambio', () => {
    const { p, a, b } = armar();
    girarNodo(p, b);
    const previo = clon(p);
    p.muros.find(m => m.id === 'M5')!.espesor = 0.3;
    sincronizarComponentes(previo, p);
    const alma = murosDe(p, b).find(m => m.espesor === 0.3);
    expect(alma?.dir).toBe('X');
    void a;
  });

  it('hacer único la separa', () => {
    const { p, b } = armar();
    hacerUnico(p, b);
    const previo = clon(p);
    p.muros.find(m => m.id === 'M5')!.largo = 2;
    expect(sincronizarComponentes(previo, p)).toEqual([]);
    expect(murosDe(p, b).find(m => m.dir === 'Y')!.largo).toBe(3.6);
  });
});

describe('bloqueo', () => {
  it('un muro bloqueado no se mueve ni se borra; desbloquear lo libera', () => {
    const p = ejemploGuia();
    const g = ok(agruparNodos(p, ['M1'], [], null)).id;
    grupoPorId(p, g)!.bloq = true;
    let previo = clon(p);
    p.muros.find(m => m.id === 'M1')!.x = 0;
    p.muros = p.muros.filter(m => m.id !== 'M1' || true);
    expect(protegerBloqueados(previo, p)).toBe(1);
    expect(p.muros.find(m => m.id === 'M1')!.x).toBe(-9.9);
    previo = clon(p);
    p.muros = p.muros.filter(m => m.id !== 'M1');
    protegerBloqueados(previo, p);
    expect(p.muros.some(m => m.id === 'M1')).toBe(true);
    expect(borrarGrupo(p, g)).toMatch(/bloqueado/);
    expect('error' in agruparNodos(p, [], [g], null)).toBe(true);
    // desbloquear y mover en el mismo cambio: vale
    previo = clon(p);
    grupoPorId(p, g)!.bloq = false;
    p.muros.find(m => m.id === 'M1')!.x = -9;
    expect(protegerBloqueados(previo, p)).toBe(0);
    expect(p.muros.find(m => m.id === 'M1')!.x).toBe(-9);
  });
});
