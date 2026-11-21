/**
 * Historial de deshacer y rehacer del proyecto (sacado de Estado: informe técnico, hallazgo 11). Guarda el proyecto
 * serializado antes de cada cambio; deshacer y rehacer devuelven el texto a restaurar. Como máximo 100 pasos atrás.
 */
export class Historial {
  private atras: string[] = [];
  private adelante: string[] = [];
  /** el proyecto serializado tal como está ahora */
  actual: string;
  constructor(actual = '', private readonly limite = 100) { this.actual = actual; }

  /** registra el proyecto nuevo; devuelve si cambió (si es igual al actual no se registra nada) */
  registrar(nuevo: string): boolean {
    if (nuevo === this.actual) return false;
    this.atras.push(this.actual);
    if (this.atras.length > this.limite) this.atras.shift();
    this.adelante = [];
    this.actual = nuevo;
    return true;
  }
  /** vuelve un paso: devuelve el texto a restaurar (o undefined si no hay) */
  deshacer(): string | undefined { return this.mover(this.atras, this.adelante); }
  rehacer(): string | undefined { return this.mover(this.adelante, this.atras); }
  get puedeDeshacer() { return this.atras.length > 0; }
  get puedeRehacer() { return this.adelante.length > 0; }
  private mover(de: string[], a: string[]): string | undefined {
    const t = de.pop();
    if (t === undefined) return undefined;
    a.push(this.actual);
    this.actual = t;
    return t;
  }
}
