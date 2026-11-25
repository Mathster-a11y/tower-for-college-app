/**
 * Manda el cálculo al worker y se queda con lo último: hay a lo sumo un cálculo andando; si mientras tanto llegan más
 * cambios, al terminar se calcula solo el último (los del medio se saltean). Si el navegador no tiene workers o el
 * worker no arranca, «disponible» queda en falso y el estado calcula en el momento, como antes.
 */
import type { PedidoCalculo, RespuestaCalculo } from '../engine/calculoEnFondo';

type AlTerminar = (r: RespuestaCalculo) => void;

export class CalculoFondo {
  private w: Worker | null = null;
  private cargando: Promise<Worker | null> | null = null;
  private enCurso: PedidoCalculo | null = null;
  private siguiente: PedidoCalculo | null = null;
  /** falso si no hay workers (pruebas, navegadores viejos) o si el worker falló: se calcula en el momento */
  disponible = typeof Worker !== 'undefined' && typeof window !== 'undefined';
  constructor(private alTerminar: AlTerminar, private alFallar: (p: PedidoCalculo) => void) {}

  /** hay un cálculo andando o esperando */
  get ocupado() { return !!this.enCurso || !!this.siguiente; }

  pedir(p: PedidoCalculo) {
    if (this.enCurso) { this.siguiente = p; return; }
    this.enviar(p);
  }
  /** se olvida de lo que está andando (el estado calculó en el momento): lo que llegue después se descarta solo */
  cancelarSiguiente() { this.siguiente = null; }

  private cargar(): Promise<Worker | null> {
    // el worker se carga recién la primera vez que hace falta (no demora la apertura de la app)
    this.cargando ??= import('../engine/calculo.worker?worker&inline').then(m => {
      const w = new m.default();
      w.onmessage = (e: MessageEvent<RespuestaCalculo>) => this.recibir(e.data);
      w.onerror = ev => { ev.preventDefault?.(); this.romper(); };
      this.w = w;
      return w;
    }).catch(() => { this.disponible = false; return null; });
    return this.cargando;
  }
  private enviar(p: PedidoCalculo) {
    this.enCurso = p;
    void this.cargar().then(w => {
      if (!w) { this.romper(); return; }
      w.postMessage(p);
    });
  }
  private recibir(r: RespuestaCalculo) {
    this.enCurso = null;
    const s = this.siguiente;
    this.siguiente = null;
    if (s) this.enviar(s);
    this.alTerminar(r);
  }
  /** el worker no anda: desde ahora se calcula en el momento, empezando por lo que estaba pendiente */
  private romper() {
    const p = this.siguiente ?? this.enCurso;
    this.disponible = false;
    this.enCurso = this.siguiente = null;
    try { this.w?.terminate(); } catch { /* ya estaba cerrado */ }
    this.w = null;
    if (p) this.alFallar(p);
  }
}
