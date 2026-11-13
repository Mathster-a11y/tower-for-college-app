/**
 * Diez torres variadas para probar la app de punta a punta: distintas plantas (rectangulares, cuadradas, en L, en T,
 * circulares), siluetas con arcos y carpinterías retiradas, retiros en altura, muros que terminan a media altura,
 * núcleos, columnas, pórticos, subsuelos, distintos vientos, exposiciones y hormigones.
 *
 * Se arman con las mismas herramientas que usa el alumno en la planta: piezas tipo (piezaTipo), agrupar y las
 * áreas de influencia calculadas sobre la losa (areasInfluencia). Así la prueba recorre el mismo camino que la app.
 */
import { agrupar } from './dibujo';
import { areasInfluencia } from './areas';
import { piezaTipo, type MedidasPieza, type TipoPieza } from './piezasTipo';
import type { Muro, Nivel, Proyecto, Sitio } from './modelo';

type Vert = { x: number; y: number; b?: number };
interface PiezaDef { tipo: TipoPieza; med: Partial<MedidasPieza> & { h: number; e: number }; x: number; y: number; zHasta?: number }
interface TorreDef {
  nombre: string;
  B: number; L: number;
  pisos: number; hPiso: number; hPB: number;
  subsuelos?: number;
  sitio?: Partial<Sitio>;
  hormigon?: string;
  piezas: PiezaDef[];
  /** retiros: desde el piso indicado (inclusive) hacia arriba la planta pasa a B × L */
  retiros?: { desde: number; B: number; L: number }[];
  silueta?: Vert[];
  carpinteria?: Vert[];
}

const SITIO: Sitio = { V: 48, Kd: 0.85, I: 1, zg: 457, alfa: 5, Kzt: 1, G: 0.85, Cpb: 0.8, Cps: -0.5, GCpi: 0.18 };
/** exposiciones del CIRSOC 102 (tabla 5): zg y α */
export const EXPOSICION = { A: { zg: 457, alfa: 5 }, B: { zg: 366, alfa: 7 }, C: { zg: 274, alfa: 9.5 } };

/** círculo de radio r con 4 arcos (bulge = tan(90°/4)) */
const circulo = (r: number): Vert[] => { const b = Math.tan(Math.PI / 8); return [{ x: r, y: 0, b }, { x: 0, y: r, b }, { x: -r, y: 0, b }, { x: 0, y: -r, b }]; };

export function armarTorre(d: TorreDef): Proyecto {
  const niveles: Nivel[] = [];
  const cota = (piso: number) => +(d.hPB + d.hPiso * (piso - 1)).toFixed(2);   // NPT del piso n (n ≥ 1)
  const planta = (piso: number) => [...(d.retiros ?? [])].sort((a, b) => b.desde - a.desde).find(r => piso >= r.desde) ?? { B: d.B, L: d.L };
  niveles.push({ nombre: 'Azotea', cota: cota(d.pisos + 1), B: planta(d.pisos).B, L: planta(d.pisos).L });
  for (let n = d.pisos; n >= 1; n--) {
    const pl = planta(n), arriba = planta(n + 1);
    niveles.push({ nombre: `${n}º`, cota: cota(n), ...(pl.B !== arriba.B || pl.L !== arriba.L ? { B: pl.B, L: pl.L } : {}) });
  }
  const pb = planta(1);
  niveles.push({ nombre: 'PB', cota: 0, ...(pb.B !== planta(2).B ? { B: pb.B, L: pb.L } : {}) });
  for (let k = 1; k <= (d.subsuelos ?? 1); k++) niveles.push({ nombre: `${k}º SS`, cota: -3.5 * k, ...(k === 1 ? { B: d.B + 2, L: d.L + 2 } : {}) });
  if (d.silueta) { niveles[0].silueta = d.silueta; niveles[niveles.length - 1 - (d.subsuelos ?? 1)].silueta = d.silueta; }
  if (d.carpinteria) niveles[0].carpinteria = d.carpinteria;
  let muros: Muro[] = [];
  const usados = new Set<string>();
  for (const pz of d.piezas) {
    const med: MedidasPieza = { b: pz.med.h / 2, giro: 0, ...pz.med } as MedidasPieza;
    const nuevos = piezaTipo(pz.tipo, med, pz.x, pz.y, usados).map(m => (pz.zHasta !== undefined ? { ...m, zHasta: pz.zHasta } : m));
    muros = agrupar([...muros, ...nuevos], nuevos.map(m => m.id)).muros;
  }
  const p: Proyecto = {
    version: 1, nombre: d.nombre, alumno: '',
    sitio: { ...SITIO, ...d.sitio },
    niveles, fundacion: { b1: d.L + 2, a1: d.B + 2 }, hormigon: d.hormigon ?? 'H30', muros,
  };
  // áreas de influencia de la losa de PB, como el botón «Copiar a los muros» de la herramienta Áreas
  const iPB = niveles.findIndex(n => n.cota === 0);
  const a = areasInfluencia(p, iPB);
  p.muros.forEach(m => { if (m.id in a.area) m.areaInf = +a.area[m.id].toFixed(2); });
  return p;
}

export const TORRES_PRUEBA: TorreDef[] = [
  { nombre: 'P1 · Oficinas 24 × 18, 22 pisos, tabiques y dos C', B: 24, L: 18, pisos: 22, hPiso: 3.2, hPB: 4.5,
    piezas: [
      { tipo: 'tabique', med: { h: 6, e: 0.3 }, x: -11.5, y: 5 }, { tipo: 'tabique', med: { h: 6, e: 0.3 }, x: 11.5, y: 5 },
      { tipo: 'tabique', med: { h: 6, e: 0.3 }, x: -11.5, y: -5 }, { tipo: 'tabique', med: { h: 6, e: 0.3 }, x: 11.5, y: -5 },
      { tipo: 'C', med: { h: 6, b: 4, e: 0.3 }, x: -4, y: 0 }, { tipo: 'C', med: { h: 6, b: 4, e: 0.3, espejo: true }, x: 4, y: 0 },
      { tipo: 'tabique', med: { h: 6, e: 0.3, giro: 90 }, x: -6, y: 8.5 }, { tipo: 'tabique', med: { h: 6, e: 0.3, giro: 90 }, x: 6, y: -8.5 },
    ] },
  { nombre: 'P2 · Esbelta 18 × 18, 32 pisos, núcleo y cuatro L', B: 18, L: 18, pisos: 32, hPiso: 3, hPB: 4, hormigon: 'H40',
    piezas: [
      { tipo: 'núcleo', med: { h: 8, b: 8, e: 0.4 }, x: 0, y: 0 },
      { tipo: 'L', med: { h: 5, b: 5, e: 0.35 }, x: -6.5, y: 6.5, }, { tipo: 'L', med: { h: 5, b: 5, e: 0.35, espejo: true }, x: 6.5, y: 6.5 },
      { tipo: 'L', med: { h: 5, b: 5, e: 0.35, giro: 180, espejo: true }, x: -6.5, y: -6.5 }, { tipo: 'L', med: { h: 5, b: 5, e: 0.35, giro: 180 }, x: 6.5, y: -6.5 },
    ] },
  { nombre: 'P3 · Placa ancha 40 × 12, 12 pisos', B: 40, L: 12, pisos: 12, hPiso: 3, hPB: 4, sitio: { ...EXPOSICION.B },
    piezas: [
      ...[-18, -9, 0, 9, 18].map(x => ({ tipo: 'tabique' as TipoPieza, med: { h: 6, e: 0.25 }, x, y: 0 })),
      { tipo: 'tabique', med: { h: 8, e: 0.25, giro: 90 }, x: -12, y: 5.5 }, { tipo: 'tabique', med: { h: 8, e: 0.25, giro: 90 }, x: 12, y: 5.5 },
      { tipo: 'tabique', med: { h: 8, e: 0.25, giro: 90 }, x: -12, y: -5.5 }, { tipo: 'tabique', med: { h: 8, e: 0.25, giro: 90 }, x: 12, y: -5.5 },
    ] },
  { nombre: 'P4 · Asimétrica: núcleo corrido hacia un lado', B: 26, L: 18, pisos: 20, hPiso: 3, hPB: 4,
    piezas: [
      { tipo: 'núcleo', med: { h: 7, b: 6, e: 0.3 }, x: 7, y: 0 },
      { tipo: 'tabique', med: { h: 6, e: 0.3 }, x: -12.5, y: 4 }, { tipo: 'tabique', med: { h: 6, e: 0.3 }, x: -12.5, y: -4 },
      { tipo: 'tabique', med: { h: 6, e: 0.3, giro: 90 }, x: -4, y: 8.5 }, { tipo: 'tabique', med: { h: 6, e: 0.3, giro: 90 }, x: -4, y: -8.5 },
      { tipo: 'tabique', med: { h: 5, e: 0.3 }, x: 12.5, y: 0 },
    ] },
  { nombre: 'P5 · Escalonada: retiros en los pisos 11 y 21, muros que terminan', B: 28, L: 20, pisos: 28, hPiso: 3, hPB: 4.5,
    retiros: [{ desde: 11, B: 22, L: 18 }, { desde: 21, B: 16, L: 14 }],
    piezas: [
      { tipo: 'núcleo', med: { h: 7, b: 7, e: 0.35 }, x: 0, y: 0 },
      { tipo: 'tabique', med: { h: 6, e: 0.3 }, x: -6.5, y: 0 }, { tipo: 'tabique', med: { h: 6, e: 0.3 }, x: 6.5, y: 0 },
      { tipo: 'T', med: { h: 6, b: 5, e: 0.3 }, x: -12.5, y: 0, zHasta: 34.5 }, { tipo: 'T', med: { h: 6, b: 5, e: 0.3 }, x: 12.5, y: 0, zHasta: 34.5 },
      { tipo: 'tabique', med: { h: 6, e: 0.3, giro: 90 }, x: 0, y: 8.5, zHasta: 64.5 }, { tipo: 'tabique', med: { h: 6, e: 0.3, giro: 90 }, x: 0, y: -8.5, zHasta: 64.5 },
    ] },
  { nombre: 'P6 · Redonda Ø 26 m: núcleo y columnas circulares', B: 26, L: 26, pisos: 24, hPiso: 3.1, hPB: 4.5,
    silueta: circulo(13), carpinteria: circulo(12.4),
    piezas: [
      { tipo: 'núcleo', med: { h: 9, b: 9, e: 0.4 }, x: 0, y: 0 },
      ...[0, 45, 90, 135, 180, 225, 270, 315].map(g => ({ tipo: 'columna' as TipoPieza, med: { h: 0.9, e: 0.45 }, x: +(10.5 * Math.cos((g * Math.PI) / 180)).toFixed(2), y: +(10.5 * Math.sin((g * Math.PI) / 180)).toFixed(2) })),
      { tipo: 'tabique', med: { h: 5, e: 0.3 }, x: -7, y: 0 }, { tipo: 'tabique', med: { h: 5, e: 0.3 }, x: 7, y: 0 },
      { tipo: 'tabique', med: { h: 5, e: 0.3, giro: 90 }, x: 0, y: 7 }, { tipo: 'tabique', med: { h: 5, e: 0.3, giro: 90 }, x: 0, y: -7 },
    ] },
  { nombre: 'P7 · Pórticos en la fachada y tabiques', B: 30, L: 16, pisos: 15, hPiso: 3, hPB: 4,
    piezas: [
      { tipo: 'pórtico', med: { h: 6, b: 0.6, e: 0.5 }, x: -14.5, y: 0 }, { tipo: 'pórtico', med: { h: 6, b: 0.6, e: 0.5 }, x: 14.5, y: 0 },
      { tipo: 'C', med: { h: 6, b: 3, e: 0.3 }, x: -5, y: 0 }, { tipo: 'C', med: { h: 6, b: 3, e: 0.3, espejo: true }, x: 5, y: 0 },
      { tipo: 'tabique', med: { h: 7, e: 0.3, giro: 90 }, x: -9, y: 7.5 }, { tipo: 'tabique', med: { h: 7, e: 0.3, giro: 90 }, x: 9, y: 7.5 },
      { tipo: 'tabique', med: { h: 7, e: 0.3, giro: 90 }, x: -9, y: -7.5 }, { tipo: 'tabique', med: { h: 7, e: 0.3, giro: 90 }, x: 9, y: -7.5 },
    ] },
  { nombre: 'P8 · Vientos fuertes (60 m/s, exposición C) y 3 subsuelos', B: 22, L: 22, pisos: 25, hPiso: 3.2, hPB: 4.5, subsuelos: 3, hormigon: 'H40',
    sitio: { V: 60, ...EXPOSICION.C },
    piezas: [
      { tipo: 'núcleo', med: { h: 8, b: 8, e: 0.45 }, x: 0, y: 0 },
      { tipo: 'doble T', med: { h: 7, b: 3, e: 0.35 }, x: -9, y: 0 }, { tipo: 'doble T', med: { h: 7, b: 3, e: 0.35 }, x: 9, y: 0 },
      { tipo: 'doble T', med: { h: 7, b: 3, e: 0.35, giro: 90 }, x: 0, y: 9 }, { tipo: 'doble T', med: { h: 7, b: 3, e: 0.35, giro: 90 }, x: 0, y: -9 },
    ] },
  { nombre: 'P9 · Planta en L con carpintería retirada', B: 30, L: 24, pisos: 18, hPiso: 3, hPB: 4,
    silueta: [{ x: -15, y: -12 }, { x: 15, y: -12 }, { x: 15, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 12 }, { x: -15, y: 12 }],
    carpinteria: [{ x: -14.4, y: -11.4 }, { x: 14.4, y: -11.4 }, { x: 14.4, y: -0.6 }, { x: -0.6, y: -0.6 }, { x: -0.6, y: 11.4 }, { x: -14.4, y: 11.4 }],
    piezas: [
      { tipo: 'núcleo', med: { h: 7, b: 6, e: 0.3 }, x: -7.5, y: -5 },
      { tipo: 'tabique', med: { h: 6, e: 0.3 }, x: -14.4, y: 6 }, { tipo: 'tabique', med: { h: 6, e: 0.3 }, x: -0.6, y: 6 },
      { tipo: 'tabique', med: { h: 6, e: 0.3 }, x: 14.4, y: -6 },
      { tipo: 'tabique', med: { h: 6, e: 0.3, giro: 90 }, x: 8, y: -11.4 }, { tipo: 'tabique', med: { h: 6, e: 0.3, giro: 90 }, x: 8, y: -0.6 },
      { tipo: 'tabique', med: { h: 6, e: 0.3, giro: 90 }, x: -8, y: 11.4 },
    ] },
  { nombre: 'P10 · Planta en T: U y doble T, H25', B: 32, L: 20, pisos: 16, hPiso: 3, hPB: 4, hormigon: 'H25', sitio: { V: 42 },
    silueta: [{ x: -16, y: 10 }, { x: -16, y: 2 }, { x: -5, y: 2 }, { x: -5, y: -10 }, { x: 5, y: -10 }, { x: 5, y: 2 }, { x: 16, y: 2 }, { x: 16, y: 10 }],
    piezas: [
      { tipo: 'U', med: { h: 6, b: 5, e: 0.3 }, x: 0, y: -6 },
      { tipo: 'doble T', med: { h: 7, b: 3, e: 0.3 }, x: -12, y: 6 }, { tipo: 'doble T', med: { h: 7, b: 3, e: 0.3 }, x: 12, y: 6 },
      { tipo: 'tabique', med: { h: 6, e: 0.3, giro: 90 }, x: -5, y: 9.7 }, { tipo: 'tabique', med: { h: 6, e: 0.3, giro: 90 }, x: 5, y: 9.7 },
      { tipo: 'tabique', med: { h: 5, e: 0.3 }, x: 0, y: 6 },
    ] },
];

export const torresPrueba = (): Proyecto[] => TORRES_PRUEBA.map(armarTorre);
