import { describe, it, expect } from 'vitest';
import { ejemploGuia } from '../engine/modelo';
import { paquete, proyectoDesdeHoja, SincroSheets, type Lectura, type Paquete } from './sheets';

/** Apps Script falso, en memoria, con el mismo protocolo que docs/sheets/Codigo.gs */
function servidorFalso() {
  const s = { version: 0, origen: 'app' as 'app' | 'hoja', tablas: [] as { nombre: string; filas: (string | number | null)[][] }[], viento: {} as Record<string, number>, t3d: '' };
  const fetchFn = async (url: string, init?: RequestInit) => {
    const a = new URL(url, 'http://x').searchParams.get('accion');
    let r: unknown;
    if (init?.method === 'POST') { const d = JSON.parse(String(init.body)) as Paquete; s.tablas = structuredClone(d.tablas); s.t3d = d.t3d; s.version++; s.origen = 'app'; r = { version: s.version }; }
    else if (a === 'estado') r = { version: s.version, origen: s.origen };
    else r = { version: s.version, origen: s.origen, tablas: s.tablas, viento: s.viento, t3d: s.t3d };
    return new Response(JSON.stringify(r), { status: 200 });
  };
  const editarAMano = (f: () => void) => { f(); s.version++; s.origen = 'hoja'; };
  return { s, fetchFn, editarAMano };
}

describe('sincronización con Google Sheets', () => {
  it('app → hoja → app: lo que se edita a mano en la hoja vuelve al proyecto', async () => {
    const { s, fetchFn, editarAMano } = servidorFalso();
    const p = ejemploGuia();
    let recibido: Lectura | null = null;
    const c = new SincroSheets('https://script.google.com/macros/s/X/exec', { remoto: l => { recibido = l; }, estado: () => {} }, fetchFn);
    expect(await c.conectar(() => paquete(p, {}))).toBe('escrito');
    expect(s.tablas.map(t => t.nombre)).toEqual(['T3D Niveles', 'T3D Muros']);
    // sin cambios en la hoja no trae nada (tampoco su propia escritura)
    expect(await c.revisar()).toBe(false);
    // a mano: el muro M1 pasa a medir 5 m y la velocidad del viento a 50 m/s
    editarAMano(() => {
      const t = s.tablas[1].filas; const col = t[0].indexOf('Largo (m)'); const fila = t.find(f => f[0] === 'M1')!; fila[col] = 5;
      s.viento = { C4: 50 };
    });
    expect(await c.revisar()).toBe(true);
    const { proyecto } = proyectoDesdeHoja(p, recibido!);
    expect(proyecto.muros.find(m => m.id === 'M1')!.largo).toBe(5);
    expect(proyecto.sitio.V).toBe(50);
    expect(proyecto.muros.length).toBe(p.muros.length);
    expect(proyecto.niveles.length).toBe(p.niveles.length);
    // ya leída, no la vuelve a traer
    expect(await c.revisar()).toBe(false);
  });
  it('al conectar con una hoja que ya tiene proyecto, lo trae en lugar de pisarlo', async () => {
    const { fetchFn } = servidorFalso();
    const p = ejemploGuia();
    const a = new SincroSheets('u', { remoto: () => {}, estado: () => {} }, fetchFn);
    await a.conectar(() => paquete(p, {}));
    let leido = false;
    const b = new SincroSheets('u', { remoto: () => { leido = true; }, estado: () => {} }, fetchFn);
    expect(await b.conectar(() => paquete(p, {}))).toBe('leido');
    expect(leido).toBe(true);
  });
});
