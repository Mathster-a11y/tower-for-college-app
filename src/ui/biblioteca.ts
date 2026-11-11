/**
 * «Mis proyectos»: versiones guardadas en este navegador (con nombre y fecha), para abrir, comparar o borrar.
 * Antes de reemplazar el proyecto abierto (un ejemplo, otro archivo) se guarda una copia automática.
 */
import type { Proyecto } from '../engine/modelo';

const CLAVE = 'torre3d.biblioteca.v1';
const MAX_AUTO = 5, MAX_TOTAL = 40;
export interface Version { id: string; nombre: string; fecha: number; auto?: boolean; /** pisos = cantidad de niveles */
  pisos: number; muros: number; json: string }

export function versiones(): Version[] {
  try { const t = localStorage.getItem(CLAVE); const v = t ? (JSON.parse(t) as Version[]) : []; return Array.isArray(v) ? v : []; } catch { return []; }
}
function escribir(v: Version[]): boolean {
  try { localStorage.setItem(CLAVE, JSON.stringify(v)); return true; } catch { return false; }
}
/** guarda una versión; devuelve false si el navegador no tiene lugar */
export function guardarVersion(p: Proyecto, nombre: string, auto = false): boolean {
  const json = JSON.stringify(p);
  let v = versiones();
  // una copia automática igual a la última guardada no hace falta
  if (auto && v.some(x => x.json === json)) return true;
  v.unshift({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, nombre: nombre.trim() || p.nombre || 'Sin nombre', fecha: Date.now(), auto, pisos: p.niveles.length, muros: p.muros.length, json });
  const autos = v.filter(x => x.auto);
  if (autos.length > MAX_AUTO) { const fuera = new Set(autos.slice(MAX_AUTO).map(x => x.id)); v = v.filter(x => !fuera.has(x.id)); }
  if (v.length > MAX_TOTAL) v = v.slice(0, MAX_TOTAL);
  return escribir(v);
}
export function borrarVersion(id: string) { escribir(versiones().filter(x => x.id !== id)); }
export function leerVersion(id: string): Proyecto | null {
  const v = versiones().find(x => x.id === id);
  try { return v ? (JSON.parse(v.json) as Proyecto) : null; } catch { return null; }
}
export const fechaCorta = (t: number) => new Date(t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
