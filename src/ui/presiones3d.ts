/**
 * Simulador de viento, etapa V1: las presiones del viento del método elegido pintadas sobre las fachadas de la torre
 * en el 3D (botón «p»), con la fuerza de cada nivel como flecha y los cuatro casos de carga del 102-25. Solo dibujo:
 * los números son los del método (src/viento/presiones.ts).
 */
import * as THREE from 'three';
import { estado, fmt } from './estado';
import { vientoCirsoc } from './cirsoc102';
import { puntosAlViento } from '../engine/silueta';
import { factoresCaso, ladosConNormal, mapaCirsoc, mapaPlanilla, presionCara, rolDeCara, type BandaViento, type Caso, type MapaPresiones } from '../viento/presiones';

const css = (v: string, def: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || def;

/** el mapa de presiones del método elegido (CIRSOC y FEM: 102-25; planilla, guía y combinado: 102-2005) */
export function mapaDelMetodo(): MapaPresiones | null {
  const p = estado.proyecto, c = estado.calculo, met = estado.config.metodo;
  try {
    if (met === 'cirsoc' || met === 'fem') return mapaCirsoc(p, vientoCirsoc());
    if (!c.asig || !c.valores) return null;
    return mapaPlanilla(p, c.valores, c.asig.filaNivel, met === 'guia' ? 'guía (CIRSOC 102-2005)' : 'planilla (CIRSOC 102-2005)');
  } catch { return null; }
}

const TEXTO_CASO: Record<Caso, string> = {
  1: 'Caso 1: el viento entero, solo',
  2: 'Caso 2: 75 %, corrido 0,15 B (torsión)',
  3: 'Caso 3: 75 % de los dos vientos a la vez',
  4: 'Caso 4: 56,3 % de los dos, con las dos torsiones',
};

/**
 * Las fachadas pintadas (una malla con color por cara y franja) y las flechas de la fuerza de cada nivel, en
 * coordenadas de three (x, z, −y). Devuelve también el texto de la leyenda.
 */
export function capaPresiones(): { objetos: THREE.Object3D[]; maxP: number; minP: number; escMax: number; escMin: number; mapa: MapaPresiones; caso: Caso; enCorte: { cota: number; nivel: string; lados: { p: number; rol: string }[] } | null; bandas: BandaViento[] } | null {
  const m = mapaDelMetodo();
  if (!m) return null;
  const p = estado.proyecto, dir = estado.dir;
  const caso: Caso = m.casos ? estado.capas.casoViento : 1;
  const vd = m[dir];
  if (!vd) return null;
  // caras: cada franja de cada viento activo usa la silueta de su nivel
  const caras: { a: { x: number; y: number }; b: { x: number; y: number }; z0: number; z1: number; p: number; p1: number; oculta: boolean }[] = [];
  // plano de corte: las fachadas de arriba no se dibujan y en la cota va el diagrama de presiones en planta
  const corte = estado.capas.corteViento, bCorte = corte === null ? null : vd.bandas.find(b => corte >= b.z0 - 1e-9 && corte <= b.z1 + 1e-9) ?? null;
  for (const banda of vd.bandas) {
    const oculta = !!bCorte && banda.z0 >= corte! - 1e-9;
    const iN = p.niveles.findIndex(n => n.nombre === banda.nivel && n.cota === banda.cota);
    if (iN < 0) continue;
    const pol = puntosAlViento(p, iN);
    if (pol.length < 3) continue;
    const zc = (banda.z0 + banda.z1) / 2;
    for (const l of ladosConNormal(pol)) caras.push({ a: { x: l.a.x + l.nx * 0.08, y: l.a.y + l.ny * 0.08 }, b: { x: l.b.x + l.nx * 0.08, y: l.b.y + l.ny * 0.08 }, z0: banda.z0, z1: banda.z1, p: presionCara(m, caso, dir, l.nx, l.ny, zc), p1: presionCara(m, 1, dir, l.nx, l.ny, zc), oculta });
  }
  if (!caras.length) return null;
  const maxP = Math.max(0, ...caras.map(c => c.p)), minP = Math.min(0, ...caras.map(c => c.p));
  // la escala de colores es la del caso 1: así los casos con 75 % y 56,3 % se ven más claros
  const esc = { max: Math.max(maxP, ...caras.map(c => c.p1)), min: Math.min(minP, ...caras.map(c => c.p1)) };
  const neutro = new THREE.Color(css('--tension-0', '#eceef0')), cPre = new THREE.Color(css('--compresion', '#378add')), cSuc = new THREE.Color(css('--traccion', '#e24b4a'));   // rojo tracción, azul compresión
  const pos: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  for (const f of caras) {
    if (f.oculta) continue;
    const t = f.p >= 0 ? (esc.max > 0 ? f.p / esc.max : 0) : (esc.min < 0 ? f.p / esc.min : 0);
    c.copy(neutro).lerp(f.p >= 0 ? cPre : cSuc, 0.15 + 0.85 * Math.min(1, t));
    const v = (q: { x: number; y: number }, z: number) => [q.x, z, -q.y];
    const A = v(f.a, f.z0), B = v(f.b, f.z0), C = v(f.b, f.z1), D = v(f.a, f.z1);
    pos.push(...A, ...B, ...C, ...A, ...C, ...D);
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const malla = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.82, roughness: 0.85, depthWrite: false }));
  const objetos: THREE.Object3D[] = [malla], objetosCorte: THREE.Object3D[] = [];
  // diagrama en planta en la cota del corte: una franja horizontal por cara, de ancho proporcional a |p|, hacia afuera;
  // flechas que empujan contra la cara (presión) o tiran de ella (succión)
  let enCorte: { cota: number; nivel: string; lados: { p: number; rol: string }[] } | null = null;
  if (bCorte) {
    const iN = p.niveles.findIndex(n => n.nombre === bCorte.nivel && n.cota === bCorte.cota);
    const pol = iN >= 0 ? puntosAlViento(p, iN) : [];
    const ext = pol.length ? Math.min(Math.max(...pol.map(q => q.x)) - Math.min(...pol.map(q => q.x)), Math.max(...pol.map(q => q.y)) - Math.min(...pol.map(q => q.y))) : 10;
    const k = (0.35 * ext) / Math.max(esc.max, -esc.min, 1e-9);
    const zc = corte!;
    const posC: number[] = [], colC: number[] = [];
    const lados: { p: number; rol: string }[] = [];
    for (const l of ladosConNormal(pol)) {
      const pr = presionCara(m, caso, dir, l.nx, l.ny, zc), d = k * Math.abs(pr);
      lados.push({ p: pr, rol: rolDeCara(l.nx, l.ny, dir) });
      if (d < 1e-6) continue;
      const t = pr >= 0 ? (esc.max > 0 ? pr / esc.max : 0) : (esc.min < 0 ? pr / esc.min : 0);
      c.copy(neutro).lerp(pr >= 0 ? cPre : cSuc, 0.15 + 0.85 * Math.min(1, t));
      const v = (x: number, y: number) => [x, zc + 0.05, -y];
      const A = v(l.a.x, l.a.y), B = v(l.b.x, l.b.y), C = v(l.b.x + l.nx * d, l.b.y + l.ny * d), D = v(l.a.x + l.nx * d, l.a.y + l.ny * d);
      posC.push(...A, ...B, ...C, ...A, ...C, ...D);
      for (let q = 0; q < 6; q++) colC.push(c.r, c.g, c.b);
      // flecha en el medio del lado (solo en los lados de más de un metro, para no llenar de flechas un arco)
      if (l.largo >= 1) {
        const mx = (l.a.x + l.b.x) / 2, my = (l.a.y + l.b.y) / 2;
        const haciaAdentro = new THREE.Vector3(-l.nx, 0, l.ny);
        const largoF = Math.max(0.6, d * 0.9);
        const origen = pr >= 0 ? new THREE.Vector3(mx + l.nx * (largoF + 0.15), zc + 0.3, -(my + l.ny * (largoF + 0.15))) : new THREE.Vector3(mx + l.nx * 0.15, zc + 0.3, -(my + l.ny * 0.15));
        const sentido = pr >= 0 ? haciaAdentro : haciaAdentro.clone().negate();
        objetosCorte.push(new THREE.ArrowHelper(sentido, origen, largoF, c.getHex(), Math.min(0.9, largoF * 0.4), Math.min(0.6, largoF * 0.3)));
      }
    }
    const gc = new THREE.BufferGeometry();
    gc.setAttribute('position', new THREE.Float32BufferAttribute(posC, 3));
    gc.setAttribute('color', new THREE.Float32BufferAttribute(colC, 3));
    objetosCorte.push(new THREE.Mesh(gc, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })));
    // el plano del corte, apenas marcado
    if (pol.length >= 3) {
      const anillo = [...pol, pol[0]].map(q => new THREE.Vector3(q.x, zc + 0.06, -q.y));
      objetosCorte.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints(anillo), new THREE.LineBasicMaterial({ color: new THREE.Color(css('--ink', '#223')) })));
    }
    enCorte = { cota: zc, nivel: bCorte.nivel, lados };
  }
  objetos.push(...objetosCorte);
  // flechas: la fuerza de cada nivel de cada viento activo, del lado de barlovento, corrida e·B si el caso tiene torsión
  const fc = factoresCaso(caso, dir);
  const Wmax = Math.max(1e-9, ...(['A', 'B'] as const).flatMap(d => (m[d]?.bandas ?? []).map(b => fc[d].f * b.W)));
  const colF = new THREE.Color(css('--carga', '#e07b00')).getHex();
  for (const d of ['A', 'B'] as const) {
    const vv = m[d];
    if (!vv || !(fc[d].f > 0)) continue;
    const e = fc[d].e * vv.B;
    for (const b of vv.bandas) {
      if (bCorte && b.z0 >= corte! - 1e-9) continue;
      const iN = p.niveles.findIndex(n => n.nombre === b.nivel && n.cota === b.cota);
      const pol = iN >= 0 ? puntosAlViento(p, iN) : [];
      if (!pol.length) continue;
      const largo = 2 + 9 * ((fc[d].f * b.W) / Wmax), zc = (b.z0 + b.z1) / 2;
      // barlovento: la cara de y mínima (viento A) o de x mínima (viento B); la flecha llega a ella
      const yMin = Math.min(...pol.map(q => q.y)), xMin = Math.min(...pol.map(q => q.x));
      const fin = d === 'A' ? new THREE.Vector3(e, zc, -yMin) : new THREE.Vector3(xMin, zc, e);
      const dirV = d === 'A' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(1, 0, 0);
      const origen = fin.clone().sub(dirV.clone().multiplyScalar(largo + 0.4));
      objetos.push(new THREE.ArrowHelper(dirV, origen, largo, colF, Math.min(1.6, largo * 0.35), Math.min(1, largo * 0.25)));
    }
  }
  return { objetos, maxP, minP, escMax: esc.max, escMin: esc.min, mapa: m, caso, enCorte, bandas: vd.bandas };
}

/** la leyenda (escala, fuente y, si el método los tiene, los cuatro casos para elegir) */
export function leyendaPresiones(caja: HTMLElement, r: NonNullable<ReturnType<typeof capaPresiones>>) {
  caja.replaceChildren();
  const b = document.createElement('b'); b.textContent = `Presión del viento · viento ${estado.dir}`; caja.append(b);
  const esc = document.createElement('div'); esc.className = 'escala';
  const s = (t: string) => { const x = document.createElement('span'); x.textContent = t; return x; };
  const i = (k: string) => { const x = document.createElement('i'); x.className = k; return x; };
  esc.append(s(fmt(r.escMin / 1000, 2)), i('s'), s('0'), i('p'), s(`+${fmt(r.escMax / 1000, 2)}`));
  caja.append(esc);
  esc.title = `kN/m², escala del caso 1 · en este caso, de ${fmt(r.minP / 1000, 2)} a +${fmt(r.maxP / 1000, 2)} · + empuja: comprime la fachada (azul) · − succiona: la tracciona (rojo) · ${r.mapa.fuente}${r.mapa.casos ? '' : ' · la planilla no tiene los casos de carga del 102-25'} · flechas: la fuerza de cada nivel`;
  const nota = document.createElement('small'); nota.textContent = `kN/m² · azul empuja · rojo succiona · ${r.mapa.fuente}`; caja.append(nota);
  // plano de corte en altura
  const sel = document.createElement('select'); sel.className = 'corte';
  sel.append(new Option('Sin corte', ''));
  r.bandas.forEach(b => sel.append(new Option(`Corte: ${b.nivel} (${fmt(b.cota, 1)} m)`, String(b.cota), false, estado.capas.corteViento !== null && Math.abs(estado.capas.corteViento - b.cota) < 1e-9)));
  sel.addEventListener('change', () => { estado.capas.corteViento = sel.value === '' ? null : Number(sel.value); estado.avisarPanel(); });
  caja.append(sel);
  if (r.enCorte) {
    const porRol = (rol: string) => { const xs = r.enCorte!.lados.filter(l => l.rol === rol).map(l => l.p); return xs.length ? fmt(xs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0) / 1000, 2) : '—'; };
    const t = document.createElement('small');
    t.textContent = `barl. ${porRol('barlovento')} · sota. ${porRol('sotavento')} · lat. ${porRol('lateral')} kN/m²`;
    t.title = `En ${r.enCorte.nivel} (viento ${estado.dir}${r.mapa.casos ? `, caso ${r.caso}` : ''}): las franjas del corte miden la presión de cada cara; las flechas empujan (presión) o tiran (succión).`;
    caja.append(t);
  }
  if (!r.mapa.casos) return;
  const fila = document.createElement('div'); fila.className = 'casos';
  ([1, 2, 3, 4] as Caso[]).forEach(k => {
    const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'mini'; bt.textContent = String(k); bt.title = TEXTO_CASO[k];
    bt.setAttribute('aria-pressed', String(r.caso === k));
    bt.addEventListener('click', () => { estado.capas.casoViento = k; estado.avisarPanel(); });
    fila.append(bt);
  });
  const t = document.createElement('small'); t.textContent = TEXTO_CASO[r.caso];
  fila.append(t);
  caja.append(fila);
}
