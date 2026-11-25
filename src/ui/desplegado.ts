/**
 * Alzado desplegado de la fachada: las caras planas de la piel una al lado de la otra, en verdadera magnitud, con sus
 * paños (vidrio y antepechos) y la lista de paños por forma. Tocar una cara la elige y abajo se ajusta: vidrio, opaca
 * (ciega) o abierta (sin cerramiento), y un módulo propio. Sirve para explicar la piel en clase y para medirla.
 */
import { estado } from './estado';
import { bandasFachada, calcularPaneleria, type AjusteCara, type Paneleria, type ResultadoPaneleria } from '../engine/carpinteria';

const NS = 'http://www.w3.org/2000/svg';
const el = (t: string, a: Record<string, string | number>, x?: string) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, String(a[k])); if (x !== undefined) e.textContent = x; return e; };
const f1 = (x: number) => x.toFixed(1).replace('.', ',');
const f2 = (x: number) => x.toFixed(2).replace('.', ',');

/** la forma de un paño desplegado: rectángulo (lados a plomo y a nivel), trapecio, triángulo u otra */
function formaPano(sz: { s: number; z: number }[]): 'rectángulo' | 'trapecio' | 'triángulo' | 'otra' {
  if (sz.length === 3) return 'triángulo';
  if (sz.length !== 4) return 'otra';
  const recto = sz.every((a, i) => { const b = sz[(i + 1) % 4]; return Math.abs(a.s - b.s) < 1e-4 || Math.abs(a.z - b.z) < 1e-4; });
  return recto ? 'rectángulo' : 'trapecio';
}

export function abrirDesplegado() {
  let sel: string | null = null;
  const d = document.createElement('dialog'); d.className = 'dialogo-desplegado';
  const cab = document.createElement('div'); cab.className = 'desp-cab';
  const tit = document.createElement('h2'); tit.textContent = 'Alzado desplegado de la fachada';
  const cerrar = document.createElement('button'); cerrar.type = 'button'; cerrar.textContent = 'Cerrar'; cerrar.addEventListener('click', () => fin());
  cab.append(tit, cerrar);
  const nota = document.createElement('p'); nota.className = 'nota-losa';
  const lienzo = document.createElement('div'); lienzo.className = 'desp-lienzo';
  const abajo = document.createElement('div'); abajo.className = 'desp-abajo';
  d.append(cab, nota, lienzo, abajo);
  let abierto = true;
  const fin = () => { abierto = false; d.close(); d.remove(); };
  d.addEventListener('cancel', ev => { ev.preventDefault(); fin(); });

  const ponerAjuste = (id: string, f: (a: AjusteCara) => void) => estado.cambiar(pp => {
    const pn: Paneleria = pp.paneleria ?? { modulo: 1.5, antepecho: 0.9, intermedios: 0 };
    const caras = [...(pn.caras ?? [])];
    let a = caras.find(c => c.id === id);
    if (!a) { a = { id }; caras.push(a); }
    f(a);
    const limpias = caras.filter(c => (c.tipo && c.tipo !== 'vidrio') || c.modulo);
    pp.paneleria = { ...pn, caras: limpias.length ? limpias : null };
  });

  function armar() {
    const p = estado.proyecto, pn: Paneleria = p.paneleria ?? { modulo: 1.5, antepecho: 0.9, intermedios: 0 };
    const r: ResultadoPaneleria = calcularPaneleria(bandasFachada(p), pn);
    const caras = r.carasInfo.filter(c => c.area > 0.5);
    lienzo.replaceChildren(); abajo.replaceChildren();
    if (!caras.length) {
      nota.textContent = 'No hay caras planas: el alzado desplegado necesita una carpintería «Plana» (por tramos, en la carta de Carpintería).';
      return;
    }
    nota.textContent = `${caras.length} caras planas en verdadera magnitud, en orden alrededor de la torre. Tocá una para elegirla y ajustarla.${pn.caras?.length ? ` ${pn.caras.length} con ajustes propios.` : ''}`;
    // dibujo: las caras una al lado de la otra, a la misma escala
    // verdadera magnitud: una cara inclinada mide más que su altura (la altura sobre el coseno de la inclinación)
    const kInc = (c: { inclinacion: number }) => 1 / Math.max(0.2, Math.cos((c.inclinacion * Math.PI) / 180));
    const zMin = Math.min(...caras.map(c => c.z0)), sep = 3;
    const zMax = zMin + Math.max(...caras.map(c => c.z0 - zMin + (c.z1 - c.z0) * kInc(c)));
    const anchoTot = caras.reduce((x, c) => x + c.ancho + sep, 0);
    const W = 1000, k = Math.min(W / anchoTot, 520 / Math.max(1, zMax - zMin)), H = (zMax - zMin) * k + 46;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'desp-svg', role: 'img', 'aria-label': 'Caras de la fachada desplegadas' }) as SVGSVGElement;
    let x0 = 4;
    caras.forEach(c => {
      const ki = kInc(c), X = (s: number) => x0 + s * k, Y = (z: number) => 8 + (zMax - (c.z0 + (z - c.z0) * ki)) * k;
      const g = el('g', { class: 'desp-cara' + (sel === c.id ? ' sel' : ''), 'data-cara': c.id, tabindex: 0 });
      g.append(el('title', {}, `${c.nombre}: mira a ${c.mira}${c.inclinacion ? `, inclinada ${c.inclinacion}°` : ''} · ${f1(c.ancho)} m de ancho`));
      r.paneles.filter(q => q.cara === c.id && q.sz).forEach(q => g.append(el('polygon', { points: q.sz!.map(v => `${X(v.s).toFixed(1)},${Y(v.z).toFixed(1)}`).join(' '), class: q.opaco ? 'desp-opaco' : 'desp-vidrio' })));
      c.bordes.forEach(b => g.append(el('polygon', { points: b.map(v => `${X(v.s).toFixed(1)},${Y(v.z).toFixed(1)}`).join(' '), class: 'desp-borde' })));
      const aj = pn.caras?.find(a => a.id === c.id);
      g.append(el('text', { x: X(0), y: H - 22, class: 'desp-nombre' }, c.nombre + (aj?.tipo === 'abierta' ? ' · abierta' : aj?.tipo === 'opaca' ? ' · opaca' : '') + (aj?.modulo ? ` · ${f2(aj.modulo)} m` : '')));
      g.append(el('text', { x: X(0), y: H - 8, class: 'desp-medida' }, `${f1(c.ancho)} m · ${c.mira}${c.inclinacion ? ` · ${c.inclinacion}°` : ''}`));
      g.addEventListener('click', () => { sel = sel === c.id ? null : c.id; armar(); });
      g.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); sel = sel === c.id ? null : c.id; armar(); } });
      svg.append(g);
      x0 += (c.ancho + sep) * k;
    });
    lienzo.append(svg);
    // la cara elegida: datos y ajustes
    const c = caras.find(x => x.id === sel);
    if (c) {
      const aj = pn.caras?.find(a => a.id === c.id), tipo = aj?.tipo ?? 'vidrio';
      const caja = document.createElement('div'); caja.className = 'desp-ajustes';
      const b = document.createElement('b'); b.textContent = `${c.nombre} · mira a ${c.mira}${c.inclinacion ? ` · inclinada ${c.inclinacion}°` : ''} · ${f1(c.ancho)} × ${f1(c.z1 - c.z0)} m · ${f1(c.area)} m²`;
      const sg = document.createElement('div'); sg.className = 'seg chico'; sg.setAttribute('role', 'group'); sg.setAttribute('aria-label', 'Cerramiento de la cara');
      ([['vidrio', 'Vidrio', 'Paños de vidrio con sus antepechos (lo de toda la panelería)'], ['opaca', 'Opaca', 'Cara ciega: todos los paños opacos (un núcleo, un muro de servicio)'], ['abierta', 'Abierta', 'Sin cerramiento: ni paños ni grilla (una loggia, una base abierta). El viento sigue tomando la carpintería de cada piso']] as const).forEach(([v, t, ti]) => {
        const x = document.createElement('button'); x.type = 'button'; x.textContent = t; x.title = ti; x.setAttribute('aria-pressed', String(tipo === v));
        x.addEventListener('click', () => ponerAjuste(c.id, a => { a.tipo = v === 'vidrio' ? null : v; }));
        sg.append(x);
      });
      const lm = document.createElement('label'); lm.className = 'campo-esq'; lm.title = 'Módulo propio de esta cara (vacío = el de toda la panelería)';
      const im = document.createElement('input'); im.type = 'text'; im.inputMode = 'decimal'; im.className = 'campo-vertice'; im.value = aj?.modulo ? String(aj.modulo).replace('.', ',') : ''; im.placeholder = String(pn.modulo).replace('.', ',');
      im.addEventListener('change', () => { const x = parseFloat(im.value.replace(',', '.')); ponerAjuste(c.id, a => { a.modulo = isFinite(x) && x >= 0.3 ? x : null; }); });
      lm.append('módulo ', im, ' m');
      const quitar = document.createElement('button'); quitar.type = 'button'; quitar.textContent = 'Sin ajustes'; quitar.disabled = !aj;
      quitar.addEventListener('click', () => ponerAjuste(c.id, a => { a.tipo = null; a.modulo = null; }));
      const pie = document.createElement('p'); pie.className = 'nota-losa'; pie.textContent = 'La cara se reconoce por su plano: si cambia la forma de la torre y la cara pasa a otro plano, el ajuste deja de aplicarse.';
      caja.append(b, sg, lm, quitar, pie);
      abajo.append(caja);
    }
    // lista de paños por forma (lo que se manda a fabricar)
    const filas = new Map<string, { n: number; area: number; tipico: Map<string, number> }>();
    r.paneles.filter(q => q.sz).forEach(q => {
      const fo = formaPano(q.sz!), clave = `${q.opaco ? 'Antepecho' : 'Vidrio'}|${fo}`;
      const f = filas.get(clave) ?? { n: 0, area: 0, tipico: new Map() };
      f.n++; f.area += q.area;
      if (fo === 'rectángulo') { const ss = q.sz!.map(v => v.s), zs = q.sz!.map(v => v.z); const m = `${f2(Math.max(...ss) - Math.min(...ss))} × ${f2(Math.max(...zs) - Math.min(...zs))} m`; f.tipico.set(m, (f.tipico.get(m) ?? 0) + 1); }
      filas.set(clave, f);
    });
    const tabla = document.createElement('table'); tabla.className = 'desp-tabla';
    const th = document.createElement('thead'), trh = document.createElement('tr');
    (['Paño', 'Forma', 'Cantidad', 'Área', 'Medida típica'] as const).forEach((t, i) => { const c = document.createElement('th'); c.textContent = t; if (i === 2 || i === 3) c.className = 'n'; trh.append(c); });
    th.append(trh); tabla.append(th);
    const tb = document.createElement('tbody');
    [...filas.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([clave, f]) => {
      const [tipo, fo] = clave.split('|'), tip = [...f.tipico.entries()].sort((a, b) => b[1] - a[1])[0];
      const tr = document.createElement('tr');
      [tipo, fo, String(f.n), `${f1(f.area)} m²`, tip ? `${tip[0]} (${tip[1]})` : 'varía'].forEach((t, i) => { const td = document.createElement('td'); td.textContent = t; if (i === 2 || i === 3) td.className = 'n'; tr.append(td); });
      tb.append(tr);
    });
    tabla.append(tb);
    abajo.append(tabla);
  }
  document.body.append(d);
  armar();
  d.showModal();
  estado.suscribir(() => { if (abierto) armar(); });   // estado no da de baja oyentes: cerrado, deja de dibujar
}
