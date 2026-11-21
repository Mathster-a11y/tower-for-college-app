/**
 * Guardado del proyecto en el navegador (sacado de Estado: informe técnico, hallazgo 11). Avisa una vez cuando falla
 * (almacenamiento lleno o bloqueado) y otra cuando vuelve a andar.
 */
export interface Almacen { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

/** el localStorage del navegador, o nada si no hay (pruebas, modo privado con el almacenamiento bloqueado) */
export function almacenDelNavegador(): Almacen | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export class Guardado {
  fallo = false;
  private oyentes: ((fallo: boolean) => void)[] = [];
  constructor(private readonly clave: string, private readonly almacen: () => Almacen | null = almacenDelNavegador) {}
  /** avisa cuando el guardado falla (true) o vuelve a andar (false) */
  suscribir(f: (fallo: boolean) => void) { this.oyentes.push(f); }
  /** lo guardado, o null si no hay o no se puede leer */
  leer(): string | null { try { return this.almacen()?.getItem(this.clave) ?? null; } catch { return null; } }
  /** guarda; si el estado de falla cambió, avisa. Devuelve si se pudo guardar. */
  guardar(texto: string): boolean {
    let ok = true;
    try { const a = this.almacen(); if (!a) throw new Error('sin almacenamiento'); a.setItem(this.clave, texto); } catch { ok = false; }
    if (ok === this.fallo) { this.fallo = !ok; this.oyentes.forEach(f => f(!ok)); }
    return ok;
  }
  /** guarda en otra clave (por ejemplo, un texto dañado para recuperarlo a mano); sin aviso */
  guardarAparte(clave: string, texto: string) { try { this.almacen()?.setItem(clave, texto); } catch { /* sin lugar */ } }
  quitar(clave: string) { try { this.almacen()?.removeItem(clave); } catch { /* sin almacenamiento */ } }
}
