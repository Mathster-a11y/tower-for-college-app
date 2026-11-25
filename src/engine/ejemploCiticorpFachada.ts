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
  p.nombre = 'Citicorp Center (Nueva York, 1977) · forma y fachada';

  // niveles: el techo del cajón es un nivel; para no pasar de los 49 de la planilla, el 10º y el 11º van juntos
  const i10 = p.niveles.findIndex(n => n.nombre === '10º');
  p.niveles.splice(i10, 1);
  const n11 = p.niveles.find(n => n.nombre === '11º')!; n11.nombre = '10º–11º'; n11.pisos = 2;
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
  // los chevrones hasta el piso 56; arriba, la corona dibujada barra por barra (zona libre)
  // debajo del cajón de transición no hay esquinas ni diagonales: la plaza queda libre y solo baja la supercolumna de
  // cada cara (a media cara); los chevrones van del cajón al piso 56 y la corona, arriba, barra por barra
  exo.zonas = [{ desde: 0, tipo: 'L' }, { desde: zBase, tipo: 'E' }, { desde: z56, tipo: 'L' }];
  const r3 = (x: number) => +x.toFixed(3);
  const nb: BarraNueva[] = [];
  const barra = (clase: BarraNueva['clase'], a: [number, number], b: [number, number], extra: Partial<BarraNueva> = {}) => nb.push({ clase, a: [r3(a[0]), r3(a[1])], b: [r3(b[0]), r3(b[1])], ...extra });
  // la supercolumna (24 × 24 ft) de PB al cajón, en las cuatro caras
  // sin las esquinas y la V de abajo (que no existen), el vuelco de la torre baja todo por las supercolumnas: el cajón
  // de acero equivalente lleva 6 cm de pared (con 5 cm la de sotavento pasa la tensión admisible en un 5 %; supuesto)
  const supercol = { b: 7.3, e: 0.06 };
  exo.mastilBase = { hasta: zBase, sec: supercol };
  barra('columna', [0, 0], [0, zBase], { sec: supercol });
  // las supercolumnas de las caras perpendiculares trabajan como alas de esta cara (en sus bordes, media sección)
  barra('columna', [-S, 0], [-S, zBase], { sec: supercol, ala: true }); barra('columna', [S, 0], [S, zBase], { sec: supercol, ala: true });
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
    'Niveles: el techo del cajón es un nivel (244,62 m); para no pasar de los 49 niveles de la planilla, el 10º y el 11º van juntos (los módulos siguen en los pisos 8, 16, …, 56).',
    'Piel: sin carpintería en la plaza; «Por piso» plana del cajón de transición (34,75 m) al techo del cajón de la corona, en el borde de las losas; la corona es una «Envolvente» con su propio plano a 45° (las losas no se recortan). La losa de la azotea es la franja plana del norte.',
    'Estructura siempre adentro de la piel: el exoesqueleto va 0,50 m hacia adentro del borde de las losas (en la obra, los chevrones van detrás del muro cortina; supuesto el valor).',
    'Debajo del cajón de transición (34,75 m) no hay columnas de esquina ni diagonales: la plaza queda libre y en cada cara baja solo la supercolumna a media cara (24 × 24 ft, como en el plano). Los chevrones arrancan en el cajón. Las supercolumnas de las caras perpendiculares trabajan como alas de cada cara (como el mástil en la ficha E). Sin esquinas abajo, el vuelco baja todo por las supercolumnas: el cajón de acero equivalente pasa de 5 a 6 cm de pared (supuesto; con 5 cm la de sotavento pasa la tensión admisible en un 5 %).',
    'Estructura de la corona (zona libre, barra por barra): columnas del cajón en las cuatro caras; en las caras este y oeste, un reticulado bajo la pendiente con el cordón 0,50 m adentro de la piel, montantes en las líneas de los nudos de abajo, un tirante a media altura y diagonales; la cara norte sube hasta la azotea con una V invertida y la sur termina en el cajón (barras de una sola cara). Las líneas de las crujías del plano no coinciden con los nudos del último módulo: se usaron los nudos (supuesto).',
    'Panelería: paños de 3,66 m (12 ft; Wikipedia: segmentos de 12 × 9 ft de vidrio y aluminio, dato de un resumen de la página) repartidos parejo, y antepecho de aluminio de 2,0 m (supuesto). La cara inclinada de la corona, opaca (revestida en aluminio, supuesto).',
  ];
  return p;
}
