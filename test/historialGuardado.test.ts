/** Historial (deshacer y rehacer) y guardado en el navegador, sacados de Estado (informe técnico, hallazgo 11). */
import { describe, expect, it } from 'vitest';
import { Historial } from '../src/ui/historial';
import { Guardado, type Almacen } from '../src/ui/guardado';

describe('historial', () => {
  it('registra solo cambios, deshace, rehace y un cambio nuevo borra lo de adelante', () => {
    const h = new Historial('a');
    expect(h.registrar('a')).toBe(false);
    expect(h.registrar('b')).toBe(true); h.registrar('c');
    expect(h.deshacer()).toBe('b'); expect(h.deshacer()).toBe('a'); expect(h.deshacer()).toBeUndefined();
    expect(h.puedeRehacer).toBe(true); expect(h.rehacer()).toBe('b');
    h.registrar('d'); expect(h.puedeRehacer).toBe(false); expect(h.actual).toBe('d');
  });
  it('guarda como máximo el límite de pasos', () => {
    const h = new Historial('0', 3);
    for (let i = 1; i <= 10; i++) h.registrar(String(i));
    let n = 0; while (h.deshacer() !== undefined) n++;
    expect(n).toBe(3); expect(h.actual).toBe('7');
  });
});

describe('guardado en el navegador', () => {
  const memoria = (lleno = { v: false }): Almacen => { const m = new Map<string, string>(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { if (lleno.v) throw new Error('lleno'); m.set(k, v); }, removeItem: k => { m.delete(k); } }; };
  it('guarda y lee; avisa una vez al fallar y otra al volver a andar', () => {
    const lleno = { v: false }, a = memoria(lleno), g = new Guardado('k', () => a), avisos: boolean[] = [];
    g.suscribir(f => avisos.push(f));
    expect(g.guardar('x')).toBe(true); expect(g.leer()).toBe('x'); expect(avisos).toEqual([]);
    lleno.v = true; g.guardar('y'); g.guardar('z');
    expect(g.fallo).toBe(true); expect(avisos).toEqual([true]);
    lleno.v = false; g.guardar('w');
    expect(g.fallo).toBe(false); expect(avisos).toEqual([true, false]); expect(g.leer()).toBe('w');
  });
  it('sin almacenamiento: no rompe, lee null y queda en falla', () => {
    const g = new Guardado('k', () => null);
    expect(g.leer()).toBeNull(); expect(g.guardar('x')).toBe(false); expect(g.fallo).toBe(true);
  });
});
