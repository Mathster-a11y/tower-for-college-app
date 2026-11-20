/**
 * «Planilla de la guía» (plan de trabajo, etapa 5a): el procedimiento analítico de la guía «Edificio en torre» 2024 como
 * una calculadora cerrada. La app escribe solo la hoja «Datos» (celdas blancas); todo lo demás son fórmulas que leen
 * «Datos» o una hoja anterior, en el orden de la guía, con nombres definidos (V, Kd, zg…) para que se lean como en el
 * texto. Los gráficos leen las celdas: si el alumno cambia un dato, cambian solos.
 *
 *   Léame · Datos · 1 Diseño · 2 Viento · 3 Cargas y vuelco · 4 Secciones · 5 Rigidez · 6 Rototraslación ·
 *   7 Flexocompresión · Resumen   (+ las tablas «T3D» ocultas, para volver a abrir el proyecto en la app)
 *
 * Cada fórmula hace la misma cuenta que engine/metodos/guiaPasos.ts; las pruebas recalculan el libro (con el evaluador
 * de la app y con LibreOffice) y lo comparan con ese motor, que a su vez da igual que el método Guía de la app.
 */
import { hojaRef, LibroK, rc, type Estilo, type HojaK } from '../kit/libro';
import type { DatosGuia } from '../../engine/metodos/guiaPasos';
import { escribirGeometria, hojaSecciones } from './comun';
import { DIVISORES } from '../../engine/planilla';
import { tablasProyecto } from '../proyectoTablas';
import type { Proyecto } from '../../engine/modelo';

export const HG = {
  leame: 'Léame', datos: 'Datos', diseno: '1 Diseño', viento: '2 Viento', cargas: '3 Cargas y vuelco', secciones: '4 Secciones',
  rigidez: '5 Rigidez', roto: '6 Rototraslación', flexo: '7 Flexocompresión', resumen: 'Resumen',
};
/** dónde quedó cada resultado (para las pruebas y para la vista previa) */
export type Claves = Record<string, { hoja: string; ref: string }>;

const num = (fmt: Estilo['fmt'] = '0.000'): Estilo => ({ papel: 'calc', fmt });
const res = (fmt: Estilo['fmt'] = '0.000'): Estilo => ({ papel: 'res', fmt });
const dato = (fmt: Estilo['fmt'] = 'g'): Estilo => ({ papel: 'dato', fmt });
const coef = (fmt: Estilo['fmt'] = 'g'): Estilo => ({ papel: 'coef', fmt });
const VER = (cond: string, no = '"NO VERIFICA"') => `IF(${cond},"VERIFICA",${no})`;

export function libroGuia(d: DatosGuia, p?: Proyecto): { libro: LibroK; claves: Claves } {
  const L = new LibroK();
  L.titulo = `Planilla de la guía · ${d.nombre}`;
  const claves: Claves = {};
  const clave = (k: string, hoja: HojaK, ref: string) => { claves[k] = { hoja: hoja.nombre, ref }; };
  const N = d.niveles.length, R = d.rects.length;
  const nombrar = (n: string, h: HojaK, ref: string) => L.nombrar(n, h.nombre, ref);

  // ============================================================================================ Léame
  const le = L.hoja(HG.leame, [3, 110]);
  le.put(1, 1, 'Planilla de la guía «Edificio en torre» 2024', 'titulo');
  const lineas: [string, string][] = [
    ['', `Proyecto: ${d.nombre}. Hecha con Torre 3D, método «Guía».`],
    ['', 'Es una calculadora: el procedimiento analítico de la guía de la cátedra (FAUD-UNMDP), paso por paso y en su orden. Funciona sola, sin la app.'],
    ['', 'Los datos se escriben UNA sola vez, en la hoja «Datos». Todas las demás celdas son fórmulas: leen «Datos» o una hoja anterior. Si cambiás un dato, todo se recalcula (también los gráficos).'],
    ['s', 'Colores'],
    ['dato', 'Celda blanca con borde azul: dato del proyecto. Es lo único que se escribe a mano.'],
    ['coef', 'Celda amarilla: coeficiente de la guía (pesos, cargas, cuantía). Se puede cambiar, con criterio.'],
    ['calc', 'Celda gris: fórmula. No hace falta tocarla; hacé clic para ver la cuenta.'],
    ['res', 'Celda verde: resultado de un paso.'],
    ['s', 'Hojas'],
    ['', '1 Diseño: altura y esbeltez λ = h / L (guía 1).'],
    ['', '2 Viento: Kz, qz y la presión de diseño en cada nivel; la fuerza de cada nivel en los dos vientos (guía 2.1, CIRSOC 102-2005). Debajo de 5 m, Kz con z = 5 m; sin viento en PB ni en los subsuelos.'],
    ['', '3 Cargas y vuelco: planilla de características (W, Q, M y N en cada nivel), vuelco, excentricidad y tensiones en el suelo bajo la platea (guía 2.2 y 2.3). La franja expuesta de PB va a la fundación, no a los tabiques.'],
    ['', '4 Secciones: el J de cada pieza con sus rectángulos (J propio + Steiner) y el eje de inercia de cada viento (guía 3, Anexo). Con la planta dibujada.'],
    ['', '5 Rigidez: J mínimo para que la azotea no se corra más de h/500 y la flecha de la torre como ménsula: f = qv·h⁴ / (8·E·J) (guía 4.2).'],
    ['', '6 Rototraslación: lo que toma cada pieza por traslación (J/ΣJ) y por rotación (W·e·J·a / ΣJt·a²), con los muros perpendiculares (Anexo).'],
    ['', '7 Flexocompresión: en PB, muro por muro, σ = −N/F ± M/W, con el edificio descargado (tracción) y cargado (compresión); armadura y barras (guía 5).'],
    ['', 'Resumen: todos los controles, con VERIFICA / NO VERIFICA.'],
    ['s', 'Convenciones'],
    ['', 'Unidades: m, t, t/m² (las presiones del viento en N/m²; 1 t/m² ≈ 10 000 N/m², como la planilla de la cátedra). Tensiones de salida en kg/cm²; + tracción, − compresión.'],
    ['', 'Viento A: empuja la cara de ancho B y lo toman las piezas paralelas a y. Viento B: empuja la cara de ancho L y lo toman las paralelas a x.'],
    ['', 'Cada muro va como uno o más rectángulos (centro x, y y medidas ax, ay). Los tubos circulares y los perfiles llevan su área y su J propios (columnas de «A propia» y «J propio»).'],
    ['', 'Las hojas «T3D» (ocultas) guardan el proyecto completo para volver a abrirlo en Torre 3D. Si cambiás datos acá, la app no los ve: cambialos en la app y volvé a exportar.'],
  ];
  lineas.forEach(([t, x], i) => {
    if (t === 's') le.seccion(3 + i, x, 2);
    else { le.put(1, 3 + i, null, t === '' ? 'vacio' : (t as 'dato')); le.put(2, 3 + i, x, { papel: 'texto', ajustar: true }); }
  });
  for (let i = 0; i < lineas.length; i++) le.altos.set(3 + i, lineas[i][1].length > 120 ? 27 : 15);

  // ============================================================================================ Datos
  const da = L.hoja(HG.datos, [34, 14, 16, 16, 14, 13, 13, 12, 12, 12, 12, 13, 13, 11]);
  da.encabezado('Datos del proyecto', 'Lo único que se escribe a mano (celdas blancas). Las amarillas son coeficientes de la guía. Todas las hojas leen de acá: un dato se escribe una sola vez.', 14);
  da.fijar = { fila: 3, col: 1 };
  const filaDato = (r: number, rotulo: string, v: number | string, nombre: string | null, unidad: string, nota: string, e: Estilo) => {
    da.put(1, r, rotulo, 'textoB'); const ref = da.put(2, r, v, e); da.put(3, r, unidad, 'unidad'); da.put(4, r, nota, 'nota');
    if (nombre) nombrar(nombre, da, ref);
    return ref;
  };
  da.seccion(4, 'Proyecto', 14);
  filaDato(5, 'Nombre', d.nombre, null, '', '', { papel: 'dato' });
  filaDato(6, 'Hormigón H (resistencia σbk en MPa)', parseFloat(d.hormigon.replace(/[^\d.]/g, '')) || 30, 'Hormigon', 'MPa', 'H30 → 30 (σbk = 300 kg/cm²)', dato('0'));
  da.listas.push({ rango: 'B6', opciones: ['20', '25', '30', '35', '40', '47', '60', '80'] });
  da.seccion(8, 'Viento (CIRSOC 102-2005, como la guía)', 14);
  const v = d.viento;
  const filasV: [string, number, string, string, string][] = [
    ['V: velocidad básica', v.V, 'Vbas', 'm/s', 'mapa del CIRSOC 102 (Mar del Plata: 51 m/s en la guía)'],
    ['Kd: factor de direccionalidad', v.Kd, 'Kd', '', 'edificios: 0,85'],
    ['I: factor de importancia', v.I, 'Imp', '', 'categoría II: 1,00'],
    ['zg: altura de gradiente', v.zg, 'zg', 'm', 'según la exposición'],
    ['α: exponente de la exposición', v.alfa, 'alfa', '', 'según la exposición'],
    ['Kzt: factor topográfico', v.Kzt, 'Kzt', '', 'terreno llano: 1'],
    ['G: factor de ráfaga', v.G, 'Graf', '', 'edificio rígido: 0,85'],
    ['Cp barlovento', v.Cpb, 'Cpb', '', '0,8'],
    ['Cp sotavento', v.Cps, 'Cps', '', 'según L/B (negativo: succión)'],
    ['Parapeto sobre la azotea', v.parapeto, 'parap', 'm', 'se suma a la altura de influencia de la azotea'],
  ];
  filasV.forEach(([a, b, n, u, nota], i) => filaDato(9 + i, a, b, n, u, nota, dato('0.000')));
  da.seccion(20, 'Coeficientes de la guía', 14);
  ([['γ del hormigón armado', d.coef.gH, 'gamaH', 't/m³', ''], ['Carga de losa sin sobrecarga (descargado)', d.coef.qD, 'qDesc', 't/m²', 'peso propio, contrapiso, solado, tabiquería'], ['Carga de losa con sobrecarga (cargado)', d.coef.qC, 'qCarg', 't/m²', '0,7 + 0,2 de sobrecarga'],
    ['σe del acero', d.coef.sigE, 'sigmaE', 'kg/cm²', 'ADN 420 con su coeficiente de seguridad'], ['Cuantía mínima de los tabiques', d.coef.cuantia, 'cuantMin', '', '0,8 % de la sección']] as [string, number, string, string, string][])
    .forEach(([a, b, n, u, nota], i) => filaDato(21 + i, a, b, n, u, nota, coef('0.000')));
  da.seccion(27, 'Fundación (platea)', 14);
  filaDato(28, 'b1: lado paralelo al viento A', d.fund.b1, 'lado_b1', 'm', 'el viento A vuelca alrededor del borde de este lado', dato('0.00'));
  filaDato(29, 'a1: lado perpendicular al viento A', d.fund.a1, 'lado_a1', 'm', '', dato('0.00'));
  const geo = escribirGeometria(L, da, d, 31);
  const { rM0, piezasDir, nivDato } = geo;
  const D_ = hojaRef(HG.datos);

  // ============================================================================================ 2 Viento (se arma antes que 1 Diseño: Diseño lee sus cotas)
  const vi = L.hoja(HG.viento, [14, 9, 9, 9, 7, 8, 11, 8, 9, 11, 11, 11, 11, 11, 11, 3, 10, 10]);
  vi.encabezado('Paso 2 · Viento (CIRSOC 102-2005, como la guía)', 'Kz = 2,01·(z/zg)^(2/α), con z ≥ 5 m · qz = 0,613·Kzt·Kd·V²·I·Kz [N/m²] · presión de diseño = qz·G·Cp barlovento − qh·G·Cp sotavento (qh: la de la azotea) · fuerza de cada nivel = altura de influencia × ancho × presión. PB y los subsuelos no reciben viento (la franja de PB va a la fundación, hoja 3).', 15);
  vi.fijar = { fila: 6, col: 2 };
  vi.cabecera(5, 1, ['Nivel', 'Cota (m)', 'B (m)', 'L (m)', '¿Sobre PB?', 'Altura de influencia (m)', 'z para Kz (m)', 'Kz', 'qz (N/m²)', 'p barlovento (N/m²)', 'p sotavento (N/m²)', 'Presión neta (t/m²)', 'W viento A (t)', 'W viento B (t)', 'auxiliar: cota ≥ 0', '', 'auxiliar: cota > 0', 'auxiliar: cota > PB']);
  const rv = (i: number) => 6 + i, rv1 = rv(N - 1);
  for (let i = 0; i < N; i++) {
    const r = rv(i);
    vi.f(1, r, `${nivDato(1, i)}`, { papel: 'calc' });
    vi.f(2, r, `${nivDato(2, i)}`, num('0.00'));
    vi.f(3, r, `${nivDato(3, i)}`, num('0.00'));
    vi.f(4, r, `${nivDato(4, i)}`, num('0.00'));
    vi.f(5, r, `IF(B${r}>zPB,1,0)`, num('0'));
    const Dform = i === N - 1 ? '0' : i === 0 ? `IF(E${r}=1,(B${r}-B${r + 1})/2+parap,0)` : `IF(E${r}=1,(B${r - 1}-B${r + 1})/2,0)`;
    vi.f(6, r, Dform, num('0.000'));
    vi.f(7, r, `MAX(B${r},5)`, num('0.00'));
    vi.f(8, r, `IF(E${r}=1,2.01*POWER(G${r}/zg,2/alfa),0)`, num('0.0000'));
    vi.f(9, r, `IF(E${r}=1,0.613*Kzt*Kd*Vbas^2*Imp*H${r},0)`, num('0.00'));
    vi.f(10, r, `IF(E${r}=1,I${r}*Graf*Cpb,0)`, num('0.00'));
    vi.f(11, r, `IF(E${r}=1,qh*Graf*Cps,0)`, num('0.00'));
    vi.f(12, r, `(J${r}-K${r})/10000`, num('0.0000'));
    vi.f(13, r, `F${r}*C${r}*L${r}`, res('0.000'));
    vi.f(14, r, `F${r}*D${r}*L${r}`, res('0.000'));
    vi.f(15, r, `IF(B${r}>=0,B${r},1E+9)`, num('0.00'));
    vi.f(17, r, `IF(B${r}>0,B${r},1E+9)`, num('0.00'));
    vi.f(18, r, `IF(B${r}>zPB,B${r},1E+9)`, num('0.00'));
    clave(`W_A_${i}`, vi, rc(13, r)); clave(`W_B_${i}`, vi, rc(14, r)); clave(`p_${i}`, vi, rc(12, r));
  }
  const rvT = rv1 + 1;
  vi.put(12, rvT, 'Σ (sobre PB)', 'textoB'); vi.f(13, rvT, `SUM(M${rv(0)}:M${rv1})`, res('0.00')); vi.f(14, rvT, `SUM(N${rv(0)}:N${rv1})`, res('0.00'));
  nombrar('WA_suma', vi, rc(13, rvT)); nombrar('WB_suma', vi, rc(14, rvT));
  clave('WA', vi, rc(13, rvT)); clave('WB', vi, rc(14, rvT));
  nombrar('qh', vi, rc(9, rv(0)));
  nombrar('v_cota', vi, `B${rv(0)}:B${rv1}`); nombrar('v_p', vi, `L${rv(0)}:L${rv1}`); nombrar('v_B', vi, `C${rv(0)}:C${rv1}`); nombrar('v_L', vi, `D${rv(0)}:D${rv1}`);
  // cotas de referencia
  const rz = rvT + 2;
  vi.seccion(rz, 'Cotas de referencia', 15);
  const zfila = (k: number, rot: string, form: string, nombre: string, nota: string) => { vi.put(1, rz + k, rot, 'textoB'); vi.combinar(1, rz + k, 3, rz + k); const ref = vi.f(4, rz + k, form, res('0.00')); vi.put(5, rz + k, nota, 'nota'); nombrar(nombre, vi, ref); clave(nombre, vi, ref); };
  zfila(1, 'zTop: cota de la azotea (m)', `MAX(B${rv(0)}:B${rv1})`, 'zTop', 'la más alta');
  zfila(2, 'zPB: cota de PB (m)', `MIN(O${rv(0)}:O${rv1})`, 'zPB', 'la menor cota que no es negativa');
  zfila(3, 'zFund: cota de la fundación (m)', `MIN(B${rv(0)}:B${rv1})`, 'zFund', 'la más baja');
  zfila(4, 'Cota más baja sobre el terreno (m)', `MIN(Q${rv(0)}:Q${rv1})`, 'zMinTerreno', 'para la carga de abajo de la flecha');
  vi.graficos.push({ tipo: 'dispersion', titulo: 'Presión neta en altura', ejeX: 'presión neta (t/m²)', ejeY: 'cota (m)', sinLeyenda: true,
    series: [{ nombre: 'presión neta', x: `${hojaRef(HG.viento)}$L$${rv(0)}:$L$${rv1}`, y: `${hojaRef(HG.viento)}$B$${rv(0)}:$B$${rv1}`, color: '2E75B6' }], desde: [20, 4], hasta: [28, 24] });
  vi.graficos.push({ tipo: 'dispersion', titulo: 'Fuerza de cada nivel', ejeX: 'W (t)', ejeY: 'cota (m)',
    series: [{ nombre: 'viento A', x: `${hojaRef(HG.viento)}$M$${rv(0)}:$M$${rv1}`, y: `${hojaRef(HG.viento)}$B$${rv(0)}:$B$${rv1}`, color: 'C55A11' },
      { nombre: 'viento B', x: `${hojaRef(HG.viento)}$N$${rv(0)}:$N$${rv1}`, y: `${hojaRef(HG.viento)}$B$${rv(0)}:$B$${rv1}`, color: '548235', punteada: true }], desde: [20, 25], hasta: [28, 45] });

  // ============================================================================================ 1 Diseño
  const di = L.hoja(HG.diseno, [44, 13, 10, 70]);
  di.encabezado('Paso 1 · Diseño: altura y esbeltez', 'Guía 1: «para una esbeltez mayor a 3 se toman en cuenta las cargas de viento; entre 5 y 10 los efectos de las cargas laterales son más complejos y puede haber problemas de vuelco; mayor o igual a 10, muy difícil de materializar». λ = h / L, con h la altura sobre PB y L la planta en el sentido del viento.', 4);
  const filaDi = (r: number, rot: string, form: string, e: Estilo, unidad: string, nota = '') => { di.put(1, r, rot, 'textoB'); const ref = di.f(2, r, form, e); di.put(3, r, unidad, 'unidad'); if (nota) di.put(4, r, nota, 'nota'); return ref; };
  di.seccion(4, 'Altura', 4);
  const hRef = filaDi(5, 'h: altura sobre PB', 'zTop-zPB', res('0.00'), 'm'); nombrar('h_PB', di, hRef);
  const hTRef = filaDi(6, 'Altura hasta la fundación', 'zTop-zFund', res('0.00'), 'm', 'la de la ménsula de la flecha (hoja 5)'); nombrar('h_total', di, hTRef);
  const BPB = filaDi(7, 'B en PB (ancho que recibe el viento A)', 'SUMPRODUCT((v_cota=zPB)*v_B)', num('0.00'), 'm'); nombrar('B_PB', di, BPB);
  const LPB = filaDi(8, 'L en PB (ancho que recibe el viento B)', 'SUMPRODUCT((v_cota=zPB)*v_L)', num('0.00'), 'm'); nombrar('L_PB', di, LPB);
  di.seccion(10, 'Esbeltez', 4);
  const clase = (x: string) => `IF(${x}<=3,"λ ≤ 3: torre baja; el viento no suele mandar",IF(${x}<5,"3 < λ < 5: se toman en cuenta las cargas de viento",IF(${x}<10,"5 ≤ λ < 10: efectos complejos; puede haber vuelco","λ ≥ 10: muy difícil de materializar")))`;
  const lA = filaDi(11, 'λ viento A = h / L', 'h_PB/L_PB', res('0.00'), ''); di.f(4, 11, clase('B11'), { papel: 'texto' }); clave('esbeltezA', di, lA);
  const lB = filaDi(12, 'λ viento B = h / B', 'h_PB/B_PB', res('0.00'), ''); di.f(4, 12, clase('B12'), { papel: 'texto' }); clave('esbeltezB', di, lB);

  // ============================================================================================ 3 Cargas y vuelco
  const ca = L.hoja(HG.cargas, [14, 9, 10, 11, 12, 10, 11, 12, 10, 10, 11, 10, 10, 12, 10, 10, 12]);
  ca.encabezado('Paso 3 · Planilla de características, vuelco y suelo', 'W: fuerza del nivel (hoja 2) · Q: corte del entrepiso de arriba del nivel = suma de las W de arriba · M: momento en el nivel = M del nivel de arriba + Q · altura del entrepiso · N: peso acumulado (losa sin sobrecarga × área de la planta). Línea de presiones: e = M / N de cada nivel, dentro del núcleo central (lado / 6).', 17);
  ca.fijar = { fila: 6, col: 2 };
  ca.cabecera(5, 1, ['Nivel', 'Cota (m)', 'W viento A (t)', 'Q viento A (t)', 'M viento A (tm)', 'W viento B (t)', 'Q viento B (t)', 'M viento B (tm)', 'Área de la losa (m²)', 'Peso del nivel (t)', 'N acumulado (t)', 'e = M/N viento A (m)', 'L / 6 (m)', 'Núcleo central A', 'e = M/N viento B (m)', 'B / 6 (m)', 'Núcleo central B']);
  const rcg = (i: number) => 6 + i, rc1 = rcg(N - 1);
  const VI = hojaRef(HG.viento);
  for (let i = 0; i < N; i++) {
    const r = rcg(i), ra = r - 1;
    ca.f(1, r, `${VI}A${rv(i)}`, { papel: 'calc' });
    ca.f(2, r, `${VI}B${rv(i)}`, num('0.00'));
    ca.f(3, r, `${VI}M${rv(i)}`, num('0.000'));
    ca.f(4, r, i === 0 ? '0' : `D${ra}+C${ra}`, num('0.00'));
    ca.f(5, r, i === 0 ? '0' : `E${ra}+D${r}*(B${ra}-B${r})`, res('0.0'));
    ca.f(6, r, `${VI}N${rv(i)}`, num('0.000'));
    ca.f(7, r, i === 0 ? '0' : `G${ra}+F${ra}`, num('0.00'));
    ca.f(8, r, i === 0 ? '0' : `H${ra}+G${r}*(B${ra}-B${r})`, res('0.0'));
    ca.f(9, r, `${VI}C${rv(i)}*${VI}D${rv(i)}`, num('0.00'));
    ca.f(10, r, `qDesc*I${r}`, num('0.00'));
    ca.f(11, r, i === 0 ? `J${r}` : `K${ra}+J${r}`, res('0.0'));
    ca.f(12, r, `IF(K${r}>0,E${r}/K${r},0)`, num('0.000'));
    ca.f(13, r, `${VI}D${rv(i)}/6`, num('0.000'));
    ca.f(14, r, i === 0 ? '"—"' : `IF(K${r}>0,IF(ABS(L${r})<=M${r}+1E-9,"VERIFICA","ATENCIÓN"),"—")`, { papel: 'calc', centrar: true });
    ca.f(15, r, `IF(K${r}>0,H${r}/K${r},0)`, num('0.000'));
    ca.f(16, r, `${VI}C${rv(i)}/6`, num('0.000'));
    ca.f(17, r, i === 0 ? '"—"' : `IF(K${r}>0,IF(ABS(O${r})<=P${r}+1E-9,"VERIFICA","ATENCIÓN"),"—")`, { papel: 'calc', centrar: true });
    clave(`Q_A_${i}`, ca, rc(4, r)); clave(`M_A_${i}`, ca, rc(5, r)); clave(`Q_B_${i}`, ca, rc(7, r)); clave(`M_B_${i}`, ca, rc(8, r)); clave(`N_${i}`, ca, rc(11, r));
  }
  ca.verificaciones.push(`N${rcg(0)}:N${rc1}`, `Q${rcg(0)}:Q${rc1}`);
  nombrar('c_cota', ca, `B${rcg(0)}:B${rc1}`); nombrar('c_MA', ca, `E${rcg(0)}:E${rc1}`); nombrar('c_MB', ca, `H${rcg(0)}:H${rc1}`);
  // totales
  const rt = rc1 + 2;
  ca.seccion(rt, 'Viento en la franja de PB (de PB a medio entrepiso): va a la fundación, no a los tabiques', 17);
  const filaCa = (r: number, rot: string, form: string, e: Estilo, unidad: string, nombre?: string, nota?: string) => {
    ca.put(1, r, rot, 'textoB'); ca.combinar(1, r, 4, r); const ref = ca.f(5, r, form, e); ca.put(6, r, unidad, 'unidad');
    if (nota) { ca.put(7, r, nota, 'nota'); ca.combinar(7, r, 17, r); }
    if (nombre) { nombrar(nombre, ca, ref); clave(nombre, ca, ref); }
    return ref;
  };
  filaCa(rt + 1, 'Cota del primer nivel sobre PB', `MIN(${VI}R${rv(0)}:R${rv1})`, num('0.00'), 'm', 'zArriba', 'el nivel más bajo con cota mayor que la de PB');
  filaCa(rt + 2, 'Altura de la franja: (cota de arriba − zPB) / 2', `MAX(0,(E${rt + 1}-zPB)/2)`, num('0.000'), 'm');
  filaCa(rt + 3, 'Presión en PB (Kz con z = 5 m)', `(0.613*Kzt*Kd*Vbas^2*Imp*2.01*POWER(MAX(zPB,5)/zg,2/alfa)*Graf*Cpb-qh*Graf*Cps)/10000`, num('0.0000'), 't/m²');
  filaCa(rt + 4, 'W en PB = altura × B en PB × presión', `MAX(0,E${rt + 2}*B_PB*E${rt + 3})`, res('0.000'), 't', 'W_PB');
  filaCa(rt + 5, 'Brazo hasta la fundación: zPB − zFund', 'zPB-zFund', num('0.00'), 'm');
  ca.seccion(rt + 7, 'Vuelco y excentricidad (viento A, guía 2.2)', 17);
  filaCa(rt + 8, 'W total del viento A (tabiques + franja de PB)', `WA_suma+W_PB`, res('0.00'), 't', 'WA_total');
  filaCa(rt + 9, 'Mv: momento volcador en la fundación', `E${rc1}+W_PB*E${rt + 5}`, res('0.0'), 'tm', 'Mv', 'M del último nivel + W de PB por su brazo');
  filaCa(rt + 10, 'G: peso total del edificio', `K${rc1}`, res('0.0'), 't', 'G_total');
  filaCa(rt + 11, 'Me: momento estabilizante = G · b1 / 2', `G_total*lado_b1/2`, res('0.0'), 'tm', 'Me');
  filaCa(rt + 12, 'Coeficiente de seguridad al vuelco Me / Mv', `Me/Mv`, res('0.00'), '', 'vuelco');
  ca.f(7, rt + 12, VER(`E${rt + 12}>=1.5`), { papel: 'calc', centrar: true }); ca.put(8, rt + 12, '≥ 1,5', 'nota'); ca.verificaciones.push(`G${rt + 12}`);
  filaCa(rt + 13, 'e = Mv / G', `Mv/G_total`, res('0.000'), 'm', 'e_A');
  filaCa(rt + 14, "b1 / 6 (núcleo central)", `lado_b1/6`, num('0.000'), 'm', 'tercio_b1');
  ca.f(7, rt + 13, VER(`E${rt + 13}<=E${rt + 14}`), { papel: 'calc', centrar: true }); ca.put(8, rt + 13, "e ≤ b1/6: la resultante cae en el tercio medio", 'nota'); ca.verificaciones.push(`G${rt + 13}`);
  filaCa(rt + 15, 'Viento B: e = M en la fundación / G', `H${rc1}/G_total`, res('0.000'), 'm', 'e_B');
  filaCa(rt + 16, 'a1 / 6', `lado_a1/6`, num('0.000'), 'm', 'tercio_a1');
  ca.f(7, rt + 15, VER(`E${rt + 15}<=E${rt + 16}`), { papel: 'calc', centrar: true }); ca.verificaciones.push(`G${rt + 15}`);
  filaCa(rt + 17, 'Línea de presiones fuera del núcleo central (viento A)', `SUMPRODUCT((N${rcg(0)}:N${rc1}="ATENCIÓN")*1)`, num('0'), 'niveles', 'fueraA');
  filaCa(rt + 18, 'Línea de presiones fuera del núcleo central (viento B)', `SUMPRODUCT((Q${rcg(0)}:Q${rc1}="ATENCIÓN")*1)`, num('0'), 'niveles', 'fueraB');
  ca.seccion(rt + 20, 'Tensiones en el suelo bajo la platea (guía 2.3): σ = −N/(a1·b1) ± 6·Mv/(a1·b1²)', 17);
  filaCa(rt + 21, 'σ descargado = −G / (a1·b1)', `-G_total/(lado_a1*lado_b1)/10`, num('0.000'), 'kg/cm²', 'sD');
  filaCa(rt + 22, 'σ cargado = −G · qCarg/qDesc / (a1·b1)', `-G_total*qCarg/qDesc/(lado_a1*lado_b1)/10`, num('0.000'), 'kg/cm²', 'sC');
  filaCa(rt + 23, 'σ del momento = −6·Mv / (a1·b1²)', `-6*Mv/lado_a1/lado_b1^2/10`, num('0.000'), 'kg/cm²', 'sM');
  filaCa(rt + 24, 'σ máxima (cargado): compararla con la del estudio de suelos', `E${rt + 22}+E${rt + 23}`, res('0.000'), 'kg/cm²', 'sMax');
  filaCa(rt + 25, 'σ mínima (descargado): ≤ 0, sin tracción en el suelo', `E${rt + 21}-E${rt + 23}`, res('0.000'), 'kg/cm²', 'sMin');
  ca.f(7, rt + 25, VER(`E${rt + 25}<=0`), { papel: 'calc', centrar: true }); ca.verificaciones.push(`G${rt + 25}`);
  ca.graficos.push({ tipo: 'dispersion', titulo: 'Corte en altura', ejeX: 'Q (t)', ejeY: 'cota (m)',
    series: [{ nombre: 'viento A', x: `${hojaRef(HG.cargas)}$D$${rcg(0)}:$D$${rc1}`, y: `${hojaRef(HG.cargas)}$B$${rcg(0)}:$B$${rc1}`, color: 'C55A11' },
      { nombre: 'viento B', x: `${hojaRef(HG.cargas)}$G$${rcg(0)}:$G$${rc1}`, y: `${hojaRef(HG.cargas)}$B$${rcg(0)}:$B$${rc1}`, color: '548235', punteada: true }], desde: [19, 4], hasta: [27, 24] });
  ca.graficos.push({ tipo: 'dispersion', titulo: 'Momento en altura', ejeX: 'M (tm)', ejeY: 'cota (m)',
    series: [{ nombre: 'viento A', x: `${hojaRef(HG.cargas)}$E$${rcg(0)}:$E$${rc1}`, y: `${hojaRef(HG.cargas)}$B$${rcg(0)}:$B$${rc1}`, color: 'C55A11' },
      { nombre: 'viento B', x: `${hojaRef(HG.cargas)}$H$${rcg(0)}:$H$${rc1}`, y: `${hojaRef(HG.cargas)}$B$${rcg(0)}:$B$${rc1}`, color: '548235', punteada: true }], desde: [19, 25], hasta: [27, 45] });
  // momento en PB de cada viento (para la flexocompresión)
  filaCa(rt + 27, 'M en PB, viento A (para la flexocompresión)', 'SUMPRODUCT((c_cota=zPB)*c_MA)', res('0.0'), 'tm', 'MPB_A');
  filaCa(rt + 28, 'M en PB, viento B', 'SUMPRODUCT((c_cota=zPB)*c_MB)', res('0.0'), 'tm', 'MPB_B');

  // ============================================================================================ 4 Secciones
  const { bA, bB, tA, tB } = hojaSecciones(L, HG.secciones, 'Paso 4 · Secciones: el J de cada pieza (J propio + Steiner) y el eje de inercia', geo, d, clave);

  // ============================================================================================ 5 Rigidez
  const ri = L.hoja(HG.rigidez, [52, 13, 10, 13, 13, 50]);
  ri.encabezado('Paso 5 · Rigidez: J mínimo y flecha de la ménsula (guía 4.2)', 'J mínimo = W·h² / divisor (tabla de la cátedra, columna h/500): con ese J la azotea no se corre más de h/500. Flecha de la torre empotrada en la fundación, con la carga uniforme promedio: f = qv·h⁴ / (8·E·J) ≤ h / 500, qv = (carga arriba + carga abajo) / 2 por el ancho.', 6);
  ri.seccion(4, 'Tabla de divisores (h/500) y módulo E', 6);
  ri.cabecera(5, 1, ['Hormigón', 'Divisor h/500', 'Desde H']);
  DIVISORES.forEach(([h, , b], i) => { ri.put(1, 6 + i, h, 'textoB'); ri.put(2, 6 + i, b, coef('0')); ri.put(3, 6 + i, parseFloat(h.slice(1)), coef('0')); });
  const filaRi = (r: number, rot: string, form: string, e: Estilo, unidad: string, nombre?: string, nota?: string) => {
    ri.put(1, r, rot, 'textoB'); const ref = ri.f(2, r, form, e); ri.put(3, r, unidad, 'unidad'); if (nota) ri.put(6, r, nota, 'nota');
    if (nombre) { nombrar(nombre, ri, ref); clave(nombre, ri, ref); }
    return ref;
  };
  filaRi(11, 'Divisor del hormigón del proyecto', `IF(Hormigon>=C9,B9,IF(Hormigon>=C8,B8,IF(Hormigon>=C7,B7,B6)))`, num('0'), '', 'divisor', 'la fila del hormigón más alto que no supera al del proyecto');
  filaRi(12, 'E del hormigón = divisor · 500 / 8', `divisor*500/8`, num('0'), 't/m²', 'E_h', 'el que usa la planilla de la cátedra');
  ri.seccion(14, 'J mínimo (h/500)', 6);
  filaRi(15, 'Viento A: J mín = W · zTop² / divisor', `WA_suma*zTop^2/divisor`, res('0.00'), 'm⁴', 'JminA');
  filaRi(16, 'Σ J viento A (hoja 4)', `SJ_A`, num('0.00'), 'm⁴'); ri.f(4, 16, VER('B16>=B15'), { papel: 'calc', centrar: true }); ri.verificaciones.push('D16');
  filaRi(17, 'Viento B: J mín = W · zTop² / divisor', `WB_suma*zTop^2/divisor`, res('0.00'), 'm⁴', 'JminB');
  filaRi(18, 'Σ J viento B (hoja 4)', `SJ_B`, num('0.00'), 'm⁴'); ri.f(4, 18, VER('B18>=B17'), { papel: 'calc', centrar: true }); ri.verificaciones.push('D18');
  ri.seccion(20, 'Flecha de la ménsula', 6);
  ri.cabecera(21, 1, ['', 'Viento A', 'Unidad', 'Viento B']);
  const flRows: [string, string, string, string, Estilo][] = [
    ['Ancho que recibe el viento (en PB)', 'B_PB', 'm', 'L_PB', num('0.00')],
    ['Presión neta arriba (azotea)', `${VI}L${rv(0)}`, 't/m²', `${VI}L${rv(0)}`, num('0.0000')],
    ['Presión neta abajo (el nivel más bajo sobre el terreno)', 'SUMPRODUCT((v_cota=zMinTerreno)*v_p)', 't/m²', 'SUMPRODUCT((v_cota=zMinTerreno)*v_p)', num('0.0000')],
    ['qv máx = presión arriba × ancho', 'B23*B22', 't/m', 'D23*D22', num('0.0000')],
    ['qv mín = presión abajo × ancho', 'B24*B22', 't/m', 'D24*D22', num('0.0000')],
    ['qv = (qv máx + qv mín) / 2', '(B25+B26)/2', 't/m', '(D25+D26)/2', num('0.0000')],
    ['h hasta la fundación', 'h_total', 'm', 'h_total', num('0.00')],
    ['Σ J', 'SJ_A', 'm⁴', 'SJ_B', num('0.000')],
    ['f = qv · h⁴ / (8 · E · J)', 'B27*B28^4/(8*E_h*B29)', 'm', 'D27*D28^4/(8*E_h*D29)', res('0.0000')],
    ['h / 500', 'B28/500', 'm', 'D28/500', num('0.0000')],
  ];
  flRows.forEach(([rot, a, u, b, e], i) => { ri.put(1, 22 + i, rot, 'textoB'); ri.f(2, 22 + i, a, e); ri.put(3, 22 + i, u, 'unidad'); ri.f(4, 22 + i, b, e); });
  ri.put(1, 32, 'Control f ≤ h/500', 'textoB'); ri.f(2, 32, VER('B30<=B31'), { papel: 'calc', centrar: true }); ri.f(4, 32, VER('D30<=D31'), { papel: 'calc', centrar: true }); ri.verificaciones.push('B32', 'D32');
  clave('flechaA', ri, 'B30'); clave('flechaB', ri, 'D30');

  // ============================================================================================ 6 Rototraslación
  const ro = L.hoja(HG.roto, [12, 10, 10, 10, 12, 11, 11, 11, 9, 12, 3, 10, 10, 10, 10, 12]);
  ro.encabezado('Paso 6 · Rototraslación (Anexo de la guía y clase 5)', 'Wj = W · Jj / ΣJ  ±  W · e · Jj · aj / Σ Jjt · aj². W: viento sobre PB (hoja 2) · e: distancia del eje de simetría (x = 0) al eje de inercia · a: distancia de cada pieza al eje de inercia; los muros perpendiculares entran a la rotación con su J propio, a la distancia del eje de inercia del otro viento. El signo: + donde la rotación se suma a la traslación. M en PB de cada pieza = M en PB × su parte del corte.', 16);
  const RO = hojaRef(HG.roto);
  const rotoBloque = (dir: 'A' | 'B', r0: number) => {
    const A = dir === 'A', otro = A ? 'B' : 'A';
    ro.seccion(r0, `Viento ${dir}`, 16);
    const fila = (k: number, rot: string, form: string, e: Estilo, u: string, nombre: string) => { ro.put(1, r0 + k, rot, 'textoB'); ro.combinar(1, r0 + k, 3, r0 + k); const ref = ro.f(4, r0 + k, form, e); ro.put(5, r0 + k, u, 'unidad'); nombrar(nombre, ro, ref); clave(nombre, ro, ref); return ref; };
    fila(1, 'W sobre PB', `W${dir}_suma`, num('0.00'), 't', `Q_${dir}`);
    fila(2, `Xr: eje de inercia del viento ${dir} (hoja 4)`, `Xr_${dir}`, num('0.000'), 'm', `XrR_${dir}`);
    fila(3, `Sr: eje de inercia del viento ${otro}`, `Xr_${otro}`, num('0.000'), 'm', `Sr_${dir}`);
    fila(4, 'e = Xr (el viento actúa en el eje de simetría)', `XrR_${dir}`, num('0.000'), 'm', `eR_${dir}`);
    fila(5, 'Mt = W · e', `Q_${dir}*eR_${dir}`, res('0.0'), 'tm', `Mt_${dir}`);
    const ps = piezasDir(dir), f0 = r0 + 8, f1 = f0 + Math.max(ps.length, 1) - 1;
    ro.cabecera(r0 + 7, 1, ['Pieza', 'J (m⁴)', 't̄ (m)', 'a = t̄ − Xr (m)', 'J · a² (m⁶)', 'Traslación (t)', 'Rotación (t)', 'Q de la pieza (t)', '% del viento', 'M en PB (tm)']);
    const SE2 = hojaRef(HG.secciones);
    ps.forEach((pz, k) => {
      const r = f0 + k, rs = (dir === 'A' ? tA.f0 : tB.f0) + k;
      ro.f(1, r, `${SE2}A${rs}`, { papel: 'calc' });
      ro.f(2, r, `${SE2}E${rs}`, num('0.0000'));
      ro.f(3, r, `${SE2}D${rs}`, num('0.000'));
      ro.f(4, r, `C${r}-XrR_${dir}`, num('0.000'));
      ro.f(5, r, `B${r}*D${r}^2`, num('0.000'));
      ro.f(6, r, `IF(SJ_${dir}>0,Q_${dir}*B${r}/SJ_${dir},0)`, num('0.000'));
      ro.f(7, r, `IF(SJaa_${dir}>0,-Q_${dir}*eR_${dir}*B${r}*D${r}/SJaa_${dir},0)`, num('0.000'));
      ro.f(8, r, `F${r}+G${r}`, res('0.000'));
      ro.f(9, r, `IF(Q_${dir}>0,H${r}/Q_${dir},0)`, num('%'));
      ro.f(10, r, `MPB_${dir}*I${r}`, res('0.0'));
      clave(`tras_${dir}_${pz.nombre}`, ro, rc(6, r)); clave(`rot_${dir}_${pz.nombre}`, ro, rc(7, r)); clave(`Mp_${dir}_${pz.nombre}`, ro, rc(10, r));
    });
    ro.put(4, f1 + 1, 'Σ paralelas', 'textoB'); ro.f(5, f1 + 1, `SUM(E${f0}:E${f1})`, num('0.000')); ro.f(6, f1 + 1, `SUM(F${f0}:F${f1})`, num('0.00')); ro.f(7, f1 + 1, `SUM(G${f0}:G${f1})`, num('0.00')); ro.f(8, f1 + 1, `SUM(H${f0}:H${f1})`, num('0.00'));
    nombrar(`r${dir}_nombre`, ro, `A${f0}:A${f1}`); nombrar(`r${dir}_M`, ro, `J${f0}:J${f1}`);
    // perpendiculares: a la derecha
    ro.cabecera(r0 + 7, 12, ['Muro', `J propio en ${otro} (m⁴)`, `J propio en ${dir} (m⁴)`, '¿Perpendicular?', 'a = pos − Sr (m)', 'J · a² (m⁶)']);
    const q0 = f0, q1 = q0 + Math.max(R, 1) - 1;
    for (let k = 0; k < R; k++) {
      const r = q0 + k, m = (c: number) => `${D_}${rc(c, rM0 + k)}`;
      const hO = A ? m(6) : m(7), bO = A ? m(7) : m(6);
      ro.f(12, r, `${m(1)}`, { papel: 'calc' });
      ro.f(13, r, `IF(${A ? m(11) : m(10)}="",${bO}*${hO}^3/12,${A ? m(11) : m(10)})`, num('0.0000'));
      ro.f(14, r, `IF(${A ? m(10) : m(11)}="",${hO}*${bO}^3/12,${A ? m(10) : m(11)})`, num('0.0000'));
      ro.f(15, r, `IF(OR(${m(8)}=1,M${r}>N${r}),1,0)`, num('0'));
      ro.f(16, r, `${A ? m(5) : m(4)}-Sr_${dir}`, num('0.000'));
      ro.f(17, r, `O${r}*M${r}*P${r}^2`, num('0.000'));
    }
    ro.put(16, q1 + 1, 'Σ perp.', 'textoB'); ro.f(17, q1 + 1, `SUM(Q${q0}:Q${q1})`, num('0.000'));
    const fin = Math.max(f1, q1) + 3;
    ro.put(1, fin, 'Σ J·a² = paralelas + perpendiculares', 'textoB'); ro.combinar(1, fin, 3, fin);
    const ref = ro.f(4, fin, `E${f1 + 1}+Q${q1 + 1}`, res('0.0')); ro.put(5, fin, 'm⁶', 'unidad');
    nombrar(`SJaa_${dir}`, ro, ref); clave(`SJaa_${dir}`, ro, ref);
    ro.graficos.push({ tipo: 'barras', titulo: `Corte que toma cada pieza, viento ${dir}`, ejeX: 'pieza', ejeY: 't',
      series: [{ nombre: 'traslación', x: `${RO}$A$${f0}:$A$${f1}`, y: `${RO}$F$${f0}:$F$${f1}`, color: '2E75B6' }, { nombre: 'rotación', x: `${RO}$A$${f0}:$A$${f1}`, y: `${RO}$G$${f0}:$G$${f1}`, color: '7030A0' }],
      desde: [19, r0], hasta: [27, r0 + 18] });
    return Math.max(fin, r0 + 19);
  };
  ro.altos.set(1, 20);
  const finA = rotoBloque('A', 4); rotoBloque('B', finA + 3);
  ro.put(1, 3, 'Las columnas de la derecha (L a Q) son los muros perpendiculares: los rectángulos más rígidos en la otra dirección (y los tubos circulares).', 'nota');

  // ============================================================================================ 7 Flexocompresión
  const cabFl = ['Pieza', 'Muro', 'Papel', 'A (m²)', 'b (m)', 'h (m)', 'd (m)', 'Altura sobre PB (m)', 'Losas', 'Peso propio (t)', 'Losas descargado (t)', 'Losas cargado (t)', 'N descargado (t)', 'N cargado (t)', 'M de la pieza (tm)', 'J de la pieza (m⁴)', 'σ del momento (t/m²)', 'y1 (m)', 'y2 (m)', 'y fibra lejana (m)', 'y otra fibra (m)',
    'σ descargado, fibra lejana (t/m²)', 'σ descargado, otra (t/m²)', 'σ cargado, fibra lejana (t/m²)', 'σ cargado, otra (t/m²)', 'σ tracción máx (t/m²)', 'σ compresión máx (t/m²)', 'x traccionado (m)', 'T (t)', 'As (cm²)', 'As mín (cm²)', 'Tracción (kg/cm²)', 'Compresión (kg/cm²)', 'Control σ ≤ σbk',
    'Largo del tabique (m)', 'As por capa y metro (cm²/m)', 'Ø vertical (mm)', 's vertical (cm)', 'Barras por capa', 'Ø horizontal (mm)', 's horizontal (cm)', 'Barras horizontales'];
  const fl = L.hoja(HG.flexo, [8, 8, 7, ...Array(cabFl.length - 3).fill(10)]);
  fl.encabezado('Paso 7 · Flexocompresión en PB, muro por muro (guía 5)', 'σ = −N/F ± M/W: N = peso propio (A · altura · γ) + losas (área de influencia × q × losas); M = la parte del momento en PB que toma la pieza (hoja 6). Almas: flexión con la fibra más alejada del baricentro de la pieza; alas: «hacen un par», σ = M·d/J. Tracción con el edificio descargado (0,7 t/m²): T = σ·b·x/2 y As = T/σe, nunca menos que la mínima. Compresión con el edificio cargado (0,9 t/m²) y el viento al revés: |σ| ≤ σbk. Barras: dos capas; horizontal = 1/5 de la vertical.', 20);
  fl.fijar = { fila: 6, col: 3 };
  fl.put(1, 4, 'σbk del hormigón (kg/cm²)', 'textoB'); fl.combinar(1, 4, 4, 4); const sb = fl.f(5, 4, 'Hormigon*10', res('0')); nombrar('sigBk', fl, sb);
  fl.cabecera(5, 1, cabFl);
  const SE3 = hojaRef(HG.secciones);
  let rf = 6;
  const rangosPieza: { dir: 'A' | 'B'; nombre: string; r0: number; r1: number }[] = [];
  const phiForm = (x: string, phiMin: number) => `IF(${x}-1E-12<=6,6,IF(${x}-1E-12<=8,8,IF(${x}-1E-12<=10,10,IF(${x}-1E-12<=12,12,IF(${x}-1E-12<=16,16,IF(${x}-1E-12<=20,20,IF(${x}-1E-12<=25,25,32)))))))`.replace(/^/, `MAX(${phiMin},`) + ')';
  for (const dir of ['A', 'B'] as const) {
    fl.seccion(rf, `Viento ${dir}`, cabFl.length); rf++;
    const b = dir === 'A' ? bA : bB, pfx = dir === 'A' ? 'sA_' : 'sB_';
    for (const pz of piezasDir(dir)) {
      const r0 = rf;
      d.rects.forEach((x, k) => {
        if ((dir === 'A' ? x.piezaA : x.piezaB) !== pz.nombre) return;
        const r = rf++, s = b.f0 + k;
        fl.f(1, r, `${SE3}B${s}`, { papel: 'calc' }); fl.f(2, r, `${SE3}A${s}`, { papel: 'calc' }); fl.f(3, r, `${SE3}C${s}`, { papel: 'calc', centrar: true });
        fl.f(4, r, `${SE3}D${s}`, num('0.0000')); fl.f(5, r, `${SE3}E${s}`, num('0.000')); fl.f(6, r, `${SE3}F${s}`, num('0.000')); fl.f(7, r, `${SE3}K${s}`, num('0.000'));
        fl.f(8, r, `MAX(0,SUMPRODUCT((m_muro=B${r})*m_top)-zPB)*SUMPRODUCT((m_muro=B${r})*m_fac)`, num('0.00'));
        fl.f(9, r, `SUMPRODUCT((niv_cota>zPB+1E-9)*(niv_cota<=SUMPRODUCT((m_muro=B${r})*m_top)+1E-6)*niv_pisos)`, num('0'));
        fl.f(10, r, `D${r}*H${r}*gamaH`, num('0.00'));
        const parte = `SUMPRODUCT((m_muro=B${r})*m_inf)*D${r}/SUMPRODUCT((${pfx}muro=B${r})*(${pfx}pieza<>"")*${pfx}A)*I${r}`;
        fl.f(11, r, `qDesc*${parte}`, num('0.00')); fl.f(12, r, `qCarg*${parte}`, num('0.00'));
        fl.f(13, r, `J${r}+K${r}`, num('0.00')); fl.f(14, r, `J${r}+L${r}`, num('0.00'));
        fl.f(15, r, `ABS(SUMPRODUCT((r${dir}_nombre=A${r})*r${dir}_M))`, num('0.0'));
        fl.f(16, r, `SUMPRODUCT((p${dir}_nombre=A${r})*p${dir}_J)`, num('0.0000'));
        const ala = `C${r}="ala"`;
        fl.f(18, r, `IF(${ala},G${r},G${r}-F${r}/2)`, num('0.000')); fl.f(19, r, `IF(${ala},G${r},G${r}+F${r}/2)`, num('0.000'));
        fl.f(17, r, `IF(P${r}>0,O${r}*IF(${ala},ABS(G${r}),MAX(ABS(R${r}),ABS(S${r})))/P${r},0)`, num('0.00'));
        fl.f(20, r, `IF(ABS(R${r})>=ABS(S${r})-1E-9,R${r},S${r})`, num('0.000')); fl.f(21, r, `IF(ABS(R${r})>=ABS(S${r})-1E-9,S${r},R${r})`, num('0.000'));
        const sg = `IF(T${r}<0,-1,1)`, fm = (y: string) => `IF(P${r}>0,O${r}*${sg}*${y}/P${r},0)`;
        fl.f(22, r, `IF(${ala},-M${r}/D${r}+Q${r},-M${r}/D${r}+${fm(`T${r}`)})`, num('0.00'));
        fl.f(23, r, `IF(${ala},-M${r}/D${r}-Q${r},-M${r}/D${r}+${fm(`U${r}`)})`, num('0.00'));
        fl.f(24, r, `IF(${ala},-N${r}/D${r}+Q${r},-N${r}/D${r}+${fm(`T${r}`)})`, num('0.00'));
        fl.f(25, r, `IF(${ala},-N${r}/D${r}-Q${r},-N${r}/D${r}+${fm(`U${r}`)})`, num('0.00'));
        fl.f(26, r, `MAX(V${r},W${r})`, num('0.00'));
        fl.f(27, r, `MIN(X${r},Y${r},-N${r}/D${r}-Q${r})`, num('0.00'));
        const sO = `IF(V${r}=Z${r},W${r},V${r})`;
        fl.f(28, r, `IF(Z${r}>0,IF(${ala},F${r},IF(${sO}>=0,F${r},F${r}*Z${r}/(Z${r}-${sO}))),0)`, num('0.000'));
        fl.f(29, r, `IF(Z${r}>0,IF(${ala},Z${r}*D${r},IF(${sO}>=0,(Z${r}+${sO})/2*D${r},Z${r}*IF(C${r}="tubo",D${r}/F${r},E${r})*AB${r}/2)),0)`, num('0.00'));
        fl.f(30, r, `AC${r}*1000/sigmaE`, num('0.00')); fl.f(31, r, `cuantMin*D${r}*10000`, num('0.00'));
        fl.f(32, r, `Z${r}/10`, res('0.00')); fl.f(33, r, `AA${r}/10`, res('0.00'));
        fl.f(34, r, VER(`ABS(MIN(0,AG${r}))<=sigBk`), { papel: 'calc', centrar: true });
        fl.f(35, r, `MAX(E${r},F${r})`, num('0.00'));
        fl.f(36, r, `IF(AI${r}>0,MAX(AD${r},AE${r})/2/AI${r},0)`, num('0.00'));
        fl.f(37, r, `IF(AJ${r}>0,${phiForm(`SQRT(40*AJ${r}/PI())`, 8)},8)`, num('0'));
        fl.f(38, r, `IF(AJ${r}>0,MIN(20,INT(PI()*AK${r}^2/400/AJ${r}*100*2)/2),20)`, num('0.0'));
        fl.f(39, r, `MAX(2,ROUND(AI${r}*100/AL${r},0))`, num('0'));
        fl.f(40, r, `IF(AJ${r}>0,${phiForm(`SQRT(40*AJ${r}/5/PI())`, 6)},6)`, num('0'));
        fl.f(41, r, `IF(AJ${r}>0,MIN(25,INT(PI()*AN${r}^2/400/(AJ${r}/5)*100*2)/2),25)`, num('0.0'));
        fl.f(42, r, `MAX(2,ROUND(AI${r}*100/AO${r},0))`, num('0'));
        const kf = `${dir}_${pz.nombre}_${x.muro}_${k}`;
        clave(`tr_${kf}`, fl, rc(32, r)); clave(`co_${kf}`, fl, rc(33, r)); clave(`As_${kf}`, fl, rc(30, r)); clave(`phiV_${kf}`, fl, rc(37, r)); clave(`sV_${kf}`, fl, rc(38, r)); clave(`phiH_${kf}`, fl, rc(40, r)); clave(`sH_${kf}`, fl, rc(41, r));
      });
      if (rf > r0) rangosPieza.push({ dir, nombre: pz.nombre, r0, r1: rf - 1 });
    }
    rf++;
  }
  fl.verificaciones.push(`AH6:AH${rf}`);

  // ============================================================================================ Resumen
  const re = L.hoja(HG.resumen, [16, 50, 13, 10, 16, 40]);
  re.encabezado('Resumen de los controles', 'Cada valor viene de su hoja. VERIFICA en verde, NO VERIFICA en rojo, ATENCIÓN en naranja (hay que mirarlo: armadura, presiones fuera del núcleo central).', 6);
  re.cabecera(4, 1, ['Paso', 'Control', 'Valor', 'Unidad', 'Estado', 'Criterio']);
  const RI = hojaRef(HG.rigidez), FL = hojaRef(HG.flexo), DI = hojaRef(HG.diseno);
  const ctrl: [string, string, string, string, string, string, Estilo['fmt']][] = [
    ['1 Diseño', 'Esbeltez λ, viento A', `${DI}B11`, '', `IF(${DI}B11>=5,"ATENCIÓN","INFORMATIVO")`, 'más de 5: puede haber vuelco', '0.00'],
    ['1 Diseño', 'Esbeltez λ, viento B', `${DI}B12`, '', `IF(${DI}B12>=5,"ATENCIÓN","INFORMATIVO")`, '', '0.00'],
    ['3 Cargas', 'Vuelco Me / Mv', 'vuelco', '', VER('vuelco>=1.5'), '≥ 1,5', '0.00'],
    ['3 Cargas', 'Excentricidad e = Mv / G, viento A', 'e_A', 'm', VER('e_A<=tercio_b1'), "≤ b1/6", '0.000'],
    ['3 Cargas', 'Excentricidad, viento B', 'e_B', 'm', VER('e_B<=tercio_a1'), '≤ a1/6', '0.000'],
    ['3 Cargas', 'Tensión mínima en el suelo', 'sMin', 'kg/cm²', VER('sMin<=0'), '≤ 0 (sin tracción)', '0.000'],
    ['3 Cargas', 'Tensión máxima en el suelo', 'sMax', 'kg/cm²', '"INFORMATIVO"', 'compararla con la admisible del estudio de suelos', '0.000'],
    ['3 Cargas', 'Línea de presiones fuera del núcleo central, viento A', 'fueraA', 'niveles', 'IF(fueraA=0,"VERIFICA","ATENCIÓN")', 'en cada nivel |e| ≤ L/6', '0'],
    ['3 Cargas', 'Línea de presiones fuera del núcleo central, viento B', 'fueraB', 'niveles', 'IF(fueraB=0,"VERIFICA","ATENCIÓN")', 'en cada nivel |e| ≤ B/6', '0'],
    ['5 Rigidez', 'Σ J viento A ≥ J mínimo', 'SJ_A', 'm⁴', VER('SJ_A>=JminA'), 'J mín (h/500)', '0.00'],
    ['5 Rigidez', 'Σ J viento B ≥ J mínimo', 'SJ_B', 'm⁴', VER('SJ_B>=JminB'), 'J mín (h/500)', '0.00'],
    ['5 Rigidez', 'Flecha de la ménsula, viento A', `${RI}B30`, 'm', VER(`${RI}B30<=${RI}B31`), '≤ h/500', '0.0000'],
    ['5 Rigidez', 'Flecha de la ménsula, viento B', `${RI}D30`, 'm', VER(`${RI}D30<=${RI}D31`), '≤ h/500', '0.0000'],
  ];
  let rr2 = 5;
  for (const [paso, nom, val, u, est, crit, fmt] of ctrl) {
    re.put(1, rr2, paso, 'texto'); re.put(2, rr2, nom, 'textoB'); re.f(3, rr2, val, res(fmt)); re.put(4, rr2, u, 'unidad'); re.f(5, rr2, est, { papel: 'calc', centrar: true }); re.put(6, rr2, crit, 'nota'); rr2++;
  }
  for (const g of rangosPieza) {
    const rg = `${g.r0}:${g.r1}`.split(':');
    re.put(1, rr2, `7 Flexo ${g.dir}`, 'texto'); re.put(2, rr2, `${g.nombre}: tracción máx (descargado)`, 'textoB');
    re.f(3, rr2, `MAX(${FL}AF${rg[0]}:AF${rg[1]})`, res('0.00')); re.put(4, rr2, 'kg/cm²', 'unidad');
    re.f(5, rr2, `IF(C${rr2}>0,"ATENCIÓN","VERIFICA")`, { papel: 'calc', centrar: true }); re.put(6, rr2, 'con tracción lleva armadura (hoja 7)', 'nota'); rr2++;
    re.put(1, rr2, `7 Flexo ${g.dir}`, 'texto'); re.put(2, rr2, `${g.nombre}: compresión máx (cargado)`, 'textoB');
    re.f(3, rr2, `MIN(${FL}AG${rg[0]}:AG${rg[1]})`, res('0.00')); re.put(4, rr2, 'kg/cm²', 'unidad');
    re.f(5, rr2, VER(`ABS(MIN(0,C${rr2}))<=sigBk`), { papel: 'calc', centrar: true }); re.put(6, rr2, '|σ| ≤ σbk', 'nota'); rr2++;
  }
  re.verificaciones.push(`E5:E${rr2}`);

  // tablas del proyecto (ocultas) para volver a abrirlo en la app
  if (p) for (const t of tablasProyecto(p)) {
    const h = L.hoja(t.nombre, t.anchos); h.oculta = true;
    t.filas.forEach((f, i) => f.forEach((x, j) => { if (x !== null && x !== '') h.put(j + 1, i + 1, x, 'vacio'); }));
  }
  // Léame primero, después Datos y los pasos en orden
  const orden = [HG.leame, HG.datos, HG.diseno, HG.viento, HG.cargas, HG.secciones, HG.rigidez, HG.roto, HG.flexo, HG.resumen];
  L.hojas.sort((a, b) => (orden.indexOf(a.nombre) + 1 || 99) - (orden.indexOf(b.nombre) + 1 || 99));
  return { libro: L, claves };
}

