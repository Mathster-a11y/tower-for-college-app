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

## En curso
- Nada por ahora: el próximo es el primero de la lista de abajo.

## Próximos
- [ ] Diagrama de flexocompresión por pieza (tensiones N/A ± M/W, descargada y cargada)
- [ ] Dibujar los muros con el mouse en la planta (clic en el inicio y clic en el fin), con imán a los extremos de otros muros
- [ ] Armar las piezas solas: los muros que se tocan forman una pieza y el ala sabe a qué alma está pegada
- [ ] Calcar un plano: poner una imagen o un PDF de fondo en la planta, con escala
- [ ] Dibujo del perfil equivalente de cada pieza tal como queda en la hoja J, para controlarlo
- [ ] Informe imprimible (PDF) con datos, resultados y verificaciones
- [ ] Publicar la app con link (GitHub Pages o Netlify)

## Esperando a la cátedra
- [ ] Filas de las piezas 8 y 9 de «J Tabiques paralelos»: faltan fórmulas en la planilla virgen
- [ ] «Flex comp PB paralelos» D13:D20 = 0,01 fijo: las piezas 10 a 17 no suman su peso propio
- [ ] Edificios flexibles (F < 1 Hz): ¿Gf o 0,85?
- [ ] Torsión de la Fig. 9 del CIRSOC 102
- [ ] Área de la pieza (columna O de las hojas J): no suma el ala inferior AH · AI del molde asimétrico
- [ ] Flexocompresión: la planilla combina Ng con la compresión y Nq con la tracción (el caso más desfavorable es al revés)
