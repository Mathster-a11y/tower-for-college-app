/**
 * Cartas de la planta (los cuadros .calco-panel: insertar, calar, medidas, contorno, colocar, áreas…):
 *  - se pliegan siempre con su botón ▾ (o tocando el título), haya o no otra herramienta abierta;
 *  - plegada, una carta suelta deja el medio de la planta y pasa a la bandeja de abajo; al desplegarla vuelve;
 *  - opción «debajo del 3D»: todas las cartas van al panel derecho, debajo de la axonometría, y la planta queda libre.
 */
const CLAVE_ABAJO = 'torre3d.cartasAbajo';
const leerAbajo = () => { try { return localStorage.getItem(CLAVE_ABAJO) === '1'; } catch { return false; } };
const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

/** de dónde salió cada carta (para devolverla) y el tamaño y lugar que tenía en la planta */
const origen = new WeakMap<HTMLElement, HTMLElement>();
const estilo = new WeakMap<HTMLElement, string>();
const PROPS = ['width', 'height', 'max-height', 'translate'];
const vigiladas = new WeakSet<HTMLElement>();

export interface Cartas { abajo: () => boolean; ponerAbajo: (v: boolean) => void }

export function montarCartas(cont: HTMLElement, dock: HTMLElement): Cartas {
  let abajo = leerAbajo();
  const bandeja = document.createElement('div');
  bandeja.className = 'bandeja-cartas';
  bandeja.setAttribute('aria-label', 'Cartas plegadas');
  cont.append(bandeja);
  /** el lugar de las cartas debajo del 3D (arriba del avance de la planilla) */
  const lugarAbajo = (): HTMLElement | null => {
    let l = document.getElementById('cartas-derecha');
    if (!l) {
      const der = document.querySelector('aside.derecha'); if (!der) return null;
      l = document.createElement('div'); l.id = 'cartas-derecha'; l.className = 'cartas-derecha';
      der.insertBefore(l, document.getElementById('avance'));
    }
    return l;
  };
  // las cartas de abajo se ven solo mientras se ve la planta
  new ResizeObserver(() => { const l = document.getElementById('cartas-derecha'); if (l) l.hidden = !cont.offsetParent || cont.clientWidth === 0; }).observe(cont);

  const esCarta = (e: Element): e is HTMLElement => e instanceof HTMLElement && e.classList.contains('calco-panel');
  const sacarEstilo = (e: HTMLElement) => {
    if (!estilo.has(e)) estilo.set(e, JSON.stringify(PROPS.map(k => [k, e.style.getPropertyValue(k), e.style.getPropertyPriority(k)])));
    PROPS.forEach(k => e.style.removeProperty(k));
  };
  const devolverEstilo = (e: HTMLElement) => {
    const s = estilo.get(e); if (!s) return;
    estilo.delete(e);
    (JSON.parse(s) as [string, string, string][]).forEach(([k, v, p]) => { if (v) e.style.setProperty(k, v, p); });
  };
  const mover = (e: HTMLElement, a: HTMLElement) => {
    if (e.parentElement === a) return;
    if (e.parentElement === cont || e.parentElement === dock) origen.set(e, e.parentElement);
    a.append(e);
  };
  /** cada carta a su lugar: debajo del 3D, en la bandeja (plegada y suelta) o donde estaba */
  const ubicar = (e: HTMLElement) => {
    const de = origen.get(e) ?? (e.parentElement === dock ? dock : cont);
    const l = abajo ? lugarAbajo() : null;
    if (l) { sacarEstilo(e); mover(e, l); return; }
    if (e.classList.contains('plegado') && de === cont) { sacarEstilo(e); mover(e, bandeja); return; }
    if (e.parentElement !== de) { mover(e, de); devolverEstilo(e); }
  };
  const avisar = () => cont.dispatchEvent(new Event('carta-cambiada'));
  const plegar = (e: HTMLElement, v = !e.classList.contains('plegado')) => {
    e.classList.toggle('plegado', v);
    const k = e.classList.contains('prec-panel') ? 'prec' : e.classList.contains('med-panel') ? 'med' : null;
    if (k) guardar('torre3d.plegar.' + k, v ? '1' : '0');
    ubicar(e);
    preparar(e);
    avisar();
  };
  /** los botones de la carta (plegar, llevar abajo o volver), siempre arriba a la derecha */
  const preparar = (e: HTMLElement) => {
    let bs = e.querySelector<HTMLElement>(':scope > .carta-botones');
    if (!bs) {
      bs = document.createElement('span'); bs.className = 'carta-botones';
      const pl = document.createElement('button'); pl.type = 'button'; pl.className = 'carta-plegar';
      pl.addEventListener('click', ev => { ev.stopPropagation(); plegar(e); });
      const ab = document.createElement('button'); ab.type = 'button'; ab.className = 'carta-abajo';
      ab.addEventListener('click', ev => { ev.stopPropagation(); ponerAbajo(!abajo); });
      [pl, ab].forEach(b => b.addEventListener('pointerdown', ev => ev.stopPropagation()));
      bs.append(pl, ab);
      e.append(bs);
      // muchas cartas se rearman enteras (replaceChildren): los botones vuelven
      if (!vigiladas.has(e)) {
        vigiladas.add(e);
        new MutationObserver(() => { if (bs!.parentElement !== e) e.append(bs!); }).observe(e, { childList: true });
      }
    }
    const [pl, ab] = bs.children as unknown as HTMLButtonElement[];
    const pleg = e.classList.contains('plegado');
    pl.textContent = pleg ? '▸' : '▾';
    pl.title = pleg ? 'Desplegar la carta' : 'Plegar la carta (deja libre la planta)';
    pl.setAttribute('aria-label', pl.title); pl.setAttribute('aria-expanded', String(!pleg));
    ab.textContent = abajo ? '⇱' : '⇲';
    ab.title = abajo ? 'Volver las cartas a la planta' : 'Llevar todas las cartas debajo del 3D (panel derecho): la planta queda libre';
    ab.setAttribute('aria-label', ab.title); ab.setAttribute('aria-pressed', String(abajo));
  };
  const todas = () => [...document.querySelectorAll<HTMLElement>('.calco-panel')].filter(e => cont.contains(e) || e.parentElement?.id === 'cartas-derecha');
  const repasar = () => todas().forEach(e => { preparar(e); ubicar(e); });
  const ponerAbajo = (v: boolean) => {
    abajo = v; guardar(CLAVE_ABAJO, v ? '1' : '0');
    document.body.classList.toggle('cartas-abajo', v);
    repasar();
    if (!v) document.getElementById('cartas-derecha')?.remove();
    avisar();
  };
  document.body.classList.toggle('cartas-abajo', abajo);

  // tocar el título pliega o despliega (en la planta, en la bandeja o debajo del 3D)
  document.addEventListener('click', ev => {
    const t = ev.target as HTMLElement;
    if (t.tagName !== 'B') return;
    const e = t.parentElement;
    if (!e || !esCarta(e) || t !== e.querySelector(':scope > b') || !(cont.contains(e) || e.parentElement?.id === 'cartas-derecha')) return;
    plegar(e);
  });
  // las cartas que se agregan después (el contorno, la de colocar…) también
  const obs = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n instanceof Element && esCarta(n)) { preparar(n); ubicar(n); } })));
  obs.observe(cont, { childList: true }); obs.observe(dock, { childList: true });
  repasar();
  return { abajo: () => abajo, ponerAbajo };
}
