/**
 * Comparar dos versiones del proyecto: lo que cambia en J, excentricidad, momento torsor y en cada control.
 */
import type { Proyecto } from '../engine/modelo';
import { calcularProyecto, fmt } from './estado';

export interface FilaComparacion { grupo: string; nombre: string; a: number | null; b: number | null; unidad: string; estA?: string; estB?: string }

export function comparar(pa: Proyecto, pb: Proyecto): FilaComparacion[] {
  const ca = calcularProyecto(pa), cb = calcularProyecto(pb);
  const out: FilaComparacion[] = [];
  (['A', 'B'] as const).forEach(d => {
    const ra = d === 'A' ? ca.corr.rotoA : ca.corr.rotoB, rb = d === 'A' ? cb.corr.rotoA : cb.corr.rotoB;
    out.push({ grupo: `Viento ${d}`, nombre: 'ΣJ de las piezas paralelas', a: ra?.SJ ?? null, b: rb?.SJ ?? null, unidad: 'm⁴' });
    out.push({ grupo: `Viento ${d}`, nombre: 'Excentricidad e (eje de inercia)', a: ra?.e ?? null, b: rb?.e ?? null, unidad: 'm' });
    out.push({ grupo: `Viento ${d}`, nombre: 'Momento torsor Mt = Q · e', a: ra?.Mt ?? null, b: rb?.Mt ?? null, unidad: 'tm' });
  });
  out.push({ grupo: 'Proyecto', nombre: 'Muros', a: pa.muros.length, b: pb.muros.length, unidad: '' });
  const porNombre = new Map(cb.controles.map(c => [`${c.grupo}|${c.nombre}`, c]));
  ca.controles.forEach(c => {
    const o = porNombre.get(`${c.grupo}|${c.nombre}`);
    out.push({ grupo: c.grupo, nombre: c.nombre, a: c.guia ?? c.planilla, b: o ? o.guia ?? o.planilla : null, unidad: c.unidad, estA: c.estado, estB: o?.estado });
  });
  return out;
}

/** tabla HTML de la comparación (a = versión guardada, b = actual) */
export function tablaComparacion(filas: FilaComparacion[], nombreA: string, nombreB: string): string {
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const num = (v: number | null) => (v === null || !isFinite(v) ? '—' : Number.isInteger(v) ? String(v) : fmt(v, Math.abs(v) >= 100 ? 1 : 3));
  const est = (e?: string) => (!e ? '' : e === 'verifica' ? ' <span class="cmp-ok" title="verifica">✓</span>' : e === 'no verifica' ? ' <span class="cmp-no" title="no verifica">✗</span>' : ` <span class="cmp-info">${esc(e)}</span>`);
  let grupo = '', h = `<table class="tabla-cmp"><thead><tr><th>Concepto</th><th>${esc(nombreA)}</th><th>${esc(nombreB)}</th><th>Cambio</th></tr></thead><tbody>`;
  filas.forEach(f => {
    if (f.grupo !== grupo) { grupo = f.grupo; h += `<tr class="cmp-grupo"><th colspan="4">${esc(grupo)}</th></tr>`; }
    const d = f.a !== null && f.b !== null && isFinite(f.a) && isFinite(f.b) ? f.b - f.a : null;
    const rel = d !== null && f.a ? ` (${d >= 0 ? '+' : '−'}${Math.abs((d / f.a) * 100).toFixed(0)} %)` : '';
    const cambio = d === null ? '—' : Math.abs(d) < 1e-9 ? '=' : `${d > 0 ? '+' : '−'}${num(Math.abs(d))}${rel}`;
    const giro = f.estA && f.estB && f.estA !== f.estB ? ' class="cmp-cambia"' : '';
    h += `<tr${giro}><td>${esc(f.nombre)}${f.unidad ? ` <span class="cmp-u">${esc(f.unidad)}</span>` : ''}</td><td>${num(f.a)}${est(f.estA)}</td><td>${num(f.b)}${est(f.estB)}</td><td>${cambio}</td></tr>`;
  });
  return h + '</tbody></table>';
}
