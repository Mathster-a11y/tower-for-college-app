/**
 * La explicación de cada método para la guía impresa: qué es, con qué reglas calcula, cómo se lee su cadena de
 * cuentas, cómo se sabe si verifica y en qué se diferencia de los otros. Una guía por método (planilla virgen, guía,
 * CIRSOC, FEM y el flujo de viento), no una guía general.
 */
export interface TextoMetodo {
  titulo: string;
  subtitulo: string;
  /** párrafos */
  que: string[];
  /** la cadena de cuentas, en orden */
  cadena: string[];
  verifica: string[];
  diferencias: string[];
}

export const TEXTOS_METODO: Record<'Planilla' | 'Guía' | 'CIRSOC' | 'FEM' | 'Flujo', TextoMetodo> = {
  Planilla: {
    titulo: 'Método de la planilla virgen',
    subtitulo: 'La planilla «Edificios en torre» de la cátedra, celda por celda (CIRSOC 102-2005, tensiones admisibles)',
    que: [
      'Es la planilla tal cual la entrega la cátedra: siete hojas (viento, M,NyQ, J paralelos, J ortogonales, las dos rototraslaciones y la flexocompresión en PB) que la app replica celda por celda y verifica contra LibreOffice. No se cambia nada: donde la planilla simplifica, esta guía lo explica pero no lo corrige.',
      'La torre es una ménsula empotrada en la fundación. El viento se calcula nivel por nivel con el CIRSOC 102-2005 (procedimiento analítico), se acumula en corte y momento hacia abajo, y se reparte entre las piezas según su rigidez J. Cada pieza se verifica en PB con tensiones admisibles: σ = −N/F ± M/W.',
    ],
    cadena: [
      '1 · Viento (hojas «viento» y «M,NyQ»): Kz con la altura real, qz = 0,613·Kz·Kzt·Kd·V²·I, presión neta = barlovento − sotavento, fuerza de cada nivel W = D·B·p, corte Q y momento M acumulados.',
      '2 · Vuelco y suelo (M,NyQ, filas 61 a 99): peso con 0,7 t/m², Me = P·b1/2, Me/Mv ≥ 1,5, excentricidad e = Mv/P ≤ b1/6 y tensiones en el suelo.',
      '3 · Rigidez (hojas J): cada pieza se lleva a un molde (rectángulo, T, doble T, U) y su J sale de la fórmula del molde; ΣJ ≥ J mínimo de la tabla (flecha h/500).',
      '4 · Rototraslación: eje de inercia Xr = ΣJ·x/ΣJ, momento de rotación Mt = Q·Xr y el reparto: C = J/ΣJ para la traslación, N = −Mt·J·a/ΣJa² para la rotación, y el momento de la pieza O = C·Mv + N.',
      '5 · Flexocompresión en PB (viento A): carga de la pieza con 0,7 y con 0,9 t/m², σ = (−N/F ∓ M/W)·0,1 en kg/cm², contra σbk.',
    ],
    verifica: [
      'Vuelco: Me/Mv ≥ 1,5. Excentricidad: e ≤ b1/6 (toda la base apoyada).',
      'Rigidez: ΣJ ≥ J mínimo de la tabla para el hormigón elegido.',
      'Tensiones: la compresión |σc| ≤ σbk (10 × el número del hormigón, en kg/cm²); si el borde traccionado da positivo, la pieza lleva armadura.',
      'La presión en el suelo no se compara en la planilla: se compara a mano con la del estudio de suelos.',
    ],
    diferencias: [
      'Contra la guía: Kz con la altura real también debajo de 5 m (la guía usa 5 m), viento también en la franja de PB, J del molde (la guía suma muro por muro con Steiner), y la rototraslación suma la rotación (en t) al momento (en tm). Con la planta simétrica las diferencias son de 0,1 %.',
      'En la flexocompresión la planilla combina la compresión con la carga de 0,7 t/m² y la tracción con la de 0,9; la guía hace al revés, que es lo más desfavorable.',
    ],
  },
  'Guía': {
    titulo: 'Método de la guía (analítico)',
    subtitulo: 'El procedimiento de la guía «Edificio en torre» 2024, paso a paso (CIRSOC 102-2005, tensiones admisibles)',
    que: [
      'Es el mismo camino que la planilla pero hecho a mano, como lo enseña la guía de la cátedra: con la sección real de cada pieza, cada muro verificado por separado (almas y alas), el armado en barras y los controles que la planilla no tiene (esbeltez, flecha, suelo, dinteles).',
      'Todas las cuentas salen del motor «calcularGuiaPasos», el mismo que arma el Excel «Planilla de la guía»: el libro y la app dan lo mismo.',
    ],
    cadena: [
      '1 · Viento (guía 2.1): Kz con z ≥ 5 m, presión dinámica, presión neta en cada nivel, fuerza W = p·B·D, corte y momento en PB; el momento de vuelco llega a la fundación.',
      '2 · Vuelco y suelo (guía 2.2 y 3): peso con qD, Me = P·b1/2 ≥ 1,5·Mv, e ≤ b1/6, σmáx = σN + σM ≤ σadm del suelo.',
      '3 · Rigidez y flecha (guía 4.1 y 4.2): J de cada pieza con Steiner (Σ J propio + A·d²), ΣJ ≥ J mínimo y flecha de la ménsula f = qv·H⁴/(8·E·ΣJ) ≤ H/500.',
      '4 · Reparto entre piezas (rototraslación de la guía): Xr, Mt = Q·Xr, rigidez a la rotación con los muros perpendiculares, traslación Q·J/ΣJ y rotación −Mt·J·a/ΣJa²; el momento de la pieza es M_PB por su parte del viento.',
      '5 · Tensiones y armadura (guía 5): carga del muro sin y con sobrecarga, σM = M·y/J, σt = −ND/A + σM (tracción), σc = −NC/A − σM (compresión), T = σt·b·x/2 y As = T/σe, con la mínima.',
    ],
    verifica: [
      'Vuelco ≥ 1,5; excentricidad ≤ b1/6; presión en el suelo ≤ σadm.',
      'ΣJ ≥ J mínimo y flecha ≤ H/500.',
      'Compresión |σc| ≤ σbk en cada muro; la tracción no se verifica: se arma (As = T/σe, no menos que la mínima).',
    ],
    diferencias: [
      'Contra la planilla: J real, unidades de la rotación corregidas (M = M_PB · Q_pieza / Q), cada muro con su fibra, y la combinación más desfavorable (tracción con la carga chica, compresión con la grande).',
      'Contra el CIRSOC: mismo viento de la cátedra (102-2005, G = 0,85) y tensiones admisibles con cargas de servicio, en lugar del viento del 102-25 y la resistencia del 201 con cargas mayoradas.',
    ],
  },
  CIRSOC: {
    titulo: 'Método CIRSOC',
    subtitulo: 'La planilla con el reparto analítico de la guía, con los reglamentos vigentes: CIRSOC 102-25, 101-25 y 201-2005',
    que: [
      'Usa el motor de la planilla y el reparto analítico de la guía (J real, rototraslación muro por muro), pero con las cargas y la verificación de los reglamentos vigentes: el viento de resistencia del 102-25 (velocidad por categoría de riesgo, frecuencia y factor de ráfaga), los cuatro casos de carga, las combinaciones del 101-25 y la resistencia del 201 (estados límite, no tensiones admisibles).',
    ],
    cadena: [
      '1 · Viento 102-25: Ke por la altitud, Kh con 2,41 y la exposición, qh, la frecuencia n1 (1.9-5) y con ella G (rígida) o Gf (flexible, 1.9-10); presión neta, fuerza por nivel, corte y momento en PB, carga mínima y torsor del caso 2.',
      '2 · Vuelco 101-25: Mv en la fundación y 0,9·Me ≥ Mv (la combinación 0,9 D + 1,0 W).',
      '3 · Reparto: la parte de cada pieza para los cuatro casos (el 2 corre el viento 0,15 B; el 4 suma la torsión del otro viento) y el momento de la pieza.',
      '4 · Resistencia 201: para cada muro, todas las combinaciones mayoradas × casos; el modelo simple de dos cordones (T y C de la cupla), la compresión que aguanta el cordón y la cuantía que pide el diagrama de interacción.',
    ],
    verifica: [
      'Vuelco: 0,9·Me/Mv ≥ 1 (equivale a Me/Mv ≥ 1,11).',
      'Cada muro: la compresión del cordón C ≤ 0,65·0,85·f′c·Acordón (si no, la toma la armadura) y la cuantía necesaria ρ ≤ 4 % con todas las combinaciones dentro de φ·(Mn, Pn).',
      'Carga mínima del viento (0,75 kN/m²) y deriva de servicio (en la etapa Rigidez).',
    ],
    diferencias: [
      'El viento es unas 3 veces el de la guía: más velocidad (mapa nuevo), exposición con 2,41, ráfaga Gf de una torre flexible y viento de resistencia (con 1,0 en las combinaciones, no 1,6 sobre uno de servicio).',
      'La verificación compara cuantías de armadura, no tensiones: con cargas mayoradas, la pieza tiene que quedar adentro de su diagrama de interacción.',
    ],
  },
  FEM: {
    titulo: 'Método FEM',
    subtitulo: 'Cómo funcionan las ecuaciones del modelo: matrices de rigidez, losa rígida, ensamble, vibración y K·u = F',
    que: [
      'La torre se arma como lo hacen los programas de edificios en su versión más simple (pseudo-3D): cada pieza es una ménsula vertical empotrada en PB (viga de Timoshenko, con la deformación por corte de sus almas, o de Euler) y cada losa es un diafragma rígido con tres movimientos: ux, uy y el giro θ.',
      'El modelo no reparte el viento con una fórmula: lo resuelve. Arma la matriz de rigidez de la torre, busca cómo vibra (la frecuencia n1, que el 102-25 usa para la ráfaga), aplica las fuerzas de cada caso y resuelve K·u = F. De los corrimientos salen las fuerzas de cada pieza. La verificación del hormigón es la del método CIRSOC con esas fuerzas.',
    ],
    cadena: [
      '1 · Matriz de una pieza: EI, GAv, Φ = 12·EI/(GAv·L²), la matriz 4×4 de cada tramo y la ménsula condensada a sus pisos: Kp = Kww − Kwφ·Kφφ⁻¹·Kφw.',
      '2 · Losa rígida y ensamble: el corrimiento de una pieza sale de la losa (dp = uy + x·θ); cada pieza suma Tᵀ·Kp·T a la matriz de la torre (3 incógnitas por piso).',
      '3 · Vibración: masas de las losas (m y J0 = m·(B² + L²)/12), K·φ = ω²·M·φ (Jacobi), n1 = ω/2π y la masa que mueve el modo.',
      '4 · Cargas y K·u = F: el vector F con las fuerzas del 102-25 (y los torsores de los casos 2 y 4), la solución por Gauss, el corrimiento y el giro de la azotea, la deriva de servicio.',
      '5 · Fuerzas de cada pieza: dp = T·u, fp = Kp·dp, el corte V = Σf, el momento M = Σf·z y la parte del viento V/Q, comparada con la de la rototraslación.',
    ],
    verifica: [
      'La frecuencia decide si la torre es rígida (n1 ≥ 1 Hz) o flexible (Gf).',
      'Deriva de servicio del borde más corrido ≤ h/500.',
      'Con los M y V de cada pieza del modelo, el hormigón se verifica como en el método CIRSOC (201).',
    ],
    diferencias: [
      'La frecuencia del modelo suele ser mayor que la de la fórmula aproximada (que es un límite inferior): menos amplificación dinámica, menos viento.',
      'El reparto cambia: la rototraslación reparte solo por J (flexión), el modelo suma la deformación por corte de las almas y el acople de las losas piso por piso; las piezas cortas y anchas (U, núcleos) toman menos y los tabiques largos y finos, más.',
    ],
  },
  Flujo: {
    titulo: 'Flujo de viento (túnel 2D y 3D)',
    subtitulo: 'Lattice Boltzmann: el aire alrededor de la torre, y lo que se mide',
    que: [
      'No es un método de cálculo de la torre: es una simulación del aire para ver y medir lo que el reglamento resume en coeficientes (presión de cada cara) y algo que no trae: el desprendimiento de remolinos.',
    ],
    cadena: [
      '1 · La red: viscosidad ν = U0·D/Re, tiempo de relajación τ = 3ν + ½, Mach de la red, el equilibrio de cada dirección y el choque BGK.',
      '2 · Lo que se mide: Cp de cada cara, Cd, el Strouhal St, la frecuencia de los remolinos y la velocidad crítica Vcr = n1·B/St.',
    ],
    verifica: ['τ > 0,5 (red estable), Ma ≤ 0,3 (aire incompresible) y Vcr > V de diseño (si no, puede haber resonancia de costado).'],
    diferencias: ['Confirma la forma de las presiones del reglamento; la velocidad crítica es un dato para discutir, no para dimensionar.'],
  },
};
