/**
 * Torre 3D · sincronización con Google Sheets (dos vías) · versión 2 (con clave y bloqueo)
 *
 * Cómo se instala (una sola vez, en la copia de la planilla de cada alumno):
 *  1. Subí la planilla .xlsx a Google Drive y abrila con Google Sheets (Archivo → Guardar como Hojas de cálculo de Google).
 *  2. Extensiones → Apps Script. Borrá lo que haya y pegá este archivo entero. Guardá.
 *  3. Arriba, elegí la función «configurar» y tocá Ejecutar (autorizá con tu cuenta). En «Registro de ejecución» aparece
 *     la CLAVE: copiala. Fija también esta planilla como la única que el script puede tocar.
 *  4. Implementar → Nueva implementación → Tipo: Aplicación web. Ejecutar como: yo. Quién tiene acceso: cualquier persona.
 *     → Implementar. Copiá la dirección que termina en /exec.
 *  5. En Torre 3D: Exportar ▾ → Sincronizar con Google Sheets → pegá la dirección y la clave.
 *
 * Qué hace:
 *  - Torre 3D escribe las celdas de datos de la planilla, las tablas «T3D …» y el proyecto en «T3D».
 *  - Cuando vos editás a mano las tablas «T3D …» o los datos de la hoja «viento», el script lo anota y Torre 3D lo trae.
 *
 * Seguridad (informe técnico, hallazgo 3):
 *  - Sin la clave el script no lee ni escribe nada (la dirección sola ya no alcanza).
 *  - Abre la planilla por su ID (la que fijó «configurar»), nunca otra.
 *  - Solo escribe en las hojas y celdas previstas; las fórmulas no pueden llamar funciones (ni IMPORTXML, ni nada que
 *    saque datos afuera) y un texto que empieza con «=» se escribe como texto.
 *  - Valida el paquete entero antes de escribir la primera celda.
 *  - Un bloqueo del script (LockService.getScriptLock) cubre toda la escritura: dos editores no se pisan.
 *  - Exige la versión que la app vio por última vez: si la hoja cambió en el medio, rechaza la escritura («conflicto»).
 *  - Si algo se corta a la mitad, la marca «incompleta» queda puesta y la app vuelve a escribir todo.
 * Para cambiar la clave, volvé a ejecutar «configurar» (la anterior deja de servir).
 */
const HOJAS_EDITABLES = ['T3D Proyecto', 'T3D Niveles', 'T3D Muros', 'T3D Contornos', 'T3D Grupos', 'T3D Huecos de losa', 'T3D Caminos', 'T3D Cotas', 'T3D Guías', 'T3D Lofts'];
/** hojas de la planilla de la cátedra donde la app escribe celdas de datos */
const HOJAS_PLANILLA = ['viento', 'M,NyQ', 'J Tabiques paralelos', 'J Tabiques ortogonales', 'Rototrasl. cara mayor', 'Rototrasl. cara menor', 'Flex comp PB paralelos'];
const CELDAS_VIENTO = ['C4', 'D4', 'E4', 'F4', 'G4', 'I4', 'J4', 'K4', 'L4', 'O4'];
const TROZO = 40000;            // largo de cada celda de «T3D» (Sheets admite 50 000 caracteres por celda)
const MAX_FILAS = 300, MAX_COLS = 60, MAX_TEXTO = 2000, MAX_T3D = 4000000, MAX_FILAS_TABLA = 5000;

/** se ejecuta una vez a mano, desde el editor: fija la planilla y crea la clave */
function configurar() {
  const ss = SpreadsheetApp.getActive();
  const clave = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperties({ planilla: ss.getId(), clave: clave });
  Logger.log('CLAVE para Torre 3D: ' + clave);
  return clave;
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!claveValida_(p.clave)) return salida({ error: 'clave' });
  const accion = p.accion || 'estado';
  if (accion === 'estado') return salida(estado_());
  if (accion === 'leer') return conBloqueo_(function () { return leer_(); });
  return salida({ error: 'Acción desconocida: ' + accion });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return salida({ error: 'El paquete no es JSON.' }); }
  if (!claveValida_(d && d.clave)) return salida({ error: 'clave' });
  if (d.accion === 'escribir') return conBloqueo_(function () { return escribir_(d); });
  return salida({ error: 'Acción desconocida: ' + d.accion });
}

/** se ejecuta solo con cada edición hecha a mano (no con las que hace el script) */
function onEdit(e) {
  const hoja = e.range.getSheet().getName();
  const fila = e.range.getRow();
  if (HOJAS_EDITABLES.indexOf(hoja) >= 0 || (hoja === 'viento' && fila >= 4 && fila <= 58)) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return;                  // la app está escribiendo: su versión nueva ya cuenta esta edición
    try { marcar_('hoja'); } finally { lock.releaseLock(); }
  }
}

function salida(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function props_() { return PropertiesService.getScriptProperties(); }
function claveValida_(c) {
  const k = props_().getProperty('clave');
  if (!k || typeof c !== 'string' || c.length !== k.length) return false;
  let dif = 0; for (let i = 0; i < k.length; i++) dif |= k.charCodeAt(i) ^ c.charCodeAt(i);
  return dif === 0;
}
function planilla_() {
  const id = props_().getProperty('planilla');
  if (!id) throw new Error('Falta ejecutar «configurar» en el editor de Apps Script.');
  return SpreadsheetApp.openById(id);
}
function estado_() {
  const p = props_();
  return { version: Number(p.getProperty('version') || 0), origen: p.getProperty('origen') || 'app', incompleta: p.getProperty('escribiendo') === '1' };
}
/** suma una versión (con el bloqueo ya tomado) */
function marcar_(origen) {
  const p = props_(); const v = Number(p.getProperty('version') || 0) + 1;
  p.setProperties({ version: String(v), origen: origen });
  return v;
}
/** toda la operación con el bloqueo del script */
function conBloqueo_(f) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return salida({ error: 'ocupado' });
  try { return salida(f()); }
  catch (err) { return salida({ error: String(err && err.message || err) }); }
  finally { lock.releaseLock(); }
}

/** de «AB12» a [fila, columna] (null si no es una celda) */
function ref_(a1) {
  const m = /^([A-Z]{1,3})(\d{1,4})$/.exec(a1); if (!m) return null;
  let c = 0; for (let i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64);
  return [Number(m[2]), c];
}
function esFormula_(x) { return x !== null && typeof x === 'object' && typeof x.formula === 'string'; }
/** una fórmula de la app: solo referencias, números y + − × ÷ ( ); sin funciones (ningún nombre seguido de «(») */
function formulaSegura_(f) {
  const g = f.replace(/^=/, '');
  if (g.length > 200 || /[A-Za-z_]\s*\(/.test(g) || /["&;{}\\[\]]/.test(g)) return false;
  // nombres de hoja entre comillas: solo los de la planilla
  const hojas = g.match(/'[^']*'!/g) || [];
  for (let i = 0; i < hojas.length; i++) if (HOJAS_PLANILLA.indexOf(hojas[i].slice(1, -2)) < 0) return false;
  return /^[\w$!:'.,+\-*/() ]+$/.test(g);
}
/** un valor que se escribe tal cual: número, texto corto o vacío. Un texto que empieza con «=», «+», «-» o «@» va como texto */
function valorSeguro_(x) {
  if (x === null || x === '') return { ok: true, v: '' };
  if (typeof x === 'number') return isFinite(x) ? { ok: true, v: x } : { ok: false };
  if (typeof x === 'boolean') return { ok: true, v: x };
  if (typeof x === 'string') { if (x.length > MAX_TEXTO) return { ok: false }; return { ok: true, v: /^[=+\-@]/.test(x) ? "'" + x : x }; }
  return { ok: false };
}

/** revisa el paquete entero; devuelve el primer problema o null */
function validar_(d) {
  if (typeof d !== 'object' || d === null) return 'Paquete vacío.';
  const celdas = d.celdas || {};
  const hojas = Object.keys(celdas);
  for (let i = 0; i < hojas.length; i++) {
    const h = hojas[i];
    if (HOJAS_PLANILLA.indexOf(h) < 0) return 'Hoja no permitida: ' + h;
    const refs = Object.keys(celdas[h]);
    for (let j = 0; j < refs.length; j++) {
      const rc = ref_(refs[j]);
      if (!rc || rc[0] > MAX_FILAS || rc[1] > MAX_COLS) return 'Celda no permitida: ' + h + '!' + refs[j];
      const x = celdas[h][refs[j]];
      if (esFormula_(x)) { if (!formulaSegura_(x.formula)) return 'Fórmula no permitida en ' + h + '!' + refs[j]; }
      else if (!valorSeguro_(x).ok) return 'Valor no permitido en ' + h + '!' + refs[j];
    }
  }
  const tablas = d.tablas || [];
  if (!Array.isArray(tablas)) return 'Las tablas no son una lista.';
  for (let i = 0; i < tablas.length; i++) {
    const t = tablas[i];
    if (!t || HOJAS_EDITABLES.indexOf(t.nombre) < 0) return 'Tabla no permitida: ' + (t && t.nombre);
    if (!Array.isArray(t.filas) || t.filas.length > MAX_FILAS_TABLA) return 'Tabla demasiado grande: ' + t.nombre;
    for (let f = 0; f < t.filas.length; f++) {
      if (!Array.isArray(t.filas[f]) || t.filas[f].length > MAX_COLS) return 'Fila no válida en ' + t.nombre;
      for (let c = 0; c < t.filas[f].length; c++) if (!valorSeguro_(t.filas[f][c]).ok) return 'Valor no permitido en ' + t.nombre;
    }
  }
  if (d.t3d !== undefined && (typeof d.t3d !== 'string' || d.t3d.length > MAX_T3D)) return 'El proyecto (T3D) no es válido.';
  if (d.base !== undefined && d.base !== null && typeof d.base !== 'number') return 'Versión base no válida.';
  return null;
}

function escribir_(d) {
  const problema = validar_(d);
  if (problema) return { error: problema };
  const e = estado_();
  // la app escribe sobre la versión que vio; si la hoja cambió en el medio (otro editor, una edición a mano), no pisa
  if (typeof d.base === 'number' && d.base !== e.version && !d.forzar) return { error: 'conflicto', version: e.version, origen: e.origen };
  const ss = planilla_();
  props_().setProperty('escribiendo', '1');
  // celdas de la planilla: se agrupan en tramos seguidos de cada fila para escribir pocas veces
  Object.keys(d.celdas || {}).forEach(function (nombre) {
    const sh = ss.getSheetByName(nombre); if (!sh) return;
    const filas = {};
    Object.keys(d.celdas[nombre]).forEach(function (a1) { const rc = ref_(a1); (filas[rc[0]] = filas[rc[0]] || []).push([rc[1], d.celdas[nombre][a1]]); });
    Object.keys(filas).forEach(function (f) {
      const cs = filas[f].sort(function (a, b) { return a[0] - b[0]; });
      let i = 0;
      while (i < cs.length) {
        let j = i; while (j + 1 < cs.length && cs[j + 1][0] === cs[j][0] + 1 && !esFormula_(cs[j + 1][1]) && !esFormula_(cs[i][1])) j++;
        const tramo = cs.slice(i, j + 1);
        const rango = sh.getRange(Number(f), tramo[0][0], 1, tramo.length);
        if (tramo.length === 1 && esFormula_(tramo[0][1])) rango.setFormula('=' + tramo[0][1].formula.replace(/^=/, ''));
        else rango.setValues([tramo.map(function (x) { return valorSeguro_(x[1]).v; })]);
        i = j + 1;
      }
    });
  });
  // tablas editables
  (d.tablas || []).forEach(function (t) {
    const sh = ss.getSheetByName(t.nombre) || ss.insertSheet(t.nombre); sh.clearContents();
    const ancho = t.filas.reduce(function (a, f) { return Math.max(a, f.length); }, 1);
    const v = t.filas.map(function (f) { const g = f.map(function (x) { return valorSeguro_(x).v; }); while (g.length < ancho) g.push(''); return g; });
    if (v.length) sh.getRange(1, 1, v.length, ancho).setValues(v);
    sh.setFrozenRows(1);
  });
  // proyecto completo, en trozos
  if (typeof d.t3d === 'string') {
    const sh = ss.getSheetByName('T3D') || ss.insertSheet('T3D'); sh.clearContents();
    const trozos = []; for (let i = 0; i < d.t3d.length; i += TROZO) trozos.push([valorSeguro_(d.t3d.slice(i, i + TROZO)).v]);
    sh.getRange('A1').setValue('Torre 3D · proyecto (no editar a mano)');
    sh.getRange('B2').setValue(trozos.length);
    if (trozos.length) sh.getRange(3, 1, trozos.length, 1).setValues(trozos);
  }
  SpreadsheetApp.flush();
  const v = marcar_('app');
  props_().deleteProperty('escribiendo');
  return { version: v };
}

function leer_() {
  const ss = planilla_();
  const tablas = HOJAS_EDITABLES.map(function (n) { const sh = ss.getSheetByName(n); return { nombre: n, filas: sh ? sh.getDataRange().getValues() : [] }; });
  const viento = {}; const shv = ss.getSheetByName('viento');
  if (shv) { CELDAS_VIENTO.forEach(function (a1) { viento[a1] = shv.getRange(a1).getValue(); }); }
  let t3d = ''; const sht = ss.getSheetByName('T3D');
  if (sht) {
    const n = Number(sht.getRange('B2').getValue()) || 0;
    // un trozo escrito con apóstrofo (para que no sea fórmula) vuelve sin él: Sheets lo guarda como texto
    if (n) t3d = sht.getRange(3, 1, n, 1).getValues().map(function (r) { return String(r[0]); }).join('');
  }
  const e = estado_();
  return { version: e.version, origen: e.origen, incompleta: e.incompleta, tablas: tablas, viento: viento, t3d: t3d };
}
