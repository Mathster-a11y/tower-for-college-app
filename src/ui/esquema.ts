/**
 * Esquema: el árbol de grupos de dibujo de la planta (grupos, componentes, muros sueltos), con bloquear y ocultar,
 * y las acciones sobre el grupo elegido (agrupar, entrar a editar, copiar, copia vinculada, girar, espejar, uso).
 * Los grupos son para dibujar y ordenar; las piezas de la hoja J no cambian por agrupar.
 */
import { estado, fmt } from './estado';
import { h, seccion, type H } from './comp';
import { huella, type GrupoDib, type Muro } from '../engine/modelo';
import {
  agruparNodos, ancestros, borrarGrupo, copiarNodo, copiasDe, desagruparNodo, espejarNodo, girarNodo, grupoPorId, hacerComponente,
  hacerUnico, hijosGrupo, muroBloqueado, murosDe, murosDirectos, nodoAlTocar, usoDeGrupo,
} from '../engine/grupos';

const abiertos = new Set<string>();
const aviso = (t: string) => { const e = document.getElementById('mensaje'); if (e) e.textContent = t; };

/** ejecuta un cambio que puede fallar con un texto */
function hacer(f: () => string | null | void, ok?: string | (() => string)) {
  let err: string | null | void = null;
  estado.cambiar(() => { err = f(); });
  estado.limpiarGrupos();
  aviso(err || estado.avisoGrupos || (typeof ok === 'function' ? ok() : ok) || '');
  estado.avisarPanel();
}

export function seccionEsquema(): H {
  const p = estado.proyecto;
  const sec = seccion('Esquema (grupos y componentes)');
  const c = sec.cuerpo;
  const gs = p.grupos ?? [];
  const selG = grupoPorId(p, estado.grupoSel);
  // ruta de edición
  if (estado.contexto) {
    const ruta = ancestros(p, estado.contexto).reverse().map(g => g.nombre).join(' › ');
    const salir = h('button', { type: 'button', class: 'mini' }, 'Salir');
    salir.addEventListener('click', () => { const g = grupoPorId(p, estado.contexto); estado.grupoSel = g?.id ?? null; estado.contexto = g?.padre ?? null; estado.avisarPanel(); });
    c.append(h('p', { class: 'ruta-ctx' }, 'Editando: ', h('b', {}, ruta), ' ', salir));
  }
  // árbol
  const arbol = h('ul', { class: 'esquema', role: 'tree' });
  const filaMuro = (m: Muro, nivel: number) => {
    const li = h('li', { class: 'esq-muro' + (estado.seleccion === m.id && !estado.grupoSel ? ' sel' : '') + (estado.multi.m.includes(m.id) ? ' multi' : ''), role: 'treeitem', style: `--n:${nivel}` },
      h('span', { class: 'esq-nombre' }, `${m.id}`), h('span', { class: 'esq-tipo' }, `${m.piezaA || 'sin pieza'} · ${m.dir} ${fmt(m.largo)} × ${fmt(m.espesor)}`));
    li.addEventListener('click', ev => {
      ev.stopPropagation();
      if (ev.shiftKey || ev.ctrlKey || ev.metaKey || estado.eligeVarios) { const n = nodoAlTocar(p, m, estado.contexto); if (n?.t === 'm') { const i = estado.multi.m.indexOf(m.id); if (i >= 0) estado.multi.m.splice(i, 1); else estado.multi.m.push(m.id); estado.avisarPanel(); } return; }
      estado.grupoSel = null; estado.seleccion = m.id; estado.avisarPanel();
    });
    return li;
  };
  const filaGrupo = (g: GrupoDib, nivel: number): H[] => {
    const abierto = abiertos.has(g.id) || ancestros(p, estado.contexto).some(a => a.id === g.id);
    const ms = murosDe(p, g.id);
    const tipo = g.comp ? `componente ×${copiasDe(p, g.comp).length}` : 'grupo';
    const tog = h('button', { type: 'button', class: 'esq-abrir', 'aria-label': abierto ? 'Cerrar' : 'Abrir', 'aria-expanded': String(abierto) }, abierto ? '▾' : '▸');
    tog.addEventListener('click', ev => { ev.stopPropagation(); if (abierto) abiertos.delete(g.id); else abiertos.add(g.id); estado.avisarPanel(); });
    const icono = (on: boolean, si: string, no: string, titulo: string, f: () => void) => {
      const b = h('button', { type: 'button', class: 'esq-icono' + (on ? ' on' : ''), title: titulo, 'aria-pressed': String(on), 'aria-label': titulo }, on ? si : no);
      b.addEventListener('click', ev => { ev.stopPropagation(); f(); });
      return b;
    };
    const li = h('li', { class: 'esq-grupo' + (estado.grupoSel === g.id ? ' sel' : '') + (estado.contexto === g.id ? ' ctx' : '') + (estado.multi.g.includes(g.id) ? ' multi' : '') + (g.comp ? ' comp' : ''), role: 'treeitem', style: `--n:${nivel}`, title: 'Clic: elegir · doble clic: entrar a editarlo' },
      tog, h('span', { class: 'esq-nombre' }, g.nombre), h('span', { class: 'esq-tipo' }, `${tipo} · ${ms.length} muros`),
      icono(!!g.bloq, '🔒', '🔓', g.bloq ? 'Desbloquear' : 'Bloquear: no se mueve ni se edita (se sigue calculando)', () => hacer(() => { g.bloq = !g.bloq || undefined; if (!g.bloq) delete g.bloq; }, () => (grupoPorId(estado.proyecto, g.id)?.bloq ? `«${g.nombre}» bloqueado 🔒: no se mueve ni se edita; se sigue calculando.` : `«${g.nombre}» desbloqueado.`))),
      icono(!!g.oculto, '🙈', '👁', g.oculto ? 'Mostrar en la planta' : 'Ocultar en la planta (se sigue calculando)', () => hacer(() => { g.oculto = !g.oculto || undefined; if (!g.oculto) delete g.oculto; }, () => (grupoPorId(estado.proyecto, g.id)?.oculto ? `«${g.nombre}» oculto en la planta: se sigue calculando.` : `«${g.nombre}» visible.`))));
    li.addEventListener('click', ev => {
      if (ev.shiftKey || ev.ctrlKey || ev.metaKey || estado.eligeVarios) { const i = estado.multi.g.indexOf(g.id); if (i >= 0) estado.multi.g.splice(i, 1); else estado.multi.g.push(g.id); estado.avisarPanel(); return; }
      estado.grupoSel = g.id; estado.seleccion = ms[0]?.id ?? null;
      estado.avisarPanel();
    });
    li.addEventListener('dblclick', ev => { ev.preventDefault(); estado.contexto = g.id; estado.grupoSel = null; abiertos.add(g.id); aviso(`Editando «${g.nombre}»: el resto queda atenuado.`); estado.avisarPanel(); });
    const out: H[] = [li];
    if (abierto) {
      hijosGrupo(p, g.id).forEach(hg => out.push(...filaGrupo(hg, nivel + 1)));
      murosDirectos(p, g.id).forEach(m => out.push(filaMuro(m, nivel + 1)));
    }
    return out;
  };
  hijosGrupo(p, null).forEach(g => arbol.append(...filaGrupo(g, 0)));
  const sueltos = murosDirectos(p, null);
  if (sueltos.length) {
    const ab = abiertos.has('__sueltos');
    const tog = h('button', { type: 'button', class: 'esq-abrir', 'aria-label': ab ? 'Cerrar' : 'Abrir', title: ab ? 'Cerrar' : 'Abrir' }, ab ? '▾' : '▸');
    const li = h('li', { class: 'esq-grupo sueltos', style: '--n:0' }, tog, h('span', { class: 'esq-nombre' }, 'Muros sueltos'), h('span', { class: 'esq-tipo' }, `${sueltos.length} muros fuera de grupos`));
    li.addEventListener('click', () => { if (ab) abiertos.delete('__sueltos'); else abiertos.add('__sueltos'); estado.avisarPanel(); });
    arbol.append(li);
    if (ab) sueltos.forEach(m => arbol.append(filaMuro(m, 1)));
  }
  if (!gs.length) c.append(h('p', { class: 'nota chica' }, 'Todavía no hay grupos. Elegí muros con Mayúsculas + clic (o «Elegir varios» con el lápiz) y apretá «Agrupar» (Ctrl+G). Un grupo se mueve entero; con doble clic se entra a editarlo.'));
  c.append(h('div', { class: 'scroll esquema-caja' }, arbol));

  // acciones
  const acc = h('div', { class: 'fila-acciones esq-acciones' });
  const b = (t: string, titulo: string, f: () => void, on = true, cls = 'mini') => { const x = h('button', { type: 'button', class: cls, title: titulo }, t) as HTMLButtonElement; x.disabled = !on; x.addEventListener('click', f); return x; };
  const nMulti = estado.multi.m.length + estado.multi.g.length;
  const varios = b(estado.eligeVarios ? '✓ Elegir varios' : 'Elegir varios', 'Cada toque en la planta o en el Esquema suma o saca de la selección (para el lápiz o el dedo; con el mouse: Mayúsculas + clic)', () => { estado.eligeVarios = !estado.eligeVarios; estado.avisarPanel(); });
  varios.classList.toggle('activo', estado.eligeVarios);
  const selMuro = p.muros.find(m => m.id === estado.seleccion);
  acc.append(varios,
    b(`Agrupar${nMulti ? ` (${nMulti})` : ''}`, 'Junta lo elegido en un grupo (Ctrl+G)', () => {
      const ms = [...estado.multi.m], g2 = [...estado.multi.g];
      if (!ms.length && !g2.length && selMuro) { const n = nodoAlTocar(p, selMuro, estado.contexto); if (n) (n.t === 'g' ? g2 : ms).push(n.id); }
      const r: { v: { id: string } | { error: string } } = { v: { error: 'Elegí muros o grupos para agrupar.' } };
      hacer(() => { if (ms.length || g2.length) r.v = agruparNodos(estado.proyecto, ms, g2, estado.contexto); return 'error' in r.v ? r.v.error : null; });
      if (!('error' in r.v)) { estado.grupoSel = r.v.id; estado.multi = { m: [], g: [] }; estado.eligeVarios = false; aviso(`Grupo nuevo: «${grupoPorId(estado.proyecto, r.v.id)?.nombre}».`); estado.avisarPanel(); }
    }, nMulti > 0 || !!selMuro),
    b('Limpiar', 'Vacía la selección múltiple (Esc)', () => { estado.multi = { m: [], g: [] }; estado.avisarPanel(); }, nMulti > 0),
    b(`Borrar${nMulti ? ` (${nMulti})` : ''}`, 'Borra lo elegido (Supr en la planta). Ctrl+Z deshace.', () => document.dispatchEvent(new CustomEvent('torre:borrar-elegidos')), nMulti > 0, 'mini peligro'),
    b('Elegir fuera del cálculo', 'Elige todos los muros que no entran al cálculo (no llegan a la fundación o quedan fuera del molde en los dos vientos), para borrarlos o agruparlos', () => document.dispatchEvent(new CustomEvent('torre:elegir-fuera'))));
  c.append(acc);

  if (selG) {
    const p2 = estado.proyecto;
    const ms = murosDe(p2, selG.id);
    const caja = ms.reduce((a, m) => { const { ax } = huella(m); return { x0: Math.min(a.x0, m.x - ax / 2), x1: Math.max(a.x1, m.x + ax / 2) }; }, { x0: Infinity, x1: -Infinity });
    const ancho = isFinite(caja.x1) ? +(caja.x1 - caja.x0 + 1).toFixed(2) : 2;
    const bloq = ancestros(p2, selG.id).some(g => g.bloq);
    const det = h('div', { class: 'esq-detalle' });
    det.append(h('h4', {}, `${selG.bloq ? '🔒 ' : ''}${selG.nombre}`, h('span', { class: 'esq-tipo' }, selG.comp ? ` · componente ${selG.comp}: ${copiasDe(p2, selG.comp).length} copias vinculadas (editar una cambia todas)` : ' · grupo')));
    const nom = h('input', { type: 'text', value: selG.nombre, 'aria-label': 'Nombre del grupo', class: 'esq-input' }) as HTMLInputElement;
    nom.addEventListener('change', () => hacer(() => { const g = grupoPorId(estado.proyecto, selG.id); if (g && nom.value.trim()) g.nombre = nom.value.trim(); }));
    det.append(h('label', { class: 'esq-campo' }, 'Nombre ', nom));
    const a2 = h('div', { class: 'fila-acciones' });
    const id = selG.id;
    a2.append(
      b('Entrar', 'Editar adentro del grupo (doble clic); el resto queda atenuado', () => { estado.contexto = id; estado.grupoSel = null; abiertos.add(id); estado.avisarPanel(); }, !bloq),
      b('Desagrupar', 'Deshace el grupo; su contenido queda en el nivel de arriba (Ctrl+Mayús+G)', () => { hacer(() => desagruparNodo(estado.proyecto, id), 'Grupo deshecho.'); estado.grupoSel = null; estado.avisarPanel(); }, !bloq),
      b('Copiar', `Copia independiente, ${fmt(ancho)} m a la derecha`, () => { const r: { v: { id: string } | { error: string } | null } = { v: null }; hacer(() => { r.v = copiarNodo(estado.proyecto, id, ancho, 0, false); return 'error' in r.v ? r.v.error : null; }, 'Copia independiente lista: arrastrala a su lugar.'); if (r.v && !('error' in r.v)) { estado.grupoSel = r.v.id; estado.avisarPanel(); } }),
      b('Copia vinculada', `Otra copia del mismo componente, ${fmt(ancho)} m a la derecha: si se edita una, cambian todas`, () => { const r: { v: { id: string } | { error: string } | null } = { v: null }; hacer(() => { r.v = copiarNodo(estado.proyecto, id, ancho, 0, true); return 'error' in r.v ? r.v.error : null; }, 'Copia vinculada lista: si editás una, cambian todas. Arrastrala a su lugar.'); if (r.v && !('error' in r.v)) { estado.grupoSel = r.v.id; estado.avisarPanel(); } }),
      selG.comp ? b('Hacer único', 'Separa esta copia: deja de estar vinculada', () => hacer(() => { hacerUnico(estado.proyecto, id); }, 'La copia ya no está vinculada.'), !bloq)
        : b('Hacer componente', 'Convierte el grupo en componente (para hacer copias vinculadas)', () => hacer(() => hacerComponente(estado.proyecto, id), 'Ahora es un componente: «Copia vinculada» para repetirlo.'), !bloq),
      b('Girar 90°', 'Gira el grupo alrededor del centro de su caja', () => hacer(() => { girarNodo(estado.proyecto, id); }), !bloq),
      b('Espejar ↔', 'Espeja respecto de un eje vertical por el centro de su caja', () => hacer(() => { espejarNodo(estado.proyecto, id, 'x'); }), !bloq),
      b('Espejar ↕', 'Espeja respecto de un eje horizontal por el centro de su caja', () => hacer(() => { espejarNodo(estado.proyecto, id, 'y'); }), !bloq),
      b('Borrar', 'Borra el grupo con sus muros', () => { if (!confirm(`¿Borrar «${selG.nombre}» con sus ${ms.length} muros?`)) return; hacer(() => borrarGrupo(estado.proyecto, id), 'Grupo borrado.'); estado.grupoSel = null; estado.avisarPanel(); }, !bloq, 'mini peligro'),
    );
    det.append(a2);
    // uso, como un tabique (propio de esta copia)
    const niv = p2.niveles;
    const comun = <T,>(f: (m: Muro) => T) => { const v = ms.map(f); return v.every(x => x === v[0]) ? v[0] : undefined; };
    const llega = comun(m => m.llega), zD = comun(m => m.zDesde ?? null), zH = comun(m => m.zHasta ?? null);
    const selNivel = (valor: number | null | undefined, vacio: string, f: (z: number | null) => void) => {
      const s = h('select', {}) as HTMLSelectElement;
      s.append(h('option', { value: '' }, vacio), ...niv.map(n => h('option', { value: String(n.cota) }, n.nombre)));
      if (valor === undefined) { s.append(h('option', { value: '__' }, '(varios)')); s.value = '__'; } else s.value = valor === null ? '' : String(valor);
      s.disabled = bloq;
      s.addEventListener('change', () => { if (s.value !== '__') f(s.value === '' ? null : Number(s.value)); });
      return s;
    };
    const sLlega = h('select', {}) as HTMLSelectElement;
    sLlega.append(h('option', { value: 'si' }, 'sí'), h('option', { value: 'no' }, 'no'));
    if (llega === undefined) { sLlega.append(h('option', { value: '__' }, '(varios)')); sLlega.value = '__'; } else sLlega.value = llega ? 'si' : 'no';
    sLlega.disabled = bloq;
    sLlega.addEventListener('change', () => { if (sLlega.value !== '__') hacer(() => { usoDeGrupo(estado.proyecto, id, { llega: sLlega.value === 'si' }); }); });
    det.append(h('div', { class: 'esq-uso' },
      h('span', { class: 'esq-tipo' }, selG.comp ? 'Uso de esta copia (como un tabique; no pasa a las otras):' : 'Uso (como un tabique, para todos sus muros):'),
      h('label', {}, 'Llega a la fundación ', sLlega),
      h('label', {}, 'Desde ', selNivel(zD, 'fundación', z => hacer(() => { usoDeGrupo(estado.proyecto, id, { zDesde: z }); }))),
      h('label', {}, 'Hasta ', selNivel(zH, 'azotea', z => hacer(() => { usoDeGrupo(estado.proyecto, id, { zHasta: z }); })))));
    if (bloq) det.append(h('p', { class: 'nota chica' }, 'Bloqueado: no se mueve ni se edita, pero se sigue calculando. Desbloquealo con el candado del Esquema.'));
    c.append(det);
  } else if (selMuro && muroBloqueado(p, selMuro)) c.append(h('p', { class: 'nota chica' }, `${selMuro.id} está bloqueado.`));
  return sec.el;
}
