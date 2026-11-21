/**
 * El script de la planilla (docs/sheets/Codigo.gs) corrido en Node con los servicios de Apps Script imitados en memoria:
 * clave, hojas y fórmulas permitidas, textos que empiezan con «=», bloqueo, conflicto de versiones y escritura a medias
 * (informe técnico, hallazgo 3). Y el cliente de la app contra ese mismo script.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ejemploGuia } from '../engine/modelo';
import { paquete, SincroSheets } from './sheets';

type Celda = string | number | boolean;
function googleFalso() {
  const props = new Map<string, string>();
  const P = { getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => { props.set(k, v); }, setProperties: (o: Record<string, string>) => { for (const [k, v] of Object.entries(o)) props.set(k, v); }, deleteProperty: (k: string) => { props.delete(k); } };
  let bloqueado = false, fallarEn = -1, escrituras = 0;
  const hojas = new Map<string, Map<string, Celda>>();
  const ref = (r: number, c: number) => `${r},${c}`;
  const hoja = (nombre: string) => {
    if (!hojas.has(nombre)) hojas.set(nombre, new Map());
    const m = hojas.get(nombre)!;
    const rango = (r: number, c: number, nr = 1, nc = 1) => ({
      setValues: (v: Celda[][]) => { if (escrituras++ === fallarEn) throw new Error('corte a mitad de escritura'); v.forEach((f, i) => f.forEach((x, j) => m.set(ref(r + i, c + j), x))); },
      setValue: (x: Celda) => m.set(ref(r, c), x),
      setFormula: (f: string) => m.set(ref(r, c), f),
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const x = m.get(ref(r + i, c + j)); return typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x ?? ''; })),
      getValue: () => { const x = m.get(ref(r, c)); return typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x ?? ''; },
    });
    return {
      getName: () => nombre,
      getRange: (a: number | string, c?: number, nr?: number, nc?: number) => {
        if (typeof a === 'string') { const x = /^([A-Z]+)(\d+)$/.exec(a)!; return rango(Number(x[2]), [...x[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)); }
        return rango(a, c!, nr, nc);
      },
      clearContents: () => m.clear(), setFrozenRows: () => {},
      getDataRange: () => { let fr = 0, fc = 0; for (const k of m.keys()) { const [r, c] = k.split(',').map(Number); fr = Math.max(fr, r); fc = Math.max(fc, c); } return rango(1, 1, fr, fc); },
    };
  };
  for (const n of ['viento', 'M,NyQ']) hoja(n);
  const ss = { getId: () => 'PLANILLA', getSheetByName: (n: string) => (hojas.has(n) ? hoja(n) : null), insertSheet: (n: string) => hoja(n) };
  const g = {
    PropertiesService: { getScriptProperties: () => P, getDocumentProperties: () => P },
    LockService: { getScriptLock: () => ({ tryLock: () => !bloqueado, waitLock: () => { if (bloqueado) throw new Error('ocupado'); }, releaseLock: () => {} }) },
    SpreadsheetApp: { getActive: () => ss, openById: (id: string) => { if (id !== 'PLANILLA') throw new Error('otra planilla'); return ss; }, flush: () => {} },
    ContentService: { createTextOutput: (t: string) => ({ setMimeType: () => ({ texto: t }) }), MimeType: { JSON: 'json' } },
    Utilities: { getUuid: () => '1234abcd-0000-0000-0000-00000000abcd' },
    Logger: { log: () => {} },
  };
  const codigo = readFileSync('docs/sheets/Codigo.gs', 'utf8');
  const f = new Function(...Object.keys(g), `${codigo}\nreturn { configurar, doGet, doPost, onEdit };`) as (...a: unknown[]) => Record<string, (e?: unknown) => unknown>;
  const gs = f(...Object.values(g));
  const json = (x: unknown) => JSON.parse((x as { texto: string }).texto);
  return {
    gs, props, hojas, valor: (h: string, r: number, c: number) => hojas.get(h)?.get(ref(r, c)),
    bloquear: (b: boolean) => { bloqueado = b; }, fallarEnLaEscritura: (n: number) => { fallarEn = escrituras + n; },
    get: (p: Record<string, string>) => json(gs.doGet({ parameter: p })),
    post: (d: unknown) => json(gs.doPost({ postData: { contents: JSON.stringify(d) } })),
    editarAMano: (h: string, fila = 2) => gs.onEdit({ range: { getSheet: () => ({ getName: () => h }), getRow: () => fila } }),
    fetchFn: async (url: string, init?: RequestInit) => {
      const p = Object.fromEntries(new URL(url, 'http://x').searchParams);
      const r = init?.method === 'POST' ? gs.doPost({ postData: { contents: String(init.body) } }) : gs.doGet({ parameter: p });
      return new Response((r as { texto: string }).texto, { status: 200 });
    },
  };
}

describe('Codigo.gs: el script de la planilla', () => {
  it('sin la clave no lee ni escribe; «configurar» la crea y fija la planilla', () => {
    const G = googleFalso();
    expect(G.get({ accion: 'estado' }).error).toBe('clave');
    const clave = G.gs.configurar() as string;
    expect(G.props.get('planilla')).toBe('PLANILLA');
    expect(G.get({ accion: 'estado', clave: 'otra' }).error).toBe('clave');
    expect(G.get({ accion: 'estado', clave }).version).toBe(0);
    expect(G.post({ accion: 'escribir', clave: 'x', celdas: { viento: { C4: 50 } } }).error).toBe('clave');
    expect(G.valor('viento', 4, 3)).toBeUndefined();
  });
  it('solo hojas, celdas y fórmulas previstas; valida todo antes de escribir la primera celda', () => {
    const G = googleFalso(), clave = G.gs.configurar() as string;
    const mal = [
      { celdas: { viento: { C4: 50 }, 'Hoja rara': { A1: 1 } } },
      { celdas: { viento: { C4: 50, E9: { formula: 'IMPORTXML("http://x","//a")' } } } },
      { celdas: { viento: { C4: 50, E9: { formula: "+'Otra hoja'!B4" } } } },
      { celdas: { viento: { ZZZ999: 1 } } },
      { tablas: [{ nombre: 'Cualquier hoja', filas: [['a']] }] },
    ];
    for (const d of mal) { const r = G.post({ accion: 'escribir', clave, ...d }); expect(r.error, JSON.stringify(d)).toBeTruthy(); }
    expect(G.valor('viento', 4, 3)).toBeUndefined();          // ni la primera celda (válida) se escribió
    expect(G.get({ accion: 'estado', clave }).version).toBe(0);
    const ok = G.post({ accion: 'escribir', clave, celdas: { viento: { C4: 50, B6: { formula: '+viento!B7' } } }, tablas: [{ nombre: 'T3D Niveles', filas: [['Nivel', 'Nota'], ['PB', '=HYPERLINK("http://x")']] }] });
    expect(ok.version).toBe(1);
    expect(G.valor('viento', 4, 3)).toBe(50);
    expect(G.valor('viento', 6, 2)).toBe('=+viento!B7');
    expect(G.valor('T3D Niveles', 2, 2)).toBe('\'=HYPERLINK("http://x")');   // un texto con «=» va como texto, no como fórmula
  });
  it('conflicto: si la hoja cambió desde la versión que vio la app, no pisa nada', () => {
    const G = googleFalso(), clave = G.gs.configurar() as string;
    expect(G.post({ accion: 'escribir', clave, celdas: { viento: { C4: 50 } }, base: 0 }).version).toBe(1);
    G.editarAMano('T3D Niveles');                             // versión 2, hecha en la hoja
    const r = G.post({ accion: 'escribir', clave, celdas: { viento: { C4: 60 } }, base: 1 });
    expect(r.error).toBe('conflicto');
    expect(r.version).toBe(2);
    expect(G.valor('viento', 4, 3)).toBe(50);
    expect(G.post({ accion: 'escribir', clave, celdas: { viento: { C4: 60 } }, base: 1, forzar: true }).version).toBe(3);
  });
  it('con el bloqueo tomado responde «ocupado»; una escritura cortada a la mitad queda marcada «incompleta»', () => {
    const G = googleFalso(), clave = G.gs.configurar() as string;
    G.bloquear(true);
    expect(G.post({ accion: 'escribir', clave, celdas: { viento: { C4: 50 } } }).error).toBe('ocupado');
    G.bloquear(false);
    G.fallarEnLaEscritura(1);
    const r = G.post({ accion: 'escribir', clave, celdas: { viento: { C4: 50 } }, tablas: [{ nombre: 'T3D Niveles', filas: [['a']] }] });
    expect(r.error).toMatch(/corte/);
    const e = G.get({ accion: 'estado', clave });
    expect(e.version).toBe(0);
    expect(e.incompleta).toBe(true);
  });
});

describe('cliente de la app contra el script real', () => {
  it('escribe con la clave, trae lo editado a mano y, si la hoja cambió en el medio, avisa el conflicto en vez de pisar', async () => {
    const G = googleFalso(), clave = G.gs.configurar() as string;
    const p = ejemploGuia();
    let conflicto: number | null = null, recibido = 0;
    const c = new SincroSheets('https://script.google.com/macros/s/X/exec', { remoto: () => { recibido++; }, estado: () => {}, conflicto: v => { conflicto = v; } }, G.fetchFn, clave);
    expect(await c.conectar(() => paquete(p, {}))).toBe('escrito');
    expect(G.get({ accion: 'estado', clave }).version).toBe(1);
    // una edición a mano: la app la trae
    G.editarAMano('T3D Muros');
    expect(await c.revisar()).toBe(true);
    expect(recibido).toBe(1);
    // otra edición a mano justo antes de que la app escriba: conflicto, la hoja queda como estaba
    G.editarAMano('T3D Muros');
    await c.escribir(paquete(p, {}));
    expect(conflicto).toBe(3);
    expect(c.conflicto).toBe(3);
    expect(await c.revisar()).toBe(false);                    // mientras no se decida, ni lee ni escribe
    await c.traer();                                          // decide la hoja
    expect(recibido).toBe(2);
    expect(c.conflicto).toBeNull();
    await c.escribir(paquete(p, {}));
    expect(G.get({ accion: 'estado', clave }).version).toBe(4);
  });
  it('las respuestas de una conexión cerrada se descartan', async () => {
    const G = googleFalso(), clave = G.gs.configurar() as string;
    let liberar: () => void = () => {};
    const lento = async (u: string, i?: RequestInit) => { await new Promise<void>(r => { liberar = r; }); return G.fetchFn(u, i); };
    const c = new SincroSheets('u', { remoto: () => {}, estado: () => {} }, lento, clave);
    const pedido = c.escribir(paquete(ejemploGuia(), {}));
    await Promise.resolve(); await Promise.resolve();
    c.detener();                                              // se desconecta mientras el pedido está en camino
    liberar();
    await expect(pedido).rejects.toThrow(/conexión anterior/);
  });
});
