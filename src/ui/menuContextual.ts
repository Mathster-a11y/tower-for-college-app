/**
 * Menú contextual (clic derecho o toque largo): una lista de acciones al lado del puntero, con títulos, separadores,
 * marcas (✓) y submenús. Se cierra al elegir, con Esc, al tocar afuera o al rodar la rueda. Flechas y Enter lo recorren.
 */
export interface ItemMenu {
  texto: string;
  accion?: () => void;
  /** deshabilitado, con la razón como globo */
  no?: string | false;
  marcado?: boolean;
  peligro?: boolean;
  ayuda?: string;
  atajo?: string;
  sub?: ItemMenu[];
}
export type EntradaMenu = ItemMenu | '—' | { titulo: string };

let abierto: HTMLElement | null = null;
export function cerrarMenuContextual() {
  abierto?.remove(); abierto = null;
  document.removeEventListener('pointerdown', fuera, true);
  document.removeEventListener('keydown', teclas, true);
  window.removeEventListener('wheel', cerrarMenuContextual, true);
  window.removeEventListener('blur', cerrarMenuContextual);
}
const fuera = (ev: Event) => { if (abierto && !(ev.target as Node).isConnected) return; if (abierto && !abierto.contains(ev.target as Node)) cerrarMenuContextual(); };
function teclas(ev: KeyboardEvent) {
  if (!abierto) return;
  const items = [...abierto.querySelectorAll<HTMLButtonElement>(':scope > .mc-item:not([disabled]), .mc-sub.abierto > .mc-item:not([disabled])')];
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cerrarMenuContextual(); }
  else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); ev.stopPropagation(); const n = items.length; items[(i + (ev.key === 'ArrowDown' ? 1 : -1) + n) % n]?.focus(); }
}

export function abrirMenuContextual(x: number, y: number, entradas: EntradaMenu[]) {
  cerrarMenuContextual();
  const menu = armar(entradas, true);
  document.body.append(menu);
  // que entre en la pantalla
  const r = menu.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
  menu.style.left = `${Math.max(4, Math.min(x, W - r.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, H - r.height - 4))}px`;
  abierto = menu;
  setTimeout(() => {
    document.addEventListener('pointerdown', fuera, true);
    document.addEventListener('keydown', teclas, true);
    window.addEventListener('wheel', cerrarMenuContextual, true);
    window.addEventListener('blur', cerrarMenuContextual);
  }, 0);
  menu.querySelector<HTMLButtonElement>('.mc-item:not([disabled])')?.focus({ preventScroll: true });
}

function armar(entradas: EntradaMenu[], raiz: boolean): HTMLElement {
  const menu = document.createElement('div');
  menu.className = raiz ? 'menu-contextual' : 'menu-contextual mc-hijo';
  menu.setAttribute('role', 'menu');
  for (const e of entradas) {
    if (e === '—') { const s = document.createElement('div'); s.className = 'mc-sep'; s.setAttribute('role', 'separator'); menu.append(s); continue; }
    if ('titulo' in e) { const t = document.createElement('div'); t.className = 'mc-titulo'; t.textContent = e.titulo; menu.append(t); continue; }
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mc-item' + (e.peligro ? ' peligro' : '') + (e.sub ? ' con-sub' : '');
    b.setAttribute('role', e.marcado !== undefined ? 'menuitemcheckbox' : 'menuitem');
    if (e.marcado !== undefined) b.setAttribute('aria-checked', String(e.marcado));
    const marca = document.createElement('span'); marca.className = 'mc-marca'; marca.textContent = e.marcado ? '✓' : '';
    const txt = document.createElement('span'); txt.className = 'mc-texto'; txt.textContent = e.texto;
    b.append(marca, txt);
    if (e.atajo || e.sub) { const a = document.createElement('span'); a.className = 'mc-atajo'; a.textContent = e.sub ? '›' : e.atajo!; b.append(a); }
    if (e.no) { b.disabled = true; b.title = e.no; } else if (e.ayuda) b.title = e.ayuda;
    if (e.sub) {
      const cont = document.createElement('div'); cont.className = 'mc-sub';
      const hijo = armar(e.sub, false);
      cont.append(b, hijo);
      const abrir = () => {
        menu.querySelectorAll('.mc-sub.abierto').forEach(x => { if (x !== cont) x.classList.remove('abierto'); });
        cont.classList.add('abierto');
        // si no entra a la derecha, del otro lado; si no entra abajo, se sube
        hijo.style.left = ''; hijo.style.right = ''; hijo.style.top = '';
        const r = hijo.getBoundingClientRect();
        if (r.right > window.innerWidth - 4) { hijo.style.left = 'auto'; hijo.style.right = '100%'; }
        if (r.bottom > window.innerHeight - 4) hijo.style.top = `${-5 - (r.bottom - window.innerHeight + 8)}px`;
      };
      b.addEventListener('pointerenter', abrir);
      b.addEventListener('click', () => { abrir(); hijo.querySelector<HTMLButtonElement>('.mc-item:not([disabled])')?.focus(); });
      b.addEventListener('keydown', ev => { if (ev.key === 'ArrowRight' || ev.key === 'Enter') { ev.preventDefault(); abrir(); hijo.querySelector<HTMLButtonElement>('.mc-item:not([disabled])')?.focus(); } });
      menu.append(cont);
      continue;
    }
    b.addEventListener('pointerenter', () => menu.querySelectorAll('.mc-sub.abierto').forEach(x => x.classList.remove('abierto')));
    b.addEventListener('click', () => { cerrarMenuContextual(); e.accion?.(); });
    b.addEventListener('keydown', ev => { if (ev.key === 'ArrowLeft' && !raiz) { ev.preventDefault(); (menu.parentElement?.querySelector('.mc-item') as HTMLButtonElement | null)?.focus(); menu.parentElement?.classList.remove('abierto'); } });
    menu.append(b);
  }
  return menu;
}
