/**
 * Recorrido guiado para la primera vez: resalta cada parte de la pantalla y explica qué se hace ahí.
 * Se abre solo la primera vez y después desde Mostrar ▾ → «Recorrido guiado».
 */
const CLAVE = 'torre3d.recorrido.visto';
interface Paso { sel: string; titulo: string; texto: string }
const PASOS: Paso[] = [
  { sel: '#riel', titulo: '1 · Las etapas de la planilla', texto: 'Se recorren de arriba hacia abajo, como las hojas del Excel: Diseño, Viento, Fuerzas, Estabilidad, Rigidez, Rototraslación, Flexión y la Carta. El punto de color dice si la etapa verifica.' },
  { sel: '#lateral', titulo: '2 · Los datos y las fórmulas', texto: 'En Diseño se cargan los niveles, los muros y las piezas. En las otras etapas, este panel muestra las fórmulas con la celda de la planilla de donde salen.' },
  { sel: '#vista-planta', titulo: '3 · La planta', texto: 'Se dibujan y mueven los muros, columnas y núcleos: agarralos desde una esquina, un medio o el centro (aparecen al pasar el mouse) y se pegan a las esquinas y caras de los demás. Rueda o pellizco para acercar. También se importa un plano de CAD, se insertan piezas tipo y se editan la losa, la carpintería y las áreas de influencia.' },
  { sel: '#vista-3d', titulo: '4 · La torre en 3D', texto: 'La axonometría se actualiza sola. En Rototraslación muestra la deformada exagerada: cuánto se traslada y cuánto gira cada nivel con el viento.' },
  { sel: '#avance', titulo: '5 · El avance', texto: 'Qué etapas están completas y cuáles no verifican. Un clic lleva a la etapa.' },
  { sel: '#b-mis', titulo: '6 · Mis proyectos', texto: 'Guardá versiones con nombre en este navegador para comparar variantes. Al abrir un ejemplo u otro archivo, el proyecto actual se guarda solo.' },
  { sel: '#b-exportar-menu', titulo: '7 · Para entregar', texto: 'La lámina A3, el informe en PDF, el proyecto (.json) y la planilla del curso escrita con tus datos (botón azul), lista para abrir en Excel.' },
];

export function recorrido(desde = 0) {
  document.querySelector('.recorrido')?.remove();
  let i = desde;
  const capa = document.createElement('div'); capa.className = 'recorrido'; capa.setAttribute('role', 'dialog'); capa.setAttribute('aria-modal', 'true');
  const foco = document.createElement('div'); foco.className = 'recorrido-foco';
  const globo = document.createElement('div'); globo.className = 'recorrido-globo';
  capa.append(foco, globo);
  document.body.append(capa);
  const cerrar = () => { capa.remove(); document.removeEventListener('keydown', teclas); window.removeEventListener('resize', mostrar); try { localStorage.setItem(CLAVE, '1'); } catch { /* sin almacenamiento */ } };
  const teclas = (ev: KeyboardEvent) => { if (ev.key === 'Escape') cerrar(); else if (ev.key === 'ArrowRight') ir(1); else if (ev.key === 'ArrowLeft') ir(-1); };
  const ir = (d: number) => { const j = i + d; if (j < 0) return; if (j >= PASOS.length) { cerrar(); return; } i = j; mostrar(); };
  function mostrar() {
    const p = PASOS[i];
    const e = document.querySelector<HTMLElement>(p.sel);
    const r = e && e.getBoundingClientRect().width > 0 ? e.getBoundingClientRect() : null;
    if (e && r) e.scrollIntoView({ block: 'nearest' });
    const rr = e?.getBoundingClientRect();
    if (rr && rr.width > 0) Object.assign(foco.style, { display: 'block', left: `${rr.left - 4}px`, top: `${rr.top - 4}px`, width: `${rr.width + 8}px`, height: `${rr.height + 8}px` });
    else foco.style.display = 'none';
    globo.replaceChildren();
    const t = document.createElement('b'); t.textContent = p.titulo;
    const x = document.createElement('p'); x.textContent = p.texto;
    const pie = document.createElement('div'); pie.className = 'recorrido-pie';
    const n = document.createElement('span'); n.textContent = `${i + 1} de ${PASOS.length}`;
    const boton = (txt: string, f: () => void, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; if (cls) b.className = cls; b.addEventListener('click', f); return b; };
    pie.append(n, boton('Salir', cerrar), ...(i > 0 ? [boton('Anterior', () => ir(-1))] : []), boton(i === PASOS.length - 1 ? 'Terminar' : 'Siguiente', () => ir(1), 'primario'));
    globo.append(t, x, pie);
    // el globo va al lado del elemento que entre en la pantalla (abajo, arriba, derecha o centrado)
    const W = window.innerWidth, H = window.innerHeight, gw = Math.min(340, W - 32);
    globo.style.width = `${gw}px`;
    const gh = globo.offsetHeight || 160;
    let left = W / 2 - gw / 2, top = H / 2 - gh / 2;
    if (rr && rr.width > 0) {
      if (rr.bottom + 12 + gh < H) { top = rr.bottom + 12; left = rr.left; }
      else if (rr.top - 12 - gh > 0) { top = rr.top - 12 - gh; left = rr.left; }
      else if (rr.right + 12 + gw < W) { left = rr.right + 12; top = Math.max(16, Math.min(H - gh - 16, rr.top)); }
      else if (rr.left - 12 - gw > 0) { left = rr.left - 12 - gw; top = Math.max(16, Math.min(H - gh - 16, rr.top)); }
    }
    left = Math.max(16, Math.min(W - gw - 16, left));
    Object.assign(globo.style, { left: `${left}px`, top: `${top}px` });
    (globo.querySelector('button.primario') as HTMLButtonElement | null)?.focus();
  }
  document.addEventListener('keydown', teclas);
  window.addEventListener('resize', mostrar);
  mostrar();
}
/** la primera vez que se abre la app */
export function recorridoSiEsPrimeraVez() {
  let visto = false;
  try { visto = localStorage.getItem(CLAVE) === '1'; } catch { visto = true; }
  if (!visto && !navigator.webdriver) setTimeout(() => recorrido(0), 700);   // en las pruebas automáticas no
}
