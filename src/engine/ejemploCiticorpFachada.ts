/**
 * Citicorp Center con su forma y su fachada, armado con las herramientas de diseño (sobre el modelo estructural de
 * ejemploCiticorp: niveles del plano, supercolumnas, núcleo y chevrones).
 *
 * La corona, leída del plano de elevación (las proporciones del dibujo, llevadas a la altura del plano: 278,6 m):
 *  - un cajón de unos 14,8 m sobre el piso 56, en todo el ancho (ahí va el amortiguador de 400 t);
 *  - arriba, el techo a 45° que mira al sur: arranca en el techo del cajón a una crujía angosta (5,9 m) del borde sur y
 *    sube hasta la azotea, donde queda una franja plana de unos 8 m del lado norte;
 *  - la estructura de la corona es un reticulado bajo la pendiente (cordón inclinado, montantes y diagonales) en las
 *    caras este y oeste; la cara norte sube hasta arriba y la sur termina en el cajón.
 *
 * La estructura va siempre adentro de la piel: la carpintería está en el borde de las losas y el exoesqueleto, 0,50 m
 * hacia adentro (en la obra, los chevrones van detrás del muro cortina).
 */
import { ejemploCiticorp, type Proyecto } from './modelo';
import type { BarraNueva } from './exo';
import { rectangulo } from './silueta';
import { aplicarCarpinteriaTramos, bandasFachada, calcularPaneleria } from './carpinteria';

export function ejemploCiticorpFachada(): Proyecto {
  const p = ejemploCiticorp();
  const lado = 47.85, m = lado / 2, sep = -0.5, S = m + sep;
  const z56 = p.niveles.find(n => n.nombre.startsWith('56º'))!.cota;       // 229,82 m: el último piso de oficinas
  const zTop = p.niveles[0].cota;                                           // 278,6 m
  const zBase = p.niveles.find(n => n.nombre.startsWith('8º–9º'))!.cota;   // 34,75 m: sobre las supercolumnas
  const zc = +(z56 + 14.8).toFixed(2);                                      // techo del cajón de la corona
  const ys = -m + 5.9;                                                      // arranque de la pendiente (una crujía del borde sur)
  const yTop = ys + (zTop - zc);                                            // donde la pendiente llega a la azotea
  p.nombre = 'Citicorp Center (Nueva York, 1977)';
  // abre con el método CIRSOC, como los ejemplos del exo: con los de la cátedra el exo es un estudio aparte y los
  // tabiques solos no alcanzan (ΣJ, la flecha de la ménsula y el P-Δ no verifican)
  p.calculo = { ...(p.calculo ?? {}), metodo: 'cirsoc' };

  // niveles: el techo del cajón de la corona es un nivel; para no pasar de los 49 de la planilla, el 11º y el 12º van
  // juntos (el 10º, techo del cajón de transición, queda: ahí arranca el primer módulo)
  const i11 = p.niveles.findIndex(n => n.nombre === '11º');
  p.niveles.splice(i11, 1);
  const n12 = p.niveles.find(n => n.nombre === '12º')!; n12.nombre = '11º–12º'; n12.pisos = 2;
  const z10 = p.niveles.find(n => n.nombre === '10º')!.cota, z12 = n12.cota;     // 42,88 y 51,00 m
  const z16 = p.niveles.find(n => n.nombre === '16º')!.cota;
  p.niveles.splice(1, 0, { nombre: 'Corona: techo del cajón (amortiguador de 400 t)', cota: zc, B: lado, L: lado });
  const corona = p.niveles[0];
  corona.nombre = 'Corona (techo a 45° hacia el sur)';
  // la losa de la azotea es la franja plana del norte (de la pendiente al borde)
  corona.silueta = [{ x: -m, y: +yTop.toFixed(3) }, { x: m, y: +yTop.toFixed(3) }, { x: m, y: m }, { x: -m, y: m }];
  corona.B = lado; corona.L = +(m - yTop).toFixed(2);
  const n56 = p.niveles.find(n => n.cota === z56)!; n56.B = lado; n56.L = lado;
  p.niveles[1].silueta = rectangulo(lado, lado);
  // el núcleo termina en el piso 56: la corona cuelga del exoesqueleto
  const nucleo = p.muros.find(x => x.id === 'N1'); if (nucleo) nucleo.zHasta = z56;

  // la piel: la plaza abierta; por piso (de losa a losa) hasta el techo del cajón; la corona, una envolvente con su
  // plano a 45° (las losas no se recortan: la envolvente es la que tiene la pendiente)
  p.carpinteriaTramos = [
    { desde: 0, modo: 'sin' },
    { desde: zBase, modo: 'losa', retiro: 0, forma: 'plana' },
    { desde: zc, modo: 'continua', retiro: 0, forma: 'plana' },
  ];
  p.envolvente = {
    planta: rectangulo(lado, lado), perfil: { puntos: [{ h: 0, fx: 1 }, { h: 1, fx: 1 }] },
    planos: [{ id: 'P1', eje: 'y', a: { w: +ys.toFixed(3), z: zc }, b: { w: +(ys + 40).toFixed(3), z: +(zc + 40).toFixed(2) }, saca: 'arriba' }],
  };
  delete p.planosCorte;
  p.paneleria = { modulo: 3.66, antepecho: 2.0, intermedios: 0 };
  // la cara inclinada de la corona, opaca: se busca su plano con la piel ya armada
  const q: Proyecto = structuredClone(p);
  aplicarCarpinteriaTramos(q);
  const inc = calcularPaneleria(bandasFachada(q), q.paneleria!).carasInfo.filter(c => c.inclinacion >= 30 && c.inclinacion <= 60);
  if (inc.length) p.paneleria.caras = inc.map(c => ({ id: c.id, tipo: 'opaca' as const }));

  // ------------------------------------------------ exoesqueleto: 0,50 m adentro de la piel y la corona por barras
  const exo = p.exo!;
  exo.separacion = sep;
  // las losas apoyan en el exo (las del Citicorp estructural: una franja de 6,4 m junto a cada fachada, 0,45 t/m² de
  // peso y 0,25 t/m² de sobrecarga): el exo lleva la mitad de cada losa, además del viento
  exo.losas = { franja: 6.4, qD: 0.45, qL: 0.25 };
  // los chevrones hasta el piso 56; arriba, la corona dibujada barra por barra (zona libre)
  // debajo del cajón de transición no hay esquinas ni diagonales: la plaza queda libre y solo baja la supercolumna de
  // cada cara (a media cara); los chevrones van del cajón al piso 56 y la corona, arriba, barra por barra
  exo.zonas = [{ desde: 0, tipo: 'L' }, { desde: z16, tipo: 'E' }, { desde: z56, tipo: 'L' }];
  const r3 = (x: number) => +x.toFixed(3);
  const nb: BarraNueva[] = [];
  const barra = (clase: BarraNueva['clase'], a: [number, number], b: [number, number], extra: Partial<BarraNueva> = {}) => nb.push({ clase, a: [r3(a[0]), r3(a[1])], b: [r3(b[0]), r3(b[1])], ...extra });
  // ---- la llegada al suelo (plano de elevación), en las cuatro caras:
  //  · la supercolumna reticulada (24 ft = 7,30 m de ancho): dos cordones y diagonales en zigzag, de PB al cajón;
  //  · el cajón de transición (pisos 8 y 9, de 34,75 a 42,88 m) en todo el ancho: diagonales desde las esquinas de
  //    abajo y un zigzag que lleva la carga al centro, sobre la supercolumna;
  //  · el primer módulo, de 6 pisos (10 → 16): diagonales de las esquinas de arriba a los cuartos de abajo, columnas en
  //    las esquinas, los cuartos y el mástil, y una viga a la altura del piso 12
  const w = 3.65, panel = 10;
  const cordonSC = { b: 1.4, e: 0.17 }, celosia = { b: 0.6, e: 0.03 };    // equivalentes (supuesto)
  const zk = (k: number) => (zBase * k) / panel;
  // celosía en triángulos con el vértice hacia arriba (^): de los dos cordones al medio del tirante de arriba
  for (let k = 0; k < panel; k++) {
    barra('columna', [-w, zk(k)], [-w, zk(k + 1)], { sec: cordonSC }); barra('columna', [w, zk(k)], [w, zk(k + 1)], { sec: cordonSC });
    barra('diagonal', [-w, zk(k)], [0, zk(k + 1)], { sec: celosia }); barra('diagonal', [w, zk(k)], [0, zk(k + 1)], { sec: celosia });
    if (k + 1 < panel) { barra('viga', [-w, zk(k + 1)], [0, zk(k + 1)], { sec: celosia }); barra('viga', [0, zk(k + 1)], [w, zk(k + 1)], { sec: celosia }); }
  }
  // las supercolumnas de las caras perpendiculares trabajan como alas de esta cara (en sus bordes, media sección): de PB
  // al cajón la supercolumna; arriba, su mástil
  const supercol = { b: 7.3, e: 0.08 };   // con las losas apoyadas en el exo (ver la nota de la llegada al suelo)
  exo.mastilBase = { hasta: zBase, sec: supercol };
  const mastil = exo.mastil ?? exo.columna;
  barra('columna', [-S, 0], [-S, zBase], { sec: supercol, ala: true }); barra('columna', [S, 0], [S, zBase], { sec: supercol, ala: true });
  const pisosAla = p.niveles.map(n => n.cota).filter(z => z >= zBase - 1e-6 && z <= p.niveles.find(n => n.nombre === '16º')!.cota + 1e-6).sort((a, b) => a - b);
  pisosAla.forEach((z, k) => { if (k) { barra('columna', [-S, pisosAla[k - 1]], [-S, z], { sec: mastil, ala: true }); barra('columna', [S, pisosAla[k - 1]], [S, z], { sec: mastil, ala: true }); } });
  // el cajón de transición
  const abajo = [-S, -0.4 * S, -w, 0, w, 0.4 * S, S], arriba = [-S, -S / 2, -S / 4, 0, S / 4, S / 2, S];
  abajo.forEach((x, k) => { if (k) barra('viga', [abajo[k - 1], zBase], [x, zBase]); });
  arriba.forEach((x, k) => { if (k) barra('viga', [arriba[k - 1], z10], [x, z10]); });
  barra('columna', [-S, zBase], [-S, z10]); barra('columna', [S, zBase], [S, z10]);         // el mástil no baja al cajón: termina en su techo
  for (const sg of [-1, 1]) {
    barra('diagonal', [sg * S, zBase], [sg * S / 2, z10]);
    barra('diagonal', [sg * S / 2, z10], [sg * 0.4 * S, zBase]); barra('diagonal', [sg * 0.4 * S, zBase], [sg * S / 4, z10]);
    // la V del centro lleva el mástil a los cordones de la supercolumna: sección de transferencia (supuesta, como el cordón)
    barra('diagonal', [sg * S / 4, z10], [sg * w, zBase]); barra('diagonal', [sg * w, zBase], [0, z10], { sec: { b: 1.4, e: 0.08 } });
  }
  // el primer módulo (6 pisos)
  // columnas de piso a piso (cada losa del módulo se apoya en sus nudos)
  const pisos1 = p.niveles.map(n => n.cota).filter(z => z >= z10 - 1e-6 && z <= z16 + 1e-6).sort((a, b) => a - b);
  pisos1.forEach((z, k) => {
    if (!k) return;
    const z0 = pisos1[k - 1];
    for (const x of [-S / 2, S / 2]) barra('columna', [x, z0], [x, z]);
    // las esquinas terminan un piso antes del nudo de arriba: cada chevron se une al de arriba solo por el mástil
    if (k < pisos1.length - 1) for (const x of [-S, S]) barra('columna', [x, z0], [x, z]);
    barra('columna', [0, z0], [0, z], { sec: mastil });
  });
  // la diagonal: una recta de la esquina de arriba al cuarto de la mitad sobre el cajón, que corta la columna del cuarto
  // a la altura del piso 12 (ahí la viga de cuarto a cuarto)
  for (const sg of [-1, 1]) { barra('diagonal', [sg * S, z16], [sg * S / 2, z12]); barra('diagonal', [sg * S / 2, z12], [sg * S / 4, z10]); }
  [-S / 2, 0, S / 2].forEach((x, k, xs) => { if (k) barra('viga', [xs[k - 1], z12], [x, z12]); });
  [-S, -S / 2, 0, S / 2, S].forEach((x, k, xs) => { if (k) barra('viga', [xs[k - 1], z16], [x, z16]); });
  // las columnas de los cuartos siguen de corrido del 16º al 20º (la ficha E las arranca a medio módulo, en el 20º).
  // La ficha pone su cuarto a la altura relativa del 20º en el módulo (no justo a S/2: los pisos no son todos iguales,
  // unos 3 mm de diferencia): el tramo va del nudo del 16º al de la ficha en el 20º, así quedan unidas (sin redondear
  // al milímetro, que es como se pegan a los nudos de la ficha)
  const z20 = p.niveles.find(n => n.nombre.startsWith('20º'))!.cota, z24 = p.niveles.find(n => n.nombre.startsWith('24º'))!.cota;
  const s16 = r3(S / 2), sq = (S * (z20 - z16)) / (z24 - z16), sEn = (z: number) => (z <= z16 + 1e-6 ? s16 : z >= z20 - 1e-6 ? sq : s16 + ((sq - s16) * (z - z16)) / (z20 - z16));
  const pisos2 = p.niveles.map(n => n.cota).filter(z => z >= z16 - 1e-6 && z <= z20 + 1e-6).sort((a, b) => a - b);
  pisos2.forEach((z, k) => { if (k) for (const sg of [-1, 1]) nb.push({ clase: 'columna', a: [sg * sEn(pisos2[k - 1]), pisos2[k - 1]], b: [sg * sEn(z), z] }); });
  const cols = [-S, -S / 2, 0, S / 2, S];                                  // los nudos del tope del último módulo
  // el cajón (z56 → zc), en las cuatro caras: columnas y la viga del techo
  cols.forEach(s => barra('columna', [s, z56], [s, zc]));
  // caras este y oeste (viento A; s corre de sur a norte): el reticulado bajo la pendiente
  const ych = (z: number) => ys + 0.7 + (z - zc);                         // cordón 0,70 m adentro de la pendiente (0,5 m en perpendicular)
  const s0 = ych(zc), zPost = (s: number) => zc + (s - s0);
  const A: Partial<BarraNueva> = { dir: 'A' };
  [-S, s0, -S / 2, 0, S / 2, S].forEach((s, k, xs) => { if (k) barra('viga', [xs[k - 1], zc], [s, zc], A); });
  const z2 = zPost(0);                                                      // un tirante a la altura donde el cordón cruza el medio
  const cordon: [number, number][] = [[s0, zc], [-S / 2, zPost(-S / 2)], [0, z2], [S / 2, zPost(S / 2)], [ych(zTop), zTop]];
  cordon.forEach((q, k) => { if (k) barra('diagonal', cordon[k - 1], q, A); });
  barra('columna', [-S / 2, zc], [-S / 2, zPost(-S / 2)], A);
  barra('columna', [0, zc], [0, z2], A);
  barra('columna', [S / 2, zc], [S / 2, z2], A); barra('columna', [S / 2, z2], [S / 2, zPost(S / 2)], A);
  barra('columna', [S, zc], [S, z2], A); barra('columna', [S, z2], [S, zTop], A);
  barra('viga', [0, z2], [S / 2, z2], A); barra('viga', [S / 2, z2], [S, z2], A);
  barra('viga', [ych(zTop), zTop], [S, zTop], A);
  barra('diagonal', [-S / 2, zPost(-S / 2)], [0, zc], A);
  barra('diagonal', [0, z2], [S / 2, zc], A);
  barra('diagonal', [S / 2, zPost(S / 2)], [S, z2], A);
  // caras norte y sur (viento B; s corre de oeste a este): la viga del techo del cajón; la norte sube hasta la azotea
  // con columnas y una V invertida; la sur termina en el cajón (arriba, la pendiente queda atrás)
  cols.forEach((s, k) => { if (k) barra('viga', [cols[k - 1], zc], [s, zc], { dir: 'B' }); });
  const N: Partial<BarraNueva> = { dir: 'B', lado: 1 };
  [-S, 0, S].forEach(s => barra('columna', [s, zc], [s, zTop], N));
  barra('viga', [-S, zTop], [0, zTop], N); barra('viga', [0, zTop], [S, zTop], N);
  barra('diagonal', [-S, zc], [0, zTop], N); barra('diagonal', [S, zc], [0, zTop], N);
  exo.nuevas = nb;

  exo.notas = [
    ...(exo.notas ?? []),
    'Corona leída del plano de elevación: un cajón de 14,8 m sobre el piso 56 en todo el ancho (con el amortiguador de 400 t) y, arriba, el techo a 45° hacia el sur (Wikipedia: girado al sur para colectores solares) que arranca a una crujía (5,9 m) del borde sur y llega a la azotea dejando una franja plana de unos 8 m al norte. Las medidas salen de las proporciones del dibujo, llevadas a 278,6 m de altura total (supuesto).',
    'Niveles: el techo del cajón de la corona es un nivel (244,62 m); para no pasar de los 49 niveles de la planilla, el 11º y el 12º van juntos. El 10º (42,88 m) es el techo del cajón de transición.',
    'Piel: sin carpintería en la plaza; «Por piso» plana del cajón de transición (34,75 m) al techo del cajón de la corona, en el borde de las losas; la corona es una «Envolvente» con su propio plano a 45° (las losas no se recortan). La losa de la azotea es la franja plana del norte.',
    'Estructura siempre adentro de la piel: el exoesqueleto va 0,50 m hacia adentro del borde de las losas (en la obra, los chevrones van detrás del muro cortina; supuesto el valor).',
    'Llegada al suelo (plano de elevación): la plaza queda libre y en cada cara baja solo la supercolumna reticulada a media cara (24 ft de ancho: dos cordones con diagonales en zigzag; secciones equivalentes supuestas). Encima, el cajón de transición (pisos 8 y 9) en todo el ancho, con diagonales desde las esquinas de abajo y un zigzag que lleva la carga al centro (la V del centro, que recibe el mástil, con sección de transferencia de 1,40 m, supuesta). El mástil termina en el techo del cajón. El primer módulo es de 6 pisos (10 → 16): sus diagonales son una recta de cada esquina a un cuarto de la mitad sobre el cajón, que corta la columna del cuarto en el piso 12; las columnas de esquina, como en todos los módulos, terminan un piso antes del nudo de arriba (cada chevron se une al de arriba solo por el mástil); desde el piso 16, los chevrones de 8 pisos al mástil. Las supercolumnas de las caras perpendiculares trabajan como alas de cada cara (como el mástil en la ficha E). Sin esquinas abajo, el vuelco baja todo por las supercolumnas: el cajón de acero equivalente tiene 8 cm de pared (supuesto: con las losas apoyadas en el exo, la de sotavento, que acá trabaja como ala de la cara y recibe la esquina del cajón de transición, con 6,5 cm pasa la tensión admisible del curso en un 14 % y con 7,5 cm en un 2 %).',
    'Estructura de la corona (zona libre, barra por barra): columnas del cajón en las cuatro caras; en las caras este y oeste, un reticulado bajo la pendiente con el cordón 0,50 m adentro de la piel, montantes en las líneas de los nudos de abajo, un tirante a media altura y diagonales; la cara norte sube hasta la azotea con una V invertida y la sur termina en el cajón (barras de una sola cara). Las líneas de las crujías del plano no coinciden con los nudos del último módulo: se usaron los nudos (supuesto).',
    'Panelería: paños de 3,66 m (12 ft; Wikipedia: segmentos de 12 × 9 ft de vidrio y aluminio, dato de un resumen de la página) repartidos parejo, y antepecho de aluminio de 2,0 m (supuesto). La cara inclinada de la corona, opaca (revestida en aluminio, supuesto).',
  ];
  return p;
}
