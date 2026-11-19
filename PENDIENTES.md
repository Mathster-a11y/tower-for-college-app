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

## Rama «nuevo-motor» (noviembre 2026)
- [x] Dos motores con un botón (barra del centro, «Motor»): «Actual» (planilla anterior) y «Planilla 2025» (EDIFICIO_TORRE_1 de la cátedra, sin cambios: `src/assets/planilla_catedra_2025.xlsx`). Verificado celda por celda con LibreOffice: 3166 de 3166 celdas con fórmula iguales en 5 torres (tools/verificar_motor_nuevo.ts + tools/comparar_motor_nuevo.py)
- [x] Botón «Cambiar a método planilla»: armado de piezas con el método simplificado de la cátedra (especificación, sección 7)
- [x] Valores «Guía/CIRSOC» apagados por defecto (se siguen pudiendo elegir)
- [x] Exportar: planilla 2025 o anterior, y contenido virgen (solo datos + tablas T3D) o renovada (con hojas «G ·» y dibujos)
- [x] Planilla 2025: «Flex comp PB paralelos» desde la fila 10 lee área y módulo de otra fila de la hoja J que la que lee Rototrasl. (B10 = O14 pero J10 → AY10). Decisión: se deja así (la app lo reproduce y avisa en cada pieza)
- [x] Ejemplo de EDIFICIO_TORRE_1: B22:B54 de M,NyQ escritos a mano y corridos una fila respecto de «viento». Confirmado: error del ejemplo; al exportar se vuelve a poner el vínculo con «viento»
- [x] Agregar filas de piezas a la planilla 2025 sin cambiar sus relaciones (más de 20 piezas por viento): las filas van al final de cada bloque (J paralelos desde la 32, J ortogonales desde la 24, los dos bloques de cada Rototrasl. y Flex desde la 24), con las fórmulas del bloque; las sumas que terminan en la última fila se estiran y todo lo de abajo se corre como con «Insertar filas» de Excel (fórmulas de todas las hojas, comentarios, dibujos). Verificado con LibreOffice: torre de 44 piezas por viento, 5374 de 5374 celdas iguales. Las hojas «G ·» siguen mostrando las primeras 20 piezas
- [x] Modo de cálculo «En vivo» / «Con botón» (F9). Con botón, los cambios se guardan sin calcular; el cálculo, el 3D y los diagramas esperan a «Calcular». El 3D ya no se dibuja 60 veces por segundo: con la app quieta, el procesador pasó de ~2,8 s a ~0,1 s cada 5 s
- [x] Zoom en los funiculares (viento y J) con detalle: trazos, puntos, flechas y letras de tamaño fijo en la pantalla; aparecen las letras que no entraban; los rótulos acompañan a su elemento y se separan si se encima
- [x] Revisión de bugs: barrido automático de 12 proyectos × 4 combinaciones de motor y método × todas las etapas, subpasos, vientos y valores; arreglados el gráfico de rigidez sin muros (NaN), la importación de la planilla 2025 (vínculos de la rototraslación), el ala inferior colgada del alma correcta en el armado de la app y dos detalles del modo con botón

## Revisión del TP Cueto/Heredia 2025 y de la rototraslación (noviembre 2026)
- [x] Comparado el TP con la app: M,NyQ, vuelco, tensiones, ΣJ, J mín y Flex dan igual que su planilla (la anterior). Diferencias: errores de carga del TP (1 % fijo en la traslación, momento 0 en Flex, núcleo en filas de asimétricas, núcleo dibujado ≠ calculado)
- [x] Planilla anterior: «Rototrasl. cara menor»!B51 = SUM(B28:B38) e I51 = SUM(I28:I38) cortan en la fila 38 (L51, M51 y la 2025 llegan a la 50). Las piezas 9 a 20 del viento A no cuentan para el CR del viento B. La app sigue dando los números de la planilla, pero dibuja el CR real (también en 3D), calcula aparte la rototraslación corregida (`rotBReal`) y avisa en el panel cuánto cambia la rotación
- [x] Orden de filas: primero las piezas de más J en las filas «seguras» (planilla anterior: 1 a 8, que cuentan para el CR del viento B y suman peso propio en Flex; planilla 2025: 1 a 6, donde Flex lee la misma pieza). Se priorizó el CR sobre el módulo que lee Flex (decisión del usuario): una asimétrica en las filas 1 a 7 hace que la Flex de la planilla lea el módulo simétrico (la app avisa y la calcula bien en «Guía/CIRSOC»)
- [x] Aviso por pieza cuando cae en las filas de Flex con D = 0,01 fijo (D13:D20: la planilla no suma su peso propio)
- [x] Parapeto (Viento → «Parapeto»): se suma al medio entrepiso de la azotea en M,NyQ D; el importador lo recupera de la planilla
- [x] Rototraslación: los rótulos ya no se enciman con los de los ejes (caja con el ancho real del texto)
- [x] Vista previa de la planilla (Exportar → «Vista previa de la planilla ↗», o desde el diálogo de exportar): otra pestaña con las 7 hojas de la cátedra como quedan al exportar, colores, anchos y celdas combinadas, y las fórmulas calculadas con un evaluador propio (src/xlsx/formulas.ts). Se actualiza sola cuando cambia la torre en la pestaña principal. Verificado con LibreOffice: todas las celdas con fórmula iguales en 20 planillas (10 torres × 2 planillas, ~80.000 celdas; tools/verificar_vista_previa.ts + tools/comparar_vista_previa.py)
- [x] Planilla anterior: M,NyQ G55:G57 apuntan a otro libro ([1]viento!S56, la planilla 2024) con la copia vacía; Excel y LibreOffice dan 0 (son subsuelos: no cambia nada)
- [x] Planilla 2025 → versión de 49 columnas (la EDIFICIO_TORRE_1 que pasó el usuario en noviembre 2026): en «J Tabiques ortogonales» se borraron las columnas vacías AA y AD (el J total pasa de AY a AW y Rototraslación lo lee de ahí). Fuera de eso las fórmulas son las mismas; el ejemplo había pisado 37 fórmulas de M,NyQ (E y F de las filas 40–57, D de los subsuelos) con números, y en la plantilla se devolvieron. La app escribe en ortogonales con las columnas corridas (COLUMNA_ORTO_49), los vínculos de filas agregadas van a AW y el importador reconoce las dos versiones. Verificado con LibreOffice (motor y vista previa, todas las celdas)
- [x] Hoja «Elementos especiales» (oblicuos, curvos, calados con corte, piezas especiales): sección real, geometría, W real y control del J del rectángulo equivalente de la hoja J (diferencia 1e-8)
- [x] Hoja «Flexocompresión PB» con la estética de la cátedra (título azul, encabezados en mayúsculas, 20 filas numeradas por viento, amarillo claro = fórmula, blanco = completar, naranja/verde/celeste/lila = tipo de pieza, negativos en rojo) y **sin ningún número calculado por la app**: superficie, altura de la pieza y eje neutro de las hojas J (según el tipo), J y % de Rototrasl., altura/niveles/área de influencia de «Flex comp PB paralelos», M de M,NyQ (fila de PB). La app escribe solo el tipo de cada pieza y la carga de las piezas del viento B (la cátedra no tiene dónde). Coeficientes abajo en amarillo (γ 2,4; g 0,7; q 0,9; σadm = σbk; σe 2400; cuantía 0,8 %). Verificada con LibreOffice en 22 planillas (todas las fórmulas iguales) y contra la app en los tabiques sueltos. La vista previa ahora muestra los negativos con signo y en rojo, como Excel
- [ ] Planilla de la cátedra (las dos versiones): en Rototrasl., O = G + N suma un momento (G, tm) y una fuerza (N = Mt·J·a/ΣJ·a², t), y «Flex comp PB paralelos» toma O como el momento de la pieza. La rotación casi no suma momento: en el Anexo de la guía, T1 y T3 quedan 46 % abajo y T2 y T4 31 % arriba. La hoja «Flexocompresión (guía)» usa (E + N)/D5 × M en PB. Pregunta para la cátedra

## En curso
- **Plan de métodos y planillas** (`docs/plan_metodos.html` y `.pdf`): cuatro métodos (Planilla virgen, Guía, CIRSOC, FEM) y Combinado, un Excel por método, bibliografía revisada (CIRSOC 101-25, 102-25, 401, EC7-3, guía 2024). Listo para la etapa 1 (reorganizar sin cambiar números). Falta el PDF del CIRSOC 201-2005 para la etapa 4.
- **Etapa 0 (informe técnico de Gaspar):** [x] hallazgo 1 — los nombres del proyecto ya no llegan como HTML (rótulos del 3D, datos de la pieza en la planta, encabezados de tablas, diálogos con esc() completo). Reproducido antes (8 nombres ejecutaban código) y verificado después en Chrome; prueba `test/sinHtmlDeDatos.test.ts` que frena cualquier HTML nuevo sin revisar. [x] hallazgo 2 — lector único (`src/engine/lector.ts`) para el guardado del navegador, .json, Excel (T3D), Sheets, «Mis proyectos» y la vista previa: valida tipos y medidas, repara referencias rotas con aviso y, si el proyecto está dañado, no se activa (el abierto queda igual; al arrancar, el texto dañado se guarda aparte). Resultados con revisión: si el cálculo falla o está pendiente no se exporta. Aviso con descarga si el navegador no deja guardar o no hay lugar para la copia automática. Verificado en Chrome con los tres casos del informe · [x] hallazgo 4 — service worker generado en el build (`scripts/sw.mjs` + plugin en `vite.config.ts`) con la lista completa de archivos (incluidos los módulos del PDF y del PowerPoint); caché «torre3d:<carpeta>:<versión>» que al actualizarse borra solo sus versiones viejas; aviso «Lista para usar sin conexión». Verificado en Chrome con perfil limpio en una subcarpeta (como GitHub Pages): abre sin red, actualiza y conserva las cachés de otros sitios; prueba `test/sw.test.ts`. **Etapa 0 terminada** (hallazgos 3 y 7 dependen de las preguntas 11 y 12)
- **Etapa 1 (hecha, sin cambiar números):** el método va dentro del proyecto (`calculo`: método, versión de la planilla, armado y versión de las fórmulas), validado por el lector y guardado también en «T3D Proyecto»; un solo selector «Método» (Planilla · Guía · CIRSOC, FEM y Combinado marcados como próximos) con «versión» (solo Planilla) y «armado» (Planilla y Guía); `src/engine/metodos/tipos.ts`; el cálculo recibe la configuración del proyecto (no del navegador) y exportar ya no cambia la configuración global mientras arma el archivo (hallazgo 5: el caso del informe, 129,55 / 125,81 t, queda fijado en `test/metodos.test.ts`); el resultado trae `valores` del método y las vistas dejan de elegir por su cuenta; resumen «Verifican los N calculados · M a revisar», con los informativos aparte y el método en el globo, informes y láminas (hallazgo 6). Migración: el proyecto guardado en el navegador toma la preferencia vieja (motor y método); un archivo sin método abre con la configuración de siempre y avisa; «Nuevo proyecto» arranca con armado de la cátedra. Pendiente: separar el motor en carpetas por capa cuando llegue la primera capa nueva (CIRSOC, etapa 3)

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
- [x] Rototraslación, bloque «USAR SOLAMENTE PARA DOS TABIQUES» (filas 28–29): resuelto (usuario, noviembre 2026). Se usa cuando dos muros perpendiculares al viento están cerca uno del otro: trabajan juntos y se oponen mejor a la rotación; va en vez del bloque general. En la app se eligen a mano en Rototraslación («Dos tabiques perpendiculares»); la planilla toma B28/B29 (J), H28/H29 (posición), brazos desde el punto medio (J28), y al exportar B31:B50 de esa hoja van en 0 (son vínculos: única fórmula que se reemplaza, con aviso en el diálogo). Verificado con LibreOffice (dos planillas, par en los dos vientos)
- [ ] Planilla anterior: ¿B51 e I51 de «Rototrasl. cara menor» deberían sumar hasta la fila 50, como L51, M51 y la planilla 2025? (hoy cortan en la 38)
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


## Muros curvos y herramientas de dibujo (hecho)
- «Muro curvo» en Colocar → Caminos: se traza el camino (rectas, arcos tangentes o por 3 puntos, Bézier) y al terminar
  queda un muro (perfil) del espesor elegido, con justificación muro a la izquierda / eje / muro a la derecha. Los arcos
  tangentes quedan exactos; un arco que llega en esquina se parte en tramos de 3°. Camino cerrado → anillo con hueco.
- «Forma»: rectángulo, círculo, polígono regular y elipse con dos toques → perfil lleno, muro anillo o camino.
- Editor de contorno: coordenadas x/y del vértice, empalme (radio) y chaflán, largo/ángulo/radio de un lado, dividir un
  lado, desfasar hacia afuera/adentro, simetría, girar y escalar el contorno, cambiar el contorno por una forma, huecos
  con forma, Shift = de a 15°, Ctrl+Z / Ctrl+Y.
