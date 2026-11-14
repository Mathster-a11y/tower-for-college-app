/**
 * Sincronización de dos vías con una copia de la planilla en Google Sheets.
 *
 * La planilla del curso se sube a Google Drive y se abre con Google Sheets (las fórmulas siguen andando). Se le agrega
 * el script de docs/sheets/Codigo.gs (Extensiones → Apps Script) y se publica como aplicación web. La app habla con
 * esa dirección:
 *  - app → hoja: cada cambio del proyecto escribe las celdas de datos de la planilla (las mismas que «Escribir
 *    planilla .xlsx»), las tablas «T3D Niveles» y «T3D Muros» y el proyecto completo en «T3D».
 *  - hoja → app: el script cuenta cada edición hecha a mano en «T3D Niveles», «T3D Muros» o en los datos de la hoja
 *    «viento». La app pregunta cada pocos segundos; si hubo una edición en la hoja, lee esas tablas y rehace el
 *    proyecto (niveles, muros y datos del viento) sobre el que tenía.
 * Si las dos cambian a la vez gana la última y la app avisa. La dirección es la llave: quien la tenga puede escribir.
 */
import type { Proyecto } from '../engine/modelo';
import { interpretar } from '../engine/importar';
import { proyectoDesdeTablas, tablasProyecto, T } from '../xlsx/proyectoTablas';
import type { Hoja, Valor } from '../xlsx/tablas';
import type { ValorCelda } from '../xlsx/xml';

export const HOJA_NIVELES = 'T3D Niveles', HOJA_MUROS = 'T3D Muros';
/** hojas que la app escribe y vuelve a leer (las tablas del proyecto) */
export const HOJAS_TABLAS = Object.values(T) as string[];
/** celdas de datos de la hoja «viento» que se leen de vuelta */
export const CELDAS_SITIO: Record<string, keyof Proyecto['sitio']> = { C4: 'V', D4: 'Kd', E4: 'I', F4: 'zg', G4: 'alfa', I4: 'Kzt', J4: 'G', K4: 'Cpb', L4: 'Cps', O4: 'GCpi' };

export type ValorPlano = number | string | null | { formula: string };
export interface Paquete { celdas: Record<string, Record<string, ValorPlano>>; tablas: { nombre: string; filas: Valor[][] }[]; t3d: string }
export interface EstadoRemoto { version: number; origen: 'app' | 'hoja' }
export interface Lectura extends EstadoRemoto { tablas: Hoja[]; viento: Record<string, Valor>; t3d: string }

const plano = (v: ValorCelda): ValorPlano => ('num' in v ? v.num : 'str' in v ? v.str : 'formula' in v ? { formula: v.formula } : null);

/** lo que la app escribe en la hoja */
export function paquete(p: Proyecto, celdas: Record<string, Record<string, ValorCelda>>): Paquete {
  const c: Paquete['celdas'] = {};
  for (const [hoja, cs] of Object.entries(celdas)) { c[hoja] = {}; for (const [ref, v] of Object.entries(cs)) c[hoja][ref] = plano(v); }
  // la torre completa en tablas legibles: con ellas la hoja alcanza sola para volver a armarla
  const tablas = tablasProyecto(p).map(t => ({ nombre: t.nombre, filas: t.filas }));
  return { celdas: c, tablas, t3d: JSON.stringify(p) };
}

/** el proyecto que queda después de una edición hecha en la hoja: niveles, muros y viento de la hoja sobre el anterior */
export function proyectoDesdeHoja(base: Proyecto, l: Lectura): { proyecto: Proyecto; avisos: string[] } {
  // si la hoja trae todas las tablas «T3D …», el proyecto sale entero de ellas (viento incluido, desde «T3D Proyecto»)
  const completas = proyectoDesdeTablas(l.tablas.map(t => ({ ...t, celda: () => null })), base);
  if (completas && l.tablas.some(t => t.nombre === T.proyecto && t.filas.length > 1)) {
    // los datos del viento cambiados a mano en la hoja «viento» (la planilla del curso) también valen
    for (const [ref, campo] of Object.entries(CELDAS_SITIO)) {
      const v = l.viento[ref];
      const x = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
      if (v !== null && v !== undefined && v !== '' && isFinite(x) && x !== base.sitio[campo]) completas.proyecto.sitio[campo] = x;
    }
    return completas;
  }
  const hojas = l.tablas.map(t => ({ ...t, nombre: t.nombre === HOJA_NIVELES ? 'Niveles' : t.nombre === HOJA_MUROS ? 'Muros' : t.nombre }));
  const imp = interpretar(hojas);
  const p: Proyecto = structuredClone(base);
  if (imp.niveles?.length) p.niveles = imp.niveles;
  if (imp.muros.length) {
    // lo que la tabla no trae (grupos, papeles elegidos a mano, piezas tipo) se conserva del muro con el mismo nombre
    const antes = new Map(base.muros.map(m => [m.id, m]));
    p.muros = imp.muros.map(m => { const a = antes.get(m.id); return a ? { ...a, ...m, grupo: a.grupo, pieza: a.pieza, rolA: a.rolA, rolB: a.rolB, portico: a.portico } : m; });
  }
  for (const [ref, campo] of Object.entries(CELDAS_SITIO)) {
    const v = l.viento[ref];
    const x = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
    if (v !== null && v !== undefined && v !== '' && isFinite(x)) (p.sitio as unknown as Record<string, number>)[campo] = x;
  }
  return { proyecto: p, avisos: imp.avisos };
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** cliente: empuja los cambios de la app y trae los de la hoja */
export class SincroSheets {
  private ultima = -1;          // última versión que la app conoce (escrita por ella o ya leída)
  private pendiente: ReturnType<typeof setTimeout> | null = null;
  private reloj: ReturnType<typeof setInterval> | null = null;
  private ocupado = false;
  constructor(
    readonly url: string,
    private al: { remoto: (l: Lectura) => void; estado: (t: string, error?: boolean) => void },
    private fetchFn: Fetch = (u, i) => fetch(u, i),
  ) {}
  private async pedir<T>(params: Record<string, string>, cuerpo?: unknown): Promise<T> {
    const u = `${this.url}${this.url.includes('?') ? '&' : '?'}${new URLSearchParams(params)}`;
    // POST con text/plain: el navegador no pide permiso previo (CORS) y Apps Script lo acepta
    const r = await this.fetchFn(u, cuerpo === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) });
    if (!r.ok) throw new Error(`Google Sheets respondió ${r.status}`);
    const j = (await r.json()) as T & { error?: string };
    if (j.error) throw new Error(j.error);
    return j;
  }
  /** escribe ya (sin esperar) */
  async escribir(pq: Paquete) {
    this.ocupado = true;
    try {
      const r = await this.pedir<{ version: number }>({ accion: 'escribir' }, { accion: 'escribir', ...pq });
      this.ultima = r.version;
      this.al.estado(`Sincronizado con Google Sheets · versión ${r.version}`);
    } finally { this.ocupado = false; }
  }
  /** escribe cuando el proyecto deja de cambiar (1,5 s) */
  programar(pq: () => Paquete, espera = 1500) {
    if (this.pendiente) clearTimeout(this.pendiente);
    this.pendiente = setTimeout(() => { this.pendiente = null; this.escribir(pq()).catch(e => this.al.estado(`No se pudo escribir en Google Sheets: ${(e as Error).message}`, true)); }, espera);
  }
  /** pregunta si la hoja cambió; si cambió a mano, la lee y avisa a la app */
  async revisar(): Promise<boolean> {
    if (this.ocupado || this.pendiente) return false;
    const e = await this.pedir<EstadoRemoto>({ accion: 'estado' });
    if (e.version === this.ultima) return false;
    if (this.ultima >= 0 && e.origen === 'app') { this.ultima = e.version; return false; }
    if (this.ultima < 0 && e.origen === 'app') { this.ultima = e.version; return false; }
    const l = await this.pedir<Lectura>({ accion: 'leer' });
    this.ultima = l.version;
    this.al.remoto(l);
    return true;
  }
  /** conecta: si la hoja ya tiene un proyecto lo trae; si no, escribe el de la app */
  async conectar(pq: () => Paquete): Promise<'leido' | 'escrito'> {
    const e = await this.pedir<EstadoRemoto>({ accion: 'estado' });
    if (e.version > 0) { const l = await this.pedir<Lectura>({ accion: 'leer' }); this.ultima = l.version; if (l.t3d) { this.al.remoto(l); return 'leido'; } }
    await this.escribir(pq());
    return 'escrito';
  }
  iniciar(cada = 5000) {
    this.detener();
    this.reloj = setInterval(() => { this.revisar().catch(e => this.al.estado(`Google Sheets no responde: ${(e as Error).message}`, true)); }, cada);
  }
  detener() { if (this.reloj) clearInterval(this.reloj); this.reloj = null; if (this.pendiente) clearTimeout(this.pendiente); this.pendiente = null; }
}
