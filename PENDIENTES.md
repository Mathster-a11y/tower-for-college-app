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
- [ ] Silueta de cada piso: editarla o importarla de CAD (contornos con segmentos y arcos de círculo)
- [x] Dibujar los muros con el mouse en la planta (clic en el inicio y clic en el fin, encadenados), con imán a los extremos y al eje de otros muros
- [x] Armar las piezas solas: los muros que se tocan forman una pieza (T1 / T1B) y el ala sabe a qué alma está pegada (botón «Armar piezas» y al dibujar)
- [x] Calcar un plano: imagen de fondo en la planta, con escala por dos puntos, posición y opacidad (un PDF se exporta antes como imagen)
- [ ] Dibujo del perfil equivalente de cada pieza tal como queda en la hoja J, para controlarlo
- [x] Informe imprimible (PDF) con datos, cartas de los dos vientos, rototraslación y controles (Exportar ▾)
- [ ] Publicar la app con link: el workflow ya compila y prueba; falta activar Settings → Pages → Source «GitHub Actions» en el repositorio (lo hace el dueño)

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
