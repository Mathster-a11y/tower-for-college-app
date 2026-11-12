/**
 * Torre 3D · sincronización con Google Sheets (dos vías)
 *
 * Cómo se instala (una sola vez, en la copia de la planilla del curso):
 *  1. Subí la planilla .xlsx a Google Drive y abrila con Google Sheets (Archivo → Guardar como Hojas de cálculo de Google).
 *  2. Extensiones → Apps Script. Borrá lo que haya y pegá este archivo entero. Guardá.
 *  3. Implementar → Nueva implementación → Tipo: Aplicación web.
 *     Ejecutar como: yo. Quién tiene acceso: cualquier persona. → Implementar → autorizá con tu cuenta.
 *  4. Copiá la dirección que termina en /exec y pegala en Torre 3D: Exportar ▾ → Sincronizar con Google Sheets.
 *
 * Qué hace:
 *  - Torre 3D escribe las celdas de datos de la planilla, las tablas «T3D Niveles» y «T3D Muros» y el proyecto en «T3D».
 *  - Cuando vos editás a mano «T3D Niveles», «T3D Muros» o los datos de la hoja «viento» (fila 4 y cotas B5:B58),
 *    este script lo anota y Torre 3D lo trae en unos segundos.
 * La dirección /exec es la llave: quien la tenga puede leer y escribir esta planilla. No la publiques.
 */
const HOJAS_EDITABLES = ['T3D Niveles', 'T3D Muros'];
const CELDAS_VIENTO = ['C4', 'D4', 'E4', 'F4', 'G4', 'I4', 'J4', 'K4', 'L4', 'O4'];
const TROZO = 40000;   // largo de cada celda de «T3D» (Sheets admite 50 000 caracteres por celda)

function doGet(e) {
  const accion = (e && e.parameter && e.parameter.accion) || 'estado';
  if (accion === 'estado') return salida(estado_());
  if (accion === 'leer') return salida(leer_());
  return salida({ error: 'Acción desconocida: ' + accion });
}

function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  if (d.accion === 'escribir') return salida(escribir_(d));
  return salida({ error: 'Acción desconocida: ' + d.accion });
}

/** se ejecuta solo con cada edición hecha a mano (no con las que hace el script) */
function onEdit(e) {
  const hoja = e.range.getSheet().getName();
  const fila = e.range.getRow();
  if (HOJAS_EDITABLES.indexOf(hoja) >= 0 || (hoja === 'viento' && fila >= 4 && fila <= 58)) marcar_('hoja');
}

function salida(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function props_() { return PropertiesService.getDocumentProperties(); }
function estado_() { const p = props_(); return { version: Number(p.getProperty('version') || 0), origen: p.getProperty('origen') || 'app' }; }
function marcar_(origen) {
  const lock = LockService.getDocumentLock(); lock.waitLock(10000);
  try { const p = props_(); const v = Number(p.getProperty('version') || 0) + 1; p.setProperties({ version: String(v), origen: origen }); return v; }
  finally { lock.releaseLock(); }
}

function hoja_(ss, nombre) { return ss.getSheetByName(nombre) || ss.insertSheet(nombre); }

/** de «AB12» a [fila, columna] */
function ref_(a1) {
  const m = /^([A-Z]+)(\d+)$/.exec(a1); let c = 0;
  for (let i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64);
  return [Number(m[2]), c];
}

function escribir_(d) {
  const ss = SpreadsheetApp.getActive();
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
        else rango.setValues([tramo.map(function (x) { return x[1] === null ? '' : x[1]; })]);
        i = j + 1;
      }
    });
  });
  // tablas editables
  (d.tablas || []).forEach(function (t) {
    const sh = hoja_(ss, t.nombre); sh.clearContents();
    const ancho = t.filas.reduce(function (a, f) { return Math.max(a, f.length); }, 1);
    const v = t.filas.map(function (f) { const g = f.map(function (x) { return x === null ? '' : x; }); while (g.length < ancho) g.push(''); return g; });
    if (v.length) sh.getRange(1, 1, v.length, ancho).setValues(v);
    sh.setFrozenRows(1);
  });
  // proyecto completo, en trozos
  if (d.t3d) {
    const sh = hoja_(ss, 'T3D'); sh.clearContents();
    const trozos = []; for (let i = 0; i < d.t3d.length; i += TROZO) trozos.push([d.t3d.slice(i, i + TROZO)]);
    sh.getRange('A1').setValue('Torre 3D · proyecto (no editar a mano)');
    sh.getRange('B2').setValue(trozos.length);
    if (trozos.length) sh.getRange(3, 1, trozos.length, 1).setValues(trozos);
  }
  return { version: marcar_('app') };
}
function esFormula_(x) { return x !== null && typeof x === 'object' && 'formula' in x; }

function leer_() {
  const ss = SpreadsheetApp.getActive();
  const tablas = HOJAS_EDITABLES.map(function (n) { const sh = ss.getSheetByName(n); return { nombre: n, filas: sh ? sh.getDataRange().getValues() : [] }; });
  const viento = {}; const shv = ss.getSheetByName('viento');
  if (shv) { CELDAS_VIENTO.forEach(function (a1) { viento[a1] = shv.getRange(a1).getValue(); }); }
  let t3d = ''; const sht = ss.getSheetByName('T3D');
  if (sht) { const n = Number(sht.getRange('B2').getValue()) || 0; if (n) t3d = sht.getRange(3, 1, n, 1).getValues().map(function (r) { return r[0]; }).join(''); }
  const e = estado_();
  return { version: e.version, origen: e.origen, tablas: tablas, viento: viento, t3d: t3d };
}
