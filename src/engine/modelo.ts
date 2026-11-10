/**
 * El proyecto tal como lo dibuja el alumno: datos del sitio, niveles y muros de la planta de PB.
 *
 * Ejes: origen en el cruce de los ejes de simetría de la planta de PB; x hacia la derecha, y hacia arriba.
 * El viento A llega por la cara mayor y sube en la planta (+y); el viento B va hacia +x.
 * Un muro de dirección «Y» es paralelo al viento A; uno «X», paralelo al viento B.
 */

export interface Sitio {
  V: number; Kd: number; I: number; zg: number; alfa: number; Kzt: number; G: number;
  Cpb: number; Cps: number; GCpi: number;
}

export interface Nivel {
  nombre: string;
  /** cota del NPT (m) */
  cota: number;
  /** medida de la planta perpendicular al viento A (m); vacío = igual a la del nivel de arriba */
  B?: number | null;
  /** medida de la planta paralela al viento A (m); vacío = igual a la del nivel de arriba */
  L?: number | null;
}

export interface Muro {
  id: string;
  dir: 'X' | 'Y';
  /** centro del muro (m) */
  x: number; y: number;
  largo: number; espesor: number;
  /** false: nace sobre un apeo o arranca más arriba; queda fuera del cálculo */
  llega: boolean;
  /** área de losa que carga el muro (m²) */
  areaInf: number;
  piezaA: string; pegadoA: string;
  piezaB: string; pegadoB: string;
  /** columna circular del contraviento: diámetro exterior e interior (0 = maciza) */
  circular?: { D: number; d: number } | null;
}

export interface Proyecto {
  version: 1;
  nombre: string;
  alumno: string;
  sitio: Sitio;
  niveles: Nivel[];
  /** b1: lado de la fundación paralelo al viento A · a1: perpendicular (M,NyQ N80 y N81) */
  fundacion: { b1: number; a1: number };
  /** hormigón de los tabiques: su número es la tensión admisible en MPa (H30 → 300 kg/cm²) */
  hormigon: string;
  muros: Muro[];
}

/** Ejemplo de la «Guía de predimensionado. Edificio en torre» 2024 (Neuquén, 20 pisos, planta 20 × 16 m). */
export function ejemploGuia(): Proyecto {
  const niveles: Nivel[] = [{ nombre: 'Azotea', cota: 64, B: 20, L: 16 }];
  for (let n = 20; n >= 1; n--) niveles.push({ nombre: `${n}º`, cota: 4 + 3 * (n - 1) });
  niveles.push({ nombre: 'PB', cota: 0 }, { nombre: '1º SS', cota: -4, B: 22, L: 18 }, { nombre: '2º SS', cota: -8 });
  const m = (id: string, dir: 'X' | 'Y', x: number, y: number, largo: number, areaInf: number, piezaA: string, pegadoA = '', piezaB = '', pegadoB = ''): Muro =>
    ({ id, dir, x, y, largo, espesor: 0.2, llega: true, areaInf, piezaA, pegadoA, piezaB, pegadoB });
  return {
    version: 1,
    nombre: 'Ejemplo de la guía 2024 (Neuquén)',
    alumno: '',
    sitio: { V: 48, Kd: 0.85, I: 1, zg: 457, alfa: 5, Kzt: 1, G: 0.85, Cpb: 0.8, Cps: -0.5, GCpi: 0.18 },
    niveles,
    fundacion: { b1: 18, a1: 22 },
    hormigon: 'H30',
    muros: [
      m('M1', 'Y', -9.9, 5.75, 4.5, 10.5, 'T1', '', 'T1B'), m('M2', 'Y', 9.9, 5.75, 4.5, 10.5, 'T2', '', 'T2B'),
      m('M3', 'Y', -9.9, -5.75, 4.5, 10.5, 'T3', '', 'T3B'), m('M4', 'Y', 9.9, -5.75, 4.5, 10.5, 'T4', '', 'T4B'),
      m('M5', 'Y', -6.4, 0, 3.6, 17.2, 'T5', '', 'T5B', 'M6'), m('M6', 'X', -4.0, 1.9, 5.0, 30.4, 'T5', 'M5', 'T5B'),
      m('M7', 'X', -4.0, -1.9, 5.0, 30.4, 'T5', 'M5', 'T5B'),
      m('M8', 'Y', 6.4, 0, 3.6, 17.2, 'T6', '', 'T6B', 'M9'), m('M9', 'X', 4.0, 1.9, 5.0, 30.4, 'T6', 'M8', 'T6B'),
      m('M10', 'X', 4.0, -1.9, 5.0, 30.4, 'T6', 'M8', 'T6B'),
    ],
  };
}

export function proyectoVacio(): Proyecto {
  const p = ejemploGuia();
  return { ...p, nombre: 'Proyecto nuevo', niveles: [{ nombre: 'Azotea', cota: 3, B: 20, L: 16 }, { nombre: 'PB', cota: 0 }], muros: [] };
}
