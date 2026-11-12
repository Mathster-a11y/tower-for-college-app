# Torre 3D: lista de trabajo

Se tacha cada ítem cuando está hecho, probado y subido.

## Hecho
- [x] Motor que reproduce la planilla original (probado contra el ejemplo 20-10-26)
- [x] Escritura de la planilla virgen (solo celdas de datos y hoja T3D), verificada con LibreOffice
- [x] Planta SVG, vista 3D, paneles de datos, resultados y verificaciones
- [x] Archivo único `descargar/torre3d.html` (sin internet ni servidor)
- [x] Pestaña Ayuda, deshacer y rehacer, mensajes de error, prueba con 300 proyectos al azar
- [x] **Piezas asimétricas.** Las piezas en C, U, L, T y E van en las columnas asimétricas, un muro por columna (ala sup., alma izq., alma der., ala inf.). Solo usan la plantilla simétrica el muro suelto y la doble T con alas iguales y centradas.
  Filas: cualquier fila libre, empezando por las 10 y 11 de «paralelos». Donde la planilla lee otro módulo, la app calcula la flexocompresión con el módulo correcto y avisa.
- [x] **Verificación funicular.** Pestaña «Funicular»: suma gráfica de W y G (guía 2.2) con el polígono de fuerzas y el tercio medio de la base, y la línea de presiones piso a piso contra el núcleo central. Para los vientos A y B.
- [x] Flexocompresión «Guía/CIRSOC» con el módulo de cada pieza, su área real y su peso propio

- [x] **Niveles y Muros como Excel.** Grilla con selección, escribir encima, arrastrar el cuadradito para copiar o seguir la serie, Ctrl+C / Ctrl+V desde Excel, Supr, Ctrl+D, insertar y borrar filas
- [x] **Importar desde Excel.** Tabla de la app (hojas Niveles y Muros, con botón para descargarla de plantilla), líneas exportadas de AutoCAD (x1, y1, x2, y2, con unidad, capa y centrado) y la planilla del curso ya llena (niveles, viento, fundación y piezas de las hojas J; el ΣJ de cada dirección coincide con la planilla)

- [x] **Diagramas** (pestaña «Diagramas»): presión del viento y fuerza por piso en altura; corte V y momento M; rototraslación en planta (eje de inercia, resultante, traslación y rotación de cada pieza); rigidez (ΣJ contra J mínimo, deformada contra h/500, reparto de J); funicular

- [x] **Verificación de tabiques y columnas como la guía** (sección 5), muro por muro.
  - Ng y Nq de cada muro con su peso propio, su área de influencia y sus losas.
  - Almas a flexocompresión; alas con el par.
  - Armadura por tracción (triángulo de tracción) y cuantía mínima.
  - Compresión contra la tensión admisible.
  - Probado con los números del ejemplo: T1 y las alas de T5.
- [x] **Diagrama de flexocompresión** por pieza (tensiones de cada muro, descargado y cargado)
- [x] **Tubos rectangulares y circulares** como elementos (los rectangulares en las columnas asimétricas, con el J exacto de la caja)
- [x] **Verificación funicular gráfica**: polígono de fuerzas con polo y rayos, polígono funicular en el alzado (da hw), W + G y tercio medio, línea de presiones
- [x] **Plantas por piso**: «Desde» y «Hasta» de cada muro, planta de cada nivel, 3D por tramos, ΣJ por nivel en la deformada
- [x] **Funicular de los J como en la clase 5**: J de izquierda a derecha, rayos y lados numerados, primer y último lado prolongados hasta R, resultante que sube al CR
- [x] **Rototraslación en 3D**: cada piso se traslada δ(z) y gira θ(z) = −δ·e·ΣJ/ΣJt·a² alrededor del CR (exagerado, con torre sin deformar en trazos, animación y capa «Deformada» en la axonometría)

- [x] **Consistencia matemática.** Pruebas cruzadas entre módulos (J de la hoja = J del dibujo, flexocompresión = hoja Flex con los mismos datos, ΣQ, ΣM, funicular = M,NyQ). Corregido el solape alma–ala en el J y el J mínimo según el hormigón.
- [x] **Interfaz con el sistema de diseño de la app Truss.**
  - Etapas 01–07 con su color.
  - Fórmulas con números y celda de la planilla.
  - Tablero oscuro y aspecto clásico.
  - Selector único de valores (Planilla / Guía/CIRSOC).
- [x] **Rototraslación en planta, paso a paso** (clase 5):
  - El J de cada tabique como vector sobre el tabique; polígono de los J, polo, rayos y funicular hasta el eje de inercia y el CR.
  - Traslación, rotación y rototraslación con flechas en la recta de cada tabique: grosor según J y largo según la fuerza.
- [x] Segundo ejemplo: el Anexo de la guía (T5 aislado, la planta rota)

- [x] **Rotación «Guía/CIRSOC» muro por muro, como la guía.** Cada muro perpendicular entra con su J propio. La usan el momento de cada pieza, Flexión, el panel y el dibujo.
- [x] **Revisión de todos los diagramas.**
  - Sentido de giro, Mt y flechas de los perpendiculares corregidos.
  - Paso 4 con la flecha total.
  - Compresión con el viento al revés en almas corridas del baricentro.
  - Eje de inercia y CR en la planta según los valores elegidos.

## En curso
- Nada por ahora.
- Nada por ahora: el próximo es el primero de la lista de abajo.

## Próximos
- [x] Silueta de cada piso: editarla en la planta (vértices) o importarla de AutoCAD (DXF, polilínea con arcos); se ve en la planta y en las losas del 3D. La planilla sigue leyendo B y L (botón «Usar la caja como B y L»)
- [x] Dibujar los muros con el mouse en la planta (clic en el inicio y clic en el fin, encadenados), con imán a los extremos y al eje de otros muros
- [x] Armar las piezas solas: los muros que se tocan forman una pieza (T1 / T1B) y el ala sabe a qué alma está pegada (botón «Armar piezas» y al dibujar)
- [x] Calcar un plano: imagen de fondo en la planta, con escala por dos puntos, posición y opacidad (un PDF se exporta antes como imagen)
- [x] Dibujo del perfil equivalente de cada pieza tal como queda en la hoja J, al lado de sus muros en planta (Diseño → Piezas)
- [x] Informe imprimible (PDF) con datos, cartas de los dos vientos, rototraslación y controles (Exportar ▾)
- [x] Publicar la app con link (GitHub Pages)
- [x] Importar plano (DXF con capas, PDF, imagen), imán a los nodos y mover elementos desde sus nodos
- [x] Importar corte (DXF): las losas proponen los niveles y sus cotas
- [x] Contornos: carpintería del nivel editable como la silueta, con a máx × b máx (B y L siguen manuales)
- [x] Mover con precisión: nodo de referencia, llevar a x, y o correr dx, dy
- [x] Piezas tipo editables: doble clic abre las medidas (alma, ala sup. e inf. por separado) con J en vivo
- [x] Áreas de influencia de la losa (botón «Áreas» en la planta) y copiarlas a «Área inf.» de los muros
- [ ] Exoesqueletos (diagrid, tubo arriostrado, megapórtico, torre inclinada): propuesta 5b, esperando qué tipos van primero

## Esperando a la cátedra
- [ ] Filas de las piezas 8 y 9 de «J Tabiques paralelos»: faltan fórmulas en la planilla virgen
- [ ] «Flex comp PB paralelos» D13:D20 = 0,01 fijo: las piezas 10 a 17 no suman su peso propio
- [ ] Edificios flexibles (F < 1 Hz): ¿Gf o 0,85?
- [ ] Torsión de la Fig. 9 del CIRSOC 102
- [ ] Área de la pieza (columna O de las hojas J): no suma el ala inferior AH · AI del molde asimétrico
- [ ] Flexocompresión: la planilla combina Ng con la compresión y Nq con la tracción (el caso más desfavorable es al revés)
- [ ] Flexocompresión: la planilla verifica la pieza entera (N total / área total); la guía separa almas y alas, cada una con su N. ¿Cuál se usa en la entrega?
- [ ] Guía, Anexo de rototraslación: con las posiciones que da (T1–T4 a ±10 m, T5 a −6 m, T6 a +4,14 m) el eje de inercia queda a 1,77 m, no a 0,37 m. Con e = 0,37 m la rotación no se anula: entre todos los tabiques toman 990 de 1000. Con e = 1,77 m los porcentajes son T1 14,25 %, T2 7,09 %, T5 8,94 % y T6 48,38 % (la guía da 10,77, 9,34, 7,32 y 51,37).
- [ ] Rotación: la guía suma en ΣJt·a² cada muro perpendicular con su J propio (las alas de T6, 2,083 m⁴ a ±1,90 m). La planilla toma la pieza perpendicular entera en su baricentro, y una U en el eje no aporta nada.
- [ ] Guía, T1: el largo traccionado x del triángulo de tracción figura como 78 cm (y 1,05 m en el esquema); con σ = +137,78 / −788 t/m² sale x = 4,50 · 137,78 / 925,8 = 0,67 m
- [ ] Áreas de influencia: la app reparte la losa por cercanía (cada punto va al elemento más cercano, la «mitad de la luz»). En el ejemplo de la guía (20 × 16 m = 320 m²) eso da 50,6 m² a cada ala de los núcleos, 22,4 a las T1–T4 y 14,0 a las almas; la guía carga 30,4, 10,5 y 17,2 (suman 198 m², no 320). ¿Qué criterio usa la cátedra: líneas a 45°, fajas, o una parte de la losa va a columnas que no están en el modelo?

## Próximos pasos (propuesta, noviembre 2026)

### Para la entrega
- [x] Lámina de entrega A3 apaisada para imprimir (Exportar ▾): una hoja por viento con ficha, vuelco, lámina M-N-Q, verificaciones y rótulo
- [x] Prueba de punta a punta: torre con una C de la biblioteca y la pieza de la cátedra (alas intermedias, más de dos almas), escrita y recalculada en LibreOffice: 91 de 91 celdas iguales (tools/escribir_prueba.ts y tools/comparar_libreoffice.py)
- [ ] Elegir la carta principal (A, B, C, D o una combinación)
- [x] Viento en PB: criterio C (mixto) elegido — la franja expuesta de PB (0 a medio entrepiso, Kz de 5 m) entra en la carga total, el vuelco y el suelo, pero no en el corte de los tabiques
- [x] Desglose por hoja en PDF y PowerPoint: temas de cada hoja y cálculo analítico paso por paso al lado del Excel, con los controles verificados con los dos (Exportar ▾). Falta: revisar la matemática de «Flex comp PB paralelos»

### Para armar la torre más rápido
- [x] Biblioteca de piezas tipo para insertar con medidas: tabique, L, T, C, U, doble T, núcleo (tubo), columna, con su J a la vista (planta → «Insertar pieza…»)
- [x] Importar muros desde DXF (no solo líneas en CSV), con capas
- [x] Calcar un PDF directamente (sin exportarlo antes como imagen)
- [x] Planta con zoom: rueda, pellizcar con dos dedos, arrastrar el fondo y botones + − ⤢
- [ ] Vista en corte (alzado) para editar «desde» y «hasta» de cada muro arrastrando

### Para entender (didáctica)
- [x] Recorrido guiado para la primera vez (Mostrar ▾ → Recorrido guiado)
- [x] Comparar una versión guardada con la actual (Mis proyectos → ⇄): ΣJ, e, Mt y cada control
- [ ] Rototraslación animada también en la planta (no solo en el 3D)
- [ ] «Qué pasa si…»: deslizadores para largo y posición de un muro con el resultado en vivo

### Para el uso diario
- [x] Mis proyectos: versiones guardadas en el navegador (y copia automática antes de abrir otro)
- [x] Exportar los dibujos (cartas, diagramas, funiculares, perfiles) como SVG o PNG: botones «⤓ SVG · ⤓ PNG» arriba de cada dibujo
- [ ] Carga más rápida al abrir (separar el 3D y la planilla del resto)

### Pendientes de la cátedra (preguntas abiertas, arriba)
- [ ] Criterio de alas intermedias y de piezas con más de dos almas en el molde
- [ ] Torsión de la Fig. 9, edificios flexibles (Gf), criterios de flexocompresión
