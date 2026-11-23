/**
 * Lector único de proyectos (hallazgo 2 del informe técnico, docs/informes/analisis-tecnico-torre-3d.html).
 *
 * Todo proyecto que entra a la app pasa por acá antes de activarse, venga de donde venga: el guardado del navegador,
 * un archivo .json, la hoja «T3D» o las tablas «T3D …» de un Excel, Google Sheets o «Mis proyectos». El lector:
 *
 *  1. migra versiones anteriores del esquema (hoy hay una sola: version 1; la columna circular vieja se convierte);
 *  2. valida la estructura: cada número es un número finito, cada lista es una lista, cada texto es texto;
 *  3. valida reglas del dominio: medidas positivas, cotas distintas, nombres de muro únicos;
 *  4. repara lo que se puede reparar sin cambiar el cálculo y lo avisa: textos que faltan, niveles fuera de orden,
 *     referencias a muros o grupos que no existen.
 *
 * Si algo no se puede reparar devuelve los errores y el proyecto NO se activa: el que está abierto queda como estaba.
 * Regla: todo lo que la propia app puede guardar mientras se edita se acepta (a lo sumo con aviso); los errores son
 * datos que la app nunca produce (tipos equivocados, números que no son números, listas con huecos).
 * Es código puro (sin DOM), así se prueba con vitest.
 */
import { normalizarProyecto, type Muro, type Nivel, type Proyecto } from './modelo';
import { IDS_METODO, METODOS, type IdMetodo } from './metodos/tipos';
import { CIUDADES, GCPI } from './cargas/cirsoc102';

export type Lectura = { ok: true; proyecto: Proyecto; avisos: string[] } | { ok: false; errores: string[] };

const MAX_ERRORES = 12;
const esObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const nulo = (x: unknown) => x === undefined || x === null;

const TIPOS = ['tabique', 'tubo-rect', 'tubo-circ', 'perfil'];
const ROLES = ['', 'alma', 'alma der.', 'ala sup.', 'ala inf.', 'fuera'];
const CAMPOS_SITIO = ['V', 'Kd', 'I', 'zg', 'alfa', 'Kzt', 'G', 'Cpb', 'Cps', 'GCpi'] as const;

/** Lee y valida un proyecto. «x» puede ser el texto JSON o el objeto ya leído. */
export function leerProyecto(x: unknown): Lectura {
  const errores: string[] = [], avisos: string[] = [];
  const error = (t: string) => { if (errores.length < MAX_ERRORES) errores.push(t); };
  let p: unknown = x;
  if (typeof x === 'string') {
    try { p = JSON.parse(x); } catch { return { ok: false, errores: ['El archivo no es JSON válido.'] }; }
  }
  if (!esObj(p)) return { ok: false, errores: ['No es un proyecto de Torre 3D.'] };
  // --- 1. versión del esquema (punto de migración: cuando haya version 2, las de 1 se convierten acá)
  if (p.version !== 1) {
    return { ok: false, errores: [typeof p.version === 'number' && p.version > 1
      ? `El proyecto es de una versión más nueva de Torre 3D (esquema ${p.version}). Actualizá la app para abrirlo.`
      : 'No es un proyecto de Torre 3D (falta la versión del esquema).'] };
  }
  const q = structuredClone(p) as Record<string, unknown>;

  // --- 2. textos generales
  for (const k of ['nombre', 'alumno'] as const) {
    if (nulo(q[k])) q[k] = '';
    else if (typeof q[k] !== 'string') { q[k] = String(q[k]); avisos.push(`«${k}» no era texto: se convirtió.`); }
  }
  if (!nulo(q.hormigon) && typeof q.hormigon !== 'string') error('El hormigón tiene que ser un texto como «H30».');

  // --- sitio (datos del viento)
  if (!esObj(q.sitio)) error('Faltan los datos del viento (sitio).');
  else {
    const s = q.sitio;
    CAMPOS_SITIO.forEach(k => { if (!num(s[k])) error(`Viento: «${k}» tiene que ser un número.`); });
    if (num(s.V) && s.V <= 0) error('Viento: la velocidad V tiene que ser mayor que 0.');
    if (!nulo(s.parapeto) && !(num(s.parapeto) && s.parapeto >= 0)) error('Viento: el parapeto tiene que ser un número ≥ 0.');
  }
  // --- fundación
  if (!esObj(q.fundacion) || !num(q.fundacion.b1) || !num(q.fundacion.a1) || q.fundacion.b1 < 0 || q.fundacion.a1 < 0) {
    error('La fundación tiene que tener b1 y a1 (números ≥ 0).');
  } else if (!nulo((q.fundacion as Record<string, unknown>).sigmaAdm) && !(num((q.fundacion as Record<string, unknown>).sigmaAdm) && ((q.fundacion as Record<string, unknown>).sigmaAdm as number) > 0)) {
    error('La tensión admisible del suelo tiene que ser un número mayor que 0 (kg/cm²).');
  }

  // --- niveles
  // lo que la propia app produce mientras se edita (sin niveles, dos niveles con la misma cota al insertar una fila)
  // se acepta con aviso: el lector no puede impedir volver a abrir un proyecto que la app guardó
  if (!Array.isArray(q.niveles)) error('Faltan los niveles.');
  else if (q.niveles.length === 0) avisos.push('El proyecto no tiene niveles.');
  else {
    const niveles = q.niveles as unknown[];
    niveles.forEach((n, i) => {
      const quien = `Nivel ${i + 1}`;
      if (!esObj(n)) { error(`${quien}: está vacío o dañado.`); return; }
      if (nulo(n.nombre)) n.nombre = `Nivel ${i + 1}`;
      else if (typeof n.nombre !== 'string') n.nombre = String(n.nombre);
      if (!num(n.cota)) error(`${quien} («${n.nombre}»): la cota tiene que ser un número.`);
      for (const k of ['B', 'L', 'pisos'] as const) if (!nulo(n[k]) && !(num(n[k]) && (n[k] as number) > 0)) error(`${quien} («${n.nombre}»): «${k}» tiene que ser un número mayor que 0 o quedar vacío.`);
      for (const k of ['silueta', 'carpinteria'] as const) if (!nulo(n[k]) && !contornoValido(n[k], 0)) error(`${quien} («${n.nombre}»): la ${k === 'silueta' ? 'silueta' : 'carpintería'} está dañada.`);
    });
    if (!errores.length) {
      const ns = niveles as Nivel[];
      const vistas = new Set<number>();
      ns.forEach(n => { const k = Math.round(n.cota * 1e6); if (vistas.has(k)) avisos.push(`Hay dos niveles con la cota ${n.cota}: revisalos en la tabla de Niveles.`); vistas.add(k); });
      if (ns.some((n, i) => i > 0 && n.cota > ns[i - 1].cota)) {
        ns.sort((a, b) => b.cota - a.cota);   // estable: los de igual cota quedan en su orden
        avisos.push('Los niveles no estaban ordenados de arriba hacia abajo: se ordenaron.');
      }
    }
  }

  // --- muros
  const ids = new Set<string>();
  if (!Array.isArray(q.muros)) error('Faltan los muros (puede ser una lista vacía).');
  else {
    (q.muros as unknown[]).forEach((m, i) => {
      if (errores.length >= MAX_ERRORES) return;
      const quien = `Muro ${i + 1}`;
      if (!esObj(m)) { error(`${quien}: está vacío o dañado.`); return; }
      if (typeof m.id === 'number') m.id = String(m.id);
      if (typeof m.id !== 'string' || !m.id.trim()) { error(`${quien}: le falta el nombre.`); return; }
      const nom = `Muro «${m.id}»`;
      if (ids.has(m.id)) error(`Hay dos muros que se llaman «${m.id}».`);
      ids.add(m.id);
      if (m.dir !== 'X' && m.dir !== 'Y') error(`${nom}: la dirección tiene que ser X o Y.`);
      for (const k of ['x', 'y', 'largo', 'espesor'] as const) if (!num(m[k])) error(`${nom}: «${k}» tiene que ser un número.`);
      if (num(m.largo) && m.largo <= 0) error(`${nom}: el largo tiene que ser mayor que 0.`);
      if (num(m.espesor) && m.espesor <= 0) error(`${nom}: el espesor tiene que ser mayor que 0.`);
      if (nulo(m.areaInf)) m.areaInf = 0; else if (!(num(m.areaInf) && m.areaInf >= 0)) error(`${nom}: el área de influencia tiene que ser un número ≥ 0.`);
      if (nulo(m.llega)) m.llega = true; else if (typeof m.llega !== 'boolean') error(`${nom}: «llega» tiene que ser sí o no.`);
      for (const k of ['piezaA', 'pegadoA', 'piezaB', 'pegadoB'] as const) {
        if (nulo(m[k])) m[k] = ''; else if (typeof m[k] !== 'string') m[k] = String(m[k]);
      }
      if (!nulo(m.tipo) && !TIPOS.includes(m.tipo as string)) error(`${nom}: tipo de elemento desconocido («${String(m.tipo)}»).`);
      if (!nulo(m.ladoY) && !(num(m.ladoY) && m.ladoY > 0)) error(`${nom}: el lado en y tiene que ser mayor que 0.`);
      if (!nulo(m.refLado) && m.refLado !== 1 && m.refLado !== -1) error(`${nom}: la línea de referencia está dañada.`);
      for (const k of ['zDesde', 'zHasta'] as const) if (!nulo(m[k]) && !num(m[k])) error(`${nom}: «${k}» tiene que ser un número o quedar vacío.`);
      if (num(m.zDesde) && num(m.zHasta) && m.zHasta <= m.zDesde) avisos.push(`${nom}: termina (${m.zHasta}) antes de empezar (${m.zDesde}); no está en ningún piso.`);
      for (const k of ['rolA', 'rolB'] as const) if (!nulo(m[k]) && !ROLES.includes(m[k] as string)) error(`${nom}: el papel en el molde («${String(m[k])}») no existe.`);
      if (!nulo(m.espesores) && !(Array.isArray(m.espesores) && m.espesores.every(t => esObj(t) && num(t.desde) && num(t.e) && t.e > 0))) error(`${nom}: los tramos de espesor están dañados.`);
      if (!nulo(m.aberturas) && !(Array.isArray(m.aberturas) && m.aberturas.every(a => esObj(a) && num(a.s) && num(a.ancho) && num(a.desde) && num(a.alto) && a.ancho > 0 && a.alto > 0))) error(`${nom}: las aberturas están dañadas.`);
      if (!nulo(m.caladoJ) && m.caladoJ !== 'entero' && m.caladoJ !== 'corte') error(`${nom}: «caladoJ» tiene que ser «entero» o «corte».`);
      if (!nulo(m.vano) && !(esObj(m.vano) && typeof m.vano.con === 'string' && num(m.vano.ancho) && (m.vano.tipo === 'dintel' || m.vano.tipo === 'hueco'))) error(`${nom}: el vano está dañado.`);
      if (!nulo(m.perfil) && !(esObj(m.perfil) && contornoValido(m.perfil.v, 0) && (nulo(m.perfil.huecos) || (Array.isArray(m.perfil.huecos) && m.perfil.huecos.every(h => contornoValido(h, 0)))))) error(`${nom}: el contorno del perfil está dañado.`);
      if (!nulo(m.circular) && !(esObj(m.circular) && num(m.circular.D) && num(m.circular.d) && m.circular.D > 0)) error(`${nom}: la columna circular está dañada.`);
      if (!nulo(m.pieza) && !(esObj(m.pieza) && typeof m.pieza.tipo === 'string' && esObj(m.pieza.med))) error(`${nom}: la pieza tipo está dañada.`);
      for (const k of ['grupo', 'gd', 'cref'] as const) if (!nulo(m[k]) && typeof m[k] !== 'string') error(`${nom}: «${k}» tiene que ser texto.`);
      if (!nulo(m.portico) && typeof m.portico !== 'boolean') error(`${nom}: «pórtico» tiene que ser sí o no.`);
    });
  }

  // --- listas opcionales del proyecto
  for (const k of ['grupos', 'caminos', 'cotas', 'guias', 'huecosLosa', 'lofts'] as const) {
    if (!nulo(q[k]) && !(Array.isArray(q[k]) && (q[k] as unknown[]).every(esObj))) error(`«${k}» está dañado.`);
  }
  if (Array.isArray(q.grupos) && !(q.grupos as Record<string, unknown>[]).every(g => typeof g.id === 'string')) error('Hay un grupo sin identificador.');
  if (Array.isArray(q.huecosLosa) && !(q.huecosLosa as Record<string, unknown>[]).every(h => contornoValido(h.v, 0))) error('Hay un hueco de losa con el contorno dañado.');
  if (Array.isArray(q.lofts) && !(q.lofts as Record<string, unknown>[]).every(l => typeof l.id === 'string' && Array.isArray(l.cotas) && (l.cotas as unknown[]).length >= 2 && (l.cotas as unknown[]).every(c => typeof c === 'number' && isFinite(c)))) error('Hay un loft de losas dañado (necesita un nombre y al menos dos cotas).');
  if (!nulo(q.perfilTorre) && !(esObj(q.perfilTorre) && Array.isArray(q.perfilTorre.puntos) && (q.perfilTorre.puntos as unknown[]).every(x => esObj(x) && typeof x.h === 'number' && typeof x.fx === 'number'))) error('El perfil de la torre está dañado (cada punto necesita h y fx).');
  if (!nulo(q.carpinteriaRetiro) && typeof q.carpinteriaRetiro !== 'number') error('«carpinteriaRetiro» tiene que ser un número o quedar vacío.');
  for (const k of ['juntas', 'parPerp', 'clasesPieza'] as const) if (!nulo(q[k]) && !esObj(q[k])) error(`«${k}» está dañado.`);
  if (!nulo(q.areasAuto) && !num(q.areasAuto)) error('«areasAuto» tiene que ser una cota o quedar vacío.');
  if (!nulo(q.exo) && !esObj(q.exo)) error('El exoesqueleto está dañado.');
  // datos del viento CIRSOC 102-25 y de las cargas CIRSOC 101-25 (opcionales: vacío = por defecto)
  if (!nulo(q.cirsoc102)) {
    const c = q.cirsoc102;
    if (!esObj(c)) error('Los datos del viento CIRSOC 102-25 están dañados.');
    else {
      if (!nulo(c.ciudad) && !(typeof c.ciudad === 'string' && c.ciudad in CIUDADES)) error(`CIRSOC 102-25: ciudad desconocida («${String(c.ciudad)}»).`);
      if (!nulo(c.categoria) && !['I', 'II', 'III-IV'].includes(c.categoria as string)) error('CIRSOC 102-25: la categoría de riesgo tiene que ser I, II o III-IV.');
      if (!nulo(c.exposicion) && !['B', 'C', 'D'].includes(c.exposicion as string)) error('CIRSOC 102-25: la exposición tiene que ser B, C o D.');
      if (!nulo(c.cerramiento) && !((c.cerramiento as string) in GCPI)) error('CIRSOC 102-25: cerramiento desconocido.');
      if (!nulo(c.frecuencia) && !['tabiques', 'otros', 'manual'].includes(c.frecuencia as string)) error('CIRSOC 102-25: forma de calcular la frecuencia desconocida.');
      for (const k of ['Vmanual', 'Kzt', 'altitud', 'n1manual', 'beta', 'recurrenciaServicio'] as const) if (!nulo(c[k]) && !num(c[k])) error(`CIRSOC 102-25: «${k}» tiene que ser un número.`);
    }
  }
  if (!nulo(q.cirsoc101)) {
    const c = q.cirsoc101;
    if (!esObj(c)) error('Las cargas CIRSOC 101-25 están dañadas.');
    else {
      if (!nulo(c.destino) && !['vivienda', 'oficinas', 'otro'].includes(c.destino as string)) error('CIRSOC 101-25: destino desconocido.');
      for (const k of ['D', 'Lmanual'] as const) if (!nulo(c[k]) && !(num(c[k]) && (c[k] as number) >= 0)) error(`CIRSOC 101-25: «${k}» tiene que ser un número ≥ 0.`);
    }
  }
  if (!nulo(q.cirsoc201)) {
    const c = q.cirsoc201;
    if (!esObj(c)) error('Los datos del hormigón (CIRSOC 201) están dañados.');
    else {
      if (!nulo(c.recubrimiento) && c.recubrimiento !== 'interior' && c.recubrimiento !== 'exterior') error('CIRSOC 201: recubrimiento «interior» o «exterior».');
      // clases del CIRSOC 200-24 y las tres que usaba la app antes (se migran al leer: datos201De)
      if (!nulo(c.exposicion) && !['A1-A2', 'A3-Q1-C1', 'marina-agresiva', 'A1', 'A2', 'A3', 'CL1', 'CL2', 'M1', 'M2', 'M3', 'C1', 'C2', 'Q1', 'Q2', 'Q3'].includes(c.exposicion as string)) error('CIRSOC 201: clase de exposición desconocida.');
      if (!nulo(c.vidaUtil) && c.vidaUtil !== 50 && c.vidaUtil !== 100) error('CIRSOC 200: la vida útil tiene que ser 50 o 100 años.');
      if (!nulo(c.control) && c.control !== 'con' && c.control !== 'sin') error('CIRSOC 200: el control de ejecución es «con» o «sin».');
      if (!nulo(c.recManual) && !(num(c.recManual) && (c.recManual as number) > 0)) error('CIRSOC 201: el recubrimiento a mano tiene que ser un número mayor que 0.');
      if (!nulo(c.limiteDeriva) && ![400, 500, 600].includes(c.limiteDeriva as number)) error('CIRSOC 201: el límite de deriva tiene que ser 400, 500 o 600.');
    }
  }
  // cómo se calcula (método, versión de la planilla, armado): valores conocidos o vacío
  if (!nulo(q.calculo)) {
    const c = q.calculo;
    if (!esObj(c)) error('La configuración del cálculo está dañada.');
    else {
      if (!nulo(c.metodo) && !IDS_METODO.includes(c.metodo as IdMetodo)) error(`Método de cálculo desconocido («${String(c.metodo)}»).`);
      if (!nulo(c.version) && c.version !== 'actual' && c.version !== 'nuevo') error(`Versión de la planilla desconocida («${String(c.version)}»).`);
      if (!nulo(c.armado) && c.armado !== 'catedra' && c.armado !== 'app') error(`Armado de piezas desconocido («${String(c.armado)}»).`);
      if (!nulo(c.formulas) && typeof c.formulas !== 'string') error('La versión de las fórmulas tiene que ser texto.');
      if (!nulo(c.verificacion) && c.verificacion !== 'simple' && c.verificacion !== 'completa') error('La verificación tiene que ser «simple» o «completa».');
      if (!nulo(c.teoria) && c.teoria !== 'timoshenko' && c.teoria !== 'euler') error('La teoría del FEM tiene que ser «timoshenko» o «euler».');
      if (!nulo(c.metodo) && IDS_METODO.includes(c.metodo as IdMetodo) && !METODOS[c.metodo as IdMetodo].disponible) {
        avisos.push(`El proyecto se calculó con el método «${METODOS[c.metodo as IdMetodo].nombre}», que todavía no está en esta versión de la app: se usa «${METODOS.planilla.nombre}».`);
        c.metodo = 'planilla';
      }
    }
  }

  if (errores.length) return { ok: false, errores };

  // --- 3. referencias: lo que apunta a algo que no existe se suelta (no cambia el cálculo) y se avisa
  const proyecto = q as unknown as Proyecto;
  const grupos = new Set((proyecto.grupos ?? []).map(g => g.id));
  let sueltas = 0;
  proyecto.muros.forEach((m: Muro) => {
    if (m.vano && !ids.has(m.vano.con)) { delete m.vano; sueltas++; }
    if (m.gd && !grupos.has(m.gd)) { delete m.gd; sueltas++; }
  });
  (proyecto.grupos ?? []).forEach(g => { if (g.padre && !grupos.has(g.padre)) { delete g.padre; sueltas++; } });
  (proyecto.cotas ?? []).forEach(c => [c.a, c.b].forEach(pt => { if (pt?.ref && !ids.has(pt.ref.id)) { delete pt.ref; sueltas++; } }));
  if (sueltas) avisos.push(`${sueltas === 1 ? 'Una referencia apuntaba' : `${sueltas} referencias apuntaban`} a muros o grupos que no existen: se soltó.`);

  return { ok: true, proyecto: normalizarProyecto(proyecto), avisos };
}

/** contorno: lista de vértices (al menos «min») con x e y numéricos (b, c1 y c2 opcionales) */
function contornoValido(v: unknown, min: number): boolean {
  return Array.isArray(v) && v.length >= min && v.every(p => esObj(p) && num(p.x) && num(p.y) && (nulo(p.b) || num(p.b))
    && (nulo(p.c1) || (esObj(p.c1) && num(p.c1.x) && num(p.c1.y))) && (nulo(p.c2) || (esObj(p.c2) && num(p.c2.x) && num(p.c2.y))));
}

/** el primer error, o todos en una lista corta, para mostrar */
export const textoErrores = (e: string[]) => (e.length === 1 ? e[0] : `${e.length >= MAX_ERRORES ? `Más de ${MAX_ERRORES - 1}` : e.length} problemas: ${e.slice(0, 4).join(' · ')}${e.length > 4 ? ' …' : ''}`);
