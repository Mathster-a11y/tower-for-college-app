/**
 * El proyecto completo en tablas legibles, para que la planilla alcance sola para volver a armar la torre.
 *
 * Hojas (todas con encabezados en la fila 1; el orden de las columnas no importa al leer):
 *  - «T3D Proyecto»: nombre, alumno, hormigón, fundación y datos del viento.
 *  - «T3D Niveles»: nombre, cota, B y L de cada nivel.
 *  - «T3D Muros»: todos los datos de cada muro (los de siempre y los de grupos, piezas tipo, vanos y moldes).
 *  - «T3D Contornos»: vértices de perfiles irregulares, siluetas y carpinterías de los niveles, huecos de losa y caminos.
 *  - «T3D Grupos», «T3D Huecos de losa», «T3D Caminos», «T3D Cotas», «T3D Guías».
 * La hoja «T3D» (el proyecto en JSON) queda como respaldo; si están estas tablas, mandan ellas.
 */
import type { Cota, GrupoDib, HuecoLosa, Muro, Nivel, Proyecto, RolMolde, TipoElemento } from '../engine/modelo';
import type { VerticePerfil } from '../engine/perfil';
import type { Guia } from '../engine/guias';
import type { MedidasPieza, TipoPieza } from '../engine/piezasTipo';
import type { Hoja, Valor } from './tablas';
import { EXO_POR_DEFECTO, type TipoExo } from '../engine/exo';

export interface Tabla { nombre: string; filas: Valor[][]; anchos: number[] }
export const T = {
  proyecto: 'T3D Proyecto', niveles: 'T3D Niveles', muros: 'T3D Muros', contornos: 'T3D Contornos', grupos: 'T3D Grupos',
  huecos: 'T3D Huecos de losa', caminos: 'T3D Caminos', cotas: 'T3D Cotas', guias: 'T3D Guías',
} as const;

const SI = 'sí';
const b2s = (b: boolean | undefined) => (b ? SI : null);
const vacio = (v: Valor | undefined) => v === null || v === undefined || (typeof v === 'string' && !v.trim());
const txt = (v: Valor | undefined) => (vacio(v) ? '' : String(v).trim());
const num = (v: Valor | undefined): number | null => {
  if (vacio(v)) return null;
  if (typeof v === 'number') return v;
  const x = Number(String(v).trim().replace(',', '.'));
  return isFinite(x) ? x : null;
};
const sino = (v: Valor | undefined) => ['sí', 'si', 's', 'x', '1', 'true', 'verdadero'].includes(txt(v).toLowerCase());
const norm = (s: Valor | undefined) => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const DATOS: [string, string, (p: Proyecto) => Valor, (p: Proyecto, v: Valor) => void][] = [
  ['Nombre', 'nombre del proyecto', p => p.nombre, (p, v) => (p.nombre = txt(v))],
  ['Alumno', 'quién lo dibujó', p => p.alumno, (p, v) => (p.alumno = txt(v))],
  ['Hormigón', 'tipo de hormigón de los tabiques (H30: σbk = 300 kg/cm²)', p => p.hormigon, (p, v) => (p.hormigon = txt(v))],
  ['Fundación b1 (m)', 'lado de la fundación paralelo al viento A', p => p.fundacion.b1, (p, v) => (p.fundacion.b1 = num(v) ?? 0)],
  ['Fundación a1 (m)', 'lado de la fundación perpendicular al viento A', p => p.fundacion.a1, (p, v) => (p.fundacion.a1 = num(v) ?? 0)],
  ...(['V', 'Kd', 'I', 'zg', 'alfa', 'Kzt', 'G', 'Cpb', 'Cps', 'GCpi'] as const).map(k => [
    k, { V: 'velocidad básica del viento (m/s)', Kd: 'factor de direccionalidad', I: 'factor de importancia', zg: 'zg de la exposición (m)', alfa: 'α de la exposición', Kzt: 'factor topográfico', G: 'factor de ráfaga', Cpb: 'Cp a barlovento', Cps: 'Cp a sotavento', GCpi: 'presión interna GCpi' }[k],
    (p: Proyecto) => p.sitio[k], (p: Proyecto, v: Valor) => { p.sitio[k] = num(v) ?? 0; }] as [string, string, (p: Proyecto) => Valor, (p: Proyecto, v: Valor) => void]),
  ['Exo: ficha', 'exoesqueleto: A diagrid, B mega-marcos, C mega-columnas y cinturones, D tubo en X (vacío = sin exoesqueleto)', p => p.exo?.tipo ?? null,
    (p, v) => { const t = txt(v).toUpperCase(); if (['A', 'B', 'C', 'D'].includes(t)) p.exo = { ...structuredClone(EXO_POR_DEFECTO), ...(p.exo ?? {}), tipo: t as TipoExo }; else delete p.exo; }],
  ...([['Exo: separación (m)', 'distancia de la fachada al eje de las columnas', 'separacion'], ['Exo: módulo (pisos)', 'alto de cada cruz, marco o diamante', 'modulo'],
    ['Exo: E del acero (t/m²)', 'módulo de elasticidad', 'E'], ['Exo: σ admisible (t/m²)', 'tensión admisible del acero', 'sigmaAdm']] as const).map(([k, q, c]) =>
    [k, q, (p: Proyecto) => p.exo?.[c] ?? null, (p: Proyecto, v: Valor) => { const x = num(v); if (p.exo && x !== null) p.exo[c] = x; }] as [string, string, (p: Proyecto) => Valor, (p: Proyecto, v: Valor) => void]),
  ...(['columna', 'diagonal', 'viga'] as const).flatMap(c => (['b', 'e'] as const).map(k =>
    [`Exo: ${c} ${k === 'b' ? 'lado' : 'espesor'} (m)`, `tubo cuadrado de la ${c}`, (p: Proyecto) => p.exo?.[c][k] ?? null, (p: Proyecto, v: Valor) => { const x = num(v); if (p.exo && x !== null) p.exo[c][k] = x; }] as [string, string, (p: Proyecto) => Valor, (p: Proyecto, v: Valor) => void])),
  ['Áreas automáticas (cota)', 'nivel cuyas áreas de influencia se copian solas a «Área inf.» (vacío = a mano)', p => p.areasAuto ?? null, (p, v) => { const x = num(v); if (x !== null) p.areasAuto = x; }],
];

const TIPO_TXT: Record<TipoElemento, string | null> = { tabique: null, 'tubo-rect': 'tubo rect.', 'tubo-circ': 'tubo circ.', perfil: 'perfil' };
const MED = ['h', 'b', 'e', 'giro', 'espejo', 'eA', 'bS', 'eS', 'bI', 'eI'] as const;
const medTxt = (m: MedidasPieza) => MED.filter(k => m[k] !== undefined && m[k] !== null).map(k => `${k}=${k === 'espejo' ? (m.espejo ? SI : 'no') : m[k]}`).join('; ');
function medLeer(s: string): MedidasPieza {
  const o: Record<string, number | boolean> = {};
  s.split(';').forEach(par => { const [k, v] = par.split('=').map(x => x.trim()); if (!k) return; o[k] = k === 'espejo' ? sino(v) : Number(v.replace(',', '.')); });
  return o as unknown as MedidasPieza;
}

const CAB_MUROS = ['Muro', 'Dir.', 'x (m)', 'y (m)', 'Largo (m)', 'Espesor (m)', 'Llega', 'Área inf. (m²)', 'Pieza A', 'Pegado a (A)', 'Pieza B', 'Pegado a (B)', 'Tipo', 'Lado y',
  'Desde', 'Hasta', 'Rol A', 'Rol B', 'Pórtico', 'Grupo', 'Pieza tipo', 'Medidas de la pieza', 'Vano con', 'Vano ancho (m)', 'Vano tipo', 'Grupo de dibujo', 'Ref. componente'];
const CAB_CONT = ['Elemento', 'Clase', 'Anillo', 'Nº', 'x (m)', 'y (m)', 'b (arco)', 'c1 x', 'c1 y', 'c2 x', 'c2 y'];

/** las tablas del proyecto, listas para escribir en la planilla o en Google Sheets */
export function tablasProyecto(p: Proyecto): Tabla[] {
  const nombreNivel = (z: number | null | undefined) => (z == null ? null : p.niveles.find(n => Math.abs(n.cota - z) < 1e-9)?.nombre ?? z);
  const out: Tabla[] = [];
  out.push({ nombre: T.proyecto, anchos: [26, 16, 70], filas: [['Dato', 'Valor', 'Qué es'], ...DATOS.map(([k, q, g]) => [k, g(p) ?? null, q] as Valor[]),
    [], ['Estas hojas «T3D …» guardan la torre completa: con ellas la app vuelve a armar el proyecto. Se pueden editar; la app las lee al abrir la planilla.']] });
  out.push({ nombre: T.niveles, anchos: [14, 10, 10, 10], filas: [['Nivel', 'Cota (m)', 'B (m)', 'L (m)'], ...p.niveles.map(n => [n.nombre, n.cota, n.B ?? null, n.L ?? null])] });
  out.push({ nombre: T.muros, anchos: [10, 6, 9, 9, 9, 9, 7, 13, 10, 12, 10, 12, 11, 8, 10, 10, 9, 9, 8, 10, 11, 28, 10, 12, 9, 14, 14], filas: [CAB_MUROS, ...p.muros.map(m => [
    m.id, m.dir, m.x, m.y, m.largo, m.espesor, m.llega ? SI : 'no', m.areaInf, m.piezaA || null, m.pegadoA || null, m.piezaB || null, m.pegadoB || null,
    TIPO_TXT[m.tipo ?? 'tabique'], m.tipo === 'tubo-rect' ? m.ladoY ?? null : null, nombreNivel(m.zDesde), nombreNivel(m.zHasta),
    m.rolA || null, m.rolB || null, b2s(m.portico), m.grupo ?? null, m.pieza?.tipo ?? null, m.pieza ? medTxt(m.pieza.med) : null,
    m.vano?.con ?? null, m.vano?.ancho ?? null, m.vano?.tipo ?? null, m.gd ?? null, m.cref ?? null,
  ] as Valor[])] });
  const cont: Valor[][] = [CAB_CONT];
  const vert = (el: string, clase: string, anillo: number, v: { x: number; y: number; b?: number; c1?: { x: number; y: number }; c2?: { x: number; y: number } }[]) =>
    v.forEach((q, k) => cont.push([el, clase, anillo, k + 1, q.x, q.y, q.b ?? null, q.c1?.x ?? null, q.c1?.y ?? null, q.c2?.x ?? null, q.c2?.y ?? null]));
  p.muros.forEach(m => { if (m.perfil) { vert(m.id, 'perfil', 0, m.perfil.v); (m.perfil.huecos ?? []).forEach((h, i) => vert(m.id, 'perfil', i + 1, h)); } });
  p.niveles.forEach(n => { if (n.silueta) vert(n.nombre, 'silueta', 0, n.silueta); if (n.carpinteria) vert(n.nombre, 'carpintería', 0, n.carpinteria); });
  (p.huecosLosa ?? []).forEach(h => vert(h.id, 'hueco de losa', 0, h.v));
  (p.caminos ?? []).forEach(c => vert(c.id, 'camino', 0, c.v));
  out.push({ nombre: T.contornos, anchos: [12, 14, 8, 6, 10, 10, 10, 9, 9, 9, 9], filas: cont });
  out.push({ nombre: T.grupos, anchos: [10, 18, 10, 10, 8, 12, 9, 9, 10, 8, 14], filas: [['Grupo', 'Nombre', 'Dentro de', 'Bloqueado', 'Oculto', 'Componente', 'Ubic. x (m)', 'Ubic. y (m)', 'Giro (× 90°)', 'Espejo', 'Ref. componente'],
    ...(p.grupos ?? []).map(g => [g.id, g.nombre, g.padre ?? null, b2s(g.bloq), b2s(g.oculto), g.comp ?? null, g.T?.x ?? null, g.T?.y ?? null, g.T ? g.T.g : null, g.T ? (g.T.e ? SI : 'no') : null, g.cref ?? null] as Valor[])] });
  out.push({ nombre: T.huecos, anchos: [10, 18, 12, 12], filas: [['Hueco', 'Nombre', 'Desde (m)', 'Hasta (m)'], ...(p.huecosLosa ?? []).map(h => [h.id, h.nombre, h.zDesde ?? null, h.zHasta ?? null] as Valor[])] });
  out.push({ nombre: T.caminos, anchos: [10, 18, 9], filas: [['Camino', 'Nombre', 'Cerrado'], ...(p.caminos ?? []).map(c => [c.id, c.nombre, c.cerrado ? SI : 'no'] as Valor[])] });
  out.push({ nombre: T.cotas, anchos: [8, 10, 9, 9, 9, 10, 8, 9, 9, 10, 8], filas: [['Cota', 'Tipo', 'Desfase (m)', 'A x (m)', 'A y (m)', 'A muro', 'A punto', 'B x (m)', 'B y (m)', 'B muro', 'B punto'],
    ...(p.cotas ?? []).map(c => [c.id, c.tipo, c.d, c.a.x, c.a.y, c.a.ref?.id ?? null, c.a.ref?.k ?? null, c.b.x, c.b.y, c.b.ref?.id ?? null, c.b.ref?.k ?? null] as Valor[])] });
  out.push({ nombre: T.guias, anchos: [8, 9, 9, 9, 11, 9, 8, 11], filas: [['Guía', 'Tipo', 'x (m)', 'y (m)', 'Ángulo (°)', 'Radio (m)', 'Eje', 'De la grilla'],
    ...(p.guias ?? []).map(g => g.t === 'recta' ? [g.id, 'recta', g.p.x, g.p.y, g.ang, null, g.eje ?? null, b2s(g.deEjes)] as Valor[] : [g.id, 'círculo', g.c.x, g.c.y, null, g.r, null, null] as Valor[])] });
  return out;
}

/** lector de una hoja por encabezados (fila 1) */
function leerHoja(h: Hoja | undefined) {
  if (!h || !h.filas.length) return [];
  const cab = (h.filas[0] ?? []).map(norm);
  return h.filas.slice(1).filter(f => f && f.some(v => !vacio(v))).map(f => (nombre: string) => { const i = cab.indexOf(norm(nombre)); return i < 0 ? null : f[i] ?? null; });
}

/**
 * Vuelve a armar el proyecto con las tablas «T3D …». Devuelve null si el libro no las tiene.
 * «base» da lo que no esté en las tablas (si falta la hoja de datos del proyecto, por ejemplo).
 */
export function proyectoDesdeTablas(hojas: Hoja[], base: Proyecto): { proyecto: Proyecto; avisos: string[] } | null {
  const H = (n: string) => hojas.find(h => h.nombre === n);
  if (!H(T.muros) || !H(T.niveles) || !H(T.proyecto)) return null;
  const avisos: string[] = [];
  const p: Proyecto = structuredClone(base);
  p.sitio = { ...p.sitio }; p.fundacion = { ...p.fundacion };
  delete p.areasAuto;
  delete p.exo;
  for (const g of leerHoja(H(T.proyecto))) {
    const d = DATOS.find(x => norm(x[0]) === norm(g('Dato')));
    if (d) d[3](p, g('Valor'));
  }
  p.niveles = leerHoja(H(T.niveles)).map(g => {
    const n: Nivel = { nombre: txt(g('Nivel')), cota: num(g('Cota (m)')) ?? 0 };
    const B = num(g('B (m)')), L = num(g('L (m)'));
    if (B !== null) n.B = B;
    if (L !== null) n.L = L;
    return n;
  });
  const cotaDe = (v: Valor, quien: string): number | null => {
    if (vacio(v)) return null;
    const x = num(v); if (x !== null) return x;
    const n = p.niveles.find(q => norm(q.nombre) === norm(v));
    if (!n) { avisos.push(`${quien}: el nivel «${txt(v)}» no está en «${T.niveles}»; se dejó vacío.`); return null; }
    return n.cota;
  };
  const tipoDe = (v: Valor): TipoElemento => { const t = norm(v); return t.includes('rect') ? 'tubo-rect' : t.includes('circ') ? 'tubo-circ' : t.startsWith('perfil') ? 'perfil' : 'tabique'; };
  p.muros = leerHoja(H(T.muros)).map(g => {
    const id = txt(g('Muro'));
    const m: Muro = {
      id, dir: txt(g('Dir.')).toUpperCase() === 'X' ? 'X' : 'Y', x: num(g('x (m)')) ?? 0, y: num(g('y (m)')) ?? 0, largo: num(g('Largo (m)')) ?? 0, espesor: num(g('Espesor (m)')) ?? 0,
      llega: !['no', 'n', '0', 'false'].includes(norm(g('Llega'))), areaInf: num(g('Área inf. (m²)')) ?? 0,
      piezaA: txt(g('Pieza A')), pegadoA: txt(g('Pegado a (A)')), piezaB: txt(g('Pieza B')), pegadoB: txt(g('Pegado a (B)')),
    };
    const tipo = tipoDe(g('Tipo'));
    if (tipo !== 'tabique') m.tipo = tipo;
    if (tipo === 'tubo-rect') m.ladoY = num(g('Lado y')) ?? m.largo;
    const de = cotaDe(g('Desde'), `Muro ${id}`), ha = cotaDe(g('Hasta'), `Muro ${id}`);
    if (de !== null) m.zDesde = de;
    if (ha !== null) m.zHasta = ha;
    if (txt(g('Rol A'))) m.rolA = txt(g('Rol A')) as RolMolde;
    if (txt(g('Rol B'))) m.rolB = txt(g('Rol B')) as RolMolde;
    if (sino(g('Pórtico'))) m.portico = true;
    if (txt(g('Grupo'))) m.grupo = txt(g('Grupo'));
    if (txt(g('Pieza tipo'))) m.pieza = { tipo: txt(g('Pieza tipo')) as TipoPieza, med: medLeer(txt(g('Medidas de la pieza'))) };
    if (txt(g('Vano con'))) m.vano = { con: txt(g('Vano con')), ancho: num(g('Vano ancho (m)')) ?? 0, tipo: norm(g('Vano tipo')) === 'hueco' ? 'hueco' : 'dintel' };
    if (txt(g('Grupo de dibujo'))) m.gd = txt(g('Grupo de dibujo'));
    if (txt(g('Ref. componente'))) m.cref = txt(g('Ref. componente'));
    return m;
  });
  // contornos
  const anillos = new Map<string, VerticePerfil[]>();
  for (const g of leerHoja(H(T.contornos))) {
    const clave = `${norm(g('Clase'))}|${txt(g('Elemento'))}|${num(g('Anillo')) ?? 0}`;
    const v: VerticePerfil & { k: number } = { x: num(g('x (m)')) ?? 0, y: num(g('y (m)')) ?? 0, k: num(g('Nº')) ?? 0 };
    const b = num(g('b (arco)')); if (b !== null) v.b = b;
    const c1x = num(g('c1 x')), c1y = num(g('c1 y')), c2x = num(g('c2 x')), c2y = num(g('c2 y'));
    if (c1x !== null && c1y !== null) v.c1 = { x: c1x, y: c1y };
    if (c2x !== null && c2y !== null) v.c2 = { x: c2x, y: c2y };
    if (!anillos.has(clave)) anillos.set(clave, []);
    anillos.get(clave)!.push(v);
  }
  const anillo = (clase: string, el: string, k = 0) => {
    const v = anillos.get(`${norm(clase)}|${el}|${k}`);
    return v ? (v as (VerticePerfil & { k: number })[]).sort((a, b) => a.k - b.k).map(({ k: _k, ...q }) => q) : null;
  };
  p.muros.forEach(m => {
    const v = anillo('perfil', m.id);
    if (!v) { if (m.tipo === 'perfil') avisos.push(`Muro ${m.id}: es un perfil pero no tiene vértices en «${T.contornos}».`); return; }
    const huecos: VerticePerfil[][] = [];
    for (let k = 1; anillo('perfil', m.id, k); k++) huecos.push(anillo('perfil', m.id, k)!);
    m.perfil = huecos.length ? { v, huecos } : { v };
  });
  p.niveles.forEach(n => {
    const s = anillo('silueta', n.nombre), c = anillo('carpintería', n.nombre);
    if (s) n.silueta = s;
    if (c) n.carpinteria = c;
  });
  // grupos
  const grupos: GrupoDib[] = leerHoja(H(T.grupos)).map(g => {
    const o: GrupoDib = { id: txt(g('Grupo')), nombre: txt(g('Nombre')) };
    if (txt(g('Dentro de'))) o.padre = txt(g('Dentro de'));
    if (sino(g('Bloqueado'))) o.bloq = true;
    if (sino(g('Oculto'))) o.oculto = true;
    if (txt(g('Componente'))) o.comp = txt(g('Componente'));
    const ux = num(g('Ubic. x (m)')), uy = num(g('Ubic. y (m)'));
    if (ux !== null && uy !== null) o.T = { x: ux, y: uy, g: ((num(g('Giro (× 90°)')) ?? 0) % 4) as 0 | 1 | 2 | 3, e: sino(g('Espejo')) };
    if (txt(g('Ref. componente'))) o.cref = txt(g('Ref. componente'));
    return o;
  });
  if (grupos.length) p.grupos = grupos; else delete p.grupos;
  const huecos: HuecoLosa[] = leerHoja(H(T.huecos)).map(g => {
    const h: HuecoLosa = { id: txt(g('Hueco')), nombre: txt(g('Nombre')), v: [] };
    const de = num(g('Desde (m)')), ha = num(g('Hasta (m)'));
    if (de !== null) h.zDesde = de;
    if (ha !== null) h.zHasta = ha;
    h.v = (anillo('hueco de losa', h.id) ?? []).map(q => ({ x: q.x, y: q.y }));
    return h;
  });
  if (huecos.length) p.huecosLosa = huecos; else delete p.huecosLosa;
  const caminos = leerHoja(H(T.caminos)).map(g => ({ id: txt(g('Camino')), nombre: txt(g('Nombre')), cerrado: sino(g('Cerrado')), v: anillo('camino', txt(g('Camino'))) ?? [] }));
  if (caminos.length) p.caminos = caminos; else delete p.caminos;
  const punto = (g: (n: string) => Valor, l: 'A' | 'B') => {
    const q: Cota['a'] = { x: num(g(`${l} x (m)`)) ?? 0, y: num(g(`${l} y (m)`)) ?? 0 };
    if (txt(g(`${l} muro`))) q.ref = { id: txt(g(`${l} muro`)), k: num(g(`${l} punto`)) ?? 0 };
    return q;
  };
  const cotas: Cota[] = leerHoja(H(T.cotas)).map(g => ({ id: txt(g('Cota')), tipo: (txt(g('Tipo')) || 'alineada') as Cota['tipo'], d: num(g('Desfase (m)')) ?? 0, a: punto(g, 'A'), b: punto(g, 'B') }));
  if (cotas.length) p.cotas = cotas; else delete p.cotas;
  const guias: Guia[] = leerHoja(H(T.guias)).map(g => {
    if (norm(g('Tipo')).startsWith('c')) return { id: txt(g('Guía')), t: 'circulo', c: { x: num(g('x (m)')) ?? 0, y: num(g('y (m)')) ?? 0 }, r: num(g('Radio (m)')) ?? 0 };
    const o: Guia = { id: txt(g('Guía')), t: 'recta', p: { x: num(g('x (m)')) ?? 0, y: num(g('y (m)')) ?? 0 }, ang: num(g('Ángulo (°)')) ?? 0 };
    if (txt(g('Eje'))) o.eje = txt(g('Eje'));
    if (sino(g('De la grilla'))) o.deEjes = true;
    return o;
  });
  if (guias.length) p.guias = guias; else delete p.guias;
  return { proyecto: p, avisos };
}
