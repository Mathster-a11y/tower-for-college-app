/**
 * El proyecto completo en tablas legibles, para que la planilla alcance sola para volver a armar la torre.
 *
 * Hojas (todas con encabezados en la fila 1; el orden de las columnas no importa al leer):
 *  - «T3D Proyecto»: nombre, alumno, hormigón, fundación y datos del viento.
 *  - «T3D Niveles»: nombre, cota, B y L de cada nivel y los pisos reales que junta (torres de más de 49 pisos).
 *  - «T3D Muros»: todos los datos de cada muro (los de siempre y los de grupos, piezas tipo, vanos y moldes).
 *  - «T3D Contornos»: vértices de perfiles irregulares, siluetas y carpinterías de los niveles, huecos de losa y caminos.
 *  - «T3D Grupos», «T3D Huecos de losa», «T3D Caminos», «T3D Cotas», «T3D Guías».
 *  - «T3D Lofts»: los lofts de losas (las cotas de las losas sección, separadas con «;», el tipo y el giro).
 * La hoja «T3D» (el proyecto en JSON) queda como respaldo; si están estas tablas, mandan ellas.
 */
import type { Cota, GrupoDib, HuecoLosa, Muro, Nivel, Proyecto, RolMolde, TipoElemento } from '../engine/modelo';
import type { VerticePerfil } from '../engine/perfil';
import type { Guia } from '../engine/guias';
import type { Loft } from '../engine/loft';
import type { MedidasPieza, TipoPieza } from '../engine/piezasTipo';
import type { Hoja, Valor } from './tablas';
import { EXO_POR_DEFECTO, type TipoExo } from '../engine/exo';
import { IDS_METODO, type IdMetodo } from '../engine/metodos/tipos';

export interface Tabla { nombre: string; filas: Valor[][]; anchos: number[] }
export const T = {
  proyecto: 'T3D Proyecto', niveles: 'T3D Niveles', muros: 'T3D Muros', contornos: 'T3D Contornos', grupos: 'T3D Grupos',
  huecos: 'T3D Huecos de losa', caminos: 'T3D Caminos', cotas: 'T3D Cotas', guias: 'T3D Guías', lofts: 'T3D Lofts', exo: 'T3D Exo',
} as const;

type Exo = NonNullable<Proyecto['exo']>;
const secTxt = (s: { b: number; e: number }) => `${s.b}x${s.e}`;
const secLeer = (t: string) => { const r = /^\s*([\d.,]+)\s*[x×]\s*([\d.,]+)\s*$/i.exec(t); return r ? { b: Number(r[1].replace(',', '.')), e: Number(r[2].replace(',', '.')) } : null; };
/**
 * «T3D Exo»: lo del exoesqueleto que no entra en «T3D Proyecto» (lo de los ejemplos reales: cortes de los módulos,
 * secciones por tramos, alas, vanos, caras que siguen la planta, …). Dato, valor y qué es, como «T3D Proyecto».
 */
const DATOS_EXO: [string, string, (x: Exo) => Valor, (x: Exo, v: Valor) => void][] = [
  ['Vanos (diagrid)', 'rombos por cara (ficha A)', x => x.vanos ?? null, (x, v) => { const n = num(v); if (n) x.vanos = n; }],
  ['Paso de los nudos (m)', 'diagrid: separación horizontal de los nudos (manda sobre «vanos»)', x => x.pasoH ?? null, (x, v) => { const n = num(v); if (n) x.pasoH = n; }],
  ['Alas', 'tubo (fichas B, C, D): columnas intermedias de cada cara perpendicular al viento', x => x.alas ?? null, (x, v) => { const n = num(v); if (n !== null) x.alas = n; }],
  ['Caras siguen la planta', 'sí: las caras toman el B y el L de cada nivel (columnas de esquina inclinadas)', x => b2s(x.anchoVariable), (x, v) => { if (sino(v)) x.anchoVariable = true; }],
  ['Material', 'acero u hormigón', x => x.material ?? null, (x, v) => { const t = norm(v); if (t === 'acero' || t === 'hormigon') x.material = t; }],
  ['Peso específico (t/m³)', 'vacío = 7,85 el acero y 2,4 el hormigón', x => x.gamma ?? null, (x, v) => { const n = num(v); if (n) x.gamma = n; }],
  ['Tubos sin costura', 'sí: límites de la pared de la Tabla 2.2.1 del CIRSOC 302 para tubos sin costura', x => b2s(x.sinCostura), (x, v) => { if (sino(v)) x.sinCostura = true; }],
  ['Columnas a los cuartos (ficha E)', 'como el Citicorp: columnas a los cuartos de la cara y viga a medio módulo', x => b2s(x.cuartos), (x, v) => { if (sino(v)) x.cuartos = true; }],
  ['Esquina cortada (ficha E)', 'la columna de esquina termina un piso abajo del nudo de cada módulo', x => b2s(x.esquinaCortada), (x, v) => { if (sino(v)) x.esquinaCortada = true; }],
  ['Ancho del núcleo (ficha F)', 'en el sentido del viento, en m (vacío: un tercio de la planta)', x => x.nucleo ?? null, (x, v) => { const n = Number(txt(v).replace(',', '.')); if (txt(v) && n > 0) x.nucleo = n; }],
  ['Cotas de los brazos (ficha F)', 'cordón de arriba de cada outrigger, en m, separadas por «;» (vacío: a media altura)', x => (x.outriggers?.length ? x.outriggers.join('; ') : null), (x, v) => { const c = txt(v).split(';').map(t => Number(t.trim().replace(',', '.'))).filter(z => isFinite(z) && z > 0); if (c.length) x.outriggers = c; }],
  ['Cinturón (ficha F)', 'no: sin cinturón (solo trabaja la columna que toca el brazo); vacío o sí: con cinturón', x => (x.cinturon === false ? 'no' : null), (x, v) => { if (txt(v).toLowerCase() === 'no') x.cinturon = false; }],
  ['Columnas en cada cara (ficha F)', 'columnas de cada cara perpendicular al viento que toma el cinturón (vacío: 4)', x => x.columnasCara ?? null, (x, v) => { const n = Math.round(Number(txt(v))); if (txt(v) && n >= 1) x.columnasCara = n; }],
  ['Brazos desde el principio (ficha F)', 'sí: los brazos se conectan desde el principio de la obra y toman parte del peso; vacío: al terminar la obra gruesa', x => b2s(x.brazosDesdeElPrincipio), (x, v) => { if (sino(v)) x.brazosDesdeElPrincipio = true; }],
  ['Diagonales arriostradas por las losas', 'sí: cada diagonal se ata a la losa en cada piso que cruza y pandea de piso a piso', x => b2s(x.arriostradas), (x, v) => { if (sino(v)) x.arriostradas = true; }],
  ['Losas en el exo', 'las losas apoyan en el exo: «franja; peso; sobrecarga» en m y t/m² (vacío: solo lo atan)', x => (x.losas ? [x.losas.franja, x.losas.qD ?? 0.7, x.losas.qL ?? 0.2].join('; ') : null),
    (x, v) => { const c = txt(v).split(';').map(t => Number(t.trim().replace(',', '.'))); if (c[0] > 0) x.losas = { franja: c[0], ...(isFinite(c[1]) && c[1] !== 0.7 ? { qD: c[1] } : {}), ...(isFinite(c[2]) && c[2] !== 0.2 ? { qL: c[2] } : {}) }; }],
  ['Mástil de la base (ficha E)', 'otra pieza debajo del primer módulo: «lado x espesor hasta cota», en m', x => (x.mastilBase ? `${secTxt(x.mastilBase.sec)} hasta ${x.mastilBase.hasta}` : null),
    (x, v) => { const r = /^(.+?)\s+hasta\s+([\d.,-]+)\s*$/i.exec(txt(v)); const sc = r && secLeer(r[1]); if (r && sc) x.mastilBase = { sec: sc, hasta: Number(r[2].replace(',', '.')) }; }],
  ['Cortes de los módulos (m)', 'cotas de los bordes de los módulos, de abajo arriba, separadas por «;» (mandan sobre el módulo)', x => (x.cortes?.length ? x.cortes.join('; ') : null),
    (x, v) => { const c = txt(v).split(';').map(t => Number(t.trim().replace(',', '.'))).filter(isFinite); if (c.length >= 2) x.cortes = c; }],
  ['Secciones por tramos', 'desde una cota, otra sección: «diagonal desde 30: 0.3x0.012; columna desde 60: 0.4x0.02» (clase: columna, diagonal, viga o mastil)', x => (x.tramos?.length ? x.tramos.map(t => `${t.clase} desde ${t.desde}: ${secTxt(t.sec)}`).join('; ') : null),
    (x, v) => {
      const ts = txt(v).split(';').map(t => /^\s*(columna|diagonal|viga|mastil)\s+desde\s+([\d.,-]+)\s*:\s*(.+)$/i.exec(t)).filter(Boolean).map(r => ({ clase: r![1].toLowerCase() as 'columna' | 'diagonal' | 'viga' | 'mastil', desde: Number(r![2].replace(',', '.')), sec: secLeer(r![3]) }));
      const ok = ts.filter(t => t.sec) as NonNullable<Exo['tramos']>;
      if (ok.length) x.tramos = ok;
    }],
  ['Notas', 'de dónde sale cada número (fuentes y supuestos), separadas por « | »', x => (x.notas?.length ? x.notas.join(' | ') : null), (x, v) => { const n = txt(v).split(' | ').map(t => t.trim()).filter(Boolean); if (n.length) x.notas = n; }],
];

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
  ['σt adm del suelo (kg/cm²)', 'tensión admisible del estudio de suelos (vacío = 2,5, la de la guía)', p => p.fundacion.sigmaAdm ?? null, (p, v) => { const x = num(v); p.fundacion.sigmaAdm = x && x > 0 ? x : null; }],
  ...(['V', 'Kd', 'I', 'zg', 'alfa', 'Kzt', 'G', 'Cpb', 'Cps', 'GCpi'] as const).map(k => [
    k, { V: 'velocidad básica del viento (m/s)', Kd: 'factor de direccionalidad', I: 'factor de importancia', zg: 'zg de la exposición (m)', alfa: 'α de la exposición', Kzt: 'factor topográfico', G: 'factor de ráfaga', Cpb: 'Cp a barlovento', Cps: 'Cp a sotavento', GCpi: 'presión interna GCpi' }[k],
    (p: Proyecto) => p.sitio[k], (p: Proyecto, v: Valor) => { p.sitio[k] = num(v) ?? 0; }] as [string, string, (p: Proyecto) => Valor, (p: Proyecto, v: Valor) => void]),
  // cómo se calcula (va con el proyecto: el archivo da lo mismo en cualquier computadora). Vacío = la configuración de siempre
  ['Método', 'método de cálculo: planilla (planilla virgen), guia, cirsoc o fem', p => p.calculo?.metodo ?? null,
    (p, v) => { const t = norm(v); if (IDS_METODO.includes(t as IdMetodo)) p.calculo = { ...(p.calculo ?? {}), metodo: t as IdMetodo }; }],
  ['Versión de la planilla', 'anterior o 2025', p => (p.calculo?.version ? (p.calculo.version === 'nuevo' ? '2025' : 'anterior') : null),
    (p, v) => { const t = norm(v); if (t === '2025' || t === 'anterior') p.calculo = { ...(p.calculo ?? {}), version: t === '2025' ? 'nuevo' : 'actual' }; }],
  ['Armado de piezas', 'catedra (método simplificado de la cátedra) o app', p => p.calculo?.armado ?? null,
    (p, v) => { const t = norm(v); if (t === 'catedra' || t === 'app') p.calculo = { ...(p.calculo ?? {}), armado: t }; }],
  ['Verificación', 'métodos CIRSOC y FEM: simple o completa', p => p.calculo?.verificacion ?? null,
    (p, v) => { const t = norm(v); if (t === 'simple' || t === 'completa') p.calculo = { ...(p.calculo ?? {}), verificacion: t }; }],
  ['Piezas del FEM', 'método FEM: timoshenko o euler', p => p.calculo?.teoria ?? null,
    (p, v) => { const t = norm(v); if (t === 'timoshenko' || t === 'euler') p.calculo = { ...(p.calculo ?? {}), teoria: t }; }],
  ['Versión de las fórmulas', 'con qué versión de la app se calculó (informativo)', p => p.calculo?.formulas ?? null,
    (p, v) => { const t = txt(v); if (t) p.calculo = { ...(p.calculo ?? {}), formulas: t }; }],
  // viento CIRSOC 102-25 y cargas CIRSOC 101-25 (métodos CIRSOC y FEM); vacío = por defecto
  ...([['ciudad', 'CIRSOC 102: ciudad', 'ciudad de la Fig. 1.5-1D (vacío = la de la V del 102-2005)', 't'],
    ['Vmanual', 'CIRSOC 102: V a mano (m/s)', 'en lugar de la ciudad', 'n'], ['categoria', 'CIRSOC 102: categoría de riesgo', 'I, II o III-IV', 't'],
    ['exposicion', 'CIRSOC 102: exposición', 'B, C o D', 't'], ['Kzt', 'CIRSOC 102: Kzt', 'factor topográfico (1 = llano)', 'n'],
    ['altitud', 'CIRSOC 102: altitud (m)', 'sobre el nivel del mar (Ke)', 'n'], ['cerramiento', 'CIRSOC 102: cerramiento', 'cerrado, parcialmente cerrado, parcialmente abierto o abierto', 't'],
    ['frecuencia', 'CIRSOC 102: frecuencia', 'tabiques (1.9-5), otros (1.9-4) o manual', 't'], ['n1manual', 'CIRSOC 102: n1 (Hz)', 'frecuencia de un análisis', 'n'],
    ['beta', 'CIRSOC 102: amortiguamiento', '0,02 = 2 %', 'n'], ['recurrenciaServicio', 'CIRSOC 102: recurrencia de servicio (años)', '5, 10, 25, 50, 100, 200 o 500', 'n'],
  ] as const).map(([k, rot, desc, t]) => [rot, desc, (p: Proyecto) => (p.cirsoc102?.[k] ?? null) as Valor,
    (p: Proyecto, v: Valor) => { const x = t === 'n' ? num(v) : txt(v) || null; if (x !== null) p.cirsoc102 = { ...(p.cirsoc102 ?? {}), [k]: x }; }] as [string, string, (p: Proyecto) => Valor, (p: Proyecto, v: Valor) => void]),
  ...([['D', 'CIRSOC 101: D losa (t/m²)', 'carga permanente de la losa', 'n'], ['destino', 'CIRSOC 101: destino', 'vivienda, oficinas u otro', 't'],
    ['Lmanual', 'CIRSOC 101: L a mano (kN/m²)', 'sobrecarga si el destino es «otro»', 'n'],
  ] as const).map(([k, rot, desc, t]) => [rot, desc, (p: Proyecto) => (p.cirsoc101?.[k] ?? null) as Valor,
    (p: Proyecto, v: Valor) => { const x = t === 'n' ? num(v) : txt(v) || null; if (x !== null) p.cirsoc101 = { ...(p.cirsoc101 ?? {}), [k]: x }; }] as [string, string, (p: Proyecto) => Valor, (p: Proyecto, v: Valor) => void]),
  ['Parapeto (m)', 'parapeto o baranda sobre la última losa: se suma a la altura de influencia de la azotea (vacío = 0)', p => p.sitio.parapeto ?? null, (p, v) => { const x = num(v); if (x && x > 0) p.sitio.parapeto = x; else delete p.sitio.parapeto; }],
  ['Exo: ficha', 'exoesqueleto: A diagrid, B mega-marcos, C mega-columnas y cinturones, D tubo en X, E chevrones al mástil, F núcleo con outriggers, M malla sobre la fachada, L libre (barra por barra; vacío = sin exoesqueleto)', p => p.exo?.tipo ?? null,
    (p, v) => { const t = txt(v).toUpperCase(); if (['A', 'B', 'C', 'D', 'E', 'F', 'M', 'L'].includes(t)) p.exo = { ...structuredClone(EXO_POR_DEFECTO), ...(p.exo ?? {}), tipo: t as TipoExo }; else delete p.exo; }],
  ['Exo: malla (ficha M)', 'la malla sobre la fachada, en JSON: patron (diagrid o columnas), nudos, esquinas, giro (°), hasta (m), arriostrada (losas atadas)',
    p => (p.exo?.malla ? JSON.stringify(p.exo.malla) : null),
    (p, v) => {
      if (!p.exo || !txt(v)) return;
      try {
        const x = JSON.parse(txt(v)), n = Number(x?.nudos);
        if (!x || !['diagrid', 'columnas'].includes(x.patron) || !(n >= 3)) return;
        const m: NonNullable<NonNullable<Proyecto['exo']>['malla']> = { patron: x.patron, nudos: Math.round(n) };
        if (typeof x.esquinas === 'boolean') m.esquinas = x.esquinas;
        if (typeof x.arriostrada === 'boolean') m.arriostrada = x.arriostrada;
        if (Number.isFinite(x.giro)) m.giro = x.giro;
        if (Number.isFinite(x.hasta) && x.hasta > 0) m.hasta = x.hasta;
        p.exo.malla = m;
      } catch { /* texto que no es JSON: se ignora */ }
    }],
  ...([['Exo: separación (m)', 'distancia de la fachada al eje de las columnas', 'separacion'], ['Exo: módulo (pisos)', 'alto de cada cruz, marco o diamante', 'modulo'],
    ['Exo: E del acero (t/m²)', 'módulo de elasticidad', 'E'], ['Exo: σ admisible (t/m²)', 'tensión admisible del acero', 'sigmaAdm'], ['Exo: flecha objetivo (h / …)', 'δ azotea ≤ h / este número (vacío = 500)', 'limiteH']] as const).map(([k, q, c]) =>
    [k, q, (p: Proyecto) => p.exo?.[c] ?? null, (p: Proyecto, v: Valor) => { const x = num(v); if (p.exo && x !== null) p.exo[c] = x; }] as [string, string, (p: Proyecto) => Valor, (p: Proyecto, v: Valor) => void]),
  ...(['columna', 'diagonal', 'viga'] as const).flatMap(c => (['b', 'e'] as const).map(k =>
    [`Exo: ${c} ${k === 'b' ? 'lado' : 'espesor'} (m)`, `tubo cuadrado de la ${c}`, (p: Proyecto) => p.exo?.[c][k] ?? null, (p: Proyecto, v: Valor) => { const x = num(v); if (p.exo && x !== null) p.exo[c][k] = x; }] as [string, string, (p: Proyecto) => Valor, (p: Proyecto, v: Valor) => void])),
  ['Exo: uniones', 'columna, diagonal y viga: rígida o articulada; base: empotrada o articulada', p => (p.exo?.uniones ? (['columna', 'diagonal', 'viga', 'base'] as const).filter(k => p.exo!.uniones![k]).map(k => `${k}=${p.exo!.uniones![k] === 'rigida' ? 'rígida' : p.exo!.uniones![k]}`).join('; ') : null),
    (p, v) => { if (!p.exo) return; const u: NonNullable<NonNullable<Proyecto['exo']>['uniones']> = {}; txt(v).split(';').forEach(par => { const [k, w] = par.split('=').map(x => x.trim().toLowerCase()); if (k === 'base') u.base = w.startsWith('art') ? 'articulada' : 'empotrada'; else if (k === 'columna' || k === 'diagonal' || k === 'viga') u[k] = w.startsWith('art') ? 'articulada' : 'rigida'; }); if (Object.keys(u).length) p.exo.uniones = u; }],
  ['Exo: viento', 'cómo llega el viento al exo: «losas» (en cada piso) o «fachada» (repartido en las barras de borde)', p => p.exo?.viento ?? null, (p, v) => { if (p.exo && txt(v)) p.exo.viento = txt(v).toLowerCase().startsWith('fach') ? 'fachada' : 'losas'; }],
  ['Exo: peso propio', 'peso del acero como carga repartida (sí / no; vacío = sí)', p => (p.exo?.pesoPropio === undefined ? null : p.exo.pesoPropio ? SI : 'no'), (p, v) => { if (p.exo && txt(v)) p.exo.pesoPropio = txt(v).toLowerCase() !== 'no'; }],
  ['Exo: chevrones desde el piso (ficha E)', 'piso sobre PB donde empiezan los chevrones; abajo solo el mástil', p => p.exo?.pisoInicio ?? null, (p, v) => { const x = num(v); if (p.exo && x !== null) p.exo.pisoInicio = x; }],
  ...(['b', 'e'] as const).map(k => [`Exo: mástil ${k === 'b' ? 'lado' : 'espesor'} (m)`, 'columna central de cada cara (ficha E)', (p: Proyecto) => p.exo?.mastil?.[k] ?? null,
    (p: Proyecto, v: Valor) => { const x = num(v); if (p.exo && x !== null) p.exo.mastil = { ...(p.exo.mastil ?? p.exo.columna), [k]: x }; }] as [string, string, (p: Proyecto) => Valor, (p: Proyecto, v: Valor) => void]),
  ['Exo: cambios por barra', 'barra por barra: «C5 a=art b=rig sec=0.3x0.0125; D3 quitar» (a, b: uniones de cada extremo)', p => {
    const b = p.exo?.barras; if (!b || !Object.keys(b).length) return null;
    return Object.entries(b).map(([id, c]) => [id, ...(c.quitar ? ['quitar'] : []), ...(c.relA !== undefined ? [`a=${c.relA ? 'art' : 'rig'}`] : []), ...(c.relB !== undefined ? [`b=${c.relB ? 'art' : 'rig'}`] : []), ...(c.sec ? [`sec=${c.sec.b}x${c.sec.e}`] : [])].join(' ')).join('; ');
  }, (p, v) => {
    if (!p.exo || !txt(v)) return;
    const out: NonNullable<NonNullable<Proyecto['exo']>['barras']> = {};
    txt(v).split(';').map(x => x.trim()).filter(Boolean).forEach(item => {
      const [id, ...partes] = item.split(/\s+/); const c: NonNullable<NonNullable<Proyecto['exo']>['barras']>[string] = {};
      partes.forEach(pt => { if (pt === 'quitar') c.quitar = true; else if (pt.startsWith('a=')) c.relA = pt.slice(2).startsWith('art'); else if (pt.startsWith('b=')) c.relB = pt.slice(2).startsWith('art'); else if (pt.startsWith('sec=')) { const [bb, ee] = pt.slice(4).replace(/,/g, '.').split('x').map(Number); if (bb > 0 && ee > 0) c.sec = { b: bb, e: ee }; } });
      out[id] = c;
    });
    p.exo.barras = out;
  }],
  ['Exo: barras agregadas', 'barras agregadas a mano entre nudos de la cara (s, z en m), en JSON', p => (p.exo?.nuevas?.length ? JSON.stringify(p.exo.nuevas) : null),
    (p, v) => { if (!p.exo || !txt(v)) return; try { const x = JSON.parse(txt(v)); if (Array.isArray(x)) p.exo.nuevas = x.filter(b => ['diagonal', 'viga', 'columna'].includes(b?.clase) && Array.isArray(b.a) && Array.isArray(b.b)); } catch { /* texto que no es JSON: se ignora */ } }],
  ['Exo: zonas en altura', 'otra tipología desde una cota: «0 D; 45 A m=6 v=2» (cota en m, ficha, m: pisos por módulo, v: vanos; vacío = toda la torre con la ficha)',
    p => (p.exo?.zonas?.length ? p.exo.zonas.map(z => [z.desde, z.tipo, z.modulo ? `m=${z.modulo}` : '', z.vanos ? `v=${z.vanos}` : ''].filter(x => x !== '').join(' ')).join('; ') : null),
    (p, v) => { if (!p.exo || !txt(v)) return; const zs = txt(v).split(';').map(it => { const [d, t, ...r] = it.trim().split(/\s+/); const z: NonNullable<NonNullable<Proyecto['exo']>['zonas']>[number] = { desde: num(d) ?? NaN, tipo: (t ?? '').toUpperCase() as TipoExo }; r.forEach(x => { const [k, w] = x.split('='); const n = num(w); if (n !== null && k === 'm') z.modulo = n; if (n !== null && k === 'v') z.vanos = n; }); return z; }).filter(z => isFinite(z.desde) && ['A', 'B', 'C', 'D', 'E', 'L'].includes(z.tipo)); if (zs.length) p.exo.zonas = zs; }],
  ['Perfil de la planta en altura', 'cómo cambia la planta con la altura (carta «Perfil de la torre» de la planta), en JSON: base (cota), puntos (h de 0 a 1, fx, fy, dx, dy), suave, giro; vacío = sin perfil',
    p => (p.perfilTorre ? JSON.stringify(p.perfilTorre) : null),
    (p, v) => { if (!txt(v)) return; try { const x = JSON.parse(txt(v)); if (x && Array.isArray(x.puntos)) p.perfilTorre = x; } catch { /* texto que no es JSON: se ignora */ } }],
  ['Planos de corte', 'planos que recortan las losas, en JSON: eje (x o y), a y b (w, z en m), saca (arriba o abajo); vacío = ninguno',
    p => (p.planosCorte?.length ? JSON.stringify(p.planosCorte.map(({ antes: _a, ...q }) => q)) : null),
    (p, v) => { if (!txt(v)) return; try { const x = JSON.parse(txt(v)); if (Array.isArray(x)) p.planosCorte = x.filter(q => q && (q.eje === 'x' || q.eje === 'y') && q.a && q.b); } catch { /* no es JSON */ } }],
  ['Carpintería por tramos', 'desde una cota hacia arriba: «0 sin; 34,75 losa 0,3; 230 continua 0,3» (cota en m, modo sin, losa (por piso) o continua (envolvente), retiro en m y, si va, plana o curva)',
    p => (p.carpinteriaTramos?.length ? p.carpinteriaTramos.map(t => [String(t.desde).replace('.', ','), t.modo, ...(t.retiro ? [String(t.retiro).replace('.', ',')] : []), ...(t.forma ? [t.forma] : [])].join(' ')).join('; ') : null),
    (p, v) => { if (!txt(v)) return; const ts = txt(v).split(';').map(it => { const [d, m0, ...resto] = it.trim().split(/\s+/); const m = ({ piso: 'losa', envolvente: 'continua' } as Record<string, string>)[(m0 ?? '').toLowerCase()] ?? (m0 ?? '').toLowerCase(); const t: NonNullable<Proyecto['carpinteriaTramos']>[number] = { desde: num(d) ?? NaN, modo: m as 'sin' | 'losa' | 'continua' }; resto.forEach(x => { const f = x.toLowerCase(); if (f === 'plana' || f === 'curva') t.forma = f; else { const rr = num(x); if (rr !== null) t.retiro = rr; } }); return t; }).filter(t => isFinite(t.desde) && ['sin', 'losa', 'continua'].includes(t.modo)); if (ts.length) p.carpinteriaTramos = ts; }],
  ['Envolvente', 'la piel diseñada aparte de las losas, en JSON: planta (vértices en la losa base), perfil (como «Perfil de la torre») y planos (como «Planos de corte»); vacío = la piel sigue el borde de las losas',
    p => (p.envolvente ? JSON.stringify(p.envolvente) : null),
    (p, v) => { if (!txt(v)) return; try { const x = JSON.parse(txt(v)); if (x && Array.isArray(x.planta) && x.planta.length >= 3 && x.perfil && Array.isArray(x.perfil.puntos)) p.envolvente = x; } catch { /* no es JSON */ } }],
  ['Carpintería fija', 'sí = la carpintería no sigue a las losas: los tramos no la recalculan y las losas se editan sin tocarla (vacío = sigue)', p => b2s(!!p.carpinteriaFija), (p, v) => { if (sino(v)) p.carpinteriaFija = true; }],
  ['Panelería', 'montantes cada m; antepecho opaco m; travesaños intermedios; y si va, reparto (parejo o fijo); origen (inicio, centro o fin); desfase m: «1,5; 0,9; 0» o «1,5; 0,9; 0; fijo; centro; 0,25» (vacío = sin paneles)',
    p => { const q = p.paneleria; if (!q) return null; const f = (x: number) => String(x).replace('.', ','); const base = [f(q.modulo), f(q.antepecho ?? 0), f(q.intermedios ?? 0)]; return (q.regla === 'fijo' ? [...base, 'fijo', q.origen ?? 'centro', f(q.desfase ?? 0)] : base).join('; '); },
    (p, v) => { if (!txt(v)) return; const xs = txt(v).split(';').map(x => x.trim()); const [m, a, i] = xs.map(x => num(x)); if (m === null || m === undefined || !(m > 0)) return; const q: NonNullable<Proyecto['paneleria']> = { modulo: m, antepecho: a ?? 0, intermedios: i ?? 0 }; if ((xs[3] ?? '').toLowerCase() === 'fijo') { q.regla = 'fijo'; const o = (xs[4] ?? '').toLowerCase(); if (o === 'inicio' || o === 'fin' || o === 'centro') q.origen = o; const d = num(xs[5]); if (d) q.desfase = d; } p.paneleria = q; }],
  ['Panelería: alabeo máximo (mm)', 'cuánto puede salirse del plano un paño: 5 = plano (vacío), 15 = curvado en frío, «libre» = sin límite', p => (p.paneleria?.alabeoMax === -1 ? 'libre' : p.paneleria?.alabeoMax ? +(p.paneleria.alabeoMax * 1000).toFixed(1) : null), (p, v) => { if (!p.paneleria || !txt(v)) return; if (txt(v).toLowerCase() === 'libre') { p.paneleria.alabeoMax = -1; return; } const x = num(v); if (x && x > 0) p.paneleria.alabeoMax = x / 1000; }],
  ['Panelería: caras', 'ajustes por cara de la fachada, en JSON: id (azimut°·inclinación°·distancia), tipo (vidrio, opaca o abierta) y módulo; vacío = ninguno', p => (p.paneleria?.caras?.length ? JSON.stringify(p.paneleria.caras) : null), (p, v) => { if (!p.paneleria || !txt(v)) return; try { const x = JSON.parse(txt(v)); if (Array.isArray(x)) p.paneleria.caras = x.filter(c => c && typeof c.id === 'string'); } catch { /* no es JSON */ } }],
  ['Carpintería: retiro de la losa (m)', 'la carpintería de cada nivel sigue a su losa, metida estos metros (vacío = a mano)', p => p.carpinteriaRetiro ?? null, (p, v) => { const x = num(v); if (x !== null) p.carpinteriaRetiro = x; }],
  ['Juntas entre muros', 'qué pasa en cada encuentro: «M1|M2=inglete; M3|M4=pasaA» (pasaA: pasa el primero; vacío = el convenio por defecto)', p => (p.juntas && Object.keys(p.juntas).length ? Object.entries(p.juntas).map(([k, v]) => `${k}=${v}`).join('; ') : null),
    (p, v) => { const t = txt(v); if (!t) return; const o: Record<string, 'inglete' | 'pasaA' | 'pasaB'> = {}; t.split(';').forEach(par => { const k = par.lastIndexOf('='); if (k < 0) return; const val = par.slice(k + 1).trim(); if (val === 'inglete' || val === 'pasaA' || val === 'pasaB') o[par.slice(0, k).trim()] = val; }); if (Object.keys(o).length) p.juntas = o; }],
  ['Perfil de la torre', 'las curvas de Diseño → Perfil, en JSON (vacío = sin perfil dibujado)', p => (p.perfil ? JSON.stringify(p.perfil) : null),
    // (los archivos guardados con la carta de la planta antes de unirse con el editor de Diseño → Perfil usaban esta
    //  misma fila para el perfil de la planta: si el JSON tiene «puntos», es ese)
    (p, v) => { if (!txt(v)) return; try { const x = JSON.parse(txt(v)); if (x && x.A && x.B) p.perfil = x; else if (x && Array.isArray(x.puntos) && !p.perfilTorre) p.perfilTorre = x; } catch { /* dañado: se ignora */ } }],
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
  'Desde', 'Hasta', 'Rol A', 'Rol B', 'Pórtico', 'Grupo', 'Pieza tipo', 'Medidas de la pieza', 'Vano con', 'Vano ancho (m)', 'Vano tipo', 'Grupo de dibujo', 'Ref. componente', 'Espesor en altura', 'Línea de referencia', 'Aberturas', 'Calado (J)', 'Solo gravedad'];
const CAB_CONT = ['Elemento', 'Clase', 'Anillo', 'Nº', 'x (m)', 'y (m)', 'b (arco)', 'c1 x', 'c1 y', 'c2 x', 'c2 y'];

/** las tablas del proyecto, listas para escribir en la planilla o en Google Sheets */
export function tablasProyecto(p: Proyecto): Tabla[] {
  const nombreNivel = (z: number | null | undefined) => (z == null ? null : p.niveles.find(n => Math.abs(n.cota - z) < 1e-9)?.nombre ?? z);
  const out: Tabla[] = [];
  out.push({ nombre: T.proyecto, anchos: [26, 16, 70], filas: [['Dato', 'Valor', 'Qué es'], ...DATOS.map(([k, q, g]) => [k, g(p) ?? null, q] as Valor[]),
    [], ['Estas hojas «T3D …» guardan la torre completa: con ellas la app vuelve a armar el proyecto. Se pueden editar; la app las lee al abrir la planilla.']] });
  if (p.exo) out.push({ nombre: T.exo, anchos: [30, 34, 70], filas: [['Dato', 'Valor', 'Qué es'], ...DATOS_EXO.map(([k, q, g]) => [k, g(p.exo!) ?? null, q] as Valor[])] });
  out.push({ nombre: T.niveles, anchos: [14, 10, 10, 10, 12, 12, 12, 12, 14, 14, 10], filas: [['Nivel', 'Cota (m)', 'B (m)', 'L (m)', 'Pisos reales', 'Corrido x (m)', 'Corrido y (m)', 'Silueta a mano', 'Carpintería a mano', 'Voladizo a propósito', 'Sin losa'], ...p.niveles.map(n => [n.nombre, n.cota, n.B ?? null, n.L ?? null, n.pisos && n.pisos > 1 ? n.pisos : null, n.dx || null, n.dy || null, n.manual ? SI : null, n.carpManual ? SI : null, n.carpVoladizo ? SI : null, n.sinLosa ? SI : null])] });
  out.push({ nombre: T.muros, anchos: [10, 6, 9, 9, 9, 9, 7, 13, 10, 12, 10, 12, 11, 8, 10, 10, 9, 9, 8, 10, 11, 28, 10, 12, 9, 14, 14, 30, 12, 34, 10, 12], filas: [CAB_MUROS, ...p.muros.map(m => [
    m.id, m.dir, m.x, m.y, m.largo, m.espesor, m.llega ? SI : 'no', m.areaInf, m.piezaA || null, m.pegadoA || null, m.piezaB || null, m.pegadoB || null,
    TIPO_TXT[m.tipo ?? 'tabique'], m.tipo === 'tubo-rect' ? m.ladoY ?? null : null, nombreNivel(m.zDesde), nombreNivel(m.zHasta),
    m.rolA || null, m.rolB || null, b2s(m.portico), m.grupo ?? null, m.pieza?.tipo ?? null, m.pieza ? medTxt(m.pieza.med) : null,
    m.vano?.con ?? null, m.vano?.ancho ?? null, m.vano?.tipo ?? null, m.gd ?? null, m.cref ?? null,
    // «nivel=espesor; …»: desde ese nivel hacia arriba, ese espesor
    m.espesores?.length ? [...m.espesores].sort((a, b) => a.desde - b.desde).map(t => `${nombreNivel(t.desde)}=${String(t.e).replace('.', ',')}`).join('; ') : null,
    // línea de referencia: eje (vacío), cara + (izquierda del eje) o cara − (derecha)
    m.refLado === 1 ? 'cara +' : m.refLado === -1 ? 'cara −' : null,
    // «s ancho×alto desde h [cara]; …» (s: posición sobre el eje, la cara o el ángulo del tubo)
    m.aberturas?.length ? m.aberturas.map(a => `${String(a.s).replace('.', ',')} ${String(a.ancho).replace('.', ',')}x${String(a.alto).replace('.', ',')} desde ${String(a.desde).replace('.', ',')}${a.cara ? ` ${a.cara}` : ''}`).join('; ') : null,
    // calado: «corte» (la sección más débil va a la hoja J); vacío = entero (como la cátedra)
    m.caladoJ === 'corte' ? 'corte' : null,
    // solo de gravedad: no forma pieza a propósito (no avisa)
    b2s(!!m.soloGravedad),
  ] as Valor[])] });
  const cont: Valor[][] = [CAB_CONT];
  const vert = (el: string, clase: string, anillo: number, v: { x: number; y: number; b?: number; c1?: { x: number; y: number }; c2?: { x: number; y: number } }[]) =>
    v.forEach((q, k) => cont.push([el, clase, anillo, k + 1, q.x, q.y, q.b ?? null, q.c1?.x ?? null, q.c1?.y ?? null, q.c2?.x ?? null, q.c2?.y ?? null]));
  p.muros.forEach(m => { if (m.perfil) { vert(m.id, 'perfil', 0, m.perfil.v); (m.perfil.huecos ?? []).forEach((h, i) => vert(m.id, 'perfil', i + 1, h)); } });
  p.niveles.forEach(n => { if (n.silueta) vert(n.nombre, 'silueta', 0, n.silueta); if (n.carpinteria) vert(n.nombre, 'carpintería', 0, n.carpinteria); });
  (p.huecosLosa ?? []).forEach(h => vert(h.id, 'hueco de losa', 0, h.v));
  (p.caminos ?? []).forEach(c => vert(c.id, 'camino', 0, c.v));
  out.push({ nombre: T.contornos, anchos: [12, 14, 8, 6, 10, 10, 10, 9, 9, 9, 9], filas: cont });
  out.push({ nombre: T.grupos, anchos: [10, 18, 10, 10, 8, 12, 9, 9, 10, 8, 14, 8], filas: [['Grupo', 'Nombre', 'Dentro de', 'Bloqueado', 'Oculto', 'Componente', 'Ubic. x (m)', 'Ubic. y (m)', 'Giro (× 90°)', 'Espejo', 'Ref. componente', 'Fijo'],
    ...(p.grupos ?? []).map(g => [g.id, g.nombre, g.padre ?? null, b2s(g.bloq), b2s(g.oculto), g.comp ?? null, g.T?.x ?? null, g.T?.y ?? null, g.T ? g.T.g : null, g.T ? (g.T.e ? SI : 'no') : null, g.cref ?? null, b2s(g.fijo)] as Valor[])] });
  out.push({ nombre: T.huecos, anchos: [10, 18, 12, 12], filas: [['Hueco', 'Nombre', 'Desde (m)', 'Hasta (m)'], ...(p.huecosLosa ?? []).map(h => [h.id, h.nombre, h.zDesde ?? null, h.zHasta ?? null] as Valor[])] });
  out.push({ nombre: T.caminos, anchos: [10, 18, 9], filas: [['Camino', 'Nombre', 'Cerrado'], ...(p.caminos ?? []).map(c => [c.id, c.nombre, c.cerrado ? SI : 'no'] as Valor[])] });
  out.push({ nombre: T.cotas, anchos: [8, 10, 9, 9, 9, 10, 8, 9, 9, 10, 8], filas: [['Cota', 'Tipo', 'Desfase (m)', 'A x (m)', 'A y (m)', 'A muro', 'A punto', 'B x (m)', 'B y (m)', 'B muro', 'B punto'],
    ...(p.cotas ?? []).map(c => [c.id, c.tipo, c.d, c.a.x, c.a.y, c.a.ref?.id ?? null, c.a.ref?.k ?? null, c.b.x, c.b.y, c.b.ref?.id ?? null, c.b.ref?.k ?? null] as Valor[])] });
  out.push({ nombre: T.guias, anchos: [8, 9, 9, 9, 11, 9, 8, 11], filas: [['Guía', 'Tipo', 'x (m)', 'y (m)', 'Ángulo (°)', 'Radio (m)', 'Eje', 'De la grilla'],
    ...(p.guias ?? []).map(g => g.t === 'recta' ? [g.id, 'recta', g.p.x, g.p.y, g.ang, null, g.eje ?? null, b2s(g.deEjes)] as Valor[] : [g.id, 'círculo', g.c.x, g.c.y, null, g.r, null, null] as Valor[])] });
  out.push({ nombre: T.lofts, anchos: [10, 26, 9, 10, 12], filas: [['Loft', 'Losas sección (cotas, m)', 'Tipo', 'Giro (°)', 'Escribe B y L'],
    ...(p.lofts ?? []).map(l => [l.id, [...l.cotas].sort((a, b) => a - b).join('; '), l.tipo ?? 'recto', l.giro ?? 0, l.bl === false ? 'no' : SI] as Valor[])] });
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
  delete p.perfilTorre; delete p.carpinteriaRetiro; delete p.planosCorte; delete p.carpinteriaTramos; delete p.paneleria; delete p.carpinteriaFija; delete p.envolvente;
  for (const g of leerHoja(H(T.proyecto))) {
    const d = DATOS.find(x => norm(x[0]) === norm(g('Dato')));
    if (d) d[3](p, g('Valor'));
  }
  if (p.exo && H(T.exo)) for (const g of leerHoja(H(T.exo))) {
    const d = DATOS_EXO.find(x => norm(x[0]) === norm(g('Dato')));
    if (d) d[3](p.exo, g('Valor'));
  }
  p.niveles = leerHoja(H(T.niveles)).map(g => {
    const n: Nivel = { nombre: txt(g('Nivel')), cota: num(g('Cota (m)')) ?? 0 };
    const B = num(g('B (m)')), L = num(g('L (m)'));
    if (B !== null) n.B = B;
    if (L !== null) n.L = L;
    const ps = num(g('Pisos reales'));
    if (ps !== null && ps > 1) n.pisos = Math.round(ps);
    if (sino(g('Silueta a mano'))) n.manual = true;
    if (sino(g('Carpintería a mano'))) n.carpManual = true;
    if (sino(g('Voladizo a propósito'))) n.carpVoladizo = true;
    if (sino(g('Sin losa'))) n.sinLosa = true;
    // torre inclinada o corrida (Diseño → Perfil): cuánto se corre el nivel respecto de PB
    const dx = num(g('Corrido x (m)')), dy = num(g('Corrido y (m)'));
    if (dx) n.dx = dx;
    if (dy) n.dy = dy;
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
    if (txt(g('Espesor en altura'))) {
      const tramos = txt(g('Espesor en altura')).split(';').map(x => x.trim()).filter(Boolean).map(par => {
        const k = par.lastIndexOf('='); if (k < 0) return null;
        const z = cotaDe(par.slice(0, k).trim(), `Muro ${id} (espesor en altura)`), e = num(par.slice(k + 1).trim());
        return z !== null && e !== null && e > 0 ? { desde: z, e } : null;
      }).filter(Boolean) as { desde: number; e: number }[];
      if (tramos.length) m.espesores = tramos;
    }
    const rf = txt(g('Línea de referencia')).replace(/\s+/g, '');
    if (rf === 'cara+') m.refLado = 1; else if (rf === 'cara−' || rf === 'cara-') m.refLado = -1;
    if (txt(g('Aberturas'))) {
      const ab = txt(g('Aberturas')).split(';').map(x => x.trim()).filter(Boolean).map(t => {
        const r = /^(-?[\d.,]+)\s+([\d.,]+)\s*x\s*([\d.,]+)\s+desde\s+([\d.,]+)(?:\s+([xy][+-]))?$/i.exec(t);
        if (!r) { avisos.push(`Muro ${id}: no entendí la abertura «${t}» (formato: posición ancho×alto desde h [cara]).`); return null; }
        const n = (v: string) => Number(v.replace(',', '.'));
        return { s: n(r[1]), ancho: n(r[2]), alto: n(r[3]), desde: n(r[4]), ...(r[5] ? { cara: r[5].toLowerCase() as 'x+' | 'x-' | 'y+' | 'y-' } : {}) };
      }).filter(Boolean) as NonNullable<Muro['aberturas']>;
      if (ab.length) m.aberturas = ab;
    }
    if (norm(g('Calado (J)')).startsWith('corte')) m.caladoJ = 'corte';
    if (sino(g('Solo gravedad'))) m.soloGravedad = true;
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
    if (sino(g('Fijo'))) o.fijo = true;
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
  // sin la hoja (un libro o un script de Sheets de antes de los lofts) quedan los de la base, que es el mismo proyecto
  const lofts: Loft[] = !H(T.lofts) ? base.lofts ?? [] : leerHoja(H(T.lofts)).map(g => {
    const l: Loft = { id: txt(g('Loft')), cotas: String(g('Losas sección (cotas, m)') ?? '').split(';').map(x => num(x)).filter((x): x is number => x !== null) };
    if (norm(g('Tipo')).startsWith('s')) l.tipo = 'suave';
    const gi = num(g('Giro (°)')); if (gi) l.giro = gi;
    if (norm(g('Escribe B y L')) === 'no') l.bl = false;
    return l;
  }).filter(l => l.id && l.cotas.length >= 2);
  if (lofts.length) p.lofts = lofts; else delete p.lofts;
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
