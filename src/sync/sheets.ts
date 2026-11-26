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
 * Seguridad y concurrencia (informe técnico, hallazgo 3): cada pedido lleva la clave que crea «configurar» en el script;
 * los envíos van de a uno (en cola) y cada escritura dice qué versión de la hoja vio la app («base»): si la hoja cambió
 * en el medio, el script la rechaza («conflicto») y la app pregunta qué hacer. Las respuestas de una conexión que ya se
 * cerró o se reemplazó se descartan. Si una escritura quedó a medias («incompleta»), la app vuelve a escribir todo.
 */
import type { Proyecto } from '../engine/modelo';
import { interpretar } from '../engine/importar';
import { proyectoDesdeTablas, tablasProyecto, T } from '../xlsx/proyectoTablas';
import type { Hoja, Valor } from '../xlsx/tablas';
import type { ValorCelda } from '../xlsx/xml';

export const HOJA_NIVELES = 'T3D Niveles', HOJA_MUROS = 'T3D Muros';
/** hojas que la app escribe y vuelve a leer (las tablas del proyecto) */
export const HOJAS_TABLAS = Object.values(T) as string[];
/** las tablas que conoce el script de la versión 2 (antes de «T3D Exo»): con un script viejo se manda solo esto */
const HOJAS_DEL_SCRIPT_V2 = ['T3D Proyecto', 'T3D Niveles', 'T3D Muros', 'T3D Contornos', 'T3D Grupos', 'T3D Huecos de losa', 'T3D Caminos', 'T3D Cotas', 'T3D Guías'];
/** celdas de datos de la hoja «viento» que se leen de vuelta */
export const CELDAS_SITIO: Record<string, keyof Proyecto['sitio']> = { C4: 'V', D4: 'Kd', E4: 'I', F4: 'zg', G4: 'alfa', I4: 'Kzt', J4: 'G', K4: 'Cpb', L4: 'Cps', O4: 'GCpi' };

export type ValorPlano = number | string | null | { formula: string };
export interface Paquete { celdas: Record<string, Record<string, ValorPlano>>; tablas: { nombre: string; filas: Valor[][] }[]; t3d: string }
export interface EstadoRemoto { version: number; origen: 'app' | 'hoja'; incompleta?: boolean }
export interface Lectura extends EstadoRemoto { tablas: Hoja[]; viento: Record<string, Valor>; t3d: string }

const plano = (v: ValorCelda): ValorPlano => ('num' in v ? v.num : 'str' in v ? v.str : 'formula' in v ? { formula: v.formula } : null);

/** lo que la app escribe en la hoja */
export function paquete(p: Proyecto, celdas: Record<string, Record<string, ValorCelda>>): Paquete {
  const c: Paquete['celdas'] = {};
  for (const [hoja, cs] of Object.entries(celdas)) { c[hoja] = {}; for (const [ref, v] of Object.entries(cs)) c[hoja][ref] = plano(v); }
  // la torre completa en tablas legibles: con ellas la hoja alcanza sola para volver a armarla
  // «T3D Lofts» va solo si hay lofts: los scripts de Sheets instalados antes no la conocen y rechazarían el paquete
  const tablas = tablasProyecto(p).filter(t => t.nombre !== T.lofts || t.filas.length > 1).map(t => ({ nombre: t.nombre, filas: t.filas }));
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

/** la hoja cambió entre que la app la vio y quiso escribir: el script no pisó nada */
export class ConflictoSheets extends Error {
  constructor(readonly version: number) { super('La planilla cambió mientras escribías (otro editor o una edición a mano).'); }
}
/** la respuesta llegó de una conexión que ya se cerró o se reemplazó: no se usa */
export class RespuestaVieja extends Error { constructor() { super('respuesta de una conexión anterior'); } }

/** cliente: empuja los cambios de la app y trae los de la hoja */
export class SincroSheets {
  private ultima = -1;          // última versión que la app conoce (escrita por ella o ya leída)
  private pendiente: ReturnType<typeof setTimeout> | null = null;
  private reloj: ReturnType<typeof setInterval> | null = null;
  /** los pedidos van de a uno: cada uno espera al anterior */
  private cola: Promise<unknown> = Promise.resolve();
  private enCola = 0;
  /** número de conexión: al detener o reconectar cambia y las respuestas viejas se descartan */
  private generacion = 0;
  /** hay un conflicto sin resolver: no se escribe hasta que la app decida */
  conflicto: number | null = null;
  constructor(
    readonly url: string,
    private al: { remoto: (l: Lectura) => void; estado: (t: string, error?: boolean) => void; conflicto?: (version: number) => void },
    private fetchFn: Fetch = (u, i) => fetch(u, i),
    readonly clave = '',
  ) {}
  /** en cola: un pedido por vez, y si mientras tanto se cerró la conexión, la respuesta no sirve */
  private enSerie<T>(f: () => Promise<T>): Promise<T> {
    const gen = this.generacion;
    this.enCola++;
    const p = this.cola.then(async () => { if (gen !== this.generacion) throw new RespuestaVieja(); const x = await f(); if (gen !== this.generacion) throw new RespuestaVieja(); return x; });
    this.cola = p.catch(() => undefined).finally(() => { this.enCola--; });
    return p;
  }
  private async pedir<T>(params: Record<string, string>, cuerpo?: Record<string, unknown>): Promise<T> {
    const u = `${this.url}${this.url.includes('?') ? '&' : '?'}${new URLSearchParams(cuerpo === undefined ? { ...params, clave: this.clave } : params)}`;
    // POST con text/plain: el navegador no pide permiso previo (CORS) y Apps Script lo acepta; la clave va en el cuerpo
    const r = await this.fetchFn(u, cuerpo === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...cuerpo, clave: this.clave }) });
    if (!r.ok) throw new Error(`Google Sheets respondió ${r.status}`);
    const j = (await r.json()) as T & { error?: string; version?: number };
    if (j.error === 'conflicto') throw new ConflictoSheets(j.version ?? -1);
    if (j.error === 'clave') throw new Error('La clave no es la de esta planilla (la crea «configurar» en Apps Script).');
    if (j.error === 'ocupado') throw new Error('La planilla está ocupada con otra escritura; se reintenta en unos segundos.');
    // el script de la versión 3 no acepta textos de más de 2000 caracteres (las notas y las barras a mano del exo)
    if (j.error && /^Valor no permitido en T3D /.test(j.error)) throw new Error(`${j.error}: el script de la planilla es de una versión anterior y no acepta textos largos (las notas o las barras a mano del exoesqueleto). Volvé a pegar docs/sheets/Codigo.gs (versión 4) en Extensiones → Apps Script y publicá una nueva versión de la implementación (Implementar → Administrar implementaciones → editar → Versión nueva).`);
    if (j.error) throw new Error(j.error);
    return j;
  }
  /** escribe ya (en cola) sobre la versión que la app vio; con «forzar», aunque la hoja haya cambiado */
  escribir(pq: Paquete, forzar = false) {
    return this.enSerie(async () => {
      if (this.conflicto !== null && !forzar) return;                 // se espera la decisión de la app
      try {
        const base = this.ultima >= 0 ? this.ultima : null;
        let r: { version: number }, aviso = '';
        try { r = await this.pedir<{ version: number }>({ accion: 'escribir' }, { accion: 'escribir', ...pq, base, forzar }); }
        catch (e) {
          // un script de Apps Script anterior no conoce las hojas nuevas (como «T3D Exo») y rechaza el paquete entero:
          // se vuelve a mandar sin ellas (el proyecto completo igual va en «T3D») y se avisa que conviene actualizarlo
          const m = e instanceof Error ? /^Tabla no permitida: (.+)$/.exec(e.message) : null;
          if (!m) throw e;
          const nuevas = pq.tablas.filter(t => !HOJAS_DEL_SCRIPT_V2.includes(t.nombre)).map(t => t.nombre);
          r = await this.pedir<{ version: number }>({ accion: 'escribir' }, { accion: 'escribir', ...pq, tablas: pq.tablas.filter(t => HOJAS_DEL_SCRIPT_V2.includes(t.nombre)), base, forzar });
          aviso = ` · el script de la planilla es de una versión anterior: no escribió ${nuevas.join(', ')} (el proyecto completo igual quedó en «T3D»). Volvé a pegar docs/sheets/Codigo.gs para tenerlas.`;
        }
        this.ultima = r.version; this.conflicto = null;
        this.al.estado(`Sincronizado con Google Sheets · versión ${r.version}${aviso}`, !!aviso);
      } catch (e) {
        if (e instanceof ConflictoSheets) { this.conflicto = e.version; this.al.conflicto?.(e.version); return; }
        throw e;
      }
    });
  }
  /** escribe cuando el proyecto deja de cambiar (1,5 s) */
  programar(pq: () => Paquete, espera = 1500) {
    if (this.pendiente) clearTimeout(this.pendiente);
    this.pendiente = setTimeout(() => { this.pendiente = null; this.escribir(pq()).catch(e => { if (!(e instanceof RespuestaVieja)) this.al.estado(`No se pudo escribir en Google Sheets: ${(e as Error).message}`, true); }); }, espera);
  }
  /** pregunta si la hoja cambió; si cambió a mano, la lee y avisa a la app */
  async revisar(): Promise<boolean> {
    if (this.enCola || this.pendiente || this.conflicto !== null) return false;
    return this.enSerie(async () => {
      const e = await this.pedir<EstadoRemoto>({ accion: 'estado' });
      if (e.version === this.ultima && !e.incompleta) return false;
      if (e.origen === 'app' && !e.incompleta) { this.ultima = e.version; return false; }
      if (e.incompleta) { this.al.estado('La última escritura en Google Sheets quedó a medias: se vuelve a escribir todo.', true); this.ultima = e.version; return false; }
      const l = await this.pedir<Lectura>({ accion: 'leer' });
      this.ultima = l.version;
      this.al.remoto(l);
      return true;
    });
  }
  /** la escritura de una versión incompleta: true si el script la marcó así (hay que volver a escribir) */
  async incompleta(): Promise<boolean> { const e = await this.enSerie(() => this.pedir<EstadoRemoto>({ accion: 'estado' })); return !!e.incompleta; }
  /** trae la versión de la hoja (para resolver un conflicto a favor de la hoja) */
  async traer(): Promise<void> {
    await this.enSerie(async () => { const l = await this.pedir<Lectura>({ accion: 'leer' }); this.ultima = l.version; this.conflicto = null; this.al.remoto(l); });
  }
  /** conecta: si la hoja ya tiene un proyecto lo trae; si no (o si quedó a medias), escribe el de la app */
  async conectar(pq: () => Paquete): Promise<'leido' | 'escrito'> {
    const e = await this.enSerie(() => this.pedir<EstadoRemoto>({ accion: 'estado' }));
    if (e.version > 0 && !e.incompleta) {
      const l = await this.enSerie(() => this.pedir<Lectura>({ accion: 'leer' }));
      this.ultima = l.version;
      if (l.t3d) { this.al.remoto(l); return 'leido'; }
    } else this.ultima = e.version;
    await this.escribir(pq(), !!e.incompleta);
    return 'escrito';
  }
  iniciar(cada = 5000) {
    if (this.reloj) clearInterval(this.reloj);
    this.reloj = setInterval(() => { this.revisar().catch(e => { if (!(e instanceof RespuestaVieja)) this.al.estado(`Google Sheets no responde: ${(e as Error).message}`, true); }); }, cada);
  }
  /** corta la conexión: lo que esté en camino se descarta al volver */
  detener() { this.generacion++; if (this.reloj) clearInterval(this.reloj); this.reloj = null; if (this.pendiente) clearTimeout(this.pendiente); this.pendiente = null; }
}
