/**
 * Tarjetas de mensaje (sistema de diseño, 5.2): reemplazan alert, confirm y prompt del navegador.
 * Tarjeta redondeada (radio 12) con una insignia redonda a la izquierda (i, !, ×, ?), el título en negrita y el
 * mensaje debajo. Los botones van abajo a la derecha, el primero relleno. Enter da el primero; Escape, el último.
 */
export type TipoTarjeta = 'info' | 'aviso' | 'error' | 'pregunta';
const GLIFO: Record<TipoTarjeta, string> = { info: 'i', aviso: '!', error: '×', pregunta: '?' };

export function tarjeta(op: { tipo: TipoTarjeta; titulo: string; texto: string; botones: string[]; campo?: { valor: string; etiqueta?: string } }): Promise<{ boton: number; valor: string }> {
  return new Promise(resolver => {
    const d = document.createElement('dialog');
    d.className = 'tarjeta';
    const ins = document.createElement('span'); ins.className = `insignia ${op.tipo}`; ins.textContent = GLIFO[op.tipo]; ins.setAttribute('aria-hidden', 'true');
    const cuerpo = document.createElement('div'); cuerpo.className = 'tarjeta-cuerpo';
    const t = document.createElement('h2'); t.textContent = op.titulo;
    const p = document.createElement('p'); p.textContent = op.texto;
    cuerpo.append(t, p);
    let inp: HTMLInputElement | null = null;
    if (op.campo) {
      inp = document.createElement('input'); inp.type = 'text'; inp.value = op.campo.valor;
      if (op.campo.etiqueta) inp.setAttribute('aria-label', op.campo.etiqueta);
      cuerpo.append(inp);
    }
    const fila = document.createElement('div'); fila.className = 'tarjeta-botones';
    let hecho = false;
    const fin = (i: number) => { if (hecho) return; hecho = true; d.close(); d.remove(); resolver({ boton: i, valor: inp?.value ?? '' }); };
    op.botones.forEach((b, i) => {
      const x = document.createElement('button'); x.type = 'button'; x.textContent = b;
      if (i === 0) x.className = 'primario';
      x.addEventListener('click', () => fin(i));
      fila.append(x);
    });
    cuerpo.append(fila);
    d.append(ins, cuerpo);
    d.addEventListener('cancel', ev => { ev.preventDefault(); fin(op.botones.length - 1); });
    d.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !(ev.target instanceof HTMLButtonElement)) { ev.preventDefault(); fin(0); } });
    document.body.append(d);
    d.showModal();
    (inp ?? fila.querySelector('button'))?.focus();
    inp?.select();
  });
}
/** aviso con un solo botón */
export const avisar = (tipo: TipoTarjeta, titulo: string, texto: string) => tarjeta({ tipo, titulo, texto, botones: ['Entendido'] }).then(() => undefined);
/** pregunta sí / no: true si se elige la primera opción */
export const confirmar = (titulo: string, texto: string, si: string, no = 'Cancelar') => tarjeta({ tipo: 'pregunta', titulo, texto, botones: [si, no] }).then(r => r.boton === 0);
/** pide un texto: null si se cancela */
export const pedirTexto = (titulo: string, texto: string, valor = '', aceptar = 'Aceptar') => tarjeta({ tipo: 'pregunta', titulo, texto, botones: [aceptar, 'Cancelar'], campo: { valor, etiqueta: titulo } }).then(r => (r.boton === 0 ? r.valor : null));
