/**
 * Modo presentación (para el proyector y la entrega oral): pantalla completa, solo el dibujo de la etapa, letra más
 * grande y las flechas del teclado (o el control remoto de diapositivas, que manda Av Pág / Re Pág) para pasar de
 * etapa. Esc o «Salir» vuelve a la app como estaba.
 */
import type { Etapa } from './etapas';

export interface OpcionesPresentacion {
  /** las etapas que se recorren, en orden */
  etapas: () => Etapa[];
  /** la etapa a la vista */
  actual: () => string;
  /** pasar a una etapa (redibuja) */
  irA: (id: string) => void;
  /** redibujar todo (el dibujo central cambia de tamaño) */
  redibujar: () => void;
}

export function presentando(): boolean { return document.body.classList.contains('presentando'); }

export function montarPresentacion(op: OpcionesPresentacion): { alternar: () => void; refrescar: () => void } {
  const barra = document.createElement('div');
  barra.className = 'pres-barra';
  barra.setAttribute('role', 'toolbar');
  barra.setAttribute('aria-label', 'Presentación');
  const bAnt = document.createElement('button'), bSig = document.createElement('button'), bSalir = document.createElement('button');
  const titulo = document.createElement('span'); titulo.className = 'pres-titulo';
  bAnt.type = bSig.type = bSalir.type = 'button';
  bAnt.textContent = '◀'; bAnt.title = 'Etapa anterior (← o Re Pág)'; bAnt.setAttribute('aria-label', 'Etapa anterior');
  bSig.textContent = '▶'; bSig.title = 'Etapa siguiente (→ o Av Pág)'; bSig.setAttribute('aria-label', 'Etapa siguiente');
  bSalir.textContent = 'Salir (Esc)'; bSalir.title = 'Volver a la app';
  barra.append(bAnt, titulo, bSig, bSalir);
  document.body.append(barra);

  const lista = () => op.etapas();
  const indice = () => Math.max(0, lista().findIndex(e => e.id === op.actual()));
  const mover = (d: number) => {
    const ls = lista(), i = Math.min(ls.length - 1, Math.max(0, indice() + d));
    if (ls[i] && ls[i].id !== op.actual()) op.irA(ls[i].id);
    refrescar();
  };
  function refrescar() {
    const ls = lista(), i = indice(), e = ls[i];
    titulo.textContent = e ? `${e.nro} · ${e.nombre}  (${i + 1} de ${ls.length})` : '';
    bAnt.disabled = i <= 0; bSig.disabled = i >= ls.length - 1;
  }
  const poner = (si: boolean) => {
    if (si === presentando()) return;
    document.body.classList.toggle('presentando', si);
    if (si) {
      try { void document.documentElement.requestFullscreen?.().catch(() => { /* sin permiso: sigue en la ventana */ }); } catch { /* sin pantalla completa */ }
    } else if (document.fullscreenElement) {
      try { void document.exitFullscreen().catch(() => { /* ya salió */ }); } catch { /* sin pantalla completa */ }
    }
    refrescar();
    // el dibujo central cambia de ancho: se vuelve a dibujar con el lugar nuevo
    requestAnimationFrame(() => op.redibujar());
  };
  bAnt.addEventListener('click', () => mover(-1));
  bSig.addEventListener('click', () => mover(1));
  bSalir.addEventListener('click', () => poner(false));
  // si se sale de la pantalla completa con Esc (lo maneja el navegador), se sale también del modo
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && presentando()) poner(false); });
  // las teclas van antes que las de la planta (que con las flechas mueve lo elegido): en la presentación no se edita
  document.addEventListener('keydown', ev => {
    if (!presentando()) return;
    const t = ev.target instanceof Element ? ev.target : null;
    if (t?.closest('input, select, textarea, [contenteditable]') || document.querySelector('dialog[open]')) return;
    const sig = ['ArrowRight', 'PageDown'].includes(ev.key), ant = ['ArrowLeft', 'PageUp'].includes(ev.key);
    if (sig || ant) { ev.preventDefault(); ev.stopImmediatePropagation(); mover(sig ? 1 : -1); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); poner(false); }
    else if (ev.key === 'Home' || ev.key === 'End') { ev.preventDefault(); ev.stopImmediatePropagation(); mover(ev.key === 'Home' ? -999 : 999); }
  }, true);
  return { alternar: () => poner(!presentando()), refrescar };
}
