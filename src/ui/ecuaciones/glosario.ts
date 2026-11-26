/**
 * Glosario de la guía de cálculo: las unidades (cómo se leen y cuánto valen en otras), cómo funciona un simulador de
 * fluidos explicado paso a paso, el diccionario de la simulación y las variables de cada método, sacadas de los mismos
 * grafos de la etapa Ecuaciones (símbolo, qué es, unidad y en qué capítulo se usa). Lo usan la guía imprimible de cada
 * método y el glosario completo («Glosario y unidades»).
 */
import { h, type H } from '../comp';
import { simbolo, type CapituloGrafo, type Grafo } from '../grafo';
import { ILUSTRACION_PASO } from './ilustraciones';

// ---------------------------------------------------------------------------------------------------- unidades
export interface Unidad { lee: string; es: string; equivale?: string }
/** cada unidad que aparece en la guía, en palabras (sin unidad: los coeficientes) */
export const UNIDADES: Record<string, Unidad> = {
  '': { lee: 'sin unidad', es: 'un número puro: un cociente entre dos cosas de la misma clase (un coeficiente, un factor, una proporción). Por ejemplo, Cp = 0,8 quiere decir que el viento empuja con el 80 % de su presión dinámica.' },
  m: { lee: 'metros', es: 'una longitud: un largo, un espesor, una altura o un brazo de palanca.' },
  mm: { lee: 'milímetros', es: 'una longitud chica: los corrimientos de la torre.', equivale: '1000 mm = 1 m' },
  'cm²': { lee: 'centímetros cuadrados', es: 'el área de la sección de las barras de acero.', equivale: '10 000 cm² = 1 m²' },
  'm²': { lee: 'metros cuadrados', es: 'un área: la de una fachada, la de la sección de un muro o un área de influencia.' },
  'm³': { lee: 'metros cúbicos', es: 'un volumen; en las piezas, el módulo resistente W = J / (distancia a la fibra más alejada): cuánto «momento» aguanta la sección por cada unidad de tensión.' },
  'm⁴': { lee: 'metros a la cuarta', es: 'el momento de inercia J de una pieza: cuánto le cuesta doblarse. Crece con el cubo del largo del muro: un muro el doble de largo es 8 veces más rígido.' },
  'm⁶': { lee: 'metros a la sexta', es: 'la suma de J · a² (J por la distancia al centro de rigidez, al cuadrado): la rigidez de la planta contra el giro (la torsión).' },
  t: { lee: 'toneladas (fuerza)', es: 'una fuerza: el peso de mil kilos. Las cargas, los cortes y los esfuerzos normales.', equivale: '1 t ≈ 9,81 kN ≈ 10 kN' },
  tm: { lee: 'toneladas por metro (momento)', es: 'un momento: una fuerza por su brazo de palanca. 10 t aplicadas a 5 m de la base dan 50 tm.', equivale: '1 tm ≈ 9,81 kNm' },
  't·m': { lee: 'tonelada por metro (rigidez al giro)', es: 'en el FEM, la rigidez de una pieza contra el giro de la planta: el momento que hace falta para girarla un radián. Se escribe distinto que el momento (tm) para no confundirlas.' },
  't/m': { lee: 'toneladas por metro', es: 'una carga repartida a lo largo (por metro de altura o de largo); en el FEM, una rigidez: la fuerza que hace falta para correr una pieza un metro.' },
  't/m²': { lee: 'toneladas por metro cuadrado', es: 'una presión o una tensión repartida: la carga de una losa, la presión del viento o la tensión en el suelo.', equivale: '1 t/m² = 0,1 kg/cm² ≈ 9,81 kN/m²' },
  't/m³': { lee: 'toneladas por metro cúbico', es: 'el peso específico: cuánto pesa un metro cúbico (hormigón armado: 2,4).' },
  'kg/cm²': { lee: 'kilos por centímetro cuadrado', es: 'la tensión en el hormigón o en el acero: cuánta fuerza soporta cada centímetro cuadrado. Un H30 aguanta unos 300 kg/cm².', equivale: '1 kg/cm² = 10 t/m² ≈ 0,098 MPa' },
  'N/m²': { lee: 'newtons por metro cuadrado (pascales)', es: 'la presión del viento del CIRSOC 102 (qz, p). Es una unidad chica: 1000 N/m² es una presión de viento fuerte.', equivale: '1000 N/m² = 1 kN/m² ≈ 0,102 t/m²' },
  MPa: { lee: 'megapascales', es: 'la resistencia del hormigón (f\'c) y del acero en los reglamentos nuevos.', equivale: '1 MPa ≈ 10,2 kg/cm²; H30 → f\'c = 30 MPa' },
  'm/s': { lee: 'metros por segundo', es: 'una velocidad (el viento). Para pasarla a km/h, se multiplica por 3,6.', equivale: '40 m/s = 144 km/h' },
  Hz: { lee: 'hertz (vueltas por segundo)', es: 'una frecuencia: cuántas veces por segundo oscila la torre (n1). Una torre de 20 pisos anda cerca de 0,3 a 0,5 Hz: va y vuelve cada 2 a 3 segundos.', equivale: 'período T = 1 / f' },
  'rad/s': { lee: 'radianes por segundo', es: 'la frecuencia «angular»: la misma frecuencia multiplicada por 2π.', equivale: 'ω = 2π · f' },
  '1/s²': { lee: 'uno sobre segundo al cuadrado', es: 'la frecuencia angular al cuadrado (ω²): es lo que da el cálculo de los modos de vibrar.' },
  mrad: { lee: 'milirradianes', es: 'un giro chico de la planta: un milésimo de radián (≈ 0,057°).' },
  '%': { lee: 'por ciento', es: 'una parte de cien: qué porción de la fuerza toma una pieza o cuánta armadura lleva la sección.' },
  'm²/s': { lee: 'metros cuadrados por segundo', es: 'la viscosidad del aire (ν ≈ 0,000015): qué tan «espeso» es.' },
  't·s²/m': { lee: 'tonelada · segundo² / metro (masa)', es: 'la masa en el sistema técnico: el peso dividido por la gravedad (9,81 m/s²). Una losa que pesa 981 t tiene una masa de 100 t·s²/m.' },
  't·s²·m': { lee: 'tonelada · segundo² · metro (inercia de giro)', es: 'cuánto le cuesta a la planta empezar a girar: la masa por la distancia al centro, al cuadrado.' },
  't·m²': { lee: 'tonelada por metro cuadrado (rigidez a la flexión)', es: 'E · J: el módulo del material por el momento de inercia, la rigidez a la flexión de una pieza.' },
  celdas: { lee: 'celdas', es: 'en la simulación, la cantidad de cuadraditos (o cubitos) de la grilla. Más celdas por ancho de la torre: más detalle y más lento.' },
  'celdas/paso': { lee: 'celdas por paso', es: 'la velocidad «de la red»: cuántas celdas recorre el aire en un paso de la simulación. Siempre chica (0,05 a 0,1) para que la cuenta sea estable.' },
  'celdas²/paso': { lee: 'celdas al cuadrado por paso', es: 'la viscosidad «de la red»: cuánto se mezcla el aire entre celdas vecinas en cada paso.' },
};
/** unidades del túnel de viento que no están en los grafos (para el glosario completo) */
const UNIDADES_TUNEL = ['km/h', 'm/s', 'celdas', 'celdas/paso', ''];
UNIDADES['km/h'] = { lee: 'kilómetros por hora', es: 'la velocidad como en el pronóstico del tiempo. La app la usa por defecto en los túneles.', equivale: '1 m/s = 3,6 km/h; 100 km/h ≈ 28 m/s' };

// ---------------------------------------------------------------------------------------------------- la simulación
/** cómo funciona un túnel de viento numérico, paso a paso, sin fórmulas al principio */
export const SIMULACION_PASOS: { titulo: string; texto: string }[] = [
  { titulo: '1. El aire en cuadraditos', texto: 'La simulación no puede seguir cada molécula de aire: divide el espacio alrededor de la torre en cuadraditos (en el 2D) o cubitos (en el 3D), como los píxeles de una foto. Cada uno es una celda. Cuantas más celdas entran en el ancho de la torre, más detalle (y más lenta la cuenta). En la app eso es la «resolución» o la «grilla».' },
  { titulo: '2. En cada celda, partículas que van en direcciones fijas', texto: 'En cada celda se guarda cuánto aire va en cada una de unas pocas direcciones: 9 en el 2D (quieto, 4 rectas y 4 diagonales) y 19 en el 3D. Es el método de Lattice Boltzmann («lattice» es grilla; Boltzmann estudió los gases como montones de partículas). Sumando lo de las 9 o 19 direcciones salen la densidad (de ahí la presión) y la velocidad del aire en esa celda.' },
  { titulo: '3. Un paso: saltar y chocar', texto: 'Cada paso de tiempo tiene dos movimientos. Salto: el aire de cada dirección pasa a la celda vecina en esa dirección. Choque: en cada celda, lo que llegó se mezcla y se reparte otra vez, acercándose al reparto «tranquilo» (de equilibrio) que tendría el aire con esa velocidad. Qué tan rápido se mezcla es la viscosidad. Repitiendo esos dos movimientos miles de veces, el aire se comporta como el aire real (cumple las ecuaciones de Navier-Stokes, sin escribirlas).' },
  { titulo: '4. La torre y las paredes', texto: 'Las celdas de la torre son sólidas. El aire que llega a una pared rebota por donde vino, como una pelota contra el frontón; así la velocidad en la pared queda en cero. Con «paredes exactas» el rebote sabe dónde está la pared dentro de la celda, y una curva o una ochava se ven lisas en lugar de en escalera.' },
  { titulo: '5. Los bordes del túnel', texto: 'Por la izquierda entra el viento (en el 3D, más fuerte arriba que abajo, como en el CIRSOC 102); por la derecha sale libre; arriba y a los costados el aire desliza. El túnel es varias veces más grande que la torre para que los bordes no la afecten.' },
  { titulo: '6. Los remolinos chicos', texto: 'Los remolinos más chicos que una celda no se pueden ver. El modelo de Smagorinsky los reemplaza: agrega un poco de viscosidad donde el aire se revuelve mucho. Sin eso la cuenta se volvería inestable con vientos fuertes.' },
  { titulo: '7. Por qué la simulación habla en «veces el viento que llega»', texto: 'Adentro de la simulación el viento que entra va a 0,06 a 0,1 celdas por paso: tiene que ser lento frente a la «velocidad del sonido» de la red (0,58 celdas por paso) para que el aire se comporte como un fluido que no se comprime. Por eso todo se mide como múltiplo del viento que llega: 1,2 quiere decir 20 % más rápido. La app lo pasa a km/h multiplicando por el viento elegido (el de diseño del CIRSOC a esa altura u otro): como la forma del flujo no cambia, multiplicar es correcto.' },
  { titulo: '8. El Reynolds: por qué es didáctico', texto: 'El número de Reynolds compara la inercia del aire con su viscosidad: Re = V · B / ν. Una torre real con viento fuerte tiene Re ≈ 100 millones; la simulación usa entre 150 y 20 000 (no hay computadora que pueda con el real). En edificios con esquinas vivas el aire se despega en las esquinas casi con cualquier Reynolds alto, y los coeficientes (Cd, Cp, St) se parecen a los reales. Las formas redondeadas dependen más del Reynolds. Por eso la simulación sirve para comparar formas y entender el flujo, no para reemplazar el reglamento ni un ensayo.' },
  { titulo: '9. Qué se mide', texto: 'Sumando la presión (y el roce) sobre la torre sale la fuerza. Dividida por la presión del viento y el ancho, da coeficientes sin unidad: Cd (arrastre: cuánto empuja en el sentido del viento), Cl (fuerza lateral: cuánto se sacude de costado por los remolinos), St (Strouhal: cada cuánto se desprenden los remolinos) y Cp (presión en cada punto de la fachada: positivo empuja, negativo succiona).' },
  { titulo: '10. Cuándo se rompe', texto: 'Si en algún lugar el aire se acelera demasiado (más de unas 0,3 celdas por paso, típico en esquinas vivas con poca viscosidad), la cuenta deja de tener sentido y «explota». La app vigila eso, avisa dónde y propone el túnel lento (entrada a 0,06 en lugar de 0,1).' },
  { titulo: '11. 2D, 3D y OpenFOAM', texto: 'El túnel 2D es un corte en planta: rápido, ve los remolinos, pero no el aire que pasa por arriba de la torre. El 3D tiene la torre entera con el viento que crece con la altura: más real y mucho más pesado (usa la placa de video). OpenFOAM, el simulador de los laboratorios, resuelve el flujo medio (RANS) con mallas que se adaptan a la forma: es el paso siguiente si se quiere un número para un informe.' },
];
/** el diccionario de la simulación, en orden alfabético */
export const SIMULACION_TERMINOS: [string, string][] = [
  ['Anemómetro virtual', 'Un punto del túnel donde se registra la velocidad y la presión en el tiempo, como un anemómetro de verdad. Sirve para ver las ráfagas en un balcón o en la vereda.'],
  ['Capa límite (atmosférica)', 'La franja de aire cerca del suelo donde el viento es más lento por la rugosidad del terreno (edificios, árboles). Por eso el viento crece con la altura: el perfil del CIRSOC 102.'],
  ['Celda', 'Cada cuadradito (2D) o cubito (3D) en que se divide el aire.'],
  ['Cd (coeficiente de arrastre)', 'La fuerza del viento en su sentido dividida por (presión del viento × ancho). Un cuadrado de esquinas vivas da cerca de 2 en 2D; una torre de altura finita, cerca de 1 a 1,4.'],
  ['Cl (fuerza lateral)', 'La fuerza de costado, que cambia de signo con cada remolino que se desprende. Se informa su valor eficaz (±): cuánto se sacude la torre.'],
  ['Colisión BGK o TRT', 'La forma de hacer el «choque» de cada paso. BGK es la más simple; TRT separa dos partes del reparto y deja la pared exactamente en su lugar (más estable).'],
  ['Cp (coeficiente de presión)', 'La presión en un punto dividida por la presión del viento. Positivo: empuja la fachada (la comprime, azul). Negativo: la succiona (la tracciona, rojo).'],
  ['Estela', 'La zona de aire revuelto y más lento detrás de la torre, donde se forman los remolinos.'],
  ['Fidelidad', 'Cuánto detalle tiene la simulación (celdas, paredes, motor), de «básica» a «máxima». Más fidelidad, más lenta.'],
  ['Giro del aire (vorticidad)', 'Cuánto gira el aire en cada lugar: naranja en un sentido, violeta en el otro. Marca los remolinos.'],
  ['Isolínea', 'Una línea que une los puntos donde el viento medio vale lo mismo (por ejemplo, 20 % más que el que llega).'],
  ['Lattice Boltzmann', 'El método de la simulación: partículas en una grilla que saltan y chocan (ver los pasos 2 y 3).'],
  ['M celdas/s', 'Millones de celdas que la computadora actualiza por segundo: la velocidad del motor.'],
  ['Pasada', 'El tiempo que tarda el aire en recorrer una vez el ancho de la torre. Los remolinos aparecen a las 40 u 80 pasadas.'],
  ['Paso', 'Un salto y un choque de toda la grilla. Una pasada son cientos de pasos.'],
  ['Paredes exactas / en escalera', 'Exactas: el rebote sabe dónde está la pared dentro de la celda (curvas lisas). En el túnel 3D, «exactas en planta y en altura» también sigue la piel inclinada o curva entre un piso y otro (donde la carpintería es continua); «solo en planta» deja un escalón en cada piso. En escalera: la pared es el borde de las celdas.'],
  ['Ráfagas', 'Cuánto se aparta la velocidad de su media en el tiempo: dónde el viento es más irregular.'],
  ['RANS y k-ε', 'Lo que usa OpenFOAM: en lugar de seguir cada remolino, resuelve el flujo medio y estima la turbulencia con dos números (k, la energía de los remolinos, y ε, cómo se disipan).'],
  ['Reynolds (Re)', 'Inercia contra viscosidad: V · B / ν. Ver el paso 8.'],
  ['Resolución', 'Cuántas celdas entran en el ancho de la torre.'],
  ['Smagorinsky', 'El modelo que reemplaza a los remolinos más chicos que una celda (paso 6).'],
  ['Strouhal (St)', 'Cada cuánto se desprenden los remolinos: f · B / V. Con la frecuencia de la torre da la velocidad del viento que podría hacerla entrar en resonancia.'],
  ['Túnel lento', 'El viento de entrada a 0,06 celdas por paso en lugar de 0,1: más estable cuando el aire se acelera mucho (con vecinos, por ejemplo); tarda más.'],
  ['Velocidad media', 'El promedio en el tiempo de la velocidad en cada lugar: borra los remolinos y deja ver dónde el viento se acelera siempre.'],
  ['Viento que llega', 'El viento que entra al túnel. Todas las velocidades se miden como múltiplo de él y la app las pasa a km/h.'],
  ['WebGPU / WebAssembly', 'Las dos formas de hacer cuentas rápidas en el navegador: con la placa de video (WebGPU, el 3D grande) o con el procesador (WebAssembly).'],
];

// ---------------------------------------------------------------------------------------------------- variables
export interface EntradaGlosario { sim: string; nombre: string; unidad: string; capitulos: string[]; tipo: 'dato' | 'cuenta' | 'control' }
type G = Grafo<unknown, unknown>;
/** las variables de un método: cada símbolo con su nombre, su unidad y los capítulos donde aparece (sin repetir) */
export function glosarioDe(g: G): EntradaGlosario[] {
  const m = new Map<string, EntradaGlosario>();
  g.capitulos.forEach((cap: CapituloGrafo<unknown, unknown>) => {
    const poner = (sim: string, nombre: string, unidad: string, tipo: EntradaGlosario['tipo']) => {
      const k = `${sim}|${nombre.toLowerCase()}`, e = m.get(k);
      if (e) { if (!e.capitulos.includes(cap.titulo)) e.capitulos.push(cap.titulo); return; }
      m.set(k, { sim, nombre, unidad, capitulos: [cap.titulo], tipo });
    };
    cap.params.forEach(x => poner(x.sim, x.nombre, x.unidad ?? '', 'dato'));
    cap.nodos.forEach(n => { if (!n.externo) poner(n.sim, n.titulo, n.unidad ?? '', n.control ? 'control' : 'cuenta'); });
  });
  return [...m.values()].sort((a, b) => a.sim.localeCompare(b.sim, 'es', { sensitivity: 'base' }));
}
const celdaSim = (s: string) => { const td = h('td', { class: 'sim' }); td.innerHTML = simbolo(s); return td; };

/** la tabla de las variables de un método; «otras»: los mismos símbolos en los demás métodos, para avisar si cambian */
export function tablaVariables(es: EntradaGlosario[], otras: Map<string, { nombre: string; unidad: string; metodo: string }[]> = new Map()): H {
  const tb = h('tbody');
  es.forEach(e => {
    // la misma letra con otra unidad en otro método: es otra cosa (o se mide distinto): se avisa
    const u = UNIDADES[e.unidad], otro = (otras.get(e.sim) ?? []).filter(x => x.unidad !== e.unidad).slice(0, 2);
    tb.append(h('tr', {}, celdaSim(e.sim),
      h('td', {}, e.nombre, ...(otro.length ? [h('small', { class: 'nota' }, ` · ¡ojo! en ${otro.map(x => `${x.metodo} «${e.sim}» es ${x.nombre.toLowerCase()} (${x.unidad || 'sin unidad'})`).join('; en ')}`)] : [])),
      h('td', {}, e.unidad || '—', ...(u ? [h('small', { class: 'nota' }, ` (${u.lee})`)] : [])),
      h('td', { class: 'nota' }, e.capitulos.join(' · '))));
  });
  return h('table', { class: 'tabla chica glosario' }, h('thead', {}, h('tr', {}, ...['símbolo', 'qué es', 'unidad', 'dónde aparece'].map(x => h('th', {}, x)))), tb);
}
/** la tabla de las unidades (las que se pasan; todas si no) */
/** las unidades como fichas: el símbolo grande, cómo se lee, qué mide y cuánto vale en otras */
export function tablaUnidades(us: string[] = Object.keys(UNIDADES)): H {
  const grilla = h('div', { class: 'fichas-unidad' });
  [...new Set(us)].filter(u => UNIDADES[u]).sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'es'))).forEach(u => {
    const x = UNIDADES[u];
    grilla.append(h('div', { class: 'ficha-unidad' },
      h('div', { class: 'fu-sim' }, u || '—'),
      h('div', { class: 'fu-txt' }, h('b', {}, x.lee), h('p', {}, x.es), ...(x.equivale ? [h('span', { class: 'fu-eq' }, x.equivale)] : []))));
  });
  return grilla;
}
/** «cómo funciona la simulación»: los pasos y el diccionario */
export function seccionesSimulacion(): H[] {
  return [
    h('section', { class: 'guia-cap' }, h('h2', {}, 'Cómo funciona un simulador de fluidos, paso a paso'),
      h('p', { class: 'guia-intro' }, 'Un túnel de viento numérico hace con cuentas lo que un túnel de verdad hace con aire y una maqueta. Estos son los pasos, de lo más simple a lo más fino; los dibujos muestran la idea de cada uno.'),
      ...SIMULACION_PASOS.map((p, k) => {
        const m = /^(\d+)\.\s*(.*)$/.exec(p.titulo), n = m ? +m[1] : k + 1, dib = ILUSTRACION_PASO[n];
        return h('div', { class: `sim-paso${dib ? '' : ' sin-dibujo'}` },
          h('div', { class: 'sp-num' }, String(n)),
          h('div', { class: 'sp-txt' }, h('h3', {}, m ? m[2] : p.titulo), h('p', {}, p.texto)),
          ...(dib ? [h('figure', { class: 'sp-dib' }, dib() as unknown as H)] : []));
      })),
    h('section', { class: 'guia-cap' }, h('h2', {}, 'Diccionario de la simulación'),
      h('p', { class: 'guia-intro' }, 'Las palabras que aparecen en los túneles de viento de la app, en orden alfabético.'),
      h('div', { class: 'dicc' }, ...SIMULACION_TERMINOS.map(([t, d]) => h('div', { class: 'dicc-item' }, h('b', {}, t), h('p', {}, d))))),
  ];
}
/** las unidades de la simulación (para la guía de Flujo, además de las del grafo) */
export const unidadesTunel = () => UNIDADES_TUNEL;
