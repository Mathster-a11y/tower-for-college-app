/** Paneles laterales: formularios de datos, niveles, muros, piezas, resultados y avisos. */
import { estado, fmt, COLORES } from './estado';
import type { Muro, Nivel } from '../engine/modelo';
import { TENSION_ADM } from '../engine/verificaciones';
import { grilla, filasElegidas, elegirFila, aNumero, type Columna } from './grilla';
import { calcFunicular } from '../engine/funicular';
import { dibujoGuia, dibujoPresiones } from './funicular';

type H = HTMLElement;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...hijos: (Node | string)[]) => {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => (k === 'class' ? (e.className = v) : e.setAttribute(k, v)));
  hijos.forEach(c => e.append(c));
  return e;
};
const num = (v: string) => { const x = parseFloat(v.replace(',', '.')); return isFinite(x) ? x : null; };

function campo(etq: string, id: string, valor: string | number, onChange: (v: string) => void, opts: { tipo?: string; ayuda?: string; lista?: string[] } = {}) {
  const lab = h('label', { class: 'campo', for: id }, h('span', {}, etq));
  let inp: HTMLInputElement | HTMLSelectElement;
  if (opts.lista) {
    inp = h('select', { id });
    opts.lista.forEach(o => inp.append(h('option', { value: o }, o)));
    inp.value = String(valor);
  } else {
    inp = h('input', { id, type: opts.tipo ?? 'text', value: String(valor), inputmode: opts.tipo === 'number' ? 'decimal' : 'text' });
    if (opts.tipo === 'number') (inp as HTMLInputElement).step = 'any';
  }
  inp.addEventListener('change', () => onChange(inp.value));
  lab.append(inp);
  if (opts.ayuda) lab.append(h('small', {}, opts.ayuda));
  return lab;
}

// ------------------------------------------------------------------ Sitio
const EXPO: Record<string, [number, number]> = { A: [457, 5], B: [366, 7], C: [274, 9.5], D: [213, 11.5] };

function panelSitio(c: H) {
  const p = estado.proyecto, s = p.sitio;
  const set = (f: () => void) => estado.cambiar(f);
  const expo = Object.entries(EXPO).find(([, v]) => v[0] === s.zg && v[1] === s.alfa)?.[0] ?? '';
  c.append(
    h('h3', {}, 'Proyecto'),
    campo('Nombre', 's-nombre', p.nombre, v => set(() => (p.nombre = v))),
    campo('Alumno', 's-alumno', p.alumno, v => set(() => (p.alumno = v))),
    h('h3', {}, 'Viento (CIRSOC 102)'),
    h('div', { class: 'grilla2' },
      campo('V (m/s)', 's-V', s.V, v => set(() => (s.V = num(v) ?? s.V)), { tipo: 'number', ayuda: 'Fig. 1A o 1B' }),
      campo('Kd', 's-Kd', s.Kd, v => set(() => (s.Kd = num(v) ?? s.Kd)), { tipo: 'number', ayuda: 'Tabla 6' }),
      campo('I', 's-I', s.I, v => set(() => (s.I = num(v) ?? s.I)), { tipo: 'number', ayuda: 'Tabla 1' }),
      campo('Exposición', 's-expo', expo, v => set(() => { if (EXPO[v]) [s.zg, s.alfa] = EXPO[v]; }), { lista: ['', 'A', 'B', 'C', 'D'], ayuda: 'art. 5.6 (completa zg y α)' }),
      campo('zg (m)', 's-zg', s.zg, v => set(() => (s.zg = num(v) ?? s.zg)), { tipo: 'number' }),
      campo('α', 's-alfa', s.alfa, v => set(() => (s.alfa = num(v) ?? s.alfa)), { tipo: 'number' }),
      campo('Kzt', 's-Kzt', s.Kzt, v => set(() => (s.Kzt = num(v) ?? s.Kzt)), { tipo: 'number', ayuda: 'Fig. 2; 1 en llano' }),
      campo('G', 's-G', s.G, v => set(() => (s.G = num(v) ?? s.G)), { tipo: 'number', ayuda: '0,85 si F ≥ 1 Hz' }),
      campo('Cp barlovento', 's-Cpb', s.Cpb, v => set(() => (s.Cpb = num(v) ?? s.Cpb)), { tipo: 'number', ayuda: 'Fig. 3' }),
      campo('Cp sotavento', 's-Cps', s.Cps, v => set(() => (s.Cps = num(v) ?? s.Cps)), { tipo: 'number', ayuda: 'Fig. 3, según L/B' }),
      campo('GCpi', 's-GCpi', s.GCpi, v => set(() => (s.GCpi = num(v) ?? s.GCpi)), { tipo: 'number', ayuda: 'Tabla 7; no entra en el cálculo' }),
    ),
    h('h3', {}, 'Materiales y fundación'),
    h('div', { class: 'grilla2' },
      campo('Hormigón', 's-horm', p.hormigon, v => set(() => (p.hormigon = v)), { lista: ['H20', 'H25', 'H30', 'H35', 'H40', 'H45', 'H50'], ayuda: `admisible ${TENSION_ADM(p.hormigon)} kg/cm²` }),
      h('span', {}),
      campo("b1: fundación ∥ viento A (m)", 's-b1', p.fundacion.b1, v => set(() => (p.fundacion.b1 = num(v) ?? p.fundacion.b1)), { tipo: 'number', ayuda: 'M,NyQ N80' }),
      campo('a1: fundación ⟂ viento A (m)', 's-a1', p.fundacion.a1, v => set(() => (p.fundacion.a1 = num(v) ?? p.fundacion.a1)), { tipo: 'number', ayuda: 'M,NyQ N81' }),
    ),
  );
}

// ------------------------------------------------------------------ Niveles
function panelNiveles(c: H) {
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
}

// ------------------------------------------------------------------ Muros
let contador = 1;
function nuevoMuro(): Muro {
  const p = estado.proyecto;
  while (p.muros.some(m => m.id === `M${contador}`)) contador++;
  return { id: `M${contador}`, dir: 'Y', x: 0, y: 0, largo: 3, espesor: 0.2, llega: true, areaInf: 10, piezaA: '', pegadoA: '', piezaB: '', pegadoB: '' };
}
function panelMuros(c: H) {
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
  acc.append(nuevo, dup, borrar, imp, tab);
  c.append(acc);
  c.append(h('p', { class: 'nota' }, 'Una fila por muro. Se puede pegar una tabla copiada de Excel (con las columnas en este orden) o importarla con «Importar…». Dirección Y: paralelo al viento A; X: paralelo al viento B. Un ala dice en «Pegado a» el alma a la que se une. Columna circular: diámetro D (y d interior; vacío = tabique).'));
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
    numM('x (m)', 'x'), numM('y (m)', 'y'), numM('Largo', 'largo', 0.01), numM('Esp.', 'espesor', 0.01),
    { titulo: 'Llega', clave: 'llega', tipo: 'lista', opciones: ['sí', 'no'], ayuda: '¿Llega a la fundación?', leer: m => (m.llega ? 'sí' : 'no'),
      escribir: (m, v) => { const t = v.trim().toLowerCase(); if (['sí', 'si', 's', '1', 'true', 'x', ''].includes(t)) m.llega = true; else if (['no', 'n', '0', 'false'].includes(t)) m.llega = false; else return false; } },
    numM('Área inf. (m²)', 'areaInf', 0),
    txt('Pieza A', 'piezaA'), txt('Pegado a (A)', 'pegadoA'), txt('Pieza B', 'piezaB'), txt('Pegado a (B)', 'pegadoB'),
    { titulo: 'D col.', clave: 'D', tipo: 'numero', ayuda: 'Columna circular: diámetro exterior', leer: m => m.circular?.D ?? null,
      escribir: (m, v) => { const x = aNumero(v); if (x === null || x === 0) { m.circular = null; return; } if (Number.isNaN(x) || x < 0) return false; m.circular = { D: x, d: m.circular?.d ?? 0 }; } },
    { titulo: 'd int.', clave: 'd', tipo: 'numero', ayuda: 'Columna circular: diámetro interior (0 = maciza)', leer: m => m.circular?.d ?? null,
      escribir: (m, v) => { const x = aNumero(v) ?? 0; if (Number.isNaN(x) || x < 0) return false; if (m.circular) m.circular.d = x; } },
  ], { id: 'muros', filas: () => estado.proyecto.muros, nueva: nuevoMuro, alElegirFila: m => estado.elegir(m?.id ?? null) }));
  const pap = estado.calculo.asig?.papeles[estado.seleccion ?? ''];
  if (pap) c.append(h('p', { class: 'nota' }, `Muro ${estado.seleccion}: viento A «${pap.A}», viento B «${pap.B}». En la planta: arrastrar o flechas para moverlo (Mayús: de a 1 m).`));
}

// ------------------------------------------------------------------ Piezas
function panelPiezas(c: H) {
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
      tb.append(h('tr', {}, ...[pz.nombre, pz.muros.join(' '), pz.molde, pz.filaHoja === null ? '—' : `${pz.filaHoja + 1} (${pz.filaHoja + 4})`, fmt(J, 3), fmt(pz.posicion)].map(x => h('td', {}, x))));
      pz.avisos.forEach(a => tb.append(h('tr', { class: 'aviso' }, h('td', { colspan: '6' }, a))));
    });
    t.append(tb);
    c.append(h('div', { class: 'scroll' }, t));
    c.append(h('p', { class: 'total' }, `ΣJ = ${fmt(dir === 'A' ? res.jpar.AY24 : res.jort.AY24, 3)} m⁴`));
  }
  const ley = h('div', { class: 'leyenda' });
  Object.entries(COLORES).forEach(([k, v]) => ley.append(h('span', {}, h('i', { style: `background:${v}` }), k)));
  c.append(ley);
}

// ------------------------------------------------------------------ Resultados
function panelResultados(c: H) {
  const { res, corr, controles } = estado.calculo;
  if (!res) return;
  const m = res.mnyq, g = corr.guia.mnyq;
  c.append(h('p', { class: 'nota' }, '«Planilla»: lo que calcula la planilla original, sin cambios. «Guía/CIRSOC»: con Kz mínimo de 5 m, sin viento en PB y con el momento de rotación en unidades correctas.'));
  const resumen = h('table', { class: 'tabla' });
  resumen.append(h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Planilla'), h('th', {}, 'Guía/CIRSOC'))));
  const tb = h('tbody');
  ([['W total (t)', m.H61, g.H61, 1], ['Mv en la fundación (tm)', m.J61, g.J61, 0], ['hW (m)', m.G66, g.G66, 2], ['P sin sobrecarga (t)', m.M61, g.M61, 0],
    ['Me / Mv', m.L99, g.L99, 2], ['e = Mv/P (m)', m.M99, g.M99, 2], ["b'/6 (m)", m.N99, g.N99, 2], ['σ máx. suelo (kg/cm²)', m.N89, g.N89, 2], ['σ mín. suelo (kg/cm²)', m.N90, g.N90, 2],
    ['ΣJ viento A (m⁴)', res.jpar.AY24, res.jpar.AY24, 3], ['d, eje de inercia A (m)', res.rotA.J7, corr.guia.rotA.J7, 3]] as [string, number, number, number][])
    .forEach(([k, a, b, d]) => tb.append(h('tr', {}, h('td', {}, k), h('td', { class: 'n' }, fmt(a, d)), h('td', { class: 'n' }, fmt(b, d)))));
  resumen.append(tb);
  c.append(h('h3', {}, 'Resumen'), resumen);
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

// ------------------------------------------------------------------ Funicular
function panelFunicular(c: H) {
  const { asig, res, corr } = estado.calculo;
  if (!res) return;
  const dir = estado.dir;
  const p = estado.proyecto;
  const fg = calcFunicular(p, corr.guia.mnyq, asig.filaNivel, dir);
  const fp = calcFunicular(p, res.mnyq, asig.filaNivel, dir);
  const mn = corr.guia.mnyq;
  const perfil = p.niveles.map((n, j) => ({ z: n.cota, lado: dir === 'A' ? mn.F[asig.filaNivel[j]] : mn.E[asig.filaNivel[j]] })).filter(x => isFinite(x.lado));
  c.append(h('p', { class: 'nota' }, `Viento ${dir} (cambialo arriba). Como en la guía (2.2): se suman W y G y la recta de acción de la resultante tiene que cortar la base dentro del tercio medio. El dibujo usa los valores «Guía/CIRSOC».`));
  const ok = fg.verifica && fp.verifica;
  c.append(h('p', { class: `total estado ${ok ? 'verifica' : 'no-verifica'}` }, ok
    ? `Verifica: la resultante corta la base a ${fmt(fg.e)} m del eje; el tercio medio llega a ${fmt(fg.tercio)} m.`
    : `No verifica: la resultante corta la base a ${fmt(fg.e)} m del eje, fuera del tercio medio (${fmt(fg.tercio)} m).`));
  c.append(h('h3', {}, 'Suma gráfica de W y G'));
  c.append(h('div', { class: 'dibujo' }, dibujoGuia(fg, perfil)));
  const t = h('table', { class: 'tabla compacta' });
  t.append(h('thead', {}, h('tr', {}, ...['', 'Planilla', 'Guía/CIRSOC'].map(x => h('th', {}, x)))));
  const tb = h('tbody');
  ([['W, viento (t)', fp.W, fg.W, 1], ['hw sobre la base (m)', fp.hw, fg.hw, 2], ['G, peso sin sobrecarga (t)', fp.G, fg.G, 0], ['Mv = W · hw (tm)', fp.Mv, fg.Mv, 0],
    ['e = Mv / G (m)', fp.e, fg.e, 2], [`b/6 (b = ${fmt(fg.b, 1)} m)`, fp.tercio, fg.tercio, 2]] as [string, number, number, number][])
    .forEach(([k, a, b, d]) => tb.append(h('tr', {}, h('td', {}, k), h('td', { class: 'n' }, fmt(a, d)), h('td', { class: 'n' }, fmt(b, d)))));
  t.append(tb);
  c.append(h('div', { class: 'scroll' }, t));
  c.append(h('h3', {}, 'Línea de presiones piso a piso'));
  c.append(h('p', { class: 'nota' }, 'En cada nivel, la resultante de lo que está arriba (viento y peso acumulados) corta el nivel a e = M / N del eje. La banda es el núcleo central de la planta (lado paralelo al viento / 6). Es una referencia: la planta no es maciza, la resisten los tabiques.'));
  c.append(h('div', { class: 'dibujo' }, dibujoPresiones(fg)));
  const fuera = fg.puntos.filter(x => !x.dentro);
  c.append(h('p', { class: `nota ${fuera.length ? 'error' : ''}` }, fuera.length ? `Fuera del núcleo central: ${fuera.map(x => x.nivel).join(', ')}.` : 'Todos los niveles quedan dentro del núcleo central.'));
  const t2 = h('table', { class: 'tabla compacta' });
  t2.append(h('thead', {}, h('tr', {}, ...['Nivel', 'N (t)', 'M (tm)', 'e (m)', 'lado/6 (m)'].map(x => h('th', {}, x)))));
  const tb2 = h('tbody');
  fg.puntos.forEach(x => tb2.append(h('tr', { class: x.dentro ? '' : 'aviso' }, h('td', {}, x.nivel), h('td', { class: 'n' }, fmt(x.N, 0)), h('td', { class: 'n' }, fmt(x.M, 0)), h('td', { class: 'n' }, fmt(x.e)), h('td', { class: 'n' }, fmt(x.nucleo)))));
  t2.append(tb2);
  c.append(h('div', { class: 'scroll' }, t2));
}

// ------------------------------------------------------------------ Avisos
/** Observaciones sobre la planilla virgen: valen para cualquier proyecto. */
export const NOTAS_PLANILLA = [
  'A las filas de las piezas 8 y 9 de «J Tabiques paralelos» les faltan las fórmulas del ala superior y del alma izquierda (pregunta abierta para la cátedra). La app usa primero las filas 10 y 11 para las piezas asimétricas.',
  'En «Flex comp PB paralelos», D13:D20 tienen 0,01 fijo, así que las piezas 10 a 17 no suman su peso propio (pregunta abierta para la cátedra).',
  'En las dos hojas J, el área de la pieza (columna O) no suma el ala inferior del molde asimétrico (AH · AI); la flexocompresión de la planilla usa esa área. La columna «Guía/CIRSOC» usa el área real (pregunta abierta para la cátedra).',
  'La planilla usa el peso descargado (Ng) para la compresión y el cargado (Nq) para la tracción. La columna «Guía/CIRSOC» toma el caso más desfavorable de cada una: Ng para la tracción y Nq para la compresión.',
];
export const cantidadAvisos = () => estado.calculo.asig?.avisos.length ?? 0;

function panelAvisos(c: H) {
  const { asig, error } = estado.calculo;
  if (error) c.append(h('p', { class: 'error' }, `Error en el cálculo: ${error}`));
  c.append(h('h3', {}, 'De tu proyecto'));
  const avisos = asig?.avisos ?? [];
  if (avisos.length) {
    const lista = h('ul', { class: 'avisos' });
    avisos.forEach(a => lista.append(h('li', {}, a)));
    c.append(lista);
  } else c.append(h('p', { class: 'nota' }, 'Sin avisos.'));
  c.append(h('h3', {}, 'De la planilla virgen (valen para todos los proyectos)'));
  const notas = h('ul', { class: 'avisos nota' });
  NOTAS_PLANILLA.forEach(a => notas.append(h('li', {}, a)));
  c.append(notas);
}

// ------------------------------------------------------------------ Ayuda
function panelAyuda(c: H) {
  const pasos: [string, string][] = [
    ['Sitio', 'Nombre, alumno y datos del viento (CIRSOC 102). La exposición completa zg y α. El hormigón fija la tensión admisible: H30 → 30 MPa = 300 kg/cm².'],
    ['Niveles', 'Con «Generar» armás la torre: pisos, altura del piso tipo, altura de PB y subsuelos. B y L van en la azotea y donde la planta cambia.'],
    ['Muros', 'El origen (0, 0) es el centro de la planta de PB. Dirección Y: paralelo al viento A; X: paralelo al viento B. Arrastrá los muros en la planta o movelos con las flechas (Mayús: de a 1 m).'],
    ['Piezas', 'Cada muro va en una sola pieza por dirección (pieza A y pieza B). Los muros paralelos al viento son almas; un muro perpendicular es ala si escribís a qué alma está pegado. Revisá en «Piezas» el molde y la J de cada una.'],
    ['Resultados', '«Planilla» es lo que da el Excel original; «Guía/CIRSOC» son los valores corregidos. Cada control dice si verifica.'],
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
}

export const PANELES: Record<string, (c: H) => void> = {
  Sitio: panelSitio, Niveles: panelNiveles, Muros: panelMuros, Piezas: panelPiezas, Resultados: panelResultados, Funicular: panelFunicular, Avisos: panelAvisos, Ayuda: panelAyuda,
};
