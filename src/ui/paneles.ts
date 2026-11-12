/** Paneles de datos de la etapa «Diseño» (proyecto, viento, materiales, niveles, muros, piezas), resultados, avisos y ayuda. */
import { dibujoPerfil } from './perfil';
import { AUTOR, ANIO, HASTA, LICENCIA_NOMBRE, LICENCIA_URL, vigente } from '../autoria';
import { estado, fmt, COLORES } from './estado';
import { tipoDe, type Muro, type Nivel, type RolMolde, type TipoElemento } from '../engine/modelo';
import { agrupar, armarPiezas, desagrupar, espejarGrupo, girarGrupo, seTocan } from '../engine/dibujo';
import { TENSION_ADM } from '../engine/verificaciones';
import { cotasDesdeCorte, factorUnidad, leerDXFCompleto, nombrarNiveles } from '../engine/cad';
import { grilla, filasElegidas, elegirFila, aNumero, type Columna } from './grilla';
import { h, seccion, type H } from './comp';

const num = (v: string) => { const x = parseFloat(v.replace(',', '.')); return isFinite(x) ? x : null; };

/** Fila de formulario: rótulo · campo · unidad, y la ayuda debajo (sistema de ventanas). */
function campo(cont: H, etq: string, id: string, valor: string | number, onChange: (v: string) => void, opts: { tipo?: string; ayuda?: string; lista?: string[]; unidad?: string; globo?: string } = {}) {
  const lab = h('label', { for: id }, etq);
  if (opts.globo) lab.setAttribute('data-globo', opts.globo);
  let inp: HTMLInputElement | HTMLSelectElement;
  if (opts.lista) {
    inp = h('select', { id });
    opts.lista.forEach(o => inp.append(h('option', { value: o }, o)));
    inp.value = String(valor);
  } else {
    inp = h('input', { id, type: 'text', value: typeof valor === 'number' ? String(valor).replace('.', ',') : valor, inputmode: opts.tipo === 'number' ? 'decimal' : 'text' });
    if (opts.tipo === 'number') inp.className = 'n';
  }
  inp.addEventListener('change', () => onChange(inp.value));
  cont.append(lab, inp, h('span', { class: 'unidad' }, opts.unidad ?? ''));
  if (opts.ayuda) cont.append(h('span', { class: 'ayuda' }, opts.ayuda));
}

// ------------------------------------------------------------------ Proyecto, viento, materiales
export const EXPO: Record<string, [number, number]> = { A: [457, 5], B: [366, 7], C: [274, 9.5], D: [213, 11.5] };
const set = (f: () => void) => estado.cambiar(f);

export function seccionProyecto(): H {
  const p = estado.proyecto;
  const fo = h('div', { class: 'formulario' });
  campo(fo, 'Nombre', 's-nombre', p.nombre, v => set(() => (p.nombre = v)));
  campo(fo, 'Alumno', 's-alumno', p.alumno, v => set(() => (p.alumno = v)));
  return seccion('Proyecto', fo).el;
}

export function seccionViento(): H {
  const s = estado.proyecto.sitio;
  const expo = Object.entries(EXPO).find(([, v]) => v[0] === s.zg && v[1] === s.alfa)?.[0] ?? '';
  const fo = h('div', { class: 'formulario' });
  const nu = (k: keyof typeof s) => (v: string) => set(() => { s[k] = num(v) ?? s[k]; });
  campo(fo, 'V', 's-V', s.V, nu('V'), { tipo: 'number', unidad: 'm/s', ayuda: 'velocidad básica · CIRSOC 102, Fig. 1A o 1B · viento!C4', globo: 'Velocidad básica|Ráfaga de 3 s a 10 m de altura en terreno abierto, con 50 años de recurrencia. Sale del mapa de la Fig. 1 del CIRSOC 102.' });
  campo(fo, 'Kd', 's-Kd', s.Kd, nu('Kd'), { tipo: 'number', ayuda: 'factor de direccionalidad · Tabla 6 · viento!D4' });
  campo(fo, 'I', 's-I', s.I, nu('I'), { tipo: 'number', ayuda: 'factor de importancia · Tabla 1 · viento!E4' });
  campo(fo, 'Exposición', 's-expo', expo, v => set(() => { if (EXPO[v]) [s.zg, s.alfa] = EXPO[v]; }), { lista: ['', 'A', 'B', 'C', 'D'], ayuda: 'art. 5.6: completa zg y α (Tabla 4)' });
  campo(fo, 'zg', 's-zg', s.zg, nu('zg'), { tipo: 'number', unidad: 'm', ayuda: 'viento!F4' });
  campo(fo, 'α', 's-alfa', s.alfa, nu('alfa'), { tipo: 'number', ayuda: 'viento!G4' });
  campo(fo, 'Kzt', 's-Kzt', s.Kzt, nu('Kzt'), { tipo: 'number', ayuda: 'factor topográfico · Fig. 2; 1 en llano · viento!I4' });
  campo(fo, 'G', 's-G', s.G, nu('G'), { tipo: 'number', ayuda: 'factor de ráfaga · 0,85 si F ≥ 1 Hz · viento!J4' });
  campo(fo, 'Cp barlovento', 's-Cpb', s.Cpb, nu('Cpb'), { tipo: 'number', ayuda: 'Fig. 3 · viento!K4' });
  campo(fo, 'Cp sotavento', 's-Cps', s.Cps, nu('Cps'), { tipo: 'number', ayuda: 'Fig. 3, según L/B · viento!L4' });
  campo(fo, 'GCpi', 's-GCpi', s.GCpi, nu('GCpi'), { tipo: 'number', ayuda: 'Tabla 7 · viento!O4 · no entra en el cálculo (se anula en el edificio)' });
  return seccion('Datos del viento · CIRSOC 102', fo).el;
}

export function seccionMateriales(): H {
  const p = estado.proyecto;
  const fo = h('div', { class: 'formulario' });
  campo(fo, 'Hormigón', 's-horm', p.hormigon, v => set(() => (p.hormigon = v)), { lista: ['H20', 'H25', 'H30', 'H35', 'H40', 'H45', 'H50'], ayuda: `resistencia característica σbk = ${TENSION_ADM(p.hormigon)} kg/cm² (H30 → 30 MPa); es el límite de compresión que usa la guía` });
  campo(fo, 'b1', 's-b1', p.fundacion.b1, v => set(() => (p.fundacion.b1 = num(v) ?? p.fundacion.b1)), { tipo: 'number', unidad: 'm', ayuda: 'lado de la fundación paralelo al viento A · M,NyQ!N80' });
  campo(fo, 'a1', 's-a1', p.fundacion.a1, v => set(() => (p.fundacion.a1 = num(v) ?? p.fundacion.a1)), { tipo: 'number', unidad: 'm', ayuda: 'lado perpendicular al viento A · M,NyQ!N81' });
  return seccion('Materiales y fundación', fo).el;
}

export function panelProyecto(c: H) { c.append(seccionProyecto(), seccionMateriales()); }

// ------------------------------------------------------------------ Niveles
export function panelNiveles(c: H) {
  const p = estado.proyecto;
  c.append(h('p', { class: 'nota' }, 'De la azotea al último subsuelo. B y L van en la primera fila y donde la planta cambia; vacío = igual al de arriba. Hasta 50 pisos sobre PB y 3 subsuelos.'));
  const gen = h('div', { class: 'fila-acciones' });
  const nP = h('input', { type: 'number', value: '20', min: '1', max: '50', 'aria-label': 'Pisos sobre PB', id: 'gen-n' });
  const hT = h('input', { type: 'number', value: '3', step: 'any', 'aria-label': 'Altura del piso tipo', id: 'gen-h' });
  const hPB = h('input', { type: 'number', value: '4', step: 'any', 'aria-label': 'Altura de PB', id: 'gen-pb' });
  const nS = h('input', { type: 'number', value: '2', min: '0', max: '3', 'aria-label': 'Subsuelos', id: 'gen-s' });
  const bGen = h('button', { type: 'button' }, 'Generar');
  bGen.addEventListener('click', () => estado.cambiar(() => {
    const n = Math.min(50, Math.max(1, num(nP.value) ?? 20)), ht = num(hT.value) ?? 3, hp = num(hPB.value) ?? 4, ns = Math.min(3, Math.max(0, num(nS.value) ?? 0));
    const B0 = p.niveles[0]?.B ?? 20, L0 = p.niveles[0]?.L ?? 16;
    const nv: Nivel[] = [{ nombre: 'Azotea', cota: +(hp + ht * (n - 1)).toFixed(2), B: B0, L: L0 }];
    for (let k = n - 1; k >= 1; k--) nv.push({ nombre: `${k}º`, cota: +(hp + ht * (k - 1)).toFixed(2) });
    nv.push({ nombre: 'PB', cota: 0 });
    for (let k = 1; k <= ns; k++) nv.push({ nombre: `${k}º SS`, cota: -3 * k });
    p.niveles = nv;
  }));
  gen.append(h('span', {}, 'Generar:'), nP, h('span', {}, 'pisos de'), hT, h('span', {}, 'm, PB de'), hPB, h('span', {}, 'm y'), nS, h('span', {}, 'subsuelos'), bGen);
  c.append(gen);
  c.append(h('p', { class: 'nota' }, 'Como en Excel: elegí celdas con el mouse o Mayús + flechas, escribí encima, arrastrá el cuadradito de la esquina para copiar o seguir la serie (cotas: elegí dos y arrastrá), Ctrl+C / Ctrl+V para copiar y pegar desde Excel, Supr para borrar.'));
  const numCol = (titulo: string, clave: 'cota' | 'B' | 'L', opcional: boolean): Columna<Nivel> => ({
    titulo, clave, tipo: 'numero',
    leer: n => n[clave] ?? null,
    escribir: (n, v) => { const x = aNumero(v); if (x === null) { if (!opcional) return false; delete n[clave]; return; } if (Number.isNaN(x)) return false; n[clave] = x; },
  });
  c.append(grilla<Nivel>([
    { titulo: 'Nivel', clave: 'nombre', leer: n => n.nombre, escribir: (n, v) => { n.nombre = v.trim(); } },
    numCol('Cota (m)', 'cota', false), numCol('B (m)', 'B', true), numCol('L (m)', 'L', true),
  ], { id: 'niveles', filas: () => estado.proyecto.niveles, nueva: () => { const u = estado.proyecto.niveles.at(-1); return { nombre: '', cota: +((u?.cota ?? 0) - 3).toFixed(2) }; } }));
  const acc = h('div', { class: 'fila-acciones' });
  const ins = h('button', { type: 'button' }, 'Insertar fila');
  ins.addEventListener('click', () => estado.cambiar(() => { const r = filasElegidas('niveles')?.[0] ?? p.niveles.length; p.niveles.splice(r, 0, { nombre: '', cota: p.niveles[r]?.cota ?? 0 }); }));
  const borr = h('button', { type: 'button' }, 'Borrar filas elegidas');
  borr.addEventListener('click', () => estado.cambiar(() => { const s = filasElegidas('niveles'); if (s) p.niveles.splice(s[0], s[1] - s[0] + 1); }));
  const add = h('button', { type: 'button' }, 'Agregar nivel abajo');
  add.addEventListener('click', () => estado.cambiar(() => { const u = p.niveles[p.niveles.length - 1]; p.niveles.push({ nombre: 'nuevo', cota: (u?.cota ?? 0) - 3 }); }));
  acc.append(ins, borr, add);
  c.append(acc);
  const imp = h('button', { type: 'button' }, 'Importar desde Excel…');
  imp.addEventListener('click', () => document.dispatchEvent(new CustomEvent('torre:importar')));
  const tab = h('button', { type: 'button' }, 'Descargar tabla (.xlsx)');
  tab.title = 'Niveles y muros del proyecto en un Excel: sirve de plantilla para llenar y volver a importar';
  tab.addEventListener('click', () => document.dispatchEvent(new CustomEvent('torre:tabla')));
  c.append(h('div', { class: 'fila-acciones' }, imp, tab));
  c.append(importarCorte());
}

/** «Importar corte (DXF)»: las losas del corte (líneas horizontales largas) dan las cotas; el usuario elige PB y confirma. */
function importarCorte(): H {
  const caja = h('div', { class: 'corte-imp' });
  const archivo = h('input', { type: 'file', accept: '.dxf', hidden: '' }) as HTMLInputElement;
  const bot = h('button', { type: 'button' }, 'Importar corte (DXF)…');
  bot.title = 'Lee las losas de un corte dibujado en CAD y propone los niveles con sus cotas';
  bot.addEventListener('click', () => archivo.click());
  const panel = h('div', { class: 'corte-panel', hidden: '' });
  caja.append(h('div', { class: 'fila-acciones' }, bot), archivo, panel);
  archivo.addEventListener('change', async () => {
    const f = archivo.files?.[0]; archivo.value = '';
    if (!f) return;
    const d = leerDXFCompleto(await f.text());
    if (!d.entidades.length) { avisoPanel(`${f.name}: no tiene líneas ni polilíneas.`); return; }
    const { factor, unidad } = factorUnidad(d);
    let capa = '', iPB = 0, cotas: number[] = [];
    const armar = () => {
      cotas = cotasDesdeCorte(capa ? d.entidades.filter(e => e.capa === capa) : d.entidades, factor);
      // PB: la cota más cercana a 0 si el dibujo tiene el 0 en PB; si no, la más baja
      const cero = cotas.findIndex(z => Math.abs(z) < 0.05);
      iPB = cero >= 0 ? cero : Math.max(0, cotas.length - 1);
      dibujarPanel();
    };
    const dibujarPanel = () => {
      panel.replaceChildren();
      panel.hidden = false;
      const selCapa = h('select', { 'aria-label': 'Capa de las losas' }) as HTMLSelectElement;
      selCapa.append(h('option', { value: '' }, 'todas las capas'), ...d.capas.map(k => h('option', { value: k }, k)));
      selCapa.value = capa;
      selCapa.addEventListener('change', () => { capa = selCapa.value; armar(); });
      panel.append(h('p', {}, h('b', {}, f.name), ` · en ${unidad}. Capa de las losas: `), selCapa);
      if (!cotas.length) { panel.append(h('p', { class: 'nota' }, 'No encontré líneas horizontales largas (losas) en esa capa.')); return; }
      const nom = nombrarNiveles(cotas, iPB);
      const tabla = h('table', { class: 'corte-tabla' });
      tabla.append(h('tr', {}, h('th', {}, 'PB'), h('th', {}, 'Nivel'), h('th', {}, 'Cota (m)'), h('th', {}, 'Altura de piso (m)')));
      nom.forEach((n, i) => {
        const r = h('input', { type: 'radio', name: 'corte-pb', 'aria-label': `PB en ${n.cota} m` }) as HTMLInputElement;
        r.checked = i === iPB;
        r.addEventListener('change', () => { iPB = i; dibujarPanel(); });
        const hp = i < nom.length - 1 ? fmt(n.cota - nom[i + 1].cota, 2) : '—';
        tabla.append(h('tr', {}, h('td', {}, r), h('td', {}, n.nombre), h('td', {}, fmt(n.cota, 2)), h('td', {}, hp)));
      });
      panel.append(tabla);
      const usar = h('button', { type: 'button', class: 'primario' }, `Usar estos ${nom.length} niveles`);
      usar.addEventListener('click', () => estado.cambiar(() => {
        const p = estado.proyecto, viejos = p.niveles;
        p.niveles = nom.map((n, i) => {
          const igual = viejos.find(v => v.nombre === n.nombre);
          const nv: Nivel = { ...(igual ?? {}), nombre: n.nombre, cota: n.cota };
          if (i === 0) { nv.B ??= viejos[0]?.B ?? 20; nv.L ??= viejos[0]?.L ?? 16; }
          return nv;
        });
        panel.hidden = true;
        avisoPanel(`Niveles tomados del corte ${f.name}: ${nom.length} niveles, de ${fmt(nom.at(-1)!.cota, 2)} a ${fmt(nom[0].cota, 2)} m.`);
      }));
      const cancelar = h('button', { type: 'button' }, 'Cancelar');
      cancelar.addEventListener('click', () => { panel.hidden = true; });
      panel.append(h('p', { class: 'nota' }, 'Se toma la cara de arriba de cada losa (NPT aproximado). Revisá los nombres y las cotas en la tabla de niveles después; B, L, siluetas y carpinterías de los niveles con el mismo nombre se conservan.'), h('div', { class: 'fila-acciones' }, usar, cancelar));
    };
    armar();
  });
  return caja;
}

// ------------------------------------------------------------------ Muros
let contador = 1;
const avisoPanel = (t: string) => { const e = document.getElementById('mensaje'); if (e) e.textContent = t; };
const ROLES_ALMA: RolMolde[] = ['alma', 'alma der.', 'fuera'], ROLES_ALA: RolMolde[] = ['ala sup.', 'ala inf.', 'fuera'];

/**
 * Grupos: cada pieza armada como un elemento, con sus muros. Cada muro muestra el color de su columna en la hoja J
 * (como los dibujos debajo de las tablas de tabiques) y un selector de papel por viento: «auto» deja el que propone
 * la app. Abajo, el J del molde contra el J de la sección real.
 */
function seccionGrupos(c: H) {
  const p = estado.proyecto, asig = estado.calculo.asig;
  const nombres = [...new Set(p.muros.map(m => m.grupo).filter(Boolean) as string[])];
  if (!nombres.length) {
    c.append(h('p', { class: 'nota chica' }, 'Grupos: elegí un muro de una pieza y apretá «Agrupar pieza» para manejarla como un elemento (mover, girar, espejar) y elegir el papel de cada muro en la hoja J.'));
    return;
  }
  const selGrupo = p.muros.find(m => m.id === estado.seleccion)?.grupo;
  const sec = seccion('Grupos (piezas como un elemento)');
  nombres.forEach(g => {
    const ms = p.muros.filter(m => m.grupo === g);
    const pz = (d: 'A' | 'B') => asig?.piezas.find(x => x.dir === d && x.muros.includes(ms[0].id));
    const resumen = (d: 'A' | 'B') => { const x = pz(d); if (!x) return `${d}: —`; const dif = x.Jreal ? (100 * ((x.Jhoja ?? 0) - x.Jreal)) / x.Jreal : 0; return `${d}: ${x.molde} · J ${fmt(x.Jhoja ?? NaN, 3)} (real ${fmt(x.Jreal ?? NaN, 3)}${Math.abs(dif) > 0.5 ? `, ${dif > 0 ? '+' : '−'}${fmt(Math.abs(dif), 0)} %` : ''})`; };
    const det = h('details', { class: 'grupo-muros' + (selGrupo === g ? ' sel' : '') });
    if (selGrupo === g) det.setAttribute('open', '');
    det.append(h('summary', {}, h('b', {}, g), ` · ${ms.length} muros · ${resumen('A')} · ${resumen('B')}`));
    const t = h('table', { class: 'tabla compacta' });
    t.append(h('thead', {}, h('tr', {}, ...['Muro', 'largo × esp.', 'papel en la hoja J'].map(x => h('th', {}, x)))));
    const tb = h('tbody');
    ms.forEach(m => {
      const selector = (d: 'A' | 'B') => {
        const paralelo = (d === 'A') === (m.dir === 'Y');
        const actual = (d === 'A' ? m.rolA : m.rolB) || '';
        const auto = asig?.papeles[m.id]?.[d] ?? '';
        const sel = h('select', { 'aria-label': `Papel de ${m.id} en el viento ${d}` }) as HTMLSelectElement;
        sel.append(h('option', { value: '' }, `auto (${auto})`), ...(paralelo ? ROLES_ALMA : ROLES_ALA).map(r => h('option', { value: r }, r)));
        sel.value = actual;
        sel.style.setProperty('--c', COLORES[auto] ?? 'transparent');
        sel.addEventListener('change', () => estado.cambiar(() => { const v = sel.value as RolMolde | ''; if (d === 'A') m.rolA = v; else m.rolB = v; }));
        return h('div', { class: 'papel-dir' }, h('span', { class: 'dir' }, d), h('span', { class: 'caja-papel', style: `background:${COLORES[auto] ?? '#fff'}` }), sel);
      };
      const tr = h('tr', { class: estado.seleccion === m.id ? 'sel' : '' }, h('td', {}, m.id), h('td', { class: 'n' }, `${fmt(m.largo)} × ${fmt(m.espesor)}`), h('td', {}, selector('A'), selector('B')));
      tr.addEventListener('click', ev => { if ((ev.target as HTMLElement).tagName !== 'SELECT') estado.elegir(m.id); });
      tb.append(tr);
    });
    t.append(tb);
    const acc = h('div', { class: 'fila-acciones' });
    const b = (txt: string, titulo: string, f: () => void) => { const x = h('button', { type: 'button', class: 'mini', title: titulo }, txt); x.addEventListener('click', () => estado.cambiar(f)); return x; };
    acc.append(
      b('Girar 90°', 'Gira el grupo alrededor de su baricentro (los papeles elegidos a mano se borran: un alma pasa a ser ala)', () => { p.muros = girarGrupo(p.muros, g); }),
      b('Espejar ↔', 'Espeja el grupo respecto de un eje vertical por su baricentro', () => { p.muros = espejarGrupo(p.muros, g, 'x'); }),
      b('Espejar ↕', 'Espeja el grupo respecto de un eje horizontal por su baricentro', () => { p.muros = espejarGrupo(p.muros, g, 'y'); }),
      b('Papeles automáticos', 'Vuelve a los papeles que propone la app en los dos vientos', () => { p.muros.forEach(m => { if (m.grupo === g) { m.rolA = ''; m.rolB = ''; } }); }),
      b('Desagrupar', 'Los muros quedan sueltos (en la misma pieza)', () => { p.muros = desagrupar(p.muros, g); }),
    );
    const avisosG = [...(pz('A')?.avisos ?? []).map(a => `A: ${a}`), ...(pz('B')?.avisos ?? []).map(a => `B: ${a}`)].filter(a => !a.includes('Nota: el alma'));
    det.append(h('div', { class: 'scroll' }, t), acc, ...avisosG.map(a => h('p', { class: a.includes('Nota:') ? 'nota chica' : 'aviso-linea' }, a)));
    sec.cuerpo.append(det);
  });
  c.append(sec.el);
  void armarPiezas;
}
function nuevoMuro(): Muro {
  const p = estado.proyecto;
  while (p.muros.some(m => m.id === `M${contador}`)) contador++;
  return { id: `M${contador}`, dir: 'Y', x: 0, y: 0, largo: 3, espesor: 0.2, llega: true, areaInf: 10, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '' };
}
export function panelMuros(c: H) {
  const p = estado.proyecto;
  const acc = h('div', { class: 'fila-acciones' });
  const nuevo = h('button', { type: 'button' }, 'Nuevo muro');
  nuevo.addEventListener('click', () => estado.cambiar(() => { const m = nuevoMuro(); m.piezaA = `T${contador}`; p.muros.push(m); estado.seleccion = m.id; }));
  const dup = h('button', { type: 'button' }, 'Duplicar');
  dup.addEventListener('click', () => estado.cambiar(() => {
    const s = p.muros.find(m => m.id === estado.seleccion); if (!s) return;
    const m = { ...nuevoMuro(), ...s, id: nuevoMuro().id, x: +(s.x + 1).toFixed(2) }; p.muros.push(m); estado.seleccion = m.id;
  }));
  const borrar = h('button', { type: 'button' }, 'Borrar filas elegidas');
  borrar.addEventListener('click', () => estado.cambiar(() => {
    const s = filasElegidas('muros');
    const ids = s ? p.muros.slice(s[0], s[1] + 1).map(m => m.id) : estado.seleccion ? [estado.seleccion] : [];
    p.muros = p.muros.filter(m => !ids.includes(m.id)); estado.seleccion = null;
  }));
  const imp = h('button', { type: 'button' }, 'Importar desde Excel…');
  imp.addEventListener('click', () => document.dispatchEvent(new CustomEvent('torre:importar')));
  const tab = h('button', { type: 'button' }, 'Descargar tabla (.xlsx)');
  tab.title = 'Niveles y muros del proyecto en un Excel: sirve de plantilla para llenar y volver a importar';
  tab.addEventListener('click', () => document.dispatchEvent(new CustomEvent('torre:tabla')));
  // agrupar: los muros de la pieza del muro elegido (o los que se tocan con él) pasan a ser un elemento
  const bAgr = h('button', { type: 'button', title: 'Hace un elemento con la pieza del muro elegido: se mueve, gira y espeja entera, y cada muro lleva el color de su columna en la hoja J' }, 'Agrupar pieza');
  bAgr.addEventListener('click', () => estado.cambiar(() => {
    const sel = p.muros.find(m => m.id === estado.seleccion);
    if (!sel) { avisoPanel('Elegí un muro de la pieza (en la planta o en la tabla) y después «Agrupar pieza».'); return; }
    let ids = sel.piezaA ? p.muros.filter(m => m.piezaA === sel.piezaA).map(m => m.id) : [sel.id];
    if (ids.length === 1) {               // sin pieza: los que se tocan con él (y los que se tocan con esos)
      const set = new Set([sel.id]); let cambio = true;
      while (cambio) { cambio = false; p.muros.forEach(m => { if (!set.has(m.id) && [...set].some(id => seTocan(p.muros.find(x => x.id === id)!, m))) { set.add(m.id); cambio = true; } }); }
      ids = [...set];
    }
    p.muros = agrupar(p.muros, ids).muros;
  }));
  acc.append(nuevo, dup, borrar, bAgr, imp, tab);
  c.append(acc);
  seccionGrupos(c);
  c.append(h('p', { class: 'nota' }, 'Una fila por elemento. Tipo: tabique (o columna rectangular), tubo rectangular (largo = lado en x, «Lado y», espesor de pared) o tubo circular (largo = diámetro, espesor de pared; macizo si el espesor es la mitad del diámetro). Dirección Y: paralelo al viento A; X: paralelo al viento B. Un ala dice en «Pegado a» el alma a la que se une. «Desde» y «Hasta»: niveles donde arranca y termina (vacío = de la fundación a la azotea); en el cálculo de PB entran los que llegan a la fundación. Se puede pegar una tabla copiada de Excel con las columnas en este orden.'));
  const numM = (titulo: string, clave: 'x' | 'y' | 'largo' | 'espesor' | 'areaInf', min = -Infinity): Columna<Muro> => ({
    titulo, clave, tipo: 'numero', leer: m => m[clave],
    escribir: (m, v) => { const x = aNumero(v); if (x === null || Number.isNaN(x) || x < min) return false; m[clave] = x; },
  });
  const txt = (titulo: string, clave: 'piezaA' | 'pegadoA' | 'piezaB' | 'pegadoB'): Columna<Muro> => ({ titulo, clave, leer: m => m[clave], escribir: (m, v) => { m[clave] = v.trim(); } });
  const iSel = p.muros.findIndex(m => m.id === estado.seleccion);
  if (iSel >= 0) elegirFila('muros', iSel);
  c.append(grilla<Muro>([
    { titulo: 'Muro', clave: 'id', leer: m => m.id, escribir: (m, v) => {
      const nuevoId = v.trim(); if (!nuevoId || (nuevoId !== m.id && p.muros.some(o => o.id === nuevoId))) return false;
      const viejo = m.id; m.id = nuevoId;
      p.muros.forEach(o => { if (o.pegadoA === viejo) o.pegadoA = nuevoId; if (o.pegadoB === viejo) o.pegadoB = nuevoId; });
      if (estado.seleccion === viejo) estado.seleccion = nuevoId;
    } },
    { titulo: 'Dir.', clave: 'dir', tipo: 'lista', opciones: ['Y', 'X'], leer: m => m.dir, escribir: (m, v) => { const d = v.trim().toUpperCase(); if (d !== 'X' && d !== 'Y') return false; m.dir = d; } },
    numM('x (m)', 'x'), numM('y (m)', 'y'), { ...numM('Largo', 'largo', 0.01), ayuda: 'tabique: largo · tubo rect.: lado en x · tubo circ.: diámetro exterior' },
    { ...numM('Esp.', 'espesor', 0.01), ayuda: 'tabique: espesor · tubos: espesor de pared (≥ la mitad del lado o del diámetro = macizo)' },
    { titulo: 'Llega', clave: 'llega', tipo: 'lista', opciones: ['sí', 'no'], ayuda: '¿Llega a la fundación?', leer: m => (m.llega ? 'sí' : 'no'),
      escribir: (m, v) => { const t = v.trim().toLowerCase(); if (['sí', 'si', 's', '1', 'true', 'x', ''].includes(t)) m.llega = true; else if (['no', 'n', '0', 'false'].includes(t)) m.llega = false; else return false; } },
    numM('Área inf. (m²)', 'areaInf', 0),
    txt('Pieza A', 'piezaA'), txt('Pegado a (A)', 'pegadoA'), txt('Pieza B', 'piezaB'), txt('Pegado a (B)', 'pegadoB'),
    { titulo: 'Tipo', clave: 'tipo', tipo: 'lista', opciones: ['tabique', 'tubo rect.', 'tubo circ.'], ayuda: 'tabique (o columna rectangular) · tubo rectangular · tubo circular',
      leer: m => ({ tabique: 'tabique', 'tubo-rect': 'tubo rect.', 'tubo-circ': 'tubo circ.' } as Record<TipoElemento, string>)[tipoDe(m)],
      escribir: (m, v) => {
        const t = v.trim().toLowerCase();
        const nuevo: TipoElemento | null = !t || t.startsWith('tab') || t.startsWith('col') ? 'tabique' : t.includes('rect') ? 'tubo-rect' : t.includes('circ') ? 'tubo-circ' : null;
        if (!nuevo) return false;
        if (nuevo === 'tubo-rect' && !m.ladoY) m.ladoY = m.largo;
        m.tipo = nuevo; delete m.circular;
      } },
    { titulo: 'Lado y', clave: 'ladoY', tipo: 'numero', ayuda: 'Solo tubo rectangular: lado en y', leer: m => (tipoDe(m) === 'tubo-rect' ? m.ladoY ?? m.largo : null),
      escribir: (m, v) => { const x = aNumero(v); if (x === null) { m.ladoY = null; return; } if (Number.isNaN(x) || x <= 0) return false; m.ladoY = x; } },
    { titulo: 'Desde', clave: 'zDesde', tipo: 'lista', opciones: ['', ...p.niveles.map(n => n.nombre)], ayuda: 'Nivel donde arranca (vacío = en la fundación)',
      leer: m => (m.zDesde == null ? '' : p.niveles.find(n => Math.abs(n.cota - m.zDesde!) < 1e-6)?.nombre ?? `${m.zDesde} m`),
      escribir: (m, v) => { const t = v.trim(); if (!t) { m.zDesde = null; return; } const n = p.niveles.find(x => x.nombre === t); const z = n ? n.cota : aNumero(t); if (z === null || Number.isNaN(z)) return false; m.zDesde = z; } },
    { titulo: 'Hasta', clave: 'zHasta', tipo: 'lista', opciones: ['', ...p.niveles.map(n => n.nombre)], ayuda: 'Nivel donde termina (vacío = en la azotea)',
      leer: m => (m.zHasta == null ? '' : p.niveles.find(n => Math.abs(n.cota - m.zHasta!) < 1e-6)?.nombre ?? `${m.zHasta} m`),
      escribir: (m, v) => { const t = v.trim(); if (!t) { m.zHasta = null; return; } const n = p.niveles.find(x => x.nombre === t); const z = n ? n.cota : aNumero(t); if (z === null || Number.isNaN(z)) return false; m.zHasta = z; } },
  ], { id: 'muros', filas: () => estado.proyecto.muros, nueva: nuevoMuro, alElegirFila: m => estado.elegir(m?.id ?? null) }));
  const pap = estado.calculo.asig?.papeles[estado.seleccion ?? ''];
  if (pap) c.append(h('p', { class: 'nota' }, `Muro ${estado.seleccion}: viento A «${pap.A}», viento B «${pap.B}». En la planta: arrastrar o flechas para moverlo (Mayús: de a 1 m).`));
}

// ------------------------------------------------------------------ Piezas
export function panelPiezas(c: H) {
  const { asig, res } = estado.calculo;
  if (!asig) return;
  c.append(h('p', { class: 'nota' }, 'Cada pieza se escribe en la hoja J de su dirección. Simétrica: el muro suelto o la doble T con alas iguales y centradas. Asimétrica: todo lo demás (C, U, L, T, E), un muro por columna: ala sup., alma izq., alma der. y ala inf. «N.º» es el número de pieza en la hoja (entre paréntesis, la fila del Excel).'));
  for (const dir of ['A', 'B'] as const) {
    c.append(h('h3', {}, dir === 'A' ? 'Viento A · J Tabiques paralelos' : 'Viento B · J Tabiques ortogonales'));
    const t = h('table', { class: 'tabla compacta' });
    t.append(h('thead', {}, h('tr', {}, ...['Pieza', 'Muros', 'Molde', 'N.º', 'J (m⁴)', 'Posición (m)'].map(x => h('th', {}, x)))));
    const tb = h('tbody');
    asig.piezas.filter(pz => pz.dir === dir).forEach(pz => {
      const J = pz.filaHoja === null ? NaN : (dir === 'A' ? res.jpar : res.jort).filas[pz.filaHoja].AY;
      const clave = `${dir}:${pz.nombre}`;
      const tr = h('tr', { tabindex: '0', class: estado.sub.perfil === clave ? 'sel' : '', title: 'Ver su perfil equivalente' }, ...[pz.nombre, pz.muros.join(' '), pz.molde, pz.filaHoja === null ? '—' : `${pz.filaHoja + 1} (${pz.filaHoja + 4})`, fmt(J, 3), fmt(pz.posicion)].map(x => h('td', {}, x)));
      const elegir = () => { estado.sub.perfil = clave; estado.avisarPanel(); };
      tr.addEventListener('click', elegir);
      tr.addEventListener('keydown', ev => { if (ev.key === 'Enter') elegir(); });
      tb.append(tr);
      pz.avisos.forEach(a => tb.append(h('tr', { class: 'aviso' }, h('td', { colspan: '6' }, a))));
    });
    t.append(tb);
    c.append(h('div', { class: 'scroll' }, t));
    c.append(h('p', { class: 'total' }, `ΣJ = ${fmt(dir === 'A' ? res.jpar.AY24 : res.jort.AY24, 3)} m⁴`));
  }
  const ley = h('div', { class: 'leyenda' });
  Object.entries(COLORES).forEach(([k, v]) => ley.append(h('span', {}, h('i', { style: `background:${v}` }), k)));
  c.append(ley);
  // perfil equivalente de la pieza elegida (o la primera)
  const elegida = asig.piezas.find(pz => `${pz.dir}:${pz.nombre}` === estado.sub.perfil) ?? asig.piezas.find(pz => pz.filaHoja !== null);
  if (elegida && elegida.filaHoja !== null) {
    const fila = (elegida.dir === 'A' ? asig.datos.jpar : asig.datos.jort)[elegida.filaHoja];
    const fr = (elegida.dir === 'A' ? res.jpar : res.jort).filas[elegida.filaHoja];
    const muros = elegida.muros.map(id => estado.proyecto.muros.find(m => m.id === id)).filter((m): m is Muro => !!m);
    c.append(seccion(`Perfil equivalente · ${elegida.nombre}`, dibujoPerfil(elegida, fila, fr, muros, 400, asig.papeles), h('p', { class: 'nota chica' }, 'Elegí una fila de las tablas para ver otra pieza. A la izquierda, los muros como están en la planta; a la derecha, el perfil que la app escribe en la hoja J. Tienen que tener el mismo largo de alma y las alas del mismo lado.')).el);
  }
}

// ------------------------------------------------------------------ Resultados
export function panelResultados(c: H, completo = true) {
  const { res, corr, controles } = estado.calculo;
  if (!res) return;
  const m = res.mnyq, g = corr.guia.mnyq;
  c.append(h('p', { class: 'nota' }, '«Planilla»: lo que calcula la planilla original, sin cambios. «Guía/CIRSOC»: con Kz mínimo de 5 m, sin viento en PB y con el momento de rotación en unidades correctas.'));
  const resumen = h('table', { class: 'tabla' });
  resumen.append(h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Planilla'), h('th', {}, 'Guía/CIRSOC'))));
  const tb = h('tbody');
  ([['W total (t)', m.H61, g.H61, 1], ['Mv en la fundación (tm)', m.J61, g.J61, 0], ['hW (m)', m.G66, g.G66, 2], ['P sin sobrecarga (t)', m.M61, g.M61, 0],
    ['Me / Mv', m.L99, g.L99, 2], ['e = Mv/P (m)', m.M99, g.M99, 2], ["b'/6 (m)", m.N99, g.N99, 2], ['σ máx. suelo (kg/cm²)', m.N89, g.N89, 2], ['σ mín. suelo (kg/cm²)', m.N90, g.N90, 2],
    ['ΣJ viento A (m⁴)', res.jpar.AY24, corr.guia.jpar.AY24, 3], ['d, eje de inercia A (m)', res.rotA.J7, corr.guia.rotA.J7, 3]] as [string, number, number, number][])
    .forEach(([k, a, b, d]) => tb.append(h('tr', {}, h('td', {}, k), h('td', { class: 'n' }, fmt(a, d)), h('td', { class: 'n' }, fmt(b, d)))));
  resumen.append(tb);
  c.append(seccion('Planilla y guía, lado a lado', h('div', { class: 'scroll' }, resumen)).el);
  if (!completo) return;
  c.append(h('h3', {}, 'Verificaciones'));
  const t = h('table', { class: 'tabla compacta' });
  t.append(h('thead', {}, h('tr', {}, ...['Control', 'Planilla', 'Guía/CIRSOC', 'Estado'].map(x => h('th', {}, x)))));
  const tb2 = h('tbody');
  let grupo = '';
  controles.forEach(k => {
    if (k.grupo !== grupo) { grupo = k.grupo; tb2.append(h('tr', { class: 'grupo' }, h('td', { colspan: '4' }, grupo))); }
    const tr = h('tr', {}, h('td', { title: `${k.criterio} · ${k.fuente}` }, k.nombre, h('small', {}, `${k.criterio} · ${k.fuente}`)),
      h('td', { class: 'n' }, fmt(k.planilla)), h('td', { class: 'n' }, fmt(k.guia)), h('td', { class: `estado ${k.estado.replace(' ', '-')}` }, k.estado));
    tb2.append(tr);
    if (k.nota) tb2.append(h('tr', { class: 'nota-fila' }, h('td', { colspan: '4' }, k.nota)));
  });
  t.append(tb2);
  c.append(h('div', { class: 'scroll' }, t));
  // rototraslación
  for (const dir of ['A', 'B'] as const) {
    const r = dir === 'A' ? res.rotA : res.rotB, cr = dir === 'A' ? corr.rotA : corr.rotB;
    c.append(h('h3', {}, `Rototraslación, viento ${dir} (nivel −1º, como la planilla)`));
    const tr = h('table', { class: 'tabla compacta' });
    tr.append(h('thead', {}, h('tr', {}, ...['Pieza', '% tras.', 'Q rot (t)', 'M planilla G+N (tm)', 'M corregido (tm)'].map(x => h('th', {}, x)))));
    const b = h('tbody');
    r.B.slice(0, 20).forEach((J, i) => {
      if (!(J > 1e-6)) return;
      const nombre = estado.calculo.asig?.piezas.find(pz => pz.dir === dir && pz.filaHoja === i)?.nombre ?? `fila ${i + 1}`;
      b.append(h('tr', {}, h('td', {}, nombre), h('td', { class: 'n' }, fmt(r.C[i] * 100, 1)), h('td', { class: 'n' }, fmt(r.N[i])), h('td', { class: 'n' }, fmt(r.O[i], 1)), h('td', { class: 'n' }, fmt(cr[i].Mtot, 1))));
    });
    tr.append(b);
    c.append(h('div', { class: 'scroll' }, tr));
  }
}

// ------------------------------------------------------------------ Avisos
/** Observaciones sobre la planilla virgen: valen para cualquier proyecto. */
export const NOTAS_PLANILLA = [
  'A las filas de las piezas 8 y 9 de «J Tabiques paralelos» les faltan las fórmulas del ala superior y del alma izquierda (pregunta abierta para la cátedra). La app usa primero las filas 10 y 11 para las piezas asimétricas.',
  'En «Flex comp PB paralelos», D13:D20 tienen 0,01 fijo, así que las piezas 10 a 17 no suman su peso propio (pregunta abierta para la cátedra).',
  'En las dos hojas J, el área de la pieza (columna O) no suma el ala inferior del molde asimétrico (AH · AI); la flexocompresión de la planilla usa esa área. La columna «Guía/CIRSOC» usa el área real (pregunta abierta para la cátedra).',
  'La planilla usa el peso descargado (Ng) para la compresión y el cargado (Nq) para la tracción. La columna «Guía/CIRSOC» toma el caso más desfavorable de cada una: Ng para la tracción y Nq para la compresión.',
];
/** avisos que piden revisar algo (el de los subsuelos fijos de la planilla es solo informativo) */
export const esInformativo = (a: string) => a.startsWith('La planilla tiene 3 subsuelos fijos') || /(^|: )Nota: /.test(a);
export const avisosQueCuentan = () => (estado.calculo.asig?.avisos ?? []).filter(a => !esInformativo(a));
export const cantidadAvisos = () => avisosQueCuentan().length;

export function panelAvisos(c: H) {
  const { asig, error } = estado.calculo;
  if (error) c.append(h('p', { class: 'error' }, `Error en el cálculo: ${error}`));
  const todos = asig?.avisos ?? [];
  const lista = (xs: string[], clase = 'avisos') => { const ul = h('ul', { class: clase }); xs.forEach(a => ul.append(h('li', {}, a.replace(/(^|: )Nota: /, '$1')))); return ul; };
  const cuentan = todos.filter(a => !esInformativo(a)), info = todos.filter(esInformativo);
  c.append(seccion('Para revisar en tu proyecto', cuentan.length ? lista(cuentan) : h('p', { class: 'nota' }, 'Nada para revisar.')).el);
  if (info.length) c.append(seccion('Notas sobre cómo se escribe en la planilla', lista(info, 'avisos nota')).el);
  c.append(seccion('De la planilla virgen (valen para todos los proyectos)', lista(NOTAS_PLANILLA, 'avisos nota')).el);
}

// ------------------------------------------------------------------ Ayuda
export function panelAyuda(c: H) {
  const pasos: [string, string][] = [
    ['Sitio', 'Nombre, alumno y datos del viento (CIRSOC 102). La exposición completa zg y α. El hormigón fija la resistencia característica σbk (H30 → 30 MPa = 300 kg/cm²), que la app usa como límite de compresión, igual que la guía.'],
    ['Niveles', 'Con «Generar» armás la torre: pisos, altura del piso tipo, altura de PB y subsuelos. La tabla funciona como Excel: escribí encima, arrastrá el cuadradito de la esquina para copiar o seguir una serie, Ctrl+C / Ctrl+V desde Excel. B y L van en la azotea y donde la planta cambia.'],
    ['Muros', 'El origen (0, 0) es el centro de la planta de PB. Dirección Y: paralelo al viento A; X: paralelo al viento B. Arrastrá los muros en la planta o movelos con las flechas (Mayús: de a 1 m).'],
    ['Piezas', 'Cada muro va en una sola pieza por dirección (pieza A y pieza B). Los muros paralelos al viento son almas; un muro perpendicular es ala si escribís a qué alma está pegado. Revisá en «Piezas» el molde y la J de cada una.'],
    ['Importar', 'Con «Abrir / importar…» o «Importar desde Excel…»: la tabla de la app (bajala con «Descargar tabla»), líneas exportadas de AutoCAD (x1, y1, x2, y2) o la planilla del curso ya llena.'],
    ['Resultados', '«Planilla» es lo que da el Excel original; «Guía/CIRSOC» son los valores corregidos. Cada control dice si verifica.'],
    ['Diagramas', 'Viento en altura, corte y momento, rototraslación en planta, flexocompresión muro por muro (como la guía, con la armadura por tracción), rigidez y deformada, y la verificación funicular (polígono de fuerzas, polo, rayos y funicular). Pasá el mouse por el gráfico para ver los valores.'],
    ['Elementos', 'En «Muros», la columna «Tipo»: tabique (o columna rectangular), tubo rectangular o tubo circular. «Desde» y «Hasta» dicen en qué niveles está cada muro; arriba de la planta elegís qué piso ver.'],
    ['Escribir planilla', 'Descarga la planilla del curso con tus datos. Excel o LibreOffice la recalculan al abrirla. La hoja «T3D» guarda el proyecto: con «Abrir…» la volvés a cargar.'],
  ];
  c.append(h('h3', {}, 'Cómo se usa'));
  const ol = h('ol', { class: 'avisos' });
  pasos.forEach(([t, d]) => ol.append(h('li', {}, h('b', {}, t + ': '), d)));
  c.append(ol);
  c.append(h('h3', {}, 'Atajos'));
  c.append(h('p', { class: 'nota' }, 'Ctrl+Z deshacer · Ctrl+Y (o Ctrl+Mayús+Z) rehacer · flechas: mover el muro elegido · Supr: borrar el muro elegido.'));
  c.append(h('h3', {}, 'Dónde quedan los datos'));
  c.append(h('p', { class: 'nota' }, 'El proyecto se guarda solo en este navegador. Para llevarlo a otra computadora usá «Guardar proyecto» (.json) o la planilla escrita (.xlsx). La app no manda datos a ningún servidor.'));
  c.append(h('h3', {}, 'Autoría y licencia'));
  const lic = h('a', { href: LICENCIA_URL, target: '_blank', rel: 'noopener license' }, LICENCIA_NOMBRE);
  c.append(h('p', { class: 'nota' }, `Torre 3D · © ${ANIO} ${AUTOR}. `, lic, vigente()
    ? `: hasta el ${HASTA} se puede usar, compartir y adaptar citando al autor, sin fines comerciales. Después de esa fecha queda con todos los derechos reservados, salvo que el autor la renueve.`
    : `: venció el ${HASTA}. La app queda con todos los derechos reservados; para seguir usándola, consultá al autor.`));
  c.append(h('p', { class: 'nota chica' }, 'Material de la cátedra (Electiva Edificios en Torre, FAUD-UNMDP): la planilla del curso, las guías, las clases y el CIRSOC 102 que toma como referencia conservan los derechos de sus autores y no están incluidos en esta licencia.'));
}

