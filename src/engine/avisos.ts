/**
 * Avisos de diseño: lo que conviene revisar mientras se dibuja, dicho con las palabras del curso. No frenan el
 * cálculo; aparecen en la planta (chip «Avisos») y se pueden tocar para ir al nivel y al elemento.
 *
 *  - un tabique que sale de la losa, o que cae en un hueco de la losa;
 *  - la carpintería (la fachada) que sale de la losa;
 *  - la losa que no mide lo que la planilla usa para el viento (B × L);
 *  - un tabique que no forma pieza en ningún viento (no toma viento).
 *
 * Los niveles se agrupan: «del 3º al 12º» en vez de un aviso por piso.
 */
import { huecoEn, presenteEn, rectangulos, tipoDe, type Muro, type Proyecto } from './modelo';
import { cajaSilueta, carpinteriaDeNivel, plantaDeNivel, puntosSilueta, type Punto } from './silueta';

export type TipoAviso = 'fuera-losa' | 'sobre-hueco' | 'carpinteria-fuera' | 'bl-caja' | 'sin-pieza';
export interface AvisoDiseno {
  tipo: TipoAviso;
  /** texto para el usuario */
  texto: string;
  /** qué hacer */
  arreglo: string;
  /** el muro, si es de un muro (el primero, si son varios) */
  muro?: string;
  /** todos los muros del aviso (los que tienen el mismo problema en los mismos niveles van juntos) */
  muros?: string[];
  /** cotas de los niveles donde pasa (de arriba hacia abajo) */
  cotas: number[];
}

const TOL = 0.05;                                     // 5 cm: lo que se dibuja a ojo no cuenta como error

/** ¿el punto está adentro del polígono? (o a menos de TOL del borde) */
export function adentro(q: Punto, pol: Punto[], tol = TOL): boolean {
  let dentro = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const a = pol[i], b = pol[j];
    if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro || distanciaBorde(q, pol) <= tol;
}
/** distancia del punto al borde del polígono */
export function distanciaBorde(q: Punto, pol: Punto[]): number {
  let d = Infinity;
  for (let i = 0; i < pol.length; i++) {
    const a = pol[i], b = pol[(i + 1) % pol.length], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0;
    d = Math.min(d, Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy));
  }
  return d;
}
/** esquinas de los rectángulos que forman el muro en planta */
function esquinas(m: Muro): Punto[] {
  if (tipoDe(m) === 'tubo-circ') { const r = m.largo / 2; return Array.from({ length: 8 }, (_, k) => ({ x: m.x + r * Math.cos((k * Math.PI) / 4), y: m.y + r * Math.sin((k * Math.PI) / 4) })); }
  return rectangulos(m).flatMap(r => [{ x: r.x - r.ax / 2, y: r.y - r.ay / 2 }, { x: r.x + r.ax / 2, y: r.y - r.ay / 2 }, { x: r.x + r.ax / 2, y: r.y + r.ay / 2 }, { x: r.x - r.ax / 2, y: r.y + r.ay / 2 }]);
}

/** «PB», «el 12º» o «del 3º al 12º» */
export function rangoNiveles(p: Proyecto, cotas: number[]): string {
  const nom = (z: number) => p.niveles.find(n => Math.abs(n.cota - z) < 1e-6)?.nombre ?? `${z} m`;
  if (!cotas.length) return '';
  const s = [...cotas].sort((a, b) => a - b);
  return s.length === 1 ? `en ${nom(s[0])}` : `del ${nom(s[0])} al ${nom(s[s.length - 1])} (${s.length} niveles)`;
}

/**
 * @param papeles el papel de cada muro en cada viento (de aPlanilla); sin él no se revisa si forma pieza
 */
export function avisosDiseno(p: Proyecto, papeles?: Record<string, { A?: string; B?: string }>): AvisoDiseno[] {
  const out: AvisoDiseno[] = [];
  const zFund = p.niveles.length ? p.niveles[p.niveles.length - 1].cota : 0, zTop = p.niveles[0]?.cota ?? 0;
  // niveles de PB para arriba (las losas que se dibujan); de arriba hacia abajo como la lista de niveles
  const niveles = p.niveles.map((n, i) => ({ n, i })).filter(({ n }) => n.cota >= -1e-6);
  const fuera = new Map<string, { cotas: number[]; max: number }>(), enHueco = new Map<string, { cotas: number[]; hueco: string }>();
  const carp: { cotas: number[]; max: number } = { cotas: [], max: 0 };
  const bl = new Map<string, number[]>();
  niveles.forEach(({ n, i }) => {
    const pl = plantaDeNivel(p, i), pol = puntosSilueta(pl.silueta, 8);
    p.muros.forEach(m => {
      if (!presenteEn(m, n.cota, zFund, zTop)) return;
      const sale = esquinas(m).map(q => (adentro(q, pol) ? 0 : distanciaBorde(q, pol)));
      const max = Math.max(...sale);
      if (max > TOL) { const f = fuera.get(m.id) ?? { cotas: [], max: 0 }; f.cotas.push(n.cota); f.max = Math.max(f.max, max); fuera.set(m.id, f); }
      const h = (p.huecosLosa ?? []).find(hh => huecoEn(hh, n.cota) && hh.v.length >= 3 && adentro({ x: m.x, y: m.y }, hh.v, -TOL));
      if (h) { const f = enHueco.get(m.id) ?? { cotas: [], hueco: h.nombre || h.id }; f.cotas.push(n.cota); enHueco.set(m.id, f); }
    });
    // la carpintería (si la hay) no sale de la losa
    const c = carpinteriaDeNivel(p, i);
    if (c) {
      const max = Math.max(...puntosSilueta(c.v, 8).map(q => (adentro(q, pol) ? 0 : distanciaBorde(q, pol))));
      if (max > TOL) { carp.cotas.push(n.cota); carp.max = Math.max(carp.max, max); }
    }
    // la planilla toma el viento con B × L; si la losa propia de este nivel es otra, conviene igualarlas
    if (pl.propia) {
      const k = cajaSilueta(pl.silueta);
      if (Math.abs(k.B - pl.B) > Math.max(0.1, 0.02 * pl.B) || Math.abs(k.L - pl.L) > Math.max(0.1, 0.02 * pl.L)) {
        const clave = `${pl.B}×${pl.L}|${k.B.toFixed(2)}×${k.L.toFixed(2)}`;
        bl.set(clave, [...(bl.get(clave) ?? []), n.cota]);
      }
    }
  });
  const f2 = (x: number) => x.toFixed(2).replace('.', ',');
  // los muros con el mismo problema en los mismos niveles van en un solo aviso
  const juntar = <T extends { cotas: number[] }>(m: Map<string, T>, extra: (f: T) => string) => {
    const g = new Map<string, { ids: string[]; f: T }>();
    m.forEach((f, id) => { const k = `${[...f.cotas].sort().join(',')}|${extra(f)}`; const x = g.get(k); if (x) x.ids.push(id); else g.set(k, { ids: [id], f }); });
    return [...g.values()];
  };
  const lista = (ids: string[]) => (ids.length === 1 ? ids[0] : `${ids.slice(0, -1).join(', ')} y ${ids[ids.length - 1]}`);
  juntar(fuera, () => '').forEach(({ ids, f }) => {
    const max = Math.max(...ids.map(id => fuera.get(id)!.max));
    out.push({ tipo: 'fuera-losa', muro: ids[0], muros: ids, cotas: f.cotas, texto: `${lista(ids)} ${ids.length > 1 ? 'salen' : 'sale'} de la losa ${rangoNiveles(p, f.cotas)} (hasta ${f2(max)} m).`, arreglo: `${ids.length > 1 ? 'Corrrelos' : 'Correlo'} hacia adentro o agrandá la losa de esos niveles (botón «Losa»). Un tabique tiene que apoyar en la losa en todos los pisos.`.replace('Corrrelos', 'Corrélos') });
  });
  juntar(enHueco, f => f.hueco).forEach(({ ids, f }) => out.push({ tipo: 'sobre-hueco', muro: ids[0], muros: ids, cotas: f.cotas, texto: `${lista(ids)} ${ids.length > 1 ? 'caen' : 'cae'} en el hueco de losa «${f.hueco}» ${rangoNiveles(p, f.cotas)}.`, arreglo: 'Corré los muros o achicá el hueco (Calar → Losa): ahí no hay losa que los ate.' }));
  if (carp.cotas.length) out.push({ tipo: 'carpinteria-fuera', cotas: carp.cotas, texto: `La carpintería sale de la losa ${rangoNiveles(p, carp.cotas)} (hasta ${f2(carp.max)} m).`, arreglo: 'Usá «Carpintería que sigue a la losa» (botón «Losa» → Carpintería) o metela a mano: la fachada apoya en el borde de la losa.' });
  bl.forEach((cotas, clave) => {
    const [plan, caja] = clave.split('|');
    out.push({ tipo: 'bl-caja', cotas, texto: `La losa mide ${caja.replace('×', ' × ').replace(/\./g, ',')} m ${rangoNiveles(p, cotas)}, pero la planilla calcula el viento con B × L = ${plan.replace('×', ' × ').replace(/\./g, ',')} m.`, arreglo: 'Si la fachada es la losa, tocá «Usar la caja como B y L» en la carta de la losa (o hacé que las formas escriban B y L).' });
  });
  if (papeles) p.muros.forEach(m => {
    const pa = papeles[m.id];
    if (!pa || !m.llega) return;
    if ((pa.A ?? 'sin pieza') === 'sin pieza' && (pa.B ?? 'sin pieza') === 'sin pieza') out.push({ tipo: 'sin-pieza', muro: m.id, muros: [m.id], cotas: [], texto: `${m.id} no forma pieza en ningún viento: no toma viento.`, arreglo: 'Tocá «Armar» (los muros que se tocan forman una pieza) o asignale una pieza en Diseño → Muros.' });
  });
  return out;
}
