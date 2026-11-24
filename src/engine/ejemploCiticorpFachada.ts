/**
 * Citicorp Center con su forma y su fachada, armado con las herramientas de diseño (sobre el modelo estructural de
 * ejemploCiticorp: niveles del plano, supercolumnas, núcleo y chevrones):
 *
 *  - Corona: un plano de corte a 45° que mira al sur (Wikipedia: techo a 45°, girado al sur para colectores solares;
 *    sube 160 ft sobre el último piso). Recorta las losas: la de la corona queda como una franja al norte.
 *  - Carpintería por tramos: sin carpintería en la base abierta (la plaza debajo de la torre, entre las
 *    supercolumnas), «Por piso» plana del cajón de transición al piso 56 y «Envolvente» plana en la corona.
 *  - Panelería: paños de unos 12 ft de ancho (Wikipedia: segmentos de 12 × 9 ft de vidrio y aluminio) con antepecho
 *    de aluminio; la cara inclinada de la corona, opaca (revestida en aluminio).
 */
import { ejemploCiticorp, type Proyecto } from './modelo';
import { aplicarCarpinteriaTramos, bandasFachada, calcularPaneleria } from './carpinteria';
import { aplicarPlanosCorte } from './planos_corte';

export function ejemploCiticorpFachada(): Proyecto {
  const p = ejemploCiticorp();
  const lado = 47.85, m = lado / 2;
  const z56 = p.niveles.find(n => n.nombre.startsWith('56º'))!.cota;       // 229,82 m: el último piso de oficinas
  const zCorona = p.niveles[0].cota;                                        // 278,6 m
  const zBase = p.niveles.find(n => n.nombre.startsWith('8º–9º'))!.cota;   // 34,75 m: sobre las supercolumnas
  p.nombre = 'Citicorp Center (Nueva York, 1977) · forma y fachada';
  // la corona: el plano baja a 45° de norte a sur. Pasa 1 m arriba de la corona en el borde norte, para que la losa
  // de la corona quede como una franja (un plano que saca una losa entera la deja como estaba)
  p.planosCorte = [{ id: 'P1', eje: 'y', a: { w: m, z: +(zCorona + 1).toFixed(2) }, b: { w: -m, z: +(zCorona + 1 - lado).toFixed(2) }, saca: 'arriba' }];
  // el plano reescribe B y L de la losa de la corona (47,85 × 1 m): el piso 56 lleva los suyos para que los niveles de
  // abajo no hereden los de la corona (la planilla calcula el viento con B × L de cada nivel)
  const n56 = p.niveles.find(n => n.cota === z56)!; n56.B = lado; n56.L = lado;
  // el núcleo termina en el último piso de oficinas: la corona (pisos técnicos) cuelga del exoesqueleto
  const nucleo = p.muros.find(x => x.id === 'N1'); if (nucleo) nucleo.zHasta = z56;
  p.carpinteriaTramos = [
    { desde: 0, modo: 'sin' },                                             // la plaza: abierta entre las supercolumnas
    { desde: zBase, modo: 'losa', retiro: 0.3, forma: 'plana' },           // oficinas: por piso, de losa a losa
    { desde: z56, modo: 'continua', retiro: 0.3, forma: 'plana' },         // la corona: envolvente
  ];
  p.paneleria = { modulo: 3.66, antepecho: 2.0, intermedios: 0 };
  // la cara inclinada de la corona, opaca: se busca su plano con la geometría ya recortada
  const q: Proyecto = structuredClone(p);
  aplicarPlanosCorte(q); aplicarCarpinteriaTramos(q);
  const caras = calcularPaneleria(bandasFachada(q), q.paneleria!).carasInfo.filter(c => c.inclinacion >= 30 && c.inclinacion <= 60);
  if (caras.length) p.paneleria.caras = caras.map(c => ({ id: c.id, tipo: 'opaca' as const }));
  p.exo!.notas = [
    ...(p.exo!.notas ?? []),
    'Forma: la corona es un plano de corte a 45° que mira al sur (Wikipedia: el techo se giró al sur para colectores solares) y baja 48,85 m, del borde norte a 1 m sobre la corona al borde sur. Recorta las losas: la de la corona queda como una franja al norte.',
    'El plano reescribe B y L de la losa de la corona (franja de 47,85 × 1 m); el piso 56 lleva sus 47,85 × 47,85 m para que los niveles de abajo no los hereden. El núcleo termina en el piso 56 (supuesto): la corona cuelga del exoesqueleto.',
    'Carpintería por tramos: sin carpintería en la plaza (debajo de la torre, entre las supercolumnas); «Por piso» plana del cajón de transición (34,75 m) al piso 56; «Envolvente» plana en la corona.',
    'Panelería: paños de 3,66 m (12 ft; Wikipedia: segmentos de 12 × 9 ft de vidrio y aluminio, dato de un resumen de la página) repartidos parejo, y antepecho de aluminio de 2,0 m (supuesto: la página no da la proporción). La cara inclinada de la corona, opaca (revestida en aluminio, supuesto).',
  ];
  return p;
}
