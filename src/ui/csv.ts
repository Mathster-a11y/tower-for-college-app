/**
 * Tablas para Excel: CSV con «;» de separador y coma decimal (como lo abre Excel en castellano), en UTF-8 con BOM
 * para que los acentos se vean bien. Los textos van entre comillas.
 */
export function textoCSV(cols: string[], filas: (string | number | null)[][], decimales = 4): string {
  const celda = (v: string | number | null) => (v === null || (typeof v === 'number' && !isFinite(v)) ? '' : typeof v === 'number' ? v.toFixed(decimales).replace('.', ',') : `"${v.replace(/"/g, '""')}"`);
  return '﻿' + [cols.map(c => celda(c)).join(';'), ...filas.map(f => f.map(celda).join(';'))].join('\r\n');
}
export function descargarCSV(nombre: string, cols: string[], filas: (string | number | null)[][], decimales = 4) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([textoCSV(cols, filas, decimales)], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
